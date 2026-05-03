# Changelog

All notable changes to this project should be documented in this file.

The format is intentionally human-curated with an `Unreleased` section that collects work before release.

## Unreleased

## 0.7.0 - 2026-05-03

### Added
- Added a new **Terrain** algorithm focused on realistic plotter-ready terrain. Heightfield-driven scanlines under a selectable perspective (`Top-down`, `One-point`, `Two-point`, or `Isometric`), with native generators for ridged-multifractal mountains, V/U-profile valleys (sinuous axis, configurable count/depth/width/meander), steepest-descent rivers that carve into the heightfield, and an ocean clamp with optional marching-squares coastline contour. Hidden-line removal via per-column screen envelope. Shipping with six style presets — `Alpine Range`, `Rolling Hills`, `Canyon Mesa`, `Archipelago`, `River Delta`, `Tundra Flats` — and full Noise Rack integration for layering arbitrary additional displacement. Coexists with `Horizon` (which keeps its synthwave specialty).

### Changed
- Horizon out-of-the-box scene now ships with the mountain surface enabled and the Additional Noises rack empty (was opt-in mountain + a phantom rack layer with amplitude 0). New users see the algorithm's signature draped-mountain look immediately, and adding noise is an explicit action with no clutter to remove first.
- Horizon's mountain noise is now perfectly Y-coherent (`MOUNTAIN_Y_COHERENCE = 0`): every horizontal row samples the same mountain X-profile, so adjacent rows stack as vertical-translation copies of one underlying silhouette and visibly drape over the surface as a wireframe — no more loose per-row wobble. Per-row amplitude still tapers toward the horizon via `Skyline Relief`. Rack noise keeps its independent-per-row behavior so users can still add deliberate non-draped variation.
- Horizon (Terrain) parameter surface consolidated for clarity: `Depth Compression` is renamed to `Terrain Depth` and inverted (high = more rows pushed into the foreground; default 30 preserves the prior look). The Terrain Form `centerWidth`/`corridorSoftness`/`shoulderCurve`/`valleyProfile` cluster and the standalone `Center Dampening` group are merged into a single `Center Region` panel with one `Width`, one `Edge Softness`, and one `Compress at Horizon` driving both the heightfield profile and the noise mask. `Symmetry Blend` becomes `Noise Mirror` and lives under Terrain Noise (where it actually belongs). Mountain noise drops `Mountain Zoom`, `Mountain Frequency`, and `Mountain Seed` — the built-in surface is now controlled by `Mountain Amplitude` alone, with seed shared from the global Seed slider. Net: ~26 user-facing knobs collapsed to 15 with no loss of expressive range for typical scenes. Old `.vectura` projects load unchanged via the default-spread; removed fine controls fall back to the unified defaults.

### Fixed
- Horizon no longer draws a perfectly flat line across the canvas at the vanishing-point Y. The previous spacing put the topmost row exactly on the horizon (`t_raw = 0` → `rowY = horizonY`), which made the horizon line itself a visible artifact regardless of terrain settings. Rows are now distributed in the half-open interval `(0, 1]` (nearest row at the ground, farthest a small step in front of the horizon, never on it). Three Horizon visual baselines were regenerated.
- Horizon's `Additional Noises` rack now renders added noise layers in the panel. Previously the shared `ensureWavetableNoises` helper allow-listed only `wavetable`/`rainfall`/`terrain` and silently returned an empty array for `horizon`, so any added rack layer was invisible (and unreachable for editing) even though it was stored on the layer.
- Horizon (Terrain) parameter directions and wiring now match their labels: `Center Depth` carves a valley downward (was inverted into a ridge), `Shoulder Lift` and `Ridge Sharpness` raise terrain upward (were pushing it down), `Skyline Relief` attenuates the full terrain expression toward the horizon so the slider has a visible effect even when noise is off, and the convergence/fan lines now follow the displaced terrain instead of staying perfectly straight when terrain shape is active. `Floor Height` becomes a bidirectional Y offset (range -100..100, default 0) — useful for compensating downward when noise bulges push rows up. Additional Noises in the noise rack now displace the terrain regardless of the `Enable Terrain Noise` master toggle (the master toggle still gates the built-in mountain noise). Visual baselines `horizon-valley.svg`, `horizon-shoulders.svg`, and `horizon-flat-grid.svg` were regenerated to match.

