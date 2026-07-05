/**
 * P3 feedback: Shift/Cmd-click must add/remove objects from a multi-selection
 * (Illustrator-parity). Before the fix, the object-selection path in down()
 * never passed {toggle} to selectLayer, so shift-clicking a second object
 * *replaced* the selection (size stayed 1) instead of extending it.
 *
 * Also: a Shift marquee is additive — it unions the marquee hits into the
 * existing selection rather than replacing it.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('P3: shift/cmd-click multi-select + additive marquee', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    SETTINGS.snapGuides = false;
    SETTINGS.showGuides = false;
    const engine = new VectorEngine();
    engine.layers = [];

    const left = new Layer('sq-left', 'shape', 'Left');
    left.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    const right = new Layer('sq-right', 'shape', 'Right');
    right.sourcePaths = [[
      { x: 140, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 40 },
    ]];
    engine.layers.push(left, right);
    engine.generate(left.id);
    engine.generate(right.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.app = { history: [] };
    return { renderer, engine, left, right };
  }

  test('shift-click a second object adds it to the selection', async () => {
    const { renderer, left } = await setup();
    renderer.setSelection([left.id], left.id);
    expect(renderer.selectedLayerIds.size).toBe(1);

    // Shift-click the right square's top edge (160,40).
    renderer.down({ clientX: 160, clientY: 40, shiftKey: true, preventDefault() {} });
    renderer.up({});

    expect([...renderer.selectedLayerIds].sort()).toEqual(['sq-left', 'sq-right']);
  });

  test('shift-clicking an already-selected object removes it (toggle)', async () => {
    const { renderer, left, right } = await setup();
    renderer.setSelection([left.id, right.id], left.id);
    expect(renderer.selectedLayerIds.size).toBe(2);

    // Shift-click the right square again → removed.
    renderer.down({ clientX: 160, clientY: 40, shiftKey: true, preventDefault() {} });
    renderer.up({});

    expect([...renderer.selectedLayerIds]).toEqual(['sq-left']);
  });

  test('plain (no-shift) click still replaces the selection', async () => {
    const { renderer, left } = await setup();
    renderer.setSelection([left.id], left.id);

    renderer.down({ clientX: 160, clientY: 40, preventDefault() {} });
    renderer.up({});

    expect([...renderer.selectedLayerIds]).toEqual(['sq-right']);
  });

  test('shift marquee unions hits into the existing selection', async () => {
    const { renderer, left, right } = await setup();
    renderer.setSelection([left.id], left.id);

    // Shift-drag a marquee over the right square only, on empty canvas start.
    renderer.down({ clientX: 120, clientY: 20, shiftKey: true, preventDefault() {} });
    renderer.move({ clientX: 200, clientY: 100, buttons: 1, shiftKey: true });
    renderer.up({});

    expect([...renderer.selectedLayerIds].sort()).toEqual(['sq-left', 'sq-right']);
  });

  test('shift-click is discrete — a drift after it does NOT move the selection', async () => {
    const { renderer, left, right } = await setup();
    renderer.setSelection([left.id], left.id);
    const rightBefore = renderer.getSelectionBounds([right]).center;

    // Shift-click right to add, then drift the pointer and release.
    renderer.down({ clientX: 160, clientY: 40, shiftKey: true, preventDefault() {} });
    expect(renderer.isLayerDrag).toBeFalsy(); // no move armed
    renderer.move({ clientX: 175, clientY: 55, buttons: 1, shiftKey: true });
    renderer.up({});

    expect([...renderer.selectedLayerIds].sort()).toEqual(['sq-left', 'sq-right']);
    const rightAfter = renderer.getSelectionBounds([right]).center;
    expect(rightAfter.x).toBeCloseTo(rightBefore.x, 3);
    expect(rightAfter.y).toBeCloseTo(rightBefore.y, 3);
  });

  test('plain marquee replaces (does not union) the selection', async () => {
    const { renderer, left, right } = await setup();
    renderer.setSelection([left.id], left.id);

    renderer.down({ clientX: 120, clientY: 20, preventDefault() {} });
    renderer.move({ clientX: 200, clientY: 100, buttons: 1 });
    renderer.up({});

    expect([...renderer.selectedLayerIds]).toEqual(['sq-right']);
  });
});
