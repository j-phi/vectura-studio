STATUS: PLAN-READY — W-32 PLAN-READY (fix decision escalated) · W-33 PLAN-READY

# W-32 / W-33 — planner report

Two USER items from `docs/3d-audit/fill-audit/user-reports/14-w26-capsule-cone-cylinder-spiral.png`
(read at native resolution, plus 5×/8× Pillow crops of the right silhouette and the top cap):

- **W-32** — *"Some of these lines are breaking out beyond the border."*
  RGR: no ruling endpoint outside the silhouette by more than **0.5 pen = 0.15 mm** (default pen
  `src/config/defaults.js:2625` = 0.3 mm).
- **W-33** — *"I'm observing some non-curved angles here."* Rule 2(b) extended to contour **FILL**
  rulings. Bar **≤ 8°** per-vertex turn in device space (the ledger's bar, as used by W-34).

Lane `fill-audit-a2`. All numbers measured in a scratch export of **`f828d828`** (T1b, v1.3.99);
worktree untouched, nothing staged, nothing committed, nothing pushed.

---

## 0. Rig

The audit-gallery rig reproduced in the unit runtime (`tests/helpers/load-vectura-runtime`), matching
`scripts/audit/scene3d-capture.js:191-263` exactly: `engine.addLayer('scene3d')`, children stripped,
inline object with `Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS[<primitive>]`, identity transform,
`visibility:'solid'`, `ground/backdrop` off, one directional sun (az 135 / el 45), style
`{ mapper, params:{ fillAngle:45, fillDensity:<1|50|220>, toneLaw:'ladder' } }`,
camera **a** = `Params.DEFAULT_CAMERA` (ortho, yaw −30, pitch 20), camera **b** = yaw 40 / pitch −15.
Profile US Letter 279×216 — irrelevant to every number here, because `Scene.buildProjOpts`
(`scene.js:~100`) takes only `camera.zoom` as scale and the page size only as a centre offset. The
gallery's `FIXED_ZOOM = 3.6` is a canvas zoom, not a camera zoom.

**Two instruments, both new, both device space (mm on paper):**

- **Overshoot** — the object's drawn footprint is rasterised at **0.02 mm/cell** from
  `sceneRecord.projected` + `sceneRecord.faceIndexArrays` (the exact projected mesh triangles the
  border pass draws), triangle interiors filled by centre test and every triangle edge rasterised so
  no seam leaks. Overshoot of a point = 0 if inside, else the Euclidean distance to the nearest
  on-cell (ring search, 6 mm cap). A second mask built the same way from the **chart**
  (`SurfaceFill.chartFor(mode,sizes)` pushed through the same `applyTransform`/`projectWorld` the
  emitter used, 200×200 grid → 80 000 triangles) separates "the fill left the surface" from "the
  fill left the polygon".
- **M1** — max per-vertex exterior turn, **open-polyline-aware** (a run is open unless
  `first ≈ last` within 1e-6; an open run's two endpoints have no turn and are never wrapped — the
  error that produced W-34's withdrawn 39.8°). Same definition as `sliceRingMaxTurn`
  (`scene3d.js:669-683`). **M2** (turn over a 1.0 mm arc window, resampled at 0.05 mm) reported as a
  secondary, sampling-independent check, per `W-34-plan.md` §1.2.

---

# PART A — W-32

## A1. First job, as the brief demands: does `scene3d-fill-boundary-ends` measure overshoot?

**No. It is structurally blind to it, and its 41/41 pass says nothing about W-32.**

`tests/unit/scene3d-fill-boundary-ends.test.js:205-210`:

```js
const depth = (x, y) => {
  const gx = Math.round((x - ox) / CELL); const gy = Math.round((y - oy) / CELL);
  if (gx < 0 || gy < 0 || gx >= W || gy >= H) return 0;
  const k = gy * W + gx;
  return on[k] && Number.isFinite(D[k]) ? D[k] * CELL : 0;      // ← off-mask ⇒ 0
};
```

`D` is a geodesic distance transform **inside** the visible-front-surface mask, seeded from its
boundary. A free end that lands *outside* the mask has `on[k] === 0` and scores **0.00 mm** — the
best possible value. The file's own prose says as much: it pins *"a ruling ends ON the boundary, not
one sample short of it"* — it measures **undershoot** (a ruling stopping in open surface), and its
`TOL_MM = 1.0` (`:48`) is calibrated against the 3.43/4.85 mm pyramid crease defect. It also uses a
**0.35 mm raster** (`:45`), an order coarser than W-32's 0.15 mm bar, and its reference is the
**chart**, not the drawn border — so even inverted it could not see this defect. It is a correct test
of a different property. **Do not widen or repurpose it; W-32 needs its own oracle.**

## A2. Numbers today — gallery cells, `fillDensity 50`, both cameras

Max distance of a ruling **endpoint** outside the **drawn mesh footprint**, mm (pens at 0.3 mm), and
how many of the cell's endpoints exceed 0.5 pen:

| cell | cam a mm / pen / over | cam b mm / pen / over | max vs **chart** |
|---|---|---|---|
| capsule · hatch | 0.204 / **0.68** / 8 of 60 | 0.189 / **0.63** / 7 of 70 | 0.000 / 0.019 |
| capsule · contour | 0.233 / **0.78** / 7 of 40 | 0.202 / **0.67** / 7 of 54 | 0.016 / 0.018 |
| capsule · spiral | 0.194 / **0.65** / 6 of 50 | 0.193 / **0.64** / 8 of 56 | 0.000 / 0.000 |
| cone · hatch | 0.310 / **1.03** / 2 of 42 | 0.290 / **0.97** / 8 of 52 | 0.136 / 0.134 |
| cone · contour | 0.199 / **0.66** / 1 of 52 | 0.286 / **0.95** / 9 of 48 | 0.000 / 0.021 |
| cone · spiral | 0.041 / 0.14 / 0 | 0.000 / 0.00 / 0 | 0.092 / 0.072 |
| cylinder · hatch | 0.047 / 0.16 / 0 | 0.062 / 0.21 / 0 | 0.151 / 0.138 |
| cylinder · contour | 0.049 / 0.16 / 0 | 0.063 / 0.21 / 0 | 0.018 / 0.022 |
| cylinder · spiral | 0.000 / 0.00 / 0 | 0.000 / 0.00 / 0 | 0.154 / 0.000 |
| sphere · hatch (control) | 0.285 / **0.95** / 7 of 48 | 0.311 / **1.04** / 10 of 58 | 0.000 / 0.018 |
| sphere · contour (control) | **0.366 / 1.22** / 10 of 36 | 0.319 / **1.06** / 11 of 46 | 0.022 / 0.021 |
| sphere · spiral (control) | 0.316 / **1.05** / 5 of 38 | 0.305 / **1.02** / 5 of 48 | 0.000 / 0.000 |

Where: every offender is at the **left/right silhouette extreme** (capsule x ≈ 125.5 / 152.5–153.5,
sphere x ≈ 119.5–120.9 / 157–159.5) or at the **cone's base rim / lower slant** (y ≈ 128–134 at cam a,
x ≈ 122–129 at cam b). Not at HLR clip ends, not at spiral turns: `cone·spiral` and
`cylinder·spiral` measure **0.00–0.04 mm** while the same primitive's contour is over the bar, and
the sphere/capsule spiral offenders sit at the same silhouette x as their hatch/contour ones.

**LOOKED AT IT.** `after/W-26/shots/A/capsule__contour__ladder__med__a.webp` (447×729), right-edge
crop `(307,255)-(447,473)` at 5×: the vertical border stroke runs down the frame and **every contour
ruling hooks past it**, each ending in a short barb outside the outline. Top crop `(0,0)-(447,204)`
at 3×: the outline is a visibly straight-chorded polygon and the ruling ends make small bumps
crossing it. This is exactly Jay's sentence.

## A3. Root cause — with file:line, and it is not the fill

**The fill walks the analytic chart; the border is the inscribed faceted mesh polygon. Every fill
point that reaches the true silhouette is outside the drawn border by up to the tessellation
sagitta.**

- Fill geometry: `SurfaceFill.buildObject` samples `chartFor(mode,sizes)` — a smooth parametric
  surface — and its end refinement bisects against that same chart's own front test
  (`surface-fill.js:8413-8422`, `EDGE_BISECT = 12`, i.e. 1/4096 of a sample step).
- Border geometry: `scene3d.js:4769` — *"Border emphasis: silhouette + boundary edges only (the
  shape's real outline)"* — collects **mesh** edges classified `silhouette`/`boundary`. The mesh is
  `Scene.buildPrimitiveMesh` at the object's `detail`, so the drawn outline is a chorded polygon
  **inscribed** in the true silhouette.
- The discrepancy is **documented in the source as a deliberate choice**:
  `surface-fill.js:5496-5501` — the ribbon region clip must be *"not the MESH silhouette
  (`extractSilhouette` in geometry3d.js), which is a different discretisation of the same form and
  would be off by the mesh's own facet error."* W-32 is that stated facet error becoming visible.

**Proof, three independent ways.**

1. **Overshoot vs the chart is ~0 everywhere** (right-hand column above; ≤ 0.022 mm at any
   capsule/cone/sphere contour endpoint). The emitter overruns nothing.
2. **The measured overshoot equals the chart-vs-mesh silhouette gap to the digit.** Sampling every
   chart triangle vertex and measuring how far it lies outside the mesh footprint:

   | primitive | chart-outside-mesh max, cam a / b | fill endpoint max, cam a / b |
   |---|---|---|
   | capsule | 0.235 / 0.211 | 0.233 / 0.202 |
   | cone | 0.315 / 0.306 | 0.310 / 0.290 |
   | cylinder | 0.051 / 0.061 | 0.049 / 0.063 |
   | sphere | 0.366 / 0.325 | 0.366 / 0.319 |

3. **It scales as the sagitta `R(1 − cos(π/n))`.** Sweeping `detail` on contour, cam a (max endpoint
   overshoot, mm):

   | detail | 8 | 16 | 24 | 32 | 48 |
   |---|---|---|---|---|---|
   | sphere | 1.330 | 0.368 | 0.145 | 0.093 | 0.046 |
   | capsule | 0.806 | 0.236 | 0.102 | 0.057 | 0.026 |
   | cone | 1.265 | 0.193 | 0.121 | 0.054 | 0.014 |
   | cylinder | 0.257 | 0.066 | 0.000 | 0.015 | 0.000 |

   16 → 32 gives 3.96× / 4.14× / 3.57× — the textbook quadratic. **Fill ink is flat across the sweep**
   (sphere contour 656.4 / 656.1 / 656.0 / 655.9 mm), confirming the fill never moved: only the
   polygon it is being compared against did. **The 0.5-pen bar is met at `detail ≥ 24` on every
   primitive measured.**

**Lane ownership.** `surface-fill.js` = fill-audit-a2 (in lane, but it is *not* where the defect
is). `scene3d.js` border/edge pass (`:4641-4790`) = lane `fill-audit`. `hlr.js` = handoff-c.
`mesh.js` / `charts.js` / `scene.js` = **unassigned in AGENT-PROTOCOL's serialization table — flag
before touching**. `params.js` is shared with U9 (shadow bag only).

## A4. The finding that changes what W-32 *is*

**The audit harness renders every gallery cell at the DESERIALIZATION defaults, not the CREATION
defaults, and that is where most of W-32 comes from.**

`src/core/scene3d/params.js:112-123` states the contract in the source:

> `PRIMITIVE_PARAM_DEFAULTS` above is the DESERIALIZATION contract: it fills the gaps in a bag read
> off disk, **so its numbers must never move**. `PRIMITIVE_CREATE_DEFAULTS` is the CREATION contract:
> the proportions a brand-new object is born with.

| primitive | `PRIMITIVE_PARAM_DEFAULTS` (`:89`, what the gallery shoots) | `PRIMITIVE_CREATE_DEFAULTS` (`:124`, what a user gets) |
|---|---|---|
| sphere | r 20, **detail 16** | r 25, **detail 28** |
| capsule | 14/24/14, **detail 16** | 14/16/14, **detail 22** |
| cone | 18/22/18, **detail 16** | 20/22/20, **detail 24** |
| cylinder | 16/22/16, **detail 16** | 20/22/20, **detail 24** |

`scripts/audit/scene3d-capture.js:210` — `const bag = { ...(P.PRIMITIVE_PARAM_DEFAULTS[item.primitive] || {}) }`.

Measured on the **app-default scene** (`engine.addSceneTree()` + `setObjectPrimitive`, zero
overrides — the only fixture a live defect can be reproduced on):

| cell | max endpoint overshoot | pens @0.3 | endpoints over 0.15 mm |
|---|---|---|---|
| sphere · hatch | 0.130 mm | 0.43 | **0 of 60** |
| sphere · contour | 0.150 mm | 0.50 | **0 of 44** |
| capsule · contour | 0.099 mm | 0.33 | **0 of 46** |
| cone · contour | 0.137 mm | 0.46 | **0 of 60** |
| cylinder · contour | 0.000 mm | 0.00 | **0 of 58** |
| capsule · hatch | 0.096 mm | 0.32 | **0 of 64** |

**In the shipped app W-32's bar is already met** (worst 0.50 pen, at the line, zero endpoints over
it). It is RED **only** on the audit gallery's under-tessellated cells. That does not make Jay wrong
— the gallery is the deliverable he was shown — but it decides what the fix is.

