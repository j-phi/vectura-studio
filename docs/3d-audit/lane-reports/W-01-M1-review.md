STATUS: ACCEPT

# W-01 M1 — adversarial review

Reviewer: Sonnet (read-only in worktree; no edits/stash/commits made in `.claude/worktrees/fill-audit-a`).
Lane: fill-audit-a. Worktree: `.claude/worktrees/fill-audit-a` (branch `3d-scene/fill-audit-a`).
Base for RED proof: `912f8471`. Unit HEAD: `9fa159f0`.

## 1. What actually changed since 912f8471

```
git log --oneline 912f8471..HEAD
9fa159f0 docs(3d-audit): finalize W-01 M1 — verify c861bf97, record before/after numbers
c861bf97 wip(scene3d): W-01 M1/M2 monotone ladder counts at d=1/10/25/50 (unverified)
```

`git diff --stat 912f8471..HEAD`: 4 files — `src/core/algorithms/scene3d.js` (26 lines, one
constant + comment), `tests/unit/scene3d-curved-density-floor.test.js` (13 lines, 2 pin updates),
`tests/unit/scene3d-curved-density-sparse-end.test.js` (77 lines, new "literal checkpoints (M1/M2)"
block), `docs/3d-audit/fill-audit-fixes/W-01.json` (docs). `git diff --stat c861bf97..HEAD`
confirms `9fa159f0` touches **only** `W-01.json` — the implementer's "no code change needed" claim
for their own session is literally true: the WIP checkpoint `c861bf97` (made by a *prior* agent
that died at the API limit, per its commit body) already contained the fix; this session verified
it and wrote the paper trail. The tie was real (see §3), not invented, and the fix is a single
constant: `CURVED_SPARSE_PITCH_BOOST` 6 → 4.1 in `curvedSparseTonePitch`.

Files touched outside `surface-fill.js`+tests: `scene3d.js` — but this is not a serialization
violation. `worklist.json`'s own W-01 entry lists `files: [surface-fill.js, scene3d.js,
scene3d-curved-density-sparse-end.test.js]`, and the base W-01 fix (`16c197d7`, already in the
912f8471 baseline) established `curvedSparseTonePitch`/`CURVED_SPARSE_PITCH_BOOST` in `scene3d.js`
as this lane's own scope — it is neither the "faceted path" nor the `buildSliceSegments`/
`contourSlice` slice pass that CLAUDE.md's serialization table reserves for other lanes. No edits
found outside `scene3d.js` + the two named test files + docs/evidence.

## 2. RED proof, reproduced in a clean scratch export (not git stash)

`git archive 912f8471 | tar -x` into
`/private/tmp/.../scratchpad/faa-912f8471`, `node_modules` symlinked from main. Confirmed at that
export: `CURVED_SPARSE_PITCH_BOOST = 6` (the value the implementer's WIP replaced) and the new
"literal checkpoints" test block does **not** exist there. Overlaid `HEAD`'s
`scene3d-curved-density-sparse-end.test.js` onto that old-source tree and ran it:

```
Test Files  1 failed (1)
     Tests  10 failed | 10 passed (20)
