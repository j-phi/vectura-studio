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

### B. Blunt band terminations at the clip boundary  (NEW, user-flagged)

**Task.** Since self-occlusion landed, bands terminate where the near sheet cuts them with slightly
blunt, ragged ends. Geometrically correct — that IS the occlusion boundary — but it reads as a cut
edge rather than a natural silhouette.

**Value.** Cosmetic, but it is the visible signature of the newest feature, so it shapes how the
whole effort reads. Awaiting the user's verdict on the bench before investing.

**Done when.** The user says the terminations read acceptably, or they are softened without
reintroducing any crossing of the red-line rule (F7 must stay at 0 survivors).

### C. Shadow overlap darkening  (`sf/shadow-overlap`, merged into `sf/preview`)

**⚑ KNOWN RED ON THIS BRANCH.** Merging this WIP makes
`tests/unit/scene3d-hlr-spatial-index-identity.test.js > denseMixed-8obj-shadows` fail — the
byte-identity guard for a shadows scenario. Unit on `sf/preview` is 4672 pass / **1 fail**; the same
suite on `sf/integration` (without this merge) is 4669 / 0.

Read that failure as EVIDENCE, not noise: it proves the shadow code is live and genuinely changes
shadow output, and equally that the change has never been validated. **Do not update the fingerprint
to get green** — that certifies rendering nobody has reviewed. Resolve it as part of this item: once
the overlap behaviour is reviewed and seen in the app, either the new fingerprint is justified and
recorded with that justification, or the implementation is wrong and the guard caught it.

**Task.** Where two shadows overlap the region must read darker. Chosen mechanism: **denser hatching
at the same angle**. Implementation, a test and a fixture exist and now pass 22/22 — but the
implementation has never been reviewed and the result has never been seen in the app.

**TRAP.** The zone path phase-anchors rulings to an **absolute origin**, so two overlapping shadows
emitted independently draw **coincident lines** — pixel-identical to one shadow. Darkening MUST come
from a tighter pitch in the overlap region. "Emit twice" produces nothing on screen while passing a
naive path-count assertion.

**Done when.** The WIP commit is reviewed as if written by someone else; a test asserts overlap **ink
density / ruling pitch**, not path count, and a coincident-line implementation FAILS it; measured
darker in the app with two overlapping casters, screenshotted.

### D. Shadows falling onto other 3D objects  (NOT STARTED)

**Task.** A shadow must land on another object's surface and render in **that receiver's own fill
style**. Settled architecture: per surface sample, ask "is this point in shadow?" and feed the answer
into the intensity the tone laws already consume. No new region geometry. This also dodges the fact
that a projected silhouette is only valid on a **plane** — a curved receiver (the cone) would need
per-line sampling under the projection approach.

**Known cost.** There was no ray/triangle intersection anywhere in scene3d. There is now
`src/core/scene3d/ray-torus.js` (closed-form ray/torus, 12 tests) and the self-occlusion plumbing in
`hlr.js` — **start from those**, they did not exist when this item was written. World-space face
polygons are at `scene.js:197-201`.

**Value.** The largest remaining capability gap. Multi-object scenes read as objects floating
independently.

**Done when.** `pointInShadow(worldPoint, light, occluders)` with unit tests (hit, miss, grazing,
self-shadow exclusion); the shadow term feeds per-sample intensity, verified by the receiver's fill
style changing the shadow's appearance; works on a **curved** receiver; performance measured and
stated; two-object screenshot.

### E. Expand fidelity on two laws  (plan F5, plus the lying counter)

**Task.** After "Expand into group", `interlockWeave` differs from the live render on 6% of the frame
and `amplitudeOnly` on 10%; the other ten bucket-B laws are 0.2-1%. Bbox does NOT grow and no child
escapes the silhouette, so this is a fidelity gap, not a protrusion regression. Separately,
`onePenDown` books legitimate centreline degenerations as `erodeEmpty` — the counter lies.

**Value.** Lowest severity. Expand-into-group is the plotter handoff path, so a 10% divergence means
what you plot is not quite what you saw.

**Done when.** Both laws land in the 0.2-1% band; degenerations are counted as degenerations; expand
evidence asserts `after.children > 0` AND that before/after images are NOT byte-identical.

### F. Imported OBJ/STL meshes vs the red-line rule  (UNTESTED)

**Task.** Self-occlusion for imported meshes keeps the older mesh-face path with its 6 mm bias,
because they have no analytic silhouette to clip against. Whether they satisfy the user's rule is
**unknown — never tested**.

**Done when.** The F7-style test runs against an imported non-convex mesh and either passes or the
gap is quantified and recorded here.

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
