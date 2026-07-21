# HANDOFF.md — Untitled Civ Game

**Read this first if you are a Claude picking up this project.** It is the single orientation
document: what the game is, how it is built, what is done, what is not, and which traps already cost
someone a debugging cycle. `PLAN.md` is the binding spec (data tables, protocol, stage briefs),
`DESIGN.md` is the binding visual system, `README.md` is for the player. This file is the map that
tells you when to read which.

> **Maintenance rule (standing instruction from Jurek, 2026-07-20):** update this file on **every**
> change to the project. Add a dated entry to the Changelog at the bottom, and edit any section above
> that the change invalidates. A handoff that drifts out of date is worse than none, because the next
> Claude will trust it. Do this in the same turn as the change, not "later".

---

## 1. What this is

A LAN co-op **Civilization-like 2D RTS-lite**. 1–3 players act as several gods running **one shared
city**, and together destroy a bot city on the other side of the map before it destroys them.
Real-time with a shared pause, ~20–40 min per match, all art/audio CC0 (Kenney + two CC0 music
authors).

**Owner:** Jurek (`JerzySukiennik` on GitHub). He is a vibecoder — he does **not** touch code, the
terminal, or git. You do all of it: files, commands, commits, pushes. He plays, gives feedback, and
decides direction. Talk to him in Polish; write code, comments, and commits in English.

**Repo:** https://github.com/JerzySukiennik/untitled-civ-game (public, no secrets — verified by a
review pass). Everything lives under `v1/`.

**Status:** v1 is **complete and playable**. Definition of done from the master prompt is met. It has
had one full UI/UX overhaul pass. It is **waiting on Jurek's real playtest** — nobody has played a
full match against the bot end-to-end for fun yet, only scripted verification.

**Target hardware (this is a real constraint, not a footnote):**
- Server runs on an **HP Pavilion Gaming laptop, Windows, i5-9300H, 8 GB RAM**. CPU-bound sim; watch memory.
- Client must be smooth on a **MacBook Pro 16" 2019, Intel i9 + Radeon Pro 5500M**. Thermal throttling is real.
- Desktop only. Mouse + keyboard. No touch, no mobile.

---

## 2. Run it

```bash
cd "/Users/jurek/Downloads/Claude/Projects/Untitled Civ Game/v1"
node server.js          # serves HTTP + WebSocket on :8080
```
Then open `http://localhost:8080`. On Windows Jurek double-clicks `start.bat` (npm install if
needed, starts the server, opens the browser). Other machines on the LAN use `http://<IP>:8080`.
Port override: `PORT=9000 node server.js`.

Only dependency is `ws`. Node 18+. **No build step** — the client is plain `<script>` tags with
Phaser 3 from CDN.

**Critical operational fact: the server holds exactly ONE session per process.** Once a game starts,
new page loads land in a dead lobby. To play again, **restart the server**. This has already bitten
Jurek once (see Traps).

---

## 3. Architecture

**Authoritative server, dumb client.** Every rule — economy, movement, pathfinding, combat, bot AI,
victory — is computed server-side. The client renders a mirror of server state and sends command
requests. It never simulates anything. Preserve this: it is why there is no desync and no cheating,
and why the bot can be fair.

```
Client (Phaser 3, CDN, no build)                Server (Node + ws, one process)
  input.js  ──── command message ─────────────▶  protocol.js (validate)
                                                 game.js  (queue → apply → 12 Hz tick)
  state.js ◀──── snapshot / delta ─────────────  snapshot.js (dirty-flag deltas)
  render-*.js, hud.js  (pure presentation)       lobby.js (players, ready, start, rejoin)
```

- **Tick:** 12 Hz fixed timestep with drift correction. Delta broadcast every tick; full snapshot on
  join/rejoin and every 600 ticks as a safety keyframe.
- **Tick order** (`game.js step()`): commands → bot (every 12 ticks) → economy → units → combat →
  buildings → victory (every 6 ticks) → broadcast delta.
- **Interpolation:** client renders ~2 ticks (167 ms) behind and lerps positions. No client
  prediction — LAN ping is low enough.
- **Deltas** carry only dirty fields (per-entity dirty bitmask, cleared after send). Do not "just
  send everything" when adding a field; set its dirty flag.
