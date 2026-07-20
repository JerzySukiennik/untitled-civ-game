# DESIGN.md — Untitled Civ Game visual system

**Concept: "Smoked glass over pixel art."** The world is warm, crisp 16px Kenney-style pixel art.
The chrome (HUD + lobby) is a cool, dark, translucent glass layer floating above it. One warm gold
accent is reserved for era / progress / victory moments. Keep future passes consistent with the rules
below.

## Design tokens (CSS custom properties, `:root` in `client/css/style.css`)

| Token | Value | Use |
|---|---|---|
| `--glass` | `rgba(16,18,14,0.62)` | standard panel background |
| `--glass-heavy` | `rgba(12,14,10,0.78)` | modals, lobby, tooltips, end card |
| `--stroke` | `rgba(255,255,255,0.08)` | hairline borders |
| `--stroke-bright` | `rgba(255,255,255,0.16)` | top-edge highlight (light catching the glass) |
| `--ink` / `--ink-dim` | `#f2efe6` / `rgba(242,239,230,0.55)` | primary / secondary text |
| `--gold` / `--gold-deep` | `#e8b64c` / `#b8862f` | THE accent — era, progress, victory, active states |
| `--danger` / `--ok` | `#e05545` / `#7fb069` | defeat/invalid/starve · valid/ready |
| `--spring` | `cubic-bezier(0.34,1.3,0.64,1)` | things that pop in (overshoot) |
| `--ease-out` | `cubic-bezier(0.22,1,0.36,1)` | hovers / fades |

## The two material rules

1. **Glass recipe (every chrome panel).** `background: var(--glass)` (or `--glass-heavy` for
   modals) + `backdrop-filter: blur(14px) saturate(140%)` + `border: 1px solid var(--stroke)` with
   `border-top-color: var(--stroke-bright)`. Radius 10px for bars/ribbons, 12–14px for cards.
   Shadow `0 10–14px 30–40px rgba(0,0,0,0.4–0.5)`.
2. **Gold budget.** Gold is spent *only* on progress and status: the Era Ribbon fill, the
   selected-for-placement stroke, `.on` toggles, the minimap camera rect, cost numbers, and VICTORY.
   Never use gold as a neutral surface — that's what dilutes it. Resource *gains* pulse gold; drops
   pulse `--danger`.

## Type

`font-family: system-ui` everywhere (no pixel/retro font — the clean chrome vs. pixel world contrast
*is* the aesthetic). HUD numbers use `font-variant-numeric: tabular-nums`. Eyebrows/labels: 11px,
`letter-spacing: 0.08em`, uppercase, `--ink-dim` (`.eyebrow` helper). Resource numbers 15px/600.

## Motion

Durations 160–260ms. `:active` on every button = `transform: scale(0.96)` (~90ms) — feedback on
press. Panels pop in with `--spring`; hovers/fades use `--ease-out`. Two accessibility guards, honored
in both CSS files: `@media (prefers-reduced-motion: reduce)` kills transforms/animations; `@media
(prefers-reduced-transparency: reduce)` drops blur and uses solid `#161a11` surfaces.

## Pixel icon pipeline (`client/js/icons.js` → `UCG.Icons`)

Load order: after `boot-scene.js` (needs the sprite textures), before `hud.js`. Call
`UCG.Icons.ensure()` once (HUD does this) to build the generated resource icons.

- **Resource icons are generated** on an offscreen canvas as crisp mini-illustrations, so they read
  unambiguously and match the world art: `food` = wheat sheaf, `wood` = stacked logs, `stone` =
  faceted boulder, `gold` = **gold nugget cluster (a mineral, deliberately NOT a coin)**, `pop` = the
  worker sprite. Exposed as `UCG.Icons.res.food/wood/stone/gold/pop` (and `.f/.w/.s/.g` aliases).
- **Building / unit icons** reuse the loaded Phaser sprite frames via `textures.getBase64` (the proven
  portrait path), displayed with `image-rendering: pixelated`. `UCG.Icons.building(type)` /
  `UCG.Icons.unit(type)`, cached.
- **`UCG.Icons.costHTML(cost)`** renders a `{f,w,s,g}` cost as icon+number microformats (`.ci`), used
  by the top bar, build-dock costs, selection panel, tooltips, and market chip. `resImg(k)` returns a
  single `<img>` for a resource key.

## World sprites (generated in `client/js/boot-scene.js`)

Terrain tiles are drawn with Phaser Graphics → `generateTexture` at 16px, then baked once into the
static terrain RenderTexture. `UCG.Frames.terrainTex(id, tx, ty)` picks a per-tile variant
deterministically (`(tx*7 + ty*13) % n`) to kill grid banding.

- **Gold ore** (`t_gold`): a gray rock mass with 4 embedded bright gold nuggets — reads as a mineral
  deposit, not currency. Palette in `PAL.rock` / `PAL.gold`.
- **Mountains** (`t_mountain`/`2`/`3`): 3 rocky-outcrop variants — overlapping boulders with a
  bottom-right shadow, top-left lit facet + highlight, dark outline, sat on a grass base. No snow cap,
  no triangle rows.
- **Grass** (`t_grass`/`2`/`3`): warm `#79a556` base with sparse 2px speckles (±luminance), 3 variants.
- **Water** (`t_water`/`2`): base blue + a few 1px ripple dashes, 2 variants.
- **Depletion**: when a node drops below 25% of its initial amount, `state.js` flags the tile and
  `game-scene.js` overlays `t_deplete` (semi-transparent dark) so players see it running out.

## Where the accent lives (quick map)

Era Ribbon fill + level-up glow, minimap camera rect, resource-gain pulse, cost numbers, placement
`.active` stroke, ready/toggle `.on`, VICTORY title. Everything else stays cool glass + ink.
