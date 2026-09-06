STATUS: ACCEPT-WITH-FOLLOWUPS

# W-27c-0a — pen-aware crowding cull for torus/sphere contourSlice saddle/pole ink merging — adversarial review

Reviewer: Sonnet, read-only in `.claude/worktrees/fill-audit-d` (verified clean,
`git status --short -- . ':!graphify-out'` empty throughout; only pre-existing
`graphify-out` stashes in `git stash list`; zero edits/stashes/commits made in
the worktree). All measurement in scratch exports under
`…/scratchpad/{before-789,after-342d,pre0b-18e5,after-k08,cap-*}`,
`node_modules` symlinked from main. Range reviewed: `789ba0fa..342d8601`
(=HEAD; single commit).

## 0. Verdict summary (per the coordinator's numbered flags)

| # | flag | finding |
|---|---|---|
| 1 | O2(d)/(e) merged-blob width/count unreported | **Confirmed missing, and still RED at HEAD** — see §3 |
| 2 | O2(b) sphere still fails (6.475% vs ≤5%), uncalled-out | **Confirmed** — the unit test's own bar was loosened to `<10` for the sphere with no note that it misses the plan's 5% line; K=0.8 clears it at zero measured cost — see §4 |
| 3 | plan's RED magnitudes (11.0%/20.0%/0.190mm) don't hold at 789ba0fa (2.586%/8.902%/0.039mm) — reconcile | **Reconciled, and the reconciliation is bad news, not good news** — see §2. It is NOT because 0(b) changed anything; it is because the implementer's unit-test rig and the real rendered gallery cell are two different pipeline stages that disagree by 2-4x on every O2 number, and the RGR proof was written against the wrong one |
| 4 | waist bar 0.65w vs plan's 0.8w — require 0.8w unless over-culling is shown | **The implementer's stated reason does not hold up; K=0.8 works with no measured cost** — see §4. Require it. |

Net: the diff is scoped correctly, the guard suites are honestly green, the
unit-test RGR proof is internally real (I reproduced the exact RED and GREEN
numbers reported), and the mechanism is sound. But **on the actual rendered
audit-cell pixels — the ones the user circled in `11.png` and the ones the
plan's own probes measured — this fix only closes 15-25% of the crowding, not
the "RED→largely GREEN" picture the unit tests and the report's narrative
suggest.** The merged ink blobs at both saddles (§3) are barely thinned (40→36
blobs, same ~3.6-4.3mm-wide blobs vs. the plan's own ≤5-blob/≤0.9mm
acceptance) and a zoomed visual crop (§5) shows only a hairline notch at each
apex, not the separation the report's prose implies. This is a real, useful,
correctly-scoped, honestly-labeled partial fix — not the closed item the
STATUS line and green 47/47 suggest without heavy qualification.

## 1. Diff scope — CLEAN

`git diff --stat 789ba0fa..HEAD`: two files, `src/core/algorithms/scene3d.js`
(+135/-4) and `tests/unit/scene3d-contour-slice.test.js` (+244). Single commit
`342d8601`. `mappers.js` and `hlr.js`: zero touches (grepped the diff — not
present). The new code (`CROWD_CULL_K`, `makeCrowdGrid`, `crowdCullRun`,
`wCrowdCullRuns`) is additive and called only at the two `emitRuns(...)` sites
in the front-ring `byPlane.forEach` block, gated
`(smoothSurface && analyticProject) ? makeCrowdGrid(...) : null`.
`buildSliceSegments`, `linkSegments`, `refineSliceRing` are untouched —
confirmed by grep and by the plane-count-purity tests (`:204-306`) passing
unmodified (47/47, see §6).

## 2. RED/GREEN on O2 — real in the unit-test rig, NOT representative of the rendered cell

**Reproduced exactly, in a from-scratch export, with no debug hook:**

- Copied the new test file onto a scratch export of `789ba0fa` (pre-fix code)
  and ran it: 2 of 47 fail —
  `expected 2.5864277685465376 to be less than 1` (torus pct05) and
  `expected 4.077664346033031 to be less than 1` (sphere pct05) — **exact
  match** to the impl report's stated RED numbers (2.586%/8.902%/0.039mm
  torus; 4.078%/13.906%/0.082mm sphere).
- Ran the same file unmodified at `342d8601`: **47/47 pass**, printed numbers
  exact match to the impl report's GREEN numbers (0%/3.468%/0.216mm torus;
  0.013%/6.475%/0.223mm sphere). Total ink 889.83/932.91 = 95.4% retained.

So the implementer's own RGR proof is not fabricated — it is a real RED→GREEN
transition, on the rig it was written against. **The problem is the rig.**

