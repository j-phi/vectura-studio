#!/usr/bin/env node
/**
 * `npm run test:update`: regenerate every committed golden on purpose.
 *
 * Runs tests/visual plus every test file that reads committed golden values
 * through tests/helpers/golden-values.js, with VECTURA_UPDATE_BASELINES=1.
 * Extra CLI arguments narrow the run (they replace the file list).
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

module.exports = { goldenValueFiles, targets };

if (require.main === module) {
  const files = targets();
  console.log(`[test:update] regenerating goldens in: ${files.join(' ')}`);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'run-vitest.js'), 'run', ...files], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VECTURA_UPDATE_BASELINES: '1' },
  });
  process.exit(result.status == null ? 1 : result.status);
}
