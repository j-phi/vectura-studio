/*
 * Meridian Unit 1.10 (2026-05-20) — guardrail test.
 *
 * Asserts that the legacy UI shim file `src/ui/_ui-legacy.js` no longer
 * exists on disk and that it is no longer referenced from `index.html`.
 * The IIFE-local helpers, satellite bootstrap block, and `class UI` stub
 * that lived in that file were consolidated into `src/ui/ui.js`.
 *
 * If a future agent re-creates the file or wires it back into the script
 * load order, this test fails — preventing accidental reintroduction of
 * the load-order trip-wire the unit was designed to remove.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Meridian Unit 1.10: _ui-legacy.js deletion', () => {
  it('src/ui/_ui-legacy.js no longer exists', () => {
    const legacyPath = path.join(ROOT, 'src/ui/_ui-legacy.js');
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  it('index.html no longer loads _ui-legacy.js', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<script[^>]*_ui-legacy\.js/);
  });
});
