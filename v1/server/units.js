// Units: per-tick unit state machines. Movement along A* paths (road speed x1.5), worker
// gather loop (toNode -> gathering -> toDropoff -> deposit), farm slots, build state,
// cart trade shuttling (depot <-> market/TC), flee-toward-TC hook for Stage C combat.
const C = require('../shared/constants.js');
const UNITS = require('../shared/data-units.js');
const BUILDINGS = require('../shared/data-buildings.js');
const economy = require('./economy.js');
const snapshot = require('./snapshot.js');

const D = snapshot.DIRTY;
const ARRIVE_EPS = 0.08;          // tiles
const ROAD_MULT = 1.5;
const RETARGET_RADIUS = 8;        // tiles, node retarget after depletion

function setState(e, st) { if (e.state !== st) { e.state = st; e.dirty |= D.ST; } }

// ---- ordering API (called from game.js command handlers and buildings.js) ----

function orderMove(game, e, tx, ty) {
  releaseJob(game, e);
  e.job = null;
  e.atk = 0; e.am = null; e.moveGoal = null;   // plain move: drop any combat intent
  startPathTo(game, e, tx, ty, null);
}

// Attack-move to a point: engage anything acquired en route, otherwise keep marching.
function orderAttackMove(game, e, tx, ty) {
  releaseJob(game, e);
  e.job = null;
  e.atk = 0; e.am = { tx, ty }; e.moveGoal = null;
  startPathTo(game, e, tx, ty, null);
}

// Focus-fire a specific enemy entity; the target's tile doubles as an attack-move fallback.
function orderAttackTarget(game, e, target) {
  releaseJob(game, e);
  e.job = null;
  e.atk = target.id;
  e.am = { tx: target.x | 0, ty: target.y | 0 };
  e.moveGoal = null;
}

// Raw path helper used by combat.js to chase without disturbing combat intent.
function pathTo(game, e, tx, ty, act) { return startPathTo(game, e, tx, ty, act); }

function orderGatherNode(game, e, node) {
  if (e.type !== 'worker') return;
  releaseJob(game, e);
  e.job = { type: 'gather', nodeId: node.id };
  if (e.cargo.res !== node.res) { e.cargo.res = node.res; e.cargo.amt = 0; }
  goToNode(game, e, node);
}

function orderBuild(game, e, site) {
  if (e.type !== 'worker') return;
  releaseJob(game, e);
  e.job = { type: 'build', id: site.id };
  goToBuilding(game, e, site, 'build');
}

function orderFarm(game, e, farm) {
  if (e.type !== 'worker') return;
  if (farm.workerId && farm.workerId !== e.id) return;   // slot taken
  releaseJob(game, e);
  e.job = { type: 'farm', id: farm.id };
  farm.workerId = e.id;
  goToBuilding(game, e, farm, 'farm');
}

// Stage C hook: worker/cart runs toward own TC when hit.
function flee(game, e) {
  const tc = findOwn(game, e.side, 'tc');
  releaseJob(game, e);
  e.job = null;
  e.atk = 0; e.am = null; e.moveGoal = null;
  if (tc) { goToBuilding(game, e, tc, null); setState(e, C.ST.FLEE); }
}

// Free any resource this unit holds (farm slot) when reassigned or killed.
function releaseJob(game, e) {
  if (e.job && e.job.type === 'farm') {
    const farm = game.entities.get(e.job.id);
    if (farm && farm.workerId === e.id) farm.workerId = 0;
  }
}

// ---- path helpers ----

function startPathTo(game, e, tx, ty, arriveAct) {
  const pf = game.pathfinder;
  const goal = pf.nearestWalkable(tx | 0, ty | 0);
  if (!goal) { setState(e, C.ST.IDLE); return false; }
  const path = pf.findPath(e.x | 0, e.y | 0, goal.x, goal.y, e.side);
  if (!path) { setState(e, C.ST.IDLE); return false; }
  e.path = path; e.pathi = 0; e.blocked = 0; e.arriveAct = arriveAct;
  setState(e, e.state === C.ST.FLEE ? C.ST.FLEE : C.ST.MOVE);
  return true;
}

function goToNode(game, e, node) {
  const ap = game.pathfinder.approach(e.x, e.y, node.tx, node.ty, 1, 1);
  if (!ap) { setState(e, C.ST.IDLE); return; }
  startPathTo(game, e, ap.x, ap.y, 'gather');
}

function goToBuilding(game, e, b, act) {
  const ap = game.pathfinder.approach(e.x, e.y, b.tx, b.ty, b.foot[0], b.foot[1]);
  if (!ap) { setState(e, C.ST.IDLE); return; }
  startPathTo(game, e, ap.x, ap.y, act);
}

