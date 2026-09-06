STATUS: MEASURED — A3 (amended) oracle split landed; F1 STAYS OPEN, not closed by this unit.

# A3 — implementer report: split the F1B ring-coverage oracle (pen-unreachable vs true streak)

**Lane** `handoff-c`. **Worktree** `.claude/worktrees/handoff-c`, branch `3d-scene/handoff-c`.
**Base sha** `79c98ca87b4e44cba6876c8c008b5bbeac7af9b5` (package.json `1.3.98`, worktree was
clean at start — verified `git status --short -- . ':!graphify-out'` empty and `git stash
list` showed only unrelated other-worktree entries).

## What this unit was

Read in order: `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`, `A3-judge.md` (the binding
amended brief, STATUS AMEND-PLAN), `A3-plan.md` (the underlying measurements — 0 dropped
geometry, 89–98% of `ringNotInkMm2` pen-unreachable), and `docs/3d-audit/STILL-OPEN.md`'s
Unit A / A2 / A3 bullets. The judge's verdict: the plan's *measurement* is correct and
independently reproduced; its *closure* is not — the entire residue (reachable and
unreachable together) is a scatter of sub-mm clusters with no band anywhere in it, so
`ringNotInkMm2` was never the user's F1 streak. I implemented exactly the judge's §5
"AMENDED UNIT BRIEF" (items A1/A2/A3/A4), not the original plan's closure.

## Files touched (worktree, allow-listed by both the plan and the judge)

- `tests/helpers/scene3d-ring-coverage.js` — additive only.
- `tests/unit/scene3d-ribbon-f1b-streaks.test.js` — re-pinned assertions + rewritten header.
- `tests/unit/scene3d-ring-coverage-reachability.test.js` — new.

No `surface-fill.js`, `ribbon-geometry.js`, `pen-fill.js`, `fill-boolean.js` or
`geometry-utils.js` change. Nothing under any other lane's serialization list was touched.

## What changed in the helper (`tests/helpers/scene3d-ring-coverage.js`)

Refactored the grid/ink/exclusion rasterization into `buildCoverageGrid` (byte-identical
arithmetic to the old inline version — verified against three sibling consumers, see
below) and added, purely additively:

