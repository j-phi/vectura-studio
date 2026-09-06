STATUS: REVERTED

# W-15c triage — fill-audit lane

**Lane:** fill-audit · **Worktree:** `.claude/worktrees/fill-audit` (branch `3d-scene/fill-audit`, port 8476)
**Base:** 58f00fc3 (WIP checkpoint, "W-15c uniform density term") → **New HEAD:** 6d6b1b78 (revert commit)
**Files touched:** `src/core/algorithms/scene3d.js`, `tests/unit/scene3d-faceted-density-calibration.test.js` (both reverted to their 5ebccf7c state)

## Starting state

Tree was clean before starting (`git status --short -- . ':!graphify-out'` empty; `git stash list` showed
only unrelated cross-session stashes, none belonging to this worktree). HEAD was 58f00fc3, an unverified
WIP checkpoint per the commit message ("the agent died at the API session limit mid-unit... tests may be
red").

## What the WIP did

Design C for W-15/W-15b/F-14 (the plane shows only 3 rulings at d=50, a plateau across densities): instead
of capping the carrier grant's ruling count by `zoneCeil / f.covOne` (designs A/B, which W-15b already
showed invert O20/O9 because that ceiling is asymmetric across two facets of the same zone), it computed a
uniform density term `densityCount = f.ext / hatchSpacing(fillDensity)` — identical formula for every
facet at a given density, only `f.ext` varying — floored (not capped) at `FACET_MIN_RULINGS`, then applied
tone as a multiplicative ratio on top (`toneRatio = spacing / s0`), clamped to the plot floor.

It also rewrote the calibration test's oracle: instead of asserting the (undesired) `[3,3,3,3]` plateau,
it asserted `fillLineCount(d, 'plane')` is *strictly increasing* across d = 1/10/25/50.

## Test run — targeted lane suite (22 files, faceted/density/plane/tone-algo/scene3d-fill)

Ran every `tests/unit/*.test.js` and `tests/integration/*.test.js` whose name contains `facet`, `density`,
`plane`, `tone-algo`, or `scene3d-fill`, plus `topoform-silhouette-plane-tracking.test.js` and the
integration `scene3d-fill-style-picker.test.js`, against 58f00fc3 as committed:

```
Test Files  6 failed | 16 passed (22)
     Tests  7 failed | 330 passed | 3 skipped (340)
```

Failures:

1. `scene3d-appdefault-facet-fill.test.js` — box RGR: `expected 10 to be greater than or equal to 12` (face count).
2. `scene3d-box-density-bearing.test.js` — two failures:
   - "Density is inert on the lit facets over most of its range": `expected [34,68,113] to deeply equal [86,86,86]`
   - "BYTE-IDENTITY GUARD... fingerprints across Density": `expected 'ab9548ca:4851' to be '4db89b89:4955'`
3. `scene3d-facet-tone.test.js` (O21, low-poly terminator): `expected 0.12966868865968378 to be greater than 0.15` (F-facet ratio floor).
4. `scene3d-faceted-density-calibration.test.js` — **the WIP's own new oracle fails on its own terms**: `expected 4 to be greater than 4` (counts[i] not strictly increasing at one adjacent density pair — 25→50 tied at 4).
5. `scene3d-hatch-density-500.test.js` — pinned box path-count series `[178,181,185,190]` no longer strictly increasing at one adjacent pair: `expected 202 to be greater than 202`.
6. `scene3d-subwindow-density.test.js` — clean-drawing probe: `expected 0.698595388134299 to be less than 0.4` (false-positive caustic flag).

(One unrelated `[vitest-worker]: Timeout calling "onTaskUpdate"` infra warning under load, no test attributed to it — consistent with the protocol note that timeouts under load are not regressions.)

## RED/GREEN proof that these are regressions, not pre-existing flakiness

Per the reviewer protocol (never edit/stash in the worktree to check history), archived the pre-WIP parent
`5ebccf7c` into a scratch export (`/private/tmp/.../scratchpad/scratch-w15c`, `node_modules` symlinked back
to the worktree) and re-ran the same 5 non-calibration failing files there:

```
Test Files  5 passed (5)
     Tests  43 passed | 2 skipped (45)
```

All five pass cleanly at 5ebccf7c. This confirms 58f00fc3 introduced all six failures — it is a real
regression, not test flakiness or an environment issue.

## Decision: REVERT

The brief's bar for FINISHING was: WIP green (or ~2 hours from green) AND, if finished, O20/O9 fixture
ordering not inverted AND F-14 rulings > 3 at d=50. Here:

