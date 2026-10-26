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

  it('classifies touch specs by the repo touch dir, not by a "touch/" anywhere in the checkout path', () => {
    // A worktree such as /x/wt-touch/ once made every spec a touch spec, so desktop-chromium ran none.
    const config = require('../../playwright.config.js');
    const desktop = config.projects.find((p) => p.name === 'desktop-chromium');
    const touch = config.projects.find((p) => p.name === 'touch-ipad-portrait');
    const ignored = (abs) => desktop.testIgnore.some((re) => re.test(abs));
    const isTouch = (abs) => [].concat(touch.testMatch).some((re) => re.test(abs));
    for (const root of ['/x/wt-touch', '/x/touch/repo', 'C:\\x\\wt-touch']) {
      const sep = root.includes('\\') ? '\\' : '/';
      const desktopSpec = [root, 'tests', 'e2e', 'foo.spec.js'].join(sep);
      const touchSpec = [root, 'tests', 'e2e', 'touch', 'bar.spec.js'].join(sep);
      expect(ignored(desktopSpec), desktopSpec).toBe(false);
      expect(isTouch(desktopSpec), desktopSpec).toBe(false);
      expect(ignored(touchSpec), touchSpec).toBe(true);
      expect(isTouch(touchSpec), touchSpec).toBe(true);
    }
    expect(isTouch('/x/repo/tests/e2e/touch/bar.spec.js')).toBe(true);
    expect(isTouch('/x/repo/tests/e2e/touch/nested/baz.spec.js')).toBe(true);
    expect(isTouch('/x/repo/tests/e2e/not-touch/foo.spec.js')).toBe(false);
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
    expect(e2e).toContain('run: npm run test:e2e:smoke -- --run="$SMOKE_RUN" --shard="$SMOKE_SHARD"');
    expect(e2e).not.toMatch(/run: npm run test:e2e\s*$/m);
    const timeout = Number((e2e.match(/timeout-minutes: (\d+)/) || [])[1]);
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(60);
  });

  // R-41: the smoke runs as one job per leg. Every run is fully covered by its shards, and the
  // workflow matrix is exactly E2E_SMOKE_LEGS (a leg left out would drop tests silently).
  it('runs as a matrix of legs that covers every shard of every run', () => {
    const e2e = job('e2e-smoke');
    const legs = [...e2e.matchAll(/^ {10}- \{ run: (\w+), shard: (\d+), of: (\d+) \}$/gm)].map((m) => ({ run: m[1], shard: `${m[2]}/${m[3]}` }));
    expect(legs).toEqual(smoke.E2E_SMOKE_LEGS);
    for (const run of smoke.RUN_NAMES) {
      const mine = legs.filter((l) => l.run === run).map((l) => l.shard.split('/').map(Number));
      expect(mine.length, run).toBeGreaterThan(0);
      const total = mine[0][1];
      expect(mine.every(([, n]) => n === total), run).toBe(true);
      expect(mine.map(([i]) => i)).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    }
    expect(e2e).toContain('fail-fast: false');
    expect(e2e).toContain("browsers: ${{ matrix.run == 'touch' && 'chromium webkit' || 'chromium' }}");
    // One flake summary per leg, from that leg's own JSON report (R-15 still sees every shard).
    expect(e2e).toContain('--job "e2e-smoke-$SMOKE_LEG"');
    expect(e2e).toContain('"playwright-json/smoke-$SMOKE_RUN.json"');
    expect(e2e).toContain('name: playwright-flaky-e2e-smoke-${{ matrix.run }}-${{ matrix.shard }}');
    expect(e2e).toContain('name: playwright-report-e2e-smoke-${{ matrix.run }}-${{ matrix.shard }}');
    smoke.RUN_NAMES.forEach((r, i) => expect(smoke.JSON_REPORTS[i]).toBe(`playwright-json/smoke-${r}.json`));
  });

  // R-41: a journey cell with no ledger for its platform only annotates (it cannot fail), so the PR
  // smoke leaves the record-only cells out and keeps the gating ones.
  it('leaves record-only journey cells out of the touch run, and keeps gating ones', () => {
    const { readLedger } = require('../../tests/e2e/touch/journey-ledger-file.js');
    const exclude = `--grep-invert=${smoke.JOURNEY_CELLS}`;
    expect(smoke.runs([], true, false)[1]).toContain(exclude);
    expect(smoke.runs([], true, true)[1]).not.toContain(exclude);
    expect(smoke.runs([], true, false)[0]).not.toContain(exclude);
    expect(smoke.journeysGate(null)).toBe(false);
    expect(smoke.journeysGate({ projects: ['touch-coarse-wide'] })).toBe(false);
    expect(smoke.journeysGate({ projects: ['webkit-ipad-portrait'] })).toBe(true);
    // The darwin ledger pins both smoke projects, so a local smoke run gates on every journey.
    const darwin = readLedger('darwin');
    smoke.TOUCH_SMOKE_PROJECTS.forEach((p) => expect(darwin.projects, p).toContain(p));
    // The excluded title is the journey describe, not the harness self-test describe.
    const spec = fs.readFileSync(path.join(ROOT, 'tests/e2e/touch/journeys.spec.js'), 'utf8');
    expect(spec).toContain(`test.describe('${smoke.JOURNEY_CELLS}'`);
    expect('harness self-test').not.toContain(smoke.JOURNEY_CELLS);
  });

  it('--run picks one run and leaves the other arguments for Playwright', () => {
    expect(smoke.parseArgs(['--run=touch', '--shard=1/1'])).toEqual({ only: ['touch'], extra: ['--shard=1/1'] });
    expect(smoke.parseArgs([])).toEqual({ only: smoke.RUN_NAMES, extra: [] });
    expect(() => smoke.parseArgs(['--run=desktp'])).toThrow(/unknown --run=desktp/);
    expect(() => smoke.parseArgs(['--run='])).toThrow(/unknown --run=/);
  });
});

