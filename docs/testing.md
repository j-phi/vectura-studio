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
- `npm run test:runner` runs process-lifecycle regression tests with Node's test runner.
- `npm run test:unit` runs those lifecycle checks, then deterministic unit tests.
- `npm run test:integration` runs engine integration tests, including app bootstrap integrity assertions for Layers/Mathematical Model/About population.
- `npm run test:e2e` runs Playwright smoke tests.
- `npm run test:visual` runs SVG baseline regression checks.
- `npm run test:visual:screenshots` runs optional Playwright screenshot snapshots.
- `npm run test:perf` runs stress/performance checks.
- `npm run test:ci` runs the PR-gating test suite (unit + integration + e2e + visual + perf).
- `npm run test:fast` runs the e2e-free subset (~12s — unit + integration + visual + perf) used by the pre-push hook.
- `npm run hooks:install` installs the local git hooks. **Run this once after cloning.**
  - `pre-commit` — refreshes the graphify knowledge graph and stages output.
  - `pre-push` — runs `test:fast` (~12s) before every push. E2E is intentionally gated only by CI to avoid local slowdowns on busy machines. Bypass with `SKIP_PREPUSH=1 git push` (CI still gates).

## Vitest process cleanup

Use the npm test scripts or `node scripts/run-vitest.js run <test-path>`, rather than
invoking `npx vitest` directly. Unit, integration, visual, perf, coverage, and baseline
update commands use the supervised wrapper. Playwright is unchanged; there is no shared queue.

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
unit tests, so they are included in `test:fast` and `test:ci`.

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
