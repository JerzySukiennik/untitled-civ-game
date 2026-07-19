// Game: authoritative sim. Fixed 12 Hz tick loop with drift correction, pause, command queue,
// entity model with dirty-flag deltas. Stage B: pathfinding, full economy (gather/build/farm/
// carts/upkeep), construction sites, training queues, market trade.
const C = require('../shared/constants.js');
const BUILDINGS = require('../shared/data-buildings.js');
const UNITS = require('../shared/data-units.js');
const mapgen = require('./mapgen.js');
const Grid = require('./grid.js');
const Pathfinder = require('./pathfinding.js');
const snapshot = require('./snapshot.js');
const economy = require('./economy.js');
const units = require('./units.js');
const combat = require('./combat.js');
const buildings = require('./buildings.js');
const mods = require('./mods.js');
const TECHS = require('../shared/data-techs.js');
const Bot = require('./bot.js');
const { MSG } = require('./protocol.js');

const D = snapshot.DIRTY;
const DT = 1 / C.TICK_RATE;      // sim seconds per tick

class Game {
  constructor(opts) {
    this.mode = opts.mode || C.MODE.NORMAL;
    this.difficulty = opts.difficulty || C.DIFF.NORMAL;
    this.civs = opts.civs || { player: 'townsfolk', bot: 'vikings' };
    this.seed = opts.seed >>> 0;

    const m = mapgen.generate(this.seed);
    this.tiles = m.tiles;
    this.nodes = m.nodes;
    this.citySites = m.citySites;
    this.grid = new Grid(this.tiles);
    this.pathfinder = new Pathfinder(this.grid);
    this.nodesById = new Map();
    for (const n of this.nodes) this.nodesById.set(n.id, n);

    this.entities = new Map();
    this.nextId = 1;
    this._builderCounts = new Map();  // scratch for buildings.stepConstruction

    this.res = [{ ...C.START_RES }, { ...C.START_RES }];
    this.pop = [{ cur: 0, cap: 0 }, { cur: 0, cap: 0 }];
    this.era = [1, 1];
    this.techs = [[], []];
    this.era5 = [false, false];              // Era 5 combat bonus reached, per side
    this.mods = [null, null];                // per-side modifier map (mods.rebuild)
    this.eraP = [null, null];                // active era research: { target, endTick } | null
    this.techA = [null, null];               // active tech research: { tech, endTick } | null
    this.techQ = [[], []];                   // queued (not yet active) tech ids, per side
    this.eco = [
      { spawnT: 0, upkeepT: 0, starving: false },
      { spawnT: 0, upkeepT: 0, starving: false }
    ];

    this.resDirty = [false, false];
    this.popDirty = [false, false];
    this.eraDirty = [false, false];
    this.techsDirty = [false, false];
    this.modsDirty = [false, false];
    this.eraPDirty = [false, false];
    this.researchDirty = [false, false];     // techA/techQ changed

    // Creative: grant every era + tech to both sides up-front so all placement/training is open.
    if (this.mode === C.MODE.CREATIVE) {
      for (let s = 0; s < 2; s++) {
        this.era[s] = 5; this.era5[s] = true;
        this.techs[s] = Object.keys(TECHS);
      }
    }
    // Build modifier maps before any entity is created so starting HP reflects civ/era-5 bonuses.
    mods.rebuild(this, C.SIDE.PLAYERS);
    mods.rebuild(this, C.SIDE.BOTS);

    this.pending = { add: new Set(), del: new Set(), ev: [], nodeUpd: new Set() };
    this.cmdQueue = [];
    this.cursors = new Map();

    this.tick = 0;
    this.paused = false;
    this.over = false;
    this.timer = null;

    // Bot difficulty gather scaling (players always 1.0). Set before spawns/economy touch it.
    const diff = C.BOT_DIFF[this.difficulty] || C.BOT_DIFF.normal;
    this.gatherMult = [1, diff.gatherRateMult];
    this.botAlert = null;                     // { targetId, tick } set when a bot building is hit
    this.onBroadcast = null;   // set by lobby: (jsonString) => void
    this.onErr = null;         // set by lobby: (playerId, msg) => void

    this.spawnStart(C.SIDE.PLAYERS, this.citySites.players);
    if (this.mode !== C.MODE.INTRO) this.spawnStart(C.SIDE.BOTS, this.citySites.bots);
    economy.recomputePopCap(this, C.SIDE.PLAYERS);
    economy.recomputePopCap(this, C.SIDE.BOTS);

    // Bot AI drives the BOTS side (never in Intro, which has no opponent).
    this.bot = (this.mode !== C.MODE.INTRO) ? new Bot(this) : null;
  }

