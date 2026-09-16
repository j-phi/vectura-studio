STATUS: MEASURED — G4 already gates the slab half at T4b's cell; no new bar written

# T4c — CI guard for the SLAB half of Jay's decision-1 bar (MEASURE-FIRST, TESTS ONLY)

- **Lane:** fill-audit-a3
- **Worktree:** `.claude/worktrees/fill-audit-a3`
- **Branch:** `3d-scene/fill-audit-a3`
- **Base sha:** `e2c3ca85` (F1-erode)
- **New sha:** `6e1ed52f` (this unit, comment-only)
- **Port:** 8475
- **LEDGER row:** 1b

## The question (row 1b, verbatim in effect)

Jay's decision 1 = B has two halves: "sphere Density 220 ≥ 1500 mm ink, **with no slab defect**." T4b
(row 1a) CI-gated only the ink-magnitude half (`tests/unit/scene3d-mkdashramp-dark-end.test.js`). T4b's
own reviewer proved by mutation that this file's cell (sphere/hatch/d=220) cannot see the slab defect at
all — it only regrows at low density (d=1). The ruled question for T4c: **does
`scene3d-mark-laws-draw.test.js`'s G4 already gate the slab defect** (it is enforced structurally —
`bandN*inkWidth ≤ 0.90*bandPitch ≤ 0.90*nominalMasterPitch`, sphere/torus/cone × three densities, 30/30) —
and if so, T4c closes as MEASURED with no new bar written, per the standing ruling.

## Method — mutation-prove G4, not just re-measure ink

`git archive e2c3ca85` from this worktree into `/private/tmp/claude-501/scratch-T4c/`, node_modules
symlinked from this worktree (never edited/stashed/reset the worktree itself; verified clean
`git status --short -- . ':!graphify-out'` before and after — the read-only F1-erode reviewer's access
was never disturbed).

Applied T4-review's / T4b-review's own rejected-first-draft slab-regrowing mutation to the scratch copy of
`src/core/scene3d/surface-fill.js` — the same formula T4b-review used for its own mutation proof
(`bandPitch = truePitch`, `bandN` with the `MK_BAND_MAX_PASSES` ceiling removed), applied in BOTH places
`bandN` is computed (`solveAt`'s `capOf` and `layMark`'s morph branch, which must agree):

```diff
- const bandPitch = Math.min(truePitch, masterPitch);
- const bandN = Math.max(1, Math.min(MK_BAND_MAX_PASSES, Math.floor((0.90 * bandPitch) / w)));
+ const bandPitch = truePitch;
+ const bandN = Math.max(1, Math.floor((0.90 * bandPitch) / w));
```
(and the matching `layMark` copy of the same `bandN` line).

Then ran the actual oracle file, in the foreground, against the mutated scratch tree:

```
npx vitest run tests/unit/scene3d-mark-laws-draw.test.js --pool=forks --poolOptions.forks.singleFork=true
```

## Result — G4 TRIPS

```
× G4 — sphere/hatch: the band never exceeds 1.0x the nominal master pitch, at low/med/max
  → expected 7.728000000000001 to be less than or equal to 5.8157003178519036
× G4 — torus/hatch: the band never exceeds 1.0x the nominal master pitch, at low/med/max
  → expected 8.4 to be less than or equal to 6.272436152747433
× G4 — cone/hatch: the band never exceeds 1.0x the nominal master pitch, at low/med/max
  → expected 7.392 to be less than or equal to 6.642234229210226

Test Files  1 failed (1)
     Tests  5 failed | 25 passed (30)
```

