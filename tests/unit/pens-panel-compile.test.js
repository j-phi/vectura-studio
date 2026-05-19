/*
 * Compile gate for src/ui/panels/pens-panel.js (Phase 2 step 4).
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

describe('pens-panel compile gate', () => {
  let dom;
  let PensPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/pens-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    PensPanel = w.Vectura.UI.PensPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.PensPanel with bind + 12 methods', () => {
    expect(PensPanel).toBeTruthy();
    expect(typeof PensPanel.bind).toBe('function');
    expect(typeof PensPanel.setArmedPen).toBe('function');
    expect(typeof PensPanel.clearArmedPen).toBe('function');
    expect(typeof PensPanel.refreshArmedPenUI).toBe('function');
    expect(typeof PensPanel.getPaletteList).toBe('function');
    expect(typeof PensPanel.getActivePalette).toBe('function');
    expect(typeof PensPanel.applyPaletteToPens).toBe('function');
    expect(typeof PensPanel.addPen).toBe('function');
    expect(typeof PensPanel.removePen).toBe('function');
    expect(typeof PensPanel.initPaletteControls).toBe('function');
    expect(typeof PensPanel.renderPens).toBe('function');
    expect(typeof PensPanel.getPenById).toBe('function');
    expect(typeof PensPanel.applyArmedPenToLayers).toBe('function');
  });

  it('renderPens throws a clear error before bind()', () => {
    expect(() => PensPanel.renderPens.call({})).toThrow(/PensPanel\.renderPens invoked before PensPanel\.bind/);
  });

  it('getPenById returns the pen matching a known id, null when absent', () => {
    const pens = [
      { id: 'pen-a', name: 'A', color: '#fff', width: 0.3 },
      { id: 'pen-b', name: 'B', color: '#000', width: 0.5 },
    ];
    PensPanel.bind({
      getEl: () => null,
      escapeHtml: (s) => `${s}`,
      SETTINGS: { pens },
      PALETTES: [],
      getThemeToken: () => '#000',
    });
    expect(PensPanel.getPenById.call({}, 'pen-b')).toEqual(pens[1]);
    expect(PensPanel.getPenById.call({}, 'pen-missing')).toBeNull();
  });

  it('applyArmedPenToLayers assigns armed pen onto layers and clears arming', () => {
    const pens = [{ id: 'pen-a', name: 'A', color: '#abcdef', width: 0.7 }];
    PensPanel.bind({
      getEl: () => null,
      escapeHtml: (s) => `${s}`,
      SETTINGS: { pens },
      PALETTES: [],
      getThemeToken: () => '#000',
    });
    let clearedArmed = false;
    let renderedLayers = false;
    let appRendered = false;
    let pushed = 0;
    const layer = { id: 'layer-1' };
    const ctx = {
      armedPenId: 'pen-a',
      getPenById: PensPanel.getPenById,
      clearArmedPen() { clearedArmed = true; },
      renderLayers() { renderedLayers = true; },
      app: {
        pushHistory() { pushed++; },
        render() { appRendered = true; },
      },
    };
    const result = PensPanel.applyArmedPenToLayers.call(ctx, [layer]);
    expect(result).toBe(true);
    expect(layer.penId).toBe('pen-a');
    expect(layer.color).toBe('#abcdef');
    expect(layer.strokeWidth).toBe(0.7);
    expect(layer.lineCap).toBe('round');
    expect(clearedArmed).toBe(true);
    expect(renderedLayers).toBe(true);
    expect(appRendered).toBe(true);
    expect(pushed).toBe(1);
  });

  it('applyArmedPenToLayers returns false with no armed pen / no targets / unknown id', () => {
    PensPanel.bind({
      getEl: () => null,
      escapeHtml: (s) => `${s}`,
      SETTINGS: { pens: [{ id: 'pen-a', name: 'A', color: '#fff', width: 0.3 }] },
      PALETTES: [],
      getThemeToken: () => '#000',
    });
    const noArm = PensPanel.applyArmedPenToLayers.call({ armedPenId: null }, [{}]);
    expect(noArm).toBe(false);
    const noPen = PensPanel.applyArmedPenToLayers.call({ armedPenId: 'pen-ghost', getPenById: PensPanel.getPenById }, [{}]);
    expect(noPen).toBe(false);
    const noTargets = PensPanel.applyArmedPenToLayers.call({ armedPenId: 'pen-a', getPenById: PensPanel.getPenById }, []);
    expect(noTargets).toBe(false);
  });

  it('installOn installs getPenById and applyArmedPenToLayers on the prototype', () => {
    class FakeUI {}
    PensPanel.installOn(FakeUI.prototype);
    expect(typeof FakeUI.prototype.getPenById).toBe('function');
    expect(typeof FakeUI.prototype.applyArmedPenToLayers).toBe('function');
  });

  it('after bind(deps), renderPens returns silently when #pen-list is absent', () => {
    PensPanel.bind({
      getEl: (id) => null,
      escapeHtml: (s) => `${s}`,
      SETTINGS: { pens: [] },
      PALETTES: [],
      getThemeToken: () => '#000',
    });
    const ctx = { app: { engine: { layers: [] } } };
    expect(() => PensPanel.renderPens.call(ctx)).not.toThrow();
  });

  it('refreshArmedPenUI sets dragging class on matching pen item', () => {
    const doc = dom.window.document;
    const list = doc.createElement('div');
    list.id = 'pen-list';
    const a = doc.createElement('div');
    a.className = 'pen-item';
    a.dataset.penId = 'pen-1';
    const b = doc.createElement('div');
    b.className = 'pen-item';
    b.dataset.penId = 'pen-2';
    list.appendChild(a);
    list.appendChild(b);
    doc.body.appendChild(list);

    PensPanel.bind({
      getEl: (id) => doc.getElementById(id),
      escapeHtml: (s) => `${s}`,
      SETTINGS: { pens: [] },
      PALETTES: [],
      getThemeToken: () => '#000',
    });

    PensPanel.refreshArmedPenUI.call({ armedPenId: 'pen-2' });
    expect(a.classList.contains('dragging')).toBe(false);
    expect(b.classList.contains('dragging')).toBe(true);

    doc.body.removeChild(list);
  });

  it('getPaletteList returns the bound PALETTES array', () => {
    const palettes = [{ id: 'p1', name: 'P1', colors: ['#fff'] }];
    PensPanel.bind({
      getEl: () => null,
      escapeHtml: (s) => `${s}`,
      SETTINGS: { pens: [] },
      PALETTES: palettes,
      getThemeToken: () => '#000',
    });
    expect(PensPanel.getPaletteList.call({})).toBe(palettes);
  });

  it('getActivePalette finds palette by SETTINGS.paletteId or returns first', () => {
    const palettes = [
      { id: 'p1', name: 'P1', colors: ['#fff'] },
      { id: 'p2', name: 'P2', colors: ['#000'] },
    ];
    PensPanel.bind({
      getEl: () => null,
      escapeHtml: (s) => `${s}`,
      SETTINGS: { pens: [], paletteId: 'p2' },
      PALETTES: palettes,
      getThemeToken: () => '#000',
    });
    const ctx = { getPaletteList: PensPanel.getPaletteList };
    const active = PensPanel.getActivePalette.call(ctx);
    expect(active.id).toBe('p2');
  });
});
