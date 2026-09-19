STATUS: DONE

# W-36e — implementer report (TESTS ONLY)

Lane: fill-audit-a4. Worktree: `.claude/worktrees/fill-audit-a4`. Base sha: `e60d102e` (T3b).
New sha: `a5d8a1be`.

Files touched: exactly one — `tests/unit/scene3d-curved-density-floor.test.js` (+118 lines,
one new `test(...)` block plus its comment). No `src/` file touched. No other test file, no
helper file.

## Scope (LEDGER row 4b, W-36d-review.md follow-up 1)

Close the crosshatch dial bar's INTERIOR blind spot: the two existing bars on `crossFamilyBCount`
(nB) — the endpoint-ratio + strict-monotonicity check from W-36c, and the lower-half magnitude
sub-bar from W-36d — are both full-span, 2-3-point samples (0.25/1.0/2.0, or 0.25 vs 1.0). Neither
samples the interior of any sub-interval. W-36d-review.md demonstrated the resulting gap with two
independently constructed mutations to `crossPairShare` that touch NO sampled point — an interior
notch frozen over `[0.4, 0.9]` and one concentrated over `[0.6, 0.95]` (the secretary's own ask) —
and BOTH evade every bar in the file while erasing a real, visible decline at `r = 0.9` (d=100 nB
52 -> 55; d=10 nB 7 -> 8).

## What the new bar measures, and which half of the contract it gates

`crossFamilyBInk(d, ratio)` (new, self-contained inside the new test — not a shared helper edit)
drives `SurfaceFill.buildObject` the same way `crossFamilyBCount` does (monkeypatch, filter
front-facing, select family B's own `fam`), but instead of `Set.size` on the integer `lineIndex`,
it sums `pathLength()` (Euclidean mm, the same convention T2-3c's runaway census uses) over every
one of family B's own drawn rulings. This is an INK-based quantity, not the integer ruling count.

*(MERGE r4 item 30/R4-2 annotation: harness rule C — `SurfaceFill.buildObject` builds one primitive
directly, no scene/ground wrapper, so ground-plane inclusion is N/A. Fixture: object-only rig,
r = 0.25/0.8/0.9/1.0, d = 10 and 100, no camera (object-space).)*

**Why not extend `nB`:** W-36d-d5-scout.md proved `nB` is small-integer-quantized below Density
~10 (d=2/3/4/5 round to the identical `N=8` and are bit-for-bit identical). This file's own fine
sweep shows the SAME plateau in the INTERIOR even at d=100, on real, unmutated code: `nB` is
literally flat at 55 across `r = 0.5..0.8`. A ratio-of-integer-counts bar sampled inside that
plateau cannot distinguish real code from a frozen defect. Ink stays continuous through that
plateau (measured on real code: 2308.10 -> 2308.95 -> 2309.50 mm across r=0.5/0.6/0.7 at d=100,
where nB cannot move at all) — this is the "ink- or budget-based quantity" the ledger row asks for.

**Which half of the dial's contract it gates:** the two kept bars gate the FULL-SPAN
magnitude/ordering (does the endpoint move enough; is 0.25 > 1.0 > 2.0). This bar gates the
dial's INTERIOR SHAPE — three consecutive steps, `r = 0.25 -> 0.8 -> 0.9 -> 1.0`, each required to
decline by a real, non-trivial amount (>= 2%), so neither a flat interior plateau nor a local
inversion inside an otherwise-passing endpoint check can hide.

**Why `r = 0.8` / `r = 0.9`, not this file's own `0.5`/`0.75` worked example:** measured
(standalone probe, same scratch export) that `r = 0.6` sometimes sits on the anti-saturation floor
(`crossFloorPitch`) rather than on the `crossPairShare` budget, and does not reliably move under
either review mutation (its mm value comes out identical with and without the mutation). `r = 0.8`
and `r = 0.9` reliably move under both mutations, and `0.8 -> 0.9` is exactly the step the review's
own mutations 3 and 5 erase.

## Band, measured (own standalone probe, real unmutated `e60d102e` source)

| d | 0.25→0.8 | 0.8→0.9 | 0.9→1.0 |
|---|---|---|---|
| 10 | 1.0868 (8.68%) | 1.0782 (7.82%) | 1.0592 (5.92%) |
| 100 | 1.0766 (7.66%) | 1.0571 (5.71%) | 1.1088 (10.88%) |

Floor picked at **1.02** (2%): comfortably below every measured real margin (5.71% is the
tightest) and comfortably above the mutated values (exactly 1.0, or inverted — see RED below).

**Drift envelope (secretary's "not a coin bar" condition):**
- Repeated 3x: bit-for-bit deterministic (`seed: 1`), zero drift.
- A second, unrelated camera (yaw 40 / pitch -15 / roll 8 / dist 750) and a perspective camera:
  the SIGN and rough magnitude of every step held (real code still declines at every step), but
  the absolute margins moved substantially with the camera (one perturbed-camera step at d=10
  measured only ~0.26% margin under a DIFFERENT camera than this file's fixture) — exactly the
  same fixture-specificity W-36d-review already found for `nB`'s own ratio. **This bar, like the
  two it sits beside, is scoped to this file's one fixed camera/primitive/mapper fixture and is
  NOT asserted as a general dial law across cameras.** Stated here rather than silently — the same
  discipline W-36d-review applied to the 1.2 constant.

## RED proof

Three scratch exports, `git -C .claude/worktrees/fill-audit-a4 archive e60d102e | tar -x -C
/private/tmp/claude-501/scratch-W-36e/{notch,concentrated,lowerhalf}`, `node_modules` symlinked
from main. No worktree file was ever edited for these proofs; all three scratch dirs deleted
after measurement.

1. **Review's own interior notch `[0.4, 0.9]`**, frozen to the real `r=0.7` value, applied to
   `crossPairShare`'s role-`'b'` branch:
   `if (role === 'b' && r >= 0.4 && r <= 0.9) return CROSS_FAMILY_BUDGET / 0.7;`
   Ran the full file: **14/15 pass, 1 fails — exactly the new INTERIOR-SHAPE guard**
   (`expected 1 to be greater than or equal to 1.02`, at d=10 first). `0.8 -> 0.9` collapses to
   EXACTLY `1.0` at both d=10 (337.0614/337.0614) and d=100 (2309.4972/2309.4972). All 14 other
   tests — including both existing dial bars — still PASS, reproducing the review's own finding
   that this mutation evades every bar in the file.
2. **Review's own concentrated defect `[0.6, 0.95]`**, frozen to the real `r=0.8` value
   (secretary's specific ask): same predicate shape, `0.8`. Same result: **14/15 pass, 1 fails**,
   `0.8 -> 0.9` again collapses to EXACTLY `1.0` at both densities.
3. **W-36d's own lower-half-freeze mutation** (`role === 'b' && r <= 1` compressed to
   `CROSS_FAMILY_BUDGET * (1 + 0.02*(1-r)/0.75)`), reproduced to confirm it still trips this new
   bar as required by the brief: **12/15 pass, 3 fail** — W-36d's own sub-bar (1.1429 < 1.2, as
   already known), the pinned per-family-budget fingerprint (22→20, the same disclosed side
   effect W-36d-review noted, not chased further here — outside this unit's scope), and the new
   INTERIOR-SHAPE guard, which fails MORE severely than a flat step: at d=10 both `0.8->0.9`
   (0.99893) and `0.9->1.0` (0.99902) are literally INVERTED (< 1) — ink rises as the ratio dial
   approaches 1.0, the wrong direction.

## GREEN

Ran the full file against the untouched worktree tree, foreground, `timeout: 600000`, 5.27s:
**15/15 pass (14 -> 15)**. The new test alone: 1101ms. Re-derived the band numbers above myself
this session (own standalone probe files, deleted afterward), not copied from any prior report.

## Pre-existing redness / lane baseline — confirmed unchanged

Ran both files named in the brief, foreground, in the actual worktree after committing:

- `tests/unit/scene3d-ribbon-f1b-streaks.test.js`: **44/44** — matches the brief's stated lane
  baseline at `e60d102e` exactly (this lane inherited F1-erode's fix; the file is fully green now,
  not the older 36/44 figure from earlier in the round).
- `tests/unit/scene3d-ribbon-wall-coverage.test.js`: **36/36** — matches the brief's stated
  baseline exactly.

Neither file was touched by this commit. No other guard named in the brief (`crosshatch-cell-
shape-b`, `mkdashramp-*`, `mktick-*`, ribbon-width bars) was touched or needed re-running — this
commit's diff is confined to one file with no reachable interaction with them.

## Bars changed

`tests/unit/scene3d-curved-density-floor.test.js:~421` — **NEW sub-bar ADDED** (no prior bar
existed at this location): `crossFamilyBInk` step ratio `>= 1.02` at `r = 0.25/0.8/0.9/1.0`, d=10
and d=100. Not a widened tolerance, not a re-pin, not a re-scoped population — a net-new check
added alongside the two kept full-span bars (W-36c's endpoint-ratio/monotonicity, W-36d's
magnitude sub-bar). No other bar in this file, or any other file, was touched.

## Commit

`a5d8a1be` in `.claude/worktrees/fill-audit-a4`, branch `3d-scene/fill-audit-a4`.
`git add tests/unit/scene3d-curved-density-floor.test.js` only (the project's graphify pre-commit
hook additionally staged its own generated `graphify-out` update, expected/excluded per CLAUDE.md).
Confirmed via `git show --stat` and post-commit `git status --short -- . ':!graphify-out'` (clean)
that the commit carries exactly one file. Not pushed.

## Open follow-ups

None from this unit's own scope. This closes the LEDGER row 4b follow-up. The three probe/scout
scratch test files used to derive the band and mutation proofs were never committed and are
deleted (`/private/tmp/claude-501/scratch-W-36e/*`); the worktree's own
`tests/unit/_scout-w36e-probe.test.js` scratch file (used to derive the band before committing)
was also deleted before commit and never staged.
