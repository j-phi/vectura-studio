const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Masking runtime', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const bounds = {
    width: 240,
    height: 180,
    m: 20,
    dW: 200,
    dH: 140,
    truncate: true,
  };

  test('closed expanded layers are eligible mask sources', () => {
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

  test('mask subtraction splits open paths around silhouette polygons', () => {
    const { Masking } = runtime.window.Vectura;
    const segments = Masking.applyMaskToPaths(
      [[
        { x: 20, y: 100 },
        { x: 220, y: 100 },
      ]],
      [[
        { x: 80, y: 80 },
        { x: 160, y: 80 },
        { x: 160, y: 120 },
        { x: 80, y: 120 },
        { x: 80, y: 80 },
      ]]
    );

    expect(segments.length).toBe(2);
    expect(segments[0][segments[0].length - 1].x).toBeLessThanOrEqual(80.01);
    expect(segments[1][0].x).toBeGreaterThanOrEqual(159.99);
  });

  test('engine computes masked display paths without mutating source geometry', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const target = new Layer('target', 'expanded', 'Target');
    target.paths = [[
      { x: 20, y: 100 },
      { x: 220, y: 100 },
    ]];
    target.mask = {
      enabled: true,
      sourceIds: ['mask'],
      mode: 'silhouette',
      invert: false,
      materialized: false,
    };

    const mask = new Layer('mask', 'expanded', 'Mask');
    mask.paths = [[
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 120 },
      { x: 80, y: 120 },
      { x: 80, y: 80 },
    ]];

    engine.layers.push(target, mask);
    engine.computeAllDisplayGeometry();

    expect(target.paths).toHaveLength(1);
    expect(target.displayPaths).toHaveLength(2);
    expect(target.displayPaths[0][target.displayPaths[0].length - 1].x).toBeLessThanOrEqual(80.01);
    expect(target.displayPaths[1][0].x).toBeGreaterThanOrEqual(159.99);
  });

  test('horizon silhouettes follow the first visible terrain row for clipping', () => {
    const { Layer, Masking } = runtime.window.Vectura;
    const layer = new Layer('terrain', 'wavetable', 'Terrain');
    layer.params.lineStructure = 'horizon';
    layer.paths = [
      [
        { x: 20, y: 80 },
        { x: 120, y: 80 },
        { x: 220, y: 80 },
      ],
      [
        { x: 20, y: 120 },
        { x: 120, y: 40 },
        { x: 220, y: 120 },
      ],
    ];

    const polygons = Masking.getLayerSilhouette(layer, null, bounds);

    expect(polygons).toHaveLength(1);
    const topPoint = polygons[0].reduce((best, point) => (point.y < best.y ? point : best), polygons[0][0]);
    expect(topPoint.y).toBe(80);
  });

  test('horizon silhouette ignores deeper terrain strips and follows the visible skyline row', () => {
    const { Layer, Masking } = runtime.window.Vectura;
    const layer = new Layer('terrain', 'wavetable', 'Terrain');
    layer.params.lineStructure = 'horizon';
    layer.paths = [
      [
        { x: 20, y: 60 },
        { x: 120, y: 60 },
        { x: 220, y: 60 },
      ],
    ];
    layer.paths[0].meta = { horizonRole: 'row', horizonRowIndex: 0 };
    layer.maskPolygons = [[
      { x: 20, y: 120 },
      { x: 120, y: 40 },
      { x: 220, y: 120 },
      { x: 220, y: 160 },
      { x: 20, y: 160 },
      { x: 20, y: 120 },
    ]];

    const polygons = Masking.getLayerSilhouette(layer, null, bounds);

    expect(polygons).toHaveLength(1);
    const topPoint = polygons[0].reduce((best, point) => (point.y < best.y ? point : best), polygons[0][0]);
    expect(topPoint.y).toBe(60);
  });

  test('engine masking uses the Horizon skyline row to hide overlapping background geometry', () => {
    const { VectorEngine, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const target = new Layer('target', 'expanded', 'Target');
    target.paths = [[
      { x: 120, y: 20 },
      { x: 120, y: 160 },
    ]];
    target.mask = {
      enabled: true,
      sourceIds: ['terrain'],
      mode: 'silhouette',
      invert: false,
      materialized: false,
    };

    const terrain = new Layer('terrain', 'wavetable', 'Terrain');
    terrain.params.lineStructure = 'horizon';
    terrain.paths = [
      [
        { x: 20, y: 80 },
        { x: 120, y: 80 },
        { x: 220, y: 80 },
      ],
      [
        { x: 20, y: 120 },
        { x: 120, y: 40 },
        { x: 220, y: 120 },
      ],
    ];

    engine.layers.push(target, terrain);
    engine.computeAllDisplayGeometry();

    expect(target.displayPaths).toHaveLength(1);
    expect(target.displayPaths[0][0].y).toBeLessThanOrEqual(20.01);
    expect(target.displayPaths[0][target.displayPaths[0].length - 1].y).toBeLessThanOrEqual(80.01);
  });
});
