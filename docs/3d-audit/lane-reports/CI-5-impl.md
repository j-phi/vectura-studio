STATUS: DONE

# CI-5 — make GitHub Actions "Tests" green on main

**Role:** implementer. **Lane:** CI-GREEN (unit CI-5). **Worktree:**
`.claude/worktrees/ci-green-5`, branch `3d-scene/ci-green-5`, off `main`
`a6879837` (main advanced under me mid-session to a later docs-only commit —
confirmed via `git diff --stat` that zero `src/`/`tests/` changes landed on
main in that window, so nothing shifted under me). **Commit:** `f0e750d1`
(worktree; not pushed, not merged).

## Failing run investigated

GH Actions run `35454205820` ("Tests" workflow, `main` @ `6ebc76e8`), jobs
`unit` and `coverage` both failed with the IDENTICAL 10-file/6-test failure
set. The immediately prior `main` push (`ff37531d`, the R4-fix commit)
failed its own CI run (`35451981431`) with the exact same 10 files/6 tests —
same assertion names, and for the two numeric ones, byte-identical measured
values across both runs. This is a stable, reproducible-every-time CI
failure, not flakiness.

## Root cause (one mechanism explains 8 of 10 files)

`actions/checkout@v7` defaults to `fetch-depth: 1` (shallow, tip commit
only; verified: neither `unit` nor `coverage` overrides it in
`.github/workflows/test.yml` before this fix). Eight test files call
`execFileSync('git', ['show', '<ancestor-sha>:<path>'], ...)`
UNCONDITIONALLY (not gated behind an env-var RED/GREEN switch like this
suite's `VECTURA_PRE_*` idiom) to build a byte-identical / RED-proof
comparison against a specific historical commit:

| file | BASE_SHA | mechanism |
|---|---|---|
| scene3d-shadow-footprint-wiring.test.js | 1e681432 | inline `execFileSync` in a "byte-identical" `describe`'s `beforeAll` |
| scene3d-shadow-receive-lighttypes.test.js | 90f3411f | inline `execFileSync` in a `guard` test body |
| scene3d-area-light-shadow-softening.test.js | 90f3411f | inline `execFileSync` in a "Guard D" `describe`'s `beforeAll` |
| scene3d-ribbon-flat-field-placement.test.js | 8adfd5af | local `f1pBaselineRuntimeOptions()` — unconditional, NOT the shared gated helper |
| scene3d-mkdashramp-low-end.test.js | 8780e97c | `getPreT3cSource()`-style local helper, called unconditionally in describe-level `beforeAll` |
| scene3d-mkdashramp-single-pass.test.js | b43fa4e3 | same pattern |
| scene3d-mkdashramp-discrete.test.js | 75777240 | same pattern |
| scene3d-mktick-gap-fill.test.js | 75777240 | hardcoded scratch dir (`/private/tmp/claude-501/scratch-T26-red/...`), separate mechanism, same disease |

Verified every sha is a real ancestor of the worktree's own HEAD
(`git merge-base --is-ancestor <sha> HEAD`, all six distinct shas — ran and
confirmed individually) — none is a foreign/unmerged branch. On a depth-1
checkout `git show <sha>:path` fails with `fatal: invalid object name`,
which throws inside a `beforeAll`/inline call, which then makes the paired
`afterAll`'s `runtimeOld.cleanup()` throw `TypeError: Cannot read properties
of undefined (reading 'cleanup')` — exactly what ci.log shows for the seven
`execFileSync` files. For `scene3d-mkdashramp-discrete.test.js` and
`scene3d-mkdashramp-single-pass.test.js` the failing call sits in the
describe-level `beforeAll` wrapping ALL sibling tests (O14/O15/O16/byte-
identity-sweep), so every one of them (22/22 and 20/20) is reported
"skipped" rather than run — the "whole describe blocks vacuously skip on
CI" symptom named in the brief is the SAME root cause, not a second defect.

Cross-checked the 6 distinct SHA object-name failures directly out of the
saved ci.log (`grep -o "invalid object name '[a-f0-9]*'" ci.log | sort -u`)
— exactly `1e681432, 75777240, 8780e97c, 8adfd5af, 90f3411f, b43fa4e3`,
matching this table 1:1 with no unexplained SHA.

**FIX:** `.github/workflows/test.yml` — added `fetch-depth: 0` to the
`unit` and `coverage` jobs' `actions/checkout@v7` step (the only two jobs
that run `tests/unit/**`; `integration`/`e2e-smoke`/`visual`/`perf` don't
touch these files, confirmed by grep). No test file needed to change for
the seven `execFileSync` files — RED/GREEN proved directly against real
shallow/full git clones (below), so per the COORDINATION note about the
concurrent `fill-audit-a5` lane, `scene3d-mkdashramp-discrete.test.js` and
`scene3d-mkdashramp-single-pass.test.js` received **zero edits** from this
unit (confirmed: `git diff --stat` on the final commit touches only 4
files, neither of those two).

### RED/GREEN proof (real clones, not a git-stash simulation)

```
git clone --depth 1 file:///…/vectura-studio <scratch>; ln -s <repo>/node_modules <scratch>/
cd <scratch> && npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
  -> RED: "fatal: invalid object name '1e681432'" + cleanup TypeError (matches ci.log verbatim)
git fetch --unshallow file:///…/vectura-studio
npx vitest run tests/unit/scene3d-shadow-footprint-wiring.test.js
  -> GREEN: 5/5
```
Repeated as one batch for the other 6 `execFileSync` files — fresh
`--depth 1` clone: `Test Files 6 failed (6) / Tests 3 failed | 47 passed |
43 skipped (93)` (the "43 skipped" is the mkdashramp vacuous-describe-block
symptom); same clone `git fetch --unshallow` then rerun: `Test Files 6
passed (6) / Tests 93 passed (93)` (one pre-existing, already-tolerated
birpc RPC-timeout `Unhandled Error`, zero test failures — the same pattern
`scripts/run-vitest.js`'s own header documents and that this repo's own
`test:coverage` job already retries around).

## Orchestrator's indirect-form sweep request — addressed

Ran an exhaustive `grep -rln "child_process\|execSync\|execFileSync\|
spawnSync" tests/` across the WHOLE `tests/` tree (not scoped to `unit/`).
12 files matched, all triaged:
- 8 unsafe (table above, all fixed via `fetch-depth: 0` + the
  `mktick-gap-fill` content fix)
- `tests/helpers/pre-wip-surface-fill.js` — the SHARED helper
  (`preWipRuntimeOptions`, `preWallsFixRuntimeOptions`,
  `makePreShaRuntimeOptions`, `makeMultiFilePreShaRuntimeOptions`) — every
  exported function checks its own `process.env.VECTURA_PRE_*` flag BEFORE
  calling `execFileSync`, so merely importing/calling them is safe on CI
  (the env var is never set there). Grepped all 18 files that import from it
  and confirmed each one only calls the gated wrapper, never the raw
  `getPreWipSurfaceFillSource()` unconditionally.
- `scene3d-slice-end-overlap.test.js` — uses `git show HEAD:path` (always
  resolvable, any checkout depth) — safe by construction.
- `scene3d-tone-laws-config.test.js`, `skin/skin-sdk.test.js` —
  `execFileSync('node', [...])`, no `git` involved at all.

Cross-checked this against `docs/3d-audit/lane-reports/T3c-onset-verify.md`
(the verifier report the orchestrator pointed at): its own live-CI evidence
(`gh run view 35454205820 --log-failed`) lists exactly the same 6 distinct
SHA object-name failures I found independently via the saved ci.log grep.
Its "11 other files"/"8 other SHAs" phrasing appears to count
non-unique occurrences (e.g. `90f3411f` appears across 2 files,
`75777240` across 2 files) rather than distinct files — reconciles to the
same 8-file set once de-duplicated by file. I did not edit
`tests/unit/scene3d-mkdashramp-onset.test.js` (new file on `fill-audit-a5`;
per the orchestrator's explicit instruction its own implementer is fixing
it) — it doesn't exist in this worktree's base tree at all, so there was no
risk of touching it. It shares this exact root cause and will resolve for
free once `fetch-depth: 0` lands, regardless of which lane's commit reaches
main first.

## Files needing real content changes (3)

### 1. tests/unit/scene3d-mktick-gap-fill.test.js — hardcoded scratch dir

`PRE_TICK_BLOCK CODE ... is identical to the real base sha (75777240)`
required a hand-materialized `/private/tmp/claude-501/scratch-T26-red/...`
export (`git archive 75777240 | tar -x -C ...`, meant to be run by hand
before committing) that never exists on a fresh CI runner — unconditional
`Error: base-sha scratch export missing`. Replaced with a direct
`git show 75777240:src/core/scene3d/surface-fill.js` (same idiom
`getPreFixScene3dSource` and siblings already use elsewhere in this suite),
cached per-process, no scratch dir, no hardcoded path. Still needs deep
history — relies on the same `fetch-depth: 0` fix (confirmed: RED again on
a fresh depth-1 clone, GREEN after unshallowing — see the 8-file batch
proof above, this file is one of the 8). Local: 45/45 green, unchanged
golden fingerprints (`EXPECTED_PRE_SIGNATURE` untouched).

### 2. tests/unit/scene3d-mktick-band-purity.test.js — timeout too tight for CI

`ROSTER MD5 SWEEP` (111-cell x2-runtime full-pipeline sweep, already reduced
once per the file's own comments from an 8-mapper sweep) has its own
`testTimeout` override of 500000ms. Times out on CI in BOTH failing runs
(`Error: Test timed out in 500000ms`, identical in `unit` and `coverage`
jobs, both runs — ci.log lines ~4956, ~13641). Locally (macOS, uncontended,
`--pool=forks --poolOptions.forks.singleFork=true`): 305394ms for the test
itself, 316365ms for the whole file, 35/35 green. CI's shared 2-core runner
needs meaningfully more than 500000ms and the exact contended figure is
unmeasured beyond "more than 500000ms" (it was killed there, not completed
slow). Raised to 900000ms — ~3x the uncontended local measurement, ~1.8x
the prior CI-failure floor, not a bare nudge past 500000. See
`## Bars changed`.

### 3. tests/unit/scene3d-crosshatch-cell-shape.test.js — genuine platform split

`C1/C5 ... torus d=220 cam=a`, column index 2 (n=27 — an ODD sample count,
so the median is a single sorted element, not an averaged pair) diverges
between platforms, deterministically:
- macOS arm64 (this worktree, node v20.20.2): `0.9262980105396276` —
  reproduced identically on every local run, isolated file and inside the
  full 483-file/730-file suite runs.
- ubuntu-latest x64 (GH Actions, `node-version: 20`): `0.937078841874498`
  — byte-identical across TWO separate real CI runs (`35451981431`,
  `35454205820`), both `unit` and `coverage` jobs (4 log occurrences total,
  all identical to the last digit).

Confirmed this is NOT a stale pin from src drift: `git diff --stat
ff37531d..a6879837 -- src/` is empty — zero src changes between the R4-fix
commit and the commit under audit, yet the R4-fix commit's OWN CI run
already showed this exact failure with this exact value. The other 4
columns in the same record do NOT diverge. Consistent with a median landing
on a near-tied pair of samples, where a sub-ULP difference upstream
(`Math.atan2`/`sin`/`cos` in the local-gap measurement, whose last-bit
output is not guaranteed bit-identical across CPU architectures) flips
which sample sorts into the middle position — a real ~1.2% swing in the
OUTPUT from a ~1e-13-class swing in the INPUT, consistent with "same
source, different arch," not "wrong pin" or "flaky" (flaky would not
reproduce bit-identical across independent CI runs).

Did not reproduce under actual Linux locally: `open -a Docker` was run and
polled (`docker info`) repeatedly over several minutes without the daemon
ever coming up in this sandboxed session — no interactive GUI available to
diagnose further. Relying instead on two independent, bit-identical real CI
runs as the platform-side data point, which is at least as strong as an
uncontrolled single local Docker run would have been.

**FIX — not a blanket widen.** Anchored the one affected cell's assertion to
EITHER of the two independently-measured, disclosed platform values (tight
±0.0005 tolerance around whichever is nearer), instead of a single value at
±0.005. Verified algebraically that a genuine regression still fails: the
gap midpoint (0.9317) is 0.0054 from the nearer anchor — over the ±0.0005
bar — and a farther value (0.95) is 0.0129 away. All other columns/records
in the file are untouched (still single-value, precision 2, ±0.005). Local:
23/23 green; also green inside the full 483/730-file suite runs (see
below).

## Bars changed

- `tests/unit/scene3d-mktick-band-purity.test.js:609` — ROSTER MD5 SWEEP
  test timeout `500000` -> `900000` (ms). Not a correctness bar; CI wall
  time only. Why: CI times out at 500000ms in two independent real runs;
  local uncontended measurement is 305394ms; raised with ~3x local /
  ~1.8x prior-CI-failure headroom rather than nudging past the observed
  floor (no tighter number is directly measurable from a contended run
  without deliberately re-running under load).
- `tests/unit/scene3d-crosshatch-cell-shape.test.js` (C1/C5, `torus
  d=220 cam=a`, column index 2 only, inside the `CEILING.forEach` /
  `rec.cols.forEach` block) — tolerance `toBeCloseTo(0.9263, 2)` (±0.005,
  single value) -> nearest-of-`[0.9262980105396276, 0.937078841874498]` at
  `toBeCloseTo(nearest, 3)` (±0.0005 around whichever platform value is
  closer). Why: genuine, deterministic, reproduced-twice-on-real-CI
  platform split (macOS arm64 vs ubuntu-latest x64), not a stale pin (src
  unchanged since before this exact failure was first seen on CI) and not
  flakiness (bit-identical CI value across 2 independent runs). Every other
  column/record in this file is untouched.

## Suites run (all foreground, all green, all reconcile to the same totals)

| run | where | Test Files | Tests | failed |
|---|---|---|---|---|
| `npm run test:unit` | worktree (`.claude/worktrees/ci-green-5`) | 482 passed \| 1 skipped (483) | 6174 passed \| 44 skipped (6218) | 0 |
| `npm run test:coverage` | worktree | 729 passed \| 1 skipped (730) | 8281 passed \| 57 skipped (8338) | 0 |
| `npm run test:unit` | fresh `git clone --depth 1 --branch 3d-scene/ci-green-5` of this repo, then `git fetch --unshallow` (simulates `actions/checkout@v7` with `fetch-depth: 0`, the actual fix as committed) | 482 passed \| 1 skipped (483) | 6174 passed \| 44 skipped (6218) | 0 |
| `npm run test:coverage` | same branch clone | 729 passed \| 1 skipped (730) | 8281 passed \| 57 skipped (8338) | 0 |

The unit total (6174 passed + 44 skipped = 6218) matches R4-fix's own
reported baseline exactly. The coverage total (8281 passed + 57 skipped =
8338) reconciles against the pre-fix failing run's own count (8231 passed +
101 skipped) plus the ~50 previously-vacuously-skipped tests inside
`mkdashramp-discrete`/`mkdashramp-single-pass` now actually running and
passing (101 - 44 = 57 genuinely-still-skipped elsewhere, unrelated to this
fix). Coverage thresholds (statements 83 / lines 83 / functions 77 /
branches 69) all cleared — no `ERROR: Coverage ... not met` anywhere in
either coverage log. The only `Errors` entries in any run are the single,
already-documented `[vitest-worker]: Timeout calling "onTaskUpdate"` birpc
RPC timeout (`scripts/run-vitest.js`'s own header explains why, and its
wrapper explicitly tolerates ONLY that exact condition, re-running once and
failing closed on anything else) — every run's retry (or first pass) ended
with 0 failed tests, so `run-vitest.js` exits 0 in all four cases.

Additionally reran the exact 10 previously-failing files (both before and
after `git fetch --unshallow`) as a fast-path check on the branch clone,
independent of the full-suite runs: RAW shallow (`--depth 1`, no
unshallow) — `Test Files 8 failed | 2 passed (10)` (the 7 `execFileSync`
files + `mktick-gap-fill`, all still correctly failing for the DIAGNOSED
reason, nothing new; `mktick-band-purity` and `crosshatch-cell-shape` pass
standalone since their fixes don't depend on git history at all); after
`git fetch --unshallow` — `Test Files 9 passed (9)`, 166/166 tests.

## Open items / handed to Jay

- `.github/workflows/release.yml` (`on: push: tags`) also runs `npm run
  test:unit && npm run test:integration` on a plain (shallow, `fetch-depth`
  unset) checkout and would hit the SAME seven/eight-file failure on any tag
  push. Out of this unit's explicit scope (the brief named "the Tests
  file"), flagging as a one-line `fetch-depth: 0` follow-up there too.
- Could not verify the crosshatch platform split under actual Linux locally
  — no working Docker daemon in this sandboxed session (checked repeatedly
  over several minutes after `open -a Docker`, never came up). The fix
  rests on two independent real CI runs' bit-identical values, which is
  solid, but a deliberate Linux repro would be the stronger proof if anyone
  wants to spend the time on it later.
- `scene3d-mkdashramp-onset.test.js` (new file, `fill-audit-a5` lane,
  commit `00e9bc7d`) shares the exact same `getPreT3cSource()`-style
  unconditional `git show 75777240:...` pattern (confirmed via
  `docs/3d-audit/lane-reports/T3c-onset-verify.md`'s own findings). Not
  touched here per the orchestrator's explicit instruction; it will resolve
  for free once `fetch-depth: 0` merges, from either lane.

## Files touched (worktree, commit `f0e750d1`)

- `.github/workflows/test.yml`
- `tests/unit/scene3d-mktick-gap-fill.test.js`
- `tests/unit/scene3d-mktick-band-purity.test.js`
- `tests/unit/scene3d-crosshatch-cell-shape.test.js`

Not pushed, not merged, no version bump (hook cannot fire in a worktree, and
none was attempted).
