# Unit D — shadows falling onto other 3D objects

**Design.** New `src/core/scene3d/shadow-receive.js` (`Vectura.Scene3D.ShadowReceive`):
`pointInShadow(worldPoint, light, occluderSet, opts)` (Moller-Trumbore ray/triangle) +
`buildOccluderSet(records)` (every object's own world faces -> triangles, grouped per-object with
a bounding sphere). `Regions.combinedIntensity` gains an optional 4th `shadowFn` arg; an occluded
light's own contribution drops to 0 (ambient untouched). `scene3d.js` builds one occluder set per
frame, closes `shadowFn` over `currentReceiverObjectId` (reassigned per record like the existing
emissive `activeLights` plumbing) for self-shadow exclusion. New flag
`shadow.shadowReceiveOnObjects`, default **OFF** — every existing scene stays byte-identical.
Exposed in the UI: a Shadows-land-on-objects On/Off row beside the shadow Fill Style picker, in
both the docked panel (`scene3d-panel.js`) and the context-bar Shadow flyout (`context-bar.js`),
with the same click-driven (i) affordance as that row and a one-line render-cost blurb.

**Perf** (`scripts/shadow-receive-evidence.js`, caster+cone + 8-object dense scene): naive linear
scan measured 101->3739ms (simple) / 89->3835ms (dense, 43x). Added a per-object bounding-sphere
early-out (`raySphereMayHit`, sound, no false negatives) mirroring `hlr.js:buildOccluderIndex`.
Result: ~90->~400ms (4-5x, varies with machine load) — still over the brief's ~1.5x guidance; per
its own stop condition this is REPORTED, not force-fixed: the residual cost is O(objects^2) by
design and needs a shared cross-object index/shadow-map, scoped as a follow-up. Flag OFF by default.

**Tests** (`tests/unit/scene3d-shadow-receive.test.js`, 10/10; `tests/integration/scene3d-fill-
style-picker.test.js` +10 new UI tests, 126/126): hit/miss/grazing/self-exclusion at module level;
independent ray/sphere oracle proves I(inside)<I(outside) on a plane AND a cone with a real margin;
full `generate()` shows the flag alone changes receiver geometry and two toneLaws (shadow ON)
differ; weightScale invariant; light moved away = exact no-shadow geometry; UI: row exists Off by
default, the (i) blurb, and WHOLE-STYLE-WINS (toggling the flag writes the correct scope and keeps
every sibling `shadow.*` key, both surfaces). Red-proof (`VECTURA_PRE_SHADOWRECV=1`, pins
regions.js+scene3d.js to `d5af9e30`) fails exactly the 3 wiring-dependent assertions.

**App verification — what the crops actually show.** Re-shot with `toneLaw:'ladder'` (plain hatch,
not `mazeFill`) on the receiver per review: `two-object-full.png` (sphere caster + cone receiver,
shadow ON), `control1-aside-{full,crop}.png` (caster moved far away — no occlusion possible),
`control2-lawb-{full,crop}.png` (receiver's own toneLaw switched to `turingStripe`). All three
crops are confirmed non-byte-identical (`stats.json`: `controlAsideDiffersFromShadowOn: true`,
`lawBDiffersFromLawAWithShadowOn: true`). **Looked at the crops directly (Read tool): the
law-changed control (`control2-lawb-crop.png`) is dramatically, obviously different from
`two-object-crop.png` — that half of the "renders in the receiver's own fill style" claim is
visually unmistakable. The shadow ITSELF, however, is NOT clearly visible by eye in the `ladder`
crops** (`two-object-crop.png` vs `control1-aside-crop.png`): the meridian hatch lines look nearly
identical at a glance, with only a subtle spacing difference in a few lines near the crop edges,
no obvious darker patch and no visible curved boundary on the cone. Stating this plainly rather
than reframing/re-tuning the scene: at this light angle, hatch density, and `ladder` law, the
intensity drop the shadow causes does not cross enough tone-ladder rungs over enough of the crop's
area to read as an obvious visual patch, even though the underlying mechanism is proven correct and
measured with a real numeric margin by the independent-oracle unit tests. A user relying on
`ladder`/default density may not visually notice this shadow without zooming in or picking a
denser/steeper light.

**Known gaps (corrected per review).**
- **Point/spot lights are NOT integration-covered.** `pointInShadow` supports a `type:'point'`
  light in its direction/maxT branching, and one module-level unit test calls it directly (the
  grazing case, incidentally using a point light as the ray target) — but there is no test proving
  the shadow term is correct for a point/spot light THROUGH `combinedIntensity`/the full pipeline,
  the way the directional case is proven with an independent-oracle margin. This is unverified,
  not merely "screenshot-only" as an earlier draft of this note said.
- **Area lights lose ALL softening when occluded.** `combinedIntensity`'s shadow gate
  (`if (shadowFn(P, light)) continue;`, `regions.js`) runs BEFORE the area light's N-sample
  softening loop, for every light type uniformly. An area light's whole point is a soft, gradual
  penumbra from averaging N sub-samples; `pointInShadow` tests a single ray from the light's
  nominal position, so occlusion is a hard binary cut that zeroes the light entirely rather than
  softening it — the opposite of what an area light should do under partial occlusion. Not fixed
  here; scoped as a follow-up (per-sub-sample occlusion testing, averaged like the light's own
  Lambert term already is).

**Out of scope (unchanged)**: closing the ~4-5x dense-scene perf gap (needs a real BVH/shadow-map);
soft shadows/penumbra in general (hard boolean only). `scene3d-hlr-spatial-index-identity.test.js`
green; coverage-oracle denominator untouched (intensity-only change, no geometry removed).
