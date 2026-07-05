/**
 * Visual baselines (Lane A) for canvas-overlay interaction states that cannot
 * be captured as SVG: the 8-handle selection box, the crossing smart-guides
 * state, and the mid-drag dX/dY measurement chip. jsdom has no real 2D
 * context, so we snapshot the deterministic overlay *geometry / text* the
 * renderer produces (handle points, object-guide lines + labels, chip string)
 * as a stable serialization compared against a committed baseline — the same
 * write-on-update pattern as svg-baseline.test.js.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

const UPDATE_BASELINES = process.env.VECTURA_UPDATE_BASELINES === '1';
const BASELINE_DIR = path.resolve(__dirname, '../baselines/overlays');

const round = (n) => Math.round(n * 1000) / 1000;

const compare = (id, actual) => {
  const file = path.join(BASELINE_DIR, `${id}.json`);
  const serialized = `${JSON.stringify(actual, null, 2)}\n`;
  if (UPDATE_BASELINES) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.writeFileSync(file, serialized, 'utf8');
    expect(fs.existsSync(file)).toBe(true);
    return;
  }
  expect(fs.existsSync(file)).toBe(true);
  expect(serialized).toBe(fs.readFileSync(file, 'utf8'));
};

describe('Renderer overlay visual baselines', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const rect = (x0, y0, x1, y1) => [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
  ];

  async function makeScene() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    injectSmartGuidesConfig(runtime);
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    SETTINGS.documentUnits = 'metric';
    SETTINGS.showGuides = true;
    SETTINGS.snapGuides = true;
    SETTINGS.gridSnapEnabled = false;
    const engine = new VectorEngine();
    engine.layers = [];
    const a = new Layer('ov-a', 'shape', 'A');
    a.sourcePaths = [rect(40, 40, 80, 80)];
    const b = new Layer('ov-b', 'shape', 'B');
    b.sourcePaths = [rect(130, 44, 170, 84)];
    engine.layers.push(a, b);
    engine.generate(a.id);
    engine.generate(b.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([a.id], a.id);
    return { renderer, engine, a, b };
  }

  test('8-handle selection box', async () => {
    const { renderer, a } = await makeScene();
    const bounds = renderer.getSelectionBounds([a]);
    const handles = renderer.getHandlePoints(bounds).map((h) => ({
      key: h.key, x: round(h.x), y: round(h.y),
    }));
    compare('eight-handle-box', { handles });
  });

  test('crossing smart guides (center-cross) state', async () => {
    const { renderer } = await makeScene();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 149, clientY: 63, buttons: 1 });
    const guides = renderer.guides || {};
    const object = (guides.object || []).map((g) => ({
      axis: g.axis, label: g.label,
      x1: round(g.x1), y1: round(g.y1), x2: round(g.x2), y2: round(g.y2),
    }));
    const snap = { dx: round(renderer.tempTransform.dx), dy: round(renderer.tempTransform.dy) };
    renderer.up({});
    compare('crossing-smart-guides', { object, snap });
  });

  test('mid-drag dX/dY chip', async () => {
    const { renderer } = await makeScene();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 95, clientY: 40, buttons: 1 });
    const chip = renderer.lastTooltipText;
    renderer.up({});
    compare('mid-drag-delta-chip', { chip });
  });
});
