# Plans

This file is the active repository punchlist. Update it whenever meaningful work starts, changes scope, or completes.

## Operating Rules
- Keep `Inbox`, `In Progress`, `Done`, and `Decisions` current in the same PR as the implementation.
- Move items instead of duplicating them when status changes.
- Record architecture-level decisions in `Decisions` so future work has a stable reference.

## In Progress
- Establish the repository operating model: canonical version sync, `CHANGELOG.md`, README release notes, expanded architecture diagrams, and Codex doc-maintenance rules.
- Add GitHub governance scaffolding: structured issue forms, Dependabot, CODEOWNERS, release-note categorization, and documented GitHub Project / ruleset expectations.
- Design the universal multi-engine noise system, named `Noise Rack`, so all noise-capable algorithms converge on one stack model.
- Continue extracting shared Noise Rack runtime primitives; stack blend-combination logic is now centralized, with deeper sampler extraction still pending.
- Extend Noise Rack to the remaining direct consumers, now mainly any leftover bespoke samplers after Petalis per-modifier stack UI parity.
- Extend Layer Modifiers beyond the initial `Mirror` implementation once the group-like modifier container model has proven out in export, masking, and nested layer workflows.
- Fix the remaining strict Playwright Pattern fidelity regressions as product bugs, with `Autumn` horizontal-seam mismatch and representative `Bamboo` / `Bathroom Floor` / `Dominos` silhouette drift still failing source-faithful smoke coverage.

## Inbox
- Extract more shared Noise Rack runtime primitives from the duplicated `wavetable` / `spiral` / `rainfall` implementations into `src/core/noise-rack.js`.
- Add tests for Noise Rack determinism, serialization, UI normalization, and algorithm parity across migrated systems.
- Add GitHub-side rulesets / branch protection, merge queue, and Project fields once the repository settings are available to configure.
- Decide whether to gate PRs on lint after introducing a repo-wide ESLint config that is compatible with the current browser-IIFE codebase.
- Add drag-to-mask layer assignment and richer silhouette providers for currently open-line-only algorithms once their envelope rules are stable.
- Add more modifier types beyond `Mirror`, reusing the shared modifier-container layer model and left-panel modifier registry.

