/*
 * Compile gate for src/ui/panels/algorithm-panel.js (Phase 2 step 4).
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

describe('algorithm-panel compile gate', () => {
  let dom;
  let AlgorithmPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/algorithm-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    AlgorithmPanel = w.Vectura.UI.AlgorithmPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.AlgorithmPanel with bind + algorithm-specific methods', () => {
    expect(AlgorithmPanel).toBeTruthy();
    expect(typeof AlgorithmPanel.bind).toBe('function');
    expect(typeof AlgorithmPanel.syncPrimaryModuleDropdown).toBe('function');
    expect(typeof AlgorithmPanel.isModifierType).toBe('function');
    expect(typeof AlgorithmPanel.isDrawableLayerType).toBe('function');
    expect(typeof AlgorithmPanel.rememberDrawableLayerType).toBe('function');
    expect(typeof AlgorithmPanel.getPreferredNewLayerType).toBe('function');
    // Unit 1.8: algorithm-specific methods moved out of _ui-legacy.js
    expect(typeof AlgorithmPanel.computeHarmonographPlotterData).toBe('function');
    expect(typeof AlgorithmPanel.mountHarmonographPlotter).toBe('function');
    expect(typeof AlgorithmPanel.applyScissor).toBe('function');
  });

  it('isModifierType throws a clear error before bind()', () => {
    expect(() => AlgorithmPanel.isModifierType.call({}, 'mirror'))
      .toThrow(/AlgorithmPanel\.isModifierType invoked before AlgorithmPanel\.bind/);
  });

  it('after bind(deps), isModifierType reports membership in MODIFIER_DEFAULTS', () => {
    AlgorithmPanel.bind({
      getEl: () => null,
      ALGO_DEFAULTS: {},
      MODIFIER_DEFAULTS: { mirror: { label: 'Mirror' } },
      Algorithms: {},
    });
    expect(AlgorithmPanel.isModifierType.call({}, 'mirror')).toBe(true);
    expect(AlgorithmPanel.isModifierType.call({}, 'flowfield')).toBe(false);
  });

  it('isDrawableLayerType excludes group, modifier, and unknown types', () => {
    AlgorithmPanel.bind({
      getEl: () => null,
      ALGO_DEFAULTS: { flowfield: {}, boids: {} },
      MODIFIER_DEFAULTS: { mirror: {} },
      Algorithms: { flowfield: () => {}, boids: () => {} },
    });
    const ctx = { isModifierType: AlgorithmPanel.isModifierType };
    expect(AlgorithmPanel.isDrawableLayerType.call(ctx, 'flowfield')).toBe(true);
    expect(AlgorithmPanel.isDrawableLayerType.call(ctx, 'group')).toBe(false);
    expect(AlgorithmPanel.isDrawableLayerType.call(ctx, 'mirror')).toBe(false);
    expect(AlgorithmPanel.isDrawableLayerType.call(ctx, 'nonsense')).toBe(false);
  });

  it('rememberDrawableLayerType caches and returns the type', () => {
    AlgorithmPanel.bind({
      getEl: () => null,
      ALGO_DEFAULTS: { flowfield: {} },
      MODIFIER_DEFAULTS: { mirror: {} },
      Algorithms: { flowfield: () => {} },
    });
    const ctx = {
      lastDrawableLayerType: null,
      isModifierType: AlgorithmPanel.isModifierType,
      isDrawableLayerType: AlgorithmPanel.isDrawableLayerType,
    };
    const got = AlgorithmPanel.rememberDrawableLayerType.call(ctx, 'flowfield');
    expect(got).toBe('flowfield');
    expect(ctx.lastDrawableLayerType).toBe('flowfield');

    // Non-drawable falls back to cached
    const got2 = AlgorithmPanel.rememberDrawableLayerType.call(ctx, 'group');
    expect(got2).toBe('flowfield');
  });

  it('computeHarmonographPlotterData returns empty path when no pendulums are enabled', () => {
    AlgorithmPanel.bind({
      getEl: () => null,
      ALGO_DEFAULTS: {},
      MODIFIER_DEFAULTS: {},
      Algorithms: {},
    });
    const layer = { params: { pendulums: [] } };
    const result = AlgorithmPanel.computeHarmonographPlotterData.call({}, layer);
    expect(result).toEqual({ path: [], durationSec: 0 });
  });

  it('computeHarmonographPlotterData returns a populated path for a single pendulum', () => {
    AlgorithmPanel.bind({
      getEl: () => null,
      ALGO_DEFAULTS: {},
      MODIFIER_DEFAULTS: {},
      Algorithms: {},
    });
    const layer = {
      params: {
        samples: 200,
        duration: 5,
        scale: 1,
        pendulums: [{ enabled: true, ampX: 10, ampY: 10, freq: 1, phaseX: 0, phaseY: 90, damp: 0, micro: 0 }],
      },
    };
    const result = AlgorithmPanel.computeHarmonographPlotterData.call({}, layer);
    expect(Array.isArray(result.path)).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.durationSec).toBeGreaterThan(0);
  });

  it('applyScissor returns silently when payload has no mode', () => {
    AlgorithmPanel.bind({
      getEl: () => null,
      ALGO_DEFAULTS: {},
      MODIFIER_DEFAULTS: {},
      Algorithms: {},
    });
    const ctx = {
      app: { engine: { layers: [] } },
    };
    expect(() => AlgorithmPanel.applyScissor.call(ctx, { mode: null })).not.toThrow();
    expect(() => AlgorithmPanel.applyScissor.call(ctx, null)).not.toThrow();
  });

  it('syncPrimaryModuleDropdown returns silently when select element is missing', () => {
    AlgorithmPanel.bind({
      getEl: () => null,
      ALGO_DEFAULTS: {},
      MODIFIER_DEFAULTS: {},
      Algorithms: {},
    });
    const ctx = { isModifierLayer: () => false };
    expect(() => AlgorithmPanel.syncPrimaryModuleDropdown.call(ctx, { type: 'flowfield' })).not.toThrow();
  });

  // Meridian Unit 1.9c: splitShapeLayer moved from _ui-legacy.js class body
  it('installOn registers splitShapeLayer on the UI prototype (Unit 1.9c)', () => {
    expect(typeof AlgorithmPanel.splitShapeLayer).toBe('function');
    const proto = {};
    AlgorithmPanel.installOn(proto);
    expect(typeof proto.splitShapeLayer).toBe('function');
  });
});
