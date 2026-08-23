# Plans

This file is the **single canonical punchlist** for the repository. Every open work item lives
here, in one of four priority tiers. Update it whenever meaningful work starts, changes scope,
or completes.

## Operating Rules
- This is the only punchlist. Detailed per-task specs may live in companion docs
  (`docs/audit-remediation-todo.md` holds the executable specs for `AUD-##` items), but an item
  is open only if it appears in a tier below.
- Tiers: **Now** (highest-importance, do next) · **Next** (real bugs and lost coverage) ·
  **Later** (debt, polish, feature backlog) · **Blocked on Jay** (needs a decision — do not
  start). Move items between tiers instead of duplicating them.
- Keep the tiers, `Done`, and `Decisions` current in the same PR as the implementation.
- Record architecture-level decisions in `Decisions` so future work has a stable reference.
- **Consolidation note (2026-07-18).** `algorithm_todo.md`, `test_refinement_plan.md`,
  `docs/todo-universal-preset-system.md`, and `specs/review-2026-05/` were each validated
  against current source and deleted; every item that survived validation was folded into the
  tiers below (originals remain in git history). `docs/todo-universal-preset-system.md` was
  fully done. Of the May review specs, A4/B3/C2/S1 were verified done; the A3-C1/A5/B1-A6
  remainders are under **Later**. The unbuilt algorithm families from `algorithm_todo.md` and
  the open findings from `test_refinement_plan.md` are under **Later**.

## Now
- **3D Scene: pick a tone algorithm — round 2, ten laws, no line budget.** Jay: "do these again
  but with no limit on the number of lines you may use — focus on nailing the lighting." A
  `TONE_UNCAPPED` mode (comparison only; committed `false`) lifts `MASTER_MAX_LINES` 420 → 4000,
  bypasses the `masterPitch` clamp so the master grid rules at the plot floor itself
  (`PLOT_FLOOR_PEN` 2.2 × pen = 0.66 mm), and calibrates the grid on the p90 local pitch instead
  of the median. The plot floor is the only limit left and every clamp is counted
  (`SurfaceFill.lastFloorStats`). Five more laws join the original five: `perceptualRamp`
  (Murray-Davies ink area → CIE L*, inverted, then divided by the measured LOCAL pitch so the
  chart's foreshortening leaves the answer), `crossFade` (layeredCross's three layers un-gated and
  faded in by continuous density), `contourFlow` (rulings are streamlines of the lighting — iso
  curves or their screen orthogonals), `errorDiffused` (the same target, two-tap error carry) and
  `fullLightingModel` (diffuse + terminator + core shadow + ground bounce + a separate specular
  term). The new metric is APPARENT-TONE LINEARITY: apparent tone (CIE L* from ink area in a 3 mm
  window) fitted against scene radiance, measured on the render.
  **THE RESULT, and it is a structural finding, not a ranking.** Nine of the ten sit at R² 0.00–0.14
  on the sphere and capsule however the coverage law is written, because the dither takes ONE
  verdict per RULING: a drawing whose rulings run along the chart can only vary its tone
  perpendicular to the chart, and the light does not run that way. Only `contourFlow` escapes it,
  by making the ruling direction the light's — sphere · hatch R² 0.444 and L* span 16.5 against
  `ladder`'s 0.037 / 8.1 — at the cost of streamline separation that leaves 10.6 mm free ends and
  10.2 mm bare gaps. `crossFade` is the strongest where the chart happens to agree with the light
  (cylinder R² 0.397, L* span 48.9, zero free ends) and is a strict improvement on `layeredCross`
  everywhere (which ends rulings 13–19 mm inside open surface on every cell). Renders in
  `scratchpad/fillcmp/tonealgo2-*.png`, side-by-side sheet `tonealgo2-lighting-compare.png`, full
  table `tonealgo2-table.tsv`. Needs Jay's pick before the staged unwire moves past Stage 1.
- **3D Scene: pick a tone algorithm.** Five laws are implemented side by side in
  `src/core/scene3d/surface-fill.js` behind `TONE_ALGO`, which is committed on `ladder` (no change
  to any existing drawing). Measured on the app-default scene across sphere/capsule/cylinder hatch,
  sphere crosshatch and ellipsoid contour: `continuousPitch` is the only one whose kept-ruling gaps
  collapse to a single consecutive pair {1,2} at every cell, with no free ends and the narrowest
  bare gaps; `fineLadder` measures within 0.01 of `ladder` (the residual coarseness is the master
  grid, not the rung size); `weightModulated` is the most even geometry possible (one pitch, CoV
  0.20) but moves the tone onto stroke width, which is a plotter/pen decision as much as a drawing
  one; `layeredCross` gives by far the strongest tone (ramp 3.5x) and the most even spacing (CoV
  0.10) but its zone boundaries are traceable edges and its confined families end 19 mm inside open
  surface. Renders in `scratchpad/fillcmp/tonealgo-*.png`. Needs Jay's pick before the staged
  unwire moves past Stage 1.

## Next
- **3D Scene: parentKey/pathKey quantization coherence (before the Phase 4A divisions
  UI ships).** `StrokeDivide.parentKeyOf` quantizes at a fixed 0.001mm while export/engine
  `pathKey` quantizes at `max(0.001, plotterOptimize)` — at any tolerance above 0.001 a
  divided layer duplicating an undivided layer's geometry on the same pen double-plots
  (keys never collide). Fix direction (judged): let consumers compute the parent key at
  their own tolerance (e.g. stamp parent points, not a pre-quantized string), or document
  parentKey as an opaque namespace and normalize float stringification. Add a regression
  test driving a divided layer against an undivided duplicate at `plotterOptimize = 0.5`.
- **3D Scene: minor division follow-ups (judged non-blocking).** (a) Engine
  dedupe/stats/linesort bucket by RAW `meta.penId` while export validates ids against the
  pen set — a stale/unknown per-path penId can drift stats vs export; align by validating
  in the engine too. (b) Division always cuts from `optimizedPaths` — with optimization
  preview off the canvas still shows fragments cut from optimized geometry (documented
  v1 scope; revisit if artists want an unoptimized divided view). (c)
  `scene3d/mesh.js` captures the Charts namespace at IIFE load (`|| {}` form) — same
  hardening family as PRH-024.
- **3D Scene: 0B deferred grammar items (Phase 4A prerequisites).** Weighted-random pen
  choice and per-path/jitter phase modes (G-02) plus pre-clip phase stamping (G-03a/b)
  are deferred; `divideChain`'s multi-path chain semantics are the intended seam, and
  `sanitizeDivisions`/`ensureLayerDivisions` must be extended in lockstep when the new
  class fields land (today they strip unknown fields on every recompute).
- **Morph parameter-space follow-ups.** (a) A Morph group nested *under* another modifier
  (e.g. Mirror) renders its rings un-mirrored — the outer modifier isn't applied to
  `morphedPaths` (logged PRH-005); (b) fill morphing is skipped on param-morph pairs (rings are
  whole regenerated path sets, not single regions); (c) curve-fit anchors are not re-fitted on
  regenerated intermediates (`p.curves` layers get dense polyline rings).
- **Strict Playwright Pattern fidelity regressions** — product bugs, not test debt: `Autumn`
  horizontal-seam mismatch and representative `Bamboo` / `Bathroom Floor` / `Dominos`
  silhouette drift still fail source-faithful smoke coverage.
- **AUD-06 — re-land the three regression tests stranded in the 2026-06-13 stash.** Note the
  audit doc calls it `stash@{0}`; the stash list has since shifted — it is currently
  `stash@{5}: On main: vectura-wip-inplace-repair+tests (pre-revert-merge)`. Verify by message,
  not index. Full spec: `docs/audit-remediation-todo.md` § AUD-06.
- **AUD-08 — surface silent persistence failures.** Cookie is ~230 B from the 4096-byte limit
  with no length guard; 6 sites swallow localStorage quota errors so a preset "saved" in
  private mode is silently lost. Full spec: `docs/audit-remediation-todo.md` § AUD-08.
- **Simplify follow-ups from the 2026-07-14 fix** (see Done + Decisions for the full record):
  (a) **P2 rename, don't unify** — three controls named "Simplify" with three different verbs:
  the Lab's is a non-destructive re-fit, the toolbar's a destructive anchor re-trace, the
  export step's a plotter tolerance in mm. Rename rather than converge behavior. (b) The
  latent **fillet-vs-gate ordering** in `toCurveAnchors`: `cornerRadius` is vetoed before the
  fillet pass runs — no production caller today, but a landmine if the Smooth slider is ever
  pointed at it. (c) Delete the false "windowed detection is strictly better" comment left in
  `geometry-utils.js` near the `CURVE_CORNER_*` constants.
- **Curve/smoothing unification — Stage E (the real work left).** `controls-registry.js:1608`
  — text's "Smoothness" (0..6) writes the SAME `smoothing` key as the universal 0..1 slider;
  rename it to `textSmoothness` (it feeds `optimizeAnchorsCardinal`, it is not a tension).
  `engine.js:55` shape smoothing still clamps 0..2. `EXTRA_PRESERVED`
  (`algo-config-panel.js:1751`) should move `[smoothing, simplify, curves]` into the base
  preserve set *(verify first — the preset-system validation found `OUTPUT_CONTROL_KEYS` may
  already cover this)*. Thread the saved `.vectura` version to `sanitizeImportedParams` for a
  migration shim — lands naturally with AUD-02. (All 38 shipped presets carry `smoothing: 0`,
  so the semantic change is invisible to them; only user-saved files with non-zero smoothing
  are affected.) Context: stages 0/A/B/C landed 2026-07-13 — the regression net
  (`tests/visual/curve-baseline.test.js`), Simplify no longer strips bezier anchors,
  Spiralizer honours `p.curves`, `src/core/path-draw.js` collapses all six trace copies,
  `GeometryUtils.toCurveAnchors`/`applyCurveFit` is the one fit. Plan:
  `~/.claude/plans/assess-why-enabling-curves-shimmering-hopcroft.md`.
- **Pattern Fill as a fill *type* inside the standard paint bucket.** Today Pattern Fill is a
  separate toolbar child of the paint-bucket group (`fill-pattern` / `fill-pattern-erase`).
  Instead, make "Pattern" one of the fill-type options within the standard paint bucket flow:
  pick the fill type, and choosing "Pattern" expands the pattern picker menu (swatch grid +
  scale/tile/spacing settings) inline in the same panel. This likely subsumes/retires the
  dedicated `fill-pattern*` toolbar children (which would remove the paint-bucket last-picked-
  child interplay for pattern). Touches `ui-fill-panel.js` (the paint-bucket panel + the
  `_buildPatternFillPanel` picker), the fill-type registry in `FillPanel.FILL_TYPE_OPTIONS`,
  and the toolbar group in `ui-petal-designer.js` / `shell/toolbar.js`.

## Later
- **3D Scene: shadow tone gradient still renders flat when the hatch bearing runs parallel to
  the shadow's throw axis.** Spacing is a transverse quantity, so when the hatch bearing runs
  parallel to the throw axis no pitch can express a gradient. The parallel-to-throw fix (see
  Done) correctly stopped stripping ink in that regime, but the shadow still shows zero gradient
  there. Proper fix: express tone as ruling **termination**, with feathered per-ruling cut
  points — the pattern `emitFamily` already uses in `shadows.js` (~lines 1500-1535). This is
  design work inside a tuned file, not a quick fix.
- **3D Scene: object-on-object shadow receiving.** Today shadows are **ground-only** — objects
  occlude shadow ink via the HLR clipper but never *receive* it. Measured 2026-08-21: a sphere
  floating directly above a slab casts through it onto the floor; all 180 `castShadow` paths carry
  `sceneTarget.objectId:'ground'` and zero carry the slab. `src/core/scene3d/shadows.js:1493`
  hardcodes the receiver (`objectId:'ground'`, `faceId:'face:ground'`, normal `{0,1,0}`); there is
  no receiver-selection code at all, and `:1630-1633` builds a single `groundFace`/`groundPlane`
  used by every emit. Jay confirmed 2026-08-21 that shadows stay floor-only for now, and that a
  per-object "receives shadow" toggle must NOT ship meanwhile — with no receiver logic it would
  change zero emitted paths, i.e. a false affordance of exactly the kind the fill-style audit
  removed. Scope if picked up: replace the closed-form `y=0` drop (`G = P - (P.y/d.y)*d`) with
  per-receiver-face ray-plane intersection, clip the projected silhouette to the receiver polygon,
  add caster/receiver ordering and self-shadow suppression, and reconcile with the receiving
  face's own mapper fill (the `inverse` problem, per face). Receiver count goes 1 -> O(3000) faces
  per object, so it needs a receiver-granularity decision (per-object plane = only correct for
  flat/boxy receivers; per-face = correct but combinatorial) plus a bbox prefilter to hold draft
  responsiveness. Estimate 3-5 days, ~800-1500 lines across `shadows.js` + `scene3d.js` + perf
  gating. When it lands, the param is `obj.shadow.receives` (extend `normalizeObjectShadow`,
  `src/core/scene3d/params.js:775-779`, default true) with the receiver filter beside `objectCasts`
  at `shadows.js:1740-1746`; the ground itself is layer-scoped (`params.ground`) and must omit the
  row, per the precedent already documented at `src/ui/shell/context-bar.js:1615-1617`. Red test
  must assert emitted geometry (>=1 path with `sceneTarget.objectId==='table' && regionClass===
  'castShadow'` on, 0 off) — it fails 0-vs-0 today, which is the proof the toggle would be inert.
  Full evidence: `scratchpad/recv/findings.md`.
- **In-app help guide has no 3D Scene Studio content.** `src/ui/modals/help-shortcuts.js` contains
  zero occurrences of `3D`, `scene`, `shadow`, `highlight`, `hatch`, `fidelity`, `x-ray` or
  `border`. The Algorithms tab's table stops at SVG Distort, so 3D Scene Studio — plus spirograph,
  spiralizer, polyhedron, topoform and raster-plane — is absent from it, and the scene-scoped
  keyboard shortcuts in `src/ui/shortcuts.js` (`getSceneShortcutLayer`,
  `dropSceneSelectionToGround`) are documented nowhere, in the app or the README. Nothing in the
  guide is *stale*; the whole subsystem is simply missing. Scope: add the algorithm rows, a 3D
  group under Tools or a Scene tab (Object vs Style tab split, Border lines vs Fill lines,
  Geometry, Shadow Layers/Softness, Highlight, X-ray), and the scene shortcuts. This is a `src/`
  change with integration coverage, so it did not belong in the v1.3.83 docs-only commit.
- **3D Scene: exact smooth curved−curved CSG cut curves.** CSG booleans that involve a curved
  primitive ship a **tessellation approximation** — curved children are detail-capped (~16 tris)
  and share the triangle budget, so a box−cylinder bore fills cleanly but the cut rim is faceted,
  not an analytic intersection curve. Deriving true smooth curved−curved cut curves
  (surface–surface intersection) is the remaining geometry work. Everything else from the
  v1.3.25–1.3.33 backlog — area + emissive light types, CSG solid/hole + group boolean,
  the ctxbar multi-select mixed-value display, and the point/spot polish list — shipped in
  v1.3.34–1.3.39 (see Done).
- **Curves Stage D (cosmetic).** The liveness ratchet proves no algorithm's Curves toggle is
  wrongly dead, so the remaining `meta.straight` → `meta.baked` reclassifications
  (`halftone.js:187/326`, `spirograph.js:121`) are semantic clean-up with zero behavior
  change. Polyhedron's edges are legitimately straight — consider `showIf`-hiding its Curves
  control rather than leaving a dead switch.
- **Curves Stage F.** Collapse the remaining private RDP/decimator copies (`pattern.js:2403`,
  `geometry3d.js:878`) onto `GeometryUtils.simplifyPath`.
- **Audit P2 debt** (specs in `docs/audit-remediation-todo.md`): AUD-04 stale `styles.css` in
  `release.yml` zip list (cosmetic); AUD-12 8 silently-passing `if (el) expect(...)` guards;
  AUD-13 CLAUDE.md algorithm counts stale + CHANGELOG behind; AUD-14 `loadInJSDOM` ×21 /
  `makeEngine` ×10 copy-paste divergence; AUD-15 items 1/4/5 (hooks:install parity,
  settings.local leftovers, `window.app` alias).
- **Math-utils consolidation remainder (May review A3-C1, re-verified 2026-07-18).**
  `Vectura.AlgorithmUtils` exists but the sweep is incomplete: local `clamp` still redefined in
  `src/ui/utils.js:18`, `ui-text-panel.js:111`, `algorithms/text.js:14`, `geometry3d.js:14`,
  `halftone.js:19`, `image-weave.js:16`, `image-source-util.js:15`; local `applyTile` in
  `rainfall.js:67`, `wavetable.js:56`, `topo.js:25`, `spiral.js:26`, `raster-plane.js:60`;
  `lerp`/`clamp01` in `geometry-utils.js:278/474`, `renderer.js:207`. Fold this together with
  the applyTile-reconciliation item below — they are the same sweep.
- **Engine state encapsulation remainder (May review B1-A6, re-verified 2026-07-18).**
  `reorderLayers`/`deleteLayersById`/`setActiveLayerId` exist but direct assignments remain:
  `layers-panel.js:208/218/676` (`engine.layers =`), `:959/983/1609/1858`
  (`engine.activeLayerId =`), plus `shell/header.js:191`, `ui-tutorial.js:671/1144/1155/1162`,
  `context-bar.js:357/1561`, `algorithm-panel.js:173`, `ui-file-io.js:201`, `shortcuts.js:313`.
- **Algorithm-tuning config remainder (May review A5).** Add `hexRatio: Math.sqrt(3)/2` to the
  frozen `rainfall` block of `src/config/algorithm-tuning.js` and have `rainfall.js:16` read it
  instead of the local `HEX_RATIO`. Fold into the wider magic-number extraction: wavetable
  `0.45`/`0.866`/`0.5`, topo `0.45`/`0.866`, spiral tile constants.
- **Reconcile the divergent `applyTile` implementations** across `rainfall`/`wavetable`/`topo`/
  `spiral` — unify into `algorithm-utils.js` or formally document the per-algorithm contract.
- **Noise Rack convergence.** Extract the remaining shared runtime primitives from the
  duplicated `wavetable`/`spiral`/`rainfall` implementations into `src/core/noise-rack.js`
  (stack blend-combination is centralized; deeper sampler extraction pending); extend to the
  remaining bespoke samplers after Petalis per-modifier stack UI parity; migrate the
  algorithm-local legacy noise paths (`flowfield`, `grid`, `rings`, `horizon`) onto
  `NoiseRack.defaultConfigFor`; add tests for determinism, serialization, UI normalization,
  and parity across migrated systems.
- **Test-suite refinement batch (from the 2026-05 review, re-verified 2026-07-18 — coverage
  thresholds graduated to Now).** Remove the vestigial `runtimeScene` wrapper in
  `tests/integration/mask-preview-group-drag.test.js:84`. Add error-path tests: corrupt /
  missing-viewBox SVG import; undo history driven past `maxHistory`; recursive mask hierarchy
  (A masks B masks A); `engine.generate()` with NaN/Infinity coordinates; 0-layer document
  save/open roundtrip. Add unit tests for `pen-validate.js`, `src/core/utils.js`,
  `validators.js`. Add `tests/perf/baselines.json` + `baseline × 1.5` gate to
  `tests/perf/stress.test.js` (replace the bare `<10000ms`). Trim DOM-selector coupling from
  `tests/unit/components/slider.test.js`. Replace the 2 remaining `waitForTimeout(80)` in
  `tests/e2e/smoke.spec.js:1601/1608` with `expect.poll()`.
