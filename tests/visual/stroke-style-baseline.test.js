/*
 * STR-1 — visual baseline pair: the same sharp-angle path exported with
 * round vs miter join must produce distinct, stable SVG output (the join /
 * miterlimit attributes are the plotter-facing "visual" contract of a
 * no-raster SVG pipeline).
 *
 * STR-4 — visual baselines for the three Align Stroke modes: the display
 * geometry of a closed star ring under center / inside / outside alignment.
 *
 * Regenerate with: VECTURA_UPDATE_BASELINES=1 npm run test:visual
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathsToSvg } = require('../helpers/svg');

const UPDATE_BASELINES = process.env.VECTURA_UPDATE_BASELINES === '1';
const BASELINE_DIR = path.resolve(__dirname, '../baselines/svg');

const matchBaseline = (id, actual) => {
  const baselinePath = path.join(BASELINE_DIR, `${id}.svg`);
  if (UPDATE_BASELINES) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(baselinePath, actual, 'utf8');
    expect(fs.existsSync(baselinePath)).toBe(true);
    return;
  }
  expect(fs.existsSync(baselinePath)).toBe(true);
  const expected = fs.readFileSync(baselinePath, 'utf8');
  expect(actual).toBe(expected);
};

describe('Stroke style SVG baselines (STR-1)', () => {
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
      return 'blob:test-stroke-style-baseline';
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

  // Deterministic sharp-angle chevron (a ~24° apex) — the shape class where
  // round vs miter joins diverge most visibly on a plotter.
  const buildSharpAngleScene = (strokeFields) => {
    const { SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.precision = 3;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.8 }];

    const layer = {
      id: 'sharp-angle-layer',
      name: 'SharpAngle',
      visible: true,
      isGroup: false,
      penId: 'p1',
      strokeWidth: 0.8,
      params: { curves: false },
      paths: [[
        { x: 40, y: 100 },
        { x: 95, y: 40 },
        { x: 150, y: 100 },
      ]],
      ...strokeFields,
    };

    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [layer],
      optimizeLayers() {},
    };
    return { engine };
  };

  test('matches baseline: stroke-join-round', async () => {
    const { UI } = runtime.window.Vectura;
    const { engine } = buildSharpAngleScene({
      lineCap: 'round',
      lineJoin: 'round',
      miterLimit: 10,
      dash: { enabled: false, pattern: [] },
      strokeAlign: 'center',
    });
    const svg = await captureExportedSvg(() =>
      UI.prototype.exportSVG.call({ app: { engine, computeDisplayGeometry() {} } })
    );
    expect(svg).toContain('stroke-linejoin="round"');
    matchBaseline('stroke-join-round', svg);
  });

  test('matches baseline: stroke-join-miter', async () => {
    const { UI } = runtime.window.Vectura;
    const { engine } = buildSharpAngleScene({
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      dash: { enabled: false, pattern: [] },
      strokeAlign: 'center',
    });
    const svg = await captureExportedSvg(() =>
      UI.prototype.exportSVG.call({ app: { engine, computeDisplayGeometry() {} } })
    );
    expect(svg).toContain('stroke-linejoin="miter"');
    expect(svg).toContain('stroke-miterlimit="10"');
    matchBaseline('stroke-join-miter', svg);
  });

  // ── STR-4: Align Stroke display geometry ──────────────────────────────────
  // Deterministic closed 7-point star (mixed convex/reflex corners) — the
  // shape class where a signed miter offset must stay stable in both
  // directions.
  const starRing = () => {
    const pts = [];
    const cx = 95;
    const cy = 75;
    for (let i = 0; i < 14; i += 1) {
      const angle = (i / 14) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? 42 : 22;
      pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    }
    pts.push({ x: pts[0].x, y: pts[0].y });
    return pts;
  };

  const alignScenario = (strokeAlign) => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.params.curves = false;
    layer.paths = [starRing()];
    layer.strokeWidth = 3;
    layer.miterLimit = 10;
    layer.strokeAlign = strokeAlign;
    engine.computeAllDisplayGeometry();
    return pathsToSvg({
      width: 190,
      height: 150,
      paths: layer.displayPaths || [],
      precision: 3,
    });
  };

  test.each(['center', 'inside', 'outside'])('matches baseline: stroke-align-%s', (mode) => {
    matchBaseline(`stroke-align-${mode}`, alignScenario(mode));
  });
});
