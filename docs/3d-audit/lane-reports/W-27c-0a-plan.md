STATUS: MEASURED — 0(a) diagnosed; the 8° bar is met and is the WRONG oracle; the real defect is pen-width ink merging at the torus's two saddle points. Plan + RED numbers below. No code changed.

# W-27c item 0(a) — torus contourSlice "angled points" — planner report (lane fill-audit-d)

Planner: Opus, read-only. Nothing was written into
`.claude/worktrees/fill-audit-d` (verified clean at start; only the pre-existing
`graphify-out` stashes in `git stash list`, none touched). All measurement ran in
a scratch export of the worktree HEAD `767bed54` (v1.3.98) at
`…/scratchpad/fad-0a`, `node_modules` symlinked from main, dev-server on
**port 8517**.

Evidence images + the probe scripts that produced every number in this file:
`docs/3d-audit/lane-reports/W-27c-0a-evidence/` (`probes/` is runnable as-is
against any scratch export on port 8517).

---

## 0. Headline

The user is right that the picture has corners. Every previous measurement is
also right that no ring has a corner. Both are true because **the corner is not
on a ring** — it is the apex of a solid wedge of ink formed where several
DIFFERENT contour levels crowd to less than one pen width at the torus's two
saddle points. Tessellation, clipping and refinement are all innocent, and each
was refuted with a number, not an argument.

Do not chase 7.579°. The oracle must measure ink separation, not turning angle.

---

## 1. The rig is looking at the right picture (checked first, per the brief)

The coordinator's first hypothesis — that the measurement rig is not looking at
the rings the user photographed — is **refuted**.

- `user-reports/11.png`'s own captions read `shots/A/torus__contourSlice__ladder__med__a.webp`
  and `after/W-27/shots/A/torus__contourSlice__ladder__med__a.webp`. The user is
  looking at the audit gallery cell, not at an app-shelf Slices layer.
- I rebuilt that cell exactly (`scripts/audit/scene3d-capture.js:195-284`:
  torus `PRIMITIVE_PARAM_DEFAULTS` `{sx:30,sy:22,sz:22,detail:16}`, mapper
  `contourSlice`, style `ladder`, `fillDensity` 50, camera `a` =
  `DEFAULT_CAMERA` `{orthographic, yaw:-30, pitch:20, cameraDistance:620,
  focalLength:520, zoom:1}`, `FIXED_ZOOM` 3.6, dpr 2). Result:
  `evidence/0-repro-full-frame.png` — same 109 paths, same rings, same two
  "eyes" as the shipped cell.
- I decoded the shipped cell itself
  (`after/W-27c-0/shots/A/torus__contourSlice__ladder__med__a.webp`) and cropped
  the left eye: `evidence/3-shipped-gallery-cell-left-saddle.png`. The solid
  white wedge with the sharp apex is plainly there. My reproduction shows the
  same wedge in the same place (`evidence/1-repro-audit-crop-left-saddle.png`).

Two further pipeline facts, measured, that close off "something downstream is
making the corner":

- `Engine._applySceneCurveFinish` (`src/core/engine.js:2865-2990`) is **inert**
  in this cell. It returns early unless some object wants `curves`/`smoothing`/
  `simplify`; the harness sets none, and I read back
  `{sceneCurves, sceneSmoothing, sceneSimplify, objCurves, objSmoothing,
  fillCurves, fillSmoothing, fillSimplify}` — **all `undefined`**. There is no
  fitter, no `reduceAnchors`, no `corner:true` marking in this picture.
- I intercepted the 2-D context during `renderer.draw()`. The renderer issues
  **109 subpaths, 0 `bezierCurveTo`, 0 `quadraticCurveTo`** and the stroked
  point list is coordinate-identical to `group.scenePaths`. What is drawn IS the
  emitted polyline, at `lineWidth 0.3` (mm) — **pen width = 0.30 mm**.

So: the emitted geometry, the rendered geometry and the user's picture are the
same object. Any oracle written against `scenePaths` is measuring what the user
sees.

---

## 2. What the user actually circled (the money shot)

`evidence/2-same-region-hairline-per-ring-colour.png` is the SAME region as
`evidence/1-…` and the SAME geometry, redrawn at hairline width with each
emitted path in a different colour.

