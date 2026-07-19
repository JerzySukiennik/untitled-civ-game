// UCG_ERAS: era progression (PLAN.md §4.3). Researched at Town Center. cost = {f,w,s,g}, time in s.
// requires = human-readable + machine checks; unlocks = ids made available.
const UCG_ERAS = [
  {
    n: 1, name: 'Settlement', cost: { f: 0, w: 0, s: 0, g: 0 }, time: 0,
    requires: null,
    unlocks: ['tc', 'house', 'farm', 'lumber', 'quarry', 'barracks', 'road', 'worker', 'militia']
  },
  {
    n: 2, name: 'Village', cost: { f: 300, w: 150, s: 0, g: 0 }, time: 30,
    requires: { buildings: { house: 2 } },
    unlocks: ['storehouse', 'granary', 'library', 'wall', 'gate', 'tower', 'range', 'soldier']
  },
  {
    n: 3, name: 'Town', cost: { f: 600, w: 300, s: 0, g: 150 }, time: 45,
    requires: { buildings: { library: 1 } },
    unlocks: ['market', 'stable', 'smith', 'temple', 'cartdepot', 'horseman', 'cart']
  },
  {
    n: 4, name: 'Metropolis', cost: { f: 900, w: 500, s: 300, g: 200 }, time: 60,
    requires: { buildings: { smith: 1 } },
    unlocks: ['siege', 'knight', 'ram', 'catapult']
  },
  {
    n: 5, name: 'Empire', cost: { f: 1200, w: 800, s: 500, g: 400 }, time: 60,
    requires: { buildings: { temple: 1, market: 1 } },
    unlocks: ['wonder'], bonus: 'units +10% HP/dmg'
  }
];

if (typeof module !== 'undefined') module.exports = UCG_ERAS;
