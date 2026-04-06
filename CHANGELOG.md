# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally human-curated with an `Unreleased` section that collects work before release.

## Unreleased

### Added
- Added a global dark/light theme toggle in the header, with full-shell CSS-variable theming across panes, menus, modals, tool chrome, helper widgets, and canvas surround.
- Added `Insert > Mirror Modifier`, a new modifier-container layer type that behaves like a group in the Layers panel while applying a sequential mirror-axis stack to its child layers.
- Added mirror-guide canvas overlays with dashed full-canvas axes, reflection-direction triangles, separate rotate handles, and per-axis/stack show-hide, lock, reorder, and delete controls.
- Added unit, integration, and Playwright coverage for mirror modifier geometry, state roundtrip, and the new Insert-menu workflow.
- Added Illustrator-style Rectangle (`M`), Oval (`L`), and Polygon (`Y`) shape tools that create editable `expanded` layers, including polygon side-count changes during draft and shape-aware corner-rounding handles.
- Added export coverage for masked shape geometry with `Remove Hidden Geometry` enabled and disabled, plus focused unit/browser tests for shape creation flows.
- Added Illustrator-style parent-mask coverage so visible mask parents clip their full descendant subtree on canvas and in SVG export.
- Added a `Hide Mask Layer` option on mask parents so the parent can keep clipping descendants while suppressing its own visible artwork on canvas and in export.

### Changed
- Switching dark/light theme now updates the document background default and flips `Pen 1` between white and black, propagating the pen color to existing `pen-1` layers while keeping theme as a personal cookie-backed preference instead of project state.
- Fixed direct-edited circle mask parents so descendant clipping now follows the edited outline immediately instead of continuing to use stale circle metadata, with runtime and Playwright regressions to keep mask edits in sync.
- Fixed `Export Optimized` so masked exports no longer implicitly remove hidden geometry when `Remove Hidden Geometry` is off; optimized SVG export now preserves full source geometry and applies ancestor clip paths non-destructively.
- Removed the duplicate top-level `Remove Hidden Geometry` checkbox from Document Setup so the Export Settings card is the single UI control for that export-only setting, with regression coverage for its default-on behavior.
- The engine now computes modifier-aware effective geometry before display, masking, optimization, stats, and export so mirrored child layers render and export consistently.
- Mirror-masked closed shapes now stay valid silhouette providers, so masked children under a Mirror Modifier clip against the mirrored closed mask union instead of disappearing when the mask produces multiple disjoint silhouettes.
- Left-panel controls now switch between `Algorithm` and `Modifier` modes, hiding `Transform & Seed` for modifier containers and exposing Mirror Stack configuration instead.
- Mirror Modifier children can now be dragged back out to the root to unparent them, deleting a modifier dissolves only the wrapper and preserves its children, and `+ Add` under a selected modifier creates a normal drawable child instead of a bogus `mirror` layer.
- Mirror Modifier children now stay fully editable when selected, so nested child rows switch the left panel back to normal `Algorithm` controls and can still change algorithm, settings, and transforms while inheriting the mirror effect from their parent modifier.
- Rectangle and Polygon shape-tool layers now start with straight-edge primitive rendering instead of inheriting `Curves` from the previously selected layer, and rotated primitive selections keep their bounds plus corner-rounding handles aligned to the transformed shape geometry.
- Fixed algorithm switching so changing a generator layer type clears stale manual-geometry contamination, regenerates the artboard immediately, and stays covered by integration plus Playwright geometry regressions.
- Mask-parent move/resize/rotate drags now ghost-preview the masked descendant subtree against the transformed silhouette until mouse release.
- Rectangle, Oval, and Polygon creation plus single-shape Selection now use an Illustrator-style reticle cursor while keeping existing handle, drag, and center-out `Alt/Option` behaviors intact.
- Added `Remove Hidden Geometry` to `Document Setup > Export Settings`, defaulting it on so exported SVGs can destructively trim masked and frame-hidden geometry to match the current visible frame while still allowing non-destructive clip-path export when turned off.
- Replaced the old source-layer clipping workflow with Illustrator-style parent masks: mask state now lives on the visible parent, descendant layers are indented beneath it, legacy `sourceIds` masks are cleared on load, and export clip paths are derived from ancestor mask silhouettes instead of arbitrary source lists.
- Reworked `Wavetable` Horizon around a regularized underlying perspective grid so horizontal and vertical spacing stays stable by construction before terrain-aware occlusion is applied.
- Rebuilt Horizon column sampling from fixed per-column terrain nodes, which keeps column identity consistent through occlusion and allows hidden segments to reappear without spawning uneven replacement lines.
- Retuned the shipped Horizon defaults and help text toward a cleaner synthwave valley profile with a more disciplined skyline and more readable foreground grid.
- Added deterministic Horizon regression coverage for exact underlying row/column counts, monotonic column ordering, spacing stability, and post-occlusion column identity, plus a canonical Horizon SVG baseline.
- Added `Horizon 3D` as a new `Wavetable` line structure that projects a true heightfield plane instead of clipping deformed 2D rows after the fact.
- `Horizon 3D` now applies noise and valley/shoulder shaping in plane space, hides rows and columns through a private surface depth buffer, and emits a surface-derived silhouette envelope for masking.
- The Wavetable controls/help text now distinguish legacy `Horizon` from `Horizon 3D`, while keeping the existing Horizon control ids mapped onto the new surface model.
- Added `Horizon 3D` unit coverage for mesh counts, projected ordering, occlusion identity, and floater suppression, plus a dedicated SVG baseline.
- Fixed `Remove Hidden Geometry` export to correctly clip ancestor-masked layers; the export now uses `displayMaskActive` (matching the canvas renderer) instead of `layer.mask?.enabled`, so child layers clipped by a parent mask are properly trimmed on export.
- Improved accessibility across all UI: theme-aware canvas reticle cursor, `prefers-reduced-motion` support, `aria-live` on notification toasts, modal focus management, `aria-pressed`/`aria-current`/`aria-expanded` on interactive controls, visible focus rings, and a minimum 11 px text-size floor.

