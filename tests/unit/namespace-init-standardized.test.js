/*
 * Tombstone test for Redundancy-2 (audit-2026-05-20-followups).
 *
 * Standardizes every src/ file on the newer namespace-init form:
 *   const Vectura = (window.Vectura = window.Vectura || {});
 *
 * The older bare form
 *   window.Vectura = window.Vectura || {};
 * is forbidden in src/.
 *
 * This also locks in the fix for two previously-fragile callers that
 * referenced `Vectura.UI` without first ensuring `Vectura` existed —
 * `src/ui/shortcuts.js` and `src/ui/persistence.js`. They now both
 * derive a local `Vectura` alias before any `.UI` access.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
};

const allJsFiles = walk(SRC);

// The forbidden bare form: must NOT be preceded by `const Vectura = (` or `= (`.
// Detect any line whose trimmed prefix is exactly the bare assignment.
const BARE_RE = /^\s*window\.Vectura\s*=\s*window\.Vectura\s*\|\|\s*\{\}\s*;?\s*$/m;

describe('Redundancy-2: namespace init is standardized', () => {
  it('no src/ file uses the bare `window.Vectura = window.Vectura || {};` form', () => {
    const offenders = [];
    for (const file of allJsFiles) {
      const text = fs.readFileSync(file, 'utf8');
      if (BARE_RE.test(text)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders, `Files still using the old bare form:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('shortcuts.js derives a local Vectura alias before any Vectura.UI access', () => {
    const file = path.join(SRC, 'ui/shortcuts.js');
    const text = fs.readFileSync(file, 'utf8');
    // Must contain a local alias assignment (handles either `G.Vectura` or `window.Vectura`).
    const hasAlias = /const\s+Vectura\s*=\s*(?:\(?\s*)?(?:G|window)\.Vectura/.test(text);
    expect(hasAlias, 'shortcuts.js must alias Vectura locally before reading .UI').toBe(true);
    // Must NOT use the bare `window.Vectura.UI = window.Vectura.UI || {}` shape
    // that crashes when window.Vectura is undefined at load time.
    const naive = /window\.Vectura\.UI\s*=\s*window\.Vectura\.UI/.test(text);
    expect(naive, 'shortcuts.js must not access window.Vectura.UI without ensuring window.Vectura exists').toBe(false);
  });

  it('persistence.js derives a local Vectura alias before any Vectura.UI access', () => {
    const file = path.join(SRC, 'ui/persistence.js');
    const text = fs.readFileSync(file, 'utf8');
    const hasAlias = /const\s+Vectura\s*=\s*(?:\(?\s*)?(?:G|window)\.Vectura/.test(text);
    expect(hasAlias, 'persistence.js must alias Vectura locally before reading .UI').toBe(true);
    const naive = /window\.Vectura\.UI\s*=\s*window\.Vectura\.UI/.test(text);
    expect(naive, 'persistence.js must not access window.Vectura.UI without ensuring window.Vectura exists').toBe(false);
  });
});
