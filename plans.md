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
1. **AUD-05 — guard the bare polygon-clipping call sites.** ~25 raw
   `polygonClipping.union/xor/difference/intersection` sites (`fill-boolean.js`,
   `pathfinder-ops.js`, `geometry-utils.js`, `svgdistort.js`) can throw
   "Unable to complete output ring" uncaught through compound recompute — one degenerate user
   shape can kill `applyState()`. Single `safeOp` wrapper in `fill-boolean.js`, degrade to
   un-combined child paths, never crash. Full spec: `docs/audit-remediation-todo.md` § AUD-05.
   *(Scope note, verified 2026-07-18: the raw sites have since consolidated — `halftone.js`
   and `ui-text-specimen.js` already try/catch locally, and `pathfinder-ops.js`/`svgdistort.js`
   route through `Vectura.FillBoolean` — so the wrapper in `fill-boolean.js`'s four ops covers
   the compound-recompute crash path.)*
2. **Coverage thresholds in `vitest.config.mjs`.** The `coverage` block has no `thresholds`
   key, so coverage can erode silently and CI never fails on a drop. Measure current coverage
   and pin ratchet thresholds just below it. (From the 2026-05 test-suite review, verified
   still open 2026-07-18.)

## Next
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

## Later
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
Seven audit decisions (full options in `docs/audit-remediation-todo.md`) plus one design
question. Do not start these without a decision:
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
- **Unreleased — Illustrator-style measurement readouts, center points, and multi-corner rounding.**
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
- **v1.2.39 — Illustrator Parity feedback pass (15 fixes).** Selection: Shift/Cmd-click + Shift-marquee
  multi-select (discrete toggle, no accidental move); isolate-group hit-test scoping (outside clicks
  swallowed, foreground layers don't shadow members). Task bar: drag-handle live preview; text Font/Style
  dropdown carets + chip-anchored pickers; Point/Area toggle; "Show Properties panel" focuses the Text
  panel + hides ABOUT; edit-path anchor verbs enable by selection (new `PathEditOps.deleteAnchors`);
  progressive **Smooth** slider (`smoothBegin/Preview/Commit/Cancel`); removed the standalone stroke-weight
  entry; re-render on primary-layer change. Menu: new **Object** menu + Duplicate/Delete reuse the
  context-menu verbs (`CanvasContextMenu.runCommand`/`getCommandStates`); Contextual Task Bar toggle added
  to View. Pens: per-pen weight textbox. Rendering: HiDPI smart-guide label fix. Flip H/V routes through
  `renderer.flipSelection`. Full `test:ci`; version bumped + `version:sync`.
- **v1.2.38 — Illustrator Tools Parity, Phase 3 (FINAL): transform numerics / text pickers / All Tools
  drawer / right-click menu (Lanes J, K, L, M merged + reconciled). This completes the whole
  Illustrator-Parity effort across all 13 lanes (A–M).** Merge order K→J→L→M onto v1.2.37; full `test:ci`;
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
- **v1.2.37 — Illustrator Tools Parity, Phase 2: Contextual Task Bar (Lanes G, H, I merged + reconciled).**
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
- **v1.2.36 — Illustrator Tools Parity, Phase 1 (all six lanes merged + reconciled).** Merge order
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
- Masking now follows an Illustrator-style parent-owned model: the visible parent layer is the mask, all descendants are clipped recursively, and the legacy source-layer mask workflow is retired rather than migrated.
- Mask parents can optionally hide their own artwork while still contributing silhouette clipping to descendants and export clip paths.
- `sourcePaths` are reserved for manual `expanded` geometry; generator-backed layers must always regenerate from their algorithm when the layer type changes.
- Live mask preview is editor-only: it never mutates layer geometry or export data, and it uses the active mask parent’s temporary transformed silhouette only while the drag is in progress.
- In `Rings`, `Top Down` means a universal world-space XY field beneath the artwork; `Concentric` means seam-corrected path-space sampling around each full ring loop; `Orbit Field` preserves the legacy ring-local orbital sampler.
- Live masking is non-destructive by default. Parent masks affect only descendants at display/export time; checked `Remove Hidden Geometry` trims hidden export geometry destructively while unchecked export preserves hidden source paths with SVG clip paths.
- `Remove Hidden Geometry` is export-only and defaults to on: checked exports physically trim hidden geometry to the current visible frame, unchecked exports preserve hidden source paths and recreate visibility with SVG clip paths.
- **Illustrator Tools Parity — Phase 1 in-lane decisions.**
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