- **Petalis overhaul — remaining delight/UX follow-ups** (core shipped v1.2.0): species morph
  A→B crossfade (reuse `blendProfilePoints`/`profileBlendWeight`, needs two-source picker +
  blend slider); Petal Designer undo (zero `pushHistory` calls today — hook point exists near
  `applyPetalDesignerToLayer`); per-type shading cards (render only the controls a shading
  type uses; surface `veinCount`/`veinReach` on the Venation card).
- **Pendula studio — Phase 3/4 remaining** (shipped v1.2.0): per-loop morph animation export
  (blocked on a frame-packaging decision — no zip lib in the no-build repo); plotter hygiene
  on export (randomize closed-loop seam start to avoid the pen ink-blot artifact); optional
  node/matrix view over the existing edge data. Deferred by design: the skeuomorphic Bench,
  the Patchbench node graph, Twin-Elliptic machine, true-physics RK4 mode, elastic linkage.
- **Meridian branch e2e shape-rect drift.** `tests/e2e/smoke.spec.js:1044` fails on
  `meridian-blue-skin` with a ~0.6 px Alt-drag rect midpoint drift vs `worldStart`; passes on
  `main`. Pre-existing relative to Phase 5; likely a Phases 2-4 layout shift nudging
  `getBoundingClientRect` between capture and mouse-down. Investigate canvas-bounding-rect
  timing in `src/render/renderer.js`. Precision drift, not a behavioral break.
- **Meridian Phase 3 menu deferrals.** (a) Layer-add submenu (`src/ui/shortcuts.js:517-565`)
  needs `UI.overlays.Menu` submenu + custom item renderer support; (b) pen palette dropdown
  (`src/ui/panels/pens-panel.js:141-219`) needs a `UI.Menus.Palette`; (c) promote the 7
  centered `this.openModal` modals onto `UI.overlays.Modal` (pick CSS rewrite vs class-name
  shim during the work).
- **Layer Modifiers — more types.** Layer new modifier types onto the
  `applyModifierToMultiChildPaths` multi-child / single-child contract now that Mirror and
  Morph both ride the group-like container model.
- **Algorithm backlog — genuinely unbuilt visual families** (from the 2026-05 inspiration
  roadmap, re-triaged 2026-07-18 against the shipped registry; halftone/image-weave/topoform/
  raster-plane/spiralizer already cover the rest): `polarLouver` (sunburst bars, louvered
  spheres, radial dash rings — fully unbuilt); `lSystem` (grammar/turtle branching — distinct
  from stochastic hyphae); `tessellationWeave` non-isometric modes (hex fan, hex labyrinth,
  scallop, Y-motif); `glyphField` field/vector/wells grammar (noise-driven mark fields,
  plotter glyph set); `scanlineWeaver` polar/cross/posterize modes; true swept
  `parametricTube` (parallel-transport frames + depth occlusion); `perspectiveMesh`
  projection modes (polarTunnel, globeGrid, fisheye). Shared-infra prerequisites: an SDF
  library and a reusable glyph emitter.
- **Drag-to-mask layer assignment + richer silhouette providers** for currently open-line-only
  algorithms once their envelope rules are stable.
- **Repo hygiene.** GitHub-side rulesets/branch protection, merge queue, Project fields once
  repository settings are configurable. Decide whether to gate PRs on lint after introducing a
  repo-wide ESLint config compatible with the browser-IIFE codebase. Optional cosmetic: delete
  the four unused `*_PRESET_OPTIONS` arrays in `src/ui/controls-registry.js:24-50`.
- **Investigate `layer.origin` back-compat default.** Whether the `{x:0, y:0}` default for
  pre-0.8.24 `.vectura` files preserves the prior bounds-derived behavior (renderer falls back
  to `profile.{width,height}/2` only when `origin` is absent — the new default may shift
  visuals on legacy saves).
- **Known limitations, kept visible (not defects).** SHP-1: the Shape Properties popover is
  uniform-corner-mode only — a side-count change resizes `cornerRadii` by refilling with the
  max radius, losing per-corner variation (per-corner editing stays on-canvas; a future
  enhancement could preserve/rescale the pattern). TXT-1: welded-kern glyph pairs on parsed
  web faces can merge two glyphs' ink into one contour so the sibling glyph gets no layer
  (geometry fully preserved; fix options logged as PRH-014; current behavior pinned by
  `tests/unit/text-outline-ops.test.js`).

