const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SVG export hidden geometry toggle', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const captureSvgExport = async (runExport) => {
    let capturedBlob = null;
    runtime.window.Blob = class MockBlob {
      constructor(parts = []) {
        this.parts = parts;
      }
      text() {
        return Promise.resolve(this.parts.map((part) => `${part ?? ''}`).join(''));
      }
    };
    runtime.window.URL.createObjectURL = (blob) => {
      capturedBlob = blob;
      return 'blob:test-hidden-geometry';
    };

    const originalCreateElement = runtime.document.createElement.bind(runtime.document);
    runtime.document.createElement = (tagName, options) => {
      const el = originalCreateElement(tagName, options);
      if (`${tagName}`.toLowerCase() === 'a') el.click = () => {};
      return el;
    };

    try {
      runExport();
      expect(capturedBlob).toBeTruthy();
      return await capturedBlob.text();
    } finally {
      runtime.document.createElement = originalCreateElement;
    }
  };

  const createCirclePath = (cx, cy, r, segments = 48) => {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      points.push({
        x: cx + Math.cos(t) * r,
        y: cy + Math.sin(t) * r,
      });
    }
    points.meta = { kind: 'circle', cx, cy, r };
    return points;
  };

  const createMaskedEngine = (options = {}) => {
    const { hideMaskLayer = false, parentPenId = 'p1', childPenId = 'p1' } = options;
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('mask-parent', 'expanded', 'Mask Parent');
    maskParent.penId = parentPenId;
    maskParent.strokeWidth = 0.4;
    maskParent.lineCap = 'round';
    maskParent.params.curves = false;
    maskParent.paths = [[
      { x: 70, y: 50 },
      { x: 130, y: 50 },
      { x: 130, y: 130 },
      { x: 70, y: 130 },
      { x: 70, y: 50 },
    ]];
    maskParent.mask.enabled = true;
    maskParent.mask.hideLayer = hideMaskLayer;

    const child = new Layer('child-circle', 'expanded', 'Child Circle');
    child.parentId = maskParent.id;
    child.penId = childPenId;
    child.strokeWidth = 0.4;
    child.lineCap = 'round';
    child.params.curves = false;
    child.paths = [createCirclePath(100, 90, 48)];

    engine.layers.push(maskParent, child);
    engine.computeAllDisplayGeometry();
    return engine;
  };

  test('remove hidden geometry trims masked descendants instead of exporting clip paths', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = true;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.4 }];

    const app = { engine: createMaskedEngine() };
    const svg = await captureSvgExport(() => UI.prototype.exportSVG.call({ app }));

    expect(svg).not.toContain('<clipPath');
    expect(svg).not.toContain(' clip-path=');
    expect(svg).toContain('stroke-linecap="butt"');
    expect(svg).toContain('<path d="');
    expect(svg).not.toContain('<circle ');
  });

  test('preserving hidden geometry exports the original circle with ancestor clip paths', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.4 }];

    const app = { engine: createMaskedEngine() };
    const svg = await captureSvgExport(() => UI.prototype.exportSVG.call({ app }));

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#');
    expect(svg).toContain('<circle ');
    expect(svg).toContain('stroke-linecap="round"');
  });

  test('hidden mask parents still provide clip paths without exporting their own artwork', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [
      { id: 'p1', name: 'Child Pen', color: '#111111', width: 0.4 },
      { id: 'p2', name: 'Mask Pen', color: '#222222', width: 0.4 },
    ];

    const app = {
      engine: createMaskedEngine({
        hideMaskLayer: true,
        parentPenId: 'p2',
        childPenId: 'p1',
      }),
    };
    const svg = await captureSvgExport(() => UI.prototype.exportSVG.call({ app }));

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#');
    expect(svg).toContain('stroke="#111111"');
    expect(svg).not.toContain('stroke="#222222"');
    expect(svg).not.toContain('pen_Mask_Pen');
  });

  test('optimized export still preserves hidden geometry when remove hidden geometry is off', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = true;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.4 }];

    const app = { engine: createMaskedEngine() };
    app.engine.layers.forEach((layer) => {
      layer.optimization = {
        bypassAll: false,
        steps: [{ id: 'linesimplify', enabled: true, bypass: false, tolerance: 0.5, mode: 'polyline' }],
      };
    });

    const svg = await captureSvgExport(() => UI.prototype.exportSVG.call({ app }));

    expect(svg).toContain('<clipPath');
    expect(svg).toContain('clip-path="url(#');
    expect(svg).toContain('<circle ');
    expect(svg).toContain('stroke-linecap="round"');
    expect(svg).not.toContain('stroke-linecap="butt"');
  });
});
