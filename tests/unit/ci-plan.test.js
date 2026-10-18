const fs = require('fs');
const path = require('path');

/**
 * ci-plan (R-17, R-19, R-20) decides whether the heavy graph and the audits run. Every doubt
 * must run them; a skip needs positive, exact evidence.
 */
const ROOT = path.resolve(__dirname, '../..');
const ciPlan = require('../../scripts/ci-plan.js');

const TREE = 'b'.repeat(40);
const SHA = 'c'.repeat(40);
const REPO = 'owner/repo';
const verdict = (over = {}) => ({ schemaVersion: 2, ok: true, event: 'pull_request', runId: '7', sha: 'd'.repeat(40), tree: TREE, heavy: true, vitest: true, coverage: false, audit: true, ...over });

// A fake `gh api` over a fixture of endpoints. Artifact zips are the JSON text itself; the fake
// unzip returns it unchanged.
function fakeGh(routes, calls = []) {
  return (args) => {
    const endpoint = args[1];
    calls.push(endpoint);
    if (!(endpoint in routes)) throw new Error(`HTTP 404: ${endpoint}`);
    const body = routes[endpoint];
    return Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  };
}
const unzip = (buffer) => buffer.toString('utf8');
const git = (tree = TREE) => () => Buffer.from(`${tree}\n`);

const pushRoutes = (v = verdict(), run = { id: 7, status: 'completed', conclusion: 'success' }) => ({
  [`repos/${REPO}/commits/${SHA}/pulls`]: [{ number: 5, merged_at: '2026-10-17T10:00:00Z', base: { ref: 'main' }, head: { sha: 'e'.repeat(40) } }],
  [`repos/${REPO}/actions/workflows/test.yml/runs?event=pull_request&head_sha=${'e'.repeat(40)}&per_page=10`]: { workflow_runs: [run] },
  [`repos/${REPO}/actions/runs/7/artifacts?name=ci-ok-verdict`]: { artifacts: [{ id: 99, name: 'ci-ok-verdict', expired: false }] },
  [`repos/${REPO}/actions/artifacts/99/zip`]: JSON.stringify(v),
});
const pushEnv = { EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: SHA, GITHUB_REPOSITORY: REPO, BEFORE_SHA: 'a'.repeat(40) };
// The pushed diff (BEFORE_SHA..HEAD); audit-paths.changedFiles shells out to git, so stub it.
const auditPaths = require('../../scripts/audit-paths.js');
const withPushed = (files, fn) => {
  const original = auditPaths.changedFiles;
  auditPaths.changedFiles = () => files;
  try { return fn(); } finally { auditPaths.changedFiles = original; }
};

