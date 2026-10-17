#!/usr/bin/env node
// PR browser smoke (CI job `e2e-smoke`). Two Playwright runs, one after the other:
//   1. every non-touch project (desktop, desktop-visual, tablet-touch, iPhone mini) on its own roster;
//   2. the touch smoke: harness, journeys and the fast target-audit subset on one Chromium and
//      one WebKit touch project.
// The full touch roster (all 11 projects, every touch spec) runs nightly as a sharded matrix
// (`touch-e2e-nightly` in .github/workflows/test.yml). Extra arguments pass to both runs.
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const DESKTOP_PROJECTS = ['desktop-chromium', 'desktop-visual-chromium', 'tablet-touch-chromium', 'phone-iphone-mini-chromium'];
const TOUCH_SMOKE_PROJECTS = ['touch-iphone-portrait', 'webkit-ipad-portrait'];
const TOUCH_SMOKE_SPECS = [
  'tests/e2e/touch/harness.spec.js',
  'tests/e2e/touch/journeys.spec.js',
  'tests/e2e/touch/target-audit.spec.js',
];

const runs = (extra = []) => [
  ['playwright', 'test', 'tests/e2e', ...DESKTOP_PROJECTS.map((p) => `--project=${p}`), '--reporter=line', ...extra],
  ['playwright', 'test', ...TOUCH_SMOKE_SPECS, ...TOUCH_SMOKE_PROJECTS.map((p) => `--project=${p}`), '--reporter=line', ...extra],
];

function main() {
  const extra = process.argv.slice(2);
  let status = 0;
  for (const args of runs(extra)) {
    // The fast audit subset is the default: never inherit a full-audit request into the PR smoke.
    const env = { ...process.env };
    delete env.TOUCH_AUDIT_FULL;
    const r = spawnSync('npx', args, { stdio: 'inherit', env, cwd: path.resolve(__dirname, '..') });
    const code = r.status === null ? 1 : r.status;
    if (code !== 0) status = code;
  }
  process.exit(status);
}

if (require.main === module) main();

module.exports = { DESKTOP_PROJECTS, TOUCH_SMOKE_PROJECTS, TOUCH_SMOKE_SPECS, runs };