### Changed
- Horizon mountain noise now skins coherently across rows by anchoring the noise depth-axis to the horizon, so adjacent rows sample nearly the same lateral mountain profile. `Mountain Amplitude` can now be pushed well above 5 without rows tangling, and the grid stays evenly draped over the mountain surface. Visual baselines `horizon-valley.svg` and `horizon-shoulders.svg` were regenerated to match.
- Added a `Compress at Horizon` sub-control under `Center Dampening` (range 0–100, default 0). At 100 the dampened band tapers to zero width at the horizon line, forming an upward-pointing triangular mask anchored at the vanishing point; existing softness and falloff still shape the per-row edges.
- Horizon now starts as a clean perspective grid by default. Terrain noise is opt-in via the new `Enable Terrain Noise` toggle, which exposes a built-in mountain noise (amplitude/zoom/seed) plus a `Center Dampening` group that attenuates the mountain toward the vanishing point with width, softness, and falloff sub-controls. The existing per-layer noise rack is retained as `Additional Noises` for layering extra noise on top of the mountain.

### Added
- Added a global dark/light theme toggle in the header, with full-shell CSS-variable theming across panes, menus, modals, tool chrome, helper widgets, and canvas surround.
- Added `Insert > Mirror Modifier`, a new modifier-container layer type that behaves like a group in the Layers panel while applying a sequential mirror-axis stack to its child layers.
- Added mirror-guide canvas overlays with dashed full-canvas axes, reflection-direction triangles, separate rotate handles, and per-axis/stack show-hide, lock, reorder, and delete controls.
- Added unit, integration, and Playwright coverage for mirror modifier geometry, state roundtrip, and the new Insert-menu workflow.
- Added Illustrator-style Rectangle (`M`), Oval (`L`), and Polygon (`Y`) shape tools that create editable `expanded` layers, including polygon side-count changes during draft and shape-aware corner-rounding handles.
- Added export coverage for masked shape geometry with `Remove Hidden Geometry` enabled and disabled, plus focused unit/browser tests for shape creation flows.
- Added Illustrator-style parent-mask coverage so visible mask parents clip their full descendant subtree on canvas and in SVG export.
- Added a `Hide Mask Layer` option on mask parents so the parent can keep clipping descendants while suppressing its own visible artwork on canvas and in export.
- Added a document-level Metric/Imperial unit switch in Document Setup, unit-aware paper/margin/stroke/tolerance controls, an optional blueprint-style document-dimension readout outside the canvas, and a `Clear Saved Preferences` action for cookie-backed UI state.
- Added unit, integration, Playwright, and screenshot coverage for document-unit conversion, clearing saved preferences, Document Setup shortcut toggling, multi-layer Line Sort scoping, and the new outside-canvas dimension labels.
- Added an Illustrator-style Export SVG modal with a large left-side preview, right-side export settings, bottom-right actions, and preview zoom/pan controls.
- Added representative Playwright source-fidelity coverage for fill-built Pattern tiles: the harness now scans the full pattern catalog to pick compound-fill archetypes, keeps `Autumn` seam fidelity as an expected-fail regression, and tracks representative tile-silhouette mismatches for known-bad patterns like `Autumn`, `Bamboo`, and `Bank Note` without breaking the suite.
- Added a runtime custom Pattern registry with local-library plus project-carried custom tiles, `.vectura` round-trip support for saved custom patterns, inline `Import SVG Tile` / `Save Pattern` / `Load Saved` actions in the Pattern Texture Designer, and a live `3x3` seam-validation preview that blocks saving invalid imported tiles.
- Added unit coverage for custom-pattern registry/validation flows and Playwright coverage for invalid-tile save blocking plus custom-pattern project round-tripping.
- Added shared toolbar generation in `ui.js` so the main canvas, Petal Designer, and Texture Designer all render from one configurable tool-definition registry, and expanded the shared tool set with `Fill` and `Erase Fill`.
- Added nested-region Texture Designer fill targeting, drag-pour fill/erase behavior, `Alt/Option` temporary erase while filling, and a `Show Gaps` slider with yellow preview markers plus auto-close actions for closable seam-endpoint gaps.

