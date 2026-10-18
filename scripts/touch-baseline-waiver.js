'use strict';
// TUX-058 req 5: tests/e2e/touch/target-baseline.json may not get worse without a `TUX-WAIVER:` line in the
// commit body. `raisedCells` compares two baseline objects; `unwaivedCommits` walks a git range.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = 'tests/e2e/touch/target-baseline.json';
// Commits that cannot carry a TUX-WAIVER line (already made, history is never rewritten) are recorded here, each with a reason.
const LEDGER = path.join(ROOT, 'docs/touch-audit/baseline-waivers.json');
const ledgerWaived = (sha) => {
  try {
    const l = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    return Object.entries(l.waivers || {}).some(([k, why]) => k.length >= 8 && sha.startsWith(k) && typeof why === 'string' && why.trim().length >= 20);
  } catch (_) { return false; }
};
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

// Commits after this one are checked. Earlier ones seeded and re-seeded the baseline before the rule existed.
const ANCHOR = '6711d22a';
// A date before the anchor's commit date (2026-10-16). CI fetches history back to here, never the whole repo.
const ANCHOR_SINCE = '2026-10-15';

const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
const hasCommit = (rev, cwd) => { try { git(['cat-file', '-e', `${rev}^{commit}`], cwd); return true; } catch (_) { return false; } };
const readAt = (sha, cwd) => { try { return JSON.parse(git(['show', `${sha}:${FILE}`], cwd)); } catch (_) { return null; } };

// Commits in `range` that touch the baseline, raise a cell and carry no TUX-WAIVER line.
// A commit whose parent is missing (a shallow clone cut too short) throws: the rule never passes unchecked.
const unwaivedCommits = (range, { cwd = ROOT } = {}) => {
  const shas = git(['log', '--format=%H', range, '--', FILE], cwd).split('\n').filter(Boolean);
  const shallowFile = path.resolve(cwd, git(['rev-parse', '--git-path', 'shallow'], cwd).trim());
  const shallow = new Set(fs.existsSync(shallowFile) ? fs.readFileSync(shallowFile, 'utf8').split('\n').filter(Boolean) : []);
  const bad = [];
  shas.forEach((sha) => {
    const isRoot = !shallow.has(sha) && !git(['rev-list', '--parents', '-n', '1', sha], cwd).trim().split(' ')[1];
    if (!isRoot && !hasCommit(`${sha}^`, cwd)) {
      throw new Error(`touch-baseline-waiver: the parent of ${sha.slice(0, 8)} is not in this clone. Fetch more history.`);
    }
    const before = isRoot ? null : readAt(`${sha}^`, cwd);
    const after = readAt(sha, cwd);
    if (!before || !after) return;
    const raised = raisedCells(before, after);
    if (!raised.length) return;
    const body = git(['log', '-1', '--format=%B', sha], cwd);
    if (!/^TUX-WAIVER:/m.test(body) && !ledgerWaived(sha)) bad.push({ sha, raised });
  });
  return bad;
};

// The live rule: every commit after ANCHOR. A missing anchor fails loudly (exit 2), it never passes.
const checkSinceAnchor = ({ cwd = ROOT } = {}) => {
  if (!hasCommit(ANCHOR, cwd)) {
    throw new Error(`touch-baseline-waiver: anchor ${ANCHOR} is not in this clone. Fetch history with git fetch --shallow-since=${ANCHOR_SINCE}.`);
  }
  return unwaivedCommits(`${ANCHOR}..HEAD`, { cwd });
};

module.exports = { raisedCells, unwaivedCommits, checkSinceAnchor, FILE, ANCHOR, ANCHOR_SINCE };
if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--anchor-since') {
    process.stdout.write(`${ANCHOR_SINCE}\n`);
    process.exit(0);
  }
  let bad;
  try {
    bad = arg === '--since-anchor' ? checkSinceAnchor() : unwaivedCommits(arg || 'origin/main..HEAD');
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  bad.forEach((b) => console.error(`${b.sha.slice(0, 8)} raises the touch baseline without a TUX-WAIVER line:\n  ${b.raised.slice(0, 5).join('\n  ')}`));
  if (!bad.length) console.log(`touch-baseline-waiver: ok (${arg || 'origin/main..HEAD'})`);
  process.exit(bad.length ? 1 : 0);
}
