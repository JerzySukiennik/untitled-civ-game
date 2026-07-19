// Bot AI (PLAN.md §6). One instance drives the BOTS side. Runs once per second (game calls
// think() every 12 ticks). State machine OPENING -> DEVELOP -> PRESSURE with a DEFEND interrupt.
// Difficulty comes from BOT_DIFF (gather scaling is applied in game.gatherMult; here we handle the
// free trickle, eco-worker target, build order, army composition, wave cadence and defense).
//
// Era-dependent behaviour (advance_era, maxEra, eraCostMult) is a graceful no-op until Stage D
// wires the era system; the structure is in place so it activates without rewrites.
const C = require('../shared/constants.js');
const BUILDINGS = require('../shared/data-buildings.js');
const UNITS = require('../shared/data-units.js');
const TECHS = require('../shared/data-techs.js');
const ERAS = require('../shared/data-eras.js');
const economy = require('./economy.js');
const buildings = require('./buildings.js');
const units = require('./units.js');

const SIDE = C.SIDE.BOTS;
// Tech research order: the §6 openers first, then branch-cycled by era.
const BOT_TECH_PRIORITY = [
  'eco1', 'mil1', 'con1', 'pop1', 'eco2', 'mil2', 'con2', 'pop2',
  'eco3', 'con3', 'mil3', 'pop3', 'eco4', 'mil4', 'con4', 'pop4'
];
// Desired build order (repeats encode target counts). The bot builds the first entry it is short
// of and can afford — OPENING items come first, DEVELOP structures after.
const PLAN = [
  'house', 'house', 'farm', 'lumber', 'quarry', 'barracks', 'house', 'farm',
  'library', 'farm', 'range', 'house', 'tower', 'farm', 'house', 'tower', 'house',
  'stable', 'market', 'smith', 'temple', 'siege', 'house', 'farm', 'house'
];
const ECO_TYPES = new Set(['house', 'farm', 'lumber', 'quarry']);
const BUILDERS_PER_SITE = 3;

class Bot {
  constructor(game) {
    this.g = game;
    this.diff = C.BOT_DIFF[game.difficulty] || C.BOT_DIFF.normal;
    this.site = game.citySites.bots;
    this.phase = 'OPENING';
    this.nextAttackAt = this.diff.firstAttackAt;   // seconds
    this.waveSize = this.diff.waveSizeStart;
    this.attacking = false;
    this.armyTargetId = 0;
    this.defendUntil = 0;                           // seconds
    this.defendTargetId = 0;
    this.defendDirty = false;
    this.built = {};                               // cumulative placements per type
  }

  now() { return this.g.tick / C.TICK_RATE; }

  // Called from combat when a bot building is damaged.
  onDamaged(b) {
    this.defendUntil = this.now() + 20;
    this.defendTargetId = b.id;
    this.defendDirty = true;
  }

  think() {
    const g = this.g;
    // Hard difficulty resource trickle.
    if (this.diff.freeTrickleF) economy.credit(g, SIDE, 'f', this.diff.freeTrickleF);
    if (this.diff.freeTrickleW) economy.credit(g, SIDE, 'w', this.diff.freeTrickleW);
    this.updatePhase();
    this.manageEra();
    this.manageResearch();
    this.manageBuild();
    this.manageWorkers();
    this.manageArmy();
  }

  // ---- era + tech progression ----
  // Advance eras ASAP (§6 DEVELOP): try once affordable at the difficulty-scaled cost. Building
  // requirements + TC presence are re-checked inside advanceEra, so an early call is a harmless no-op.
  manageEra() {
    const g = this.g;
    if (g.era[SIDE] >= this.diff.maxEra || g.eraP[SIDE]) return;
    const def = ERAS[g.era[SIDE]];                 // next era def
    const m = this.diff.eraCostMult;
    const need = { f: def.cost.f * m, w: def.cost.w * m, s: def.cost.s * m, g: def.cost.g * m };
    if (!economy.canAfford(g.res[SIDE], need)) return;
    buildings.advanceEra(g, SIDE, { costMult: m });   // err (missing reqs) ignored — retries later
  }

  // Research techs one at a time in fixed priority (§6): skip locked (era/building) or unaffordable.
  manageResearch() {
    const g = this.g;
    if (g.techA[SIDE] || g.techQ[SIDE].length) return;
    if (!buildings.hasCompleted(g, SIDE, 'library')) return;
    for (const id of BOT_TECH_PRIORITY) {
      if (g.techs[SIDE].indexOf(id) !== -1) continue;
      const t = TECHS[id];
      if (t.era > g.era[SIDE]) continue;
      if (t.requires && !buildings.hasCompleted(g, SIDE, t.requires)) continue;
      if (!economy.canAfford(g.res[SIDE], t.cost)) continue;
      if (!buildings.research(g, SIDE, id)) return;   // researched one this second
    }
  }

