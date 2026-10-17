#!/usr/bin/env node
/**
 * ci-ok: the single required check for the Tests workflow (judgment R-1).
 *
 * Reads the `needs` context (NEEDS_JSON, from `toJSON(needs)`) and the event name.
 * A job that runs by design on this event must conclude `success`.
 * A job that skips by design on this event must conclude `skipped` (or `success`).
 * Any `failure` or `cancelled` result fails the check.
 */
'use strict';

const fs = require('fs');

// Jobs that run on a pull request and on a push to main.
const PR_GRAPH = [
  'lane-plan', 'feedback', 'unit', 'integration', 'e2e-smoke', 'visual', 'perf',
  'coverage-plan', 'coverage-shard', 'coverage', 'lane-gate',
];
// Jobs that run only on the nightly schedule and on a manual dispatch.
const TOUCH_NIGHTLY = ['touch-e2e-nightly', 'touch-audit-nightly'];
// Jobs that run only on the nightly schedule.
const SCHEDULE_ONLY = ['scheduled-audit'];
const ALL_JOBS = [...PR_GRAPH, ...TOUCH_NIGHTLY, ...SCHEDULE_ONLY];

function expectedJobs(event) {
  if (event === 'pull_request' || event === 'push') return PR_GRAPH;
  if (event === 'schedule') return [...TOUCH_NIGHTLY, ...SCHEDULE_ONLY];
  if (event === 'workflow_dispatch') return TOUCH_NIGHTLY;
  return [];
}

function evaluate(needs, event) {
  const required = new Set(expectedJobs(event));
  const problems = [];
  const failed = [];
  const names = Object.keys(needs || {});
  for (const name of ALL_JOBS) {
    if (!names.includes(name)) problems.push(`${name}: missing from ci-ok needs`);
  }
  for (const name of names) {
    if (!ALL_JOBS.includes(name)) problems.push(`${name}: not classified in scripts/ci-ok.js`);
    const result = needs[name] && needs[name].result;
    if (result === 'failure' || result === 'cancelled') {
      failed.push(name);
      problems.push(`${name}: ${result}`);
    } else if (required.has(name) && result !== 'success') {
      failed.push(name);
      problems.push(`${name}: ${result} (must succeed on ${event})`);
    } else if (!required.has(name) && result !== 'skipped' && result !== 'success') {
      problems.push(`${name}: unexpected result ${result}`);
    }
  }
  return { ok: problems.length === 0, problems, failed };
}

if (require.main === module) {
  const event = process.env.EVENT_NAME || '';
  let needs;
  try {
    needs = JSON.parse(process.env.NEEDS_JSON || '{}');
  } catch (error) {
    console.error(`ci-ok: NEEDS_JSON is not valid JSON: ${error.message}`);
    process.exit(1);
  }
  const { ok, problems, failed } = evaluate(needs, event);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `failed=${failed.join(' ')}\n`);
  }
  for (const [name, value] of Object.entries(needs)) console.log(`${name}: ${value && value.result}`);
  if (!ok) {
    console.error(`ci-ok FAILED on ${event}:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`ci-ok: every required job passed on ${event}.`);
}

module.exports = { PR_GRAPH, TOUCH_NIGHTLY, SCHEDULE_ONLY, ALL_JOBS, expectedJobs, evaluate };
