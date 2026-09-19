STATUS: DONE (superseded in part — see `T3c-onset-impl-2.md`)

**UPDATE:** `T3c-onset-verify.md` returned NOT-VERIFIED on this report — the new file's
`getPreT3cSource()` (`git show 75777240:...`) fails under CI's real shallow clone. Fixed as a follow-up
commit (`b1ab9ebd`) in `T3c-onset-impl-2.md`: `getPreT3cSource()` replaced with `getT3cNeutralizedSource()`
(current-source + needle-revert, no git, same pattern `R4-fix` already used in the sibling files). All
numeric findings below (O17/O18 ratios, mutation-kill results, O19 record correction) are UNCHANGED and
still accurate — only the git-dependent baseline-construction mechanism moved. Read `T3c-onset-impl-2.md`
for the fix details and the real-shallow-clone reproduction.

# T3c-onset implementer — round 5, lane fill-audit-a5

- **Role:** Sonnet implementer, tests-only. **Unit id:** `T3c-onset`.
- **Worktree:** `.claude/worktrees/fill-audit-a5` · **branch** `3d-scene/fill-audit-a5` · **base sha**
  `6ebc76e8` · **new sha** `00e9bc7d` · **port 8471** (never started a server; not needed for this unit).
- **Files touched:** new `tests/unit/scene3d-mkdashramp-onset.test.js` (341 lines); comment-only edits
  in `tests/unit/scene3d-mkdashramp-discrete.test.js` and `tests/unit/scene3d-mkdashramp-single-pass.test.js`.
  `src/` untouched (forbidden per brief, confirmed by `git diff --stat` on the commit).
- Two read-only scouts (T2-4, W-07b) ran in parallel in the same worktree. `git status --short -- . ':!graphify-out'`
  showed only this unit's own files at both start and commit time — no collision observed.

## The finding — verified, not re-derived

`bandOnsetCap(d)` (`surface-fill.js:2531-2536`) returns
`clamp(Math.round(1 + t*(MK_BAND_MAX_PASSES-1)), 1, MK_BAND_MAX_PASSES)` with `t = (d-1)/(MK_BAND_ONSET_D-1)`
and `MK_BAND_ONSET_D = 35` (`:2530`). The rounding reaches `MK_BAND_MAX_PASSES = 6` once `t >= 0.9`, i.e.
`d >= 31.6`, so the gate is saturated at the INTEGER density **d = 32**, not the declared constant 35.
T3c's dash-length bound (`layMark`'s `law.shape === 'morph'` branch, `:6813-6818`) fires only while
`bandOnsetCap(d) < MK_BAND_MAX_PASSES`, so it switches off at d=32 too — confirmed by measurement below,
matching `T3c-review.md` condition 2's finding on a different metric.

## RED / GREEN

This is a characterization pin (no pre-fix tree — `src/` is unchanged for this unit). Per the brief, RED
is the mutation set (below). Additionally reproduced the new file as GREEN in a scratch
`git clone --local` of base sha `6ebc76e8` (needed `git clone`, not `git archive`, because the file's own
`getPreT3cSource()` shells out to `git show` and a plain archive extraction has no `.git`): **27/27 passed**
in `/private/tmp/claude-501/scratch-T3c-onset/gitclone` — confirms the file is not lane-worktree-dependent
(deleted afterward, per "leave no probe files").

GREEN in the lane worktree: **27/27 passed**, 8.95s.

## O17 — effective onset location (own measurement, own metric)

Metric: average DRAWN LENGTH of dark-third marks (`lastMarkStats.lenByThird[2] / cntByThird[2]`, same
signal `scene3d-mkdashramp-discrete.test.js` uses), measured as a ratio against the pre-T3c tree
(`75777240` — no dash-length bound exists there at all, the true "uncapped" baseline). Fixture: sphere +
torus, hatch mapper, mkDashRamp tone law, addLayer AND create rigs, `fillAngle: 45`, `ground: {enabled:
false}` — no ground-plane ink measured anywhere in this file (only length ratios and md5 path identity).

| fixture | d=31 ratio (active) | d=32 ratio (inactive) | d=32 md5 |
|---|---|---|---|
| sphere/hatch/addLayer | 0.564317 | 1.000000 (exact) | identical |
| torus/hatch/addLayer | 0.561778 | 1.000000 (exact) | identical |
| sphere/hatch/create | 0.546621 | 1.000000 (exact) | identical |
| torus/hatch/create | 0.553640 | 1.000000 (exact) | identical |

All four fixtures: bound ACTIVE at d=31 (43-45% length reduction, md5 differs from uncapped baseline),
INACTIVE at d=32 (ratio EXACTLY 1.0, md5 byte-identical). A one-integer-density cliff, confirmed
independently via a different derived metric than `T3c-review.md`'s gap-fraction probe.

## O18 — cliff magnitude, floor/ceiling pinned

Floor (d=31) ratios pinned per-fixture to 4 decimal places (table above). Ceiling (d=32) pinned at
EXACTLY 1.0 (`toBe`, not `toBeCloseTo`). Cliff step `(1 - ratio)` from d=31 to d=32 is >= 0.35 on every
fixture, asserted explicitly.

