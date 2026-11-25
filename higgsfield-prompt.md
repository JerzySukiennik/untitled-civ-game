# Untitled Civ Game — build brief

Build a complete, playable browser game called **Untitled Civ Game**: a local-network co-op
Civilization-like 2D RTS-lite / city-builder. Build it end to end — map, economy, buildings, units,
tech tree, eras, a bot opponent, combat, UI, controls, art, audio — and make it fully playable.

## Concept

1–3 players share **one economy and one city** and cooperate to destroy a rival AI-controlled city
on the other side of the map before it destroys them. Real-time simulation with a shared pause,
one match runs 20–40 minutes. No fog of war — the whole map is visible from the start. No unit
counter-system — units differ by cost/HP/damage/range/role, not rock-paper-scissors.

## Players & session

Everyone opens the same URL and joins a lobby: nickname, a color, one shared civilization pick, one
shared game mode, one shared bot difficulty. Any ready player can start the match — there is no
special "host" once the game begins. No accounts, no save/load, no persistence: a session lives and
dies with the match. Losing your connection mid-game should let you rejoin the same slot until the
match ends.

Three modes:
- **Normal** — full game against the bot city, at a chosen difficulty (see Bot AI below).
- **Intro** — pure sandbox, no opponent at all, no tooltips, for a completely blind first-time player
  to poke around risk-free.
- **Creative** — every era, tech, and building unlocked from the start, unlimited resources, but a
  bot opponent still exists to fight.

## Map

A single procedurally generated map per match, roughly 90–100 tiles wide by 50–60 tiles tall, 16px
tiles. A water border runs around the whole map edge (with a bit of organic wobble, not a straight
line) plus one lake blob somewhere in the middle third. Two city sites sit near the left and right
edges — one for the players, one for the bot — always guaranteed reachable from each other by land
(carve a corridor if terrain generation would otherwise cut them off). Scatter forest blobs (wood),
mountain blobs (stone), and small gold-ore patches across the map, with at least one of each
guaranteed within reach of both city sites. Terrain: grass (buildable, walkable), forest, mountain,
water (impassable — a hard map edge/obstacle, not something units can cross), gold ore, and roads
(built by players, walkable, all units get +50% move speed on them).

## Economy

Four resources: **Food, Wood, Stone, Gold**. Everyone starts with 200 food, 200 wood, 100 stone, 50
gold, shared between all players on a side.

Workers are physical units that walk to a resource tile, gather over time (not instant), carry a
capped amount, then walk it back to a drop-off building and deposit it — classic AoE-style physical
gathering with real pathfinding, not an abstract tick-based counter. A worker gathers roughly 1
resource per second and carries about 10 before needing to return. Farms are a fixed food-producing
building instead of a depletable tile: one worker slot, produces food passively while worked, never
runs out. Forest/mountain/gold tiles do deplete with use and turn back into plain grass once empty.

Population is capped by buildings (Town Center grants a base amount, each House adds a smaller
amount, a Temple in a later era adds more); new citizen-workers periodically spawn for free from
houses once you can afford their food cost, as long as you're under the population cap. If food
runs out entirely, units slowly lose HP until it's restocked — a soft starvation penalty, not instant
death.

Later-game additions: **carts** that shuttle between a cart depot and a market/town-center in a
round trip, generating gold income based on distance traveled (a simple trade-route mechanic); a
market that lets you convert one resource into another at a rate; roads that speed up all movement.

## Progression: 5 eras

Advancing an era costs resources and takes real time to research (done at the Town Center), and
each new era unlocks new buildings, units, and a small combat-stat bonus at the final era. Rough
shape (exact costs/unlock lists are up to you, but keep this progression order and flavor):

1. **Settlement** — starting era. Town Center, House, Farm, Lumber Camp, Mining Camp, Barracks,
   Road. Workers and basic Militia infantry.
2. **Village** — Storehouse, Granary, Library (needed to research techs), Wall, Gate, Watchtower,
   Archery Range. Unlocks Soldier infantry.
3. **Town** — Market, Stable, Blacksmith, Temple, Cart Depot. Unlocks Horseman cavalry and trade
   Carts.
4. **Metropolis** — Siege Workshop. Unlocks Knight infantry, Battering Ram, and Catapult siege units.
5. **Empire** — unlocks a Wonder building (a large late-game structure that boosts gather rates
   while standing) and grants every unit a flat combat bonus (roughly +10% HP and damage) for the
   rest of the match.

## Tech tree

A Library building unlocks research, at the same physical location, of 16 techs across 4 branches
(4 techs each, one per era from era 2 through era 5): **Economy** (gather-rate and worker-carry
boosts, a gold/trade boost), **Military** (flat melee/ranged damage boosts, unit HP boost, a siege
damage boost), **Construction** (building HP boosts, wall/tower/gate HP boosts, faster/cheaper
construction), **Population** (extra pop-cap per house, faster citizen spawning, unit speed boost,
a large flat pop-cap bonus). Each tech costs resources and takes real time; only one tech researches
at a time per branch-independent queue.

## Civilizations

Five playable civs, each a same-base-unit reskin (distinct color tint + banner, not separate art)
with a small, clearly-stated perk and an offsetting weakness:
- **Townsfolk** — better gold gathering/trading and faster building, but weaker military units.
- **Vikings** — stronger infantry damage and faster wood gathering, but weaker food gathering and
  weaker walls/towers.
- **Highlanders** — better stone gathering and stronger defensive buildings, but slower units and
  weaker gold gathering.
