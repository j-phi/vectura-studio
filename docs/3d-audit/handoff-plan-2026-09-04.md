# Handoff-B Execution Plan — stroke-fill + shadow OPEN queue

Written 2026-09-04. Source of truth for the work itself: `docs/stroke-fill-handoff.md`
(read it in full before any unit) and `~/.claude/plans/stroke-fill-plan.md` (contracts).
Every implementer gets ONLY their own brief plus that handoff path.

**Worktree.** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/handoff-b`,
branch `3d-scene/handoff-b`, currently clean at `d5af9e30` (= `main`, the merge of
`sf/preview`). **`d5af9e30` is the pre-fix baseline SHA for every unit below** — the
whole OPEN queue is unfixed at that tree.

**Dev server.** From inside the worktree: `node scripts/dev-server.js 8470`, then
`http://localhost:8470/index.html`. Never reuse another worktree's server — a stale
server on a shared port serving a different tree has already burned this repo. Every
evidence script must print `window.Vectura.APP_VERSION` and the implementer must check
it against `package.json` in the worktree before trusting a single pixel.

---

## 0. Ordering and parallelism

Two lanes. Lane 1 is serialized because A, E and F all touch `surface-fill.js`
(the handoff's own "Serialize" rule). Lane 2 is serialized because C and D are both
shadow-domain and C may need a `shadows.js` fix.

```
Lane 1 (fill):    A  ->  E  ->  F
Lane 2 (shadow):  C  ->  D
```

**Lane 1 and Lane 2 may run in parallel ONLY if Lane 2 gets its own worktree** — e.g.
`git worktree add .claude/worktrees/handoff-c -b 3d-scene/handoff-c main`. Two
implementers in `handoff-b` at once is forbidden by CLAUDE.md -> Concurrent Development
("one active workstream per worktree"; "never two implementers in one worktree").
If only `handoff-b` is available, run strictly serially: **C -> A -> D -> E -> F**.

Cross-lane file ownership (declare it, enforce it):

| File | Owner |
|---|---|
| `src/core/scene3d/surface-fill.js`, `ribbon-geometry.js`, `src/core/pen-fill.js` | Lane 1 (A, then E, then F) |
| `src/ui/panels/layers-panel.js`, `src/render/renderer.js` | Lane 1 (E) |
| `src/core/scene3d/shadows.js` | Lane 2 (C, then D) |
| `src/core/scene3d/regions.js`, `src/core/algorithms/scene3d.js` | Lane 2 (D) |
| `src/core/scene3d/hlr.js`, `scene.js` | Lane 1 (F) — D must not touch them |
| `index.html`, `src/config/defaults.js` | whoever needs it; re-read immediately before editing (highest-collision files) |

Recommended global priority if budget is finite: **C, A, D** are the three that must
land. **E** is the first cut (the handoff calls it "Lowest severity"). **F** degrades
gracefully to its measurement-only branch.

Difficulty: **C = S**, **A = L**, **D = XL**, **E = M**, **F = M**.

---

## 1. Shared rules every implementer must obey

Copy these into each brief verbatim; they are the expensively-learned traps.

- **Harness-clean is not app-clean.** No unit closes without a screenshot from the
  running app on port 8470. A law emitting only **bare centrelines**, or
  `wallRings == 0`, is a FAILURE dressed as a pass. Print
  `Vectura.Scene3D.SurfaceFill.lastRibbonStats` alongside every fill screenshot.
- **Coverage-oracle denominator.** `tests/helpers/scene3d-ring-coverage.js` builds its
  denominator from rings captured at `RibbonGeometry.clipMultiPolygonToRegion`, which
  fires BEFORE self-occlusion clips the final lines. On a torus you MUST pass
  `opts.selfOccludedSegments` from `captureSelfOcclusionFootprint(V)` or correct
  behaviour scores as a coverage failure by construction. If your change removes
  geometry, interrogate the metric BEFORE concluding the fix is wrong.
- **A stale contract may be updated; a test may not be weakened.** The bar for changing
  an assertion or a fingerprint is the one `6c17709d` met: reproduce the old numbers
  exactly with the feature disabled, name the mechanism, and show a control. Never
  update a fingerprint to get green.
- **Coincident lines.** Zone rulings are phase-anchored to an absolute origin. Two
  regions emitted independently at the same pitch draw pixel-identical ink. Density,
  never path count.
- **Vacuous passes.** A metric that improves because the feature degenerated is a
  failure. Every unit's test must carry an explicit anti-vacuity assertion (stated per
  unit below).
- **Evidence rules.** Before and after from the SAME pipeline, the SAME zoom, cropped
  to the object, app chrome hidden. A byte-identical before/after pair means the run
  did nothing. Four evidence sets were thrown away in this effort for violating one of
  these.
- **Settled, do not reopen.** Tone (39.4% vs 39.1%), the coverage contract, spiral as
  the default fill style.
- **Test every primitive** where the change can reach one. Sphere-only matrices hid two
  bugs. The torus is the only primitive that occludes itself.
- **Do not run `tests/unit/scene3d-tone-law-dispatch.test.js`** unless a brief tells you
  to: ~460 s and flaky under fork contention. It is pre-existing; it is not your
  regression.
- **Commit, do not push.** No PRs, no merges, no tags. Version bump is automatic via the
  PreToolUse hook.
- **Working-tree safety.** Never restore or discard tracked files on a dirty tree
  without first creating a recovery point and getting explicit approval (CLAUDE.md ->
  Concurrent Development). Prefer a WIP commit on your own branch over any destructive
  operation.

### RGR red-proof mechanism

Use `tests/helpers/pre-wip-surface-fill.js` ->
`makeMultiFilePreShaRuntimeOptions(sha, envVar, relPaths)`, which feeds
`scriptOverrides` to `loadVecturaRuntime`, so the SAME assertions run against the
pre-fix sources without checking anything out. Model file:
`tests/unit/scene3d-ribbon-f7-self-occlusion.test.js` (header block + baseline const +
`makeMultiFilePreShaRuntimeOptions`). For a NEW module the override cannot restore a
file that did not exist — pin only the EXISTING call sites, so the new module loads but
is never invoked, which is a genuine red.

The four existing red proofs must stay red. Before committing, re-run:

