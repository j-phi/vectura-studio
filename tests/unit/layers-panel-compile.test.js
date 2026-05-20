/*
 * Compile gate for src/ui/panels/layers-panel.js (Phase 2 step 4).
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

describe('layers-panel compile gate', () => {
  let dom;
  let LayersPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/layers-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    LayersPanel = w.Vectura.UI.LayersPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.LayersPanel with bind + renderLayers', () => {
    expect(LayersPanel).toBeTruthy();
    expect(typeof LayersPanel.bind).toBe('function');
    expect(typeof LayersPanel.renderLayers).toBe('function');
    // Unit 1.8: createManualLayerFromPath moved out of _ui-legacy.js
    expect(typeof LayersPanel.createManualLayerFromPath).toBe('function');
  });

  it('renderLayers throws a clear error before bind()', () => {
    expect(() => LayersPanel.renderLayers.call({})).toThrow(/LayersPanel\.renderLayers invoked before LayersPanel\.bind/);
  });

  it('after bind(deps), renderLayers returns silently when #layer-list is absent', () => {
    LayersPanel.bind({
      SETTINGS: { pens: [], autoColorization: { enabled: false } },
      escapeHtml: (s) => `${s}`,
    });
    const ctx = { app: { engine: { layers: [] } } };
    expect(() => LayersPanel.renderLayers.call(ctx)).not.toThrow();
  });

  // Unit 1.8: createManualLayerFromPath moved from _ui-legacy.js
  it('createManualLayerFromPath returns silently when path is too short', () => {
    LayersPanel.bind({
      SETTINGS: { globalLayerCount: 0, pens: [], autoColorization: { enabled: false } },
      escapeHtml: (s) => `${s}`,
      Layer: function () {},
      clone: (obj) => JSON.parse(JSON.stringify(obj)),
    });
    const ctx = { app: { engine: { layers: [] } } };
    expect(() => LayersPanel.createManualLayerFromPath.call(ctx, { path: [{ x: 0, y: 0 }] })).not.toThrow();
    expect(() => LayersPanel.createManualLayerFromPath.call(ctx, null)).not.toThrow();
  });

  // Unit 1.9b: bindLayerListListeners moved from _ui-legacy.js bindGlobal
  it('installOn registers bindLayerListListeners on the UI prototype (Unit 1.9b)', () => {
    expect(typeof LayersPanel.bindLayerListListeners).toBe('function');
    const proto = {};
    LayersPanel.installOn(proto);
    expect(typeof proto.bindLayerListListeners).toBe('function');
  });

  it('bindLayerListListeners runs without throwing when DOM elements are absent', () => {
    LayersPanel.bind({
      SETTINGS: { pens: [], autoColorization: { enabled: false }, layerBarPaletteId: 'prism' },
      escapeHtml: (s) => `${s}`,
      Layer: function () {},
      clone: (obj) => JSON.parse(JSON.stringify(obj)),
      getEl: () => null,
    });
    const ctx = { app: { engine: { layers: [] }, persistPreferencesDebounced: () => {} } };
    expect(() => LayersPanel.bindLayerListListeners.call(ctx)).not.toThrow();
  });

  // Meridian Unit 1.9c: layer-state methods + renderLayers wrapper migrate
  // out of _ui-legacy.js class body.
  it('installOn registers layer-state methods on the UI prototype (Unit 1.9c)', () => {
    const proto = {};
    LayersPanel.installOn(proto);
    expect(typeof proto.renderLayers).toBe('function');
    expect(typeof proto.recenterLayerIfNeeded).toBe('function');
    expect(typeof proto.isDuplicateLayerName).toBe('function');
    expect(typeof proto.getLayerById).toBe('function');
    expect(typeof proto.isModifierLayer).toBe('function');
    expect(typeof proto.getModifierState).toBe('function');
    expect(typeof proto.assignLayersToParent).toBe('function');
    expect(typeof proto.unlockMirrorChildrenOnDelete).toBe('function');
    expect(typeof proto.shouldLeaveParentScope).toBe('function');
    expect(typeof proto.isDescendant).toBe('function');
    expect(typeof proto.normalizeGroupOrder).toBe('function');
    expect(typeof proto.moveSelectedLayers).toBe('function');
    expect(typeof proto.duplicateLayers).toBe('function');
    expect(typeof proto.getLayerChildren).toBe('function');
    expect(typeof proto.getLayerDescendants).toBe('function');
    expect(typeof proto.canLayerAcceptChildren).toBe('function');
    expect(typeof proto.getUniqueLayerName).toBe('function');
    expect(typeof proto.expandLayer).toBe('function');
    expect(typeof proto.getGroupDescendants).toBe('function');
  });
});
