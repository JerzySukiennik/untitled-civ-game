// Combat: target acquisition (auto-attack within aggro), attack cooldowns, flat damage, siege
// multipliers vs buildings, catapult splash + min range, tower auto-attack, temple healing,
// worker/cart flee-on-hit. Damage is instant; attack events are visual-only markers.
//
// Performance: a coarse uniform grid (CELL tiles) is rebuilt once per tick and reused for every
// acquisition/heal/splash query, so target scans stay ~O(units) instead of O(units^2). The grid
// Map and its cell arrays persist across ticks (arrays truncated, not reallocated) to keep the hot
// loop allocation-free.
const C = require('../shared/constants.js');
const UNITS = require('../shared/data-units.js');
const units = require('./units.js');
const mods = require('./mods.js');
const snapshot = require('./snapshot.js');

const D = snapshot.DIRTY;
const CELL = 4;                        // spatial bucket size in tiles
const MELEE_PAD = 0.3;                 // forgiveness added to melee range
const MILITARY = mods.MILITARY;

function isMilitary(type) { return MILITARY.has(type); }

// Attack damage for a unit after civ/tech/era mods (dmg is computed live, never stored).
function unitDamage(game, e) {
  const def = UNITS[e.type], m = game.mods[e.side];
  let dmg = def.dmg;
  if (mods.MELEE.has(e.type)) dmg = C.stat(dmg, m, 'meleeDmgAdd');     // mil1 +2 (additive)
  if (mods.INFANTRY.has(e.type)) dmg = C.stat(dmg, m, 'infantryDmg');  // vikings x1.2
  if (e.type === 'archer') dmg = C.stat(dmg, m, 'archerDmgAdd');       // mil2 +2 (additive)
  if (e.type === 'horseman') dmg = C.stat(dmg, m, 'horsemanDmg');      // steppe x1.2
  if (MILITARY.has(e.type)) dmg = C.stat(dmg, m, 'era5Dmg');           // era 5 +10%
  return dmg;
}

// Effective attack range (archer gains +1 from mil2 Fletching).
function unitRange(game, e) {
  const def = UNITS[e.type];
  return e.type === 'archer' ? C.stat(def.rng, game.mods[e.side], 'archerRngAdd') : def.rng;
}

// ---- spatial grid ----

function buildGrid(game) {
  let g = game._cgrid;
  if (!g) {
    g = game._cgrid = { cells: new Map(), W: Math.ceil(C.MAP_W / CELL) };
  }
  for (const arr of g.cells.values()) arr.length = 0;
  const W = g.W;
  for (const e of game.entities.values()) {
    if (e.state === C.ST.DEAD) continue;
    if (e.kind === C.KIND.BUILDING && e.type === 'road') continue;
    const cx = (e.x / CELL) | 0, cy = (e.y / CELL) | 0;
    const k = cy * W + cx;
    let arr = g.cells.get(k);
    if (!arr) { arr = []; g.cells.set(k, arr); }
    arr.push(e);
  }
  return g;
}

function cellRange(radius) { return Math.ceil((radius + 3) / CELL); }

// Squared distance from point (px,py) to an entity's footprint (buildings) or center (units).
function distPointEnt2(px, py, o) {
  if (o.kind === C.KIND.BUILDING) {
    const cx = Math.min(Math.max(px, o.tx), o.tx + o.foot[0]);
    const cy = Math.min(Math.max(py, o.ty), o.ty + o.foot[1]);
    const dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy;
  }
  const dx = px - o.x, dy = py - o.y;
  return dx * dx + dy * dy;
}

function distEnt2(e, o) { return distPointEnt2(e.x, e.y, o); }

// Nearest hostile entity to `e` within `radius`. `unitsOnly` restricts to enemy units (towers).
function nearestEnemy(game, e, radius, grid, unitsOnly) {
  const W = grid.W, r = cellRange(radius);
  const cx = (e.x / CELL) | 0, cy = (e.y / CELL) | 0;
  const rad2 = radius * radius;
  let best = null, bestD = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const arr = grid.cells.get((cy + dy) * W + (cx + dx));
      if (!arr) continue;
      for (const o of arr) {
        if (o.side === e.side || o.state === C.ST.DEAD) continue;
        if (unitsOnly && o.kind !== C.KIND.UNIT) continue;
        const d2 = distEnt2(e, o);
        if (d2 <= rad2 && d2 < bestD) { bestD = d2; best = o; }
      }
    }
  }
  return best;
}

