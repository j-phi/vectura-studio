# Unit D — shadows falling onto other 3D objects

**Design.** New `src/core/scene3d/shadow-receive.js` (`Vectura.Scene3D.ShadowReceive`):
`pointInShadow`/`buildOccluderSet` for CURVED receivers (per-point, via SurfaceFill — unchanged,
still correct). `Regions.combinedIntensity` gains an optional 4th `shadowFn` arg. Flag
`shadow.shadowReceiveOnObjects`, default **OFF**. Exposed in the UI (docked panel + context-bar).

## v2 — the FOOTPRINT-CLIP model (this commit)

**Judge rejection of v2-per-point (2893d842, then again on the per-point re-fix):** a box caster
over a plane produced only a diffuse density gradient, never a visible patch — `hatchRingsEvenOdd`'s
marching scan can only vary spacing along the perpendicular axis, uniformly across a ruling's whole
length, so it can never draw a genuinely 2D-bounded region.

**Fix, per the coordinator's design.** For FLAT (faceted) receiver faces only: reuse the
ground-shadow model instead of per-point sampling. `shadows.js` gained
`projectAlongDirToPlane(P, d, planeAnchor, planeNormal)` — the ground projector's own y=0 ray/plane
intersection, generalized to an arbitrary plane — and exports `convexHull` (already existed
privately). `scene3d.js`'s `buildFaceFootprint` projects every OTHER object's world vertices onto
THIS face's plane along the light travel direction, hulls them, and clips the hull to the face's
own visible outline (Sutherland-Hodgman against a convex polygon — every faceted primitive's face
is convex by construction). The clipped footprint is hatched at ONE scalar "inside" pitch (a
directional hard shadow is binary — every point shares the same occluded intensity, so a single
centroid sample suffices) via `Shadows.hatchRingsEvenOdd([footprint], ...)`; the rest of the face
is hatched at the "outside" pitch with the footprint as an even-odd HOLE
(`hatchRingsEvenOdd([face, footprint], ...)`). The boundary is therefore a real polygon clip edge.

**Two bugs found live while wiring this up (both fixed, both now covered by the RGR tests):**
1. `planeFor`'s memoized Round-10 narrow-facet grant returns ONE cached `f.plane` regardless of the
   screen-pitch argument it's called with — so calling it with two DIFFERENT pitches (inside vs
   outside) silently collapsed both to the identical value. Fixed with `planeRaw` (a direct
   `screenPitch / uvPitchFactor` conversion) used only for the footprint-split family A; the
   unsplit fallback and family B keep using `planeFor` exactly as before (byte-identical).
2. The "outside" pitch was sampled at the face's own geometric CENTROID — which can itself sit
   INSIDE a caster's footprint (the 320x320 test plane is centred at the origin, and the shadow
   happens to cover the origin), silently feeding the outside pass an already-shadowed value and
   collapsing it back onto the inside one. Fixed with `spacingBand(..., noShadowBaseline: true)`,
   which computes intensity via `Regions.combinedIntensity` WITHOUT the shadow term — the physically
   correct meaning of "the face's normal pitch". Both flags default false/undefined; every
   pre-existing `spacingBand` call site is untouched.
3. A THIRD bug, caught by the full `test:unit` run before commit (19 failures across the x-ray
   suite, all `TypeError: Cannot read properties of undefined (reading 'id')`): the x-ray back-face
   fill pass calls `faceHatchLines(face, backParams, face.normalWorld, mapper==='crosshatch')` —
   4 args only, `record` and `hlOpts` omitted, a pre-existing call site that never needed `record`
   before. `buildFaceFootprint(scaf, normalWorld, record.id)` dereferenced it unconditionally.
   Fixed by guarding the call (`record ? buildFaceFootprint(...) : null`) so a missing `record`
   degrades to "no footprint" (the ordinary unsplit hatch), never a crash. Full `test:unit` re-run
   clean afterward (4688 passed, 44 pre-existing skips, 0 failures).

**RGR** (`tests/unit/scene3d-shadow-receive.test.js`, 15/15 green): the existing box+plane density
test (>=1.5x) still passes; a NEW footprint-EDGE test samples two 5mm windows straddling the exact
projected footprint edge and requires >=2x — a diffuse gradient cannot pass this (RED confirmed:
the pinned `2893d842` baseline scores 0.96 on this exact assertion, and 0.84 on the original
density test). Family B (crosshatch/dark-zone second direction) is NOT footprint-split — out of
scope, unchanged, one scalar pass over the whole face.

## App verification

`scripts/shadow-receive-plane-evidence.js` (box + 320x320 plane, elevation 25, `ladder`, shipped
default tone ladder): `plane-shadow-{on,off,aside}-crop.png`. **Looked at the crops directly**: a
clear, straight-edged quadrilateral region is now visible in the `on` crop — absent in `off` and
`aside` (byte-different, confirmed). It reads as a denser-PACKED-lines texture rather than a solid
dark wash (expected for plotter-style line hatching — "dark" in this medium IS tighter line
spacing), with a crisp geometric boundary, a dramatic improvement over v1's invisible gradient.
Measured: the footprint-edge density ratio at the real rendered geometry is >=2x (matching the new
unit test). `scripts/shadow-receive-box-side-evidence.js`: a tall box casting onto a NEIGHBOURING
box's own side face (`box-side-{on,off}.png`) — 101 paths (on) vs 73 (off), with visibly denser
hatching appearing on the receiver's shadowed region in the `on` shot.

**Curved receivers unaffected**: `two-object-crop.png`, `control1-aside-crop.png`,
`control2-lawb-crop.png` (cone/sphere) are BYTE-IDENTICAL (md5) to before this commit.

**Perf** (judge's box+plane scene, 3 runs): OFF ~1.5-2.3ms, ON ~3.5-4.4ms (~2.4x). 8-object dense
scene: OFF ~23-27ms, ON ~100-120ms (~4.3x) — similar order to the prior per-point fix; flag stays
OFF by default, not force-fixed further per the brief's own stop condition.

## Known gaps (unchanged)
- Point/spot lights: no integration-level proof through `combinedIntensity`.
- Area lights lose all N-sample softening when occluded (hard gate before averaging).
- Family B (crosshatch/dark-zone) is not footprint-split.
- `scene3d-hlr-spatial-index-identity.test.js` green; flag OFF byte-identical to before.
