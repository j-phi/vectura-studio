# Stroke-Fill + Shadow Effort — Handoff

**Current as of 2026-09-04, commit `3c448457` on branch `sf/preview`.** Nothing pushed, nothing
merged to `main`. Contracts and the original work-unit plan: `~/.claude/plans/stroke-fill-plan.md`
(outside the repo — copy it in if you are handing this to someone who cannot read it).

Preview: `cd .claude/worktrees/sf-preview && python3 -m http.server 8403`, add a 3D Scene layer,
set primitive to torus.

## Read this first — the three findings that cost the most to learn

**1. Per-vertex depth testing CANNOT enforce occlusion on a ribbon.** A ribbon's outline vertices
legitimately sit up to **2.3 mm** off the true surface — that is the ribbon's own half-width, by
design, not a defect. Genuine cusp occlusion on a torus measures as little as **0.05 mm**. The
ranges overlap by a factor of forty, so **no scalar depth epsilon separates "offset because it is a
ribbon edge" from "behind the near sheet."** Four separate approaches died on this before it was
understood. Occlusion here is a BOUNDARY problem: clip against the near sheet's projected
silhouette, and classify using the originating CENTRELINE sample, which lies on the true surface.

**2. `measureRingFillRate`'s denominator predates occlusion, and will mis-score any future fix.**
`tests/helpers/scene3d-ring-coverage.js` builds its denominator from rings captured at
`RibbonGeometry.clipMultiPolygonToRegion`, which fires BEFORE self-occlusion clips the final lines.
Ring area that occlusion legitimately removes therefore counts as ink-that-should-exist while
correctly receiving none. **Correctly hiding geometry scores as a coverage failure by
construction.** This cost two attempts: a working fix that already reached zero violations was
measured at 0.86 and thrown away. `captureSelfOcclusionFootprint` now excludes exactly what
occlusion removed. **If you add any new geometry-removing feature, check this helper before you
trust its verdict.**

**3. Harness-clean is not app-clean.** An entire integration passed its full suite while the ribbon
pipeline was INERT — every ribbon silently fell back to a bare centreline, so both defects
"vanished" because the feature had stopped producing width at all. No test caught it; a screenshot
did. A law emitting only bare centrelines, or `wallRings == 0`, is a FAILURE dressed as a pass.

## Approaches that are DEAD — do not retry

| Approach | Why it failed |
|---|---|
| Split ribbons at the fold cusp | Tidier polygons, adds no occlusion at all |
| Mesh face depth + 6 mm bias | Cusp gap is ~3 mm; the tolerance is wider than the feature |
| Analytic depth sampled on a (u,v) grid | Aliases at grazing angles; `wallRings` → 0, `onePenDown` → 0.155 |
| Ray/torus intersection per outline vertex | The 2.3 mm vs 0.05 mm overlap above |

## What this was

Two user reports:
1. Variable-width 3D fill styles rendered as a **staircase of constant-width capsules** with
   round-cap bulges, and **geometry protruding past the silhouette** after "Expand into group".
2. Voronoi Web needed to read as an unbroken web with **cell size carrying tone**.
Then: **shadows must darken where they overlap and fall onto other 3D objects.**
Then, during review: **contour lines from the back of a torus must never break through the top edge
of the front** — the user's own words, now the acceptance rule for self-occlusion.

## The fix, in one line

Stop asking for a fat pen. Build the true variable-width **ribbon outline** from the continuous
width profile, clip it to the form, stroke it with the real pen, and fill the interior at pen-width
pitch. Every path then carries `weightScale === 1`, so what you see IS real pen lines and
expand-into-group is correct by construction.

## Branch state

`sf/preview` is the single current branch — everything folded in, tree clean.

| Commit | |
|---|---|
| `3c448457` | this doc |
| `eb32e616` | merge of `sf/shadow-overlap` (clean, zero file overlap) |
| `da683934` | v1.3.98 — non-convex objects occlude themselves |
| `57e86f48` | v1.3.97 — fold-cusp ribbon splitting |
| `ecc50c16` | v1.3.96 — phantom-lobe clip regression removed |
| `e047c9a7` | v1.3.95 — sub-pen hairlines + outline/fill seam |
| `439319c0` | the original paused WIP checkpoint |

Historical: `sf/integration` (same work minus the merge), `sf/shadow-overlap`, `sf/w1-ribbon` …
`sf/w6-voronoi`. Base was `3d-scene/fs-batch` @ `5e92311b`.

