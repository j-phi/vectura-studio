/*
 * Regression (item b): double-clicking a CHILD of a group folder must SELECT
 * that child.
 *
 * Before the fix, _lvlDoSel()'s double-click branch entered rename and returned
 * early WITHOUT ensuring the target was the sole active selection. The fix
 * selects the target first (renderer.setSelection([id], id) + engine.activeLayerId)
 * when it is not already the sole active layer, then enters rename — so after a
 * double-click on a nested child, that child is selected and active.
 *
 * Harness: load src/ui/panels/layers-panel.js in JSDOM (mirrors the lightweight
 * approach in security_xss.test.js), drive renderLayers() against a mock engine /
 * renderer, then dispatch two click events on the child's .lvl-name span inside
 * the 350ms double-click window and assert selection state.
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

const buildHarness = () => {
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

  // Expanded group "GRP" with one child "CHILD".
  const group = {
    id: 'grp-1', name: 'GRP', visible: true, isGroup: true,
    groupCollapsed: false, parentId: null, params: {},
  };
  const child = {
    id: 'child-1', name: 'CHILD', visible: true, isGroup: false,
    parentId: 'grp-1', type: 'wavetable', params: {},
    color: '#ffffff', strokeWidth: 0.3,
  };

  const engine = {
    layers: [group, child],
    activeLayerId: 'grp-1',
    getLayerById(id) { return this.layers.find((l) => l.id === id); },
    getPenById() { return null; },
    isLayerSilhouetteCapable() { return false; },
    computeAllDisplayGeometry() {},
  };

  const renderer = {
    selectedLayerIds: new Set(['grp-1']),
    selectedLayerId: 'grp-1',
    setSelection(ids, primaryId) {
      this.selectedLayerIds = new Set(ids || []);
      this.selectedLayerId = primaryId || (ids && ids[0]) || null;
    },
    getSelectedLayer() { return engine.getLayerById(this.selectedLayerId); },
    getSelectedLayers() {
      return [...this.selectedLayerIds].map((id) => engine.getLayerById(id)).filter(Boolean);
    },
  };

  const calls = { buildControls: 0, updateFormula: 0, render: 0 };
  const LP = w.Vectura.UI.LayersPanel;
  LP.bind({ SETTINGS: { pens: [], autoColorization: { enabled: false } }, escapeHtml });
  const proto = {};
  if (LP.installOn) LP.installOn(proto);
  const uiCtx = Object.create(proto);
  uiCtx.app = { engine, renderer, render() { calls.render++; }, pushHistory() {} };
  uiCtx.layerLockedIds = new Set();
  // _LVL_I is the icon set injected by the legacy ui.js bind() in the real app.
  // Stub every icon key to a harmless SVG-string-returning function.
  uiCtx._LVL_I = new Proxy({}, { get: () => () => '<svg></svg>' });
  uiCtx.buildControls = () => { calls.buildControls++; };
  uiCtx.updateFormula = () => { calls.updateFormula++; };
  uiCtx.updateLightSourceTool = () => {};

  uiCtx.renderLayers();

  return { dom, w, document, engine, renderer, uiCtx, calls };
};

const dispatchClickOn = (w, el) => {
  const ev = new w.MouseEvent('click', { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
};

describe('layers-panel: double-click a group child selects it (item b)', () => {
  let h;
  afterEach(() => { h?.dom?.window?.close?.(); h = null; });

  test('child .lvl-name renders inside the expanded group', () => {
    h = buildHarness();
    const nameEl = h.document.querySelector('[data-lvl-id="child-1"] .lvl-name');
    expect(nameEl).not.toBeNull();
  });

  test('double-click on a nested child ends with that child selected and active', () => {
    h = buildHarness();
    // Precondition: the group (not the child) is the active selection.
    expect(h.engine.activeLayerId).toBe('grp-1');
    expect(h.renderer.selectedLayerId).toBe('grp-1');

    const nameEl = h.document.querySelector('[data-lvl-id="child-1"] .lvl-name');
    expect(nameEl).not.toBeNull();

    // First click: selects the child + arms the double-click timer.
    dispatchClickOn(h.w, nameEl);
    expect(h.renderer.selectedLayerId).toBe('child-1');
    expect(h.engine.activeLayerId).toBe('child-1');

    // Second click within the 350ms window on the re-rendered name element:
    // double-click branch. The child must remain the sole active selection.
    const nameEl2 = h.document.querySelector('[data-lvl-id="child-1"] .lvl-name');
    expect(nameEl2).not.toBeNull();
    dispatchClickOn(h.w, nameEl2);

    expect(h.renderer.selectedLayerId).toBe('child-1');
    expect(h.engine.activeLayerId).toBe('child-1');
    expect([...h.renderer.selectedLayerIds]).toEqual(['child-1']);
  });

  test('double-click recovers child selection even when the active layer drifts to the group between clicks (RGR red-catcher)', () => {
    // This is the strong regression guard. The first click selects the child
    // and arms the dblclick timer; we then deliberately drift the selection back
    // to the group (simulating a competing handler / renderer hit-test that
    // re-selects the parent group on a child press). WITHOUT the fix, the
    // double-click branch only entered rename and left the group active. WITH the
    // fix, the double-click re-selects the child because it is no longer the sole
    // active layer.
    h = buildHarness();

    const nameEl = h.document.querySelector('[data-lvl-id="child-1"] .lvl-name');
    dispatchClickOn(h.w, nameEl);                 // first click: arms dblclick + selects child
    expect(h.engine.activeLayerId).toBe('child-1');

    // Drift active selection back to the group before the second click.
    h.renderer.setSelection(['grp-1'], 'grp-1');
    h.engine.activeLayerId = 'grp-1';
    h.uiCtx.renderLayers();

    const nameEl2 = h.document.querySelector('[data-lvl-id="child-1"] .lvl-name');
    dispatchClickOn(h.w, nameEl2);               // double-click → must re-select the child

    expect(h.engine.activeLayerId).toBe('child-1');
    expect(h.renderer.selectedLayerId).toBe('child-1');
    expect(h.renderer.selectedLayerIds.has('child-1')).toBe(true);
    expect(h.renderer.selectedLayerIds.size).toBe(1);
  });
});
