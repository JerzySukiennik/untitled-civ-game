// Buildings: placement (construction sites; roads instant), worker construction with sqrt(n)
// stacking (cap 4), demolish, production queues (TC worker, Cart Depot cart, military later)
// with rally points, market trade exchange (100 -> 75). Runs after units each tick.
const C = require('../shared/constants.js');
const BUILDINGS = require('../shared/data-buildings.js');
const UNITS = require('../shared/data-units.js');
const TECHS = require('../shared/data-techs.js');
const ERAS = require('../shared/data-eras.js');
const economy = require('./economy.js');
const units = require('./units.js');
const mods = require('./mods.js');
const snapshot = require('./snapshot.js');

const D = snapshot.DIRTY;
const BUILDER_CAP = 4;
const QUEUE_MAX = 5;
const CART_PER_DEPOT = 4;
// Techs whose completion must retro-scale existing HP, and those that change pop cap.
const HP_TECH = new Set(['con1', 'con2', 'con4', 'mil3']);
const POP_TECH = new Set(['pop1', 'pop4']);

// ---- placement ----

function place(game, side, type, tx, ty) {
  const def = BUILDINGS[type];
  if (!def) return 'unknown building';
  if (def.era > game.era[side]) return 'requires era ' + def.era;
  const [fw, fh] = def.foot;
  if (!game.grid.canPlace(tx, ty, fw, fh)) return 'invalid location';
  if (type === 'lumber' && !game.grid.hasTerrainNear(tx, ty, [C.TERRAIN.FOREST], 4))
    return 'lumber camp must be near forest';
  if (type === 'quarry' && !game.grid.hasTerrainNear(tx, ty, [C.TERRAIN.MOUNTAIN, C.TERRAIN.GOLD], 4))
    return 'mining camp must be near mountain/gold';
  // Modified cost (con3 buildingCost / con4 wonderCost).
  if (!economy.pay(game, side, mods.buildCost(game.mods[side], type, def))) return 'not enough resources';

  if (def.instant) {
    // Road: paid -> exists, walkable, no entity footprint stamp.
    const e = game.createBuilding(type, side, tx, ty, true);
    game.pending.ev.push({ e: 'built', id: e.id });
    return null;
  }
  const e = game.createBuilding(type, side, tx, ty, false);
  return null;
}

function demolish(game, side, id) {
  const b = game.entities.get(id);
  if (!b || b.kind !== C.KIND.BUILDING || b.side !== side) return 'invalid target';
  game.killBuilding(b);
  return null;
}

// ---- construction: workers in BUILD state adjacent to a site advance it ----

function stepConstruction(game, dt) {
  // Count builders per site (scratch map reused).
  const counts = game._builderCounts;
  counts.clear();
  for (const e of game.entities.values()) {
    if (e.kind !== C.KIND.UNIT || e.state !== C.ST.BUILD || !e.job || e.job.type !== 'build') continue;
    counts.set(e.job.id, (counts.get(e.job.id) || 0) + 1);
  }
  for (const [siteId, n] of counts) {
    const site = game.entities.get(siteId);
    if (!site || site.progress >= 1) continue;
    const def = BUILDINGS[site.type];
    // workers-equivalent, scaled by con3/townsfolk build speed.
    const rate = C.stat(Math.sqrt(Math.min(n, BUILDER_CAP)), game.mods[site.side], 'buildSpeed');
    site.progress = Math.min(1, site.progress + (rate * dt) / def.buildTime);
    site.hp = Math.max(1, site.progress * site.maxhp);
    site.dirty |= D.PROG | D.HP;
    if (site.progress >= 1) completeSite(game, site);
  }
}

function completeSite(game, site) {
  site.hp = site.maxhp;
  site.state = C.ST.IDLE;
  site.dirty |= D.ST;
  game.pending.ev.push({ e: 'built', id: site.id });
  economy.recomputePopCap(game, site.side);
  // Builders of this site go idle.
  for (const e of game.entities.values()) {
    if (e.kind === C.KIND.UNIT && e.job && e.job.type === 'build' && e.job.id === site.id) {
      e.job = null;
      if (e.state === C.ST.BUILD) units.setState(e, C.ST.IDLE);
    }
  }
}

// ---- production queues ----