- The WIP is not green — 6 files / 7 tests fail, including the new oracle's own test.
- It's not a narrow O20/O9-only inversion as anticipated in the W-15b lead — it also breaks a
  previously-accepted "Density is inert on lit facets" invariant, a byte-identity fingerprint guard, the
  O21 low-poly-terminator ratio floor, the pinned box hatch-density-500 series, and the subwindow clean-probe.
  That is a wider blast radius than design C's rationale predicted, and matches the pattern of the two
  already-rejected designs (A/B) — a fix that reaches one facet/fixture at the expense of another it didn't
  account for.
- Design C's own success criterion (strictly increasing plane ruling count 1→10→25→50) is not met by its
  own implementation (25 and 50 tie at 4 rulings), so this isn't a small numeric-tolerance fix away from
  green.

Reverted 58f00fc3 with `git revert --no-edit`, then amended the revert commit message (same commit, no
other history change) to record the six failing tests/numbers above and confirm re-run against the parent.
New HEAD: **6d6b1b78**.

## Post-revert verification

Re-ran the full 22-file targeted suite against 6d6b1b78:

```
Test Files  22 passed (22)
     Tests  337 passed | 3 skipped (340)
```

All green. `scene3d-faceted-density-calibration.test.js` is back to its 5ebccf7c "MEASURED" plateau test
(`[3,3,3,3]`, documented unresolved), matching the pre-WIP committed state exactly (diff against 5ebccf7c
on both touched files is empty by construction of `git revert`).

No evidence re-shoot was taken — nothing shipped that changes rendered output; the worktree's rendering
behavior at HEAD is byte-identical to 5ebccf7c (the last committed, reviewed state before this WIP).

## What design C (or a design D) still needs

F-14 (plane shows only 3 rulings at d=50, a density plateau) remains **OPEN**. For the next attempt:

- The uniform-density-term idea (target = `f.ext / hatchSpacing(d)`, floored not capped, tone applied
  multiplicatively) is directionally sound per the W-15b lead, but this implementation:
  1. Breaks `scene3d-box-density-bearing.test.js`'s accepted "Density is inert on lit facets over most of
     its range" invariant ([86,86,86] pinned) — the uniform term is *too* uniform; it now moves ink on
     facets that previous designs correctly left alone across most of the density range. The fix needs to
     gate on which facets are eligible for the grant more precisely (the original `if (i > 0) return; // carrier
     only` line + the `covOne <= zoneCeil` gate look right, but the *target* formula fires too broadly once
     inside that gate).
  2. Fails its own strictly-increasing oracle at one adjacent density pair (25 vs 50 tie at 4 rulings) —
     `Math.floor(densityCount)` combined with the `FACET_MIN_RULINGS` floor and the `+0.5` pitch inset
     likely round two adjacent densities to the same integer count before the natural (ungranted) pitch
     overtakes the grant. A design that targets a fractional/pitch quantity directly (rather than flooring
     to an integer count first) may avoid the tie.
  3. Regressed the O21 low-poly-terminator F-facet ratio (0.1297 vs a 0.15 floor) and the pinned
     `scene3d-hatch-density-500.test.js` box series — both suggest the multiplicative tone ratio or the
     floor interacts with the SAME zone-ceiling/covOne machinery the calibration test's carrier grant sits
     inside, at facets/densities outside the plane fixture this design was tuned against.
- Recommend re-deriving `want`/`target` per-facet against **all** of: `scene3d-box-density-bearing.test.js`,
  `scene3d-facet-tone.test.js` O20/O21, `scene3d-hatch-density-500.test.js`, `scene3d-subwindow-density.test.js`,
  `scene3d-appdefault-facet-fill.test.js`, and the calibration test itself — not just the O20/O9 fixtures
  the W-15b lead named — before calling it green, since this attempt shows the failure surface is wider than
  those two.
- Alternative from STILL-OPEN.md still on the table: give the O20/O9 (and now also O21/density-bearing/
  hatch-density-500/subwindow) fixtures their own low-density expectation instead of trying to satisfy one
  universal formula.

## Files touched this unit

- `src/core/algorithms/scene3d.js` — reverted to 5ebccf7c content (faceted carrier-grant block).
- `tests/unit/scene3d-faceted-density-calibration.test.js` — reverted to 5ebccf7c content (plateau
  "MEASURED" test restored).
- `docs/3d-audit/lane-reports/W-15c-impl.md` — this report (new).

No other files touched. `surface-fill.js`, `surface-fill-mono.js`, `mappers.js`, `hlr.js` untouched, as
instructed.
