/*
 * Regression: every algorithm/layer type that ships its own icon must also
 * carry a distinct color in each LAYER_PALETTES entry — otherwise its icon
 * falls through to the grey `_default` swatch in the layer bar and algorithm
 * menus.
 *
 * Triggered by Text / Dotscreen (halftone) / Weave (imageWeave) rendering
 * with grey icons because they had no per-type key in any palette.
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
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const context = dom.getInternalVMContext();
  for (const rel of scriptPaths) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    vm.runInContext(code, context, { filename: rel });
  }
  return dom;
};

describe('LAYER_PALETTES icon colors', () => {
  let dom;
  let palettes;

  beforeAll(() => {
    dom = loadInJSDOM(['src/config/defaults.js']);
    palettes = dom.window.Vectura.LAYER_PALETTES;
    expect(Array.isArray(palettes)).toBe(true);
  });

  afterAll(() => dom?.window?.close?.());

  // Types that previously fell through to the grey `_default`.
  const RECOVERED = ['text', 'halftone', 'imageWeave'];

  for (const type of RECOVERED) {
    it(`assigns a distinct, non-default color to "${type}" in every colored palette`, () => {
      for (const pal of palettes) {
        if (!pal.colors) continue; // pen-color palette has no static map
        expect(pal.colors[type], `${pal.id} is missing ${type}`).toBeTruthy();
        expect(pal.colors[type], `${pal.id}.${type} should not reuse _default`)
          .not.toBe(pal.colors._default);
      }
    });
  }
});