Suites on `sf/preview`: unit 4669+, integration 1919, visual 99. Four RGR red proofs, each pinning
a different baseline SHA via `tests/helpers/pre-wip-surface-fill.js`:

    VECTURA_PRE_WIP=1         # 1b157bc6 — sub-pen fix, 34-36 of 36 red on wall-coverage
    VECTURA_PRE_WALLS_FIX=1   # e047c9a7 — phantom lobe, 58.27 vs 28.74 mm² ceiling
    VECTURA_PRE_F6=1          # ecc50c16 — fold-cusp splitting
    VECTURA_PRE_F7=1          # 57e86f48 — self-occlusion, the user's red-line rule

## DONE and independently verified

- **Stairstepping: GONE.** Pre-fix `nibAngle` had 357 distinct weightScales, 232 boundaries stepping
  >half a pen, max step 0.749 mm. Post-fix: one weightScale, max step **0.000**.
- **Protrusion: GONE.** Pre-fix ink reached r=46.52; post-fix every law reads **46.267**, identical
  to the untouched monowidth control, zero vertices outside r=46. Holds after expand.
- **Universality: PASS.** All **49** styles walked in the real app. 31 monowidth unchanged (30
  byte-identical), 12 ribbonized, 6 three-pen keep real distinct widths (0.867/1.733/3.1).
- **Voronoi Web: DONE.** 1 connected component, interior stubs 8229 → 0, 0/29689 vertices outside
  the silhouette, cell size spans 2.5x shadow-to-highlight.
- **Sub-pen hollow doubled hairline: GONE.** `CLS_WALLS` builds 1-2 pen ribbons analytically instead
  of through `erode(erode(region))`, which is unreliable below ~2 pens. `weightSmoothstep` ring-fill
  0.9627 → 1.0000.
- **Outline/fill seam: GONE.** Fill erosion `penWidth/2` → `penWidth*(0.5 - RIBBON_OVERLAP)`, giving
  that junction the same 15% overlap every other pass has.
- **Torus self-occlusion: the user's rule is ENFORCED.** 112 far-sheet crossings on `taperedEnds`
  and 23 on `weightSmoothstep` → **0 and 0**. `isConvexObject` (`scene.js`) gates it: convex
  primitives keep the zero-cost path and render **byte-identically**; only the torus and imported
  meshes pay. `ray-torus.js` solves the quartic in closed form (Ferrari, near-zero-q routed to the
  exact biquadratic, Newton polish — the naive form blew up to t~1e69 on an ordinary grazing ray).
  Tuning is two DECOUPLED knobs: 15 mm z-margin rejecting shallow same-surface noise, 3 mm 2D
  dilation radius (smallest reaching zero) absorbing foreshortening. A single coupled knob cannot
  satisfy both.
- **CSG carve regression, exposed and fixed here.** An edge-on BSP face projected screen-collinear
  (`normalCam.z ~ 5.3e-16`) but sign-positive on fp noise, read front-facing, and dragged a fill
  group's `nearZ` from 20 mm to 6.667 mm; once same-object occluders were really tested the object's
  own faces read as nearer and hid every hatch line. Faces with no usable support plane are now
  skipped before joining a fill group.
- **Seam-join width substitution, found via a lying counter.** The `onePenDown` stitcher appended
  points to `tail` without the matching `__hw` half-widths, so `flushDeferredRibbons` padded with
  tail's LAST width and re-inked the whole seam at the wrong width.
- **Shadow overlap tests pass 22/22** — run for the first time on `sf/preview`. The implementation
  itself is still unreviewed and never visually verified.

## Measured, NOT defects (do not re-litigate)

- **Tone is fine.** The "87% over-inked" figure was wrong — it double-counted overdraw (2.211x).
  Real coverage **39.4% vs 39.1% on base**. Ink LENGTH went 8x because the old build drew the same
  area as a fat pen at mean weightScale 3.6; ribbonize decomposes it into real 0.3 mm passes.
- **Coverage contract holds.** All four fill styles reach >= 0.9998 on real geometry. `concentric`
  is NOT gappy — spiral is the wasteful one (overdraw 2.15-3.11 vs 1.28-1.53). **Do NOT switch the
  default off spiral** — that trades the path-count requirement for a metric.
- **`scene3d-ribbon-weightscale-invariant` proves nothing about these fixes.** It passes against
  pre-fix code too. It is a T4 regression guard, not evidence.

## OPEN — the resume queue

