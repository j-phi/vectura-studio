/**
 * SEL-4 (Illustrator tools parity, Phase 1 Lane A): live measurement chips.
 *  - move-drags show a relative-delta chip `dX: … / dY: …` in document units;
 *  - hovering an anchor with an editing tool shows an `X: … / Y: …` chip
 *    (with the SG-2 `anchor` label reported via hook);
 *  - hovering a selection handle with the Select tool shows the X/Y chip;
 *  - without the smart-guides config loaded the chips quietly stay off.
 * Extends the existing drag-value-tooltip machinery (showDragTooltip).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { injectSmartGuidesConfig } = require('../helpers/inject-smart-guides-config');

describe('SEL-4: hover X/Y and move dX/dY measurement chips', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup({ withConfig = true } = {}) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    // src/config/smart-guides.js now ships via index.html (integrator added its
    // <script> tag), so the config loads with the runtime. The inject helper is
    // redundant-but-harmless when present; the "config absent" fallback case is
    // now reproduced by explicitly deleting the global.
    if (withConfig) injectSmartGuidesConfig(runtime);
    else delete runtime.window.Vectura.SMART_GUIDES;
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const square = new Layer('chip-sq', 'shape', 'Square');
    square.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    engine.layers.push(square);
    engine.generate(square.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([square.id], square.id);
    return { renderer, engine, square };
  }

  test('move-drag shows a dX/dY chip in document units, live', async () => {
    const { renderer } = await setup();
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 90, clientY: 45, buttons: 1 });

    expect(renderer.lastTooltipText).toBeTruthy();
    expect(renderer.lastTooltipText).toContain('dX: 30');
    expect(renderer.lastTooltipText).toContain('dY: -15');
    expect(renderer.lastTooltipText).toContain('mm');

    // Live update on the next move.
    renderer.move({ clientX: 100, clientY: 60, buttons: 1 });
    expect(renderer.lastTooltipText).toContain('dX: 40');
    expect(renderer.lastTooltipText).toContain('dY: 0');
    renderer.up({});
  });

  test('hovering an anchor with the Direct tool shows the X/Y chip and anchor label', async () => {
    const { renderer, square } = await setup();
    renderer.setTool('direct');
    renderer.setDirectSelection(square, 0);

    // Hover exactly over the (40,40) anchor.
    renderer.move({ clientX: 40, clientY: 40 });

    expect(renderer.lastTooltipText).toBeTruthy();
    expect(renderer.lastTooltipText).toContain('X: 40');
    expect(renderer.lastTooltipText).toContain('Y: 40');
    expect(renderer.lastTooltipText).toContain('mm');
    expect(renderer.hoverReadout).toBeTruthy();
    expect(renderer.hoverReadout.label).toBe('anchor');

    // Moving away hides the chip.
    renderer.move({ clientX: 60, clientY: 20 });
    expect(renderer.hoverReadout).toBeNull();
  });

  test('hovering a selection handle with the Select tool shows the handle X/Y chip', async () => {
    const { renderer } = await setup();
    // Hover the east edge-midpoint handle at (80,60).
    renderer.move({ clientX: 80, clientY: 60 });
    expect(renderer.lastTooltipText).toBeTruthy();
    expect(renderer.lastTooltipText).toContain('X: 80');
    expect(renderer.lastTooltipText).toContain('Y: 60');
  });

  test('without the smart-guides config the chips stay off', async () => {
    const { renderer } = await setup({ withConfig: false });
    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 90, clientY: 60, buttons: 1 });
    expect(renderer.lastTooltipText || null).toBeNull();
    renderer.up({});
  });
});
