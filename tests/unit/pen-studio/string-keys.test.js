/** Pen Studio: every string key the UI reads exists in UI_CONSTANTS.PEN_STUDIO. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const loadStrings = () => {
  const win = {};
  win.window = win; win.globalThis = win;
  const ctx = vm.createContext(win);
  vm.runInContext(read('src/config/ui-constants.js'), ctx, { filename: 'ui-constants.js' });
  return win.Vectura.UI_CONSTANTS.PEN_STUDIO;
};

const usedKeys = () => {
  const dir = path.join(ROOT, 'src/ui/pen-studio');
  const out = new Map();
  const add = (k, f) => { if (!out.has(k)) out.set(k, new Set()); out.get(k).add(f); };
  const res = [
    /\bL\(\)\.([A-Z][A-Z0-9_]+)/g, /\bL\.([A-Z][A-Z0-9_]+)/g,
    /\bL\(\)\[['"]([A-Z][A-Z0-9_]+)['"]\]/g, /\bL\[['"]([A-Z][A-Z0-9_]+)['"]\]/g,
    /\bT\(\s*['"]([A-Z][A-Z0-9_]+)['"]/g, /labelKey:\s*['"]([A-Z][A-Z0-9_]+)['"]/g,
  ];
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    res.forEach((re) => { for (const m of t.matchAll(re)) add(m[1], f); });
  });
  return out;
};

describe('PEN_STUDIO strings', () => {
  const S = loadStrings();

  it('defines every key referenced under src/ui/pen-studio', () => {
    const missing = [];
    usedKeys().forEach((files, k) => {
      if (k === 'TEST_') return; // dynamic, checked below
      if (typeof S[k] !== 'string') missing.push(`${k} (${[...files].join(', ')})`);
    });
    expect(missing).toEqual([]);
  });

  it('defines the dynamic TEST_* and slider label/evidence keys', () => {
    ['LINE', 'BLEED', 'BLOB', 'CROSS', 'SKIP', 'STARV'].forEach((k) => expect(typeof S['TEST_' + k]).toBe('string'));
    const cfg = {}; cfg.window = cfg; cfg.globalThis = cfg;
    const ctx = vm.createContext(cfg);
    vm.runInContext(read('src/config/pen-studio.js'), ctx, { filename: 'pen-studio.js' });
    cfg.Vectura.PEN_STUDIO.SLIDERS.forEach((d) => {
      expect(typeof S[d.labelKey]).toBe('string');
      expect(typeof S[d.evidence]).toBe('string');
    });
  });

  it('uses American English spellings', () => {
    const joined = Object.values(S).join(' ');
    expect(joined).not.toMatch(/\b(colour|centre|grey|organis|behaviour)/i);
  });
});
