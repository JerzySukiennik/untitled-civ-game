// Economy: treasury credit, pop cap recompute, house citizen auto-spawn, food upkeep +
// starvation, farm slot production, granary bonus, node depletion (walkability + announce +
// gatherer retarget). Runs once per tick before units step.
const C = require('../shared/constants.js');
const BUILDINGS = require('../shared/data-buildings.js');
const snapshot = require('./snapshot.js');

const D = snapshot.DIRTY;
const FARM_RATE = 0.8;            // food/s per worked farm
const GRANARY_BONUS = 0.05;       // +5% food rate per granary, max 2 counted
const STARVE_HP_FRAC = 0.2;

function credit(game, side, res, amt) {
  if (amt <= 0) return;
  game.res[side][res] += amt;
  game.resDirty[side] = true;
}

function canAfford(r, cost) {
  return r.f >= cost.f && r.w >= cost.w && r.s >= cost.s && r.g >= cost.g;
}

function pay(game, side, cost) {
  const r = game.res[side];
  if (!canAfford(r, cost)) return false;
  r.f -= cost.f; r.w -= cost.w; r.s -= cost.s; r.g -= cost.g;
  game.resDirty[side] = true;
  return true;
}

function refund(game, side, cost) {
  const r = game.res[side];
  r.f += cost.f; r.w += cost.w; r.s += cost.s; r.g += cost.g;
  game.resDirty[side] = true;
}

// Full gather-rate multiplier for a resource: completed wonder (+25% all), granaries (food only,
// max 2) and the side's civ/tech rate mods (woodRate/foodRate/stoneRate/goldRate).
function resRateMult(game, side, res) {
  let granaries = 0, wonder = false;
  for (const b of game.entities.values()) {
    if (b.kind !== C.KIND.BUILDING || b.side !== side || b.progress < 1) continue;
    if (b.type === 'granary' && granaries < 2) granaries++;
    else if (b.type === 'wonder') wonder = true;
  }
  let m = wonder ? 1.25 : 1;
  const mods = game.mods[side];
  if (res === 'f') { m *= (1 + granaries * GRANARY_BONUS); m = C.stat(m, mods, 'foodRate'); }
  else if (res === 'w') m = C.stat(m, mods, 'woodRate');
  else if (res === 's') m = C.stat(m, mods, 'stoneRate');
  else if (res === 'g') m = C.stat(m, mods, 'goldRate');
  return m;
}

function recomputePopCap(game, side) {
  const modmap = game.mods[side];
  let cap = 0, houses = 0;
  for (const b of game.entities.values()) {
    if (b.kind !== C.KIND.BUILDING || b.side !== side || b.progress < 1) continue;
    if (b.type === 'tc') cap += 10;
    else if (b.type === 'house') houses++;
    else if (b.type === 'temple') cap += 10;
  }
  cap += houses * C.stat(C.POP_CAP_HOUSE, modmap, 'houseCapAdd');   // pop1 +2/house
  cap = Math.round(C.stat(cap, modmap, 'popCapAdd'));               // pop4 +25 flat
  cap = Math.min(cap, C.POP_CAP_DISPLAY_MAX);
  if (game.pop[side].cap !== cap) { game.pop[side].cap = cap; game.popDirty[side] = true; }
}

// ---- node depletion ----

function depleteNode(game, node) {
  if (node.amt > 0) return;
  node.amt = 0;
  game.grid.clearNode(node.tx, node.ty);
  game.nodesById.delete(node.id);
  game.pending.ev.push({ e: 'node_depleted', id: node.id, tx: node.tx, ty: node.ty });
  // Gatherers targeting this node retarget on their next arrival/gather step (units.js checks
  // node existence), so no direct sweep is needed here.
}

// ---- per-tick ----

function step(game, dt) {
  for (let side = 0; side < 2; side++) {
    if (side === C.SIDE.BOTS && game.mode === C.MODE.INTRO) continue;
    stepFarms(game, side, dt);
    stepSpawn(game, side, dt);
    stepUpkeep(game, side, dt);
  }
}

function stepFarms(game, side, dt) {
  const mult = resRateMult(game, side, 'f');
  let total = 0;
  for (const b of game.entities.values()) {
    if (b.kind !== C.KIND.BUILDING || b.side !== side || b.type !== 'farm' || b.progress < 1) continue;
    if (!b.workerId) continue;
    const w = game.entities.get(b.workerId);
    if (!w || w.state !== C.ST.GATHER || !w.job || w.job.type !== 'farm' || w.job.id !== b.id) {
      if (!w) b.workerId = 0;
      continue;
    }
    total += FARM_RATE * mult * dt;
  }
  if (total > 0) credit(game, side, 'f', total);
}

function stepSpawn(game, side, dt) {
  const st = game.eco[side];
  if (st.starving) { st.spawnT = 0; return; }
  st.spawnT += dt;
  // pop2/steppe spawnInterval x0.8 shortens the citizen spawn cadence.
  if (st.spawnT < C.stat(C.CITIZEN_SPAWN_S, game.mods[side], 'spawnInterval')) return;
  st.spawnT = 0;
  const pop = game.pop[side];
  if (pop.cur >= pop.cap) return;
  if (game.res[side].f < C.CITIZEN_SPAWN_FOOD) return;
  // Random completed house.
  const houses = [];
  for (const b of game.entities.values()) {
    if (b.kind === C.KIND.BUILDING && b.side === side && b.type === 'house' && b.progress >= 1) houses.push(b);
  }
  if (!houses.length) return;
  const h = houses[(Math.random() * houses.length) | 0];
  const spot = game.pathfinder.approach(h.x, h.y, h.tx, h.ty, h.foot[0], h.foot[1]);
  if (!spot) return;
  game.res[side].f -= C.CITIZEN_SPAWN_FOOD;
  game.resDirty[side] = true;
  game.createUnit('worker', side, spot.x + 0.5, spot.y + 0.5);
}

function stepUpkeep(game, side, dt) {
  const st = game.eco[side];
  st.upkeepT += dt;
  if (st.upkeepT < C.UPKEEP_INTERVAL_S) return;
  st.upkeepT = 0;
  let units = 0;
  for (const e of game.entities.values()) if (e.kind === C.KIND.UNIT && e.side === side) units++;
  if (units > 0) {
    const due = Math.ceil(units * 0.2);
    game.res[side].f = Math.max(0, game.res[side].f - due);
    game.resDirty[side] = true;
  }
  const starving = game.res[side].f <= 0 && units > 0;
  if (starving) {
    if (!st.starving) st.starving = true;
    // Random unit loses 20% of maxhp every upkeep interval while starving.
    let pick = null, seen = 0;
    for (const e of game.entities.values()) {
      if (e.kind !== C.KIND.UNIT || e.side !== side) continue;
      if (Math.random() < 1 / ++seen) pick = e;
    }
    if (pick) {
      pick.hp -= pick.maxhp * STARVE_HP_FRAC;
      pick.dirty |= D.HP;
      if (side === C.SIDE.PLAYERS) game.pending.ev.push({ e: 'starve' });
      if (pick.hp <= 0) game.killUnit(pick);
    }
  } else if (st.starving && game.res[side].f > 0) {
    st.starving = false;
  }
}

module.exports = {
  step, credit, pay, refund, canAfford, recomputePopCap, depleteNode, resRateMult
};
