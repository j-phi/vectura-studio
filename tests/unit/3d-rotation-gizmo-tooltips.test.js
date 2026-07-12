/*
 * The on-canvas 3D rotation gizmo's drag tooltips speak X/Y/Z, matching the
 * relabeled Rotate X/Y/Z sliders (X = pitch/tilt, Y = yaw/rotate, Z = roll).
 * Same harness as renderer-3d-rotation-control.test.js.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('3D rotation gizmo tooltips use X/Y/Z', () => {
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
    params: { posX: 0, posY: 0, rotation: 0, scaleX: 1, scaleY: 1, ...params },
    paths: [[
      { x: 60, y: 60 },
      { x: 140, y: 60 },
      { x: 140, y: 140 },
      { x: 60, y: 140 },
    ]],
    strokeWidth: 0.5,
  });

  const makeRenderer = (layer) => {
    const tooltips = [];
    const engine = {
      layers: [layer],
      currentProfile: { width: 300, height: 300 },
      getBounds() {
        return { width: 300, height: 300, m: 0, dW: 300, dH: 300, truncate: false };
      },
      generate() {},
    };
    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.selectedLayerIds = new Set([layer.id]);
    renderer.selectedLayerId = layer.id;
    renderer.app = { pushHistory() {}, ui: { buildControls() {}, updateFormula() {} } };
    renderer.draw = () => {};
    renderer.updateCursor = () => {};
    renderer.showDragTooltip = (text) => tooltips.push(text);
    renderer.hideDragTooltip = () => {};
    return { renderer, tooltips };
  };

  const dragMarker = (type, params, pickMarker) => {
    const layer = makeLayer(type, params);
    const { renderer, tooltips } = makeRenderer(layer);
    const bounds = renderer.getSelectionBounds([layer]);
    const control = renderer.get3DRotationControl(layer, bounds);
    const { from, to } = pickMarker(renderer, control);
    const hit = renderer.hit3DRotationControl(from.x, from.y, layer, bounds);
    expect(hit).toBeTruthy();
    renderer.begin3DRotationDrag(hit, { clientX: from.x, clientY: from.y });
    renderer.apply3DRotationDrag({ clientX: to.x, clientY: to.y });
    renderer.end3DRotationDrag();
    return tooltips;
  };

  test('yaw-handle drag reports Y, pitch-handle drag reports X, roll drag reports Z', () => {
    const yawTips = dragMarker('topoform', { yaw: 0, pitch: 30, roll: 0 }, (r, c) => ({
      from: r.worldToScreen(c.yawMarker.x, c.yawMarker.y),
      to: r.worldToScreen(c.center.x + c.yawRadiusX, c.center.y),
    }));
    expect(yawTips.length).toBeGreaterThan(0);
    expect(yawTips[yawTips.length - 1]).toMatch(/\bY -?\d+°/);
    expect(yawTips.join(' ')).not.toMatch(/yaw|pitch|roll|tilt|rot\b/i);

    const pitchTips = dragMarker('topoform', { yaw: 0, pitch: 30, roll: 0 }, (r, c) => ({
      from: r.worldToScreen(c.pitchMarker.x, c.pitchMarker.y),
      to: r.worldToScreen(c.pitchMarker.x, c.center.y - c.pitchTrackHeight / 2),
    }));
    expect(pitchTips[pitchTips.length - 1]).toMatch(/\bX -?\d+°/);

    const rollTips = dragMarker('topoform', { yaw: 0, pitch: 30, roll: 0 }, (r, c) => ({
      from: r.worldToScreen(c.rollHandle.x, c.rollHandle.y),
      to: r.worldToScreen(c.center.x + c.ringRadius, c.center.y),
    }));
    expect(rollTips[rollTips.length - 1]).toMatch(/\bZ -?\d+°/);
  });

  test('rotate/tilt algorithms (polyhedron) get the same X/Y tooltip language', () => {
    const orbitTips = dragMarker('polyhedron', { rotate: 0, tilt: 30 }, (r, c) => {
      const from = r.worldToScreen(c.center.x, c.center.y);
      return { from, to: { x: from.x + 40, y: from.y - 20 } };
    });
    const last = orbitTips[orbitTips.length - 1];
    expect(last).toMatch(/\bX -?\d+°/);
    expect(last).toMatch(/\bY -?\d+°/);
    expect(orbitTips.join(' ')).not.toMatch(/yaw|pitch|tilt|rot\b/i);
  });
});