```
VECTURA_PRE_WIP=1       npx vitest run tests/unit/scene3d-ribbon-wall-coverage.test.js
VECTURA_PRE_WALLS_FIX=1 npx vitest run tests/unit/scene3d-ribbon-wall-region-clip.test.js
VECTURA_PRE_F6=1        npx vitest run tests/unit/scene3d-ribbon-f6-self-occlusion.test.js
VECTURA_PRE_F7=1        npx vitest run tests/unit/scene3d-ribbon-f7-self-occlusion.test.js
```

### Pre-commit suites (Testing Matrix, CLAUDE.md)

Core-logic change -> `npm run test:unit` + `npm run test:integration` + `npm run test:visual`.
UI/expand change -> `npm run test:integration` + `npm run test:e2e`.
Run the named per-file subsets during the loop; run the full suites once, before commit.

---

## 2. UNIT C — Shadow overlap darkening (close it)   [S]

### Goal
Close item C. The implementation, the fixture and a 22/22 test suite already exist and
are merged; `6c17709d` already justified the `denseMixed-8obj-shadows|settled`
fingerprint move (464 -> 560 paths) with a ~19x depth-1 vs depth-2/3 ink-density
argument, a `|draft` control, and an in-app two-sphere measurement (1.095 vs 2.115,
1.93x). What remains is exactly three things:

1. **Review the implementation as if written by someone else** (the handoff's own DONE
   wording — it has never been reviewed).
2. **Prove the ink-density test is not vacuous** — a coincident-line implementation must
   FAIL it.
3. **Ship the in-app two-caster screenshot** with a separated-casters control. The
   density numbers exist in a commit message; the images do not exist as artifacts.

### Files to touch
- NEW `scripts/shadow-overlap-evidence.js` (Playwright, patterned on
  `scripts/stroke-fill-integration-evidence.js`).
- NEW `docs/handoff-b-evidence/C-shadow-overlap/` (PNGs + `stats.json` + `README.md`).
- `src/core/scene3d/shadows.js` and `tests/unit/scene3d-shadow-overlap.test.js` **only
  if the review finds a real defect or the mutation check shows the test is vacuous.**

### Files NOT to touch
`src/core/scene3d/surface-fill.js`, `ribbon-geometry.js`, `src/core/pen-fill.js`,
`hlr.js`, `scene.js`, `regions.js`, `src/core/algorithms/scene3d.js`, and above all
the `EXPECTED` hash table in `tests/unit/scene3d-hlr-spatial-index-identity.test.js`
(already justified in `6c17709d` — if it is RED on this branch, STOP and report).

### Code to review (read these, in this order, in `src/core/scene3d/shadows.js`)
- `~2136-2200`: `overlapCfg` / `overlapFactor` / `overlapPitch` — the depth->pitch ladder
  and the `PLOT_FLOOR_MULT` clamp.
- `~2265-2270`: where the overlap step is applied AFTER the headroom/rung scale.
- `~2365-2385`: `shadowMeta` and the `shadowOverlap` tag (only set when `overlap > 1` —
  this is what keeps non-overlapping meta byte-identical).
- `~2588-2605`: `compose` and the `overlapFactor`-scaled `invRemoveShare`.
- `~2841-2990`: `overlapLevels` (the `atLeast[n]` multiplicity lattice, downward walk,
  `boolOk()` bail-out) and the exact-n split in the `classList.forEach` emitter.

Review questions to answer explicitly in the report: is the downward walk really free of
double-intersection? Does the `boolOk()` bail-out fall back to today's single union (not
a partial decomposition)? Are `OV.maxCasters` / `OV.maxDepth` bounded so a dense scene
cannot blow up the boolean cost? Does the collar land at depth 1 as the comment claims?
Can the "rest" region ever be double-inked with an overlap piece?

### RGR red-proof — the mutation check (this is the deliverable, not a new test)
`tests/unit/scene3d-shadow-overlap.test.js` already asserts
`byDepth[2].density / byDepth[1].density > 1.25` (density = ink length / region area,
grouped by `meta.sceneTarget.pickPolygon`). Prove it bites:

1. In the working tree, patch `overlapFactor` to `return 1` (i.e. the overlap region
   keeps the single-shadow pitch — the "emit twice / coincident lines" behaviour the
   TRAP describes).
2. Run `npx vitest run tests/unit/scene3d-shadow-overlap.test.js`.
3. The density test MUST fail and the monotonic-ladder test MUST fail. Record the exact
   failure output in the report.
4. Undo the mutation by re-editing the file back to its committed content (an ordinary
   edit — do not use a destructive VCS restore on a dirty tree; see the working-tree
   safety rule in section 1). Confirm with a diff that the file is byte-identical to
   `d5af9e30` before proceeding.
5. If the density test still PASSES under that mutation, the test is vacuous — that is a
   finding, and the fix is to strengthen the test (tighter ratio, or assert the emitted
   line SPACING inside the overlap polygon), not to move on.

Also state the second red baseline for the record: a `VECTURA_PRE_*` pin is unnecessary
here because the fixture's `single` and `apart` scenarios are already pinned to a
pre-change digest in `tests/fixtures/scene3d-shadow-overlap-baseline.json` — those are
the controls.

### Exact test commands
```
npx vitest run tests/unit/scene3d-shadow-overlap.test.js
npx vitest run tests/unit/scene3d-hlr-spatial-index-identity.test.js
npx vitest run tests/unit/scene3d-shadows.test.js tests/unit/scene3d-cast-shadow-zones.test.js \
              tests/unit/scene3d-shadow-zone-fragmentation.test.js tests/unit/scene3d-shadow-anatomy.test.js
# before commit (only if any src file changed):
npm run test:unit && npm run test:integration && npm run test:visual
```

### App verification (required)
`node scripts/dev-server.js 8470` in the worktree, then a Playwright headless script
(`scripts/shadow-overlap-evidence.js`) modelled on
`scripts/stroke-fill-integration-evidence.js`:

- Same page bootstrap: `waitForFunction(window.app && window.app.engine && window.app.renderer)`,
  print `APP_VERSION`.
- Scene: ground ON, two spheres whose footprints overlap, one directional light at
  `azimuth 90, elevation 25`, `castShadows: true`, shadow layers on.
