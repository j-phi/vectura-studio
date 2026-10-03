import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TUX-004: no bare 100vh in the skin. iOS Safari inflates 100vh by the collapsed URL bar.
// Every rule block that mentions 100vh must also carry a dvh or var(--app-vh) value.
const root = path.resolve(__dirname, '..', '..');
const skinDir = path.join(root, 'src/ui/skin');

const blocksOf = (css) => {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === '{') { depth += 1; start = i; }
    else if (ch === '}') {
      if (depth > 0) {
        const open = css.lastIndexOf('{', i);
        const head = css.slice(Math.max(0, css.lastIndexOf('}', open) + 1), open);
        const body = css.slice(open + 1, i);
        if (!body.includes('{')) out.push({ head: head.trim(), body, at: open });
      }
      depth = Math.max(0, depth - 1);
    }
  }
  return out;
};

describe('TUX-004 viewport height units', () => {
  it('every 100vh block also has dvh or var(--app-vh)', () => {
    const offenders = [];
    fs.readdirSync(skinDir).filter((f) => f.endsWith('.css')).forEach((f) => {
      const css = fs.readFileSync(path.join(skinDir, f), 'utf8');
      blocksOf(css).forEach((b) => {
        if (!/100vh/.test(b.body)) return;
        if (/dvh|var\(--app-vh/.test(b.body)) return;
        if (f === 'tokens.css' && /--app-vh\s*:/.test(b.body)) return;
        const line = css.slice(0, b.at).split('\n').length;
        offenders.push(`${f}:${line} ${b.head.replace(/\s+/g, ' ').slice(0, 60)}`);
      });
    });
    expect(offenders).toEqual([]);
  });

  it('index.html body has no h-screen class', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const m = html.match(/<body\b[^>]*>/);
    expect(m && m[0]).toBeTruthy();
    expect(m[0]).not.toMatch(/\bh-screen\b/);
  });
});