describe('main-push dedup (R-20)', () => {
  it('skips the heavy graph and the audits when a green PR run that ran the audits tested this tree', () => {
    const result = withPushed(['src/ui/ui.js'], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes()), git: git(), unzip }));
    expect(result).toMatchObject({ heavy: false, audit: false, tree: TREE });
  });

  it('still runs the coverage ratchet on a deduplicated push: the PR verdict has no coverage (R-21)', () => {
    const deduped = withPushed(['src/ui/ui.js'], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes()), git: git(), unzip }));
    expect(deduped).toMatchObject({ heavy: false, vitest: false, coverage: true });
    const full = withPushed(['src/ui/ui.js'], () => ciPlan.plan({ env: pushEnv, gh: fakeGh({}), git: git(), unzip }));
    expect(full).toMatchObject({ heavy: true, vitest: false, coverage: true });
    // Even a verdict that claims coverage ran does not skip it: a push always covers.
    const claims = withPushed(['src/ui/ui.js'], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes(verdict({ coverage: true }))), git: git(), unzip }));
    expect(claims).toMatchObject({ heavy: false, coverage: true });
  });

  it('still runs the audits when the PR run skipped them by path', () => {
    const result = withPushed(['src/ui/ui.js'], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes(verdict({ audit: false }))), git: git(), unzip }));
    expect(result).toMatchObject({ heavy: false, audit: true });
  });

  it('runs everything on any mismatch or doubt', () => {
    const cases = {
      'other tree': verdict({ tree: 'f'.repeat(40) }),
      'ci-ok failed': verdict({ ok: false }),
      'not a PR verdict': verdict({ event: 'push' }),
      'verdict from another run': verdict({ runId: '8' }),
      'heavy graph did not run': verdict({ heavy: false }),
      'Vitest roster did not run': verdict({ vitest: false }),
      'pre-R-21 schema': verdict({ schemaVersion: 1 }),
      'unknown schema': verdict({ schemaVersion: 3 }),
    };
    for (const [name, v] of Object.entries(cases)) {
      const result = withPushed(['src/ui/ui.js'], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes(v)), git: git(), unzip }));
      expect(result, name).toMatchObject({ heavy: true, audit: true });
    }
    const failedRun = withPushed([], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes(verdict(), { id: 7, status: 'completed', conclusion: 'failure' })), git: git(), unzip }));
    expect(failedRun).toMatchObject({ heavy: true, audit: true });
    const noArtifact = pushRoutes();
    noArtifact[`repos/${REPO}/actions/runs/7/artifacts?name=ci-ok-verdict`] = { artifacts: [] };
    expect(withPushed([], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(noArtifact), git: git(), unzip }))).toMatchObject({ heavy: true, audit: true });
    const noPr = { [`repos/${REPO}/commits/${SHA}/pulls`]: [] };
    expect(withPushed([], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(noPr), git: git(), unzip }))).toMatchObject({ heavy: true, audit: true });
    // API down, unknown tree, unknown pushed diff.
    expect(withPushed([], () => ciPlan.plan({ env: pushEnv, gh: fakeGh({}), git: git(), unzip }))).toMatchObject({ heavy: true, audit: true });
    expect(withPushed([], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes()), git: () => { throw new Error('no git'); }, unzip }))).toMatchObject({ heavy: true, audit: true });
    expect(withPushed(null, () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes()), git: git(), unzip }))).toMatchObject({ heavy: true, audit: true });
  });

  it('never reuses a PR verdict for a push that changes CI itself', () => {
    for (const file of ['.github/workflows/test.yml', 'scripts/ci-plan.js', 'scripts/ci-ok.js', 'scripts/audit-paths.js']) {
      const result = withPushed([file], () => ciPlan.plan({ env: pushEnv, gh: fakeGh(pushRoutes()), git: git(), unzip }));
      expect(result, file).toMatchObject({ heavy: true, audit: true });
    }
  });

  it('a push to another ref runs everything', () => {
    expect(ciPlan.plan({ env: { ...pushEnv, GITHUB_REF: 'refs/heads/topic' }, gh: fakeGh(pushRoutes()), git: git(), unzip })).toMatchObject({ heavy: true, audit: true });
  });
});

