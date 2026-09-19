STATUS: DONE

# W-32r4b — repair the `scene3d-fill-boundary-ends` off-mask blind leg (implementer report)

**Lane:** border-4 (TESTS ONLY) · **Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/border-4`
**Branch:** `3d-scene/border-4` · **Base sha:** `76a77f22` (W-32r4 landed, v1.4.2)
**File touched:** `tests/unit/scene3d-fill-boundary-ends.test.js` — **the only file changed** (`git status --short -- . ':!graphify-out'` confirms).

## Decision: REPAIR, not retire — with an honest correction to the brief's own hypothesis

The brief (LEDGER row 4a, `W-32r4-plan.md` §1.6) named `scene3d-fill-boundary-ends`'s off-mask
scoring bug (`depth()` returning `0.00` — "the best possible value" — for any point outside the
chart-derived visible-surface mask, at `:205-210` on `b43fa4e3`) and asked me to either repair it
(scoring off-mask points as overshoot against the analytic silhouette) so the leg goes RED at
`b43fa4e3` (expected 0.52-0.72 pen) and GREEN at `76a77f22`, or retire it if that would exactly
duplicate `scene3d-fill-silhouette-overshoot.test.js`.

**I measured before implementing, and the brief's own numeric hypothesis does not hold for the
reason it expected — but a repair is still real and necessary, just via a different mechanism than
"fix the off-mask branch and feed it the same data."**

### What I measured first (both scratch `b43fa4e3` and the `76a77f22` worktree)

Built the app-default `ellipsoid·hatch` scene (this file's own fixture) and asked: how many FILL
endpoints and how many drawn-BORDER (silhouette-class `sceneEdge`) *vertices* ever land off this
file's chart-derived mask?

| quantity, `b43fa4e3` (pre-W-32r4) | off-mask / total |
|---|---|
| FILL endpoints | 0 / 202 |
| BORDER vertices | 0 / 204 |

**Zero, in both cases, on the plan's own worst cell.** The reason is structural, not incidental: a
mesh silhouette *vertex* is itself a chart sample (it lies exactly on the analytic surface), and the
chord between two such vertices — being a straight line between two points on a convex curve — never
crosses **outside** that curve. The off-mask branch cannot fire for W-32's defect in either
direction, on either tree. This confirms, independently, W-32r4-plan.md's own **reason 1** ("its
reference is the CHART, not the drawn border — the mask... cannot see a gap between the chart and
the polygon drawn beside it") as the *sufficient* explanation; reason 2 (off-mask scoring) is a real,
separate, independently-worth-fixing latent flaw, but it was never the mechanism that hid this
specific defect. I could not honestly produce a RED at "0.52-0.72 pen" by patching the off-mask
branch alone and feeding it the same fill/border-vertex data — that data never leaves the mask.

### The repair that IS real, using this file's own instrument

A mesh chord's **midpoint** (not its vertices) sags measurably **inward** from the true curve between
sagitta — an on-mask undershoot, not an off-mask case, but one this file never checked because it only
ever fed FILL data through `depth()`, never BORDER data. Measured on the SAME fixture, using the
existing `depth()`/BFS instrument unmodified:

| primitive (silhouette-class chords only) | `b43fa4e3` worst mid-chord depth | `76a77f22` worst mid-chord depth |
|---|---|---|
| ellipsoid | 0.3500 mm (1.167 pen) | 0.0000 mm |
| sphere | 0.3500 mm (1.167 pen) | 0.0000 mm |
| cone | 0.3500 mm (1.167 pen) | 0.0000 mm |
| capsule | 0.3500 mm (1.167 pen) | 0.0000 mm |
| cylinder | 0.0000 mm | 0.0000 mm |

(0.35 mm = exactly one `CELL` — this file's 0.35 mm raster cannot resolve the true sagitta any finer
than one cell, so it reads as a step function; the true value is the plan's own exact 0.52-0.72 pen
hull measurement, which this coarse raster echoes but does not reproduce to the digit. Cylinder's
silhouette is two straight vertical lines at this camera — zero curvature, so genuinely nothing to
detect; matches it having the smallest defect in the plan's own table, 0.07-0.12 pen.)

**This IS a real repair of the leg's blindness** — it makes a coverage gap this file genuinely had
(it never looked at border ink) visible using its own existing reference and technique, without
duplicating `scene3d-fill-silhouette-overshoot.test.js`'s O1/O2 (an exact convex-hull-vs-drawn-outline
measurement, 0.0037 mm residual, a different technique entirely). I also implemented the literal ask
(part 2, below) as a defensive fix, disclosed as not being what closes this specific gap.

## What shipped — two parts, both in `tests/unit/scene3d-fill-boundary-ends.test.js`

1. **`maskFor()` gains `overshoot(x, y)`** — a second BFS distance transform (`Dout`), seeded from
   the same boundary cells as the existing `D` transform but propagated through OFF-mask cells only,
   so an off-mask point now reports its real outward distance instead of falling through to `0`. Points
   beyond the padded raster entirely are clamped to the nearest edge cell plus the clamp distance, so
   even a wildly-outside point reports a real magnitude. This is the literal repair the brief named,
   shipped as a generic, defensive fix — proven with a synthetic off-mask coordinate (mutation-proof
   below), not with W-32's own historical data (which the measurement above shows cannot exercise it).
2. **New `describe('W-32r4b — repair...')` block** (5 tests) at the end of the file:
   - `test.each` over the 5 primitives W-32r4 actually refines (capsule, cone, cylinder, sphere,
     ellipsoid — torus excluded, FU-1, unchanged): no silhouette-edge chord midpoint sags more than
     0.20 mm inside the chart mask (a **new**, separate bar — `TOL_MM` untouched).
   - **MUTATION PROOF** (blocking, binding rule 1): reuses W-32r4's own shipped test-only flag
     `runtime.window.__SIL_PROTO_OFF` (no new flag invented) to toggle the fix off/on inside the
     *current* (patched) tree — reproduces the scratch-`git archive` RED to the ten-thousandth of a
     millimetre. Covers all 4 primitives the bar actually gates.
   - **DOCUMENTED PROOF**: the "0/202, 0/204 off-mask" finding above, made executable — asserts
     worst off-mask magnitude across fill+border points stays at or below one raster cell (noise
     floor), never approaching W-32's 0.15 mm bar. This is *why* part 1 (chord midpoints) was
     necessary rather than optional.
   - **REPAIR proof**: `overshoot()` itself, tested directly — a point 10 mm off a 50 mm sphere's
     silhouette reports a real magnitude (not 0); a point deep inside reports exactly 0; a point
     1000 mm away (off the padded raster) still reports a large real magnitude via the clamp path.

The existing 41 `test.each(CASES)` tests and every other test in the file are **untouched** — same
function (`depth()`), same behaviour, same bar (`TOL_MM = 1.0`). They still gate the file's original
half of the complaint (a ruling stopping short, INSIDE open front-facing surface), across all 9
primitives including the non-convex/faceted ones the hull-based sibling file cannot reach. That half
was never blind and needed no repair.

## RED / GREEN, both independently reproduced

- **`76a77f22` (patched, current worktree): 49/49 green** — the original 44 tests (41 CASES + 3
  standalone) plus all 5 new W-32r4b tests. `npx vitest run tests/unit/scene3d-fill-boundary-ends.test.js
  --pool=forks --poolOptions.forks.singleFork=true`, 50.7s.
- **`b43fa4e3` (scratch `git archive`, `/private/tmp/claude-501/scratch-W32r4b-red`, `node_modules`
  symlinked from the MAIN repo root — the worktree's own `node_modules` is nearly empty and resolves
  via directory walk-up when nested inside the repo, which a `/private/tmp` scratch dir is not):
  **44/49 — 5 failed, exactly the 4 primitive cases (capsule/cone/sphere/ellipsoid) plus the
  MUTATION PROOF test**, all failing with `expected 0.35 to be less than or equal to 0.2`. Cylinder
  and every pre-existing test passed unchanged.

## Bars changed

One **new** bar, disclosed per binding rule 6 (a new bar in an existing file, not a widened one):

- `tests/unit/scene3d-fill-boundary-ends.test.js` (new `describe` block) — **new**
  `SIL_SAGITTA_BAR_MM = 0.20` mm. Gates silhouette-edge chord-midpoint sagitta for
  capsule/cone/sphere/ellipsoid (cylinder measured at 0.00 on both trees — no signal to gate at this
  raster's resolution, disclosed above). Chosen to sit clear of both measured values (0.00 mm
  post-fix, 0.35 mm pre-fix, itself the raster's one-cell resolution floor).

`TOL_MM = 1.0` and `CELL = 0.35` (the file's existing bar/raster) are **unchanged** — no widening, no
narrowing, per the brief's explicit instruction.

## Which half of the file's coverage this leaves as-is, stated per binding rule 1

- **Undershoot into open front-facing surface** (a ruling stopping short, inside the surface) — the
  original 41 CASES, `TOL_MM = 1.0`, all 9 primitives. **Unaffected, unedited in behaviour.**
- **Drawn-border sagging inward from the true chart** (this unit's repair) — silhouette-edge chord
  midpoints, `SIL_SAGITTA_BAR_MM = 0.20`, 4 of 5 rank4-fixed primitives (cylinder has no detectable
  signal at this raster's resolution — disclosed, not silently dropped).
- **Overshoot past the DRAWN outline** (W-32's own complaint, the precise quantity) — still
  `scene3d-fill-silhouette-overshoot.test.js`'s O1/O2 job, exact convex-hull technique, unduplicated.
- **Generic off-mask magnitude** (any point outside the mask, any cause) — `overshoot()`, new,
  defensive, mutation-proven with synthetic data.

## Spot-checks (light VERIFY pass, per ROUND3-RESUME-BRIEFS §0a)

- `scene3d-hlr-spatial-index-identity.test.js` + `scene3d-hlr.test.js`: **17/17**, unaffected.
- `scene3d-fill-silhouette-overshoot.test.js` (the sibling O1-O5 file): run to completion,
  unaffected — see run log below (this file was not touched).
- `git status --short -- . ':!graphify-out'`: only `tests/unit/scene3d-fill-boundary-ends.test.js`
  modified.

## Stop conditions checked

1. `TOL_MM` or `CELL` touched — NO.
2. Torus un-gated or silently included in the new sweep — NO (excluded, named, FU-1 stands).
3. New bar undisclosed — NO (`## Bars changed` above).
4. RED forced by editing in-worktree rather than scratch `git archive` — NO (`b43fa4e3` scratch
   export, `node_modules` symlinked from MAIN root).
5. Mutation proof missing for the kept bar — NO (both the sagitta bar and the `overshoot()` repair
   have executable mutation/synthetic proofs in the shipped file).
6. Numeric expectation in the brief (0.52-0.72 pen) forced onto a measurement that doesn't produce
   it — NOT DONE; measured, found not to reproduce via the literal off-mask-branch route, reported
   honestly, and repaired via the mechanism that does work (chord midpoints), per "stop-and-report
   beats a fudge."