## A5. RED oracle (W-32)

New file **`tests/unit/scene3d-fill-silhouette-overshoot.test.js`** (new file, not an edit of
`scene3d-fill-boundary-ends.test.js` — that guard measures the opposite property and must stay
untouched).

Ship in the file:
- `footprintMask(rec, cell = 0.02)` — projected-mesh triangle raster + edge raster, as §0.
- `outside(x, y)` — 0 inside, else Euclidean distance to the nearest on-cell (6 mm cap).
- `endpoints(fillPaths)` — first and last point of every non-closed `sceneFill` run with
  `!meta.sceneTarget.occluded`; a closed ring (`first ≈ last` within 0.05 mm) contributes none.

Blocking assertions (`fillDensity 50`, cameras a and b):

| # | bar | RED today (worst cell) |
|---|---|---|
| O1 | every endpoint's overshoot ≤ **0.15 mm** on `{capsule, cone, cylinder, sphere} × {hatch, contour, spiral}` at the **gallery** defaults | sphere·contour·a **0.366 mm**, 10 of 36 endpoints over |
| O2 | the same on the **app-default** scene (`addSceneTree`) | passes today (0.150 max) — a **must-not-regress** guard, and the proof that O1 is a rig property |
| O3 | overshoot vs the **CHART** ≤ 0.05 mm everywhere | passes today (≤ 0.022 on contour) — pins that no fix is allowed to work by pulling the fill off the surface |
| O4 | mutation: rebuild the mask at `detail = 8` ⇒ O1 must fail by ≥ 3× | measured 1.330 / 0.806 / 1.265 mm |

