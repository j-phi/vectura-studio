STATUS: DONE

# W-27c-0a-5 — tiny (<=4 raw point) torus contourSlice rings at refineSliceRing: measure-and-guard (implementer report)

Lane: fill-audit-d2. Worktree: `.claude/worktrees/fill-audit-d2` (branch
`3d-scene/fill-audit-d2`), port 8481. Base sha: `323e2583` (W-35). New sha:
`49cf0e3e`. Tests-only — `src/core/algorithms/scene3d.js` was **not touched**
in the worktree (confirmed: `git show --stat HEAD -- . ':!graphify-out'`
shows exactly one file, `tests/unit/scene3d-contour-slice.test.js`,
+336/-0).

## 0. Corrections to the brief's own framing

The brief's "5 of 47 linked torus contourSlice rings arrive at
refineSliceRing with <=4 raw points — one is a 3-point ring" is **close but
imprecise**. Measured precisely (default torus, sliceCount 26, the mapper's
own default — fillDensity never reaches this pass): **47 total front rings,
exactly 5 with <=4 raw points** (matches the brief's counts) — but the
per-ring breakdown is **two** 3-point rings, **one** 2-point ring, and
**two** 4-point rings, not "one is a 3-point ring." Both measurement methods
below agree on this to the point (level, rawCount, closed flag).

## 1. Measurement method (two independent methods, cross-validated)

**Method A — private instrumentation** (scratch export only, never
committed): `git -C <worktree> archive 323e2583 | tar -x -C
/private/tmp/claude-501/scratch-W27c5-measure`, node_modules symlinked. Added
a logging hook directly inside `refineSliceRing` (pushes an entry for
*every* front-side call, unconditionally, before any early bail, so a
2-point stub — which bails before even reaching the dedup step — still
occupies its queue slot; the first draft of this hook missed that case and
silently mis-numbered subsequent rings, caught by cross-checking against
Method B) plus a `culled` flag set at the crowd-cull call site
(`isRunCrowded`). Ran via a vitest test file dropped into the scratch
export, `engine.computeAllDisplayGeometry()`, real torus scene, fillDensity
50 and 220.

**Method B — public-API reconstruction** (shipped as the actual guard, so
`src/` stays untouched): rebuilds the mapper's own raw-link -> refine wiring
using *only* already-public exports — `Scene3D.Scene.assembleScene`,
`Scene3D.Slices.buildSliceSegments`, `Vectura.Geometry3D.linkSegments`,
`Scene3D.Slices.refineRing` / `analyticProjectLocal` / `localPlaneNormal` /
`inverseObjectTransform`, `Scene3D.Scene.applyObjectTransform` — the same
wiring W-34's `realPlaneZ0s()` precedent used to build a truth oracle
without touching scene3d.js. `sliceRotate`/`sliceTilt` default to 0, so the
plane normal is world +z (this rig slices along camera depth, not the
torus's own tube axis — the world-Y values recorded per ring span almost
the object's full height even for ordinary rings, because Y is a *screen*
coordinate here, not the slice axis; only Z is).

**Cross-validation**: Method A (post-fix, alignment bug corrected) and
Method B agree exactly on all 5 rings' level, rawCount, closed flag,
finalCount, finalLengthMm, and deviceMaxTurn (to 10+ significant figures).
Method A additionally confirms `culled: false` for all 5 (none is dropped
by the crowding cull) — a fact Method B cannot observe directly (the crowd
cull's `isRunCrowded`/`makeCrowdGrid`/`CROWD_*` constants are private), but
is corroborated by Method B's finding that all 5 are structurally
independent of the crowd radius (their raw geometry, not proximity to other
levels, is what makes them small).

## 2. The five rings (measured, `sliceCount 26`, med=max byte-identical)

| level | rawCount | closed | finalCount | finalLengthMm | deviceMaxTurn (deg) | roundsUsed | culled |
|---|---|---|---|---|---|---|---|
| 2 | 3 | false | 3 | 0.9577085225447255 | 1.903903680150751 | 0 | false |
| 2 | 4 | false | 4 | 9.008240123917343 | 2.2996801184195714 | 0 | false |
| 6 | 3 | false | **513** | 0.0040003198533569585 | **179.99932751408932** | **8** | false |
| 21 | 2 | false | 2 | 2.4294681743220017 | 0 | 0 | false |
| 25 | 4 | false | 4 | 5.727369993006849 | 5.440164012679135 | 0 | false |

Total front rings: **47**. Small (<=4 raw points): **5**. All open (not
closed) both before and after refinement. Sum of `finalLengthMm` across the
five: **18.1268mm**. Total emitted pathCount at fillDensity 50/220 (the
real, cull-active engine pipeline): **44/44** (byte-identical, matching the
already-established med==max invariant for this mapper).

**The interesting finding — a previously-undisclosed non-convergence
defect.** The level-6 ring's two raw points sit **0.0038mm apart** — inside
the "close enough to be a numerical hazard" band but *outside*
`refineSliceRing`'s own `DUP_EPS` (1e-4mm) seam-dedup, so they are not
merged. Subdividing this 3-point ring drives the Catmull-Rom scheme into
genuine non-convergence: it consumes **every one of the 8 refinement
rounds** (`SLICE_REFINE_MAX_ROUNDS`), balloons to **513 points**, and its
device-space max turning angle **never drops below ~180 degrees** — nowhere
close to the 8 degree stop condition the loop is supposed to satisfy. This
is exactly the pathology `refineSliceRing`'s own source comment already
warns about for near-duplicate seam points ("measured as a runaway 180 deg
spike after repeated rounds instead of convergence"), just previously
unmeasured/undisclosed for this specific ring. It is harmless **today**
only because its drawn length stays at **0.004mm** — three orders of
magnitude under one pen width (0.3mm) — so it never becomes visible ink.
The other four small rings converge normally in round 0 (no subdivision
needed — already under the 8 degree bar) with unremarkable lengths
(0.96-9.0mm) and turns (0-5.4 degrees).

None of the five is dropped by the crowding cull (`culled: false` for all
5, Method A). None is a fragment (`finalCount >= 2` for all 5, trivially —
the smallest, the 2-point stub, bails out of `refineSliceRing` before the
`< 3` gate and is returned unchanged). None flips open<->closed (all 5 are
open both before and after — refinement only appends a closing duplicate
when the *raw* ring was already closed).

## 3. Guard added (RGR)

New `describe('W-27c-0a-5 — torus contourSlice rings with <=4 raw points at
refineSliceRing (measurement pin)', ...)` in
`tests/unit/scene3d-contour-slice.test.js`, nested inside the file's own
outer `describe('CtS I5 ...')` (reuses the outer block's `V`/`algo`/
`defaults`/`clone`/`BOUNDS` — no separate runtime). **6 new tests**:

1. Total front-ring count (envelope 40-55, tight pin 47) and small-ring
   count (tight pin 5).
2. `fillDensity` 50 vs 220 byte-identity for the real engine pipeline
   (pathCount + total ink), extending the already-established med==max
   invariant to this specific ring set.
3. The five rings' exact discrete signature (level/rawCount/closed/
   roundsUsed — tight) plus a floor/ceiling +-10% band (W-26b-3 shape) on
   the continuous outputs (finalCount/finalLengthMm/deviceMaxTurn) —
   **explicitly commented as a measurement pin, not a claim of
   correctness**: it does not assert the level-6 ring's non-convergence is
   *right*, only that its shape stays within the measured envelope.
4. Fragment/open-flip guard: `finalCount >= 2` and `closed === false` for
   all five.
5. A dedicated harmlessness bar on the level-6 ring specifically:
   `roundsUsed === 8` (tight — a future fix that makes it converge is a
   genuine improvement requiring `## Bars changed` disclosure, not a
   silent pass), `deviceMaxTurn > 160`, `finalLengthMm < 0.05mm` (>10x
   headroom over the measured 0.004mm — the actual "does not become a
   visible blob" guard), `finalCount <= 700` (measured 513, headroom
   against the insertion rate growing worse).
6. Sum-of-length and worst-turn-across-the-five +-10% band.

**RED proof** (mutation test, scratch export, never committed): `git -C
<worktree> archive 323e2583 | tar -x -C
/private/tmp/claude-501/scratch-W27c5`, node_modules symlinked, copied the
updated (post-fix) test file into the export, then mutated
`refineSliceRing` to `if (worldPts.length <= 4) return worldPts;` right
after the existing `< 3` bail — simulating a future change that silently
skips refinement for tiny rings. Result: **2 of the 6 new tests fail
exactly as expected** — the discrete-signature test
(`deviceMaxTurn`/`roundsUsed` diverge from the pinned band: level-6's
deviceMaxTurn becomes exactly `0` instead of ~180, roundsUsed becomes `0`
instead of `8`) and the level-6 harmlessness test (`roundsUsed` becomes `0`,
failing the tight `toBe(8)`). The other 4 new tests still pass at this
mutation (total/small counts, med/max identity, fragment guard, and the
sum/worst-turn band all happen to still fall inside their bands even under
this specific mutation — the mutation changes shape, not gross counts).
This proves the guard has teeth against exactly the failure mode named in
the brief (skipping refinement for tiny rings). Scratch directories removed
after use (both the measurement scratch and the mutation scratch).

**GREEN at HEAD** (`49cf0e3e`): all 6 new tests pass.

## 4. Full suite runs (foreground, one file at a time)

| suite | result |
|---|---|
| `tests/unit/scene3d-contour-slice.test.js` (full file) | **63/63** (57 pre-existing + 6 new) |
| `tests/unit/scene3d-contour-slice-corners.test.js` (W-34's corner tests) | **25/25**, unaffected |

Ran together in one foreground vitest invocation as well: **88/88**.

## 5. Evidence

**No evidence re-shoot.** This unit changes zero rendered pixels — no
`src/` file was touched, so the app's actual output (screenshots, SVG
export, gallery cells) is byte-identical to `323e2583`. Per protocol,
stating this plainly instead of capturing a byte-identical "before/after"
pair.

## 6. Bars changed

**None.** Every assertion added by this unit is a **new** bar (this exact
ring set — the <=4-raw-point subset of the torus's 47 contourSlice front
rings — was never measured or asserted on by any prior W-27c-0a/W-34/W-35
report or test). No existing tolerance, count ceiling, or fingerprint in
`tests/unit/scene3d-contour-slice.test.js` was moved.

## 7. Open follow-ups (not this unit's to fix — tests-only brief)

- **The level-6 ring's non-convergence is a real, previously-undisclosed
  defect** in `refineSliceRing`'s stop condition for near-duplicate
  (0.0038mm-apart, outside `DUP_EPS`) raw points. It is harmless today
  (0.004mm drawn length, invisible at any pen width) but is a landmine: any
  future change that widens the raw ring's point spacing at this exact
  saddle-adjacent plane (level 6 of 26) could turn a currently-invisible
  180-degree non-convergence into a visible one. Filed here for whoever
  next touches `refineSliceRing`'s stop condition or `DUP_EPS`; not fixed
  by this tests-only unit (would require a `src/` change, out of scope and
  forbidden by this unit's own brief).
- Cross-referencing W-27c-0a-2's own finding (§2d, "emit-order asymmetry"):
  that report found the *sphere's* pole rings are emitted first into an
  empty crowd grid and are therefore structurally invisible to the crowding
  cull. This unit's finding is a different, independent mechanism (a
  Catmull-Rom subdivision non-convergence on a near-duplicate 3-point
  input) but the same general shape — a defect that survives because its
  footprint is currently too small to matter. Worth keeping in mind
  together if a future unit ever touches slice-plane placement or mesh
  detail defaults, since either could grow this ring's raw point spacing.

## 8. Commit

Worktree `fill-audit-d2`, sha `49cf0e3e`. Staged file:
`tests/unit/scene3d-contour-slice.test.js` (git status confirmed no other
tracked file, `graphify-out` excluded per protocol). Not pushed.