At hairline width the region is a clean, smooth, nested family of arcs. There is
no corner, no facet, no kink, and no stub. Every "angled point" in the normal
render is a place where **five to ten distinct level curves pass within a
fraction of a millimetre of each other** and the 0.30 mm pen fuses them into one
tapering solid blob whose tip reads as a corner.

`evidence/4-zoom40-with-emitted-vertices.png` shows the same region at 40 px/mm
(5.3× the audit zoom) with every emitted vertex marked red: the vertices are far
denser than the stroke width and the rings are smooth through the whole bundle.

---

## 3. Numbers

All from the 109 emitted paths of the reproduced cell (3,559 points, 3,341
interior vertices, 1,134.4 mm of ink), device-mm space, audit framing
= 7.4839 CSS px/mm = **14.968 device px/mm**, pen 0.30 mm.

### 3.1 The stated 8° bar — MET, with room, and it is the wrong instrument

| metric | value | bar | verdict |
|---|---|---|---|
| max exterior turn per vertex | **7.579°** | ≤ 8° | PASS (0 of 3,341 above 8°) |
| max turn accumulated inside ONE device pixel | **7.6°** | — | PASS |
| min circumradius of any consecutive triple | **1.3609 mm** (= 20.4 device px) | — | no corner exists |
| vertices with circumradius < 0.5 mm | **0** | — | — |
| median emitted vertex spacing | **0.237 mm** (3.55 device px) | ≤ pen 0.30 mm | PASS |
| vertex spacing at the tightest bends | 0.16 – 0.29 mm | ≤ pen | PASS |
| polygon sagitta at the tightest bend | 0.003 mm = **0.04 device px** | — | invisible |

The tightest bend in the whole picture has a radius of 1.36 mm — 20 device pixels
in the shot. A 20-pixel-radius U-turn is a smooth arc. Refining it further is a
no-op the eye cannot resolve.

### 3.2 The real defect — ink separation, RED today

| metric | value |
|---|---|
| pen width the renderer strokes with | **0.30 mm** |
| ink drawn within **0.15 mm** (½ pen) of other ink | **124.8 / 1134.4 mm = 11.0 %** |
| ink drawn within **0.30 mm** (1 pen) of other ink | **226.7 mm = 20.0 %** |
| ink drawn within **0.60 mm** (2 pen) of other ink | **491.3 mm = 43.3 %** |
| min distance between two DISTINCT emitted paths | **0.00000 mm** |
| vertex pairs on distinct paths within 0.02 mm | **91** |
| tightest same-ring waist (index-distant self-approach) | **0.190 mm**, path #43 verts 96/105, at mm(123.09, 109.07) |
| merged-ink blobs (≥ 75 % of a 1.00 mm window inked) | **40 blobs, 4.39 % of ink pixels** |
| largest merged blob | **4.41 × 3.01 mm at mm(122.4, 105.7)** — the LEFT eye |
| 2nd / 3rd | 6.48 × 9.62 mm at mm(164.7, 103.8); **3.14 × 2.27 mm at mm(156.9, 105.6)** — the RIGHT eye |

Crowded ink, clustered on a 2 mm grid, ranks the two saddles first and second:
`mm(156.2, 106.2)` 10.64 mm and `mm(122.3, 105.9)` 9.63 mm. Those are the two
places the user's picture shows a point.

---

## 4. Mechanism, with citations

The slicing scalar is `d = v·N` and the levels are **uniform in `d`**:

```
src/core/algorithms/scene3d.js:167-169
  const VEPS = Math.max(1e-9, span * 1e-7);
  for (let level = 1; level <= count; level++) {
    let z = minD + (level / (count + 1)) * span;
```

A torus's height function has exactly four critical points: a max, a min, and
**two saddles at the inner equator** (front and back). Those two saddles project
to the two "eyes" of the hole — the "inner hole's near/far cusp" in the user's
own words. Near a saddle the level sets are hyperbolic and their **spacing on
the surface collapses to zero**, because the gradient of `d` restricted to the
surface vanishes there. Uniform levels in `d` therefore always crowd at a
critical point. This is not a bug in the cut; it is what evenly spaced contours
do, and it is why every contour map thins its lines near a col.