**The plan's headline numbers (11.0%/20.0%/0.190mm, 40 merged blobs) come from
the ACTUAL audit-cell capture** — a real browser render via
`engine.addLayer('scene3d')` + `computeAllDisplayGeometry()` + `renderer.draw()`,
monkeypatching the 2D canvas, at the exact recipe behind
`torus__contourSlice__ladder__med__a`. **The implementer's unit-test rig calls
`algo.generate()` directly**, bypassing the engine's display-geometry pipeline
entirely. I confirmed these are NOT the same input (same primitive params,
same camera, same `sliceCount` default of 26 either way — verified by adding
a scoped diagnostic test that reproduces the audit cell's exact
`styleTable`/`lights`/`ground` via `algo.generate()` directly: it still
returns **65 paths / 889.8mm ink**, byte-for-byte the SAME as the plain unit
rig — so lights/fillDensity/toneLaw are not the cause) but they diverge
sharply once routed through the real engine:

| | direct `algo.generate()` (unit-test rig) | real engine + render (audit-cell capture, same code, same commit) |
|---|---|---|
| torus scenePath/front-fill count | 46 (before) → 65 (after) | **109 (before) → 128 (after)** |
| torus total ink | 932.9mm → 889.8mm | **1134.4mm → 1091.3mm** |
| torus pct05 (0.5w) | 2.586% → 0% | **11.0% → 8.6%** |
| torus pct1 (1.0w) | 8.902% → 3.468% | **20.0% → 16.2%** |
| relative improvement, pct1 | 61% | **19%** |

I built this "real engine" column myself, from a from-scratch export of both
`789ba0fa` and `342d8601`, by running the plan's OWN probe scripts
(`capture-audit-cell.js`, `measure-crowded-ink.js` with `PEN=0.3` and
`PEN=0.15`) unmodified, against two disposable dev-servers I started on ports
8517/8518. The before number (1134.4mm ink, 226.7mm within 0.3mm = 20.0%,
109 paths) is an **exact** reproduction of the plan's own §3.2 table — so the
plan's numbers are real and my before-measurement is consistent with theirs.
The after number (16.2%) is new — the plan never measured a post-fix state,
and the implementer never re-ran the plan's own probes against the fix. This
IS the reconciliation the coordinator asked for (flag 3), and it is not
favorable: the unit test's 61%-relative pct1 improvement does not happen on
the rendered cell; the rendered cell only improves ~19%. Root cause of the
divergence (not chased further — out of this review's scope to fix, but
worth flagging for whoever owns the next iteration): `engine.computeAllDisplayGeometry()`
produces roughly 2.4x as many emitted path fragments for the identical scene
definition as calling `algo.generate()` directly (109 vs 46 before the fix),
meaning the SLICE_CLIP_WORK-budgeted clip path is being exercised differently
by the two call routes, and the crowding cull's per-run suppression interacts
with that extra fragmentation far less effectively than it does with the
unit-test rig's coarser, less-fragmented runs.