```

All 6 "literal checkpoints (M1/M2)" tests fail on the boost=6 tree, exactly reproducing the
implementer's cited numbers:
- `torus + hatch + ladder`: measured `[4, 3, 4, 10]` (expected `[3, 5, 7, 10]`) — **the named tie is
  real**: d=1 (4) equals... actually dips at d=10 (3) then **ties d=1 at d=25 (4)**. Confirmed byte
  for byte against the report.
- `sphere + hatch + ladder`: measured `[5, 4, 9, 23]` (expected `[4, 7, 13, 23]`) — d=10 dips below
  d=1, matches report.
- `cone + hatch + ladder`, and all three `+fineLadder` variants also fail, matching the report's
  numbers exactly.

The 4 BYTE-IDENTITY GUARD tests (d≥50) in the same file pass unchanged on the old-source tree, as
expected (boost only affects d<50).

This satisfies the ledger's flag (4): the RED proof is independently reproduced from a clean
archive, not from a `git stash` in the shared worktree, and it is **not vacuous** — the exact same
test file legitimately passes 20/20 against boost=4.1 and legitimately fails 10/20 against boost=6.
That is itself a live mutation check (boost is the mutated value) proving the oracle can fail
(ledger flag 3).

## 3. Monotonicity, both trees, torus×hatch×ladder at d=1/25/50 (+ d=10)

| tree | d=1 | d=10 | d=25 | d=50 |
|---|---|---|---|---|
| old (boost=6, scratch export) | 4 | 3 | **4 (ties d=1)** | 10 |
| new (boost=4.1, worktree HEAD) | 3 | 5 | 7 | 10 |

New tree: strictly increasing 3 < 5 < 7 < 10. Old tree: not monotone (dips then ties) — this is the
real, reproduced defect the M1 unit named. Verified directly via `npx vitest run
tests/unit/scene3d-curved-density-sparse-end.test.js` in the worktree (20/20 pass) and separately
via `tests/unit/scene3d-curved-density-floor.test.js` (12/12 pass) — the two re-pinned values there
(`sphere+hatch d=10`: 4→7; `crosshatch d=10`: 23,8→31,14) were independently reproduced by me:
running the *unmodified* old test file against the boost=6 scratch export passes at the *old* pin
values (4 / 23,8), and running the current test file against the worktree's boost=4.1 source passes
at the *new* pin values (7 / 31,14). **Ledger flag (1)**: the commit bodies of both `c861bf97`
(bare WIP message) and `9fa159f0` (docs-only, no floor-test numbers) indeed omit these two re-pin
numbers — a real documentation gap, process hygiene issue — but I independently re-derived and
confirmed both re-pins are correct, not fudged. Not a rejection reason; flagged as a follow-up
(commit hygiene, not correctness).

**Ledger flag (2)**: correct catch, worth stating precisely. The "literal checkpoints" `test.each`
block uses one assertion pair (`expectNonDecreasing(counts)` + `expectStrictlyIncreasing(ink)`) for
**all six** combos, including `fineLadder`, which does carry a real count tie: `torus + hatch +
fineLadder` = `[4, 6, 6, 9]` at d=1/10/25/50 — the tie is at **d=10 vs d=25** (indices 1,2), not
"d=1 vs d=25" as the ledger's paraphrase states; ink differs there (523.85 vs 648.2mm), confirmed
by re-reading the pinned array, so it is not a duplicate geometry. Substance still stands: the test
oracle is weaker than "strictly increasing count" and that weakening is what lets the fineLadder tie
through. However: (a) `fineLadder` is **not** in the original W-01 worklist scope (`worklist.json`
names "Ladder" specifically; fineLadder was added by this unit as bonus coverage) so the weakened
bar does not mask a gap in the ticket's actual done_when; (b) for the three **named** `ladder`
combos, the pinned counts (`[4,7,13,23]`, `[3,5,7,10]`, `[8,12,17,37]`) ARE strictly increasing —
verified by direct inspection, not just trusted from the report — so the worklist's literal
"strictly increase" bar is met for `ladder` even though the test code's shared assertion function
would not have caught it if it weren't. This is a real, disclosed follow-up (already listed in
`W-01.json`'s `open_followups`), not a hidden gap. Recommend tightening `expectStrictlyIncreasing`
onto the count for the 3 `ladder` rows specifically in a fast follow-up, but it does not invalidate
this unit's claim.

## 4. Byte-identity vs main at d=50 (8 named cells)

Ran `node scripts/audit/scene3d-capture.js --tier A|B --root .claude/worktrees/fill-audit-a --port
8475 --out <scratchpad>/w01m1-review` for `sphere/torus × hatch × {ladder, fineLadder, nibAngle,
mkDotScreen} @ med (d=50)`. All 8/8 md5 byte-identical to `docs/3d-audit/fill-audit/shots/{A,B}/`
in main:

```
sphere__hatch__ladder__med__a      14b9a50dfe7a4a50b682cc434fb06439  MATCH
torus__hatch__ladder__med__a       810585366d4a931ffcb01572b02a3cfc  MATCH
sphere__hatch__fineLadder__med__a  f0d0ad997fffba93fd9d105edf36b9e3  MATCH
torus__hatch__fineLadder__med__a   db33c969983423d2c298992b4d6fec13  MATCH
sphere__hatch__nibAngle__med__a    244e7335795db7745b9b5fe254c0cf43  MATCH
torus__hatch__nibAngle__med__a     245ce277aab8be3b380b1ee7f581db59  MATCH
sphere__hatch__mkDotScreen__med__a d8c6d4e43bdf4e8bc9ddae8fd9856c7d  MATCH
torus__hatch__mkDotScreen__med__a  c340ead1077abb6a7d06b0f9aa7cd2e1  MATCH
```

The orchestrator's pre-merge byte-identity constraint (STILL-OPEN.md line 25) still holds after
this unit's own further edit to the same constant.

## 5. The after/W-01-M1 PNGs — looked at directly (Read tool)

Sphere low: 3 spiral rulings converging near a pole. Sphere med: ~13-14 tight rulings, visibly
denser. **Real, visible progression, monotone.** Torus low: 2 open sparse curve strands (one long
arc, one small ellipse near the hole). Torus med: ~7-8 concentric bands. Torus max: ~30+ dense
bands. **Real, visible three-step progression, monotone.** This matches the implementer's
description closely; I concur it is app-clean, not just harness-clean.

**Ledger flag (5)** (one md5 cited as before-low, before-med, AND after-med): re-derived directly
from `docs/3d-audit/fill-audit/shots/A/` — `sphere__hatch__ladder__low__a.webp` and
`...__med__a.webp` in the **pre-fix** gallery are genuinely byte-identical
(`14b9a50dfe7a4a50b682cc434fb06439` for both), which is precisely the F-01 bug signature (low and
med rendered the same before the fix). `after/W-01-M1/.../med__a.webp` is *also*
`14b9a50d...` because Density≥50 is required to stay untouched. All three uses of that md5 are
independently confirmed correct, not an error or reused/mislabeled file — same for the torus
`81058536...` triple. Not a defect.

**Ledger flag (6)** (3/5 after-cells byte-identical; sphere max never shot): `report.json`'s
`byte_identical_pairs` array explicitly names and explains all 3 (sphere med, torus med, torus max —
all expected because d≥50 is untouched). Sphere max was not captured as an app screenshot in this
unit, which is a minor completeness gap — but the algorithm-level `BYTE-IDENTITY GUARD` describe
block in `scene3d-curved-density-sparse-end.test.js` does pin `sphere+hatch+ladder` md5 at d=50
**and d=220** directly via `SF.buildObject`, and I confirmed that describe block still passes (part
of the 20/20 run in §3). So sphere-max byte-identity is verified at the algorithm level even without
a fresh app screenshot. Non-blocking follow-up: shoot sphere max for full gallery parity next time.

## 6. report.json `after` paths

Confirmed all 5 entries in `docs/3d-audit/fill-audit/after/W-01-M1/report.json`'s `after` array are
prefixed `after/W-01-M1/shots/A/…` — no `shots/` (pre-fix dir) leakage, matching the "gallery
hygiene" fix from STILL-OPEN.md line 17.

## 7. Additional spot checks

`npx vitest run tests/unit/scene3d-mark-laws-draw.test.js` (named cross-lane W-05/06/07 regression
guard) in the worktree: 10/10 pass, no regression from this unit's constant change.

## Verdict: ACCEPT

The WIP checkpoint's fix is real, correctly finished (no code change needed this session was true,
not a rubber stamp), the named torus×hatch×ladder tie is genuinely resolved and independently
reproduced RED→GREEN in a clean scratch export, the d≥50 byte-identity contract holds (8/8 verified
directly by me, not just trusted), and the evidence PNGs show a real, monotone, app-visible
progression. Two honest, already-disclosed follow-ups, neither blocking:
1. Commit-hygiene gap: the two `scene3d-curved-density-floor.test.js` re-pins have no proof in
   either commit body (only in `W-01.json`); I independently reproduced and confirmed both are
   correct.
2. `torus+hatch+fineLadder` count-ties at d=10/25 (ink differs) because the checkpoint oracle uses
   a shared non-decreasing-count bar for both `ladder` and the out-of-scope `fineLadder` bonus rows;
   the in-scope `ladder` rows are independently confirmed strictly increasing by count regardless.
   Tighten the assertion to per-row strictness in a fast follow-up.
Also: sphere-max was not re-shot as an app screenshot (algorithm-level md5 guard covers it instead).
