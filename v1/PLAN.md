# Untitled Civ Game — v1 Build Plan (PLAN.md)

Source of truth: `untitled-civ-game-master-prompt.md`. This plan is binding for Coder agents in Stages A–E. All code, comments, identifiers, commits in English. Do not invent numbers — use the tables below. Where this plan says "DECISION", the ambiguity has been resolved; do not re-open it.

## 0. Global decisions (locked)

- **Port:** 8080 (single constant in `shared/constants.js`, overridable via `PORT` env var).
- **Node:** 18+, single dependency: `ws`. One process serves HTTP static files (hand-rolled static handler, no express) + WebSocket on the same port (ws attaches to the HTTP server).
- **Client:** Phaser 3 (v3.60+) from CDN via `<script src="https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js">`. **No build step, no ES modules** — plain `<script>` tags in a fixed order in `index.html`. Each client file assigns to a global namespace object `window.UCG = window.UCG || {}`.
- **Shared data pattern (server + client):** every file in `shared/` ends with:
  ```
  if (typeof module !== 'undefined') module.exports = UCG_DATA_X;
  ```
  and starts with `const UCG_DATA_X = { ... }` (one global per file: `UCG_CONST`, `UCG_BUILDINGS`, `UCG_UNITS`, `UCG_TECHS`, `UCG_ERAS`, `UCG_CIVS`). Server does `require('../shared/data-buildings.js')`; client loads them with script tags before game scripts.
- **Coordinates:** tile grid, origin top-left, `tx` right, `ty` down. Buildings occupy integer tile footprints anchored at top-left tile. Units live in continuous tile-space floats (`x`, `y` in tile units, center of unit). Screen position = `x * TILE_PX * zoom`. TILE_PX = 16; baseline camera zoom = 2.0 (range 1.0–3.0, scroll wheel).
- **Map:** 96 x 56 tiles.
- **Tick:** 12 Hz simulation (`TICK_MS = 1000/12`). Delta message broadcast every tick. Time values in data tables below are in **seconds**; convert with `Math.round(sec * 12)` ticks.
- **Unit cap:** 200 units alive per side (server rejects spawn beyond cap), hard total 400.
- **Randomness:** single seeded PRNG (mulberry32) on server; seed logged at game start for repro.
- **No fog of war, no save/load, no persistence.** Session dies with the server process.
- **Cross-platform:** use `path.join(__dirname, ...)` everywhere in server code; no shell exec, no symlinks, LF line endings, no case-sensitive path mismatches (all lowercase filenames, kebab-case).
- **Carts (DECISION):** gather camps credit the shared treasury instantly (AoE style). Carts are **trade units**: a cart auto-shuttles between its home Cart Depot and the Market (or Town Center if no Market), earning `round(distance_in_tiles * 0.15)` gold per completed round trip. This satisfies "roads + carts logistics" without double-accounting resources. Roads still speed up all units including carts.
- **Assets:** coders MUST read `assets/MANIFEST.md` (written by the asset agent) for exact spritesheet paths, frame sizes and frame indices for terrain, buildings, units, cursors, UI, sounds, music. Never hardcode frame numbers without checking MANIFEST.md. If a needed sprite is missing, use a tinted colored rectangle placeholder and add a `TODO(asset)` comment — do not block.
- **Civ identity:** shared sprites + Phaser `setTint(civ.color)` on units/flags; a flag sprite is drawn on every building tinted with the owning side's civ color. Bot city uses its own civ (assigned randomly from the 5, different from players').

## 1. File architecture