  // ---- phase ----
  updatePhase() {
    const now = this.now();
    if (now < this.defendUntil) { this.phase = 'DEFEND'; return; }
    const have = this.countBuildings();
    const openingDone = (have.house || 0) >= 2 && (have.barracks || 0) >= 1 &&
      (have.lumber || 0) >= 1 && (have.quarry || 0) >= 1;
    if (!openingDone) { this.phase = 'OPENING'; return; }
    this.phase = (have.barracks || 0) >= 1 && this.armyUnits().length >= 3 ? 'PRESSURE' : 'DEVELOP';
  }

  // ---- building ----
  manageBuild() {
    const g = this.g;
    const have = this.countBuildings();
    const seen = {};
    for (const t of PLAN) {
      seen[t] = (seen[t] || 0) + 1;
      if ((have[t] || 0) >= seen[t]) continue;
      if (BUILDINGS[t].era > g.era[SIDE]) continue;   // era-locked: skip until unlocked
      // Easy never rebuilds destroyed eco buildings.
      if (!this.diff.rebuildEco && ECO_TYPES.has(t) && (this.built[t] || 0) >= seen[t]) continue;
      const def = BUILDINGS[t];
      if (!economy.canAfford(g.res[SIDE], def.cost)) return;   // save up, keep priority order
      const spot = this.findSpot(t);
      if (!spot) continue;                                     // no legal spot yet, try next type
      const err = buildings.place(g, SIDE, t, spot.tx, spot.ty);
      if (!err) this.built[t] = (this.built[t] || 0) + 1;
      return;                                                  // one placement per second
    }
  }

