STATUS: DONE

# W-36d — implementer report (TESTS ONLY)

Lane: fill-audit-a3. Worktree: `.claude/worktrees/fill-audit-a3`. Base sha:
`cd541f87` (F1-placement verified, adopted as read). New sha: `dcc91872`.

Files touched: exactly one — `tests/unit/scene3d-curved-density-floor.test.js`
(+32 lines, one new `test(...)` block plus its comment). No other test file,
no `src/` file, touched or edited. No helper file was needed.

## Scope (LEDGER row 4a, verbatim in effect)

Re-add a bounded LOWER-HALF magnitude sub-check on the crosshatch dial at the
review's measured-minimal value — `nB(0.25) >= 1.2 x nB(1.0)` — ALONGSIDE the
kept monotonicity check (not replacing it), in the test file W-36c's dial bar
lives in: `tests/unit/scene3d-curved-density-floor.test.js`, in the
`describe('BYTE-IDENTITY GUARD — every existing d<=100 curved caller is
unchanged')` block, immediately after the existing
`"crosshatch mapper: crossing family's own count spans >=2.0x ..."` test
(around line 314 pre-edit / line ~329 post-edit).

## What the bar measures (asked and answered, per the brief)

`crossFamilyBCount(d, ratio)` (a helper already in this file, unmodified)
drives `SurfaceFill.buildObject` directly and counts the DISTINCT
`lineIndex` values on family B's own fam id (the second, "A#1" crossing
family) for `mapper: 'crosshatch'` at a given `fillDensity` (`d`) and
`crossDensityRatio` (`ratio`) — i.e. it measures **how many rulings the
crossing family itself draws**, isolated from family A and from the
`fillCount` TOTAL the rest of the file uses. The new sub-check asks: at a
fixed Density, does turning `crossDensityRatio` from 1.0 down to 0.25 (denser)
grow family B's own ruling count by at least 1.2x? It is a magnitude check on
one specific half of the dial (`[0.25, 1.0]`), not a full-span or ordering
check — that gap is exactly what the kept monotonicity/endpoint-ratio test
(from W-36c) does NOT cover, per the review.

## RED proof

Scratch export: `git -C .claude/worktrees/fill-audit-a3 archive cd541f87 |
tar -x -C /private/tmp/claude-501/scratch-W-36d`, `node_modules` symlinked
back to the worktree's own. No worktree file was ever edited for this proof;
scratch dir deleted afterward.

Added the new sub-check to the scratch copy's test file, then applied the
review's own "lower-half-freeze" mutation directly to the scratch copy's
`src/core/scene3d/surface-fill.js` `crossPairShare`:

```js
const crossPairShare = (crossRatio, role) => {
  const r = clamp(finite(crossRatio, 1), 0.25, 2);
  // freeze the dial's lower half [0.25, 1] to a 2%-slope near-constant for
  // family B, leaving ratio > 1 unchanged
  if (role === 'b' && r <= 1) return CROSS_FAMILY_BUDGET * (1 + 0.02 * (1 - r) / 0.75);
  return (role === 'b') ? CROSS_FAMILY_BUDGET / r : CROSS_FAMILY_BUDGET;
};
```

Ran `npx vitest run tests/unit/scene3d-curved-density-floor.test.js -t
"crossing family|lower-half magnitude"` (foreground, `timeout: 600000`,
finished in 2.63s — well under budget) against the mutated scratch tree:

- **The KEPT test (endpoint ratio + strict monotonicity) still PASSES**
  under the mutation: nB = 8/7/4 (d=10), 55/47/24 (d=100) — endpoint ratios
  2.0 and 2.29, strict monotonicity holds both densities.
- **The NEW sub-check FAILS**: `d10Dense/d10Even` = 8/7 = **1.1429** and
  `d100Dense/d100Even` = 55/47 = **1.1702**, both under the 1.2 floor —
  `AssertionError: expected 1.1428571428571428 to be greater than or equal
  to 1.2`.

This is the exact gap the review demonstrated: a real, user-visible defect
(the lower half of the dial nearly inert) passes both surviving W-36c bars
and is caught only by the restored sub-check.

## GREEN — re-derived on the untouched tree, not copied

Ran the same file (all 14 tests) against the untouched worktree source
(`cd541f87`), foreground, `timeout: 600000`, 4.26s: **14/14 pass**. The new
sub-check's own measured values, re-derived fresh this session (temporary
`console.log` used only during scratch measurement, removed from the
committed test):

| | nB(0.25) | nB(1.0) | ratio |
|---|---|---|---|
| d=10 | 9 | 7 | **1.2857** |
| d=100 | 61 | 47 | **1.2979** |

Both comfortably clear the 1.2 floor (7.1% / 8.2% headroom) and independently
match the review's disclosed 1.286/1.298 to the same precision — confirmed by
running it myself this session, not reused from the review's report. Not a
coin bar: it sits strictly between the mutation's 1.143/1.170 (which must
fail) and the shipped mechanism's 1.286/1.298 (which must pass).

## Pre-existing redness — confirmed unchanged

Ran both files named in the brief, foreground, in the actual worktree after
committing:

- `tests/unit/scene3d-ribbon-f1b-streaks.test.js`: **36/44** (8 failing) —
  unchanged, matches the pre-recorded pre-existing count owned by F1-erode.
- `tests/unit/scene3d-ribbon-wall-coverage.test.js`: **35/36** (1 failing) —
  unchanged, matches the pre-recorded count.

Neither file was touched by this commit.

## Bars changed

`tests/unit/scene3d-curved-density-floor.test.js:~329` — **NEW sub-bar
added** (no prior bar existed at this location — the old `nB(0.25) >=
2.0x nB(1)` sub-check this restores was already removed by W-36c, not by
this unit) — `nB(0.25) >= 1.2 x nB(1.0)` at d=10 and d=100. Not a widened
tolerance, not a re-pin of an existing fingerprint: a net-new check added
alongside the kept monotonicity test, per the review's own recommended
value. No other bar in this file, or any other file, was touched.

## Commit

`dcc91872` in `.claude/worktrees/fill-audit-a3`, branch `3d-scene/fill-audit-a3`.
`git add tests/unit/scene3d-curved-density-floor.test.js` only (the
project's graphify pre-commit hook additionally staged its own generated
`graphify-out` update, which is expected/allowed per CLAUDE.md — `graphify-out`
is generated and excluded from routine diff review). Not pushed.

## Open follow-ups

None from this unit's own scope. The two disclosed W-36c follow-ups this
unit does NOT address (`dfMaxMul` comment range correction; M3/M4 direct
re-run) remain open per `W-36c-review.md` and are out of scope for W-36d.
