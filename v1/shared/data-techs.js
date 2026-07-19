// UCG_TECHS: 16 techs, 4 branches, all at Library (PLAN.md §4.4). cost = {f,w,s,g}, time in s.
// mods = per-side multiplier/adder map consumed by stat(); requires = prerequisite building ids.
const UCG_TECHS = {
  eco1: { id: 'eco1', name: 'Sharp Axes',        branch: 'Economy',      era: 2, cost: { f: 100, w: 50,  s: 0,   g: 0   }, time: 30, mods: { woodRate: 1.2 },                       desc: 'Wood gather rate x1.2.' },
  eco2: { id: 'eco2', name: 'Crop Rotation',     branch: 'Economy',      era: 3, cost: { f: 150, w: 75,  s: 0,   g: 0   }, time: 40, mods: { foodRate: 1.25 },                      desc: 'Food gather rate x1.25.' },
  eco3: { id: 'eco3', name: 'Wheelbarrow',       branch: 'Economy',      era: 3, cost: { f: 175, w: 100, s: 0,   g: 0   }, time: 45, mods: { workerCarry: 5, workerSpeed: 1.1 },    desc: 'Worker carry +5 (15), worker speed x1.1.' },
  eco4: { id: 'eco4', name: 'Coinage',           branch: 'Economy',      era: 4, cost: { f: 200, w: 0,   s: 0,   g: 100 }, time: 50, mods: { goldRate: 1.25, tradeRate: 1.25 },    desc: 'Gold gather & cart trade x1.25.' },
  mil1: { id: 'mil1', name: 'Forged Blades',     branch: 'Military',     era: 2, cost: { f: 100, w: 0,   s: 0,   g: 75  }, time: 40, mods: { meleeDmgAdd: 2 },                      desc: 'Melee unit dmg +2.' },
  mil2: { id: 'mil2', name: 'Fletching',         branch: 'Military',     era: 3, cost: { f: 125, w: 0,   s: 0,   g: 75  }, time: 40, mods: { archerDmgAdd: 2, archerRngAdd: 1, towerDmgAdd: 2 }, desc: 'Archer +2 dmg, +1 range; towers +2 dmg.' },
  mil3: { id: 'mil3', name: 'Iron Armor',        branch: 'Military',     era: 4, cost: { f: 200, w: 0,   s: 0,   g: 150 }, time: 50, requires: 'smith', mods: { militaryHp: 1.25 },  desc: 'All military unit HP x1.25 (requires Blacksmith).' },
  mil4: { id: 'mil4', name: 'Siegecraft',        branch: 'Military',     era: 5, cost: { f: 0,   w: 250, s: 0,   g: 200 }, time: 60, mods: { siegeVsBuilding: 1.5 },                desc: 'Siege dmg vs buildings x1.5.' },
  con1: { id: 'con1', name: 'Masonry',           branch: 'Construction', era: 2, cost: { f: 0,   w: 100, s: 50,  g: 0   }, time: 35, mods: { buildingHp: 1.2 },                     desc: 'Building HP x1.2.' },
  con2: { id: 'con2', name: 'Fortification',     branch: 'Construction', era: 3, cost: { f: 0,   w: 150, s: 100, g: 0   }, time: 45, mods: { defenseHp: 1.5 },                      desc: 'Wall/tower/gate HP x1.5.' },
  con3: { id: 'con3', name: 'Engineering',       branch: 'Construction', era: 4, cost: { f: 0,   w: 200, s: 150, g: 0   }, time: 50, mods: { buildSpeed: 1.3, buildingCost: 0.9 },  desc: 'Build speed x1.3, building costs x0.9.' },
  con4: { id: 'con4', name: 'Grand Architecture', branch: 'Construction', era: 5, cost: { f: 0,  w: 300, s: 200, g: 0   }, time: 60, mods: { buildingHp2: 1.3, wonderCost: 0.75 }, desc: 'Building HP additional x1.3; wonder cost x0.75.' },
  pop1: { id: 'pop1', name: 'Housing',           branch: 'Population',    era: 2, cost: { f: 75,  w: 50,  s: 0,   g: 0   }, time: 30, mods: { houseCapAdd: 2 },                      desc: '+2 pop cap per house (7).' },
  pop2: { id: 'pop2', name: 'Medicine',          branch: 'Population',    era: 3, cost: { f: 125, w: 0,   s: 0,   g: 50  }, time: 40, mods: { spawnInterval: 0.8 },                  desc: 'Citizen spawn interval x0.8.' },
  pop3: { id: 'pop3', name: 'Drill',             branch: 'Population',    era: 4, cost: { f: 150, w: 0,   s: 0,   g: 100 }, time: 45, mods: { unitSpeed: 1.1 },                     desc: 'All unit move speed x1.1.' },
  pop4: { id: 'pop4', name: 'Census',            branch: 'Population',    era: 5, cost: { f: 200, w: 0,   s: 0,   g: 150 }, time: 55, mods: { popCapAdd: 25 },                       desc: '+25 flat pop cap.' }
};

if (typeof module !== 'undefined') module.exports = UCG_TECHS;