(Two further failures in the same run, both expected fallout of the same mutation, not new information:
W-06's own `density=low` dash-proximity check drops from 0.85+ to 0.75, and the `ink is monotone
non-decreasing` check inverts at d=220 — both are the slab-regrowth signature elsewhere in the same file,
consistent with, not contradicting, the G4 result.)

`[1, 50, 220].forEach(...)` in the G4 `test.each` stops at the first failing density per `expect()`
throwing — the failure is at **d=1 (low density)**, the exact density T4b-review's own mutation proof
identified as where the slab regrows (d=1: 826.36mm shipped → 2207.37mm mutated, +167%). G4's
`bandWidthMm` at that cell (7.73 / 8.4 / 7.392 mm for sphere/torus/cone) is the direct structural
signature of the same defect T4b-review's ink-delta measured indirectly — G4 is not a coincidental trip,
it is measuring the same slab by its own defining quantity (band width vs. master pitch).

**Control — G4 does NOT trip on the shipped (unmutated) tree**, re-confirmed in this worktree
(un-mutated, `e2c3ca85` + this unit's comment-only commit `6e1ed52f`):

```
✓ tests/unit/scene3d-mark-laws-draw.test.js (30 tests) 12053ms
Test Files  1 passed (1)
     Tests  30 passed (30)
```

**G4 already gates the slab half of Jay's decision-1 bar at T4b's cell.** Per the ruling, T4c closes as
MEASURED and **no new bar is written** — a duplicate low-density slab assertion on
`scene3d-mkdashramp-dark-end.test.js`'s own fixture would be cost without coverage; G4 already asserts the
identical structural quantity (band width ≤ nominal master pitch) across sphere/torus/cone at low/med/max,
and the mutation proof above shows it fires exactly where the defect actually lives.

## What quantity does each guard measure, and which half does each gate

- **T4b's floor/band** (`scene3d-mkdashramp-dark-end.test.js`) measures **total path-length ink (mm)** at
  one named cell (sphere/hatch/mkDashRamp/d=220, creation-defaults pipeline). It gates the
  **ink-magnitude half** of Jay's bar only. Mutation-proven blind to the slab defect at this cell (T4b-review;
  re-confirmed here — the mutation is byte-identical at d=220, 1501.063657816772mm, both before and after).
- **G4** (`scene3d-mark-laws-draw.test.js`) measures **band width vs. nominal master pitch**
  (`bandN*inkWidth ≤ 0.90*bandPitch`) directly and structurally, at low/med/max density × sphere/torus/cone.
  It gates the **slab half**. It is a structural definition of "not a slab" (round-2 plan's own G4), not an
  ink-magnitude proxy — which is exactly why it catches what T4b's ink bar cannot: the slab defect changes
  band WIDTH, and only incidentally (and only at low density, where G4 is checked) changes ink at all.

## Corrections to T4b-impl.md

Per the ruling, both of T4b-review's report-language corrections land here (T4b is closed; the wording
belongs next to the proof that settles it) plus a one-line pointer added at the top of `T4b-impl.md`
itself:

1. **T4b's band is a one-sided upper bound, not a symmetric second check.** `BASELINE_INK * 0.9 =
   1350.9573mm`, which is below the 1400mm floor — so the band's lower half can never be the operative
   check; anything clearing the floor automatically clears the band's lower bound with 49mm to spare. The
   band is live only as an upper bound (≤1651.17mm), guarding against ink INCREASES, not decreases.
2. **T4b gates the ink-magnitude half of decision 1 only.** It does not, and structurally cannot, gate the
   slab half at its own cell (mutation-proven identical ink, 1501.063657816772mm, with and without the
   slab-regrowing formula, at sphere/hatch/d=220). **The slab half is gated, and — per this unit's mutation
   proof — IS covered, by G4 in `scene3d-mark-laws-draw.test.js`.**

## Bars changed

None. No new test, no new assertion, no existing threshold touched. One comment line added to
`tests/unit/scene3d-mkdashramp-dark-end.test.js`'s header (scope disclosure only, no code/assertion
change) and a one-line corrective note added to the top of `T4b-impl.md` (documentation only).

## Guards run (targeted, foreground, one at a time, per AGENT-PROTOCOL)

- `tests/unit/scene3d-mark-laws-draw.test.js` — **30/30** on the unmutated worktree tree (confirms G4
  correctly does not trip on the shipped fix); **25/30 (5 failing, all G4/slab-signature)** on the scratch
  mutated tree (the RED proof).
- `tests/unit/scene3d-mkdashramp-dark-end.test.js` — **4/4**, unaffected by this unit's comment-only edit.
- `tests/unit/scene3d-ribbon-f1b-streaks.test.js` — **42/44**, unchanged from the lane's documented
  pre-existing red set (F1-erode's, owned by row 2a; not this unit's).
- `tests/unit/scene3d-ribbon-wall-coverage.test.js` — **36/36**, unchanged.

`git status --short -- . ':!graphify-out'` before and after: only the one comment line in
`tests/unit/scene3d-mkdashramp-dark-end.test.js` changed; no other tracked file touched by this unit.

## Files touched

- `tests/unit/scene3d-mkdashramp-dark-end.test.js` — one line added to the header comment (scope
  disclosure: this file gates the ink-magnitude half; G4 gates the slab half). No assertion changed.
- `docs/3d-audit/lane-reports/T4b-impl.md` (main repo) — one-line corrective note added at the top.
- `docs/3d-audit/lane-reports/T4c-impl.md` (this report, main repo).

## Open follow-ups

None. The ruling's expected outcome (MEASURED, no new bar) is what was found; row 1b's queue-jump ruling
holds and this unit did not pre-empt F1-erode's work in the lane.

REPORT docs/3d-audit/lane-reports/T4c-impl.md — MEASURED — G4 already gates the slab half at T4b's cell.
