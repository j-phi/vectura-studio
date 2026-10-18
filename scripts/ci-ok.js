#!/usr/bin/env node
/**
 * ci-ok: the single required check for the Tests workflow (judgment R-1).
 *
 * Reads the `needs` context (NEEDS_JSON, from `toJSON(needs)`) and the event name.
 * The ci-plan job's outputs (heavy, vitest, coverage, audit) say which jobs run by design.
 * A job that runs by design must conclude `success`. A job that skips by design must conclude
 * `skipped`: a dedup skip (R-19, R-20) and an audit path skip (R-17) are explicit plan outputs.
 * Any `failure` or `cancelled` result fails the check.
 */
'use strict';

const fs = require('fs');

// The plan job: runs on every event and decides the rest (scripts/ci-plan.js).
const PLAN = ['ci-plan'];
// History checks that run on every event, outside the plan: a dedup skip never drops them.
// touch-waiver is the TUX-058 baseline waiver rule (it reads commit messages, not the tree).
const ALWAYS = ['touch-waiver'];
// Browser smoke + perf: run when ci-plan says heavy=true (every PR; a main push unless a green
// PR run already tested the same tree; the nightly unless a green main push did that day).
const HEAVY = ['e2e-smoke', 'perf'];
// The PR gate (R-21): the Vitest roster uninstrumented, merged JSON + `test-profile --strict`.
// ci-plan says vitest=true on pull_request only.
const VITEST = ['vitest-shard', 'vitest'];
// The coverage ratchet (R-21): the same roster under V8 coverage, merged thresholds +
// `test-profile --strict`. ci-plan says coverage=true on every main push and on a nightly that
// no green main push of the same SHA covered.
const COVERAGE = ['coverage-shard', 'coverage'];
// The Scene3D proof audits: run when ci-plan says audit=true (path-routed on PRs).
const AUDIT = ['audit'];
// Jobs that run only on the nightly schedule and on a manual dispatch. Never skipped by ci-plan.
const TOUCH_NIGHTLY = ['touch-e2e-nightly', 'touch-audit-nightly'];
// Linux pixel snapshots in the pinned Playwright image (R-38): nightly and manual runs only,
// never skipped by ci-plan. On a PR or push they must be `skipped` (by design).
const VISUAL_NIGHTLY = ['visual-nightly'];
const ALL_JOBS = [...PLAN, ...ALWAYS, ...HEAVY, ...VITEST, ...COVERAGE, ...AUDIT, ...TOUCH_NIGHTLY, ...VISUAL_NIGHTLY];
const PLANNED_EVENTS = ['pull_request', 'push', 'schedule', 'workflow_dispatch'];
const PLAN_KEYS = ['heavy', 'vitest', 'coverage', 'audit'];

// The jobs that must succeed on this event, given ci-plan's outputs. A by-design skip is an
// explicit `false` output from ci-plan, never an inferred `skipped` result.
function expectedJobs(event, planOutputs = {}) {
  const required = [];
  if (PLANNED_EVENTS.includes(event)) required.push(...PLAN, ...ALWAYS);
  if (planOutputs.heavy === 'true') required.push(...HEAVY);
  if (planOutputs.vitest === 'true') required.push(...VITEST);
  if (planOutputs.coverage === 'true') required.push(...COVERAGE);
  if (planOutputs.audit === 'true') required.push(...AUDIT);
  if (event === 'schedule' || event === 'workflow_dispatch') required.push(...TOUCH_NIGHTLY, ...VISUAL_NIGHTLY);
  return required;
}

// Per-event rules on the plan itself (R-21). A plan that breaks one fails ci-ok, so a ci-plan
// bug cannot silently drop the PR gate or the coverage ratchet.
function planProblems(event, outputs) {
  const problems = [];
  if (event === 'pull_request') {
    if (outputs.coverage !== 'false') problems.push('ci-plan: a PR run must not run the coverage graph (coverage=true)');
    if (outputs.vitest !== outputs.heavy) problems.push(`ci-plan: a PR run gates on the Vitest roster with its heavy graph (vitest=${outputs.vitest}, heavy=${outputs.heavy})`);
  } else if (outputs.vitest !== 'false') {
    problems.push(`ci-plan: the uninstrumented Vitest graph is PR-only (vitest=${outputs.vitest} on ${event})`);
  }
  if (event === 'push' && outputs.coverage !== 'true') problems.push('ci-plan: every main push must run the coverage ratchet (coverage=false)');
  if (event === 'schedule' && outputs.coverage !== outputs.heavy) problems.push(`ci-plan: the nightly runs coverage with its heavy graph (coverage=${outputs.coverage}, heavy=${outputs.heavy})`);
  return problems;
}

function evaluate(needs, event) {
  const plan = (needs && needs['ci-plan']) || {};
  const outputs = plan.outputs || {};
  const problems = [];
  const failed = [];
  if (plan.result === 'success') {
    const malformed = PLAN_KEYS.filter((key) => outputs[key] !== 'true' && outputs[key] !== 'false');
    for (const key of malformed) problems.push(`ci-plan: output ${key}=${outputs[key]} is not true/false`);
    if (!malformed.length) problems.push(...planProblems(event, outputs));
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
    schemaVersion: 2,
    ok: evaluate(needs, event).ok,
    event,
    runId: String(env.GITHUB_RUN_ID || ''),
    sha: env.GITHUB_SHA || '',
    tree: outputs.tree || '',
    heavy: outputs.heavy === 'true',
    vitest: outputs.vitest === 'true',
    coverage: outputs.coverage === 'true',
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

module.exports = { PLAN, ALWAYS, HEAVY, VITEST, COVERAGE, AUDIT, TOUCH_NIGHTLY, VISUAL_NIGHTLY, ALL_JOBS, PLAN_KEYS, expectedJobs, planProblems, evaluate, verdictRecord };