## Blocked on Jay
Seven audit decisions (full options in `docs/audit-remediation-todo.md`) plus two design
questions. Do not start these without a decision:
- **`torus/crosshatch` needs the boundary-ends exception the sibling cell already has**
  (`3d-scene/unwire-highlight`). With the phase-stepped tone ladder, `scene3d-fill-boundary-ends`
  reports one free end of 1.48 mm on `torus · crosshatch`. That end is at x 122.6 — the exact
  coordinate, on the exact latitude ring, that the file's own `ALLOW` table already names and
  permits at 2.0 mm for `torus · contour` ("the near and far sheets meet TANGENTIALLY, so a
  0.35 mm raster cannot separate them"). Crosshatch's second family IS the contour family
  (`emitSecondary(+90)` → `emitFamily('a')`), so the exception belongs to the (primitive, family)
  pair and the table is keyed on (primitive, mapper). The even ladder now keeps that ring at every
  phase origin tried (0, 0.25, 0.35, 0.4, 0.5, 0.6, 0.65), which is expected: even spacing covers
  the whole index range where a bit-reversed subset could skip it. Decide: add
  `'torus/crosshatch': 2.0` to `ALLOW` (and let the meta-test's exception count follow), or ask for
  a different remedy. The test was left RED rather than edited.
- **The lit-cap pitch bar is stated in parameter space, measured in projection**
  (`3d-scene/unwire-highlight`). `scene3d-appdefault-lit-floor`'s "no gap wider than
  litMaxPitchPen × pen" now measures 5.60 mm against a 4.68 mm bar (was 4.47 mm). Its `QUANT = 1.3`
  slack was granted, in the test's own words, "because the ordered dither's rank quantization
  legitimately leaves the occasional DOUBLE step" — i.e. it was calibrated to the mechanism that
  has been replaced. With an evenly spaced family the parameter-space pitch is exactly
  `1/litFloorCov`, but equally spaced meridians do NOT project equally: on a sphere their projected
  pitch is widest at the centre of the disc, so the widest lit-cap gap is now the uniform pitch seen
  at its widest point. Stage 0 (every ruling drawn, perfectly even by construction) measures the
  same effect: worst bare gap 2.25 mm against a p50 nearest-ink of 0.99 mm. Honouring the bar in
  PROJECTION means raising `litFloorCov` ~1.5×, which is a tone change, not a spacing fix. Decide:
  restate the bar in projected millimetres, lift the lit floor, or accept and re-baseline.
- **AUD-07** — revive vs delete the orphaned Playwright screenshot suite (baselines ~3 months
  stale, runs in no CI job); either way, `mask-shift-drag.spec.js` must join `test:e2e`.
- **AUD-10** — delete vs adopt the dead 16-component "Phase 1" library kept green by 16 tests.
- **AUD-11** — destination for the 85 MB example + the history-rewrite proposal
  ([APPROVAL GATE]; the untrack step already landed under AUD-20).
- **AUD-15.2** — drop `tests/` from the version-bump hook trigger?
- **AUD-16** — license choice; the public repo has no LICENSE (cheap, arguably urgent).
- **AUD-18** — multi-tab storage coordination scope.
- **AUD-19** — cache strategy (every version bump busts all ~184 script/CSS URLs per visitor).
- **Text's Curves toggle is inert by design** — glyph outlines arrive already bezierized and
  the engine deliberately does not re-fit them. Making Curves-off actually de-curve a glyph is
  a text-specific change. Held by the ratchet in `curve-baseline.test.js`. Decide: hide the
  control for text, or build the de-curve.

## Done
- **3D Scene — cast shadow tone gradients: shredded rulings fixed, "No Tone" now works,
  crosshatch/scribble covered too (`443b4800` + follow-ups, `3d-scene/fs-z2-shadowfrag`, not
  merged).** `applyShadowToneGradient` used to chop each ruling into ~6mm chunks and hash-drop
  them by duty cycle, so the far end read as scattered stubs. Path count rose 535 → 2174 while
  ink *fell* 16110mm → 11583mm. Re-expressed as ruling **spacing**: `buildGradedSpacing` returns
  a `spacingAt(x,y) => mm` function that `hatchRingsEvenOdd`'s marching scan consumes, driven by
  the scene tone ladder through `Regions.coverageToSpacing` — the same primitive the uniform
  baseline already used. Result: 389 paths / 11529mm ink, path count now monotone *decreasing*
  in depth (535/487/438/389/342 at depth 0/.25/.5/.75/1), median ruling length constant at
  24.33mm across all depths, draft frames ~17% faster than the chunker. An audit found the first
  pass covered only the `hatch` mark class: the Fill Style picker filters on `toneLawApplies`,
  which knows nothing about the private `GRADEABLE_MARK_CLASSES` the fix introduced, so 9 laws
  in `cross` (`penReserve`, `penCross`, `mezzoRegion`) and `wave` (`mkScribble`, `ampSpacing`,
  `weaveDepth`, `interlockWeave`, `trochoidLoop`, `amplitudeOnly`) were still shredding and still
  user-reachable. Root cause: those recipes did raw `spacing * N` arithmetic, which is `NaN`
  once `spacing` is a function — wave silently dropped every mark. Fixed by routing `cross`
  through `scaleSpacing` and `wave` through `numericHint(spacing)` for amplitude only, leaving
  pitch to the graded scan; `GRADEABLE_MARK_CLASSES` is now `hatch`/`cross`/`wave`. Three more
  defects fixed in the same pass: **"No Tone" now disables the gradient** (gated in `build()` on
  the raw `shadowBag.shadowToneLaw === 'none'`, deliberately above the clamp, mirroring
  `surface-fill.js`'s Stage-0 sentinel); a **false warning** that was muting real unknown-toneLaw
  reports (`clampStyleParam`/`clampToneLawId` now accept the roster's own `DEFAULT`, `'ladder'`,
  which the roster deliberately excludes from `IDS` — every scene had been interning `'ladder'`
  into the warned-set and silencing the one channel meant to catch a genuinely unknown id); and
  **parallel-to-throw**, where pitch was pinned at 1.7×`sBase` and stripped 44% of the shadow's
  ink for zero gradient — now clamped to `sBase` within 30° of the throw axis, blending smoothly
  to unclamped by 60°. Test state at handoff: unit 4393 passed / 4 failed / 44 skipped,
  integration 1826/1826, visual 99 passed / 0 failed. The 4 unit failures are pre-existing and
  independently verified as such: 2 in `scene3d-faceted-tone-law` (it disables the ground, and
  `Shadows.build` returns empty with no ground, so shadow code never runs there) and 2 in
  `scene3d-hlr-spatial-index-identity` (the guarded invariant is intact — forcing the brute-force
  path by nulling the occluder index gives byte-identical output to the indexed path on all 6
  scenario×mode combinations, on this tree and on clean `421d4ac3`/`443b4800`; only the
  hard-coded fingerprints are stale). Verified in the running app: Ladder and Crosshatch show
  continuous rulings with widening gaps, No Tone is a uniform hatch, no `unknown toneLaw`
  warning in the console. **Known gap, deliberately not fixed here:** in the parallel-to-throw
  regime the shadow is now correctly left un-lightened, but it still renders no gradient at all —
  see Later.
- **Unreleased — 3D Scene: a fresh insert is a hatched sphere, and it actually has ink
  (`3d-scene/scene-defaults`).** Reported as "dropping a 3D scene gives an object with no lines,
  just a cube outline". Measured through the real insert path (`engine.addLayer('scene3d')` →
  `addSceneTree`, ink read off `group.scenePaths`, never `layer.paths`): the scene was never
  literally empty — it composed 113 paths — but **zero** of them were the object's surface. The
  seed was a **box** under **wireframe**, and `wireframe` (like `contourSlice`) returns false from
  `Scene3D.SurfaceFill` and takes the flat/edge path in `algorithms/scene3d.js`, so it never
  reaches the surface-fill emitter. The object contributed 9 structural edges; the other 104 paths
  were the ground quad (4) and its cast-shadow hatch (100). Wireframe itself is not broken — it is
  bypassing by design. Fix: the fresh-object default is now a **sphere** under **hatch**
  (`ALGO_DEFAULTS.object3d.primitive` / `.params` / `.style.mapper`, mirrored by
  `ALGO_DEFAULTS.scene3d.objects[0]`), and `addSceneTree` seeds that primitive from config and
  rests it on the ground (`transform.y = radius`). The **scene-scope** style stays `wireframe`
  deliberately: it is the fallback the ground fixture resolves to, and hatching it floods the whole
  ground quad. Box and wireframe stay explicitly choosable (Add Objects shelf; object Style
  flyout), pinned by tests. RGR: `tests/unit/scene3d-insert-default-ink.test.js` drives the real
  insert and asserts object-owned `sceneFill` on `group.scenePaths` (a bare `scenePaths.length > 0`
  check would have passed before the fix too). Two test fixtures that built a scene tree and then
  forgot to drop the auto-seeded child were repaired in the same pass (`scene3d-curves`,
  `visual/curve-baseline`).
- **v1.3.84 — Draw Order: one plot order, and an overlay pinned to the drawn geometry
  (`fix/draw-order-playback-v2`, `19c1149`..`ddd3905`).** Restores the order-agreement fix that was
  reverted in `1dc1e53`, and adds the contract that was missing when it shipped a visible
  regression.
  - **Order (`19c1149`).** Preview / playback / export were three implementations of "plot order".
    The overlay sorted `layer.optimizedPaths` globally by `meta.lineSortOrder` with no pen grouping;
    the reveal and the SVG export both group by pen first. Export is authoritative, so the preview
    was wrong. Unified on `Renderer.buildPlotSequence` + `Renderer.buildPlotRecords`, and
    `optimizeLayers` without an explicit config no longer degrades Combined/Per-Pen grouping to
    per-layer. RGR is behavioural, not API-absence: 5/5 green, 3/5 red with the old preview
    ordering restored, 1/5 red with the old per-layer dispatch restored.
  - **Position (`0a89fc5`).** The reverted attempt's follow-up drew a coloured ghost offset from the
    real capsule plus stray segments in empty corners; every existing test asserted on path
    sequence, none on ink position. New test captures the canvas coordinate stream with the overlay
    off vs on and requires the overlay to re-trace only existing ink without extending the inked
    bounds. Red proven by injecting a −15mm overlay offset and by pushing group `scenePaths` into
    the preview.
  - **Decision — scene groups stay OUT of the colour preview.** `engine.optimizeLayers` filters
    `!layer.isGroup`, so a group never gets `optimizedPaths` and no composed scene path carries
    `meta.lineSortOrder` (measured live: 966 scene paths, 0 with an order). Colouring composition
    order as plot order would fabricate a draw order. The guard is now explicit in
    `getDrawOrderPreviewItems` rather than implied by `getOptimizationTargetIds`.
  - **Archaeology (`ddd3905`).** Re-verified before re-applying: `19c1149` renders byte-identical
    canvases to `1dc1e53` on a scene-only document at every reveal value, and the naive
    groups-in-preview follow-up draws in the correct place in that configuration too — so the exact
    document that misplaced was not reproduced. Said plainly rather than claimed fixed; the
    position test guards the defect class regardless of which edit introduced it.
  - **Known gap, unchanged and out of scope here.** A 3D scene still has no draw order: at Line Sort
    Nearest/Vertical the reveal shows the whole capsule at 25% and 50%, then the ground and shadow
    arrive together at 75% — composition order, not a vertical sweep. A scene-only document also
    still exports an empty SVG (Impact Preview reads PATHS 0). Tracked separately.
- **v1.3.83 — border/silhouette contiguity, line output split by role, and seven rounds of
  shadow/tone anatomy (`3d-scene/p4`, `25fb800`..`e66c692`).** Six merges, documented as one
  release. The through-line on the geometry half: **structural edges are emitted one projected
  mesh edge per path**, and every defect below is a consequence of treating that stick as if it
  were a finished path.
  - **Border contiguity (`0ff4962` RED → `25bca1d`).** Border offset each two-point stick along
    its *own* screen normal, so a shared mesh vertex landed at two screen points — a gap at every
    vertex, widening with Fidelity. Endpoint chaining matched nothing: 104 of 112 border paths
    stayed two-point `meta.straight` sticks even at Smoothing 1.00, and a two-point path *is* a
    straight line, so the fitter was structurally unable to smooth it (the "lumpy border"). Now
    chained on **integer mesh vertex indices** (topological, hence Fidelity-invariant), HLR runs
    stitched in traversal order, offset as a whole loop-aware polyline. RED 216 dangling endpoints
    at Fidelity 22 / 88 at 12 → 0. Multi-loop silhouettes (torus face-on) keep every loop. Border
    defaults OFF and the off path was untouched, so no golden moved.
  - **Plain silhouette, Border OFF (`bec3334` RED → `d9b67cb` → `5823104`).** Same root cause,
    other door — `MIN_RUN_MM` (0.6 mm) was applied per stick, so raising Fidelity shortened every
    stick until stick after stick fell under the floor. Sphere dangling 0/0/8/36/92 at Fidelity
    8/12/22/40/60; capsule outline shattered into 1/1/1/14/18 components. Floor now judges the
    **welded chain** (union-find over integer vertex indices; visible and hidden runs weld in
    separate classes). `5823104` restores the floor's original job: a run on an edge the **clipper
    cut** keeps the per-run floor (that is a sub-floor whisker, ~0.02 mm at a silhouette corner,
    and must not weld two stretches together); a whole uncut edge is judged by its chain. Sweep of
    42 scenes: unchanged 16/42 → 24/42. With Border ON the two passes overprint at ±0.12 mm and
    had been **masking** this.
  - **Style-less child inherits the scene (`ee91289`).** `collectSceneParams` unconditionally
    republished `byObject[id] = normalizeStyle(child.params.style)`, and `normalizeStyle(undefined)`
    yields `mapper:'none'` — which *beats* scene scope in the whole-style-wins cascade. User-facing
    through `importState`: a `.vectura` with a style-less `object3d` child loaded unfilled (0 →
    32 `sceneFill` measured). Same shape as `5cfdbeb` (monolith expansion, 72 fill → 0), reached
    through a second door. An unstyled child now leaves the slot **absent**.
  - **Line output split by role (`1eb4c3f` → `74d149e` → `5b45891`).** Curves / Smoothing /
    Simplify were one object-level set governing silhouette *and* fill together. Now: Object tab
    **Border lines** (object bag) vs Style tab **Fill lines** (`fillCurves` / `fillSmoothing` /
    `fillSimplify` / `fillFidelity` in style params, riding the existing StyleCascade — not a
    third scoping model). `meta.kind === 'sceneFill'` is the whole dividing line; chaining is
    border work and is gated on the border side alone. **Style Fidelity is sampling density along
    a fill line**, not tessellation: it scales `SurfaceFill.steps` (clamped 6–220; slider
    0.25–3×, default 1), while mesh Fidelity (`params.detail`) stays on the Object tab. Gating is
    *absent*, not inert — stipple gets no group, and Fidelity additionally requires the
    chart-sampled fill, so region contours and flat-clip spirals drop that row. Defaults
    byte-identical; visual 111/111.
  - **Shadow + tone anatomy, rounds 1–7 (merged from tag `round7-accepted`).** **Shadow ▸ Layers**
    (Off / 2 / 3 / 4) replaced nested inset rings — which put the dense core on the footprint
    *centroid*, hatched every layer at the same angle so added rulings landed on existing ink, and
    had no contact band at all — with contact collar / umbra wedge / penumbra zones over one
    phase-anchored master grid. Layers **redistributes** ink (C11: ±25% across 2/3/4). Also:
    reflected light and a terminator dip; Density live again on curved objects (ball fill ink
    3001 → 6618 across Density 10→100); one composed density budget split across every pass (peak
    object coverage 0.636 → 0.531 against 0.56); rank-quantized faceted tone (cube face spread
    1.32× → 6.09×, the 3-band **inversion** fixed); a working faceted highlight dispatch (blank /
    sparse / stippleOut / altFill had been byte-identical, `highlightSensitivity` inert in
    perFace). **Cast shadow scores 15/15 (C1–C15). The object-shading half is NOT done** — open
    O-items remain and T/F moved during `2823321` and was deliberately reported rather than tuned.
    Layers Off keeps the legacy flat path.
  - **Label truth.** Shadow "Falloff" → **Softness** (`a6fff9b`; label only, key/clamp/default
    untouched — and `src/config/context-bar.js` lost its stale pre-RC1 sun copy). Highlight
    "Keep" → **None** (`0188e01`; a total bypass, Strength/Pen *removed* not disabled; persisted
    value still `'keep'`, with `'none'` folded onto the same option). Geometry rows now name the
    quantity they show (`0a2239b`; display/edit layer only — torus Diameter/Thickness, torusKnot
    Span/Thickness, full-extent Height/Base, capsule Length, ellipsoid/superellipsoid Radius
    X/Y/Z. An sx-80 torus is 125 mm across).
  - **Buckyball radius (`a26379d` → `1e5476a`).** `scaleMeshToRadius` divided by a
    `Math.max(1, …)`-floored bounds measure; the truncated icosahedron is the only solid whose
    pre-scale circumradius (0.8685) sits under that floor, so a buckyball built **13.1% under**
    its stated Radius. Now measures the true circumradius; `SCENE_MIGRATIONS[3]` rescales saved
    documents.
  - **Ctxbar dropdown direction (`1f422db`).** One shared `refreshMenuDirection()` pass on the bar
    replaces seven per-menu call sites (only three of which flipped at all, and closed carets
    lied). Rule is "away from the nearest viewport edge"; overflow is handled by a
    `--ctxbar-menu-space` height cap folded into each flyout's `max-height: min()`, not a second
    branch. Direction freezes mid-drag and settles on pointerup.
  - **Open / deliberately not carried.** The in-app help guide (`src/ui/modals/help-shortcuts.js`)
    still has **no 3D Scene Studio content at all** — not in the Algorithms table, not in Tools or
    Canvas, and the scene-scoped shortcuts in `src/ui/shortcuts.js` are undocumented. Logged under
    `Later` rather than folded into this docs commit, which is docs-only by class.
- **Unreleased — scene-tree reachability batch: gizmo, geometry, hatch angle, shadows, tone
  goldens (`3d-scene/p4`, commits `edf8242`, `686eacf`/`57d699a`/`7c82597`, `8e94090`,
  `eee11eb`).** Seven units built in parallel isolated worktrees, cherry-picked in, gated
  together (unit 3707 / integration 1557 / visual 109 = 67 byte-identical + 42 new / e2e 62 /
  perf 7). **The through-line: a control that exists, is labelled plausibly, and is bound to
  nothing.** Five separate instances found this batch, all consequences of the monolith→tree
  restructure never being followed through the UI layer.
  - **Orbit gizmo (`edf8242` precursor `18f1306`).** Drawn without 2D bounds; hit-tested only
    *with* them. A scene group has none, so clicks fell through to picking, took the ground,
    and re-anchored to the ground quad (+917px on a 1336px canvas); the next click cleared the
    selection. Fixed at three sites (down gate, anchor ground-refusal, hover gate). An
    independent investigator reached the same root cause separately; both agreed the earlier
    `b113151` fix was correct but for a *different* gizmo, and that its 141-point sweep and its
    `_sceneDownSelect`-entry tests could not have observed a caller-side gate.
  - **ctxbar Style writes (`edf8242`).** Landed in the group style table, which
    `collectSceneParams` overwrites from the child on every compose. A/B on composed
    `group.scenePaths`: tree child 1 hash (dead) → 3 distinct; monolith 3 → 3 unchanged. Routed
    to the child layer; `params.js` deliberately untouched (merging there would resurrect stale
    group-table entries and risk the inline back-compat path).
  - **Geometry controls (`fcef5af`, earlier).** The panel had no primitive selector at all and
    8 of 10 shapes were UI-unreachable. Twelve geometries, per-shape control table mirroring
    `MAPPER_CONTROLS`, size-preserving swap via a new engine-side `setObjectPrimitive`.
  - **Hatch angle (`c131b56` + `8e94090`).** `fillAngle` was in the curved fill's opts contract
    and passed by the caller but never read; also part of the group key, so changing it
    regrouped the fill and re-emitted identical geometry. Nine chart-wrapped primitives
    affected (ellipsoid included — found empirically by spying on `SurfaceFill.buildObject`
    across every primitive × mapper, not from a list). SCENE_VERSION 2→3 migration pins
    pre-existing curved hatches to 0°; **an absent `fillAngle` is 45, not 0**, so the shipped
    `scene3d-studio-shadows` preset needed pinning too, and `applyPreset` had to run the
    migration because a preset's own `sceneVersion` wins over the default. Curved crosshatch
    threaded through, mirroring `crossFamilies()` exactly.
  - **Shadows (`686eacf`+).** Two root causes: ctxbar required the group in `selectedLayerIds`
    (both entry points select the child), and the panel's shadow block hung off light rows a
    tree never renders because tree conversion empties `params.lights`. Implementer rejected
    both framings offered and moved shadow styling out of the light inspector entirely —
    correct: it is scene-wide, and `collectSceneParams` unions inline *then* child lights, so
    un-emptying would light every tree scene twice. **Jay's semantic fix: Shadow ▸ Angle
    rotates the fill lines, it does not move the shadow** — measured, dial 45→306: bearing
    51.92°→171.16°, footprint bbox drift ≤0.16px, sun untouched.
  - **Tone goldens (`eee11eb`).** 26 JSON goldens / 42 tests, the first pins on scene3d tone.
    Determinism proven (3× per run permanently + 4 cross-process regenerations, identical
    digest). Sensitivity proven by monkeypatching the coverage read: they detect a flipped
    ladder at *both* complement sites. The `layer.paths` false-positive trap that misled five
    agents is now itself a test.
  - **Method note.** Adversarial review and independent second-opinion agents caught real
    defects repeatedly this batch; the composed-output measurement warning
    (`group.scenePaths`, never `layer.paths`) had to be issued five times and prevented at
    least two fictional result matrices.
  - **Found, NOT fixed (queued):** `expandMonolithToTree` drops a scene-scoped fill (leaf style
    copied only `if (byObject[obj.id])` while collect always writes it → 0 `sceneFill` paths);
    **`tone.specular` is live on the curved fill and ignored by the faceted `coverageGain`**
    (same family as I27); `highlightPenId` never reaches `stippleOut`/`sparse` ink (applied
    only when `dashHL` is set); torus "Diameter" label lies (`major = 0.75·sx`); stale
    "sun bearing" strings in `src/config/context-bar.js`; `booleanGroup3d` Cast row shows a
    default because `_sceneObjectById` rejects non-`object3d` children; a union/intersect group
    with a faceted primary + differing curved child style at 45 will shift to 0.
- **Unreleased — OBJ/STL 3D-model import → scene object (`3d-scene/p4`).** `File → Import
  3D Model…` parses a `.obj` (new `src/core/scene3d/obj-import.js`: v/f, n-gon fan, slash +
  negative indices) or `.stl` (reuses `src/core/stl-parser.js`) mesh and wraps it via the new
  `engine.importMeshAsScene` as an object3d `solid` `{solidType:'importedMesh'}` — no new mesh/
  render plumbing (rides the existing Convert-to-Scene importedMesh path). Lands in the active
  scene when one is selected, else builds a fresh scene tree (group + sun + ground). Shared
  `buildImportedMeshParams` centres + unit-normalises like convert. RGR: `tests/unit/obj-import`,
  `tests/integration/import-mesh-scene`. Follow-up (the "Buckyball" fallback label) fixed below.
- **Unreleased — 3D scene live-defect batch: gizmo picking, addable shapes, import hardening
  (`3d-scene/p4`, commits `b113151`, `bcdf420`, `1937413`, `446ea02`).** Four units built in
  parallel in isolated worktrees off `1d7e951`, cherry-picked in, gated together.
  - **Gizmo picking (`b113151`).** Jay: "the 3d gizmo disappears when I click on it." Root cause
    was a *fourth* instance of the inline-only scene shape: `_scenePickFaces` rebuilt the depth
    pick surface from `layer.params`, which is empty on a tree, so the real-depth pass was
    silently disabled and the ground plane's coarse centroid depth (−170) beat the box (−32).
    Fix: `_composeSceneGroup` publishes `_sceneAssembled` (cleared each compute pass, never
    serialized) and the pick builder reads it; pick cache re-keyed on `scenePaths || paths`.
    RGR `tests/unit/scene-tree-pick-depth`.
  - **Addable shapes (`bcdf420`).** Jay: "I can't find where to add other shapes." Not merely
    undiscoverable — 8 of 10 primitives (incl. sphere and torus) were **unreachable from the UI**:
    the Add Objects shelf was gated `if (!isSceneGroup)` after the tree restructure, leaving two
    context-menu items hardcoded to `box`/`solid`. Shelf un-gated for scene groups and routed via
    `addObjectToScene`; context menu gained Add shape / Add light categories; empty-state copy
    corrected. Also the imported-mesh `solidType` readout + reversible round-trip.
    RGR `tests/integration/scene3d-add-shape`; one stale assertion in `scene3d-panel` updated.
  - **Import hardening (`1937413`).** Adversarial review of the import found 3 HIGH defects with
    measurements: no vertex welding (5× ink, no shared-edge connectivity), no face budget on the
    OBJ path (57.6k tris = 11.2 min frozen tab), and meshes centred on the origin so they sat
    half-buried. Plus nested-mesh undo bloat, tab-delimited rejection, and silent failures.
  - **Reducer + ground-rest (`446ea02`).** Review of the above returned KEEP WITH FIXES: the
    stride reducer shredded closed surfaces (contours became unplottable 2-point stubs) so it
    became connectivity-preserving vertex clustering — but that clustering wasted budget (a 40:1
    rod kept 36.7%) and collapsed short-axis detail (239 → 27 cross-section angles). Now
    binary-searched grid + per-axis cells (98% budget, 140 angles), re-wound inverted triangles,
    a lower-bound guard (a mutant emitting 3.2% of budget had passed all 9 tests), ground rest
    that survives Radius/Scale, and the convert-to-scene bake capped (was 120,000 faces).
    `package.json`'s `test:e2e` enumeration was also missing `import-3d.spec.js`, so the new
    9-case spec was not gated despite the `playwright.config.js` edit.
  - Gate on the integrated tree: unit 3596 / integration 1516 / visual 67 byte-identical /
    e2e 62 (import-3d 9 executing) / perf 7, `scene3d-drag` flat.
  - **Open for Jay:** adding a shape selects it (shelf disappears — rapid multi-add?); new
    children named `Object 05` not `Torus 05`; ~24-row context menu; the Scene panel's in-panel
    Scene Tree / Boolean Groups sections still read `params.objects` and are permanently empty
    for a scene group (a fifth inline-only site, untouched); `playwright.config.js` pins port
    4173 with `reuseExistingServer`, so concurrent e2e across worktrees can cross-attach.
- **Unreleased — Phase 4A divisions/pen-grammar + hidden-edge EdgeStyle (v1.3.62–1.3.66,
  `3d-scene/p4`, commits `5d232e2`..`8239db7`).** The stroke-division phase (engine already
  shipped divisions) plus the deferred pen grammar and the Phase-4 tail edge styling:
  - **Inc-0 dedup (5d232e2, v1.3.62).** Divided-stroke fragments no longer double-ink a
    coincident undivided duplicate on the same pen. Fragments carry raw parent geometry +
    fragIndex; one shared `createPlotDeduper` keys at each consumer's tol (engine/stats/export
    parity). A fragment claims the parent key only when it gaplessly retraces the whole parent
    on one pen — so a **dashed/multi-pen division no longer suppresses a coincident solid**
    (a lost-ink regression caught by adversarial review). fragIndex keeps self-retracing
    siblings alive. Stack-order independent.
  - **Inc-1 divisions editor (4f99da5, v1.3.63).** First registered `FillControlSurface`
    section: enable + phaseMm + a class list (lenMm / per-class pen / gap) with add/remove/
    reorder, mounted in the ctxbar Stroke Options popover (universal per-layer). Writes route
    `ensureLayerDivisions` → recompute → live preview.
  - **Inc-3 pen grammar (604c5b7, v1.3.64).** `penMode: cycle|weighted` (+ per-class weight),
    `phaseMode: fixed|perPath|jitter`, a serialized seed. Weighted picks each fragment's pen by
    weight via a deterministic FNV-1a hash (no live RNG); fixed now dashes continuously across
    sub-path seams. sanitize/ensure accept the fields in lockstep; defaults no-op. Adversarially
    reviewed sound. (Minor: `_divisionSeed` folds div-seed 0 and 1 — cosmetic.)
  - **Inc-4 hardening (c78babb, v1.3.65).** `PenValidate.resolveEffectivePenId` gives engine
    stats/grouping the same effective-pen rule as export (stale penId no longer mis-counted);
    `mesh.js`/`csg.js`/`scene.js` resolve their sibling Scene3D namespaces at call time.
  - **Hidden-edge EdgeStyle (8239db7, v1.3.66, C-06).** Per-class `edgeStyles`
    {pen, weightMm, dash} for silhouette/crease/boundary/interior + hidden (drop|dash),
    scene-wide on the scene group's Style tab. Defaults no-op (byte-identical); per-object
    x-ray/showHidden stay authoritative and are layered under the scene-wide default. `seam`
    class deferred (open hook for CSG). Adversarial byte-identity confirmed via visual suite.
  - **Inc-2 plot-physics readout (6abd890, v1.3.67).** Document Overview shows per effective
    pen (real plot order): lifts, pen-up travel, draw length, estimated time (machine speeds +
    per-lift time), an all-pens total, and a K-05 min-segment/gap guard (count + warning).
    Extends `computeStats` with `{physics:true}`; read-only (no geometry drift).
  - **Polish follow-ups (v1.3.68–1.3.69, `6728925`..`e4a3bd4`).** (PA) `_divisionSeed` seed 1
    now distinct from the default (seed 0 byte-identical, no saved-doc drift); plot-physics
    swatch contrast on the dark panel. (PB) per-object EdgeStyle overrides (per class,
    inherit-scene default) + per-object stroke Divisions in a scene — the compositor
    partitions emitted paths by objectId and runs the shared `divideChain` per contiguous
    object run (byte-identical default; hardened per adversarial review: no-op skip +
    per-run splice fallback). Overrides are isolated per object.
  - **X-ray fold (ef66c8e, v1.3.70).** Reconciled x-ray with per-class Edge Styles (Jay:
    Option A pure). X-ray = see-through back-face FILLS only; the per-class `edgeStyles.hidden`
    (Drop|Dash) is the sole owner of hidden-EDGE treatment. `SCENE_VERSION` 1→2 migration seeds
    existing x-ray objects to `hidden='dash'` (byte-identical); `edgeStyleFor` became per-field
    merge; the FILL see-through terms stay `visibility`-coupled. New capability: see-through
    fills with dropped hidden edges (or dashed edges without x-ray). Three adversarial-review
    byte-identity regressions found + fixed, pinned by pre-fold goldens.
  - **Convert-to-Scene I1 (b27f43b, v1.3.72).** "Convert to Scene" on a Polyhedron/Topoform
    layer context menu. `engine.convertAlgoToScene(layerId)` calls the algo's new `bakeMesh`
    (polyhedron applies `applyVertexEffects`/`renderedFace` deformers during the bake; topoform
    replicates its `generate()` mesh), normalizes to unit extent, and wraps it as one
    `object3d {primitive:'solid', solidType:'importedMesh', importedMesh, radius}` under a fresh
    scene group seeded with a directional light + ground (mirrors `addSceneTree`). Standalone
    view angles map onto the scene camera; pen/style migrate onto the child; source layer is
    removed (undoable). Rides the existing `solid`+`importedMesh` mesh path — fixed a latent
    `buildPrimitiveMesh` bug that dropped `importedMesh` from the whitelist (undefined for every
    parametric solid → byte-identical). Topoform `contours` mode blocks with a Toast (its scene
    treatment = I5, next). 8 integration + 5 menu-compile tests (RGR); baselines byte-identical.
    Next: I2 (deformers → live `solid` params), I3 (panel/add-object parity), I4 (topoform
    parametric live), **I5 (scene-level depth-slice contour treatment — do next, not deferred)**.
  - **Convert-to-Scene I2 (5017481, v1.3.73).** Parametric polyhedron now converts to a LIVE
    `solid` object3d instead of a frozen mesh. Extracted the deformer math (`hash01`,
    `applyVertexEffects`, `renderedFace`, `applyPolyhedronDeformers`) into `scene3d/mesh.js`
    (exported on `Scene3D.Mesh`); `polyhedron.js` now destructures the one implementation (no
    fork — standalone output byte-identical). `createSolidMesh` applies deformers only when
    `p.applyDeformers` is set (standalone never sets it; the compositor does). Inert deformer
    defaults (expand 100, twist/explode/extrude/shard 0) added to `PRIMITIVE_PARAM_DEFAULTS.solid`
    + `OBJECT3D_PRIMITIVE_DEFAULTS.solid` and forwarded by `buildPrimitiveMesh` → undeformed solid
    renders identically (baselines byte-identical). `convertAlgoToScene` emits a live `solid`
    (solidType + deformer params) for a parametric polyhedron; keeps the importedMesh bake for
    topoform + STL/imported polyhedra. `bulge`/`faceBands` are line-art-only, excluded from the
    solid mesh. New `convert-to-scene-live-solid.test.js`; live-verified (edit deformer on a
    converted object → geometry re-evaluates).
  - **Convert-to-Scene I3 (f885827, v1.3.74).** Panel/inspector parity for `solid`. New scenes
    are always scene-trees (the monolith Add-Objects shelf is retired for scene-groups), so the
    live add path is a layer-context-menu verb **"Add solid (polyhedron)"** →
    `addObjectToScene(id,'solid')` (default solidType `buckyball`, radius 20 scene-consistent,
    inert deformers). The object3d inspector (`buildObjectPanel`, `if(prim==='solid')`) now shows
    a Solid-type dropdown (16 parametric families; `importedMesh` omitted — no STL affordance in
    the panel) + the 5 live deformer sliders (expand/twist/explode/extrude/shard, standalone
    ranges); edits ride the existing commit/liveSlider → `app.regen()` recompute. `bulge`/
    `faceBands` hidden (line-art-only). Box/other prims gate them out; existing scenes byte-
    identical. New `scene-solid-i3.test.js`. I5 seam: mapper controls live in the Style tab's
    `MAPPER_CONTROLS` table — `contourSlice` extends that, reusing the `SOLID_DEFORMERS` idiom.
  - **Convert-to-Scene I4 (1f546d4, v1.3.75).** Parametric topoform (renderMode wireframe/
    triangleMesh) converts to a LIVE `object3d` chart primitive instead of a frozen mesh.
    `convertAlgoToScene` maps each `sourceMode` → the matching object3d chart primitive
    (sphere/ellipsoid→`ellipsoid`, others name-for-name) with `{sx,sy,sz,detail}` resolved
    exactly as `bakeMesh`/`createPrimitiveMesh` do. **Gotcha fixed:** topoform's `ellipsoid`
    chart applies cosmetic axis factors (rx×1.18, ry×0.72, charts.js:240) the object3d ellipsoid
    doesn't — baked into the mapped sizes so geometry is byte-identical (9-mode parity sweep).
    **Mapper = `hatch`, not `wireframe`** (justified deviation): the scene `wireframe` mapper
    HLR-clips every face edge and is intractable at topoform's default `primitiveDetail 100`
    (~40k faces → convert hangs); `hatch` composes the same mesh in ~1.5s and matches the I1
    bake's own look. A faithful live wireframe treatment is deferred to a compositor-perf pass
    (edge dedup / face budget). **Live:** the 9 chart sourceModes. **Bake fallback:** `cube` (no
    chart analog) + `stlMesh`/imported. **Blocked (unchanged):** `contours` at engine.js:770-772.
    Topoform inspector deferred (generic size/detail controls already cover adjustability). New
    `convert-to-scene-live-topoform.test.js` (14). **I5 seam:** flip the engine.js:770-772 block
    to a live `contourSlice` emit; NOTE the same wireframe-density limit — a contour mapper must
    be budget-aware to survive default detail 100.
  - **Convert-to-Scene I5 (70becd3, v1.3.76) — CONVERT CHAIN COMPLETE.** New `contourSlice`
    object3d mapper: depth-plane cross-sections of a mesh, occluded/self-occluded/shadowed by the
    shared compositor. Slice helper `Scene3D.Slices.buildSliceSegments` (pure/deterministic,
    registered on the namespace — no new script file / no index.html edit) cuts `record.world` by
    N planes (normal = world +z rotated by sliceRotate/sliceTilt, so the cut point stays in world
    space → exact projected depth), reusing topoform's `trianglePlaneSegment` (quads fan-tri'd);
    standalone topoform slicer untouched. Per-record pass in scene3d.js `records.forEach` (after
    curved-surface fill): projects via `scene.projectWorld`, runs each segment through the
    existing `clipper.clipPath(pts,{objectId})` (NO selfObject → through-body self-occludes),
    `emitRuns('sceneFill', hiddenTreatment)`; normal face outline/fill suppressed for
    contourSlice (silhouette still draws). Params (inert): sliceCount 26, sliceAxis 'z',
    sliceRotate/sliceTilt 0, sliceVisibility 'visibleOnly'. **Budget-aware (I4 perf constraint):**
    tri×plane cap (SLICE_TRI_BUDGET) + occluder-adaptive plane reduction (maxClip =
    clamp(SLICE_TEST_BUDGET/(occluders+1),400,12000)) + hard per-record clip counter (overflow →
    raw front-only) + draft frames skip HLR + MIN_RUN_MM sliver floor; guard test (detail-80
    sphere × 120 slices ~660ms); convert at default detail ~3.9s incl. full recompute. Convert
    block at engine.js flipped: contours → contourSlice child (lineCount→sliceCount,
    planeRotate→sliceRotate, planeTilt→sliceTilt, contourVisibility→sliceVisibility). I5.5
    controls in scene3d-panel Style tab. Only intended baseline flips: convert-to-scene (d)/(d2)
    + live-topoform (d) block-asserts → emit; visual 67/67 byte-identical. New
    `scene3d-contour-slice.test.js`. **Adversarial review (new render output) found + fixed a
    SEVERE budget-model defect** (e177b81, v1.3.76): the original derived plane count from the
    global occluder count, so at raised `primitiveDetail` the contour output collapsed to ~8
    fragments, flickered with camera pose, disagreed draft-vs-full, and was perturbed by unrelated
    objects (all confirmed empirically). Fix: **plane count is now a pure function of `sliceCount`
    alone** (occluder count / camera / draft / other objects never change it); each plane's cuts
    are **linked into continuous rings** (a second collapse — thousands of sub-`MIN_RUN_MM` chords
    the floor silently dropped); perf bounded by a **fixed HLR clip-work budget** (sampled length ×
    occluders) that degrades by emitting overflow rings RAW, never by dropping planes; draft = full
    minus HLR at the same plane count; `fullContour` back rings now dash on solids via `forceHidden`
    (not only x-ray); dead `sliceAxis` removed; budget comment corrected. 5 RGR regression tests
    (non-collapse at detail 80/100, camera invariance, draft/full parity, scene-content invariance,
    solid fullContour) fail on 70becd3, pass after; count now flat ~1 ring/plane across detail;
    detail-100 convert ~2.6s; visual 67/67 byte-identical. **Capped/deferred:** on pathological
    (detail > 100) density only occlusion fidelity degrades (overflow rings raw), never the count.
  - **Scene-tree object-manipulation regression fixes (751c159, v1.3.77).** Three live bugs Jay
    hit after the scene-tree migration, one root cause: object-manipulation code saw only the
    legacy inline `params.objects` (empty on a tree; objects live on child object3d layers at
    `child.params.*`). Fixes: (1) drag-nest — `sceneNestContainerFor` (layers-panel.js ~:2231)
    + `_lvlDoMove` redirect (~:176) so an object3d dropped resolving to a scene container nests
    (parentId=container), preserving booleanGroup3d→role:'solid' revert; reorder-within-scene
    still falls through. (2) primitive swap — `setSceneObjectPrimitive` (renderer.js:12147) maps
    ids via child-aware `_sceneObjectById` and writes `child.params.primitive` + resets
    `child.params.params`; ctxbar reads current primitive via `getSceneObjectRecord`. (3) rotation
    gizmo — `_sceneRotationOwner` resolves any scene descendant → scene3d group; get/hit/draw
    3DRotation accept the group; `bounds.corners` guard relaxed when a `_sceneGizmoAnchor` exists.
    Deliberately kept `_sceneObjects` inline-only (array-identity writers would corrupt a tree);
    reads/writes route through `_sceneObjectById` (returns `child.params` view). 12 RGR tests.
    Adversarial-reviewed: SAFE, byte-identical for monoliths. **Follow-up (task #93, NOT fixed):**
    other ctxbar bridges still inline-only on trees — x-ray toggle, delete, duplicate,
    drop-to-ground, ground-drag, style-flyout writer, name readout.
  - **Scene-tree bridge cluster fix (0aad1b3 + d03f1d0, v1.3.78).** The follow-up from the row
    above: made the remaining scene-object bridges child-aware via `_sceneObjectById` /
    `_allSceneObjectRecords` (kept `_sceneObjects` inline-only by design). Fixed on a tree:
    x-ray/visibility toggle (writes `child.params.visibility`), delete (child layer via
    `engine.removeLayer` — boolean groups cascade their operands), duplicate (child layer via
    `engine.duplicateLayer`; **boolean-group clone offsets its OPERAND transforms +10 x/z** since
    the group itself carries no transform — a bug caught by adversarial review, was stacking the
    clone on the original), drop-to-ground, ground-drag (all 3 sites), Style/Shadow/Highlight/
    X-ray flyout writer `setSceneObjectField`, object-name readout. `_allSceneObjectRecords`
    enumerates only DIRECT top-level object3d children (not boolean operand grandchildren —
    fixes ground-drag snap asymmetry). 15 RGR tests incl. boolean-group dup/delete + monolith
    parity. Adversarial-reviewed (1 confirmed bug found+fixed, monolith byte-identical). Full
    gate green. Closes task #93.
  - **Phase 5 #3 — Quantitative X-ray, interpretation A (ad4f0bf, v1.3.79).** Depth-cued
    see-through back-fill: new opt-in `xrayDepthCue` param (off|density|weight|both, default off
    → byte-identical). When on + object is x-ray + `!draft`, the back-face fill is modulated by
    depth-behind-front-surface: `norm=clamp((frontDepth−backSampleDepth)/objDepthExtent,0,1)`
    (front ref = frontmost `HLR.fitSupportPlane` covering the back-line midpoint, faceted;
    near-z bound for curved). `density` = full hatch then deterministic golden-ratio dither keyed
    to norm (floor XRAY_CUE_MIN_KEEP=0.25, bypasses backDensity, no double-thin); `weight` =
    `meta.weightScale` ramp 0.5→2.2 (geometry unchanged, honored by renderer+SVG export). No RNG.
    Rides existing depth data + per-stroke hooks — no renderer/export change. Faceted + curved
    both done (curved uses near-bound front ref; per-point is a future fidelity upgrade). 8 RGR
    tests (deep>shallow, monotonic weight, off golden byte-identical, solid unaffected,
    determinism). Adversarial-reviewed SAFE. Was Jay's Phase-5 #3 (first in his order #3/#1/#4/#2);
    interpretations B (thickness readout) + C (iso-depth contours) noted NOT built. Design:
    scratchpad/design-quantitative-xray.md.
  - **Deferred:** Phase 5 backlog (OBJ import, Manifold WASM booleans, curved−curved CSG,
    turntable export, v2 modifiers, etc. — needs prioritization). Known
    flaky test: `divisions-editor-section` weighted-pen-spread (probabilistic; passes isolated,
    intermittently fails under parallel load) — de-flake candidate.
- **Unreleased — 3D Scene Studio → layers-panel scene tree (v1.3.56–1.3.61, `3d-scene/p4`,
  commits `541231e`..`a2ff2cf`).** Decomposed the monolithic single `scene3d` layer into a
  real layer tree, in six increments: **A** new `object3d` + `booleanGroup3d` layer types
  (delegate to the scene renderer; no math fork). **B** scene-GROUP compositor —
  `_composeSceneGroup`/`collectSceneParams` mirror the morph-group pattern, collecting child
  object/boolean-group layers into the existing whole-scene HLR/lighting/shadow pass;
  `_sceneConsumed` children emit nothing; the collection UNIONs children with any inline
  `params.objects/groups`, so a scene layer with no child layers renders byte-identically
  (permanent back-compat safety net). **C** layers-panel tree rendering + add-object (button +
  right-click) + multiselect→create-boolean-group + drag-in/out role, via the existing
  parentId/isGroup nesting. **D** `Add Layer → 3D Scene` now makes a tree; canvas click selects
  the child object layer (sceneTarget.objectId == layer id, no lookup); the Inspector/Style/Tone
  panel re-keys to the selected object / boolean group / scene; `expandMonolithToTree` promotes a
  monolith in place. **E** ground + lights as `sceneGround3d`/`sceneLight3d` child rows (sun
  gizmo arms on selecting the light child; delete-ground → ground off). **F** migration —
  `VECTURA_FORMAT_VERSION` 1→2 + `STATE_MIGRATIONS[1]` expands saved monoliths to trees on
  import (identity-preserving, idempotent, render byte-identical; presets stay monolith via the
  inline-union). Every increment: full suite green + live-verified. Deferred (plan §5): nested
  boolean-in-boolean deep migration/UI.
- **Unreleased — 3D Scene Studio live-acceptance batch (v1.3.53–1.3.55, `3d-scene/p4`).**
  CSG triangulation-fan suppression under wireframe (`0869b72`), inverse/subtractive shadow mode
  for dark paper (`9785656`), and frontmost-object click picking + per-object hover hint
  (`959619f`, with the crude whole-layer hover highlight suppressed for scene3d).
- **Unreleased — 3D Scene Studio CSG + light-model completion (v1.3.34–1.3.39, `3d-scene/p4`,
  commits `2fa2fee`..`37c5754`).** Closes the deferred artistic + geometry backlog that trailed
  the v1.3.25–1.3.33 controls batch:
  - **CSG boolean solid/hole (2fa2fee, v1.3.34).** Objects are Solid or Hole; a subtract group
    carves a real rectangular hole (correct cut walls, silhouette, shadow) through the existing
    HLR pipeline. New `Scene3D.CSG` (Evan-Wallace BSP on the repo index-mesh, volume/winding
    pinned) + `Scene3D.Boolean` (`resolveAssembly` — ungrouped objects stay byte-identical,
    a subtract group collapses to one `csg` unit; draft/failure/budget-overrun fall back to
    uncarved children).
  - **CSG curved holes, union/intersect, grouping UI (cb293a9, v1.3.35).** Booleans admit curved
    children (box−cylinder, sphere−box; detail-capped, shared triangle budget); `CSG.union` /
    `CSG.intersect` via op-aware group resolution (union = ⋃solids − ⋃holes, intersect =
    ⋂solids − ⋃holes), multi-solid seam-weld, depth-first nested groups with a cycle guard.
    New **Boolean Groups** panel (create group, op, add/remove/reorder object-or-group children,
    per-child Solid/Hole role) + scene-tree op-glyph badges. Interior fan-triangulation
    T-junctions no longer drawn (kills spurious radiating lines on carved/curved faces).
  - **Point/spot light polish (3e554ec, v1.3.36).** All four backlog items: spot shadows respect
    the cone + range, a soft range/falloff floor, per-sample light evaluation for large curved
    objects, and consolidation of the world-projection helpers onto one shared `_sceneProjectWorld`.
    Directional projection stays byte-identical.
  - **Area light (377d846, v1.3.37).** Fifth light type — gentler terminator + softer shadow by
    averaging N deterministic Fibonacci-sphere sub-samples across its Size (Size/Samples controls,
    reuses the 3-axis position gizmo). No-area-light scenes are byte-identical.
  - **Emissive objects (69b0089, v1.3.38).** Sixth and final light type — an enabled
    `object.emissive` acts as a co-located point light (range 0) shading every other object and
    self-renders its glow via the burst emitter (radial rays / concentric halo, optional
    blank/bright core).
  - **Ctxbar multi-select "Mixed" display (163db3b, v1.3.39).** When 2+ objects disagree on a
    contextual-toolbar control, the Style/Shadow/Highlight/X-ray flyouts show an explicit **Mixed**
    state (per-control agree/differ fold over the selection); editing from Mixed applies to all
    selected objects. Mirrors the MSC-1 stroke-weight pattern.
  - **Per-fragment by-face CSG styling (37c5754).** A combined boolean unit no longer flattens to
    the primary solid's style — each output fragment is attributed back to its originating
    `{objectId, faceId}` (threaded through the BSP `shared` slot, carried through weld/sliver-drop)
    so faces, edges, x-ray, and highlight resolve each fragment through the ordinary style cascade.
    Gated + deterministic: a uniform-style unit adds no override and stays byte-identical.
  - **Still deferred (tracked under Later):** exact smooth curved−curved CSG cut curves — booleans
    on curved prims ship a detail-capped tessellation approximation, not an analytic intersection.
- **Unreleased — 3D Scene Studio artistic-controls batch (v1.3.25–1.3.33, `3d-scene/p4`,
  commits `a756202`..`8920f55`).** Nine commits closing Jay's artistic-requirement asks:
  - **Positional point + spot lights (a756202, 9ccfa4f).** Engine is now position-aware —
    point = direction-to-surface Lambert with linear distance falloff over a range; spot adds
    a cone gate (half-angle + soft penumbra); both cast **perspective** ground shadows. On the
    canvas a selected light shows a **3-axis translate gizmo** (point/spot drag world XYZ,
    unclamped; the Sun re-derives azimuth/elevation; a spot draws its cone axis) with a restore
    handle + panel **Reset light**. Lights strip adds **+ Point** / **+ Spot**; the light
    Inspector is type-complete. The lighting model is now directional/ambient/point/spot.
  - **Shared stroke treatment + density fix + crosshatch families (4bef991).** Line type
    (solid/dashed/dotted/dash-dot + dash scale), deterministic hand-drawn wobble, and
    overstroke, stamped at the emit chokepoint (canvas + SVG). Density-under-tone bug fixed
    (fill density is authoritative, tone a multiplier). Independent crosshatch families
    (cross angle delta, cross density ratio, triple hatch).
  - **True Archimedean spiral fill (c4ee71a).** The spiral mapper on faceted prims draws one
    continuous Archimedean spiral clipped to each face region (was stacked concentric rings);
    curved prims keep the wrapped surface helix. New pitch/offset/center/axis-snap/mode/
    eccentricity controls.
  - **Per-mapper control inventory (41f3c30).** A `MAPPER_CONTROLS` descriptor table drives the
    panel: hatch angle-reference + boustrophedon link-fill; contour surface/region + step;
    stipple mark shape/size/angle/jitter; wireframe per-edge-class visibility + show-hidden.
    Every control is a no-op at default.
  - **Selectable highlight treatments (358c8e9).** The specular band renders as blank / keep /
    dashed / dotted / sparse / altFill / burst / stipple-out (band count, pen, density);
    default `blank` is byte-identical.
  - **X-ray back-face fills (18a1d91).** X-ray now shows the far surface through spheres and all
    primitives (dashed, reduced-density back family) plus hidden-edge dashing; solid output
    unchanged.
  - **Controllable cast shadows (8f06433).** Scene shadow bag — angle (or follow light), density,
    pen, line type, and a layered penumbra (2–4 nested inset passes) — plus a per-object
    Auto/On/Off cast toggle; defaults reproduce the old shadow exactly.
  - **Per-object context-bar flyouts + border (8920f55).** Persistent Style / Shadow / Highlight
    / X-ray dropdown pills on the contextual task bar (stay open through mapper switch + slider
    drag, one undo per gesture); the one new render feature is a per-object **Border**
    (silhouette + boundary overstroke on an optional accent pen, off by default).
  - **Deferred at the time (now shipped in v1.3.34–1.3.39 — see the CSG + light-model completion
    entry above):** area + emissive light types; CSG solid/hole + group boolean; multi-select
    mixed-value display in the ctxbar flyouts; the point/spot polish list. Only exact smooth
    curved−curved CSG cut curves remain deferred (tessellation approximation ships).
- **Unreleased — 3D Scene Studio acceptance fixes D/E/F/H/I + convex-hull shadows (v1.3.19–1.3.21).**
  On `3d-scene/p4`, from Jay's live-test batch 2: (E) the sun widget projects the toward-sun
  vector through the scene camera so elevation reads as on-screen height (was radius-encoded →
  inverted); (H) mapper None on a curved primitive shows the clean silhouette, not the whole
  tessellation mesh; (B2) cast shadows adopt the light-lab convex-hull footprint per caster
  (drops the fragile per-face boolean union); (D/I/F) new `Scene3D.SurfaceFill` wraps
  hatch/crosshatch/contour/spiral/stipple around the parametric surface with per-sample
  tone-driven density, the brightest band left blank as the highlight (retiring the solid-white
  specular disc), and hatch ≠ crosshatch. (J) a unified Cinema4D-style per-object transform
  gizmo (move arrows + rotate rings + scale boxes, all shown at once) drives
  params.objects[i].transform and supersedes the legacy corner-scale handle; the scene orbit
  gizmo still drives the camera. (G) multi-light shading FOUNDATION landed (v1.3.23): scene
  shades from every light — ambient fill + per-directional weighted Lambert
  (`Regions.combinedIntensity`, clamped), each shadow-casting directional light drops its own
  footprint, lone sun byte-identical. Still open on this branch (G, next increments): the panel
  UI to add/manage lights (per-light inspector, add ambient/directional, delete), and positional
  point/spot lights (position gizmo + per-face light direction + point-shadow projection); area
  and emissive lights are later.
- **Unreleased — 3D Scene Studio acceptance fixes A/B/C (v1.3.18).** On `3d-scene/p4`:
  (A) deleting the last object no longer resurrects a default box — `normalizeParams`
  seeds Box 1 only when the `objects` key is absent, never for an explicit empty array;
  (B) cast shadows clip casters to `y ≥ 0` before projecting (no mirrored bow-tie for a
  straddling caster) and the default box rests on the ground so its shadow pools from the
  base; (C) the orbit gizmo coalesces its regen on rAF at draft detail and shadows render
  on draft frames, so objects/shadows no longer vanish mid-orbit. RGR tests added
  (scene3d-generate: empty-scene; scene3d-shadows: single-sided footprint). Still open on
  this branch (Jay live-test batch 2): sun-elevation inversion in the widget mapping,
  the specular "white disc" on the dark side, "None = outline" on curved objects, and
  curved-surface tone/mappers that follow the form (leverage topoform/terrain/polyhedron/
  spiralizer/rasterPlane surface-wrapping code) — plus the future multi-light-type system.
- **Unreleased — 3D Scene Studio Phase 3 (Mappers, feedback #5).** Off `3d-scene/p2r` on
  branch `3d-scene/p3`: four surface-fill mappers — **crosshatch** (hatch + perpendicular pass),
  **contour** (concentric inset rings), **spiral** (rings stitched into one inward snake),
  **stipple** (deterministic jittered dot lattice, no RNG) — joining none/hatch/wireframe. New
  `Scene3D.Mappers` module (`regionFill(mapper, loops, {spacing})`, pure 2D on closed screen
  loops); reuses `GeometryUtils.insetMultiPolygon`/`stitchConcentricRings` (hole- and
  concavity-safe boolean offset) + `circlePath` + `PathBoolean.pointInPolygon`. scene3d.js
  dispatch: SURFACE_FILL (outline+crease suppression) / REGION_MAPPERS routing; flat faces fill
  IN THE FACE PLANE (uv scaffold → project back, correct mm density + foreshorten), curved fills
  the linked silhouette loops; region spacing reads the Density slider (decoupled from tone);
  draft uses the cheap screen hatch for all mappers. params.js whitelist + panel Select picker.
  Review gate (8 confirmed) all fixed: stipple blank on triangular faces (pointInPolygon needs the
  closed ring), stipple cap → uniform thinning, contour/spiral hole-carving + concave via boolean
  offset, mapper-switch preserves Density/Angle. 16 mapper tests + panel coverage; verified live
  on box/sphere/torus/icosahedron.
- **Unreleased — 3D Scene on-canvas resize (feedback #1).** Off `3d-scene/p2` on branch
  `3d-scene/p2r`: a uniform-scale gizmo (corner handles on the selected object's projected
  bbox → `transform.scale` about centre) and a box **face-pull** knob (a box face selection
  maps `face:±X/±Y/±Z` → `sx/sy/sz`; drag the face out to grow that dimension). Both reuse
  the once-per-gesture history + rAF draft-regen machinery (`_scheduleSceneDragRegen`),
  commit full-quality on release, and Escape-restore. Curved primitives resize via the corner
  handles + the inspector's per-dimension live sliders. Verified live (scale 1→1.6; face-pull
  sx 40→68) + 8 RGR tests.
- **Unreleased — 3D Scene Studio Phase 2 (Light).** Two file-disjoint streams (2A
  core: lighting/regions/shadows; 2B UI: sun widget, tone editor, paper preview) built
  in parallel against a frozen contract (L1–L5), adversarially reviewed + judged, and
  integrated on branch `3d-scene/p2`: a single directional sun drives light-made **tone**
  (intensity → band → coverage → hatch spacing, per-face for flat prims, group-mean for
  curved, darkest-band cross-pass, specular hotspot) and ground **cast shadows**
  (silhouette → y=0 projection, class-union via `FillBoolean.safeOp`, grazing clamp). An
  on-canvas **sun widget** and a draggable **cast shadow** both aim the light; the panel
  gains a Tone editor + Sun inspector; a pen-true **paper preview** toggle renders on the
  true stock colour. Also folded in from live feedback: per-face **plane-projected surface
  hatch** (a cube reads as three foreshortened 3D planes), inspector **live-preview on drag**
  (one undo/gesture) and **double-click-to-default**. Draft drags skip shadows + tone + the
  plane hatch for a responsive frame (≈60fps at 12 objects); full quality resolves on release.
  Review gate found 13 confirmed (2 must-fix: sun drawn on the shadow side; light inspector
  never opened) — all fixed and live-verified. Deferred: `PRH-025` (coarse live draft shadow),
  `PRH-026` (track double-click reset). Verified live: Golden-Hour hero (tone bands + cast
  shadows), sun-widget aim, live inspector.
- **Unreleased — 3D Scene Studio Phase 1 (core scene MVP).** Three file-disjoint streams
  (1A engine, 1B panel+cascade, 1C selection/canvas) built in parallel against a frozen
  contract, adversarially reviewed and judged, integrated on branch `3d-scene/p1`: the
  `scene3d` layer type with flat-face HLR (support-plane depth + owner-aware depth buffer),
  edge classification, x-ray mode and styleable ground; the bespoke Scene panel (shelf /
  tree / inspector) + `StyleCascade` (face>object>scene, provenance) driving per-object and
  per-face pen + none/hatch/wireframe mappers; scene selection (V objects, A faces/edges,
  Alt-cycle, marquee, ground-drag + `D` drop, snapping) with scene context-bar contexts and
  right-click verbs; asset-aware `cloneLayerParams`/`duplicateLayer`. Live drag coalesces
  regen onto rAF at draft detail (12-object ≈ 60fps). Default camera pitch corrected to +20
  so object tops are visible. Verified live: 6-box gate composition styled per object AND
  face, per-pen SVG export, full selection/menu/drag flow. Follow-ups under **Next**.
- **Unreleased — 3D Scene Studio Phase 0 (enablers).** Four file-disjoint streams built in
  parallel, adversarially reviewed and judged, integrated on branch `3d-scene/p0`:
  effective-pen SVG export (grouping/dedupe/sort by `path.meta.penId || layer.penId`),
  `Vectura.StrokeDivide` + engine division stage downstream of optimization
  (`layer.dividedPaths` served at top precedence to canvas/stats/export, persisted),
  SceneMesh extraction (`Scene3D.Charts`/`Scene3D.Mesh` consumed by
  spiralizer/topoform/polyhedron, byte-exact baselines unchanged, 136 parity tests),
  and `FillControlSurface.registerSection` (caps-gated sections, bit-identical legacy
  hosts). Three judge-confirmed defects fixed pre-commit (export sibling-fragment
  dedupe, stale `dividedPaths` on direct `optimizeLayers`, curves-on flattening in the
  divider). Follow-ups tracked under **Next**; deferrals recorded in CHANGELOG.
- **Unreleased — Live Corner styles (Round / Inverted Round / Chamfer).**
  Corner widgets on parametric shapes and freeform hard corners carry a per-corner
  style: Alt/Option+click cycles it (selected set when 2+ corners selected), ↑/↓ cycles
  it live mid-drag with a style-specific cursor glyph, double-click opens an anchored
  Corners dialog (style buttons + radius). Inverted Round = vertex-centered concave
  arc; Chamfer = straight cut; both share the round widget/drag/label/max-red plumbing.
  `shape.cornerTypes` + per-anchor `cornerType` serialize. Covered by
  `tests/integration/live-corners-styles.test.js` (12 tests) + Playwright in-app pass.
- **Unreleased — Smooth unified on industry-parity corner rounding
  (`GeometryUtils.roundCornerAnchors`).** All four Smooth surfaces (Object menu /
  context menu one-shot, ctxbar progressive slider, Post-Processing Lab Smoothing,
  shape-layer rebuild) now share one mechanism: tight faithful re-trace + fillet arcs,
  linear across the full control travel. Killed: the Laplacian one-shot (shriveled
  closed shapes), the slider's tolerance-loosening (reshaping + dead top half past 50),
  the engine's loose-fit "smoothing", and the shape-layer Catmull-Rom bulge (the
  lopsided-ring self-intersection test now asserts the fix). Shape-layer rounding is
  anchor-preserving (`filletSharpAnchors`); text's stroke-font bezierizer kept its
  Catmull pass via the extracted `catmullRomAnchors`. Post-Processing Smoothing +
  Simplify sliders regen live during drag (`regen({preview:true})`, history once per
  gesture) and full-quality on release. Note for the "fillet-vs-gate ordering" follow-up
  above: smoothing now routes through `applyCornerRounding`, NOT `toCurveAnchors`'
  `cornerRadius` — that gate ordering stays latent/uncalled. Five
  `*-curves-on-smooth` visual baselines deliberately regenerated (the old loose fit had
  visible distortion, e.g. a spurious spike on the stock lissajous).
- **Unreleased — paint bucket venn faces: overlapping closed rings expose lens/lune/union
  rungs in the fill ladder.** Root cause of "can't fill the venn overlap of two circles":
  `findFillTargetStack` only carved sub-regions against OPEN barrier paths
  (`collectBarrierPaths` skips closed rings), so two closed circles laddered
  circle → circle → doc bounds in every prior version — verified empirically at v1.3.2 and
  v1.2.73 (identical stacks; NOT a regression from AUD-05 or the curve rework, which were
  both ruled out). Fix: when the cursor ring partially overlaps sibling rings (vertex
  in/out crossing test, bbox-gated), boolean-carve the cursor face (∩ of all
  cursor-containing rings − ∪ of the overlapping rest) via `FillBoolean` and prepend it;
  append the group union before doc bounds. Ladder for a venn lens is now
  lens → circle → circle → union → canvas. Degenerate input degrades to the classic ladder
  (AUD-05 guard). Covered by `tests/unit/paint-bucket-venn-regions.test.js` (RGR-proved);
  verified in the running app (hover highlight, scroll rungs, hatch fill clipped to lens).
- **Unreleased — coverage ratchet: `vitest.config.mjs` gains `coverage.thresholds`.**
  Pinned ~1 point below measured coverage (2026-07-18: lines 84.14%, functions 78.48%,
  branches 70.68% → thresholds 83/77/69) so the CI `test:coverage` job fails on silent
  erosion instead of never failing on a drop. Mechanism red-proved (a single-file coverage
  run trips all four thresholds, exit 1); full `test:coverage` green with the ratchet in
  place. Move thresholds up as coverage rises; never down without a decision recorded here.
  (Last item graduated from the 2026-05 test-suite review's "Immediate" tier; the remaining
  review items live under Later → test-suite refinement batch.)
- **Unreleased — AUD-05: degenerate geometry can no longer crash the boolean pipeline.**
  polygon-clipping throws ("Unable to complete output ring") on degenerate input; the four
  `FillBoolean` ops now route through a `safeOp` guard that warns and returns `[]` instead of
  throwing, and records the failure (`FB.consumeLastOpError`) so `recomputeCompound` can tell
  a failure from a genuinely empty result — on failure it writes the un-combined child paths
  (user geometry stays visible) and leaves the cache unset so a repaired shape retries the
  real op. Scope note: the audit's "~25 raw sites" had consolidated — `halftone.js` and
  `ui-text-specimen.js` already guard locally and everything else routes through
  `FillBoolean`, so the four ops are the single choke point. RGR:
  `tests/unit/fill-boolean-safe-op.test.js` (red-proved the crash: the injected throw
  propagated through `refreshAllCompounds`; a real geometric repro was attempted first — the
  vendored build absorbs bowties/issue-tracker cases — so the throw is monkeypatched per
  spec). Verified in-app: healthy compounds recompute byte-identically.
- **Unreleased — AUD-02: `.vectura` files carry a schema version with a migration path.**
  `exportState()` stamps `formatVersion: 1`; `importState()` runs the new `STATE_MIGRATIONS`
  table (absent field = version 0 legacy, 0→1 no-op) so the next incompatible format change
  has exactly one place to live; opening a file saved by a NEWER build loads best-effort and
  surfaces a non-blocking warning toast; `PresetSync.buildDoc` stamps preset docs too. Format
  documented in `docs/vectura-format.md`. RGR: `tests/unit/vectura-format-version.test.js` +
  `tests/integration/vectura-format-version.test.js` (stamp + toast red-failed pre-fix; legacy
  round-trip and no-false-warning armor). Preset-bundler output verified byte-identical.
- **The three Simplifies — FIXED 2026-07-14 (`de9a9f9`).** The Lab's Simplify now re-fits the curve
  with the toolbar's fitter (`fitBezierAnchors`) instead of stripping its handles into chords;
  deviation from the true curve drops from **83.9 mm to under 2% of the path diagonal**. Also fixed:
  the quality gate's decline-to-raw-polyline (which made Simplify *invert* — a flowfield went 8,899
  points at 0.75 to 10,224 at 1.0 while ~30% of paths silently lost their curves), the readout's
  mismatched units (and its shape-layer `Points 6→6`), and a bug where re-fitting on every generate
  silently re-authored anchors the user had hand-placed. A concurrent session's stranded fix
  (delegate to `toCurveAnchors`) was checkpointed, its tests kept, and its approach discarded —
  verified in the running app, that fit DECLINES the real input and changed nothing. The remaining
  follow-ups (P2 rename; fillet-vs-gate ordering) are tracked under **Next**; the full review
  record lives under **Decisions**.
