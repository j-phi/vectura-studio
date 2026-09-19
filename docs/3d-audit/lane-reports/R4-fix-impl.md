STATUS: DONE

# R4-fix — make merged main green after the round-4 fill-audit merge (TESTS ONLY)

Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/r4-fix`
Branch: `3d-scene/r4-fix`, off main `cf6b3c2f` (round-4 merge + docs, v1.4.3).
Files touched: `tests/unit/scene3d-mkdashramp-single-pass.test.js`,
`tests/unit/scene3d-mkdashramp-discrete.test.js`,
`tests/unit/scene3d-mktick-gap-fill.test.js`, `tests/unit/scene3d-mark-laws-draw.test.js`.
**No `src/` file touched.**

## The four reds, cause, and fix

### 1a/2a — T4b's own fixture ink, `toBeCloseTo(1501.0636578167772, 3)` — GENUINE cross-lane, re-pinned

Both `scene3d-mkdashramp-single-pass.test.js` and `scene3d-mkdashramp-discrete.test.js` pin the
`engine.addLayer('scene3d')` insert-pipeline ink for sphere/hatch/mkDashRamp/d=220
(`group.scenePaths`, fill+edge summed together, T4b's own convention). The literal
`1501.0636578167772` was measured before W-32 Rank 4 (`3d-scene/border-4`) landed a
silhouette/boundary edge refinement in `scene3d.js`; `scenePaths` sums fill AND edge ink, so the
refined silhouette legitimately adds ink here.

**Cause confirmed by my own measurement** (not merely cited from another report): a scratch script
driving the identical `engine.addLayer` fixture through `loadVecturaRuntime`, toggling
`window.__SIL_PROTO_OFF` (the refinement's own test-only kill flag, `scene3d.js:722`):

| condition | ink (mm) |
|---|---|
| shipped (refinement ON) | 1501.2671242469714 |
| `__SIL_PROTO_OFF = true` (refinement OFF) | 1501.063657816772 |
| delta | 0.20346643019934163 |

This reproduces `MERGE-review-r4.md`'s independently-bisected number
(`1501.2671242469714`, delta `0.2034664301943394`) to 13 significant digits, and confirms the OLD
pinned value is exactly the pre-W-32r4 number. T3b/T3c contribute NONE of the shift — `bandOnsetCap`
is a no-op at d=220 by construction. Additionally proved in-file: built a "T3b/T3c-neutralized"
mutant (current disk source with all three `bandOnsetCap(opts.fillDensity)` call sites redirected to
the constant `MK_BAND_MAX_PASSES`, reverting T3b's onset ramp and T3c's dash-length gate while
leaving T2-6's mkTick comb and W-32r4's edge refinement intact) and re-measured the SAME fixture
through it: ink unchanged from the shipped value (`toBeCloseTo(ink, 6)`), so the whole 0.2035mm move
is W-32r4's alone.

**Fix**: re-pinned both files' `toBeCloseTo` target to `1501.2671242469714` (the merged tree's own
value — since T3b/T3c are no-ops at d=220, "pre-T3b/pre-T3c on the merged tree" and "shipped" are the
SAME number), with the cause documented inline and a new assertion proving the neutralized-mutant
ink is unchanged. `toBeGreaterThan(1400)` (T4b's own floor) is untouched.

### 1b/2b — mkTick "is unaffected" byte-identity sweep — GENUINE cause (T2-6), NOT a literal re-pin

Both files' byte-identity sweep computes `cur`/`mut` LIVE each run (no literal to re-pin) — `cur`
from the current disk source, `mut` from a fixed base-sha mutant (`b43fa4e3` for T3b,
`75777240` for T3c). Both base shas predate T2-6 (a later, unrelated unit on the SAME
`fill-audit-a4` lane) which added a graded-comb mechanism to `mkTick` — so `cur` (T2-6 present) and
`mut` (T2-6 absent) necessarily disagree for `mkTick`, regardless of T3b/T3c's own health.

**Fix**: for the `mkTick` roster entry only, compare `cur` against a NEW mutant built from the
CURRENT disk source with only that unit's own contribution reverted (single-pass file: all three
`bandOnsetCap(opts.fillDensity)` call sites -> `MK_BAND_MAX_PASSES`; discrete file: the `eachDrawn`
gate -> `const eachDrawn = each;`), leaving T2-6's mkTick comb intact. This correctly isolates "does
T3b/T3c leak into mkTick" from T2-6's legitimate, disclosed, unrelated change. The other three roster
members (`mkDotScreen`, `mkScribble`, `ladder`) are unaffected by T2-6 and keep comparing against the
original base-sha mutant. Per `T2-6-impl.md` §4's own disclosure and the reviewer's independent
bisection in `MERGE-review-r4.md` §2 item 2, no scratch revert of T2-5/T2-6's own tick code was
required to state this cause — done anyway as belt-and-suspenders via the neutralized-mutant
construction, which is stronger proof than citation alone.

### 3 — `scene3d-mktick-gap-fill.test.js`'s "SEMANTIC PRE reconstruction proof" — vacuous/environment-dependent leg, replaced (W-38b pattern)

This test rendered `PRE_TICK_BLOCK` spliced onto the CURRENT `surface-fill.js` and compared it,
byte-for-byte, against rendering a `git archive 75777240` export of the WHOLE TREE. Both runtimes
load `scene3d.js` from disk unmodified — one from the CURRENT tree (W-32r4's edge refinement
present), one from the `75777240` archive (absent). The premise only held while `scene3d.js` was
unchanged between the compared trees; once W-32r4 landed, it broke — the same vacuous/
environment-dependent leg class W-38b already fixed once (`scene3d-facet-min-rulings.test.js`,
comparing against a live `git show HEAD:`).

**Fix**: replaced the live-archive comparison with a PINNED GOLDEN fingerprint
(`EXPECTED_PRE_SIGNATURE`, `pathSignature` precision-4 sha256, the same convention
`scene3d-facet-min-rulings.test.js`/`scene3d-mktick-wedge.test.js` already use) of
`PRE_TICK_BLOCK`'s own rendering on THIS tree, recorded once per cell x rig (12 entries). Proven
non-vacuous by a CONTRAST MUTATION test: the SHIPPED tree (T2-6's comb wired, no override) must
diverge from all twelve golden fingerprints — confirmed (`divergent.length === 12`), matching
`T2-6-impl.md`'s own disclosed roster sweep ("12 of 1184 changed, every single one mkTick" — these
twelve cells ARE that set). The static code-identity leg (comments-stripped `PRE_TICK_BLOCK` vs the
real `git archive 75777240` source) is UNCHANGED and still independently proves `PRE_TICK_BLOCK` is a
faithful reconstruction. The other 43 tests in the file are untouched (file now has 45 tests: the one
removed test replaced by two).

### 4 — `scene3d-mark-laws-draw.test.js` O1 sagitta, `0.09795 < 0.10` — measured shortfall, bar re-derived DOWN with margin

Measured directly on the merged tree: median `0.09794838126911516`mm, reproducing `T2-6-impl.md`
§6's own disclosed 0.09795/2.05%-miss figure and `MERGE-review-r4.md`'s independent bisection (same
value, isolated to `fill-audit-a4` alone) to full precision. O1 measures ONE thing — whether a tick
walked across a curved surface actually follows that surface's curvature (T1's original claim), via
the sagitta of the longest third of drawn chords. T2-6 (which landed AFTER this bar was pinned, and
could not touch this file — forbidden in its own ALLOWED-file list) shortens ticks in exactly that
population: a previously-long, real-curvature-sagitta tick can split into shorter sub-ticks, some of
which fall to a 2-point (zero-sagitta) walk and drop out of the population, pulling the top-third
median down. `T2-6-impl.md` names this explicitly as "inherent to 'gradually shortening ticks', not a
bug." No other literal in this file moves.

**Fix**: bar re-derived `0.10 -> 0.09` — a measured-minimal value with real margin (8.1%) below the
current measurement, not a knife-edge re-pin to the observed number.

## `## Bars changed`

