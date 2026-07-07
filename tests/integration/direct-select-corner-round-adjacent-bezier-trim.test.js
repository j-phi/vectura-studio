/**
 * Regression: rounding a freeform corner adjacent to a real curve must trim
 * that curve (De Casteljau split) so the ADJACENT anchor's own handle
 * shortens to land exactly on the new fillet endpoint.
 *
 * Previously `updateFreeformCornerDrag` placed the new fillet-adjacent anchor
 * along a straight tangent line at distance `tDist` from the vertex, but left
 * the neighboring anchor's handle completely untouched — so a curve tuned to
 * reach the OLD (now-discarded) vertex kept the same control point while its
 * endpoint moved. That produces a visible tangent-discontinuity "kink" right
 * where the fillet meets the curve (confirmed against an Illustrator
 * reference: /Users/jayphi/Desktop/bezier2.mp4 — our result had a crease on
 * the curve-adjacent side of a rounded corner that Illustrator's did not).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('direct-select corner rounding — adjacent bezier gets trimmed, not orphaned', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => runtime.cleanup());

  // Anchor 0 departs into a real, visibly-bending curve; anchor 1 is a
  // "single-handle" corner (only its own `in` is set, matching a capital "S"
  // outline) where that curve meets a straight edge to anchor 2. Anchor 2 is
  // a plain corner between two straight edges (no adjacent curve at all).
  // Anchor 3 closes the quad back into anchor 0's curve.
  //
  // The specific coordinates matter: a corner whose adjacent curve's tangent
  // barely changes between the vertex and the fillet setback point (e.g. a
  // dead-straight single-handle curve) doesn't exercise the collinearity bug
  // below — the vertex-tangent approximation and the exact-split tangent
  // happen to agree by coincidence. This shape's curve visibly bends near the
  // corner (extracted from an actual traced "S" glyph), so the two tangents
  // genuinely diverge without the fix.
  function makeCurveIntoCornerPath() {
    const anchors = [
      { x: 58.89, y: 47.47, in: null, out: { x: 63.01, y: 36.21 } },
      { x: 85.66, y: 50.49, in: { x: 85.66, y: 37.57 }, out: null, corner: true },
      { x: 95, y: 60, in: null, out: null },
      { x: 58.89, y: 70, in: null, out: null },
    ];
    const path = anchors.map((p) => ({ x: p.x, y: p.y }));
    path.push({ x: anchors[0].x, y: anchors[0].y });
    path.meta = { kind: 'poly', closed: true, anchors };
    return path;
  }

  function setup() {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('corner-trim', 'shape', 'Shape');
    layer.sourcePaths = [makeCurveIntoCornerPath()];
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

  test('rounding the corner shortens the adjacent curve handle instead of leaving it aimed at the old vertex', () => {
    const { renderer } = setup();
    const handles = renderer._getFreeformCornerHandles();
    const handle = handles.find((h) => h.anchorIndex === 1);
    expect(handle).toBeTruthy();
    expect(handle.prevControlOut).toEqual({ x: 63.01, y: 36.21 });

    expect(renderer.beginFreeformCornerDrag(handle)).toBe(true);
    // A modest radius, well under the corner's geometric max — drag a few
    // pixels along the handle's own bisector, same as a real short drag.
    const target = {
      x: handle.worldVertex.x + handle.worldInward.x * 8,
      y: handle.worldVertex.y + handle.worldInward.y * 8,
    };
    renderer.updateFreeformCornerDrag(target);

    const anchors = renderer.directSelection.anchors;
    // Corner 1 replaced with 2 anchors => 4 + 1 = 5 total.
    expect(anchors).toHaveLength(5);

    const anchor0 = anchors[0];
    const newStart = anchors[1];

    // The adjacent curve's own handle must have shortened — NOT still pointing
    // at its original position, which was tuned to reach the now-discarded
    // vertex.
    expect(anchor0.out).toBeTruthy();
    expect(Math.hypot(anchor0.out.x - 63.01, anchor0.out.y - 36.21)).toBeGreaterThan(0.1);

    // The new fillet-start anchor must carry a real incoming handle (matching
    // the trimmed curve), not the previous naive `null`.
    expect(newStart.in).toBeTruthy();

    // The new start anchor must lie ON the original bezier curve — check its
    // distance to the vertex is a small setback, not off in some unrelated
    // location.
    const distToVertex = Math.hypot(newStart.x - 85.66, newStart.y - 50.49);
    expect(distToVertex).toBeGreaterThan(0);
    expect(distToVertex).toBeLessThan(20);

    // The new anchor's own `in`/`out` handles must be COLLINEAR (opposite
    // directions through the anchor) — i.e. a smooth point, not a corner.
    // Earlier the fillet's own kappa handle used the tangent-at-VERTEX
    // approximation while `in` came from the exact-curve trim, so on a curve
    // that bends near the corner the two pointed in genuinely different
    // directions — a corner point that still rendered as a visible kink.
    const dirIn = { x: newStart.in.x - newStart.x, y: newStart.in.y - newStart.y };
    const dirOut = { x: newStart.out.x - newStart.x, y: newStart.out.y - newStart.y };
    const cosAngle = (dirIn.x * dirOut.x + dirIn.y * dirOut.y)
      / (Math.hypot(dirIn.x, dirIn.y) * Math.hypot(dirOut.x, dirOut.y));
    expect(cosAngle).toBeCloseTo(-1, 5);
  });

  test('a corner with no curve on either side (plain polygon) is unaffected — both new anchors stay handle-less on the straight sides', () => {
    const { renderer } = setup();
    // Corner 2 (95,60) sits between two straight edges — no adjacent curve.
    const handles = renderer._getFreeformCornerHandles();
    const handle = handles.find((h) => h.anchorIndex === 2);
    expect(handle).toBeTruthy();
    expect(handle.prevControlOut).toBeNull();
    expect(handle.cornerIn).toBeNull();
    expect(handle.cornerOut).toBeNull();
    expect(handle.nextControlIn).toBeNull();

    expect(renderer.beginFreeformCornerDrag(handle)).toBe(true);
    const target = {
      x: handle.worldVertex.x + handle.worldInward.x * 4,
      y: handle.worldVertex.y + handle.worldInward.y * 4,
    };
    renderer.updateFreeformCornerDrag(target);

    const anchors = renderer.directSelection.anchors;
    expect(anchors).toHaveLength(5);
    // Corner (95,60) replaced with two anchors along its straight edges.
    // Neither straight edge has a curve, so neither new anchor should get a
    // trimmed-curve `in`/`out` handle.
    const newStart = anchors[2];
    const newEnd = anchors[3];
    expect(newStart.in).toBeNull();
    expect(newStart.out).toBeTruthy();
    expect(newEnd.out).toBeNull();
    expect(newEnd.in).toBeTruthy();
  });
});
