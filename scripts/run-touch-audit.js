#!/usr/bin/env node
// Runs the touch target audit ratchet spec (TUX-058). `--full` runs all 26 states
// (sets TOUCH_AUDIT_FULL=1). Extra arguments pass to Playwright (e.g. --project=touch-ipad-portrait).
// No cross-env dependency: the environment is set here.
'use strict';
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const full = args.includes('--full');
const rest = args.filter((a) => a !== '--full');
const env = { ...process.env, ...(full ? { TOUCH_AUDIT_FULL: '1' } : {}) };
const r = spawnSync('npx', ['playwright', 'test', 'tests/e2e/touch/target-audit.spec.js', '--reporter=line', ...rest], { stdio: 'inherit', env });
process.exit(r.status === null ? 1 : r.status);