- **Pause:** any player toggles; server skips the sim body but keeps the interval running.

---

## 4. File map

### Server (`v1/server/`, entry `v1/server.js`)
| File | Responsibility |
|---|---|
| `static.js` | Hand-rolled static file server + mime map |
| `lobby.js` | Players, nick/color, shared civ/mode/difficulty, ready gating, **start (any player)**, rejoin tokens, in-game command routing |
| `game.js` | Tick loop, command queue, entity map, victory check, orchestration (~407 lines, the biggest file) |
| `mapgen.js` | Seeded terrain: grass/forest/mountain/water/gold, two city sites, connectivity BFS + corridor carve |
| `grid.js` | Walkability `Uint8Array`, footprint occupancy, road overlay, **gate layer + `walkableFor(tx,ty,side)`** |
| `pathfinding.js` | A* 8-dir, binary heap, 3000-expansion budget, LRU path cache invalidated by `grid.gen`, soft collision, formation offsets |
| `units.js` | Movement, worker state machine (gather→carry→deposit), build, flee, cart trade loop |
| `economy.js` | Treasury, pop cap, house auto-spawn, food upkeep + starvation, farms, granary, node depletion |
| `buildings.js` | Construction sites, production queues, era research, tech research, rally, demolish, market trade |
| `combat.js` | Target acquisition on a coarse spatial grid, cooldowns, siege multipliers, catapult splash + min range, towers, temple heal |
| `bot.js` | OPENING → DEVELOP → PRESSURE + DEFEND interrupt; all `BOT_DIFF` params (~412 lines) |
| `mods.js` | Per-side modifier map (civ + techs + era 5), `retroHp` for HP-changing techs |
| `snapshot.js` | Full snapshot + dirty-flag delta builder |
| `protocol.js` / `prng.js` | Message validation / mulberry32 seeded PRNG |

### Shared (`v1/shared/`) — loaded by **both** server (`require`) and client (`<script>`)
`constants.js` (ids, enums, `BOT_DIFF`, `stat()` helper), `data-buildings.js`, `data-units.js`,
`data-eras.js`, `data-techs.js`, `data-civs.js`. Pattern: `const UCG_X = {...}` then
`if (typeof module !== 'undefined') module.exports = UCG_X;`.

**All balance numbers live here and match PLAN.md §4 exactly** (verified by review). If you change a
number, change PLAN.md too, or the next review will flag it as a discrepancy.

### Client (`v1/client/js/`, loaded in fixed order by `index.html`)
`net.js` (ws + rejoin) · `state.js` (mirror) · `interp.js` · `icons.js` (pixel-icon pipeline) ·
`boot-scene.js` (asset load + **generated terrain textures**) · `lobby-scene.js` · `game-scene.js` ·
`camera.js` · `render-entities.js` · `render-cursors.js` · `input.js` · `minimap.js` · `rules.js`
(client-side lock/era gating for UI) · `tooltips.js` · `hud.js` · `audio.js`.
CSS: `style.css` (tokens + lobby) + `hud.css` (HUD chrome).

---

## 5. Protocol quick reference

Message shape: `{ "t": "<type>", ... }`, JSON over ws. Full table in `PLAN.md` §2.

**Client → server:** `join`, `lobby_set`, `start`, `cursor`, `place`, `demolish`, `move`
(`{ids, tx, ty, attack?, target?}`), `gather`, `train`, `cancelq`, `rally`, `research`,
`advance_era`, `trade`, `pause`, `ping`.

**Server → client:** `welcome`, `lobby`, `start`, `snap`, `delta`, `cursors`, `paused`, `over`,
`err`, `pong`.

Entity wire format: `{id, k:"u"|"b", type, side, x, y, hp, maxhp, st}` + `{tx,ty,progress}` for
buildings under construction. Positions quantized to 1/16 tile.

---

## 6. What is built (all verified in a real browser)

21 buildings · 9 unit types · 5 eras · 16 techs in 4 branches · 5 civs (multipliers + tint + flags) ·
3 modes (Intro / Normal / Creative) · bot at Easy / Normal / Hard that builds its own city, advances
eras, and sends growing attack waves on schedule · AoE-style physical gathering with A* ·
carts + roads · walls / side-passable gates / towers · siege with anti-building bonus · shared
treasury, shared pause, per-player cursors · victory = destroy all enemy buildings (roads excluded) ·
minimap · tooltips (suppressed in Intro) · adaptive music (per era + battle layer) + Kenney SFX ·
`start.bat` (CRLF) + English README with LAN instructions.