O3 is the anti-cheat: it forbids the "trim the ends inward" family of fixes from passing by
retreating off the surface (that is W-35's axis and Jay wants *more* edge fidelity there, not less).

## A6. Ranked fixes (W-32)

**Rank 1 — shoot the gallery at the CREATION defaults.**
`scripts/audit/scene3d-capture.js:210` → `{ ...(P.PRIMITIVE_PARAM_DEFAULTS[item.primitive] || {}),
...(P.PRIMITIVE_CREATE_DEFAULTS[item.primitive] || {}) }`. Zero `src/` risk, zero byte-identity
exposure in the product, and it makes the gallery show what users actually see (O2's numbers). It is
also the only option that touches no other lane's file.
**Cost, stated plainly: every gallery cell and every `after/*` baseline is invalidated** (7440 Tier-A
+ Tier-B renders, `shots/` 373 MB). **This is the orchestrator's call, not the implementer's.**

**Rank 2 — raise the deserialization `detail` default 16 → 24** (`params.js:92-98`). Meets the bar on
every primitive (0.145 / 0.102 / 0.121 / 0.000 mm). **Rejected as written**: `params.js:113-114` says
in the source that these numbers *must never move* because they reshape every saved document that
omitted the key. Recorded so nobody re-tries it.

**Rank 3 — clip the fill's endpoint to the drawn footprint.** `scene3d.js:3993-4010` already hands
`SurfaceFill.buildObject` a caller-built predicate (`selfOcclusionTest`, from `clipper.hiddenAt`); an
`opts.insideFootprint(x, y)` built the same way from `record.projected` + `record.faceIndexArrays`
would be ~15 lines at the call site plus consumption in `edgeAt` (`surface-fill.js:8413-8422`).
**Two objections the implementer must weigh, not wave past:** (a) it contradicts the design decision
written at `surface-fill.js:5496-5501`; (b) it *loses* up to 0.37 mm of edge fidelity, the exact
quantity W-35 exists to give the user *more* of. It also puts the fill lane inside `scene3d.js`.

**Rank 4 — refine the BORDER to the true silhouette** (the W-27 treatment applied to
silhouette/boundary edges). The only fix that satisfies W-32 and W-35 together. Cross-lane
(`scene3d.js` edge pass + `hlr.js` occluders), large, and out of scope for one unit. File it, do not
attempt it here.

**Recommendation: W-32 ships Rank 1 if — and only if — the orchestrator accepts the gallery re-shoot.
Otherwise W-32 lands as MEASURED with §A3/§A4 as its result and the choice between Rank 1 / Rank 3 /
Rank 4 goes to Jay as a decision item.** Do not let an implementer pick Rank 3 unilaterally.

---

# PART B — W-33

## B1. Secretary flag (1), answered directly: this is **not** W-37's root cause

W-37 records that `GeometryUtils.toCurveAnchors` returns `{straight:true}` on every contourSlice
ring, so Fill Curves *declines* there. **On contour FILL rulings it does not decline.** Measured on
all four primitives × both cameras, `toCurveAnchors(p, {curves:true, simplify:0, smoothing:0, closed})`
returned `straight:false` for **every single ruling** (0 straight / 20–27 fitted per cell), and with
`fillCurves:true` in the style params **every ruling comes back carrying real bezier anchors**
(`anchoredRulings` = 20/23/24/25/26/27/29/30 = 100% in every cell tested, including the app-default
scene). The gate is open, the fitter accepts, the anchors are stamped.

Also confirmed: **Fill Curves is ON by default in the app.** `params.js:187`
`LINE_FINISH_CREATE_DEFAULTS = { curves: true, fillCurves: true }`, seeded at `engine.js:526-528`;
`addSceneTree()` produces an `object3d` whose style params are literally `{"fillCurves":true}`.
(The audit gallery's style table never writes the key, so the *shot Jay saw* had it off — but both
states are over the bar, see B2.) **Rule 2(b) is not violated by a default here.**

**What Fill Curves does not do is remove the corner.** `applyCurveFit`
(`geometry-utils.js:2501-2521`) stamps `meta.anchors` and returns the *same* sample points, and the
fitted cubic interpolates those samples — so a 38° turn between two 0.11 mm chords survives it:

| cell | M1 points-off / anchors-on | M2 (1 mm) off / on |
|---|---|---|
| capsule · contour · a | 31.235° → **16.176°** | 52.17° → 52.20° |
| capsule · contour · b | 38.349° → **36.722°** | 97.15° → 96.77° |
| cone · contour · b | 38.349° → **33.418°** | 97.02° → 96.58° |
| cylinder · contour · b | 38.349° → **33.418°** | 96.86° → 96.27° |
| sphere · contour · b | 38.349° → **37.144°** | 95.94° → 95.45° |

(M1 "on" measured on `flattenSmoothedPath(p, 0.01)` of the anchored path — the geometry that is
actually stroked and exported.)

**So W-33 is a scope extension of rule 2(b) AND a sampling bug — it is not a fitter-gate bug.**

## B2. Numbers today

M1 (max per-vertex turn, device space, open-aware) on `sceneFill` rulings, `fillDensity 50`:

| cell | cam a | cam b | rulings over 8° (cam a) |
|---|---|---|---|
| capsule · contour | **31.24°** | **38.35°** | 19 of 20 |
| cone · contour | **31.24°** | **38.35°** | 26 of 26 |
| cylinder · contour | **31.24°** | **38.35°** | 25 of 25 |
| sphere · contour | **31.24°** | **38.35°** | 17 of 18 |

**On the app-default scene it is still RED**: sphere·contour **18.46°**, capsule·contour **23.25°**,
cone·contour **21.70°**, cylinder·contour **21.70°**. *Unlike W-32, W-33 reaches the real app.*

Analytic truth for M1 is **0 by construction** — a smooth ring has no vertices — so unlike W-34's
cone there is no ground-truth ambiguity: every degree of M1 is discretisation. (M2 on these rings is
dominated by *real* curvature — the innermost cap ring is a ~4.5 × 1.15 mm ellipse whose true
radius of curvature at the major-axis tip is ≈ 0.15 mm, i.e. ≈ 390°/mm — so **M2 is a sanity check
here, not the bar.** Do not chase M2 on a polar ring.)

## B3. Root cause, with file:line

`src/core/scene3d/surface-fill.js:5428-5433`:

```js
const baseSteps = Math.max(28, Math.round(finite(opts.detail, 24) * 2));   // detail 16 ⇒ 32
const fillFidelity = clamp(finite(opts.fillFidelity, 1), 0.25, 3);
const steps = fillFidelity === 1 ? baseSteps
  : Math.max(6, Math.min(220, Math.round(baseSteps * fillFidelity)));
```
consumed at `:7774-7777` (`nSteps`, capped by `MAX_LINE_STEPS = 220` at `:374`) and emitted at
`:9115` / `:9139`.

**A ruling is sampled at a fixed number of steps, uniform in the chart parameter, and nothing in the
pipeline ever consults the ruling's PROJECTED turn.** There is no device-space refinement for fill
rulings at all — the fill-side counterpart of W-34's finding that `refineSliceRing`'s stop condition
was computed in the wrong space. Here it is not computed.

The offending run is always the **innermost cap / pole ring**: a contour ring near the chart's pole,
whose radius is set by the master pitch (the same for all four primitives) and which projects to a
very flat ellipse. 32 uniform-parameter samples put the fewest points exactly where the projected
turn is greatest. The evidence that this and nothing else is the cause:

1. **M1 is identical to 2 decimals on capsule, cone, cylinder and sphere** — 31.24° at cam a,
   38.35° at cam b. Four different surfaces cannot share a geometric corner; they share a sample
   count.
2. **`fillFidelity` reproduces the `detail` ladder exactly**, because both feed the same `steps`:

   | steps (via detail / via fidelity) | 32 (16 / 1) | 48 (24 / 1.5) | 64 (32 / 2) | 96 (48 / 3) |
   |---|---|---|---|---|
   | M1, cam a, all four primitives | 31.24° | 21.70° | 16.22° | 10.93° |

   `M1 × steps` = 1000 / 1042 / 1038 / 1049 — **M1 ∝ 1/steps**, the signature of a curvature-limited
   discretisation. `detail` and `fillFidelity` are the same lever.
3. The dumped worst ruling is a **33-point closed ring** (32 uniform steps) whose segment lengths run
   0.437 → 0.113 → 0.437 mm around the ellipse; the 38.35° turn sits between the two shortest chords
   at the major-axis tip. Verbatim, capsule cam b path 0, vertices 3–5:
   `(141.72,131.07) (141.72,130.96) (141.64,130.85)`.

**LOOKED AT IT.** `capsule__contour__ladder__med__a.webp`, crop `(150,10)-(310,90)` at 8×: the
innermost cap ring reads as a faceted ellipse with a visible corner at each end of its major axis —
Jay's "non-curved angles", exactly where the metric puts them.

**Ruled out, so nobody re-litigates:** the `fillCurves`/fitter gate (§B1 — it engages, on and off);
the capsule cap and cone base as *special* polylines (cylinder and sphere give the identical number,
so nothing about a cap is implicated beyond its ring being the flattest one); HLR clip ends (the
maxima are interior vertices of closed rings, `closed = true`, so there are no clip ends on them);
`_applySceneCurveFinish` (it runs and it helps a little — §B1's table).

## B4. Scope warning the implementer must not blunder into

**Hatch, crosshatch and spiral rulings contain GENUINE folds and the 8° bar must not be applied to
them blind.** capsule·hatch M1 = **127.12°**, sphere·hatch = **115.67°**, capsule·spiral = 45.81°.
Sweeping the sample count barely moves them (capsule·hatch 127.12 → 114.86 at detail 32 → 97.90 at
fidelity 3; sphere·hatch 115.67 → **126.23** — it goes *up*), and the maximum sits at **vertex 1 of a
5-to-15-point open run** at the top of the form: a ruling that wraps over the pole and turns back.
That is real geometry, W-34's cone-apex situation again.

**W-33's bar is scoped to `mapper === 'contour'` rulings** (Jay's words, Jay's picture) **plus any
closed ring on any mapper**. Extending it to open hatch runs needs a fold exemption and is a separate
item — file it, do not smuggle it in.

## B5. RED oracle (W-33)

New file **`tests/unit/scene3d-fill-ruling-corners.test.js`**.

Ship in the file: `m1(path)` exactly as §0 (open-aware, closed detected at 1e-6), and a
`drawnPolyline(path)` that returns `GeometryUtils.flattenSmoothedPath(path, 0.01)` when the path
carries real anchors and the path itself otherwise — the bar must be measured on **what is stroked**,
not on the pre-fit samples.

| # | bar | RED today |
|---|---|---|
| C1 | `{capsule, cone, cylinder, sphere} × contour × d 50 × cam {a,b}`, gallery defaults: **M1 ≤ 8°** on every ruling, measured on the drawn polyline | 31.24° / 38.35° (all four, both cameras); 17–26 rulings per cell over |
| C2 | the same on the **app-default** scene (`addSceneTree`) | 18.46 / 23.25 / 21.70 / 21.70° |
| C3 | with `fillCurves` **off**, C1 also holds | 31.24° / 38.35° — pins that the fix is in the emitter, not in the fitter |
| C4 | closed rings only: `first ≈ last` within 1e-6 and the ring's wrap turn is included | today 20/23/25/26/27 closed rings per cell |
| C5 | mutation: force `steps = 16` ⇒ M1 ≈ 62° (2× today) — the oracle must be sampling-sensitive | required before acceptance |
| C6 | **not** a point-count free-for-all: total `sceneFill` points on `sphere·contour·d50·a` ≤ **1.6×** today's 353 | detail 48 costs 995 (2.8×) — that route is rejected, see B6 |

## B6. Ranked fixes (W-33)

**Rank 1 — device-space adaptive subdivision of the emitted ruling (RECOMMENDED, in lane).**
Mirror `sliceRingSubdivideOnce` / `refineSliceRing` (`scene3d.js:656-785`) inside
`surface-fill.js`'s emit: after the run's points are laid, walk adjacent triples; where the
**projected** exterior turn exceeds `FILL_MAX_TURN_DEG = 8`, re-sample `paramAt` at the parameter
midpoint of the offending pair and insert the point; repeat, bounded by
`FILL_REFINE_MAX_ROUNDS` (start at 6) and a per-ruling point ceiling. Exact insertion site: the
emit loop around `:9100-9145`, using the existing `paramAt` / `sampleAt` closures and the existing
`addPt`. Properties that make this the right shape: it only ever *adds* points on curve already
proved visible (same guarantee `edgeAt` gives at `:8406-8412`); it is inert wherever M1 is already
under 8°, so flat rings, straight cylinder rulings and every faceted primitive are byte-identical;
and it converges — `M1 ∝ 1/steps` locally means one bisection halves the turn, so 8° from 38.35° is
**3 rounds on the worst ring only**, not 3× the points everywhere. Cost estimate from the ladder:
the offending region is ~4 of 32 vertices per polar ring and only the innermost 1–2 rings per cell
are over the bar, so the expected point growth is well inside C6's 1.6× (contrast: reaching 10.93°
by raising `steps` globally costs 2.8×).

**Rank 2 — a per-ruling step count derived from the ruling's projected turn budget** (compute the
run's total projected turn on a cheap 8-point pre-pass, then set `nSteps = clamp(totalTurn / 8°)`).
Cleaner in principle, but it re-samples the whole ruling and therefore moves *every* point on every
over-bar ring — a much larger byte-identity blast radius than Rank 1's insertions. Take it only if
Rank 1's inserted points break the mark laws' `arcMM`/`smps` indexing (they share the arrays at
`:7896-7910`) — check that first.

**Rank 3 — REJECTED BY MEASUREMENT, recorded so nobody re-tries it: raise `detail` or
`fillFidelity`.** Neither reaches the bar at any sane setting — `detail 48` and `fillFidelity 3`
both land at **10.93°**, still over 8°, while costing sphere·contour 353 → 995 points (+182%) and
`MAX_LINE_STEPS = 220` caps it there. This is the single most likely wrong turn for an implementer;
the ladder in §B3 is the proof.

---

## 1. Guards that move (both items) — names and current values

Run these, one file at a time, foreground:

| file | what it pins | exposure |
|---|---|---|
| `tests/unit/scene3d-fill-boundary-ends.test.js` | 41 tests; `TOL_MM = 1.0` (`:48`), `ALLOW = { torus/contour 2.0, torus/crosshatch 2.0, torusKnot/contour 1.5 }` (`:264`) | **must stay 41/41 and un-edited.** W-33 adds points near a ruling's ends — this test's clusters (0.8 mm) and pole rule (≥ 3 ends) could shift. Do not relax it. |
| `tests/unit/scene3d-fill-even-spacing.test.js` | W-26 evenness; jump ratio > 1.6 flagged, `frac > 0.10` fails (`:316-322`); `jumps` on gap deltas > 1 must be 0 (`:144-145`) | neither item changes ruling PLACEMENT; must be byte-stable |
| `tests/unit/scene3d-ladder-uniform-field-spacing.test.js` | W-26 uniform-field spacing | same |
| `tests/unit/scene3d-plot-safety.test.js` | composed coverage, `CELL = 0.1`; the W-26b C1 ink band | W-33 adds ink (longer polyline ≈ true arc): sphere·contour 656.4 → ~657.3 mm at fidelity 3, **+0.14%** |
| `tests/unit/scene3d-mark-laws-draw.test.js` | T1/T1b mkTick oracles — `MK_MIN_ADJ_PEN = 0.5`, `MK_MAX_WALK_STEPS = 64`, min adjacent spacing 0.6998 / 0.5002 pens | marks ride `smps`/`arcMM`; Rank-1 insertions must not renumber them |
| `tests/unit/scene3d-curves.test.js` | `totalPoints(on) ≤ totalPoints(off)` (`:291`) | W-33 raises both sides; the inequality must hold |
| `tests/unit/scene3d-mappers.test.js` | buckyball spiral fingerprint 21 fills / 1006 pts / 284.148 mm (`:467-479`) | **solid = faceted, no chart** ⇒ must be byte-identical |
| `tests/unit/scene3d-surface-fill.test.js`, `scene3d-fill-span-verdict.test.js`, `scene3d-fill-seam-continuity.test.js`, `scene3d-fill-ruling-continuity.test.js`, `scene3d-hatch-density-*.test.js`, `scene3d-curved-density-*.test.js` | the fill lane's standing guards | run all |
| **W-36's P1–P6, once landed** | P5 cylinder d220 crosshatch ink ∈ [4200, 5431] mm; **P6 byte-identity: sphere hatch d50 = 24 fills / 723.4 mm · cylinder hatch d220 = 145 / 4495.5 mm · sphere contour d50 = 18 / 656.4 mm** | **P6's sphere-contour ink is directly in W-33's path** — measured drift ≈ +0.9 mm. If P6 pins it exactly rather than with a tolerance, this is a **`## Bars changed` disclosure**, not a silent re-pin |

Any threshold, tolerance, count bar or fingerprint that moves — up or down — goes under a
`## Bars changed` heading as `file:line — old → new — why`, and in the commit body.

## 2. Byte-identity set (must not move by a digit)

- `box`, `plane`, `solid`/buckyball, `pyramid` and every imported mesh — no chart, no ruling
  refinement, no footprint change.
- Every `sceneEdge` path (border, crease, boundary) in **both** items. W-32 Ranks 1/3 and all of
  W-33 leave the edge pass untouched; if a border path moves, stop.
- Every ruling whose M1 is already ≤ 8° and every endpoint already inside the footprint — the fixes
  are conditional by construction.
- `sphere__hatch__ladder__med__a` and `cylinder__hatch__ladder__max__a` as named must-not-move
  controls for W-33 (hatch is out of scope, §B4).
- W-36's P6 triple, subject to the caveat above.

## 3. Files

**Allowed**
- `src/core/scene3d/surface-fill.js` — **only** `:5428-5433` (the `steps` block) and the emit /
  refinement region `:8406-8422` + `:9100-9150`. Nothing in the tone-law, master-grid, ribbon or
  crossing-family blocks.
- `tests/unit/scene3d-fill-silhouette-overshoot.test.js` (new) and
  `tests/unit/scene3d-fill-ruling-corners.test.js` (new).
- `scripts/audit/scene3d-capture.js:210` — **only** if the orchestrator approves W-32 Rank 1.

**Forbidden**
- `tests/unit/scene3d-fill-boundary-ends.test.js` — read it, never edit it.
- `src/core/scene3d/params.js` (W-32 Rank 2 is rejected; U9 owns the shadow bag),
  `src/core/geometry-utils.js`, `src/core/engine.js` (§B1 is an observation, not a fix site).
- `src/core/algorithms/scene3d.js` — the border/edge pass is lane `fill-audit`; the slices block is
  W-34's on fill-audit-d2. **W-32 Rank 3 needs `:3993-4010`; that is a cross-lane request and needs
  the orchestrator's ruling before a line is written.**
- `src/core/scene3d/hlr.js`, `shadows.js` (handoff-c), `surface-fill-mono.js` (fill-audit-c),
  `mappers.js` (fill-audit-d), `src/config/context-bar.js` (W-35's surface).
- `src/core/scene3d/mesh.js` / `charts.js` / `scene.js` — unassigned; do not open them.

## 4. Evidence cells — verified against the manifests

Checked `docs/3d-audit/fill-audit/manifest.A.1-1.jsonl`, `manifest.A.1-50.jsonl` and
`manifest.B.[1-5]-5.jsonl` before naming anything. **Tier A carries
`{capsule, cone, cylinder, sphere} × {hatch, contour, crosshatch, spiral} × ladder × {low, med, max}
× {a, b}` — all present.** Tier B carries contour/spiral for **`sphere`, `cone`, `torus`, `box` only**
— there is no Tier-B capsule or cylinder cell.

```
node scripts/audit/scene3d-capture.js --tier A --root .claude/worktrees/fill-audit-a2 --port <free> \
  --only '^(capsule|cone|cylinder|sphere)__(contour|hatch|spiral)__ladder__med__(a|b)$' \
  --out docs/3d-audit/fill-audit/after/<W-32|W-33>
```
(24 cells, all confirmed present; run from MAIN so the output lands in main's gallery dir.)

- **W-32**: `{capsule, cone, cylinder}__contour__ladder__med__{a,b}` + `capsule__spiral__ladder__med__a`
  + `sphere__contour__ladder__med__a` (the worst cell measured). **Crop the right silhouette at
  native resolution** — on `capsule__contour__ladder__med__a.webp` (447×729) the barbs live in
  `(307,255)-(447,473)`; a whole-cell view hides a 0.2 mm defect.
- **W-33**: `{capsule, cone, cylinder, sphere}__contour__ladder__med__{a,b}`. **Crop the cap/pole
  ring** — `(150,10)-(310,90)` on the capsule cell at ≥ 6×.
- Controls, must be byte-identical: `sphere__hatch__ladder__med__a`,
  `cylinder__hatch__ladder__max__a`.
- `med` and `max` are **not** byte-identical on these mappers (unlike contourSlice — density does
  reach the surface fill), so `max` is a legitimate second data point if wanted.
- Then `after/<W-id>/report.json` with the before/after tables, byte-identical pairs explained, and
  what you SAW in the crops.

## 5. Stop conditions

1. **W-32: you are about to pick Rank 3 or Rank 4 on your own.** Both cross a lane boundary and Rank
   3 also contradicts a design decision written in the source (`surface-fill.js:5496-5501`). Stop and
   report; the ranking is the orchestrator's.
2. **W-32: your fix lowers O3** (overshoot vs the chart). That means you moved the fill off the
   surface to satisfy a comparison against a polygon. Revert.
3. **W-33: you are about to raise `baseSteps`, `fillFidelity`'s default or `MAX_LINE_STEPS`.**
   Measured dead end — §B3's ladder shows detail 48 / fidelity 3 both stop at 10.93°, still over the
   bar, at +182% points.
4. **W-33: you are about to apply the 8° bar to hatch/crosshatch/spiral.** §B4 — those maxima are
   genuine folds at the chart pole and do not shrink with sampling (sphere·hatch goes *up*, 115.67 →
   126.23). File the fold-exemption question; do not fold it in.
5. **You find yourself editing `scene3d-fill-boundary-ends.test.js`.** It measures the opposite
   property; a change there is a hidden regression, not a fix.
6. **A W-36 bar moves and you cannot reconcile it.** P6's sphere-contour ink is in W-33's path; ship
   the measurement and the `## Bars changed` entry rather than a re-pin.
7. **The worktree is dirty with W-36's or W-31's work.** `git -C .claude/worktrees/fill-audit-a2
   status --short -- . ':!graphify-out'` and `git stash list` first; two implementers never share one
   worktree.

## 6. Ordering, and the W-36 dependency

- **Both items must start on W-36's landing sha, not `f828d828`.** W-36 edits `surface-fill.js`
  (`CROSS_PAIR_BUDGET` near `:4652-4665` and the step-ceiling at `:9718-9720`); W-32/W-33 edit
  `:5428-5433` and `:8406-9150`. Disjoint regions, **same file** ⇒ AGENT-PROTOCOL serialisation
  applies. W-31 sits between them in the ledger's resume order and does not conflict (it measures
  ruling placement; neither item moves a ruling's position).
- **Run them as TWO units, and run W-33 FIRST** — a reversal of the ledger's `W-32 → W-33` order,
  for three measured reasons:
  1. **W-33 is RED in the shipped app** (18.5–23.3° against an 8° bar) and W-32 is not (0.50 pen
     against a 0.50-pen bar, zero endpoints over). W-33 is the defect a user can hit today.
  2. **W-33 has a clean, in-lane, single-file fix.** W-32's every option is a harness decision, a
     rejected default change, or a cross-lane request — it is a *ruling*, not an implementation.
  3. **Ordering W-32 first would invalidate W-33's oracle.** Rank 1 (re-shoot at the creation
     defaults) changes `detail` 16 → 22/24/28, which changes `baseSteps` and therefore every M1
     number in §B2 (31.24° → 18.5–23.3°). W-33's RED must be pinned before that moves. The reverse
     is safe: W-33 inserts points on closed rings and does not change where a ruling ends, so O1–O4
     are untouched by it (verify with O3 in the same run).
- W-32's evidence re-shoot must therefore be the **last** thing that happens, after both units, or
  the gallery is rebuilt twice.

---

## Appendix — what the planner ran

Scratch export of `f828d828` at `/private/tmp/claude-501/scratch-W32` (removed on completion),
`node_modules` symlinked to main. Seven throwaway vitest probes, run one file at a time in the
foreground: rig shape, scene-record shape, the 24-cell overshoot matrix (chart mask + mesh mask at
0.02 mm), the chart-vs-mesh silhouette gap, the `detail` sweep 8/16/24/32/48, the corner matrix with
`fillCurves` on and off plus `toCurveAnchors`/anchor accounting, the `detail` × `fillFidelity` M1
ladder, the hatch fold-vs-sampling check, and the app-default (`addSceneTree`) scene. Plus three
Pillow crops of `after/W-26/shots/A/capsule__contour__ladder__med__a.webp` read at native
resolution. No worktree was read-modified, no `src/` file was edited anywhere, nothing was staged,
nothing was committed, nothing was pushed.
