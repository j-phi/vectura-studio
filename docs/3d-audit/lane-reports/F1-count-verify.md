STATUS: VERIFIED

# F1-count — light verifier report (lane fill-audit-a4, round 4)

**Pinned range:** `a5d8a1be..7ef20455`. **Worktree (read-only):**
`/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a4`. **Verifier scratch:**
`/private/tmp/claude-501/scratch-F1count/`.

## Setup integrity check (before trusting anything)

- `red-a5d8a1be/src/core/scene3d/surface-fill.js` diffed byte-for-byte against `git archive a5d8a1be` —
  **identical**. Confirmed this scratch export is a genuine, unpatched pre-image, not something hand-edited.
- `red-pre-7f805654/src/core/scene3d/surface-fill.js` diffed against `git archive 7f805654` — differs only by
  the deliberate probe patch (`fillEmpty: 0` field + `ribbonStat.fillEmpty += 1` in the same `outlineOnly`
  block), i.e. the same counter this unit ships, applied to the pre-F1-erode tree. Correct fixture for the
  historical-RED claim.
- **Mid-verification finding:** the worktree went dirty partway through (`git status` showed uncommitted
  edits to `src/core/scene3d/surface-fill.js` and `tests/unit/scene3d-mktick-wedge.test.js` from an
  unrelated, concurrently-running unit, T2-5 — mkTick sub-band re-tiling, nowhere near the fill-depth
  refusal path). Per the read-only rule I did not touch the worktree. Instead I built a fresh
  `git archive 7ef20455` export (`post-7ef20455/`, node_modules symlinked from MAIN) and diffed it against
  `git show 7ef20455:src/core/scene3d/surface-fill.js` — **identical** — then re-ran every measurement below
  against that clean tree instead of the live worktree, so nothing here is contaminated by the other unit's
  WIP. (For the record: a same-scope md5 sweep run against the dirty worktree before I noticed, and the
  later clean-export sweep, agreed on all 30/30 cells anyway — T2-5's change happens not to touch any of
  these cells — but the clean export is what this report relies on.)

## Condition 1 — counter exists, RED reproduces, mutation increments it

**VERIFIED.** `fillEmpty` is a real field on `lastRibbonStats`, next to `erodeEmpty`/`clipEmpty`/`degenerate`
(confirmed: `git diff a5d8a1be..7ef20455 -- src/core/scene3d/surface-fill.js` shows only the new field, its
comment, and the `ribbonStat.fillEmpty += 1` line inside the existing `if (!fillMP.length)` block — no
control-flow change).

Ran the committed `tests/unit/scene3d-ribbon-fill-depth-count.test.js` against the clean `post-7ef20455`
export: **12/12 passed** (structural gate for all 5 laws, the two `erodeEmpty===0` interlockWeave controls,
the three named blind-spot cells at `fillEmpty===0`/`erodeEmpty===0` post-fix, and the mutation-proof test).

Independently reproduced the historical RED with my own probe test (not the implementer's), run against
`red-pre-7f805654` (verified-genuine pre-F1-erode archive, patched only with the counter):

| cell | fillEmpty | erodeEmpty | degenerate |
|---|---|---|---|
| hatch/interlockWeave | 1 | 1 | 1 |
| crosshatch/interlockWeave | 1 | 1 | 1 |
| contour/trochoidLoop | 1 | 0 | 0 |
| contour/weaveDepth | 2 | 0 | 0 |
| crosshatch/weaveDepth | 1 | 0 | 0 |

Sum of the three blind-spot cells = **4**, matching LEDGER row 2d's stated RED exactly. Probe test file
removed from the scratch tree after the run.

Mutation proof re-verified via the committed test's own group 3 (forces one fill-depth `insetMultiPolygon`
call to `[]`): `fillEmpty` trips (`>0`), `erodeEmpty` stays `0` — passed on the clean export.

## Condition 2 — output byte-identical

**VERIFIED.** Wrote an independent md5-sweep script (not the implementer's `md5sweep.js`, though the rig
construction necessarily follows the same `addLayer`/`create`-rig API contracts) covering the full
bucket-B roster — `interlockWeave, onePenDown, trochoidLoop, ampSpacing, weaveDepth` (all five are torus
wave laws) × `hatch, contour, crosshatch` mappers × `{addLayer, create}` rigs = **30 cells**, comfortably
over the required 12 and all 30 wave-law cells (over the required six).

- Pre: `red-a5d8a1be` (verified-genuine unpatched `a5d8a1be`).
- Post: `post-7ef20455` (verified-genuine clean `git archive 7ef20455`, immune to the concurrent T2-5 WIP).

Result: **30/30 cells byte-identical, 0 mismatches** (md5 of `kind + 6dp x,y,z` per point, per emitted
scenePath). Full listing in `/private/tmp/claude-501/scratch-F1count/verify-pre.json` and
`verify-post-clean.json`.

## Condition 3 — bars: added-only, baseline unchanged

**VERIFIED.** `git diff a5d8a1be..7ef20455` touches exactly two files (`surface-fill.js`,
the new test file) and is purely additive in `surface-fill.js`: a new `fillEmpty: 0` stats field with its
explanatory comment, and one new line (`ribbonStat.fillEmpty += 1`) inside the pre-existing `outlineOnly`
`if` block. No existing threshold, tolerance, or count bar in any file was moved. `F1-count-impl.md`'s own
`## Bars changed` section reads "None." — an added, not edited, section (the file itself is new).

Re-ran the lane's baseline guards against the clean `post-7ef20455` export (not the now-dirty worktree):

| file | result |
|---|---|
| `scene3d-ribbon-f1b-streaks.test.js` | 44/44 |
| `scene3d-ribbon-wall-coverage.test.js` | 36/36 |
| `scene3d-ribbon-erode-refusal.test.js` | 16/16 |
| `scene3d-ribbon-width-bar.test.js` (spot-check) | 10/10 |
| `scene3d-ribbon-width-create-rig.test.js` (spot-check) | 12/12 |
| `scene3d-ribbon-degeneration-counter.test.js` | 5/5 (`degenerate === noRing + clipEmpty + erodeEmpty` invariant intact) |

All six files, 123/123 tests, matches the implementer's claimed baseline exactly.

## Verdict

**VERIFIED** — all three conditions hold, independently reproduced against a verified-genuine pre-image and
a clean (WIP-uncontaminated) export of the pinned post-commit. No probe files left in the worktree (which
was never edited) or in the pre-7f805654 scratch tree.

Foreground-only, `timeout: 600000` throughout per ROUND3-RESUME-BRIEFS §0b; two independent `node`
md5-sweep invocations exceeded the Bash tool's 600s hard ceiling and were backgrounded by the tool itself
(not `run_in_background`, no Monitor armed) — same tool-ceiling behaviour documented for
`scene3d-tone-law-collapse.test.js`; both were let finish and their outputs read from disk, not polled.
