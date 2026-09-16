STATUS: REJECT

# T2-2 review — mkTick variable-length ticks, iteration 2 (a different length-response curve)

Reviewed range **3bc61c32..9d911b05** exactly, worktree `.claude/worktrees/fill-audit-a3`
(read-only — never edited, stashed, checked out, or committed to). All measurement was done in
scratch `git archive` exports at `/private/tmp/claude-501/scratch-T22/{pre,post}` (node_modules
symlinked from MAIN), deleted after use. Every number below was independently re-derived — not
read off `T2-2-impl.md` — using my own instrumentation and my own captures
(`docs/3d-audit/fill-audit/after/T2-2/review/` and `review-pre/`), separate from the implementer's
own `after/T2-2/` capture.

## Verdict up front

The `chan:'len'` mechanism and the `P = L/g` conservation re-derivation are sound (independently
re-verified, §3) and the length-ratio fix (R1, "length carries tone") is real and mutation-proven
on all six cells (§2). **But this is the same defect T2-review rejected, wearing a softer curve,
not a different one.** The blended curve never has literally zero derivative, but its *shape*
still concentrates almost all of the length swing in the middle of the tone range and stays
nearly flat in bands adjacent to both anchors (§1) — and on two of the six named cells
(cone/hatch, torus/contour) this is visibly, measurably worse than the pre-fix render, not better
(§1, §9). The implementer's own "what I saw" section **describes torus/contour as contradicting
T2-review's "hard-walled flat-topped columns with enlarged bare wedges" finding — my own
native-resolution crop of the exact same cell shows that pattern reproduced, with a visibly LARGER
wedge than pre-fix** (§9). And the new test file added to gate this fix **passes unchanged when
the curve is mutated back to the literal rejected pure-smoothstep** (§7) — it provides zero
regression protection against the defect recurring. **REJECT.**

## 1. ORCHESTRATOR PICTURE FLAG — CONFIRMED (cell-dependent, severe on 2/6)

**Curve shape, not just endpoints.** `eased(t) = (1-B)*t + B*smoothstep(t)`, `B=0.88`,
`t=clamp(1-I,0,1)`. Analytically (own calc, not from the report): the derivative ranges from
`(1-B)=0.12` at both endpoints up to `1.44` at `t=0.5` — a 12x swing, not a flat-to-steep-to-flat
curve in name only. Fraction of the total `L` swing accumulated by `t=0.1` is **3.7%** (pure
smoothstep: 2.8%; pure linear: 10%) — i.e. **the blended curve's shape near both anchors sits much
closer to the rejected pure-smoothstep's shape than to linear**, because smoothstep still carries
88% of the weight. This is a diluted version of the same curve family, not a different one.

