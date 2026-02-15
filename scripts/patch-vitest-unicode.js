#!/usr/bin/env node

/**
 * Compatibility patch for Node builds that do not support Unicode property
 * escapes in regular expressions (e.g. \p{L}).
 *
 * Vitest/Vite bundles include a few parse-time regex literals with \p{...}.
 * On unsupported Node builds, Vitest fails before tests start.
 */

const fs = require('fs');
const path = require('path');

const supportsUnicodePropertyEscapes = (() => {
  try {
    // eslint-disable-next-line no-new
    new RegExp('\\p{L}', 'u');
    return true;
  } catch (error) {
    return false;
  }
})();

if (supportsUnicodePropertyEscapes) {
  process.exit(0);
}

const cwd = process.cwd();

const listFiles = (dir, matcher) => {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => matcher.test(name))
    .map((name) => path.join(dir, name));
};

const files = [
  path.join(cwd, 'node_modules/@vitest/utils/dist/index.js'),
  ...listFiles(path.join(cwd, 'node_modules/vitest/dist/chunks'), /^cli-api\..+\.js$/),
  ...listFiles(path.join(cwd, 'node_modules/vite/dist/node/chunks'), /^dep-.+\.js$/),
];

const replacements = [
  [/\\p\{ID_Continue\}/g, 'A-Za-z0-9'],
  [/\\p\{ID_Start\}/g, 'A-Za-z'],
  [/\\p\{Zs\}/g, '\\x20'],
  [/\/\\p\{Surrogate\}\/u/g, '/[\\uD800-\\uDFFF]/'],
  [/\\p\{L\}\\p\{M\}/g, 'A-Za-z'],
];

let patchedFiles = 0;

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  replacements.forEach(([pattern, replacement]) => {
    after = after.replace(pattern, replacement);
  });
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    patchedFiles += 1;
  }
}

if (patchedFiles > 0) {
  console.log(`[patch-vitest-unicode] Patched ${patchedFiles} file(s) for Node ${process.version}.`);
}
