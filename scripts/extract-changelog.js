#!/usr/bin/env node
// Extracts the release notes for a given version from CHANGELOG.md.
// Usage: node scripts/extract-changelog.js 0.7.0
const fs = require('fs');
const path = require('path');

// GitHub rejects release bodies over 125,000 characters (HTTP 422); keep headroom
// for the truncation footer.
const MAX_NOTES_CHARS = 120000;

const truncationFooter = (version) =>
  `\n\n_Release notes truncated. Full notes: https://github.com/j-phi/vectura-studio/blob/v${version}/CHANGELOG.md_`;

// Cut `body` to at most `max` chars: prefer the last `### ` heading boundary,
// else the last line boundary, else a hard cut.
const truncateNotes = (body, max) => {
  const head = body.slice(0, max);
  const heading = head.lastIndexOf('\n### ');
  if (heading > 0) return head.slice(0, heading).trimEnd();
  // A cut landing exactly on a heading boundary (body[max] begins a new line).
  if (body[max] === '\n' && body.startsWith('### ', max + 1) && max > 0) return head.trimEnd();
  const newline = head.lastIndexOf('\n');
  return (newline > 0 ? head.slice(0, newline) : head).trimEnd();
};

// Literal heading match (no RegExp built from input): find `## <version>` then
// take everything up to the next `## ` heading.
function extractChangelog(text, version, maxChars = MAX_NOTES_CHARS) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.startsWith(`## ${version}`));
  if (start === -1) return `Release ${version}`;
  let end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  if (end === -1) end = lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  if (body.length <= maxChars) return body;
  return truncateNotes(body, maxChars) + truncationFooter(version);
}

module.exports = { extractChangelog, MAX_NOTES_CHARS };

if (require.main === module) {
  const version = process.argv[2];
  if (!version) { process.stderr.write('Usage: extract-changelog.js <version>\n'); process.exit(1); }
  const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  process.stdout.write(extractChangelog(text, version));
}