  // ---- entity helpers ----
  addEntity(e) {
    e.id = this.nextId++;
    e.dirty = 0;
    this.entities.set(e.id, e);
    this.pending.add.add(e.id);
    return e;
  }

  createBuilding(type, side, tx, ty, completed) {
    const def = BUILDINGS[type];
    const [fw, fh] = def.foot;
    const e = {
      id: 0, kind: C.KIND.BUILDING, type, side,
      tx, ty, x: tx + fw / 2, y: ty + fh / 2,
      hp: 1, maxhp: def.hp,
      state: completed ? C.ST.IDLE : C.ST.CONSTRUCT,
      progress: completed ? 1 : 0, foot: [fw, fh],
      queue: [], rally: null, workerId: 0
    };
    mods.initMaxHp(this, e);                 // scale maxhp by side modifiers
    e.hp = completed ? e.maxhp : 1;
    if (type === 'tower' || type === 'temple') e.cooldown = 0;
    this.addEntity(e);
    if (type === 'road') this.grid.setRoad(tx, ty);
    else if (type === 'gate') {
      // Gate occupies its footprint but stays passable for its own side (walkability layer).
      for (let dy = 0; dy < fh; dy++) for (let dx = 0; dx < fw; dx++) this.grid.setGate(tx + dx, ty + dy, side);
    } else this.grid.stamp(tx, ty, fw, fh, e.id);
    if (completed) economy.recomputePopCap(this, side);
    return e;
  }

  createUnit(type, side, x, y) {
    const def = UNITS[type];
    const e = {
      id: 0, kind: C.KIND.UNIT, type, side, x, y,
      hp: def.hp, maxhp: def.hp, state: C.ST.IDLE,   // maxhp scaled by mods.initMaxHp below
      job: null, path: null, pathi: 0, blocked: 0, arriveAct: null,
      cargo: { res: null, amt: 0 }, cooldown: 0,
      homeId: 0, destId: 0, leg: 0,
      atk: 0, am: null, moveGoal: null       // combat: target id, attack-move goal, cached path goal
    };
    const wasFull = e.hp >= e.maxhp;
    mods.initMaxHp(this, e);                 // scale maxhp by side modifiers
    if (wasFull) e.hp = e.maxhp;
    this.addEntity(e);
    this.pop[side].cur++;
    this.popDirty[side] = true;
    return e;
  }

  killUnit(e) {
    units.releaseJob(this, e);
    this.entities.delete(e.id);
    this.pending.del.add(e.id);
    this.pending.ev.push({ e: 'die', id: e.id });
    this.pop[e.side].cur--;
    this.popDirty[e.side] = true;
  }

  killBuilding(b) {
    if (b.type === 'road') this.grid.clearRoad(b.tx, b.ty);
    else if (b.type === 'gate') {
      for (let dy = 0; dy < b.foot[1]; dy++) for (let dx = 0; dx < b.foot[0]; dx++) this.grid.clearGate(b.tx + dx, b.ty + dy);
    } else this.grid.unstamp(b.tx, b.ty, b.foot[0], b.foot[1]);
    this.entities.delete(b.id);
    this.pending.del.add(b.id);
    this.pending.ev.push({ e: 'die', id: b.id });
    economy.recomputePopCap(this, b.side);
  }

  nodeTouched(node) { this.pending.nodeUpd.add(node.id); }

  spawnStart(side, site) {
    // Town Center 4x4 anchored so its center sits on the site.
    const anchorX = site.tx - 2, anchorY = site.ty - 2;
    this.createBuilding('tc', side, anchorX, anchorY, true);
    // Four idle workers around the TC on walkable grass.
    const spots = [[3, 1], [3, 3], [-1, 1], [-1, 3]];
    let placed = 0;
    for (const [dx, dy] of spots) {
      const tx = anchorX + dx, ty = anchorY + dy;
      if (this.grid.isWalkable(tx, ty)) {
        this.createUnit('worker', side, tx + 0.5, ty + 0.5);
        placed++;
      }
    }
    // Fallback: fill remaining workers on any nearby walkable tile.
    for (let r = 1; placed < 4 && r < 8; r++) {
      for (let dy = -r; dy <= r && placed < 4; dy++)
        for (let dx = -r; dx <= r && placed < 4; dx++) {
          const tx = site.tx + dx, ty = site.ty + dy;
          if (this.grid.isWalkable(tx, ty)) { this.createUnit('worker', side, tx + 0.5, ty + 0.5); placed++; }
        }
    }
  }