```
v1/
  package.json            # name, "start": "node server.js", deps: { "ws": "^8" }
  start.bat               # Windows: npm install (if no node_modules), start server, open browser
  README.md               # EN. LAN instructions (ipconfig, http://<IP>:8080), port change
  PLAN.md                 # this file
  server.js               # entry point: create HTTP server (static from client/ + shared/ + assets/),
                          # attach ws, instantiate Lobby, run main loop. ~150 lines max, glue only.
  server/
    static.js             # minimal static file server w/ mime map (html,js,css,png,ogg,mp3,json)
    lobby.js              # pre-game state: players (id,nick,color,ready), shared civ/mode/difficulty pick,
                          # host = first joiner, start transition, rejoin tokens
    game.js               # Game class: fixed-timestep tick loop (setInterval + drift correction),
                          # pause flag, command queue -> validate -> apply, victory check,
                          # orchestrates economy/units/combat/bot per tick
    mapgen.js             # seeded terrain generation (see §3), returns {tiles, nodes, citySites}
    grid.js               # walkability grid, occupancy, building footprint stamping, road lookup
    pathfinding.js        # A* (8-dir, no corner cutting), path cache, repath, unit soft-collision push
    economy.js            # resources, pop cap, house citizen spawning, gather state machine,
                          # drop-off logic, farm work, cart trade loop, food upkeep/starvation
    buildings.js          # placement validation, construction progress (workers build), production
                          # queues (train units, research at TC/Library/Blacksmith), rally points, demolish
    units.js              # entity model + per-unit state machine step (idle/move/gather/build/attack/dead)
    combat.js             # target acquisition (auto-attack radius), damage application, siege bonus,
                          # tower attacks, temple healing, projectile events (visual only, damage is instant)
    bot.js                # bot AI state machine (see §6), one instance for the bot side
    protocol.js           # message type constants, validation of client commands (shape + legality)
    snapshot.js           # full snapshot builder + per-tick delta builder (dirty-flag based)
    prng.js               # mulberry32 seeded PRNG
  shared/
    constants.js          # UCG_CONST: PORT, TICK_RATE, TILE_PX, MAP_W/H, caps, resource ids,
                          # terrain ids, entity type ids, message type strings
    data-buildings.js     # UCG_BUILDINGS  (table §4.1)
    data-units.js         # UCG_UNITS      (table §4.2)
    data-eras.js          # UCG_ERAS       (table §4.3)
    data-techs.js         # UCG_TECHS      (table §4.4)
    data-civs.js          # UCG_CIVS       (table §4.5)
  client/
    index.html            # loads Phaser CDN, then shared/*.js, then client js in order, fullscreen canvas
    css/style.css         # minimal: body margin 0, HUD overlay styles (HUD is DOM, see below)
    js/
      net.js              # UCG.Net: ws connect to location.host, send/receive JSON, reconnect w/ token
      state.js            # UCG.State: latest ticks ring buffer, applies deltas onto local mirror
      interp.js           # UCG.Interp: render-time entity position interpolation (~167ms behind)
      boot-scene.js       # Phaser BootScene: preload assets per MANIFEST.md, then -> Lobby
      lobby-scene.js      # DOM-overlay lobby UI (nick, color, civ, mode, difficulty, ready, start)
      game-scene.js       # main scene: builds tilemap, owns render subsystems, per-frame update
      camera.js           # WASD + edge scroll + middle/drag pan + wheel zoom (1.0-3.0)
      render-entities.js  # sprite pools for units/buildings, HP bars, tint, culling
      render-cursors.js   # other players' cursors (Kenney cursor sprites tinted per player)
      input.js            # click/box selection, right-click move/attack/gather, building placement
                          # ghost (green/red validity), hotkeys, sends commands via Net
      minimap.js          # canvas-based minimap (terrain baked once + entity dots each 500ms), click to jump
      hud.js              # DOM HUD: top resource bar + era + pause, bottom build bar, selection panel
      tooltips.js         # hover tooltips from shared data (disabled in Intro mode)
      audio.js            # UCG.Audio: shared bus, SFX play w/ throttle, adaptive music layers (§8 Stage E)
  assets/                 # provided by asset agent: tiles/ cursors/ ui/ sounds/ music/ MANIFEST.md
```

HUD is plain DOM overlaid on the Phaser canvas (simpler than Phaser UI, crisp text). Everything else renders in Phaser.

## 2. Net protocol

Transport: JSON text frames over `ws`. Every message: `{ "t": "<type>", ... }`. Server is authoritative; client commands are requests.

### Client → Server
| t | payload | notes |
|---|---|---|
| `join` | `{nick, color, token?}` | token = rejoin token from localStorage; server re-binds old playerId if game running |
| `lobby_set` | `{nick?, color?, ready?, civ?, mode?, difficulty?}` | civ/mode/difficulty are shared lobby values (last write wins, all players may set) |
| `start` | `{}` | host only; requires all ready |
| `cursor` | `{x, y}` | tile-space floats, client throttles to 10/s |
| `place` | `{building, tx, ty}` | request construction site |
| `demolish` | `{id}` | own building |
| `move` | `{ids:[...], tx, ty, attack:bool, target?:id}` | right-click move / attack-move. **Stage C:** optional `target` = enemy entity id for focus-fire; military units path to it and engage, non-military just move. `attack:true` without `target` = attack-move to the tile (engage anything acquired en route). Plain (no flags) = move, ignore enemies until arrival. Walls are drag-placed by the client as a **series of `place{building:'wall'}` commands** along the drag line (one per tile); no dedicated wall-line message. |
| `gather` | `{ids:[...], target}` | target = resource node id or farm/construction building id (workers: gather or build) |
| `train` | `{id, unit}` | building production queue (TC: worker; military buildings; Cart Depot: cart) |
| `cancelq` | `{id, index}` | cancel queue item, refund |
| `rally` | `{id, tx, ty}` | |
| `research` | `{tech}` | at Library (DECISION: all 16 techs at Library only, Blacksmith is a prerequisite building, keeps UI simple) |
| `advance_era` | `{}` | starts era research at TC |
| `trade` | `{give, get}` | market exchange: pay 100 of resource `give` ('f'/'w'/'s'/'g'), receive 75 of `get`; requires a completed Market (added in Stage B) |
| `pause` | `{paused:bool}` | any player toggles for everyone |
| `ping` | `{n}` | |