## Done
- Added a new **Terrain** algorithm focused on realistic plotter-ready terrain: heightfield-driven scanlines with selectable perspective (orthographic / one-point / two-point / isometric), native ridged-multifractal mountains, V/U valleys with sinuous axes, steepest-descent rivers that carve the heightfield, and an ocean clamp with optional marching-squares coastline. Per-column hidden-line removal so distant rows compress through projection, not faked spacing. Six style presets (`Alpine Range`, `Rolling Hills`, `Canyon Mesa`, `Archipelago`, `River Delta`, `Tundra Flats`). Coexists with `Horizon`. Unit tests + visual baselines added.
- Consolidated Horizon (Terrain) UX: renamed `Depth Compression` → `Terrain Depth` (inverted so high = more foreground rows), merged the duplicated Terrain Form center cluster + Center Dampening group into one `Center Region` panel sharing Width / Edge Softness / Compress at Horizon, moved `Symmetry Blend` to Terrain Noise as `Noise Mirror`, and stripped mountain noise to a single `Mountain Amplitude` (zoom/frequency/seed gone; seed shared with global). ~26 knobs → 15. Tests updated, baselines regenerated.
- Fixed Horizon (Terrain) parameter directions and wiring: `Center Depth` now carves a downward valley, `Shoulder Lift` and `Ridge Sharpness` raise terrain upward, `Skyline Relief` attenuates the full terrain expression toward the horizon (visible without noise), the convergence/fan lines bend with the terrain when shape or noise is active, `Floor Height` becomes a bidirectional offset (-100..100, default 0), and Additional Noises in the rack now displace the terrain regardless of the `Enable Terrain Noise` master toggle (which still gates the built-in mountain noise). Visual baselines `horizon-valley.svg`, `horizon-shoulders.svg`, and `horizon-flat-grid.svg` regenerated.
- Improved Horizon mountain coherence: anchored the mountain noise depth-axis so adjacent rows skin a single mountain surface and `Mountain Amplitude` can be pushed well above 5 without rows tangling. Added a `Compress at Horizon` sub-control to `Center Dampening` that tapers the dampened band toward the vanishing point, forming an upward-pointing triangular mask. Visual baselines `horizon-valley.svg` and `horizon-shoulders.svg` regenerated.
- Made Horizon terrain noise opt-in: replaced the always-on rack default with an `Enable Terrain Noise` toggle, a built-in mountain noise (amplitude/zoom/seed), and a `Center Dampening` group (strength + width + softness + falloff) that attenuates the mountain toward the vanishing point. The existing noise rack is retained as `Additional Noises` for layering extras on top.
- Fixed Wavetable `Isometric` so `Line Gap` now controls the visible cell spacing from a single shared lattice model, `Row Shift` shears the entire lattice coherently, and deterministic plus SVG-baseline regressions now lock the behavior in through the repo's RGR workflow.
- Updated the stale Export SVG smoke/integration test flow so Line Sort preview assertions now force a real unchecked-to-checked transition under the current default-enabled setting, leaving only the known Pattern fidelity failures in the CI smoke lane.
- Corrected Noise Rack polygon zoom direction so larger zoom values now enlarge polygon footprints consistently across shared and algorithm-local samplers, and normalized vertical line-displacement sign so positive amplitudes move grid/line-stack offsets upward while leaving radial/vector-field semantics unchanged.
- Unified shared toolbar generation in `ui.js` so the main canvas, Petal Designer, and Pattern Texture Designer all consume one configurable tool-definition registry, and added `Fill` / `Erase Fill` to the shared tool set with shortcut/help coverage.
- Upgraded the Pattern Texture Designer fill workflow to support nested closed regions, additive ancestor-stack fills, drag-pour fill/erase, `Alt/Option` temporary erase while filling, and a `Show Gaps` tolerance slider with yellow gap diagnostics plus auto-close actions for closable seam endpoints.
- Added a custom Pattern tile workflow: a runtime merged registry for bundled plus saved custom patterns, local/project persistence for custom tiles, `.vectura` project round-tripping, inline Pattern Texture Designer import/save/load actions, and a live `3x3` validation preview that blocks saving seam-invalid SVG tiles.
- Added representative Pattern source-fidelity coverage that scans the full Hero tile catalog, selects compound-fill archetypes including `Autumn`, `Bamboo`, and `Bank Note`, and records the still-broken seam/silhouette cases as expected-fail Playwright regressions so the renderer gaps stay visible without redlining CI.
- Fixed fill-built Pattern extraction so overlapping SVG fill subpaths now collapse to the visible silhouette boundary, tightened seam-chain pairing so `Autumn` grid tiles reconnect cleanly across the horizontal seam, and added unit plus Playwright regressions for the affected Hero patterns and seam continuity.
- Fixed the Pattern-layer Texture Designer initialization so the default fallback texture now appears immediately on first open, and moved the designer directly below the texture selection grid above `Scale`.
- Moved export and optimization controls out of Document Setup into a dedicated Illustrator-style Export SVG modal with a left-side preview, right-side settings, bottom-right actions, and zoom/pan inspection.
- Fixed the Export SVG modal `Line Sort` overlay preview so legend colors/thickness and preview mode are modal-local only; the primary canvas no longer shows export-preview overlay state, and cancel fully clears it.
- Tightened Export SVG optimization header layout so section info icons stay immediately to the right of their titles.
- Fixed Export SVG section-header info buttons so they attach to the title label instead of the reorder grip dots.
- Adjusted Export SVG section-header info buttons so they render immediately after the title span as sibling elements.
- Fixed Export SVG section-header info panes so they expand below the full header bar instead of inside the header row.
- Added Document Setup project-state units (`metric` / `imperial`), unit-aware paper/margin/stroke/tolerance controls, blueprint-style paper dimensions outside the canvas, a `Clear Saved Preferences` action for cookie-backed UI state, `Cmd/Ctrl + K` toggle behavior, and regression coverage for the full workflow.
- Fixed multi-layer `Line Sort` so shared optimization scope now carries through preview, stats, overlay rendering, and optimized SVG export instead of degrading to per-layer sorting.
- Added `Lissajous` `Truncate Start` / `Truncate End` endpoint-length sliders, defaulted both to `0%`, and flipped `Close Lines` to default off so users can shorten each end explicitly before enabling tail trimming.
- Refined `Lissajous` `Close Lines` so loose endpoints trim to self-intersection cutpoints instead of forcing end-to-start closure, and added focused unit coverage for trimmed-tail plus no-crossing cases.
- Fixed snapshot-based Undo/Redo for document-mutating layer-structure edits by storing real post-mutation structural states, restoring multi-selection sets, and adding integration regressions for grouping, reparenting, masking, and modifier/container edits.
- Fixed `Remove Hidden Geometry` export to correctly clip ancestor-masked layers using `displayMaskActive` instead of `layer.mask?.enabled`, so child layers clipped by a parent mask are properly trimmed on export.
- Improved accessibility across all UI: theme-aware canvas reticle cursor, `prefers-reduced-motion` support, `aria-live` on notification toasts, modal focus management, `aria-pressed`/`aria-current`/`aria-expanded` on interactive controls, visible focus rings, and a minimum 11 px text-size floor.
- Added a full dark/light shell theme with a header sun/moon toggle, cookie-backed personal theme preference, theme-aware renderer/helper chrome, and automatic `Pen 1` plus document-background syncing when the theme flips.
- Fixed circle-backed mask edits so once a mask is reshaped through direct anchor editing it drops stale canonical circle metadata and reclips descendants to the edited outline, with unit and Playwright regressions.
- Fixed optimized SVG export so `Export Optimized` no longer reuses masked display geometry as its raw source when `Remove Hidden Geometry` is off, with engine/integration/Playwright regressions.
- Removed the duplicate top-level `Remove Hidden Geometry` checkbox from Document Setup so Export Settings remains the sole default-on control for that export-only behavior, with integration and Playwright regressions.
- Added live mask-parent transform preview so moving/resizing/rotating a mask parent ghost-renders its masked descendants against the transformed silhouette until release, with unit/integration/Playwright coverage.
- Added an Illustrator-style reticle cursor for Rectangle/Oval/Polygon tools and single selected primitive shapes in Selection, while preserving center-out `Alt/Option` drawing and existing handle cursors.
- Fixed generator algorithm switching so non-`expanded` layers no longer silently acquire `sourcePaths`, changing the Algorithm dropdown regenerates the artboard immediately, and CI now checks the geometry-change path in both integration and Playwright smoke coverage.
- Added Illustrator-style shape authoring with Rectangle/Oval/Polygon tools, editable shape metadata on `expanded` layers, and Selection/Direct corner-rounding interactions.
- Added `Remove Hidden Geometry` to export settings so SVG export can switch between destructive visibility-trimmed output and non-destructive clip-path preservation for masked/frame-hidden geometry.
- Replaced source-selected clipping with Illustrator-style parent masks so visible parent silhouettes clip all indented descendants recursively, legacy `sourceIds` masks are cleared on load, and export mirrors the masked subtree exactly.
- Added `Hide Mask Layer` on parent masks so the parent can remain the active clipping silhouette while its own artwork is suppressed from canvas, stats, and SVG export.
- Added Layer Modifiers v1 with `Insert > Mirror Modifier`, group-like modifier container rows, modifier-aware effective geometry, and full-canvas mirror-axis stacks that apply sequentially to child layers before display/export.
- Added mirror-guide overlays and interactions: dashed non-exporting axes, reflection-direction triangles, separate rotate handles, per-axis show/hide-lock-delete controls, and stack-level add/show-hide/lock/clear actions.
- Fixed Mirror Modifier layer-tree behavior so children can be dragged back out to the root, deleting a modifier dissolves only the wrapper and preserves its children, and `+ Add` under a selected modifier creates a drawable child instead of a pseudo-`mirror` layer.
- Fixed Mirror Modifier child editing so selecting a nested drawable child returns the left panel to normal `Algorithm` mode and keeps algorithm, parameter, and transform editing active inside the mirrored subtree.
- Fixed mirrored closed-mask handling so a mask parent under a Mirror Modifier now contributes the mirrored closed silhouette union, masked descendants clip against both mirrored lobes, and SVG plus screenshot baselines lock the mirrored-mask scene visually.
- Fixed Rectangle/Polygon authoring so new primitive layers no longer inherit `Curves` from the previously active generator layer, and rotated primitive selections now keep selection bounds plus corner-rounding handles aligned to the transformed shape geometry with deterministic and screenshot coverage.
- Added an agentic harness source-of-truth document and synchronized PR-template expectations.
- Added baseline automated test coverage for unit, integration, e2e smoke, visual, and perf workflows.
- Established existing Mermaid-based architecture documentation in the README.
- Built an advanced stacked-noise foundation in `wavetable`, with related layered-noise behavior already present in `spiral` and `rainfall`.
- Added the first shared Noise Rack runtime primitive in `src/core/noise-rack.js` and wired shared blend-combination behavior into `wavetable`, `spiral`, and `rainfall`.
- Migrated `rings` to Noise Rack with stacked noise layers, preserved ring-local drift/sample-radius controls, and per-noise `Orbit Field` / `Concentric` / `Top Down` projection.
- Migrated `topo` to Noise Rack with stacked field layers while preserving the existing contour mapping modes and moving fractal controls into per-noise-layer settings.
- Migrated `flowfield`, `grid`, and `phylla` onto Noise Rack stacks while preserving their algorithm-specific master controls.
- Routed Petalis drift and the existing noise-driven Petalis modifier samplers through Noise Rack-compatible stack evaluation, and restored local Playwright smoke runs with a system-Chrome fallback plus local video suppression.
- Fixed shared image-noise control behavior by rendering `Invert Color` as a checkbox, correcting `Noise Width` direction in the affected samplers, and centering default polygon noise in the remaining off-center algorithms.
- Reworked `Rings` `Concentric` mode into a seam-corrected ring-path sampler, improved the apply-mode help text, and added a `Center Diameter` control for widening the innermost ring.
- Replaced the remaining one-off Petalis modifier noise sliders with nested Noise Rack stacks in the main controls and Petal Designer modifier cards, while preserving legacy modifier-scale fallback behavior.
- Added a live masking/display-geometry engine stage, row-level `Mask` controls in the Layers panel, and `Convert To Geometry` materialization into expanded lines.

