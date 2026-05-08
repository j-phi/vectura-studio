# Meridian Blue — Token & Motion Reference

Source: `docs/design/themes-mockup.html` (verbatim provenance copy of the Meridian Blue mockup).

This document enumerates every CSS variable and motion spec the new skin family declares. Per-skin palette files (`src/ui/skin/meridian-dark.css`, `src/ui/skin/meridian-light.css`) override only the palette tokens; structural tokens are shared and live in `src/ui/skin/tokens.css`.

## Structural tokens (mode-independent)

| Variable | Value | Purpose |
|---|---|---|
| `--pane-left-width` | `290px` | Left pane width |
| `--pane-right-width` | `258px` | Right pane width |
| `--bottom-pane-height` | `148px` | Bottom (formula) pane height |
| `--row-height` | `30px` | Standard row height for controls, headers |
| `--font-ui` | `'Space Grotesk', system-ui, sans-serif` | UI font |
| `--font-mono` | `'JetBrains Mono', monospace` | Numeric/value/code font |
| `--font-size-base` | `12px` | Body text |
| `--font-size-sm` | `11px` | Labels, menu items |
| `--font-size-xs` | `10px` | Slider values, captions, status |
| `--radius-sm` | `4px` | Inputs, buttons |
| `--radius-md` | `8px` | Header buttons, layer items |
| `--radius-lg` | `12px` | Toolbars |
| `--spacing-xs` | `4px` | Tight gaps |
| `--spacing-sm` | `8px` | Standard gaps |
| `--spacing-md` | `12px` | Padded sections |
| `--spacing-lg` | `16px` | Loose layout gaps |

## Palette tokens — Dark mode (`meridian-dark`)

| Variable | Value | Notes |
|---|---|---|
| `--ui-bg` | `#1b1b1b` | App background |
| `--ui-panel` | `#252525` | Pane / header / dropdown surface |
| `--ui-panel-alt` | `#1e1e1e` | Section header / formula bar |
| `--ui-border` | `#363636` | Standard borders, dial rings |
| `--ui-border-hi` | `#484848` | Hovered/strong borders, scrollbar thumb |
| `--ui-text` | `#e0e0e0` | Primary text |
| `--ui-text-2` | `#a8a8a8` | Secondary / control labels |
| `--ui-muted` | `#686868` | Captions, sub-labels, idle icons |
| `--ui-accent` | `#4e9ee1` | Primary brand accent |
| `--ui-accent-2` | `rgba(78,158,225,0.12)` | Accent fill (hover, ring, badge bg) |
| `--ui-danger` | `#e05252` | Destructive actions |
| `--ui-ctrl` | `#2c2c2c` | Inputs, segmented background |
| `--ui-ctrl-hov` | `#343434` | Hover state of controls/menu items |
| `--ui-workspace` | `#111111` | Canvas backdrop |
| `--ui-formula` | `#b0b0b0` | Formula equation text |
| `--slider-start` | `#80c4f0` | Slider gradient origin |
| `--shadow-sm` | `0 1px 4px rgba(0,0,0,0.4)` | Light elevation |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.5)` | Medium elevation |
| `--shadow-lg` | `0 8px 32px rgba(0,0,0,0.6)` | Modal / dropdown |
| `--shadow-pane` | `4px 0 24px rgba(0,0,0,0.35)` | Left pane edge |

## Palette tokens — Light mode (`meridian-light`)

| Variable | Value | Notes |
|---|---|---|
| `--ui-bg` | `#efefef` | |
| `--ui-panel` | `#fafafa` | |
| `--ui-panel-alt` | `#f2f2f2` | |
| `--ui-border` | `#c8c8c8` | |
| `--ui-border-hi` | `#a0a0a0` | |
| `--ui-text` | `#1a1a1a` | |
| `--ui-text-2` | `#505050` | |
| `--ui-muted` | `#888888` | |
| `--ui-accent` | `#0e6fe0` | |
| `--ui-accent-2` | `rgba(14,111,224,0.10)` | |
| `--ui-danger` | `#c0392b` | |
| `--ui-ctrl` | `#ffffff` | |
| `--ui-ctrl-hov` | `#ebebeb` | |
| `--ui-workspace` | `#d5d5d5` | |
| `--ui-formula` | `#404040` | |
| `--slider-start` | `#60b0f0` | |
| `--shadow-sm` | `0 1px 4px rgba(0,0,0,0.08)` | |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.10)` | |
| `--shadow-lg` | `0 8px 32px rgba(0,0,0,0.12)` | |
| `--shadow-pane` | `4px 0 20px rgba(0,0,0,0.07)` | |

## Vectura Tailwind RGB tokens (palette-decomposed)

These satisfy existing `bg-vectura-*` Tailwind classes so legacy markup keeps painting.

### meridian-dark

| Variable | RGB triplet | Source token |
|---|---|---|
| `--vectura-bg-rgb` | `27 27 27` | `--ui-bg` `#1b1b1b` |
| `--vectura-panel-rgb` | `37 37 37` | `--ui-panel` `#252525` |
| `--vectura-border-rgb` | `54 54 54` | `--ui-border` `#363636` |
| `--vectura-text-rgb` | `224 224 224` | `--ui-text` `#e0e0e0` |
| `--vectura-muted-rgb` | `104 104 104` | `--ui-muted` `#686868` |
| `--vectura-accent-rgb` | `78 158 225` | `--ui-accent` `#4e9ee1` |
| `--vectura-danger-rgb` | `224 82 82` | `--ui-danger` `#e05252` |