  // ---- loop ----
  start() {
    console.log(`[game] start seed=${this.seed} mode=${this.mode} diff=${this.difficulty} civs=${this.civs.player}/${this.civs.bot}`);
    this.nextTickAt = Date.now();
    const half = Math.max(1, Math.floor(C.TICK_MS / 2));
    this.timer = setInterval(() => this.loop(), half);
  }

  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  loop() {
    const now = Date.now();
    let steps = 0;
    while (now >= this.nextTickAt && steps < 5) {
      this.nextTickAt += C.TICK_MS;
      this.step();
      steps++;
    }
    if (Date.now() - this.nextTickAt > 1000) this.nextTickAt = Date.now();
  }

  step() {
    const t0 = Date.now();
    this.processCommands();
    if (this.paused || this.over) return;

    if (this.mode === C.MODE.CREATIVE) {
      for (let s = 0; s < 2; s++) {
        this.res[s].f = this.res[s].w = this.res[s].s = this.res[s].g = 99999;
        this.resDirty[s] = true;
      }
    }

    this.tick++;
    // Tick order per PLAN §5: commands -> bot -> economy -> units -> combat -> buildings -> victory.
    if (this.bot && this.tick % 12 === 0) this.bot.think();
    economy.step(this, DT);
    units.step(this, DT);
    combat.step(this, DT);
    buildings.step(this, DT);
    if (this.tick % 6 === 0) this.checkVictory();

    if (this.tick % C.KEYFRAME_TICKS === 0) {
      this.broadcastSnap();
    } else {
      const d = snapshot.delta(this, C.SIDE.PLAYERS);
      this.broadcast(d);
    }
    snapshot.clearDirty(this);

    const dur = Date.now() - t0;
    if (dur > 20) console.warn(`[game] slow tick ${this.tick}: ${dur}ms`);
  }

  broadcast(obj) { if (this.onBroadcast) this.onBroadcast(JSON.stringify(obj)); }

  broadcastSnap() {
    // Keyframe: one full snapshot to all (players view of treasury).
    this.broadcast(snapshot.fullSnap(this, C.SIDE.PLAYERS));
  }

  // ---- commands ----
  queueCommand(playerId, side, msg) { this.cmdQueue.push({ playerId, side, msg }); }

  processCommands() {
    if (!this.cmdQueue.length) return;
    const queue = this.cmdQueue;
    this.cmdQueue = [];
    for (const cmd of queue) {
      const m = cmd.msg;
      this.actingPlayer = cmd.playerId;
      if (m.t === MSG.PAUSE) { this.applyPause(m.paused, cmd.playerId); continue; }
      if (this.paused) continue; // sim frozen: hold non-pause commands (dropped)
      let err = null;
      switch (m.t) {
        case MSG.PLACE: err = buildings.place(this, cmd.side, m.building, m.tx | 0, m.ty | 0); break;
        case MSG.DEMOLISH: err = buildings.demolish(this, cmd.side, m.id); break;
        case MSG.MOVE: err = this.applyMove(cmd.side, m); break;
        case MSG.GATHER: err = this.applyGather(cmd.side, m); break;
        case MSG.TRAIN: err = buildings.train(this, cmd.side, m.id, m.unit); break;
        case MSG.CANCELQ: err = buildings.cancelQueue(this, cmd.side, m.id, m.index); break;
        case MSG.RALLY: err = buildings.setRally(this, cmd.side, m.id, m.tx | 0, m.ty | 0); break;
        case MSG.TRADE: err = buildings.trade(this, cmd.side, m.give, m.get); break;
        case MSG.RESEARCH: err = buildings.research(this, cmd.side, m.tech); break;
        case MSG.ADVANCE_ERA: err = buildings.advanceEra(this, cmd.side); break;
        default: break;
      }
      if (err) this.err(cmd.side, err);
    }
  }

