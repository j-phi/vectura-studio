const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG export stroke width override', () => {
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
      return 'blob:test-export-stroke-override';
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

  const buildScene = ({ penWidth, layerStrokeWidth }) => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: penWidth }];

    const layer = {
      id: 'layer-1',
      name: 'L1',
      visible: true,
      isGroup: false,
      penId: 'p1',
      strokeWidth: layerStrokeWidth,
      lineCap: 'round',
      params: { curves: false },
      paths: [[
        { x: 20, y: 20 },
        { x: 60, y: 60 },
      ]],
    };

    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [layer],
      optimizeLayers() {},
    };

    return { UI, SETTINGS, app: { engine, computeDisplayGeometry() {} } };
  };

  test('uses pen width when Export Stroke Override is OFF (default)', async () => {
    const { UI, SETTINGS, app } = buildScene({ penWidth: 0.7, layerStrokeWidth: 0.3 });
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.strokeWidth = 0.3;

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));
    expect(svg).toMatch(/stroke-width="0\.700"/);
    expect(svg).not.toMatch(/stroke-width="0\.300"/);
  });

  test('uses SETTINGS.strokeWidth when Export Stroke Override is ON', async () => {
    const { UI, SETTINGS, app } = buildScene({ penWidth: 0.7, layerStrokeWidth: 1.4 });
    SETTINGS.strokeWidthOverride = true;
    SETTINGS.strokeWidth = 1.4;

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));
    expect(svg).toMatch(/stroke-width="1\.400"/);
    expect(svg).not.toMatch(/stroke-width="0\.700"/);
  });

  test('falls back to SETTINGS.strokeWidth when override is OFF and pen has no width', async () => {
    const { UI, SETTINGS, app } = buildScene({ penWidth: undefined, layerStrokeWidth: 0.9 });
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.strokeWidth = 0.5;

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));
    expect(svg).toMatch(/stroke-width="0\.500"/);
  });
});