### Server → Client
| t | payload |
|---|---|
| `welcome` | `{playerId, token, lobby}` |
| `lobby` | full lobby state (players, shared picks) — sent on any change |
| `start` | `{mode, difficulty, civs:{player,bot}, map:{w,h,tiles:base64-or-array,nodes:[...]}, tick}` |
| `snap` | full snapshot: `{tick, res:{f,w,s,g}, pop:{cur,cap}, era, techs:[ids], entities:[...], botRes-era summary}` — sent after `start`, on rejoin, and every 600 ticks (50 s) as safety keyframe |
| `delta` | `{tick, res?, pop?, era?, techs?, add:[entities], upd:[{id, x?, y?, hp?, st?, ...changed fields}], del:[ids], ev:[events]}` — every tick |
| `cursors` | `{players:[{id,x,y}]}` — 10/s, separate from deltas |
| `paused` | `{paused, by}` |
| `over` | `{winner:"players"|"bots", stats}` |
| `err` | `{msg}` (invalid command; client shows toast) |
| `pong` | `{n}` |

Entity wire format: `{id, k:"u"|"b", type, side:0|1, x, y, hp, maxhp, st, extra}` — `st` = state enum; buildings add `{tx,ty,progress}` during construction; positions quantized to 1/16 tile (send `Math.round(x*16)/16`).

**Delta discipline:** every entity has a server-side `dirty` bitmask set by systems; snapshot.js emits only dirty fields, clears masks after send. Resources/pop sent only when changed. Events (`ev`) are transient: `{e:"attack",from,to}`, `{e:"die",id}`, `{e:"built",id}`, `{e:"research_done",tech}`, `{e:"era",n}`, `{e:"starve"}` — client uses them for SFX/flashes.

**Interpolation:** client keeps last 3 received ticks; renders entities at `serverTime - 2 ticks` (~167 ms) by lerping x/y between bracketing ticks. New entities pop in; deaths play immediately. No client prediction.

**Join/rejoin:** on `welcome` client stores `token` in localStorage. If socket drops mid-game, client auto-reconnects every 2 s sending `join{token}`; server keeps disconnected player slot for the whole session and re-sends `snap`. New players cannot join after `start` (lobby rejects, message "game in progress" — DECISION).

**Pause:** server stops advancing ticks (interval keeps running, sim body skipped); cursors and pause toggles still processed.

## 3. Map generation (server/mapgen.js)

- Grid 96x56. Terrain ids: 0 grass, 1 forest, 2 mountain, 3 water, 4 gold ore (on grass base), 5 road (overlay flag, not a terrain replace).
- Algorithm (seeded):
  1. Fill grass. Water border: 1–2 tile irregular ring on all edges (sin-wobbled), plus one lake blob (radius 4–6) placed in the middle third, at `y` randomly top or bottom half.
  2. City sites: players centered near `(14, 28)`, bot near `(82, 28)` (each ±3 jitter). Clear a 14x14 all-grass square at each.
  3. Forests: 8–11 blobs (random walk blobs of 25–60 tiles); guarantee ≥1 blob within 10 tiles of each city site.
  4. Mountains: 5–7 blobs (15–35 tiles); ≥1 within 12 tiles of each site.
  5. Gold: 6 nodes of 2x2 gold tiles: 1 near each site (within 14 tiles), 4 in the contested middle third.
  6. Connectivity check: BFS on walkable tiles from player site to bot site; if unreachable, carve a 3-tile-wide grass corridor along the straight line.
- Resource amounts per tile: forest 150 wood, mountain 300 stone, gold tile 400 gold. Depleted forest/mountain/gold tiles become grass (walkable) and are announced via delta.
- Start entities per side: 1 Town Center (4x4, pre-built) at site center, 4 workers, and (players only) starting camera centered on TC. Starting treasury: **200 food, 200 wood, 100 stone, 50 gold** (both sides).

