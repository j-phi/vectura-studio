STATUS: ACCEPT-WITH-FOLLOWUPS

# W-30b review — wire `buildFaceFootprint` to the W-30 per-light-type projector

Lane under review: fill-collapse-2. Worktree: `.claude/worktrees/fill-collapse-2` (read-only).
Range: `1e681432..57aa71b2`. Reviewed read-only in the worktree (`git status --short -- . ':!graphify-out'`
clean before and after; `git stash list` shows only pre-existing unrelated agent-worktree stashes) plus
three scratch copies for RED/mutation/measurement work
(`/private/tmp/claude-501/.../scratchpad/w30b-red`, `-green`, `-mutate`, `-measure` — all `git archive` +
symlinked `node_modules`, all deleted at the end of this review). No worktree file was read-written,
stashed, or committed.

## (1) Diff scope

`git diff --stat 1e681432..57aa71b2 -- . ':!graphify-out'`:
```
scripts/w30b-footprint-wiring-evidence.js          | 276 ++++++++++++++++++++
src/core/algorithms/scene3d.js                     |  14 +-
tests/unit/scene3d-shadow-footprint-wiring.test.js | 289 +++++++++++++++++++++
3 files changed, 578 insertions(+), 1 deletion(-)
```
Exactly the three files claimed. `src/core/scene3d/shadows.js` is **byte-untouched**
(`git diff 1e681432..57aa71b2 -- src/core/scene3d/shadows.js` returns empty, confirmed directly, not
inferred). `params.js`, `hlr.js`, `surface-fill*.js`, `mappers.js` are all untouched.

The `scene3d.js` diff (`+13/-1`) is exactly the one-line call-site swap plus a 12-line comment: a new
`projectFootprintPoint` closure defined once (light-type dispatch through `Shadows.projectLightToPlane`
with a defensive fallback to the old `projectAlongDirToPlane` call), used in place of the old
unconditional call inside the per-vertex projection loop. Read `scene3d.js` ~1290-1305 directly: `light`
(`(p.lights && p.lights[0]) || {}`) and `lightDir` (`Regions.Lighting.lightWorldDir(light)`) are both
already computed once per `generate()` call, well before `buildFaceFootprint`'s own definition (~1406)
and its per-vertex loop (~1431) — confirmed these are the same bindings the closure captures, not new
state. `src/config/defaults.js`'s `shadowReceiveOnObjects: false` default is outside this diff entirely
(condition 6 below).

## (2) RED / GREEN / mutation

Ran GREEN, then RED (env-var pin), directly in the worktree (read-only — vitest run only, no edits):

```
npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
```
→ **5/5 pass** (matches report).

```
VECTURA_PRE_W30B=1 npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
```
→ **4/5 pass, 1 fails**: `expected 1.010740775350905 to be greater than or equal to 1.5` — the exact
number in the impl report. The pin mechanism (`makeMultiFilePreShaRuntimeOptions` + `git show
1e681432:src/core/algorithms/scene3d.js`) genuinely substitutes the pre-fix file; I independently
re-derived that blob (`git show 1e681432:src/core/algorithms/scene3d.js` matches what the pin loads)
so this RED is for the claimed reason (the old unconditional `projectAlongDirToPlane` call site), not a
vacuous or unrelated failure.

**Mutation** (in a throwaway scratch copy `w30b-mutate` — full `git archive 57aa71b2` + copied `.git` +
symlinked `node_modules`, never the reviewed worktree): reverted only the one line
(`const wp = projectFootprintPoint(world[i]);` → `const wp =
Shadows.projectAlongDirToPlane(world[i], lightDir, anchor, normalWorldArg);`) and reran the same test
file:
```
✓ precondition
× point light — ink density ... : expected 1.010740775350905 to be greater than or equal to 1.5
✓ directional light — receive footprint stays exactly where it was
✓ directional-light receiver fills are byte-identical
× W-30b RED-proof pin ... : expected 1.010740775350905 to be greater than or equal to 1.5
```
The mutant fails with the **identical** numeric value (`1.010740775350905`) as the pinned RED — strong
confirmation the test measures exactly the call-site swap and nothing incidental. Mutation kills clean.