- **Unreleased — the Algorithm dropdown never loaded the factory Default.** Reported as "Default presets
  are no longer being loaded during algorithm load". They never were, on that path: `restoreLayerParams`
  rebuilt a swapped layer's params from `ALGO_DEFAULTS` alone, so the layer claimed
  `preset: '<type>-default'` while carrying none of what that preset curates, and the gallery honestly
  read "Custom". Same bug in "Reset to Defaults". Three things worth keeping:
  1. **The bug was older than the work it was blamed on.** Serving the pre-sparsification commit and
     driving the real `<select>` reproduced it exactly. This cycle's preset work did not break it — it
     made it *visible* (a sparse factory preset means the divergence is now precisely the curation, and
     the new modified-parameter dots light it up). Worth confirming *when* a regression started before
     reaching for the revert: the fix here extends this cycle's work rather than undoing it.
  2. **A "single definition" only holds if every caller uses it.** `Vectura.factoryParams()` was
     introduced as the one definition of factory state because it "was previously re-derived in three
     places that could drift apart" — and then only the first of the three was switched over. The other
     two kept their hand-rolled copy and kept drifting. Introducing the canonical helper is half the
     job; retiring the duplicates is the other half.
  3. **Shipped config handed out by reference is a time bomb.** `factoryParams` merged preset params with
     `Object.assign`, so every new Raster-Plane layer shared `rasterplane-default`'s `noises` array with
     the library itself. Deep-cloned now.
  Known, separate, still open: after a swap, terrain's gallery still shows "Custom" although its params
  are now correct. The gallery compares a live noise rack (normalized to 53 keys on first regen) against
  `ALGO_DEFAULTS`' 36-key entry, which can never match; a fresh layer only reads "Default" because its
  label is computed before the normalization lands. Adjacent to the in-flight noise legacy-key work, so
  deliberately left alone.
