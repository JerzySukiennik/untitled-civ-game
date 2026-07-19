// UCG_UNITS: unit definitions (PLAN.md §4.2). cost = {f,w,s,g}. spd tiles/s, rng tiles (1=melee),
// cd attack cooldown s, train s. Footprint radius 0.5 tile. Do not mutate; use stat() for modifiers.
const UCG_UNITS = {
  worker:   { id: 'worker',   name: 'Worker',   era: 1, source: 'tc',        cost: { f: 50, w: 0,   s: 0,  g: 0  }, hp: 40,  dmg: 2,  rng: 1, cd: 1, spd: 1.5, train: 15, carry: 10, gather: 1, desc: 'Carry 10; gathers 1/s; builds. Auto-spawns from houses.' },
  cart:     { id: 'cart',     name: 'Cart',     era: 3, source: 'cartdepot', cost: { f: 0,  w: 40,  s: 0,  g: 0  }, hp: 80,  dmg: 0,  rng: 0, cd: 0, spd: 2.0, train: 20, desc: 'Trade income; flees when attacked.' },
  militia:  { id: 'militia',  name: 'Militia',  era: 1, source: 'barracks',  cost: { f: 50, w: 10,  s: 0,  g: 0  }, hp: 60,  dmg: 6,  rng: 1, cd: 1, spd: 1.3, train: 12, desc: 'Basic infantry.' },
  soldier:  { id: 'soldier',  name: 'Soldier',  era: 2, source: 'barracks',  cost: { f: 60, w: 0,   s: 0,  g: 20 }, hp: 110, dmg: 10, rng: 1, cd: 1, spd: 1.3, train: 15, desc: 'Line infantry.' },
  knight:   { id: 'knight',   name: 'Knight',   era: 4, source: 'barracks',  cost: { f: 90, w: 0,   s: 0,  g: 45 }, hp: 200, dmg: 16, rng: 1, cd: 1, spd: 1.4, train: 20, desc: 'Heavy infantry.' },
  archer:   { id: 'archer',   name: 'Archer',   era: 2, source: 'range',     cost: { f: 40, w: 30,  s: 0,  g: 0  }, hp: 50,  dmg: 7,  rng: 5, cd: 1, spd: 1.4, train: 15, desc: 'Ranged.' },
  horseman: { id: 'horseman', name: 'Horseman', era: 3, source: 'stable',    cost: { f: 80, w: 0,   s: 0,  g: 30 }, hp: 140, dmg: 11, rng: 1, cd: 1, spd: 2.6, train: 18, desc: 'Fast cavalry.' },
  ram:      { id: 'ram',      name: 'Ram',      era: 4, source: 'siege',     cost: { f: 0,  w: 150, s: 40, g: 0  }, hp: 250, dmg: 4,  rng: 1, cd: 1, spd: 0.9, train: 25, vsBuilding: 8, desc: 'x8 dmg vs buildings (=32).' },
  catapult: { id: 'catapult', name: 'Catapult', era: 4, source: 'siege',     cost: { f: 0,  w: 150, s: 0,  g: 80 }, hp: 90,  dmg: 20, rng: 7, cd: 3, spd: 0.8, train: 30, vsBuilding: 4, splash: 1.5, minRange: 2, desc: 'x4 vs buildings; splash r=1.5 half dmg; min range 2.' }
};

if (typeof module !== 'undefined') module.exports = UCG_UNITS;