## (3) Directional-light byte-identity

Independently re-computed md5 on all four directional PNGs directly (not trusting `report.json`):
```
$ md5 -q directional-fixed-full.png directional-pre-full.png directional-fixed-crop.png directional-pre-crop.png
65b64abbc7514d7f7c1258d95f99dadc
65b64abbc7514d7f7c1258d95f99dadc
c4305b69ef7ad0994da77e88bf08cbb1
c4305b69ef7ad0994da77e88bf08cbb1
```
Full and crop both byte-identical, matching `report.json`'s `pngMd5` block exactly. The unit test's own
directional byte-identity test (5th of 5) passed independently above. No explanation is owed because
there is no divergence — pre/post are pixel-for-pixel identical, exactly the "directional stays free"
contract this unit promises. `scene3d.js`'s directional path is provably unaffected structurally, too:
`Shadows.projectLightToPlane`'s directional branch (verified in `shadows.js`, untouched) falls straight
through to the same `projectAlongDirToPlane(P, lightDir, ...)` call the old code always made.

## (4) Change scope — one-line swap plus one test file, nothing else

Covered in (1): the diff is exactly `scene3d.js` (call site), the new test file, and the new evidence
script. `shadows.js` untouched. `## Bars changed` in the impl report says "None" — confirmed: `git diff`
shows zero `-` lines against any pre-existing file (the only deletion in the whole diff is the single
line replaced in `scene3d.js`, which is not a test threshold/tolerance/fingerprint). No hidden bar
change found.

## (5) Orchestrator flag — "rectangular band" in `point-after-crop.png`

**This section is the deliverable for W-30c's planning.**

Read all twelve PNGs directly (not just the report's own crops), full-frame and native-resolution.
`point-before-full.png`: uniform diagonal hatch runs straight through/behind the sphere, no visible
patch — confirms the pre-fix parallel/default-direction projector places the footprint nowhere in
frame. `point-after-full.png` / `point-after-crop.png`: a denser, tighter-packed cluster of diagonal
segments appears immediately to the lower-right of the sphere, ending in what does read, to the eye, as
a fairly straight-looking far edge — this is the flagged observation.

**Measured, not argued.** I patched a throwaway scratch copy (`w30b-measure`, never the reviewed
worktree) to log `buildFaceFootprint`'s actual result polygon (world coordinates, via `scaf.origin`/`U`/
`V`) for the exact evidence rig (500×500 plane receiver, r=20 sphere caster at `(60,20,0)`, point light
at `(-300,150,0)`), run through the real `generate()` pipeline:

- The captured polygon has **82 vertices** (from the sphere's `detail=20` mesh, per-vertex projected
  and hulled) — not a coarse box. World bbox: **x:[55.96, 194.93]** (width 138.97), **z:[-23.35, 23.35]**
  (width 46.71) — an elongated shape, aspect ratio ≈ **2.98:1**.
- **Independent analytic check**, not reusing any of the app's own code: I sampled 200,000 points
  densely over the sphere's true surface (Fibonacci-sphere sampling, no mesh discretization at all),
  projected each through the identical central-projection ray from the light onto the `y=0` plane, and
  took the 2D convex hull (`scipy.spatial.ConvexHull`, 1039 hull vertices). Result: **x:[55.9588,
  194.9504]**, **z:[-23.3549, 23.3547]** — matching the app's 82-vertex polygon to 3-4 significant
  figures. **The elongated, non-circular shape is the physically correct footprint for this rig**, not
  a mesh-coarseness artifact and not a bug in `projectFromPositionToPlane`/`projectLightToPlane`. A
  point light at `y=150` over a sphere resting at `y=20` on a `y=0` plane, with the light far off to one
  side (`x=-300` vs. sphere at `x=60`), casts a genuinely long, grazing-angle shadow — this is correct
  optics, not a defect.
