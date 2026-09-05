# Unit D — shadows falling onto other 3D objects

**Design.** New `src/core/scene3d/shadow-receive.js` (`Vectura.Scene3D.ShadowReceive`):
`pointInShadow(worldPoint, light, occluderSet, opts)` (Moller-Trumbore ray/triangle) +
`buildOccluderSet(records)`. `Regions.combinedIntensity` gains an optional 4th `shadowFn` arg. New
flag `shadow.shadowReceiveOnObjects`, default **OFF**. Exposed in the UI (docked panel + context-bar
Shadow flyout), same (i) affordance pattern, render-cost blurb, WHOLE-STYLE-WINS tested.

## Judge rejection + fix (2893d842 -> this commit)

**Finding.** Box caster over a big flat PLANE receiver (hatch/ladder, elevation 25 deg): flag ON vs
OFF shifted ink fraction UNIFORMLY across the whole receiver, including far corners. No localized
patch. Root cause named: the FACETED path (`spacingBand` in `scene3d.js`) samples `intensityFn` —
and therefore `shadowFn` — ONCE at a face-region's centroid; a plane is one face, so its whole
surface got one uniform shift.

**Fix.** When `shadowReceiveOnObjects` is on, `faceHatchLines` builds a per-point spacing function
`spacingAtWorld(u,v)` (world point via `scaf.toWorld`, re-running `spacingBand` at that point) and
feeds it to `Shadows.hatchRingsEvenOdd` (newly exported; the SAME marching-scan primitive
`buildGradedSpacing` already uses) instead of `hatchPolygon`'s scalar spacing, for family A (the
carrier) and the automatic tone-driven second family. Rulings stay unbroken; only ruling-to-ruling
pitch varies. This bypasses `planeFor`/`plan` (Round 10's narrow-facet grant), which bakes ONE
scalar plane-pitch from a dry-run and cannot honor a per-point function; foreshortening
(`uvPitchFactor`, provably position-independent on a flat face) is applied directly instead.

**Second, independent bug found while verifying the fix** (not named by the judge): even after the
above, density stayed uniform. Instrumentation traced it to `recordBands` — the O20 rank-grade
mechanism caches ONE band per face, sampled ONCE at that face's centroid, keyed by object identity
for the WHOLE `generate()` call. Every re-invocation of `spacingBand` at a different per-point world
position still resolved through this cache, silently discarding the point-varying intensity.
Added `spacingBand(..., perPointGrade)`: when true, skips the rank cache and resolves the band
directly via `Regions.band` (the rank-spread mechanism is a cross-facet concept and has no meaning
within one continuous face anyway). Every pre-existing call site passes nothing here — byte-identical.

**RGR.** New describe block in `tests/unit/scene3d-shadow-receive.test.js`: box caster + 320x320
plane, independent ray/AABB oracle (never calls ShadowReceive). Measured density inside the
footprint vs 4 far corners: **ON ratio >= 1.5x (passes, ~2.4x with a stark 2-band ladder)**, OFF
ratio 0.7-1.3 (uniform, matches the judge's own OFF observation). A separate pin
(`VECTURA_PRE_FACETGRADE=1`, pins `scene3d.js`+`shadows.js` to `2893d842`) reproduces the judge's
exact finding: ratio 0.84, correctly RED. 13/13 green unpinned.

## App verification — honest visual finding

Re-shot the judge's exact scene (box + 320x320 plane, elevation 25, `ladder`) via
`scripts/shadow-receive-plane-evidence.js`: `plane-shadow-{on,off,aside}-{full,crop}.png`.
**Looked at the crops directly.** With the SHIPPED DEFAULT tone ladder (3 bands, `[0.2,0.5,0.85]`):
no visible dark patch, no visible straight edge — the hatch reads as uniform to the eye. A
pixel-count comparison (same crop window, ON vs a stark-2-band-ladder variant,
`plane-shadow-*-crop-starktone.png`) shows a REAL, substantial ink increase (61593 vs 44107 white
px in the same window, ~1.4x) confirming the mechanism fires — but even at that contrast it reads
as a diffuse density gradient across a band, not a crisp rectangular footprint. **This is an
architectural limit of the fix, not a bug**: `hatchRingsEvenOdd`'s marching scan varies spacing only
along the PERPENDICULAR axis, uniformly across each ruling's full length — a genuinely 2D-bounded
patch would need the shadow's own silhouette clipped into the fill topology (out of scope here).
**Verdict: the acceptance bar ("a visible dark patch with a straight-edged footprint") is NOT met
visually at default settings**, even though the numeric mechanism is now spatially correct and
independently verified. Kept one curved-receiver crop from the prior evidence set
(`control1-aside-crop.png`, `control2-lawb-crop.png`, `two-object-crop.png` — cone receiver).

**Perf** (judge's box+plane scene, averaged over 3 runs): flag OFF ~1.7-2ms, ON ~3.7-4.2ms (~2.3x).
8-object dense scene (`shadow-receive-evidence.js`): OFF ~21-26ms, ON ~84-85ms (~3.3x) — essentially
unchanged from the prior per-object-bounding-sphere measurement; the per-point grading adds modest
cost on top but absolute times stay low-double-digit ms. Flag OFF by default; not force-fixed
further per the brief's own stop condition.

## Known gaps (unchanged from prior review)
- Point/spot lights: no integration-level proof through `combinedIntensity` (module-level only).
- Area lights lose all N-sample softening when occluded (hard gate runs before averaging).
- Closing the dense-scene perf ratio needs a real BVH/shadow-map.
- `scene3d-hlr-spatial-index-identity.test.js` green; coverage-oracle denominator untouched.
