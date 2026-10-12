#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const rosterPath = path.join(root, 'tests/helpers/feedback-roster.json');
let roster;
try { roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8')); }
catch (error) { process.stderr.write(`[feedback] Cannot read roster: ${error.message}\n`); process.exit(2); }
if (roster.version !== 1 || !Array.isArray(roster.tests) || roster.tests.some((item) => typeof item.path !== 'string')) {
  process.stderr.write('[feedback] Invalid feedback roster schema.\n'); process.exit(2);
}
const tests = [...new Set([...roster.tests.map((item) => item.path), 'tests/unit/feedback-critical.test.js'])];
const result = spawnSync(process.execPath, [path.join(root, 'scripts/run-vitest.js'), 'run', ...tests], { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) { process.stderr.write(`[feedback] Could not launch Vitest: ${result.error.message}\n`); process.exit(1); }
process.exit(result.status === null ? 1 : result.status);