- Shots (canvas pixels via that script's `shot` / `save` / `bbox` helpers, **not** page
  screenshots — the floating toolbar overlaps the form): `overlap-full.png`,
  `overlap-crop.png` centred on the intersection lens, at ONE zoom (`zoom(2.4)`).
- **Control**: move one sphere so the footprints separate; re-shoot at the identical
  zoom and crop -> `apart-full.png`, `apart-crop.png`. The pair must NOT be
  byte-identical, and the control must produce ZERO depth-2 regions.
- Measure in-page and write to `stats.json`: per-region ink length / `pickPolygon` area
  grouped by `meta.sceneTarget.shadowOverlap`, for both scenes. Expect the overlap scene
  to show depth-2 density >= 1.25x depth-1; the control to show no depth-2 at all.

### DONE criteria (copied from the handoff)
> The WIP commit is reviewed as if written by someone else; a test asserts overlap **ink
> density / ruling pitch**, not path count, and a coincident-line implementation FAILS
> it; measured darker in the app with two overlapping casters, screenshotted.

### Traps that apply
Coincident lines (the phase-anchored absolute origin — "emit twice" produces nothing on
screen while passing a naive path-count assertion). Vacuous pass. Do not update the
fingerprint to get green. Harness-clean is not app-clean.

### Stop and report if
- `scene3d-hlr-spatial-index-identity.test.js` is red on this branch.
- The mutation does not turn the density test red.
- In-app overlap density ratio is below 1.25x, or the overlap region reads visually
  identical to the single-shadow region.
- `overlapLevels` returns `null` in the real app scene (feature inert — that is the
  "harness-clean, app-inert" failure mode).
- The review finds a defect requiring more than a localized fix in `shadows.js`.

---

## 3. UNIT A — F1 residual streaks in the five self-crossing laws   [L]

### Goal
Thin lengthwise gaps remain inside wide bands on exactly five laws, measured as
uncovered interior area on a torus: `interlockWeave` 2.4 mm2, `onePenDown` 2.3,
`trochoidLoop` 1.6, `ampSpacing` 1.4, `weaveDepth` 1.0. Bring all five into the
<= 0.18 mm2 band the other seven laws already occupy — **without** raising the
degeneration counters (i.e. without winning by emitting centrelines).

### Files to touch
- `src/core/scene3d/surface-fill.js` — the `ribbonize` hot spot only, roughly
  `6155-6650`: `RIBBON_OVERLAP` (`:6155`), the class split `CLS_CENTRE` / `CLS_WALLS` /
  `CLS_RIBBON` (`:6381-6390`), the WALLS build + "centre companion" (`:6473-6525`),
  `buildRibbonMultiPolygon` -> `clipMultiPolygonToRegion` (`:6536-6576`), and the
  `erode(clippedMP, penWidth/2)` -> `erode(outlineMP, penWidth*(0.5-RIBBON_OVERLAP))`
  -> `PenFill.fillRegion` chain (`:6580-6632`).
- `src/core/scene3d/ribbon-geometry.js` — only if the streak is proven to originate in
  the loop-hole topology `buildRibbonMultiPolygon` returns.
- `src/core/pen-fill.js` — only if proven to originate in the fill ladder.
- NEW `tests/unit/scene3d-ribbon-f1b-streaks.test.js`.
- NEW `scripts/f1b-streak-evidence.js` + `docs/handoff-b-evidence/A-f1-streaks/`.

### Files NOT to touch
`shadows.js`, `hlr.js`, `scene.js`, `regions.js`, `src/core/algorithms/scene3d.js`,
`src/ui/panels/layers-panel.js`, `src/render/renderer.js`,
`tests/helpers/scene3d-ring-coverage.js` (see below), and any existing test's
assertions.

### Working hypothesis (a lead, not a mandate — verify before you act)
These five are exactly the self-crossing laws whose swept region carries loop HOLES
(`buildRibbonMultiPolygon`; see the comment at `surface-fill.js:6529-6541`). Where a
hole runs close to the shell, the `penWidth/2` outline erosion plus the
`penWidth*(0.5-RIBBON_OVERLAP)` fill erosion can pinch the fill region into two pieces
with a bare thread between them, while the coarse 0.995 ring-fill-rate still passes.
The "centre companion" logic at `:6510-6524` is the same class of fix one class over,
and may be the model. Confirm the streaks' location by dumping the uncovered cells'
coordinates from the measurement BEFORE changing any code (locate, then fix).

### RGR red-proof test (write it FIRST)
`tests/unit/scene3d-ribbon-f1b-streaks.test.js`, modelled closely on
`tests/unit/scene3d-ribbon-outline-fill-seam.test.js` (same runtime bootstrap, same
capture-and-measure shape):

- Primitive: **torus**, default 3/4 camera. Laws: the five named above.
- Build with `captureClipGroups(V)` around `engine.computeAllDisplayGeometry()`, AND
  `captureSelfOcclusionFootprint(V)` — pass its output as
  `measureRingFillRate(groups, ink, 0.3, { selfOccludedSegments })`. **Omitting this is
  the coverage-oracle trap: the torus self-occludes, and un-corrected the denominator
  scores correct removal as a failure.**
- Assertions, per law:
  1. `coverage.ringNotInkMm2 <= 0.18` — the primary claim (main measures 1.0-2.4).
  2. `coverage.ringFillRate >= 0.995` — the existing contract, kept.
  3. `stats.wide > 0` — guard the guard: the fixture must actually reach `CLS_RIBBON`.
  4. **Anti-vacuity:** `stats.degenerate <= <value recorded on d5af9e30>`, plus
     `stats.wallRings > 0` and `stats.ribbons > 0`. You may not buy coverage with
     centrelines.
- Header comment must state the baseline SHA, the env var, and the measured red numbers.

**Red against `d5af9e30`** via
`makeMultiFilePreShaRuntimeOptions('d5af9e30', 'VECTURA_PRE_F1B',
['src/core/scene3d/surface-fill.js','src/core/scene3d/ribbon-geometry.js','src/core/pen-fill.js'])`.
Before writing any fix, run the test on the untouched tree and record the five
`ringNotInkMm2` values; they should land near 2.4 / 2.3 / 1.6 / 1.4 / 1.0. If they do
not, STOP — you are not reproducing the reported defect and the rest of the unit is
built on sand.

