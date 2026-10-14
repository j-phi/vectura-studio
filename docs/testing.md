# Testing Guide

Workflow governance and documentation synchronization rules live in `docs/agentic-harness-strategy.md`.

## Toolchain
- Node 20.19 or newer is required. `.nvmrc` pins 20.20.2, the major CI runs (`nvm use`). Byte-exact
  float-hash goldens (for example `scene3d-u2-kernel-identity`) are enforced only on Node 20; other
  majors check path/point counts only, because V8 versions round Math results differently.
- Unit/Integration/Visual/Perf: Vitest 4 (`vitest.config.mjs`); keep `vitest` and
  `@vitest/coverage-v8` on matching versions. Worker limits use Vitest 4's top-level
  `maxWorkers` option with the `forks` pool. Local ordinary runs and CI use at most two workers; full local coverage uses one to bound retained audit memory. CLI worker overrides are explicit experiments, not the default.
- E2E smoke: Playwright (`playwright.config.js`)
- Runtime loader for browser IIFE modules: `tests/helpers/load-vectura-runtime.js`
- E2E smoke projects run on Chromium for both desktop and touch-tablet coverage (tablet uses touch/mobile emulation).
- Local Playwright runs patch unsupported Unicode-regex bundles first; when managed Chromium assets are missing locally, the config falls back to installed Chrome and disables local failure-video capture. CI remains the authoritative environment for uploaded video artifacts.

