/**
 * RGR: Standard select tool (V) hit testing.
 * findLayerAtPoint must use stroke-distance checking, not just bounding-box,
 * so a click near a single thin line reliably selects it.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer.findLayerAtPoint — standard select hit testing', () => {
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
      // No getRenderablePaths → getInteractionPaths falls back to layer.paths
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
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

  // --- Horizontal line ---

  test('clicking exactly on a horizontal line selects it', () => {
    // Line from (100,100) to (200,100)
    const layer = makeLayer('h', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const renderer = makeRenderer([layer]);
    const hit = renderer.findLayerAtPoint({ x: 150, y: 100 });
    expect(hit).toBe(layer);
  });

  test('clicking 4px above a horizontal line still selects it (within stroke tolerance)', () => {
    // Line from (100,100) to (200,100) — bounding box has zero height, so bounds-only fails
    const layer = makeLayer('h', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const renderer = makeRenderer([layer]);
    // 4px above the line — bounding box approach will miss, path-distance approach hits
    const hit = renderer.findLayerAtPoint({ x: 150, y: 96 });
    expect(hit).toBe(layer);
  });

  test('clicking 4px below a horizontal line still selects it (within stroke tolerance)', () => {
    const layer = makeLayer('h', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const renderer = makeRenderer([layer]);
    const hit = renderer.findLayerAtPoint({ x: 150, y: 104 });
    expect(hit).toBe(layer);
  });

  test('clicking 20px away from a horizontal line does not select it', () => {
    const layer = makeLayer('h', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const renderer = makeRenderer([layer]);
    const hit = renderer.findLayerAtPoint({ x: 150, y: 120 });
    expect(hit).toBeNull();
  });

  // --- Vertical line ---

  test('clicking exactly on a vertical line selects it', () => {
    const layer = makeLayer('v', [{ x: 150, y: 50 }, { x: 150, y: 150 }]);
    const renderer = makeRenderer([layer]);
    const hit = renderer.findLayerAtPoint({ x: 150, y: 100 });
    expect(hit).toBe(layer);
  });

  test('clicking 4px to the right of a vertical line still selects it', () => {
    const layer = makeLayer('v', [{ x: 150, y: 50 }, { x: 150, y: 150 }]);
    const renderer = makeRenderer([layer]);
    const hit = renderer.findLayerAtPoint({ x: 154, y: 100 });
    expect(hit).toBe(layer);
  });

  test('clicking 20px away from a vertical line does not select it', () => {
    const layer = makeLayer('v', [{ x: 150, y: 50 }, { x: 150, y: 150 }]);
    const renderer = makeRenderer([layer]);
    const hit = renderer.findLayerAtPoint({ x: 170, y: 100 });
    expect(hit).toBeNull();
  });

  // --- Locked layer ---

  test('includeLocked=false skips locked layers', () => {
    const layer = makeLayer('locked', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const renderer = makeRenderer([layer]);
    renderer.isLayerLocked = (id) => id === 'locked';
    expect(renderer.findLayerAtPoint({ x: 150, y: 100 }, false)).toBeNull();
  });

  test('includeLocked=true returns locked layers', () => {
    const layer = makeLayer('locked', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const renderer = makeRenderer([layer]);
    renderer.isLayerLocked = (id) => id === 'locked';
    expect(renderer.findLayerAtPoint({ x: 150, y: 100 }, true)).toBe(layer);
  });

  // --- Topmost layer wins ---

  test('returns the topmost layer when two lines overlap', () => {
    // engine.layers is ordered bottom→top; findLayerAtPoint reverses → topmost first
    const bottom = makeLayer('bot', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const top = makeLayer('top', [{ x: 100, y: 100 }, { x: 200, y: 100 }]);
    const renderer = makeRenderer([bottom, top]);
    const hit = renderer.findLayerAtPoint({ x: 150, y: 100 });
    expect(hit).toBe(top);
  });
});