Build history: Planner → 5 stage Coders (A skeleton/net, B economy, C combat+bot, D eras/techs/civs/
modes, E HUD/audio/packaging) → independent Reviewer. Each stage was browser-tested before the next
started. Reviewer verdict: **0 × P0**, 2 × P1 (both fixed), rest P2 (below).

---

## 7. Visual system (see `DESIGN.md` for the full spec — it is binding)

**"Smoked glass over pixel art."** The world stays warm 16px pixel art; all chrome is a cool dark
translucent glass layer; **one gold accent** (`#e8b64c`) is reserved for era / progress / victory.
Signature element is the **Era Ribbon** (roman numeral + era name + gold research progress fill;
clicking it selects the Town Center).

Two rules you must not break:
1. **Glass recipe:** `--glass` background + `backdrop-filter: blur(14px) saturate(140%)` + hairline
   `--stroke` border with a brighter `--stroke-bright` top edge.
2. **Gold budget:** gold marks progress and status only. Using it as a neutral surface dilutes the
   one thing that signals "something important happened".

**Terrain is generated, not sprite-sheet frames.** Mountains (3 boulder variants picked by
`(tx*7+ty*13)%3`), grass (3 speckled variants), water (2 ripple variants), and gold ore (rock mass +
embedded nuggets) are drawn with Phaser Graphics → `generateTexture` in `boot-scene.js`, then baked
into one RenderTexture. Trees are the Kenney tiny-town frame on the new grass base. Buildings and
units use real Kenney frames.

---

## 8. Traps — things that already cost a debugging cycle

Read this section before you debug anything. Every item here is a real incident.

1. **One session per server process.** After a game starts, every new page load gets a dead lobby.
   If Jurek says "the menu does nothing", ask whether the server has already run a game. Restart it.
2. **`texture.getBase64()` cannot read WebGL-backed textures.** Composed RenderTexture-based building
   textures return `null`. HUD icons are therefore built by compositing **raw PNGs on a 2D canvas**
   (`icons.js`), bypassing Phaser textures entirely. Do not "simplify" this back to `getBase64`.
3. **A hidden browser tab freezes `requestAnimationFrame`,** so Phaser sticks on BootScene and
   screenshots come back as a flat color. Front the tab before judging anything visually. This wasted
   two screenshot rounds.
4. **Completed buildings have no `progress` field at all.** A `progress >= 1` check is therefore
   false for finished buildings and silently hid Advance Era / Train Worker. Use
   `progress === undefined || progress >= 1`.
5. **Treasury holds floats; the wire rounds them.** Use `Math.floor` for display (done), otherwise
   the HUD shows 20 while `pay()` rejects at 19.99 and the player sees a contradictory error.
6. **Rejoin tokens live in `sessionStorage`, not `localStorage`** (PLAN says localStorage — this is a
   deliberate deviation). With localStorage, two tabs on one machine collide into the same player,
   which breaks all two-window testing. Trade-off: fully closing and reopening a tab loses the slot.
7. **Mouse scheme is the standard RTS convention (as of 2026-07-21): LEFT selects, RIGHT orders,
   MIDDLE-drag pans.** This was inverted for one session (2026-07-20, "owner's spec") and this file
   used to say "don't fix it back" — Jurek then explicitly asked to revert it, after research
   confirmed left-select/right-order is the AoE2/StarCraft convention and matches PLAN.md §8's
   original (never-changed) spec. So the inversion was itself the deviation, now undone. Don't
   "fix" it back to the inverted scheme either — read the git history if a future request seems to
   contradict this, rather than assuming either direction is permanent.
8. **`start.bat` must stay CRLF.** Write it with explicit `\r\n`; LF-only breaks on Windows.
9. **Subagents that die on a session limit can be resumed** with `SendMessage` to their agent id —
   they keep full context. Three of the five stage builds were finished that way. Do not restart a
   dead coder from scratch.