### Exact test commands
```
# red proof, then the loop:
npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js
VECTURA_PRE_F1B=1 npx vitest run tests/unit/scene3d-ribbon-f1b-streaks.test.js   # must FAIL

# regression set for this file (run all of these before commit):
npx vitest run tests/unit/scene3d-ribbon-wall-coverage.test.js \
  tests/unit/scene3d-ribbon-outline-fill-seam.test.js \
  tests/unit/scene3d-ribbon-c3-rule5.test.js \
  tests/unit/scene3d-ribbon-wall-region-clip.test.js \
  tests/unit/scene3d-ribbon-primitives.test.js \
  tests/unit/scene3d-ribbon-weightscale-invariant.test.js \
  tests/unit/ribbon-self-crossing.test.js \
  tests/unit/ribbon-geometry.test.js \
  tests/unit/pen-fill.test.js \
  tests/unit/scene3d-one-pen-down-reachability.test.js
npx vitest run tests/unit/scene3d-ribbon-f6-self-occlusion.test.js \
  tests/unit/scene3d-ribbon-f7-self-occlusion.test.js
npx vitest run tests/integration/scene3d-ribbon-region-clip.test.js \
  tests/integration/scene3d-ribbon-weightscale.test.js \
  tests/integration/scene3d-self-crossing-tone.test.js
# the four existing red proofs must still be red (commands in section 1)
# before commit:
npm run test:unit && npm run test:integration && npm run test:visual
```
Do NOT run `tests/unit/scene3d-tone-law-dispatch.test.js`.

### App verification (required)
`node scripts/dev-server.js 8470`; new `scripts/f1b-streak-evidence.js` patterned on
`scripts/stroke-fill-integration-evidence.js` + `scripts/slabfix-shots.js`:

- Scene: **torus** (not the sphere those scripts default to), default 3/4 camera, one
  directional light, ground/backdrop off, `fillAngle 0, fillDensity 60`.
- For each of the five laws: `<law>-full.png` and `<law>-band.png` (a crop of the
  upper-left quadrant where the streaks were reported), at ONE zoom (2.4), canvas
  pixels, object-only.
- Shoot BEFORE from the same script against a server on the **main** tree (or by
  stashing the fix) — either way, same script, same zoom, same crop. Assert in the
  report that before/after are NOT byte-identical.
- Dump `Vectura.Scene3D.SurfaceFill.lastRibbonStats` per law into `stats.json`:
  `wide`, `ribbons`, `wallRings`, `outlines`, `fills`, `degenerate`, `noRing`,
  `clipEmpty`, `erodeEmpty`. `wallRings == 0` or a jump in `degenerate` is a FAIL even
  if the images look better.
- Also record generation time per law before/after (`weaveDepth` is the 10.2 s worst
  case; a >1.3x regression is a stop condition).

### DONE criteria (copied from the handoff)
> All five reach the same <=0.18 mm2 band as the other seven laws; reproduced on a torus
> first; RGR test red against `da683934`; the user confirms it by eye on the bench.
>
> **Before you start:** re-read finding 2 at the top of this doc. If your fix removes
> geometry, the coverage helper may mis-score it exactly as it mis-scored self-occlusion.

(`da683934` is an ancestor of `main`; pinning `d5af9e30` is the stronger, more current
baseline and satisfies the same requirement. State both in the header. The user's
eye-confirmation is the orchestrator's step, not yours; your job ends at the
screenshots.)

### Traps that apply
Coverage-oracle denominator (pass `selfOccludedSegments`). Bare centrelines / vacuous
pass. Ring-fill-rate already clears 0.995 on all five — it cannot be your only
assertion. Do not switch the default off `spiral`. Do not re-litigate tone.
`scene3d-ribbon-weightscale-invariant` proves nothing about this fix (it passes against
pre-fix code) — it is a regression guard, not evidence.

### Stop and report if
- The five measured red values do not reproduce on the untouched tree.
- Reaching <= 0.18 mm2 requires raising `degenerate` / lowering `wide` or `wallRings`.
- The fix removes geometry and the coverage helper starts mis-scoring it (that is a
  metric interrogation — hand it back).
- Any of the four existing env-flagged red proofs stops being red.
- `weaveDepth` generation time regresses more than 1.3x.
- The fix would need to touch `hlr.js`, `scene.js` or `algorithms/scene3d.js`.

---

## 4. UNIT D — Shadows falling onto other 3D objects   [XL]

### Goal
A shadow lands on another object's surface and renders in **that receiver's own fill
style**. Settled architecture (do not redesign): per surface sample, ask "is this point
in shadow?" and feed the answer into the intensity the tone laws already consume. **No
new region geometry** — that is what makes a curved receiver work at all.

### Where it plugs in
`src/core/algorithms/scene3d.js:686` builds
`intensityFn = (nw, wp) => Regions.combinedIntensity(nw, wp, activeLights)` and threads
it into `surface-fill.js` opts (`:3146`; consumed at `surface-fill.js:1487-1488` and
`:4961`, plus `scene3d.js:1053 / 1804 / 1911 / 3017`). The shadow term attenuates that
per-sample `I`. World-space face polygons come from `scene.js`'s `faceRecord`
(~`:250-300`) on each object record.

Start from what already exists — it did not when this item was written:
`src/core/scene3d/ray-torus.js` (closed-form quartic: Ferrari, near-zero-q routed to the
exact biquadratic, Newton polish; 12 tests), `src/core/scene3d/torus-occlusion.js`
(`buildDepthSource` / `buildSelfOcclusionTest` — the camera/transform plumbing and the
`makeRotator` precompute at `:111` that recovered most of the self-occlusion cost), and
`hlr.js`'s uniform-grid occluder index (`buildOccluderIndex`, `:224-290`) as the
acceleration model.

### Files to touch
- NEW `src/core/scene3d/shadow-receive.js` — exports at minimum
  `pointInShadow(worldPoint, light, occluders)` plus a `buildOccluderSet(records)` and a
  ray/triangle primitive (Moller-Trumbore). IIFE, registers on
  `window.Vectura.Scene3D.ShadowReceive`.