  // Spiral out from the bot city for a legal footprint. Towers bias toward the player-facing edge.
  findSpot(type) {
    const g = this.g, def = BUILDINGS[type], fw = def.foot[0], fh = def.foot[1];
    const cx = this.site.tx, cy = this.site.ty;
    for (let r = 3; r <= 24; r++) {
      let ring = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          ring.push([dx, dy]);
        }
      }
      if (type === 'tower') ring.sort((a, b) => a[0] - b[0]);   // prefer lower x (toward players)
      for (const [dx, dy] of ring) {
        const tx = cx + dx, ty = cy + dy;
        if (!g.grid.canPlace(tx, ty, fw, fh)) continue;
        if (type === 'lumber' && !g.grid.hasTerrainNear(tx, ty, [C.TERRAIN.FOREST], 4)) continue;
        if (type === 'quarry' && !g.grid.hasTerrainNear(tx, ty, [C.TERRAIN.MOUNTAIN, C.TERRAIN.GOLD], 4)) continue;
        return { tx, ty };
      }
    }
    return null;
  }

  // ---- workers ----
  manageWorkers() {
    const g = this.g;
    const workers = [], sites = [];
    for (const e of g.entities.values()) {
      if (e.side !== SIDE) continue;
      if (e.kind === C.KIND.UNIT && e.type === 'worker') workers.push(e);
      else if (e.kind === C.KIND.BUILDING && e.type !== 'road' && e.progress < 1) sites.push(e);
    }
    const idle = workers.filter((w) => w.state === C.ST.IDLE && !w.job);

    // Builders first: keep each active site staffed.
    for (const s of sites) {
      let cur = this.buildersOn(s.id, workers);
      while (cur < BUILDERS_PER_SITE && idle.length) { units.orderBuild(g, idle.pop(), s); cur++; }
    }
    // Remaining idlers gather by ratio.
    for (const w of idle) this.assignGather(w, workers);
    // Assignments are sticky, so drift from the target ratio accumulates (e.g. everyone on wood,
    // stone/gold starved, build chain deadlocked). Retask at most one worker per second.
    this.rebalanceOne(workers);

    // Train workers toward the eco target when houses aren't spawning fast enough.
    if (workers.length < this.diff.ecoWorkers) {
      const tc = units.findOwn(g, SIDE, 'tc');
      const pop = g.pop[SIDE];
      if (tc && tc.queue.length === 0 && g.res[SIDE].f > 90 && pop.cur < pop.cap) {
        buildings.train(g, SIDE, tc.id, 'worker');
      }
    }
  }

  buildersOn(siteId, workers) {
    let n = 0;
    for (const w of workers) if (w.job && w.job.type === 'build' && w.job.id === siteId) n++;
    return n;
  }

  // Bucket sizes (and per-bucket worker lists) for current gather assignments.
  gatherCounts(workers) {
    const g = this.g;
    const lists = { w: [], f: [], s: [] };
    for (const o of workers) {
      const j = o.job;
      if (!j) continue;
      if (j.type === 'farm') lists.f.push(o);
      else if (j.type === 'gather') {
        const n = g.nodesById.get(j.nodeId);
        if (n) { if (n.res === 'w') lists.w.push(o); else if (n.res === 'f') lists.f.push(o); else lists.s.push(o); }
      }
    }
    return lists;
  }

  ratios() {
    const opening = this.phase === 'OPENING';
    return { w: opening ? 0.5 : 0.35, f: opening ? 0.3 : 0.4, s: opening ? 0.2 : 0.25 };
  }

  rebalanceOne(workers) {
    const g = this.g;
    const L = this.gatherCounts(workers), R = this.ratios();
    const tot = L.w.length + L.f.length + L.s.length;
    if (tot < 4) return;
    const def = { w: R.w * tot - L.w.length, f: R.f * tot - L.f.length, s: R.s * tot - L.s.length };
    let need = 'w', spare = 'w';
    for (const k of ['f', 's']) { if (def[k] > def[need]) need = k; if (def[k] < def[spare]) spare = k; }
    if (def[need] < 1.5 || need === spare || !L[spare].length) return;
    const w = L[spare][0];
    if (need === 'f') {
      const farm = this.freeFarm();
      if (farm) { units.orderFarm(g, w, farm); return; }
      const node = units.findNearestNode(g, 'f', w.x, w.y, 70);
      if (node) units.orderGatherNode(g, w, node);
      return;
    }
    if (need === 's') {
      const wantGold = g.res[SIDE].g <= g.res[SIDE].s;
      const node = units.findNearestNode(g, wantGold ? 'g' : 's', w.x, w.y, 70) ||
        units.findNearestNode(g, wantGold ? 's' : 'g', w.x, w.y, 70);
      if (node) units.orderGatherNode(g, w, node);
      return;
    }
    const node = units.findNearestNode(g, 'w', w.x, w.y, 70);
    if (node) units.orderGatherNode(g, w, node);
  }

  assignGather(w, workers) {
    const g = this.g;
    const L = this.gatherCounts(workers);
    const cw = L.w.length, cf = L.f.length, cs = L.s.length;
    // §6 specifies 50/30/20 wood/food/stone+gold for OPENING only; once the base stands, food
    // (army + upkeep) and gold (soldiers) are the bottlenecks, so shift the ratios.
    const opening = this.phase === 'OPENING';
    const rw = opening ? 0.5 : 0.35, rf = opening ? 0.3 : 0.4, rs = opening ? 0.2 : 0.25;
    const tot = cw + cf + cs + 1;
    const dw = rw * tot - cw, df = rf * tot - cf, ds = rs * tot - cs;
    let pick = 'w';
    if (df >= dw && df >= ds) pick = 'f';
    else if (ds >= dw && ds >= df) pick = 's';

    if (pick === 'f') {
      const farm = this.freeFarm();
      if (farm) { units.orderFarm(g, w, farm); return; }
      pick = 'w';   // no farm slot: fall back to wood
    }
    if (pick === 's') {
      // 20% bucket covers both stone and gold; chase whichever we're shorter on.
      const wantGold = g.res[SIDE].g < g.res[SIDE].s;
      const node = units.findNearestNode(g, wantGold ? 'g' : 's', w.x, w.y, 70) ||
        units.findNearestNode(g, wantGold ? 's' : 'g', w.x, w.y, 70);
      if (node) { units.orderGatherNode(g, w, node); return; }
    }
    const wood = units.findNearestNode(g, 'w', w.x, w.y, 70);
    if (wood) units.orderGatherNode(g, w, wood);
  }

  freeFarm() {
    for (const b of this.g.entities.values()) {
      if (b.side === SIDE && b.kind === C.KIND.BUILDING && b.type === 'farm' && b.progress >= 1 && !b.workerId) return b;
    }
    return null;
  }

  // ---- army ----
  manageArmy() {
    const now = this.now();
    const defending = now < this.defendUntil;
    this.trainArmy();

    const army = this.armyUnits();
    if (defending) {
      if (this.defendDirty) {
        const tgt = this.g.entities.get(this.defendTargetId);
        const pt = tgt ? { tx: tgt.x | 0, ty: tgt.y | 0 } : this.site;
        for (const u of army) units.orderAttackMove(this.g, u, pt.tx, pt.ty);
        this.defendDirty = false;
        this.attacking = false; this.armyTargetId = 0;
      }
      return;
    }

    if (this.attacking) {
      if (army.length === 0) { this.attacking = false; this.armyTargetId = 0; }
      else this.sendArmy(army);
      return;
    }
    // Launch when the full wave is assembled at wave time; if the economy could not produce the
    // full wave within half an extra interval, go anyway with what exists (keeps pressure honest).
    const ready = army.length >= this.waveSize;
    const overdue = now >= this.nextAttackAt + this.diff.waveInterval * 0.5 &&
      army.length >= Math.max(4, Math.floor(this.waveSize / 2));
    if (now >= this.nextAttackAt && (ready || overdue)) {
      this.attacking = true;
      this.sendArmy(army);
      this.nextAttackAt = now + this.diff.waveInterval;
      this.waveSize = Math.min(this.diff.waveCap, this.waveSize + this.diff.waveGrowth);
    }
  }

  trainArmy() {
    const g = this.g;
    const target = this.waveSize + 4;
    if (!this.attacking && this.armyStrength() >= target) return;
    const reserve = this.eraReserve();   // bank the next era's cost instead of over-training
    for (const b of g.entities.values()) {
      if (b.side !== SIDE || b.kind !== C.KIND.BUILDING || b.progress < 1) continue;
      if (!MIL_UNITS[b.type] || b.queue.length >= 2) continue;
      const u = this.pickUnit(b.type);
      if (!u) continue;
      if (reserve && !this.affordsAbove(u, reserve)) continue;   // save up for era advance
      buildings.train(g, SIDE, b.id, u);   // err (pop/cost) ignored
    }
  }

  // Resource floor to keep banked for the next era (null once maxed or already researching).
  eraReserve() {
    const g = this.g;
    if (g.era[SIDE] >= this.diff.maxEra || g.eraP[SIDE]) return null;
    const c = ERAS[g.era[SIDE]].cost, m = this.diff.eraCostMult;
    return { f: c.f * m, w: c.w * m, s: c.s * m, g: c.g * m };
  }

  // True if training `u` still leaves every resource at/above the era reserve.
  affordsAbove(u, r) {
    const c = UNITS[u].cost, res = this.g.res[SIDE];
    return res.f - c.f >= r.f && res.w - c.w >= r.w && res.s - c.s >= r.s && res.g - c.g >= r.g;
  }

  pickUnit(bt) {
    const opts = MIL_UNITS[bt];
    for (const u of opts) {
      if (UNITS[u].era > this.g.era[SIDE]) continue;   // era-locked unit
      if (economy.canAfford(this.g.res[SIDE], UNITS[u].cost)) return u;
    }
    return null;
  }

  sendArmy(army) {
    const tgt = this.nearestPlayerBuilding();
    if (!tgt) { this.attacking = false; return; }
    if (this.armyTargetId === tgt.id) {
      for (const u of army) if (!u.atk && !u.am) units.orderAttackTarget(this.g, u, tgt);
      return;
    }
    this.armyTargetId = tgt.id;
    for (const u of army) units.orderAttackTarget(this.g, u, tgt);
  }

  nearestPlayerBuilding() {
    let best = null, bd = Infinity;
    for (const b of this.g.entities.values()) {
      if (b.kind !== C.KIND.BUILDING || b.side !== C.SIDE.PLAYERS || b.type === 'road' || b.progress < 1) continue;
      const d = (b.x - this.site.tx) ** 2 + (b.y - this.site.ty) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  armyUnits() {
    const out = [];
    for (const e of this.g.entities.values()) {
      if (e.side === SIDE && e.kind === C.KIND.UNIT && MILITARY.has(e.type)) out.push(e);
    }
    return out;
  }

  // Alive military + queued military (so the bot doesn't over-produce before a wave).
  armyStrength() {
    let n = this.armyUnits().length;
    for (const b of this.g.entities.values()) {
      if (b.side === SIDE && b.kind === C.KIND.BUILDING && b.queue) {
        for (const q of b.queue) if (MILITARY.has(q.unit)) n++;
      }
    }
    return n;
  }

  countBuildings() {
    const have = {};
    for (const b of this.g.entities.values()) {
      if (b.side !== SIDE || b.kind !== C.KIND.BUILDING || b.type === 'road') continue;
      have[b.type] = (have[b.type] || 0) + 1;
    }
    return have;
  }
}

const MILITARY = new Set(['militia', 'soldier', 'knight', 'archer', 'horseman', 'ram', 'catapult']);
// Preferred training order per military building (most valuable affordable unit first).
const MIL_UNITS = {
  barracks: ['soldier', 'militia'],
  range: ['archer'],
  stable: ['horseman'],
  siege: ['catapult', 'ram']
};

module.exports = Bot;
