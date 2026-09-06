STATUS: MEASURED — implementer brief for W-27c item 0 (torus contourSlice) + W-29 (faceted-solid open ring). Both mechanisms located and BOTH candidate fixes prototyped and measured in a scratch export; no worktree file touched, nothing committed.

# W-27c item 0 + W-29 — implementer brief (lane fill-audit-d)

Planner: Opus, read-only. Lane worktree `.claude/worktrees/fill-audit-d` (branch `3d-scene/fill-audit-d`)
was NOT entered for writes and its dev port (8481) was not used. All diagnosis ran in a scratch export
of **18e5a097** (= `after/W-27`, the exact tree the user's screenshots show) at
`/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad/fad-18e5a097`
with `node_modules` symlinked from main. Line citations are line numbers **at 18e5a097**.

## 0. Read-before-you-start (two things that will bite)

1. **The cell ids in the brief were wrong.** contourSlice cells are named with the placeholder fill
   style `ladder`, not `none` (`docs/3d-audit/fill-audit/manifest.A.1-1.jsonl`). The real ids are
   `torus__contourSlice__ladder__{low,med,max}__{a,b}` and `solid__contourSlice__ladder__{low,med,max}__{a,b}`.
   `solid` **is** the buckyball (`Params.PRIMITIVE_PARAM_DEFAULTS.solid.solidType === 'buckyball'`,
   `scripts/audit/scene3d-capture.js:110`), so there is no separate buckyball cell.
2. **The base may have moved under you.** WIP `2dc7b3aa` (the commit being triaged) rewrites the
   analytic projector into a Newton-on-plane∩surface solve (`sliceSurfaceFG`, `sliceLocalPlaneNormal`)
   and touches `mappers.js`. It does **not** touch `buildSliceSegments` and does **not** touch the
   slice `segCtx`, so **neither mechanism below changes in kind** — but every RED number here is
   measured at 18e5a097. Re-measure the RED at whatever tree survives triage before you implement.
   A more accurate analytic snap makes W-27c 0(b) *worse*, not better (see §1.2).

Harness used for every number below (reproduce it as a throwaway file, then delete it):
rig from `tests/unit/scene3d-contour-slice.test.js`; default primitive bag from
`Params.PRIMITIVE_PARAM_DEFAULTS`; camera = `Params.DEFAULT_CAMERA` (ortho, yaw −30, pitch 20,
d 620, f 520, zoom 1); style `{ mapper:'contourSlice', params:{ fillAngle:45, fillDensity:50,
toneLaw:'ladder' } }` on scene + byObject; `sliceCount` left at its default 26; bounds
`{width:320,height:220,m:20,dW:280,dH:180,truncate:true,penWidth:0.3}`. That reproduces the audit
cell exactly — the audit harness strips the group's object3d children, so `_applySceneCurveFinish`
is inert for these cells and `algo.generate`'s output IS what is drawn (verified by rasterising the
emitted paths: my raster is 800×386 against the shot's 800×399 and pixel-for-pixel the same picture).

---

## 1. W-27c item 0 — torus contourSlice (user-reports/11.png)

### 1.1 (b) micro-gaps — MEASURED, mechanism found, fix prototyped

**RED numbers at 18e5a097** (`torus__contourSlice__ladder__med__a`, 47 front rings):

| metric | value |
|---|---|
| emitted `sceneFill` paths | 102 |
| hidden runs returned by the clipper | 93 (58.74 mm of ring declared hidden) |
| **internal gaps between consecutive visible fragments of one ring** | **56** |
| of those, wider than one 0.3 mm pen | **26** |
| gap size: min / median / max | 0.013 / 0.285 / **1.566 mm** |
| gaps caused by the `MIN_RUN_MM` (0.6) drop | **0 of 56** |
| gaps caused by clip sampling coarseness | 0 (a refined ring's edges are ≪ 2.5 mm, so `clipPath` takes the `steps=2` floor and samples ~2× per edge) |
| gaps caused by a missing collinear merge | 0 (`COLLINEAR_EPS` is 1e-6 mm, `hlr.js:66` — the decimation is a no-op here) |
| rings with > 4 visible fragments | 6 / 47 (worst ring: 7 fragments) |

Every gap's width equals, to 3 dp, the length of a tiny **hidden** run the clipper inserted between
two visible runs. So the three hypotheses in the queue text (clip sampling on the denser ring,
missing collinear merge, `MIN_RUN_MM`) are all **disproven**. The A/B that finds the real cause:

| variant | emitted paths | hidden runs | internal gaps | max gap |
|---|---|---|---|---|
| `full` (18e5a097: refine + analytic snap) | 102 | 93 | **56** | 1.566 mm |
| Catmull-Rom refine only (analytic snap off) | 52 | 30 | 6 | 0.708 mm |
| raw rings (pre-W-27) | 46 | 18 | **0** | — |
| sphere control, full vs raw | 27 / 27 | 0 / 0 | 0 / 0 | — |
| solid (buckyball) control | 33 | 0 | 0 | — |

**Mechanism.** W-27b snapped the ring onto the object's **analytic** surface
(`sliceAnalyticProjectLocal`, `scene3d.js:265-320`; threaded in at `scene3d.js:3679-3698`) while the
HLR occluder set is still the **tessellated mesh** (`scene3d.js:895`
`HLR.createClipper(occluderFaces, { bias: HLR_BIAS })`). The two surfaces differ by the inscribed
mesh's sagitta — on the default torus tube, `minor = min(sy,sz)·0.28 = 6.16 mm` at `detail 16`, so
`R(1−cos(π/N)) = 6.16·(1−cos 11.25°) = 0.118 mm`. The bias that has to absorb that mismatch is
`HLR_BIAS = 0.05` (`scene3d.js:31`) — **less than half the mismatch**. Critically, the slice pass
builds `segCtx = { objectId: record.id }` (`scene3d.js:3648`) with **no** `selfObject`, **no**
`selfOcclude` and **no** `ownerKeys`, so in `hiddenAt` (`hlr.js:338`) the ring is tested against its
own facets at `effBias = bias = 0.05` (`hlr.js:389`) — not at `SELF_OCCLUDE_BIAS = 6`
(`hlr.js:56`). Wherever the analytic ring runs near-tangentially to the view (around the hole and
along the tube's inner/outer equator) it dips behind a chordal facet for a fraction of a millimetre
and the clipper splits the run. The raw ring never did this because its points lie exactly ON mesh
edges; the Catmull-only ring interpolates mesh-chord points and so stays strictly inside the mesh.
This is also why the defect is torus-only in the gallery: the sphere and the buckyball produce zero
hidden runs at this camera, so there is nothing to flicker.

**Prototyped fix (measured GREEN).** Add `selfOcclude: true` to the slice `segCtx` at
`scene3d.js:3648`. `hiddenAt` then uses `Math.max(bias, SELF_OCCLUDE_BIAS)` = 6 mm for **same-object**
occluders only (cross-object occlusion, the buffer path and every other pass stay untouched):

```
torus[selfOcclude] emitted=46  hiddenRuns=16  hiddenLen=33.58mm  internalGaps=0  maxGap=0.000  gaps>0.3mm=0
```

i.e. **56 → 0 gaps**, one visible run per ring exactly as the raw pass produced (46 paths), and
genuine occlusion is retained: 33.58 mm hidden vs the raw pass's 36.01 mm. `hlr.js:52-55` documents
that real torus self-occlusion crossings measure **≥ 10 mm** of depth gap and never less, so a 6 mm
bias sits in a wide safe window above tessellation noise (0.12 mm) and below real crossings (10 mm).
I rasterised the result and looked at it: continuous rings, hole and saddle occlusion still correct,
no far-side leak-through (`scratchpad/r_torus_selfocc.png`, hole crop `r_t_hole_selfocc.png`).

**Fix approaches, ranked**

1. **`selfOcclude: true` on the slice `segCtx`** (`scene3d.js:3648`) — one line, in an allowed file,
   0 gaps measured, no new clipper, no perf cost. *Risk to own with a test:* 6 mm is absolute, so a
   genuinely self-occluding feature shallower than 6 mm (a thin imported mesh) would leak. Scope it
   if you want to be conservative: apply it only when `smoothSurface && analyticProject` (the records
   whose ring left the mesh), leaving faceted/raw records byte-identical. Ship the scoped form unless
   you can show the unscoped form is free.
2. **A slice-specific clipper with a computed bias** — `HLR.createClipper(occluderFaces, { bias:
   max(HLR_BIAS, sagittaBound) })` where `sagittaBound` comes from the chart sizes + detail
   (`curvedChartParams` already gives you both). Still scene3d.js-only, principled rather than a
   magic 6, but rebuilds the occluder index (perf) — build it lazily, once, only if some record needs it.
3. **Clip the mesh-consistent ring and transfer the classification to the refined ring.** Strongest
   invariant ("refinement changes how smooth a ring is, never what is visible") and it is exactly
   testable: visible arc-length fraction per plane must match the raw ring's. `refineSliceRing` is
   interpolatory, so original vertex *i* survives at index `i·2^rounds` — the correspondence is exact.
   More code; keep as the fallback if 1 and 2 both break a guard.
4. **Post-clip heal** — merge two visible runs of one ring across a hidden stretch shorter than a
   floor. All 56 internal gaps are ≤ 1.566 mm and no genuine long internal gap exists in this scene,
   so it works; but the threshold is a judgement call and it papers over the mismatch instead of
   fixing it. Belt-and-braces on top of 1-3 at most. The precedent for the shape of this code is
   `chainedFloorSurvivors` (`scene3d.js:2341-2440`), same file, same problem ("the floor punched a
   hole in a continuous run").

**Do NOT** change `MIN_RUN_MM` (0 of 56 gaps come from it), `COLLINEAR_EPS`, `SAMPLE_STEP` or
`SLICE_CLIP_WORK`. Do NOT edit `hlr.js`: option 1 and 2 both reach the existing `seg.selfOcclude` /
`opts.bias` hooks from the call site.

### 1.2 (a) "angled points" — MEASURED, and the 8° bar is already met

| metric (emitted device-mm paths, 102 of them) | value |
|---|---|
| **max per-vertex exterior turn** | **9.3°** (3 paths > 8°, 0 > 20°, 0 > 45°) |
| refined WORLD rings above the 8° refine target | 1 / 47 |
| max deviation of a refined ring from the true torus surface | **0.063 mm** (0 rings > 0.15 mm; 3 > 0.05 mm) |
| max cumulative turn per 1 mm of arc, emitted | 64° (paths #16/#10, both 5 mm-long rings), 54° (path #101, n=833) |
| **max cumulative turn per 1 mm of arc, the TRUE analytic plane∩torus curve at the same levels** | **95-108°** |

Every worst kink localises to `|pr − major| ≈ 6.1 ≈ minor, y ≈ 0` — the tube's **inner and outer
equator**, where a z-const plane is tangent to the surface in y and the cross-section legitimately
turns through ~180° inside ~2 mm. The drawn ring turns **more slowly than the true curve does**, i.e.
it is already rounder than the geometry it represents. I zoomed the raster 8× on the two corners the
user's circle covers (`scratchpad/z_chev.png`): a smooth tight bend, not a facet.

**Conclusion to report, not to fix:** the acceptance bar "no corner sharper than 8° on any torus
ring" is already satisfied (max 9.3° per vertex, 3 rings marginally over), and as a *perceptual* bar
it is unachievable — meeting it would require moving the ring off the true surface. Say this in the
commit body and in the report; do not widen anything to manufacture a pass.

**There IS one real artefact in the same region** — the "fan of spikes" at the saddle
(`scratchpad/z_fan.png`), and it is worth fixing because it is cheap:

- 5 of 47 linked rings arrive with **≤ 4 raw points**; one (`plane 5, ring 0`) is a 3-point ring
  spanning **0.004 mm** whose first two points are a near-duplicate mesh-seam pair. `refineSliceRing`
  (`scene3d.js:400`) runs all 8 rounds on it (`SLICE_REFINE_MAX_ROUNDS`, `scene3d.js:232`), inflating
  it to **513 points with a 180° fold** — the runaway spike its own `DUP_EPS = 1e-4` dedup comment
  was meant to prevent (the pair is > 1e-4 apart, so the dedup misses it).
- Fix: in the slice pass, skip any linked ring whose total 3-D length is below a floor before
  refining it (it can never survive `MIN_RUN_MM = 0.6` anyway) — or make `refineSliceRing` bail on a
  sub-0.01 mm ring. Either is scene3d.js-only. Expected effect: `tinyRawRings(<=4pts)` 5 → fewer,
  `refinedRingsWith>170deg` **1 → 0**, wasted subdivision rounds gone, spike gone.
  Note the plane-nudge of §2 does **not** remove these (measured: torus unchanged by it) — the torus
  stubs come from the chart's u-seam, not from an on-plane vertex.

### 1.3 The lower-left ring gap (the small circle in 11.png)

Same mechanism as §1.1 — it is one of the 26 sub-pen-to-1.6 mm internal gaps, and it closes in the
prototype (0 gaps). No separate work item.

---

## 2. W-29 — faceted solid contourSlice has an open end mid-face (user-reports/12.png)

### 2.1 RED numbers at 18e5a097 — the oracle and what it says

Oracle (this is the RED test): cut the record's mesh with `sliceCount` planes and, **per plane over
the FULL front+back segment set**, require (i) every cut point to have **even degree**, and
(ii) linking that plane's segments to yield only **closed** rings (first≈last within 0.01 mm).
Front-only rings are legitimately open (they end on the silhouette), so the front/back split cannot
be the oracle — the full plane must be closed because a plane cutting a closed manifold is a set of
closed loops.

| primitive (sliceCount 26) | segs | rings | OPEN rings | odd-degree nodes | max node degree | zero-length segs | bad planes |
|---|---|---|---|---|---|---|---|
| **solid (buckyball)** | 620 | 32 | **6** | **12** | **9** | **22** | **2 / 26** |
| sphere | 2504 | 32 | 0 | 0 | 4 | 0 | 0 |
| torus | 1644 | 42 | 0 | 0 | 2 | 0 | 0 |
| box | 208 | 26 | 0 | 0 | 2 | 0 | 0 |
| cylinder | 1664 | 52 | 52 | 104 | 2 | 0 | 26 |
| cone | 1874 | 26 | 26 | 52 | 2 | 0 | 26 |
| pyramid | 926 | 26 | 26 | 52 | 2 | 0 | 26 |

The two bad buckyball planes are **9** and **18**, at world z = ∓6.530, and the odd-degree nodes are
**exact mesh vertices**:

```
plane 9 : (-8.071, 17.095,-6.530) degree 9 ;  (8.071,-17.095,-6.530) degree 9 ; + 6 degree-1 nodes
plane 18: (-8.071, 17.095, 6.530) degree 9 ;  (8.071, 17.095, 6.530) degree 7 ; …
plane 18 open ring: n=27, ends (8.071,17.095,6.530) → (-8.071,17.095,6.530), gap 16.14 mm
```

### 2.2 Mechanism (cite these lines)

Plane levels are `z = minD + (level/(count+1))·span` (`scene3d.js:151`). With `count = 26` and a
z-symmetric mesh that is `±maxD/3` at levels 9 and 18 — and the buckyball has vertices at **exactly**
that z. `edgeCross` (`scene3d.js:141-149`) then takes its on-plane branch:

```js
if (Math.abs(ea) < 1e-6) pts.push({ x: va.x, y: va.y, z: va.z });   // scene3d.js:145
```

so every fan triangle incident to that vertex contributes the vertex itself as a chord endpoint
(and, where a whole mesh **edge** lies in the plane, a vertex→vertex chord as well). The result is
22 **zero-length** segments and nodes of degree 7 and 9 instead of 2. `linkSegments`
(`geometry3d.js:391`, greedy first-unused-match walk) consumes one arbitrary continuation per node
and abandons the rest — leaving dangling ends **in the interior of a facet**, which is exactly the
open end the user circled. The early `if (pts.length < 2) continue` (`scene3d.js:164`) then also
drops the one-point triangles, which is where the degree-1 nodes come from. `linkSegments`'s 2-D
key is **not** the cause here: distinct 3-D cut points sharing a 2-D key = **0** at `sliceRotate 0`.

### 2.3 Prototyped fix (measured GREEN)

**Nudge the plane level off any vertex.** In `buildSliceSegments`, before using the level, if any
`|d[i] − z| < VEPS` (with `VEPS = max(1e-9, span·1e-7)`), step `z` by `2·VEPS` (bounded loop, ≤ 8
tries). `d[]` is already computed; V ≤ a few hundred and planes ≤ 120, so the cost is negligible.

```
nudge ON  solid    planes=26 rings=31 OPEN=0 oddNodes=0 maxDegree=8 zeroLenSegs=0 badPlanes=0
nudge ON  sphere/torus/box                 OPEN=0 oddNodes=0 zeroLenSegs=0 badPlanes=0   (unchanged)
plane-count purity: sliceCount 2/12/26/120 → planes 2/12/26/120, nudge OFF and ON alike
emitted sceneFill paths, solid: 33 → 32 (the duplicate degenerate ring is gone)
```

Rendered and looked at: the dangling stub that sits mid-facet in the top-right of
`after/W-27/shots/A/solid__contourSlice__ladder__med__a.webp` is **gone**
(`scratchpad/r_s_top_nudge.png` vs `r_s_top.png`), and nothing else in the picture moves.

**Fix approaches, ranked**

1. **Plane-level nudge** (above) — measured to zero out every defect metric, preserves plane-count
   purity, moves plane positions by ~1e-6 mm so no visible geometry change anywhere else.
   Keep `edgeCross`'s on-plane branch as a dead safety net (a test can assert it never fires) or
   delete it; either way the topology is now degree-2 by construction.
2. **Make `edgeCross` degeneracy-consistent** — replace the epsilon branch with a strict sign test
   `(ea >= 0) !== (eb >= 0)`. Cheaper-looking, but a plane through a vertex is a genuine pinch point
   in the level set, so a vertex can still finish with degree > 2. Not recommended as the primary.
3. **De-duplicate + repair after linking** — drop zero-length segments and stitch odd-degree nodes
   pairwise. Treats the symptom, needs a pairing rule, and leaves the pinch ambiguity. Last resort.

### 2.4 Two findings that must be reported, not folded into W-29

- **cylinder / cone / pyramid emit 100 % open rings** (26-52 open per primitive, 2 degree-1 nodes per
  ring, `maxDegree = 2` — so this is *not* a degeneracy). Their `record.faceIndexArrays` has no cap
  faces, so a z-const cut is genuinely a set of open arcs terminating on the mesh's open boundary.
  The nudge does not change this and must not be expected to. Consequence: **scope the W-29 guard test
  to closed meshes** (solid / sphere / torus / box) or the guard is vacuous-or-red by construction.
  Whether the cone/cylinder shots show a user-visible open end at the cap is a separate question —
  raise it as its own W-id if the picture shows it, do not silently widen this unit.
- **`sliceRotate = 90°` breaks linking outright** (latent, user-reachable — `sliceRotate` clamps to
  ±360 at `params.js:703`). At rot 90 the plane normal is −x, so the ring lies in the y-z plane and
  `pointKey`'s **2-D (x, y)** key (`geometry3d.js:389`) collapses it onto a line:

  ```
  sliceRotate=0  : rings=32  OPEN=6   oddNodes=12  maxDeg=9
  sliceRotate=45 : rings=26  OPEN=0   oddNodes=0   maxDeg=2
  sliceRotate=90 : rings=126 OPEN=45  oddNodes=6   maxDeg=10
  ```

  The clean fix (rotate the segment endpoints into a plane-local 2-D frame before calling
  `linkSegments`, or key on all three coordinates) is scene3d.js-local and cheap, but it is a
  different defect with its own oracle. **File it as a new W-id, do not bundle it.**

---

## 3. RGR — the red tests to write

Put all of them in `tests/unit/scene3d-contour-slice.test.js` (the file that already owns this pass),
in two new `describe` blocks. Every assertion below **fails at 18e5a097** with the value in brackets.

**W-29 topology (RED on the default buckyball):**

1. `buildSliceSegments` on the default `solid` mesh at `sliceCount 26` emits **no zero-length
   segment** — RED: `22`.
2. Per plane, over the full front+back segment set, **every** cut point has even degree — RED:
   `12 odd-degree nodes across 2 planes`, max degree `9`.
3. Per plane, `linkSegments` over the full segment set yields **only closed** rings (first≈last within
   0.01 mm) — RED: `6 open rings`, worst end-gap `16.14 mm`.
4. **Purity guard that must stay green both sides:** `sliceCount` 2 / 12 / 26 / 120 → `planes`
   2 / 12 / 26 / 120 (this is the existing invariant of
   `scene3d-contour-slice.test.js:204-306`; assert it again locally so the nudge cannot regress it).
5. Scope 1-3 to closed meshes (solid / sphere / torus / box) and add an explicit note in the test
   body that cylinder / cone / pyramid are excluded because their meshes have no cap faces — with
   the measured numbers, so the exclusion is documented rather than hidden.

**W-27c 0(b) gap continuity (RED on the default torus):**

6. On `torus`, `sliceCount 26`, `Params.DEFAULT_CAMERA`: the number of **internal** gaps between
   consecutive visible fragments of one front ring is **0** — RED: `56`, of which `26` exceed one
   0.3 mm pen, max `1.566 mm`. (Measure it off `clipper.clipPath`'s runs, or equivalently off the
   emitted paths by grouping same-ring fragments; the harness in §0 gives you 47 front rings.)
7. Occlusion is **not** lost by the fix: total hidden ring length stays within ~15 % of the raw
   pass's `36.01 mm` — GREEN prototype `33.58 mm`; a fix that drops it toward 0 has disabled
   self-occlusion and must be rejected.
8. Emitted path count per ring returns to ~1 visible run per ring: `102 → 46` paths for 47 rings.

**W-27c 0(a) degenerate stub (RED on the default torus):**

9. No refined ring has a max exterior turn above 170° — RED: `1` (the 0.004 mm, 513-point ring at
   plane 5). And/or: no linked ring shorter than 0.01 mm is refined at all.
10. Keep the honest per-vertex corner assertion at its measured value (max `9.3°`), and record in the
    test body that the true plane∩torus curve turns 95-108° per mm at the tube equators, so an 8°
    *perceptual* bar is not attainable. **Do not widen an existing tolerance and do not re-pin a
    fingerprint** to make anything here pass.

---

## 4. Files you may touch

- `src/core/algorithms/scene3d.js`, **slices code only**: `buildSliceSegments` (109-170),
  `refineSliceRing` / its constants (186-455), and the contourSlice pass (3626-3762) — including the
  `segCtx` at 3648 and the `HLR.createClipper` call at 895 **only if** you take fix option 1.2/2 and
  build a second, slice-scoped clipper (do not change the shared clipper's bias).
- `src/core/scene3d/mappers.js` — allowed, but note it contains **no contourSlice code at all** at
  18e5a097; expect to leave it untouched.
- `tests/unit/scene3d-contour-slice.test.js` and, if you need a shared oracle helper,
  `tests/helpers/` (new file).

**Not allowed:** `src/core/scene3d/hlr.js` (both ranked fixes reach the existing `seg.selfOcclude` /
`opts.bias` hooks from the call site — if you convince yourself an hlr.js change is unavoidable, STOP
and say so explicitly in the report with the reason, because that file is lane `handoff-c`'s),
`surface-fill*.js`, `shadows.js`, `geometry3d.js` (the 2-D `pointKey` fix is a separate W-id, §2.4).

## 5. Guard tests (must pass, or be re-pinned WITH proof in the commit body)

- `tests/unit/scene3d-contour-slice.test.js` — whole file, **especially** the plane-count purity
  block at **:204-306** (#1 non-collapse, #2 camera invariance, #3 draft/full parity, #4 scene-content
  invariance, #5 fullContour back rings). The nudge and the `selfOcclude` change both leave plane
  counts alone; #3 and #5 are the two that could legitimately move (they count runs), so re-measure
  their tolerances honestly rather than widening them.
- `tests/unit/scene3d-hlr-spatial-index-identity.test.js` — the `selfOcclude` route changes which
  candidates are *rejected* on bias, not which are indexed; must stay green untouched.
- `tests/unit/scene3d-curves.test.js` — the curve/simplify finish stage.
- `tests/unit/scene3d-mesh-self-occlusion.test.js` (exists at HEAD `2dc7b3aa`, not at 18e5a097) and
  `tests/unit/scene3d-ribbon-f7-self-occlusion.test.js` — these own the `selfOcclude` semantics; they
  are the tests most likely to notice fix option 1. Also `scene3d-hlr.test.js`,
  `scene3d-hlr-draft-flag-wiring.test.js`.
- `tests/integration/scene-xray-needs-fill.test.js`, `tests/integration/scene3d-panel.test.js`,
  `tests/integration/convert-to-scene*.test.js` — the other contourSlice callers.
- Machine is shared: run **targeted** files (`npx vitest run tests/unit/<file>`). A timeout under
  load is not a regression; rerun alone. Per the handoff, the FIRST thing this lane owes is a clean
  `npm run test:unit && npm run test:integration` on an idle machine to name the never-reproduced
  "contourSlice x-ray" failure — do that before you add anything.

## 6. Evidence cells to re-shoot

From MAIN, so the output lands in main's gallery, one command per W-id:

```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-d --port 8482 \
  --only '^(torus|solid)__contourSlice__ladder__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/W-27c-0
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-d --port 8482 \
  --only '^solid__contourSlice__ladder__(low|med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/W-29
```

Required cells: `torus__contourSlice__ladder__med__a`, `torus__contourSlice__ladder__max__a`,
`solid__contourSlice__ladder__med__a` (the user's two screenshots), plus
`solid__contourSlice__ladder__low__a` and `..__max__a` (the nudge must not disturb other densities)
and `sphere__contourSlice__ladder__med__a` + `box__contourSlice__ladder__med__a` as no-change
controls — a byte-identical control pair is a PASS here and must be labelled as such in
`report.json`. Write `after/<W-id>/report.json` with `after` paths under `after/<W-id>/…` (three
earlier reports got this wrong), then **look at the PNGs yourself** and describe: for the torus,
whether any ring is still dashed and whether the far side is still hidden; for the solid, whether the
mid-facet stub near the top is gone and whether every ring now either closes or dies on a silhouette
edge.

## 7. Stop conditions

- **STOP and report** if fix option 1 (or 2) forces a change in `hlr.js` — that file is another
  lane's; report the reason and the measurement instead of crossing.
- **STOP** if the `selfOcclude` route makes the torus's far side visible (leak-through) or drops total
  hidden length toward 0 — that is under-hiding, worse than the gaps. Fall back to option 3 (clip the
  mesh-consistent ring, transfer visibility).
- **STOP** if closing the gaps requires touching `MIN_RUN_MM`, `COLLINEAR_EPS`, `SAMPLE_STEP` or
  `SLICE_CLIP_WORK`: measurement says none of them causes the defect, so such a change is a symptom
  patch and needs the orchestrator's sign-off first.
- **STOP** if the plane-count purity block (`:204-306`) goes red — the nudge must not move plane
  counts; if it does, the implementation nudged the count, not the level.
- **Do not** attempt to reach "no corner sharper than 8°" as a perceptual bar on the torus. It is
  already met per-vertex (9.3° max) and the true curve turns 95-108°/mm at the tube equators. Report
  the measurement; do not deform the ring to satisfy a bar the geometry contradicts.
- **Do not** fold in the `sliceRotate = 90°` linking collapse (§2.4) or the cylinder/cone/pyramid
  open-cap meshes (§2.4). File each as its own W-id with the numbers above.
- Two units here, two commits: W-29 (`buildSliceSegments` nudge + topology tests) first, since it is
  independent of the analytic-projection work being triaged; then W-27c item 0. Commit in the
  worktree, explicit paths, W-id + before/after numbers in the message, then **STOP** — never push.
