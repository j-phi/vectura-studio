/**
 * SEL-2 (Illustrator tools parity, Phase 1 Lane A): Alt/Option+drag duplicates
 * the selection.
 *  - single-layer alt-drag duplicate is a pre-existing behavior (regression);
 *  - multi-selection alt-drag duplicates ALL selected layers (new);
 *  - Escape mid-drag cancels leaving no duplicate behind (new);
 *  - the whole duplicate+move commits as ONE undo step (new).
 *
 * History semantics mirror app.js wiring: push-before-change; onDuplicateLayer
 * pushes once, onCommitTransform pushes unless renderer._skipCommitHistory.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SEL-2: alt-drag duplicates the selection', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    // This suite asserts exact drag deltas for the duplicated copies. Now that
    // src/config/smart-guides.js ships via index.html, object-alignment snap
    // (SG-1) is live and would snap two identically-sized, Y-aligned squares
    // back into alignment mid-drag, perturbing the delta. Snapping is orthogonal
    // to what these tests verify (which layers get duplicated + move), so turn
    // the guide snap off for deterministic geometry.
    SETTINGS.snapGuides = false;
    SETTINGS.showGuides = false;
    const engine = new VectorEngine();
    engine.layers = [];

    const left = new Layer('alt-left', 'shape', 'Left');
    left.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    const right = new Layer('alt-right', 'shape', 'Right');
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

    // Mirror app.js history wiring (push-before-change snapshots).
    const app = { history: ['initial'] };
    renderer.app = app;
    renderer.onDuplicateLayer = () => app.history.push('pre-duplicate');
    renderer.onCommitTransform = () => {
      if (!renderer._skipCommitHistory) app.history.push('pre-commit');
    };

    return { renderer, engine, left, right, app };
  }

  const centerOf = (renderer, layer) => {
    const b = renderer.getSelectionBounds([layer]);
    return { x: b.center.x, y: b.center.y };
  };

  test('regression: single-layer alt-drag duplicates and drags the copy', async () => {
    const { renderer, engine, left } = await setup();
    renderer.setSelection([left.id], left.id);
    const before = centerOf(renderer, left);

    renderer.down({ clientX: 60, clientY: 60, altKey: true, preventDefault() {} });
    expect(engine.layers.length).toBe(3);
    renderer.move({ clientX: 90, clientY: 60, buttons: 1, altKey: true });
    renderer.up({});

    expect(engine.layers.length).toBe(3);
    // Original untouched.
    const after = centerOf(renderer, left);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
    // Copy moved by the drag delta.
    const dup = engine.layers.find((l) => l.id !== 'alt-left' && l.id !== 'alt-right');
    const dupCenter = centerOf(renderer, dup);
    expect(dupCenter.x).toBeCloseTo(before.x + 30, 3);
    expect(dupCenter.y).toBeCloseTo(before.y, 3);
  });

  test('multi-selection alt-drag duplicates all selected layers, originals untouched', async () => {
    const { renderer, engine, left, right } = await setup();
    renderer.setSelection([left.id, right.id], left.id);
    const beforeLeft = centerOf(renderer, left);
    const beforeRight = centerOf(renderer, right);

    renderer.down({ clientX: 60, clientY: 60, altKey: true, preventDefault() {} });
    expect(engine.layers.length).toBe(4);
    renderer.move({ clientX: 60, clientY: 90, buttons: 1, altKey: true });
    renderer.up({});

    expect(engine.layers.length).toBe(4);
    // Originals untouched.
    const afterLeft = centerOf(renderer, left);
    const afterRight = centerOf(renderer, right);
    expect(afterLeft.x).toBeCloseTo(beforeLeft.x, 3);
    expect(afterLeft.y).toBeCloseTo(beforeLeft.y, 3);
    expect(afterRight.x).toBeCloseTo(beforeRight.x, 3);
    expect(afterRight.y).toBeCloseTo(beforeRight.y, 3);
    // Both copies moved by the drag delta (dy = +30).
    const dups = engine.layers.filter((l) => !['alt-left', 'alt-right'].includes(l.id));
    expect(dups.length).toBe(2);
    const dupCenters = dups.map((d) => centerOf(renderer, d)).sort((a, b) => a.x - b.x);
    expect(dupCenters[0].x).toBeCloseTo(beforeLeft.x, 3);
    expect(dupCenters[0].y).toBeCloseTo(beforeLeft.y + 30, 3);
    expect(dupCenters[1].x).toBeCloseTo(beforeRight.x, 3);
    expect(dupCenters[1].y).toBeCloseTo(beforeRight.y + 30, 3);
    // Copies are selected after the drop.
    dups.forEach((d) => expect(renderer.selectedLayerIds.has(d.id)).toBe(true));
  });

  test('alt-drag drop commits as ONE undo step (single history push)', async () => {
    const { renderer, left, right, app } = await setup();
    renderer.setSelection([left.id, right.id], left.id);
    const startLen = app.history.length;

    renderer.down({ clientX: 60, clientY: 60, altKey: true, preventDefault() {} });
    renderer.move({ clientX: 90, clientY: 60, buttons: 1, altKey: true });
    renderer.up({});

    // Exactly one push-before-change snapshot → one undo restores pre-dup state.
    expect(app.history.length).toBe(startLen + 1);
    expect(app.history[app.history.length - 1]).toBe('pre-duplicate');
  });

  test('Escape mid alt-drag cancels: no duplicates, original selection, no phantom history', async () => {
    const { renderer, engine, left, right, app } = await setup();
    renderer.setSelection([left.id, right.id], left.id);
    const startLen = app.history.length;

    renderer.down({ clientX: 60, clientY: 60, altKey: true, preventDefault() {} });
    expect(engine.layers.length).toBe(4);
    renderer.move({ clientX: 90, clientY: 60, buttons: 1, altKey: true });

    runtime.window.document.dispatchEvent(
      new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );

    expect(engine.layers.length).toBe(2);
    expect(renderer.isLayerDrag).toBe(false);
    expect(renderer.selectedLayerIds.has(left.id)).toBe(true);
    expect(renderer.selectedLayerIds.has(right.id)).toBe(true);
    expect(app.history.length).toBe(startLen);

    // The trailing pointerup must not re-commit anything.
    renderer.up({});
    expect(engine.layers.length).toBe(2);
    expect(app.history.length).toBe(startLen);
  });

  test('Escape mid plain move-drag cancels the move preview', async () => {
    const { renderer, left } = await setup();
    renderer.setSelection([left.id], left.id);
    const before = centerOf(renderer, left);

    renderer.down({ clientX: 60, clientY: 60, preventDefault() {} });
    renderer.move({ clientX: 90, clientY: 60, buttons: 1 });
    expect(renderer.tempTransform).toBeTruthy();

    runtime.window.document.dispatchEvent(
      new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(renderer.tempTransform).toBeNull();
    expect(renderer.isLayerDrag).toBe(false);

    renderer.up({});
    const after = centerOf(renderer, left);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
  });
});
