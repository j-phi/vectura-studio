/*
 * Compile gate for src/ui/panels/formula-panel.js (Phase 2 step 4 first extraction).
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

describe('formula-panel compile gate', () => {
  let dom;
  let FormulaPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/formula-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    FormulaPanel = w.Vectura.UI.FormulaPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.FormulaPanel with bind + updateFormula', () => {
    expect(FormulaPanel).toBeTruthy();
    expect(typeof FormulaPanel.bind).toBe('function');
    expect(typeof FormulaPanel.updateFormula).toBe('function');
  });

  it('updateFormula throws a clear error before bind()', () => {
    expect(() => FormulaPanel.updateFormula.call({ app: { engine: { getActiveLayer: () => null } } }))
      .toThrow(/FormulaPanel\.updateFormula invoked before FormulaPanel\.bind/);
  });

  it('after bind(deps), updateFormula returns silently when no active layer', () => {
    const doc = dom.window.document;
    FormulaPanel.bind({
      getEl: (id) => doc.getElementById(id),
      escapeHtml: (s) => `${s}`.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])),
      usesSeed: () => true,
    });
    const ctx = { app: { engine: { getActiveLayer: () => null, getFormula: () => '' } } };
    expect(() => FormulaPanel.updateFormula.call(ctx)).not.toThrow();
  });

  it('updateFormula renders formula HTML and seed display when active layer present', () => {
    const doc = dom.window.document;
    const formula = doc.createElement('div');
    formula.id = 'formula-display';
    doc.body.appendChild(formula);
    const seedDisplay = doc.createElement('div');
    seedDisplay.id = 'formula-seed-display';
    doc.body.appendChild(seedDisplay);

    FormulaPanel.bind({
      getEl: (id) => doc.getElementById(id),
      escapeHtml: (s) => `${s}`,
      usesSeed: (type) => type === 'flowfield',
    });

    const layer = { id: 'L1', type: 'flowfield', params: { seed: 42, density: 0.5 } };
    const ctx = {
      app: {
        engine: {
          getActiveLayer: () => layer,
          getFormula: () => 'y = sin(x)',
        },
      },
    };
    FormulaPanel.updateFormula.call(ctx);

    expect(formula.innerHTML).toContain('formula-block');
    expect(formula.innerHTML).toContain('y = sin(x)');
    expect(seedDisplay.innerText).toBe('Seed: 42');
    expect(seedDisplay.style.display).toBe('');

    doc.body.removeChild(formula);
    doc.body.removeChild(seedDisplay);
  });

  it('updateFormula hides seed display for seedless algos', () => {
    const doc = dom.window.document;
    const formula = doc.createElement('div');
    formula.id = 'formula-display';
    doc.body.appendChild(formula);
    const seedDisplay = doc.createElement('div');
    seedDisplay.id = 'formula-seed-display';
    doc.body.appendChild(seedDisplay);

    FormulaPanel.bind({
      getEl: (id) => doc.getElementById(id),
      escapeHtml: (s) => `${s}`,
      usesSeed: () => false,
    });

    const layer = { id: 'L1', type: 'lissajous', params: { seed: 7 } };
    const ctx = {
      app: {
        engine: {
          getActiveLayer: () => layer,
          getFormula: () => '',
        },
      },
    };
    FormulaPanel.updateFormula.call(ctx);

    expect(seedDisplay.style.display).toBe('none');

    doc.body.removeChild(formula);
    doc.body.removeChild(seedDisplay);
  });
});
