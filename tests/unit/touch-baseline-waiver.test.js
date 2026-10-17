/**
 * TUX-058 req 5: the touch target baseline cannot be raised without a TUX-WAIVER line in the commit body.
 * Fixture cases prove the comparison. The git walk runs against a throwaway repo, so this file needs no
 * repository history. The live rule (every commit after the anchor) runs in CI as its own step:
 * `node scripts/touch-baseline-waiver.js --since-anchor` in the perf job, which fails loudly on a missing anchor.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { raisedCells, unwaivedCommits, checkSinceAnchor, FILE } = require('../../scripts/touch-baseline-waiver');

describe('touch baseline waiver rule', () => {
  const base = { darwin: { 'p|s': { under44: 2, covered: 5, reachable: 40, canvasPct: 60 } } };

  test('a lower-is-better metric that rises is a raise', () => {
    const now = { darwin: { 'p|s': { under44: 3, covered: 5, reachable: 40, canvasPct: 60 } } };
    expect(raisedCells(base, now)).toEqual(['darwin/p|s under44 2 -> 3']);
  });

  test('a higher-is-better metric that falls is a raise, canvasPct has 1 pp of tolerance', () => {
    expect(raisedCells(base, { darwin: { 'p|s': { under44: 2, covered: 5, reachable: 39, canvasPct: 59.5 } } })).toEqual(['darwin/p|s reachable 40 -> 39']);
    expect(raisedCells(base, { darwin: { 'p|s': { under44: 2, covered: 5, reachable: 40, canvasPct: 58.5 } } })).toEqual(['darwin/p|s canvasPct 60 -> 58.5']);
  });

  test('canvasPct of an open-menu state is record-only (Q21)', () => {
    const a = { darwin: { 'p|menu-file': { canvasPct: 50 } } };
    expect(raisedCells(a, { darwin: { 'p|menu-file': { canvasPct: 30 } } })).toEqual([]);
  });

  test('gains, new cells and unchanged cells are not raises', () => {
    const now = { darwin: { 'p|s': { under44: 1, covered: 5, reachable: 41, canvasPct: 61 }, 'p|new': { under44: 9 } } };
    expect(raisedCells(base, now)).toEqual([]);
  });

  test('the waiver ledger holds a reason for each recorded sha', () => {
    const l = require('../../docs/touch-audit/baseline-waivers.json');
    expect(Object.keys(l.waivers)).toEqual(expect.arrayContaining(['13b7d04b', '16bb75ee']));
    Object.entries(l.waivers).forEach(([sha, why]) => {
      expect(sha).toMatch(/^[0-9a-f]{8,40}$/);
      expect(why.trim().length).toBeGreaterThanOrEqual(20);
    });
  });

  test('the 16bb75ee reason matches its commit: integration drift from c992cc9c, not TUX-052', () => {
    const why = require('../../docs/touch-audit/baseline-waivers.json').waivers['16bb75ee'];
    expect(why).toContain('c992cc9c');
    expect(why).toMatch(/not TUX-052/);
    expect(why).not.toMatch(/from the new page/);
  });

  describe('git walk (throwaway repo)', () => {
    let dir;
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const commitBaseline = (under44, message) => {
      fs.mkdirSync(path.join(dir, path.dirname(FILE)), { recursive: true });
      fs.writeFileSync(path.join(dir, FILE), JSON.stringify({ darwin: { 'p|s': { under44 } } }));
      git('add', FILE);
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', message);
      return git('rev-parse', 'HEAD');
    };

    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tux-waiver-'));
      git('init', '-q');
    });
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('flags a raise without TUX-WAIVER, accepts a waived raise and a gain', () => {
      const seed = commitBaseline(2, 'seed');
      const raise = commitBaseline(3, 'raise without waiver');
      commitBaseline(4, 'raise with waiver\n\nTUX-WAIVER: deliberate for this test');
      commitBaseline(1, 'gain');
      const bad = unwaivedCommits(`${seed}..HEAD`, { cwd: dir });
      expect(bad.map((b) => b.sha)).toEqual([raise]);
      expect(bad[0].raised).toEqual(['darwin/p|s under44 2 -> 3']);
    });

    test('a missing anchor fails loudly instead of passing', () => {
      expect(() => checkSinceAnchor({ cwd: dir })).toThrow(/anchor .* is not in this clone/);
    });

    test('a shallow clone cut above a baseline commit fails loudly instead of skipping it', () => {
      const shallow = fs.mkdtempSync(path.join(os.tmpdir(), 'tux-waiver-shallow-'));
      try {
        execFileSync('git', ['clone', '-q', '--depth', '1', `file://${dir}`, shallow], { stdio: 'ignore' });
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: shallow, encoding: 'utf8' }).trim();
        expect(() => unwaivedCommits(head, { cwd: shallow })).toThrow(/is not in this clone/);
      } finally {
        fs.rmSync(shallow, { recursive: true, force: true });
      }
    });
  });
});
