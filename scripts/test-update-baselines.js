#!/usr/bin/env node
/**
 * `npm run test:update`: regenerate every committed golden on purpose.
 *
 * Runs tests/visual plus every test file that reads committed golden values
 * through tests/helpers/golden-values.js, with VECTURA_UPDATE_BASELINES=1.
 * Extra CLI arguments narrow the run (they replace the file list).
 * Refuses to run on a Node major other than 20: goldens hold on CI's pinned
 * major only, so values written on another major would break CI.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'e2e' ? [] : walk(full);
  return entry.isFile() && entry.name.endsWith('.test.js') ? [full] : [];
});

const goldenValueFiles = (root = ROOT) => walk(path.join(root, 'tests'))
  .filter((file) => /require\(['"][^'"]*helpers\/golden-values['"]\)/.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
  .sort();

const targets = (argv = process.argv.slice(2), root = ROOT) => (argv.length ? argv : ['tests/visual', ...goldenValueFiles(root)]);

const GOLDEN_NODE_MAJOR = 20;
// Null when this Node major may write goldens, else the reason it may not.
const nodeRefusal = (version = process.versions.node) => {
  const major = Number(String(version).split('.')[0]);
  return major === GOLDEN_NODE_MAJOR ? null
    : `[test:update] refusing to regenerate goldens on Node ${version}: they hold on Node ${GOLDEN_NODE_MAJOR} only (CI's pinned major, .nvmrc). Switch to Node ${GOLDEN_NODE_MAJOR} and re-run.`;
};

module.exports = { goldenValueFiles, targets, nodeRefusal };

if (require.main === module) {
  const refusal = nodeRefusal();
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
  const files = targets();
  console.log(`[test:update] regenerating goldens in: ${files.join(' ')}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run-vitest.js'), 'run', ...files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VECTURA_UPDATE_BASELINES: '1' },
  });
  process.exit(result.status == null ? 1 : result.status);
}
