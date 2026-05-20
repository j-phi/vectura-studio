/*
 * v1.1.10 audit Redundancy-5 — guardrail test.
 *
 * Asserts that no production `.js` file under `src/` contains the substring
 * `_ui-legacy.js`. The legacy UI shim file was deleted in Meridian Unit 1.10
 * (tracked separately by `legacy-file-removed.test.js`); this test catches
 * stale doc-comments that still reference the dead file.
 *
 * The only `_ui-legacy.js` references that remain in the repo live in:
 *   - tests/unit/legacy-file-removed.test.js   (the deletion tombstone)
 *   - tests/unit/legacy-comments-removed.test.js (this file — necessarily
 *     mentions the string in its own description)
 *   - docs/ (historical audit narrative)
 *   - git history
 *
 * If a future agent re-introduces a `_ui-legacy.js` comment breadcrumb in
 * production source, this test fails — preventing the codebase from
 * accumulating references to a file that no longer exists.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');
const NEEDLE = '_ui-legacy.js';

function walkJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJs(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

describe('v1.1.10 audit Redundancy-5: stale _ui-legacy.js doc-comments removed', () => {
  it('no production .js file under src/ references _ui-legacy.js', () => {
    const offenders = [];
    for (const file of walkJs(SRC)) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(NEEDLE)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
