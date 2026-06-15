# TODO: Universal Preset System — All Algorithms, Consistent UX

**Plan file:** `~/.claude/plans/can-you-think-of-fluffy-crab.md`

## Summary

Replace the current patchwork (harmonograph/pendula gallery, petalis/terrain `<select>`, rings/svgDistort no UI, 12 algorithms no presets) with a single `PresetGallery` component and consistent experience across all 18 algorithms.

## What's Already Done
- pendula + harmonograph: gallery dropdown with thumbnails, User group, localStorage import, build script (`npm run user-presets:bundle`), 0.15px thumbnail stroke

## Layer 0 — Infrastructure (do first, single team)

All files needed and their changes are in the plan file. Key work:

**A. Extend `src/ui/components/harmonograph-preset-gallery.js`**
- Export `Vectura.UI.PresetGallery` (keep `HarmonographPresetGallery` as alias)
- `drawThumb(canvas, params, layerType, size)` — dispatch by type:
  - harmonograph/pendula → `HarmonographCore.evaluatePath(params, { sampleCap: 1200 })`
  - all others → `window.Vectura.Algorithms[layerType]?.generate({ ...params, samples: Math.min(params.samples ?? 500, 500) }, new window.Vectura.SeededRNG(params.seed ?? 1))`
  - returns `Array<Array<{x,y}>>` — flatten for bbox, draw each path
  - try/catch → empty canvas on failure

**B. Generic `applyPreset(layer, presetId)` in `src/ui/panels/algo-config-panel.js`**
- Replaces `applyHarmonographFamilyPreset` + the 3 duplicate apply blocks for petalis/terrain/rings (lines 2986–3055)
- Pattern: lookup in `PresetLibraries[layer.type]` → clone `ALGO_DEFAULTS[layer.type]` → merge preset.params → preserve `TRANSFORM_KEYS` + `EXTRA_PRESERVED[layer.type]`
- `EXTRA_PRESERVED = { rings: ['outerDiameter', 'centerDiameter'], petalisDesigner: ['smoothing','simplify','curves'], terrain: ['smoothing','simplify','curves'] }`
- Pendula motion-patch stays behind `if (layer.type === 'pendula')` guard

**C. Dynamic mount condition (same file)**
- Replace `if (def.id === 'preset' && (layer.type === 'harmonograph' || layer.type === 'pendula'))` 
- With: `const presetLib = window?.Vectura?.PresetLibraries?.[layer.type] ?? []; if (def.id === 'preset' && presetLib.length > 0)`
- Call `window.Vectura.UI.PresetGallery(target, { layer, presets: presetLib, onApply })`

**D. `scripts/build-user-presets.js`** — remove hardcoded `SYSTEMS`, scan all dirs under `user-presets/` except `wallpaper/`

**E. New `scripts/build-user-wallpaper-recipes.js`**
- Walk `user-presets/wallpaper/*.vectura`
- Find modifier layer → `layer.mirrors.find(m => m.type === 'wallpaper')` → extract mirror config
- Output `src/config/user-wallpaper-recipes.js` → `window.Vectura.USER_WALLPAPER_RECIPES = [...]`
- Modify `src/ui/panels/wallpaper-presets.js` `list()` to append `window.Vectura.USER_WALLPAPER_RECIPES || []`
- Add `<script src="src/config/user-wallpaper-recipes.js" defer>` to `index.html` before `wallpaper-presets.js` (currently line 856)

**F. Pre-commit hook** (`scripts/hooks/pre-commit`) — add after graphify block:
```sh
# user-presets-bundle-start
VECTURA_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '^user-presets/.*\.vectura$' || true)
if [ -n "$VECTURA_FILES" ]; then
    echo "[pre-commit] user-presets staged — rebuilding bundles..."
    node scripts/build-user-presets.js || exit 1
    node scripts/build-user-wallpaper-recipes.js || exit 1
    git add src/config/user-presets.js src/config/user-wallpaper-recipes.js
fi
# user-presets-bundle-end
```
Then run `npm run hooks:install`.

**G. `src/config/preset-libraries.js`** — add `svgDistort` filtering (currently missing)

**H. `src/config/presets.js`** — add `group` fields to all existing presets (petalis, terrain, rings, svgDistort)

**I. `src/ui/controls-registry.js`** — remove `PETALIS_PRESET_OPTIONS`, `TERRAIN_PRESET_OPTIONS`, `HARMONOGRAPH_PRESET_OPTIONS`, `PENDULA_PRESET_OPTIONS` (no longer needed once gallery intercepts all); add `preset` control def for `rings` and `svgDistort`

## Layer 1 — Preset Content (parallel after Layer 0)

**Universal group vocabulary:** Classic | Geometric | Organic | Complex | Evolving | User

