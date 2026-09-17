STATUS: ACCEPT

# T2-3c — adversarial review (merge-gate)

Read-only reviewer, lane `fill-audit-a3`, pinned `a8e2269f..7375918c` (one commit
`7375918c`). Never edited/stashed/checked-out anything in the worktree. Read:
`AGENT-PROTOCOL.md` (Reviewers), `ROUND3-RESUME-BRIEFS.md` §0/§0b, `T2-3c-impl.md`,
`after/T2-3c/report.json`, `T2-3b-review.md` flags (2)/(3).

Reproduced everything in scratch exports under `/private/tmp/claude-501/scratch-T23c/`
(`git archive a8e2269f` → `pre`, `git archive 7375918c` → `post`, `node_modules`
symlinked from MAIN), plus a hand-mutated copy of `post`. All scratch dirs removed
after use; nothing left in the worktree; captures re-shot to
`docs/3d-audit/fill-audit/after/T2-3c/review` at port 8495 and the port killed
after (`lsof -ti:8495` empty).

## 1. GUARD — ACCEPT

Copied `tests/helpers/scene3d-mktick-runaway.js` + `tests/unit/scene3d-mktick-runaway.test.js`
(as they exist at `7375918c`) into the `pre` (`a8e2269f`) scratch export and ran them
there: **13 failed / 20 passed / 4 skipped**, matching the implementer's own RED table
exactly — including `create|sphere/contour` failing both its count and longest-path
assertions on the 52.39 mm defect. At `post` (`7375918c`), same file, unmodified:
**37/37 GREEN**, including all 4 `MUTATION-KILL` tests
(`create|sphere/contour`, `test|torus/hatch`, `test|cone/hatch`, `test|cone/contour`).

Per-cell longest/count(>15mm) on all six cells × both rigs, pre vs. post (from the
guard's own live render, cross-checked against my independent census in §2 — they
agree to the digit):

| rig | cell | pre (`a8e2269f`) | post (`7375918c`) |
|---|---|---|---|
| create | sphere/hatch | 46.690 / 3 | 8.713 / 0 |
| create | sphere/contour | **52.386 / 1** | 7.189 / 0 |
| create | torus/hatch | 14.199 / 0 | 8.474 / 0 |
| create | torus/contour | 11.876 / 0 | 10.513 / 0 |
| create | cone/hatch | 12.239 / 0 | 9.896 / 0 |
| create | cone/contour | 5.206 / 0 | 5.206 / 0 (identical) |
| test | sphere/hatch | 37.376 / 2 | 8.854 / 0 |
| test | sphere/contour | 20.249 / 1 | 7.048 / 0 |
| test | torus/hatch | 17.814 / 2 | 7.228 / 0 |
| test | torus/contour | 12.734 / 0 | 12.734 / 0 (identical) |
| test | cone/hatch | 15.610 / 1 | 10.306 / 0 |
| test | cone/contour | 22.435 / 1 | 7.010 / 0 |

**Mutation-proved myself, independently of the implementer's own MUTATION-KILL block**:
in a fresh copy of `post`, hand-edited `surface-fill.js:6356` back to
`const wk = walkPoly(fr, uOff, theta, poly);` (the exact `a8e2269f` call site) and
re-ran `scene3d-mktick-runaway.test.js` unmodified: **11 failed / 22 passed / 4
skipped** — the same per-cell violations reappear (`create|sphere/contour` 52.39mm
again exceeds every ceiling, `test|cone/hatch`/`test|cone/contour` longest-path
violations, `test|torus/hatch` count violation), confirming the guard is load-bearing,
not vacuous. Mutant copy deleted after.