function forEachNear(grid, x, y, radius, cb) {
  const W = grid.W, r = cellRange(radius);
  const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const arr = grid.cells.get((cy + dy) * W + (cx + dx));
      if (!arr) continue;
      for (const o of arr) cb(o);
    }
  }
}

// ---- damage application ----

function doDamage(game, attacker, tgt, dmg) {
  if (dmg <= 0 || tgt.state === C.ST.DEAD) return;
  tgt.hp -= dmg;
  tgt.dirty |= D.HP;
  if (tgt.kind === C.KIND.BUILDING && tgt.side === C.SIDE.BOTS && game.bot) {
    game.bot.onDamaged(tgt);
  }
  if (tgt.kind === C.KIND.UNIT && (tgt.type === 'worker' || tgt.type === 'cart') &&
      attacker && tgt.state !== C.ST.FLEE) {
    units.flee(game, tgt);
  }
  if (tgt.hp <= 0) {
    if (tgt.kind === C.KIND.UNIT) game.killUnit(tgt);
    else game.killBuilding(tgt);
  }
}

// A single swing from `e` at its resolved target. Applies siege multiplier vs buildings and
// catapult splash. Emits a transient attack event for client flashes/impacts.
function doAttack(game, e, tgt, grid) {
  const def = UNITS[e.type];
  let dmg = unitDamage(game, e);
  if (tgt.kind === C.KIND.BUILDING && def.vsBuilding) {
    dmg = C.stat(dmg * def.vsBuilding, game.mods[e.side], 'siegeVsBuilding'); // mil4 x1.5
  }
  game.pending.ev.push({ e: 'attack', from: e.id, to: tgt.id, rng: def.rng > 1 ? 1 : 0 });
  const tx = tgt.x, ty = tgt.y;
  doDamage(game, e, tgt, dmg);
  if (def.splash) {
    const half = Math.max(1, Math.floor(dmg / 2));
    forEachNear(grid, tx, ty, def.splash, (o) => {
      if (o === tgt || o.side === e.side || o.state === C.ST.DEAD) return;
      if (distPointEnt2(tx, ty, o) <= def.splash * def.splash) doDamage(game, e, o, half);
    });
  }
}

// ---- unit combat state machine (military only) ----

function unitCombat(game, e, dt, grid) {
  const def = UNITS[e.type];
  if (e.cooldown > 0) { e.cooldown -= dt; if (e.cooldown < 0) e.cooldown = 0; }

  // Resolve / validate current target.
  let tgt = e.atk ? game.entities.get(e.atk) : null;
  if (tgt && (tgt.side === e.side || tgt.state === C.ST.DEAD || (tgt.kind === C.KIND.BUILDING && tgt.type === 'road'))) {
    tgt = null; e.atk = 0;
  }
  if (!tgt) {
    // Auto-acquire only while standing guard (idle/attacking) or executing an attack-move.
    const canAcquire = e.am != null || e.state === C.ST.IDLE || e.state === C.ST.ATTACK;
    if (canAcquire) {
      tgt = nearestEnemy(game, e, C.AGGRO_RADIUS, grid, false);
      if (tgt) e.atk = tgt.id;
    }
  }

  if (!tgt) {
    // No enemy: keep marching to the attack-move goal, else fall idle.
    if (e.am) {
      if (arrivedAt(e, e.am.tx, e.am.ty)) { e.am = null; stop(game, e); }
      else ensurePathTo(game, e, e.am.tx, e.am.ty);
    } else if (e.state === C.ST.ATTACK) {
      stop(game, e);
    }
    return;
  }

  const rng = unitRange(game, e);
  const d2 = distEnt2(e, tgt);

  // Catapult (and any minRange unit) must not fire point-blank: back off first.
  if (def.minRange && d2 < def.minRange * def.minRange) {
    backOff(game, e, tgt);
    return;
  }

  const eff = rng <= 1 ? rng + MELEE_PAD : rng;
  if (d2 <= eff * eff) {
    stop(game, e);
    units.setState(e, C.ST.ATTACK);
    if (e.cooldown <= 0) { doAttack(game, e, tgt, grid); e.cooldown = def.cd; }
  } else {
    chase(game, e, tgt);
  }
}

