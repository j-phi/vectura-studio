/*
 * Compile gate for src/ui/panels/transform-panel.js (Phase 2 step 4).
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

describe('transform-panel compile gate', () => {
  let dom;
  let TransformPanel;

  beforeAll(() => {
    dom = loadInJSDOM([
      'src/config/defaults.js',
      'src/ui/panels/transform-panel.js',
    ]);
    const w = dom.window;
    expect(w.Vectura).toBeTruthy();
    expect(w.Vectura.UI).toBeTruthy();
    TransformPanel = w.Vectura.UI.TransformPanel;
  });

  afterAll(() => dom?.window?.close?.());

  it('exposes window.Vectura.UI.TransformPanel with bind + 3 methods', () => {
    expect(TransformPanel).toBeTruthy();
    expect(typeof TransformPanel.bind).toBe('function');
    expect(typeof TransformPanel.getDefaultTransformForType).toBe('function');
    expect(typeof TransformPanel.storeLayerParams).toBe('function');
    expect(typeof TransformPanel.restoreLayerParams).toBe('function');
  });

  it('getDefaultTransformForType throws a clear error before bind()', () => {
    expect(() => TransformPanel.getDefaultTransformForType.call({}, 'flowfield', {}))
      .toThrow(/TransformPanel\.getDefaultTransformForType invoked before TransformPanel\.bind/);
  });

  it('after bind(deps), getDefaultTransformForType returns canonical transform', () => {
    TransformPanel.bind({
      ALGO_DEFAULTS: {
        flowfield: { seed: 7, posX: 10, posY: 20 },
      },
      TRANSFORM_KEYS: ['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation'],
      clone: (v) => JSON.parse(JSON.stringify(v)),
    });

    const out = TransformPanel.getDefaultTransformForType.call({}, 'flowfield', { seed: 99 });
    expect(out).toEqual({
      seed: 7,
      posX: 10,
      posY: 20,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    });
  });

  it('getDefaultTransformForType falls back to currentParams.seed when base lacks one', () => {
    TransformPanel.bind({
      ALGO_DEFAULTS: { boids: {} },
      TRANSFORM_KEYS: ['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation'],
      clone: (v) => JSON.parse(JSON.stringify(v)),
    });

    const out = TransformPanel.getDefaultTransformForType.call({}, 'boids', { seed: 42 });
    expect(out.seed).toBe(42);
    expect(out.scaleX).toBe(1);
  });

  it('storeLayerParams strips transform keys and snapshots into paramStates', () => {
    TransformPanel.bind({
      ALGO_DEFAULTS: {},
      TRANSFORM_KEYS: ['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation'],
      clone: (v) => JSON.parse(JSON.stringify(v)),
    });

    const layer = {
      type: 'flowfield',
      params: { seed: 1, posX: 5, density: 0.5, count: 100 },
    };
    TransformPanel.storeLayerParams.call({}, layer);
    expect(layer.paramStates.flowfield).toEqual({ density: 0.5, count: 100 });
  });

  it('restoreLayerParams swaps type and restores stored params with carried transform', () => {
    TransformPanel.bind({
      ALGO_DEFAULTS: { boids: { speed: 2.0 } },
      TRANSFORM_KEYS: ['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation'],
      clone: (v) => JSON.parse(JSON.stringify(v)),
    });

    const layer = {
      type: 'flowfield',
      params: { seed: 5, posX: 10, density: 0.5 },
      paramStates: { boids: { count: 50 } },
    };
    // Use real prototype methods via call(this).
    const ctx = {
      getDefaultTransformForType: TransformPanel.getDefaultTransformForType,
      storeLayerParams: TransformPanel.storeLayerParams,
    };
    TransformPanel.restoreLayerParams.call(ctx, layer, 'boids');
    expect(layer.type).toBe('boids');
    expect(layer.params.speed).toBe(2.0);
    expect(layer.params.count).toBe(50);
    // Seed is carried from currentParams when base lacks one.
    expect(layer.params.seed).toBe(5);
    // posX/posY/scale/rotation come from base defaults (0/0/1/1/0); current
    // values are NOT carried (this matches legacy getDefaultTransformForType).
    expect(layer.params.posX).toBe(0);
    expect(layer.params.scaleX).toBe(1);
  });
});