- **Unreleased — the same Occlusion Bias bug in Terrain, and the preset-pins-junk bug class.** Two
  follow-ups from the Raster-Plane work, each investigated in an isolated worktree. Both were
  confirmed real and fixed. Three things worth keeping:
  1. **A stochastic A/B must pin the seed.** Terrain mints a random seed per layer, so
     `render(bias 0)` vs `render(bias 0.5)` built two *different mountains* and reported the
     difference as the effect of the change. The delivered anti-stipple guard was flaky for exactly
     this reason and passed only by luck. It fooled *me* too: my first check of the vanishing-point
     change concluded it had moved terrain's render (125 vs 136 paths) — that was seed noise, and
     with the seed pinned the change is byte-identical. An A/B on a stochastic algorithm measures
     nothing until the seed is held still.
  2. **A comment is not evidence.** `terrain.js` asserted its bias "stops adjacent rows z-fighting";
     measurement showed terrain cannot occlude itself at all (a row is tested only against strictly
     nearer rows, and its own band is degenerate). The claim had been true of a different design and
     outlived it.
  3. **The preset-pins-hidden-junk signature is now guarded generically.** A full-dump preset freezes
     values for modes it is not in — invisible until the user switches mode, then they bite
     (terrain's two-point vanishing points collapsed the trapezoid to a rectangle: zero horizontal
     convergence). The guard in `factory-preset-inactive-mode-pins.test.js` names no algorithm and no
     value — no factory preset may pin a param its own `showIf` gate hides. It caught
     `spiralizer.sphereRadius` on arrival.
- **Unreleased — Raster-Plane See-Through makes the planes see-through, not absent.** With Lines
  as Planes on, See-Through routed to the plain stacked-wire branch: the slices were never built,
  so the vertical geometry vanished and only the top profiles drew. It is now a hidden-line
  *style* layered on the same builders — `buildLines`' slab path and `buildCardboardPlanes` both
  take a `dash` flag, keep the identical occluder set, and run the floating horizon in `'dash'`
  mode, so an occluded span comes back as a dashed hidden line instead of being dropped. Back-
  facing edges (culled under HLR as interior) are kept when dashing — in an x-ray view the far
  side of a slice is exactly the line you want to see. Consequences: Plane Width is live under
  See-Through (slab vs cardboard both x-ray), and Occlusion Bias — the horizon tolerance this
  path reads — is no longer hidden by the panel's `depthBiasSelf` gate. The one genuinely
  occlusion-free render, plain wires + See-Through, is untouched.
- **Unreleased — Raster-Plane Lines-as-Planes clips exactly at the curtain border.** Occlusion
  Bias defaulted to `0.5`, and in the floating-horizon pass that number *is* the slack a farther
  row gets before it is hidden — so every row poked up to half a pixel through the curtain in
  front of it (hooks/whiskers at each border, worst at thin Plane Widths). Now `0` everywhere a
  new layer can pick it up. Three architectural notes worth keeping:
  1. **A default lives in three places here, and the app reads the one the tests don't.**
     `ALGO_DEFAULTS.rasterPlane`, the algorithm's own `finite(p.depthBias, …)` fallback, and
     `user-presets/rasterPlane/default.vectura` — the preset a fresh layer actually loads, which
     *overrides* `ALGO_DEFAULTS`. Unit tests call `generate()` directly and see only the fallback,
     so they went green while the running app still shipped the bug. Any default change to a
     preset-backed algorithm has to touch the `.vectura` file and re-run `user-presets:bundle`,
     and has to be confirmed in the browser — this is precisely the case the "not done until
     observed in the running app" rule exists for.
  2. **Bias and rasterisation are two different errors, in opposite directions.** Bias lets ink
     *overshoot* into an occluder; the horizon's sample grid makes a clipped run stop *short* of
     it. Fixing one alone just trades it for the other, so both must be pinned by tests at once
     (`raster-plane-plane-overlap.test.js` does). The horizon now bisects the true crossing rather
     than cutting at the last sample.
  3. **Occluder pitch and sampling stride are separate concerns.** They were one `resolution`
     option, so buying a sharper silhouette also bought proportionally more redundant sampling
     (5× finer columns cost +75% render time). Split into `columnResolution`; the same accuracy
     now costs ~+15%. A rasterised horizon still has an irreducible sub-pitch rounding floor — the
     exactly-zero route is the analytic polygon clip already used by mesh/topography.
- **Unreleased — left/right-aligned text pins its alignment edge in ALL modes.** Fit-to-frame
  left/right-aligned text now pins the alignment cell edge to the matching frame edge
  (was: block re-centred every keystroke, pushing the left side leftwards while typing);
  `justify-all` left-anchors like `justify-left`. Centre align unchanged. RGR in
  `tests/unit/text-point-anchor.test.js` (stale fit-stays-centred assertion replaced with
  the new contract); verified in-app with Dancing Script fit-mode typing.
- **Unreleased — 3D rotation gizmo: 3 axes everywhere, no backing disc, amber/violet/cyan
  palette.** Polyhedron + Raster-Plane gained real Rotate Z (`roll` param through the shared
  Geometry3D view, View → Rotate Z slider, gizmo outer roll ring); the gizmo's circular
  underlay disc is gone (rings draw directly over the artwork); axis rings recolored off
  red/green/blue → amber X / violet Y / cyan Z across all six skins (pen-color clash +
  red-green color-blindness). RGR coverage in `tests/unit/3d-gizmo-three-axes.test.js`;
  verified in-app via Playwright (both themes, roll-ring drag drives `params.roll`).
- **Unreleased — welded-script junction fit quality (hooks/teeth/S-wiggles).** Follow-up to
  the keystroke-stability fix: forced-corner run endpoints in `GU.reduceAnchors` now take a
  windowed chord over the run (clamped to run arc length) instead of the single adjacent
  raw chord — clipper noise at junctions mis-aimed the cubic and ~1mm hooks were accepted
  between sparse error samples. Weld `cornerAngleDeg` 75→40 (junctions are forceCorner-
  handled now; 75 missed real elbows → 0.5mm S-wiggles). Regression: real Dancing Script
  ring fixture in `tests/unit/reduce-anchors-forced-corner-fit.test.js`; junction deviation
  0.648mm → 0.109mm, keystroke stability re-verified at zero drift.
