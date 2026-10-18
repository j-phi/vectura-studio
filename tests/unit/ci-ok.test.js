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

// A full needs context: ci-plan says heavy/audit; every planned job succeeds, the rest skip.
const results = (event, overrides = {}, plan = { heavy: 'true', audit: 'true' }) => {
  const outputs = { ...plan, tree: 'f'.repeat(40) };
  const required = new Set(ciOk.expectedJobs(event, outputs));
  const needs = {};
  for (const name of ciOk.ALL_JOBS) needs[name] = { result: required.has(name) ? 'success' : 'skipped', outputs: {} };
  needs['ci-plan'].outputs = outputs;
  for (const [name, result] of Object.entries(overrides)) needs[name] = { ...needs[name], result };
  return needs;
};

const run = (needs, event, extraEnv = {}) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/ci-ok.js')], {
  env: { ...process.env, GITHUB_OUTPUT: '', VERDICT_OUT: '', NEEDS_JSON: JSON.stringify(needs), EVENT_NAME: event, ...extraEnv }, encoding: 'utf8',
});

describe('ci-ok required check', () => {
  it('needs every other job in test.yml, and the script classifies exactly those jobs', () => {
    const real = allJobs.filter((n) => !['ci-ok', 'report-red-main', 'report-flaky-main'].includes(n));
    expect(needsOf('ci-ok').sort()).toEqual(real.sort());
    expect([...ciOk.ALL_JOBS].sort()).toEqual(real.sort());
    expect(job('ci-ok')).toMatch(/^    if: always\(\)$/m);
    expect(job('ci-ok')).toContain('NEEDS_JSON: ${{ toJSON(needs) }}');
  });

  it('gates each job on the ci-plan output that ci-ok classifies it by', () => {
    for (const name of ciOk.HEAVY) {
      expect(needsOf(name), name).toContain('ci-plan');
      expect(job(name), name).toMatch(/^    if: (always\(\) && )?needs\.ci-plan\.outputs\.heavy == 'true'$/m);
    }
    for (const name of ciOk.AUDIT) {
      expect(needsOf(name), name).toEqual(['ci-plan']);
      expect(job(name), name).toMatch(/^    if: needs\.ci-plan\.outputs\.audit == 'true'$/m);
    }
    // The touch and visual nightly jobs never depend on the plan: a dedup skip must not drop them (R-19).
    for (const name of [...ciOk.TOUCH_NIGHTLY, ...ciOk.VISUAL_NIGHTLY]) {
      expect(needsOf(name), name).toEqual([]);
      expect(job(name), name).toContain("if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
    }
    expect(job('ci-plan')).not.toMatch(/^    if:/m);
    expect(job('ci-plan')).toContain('run: node scripts/ci-plan.js');
    for (const key of ['heavy', 'audit', 'tree']) expect(job('ci-plan')).toContain(`${key}: \${{ steps.plan.outputs.${key} }}`);
  });

  it('passes when every planned job succeeds and every by-design skip skips', () => {
    for (const event of ['pull_request', 'push', 'schedule']) {
      for (const plan of [{ heavy: 'true', audit: 'true' }, { heavy: 'true', audit: 'false' }, { heavy: 'false', audit: 'true' }, { heavy: 'false', audit: 'false' }]) {
        expect(ciOk.evaluate(results(event, {}, plan), event).ok, `${event} ${JSON.stringify(plan)}`).toBe(true);
      }
    }
    expect(ciOk.evaluate(results('workflow_dispatch', {}, { heavy: 'false', audit: 'false' }), 'workflow_dispatch').ok).toBe(true);
    expect(run(results('pull_request'), 'pull_request').status).toBe(0);
  });

  it('a dedup-skipped push passes with the heavy graph and audits skipped', () => {
    const needs = results('push', {}, { heavy: 'false', audit: 'false' });
    for (const name of [...ciOk.HEAVY, ...ciOk.AUDIT]) expect(needs[name].result).toBe('skipped');
    expect(run(needs, 'push').status).toBe(0);
  });

  it('fails on a failed, cancelled, or skipped planned job', () => {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const verdict = ciOk.evaluate(results('pull_request', { 'coverage-shard': result }), 'pull_request');
      expect(verdict.ok, result).toBe(false);
      expect(verdict.failed).toEqual(['coverage-shard']);
      expect(ciOk.evaluate(results('pull_request', { audit: result }), 'pull_request').ok, `audit ${result}`).toBe(false);
    }
    const r = run(results('push', { perf: 'cancelled' }), 'push');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('perf: cancelled');
  });

  it('trusts only an explicit plan output for a skip, never an inferred `skipped`', () => {
    // ci-plan failed: its outputs are empty and nothing downstream ran. That must fail.
    const failedPlan = results('pull_request', { 'ci-plan': 'failure' }, {});
    for (const name of [...ciOk.HEAVY, ...ciOk.AUDIT]) failedPlan[name].result = 'skipped';
    expect(ciOk.evaluate(failedPlan, 'pull_request').ok).toBe(false);
    // ci-plan succeeded but did not say heavy/audit: fail, do not read a skip as a pass.
    const silent = results('push', {}, { heavy: 'false', audit: 'false' });
    silent['ci-plan'].outputs = { tree: '' };
    expect(ciOk.evaluate(silent, 'push').problems.join(' ')).toContain('ci-plan: output heavy=undefined');
    // A job that ran although the plan skipped it means the plan and its `if:` disagree.
    expect(ciOk.evaluate(results('push', { audit: 'success' }, { heavy: 'true', audit: 'false' }), 'push').ok).toBe(false);
  });

  it('fails on a nightly job failure, and when a job is missing from needs', () => {
    expect(ciOk.evaluate(results('schedule', { audit: 'failure' }), 'schedule').ok).toBe(false);
    expect(ciOk.evaluate(results('schedule', { 'touch-e2e-nightly': 'skipped' }, { heavy: 'false', audit: 'false' }), 'schedule').ok).toBe(false);
    expect(ciOk.evaluate(results('workflow_dispatch', { 'touch-audit-nightly': 'skipped' }, { heavy: 'false', audit: 'false' }), 'workflow_dispatch').ok).toBe(false);
    // R-38: the pixel snapshots must run (and pass) nightly, and must skip on a PR.
    expect(ciOk.evaluate(results('schedule', { 'visual-nightly': 'skipped' }, { heavy: 'false', audit: 'false' }), 'schedule').ok).toBe(false);
    const red = ciOk.evaluate(results('schedule', { 'visual-nightly': 'failure' }), 'schedule');
    expect(red.ok).toBe(false);
    expect(red.failed).toEqual(['visual-nightly']);
    expect(ciOk.evaluate(results('pull_request', { 'visual-nightly': 'success' }), 'pull_request').ok).toBe(false);
    expect(results('pull_request')['visual-nightly'].result).toBe('skipped');
    const missing = results('pull_request');
    delete missing.coverage;
    expect(ciOk.evaluate(missing, 'pull_request').problems).toContain('coverage: missing from ci-ok needs');
  });

  it('writes the verdict record a later main push reads (R-20), and uploads it only from PRs', () => {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ci-ok-verdict-'));
    const out = path.join(dir, 'v.json');
    const r = run(results('pull_request', {}, { heavy: 'true', audit: 'false' }), 'pull_request', { VERDICT_OUT: out, GITHUB_RUN_ID: '42', GITHUB_SHA: 'a'.repeat(40) });
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toEqual({ schemaVersion: 1, ok: true, event: 'pull_request', runId: '42', sha: 'a'.repeat(40), tree: 'f'.repeat(40), heavy: true, audit: false });
    fs.rmSync(out);
    expect(run(results('pull_request', { perf: 'failure' }), 'pull_request', { VERDICT_OUT: out }).status).toBe(1);
    expect(fs.existsSync(out)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
    const upload = job('ci-ok').slice(job('ci-ok').indexOf('- name: Upload the ci-ok verdict'));
    expect(upload).toContain("if: success() && github.event_name == 'pull_request'");
    expect(upload).toContain('name: ci-ok-verdict');
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
    expect([...ciOk.HEAVY].sort()).toEqual(['coverage', 'coverage-shard', 'e2e-smoke', 'perf']);
    expect(allJobs).not.toContain('scheduled-audit');
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
