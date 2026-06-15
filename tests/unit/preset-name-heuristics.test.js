/*
 * Unit tests for src/config/preset-name-heuristics.js — the generic auto-name
 * suggester used by the preset Save modal. Loaded in isolation under JSDOM
 * (defaults.js first so ALGO_DEFAULTS is available as the default basis).
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const loadInJSDOM = (scriptPaths) => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('PresetNameHeuristics.suggestName', () => {
  let dom, NH;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/config/preset-name-heuristics.js',
    ]);
    NH = dom.window.Vectura.PresetNameHeuristics;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes suggestName + algoLabel', () => {
    expect(NH).toBeTruthy();
    expect(typeof NH.suggestName).toBe('function');
    expect(typeof NH.algoLabel).toBe('function');
  });

  it('names the look after the most-changed params (ranked by magnitude)', () => {
    const name = NH.suggestName('rings', { rings: 60, warp: 0.73, posX: 5 }, {
      basis: { rings: 25, warp: 0, posX: 0 },
    });
    // rings changed more (relative) than warp → it leads; transform keys ignored.
    expect(name).toBe('Rings · rings 60 · warp 0.73');
  });

  it('caps the phrase at three changed keys', () => {
    const name = NH.suggestName('grid', { a: 1, b: 2, c: 3, d: 4 }, {
      basis: { a: 0, b: 0, c: 0, d: 0 },
    });
    expect(name.split('·').length).toBe(4); // "Grid" + 3 params
  });

  it('formats booleans as on/off and rounds numbers', () => {
    const name = NH.suggestName('spiral', { curves: true, twist: 1.23456 }, {
      basis: { curves: false, twist: 0 },
    });
    expect(name).toContain('curves on');
    expect(name).toContain('twist 1.23');
  });

  it('ignores transform/seed/marker keys entirely', () => {
    const name = NH.suggestName('lissajous', { seed: 9, posX: 3, rotation: 45, preset: 'x' }, {
      basis: { seed: 0, posX: 0, rotation: 0 },
    });
    // No nameable scalar diverged → numbered fallback.
    expect(name).toBe('My Lissajous 1');
  });

  it('falls back to a unique numbered name when nothing diverges', () => {
    const params = { a: 1 };
    const basis = { a: 1 };
    expect(NH.suggestName('rings', params, { basis })).toBe('My Rings 1');
    expect(NH.suggestName('rings', params, { basis, existingNames: ['My Rings 1'] })).toBe('My Rings 2');
    expect(NH.suggestName('rings', params, { basis, existingNames: ['My Rings 1', 'My Rings 2'] })).toBe('My Rings 3');
  });

  it('maps known algorithm labels and title-cases unknown ones', () => {
    expect(NH.algoLabel('shapePack')).toBe('Shape Pack');
    expect(NH.algoLabel('svgDistort')).toBe('SVG Distort');
    expect(NH.algoLabel('petalisDesigner')).toBe('Petalis');
    expect(NH.algoLabel('fooBar')).toBe('Foo Bar');
  });

  it('defaults the basis to ALGO_DEFAULTS when none is provided', () => {
    // rings default has its own params; bumping rings far past default should
    // still surface "rings" in the name without an explicit basis.
    const defaults = dom.window.Vectura.ALGO_DEFAULTS.rings;
    const name = NH.suggestName('rings', { ...defaults, rings: (defaults.rings || 0) + 999 });
    expect(name).toContain('Rings ·');
    expect(name).toContain('rings');
  });
});
