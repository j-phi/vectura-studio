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

  // --- Pointer-type aware tolerance (a finger lands 5-20 px off a hairline) ---

  describe('pointer type', () => {
    const line = (id, y) => makeLayer(id, [{ x: 100, y }, { x: 200, y }]);

    test('a touch tap 10-20 px from a stroke selects it', () => {
      const layer = line('h', 100);
      const renderer = makeRenderer([layer]);
      [10, 15, 20].forEach((off) => {
        expect(renderer.findLayerAtPoint({ x: 150, y: 100 - off }, false, null, 'touch')).toBe(layer);
      });
    });

    test('a touch tap 30 px from a stroke still misses', () => {
      const renderer = makeRenderer([line('h', 100)]);
      expect(renderer.findLayerAtPoint({ x: 150, y: 70 }, false, null, 'touch')).toBeNull();
    });

    test('a mouse click 10 px from a stroke does not select it (5 px tolerance)', () => {
      const renderer = makeRenderer([line('h', 100)]);
      expect(renderer.findLayerAtPoint({ x: 150, y: 90 }, false, null, 'mouse')).toBeNull();
      expect(renderer.findLayerAtPoint({ x: 150, y: 90 }, false, null, 'pen')).toBeNull();
    });

    test('the last pointer type is the default', () => {
      const layer = line('h', 100);
      const renderer = makeRenderer([layer]);
      renderer.lastPointerType = 'touch';
      expect(renderer.findLayerAtPoint({ x: 150, y: 88 })).toBe(layer);
      renderer.lastPointerType = 'mouse';
      expect(renderer.findLayerAtPoint({ x: 150, y: 88 })).toBeNull();
    });

    test('with two strokes in touch range the nearer one wins, whatever the layer order', () => {
      const near = line('near', 108);
      const far = line('far', 118);
      [[near, far], [far, near]].forEach((order) => {
        const renderer = makeRenderer(order);
        expect(renderer.findLayerAtPoint({ x: 150, y: 100 }, false, null, 'touch')).toBe(near);
      });
    });

    test('the tolerance is in screen pixels: zoomed in, the world radius shrinks', () => {
      const layer = line('h', 100);
      const renderer = makeRenderer([layer]);
      renderer.scale = 4; // 22 screen px = 5.5 world px
      expect(renderer.findLayerAtPoint({ x: 150, y: 94 }, false, null, 'touch')).toBeNull();
      expect(renderer.findLayerAtPoint({ x: 150, y: 95 }, false, null, 'touch')).toBe(layer);
    });
  });

  // --- TUX-024 Direct tool pick + locked-layer rule ---

  describe('Direct tool pick (findLayerAtPointPrecise) is touch aware', () => {
    const line = (id, y, o = {}) => makeLayer(id, [{ x: 100, y }, { x: 200, y }], o);

    test('a touch tap 15-20 px from a stroke selects it; mouse keeps 1.5 world units', () => {
      const layer = line('h', 100);
      const renderer = makeRenderer([layer]);
      [15, 20].forEach((off) => {
        expect(renderer.findLayerAtPointPrecise({ x: 150, y: 100 - off }, 'touch')).toBe(layer);
      });
      expect(renderer.findLayerAtPointPrecise({ x: 150, y: 85 }, 'mouse')).toBeNull();
      expect(renderer.findLayerAtPointPrecise({ x: 150, y: 85 })).toBeNull();
      expect(renderer.findLayerAtPointPrecise({ x: 150, y: 98.7 }, 'mouse')).toBe(layer);
      expect(renderer.findLayerAtPointPrecise({ x: 150, y: 97.5 }, 'mouse')).toBeNull();
      expect(renderer.findLayerAtPointPrecise({ x: 150, y: 70 }, 'touch')).toBeNull();
    });

    test('the touch reach is screen space: zoomed in the world radius shrinks', () => {
      const renderer = makeRenderer([line('h', 100)]);
      renderer.scale = 4; // 22 px = 5.5 world
      expect(renderer.findLayerAtPointPrecise({ x: 150, y: 94 }, 'touch')).toBeNull();
      expect(renderer.findLayerAtPointPrecise({ x: 150, y: 95 }, 'touch')).not.toBeNull();
    });

    test('nearest wins, whatever the layer order', () => {
      const near = line('near', 108);
      const far = line('far', 118);
      [[near, far], [far, near]].forEach((order) => {
        const renderer = makeRenderer(order);
        expect(renderer.findLayerAtPointPrecise({ x: 150, y: 100 }, 'touch')).toBe(near);
      });
    });
  });

  describe('a locked layer under the finger blocks the wide touch pick', () => {
    const line = (id, y, o = {}) => makeLayer(id, [{ x: 100, y }, { x: 200, y }], o);
    const setup = (lockedY, freeY) => {
      const locked = line('locked', lockedY);
      const free = line('free', freeY);
      const renderer = makeRenderer([locked, free]);
      renderer.isLayerLocked = (id) => id === 'locked';
      return { renderer, locked, free };
    };

    test.each([['findLayerAtPoint'], ['findLayerAtPointPrecise']])('%s: a tap on or within mouse reach of locked geometry selects nothing', (fn) => {
      const { renderer } = setup(100, 112);
      const call = (y) => (fn === 'findLayerAtPoint'
        ? renderer.findLayerAtPoint({ x: 150, y }, false, null, 'touch')
        : renderer.findLayerAtPointPrecise({ x: 150, y }, 'touch'));
      expect(call(100)).toBeNull();
      expect(call(101)).toBeNull();
    });

    test.each([['findLayerAtPoint'], ['findLayerAtPointPrecise']])('%s: with no locked geometry under the finger the 22 px reach still applies', (fn) => {
      const { renderer, free } = setup(60, 112);
      const call = (y) => (fn === 'findLayerAtPoint'
        ? renderer.findLayerAtPoint({ x: 150, y }, false, null, 'touch')
        : renderer.findLayerAtPointPrecise({ x: 150, y }, 'touch'));
      expect(call(95)).toBe(free);
    });

    test('an unlocked stroke within the mouse reach still wins over a nearby locked one (mouse parity)', () => {
      const { renderer, free } = setup(100, 104);
      expect(renderer.findLayerAtPoint({ x: 150, y: 104 }, false, null, 'touch')).toBe(free);
    });

    test('a tap inside a closed locked shape selects nothing', () => {
      const box = [{ x: 100, y: 100 }, { x: 140, y: 100 }, { x: 140, y: 140 }, { x: 100, y: 140 }, { x: 100, y: 100 }];
      const locked = makeLayer('locked', box);
      const free = makeLayer('free', [{ x: 100, y: 150 }, { x: 200, y: 150 }]);
      const renderer = makeRenderer([locked, free]);
      renderer.isLayerLocked = (id) => id === 'locked';
      expect(renderer.findLayerAtPoint({ x: 120, y: 130 }, false, null, 'touch')).toBeNull();
      expect(renderer.findLayerAtPoint({ x: 120, y: 130 }, false, null, 'mouse')).toBeNull();
    });

    test('a mouse click is unchanged: a locked layer is skipped, an unlocked one 18 px away is not reached', () => {
      const { renderer } = setup(100, 118);
      expect(renderer.findLayerAtPoint({ x: 150, y: 100 }, false, null, 'mouse')).toBeNull();
    });
  });

  describe('findPathHitAtPoint (the Direct tool tap path) is touch aware and lock aware', () => {
    const line = (id, y) => makeLayer(id, [{ x: 100, y }, { x: 200, y }]);

    test('touch reaches 22 px, mouse and pen keep 2.5 px', () => {
      const layer = line('h', 100);
      const renderer = makeRenderer([layer]);
      expect(renderer.findPathHitAtPoint({ x: 150, y: 83 }, { pointerType: 'touch' })?.layer).toBe(layer);
      expect(renderer.findPathHitAtPoint({ x: 150, y: 83 }, { pointerType: 'mouse' })).toBeNull();
      expect(renderer.findPathHitAtPoint({ x: 150, y: 83 }, { pointerType: 'pen' })).toBeNull();
      expect(renderer.findPathHitAtPoint({ x: 150, y: 70 }, { pointerType: 'touch' })).toBeNull();
      expect(renderer.findPathHitAtPoint({ x: 150, y: 98 }, { pointerType: 'mouse' })?.layer).toBe(layer);
    });

    test('nearest wins whatever the layer order', () => {
      const near = line('near', 108);
      const far = line('far', 118);
      [[near, far], [far, near]].forEach((order) => {
        const renderer = makeRenderer(order);
        expect(renderer.findPathHitAtPoint({ x: 150, y: 100 }, { pointerType: 'touch' }).layer).toBe(near);
      });
    });

    test('locked geometry under the pointer selects nothing, touch and mouse', () => {
      const locked = line('locked', 100);
      const free = line('free', 112);
      const renderer = makeRenderer([free, locked]);
      renderer.isLayerLocked = (id) => id === 'locked';
      expect(renderer.findPathHitAtPoint({ x: 150, y: 100 }, { pointerType: 'touch' })).toBeNull();
      expect(renderer.findPathHitAtPoint({ x: 150, y: 100 }, { pointerType: 'mouse' })).toBeNull();
      // Away from the locked line the unlocked layer is reachable by finger.
      expect(renderer.findPathHitAtPoint({ x: 150, y: 125 }, { pointerType: 'touch' }).layer).toBe(free);
    });
  });
});