- `src/core/scene3d/regions.js` — `combinedIntensity` gains an optional shadow term.
- `src/core/algorithms/scene3d.js` — build the occluder set once per frame and close
  over it in `intensityFn` (`:681-690`).
- `index.html` — one `<script>` tag, loaded before `surface-fill.js`.
- `src/config/defaults.js` (+ `src/core/scene3d/params.js` for the control) — the enable
  flag. **Default it OFF** unless you can justify the byte-identity move (see stop
  conditions). Never hardcode the default in UI or engine.
- NEW `tests/unit/scene3d-shadow-receive.test.js`.
- NEW `scripts/shadow-receive-evidence.js` + `docs/handoff-b-evidence/D-shadow-receive/`.

### Files NOT to touch
`src/core/scene3d/surface-fill.js`, `ribbon-geometry.js`, `src/core/pen-fill.js`,
`shadows.js` (Lane 2's C owns it, and this item deliberately does NOT go through
footprint projection — a projected silhouette is only valid on a plane), `hlr.js`,
`scene.js`, `src/ui/panels/layers-panel.js`.

### RGR red-proof test (write it FIRST)
`tests/unit/scene3d-shadow-receive.test.js`:

1. **Unit level, on the new module** — the handoff names these four exactly: `hit` (ray
   from a plane point toward the light passes through a sphere), `miss`, `grazing` (ray
   tangent to the occluder — assert the result is stable, not NaN, and pick a documented
   side), and `self-shadow exclusion` (a point on the caster's own lit surface is not
   reported as shadowed by its own geometry).
2. **Integration level, through `intensityFn`** — a sphere above a plane, one
   directional light. Sample plane points that a geometrically-derived oracle (an
   independent projection of the sphere's silhouette onto the plane, computed in the
   test, never calling the new module) says are inside the shadow, and a matched set
   outside. Assert `I(inside) < I(outside)` with a real margin.
3. **Curved receiver** — repeat (2) with a **cone** (or a second sphere) as the receiver.
   This is the case the projected-silhouette approach cannot do and the reason the
   architecture was settled this way.
4. **Receiver's own fill style** — build the same scene twice with two different
   `toneLaw`s on the receiver and assert the emitted `sceneFill` paths inside the shadow
   region DIFFER between them (the shadow is drawn by the receiver's law, not by a
   foreign hatch).
5. **Anti-vacuity** — the receiver still emits `sceneFill` paths at all; `weightScale`
   invariants hold; and with the light moved so nothing is occluded the intensities
   return EXACTLY to the no-shadow values.

**Red against `d5af9e30`** via
`makeMultiFilePreShaRuntimeOptions('d5af9e30', 'VECTURA_PRE_SHADOWRECV',
['src/core/scene3d/regions.js','src/core/algorithms/scene3d.js'])` — the new module still
loads but is never called, so there is no shadow term and assertions 2/3/4 fail. Note in
the header WHY the new file is not in the pin list (it does not exist at that SHA;
overriding it is impossible and unnecessary).

### Exact test commands
```
npx vitest run tests/unit/scene3d-shadow-receive.test.js
VECTURA_PRE_SHADOWRECV=1 npx vitest run tests/unit/scene3d-shadow-receive.test.js   # must FAIL
npx vitest run tests/unit/scene3d-ray-torus.test.js tests/unit/scene3d-shadows.test.js \
  tests/unit/scene3d-shadow-tone-gradient.test.js tests/unit/scene3d-shadow-tone-law.test.js \
  tests/unit/scene3d-form-shadow-limb.test.js tests/unit/scene3d-inverse-shadow.test.js \
  tests/unit/scene3d-hlr-spatial-index-identity.test.js
npx vitest run tests/integration/scene-shadow-config-reachable.test.js \
  tests/integration/scene3d-light-panel.test.js
npm run test:unit && npm run test:integration && npm run test:visual   # before commit
```

### Performance (an explicit DONE requirement)
Measure and STATE, in ms, on a fixed scene: caster + receiver, and the 8-object dense
scene. Report before/after. The handoff's profiling lesson is binding: the quartic solve
was never the cost — `rotatePoint` recomputing `degToRad` plus six trig calls on ~180,000
sub-calls was. **Precompute rotators (see `torus-occlusion.js:111 makeRotator`); profile
before optimising; the obvious suspect was wrong last time.** Budget a spatial index over
occluder triangles (mirror `hlr.js:buildOccluderIndex`) rather than a linear scan if the
measured cost demands it.

### App verification (required)
`node scripts/dev-server.js 8470`; `scripts/shadow-receive-evidence.js`:
- Scene: a sphere casting onto a **cone or a box** (a real object, not the ground),
  directional light, ground off so the receiver is unmistakable, receiver given a
  distinctly-textured `toneLaw`.
- `two-object-full.png` + `two-object-crop.png` (crop on the shadowed patch), one zoom,
  canvas pixels, object-only.
- **Control 1**: move the caster aside -> no shadow on the receiver, same zoom and crop.
  Must not be byte-identical to the shadowed shot.
- **Control 2**: same scene, receiver's `toneLaw` changed -> the shadow's appearance must
  visibly change (this is the "renders in that receiver's own fill style" claim).
- `stats.json`: measured ink density inside vs outside the shadow patch on the receiver,
  path counts, `lastRibbonStats`, and the timing numbers.

### DONE criteria (copied from the handoff)
> `pointInShadow(worldPoint, light, occluders)` with unit tests (hit, miss, grazing,
> self-shadow exclusion); the shadow term feeds per-sample intensity, verified by the
> receiver's fill style changing the shadow's appearance; works on a **curved** receiver;
> performance measured and stated; two-object screenshot.

### Traps that apply
Harness-clean is not app-clean (`wallRings == 0` / bare centrelines = FAILURE). Coverage
oracle: this feature changes INTENSITY, not geometry, so the ring denominator should be
untouched — say so explicitly in the report, and if the oracle does move, that is a
signal you removed geometry somewhere you did not intend to. Vacuous pass: a uniformly
darker receiver is not a shadow — the inside/outside CONTRAST is the claim. Coincident
lines are not this unit's mechanism, but a shadow that only shifts tone by a sub-pen
amount renders as nothing; check the density, not the parameter.

