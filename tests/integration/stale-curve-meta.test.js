const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Regression for d076521 fallout: Renderer.tracePath draws a curved outline from
// path.meta.anchors. Any pipeline step that MUTATES a path's points but copies the
// original meta onto the result leaves stale `anchors`/`shape` describing the
// pre-mutation curve — so the rendered outline no longer matches the real (clipped/
// mirrored/simplified) geometry. Each mutating step must drop the parametric meta so
// tracePath falls back to the true polyline.
describe('parametric curve meta is dropped when geometry is mutated', () => {
  let runtime, V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const withShapeMeta = (pts) => {
    const p = pts.map((q) => ({ ...q }));
    p.meta = {
      kind: 'shape',
      closed: false,
      shape: { type: 'oval', cx: 50, cy: 50, rx: 50, ry: 50 },
      anchors: pts.map((q) => ({ x: q.x, y: q.y, in: { x: q.x - 5, y: q.y }, out: { x: q.x + 5, y: q.y } })),
    };
    return p;
  };

  test('clipping (segmentPathByPolygons) drops anchors/shape on output segments', () => {
    const path = withShapeMeta([
      { x: 0, y: 50 }, { x: 25, y: 50 }, { x: 50, y: 50 }, { x: 75, y: 50 }, { x: 100, y: 50 },
    ]);
    // clip away the right half (x > 50)
    const poly = [{ x: 50, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 50, y: 100 }, { x: 50, y: 0 }];
    const segs = V.PathBoolean.segmentPathByPolygons(path, [poly], { closed: false });
    expect(segs.length).toBeGreaterThan(0);
    for (const seg of segs) {
      expect(seg.meta?.anchors).toBeUndefined();
      expect(seg.meta?.shape).toBeUndefined();
      expect(seg.meta?.kind).not.toBe('shape');
    }
  });

  test('mirror (applyMirrorToPaths) drops anchors/shape on a reflected OPEN path', () => {
    const path = withShapeMeta([
      { x: 10, y: 50 }, { x: 40, y: 50 }, { x: 70, y: 50 },
    ]);
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const mirror = { id: 'm', enabled: true, type: 'line', angle: 90, xShift: 0, yShift: 0, replacedSide: 'negative' };
    const out = V.Modifiers.applyMirrorToPaths([path], mirror, bounds);
    expect(out.length).toBeGreaterThan(0);
    for (const seg of out) {
      if (!Array.isArray(seg)) continue;
      expect(seg.meta?.anchors).toBeUndefined();
      expect(seg.meta?.shape).toBeUndefined();
      expect(seg.meta?.kind).not.toBe('shape');
    }
  });

  test('simplify (simplifyPath + Visvalingam) drops anchors/shape', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({ x: i * 3, y: Math.sin(i / 4) * 10 }));
    for (const fn of ['simplifyPath', 'simplifyPathVisvalingam']) {
      const path = withShapeMeta(pts);
      const out = V.GeometryUtils[fn](path, 2);
      expect(out.meta?.anchors).toBeUndefined();
      expect(out.meta?.shape).toBeUndefined();
      expect(out.meta?.kind).not.toBe('shape');
    }
  });
});