## Local Commands
- `npm run test` runs `test:unit` and `test:integration`.
- `npm run version:sync` syncs the runtime/app badge version from `package.json`.
- `npm run test:runner` runs process-lifecycle regression tests with Node's test runner.
- `npm run test:unit` runs those lifecycle checks, then deterministic unit tests.
- `npm run test:integration` runs engine integration tests, including app bootstrap integrity assertions for Layers/Mathematical Model/About population.
- `npm run test:e2e` runs the complete Playwright spec roster in one invocation, including mask-shift-drag.
- `npm run test:visual` runs SVG baseline regression checks.
- `npm run test:visual:screenshots` runs optional Playwright screenshot snapshots.
- `npm run test:perf` runs stress/performance checks.
- `npm run test:ci` holds one queue slot for lifecycle checks, full-scope Vitest coverage (unit + integration + visual + perf + audit), the complete configured Playwright roster, and uninstrumented performance checks. Each correctness suite runs once; the saved `coverage/vitest-full.json` must pass strict inventory and skip reconciliation before browser/perf execute. Parsed timings persist in `coverage/full-profile.json`. The default local per-attempt deadline is 30 minutes; a measured two-worker full-coverage route took 39m40s, so do not assume an ordinary `test:ci` invocation completes that measured route. Performance also runs without coverage because instrumentation changes timing.
- `npm run test:fast` is an alias for bounded `test:feedback`; use `test:ci` for complete certification.
- `npm run test:feedback` runs critical contracts and one minimal real browser journey with a 60-second execution deadline. Queue wait is separate; timeout fails.
- `npm run test:lane -- <feedback|core|browser|audit|measure>` executes an explicit queued lane. Its execution deadline starts after lock acquisition; queue wait is recorded separately.
- `npm run test:route -- --base <sha> --head <sha> --json` previews versioned risk routing. Unknown/shared/harness paths select broad verification.
- `npm run test:lane:promote -- --head <sha> --ledger <jsonl>` validates shadow evidence before policy promotion.
- `npm run test:coverage` runs the whole Vitest suite, including `tests/audit/`, under V8 coverage with `VECTURA_TEST_COVERAGE=1` to disable compiled-script caching.
- `npm run test:audit` holds one queue slot for lifecycle checks, full coverage once, and the complete browser roster once.
- `npm run test:vitest -- <vitest args>` runs Vitest with any arguments (for example `npm run test:vitest -- run tests/unit/foo.test.js`).
- `npm run test:playwright -- <playwright test args>` runs `playwright test` with any arguments (for example `npm run test:playwright -- tests/e2e/foo.spec.js --reporter=line`).
- `npm run test:profile -- --results <vitest-json> --strict --output <summary-json>` reconciles full Vitest inventory/approved skips; add `--log <saved-log>` for console timings. Diagnostic profiling without strict mode can inspect partial/historical runs.
- `npm run test:coverage:probe` runs the bounded three-file/two-source coverage merge feasibility check through the real pilot config, sequencer, queued shard/merge entrypoints and provenance validator; CI runs it after hosted feedback. It does not certify full coverage or change production inventory/thresholds, and its separate step is outside feedback-lane timing metrics.
- `npm run test:engine:pilot -- --roster all --pool both --workers 1 --repetitions 5 --warmups 1` compares compatible pool candidates on fixed small rosters within a ten-minute budget. All trials retain queue/supervisor ownership.
- `test:coverage:shard` and `test:coverage:merge` are queued building blocks for full-scope sharding. Shards zero thresholds and the canonical merged report applies global ratchets; the bounded plumbing probe also uses zero thresholds on its three-file merge and does not certify full coverage.
- PR #97 proposes conditional two-shard full-Vitest coverage on PRs and pushes to main. A plan/guard records the exact SHA and timestamp and creates two disjoint duration-weighted partitions. The canonical required coverage job always runs for those events and fails closed if planning, either shard, provenance, or merge validation fails. Shards must come from the same run and SHA; each assigned roster is checked before upload, and the merged JSON is then reconciled against the strict all-file inventory and 57-skip baseline before the run is accepted. V8 data is merged and canonical global ratchets are applied (statements 74%, branches 62%, functions 74%, lines 76%). Main remains unsharded until the rollout's hosted CI, review, and screen pass; the PR graph itself is the validation trial. Nightly schedule runs the dedicated audit, then separate visual and uninstrumented performance suites, without duplicating the PR/main coverage graph. Keep lifecycle, bounded feedback, browser roster, uninstrumented perf, feedback probe, and lane-gate checks as distinct preserved guarantees.
- The measured full local coverage route took 39m40s using two workers. This is evidence about that route, not a claim that default `npm run test:ci` completes under its 30-minute attempt cap. Local fast/queue defaults and coverage worker policy remain unchanged.
- `npm run test:queue:status` shows the shared test-lock holder and the waiting runs.
- `npm run hooks:install` installs the local git hooks. **Run this once after cloning.**
  - `pre-commit` — refreshes the graphify knowledge graph and stages output.
  - `pre-push` — runs `test:feedback` (bounded feedback through the shared test queue) before every push. A minimal browser journey runs locally; the full browser roster remains in CI. Bypass with `SKIP_PREPUSH=1 git push` (CI still gates). When an Intel (x86_64) git runs the hook under Rosetta on an Apple-silicon Mac, the hook re-enters native arm64 for the lane; under Rosetta, Playwright's Chromium starts as x64 and the browser journey hangs.

## Shared Local Test Queue
Several worktrees and agent sessions run tests on the same machine. Concurrent Vitest and
Playwright runs starve each other (vitest birpc RPC timeouts, load-flaky perf checks) and
compete for the Playwright web-server port. `scripts/test-queue.js` makes sure that only one
heavy test command runs at a time.

**Rule:** run tests only through the `npm run test:*` entrypoints above. Do not run
`npx vitest`, `npx playwright test`, or `node_modules/.bin/{vitest,playwright}` directly; that
bypasses the queue. Environment-variable prefixes still work
(`VECTURA_PRE_X=1 npm run test:vitest -- run tests/unit/x.test.js`).

How it works:
- **One lock for the machine.** The lock dir is `$VECTURA_TEST_QUEUE_DIR`, else
  `${XDG_CACHE_HOME:-~/.cache}/vectura-studio/test-queue`. It is outside every worktree, so all
  clones, worktrees, and sessions share it.