**Blocking mutation proofs (M1/M2/M3), all RED against the real fix's O17 d=32 clause:**
- **M1** (`Math.round` -> `Math.floor` in `bandOnsetCap`): predicted to widen the active range toward
  d=35 (rounding no longer jumps early). Measured: d=32 avg dark length under M1 is 6.36/6.44/5.34/6.72mm
  (sphere/addLayer, torus/addLayer, sphere/create, torus/create) vs. the real fix's 12.16/12.03/10.64/12.68mm
  — clearly still capped. `expect(md5(mut)).not.toBe(md5(baseline))` passes on all 4 fixtures.
- **M2** (`MK_BAND_ONSET_D` 35 -> 40): same effect, same 4/4 divergence.
- **M3** (gate on `opts.fillDensity < MK_BAND_ONSET_D` instead of `dashOnset < MK_BAND_MAX_PASSES`):
  same effect (values differ slightly from M1/M2 but still diverge from baseline on all 4 fixtures).

All three mutations were verified by direct probe (node script, deleted after use) before being encoded
as vitest cases, then re-confirmed inside the committed test file (`MUTATION-KILL` describe block, 3
tests, one per mutation, each looping all 4 fixtures internally) — 3/3 pass.

**Which mutation trips O18:** none of M1/M2/M3 moves the d=31 FLOOR-side magnitude. Checked
computationally (not just argued): `bandOnsetCap(31)` is identical under M1 (`floor(5.412)=5`, same as
`round(5.412)=5`) and M2 (`round(4.846)=5`, same value by coincidence of the new denominator), and M3's
gate condition (`31 < 35`) is unaffected by the constant's own value at d=31 either way. Measured: every
mutant's d=31 output is md5-byte-identical to the real fix's own d=31 output, on all 4 fixtures (dedicated
`describe` block, 4 tests, 4/4 pass). **O18's floor clause is therefore an UNGUARDED disclosure by this
mutation set** — a genuine gap, not silently claimed as proved.

## O19 — record correction

`git diff -- tests/unit/scene3d-mkdashramp-discrete.test.js tests/unit/scene3d-mkdashramp-single-pass.test.js`
shows only appended docstring lines (comment-only) in both files, stating "declared `MK_BAND_ONSET_D =
35`, effective onset d = 32 (rounding in `bandOnsetCap`)". No assertion, `describe`, or `test` line
touched in either file — confirmed by reading the diff.

## Which half you gate

O17 and O18 gate the LOCATION and SIZE of the onset cliff only. They do **not** gate dash length below
the cliff (T3c's O14), mark count (O15), or anything at d >= 35 (O16) — those remain the existing files'
own, unmodified territory.

## Guards — all rerun in the foreground, zero assertion edits

| file | result |
|---|---|
| `scene3d-mkdashramp-discrete.test.js` | 22/22 |
| `scene3d-mkdashramp-single-pass.test.js` | 20/20 |
| `scene3d-mkdashramp-low-end.test.js` | 13/13 |
| `scene3d-mkdashramp-dark-end.test.js` | 4/4 |
| `scene3d-mark-laws-draw.test.js` (Tier 2, slow) | 30/30 |

## Evidence cells

No gallery cell exists at d=31 or d=32 (`scene3d-capture.js` only shoots low=1/med=50/max=220). Did not
render a bespoke pair — this unit's own harness measurement (md5 path identity + dark-third length
ratio, both rigs, both primitives) is a stronger, exact signal than a visual crop would add at this
density, and the brief marks the bespoke render as optional ("If you can... If you cannot, say so").
Saying so: no bespoke d=31/d=32 render was captured.

## Bars changed

None. New file only. The two comment-only edits restate no numeric assertion (verified by `git diff`).

## Pre-existing red

None observed. `git status --short -- . ':!graphify-out'` in the lane worktree showed only this unit's
own files, both before starting and at commit time.

## Follow-ups (non-blocking, not built — per brief §3)

Whether d=32-34 should draw bounded dashes (i.e. moving `MK_BAND_ONSET_D`'s effective saturation point
to match its declared value, or vice versa) is a BEHAVIOUR change, Jay's call, not built here. Two
options: (a) leave the effective onset at d=32 as-is — it is a working, if under-documented, boundary;
(b) retune `bandOnsetCap` (e.g. `Math.ceil` or widen the ramp denominator) so the effective onset matches
the declared 35, extending the discrete-dash territory by 3 more integer densities (32-34) at the cost of
slightly shorter dashes there. Ink delta at d=32-34 was not separately measured (out of this unit's
scope — O17/O18 measure length ratio and md5 identity, not ink totals); a follow-up unit would need to
measure it on both rigs before recommending (a) or (b). No recommendation made here; flagging for Jay.

## Cleanup

Killed nothing on port 8471 (never started a server). Deleted the scratch `git clone --local` and the two
throwaway node probe scripts used to verify mutation predictions before encoding them as tests.

REPORT docs/3d-audit/lane-reports/T3c-onset-impl.md — DONE — O17/O18 pinned: cliff at d=32 (not 35), M1-M3 RED, O18 floor unguarded (disclosed).
