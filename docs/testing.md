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
- `npm run test:e2e` runs the complete Playwright spec roster in one invocation, including mask-shift-drag. The roster includes the 11 touch projects.
- `npm run test:e2e:touch` runs every touch project (11) against `tests/e2e/touch`.
- `npm run test:e2e:touch:chromium` runs the 7 `touch-*` projects. `npm run test:e2e:touch:webkit` runs the 4 `webkit-*` projects.
- `npm run test:e2e:touch:install` installs the Playwright Chromium and WebKit browsers.
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

## Touch Projects (TUX-057 / TUX-061)
Finger-only simulated devices. Viewports live in `tests/e2e/touch/viewports.js` (one source of truth, `docs/touch-ux-requirements.md` section 1.2). Specs match `tests/e2e/touch/*.spec.js`. Every project sets `hasTouch`, `isMobile`, the device DPR and an iOS Safari user agent.

| Engine | Projects |
|---|---|
| Chromium (7) | `touch-ipad-portrait`, `touch-ipad-landscape`, `touch-iphone-portrait`, `touch-iphone-landscape`, `touch-iphone-portrait-chrome`, `touch-iphone-landscape-chrome`, `touch-coarse-wide` |
| WebKit (4) | `webkit-ipad-portrait`, `webkit-ipad-landscape`, `webkit-iphone-portrait`, `webkit-iphone-landscape` |

Older projects stay: `tablet-touch-chromium` (834x1194, smoke) and `phone-iphone-mini-chromium` (375x812).

- `PW_PORT` sets the dev-server port (default 4173). Set it per worktree: `PW_PORT=4611 npm run test:e2e`. Without it, parallel worktrees can attach to another tree's server.
- Install browsers once with `npm run test:e2e:touch:install`.
- Helpers: `tests/e2e/helpers/touch.js` exports `tap`, `longPress`, `drag`, `pinch`, `twoFingerPan`, `canvasShare`, `hitArea`, `touchPhase`, `engineOf`, `engineSupports`. They never emit mouse events.
  - Chromium uses CDP `Input.dispatchTouchEvent` (trusted). In CDP, `touchEnd`/`touchCancel` `touchPoints` list the fingers being lifted. `touchPhase('end', subset)` lifts only that subset.
  - WebKit uses synthetic in-page Pointer and Touch events. It builds touches with `document.createTouch` (`new Touch()` throws Illegal constructor in WebKit). It shims `setPointerCapture`, `releasePointerCapture` and `hasPointerCapture` for the synthetic pointer ids (100 + finger) and routes later events to the capture target.
  - `hitArea` probes a grid (2 px pitch, 48 px radius), flood-fills the owned cells around the centre, and returns the bounding `{w, h}`. `::before` extensions count.
- `engineSupports(page, capability)` guards engine-dependent assertions. Never use `test.skip` for WebKit.

| Capability | Chromium | WebKit | Meaning |
|---|---|---|---|
| `trustedMultiTouch` | true | false | Events are trusted. Guard page zoom and native pinch assertions. |
| `maxTouchPoints` | true | false | `navigator.maxTouchPoints > 0`. Desktop WebKit reports 0. |
| `nativeDefaultActions` | true | false | Browser default actions of one-finger gestures run. In WebKit a synthetic drag does not move a range input, scroll a container, or synthesize a click. Guard slider, scroll and click-from-touch REDs. |
| `cdp` | true | false | Internal: helper uses CDP. |

Approved deviations:
- Viewport proof runs on a neutral `data:` page. The app overflows horizontally on mobile, so `innerWidth` differs (Chromium iPhP 544 vs WebKit 402). REDs that measure overflow must assert `scrollWidth`, not `innerWidth`.
- Desktop WebKit reports `maxTouchPoints` 0 with `hasTouch`. The harness checks `maxTouchPoints > 0` only where `engineSupports('maxTouchPoints')`.

WebKit simulation does not prove (these belong to the real-device run, requirements section 4.2):
- iOS dynamic toolbar and `100dvh` behaviour.
- The soft keyboard.
- The Files picker and downloads.
- System callouts (text selection, image and link menus).
- `contextmenu` and `dblclick` synthesis from real touches.
- Trusted multi-touch (native pinch zoom and scroll).
- Native one-finger default actions (tap to click, container scroll, range drag) — Blink-only proof.
- Real performance (GPU, memory, frame rate).

The real-device run and the release gate are in `docs/touch-audit/device-checklist.md`. `tests/unit/touch-device-checklist.test.js` checks that file.