## 0.6.80 - 2026-03-01

### Changed
- Restored legitimate `Wavetable` Horizon vertical fan lines by rebuilding column visibility from the full clipped terrain rows and hiding them only when they are actually occluded by nearer terrain strips.
- Relaxed the post-occlusion reconnect rule so verticals can reappear after passing behind a ridge, which fixes missing visible fan lines on the saved broken masking fixture.

## 0.6.79 - 2026-03-01

### Changed
- Pruned additional short Horizon shoulder columns that survived occlusion but did not carry enough visible surface to read as real contour lines, reducing remaining hidden-line clutter on the saved masking fixture.

## 0.6.78 - 2026-03-01

### Changed
- Fixed the Layers-panel `Clip` trigger so the clipping-mask popover opens reliably from the layer rows in the saved masking-scene workflow.
- Changed `Wavetable` Horizon masking to clip against the first visible terrain row, which restores the intended sky bowl instead of filling the entire skyline basin.
- Tightened Horizon vertical-fan visibility so only segments that reconnect at the visible skyline survive, which removes additional hidden backface fragments on steep shoulder slopes.

## 0.6.77 - 2026-03-01

### Changed
- Switched `Wavetable` Horizon masking back to explicit visible terrain-strip polygons so masked background layers hug the rendered landscape contour instead of clipping against a coarse inferred envelope.
- Culled detached post-occlusion Horizon column fragments and tighter nearer-band overlaps so shoulder/backface fan artifacts are reduced in saved masking scenes without breaking the main terrain fan.
- Tightened the Layers-panel clipping control with a more obvious `Clip` action and kept masking interactions scoped to the layer list workflow.

### Added
- Added a screenshot-based Playwright regression that loads the checked-in `broken-masking.vectura` fixture and snapshots the real saved masking case.

## 0.6.76 - 2026-03-01

### Changed
- Changed Horizon masking to follow the topmost visible Horizon row so masked background geometry meets the terrain edge without an artificial gap.
- Tightened Horizon shoulder visibility by deriving the full vertical fan from the same culled visible-row set, which removes additional backface lines on steep ridges.

## 0.6.75 - 2026-03-01

### Changed
- Removed Horizon's extra edge-anchor rays so the terrain mesh no longer emits off-pattern diagonal landscape lines that do not align with the vertical contour fan.
- Re-verified the saved broken masking scene against a fresh browser render so clipping masks terminate behind the visible terrain contour instead of bleeding through the landscape shoulders.

### Added
- A screenshot-based Playwright masking regression for the Horizon-plus-Rings landscape composition.

### Changed
- Fixed Horizon masking so subtraction uses the final visible terrain surface strips instead of a single coarse envelope, which makes hidden shapes hug the projected terrain contours in saved scenes.
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.74 - 2026-03-01

### Added
- A screenshot-based Playwright masking regression for the Horizon-plus-Rings landscape composition.

