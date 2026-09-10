STATUS: PLAN-READY

# W-34 — "There are some angles in this curved shape that should not be there" (planner report)

Unit: **W-34** (USER, Jay 2026-09-06, `docs/3d-audit/fill-audit/user-reports/15-w27c-contourslice.png`).
Lane: **fill-audit-d2** (`.claude/worktrees/fill-audit-d2`, branch `3d-scene/fill-audit-d2`, :8481).
Base to land on: **`c6dd6130`** (fill-audit-d2 HEAD, W-27c-0a iteration 4).
Planner worked **read-only** in a scratch `git archive` export at `/private/tmp/claude-501/scratch-W34`
(node_modules symlinked to main). The worktree was never touched — another implementer
(W-27c-0a-4b) is live in it.

**Headline, measured, and it changes the shape of this unit:** the corner Jay is pointing at on the
cone is **exact geometry, faithfully rendered** — the emitted polyline's corner reading matches the
analytic cross-section's to **0.0°** (76.4° vs 76.4°). It is not a tessellation, refinement,
projection or HLR artefact. The **only invented** sharpening in the whole roster is on the
**capsule** (no analytic projector). Separately, the ledger's own **≤ 8° bar is RED today** on cone
(8.088°) and capsule (9.075°), for a different and cheap-to-fix reason: the 8° gate is enforced in
**world space** while the user sees **device space**.

---

## 0. Rig used for every number below

Everything is the **audit-gallery rig**, reproduced in the unit runtime
(`tests/helpers/load-vectura-runtime`), matching `scripts/audit/scene3d-capture.js:196-263`:

- object params = `Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS[<primitive>]` (cone `sx18 sy22 sz18 detail16`;
  ellipsoid `sx26 sy18 sz20 detail16`; sphere `r20 detail16`; cylinder `sx16 sy22 sz16`;
  torus `sx30 sy22 sz22`; capsule `sx14 sy24 sz14`), identity transform, `visibility:'solid'`
- camera **a** = `Params.DEFAULT_CAMERA` (ortho, yaw −30, pitch 20, dist 620, focal 520, zoom 1);
  camera **b** = same with yaw 40, pitch −15
- style = `{ mapper:'contourSlice', params:{ fillAngle:45, fillDensity:50, toneLaw:'ladder' } }`
  → **`sliceCount` is absent, so it defaults to 26** (`scene3d.js:4352`), and `fillDensity` does not
  reach the slice pass at all (this is why the manifest's `med` and `max` cells are byte-identical —
  already noted in `W-27c-0a-impl-4.md` §6)
- bounds `{width:320,height:220,m:20,dW:280,dH:180,penWidth:0.3}`; `ground/backdrop` off; one sun
- measurements are on the **emitted `sceneFill` paths** (`algo.generate(...)` output) — i.e. the
  polyline that is actually stroked, post-refinement, post-projection, post-HLR-clip.

`fillCurves` is **not** in that style table, so `Engine._applySceneCurveFinish` is inert for the
gallery. That turns out not to matter — see §2.4.

---

## 1. Which corners, and where — numerically

### 1.1 The picture

`user-reports/15-w27c-contourslice.png` is a 1200×820 before/after montage of the three W-27c
after-cells (`after/W-27c/shots/A/{ellipsoid,cylinder,cone}__contourSlice__ladder__med__a.webp`,
native 765×580 / 506×811 / 565×738). Looked at all three at native resolution, plus 4×/8× Pillow
crops of the cone apex `(190,0)-(390,180)` and the ellipsoid upper-left `(0,60)-(220,340)`:

- **cone, top two visible rings** — sharp inverted-V chevrons with a visibly pointed tip, sitting
  inside otherwise-smooth nested arcs. **This is what Jay is pointing at.**
- **ellipsoid** — smooth nested ellipses throughout; the only irregularities are the *ends* of the
  clipped rings on the left silhouette (short stair-steps). That is **W-35**, not W-34.
- **cylinder** — every slice ring is a pair of exactly straight vertical lines (a plane parallel to a
  cylinder's axis cuts a rectangle). Correct, no corners.

The slice planes are **world z = const** (`sliceRotate/sliceTilt` default 0 ⇒ normal `(0,0,1)`,
`scene3d.js:110-116`). So on a cone they are planes **parallel to the axis**: each cross-section is a
**hyperbola**, whose vertex sits nearest the apex — a downward-opening arc with a tip, exactly the
shape in the picture. On the ellipsoid they are ellipses; on the cylinder, rectangles.

### 1.2 Two metrics, both open-polyline-aware

Every emitted contourSlice path is treated as **open unless `first ≈ last` within 1e-6**; an open
run's two endpoints have **no** turn and are **never** wrapped. (Wrapping an open run is exactly the
error that produced the withdrawn 39.8° figure — `W-27c-review-2.md` §"Item (b)".)

