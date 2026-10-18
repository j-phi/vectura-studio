#!/usr/bin/env node
// PR browser smoke (CI job `e2e-smoke`). Two Playwright runs:
//   desktop: every non-touch PR project (desktop, tablet-touch, iPhone mini);
//   touch:   the touch smoke: harness, journeys and the fast target-audit subset on one Chromium and
//            one WebKit touch project.
// Locally both runs go one after the other. CI runs them as a matrix (R-41): `--run=<name>` picks one
// run and `--shard=i/n` (passed through to Playwright) splits it. E2E_SMOKE_LEGS is that matrix;
// tests/unit/e2e-ci-roster.test.js checks that the workflow lists exactly these legs.
// The full touch roster (all 11 projects, every touch spec) runs nightly as a sharded matrix
// (`touch-e2e-nightly` in .github/workflows/test.yml). Extra arguments pass to every run.
// desktop-visual-chromium (pixel snapshots) is not in the PR smoke: its linux baselines are made in
// the pinned Playwright image, so it runs in that image in the `visual-nightly` job (R-38), and
// locally through scripts/test-update-visual-linux.sh. The nightly reuses this PR smoke (R-19).
// Record-only journey cells stay out of the PR smoke (R-41): while this platform has no TUX-059
// journey ledger for the smoke projects (linux until it is seeded), a journey cell can never fail
// (journeys.spec.js only annotates it), so the touch run drops the `finger-only journeys` cells. The
// harness self-tests in that file still run, and the nightly touch roster still records every cell.
// Once the linux ledger is committed the cells come back to the PR smoke on their own.
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const { readLedger } = require('../tests/e2e/touch/journey-ledger-file');

const DESKTOP_PROJECTS = ['desktop-chromium', 'tablet-touch-chromium', 'phone-iphone-mini-chromium'];
const NIGHTLY_ONLY_PROJECTS = ['desktop-visual-chromium'];
const RUN_NAMES = ['desktop', 'touch'];
// One JSON report per run (CI reporter, see playwright.config.js), read by playwright-flaky.js.
const JSON_REPORTS = ['playwright-json/smoke-desktop.json', 'playwright-json/smoke-touch.json'];
const TOUCH_SMOKE_PROJECTS = ['touch-iphone-portrait', 'webkit-ipad-portrait'];
const TOUCH_SMOKE_SPECS = [
  'tests/e2e/touch/harness.spec.js',
  'tests/e2e/touch/journeys.spec.js',
  'tests/e2e/touch/target-audit.spec.js',
];
// The CI matrix (R-41), one job per leg. Re-balance from the per-leg step times when a run grows.
const E2E_SMOKE_LEGS = [
  { run: 'desktop', shard: '1/3' },
  { run: 'desktop', shard: '2/3' },
  { run: 'desktop', shard: '3/3' },
  { run: 'touch', shard: '1/1' },
];

const JOURNEY_CELLS = 'finger-only journeys';
// True when the ledger for this platform pins at least one touch smoke project, so its cells gate.
const journeysGate = (ledger = readLedger()) => !!ledger && TOUCH_SMOKE_PROJECTS.some((p) => (ledger.projects || []).includes(p));

// A CLI --reporter replaces the config reporters, so CI asks for json here as well. The json
// reporter writes to PLAYWRIGHT_JSON_OUTPUT_FILE, which main() sets for each run.
const reporter = (ci = !!process.env.CI) => (ci ? '--reporter=line,json' : '--reporter=line');
const runs = (extra = [], ci = !!process.env.CI, gate = journeysGate()) => [
  ['playwright', 'test', 'tests/e2e', ...DESKTOP_PROJECTS.map((p) => `--project=${p}`), reporter(ci), ...extra],
  ['playwright', 'test', ...TOUCH_SMOKE_SPECS, ...TOUCH_SMOKE_PROJECTS.map((p) => `--project=${p}`), ...(gate ? [] : [`--grep-invert=${JOURNEY_CELLS}`]), reporter(ci), ...extra],
];

// Splits `--run=<name>` (repeatable) off the arguments. No --run means every run.
function parseArgs(argv) {
  const only = [];
  const extra = [];
  for (const a of argv) {
    const m = /^--run=(.*)$/.exec(a);
    if (!m) { extra.push(a); continue; }
    if (!RUN_NAMES.includes(m[1])) throw new Error(`run-e2e-smoke: unknown --run=${m[1]} (expected ${RUN_NAMES.join(' or ')})`);
    only.push(m[1]);
  }
  return { only: only.length ? only : RUN_NAMES, extra };
}

function main() {
  const { only, extra } = parseArgs(process.argv.slice(2));
  let status = 0;
  if (only.includes('touch') && !journeysGate()) {
    console.log(`run-e2e-smoke: no ${process.platform} journey ledger pins ${TOUCH_SMOKE_PROJECTS.join(', ')}; the record-only "${JOURNEY_CELLS}" cells run nightly only`);
  }
  for (const [index, args] of runs(extra).entries()) {
    if (!only.includes(RUN_NAMES[index])) continue;
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

module.exports = { DESKTOP_PROJECTS, NIGHTLY_ONLY_PROJECTS, RUN_NAMES, JSON_REPORTS, TOUCH_SMOKE_PROJECTS, TOUCH_SMOKE_SPECS, E2E_SMOKE_LEGS, JOURNEY_CELLS, journeysGate, runs, parseArgs };
