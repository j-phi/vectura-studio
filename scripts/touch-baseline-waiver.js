'use strict';
// TUX-058 req 5: tests/e2e/touch/target-baseline.json may not get worse without a `TUX-WAIVER:` line in the
// commit body. `raisedCells` compares two baseline objects; `unwaivedCommits` walks a git range.
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = 'tests/e2e/touch/target-baseline.json';
// dir 'lower' = a bigger number is worse; 'higher' = a smaller number is worse (canvasPct has a 1.0 pp tolerance).
const DIRS = {
  hOverflow: ['lower', 0], vOverflow: ['lower', 0], innerWidthExcess: ['lower', 0], under44: ['lower', 0], under24: ['lower', 0],
  wcag258Fail: ['lower', 0], iosZoom: ['lower', 0], covered: ['lower', 0], safeUnprotected: ['lower', 0], ghost: ['lower', 0],
  stranded: ['lower', 0], pageErrors: ['lower', 0], reachable: ['higher', 0], canvasPct: ['higher', 1.0],
};

const raisedCells = (before, after) => {
  const out = [];
  Object.keys(after || {}).forEach((platform) => {
    if (platform.startsWith('_')) return;
    const a = after[platform] || {};
    const b = (before || {})[platform] || {};
    Object.keys(a).forEach((cell) => {
      if (!b[cell]) return; // a new cell is seeding, not a raise
      Object.entries(DIRS).forEach(([id, [dir, tol]]) => {
        if (id === 'canvasPct' && /\|menu-/.test(cell)) return; // Q21: recorded, never ratcheted
        const was = b[cell][id];
        const now = a[cell][id];
        if (typeof was !== 'number' || typeof now !== 'number') return;
        if (dir === 'lower' ? now > was + tol : now < was - tol) out.push(`${platform}/${cell} ${id} ${was} -> ${now}`);
      });
    });
  });
  return out;
};

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
const readAt = (sha) => { try { return JSON.parse(git(['show', `${sha}:${FILE}`])); } catch (_) { return null; } };

// Commits in `range` that touch the baseline, raise a cell and carry no TUX-WAIVER line.
const unwaivedCommits = (range) => {
  const shas = git(['log', '--format=%H', range, '--', FILE]).split('\n').filter(Boolean);
  const bad = [];
  shas.forEach((sha) => {
    const before = readAt(`${sha}^`);
    const after = readAt(sha);
    if (!before || !after) return;
    const raised = raisedCells(before, after);
    if (!raised.length) return;
    const body = git(['log', '-1', '--format=%B', sha]);
    if (!/^TUX-WAIVER:/m.test(body)) bad.push({ sha, raised });
  });
  return bad;
};

module.exports = { raisedCells, unwaivedCommits, FILE };
if (require.main === module) {
  const bad = unwaivedCommits(process.argv[2] || 'origin/main..HEAD');
  bad.forEach((b) => console.error(`${b.sha.slice(0, 8)} raises the touch baseline without a TUX-WAIVER line:\n  ${b.raised.slice(0, 5).join('\n  ')}`));
  process.exit(bad.length ? 1 : 0);
}