## Touch Target Audit Ratchet (TUX-058)
`tests/e2e/touch/target-audit.spec.js` measures touch targets and layout in every touch project and compares them to `tests/e2e/touch/target-baseline.json`. The baseline only goes down.

Files:
- `tests/e2e/helpers/target-audit-core.js` is the one measurement core. `touch.js` (`hitArea`, `canvasShare`), the spec and the CLI use it.
- `tests/e2e/touch/target-audit-states.js` holds the 26 state openers and their postconditions. Product lanes that rename DOM ids edit the opener in the same commit.
- `tests/e2e/touch/target-allowlist.json` is an array of `{ selector, reason, project? }`. It holds at most 10 entries. An allowlisted target is excluded from `under44` only. Its probed size must stay at least 24 x 24.
- `docs/touch-audit/scripts/target-audit.js` is a thin CLI over the core. `--engine chromium|webkit`, `--port`, `--only`, `--states`, `--no-shots`.

Commands:

| Command | Purpose |
|---|---|
| `npm run test:e2e:touch:audit` | Fast subset (9 states) in the 11 touch projects. Also part of `test:e2e:touch`. |
| `npm run test:e2e:touch:audit:full` | All 26 states (`TOUCH_AUDIT_FULL=1`). Runs nightly in CI (`touch-audit-nightly`). |
| `TOUCH_BASELINE=update npm run test:e2e:touch:audit:full` | Lower the baseline. Never worsens a cell. |
| `TOUCH_TARGET_MODE=final npm run test:e2e:touch:audit` | Compare to the final targets. Not enabled in CI. |

Metrics (per project and state):

| Metric | Direction | Ratchet tolerance | Final value |
|---|---|---|---|
| `hOverflow`, `vOverflow` | lower | exact | 0 |
| `innerWidthExcess` | lower | exact | 0 |
| `under44` (probed, not allowlisted) | lower | exact | 0 |
| `under24` | lower | exact | 0 |
| `wcag258Fail` | lower | exact | 0 |
| `iosZoom` | lower | exact | 0 |
| `covered` | lower | exact | 0 in `default` |
| `safeUnprotected` | lower | exact | 0 |
| `ghost` | lower | exact | 0 |
| `stranded` | lower | exact | 0 |
| `reachable` | higher | exact | none (floor only) |
| `pageErrors` | lower | exact | 0 |
| `canvasPct` | higher | +/-1.0 pp | iPadP 70; iPadL 45 (two docked panes) / 60 (one) / 75 (none); iPhP 60; iPhL 60; chrome variants 50 |
| `scaleOk` (`renderer.scale > 0`) | true is better | exact | true |

