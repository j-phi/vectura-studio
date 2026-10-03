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
- `npm run test:e2e` runs Playwright smoke tests, then `test:e2e:touch`.
- `npm run test:e2e:touch` runs every touch project (11) against `tests/e2e/touch`.
- `npm run test:e2e:touch:chromium` runs the 7 `touch-*` projects. `npm run test:e2e:touch:webkit` runs the 4 `webkit-*` projects.
- `npm run test:e2e:touch:install` installs the Playwright Chromium and WebKit browsers.
- `npm run test:visual` runs SVG baseline regression checks.
- `npm run test:visual:screenshots` runs optional Playwright screenshot snapshots.
- `npm run test:perf` runs stress/performance checks.
- `npm run test:ci` runs the PR-gating test suite (unit + integration + e2e + visual + perf).
- `npm run test:fast` runs the e2e-free subset (~12s — unit + integration + visual + perf) used by the pre-push hook.
- `npm run hooks:install` installs the local git hooks. **Run this once after cloning.**
  - `pre-commit` — refreshes the graphify knowledge graph and stages output.
  - `pre-push` — runs `test:fast` (~12s) before every push. E2E is intentionally gated only by CI to avoid local slowdowns on busy machines. Bypass with `SKIP_PREPUSH=1 git push` (CI still gates).

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
- Real performance (GPU, memory, frame rate).

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
