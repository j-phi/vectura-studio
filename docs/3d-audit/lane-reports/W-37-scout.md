STATUS: CLOSE-MEASURED

## W-37 scout — does `toCurveAnchors` still decline on contourSlice rings at 426cc5e4?

Scout only. Measured in a scratch export of `426cc5e4` (v1.4.1 confirmed via
`package.json`), never touching any worktree or main. Rig: `tests/helpers/load-vectura-runtime`,
`V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS`, cameras a (default ortho) / b (yaw 40, pitch -15),
mirroring `W-34-plan.md`'s and `scene3d-fill-ruling-corners.test.js`'s own rigs. Probe file
(not committed anywhere, scratch-only): `tests/unit/w37-scout-probe.test.js` in the scratch
export, run with `npx vitest run … --pool=forks --poolOptions.forks.singleFork=true`, one file,
foreground, 7 tests, ~20s.

**Bottom line: the original claim ("every contourSlice ring declines, Fill Curves is globally
inert there") does NOT reproduce.** Since it was filed, W-33/W-34/W-34b/W-35/W-27c-0a-6 changed
the slices pass enough that the fitter now *engages* on the large majority of contourSlice rings
roster-wide. A narrow, harmless residual remains on cone only. Per the Round-3 brief's own
instruction ("if the gate now engages, close it as MEASURED"), this closes as CLOSE-MEASURED,
not REPRODUCES, and not NEEDS-PLANNER.

### 1. Gate outcome — straight vs fitted, per primitive/camera, contourSlice (app-default fillCurves opts: curves:true, smoothing:0, simplify:0)

| primitive | cam | total paths | declined (straight) | fitted | worst M1 (deg) |
|---|---|---|---|---|---|
| sphere | a | 26 | 1 (len 2) | 25 | 7.966 |
| sphere | b | 27 | 0 | 27 | 7.985 |
| torus | a | 44 | 1 (len 2) | 43 | 7.579 |
| torus | b | 46 | 0 | 46 | 7.864 |
| **cone** | a | 22 | **3** (len 287/436/521, M1 5.2/6.5/4.9°) | 19 | 7.850 |
| **cone** | b | 21 | **3** (len 262/394/426, M1 6.1/7.3/5.4°) | 18 | 7.320 |
| **cylinder** | a | 26 | **26 (100%)**, all len 2, M1 0.000 | 0 | 0.000 |
| **cylinder** | b | 26 | **26 (100%)**, all len 2, M1 0.000 | 0 | 0.000 |
| ellipsoid | a | 27 | 2 (len 2) | 25 | 7.965 |
| ellipsoid | b | 27 | 2 (len 2) | 25 | 7.977 |
| capsule | a | 30 | 4 (len 2) | 26 | 7.965 |
| capsule | b | 25 | 3 (len 2) | 22 | 7.997 |

So: sphere/torus/ellipsoid/capsule decline only on a handful of `len:2` two-point stub paths
(zero-length/degenerate — the exact "degenerate stubs" the ROUND3-BRIEFS filed as **belonging to
the W-29 family, not W-37**: "zero-length 2-point paths (sphere 19, ellipsoid 8 and 19, torus 37,
capsule 1/2/4/10/13/19/20)"). Those are trivially straight by definition (2 points = a line
segment) — no fitter could ever curve them, W-29's territory, not this unit's.

Cylinder declines on **100% of its rings**, but M1 = 0.000° everywhere: a plane parallel to a
cylinder's axis genuinely cuts it in **straight lines** (real geometry — the cross-section IS two
parallel line segments). Correctly inert, not a defect.

Cone declines on **3 of ~21-22 real, substantial rings per camera** (hundreds of points each,
M1 well under the 8° bar). This is the one residual worth explaining.

### 2. Mechanism on the 3 residual cone rings — confirmed, and it is the fixed-window-vs-local-curvature effect the plan already suspected

`toCurveAnchors` → `reduceAnchors` (`geometry-utils.js:2120,2128,2132`) detects a corner via a
**windowed tangent** dot-product test (`_reduceTangents`, window = `windowDistFrac` × bbox
diagonal, default 0.035 = 3.5%), NOT the immediate-neighbour turn M1 measures. Bisecting
`cornerAngleDeg` on the declined cone ring (camera a): default is 50°, and it does not flip to
"fitted" until **cornerAngleDeg ≈ 109°** — i.e. the windowed tangent swings ~109° across that
window, even though the per-vertex M1 turn is only 5-7°. Shrinking `windowDistFrac` confirms the
scale mismatch directly:

