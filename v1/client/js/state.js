// UCG.State: authoritative-mirror. Applies snapshots/deltas onto a local entity map + lobby/game state.
window.UCG = window.UCG || {};
(function (UCG) {
  const C = UCG_CONST;
  // Initial per-tile node amounts by resource key (PLAN §3) — for depletion darkening threshold.
  const NODE_INIT = { w: C.YIELD.FOREST_WOOD, s: C.YIELD.MOUNTAIN_STONE, g: C.YIELD.GOLD_TILE };

  const State = {
    playerId: null,
    lobby: { players: [], civ: 'townsfolk', mode: 'normal', difficulty: 'normal', started: false },
    started: false,

    map: null,                 // { w, h, tiles, nodes }
    civs: { player: 'townsfolk', bot: 'vikings' },
    mode: 'normal',
    difficulty: 'normal',

    entities: new Map(),
    nodes: new Map(),          // node id -> {id,res,tx,ty,amt}
    nodesByTile: new Map(),    // ty*W+tx -> node
    tilesDirty: [],            // tile indices whose terrain changed (consumed by game-scene)
    minimapDirty: [],          // same list, consumed independently by the minimap re-bake
    nodeFadeDirty: [],         // tiles whose node just dropped below 25% (depletion darkening)
    res: { f: 0, w: 0, s: 0, g: 0 },
    pop: { cur: 0, cap: 0 },
    era: 1,
    techs: [],                 // researched tech ids (players side)
    mods: {},                  // players-side modifier map (for tooltips)
    eraP: null,                // active era research { target, endTick } | null
    techA: null,               // active tech research { tech, endTick } | null
    techQ: [],                 // queued tech ids
    tooltipsOff: false,
    tick: 0,
    paused: false,
    cursors: [],
    events: [],                // transient events from last delta (SFX/flash)
    deadInfo: new Map(),       // id -> {k,side,type,x,y} captured just before deletion (audio/FX)

    lastTickTime: 0,

    handle(msg) {
      switch (msg.t) {
        case C.MSG.WELCOME: return this.onWelcome(msg);
        case C.MSG.LOBBY: return this.onLobby(msg);
        case C.MSG.START: return this.onStart(msg);
        case C.MSG.SNAP: return this.onSnap(msg);
        case C.MSG.DELTA: return this.onDelta(msg);
        case C.MSG.CURSORS: this.cursors = msg.players || []; return;
        case C.MSG.PAUSED: this.paused = msg.paused; return;
      }
    },

    onWelcome(msg) {
      this.playerId = msg.playerId;
      if (msg.token) window.sessionStorage.setItem('ucg_token', msg.token);
      if (msg.lobby) this.onLobby(msg.lobby);
    },

    onLobby(msg) {
      this.lobby = {
        players: msg.players || [], civ: msg.civ, mode: msg.mode,
        difficulty: msg.difficulty, started: !!msg.started
      };
    },

    onStart(msg) {
      this.map = msg.map;
      this.nodes.clear();
      this.nodesByTile.clear();
      for (const n of msg.map.nodes) {
        if (n.amt <= 0) continue;
        this.nodes.set(n.id, n);
        this.nodesByTile.set(n.ty * msg.map.w + n.tx, n);
      }
      this.civs = msg.civs;
      this.mode = msg.mode;
      this.difficulty = msg.difficulty;
      this.tooltipsOff = !!msg.tooltipsOff;
      this.tick = msg.tick || 0;
      this.entities.clear();
      this.started = true;
      this.lastTickTime = performance.now();
    },

    onSnap(msg) {
      this.entities.clear();
      for (const e of msg.entities) this.addEntity(e);
      this.res = msg.res || this.res;
      this.pop = msg.pop || this.pop;
      this.era = msg.era || this.era;
      this.techs = msg.techs || this.techs;
      if (msg.mods) this.mods = msg.mods;
      this.eraP = msg.eraP || null;
      this.techA = msg.techA || null;
      this.techQ = msg.techQ || [];
      this.tick = msg.tick;
      this.lastTickTime = performance.now();
    },

    onDelta(msg) {
      this.deadInfo.clear();
      if (msg.add) for (const e of msg.add) this.addEntity(e);
      if (msg.upd) for (const u of msg.upd) this.updEntity(u);
      if (msg.del) for (const id of msg.del) {
        const e = this.entities.get(id);
        if (e) this.deadInfo.set(id, { k: e.k, side: e.side, type: e.type, x: e.x, y: e.y });
        this.entities.delete(id);
      }
      if (msg.res) this.res = msg.res;
      if (msg.pop) this.pop = msg.pop;
      if (msg.era !== undefined) this.era = msg.era;
      if (msg.techs) this.techs = msg.techs;
      if (msg.mods) this.mods = msg.mods;
      if (msg.eraP !== undefined) this.eraP = msg.eraP;
      if (msg.techA !== undefined) this.techA = msg.techA;
      if (msg.techQ !== undefined) this.techQ = msg.techQ;
      if (msg.nodes) {
        for (const nu of msg.nodes) {
          const n = this.nodes.get(nu.id);
          if (!n) continue;
          const init = NODE_INIT[n.res] || 1;
          const wasLow = n.amt < init * 0.25;
          n.amt = nu.amt;
          if (!wasLow && n.amt < init * 0.25 && this.map) {
            this.nodeFadeDirty.push(n.ty * this.map.w + n.tx);
          }
        }
      }
      this.events = msg.ev || [];
      for (const ev of this.events) {
        if (ev.e === 'node_depleted') this.onNodeDepleted(ev);
      }
      this.tick = msg.tick;
      this.lastTickTime = performance.now();
    },

    onNodeDepleted(ev) {
      const i = ev.ty * this.map.w + ev.tx;
      this.map.tiles[i] = C.TERRAIN.GRASS;
      this.tilesDirty.push(i);
      this.minimapDirty.push(i);
      this.nodes.delete(ev.id);
      this.nodesByTile.delete(i);
    },

    addEntity(e) {
      e.hist = [{ t: this.tick, x: e.x, y: e.y }];
      this.entities.set(e.id, e);
    },

    updEntity(u) {
      const e = this.entities.get(u.id);
      if (!e) return;
      if (u.x !== undefined) { e.x = u.x; e.y = u.y; e.hist.push({ t: this.tick, x: u.x, y: u.y }); if (e.hist.length > 4) e.hist.shift(); }
      if (u.hp !== undefined) e.hp = u.hp;
      if (u.st !== undefined) e.st = u.st;
      if (u.progress !== undefined) e.progress = u.progress;
      if (u.q !== undefined) e.q = u.q;
    },

    civColor(side) {
      const civId = side === C.SIDE.BOTS ? this.civs.bot : this.civs.player;
      const civ = UCG_CIVS[civId];
      return civ ? civ.color : 0xffffff;
    },

    playerColor(id) {
      const p = this.lobby.players.find((x) => x.id === id);
      return p ? p.color : 0xffffff;
    },

    isHost() {
      const p = this.lobby.players.find((x) => x.id === this.playerId);
      return p ? p.host : false;
    }
  };

  UCG.State = State;
})(window.UCG);