### Changed
- Fixed Horizon masking so subtraction uses the final visible terrain surface strips instead of a single coarse envelope, which makes hidden shapes hug the projected terrain contours in saved scenes.
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.73 - 2026-03-01

### Added
- A masking-specific SVG visual baseline that locks in a `Wavetable` Horizon terrain masking `Rings` behind it.

### Changed
- Fixed Horizon masking so silhouette subtraction uses the highest visible terrain envelope instead of only the top horizon row, which restores proper overlap hiding for landscape masks.
- Added `id`/`name` wiring to the new masking editor checkboxes so the masking controls no longer contribute anonymous form fields.
## 0.6.72 - 2026-03-01

### Added
- Live non-destructive layer masking for silhouette-capable layers, including layer-row `Mask` controls, mirrored left-panel masking controls, and `Convert To Geometry` materialization into expanded lines.
- A new masking/display-geometry stage in the engine with `src/core/masking.js` and `src/core/path-boolean.js`.
- Unit coverage for masking silhouette eligibility, mask subtraction, and engine-level masked display geometry.

### Changed
- `wavetable` Horizon vertical fans now sample by screen-space X against the visible terrain rows, so the vertical fan follows the same ridge and valley contours as the horizontal terrain mesh.
- Horizon now emits explicit edge anchor rays so strong vanishing-point pulls can still keep left/right side coverage without losing the synthwave grid feel.
- README architecture docs, help text, release notes, and punchlist now reflect the masking/display-geometry stage and the updated Horizon surface behavior.

## 0.6.71 - 2026-03-01

### Changed
- Increased the effective high-end spread of Horizon `Fan Reach` so full reach still covers or overshoots the side bounds under stronger `Vanishing Pull` settings.
- Rendered Horizon `Horizontal Lines`, `Vertical Lines`, and `Link` side-by-side as a single inline control row.

## 0.6.70 - 2026-03-01

### Changed
- Replaced Horizon’s single `Lines` control with `Horizontal Lines`, `Vertical Lines`, and a `Link` checkbox that preserves the current count ratio while editing either axis.
- Updated Horizon generation to consume explicit horizontal/vertical counts with legacy fallback so existing saved documents still render correctly.

## 0.6.69 - 2026-03-01

### Changed
- Updated Horizon fan validation and release notes to match the intended behavior: full pull/full reach may overshoot the canvas sides as long as the vertical rays cover the side boundaries.

## 0.6.68 - 2026-03-01

### Added
- Added `Fan Reach` for `wavetable` Horizon so vertical rays can extend to or beyond the side edges independently of the vanishing pull strength.

### Changed
- Full `Vanishing Pull` now behaves more like a true convergence-to-point control, while `Fan Reach` handles bottom/side coverage.

## 0.6.67 - 2026-03-01

### Changed
- Renamed the Horizon perspective controls to `Vanishing Point X` and `Vanishing Pull`.
- Rebalanced Horizon visibility so the terrain rows remain readable while the vertical fan is still derived from the occluded visible surface.

## 0.6.66 - 2026-03-01

### Changed
- Reworked `wavetable` Horizon visibility toward a sampled screen-space mesh so the skyline clips correctly and verticals are derived from the visible surface instead of independent noisy fan curves.
- Iterated the Horizon occlusion rules against screenshot-driven stress cases to reduce shoulder backface leakage while keeping more terrain layering visible.

## 0.6.65 - 2026-03-01

### Changed
- Fixed `wavetable` Horizon so sampled noise respects `Line Offset Angle` instead of always applying as vertical-only uplift.
- Clarified the `Noise Angle` and `Line Offset Angle` help text to distinguish field rotation from displacement direction.

## 0.6.64 - 2026-03-01

### Added
- Additional `wavetable` Horizon terrain-shaping controls: `Shoulder Lift`, `Mirror Blend`, and `Valley Profile`.

### Changed
- Retuned the shipped `Horizon` companion defaults through repeated rendered screenshot review so selecting `Horizon` produces a broader centered synthwave valley with quieter side chatter and more terrain-like side walls.

## 0.6.63 - 2026-03-01

### Added
- Horizon-only shaping controls for `wavetable`: `Center Dampening`, `Center Width`, and `Center Basin`.
- A Horizon companion-default bundle that activates when `Line Structure` is switched to `Horizon`, using layered broad/detail noise and tuned basin defaults aimed at synthwave terrain.

### Changed
- Tuned Horizon defaults through repeated rendered screenshot review so the shipped Horizon profile reads more like a center-road synthwave valley instead of generic wavetable noise.

## 0.6.62 - 2026-03-01