function adjacentToRect(e, tx, ty, fw, fh) {
  const cx = Math.min(Math.max(e.x, tx), tx + fw);
  const cy = Math.min(Math.max(e.y, ty), ty + fh);
  const dx = e.x - cx, dy = e.y - cy;
  return dx * dx + dy * dy <= 1.3 * 1.3;
}

function findOwn(game, side, type) {
  for (const e of game.entities.values()) {
    if (e.kind === C.KIND.BUILDING && e.side === side && e.type === type && e.progress >= 1) return e;
  }
  return null;
}

// Nearest completed drop-off accepting `res` for `side`. tc/storehouse: all; lumber: w;
// quarry: s+g; granary: f.
function findDropoff(game, side, res, x, y) {
  let best = null, bestD = Infinity;
  for (const b of game.entities.values()) {
    if (b.kind !== C.KIND.BUILDING || b.side !== side || b.progress < 1) continue;
    const t = b.type;
    const ok = t === 'tc' || t === 'storehouse' ||
      (t === 'lumber' && res === 'w') || (t === 'quarry' && (res === 's' || res === 'g')) ||
      (t === 'granary' && res === 'f');
    if (!ok) continue;
    const d = (b.x - x) ** 2 + (b.y - y) ** 2;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function findNearestNode(game, res, x, y, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const n of game.nodesById.values()) {
    if (n.res !== res || n.amt <= 0) continue;
    const d = (n.tx + 0.5 - x) ** 2 + (n.ty + 0.5 - y) ** 2;
    if (d <= bestD) { bestD = d; best = n; }
  }
  return best;
}

// ---- per-tick stepping ----

function step(game, dt) {
  for (const e of game.entities.values()) {
    if (e.kind !== C.KIND.UNIT) continue;
    switch (e.state) {
      case C.ST.MOVE: case C.ST.FLEE: stepMove(game, e, dt); break;
      case C.ST.GATHER: stepGather(game, e, dt); break;
      case C.ST.TRADE: stepCart(game, e, dt); break;
      default: break;
    }
    if (e.type === 'cart' && e.state === C.ST.IDLE) beginCartLeg(game, e);
  }
  game.pathfinder.softCollision(game);
}

function unitSpeed(game, e) {
  const mods = game.mods[e.side];
  let spd = C.stat(UNITS[e.type].spd, mods, 'unitSpeed');   // pop3 / steppe / highlanders
  if (e.type === 'worker') spd = C.stat(spd, mods, 'workerSpeed'); // eco3
  return spd;
}

function stepMove(game, e, dt) {
  if (!e.path || e.pathi >= e.path.length) { onArrive(game, e); return; }
  let budget = unitSpeed(game, e) * dt * (game.grid.hasRoad(e.x | 0, e.y | 0) ? ROAD_MULT : 1);
  while (budget > 0 && e.pathi < e.path.length) {
    const wp = e.path[e.pathi];
    // Blocked look-ahead: waypoint tile turned unwalkable (new building) -> wait 3 ticks, repath.
    if (!game.grid.isWalkable(wp.x | 0, wp.y | 0)) {
      if (++e.blocked >= 3) {
        const last = e.path[e.path.length - 1];
        startPathTo(game, e, last.x | 0, last.y | 0, e.arriveAct);
      }
      break;
    }
    e.blocked = 0;
    const dx = wp.x - e.x, dy = wp.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget || d < ARRIVE_EPS) {
      e.x = wp.x; e.y = wp.y; budget -= d; e.pathi++;
    } else {
      e.x += (dx / d) * budget; e.y += (dy / d) * budget; budget = 0;
    }
  }
  e.dirty |= D.POS;
  if (e.pathi >= e.path.length) onArrive(game, e);
}

