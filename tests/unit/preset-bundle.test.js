/*
 * Unit tests for src/ui/preset-bundle.js — export/import of all localStorage
 * user presets (the portable fallback for non-FSA browsers). Loaded under JSDOM
 * for a real localStorage.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('PresetBundle', () => {
  let dom, B, win;
  const PRE = 'vectura.user_presets.';
  const set = (sys, arr) => win.localStorage.setItem(PRE + sys, JSON.stringify(arr));
  const get = (sys) => JSON.parse(win.localStorage.getItem(PRE + sys) || '[]');

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
    win = dom.window;
    const code = fs.readFileSync(path.join(ROOT, 'src/ui/preset-bundle.js'), 'utf8');
    vm.runInContext(code, dom.getInternalVMContext(), { filename: 'preset-bundle.js' });
    B = win.Vectura.PresetBundle;
    win.localStorage.clear();
  });

  afterEach(() => dom?.window?.close?.());

  it('exportAll collects user presets by system, omitting empty/unrelated keys', () => {
    set('rings', [{ id: 'user-rings-1', name: 'R1' }]);
    set('lissajous', [{ id: 'user-lissajous-1', name: 'L1' }, { id: 'user-lissajous-2', name: 'L2' }]);
    set('grid', []); // empty → omitted
    win.localStorage.setItem('vectura.something.else', 'x'); // unrelated → ignored

    const bundle = B.exportAll();
    expect(bundle.schema).toBe('vectura-presets');
    expect(bundle.version).toBe(1);
    expect(Object.keys(bundle.presets).sort()).toEqual(['lissajous', 'rings']);
    expect(bundle.presets.lissajous).toHaveLength(2);
    expect(B.countAll()).toBe(3);
  });

  it('importBundle merge adds presets and de-dupes by id (bundle wins)', () => {
    set('rings', [{ id: 'user-rings-1', name: 'OLD' }, { id: 'user-rings-keep', name: 'Keep' }]);
    const bundle = {
      schema: 'vectura-presets', version: 1,
      presets: { rings: [{ id: 'user-rings-1', name: 'NEW' }, { id: 'user-rings-2', name: 'R2' }] },
    };
    const res = B.importBundle(bundle, 'merge');
    expect(res.imported).toBe(2);
    expect(res.systems).toEqual(['rings']);

    const after = get('rings');
    const byId = Object.fromEntries(after.map((p) => [p.id, p.name]));
    expect(byId['user-rings-1']).toBe('NEW');   // bundle wins
    expect(byId['user-rings-keep']).toBe('Keep'); // existing preserved
    expect(byId['user-rings-2']).toBe('R2');     // new added
    expect(after).toHaveLength(3);
  });

  it('importBundle replace overwrites the system wholesale', () => {
    set('rings', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    const bundle = { schema: 'vectura-presets', version: 1, presets: { rings: [{ id: 'c', name: 'C' }] } };
    B.importBundle(bundle, 'replace');
    expect(get('rings')).toEqual([{ id: 'c', name: 'C' }]);
  });

  it('importBundle rejects malformed input', () => {
    expect(B.importBundle(null)).toBeNull();
    expect(B.importBundle({ schema: 'wrong', presets: {} })).toBeNull();
    expect(B.importBundle({ schema: 'vectura-presets' })).toBeNull();
    expect(B.isValidBundle({ schema: 'vectura-presets', version: 1, presets: {} })).toBe(true);
  });
});
