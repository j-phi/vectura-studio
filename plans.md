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

## Inbox
- Extract more shared Noise Rack runtime primitives from the duplicated `wavetable` / `spiral` / `rainfall` implementations into `src/core/noise-rack.js`.
- Add tests for Noise Rack determinism, serialization, UI normalization, and algorithm parity across migrated systems.
- Add GitHub-side rulesets / branch protection, merge queue, and Project fields once the repository settings are available to configure.
- Decide whether to gate PRs on lint after introducing a repo-wide ESLint config that is compatible with the current browser-IIFE codebase.
- Add drag-to-mask layer assignment and richer silhouette providers for currently open-line-only algorithms once their envelope rules are stable.

## Done
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
- `Noise Rack` is the product and architecture name for the universal multi-engine noise stack.
- `Universal` means every current noise-capable algorithm, not only new features and not only `wavetable`.
- `package.json` is the canonical app version source. Sync derived version surfaces with `npm run version:sync`.
- `README.md`, `plans.md`, `CHANGELOG.md`, the visible app version, and any affected in-app help/shortcut text are part of the required documentation surface for meaningful feature work.
- In `Rings`, `Top Down` means a universal world-space XY field beneath the artwork; `Concentric` means seam-corrected path-space sampling around each full ring loop; `Orbit Field` preserves the legacy ring-local orbital sampler.
- Live masking is non-destructive by default. Mask relationships are stored on the target layer, edited primarily from the layer panel, and may be materialized into expanded geometry as a separate action.
