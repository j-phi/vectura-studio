import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TUX-005: every safe-area consumer reads var(--safe-*). The only raw env(safe-area-inset-*) lives
// in the :root tokens in tokens.css. WebKit cannot emulate env(), so e2e injects the tokens; this
// guard keeps every consumer on the tokens so the injection reaches all of them.
const root = path.resolve(__dirname, '..', '..');
const skinDir = path.join(root, 'src/ui/skin');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const cssFiles = fs.readdirSync(skinDir).filter((f) => f.endsWith('.css'));

describe('TUX-005 safe-area tokens', () => {
  it('no skin file except tokens.css uses env(safe-area-inset-*)', () => {
    const hits = [];
    cssFiles.filter((f) => f !== 'tokens.css').forEach((f) => {
      stripComments(fs.readFileSync(path.join(skinDir, f), 'utf8')).split('\n').forEach((line, i) => {
        if (/env\(\s*safe-area-inset/.test(line)) hits.push(`${f}:${i + 1}`);
      });
    });
    expect(hits).toEqual([]);
  });

  it('tokens.css defines --safe-top/right/bottom/left from env() with a 0px fallback', () => {
    const css = stripComments(fs.readFileSync(path.join(skinDir, 'tokens.css'), 'utf8'));
    ['top', 'right', 'bottom', 'left'].forEach((side) => {
      const re = new RegExp(`--safe-${side}\\s*:\\s*env\\(\\s*safe-area-inset-${side}\\s*,\\s*0px\\s*\\)`);
      expect(css, `--safe-${side}`).toMatch(re);
    });
  });
});
