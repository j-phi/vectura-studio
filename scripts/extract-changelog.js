#!/usr/bin/env node
// Extracts the release notes for a given version from CHANGELOG.md.
// Usage: node scripts/extract-changelog.js 0.7.0
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
if (!version) { process.stderr.write('Usage: extract-changelog.js <version>\n'); process.exit(1); }

const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const escaped = version.replace(/\./g, '\\.');
const match = text.match(new RegExp(`## ${escaped}[^\n]*\n([\\s\\S]*?)(?=\n## |$)`));
process.stdout.write(match ? match[1].trim() : `Release ${version}`);
