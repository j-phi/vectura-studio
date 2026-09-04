# Unit D — shadows falling onto other 3D objects

**Design.** New `src/core/scene3d/shadow-receive.js` (`Vectura.Scene3D.ShadowReceive`):
`pointInShadow(worldPoint, light, occluderSet, opts)` (Moller-Trumbore ray/triangle) +
`buildOccluderSet(records)` (every object's own world faces -> triangles, grouped per-object with
a bounding sphere). `Regions.combinedIntensity` gains an optional 4th `shadowFn` arg; an occluded
light's own contribution drops to 0 (ambient untouched). `scene3d.js` builds one occluder set per
frame, closes `shadowFn` over `currentReceiverObjectId` (reassigned per record like the existing
emissive `activeLights` plumbing) for self-shadow exclusion. New flag
`shadow.shadowReceiveOnObjects`, default **OFF** — every existing scene stays byte-identical.

**Perf** (`scripts/shadow-receive-evidence.js`, caster+cone + 8-object dense scene): naive linear
scan measured 101->3739ms (simple) / 89->3835ms (dense, 43x). Added a per-object bounding-sphere
early-out (`raySphereMayHit`, sound, no false negatives) mirroring `hlr.js:buildOccluderIndex`.
Result: 92->388ms (4.2x) / 89->428ms (4.8x) — still over the brief's ~1.5x guidance; per its own
stop condition this is REPORTED, not force-fixed: the residual cost is O(objects^2) by design and
needs a shared cross-object index/shadow-map, scoped as a follow-up. Flag OFF by default.

**Tests** (`tests/unit/scene3d-shadow-receive.test.js`, 10/10 green): hit/miss/grazing/self-
exclusion at module level; independent ray/sphere oracle proves I(inside)<I(outside) on a plane AND
a cone with a real margin; full `generate()` shows the flag alone changes receiver geometry and two
toneLaws (shadow ON) differ; weightScale invariant; light moved away = exact no-shadow geometry.
Red-proof (`VECTURA_PRE_SHADOWRECV=1`, pins regions.js+scene3d.js to `d5af9e30`) fails exactly the
3 wiring-dependent assertions, passes the other 7.

**Out of scope**: closing the ~4-5x dense-scene gap (needs a real BVH/shadow-map — a second unit);
soft shadows/penumbra (hard boolean only); point/spot shadow-receive is unit-covered but not
screenshotted (brief scopes evidence to one directional light).
`scene3d-hlr-spatial-index-identity.test.js` green; coverage-oracle denominator untouched (this
is an intensity-only change, no geometry removed).
