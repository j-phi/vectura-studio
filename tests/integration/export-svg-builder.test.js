/**
 * ExportSvgBuilder: File > Export SVG must stay byte-identical now that the
 * snapshot + document code lives in src/ui/export-svg-builder.js.
 *
 * The expected hashes were captured from the pre-extraction UI path
 * (ui-file-io.js at 1b55c76) on a hand-built document that uses no
 * trigonometric generators, so they hold on every architecture.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

const GOLDEN = {
  crop: '48ce46f25c3281671a3654995f2d3202c5ef21f3f10086512fa8daf25ed0acaa',
  clip: '3b6f85655f85b99233d3d7af066d1eda068a610003011b3db58a278ba911ba5f',
};

describe('ExportSvgBuilder byte identity', () => {
  let runtime;
  let app;
  let window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    window = runtime.window;
    window.app = new window.Vectura.App();
    app = window.app;
  }, 60000);
  afterAll(() => runtime.cleanup());

  const buildDoc = (flags) => {
    const { SETTINGS } = window.Vectura;
    app.applyState(JSON.parse(JSON.stringify(app.captureState())));
    SETTINGS.optimizationExport = false;
    Object.assign(SETTINGS, flags);
    const engine = app.engine;
    engine.layers.length = 0;
    const a = engine.addShapeLayer('Tri', [
      [{ x: 20, y: 20 }, { x: 120, y: 30 }, { x: 70, y: 110 }, { x: 20, y: 20 }],
      [{ x: -40, y: 50 }, { x: 300, y: 60 }],
    ]);
    const b = engine.addShapeLayer('Zig', [
      [{ x: 30, y: 150 }, { x: 60, y: 130 }, { x: 90, y: 170 }, { x: 120, y: 130 }, { x: 150, y: 170 }],
    ]);
    const layerB = engine.layers.find((l) => l.id === b);
    layerB.dash = { enabled: true, pattern: [2, 1] };
    layerB.lineCap = 'butt';
    const pens = SETTINGS.pens;
    layerB.penId = (pens[1] || pens[0]).id;
    engine.generate(a);
    engine.generate(b);
    app.computeDisplayGeometry();
  };

  const viaUi = () => app.ui.buildSvgDocument().svg;
  const viaBuilder = () => {
    const B = window.Vectura.ExportSvgBuilder;
    const snapshot = B.buildExportSnapshot(app.engine, { computeDisplayGeometry: () => app.computeDisplayGeometry() });
    return B.buildSvgDocument(snapshot);
  };

  const CASES = {
    crop: { cropExports: true, removeHiddenGeometry: true, truncate: true },
    clip: { cropExports: false, removeHiddenGeometry: false, truncate: true },
  };

  test.each(Object.keys(CASES))('%s: UI export, builder and the pre-extraction golden agree', (name) => {
    expect(window.Vectura.ExportSvgBuilder, 'ExportSvgBuilder not registered').toBeTruthy();
    buildDoc(CASES[name]);
    const ui = viaUi();
    const built = viaBuilder();
    expect(ui.length).toBeGreaterThan(200);
    expect(built).toBe(ui);
    expect(sha(ui)).toBe(GOLDEN[name]);
  });

  test('the builder is side-effect free: a second build is identical and SETTINGS is untouched', () => {
    buildDoc(CASES.crop);
    const before = JSON.stringify(window.Vectura.SETTINGS);
    const first = viaBuilder();
    const second = viaBuilder();
    expect(second).toBe(first);
    expect(JSON.stringify(window.Vectura.SETTINGS)).toBe(before);
  });
});