- `tests/unit/scene3d-mkdashramp-single-pass.test.js:~383` — `toBeCloseTo(1501.0636578167772, 3)` ->
  `toBeCloseTo(1501.2671242469714, 3)` — W-32 Rank 4's silhouette/boundary edge refinement (landed
  after T4b's baseline was measured) legitimately adds ~0.2035mm to this fixture's summed fill+edge
  ink; confirmed by direct measurement (`window.__SIL_PROTO_OFF` toggle) and by a T3b/T3c-neutralized
  mutant showing zero contribution from this unit's own mechanism. `toBeGreaterThan(1400)` unchanged.
- `tests/unit/scene3d-mkdashramp-discrete.test.js:~361` — same change, same cause, same proof,
  independently re-measured on this file's own fixture.
- `tests/unit/scene3d-mkdashramp-single-pass.test.js` — byte-identity sweep: the `mkTick` roster
  entry's comparison baseline changed from `mutantAlgo` (`b43fa4e3`-sha mutant) to a new
  `neutralAlgo` (current tree, T3b/T3c's own `bandOnsetCap` calls redirected to
  `MK_BAND_MAX_PASSES`) — a POPULATION/FIXTURE change to an existing assertion (standing rule 6),
  disclosed: the comparison now isolates "does T3b/T3c leak into mkTick" from T2-6's unrelated,
  legitimate mkTick change on the same lane, which the old `b43fa4e3` baseline could not do since it
  predates T2-6. The other three roster entries (`mkDotScreen`, `mkScribble`, `ladder`) are unchanged.
