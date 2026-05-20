/*
 * CSS-10 (audit-2026-05-20 follow-up) — guardrail test.
 *
 * Asserts that `index.html` no longer contains any inline
 * `style="...display: none..."` declarations. The audit flagged inline
 * display:none as a specificity-fighting anti-pattern; the migration
 * replaces every occurrence with the `.is-hidden` utility class defined
 * in `src/ui/skin/components.css`.
 *
 * If a future change reintroduces an inline `display:none` to index.html,
 * this test fails — prompting the contributor to use the utility class
 * (or, if a one-off inline style is truly required, to update this test
 * with an explicit justification).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('CSS-10: index.html has no inline display:none', () => {
  it('index.html contains zero inline style="...display:none..." declarations', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    // Match any inline style attribute that contains `display:` (any whitespace)
    // followed by `none`. Catches `display:none`, `display: none`,
    // `min-height:6rem; display:none;`, etc.
    const re = /style="[^"]*display\s*:\s*none[^"]*"/gi;
    const matches = html.match(re) || [];
    expect(matches).toEqual([]);
  });
});