## Decisions
- In Wavetable `Isometric`, `Line Gap` refers to visible cell spacing and `Row Shift` applies as a coherent lattice shear across all three line families rather than offsetting only the horizontal rows.
- Positive Noise Rack amplitude only implies “up” for generators that convert noise directly into screen-space vertical displacement; radial, orbit, and vector-field consumers keep their existing amplitude semantics.
- Export configuration stays single-sourced through the existing `SETTINGS` object and layer optimization state; the Export SVG modal is only a preview/configuration surface and must not introduce a second export rules path.
- Document Setup unit choice is serialized with the project, but all internal physical geometry, paper, margin, stroke, and optimization math stays normalized in millimeters.
- Blueprint-style document-dimension labels are editor-only canvas chrome and never export.
- `Lissajous` exposes explicit endpoint truncation before `Close Lines`: `Truncate Start` and `Truncate End` remove 0-100% of arc length from each end, and `Close Lines` defaults to off.
- `Lissajous` `Close Lines` is a tail-trimming affordance, not a forced path-closure toggle: it preserves open paths and only replaces loose endpoints with exact self-intersection cutpoints when valid tail crossings exist.
- UI theme is a personal preference rather than project state: dark/light persists only through the existing cookie-preference snapshot, while `.vectura` project files continue to serialize document colors and pens without carrying a UI theme switch.
- `Noise Rack` is the product and architecture name for the universal multi-engine noise stack.
- `Universal` means every current noise-capable algorithm, not only new features and not only `wavetable`.
- `package.json` is the canonical app version source. Sync derived version surfaces with `npm run version:sync`.
- `README.md`, `plans.md`, `CHANGELOG.md`, the visible app version, and any affected in-app help/shortcut text are part of the required documentation surface for meaningful feature work.
- Layer Modifiers use explicit modifier-container layers (`containerRole = 'modifier'`) instead of overloading ordinary generator layers, so drag/drop nesting, export, and future modifier types share one tree model.
- Mirror Modifier axes are infinite reflection lines clipped only for guide drawing; multiple mirrors apply in stack order from top to bottom, and later mirrors operate on already-mirrored geometry.
- Mirror guide visibility/locking is editor-only state; dashed guides, triangles, and rotate handles never export, but mirrored child geometry does.
- Masking now follows an Illustrator-style parent-owned model: the visible parent layer is the mask, all descendants are clipped recursively, and the legacy source-layer mask workflow is retired rather than migrated.
- Mask parents can optionally hide their own artwork while still contributing silhouette clipping to descendants and export clip paths.
- `sourcePaths` are reserved for manual `expanded` geometry; generator-backed layers must always regenerate from their algorithm when the layer type changes.
- Live mask preview is editor-only: it never mutates layer geometry or export data, and it uses the active mask parent’s temporary transformed silhouette only while the drag is in progress.
- In `Rings`, `Top Down` means a universal world-space XY field beneath the artwork; `Concentric` means seam-corrected path-space sampling around each full ring loop; `Orbit Field` preserves the legacy ring-local orbital sampler.
- Live masking is non-destructive by default. Parent masks affect only descendants at display/export time; checked `Remove Hidden Geometry` trims hidden export geometry destructively while unchecked export preserves hidden source paths with SVG clip paths.
- `Remove Hidden Geometry` is export-only and defaults to on: checked exports physically trim hidden geometry to the current visible frame, unchecked exports preserve hidden source paths and recreate visibility with SVG clip paths.