**Numbering warning.** Finding IDs drifted between this doc and the plan file. In
`~/.claude/plans/stroke-fill-plan.md`, **F4** is the sub-pen / hollow-hairline bug and **F5** is
expand fidelity; this doc once called the sub-pen bug "F3". The queue below uses NAMES. Map by
description, never by number.

**Closed since the original queue:** items 1 (sub-pen ribbons + outline/fill seam) and 2 (torus
self-occlusion) are DONE and verified — see "DONE and independently verified" above. They are
replaced by items A and B below, which are what those two uncovered.

---

### A. F1 — residual streaks in the self-crossing laws  (REOPENED)

**Task.** Thin lengthwise gaps remain inside wide bands on exactly five laws: `interlockWeave`
2.4 mm², `onePenDown` 2.3, `trochoidLoop` 1.6, `ampSpacing` 1.4, `weaveDepth` 1.0 (uncovered
interior area, torus). That is the F1 self-crossing slab-collapse list **verbatim**. F1 was believed
closed by commit `2c9f37d6` ("self-crossing ribbons kept their loop holes"). It is not. Either that
fix is incomplete or something new wears its fingerprint.

**Value.** The user's own words on this: *"Not close to zero just yet."* Ring-fill-rate clears the
0.995 contract bar on all five, which is exactly why this needs a human eye rather than a metric —
the contract passes and the render still reads wrong.

**Done when.** All five reach the same ≤0.18 mm² band as the other seven laws; reproduced on a
torus first; RGR test red against `da683934`; the user confirms it by eye on the bench.

**Before you start:** re-read finding 2 at the top of this doc. If your fix removes geometry, the
coverage helper may mis-score it exactly as it mis-scored self-occlusion.

**Unit A (`3d-scene/handoff-b`) — STOPPED, reported.** Root cause narrowed to false-positive
self-occlusion clips (`hlr.js` F7) on CROSS-run crossings (separate centreline runs crossing in
screen space); the `zAlongRun` within-run fix (cut clip events 11→1 at two locations) did not move
the five mm² totals. See `docs/3d-audit/handoff/unit-a-notes.md`.

**Unit A2 (`3d-scene/handoff-c`) — STOPPED, reported.** Rewrote `Scene3D.TorusOcclusion`'s
self-occlusion test from a per-sample dilated ray to a dense analytic near/far FIELD (the F7
oracle's own method), made it AUTHORITATIVE over the coarse mesh test for same-object occlusion
(F7 stays 0/0, convex/imported-mesh paths byte-identical). **Measured, not guessed: self-occlusion
is not the cause of these five numbers** — a control with self-occlusion entirely absent
(pre-`57e86f48`) measures the SAME `ringNotInkMm2` (within run-to-run noise) as both the pre-fix and
post-fix trees. The real source is most likely `PenFill`/boolean erosion fragmenting `outlineMP`
near the same self-crossing loop holes — not yet isolated. Two genuine approaches now closed
without moving the metric. See `docs/3d-audit/handoff/unit-a2-notes.md`.

**Update (branch `3d-scene/handoff-b`, unit A session, `d5af9e30`): STILL OPEN, NOT a fill defect.**
Reproduced (2.01 / 2.00 / 1.49 / 1.24 / 0.87 mm² of the same five, torus, this session's own
measurement — RGR test `tests/unit/scene3d-ribbon-f1b-streaks.test.js`). The loop-hole-erosion
working hypothesis this doc names above was tested with three separate, code-grounded fixes (a
hole-boundary companion stroke, a fill-erosion depth fallback ladder, `PenFill.MAX_REPAIR_ROUNDS`
4→16) — none moved the numbers by more than ~1%, and all were reverted. **Located instead** (raw
`SurfaceFill.buildObject` output is fully inked at every streak location; `hlr.js`'s self-occlusion
clip removes it as a FALSE POSITIVE — confirmed against the F7 test's own independent oracle,
`scene3d-torus-hole-oracle.js`, which finds no genuine near/far overlap at those exact locations).
One real, in-scope contributor was found and fixed (`zAlongRun` in `surface-fill.js` picking the
wrong pass of a self-crossing centreline for a ring vertex's z, verified via `HLR.createClipper`
hooking: 11→1 false-positive clip events at the two locations checked) but reverted anyway — it
only reaches WITHIN-run self-crossings, and most of these five laws' "wide" stretches are
**separate runs crossing each other in screen space**, which a per-run z fix cannot touch. Closing
that residual, larger class needs `hlr.js`/`scene3d.js` changes to how occlusion is decided between
independently emitted paths of the same object — explicitly out of scope for a `surface-fill.js`-
only unit. Full trail: `docs/3d-audit/handoff/unit-a-notes.md`.

**Integration note (merge into `3d-scene/integrate`):** `tests/unit/scene3d-ribbon-f1b-streaks.test.js`
now carries handoff-c's version (the A3 oracle split retired the five intentionally-red assertions
this doc's handoff-b update measured against; see `tests/unit/scene3d-ring-coverage-reachability.test.js`
and `d86cbf8d`). F1 itself remains OPEN per both write-ups above.