### Changed
- Corrected polygon Noise Rack zoom semantics so larger values now produce a larger polygon footprint across shared and algorithm-local samplers, and normalized vertical-displacement sign so positive amplitudes lift line stacks upward while negative amplitudes push them downward.
- Fixed Wavetable `Isometric` so `Line Gap` now scales the visible cell spacing from one shared lattice model, `Row Shift` shears the full lattice instead of leaving diagonal families behind, and added deterministic plus SVG-baseline regressions for the corrected behavior.
- Fixed the stale Export SVG smoke test path so CI now forces a real Line Sort off-to-on transition before asserting preview promotion, matching the current default-enabled Line Sort setting instead of relying on a no-op checkbox `check()`.
- Reclassified the remaining Pattern smoke failures as real renderer/import fidelity bugs rather than expected test drift; `Autumn` seam continuity and representative Hero fill-built silhouette mismatches remain open product issues.
- Fixed fill-built Pattern SVG extraction so the renderer now traces the visible filled silhouette instead of outlining every overlapping subpath independently, and tightened seam-chain reconnection so `Autumn`'s standard-grid tile joins stay vertically paired instead of producing irregular cross-seam diagonals. Added unit and Playwright regressions for the fill-boundary and seam-pairing cases.
- Fixed Pattern-layer texture initialization so the inline Texture Designer now renders the effective default texture immediately, including the initial `4 Point Stars` fallback case before any manual reselection.
- Moved the inline Pattern `Texture Designer` directly below the texture selection grid and above the `Scale` control.
- Moved export and optimization controls out of Document Setup into the Export SVG modal, while keeping export behavior dictated strictly by the existing `SETTINGS` and layer optimization state.
- Fixed the Export SVG modal `Line Sort` preview so its overlay mode, legend colors, and line-thickness styling stay local to the modal; the primary canvas no longer picks up export-preview overlay/legend state, and cancel leaves no preview residue behind.
- Tightened Export SVG optimization-card header layout so section-level info icons sit directly to the right of their header titles instead of drifting in the header row.
- Fixed Export SVG section-header info buttons to bind to the actual header label span instead of the drag-grip dot spans, so the `(i)` control now renders beside the header text.
- Adjusted Export SVG section-header info buttons to render as siblings immediately after the title span, matching the exact `Title (i)` order instead of nesting the button inside the title span.
- Fixed Export SVG section-header info panes to open below the full title bar instead of inside the header row, while keeping field-level info panes attached to their own controls.
- Added `Truncate Start` and `Truncate End` sliders to `Lissajous`, both defaulting to `0%`, and changed `Close Lines` to default off so endpoint shortening can be dialed in before any tail-closing pass.
- Changed `Lissajous` `Close Lines` to trim loose endpoint tails back to deterministic self-intersection cutpoints instead of hard-closing the path to its first sample, with focused unit coverage for trimmed and untouched cases.
- Fixed snapshot-based Undo/Redo for document-mutating layer-structure edits so grouping, reparenting, masking, modifier/container edits, and structural selection restore now roundtrip correctly with Redo instead of only restoring the pre-edit state.
- Switching dark/light theme now updates the document background default and flips `Pen 1` between white and black, propagating the pen color to existing `pen-1` layers while keeping theme as a personal cookie-backed preference instead of project state.
- Fixed direct-edited circle mask parents so descendant clipping now follows the edited outline immediately instead of continuing to use stale circle metadata, with runtime and Playwright regressions to keep mask edits in sync.
- Fixed `Export Optimized` so masked exports no longer implicitly remove hidden geometry when `Remove Hidden Geometry` is off; optimized SVG export now preserves full source geometry and applies ancestor clip paths non-destructively.
- Removed the duplicate top-level `Remove Hidden Geometry` checkbox from Document Setup so the Export Settings card is the single UI control for that export-only setting, with regression coverage for its default-on behavior.
- `Cmd/Ctrl + K` now toggles Document Setup open and closed instead of only opening it.
- Fixed `Line Sort` so multi-layer `selected` and `all` optimization scopes keep a shared sort order across preview, stats, overlay rendering, and optimized SVG export instead of silently falling back to per-layer sorting.
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
- Fixed `Remove Hidden Geometry` export to correctly clip ancestor-masked layers; the export now uses `displayMaskActive` (matching the canvas renderer) instead of `layer.mask?.enabled`, so child layers clipped by a parent mask are properly trimmed on export.
- Improved accessibility across all UI: theme-aware canvas reticle cursor, `prefers-reduced-motion` support, `aria-live` on notification toasts, modal focus management, `aria-pressed`/`aria-current`/`aria-expanded` on interactive controls, visible focus rings, and a minimum 11 px text-size floor.
- Changed Pattern-layer fill records to store normalized multi-region targets instead of only raw single-loop polygons, which lets the Texture Designer distinguish inner fills from outer-minus-hole rings and preserve those targets through save/load.

