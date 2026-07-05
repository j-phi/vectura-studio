/**
 * SEL-1 (Illustrator tools parity, Phase 1 Lane A): 8 selection handles —
 * 4 corners (existing) + 4 edge midpoints (new). Edge-midpoint drags resize
 * along one axis only; Shift constrains proportions.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SEL-1: side (edge-midpoint) resize handles', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = (layerList) => {
    const { Renderer } = runtime.window.Vectura;
    const engine = {
      layers: layerList,
      currentProfile: { width: 300, height: 300 },
      getBounds() {
        return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false };
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    return renderer;
  };

  const makeLayer = (id, points, overrides = {}) => ({
    id,
    visible: true,
    isGroup: false,
    paths: [points],
    origin: { x: 0, y: 0 },
    params: { posX: 0, posY: 0, rotation: 0 },
    strokeWidth: 0.5,
    ...overrides,
  });

  const squareLayer = () =>
    makeLayer('sq', [
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]);

  test('getHandlePoints returns 8 handles including edge midpoints', () => {
    const renderer = makeRenderer([squareLayer()]);
    const bounds = renderer.getSelectionBounds([renderer.engine.layers[0]]);
    const handles = renderer.getHandlePoints(bounds);
    expect(handles).toHaveLength(8);
    const byKey = Object.fromEntries(handles.map((h) => [h.key, h]));
    ['nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w'].forEach((key) => {
      expect(byKey[key]).toBeTruthy();
    });
    expect(byKey.n.x).toBeCloseTo(60, 5);
    expect(byKey.n.y).toBeCloseTo(40, 5);
    expect(byKey.e.x).toBeCloseTo(80, 5);
    expect(byKey.e.y).toBeCloseTo(60, 5);
    expect(byKey.s.x).toBeCloseTo(60, 5);
    expect(byKey.s.y).toBeCloseTo(80, 5);
    expect(byKey.w.x).toBeCloseTo(40, 5);
    expect(byKey.w.y).toBeCloseTo(60, 5);
  });

  test('hitHandle hits all 8 handle zones', () => {
    const renderer = makeRenderer([squareLayer()]);
    const bounds = renderer.getSelectionBounds([renderer.engine.layers[0]]);
    // scale=1, offset=0 → screen === world
    expect(renderer.hitHandle(40, 40, bounds)).toBe('nw');
    expect(renderer.hitHandle(80, 40, bounds)).toBe('ne');
    expect(renderer.hitHandle(80, 80, bounds)).toBe('se');
    expect(renderer.hitHandle(40, 80, bounds)).toBe('sw');
    expect(renderer.hitHandle(60, 40, bounds)).toBe('n');
    expect(renderer.hitHandle(80, 60, bounds)).toBe('e');
    expect(renderer.hitHandle(60, 80, bounds)).toBe('s');
    expect(renderer.hitHandle(40, 60, bounds)).toBe('w');
  });

  test('corner handles win over edge handles when zones overlap', () => {
    // Tiny 12mm box at scale 1: corner and edge hit zones (r=10) overlap.
    const layer = makeLayer('tiny', [
      { x: 50, y: 50 }, { x: 62, y: 50 }, { x: 62, y: 62 }, { x: 50, y: 62 }, { x: 50, y: 50 },
    ]);
    const renderer = makeRenderer([layer]);
    const bounds = renderer.getSelectionBounds([layer]);
    // Exactly on the NW corner — must be the corner, not the nearby n/w edges.
    expect(renderer.hitHandle(50, 50, bounds)).toBe('nw');
  });

  test('getResizeAnchor for an edge handle is the opposite edge midpoint', () => {
    const renderer = makeRenderer([squareLayer()]);
    const bounds = renderer.getSelectionBounds([renderer.engine.layers[0]]);
    const anchorN = renderer.getResizeAnchor('n', bounds);
    expect(anchorN.x).toBeCloseTo(60, 5);
    expect(anchorN.y).toBeCloseTo(80, 5);
    const anchorE = renderer.getResizeAnchor('e', bounds);
    expect(anchorE.x).toBeCloseTo(40, 5);
    expect(anchorE.y).toBeCloseTo(60, 5);
    const anchorS = renderer.getResizeAnchor('s', bounds);
    expect(anchorS.y).toBeCloseTo(40, 5);
    const anchorW = renderer.getResizeAnchor('w', bounds);
    expect(anchorW.x).toBeCloseTo(80, 5);
  });

  test('getHandlePoint resolves edge keys', () => {
    const renderer = makeRenderer([squareLayer()]);
    const bounds = renderer.getSelectionBounds([renderer.engine.layers[0]]);
    const n = renderer.getHandlePoint('n', bounds);
    expect(n.x).toBeCloseTo(60, 5);
    expect(n.y).toBeCloseTo(40, 5);
    const w = renderer.getHandlePoint('w', bounds);
    expect(w.x).toBeCloseTo(40, 5);
    expect(w.y).toBeCloseTo(60, 5);
  });

  test('handleCursor for edge handles maps to axis resize cursors', () => {
    const renderer = makeRenderer([squareLayer()]);
    const bounds = renderer.getSelectionBounds([renderer.engine.layers[0]]);
    expect(renderer.handleCursor('n', bounds)).toContain('ns-resize');
    expect(renderer.handleCursor('s', bounds)).toContain('ns-resize');
    expect(renderer.handleCursor('e', bounds)).toContain('ew-resize');
    expect(renderer.handleCursor('w', bounds)).toContain('ew-resize');
  });
});