Walkability: grass + road walkable; forest/mountain/gold walkable=false (they're obstacles until depleted); water never walkable; building footprints unwalkable except Road and Gate (gate passable for its own side only).

## 4. Data tables (THE spec — copy into shared/ files exactly)

Multipliers from civs/techs apply at lookup time via helper `stat(base, side, key)`; never mutate base tables.

### 4.1 Buildings (`shared/data-buildings.js`)

Cost is Food/Wood/Stone/Gold. `foot` = WxH tiles. `buildTime` = seconds at 1 worker (more workers: rate = sqrt(n) workers-equivalent, cap 4). Era = becomes available at that era.

| id | name | era | cost F/W/S/G | HP | foot | function |
|---|---|---|---|---|---|---|
| tc | Town Center | 1 | 0/400/200/0 | 2400 | 4x4 | drop-off all; trains Worker; era research; +10 pop cap; 1 free at start |
| house | House | 1 | 0/50/0/0 | 400 | 2x2 | +5 pop cap; citizens auto-spawn (§5) |
| farm | Farm | 1 | 0/60/0/0 | 300 | 2x2 | on grass; 1 worker slot; infinite food at 0.8/s |
| lumber | Lumber Camp | 1 | 0/50/0/0 | 350 | 2x2 | drop-off wood; must be ≤4 tiles from a forest tile |
| quarry | Mining Camp | 1 | 0/50/0/0 | 350 | 2x2 | drop-off stone+gold; ≤4 tiles from mountain/gold |
| barracks | Barracks | 1 | 0/120/0/0 | 800 | 3x3 | trains Militia/Soldier/Knight |
| road | Road | 1 | 0/2/0/0 | 100 | 1x1 | walkable, speed x1.5 for all units on it; built instantly on payment (no worker needed — DECISION) |
| storehouse | Storehouse | 2 | 0/80/0/0 | 500 | 2x2 | drop-off all |
| granary | Granary | 2 | 0/80/0/0 | 500 | 2x2 | drop-off food; +5% global food gather rate (max 2 counted) |
| library | Library | 2 | 0/120/0/40 | 600 | 3x3 | researches all 16 techs |
| wall | Wall | 2 | 0/0/10/0 | 600 | 1x1 | blocks movement; drag-place segments |
| gate | Gate | 2 | 0/0/30/0 | 500 | 1x2 | wall segment passable by own side |
| tower | Watchtower | 2 | 0/0/80/0 | 800 | 2x2 | auto-attack: 8 dmg, range 7, 1 shot/s |
| range | Archery Range | 2 | 0/130/0/0 | 700 | 3x3 | trains Archer |
| market | Market | 3 | 0/100/0/50 | 600 | 3x3 | trade UI: exchange 100 of a resource for 75 of another; cart route endpoint |
| stable | Stable | 3 | 0/150/0/50 | 800 | 3x3 | trains Horseman |
| smith | Blacksmith | 3 | 0/100/50/0 | 600 | 2x2 | prerequisite for era 4 + military techs M3/M4 |
| temple | Temple | 3 | 0/150/100/0 | 700 | 2x2 | +10 pop cap; heals own units 1 HP/s within 6 tiles |
| cartdepot | Cart Depot | 3 | 0/150/0/0 | 700 | 3x3 | trains Cart (max 4 alive per depot) |
| siege | Siege Workshop | 4 | 0/200/100/0 | 900 | 3x3 | trains Ram/Catapult |
| wonder | Wonder | 5 | 200/500/500/300 | 3000 | 4x4 | while complete: +25% all gather rates |

buildTime (s): tc 90, house 20, farm 15, lumber/quarry 15, barracks 30, storehouse/granary 20, library 35, wall 6, gate 10, tower 25, range 30, market 35, stable 35, smith 30, temple 35, cartdepot 35, siege 40, wonder 150.

Placement rules: footprint fully on grass/road-free walkable tiles, no overlap with entities/nodes; lumber/quarry proximity rules above; farm any grass. Construction site spawns at 1 HP·progress; workers assigned via `gather` command on the site; building contributes to defeat condition only once completed (DECISION: unfinished sites don't count for victory check; walls included in victory condition, roads excluded).

### 4.2 Units (`shared/data-units.js`)

`spd` tiles/s, `rng` tiles (1 = melee), `cd` attack cooldown s, `train` s. All units footprint radius 0.5 tile.

| id | name | era | source | cost F/W/S/G | HP | dmg | rng | cd | spd | train | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| worker | Worker | 1 | houses (auto) / tc | 50/0/0/0 | 40 | 2 | 1 | 1 | 1.5 | 15 | carry 10; gathers 1/s; builds |
| cart | Cart | 3 | cartdepot | 0/40/0/0 | 80 | – | – | – | 2.0 | 20 | trade income §0; flees when attacked |
| militia | Militia | 1 | barracks | 50/10/0/0 | 60 | 6 | 1 | 1 | 1.3 | 12 | |
| soldier | Soldier | 2 | barracks | 60/0/0/20 | 110 | 10 | 1 | 1 | 1.3 | 15 | |
| knight | Knight | 4 | barracks | 90/0/0/45 | 200 | 16 | 1 | 1 | 1.4 | 20 | |
| archer | Archer | 2 | range | 40/30/0/0 | 50 | 7 | 5 | 1 | 1.4 | 15 | |
| horseman | Horseman | 3 | stable | 80/0/0/30 | 140 | 11 | 1 | 1 | 2.6 | 18 | |
| ram | Ram | 4 | siege | 0/150/40/0 | 250 | 4 | 1 | 1 | 0.9 | 25 | x8 dmg vs buildings (=32) |
| catapult | Catapult | 4 | siege | 0/150/0/80 | 90 | 20 | 7 | 3 | 0.8 | 30 | x4 vs buildings; splash r=1.5 half dmg; min range 2 |

Combat rules: auto-acquire nearest enemy within aggro radius 6 (workers/carts never auto-attack; workers flee toward TC when hit). Attack-move = move + engage anything en route. Damage flat, no armor. Siege multipliers apply only vs buildings/walls/towers. Era 5 grants a permanent +10% HP and dmg to all newly trained AND existing units of that side.

### 4.3 Eras (`shared/data-eras.js`)

Researched at Town Center (blocks its queue). Requirement = completed buildings.

| # | name | cost F/W/S/G | time | requires | unlocks |
|---|---|---|---|---|---|
| 1 | Settlement | – | – | – | tc, house, farm, lumber, quarry, barracks, road, worker, militia |
| 2 | Village | 300/150/0/0 | 30 s | 2 houses | storehouse, granary, library, wall, gate, tower, range, soldier, era-2 techs |
| 3 | Town | 600/300/0/150 | 45 s | library | market, stable, smith, temple, cartdepot, horseman, cart, era-3 techs |
| 4 | Metropolis | 900/500/300/200 | 60 s | smith | siege, knight, ram, catapult, era-4 techs |
| 5 | Empire | 1200/800/500/400 | 60 s | temple + market | wonder, era-5 techs, +10% unit HP/dmg |

### 4.4 Tech tree (`shared/data-techs.js`) — 16 techs, 4 branches, all at Library

Effects are global multipliers/adders for the researching side, applied via the `stat()` helper.

| id | branch | era | cost F/W/S/G | time | effect |
|---|---|---|---|---|---|
| eco1 Sharp Axes | Economy | 2 | 100/50/0/0 | 30 s | wood gather rate x1.2 |
| eco2 Crop Rotation | Economy | 3 | 150/75/0/0 | 40 s | food gather rate x1.25 |
| eco3 Wheelbarrow | Economy | 3 | 175/100/0/0 | 45 s | worker carry +5 (15), worker speed x1.1 |
| eco4 Coinage | Economy | 4 | 200/0/0/100 | 50 s | gold gather & cart trade x1.25 |
| mil1 Forged Blades | Military | 2 | 100/0/0/75 | 40 s | melee unit dmg +2 |
| mil2 Fletching | Military | 3 | 125/0/0/75 | 40 s | archer +2 dmg, +1 range; towers +2 dmg |
| mil3 Iron Armor | Military | 4 | 200/0/0/150 | 50 s | all military unit HP x1.25 (requires smith) |
| mil4 Siegecraft | Military | 5 | 0/250/0/200 | 60 s | siege dmg vs buildings x1.5 |
| con1 Masonry | Construction | 2 | 0/100/50/0 | 35 s | building HP x1.2 |
| con2 Fortification | Construction | 3 | 0/150/100/0 | 45 s | wall/tower/gate HP x1.5 |
| con3 Engineering | Construction | 4 | 0/200/150/0 | 50 s | build speed x1.3, building costs x0.9 |
| con4 Grand Architecture | Construction | 5 | 0/300/200/0 | 60 s | building HP additional x1.3; wonder cost x0.75 |
| pop1 Housing | Population | 2 | 75/50/0/0 | 30 s | +2 pop cap per house (7) |
| pop2 Medicine | Population | 3 | 125/0/0/50 | 40 s | citizen spawn interval x0.8 |
| pop3 Drill | Population | 4 | 150/0/0/100 | 45 s | all unit move speed x1.1 |
| pop4 Census | Population | 5 | 200/0/0/150 | 55 s | +25 flat pop cap |

HP multiplier techs retro-apply to existing entities (scale current HP proportionally).

### 4.5 Civs (`shared/data-civs.js`) — exact multipliers

| id | name | color (hex tint) | perks | weaknesses |
|---|---|---|---|---|
| townsfolk | Townsfolk | 0x4a90e2 | gold gather & trade x1.25; build speed x1.15 | military unit HP x0.9 |
| vikings | Vikings | 0xd0021b | infantry (militia/soldier/knight) dmg x1.2; wood rate x1.2 | food rate x0.85; wall/tower/gate HP x0.8 |
| highlanders | Highlanders | 0x6b8e6b | stone rate x1.3; wall/tower/gate HP x1.3 | all unit speed x0.9; gold rate x0.85 |
| steppe | Steppe Nomads | 0xf5a623 | all unit speed x1.15; horseman HP & dmg x1.2; citizen spawn interval x0.8 | building HP x0.85; stone rate x0.8 |
| artisans | Artisans | 0x9013fe | research & era time x0.7; tech cost x0.8 | military train time in eras 1–2 x1.25 |

Bot picks a random civ ≠ players' civ and uses its multipliers too.

## 5. Sim design details

- **Entity model:** flat arrays-of-objects in one `entities` Map(id → ent). `ent = {id, kind, type, side, x, y, hp, state, target, path, cargo:{res,amt}, cooldown, dirty}`. Ids: incrementing ints. No per-tick allocation: reuse path arrays, use object pools for events.
- **Tick order (game.js):** 1) drain+validate commands → apply; 2) bot.think (every 12 ticks = 1/s); 3) economy (spawns, farms, upkeep, carts); 4) units.step (movement + state machines); 5) combat (towers, engagements, healing); 6) buildings (construction, queues, research); 7) victory check; 8) snapshot.delta broadcast.
- **Citizen spawning:** each side spawns 1 worker every **20 s** (civ/tech modified) at a random completed house, while `pop < popCap` and `food ≥ 25` (spawn consumes 25 food, replacing manual cost). TC can also train workers manually (50 food) for burst.
- **Pop:** every unit costs 1 pop (carts 1 too). popCap = 10 (TC) + 5/house (+techs/temple), UI cap display max 200.
- **Food upkeep:** every 10 s, side pays `ceil(unitCount * 0.2)` food. If food hits 0: starvation mode — every 10 s a random unit loses 20% maxHP and citizen spawning halts; UI event `starve`.
- **Gather loop (worker state machine):** `toNode → gathering (1/s, until carry full or node empty) → toDropoff (nearest valid drop-off for that resource) → deposit (instant credit) → toNode`. Farms: worker occupies farm slot, generates 0.8 food/s straight to treasury while "working" (no walking; simpler, reads well). Node depletion frees the tile (walkable grass) and retargets gatherers to nearest same-type node within 8 tiles or idle.
- **Pathfinding:** A* on the walkability grid, 8-directional, diagonal cost 1.414, corner-cut forbidden. Budget: max 3000 expansions, else return best-effort partial path. Cache: LRU (512 entries) keyed `startTile|goalTile`, invalidated on any walkability change (building placed/destroyed, node depleted) by bumping a generation counter. Moving units re-path if blocked 3 consecutive ticks. Soft collision: units within 0.6 tile push each other apart (no path re-plan), capped push 0.1 tile/tick. Group moves: single path computed for group centroid-nearest unit, others follow offsets with individual short repairs (cheap "flow-light").
- **Victory:** side loses when it has 0 completed buildings (roads excluded). Server sends `over`, sim freezes; clients show victory/defeat overlay with restart hint (restart = restart server; no in-app rematch in v1 — DECISION).
- **Creative mode:** treasury pinned to 99999 each tick, all eras/techs pre-granted, train times x0.25. Intro mode: no bot side spawned at all, no victory check, tooltips off.

