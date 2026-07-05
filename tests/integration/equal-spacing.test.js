/**
 * SG-3 (Illustrator tools parity, Phase 1 Lane A) — OPTIONAL, built on SG-1.
 * WHILE a dragged selection sits so the gap to the neighbor above and below
 * (or left/right) is equal within tolerance, the renderer snaps to the
 * equal-spacing position and reports two matching distance chips + a
 * connecting magenta guide (renderer._spacingHints hook).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

describe('SG-3: equal-spacing hint chips + snap', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const rect = (x0, y0, x1, y1) => [
    { x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 },
  ];

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    injectSmartGuidesConfig(runtime);
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    SETTINGS.documentUnits = 'metric';
    SETTINGS.showGuides = true;
    SETTINGS.snapGuides = true;
    SETTINGS.gridSnapEnabled = false;
    const engine = new VectorEngine();
    engine.layers = [];
    // Top and bottom fixed squares, same x-range; A dragged between them.
    const top = new Layer('sp-top', 'shape', 'Top');
    top.sourcePaths = [rect(40, 20, 80, 40)];
    const bottom = new Layer('sp-bottom', 'shape', 'Bottom');
    bottom.sourcePaths = [rect(40, 160, 80, 180)];
    const a = new Layer('sp-a', 'shape', 'A');
    a.sourcePaths = [rect(40, 70, 80, 110)]; // 40 tall, center (60,90)
    engine.layers.push(top, bottom, a);
    [top, bottom, a].forEach((l) => engine.generate(l.id));
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([a.id], a.id);
    return { renderer, engine, a };
  }

  test('dragging the middle object near equal vertical spacing snaps and reports two chips', async () => {
    const { renderer, a } = await setup();
    renderer.down({ clientX: 60, clientY: 90, preventDefault() {} });
    // Move so A minY ≈ 78 (gapAbove 38, gapBelow 42, diff 4 < tol 6) →
    // equalize to gaps of 40 each (dy 8 raw + 2 equalize = 10).
    renderer.move({ clientX: 60, clientY: 98, buttons: 1 });

    expect(renderer._spacingHints).toBeTruthy();
    expect(renderer._spacingHints.axis).toBe('y');
    expect(renderer._spacingHints.gap).toBeCloseTo(40, 3);
    expect(renderer._spacingHints.chips).toHaveLength(2);
    renderer._spacingHints.chips.forEach((c) => expect(c.text).toContain('40'));
    expect(renderer.tempTransform.dy).toBeCloseTo(10, 3);

    renderer.up({});
    // Cleared on drop.
    expect(renderer._spacingHints).toBeNull();
    // World-space top edge lands at y=80 (gaps of 40 above and below).
    const b = renderer.getSelectionBounds([a]);
    expect(b.corners.nw.y).toBeCloseTo(80, 2);
  });

  test('no equal-spacing hint when neighbors are absent on that axis', async () => {
    const { renderer, engine } = await setup();
    // Remove the bottom neighbor → no pair to equalize.
    engine.removeLayer('sp-bottom');
    renderer.down({ clientX: 60, clientY: 90, preventDefault() {} });
    renderer.move({ clientX: 60, clientY: 98, buttons: 1 });
    expect(renderer._spacingHints).toBeNull();
    renderer.up({});
  });

  test('drawSpacingHints strokes the connecting guide (not a no-op)', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 60, clientY: 90, preventDefault() {} });
    renderer.move({ clientX: 60, clientY: 98, buttons: 1 });
    expect(renderer._spacingHints).toBeTruthy();
    let strokes = 0;
    const realStroke = renderer.ctx.stroke.bind(renderer.ctx);
    renderer.ctx.stroke = () => { strokes += 1; realStroke(); };
    renderer.drawSpacingHints();
    expect(strokes).toBeGreaterThan(0);
    renderer.up({});
  });
});
