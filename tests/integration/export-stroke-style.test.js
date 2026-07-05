/*
 * STR-1 / STR-3 — SVG export emits the per-layer stroke style attributes:
 * stroke-linecap (projecting → square), stroke-linejoin, stroke-miterlimit
 * (while miter), and layer-level stroke-dasharray. Legacy layers without the
 * new fields keep today's output (round join, no dasharray).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG export stroke style attributes (STR-1/STR-3)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const captureExportedSvg = async (callback) => {
    let captured = null;
    const originalBlob = runtime.window.Blob;
    runtime.window.Blob = class MockBlob {
      constructor(parts = []) {
        this.parts = parts;
      }
      text() {
        return Promise.resolve(this.parts.map((part) => `${part ?? ''}`).join(''));
      }
    };
    const originalCreateUrl = runtime.window.URL.createObjectURL;
    runtime.window.URL.createObjectURL = (blob) => {
      captured = blob;
      return 'blob:test-export-stroke-style';
    };
    const originalCreateElement = runtime.document.createElement.bind(runtime.document);
    runtime.document.createElement = (tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (`${tagName}`.toLowerCase() === 'a') {
        el.click = () => {};
      }
      return el;
    };
    try {
      await callback();
      if (!captured) throw new Error('No SVG blob captured');
      return await captured.text();
    } finally {
      runtime.window.Blob = originalBlob;
      runtime.window.URL.createObjectURL = originalCreateUrl;
      runtime.document.createElement = originalCreateElement;
    }
  };

  const buildScene = (strokeFields = {}) => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.5 }];

    const layer = {
      id: 'layer-1',
      name: 'L1',
      visible: true,
      isGroup: false,
      penId: 'p1',
      strokeWidth: 0.5,
      lineCap: 'round',
      params: { curves: false },
      paths: [[
        { x: 20, y: 20 },
        { x: 60, y: 20 },
        { x: 40, y: 60 },
      ]],
      ...strokeFields,
    };

    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [layer],
      optimizeLayers() {},
    };

    return { UI, app: { engine, computeDisplayGeometry() {} } };
  };

  test('emits square linecap, miter join, miterlimit and layer dasharray', async () => {
    const { UI, app } = buildScene({
      lineCap: 'projecting',
      lineJoin: 'miter',
      miterLimit: 4,
      dash: { enabled: true, pattern: [3, 1.5] },
    });

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));
    expect(svg).toMatch(/stroke-linecap="square"/);
    expect(svg).toMatch(/stroke-linejoin="miter"/);
    expect(svg).toMatch(/stroke-miterlimit="4"/);
    expect(svg).toMatch(/stroke-dasharray="3 1\.5"/);
  });

  test('non-miter join emits no miterlimit; disabled dash emits no dasharray', async () => {
    const { UI, app } = buildScene({
      lineCap: 'butt',
      lineJoin: 'bevel',
      miterLimit: 4,
      dash: { enabled: false, pattern: [3, 1.5] },
    });

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));
    expect(svg).toMatch(/stroke-linecap="butt"/);
    expect(svg).toMatch(/stroke-linejoin="bevel"/);
    expect(svg).not.toMatch(/stroke-miterlimit/);
    expect(svg).not.toMatch(/stroke-dasharray/);
  });

  test('legacy layers without the new fields keep round join and solid strokes', async () => {
    const { UI, app } = buildScene(); // no lineJoin/miterLimit/dash on the layer

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));
    expect(svg).toMatch(/stroke-linecap="round"/);
    expect(svg).toMatch(/stroke-linejoin="round"/);
    expect(svg).not.toMatch(/stroke-miterlimit/);
    expect(svg).not.toMatch(/stroke-dasharray/);
  });
});
