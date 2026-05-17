/**
 * RGR: Group resize and selection box behavior.
 * When grouped layers are selected (selectedLayerIds.size > 1),
 * resize corner handles must be hittable — same as single-layer selection.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer — group resize handles', () => {
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
    params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    strokeWidth: 0.5,
    ...overrides,
  });

  test('hitHandle returns a corner handle for a grouped (multi-layer) selection', () => {
    // Two non-overlapping layers: layer A spans x 50–100, y 50–100
    //                              layer B spans x 150–200, y 150–200
    // Combined AABB: nw=(50,50), ne=(200,50), se=(200,200), sw=(50,200)
    const layerA = makeLayer('a', [
      { x: 50, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 50, y: 100 },
    ]);
    const layerB = makeLayer('b', [
      { x: 150, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 200 }, { x: 150, y: 200 },
    ]);

    const renderer = makeRenderer([layerA, layerB]);
    renderer.selectedLayerIds = new Set(['a', 'b']);
    renderer.selectedLayerId = 'a';

    const bounds = renderer.getSelectionBounds([layerA, layerB]);
    expect(bounds).not.toBeNull();

    // The se corner in world space is at (200, 200). worldToScreen with scale=1, offset=0 → screen (200,200).
    // hitHandle receives screen coords.
    const se = bounds.corners.se;
    const handle = renderer.hitHandle(se.x, se.y, bounds);
    expect(handle).toBe('se');
  });

  test('hitHandle returns a corner handle when only one layer is selected (baseline)', () => {
    const layer = makeLayer('single', [
      { x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 },
    ]);
    const renderer = makeRenderer([layer]);
    renderer.selectedLayerIds = new Set(['single']);
    renderer.selectedLayerId = 'single';

    const bounds = renderer.getSelectionBounds([layer]);
    const se = bounds.corners.se;
    const handle = renderer.hitHandle(se.x, se.y, bounds);
    expect(handle).toBe('se');
  });

  test('getSelectionBounds for grouped layers is tight (no padding) — AABB exactly covers content', () => {
    const layerA = makeLayer('a', [
      { x: 50, y: 50 }, { x: 100, y: 100 },
    ]);
    const layerB = makeLayer('b', [
      { x: 150, y: 150 }, { x: 200, y: 200 },
    ]);

    const renderer = makeRenderer([layerA, layerB]);
    const bounds = renderer.getSelectionBounds([layerA, layerB]);
    expect(bounds).not.toBeNull();

    // The AABB corners should exactly match the extremes of the content
    expect(bounds.corners.nw.x).toBeCloseTo(50);
    expect(bounds.corners.nw.y).toBeCloseTo(50);
    expect(bounds.corners.se.x).toBeCloseTo(200);
    expect(bounds.corners.se.y).toBeCloseTo(200);
  });

  test('hitHandle returns rotate-se when screen point is just outside the SE corner (past resize radius, outside box)', () => {
    const layer = makeLayer('single', [
      { x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 },
    ]);
    const renderer = makeRenderer([layer]);
    renderer.selectedLayerIds = new Set(['single']);
    renderer.selectedLayerId = 'single';

    const bounds = renderer.getSelectionBounds([layer]);
    const se = bounds.corners.se; // (150,150) in world = screen at scale=1,offset=0
    // +10,+10 → dist ≈ 14.1 px: just past RESIZE_R (10), within ROTATE_R (28), and outside the OBB
    const handle = renderer.hitHandle(se.x + 10, se.y + 10, bounds);
    expect(handle).toBe('rotate-se');
  });

  test('hitHandle returns null when screen point is beyond the rotate band', () => {
    const layer = makeLayer('single', [
      { x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 },
    ]);
    const renderer = makeRenderer([layer]);
    renderer.selectedLayerIds = new Set(['single']);
    renderer.selectedLayerId = 'single';

    const bounds = renderer.getSelectionBounds([layer]);
    const se = bounds.corners.se;
    // 30px straight out: dist=30 > ROTATE_R (28)
    const handle = renderer.hitHandle(se.x + 30, se.y, bounds);
    expect(handle).toBeNull();
  });

  test('hitHandle does NOT return rotate-* when within rotate radius but INSIDE the bounding box', () => {
    const layer = makeLayer('single', [
      { x: 50, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 150 }, { x: 50, y: 150 },
    ]);
    const renderer = makeRenderer([layer]);
    renderer.selectedLayerIds = new Set(['single']);
    renderer.selectedLayerId = 'single';

    const bounds = renderer.getSelectionBounds([layer]);
    const se = bounds.corners.se; // (150,150)
    // (135,135) is INSIDE the box and ~21.2px from SE corner → would be in rotate band radially,
    // but the outside-OBB gate must suppress rotation.
    const handle = renderer.hitHandle(se.x - 15, se.y - 15, bounds);
    expect(handle).toBeNull();
  });

  test('applyRotationToBounds rotates corners correctly: 90° on axis-aligned 100×100 box centered at origin', () => {
    const renderer = makeRenderer([]);
    const bounds = {
      minX: -50, minY: -50, maxX: 50, maxY: 50,
      rotation: 0,
      origin: { x: 0, y: 0 },
      center: { x: 0, y: 0 },
      corners: {
        nw: { x: -50, y: -50 },
        ne: { x:  50, y: -50 },
        se: { x:  50, y:  50 },
        sw: { x: -50, y:  50 },
      },
    };
    const rotated = renderer.applyRotationToBounds(bounds, 90);
    // 90° CW: (x,y) → (y,-x) in standard math, but rotation in code is standard trig (CCW positive).
    // applyRotationToBounds uses cos(90°)=0, sin(90°)=1:
    //   new_x = ox + dx*cos - dy*sin = 0 + dx*0 - dy*1 = -dy
    //   new_y = oy + dx*sin + dy*cos = 0 + dx*1 + dy*0 = dx
    // NE was (50,-50): new = (-(-50), 50) = (50, 50) → becomes SE
    expect(rotated.corners.ne.x).toBeCloseTo(50);
    expect(rotated.corners.ne.y).toBeCloseTo(50);
    // NW was (-50,-50): new = (50, -50) → becomes NE
    expect(rotated.corners.nw.x).toBeCloseTo(50);
    expect(rotated.corners.nw.y).toBeCloseTo(-50);
    // rotation field should be π/2 radians
    expect(rotated.rotation).toBeCloseTo(Math.PI / 2);
  });
});
