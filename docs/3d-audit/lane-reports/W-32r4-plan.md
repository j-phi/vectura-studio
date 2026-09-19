STATUS: PLAN-READY

# W-32 Rank 4 — refine the fill BORDER to the true silhouette (planner report)

**Summary.** W-32's defect is not in the fill: measured on `b43fa4e3`, **no ruling end anywhere exceeds
the TRUE projected silhouette by more than 0.0035 mm (0.01 pen)** across 132 primitive × mapper × camera
× rig × density cells. The entire visible overshoot — up to **0.72 pen on the ellipsoid, 0.52 on the
sphere and cone** — is the **drawn outline falling short**: it is the projected MESH silhouette, a chord
polygon inscribed in the true one, and its deficit (0.70 / 0.52 / 0.53 pen on the same cells) matches the
overshoot to the digit. `scene3d-fill-boundary-ends` can pass 41/41 through this because it measures the
opposite quantity (undershoot into open surface) against the **chart**, scores any off-mask point
**0.00 mm — the best possible value** (`:205-210`), and does so on a 0.35 mm raster at `TOL_MM = 1.0`.
**Rank 1 was PROTOTYPED** (one file, `scene3d.js`, +164 / −2 lines, 4 hunks): the silhouette/boundary edge
chain is projected onto the **analytic silhouette curve** (`F = 0` ∧ `∇F·v = 0`, Newton with a numerical
`∇G`, reusing `sliceSurfaceFG`). Result: **worst overshoot 0.72 pen → 0.02 pen; endpoints over the
0.5-pen bar 111 → 0; fill ink byte-identical (0.000 % on every cell); edge ink +0.03 … +1.56 %; no
measurable frame cost (≤1 %, inside noise)**. **48 of 48 faceted / unsupported cells are byte-identical**
(`torusKnot`, `superellipsoid`, `pyramid`, `box`, `plane`, `solid`/imported, plus the ground plane, which
is excluded by name). **`hlr.js` is NOT needed**: the predicted cross-object side effect was measured on
the two-sphere scene and is **0.39 pen worst / 0.07 pen median of back-object ink now sitting INSIDE the
front object's outline — entirely under that outline's own 0.5-pen stroke half-width**. Two honest costs:
**the TORUS must be excluded** (non-convex; the refined inner loop is cut by the object's own occluders and
both contiguity guards go RED — measured, and green again the moment the torus is gated out), and **two
existing pins must be re-pinned with proof** (`scene3d-hlr-spatial-index-identity` fingerprints on the two
curved scenes; `scene3d-curves` "2-point sticks" stale assertion). ⚠ **And one claim in the record is
wrong and is corrected here: Rank 4 does NOT "also satisfy W-35."** The W-35 stair-step metric moves
**0.764 → 0.655 pen** on `ellipsoid · spiral · a` — it removes the overshoot, not the spiral's
alternation. **Size: ONE unit, not two.**

---

## 0. Provenance, rig and baseline discipline