### Stop and report if
- Enabling the feature by default moves
  `tests/unit/scene3d-hlr-spatial-index-identity.test.js` and you cannot justify the new
  fingerprint to the `6c17709d` standard. Preferred resolution: default the flag OFF so
  every existing scene stays byte-identical, and turn it on in the fixtures/evidence.
- The measured cost exceeds ~1.5x on the dense scene and needs a real BVH — that is a
  second unit, not this one.
- Correct results need `surface-fill.js` or `hlr.js` changes (Lane 1 owns those).
- The curved-receiver case cannot be made to work per-sample (that would invalidate the
  settled architecture — report, do not redesign).

---

## 5. UNIT E — Expand fidelity on two laws + the lying counter   [M]

### Goal
Bring `interlockWeave` (6% of frame) and `amplitudeOnly` (10%) into the 0.2-1% band the
other ten bucket-B laws already occupy after "Expand into group", and stop `onePenDown`
booking legitimate centreline degenerations as `erodeEmpty`.

### Files to touch
- `src/ui/panels/layers-panel.js` — `expandWeightToPasses` (~`:2575-2589`) and the expand
  path.
- `src/render/renderer.js` — only if the divergence is proven to be a render-side
  difference between the live path and the expanded children.
- `src/core/scene3d/surface-fill.js` — **counters only**: `ribbonStat` (`:6161-6182`) and
  the `erodeEmpty` booking at `:6630`. The comment at `:6175-6177` already says
  intentional centrelines are kept out of `degenerate`; the remaining lie is a legitimate
  degeneration reaching `:6630`. **Do not change emitted geometry in this unit** — that
  is A's territory and this unit runs after it.
- NEW `tests/integration/expand-scene3d-fidelity-two-laws.test.js`; NEW
  `tests/unit/scene3d-ribbon-degeneration-counter.test.js`.
- NEW `docs/handoff-b-evidence/E-expand/`.

### Files NOT to touch
`shadows.js`, `hlr.js`, `scene.js`, `regions.js`, `src/core/algorithms/scene3d.js`,
`ribbon-geometry.js`, `src/core/pen-fill.js`.

### RGR red-proof tests (write them FIRST)
1. **Fidelity** (integration, sibling of
   `tests/integration/expand-scene3d-child-fidelity.test.js`): generate -> measure ->
   `expandLayer` -> re-measure -> assert divergence <= 1% for `interlockWeave` and
   `amplitudeOnly`. **Mandatory anti-vacuity assertions, from the handoff's own
   evidence-quality rule:** `after.children > 0`, and the before/after representations
   must NOT be byte-identical. (One agent's harness forced `isGroup = true`, so
   `expandLayer` returned immediately and measured nothing.) The oracle must be
   independent of the code under test.
2. **Counter** (unit): build `onePenDown` on a sphere AND a torus; assert that a stretch
   which legitimately degenerates to a centreline is booked in the intentional-centreline
   buckets (`narrow` / `wallEmpty` / `wallCentres`) and **not** in `erodeEmpty`, and that
   `degenerate` equals `noRing + clipEmpty + erodeEmpty` as its own comment claims.
   Assert `erodeEmpty` drops to the value your fix predicts, and state that value.

**Red against `d5af9e30`** via `makeMultiFilePreShaRuntimeOptions('d5af9e30',
'VECTURA_PRE_EXPAND2', ['src/ui/panels/layers-panel.js','src/core/scene3d/surface-fill.js'])`.
Record the measured red divergence (expect ~6% and ~10%).

### Exact test commands
```
npx vitest run tests/integration/expand-scene3d-fidelity-two-laws.test.js
npx vitest run tests/unit/scene3d-ribbon-degeneration-counter.test.js
VECTURA_PRE_EXPAND2=1 npx vitest run tests/integration/expand-scene3d-fidelity-two-laws.test.js  # must FAIL
npx vitest run tests/integration/expand-scene3d-child-fidelity.test.js \
  tests/integration/expand-scene3d-weight-to-strokes.test.js \
  tests/integration/expand-render-fidelity.test.js \
  tests/integration/expand-layer-cache-clear.test.js \
  tests/integration/scene-expand-style-cascade.test.js
npx vitest run tests/unit/scene3d-one-pen-down-reachability.test.js \
  tests/unit/scene3d-ribbon-c3-rule5.test.js tests/unit/scene3d-ribbon-wall-coverage.test.js
npm run test:integration && npm run test:e2e && npm run test:unit   # before commit
```

### App verification (required)
Reuse the `d-expand-*` block of `scripts/stroke-fill-integration-evidence.js` verbatim
(it already deselects after expanding and measures bbox growth), but for `interlockWeave`
and `amplitudeOnly` and against port 8470: `E-<law>-before-full.png`,
`E-<law>-after-full.png`, plus one matched crop each, one zoom, object-only. `stats.json`
must record `after.children > 0`, the bbox growth (must stay <= 0 within a sub-pixel
epsilon), and the pixel divergence. A byte-identical before/after pair invalidates the
run.

### DONE criteria (copied from the handoff)
> Both laws land in the 0.2-1% band; degenerations are counted as degenerations; expand
> evidence asserts `after.children > 0` AND that before/after images are NOT
> byte-identical.

### Traps that apply
Vacuous expand evidence (`isGroup` forced true -> `expandLayer` returns immediately ->
`bboxGrowth {0,0,0,0}` measures nothing). Byte-identical pairs. One pipeline, one zoom,
object-only. The lying counter itself is the cautionary tale: do not trust a counter you
have not proved.

### Stop and report if
- The divergence turns out to be renderer anti-aliasing rather than geometry — quantify
  it, report it, and do not chase pixels.
- The counter fix would change emitted geometry (it must not).
- Fixing fidelity requires `surface-fill.js` geometry changes (that collides with A).

---

## 6. UNIT F — Imported OBJ/STL meshes vs the red-line rule   [M]

### Goal
Determine, then record, whether imported non-convex meshes satisfy the user's rule
("contour lines from the back must never break through the top edge of the front"). They
keep the older mesh-face path with its 6 mm bias (`hlr.js:56 SELF_OCCLUDE_BIAS`, applied
at `:362` and `:389`) because they have no analytic silhouette to clip against. **This is
untested — measurement is the deliverable; a fix is conditional.**

