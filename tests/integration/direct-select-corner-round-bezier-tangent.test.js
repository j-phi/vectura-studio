/**
 * Regression: corner-rounding on a FREEFORM path must use the true bezier
 * tangent at the corner, not the straight chord to the neighbor anchor.
 *
 * A corner beside a curved segment (e.g. the top of a capital "S" converted
 * to outlines) is often a "single-handle bezier" corner — the corner anchor
 * itself carries one handle (bent by the curve) while the other side is a
 * straight edge with no handle. Previously `_getFreeformCornerHandles`
 * ignored anchor handles entirely and derived prev/next directions from the
 * raw chord to the neighboring anchor position, which visibly misplaced the
 * rounding widget and mis-sized the fillet whenever the adjacent segment
 * bowed away from its chord.
 *
 * Also covers: the stem line from vertex to handle was removed (the handle
 * now floats free, matching the Illustrator reference), and the max-radius
 * "can't go further" red-arc cue is tracked while dragging.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('direct-select corner rounding — bezier tangent parity', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => runtime.cleanup());

  // A quad where anchor 1 is a "single-handle bezier" corner: its `in`
  // handle is pulled toward (85,5) — bent well away from the straight chord
  // back to anchor 0 at (0,0) — while its `out` side is a plain straight
  // edge down to anchor 2 (no handle on either endpoint).
  function makeSingleHandleCornerPath() {
    const anchors = [
      { x: 0, y: 0, in: null, out: { x: 60, y: 0 } },
      { x: 100, y: 20, in: { x: 85, y: 5 }, out: null, corner: true },
      { x: 100, y: 100, in: null, out: null },
      { x: 0, y: 100, in: null, out: null },
    ];
    const path = anchors.map((p) => ({ x: p.x, y: p.y }));
    path.push({ x: 0, y: 0 });
    path.meta = { kind: 'poly', closed: true, anchors };
    return path;
  }

  function makeSquarePath() {
    const anchors = [
      { x: 0, y: 0, in: null, out: null },
      { x: 100, y: 0, in: null, out: null },
      { x: 100, y: 100, in: null, out: null },
      { x: 0, y: 100, in: null, out: null },
    ];
    const path = anchors.map((p) => ({ x: p.x, y: p.y }));
    path.push({ x: 0, y: 0 });
    path.meta = { kind: 'poly', closed: true, anchors };
    return path;
  }

  function setup(pathFactory) {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('corner-bezier', 'shape', 'Shape');
    layer.sourcePaths = [pathFactory()];
    layer.params = {
      curves: false, smoothing: 0, simplify: 0,
      posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
    };
    engine.layers.push(layer);
    engine.generate(layer.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setSelection([layer.id], layer.id);
    renderer.setTool('direct');
    renderer.setDirectSelection(layer, 0);
    return { renderer, engine, layer };
  }

  test('corner tangent direction follows the anchor handle, not the neighbor chord', () => {
    const { renderer } = setup(makeSingleHandleCornerPath);
    const handles = renderer._getFreeformCornerHandles();
    const handle = handles.find((h) => h.anchorIndex === 1);
    expect(handle).toBeTruthy();

    // True tangent: direction from (100,20) toward its own `in` handle (85,5).
    const expectedPrevDir = { x: -1 / Math.sqrt(2), y: -1 / Math.sqrt(2) };
    expect(handle.sourcePrevDir.x).toBeCloseTo(expectedPrevDir.x, 3);
    expect(handle.sourcePrevDir.y).toBeCloseTo(expectedPrevDir.y, 3);

    // The buggy straight-chord direction back to anchor 0 (0,0) would have
    // been ~(-0.9806, -0.1961) — well off the true tangent. Guard against
    // regressing to that chord-based calculation.
    const chordDir = { x: -100 / Math.sqrt(10400), y: -20 / Math.sqrt(10400) };
    const chordDist = Math.hypot(handle.sourcePrevDir.x - chordDir.x, handle.sourcePrevDir.y - chordDir.y);
    expect(chordDist).toBeGreaterThan(0.3);

    // The `out` side has no handle on either endpoint, so it correctly still
    // falls back to the straight chord toward anchor 2 (100,100): (0, 1).
    expect(handle.sourceNextDir.x).toBeCloseTo(0, 5);
    expect(handle.sourceNextDir.y).toBeCloseTo(1, 5);
  });

  test('corner handle has no stem line connecting it to the vertex', () => {
    const { renderer } = setup(makeSquarePath);
    const handles = renderer._getFreeformCornerHandles();
    expect(handles.length).toBeGreaterThan(0);

    const calls = [];
    const ctx = renderer.ctx;
    const origLineTo = ctx.lineTo.bind(ctx);
    ctx.lineTo = (...args) => {
      calls.push(args);
      return origLineTo(...args);
    };

    renderer.draw();

    const stemDrawn = calls.some(([x, y]) =>
      handles.some((h) => Math.abs(x - h.worldPoint.x) < 1e-6 && Math.abs(y - h.worldPoint.y) < 1e-6)
    );
    expect(stemDrawn).toBe(false);
  });

  test('dragging a corner handle past its geometric limit flags the fillet arc as maxed', () => {
    const { renderer } = setup(makeSquarePath);
    const handles = renderer._getFreeformCornerHandles();
    const handle0 = handles.find((h) => h.anchorIndex === 0);
    expect(renderer.beginFreeformCornerDrag(handle0)).toBe(true);

    // A right-angle corner on a 100x100 square has maxRadius = 50.
    expect(renderer.freeformCornerDrag.maxRadius).toBeCloseTo(50, 5);

    // Small drag: well under the limit, no overlay.
    renderer.updateFreeformCornerDrag({ x: 15, y: 15 });
    expect(renderer.freeformCornerDrag.maxArcs).toHaveLength(0);

    // Large drag: clamps to maxRadius, overlay should flag the arc.
    renderer.updateFreeformCornerDrag({ x: 200, y: 200 });
    expect(renderer.freeformCornerDrag.currentRadius).toBeCloseTo(50, 5);
    expect(renderer.freeformCornerDrag.maxArcs).toHaveLength(1);
  });
});
