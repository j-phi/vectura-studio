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
  it('runs every non-touch project except the named nightly-only ones, so a new project is never dropped silently', () => {
    const nonTouch = configProjects().filter((n) => !TOUCH[n]);
    expect([...smoke.DESKTOP_PROJECTS, ...smoke.NIGHTLY_ONLY_PROJECTS].sort()).toEqual(nonTouch.sort());
    // R-12/R-38: the pixel snapshots run in the pinned Playwright image (visual-nightly), not here.
    expect(smoke.NIGHTLY_ONLY_PROJECTS).toEqual(['desktop-visual-chromium']);
    expect(smoke.DESKTOP_PROJECTS).not.toContain('desktop-visual-chromium');
  });

  it('maps every non-touch spec to a PR smoke project (testIgnore, not a hand list)', () => {
    // R-11: Playwright matches testMatch/testIgnore regexes against the absolute file path.
    const config = require('../../playwright.config.js');
    const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
    const runsIn = (project, abs) => {
      const match = asList(project.testMatch);
      const matched = match.length ? match.some((re) => re.test(abs)) : /\.(spec|test)\.[cm]?[jt]sx?$/.test(abs);
      return matched && !asList(project.testIgnore).some((re) => re.test(abs));
    };
    const desktop = config.projects.find((p) => p.name === 'desktop-chromium');
    expect(desktop.testMatch).toBeUndefined();
    expect(asList(desktop.testIgnore)).toHaveLength(3);
    const prProjects = config.projects.filter((p) => smoke.DESKTOP_PROJECTS.includes(p.name));
    const dir = path.join(ROOT, 'tests/e2e');
    const specs = fs.readdirSync(dir).filter((f) => f.endsWith('.spec.js'));
    expect(specs.length).toBeGreaterThan(20);
    const orphans = specs.filter((f) => f !== 'visual.spec.js' && !prProjects.some((p) => runsIn(p, path.join(dir, f))));
    expect(orphans).toEqual([]);
    // desktop-chromium runs no touch, visual or iPhone-mini spec.
    expect(runsIn(desktop, path.join(dir, 'touch/harness.spec.js'))).toBe(false);
    expect(runsIn(desktop, path.join(dir, 'visual.spec.js'))).toBe(false);
    expect(runsIn(desktop, path.join(dir, 'iphone-mini.spec.js'))).toBe(false);
    expect(runsIn(desktop, path.join(dir, 'a-brand-new-desktop.spec.js'))).toBe(true);
  });

  it('asks for a JSON report per run on CI, so flakes can be counted', () => {
    const [desktop, touch] = smoke.runs([], true);
    expect(desktop).toContain('--reporter=line,json');
    expect(touch).toContain('--reporter=line,json');
    expect(smoke.runs([], false)[0]).toContain('--reporter=line');
    expect(smoke.JSON_REPORTS).toEqual(['playwright-json/smoke-desktop.json', 'playwright-json/smoke-touch.json']);
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

  it('PW_TOUCH_PROJECTS=0 leaves only the desktop projects (touch runs in the nightly matrix)', () => {
    const off = configProjects({ PW_TOUCH_PROJECTS: '0' });
    expect(off.filter((n) => TOUCH[n])).toEqual([]);
    expect(off.sort()).toEqual([...smoke.DESKTOP_PROJECTS, ...smoke.NIGHTLY_ONLY_PROJECTS].sort());
    expect(configProjects().filter((n) => TOUCH[n]).length).toBe(11);
  });
});

describe('linux pixel snapshots run nightly in the pinned Playwright image (R-38)', () => {
  const visual = job('visual-nightly');
  const lock = require('../../package-lock.json');
  const snapshotDir = path.join(ROOT, 'tests/e2e/visual.spec.js-snapshots');

  it('runs the visual project in the image that matches the locked Playwright version', () => {
    const version = lock.packages['node_modules/@playwright/test'].version;
    expect(require('@playwright/test/package.json').version).toBe(version);
    expect(visual).toContain(`image: mcr.microsoft.com/playwright:v${version}-noble`);
    expect(visual).toContain("if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
    expect(visual).toContain('tests/e2e/visual.spec.js --project=desktop-visual-chromium');
    expect(visual).toContain("ENABLE_SCREENSHOT_VISUALS: '1'");
    // Failed snapshots (expected/actual/diff PNGs) upload even when the run is red.
    const upload = visual.slice(visual.indexOf('- name: Upload snapshot report'));
    expect(upload).toMatch(/if: always\(\)[\s\S]*test-results/);
    // The local regeneration script derives the same image from the installed version.
    const script = fs.readFileSync(path.join(ROOT, 'scripts/test-update-visual-linux.sh'), 'utf8');
    expect(script).toContain('mcr.microsoft.com/playwright:v${PW_VERSION}-noble');
    expect(script).toContain('--platform linux/amd64');
    expect(scripts['test:visual:screenshots']).toContain('scripts/test-update-visual-linux.sh --check');
  });

  it('commits a linux baseline for every snapshot the spec takes, and no other platform', () => {
    const spec = fs.readFileSync(path.join(ROOT, 'tests/e2e/visual.spec.js'), 'utf8');
    const names = [...spec.matchAll(/toHaveScreenshot\('([^']+)\.png'/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThanOrEqual(7);
    const files = fs.readdirSync(snapshotDir).sort();
    expect(files).toEqual(names.map((n) => `${n}-desktop-visual-chromium-linux.png`).sort());
  });
});
