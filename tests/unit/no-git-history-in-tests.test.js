/**
 * D-4 / R-18 guard: no test reads git history.
 *
 * A fix commits a test of the CURRENT contract. The RED proof goes in the
 * commit or PR message. A test must never rebuild an old tree (`git show
 * <sha>:path`, `git cat-file`, `git archive`, a pinned SHA fed to
 * `scriptOverrides`): CI clones with fetch-depth 1, and a pinned-tree compare
 * is a change detector that breaks when unrelated work lands.
 *
 * A drift guard ("this output must not change") reads committed goldens
 * through tests/helpers/golden-values.js. A mutation proof patches the LIVE
 * source (fs.readFileSync + replace), never an old revision.
 *
 * Any file under tests/ that starts the git binary must be in ALLOWED below,
 * with a reason. Allowed files still may not use history subcommands.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const SELF = 'tests/unit/no-git-history-in-tests.test.js';

// Files that genuinely need the git binary. None of them reads this repository's history.
const ALLOWED = {
  // Builds a throwaway repo in os.tmpdir() to drive the pre-push hook.
  'tests/unit/test-lane.test.js': 'throwaway repo for the pre-push hook',
  // Builds a throwaway repo (and a shallow clone of it) to drive the TUX-058 waiver walk.
  'tests/unit/touch-baseline-waiver.test.js': 'throwaway repo for the waiver walk',
  // Stamps `rev-parse --short HEAD` into evidence metadata; tolerates a failure.
  'tests/e2e/touch/target-audit.spec.js': 'HEAD sha for evidence metadata',
};

// Starting the git binary: execFileSync('git', ...), spawnSync("git"), execSync(`git show ...`), etc.
const GIT_CALL = /\b(?:exec|execFile|spawn|fork)(?:Sync)?\(\s*['"`]git\b/;
// History subcommands as a git argument ('show', "cat-file", ...) or in a shell string.
const HISTORY_ARG = /['"`](?:show|cat-file|archive|ls-tree)['"`]|['"`]git\s+(?:show|cat-file|archive|ls-tree)\b/;
// Old helpers that rebuilt pre-fix trees from history.
const HISTORY_HELPER = /require\(['"][^'"]*helpers\/pre-wip-surface-fill['"]\)/;

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full);
  return /\.(?:c|m)?js$/.test(entry.name) ? [full] : [];
});

// Comments may describe the old RED proofs (`git show <sha>:path`); only code counts.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');

const scan = (root = ROOT) => walk(path.join(root, 'tests')).map((file) => ({
  rel: path.relative(root, file).split(path.sep).join('/'),
  src: stripComments(fs.readFileSync(file, 'utf8')),
})).filter(({ rel }) => rel !== SELF);

describe('no test reads git history (R-18, D-4)', () => {
  const files = scan();

  test('the scan sees the test tree', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  test('only allow-listed files start the git binary', () => {
    const offenders = files.filter(({ rel, src }) => GIT_CALL.test(src) && !ALLOWED[rel]).map(({ rel }) => rel);
    expect(offenders, 'Read committed goldens (tests/helpers/golden-values.js) or patch the live source instead.').toEqual([]);
  });

  test('allow-listed files exist, still start git, and use no history subcommand', () => {
    Object.keys(ALLOWED).forEach((rel) => {
      const entry = files.find((f) => f.rel === rel);
      expect(entry, `${rel} is allow-listed but missing; drop it from ALLOWED`).toBeTruthy();
      expect(GIT_CALL.test(entry.src), `${rel} no longer starts git; drop it from ALLOWED`).toBe(true);
      expect(HISTORY_ARG.test(entry.src), `${rel} uses a git history subcommand`).toBe(false);
    });
  });

  test('no file loads the retired pre-fix-tree helper', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/helpers/pre-wip-surface-fill.js'))).toBe(false);
    expect(files.filter(({ src }) => HISTORY_HELPER.test(src)).map(({ rel }) => rel)).toEqual([]);
  });

  test('the patterns catch the shapes this repo used before R-18', () => {
    expect(GIT_CALL.test("execFileSync('git', ['show', `${SHA}:${REL}`])")).toBe(true);
    expect(GIT_CALL.test('execSync(`git cat-file -e ${sha}`)')).toBe(true);
    expect(GIT_CALL.test("spawnSync(\"git\", ['archive', sha])")).toBe(true);
    expect(GIT_CALL.test(stripComments("// execFileSync('git', ['show', 'abc:x.js'])"))).toBe(false);
    expect(GIT_CALL.test(stripComments("/* execFileSync('git', ['show']) */ const a = 1;"))).toBe(false);
    expect(HISTORY_ARG.test("git('show', `${sha}:${FILE}`)")).toBe(true);
    expect(HISTORY_ARG.test("git('init', '-q')")).toBe(false);
  });
});
