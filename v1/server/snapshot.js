// Snapshot: full snapshot builder + per-tick delta builder using entity dirty bitmasks.
const C = require('../shared/constants.js');

// Dirty bits set by sim systems; cleared after each delta.
const DIRTY = { POS: 1, HP: 2, ST: 4, PROG: 8, EXTRA: 16 };

function q(v) { return Math.round(v * 16) / 16; }

// Full wire form of one entity.
function fullEnt(e) {
  const o = { id: e.id, k: e.kind, type: e.type, side: e.side, x: q(e.x), y: q(e.y), hp: Math.round(e.hp), maxhp: e.maxhp, st: e.state };
  if (e.kind === C.KIND.BUILDING) {
    o.tx = e.tx; o.ty = e.ty;
    if (e.progress < 1) o.progress = Math.round(e.progress * 100) / 100;
    if (e.queue && e.queue.length) o.q = e.queue.length;
  }
  return o;
}

// Partial wire form: only fields whose dirty bit is set.
function partialEnt(e) {
  const o = { id: e.id };
  if (e.dirty & DIRTY.POS) { o.x = q(e.x); o.y = q(e.y); }
  if (e.dirty & DIRTY.HP) o.hp = Math.round(e.hp);
  if (e.dirty & DIRTY.ST) o.st = e.state;
  if (e.dirty & DIRTY.PROG) o.progress = Math.round(e.progress * 100) / 100;
  if (e.dirty & DIRTY.EXTRA) o.q = e.queue ? e.queue.length : 0;
  return o;
}

function resObj(r) { return { f: Math.floor(r.f), w: Math.floor(r.w), s: Math.floor(r.s), g: Math.floor(r.g) }; }

// Full snapshot for a side (sent on start, rejoin, keyframe).
function fullSnap(game, side) {
  const entities = [];
  for (const e of game.entities.values()) entities.push(fullEnt(e));
  return {
    t: C.MSG.SNAP,
    tick: game.tick,
    res: resObj(game.res[side]),
    pop: { cur: game.pop[side].cur, cap: game.pop[side].cap },
    era: game.era[side],
    techs: game.techs[side].slice(),
    mods: game.mods[side] || {},
    eraP: game.eraP[side],
    techA: game.techA[side],
    techQ: game.techQ[side].slice(),
    entities
  };
}

// Delta since last tick. side selects which treasury/pop to report (players view).
function delta(game, side) {
  const add = [];
  const upd = [];
  for (const e of game.entities.values()) {
    if (game.pending.add.has(e.id)) { add.push(fullEnt(e)); continue; }
    if (e.dirty) upd.push(partialEnt(e));
  }
  const d = { t: C.MSG.DELTA, tick: game.tick };
  if (add.length) d.add = add;
  if (upd.length) d.upd = upd;
  if (game.pending.del.size) d.del = [...game.pending.del];
  if (game.pending.ev.length) d.ev = game.pending.ev.slice();
  if (game.pending.nodeUpd.size) {
    const nu = [];
    for (const id of game.pending.nodeUpd) {
      const n = game.nodesById.get(id);
      if (n) nu.push({ id, amt: Math.round(n.amt) });
    }
    if (nu.length) d.nodes = nu;
  }
  if (game.resDirty[side]) d.res = resObj(game.res[side]);
  if (game.popDirty[side]) d.pop = { cur: game.pop[side].cur, cap: game.pop[side].cap };
  if (game.eraDirty[side]) d.era = game.era[side];
  if (game.techsDirty[side]) d.techs = game.techs[side].slice();
  if (game.modsDirty[side]) d.mods = game.mods[side] || {};
  if (game.eraPDirty[side]) d.eraP = game.eraP[side] || null;   // null clears finished research
  if (game.researchDirty[side]) { d.techA = game.techA[side] || null; d.techQ = game.techQ[side].slice(); }
  return d;
}

// Clear dirty state after a delta has been serialized.
function clearDirty(game) {
  for (const e of game.entities.values()) e.dirty = 0;
  game.pending.add.clear();
  game.pending.del.clear();
  game.pending.ev.length = 0;
  game.pending.nodeUpd.clear();
  for (let s = 0; s < 2; s++) {
    game.resDirty[s] = false; game.popDirty[s] = false;
    game.eraDirty[s] = false; game.techsDirty[s] = false;
    game.modsDirty[s] = false; game.eraPDirty[s] = false; game.researchDirty[s] = false;
  }
}

module.exports = { DIRTY, fullSnap, delta, clearDirty, fullEnt };
