// UCG_CIVS: civ definitions (PLAN.md §4.5). color = hex tint. mods = per-side multiplier/adder map
// consumed by stat(). perks/weaknesses = human-readable summary for UI.
const UCG_CIVS = {
  townsfolk:   {
    id: 'townsfolk', name: 'Townsfolk', color: 0x4a90e2,
    mods: { goldRate: 1.25, tradeRate: 1.25, buildSpeed: 1.15, militaryHp: 0.9 },
    perks: 'Gold gather & trade x1.25; build speed x1.15.', weaknesses: 'Military unit HP x0.9.'
  },
  vikings:     {
    id: 'vikings', name: 'Vikings', color: 0xd0021b,
    mods: { infantryDmg: 1.2, woodRate: 1.2, foodRate: 0.85, defenseHp: 0.8 },
    perks: 'Infantry dmg x1.2; wood rate x1.2.', weaknesses: 'Food rate x0.85; wall/tower/gate HP x0.8.'
  },
  highlanders: {
    id: 'highlanders', name: 'Highlanders', color: 0x6b8e6b,
    mods: { stoneRate: 1.3, defenseHp: 1.3, unitSpeed: 0.9, goldRate: 0.85 },
    perks: 'Stone rate x1.3; wall/tower/gate HP x1.3.', weaknesses: 'All unit speed x0.9; gold rate x0.85.'
  },
  steppe:      {
    id: 'steppe', name: 'Steppe Nomads', color: 0xf5a623,
    mods: { unitSpeed: 1.15, horsemanHp: 1.2, horsemanDmg: 1.2, spawnInterval: 0.8, buildingHp: 0.85, stoneRate: 0.8 },
    perks: 'All unit speed x1.15; horseman HP & dmg x1.2; citizen spawn x0.8.', weaknesses: 'Building HP x0.85; stone rate x0.8.'
  },
  artisans:    {
    id: 'artisans', name: 'Artisans', color: 0x9013fe,
    mods: { researchTime: 0.7, eraTime: 0.7, techCost: 0.8, earlyTrainTime: 1.25 },
    perks: 'Research & era time x0.7; tech cost x0.8.', weaknesses: 'Military train time in eras 1-2 x1.25.'
  }
};

if (typeof module !== 'undefined') module.exports = UCG_CIVS;
