/*
 * Regression: the Draw-Order bar (#draw-order-bar) is a useless menu on a blank
 * canvas — there is no plot order to reveal until at least one path is drawn. It
 * is gated on rendered geometry (engine.getRenderablePaths), NOT mere layer
 * count, so an empty layer/group keeps it hidden; it appears once a layer has
 * paths and re-hides when that geometry goes away.
 *
 * Harness: load src/ui/panels/layers-panel.js in JSDOM (mirrors
 * layers-panel-dblclick-child-select.test.js), drive renderLayers() against a
 * mock engine and assert the bar's `.hidden` class.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../..');

const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const buildHarness = (layers) => {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only',
  });
  const ctx = dom.getInternalVMContext();
  const code = fs.readFileSync(
    path.join(ROOT, 'src/ui/panels/layers-panel.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'layers-panel.js' });

  const w = dom.window;
  const document = w.document;

  const list = document.createElement('ul');
  list.id = 'layer-list';
  document.body.appendChild(list);
  const statusBar = document.createElement('div');
  statusBar.id = 'layer-status-bar';
  document.body.appendChild(statusBar);
  const drawOrderBar = document.createElement('div');
  drawOrderBar.id = 'draw-order-bar';
  drawOrderBar.className = 'draw-order-bar';
  document.body.appendChild(drawOrderBar);

  const engine = {
    layers: layers,
    activeLayerId: layers[0]?.id ?? null,
    getLayerById(id) { return this.layers.find((l) => l.id === id); },
    getPenById() { return null; },
    isLayerSilhouetteCapable() { return false; },
    computeAllDisplayGeometry() {},
    getRenderablePaths(layer) { return layer?.paths || []; },
  };

  const renderer = {
    selectedLayerIds: new Set(),
    selectedLayerId: null,
    setSelection(ids, primaryId) {
      this.selectedLayerIds = new Set(ids || []);
      this.selectedLayerId = primaryId || (ids && ids[0]) || null;
    },
    getSelectedLayer() { return engine.getLayerById(this.selectedLayerId); },
    getSelectedLayers() {
      return [...this.selectedLayerIds].map((id) => engine.getLayerById(id)).filter(Boolean);
    },
  };

  const LP = w.Vectura.UI.LayersPanel;
  LP.bind({ SETTINGS: { pens: [], autoColorization: { enabled: false } }, escapeHtml });
  const proto = {};
  if (LP.installOn) LP.installOn(proto);
  const uiCtx = Object.create(proto);
  uiCtx.app = { engine, renderer, render() {}, pushHistory() {} };
  uiCtx.layerLockedIds = new Set();
  uiCtx._LVL_I = new Proxy({}, { get: () => () => '<svg></svg>' });
  uiCtx.buildControls = () => {};
  uiCtx.updateFormula = () => {};
  uiCtx.updateLightSourceTool = () => {};

  return { dom, w, document, engine, renderer, uiCtx, drawOrderBar };
};

const layer = (id, paths) => ({
  id, name: id.toUpperCase(), visible: true, isGroup: false, parentId: null,
  type: 'wavetable', params: {}, color: '#ffffff', strokeWidth: 0.3, paths,
});
const PATH = [[{ x: 0, y: 0 }, { x: 10, y: 10 }]];

describe('Draw-Order bar visibility tracks drawn geometry', () => {
  let h;
  afterEach(() => { h?.dom?.window?.close?.(); h = null; });

  test('hidden when the canvas is blank (no layers)', () => {
    h = buildHarness([]);
    h.uiCtx.renderLayers();
    expect(h.drawOrderBar.classList.contains('hidden')).toBe(true);
  });

  test('hidden when a layer exists but draws no paths (empty layer)', () => {
    h = buildHarness([layer('l-1', [])]);
    h.uiCtx.renderLayers();
    expect(h.drawOrderBar.classList.contains('hidden')).toBe(true);
  });

  test('shown once a layer actually has paths', () => {
    h = buildHarness([layer('l-1', PATH)]);
    h.uiCtx.renderLayers();
    expect(h.drawOrderBar.classList.contains('hidden')).toBe(false);
  });

  test('hidden when the only path-bearing layer is itself hidden', () => {
    const l = layer('l-1', PATH);
    l.visible = false;
    h = buildHarness([l]);
    h.uiCtx.renderLayers();
    expect(h.drawOrderBar.classList.contains('hidden')).toBe(true);
  });

  test('re-hides when the drawn geometry goes away', () => {
    h = buildHarness([layer('l-1', PATH)]);
    h.uiCtx.renderLayers();
    expect(h.drawOrderBar.classList.contains('hidden')).toBe(false);

    h.engine.layers[0].paths = [];
    h.uiCtx.renderLayers();
    expect(h.drawOrderBar.classList.contains('hidden')).toBe(true);
  });
});
