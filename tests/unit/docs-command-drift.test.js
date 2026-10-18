const fs = require('fs');
const path = require('path');

/*
 * The live agent and contributor docs must not name npm scripts or repo files that do not exist.
 * Every Claude session reads CLAUDE.md and AGENTS.md first, so a stale `npm run test:x` there
 * sends every session to a "Missing script" error (branch review MAJOR-1, October 2026).
 * History (CHANGELOG.md, docs/archive/, docs/3d-audit/) is out of scope on purpose.
 */
const ROOT = path.resolve(__dirname, '../..');
const DOCS = [
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
  'docs/testing.md',
  'docs/agentic-harness-strategy.md',
  'docs/test-performance-lessons.md',
  'tests/audit/README.md',
  '.github/pull_request_template.md',
];
// Files a doc names on purpose although they are absent: a deleted file named as history, and a
// file the nightly creates later (docs/testing.md -> Push-Gated Follow-Ups).
const ABSENT_BY_DESIGN = new Set(['src/config/presets.js', 'tests/e2e/touch/journey-status.linux.json']);
const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts;
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// `npm run name`, `npm run test:{a,b}`, and backticked `test:name` (with optional `:sub` suffixes).
function scriptNames(text) {
  const names = new Set();
  for (const m of text.matchAll(/npm run ([a-z][\w:.-]*(?:\{[\w:,.-]+\})?)/g)) {
    const raw = m[1].replace(/[.:]+$/, '');
    const brace = /^(.*)\{([^}]+)\}$/.exec(raw);
    if (brace) brace[2].split(',').forEach((part) => names.add(brace[1] + part));
    else names.add(raw);
  }
  for (const m of text.matchAll(/`(test:[a-z0-9:-]+)/g)) names.add(m[1].replace(/:+$/, ''));
  return names;
}

// Backticked repo paths to concrete files (no placeholders or globs).
function repoPaths(text) {
  const out = new Set();
  for (const m of text.matchAll(/`((?:docs|scripts|tests|src|\.github)\/[\w./-]+\.(?:md|js|cjs|mjs|json|ya?ml|sh))`/g)) out.add(m[1]);
  return out;
}

describe('docs name only npm scripts and files that exist', () => {
  it('parses the brace and suffix forms', () => {
    expect([...scriptNames('npm run test:{unit,e2e} and `test:e2e:touch` then npm run version:sync.')].sort())
      .toEqual(['test:e2e', 'test:e2e:touch', 'test:unit', 'version:sync']);
  });

  for (const doc of DOCS) {
    it(`${doc}: every npm script exists`, () => {
      const missing = [...scriptNames(read(doc))].filter((name) => !Object.prototype.hasOwnProperty.call(scripts, name));
      expect(missing, `${doc} names missing npm scripts`).toEqual([]);
    });

    it(`${doc}: every backticked repo file exists`, () => {
      const missing = [...repoPaths(read(doc))].filter((file) => !ABSENT_BY_DESIGN.has(file) && !fs.existsSync(path.join(ROOT, file)));
      expect(missing, `${doc} names missing files`).toEqual([]);
    });
  }
});