### B. Blunt band terminations at the clip boundary  (NEW, user-flagged)

**Task.** Since self-occlusion landed, bands terminate where the near sheet cuts them with slightly
blunt, ragged ends. Geometrically correct — that IS the occlusion boundary — but it reads as a cut
edge rather than a natural silhouette.

**Value.** Cosmetic, but it is the visible signature of the newest feature, so it shapes how the
whole effort reads. Awaiting the user's verdict on the bench before investing.

**Done when.** The user says the terminations read acceptably, or they are softened without
reintroducing any crossing of the red-line rule (F7 must stay at 0 survivors).

### C. Shadow overlap darkening  (`sf/shadow-overlap`, merged into `sf/preview`) — **CLOSED**

**Resolved on `3d-scene/handoff-c`.** The `scene3d-hlr-spatial-index-identity.test.js` fingerprint
this item warned about is already GREEN on this branch (6/6, including `denseMixed-8obj-shadows`) —
`6c17709d` had already justified and recorded that move before this unit started; no fingerprint was
touched here. The implementation was reviewed as if written by someone else
(`docs/3d-audit/handoff/unit-c-review.md`): no defect found requiring a source change, only a
low-severity observation (`overlapCfg()`'s `maxDepth`/`maxCasters` have no upper clamp, safe today
only because `algorithm-tuning.js` freezes them and neither is UI-exposed).

The density test's non-vacuity was proven by mutation: patching `overlapFactor` to `return 1`
(coincident-line behaviour) turns the ladder-monotonicity assertion AND the density assertion RED
(density ratio drops to 1.15x, under the 1.25x bar); reverted, confirmed byte-identical to
`d5af9e30` via `git diff`. Measured live in the app (`scripts/shadow-overlap-evidence.js`, two
30mm boxes matching the test fixture, `shadowLayers: true`): overlap scene depth-2/depth-1 density
ratio **3.06x** (threshold 1.25x); the `apart` control shows **zero** depth-2 regions. Screenshots
and `stats.json` at `docs/3d-audit/handoff/unit-c/`.

**Task (as originally written, for context).** Where two shadows overlap the region must read darker.
Chosen mechanism: **denser hatching at the same angle**. Implementation, a test and a fixture exist
and pass 22/22.

**TRAP.** The zone path phase-anchors rulings to an **absolute origin**, so two overlapping shadows
emitted independently draw **coincident lines** — pixel-identical to one shadow. Darkening MUST come
from a tighter pitch in the overlap region. "Emit twice" produces nothing on screen while passing a
naive path-count assertion.

**Done when.** The WIP commit is reviewed as if written by someone else; a test asserts overlap **ink
density / ruling pitch**, not path count, and a coincident-line implementation FAILS it; measured
darker in the app with two overlapping casters, screenshotted.

### D. Shadows falling onto other 3D objects  (`3d-scene/handoff-c`) — **CLOSED**

