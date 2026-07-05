/**
 * SG-5 + SG-2 (Illustrator tools parity, Phase 1 Lane A): hover highlight of
 * unselected geometry with the smart-guide accent and the `path` label.
 *  - Selection/Direct tools hovering an unselected path set renderer.hoverHighlight
 *    ({ layerId, label:'path' }) so draw() can outline it magenta;
 *  - hovering an already-selected layer's interior does NOT highlight;
 *  - moving off geometry clears the highlight;
 *  - drawHoverHighlight strokes the path (regression against a no-op).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

describe('SG-5/SG-2: hover highlight of unselected geometry', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    injectSmartGuidesConfig(runtime);
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];

    const a = new Layer('hh-a', 'shape', 'A');
    a.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    const b = new Layer('hh-b', 'shape', 'B');
    b.sourcePaths = [[
      { x: 140, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 40 },
    ]];
    engine.layers.push(a, b);
    engine.generate(a.id);
    engine.generate(b.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    return { renderer, engine, a, b };
  }

  test('Select tool hovering an unselected path highlights it with the path label', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id); // A selected, B not
    // Hover on B's top edge (150, 40).
    renderer.move({ clientX: 150, clientY: 40 });
    expect(renderer.hoverHighlight).toBeTruthy();
    expect(renderer.hoverHighlight.layerId).toBe('hh-b');
    expect(renderer.hoverHighlight.label).toBe('path');
  });

  test('hovering an already-selected layer does not set a hover highlight', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    // Hover on A's own edge (60, 40).
    renderer.move({ clientX: 60, clientY: 40 });
    expect(renderer.hoverHighlight).toBeNull();
  });

  test('moving off all geometry clears the highlight', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.move({ clientX: 150, clientY: 40 });
    expect(renderer.hoverHighlight).toBeTruthy();
    renderer.move({ clientX: 250, clientY: 250 });
    expect(renderer.hoverHighlight).toBeNull();
  });

  test('Direct tool also highlights unselected paths on hover', async () => {
    const { renderer } = await setup();
    renderer.setTool('direct');
    renderer.move({ clientX: 150, clientY: 40 });
    expect(renderer.hoverHighlight).toBeTruthy();
    expect(renderer.hoverHighlight.layerId).toBe('hh-b');
  });

  test('drawHoverHighlight strokes the hovered path (not a no-op)', async () => {
    const { renderer, a } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.move({ clientX: 150, clientY: 40 });
    let strokes = 0;
    const realStroke = renderer.ctx.stroke.bind(renderer.ctx);
    renderer.ctx.stroke = () => { strokes += 1; realStroke(); };
    renderer.drawHoverHighlight();
    expect(strokes).toBeGreaterThan(0);
  });
});