  ownUnits(side, ids) {
    const out = [];
    for (const id of ids) {
      const e = this.entities.get(id);
      if (e && e.kind === C.KIND.UNIT && e.side === side) out.push(e);
      if (out.length >= 60) break;   // sanity cap per command
    }
    return out;
  }

  applyMove(side, m) {
    const list = this.ownUnits(side, m.ids);
    if (!list.length) return null;

    // Focus-fire: right-click onto a specific enemy entity.
    if (m.target !== undefined) {
      const tgt = this.entities.get(m.target | 0);
      if (tgt && tgt.side !== side && !(tgt.kind === C.KIND.BUILDING && tgt.type === 'road')) {
        for (const e of list) {
          if (combat.isMilitary(e.type)) units.orderAttackTarget(this, e, tgt);
          else units.orderMove(this, e, tgt.x | 0, tgt.y | 0);
        }
        return null;
      }
    }

    const offs = this.pathfinder.formationOffsets(list.length);
    for (let i = 0; i < list.length; i++) {
      const tx = (m.tx | 0) + offs[i].dx, ty = (m.ty | 0) + offs[i].dy;
      if (m.attack && combat.isMilitary(list[i].type)) units.orderAttackMove(this, list[i], tx, ty);
      else units.orderMove(this, list[i], tx, ty);
    }
    return null;
  }

  applyGather(side, m) {
    const list = this.ownUnits(side, m.ids);
    if (!list.length) return null;
    const target = m.target | 0;
    if (target >= C.NODE_ID_BASE) {
      const node = this.nodesById.get(target);
      if (!node || node.amt <= 0) return 'nothing to gather there';
      for (const e of list) units.orderGatherNode(this, e, node);
      return null;
    }
    const b = this.entities.get(target);
    if (!b || b.kind !== C.KIND.BUILDING || b.side !== side) return 'invalid target';
    if (b.progress < 1) { for (const e of list) units.orderBuild(this, e, b); return null; }
    if (b.type === 'farm') {
      // One slot: first worker takes it, the rest just walk over.
      let assigned = false;
      for (const e of list) {
        if (!assigned && (!b.workerId || b.workerId === e.id)) { units.orderFarm(this, e, b); assigned = true; }
        else units.orderMove(this, e, b.tx, b.ty);
      }
      if (!assigned) return 'farm slot occupied';
      return null;
    }
    return 'cannot work that building';
  }

  applyPause(paused, byId) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.broadcast({ t: MSG.PAUSED, paused, by: byId });
    console.log(`[game] paused=${paused} by=${byId}`);
  }

  // Victory: a side with 0 completed buildings loses (roads excluded, walls/gates included).
  checkVictory() {
    if (this.mode === C.MODE.INTRO || this.over) return;
    let pl = 0, bo = 0;
    for (const b of this.entities.values()) {
      if (b.kind !== C.KIND.BUILDING || b.type === 'road' || b.progress < 1) continue;
      if (b.side === C.SIDE.PLAYERS) pl++; else bo++;
    }
    if (pl === 0 && bo === 0) return;
    if (bo === 0) this.endGame('players');
    else if (pl === 0) this.endGame('bots');
  }

  endGame(winner) {
    this.over = true;
    const stats = { tick: this.tick, seconds: Math.round(this.tick / C.TICK_RATE) };
    this.broadcast({ t: MSG.OVER, winner, stats });
    console.log(`[game] over winner=${winner} at tick ${this.tick}`);
  }

  err(side, msg) {
    if (side === C.SIDE.PLAYERS && this.onErr) this.onErr(this.actingPlayer, msg);
    return null;
  }

  setCursor(playerId, x, y) { this.cursors.set(playerId, { x, y }); }

  cursorPayload(connectedIds) {
    const players = [];
    for (const id of connectedIds) {
      const c = this.cursors.get(id);
      if (c) players.push({ id, x: Math.round(c.x * 16) / 16, y: Math.round(c.y * 16) / 16 });
    }
    return { t: MSG.CURSORS, players };
  }

  startPayload() {
    return {
      t: MSG.START,
      mode: this.mode,
      difficulty: this.difficulty,
      civs: this.civs,
      tooltipsOff: this.mode === C.MODE.INTRO,
      tick: this.tick,
      map: { w: C.MAP_W, h: C.MAP_H, tiles: Array.from(this.tiles), nodes: this.nodes }
    };
  }
}

module.exports = Game;
