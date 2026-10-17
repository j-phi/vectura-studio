import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// TUX-004 clauses 1 and 2, checked per property inside each rule block:
//  1. A declaration that uses 100vh needs a dvh or var(--app-vh) redeclaration of the SAME property
//     in the SAME block. iOS Safari inflates 100vh by the collapsed URL bar.
//  2. A declaration that uses 100dvh needs a preceding vh fallback for the SAME property, so
//     browsers without dvh support keep a height.
const root = path.resolve(__dirname, '..', '..');
const skinDir = path.join(root, 'src/ui/skin');

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// Innermost rule blocks (no nested braces), with the offset of their opening brace.
const blocksOf = (css) => {
  const out = [];
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] !== '}') continue;
    const open = css.lastIndexOf('{', i);
    if (open < 0) continue;
    const head = css.slice(Math.max(0, css.lastIndexOf('}', open) + 1, css.lastIndexOf(';', open) + 1), open);
    out.push({ head: head.trim(), body: css.slice(open + 1, i), at: open });
  }
  return out;
};

// Split a block body into [property, value] pairs. Semicolons inside parentheses do not split.
const declsOf = (body) => {
  const out = [];
  let depth = 0;
  let cur = '';
  const push = () => {
    const idx = cur.indexOf(':');
    if (idx > 0) out.push([cur.slice(0, idx).trim().toLowerCase(), cur.slice(idx + 1).trim()]);
    cur = '';
  };
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && depth === 0) push(); else cur += ch;
  }
  push();
  return out;
};

const isDynamic = (v) => /dvh|var\(--app-vh/.test(v);
const isBareVh = (v) => /100vh/.test(v);
const isVhFallback = (v) => /\dvh/.test(v) && !/dvh/.test(v);

const scan = (cssByFile) => {
  const clause1 = [];
  const clause2 = [];
  Object.entries(cssByFile).forEach(([file, raw]) => {
    const css = stripComments(raw);
    blocksOf(css).forEach((b) => {
      const decls = declsOf(b.body);
      const where = (prop) => `${file}:${css.slice(0, b.at).split('\n').length} ${b.head.replace(/\s+/g, ' ').slice(0, 60)} { ${prop} }`;
      decls.forEach(([prop, val], i) => {
        if (file === 'tokens.css' && prop === '--app-vh') return;
        if (isBareVh(val)) {
          const fixed = decls.some(([p, v], j) => j !== i && p === prop && isDynamic(v));
          if (!fixed) clause1.push(where(prop));
        }
        if (/100dvh/.test(val)) {
          const fallback = decls.slice(0, i).some(([p, v]) => p === prop && isVhFallback(v));
          if (!fallback) clause2.push(where(prop));
        }
      });
    });
  });
  return { clause1, clause2 };
};

const skinCss = () => Object.fromEntries(
  fs.readdirSync(skinDir).filter((f) => f.endsWith('.css')).map((f) => [f, fs.readFileSync(path.join(skinDir, f), 'utf8')]),
);

describe('TUX-004 viewport height units', () => {
  it('clause 1: every 100vh declaration has a dvh or var(--app-vh) redeclaration of the same property', () => {
    expect(scan(skinCss()).clause1).toEqual([]);
  });

  it('clause 2: every 100dvh declaration has a preceding vh fallback for the same property', () => {
    expect(scan(skinCss()).clause2).toEqual([]);
  });

  it('the guard itself flags a different property carrying the dvh value', () => {
    const r = scan({ 'x.css': '.a{height:100vh; max-height:50dvh}' });
    expect(r.clause1).toHaveLength(1);
  });

  it('the guard itself flags calc(100dvh ...) with no vh fallback', () => {
    const r = scan({ 'x.css': '.a{max-height:calc(100dvh - 8px)}' });
    expect(r.clause2).toHaveLength(1);
  });

  it('the guard accepts a matched vh plus dvh pair and var(--app-vh) pair', () => {
    const r = scan({ 'x.css': '.a{max-height:calc(100vh - 8px); max-height:calc(100dvh - 8px)} .b{height:100vh; height:var(--app-vh)}' });
    expect(r.clause1).toEqual([]);
    expect(r.clause2).toEqual([]);
  });

  it('index.html body has no h-screen class', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const m = html.match(/<body\b[^>]*>/);
    expect(m && m[0]).toBeTruthy();
    expect(m[0]).not.toMatch(/\bh-screen\b/);
  });
});