- **Saved Default preset overrides hydrate fresh layers again.** The preset
  gallery now compares against the bundled Default state (not raw
  `ALGO_DEFAULTS`) before applying a local override, fixing the Pendula
  regression that failed both integration and coverage CI on 2026-07-12.
- **Unreleased — audit remediation: AUD-15.3, AUD-20, AUD-03, AUD-09, AUD-17.** Five
  independent Tier-1 fixes from the audit punchlist (`docs/audit-remediation-todo.md`),
  one commit each. Deleted the orphaned `scripts/benchmark_clone.js` (`cab94d9`).
  Untracked the 11 stale-tracked `src/inspiration/*.png` (~25 MB; already gitignored,
  images stay on disk) (`2229064`). Fixed `SeededRNG(0)` falling back to
  `Math.random()` — seed 0 is falsy, so every seed-0 construction (SVG import hard-sets
  it) reseeded randomly; switched to an explicit `seed == null` check and pinned the LCG
  constants with a constants-lock test (`6e8ac1c`). `saveVecturaFile` gained a
  catch (was try/finally with none) that toasts + logs distinctly from success;
  `openVecturaFile`'s existing catch now `console.error`s the real error instead of
  swallowing it (`dc14b1d`). Added a global `window.onerror`/`unhandledrejection`
  handler — previously zero listeners existed anywhere, so any uncaught exception left
  the UI silently dead; new handler logs + shows a rate-limited (1/10s) danger toast,
  filters ResizeObserver/cross-origin noise, installed once per window (`53e2365`).
  Full unit/integration/visual/e2e suites green throughout (one pre-existing, unrelated
  `pendula-preset-gallery.test.js` integration failure traced to a concurrent session's
  uncommitted `user-presets/pendula/default.vectura` edit, confirmed unrelated by
  reverting each fix in isolation).
  **Commit-hygiene note:** the follow-up docs commit `6efa3a3` ("Docs: add a 'pick up
  here' status section...") was intended as docs-only (`plans.md` +
  `docs/audit-remediation-todo.md`) but a shared-index race with another live session
  in this same main worktree meant the pre-commit hooks (graphify + user-presets
  bundler) staged and committed that session's in-flight files too (`renderer.js`,
  `controls-registry.js`, `info-modals.js`, six skin CSS files, `index.html`,
  regenerated `user-presets.js`). Nothing was lost or pushed — verified via
  `git reflog` — Jay reviewed and chose to leave the commit as-is rather than rewrite
  history. Flagging for future sessions: a `git commit` in a worktree another live
  session is actively `git add`-ing into can sweep in their staged files even when you
  only `git add` your own — this is a real gap in the existing concurrent-safety rules
  (which cover destructive ops and dirty-tree collisions but not this shared-index
  staging race).
- **Unreleased — connected-script keystroke stability (Dancing Script drift).** Typing in a
  connected-script web face no longer re-shapes earlier letters. Weld re-fit
  (`text.js` mergeOverlaps → `GU.reduceAnchors`) now uses absolute em-derived tolerances
  instead of cluster-bbox-relative defaults, and clipper-created intersection vertices are
  forced corners (`forceCorner` input flag on `reduceAnchors`) so each bezier fit run stays
  local to one glyph's boundary span. Absolute-size point text now pins its vertical anchor
  to the first line's metric cap box (matches the empty-box caret; Enter grows downward)
  instead of the whole-string ink midpoint. RGR: `tests/unit/text-weld-refit-stability.test.js`
  + `tests/unit/text-point-vertical-anchor.test.js`; verified in-app with real Dancing Script
  (zero drift of earlier-letter geometry across keystrokes). One-time visual consequence:
  absolute-size text layers shift vertically; `text-outline-parity` baseline regenerated.
- **Unreleased — compass-heading controls converted to the radial `UI.AngleDial`.** Fixed a
  data-corruption bug in the widget first: it had no `min`/`max` concept and always
  force-wrapped into `[0,360)`, so any non-`[0,360]` domain (e.g. `-90..90`) silently
  clamped every negative value to `max`. Added `wrapToDomain()` (full-circle domains fold
  modularly, byte-identical to old behavior; narrower domains saturate to the nearest edge
  on dead-zone input) and threaded `min`/`max` through the widget + its three panel mount
  sites. Then converted 9 `controls-registry.js` descriptors (`gridAngle`, `hatchAngle`,
  `lineAngle`, `horizontalLineAngle`, `topographyAngle`, `barRotate`, `barkWeaveAngle`,
  `penAngle`, `dotSpin`) plus two bespoke non-generic-renderer surfaces (the Petalis Shading
  stack's Hatch Angle — both `algo-config-panel.js` and the inline Petal Designer in
  `ui-petal-designer.js` — and Auto-Colorize's Angle Offset) from `type:'range'` to
  `type:'angle'`. Full test:ci gate green; new regression coverage in
  `tests/unit/components/angle-dial.test.js`,
  `tests/integration/algo-config-shared-controls.test.js`,
  `tests/integration/auto-colorize.test.js`, and
  `tests/integration/petal-designer-shared-sliders.test.js`.
- **Unreleased — UI-consistency migration: every parameter control on the shared component
  library.** Five parallel implement teams + two adversarial reviewers + two fix teams
  (branch `ui-delight`). All hand-rolled sliders/dials/toggles across algo-config-panel,
  mirror-panel (24), noise-rack, fill-control-surface, paint-bucket, multi-selection,
  export optimization, and the Petal Designer (53) migrated to `UI.Slider`/`UI.AngleDial`/
  `UI.SwToggle` — inline-editable chips, dblclick reset-to-default, dial keyboard + touch
  everywhere. New `UI.overlays.Prompt`; all `window.prompt/alert/confirm` call sites
  replaced; export/save/error toasts; seed + noise rerolls use the ⚄ dice. Foundation:
  Slider `defaultValue`/`format`/`parse`, AngleDial keyboard/`defaultValue`. Fixed en route:
  shortcuts leaking through open modals (new `Modal.anyOpen()` guard), invisible
  Distribute Spacing slider, clipped dial chips, `'error'`→`'danger'` toast variants.
  Known exclusions (deliberate): hand-rolled dual-range (shared dual mode lacks skin CSS),
  harmonograph plotter reveal ranges, ✦ params-randomize glyph kept distinct from ⚄ seed
  dice. Follow-up candidates: per-mirror-type slider tinting CSS hook, dual-mode skin CSS
  + chip editing, migrating the legacy `openModal` content modals onto the focus-trapping
  `UI.overlays.Modal`, `UI.Section` adoption for the four divergent collapse systems.
- **Unreleased — Raster-Plane solid Lines-as-Planes + Plane Width slider.** Lines as Planes
  (See-Through OFF) now renders as a true solid: back-facing side risers culled (no floating
  corner ticks), inter-row slab strips + side quads occlude the material between slices
  (band-inset against self-z-fighting), side silhouettes drawn as edge-profile bridges, and
  front-facing side faces bypass HLR (orthographic side faces are never occluded). New
  `planeWidth` param + **Plane Width** slider (1–100%, planes mode only): 100% = solid slab,
  lower = free-standing "cardboard" slices with real gaps (per-slab edge culling; flat
  single-curtain collapse below ~0.6 px projected thickness). Floating-horizon output now
  drops exactly-collinear resampled points (~3× fewer points, geometry-identical).
  (`src/core/algorithms/raster-plane.js` `buildLines`/`buildCardboardPlanes`,
  `src/core/algorithms/geometry3d.js` `occludeRowsFloatingHorizon`,
  `tests/unit/raster-plane-plane-width.test.js`.)
- **Unreleased — measurement readouts, center points, and multi-corner rounding.**
  Smart-guide chip redesigned to a compact gray two-line box (dark text) rounded to 0.1 mm: `dX/dY`
  delta while dragging, `X/Y` on hover/select with a pink feature label (`anchor`) pinned at the
  point (`src/render/renderer.js` `_formatChipText`/`updateDirectDrag`/`showAnchorLabel`,
  `src/ui/skin/components.css` `.drag-value-tooltip`/`.drag-anchor-label`). New center helper point
  (blue diamond + `center` label + `X/Y`) on hovering any object's center (`_hitObjectCenter`,
  `drawCenterMarker`). New Settings ▸ Guides & Display toggles **Coordinate readout**
  (`showCoordinateReadout`) and **Center point** (`showCenterPoint`), persisted via the App
  preference snapshot. Direct-select multi-corner rounding rounds all selected corners to the
  cursor radius (`beginShapeCornerDrag` scope `'selected'` + `_selectedCornerIndices`/
  `_reselectCornerAnchors`). Config: `src/config/smart-guides.js`. Tests:
  `direct-drag-coordinate-readout.test.js`, `direct-select-multi-corner-round.test.js`.
