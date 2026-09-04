# Stroke-Fill + Shadow Effort — Handoff

**Paused 2026-08-30.** Nothing pushed, nothing merged to main. Full plan with all contracts and
open findings: `~/.claude/plans/stroke-fill-plan.md` (345+ lines). Read it before resuming.

## What this was

Two of your reports:
1. Variable-width 3D fill styles rendered as a **staircase of constant-width capsules** with
   round-cap bulges, and **geometry protruding past the silhouette** after "Expand into group".
2. Voronoi Web needed to read as an unbroken web with **cell size carrying tone**.
Then, later: **shadows must darken where they overlap and fall onto other 3D objects.**

## The fix, in one line

Stop asking for a fat pen. Build the true variable-width **ribbon outline** from the continuous
width profile, clip it to the form, stroke it with the real pen, and fill the interior at
pen-width pitch. Every path then carries `weightScale === 1`, so what you see IS real pen lines and
expand-into-group is correct by construction.

## Branch state (all off `3d-scene/fs-batch` @ 5e92311b, v1.3.91)

| Branch | HEAD | State |
|---|---|---|
| `sf/integration` | **439319c0** | All 6 units + F1 + F2 merged. **WIP checkpoint on top (F3, unreviewed/untested).** |
| `sf/shadow-overlap` | **bef636c6** | Shadow overlap darkening. **WIP checkpoint, suites never run.** |
| `sf/w1-ribbon` … `sf/w6-voronoi` | various | Original six units, all merged into integration. Historical. |

Last fully-verified commit on `sf/integration` is **1b157bc6** (v1.3.94, torus fix) — suites green
there: unit 4588, integration 1919, visual 99, perf 10. The two WIP commits after it are NOT verified.

Serve any worktree with `python3 -m http.server <port>`; nothing is running now.

## DONE and independently verified

- **Stairstepping: GONE.** Judge B measured exactly (step = 0.3 x |delta weightScale|). Pre-fix
  `nibAngle` had 357 distinct weightScales, 232 boundaries stepping >half a pen, max step 0.749 mm.
  Post-fix: one weightScale, **max step 0.000**.
- **Protrusion: GONE.** Pre-fix ink reached r=46.52; post-fix every law reads **46.267, identical to
  the untouched monowidth control**, zero vertices outside r=46. Holds after expand too.
- **Universality: PASS.** Judge A walked all **49** styles in the real app. 31 monowidth unchanged
  (30 byte-identical), 12 variable-width ribbonized, 6 three-pen keep their real distinct pen
  widths (0.867/1.733/3.1). Buckets derived from code, not from the plan.
- **Voronoi Web: DONE.** 1 connected component, interior dangling stubs 8229 -> 0, 0/29689 vertices
  outside the silhouette, cell size spans 2.5x shadow-to-highlight.
- **Stroke Fill control** on both surfaces (ctxbar Style flyout + left panel Style tab), disabled
  with a reason on non-applicable styles.
- **Spiral keeps path count flat** — your requirement. 1 path per component, and LOWER than the old
  splitByWeight on 9 of 12 laws (e.g. 2226 -> 208).
- **Torus fixed** (F2): per-sample normal test was answering star-shapedness, not handedness; 27.6%
  of torus normals inverted. Changes torus rendering for ALL 49 styles — you eyeballed and approved.

## Measured, NOT defects (do not re-litigate)

- **Tone is fine.** The "87% over-inked" figure I relayed was wrong — it double-counted overdraw
  (2.211x). Real coverage **39.4% vs 39.1% on base**. Ink LENGTH went 8x because the old build drew
  the same area as fat pen at mean weightScale 3.6; ribbonize decomposes it into real 0.3 mm passes.
- **Coverage contract holds.** All four fill styles reach >= 0.9998 on real geometry. `concentric` is
  NOT gappy — spiral is the wasteful one (overdraw 2.15-3.11 vs concentric 1.28-1.53) and the only
  one that breaches the gap bar. **Do NOT switch the default off spiral** — that would trade your
  path-count requirement for a metric. Fix spiral's turnaround pitch instead.

## OPEN — the resume queue

**Numbering warning.** The finding IDs drifted between this doc and the plan file. In
`~/.claude/plans/stroke-fill-plan.md`, **F4** is the sub-pen / hollow-hairline bug and **F5** is
expand fidelity; this doc and the verbal handoff called the sub-pen bug "F3". The queue below uses
NAMES, not numbers, so nobody fixes the wrong thing. When you read the plan's OPEN FINDINGS list,
map by description.

