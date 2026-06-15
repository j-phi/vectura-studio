const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer 3D rotation control', () => {
  let runtime;
  let Renderer;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    Renderer = runtime.window.Vectura.Renderer;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeLayer = (type, params = {}) => ({
    id: `${type}-1`,
    type,
    visible: true,
    isGroup: false,
    origin: { x: 100, y: 100 },
    params: {
      posX: 0,
      posY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      ...params,
    },
    paths: [[
      { x: 60, y: 60 },
      { x: 140, y: 60 },
      { x: 140, y: 140 },
      { x: 60, y: 140 },
    ]],
    strokeWidth: 0.5,
  });

  const makeRenderer = (layer) => {
    const calls = [];
    const engine = {
      layers: [layer],
      currentProfile: { width: 300, height: 300 },
      getBounds() {
        return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false };
      },
      generate(id, options) {
        calls.push({ id, options });
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.selectedLayerIds = new Set([layer.id]);
    renderer.selectedLayerId = layer.id;
    renderer.app = {
      pushHistory() {
        calls.push({ history: true });
      },
      ui: {
        buildControls() {
          calls.push({ buildControls: true });
        },
        updateFormula() {
          calls.push({ updateFormula: true });
        },
      },
    };
    renderer.draw = () => {};
    renderer.updateCursor = () => {};
    renderer.showDragTooltip = () => {};
    renderer.hideDragTooltip = () => {};
    return { renderer, calls };
  };

  test('only supported 3D algorithm layers expose a control', () => {
    ['spiralizer', 'polyhedron', 'topoform', 'rasterPlane'].forEach((type) => {
      const usesEuler = type === 'spiralizer' || type === 'topoform';
      const layer = makeLayer(type, usesEuler ? { yaw: 0, pitch: 30, roll: 0 } : { rotate: 0, tilt: 30 });
      const { renderer } = makeRenderer(layer);
      const bounds = renderer.getSelectionBounds([layer]);
      expect(renderer.get3DRotationControl(layer, bounds)).toBeTruthy();
    });

    const flat = makeLayer('spirograph', {});
    const { renderer } = makeRenderer(flat);
    expect(renderer.get3DRotationControl(flat, renderer.getSelectionBounds([flat]))).toBeNull();
  });

  test('orbit drag updates horizontal rotation and tilt with preview then full regeneration', () => {
    const layer = makeLayer('polyhedron', { rotate: 0, tilt: 30 });
    const { renderer, calls } = makeRenderer(layer);
    const bounds = renderer.getSelectionBounds([layer]);
    const control = renderer.get3DRotationControl(layer, bounds);
    const start = renderer.worldToScreen(control.center.x, control.center.y);
    const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);

    expect(hit.type).toBe('orbit');
    expect(renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y })).toBe(true);
    renderer.apply3DRotationDrag({ clientX: start.x + 40, clientY: start.y - 20 });

    expect(layer.params.rotate).toBeCloseTo(18);
    expect(layer.params.tilt).toBeCloseTo(39);
    expect(calls.filter((call) => call.history).length).toBe(1);
    expect(calls.some((call) => call.options?.preview === true)).toBe(true);

    renderer.end3DRotationDrag();

    const generateCalls = calls.filter((call) => call.id === layer.id);
    expect(generateCalls[generateCalls.length - 1].options).toBeUndefined();
    expect(calls.some((call) => call.buildControls)).toBe(true);
  });

  test('yaw and tilt markers can be dragged independently', () => {
    {
      const layer = makeLayer('polyhedron', { rotate: 0, tilt: 30 });
      const { renderer } = makeRenderer(layer);
      const bounds = renderer.getSelectionBounds([layer]);
      const control = renderer.get3DRotationControl(layer, bounds);
      const start = renderer.worldToScreen(control.yawMarker.x, control.yawMarker.y);
      const move = renderer.worldToScreen(control.center.x + control.yawRadiusX, control.center.y);
      const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);

      expect(hit.type).toBe('yaw');
      renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
      renderer.apply3DRotationDrag({ clientX: move.x, clientY: move.y });

      expect(layer.params.rotate).toBeCloseTo(90);
      expect(layer.params.tilt).toBe(30);
    }

    {
      const layer = makeLayer('polyhedron', { rotate: 0, tilt: 30 });
      const { renderer } = makeRenderer(layer);
      const bounds = renderer.getSelectionBounds([layer]);
      const control = renderer.get3DRotationControl(layer, bounds);
      const start = renderer.worldToScreen(control.pitchMarker.x, control.pitchMarker.y);
      const move = renderer.worldToScreen(control.pitchMarker.x, control.center.y - control.pitchTrackHeight / 2);
      const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);

      expect(hit.type).toBe('pitch');
      renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
      renderer.apply3DRotationDrag({ clientX: move.x, clientY: move.y });

      expect(layer.params.rotate).toBe(0);
      expect(layer.params.tilt).toBeCloseTo(89);
    }
  });

  test('topoform yaw/pitch/roll handles update euler params (not rotate/tilt)', () => {
    // Yaw handle drives params.yaw
    {
      const layer = makeLayer('topoform', { yaw: 0, pitch: 30, roll: 0 });
      const { renderer } = makeRenderer(layer);
      const bounds = renderer.getSelectionBounds([layer]);
      const control = renderer.get3DRotationControl(layer, bounds);
      const start = renderer.worldToScreen(control.yawMarker.x, control.yawMarker.y);
      const move = renderer.worldToScreen(control.center.x + control.yawRadiusX, control.center.y);
      const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);

      expect(hit.type).toBe('yaw');
      renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
      renderer.apply3DRotationDrag({ clientX: move.x, clientY: move.y });

      expect(layer.params.yaw).toBeCloseTo(90);
      expect(layer.params.pitch).toBe(30);
      expect(layer.params.rotate).toBeUndefined();
      expect(layer.params.tilt).toBeUndefined();
    }

    // Roll handle exists and drives params.roll
    {
      const layer = makeLayer('topoform', { yaw: 0, pitch: 30, roll: 0 });
      const { renderer } = makeRenderer(layer);
      const bounds = renderer.getSelectionBounds([layer]);
      const control = renderer.get3DRotationControl(layer, bounds);
      expect(control.rollHandle).toBeTruthy();
      const start = renderer.worldToScreen(control.rollHandle.x, control.rollHandle.y);
      const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);
      const move = renderer.worldToScreen(control.center.x + control.ringRadius, control.center.y);

      expect(hit.type).toBe('roll');
      renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
      renderer.apply3DRotationDrag({ clientX: move.x, clientY: move.y });

      expect(layer.params.roll).toBeCloseTo(90);
      expect(layer.params.yaw).toBe(0);
      expect(layer.params.pitch).toBe(30);
    }

    // Pitch handle can tip below the horizon (negative pitch), not clamp at 0
    {
      const layer = makeLayer('topoform', { yaw: 0, pitch: 30, roll: 0 });
      const { renderer } = makeRenderer(layer);
      const bounds = renderer.getSelectionBounds([layer]);
      const control = renderer.get3DRotationControl(layer, bounds);
      const start = renderer.worldToScreen(control.pitchMarker.x, control.pitchMarker.y);
      const move = renderer.worldToScreen(control.pitchMarker.x, control.center.y + control.pitchTrackHeight / 2);
      const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);

      expect(hit.type).toBe('pitch');
      renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
      renderer.apply3DRotationDrag({ clientX: move.x, clientY: move.y });

      expect(layer.params.pitch).toBeCloseTo(-90);
    }
  });

  test('terrain exposes the 3D rotation control only in free-3d mode', () => {
    const free = makeLayer('terrain', { perspectiveMode: 'free-3d', yaw: -25, pitch: 58, roll: 0 });
    const { renderer: r1 } = makeRenderer(free);
    expect(r1.get3DRotationControl(free, r1.getSelectionBounds([free]))).toBeTruthy();

    ['one-point', 'orthographic', 'two-point', 'isometric'].forEach((mode) => {
      const legacy = makeLayer('terrain', { perspectiveMode: mode });
      const { renderer } = makeRenderer(legacy);
      expect(renderer.get3DRotationControl(legacy, renderer.getSelectionBounds([legacy]))).toBeNull();
    });
  });

  test('terrain free-3d yaw/roll handles update yaw/roll independently', () => {
    const layer = makeLayer('terrain', { perspectiveMode: 'free-3d', yaw: 0, pitch: 30, roll: 0 });
    const { renderer } = makeRenderer(layer);
    const bounds = renderer.getSelectionBounds([layer]);
    const control = renderer.get3DRotationControl(layer, bounds);

    const yStart = renderer.worldToScreen(control.yawMarker.x, control.yawMarker.y);
    const yMove = renderer.worldToScreen(control.center.x + control.yawRadiusX, control.center.y);
    const yHit = renderer.hit3DRotationControl(yStart.x, yStart.y, layer, bounds);
    expect(yHit.type).toBe('yaw');
    renderer.begin3DRotationDrag(yHit, { clientX: yStart.x, clientY: yStart.y });
    renderer.apply3DRotationDrag({ clientX: yMove.x, clientY: yMove.y });
    expect(layer.params.yaw).toBeCloseTo(90);

    const rStart = renderer.worldToScreen(control.rollHandle.x, control.rollHandle.y);
    const rHit = renderer.hit3DRotationControl(rStart.x, rStart.y, layer, bounds);
    expect(rHit.type).toBe('roll');
    const rMove = renderer.worldToScreen(control.center.x + control.ringRadius, control.center.y);
    renderer.begin3DRotationDrag(rHit, { clientX: rStart.x, clientY: rStart.y });
    renderer.apply3DRotationDrag({ clientX: rMove.x, clientY: rMove.y });
    expect(layer.params.roll).toBeCloseTo(90);
  });

  test('spiralizer roll handle updates roll independently', () => {
    const layer = makeLayer('spiralizer', { yaw: 0, pitch: 30, roll: 0 });
    const { renderer } = makeRenderer(layer);
    const bounds = renderer.getSelectionBounds([layer]);
    const control = renderer.get3DRotationControl(layer, bounds);
    const start = renderer.worldToScreen(control.rollHandle.x, control.rollHandle.y);
    const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);
    const move = renderer.worldToScreen(control.center.x + control.ringRadius, control.center.y);

    expect(hit.type).toBe('roll');
    renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
    renderer.apply3DRotationDrag({ clientX: move.x, clientY: move.y });

    expect(layer.params.roll).toBeCloseTo(90);
    expect(layer.params.yaw).toBe(0);
    expect(layer.params.pitch).toBe(30);
  });
});
