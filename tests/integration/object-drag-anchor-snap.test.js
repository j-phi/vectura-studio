/**
 * SG-4 (Illustrator tools parity, Phase 1 Lane A) — VERIFY-FIRST probe result:
 * object move-drags did NOT snap to other paths' anchors/endpoints (the
 * pre-existing endpoint/anchor snap at renderer.js:2671+ serves pen/direct
 * editing only; computeSnap knew only canvas-center + equal-size). This test
 * covers the SG-1 candidate-set extension: anchor points of nearby paths
 * participate in object-drag snapping, labeled per SG-2.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

describe('SG-4: object move-drags snap to other paths anchors/endpoints', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    injectSmartGuidesConfig(runtime);
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const a = new Layer('an-a', 'shape', 'A');
    a.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    engine.layers.push(a);
    engine.generate(a.id);

    // Open diagonal path — endpoints at (150, 130) and (190, 190).
    const open = new Layer('an-open', 'shape', 'Open');
    const path = [{ x: 150, y: 130 }, { x: 170, y: 160 }, { x: 190, y: 190 }];
    path.meta = { kind: 'poly', closed: false };
    open.sourcePaths = [path];
    engine.layers.push(open);
    engine.generate(open.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([a.id], a.id);
    SETTINGS.showGuides = true;
    SETTINGS.snapGuides = true;
    SETTINGS.gridSnapEnabled = false;
    return { renderer, engine, a };
  }

  test('dragged center snaps to an open-path endpoint with the endpoint label', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    // Raw center x → 147.5; endpoint x = 150 is 2.5 away (within 6px tol).
    // Y stays far from the open path's values so only x snaps.
    renderer.move({ clientX: 147.5, clientY: 60, buttons: 1 });

    expect(renderer.tempTransform.dx).toBeCloseTo(90, 4);
    const objectGuides = (renderer.guides && renderer.guides.object) || [];
    const xGuide = objectGuides.find((g) => g.axis === 'x');
    expect(xGuide).toBeTruthy();
    expect(xGuide.x1).toBeCloseTo(150, 4);
    expect(xGuide.label).toBe('endpoint');
    renderer.up({});
  });
});