### Changed
- Removed the remaining hard skyline clamp in `wavetable` Horizon mode and increased far-horizon sampling/lift so the skyline can visibly break above the vanishing line instead of flattening into a narrow strip.
- Verified the Horizon fix against rendered screenshots after implementation, in addition to keeping the Horizon regression tests green.

## 0.6.61 - 2026-03-01

### Added
- A `Horizon Relief` control for `wavetable` Horizon mode so the skyline can retain visible noise instead of flattening completely at the vanishing line.

### Changed
- Adjusted Horizon row placement so relief at the top of the terrain stack affects the actual horizon rows instead of only the rows below them.

## 0.6.60 - 2026-03-01

### Changed
- Reworked `wavetable` Horizon depth perspective so near rows keep stronger terrain relief while distant rows compress toward the horizon instead of flattening the foreground.
- Petal Designer overlay picking now selects the visible inactive shape when you click its silhouette, and the `Inner Shape` / `Outer Shape` profile editor cards now act as explicit selection targets.

### Added
- Focused regression coverage for Horizon depth behavior and Petal Designer overlay/body-hit selection.

## 0.6.59 - 2026-02-28

### Changed
- Replaced the remaining one-off Petalis modifier noise sliders with nested Noise Rack stacks in the main Petalis controls and the Petal Designer modifier cards.
- Kept legacy `scale` values as fallback zoom for older Petalis documents while routing new modifier edits through shared Noise Rack layer controls.

### Added
- Added deterministic unit coverage for Petalis modifier Noise Rack stacks.

## 0.6.58 - 2026-02-28

### Added
- A `Center Diameter` control for `Rings` so the innermost ring can start wider without changing the active Noise Rack stack.

### Changed
- Reworked `Rings` `Concentric` sampling so it behaves like a true ring-path field instead of a nearly static seam break, while keeping circular closure intact.
- Improved the Rings apply-mode help text so `Top Down`, `Concentric`, and `Orbit Field` describe the actual sampling models more clearly.

## 0.6.57 - 2026-02-28

### Changed
- Fixed shared Noise Rack image controls so `Invert Color` is handled as a real checkbox in the stacked-noise UI.
- Corrected image `Noise Width` sampling direction across the affected samplers so larger values widen the field instead of narrowing it.
- Centered polygon noise by default in the remaining top-left-biased samplers, including `wavetable`, so polygon fields start from canvas center.

## 0.6.56 - 2026-02-28

### Added
- A Petalis `Drift Noise Rack` control stack so angular drift now uses the shared Noise Rack model instead of a single legacy scale slider.

### Changed
- Petalis radial-noise, circular-offset, petal-noise, filament, and drift sampling paths now evaluate through Noise Rack-compatible stack samplers while preserving current legacy parameters as fallbacks.
- Local Playwright smoke runs now patch unsupported Unicode regexes, fall back to an installed Chrome when managed Chromium assets are unavailable, and disable local failure-video capture while keeping CI video artifacts enabled.

## 0.6.55 - 2026-02-28

### Added
- Noise Rack stack controls for `flowfield`, `grid`, and `phylla`, including per-layer engine selection, offsets, blend modes, and octave shaping.

### Changed
- `flowfield` now maps stacked Noise Rack fields into angle or curl flow while preserving its particle controls.
- `grid` and `phylla` now derive distortion from stacked Noise Rack fields instead of single ad hoc noise samplers.

## 0.6.54 - 2026-02-28

### Changed
- Refined Rings apply-mode semantics so `Top Down` samples world-space XY noise, `Concentric` samples along each ring path length, and `Orbit Field` preserves the legacy ring-local field.

## 0.6.53 - 2026-02-28

### Changed
- Updated Rings control language to describe the new `Top Down` and `Concentric` semantics ahead of restoring the legacy orbit-local mode as its own option.

## 0.6.52 - 2026-02-28

### Added
- Topo Noise Rack migration with multi-noise height-field layering.

### Changed
- Preserved Topo contour mapping modes while moving meaningful fractal controls into per-noise-layer behavior.

## 0.6.51 - 2026-02-28

### Added
- Rings Noise Rack migration with multi-noise layering and per-noise `Concentric` / `Top Down` projection.

### Changed
- Preserved legacy ring behavior through per-noise drift and sample-radius controls within the new Noise Rack model.

## 0.6.50 - 2026-02-28

### Added
- Canonical app-version plumbing through `src/config/version.js`.
- A version synchronization script at `scripts/sync-version.js`.

### Changed
- The app version shown in the UI now aligns with the package version.
