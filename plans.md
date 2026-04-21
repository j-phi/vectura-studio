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
- Expand universal masking beyond the first silhouette-capable layer set (`Wavetable` Horizon, closed shapes, groups) to additional algorithms with stable outer-envelope providers and surface-aware mask providers.
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
- Fixed `Line Sort` `Nearest` so `Horizontal` and `Vertical` now enforce real sweep ordering instead of only picking the initial seed path, and added integration coverage for directional plus unconstrained nearest-neighbor traversal.
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
- Fixed Horizon masking to follow the highest visible terrain envelope instead of only the top row, and added a dedicated masking SVG baseline to keep the landscape-overlap behavior stable.
- Reworked Horizon masking to use visible surface strips so hidden geometry hugs the final terrain contours, moved masking workflow fully into the Layers panel, and added a screenshot-based Playwright masking regression.
- Fixed the checked-in broken masking scene by restoring explicit visible terrain-strip mask polygons, reducing detached Horizon backface/shoulder column fragments, and adding a fixture-backed screenshot regression for the saved document.
- Fixed the saved masking workflow so the Layers-panel `Clip` trigger opens reliably, Horizon clipping follows the first visible terrain row, and additional lower shoulder backface fragments are culled by skyline-connected fan filtering.
- Further reduced Horizon shoulder hidden-line clutter by pruning short edge/shoulder column fragments that survived occlusion but did not carry enough visible surface to read as real contour lines.
- Restored legitimate Horizon vertical fan visibility by rebuilding columns from the full clipped terrain rows and allowing them to reappear after passing behind an occluding ridge.
- Reworked Horizon around a regularized underlying perspective grid so row/column spacing stays stable before terrain occlusion, column identity survives hidden/reappearing segments, and the shipped defaults read closer to a cleaner synthwave valley.
- Added `Horizon 3D` as a separate projected heightfield mode so synthwave terrain can be generated from a real plane/mesh with surface-derived hidden-line removal and masking, without breaking legacy Horizon scenes.
- Removed Horizon's extra edge-anchor rays after they introduced off-pattern diagonal lines that did not align with the vertical contour fan.
- Changed Horizon masking to follow the topmost visible Horizon row and derived the full vertical fan from the same culled visible-row set so masked background geometry meets the terrain edge without a gap and steep-ridge backfaces are reduced.
- Migrated `rings` to Noise Rack with stacked noise layers, preserved ring-local drift/sample-radius controls, and per-noise `Orbit Field` / `Concentric` / `Top Down` projection.
- Migrated `topo` to Noise Rack with stacked field layers while preserving the existing contour mapping modes and moving fractal controls into per-noise-layer settings.
- Migrated `flowfield`, `grid`, and `phylla` onto Noise Rack stacks while preserving their algorithm-specific master controls.
- Routed Petalis drift and the existing noise-driven Petalis modifier samplers through Noise Rack-compatible stack evaluation, and restored local Playwright smoke runs with a system-Chrome fallback plus local video suppression.
- Fixed shared image-noise control behavior by rendering `Invert Color` as a checkbox, correcting `Noise Width` direction in the affected samplers, and centering default polygon noise in the remaining off-center algorithms.
- Reworked `Rings` `Concentric` mode into a seam-corrected ring-path sampler, improved the apply-mode help text, and added a `Center Diameter` control for widening the innermost ring.
- Replaced the remaining one-off Petalis modifier noise sliders with nested Noise Rack stacks in the main controls and Petal Designer modifier cards, while preserving legacy modifier-scale fallback behavior.
- Reworked `Wavetable` Horizon depth perspective for stronger synthwave terrain silhouettes and improved Petal Designer target selection via overlay silhouette hits plus clickable profile cards.
- Added a dedicated `Wavetable` Horizon relief control so skyline noise can be preserved at the vanishing line instead of being implicitly damped away.
- Removed the remaining hard horizon clamp in `Wavetable` and validated the skyline fix against rendered screenshots so Horizon terrain now breaks the vanishing line as intended.
- Added Horizon-specific shaping controls and companion defaults tuned against repeated screenshot review so choosing `Horizon` yields a terrain profile closer to the synthwave reference.
- Added deeper Horizon terrain-shaping controls (`Shoulder Lift`, `Mirror Blend`, `Valley Profile`) and tuned the shipped Horizon defaults against repeated rendered screenshot review so the default profile reads more like a centered synthwave valley.
- Fixed `Wavetable` Horizon so noise displacement now respects `Line Offset Angle` instead of being forced vertical, and clarified the angle-control help text.
- Continued reworking `Wavetable` Horizon visibility/occlusion into a sampled mesh model so skyline clipping, vertical fan behavior, and shoulder backface hiding move closer to the synthwave terrain target.
- Restored explicit Horizon perspective control under clearer names (`Vanishing Point X`, `Vanishing Pull`) while keeping the vertical fan full-width at the bottom and pulled inward near the skyline.
- Split Horizon perspective coverage into separate controls so `Vanishing Pull` handles convergence and `Fan Reach` handles side/bottom spread without leaving dead zones at the edges.
- Locked the Horizon fan expectation to edge coverage rather than on-canvas bottom confinement, so full pull/full reach can radiate beyond the side bounds while still covering the visible width.
- Replaced Horizon’s single `Lines` control with independent horizontal/vertical counts and a ratio lock so mesh density can be tuned per direction without losing the perspective fan behavior.
- Increased Horizon `Fan Reach` headroom at high `Vanishing Pull` values and grouped the split line-count controls into one shared row for faster perspective tuning.
- Added a live masking/display-geometry engine stage, row-level `Mask` controls in the Layers panel, and `Convert To Geometry` materialization into expanded lines.
- Added first-wave silhouette providers for closed shapes, groups, and `Wavetable` Horizon terrain envelopes so masking relationships can be edited directly from the layer list.
- Reworked Horizon vertical fans to sample the visible terrain surface by X-position instead of row parameterization, then removed the extra edge-anchor rays after they proved visually inconsistent with the contour fan.

## Decisions
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
