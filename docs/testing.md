# Testing Guide

Workflow governance and documentation synchronization rules live in `docs/agentic-harness-strategy.md`.

## Toolchain
- Node 20.19 or newer is required.
- Unit/Integration/Visual/Perf: Vitest 4 (`vitest.config.mjs`); keep `vitest` and
  `@vitest/coverage-v8` on matching versions. Worker limits use Vitest 4's top-level
  `maxWorkers` option with the `forks` pool.
- E2E smoke: Playwright (`playwright.config.js`)
- Runtime loader for browser IIFE modules: `tests/helpers/load-vectura-runtime.js`
- E2E smoke projects run on Chromium for both desktop and touch-tablet coverage (tablet uses touch/mobile emulation).
- Local Playwright runs patch unsupported Unicode-regex bundles first; when managed Chromium assets are missing locally, the config falls back to installed Chrome and disables local failure-video capture. CI remains the authoritative environment for uploaded video artifacts.

## Local Commands
- `npm run test` runs `test:unit` and `test:integration`.
- `npm run version:sync` syncs the runtime/app badge version from `package.json`.
- `npm run test:unit` runs deterministic unit tests.
- `npm run test:integration` runs engine integration tests, including app bootstrap integrity assertions for Layers/Mathematical Model/About population.
- `npm run test:e2e` runs Playwright smoke tests.
- `npm run test:visual` runs SVG baseline regression checks.
- `npm run test:visual:screenshots` runs optional Playwright screenshot snapshots.
- `npm run test:perf` runs stress/performance checks.
- `npm run test:ci` runs the PR-gating test suite (unit + integration + e2e + visual + perf).
- `npm run test:fast` runs the e2e-free subset (~12s — unit + integration + visual + perf) used by the pre-push hook.
- `npm run test:coverage` runs the whole Vitest suite under V8 coverage.
- `npm run test:vitest -- <vitest args>` runs Vitest with any arguments (for example `npm run test:vitest -- run tests/unit/foo.test.js`).
- `npm run test:playwright -- <playwright test args>` runs `playwright test` with any arguments (for example `npm run test:playwright -- tests/e2e/foo.spec.js --reporter=line`).
- `npm run test:queue:status` shows the shared test-lock holder and the waiting runs.
- `npm run hooks:install` installs the local git hooks. **Run this once after cloning.**
  - `pre-commit` — refreshes the graphify knowledge graph and stages output.
  - `pre-push` — runs `test:fast` (~12s, through the shared test queue) before every push. E2E is intentionally gated only by CI to avoid local slowdowns on busy machines. Bypass with `SKIP_PREPUSH=1 git push` (CI still gates).

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

## Visual Baselines
- Canonical SVG baselines are stored in `tests/baselines/svg`.
- Update baselines with:
  - `npm run test:update`
- Baselines should only be updated intentionally when output changes are expected.

## CI Policy
- `.github/workflows/test.yml` enforces:
  - Pull requests and `main`: all five suites (`test:unit`, `test:integration`, `test:e2e`, `test:visual`, `test:perf`)
  - Nightly schedule: same
- `.github/workflows/dependency-review.yml` reviews dependency diffs on pull requests.
- `.github/workflows/codeql.yml` runs GitHub code scanning on `main`, pull requests to `main`, and a weekly schedule.
- Playwright artifacts are uploaded from CI on every `e2e-smoke` run.

## Writing New Tests
- Prefer deterministic seeds and explicit parameter overrides.
- Keep baseline scenarios small enough for fast CI but representative enough to catch regressions.
- For visual coverage, prefer SVG output checks; use screenshot snapshots only when SVG baselines cannot capture the regression.
