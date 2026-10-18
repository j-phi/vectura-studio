#!/usr/bin/env node
// PR browser smoke (CI job `e2e-smoke`). Two Playwright runs, one after the other:
//   1. every non-touch PR project (desktop, tablet-touch, iPhone mini) on its own roster;
//   2. the touch smoke: harness, journeys and the fast target-audit subset on one Chromium and
//      one WebKit touch project.
// The full touch roster (all 11 projects, every touch spec) runs nightly as a sharded matrix
// (`touch-e2e-nightly` in .github/workflows/test.yml). Extra arguments pass to both runs.
// desktop-visual-chromium (pixel snapshots) is not in the PR smoke: its linux baselines are made in
// the pinned Playwright image, so it runs in that image in the `visual-nightly` job (R-38), and
// locally through scripts/test-update-visual-linux.sh. The nightly reuses this PR smoke (R-19).
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const DESKTOP_PROJECTS = ['desktop-chromium', 'tablet-touch-chromium', 'phone-iphone-mini-chromium'];
const NIGHTLY_ONLY_PROJECTS = ['desktop-visual-chromium'];
// One JSON report per run (CI reporter, see playwright.config.js), read by playwright-flaky.js.
const JSON_REPORTS = ['playwright-json/smoke-desktop.json', 'playwright-json/smoke-touch.json'];
const TOUCH_SMOKE_PROJECTS = ['touch-iphone-portrait', 'webkit-ipad-portrait'];
const TOUCH_SMOKE_SPECS = [
  'tests/e2e/touch/harness.spec.js',
  'tests/e2e/touch/journeys.spec.js',
  'tests/e2e/touch/target-audit.spec.js',
];

// A CLI --reporter replaces the config reporters, so CI asks for json here as well. The json
// reporter writes to PLAYWRIGHT_JSON_OUTPUT_FILE, which main() sets for each run.
const reporter = (ci = !!process.env.CI) => (ci ? '--reporter=line,json' : '--reporter=line');
const runs = (extra = [], ci = !!process.env.CI) => [
  ['playwright', 'test', 'tests/e2e', ...DESKTOP_PROJECTS.map((p) => `--project=${p}`), reporter(ci), ...extra],
  ['playwright', 'test', ...TOUCH_SMOKE_SPECS, ...TOUCH_SMOKE_PROJECTS.map((p) => `--project=${p}`), reporter(ci), ...extra],
];

function main() {
  const extra = process.argv.slice(2);
  let status = 0;
  for (const [index, args] of runs(extra).entries()) {
    // The fast audit subset is the default: never inherit a full-audit request into the PR smoke.
    const env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: JSON_REPORTS[index] };
    delete env.TOUCH_AUDIT_FULL;
    const r = spawnSync('npx', args, { stdio: 'inherit', env, cwd: path.resolve(__dirname, '..') });
    const code = r.status === null ? 1 : r.status;
    if (code !== 0) status = code;
  }
  process.exit(status);
}

if (require.main === module) main();

module.exports = { DESKTOP_PROJECTS, NIGHTLY_ONLY_PROJECTS, JSON_REPORTS, TOUCH_SMOKE_PROJECTS, TOUCH_SMOKE_SPECS, runs };