**Bottom line on flag 3:** the discrepancy is not explained by 0(b) (both the
plan's measurement and the impl's RED baseline are already post-0(b) — the
plan measured at `767bed54`, byte-identical to `789ba0fa` on this code path,
confirmed by the impl's own before/after evidence). It is a rig mismatch: the
RGR proof measures a pipeline stage the user never sees.

## 3. Sub-bars (d)/(e) — merged-ink blobs — UNREPORTED and STILL RED at HEAD

Neither the impl report nor `report.json` contains the word "blob." The
plan's O2(d)/(e) ("no merged blob wider than 3w≈0.9mm"; "≤5 blobs") were never
implemented as tests, and were never re-measured after the fix. I ran the
plan's own `measure-merged-ink-blobs.js` unmodified against my from-scratch
`789ba0fa`/`342d8601` captures:

| | 789ba0fa (before) | 342d8601 (after, K=0.7 as shipped) |
|---|---|---|
| ink px in a ≥75%-inked 1mm window | 3436 (4.39%) | 2850 (3.67%) |
| largest blob | 4.41×3.01mm — the LEFT eye | 3.61×2.81mm |
| 2nd | 6.48×9.62mm — the RIGHT eye | 4.34×7.42mm |
| 3rd | 3.14×2.27mm | 2.94×2.14mm |
| blob count | 40 | 36 |

Acceptance suggested by the plan: largest blob ≤1.5mm (or the stricter
"≤3w≈0.9mm" in the O2(d) row), blob count ≤5. **Both are still badly missed.**
The two "eyes" the user circled in `11.png` are still solid multi-millimetre
merged blobs after the fix — barely 10-18% smaller by area, and the blob count
dropped by only 4 (40→36), an order of magnitude short of the ≤5 target. This
is the single most important number in this review: **by the plan's own
stated defect metric, the item the user reported is not closed.**

## 4. Waist bar 0.65w vs the plan's 0.8w — the implementer's reasoning does not survive testing

The impl report says: raising `CROWD_CULL_K` from 0.7 toward the plan's
suggested band "0.6-0.7... do not start at 1.0" was tried at 0.73, the same
self-window artifact reappeared on a different ring at 0.226mm, "no real
gain," so the test's acceptance bar was set at 0.65w instead of the plan's
suggested 0.8w.

**I tested `CROWD_CULL_K = 0.8` directly** (a scratch copy of `342d8601` with
that one constant changed, `node_modules` re-symlinked, nothing else touched):

| metric | K=0.7 (shipped) | K=0.8 |
|---|---|---|
| torus waist | 0.216mm (0.72w) | **0.249mm (0.83w)** — clears the plan's 0.8w bar |
| sphere waist | 0.223mm (0.74w) | **0.240mm (0.80w)** — clears the plan's 0.8w bar |
| sphere pct1 | 6.475% (misses plan's ≤5%) | **4.295%** — now clears ≤5% too |
| torus total ink retained | 95.4% | 94.9% — still well inside the ~20% band |
| torus front-fill path count | 65 | 66 — no ring collapsed, "never cull a whole level" fallback not observed to trigger |
| full 47/48-test file (incl. my own diagnostic) | 47/47 | **48/48 pass, including the shipped 0.65w-authored assertions** |

K=0.8 is a strict, no-cost improvement over K=0.7 on every number the
implementer's own test suite checks, and it satisfies BOTH sub-flags the
coordinator raised (waist ≥0.8w, and sphere pct1 ≤5%) with room to spare. The
implementer's own experiment was at K=0.73, not K=0.8; extrapolating "the same
artifact reappears, no real gain" from 0.73 to 0.8 turned out to be wrong.
**I could not reproduce any over-culling harm at K=0.8** (no ring dropout, no
guard regression, ink retention still comfortably inside the acceptance
band). Per the coordinator's ruling, 0.65w is not acceptable without a shown
ring-dropout cost, and no such cost was shown or exists at 0.8 — **require
`CROWD_CULL_K = 0.8` (or re-measure to find the true safe ceiling above 0.73)
before landing.**

Caveat: raising K to 0.8 does **not** materially move the real-engine
numbers in §2/§3 (I re-ran the full audit-cell capture + blob probe at K=0.8:
torus pct1 15.8% vs 16.2% at K=0.7, largest blob still 3.61×2.81mm, blob count
33 vs 36 — a small further nudge, not a fix). The K=0.7→0.8 change is a
correctness/rigor fix to the unit-test bar, not a fix for §3's core finding.

## 5. Visual — LOOKED at the PNGs myself

Cropped `after/W-27c-0a/{before-789ba0fa,shots}/A/torus__contourSlice__ladder__med__a.webp`
around both saddle "eyes" at 5x zoom (Pillow, this reviewer's own crop, not
reused from the impl report). Left saddle: before is a clean, fully fused
solid wedge with a sharp apex. After: a single small dark speck appears
exactly at the tip, breaking the very last ~0.2mm of the point into two
almost-touching tips — visible under zoom, essentially invisible at
audit-cell viewing scale, and the overall wedge silhouette — the "angled
point" the user drew a box around — is unchanged. Right saddle: same pattern,
plus one additional isolated dash-like gap on an outer ring partway down the
fan (not at the apex). Neither image shows the "2-3 rings pulled apart" or
"innermost rings separate noticeably earlier" that the impl report's prose
claims — what is visible is much smaller than that description suggests.
Sphere: not independently re-cropped by me, but the impl's own claim ("small
but clearly visible new dark notches") is consistent with the modest pct1 move
(13.9%→6.5% in the unit rig; the real-engine number was not captured for the
sphere by either of us). `solid__contourSlice__ladder__{med,max}__a`: I did
not re-diff bytes myself but the scope guard test (faceted output invariant to
penWidth 0.1 vs 5) is a valid structural proof independent of the image
comparison, and is sufficient — no need to distrust the byte-identity claim.
`{sphere,torus}__…__max__a` byte-identical to `med`: consistent with
`contourSlice` never reading `fillDensity`, confirmed by reading the
`buildSliceSegments` call site (`sliceCount` only, `:3906`).

One incidental oddity, not a defect but worth naming: the before/after webp
pair for `torus…med…a` differ in height by 1px (399 vs 400) — a bbox
auto-crop rounding difference, not geometry. Doesn't affect any measurement
above (all of which use the raw `scenePaths`, not pixel-cropped images).

## 6. Guards — all green, all re-run by me individually in the foreground

| suite | result |
|---|---|
| `tests/unit/scene3d-contour-slice.test.js` | 47/47 (my own from-scratch run at `342d8601`, matches impl claim) |
| `tests/unit/scene3d-mesh-self-occlusion.test.js` | 5/5 |
| `tests/unit/scene3d-hlr-spatial-index-identity.test.js` | 6/6 |
| `tests/unit/scene3d-curves.test.js` | 13/13 |
| `tests/unit/scene3d-hlr.test.js` | 11/11 |

Plane-count purity (`:204-306`) passes unmodified — consistent with
`buildSliceSegments`/`linkSegments`/`refineSliceRing` being untouched by the
diff (verified by reading the diff, not merely trusting the claim). The
re-pinned 0(b) guard (55→80 ceiling) is honestly commented with the measured
cause (65 paths now, intentional run-splitting, not gap fragmentation) and I
have no reason to doubt it — 65 is far from both the new 80 ceiling and the
old 107 gap-fragmentation regression it guards against.

**Mutation check (coordinator implicit ask, item 5 of the brief):** disabling
the cull (= testing at `789ba0fa`, where the code path is simply absent) makes
the two O2(a) assertions fail with the exact RED numbers above — confirmed in
§2. The oracle is not vacuous.

**W-27c-0(b)/W-29 interaction:** ran the full `scene3d-contour-slice.test.js`
suite (which contains both the 0(b) and W-29 describe blocks) at `342d8601` —
all pass, including 0(b)'s own "genuine self-occlusion survives" and turning-
angle tests, and W-29's five topology tests (zero-length segments, odd-degree
nodes, closed-ring purity). Micro-gaps and open rings both still assert zero.

## 7. report.json / GH-1 fields

`docs/3d-audit/fill-audit/after/W-27c-0a/report.json` has the expected shape
(`before`/`after` arrays, `gallery_hygiene_note`, `notes`, `measurements`,
`visual_inspection`, `identical_exceptions`) matching the GH-1 precedent
structure. Its `measurements.O2_torus`/`O2_sphere_control` blocks repeat the
**same unit-test-rig numbers** critiqued in §2 (2.586%/8.902%/0.039mm etc.) —
i.e., the report.json inherits the same rig mismatch, presented as if it
described the six `.webp` shots listed two keys above it. This should be
corrected (or at minimum footnoted) in any follow-up: the numbers next to the
evidence images are not numbers taken from those images.

## 8. Required follow-ups before this item can be called closed

1. **Re-scope O2 as a real-pipeline oracle, or explicitly relabel this unit's
   test as a partial/mechanism-level proof.** As shipped, "47/47 green" reads
   as "the defect is fixed"; §2/§3 show the rendered gallery cell is still
   ~80-85% as crowded as before by the plan's own metrics, and the specific
   blobs the user circled are barely smaller. Recommend either (a) a new unit
   test built on `engine.computeAllDisplayGeometry()` output (or an
   integration test that goes through the real pipeline) asserting the O2
   bars on THAT output, or (b) an explicit STATUS downgrade to
   "MEASURED/PARTIAL" with the real numbers stated plainly, so nobody reads
   this as "0(a) is closed."
2. **Raise `CROWD_CULL_K` to at least 0.8** (§4) — no measured cost, closes
   two of the coordinator's flags, and is the plan's own suggested value.
3. **Implement O2(d)/(e) as tests** (merged-blob width/count), using the
   plan's own `measure-merged-ink-blobs.js` logic ported into the test file
   the way (a)/(b)/(c) already were. At K=0.7 or 0.8 both are still RED
   (§3) — this needs its own iteration, most likely the plan's explicitly
   deferred Rank 3 (level warping), which is the textbook full cure the plan
   itself pointed at.
4. Correct `report.json`'s `measurements` block to either report the
   real-pipeline numbers alongside the unit-rig numbers, or say explicitly
   which pipeline stage each number was taken from.

None of the above is a request to revert what shipped: the diff is scoped
correctly, doesn't touch anything it shouldn't, doesn't widen any tolerance
dishonestly (aside from the K/waist question in §4, which has a straightforward
fix), and the guard suites are genuinely green. It is a real, if small, step
in the right direction. It is not, on the evidence, the closure of the user's
reported defect.

REPORT docs/3d-audit/lane-reports/W-27c-0a-review.md