Definitions:
- The denominator is the project viewport from `viewports.js`, never `innerWidth`. `hOverflow = max(documentElement.scrollWidth, body.scrollWidth, innerWidth) - width`. Chromium grows `innerWidth` on iPhone portrait (`innerWidthExcess`). WebKit grows `scrollWidth`. Both count.
- Hit sizes are probed. The probe starts at the clipped-rect centre, uses a 2 px grid, flood-fills the cells the target owns (itself, a descendant, or its LABEL), and caps at 24 px each side. Every reachable target is probed, including targets with a rect of 44 x 44 or more, because partial occlusion reduces the hit area. Cost stays bounded: the probe stops at 44 px, and a 9-sample check skips the flood when a 44 px square is fully owned. The span is conservative (owned pixels, never a +1 cell): a 43 x 43 target reports under 44 and a 23 x 23 target reports under 24. Synthetic-fixture tests: `tests/e2e/touch/target-audit-probe.spec.js`.
- Size metrics (`under44`, `under24`, `wcag258Fail`, `iosZoom`) count reachable targets only. A covered target counts in `covered`.
- `canvasPct` is the exact visible canvas area: the canvas rect clipped to the viewport, minus the exact union of every covering rect (a coordinate-compressed lattice hit-tested once per cell; no sample grid). A hit is the canvas, a descendant or `#viewport-container`. `canvasGridPct` keeps the old 48 x 48 grid reading for comparison only; it read up to 2.6 pp high.
- `ghost` counts invisible (opacity 0) targets that still receive the hit test. The `right-pane-layers` state holds two layers so an inactive row exposes `.lvl-acts` (IPAD-004).
- `stranded` ignores closed-by-design content: a zero-size clip box (collapsed disclosure) or an `aria-hidden` or `inert` subtree. It counts rendered targets (not `display:none`, not `visibility:hidden`, rect over 1 x 1) whose clipped rect is empty and that nothing can bring into view. A target counts as brought into view when a scrollable on-screen ancestor (overflow `auto` or `scroll`) holds it, or when it lies inside the layout viewport (`innerWidth` x `innerHeight`, which pans on a mobile UA), or inside the root scroll extent when the root can scroll that axis. Targets inside a parked drawer (an absolute or fixed ancestor fully off-canvas, such as a closed pane) are not counted: a separate state opens them. This closes the clipping hole. Hiding the overflow (`html,body{overflow-x:hidden} #app-header{overflow:hidden}`) sets `hOverflow`, `vOverflow` and `innerWidthExcess` to 0 on Chromium iPhone portrait but strands Insert and Help, so `stranded` rises and the run fails.
- `reachable` counts on-screen targets that pass the hit test. It is higher-better with tolerance 0. Removing or hiding controls (for example `#touch-modifier-bar,.toolbar-footer{display:none}`) lowers every `under*` count and raises `canvasPct`, but `reachable` falls, so the run fails. WebKit iPhone portrait already strands Insert and Help (body `overflow:hidden` keeps the 544 px scroll width unreachable): that is a real finding, recorded in the baseline.
- Regression fixtures for both guards: `tests/e2e/touch/target-audit-guards.spec.js` injects the CSS hacks into the live app and asserts `compareCell` reports `worse`. The comparator directions are proved in `tests/unit/touch-target-ratchet.test.js`.
- Item selectors are unique. `cssPath` adds `:nth-of-type` for same-tag siblings and grows to the full chain until the selector matches one element. The audit fails when an allowlist selector matches more than one element in any measured state, and the allowlist test asserts the same in every project. One entry cannot exempt siblings and bypass the 10-entry cap.
- `pageErrors` counts uncaught page errors and app exceptions the openers caught (`window.__auditErrors`). ResizeObserver loop notices are not counted: WebKit raises them at frame-timing-dependent rates.
- `safeUnprotected` follows `var(--name)` when the custom property holds `env(safe-area-inset-<side>)`.
- The `-chrome` projects run the `default` state only. They gate `canvasPct`, `hOverflow` and `innerWidthExcess`.

Per-state hard failures (every mode): an opener throws, a postcondition times out (10 s), the on-screen item count is below `minItems`, fonts fail to load. `pageErrors` is a ratcheted metric: in ratchet mode a rise fails and a nonzero baseline cell passes. In final mode it must be 0.

The audit spec runs with no retries (`test.describe.configure({ retries: 0 })` and `--retries=0` in `scripts/run-touch-audit.js`), so a flapping count fails instead of passing on a retry.

Update mode:
- `TOUCH_BASELINE=update` writes the better of the old and the new value for every metric. It never worsens a cell. A cell that got worse still fails the test.
- `TOUCH_BASELINE=update-any` writes the measured values as they are. The commit body must contain a `TUX-WAIVER:` line that names the cell and the reason.
- Removing or hiding controls is a regression. The `reachable` count drops, and only `TOUCH_BASELINE=update-any` plus a `TUX-WAIVER:` line can lower it in the baseline. The same applies to a rise in `stranded`. A product lane that moves controls into a menu (TUX-001) reaches the controls through the new menu and lists the waiver for the cells where the count drops.
- Keys are sorted. Each `project|state` cell is one line, so merge conflicts stay local. The write is atomic (lock, fresh read, temp file, rename).
- Baseline conflicts: regenerate on the merged tree. Never merge numbers by hand.
- The baseline is keyed `baseline[platform][project][state]`. Platform is `darwin` or `linux`. A missing `linux` section is a soft state (annotation `baseline-missing`) so the first Linux CI run can seed it. A missing `darwin` cell on macOS fails.
- Seed `linux` from the CI or nightly artifact `test-results/touch-target-measured-<project>.json`.

Branch rules: this ratchet merges before any product lane. After each lane merge the integrator re-runs `TOUCH_BASELINE=update` on the merged tree and commits the lowered cells. A product lane merges `touch/integration` into its branch before its ratchet check. It lowers cells only through `TOUCH_BASELINE=update`.

Unit proof: `tests/unit/touch-target-ratchet.test.js` tests the comparator, the update merge, the final targets and the serializer.

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

## Finger-only Journey Specs and the Step-pinned Ledger (TUX-059)
`tests/e2e/touch/journeys.spec.js` scripts the 12 core journeys (J1-J12) with finger input only. The step table is `docs/touch-audit/journey-scripts.md`. The code is `tests/e2e/touch/journey-defs.js` (steps) and `tests/e2e/touch/pages.js` (page objects and guards). It runs in the 8 primary projects (96 cells). The `-chrome` and `touch-coarse-wide` projects run the same steps as informational measurements and never fail.