- **Unreleased — radial fill gets a draggable Centerpoint pad.** The Type panel Fill tab
  (`src/ui/ui-text-panel.js`) mounts a second XY pad — identical to the Fill Offset pad but
  wired to `fillShiftX`/`fillShiftY` — shown only when `fillType === 'radial'`
  (`syncCenterVisibility()` toggles it from the shared fill grid's `onChange`). The engine path
  was already there: `PaintBucketOps.buildFillRecord` maps `fillShiftX/Y → shiftX/Y`, and
  `pattern.js` `radialFill`/`radialFillComposite` add them to the bounds centre. New text defaults
  `fillShiftX`/`fillShiftY`/`fillShiftMax` in `src/config/defaults.js`. Verified in-app (Playwright:
  centre `50,50 → 70,60` for shift `+20,+10`) and covered by three `tests/integration/text-panel.test.js`
  cases (hidden for non-radial, shown for radial, drag writes the shift + dbl-click recenters).
- **Unreleased — task-bar Simplify is an anchor-reduction ladder with bounded travel.** The
  slider runs complex → simple (L → R) with the thumb starting at the untouched original.
  `PathEditOps.simplifyBegin` (`src/core/path-edit-ops.js`) precomputes a per-path reduction
  ladder: rung 0 = original, higher rungs = strictly-fewer-anchor `GeometryUtils.fitBezierAnchors`
  fits (corners preserved via `cornerRadiusFrac 0`). `simplifyPreview(index)` applies a rung;
  `simplifyBegin`/`getSimplifyState` return `maxSteps` (deepest rung across the selection).
  The `context-bar-modes.js` simplify sub-mode scales the slider's `max` to `maxSteps`, disables
  it when nothing is reducible (triangle/rectangle → 0), swaps the wave icons to complex-left /
  simple-right, and shows a "{pts} pts" badge. `autoSmooth` now returns a suggested rung index.
  Covered by `tests/unit/path-edit-ops-simplify.test.js` (ladder/maxSteps/clamp/triangle/quad)
  and `tests/integration/{path-edit-ops,context-bar-modes}.test.js`.
- **Unreleased — task-bar "Show Properties panel" is now a restore action.** The ⋯-menu item only
  renders while the context's docked panel (right pane; left pane for single-text) is collapsed or
  narrower than its skin-default width; clicking it un-collapses / re-widens the panel (a
  user-widened pane keeps its custom width) and fires the existing blue attention pulse. Gating +
  restore live in `src/ui/shell/context-bar.js` (`showPanelNeedsRestore`/`restorePane`); covered by
  the TB-2b describe in `tests/integration/context-bar.test.js`.
- **v1.2.40 — Type tool web font + kerning, pen-picker loupe, minimal-anchor re-trace, scissors fix.**
  Type layers default to a vendored Inter web font parsed at boot (editable with real letterforms
  immediately); new per-pair `kernPairs` map alongside uniform tracking; context-bar Outline Text
  action. Pen picker + color picker eyedropper gain a magnified sampling loupe
  (`LOUPE_SIZE_PX`/`LOUPE_ZOOM`/`LOUPE_OFFSET_PX`). New `GeometryUtils.reduceAnchors` re-traces a
  bezier contour to its minimal editable anchor set (merge coincident seams, tangent-based corner
  detection, Schneider-fit each run), anchors carry a `corner` flag through the renderer's node overlay
  and engine anchor cloning. Fixed: renderer now treats an explicit `meta.closed === false` as
  authoritative, so a scissors-cut ring no longer gets silently re-closed on the next selection
  refresh. Full `test:ci`; version bumped + `version:sync`.
- **v1.2.39 — Tools Parity feedback pass (15 fixes).** Selection: Shift/Cmd-click + Shift-marquee
  multi-select (discrete toggle, no accidental move); isolate-group hit-test scoping (outside clicks
  swallowed, foreground layers don't shadow members). Task bar: drag-handle live preview; text Font/Style
  dropdown carets + chip-anchored pickers; Point/Area toggle; "Show Properties panel" focuses the Text
  panel + hides ABOUT; edit-path anchor verbs enable by selection (new `PathEditOps.deleteAnchors`);
  progressive **Smooth** slider (`smoothBegin/Preview/Commit/Cancel`); removed the standalone stroke-weight
  entry; re-render on primary-layer change. Menu: new **Object** menu + Duplicate/Delete reuse the
  context-menu verbs (`CanvasContextMenu.runCommand`/`getCommandStates`); Contextual Task Bar toggle added
  to View. Pens: per-pen weight textbox. Rendering: HiDPI smart-guide label fix. Flip H/V routes through
  `renderer.flipSelection`. Full `test:ci`; version bumped + `version:sync`.
- **v1.2.38 — Tools Parity, Phase 3 (FINAL): transform numerics / text pickers / All Tools
  drawer / right-click menu (Lanes J, K, L, M merged + reconciled). This completes the whole
  Tools-Parity effort across all 13 lanes (A–M).** Merge order K→J→L→M onto v1.2.37; full `test:ci`;
  version bumped + `version:sync`. Delivered:
  - **Lane K (SEL-5/6, SG-6)** — Transform section true **X / Y / W / H** for manual shape/text selections
    (single + combined multi bounds) with **link W/H** proportional toggle (setting W resizes to the exact
    width about the bbox top-left, one undo); **Flip H / V** icon buttons via the shared
    `PathEditOps.flipLayers` (one undo, flip-twice restores); Direct-Selection single-anchor mode repurposes
    X/Y to the anchor's world position. Renderer gains `getTransformPanelModel` / `getSelectedAnchorState` /
    `applySelectionBox` / `applySelectedAnchorPosition` (single additive hunk, 4 methods); the panel
    self-mounts `#transform-bbox-controls`. New `src/config/transform-panel.js`.
  - **Lane J (TXT-3/4/5)** — Text font picker **hover live-preview** (≥150 ms dwell, no history push,
    dismiss/teardown revert, click commits with clean single-step undo, web faces fetched only on settled
    hover, zero eager fetches on open), filter **clear (×)**, and a real **size-preset dropdown** (6–72 mm).
    New `src/config/text-ui-config.js`; exposes `Vectura.UI.TextPanel.openFontPicker()` / `openSizePresets()`.
  - **Lane L (TLD-1/2)** — rail **"…" All Tools drawer**: registry-derived list of every tool grouped
    Select/Draw/Shapes/Type/Modify/Navigate, **grid/list** toggle (persisted `SETTINGS.toolDrawerView`),
    click-activates + rail-slot cross-highlight on hover. New `src/config/tool-drawer.js`,
    `src/ui/shell/tool-drawer.js` (attached via one optional-chained line in `toolbar.js`).
  - **Lane M (CTX-1, MSC-1/2)** — canvas **right-click context menu** of existing verbs (self-mounts to
    `#main-canvas`, no renderer edit); **mixed-value** stroke-weight indicator on multi-selections; compound
    **`alignCenterBoth`** align op (concentric in one undo). New `src/config/context-menu.js`,
    `src/config/mixed-values.js`, `src/ui/shell/canvas-context-menu.js`.
  - **Integration reconciliations / integrator wiring:**
    - **Six new module tags** wired into `index.html` (config: transform-panel, text-ui-config, tool-drawer,
      context-menu, mixed-values; shell: tool-drawer, canvas-context-menu) at `?v=1.2.38`; all `?v=` bumped.
    - **MSC-2 surfaced** (SPEC MSC-2 "align surfaces SHALL include it"): align-panel button (`index.html` +
      `multi-selection-panel.js` `ALIGN_OPS` + `icons.js` icon) and Task Bar align-flyout action
      (`src/config/context-bar.js`). New test `msc2-align-button-wiring.test.js` (button → concentric, one undo).
    - **Task Bar Smooth no-op fixed** (pre-existing Phase-2 bug found by Lane M): `context-bar.js` `doSmooth`
      called `smoothSelection(ids)` with no strength → clamped to 0 → early return. Now passes the config
      default `Vectura.CONTEXT_MENU.smoothStrength` (0.5) and lets the op own its single history push (dropped
      the bar's duplicate `pushHistory`). New test `context-bar-smooth-strength.test.js`.
    - **Task Bar text pickers wired** (closes the Lane G deferral): the bar's family/style chips call
      `TextPanel.openFontPicker()` and the size caret calls `openSizePresets()`, feature-detected on top of
      the existing wayfinding pulse. New test `context-bar-text-pickers.test.js`.
    - **`toolDrawerView`** (grid|list) folded into `App.getPreferenceSnapshot`/`applyPreferenceSnapshot`
      (both snapshot pairs) mirroring `contextBar`/`contextualHints`.
    - **Playwright** `tests/e2e/tool-drawer.spec.js` registered in the desktop-chromium testMatch + `test:e2e`.
    - **PRH renumber** (three-way 020 collision): PRH-020 = K (rotated-W/H object frame), PRH-021 = M
      (clipboard subsystem), PRH-022 = J (Text-specimen kick-loop bound). Log verified PRH-001…022 each once.
  - **In-lane decisions:** manual layer = shape|text leaves (algorithm/group keep native Pos/Scale, gain
    Flip); resize reference = bbox top-left (X/Y fixed on W/H); link toggle default off, not persisted; panel
    self-mounts via rAF (no index.html/ui.js edit); size presets = **mm** (matches the Size scrub unit),
    6–72; zero eager webfont fetches on picker open; font/size preview reverts on dismiss and restores the
    committed value *before* `pushHistory` so undo targets the original; drawer grid default + persisted,
    shortcut source = rail labels (no separate map), scissors/fill/light-source under Modify, Escape also
    closes; context menu = EXISTING verbs only (`alignCenterBoth` kept OUT of the menu per CTX-1 "no new
    behavior", surfaced via the align panel instead); Smooth default strength 0.5; contextmenu bound to
    `#main-canvas` specifically.
  - **Deferred:** rotated-layer object-frame W/H (`PRH-020`); real clipboard subsystem for the context menu
    Cut/Copy/Paste (`PRH-021`); Text-specimen kick-loop bounding (`PRH-022`); Simplify advanced gear
    (`PRH-019`, from Phase 2).
- **v1.2.37 — Tools Parity, Phase 2: Contextual Task Bar (Lanes G, H, I merged + reconciled).**
  Merge order G→H→I onto v1.2.36; full `test:ci` run; version bumped + `version:sync`. Delivered:
  - **Lane G (TB-1…8)** — the floating `.ctxbar` framework: anchor-below-selection with viewport-flip +
    tool-rail yielding, hide-on-drag/draw/caret, per-kind state renderers (idle / single-path /
    single-shape / single-text / multi / group / direct), a 5-item overflow menu (Show panel / Hide bar /
    Reset / Pin / Quick help), drag-to-pin handle, `role="toolbar"` roving tabindex (no focus steal),
    Document Setup toggle. New `src/config/context-bar.js`, `src/ui/shell/context-bar.js`. Exposes
    `Vectura.UI.ContextBar` (getContentHost / restoreState / getContext / anchorRectForBar / setBusy).
  - **Lane H (TB-9…11, SHP-1…3)** — `context-bar-modes.js` sub-mode framework + Stroke-weight and Simplify
    inline modes, and a standalone shape-properties popover (corner radius / side count) with minimal,
    additive renderer plumbing (`getShapePropsState`/`beginShapePropsEdit`/`setShapeUniformCornerRadius`/
    `setShapeSides`/`endShapePropsEdit`) and a `vectura:isolation-changed` document event. New
    `src/config/shape-props.js`.
  - **Lane I (ISO-1…2)** — self-mounting `breadcrumb-bar.js`: `.iso-breadcrumb` ancestry strip + fixed-blue
    `.iso-edge-indicator`, driven immediately by Lane H's isolation event (rAF poll retained only as a
    harmless auto-mount fallback). New `src/config/breadcrumb.js`.
  - **Integration reconciliations:** `contextBarEnabled` + `contextBar` bag folded into
    `App.getPreferenceSnapshot`/`applyPreferenceSnapshot` + undo capture/apply + `defaults.js` (mirrors
    Lane F `contextualHints`); z-index audit (tool-bar 5 < bar 35 < breadcrumb 41 < edge 42 < modals);
    all 6 Phase-2 script tags wired in `index.html` (config → shell → main) at `?v=1.2.37`; in-app help
    gains a "Contextual Task Bar" section; new Playwright smoke for bar-appears + breadcrumb-visible.
  - **In-lane decisions:** idle bar adds Document Setup as a 2nd item (real `#btn-settings` trigger); group
    semantics = "one group + only its descendants"; add-anchor eligibility ≈ "an anchor selected"; Align
    flyout reuses docked panel buttons via click-dispatch (byte-identical geometry); shape-props popover is
    standalone (works without the bar) in uniform-corner mode; `SIDES_MAX` raised to 32 to avoid clamp data
    loss; breadcrumb root crumb labelled "Document", back-arrow steps one isolation level.
  - **Deferred to Phase 3 (Lane J, TXT-3…5):** full inline text family/style pickers in the bar's Text
    state — the bar currently opens/focuses the Text panel for wayfinding and edits size live. Simplify
    advanced-options gear tracked as `PRH-019`.
- **v1.2.36 — Tools Parity, Phase 1 (all six lanes merged + reconciled).** Merge order
  A→C→E→B→D→F onto v1.2.34; full `test:ci` green; version bumped + `version:sync`. Delivered:
  - **Lane A (SEL-1…4, SG-1…5)** — 8-handle selection (edge-midpoint resize), multi-select Alt-drag
    duplicate, Flip H/V wrapper, live `X/Y` + `dX/dY` chips, and object-to-object smart guides that
    **extend** `computeGuides`/`computeSnap` (labels, anchor/endpoint snap, equal-spacing chips, hover
    highlight). New `src/config/smart-guides.js`; renderer also applies Lane B's stroke ctx on-canvas.
  - **Lane B (STR-1…6)** — per-layer stroke model (`lineJoin`/`miterLimit`/`dash`/`strokeAlign` + full
    `lineCap`), reusable Stroke Options panel, dash render-side, Align Stroke via closed-band offset,
    `StrokeModel.setStrokeWeight` (no pen mutation). Arrowheads + width Profile deferred (PRH-016/017).
  - **Lane C (PTH-1…5 + flipLayers)** — `window.Vectura.PathEditOps`: lossless Simplify preview/commit,
    Auto-Smooth, Smooth, anchor verbs + eligibility, live-shape auto-expand (`vectura:shape-expanded`),
    world-exact self-inverse `flipLayers`.
  - **Lane D (COL-1…4)** — anchored Pen Picker popover (Pens + New Pen), shared
    `PensPanel.assignPenToLayers` triple-write, mixed-pen `?` chip, eyedropper. MRU ordering deferred
    (PRH-018).
  - **Lane E (TXT-1…2)** — `TextOutlineOps.outlineText` → per-glyph path-layer group, one undo step;
    isolation drills into glyphs. Welded-kern gap deferred (PRH-014).
  - **Lane F (HUD-1…4)** — bottom hint-bar strip (config-driven per-tool hints, tool/zoom/rotation
    readouts, `Vectura.UI.toast()` canvas pill on `vectura:shape-expanded`, Contextual-hints toggle).
    rAF idle bail-out deferred (PRH-015).
  - **Integration reconciliations:** (1) **Flip seam (FLIP-1/2)** — the renderer flip wrapper no longer
    double-pushes history; `flipLayers` is the sole checkpoint owner (wrapper threads `app`, reads
    `res.changed`); a new composed regression `tests/integration/flip-one-undo-step.test.js` asserts a
    selection flip is exactly one undo step. (2) **contextualHints** folded into the App preference
    snapshot (`getPreferenceSnapshot`/`applyPreferenceSnapshot` + `captureState`/`applyState`); hint-bar
    localStorage fallback retired. (3) All new-module `<script>` tags added to `index.html` in load
    order. (4) PRH renumbered 014–018 (collisions resolved). (5) Dropped dead `alignClosedOnlyHint`
    string; wired `stroke-options.spec.js` into the e2e run.
  - **Deferred to Phase 2:** docked mount of the Stroke Options panel + Pen Picker chip (land in the
    Task Bar, TB-10 / TB-4/5/7); Pen-Picker popover e2e (until mounted). Both components reachable +
    tested now.
  - **Visual baselines:** re-ran `test:visual` post-merge — the v1.2.34 banded-bold change did **not**
    shift any Lane E/B baseline (all 34 pass); no re-baselining was required.
- **v1.2.35 — Band notches → adaptive join-disk sampling.** The silhouette nicks were 8-gon chord sagitta
  (0.076·R) in `strokeRingsToBand` join disks at every convex skeleton vertex; the band build now picks the
  side count so sagitta ≤ SIMP_TOL. Cleaner boundary → polygon-clipping retries vanish → ~6× faster cold Bold
  render and crumb-free output.
- **v1.2.34 — Banded bold residuals → noise floor.** Disk-sweep insight (Jay): a union of R-disks is fully
  pen-coverable — no "unreachable corner" physics for the built-in face. Shape-aware sliver filter (roundness
  4πA/P² ≥ 0.3 keeps compact pocket rings to minArea/16), 16-side join disks on erosion cuts. a–z coverage:
  22/26 at 0.00%, rest ≤0.09 mm whiskers. Coverage test extended to the 'u' spur.
- **v1.2.33 — Banded bold in-app fixes.** Post-review hardening of the v1.2.30 banded bold: erosion pass loss
  on dense curvy boundaries (simplified-boundary retries + single-shot-from-base fallback), silhouette bumps
  (sweep quads extended over skipped join-disk wedges), bare bowl spines (uniform-reliable coverage bookkeeping
  + exact closing contour at (bandW−penW)/2; skeleton demoted to last resort), and real pen width plumbed into
  engine bounds (pens panel regenerates text on committed width change). Gapless verified by true pen-coverage
  sampling a–z and in-browser; scanline test blind spot replaced with coverage sampling.
- **v1.2.32 — Type fills share the Paint Bucket control surface.** Extracted the paint bucket panel's variant
  grid + per-variant control rendering into a single shared module, `Vectura.UI.FillControlSurface`
  (`src/ui/fill-control-surface.js`), and mounted it in both the paint bucket panel and the Text panel's Fill
  tab. Type fills now expose the exact same twelve fill types and their full parameter sets as the bucket, driven
  by the same code (the engine path — `text.js → PaintBucketOps.buildFillRecord → _generatePatternFillPaths` —
  was already shared). Text keeps its bespoke main Angle dial (0°-up / −90° convention), Fill Offset pad, and
  Inset (excluded from the shared surface). RGR: new `tests/unit/fill-control-surface.test.js` +
  updated `tests/integration/text-panel.test.js`.
- **v1.2.30 — Built-in bold → banded concentric snake fill.** Replaced the built-in face's parallel-pass heavy
  weights (crossing lattices at junctions, splayed terminals) with a region-first model: per-glyph
  `strokeRingsToBand(thickness·penW)` → incremental morphological erosion (`GeometryUtils.insetMultiPolygon`,
  boundary-Minkowski subtraction — inward miter offsets self-cross near collapse and were rejected) at spacing
  `penW·(1 − inkOverlap)` (new `inkOverlap` param, default 15 %) → rings stitched into continuous snakes
  (`stitchConcentricRings`, segment-projection grafts) → skeleton medial pass when the deepest *reliable* ring
  leaves the spine bare (the deepest ring near bandW/2 pinches off locally and cannot be trusted for coverage).
  Per-glyph translation-normalized memo cache makes typing re-renders ~free. polygon-clipping hardening:
  `diskPhase`, `joinSkipAngle`, 1 µm coordinate snap + inset nudge-retry (fixed crashes and a 3 s sweep-line
  pathology). Legacy engine kept for sinusoidal/snake styles and headless. Covered by
  `tests/unit/geometry-band-fill.test.js` + `tests/integration/text-weight-band.test.js`. Merge note: the band
  is swept along the same bezierized contour v1.2.28 renders (curve strokes flattened via
  `rebuildShapeAnchors` + `buildPolylineFromAnchors`), so Bold reads as smooth as Regular.
- **v1.2.29 — Text specimen keeps real glyphs while editing** (no font swap on click; live trace from the
  contenteditable text).
- **v1.2.28 — Built-in stroke-font curves as native béziers.** Curve-built strokes tagged `meta.curve` in
  `stroke-font.js`; `text.js` bezierizes them at Catmull-Rom tension 1 (facets killed, corners preserved).
- **v1.2.27 — Web-font on-canvas editing** (point + area, exact `sourceIndex`).
- **v1.2.26 — Built-in text weight optics + fill-angle fix.** Built-in Vectura weights (extra parallel pen
  passes) are now metered by one pure source, `StrokeFont.weightMetrics(passes, capMM, penW)`:
  **F-03** widens the per-glyph advance (`extraTrackingMM = passes·penW·0.6`) so heavier stems don't merge, and
  **F-04** clamps the pen-pass thickness by optical cap size (`min(1+passes, ⌊cap·xHeightFrac/(2·penW)⌋)`) so
  small text keeps open counters. `text.js` applies both; web faces (real weighted outlines) keep plain
  tracking. Also fixed the text **Fill Angle** dial drawing perpendicular to the needle — canvas (`text.js`)
  and specimen (`ui-text-specimen.js`) now subtract 90° before the shared fill engine — and exposed
  `google-fonts.js` `flattenTol` so coarse-contour glyphs size their winding-canonicalization epsilon in
  display units. RGR: `tests/unit/stroke-font-quality.test.js` (29), `tests/integration/text-weight-optical.test.js`,
  `tests/integration/draw-order-reveal-smooth-tip.test.js`, updated `text-synthesis-features.test.js`.
- **v1.2.23–1.2.25 — Area Type on the Type tool.** Click-drag with the Type tool creates an Area Type frame
  (v1.2.23): additive `textMode`/`frameWidth`/`frameHeight` layer model, an `areaWrap()` word-wrapper keeping
  `sourceIndex` exact across wrap boundaries, fully editable wrapped text. Corner-handle **resize-reflow** re-wraps
  at constant point size (no glyph scale) with a red "+" overset out-port (v1.2.24). A **point↔area conversion
  dot** (hollow ring / filled dot) toggles the mode in one click (v1.2.25). Web-font area editing deferred
  (ligature `sourceIndex` degrades). Verified live in-browser; suites green.
- **v1.2.22 — Export plot-order fixes.** (1) The Export SVG "Line Sort Print Order" gear opened an empty
  settings pane when a Text layer was active (the bespoke Text-panel early return in `buildControls()` skipped
  the optimization-panel render, and the modal's fallback-layer recovery had nothing to promote in a Text-only
  doc). Hoisted the optimization render above the layer-type early returns and fire it on every early-return
  path while the export modal is open (`src/ui/panels/algo-config-panel.js`). (2) Changed the default Line Sort
  `method` from `nearest`+`vertical` to `asdrawn` so plots follow authored/reading order (left-to-right for
  text) instead of jumping between height bands (`src/config/defaults.js`). RGR:
  `export-text-layer-optimization.test.js` + a default-config case in `engine-workflow.test.js`.
- **v1.2.22 — Text decoration polish.** Strikethrough now rides the typeface's optical midpoint (x-height
  centre, from a new `xHeightFrac` exposed by `stroke-font.js` + `google-fonts.js`). Underline **and**
  strikethrough each gain a position offset, pen weight, a thickening mechanism (parallel / sinusoidal / snake
  offset passes + hatch / cross-hatch ribbon), and a 6-way line style (`meta.strokeDash`). Underline also has
  descender tail breaks whose padded gap is centred on each glyph's crossing-aware below-underline ink (equal
  padding both sides — fixed the off-centre `y` gap). All Caps↔Small Caps and Superscript↔Subscript are
  mutually exclusive (panel + algorithm guard), the Small Caps / Super / Subscript icons read clearly, and the
  default Text is sentence-cased (`Vectura`). Reveal panels show each decoration's controls only while it's
  selected. RGR coverage in `text-synthesis-features.test.js` + `text-panel.test.js`.
- **v1.2.21 — Bespoke Text panel (synthesis port).** Replaced the generic Text control list with a tabbed
  Type/Layout/Stroke/Fill panel + live opentype-traced specimen (the specimen is the editable text field).
  Ported from `design-explorations/text-panel-synthesis.html` via parallel implement→adversarial-review→judge
  teams. New modules `src/ui/ui-text-panel.js` + `src/ui/ui-text-specimen.js`, mounted through an early-return
  hook in `algo-config-panel.js`; CSS appended to `components.css` (`vtp-` namespace, token-driven). Added a
  large set of additive `ALGO_DEFAULTS.text` params (V/H scale, kerning, baseline shift, per-char rotation,
  caps/super/sub/underline/strike, indents, paragraph spacing, justification, font weight, fill inset/offset),
  consumed by `text.js` and the `google-fonts.js`/`stroke-font.js` layout engines (now returning glyph `meta`).
  Follow-ups: OpenType features beyond `liga` need a richer shaper than the vendored opentype build; hyphenation
  needs a wrap-width plumbed from the frame; specimen preview ignores a few typography params (cosmetic).
  **Decision:** the panel's per-layer **Plot Order** control (+ pen animation) was removed — the global
  **Line Sort** optimization (`defaults.js` linesort step, default `nearest`) governs final plot order and the
  draw-order scrub renders the optimized geometry, so a per-text plot-order hint was overridden/dead. `text.js`
  still honors the `plotOrder` param (kept for the algorithm + serialization); only the redundant UI was dropped.
- **v1.2.20 — Bezier smoothing for Contour fills.** Distance-field contour rings carried grid stairsteps.
  Added a fill **Bezier Curves** toggle + **Smoothness** slider (`fillContourBezier` / `fillContourSmoothing`):
  `_contourFieldFill` decimates each ring to ~grid scale and rebuilds it via `GeometryUtils.rebuildShapeAnchors`
  as a native cubic (short handles, so no counter bulge); `text.js` preserves the curve meta on fill paths.
  Both the fill and outline `bezierOutline` defaults flipped on. Shared with the paint-bucket contour fill
  (off by default there, no regression). RGR: contour-bezier on/off coverage through `text.generate` in
  `tests/unit/google-fonts.test.js`.
- **v1.2.19 — Prism Faces → Front gaps fixed.** The prism's hand-built side quads wound inward, so the
  `surfaceMode: 'front'` front/back test was inverted (near sides culled, far sides drawn) — visible holes.
  Routed the prism/antiprism side faces through the shared `orientFace` pass (`src/core/algorithms/polyhedron.js`),
  re-winding outward; no-op for the already-correct antiprism. RGR: a perspective front-cull regression test
  (the far side face must not survive `Faces → Front`), proven red against the inward winding. Suite green
  (unit 2126 / integration 652 / visual 24 — no baseline shift).
- **v1.2.17 — Polyhedron swept-profile family (Cone / Frustum / Cupola / Star Prism) + concave-normal fix.**
  Extended the existing `sideCount`/`depth` sweep family in `createSolidMesh` (`src/core/algorithms/polyhedron.js`)
  with four solids: `cone` (faceted pyramid), `frustum` (truncated pyramid, new `taper` param), `cupola`
  (2n-gon base → n-gon top, alternating triangle/quad band, `taper`-driven), and `starPrism` (extruded
  star profile, new `starRatio` param). New `taper`/`starRatio` controls gated by `polyhedronUsesTaper`/
  `polyhedronUsesStarRatio` in `controls-registry.js`; defaults added. Root-caused and fixed a latent
  concave-face bug found during adversarial review: `faceNormal` (`geometry3d.js`) used a first-three-points
  cross product that flips inward on concave polygons (the star caps), inverting the render-time front/back
  flag and Lambert shading — replaced with Newell's method (convex/triangular faces unchanged, all baselines
  hold). RGR: topology-scaling + winding-survival + a concave-cap regression test (proven red against the old
  normal); full suite green (unit 2125 / integration 652 / visual 24).
  still used naive polygon offsetting (`insetPolygon`), which self-intersects into chaotic tangled
  geometry on non-convex/varying-width glyph shapes at depth — reported as a scribbled-mess "VECTURA"
  contour on a script face at high density. Replaced inset contour with iso-contours of the
  distance-to-boundary field: a two-pass chamfer distance transform on a scanline-filled grid (grid
  honours the active even-odd/nonzero rule), then marching squares per ring level with edge-keyed
  segment stitching. Robust for any topology (pinch-off, varying stroke width, counters, overlaps);
  ring spacing calibrated to the thickest ink so thin strokes still get rings; path count grid-bounded
  (no high-density explosion). Outset kept on the old path. ~4–300ms/word depending on density+grid;
  acceptable for generation, a `fastPreview` downsample is a possible follow-up. +4 regression tests
  (non-convex chevron clean + bounded). Full unit/integration/visual/perf green. Verified visually on
  Oswald/Playfair/Lobster/Pacifico across densities. Reinforces [[feedback_verify_text_fills_real_path]]
  — the bug only showed at real density on a real script face.
- **v1.2.15 — Contour fills every letter + Type fills watertight on connected scripts (PRH-012).** Two
  fixes. (1) Contour's solid-shape branch sized its inset step to the whole letter (`√(area/π)/density`),
  far coarser than a glyph stroke is wide, so counter-less letters (V/E/C/T/U) collapsed after one ring
  and looked blank while R/A were dense — reported on a "VECTURA" contour fill. The solid step is now
  capped to the stroke thickness when the density step would give <2 rings; thick shapes and non-glyph
  contours are unchanged. (2) Connected-script faces (Pacifico, Dancing Script, Great Vibes) physically
  overlap adjacent glyph outers, which even-odd read as holes (counter bleed) and whose depth classifier
  left overlapped letters empty. Text now fills with the **nonzero winding** rule (gated via a
  `windingRule` flag): `compositeContainsPoint`/`scanLineClipComposite` accumulate signed winding and
  `classifyRegionTopology` classifies shells by "inner band is ink". For non-overlapping glyphs nonzero ≡
  even-odd, so non-script faces and every non-text consumer (paint bucket, pattern designer) are
  byte-identical. Verified across 11 typefaces (5 scripts) × 15 fills × 4 words × 3 densities = 1,980
  combos, 0 counter bleed; +14 regression tests; full unit/integration/visual/perf green. NOTE: real-app
  verification (via the actual `text.generate` algorithm path + visual renders) caught a contour defect
  that v1.2.14's isolated `_generatePatternFillPaths` tests missed — always verify text fills through the
  real algorithm path, not just the fill engine. Remaining: PRH-013 (halftone/maze extreme-density gaps).