- **Steppe Nomads** — faster units overall and a stronger/faster cavalry unit, faster citizen
  spawning, but weaker buildings and weaker stone gathering.
- **Artisans** — much faster research and era advancement and cheaper techs, but slower-training
  military units early on.

## Buildings & units

Roughly 20 building types (Town Center, House, Farm, Lumber Camp, Mining Camp, Barracks, Road,
Storehouse, Granary, Library, Wall, Gate, Watchtower, Archery Range, Market, Stable, Blacksmith,
Temple, Cart Depot, Siege Workshop, Wonder) and roughly 9 unit types (Worker, Cart, Militia,
Soldier, Knight, Archer, Horseman, Battering Ram, Catapult). Give each a sensible cost in the four
resources, HP, build/train time, and footprint size scaled to its role and era — a Town Center and
Wonder should be large and expensive, a House or Road cheap and small. Archers and catapults need
range; catapults should have a minimum range too close to fire (they must back off before shooting
adjacent targets) and deal splash damage to nearby units; rams should deal drastically more damage
to buildings than to units, the opposite of most other units which should do only a small bonus
against buildings at most. Walls block movement; gates are a wall segment passable only by their
owning side; watchtowers auto-attack any enemy that wanders in range; a temple slowly heals nearby
friendly units.

## Combat

Real-time, no formations required beyond simple group-move. Units auto-acquire and fight nearby
enemies when idle or on guard; give an "attack-move" command that marches toward a point but engages
anything encountered on the way. Support focus-fire (target a specific enemy directly). Workers and
trade carts should flee toward their own Town Center automatically when attacked rather than fight.
Losing all your completed buildings (roads don't count) ends the match for that side; the other side
wins.

## Bot AI opponent

The bot builds and defends its own full city autonomously — it is not scripted waves, it actually
plays the economy and tech tree. Give it a clear phase structure: an opening phase establishing basic
economy buildings before anything else, a development phase that keeps advancing eras/tech and
expanding its base at a controlled, human-plausible pace (not blanketing its base with buildings in
the first few seconds — that reads as cheating), and a pressure phase once it has enough army that
launches growing attack waves at the player city on a timer. If one of its buildings takes damage, it
should temporarily interrupt whatever it was doing and send its army to defend that location. Provide
three difficulty presets — Easy, Normal, Hard — that scale its gather rate, worker count, how early
its first attack wave lands, how fast waves grow, and how quickly it expands and reaches later eras.
Easy should feel forgiving and slow to attack; Hard should feel like a real, early, escalating threat.

## Controls

Desktop only, mouse + keyboard, no touch support:
- **Left-click** selects a unit or your own building; **left-drag** draws a box to select every own
  unit inside it.
- **Right-click** issues a context-sensitive order for whatever is selected: move to a point, attack
  an enemy unit/building under the cursor, gather a resource node or work a farm, resume building an
  unfinished own site, or (with a building selected) set its rally point.
- Pressing **Q** arms an attack-move — the next right-click marches there, engaging anything in the
  way instead of just moving past it.
- **Ctrl+A** selects every unit you personally own, of every type.
- **Arrow keys and WASD both** pan the camera; **middle-mouse-drag** also grabs and pans the map;
  mouse wheel zooms smoothly between a wide-out and a close-in view. The camera has no hard border —
  you can pan freely off the edge of the island in any direction.
- **Escape** cancels a building placement or an armed attack-move, or clears the current selection.
- A bottom build bar, grouped visually by era, lets you place buildings; each visible button has its
  own single-key hotkey (plain number keys first, then Shift+number for the rest) so the whole bar is
  reachable without the mouse.
- Clicking the minimap jumps the camera there.

## Visual & audio direction

World rendered as warm, hand-drawn-feeling 16px pixel art (grass, forest, mountains, water, gold
ore, buildings, units) with a few random tile variants so large fields of the same terrain don't look
like an obvious repeating grid. Every piece of UI chrome (top resource bar, build bar, selection
panel, tooltips, minimap frame, lobby) sits on a cool, dark, translucent "smoked glass" layer —
blurred background, a thin bright top edge on every panel — clearly distinct from the warm pixel-art
world underneath it. Reserve exactly one accent color (a warm gold) for anything that signals
progress, era, or an important status change, and nowhere else, so it reads as meaningful every time
it appears. Give the current era its own small always-visible readout with a progress fill toward
the next one. Every custom building-placement ghost should tint green when a placement is legal and
red when it isn't, with a little shake if you try to place somewhere illegal. Give every pointer
state (idle, dragging, attacking, placing, invalid, busy) its own distinct cursor art — never fall
back to a plain system arrow while in-game.

Music should shift adaptively: a calm track appropriate to the current era while nothing is
happening, crossfading into a more tense battle layer once real combat is happening nearby, and
fading back to calm once the fighting stops. Short sound effects for placing/completing buildings,
training units, getting hit, dying, researching, and winning/losing.

## Technical requirements

The simulation must be authoritative and real-time (a fixed tick rate on the order of 10–15 times
per second is a good target) so that every connected player sees an identical, fair game state —
no player-side simulation that could desync or be exploited. It must support up to 3 players sharing
control of one side smoothly over a local network with low latency. It needs to run acceptably on
modest, several-years-old laptop hardware on both the hosting and viewing side — avoid anything that
assumes a discrete GPU or a very recent CPU. Handle 100+ units and dozens of buildings on screen at
once without the frame rate falling apart.

Build the whole thing — do not stop partway to ask which pieces to prioritize, do not present a menu
of alternative directions to choose between. Make the necessary implementation decisions yourself
and deliver a finished, playable match from the very first build.