- Every touch goes through a guarded primitive (`fingerTap`, `fingerDoubleTap`, `fingerLongPress`, `fingerDrag`, `fingerPinch`, `fingerPan`). The guard asserts, before the touch: the centre is inside the DEVICE screen (constants from `viewports.js`, never `innerWidth`), `elementFromPoint` returns the target or a descendant, and the target is visible.
- After every step the runner asserts the layerCount, historyLen, redoLen and selectedIds deltas, `renderer.scale > 0`, no page errors, and the shell invariants (no scroll, no pan, no page zoom). `readState` is the only state read.
- `tests/e2e/touch/journeys-static.spec.js` scans the three files as text and fails on `.click()`, `.fill()`, `page.mouse`, `keyboard.type`, `dispatchEvent`, `scrollIntoView`, `.skip`, `.only`, `selectOption` outside `pickOption`, `insertText` outside `softType`, and `evaluate` outside the allowlisted state helpers. It also compares the step ids in the doc with the code.
- The ledger `tests/e2e/touch/journey-status.json` lists each failing cell as one line `{project, journey, failsAt, reason}`. A cell passes only when it fails at exactly `failsAt`. A different failing step fails the run ("failure moved from X to Y"). A passing cell with an entry fails ("unexpectedly passed: remove ledger entry"). This replaces the plain `test.fail()` of requirement TUX-059 item 3: a plain expected failure would hide a cell that regresses to an earlier step.
- Regenerate the ledger by measurement, never by hand: `npm run test:e2e:touch:journeys:ledger`. It runs the 8 primary projects with `JOURNEY_LEDGER_WRITE=1` and merges `test-results/journey-ledger/*.json` into the ledger (`tests/e2e/touch/merge-ledger.js`). Run it after every lane merge into the integration branch, and commit the diff. A lane that flips a cell removes or moves the entry in its own commit.
- Debug knobs (never set in CI): `JOURNEY_RELAX=id,id`, `JOURNEY_CONTINUE=1`, `JOURNEY_SHOTS_DIR=<dir>` (screenshot of each failing step).
- The WebKit slider and scroll steps fail honestly at the step: a synthetic one-finger drag does not move a range input or scroll a container (`nativeDefaultActions` false). No engine guard exists in a journey step.
- WebKit-desktop does not inflate the layout viewport (iPhP: innerWidth 402, phone-layout true; Chromium: 544, no phone-layout), so a WebKit iPhone PASS does not prove TUX-001. The Chromium twin plus the device-constant on-screen guard do.
- Heavy fixture: `tests/fixtures/touch/journey-heavy.vectura` (Flowfield at 3x density plus Attractor). Each layer tap blocks the main thread for 100 ms or more (1-2 s in Chromium device emulation). Both engines load it for J2. JRN-010 was a clock defect, fixed by TUX-038 req 5 (the rename reads `event.timeStamp`). The Chromium double-tap therefore carries hardware touch times through CDP (`helpers/touch.js` `doubleTap`): CDP waits for the page to handle the first tap before it sends the second, so without the stamp a busy main thread reads as two slow taps that no real finger makes. WebKit cannot stamp a trusted touch; it runs the document about 20x faster, so its tap round trip stays inside the 350 ms window. J2 rename-open passes when the input shows within 6 s; the latency is not bounded, because it measures machine load, not the double-tap contract. The light fixture is `journey-basic.vectura`. `journey-heavy-webkit.vectura` is no longer loaded.
- Budgets: `boot` (page load, app init, fixture load) has its own 45 s budget. Each later step has 5 s (J2: 20 s, because every step on a heavy document is slow by design). The benign `ResizeObserver loop completed with undelivered notifications` page error is noise and never pins a cell.
- Guards: `fingerDrag`, `fingerPinch` and `fingerPan` also check that the end points lie on the device screen (self-test (v)). The object-move steps (`j3.move`, `j4.move`, `j4.undo`, `j4.redo`) assert WORLD movement of the object with `renderer.offsetX/offsetY` unchanged (self-test (vi)). A one-finger drag that only pans the view fails them.
- Runtime: the journeys spec takes about 8.5 minutes over all 11 projects with 2 workers on a shared machine. TUX-061 requires every touch spec in every WebKit project, so no PR subset exists. Escalate to Jay before adding one.
