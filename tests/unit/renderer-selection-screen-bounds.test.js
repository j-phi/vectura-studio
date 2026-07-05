/**
 * Phase-2 read API (provided by Lane A): getSelectionScreenBounds() returns
 * the axis-aligned screen-space bbox of the current selection so the
 * Contextual Task Bar can anchor to it. Null when nothing is selected;
 * accounts for scale/offset and a live tempTransform.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer.getSelectionScreenBounds', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeRenderer = (layers) => {
    const { Renderer } = runtime.window.Vectura;
    const engine = { layers, currentProfile: { width: 300, height: 300 } };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    return renderer;
  };

  const square = () => ({
    id: 'sq', visible: true, isGroup: false,
    paths: [[{ x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 }]],
    origin: { x: 0, y: 0 }, params: { posX: 0, posY: 0, rotation: 0 }, strokeWidth: 0.5,
  });

  test('returns null with no selection', () => {
    const renderer = makeRenderer([square()]);
    expect(renderer.getSelectionScreenBounds()).toBeNull();
  });

  test('maps world bounds to screen px with scale + offset', () => {
    const renderer = makeRenderer([square()]);
    renderer.scale = 2;
    renderer.offsetX = 10;
    renderer.offsetY = 20;
    renderer.setSelection(['sq'], 'sq');
    const b = renderer.getSelectionScreenBounds();
    // world (40,40)-(80,80) → screen x = x*2+10, y = y*2+20
    expect(b.minX).toBeCloseTo(90, 5);
    expect(b.minY).toBeCloseTo(100, 5);
    expect(b.maxX).toBeCloseTo(170, 5);
    expect(b.maxY).toBeCloseTo(180, 5);
    expect(b.width).toBeCloseTo(80, 5);
    expect(b.height).toBeCloseTo(80, 5);
    expect(b.centerX).toBeCloseTo(130, 5);
    expect(b.centerY).toBeCloseTo(140, 5);
  });

  test('reflects a live tempTransform (move preview)', () => {
    const renderer = makeRenderer([square()]);
    renderer.setSelection(['sq'], 'sq');
    renderer.tempTransform = { dx: 10, dy: 0, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
    const b = renderer.getSelectionScreenBounds();
    expect(b.minX).toBeCloseTo(50, 5); // 40 + 10
    expect(b.maxX).toBeCloseTo(90, 5);
  });
});
