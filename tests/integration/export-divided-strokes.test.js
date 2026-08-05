const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Integration seam: stroke-division fragments (layer.dividedPaths, stamped with
// per-fragment meta.penId by the engine division stage) must flow into SVG
// export and land in their effective-pen groups.
describe('SVG export of divided strokes', () => {
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
      return 'blob:test-export-divided-strokes';
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

  const pathWithMeta = (points, meta) => Object.assign(points.map((p) => ({ ...p })), { meta: { ...meta } });

  const buildScene = ({ dividedPaths }) => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.pens = [
      { id: 'p1', name: 'P1', color: '#111111', width: 0.3 },
      { id: 'p2', name: 'P2', color: '#222222', width: 0.5 },
    ];

    const layer = {
      id: 'layer-1',
      name: 'L1',
      visible: true,
      isGroup: false,
      penId: 'p1',
      lineCap: 'round',
      params: { curves: false },
      paths: [pathWithMeta([{ x: 20, y: 20 }, { x: 80, y: 20 }], {})],
      dividedPaths,
    };

    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [layer],
      optimizeLayers() {},
    };

    return { UI, app: { engine, computeDisplayGeometry() {} } };
  };

  test('divided fragments export in their effective-pen groups, not the parent geometry', async () => {
    const PARENT = [{ x: 20, y: 20 }, { x: 80, y: 20 }];
    const dividedPaths = [
      pathWithMeta([{ x: 20, y: 20 }, { x: 30, y: 20 }], { penId: 'p2', parentGeom: PARENT, fragIndex: 0 }),
      pathWithMeta([{ x: 35, y: 20 }, { x: 45, y: 20 }], { parentGeom: PARENT, fragIndex: 1 }),
      pathWithMeta([{ x: 50, y: 20 }, { x: 60, y: 20 }], { penId: 'p2', parentGeom: PARENT, fragIndex: 2 }),
    ];
    const { UI, app } = buildScene({ dividedPaths });

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));

    // Fragment pens split into groups: p2 fragments in the P2 group, the
    // inherit-pen fragment in the layer's P1 group.
    expect(svg).toMatch(/<g id="pen_P2"/);
    expect(svg).toMatch(/<g id="pen_P1"/);
    // The undivided parent path (x=80 endpoint) must NOT be exported.
    expect(svg).not.toMatch(/L 80\.000 20\.000/);
    // Fragment geometry is exported (x=30 endpoint from the first fragment).
    expect(svg).toMatch(/L 30\.000 20\.000/);
  });

  test('plotter optimize keeps every sibling fragment of a divided parent', async () => {
    const PARENT = [{ x: 20, y: 20 }, { x: 80, y: 20 }];
    const dividedPaths = [
      pathWithMeta([{ x: 20, y: 20 }, { x: 30, y: 20 }], { penId: 'p2', parentGeom: PARENT, fragIndex: 0 }),
      pathWithMeta([{ x: 35, y: 20 }, { x: 45, y: 20 }], { parentGeom: PARENT, fragIndex: 1 }),
      pathWithMeta([{ x: 50, y: 20 }, { x: 60, y: 20 }], { penId: 'p2', parentGeom: PARENT, fragIndex: 2 }),
    ];
    const { UI, app } = buildScene({ dividedPaths });
    runtime.window.Vectura.SETTINGS.plotterOptimize = 0.1;

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));

    // Owner-map dedupe: same-layer siblings sharing one parent geometry ALL survive.
    expect(svg).toMatch(/L 30\.000 20\.000/);
    expect(svg).toMatch(/L 45\.000 20\.000/);
    expect(svg).toMatch(/L 60\.000 20\.000/);
  });

  test('Fix-A: a divided layer + an undivided duplicate on the same pen export the geometry ONCE', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.plotterOptimize = 0.5;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.3 }];

    const PARENT = [{ x: 20, y: 20 }, { x: 80, y: 20 }];
    const mkLayer = (id, name, extra) => ({
      id,
      name,
      visible: true,
      isGroup: false,
      penId: 'p1',
      lineCap: 'round',
      params: { curves: false },
      paths: [pathWithMeta(PARENT.map((p) => ({ ...p })), {})],
      ...extra,
    });
    // Gapless single-pen division: two fragments TILE the whole parent [20,80].
    const divLayer = mkLayer('div', 'Div', {
      dividedPaths: [
        pathWithMeta([{ x: 20, y: 20 }, { x: 50, y: 20 }], { parentGeom: PARENT, fragIndex: 0 }),
        pathWithMeta([{ x: 50, y: 20 }, { x: 80, y: 20 }], { parentGeom: PARENT, fragIndex: 1 }),
      ],
    });
    const plainLayer = mkLayer('plain', 'Plain', { dividedPaths: null });
    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [divLayer, plainLayer],
      optimizeLayers() {},
    };
    const app = { engine, computeDisplayGeometry() {} };

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));

    // The gapless division claims the parent key at the export tolerance, so its
    // 2 tiling fragments export while the coincident undivided solid dedupes
    // away — exactly 2 paths, not 3. The fragment seam (x=50) proves it is the
    // divided representation that survived, inking the shared geometry ONCE.
    expect((svg.match(/<path /g) || []).length).toBe(2);
    expect(svg).toMatch(/L 50\.000 20\.000/);
  });

  test('Fix-A: a DASHED (gapped) divided layer + a coincident SOLID both export (gaps covered)', async () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    SETTINGS.margin = 10;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.removeHiddenGeometry = false;
    SETTINGS.optimizationExport = false;
    SETTINGS.strokeWidthOverride = false;
    SETTINGS.plotterOptimize = 0.5;
    SETTINGS.pens = [{ id: 'p1', name: 'P1', color: '#111111', width: 0.3 }];

    const PARENT = [{ x: 20, y: 20 }, { x: 80, y: 20 }];
    const mkLayer = (id, name, extra) => ({
      id, name, visible: true, isGroup: false, penId: 'p1',
      lineCap: 'round', params: { curves: false },
      paths: [pathWithMeta(PARENT.map((p) => ({ ...p })), {})],
      ...extra,
    });
    // Gapped division: fragments cover only PART of the parent, so they carry a
    // fragIndex but NO parentGeom (non-claiming) and must not drop the solid.
    const dashLayer = mkLayer('dash', 'Dash', {
      dividedPaths: [
        pathWithMeta([{ x: 20, y: 20 }, { x: 35, y: 20 }], { fragIndex: 0 }),
        pathWithMeta([{ x: 50, y: 20 }, { x: 65, y: 20 }], { fragIndex: 1 }),
      ],
    });
    const solidLayer = mkLayer('solid', 'Solid', { dividedPaths: null });
    const engine = {
      currentProfile: { width: 190, height: 150 },
      layers: [dashLayer, solidLayer],
      optimizeLayers() {},
    };
    const app = { engine, computeDisplayGeometry() {} };

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));

    // 2 dash fragments + 1 solid = 3 paths; the solid (x=80 endpoint) survives
    // and inks the gap regions the dashes leave open.
    expect((svg.match(/<path /g) || []).length).toBe(3);
    expect(svg).toMatch(/L 80\.000 20\.000/);
  });

  test('an all-gap cycle (empty dividedPaths) exports zero paths, matching the blank canvas', async () => {
    const { UI, app } = buildScene({ dividedPaths: [] });

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));

    // Empty-but-present dividedPaths must NOT fall through to the undivided
    // parent geometry the canvas is not drawing.
    expect(svg).not.toMatch(/L 80\.000 20\.000/);
    expect(svg).not.toMatch(/<path /);
  });

  test('layers without dividedPaths export their normal geometry unchanged', async () => {
    const { UI, app } = buildScene({ dividedPaths: null });

    const svg = await captureExportedSvg(() => UI.prototype.exportSVG.call({ app }));

    expect(svg).toMatch(/<g id="pen_P1"/);
    expect(svg).not.toMatch(/<g id="pen_P2"/);
    expect(svg).toMatch(/L 80\.000 20\.000/);
  });
});