## 6. Bot AI (`server/bot.js`)

Runs once per second. Phases: `OPENING → DEVELOP → PRESSURE` with parallel `DEFEND` interrupt.

- **OPENING:** assign workers 50% wood / 30% food / 20% stone; build to targets: 4 houses, 2 farms, 1 lumber, 1 quarry, 1 barracks; grow to `ecoWorkers` workers.
- **DEVELOP:** advance eras ASAP when cost affordable ×1.2 buffer; maintain build order: library → range → tower x2 at map-facing edge → market/smith/stable → siege workshop; research techs in fixed priority (eco1, mil1, con1, pop1, then era-appropriate).
- **PRESSURE:** keep training army at composition by era — era≤2: 70% militia/soldier 30% archer; era 3: 50% inf, 30% archer, 20% horseman; era 4+: 40% inf, 25% archer, 15% horseman, 20% siege (min 1 ram+1 catapult per wave). When army size ≥ current wave size and `now ≥ nextAttackAt`: attack-move the whole army at the nearest player building; after wave resolves (army dead or target area cleared), schedule next wave.
- **DEFEND:** if any bot building takes damage, pull all military within 40 tiles to the attacked building; return to previous phase after 20 s without damage.
- Bot rebuilds destroyed eco buildings (Normal/Hard), replaces workers, avoids walls (doesn't build walls — DECISION, keeps pathing simple; towers only).

Difficulty table (`shared/constants.js` → `BOT_DIFF`):

| param | Easy | Normal | Hard |
|---|---|---|---|
| gatherRateMult | 0.7 | 1.0 | 1.3 |
| freeTricklePerSec (F/W) | 0 | 0 | 1 / 1 |
| ecoWorkers target | 10 | 16 | 22 |
| firstAttackAt | 12 min | 8 min | 5.5 min |
| waveInterval | 4 min | 3 min | 2 min |
| waveSizeStart → growth/wave | 4 → +2 | 8 → +3 | 12 → +4 (cap 40) |
| maxEra | 3 | 5 | 5 |
| rebuildEco | no | yes | yes |
| eraCostMult | 1.2 | 1.0 | 0.85 |

## 7. Performance notes (binding)

Client: single tilemap layer via Phaser static tilemap (one draw batch); all units/buildings from ≤3 texture atlases; sprite pools (`render-entities.js`), never create/destroy per tick — acquire/release; cull: skip pool updates for entities outside camera view + 4-tile margin (HP bars too); minimap redraws entity dots at 2 Hz onto a small canvas; DOM HUD updates only on value change; interpolation math allocation-free.

Server (8 GB Windows target): fixed timestep with drift correction (track `nextTickAt += TICK_MS`); no per-tick object/array allocation in hot loops (reuse scratch arrays in A* and delta builder); A* open list = binary heap over typed arrays; walkability as `Uint8Array(96*56)`; JSON stringify once per tick, broadcast same string to all sockets; cap ws backpressure (if `bufferedAmount > 1 MB`, skip non-keyframe deltas for that socket). No shell-specific code; `path.join` only; start.bat is the only Windows-specific file.

## 8. Stage briefs (A–E)

Each Coder agent: read this PLAN.md fully + `assets/MANIFEST.md` + existing code before writing. Do not refactor previous stages beyond what your checklist requires. Keep files under ~400 lines; split if larger.

### Stage A — Skeleton (net, map, render, one building)
Deliverables:
1. `package.json`, `server.js`, `server/static.js` — one process, port 8080, serves `client/`, `shared/`, `assets/`.
2. `shared/constants.js` complete (all ids/enums from this plan, even if unused yet).
3. `server/prng.js`, `server/mapgen.js`, `server/grid.js` per §3 (nodes included).
4. `server/lobby.js` + `server/game.js` (tick loop 12 Hz, pause, command queue), `server/protocol.js`, `server/snapshot.js` (full snap + delta with dirty flags — build the real mechanism now).
5. Client: `index.html` (script order), `net.js`, `state.js`, `boot-scene.js` (load per MANIFEST.md), `lobby-scene.js` (nick, color pick, ready, host start; civ/mode/difficulty selectors present but civ/mode may be stubbed to defaults), `game-scene.js` rendering the full terrain tilemap + resource nodes, `camera.js` (WASD, edge scroll, drag, wheel zoom), `render-cursors.js` (live multi-player cursors), `hud.js` stub showing resources + tick.
6. Place one building end-to-end: build-bar stub with House; ghost placement with validity tint; `place` command → server validates cost/footprint → building appears on all clients instantly-completed (construction comes in B). Starting TC + 4 workers rendered (workers idle, no orders yet).

Testing checkpoint A (2 browser windows): both join lobby, see each other's nick/color; host starts; identical map in both; both cursors visible live; WASD/drag/zoom smooth; window 1 places a House, appears in window 2 within ~200 ms; pause from window 2 freezes tick counter in both; kill/reopen window 1 → rejoins and sees same state.

### Stage B — Full economy
1. `server/pathfinding.js` per §5 (A*, cache, soft collision, group moves).
2. `server/units.js` movement + worker state machine (gather loop, build, flee); `server/economy.js` (treasury, pop cap, house auto-spawn, food upkeep/starvation, farm slots, granary bonus, node depletion → walkability update).
3. `server/buildings.js`: construction sites + worker build (sqrt stacking), all economy buildings from §4.1 (era gating comes in D; all economy buildings functional incl. market + cartdepot + cart trade loop), demolish, TC worker training queue + rally.
4. Roads: instant build, speed multiplier in movement code.
5. Client: unit rendering pools + interpolation + HP bars; right-click worker → node/farm/site (gather/build); build bar with all economy buildings; resource/pop top bar live; starvation warning toast.

Testing checkpoint B: worker sent to forest visibly walks, chops (node count drops), carries to Lumber Camp, treasury wood increases in both windows; farm + worker produces food; house completion raises pop cap and citizens auto-spawn; food to 0 → starvation event; deplete a forest tile → tile becomes grass and units path through it; build a road line → units visibly faster on it; cart from depot shuttles depot↔market and gold ticks up; 20 workers active with no rubber-banding or console errors; pause/resume mid-gather clean.

### Stage C — Military, combat, bot
1. Selection: click + drag box (multi-select own units), control groups 1–5 (Ctrl+n set, n recall); right-click = context (move / attack-move on enemy / gather); `move` with `attack` flag.
2. `server/combat.js`: auto-acquire, cooldowns, siege building bonus, catapult splash+min range, tower auto-attack, temple heal, worker flee.
3. All military units of §4.2 trainable (era gating deferred to D), barracks/range/stable/siege buildings, walls (drag-place), gate (side-passable), tower.
4. Victory: destroy-all-buildings check, `over` message, client end overlay.
5. `server/bot.js` full §6 with all three difficulties wired to lobby selection; bot side spawns with own civ color tint.
6. Client: attack flashes + death events from `ev`, target markers.

Testing checkpoint C: box-select 10 militia, attack-move across map — they engage bot units en route; archers/catapults respect ranges (catapult can't hit adjacent); ram kills a tower ~8x faster than militia do; walls block enemy pathing, own units pass gate, enemy doesn't; Easy bot: no attack before ~12 min; Hard bot: attacked by ~6 min with growing waves; destroying every bot building triggers victory in both windows; losing all buildings triggers defeat; 150+ units alive with playable FPS in both windows and server tick stable (log tick duration).

### Stage D — Eras, techs, civs, modes
1. `server/buildings.js`+`game.js`: era research at TC (§4.3 costs/reqs/unlocks enforced server-side: placement, training, tech gating), era 5 combat bonus.
2. Library research queue, all 16 techs (§4.4) with effects through a single `stat(base, side, key)` helper used by economy/units/combat/buildings — implement the helper in `shared/constants.js` reading a per-side modifier map so client tooltips can show modified values.
3. Civs (§4.5): lobby shared civ pick live; multipliers applied; unit/flag tinting client-side; flag sprite on every building; bot random distinct civ.
4. Modes: Intro (no bot side, no victory check, tooltips suppressed flag), Normal, Creative (all unlocked, treasury pinned, train times x0.25). Lobby wires mode + difficulty fully.
5. Build bar / train buttons grey out with lock reason (era/building requirement) — data-driven from shared tables.

Testing checkpoint D: era 2 blocked until 2 houses; advancing eras unlocks exactly the §4.3 lists; eco1 research measurably speeds wood income; con1 raises existing building HP proportionally; Vikings deal visibly more infantry damage than Townsfolk (spot-check numbers in selection panel); both windows agree on era/tech state after rejoin; Intro has no bot and never ends; Creative starts with everything and 99999 resources; Artisans research faster than others (time a tech).

### Stage E — HUD polish, audio, packaging
1. HUD final (`hud.js`, `tooltips.js`, `minimap.js`): top bar (4 resources + pop + era + pause button + game clock), bottom build bar with hotkeys (Q row) and Kenney Input Prompts key icons, selection panel (portrait, HP, stats with modifiers, production queue with cancel, rally indicator), tooltips (name/cost/description from shared data; hidden in Intro), minimap with terrain + entity dots (side colors) + camera rect + click-to-move-camera + attack ping flashes.
2. `audio.js`: shared bus (master/music/sfx gain); SFX per MANIFEST.md (click, place, train-done, attack hits throttled to ≤6/s, building destroyed, era fanfare, victory/defeat); adaptive music: per-era base track crossfaded 2 s on era change; combat layer — if ≥5 own-side combat events in last 5 s, crossfade to tense track, revert after 10 s calm; mute toggles in HUD.
3. `start.bat`: `@echo off`, cd to script dir, `if not exist node_modules call npm install`, `start http://localhost:8080`, `node server.js`. Plus `README.md` (EN): requirements, start.bat, finding LAN IP via `ipconfig`, joining from other machines, changing port via `PORT` env, troubleshooting (firewall prompt).
4. Perf pass: verify pooling/culling notes of §7 actually hold (no per-frame allocations in update loops), server tick-duration log stays < 20 ms with 300 entities.

Testing checkpoint E: full 2-window playthrough on Normal/Normal: HUD readable, tooltips correct and absent in Intro, minimap ping on attacks, music changes on era-up and during battles, SFX not spammy; rejoin mid-battle recovers cleanly; `start.bat` reviewed for Windows correctness (CRLF); README followed step-by-step by a naive reader.

## 9. Out of scope for v1 (recorded)

Dock/Harbor & water units; per-civ unique units/buildings; in-app rematch; fog of war; save/load; spectators; joining after game start; gamepad/touch.