### Files to touch
- NEW `tests/unit/scene3d-mesh-self-occlusion.test.js` and, if needed, NEW
  `tests/helpers/scene3d-mesh-occlusion-oracle.js`.
- NEW fixture: generate the OBJ **as text inside the test**, the way
  `tests/unit/obj-import.test.js` builds `TETRA_OBJ` / `CUBE_OBJ` — no binary asset. Use
  a genuinely non-convex mesh (a coarse torus tessellation, or a cup / L-shaped solid) so
  the near sheet really can hide the far one.
- `src/core/scene3d/hlr.js` and/or `src/core/scene3d/scene.js` — ONLY if the measurement
  shows survivors and the fix is localized to the bias / the `isConvexObject` gate
  (`scene.js:223`).
- `docs/stroke-fill-handoff.md` — record the result under item F either way.
- NEW `docs/handoff-b-evidence/F-mesh-occlusion/`.

### Files NOT to touch
`surface-fill.js` (if a fix needs it, STOP — it serializes against A and E),
`shadows.js`, `regions.js`, `src/core/algorithms/scene3d.js`, `ribbon-geometry.js`.

### RGR red-proof — two branches, decide by measurement
Model the test on `tests/unit/scene3d-ribbon-f7-self-occlusion.test.js`. **The torus
oracle (`tests/helpers/scene3d-torus-hole-oracle.js`) is analytic and cannot be reused
for a mesh** — build an independent oracle that ray-casts the mesh's own world-space
triangles through the real captured camera / projection / object transform, never calling
`hlr.js`, `surface-fill.js`'s chart, or `RibbonGeometry`.

- **Branch 1 — survivors > 0 (the gap is real).** That measurement IS the red. Fix the
  mesh path, drive survivors to 0, and pin the red with
  `makeMultiFilePreShaRuntimeOptions('d5af9e30','VECTURA_PRE_MESHOCC',[...files you
  touched])`.
- **Branch 2 — survivors == 0 (the rule already holds).** Then the test is a new guard,
  and you must prove it is not vacuous: run it with `VECTURA_PRE_F7=1` (pinned to
  `57e86f48`, before self-occlusion existed). It MUST report survivors there. If it still
  reports 0, your fixture does not exercise the rule — replace it with one that does, and
  say so. A guard that cannot fail is not evidence.

Either branch: assert the mesh actually renders ribbons (`lastRibbonStats.wide > 0`,
`wallRings > 0`, ink paths present). A mesh that emits only bare centrelines makes
survivors trivially 0 — that is the vacuous pass this queue keeps producing.

### Exact test commands
```
npx vitest run tests/unit/scene3d-mesh-self-occlusion.test.js
VECTURA_PRE_F7=1 npx vitest run tests/unit/scene3d-mesh-self-occlusion.test.js       # branch 2 non-vacuity
VECTURA_PRE_MESHOCC=1 npx vitest run tests/unit/scene3d-mesh-self-occlusion.test.js  # branch 1 red
npx vitest run tests/unit/obj-import.test.js tests/unit/scene3d-mesh-invariants.test.js \
  tests/unit/scene3d-mesh-charts-lazy.test.js tests/unit/scene3d-ribbon-f7-self-occlusion.test.js \
  tests/unit/scene3d-ribbon-f6-self-occlusion.test.js tests/unit/scene3d-hlr-spatial-index-identity.test.js
npm run test:unit && npm run test:integration && npm run test:visual   # before commit
```

### App verification (required)
`node scripts/dev-server.js 8470`. Import the same non-convex mesh through the real app
(the OBJ import path; `tests/e2e/import-3d.spec.js` shows the UI route), default 3/4 view,
one variable-width law (`taperedEnds`) and one that stressed F7 (`weightSmoothstep`):
`F-<law>-full.png` plus a crop of the region where far-sheet fragments would appear. If a
fix landed, before/after at the same zoom, not byte-identical. Print `lastRibbonStats`.

### DONE criteria (copied from the handoff)
> The F7-style test runs against an imported non-convex mesh and either passes or the gap
> is quantified and recorded here.

### Traps that apply
Bare centrelines (a mesh that degenerates makes the rule trivially satisfied). Vacuous
pass (a guard that cannot go red). Coverage oracle if you end up removing geometry. Test
every primitive — do not generalize from one mesh; state which mesh you tested.

### Stop and report if
- Closing the gap needs `surface-fill.js` (hand back to Lane 1).
- Closing the gap needs a real ray/mesh intersector — that is Unit D's
  `shadow-receive.js`; sequence F after D and reuse it rather than writing a second one.
- The 6 mm bias cannot be reconciled with the measured gap size. The handoff's dead-end
  table already records "mesh face depth + 6 mm bias" failing because the cusp gap is
  ~3 mm — if you are re-deriving that, STOP: it is a known dead end.

---

## 7. ITEM B — evidence to hand the user (no work beyond this)

B is awaiting the user's verdict. Do NOT implement anything. Assemble exactly this and
hand it over:

1. **Two crops of the defect**, from the running app on port 8470, torus at the default
   3/4 view, ONE zoom, object-only, on `taperedEnds` and `weightSmoothstep` — the two
   laws F7 pinned at 0 survivors — centred on a band terminating at the near-sheet clip
   boundary, at a zoom where the blunt / ragged end is legible.
2. **A reference for "natural"**: the same law on a convex primitive (sphere) at the
   identical zoom and crop size, where terminations are silhouette-cut rather than
   occlusion-cut. Same script, same pipeline.
3. **Optionally, a pre-occlusion comparison**: the same torus shot on a build with
   self-occlusion off. If produced, it must come from the same script and zoom, and the
   note must state that the two builds differ (a declared exception to "one pipeline" —
   declare it, do not hide it).
4. **The numbers**: the terminations are geometrically correct — that IS the occlusion
   boundary. F7 survivor counts went 112 -> 0 (`taperedEnds`) and 23 -> 0
   (`weightSmoothstep`). The two available softening knobs are DECOUPLED: a 15 mm
   z-margin rejecting shallow same-surface noise, and a 3 mm 2D dilation radius (the
   smallest that reached zero) absorbing foreshortening. A single coupled knob cannot
   satisfy both.
