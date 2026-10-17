/**
 * TUX-058 req 5: the touch target baseline cannot be raised without a TUX-WAIVER line in the commit body.
 * Fixture cases prove the comparison. The live case walks the commits after the enforcement anchor.
 */
const { execFileSync } = require('child_process');
const { raisedCells, unwaivedCommits } = require('../../scripts/touch-baseline-waiver');

// Commits after this one are checked. Earlier ones seeded and re-seeded the baseline before the rule existed.
const ANCHOR = '6711d22a';

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

  test('no commit after the anchor raises the baseline without TUX-WAIVER', () => {
    let known = true;
    try { execFileSync('git', ['cat-file', '-e', `${ANCHOR}^{commit}`], { stdio: 'ignore' }); } catch (_) { known = false; }
    if (!known) return; // shallow clone: the anchor is not here
    expect(unwaivedCommits(`${ANCHOR}..HEAD`)).toEqual([]);
  });
});