- **Screen-space check**: projecting the footprint's world bbox corners through the same orthographic
  camera (`Scene3D.Scene.projectWorldPoint`, yaw 20°/pitch 45°) places the "near" end of the footprint
  essentially co-located with the caster's own screen position and the "far" end well beyond it in the
  same screen direction as the visible denser cluster — the geometry lands exactly where the picture
  shows it, not somewhere else that a crop or clip artifact papered over.
- **Ruling out (b), the receiver's own extent**: independently located the plane's screen-space border
  by scanning for the near-continuous bright edge (`x≈884` at this render's scale/resolution — 600 of
  600 rows lit). The measured pixel-diff bbox between before/after (`ImageChops.difference`, threshold
  >30 to exclude anti-aliasing noise) is **x:[639,820], y:[776,901]** — the footprint's visible right
  edge (x=820) sits **64px inside** the plane's own border (x=884), nowhere near it. Not clipped by the
  receiver's outline.
- **Ruling out (a), crop/framing**: the diff region above is compact and sits immediately adjacent to
  the sphere in the full (uncropped) image, exactly where the analytic projection above places it — not
  an artifact of the evidence script's fixed window (which the impl report already explains was chosen
  specifically to avoid an ink-bbox auto-fit shrinking the caster to a speck).
- **Ruling out (d), Unit D's crisp clip being the culprit**: read `scene3d.js` ~2476-2499 directly. The
  "inside" hatch pass clips against `[fp]` (the actual, 82-vertex, verified-elliptical polygon) via
  `Shadows.hatchRingsEvenOdd`, even-odd — the crisp inside/outside split is Unit D's deliberate,
  pre-existing design (denser hatch strictly inside the true footprint polygon, sharp boundary by
  construction — that is what "receive shadow" means here), and it operates on the **correct** polygon.
  It does not manufacture a rectangle from an ellipse; it draws whatever polygon it is given, precisely.

**Verdict on (5): (c) in the narrow, technically accurate sense that the "rectangular band" reading is
a property of the projector's (correct) footprint geometry — but not a defect in it.** The footprint
really is a long, narrow, elongated conic (≈3:1 in world space, further stretched/skewed by the oblique
camera), which is the physically correct shadow for a grazing-angle point light this close to a sphere
resting on a plane. It only *reads* as "rectangular ... ending abruptly" to a human eye because (i) the
shape's own aspect ratio is genuinely extreme for this particular rig, and (ii) the renderer represents
the footprint purely as a hatch-density change with no drawn boundary stroke — a thin, elongated
ellipse, hatched only internally, is easy to misread as a wedge/band, especially near its narrow "near"
end. This is real signal for **W-30c** (the planned `shadows.js` correctness sweep, `STILL-OPEN.md` line
217): the very first real-world picture this projector has ever produced happens to be an extreme-aspect
case, which is a good reason for W-30c to (1) pick a less grazing evidence rig for any future
before/after comparison so a human reviewer isn't misled by an extreme aspect ratio into suspecting a
geometry bug, and (2) consider whether an explicit boundary stroke (or a lighter version of the same
crisp-clip idea) would make the receive-shadow footprint easier to visually verify in general — a
rendering/legibility follow-up, not a correctness defect in W-30b.

## (6) U0 byte-identity sweep + Unit D + guards

Ran targeted, foreground, one file at a time, directly in the worktree:

