// UCG_BUILDINGS: building definitions (PLAN.md §4.1). cost = {f,w,s,g}. foot = [w,h] tiles.
// buildTime in seconds at 1 worker. Do not mutate at runtime; use stat() for modified values.
const UCG_BUILDINGS = {
  tc:         { id: 'tc',         name: 'Town Center',     era: 1, cost: { f: 0,   w: 400, s: 200, g: 0   }, hp: 2400, foot: [4, 4], buildTime: 90,  desc: 'Drop-off all; trains Worker; era research; +10 pop cap.' },
  house:      { id: 'house',      name: 'House',           era: 1, cost: { f: 0,   w: 50,  s: 0,   g: 0   }, hp: 400,  foot: [2, 2], buildTime: 20,  desc: '+5 pop cap; citizens auto-spawn.' },
  farm:       { id: 'farm',       name: 'Farm',            era: 1, cost: { f: 0,   w: 60,  s: 0,   g: 0   }, hp: 300,  foot: [2, 2], buildTime: 15,  desc: 'On grass; 1 worker slot; infinite food at 0.8/s.' },
  lumber:     { id: 'lumber',     name: 'Lumber Camp',     era: 1, cost: { f: 0,   w: 50,  s: 0,   g: 0   }, hp: 350,  foot: [2, 2], buildTime: 15,  desc: 'Drop-off wood; must be within 4 tiles of a forest tile.' },
  quarry:     { id: 'quarry',     name: 'Mining Camp',     era: 1, cost: { f: 0,   w: 50,  s: 0,   g: 0   }, hp: 350,  foot: [2, 2], buildTime: 15,  desc: 'Drop-off stone+gold; within 4 tiles of mountain/gold.' },
  barracks:   { id: 'barracks',   name: 'Barracks',        era: 1, cost: { f: 0,   w: 120, s: 0,   g: 0   }, hp: 800,  foot: [3, 3], buildTime: 30,  desc: 'Trains Militia/Soldier/Knight.' },
  road:       { id: 'road',       name: 'Road',            era: 1, cost: { f: 0,   w: 2,   s: 0,   g: 0   }, hp: 100,  foot: [1, 1], buildTime: 0,   instant: true, desc: 'Walkable, speed x1.5 for all units; built instantly on payment.' },
  storehouse: { id: 'storehouse', name: 'Storehouse',      era: 2, cost: { f: 0,   w: 80,  s: 0,   g: 0   }, hp: 500,  foot: [2, 2], buildTime: 20,  desc: 'Drop-off all.' },
  granary:    { id: 'granary',    name: 'Granary',         era: 2, cost: { f: 0,   w: 80,  s: 0,   g: 0   }, hp: 500,  foot: [2, 2], buildTime: 20,  desc: 'Drop-off food; +5% global food gather rate (max 2).' },
  library:    { id: 'library',    name: 'Library',         era: 2, cost: { f: 0,   w: 120, s: 0,   g: 40  }, hp: 600,  foot: [3, 3], buildTime: 35,  desc: 'Researches all 16 techs.' },
  wall:       { id: 'wall',       name: 'Wall',            era: 2, cost: { f: 0,   w: 0,   s: 10,  g: 0   }, hp: 600,  foot: [1, 1], buildTime: 6,   desc: 'Blocks movement; drag-place segments.' },
  gate:       { id: 'gate',       name: 'Gate',            era: 2, cost: { f: 0,   w: 0,   s: 30,  g: 0   }, hp: 500,  foot: [1, 2], buildTime: 10,  desc: 'Wall segment passable by own side.' },
  tower:      { id: 'tower',      name: 'Watchtower',      era: 2, cost: { f: 0,   w: 0,   s: 80,  g: 0   }, hp: 800,  foot: [2, 2], buildTime: 25,  desc: 'Auto-attack: 8 dmg, range 7, 1 shot/s.' },
  range:      { id: 'range',      name: 'Archery Range',   era: 2, cost: { f: 0,   w: 130, s: 0,   g: 0   }, hp: 700,  foot: [3, 3], buildTime: 30,  desc: 'Trains Archer.' },
  market:     { id: 'market',     name: 'Market',          era: 3, cost: { f: 0,   w: 100, s: 0,   g: 50  }, hp: 600,  foot: [3, 3], buildTime: 35,  desc: 'Trade UI; cart route endpoint.' },
  stable:     { id: 'stable',     name: 'Stable',          era: 3, cost: { f: 0,   w: 150, s: 0,   g: 50  }, hp: 800,  foot: [3, 3], buildTime: 35,  desc: 'Trains Horseman.' },
  smith:      { id: 'smith',      name: 'Blacksmith',      era: 3, cost: { f: 0,   w: 100, s: 50,  g: 0   }, hp: 600,  foot: [2, 2], buildTime: 30,  desc: 'Prerequisite for era 4 + military techs M3/M4.' },
  temple:     { id: 'temple',     name: 'Temple',          era: 3, cost: { f: 0,   w: 150, s: 100, g: 0   }, hp: 700,  foot: [2, 2], buildTime: 35,  desc: '+10 pop cap; heals own units 1 HP/s within 6 tiles.' },
  cartdepot:  { id: 'cartdepot',  name: 'Cart Depot',      era: 3, cost: { f: 0,   w: 150, s: 0,   g: 0   }, hp: 700,  foot: [3, 3], buildTime: 35,  desc: 'Trains Cart (max 4 alive per depot).' },
  siege:      { id: 'siege',      name: 'Siege Workshop',  era: 4, cost: { f: 0,   w: 200, s: 100, g: 0   }, hp: 900,  foot: [3, 3], buildTime: 40,  desc: 'Trains Ram/Catapult.' },
  wonder:     { id: 'wonder',     name: 'Wonder',          era: 5, cost: { f: 200, w: 500, s: 500, g: 300 }, hp: 3000, foot: [4, 4], buildTime: 150, desc: 'While complete: +25% all gather rates.' }
};

if (typeof module !== 'undefined') module.exports = UCG_BUILDINGS;