describe('nightly dedup (R-19)', () => {
  const now = Date.parse('2026-10-17T08:00:00Z');
  const routes = (run, ciOk = 'success', coverage = 'success') => ({
    [`repos/${REPO}/actions/workflows/test.yml/runs?event=push&branch=main&head_sha=${SHA}&per_page=10`]: { workflow_runs: [run] },
    [`repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`]: { jobs: [{ name: 'ci-plan', conclusion: 'success' }, { name: 'coverage', conclusion: coverage }, { name: 'ci-ok', conclusion: ciOk }] },
  });
  const env = { EVENT_NAME: 'schedule', GITHUB_SHA: SHA, GITHUB_REPOSITORY: REPO };

  it('skips the heavy graph and audits when a push run on this SHA passed ci-ok in the last 24 h', () => {
    const run = { id: 3, status: 'completed', created_at: '2026-10-16T09:00:00Z' };
    expect(ciPlan.plan({ env, gh: fakeGh(routes(run)), git: git(), now })).toMatchObject({ heavy: false, vitest: false, coverage: false, audit: false });
  });

  it('runs the coverage ratchet unless that push run passed its coverage merge (R-21)', () => {
    const run = { id: 3, status: 'completed', created_at: '2026-10-16T09:00:00Z' };
    for (const coverage of ['skipped', 'failure', 'missing']) {
      const r = routes(run, 'success', coverage);
      if (coverage === 'missing') r[`repos/${REPO}/actions/runs/3/jobs?per_page=100`].jobs.splice(1, 1);
      expect(ciPlan.plan({ env, gh: fakeGh(r), git: git(), now }), coverage).toMatchObject({ heavy: true, vitest: false, coverage: true, audit: true });
    }
  });

  it('runs on a red or older push run, or when the lookup fails', () => {
    expect(ciPlan.plan({ env, gh: fakeGh(routes({ id: 3, status: 'completed', created_at: '2026-10-16T09:00:00Z' }, 'failure')), git: git(), now })).toMatchObject({ heavy: true, audit: true });
    expect(ciPlan.plan({ env, gh: fakeGh(routes({ id: 3, status: 'completed', created_at: '2026-10-16T07:59:00Z' })), git: git(), now })).toMatchObject({ heavy: true, audit: true });
    expect(ciPlan.plan({ env, gh: fakeGh(routes({ id: 3, status: 'in_progress', created_at: '2026-10-17T07:00:00Z' })), git: git(), now })).toMatchObject({ heavy: true, audit: true });
    expect(ciPlan.plan({ env, gh: fakeGh({}), git: git(), now })).toMatchObject({ heavy: true, audit: true });
    expect(ciPlan.decideSchedule({ now, pushRuns: [{ id: 1, createdAt: 'garbage', ciOk: true }] }).heavy).toBe(true);
  });
});

describe('pull_request and other events', () => {
  it('a PR always runs the heavy graph and the uninstrumented roster, never coverage; the audits follow the path filter', () => {
    const env = { EVENT_NAME: 'pull_request', BASE_SHA: 'a'.repeat(40) };
    expect(withPushed(['docs/x.md'], () => ciPlan.plan({ env, gh: fakeGh({}), git: git() }))).toMatchObject({ heavy: true, vitest: true, coverage: false, audit: false });
    expect(withPushed(['src/core/scene3d/mesh.js'], () => ciPlan.plan({ env, gh: fakeGh({}), git: git() }))).toMatchObject({ heavy: true, audit: true });
    expect(withPushed(null, () => ciPlan.plan({ env, gh: fakeGh({}), git: git() }))).toMatchObject({ heavy: true, audit: true });
  });

  it('workflow_dispatch runs neither (the touch nightly jobs do not use the plan)', () => {
    expect(ciPlan.plan({ env: { EVENT_NAME: 'workflow_dispatch' }, gh: fakeGh({}), git: git() })).toMatchObject({ heavy: false, vitest: false, coverage: false, audit: false });
  });
});

describe('workflow wiring', () => {
  it('runs ci-plan read-only with the base fetched, and ci-ok uploads the verdict ci-plan reads', () => {
    const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
    const plan = workflow.slice(workflow.indexOf('\n  ci-plan:\n'), workflow.indexOf('\n  e2e-smoke:\n'));
    expect(plan).toMatch(/permissions:\n\s+contents: read\n\s+actions: read\n\s+pull-requests: read\n/);
    expect(plan).not.toMatch(/: write/);
    expect(plan).toContain('git fetch --no-tags --depth=1 origin "$BASE_SHA"');
    expect(plan).toContain('BEFORE_SHA: ${{ github.event.before }}');
    expect(plan).toContain('GH_TOKEN: ${{ github.token }}');
    for (const file of ['scripts/ci-plan.js', 'scripts/audit-paths.js', 'tests/helpers/runtime-profiles.js']) expect(plan).toContain(file);
    expect(workflow).toContain(`name: ${ciPlan.VERDICT_ARTIFACT}`);
    expect(workflow).toContain(`ci-ok-verdict/${ciPlan.VERDICT_FILE}`);
  });
});
