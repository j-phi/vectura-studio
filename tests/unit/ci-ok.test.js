const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * ci-ok (judgment R-1) is the one required check on main. It must need every job in the
 * Tests workflow, and must fail on any failure, cancellation, or a required job that did not run.
 */
const ROOT = path.resolve(__dirname, '../..');
const ciOk = require('../../scripts/ci-ok.js');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
const job = (name) => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, 'm'))?.[1] || '';
const jobsBlock = workflow.slice(workflow.indexOf('\njobs:\n'));
const allJobs = [...jobsBlock.matchAll(/^  ([a-z0-9-]+):$/gm)].map((m) => m[1]);
const needsOf = (name) => (job(name).match(/^    needs: \[([^\]]*)\]/m)?.[1] || '').split(',').map((s) => s.trim()).filter(Boolean);

const results = (event, overrides = {}) => {
  const required = new Set(ciOk.expectedJobs(event));
  const needs = {};
  for (const name of ciOk.ALL_JOBS) needs[name] = { result: required.has(name) ? 'success' : 'skipped', outputs: {} };
  for (const [name, result] of Object.entries(overrides)) needs[name] = { result, outputs: {} };
  return needs;
};

const run = (needs, event) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/ci-ok.js')], {
  env: { ...process.env, GITHUB_OUTPUT: '', NEEDS_JSON: JSON.stringify(needs), EVENT_NAME: event }, encoding: 'utf8',
});

describe('ci-ok required check', () => {
  it('needs every other job in test.yml, and the script classifies exactly those jobs', () => {
    const real = allJobs.filter((n) => n !== 'ci-ok' && n !== 'report-red-main');
    expect(needsOf('ci-ok').sort()).toEqual(real.sort());
    expect([...ciOk.ALL_JOBS].sort()).toEqual(real.sort());
    expect(job('ci-ok')).toMatch(/^    if: always\(\)$/m);
    expect(job('ci-ok')).toContain('NEEDS_JSON: ${{ toJSON(needs) }}');
  });

  it('classifies each job by the event its own `if:` runs it on', () => {
    for (const name of ciOk.PR_GRAPH) expect(job(name), name).toContain("github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref == 'refs/heads/main')");
    for (const name of ciOk.TOUCH_NIGHTLY) expect(job(name), name).toContain("if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
    for (const name of ciOk.SCHEDULE_ONLY) expect(job(name), name).toContain("if: github.event_name == 'schedule'\n");
  });

  it('passes when every expected job succeeds and every by-design skip skips', () => {
    for (const event of ['pull_request', 'push', 'schedule', 'workflow_dispatch']) {
      expect(ciOk.evaluate(results(event), event).ok, event).toBe(true);
    }
    expect(run(results('pull_request'), 'pull_request').status).toBe(0);
  });

  it('fails on a failed, cancelled, or skipped required job', () => {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const verdict = ciOk.evaluate(results('pull_request', { 'coverage-shard': result }), 'pull_request');
      expect(verdict.ok, result).toBe(false);
      expect(verdict.failed).toEqual(['coverage-shard']);
    }
    const r = run(results('push', { perf: 'cancelled' }), 'push');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('perf: cancelled');
  });

  it('fails on a nightly job failure, and when a job is missing from needs', () => {
    expect(ciOk.evaluate(results('schedule', { 'scheduled-audit': 'failure' }), 'schedule').ok).toBe(false);
    expect(ciOk.evaluate(results('workflow_dispatch', { 'touch-audit-nightly': 'skipped' }), 'workflow_dispatch').ok).toBe(false);
    const missing = results('pull_request');
    delete missing['lane-gate'];
    expect(ciOk.evaluate(missing, 'pull_request').problems).toContain('lane-gate: missing from ci-ok needs');
  });
});

describe('red main gets an owner (R-5)', () => {
  it('opens or updates one labelled issue only on a failed main push or nightly', () => {
    const report = job('report-red-main');
    expect(report).toContain('needs: [ci-ok]');
    expect(report).toContain("needs.ci-ok.result == 'failure'");
    expect(report).toContain("github.event_name == 'schedule' || (github.event_name == 'push' && github.ref == 'refs/heads/main')");
    expect(report).not.toContain('pull_request');
    expect(report).toMatch(/permissions:\n\s+issues: write\n/);
    expect(report).toContain('gh issue list --label "$label" --state open');
    expect(report).toContain('gh issue comment');
    expect(report).toContain('gh issue create');
    // The issue permission is scoped to this job only.
    expect(workflow.slice(0, workflow.indexOf('\njobs:\n'))).not.toMatch(/^permissions:/m);
    expect(workflow.match(/issues: write/g)).toHaveLength(1);
  });
});

describe('concurrency (R-2)', () => {
  it('keeps schedule and dispatch runs out of the push-to-main group, and cancels only PR runs', () => {
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}');
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });
});