With a 0.30 mm pen, arcs that are 0.19 mm apart are one mark. The bundle becomes
a filled wedge; the wedge tapers; the tip is the "angled point".

Everything else in the chain is clean:

- **Refinement converged.** `SLICE_REFINE_MAX_ANGLE_DEG = 8` / `MAX_ROUNDS = 8`
  (`scene3d.js:256-257`); `refineSliceRing` (`scene3d.js:539-591`) subdivides
  until the ring's max turn is ≤ 8°, re-snapping every point onto the analytic
  torus each round. Measured output max is 7.579°, i.e. the loop exited on the
  angle test, not on the round cap, for every emitted ring.
- **Clipping introduces no kink.** `clipper.clipPath` (`scene3d.js:3930`) emits
  each visible run as its OWN path (`emitRuns`), so a clip boundary is always a
  path END, never an interior vertex. Consistent with the measurement: the max
  interior turn over every vertex of every emitted path is 7.579°.
- **Density is already at pen resolution.** Median spacing 0.237 mm against a
  0.30 mm pen.

### Hypotheses in the brief — verdicts

| # | hypothesis | verdict | proof |
|---|---|---|---|
| (i) | HLR clip-boundary kink between two visible runs | **REFUTED** | runs are separate paths; max interior turn 7.579° everywhere |
| (ii) | real analytic geometry near the saddle | **TRUE but not as a corner** | tightest drawn apex r = 1.36 mm = 20 device px; at hairline the region is smooth (evidence 2) |
| (iii) | insufficient sample density near high curvature | **REFUTED** | spacing 0.16–0.29 mm ≤ pen; sagitta 0.04 device px |
| (iv) | **contour crowding vs. a finite pen at the two saddles** | **CONFIRMED — this is it** | §3.2, evidence 1 vs 2 |

---

## 5. The oracle, stated honestly

Two separate oracles. Only the second can go RED, and only the second describes
what the user sees.

### O1 — tessellation fidelity (already GREEN; keep as a permanent guard, do not chase)

For every emitted `contourSlice` path on the torus at the audit camera:

- max exterior turn per vertex ≤ 8° — today **7.579°**;
- max turn accumulated inside one device pixel of the audit framing ≤ 10° —
  today **7.6°**;
- emitted vertex spacing ≤ pen width wherever the local circumradius is
  < 5 mm — today 0.16–0.29 mm vs a 0.30 mm pen.

**This is how O1 tells a tessellation angle from an analytic one**, which the
brief asked for: a tessellation corner is a large per-vertex turn with a chord
*longer* than the local curvature radius would justify (sagitta above one
device pixel); an analytic corner is a *small* per-vertex turn with a *small
circumradius*. O1 measures both terms, so a ring cannot pass it by being
under-sampled and cannot fail it for being genuinely tight. Today the torus
passes on both terms, which is why 0(b) moved this number by zero.

### O2 — ink separation (the RED oracle; write the RGR test against this)

With `w` = the record's pen width (0.30 mm here):

| # | assertion | today | verdict |
|---|---|---|---|
| a | no ink drawn within **0.5 w** of other ink (different path, or the same path ≥ 6 vertices away) | 124.8 mm, **11.0 %** of ink | **RED** |
| b | ink within **1 w** of other ink ≤ 5 % of total ink | **20.0 %** | **RED** |
| c | same-ring waist ≥ 1 w | **0.190 mm** at mm(123.09, 109.07) | **RED** |
| d | no merged-ink blob (≥ 75 % of a 1 mm window inked) wider than 3 w ≈ 0.9 mm | largest **4.41 × 3.01 mm** | **RED** |
| e | number of merged-ink blobs | **40** | **RED** |

Suggested acceptance for the fix: (a) → 0 mm, (b) ≤ 5 %, (c) ≥ 0.8 w,
(d) ≤ 1.5 mm, (e) ≤ 5 — **with total emitted ink down no more than ~20 %** and
the ring/plane count unchanged.

