/*
 * Meridian Step 3.3b (CSS-2) — tombstone test for the legacy `--color-*`
 * token migration.
 *
 * After the Meridian migration replaced every `--color-*` token with its
 * canonical `--ui-*` sibling, no production JS should still call into the
 * skin system asking for a `--color-*` value. The three meridian-*.css
 * alias blocks (`--color-bg: var(--ui-bg);` etc.) were deleted alongside
 * the `--color-accent` special-case branch in `src/render/renderer.js`'s
 * `getThemeToken` helper.
 *
 * This guardrail asserts that every JS file under `src/` is `--color-*`-free
 * for *token reads* — string literals like `'--color-accent'` passed into
 * `getThemeToken` / `getPropertyValue` / `getComputedStyle`. Skin-manager
 * inline cssVars (which legitimately still push `--color-*` for classic
 * skins via `src/config/defaults.js`) are *writes*, not reads, and are
 * excluded by allow-listing the path.
 *
 * If a future commit reintroduces a `--color-*` reader, this test fails
 * before the alias block can be re-added — closing the loop.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(ROOT, 'src');

// Files allowed to mention `--color-*` literals because they only *write* the
// token (via SkinManager inline cssVars), never read it. Keep this list narrow.
const WRITE_ONLY_ALLOWLIST = new Set([
  path.join(SRC, 'config/defaults.js'),
]);

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else if (entry.isFile() && full.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

describe('Meridian CSS-2: no JS reads `--color-*` tokens', () => {
  const files = walk(SRC);

  it('every .js file under src/ is free of `--color-*` string literals (writes excepted)', () => {
    const offenders = [];
    const literalRe = /(['"])--color-[a-zA-Z-]+\1/g;
    for (const file of files) {
      if (WRITE_ONLY_ALLOWLIST.has(file)) continue;
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      lines.forEach((line, idx) => {
        // Strip line comments so we don't false-positive on doc references.
        const code = line.replace(/\/\/.*$/, '');
        if (literalRe.test(code)) {
          offenders.push(`${path.relative(ROOT, file)}:${idx + 1}: ${line.trim()}`);
        }
        literalRe.lastIndex = 0;
      });
    }
    expect(offenders, `\nUnexpected --color-* literals:\n${offenders.join('\n')}\n`).toEqual([]);
  });

  it('renderer.js no longer special-cases `--color-accent` in its token cache', () => {
    const renderer = fs.readFileSync(path.join(SRC, 'render/renderer.js'), 'utf8');
    expect(renderer).not.toMatch(/--color-accent/);
  });

  it('meridian-*.css files no longer ship --color-* alias declarations', () => {
    const skinDir = path.join(SRC, 'ui/skin');
    const skins = ['meridian-dark.css', 'meridian-light.css', 'meridian-lark.css'];
    for (const file of skins) {
      const text = fs.readFileSync(path.join(skinDir, file), 'utf8');
      // Filter out CSS comments before scanning for declarations.
      const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
      const declRe = /^\s*--color-[a-zA-Z-]+\s*:/m;
      expect(declRe.test(stripped), `${file} still declares --color-* aliases`).toBe(false);
    }
  });
});
