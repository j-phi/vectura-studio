/*
 * STR-3 — Dash pattern is render-side only: toggling `layer.dash.enabled`
 * must not change the display-geometry path/point counts (dash segments are
 * never exploded into separate plotter paths on screen). Export handles dash
 * as a stroke-dasharray attribute (covered by export-stroke-style.test.js);
 * physical dash expansion, if ever wanted, belongs in the export optimization
 * stack (logged as a PRH item, not built).
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../..');

describe('STR-3 dash stays render-side in the display pipeline', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    runtime.window.eval(
      fs.readFileSync(path.join(ROOT, 'src/config/stroke-options.js'), 'utf8')
    );
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const snapshotCounts = (layer) => ({
    displayPaths: (layer.displayPaths || []).length,
    effectivePaths: (layer.effectivePaths || []).length,
    displayPoints: layer.displayStats,
  });

  test('toggling dash leaves display geometry path/point counts unchanged', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.params.seed = 7;
    engine.generate(id);
    engine.computeAllDisplayGeometry();
    const before = snapshotCounts(layer);
    expect(before.displayPaths).toBeGreaterThan(0);

    layer.dash = { enabled: true, pattern: [3, 1.5, 0.5, 1.5] };
    engine.computeAllDisplayGeometry();
    const withDash = snapshotCounts(layer);
    expect(withDash).toEqual(before);

    layer.dash = { enabled: false, pattern: [3, 1.5, 0.5, 1.5] };
    engine.computeAllDisplayGeometry();
    expect(snapshotCounts(layer)).toEqual(before);
  });

  test('display path geometry is byte-identical with and without dash', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.params.seed = 11;
    engine.generate(id);
    engine.computeAllDisplayGeometry();
    const solid = JSON.stringify(layer.displayPaths);

    layer.dash = { enabled: true, pattern: [2, 1] };
    engine.computeAllDisplayGeometry();
    expect(JSON.stringify(layer.displayPaths)).toBe(solid);
  });
});
