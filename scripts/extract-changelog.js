#!/usr/bin/env node
// Extracts the release notes for a given version from CHANGELOG.md.
// Usage: node scripts/extract-changelog.js 0.7.0
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) { process.stderr.write('Usage: extract-changelog.js <version>\n'); process.exit(1); }

const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
// Literal heading match (no RegExp built from argv): find `## <version>` then
// take everything up to the next `## ` heading.
const lines = text.split('\n');
const start = lines.findIndex((line) => line.startsWith(`## ${version}`));
let match = null;
if (start !== -1) {
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  if (end === -1) end = lines.length;
  match = [null, lines.slice(start + 1, end).join('\n')];
}
process.stdout.write(match ? match[1].trim() : `Release ${version}`);