describe('full touch roster runs nightly', () => {
  // The matrix `include:` legs: { project, shard, of }, one flow mapping per line.
  const legs = (text) => [...text.matchAll(/^\s+- \{ project: ([a-z-]+), shard: (\d+), of: (\d+) \}$/gm)]
    .map(([, project, shard, of]) => ({ project, shard: Number(shard), of: Number(of) }));

  it('a nightly/dispatch matrix runs every touch spec once per touch project, in per-project legs', () => {
    const nightly = job('touch-e2e-nightly');
    expect(nightly).toContain("if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
    expect(Object.keys(TOUCH).length).toBe(11);
    const byProject = {};
    legs(nightly).forEach((l) => { (byProject[l.project] = byProject[l.project] || []).push(l); });
    // Every touch project, and nothing else.
    expect(Object.keys(byProject).sort()).toEqual(Object.keys(TOUCH).sort());
    // Each project's shards are exactly 1..of with one `of`, so no slice runs twice or never.
    for (const [project, list] of Object.entries(byProject)) {
      const of = list[0].of;
      expect(list.every((l) => l.of === of), project).toBe(true);
      expect(list.map((l) => l.shard).sort((a, b) => a - b), project).toEqual(Array.from({ length: of }, (_, i) => i + 1));
    }
    // WebKit is the slower engine: a WebKit project never gets fewer legs than its Chromium twin.
    for (const [project, { device, engine }] of Object.entries(TOUCH)) {
      if (engine !== 'webkit') continue;
      const twin = Object.entries(TOUCH).find(([, p]) => p.engine === 'chromium' && p.device === device)[0];
      expect(byProject[project].length, `${project} vs ${twin}`).toBeGreaterThanOrEqual(byProject[twin].length);
    }
    // One project and one slice per leg; the leg installs only its own engine.
    expect(nightly).toContain('--project="$TOUCH_PROJECT" --shard="$TOUCH_SHARD"');
    expect(nightly).toContain('TOUCH_PROJECT: ${{ matrix.project }}');
    expect(nightly).toContain('TOUCH_SHARD: ${{ matrix.shard }}/${{ matrix.of }}');
    expect(nightly).toContain("startsWith(matrix.project, 'webkit-') && 'webkit' || 'chromium'");
    expect(nightly).not.toMatch(/--project='touch-\*'/);
    // A broken leg stops after a bounded number of final failures (retries still flag flakes).
    expect(nightly).toMatch(/--max-failures=\d+/);
    // Artifact names are unique per leg (a duplicate name would overwrite another leg's upload).
    expect(nightly).toContain('name: playwright-flaky-touch-e2e-nightly-${{ matrix.project }}-${{ matrix.shard }}');
    expect(nightly).toContain('name: touch-e2e-${{ matrix.project }}-${{ matrix.shard }}');
  });

  it('the legs cover every touch spec: the targets-* files run fullyParallel so --shard splits inside them', () => {
    // A serial targets-* file is one shard group; the legs are sized on the assumption it is not.
    const dir = path.join(ROOT, 'tests/e2e/touch');
    const targets = fs.readdirSync(dir).filter((f) => /^targets-.*\.spec\.js$/.test(f));
    expect(targets.length).toBeGreaterThan(0);
    for (const f of targets) expect(fs.readFileSync(path.join(dir, f), 'utf8'), f).toMatch(/mode: 'parallel'/);
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