**Empirical confirmation** (own instrumented site log, cone/hatch d=50, mean drawn `L/R` per 0.05-wide
`I` bin — reproducing the exact quantity T2-review's own decile breakdown used): bins 0.00-0.15 sit
at 0.91-1.00 (near `L0=1.02`, a near-flat dark-end shelf); bins 0.80-0.90 sit at 0.21-0.26 (near
`LMIN=0.18`, a near-flat highlight-end shelf); the middle ~70% of the `I` range carries the graded
transition. Two shelves bracketing a steep middle — the qualitative signature T2-review attributed
to the rejected curve — is still present, just narrower and non-zero-sloped.

**Bare area outside the highlight zone** (`I<0.90`, own site log, Σ`R·P` over un-drawn sites,
d=50, six cells, pre → post):

| cell | pre bare mm² | post bare mm² | ×change |
|---|---|---|---|
| sphere/hatch | 8.11 | 33.30 | **4.11×** |
| sphere/contour | 7.54 | 13.98 | **1.85×** |
| torus/hatch | 2.09 | 19.37 | **9.25×** |
| torus/contour | 7.03 | 16.13 | **2.29×** |
| cone/hatch | 2.42 | 13.35 | **5.53×** |
| cone/contour | 1.79 | 6.34 | **3.55×** |

**Bare area outside the highlight increases on ALL SIX cells, by 1.85× to 9.25×.** This is not
disclosed anywhere in `T2-2-impl.md` (only the implementer's own "worst contiguous gap ÷ pitch"
metric is reported, which is a different, narrower quantity — see below).

**Worst un-ticked band ÷ row pitch** (own methodology, close to but not identical to the
implementer's — mine measures the run's own arc-length span; theirs may window differently; both
reproduce the same qualitative direction). My numbers, pre → post, d=50: sphere/hatch 3.43→5.76,
sphere/contour 5.88→8.08 (matches the implementer's own 5.88→8.08 exactly), torus/hatch
3.03→4.44, torus/contour 4.19→4.41, cone/hatch 7.54→7.54 (flat in my measure — see caveat below),
cone/contour 0.15→0.15 (flat, matches implementer). **The implementer's own table shows cone/hatch
worst-gap-ratio moving 7.54→10.70, a +42% increase** — the largest single move of any cell in
their own table, on the cell where my visual crop (§9) shows the clearest new bare wedge. My
run-detection did not isolate the same specific gap they measured (a methodology gap on my part,
not a refutation) — I flag this rather than paper over it.

**Ruling on the flag: TRUE, cell-dependent.** This is the T2-1 defect's mechanism (a curve that
spends most of its swing in the tone-range middle, flat near both anchors) still operating, with a
softened but not eliminated shelf. It is severe and visually obvious on cone/hatch and
torus/contour (§9); it is present but visually mild-to-neutral on sphere/hatch, where the taper
reads as a legitimate improvement over the pre-fix uniform-tooth-length/widening-spacing pattern.
**"Genuinely different curve" is not supported by the curve's own shape analysis** — it is the
same curve family with a non-zero floor slope, which measurably helps the O5 mean-of-thirds
oracle (that oracle only samples the anchors' thirds) without closing the underlying shelf that
drives the wedge/plateau artifact in the interior.

## 2. Six-cell acceptance table — reproduced, all six cells

Own instrumented site log (`layMark`, drawn-length hook, scratch-only, `place`'s return value used
in both trees), d=50:

| cell | length ratio (mine) | impl's ratio | coverage (mine) | impl's coverage |
|---|---|---|---|---|
| sphere/hatch | 3.487 | 3.487 | 0.974 | 0.974 |
| sphere/contour | 3.072 | 3.072 | 0.988 | 0.988 |
| torus/hatch | 3.056 | 3.056 | 0.987 | 0.987 |
| torus/contour | 3.605 | 3.605 | 0.987 | 0.987 |
| cone/hatch | 3.277 | 3.277 | 0.985 | 0.985 |
| cone/contour | 3.640 | 3.640 | 0.993 | 0.993 |

**Exact digit-for-digit match on every cell, both metrics, my own independent instrumentation.**
The implementer's headline table is honest and reproduces exactly. My own RED-table re-derivation
(pre-fix `chan:'count'`, d=50) also matches their RED table to 3-4 decimals on every cell (e.g.
cone/hatch dark/mid/light 5.398/6.194/3.790 both here and in `T2-2-impl.md`).

**d=220 coverage**, own log, matches the implementer's honesty table closely: sphere/hatch
0.815 (theirs 0.818), sphere/contour 0.789 (0.791), torus/hatch 0.674 (0.676), torus/contour 0.748
(0.750), cone/hatch 0.815 (0.820), cone/contour 0.792 (0.792). **Independently confirmed real, not
an instrumentation artifact of the implementer's own script.**

Partial table would fail this unit per protocol; the full six-cell table above is complete on both
metrics I measured.

## 3. The plan's g-based formula — confirmed it does not return

`solveAt`'s `lenChan` branch computes `L` as a pure function of `t = clamp(1-I, 0, 1)` (radiance),
then re-derives `P = L/g`. This is exactly T2's own (accepted) mechanism — `L` never comes from `g`
directly, unlike the plan's own rejected pseudocode (`L = clamp(g*P, LMIN*R, L0*R)`). Confirmed by
direct code read (`surface-fill.js` `lenChan` branch, `~line 6460`); no live re-test needed since
this is unchanged from T2's own math, already independently verified sound in `T2-review.md` §3.

## 4. Attribution — MK_ROW_COV vs. T2-2's own curve, measured not asserted

**Structural proof, not a new mutation run needed:** `isMarkLaw()`'s row-coverage line and
`rowFloor` are byte-identical between `3bc61c32` and `9d911b05` (confirmed via `git diff` — zero
hunks touch that code), and the ONLY new code path is `lenChan`, gated on `law.chan === 'len'`,
which is unique to `mkTick`. Since pre (`chan:'count'`) and post (`chan:'len'`) differ in EXACTLY
one mechanism, and the bare-area/worst-gap numbers move on every cell (§1), the increase is
structurally attributable to T2-2's own curve, not to the untouched scaffold — this matches the
implementer's own claim on attribution.

**Where I diverge from the implementer:** the d=220 "not primarily a curve-shape defect" framing
undersells what my own decile/bin breakdown shows. The drawn-fraction collapse starts around
`I~0.6-0.7` (both the implementer's own decile table and my independent d=50 bin breakdown, §1,
show the decline is well underway by the midpoint of the tone range, long before `I` nears the true
highlight `~0.9-1.0`). Calling this "LMIN*R legitimately nearing MIN_MARK_MM at the extreme light
end" is accurate only for the LAST decile; the mid-range falloff is a property of the eased curve's
own shape (§1), which the implementer's own BLEND sweep (0.62→0.92, d=220 coverage flat) already
proves is not rescuable by retuning the SAME curve family. That is itself evidence the curve
family, not just its parameters, needs to change — a stronger conclusion than "curve shape is not
the issue."

## 5. `## Bars changed` — verified, and the diff scanned line-by-line

`git diff 3bc61c32..9d911b05 -- tests/unit/scene3d-mark-laws-draw.test.js` (+40/-22) touches
**only** the O1 test body (`sagittaOf` refactor, longest-third-by-chord-length re-scope) and
comments. **Zero numeric literals moved** — the `>= 0.10mm` bar is textually unchanged
(`expect(median).toBeGreaterThanOrEqual(0.10);` present before and after). This matches the sole
disclosed entry under `## Bars changed` in `T2-2-impl.md`; no hidden re-pin found.

**Guards, independently re-run, foreground, `timeout: 600000`:**
- `scene3d-mark-laws-draw.test.js`: **30/30** (matches claim exactly; G4, O2/O3/O4/W-05/O9/T4b all
  green unmodified).
- `scene3d-mkdashramp-dark-end.test.js`: **4/4** (matches claim). This file is byte-identical
  between pre/post (confirmed: `diff` against the pre-fix scratch export's copy — identical file,
  T4b's own test, `mkDashRamp` untouched by this unit), so the sphere/hatch/mkDashRamp d=220 ink
  number cannot differ pre/post by construction — no live pre/post comparison was meaningful here.
- `scene3d-crosshatch-cell-shape.test.js` (W-31): **23/23**.
- `scene3d-crosshatch-parity.test.js` (W-36c): **91/91**.
- `scene3d-ladder-uniform-field-spacing.test.js`: **9/9**.
- `scene3d-fill-ruling-corners.test.js` (W-33): **19/19**.

All match the implementer's claimed counts exactly.

## 6. Byte-identity — independently re-swept, confirmed

Own md5 script (not the implementer's), `mkDotScreen, mkScribble, ladder, fineLadder,
phaseFineLadder` × `{sphere,torus,cone}` × `hatch` × `{low=10,med=50,max=220}` = **45 cells, 0
mismatches**, run against clean `3bc61c32`/`9d911b05` scratch exports. Matches the implementer's
claim exactly.

**Grep for pins on the changed law:** `mkTick` also has a completely separate, unrelated
implementation in `src/core/scene3d/shadows.js:1229` (shadow hatching, a different code path with
no shared function bodies with `surface-fill.js`'s `MK` table) — untouched by this diff (confirmed:
`git diff --stat` touches only `surface-fill.js` and the two named test files). `lenChan` is gated
on `law.chan === 'len'`, unique to `mkTick`'s own `MK` table entry — no other law's `solveAt`
branch is reachable through it. **Sweep coverage as fraction of the roster:** the same 2-of-10
reachable-law justification the implementer and T2-review both already established (the other 8
named laws fall back to `'ladder'`, an existing, already-documented gap — not new here).

## 7. New bars in `scene3d-mktick-length.test.js` — BLOCKING FAILURE

**RED, re-derived** on a clean `3bc61c32` scratch export (test file copied over, nothing else
changed): **6/12 fail**, all six O5 tests, `TypeError: undefined is not iterable` on
`stat.cntByThird`/`lenByThird` (the seams don't exist pre-fix) — real RED, right reason. The
"field stays complete" test passes trivially pre-fix (6/6), because it re-derives O3's own
pre-existing `offSurface`-refusal formula verbatim (`tests/unit/scene3d-mktick-length.test.js:91`,
identical expression to `scene3d-mark-laws-draw.test.js:280`'s O3 test) — **it is not a new
oracle**, and the test's own name admits this ("re-checking O3 is not reopened").

**GREEN** at `9d911b05`: **12/12**, matches claim.

**Mutation 1 (chan reverted to `'count'`):** all 6 O5 tests fail, values matching the RED table
digit-for-digit (e.g. cone/hatch `5.398 < 6.194`) — O5 genuinely gates the length-carries-tone
mechanism.

**Mutation 2 (`MK_TICK_EASE_BLEND` lowered to 0.62):** 2/12 fail (sphere/contour 2.863, torus/hatch
2.854, both `< 3.0`) — matches the implementer's own sweep numbers almost exactly (they report
2.86/2.85). O5 is genuinely sensitive to the curve's BLEND parameter within the tested range.

**Mutation 3 (`MK_TICK_EASE_BLEND` raised to 1.0 — the LITERAL REJECTED pure-smoothstep curve from
T2, with T2-2's own `P`-conservation kept):** **all 12 tests still pass**, O5 clears with MORE
margin than at BLEND=0.88 (raising BLEND only helps the mean-of-thirds oracle). **This is the
central finding of this review: the shipped test suite cannot detect a regression back to the
exact curve T2-review rejected.** If a future change (accidental or deliberate) reintroduces pure
smoothstep, this test file will not catch it, and per the mechanism established in §1, that
reintroduction reproduces the plateau/wedge defect on the same cells (cone/hatch, torus/contour)
this review found it on.

**Which half of the 8.png complaint each test gates:** O5 gates R1 (length carries tone) —
genuinely, mutation-proven. The "field stays complete" test gates neither half genuinely — it
duplicates O3's wholesale-refusal check (a walk-geometry concern, unrelated to the tone-response
curve: `offSurface` does not move with `MK_TICK_EASE_BLEND`, confirmed by inspection of the
`lenChan` branch, which never touches `offSurface`). **R2 ("the field stays complete as one
continuous texture whose tick length and density carry the tone") has NO dedicated regression test
in this unit** — no continuity/plateau/shelf-shape oracle exists anywhere in the diff, which is
exactly the gap T2-review's own §9 asked this unit to close ("(ii) a direct plateau/continuity
check ... since the mean-of-thirds oracle is blind to exactly the artifact this review found").
**This gap was not closed. BLOCKING per this review's own instructions.**

## 8. Lane red set at `9d911b05` — spot-checked, all green

`scene3d-ribbon-f1b-streaks.test.js`: **44/44**. `scene3d-ribbon-wall-coverage.test.js`: **36/36**.
`scene3d-ribbon-f1-amp.test.js`: **47/47**. `scene3d-ribbon-erode-refusal.test.js`: **16/16**
(bonus spot-check, not in the original four named). All green, matching the implementer's claim
that the lane's pre-existing reds (F1-trochoid's two, closed by F1-amp before this unit started)
stay closed and this unit introduces no new redness. Nothing to attribute.

## 9. Pictures — native-resolution crops, both rigs

Own captures (`docs/3d-audit/fill-audit/after/T2-2/review/` post, `review-pre/` pre; both `--rig
create` and `--rig addLayer`; `served version 1.4.1` matched both roots' `package.json`), separate
from the implementer's own `after/T2-2/` shots.

**cone/hatch/med, right (lit) flank near the silhouette, `create` rig, 3x crop.** Pre: full-length
teeth pack close to the outline edge with only a narrow, consistent gap. Post: the last row of
teeth shrinks dramatically approaching the silhouette, leaving a **clearly larger triangular bare
wedge** between the shortened teeth and the outline than pre shows in the same location. This
directly contradicts the implementer's own description ("no abrupt plateau cutoff, no new bare
wedge at the silhouette edge").

**sphere/hatch/med, upper-right highlight region, `create` rig, 3x crop.** Pre: uniform-length
teeth with widening SPACING approaching the highlight (count-carries-tone). Post: constant tight
spacing with teeth SHRINKING to short dashes/dots approaching the highlight, row staying complete
close to the edge. **This one reads as a genuine improvement** — length legibly carries tone, no
obvious new bare wedge. Confirms the flag is cell-dependent, not universal.

**torus/contour/med, fan peak, both `create` and `addLayer` rigs, 4-6x crop.** Pre (both rigs): a
continuous, gradually-fanning comb of curved lines; small triangular notches where MK_ROW_COV bands
meet, but no dominant white block. Post (both rigs): a distinct **hard-edged white "column/dome"**
occupying the fan's peak, flanked by **two conspicuously larger black triangular wedges** than pre
shows in the same location, with a visible staircase-stepped (graded but still blocky) boundary
between ink and bare paper. **This is, structurally and visually, the same "hard-walled flat-topped
columns with enlarged bare wedges" pattern T2-review photographed and rejected** — present on BOTH
rigs, at the exact cell the implementer's own report claims "directly contradicts" that finding. My
own crop of the same cell, same density, same angle, contradicts the implementer's claim, not
T2-review's.

**Plotter-artist framing, per condition 9:** cone/hatch and torus/contour read as **"bands with
wedge-shaped holes,"** not "one continuous texture whose tick length carries the tone" — the exact
opposite of R2. sphere/hatch reads as the latter, correctly. **A verdict that treats the six cells
as interchangeable is wrong; a verdict that ships the mechanism as-is because it "passes on all
six" (a mean-of-thirds ratio bar blind to shape, §7) ships a real, visible regression on at least
two of them.**

## What should ship, and what should not

**Keep:** `chan:'len'`, the `LMIN`/`L0`/`P0` mechanism, the `P=L/g` re-derivation (all independently
re-verified sound, §3), the `lenByThird`/`cntByThird` seam, the O1 re-scope reasoning (sound, §5),
the byte-identity sweep (§6).

**Fix before re-submission:** (1) a length-response curve whose *shape*, not just its endpoints,
does not concentrate the swing in the tone-range middle — or accept that a coverage-floor
mechanism (T3's `MK_ROW_COV` territory) has to co-ship with any curve in this family, since the
BLEND sweep already proves retuning within this curve family cannot close it (§4); (2) a
plateau/continuity oracle distinct from the mean-of-thirds O5 (§7 — BLOCKING, this review's own
condition), ideally one that would have failed at BLEND=1.0; (3) re-verify "what I saw" against a
native-resolution crop of torus/contour specifically before re-claiming it contradicts
T2-review — in this review's own crop it does not.

## Evidence

`docs/3d-audit/fill-audit/after/T2-2/review/` (post, this review, both rigs) and
`docs/3d-audit/fill-audit/after/T2-2/review-pre/` (pre, `3bc61c32` scratch export, both rigs) — six
named cells (sphere/torus/cone × hatch/contour × mkTick × med, angle `a`), `served version 1.4.1`
matching both roots. Scratch instrumentation (`measure.js`, `md5sweep.js`, patched
`surface-fill.js` copies with a scratch-only logging hook at the exact `layMark`/`place` return
point, no formula touched) and all scratch exports under
`/private/tmp/claude-501/scratch-T22/` deleted after use. No files left in the worktree.

REPORT docs/3d-audit/lane-reports/T2-2-review.md — REJECT — same defect softened, not fixed; new tests miss it; torus/contour crop contradicts impl's own claim.
