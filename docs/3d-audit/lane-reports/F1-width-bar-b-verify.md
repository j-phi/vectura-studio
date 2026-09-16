STATUS: VERIFIED

# F1-width-bar-b — light verification

Lane fill-audit-a3, unit F1-width-bar-b, pinned `81925ee8..8780e97c` (WIP `7d015e94` + `8780e97c`).
Read-only verification against archived exports of the worktree
`/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a3` — worktree itself was never
edited, stashed, checked out, or reset. Method: `git archive 81925ee8` / `git archive 8780e97c` extracted to
`/private/tmp/claude-501/scratch-FWBb/{pre,post}`, `node_modules` symlinked from MAIN, all commands run in
the foreground with `timeout: 600000` (none needed it — longest run was 17.5s).

## Condition 1 — GREEN in post; floors RED under a real thinning mutation

`npx vitest run tests/unit/scene3d-ribbon-width-create-rig.test.js` in `post` (8780e97c tree): **12 passed
(12), 17.53s** — matches the impl report's claimed 12/12.

Independently re-verified the floor mechanism with an EXTERNAL mutation (not the test file's own
in-memory `scriptOverrides` patch): copied `post` to `post-mutant`, edited
`src/core/scene3d/surface-fill.js` on disk, replacing the exact needle the test file itself names
(`WIDTH_THIN_NEEDLE`, line 7363) —
`hw.push(Math.max(half[i], HALF_MIN));` → `hw.push(Math.max(half[i], HALF_MIN) * 0.6);` — then ran a
small ad-hoc probe (not left in place) calling `measureRibbonWidthCreate` directly against the mutated
on-disk tree (no override, so it reads the real mutated file):

| law | mutated width (mm) | floor (mm) | trips? |
|---|---|---|---|
| interlockWeave | 0.589785 | 0.834028 | YES — 29.3% below floor |
| trochoidLoop | 0.558927 | 0.724662 | YES — 22.9% below floor |

Both floored laws trip under the amplitude/band-thinning mutation, applied externally to a scratch copy of
`post` — the law that trips is the same `interlockWeave`/`trochoidLoop` pair the impl report claims, and
the resulting widths (0.590/0.559) match the report's own mutation-kill numbers to 3 decimals. Confirms the
floors are load-bearing, not tautological.

## Condition 2 — create-rig/browser identity claim

The one-off identity-proof script was deleted per the resume note (disclosed in the impl report), so this
was reproduced from scratch rather than re-run: a small probe (not committed, not left in the worktree)
requiring MAIN's `scripts/audit/scene3d-capture.js` exports (`ensureServer`/`openPage`/`getConstants`,
read-only) drove a real headless Chromium (`@playwright/test` from MAIN's `node_modules`) against the
`post` (8780e97c) tree served on `127.0.0.1:8461`, building the identical `--rig create` construction
(torus/hatch/fillDensity 50/toneLaw `interlockWeave`/camera 'a') inline in `page.evaluate`, verbatim
against `buildAndMeasure()`'s `else` branch. A parallel jsdom run used `measureRibbonWidthCreate` from the
same tree.

| | browser | jsdom |
|---|---|---|
| pathCount | 282 | 282 |
| totalPoints | 8750 | 8750 |
| totalInkMm | 1987.700153826702 | 1987.700153826702 |
| penWidth | 0.3 | 0.3 |

Point-by-point max coordinate delta across all 282 paths: **5.115907697472721e-13mm** — the exact same
figure (to every printed digit) the impl report gives for interlockWeave's own identity check. A
9-decimal-rounded canonical serialization actually **md5-matched** in this reproduction
(`c5bee5dd9e22ba340dcb8a102505f3a1` both sides); the report's claim that raw-precision md5 cannot match
(cross-engine float64 last-ULP noise) is consistent with this — rounding to 9 decimals is exactly what
absorbs that noise.

**Identity claim: MATCHES — YES.** Geometric equivalence independently reproduced, not just re-stated.

## Condition 3 — `## Bars changed` scope + pre-existing red unchanged

`git -C <worktree> diff --stat 81925ee8 8780e97c -- src/` → **empty** — no `src/` file touched across
either commit. Full diffstat `81925ee8..8780e97c` touches exactly two files: `tests/helpers/scene3d-ribbon-
width-create-rig.js` (new) and `tests/unit/scene3d-ribbon-width-create-rig.test.js` (new) — matches the
impl report's own "Files touched" and "## Bars changed" sections, which list only two ADDED floors
(`WIDTH_FLOOR_MM.interlockWeave`, `WIDTH_FLOOR_MM.trochoidLoop`) and explicitly claim no pre-existing bar
was touched. Confirmed by diff, not merely by re-reading the prose.

Pre-existing red (`tests/unit/scene3d-mktick-wedge.test.js`): ran in both `pre` (81925ee8) and `post`
(8780e97c) archives — **identical result both shas: 44 passed, 2 skipped, 1 file-level failure.** (The
archived trees have no `.git` directory, so the failing assertion's own `git show HEAD:...` throws "not a
git repository" rather than the report's own "chan: 'len'" content mismatch — an artifact of `git archive`
extraction, not a real discrepancy; the outcome — 44/2/1-failed — is byte-identical across both shas, which
is what "unchanged" requires here.) Confirms the report's claim that this unit did not cause or worsen the
pre-existing failure.

## Verdict

All three conditions hold. **VERIFIED.**

No probe files, scripts, or mutated copies were left in the worktree — all verification artifacts lived
under `/private/tmp/claude-501/scratch-FWBb/` and are being cleaned up.