- **Atomic acquisition.** The owner record is written to a temp file and hard-linked to
  `lock.json`. The link fails if a lock exists, and a reader never sees a partial record.
- **Owner identity.** The record holds the PID, the process start time (`ps -o lstart`, UTC),
  the host, the working directory, the command, and a random token.
- **Waiting.** Waiters take a FIFO ticket in `queue/`. A waiting run prints the holder (PID,
  age, working directory, command), its queue position, and a reminder every 30 s.
- **Stale-lock recovery.** A lock is stale only when its PID is gone, is a zombie, or belongs to
  a process with a different start time (PID reuse). A PID alone never identifies the owner.
  If liveness cannot be verified (no `ps`), the lock is not taken. The recorded host is for
  display only, because a macOS hostname changes with the network. One waiter
  claims the stale lock exclusively (`reap/<token>`), terminates the dead run's recorded
  subprocesses, and then removes the lock.
- **Subprocess ownership.** The holder records every descendant of the test command (PID and
  start time) in `procs/<token>.json`. When the command ends, leftover subprocesses get 3 s to
  exit, then SIGTERM, then SIGKILL. The lock is released only after that. If the holder is
  SIGKILLed, the next waiter terminates the recorded orphans before it starts.
- **Cancellation.** Ctrl-C or SIGTERM on a holder forwards the signal to the command, waits up
  to 10 s, then force-kills the subprocess tree and releases the lock (exit code 130/143). A
  second Ctrl-C (at least 1 s later) kills at once. A cancelled waiter removes its ticket.
- **Nested commands.** The holder exports `VECTURA_TEST_QUEUE_TOKEN` to its command. A nested
  queued call (for example `test:ci` → `npm run test:unit`) with a token that matches the live
  lock runs directly. A nested call that lost the token, but whose ancestor holds the lock, also
  runs directly. Aggregates therefore hold the lock once for the whole chain and cannot
  deadlock. If the token's lock belongs to a dead run (the aggregate was killed), the nested
  step exits with code 1 instead of continuing as an orphan.
- **Extra arguments.** Arguments after `--` (`npm run test:e2e -- --grep "two words"`) reach
  the command as literal words, also for the `--shell` aggregates.
- **CI is unchanged.** When `CI` is set, the wrapper runs the command directly, with no lock.
- **Emergency bypass.** `VECTURA_TEST_QUEUE_DISABLE=1` runs without the lock. Use it only when
  the queue itself is broken, never to skip a wait.

Tuning variables (milliseconds; used mainly by `tests/unit/test-queue.test.js`):
`VECTURA_TEST_QUEUE_POLL_MS` (1000), `_STATUS_MS` (30000), `_TRACK_MS` (1000),
`_KILL_GRACE_MS` (10000), `_LINGER_MS` (3000), `_TERM_GRACE_MS` (3000),
`_CORRUPT_GRACE_MS` (10000).

## Vitest process cleanup

Use the npm test scripts or `npm run test:vitest -- run <test-path>`, rather than
invoking `npx vitest` directly. Unit, integration, visual, perf, coverage, and baseline
update commands use the supervised wrapper inside the shared queue. Playwright retains
the queue's process tracking. The Vitest deadline starts after queue acquisition;
waiting for another run does not consume it.

Each attempt has a 30-minute local wall-clock deadline (three hours when `CI` is set), independent of model tokens or
Vitest's per-test timers. Override it with a positive integer in milliseconds, e.g.
`VECTURA_TEST_TIMEOUT_MS=3600000 npm run test:coverage`. Zero, malformed values, and
values above 2147483647 are rejected. The deadline restarts
for the existing single RPC-timeout retry. CI gets a longer default because the last
successful coverage job took 102 minutes (unit tests took 42 minutes). Timeout exits 124; SIGINT/SIGTERM/SIGHUP
exit 130/143/129. Cancellation, signals, deadline, spawn, and cleanup failures cannot
enter the RPC-timeout tolerance path.