function onArrive(game, e) {
  e.path = null;
  const act = e.arriveAct; e.arriveAct = null;
  if (e.type === 'cart') { onCartArrive(game, e); return; }
  if (!act || !e.job) { setState(e, C.ST.IDLE); return; }

  if (act === 'gather' && e.job.type === 'gather') {
    const node = game.nodesById.get(e.job.nodeId);
    if (!node || node.amt <= 0) { retarget(game, e); return; }
    if (!adjacentToRect(e, node.tx, node.ty, 1, 1)) { goToNode(game, e, node); return; }
    setState(e, C.ST.GATHER);
  } else if (act === 'deposit') {
    const b = game.entities.get(e.job.dropId);
    if (!b || b.progress < 1) { toDropoff(game, e); return; }
    if (!adjacentToRect(e, b.tx, b.ty, b.foot[0], b.foot[1])) { goToBuilding(game, e, b, 'deposit'); return; }
    if (e.cargo.amt > 0) economy.credit(game, e.side, e.cargo.res, e.cargo.amt);
    e.cargo.amt = 0;
    const node = game.nodesById.get(e.job.nodeId);
    if (node && node.amt > 0) goToNode(game, e, node);
    else retarget(game, e);
  } else if (act === 'build' && e.job.type === 'build') {
    const site = game.entities.get(e.job.id);
    if (!site || site.progress >= 1) { e.job = null; setState(e, C.ST.IDLE); return; }
    if (!adjacentToRect(e, site.tx, site.ty, site.foot[0], site.foot[1])) { goToBuilding(game, e, site, 'build'); return; }
    setState(e, C.ST.BUILD);
  } else if (act === 'farm' && e.job.type === 'farm') {
    const farm = game.entities.get(e.job.id);
    if (!farm || farm.progress < 1 || (farm.workerId && farm.workerId !== e.id)) {
      releaseJob(game, e); e.job = null; setState(e, C.ST.IDLE); return;
    }
    farm.workerId = e.id;
    setState(e, C.ST.GATHER);   // farm work renders as gathering
  } else {
    setState(e, C.ST.IDLE);
  }
}

function stepGather(game, e, dt) {
  const def = UNITS[e.type];
  if (!e.job) { setState(e, C.ST.IDLE); return; }
  if (e.job.type === 'farm') return;          // production credited in economy.js farm pass
  const node = game.nodesById.get(e.job.nodeId);
  if (!node || node.amt <= 0) { retarget(game, e); return; }
  let rate = def.gather;                      // 1/s base
  if (game.gatherMult) rate *= game.gatherMult[e.side];   // bot difficulty gather scaling
  rate *= economy.resRateMult(game, e.side, node.res);    // wonder + granary + civ/tech rate mods
  const take = Math.min(rate * dt, node.amt);
  e.cargo.res = node.res;
  e.cargo.amt += take;
  node.amt -= take;
  game.nodeTouched(node);
  if (node.amt <= 0) economy.depleteNode(game, node);
  if (e.cargo.amt >= C.stat(def.carry, game.mods[e.side], 'workerCarry')) toDropoff(game, e); // eco3 +5
}

function toDropoff(game, e) {
  const b = findDropoff(game, e.side, e.cargo.res, e.x, e.y);
  if (!b) {
    // Nowhere to bring it: hold cargo, go idle (a drop-off may be built later).
    setState(e, C.ST.IDLE); return;
  }
  e.job.dropId = b.id;
  goToBuilding(game, e, b, 'deposit');
}

function retarget(game, e) {
  const res = e.cargo.res || (e.job && e.job.res) || 'w';
  if (e.cargo.amt > 0) { toDropoff(game, e); return; }  // dump first, then look again
  const node = findNearestNode(game, res, e.x, e.y, RETARGET_RADIUS);
  if (node) { e.job = { type: 'gather', nodeId: node.id }; goToNode(game, e, node); }
  else { e.job = null; setState(e, C.ST.IDLE); }
}

// ---- cart trade loop ----

function beginCartLeg(game, e) {
  const home = game.entities.get(e.homeId);
  if (!home || home.progress < 1) { setState(e, C.ST.IDLE); return; }
  const dest = findOwn(game, e.side, 'market') || findOwn(game, e.side, 'tc');
  if (!dest || dest.id === home.id) return;   // stays idle until a route exists
  e.destId = dest.id;
  e.leg = e.leg === 1 ? 1 : 0;
  const target = e.leg === 0 ? dest : home;
  goToBuilding(game, e, target, null);
  if (e.path) setState(e, C.ST.TRADE);
}

function stepCart(game, e, dt) { stepMove(game, e, dt); }

function onCartArrive(game, e) {
  const home = game.entities.get(e.homeId);
  const dest = game.entities.get(e.destId);
  if (!home || !dest) { setState(e, C.ST.IDLE); return; }
  if (e.leg === 0) {
    e.leg = 1;
    goToBuilding(game, e, home, null);
    if (e.path) setState(e, C.ST.TRADE); else setState(e, C.ST.IDLE);
  } else {
    // Completed round trip back at depot: gold = round(distance * 0.15 * tradeRate).
    const dist = Math.hypot(dest.x - home.x, dest.y - home.y);
    economy.credit(game, e.side, 'g', Math.round(C.stat(dist * 0.15, game.mods[e.side], 'tradeRate')));
    e.leg = 0;
    setState(e, C.ST.IDLE);   // next tick starts a new leg
  }
}

module.exports = {
  step, orderMove, orderAttackMove, orderAttackTarget, pathTo,
  orderGatherNode, orderBuild, orderFarm, flee, releaseJob,
  findOwn, findNearestNode, setState
};