- `DEFAULT_REACHABILITY_LATTICE_DIVISOR = 12` (pinned constant, per the judge's A1).
- `classifyReachabilityAtDivisor(grid, penWidth, latticeDivisor)` — the judge's verbatim
  predicate: a cell owned by clip group `g` (first-match, the same group that made it
  count as "ring") is reachable iff some point `p` inside `g`'s rings, with
  `dist(p, boundary) >= penWidth/2` and `|(cell) - p| <= penWidth/2`, exists on a lattice
  bounded to the disk `|(cell)-p| <= penWidth/2` at step `penWidth/latticeDivisor`.
- `findUncoveredClusters(grid)` — 8-connected flood fill over uncovered cells, reporting
  each cluster's bounding-box `lengthMm` (long axis) / `crossWidthMm` (short axis).
- `measureRingFillRate` now additionally returns `ringNotInkReachableMm2`,
  `ringUnreachableMm2`, `uncoveredClusters`, `reachableCellCount`, `unreachableCellCount`,
  and `grid` (for cheap re-classification at another lattice resolution). The four
  original fields (`ringFillRate`, `ringAreaMm2`, `ringNotInkMm2`, `selfOccludedAreaMm2`)
  are computed by the exact same code path as before — verified byte-identical below.

## Byte-identity guard (the three sibling consumers)

Ran each targeted, alone, before touching the F1B test file:

```
scene3d-ribbon-c3-rule5.test.js          6/6   (unchanged)
scene3d-ribbon-outline-fill-seam.test.js 4/4   (unchanged)
scene3d-ribbon-wall-coverage.test.js     36/36 (unchanged, same live "union failed on
                                          degenerate geometry" stderr as before — pre-existing,
                                          not a new regression)
```

All three only assert `ringFillRate >= 0.995` and destructure a subset of fields; none
moved.

## `scene3d-ribbon-f1b-streaks.test.js` — what was re-pinned

The 5 intentionally-RED `ringNotInkMm2 <= 0.18 mm²` assertions are RETIRED (not deleted —
the header explains why, with the exact numbers). Replaced with, per law (interlockWeave /
onePenDown / trochoidLoop / ampSpacing / weaveDepth):

1. **Anti-explosion guard** — `ringNotInkMm2 < 3` (raw number, unchanged computation).
2. **Reachable-area diagnostic** — `0 <= ringNotInkReachableMm2 < 1.0`, NOT the pass bar,
   with the honest value in the assertion message (e.g.
   `"interlockWeave: ringNotInkReachableMm2=0.1519 ringUnreachableMm2=1.9069 (raw
   ringNotInkMm2=2.0587, historical band was <= 0.18)"`).
3. **Anti-vacuity** — `ringUnreachableMm2 > 0` (the split must actually exclude something).
4. **Lattice sensitivity** — `classifyReachabilityAtDivisor` at divisor 12 vs 24 (halving
   the step) must move the reachable-cell count by `<= 1` cell. Measured delta was **0**
   for all five laws on this tree.
5. **Cluster-shape oracle** (all five laws + both controls, `taperedEnds`/
   `weightSmoothstep`) — no uncovered cluster with `lengthMm > 1.2`, and none with
   `crossWidthMm > 0.30 AND lengthMm > 1.0` (a genuine streak needs both). Today's worst
   passes both bars with room; see numbers below.

Total: **44/44 pass** (33.0–33.5s, within the plan's ~35s budget for this file).

## `scene3d-ring-coverage-reachability.test.js` — the honesty proofs (new, 7/7 pass, ~10s)

1. **Synthetic-void RED/GREEN** (the real RGR pivot for this unit). Torus, `interlockWeave`,
   `PenFill.fillRegion` wrapped to drop every second path returned across the whole build
   (19 paths dropped on this run). Asserts `ringNotInkReachableMm2 > 1.0`. **RED proof**: I
   temporarily patched `classifyReachabilityAtDivisor` (env-gated,
   `VECTURA_A3_BROKEN_CLASSIFIER_PROBE=1`, applied then fully reverted — never committed,
   not present in the final diff) to call every uncovered cell "unreachable" regardless of
   geometry. Under that probe the test failed:
   `ringNotInkReachableMm2=0.0000 ... expected 0 to be greater than 1` — proving a
   classifier that could hide a dropped ruling behind "unreachable" would pass silently
   without this test. **GREEN**: with the real predicate, the same dropped-ruling build
   measures the reachable residue far above the 1.0 bar (undropped baseline on this exact
   law/fixture is ~0.15 mm²).
2. **Derived-not-tuned proof.** Pure geometry (no scene): a 3mm square (four 90° corners)
   and a 3mm equilateral triangle (three 60° corners), `penWidth=0.3`. Measured the
   reachable/unreachable boundary along each corner's bisector and compared to the closed
   form `r(csc(θ/2)-1)`: 90° → expected 0.0621mm, measured within one coverage cell
   (`penWidth/4 * 1.5` tolerance); 60° → expected 0.1500mm, same tolerance. Both pass.
3. **D3 — documented known blind spot.** A 20 × 0.28mm blank sliver (narrower than one pen)
   scores `reachableCount === 0` — recorded on the record per the judge's instruction, not
   asserted as a bug.
4. **Control invariance.** `taperedEnds` (F1B's own control) plus `nibAngle` and
   `weightModulated` (two clean laws from `scene3d-ribbon-wall-coverage.test.js`'s fixture)
   keep `ringFillRate >= 0.995` and `ringNotInkReachableMm2 <= 0.18`.

## Guard tests re-run (targeted, one file at a time, per the plan's §9 list)

```
scene3d-ribbon-f1b-streaks.test.js            44/44
scene3d-ring-coverage-reachability.test.js      7/7  (new)
scene3d-ribbon-wall-coverage.test.js          36/36  (unmoved)
scene3d-ribbon-outline-fill-seam.test.js       4/4   (unmoved)
scene3d-ribbon-c3-rule5.test.js                6/6   (unmoved)
scene3d-ribbon-f7-self-occlusion.test.js       2/2   (unmoved, A2's own guard)
scene3d-hlr-spatial-index-identity.test.js     6/6   (unmoved — no hlr.js edit, expected)
scene3d-hlr.test.js                           11/11  (unmoved)
```
(`geometry-band-fill.test.js` from the original plan's §9 list was not re-run: this
amended unit does not touch `geometry-utils.js`/`insetMultiPolygon` at all — that item
belongs to the separate follow-up W-id, §7 item E / the judge's kept side-finding.)

## Honest numbers (re-measured on this tree, divisor 12; independent script, not committed)

| law | ringNotInkMm2 | ringNotInkReachableMm2 | ringUnreachableMm2 | clusters | worst cluster |
|---|---|---|---|---|---|
| interlockWeave | 2.0587 | 0.1519 | 1.9069 | 151 | 19 cells, 0.1069 mm², 0.450×0.300 mm |
| onePenDown | 1.9969 | 0.0450 | 1.9519 | 144 | 8 cells, 0.0450 mm², 0.375×0.225 mm |
| trochoidLoop | 1.7100 | 0.1744 | 1.5356 | 147 | 22 cells, 0.1237 mm², 0.900×0.300 mm |
| ampSpacing | 1.2319 | 0.0281 | 1.2037 | 184 | 3 cells, 0.0169 mm², 0.225×0.150 mm |
| weaveDepth | 0.8887 | 0.0056 | 0.8831 | 140 | 3 cells, 0.0169 mm², 0.225×0.075 mm |
| taperedEnds (control) | 0.1125 | 0.0169 | 0.0956 | 19 | 2 cells, 0.0112 mm², 0.150×0.075 mm |
| weightSmoothstep (control, vacuous — wide=0) | 0 | 0 | 0 | 0 | — |

These are close to, but not identical to, the plan's own diag5.js numbers (0.1519/0.0506/
0.1800/0.0281/0.0169) and the judge's own finer re-derivation (0.152/0.051/0.186/0.028/
0.017) — expected, since this predicate uses the plan's own first-match-owner-group
semantics (kept per the judge's explicit "keep §6.1" instruction) rather than the judge's
own stricter "every group containing the cell" re-implementation. All three are in the
same ballpark and all sit comfortably under both the 1.0 diagnostic ceiling and the 3.0
anti-explosion guard, so the discrepancy changes no assertion outcome.

## Evidence

Re-shot `^torus__(hatch|contour)__(ladder|none)__(med|max)__a$` from MAIN into
`docs/3d-audit/fill-audit/after/A3/` (only the 4 `ladder` combinations exist for this
primitive/mapper pairing — no `none` variant, matching the plan's own capture). Full
`report.json` written there with an explicit before/after byte-identity table AND the
mandatory A4 caveat in words. Summary:

- All 4 cells are **byte-identical** to a TRUE before capture: I `git stash push -u`'d this
  unit's changes out of the worktree (back to bare `79c98ca8`), re-captured the same 4
  cells, then `git stash pop`'d back in and diffed — all 4 SHA-256 match exactly. (The
  pre-existing, gitignored `docs/3d-audit/fill-audit/shots/A/` cache differs from both;
  that cache is untracked, stale, and from an unrelated earlier session — a pre-existing
  finding already logged in STILL-OPEN.md's "Gallery corruption" entries, not something
  this unit introduced. Confirmed the capture pipeline itself is deterministic by running
  the after-capture twice in a row — identical both times.)
- **I looked at the 4 images.** All four are torus/`ladder`-style renders: dense single-
  centreline concentric rings (hatch: nested rings converging toward the inner-hole cusp;
  contour: latitude bands). `lastRibbonStats.wide === 0` / `ribbonLaw: false` for every
  cell (see the manifest) — `ladder` never reaches `CLS_RIBBON` at all, so **this specific
  evidence set shows nothing about F1**; it is a generic sanity re-shoot, exactly as A4
  warns. I additionally looked at the judge's own
  `docs/3d-audit/lane-reports/A3-judge-evidence/interlockWeave-zoom.png` (pre-existing,
  read-only, not part of my own capture) and independently confirm what it shows: a single
  small red uncovered speck sitting in the middle of an otherwise solidly-inked ~1.5mm
  band — a pinhole, not a streak, and invisible at normal render scale.

## F1 status

**F1 STAYS OPEN.** This unit does not close it and the report above says so at every
level (STILL-OPEN.md's A3 bullet updated verbatim per the judge's exact wording; this
report; `after/A3/report.json`'s notes field). Two follow-up leads carried forward,
neither of them oracle-side (verbatim from the judge, unchanged):

1. A 0.45 × 0.30mm law-independent ink pinhole at document (148.6, 87.0), identical in
   `interlockWeave` and `trochoidLoop` (= 70%/58% of each law's reachable residue) —
   `surface-fill.js` outline↔fill seat / PenFill pitch. **Serialize against
   `fill-audit-a`** (surface-fill.js is theirs, not mine).
2. The blank the eye actually sees on the torus is *between* ribbon stretches, outside the
   oracle's denominator entirely — a placement question, likely W-26 territory (continuous
   placement so gaps carry tone), not a coverage metric at all.

Neither of these was touched in this unit (both require files outside my allow-list or a
different oracle entirely). Also carried forward unimplemented, per the judge's explicit
instruction: **§7 item E** (the `insetMultiPolygon` swallowed-boolean-failure ladder bug) —
real, unrelated to F1, needs its own W-id; not bundled here.

## Docs

- `docs/3d-audit/STILL-OPEN.md` — Unit A's bullet annotated (band assertion retired, not
  proof of a fix); new A3 bullet added with the judge's exact wording plus a note on what
  landed in this session. Edited in MAIN's working tree, left UNCOMMITTED there — this
  session found ~25 other uncommitted `docs/3d-audit/*` files from other concurrent lanes
  already sitting in MAIN (W-10c/W-15c/W-27c artifacts, other lane reports), so committing
  only mine there would either collide with or arbitrarily exclude that other WIP; leaving
  it uncommitted for the orchestrator to sweep matches how every other lane in this
  session apparently already behaved. Flagging this explicitly in case the orchestrator
  wants it committed differently.
- `CHANGELOG.md` / `plans.md` — NOT touched. This is a test-only, oracle-side, internal
  audit change with no user-visible or shippable behavior change; checked `git log` for
  precedent (recent `docs(3d-audit): ...` commits, e.g. `722ba84c`) and none of them touch
  CHANGELOG.md/plans.md either — that appears to be this audit line's established
  convention (STILL-OPEN.md + the lane-report file are the record).

## Commit

`d86cbf8d8e7b67eed8f742d36c481571df3d3ec4` on `3d-scene/handoff-c` (base `79c98ca8`), files
staged explicitly: `tests/helpers/scene3d-ring-coverage.js`,
`tests/unit/scene3d-ribbon-f1b-streaks.test.js`, `tests/unit/scene3d-ring-coverage-reachability.test.js`.
No push, no merge.
