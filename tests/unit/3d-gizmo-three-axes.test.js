/*
 * 3D rotation gizmo — three axes everywhere, no background disc, and a
 * non-red/green axis palette.
 *
 * Three user-facing guarantees:
 *   1. Every algorithm that shows the on-canvas 3D rotation helper exposes all
 *      THREE axis handles. Polyhedron and Raster-Plane historically had no
 *      `roll` param at all (their view hardcoded roll: 0), so their gizmo drew
 *      only the X and Y rings. Both now support Rotate Z end-to-end: gizmo
 *      ring, params.roll, and rotated output geometry.
 *   2. The gizmo paints no background disc behind the rings — it draws only
 *      rings, markers, and the roll knob directly over the artwork.
 *   3. The axis rings avoid red and green hues (both skins' tokens and the
 *      renderer fallbacks), so the gizmo doesn't clash with pen colors and
 *      stays legible for red/green color-blind users.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../..');

// Hue (0-360) of a #rrggbb color, or null when achromatic.
const hexToHue = (hex) => {
  const m = String(hex).trim().match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return null;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
};

const isRedHue = (h) => h !== null && (h < 20 || h >= 340);
const isGreenHue = (h) => h !== null && h >= 80 && h <= 160;

describe('3D rotation gizmo — three axes, no background, non-red/green palette', () => {
  let runtime;
  let Renderer;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
    Renderer = V.Renderer;
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
    renderer.showDragTooltip = () => {};
    renderer.hideDragTooltip = () => {};
    return renderer;
  };

  // Records every fill()/stroke() with the style, dash, and the arc/ellipse
  // primitives accumulated in the current path.
  const makeRecordingCtx = () => {
    const ops = [];
    let pathShapes = [];
    let dash = [];
    const ctx = {
      lineWidth: 1,
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineCap: 'butt',
      lineJoin: 'miter',
      save() {},
      restore() {},
      setLineDash(next) { dash = Array.isArray(next) ? next.slice() : []; },
      getLineDash() { return dash.slice(); },
      beginPath() { pathShapes = []; },
      arc(x, y, r) { pathShapes.push({ kind: 'arc', r }); },
      ellipse(x, y, rx, ry) { pathShapes.push({ kind: 'ellipse', rx, ry }); },
      moveTo() {},
      lineTo() {},
      fill() { ops.push({ op: 'fill', style: ctx.fillStyle, shapes: pathShapes.slice() }); },
      stroke() { ops.push({ op: 'stroke', style: ctx.strokeStyle, shapes: pathShapes.slice(), dash: dash.slice() }); },
    };
    return { ctx, ops };
  };

  const GIZMO_CASES = [
    ['spiralizer', { yaw: 0, pitch: 30, roll: 0 }],
    ['topoform', { yaw: 0, pitch: 30, roll: 0 }],
    ['terrain', { perspectiveMode: 'free-3d', yaw: 0, pitch: 30, roll: 0 }],
    ['polyhedron', { rotate: 0, tilt: 30 }],
    ['rasterPlane', { rotate: 0, tilt: 30 }],
  ];

  test('every algorithm with the gizmo exposes all three axis handles', () => {
    GIZMO_CASES.forEach(([type, params]) => {
      const layer = makeLayer(type, params);
      const renderer = makeRenderer(layer);
      const control = renderer.get3DRotationControl(layer, renderer.getSelectionBounds([layer]));
      expect(control).toBeTruthy();
      expect(control.yawMarker).toBeTruthy();
      expect(control.pitchMarker).toBeTruthy();
      expect(control.rollHandle).toBeTruthy();
    });
  });

  test.each([['polyhedron'], ['rasterPlane']])('%s roll-ring drag drives params.roll only', (type) => {
    const layer = makeLayer(type, { rotate: 0, tilt: 30, roll: 0 });
    const renderer = makeRenderer(layer);
    const bounds = renderer.getSelectionBounds([layer]);
    const control = renderer.get3DRotationControl(layer, bounds);
    expect(control.rollHandle).toBeTruthy();

    const start = renderer.worldToScreen(control.rollHandle.x, control.rollHandle.y);
    const hit = renderer.hit3DRotationControl(start.x, start.y, layer, bounds);
    expect(hit?.type).toBe('roll');

    const move = renderer.worldToScreen(control.center.x + control.ringRadius, control.center.y);
    renderer.begin3DRotationDrag(hit, { clientX: start.x, clientY: start.y });
    renderer.apply3DRotationDrag({ clientX: move.x, clientY: move.y });

    expect(layer.params.roll).toBeCloseTo(90);
    expect(layer.params.rotate).toBe(0);
    expect(layer.params.tilt).toBe(30);
    renderer.end3DRotationDrag();
  });

  test('defaults declare roll: 0 for polyhedron and rasterPlane', () => {
    expect(V.ALGO_DEFAULTS.polyhedron.roll).toBe(0);
    expect(V.ALGO_DEFAULTS.rasterPlane.roll).toBe(0);
  });

  const signature = (paths) => {
    let points = 0;
    let sum = 0;
    for (const p of paths) {
      points += p.length;
      for (const pt of p) sum += pt.x * 3 + pt.y * 7;
    }
    return `${paths.length}|${points}|${sum.toFixed(2)}`;
  };

  test('roll rotates polyhedron output geometry', () => {
    const base = JSON.parse(JSON.stringify(V.ALGO_DEFAULTS.polyhedron));
    delete base.label;
    delete base.is3d;
    delete base.preset;
    const gen = (roll) => V.AlgorithmRegistry.polyhedron.generate(
      { ...base, roll },
      new V.SeededRNG(42),
      new V.SimpleNoise(42),
      { width: 400, height: 400 },
    );
    expect(gen(0).length).toBeGreaterThan(0);
    expect(signature(gen(90))).not.toBe(signature(gen(0)));
  });

  test('roll rotates rasterPlane output geometry', () => {
    const gen = (roll) => V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'lines', rows: 10, sampleDetail: 24, amplitude: 20, artworkSize: 150, smoothing: 0, roll },
      null,
      new V.SimpleNoise(13),
      { width: 400, height: 400 },
    );
    expect(gen(0).length).toBeGreaterThan(0);
    expect(signature(gen(90))).not.toBe(signature(gen(0)));
  });

  test('gizmo draws three distinct rings and no background disc', () => {
    const layer = makeLayer('polyhedron', { rotate: 0, tilt: 30, roll: 0 });
    const renderer = makeRenderer(layer);
    const bounds = renderer.getSelectionBounds([layer]);
    const control = renderer.get3DRotationControl(layer, bounds);
    const { ctx, ops } = makeRecordingCtx();
    renderer.ctx = ctx;
    renderer.draw3DRotationControl(layer, bounds);

    // Two ellipse rings (X pitch + Y yaw) plus the outer roll ring arc.
    const ellipseRings = ops.filter((o) => o.op === 'stroke' && o.shapes.some((s) => s.kind === 'ellipse'));
    expect(ellipseRings.length).toBe(2);
    const rollRings = ops.filter((o) =>
      o.op === 'stroke' && o.shapes.some((s) => s.kind === 'arc' && Math.abs(s.r - control.ringRadius) < 0.5));
    expect(rollRings.length).toBeGreaterThanOrEqual(1);

    // The three ring colors are distinct and none reads red or green.
    const ringColors = new Set([...ellipseRings, ...rollRings].map((o) => o.style));
    expect(ringColors.size).toBe(3);
    ringColors.forEach((color) => {
      const hue = hexToHue(color);
      expect(hue).not.toBeNull();
      expect(isRedHue(hue)).toBe(false);
      expect(isGreenHue(hue)).toBe(false);
    });

    // No background disc: every filled arc is a small marker/knob, never a
    // pad-sized circle behind the rings (the old underlay was padRadius + 4).
    const filledArcRadii = ops
      .filter((o) => o.op === 'fill')
      .flatMap((o) => o.shapes.filter((s) => s.kind === 'arc').map((s) => s.r));
    filledArcRadii.forEach((r) => expect(r).toBeLessThan(10));
  });

  test('skin gizmo tokens avoid red and green in every skin', () => {
    const skinDir = path.join(ROOT, 'src/ui/skin');
    const skinFiles = fs.readdirSync(skinDir).filter((f) => f.endsWith('.css'));
    const withToken = skinFiles.filter((f) =>
      fs.readFileSync(path.join(skinDir, f), 'utf8').includes('--render-gizmo-x'));
    expect(withToken.length).toBeGreaterThanOrEqual(6);
    withToken.forEach((file) => {
      const css = fs.readFileSync(path.join(skinDir, file), 'utf8');
      const values = ['x', 'y', 'z'].map((axis) => {
        const m = css.match(new RegExp(`--render-gizmo-${axis}:\\s*(#[0-9a-fA-F]{6})`));
        expect(m, `${file} --render-gizmo-${axis}`).toBeTruthy();
        return m[1].toLowerCase();
      });
      expect(new Set(values).size).toBe(3);
      values.forEach((color) => {
        const hue = hexToHue(color);
        expect(hue, `${file} ${color}`).not.toBeNull();
        expect(isRedHue(hue), `${file} ${color} reads red`).toBe(false);
        expect(isGreenHue(hue), `${file} ${color} reads green`).toBe(false);
      });
    });
  });
});
