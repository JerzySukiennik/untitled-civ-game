// UCG_CONST: global constants, ids, enums, message types, bot difficulty.
const UCG_CONST = {
  PORT: 8080,

  TICK_RATE: 12,
  TICK_MS: 1000 / 12,
  KEYFRAME_TICKS: 600,
  CURSOR_RATE: 10,

  TILE_PX: 16,
  MAP_W: 96,
  MAP_H: 56,

  ZOOM_MIN: 1.0,
  ZOOM_MAX: 3.0,
  ZOOM_DEFAULT: 2.0,

  UNIT_CAP_SIDE: 200,
  UNIT_CAP_TOTAL: 400,
  POP_CAP_TC: 10,
  POP_CAP_HOUSE: 5,
  POP_CAP_DISPLAY_MAX: 200,

  START_RES: { f: 200, w: 200, s: 100, g: 50 },

  // Resource ids (array order f,w,s,g)
  RES: { FOOD: 0, WOOD: 1, STONE: 2, GOLD: 3 },
  RES_KEYS: ['f', 'w', 's', 'g'],

  // Terrain ids
  TERRAIN: { GRASS: 0, FOREST: 1, MOUNTAIN: 2, WATER: 3, GOLD: 4, ROAD: 5 },

  // Per-tile resource yields
  YIELD: { FOREST_WOOD: 150, MOUNTAIN_STONE: 300, GOLD_TILE: 400 },

  // Resource nodes live in a separate id space from entities so a `gather` target
  // id is unambiguous (>= base means node, else building/unit entity).
  NODE_ID_BASE: 100000,

  // Entity kinds
  KIND: { UNIT: 'u', BUILDING: 'b' },

  // Sides
  SIDE: { PLAYERS: 0, BOTS: 1 },

  // Unit / entity state enum
  ST: {
    IDLE: 0, MOVE: 1, GATHER: 2, BUILD: 3, ATTACK: 4,
    DEAD: 5, FLEE: 6, TRADE: 7, CONSTRUCT: 8
  },

  // Lobby modes
  MODE: { NORMAL: 'normal', INTRO: 'intro', CREATIVE: 'creative' },

  // Bot difficulties
  DIFF: { EASY: 'easy', NORMAL: 'normal', HARD: 'hard' },

  // Eight lobby colors (hex)
  COLORS: [
    0x4a90e2, 0xd0021b, 0x7ed321, 0xf5a623,
    0x9013fe, 0x50e3c2, 0xffffff, 0xf8e71c
  ],

  // Message types (client <-> server)
  MSG: {
    JOIN: 'join', LOBBY_SET: 'lobby_set', START: 'start', CURSOR: 'cursor',
    PLACE: 'place', DEMOLISH: 'demolish', MOVE: 'move', GATHER: 'gather',
    TRAIN: 'train', CANCELQ: 'cancelq', RALLY: 'rally', RESEARCH: 'research', TRADE: 'trade',
    ADVANCE_ERA: 'advance_era', PAUSE: 'pause', PING: 'ping',
    WELCOME: 'welcome', LOBBY: 'lobby', SNAP: 'snap', DELTA: 'delta',
    CURSORS: 'cursors', PAUSED: 'paused', OVER: 'over', ERR: 'err', PONG: 'pong'
  },

  // Bot difficulty parameters (firstAttackAt/waveInterval in seconds)
  BOT_DIFF: {
    easy: {
      gatherRateMult: 0.7, freeTrickleF: 0, freeTrickleW: 0, ecoWorkers: 10,
      firstAttackAt: 720, waveInterval: 240, waveSizeStart: 4, waveGrowth: 2,
      waveCap: 40, maxEra: 3, rebuildEco: false, eraCostMult: 1.2
    },
    normal: {
      gatherRateMult: 1.0, freeTrickleF: 0, freeTrickleW: 0, ecoWorkers: 16,
      firstAttackAt: 480, waveInterval: 180, waveSizeStart: 8, waveGrowth: 3,
      waveCap: 40, maxEra: 5, rebuildEco: true, eraCostMult: 1.0
    },
    hard: {
      gatherRateMult: 1.3, freeTrickleF: 1, freeTrickleW: 1, ecoWorkers: 22,
      firstAttackAt: 330, waveInterval: 120, waveSizeStart: 12, waveGrowth: 4,
      waveCap: 40, maxEra: 5, rebuildEco: true, eraCostMult: 0.85
    }
  },

  // Combat / sim tuning
  AGGRO_RADIUS: 6,
  UPKEEP_INTERVAL_S: 10,
  CITIZEN_SPAWN_S: 20,
  CITIZEN_SPAWN_FOOD: 25
};

// Convert seconds to ticks.
UCG_CONST.secToTicks = function (sec) { return Math.round(sec * UCG_CONST.TICK_RATE); };

// Modifier keys that ADD to the base instead of multiplying it. Every other key multiplies.
// When merging a side's modifier map, additive keys sum (default 0), multiplicative keys
// multiply (default 1). See server/mods.js (rebuild) for the merge; stat() consumes the result.
UCG_CONST.ADD_KEYS = {
  workerCarry: 1, meleeDmgAdd: 1, archerDmgAdd: 1, archerRngAdd: 1,
  towerDmgAdd: 1, houseCapAdd: 1, popCapAdd: 1
};

// Single stat helper (server + client): returns `base` modified by the per-side modifier map.
// mods is { key: number }. Absent key => base unchanged. Additive keys (ADD_KEYS) add, the rest
// multiply. Shared so client tooltips can render modified values from the snapshot mods map.
UCG_CONST.stat = function (base, mods, key) {
  if (!mods) return base;
  const m = mods[key];
  if (typeof m !== 'number') return base;
  return UCG_CONST.ADD_KEYS[key] ? base + m : base * m;
};

if (typeof module !== 'undefined') module.exports = UCG_CONST;