```
cone windowDistFrac=0.035: straight=true   (default)
cone windowDistFrac=0.02:  straight=true
cone windowDistFrac=0.01:  straight=true
cone windowDistFrac=0.005: straight=false  ← flips to fitted
cone windowDistFrac=0.002: straight=false
cone windowDistFrac=0.001: straight=false
```
All five other primitives never flip at any window scale down to 0.001 (nothing to flip — no
non-trivial ring declines there). This is exactly the geometry W-34-plan.md already named: these
3 rings sit near the cone's apex/near-apex region, where the true analytic cross-section has a
real, sharp local curvature (the same rings the plan measured at 76.4°/38.4°/24.9° under the M2
arc-turn metric) even though targeted-bisection refinement already pulled the per-vertex M1 turn
under 8°. The windowed-tangent gate is seeing that real curvature over a longer arc than M1 does,
and (correctly, by its own design intent — "claiming a curve and drawing chords is strictly worse
than not claiming one") declines rather than fabricate smoothness across it.

### 3. Does it matter to the user? — no, on two independent grounds

- **The declined rings cost nothing.** By construction, a declined ring is byte-identical whether
  `fillCurves` is ON or OFF — there is no picture difference to lose on exactly these 3 cone
  rings (they render identically either way).
- **Rendered-picture diff, ON vs OFF, real app-default pipeline** (`eng.addSceneTree()` →
  `fillCurves` seeded `true`, camera a, contourSlice, all 6 primitives; Hausdorff-style
  nearest-point deviation between the flattened ON polyline and the raw OFF polyline, matched
  per-path by centroid — NOT naive index-pairing, which falsely inflated the first pass to
  14-48mm before the fix):

  | primitive | md5 match | max deviation (mm) | note |
  |---|---|---|---|
  | sphere | false | 3.27 | real, from the 25 fitted rings |
  | torus | false | 0.02 | negligible |
  | cone | false | 14.22 | real, from the 18-19 fitted rings (NOT the 3 declined ones) |
  | cylinder | **true** | **0.000** | 100% declined, genuinely inert (real straight geometry) |
  | ellipsoid | false | 4.57 | real |
  | capsule | false | 11.13 | real |

  So Fill Curves is **actively engaged and visibly changing the picture** on 5 of 6 primitives'
  contourSlice output today. The one fully-inert primitive (cylinder) is inert because its rings
  have nothing to curve, not because the fitter is broken. The 3 residual cone declines are a
  vanishingly small fraction of that primitive's own ring count and contribute 0mm to cone's own
  14.22mm figure (which comes entirely from cone's other 18-19 rings, which DO fit).
- Per the scout brief's question 3 (does W-34's device-space refinement already make the residual
  harmless): yes — current roster-wide M1 (both cameras) is 7.32-7.99° everywhere non-degenerate
  (cylinder 0°), i.e. already at/under the ≤8° ledger bar on every primitive including cone. The
  3 declined cone rings are already inside that bar on M1; the windowed-tangent decline is a
  second, stricter, and in this case harmless net that a per-vertex-only reading would miss.

### 4. Comparison rig — contour FILL rulings (W-33's territory, run here only for cross-check per the brief)

Confirms W-33-review's finding independently: the gate **essentially never declines** on contour
FILL rulings except for the same-shaped `len:2` degenerate-stub cases seen at camera b on several
primitives (sphere 5, cone 5, cylinder 4, ellipsoid 9, capsule 4 — again `len:2` stubs, W-29
territory, not a windowed-tangent decline). Camera a is 0 declines across all 6 primitives. This
reconfirms ROUND3-BRIEFS' distinction: **W-33's residual is a POST-FIT over-bar number (the fitter
engages and still reads high), which is the opposite mechanism from W-37 (the fitter declining to
engage at all)** — the two are not the same bug, as already ruled.

### 5. Oracle recommendation

**No real loss exists, so no fix is warranted.** If a defensive regression guard is wanted anyway
(to catch some future change that widens the decline back to "every ring"), the smallest RGR
oracle would be a new file (not an edit to the existing 51/57-test guard files), e.g.
`tests/unit/scene3d-contour-slice-curve-gate.test.js`, asserting: for contourSlice at app-default
`fillCurves:true`, the ON/OFF max deviation stays > 0 for at least N of 6 primitives (proving the
fitter stays engaged roster-wide) and that any primitive at 0 deviation (cylinder today) also has
worst M1 == 0 (proving its inertness is real straight geometry, not a silent decline). Whichever
lane eventually owns this: **`geometry-utils.js` is not on any lane's ownership map today** (the
AGENT-PROTOCOL.md serialization table lists `surface-fill.js`, `surface-fill-mono.js`, `scene3d.js`
+ `context-bar.js`, `hlr.js`/`shadows.js`/pen-fill/fill-boolean, and `mappers.js` + slices in
`scene3d.js` — never `geometry-utils.js` itself), so a future test here would need its own lane
assignment before anyone edits the fitter, exactly as W-33's own follow-up already flagged.

## Recommendation

Close W-37 as **CLOSE-MEASURED**: the filed claim does not reproduce at its original scope on
`426cc5e4`; a narrow, real, and measured residual exists on 3-of-~21 cone contourSlice rings per
camera, caused by the windowed-tangent corner gate's fixed-fraction-of-bbox-diagonal window
mismatching the cone's local curvature scale near its apex, and it is harmless by direct
measurement (0mm cost, already-compliant M1, rings already dense enough to read smooth). No
planner, no implementer needed. If Jay wants a permanent regression guard against this exact
gate re-widening, file a fresh, separately-owned unit for `geometry-utils.js` rather than folding
it into any current lane's files.
