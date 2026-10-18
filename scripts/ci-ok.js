#!/usr/bin/env node
/**
 * ci-ok: the single required check for the Tests workflow (judgment R-1).
 *
 * Reads the `needs` context (NEEDS_JSON, from `toJSON(needs)`) and the event name.
 * The ci-plan job's outputs (heavy, audit) say which jobs run by design on this run.
 * A job that runs by design must conclude `success`. A job that skips by design must conclude
 * `skipped`: a dedup skip (R-19, R-20) and an audit path skip (R-17) are explicit plan outputs.
 * Any `failure` or `cancelled` result fails the check.
 */
'use strict';

const fs = require('fs');

// The plan job: runs on every event and decides the rest (scripts/ci-plan.js).
const PLAN = ['ci-plan'];
// The heavy graph: runs when ci-plan says heavy=true (every PR; a main push unless a green PR
// run already tested the same tree; the nightly unless a green main push did that day).
const HEAVY = ['e2e-smoke', 'perf', 'coverage-shard', 'coverage'];
// The Scene3D proof audits: run when ci-plan says audit=true (path-routed on PRs).
const AUDIT = ['audit'];
// Jobs that run only on the nightly schedule and on a manual dispatch. Never skipped by ci-plan.
const TOUCH_NIGHTLY = ['touch-e2e-nightly', 'touch-audit-nightly'];
// Linux pixel snapshots in the pinned Playwright image (R-38): nightly and manual runs only,
// never skipped by ci-plan. On a PR or push they must be `skipped` (by design).
const VISUAL_NIGHTLY = ['visual-nightly'];
const ALL_JOBS = [...PLAN, ...HEAVY, ...AUDIT, ...TOUCH_NIGHTLY, ...VISUAL_NIGHTLY];
const PLANNED_EVENTS = ['pull_request', 'push', 'schedule', 'workflow_dispatch'];

// The jobs that must succeed on this event, given ci-plan's outputs. A by-design skip is an
// explicit `false` output from ci-plan, never an inferred `skipped` result.
function expectedJobs(event, planOutputs = {}) {
  const required = [];
  if (PLANNED_EVENTS.includes(event)) required.push(...PLAN);
  if (planOutputs.heavy === 'true') required.push(...HEAVY);
  if (planOutputs.audit === 'true') required.push(...AUDIT);
  if (event === 'schedule' || event === 'workflow_dispatch') required.push(...TOUCH_NIGHTLY, ...VISUAL_NIGHTLY);
  return required;
}

function evaluate(needs, event) {
  const plan = (needs && needs['ci-plan']) || {};
  const outputs = plan.outputs || {};
  const problems = [];
  const failed = [];
  if (plan.result === 'success') {
    for (const key of ['heavy', 'audit']) {
      if (outputs[key] !== 'true' && outputs[key] !== 'false') problems.push(`ci-plan: output ${key}=${outputs[key]} is not true/false`);
    }
  }
  const required = new Set(expectedJobs(event, outputs));
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
    } else if (!required.has(name) && result !== 'skipped') {
      // A job that ran although ci-plan did not ask for it means the plan and the job's `if:`
      // disagree; fail rather than guess which one is right.
      problems.push(`${name}: unexpected result ${result} (not planned on ${event})`);
    }
  }
  return { ok: problems.length === 0, problems, failed };
}

function verdictRecord(needs, event, env = process.env) {
  const outputs = (needs['ci-plan'] && needs['ci-plan'].outputs) || {};
  return {
    schemaVersion: 1,
    ok: evaluate(needs, event).ok,
    event,
    runId: String(env.GITHUB_RUN_ID || ''),
    sha: env.GITHUB_SHA || '',
    tree: outputs.tree || '',
    heavy: outputs.heavy === 'true',
    audit: outputs.audit === 'true',
  };
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
  // The verdict record a later main push reads to skip a duplicate run (scripts/ci-plan.js).
  if (process.env.VERDICT_OUT) fs.writeFileSync(process.env.VERDICT_OUT, `${JSON.stringify(verdictRecord(needs, event, process.env))}\n`);
  console.log(`ci-ok: every required job passed on ${event}.`);
}

module.exports = { PLAN, HEAVY, AUDIT, TOUCH_NIGHTLY, VISUAL_NIGHTLY, ALL_JOBS, expectedJobs, evaluate, verdictRecord };
