/*
 * Compile gate for src/ui/ui-fill-panel.js (Meridian Unit 1.8).
 *
 * Verifies the FillPanel module exposes its constants AND the prototype
 * installers for pattern-fill methods moved out of _ui-legacy.js.
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

describe('ui-fill-panel compile gate (Unit 1.8)', () => {
  let dom;
  let FillPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/ui/ui-fill-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    FillPanel = w.Vectura.FillPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.FillPanel with existing constants', () => {
    expect(FillPanel).toBeTruthy();
    expect(Array.isArray(FillPanel.FILL_TYPE_OPTIONS)).toBe(true);
    expect(typeof FillPanel.buildFillControlDefs).toBe('function');
  });

  it('exposes installOn for the Unit 1.8 pattern-fill prototype methods', () => {
    expect(typeof FillPanel.bind).toBe('function');
    expect(typeof FillPanel.installOn).toBe('function');
    expect(typeof FillPanel._buildPatternFillPanel).toBe('function');
    expect(typeof FillPanel._applyPatternFillFromCanvas).toBe('function');
  });

  it('installOn(proto) attaches _buildPatternFillPanel and _applyPatternFillFromCanvas', () => {
    const proto = {};
    FillPanel.installOn(proto);
    expect(typeof proto._buildPatternFillPanel).toBe('function');
    expect(typeof proto._applyPatternFillFromCanvas).toBe('function');
  });

  it('_applyPatternFillFromCanvas returns silently when active layer is not a pattern layer', () => {
    FillPanel.bind({});
    const ctx = {
      app: { engine: { getActiveLayer: () => ({ type: 'flowfield' }) } },
    };
    expect(() => FillPanel._applyPatternFillFromCanvas.call(ctx, { tool: 'fill-pattern', worldX: 0, worldY: 0 })).not.toThrow();
  });
});