The wrapper launches the local Vitest entrypoint directly with the current Node
executable. A detached supervisor owns a separate Vitest process group. On runner
exit (including success), wrapper cancellation, or wrapper death/IPC disconnect,
it sends SIGTERM to that group, waits up to two seconds, then sends SIGKILL to
survivors and verifies group exit. Cleanup completes before any retry. It never
scans for or kills processes by name, and does not signal other test runs.

This uses POSIX process groups (macOS/Linux); native Windows runs fail with a WSL
instruction. Killing the supervisor itself with SIGKILL, deliberately escaping the
owned process group, or an OS-level uninterruptible process is outside this guarantee.
A model usage pause is not process death: tests may finish normally, with the deadline
bounding a stalled run. Existing worktrees need this implementation before their test
runs gain protection. Already-running jobs are not adopted.

Run `npm run test:runner` to exercise real child processes: success/failure cleanup,
stubborn descendants, SIGINT/SIGTERM/SIGHUP, wrapper SIGKILL, deadlines, spawn failure,
unrelated-process isolation, and retry-policy preservation. These checks run before
unit tests inside the same queue slot, and are also explicitly included in the feedback lane.
The lightweight standalone `test:runner` checks do not acquire the machine-wide lock.

## Visual Baselines
- Canonical SVG baselines are stored in `tests/baselines/svg`.
- Update baselines with:
  - `npm run test:update`
- Baselines should only be updated intentionally when output changes are expected.

## CI Policy
- `.github/workflows/test.yml` enforces:
  - Pull requests and `main`: full-scope `test:coverage` owns all Vitest correctness; historical unit/integration/visual check names depend on its success. `test:e2e`, uninstrumented `test:perf`, and lifecycle plus bounded feedback remain distinct executions. Coverage inventory reconciliation is a required check; a missing file is not a pass.
  - Nightly schedule: visual/perf plus a complete audit/coverage run.
- `.github/workflows/dependency-review.yml` reviews dependency diffs on pull requests.
- `.github/workflows/codeql.yml` runs GitHub code scanning on `main`, pull requests to `main`, and a weekly schedule.
- Playwright artifacts are uploaded from CI on every `e2e-smoke` run.

## Acceleration rollout

Full Vitest scope, browser scope and the coverage ratchet remain during shadow evaluation. Phase two deduplicates execution: unit/integration/visual check names are coverage-dependent compatibility aliases, not independent suite runs.
Routing/feedback and current-revision roster validation add evidence; passing focused checks alone
does not promote a change. See [the acceleration contract](test-suite-acceleration.md) for the
under-one-minute local and initial ordinary PR targets, promotion evidence, and audit
failure policy. Phase-two full-PR checkpoints and evidence are tracked in `test-suite-phase2.md`; these are targets, not observed hosted speedups.

Use `core`/`feature` loader profiles for explicit pure IIFE dependencies, `component` for minimal
DOM markup and explicit scripts, and legacy/full profiles for app-shell checks. Each runtime is
fresh and must be closed. Keep exhaustive geometry/history/mutation matrices in `tests/audit/`;
retain routine guards for shipped failure mechanisms and verify their defect sensitivity.

## Writing New Tests
- Prefer deterministic seeds and explicit parameter overrides.
- Keep baseline scenarios small enough for fast CI but representative enough to catch regressions.
- For visual coverage, prefer SVG output checks; use screenshot snapshots only when SVG baselines cannot capture the regression.

The critical feedback roster is `tests/helpers/feedback-roster.json`. It includes live seed-zero, state/export, preset/default-origin, mask/undo, curved/faceted, compact ribbon placement/width, and import-sanitization checks. Known-fault seed/ribbon witnesses execute fresh isolated source variants; exhaustive ribbon proofs remain in broad verification. Runtime budgets fail visibly when exceeded. Conservative broad-job deadlines remain until completed measurements support lowering them.
