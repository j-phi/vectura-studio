/*
 * STR-1 — Per-layer stroke style model.
 *
 * The layer model extends the existing persisted `lineCap` to the full
 * 3-value set (butt|round|projecting) and gains new persisted fields:
 *   lineJoin   ('miter'|'round'|'bevel', default 'round')
 *   miterLimit (number, default 10)
 *   dash       ({ enabled:boolean, pattern:number[] } up to 6 entries, mm)
 *   strokeAlign ('center'|'inside'|'outside', default 'center' — STR-4 model)
 * All serialized in `.vectura` with backward-compatible defaults.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../..');

describe('STR-1 stroke style model', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    // The new config module is not yet wired into index.html (Lane F owns the
    // shell); load it explicitly the way the integrator's script tag will.
    runtime.window.eval(
      fs.readFileSync(path.join(ROOT, 'src/config/stroke-options.js'), 'utf8')
    );
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('new Layer carries backward-compatible stroke style defaults', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);

    expect(layer.lineCap).toBe('round');
    expect(layer.lineJoin).toBe('round');
    expect(layer.miterLimit).toBe(10);
    expect(layer.dash).toEqual({ enabled: false, pattern: [] });
    expect(layer.strokeAlign).toBe('center');
  });

  test('exportState → importState round-trips every stroke style field', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.lineCap = 'projecting';
    layer.lineJoin = 'miter';
    layer.miterLimit = 4;
    layer.dash = { enabled: true, pattern: [3, 1.5, 0.5, 1.5] };
    layer.strokeAlign = 'outside';

    const state = engine.exportState();
    // Mutate live layer to prove import restores from the snapshot.
    layer.lineCap = 'round';
    layer.lineJoin = 'round';
    layer.miterLimit = 10;
    layer.dash = { enabled: false, pattern: [] };
    layer.strokeAlign = 'center';

    engine.importState(state);
    const restored = engine.getLayerById(id);
    expect(restored.lineCap).toBe('projecting');
    expect(restored.lineJoin).toBe('miter');
    expect(restored.miterLimit).toBe(4);
    expect(restored.dash).toEqual({ enabled: true, pattern: [3, 1.5, 0.5, 1.5] });
    expect(restored.strokeAlign).toBe('outside');

    // The imported dash must be a fresh clone, not shared with the payload.
    state.layers.find((entry) => entry.id === id).dash.pattern[0] = 99;
    expect(restored.dash.pattern[0]).toBe(3);
  });

  test('legacy .vectura payloads without the new fields import with defaults', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const state = engine.exportState();
    state.layers.forEach((entry) => {
      delete entry.lineJoin;
      delete entry.miterLimit;
      delete entry.dash;
      delete entry.strokeAlign;
      entry.lineCap = 'butt'; // legacy 2-value era field survives untouched
    });

    engine.importState(state);
    const restored = engine.getLayerById(id);
    expect(restored.lineCap).toBe('butt');
    expect(restored.lineJoin).toBe('round');
    expect(restored.miterLimit).toBe(10);
    expect(restored.dash).toEqual({ enabled: false, pattern: [] });
    expect(restored.strokeAlign).toBe('center');
  });

  test('importState sanitizes hostile stroke style values', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const state = engine.exportState();
    const entry = state.layers.find((e) => e.id === id);
    entry.lineJoin = 'zigzag';
    entry.miterLimit = 'NaN-ish';
    entry.dash = { enabled: 'yes', pattern: [1, -2, Infinity, 'x', 3, 4, 5, 6, 7] };
    entry.strokeAlign = 'sideways';

    engine.importState(state);
    const restored = engine.getLayerById(id);
    expect(restored.lineJoin).toBe('round');
    expect(restored.miterLimit).toBe(10);
    expect(restored.dash.enabled).toBe(true);
    // Non-finite / negative entries dropped, capped at 6 entries.
    expect(restored.dash.pattern).toEqual([1, 3, 4, 5, 6, 7].slice(0, 6));
    expect(restored.dash.pattern.length).toBeLessThanOrEqual(6);
    expect(restored.strokeAlign).toBe('center');
  });

  test('duplicateLayer copies the stroke style fields', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.lineCap = 'projecting';
    layer.lineJoin = 'bevel';
    layer.miterLimit = 7;
    layer.dash = { enabled: true, pattern: [2, 1] };
    layer.strokeAlign = 'inside';

    const dup = engine.duplicateLayer(id);
    expect(dup.lineCap).toBe('projecting');
    expect(dup.lineJoin).toBe('bevel');
    expect(dup.miterLimit).toBe(7);
    expect(dup.dash).toEqual({ enabled: true, pattern: [2, 1] });
    expect(dup.strokeAlign).toBe('inside');
    // Dash must not be shared between source and duplicate.
    dup.dash.pattern[0] = 42;
    expect(layer.dash.pattern[0]).toBe(2);
  });

  test('STROKE_STYLE config helpers map projecting → square for canvas/SVG', () => {
    const S = runtime.window.Vectura.STROKE_STYLE;
    expect(S).toBeTruthy();
    expect(S.CAPS).toEqual(['butt', 'round', 'projecting']);
    expect(S.JOINS).toEqual(['miter', 'round', 'bevel']);
    expect(S.toCanvasCap('projecting')).toBe('square');
    expect(S.toCanvasCap('butt')).toBe('butt');
    expect(S.toCanvasCap('round')).toBe('round');
    expect(S.toCanvasCap('garbage')).toBe('round');
    expect(S.normalizeCap('square')).toBe('projecting');
    expect(S.DASH_MAX_ENTRIES).toBe(6);
    expect(S.sanitizeDash({ enabled: true, pattern: [1, 2, 3, 4, 5, 6, 7, 8] }).pattern.length).toBe(6);
    expect(S.getLayerDashPattern({ dash: { enabled: true, pattern: [3, 1] } })).toEqual([3, 1]);
    expect(S.getLayerDashPattern({ dash: { enabled: false, pattern: [3, 1] } })).toBeNull();
    expect(S.getLayerDashPattern({ dash: { enabled: true, pattern: [0, 0] } })).toBeNull();
    expect(S.getLayerDashPattern({})).toBeNull();
  });
});