### Branch state at pause

| Branch | HEAD | State |
|---|---|---|
| `sf/integration` | `439319c0` | WIP sub-pen fix: +198 lines in `surface-fill.js`. Unreviewed, untested, no RGR test. |
| `sf/shadow-overlap` | `bef636c6` | WIP overlap darkening: +399 lines incl. `tests/unit/scene3d-shadow-overlap.test.js` + fixture. Suites never run. |
| both | on `1b157bc6` | Last fully-verified commit (v1.3.94). Everything above it is unverified. |

---

### 1. Sub-pen ribbons + torus fill gapping  (plan F4 + F7)

**Task.** Two symptoms, possibly one root cause. (a) A ribbon about one pen wide emits only its
outline, so it renders as a hollow **doubled hairline** instead of one solid stroke. Contract C3
rule 5 requires a ribbon at or below one pen width to degenerate to **one centreline pass** at
`weightScale = 1`. (b) Wide bands in the torus's upper-left quadrant show thin dark **streaks
running lengthwise** — the interior fill is not solid. The judge saw the same "dark slivers inside
wider bands" alongside (a), which is why they are bundled. The 198 uncommitted lines on
`sf/integration` are a partial attempt at (a); review them before extending.

**Value.** The most visible remaining defect. It makes the ribbon work look *worse* than the old
fat-pen build on exactly the styles this effort exists to fix, and it breaches contract C2
(coverage >= 0.995) on real geometry — which invalidates the coverage claim already banked.

**Done when.**
- `w <= ~1 pen` emits exactly one centreline path — no outline pair, no sub-pen stroke.
- `1-2 pens` has outline and fill meeting with zero interior void.
- The gapping is **reproduced on a torus first**, then measured gone there — not on a sphere.
- The report states explicitly whether the hairline and the gapping were one bug or two.
- An RGR test fails on `1b157bc6` and passes after.
- `npm run test:ci` green + a torus screenshot at the default 3/4 view showing solid bands.

### 2. Torus self-occlusion — ribbon stubs through the form  (plan F6)

**Task.** At the torus inner hole (roughly 8-o'clock and 4-o'clock), short tapered ribbon fragments
belonging to the **far** sheet of the tube are visible. The near sheet should occlude them. The
torus is the first primitive that occludes ITSELF, so back-face culling is insufficient. Prime
suspects: ribbon outline/fill paths bypass the HLR depth clip that plain centrelines pass through;
or the `chartOrientation()` / `resolveFoldRings()` work from the torus normal fix (`32567e01`)
emits a doubly-covered sheet the depth clip never tests.

**Value.** Renders that read as broken. Also the one open item that could show the torus normal fix
— which changed rendering for ALL 49 styles and was approved by eye — has a residual hole.

**Done when.**
- **Diagnosis precedes machinery.** Name which suspect it is, with evidence, before writing a fix.
- Every ribbon path (centreline, outline, fill) provably goes through the same depth clip at the
  correct per-sample depth.
- Both stub instances gone in a screenshot at the default 3/4 view.
- Verified on ALL FOUR primitives (sphere, capsule, cylinder, torus).
- Regression test + `test:ci` green.

### 3. Shadow overlap darkening  (`sf/shadow-overlap` WIP)

**Task.** Where two shadows overlap the region must read darker. Chosen mechanism: **denser
hatching at the same angle**. WIP implementation plus a test and fixture exist, none run or seen.

**TRAP (already cost us once).** The zone path phase-anchors its rulings to an **absolute origin**,
so two overlapping shadows emitted independently draw **coincident lines** — pixel-identical to a
single shadow. Darkening MUST come from a tighter pitch inside the overlap region. "Emit twice"
produces nothing on screen while passing a naive path-count assertion.

**Value.** Overlapping shadows currently carry no depth information at all. Cheap, self-contained
win compared with item 4.

**Done when.**
- The WIP commit is reviewed as if written by someone else.
- A test asserts the overlap region's **ink density / ruling pitch**, not path count — a
  coincident-line implementation must FAIL it.
- Measured darker in the real app with two overlapping casters, screenshotted.
- Full suites run for the first time on this branch; `test:ci` green.

