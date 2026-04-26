const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Masking runtime', () => {
  let runtime;
  let runtimeWithRenderer;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    runtimeWithRenderer = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
    runtimeWithRenderer.cleanup();
  });

  const bounds = {
    width: 240,
    height: 180,
    m: 20,
    dW: 200,
    dH: 140,
    truncate: true,
  };

  test('closed expanded layers are eligible mask parents', () => {
    const { Layer, Masking } = runtime.window.Vectura;
    const layer = new Layer('shape', 'expanded', 'Shape');
    layer.paths = [[
      { x: 60, y: 60 },
      { x: 140, y: 60 },
      { x: 140, y: 140 },
      { x: 60, y: 140 },
      { x: 60, y: 60 },
    ]];

    const result = Masking.getLayerMaskCapabilities(layer, null, bounds);

    expect(result.canSource).toBe(true);
    expect(result.sourceType).toBe('closed-shape');
  });

  test('open paths are not eligible mask parents', () => {
    const { Layer, Masking } = runtime.window.Vectura;
    const layer = new Layer('open', 'expanded', 'Open');
    layer.paths = [[
      { x: 40, y: 60 },
      { x: 180, y: 120 },
    ]];

    const result = Masking.getLayerMaskCapabilities(layer, null, bounds);

    expect(result.canSource).toBe(false);
  });

  test('mask parents clip direct descendants without mutating source geometry', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('mask-parent', 'expanded', 'Mask Parent');
    maskParent.paths = [[
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 120 },
      { x: 80, y: 120 },
      { x: 80, y: 80 },
    ]];
    maskParent.mask.enabled = true;

    const child = new Layer('child', 'expanded', 'Child');
    child.parentId = maskParent.id;
    child.paths = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];

    engine.layers.push(maskParent, child);
    engine.computeAllDisplayGeometry();

    expect(maskParent.displayMaskActive).toBe(false);
    expect(maskParent.displayPaths).toHaveLength(1);
    expect(child.paths).toHaveLength(1);
    expect(child.displayPaths).toHaveLength(1);
    expect(child.displayPaths[0][0].x).toBeGreaterThanOrEqual(79.99);
    expect(child.displayPaths[0][child.displayPaths[0].length - 1].x).toBeLessThanOrEqual(160.01);
  });

  test('circular mask parents treat interior points as inside and clip descendants to the circle', () => {
    const { VectorEngine, Layer, PathBoolean } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const cx = 120;
    const cy = 110;
    const r = 74;
    const circle = [];
    for (let i = 0; i <= 96; i += 1) {
      const theta = (i / 96) * Math.PI * 2;
      circle.push({
        x: cx + Math.cos(theta) * r,
        y: cy + Math.sin(theta) * r,
      });
    }
    circle.meta = { kind: 'circle', cx, cy, r };

    expect(PathBoolean.pointInPolygon({ x: cx, y: cy }, circle)).toBe(true);
    expect(PathBoolean.pointInPolygon({ x: cx, y: cy - r - 4 }, circle)).toBe(false);

    const maskParent = new Layer('mask-circle', 'expanded', 'Mask Circle');
    maskParent.paths = [circle];
    maskParent.mask.enabled = true;

    const child = new Layer('child', 'expanded', 'Child');
    child.parentId = maskParent.id;
    child.paths = [];
    for (let row = 0; row < 8; row += 1) {
      const y = 30 + row * 20;
      const path = [];
      for (let x = 20; x <= 220; x += 4) {
        path.push({ x, y: y + Math.sin(x * 0.04 + row) * 5 });
      }
      child.paths.push(path);
    }

    engine.layers.push(maskParent, child);
    engine.computeAllDisplayGeometry();

    const outsidePoints = (child.displayPaths || [])
      .flatMap((path) => path || [])
      .filter((pt) => Math.hypot(pt.x - cx, pt.y - cy) > r + 0.6);

    expect(child.displayPaths.length).toBeGreaterThan(0);
    expect(outsidePoints).toHaveLength(0);
  });

  test('editing a circle-backed mask source path demotes stale circle metadata and reclips descendants to the edited shape', () => {
    const { VectorEngine, Layer, Renderer } = runtimeWithRenderer.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const canvas = runtimeWithRenderer.document.getElementById('main-canvas');
    const renderer = new Renderer(canvas, engine);

    const cx = 120;
    const cy = 110;
    const r = 74;
    const circle = [];
    for (let i = 0; i <= 96; i += 1) {
      const theta = (i / 96) * Math.PI * 2;
      circle.push({
        x: cx + Math.cos(theta) * r,
        y: cy + Math.sin(theta) * r,
      });
    }
    circle.meta = {
      kind: 'circle',
      cx,
      cy,
      r,
      shape: {
        type: 'oval',
        cx,
        cy,
        rx: r,
        ry: r,
        cornerRadii: [],
      },
    };

    const maskParent = new Layer('mask-circle-edited', 'expanded', 'Mask Circle');
    maskParent.sourcePaths = [circle];
    maskParent.mask.enabled = true;
    maskParent.params.smoothing = 0;
    maskParent.params.simplify = 0;

    const child = new Layer('child-line', 'expanded', 'Child');
    child.parentId = maskParent.id;
    child.paths = [[
      { x: 20, y: 110 },
      { x: 220, y: 110 },
    ]];

    engine.layers.push(maskParent, child);
    engine.generate(maskParent.id);
    engine.computeAllDisplayGeometry();

    const beforeStartX = child.displayPaths[0][0].x;
    renderer.setDirectSelection(maskParent, 0);
    const leftmostIndex = renderer.directSelection.anchors.reduce(
      (best, anchor, index, anchors) => (anchor.x < anchors[best].x ? index : best),
      0
    );
    renderer.directSelection.anchors[leftmostIndex].x += 25;
    renderer.applyDirectPath();

    expect(maskParent.sourcePaths[0].meta.kind).toBe('poly');
    expect(maskParent.sourcePaths[0].meta.cx).toBeUndefined();
    expect(maskParent.sourcePaths[0].meta.r).toBeUndefined();
    expect(child.displayPaths[0][0].x).toBeGreaterThan(beforeStartX + 10);
  });

  test('hidden mask parents still clip descendants while suppressing their own renderable geometry', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const maskParent = new Layer('mask-parent-hidden', 'expanded', 'Mask Parent');
    maskParent.paths = [[
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 80 },
    ]];
    maskParent.mask.enabled = true;
    maskParent.mask.hideLayer = true;

    const child = new Layer('child', 'expanded', 'Child');
    child.parentId = maskParent.id;
    child.paths = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];

    engine.layers.push(maskParent, child);
    engine.computeAllDisplayGeometry();

    expect(engine.getRenderablePaths(maskParent)).toHaveLength(0);
    expect(child.displayPaths).toHaveLength(1);
    expect(child.displayPaths[0][0].x).toBeGreaterThanOrEqual(79.99);
    expect(child.displayPaths[0][child.displayPaths[0].length - 1].x).toBeLessThanOrEqual(160.01);
  });

  test('nested mask parents combine across the ancestor chain', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const outer = new Layer('outer', 'expanded', 'Outer');
    outer.paths = [[
      { x: 40, y: 40 },
      { x: 200, y: 40 },
      { x: 200, y: 160 },
      { x: 40, y: 160 },
      { x: 40, y: 40 },
    ]];
    outer.mask.enabled = true;

    const inner = new Layer('inner', 'expanded', 'Inner');
    inner.parentId = outer.id;
    inner.paths = [[
      { x: 100, y: 70 },
      { x: 180, y: 70 },
      { x: 180, y: 130 },
      { x: 100, y: 130 },
      { x: 100, y: 70 },
    ]];
    inner.mask.enabled = true;

    const child = new Layer('child', 'expanded', 'Child');
    child.parentId = inner.id;
    child.paths = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];

    engine.layers.push(outer, inner, child);
    engine.computeAllDisplayGeometry();

    expect(child.displayPaths).toHaveLength(1);
    expect(child.displayPaths[0][0].x).toBeGreaterThanOrEqual(99.99);
    expect(child.displayPaths[0][child.displayPaths[0].length - 1].x).toBeLessThanOrEqual(180.01);
  });

  test('multiple disjoint mask polygons keep interior segments from the full union', () => {
    const { Masking } = runtime.window.Vectura;
    const path = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];
    const left = [
      { x: 40, y: 70 },
      { x: 90, y: 70 },
      { x: 90, y: 130 },
      { x: 40, y: 130 },
      { x: 40, y: 70 },
    ];
    const right = [
      { x: 150, y: 70 },
      { x: 200, y: 70 },
      { x: 200, y: 130 },
      { x: 150, y: 130 },
      { x: 150, y: 70 },
    ];

    const clipped = Masking.applyMaskToPaths(path, [left, right], { invert: true });

    expect(clipped).toHaveLength(2);
    expect(clipped[0][0].x).toBeGreaterThanOrEqual(39.99);
    expect(clipped[0][clipped[0].length - 1].x).toBeLessThanOrEqual(90.01);
    expect(clipped[1][0].x).toBeGreaterThanOrEqual(149.99);
    expect(clipped[1][clipped[1].length - 1].x).toBeLessThanOrEqual(200.01);
  });

  test('buildLayerMaskedPaths can exclude the active mask parent while preserving other ancestors', () => {
    const { VectorEngine, Layer, Masking } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const outer = new Layer('outer-mask', 'expanded', 'Outer');
    outer.paths = [[
      { x: 40, y: 60 },
      { x: 200, y: 60 },
      { x: 200, y: 140 },
      { x: 40, y: 140 },
      { x: 40, y: 60 },
    ]];
    outer.mask.enabled = true;

    const active = new Layer('active-mask', 'expanded', 'Active');
    active.parentId = outer.id;
    active.paths = [[
      { x: 100, y: 80 },
      { x: 180, y: 80 },
      { x: 180, y: 120 },
      { x: 100, y: 120 },
      { x: 100, y: 80 },
    ]];
    active.mask.enabled = true;

    const child = new Layer('child-line', 'expanded', 'Child');
    child.parentId = active.id;
    child.paths = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];

    engine.layers.push(outer, active, child);
    engine.computeAllDisplayGeometry();

    const fullChain = Masking.buildLayerMaskedPaths(child, engine, bounds);
    const withoutActive = Masking.buildLayerMaskedPaths(child, engine, bounds, {
      excludeMaskLayerId: active.id,
    });

    expect(fullChain).toHaveLength(1);
    expect(fullChain[0][0].x).toBeGreaterThanOrEqual(99.99);
    expect(fullChain[0][fullChain[0].length - 1].x).toBeLessThanOrEqual(180.01);
    expect(withoutActive).toHaveLength(1);
    expect(withoutActive[0][0].x).toBeGreaterThanOrEqual(39.99);
    expect(withoutActive[0][withoutActive[0].length - 1].x).toBeLessThanOrEqual(200.01);
  });

  test('legacy source masks are cleared on import', () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    engine.importState({
      activeLayerId: 'target',
      layers: [
        {
          id: 'target',
          type: 'expanded',
          name: 'Target',
          params: {},
          parentId: null,
          isGroup: false,
          sourcePaths: [[{ x: 0, y: 0 }, { x: 10, y: 0 }]],
          mask: {
            enabled: true,
            sourceIds: ['legacy-mask'],
            mode: 'silhouette',
            invert: false,
            materialized: false,
          },
          visible: true,
        },
      ],
    });

    const imported = engine.layers[0];
    expect(imported.mask.enabled).toBe(false);
    expect(imported.mask.sourceIds).toEqual([]);
    expect(imported.mask.mode).toBe('parent');
  });

  test('getLayerSilhouette returns empty array for a layer with no paths', () => {
    const { Layer, Masking } = runtime.window.Vectura;
    const empty = new Layer('empty', 'expanded', 'Empty');
    empty.paths = [];

    const polygons = Masking.getLayerSilhouette(empty, null, bounds);

    expect(Array.isArray(polygons)).toBe(true);
    expect(polygons).toHaveLength(0);
  });

  test('applyMaskToPaths returns empty array when input paths are empty', () => {
    const { Masking } = runtime.window.Vectura;
    const mask = [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 150 },
      { x: 50, y: 150 },
      { x: 50, y: 50 },
    ];

    const result = Masking.applyMaskToPaths([], [mask], { invert: true });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('a child whose parent mask has no closed silhouette receives no clipping', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    // Open (non-closed) path — cannot form a silhouette
    const openMask = new Layer('open-mask', 'expanded', 'Open Mask');
    openMask.paths = [[
      { x: 40, y: 60 },
      { x: 200, y: 60 },
    ]];
    openMask.mask.enabled = true;

    const child = new Layer('child', 'expanded', 'Child');
    child.parentId = openMask.id;
    child.paths = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];

    engine.layers.push(openMask, child);
    engine.computeAllDisplayGeometry();

    // Child paths should remain unclipped since the mask parent cannot provide a silhouette
    expect(child.displayPaths).toHaveLength(1);
    expect(child.displayPaths[0][0].x).toBeLessThanOrEqual(21);
    expect(child.displayPaths[0][child.displayPaths[0].length - 1].x).toBeGreaterThanOrEqual(219);
  });

  test('circle-typed child paths are clipped by a mask and lose circle meta on output', () => {
    const { Masking, PathBoolean } = runtime.window.Vectura;

    // Square mask: 100×100 centred at (120, 110)
    const mask = [
      { x: 70, y: 60 },
      { x: 170, y: 60 },
      { x: 170, y: 160 },
      { x: 70, y: 160 },
      { x: 70, y: 60 },
    ];

    // 0-length circle entirely inside mask (rainfall / phylla style)
    const circleIn = [];
    circleIn.meta = { kind: 'circle', cx: 120, cy: 110, r: 20 };

    // 0-length circle partially outside mask
    const circlePartial = [];
    circlePartial.meta = { kind: 'circle', cx: 165, cy: 110, r: 30 };

    // 0-length circle entirely outside mask — should produce no output
    const circleOut = [];
    circleOut.meta = { kind: 'circle', cx: 220, cy: 110, r: 10 };

    // Multi-point circle (shapepack style) partially overlapping mask
    const circleMulti = [];
    for (let i = 0; i <= 36; i++) {
      const theta = (i / 36) * Math.PI * 2;
      circleMulti.push({ x: 90 + Math.cos(theta) * 40, y: 110 + Math.sin(theta) * 40 });
    }
    circleMulti.meta = { kind: 'circle', cx: 90, cy: 110, r: 40 };

    const result = Masking.applyMaskToPaths(
      [circleIn, circlePartial, circleOut, circleMulti],
      [mask],
      { invert: true },
    );

    // At least circleIn and circlePartial should produce output; circleOut should be dropped
    expect(result.length).toBeGreaterThanOrEqual(2);

    // No output segment should carry meta.kind = 'circle' — that would bypass renderer clipping
    result.forEach((seg) => {
      expect(seg.meta?.kind).not.toBe('circle');
    });

    // All output points must lie within (or on the boundary of) the mask
    result.forEach((seg) => {
      seg.forEach((pt) => {
        const inside = PathBoolean.pointInPolygon(pt, mask);
        const onEdge = pt.x >= 69.99 && pt.x <= 170.01 && pt.y >= 59.99 && pt.y <= 160.01;
        expect(inside || onEdge).toBe(true);
      });
    });
  });
});