10. **A looping WebAudio source outlives the page unless you stop it.** `UCG.Audio` loops music with
    `src.loop = true`; closing the tab (or the embedded browser pane) used to leave it playing until
    the browser process was killed — Jurek had phantom music for 8 hours with no server running.
    Fixed via `stopAll()` on `pagehide` + socket close. If you add another persistent audio source,
    tear it down there too. Note `suspended` is load-bearing: without it `_music()` restarts the
    track on the very next `update()`.
11. **Phaser's `camera.scrollX`/`scrollY` are NOT the world-view's left/top edge once zoom != 1** —
    they carry a zoom-dependent internal offset (`(width - displayWidth) / 2` baked into the clamp
    math). Reading raw `scrollX` at the extremes looked like the camera was stuck 240px short of the
    map edge at zoom 2; the actual rendered region (`cam.worldView`) reached every corner correctly.
    If you need "what does the camera actually see", read `cam.worldView`, never `scrollX` directly.
    Also: this embedded browser pane's `requestAnimationFrame` doesn't reliably fire even after a
    screenshot fronts the tab (worse than Trap #3) — call `cam.preRender()` directly to force the
    bounds clamp/worldView update when you need a synchronous read instead of waiting on a frame.
12. **The camera has no scroll bounds (removed 2026-07-21, owner's explicit call)** — you can pan
    off the island in every direction past the water border indefinitely. This was a deliberate
    choice ("kamerą nie można odlecieć od wyspy... a tak nie powinno być"), not a bug; don't
    re-add `cam.setBounds()` to "fix" scrolling into empty space.
13. **There are no control groups (removed 2026-07-21, owner's explicit call)** — PLAN.md §8 still
    says "control groups 1–5 (Ctrl+n set, n recall)"; that line is now stale. Build-bar hotkeys are
    back on the digit row (`1`-`9`,`0` + Shift, exactly as originally shipped) since nothing competes
    for it anymore. `Ctrl+A` selects every owned unit instead. Same rule as Trap #7: check the
    changelog before assuming any control scheme is final — this project's controls have changed
    direction twice in two days on explicit request.

---

## 9. Known gaps / backlog (all P2 — none block play)

- `Math.random()` in 3 sim spots instead of the seeded PRNG (house pick, starvation victim, bot civ),
  so the logged seed does not fully reproduce a session. No desync risk (single authoritative server).
- `canPlace` does not check the road overlay — a building can be placed on a road tile, orphaning the
  road entity.
- Bot never trains knights; wave composition ratios and the "min 1 ram + 1 catapult" rule from
  PLAN §6 are simplified to "first affordable unit per building".
- Kenney Input Prompts key icons are unused (hotkeys render as text badges).
- No ws backpressure cap (PLAN §7 asks to skip non-keyframe deltas above 1 MB buffered).
- Soft collision can push a unit onto an enemy gate tile (stale side context in the walkability
  check). Cosmetic.
- Theoretical stalemate if both sides hit zero buildings on the same check — game never ends.
- `economy.resRateMult` scans all entities per gathering worker per tick — O(workers × entities).
  Fine at ~300 entities, the first thing to optimize if it ever gets slow.
- Production queue panel shows counts, not queued unit names. Rally point is client-local, so a
  teammate does not see your rally flag.
- Dock scrolls horizontally below ~1100px window width; era V can start off-screen.
- Food number pulses red on every upkeep tick — informative, possibly noisy over a long match.

---

## 10. How to work on this

**Permissions (from Jurek's global rules):** install packages, refactor, fix obvious adjacent bugs,
and commit **without asking**. **Never deploy without an explicit instruction** — and this project has
no deploy anyway (it needs its own Node server; there is no hosted build).

**Conventions:** English code/comments/commits, header comment per file only (no inline commentary),
files under ~400 lines, kebab-case lowercase filenames, LF line endings except `start.bat`.

**Before you change balance:** the numbers are duplicated in `shared/data-*.js` and `PLAN.md` §4 by
design (spec + implementation). Change both.

**Verification recipe that actually catches things:**
1. `node --check` every touched file.
2. Boot the server, `curl` any new static path for a 200.
3. Drive it in a real browser — front the tab, start a game, and script actions through
   `UCG.Net.send({...})` in the console while reading `UCG.State` for assertions.
4. For sim logic, write a throwaway harness in `/private/tmp` (never in the repo) that boots the
   server programmatically and asserts over accelerated ticks. This is how economy and combat were
   verified; the scripts are disposable.
5. Two-window multiplayer: open a second tab, ready both, start from the **second** one (the
   non-host path is the one that used to be broken).

**Vault:** this project has a memory file at
`~/Downloads/Claude/ClaudeMemory/projects/untitled-civ-game.md` — update it when something durable
changes (status, decisions, lessons). Session lessons go to `ClaudeMemory/inbox/` as dated notes.

---

## 11. Suggested next steps

1. **Jurek's playtest** is the gate for everything else. Expect balance feedback (bot aggression
   timing, gather rates, era pacing) and treat it as higher priority than any P2 above.
2. Then: bot army composition (knights, guaranteed siege per wave) — the most visible P2.
3. Then: seeded PRNG everywhere, so a seed reproduces a match for balance testing.
4. Out of scope for v1 by decision: docks/water units, per-civ unique units, in-app rematch, fog of
   war, save/load, joining after start, spectators, mobile.

---

## 12. Changelog

Newest first. **Append an entry here for every change.**

### 2026-07-21 — Control groups removed; build hotkeys back on digits; Ctrl+A select-all
Jurek asked to drop the numbered control groups entirely, put the build bar back on numbers, and
add a "select all" hotkey. Removed `UCG.Input.groups` and the `onKey` control-group handler from
`input.js`; the digit row (freed up) reverts the build bar in `hud.js` back to `HK_DIGITS`
(`1`-`9`,`0` + Shift), exactly the layout it shipped with before yesterday's QWERTY-grid detour.
New `UCG.Input.selectAll()` bound to `Ctrl+A` (extends the existing `keydown-A` listener, which
still arms attack-move on a plain press) — selects every own unit with the same criteria as the
box-select filter (workers, military, and carts alike). Updated the unit-panel hint text and
README's controls table. See Trap #13 — PLAN.md §8 documenting control groups is now stale by
explicit decision, not oversight.

### 2026-07-21 — Camera has no map border; mouse/hotkey scheme reverted to RTS standard
Two changes from the same request, verified independently.

1. **Camera bounds removed.** Jurek's actual complaint (after two rounds of clarifying questions —
   his first phrasing sounded like units should walk on water, which turned out not to be it) was
   that the camera hit a hard wall at the map edge and couldn't pan off the island. Verified first
   that `cam.setBounds()` was NOT clipping any part of the map — reverse-engineered Phaser's
   `clampX`/`clampY` from the minified bundle and confirmed `cam.worldView` reaches every corner at
   every zoom on Jurek's exact screen profile (1728×1080, DPR 2). The actual ask was that the camera
   *shouldn't have a border at all* — removed `cam.setBounds()` from `camera.js` entirely; panning
   past the water is now unlimited in every direction. See Traps #11–12.
2. **Mouse scheme reverted + build hotkeys moved to a QWERTY grid.** Researched standard RTS
   conventions (AoE2, StarCraft): left-click selects, right-click orders, Ctrl+n sets a control
   group, plain n recalls it. This is also PLAN.md §8's original (never-edited) spec — the inverted
   scheme from the 2026-07-20 UI overhaul was itself the deviation. Reverted in `input.js`
   (`onDown`/`onUp`/`onMove`: left = click-or-drag-box select, right = immediate context order,
   attack-move arms on `A` then fires on right-click) and `camera.js` (map-drag moved from left to
   middle button only). Build-bar hotkeys moved from digits (`1`-`9`,`0` + Shift) to the "grid
   layout" letters nearest the left hand's resting position — `Q W E R T` / `S D F G Z` + Shift for
   the second ten (skipping `A`, reserved for attack-move) — which also frees the digit row entirely
   for control groups. Updated `hud.js` (hotkey table + unit-panel hint text) and README's controls
   table. See Trap #7.

### 2026-07-20 — Audio teardown: music no longer outlives the page
Jurek reported music playing with no server running. Diagnosis: `pmset -g assertions` showed
Claude.app holding a "Playing audio" assertion for **8h10m** — the game had run in the embedded
browser pane hours earlier, the pane was closed, and the looping `BufferSource` in `UCG.Audio`
survived it. Nothing in the client ever stopped music: no `pagehide` handler, no socket-close
handler. Fix: `UCG.Audio.stopAll()` (stops every slot, clears `curMusic`/`combat`) wired to
`pagehide` and to a new `_close` pseudo-event from `net.js`; `_open` lifts the suspension so a
reconnect fades the era track back in on its own. The `suspended` flag guards `_fadeTo` — without
it `_music()` resurrects the track on the next `update()`, since `update()` keeps running after the
socket dies. Verified live: music stopped on `pagehide` (slots 1 → 0), stayed stopped through a
forced `_fadeTo`, and came back after a simulated reconnect. Also added as Trap #10.

### 2026-07-20 — First playtest round: 7 fixes
Jurek's first real play session produced seven items, all addressed:
1. **Bot expanded instantly** (three buildings up in the opening seconds, which reads as cheating).
   Added `openingDelay` / `buildInterval` / `maxSites` to `BOT_DIFF`: the bot now waits before its
   first extra building and never has more than 1–3 sites open. Measured second building at
   60 s (Easy) / 45 s (Normal) / 20 s (Hard), was ~1 s on all three.
2. **Build-bar hotkeys are digits**, not letters: `1`–`9`,`0` then `Shift`+the same for buildings
   11–20. Matched on `ev.code`, so Shift doesn't scramble them. Control groups moved off the bare
   digits to **Ctrl+1-5 (set) / Alt+1-5 (recall)**.
3. **Tree texture clashed** with the generated terrain — trees were the one Kenney frame left in the
   terrain set. Now drawn in the same language as the boulders (dark outline, lit top-left).
4. **Units rendered under roads.** Roads moved to their own container at depth 10, below units and
   buildings, and no longer fly a civ flag.
5. **House looked wrong** — it mixed a blue roof (frames 48/50, skipping 49) with orange doors. Now
   frames 52/54 over 72/85 (red roof, windowed wall, door) with a 3px `inset` so it sits on the
   ground instead of filling its whole footprint. `inset` is now a general option in the recipes.
6. **Custom cursor in every state**, never the native arrow: new `client/js/cursors.js` owns the
   whole set (idle/ui/hand/grab/attack/cross/no/busy/menu) and injects CSS so DOM chrome matches.
7. **Controls reworked** (owner's spec): WASD and edge-scroll removed; **arrow keys** pan;
   **left-drag grabs the map**; **right-click selects** (click and box); a clean left click issues
   the order. A 6px threshold separates a click from a drag.

### 2026-07-20 — Handoff document created
Added this file. No code change. Standing instruction from Jurek: keep it updated on every change.

### 2026-07-20 — Lobby: any player can start (`9d9487d`)
Start was host-only, host being the first socket to connect. A second player joining an existing
lobby got no Start button and no explanation — the menu looked functional but did nothing. This is
exactly what Jurek hit on first contact. Now any player can start once everyone is ready, matching
the rest of the co-op design (shared treasury, shared pause, shared civ/mode). The disabled button
names how many players it is waiting on; the player list marks `YOU` instead of a `HOST` whose powers
no longer exist. README updated. Verified in two windows: the non-host starts the game.

### 2026-07-20 — UI/UX overhaul (`5ba3bee`)
Full visual pass to the "smoked glass over pixel art" direction (`DESIGN.md`). Fixed three specific
complaints from Jurek: gold nodes looked like coins (now rock with embedded nuggets), mountain
texture was a repeating triangle grid (now 3 boulder variants), and resource icons were poor (new
`icons.js` pipeline with generated food/wood/stone/gold icons). Added the Era Ribbon signature
element, glass HUD chrome, redesigned lobby, glass minimap and tooltips, context cursors,
invalid-placement shake, pause scrim, end overlay. Fixed the `progress === undefined` bug that hid
Advance Era / Train Worker. Server untouched.

### 2026-07-18/19 — v1 built (`017e1b0`)
Full build across five stages with a Planner → Coders → Reviewer workflow, each stage browser-tested.
Reviewer: 0 × P0. Two P1s fixed on the spot — float treasury vs. HUD display (now `floor`), and the
`A` key conflict between camera pan and attack-move (now pans only when nothing is selected).