**M1 — per-vertex exterior turn (the existing instrument).** The same metric the code already uses
(`sliceRingMaxTurn`, `scene3d.js:669-683`) and that the torus guard at
`tests/unit/scene3d-contour-slice.test.js:1282-1301` already applies **in device space**. Bar: **≤ 8°**
(the ledger's bar).

**M2 — turn over a fixed arc (new; the metric that actually sees a "corner").** M1 cannot see a
corner on a densely-refined polyline: 200 vertices each turning 7° still make a visible point. M2 is
sampling-independent: resample the run by arc length at `h = 0.05 mm`, then at each sample take the
angle between the chord arriving over `W/2` and the chord leaving over `W/2`. For a circular arc of
radius `R` this is exactly `W/R` radians, regardless of the source point spacing. **`W = 1.0 mm`**
(≈ 3.3 pen widths at the gallery's 0.3 mm pen). Same open-awareness.

*(The naïve "sum the per-vertex turns inside a 1 mm window" variant is NOT usable and must not be
shipped: it over-counts by up to one chord length, which on a 121-point ring inflated the ellipsoid
from 9.1° to 24.4°. Measured directly. Use the resampled chord form.)*

### 1.3 The roster, camera a, sliceCount 26 (measured in the scratch export at `c6dd6130`)

| primitive | paths | **M1** max/vertex | **M2** max turn per 1 mm | where the M2 max is | analytic truth (M2) |
|---|---|---|---|---|---|
| sphere | 26 | 7.223° | 7.3° | path 16 @ (162.42, 96.53) | 5.7° |
| ellipsoid | 27 | 7.489° | 9.1° | path 20 @ (154.45, 99.23) | 6.7° |
| **cone** | 22 | **8.088°** (path 21, vertex 7 @ 149.96,132.48) | **76.4°** | **path 9 @ (159.61, 91.05)** — the near-apex ring | **76.4°** |
| cylinder | 26 | 0° | 0° | — (every ring is a 2-point straight line) | 0° |
| torus | 44 | 7.579° | 20.4° | paths 6 and 7 — the two saddle cusps | (real lemniscate crossing) |
| **capsule** | 28 | **9.075°** (path 27, vertex 199 @ 157.03,126.86) | **32.4°** | path 27 (closed); also 31.8 / 23.4 / 21.1 / 20.9 | **not computed — the open question, see §4 Fix B** |

Camera **b** (yaw 40 / pitch −15): cone **86.5°**, capsule **34.2°**, torus 17.4°, ellipsoid 10.6°.
The defect is worse at camera b on the cone, so it is not a one-pose artefact.

Only the cone and the capsule exceed **20°/mm**. The cone's over-bar rings are exactly three:

| emitted path | M2 | matching plane | \|z0\| (mm) | **analytic truth** | Δ |
|---|---|---|---|---|---|
| 9 | 76.4° | 13 / 14 | 0.667 | **76.4°** | **0.0°** |
| 10 | 38.4° | 12 / 15 | 2.000 | **38.3°** | **+0.1°** |
| 11 | 24.9° | 11 / 16 | 3.333 | **24.8°** | **+0.1°** |

### 1.4 The analytic ground truth (how it was built)

For the cone, the exact cross-section at `z = z0` is `x = ±sqrt(r(y)² − z0²)` with
`r(y) = sx·(0.5 − y/(2·sy))` — the same surface equation `sliceSurfaceFG` uses
(`scene3d.js:534-544`). It was sampled at 20 001 points per branch (parameter cubed toward the
vertex so the tip is finely resolved), assembled base(−x) → vertex → base(+x), projected through the
**real** `Scene3D.Scene.projectWorldPoint` with the same camera and bounds, and run through the
**same** M2. Ellipsoid/sphere truth = the exact ellipse/circle at each plane, same treatment.

**Result: the cone's drawn corner is the true curve.** The vertex's radius of curvature at the
worst plane is `|z0|·sx/(2·sy) = 0.667 × 18/44 = 0.273 mm` — **0.91 pen widths**. A cross-section of
a cone taken 0.667 mm from its (singular) apex genuinely has a sub-pen-width vertex, and the
renderer is drawing it to within 0.1°.

Truth ladder for the cone (M2 per plane): 5.2, 5.7, 6.2, 6.8, 7.6, 8.7, 10.0, 11.7, 14.3, 18.1,
24.8, 38.3, **76.4, 76.4**, 38.3, 24.8, 18.1, 14.3, 11.7, 10.0, 8.7, 7.6, 6.8, 6.2, 5.7, 5.2.

---

## 2. Root cause, per corner class, with file:line

### 2.1 Cone near-apex chevrons — **REAL GEOMETRY under uniform-in-depth slicing** (not a bug)

`buildSliceSegments` places level `L` at `z = minD + (L/(count+1))·span`
(`scene3d.js:158`, nudged only off coincident vertices at `:161-168`). With `count = 26` and the
cone's `z ∈ [−18, +18]`, levels 13 and 14 land at `z = ∓0.667 mm` — **0.667 mm from the cone's own
apex axis**. A plane through the apex cuts a degenerate *triangle* (a real corner); a plane 0.667 mm
off it cuts a hyperbola whose vertex radius is 0.273 mm. Refinement (`refineSliceRing`,
`scene3d.js:735-785`) and the Newton projector (`sliceAnalyticProjectLocal`, `:587-651`) reproduce
that curve to 0.1°, which is correct behaviour.

**Nothing in the refinement/projection/clip chain is at fault.** Verified individually:

- `refineSliceRing` **converges, it does not run out of rounds**: raising
  `SLICE_REFINE_MAX_ROUNDS` 8 → 14 (`scene3d.js:249`) leaves every number **byte-identical**.
- `hlr.js clipPath` (`:428-482`) only **inserts** samples along each input segment and decimates with
  `dropCollinearSamples` at `COLLINEAR_EPS = 1e-6` (`hlr.js:66,276-288`) — it cannot coarsen a
  refined ring or invent a vertex.
- `buildSliceSegments`/`linkSegments` linking is not implicated: the over-bar rings are single
  continuous runs of 287–521 points.

Consequence: **the only lever that can remove this corner is to stop putting a slice plane that
close to the apex.** That is a product change (§4 Fix C), not a rendering fix.

### 2.2 The ledger's ≤ 8° bar is RED today — **the gate is enforced in the wrong space**

`refineSliceRing`'s adaptive stop condition is `sliceRingMaxTurn(base, closed) > maxAngle`
(`scene3d.js:776`) evaluated on the **WORLD-space** ring, before `projectPath`
(`scene3d.js:4454-4463`). The camera's orthographic foreshortening then **amplifies** the turn on
any ring whose cutting plane is oblique to the view. Measured device-space M1:

- cone **8.088°**, capsule **9.075°** — both over the 8° bar
- sphere 7.223°, ellipsoid 7.489°, torus 7.579°, cylinder 0° — under it, with little margin

`sliceRingMaxTurn` itself is already correctly open-aware (`scene3d.js:672-674`, `lo = closed ? 0 : 1`).
The bug is the **space**, not the metric. This is also why the two historic cone-apex numbers were
both "right": 7.09° (`W-27c-impl-2.md`) is the **world-space** per-vertex max at the reviewer's
`sx20/sy24/sz20/detail18/sliceCount22` rig, and 39.8° was a wrapped-open-ring artefact, since
withdrawn (`W-27c-review-2.md`). Neither measured what the eye sees.

### 2.3 Capsule — the only **invented** sharpening in the roster

`sliceSurfaceFG` (`scene3d.js:519-556`) implements closed forms for `sphere` (also used for
ellipsoid), `cylinder`, `cone`, `torus` and returns `null` otherwise. `capsule` is in
`TOPOFORM_MODES` (`scene3d.js:1342-1345`) and is **not** in `SLICE_SMOOTH_EXCLUDED`
(`scene3d.js:654`), so it is refined — but with `analyticProject = null`, i.e. **Catmull-Rom only**,
interpolating mesh-chord points that sit strictly *inside* the true surface (the file's own W-27b
comment, `scene3d.js:230-247`, says exactly this). Its M2 is 32.4° (cam a) / 34.2° (cam b) and its
M1 is the roster's worst at 9.075°. **This is the one place a fix can move the picture without a
product decision** — but the capsule's cross-section also has a genuine curvature discontinuity at
the cap/barrel seam, so how much of the 32.4° is invented is **unmeasured**; see §4 Fix B.

### 2.4 Not causes (each checked, so the implementer does not re-litigate them)

- **`fillCurves` / the fitter.** `GeometryUtils.toCurveAnchors` returns **`{straight:true}`** on
  every cone contourSlice ring tested (paths 9/10/11), so `applyCurveFit` returns the input by
  reference: `fillCurves` is **inert on contourSlice output**, on **and** off. It neither causes nor
  hides the corner. (It *is* a rule-2b observation worth filing — see §7.4.)
- **The W-27c-0a crowding cull** (`scene3d.js:335-428, 4485-4510`). It drops whole rings; it never
  edits a ring's shape and cannot create a corner.
- **HLR clip ends.** The over-bar M2 maxima are all **interior** to their runs, ≥ 20 mm of arc from
  either endpoint. The clip ends are W-35's stair-steps, a different defect.
- **`_applySceneCurveFinish`** (`engine.js:2865`): gated on `CURVED_FILL_PRIMITIVES` **and**
  `sp.fillCurves === true`; the gallery style table never writes the key, so it is a no-op there.

---

## 3. RED oracle

New file: **`tests/unit/scene3d-contour-slice-corners.test.js`** (new file, not an edit of the
51-test guard file — keeps the blast radius auditable).

### 3.1 Helpers to ship in the file

```
turnDeg(a,b,c)                       // 2-D exterior turn, degrees
maxVertexTurnOpenAware(pts)          // M1: closed IFF |first-last| < 1e-6; open ⇒ i in [1, n-2],
                                     //     NEVER wraps; closed ⇒ drop the repeated last point first
resampleByArc(pts, h = 0.05)         // arc-uniform resample
turnOverArc(pts, W = 1.0, h = 0.05)  // M2: k = round((W/2)/h); angle(P[i]-P[i-k], P[i+k]-P[i]);
                                     //     open ⇒ i in [k, m-1-k]; closed ⇒ wrap the ring only
```

### 3.2 The blocking assertions

**T1 (M1, roster-wide, RED today).** For each of sphere / ellipsoid / cone / cylinder / torus /
capsule at the §0 rig, camera a **and** camera b: every emitted `sceneFill` path's
`maxVertexTurnOpenAware ≤ 8`.
RED at `c6dd6130`: **cone 8.0882°**, **capsule 9.0750°** (cam a). Everything else passes.
This is the ledger's own bar, measured for the first time in the space the user sees.

**T2 (M2, roster-wide, scoped honestly).** For each primitive, `turnOverArc(path, 1.0) ≤ 20°`
**except** where the analytic cross-section itself exceeds 20° at that plane. Today:
sphere 7.3 ✓, ellipsoid 9.1 ✓, cylinder 0 ✓, torus 20.4 (real saddle crossing — exempt, and
already owned by W-27c item 0(a)), cone 76.4 / 38.4 / 24.9 (**truth 76.4 / 38.3 / 24.8** — exempt as
true geometry unless Fix C lands), **capsule 32.4 / 31.8 / 23.4 / 21.1 / 20.9 (no truth computed —
this is what T3 must settle)**.

**T3 (the capsule truth oracle — the RED that a fix can actually turn green).** Build the exact
capsule cross-section at each plane from the same closed form the mesh uses
(`charts.js topoCapsule`, `:167-180`: `r = min(sx,sz)`, `half = max(r,sy)`, `cylHalf = half − r`;
implicit `F = x²+z² − r²` for `|y| ≤ cylHalf`, else `x²+z²+(|y|−cylHalf)² − r²`), project it with
`Scene.projectWorldPoint` under the same camera/bounds, and require the **emitted** M2 to be within
**+15%** of the truth's M2 at the same plane — the same "faithful, not invented" contract the cone
already satisfies at +0.0%. RED today if and only if the capsule's excess is real; the implementer
**must print both numbers and let the measurement decide**, and if the excess turns out to be < 15%
the honest outcome is to say so and drop Fix B (see §8).

**T4 (guard against the fix's own failure mode).** The refinement must not be allowed to buy the
angle with unbounded subdivision: assert `SLICE_REFINE_MAX_ROUNDS` is unchanged at 8 **and** that
total emitted point count for sphere/ellipsoid/cone/torus/capsule stays under 2× its pre-fix value.
(Measured pre-fix totals, cam a: sphere 2028, ellipsoid 1888, cone 4112, torus 3295, capsule 6277.)

### 3.3 Mutation check (required before the unit is accepted)

1. Force `refineSliceRing`'s `analyticProject` to the identity (`(pt) => pt`) — T3 and T2 must fail
   on ellipsoid/cone (they measure the analytic snap).
2. Replace `maxVertexTurnOpenAware`'s open branch with the wrapped `% n` form — the metric must
   report a phantom corner (≥ 40°) on the cone's near-apex ring, proving the open-awareness is load
   bearing and reproducing, on demand, the withdrawn 39.8°.
3. Set `SLICE_REFINE_MAX_ANGLE_DEG` to 30 (`scene3d.js:248`) — T1 must fail on every curved
   primitive.

---

## 4. Ranked fixes

### Fix A — **measure the refinement's stop condition in DEVICE space** (Rank 1, land it)

Closes §2.2 and the ledger's ≤ 8° bar honestly. **Prototyped and fully measured in the scratch
export; 7 lines.**

`scene3d.js:735-785 refineSliceRing` — accept `opts.project`:
```js
const proj2 = typeof opts.project === 'function' ? opts.project : null;
const measure = (pts) => sliceRingMaxTurn(proj2 ? pts.map((q) => proj2(q) || q) : pts, closed);
while (round < maxRounds && measure(base) > maxAngle) { ... }
```
`scene3d.js:4448-4453 linkPlane` — supply it from the pass's own camera:
```js
const projFn = (pt) => { const P2 = scene.projectWorld(pt);
  return (P2 && Number.isFinite(P2.x) && Number.isFinite(P2.y)) ? { x: P2.x, y: P2.y, z: 0 } : null; };
return smoothSurface
  ? rings.map((ring) => refineSliceRing(ring, analyticProject
      ? { analyticProject, project: projFn } : { project: projFn }))
  : rings;
```
Subdivision and the Newton snap stay in **world** space (unchanged); only the *stop condition* moves
to the space the pen draws in.

**Measured effect (M1, cam a):** cone **8.088 → 7.850**, capsule **9.075 → 7.928**,
sphere 7.223 → 7.966, ellipsoid 7.489 → 7.965, torus **7.579 → 7.579 (unchanged)**, cylinder 0 → 0.
**All six under 8.** (Sphere/ellipsoid move because the gate now sees the whole *pre-clip* ring,
whose device turn exceeds 8 even where the post-clip visible remnant did not.)

**Measured effect on M2:** cone **unchanged at 76.4** (it is true geometry — Fix A cannot and should
not move it), torus unchanged 20.4, ellipsoid unchanged 9.1, sphere 7.3 → 7.9,
capsule 32.4 → 32.5. **Fix A alone does not answer Jay's picture.** It is the honest close of the
stated bar and the prerequisite for anything else; ship it with that framing, not as the answer.

**Guards, run in the scratch export with Fix A applied — `tests/unit/scene3d-contour-slice.test.js`
passes 51/51.** What moves, for the mandatory `## Bars changed` disclosure (nothing needs re-pinning
— every value stays inside its existing bar, and every move is an improvement):

| metric | at `c6dd6130` | with Fix A | bar | verdict |
|---|---|---|---|---|
| torus pathCount / totalInk / waist / largestW / blobCount / pct05 / pct1 | 44 / 897.1044413969058 / 0.03878612131638042 / 3.35 / 21 / 2.400237 / 8.388889 | **byte-identical, all seven** | — | untouched |
| torus front-ring fragment count (0(b) ceiling) | ≤ 55 | **still passes** | `≤ 55` — **MUST NOT MOVE** | untouched |
| torus micro-gap oracle | 1 | 1 | `≤ 1` | untouched |
| ink-band retained | 96.203% | 96.160% | `> 90%` | ok |
| half-retention (top/bottom) | 96.504 / 95.794 | 96.504 / 95.794 | `≥ 85%` | untouched |
| sphere pct05 | 3.558% | **3.042%** | `< 4` | improves |
| sphere pct1 | 12.454% | **12.307%** | `< 13.5` | improves |
| sphere blobCount | 44 | **43** | `≤ 49` | improves |
| sphere waist / largestW | 0.08225346440129311 / 34.5 | **identical** | floors/ceilings | untouched |
| W-27c ellipsoid rotated-transform accuracy (`newMethod.maxDev`) | 9.8e-10 mm, bar `< 0.15` | untouched (test drives `Slices.analyticProjectLocal` directly, no `project` option) | `< 0.15` | untouched |
| item (b) placeholder `0 < worst < 45` (test file :1011-1012) | 7.085° | **tighten to `< 8`** | — | see §7.1 |

**Byte-identity set:** `box`, `plane`, `pyramid`, faceted `solid` (all `smoothSurface === false`, so
`linkPlane` never calls `refineSliceRing`), `cylinder` (2-point rings, no interior vertex to
subdivide), **and every non-contourSlice mapper on every primitive** (hatch / crosshatch / contour /
spiral / stipple / wireframe / none — the diff is inside the contourSlice block only). Confirm with
`md5` of `algo.generate()` output, pre vs post, exactly as `W-27c-0a-review-4.md` §8 did — **and
this time include cone and cylinder in the sweep**, which that review flagged as the undisclosed gap.

**Predicted ink:** torus unchanged; sphere/ellipsoid/cone/capsule ink changes by well under 1% (point
counts grow, geometry does not). Print the totals.

### Fix B — **give `capsule` a closed form in `sliceSurfaceFG`** (Rank 2, land it *if* T3 is RED)

`scene3d.js:519-556`, one branch, mirroring `charts.js topoCapsule` exactly:
```js
if (mode === 'capsule') {
  const r = Math.max(1, Math.min(sizes.sx, sizes.sz));
  const half = Math.max(r, sizes.sy);
  const cylHalf = Math.max(0, half - r);
  const ay = Math.abs(p.y);
  if (ay <= cylHalf) return { F: p.x*p.x + p.z*p.z - r*r, gx: 2*p.x, gy: 0, gz: 2*p.z };
  const dy = (p.y > 0 ? p.y - cylHalf : p.y + cylHalf);
  return { F: p.x*p.x + p.z*p.z + dy*dy - r*r, gx: 2*p.x, gy: 2*dy, gz: 2*p.z };
}
```
This closes the gap the W-27b comment names verbatim (`scene3d.js:245-247`, "Primitives without an
implemented closed form (capsule, superellipsoid, torusKnot) keep the Catmull-Rom-only behaviour")
and is the **only** roster entry where the corner is plausibly invented rather than true.

**Byte-identity:** `sliceSurfaceFG` dispatches on `mode`, so every other primitive is untouched by
construction — sphere, ellipsoid, cone, cylinder, torus, box, plane, pyramid, solid all byte-identical.
Capsule has **no** contourSlice assertion in the existing 51 (confirmed by grep) so no guard moves.
**Predicted:** capsule M2 32.4° → the ellipsoid's class (~9–12°) *if* the excess is invented;
capsule ink rises slightly (a Catmull-Rom ring sits inside the true surface).
**Do not land this on the prediction.** Run T3 first. If the capsule's truth is itself ≈ 30°/mm at the
cap/barrel seam, the excess is small, Fix B buys accuracy but not the picture, and the report must
say so.

### Fix C — **apex-band level warping on the cone** (Rank 3, **NEEDS JAY — do not land unilaterally**)

The *only* way to remove the corner Jay circled. Warp the level parameter in `buildSliceSegments`
(`scene3d.js:158`) through a monotone map that keeps **the plane count exactly** (the pass's
INVARIANT, guarded by five tests at `scene3d-contour-slice.test.js:204-303`) but forbids any level
inside a band `|z − z_apex| < c` around the degenerate plane.

Cost, from the measured truth ladder (§1.4): to hold M2 ≤ 25°/mm needs `c ≥ 3.33 mm = 0.185·sx`
(planes 12–15 of 26 move); ≤ 20°/mm needs `c ≈ 4.2 mm = 0.23·sx` (planes 11–16). **Every cone
contourSlice ring shifts**, so all 6 Tier-A cone cells and all 294 Tier-B cone cells change. It also
needs a general rule for "where is the degenerate band" (cone apex is a *surface singularity*; the
torus's two saddles are Morse-critical points of the height function — the same family the
W-27c-0a header comment already describes at `scene3d.js:255-262`).

This is a **look change to a shipped treatment**, exactly the class of decision W-35 is. Recommend:
measure it, montage it (before/after cone at planes 11–16), and put it to Jay — the same way W-35 is
queued as a product request.

---

## 5. Files

**Allowed**
- `src/core/algorithms/scene3d.js` — **only** the slices block: the constants at `:189-249` and
  `:335-428`, `buildSliceSegments` `:101-186`, `sliceSurfaceFG` `:519-556`,
  `sliceAnalyticProjectLocal` `:587-651`, `sliceRingTurnDeg/MaxTurn/SubdivideOnce` `:656-733`,
  `refineSliceRing` `:735-785`, the `Scene3DNS.Slices` export `:796-802`, and the contourSlice pass
  `:4324-4530`. Nothing else in this 4 600-line file.
- `src/core/scene3d/mappers.js` — in lane, but **no edit is expected**; `mappers.js` is not on the
  contourSlice path (`REGION_MAPPERS` only). Confirm with `git status` and say so in the report, as
  `W-27c-0a-impl-4.md` §5 did.
- `tests/unit/scene3d-contour-slice-corners.test.js` (new) and, for §7.1 only,
  `tests/unit/scene3d-contour-slice.test.js` lines 1011-1012.

**Forbidden**
- `src/core/scene3d/surface-fill.js`, `surface-fill-mono.js` (lanes a / c).
- `src/core/scene3d/hlr.js`, `shadows.js` (lane handoff-c). **Measured: the corner is not an HLR
  artefact** — `clipPath` only inserts samples and decimates at 1e-6 (§2.1/§2.4), and every over-bar
  M2 maximum is ≥ 20 mm of arc from its run's endpoints. If, contrary to this measurement, the
  implementer finds an HLR-clip cause, **stop and report the cross-lane cost** (handoff-c owns
  `hlr.js`; W-27c-0a-4's own residual micro-gap is already parked there) rather than editing it.
- `src/core/geometry-utils.js`, `src/core/engine.js` (§2.4 / §7.4 are observations to file, not to fix here).
- `src/core/scene3d/params.js`, `src/config/context-bar.js` — that is W-35's cross-lane surface.

---

## 6. Evidence cells (verified against the manifests)

Checked `docs/3d-audit/fill-audit/manifest.A.1-1.jsonl` + `manifest.A.1-50.jsonl` +
`manifest.B.[1-5]-5.jsonl` before naming anything. **Tier A** carries
`<primitive>__contourSlice__ladder__{low,med,max}__{a,b}` for **all 12** primitives (72 cells),
including `ellipsoid`, `cone`, `cylinder`, `capsule`. **Tier B** carries contourSlice for
**`cone`, `sphere`, `torus` only** (294 cells each) — *there is no Tier-B ellipsoid, cylinder or
capsule cell*, the same correction `W-27c-impl.md` §7 had to make.

Capture from MAIN against the worktree:
```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-d2 --port 8481 \
  --only '^(cone|capsule|ellipsoid|cylinder|sphere|torus)__contourSlice__ladder__med__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/W-34
```
(12 cells; all confirmed present.) Then `after/W-34/report.json` with the M1/M2 before/after tables.

**Mandatory:** `med` and `max` are byte-identical on this mapper (density does not reach the slice
pass — §0), so do **not** shoot `max` and claim it as a second data point; shoot camera **b** instead,
where the cone is worse (86.5° vs 76.4°). **Crop the cone apex at native resolution** —
`cone__contourSlice__ladder__med__a.webp` is 565×738; the chevrons live in `(190,0)-(390,180)`, and a
whole-cell view hides them. Look at the crop and describe it in the report.

---

## 7. Relationship to the neighbouring items

### 7.1 W-27c item (b) — **settle it and close it**
`W-27c-impl-2.md` recorded 7.09° and `W-27c-review-2.md` withdrew the 39.8° as "measuring the wrong
ring". **Both are now explained and neither is wrong:** 7.09° is the world-space per-vertex max at
the reviewer's rig; 39.8° was an open ring wrapped as closed. The device-space per-vertex max at the
gallery rig is **8.088°**, and the *visible* corner is 76.4°/mm of true geometry. The placeholder
`expect(worst).toBeGreaterThan(0); expect(worst).toBeLessThan(45);`
(`scene3d-contour-slice.test.js:1011-1012`) should be tightened to `toBeLessThanOrEqual(8)` **after
Fix A**, with the world-vs-device distinction written into the test's comment so the next reader does
not re-open the dispute. Item (b)'s *shape* claim ("cone near-apex rings still polygonal") is
**refuted**: they are not polygonal, they are pointed, and correctly so.

### 7.2 W-35 (end-overlap / edge-fidelity parameter) — **disjoint, and it is what the ellipsoid shows**
The stair-steps Jay describes in the same image are at the **ends** of clipped runs; W-34's corners
are all ≥ 20 mm of arc **interior**. Fix A changes point counts on clipped rings, so it will perturb
W-35's before-numbers — **W-34 should land first**, and W-35 should re-baseline against the post-W-34
tree. W-35 stays a product request needing Jay.

### 7.3 W-27c-0a-2 (PLANNING-DEFERRED) — **same root cause, different symptom**
`W-27c-0a-impl-4.md` §8.1 concluded the remaining lever is "level warping — equal contour spacing ON
THE SURFACE instead of equal `d`". **Fix C is that same lever seen from the corner side.** W-34's
measurement adds a precise, primitive-independent criterion the warp can be designed against: *no
slice plane may sit where the cross-section's minimum curvature radius falls below ~1 pen width*
(the cone's worst plane sits at 0.273 mm = 0.91 pen). If Jay approves Fix C, **W-27c-0a-2 and W-34
Fix C should be one unit**, not two — they would otherwise both rewrite `buildSliceSegments`'s level
placement and collide.

### 7.4 New residual to file (out of this lane)
`GeometryUtils.toCurveAnchors` returns `{straight:true}` on every contourSlice ring measured, so
**Fill Curves is inert on contourSlice output** even at the app's `LINE_FINISH_CREATE_DEFAULTS`
(`params.js:187`, `fillCurves:true`). Rule 2b says rounding "should not be turned off by default";
here it is not off, it *declines*. Not the cause of W-34's corner (§2.4) and not in this lane's
files (`geometry-utils.js`). **File it as a new W-id.** Also worth a line in the same filing: the
emitted set contains degenerate stubs — zero-length 2-point paths (sphere path 19, ellipsoid 8 and
19, torus 37, capsule 1/2/4/10/13/19/20) and 3-point sub-millimetre remnants — which is the W-29
family, not W-34.

---

## 8. Stop conditions

Stop and report — do not force a number — if any of these hold:

1. **T3 shows the capsule's excess over analytic truth is < 15%.** Then the capsule corner is real
   too, Fix B is an accuracy improvement with no visual payoff, and the honest outcome is: **the
   whole roster draws its cross-sections faithfully; the corners Jay sees are the geometry of
   uniform-in-depth slicing near a singular point, and the answer is Fix C, which needs Jay.**
2. **Fix A moves any of the six W-27c-0a-4 floors/ceilings out of band, or moves the 0(b) ≤ 55
   ceiling at all.** The prototype says it does not (51/51, §4), but re-measure in the worktree —
   another implementer is committing to this branch. If the ≤ 55 ceiling moves, **revert Fix A and
   report**; that bar was restored from a widened 80 and must not drift again.
3. **You find yourself widening a bar, re-pinning a fingerprint, or raising
   `SLICE_REFINE_MAX_ROUNDS`.** The round cap is *not* the constraint (measured: 8 → 14 changes
   nothing), so raising it would be cargo-culting.
4. **You are tempted to fillet or blunt the cone tip.** It does not work and the arithmetic says so:
   the direction change across the tip (~110°) is intrinsic; a fillet of radius `R` merely spreads it
   over `R·Δθ` of arc, so pushing M2 under 30°/mm needs `R ≳ 1.9 mm` — a blunting that would visibly
   truncate the ring. Any "fix" that lowers M2 on the cone without moving the slice plane is
   deforming the model away from the truth it currently matches to 0.0°, and must be rejected.
5. **You need `hlr.js`.** §2.1/§2.4 say you should not. If you disagree, stop, state the measurement
   that shows an HLR cause, and flag the cross-lane cost to handoff-c.
6. **The worktree is dirty with W-27c-0a-4b's work.** `git -C .claude/worktrees/fill-audit-d2 status
   --short -- . ':!graphify-out'` and `git stash list` first; if the other implementer is mid-unit,
   wait — two implementers never share one worktree.

---

## Appendix — what the planner ran

Scratch export of `c6dd6130` at `/private/tmp/claude-501/scratch-W34` (removed on completion),
`node_modules` symlinked to main, six throwaway vitest probes run **one file at a time in the
foreground**, plus one prototype of Fix A applied to the scratch copy of `scene3d.js` and reverted
(`md5` verified identical to the export before deletion). No worktree was read-modified, nothing was
staged, nothing was committed, nothing was pushed.
