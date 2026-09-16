STATUS: VERIFIED

# W-31b — light verification report

**Lane:** fill-audit-a3 · **Pinned range:** `64b160a0..c28b3490` (one commit) · **Rank:** 3 (MEASURED-with-guards).
Read `docs/3d-audit/lane-reports/W-31b-impl.md`, `W-31b-plan.md` §4.1/§4.3, `ROUND3-RESUME-BRIEFS.md` §0b (all in
the MAIN repo, not the worktree — `W-31b-impl.md`/`W-31b-plan.md`/`ROUND3-RESUME-BRIEFS.md` are untracked-in-lane
shared docs, not part of the worktree's own commit history).

Method: read-only in `.claude/worktrees/fill-audit-a3` throughout (`git status --short` empty before and after —
never edited/stashed/checked-out/reset). Verification work done in three scratch copies under
`/private/tmp/claude-501/scratch-W31bv/` (a `git archive` export, a full `git clone` + `checkout c28b3490` for
HEAD-dependent tests, and two throwaway mutant copies), `node_modules` symlinked from MAIN, all vitest runs
foreground with `timeout: 600000`, one file per command, never `run_in_background`, never a Monitor. All scratch
dirs deleted after use; no probe files left anywhere.

## (1) New file GREEN in post; both guards mutation-proof — VERDICT: PASS

Ran `tests/unit/scene3d-crosshatch-cell-shape-b.test.js` in a `git archive c28b3490` scratch export:
**11/11 passed**, 2.13s — matches the claimed count exactly.

**C7 (tone-authority floor, d=50).** File's own header (lines 41-48) states C7 gates Jay's **second clause**
("unless we're trying to represent highlights"); C8's header (lines 50-56) states it gates **neither clause
directly**, but is a safety rail bounding what a future per-sample placement mechanism (like the discarded M1
spike) is allowed to do. Matches the impl report's "Which half of Jay's rule this unit gates" section verbatim.

Independently constructed my own mutant (not the file's own self-contained `MUTATION:` test, which proves the
same point by construction but doesn't literally re-run the real assertion under a failing input) against the
**real** C7 assertions: patched the sphere/cone `az315` test to sample `az135` twice (tone forced inert — no
light-direction difference, i.e. "force the cap to bind" in spirit: the tone response is deleted). Result:
both real assertions went RED —
`AssertionError: expected 1 to be greater than or equal to 1.5` (sphere) and `... 1.4` (cone). Ratio collapsed
to exactly 1.0 as the file's own comments predict.

**C8 (local plot-safety p01, d=220).** Independently mutated the real (non-`MUTATION:`-labeled) p01 assertions
for all 6 fixtures: injected the same synthetic near-zero-touch population the file's own mutation test uses
(`ceil(n*0.02)+2` samples at `0.0001`) into the freshly-measured `spreadA` population, recomputed p01 by the
guard's own 1st-percentile-of-raw-population method, and re-ran the real floor check. Result: **all 6 real
assertions went RED** (`sphere: expected 0.0001 to be greater than 0.00635`; `cylinder`, `torus`, `ellipsoid`,
`cone`, `sphere-cam-b` — same pattern, each failing its own pinned floor). Confirms the p01 arithmetic actually
trips on a touch rather than being diluted by population size.

Both guards are genuinely mutation-sensitive, not vacuous.

## (2) M1 discard is honest — VERDICT: PASS

Plan §4.1's four closure conditions: (1) curvature bound — torus/sphere-cam-b p01 ≥0.85× today's value
(0.0431/0.0257mm on this unit's own re-derived baseline); (2) no regression on an already-passing config
(ellipsoid d=220a, sphere d=220b must stay inside [0.85,1.18]); (3) ink — sphere d=220 ≥ P5b's 3713.0mm floor;
(4) measurability — C5b ≥0.85× today's interior window count.

**Iteration 1** (V7 verbatim + a probe-based floor add-on): fails **condition 1** — torus p01 0.0507→0.0004
(need ≥0.0431), sphere-cam-b 0.0302→0.0000 (need ≥0.0257) — and fails **condition 2** — ellipsoid ramp
1.089→1.523 (regressed out of band), sphere d=220b 1.054→1.465 (regressed out of band). The probe-floor
sub-attempt additionally worsens condition 4 (cone interior windows 79→12, well under the 0.85×=67 floor).
Report states "GATE VERDICT: FAIL" citing exactly these numbers.

**Iteration 2** (knob retune only): report explicitly names it — "Neither retune closes **condition 1**."
Best torus p01 = 0.0034, still short of the 0.0431 requirement; sphere-cam-b p01 = 0.0000 in every configuration
tried. Condition 1 fails on both iterations by the report's own numbers; condition 2 additionally fails on
iteration 1.

**No M1 source survives.** `git diff 64b160a0 c28b3490 --stat` and `--name-only` (re-run independently):
only `tests/unit/scene3d-crosshatch-cell-shape-b.test.js` (+368/-0). Zero `src/` files touched — confirmed
directly, not taken on the report's word.

## (3) `## Bars changed` + lane red set unchanged — VERDICT: PASS

Both the commit message and the impl report's `## Bars changed` sections read "None" for existing bars, with
C7/C8 disclosed only as entirely new bars in a new file — no MODIFIED entries present, ADDED-only as required.

**Lane red set at c28b3490, reproduced in a full `git clone` + `checkout c28b3490` scratch copy** (a plain
`git archive` export lacks `.git`, which this file's own pre-fix `git show HEAD:...` check needs):

- `scene3d-mktick-wedge.test.js`: **44 passed / 2 skipped / 1 failed** — exact match. The one failure is
  `expect(preFixSource).not.toContain("chan: 'len'")`, an assertion about the pre-fix source's own git history —
  T2-3b's pre-existing red, structurally unrelated to W-31b's crosshatch-cell-shape work. Reproduced, not
  inherited on faith.
- `scene3d-ribbon-f1b-streaks.test.js` spot-check: **44/44 passed** — matches exactly.

## Verdict

**VERIFIED.** All three conditions pass: the new file is green (11/11) and both C7/C8 are independently
mutation-proved RED under a real (not merely self-referential) mutant; the two-iteration M1 discard is honest
against the plan's own four closure conditions with zero source drift; the lane's red set and bars-changed
disclosure are unchanged and ADDED-only, respectively.
