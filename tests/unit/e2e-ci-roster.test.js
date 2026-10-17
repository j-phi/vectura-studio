const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * CI browser roster (PR #102): the PR `e2e-smoke` job must stay a bounded smoke set, and the
 * full touch roster (11 projects) must still run somewhere: the nightly sharded matrix.
 */
const ROOT = path.resolve(__dirname, '../..');
const smoke = require('../../scripts/run-e2e-smoke.js');
const { PROJECTS: TOUCH } = require('../../tests/e2e/touch/viewports.js');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/test.yml'), 'utf8');
const job = (name) => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z0-9-]+:\\n|(?![\\s\\S]))`, 'm'))?.[1] || '';
const scripts = require('../../package.json').scripts;

const configProjects = (env = {}) => {
  const r = spawnSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./playwright.config.js').projects.map((p) => p.name)))"], {
    cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8',
  });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout);
};

describe('PR e2e smoke roster', () => {
  it('runs every non-touch project, so a new desktop project is never dropped silently', () => {
    const nonTouch = configProjects().filter((n) => !TOUCH[n]);
    expect([...smoke.DESKTOP_PROJECTS].sort()).toEqual(nonTouch.sort());
  });

  it('runs the touch smoke specs on exactly one Chromium and one WebKit touch project', () => {
    const engines = smoke.TOUCH_SMOKE_PROJECTS.map((n) => TOUCH[n] && TOUCH[n].engine).sort();
    expect(engines).toEqual(['chromium', 'webkit']);
    expect(smoke.TOUCH_SMOKE_SPECS.map((s) => path.basename(s)).sort()).toEqual(['harness.spec.js', 'journeys.spec.js', 'target-audit.spec.js']);
    smoke.TOUCH_SMOKE_SPECS.forEach((s) => expect(fs.existsSync(path.join(ROOT, s)), s).toBe(true));
    const [desktop, touch] = smoke.runs();
    expect(desktop.filter((a) => a.startsWith('--project=')).length).toBe(smoke.DESKTOP_PROJECTS.length);
    expect(touch.filter((a) => a.startsWith('--project=')).length).toBe(2);
  });

  it('is what the PR e2e-smoke job runs, not the full roster', () => {
    expect(scripts['test:e2e:smoke']).toContain('scripts/run-e2e-smoke.js');
    expect(scripts['test:e2e:smoke']).toContain('test-queue.js');
    const e2e = job('e2e-smoke');
    expect(e2e).toContain('run: npm run test:e2e:smoke');
    expect(e2e).not.toMatch(/run: npm run test:e2e\s*$/m);
    const timeout = Number((e2e.match(/timeout-minutes: (\d+)/) || [])[1]);
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(60);
  });
});

describe('full touch roster runs nightly', () => {
  it('a schedule-only matrix shards every touch spec over all 11 touch projects', () => {
    const nightly = job('touch-e2e-nightly');
    expect(nightly).toContain("if: github.event_name == 'schedule'");
    expect(nightly).toContain('touch_shard:');
    expect(nightly).toContain('--shard="$TOUCH_SHARD/$TOUCH_SHARD_COUNT"');
    expect(nightly).toContain('chromium webkit');
    expect(nightly).toMatch(/--project='touch-\*' --project='webkit-\*'/);
    expect(Object.keys(TOUCH).length).toBe(11);
  });

  it('the scheduled-audit browser roster leaves touch projects to the nightly matrix', () => {
    expect(job('scheduled-audit')).toMatch(/PW_TOUCH_PROJECTS: '0'/);
    const off = configProjects({ PW_TOUCH_PROJECTS: '0' });
    expect(off.filter((n) => TOUCH[n])).toEqual([]);
    expect(off.sort()).toEqual([...smoke.DESKTOP_PROJECTS].sort());
    expect(configProjects().filter((n) => TOUCH[n]).length).toBe(11);
  });
});