## 0.6.80 - 2026-03-01

### Changed
- Relaxed the post-occlusion reconnect rule so verticals can reappear after passing behind a ridge, which fixes missing visible fan lines on the saved broken masking fixture.

## 0.6.79 - 2026-03-01

### Changed

## 0.6.78 - 2026-03-01

### Changed
- Fixed the Layers-panel `Clip` trigger so the clipping-mask popover opens reliably from the layer rows in the saved masking-scene workflow.

## 0.6.77 - 2026-03-01

### Changed
- Tightened the Layers-panel clipping control with a more obvious `Clip` action and kept masking interactions scoped to the layer list workflow.

### Added
- Added a screenshot-based Playwright regression that loads the checked-in `broken-masking.vectura` fixture and snapshots the real saved masking case.

## 0.6.76 - 2026-03-01

### Changed

## 0.6.75 - 2026-03-01

### Changed
- Re-verified the saved broken masking scene against a fresh browser render so clipping masks terminate behind the visible terrain contour instead of bleeding through the landscape shoulders.

### Added

### Changed
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.74 - 2026-03-01

### Added

### Changed
- Kept masking workflow in the Layers panel only and tightened the masking popover styling/labels around a more familiar clipping-mask interaction.
- Added `id`/`name` wiring to the masking editor checkboxes so the masking controls no longer contribute anonymous form fields.

## 0.6.73 - 2026-03-01

### Added

### Changed
- Added `id`/`name` wiring to the new masking editor checkboxes so the masking controls no longer contribute anonymous form fields.
## 0.6.72 - 2026-03-01

### Added
- Live non-destructive layer masking for silhouette-capable layers, including layer-row `Mask` controls, mirrored left-panel masking controls, and `Convert To Geometry` materialization into expanded lines.
- A new masking/display-geometry stage in the engine with `src/core/masking.js` and `src/core/path-boolean.js`.
- Unit coverage for masking silhouette eligibility, mask subtraction, and engine-level masked display geometry.

### Changed

## 0.6.71 - 2026-03-01

### Changed

## 0.6.70 - 2026-03-01

### Changed

## 0.6.69 - 2026-03-01

### Changed

## 0.6.68 - 2026-03-01

### Added

### Changed
- Full `Vanishing Pull` now behaves more like a true convergence-to-point control, while `Fan Reach` handles bottom/side coverage.

## 0.6.67 - 2026-03-01

### Changed

## 0.6.66 - 2026-03-01

### Changed

## 0.6.65 - 2026-03-01

### Changed
- Clarified the `Noise Angle` and `Line Offset Angle` help text to distinguish field rotation from displacement direction.

## 0.6.64 - 2026-03-01

### Added

### Changed

## 0.6.63 - 2026-03-01

### Added

### Changed

## 0.6.62 - 2026-03-01

### Changed

## 0.6.61 - 2026-03-01

### Added

### Changed

## 0.6.60 - 2026-03-01

### Changed
- Petal Designer overlay picking now selects the visible inactive shape when you click its silhouette, and the `Inner Shape` / `Outer Shape` profile editor cards now act as explicit selection targets.

### Added

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