function train(game, side, buildingId, unitType) {
  const b = game.entities.get(buildingId);
  const udef = UNITS[unitType];
  if (!b || b.kind !== C.KIND.BUILDING || b.side !== side) return 'invalid building';
  if (b.progress < 1) return 'still under construction';
  if (!udef || udef.source !== b.type) return 'cannot train that here';
  if (udef.era > game.era[side]) return 'requires era ' + udef.era;
  if (b.type === 'tc' && game.eraP[side]) return 'town center busy researching era';
  if (b.queue.length >= QUEUE_MAX) return 'queue full';
  if (game.pop[side].cur >= Math.min(game.pop[side].cap, C.UNIT_CAP_SIDE)) return 'population cap reached';
  if (unitType === 'cart' && cartCount(game, b) >= CART_PER_DEPOT) return 'max 4 carts per depot';
  if (!economy.pay(game, side, udef.cost)) return 'not enough resources';
  let t = udef.train;
  if (game.mode === C.MODE.CREATIVE) t *= 0.25;
  // Artisans: military train time in eras 1-2 x1.25.
  if (mods.MILITARY.has(unitType) && game.era[side] <= 2) t = C.stat(t, game.mods[side], 'earlyTrainTime');
  b.queue.push({ unit: unitType, left: t });
  b.dirty |= D.EXTRA;
  return null;
}

function cancelQueue(game, side, buildingId, index) {
  const b = game.entities.get(buildingId);
  if (!b || b.kind !== C.KIND.BUILDING || b.side !== side || !b.queue[index]) return 'invalid queue item';
  const item = b.queue.splice(index, 1)[0];
  economy.refund(game, side, UNITS[item.unit].cost);
  b.dirty |= D.EXTRA;
  return null;
}

function setRally(game, side, buildingId, tx, ty) {
  const b = game.entities.get(buildingId);
  if (!b || b.kind !== C.KIND.BUILDING || b.side !== side) return 'invalid building';
  b.rally = { tx, ty };
  return null;
}

function cartCount(game, depot) {
  let n = 0;
  for (const e of game.entities.values()) {
    if (e.kind === C.KIND.UNIT && e.type === 'cart' && e.homeId === depot.id) n++;
  }
  return n;
}

function stepQueues(game, dt) {
  for (const b of game.entities.values()) {
    if (b.kind !== C.KIND.BUILDING || !b.queue || !b.queue.length || b.progress < 1) continue;
    if (b.type === 'tc' && game.eraP[b.side]) continue;   // TC queue blocked during era research
    const item = b.queue[0];
    item.left -= dt;
    if (item.left > 0) continue;
    if (game.pop[b.side].cur >= Math.min(game.pop[b.side].cap, C.UNIT_CAP_SIDE)) continue; // wait for room
    const spot = game.pathfinder.approach(b.x, b.y, b.tx, b.ty, b.foot[0], b.foot[1]);
    if (!spot) continue;                                  // fully walled in: wait
    b.queue.shift();
    b.dirty |= D.EXTRA;
    const u = game.createUnit(item.unit, b.side, spot.x + 0.5, spot.y + 0.5);
    if (u.type === 'cart') { u.homeId = b.id; u.leg = 0; }
    if (b.rally) units.orderMove(game, u, b.rally.tx, b.rally.ty);
  }
}

// ---- market trade exchange: give 100 of one resource, get 75 of another ----

function trade(game, side, give, get) {
  if (C.RES_KEYS.indexOf(give) === -1 || C.RES_KEYS.indexOf(get) === -1 || give === get)
    return 'invalid trade';
  let hasMarket = false;
  for (const b of game.entities.values()) {
    if (b.kind === C.KIND.BUILDING && b.side === side && b.type === 'market' && b.progress >= 1) {
      hasMarket = true; break;
    }
  }
  if (!hasMarket) return 'requires a completed market';
  if (game.res[side][give] < 100) return 'not enough resources';
  game.res[side][give] -= 100;
  game.res[side][get] += Math.round(C.stat(75, game.mods[side], 'tradeRate')); // eco4/townsfolk
  game.resDirty[side] = true;
  return null;
}

// ---- era research (at Town Center, §4.3) ----

function hasCompleted(game, side, type) {
  for (const b of game.entities.values()) {
    if (b.kind === C.KIND.BUILDING && b.side === side && b.type === type && b.progress >= 1) return true;
  }
  return false;
}

