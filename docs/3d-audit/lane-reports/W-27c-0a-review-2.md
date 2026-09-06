STATUS: ACCEPT-PARTIAL (conditional — one test-only edit + one capture gap closed by this review; land the edit before merge)

# W-27c-0a iteration 2 — adversarial review 2

Reviewer: Sonnet, read-only in `.claude/worktrees/fill-audit-d`
(`git status --short -- . ':!graphify-out'` empty before, during, and after;
zero edits/commits in the worktree — all edits below are in scratch exports).
Range: `342d8601..f268f21c` (=HEAD; single commit
`fix(scene3d): W-27c-0a iteration 2 — CROWD_CULL_K 0.7->0.8, real O2(d)/(e)
blob bars, disclosed bar changes`). Responds to the coordinator's three
conditions plus the separate routing question ("is the sphere regression
real and user-visible").

## Verdict per sub-bar (engine-pipeline rig, K=0.8, re-verified by me from scratch)

| sub-bar | torus | sphere |
|---|---|---|
| (a) ink <0.5w | PASS (0%, RED 2.586%) | PASS (0.013%, RED 4.078%) |
| (b) ink <1.0w, plan bar <=5% | PASS (2.760%, RED 8.902%) | PASS (4.295%, RED 13.906% — was a FAIL at iteration 1's K=0.7, now genuinely fixed) |
| (c) waist, plan bar >=0.8w | PASS (0.249mm=0.83w) | PASS (0.240mm=0.80w, right at the line) |
| (d) largest blob, plan bar <=0.9mm | **FAIL, but real, large improvement** (RED 3.35mm -> 2.10mm) | **FAIL, but real, large improvement** (RED 34.50mm -> 14.85mm) |
| (e) blob count, plan bar <=5 | **FAIL, real improvement** (RED 27 -> 12) | **FAIL, and REGRESSED** (RED 47 -> 54; confirmed on the real browser too, 60 -> 64, see §2) |

Guards: `scene3d-contour-slice.test.js` 49/49, `scene3d-mesh-self-occlusion`
5/5, `scene3d-hlr-spatial-index-identity` 6/6, `scene3d-curves` 13/13,
`scene3d-hlr` 11/11 — all re-run individually by me from a from-scratch
`f268f21c` export. RED reproduced fresh: copying this iteration's test file
onto a from-scratch `789ba0fa` export gives exactly 4 failures with the exact
stated RED numbers (both old O2(a)/(b)/(c) tests and both new engine-pipeline
O2 tests fail; everything else passes) — the oracle is not vacuous.

## The user's circled defect (11.png): improved, not fixed

**Stated plainly, with numbers, for Jay:** the torus's two "eyes" — the
merged ink blobs at the saddle cusps the user circled — are measurably
smaller and fewer after this fix, but still solidly present. Real-browser
capture (my own from-scratch `789ba0fa` vs `f268f21c`, the plan's own
`measure-merged-ink-blobs.js` script, unmodified):

| | before (789ba0fa) | after (f268f21c, K=0.8) | plan's bar |
|---|---|---|---|
| largest blob (left eye) | 4.41x3.01mm | 3.61x2.81mm | <=0.9mm — still missed |
| 2nd blob (right eye) | 6.48x9.62mm | 4.34x7.42mm | <=0.9mm — still missed |
| blob count | 40 | 33 | <=5 — still missed |
| dense-ink px fraction | 4.39% | 3.46% | — |

This is a genuine, visible improvement (I looked at both images myself, see
§1) — the fused wedge tip now has a small but real notch cut into it, and
several rings across the frame carry small run-split breaks rather than one
continuous crowded band. It is not the closure the plan's own acceptance
bars define. **Improved, not fixed.**

## 1. Condition 1 — LOOK at the 800px torus picture: cusp blobs smaller/fewer, no ring dropout?

Cropped `docs/3d-audit/fill-audit/after/W-27c-0a/{before-789ba0fa,shots}/A/torus__contourSlice__ladder__med__a.webp`
myself (Pillow, 5x zoom, both saddle "eyes," same crop boxes I used in review
1 so the comparison is apples-to-apples). **Left saddle:** before is a fully
fused, unbroken wedge with a sharp point; after (K=0.8) shows a small but
clearly visible dark teardrop notch cut into the very tip — slightly more
pronounced than iteration 1's K=0.7 crop — plus a new small gap on the lower
horizontal ring just past the tip. **Right saddle:** same pattern. **Full
frame** (both before and after, both saddles, all ~30 nested rings): every
ring present in "before" is still present in "after" — same silhouette, same
outer boundary, same two hole "eyes," no ring vanished, no level dropped.
Several rings elsewhere in the frame (not just at the two saddles) now carry
small tick-mark-like breaks from the crowding cull's run-splitting, visible
but not disruptive to the overall figure. **Condition 1 holds: real,
visible, partial improvement; zero ring dropout observed.**

## 2. Condition 2 — is "measure-crowded-ink.js: 10.9%→15.8%, worse" real or an artifact?

**It is neither a real regression nor the seam-index artifact the impl
report diagnosed — it is a units mismatch in the impl's own "before" number.**

I ran the plan's `measure-crowded-ink.js` **unmodified**, at a **consistent**
`PEN=0.3` (1 pen width), against my own from-scratch captures of both commits:

| | 789ba0fa | f268f21c (K=0.8) |
|---|---|---|
| ink total | 1134.4mm | 1086.5mm |
| within 1 pen (0.3mm) | 226.7mm (**20.0%**) | 171.8mm (**15.8%**) |

**20.0% -> 15.8% is an improvement**, matching iteration 1's already-reviewed
finding almost exactly (16.2% at K=0.7, marginally better at K=0.8). The
impl-2 report's claimed "before" number, 122.3mm/**10.9%**, does not match
this — it is suspiciously close to my own measured **0.5-pen** number for the
same 789ba0fa capture (124.8mm/**11.0%**, exact match to the plan's own
original §3.2 table). This strongly indicates iteration 2's "before" row used
a 0.15mm threshold while its "after" row correctly used 0.3mm — an
apples-to-oranges comparison, not a real before/after delta.

I also built a **seam-aware** version of the same probe (circular,
closed-ring-aware same-path index exclusion, exactly matching this lane's own
`circDist` helper) and ran it at a consistent `PEN=0.3` on both captures:
**19.98% -> 15.82%** — statistically identical to the non-seam-aware numbers
above. **Seam-awareness changes nothing.** The impl report's proposed
mechanism ("the probe's non-seam-aware self-window inflates the false-positive
rate as path/seam count rises") does not hold up under direct test — the
number was never actually inflated by seams; it was two different pen widths
compared to each other.

**Condition 2 holds, and more favorably than the coordinator's framing
assumed: there is no "worse" reading of this metric at all, at any pen
width, seam-aware or not.** This should be corrected in the impl report and
`report.json` (which currently states "10.9% -> 15.8%, WORSE, diagnosed" —
that row is wrong and should read "20.0% -> 15.8%, improved").

## Sphere blob-count regression — real and user-visible, not a metric artifact

(Answering the separate routing question directly.) I captured the sphere
audit cell fresh for both commits (my own from-scratch export, the plan's own
`capture-audit-cell.js`/`measure-merged-ink-blobs.js`, adapted only to swap
`torus` for `sphere` — no logic changed) — **this closes the "sphere
real-browser cell re-shot" gap the impl report explicitly left open
(follow-up #5).**

| | 789ba0fa | f268f21c (K=0.8) |
|---|---|---|
| largest merged blob | 15292px, **39.55x39.75mm** (essentially the whole pole region as one blob) | 4111px, **11.02x21.31mm** |
| blob count | 60 | 64 |
| dense-ink px fraction | 17.22% | 14.06% |

This confirms the engine-pipeline rig's finding held on the real browser too:
largest-blob width shrinks dramatically (~46% smaller on the long axis), but
blob count is flat-to-slightly-worse (60->64, not 47->54, but the same
direction and a comparable relative size). **I looked at both sphere images**
(`before-789ba0fa` vs current `shots/A`, full frame, no crop needed at this
zoom): before shows one continuous, gradually-crowding band on the right/near
side with only the expected outer-rim antialiasing notches; after shows the
SAME rings now broken by many small dash-like gaps spread across a wide arc
(top, upper-left, and right side all show multiple new breaks), not confined
to a single "pole." **This is real and visible, not a metric artifact** — the
sphere's fix visibly trades one continuous crowded band for a scattering of
many small dashes across a broader region. Whether that reads as an
improvement is genuinely debatable (the merged AREA is much smaller, but the
image now has a "dashed" texture it didn't have before); it is honestly
reported as a miss in the impl report and I have no correction to make there
— the direction (worse count, real and visible) is confirmed.

## 3. Condition 3 — are (d)/(e) floors with a ±10% band, or self-referential RED pins?

**As shipped in `f268f21c`, they are self-referential RED pins, not floors.**
Read directly from the diff (`tests/unit/scene3d-contour-slice.test.js`):

```
expect(m.largestW).toBeLessThan(3.35); // torus — 3.35 IS the RED value
expect(m.blobCount).toBeLessThan(27);  // torus — 27 IS the RED value
expect(m.largestW).toBeLessThan(34.5); // sphere — 34.5 IS the RED value
```

Any improvement over RED, however small, passes; a future regression that
drifts most of the way back toward RED (e.g. torus largestW creeping from
2.10mm to 3.30mm) would pass silently. This is exactly the coordinator's
concern and it is correct — **this is not yet a regression guard.**

**I verified the required fix is feasible with zero side effects**, in a
scratch copy (not the worktree): changing the three assertions to floors at
this iteration's own measured GREEN values with a +10% band —

```
expect(m.largestW).toBeLessThan(2.10 * 1.10);              // torus (d)
expect(m.blobCount).toBeLessThanOrEqual(Math.ceil(12 * 1.10)); // torus (e)
expect(m.largestW).toBeLessThan(14.85 * 1.10);              // sphere (d)
```

— and reran just that describe block: both tests still pass, deterministically,
with the current code. (Sphere (e) is correctly left as a sanity bound only,
per the disclosed regression — there is no "improvement" to floor.)

**This edit has NOT been made in `f268f21c`.** Per the coordinator's
condition, it is required before this unit can be called closed. I could not
make it myself (read-only in the worktree) — it is a mechanical, low-risk,
test-only change (verified above) and should be the only remaining work item
before this lands.

## 4. `## Bars changed` — complete against the diff

Diffed `tests/unit/scene3d-contour-slice.test.js` between `342d8601` and
`f268f21c` myself and enumerated every changed `expect(...)` line: the two
waist-bar changes (0.65w -> 0.8w, torus and sphere) and the sphere pct1
change (`<10` -> `<=5`) are exactly the three rows in the report's "changed"
table; the six new `expect` lines (pathCount sanity, largestW, blobCount x2
each new test) are exactly the "new bar" rows in the second table. The 0(b)
guard's `<=80` ceiling is untouched in the diff, matching the table's
"unchanged" row. **Nothing is missing or misdescribed.**

## 5. Diff scope

Two files: `scene3d.js` (+22/-4, the `CROWD_CULL_K` constant and its comment
only — confirmed by reading the hunk, no other line moved) and the test file
(+331/-26). `mappers.js`, `hlr.js`, `surface-fill*.js`: zero touches.

## Verdict

**ACCEPT-PARTIAL**, per the coordinator's own framing — both gating
conditions (1) and (2) hold (real, visible, non-artifactual, non-regressive
improvement; no ring dropout). Condition (3)'s required test-only edit is
verified feasible but **not yet landed** — treat this as a one-line-diff
blocker, not a new iteration: apply the three floor+10%-band assertions
above, re-run the two engine-pipeline tests to confirm still-green (they will
be, per my scratch verification), commit, done. No further mechanism work is
justified for this W-id.

**For Jay, plainly:** the torus's two circled cusps in `11.png` are smaller
and less numerous after this fix (largest blob 4.41x3.01mm -> 3.61x2.81mm and
6.48x9.62mm -> 4.34x7.42mm; blob count 40 -> 33) but still clearly visible as
merged points at normal viewing scale — **improved, not fixed.** The sphere
trades a bigger problem (one 39.5mm merged polar cap) for a smaller-area but
more numerous set of blobs (60 -> 64 blobs) with a new "dashed ring" look
across a wider band — also a real, visible change, and also not a fix.
Closing this fully needs the plan's Rank 3 (level warping — equal contour
spacing on the surface, not equal `d`), already flagged in both impl reports
as its own deferred unit; recommend that be scoped as **W-27c-0a-2** for a
follow-up plan.

REPORT docs/3d-audit/lane-reports/W-27c-0a-review-2.md
