#!/usr/bin/env node
const planArg = process.argv.indexOf('--plan');
const shaArg = process.argv.indexOf('--sha');
const plan = planArg >= 0 ? JSON.parse(process.argv[planArg + 1]) : (process.env.VECTURA_LANE_PLAN ? JSON.parse(process.env.VECTURA_LANE_PLAN) : null);
const sha = shaArg >= 0 ? process.argv[shaArg + 1] : process.env.GITHUB_SHA;
if (!plan || !sha || sha !== plan.head) {
  process.stderr.write('[test-lane-aggregate] Missing plan or SHA mismatch; refusing to pass.\n');
  process.exit(1);
}
// Shadow mode retains every full PR job. A routing plan never removes a required job.
const expected = ['unit', 'integration', 'e2e-smoke', 'visual', 'perf', 'coverage', 'feedback'];
const results = new Map();
for (const arg of process.argv.slice(2).filter((item) => item.startsWith('--job='))) {
  const pair = arg.slice(6).split('=');
  if (pair.length !== 2 || results.has(pair[0])) {
    process.stderr.write(`[test-lane-aggregate] Invalid or duplicate job result: ${arg}\n`);
    process.exit(1);
  }
  results.set(pair[0], pair[1]);
}
const failures = expected.filter((job) => results.get(job) !== 'success');
if (process.env.VECTURA_LANE_METRICS_FILE) {
  const workflow = process.env.GITHUB_WORKFLOW;
  const runId = process.env.GITHUB_RUN_ID;
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
  const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (process.env.GITHUB_ACTIONS === 'true' && workflow && runId && runNumber > 0 && attempt > 0) {
    const rows = expected.map((job) => ({ schemaVersion: 2, source: 'github-actions', sha, job, expectedJobs: expected, result: results.get(job) || 'missing', complete: true, latestHead: sha === process.env.GITHUB_SHA, classes: [...new Set(plan.matchedRules || [])], runId, runNumber, collectedAt: new Date().toISOString(), provenance: { workflow, event: process.env.GITHUB_EVENT_NAME, attempt } }));
    try { require('node:fs').appendFileSync(process.env.VECTURA_LANE_METRICS_FILE, rows.map((row) => JSON.stringify(row)).join('\n') + '\n'); }
    catch (error) { process.stderr.write(`[test-lane-aggregate] Could not record provenance: ${error.message}\n`); }
  }
}
if (failures.length) {
  process.stderr.write(`[test-lane-aggregate] ${sha} missing or failed retained full PR jobs: ${failures.join(', ')}\n`);
  process.exit(1);
}
process.stdout.write(`[test-lane-aggregate] ${sha} passed retained full PR roster: ${expected.join(', ')}\n`);
