/*
 * Redundancy-1 PR1 — escapeHtml consolidation guard.
 *
 * Asserts:
 *  (a) Vectura.UI.utils.escapeHtml is defined, callable, and escapes the five
 *      XSS-relevant characters ( & < > " ' ).
 *  (b) Only ONE definition of `escapeHtml` exists across src/ — guards against
 *      future duplication that re-introduces the latent XSS divergence flagged
 *      in docs/audit-2026-05-20.md.
 */
const fs = require('fs');
const path = require('path');
const { loadUIComponent } = require('../helpers/load-ui-component');

const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};

describe('escapeHtml has a single canonical source', () => {
  test('Vectura.UI.utils.escapeHtml escapes &, <, >, ", and \'', () => {
    const runtime = loadUIComponent(['utils']);
    try {
      const { escapeHtml } = runtime.window.Vectura.UI.utils;
      expect(typeof escapeHtml).toBe('function');
      // Core XSS payload
      expect(escapeHtml('<script>alert("x")</script>'))
        .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
      // Single chars
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
      expect(escapeHtml('"')).toBe('&quot;');
      expect(escapeHtml("'")).toBe('&#39;');
      // & must be escaped first to avoid double-escaping
      expect(escapeHtml('&amp;')).toBe('&amp;amp;');
      // Non-string coercion: must not throw and must not return a non-string.
      expect(typeof escapeHtml(null)).toBe('string');
      expect(typeof escapeHtml(undefined)).toBe('string');
      expect(typeof escapeHtml(42)).toBe('string');
      // The numeric coercion should still produce a string for inert input.
      expect(escapeHtml(42)).toBe('42');
    } finally {
      runtime.cleanup();
    }
  });

  test('only one escapeHtml implementation exists in src/', () => {
    const files = walk(SRC_DIR);
    // Match a *local implementation* of escapeHtml — i.e. a binding whose RHS
    // is a function (arrow or `function` keyword) or a `function escapeHtml(`
    // declaration. This deliberately does NOT match:
    //   - trivial aliases like `const escapeHtml = window.Vectura.UI.utils.escapeHtml;`
    //   - property registrations like `UI.utils.escapeHtml = ...`
    //   - DI-bag references like `const { escapeHtml } = requireDeps(...)`
    // It DOES match the semantic threat the audit flagged: a duplicated
    // function body that can diverge from the canonical one over time.
    const defRe = /(?:^|[^.\w])(?:function\s+escapeHtml\s*\(|(?:const|let|var)\s+escapeHtml\s*=\s*(?:\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>|function\b))/g;
    const hits = [];
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      const matches = src.match(defRe);
      if (matches && matches.length) {
        hits.push({ file: path.relative(ROOT, file), count: matches.length });
      }
    }
    const total = hits.reduce((acc, h) => acc + h.count, 0);
    expect({ total, hits }).toEqual({
      total: 1,
      hits: [{ file: 'src/ui/utils.js', count: 1 }],
    });
  });
});
