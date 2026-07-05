/**
 * SG-1 (Illustrator tools parity, Phase 1 Lane A): object-to-object alignment
 * smart guides, extending the existing computeGuides/computeSnap subsystem
 * (never a second guide system).
 *  - dragging near another object's edge/center snaps live (config tolerance);
 *  - full-length guide lines are reported via the renderer.guides.object hook;
 *  - a center-cross match shows both axes simultaneously (labeled midpoint);
 *  - grid snap and object snap compose — nearest wins;
 *  - everything stays behind SETTINGS.showGuides/snapGuides;
 *  - candidate bounds are cached per drag session (perf), with a config
 *    threshold limiting candidates to the N nearest layers.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

describe('SG-1: object-to-object alignment guides + snap', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const rectPath = (x0, y0, x1, y1) => [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
  ];

  async function setup({ candidates } = {}) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    injectSmartGuidesConfig(runtime);
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    // Dragged square A: 40..80 (center 60,60), width/height 40.
    const a = new Layer('sg-a', 'shape', 'A');
    a.sourcePaths = [rectPath(40, 40, 80, 80)];
    engine.layers.push(a);
    engine.generate(a.id);

    (candidates || [{ id: 'sg-b', rect: [130, 44, 170, 84] }]).forEach((spec) => {
      const layer = new Layer(spec.id, 'shape', spec.id);
      layer.sourcePaths = [spec.path ? spec.path : rectPath(...spec.rect)];
      engine.layers.push(layer);
      engine.generate(layer.id);
    });

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([a.id], a.id);
    SETTINGS.showGuides = true;
    SETTINGS.snapGuides = true;
    SETTINGS.gridSnapEnabled = false;
    return { renderer, engine, a, SETTINGS };
  }

  const centerOf = (renderer, layer) => renderer.getSelectionBounds([layer]).center;

  test('drag near another layer center-Y snaps live and reports a labeled guide', async () => {
    // B: 130..170 x, 44..84 y → center (150, 64).
    const { renderer, a } = await setup();

    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    // Raw dy = +3.5 → A center-y 63.5, within 6px of B center-y 64 → snap to 64.
    renderer.move({ clientX: 60, clientY: 63.5, buttons: 1 });

    expect(renderer.tempTransform).toBeTruthy();
    expect(renderer.tempTransform.dy).toBeCloseTo(4, 4);
    expect(renderer.guides).toBeTruthy();
    const objectGuides = renderer.guides.object || [];
    const yGuide = objectGuides.find((g) => g.axis === 'y');
    expect(yGuide).toBeTruthy();
    expect(yGuide.y1).toBeCloseTo(64, 4);
    expect(yGuide.label).toBe('midpoint');
    // Full-length: the guide spans both objects (A snapped 44..84, B 44..84)
    // plus overhang on each side.
    expect(yGuide.x1).toBeLessThan(40);
    expect(yGuide.x2).toBeGreaterThan(170);

    renderer.up({});
    expect(centerOf(renderer, a).y).toBeCloseTo(64, 3);
  });

  test('center-cross match shows both axes simultaneously', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    // Move A center to (149, 63) — within tolerance of B center (150, 64) on both axes.
    renderer.move({ clientX: 149, clientY: 63, buttons: 1 });

    const objectGuides = (renderer.guides && renderer.guides.object) || [];
    const xGuide = objectGuides.find((g) => g.axis === 'x');
    const yGuide = objectGuides.find((g) => g.axis === 'y');
    expect(xGuide).toBeTruthy();
    expect(yGuide).toBeTruthy();
    expect(renderer.tempTransform.dx).toBeCloseTo(90, 4);
    expect(renderer.tempTransform.dy).toBeCloseTo(4, 4);
    renderer.up({});
  });

  test('edge-to-edge alignment snaps (dragged left edge to candidate left edge)', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    // Raw dx = +88 → A minX = 128, within 6 of B minX = 130 (A center 148 is
    // 2mm from B center 150 too — center has priority on equal diff, but here
    // edge diff (2) equals center diff (2); either snap lands dx = 90).
    renderer.move({ clientX: 148, clientY: 20, buttons: 1 });
    expect(renderer.tempTransform.dx).toBeCloseTo(90, 4);
    const objectGuides = (renderer.guides && renderer.guides.object) || [];
    expect(objectGuides.find((g) => g.axis === 'x')).toBeTruthy();
    renderer.up({});
  });

  test('snapGuides=false disables object snap; showGuides=false hides guides', async () => {
    const { renderer, SETTINGS } = await setup();
    SETTINGS.snapGuides = false;
    SETTINGS.showGuides = false;
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 60, clientY: 63.5, buttons: 1 });
    expect(renderer.tempTransform.dy).toBeCloseTo(3.5, 4);
    expect(renderer.guides).toBeNull();
    renderer.up({});
  });

  test('meta key suppresses object snapping during the drag', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 60, clientY: 63.5, buttons: 1, metaKey: true });
    expect(renderer.tempTransform.dy).toBeCloseTo(3.5, 4);
    renderer.up({});
  });

  test('grid snap and object snap compose — nearest wins', async () => {
    const { renderer, SETTINGS } = await setup({
      // Candidate center-y at 64 (2.5 away from the raw drop below); grid is nearer.
      candidates: [{ id: 'sg-b', rect: [130, 44, 170, 84] }],
    });
    SETTINGS.gridSnapEnabled = true;
    SETTINGS.gridType = 'cartesian';
    SETTINGS.gridSize = 10;
    SETTINGS.gridSnapSensitivity = 50;

    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    // Raw dy = +1.5 → A minY 41.5 / midY 61.5. Grid line at 40 (diff -1.5 on
    // minY); object center 64 is 2.5 away from midY → grid wins.
    renderer.move({ clientX: 60, clientY: 61.5, buttons: 1 });
    expect(renderer.tempTransform.dy).toBeCloseTo(0, 4);
    renderer.up({});
  });

  test('candidate bounds are cached per drag session and cleared on drop', async () => {
    const { renderer, engine } = await setup();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 61, clientY: 60, buttons: 1 });
    const cache = renderer._guideCandidates;
    expect(cache).toBeTruthy();
    // Mutate the candidate layer mid-drag — the cache must be reused untouched.
    engine.layers.find((l) => l.id === 'sg-b').visible = false;
    renderer.move({ clientX: 62, clientY: 60, buttons: 1 });
    expect(renderer._guideCandidates).toBe(cache);
    renderer.up({});
    expect(renderer._guideCandidates).toBeNull();
  });

  test('candidate set is limited to the N nearest layers above the config threshold', async () => {
    const many = [];
    for (let i = 0; i < 45; i++) {
      const x = 100 + (i % 9) * 30;
      const y = 100 + Math.floor(i / 9) * 30;
      many.push({ id: `cand-${i}`, rect: [x, y, x + 10, y + 10] });
    }
    const { renderer, a } = await setup({ candidates: many });
    const cfg = runtime.window.Vectura.SMART_GUIDES;
    renderer.startBounds = renderer.getSelectionBounds([a]);
    const cache = renderer._ensureGuideCandidates([a]);
    expect(cache.boxes.length).toBe(cfg.nearestCandidateCount);
  });
});
