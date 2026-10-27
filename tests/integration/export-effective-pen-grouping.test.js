const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Effective-pen export grouping: SVG export must bucket each PATH by its
// effective pen (path.meta.penId || layer.penId), not by the layer pen alone.
// Dedupe keys on meta.parentGeom when present so divided stroke fragments of
// the same parent collapse, while identical geometry on different pens
// survives once per pen group.
describe('SVG export effective per-path pen grouping', () => {
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
      return 'blob:test-export-effective-pen-grouping';
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

  const applyBaseSettings = () => {
    const { SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.strokeWidth = 0.3;
    SETTINGS.pens = [
      { id: 'pen-1', name: 'PenOne', color: '#111111', width: 0.3 },
      { id: 'pen-2', name: 'PenTwo', color: '#222222', width: 0.5 },
    ];
    return SETTINGS;
  };

  const makePath = (points, meta) => {
    const path = points.map((pt) => ({ x: pt[0], y: pt[1] }));
    if (meta) path.meta = meta;
    return path;
  };

  const makeLayer = (overrides = {}) => ({
    id: 'layer-1',
    name: 'L1',
    visible: true,
    isGroup: false,
    penId: 'pen-1',
    strokeWidth: 0.3,
    lineCap: 'round',
    params: { curves: false },
    paths: [],
    ...overrides,
  });

  const makeApp = (layers) => ({
    engine: {
      currentProfile: { width: 190, height: 150 },
      layers,
      optimizeLayers() {},
      hasCompoundAncestor: () => false,
    },
    computeDisplayGeometry() {},
  });

  const exportScene = async (layers) => {
    const { UI } = runtime.window.Vectura;
    const app = makeApp(layers);
    return captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));
  };

  // Top-level pen groups in document order, each with the rounded first X
  // coordinate of every contained <path> — enough to identify test paths.
  const firstX = (d) => {
    const m = /M\s*(-?[\d.]+)/.exec(d || '');
    return m ? Math.round(parseFloat(m[1])) : null;
  };

  const penGroups = (svg) => {
    const doc = new runtime.window.DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const groups = [];
    Array.from(doc.documentElement.children).forEach((el) => {
      if (el.tagName !== 'g') return;
      const id = el.getAttribute('id') || '';
      if (!id.startsWith('pen_')) return;
      groups.push({
        id,
        stroke: el.getAttribute('stroke'),
        xs: Array.from(el.getElementsByTagName('path')).map((p) => firstX(p.getAttribute('d'))),
      });
    });
    return groups;
  };

  test('path with meta.penId lands in that pen group, not the layer pen group', async () => {
    applyBaseSettings();
    const layer = makeLayer({
      paths: [
        makePath([[20, 20], [30, 20]]),
        makePath([[40, 40], [50, 40]], { penId: 'pen-2' }),
      ],
    });

    const groups = penGroups(await exportScene([layer]));
    expect(groups.map((g) => g.id)).toEqual(['pen_PenOne', 'pen_PenTwo']);
    expect(groups[0].xs).toEqual([20]);
    expect(groups[0].stroke).toBe('#111111');
    expect(groups[1].xs).toEqual([40]);
    expect(groups[1].stroke).toBe('#222222');
  });

  test('identical geometry on different effective pens both survive dedupe', async () => {
    const SETTINGS = applyBaseSettings();
    SETTINGS.plotterOptimize = 0.1;
    const layer = makeLayer({
      paths: [
        makePath([[20, 20], [60, 60]]),
        makePath([[20, 20], [60, 60]], { penId: 'pen-2' }),
      ],
    });

    const groups = penGroups(await exportScene([layer]));
    expect(groups.map((g) => g.id)).toEqual(['pen_PenOne', 'pen_PenTwo']);
    expect(groups[0].xs).toEqual([20]);
    expect(groups[1].xs).toEqual([20]);
  });

  test('pen-grouped line sort cannot interleave pens across groups', async () => {
    const SETTINGS = applyBaseSettings();
    SETTINGS.optimizationExport = true;
    const sorted = (order, extra) => ({ lineSortGrouping: 'pen', lineSortOrder: order, ...extra });
    const layer = makeLayer({
      optimizedPaths: [
        makePath([[10, 10], [15, 10]], sorted(0)),
        makePath([[30, 30], [35, 30]], sorted(1, { penId: 'pen-2' })),
        makePath([[50, 50], [55, 50]], sorted(2)),
      ],
      paths: [],
    });

    const groups = penGroups(await exportScene([layer]));
    expect(groups.map((g) => g.id)).toEqual(['pen_PenOne', 'pen_PenTwo']);
    // All pen-1 paths precede pen-2 paths; sort order kept within the group.
    expect(groups[0].xs).toEqual([10, 50]);
    expect(groups[1].xs).toEqual([30]);
  });

  test('same parent geometry keeps all sibling fragments of the owning layer', async () => {
    const SETTINGS = applyBaseSettings();
    SETTINGS.plotterOptimize = 0.1;
    const PARENT = [{ x: 20, y: 20 }, { x: 50, y: 40 }];
    const layer = makeLayer({
      paths: [
        makePath([[20, 20], [30, 20]], { parentGeom: PARENT, fragIndex: 0 }),
        makePath([[40, 40], [50, 40]], { parentGeom: PARENT, fragIndex: 1 }),
      ],
    });

    // Owner-map semantics (mirrors the engine): fragments of one divided
    // stroke share a parent geometry and must ALL survive within their layer.
    const groups = penGroups(await exportScene([layer]));
    expect(groups.map((g) => g.id)).toEqual(['pen_PenOne']);
    expect(groups[0].xs).toEqual([20, 40]);
  });

  test('another layer re-presenting the same parent geometry on the same pen is dropped', async () => {
    const SETTINGS = applyBaseSettings();
    SETTINGS.plotterOptimize = 0.1;
    const PARENT = [{ x: 20, y: 20 }, { x: 50, y: 40 }];
    const layerA = makeLayer({
      id: 'layer-a',
      paths: [
        makePath([[20, 20], [30, 20]], { parentGeom: PARENT, fragIndex: 0 }),
        makePath([[40, 40], [50, 40]], { parentGeom: PARENT, fragIndex: 1 }),
      ],
    });
    const layerB = makeLayer({
      id: 'layer-b',
      paths: [
        makePath([[60, 60], [70, 60]], { parentGeom: PARENT, fragIndex: 0 }),
      ],
    });

    const groups = penGroups(await exportScene([layerA, layerB]));
    expect(groups.map((g) => g.id)).toEqual(['pen_PenOne']);
    // layer-a owns the parent geometry; layer-b's duplicate parent drops entirely.
    expect(groups[0].xs).toEqual([20, 40]);
  });

  test('unknown meta.penId falls back to the layer pen group', async () => {
    applyBaseSettings();
    const layer = makeLayer({
      paths: [
        makePath([[20, 20], [30, 20]]),
        makePath([[40, 40], [50, 40]], { penId: 'pen-missing' }),
      ],
    });

    const groups = penGroups(await exportScene([layer]));
    expect(groups.map((g) => g.id)).toEqual(['pen_PenOne']);
    expect(groups[0].xs).toEqual([20, 40]);
    expect(groups[0].stroke).toBe('#111111');
  });

  test('regression guard: no per-path pens gives one group in layer path order', async () => {
    applyBaseSettings();
    const layerA = makeLayer({
      id: 'layer-1',
      name: 'LA',
      paths: [makePath([[20, 20], [30, 20]]), makePath([[40, 40], [50, 40]])],
    });
    const layerB = makeLayer({
      id: 'layer-2',
      name: 'LB',
      paths: [makePath([[60, 60], [70, 60]])],
    });

    const groups = penGroups(await exportScene([layerA, layerB]));
    expect(groups.map((g) => g.id)).toEqual(['pen_PenOne']);
    expect(groups[0].xs).toEqual([20, 40, 60]);
  });

  // Pen models: the SVG plots the model's laid width (pen.width, written by
  // the model/size pick), never an ink effect, and names the model with a
  // data attribute only when one is set.
  describe('pen models', () => {
    const attrsOf = (svg, id) => {
      const doc = new runtime.window.DOMParser().parseFromString(svg, 'image/svg+xml');
      const g = Array.from(doc.documentElement.children).find((el) => el.getAttribute('id') === id);
      return g ? Array.from(g.attributes).map((a) => a.name).sort() : null;
    };

    test('a plain pen group carries no pen-model attributes (plain export unchanged)', async () => {
      applyBaseSettings();
      const svg = await exportScene([makeLayer({ paths: [makePath([[20, 20], [30, 20]])] })]);
      expect(attrsOf(svg, 'pen_PenOne')).toEqual(['fill', 'id', 'stroke']);
      expect(svg).not.toContain('data-vectura');
    });

    test('a model pen plots its laid width and names the model; effects stay out of the geometry', async () => {
      const SETTINGS = applyBaseSettings();
      const { PenModel } = runtime.window.Vectura;
      const pen = SETTINGS.pens[0];
      PenModel.applyModel(pen, 'pentel-sign-pen');
      pen.effect = 'metallic';
      pen.ink = { wetness: 1, roughness: 0.5 };
      expect(pen.width).toBe(runtime.window.Vectura.PEN_MODELS.MODELS['pentel-sign-pen'].sizes[0].laidWidthMm);
      const svg = await exportScene([makeLayer({ paths: [makePath([[20, 20], [30, 20]])] })]);
      expect(svg).toContain('data-vectura-pen-model="pentel-sign-pen"');
      expect(svg).toContain('data-vectura-ink-effect="metallic"');
      expect(svg).toContain(`stroke-width="${pen.width.toFixed(3)}"`);
      // Only ever stroke paths in the pen colour: no filters, fills or ribbons.
      expect(svg).not.toMatch(/<filter|feTurbulence|fill="#/);
      expect(groupsStroke(svg)).toEqual(['#111111']);
    });

    const groupsStroke = (svg) => penGroups(svg).map((g) => g.stroke);

    test('special inks: every effect exports stroke = pen colour at pen width, geometry identical to the plain pen', async () => {
      const SETTINGS = applyBaseSettings();
      const layer = () => makeLayer({ paths: [makePath([[20, 20], [30, 25], [40, 20]])] });
      const plainSvg = await exportScene([layer()]);
      const strip = (svg) => svg.replace(/ data-vectura-ink-effect="[^"]*"/g, '');
      for (const effect of runtime.window.Vectura.PEN_MODELS.EFFECTS) {
        SETTINGS.pens[0].effect = effect;
        SETTINGS.pens[0].color2 = '#7dff9a';
        const svg = await exportScene([layer()]);
        expect(svg, effect).toContain(`data-vectura-ink-effect="${effect}"`);
        expect(groupsStroke(svg), effect).toEqual(['#111111']);
        expect(svg, effect).not.toContain('#7dff9a');
        expect(strip(svg), effect).toBe(plainSvg);
      }
    });

    test("a model's built-in special ink is recorded; an explicit 'plain' override is not", async () => {
      const SETTINGS = applyBaseSettings();
      const { PenModel } = runtime.window.Vectura;
      PenModel.applyModel(SETTINGS.pens[0], 'sakura-gelly-roll-metallic');
      const layer = () => makeLayer({ paths: [makePath([[20, 20], [30, 20]])] });
      expect(await exportScene([layer()])).toContain('data-vectura-ink-effect="metallic"');
      PenModel.applyEffectSwatch(SETTINGS.pens[0], null);
      expect(SETTINGS.pens[0].effect).toBe('plain');
      const svg = await exportScene([layer()]);
      expect(svg).not.toContain('data-vectura-ink-effect');
      expect(svg).toContain('data-vectura-pen-model="sakura-gelly-roll-metallic"');
    });

    test('a hostile model id cannot break out of the attribute', async () => {
      const SETTINGS = applyBaseSettings();
      SETTINGS.pens[0].model = 'x"><script>alert(1)</script>';
      const svg = await exportScene([makeLayer({ paths: [makePath([[20, 20], [30, 20]])] })]);
      expect(svg).not.toContain('<script');
      expect(penGroups(svg).map((g) => g.id)).toEqual(['pen_PenOne']);
    });
  });
});
