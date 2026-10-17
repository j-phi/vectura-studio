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
    const real = allJobs.filter((n) => !['ci-ok', 'report-red-main', 'report-flaky-main'].includes(n));
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
    delete missing.coverage;
    expect(ciOk.evaluate(missing, 'pull_request').problems).toContain('coverage: missing from ci-ok needs');
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
    expect(workflow.match(/issues: write/g)).toHaveLength(2);
  });
});

describe('PR job graph (R-7)', () => {
  it('has no alias, router or lane-gate hops: ci-ok is the only aggregate', () => {
    for (const gone of ['lane-plan', 'feedback', 'unit', 'integration', 'visual', 'coverage-plan', 'lane-gate']) {
      expect(allJobs, gone).not.toContain(gone);
    }
    expect([...ciOk.PR_GRAPH].sort()).toEqual(['coverage', 'coverage-shard', 'e2e-smoke', 'perf']);
  });

  it('runs the Node process-lifecycle tests in perf, and the coverage probe only on plumbing changes', () => {
    const perf = job('perf');
    expect(perf).toContain('run: npm run test:runner');
    expect(perf).toContain('run: npm run test:perf');
    const probe = perf.slice(perf.indexOf('- name: Verify bounded coverage shard and merge plumbing'));
    expect(probe).toContain("if: steps.infra.outputs.run == 'true'");
    expect(probe).toContain('run: npm run test:coverage:probe');
    const detect = perf.slice(perf.indexOf('- name: Detect coverage plumbing changes'), perf.indexOf('- name: Verify bounded'));
    for (const file of ['test-shard-plan', 'test-coverage-probe', 'vitest\\.coverage-shard\\.config', 'package-lock']) expect(detect, file).toContain(file);
    // Fail-safe: an unknown base runs the probe.
    expect(detect).toContain('run=true\n');
  });
});

describe('Playwright flakes are visible (R-15)', () => {
  it('summarizes flakes in every PR/nightly Playwright job and reports main flakes to an issue', () => {
    for (const name of ['e2e-smoke', 'touch-e2e-nightly']) {
      expect(job(name), name).toContain('node scripts/playwright-flaky.js summarize');
      expect(job(name), name).toMatch(/name: playwright-flaky-/);
    }
    const report = job('report-flaky-main');
    expect(report).toContain('needs: [ci-ok]');
    expect(report).not.toContain('pull_request');
    expect(report).toContain('pattern: playwright-flaky-*');
    expect(report).toContain('playwright-flaky.js total');
    expect(report).toContain('gh issue comment');
  });
});

describe('setup hygiene (R-14)', () => {
  it('installs with npm ci and caches Playwright browsers by Playwright version', () => {
    expect(workflow).not.toContain('npm install');
    expect(workflow).not.toMatch(/npx playwright install/);
    const action = fs.readFileSync(path.join(ROOT, '.github/actions/setup-playwright/action.yml'), 'utf8');
    expect(action).toContain("require('@playwright/test/package.json').version");
    expect(action).toContain('path: ~/.cache/ms-playwright');
    expect(action).toContain('steps.version.outputs.playwright');
  });
});

describe('concurrency (R-2)', () => {
  it('keeps schedule and dispatch runs out of the push-to-main group, and cancels only PR runs', () => {
    expect(workflow).toContain('group: ${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}');
    expect(workflow).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });
});
