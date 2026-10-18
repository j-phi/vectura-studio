const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * R-15: a Playwright test that fails and then passes on retry is "flaky". The run stays green,
 * so scripts/playwright-flaky.js must surface it (annotation, job summary, main-issue count).
 */
const ROOT = path.resolve(__dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/playwright-flaky.js');
const { flakyTests } = require('../../scripts/playwright-flaky.js');
const roots = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-flaky-')); roots.push(d); return d; };
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

const report = (statuses) => ({
  stats: { flaky: statuses.filter((s) => s === 'flaky').length },
  suites: [{
    title: 'smoke.spec.js', file: 'smoke.spec.js',
    suites: [{
      title: 'toolbar',
      specs: statuses.map((status, i) => ({ title: `case ${i}`, file: 'smoke.spec.js', line: 10 + i, tests: [{ projectName: 'desktop-chromium', status }] })),
    }],
  }],
});
const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_STEP_SUMMARY: '', ...env } });

describe('playwright-flaky', () => {
  it('finds nested flaky tests and ignores expected, skipped and unexpected ones', () => {
    const found = flakyTests(report(['expected', 'flaky', 'skipped', 'unexpected', 'flaky']));
    expect(found.map((t) => t.title)).toEqual(['smoke.spec.js > toolbar > case 1', 'smoke.spec.js > toolbar > case 4']);
    expect(found[0]).toMatchObject({ file: 'smoke.spec.js', line: 11, project: 'desktop-chromium' });
  });

  it('annotates each flake, writes the job summary and the per-job count, and exits 0', () => {
    const dir = tmp();
    const json = path.join(dir, 'r.json');
    fs.writeFileSync(json, JSON.stringify(report(['flaky', 'expected'])));
    const summary = path.join(dir, 'summary.md');
    const out = path.join(dir, 'flaky', 'e2e-smoke.json');
    const r = run(['summarize', '--job', 'e2e-smoke', '--out', out, json, path.join(dir, 'missing.json')], { GITHUB_STEP_SUMMARY: summary });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('::warning file=tests/e2e/smoke.spec.js,line=10,title=Flaky Playwright test (desktop-chromium)::');
    expect(r.stdout).toContain('e2e-smoke: 1 flaky test(s)');
    expect(fs.readFileSync(summary, 'utf8')).toContain('1 test(s) failed once and passed on retry.');
    expect(JSON.parse(fs.readFileSync(out, 'utf8'))).toMatchObject({ job: 'e2e-smoke', flaky: 1 });
  });

  it('stays green and quiet with no flakes, and on a broken report', () => {
    const dir = tmp();
    const json = path.join(dir, 'r.json');
    fs.writeFileSync(json, JSON.stringify(report(['expected'])));
    const clean = run(['summarize', '--job', 'x', json]);
    expect(clean.status).toBe(0);
    expect(clean.stdout).not.toContain('::warning');
    fs.writeFileSync(json, '{not json');
    expect(run(['summarize', '--job', 'x', json]).status).toBe(0);
  });

  it('totals the per-job summaries for the main-issue path', () => {
    const dir = tmp();
    fs.mkdirSync(path.join(dir, 'playwright-flaky-e2e-smoke'));
    fs.mkdirSync(path.join(dir, 'playwright-flaky-touch-e2e-nightly-3'));
    fs.writeFileSync(path.join(dir, 'playwright-flaky-e2e-smoke', 'e2e-smoke.json'), JSON.stringify({ job: 'e2e-smoke', flaky: 0, tests: [] }));
    fs.writeFileSync(path.join(dir, 'playwright-flaky-touch-e2e-nightly-3', 't.json'), JSON.stringify({ job: 'touch-e2e-nightly-3', flaky: 2, tests: [{ project: 'webkit-ipad-portrait', title: 'pinch', file: 'touch/gestures.spec.js', line: 4 }] }));
    const output = path.join(dir, 'gh-output');
    const r = run(['total', dir], { GITHUB_OUTPUT: output });
    expect(r.status).toBe(0);
    expect(fs.readFileSync(output, 'utf8')).toBe('flaky=2\n');
    const body = fs.readFileSync(path.join(dir, 'flaky-body.md'), 'utf8');
    expect(body).toContain('**touch-e2e-nightly-3**: 2');
    expect(body).toContain('webkit-ipad-portrait: pinch (touch/gestures.spec.js:4)');
    expect(body).not.toContain('e2e-smoke**');
    // No artifacts at all (nothing downloaded): count 0.
    const empty = path.join(tmp(), 'none');
    const r0 = run(['total', empty], { GITHUB_OUTPUT: output });
    expect(r0.status).toBe(0);
    expect(fs.readFileSync(output, 'utf8')).toBe('flaky=2\nflaky=0\n');
  });
});
