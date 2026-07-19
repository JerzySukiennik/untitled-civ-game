# Asset Manifest — Untitled Civ Game

All assets CC0 (public domain). Sources + URLs in `CREDITS.txt`.
Total size: ~3.8 MB.

Phaser loading notes:
- Tile sheets have **zero margin/spacing** — load with `this.load.spritesheet(key, path, { frameWidth: N, frameHeight: N })`. Frame index = `row * columns + col` (0-based, left-to-right, top-to-bottom).
- Audio is **mp3** (chosen over OGG for iOS Safari support). Load with `this.load.audio(key, path)`.
- All icon/cursor PNGs have transparent backgrounds.

---

## tiles/  (16x16 pixel-art, except mappack)

Tiny-pack sheets are the **`tilemap_packed.png`** variant from each Kenney pack (0px spacing).
Frame size **16x16**. Full tile catalog (which index = which sprite) is in each pack's original
`Tilemap/tilemap.png` reference image on kenney.nl; indices are identical across the three tiny sheets
where sprites overlap, but each pack adds its own themed tiles.

| File | Real px | Grid (cols x rows) | Frame | Pack | Contents |
|---|---|---|---|---|---|
| `tiny-town_packed.png`   | 192x176 | 12 x 11 (132 frames) | 16x16 | Kenney Tiny Town   | Grass/dirt/water terrain, paths, fences, trees, houses, wells, market stalls, town props |
| `tiny-farm_packed.png`   | 192x176 | 12 x 11 (132 frames) | 16x16 | Kenney Tiny Farm   | Farmland, crops (growth stages), soil, barns, silos, animals, farm props |
| `tiny-battle_packed.png` | 288x176 | 18 x 11 (198 frames) | 16x16 | Kenney Tiny Battle | Units (soldiers, cavalry, tanks), flags, tents, cannons, banners, combat terrain |
| `mappack_tilesheet.png`  | 1088x768 | 17 x 12 (204 frames) | **64x64** | Kenney Map Pack | Larger-scale terrain: roads, rivers, crossroads, bridges, coastline, grass/sand/water. **NOTE: 64px tiles — 4x the tiny packs' scale.** Use as a separate zoomed terrain layer, or downscale to 16px if mixing with tiny art. |

## cursors/  (32x32, transparent — for per-player RTS cursors)

Monochrome white-with-shadow style (Kenney Cursor Pack, PNG/Basic/Default). No pre-colored variants —
tint at runtime (`sprite.setTint(0xRRGGBB)`) to distinguish co-op players.

| File | Use |
|---|---|
| `pointer_a.png`         | Default arrow pointer |
| `pointer_a_outline.png` | Outline variant (higher contrast on light tiles) |
| `hand_point.png`        | Select / interact |
| `hand_open.png`         | Pan / grab map |
| `target_a.png`          | Attack / target unit |
| `cross_large.png`       | Precision place / aim |
| `cursor_busy.png`       | Loading / processing |
| `cursor_disabled.png`   | Invalid action |
| `cursor_menu.png`       | Context-menu indicator |

## ui/  (64x64, transparent — input-prompt key/mouse icons)

Kenney Input Prompts 1.5, "Keyboard & Mouse/Default" set. Camera pan (WASD), mouse actions, Esc, Space.

| File | Key/Input |
|---|---|
| `keyboard_w.png` / `_a` / `_s` / `_d` | W A S D (camera pan) |
| `keyboard_space.png`  | Space |
| `keyboard_escape.png` | Esc (menu/cancel) |
| `mouse.png`        | Generic mouse |
| `mouse_left.png`   | Left click (select) |
| `mouse_right.png`  | Right click (command/move) |
| `mouse_scroll.png` | Scroll wheel (zoom) |
| `mouse_move.png`   | Mouse move / drag |

## sounds/  (mp3, mono, 22050 Hz, 48 kbps — UI SFX)

Kenney Interface Sounds, converted OGG -> mp3. Short (<1s each).

| File | Trigger |
|---|---|
| `click.mp3` / `click_soft.mp3` | Button clicks |
| `select.mp3`  | Select unit/tile |
| `confirm.mp3` | Confirm action / build |
| `back.mp3`    | Cancel / go back |
| `open.mp3` / `close.mp3` | Open/close panel |
| `toggle_on.mp3` / `toggle_off.mp3` | Toggle setting |
| `switch.mp3`  | Tab/mode switch |
| `drop.mp3`    | Place / drop item |
| `tick.mp3`    | Small increment / hover tick |
| `scroll.mp3`  | List/menu scroll |
| `error.mp3`   | Invalid / denied |

## music/  (mp3, stereo, 44100 Hz, 96 kbps — looping BGM)

Seamless loops. See `CREDITS.txt` for per-track source (two different CC0 authors).

| File | Mood | Length | Source |
|---|---|---|---|
| `calm_building_1.mp3` | Calm / peaceful build phase | 17s | Short Loops Pack ("A Brand New Wisdom") |
| `calm_building_2.mp3` | Calm / lighthearted | 25s | Short Loops Pack ("Swinging Sweet") |
| `calm_building_3.mp3` | Calm / wintry ambient | 23s | Short Loops Pack ("Winter Dust") |
| `tension_battle_1.mp3` | Tension / battle (chiptune) | 73s | Junkala Action Chiptunes ("Level 2") |
| `tension_battle_2.mp3` | Tension / battle, intense (chiptune) | 82s | Junkala Action Chiptunes ("Level 3") |
| `late_era.mp3` | Driving / advanced-era (chiptune) | 74s | Junkala Action Chiptunes ("Level 1") |
