import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { extractChangelog, MAX_NOTES_CHARS } = require('../../scripts/extract-changelog.js');

const GITHUB_LIMIT = 125000;
const header = (v) => `# Changelog\n\n## Unreleased\n\n## ${v} - 2026-01-01\n\n`;

describe('extract-changelog', () => {
  it('returns short sections unchanged', () => {
    const text = `${header('2.0.0')}### Added\n- thing\n\n## 1.9.0\n- old\n`;
    expect(extractChangelog(text, '2.0.0')).toBe('### Added\n- thing');
  });

  it('falls back to a default when the version is missing', () => {
    expect(extractChangelog('# Changelog\n', '9.9.9')).toBe('Release 9.9.9');
  });

  it('truncates oversized sections at a ### boundary and appends the footer', () => {
    const block = (n) => `### Section ${n}\n${'- line of text\n'.repeat(2000)}\n`;
    const text = `${header('2.0.0')}${Array.from({ length: 8 }, (_, i) => block(i)).join('')}## 1.9.0\n- old\n`;
    const out = extractChangelog(text, '2.0.0');
    const footer = '_Release notes truncated. Full notes: https://github.com/j-phi/vectura-studio/blob/v2.0.0/CHANGELOG.md_';
    expect(out.length).toBeLessThanOrEqual(MAX_NOTES_CHARS + footer.length + 2);
    expect(out.endsWith(`\n\n${footer}`)).toBe(true);
    const body = out.slice(0, -(footer.length + 2));
    expect(body.length).toBeLessThanOrEqual(MAX_NOTES_CHARS);
    expect(body.trimEnd().endsWith('- line of text')).toBe(true);
    expect(body).toContain('### Section 0');
    expect(body).not.toContain('### Section 7');
  });

  it('falls back to a line boundary when a single section is too long', () => {
    const text = `${header('2.0.0')}### Huge\n${'- a long-ish line of changelog text\n'.repeat(5000)}`;
    const out = extractChangelog(text, '2.0.0');
    expect(out.length).toBeLessThan(GITHUB_LIMIT);
    expect(out).toContain('_Release notes truncated.');
    expect(out).toContain('blob/v2.0.0/CHANGELOG.md');
    const body = out.split('\n\n_Release notes truncated')[0];
    expect(body.split('\n').every((l) => l === '### Huge' || l === '- a long-ish line of changelog text')).toBe(true);
  });

  it('keeps the real 1.5.0 notes within the GitHub limit', () => {
    const text = fs.readFileSync(path.join(__dirname, '..', '..', 'CHANGELOG.md'), 'utf8');
    const out = extractChangelog(text, '1.5.0');
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(GITHUB_LIMIT);
  });
});