**Resolved on `3d-scene/handoff-c`.** New `src/core/scene3d/shadow-receive.js`
(`Vectura.Scene3D.ShadowReceive`): `pointInShadow(worldPoint, light, occluderSet, opts)`
(Moller-Trumbore ray/triangle, self-shadow exclusion via `opts.excludeObjectId`) +
`buildOccluderSet(records)` (every object's own world-space faces, `scene.js` `faceRecord.world-
Verts`, flattened to triangles grouped per object with a bounding sphere). `Regions.combined-
Intensity` gained an optional 4th `shadowFn` arg — an occluded light's own contribution drops to 0,
ambient untouched; omitted, it is a strict no-op (every pre-existing call site byte-identical).
`scene3d.js` builds one occluder set per frame and closes `shadowFn` over `currentReceiverObjectId`
(reassigned per record, the same trick the existing emissive-light `activeLights` plumbing already
uses). New flag `shadow.shadowReceiveOnObjects`, default **OFF** — every existing scene, including
the `scene3d-hlr-spatial-index-identity` byte-identity fixtures, stays untouched.

**Task (as originally written, for context).** A shadow must land on another object's surface and
render in **that receiver's own fill style**. Settled architecture: per surface sample, ask "is this
point in shadow?" and feed the answer into the intensity the tone laws already consume. No new
region geometry — this also dodges the fact that a projected silhouette is only valid on a
**plane**; a curved receiver (the cone) needed per-sample testing, not projection.

**Performance.** A naive per-sample linear triangle scan measured 101->3739ms (a simple caster+cone
scene) and 89->3835ms (an 8-object dense scene, 43x) — profiling showed almost every sample is
unshadowed, so every one still paid for a full scan just to conclude "no hit." A per-object
bounding-sphere early-out (mirroring `hlr.js:buildOccluderIndex`'s spirit) brought this to
92->388ms (4.2x) / 89->428ms (4.8x) — real, measured, but still over the ~1.5x guidance. Per this
item's own stop condition ("exceeds ~1.5x and needs a real BVH — a second unit"), that residual gap
is reported, not force-fixed: it is O(objects^2) by design (every object tests every other as a
candidate occluder) and needs a shared cross-object index/shadow-map to close further. Details:
`docs/3d-audit/handoff/unit-d-notes.md`.

**Done when.** `pointInShadow(worldPoint, light, occluders)` with unit tests (hit, miss, grazing,
self-shadow exclusion) — DONE, 10/10 green in `tests/unit/scene3d-shadow-receive.test.js`; the
shadow term feeds per-sample intensity, verified by the receiver's fill style changing the shadow's
appearance — DONE (an independent ray/sphere oracle proves a real intensity margin, and two
different `toneLaw`s on the receiver emit different geometry with the shadow on); works on a
**curved** receiver — DONE (the same oracle, adjacent points straddling the exact shadow boundary
on a cone); performance measured and stated — DONE, see above (not fully within budget, reported);
two-object screenshot — DONE, `docs/3d-audit/handoff/unit-d/` (a sphere caster onto a cone receiver,
control 1: caster moved aside, control 2: receiver's own toneLaw changed — both provably NOT
byte-identical to the shadowed shot).

**Adversarial review follow-up (same branch, second commit).** Accepted with follow-up; three items
addressed: (1) `shadow.shadowReceiveOnObjects` is now exposed in the UI (docked panel + context-bar
Shadow flyout), beside the Fill Style row, with the same click-driven (i) affordance and a render-
cost blurb, plus 10 new integration tests (row presence, the (i) note, and WHOLE-STYLE-WINS — the
toggle writes the correct scope and never drops a sibling `shadow.*` key); (2) evidence re-shot with
`toneLaw:'ladder'` instead of `mazeFill` — the law-changed control is dramatically, visibly
different (confirms "renders in the receiver's own style"), but **the shadow itself is not clearly
visible by eye** in the `ladder` crops at this light angle/density (stated plainly, not tuned away —
see `docs/3d-audit/handoff/unit-d-notes.md`); (3) `unit-d-notes.md` corrected: point/spot shadow-
receive is genuinely UNTESTED at the intensity/pipeline level (only an incidental module-level call
existed), and area lights lose their entire N-sample softening under occlusion (the shadow gate in
`combinedIntensity` runs before the area-light averaging loop) — both now stated as known gaps, not
implemented here.

**Judge rejection + fix (third commit).** The judge REJECTED the above: a box caster over a big flat
plane receiver (hatch/ladder, elevation 25) showed ink shifting UNIFORMLY across the whole plane,
including far corners — no localized patch, ON/OFF visually indistinguishable. Root cause: the
FACETED path's `spacingBand` (`scene3d.js`) samples `intensityFn` — and therefore `shadowFn` — ONCE
at a face-region's centroid; a plane is one face, so its entire surface got one uniform shift. Fixed
by feeding `Shadows.hatchRingsEvenOdd` (newly exported; the same marching-scan primitive
`buildGradedSpacing` already uses) a per-point spacing function for the faceted hatch's carrier and
automatic second family, bypassing the scalar `planeFor`/`plan` narrow-facet grant that cannot honor
a per-point function. A SECOND, independent bug was found while verifying this: `recordBands`'s O20
rank-grade cache also samples ONE band per face at its centroid and silently overrode any per-point
value; fixed via a new `perPointGrade` flag on `spacingBand` that skips the cache (every existing
call site is byte-identical). RGR: `tests/unit/scene3d-shadow-receive.test.js` gained a box+plane
describe block — an independent ray/AABB oracle proves inside/outside density clears 1.5x with the
flag ON (measured ~2.4x with a stark ladder) and stays uniform (0.7-1.3x) with it OFF; a second pin
(`VECTURA_PRE_FACETGRADE=1` on `2893d842`) reproduces the judge's exact defect (ratio 0.84, RED).

**Honest visual finding (not fully resolved).** Re-shot the judge's exact scene
(`scripts/shadow-receive-plane-evidence.js`) and looked at the crops directly: with the SHIPPED
DEFAULT tone ladder, **no visible dark patch, no visible straight edge** — the fix is numerically
real (confirmed by the oracle and by a pixel count under a higher-contrast ladder, ~1.4x more ink in
the same window) but reads as a diffuse density gradient along a band, not a crisp 2D footprint —
`hatchRingsEvenOdd`'s marching scan varies spacing only along the perpendicular axis, uniformly
across each ruling's full length, so a genuinely bounded patch would need the shadow's own silhouette
clipped into the fill topology (a materially larger change, out of scope here). **The "visible dark
patch with a straight-edged footprint" acceptance bar is therefore NOT met at default settings** —
stated plainly rather than tuned away. See `docs/3d-audit/handoff/unit-d-notes.md` for the full
writeup, pixel numbers, and re-measured performance (box+plane ~2.3x, dense scene ~3.3x, both still
low-double-digit ms in absolute terms; flag stays OFF by default).

**v2 — footprint-clip model (this commit), replacing per-point sampling on flat faces.** Per the
coordinator: reuse the ground-shadow model instead. `shadows.js` gained
`projectAlongDirToPlane` (the ground's own y=0 ray/plane intersection, generalized to an arbitrary
plane) and exports `convexHull`; `scene3d.js`'s `buildFaceFootprint` projects every OTHER object's
world vertices onto THIS face's plane along the light, hulls them, and clips to the face's own
outline (Sutherland-Hodgman, every faceted primitive's face is convex). The clipped footprint
hatches at one scalar "inside" pitch (a directional hard shadow is binary, so one sample suffices);
the rest of the face hatches at the "outside" pitch with the footprint as an even-odd hole. The
boundary is now a real polygon clip edge. Two bugs found live while wiring this up, both fixed:
`planeFor`'s memoized narrow-facet grant ignores the screen-pitch it's called with (collapsed
inside/outside to the same value) — fixed with a direct `uvPitchFactor` conversion for the split
family only; and the "outside" pitch was sampled at the face's own centroid, which can itself sit
inside a caster's footprint — fixed with `spacingBand(..., noShadowBaseline: true)`. A third bug
(caught by the full `test:unit` run: 19 x-ray-suite failures, `record` undefined at one pre-existing
call site that never needed it before) was fixed by guarding the footprint call. New RGR:
a footprint-EDGE test (two 5mm windows straddling the exact projected edge, >=2x required) — RED
against `2893d842` (0.96), GREEN now; the existing 1.5x density test still passes. Looked at the
crops directly: a clear, straight-edged quadrilateral patch is now visible (denser-packed hatch
lines, not a solid wash — expected for plotter-style line rendering), absent in both the aside and
OFF controls; a second scene (tall box onto a neighbouring box's side face) also shows it. Curved
receivers (cone/sphere evidence) are byte-identical (md5) to before. Perf: box+plane ~2.4x
(1.5-2.3ms -> 3.5-4.4ms), dense scene ~4.3x (23-27ms -> 100-120ms) — flag stays OFF by default,
not force-fixed further. Full writeup: `docs/3d-audit/handoff/unit-d-notes.md`.

### E. Expand fidelity on two laws  (plan F5, plus the lying counter) — CHECKED, does not reproduce

**Task (as written).** After "Expand into group", `interlockWeave` differs from the live render on 6%
of the frame and `amplitudeOnly` on 10%; the other ten bucket-B laws are 0.2-1%. Separately,
`onePenDown` books legitimate centreline degenerations as `erodeEmpty` — the counter lies.

**Measured against current HEAD (25e76b65) — neither reproduces.** `git diff d5af9e30 HEAD --
src/ui/panels/layers-panel.js src/core/scene3d/surface-fill.js` is empty, so nothing on this branch
could have changed either behavior; the state below is what this whole effort already merged.

- Fidelity: the same in-process rasterized-ink oracle `expand-render-fidelity.test.js` uses reads
  **0%** divergence for both `interlockWeave` and `amplitudeOnly` (and the `nibAngle`/`onePenDown`
  controls) on the only route "Expand into group" is reachable from (`addSceneTree` object3d child) —
  C3 rule 6's weightScale-1 guarantee makes expand a clone-and-strip no-op for every bucket-B path. A
  real browser full-canvas diff shows ~8-10% for all four laws tested alike, not law-specific — a
  render-order/AA floor common to any expand, not a per-law gap. Quantified, not chased.
- Counter: `erodeEmpty` is 0 for all twelve bucket-B laws on both a sphere and a torus, `onePenDown`
  included. `docs/torus-fix-evidence/stats-before.json` shows it WAS 10/19 pre-CLS_WALLS — the
  mechanism the task describes was real, and is already fixed by that earlier, merged work
  (`wallEmpty`/`wallCentres`).

New regression coverage locking in the above (both green, no source change):
`tests/integration/expand-scene3d-fidelity-two-laws.test.js`,
`tests/unit/scene3d-ribbon-degeneration-counter.test.js`. Full writeup: `docs/3d-audit/handoff/unit-e-notes.md`;
evidence: `docs/3d-audit/handoff/unit-e/`.

**Value.** Lowest severity. Expand-into-group is the plotter handoff path — this item confirms the
divergence it worried about is not currently present.

**Done when.** Both laws land in the 0.2-1% band (measured: 0%); degenerations are counted as
degenerations (measured: `erodeEmpty` 0 on both fixtures); expand evidence asserts
`after.children > 0` AND that before/after images are NOT byte-identical — done via
`docs/3d-audit/handoff/unit-e/` (real screenshots) plus the new tests' JSON-inequality guard.

### F. Imported OBJ/STL meshes vs the red-line rule  (MEASURED)

**Task.** Self-occlusion for imported meshes keeps the older mesh-face path with its 6 mm bias,
because they have no analytic silhouette to clip against. Whether they satisfy the user's rule is
**unknown — never tested**.

**Done when.** The F7-style test runs against an imported non-convex mesh and either passes or the
gap is quantified and recorded here.

**Update (branch `3d-scene/handoff-b`, unit F session, `66b05aa3`): MEASURED, mostly PASSES, one
small gap recorded — two premises in the task above were wrong.** An imported mesh (1) never
reaches the ribbon/variable-width law engine at all (`curvedChartParams` returns `null` for any
`primitive` not in `TOPOFORM_MODES`, and an imported mesh's primitive is always `'solid'` — there
is no "law" concept for this object class), and (2) never reaches F7's `selfOcclude`/
`SELF_OCCLUDE_BIAS` "6 mm bias" machinery either — `scene3d.js`'s own `faceted` flag is true for
`primitive === 'solid'`, routing it through the PER-FACE hatch path instead, whose segCtx never
sets `selfObject`/`selfOcclude` at all, so every other face of the object is tested as a live
occluder at the ORDINARY (non-inflated) bias — genuine, unbiased flat-face HLR, `hlr.js`'s original
purpose. There is no 6 mm bias on this path; `git diff 57e86f48 HEAD --
src/core/algorithms/scene3d.js` confirms F7 never touched it.

Measured on a 24x12 torus tessellation (OBJ text, imported via `engine.importMeshAsScene`, the real
upload path) at the default 3/4 view, independent ray/triangle oracle
(`tests/helpers/scene3d-mesh-occlusion-oracle.js`): `hatch` mapper 0/4 survivors (PASSES), `contour`
mapper 0/12 (PASSES), `spiral` mapper **1/29 survivors, gap ≈ 9.3 mm** (a real, reproducible, tiny
gap). Root cause traced to `Mappers.regionFill`'s polygon-union failing on degenerate geometry for
this fixture (visible in-console: `[FillBoolean] polygon union failed on degenerate geometry`), NOT
the occlusion mechanism — a fix would touch `mappers.js`/`fill-boolean.js`/`geometry-utils.js`, none
of which are "the bias/isConvexObject gate" this unit was pre-approved to touch, so it is recorded,
not fixed. `tests/unit/scene3d-mesh-self-occlusion.test.js` is intentionally RED on `spiral`.
A denser (48x24) mesh was tried first and abandoned — the flat-fill boundary/region-fill machinery
became impractically slow on that many small, silhouette-grazing faces for a unit test; whether a
denser imported mesh's self-occlusion holds at the same rate is a distinct, unmeasured performance
question. Full trail: `docs/3d-audit/handoff/unit-f-notes.md`; evidence:
`docs/3d-audit/handoff/unit-f/`.

---

### G. Migration gates carried over from `plans.md`  (BINDING, not ours to waive)

From the user's own `plans.md` entry on the 3D Scene Studio (commit `b7801f39` on `main`):

> Do not auto-migrate **Spiralizer, Polyhedron, or Topoform**; require explicit conversion plus
> parity gates.

That constraint is still binding. Nothing in this effort touched those three algorithms, and nothing
in it should be read as permission to fold them into the 3D scene system automatically. Any future
"convert to scene" work on them needs explicit approval and a parity gate, not an inference from the
fact that scene3d now exists.

**One line of that same entry is now superseded by events:** it says the 3D Scene Studio proposal is
"discovery proposal complete; implementation not started" and to "await product approval before
promoting Phase 0 into active work." The implementation DID happen — 452 commits, merged to `main`
in this round. The proposal document (`docs/3d-scene-studio-proposal.html`) remains the reference
for intent. Left in place rather than deleted, because the migration constraint above sits in the
same entry and must survive.

### Cross-cutting, applies to every item

- **Harness-clean is not app-clean.** Every item closes with a real screenshot of the running app.
  `wallRings == 0`, or a law emitting only bare centrelines, is a FAILURE, not a pass.
- **Check the coverage oracle before trusting it** on anything that removes geometry. See finding 2.
- **Serialize.** Items A, B, E and F all touch `surface-fill.js`. One agent at a time in a worktree.
  C and D are disjoint and can run in parallel.
- **Evidence rules, learned expensively.** Before and after must come from the SAME pipeline at the
  SAME zoom, cropped to the object with app chrome hidden. Four evidence sets in this effort were
  thrown away for violating one of those. A byte-identical pair means the run did nothing.
- **Settled, do not reopen.** Tone (39.4% vs 39.1%), the coverage contract, and spiral as the
  default.

## Cost you should know about

Generation for variable-width laws is **1.4-10.2 s** (weaveDepth worst) against ~10 ms for
monowidth. The ribbons are real, so the work is real. Explicitly NOT to be fixed by reducing
coverage.

Self-occlusion adds **1.34x on the heaviest law** on top of that: `taperedEnds` 1154 -> 1550 ms,
`weightSmoothstep` 240 -> 289 ms. The quartic solve was never the cost (~310 ms of it). The cost was
`rotatePoint` recomputing `degToRad` plus six trig calls on every one of ~180,000 sub-calls for
angles that never change; precomputing the rotator is bit-identical and recovered most of it. The
remaining 34% is the occlusion test genuinely working. If you optimise further, profile first — the
obvious suspect was wrong last time.

## Process rules that earned their keep

- **Harness-clean is not app-clean.** An entire integration passed its suite while the ribbon
  pipeline was INERT (every ribbon fell back to a bare centreline). Both defects "vanished" because
  the feature had stopped producing width. Only a screenshot caught it.
- **Check whether the METRIC is wrong before concluding the FIX is.** Five attempts at self-occlusion
  failed, and the last two were correct implementations rejected by a coverage oracle whose
  denominator predates the feature. When "correct behaviour" and "a passing metric" come into direct
  conflict, interrogate the metric early, not after five attempts.
- **A stale contract may be updated; a test may not be weakened.** The distinction is provable: the
  corrected coverage oracle reproduces all twelve original values EXACTLY with occlusion disabled.
  Demand that kind of proof before changing any assertion.
- **Judges must check for vacuous passes.** A style emitting only weightScale 1 because it
  degenerated is a FAILURE, not a pass.
- **Expand evidence MUST assert `after.children > 0`** and that before/after images are NOT
  byte-identical. One agent's harness forced `isGroup=true`, so `expandLayer` returned immediately
  and measured nothing.
- **Evidence must come from ONE pipeline at ONE zoom, object-only.** Four evidence sets here were
  discarded: two rendering pipelines compared as if alike; 268% vs 267% zoom; app chrome filling a
  third of the frame; and a screen-region pixel proxy that could not resolve the defect on half the
  laws.
- **A disclosed failure beats a hidden fudge.** Several agents reverted cleanly and reported what
  they learned rather than widening a tolerance to force a pass. Every one of those reports moved
  the work forward; the fudges would not have.
- **Test every primitive.** Sphere-only matrices hid the seam bug AND the torus bug. The torus is
  the only primitive that occludes itself.
