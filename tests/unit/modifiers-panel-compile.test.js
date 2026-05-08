/*
 * Compile gate for src/ui/panels/modifiers-panel.js (Phase 2 step 4).
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

describe('modifiers-panel compile gate', () => {
  let dom;
  let ModifiersPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/modifiers-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    ModifiersPanel = w.Vectura.UI.ModifiersPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.ModifiersPanel with bind + 7 methods', () => {
    expect(ModifiersPanel).toBeTruthy();
    expect(typeof ModifiersPanel.bind).toBe('function');
    expect(typeof ModifiersPanel.refreshModifierLayer).toBe('function');
    expect(typeof ModifiersPanel.insertMirrorModifier).toBe('function');
    expect(typeof ModifiersPanel.updatePrimaryPanelMode).toBe('function');
    expect(typeof ModifiersPanel.refreshMaskingViews).toBe('function');
    expect(typeof ModifiersPanel.ensureLayerMaskState).toBe('function');
    expect(typeof ModifiersPanel.setLayerMaskEnabled).toBe('function');
    expect(typeof ModifiersPanel.setLayerMaskHidden).toBe('function');
  });

  it('refreshModifierLayer throws a clear error before bind()', () => {
    expect(() => ModifiersPanel.refreshModifierLayer.call({}, null, {}))
      .toThrow(/ModifiersPanel\.refreshModifierLayer invoked before ModifiersPanel\.bind/);
  });

  it('after bind(deps), refreshModifierLayer returns silently when layer null', () => {
    ModifiersPanel.bind({ getEl: (id) => null });
    expect(() => ModifiersPanel.refreshModifierLayer.call({}, null, {})).not.toThrow();
  });

  it('ensureLayerMaskState lazily initializes layer.mask with default fields', () => {
    ModifiersPanel.bind({ getEl: (id) => null });
    const layer = {};
    const mask = ModifiersPanel.ensureLayerMaskState.call({}, layer);
    expect(mask).toBe(layer.mask);
    expect(mask.enabled).toBe(false);
    expect(mask.sourceIds).toEqual([]);
    expect(mask.mode).toBe('parent');
    expect(mask.hideLayer).toBe(false);
    expect(mask.invert).toBe(false);
    expect(mask.materialized).toBe(false);
  });

  it('setLayerMaskEnabled flips .enabled when layer can source masks', () => {
    ModifiersPanel.bind({ getEl: (id) => null });
    let refreshed = false;
    const ctx = {
      app: {},
      refreshMaskingViews() { refreshed = true; },
      ensureLayerMaskState: ModifiersPanel.ensureLayerMaskState,
    };
    const layer = { maskCapabilities: { canSource: true } };
    ModifiersPanel.setLayerMaskEnabled.call(ctx, layer, true);
    expect(layer.mask.enabled).toBe(true);
    expect(refreshed).toBe(true);
  });

  it('setLayerMaskEnabled stays false when layer cannot source masks', () => {
    ModifiersPanel.bind({ getEl: (id) => null });
    const ctx = {
      app: {},
      refreshMaskingViews() {},
      ensureLayerMaskState: ModifiersPanel.ensureLayerMaskState,
    };
    const layer = { maskCapabilities: { canSource: false } };
    ModifiersPanel.setLayerMaskEnabled.call(ctx, layer, true);
    expect(layer.mask.enabled).toBe(false);
  });

  it('updatePrimaryPanelMode swaps left-pane titles for modifier vs algo', () => {
    const doc = dom.window.document;
    const primaryTitle = doc.createElement('div');
    primaryTitle.id = 'left-section-primary-title';
    const secondaryTitle = doc.createElement('div');
    secondaryTitle.id = 'left-section-secondary-title';
    doc.body.appendChild(primaryTitle);
    doc.body.appendChild(secondaryTitle);

    ModifiersPanel.bind({ getEl: (id, opts) => doc.getElementById(id) });

    const ctx = { isModifierLayer: (l) => Boolean(l?.modifier) };
    ModifiersPanel.updatePrimaryPanelMode.call(ctx, { modifier: { type: 'mirror' } });
    expect(primaryTitle.textContent).toBe('Modifier');
    expect(secondaryTitle.textContent).toBe('Modifier Configuration');

    ModifiersPanel.updatePrimaryPanelMode.call(ctx, {});
    expect(primaryTitle.textContent).toBe('Algorithm');
    expect(secondaryTitle.textContent).toBe('Algorithm Configuration');

    doc.body.removeChild(primaryTitle);
    doc.body.removeChild(secondaryTitle);
  });
});