### 4. Shadows falling onto other 3D objects  (NOT STARTED)

**Task.** A shadow must land on another object's surface and render in **that receiver's own fill
style**. Settled architecture: per surface sample, ask "is this point in shadow?" and feed the
answer into the intensity the tone laws already consume. No new region geometry. That also dodges
the fact that a projected silhouette is only valid on a **plane** — a curved receiver (the cone)
would need per-line sampling under the projection approach; per-sample handles it for free.

**Known cost.** There is **no ray/triangle intersection anywhere in scene3d**; that helper is new
(~80 lines). World-space face polygons are already available (`scene.js:197-201`).

**Value.** The largest remaining capability gap. Multi-object scenes currently read as objects
floating independently.

**Done when.**
- `pointInShadow(worldPoint, light, occluders)` exists with unit tests: hit, miss, grazing,
  self-shadow exclusion.
- The shadow term feeds the existing per-sample intensity — verified by the receiver's fill style
  changing the shadow's appearance.
- Works on a **curved** receiver (cone or sphere), not only a ground plane.
- Performance measured and stated. This runs per sample; naive O(samples x faces) may be
  unacceptable on the heavier laws (see "Cost you should know about" below).
- Two-object scene screenshot; `test:ci` green.

### 5. Expand fidelity on two laws  (plan F5, plus the lying counter)

**Task.** Two parts. **Fidelity:** after "Expand into group", `interlockWeave` differs from the live
render on 6% of the frame and `amplitudeOnly` on 10%; the other ten bucket-B laws are 0.2-1%. Bbox
does NOT grow and no child escapes the silhouette, so this is a fidelity gap, NOT a protrusion
regression — the D2 fix holds. **Instrumentation:** `onePenDown` books 1-2 *legitimate* centreline
degenerations as `erodeEmpty`; the counter reports failures that are not failures and will mislead
the next judge.

**Value.** Lowest severity of the five — nothing is visibly broken and the headline contract holds.
Its value is that expand-into-group is the plotter handoff path, so a 10% divergence means what you
plot is not quite what you saw. The counter fix is small and protects future verification.

**Done when.**
- Both laws land in the 0.2-1% band with the other ten.
- Degenerations are counted as degenerations, not `erodeEmpty`; the sphere `degenerate == 0` bar is
  re-measured against the corrected counter.
- Expand evidence obeys the standing rule below: assert `after.children > 0` AND that before/after
  images are NOT byte-identical.

---

### Cross-cutting, applies to every item

- **Harness-clean is not app-clean.** See "Process rules" below. Every item closes with a real
  screenshot of the running app.
- **Judges check for vacuous passes.** A style emitting only `weightScale 1` because it degenerated
  is a FAILURE, not a pass.
- **Serialize.** Items 1, 2 and 5 all touch `surface-fill.js` in the shared `sf-integration`
  worktree — one agent at a time in that tree. Item 3 (`shadows.js`) and item 4 are disjoint and
  may run in parallel with them.
- **Settled, do not reopen.** Tone is fine (39.4% vs 39.1% base; the "87% over-inked" figure was
  wrong — it double-counted overdraw). Coverage holds at >= 0.9998 on all four fills; `concentric`
  is NOT gappy, spiral is the wasteful one. The default stays **spiral** — switching to concentric
  would trade the path-count requirement for a metric.

## Cost you should know about

Generation time for variable-width laws is now **1.4-10.2 s** (weaveDepth worst) against ~10 ms for
monowidth. The ribbons are real, so the work is real. Not yet optimized; explicitly NOT to be fixed
by reducing coverage.

## Process rules that earned their keep

- **Harness-clean is not app-clean.** An entire integration passed its suite while the ribbon
  pipeline was INERT (every ribbon fell back to a bare centreline). Both defects "vanished" because
  the feature stopped producing width. Only a screenshot caught it.
- **Judges must check for vacuous passes.** A style emitting only weightScale 1 because it degenerated
  is a FAILURE, not a pass.
- **Expand evidence MUST assert `after.children > 0`** and that before/after images are NOT
  byte-identical. One agent's harness forced `isGroup=true`, so `expandLayer` returned immediately
  and measured nothing — I relayed that vacuous result to you before it was caught.
- **Test every primitive.** Sphere-only matrices hid the seam bug AND the torus bug.