`probes/measure-crowded-ink.js` and `probes/measure-merged-ink-blobs.js` compute
(a)/(b) and (d)/(e) from `scenePaths` alone, deterministically, with no debug
hook — they can be lifted into `tests/unit/scene3d-contour-slice.test.js`
against the existing `sceneFor`/`frontFillsOf` harness.

### A note the user is owed

The bar in `STILL-OPEN.md` — "no corner > 8°" — **is already satisfied and
cannot fail**, because refinement drives the ring below 8° by construction
(`scene3d.js:539-591`). If the bar is left as written, item 0(a) can be closed
today with no change, and the picture will still have points in it. The bar has
to be restated as O2 before the item means anything.

---

## 6. Ranked fixes (files allowed: `scene3d.js` slices code + `mappers.js`)

`mappers.js` has no `contourSlice` / `buildSliceSegments` code (re-verified —
zero matches), so every candidate below lands in `scene3d.js` only.

### Rank 1 — pen-aware crowding cull on the emitted slice runs *(recommended)*

**Where:** the `contourSlice` emit loop, `scene3d.js:3910-3941`
(`byPlane.forEach` → `projectPath` → `clipper.clipPath` → `emitRuns`).

**What:** keep a per-record occupancy grid in device-mm at pen resolution, filled
by the samples of already-emitted slice ink for that record. Walk each new run's
samples; suppress a sample whose nearest already-inked sample is closer than
`k·penWidth`; split the run at each suppression boundary; apply the existing
`MIN_RUN_MM` floor to the fragments. **Never cull a whole level** — if every run
of a ring is suppressed, keep its longest run.

**Why this one:** it attacks the measured cause directly (a/b/c/d/e all move), it
is local to the emit loop, it does not touch the cut, the refinement, the
projection or `hlr.js`, and it needs no new math.

**Determinism:** emission is plane-ascending — the ordering guarantee is already
documented at `scene3d.js:3803`. The cull is therefore a pure function of the
plane order.

**`penWidth` is already in scope** at the slice pass: `penWidth = finite(bounds.penWidth, 0.3)`
(`scene3d.js:1115`), used at `:3442`, `:3581`, `:3997`, i.e. on both sides of the
slice pass. The pen-aware-floor precedent in this same file is
`minMarkMM: Math.max(MIN_RUN_MM, 2 * penWidth)` (`scene3d.js:2282`); the
run-splitting precedent is `chainedFloorSurvivors` (`scene3d.js:2341-2440`).

**Tuning:** `k ≈ 0.6–0.7` removes the fused band (the 11.0 % / 124.8 mm at
½ pen) and leaves the readable crowding intact. Start there and measure; do not
start at 1.0.

**Scope decision (measure, then choose):** scoping the cull to
`smoothSurface && analyticProject` — the same scoping 0(b) used at
`scene3d.js:3881` — keeps every faceted primitive byte-identical and limits the
blast radius to sphere/torus/cylinder/cone. The same defect exists at a sphere's
poles, so the wider scope is defensible; take it only with a sphere evidence
cell that shows it improving.

### Rank 2 — same-ring waist trim *(cheap, partial, safe)*

For each linked ring, find index-distant self-approaches below `penWidth`
(`probes/measure-curvature-and-separation.js` §2 is the detector) and split or
trim the ring there. This removes the wedge **tip** itself — the exact pixel the
user circled — and touches nothing else. It does NOT fix adjacent-level merging,
which is 155 mm of the 226.7 mm. Good as a first commit if Rank 1 proves risky;
not sufficient on its own for O2(b).

### Rank 3 — level warping (equal contour spacing instead of equal `d` spacing)

The textbook cure for contour crowding: place levels so contours are evenly
spaced **on the surface** rather than evenly spaced in `d`. Best-looking result
by far, and it removes the cause rather than the symptom. It also changes what
`sliceCount` means, moves every level position, and breaks the plane-count /
level-position guards. **File as its own W-id. Do not attempt it inside this
unit.**

### Rank 4 — DO NOT DO

- Adaptive resampling by curvature — measured no-op (§3.1).
- Clip-aware endpoint smoothing — there is no clip-boundary kink (§4, (i)).
- Raising or lowering `SLICE_REFINE_MAX_ANGLE_DEG` (`scene3d.js:256`) — moves a
  number nobody can see.