**Which half of the acceptance bar**: correctly stated and correctly scoped. Jay's
rule has R1 (length carries tone — `O5`) and R2 (field stays complete — `wedge25`/
`holeMax`); this file gates neither and says so — it gates a third, implicit
"no stray marks that are not ticks" clause the orchestrator named directly
(`STILL-OPEN.md` line 604's own "merge blocker" framing). Confirmed non-overlapping:
running `scene3d-mktick-wedge.test.js` (O5/wedge25/holeMax) and
`scene3d-mktick-banding.test.js` (bandC) both pass independently and unaffected (§3).

## 2. FIX — ACCEPT

Reproduced path #943's appearance and disappearance with an **independent per-path
census** — my own script (`indep-census.js`), NOT `tests/helpers/scene3d-mktick-runaway.js`,
using only `Math.hypot` over consecutive points, run via the actual
`Vectura.AlgorithmRegistry.scene3d.generate` call (same `renderCell` construction as
the unit's own fixture, reimplemented independently):

- `pre` (`a8e2269f`), `create|sphere/contour`: **path index 943, 19 points, longest
  segment 46.73 mm** — exact match to the implementer's and the T2-3b reviewer's own
  numbers, found by a completely separate length/max-segment routine.
- `post` (`7375918c`): every one of the 12 (cell, rig) combinations comes back
  `count15 = 0`, longest in **5.206–12.734 mm**, i.e. all ≤ 13 mm as claimed. Two
  cells are literally byte-identical pre/post at the census level
  (`create|cone/contour`: worstIdx 494/worstMaxSeg 0.325/worstN 17 identical both
  trees; `test|torus/contour`: worstIdx 73/worstMaxSeg 0.354/worstN 37 identical both
  trees) — matching the implementer's disclosed byte-identity claim.

**addLayer-rig diagonal**: my independent census shows `test|sphere/contour`'s worst
pre-fix path is `worstN = 2, worstMaxSeg = 20.249` — i.e. genuinely **one 2-point
path**, not several short ticks aligning (confirms the implementer's and the guard
file's own "addLayer-rig diagonal" characterisation, and rules out the
several-ticks-merged theory the same way — structurally and numerically). On the
gallery capture fixture the same mechanism produces a visibly larger diagonal (a
different, ground/backdrop-enabled construction than the vitest fixture, correctly
disclosed as a fixture discrepancy) — confirmed gone by eye in §6.

## 3. NO REGRESSION of T2-3b — ACCEPT

Ran both guard files unmodified at `post`, in the worktree:

- `tests/unit/scene3d-mktick-wedge.test.js`: **58/58**, including the six-cell O5
  block (`O5_BAR = 2.30`, 12 tests, all `O5 >= 2.30` and `monotone === true`) and the
  wedge/hole block (`WEDGE_MEAN_BAR = {test: 0.08, create: 0.095}`,
  `WEDGE_CELL_CEILING = {test: 0.090, create: 0.180}`, per-cell ceilings all passing)
  plus its own `MUTATION-KILL 2` describe block (the T2-3 stagger, both rigs).
- `tests/unit/scene3d-mktick-banding.test.js`: **22/22**, including the CONTRAST
  mutation and NEGATIVE CONTROL tests (bandC's own mutation-kill), unaffected by this
  unit (this file was not touched by `7375918c`).

Both numbers match the implementer's own report exactly. Since neither test file's
bandC/wedge25/holeMax/O5 machinery changed except the `pathSignature` goldens (see
§4), and both re-ran green with the same test counts T2-3b reported, there is no
regression on the moiré half.

## 4. `scene3d-mktick-wedge.test.js` +32/−18 — every changed literal accounted for — ACCEPT

Read the full diff `a8e2269f..7375918c` for this file. **The only change is the
`EXPECTED_SIGNATURE` object**: 11 of 12 `pathSignature` golden hashes replaced
(`test|sphere/hatch` through `create|cone/hatch`), plus 8 lines of new comment above
it explaining why. `create|cone/contour`'s golden (`3a64b05a...`) is **byte-for-byte
unchanged** — the one cell whose own segment sweep never found a step over 5 mm, kept
as the "guard is inert where it should be inert" control. No `O5_BAR`,
`WEDGE_MEAN_BAR`, `WEDGE_CELL_CEILING`, or any other numeric literal in this file
moved. This is squarely a population/fixture change (mkTick's own emitted geometry
legitimately changes wherever the walk guard trips) with the required `## Bars
changed` disclosure and a mutation-kill proof (§1) — not a hidden regression. **Every
changed item is under `## Bars changed` with proof; nothing rejected.**

## 5. Roster sweep — ACCEPT

**Structural**: `stepCapMM` is `undefined` at every call site except one ternary,
`law.shape === 'tick' ? MK_TICK_STEP_CAP_MM : undefined`, and `walkFrom`'s guard is a
plain `if (stepCapMM && ...)`. The only two shapes that ever call `walkPoly`/
`walkFrom` are `'tick'` and `'morph'` — so no other MK-table row can ever see a
non-`undefined` cap. Confirmed by reading the full diff (§ above), not just the
report's claim.

**Measured**: re-ran, myself, directly in the worktree (not trusting the report's own
numbers), every guard the implementer named:

| guard | result |
|---|---|
| `scene3d-mark-laws-draw` (G4) | 30/30 |
| `scene3d-mkdashramp-dark-end` (T4b) | 4/4 |
| `scene3d-mkdashramp-low-end` (T3) | 13/13 |
| `scene3d-plot-safety` | 5/5 (1 pre-existing skip) |
| `scene3d-ribbon-f1b-streaks` | 44/44 |
| `scene3d-ribbon-wall-coverage` | 36/36 |
| `scene3d-ribbon-f1-amp` | 47/47 |
| `scene3d-crosshatch-cell-shape` + `-b` (W-31b) | 23 + 11 = 34/34 |
| `scene3d-crosshatch-parity` (W-36c) | 91/91 |
| `scene3d-ladder-uniform-field-spacing` + `scene3d-fill-ruling-corners` | 28/28 |
| `scene3d-faceted-hatch-density-angle-stable` + `scene3d-hatch-density-500` | 19/19 |
| `scene3d-fill-even-spacing` + `scene3d-curved-density-floor` + `-sparse-end` | 46/46 |
| `scene3d-mktick-wedge` (own) | 58/58 |
| `scene3d-mktick-banding` (own) | 22/22 |
| `scene3d-mktick-runaway` (own, new) | 37/37 |

All numbers match the implementer's report exactly, all re-run by me in the
worktree, not restated from the report. The disclosed benign
`[FillBoolean] polygon union failed on degenerate geometry` stderr noise appeared in
the ribbon files as expected — pre-existing, not a regression. I did not
independently re-derive the full 288-combination byte-identity sweep across every
non-mkTick law × mapper × primitive × density × rig (that would cost a scratch
`git archive` + a bespoke script at real machine-time expense for a claim the
structural proof above already closes deterministically), but the 15 guard files
above cover `mkDashRamp` (T3/T4b/G4), all three `crosshatch`/`ladder`/`hatch-density`/
`curved-density` families, and both wave/ribbon law families directly, and every one
is unaffected — no gap in the roster coverage that the structural proof leaves open.

## 6. PICTURES — ACCEPT

**Own re-capture, not just reading the implementer's shots.** Built a fresh scratch
`git archive 7375918c` export (`/private/tmp/claude-501/scratch-T23c-cap/`,
`node_modules` symlinked from MAIN) and ran MAIN's
`scripts/audit/scene3d-capture.js --tier B --root <export> --port 8495` for both
`--rig create` and `--rig addLayer`, `--only '^(sphere|torus|cone)__(hatch|contour)__mkTick__med__a$'`,
into `docs/3d-audit/fill-audit/after/T2-3c/review/` (served version `1.4.1`, matching
`package.json`; port 8495 confirmed free before and killed after,
`lsof -ti:8495` empty). Cropped `sphere/contour` both rigs at native resolution
(PIL, same box `(150,100)-(650,600)` the implementer used) to
`review/crops/sphere-contour-{create,addlayer}-post.png` and read them (Read tool):
**no diagonal stray stroke on either rig** — matches my own independent census
(§§1–2) and the implementer's own "after" crops pixel-for-pixel in content (tick
field, row banding, and the row of small white rectangular gaps — the T2-3e
"white-block lattice", disclosed and unowned by this unit — all present, unchanged).

Also read the implementer's own four crops in `docs/3d-audit/fill-audit/after/T2-3c/crops/`
for the BEFORE state (my own re-capture is post-fix only, from the final sha):
`sphere-contour-create-native-before.png` and `-addlayer-native-before.png` both show
one long, straight diagonal stroke crossing the whole lit flank from upper-left to
lower-right — the create-rig instance matches path #943's own geometry exactly (§2);
the addlayer-rig instance is the larger gallery-fixture manifestation of the same
mechanism (§2/`T2-3c-impl.md` §6). Comparing those BEFORE images against my own
independently-captured AFTER images: **the stroke is gone on both rigs, nothing new
appears.**

**Plain answer**: yes, this cell can go in front of Jay. The stray stroke — the
merge-blocking defect this unit exists to fix — is gone on both rigs, confirmed by
me independently at the pixel level (my own re-capture, not the implementer's
session) and at the path-census level (§§1–2). The two artefacts that remain in the
pictures (residual banding, the white-block lattice) are exactly the two already
named and owned elsewhere (`STILL-OPEN.md` Decision 13 and T2-3e respectively) —
both unchanged by this unit, which is the correct outcome for a unit scoped to
neither. No new defect appears in any crop I looked at, mine or the implementer's.

## Files touched — in scope

`src/core/scene3d/surface-fill.js` (walk/tick-only, matches the lane's
`surface-fill.js` → `fill-audit-a` serialization), `tests/helpers/scene3d-mktick-runaway.js`
(new), `tests/unit/scene3d-mktick-runaway.test.js` (new),
`tests/unit/scene3d-mktick-wedge.test.js` (goldens only). No forbidden file touched;
no MK-table constant changed (confirmed by reading the diff directly — only two new
constants, `MK_TICK_JUMP_PEN` and `MK_TICK_STEP_CAP_MM`, added).

## Overall verdict: ACCEPT

All six conditions pass on numbers I measured myself, independently, in scratch
exports and in the read-only worktree — not restated from the implementer's report.
The guard is per-cell (not a repeat of T2-3b's aggregate mistake), mutation-proven by
both the implementer's own test and my own hand-applied mutation, closes the exact
52.39 mm / 20.25 mm defects `T2-3b-review.md` flagged on both rigs, does not touch R1
(O5) or R2 (wedge25/holeMax) or the moiré fix (bandC), the one touched test file's
+32/−18 diff is entirely the disclosed golden re-pin with a control cell and a
mutation-kill proof, the roster sweep shows no leak into any other MK-table row
(structural + 15 re-run guard files), and the pictures confirm the fix by eye on both
rigs with no new defect. **The merge may proceed.**

## Evidence

Scratch: `/private/tmp/claude-501/scratch-T23c/{pre,post}` (`git archive a8e2269f`/
`7375918c`, `node_modules` symlinked from MAIN) plus one hand-mutated copy of `post`,
and `/private/tmp/claude-501/scratch-T23c-cap/` (`git archive 7375918c`) used for my
own capture re-shoot — all removed after use, port 8495 killed after
(`lsof -ti:8495` empty). New evidence written to MAIN:
`docs/3d-audit/fill-audit/after/T2-3c/review/` (`manifest.B.1-1.jsonl` +
`.addlayer.jsonl`, `shots/B/*.webp`, `crops/sphere-contour-{create,addlayer}-post.png`).
`docs/3d-audit/fill-audit/after/T2-3c/crops/*.png` (the implementer's own BEFORE
crops) read directly, not modified. No files left in the worktree, no files created
there.

REPORT docs/3d-audit/lane-reports/T2-3c-review.md — ACCEPT — merge blocker cleared; independently reproduced fix, no regression, roster clean.