### meridian-light

| Variable | RGB triplet | Source token |
|---|---|---|
| `--vectura-bg-rgb` | `239 239 239` | `--ui-bg` `#efefef` |
| `--vectura-panel-rgb` | `250 250 250` | `--ui-panel` `#fafafa` |
| `--vectura-border-rgb` | `200 200 200` | `--ui-border` `#c8c8c8` |
| `--vectura-text-rgb` | `26 26 26` | `--ui-text` `#1a1a1a` |
| `--vectura-muted-rgb` | `136 136 136` | `--ui-muted` `#888888` |
| `--vectura-accent-rgb` | `14 111 224` | `--ui-accent` `#0e6fe0` |
| `--vectura-danger-rgb` | `192 57 43` | `--ui-danger` `#c0392b` |

## Motion specs

All durations are in milliseconds. `--motion-*-dur` / `--motion-*-ease` etc. are written by `App.applyTheme` from each skin's manifest.

| Key | Duration | Easing | Peak/Dip | Notes |
|---|---|---|---|---|
| `sliderPulse` (`fx-pulse-fill`) | 550 | `ease-out` | peak 0.36 @ 12% | 4 px white halo via `box-shadow` |
| `thumbRelease` | 350 | `ease-out` | — | 7px → 0px ring around thumb |
| `btnFade` (`btn-press`) | 300 | `ease-out` | dip 0.42 @ 28% | Opacity dip |
| `dialWave` | 520 | `cubic-bezier(0.23,1,0.32,1)` | peak 0.63, maxR 24 | rAF-driven SVG circle r 1→25 |
| `panelSlide` | 220 | `cubic-bezier(0.22,1,0.36,1)` | — | Section collapse `max-height` |
| `modalEnter` | 220 | default | — | Modal scale+fade in |
| `toastIn` | 260 | default | — | Toast slide+fade in |
| `toastOut` | 200 | default | — | Toast slide+fade out |

Reduced-motion: when `prefers-reduced-motion: reduce`, all animations collapse to ≤80 ms or are skipped entirely (rAF-driven dial wave is bypassed).

## Accent details

- **Section header left-accent bar (`.sect-hdr::before`):** 3 × 14 px, `--ui-accent` background, opacity 0.45 idle → 1.0 hover, 0.15 s transition. Easy to miss; required for parity.
- **Sliders:** main 4 px tall; pen sliders 3 px tall.
- **Dial release wave:** rAF-driven SVG circle inside `<clipPath id="dial-face-clip">` per dial; r `1 → 25`, stroke-width `1.4 → 0.4`, opacity `0.63 → 0`, easing `1 - (1 - p)^2.5`.
- **Estimation stats:** rendered inside the Pens tab body, not a separate section.
- **Floating skin switcher:** fixed bottom-center pill, `z-index: 99999`, backdrop-blur 14 px.