- **v1.2.14 — Type fills made watertight & consistent across all fill types.** Text feeds every glyph
  contour (outer shells + counter holes) into the pattern-fill engine's composite branch; a dozen fills
  (dots/stipple/grid, contour, scribble, halftone, voronoi, truchet, maze, lsystem, spirograph, weave,
  flowfield) iterated per-loop and treated counters as solid (dots filled R/A counters; contour rendered
  only the first letter; scribble left non-convex letters empty). Introduced a shared region-topology
  layer (`classifyRegionTopology` + `interiorPointOf` + `groupCoherentClip`) and routed all composite
  fills through one even-odd ink invariant matching hatch/wave. Contour rewritten as a wall-aware annulus
  (offset outer inward + counters outward, step capped to wall thickness, thin-solid-shell fallback) so
  hairline bowls on Playfair/Lobster render; scribble/per-shell fills clip against a parity-consistent
  group-coherent set (fixing a neighbour-counter leak). Verified in-browser across 8 typefaces × 15 fills
  × 4 words × 3 densities (0 counter bleed, 0 empty shells) + a 47-case watertightness regression suite;
  full unit/integration/visual/perf suites green. Residual edge cases logged as PRH-012 (connected-script
  overlap) and PRH-013 (halftone/maze extreme-density coverage). Built via SWE+adversarial-reviewer+judge
  agent teams; the real-typeface browser pass caught two defects the synthetic tests missed.
- **v1.2.13 — Draw Order slider polish: single-row readout, full-width reveal, position-tinted halo.** The
  `Start … End` gradient labels and the `distance | lines | time` readout collapsed into a single
  `.draw-order-meta` flex row (`Start … dist | lines | time … End`) instead of stacking; labels
  dropped to 8px, and the global 2px runnable-track line is suppressed on the draw-order slider
  (`::-webkit-slider-runnable-track` / `::-moz-range-track` → transparent) so only the print-order
  gradient shows. The bar now paints the full start→end gradient across the **entire** track width
  and the fill **reveals** the left portion (an opaque track-coloured cap covers the unfilled right
  via a `calc(100% - var(--draw-order-fill))` background layer), so colours map to absolute plot
  position rather than a squeezed copy. The thumb halo (ring + glow) is tinted with the gradient
  colour sampled at the handle's current stop — `Renderer.refreshDrawOrderHalo` mixes the parsed
  start/end stops (`parseCssColor` handles hex + `rgba()`) at the fill fraction into
  `--draw-order-halo`, called from `updateDrawOrderOverlayToggle` and live on every slider `input`.
  Also documents the 1.2.11 relocation of the line-sort colour controls into this panel (on-canvas
  legend retired; colour-config window opens from the palette button, IDs preserved).
- **v1.2.10 — Raster-Plane base-noise Field Weight dials real relief + Bars default to solid.** The Image (Base) layer's *Field Weight* (the `imageSource` rack entry's `amplitude`) no longer contrast-stretches the `[0,1]` heightfield — which binary-saturated the surface once dialed past ~2 — but scales the **3D relief amplitude** directly: a new `baseReliefWeight(p)` reads the base layer's weight and `reliefAmp(p) = amplitude × baseReliefWeight` feeds both `surfaceSample` and `surfaceNormal`. The contrast-stretch and its `imageSourceCustomControls` amplitude gate were removed, so changing Field Weight keeps the faithful raw-sample base and just adds height. Range widened `-2..4` → `-10..25` in `RASTER_PLANE_NOISE_DEFS` (the deliberate exception to the shared Field-Weight cap). Switching Mode → **Bars** now cascades **See-Through OFF** (watertight solid relief; mirrors the Lines-as-Planes cascade). RGR: a neutralized-fix red proof on the new 3D dial-up unit test, a rewritten image-base preview-contract test (amplitude is a 3D scale, leaves the heightfield preview untouched), an identity test (Field Weight 1 ≡ no base layer), the bars-mode cascade integration test, and an updated control-defs contract. Full unit (2058) + integration (652) + visual (24) green.
- **v1.2.9 — Text typography overhaul (Font selection, stroke emphasis, fills, bezier outlines).** The Text algorithm's Font experience is now first-class. **Default font** is a vendored **Inter** face (`src/vendor/inter-400.ttf`, OFL-1.1) registered at boot via a new browser-only, silent-fail `GoogleFonts.registerVendored` (node/offline falls back to `sans` so baselines stay byte-identical). **Picker** renders in-font previews — Google rows in their own typeface (lazy via IntersectionObserver), built-in faces as inline `StrokeFont` SVG samples — with search on both tabs and the result cap raised to 1000. **Switching fonts no longer flashes the built-in placeholder**: `choose()` defers `app.regen()` until an unparsed web outline lands (the existing regen hook swaps it in). New `text.js` outline pipeline: **Bezier Curves** toggle converts opentype glyph commands to the engine's `meta.anchors` (via new `GoogleFonts.commandsToAnchors` + cardinal-handle cleanup `optimizeAnchorsCardinal`) so SVG export emits native cubic `C` (default off → polylines unchanged); a **Smoothness** slider drives the flatten tolerance. **Stroke emphasis** via *Outline Weight* + *Thickening Mode* (parallel/sinusoidal/snake) extracted into the shared `GeometryUtils.thickenPaths` (Harmonograph refactored onto it, output unchanged; Rainfall left on its specialised single-perp + trail-break path). **Pattern fills** on glyph interiors reuse the shared engine (`_generatePatternFillPaths` + `PaintBucketOps.buildFillRecord`, all fill types) with even-odd holes; *Stroke Outline* off → fill-only text. **Plot Order** (default Left → Right) stable-sorts paths by min-x. Covered by new unit tests (`commandsToAnchors`, `optimizeAnchorsCardinal`, smoothing→tolerance, `thickenPaths`, and the text fill/bezier/thickening/plot-order branches) and integration tests (in-font preview SVG, search, deferred-regen). Full `test:fast` green; visual baselines byte-identical.
- **v1.2.8 — Text algorithm gains the full Google Fonts catalogue.** The Font control is now a two-tab `fontPicker` (Built-in stroke faces + a searchable Google Fonts tab). A new `src/core/google-fonts.js` (`window.Vectura.GoogleFonts`) lazily fetches the CORS-friendly web-font catalogue (cached in `localStorage`), and on first use of a family lazy-loads a vendored outline parser (`src/vendor/opentype.min.js`), fetches that family's TTF, parses it, and registers a preview `FontFace`. `text.js` branches on a `google:<slug>` font key: when the family is parsed it traces glyph **outlines** into polylines via `GoogleFonts.layout` (adaptive de Casteljau flattening, cap-height mapped to the Size knob, alignment/tracking/line-height honoured); while it is still loading it renders the built-in stroke font and re-renders the layer when the outlines land (app registers a regen hook, mirroring the picture-decode pattern). Default Text layer stays on `sans` so presets/baselines are byte-identical. Covered by `tests/unit/google-fonts.test.js` (key scheme, weight/URL resolution, bezier flattening, layout positioning, the algorithm's swap/fallback branch) and `tests/integration/text-font-picker.test.js` (picker tabs render, built-in selection updates the layer, Google tab degrades gracefully offline).
- **v1.2.7 — Raster-Plane Bars gain a Corner Radius control.** `barCornerRadius` (0–100%, default 0) fillets each bar's footprint polygon via a `roundFootprint` helper (per-corner quadratic-Bézier fillet, trimmed up to half the shorter adjacent edge). Routed through the general N-gon prism builder (the legacy square fast-path stays byte-identical at radius 0); rounds in both See-Through ON wireframe and See-Through OFF solid hidden-line paths since they iterate footprint vertices generically. Covered by a new `raster-plane-bars.test.js` case (rounding multiplies top-edge count, radius-0 identity, finiteness through the solid path).
- **v1.2.7 — Lines as Planes silhouette fringe removed.** The closed top→floor→top curtain loop left a staircase of tiny detached segments down the left/right silhouette (each curtain edge pokes ~one occlusion column past the nearer row and survives as a stray tip once its middle is occluded). Curtains now draw the top ridgeline + the frontmost row's front-bottom contour; all interior floor contours are occluder-only via a new `draw:false` row flag in `geometry3d.occludeRowsFloatingHorizon` (the opaque band and back-row hiding are unchanged). Rewrote the three planes-mode occlusion tests to measure genuine top-on-top hidden-line removal at a low tilt (the old tests measured occlusion of the now-undrawn curtain bodies at a non-overlapping high tilt) and added a fringe-regression test.
- **v1.2.7 — Raster-Plane Bars gain Bar Sides + Bar Rotate, plus a bottom-contact-line fix.** Added a **Bar Sides** control (3–8, default 4) to the Bars render mode — tileable counts interlock gap-free (3 = triangles, 4 = squares, 6 = hexagons) while 5/7/8 inscribe a regular polygon per cell — and a **Bar Rotate** dial (−180…180°, default 0) that spins each footprint polygon about its center to orient the shapes and open/close the interlock. Defaults preserve the prior 4-sided square footprint. Also fixed the solid (See-Through OFF) render: bar walls that drop to the surface now draw a **bottom contact line** where the wall meets the plane, instead of vanishing into it. Regenerated the `raster-plane-bars-solid` visual baseline for the added contact edges.
- **v1.2.6 — Raster-Plane "Lines as Planes" base-height tuning.** The enable-cascade now seeds `baseHeight = 1` (was 0.33) and the Base Height slider maxes at 10 (was 1) for taller relief curtains. Updated `raster-plane-planes-cascade.test.js` to the new seed value.
- **v1.2.6 — Fill Density slider direction fixed (higher = denser, app-wide).** The shared `generatePatternFillPaths` engine consumed the slider value as raw spacing, so spacing-based fills (hatch/crosshatch/wave/dots/stipple/grid/meander/polygonal/triaxial/scribble) got *sparser* as the value rose — contradicting the label and the already-correct spiral/contour/radial. Inverted once at the dispatch chokepoint (`SPACING_LIKE_FILLS` set + `DENSITY_SPACING_REF=16`), so count-driven/own-knob fills are untouched and the default density (4) still maps to 4 mm (default fills unchanged). Added a `fill-param-effects.test.js` contract block (higher density → more geometry for spacing fills; contour/radial keep their direction) and updated the `fill.density` info text.
- **v1.2.6 — Dotscreen parametric dot shapes + directional Rotation ramp + interior Fill.** Replaced the fixed shape zoo with parametric shapes — Circle, Polygon (Sides), Star (Points), Gear (Cogs), Flower (Petals), Cross, Heart — with per-shape count knobs gated by `showIf` and area-preserving polygon circumradius. Added base Rotation + directional offset (Direction dial / Amount / easing Curve), plus Aspect and Jitter (dot size stays owned by Max/Min Dot + tone — no separate size control). Wired the universal Fill rack (`markerFill` + `fill*`) into each open-outline dot, mirroring the Spiralizer marker-fill bridge (sub-mm dots skipped; Smart-Edges unions only outlines). Legacy shape ids (square/diamond/…/burst) remap transparently; the two affected presets (Newsprint, Diamond Screen) were migrated to `polygon`+`dotSides` and re-bundled. Defaults preserve the classic circle screen bit-for-bit. Covered by rewritten `tests/unit/image-algorithms.test.js` cases (per-shape vertex counts, legacy remap, defaults-identity, rotation ramp via a uniform-tone fixture, aspect squash, jitter determinism, fill gating).
- **v1.2.5 — Raster-Plane Bars are a clean solid heightmap (See-Through OFF).** Replaced the wireframe
  bar render with analytic hidden-line removal in `raster-plane.js`: per cell, emit a top edge only
  where the neighbour is shorter (equal cells merge → no interior grid/walls) plus each camera-facing
  step's exposed riser, then clip every edge against the accumulated opaque faces of nearer bars
  (painter's nearest-first; faces carry a per-vertex depth plane). Pure plotter-ready vector segments,
  no fills. No see-through, no internal walls, no floating verticals at any angle; a smooth source
  renders as clean terraces. Verified across camera angles and a smooth-gradient control.
- **v1.2.2 — Text + picture algorithms, and an opaque-bars fix.** Three new 2D algorithms: **Text**
  (built-in single-line stroke font in `src/core/algorithms/stroke-font.js`, fit-to-frame layout with
  alignment/tracking/line-height/jitter), **Dotscreen** (halftone — picture → size-by-darkness dot
  screen), and **Weave** (image squiggle — picture → tone-modulated wavering lines). Both picture
  algorithms share a lightweight image-source helper (`image-source-util.js`) + a new `imageUpload`
  panel control, and fall back to a built-in shaded sphere. Also fixed **Raster-Plane opaque bars**:
  See-Through OFF now uses an interpolated screen-space depth buffer (per-vertex camera depth) instead
  of mean-depth painter faces, so nearer bars cleanly occlude the bars behind them with no sliver
  shatter or bleed-through. Follow-ups: per-algorithm preset files (the dirs exist but ship only the
  synthesized factory default); a richer built-in font set (weights / a true italic); optional
  smart-edge dot merging for Dotscreen (Clipper union) to reduce overlapping-dot pen passes.
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
- Masking now follows an parent-owned model: the visible parent layer is the mask, all descendants are clipped recursively, and the legacy source-layer mask workflow is retired rather than migrated.
- Mask parents can optionally hide their own artwork while still contributing silhouette clipping to descendants and export clip paths.
- `sourcePaths` are reserved for manual `expanded` geometry; generator-backed layers must always regenerate from their algorithm when the layer type changes.
- Live mask preview is editor-only: it never mutates layer geometry or export data, and it uses the active mask parent’s temporary transformed silhouette only while the drag is in progress.
- In `Rings`, `Top Down` means a universal world-space XY field beneath the artwork; `Concentric` means seam-corrected path-space sampling around each full ring loop; `Orbit Field` preserves the legacy ring-local orbital sampler.
- Live masking is non-destructive by default. Parent masks affect only descendants at display/export time; checked `Remove Hidden Geometry` trims hidden export geometry destructively while unchecked export preserves hidden source paths with SVG clip paths.
- `Remove Hidden Geometry` is export-only and defaults to on: checked exports physically trim hidden geometry to the current visible frame, unchecked exports preserve hidden source paths and recreate visibility with SVG clip paths.
- **Tools Parity — Phase 1 in-lane decisions.**
  - SEL-3 flip geometry lives entirely in Lane C's `PathEditOps.flipLayers` (renderer is a pure invoker); the op reflects in **world** space and resets the transform, making flip world-exact and self-inverse at any rotation. `flipLayers` silently flattens live parametric shapes (rect `cornerRadii` / polygon `sides`) on flip (flip is not a PTH-5 verb, so no "Shape Expanded" toast).
  - Object smart guides **extend** the existing `computeGuides`/`computeSnap` pass (never a second guide system); magenta `#e6007e` token reconciled in one `drawGuides` pass with the existing cyan-center / yellow-equal-size styling; per-session candidate cache + N-nearest cap; grid and object snap compose (nearest per axis wins). SG-3 equal-spacing shipped in Phase 1 (perf headroom).
  - STR-4 Align Stroke inside/outside applies to **closed** subpaths only via the robust closed-band offset (`miterOffsetClosedRing`, not the collapse-prone `thickenPaths`); open paths stay centered; a per-path collapse guard silently reverts to centered (no tooltip). STR-5 pushes one history step per gesture on begin.
  - PTH: anchor-set contract is `[{layerId, pathIndex, anchorIndex}]`; `t→tolerance = (t/100)^2 · diagonal · 0.25`; `cutAtAnchors` splits at the named anchor (parametric), not region-based; smooth/convert/join deliberately also auto-expand + fire `vectura:shape-expanded` (a correct superset of the spec's simplify/cut, firing exactly once).
  - COL: the document pen list **is** the recent/available-colors surface (no separate recent row); popover↔docked panel stay in sync via a `#pen-list` MutationObserver; `createHsvHexPicker` was extracted from `openColorModal` (identical DOM/behavior).
  - TXT: glyph identity via the `layer.glyphs` sidecar (nearest-ink-centroid, inside-quad wins); group named `"<TextLayerName> Outlines"`, child names the raw char; pixel-identity asserted order-canonically.
  - HUD: zoom 100% = CSS-physical baseline; 4 px drag threshold clears hints; derived hint copy for pen/scissor/fill/lasso/hand/algo-draw/light-source; rotation readout is 0° until a viewport-rotation API lands.
  - Integration: FLIP-1/2 resolved by making `flipLayers` the sole history-checkpoint owner; `SETTINGS.contextualHints` is canonical in the App preference snapshot (localStorage fallback retired).
- Raster-Plane hidden-line ordering: occlusion order between parallel slices/walls must derive from plan position only (`meanPlanDepth`); sampled height stays in `meanDepth` strictly for depth-cue stamping. Any future stacked-profile renderer must not sort occlusion by height-inclusive camera z.
- Raster-Plane parity findings deferred (documented, not implemented): whole-path minimum-visible-ratio culling after hidden-line removal; aspect-aware sample density for angled line families; skipping hidden-line removal during active slider drags as a fast preview.
- Raster-Plane mesh/topography hidden-line removal is ANALYTIC, not rastered: wire segments are split exactly where they cross a projected face boundary, and self-occlusion is settled by source-space identity (does the point lie on that patch of surface?) rather than a depth-buffer bias. A screen-space depth buffer cannot be pixel-perfect here — its bias must be loose enough not to eat wires lying on the surface, which is exactly loose enough to let wires behind it protrude past a ridge.
- An occluder must represent the SAME surface the wires draw. Mesh mode occludes against its own interpolated vertex grid (a tessellation ramps a hard edge across one cell; the raw sampler resolves it sharply — occluding wires with the raw sampler eats a wedge out of the lower plane at a step). Topography keeps the fine sampler occluder because its contours come from the continuous field, not a tessellation.
- **The three Simplifies — reviewed + judged 2026-07-13. Do NOT unify them.** Jay observed that the
  Post-Processing Lab's Simplify was much worse than the contextual toolbar's (on an expanded spiral:
  Lab Simplify 1 → an ugly 6-point polygon; toolbar → 2 anchors tracing the curve exactly). Two
  adversarial reviewers + an independent judge re-derived everything against the running code. The
  findings overturned the obvious plan, so they are recorded here before anyone "fixes" it again.
  (The P1 defects found by this review were fixed 2026-07-14, `de9a9f9` — see Done.)
  - **Root cause of Jay's case:** `GeometryUtils.rebuildShapeAnchors` — step 2 (`if (smoothing > 0)`)
    was the ONLY thing that wrote handles, so at Smoothing 0 (which Expand sets) it *stripped the
    handles the source anchors already carried* and emitted a raw decimated polyline. Measured max
    deviation from the true curve: **83.9 mm**, vs 3.46 mm for the toolbar.
  - **REJECTED — unifying `fitBezierAnchors` onto `reduceAnchors`/`toCurveAnchors`.** The claim that
    windowed corner detection is "strictly better" is **false and measurably backwards**. On the
    DENSE flattened paths the toolbar actually operates on (`flattenForEdit` output), naive detection
    returns exactly 4 anchors for a square at any sampling density, while windowed detection smears
    each real corner into a band — **4 vs 28 anchors on a dense square; 6 vs 140 on a dense hexagon.**
    Swapping the fit would not shift the toolbar's ladder, it would **delete** it (`maxSteps` → 0 on
    3 of 5 representative inputs). Conversely the naive detector is just as broken on COARSE input
    (192 of 200 Lissajous samples read as corners). **Neither detector is better — the discriminator
    is pre-conditioning, not the detector.** One Schneider core, two corner policies, two genuinely
    different regimes. That is the correct design, not tech debt.
  - **REJECTED — porting the toolbar's ladder to the whole-layer slider.** 59x the cost (587 ms vs
    10 ms over 500 paths; the stock flowfield has 1,165), and a rung *index* is incoherent for a
    scalar serialized into `.vectura` files and presets — reseed the layer and rung 7 means something
    else, or nothing.
