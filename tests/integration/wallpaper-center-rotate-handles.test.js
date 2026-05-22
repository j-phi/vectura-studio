const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Team Delta: on-canvas direct-manipulation handles for the WALLPAPER mirror —
// a draggable symmetry-center puck and a rotate ring, alongside the existing
// latticeA/latticeB tile-vector drag handles.
describe('Wallpaper mirror center puck + rotate ring handles', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function buildWallpaperGroup(engine, { Layer }, mirrorOverrides = {}) {
    const modLayer = new Layer('wp-mod', 'shape', 'Wallpaper Group');
    modLayer.isGroup = true;
    modLayer.containerRole = 'modifier';
    modLayer.groupType = 'modifier';
    modLayer.modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [{
        id: 'wp1',
        enabled: true,
        type: 'wallpaper',
        group: 'p4m',
        tileWidth: 60,
        tileHeight: 60,
        tileAngle: 90,
        rotation: 0,
        centerX: 0,
        centerY: 0,
        ...mirrorOverrides,
      }],
    };
    const child = new Layer('wp-child', 'shape', 'Child');
    child.parentId = modLayer.id;
    child.sourcePaths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];
    engine.layers.push(modLayer, child);
    engine.generate(child.id);
    engine.activeLayerId = modLayer.id;
    return { modLayer, child, mirror: modLayer.modifier.mirrors[0] };
  }

  function buildLineMirrorGroup(engine, { Layer }) {
    const modLayer = new Layer('ln-mod', 'shape', 'Line Mirror Group');
    modLayer.isGroup = true;
    modLayer.containerRole = 'modifier';
    modLayer.groupType = 'modifier';
    modLayer.modifier = {
      type: 'mirror',
      enabled: true,
      mirrors: [{ id: 'lx1', enabled: true, type: 'line', angle: 90, xShift: 0, yShift: 0, replacedSide: 'negative' }],
    };
    const child = new Layer('ln-child', 'shape', 'Child');
    child.parentId = modLayer.id;
    child.sourcePaths = [[{ x: 20, y: 50 }, { x: 80, y: 50 }]];
    engine.layers.push(modLayer, child);
    engine.generate(child.id);
    engine.activeLayerId = modLayer.id;
    return { modLayer };
  }

  async function setup(mirrorOverrides) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const built = buildWallpaperGroup(engine, { Layer }, mirrorOverrides);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    return { engine, renderer, Layer, ...built };
  }

  test('wallpaper guide exposes origin, canvasCenter, and a rotate ring', async () => {
    const { renderer } = await setup();
    const guides = renderer.getMirrorGuides();
    const wp = guides.find((g) => g.guideType === 'wallpaper');
    expect(wp).toBeTruthy();
    expect(wp.origin).toBeTruthy();
    expect(wp.canvasCenter).toBeTruthy();
    // With centerX/centerY = 0, origin equals canvas center.
    expect(wp.origin.x).toBeCloseTo(wp.canvasCenter.x);
    expect(wp.origin.y).toBeCloseTo(wp.canvasCenter.y);
    expect(wp.rotateRadius).toBeGreaterThan(0);
    expect(wp.rotateHandle).toBeTruthy();
  });

  test('hit-test near the center puck returns wallpaperCenter (not move)', async () => {
    const { renderer } = await setup();
    const wp = renderer.getMirrorGuides().find((g) => g.guideType === 'wallpaper');
    const hit = renderer.hitModifierGuide({ x: wp.origin.x, y: wp.origin.y });
    expect(hit).toBeTruthy();
    expect(hit.type).toBe('wallpaperCenter');
  });

  test('hit-test on the rotate handle returns wallpaperRotate', async () => {
    const { renderer } = await setup();
    const wp = renderer.getMirrorGuides().find((g) => g.guideType === 'wallpaper');
    const hit = renderer.hitModifierGuide({ x: wp.rotateHandle.x, y: wp.rotateHandle.y });
    expect(hit).toBeTruthy();
    expect(hit.type).toBe('wallpaperRotate');
  });

  test('hit-test on the latticeA endpoint still returns latticeA (regression)', async () => {
    const { renderer } = await setup();
    const wp = renderer.getMirrorGuides().find((g) => g.guideType === 'wallpaper');
    const p10 = { x: wp.origin.x + wp.latticeA.x, y: wp.origin.y + wp.latticeA.y };
    const hit = renderer.hitModifierGuide(p10);
    expect(hit.type).toBe('latticeA');
  });

  test('non-wallpaper (line) mirror exposes no wallpaper handles', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    buildLineMirrorGroup(engine, { Layer });
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    const guides = renderer.getMirrorGuides();
    expect(guides.some((g) => g.guideType === 'wallpaper')).toBe(false);
    // No hit should ever resolve to a wallpaper handle type for a line mirror.
    const lineGuide = guides.find((g) => g.guideType === 'line');
    expect(lineGuide).toBeTruthy();
    const probe = renderer.hitModifierGuide({ x: lineGuide.start.x, y: lineGuide.start.y });
    if (probe) expect(['wallpaperCenter', 'wallpaperRotate']).not.toContain(probe.type);
  });

  describe('wallpaperCenterFromWorld (pure drag math)', () => {
    test('inverts canvasCenter offset to mirror centerX/centerY', async () => {
      const { renderer } = await setup();
      const canvasCenter = { x: 200, y: 150 };
      const out = renderer.wallpaperCenterFromWorld({ x: 260, y: 120 }, canvasCenter, { shift: false, snapDist: 8 });
      expect(out.centerX).toBeCloseTo(60);
      expect(out.centerY).toBeCloseTo(-30);
    });

    test('snaps to canvas center when within proximity', async () => {
      const { renderer } = await setup();
      const canvasCenter = { x: 200, y: 150 };
      // 5px away → inside the 8px snap radius → snaps to (0,0).
      const out = renderer.wallpaperCenterFromWorld({ x: 203, y: 154 }, canvasCenter, { shift: false, snapDist: 8 });
      expect(out.centerX).toBe(0);
      expect(out.centerY).toBe(0);
    });

    test('shift forces snap to canvas center', async () => {
      const { renderer } = await setup();
      const canvasCenter = { x: 200, y: 150 };
      const out = renderer.wallpaperCenterFromWorld({ x: 300, y: 50 }, canvasCenter, { shift: true });
      expect(out.centerX).toBe(0);
      expect(out.centerY).toBe(0);
    });
  });

  describe('wallpaperRotationFromWorld (pure drag math)', () => {
    test('returns the angle from origin to pointer in 0–360 degrees', async () => {
      const { renderer } = await setup();
      const origin = { x: 100, y: 100 };
      expect(renderer.wallpaperRotationFromWorld({ x: 200, y: 100 }, origin, {})).toBeCloseTo(0);
      expect(renderer.wallpaperRotationFromWorld({ x: 100, y: 200 }, origin, {})).toBeCloseTo(90);
      // Pointer up-left → atan2 gives -135 → normalized to 225.
      expect(renderer.wallpaperRotationFromWorld({ x: 0, y: 0 }, origin, {})).toBeCloseTo(225);
    });

    test('shift snaps rotation to 15-degree increments', async () => {
      const { renderer } = await setup();
      const origin = { x: 0, y: 0 };
      // Pointer at ~20deg → snaps to 15.
      const p = { x: Math.cos(20 * Math.PI / 180), y: Math.sin(20 * Math.PI / 180) };
      const out = renderer.wallpaperRotationFromWorld(p, origin, { shift: true });
      expect(out % 15).toBeCloseTo(0);
      expect(out).toBeCloseTo(15);
    });
  });

  describe('drag wiring through pointer move', () => {
    function driveMove(renderer, world, { shift = false } = {}) {
      // Drive the same modifierDrag branch the latticeA/B drags use, without
      // synthesizing real DOM pointer events: stub the canvas rect + screenToWorld.
      renderer.ready = true;
      renderer.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 });
      renderer.screenToWorld = () => ({ x: world.x, y: world.y });
      renderer.move({ clientX: world.x, clientY: world.y, shiftKey: shift });
    }

    test('dragging the center puck updates mirror.centerX/centerY and refreshes geometry', async () => {
      const { renderer, engine, mirror } = await setup();
      let refreshed = false;
      renderer.onComputeDisplayGeometry = () => { refreshed = true; engine.computeAllDisplayGeometry(); };
      const wp = renderer.getMirrorGuides().find((g) => g.guideType === 'wallpaper');

      renderer.modifierDrag = {
        type: 'wallpaperCenter',
        guide: wp,
        startWorld: { x: wp.origin.x, y: wp.origin.y },
        startCenterX: 0,
        startCenterY: 0,
        startOrigin: { ...wp.origin },
      };
      driveMove(renderer, { x: wp.canvasCenter.x + 40, y: wp.canvasCenter.y - 25 });

      expect(mirror.centerX).toBeCloseTo(40);
      expect(mirror.centerY).toBeCloseTo(-25);
      expect(refreshed).toBe(true);
    });

    test('dragging the rotate handle updates mirror.rotation', async () => {
      const { renderer, engine, mirror } = await setup();
      renderer.onComputeDisplayGeometry = () => engine.computeAllDisplayGeometry();
      const wp = renderer.getMirrorGuides().find((g) => g.guideType === 'wallpaper');

      renderer.modifierDrag = {
        type: 'wallpaperRotate',
        guide: wp,
        startWorld: { x: wp.rotateHandle.x, y: wp.rotateHandle.y },
        startOrigin: { ...wp.origin },
        startRotation: 0,
      };
      // Drag straight down from origin → 90 degrees.
      driveMove(renderer, { x: wp.origin.x, y: wp.origin.y + 100 });

      expect(mirror.rotation).toBeCloseTo(90);
    });
  });
});
