# Testing Guide

## Toolchain
- Unit/Integration/Visual/Perf: Vitest (`vitest.config.mjs`)
- E2E smoke: Playwright (`playwright.config.js`)
- Runtime loader for browser IIFE modules: `tests/helpers/load-vectura-runtime.js`
- E2E smoke projects run on Chromium for both desktop and touch-tablet coverage (tablet uses touch/mobile emulation).

## Local Commands
- `npm run test` runs `test:unit` and `test:integration`.
- `npm run test:unit` runs deterministic unit tests.
- `npm run test:integration` runs engine integration tests.
- `npm run test:e2e` runs Playwright smoke tests.
- `npm run test:visual` runs SVG baseline regression checks.
- `npm run test:visual:screenshots` runs optional Playwright screenshot snapshots.
- `npm run test:perf` runs stress/performance checks.
- `npm run test:ci` runs the PR-gating test suite.

## Visual Baselines
- Canonical SVG baselines are stored in `tests/baselines/svg`.
- Update baselines with:
  - `npm run test:update`
- Baselines should only be updated intentionally when output changes are expected.

## CI Policy
- `.github/workflows/test.yml` enforces:
  - Pull requests: `test:unit`, `test:integration`, `test:e2e`
  - `main` + nightly schedule: `test:visual`, `test:perf`
- Playwright artifacts are uploaded from CI on every `e2e-smoke` run.

## Writing New Tests
- Prefer deterministic seeds and explicit parameter overrides.
- Keep baseline scenarios small enough for fast CI but representative enough to catch regressions.
- For visual coverage, prefer SVG output checks; use screenshot snapshots only when SVG baselines cannot capture the regression.