- `tests/unit/scene3d-mkdashramp-discrete.test.js` — same change, `mkTick` entry only, baseline
  reverts ONLY T3c's own `eachDrawn` gate (T3b's onset ramp and T2-6's comb left intact).
- `tests/unit/scene3d-mktick-gap-fill.test.js:~379` (was the "SEMANTIC PRE reconstruction proof"
  test) — replaced a live `git archive 75777240`-vs-current-tree comparison with a pinned
  `EXPECTED_PRE_SIGNATURE` golden (12 entries, `pathSignature` precision 4) plus a new contrast-
  mutation test proving non-vacuity. Cause: the git-archive comparison's premise (only `surface-fill.js`
  differs between the compared trees) broke once W-32r4 changed `scene3d.js` too — same
  vacuous/environment-dependent leg class as W-38b. The file's other 43 tests are untouched; net test
  count in the file rises 44 -> 45 (one test replaced by two).
- `tests/unit/scene3d-mark-laws-draw.test.js:~224` — `expect(median).toBeGreaterThanOrEqual(0.10)` ->
  `toBeGreaterThanOrEqual(0.09)` — DOWN. Cause: T2-6's graded comb (a later, unrelated unit, forbidden
  from touching this file) shortens ticks in exactly the population O1 samples (longest third by
  drawn chord length), per `T2-6-impl.md` §6's own disclosure, reproduced here by direct measurement
  (0.09794838126911516). New bar retains 8.1% margin below the measured value.

No tolerance was widened upward and no population was narrowed to hide a regression — every change
above either re-derives a control against the correct (post-merge, or unit-isolated) baseline, or
moves a bar down with a fully measured, cited, disclosed cause and real margin.

## Suite counts (full, foreground, one file/batch per command, `timeout: 600000`)

`npm run test:unit` was run as: 6 alphabetical batches of the 429 top-level `tests/unit/*.test.js`
files (excluding the Tier-1 collapse file), the Tier-1 `scene3d-tone-law-collapse.test.js` alone with
`--pool=forks --poolOptions.forks.singleFork=true` (backgrounded by the tool at the 600s ceiling per
`ROUND3-RESUME-BRIEFS.md` §0b's documented amendment, read from the completion notification — not a
deviation), and a final batch covering 54 nested files (`tests/unit/{components,menus,modals,overlays,
render,skin}/*.test.js`) that a non-recursive `ls tests/unit/*.test.js` glob had missed on the first
pass (caught by reconciling my own running total against `MERGE-review-r4.md`'s baseline before
declaring done).

| suite | files | tests | result |
|---|---|---|---|
| unit | 483 | 6174 passed + 44 skipped = 6218 | **0 failed**, exit clean (only benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC noise and one fully-skipped file, both pre-existing/documented) |
| integration | 236 | 1998 passed = 1998 | **0 failed** — exact match to `MERGE-review-r4.md`'s baseline |
| visual | 6 | 99 passed + 13 skipped = 112 | **0 failed** — exact match to baseline |
| perf | 5 | 10 passed = 10 | **0 failed** — exact match to baseline |

Reconciliation against `MERGE-review-r4.md`'s own measured unit baseline (6167 passed + 6 failed + 44
skipped = 6217): all six previously-failing tests now pass (6167+6 = 6173 passed), plus one net new
test (`scene3d-mktick-gap-fill.test.js`'s replaced test became two) = 6174 passed + 44 skipped = 6218.
Matches exactly.

## Pre-existing red

None. All four originally-red files are now green and no other file went red as a side effect —
confirmed by the full four-suite run above landing at the exact expected totals, not merely "no new
failures observed."

## Commit

One commit on `3d-scene/r4-fix`, `git add` of the four test files only (no `src/`, no docs). Message
names R4-fix and the four causes. Never pushed.

REPORT docs/3d-audit/lane-reports/R4-fix-impl.md — DONE — 4/4 causes measured+fixed; unit 6174+44sk/6218, integration 1998/1998, visual 99+13sk/112, perf 10/10, all 0 failed.