// First unmet building requirement for an era def, or null if all satisfied.
function missingEraReq(game, side, def) {
  if (!def.requires || !def.requires.buildings) return null;
  const need = def.requires.buildings, have = {};
  for (const b of game.entities.values()) {
    if (b.kind === C.KIND.BUILDING && b.side === side && b.progress >= 1) have[b.type] = (have[b.type] || 0) + 1;
  }
  for (const t in need) if ((have[t] || 0) < need[t]) return need[t] + ' ' + BUILDINGS[t].name;
  return null;
}

function scaleCost(cost, m) {
  if (m === 1) return cost;
  return { f: Math.round(cost.f * m), w: Math.round(cost.w * m), s: Math.round(cost.s * m), g: Math.round(cost.g * m) };
}

// Start research of the next era. opts.costMult lets the bot pay a difficulty-scaled era cost.
function advanceEra(game, side, opts) {
  if (game.era[side] >= 5) return 'already at max era';
  if (game.eraP[side]) return 'era research already in progress';
  if (!hasCompleted(game, side, 'tc')) return 'requires a town center';
  const def = ERAS[game.era[side]];                 // next era: ERAS[cur].n === cur+1
  const miss = missingEraReq(game, side, def);
  if (miss) return 'requires ' + miss;
  const cost = scaleCost(def.cost, (opts && opts.costMult) || 1);
  if (!economy.pay(game, side, cost)) return 'not enough resources';
  const time = C.stat(def.time, game.mods[side], 'eraTime');   // artisans eraTime 0.7
  game.eraP[side] = { target: def.n, endTick: game.tick + Math.max(1, C.secToTicks(time)) };
  game.eraPDirty[side] = true;
  return null;
}

function completeEra(game, side) {
  const target = game.eraP[side].target;
  game.era[side] = target;
  game.eraDirty[side] = true;
  game.eraP[side] = null;
  game.eraPDirty[side] = true;
  game.pending.ev.push({ e: 'era', n: target, side });
  if (target === 5 && !game.era5[side]) {
    game.era5[side] = true;
    mods.rebuild(game, side);          // adds era5Hp/era5Dmg
    mods.retroHp(game, side);          // +10% HP retro-applies to existing units
  }
}

function stepEra(game) {
  for (let side = 0; side < 2; side++) {
    const p = game.eraP[side];
    if (p && game.tick >= p.endTick) completeEra(game, side);
  }
}

// ---- tech research (Library queue, §4.4) ----

function research(game, side, techId) {
  const t = TECHS[techId];
  if (!t) return 'unknown tech';
  if (game.techs[side].indexOf(techId) !== -1) return 'already researched';
  if (game.techA[side] && game.techA[side].tech === techId) return 'already researching';
  if (game.techQ[side].indexOf(techId) !== -1) return 'already queued';
  if (t.era > game.era[side]) return 'requires era ' + t.era;
  if (!hasCompleted(game, side, 'library')) return 'requires a library';
  if (t.requires && !hasCompleted(game, side, t.requires)) return 'requires ' + BUILDINGS[t.requires].name;
  if (!economy.pay(game, side, mods.techCost(game.mods[side], t))) return 'not enough resources';
  game.techQ[side].push(techId);
  game.researchDirty[side] = true;
  return null;
}

function completeTech(game, side, techId) {
  game.techs[side].push(techId);
  game.techA[side] = null;
  game.techsDirty[side] = true;
  game.researchDirty[side] = true;
  mods.rebuild(game, side);
  if (HP_TECH.has(techId)) mods.retroHp(game, side);
  if (POP_TECH.has(techId)) economy.recomputePopCap(game, side);
  game.pending.ev.push({ e: 'research_done', tech: techId, side });
}

function stepResearch(game) {
  for (let side = 0; side < 2; side++) {
    if (side === C.SIDE.BOTS && game.mode === C.MODE.INTRO) continue;
    let a = game.techA[side];
    if (!a && game.techQ[side].length) {
      const tech = game.techQ[side].shift();
      const time = C.stat(TECHS[tech].time, game.mods[side], 'researchTime'); // artisans 0.7
      a = game.techA[side] = { tech, endTick: game.tick + Math.max(1, C.secToTicks(time)) };
      game.researchDirty[side] = true;
    }
    if (a && game.tick >= a.endTick) completeTech(game, side, a.tech);
  }
}

function step(game, dt) {
  stepEra(game);
  stepResearch(game);
  stepConstruction(game, dt);
  stepQueues(game, dt);
}

module.exports = {
  place, demolish, train, cancelQueue, setRally, trade,
  advanceEra, research, hasCompleted, step
};