| suite | result |
|---|---|
| `scene3d-shadow-footprint-wiring.test.js` (new, this unit) | 5/5 |
| `scene3d-shadow-footprint-direction.test.js` (W-30's own) | 17/17 |
| `scene3d-shadow-receive.test.js` (Unit D) | 17/17 |
| `scene3d-shadow-overlap.test.js` (Unit C) | 4/4 |
| `scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `scene3d-shadows.test.js` (general Shadows CONTRACT L2/L4) | 18/18 |
| `scene3d-tone-law-collapse.test.js -t "byte-identity sweep: all 48 laws"` (U0) | 1/1 |

All numbers match the impl report exactly (67/67 combined on the first six, plus the U0 sweep — 1
passed, 58 skipped by the `-t` filter, 279.25s wall, in the same ballpark as the impl report's 265s). A
benign `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled-error notice appeared alongside the
pass (exit code 0, test itself green) — consistent with AGENT-PROTOCOL's "machine is shared" warning; an
unrelated vitest run for a different worktree (`fill-audit-2`) was independently observed running
concurrently on this machine during this review. Not a sign of anything wrong with this suite. `defaults.js`'s
`shadow.shadowReceiveOnObjects: false` default (Unit D's contract) is untouched by this diff — confirmed
directly in (1), not merely by report assertion — and `scene3d-shadow-receive.test.js`'s 17/17 pass
covers the default-OFF regression path as one of its own cases.

## (7) Bars changed

Impl report: "None." Confirmed: the diff adds one new test file and one new evidence script; the only
change to a pre-existing file is `scene3d.js`'s one-line call-site swap, which is not a threshold,
tolerance, or pinned fingerprint. No hidden bar change.

## (8) Merge note vs. main's `e429cfc5` / `1193cbe1`

`git merge-base --is-ancestor e429cfc5 1e681432` and the same for `1193cbe1` both report **not an
ancestor** — neither has reached this branch yet, confirming `STILL-OPEN.md`'s standing note that every
round-2 lane is still based on pre-release `main`. Checked both hazard commits' own diffstats directly:
`e429cfc5` touches only `tests/unit/scene3d-tone-law-collapse.test.js` (+49/-30); `1193cbe1` touches only
`scene3d-charts-parity.test.js`, `scene3d-curved-density-sparse-end.test.js`,
`scene3d-hlr-spatial-index-identity.test.js`, `scene3d-mesh-invariants.test.js` (+47/-33 total). **Neither
touches any file this unit changed** (`scene3d.js`, the new wiring test, the new evidence script) — no
merge conflict risk from this unit's diff. One pre-existing cross-lane note applies here exactly as it
does to every other round-2 lane (see `T1b-review.md` §9, `W-27c-0a-review-4.md` §10): `1193cbe1` **does**
touch `scene3d-hlr-spatial-index-identity.test.js`, one of the six guard suites this unit (and this
review) re-ran green — that golden hash gets re-rounded by `1193cbe1` for CI arm64/x86_64 precision
reasons unrelated to W-30b, so that guard's pass count should be re-verified after this branch rebases
onto a main that includes `1193cbe1`, not carried over from either report. Not a W-30b defect.

## Findings / minor notes (do not block ACCEPT)

- The evidence rig's extreme grazing angle makes the "rectangular band" misreading almost inevitable to
  a human eye on first glance — see §5's full ruling. Flagged as a **follow-up for W-30c** (rig choice /
  possible boundary-stroke legibility improvement), not a defect in this unit.
- Same caveat every round-2 reviewer has recorded: `scene3d-hlr-spatial-index-identity.test.js`'s golden
  hash will need re-verification after this lane rebases past `1193cbe1` (§8) — pre-existing, cross-lane,
  not introduced here.

## Verdict: ACCEPT-WITH-FOLLOWUPS

The unit does exactly what it claims: the one-line `buildFaceFootprint` call-site swap to
`Shadows.projectLightToPlane`, nothing else touched (`shadows.js` byte-identical, confirmed directly).
RED reproduced exactly (`1.010740775350905` fails `>=1.5`), GREEN reproduced (5/5), and mutation
independently confirms the test measures the swap and nothing else (identical failure value when
reverted). Directional byte-identity independently re-verified by md5 on all four PNGs (full and crop).
All six named guard suites plus the U0 48-law byte-identity sweep reproduce exactly. No undisclosed bar
changes. The orchestrator's flagged picture (condition 5) is **not a defect** — independently measured
against a from-scratch 200k-point analytic simulation, the "rectangular band" is the genuinely correct,
if visually surprising, elongated footprint for this specific grazing-angle rig; ruled out framing,
receiver extent, and Unit D's clip design as causes. This is exactly ACCEPT-WITH-FOLLOWUPS territory:
land it, and carry the two non-blocking notes above (evidence-rig legibility for W-30c;
`scene3d-hlr-spatial-index-identity.test.js`'s pre-existing rebase note) forward rather than treating
either as blocking.

REPORT docs/3d-audit/lane-reports/W-30b-review.md
