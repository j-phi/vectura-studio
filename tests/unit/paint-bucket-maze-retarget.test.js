/**
 * Regression test: updateLastPaintedFills must forward all maze (and truchet,
 * stripes, weave) params when the paint-bucket panel controls change.
 *
 * Bug: FIELD_MAP in renderer.js omitted these entries, so changing the Maze
 * Algorithm selector (and other B3/B4/B8/B10 controls) had no visual effect
 * — the stored fill record kept its original values.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer.updateLastPaintedFills — maze / truchet / stripes / weave param retargeting', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = (engine) => {
    const { Renderer } = runtime.window.Vectura;
    const r = new Renderer('main-canvas', engine);
    return r;
  };

  const makeEngine = (fills) => ({
    layers: [{ id: 'layer-1', fills }],
    computeAllDisplayGeometry: vi.fn(),
  });

  const baseFillRecord = (overrides = {}) => ({
    id: 'fill-abc123',
    fillType: 'maze',
    density: 1,
    angle: 0,
    amplitude: 1.0,
    padding: 0,
    shiftX: 0,
    shiftY: 0,
    region: [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ],
    // B4 Maze defaults
    mazeCellSize: 5,
    mazeAlgorithm: 'dfs',
    mazeBranchBias: 0.5,
    mazeSeed: 1,
    mazeWallMode: 'walls',
    // B3 Truchet defaults
    truchetTileSet: 'quarter-arcs',
    truchetTileSize: 6,
    truchetSeed: 1,
    truchetRotations: 4,
    // B8 Stripes defaults
    stripeBandWidth: 4,
    stripeGap: 2,
    stripeAngle: 0,
    stripePrimary: 'hatch',
    stripeSecondary: 'none',
    stripeSecondaryDensity: 2,
    // B10 Weave defaults
    weavePattern: 'plain',
    weaveStrandWidth: 1.5,
    weaveGap: 0.3,
    weaveAngle: 0,
    weaveOver: 1,
    weaveUnder: 1,
    // Other missing fields
    lineCount: 1,
    polyPadding: 0,
    polyRotation: 0,
    polyRotationStep: 0,
    polyScale: 1,
    ...overrides,
  });

  // ── B4 Maze ────────────────────────────────────────────────────────────────
  test('mazeAlgorithm is updated in the fill record when selector changes', () => {
    const rec = baseFillRecord({ mazeAlgorithm: 'dfs' });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    const changed = renderer.updateLastPaintedFills({ fillMazeAlgorithm: 'wilson' });

    expect(changed).toBe(true);
    expect(rec.mazeAlgorithm).toBe('wilson');
  });

  test('mazeCellSize is updated in the fill record when slider changes', () => {
    const rec = baseFillRecord({ mazeCellSize: 5 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillMazeCellSize: 10 });

    expect(rec.mazeCellSize).toBe(10);
  });

  test('mazeBranchBias is updated in the fill record when slider changes', () => {
    const rec = baseFillRecord({ mazeBranchBias: 0.5 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillMazeBranchBias: 0.9 });

    expect(rec.mazeBranchBias).toBe(0.9);
  });

  test('mazeSeed is updated in the fill record when slider changes', () => {
    const rec = baseFillRecord({ mazeSeed: 1 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillMazeSeed: 42 });

    expect(rec.mazeSeed).toBe(42);
  });

  test('mazeWallMode is updated in the fill record when selector changes', () => {
    const rec = baseFillRecord({ mazeWallMode: 'walls' });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillMazeWallMode: 'path' });

    expect(rec.mazeWallMode).toBe('path');
  });

  // ── B3 Truchet ────────────────────────────────────────────────────────────
  test('truchetTileSet is updated in the fill record when selector changes', () => {
    const rec = baseFillRecord({ fillType: 'truchet', truchetTileSet: 'quarter-arcs' });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillTruchetTileSet: 'diagonals' });

    expect(rec.truchetTileSet).toBe('diagonals');
  });

  test('truchetTileSize is updated in the fill record when slider changes', () => {
    const rec = baseFillRecord({ fillType: 'truchet', truchetTileSize: 6 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillTruchetTileSize: 12 });

    expect(rec.truchetTileSize).toBe(12);
  });

  // ── B8 Stripes ────────────────────────────────────────────────────────────
  test('stripeBandWidth is updated in the fill record when slider changes', () => {
    const rec = baseFillRecord({ fillType: 'stripes', stripeBandWidth: 4 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillStripeBandWidth: 8 });

    expect(rec.stripeBandWidth).toBe(8);
  });

  test('stripePrimary is updated in the fill record when selector changes', () => {
    const rec = baseFillRecord({ fillType: 'stripes', stripePrimary: 'hatch' });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillStripePrimary: 'dots' });

    expect(rec.stripePrimary).toBe('dots');
  });

  // ── B10 Weave ─────────────────────────────────────────────────────────────
  test('weavePattern is updated in the fill record when selector changes', () => {
    const rec = baseFillRecord({ fillType: 'weave', weavePattern: 'plain' });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillWeavePattern: 'twill' });

    expect(rec.weavePattern).toBe('twill');
  });

  test('weaveStrandWidth is updated in the fill record when slider changes', () => {
    const rec = baseFillRecord({ fillType: 'weave', weaveStrandWidth: 1.5 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillWeaveStrandWidth: 3 });

    expect(rec.weaveStrandWidth).toBe(3);
  });

  // ── Other omitted fields ──────────────────────────────────────────────────
  test('lineCount is updated in the fill record when slider changes', () => {
    const rec = baseFillRecord({ fillType: 'hatch', lineCount: 1 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillLineCount: 3 });

    expect(rec.lineCount).toBe(3);
  });

  test('polyRotation is updated in the fill record when angle changes', () => {
    const rec = baseFillRecord({ fillType: 'polygonal', polyRotation: 0 });
    const engine = makeEngine([rec]);
    const renderer = makeRenderer(engine);
    renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-abc123' }];

    renderer.updateLastPaintedFills({ fillPolyRotation: 45 });

    expect(rec.polyRotation).toBe(45);
  });
});
