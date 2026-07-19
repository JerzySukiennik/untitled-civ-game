// Mods: the per-side modifier system (PLAN.md §4.4/§4.5, Stage D). A side's modifier map is the
// merge of its civ mods, every researched tech's mods, and the Era 5 +10% HP/dmg bonus. Additive
// keys sum, multiplicative keys multiply (see UCG_CONST.ADD_KEYS + stat()). The map lives on
// game.mods[side]; it is rebuilt on any change and shipped in snapshots/deltas so client tooltips
// can show modified numbers. HP-affecting changes retro-apply proportionally to existing entities.
const C = require('../shared/constants.js');
const BUILDINGS = require('../shared/data-buildings.js');
const UNITS = require('../shared/data-units.js');
const TECHS = require('../shared/data-techs.js');
const CIVS = require('../shared/data-civs.js');

// Combat role sets (shared by mods + combat).
const MILITARY = new Set(['militia', 'soldier', 'knight', 'archer', 'horseman', 'ram', 'catapult']);
const INFANTRY = new Set(['militia', 'soldier', 'knight']);            // vikings infantryDmg
const MELEE = new Set(['militia', 'soldier', 'knight', 'horseman']);   // mil1 meleeDmgAdd
const DEFENSE_B = new Set(['wall', 'tower', 'gate']);                  // con2 / civ defenseHp

// Era 5 permanent bonus modelled as ordinary mod keys so it flows through stat() like the rest.
const ERA5_MODS = { era5Hp: 1.1, era5Dmg: 1.1 };

function mergeInto(dst, src) {
  for (const k in src) {
    if (C.ADD_KEYS[k]) dst[k] = (dst[k] || 0) + src[k];
    else dst[k] = (dst[k] || 1) * src[k];
  }
}

// Recompute game.mods[side] from civ + researched techs + era-5 flag. Marks modsDirty.
function rebuild(game, side) {
  const mods = {};
  const civId = side === C.SIDE.BOTS ? game.civs.bot : game.civs.player;
  const civ = CIVS[civId];
  if (civ) mergeInto(mods, civ.mods);
  for (const id of game.techs[side]) { const t = TECHS[id]; if (t && t.mods) mergeInto(mods, t.mods); }
  if (game.era5[side]) mergeInto(mods, ERA5_MODS);
  game.mods[side] = mods;
  game.modsDirty[side] = true;
}

// Total HP multiplier for one entity from its side's mods (buildings and units differ).
function entityHpMult(game, e) {
  const mods = game.mods[e.side];
  if (!mods) return 1;
  if (e.kind === C.KIND.BUILDING) {
    let m = C.stat(1, mods, 'buildingHp');       // con1 + civ (all buildings)
    m = C.stat(m, mods, 'buildingHp2');          // con4 (additional)
    if (DEFENSE_B.has(e.type)) m = C.stat(m, mods, 'defenseHp'); // con2 / vikings / highlanders
    return m;
  }
  let m = 1;
  if (MILITARY.has(e.type)) {
    m = C.stat(m, mods, 'militaryHp');           // mil3 / townsfolk
    m = C.stat(m, mods, 'era5Hp');               // era 5
  }
  if (e.type === 'horseman') m = C.stat(m, mods, 'horsemanHp'); // steppe
  return m;
}

// Base (unmodified) max HP for an entity type.
function baseHp(e) {
  return e.kind === C.KIND.BUILDING ? BUILDINGS[e.type].hp : UNITS[e.type].hp;
}

// Set an entity's maxhp at creation from base * current HP multiplier.
function initMaxHp(game, e) {
  e.maxhp = Math.round(baseHp(e) * entityHpMult(game, e));
  return e.maxhp;
}

// Retro-apply HP mult changes to all existing entities of a side, preserving current HP fraction.
function retroHp(game, side) {
  const D = require('./snapshot.js').DIRTY;
  for (const e of game.entities.values()) {
    if (e.side !== side || e.state === C.ST.DEAD) continue;
    const want = Math.round(baseHp(e) * entityHpMult(game, e));
    if (want === e.maxhp) continue;
    const frac = e.maxhp > 0 ? e.hp / e.maxhp : 1;
    e.maxhp = want;
    e.hp = Math.max(1, Math.round(want * frac));
    e.dirty |= D.HP;
  }
}

// Scaled building cost (con3 buildingCost / con4 wonderCost). Returns a fresh {f,w,s,g}.
function buildCost(mods, type, def) {
  const key = type === 'wonder' ? 'wonderCost' : 'buildingCost';
  return {
    f: Math.round(C.stat(def.cost.f, mods, key)),
    w: Math.round(C.stat(def.cost.w, mods, key)),
    s: Math.round(C.stat(def.cost.s, mods, key)),
    g: Math.round(C.stat(def.cost.g, mods, key))
  };
}

// Scaled tech cost (artisans techCost). Returns a fresh {f,w,s,g}.
function techCost(mods, tech) {
  return {
    f: Math.round(C.stat(tech.cost.f, mods, 'techCost')),
    w: Math.round(C.stat(tech.cost.w, mods, 'techCost')),
    s: Math.round(C.stat(tech.cost.s, mods, 'techCost')),
    g: Math.round(C.stat(tech.cost.g, mods, 'techCost'))
  };
}

module.exports = {
  MILITARY, INFANTRY, MELEE, DEFENSE_B, ERA5_MODS,
  rebuild, entityHpMult, initMaxHp, retroHp, buildCost, techCost
};
