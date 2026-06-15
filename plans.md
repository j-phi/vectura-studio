# Plans

This file is the active repository punchlist. Update it whenever meaningful work starts, changes scope, or completes.

## Operating Rules
- Keep `Inbox`, `In Progress`, `Done`, and `Decisions` current in the same PR as the implementation.
- Move items instead of duplicating them when status changes.
- Record architecture-level decisions in `Decisions` so future work has a stable reference.

## In Progress
- Continue extracting shared Noise Rack runtime primitives; stack blend-combination logic is now centralized, with deeper sampler extraction still pending.
- Extend Noise Rack to the remaining direct consumers, now mainly any leftover bespoke samplers after Petalis per-modifier stack UI parity.
- Extend Layer Modifiers further now that `Mirror` and `Morph` both ride the group-like modifier container model — new types layer onto the `applyModifierToMultiChildPaths` multi-child path or the single-child contract. Known Morph follow-ups: (a) a Morph group nested *under* another modifier (e.g. Mirror) currently has its rings rendered un-mirrored — the outer modifier isn't applied to `morphedPaths` (logged PRH-005).
- Fix the remaining strict Playwright Pattern fidelity regressions as product bugs, with `Autumn` horizontal-seam mismatch and representative `Bamboo` / `Bathroom Floor` / `Dominos` silhouette drift still failing source-faithful smoke coverage.

## Inbox
- **Petalis overhaul — remaining delight + UX follow-ups.** The overhaul core shipped in v1.2.0 (whorl layout, distinct shading + modifier stacks, convex botanical petal profiles + centre-anchoring, opt-in venation, the Bloom/Asymmetry/Cupping macros, a varied randomizer, and the non-destructive designer mount). Still to build:
  - **Species morph A→B.** A crossfade between two species/profiles, reusing `blendProfilePoints`/`profileBlendWeight` (already in `petalis.js`) — needs a two-source picker + a single blend slider in the panel/designer.
  - **Petal Designer undo.** The designer has zero `pushHistory` calls; route non-live commits in the canvas/shading/modifier/randomness bind sites through `this.app.pushHistory()` (hook point exists near `applyPetalDesignerToLayer`).
  - **Per-type shading cards.** Render only the controls a shading type actually uses (mirror the modifier-card pattern); add info buttons; surface the new `veinCount`/`veinReach` controls on the Venation card.
- **Pendula studio — Phase 3/4 remaining (tactile + craft + export).** The studio shipped in v1.2.0; still to build:
  - **Per-loop morph animation export** (the second time axis: a series of distinct evolving figures) — blocked on a frame-packaging decision (no zip lib in the no-build repo).
  - **Plotter hygiene on export** — randomize closed-loop seam start ("reloop") to avoid the pen ink-blot artifact.
  - **Optional node/matrix view** over the existing `{sourceId, targetParamPath, amount, …}` edge data (cheap — the data model already supports it).
  - **Deferred by design (judge-ranked lower / higher-risk):** the skeuomorphic main-canvas "Bench" (drag gears/arms/force vectors), the Patchbench node graph, the Twin-Elliptic machine type, a true-physics coupled-pendulum RK4 mode (log as a PRH hardening idea), and an elastic rubber-band linkage.
- **Meridian branch e2e shape-rect drift.** `tests/e2e/smoke.spec.js:1044 — shape reticle cursor appears for shape tools but selection restores normal cursor behavior` fails on `meridian-blue-skin` with a ~0.6 px Alt-drag rect midpoint drift vs `worldStart`. Passes cleanly on `main` (HEAD `6663bc9`). Verified pre-existing relative to Phase 5 — failed identically at the Phase 4 closure HEAD (`65290de`). Likely a layout shift introduced in Phases 2-4 (workspace pane chrome, padding/border drift) that nudges `getBoundingClientRect` between `worldStart` capture and Alt-drag mouse-down. Investigate canvas-bounding-rect timing in `src/render/renderer.js`. Visually rectangles still render correctly; this is a precision drift not a behavioral break.
- **Meridian Phase 3 menu deferrals.** Three menu wirings still use bespoke handlers and would benefit from primitive-based migration: (a) Layer-add submenu (`src/ui/shortcuts.js:517-565`) — needs `UI.overlays.Menu` to support submenus + custom item renderers; (b) Pen palette dropdown (`src/ui/panels/pens-panel.js:141-219`) — needs a new `UI.Menus.Palette` composing `overlays/Menu` chrome + custom swatch grid; (c) `this.openModal` → `UI.overlays.Modal` primitive promotion across the 7 centered modals (CSS rewrite vs class-name shim — pick an approach during the work).
- Migrate the remaining algorithm-local legacy noise paths (`flowfield`, `grid`, `rings`, `horizon`) onto `NoiseRack.defaultConfigFor` to finish the universal-noise convergence.
- Extract the remaining algorithm-tuning magic numbers (wavetable `0.45` / `0.866` / `0.5`, topo `0.45` / `0.866`, spiral tile constants, etc.) into `src/config/algorithm-tuning.js`.
- Reconcile the divergent `applyTile` implementations across `rainfall` / `wavetable` / `topo` / `spiral` and either unify them into `algorithm-utils.js` or formally document the per-algorithm contract.
- Investigate whether the `layer.origin` `{x:0, y:0}` back-compat default for pre-0.8.24 `.vectura` files preserves the prior bounds-derived behavior (renderer falls back to `profile.{width,height}/2` only when `origin` is absent — the new default may shift visuals on legacy saves).
- Extract more shared Noise Rack runtime primitives from the duplicated `wavetable` / `spiral` / `rainfall` implementations into `src/core/noise-rack.js`.
- Add tests for Noise Rack determinism, serialization, UI normalization, and algorithm parity across migrated systems.
- Add GitHub-side rulesets / branch protection, merge queue, and Project fields once the repository settings are available to configure.
- Decide whether to gate PRs on lint after introducing a repo-wide ESLint config that is compatible with the current browser-IIFE codebase.
- Add drag-to-mask layer assignment and richer silhouette providers for currently open-line-only algorithms once their envelope rules are stable.
- Add more modifier types beyond `Mirror`, reusing the shared modifier-container layer model and left-panel modifier registry.

## Done
- **v1.2.0 release.** All feature work since v1.1.0 — the universal preset system, the Morph
  modifier, the Pendula kinetic-harmonograph studio, the Petalis overhaul, four new 3D algorithms
  (Spiralizer, Topoform, Polyhedron, Raster-Plane) with STL import + shared rendering powers, the
  Terrain Free-3D mode with reworked river hydrology, and the gallery-first Wallpaper experience —
  shipped as **v1.2.0**. See `CHANGELOG.md` for the consolidated notes.

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
