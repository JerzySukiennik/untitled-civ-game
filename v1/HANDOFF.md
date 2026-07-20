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
7. **The `A` key does double duty** — camera pan and attack-move arm. It only pans when nothing is
   selected. Keep that guard if you touch `camera.js`.
8. **`start.bat` must stay CRLF.** Write it with explicit `\r\n`; LF-only breaks on Windows.
9. **Subagents that die on a session limit can be resumed** with `SendMessage` to their agent id —
   they keep full context. Three of the five stage builds were finished that way. Do not restart a
   dead coder from scratch.

---

## 9. Known gaps / backlog (all P2 — none block play)

- `Math.random()` in 3 sim spots instead of the seeded PRNG (house pick, starvation victim, bot civ),
  so the logged seed does not fully reproduce a session. No desync risk (single authoritative server).
- `canPlace` does not check the road overlay — a building can be placed on a road tile, orphaning the
  road entity.
- Bot never trains knights; wave composition ratios and the "min 1 ram + 1 catapult" rule from
  PLAN §6 are simplified to "first affordable unit per building".
- Kenney Input Prompts key icons are unused (hotkeys render as text badges); hotkeys are a letter
  pool, not strictly the Q row.
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