5. **The question, in one line**: do the terminations read acceptably as-is, or should
   they be softened? Plus the binding constraint: any softening must keep F7 at **0
   survivors** — that is the user's own red-line rule and it is not tradeable.

Deliver as a short note plus an image folder. No code, no test, no branch.

---

## 8. Adversarial reviewer brief (one per unit, after the implementer)

You are reviewing an implementer's landed unit on `3d-scene/handoff-b`. You did not write
it. Your job is to break the claim, not to confirm it. Read `docs/stroke-fill-handoff.md`
first. Report findings as a numbered list, each backed by the exact command or file:line
that supports it.

**Attack these on every unit:**
1. **Is the red proof real?** Run the implementer's red command yourself. Does the test
   actually FAIL at the pinned baseline? Does it fail for the RIGHT reason (read the
   failure message — a `TypeError` from a missing module is not proof the behaviour is
   wrong unless the brief says so)? Is the pinned SHA the true pre-fix tree?
2. **Was any assertion weakened?** `git diff d5af9e30 -- tests/` — every relaxed bound,
   deleted case, widened tolerance, `.skip`, or changed fingerprint is a finding unless
   it meets the `6c17709d` standard (old numbers reproduced exactly with the feature
   disabled, mechanism named, control shown).
3. **Is the pass vacuous?** Could the metric have improved because the feature stopped
   producing output? Check `lastRibbonStats` (`wide`, `ribbons`, `wallRings`,
   `degenerate`, `noRing`, `clipEmpty`, `erodeEmpty`), path counts, and
   `weightScale === 1`. Bare centrelines everywhere is a FAILURE dressed as a pass.
4. **Is the evidence admissible?** One pipeline, one zoom, object-only, app chrome hidden,
   served version matches the worktree. Byte-identical before/after means the run did
   nothing. Two zooms, two pipelines, or a page screenshot instead of canvas pixels means
   throw it out.
5. **Did they stay in their lane?** `git diff --stat d5af9e30` against the brief's "files
   NOT to touch". A cross-lane edit is a finding regardless of quality.
6. **Run the neighbours.** The four existing env-flagged red proofs must still be red; the
   unit's named regression set must be green.

**Per unit, additionally:**
- **C** — Reproduce the mutation check (`overlapFactor -> 1`) and confirm the density test
  goes red. Re-derive the overlap density from the emitted paths yourself rather than
  trusting the reported number. Verify the depth-2 regions in the app scene are non-empty
  (`overlapLevels` did not silently return `null`). Confirm the identity fingerprint was
  NOT touched.
- **A** — Verify `selfOccludedSegments` is actually passed to `measureRingFillRate`
  (without it the torus numbers are meaningless). Check `degenerate` did not rise and
  `wide` did not fall. Hunt for a fix that "wins" by degenerating a stretch. Confirm the
  five measured red values reproduce on the untouched tree. Check the generation-time
  regression.
- **D** — Attack the oracle: is the shadow test's ground truth independent of the new
  module? Try a curved receiver yourself. Move the light so nothing is occluded and
  confirm the intensities return EXACTLY to the no-shadow values. Confirm the byte-identity
  guard is green (or that the fingerprint move is justified to the `6c17709d` standard).
  Re-run the stated timings.
- **E** — Assert `after.children > 0` yourself in the recorded stats; confirm the
  before/after PNGs differ (`shasum`). Verify the counter change moved no geometry
  (`sceneFill` path digests before/after must be identical).
- **F** — Confirm the mesh actually rendered ribbons. Confirm the oracle never calls
  `hlr.js` or `surface-fill.js`. In branch 2, confirm the guard goes red under
  `VECTURA_PRE_F7=1`; if it does not, the fixture is wrong and the unit is not done.

---

## 9. Judge brief (verdict after the reviewer)

You issue one verdict per unit: **PASS**, **PASS WITH FINDINGS** (list them; they go back
to the implementer), or **FAIL**. You read the implementer's report and the reviewer's
findings, and you run commands yourself — you do not take either party's word.

**Rubric. All five must hold for PASS.**

1. **Real test red-proof.** There is a test that fails without the change and passes with
   it, and you ran both directions yourself. The baseline is a real pre-fix tree
   (`d5af9e30`, or the SHA the brief names), not a mutated working copy. A test that
   passes against pre-fix code is not evidence — the handoff says exactly this about
   `scene3d-ribbon-weightscale-invariant`.
2. **No weakened assertions.** No bound relaxed, no case deleted, no tolerance widened, no
   fingerprint updated, no `.skip` / `.only` — unless the change meets the provable
   standard: the corrected metric reproduces every prior value EXACTLY with the feature
   disabled, and the commit message states the mechanism and shows a control. Anything
   less is FAIL, not "PASS WITH FINDINGS".
3. **Screenshot evidence from ONE pipeline at ONE zoom.** Object-only, chrome hidden,
   canvas pixels, served version verified against the worktree, before and after from the
   same script. A byte-identical pair, two zooms, two pipelines, or a screen-region pixel
   proxy that cannot resolve the defect means FAIL on evidence.
4. **No vacuous pass.** The feature demonstrably still produces output: for fill units
   `wallRings > 0`, `wide > 0`, `degenerate` not raised, `weightScale === 1` everywhere;
   for shadow units a measured density CONTRAST, not a uniform shift, plus a control that
   produces zero of the effect. A style emitting only weightScale 1 because it degenerated
   is a FAILURE, not a pass.
5. **Scope and suites.** The diff stays inside the brief's file list; the named regression
   subsets are green; the four existing env-flagged red proofs are still red;
   `npm run test:unit`, `test:integration` and `test:visual` (plus `test:e2e` for E) pass
   on the branch.

**Judge's standing instructions.**
- Check whether the METRIC is wrong before concluding the FIX is. Two correct
  implementations were thrown away in this effort by a coverage oracle whose denominator
  predated the feature.
- A disclosed failure beats a hidden fudge. An implementer who reverted cleanly and
  reported what they learned earns a better verdict than one who widened a tolerance.
- Name every law / primitive you checked. Do not generalize from a sample.
- Do not accept "tests pass" as visual verification. Harness-clean is not app-clean.