function arrivedAt(e, tx, ty) {
  const dx = e.x - (tx + 0.5), dy = e.y - (ty + 0.5);
  return dx * dx + dy * dy <= 1.4 * 1.4;
}

function stop(game, e) {
  e.path = null; e.pathi = 0; e.moveGoal = null;
}

// Path toward a goal tile, but only re-plan when the goal tile actually changed or we have no
// path — prevents per-tick A* thrash while chasing a moving target.
function ensurePathTo(game, e, tx, ty) {
  const g = game.pathfinder.nearestWalkable(tx | 0, ty | 0);
  if (!g) return;
  if (e.moveGoal && e.moveGoal.x === g.x && e.moveGoal.y === g.y && e.path) return;
  e.moveGoal = { x: g.x, y: g.y };
  units.pathTo(game, e, g.x, g.y, null);
}

function chase(game, e, tgt) {
  let gx, gy;
  if (tgt.kind === C.KIND.BUILDING) {
    const ap = game.pathfinder.approach(e.x, e.y, tgt.tx, tgt.ty, tgt.foot[0], tgt.foot[1]);
    if (!ap) { stop(game, e); units.setState(e, C.ST.IDLE); return; }
    gx = ap.x; gy = ap.y;
  } else {
    gx = tgt.x | 0; gy = tgt.y | 0;
  }
  ensurePathTo(game, e, gx, gy);
}

// Step one tile directly away from the target, then re-engage from range next tick.
function backOff(game, e, tgt) {
  const dx = e.x - tgt.x, dy = e.y - tgt.y;
  const m = Math.hypot(dx, dy) || 1;
  const tx = (e.x + (dx / m) * 2) | 0, ty = (e.y + (dy / m) * 2) | 0;
  ensurePathTo(game, e, tx, ty);
}

// ---- buildings: towers auto-attack, temples heal ----

function towerAttack(game, b, dt, grid) {
  b.cooldown = (b.cooldown || 0) - dt;
  if (b.cooldown > 0) return;
  const tgt = nearestEnemy(game, b, 7, grid, true);
  if (!tgt) return;
  game.pending.ev.push({ e: 'attack', from: b.id, to: tgt.id, rng: 1 });
  doDamage(game, b, tgt, C.stat(8, game.mods[b.side], 'towerDmgAdd')); // mil2 +2 (additive)
  b.cooldown = 1;
}

function templeHeal(game, b, dt, grid) {
  forEachNear(grid, b.x, b.y, 6, (o) => {
    if (o.kind !== C.KIND.UNIT || o.side !== b.side || o.state === C.ST.DEAD) return;
    if (o.hp >= o.maxhp) return;
    if (distPointEnt2(b.x, b.y, o) > 36) return;
    o.hp = Math.min(o.maxhp, o.hp + dt);   // 1 HP/s
    o.dirty |= D.HP;
  });
}

// ---- per-tick entry ----

function step(game, dt) {
  const grid = buildGrid(game);
  for (const e of game.entities.values()) {
    if (e.state === C.ST.DEAD) continue;
    if (e.kind === C.KIND.BUILDING) {
      if (e.progress < 1) continue;
      if (e.type === 'tower') towerAttack(game, e, dt, grid);
      else if (e.type === 'temple') templeHeal(game, e, dt, grid);
    } else if (isMilitary(e.type)) {
      unitCombat(game, e, dt, grid);
    }
  }
}

module.exports = { step, isMilitary, doDamage, nearestEnemy, buildGrid, unitDamage, unitRange };