- Any edit to `hlr.js`, `MIN_RUN_MM`, `COLLINEAR_EPS`, `SLICE_SAMPLE_STEP`,
  `SLICE_CLIP_WORK`. Out of lane and irrelevant to the measured cause.

### Carried-forward, still open, still cheap

The "fan of spikes" degenerate stub from the 0/W-29 plan §1.2 (a 3-point,
0.004 mm ring at plane 5 inflated to 513 points with a 180° fold by
`refineSliceRing`) is **still unfixed** and is a one-line bail in
`refineSliceRing`. It is invisible at 0.004 mm, so it is not 0(a) — but it is in
the same function an implementer will already have open.

---

## 7. Guards, evidence, stop conditions

**Guard suites** (all green at `767bed54`; re-run all five, and re-pin nothing
without proof in the commit body):

| suite | count |
|---|---|
| `tests/unit/scene3d-contour-slice.test.js` (incl. plane-count purity `:204-306`, W-29 topology, W-27c iteration-2 Newton/oracle) | 42 |
| `tests/unit/scene3d-mesh-self-occlusion.test.js` | 5 |
| `tests/unit/scene3d-curves.test.js` | 13 |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | 6 |
| `tests/unit/scene3d-hlr.test.js` | 11 |

**Plane-count purity is the hard invariant.** The cull removes ink; it must not
remove a level. Assert plane counts 2/12/26/120 unchanged AND ring count per
plane unchanged, in the same test that asserts O2.

**Evidence cells** — re-shoot from the worktree, output into main's gallery:

```
node scripts/audit/scene3d-capture.js --tier A --root <worktree> --port <port> \
  --only '^torus__contourSlice__ladder__(med|max)__a$' \
  --out docs/3d-audit/fill-audit/after/W-27c-0a
```

plus controls in the same run:
`^sphere__contourSlice__ladder__med__a$` (the same defect at the poles — must
improve or be explained) and `^solid__contourSlice__ladder__med__a$` (faceted;
must be **byte-identical** if the fix is scoped to `smoothSurface`).
Write `after/W-27c-0a/report.json`, declare every byte-identical pair with a
reason, and LOOK at the PNGs — the left saddle at
`crop 400x260+280+740` of the reproduced frame is the region to inspect.

**Stop conditions — report the measurement, do not fudge:**

1. If O2 cannot be met without deleting a whole level, or without moving a plane
   count → STOP and report.
2. If meeting O2 costs more than ~20 % of total emitted ink, or makes any ring
   disappear from an evidence cell → STOP and report.
3. If the fix requires editing `hlr.js`, or widening `SLICE_REFINE_MAX_ANGLE_DEG`,
   or loosening any existing tolerance → STOP; that is out of lane.
4. Never re-pin a fingerprint or widen a guard tolerance to make the cull pass.
5. Do not chase 7.579°. It is correct, it is met, and it is not the defect.
6. `mappers.js` is shared with the W-25b implementer in this same worktree —
   this unit does not need it. Do not touch it.

---

## 8. Reproduction recipe

```bash
SP=…/scratchpad
mkdir -p $SP/fad-0a
git -C .claude/worktrees/fill-audit-d archive HEAD | tar -x -C $SP/fad-0a
ln -s <main>/node_modules $SP/fad-0a/node_modules
(cd $SP/fad-0a && node scripts/dev-server.js 8517 &)
node docs/3d-audit/lane-reports/W-27c-0a-evidence/probes/capture-audit-cell.js 8517 $SP/out0a
node docs/3d-audit/lane-reports/W-27c-0a-evidence/probes/measure-curvature-and-separation.js
node docs/3d-audit/lane-reports/W-27c-0a-evidence/probes/measure-crowded-ink.js
node docs/3d-audit/lane-reports/W-27c-0a-evidence/probes/measure-merged-ink-blobs.js
node docs/3d-audit/lane-reports/W-27c-0a-evidence/probes/render-hairline-per-ring-colour.js 8517 $SP/out4
```

The probes read `$SP/out0a/capture.json`; edit the hard-coded scratch path at the
top of each if your scratchpad differs.
