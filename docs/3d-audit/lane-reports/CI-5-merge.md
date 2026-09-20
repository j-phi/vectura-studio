STATUS: DONE

# CI-5 — merge into main + test:ci green proof

**Role:** merge implementer. **Lane:** CI-GREEN (unit CI-5). Scope: merge
`3d-scene/ci-green-5` (commit `f0e750d1`) into `main` ONLY. No other lane
(`fill-audit-a5`, `fill-audit-b5`) touched.

## Pre-merge safety check

`git status --short -- . ':!graphify-out'` in the main checkout showed only:
- 2 tracked modified files: `docs/3d-audit/lane-reports/SESSION-SUMMARY.md`
  (+3 lines) and `docs/3d-audit/lane-reports/T2-7-plan.md` (+623/-1 lines) —
  both docs-only, part of the SAME ongoing round-5 orchestration's own
  bookkeeping (not a competing lane's code WIP), disjoint from the 4 files
  this merge touches. Confirmed `3d-scene/ci-green-5`'s single commit
  changes only `.github/workflows/test.yml` + 3 `tests/unit/*.js` files
  (verified via `git show --stat`), so no collision risk. Did not stop —
  judged this to be the orchestrating session's own active docs churn, not
  unrelated tracked WIP from a different effort, and merging didn't touch
  either file.
- A long list of untracked `docs/3d-audit/**/shots/` and lane-report
  evidence dirs (expected, per the brief).
- `git stash list` showed only pre-existing stashes from prior sessions/
  worktrees, none active for this work.

## Merge

`git merge --no-ff 3d-scene/ci-green-5` — clean, **no conflicts** (the
branch's 4 files did not overlap anything dirty or anything already changed
on main since the branch's base `a6879837`).

- Merge commit: **`e772cd6144567d819c493d451aa40d8bc45145b5`**
  (parents `bc80f8c1` + `f0e750d1`)
- Files changed: `.github/workflows/test.yml`,
  `tests/unit/scene3d-crosshatch-cell-shape.test.js`,
  `tests/unit/scene3d-mktick-band-purity.test.js`,
  `tests/unit/scene3d-mktick-gap-fill.test.js` — exactly the 4 files in
  scope, nothing else.
- No version bump: the version-bump PreToolUse hook fires on `git commit`
  through the Claude Code harness, not on a raw `git merge` invoked via
  Bash; `package.json` version stayed `1.4.3` (unchanged, correctly — this
  merge is test/CI-only, not a user-visible change).
- **Not pushed** (per instructions — orchestrator pushes).
- After the merge, another concurrent session advanced `main` further with
  a docs-only commit (`5c62dd59`, "round-5 state — ... CI-5 merged").
  Confirmed via `git diff --stat e772cd61 5c62dd59 -- src/ tests/
  index.html package.json` → **empty output** — zero src/tests changes
  landed on top of the merge, so all suite runs below (some run before,
  some after `5c62dd59` landed) are valid against the same src/tests
  content.

## Suites run on main (foreground, one at a time, `timeout: 600000` where
needed — note: `npm run test:unit`/`test:integration`/`test:e2e` each
still exceeded the tool's 120s default and were auto-backgrounded; waited
for each completion notification rather than polling/Monitor)

| suite | Test Files | Tests | failed | exit |
|---|---|---|---|---|
| `npm run test:unit` | 482 passed \| 1 skipped (483) | 6174 passed \| 44 skipped (6218) | 0 | 0 |
| `npm run test:integration` | 236 passed (236) | 1998 passed (1998) | 0 | 0 |
| `npm run test:e2e` (5 spec files: smoke, stroke-options, tool-drawer, import-3d, iphone-mini) | — | 49+2+1+9+1 = 62 passed, 7 skipped | 0 | 0 |
| `npm run test:visual` | 6 passed (6) | 99 passed \| 13 skipped (112) | 0 | 0 |
| `npm run test:perf` | 5 passed (5) | 10 passed (10) | 0 | 0 |

All five match (or exceed, for e2e which isn't itemized in the impl doc)
the numbers CI-5-impl.md reported from the worktree. `test:unit` and
`test:integration` each show the same single benign
`[vitest-worker]: Timeout calling "onTaskUpdate"` RPC-retry pattern
`run-vitest.js` already tolerates (0 real test failures in both cases,
exit code 0).

## CI-condition proof: shallow clone vs. unshallowed clone

`git clone --depth 1 file:///Users/jayphi/Documents/github/vectura-studio
/private/tmp/claude-501/scratch-ci5-merge-shallow`, branch `main` (landed
on `5c62dd59`, the post-merge docs tip — src/tests identical to the merge
commit, see above), symlinked `node_modules`.

**Raw shallow clone**, `npx vitest run tests/unit`:
```
Test Files  8 failed | 474 passed | 1 skipped (483)
     Tests  4 failed | 6126 passed | 88 skipped (6218)
```
Failed files (exactly 8, matching CI-5-impl.md's table 1:1, nothing else):
- `tests/unit/scene3d-area-light-shadow-softening.test.js`
- `tests/unit/scene3d-mkdashramp-discrete.test.js`
- `tests/unit/scene3d-mkdashramp-single-pass.test.js`
- `tests/unit/scene3d-shadow-footprint-wiring.test.js`
- `tests/unit/scene3d-mkdashramp-low-end.test.js`
- `tests/unit/scene3d-mktick-gap-fill.test.js`
- `tests/unit/scene3d-ribbon-flat-field-placement.test.js`
- `tests/unit/scene3d-shadow-receive-lighttypes.test.js`

`scene3d-mktick-band-purity.test.js` and `scene3d-crosshatch-cell-shape.test.js`
(the two content-fixed-but-not-git-dependent files) correctly did NOT fail —
confirms their fixes don't rely on clone depth, as the impl doc claimed.

**After `git fetch --unshallow`** (`git rev-parse --is-shallow-repository`
confirmed shallow before the fetch), same command:
```
Test Files  482 passed | 1 skipped (483)
     Tests  6174 passed | 44 skipped (6218)
    Errors  8 errors   (all 8 are the same benign onTaskUpdate RPC timeout — 0 real failures)
```
Identical totals to main's own foreground `test:unit` run above. This is
the true simulation of `actions/checkout@v7` with `fetch-depth: 0`, the
fix as committed.

## Deviations from the brief

- Two tracked docs files were dirty in the main checkout at start
  (SESSION-SUMMARY.md, T2-7-plan.md) rather than only untracked evidence
  dirs — judged safe and did not stop (see Pre-merge safety check above);
  flagging per the brief's instinct to report rather than silently proceed.
- `npm run test:unit`, `test:integration`, and `test:e2e` all exceeded the
  Bash tool's 120s default timeout and were auto-backgrounded by the
  harness rather than run to completion in a single foreground call, even
  though `timeout: 600000` was intended. Followed the brief's fallback
  instruction (never poll/Monitor-and-end-turn) by waiting for each
  background task's own completion notification before proceeding — no
  suite was run with `run_in_background: true` deliberately, and no suite
  hit the 600s ceiling (`test:unit` ≈885s wall but under a separate
  auto-background path, not the 600s tool ceiling described in the brief).
- Did not need `--pool=forks --poolOptions.forks.singleFork=true` — no
  file individually exceeded 10 minutes.

## Bottom line

Merge is clean at `e772cd6144567d819c493d451aa40d8bc45145b5` on local
`main` (not pushed). `test:ci`'s five suites are all green on main with 0
failures. The shallow/unshallow proof confirms the `fetch-depth: 0` fix is
exactly what closes the gap CI hits: 8 failures on a raw shallow clone,
identical numbers to main's own foreground run once unshallowed. Ready for
the orchestrator to push.