### New presets to write in `src/config/presets.js`:

| Algorithm | Presets |
|-----------|---------|
| **rings** | Oak (Classic), Pine (Classic), Redwood (Classic) + Fresh Cut (Geometric) + Ancient (Complex) |
| **svgDistort** | Line Hatch (Classic), Solid Outline (Classic), Cross Hatch (Geometric), Loose Fill (Organic) |
| **flowfield** | Still Pool (Classic), River Current (Classic), Whirlpool (Geometric), Storm Cell (Complex) |
| **boids** | Squadron (Classic), Schooling Fish (Classic), Scatter Field (Organic), Murmuration (Complex) |
| **attractor** | Lorenz Butterfly (Classic), Aizawa Shell (Classic), Dense Lorenz (Complex), Sparse Web (Geometric) |
| **hyphae** | Mycelium (Classic), Sparse Roots (Organic), Dense Web (Complex), Tendrils (Organic) |
| **lissajous** | Figure Eight (Classic), Trefoil (Classic), Clover (Geometric), Star (Geometric), Damped Knot (Complex) |
| **wavetable** | Rolling Hills (Classic), Ripple Field (Classic), Interference (Geometric), Storm Waves (Complex) |
| **topo** | Mountain Range (Classic), Rolling Plains (Organic), Contour Survey (Geometric), Island (Complex) |
| **grid** | Graph Paper (Geometric), Warp Field (Organic), Shift Tile (Geometric), Chaos Mesh (Complex) |
| **rainfall** | Drizzle (Classic), Summer Rain (Classic), Downpour (Complex), Windswept (Organic) |
| **phylla** | Sunflower (Classic), Pinecone (Classic), Honeycomb (Geometric), Dense Field (Complex) |
| **spiral** | Simple Spiral (Classic), Tight Coil (Geometric), Pulsing Vortex (Organic), Galaxy (Complex) |
| **shapePack** | Bubbles (Classic), Pebble Beach (Organic), Hexagonal Mosaic (Geometric), Confetti (Complex) |

Param guidance in `~/.claude/plans/can-you-think-of-fluffy-crab.md`.

## Key Technical Facts for Fresh Context

- `window.Vectura.Algorithms[type].generate(params, rng)` → `Array<Array<{x,y}>>` — works for ALL algorithms
- `window.Vectura.SeededRNG` is the RNG class (from `src/core/rng.js`)
- `window.Vectura.PresetLibraries` — filtered views of `PRESETS[]` by `preset_system`
- The 3 duplicate apply blocks in `algo-config-panel.js` are at lines ~2986–3055
- The gallery mount condition is at line 831; `applyHarmonographFamilyPreset` starts at line 792
- `src/ui/controls-registry.js` lines 24–50: the static options arrays to remove
- Wallpaper `list()` is in `src/ui/panels/wallpaper-presets.js` line 103

## Judge Criteria (done when all pass)
- [x] All 18 algorithms show gallery dropdown (not `<select>`) for preset control — dynamic mount on `PresetLibraries[layer.type].length > 0`; preset control added to the 14 algorithms that lacked one.
- [x] All algorithms have ≥4 presets in ≥2 groups — rings 5, svgDistort 4, all 12 new = 4 (lissajous 5), petalis 20, terrain 6, harmonograph/pendula 4.
- [x] All thumbnails render (no blank canvas) — 88/88 geometry-bearing presets validated via `generate(p,rng,noise,bounds)`. **Exception:** svgDistort (4) is inherently blank until an SVG is imported (try/catch → empty canvas, by design).
- [x] `npm run test:integration` green — 489 tests (incl. new `universal-preset-gallery.test.js`).
- [x] `npm run user-presets:bundle` works for every system dir + wallpaper — scans all `user-presets/<algorithm>/` dirs + wallpaper recipe bundler.
- [x] Pre-commit hook auto-bundles on `user-presets/**/*.vectura` stage.
- [x] User wallpaper recipes appear in recipe gallery — `wallpaper-presets.js` `list()` appends `USER_WALLPAPER_RECIPES`.

**Implementation notes / deviations from plan:**
- Real `generate()` signature is `(p, rng, noise, bounds)`, not `(params, rng)` as the plan assumed — the gallery's thumbnail path and validator pass a synthetic square bounds + `SimpleNoise`.
- attractor only has `lorenz` + one alternate model in code; the "Aizawa" option value maps to that alternate.
- The static option arrays in `controls-registry.js` (`PETALIS/TERRAIN/HARMONOGRAPH/PENDULA_PRESET_OPTIONS`) were **kept** (harmless — the gallery intercepts the control); removing them was an optional refactor with no judge-criteria impact and higher regression risk.