| item | value |
|---|---|
| lane | `border-4` (`3d-scene/border-4`), port 8470, off **`b43fa4e3`** |
| working copy | read-only scratch export `/private/tmp/claude-501/scratch-W32r4` (`git archive b43fa4e3 \| tar -x`), `node_modules` symlinked from MAIN. **The worktree was never written to, never entered, never stashed.** |
| runtime | Node **v20.20.2** (`.nvmrc`); `package.json` version **1.4.2** in the export |
| pen | 0.3 mm (document default) — every "pen" figure is `mm / 0.3` |
| doc bounds | 320 × 220 mm, `eng.currentProfile = { width: 320, height: 220 }` |
| rigs | **both**, per binding rule 3. **`create`** = `PRIMITIVE_PARAM_DEFAULTS` ⊕ `PRIMITIVE_CREATE_DEFAULTS` as a `q.objects` bag (**what the v1.4.2 gallery and Jay's screenshots show**); **`addLayer`** = `engine.addLayer('scene3d')` with the object3d leaf's `primitive` mutated in place (**what every RGR test in these lanes constructs** — and it carries the sphere's `{radius 25, detail 28}` bag onto every primitive, so its `detail` is 28 throughout, not 16) |
| cameras | `a` = `Params.DEFAULT_CAMERA` (ortho, yaw −30 / pitch 20); `b` = the same with yaw 40 / pitch −15; `p` = `a` with `projection:'perspective'` (added by this pass — §3.5) |
| densities | `med` = 50, `max` = 220 (`fillDensity`) |
| style | `fillAngle 45`, `toneLaw 'ladder'` (`SCENE_FILL_STYLES.DEFAULT`), no other non-default param |
| ground | **OFF in every measured cell** (`q.ground = { enabled: false }`), so **no ink number below includes ground-plane ink**; the one ground cell is the byte-identity check in §3.4 |
| lights | one directional sun, az 135 / el 45, `castShadows: false` |

**Every number in this report was measured in this pass on `b43fa4e3`.** W-32's and W-35b's numbers are
quoted only where labelled as theirs. The instrument reproduces W-35b's table **exactly** where they
overlap (`capsule · hatch · a` 0.0549 mm, `sphere · contour · a` 0.1494 mm, `ellipsoid · contour · a`
0.2005 mm, `ellipsoid · hatch · a · d220` 0.2172 mm) — that agreement is the instrument's calibration.

**Instruments** (archived verbatim in `W-32r4-plan-evidence/`):

- `measure.js` — for a CONVEX primitive the **drawn** outline is the convex hull of its `sceneEdge`
  silhouette+boundary ink (exact: no raster, no cell size). The **TRUE** silhouette is the convex hull of
  the SAME chart at **`detail = 200`**, projected through `Scene.projectWorldPoint` with the same camera
  and bounds — residual sagitta at that detail is `30·(1−cos(π/200)) = 0.0037 mm = 0.012 pen`, an order
  below every number it is used to judge, and it is built **outside** the algorithm under test so the
  prototype cannot move its own reference. Signed distance `> 0` = outside. Chart poles excluded by the
  same rule `scene3d-fill-boundary-ends.test.js` uses (≥ 3 ends within 0.3 mm).
- `identity.js` — md5 of emitted geometry at 9 dp, split by `meta.kind`, prototype ON vs OFF in one
  process, over `MAPPERS` × 12 primitives.
- `occl.js` — the two-sphere occluder scene (W-35b's, extended to toggle the prototype).
- `raster.js` — 48 px/mm offline raster of the emitted geometry for the eye check (§3.6). **A planning
  image, not an app screenshot** — the same precedent and the same disclosure W-35 and W-35b used.
- `rank1-prototype.diff` — the complete spike, unified diff against `b43fa4e3`'s `scene3d.js`.

---

## 1. RED, re-measured on `b43fa4e3`

### 1.1 The two quantities, and why both are needed

W-32's bar is *"no ruling endpoint outside the silhouette by more than 0.5 pen = 0.15 mm."* "The
silhouette" is ambiguous in exactly the way this unit is about, so both readings are measured on every
cell:

- **`osDrawn`** — distance outside the **DRAWN** outline (the inscribed mesh chord polygon, the thing on
  the paper). **This is the defect Jay saw.**
- **`osTrue`** — distance outside the **TRUE** projected silhouette. **This is the residual that survives
  after Rank 4**, because Rank 4 makes the drawn outline equal to the true one.

### 1.2 `create` rig, `fillDensity 50`, both cameras — 40 cells (`base-create-med.json`)

Worst per primitive (the full 40-row table is in the JSON; every row's fixture is in the file):

| primitive | worst cell | **osDrawn mm / pen** | ends > 0.5 pen | **osTrue mm / pen** | ends > 0.5 pen | drawn-border deficit vs TRUE, pen |
|---|---|---|---|---|---|---|
| **ellipsoid** | crosshatch · a | **0.2126 / 0.71** | 1 of 68 | 0.0033 / **0.01** | **0** | **0.70** |
| ellipsoid | contour · a | 0.2005 / 0.67 | **4 of 34** | 0.0031 / 0.01 | 0 | 0.70 |
| **sphere** | crosshatch · a | 0.1557 / **0.52** | 1 of 83 | 0.0023 / 0.01 | 0 | 0.52 |
| **cone** | crosshatch · a | 0.1454 / **0.48** | 0 | 0.0016 / 0.01 | 0 | 0.53 |
| capsule | contour · b | 0.0755 / 0.25 | 0 | 0.0009 / 0.00 | 0 | 0.24 |
| cylinder | crosshatch · b | 0.0361 / 0.12 | 0 | 0.0004 / 0.00 | 0 | 0.14 |

### 1.3 `create` rig, `fillDensity 220` — 12 cells (`base-create-max.json`)

**Overshoot rises with ruling count, exactly as the amendment said** — more ends sample the extremes:

| cell | ends | **osDrawn mm / pen** | **ends > 0.5 pen** | osTrue pen |
|---|---|---|---|---|
| `ellipsoid · contour · a · d220` | 148 | **0.2170 / 0.72** | **14** | 0.01 |
| `ellipsoid · crosshatch · a · d220` | 178 | 0.2171 / 0.72 | **12** | 0.01 |
| `ellipsoid · hatch · a · d220` | 128 | 0.2172 / 0.72 | **8** | 0.01 |
| `ellipsoid · spiral · a · d220` | 172 | 0.2150 / 0.72 | **7** | 0.01 |
| `sphere · crosshatch · a · d220` | 216 | 0.1557 / 0.52 | 5 | 0.01 |
| `cone · crosshatch · a · d220` | 200 | 0.1568 / 0.52 | 2 | 0.00 |

**41 endpoints over the bar on the ellipsoid alone at d220**, against **0** measured against the true
silhouette.

### 1.4 `addLayer` rig, med + max, both cameras — 80 cells (`base-addlayer.json`)

Same picture, milder on three primitives because that rig gives every primitive `detail 28`:
capsule **0.28**, cone **0.35**, cylinder **0.07**, sphere **0.52** (15 ends over), ellipsoid **0.52**
(26 ends over). **`osTrue` never exceeds 0.01 pen on any of the 80 cells.**

### 1.5 Mapper coverage, stated as a fraction, with every exclusion measured

The roster is `MAPPERS = ['none','hatch','wireframe','crosshatch','contour','spiral','stipple',
'contourSlice']` (`src/core/scene3d/params.js:79`). The **overshoot** sweep covers
**`hatch`, `contour`, `crosshatch`, `spiral` = 4 of 8 = 50 %**, and the exclusions are measured, not
asserted: `none` emits no fill; `wireframe` emits **0 `sceneFill` paths**; `stipple` emits dots with **no
silhouette ruling ends** (a dot has no end to overshoot); `contourSlice` rings are cut at facet
boundaries, are W-35's subject, and are covered instead by the **byte-identity** sweep in §3.4, which
runs **all 8 of 8 mappers × 12 primitives = 96 cells**.

### 1.6 What `scene3d-fill-boundary-ends` actually gates, and why 41/41 is not a contradiction

**Verified 41/41 in 38.1 s at `b43fa4e3` before the patch, and 41/41 again after it.** It is blind to
W-32's quantity for four independent reasons, all read off the file at this sha:

1. **Its reference is the CHART, not the drawn border** — the mask is 420² chart samples
   (`GRID = 420`, `:46`), so it cannot see a gap between the chart and the polygon drawn beside it.
2. **Off-mask scores the best possible value.** `:205-210` — `return on[k] && Number.isFinite(D[k]) ? … : 0;`
   A ruling end that lands *outside* the mask scores **0.00 mm**, i.e. "perfect".
3. **Its tolerance is `TOL_MM = 1.0` (`:48`) — 3.3 pen**, calibrated against the 3.43–4.85 mm pyramid
   crease defect, against W-32's 0.15 mm bar.
4. **Its raster is `CELL = 0.35` mm (`:45`)**, more than twice the bar.

It measures **undershoot into open surface** — a correct test of a different property. **Read it, never
edit it** (W-32 §A1 and W-35b §3 made the same ruling; this pass makes it a third time on re-measurement).
⚠ **`tests/unit/scene3d-fill-silhouette-overshoot.test.js`, specified in `W-32-W-33-plan.md` §A5, is still
absent at `b43fa4e3`** — W-35b's FU-3 stands, and this unit is where it lands.

---

## 2. ROOT CAUSE, with file:line

**The fill walks the analytic chart; the border is the inscribed faceted mesh polygon. Every fill point
that reaches the true silhouette is outside the drawn border by up to the tessellation sagitta.**
(W-32 §A3 said this at `f828d828`; it is re-derived here on `b43fa4e3` with the true-silhouette reference
W-32 did not have.)

| side | file:line at `b43fa4e3` | what it is |
|---|---|---|
| **fill** | `src/core/scene3d/surface-fill.js` — end refinement bisects against the chart's own front test (`EDGE_BISECT`, 1/4096 of a sample step) | on the **analytic** terminator — **`osTrue` ≤ 0.01 pen on 132/132 cells**, so the emitter overruns nothing |
| **border** | `src/core/algorithms/scene3d.js:5084-5215` — the structural edge pass. `const a = record.projected[entry.a]; const b = record.projected[entry.b];` … `const clipped = clipper.clipPath([a, b], …)` (**:5173**), collected for emphasis at **:5208-5214** and emitted at **:5226** | **projected MESH vertices**, joined by straight chords ⇒ a polygon **inscribed** in the true silhouette |
| **classification** | `src/core/scene3d/edges.js:29-63` — `cls = 'silhouette'` iff the edge's two faces disagree on `front`; `'boundary'` iff it has one face | the outline is a set of **mesh** edges, so its vertices are mesh vertices, which lie on the surface but **not on the silhouette** |
| **the design note that predicted it** | `surface-fill.js:5785` — the ribbon clip must use the chart, *"not the MESH silhouette … a different discretisation of the same form [that] would be off by the mesh's own facet error"* | W-32 is that stated facet error becoming visible |

**Three proofs, all measured this pass.**

1. **`osTrue` ≈ 0 and `osDrawn` = the border's own deficit.** Per cell, `osDrawn` and
   `borderInsideTrue` agree to ~0.01 mm (ellipsoid 0.2126 vs 0.2094; sphere 0.1557 vs 0.1553; cone
   0.1454 vs 0.1597). The ruling ends are not moving — the polygon they are compared against is short.
2. **The deficit is in the VERTICES, not the chords.** Splitting the drawn-hull deficit into its hull
   **vertices** and its chord **interiors**: sphere · a **0.48 of 0.52 pen is at the vertices**;
   ellipsoid · a **0.70 of 0.71**. A lat-long mesh's silhouette-ring vertices sit ≈ `R(1−cos(π/n))`
   inside the true silhouette because their longitude straddles the terminator meridian. ⚠ **This kills
   the cheap variant outright: inserting refined mid-chord points while holding the mesh vertices fixed
   would recover ~4 % of the ellipsoid's deficit.** The vertices must move. (The cone is the exception —
   0.28 of 0.53 pen at vertices — because its deficit is mostly the **base rim**, a `boundary` edge whose
   vertices *are* exactly on the analytic rim; see §3.2.)
3. **It scales as the sagitta and with ruling count.** W-32 §A3's `detail` sweep (16 → 32 gives 3.96× /
   4.14× / 3.57×, the textbook quadratic) stands unchanged; this pass adds the second axis: at fixed
   `detail`, `d50 → d220` leaves the **magnitude** at 0.72 pen but takes **endpoints over the bar from
   4 to 14** on `ellipsoid · contour · a`. **More rulings do not make the gap bigger; they make more ends
   land where the gap already was.** That is why the ellipsoid — the largest primitive in the roster
   (semi-axis 30 mm) at a comparable tessellation — is worst, and why W-32's primitive set hid it.

---

## 3. Ranked mechanisms — **Rank 1 PROTOTYPED**

### 3.1 The ranking

| rank | mechanism | verdict |
|---|---|---|
| **1** | **Refine the silhouette/boundary edge chain onto the ANALYTIC silhouette** in `scene3d.js`'s structural edge pass, gated to CONVEX charted primitives | **PROTOTYPED — gate cleared on every clause. Recommended.** |
| 2 | Same, extended to the **torus** (non-convex) via the W-27c precedent (`SELF_OCCLUDE_BIAS` on the refined edge's own clip ctx) | **FILED, not attempted.** Measured to break two contiguity guards as written (§3.3). A follow-up with its own RED. |
| 3 | **Clip ruling ends to the drawn polygon, or to it inset by half a pen** (the brief's alternative; W-32's Rank 3) | **REJECTED BY MEASUREMENT.** It fixes the symptom at the cost of the thing Jay asked for more of: it would pull ink back from the true silhouette by up to 0.72 pen, it contradicts the design decision written at `surface-fill.js:5785`, and its only in-lane site is the fill emit block in `scene3d.js` (a clip on `lines.forEach` → `clipper.clipPath`). Rank 1 reaches **0.02 pen** without moving a single fill point (**fill ink 0.000 % on every cell**), so there is nothing left for a clip to buy. ⚠ **Keeping W-35's `sliceEndOverlap` semantics is free under Rank 1**: the contourSlice pass is not touched, and `contourSlice` geometry is **byte-identical on all 12 charted cells** (§3.4). |
| 4 | Raise the creation `detail` | **REJECTED, as W-35b Rank 3 already ruled**: `PRIMITIVE_CREATE_DEFAULTS` is a shape contract, not a quality knob. Recorded so nobody re-tries it. |

### 3.2 Rank 1 — the mechanism, with the call sites

The silhouette of an implicit surface is the curve where the surface normal is perpendicular to the view
direction. In LOCAL space that is two scalar equations:

```
F(p)      = 0                  on the surface        (sliceSurfaceFG, scene3d.js:519)
G(p) = ∇F(p) · v = 0           on the silhouette     (v = the view direction in LOCAL space)
```

`v` is obtained without touching camera internals: `d(screen)/d(world)` is a 2 × 3 matrix sampled from the
pass's **own** projector (`scene.projectWorld`, the same one `projectPath` uses), and the view direction is
its null direction — the cross product of its two rows. Mapping it to local space by
`sliceInverseObjectTransform` is exact, because the world silhouette condition `n_w·d_w = 0` is *identically*
`g_l·(M⁻¹d_w) = 0` — no normal-matrix transpose is needed. `∇G` is taken by central differences on
`sliceSurfaceFG`, so **the mechanism inherits exactly that function's primitive coverage and no more**
(sphere/ellipsoid, cylinder, cone, torus, capsule; `null` for superellipsoid / torusKnot / solid ⇒ the
chord is left alone). The step is the minimum-norm Newton step `Δ = Jᵀ(JJᵀ)⁻¹(−[F;G])` with the same
divergence guard `sliceAnalyticProjectLocal` already carries (reject a step longer than the primitive's own
scale; keep the best point seen).

Applied in two places, both inside the existing edge loop:

- **vertices** — each silhouette-edge endpoint is projected once per record and **memoised by vertex
  index**, so two edges sharing a vertex get the identical corrected point and the chain still welds on
  exact float equality. **A vertex that also belongs to a `boundary` edge is never moved** (it is already
  exactly on the analytic rim; moving it would tear the rim from the slant).
- **interiors** — each chord is subdivided into **4**, and each interior point is projected: onto the
  **silhouette** for `cls === 'silhouette'`, and onto the **rim** for `cls === 'boundary'` via the
  existing `sliceAnalyticProjectLocal` with the rim's plane normal. ⚠ **The rim's plane normal is the
  local pole axis `(0,1,0)` when the two endpoints share a local `y`** — the first prototype derived it as
  `t × ∇F`, which is tilted by the cone's own slope and left **0.0707 mm** on the cone's base rim; with
  the pole-axis rule the cone goes to **0.0090 mm**. That is the one subtlety in the whole mechanism and it
  is worth 0.16 pen.

**Diff:** `rank1-prototype.diff` — **one file (`src/core/algorithms/scene3d.js`), 4 hunks, +164 / −2 lines**:
a new `silhouetteProjectLocal` beside `sliceAnalyticProjectLocal` (`:607`), one gate constant beside
`SLICE_SMOOTH_EXCLUDED` (`:674`), a per-record `silRefine` closure after
`const classified = Edges.classifyEdges(record, {});` (`:3928`), and a **3-line** change at the clip call
(`:5173`). `meta.straight` is deleted when an edge is refined — the same rule `emitBorderChains` already
applies to a stitched strip (`if (pts.length > 2) delete meta.straight;`).

### 3.3 Spike gate — result per clause

**Clause 1 — overshoot per primitive, before → after, both rigs, both cameras, both densities.**
Bar ≤ 0.5 pen, target ≤ 0.25.

| rig · density | primitive | worst osDrawn **before** | worst osDrawn **after** | ends > 0.5 pen before → after |
|---|---|---|---|---|
| create · med | **ellipsoid** | **0.71 pen** | **0.01 pen** | 12 → **0** |
| create · med | sphere | 0.52 | **0.00** | 2 → **0** |
| create · med | cone | 0.48 | **0.02** | 0 → 0 |
| create · med | capsule | 0.25 | **0.01** | 0 → 0 |
| create · med | cylinder | 0.12 | **0.00** | 0 → 0 |
| create · **max** | **ellipsoid** | **0.72** | **0.01** | **41 → 0** |
| create · max | sphere | 0.52 | **0.00** | 13 → **0** |
| create · max | cone | 0.52 | **0.02** | 4 → **0** |
| addLayer · med+max | sphere / ellipsoid | 0.52 / 0.52 | **0.00 / 0.01** | 15 + 26 → **0** |
| addLayer · med+max | capsule / cone / cylinder | 0.28 / 0.35 / 0.07 | **0.01 / 0.01 / 0.02** | 0 → 0 |

**Worst cell in the whole sweep after the fix: 0.02 pen. 132 of 132 cells at or under 0.02 pen.
111 endpoints over the bar → 0.** The drawn-border deficit itself goes 0.70 → 0.01 pen (ellipsoid),
0.52 → 0.00 (sphere), 0.55 → 0.03 (cone).

**Clause 2 — ink.** `inkFill` is **0.000 % changed on every one of the 132 cells** — the fix does not
touch a fill point, by construction. `inkEdge` rises, because the true silhouette is genuinely longer than
the polygon inscribed in it plus the subdivision: **capsule +0.14 %, sphere +0.13 %, ellipsoid +0.18 %,
cylinder +0.04 %, cone +1.56 %** (the cone's rim is the largest correction). **Ground-plane ink is not in
any of these totals** (ground off in every measured cell).

**Clause 3 — the W-35 stair-step metric** (second difference of end position along the drawn outline over
arclength-consecutive silhouette ends, gaps ≤ 3 mm — W-35b's own instrument, re-run against the *new*
outline), worst p90 in pens, `create · med`, both cameras:

| primitive | before | after |
|---|---|---|
| cone | 0.238 | **0.009** |
| cylinder | 0.099 | **0.019** |
| capsule | 0.460 | 0.439 |
| sphere | 0.619 | 0.596 |
| **ellipsoid** | **0.764** | **0.655** |

⚠ **This is the claim in the record that this pass corrects.** `LEDGER.md` row 4 and §4 decision 9 both
say Rank 4 *"would also have satisfied W-35"*. **It satisfies W-35's OUTER-EDGE-FIDELITY half completely**
— the ends now land on the outline instead of past it, which is what Jay's sentence asked for — **and it
does NOT remove the raggedness half.** The residual is the spiral's alternation that W-35b filed as FU-2,
and `scene3d-fill-boundary-ends.test.js:38-43` records the measurement that part of it is a *mapper
contract* (a helix's turn legitimately begins and ends on the wind meridian), not a defect. **Say this in
the merge note rather than letting "it also satisfied W-35" stand.**

**Clause 4 — perf.** 5-run mean of `computeAllDisplayGeometry` at `d220 · crosshatch`, prototype OFF → ON:
sphere **306.6 → 305.0 ms**, ellipsoid **258.8 → 260.2 ms**, cone **220.6 → 223.0 ms**. **Inside noise
(≤ 1 %).** The Newton is ~10 iterations × 6 gradient evaluations per point, on ≈ 4 points per silhouette
edge, with the vertex correction memoised — a few tens of thousands of flops per object per frame.
**No draft-frame gate is needed on perf grounds**; whether one is wanted on principle (the border-emphasis
pass skips draft) is an implementer decision, and the measurement says it costs nothing either way.

### 3.4 Byte-identity roster — **96 cells, `identity.js`**

md5 of emitted geometry at 9 dp, split by `meta.kind`, prototype ON vs OFF in one process.
**`MAPPERS` (8 of 8) × 12 primitives**, plus one ground cell:

| primitive group | mappers | `sceneFill` | `sceneEdge` | why |
|---|---|---|---|---|
| **torusKnot, superellipsoid, pyramid, box, plane, solid** (incl. `solidType:'importedMesh'`) | 8/8 each | **IDENTICAL** | **IDENTICAL** | `curvedChartParams` returns `null` for box/plane/solid, and `sliceSurfaceFG` returns `null` for superellipsoid/torusKnot ⇒ `silRefine` is never built. **48 of 48 cells fully byte-identical.** |
| **sphere, ellipsoid, capsule, cone, cylinder** | 8/8 each | **IDENTICAL** | CHANGED | the outline moves; **nothing else does** — including `contourSlice`, whose ring geometry rides `sceneFill` and is byte-identical, so **W-35's `sliceEndOverlap` semantics are untouched** |
| **torus** | 8/8 | IDENTICAL | CHANGED | **and it must NOT be** — see §3.3's torus finding below; the shipped gate excludes it, restoring full byte-identity here |
| **ground plane** (`sphere + ground`, hatch) | 1 | IDENTICAL | CHANGED (the sphere's) | the ground record is excluded **by name** (`record.id !== 'ground'`), so no ground path can move |

**The torus, measured honestly.** With the torus included, `scene3d-silhouette-contiguity` goes
**5/6** (`dangling` endpoints **0 → 48 / 96 / 176** at detail 12 / 24 / 44) and
`scene3d-border-contiguity` goes **6/7**, both on *"a torus keeps BOTH silhouette loops unbroken"*.
Mechanism: the torus is **non-convex**, so a silhouette point moved onto the analytic curve leaves the
tessellated hull and is then cut by the object's **own** occluder faces (the same class of false split
W-27c item 0(b) documents at `scene3d.js:4770-4790`, and whose fix there was to raise the same-object bias
to `SELF_OCCLUDE_BIAS`). **Gating the refinement to convex charts (`mode !== 'torus'`) returns both files
to 7/7 and 6/6 and restores byte-identity on every torus cell — verified.** The torus is therefore a
**named, measured exclusion with a filed follow-up (Rank 2)**, not an oversight.

### 3.5 The cross-object side effect — measured, and `hlr.js` is NOT needed

The predicted risk: the front object's outline moves **outward** while the HLR occluders stay the
tessellated faces, so a back object's rulings, still cut at the inscribed boundary, would end up **inside**
the front object's drawn outline. Measured on the two-sphere scene (`occl.js`, `create` bag, camera `a`,
320 × 220), signed gap from each cut end of the back sphere's rulings to the front sphere's drawn outline
(negative = under the occluder):

| | median | p90 | **most negative (pen)** | cuts under −0.5 pen |
|---|---|---|---|---|
| before, 4 surface-fill mappers × d50/d220 | 0.0000 | 0.0000 | 0.0000 (0.00) | 0 of 24–108 |
| **after** | **−0.021 … −0.027** | −0.004 … −0.010 | **−0.0993 … −0.1166 (0.33 … 0.39 pen)** | **0 of 24–108** |

**0.39 pen worst, 0.07 pen median — and the front object's outline is a 0.3 mm stroke CENTRED on that
polyline, so it covers 0.5 pen inward. Every intruding end is under the outline's own ink.** The
pre-existing positive outliers (ends stopping ~1.0–1.4 mm outside the occluder, 1–4 per cell) are
unchanged in kind and slightly smaller in magnitude (1.1255 → 1.0391 mm on `hatch · d50`).
**Conclusion: the lane's `hlr.js` grant goes UNUSED. Rank 1 touches one file.** If a reviewer wants the
occluders moved as well, the number to beat is 0.39 pen, and the cost is rebuilding occluder polygons
from a denser mesh every frame — a much larger unit for a defect that is currently invisible.

### 3.6 LOOKED AT IT — `crop-ellipsoid-contour-a-left-before-after.png`

48 px/mm offline raster of the emitted geometry (grey = `sceneEdge`, black = `sceneFill`, 0.3 mm round
strokes), left silhouette of `ellipsoid · contour · a · d50`, nearest-neighbour ×3, **before | after**
side by side. **What I see:** on the LEFT, the grey outline runs down the frame and **five ruling ends
stick out past it** — each ends in a short black cap sitting clearly to the *left* of the grey line, with
bare grey visible between caps; that is the 0.67-pen barb, and it is exactly Jay's *"lines breaking out
beyond the border."* On the RIGHT, the grey line has moved slightly outward (onto the true silhouette) and
**every black ruling end stops flush on it** — no cap protrudes, no ruling crosses, and the outline reads
as one continuous grey stroke with the rulings butting into it. Full-frame rasters `before.png` /
`after.png` are archived beside the crop.

### 3.7 Perspective cameras — the one place the prototype is approximate

The prototype derives `v` **once per record** at `record.world[0]`. That is exact for an orthographic
camera (the null direction of the projection is constant) and only *approximately* right under
perspective, where the view ray turns across the object. Measured on camera `p`
(`DEFAULT_CAMERA` + `projection:'perspective'`), `create · med`, overshoot before → after:
cone **0.20 → 0.01**, ellipsoid **0.21 → 0.02**, cylinder **0.00 → 0.00**, capsule **0.09 → 0.01**, but
**sphere · contour 0.19 → 0.21 pen** (border deficit 0.073 → 0.066 mm — only ~10 % recovered).
**Nothing regresses past the bar** (every perspective cell is ≤ 0.21 pen before and after), but the
mechanism demonstrably under-performs there. **REQUIRED in the shipped version: derive `v` per refined
point** — the same 2 × 3 null-direction computation, evaluated at that point instead of at the record
origin. It is the same code, called in a different place, and it makes the perspective case exact.
**The implementer must re-measure camera `p` after making that change and report it.**

---

## 4. Cross-lane note

- **`src/core/scene3d/surface-fill.js` is lane `fill-audit-a4`'s, with T2-5 in flight. Rank 1 does not
  touch it, and does not need to.** The honest fix is entirely in the border: the fill is already correct
  to 0.01 pen against the true silhouette, and the prototype leaves `sceneFill` **byte-identical on all
  96 identity cells and all 132 measurement cells**. **No serialized follow-up in `surface-fill.js` is
  required by this unit.**
- **`src/core/scene3d/hlr.js` — this lane owns it, and §3.5 measured that it does not need to change.**
  Say so in the impl report rather than inventing an edit.
- **`src/core/scene3d/edges.js`** is read-only for this unit: the classification is right; only what is
  drawn for a `silhouette` / `boundary` edge changes.
- **`scripts/audit/scene3d-capture.js`** is untouched. The gallery was already rebuilt at the creation
  defaults (`426cc5e4`), so W-32's Rank-1 re-shoot is spent and this unit inherits the correct rig.

---

## 5. Guards, evidence, files, stop conditions

### 5.1 Guards — run on the PATCHED scratch export, one file per command, foreground, `timeout: 600000`

| file | result on the prototype | disposition |
|---|---|---|
| `tests/unit/scene3d-fill-boundary-ends.test.js` | **41/41** (and 41/41 pre-patch, 38.1 s) | **RE-RUN, NEVER EDIT** |
| `tests/unit/scene3d-silhouette-contiguity.test.js` | **6/6** with the torus gated out (**5/6** with it in) | must-not-break; it is the guard that found the torus |
| `tests/unit/scene3d-border-contiguity.test.js` | **7/7** with the torus gated out (**6/7** with it in) | same |
| `tests/unit/scene3d-border.test.js` · `-offset.test.js` · `-offset-geometry.test.js` | **5/5 · 7/7 · 7/7** | must-not-break |
| `tests/unit/scene3d-hlr.test.js` | **11/11** | must-not-break |
| `tests/unit/scene3d-edge-styles.test.js` · `scene3d-object-edge-styles.test.js` | **8/8 · 6/6** | must-not-break |
| `tests/unit/topoform-silhouette-plane-tracking.test.js` · `scene-delete-and-silhouette.test.js` | **5/5 · 8/8** | must-not-break |
| `tests/unit/scene3d-shadows.test.js` · `scene3d-shadow-light-silhouette.test.js` | **18/18 · 4/4** | the shadow family; shadows ride FACES, not edges |
| `tests/unit/scene3d-mappers.test.js` | **32/32** — incl. the buckyball spiral fingerprint (solid ⇒ untouched) | must-not-break |
| `tests/unit/scene3d-mark-laws-draw.test.js` (T1/T1b/T4 oracle) | **30/30** | must-not-break |
| **T4b** `tests/unit/scene3d-mkdashramp-dark-end.test.js` · `scene3d-insert-default-ink.test.js` | **4/4 · 6/6** | the ink floor is FILL ink, which is byte-identical |
| **F1-width-bar** `scene3d-ribbon-width-bar.test.js` · `scene3d-ribbon-width-create-rig.test.js` | **10/10 · 12/12** | must-not-break |
| `tests/unit/scene3d-plot-safety.test.js` | **5 passed, 1 skipped** (the skip is pre-existing) | must-not-break |
| ⚠ `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | **4/6** — see `## Bars changed` | **two fingerprints must be re-pinned WITH proof** |
| ⚠ `tests/unit/scene3d-curves.test.js` | **12/13** — see `## Bars changed` | **one stale assertion must be rewritten, not deleted** |

**Not run by this planner, named for the implementer:** `scene3d-shadow-anatomy`, `-receive`,
`-tone-gradient`, `scene3d-cast-shadow-zones`, `scene3d-form-shadow-limb` (Tier-2 slow; shadows are
face-driven, so the exposure is low but it is a claim to be measured, not assumed), and
`tests/integration/scene3d-fill-style-picker.test.js`. **`scene3d-tone-law-collapse.test.js` is Tier 1 —
start it with `--pool=forks --poolOptions.forks.singleFork=true` and `timeout: 600000`, let the tool
background it at the 600 s ceiling, and read the completion notification.**

**Pre-existing red at the base sha: NONE observed** in any file this unit runs. The implementer must still
reproduce the two ⚠ failures **at `b43fa4e3` unpatched** (they will pass there) so the transitions are
attributed to this unit and not inherited (binding rule 5).

### 5.2 The RED oracle this unit ships

**New file `tests/unit/scene3d-fill-silhouette-overshoot.test.js`** — W-32 §A5's file, still unwritten,
and W-35b's FU-3. **Do not edit `scene3d-fill-boundary-ends.test.js`.** Ship, at minimum:

| # | clause gated | assertion | RED today | mutation proof required |
|---|---|---|---|---|
| **O1** | overshoot past the **DRAWN** outline | ≤ **0.15 mm** for every non-pole ruling end, `{capsule, cone, cylinder, sphere, ellipsoid} × {hatch, contour, crosshatch, spiral} × {a,b} × {d50, d220}`, **`create` rig** | **RED: 0.2172 mm, 41 ends over on the ellipsoid at d220** | rebuild the drawn outline from `detail = 8` ⇒ O1 must fail by ≥ 3× (W-32 O4's measured 1.330 / 0.806 / 1.265 mm) |
| **O2** | the same on the **`addLayer`** rig | same bar | **RED: 0.1564 mm, 15 + 26 ends over** | rig is the mutation: a `create`-only bar is a claim about one rig |
| **O3** | **anti-cheat** — no end may be pulled off the chart | overshoot vs the **TRUE silhouette** ≤ 0.05 mm everywhere | GREEN today (≤ 0.0035 mm) and **must stay green** — it forbids the whole "trim the ends inward" family (Rank 3) from passing | mutate by insetting a ruling end 0.3 mm ⇒ O3 must stay green while O1 goes green — i.e. **O1 alone is not sufficient and the file must say so** |
| **O4** | **fill immobility** | `sceneFill` md5 at 9 dp unchanged by the fix on `{5 primitives} × {4 mappers}` | GREEN by construction | flip one fill point by 1 µm ⇒ O4 fails |
| **O5** | **byte-identity of the excluded set** | `sceneFill` **and** `sceneEdge` md5 unchanged on `{box, plane, pyramid, solid, superellipsoid, torusKnot, torus, ground}` × 8 mappers | GREEN | remove the `mode !== 'torus'` gate ⇒ O5 must fail on the torus |

⚠ **State which half you gate.** O1/O2 gate **overshoot**, not raggedness; they say nothing about W-35's
stair-step (§3.3 clause 3 shows it barely moves) and nothing about ink. **A fix that dragged every ruling
end 2 mm outward would pass O1 and fail O3.**

### 5.3 Evidence cells — **verified in the manifests before being named** (`manifest.*.jsonl`, both tiers)

Present in `manifest.A.1-1.jsonl` unless noted:
`ellipsoid__contour__ladder__med__a` · `ellipsoid__crosshatch__ladder__max__a` ·
`ellipsoid__spiral__ladder__med__a` · `ellipsoid__hatch__ladder__max__a` ·
`sphere__contour__ladder__med__a` · `sphere__hatch__ladder__med__a` ·
`capsule__contour__ladder__med__a` · `cylinder__contour__ladder__med__a` ·
`cone__crosshatch__ladder__med__a` (**`manifest.B.1-5.jsonl`**) ·
`torus__contour__ladder__med__a` (**the must-be-byte-identical control**).

⚠ **`ellipsoid`, `capsule`, `cylinder`, `torusKnot`, `superellipsoid`, `pyramid`, `solid`, `plane` live in
Tier A only** — a `manifest.B.*` glob alone reports them MISSING (W-35b's recorded false negative).
Shoot with `--tier A` for those and `--tier B` for `cone__crosshatch`, `--out
docs/3d-audit/fill-audit/after/W-32r4`, run **from MAIN** so the output lands in main's gallery dir, port
≥ 8495, kill the server after. **Crop the left/right silhouette at NATIVE resolution before judging** —
the barb is 0.2 mm and a whole 800 px cell hides it; `crop-ellipsoid-contour-a-left-before-after.png` in
this plan's evidence dir shows the region and the magnification that makes it legible.
**Byte-identical pairs must be explained** — `torus__contour` and every faceted cell **should** be
byte-identical, and that is the result, not a failure.

### 5.4 Files — allowed / forbidden

**Allowed:**
- `src/core/algorithms/scene3d.js` — **only** the four sites in `rank1-prototype.diff`: a new
  `silhouetteProjectLocal` beside `sliceAnalyticProjectLocal` (`:607-674`), the convex-chart gate
  (`:674`), the per-record `silRefine` closure after `Edges.classifyEdges` (`:3928`), and the clip call
  (`:5173`). **Nothing in the contourSlice pass (`:4650-4800`), nothing in the fill emit block, nothing
  in the border-emphasis helpers (`:3492-3800`)** — `emitBorderChains` consumes the refined runs
  unchanged.
- `tests/unit/scene3d-fill-silhouette-overshoot.test.js` — **new file.**
- The two disclosed re-pins in §`Bars changed`, and nothing else in `tests/`.
- `CHANGELOG.md`, `plans.md`, `README.md` release note per the Documentation Contracts table (this is a
  **rendering-output** change on curved primitives: `test:visual` is in the matrix, and the impl must run
  it). **No `params.js` key, no panel control, no `SCENE_MIGRATIONS` step, no `SCENE_VERSION` bump, no
  preset work** — the fix has no user-facing parameter.

**Forbidden:**
- `tests/unit/scene3d-fill-boundary-ends.test.js` — read it, never edit it.
- `src/core/scene3d/surface-fill.js` (lane `fill-audit-a4`, T2-5 in flight), `surface-fill-mono.js`,
  `mappers.js`.
- `src/core/scene3d/params.js` — `PRIMITIVE_CREATE_DEFAULTS` / `PRIMITIVE_PARAM_DEFAULTS` are a shape
  contract; Rank 4 is rejected.
- `src/config/user-presets.js` — generated.
- `scripts/audit/scene3d-capture.js` — the gallery rig is already correct.
- `src/core/scene3d/hlr.js` — **in lane, but measured unnecessary (§3.5). Opening it needs a number that
  beats 0.39 pen.**

### 5.5 Stop conditions

1. **STOP if `sceneFill` moves by a digit.** The fix's whole claim is that the fill was already right;
   `inkFill` is 0.000 % on 132 cells and the md5s match on 96. A fill delta means the change leaked.
2. **STOP if O3 (overshoot vs the TRUE silhouette) rises.** That is the tell that ink was pulled off the
   surface to satisfy a comparison against a polygon — W-32 §A5's anti-cheat, and the exact axis W-35
   exists to give the user *more* of.
3. **STOP if `scene3d-fill-boundary-ends` needs `TOL_MM`, `CELL` or its spiral exclusion touched.**
4. **STOP if the torus is un-gated without its own RED.** Two contiguity guards go red; the fix is Rank 2
   (the W-27c `SELF_OCCLUDE_BIAS` precedent) and it is a separate unit.
5. **STOP if any faceted / unsupported primitive changes.** 48 of 48 cells are byte-identical today; that
   is the contract, not an observation.
6. **STOP if the perspective correction (§3.7) is skipped.** Shipping the per-record `v` leaves the sphere
   ~10 % corrected under a perspective camera; the per-point derivation is the same code in a different
   place.
7. **STOP and report rather than fudge.** If the honest answer changes, ship the measurement.

### 5.6 Size — **ONE unit, not two**

| axis | size |
|---|---|
| files touched in `src/` | **1** (`scene3d.js`) |
| new functions | **1** (`silhouetteProjectLocal`, 36 lines) + **1** per-record closure (`silRefine`, ~70 lines) |
| existing functions modified | **0 structurally**; **1 call site** changed by 3 lines (`:5173`) |
| net lines | **+164 / −2**, 4 hunks |
| tests | **1 new file**, **2 disclosed re-pins** |
| lanes crossed | **0** — `hlr.js` measured unnecessary, `surface-fill.js` untouched |
| perf | **≤ 1 %, inside noise** |

**It was filed as "large" because it was assumed to need `hlr.js` and an occluder rebuild. The
measurement says it does not.** The two things that *would* make it two units are both filed as
follow-ups rather than folded in: **the torus (Rank 2)** and **`hlr.js` occluder parity** (unnecessary at
0.39 pen). **Recommendation: one implementer, one commit, serialized behind nothing.**

### 5.7 Follow-ups left behind (filed, not attempted)

- **FU-1 → Rank 2, the torus.** Non-convex silhouette refinement needs the same-object clip bias raised
  the way W-27c item 0(b) raised it for analytically-snapped slice rings. RED already measured:
  `dangling` 0 → 48 / 96 / 176 at detail 12 / 24 / 44.
- **FU-2 → W-35b's spiral alternation (its own FU-2) survives this fix**: `ellipsoid · spiral · a`
  stair-step p90 **0.764 → 0.655 pen**. Partly a documented mapper contract; **it is not closed by
  W-32 Rank 4 and the merge note must say so.**
- **FU-3 → wireframe crease junctions.** A vertex shared between a refined `silhouette` edge and an
  unrefined `crease` edge moves by up to 0.22 mm, so under a **wireframe** mapper the crease can meet the
  outline with a sub-quarter-pen step. Creases are suppressed for `none` and for every surface fill
  (`scene3d.js:5140-5155`), so this is reachable only under wireframe; **`scene3d-edge-styles` 8/8 and
  `scene3d-object-edge-styles` 6/6 do not see it.** Measure it or gate it; do not leave it unnamed.

---

## Bars changed

Two pinned values in existing tests must move. **Both are disclosed here and both must be re-pinned WITH
the proof below in the commit body; neither may be re-pinned silently, and neither may be deleted.**

- **`tests/unit/scene3d-hlr-spatial-index-identity.test.js:342` — `'curvedOverlap-perspective-mixed-xray|settled'`
  `{ hash: 'cf19f35d…230102', pointCount: 1500 }` → `{ hash: '02a2b223…242e56', pointCount: 1760 }`
  — why:** the file pins a fingerprint of full generation output; this unit deliberately adds vertices to
  the drawn silhouette of curved primitives. **Proof that it is the intended delta and nothing else:
  `pathCount` is UNCHANGED at 424** (no path added, dropped, split or reordered — only point density
  rises, +17.3 %), the **`facetedOverlap-orthographic-hatch` scene is byte-identical on both settled and
  draft** (it has no curved primitive), and the §3.4 sweep shows `sceneFill` md5-identical on all 96 cells.
  ⚠ **The `|draft` key and the `denseMixed-8obj-shadows` pair (`:344-345`) move for the same reason and
  must be re-pinned in the same commit, each with its own before/after printed.**
- **`tests/unit/scene3d-curves.test.js:138-142` — the assertion `edges.every((p) => p.length === 2)` /
  `p.meta.straight === true` in *"RED: with Curves OFF the capsule silhouette is unsmoothable 2-point
  sticks"* — STALE ASSERTION, rewrite to the new contract, do not delete the coverage.** The product
  behaviour intentionally changed: a refined silhouette edge is a 5-point polyline and drops
  `meta.straight`, exactly as `emitBorderChains` already does for a stitched strip
  (`if (pts.length > 2) delete meta.straight;`). The test's *purpose* — "Curves OFF must not smooth the
  silhouette" — is still gateable and must be kept: assert that with Curves OFF the silhouette carries no
  fitted curve (`curvedPaths(edges).length === 0`, which **still passes**) rather than that it is
  2-point sticks. **The other 12 tests in the file, including "Curves ON chains the capsule silhouette
  into real curved runs" and the three never-curved gates (box / solid / plane), pass unchanged.**

**No tolerance was widened. No population or fixture of an existing assertion was narrowed.** The bars
proposed in §5.2 (O1–O5) are **new** bars in a **new** file; O1/O2's 0.15 mm is **W-32's own 0.5-pen bar**,
restated at its source, and O3's 0.05 mm is W-32 §A5's O3 carried forward verbatim.
