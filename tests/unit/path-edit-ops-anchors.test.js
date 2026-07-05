/*
 * PTH-4 — anchor conversion & endpoint verbs on the direct-selection anchor
 * set. Anchor-ref contract: [{ layerId, pathIndex, anchorIndex }] where
 * anchorIndex follows the renderer's pathToAnchors semantics (meta.anchors
 * when present, else one anchor per point with the closed duplicate dropped).
 */
const path = require('path');

const geometry = require(path.resolve(__dirname, '../../src/core/geometry-utils.js'));

globalThis.Vectura = globalThis.Vectura || {};
globalThis.Vectura.GeometryUtils = { ...(globalThis.Vectura.GeometryUtils || {}), ...geometry };

require(path.resolve(__dirname, '../../src/core/path-edit-ops.js'));
const Ops = globalThis.Vectura.PathEditOps;

const cloneDeepPaths = (paths) =>
  (paths || []).map((p) => {
    const c = p.map((pt) => ({ x: pt.x, y: pt.y }));
    if (p.meta) c.meta = JSON.parse(JSON.stringify(p.meta));
    return c;
  });

const makeEngine = () => ({
  layers: [],
  generate(id) {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer || !Array.isArray(layer.sourcePaths)) return;
    layer.paths = cloneDeepPaths(layer.sourcePaths);
  },
});

const makeApp = (engine) => {
  const app = { engine, pushCount: 0 };
  app.pushHistory = () => { app.pushCount += 1; };
  return app;
};

const makeShapeLayer = (id, sourcePaths) => ({
  id,
  name: id,
  type: 'shape',
  isGroup: false,
  visible: true,
  params: { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 },
  origin: { x: 0, y: 0 },
  sourcePaths,
  paths: [],
  fills: [],
});

// Closed diamond with smooth (handled) anchors.
const makeSmoothClosedPath = () => {
  const anchors = [
    { x: 50, y: 0, in: { x: 30, y: 0 }, out: { x: 70, y: 0 } },
    { x: 100, y: 50, in: { x: 100, y: 30 }, out: { x: 100, y: 70 } },
    { x: 50, y: 100, in: { x: 70, y: 100 }, out: { x: 30, y: 100 } },
    { x: 0, y: 50, in: { x: 0, y: 70 }, out: { x: 0, y: 30 } },
  ];
  const pts = geometry.buildPolylineFromAnchors(anchors, true).map((p) => ({ x: p.x, y: p.y }));
  pts.meta = { kind: 'poly', closed: true, anchors };
  return pts;
};

// Open 5-anchor zigzag, corner anchors (no handles).
const makeOpenPath = () => {
  const anchors = [
    { x: 0, y: 0, in: null, out: null },
    { x: 25, y: 20, in: null, out: null },
    { x: 50, y: 0, in: null, out: null },
    { x: 75, y: 20, in: null, out: null },
    { x: 100, y: 0, in: null, out: null },
  ];
  const pts = anchors.map((a) => ({ x: a.x, y: a.y }));
  pts.meta = { kind: 'poly', closed: false, anchors };
  return pts;
};

const setup = (paths) => {
  const engine = makeEngine();
  const app = makeApp(engine);
  const layer = makeShapeLayer('A1', paths);
  engine.layers.push(layer);
  engine.generate(layer.id);
  return { engine, app, layer, ctx: { app, engine } };
};

const ref = (anchorIndex, pathIndex = 0, layerId = 'A1') => ({ layerId, pathIndex, anchorIndex });

describe('PTH-4 convertAnchorsToCorner', () => {
  test('zeroes the bezier handles of the selected anchors only', () => {
    const { ctx, layer } = setup([makeSmoothClosedPath()]);
    const res = Ops.convertAnchorsToCorner([ref(0), ref(2)], ctx);
    expect(res.changed).toBe(true);
    const anchors = layer.sourcePaths[0].meta.anchors;
    expect(anchors[0].in).toBeNull();
    expect(anchors[0].out).toBeNull();
    expect(anchors[2].in).toBeNull();
    expect(anchors[2].out).toBeNull();
    expect(anchors[1].in).not.toBeNull();
    expect(anchors[3].out).not.toBeNull();
  });

  test('pushes exactly one history entry', () => {
    const { ctx, app } = setup([makeSmoothClosedPath()]);
    Ops.convertAnchorsToCorner([ref(1)], ctx);
    expect(app.pushCount).toBe(1);
  });

  test('canConvert: true for a valid ref, false for empty or out-of-range', () => {
    const { ctx } = setup([makeSmoothClosedPath()]);
    expect(Ops.canConvert([ref(0)], ctx).ok).toBe(true);
    expect(Ops.canConvert([], ctx).ok).toBe(false);
    expect(Ops.canConvert([ref(99)], ctx).ok).toBe(false);
    expect(Ops.canConvert([{ layerId: 'nope', pathIndex: 0, anchorIndex: 0 }], ctx).ok).toBe(false);
  });
});

describe('PTH-4 convertAnchorsToSmooth', () => {
  test('fits symmetric handles from the neighbors', () => {
    const { ctx, layer } = setup([makeOpenPath()]);
    const res = Ops.convertAnchorsToSmooth([ref(2)], ctx);
    expect(res.changed).toBe(true);
    const a = layer.sourcePaths[0].meta.anchors[2];
    expect(a.in).not.toBeNull();
    expect(a.out).not.toBeNull();
    // Symmetric: in/out mirror about the anchor.
    expect(a.out.x - a.x).toBeCloseTo(-(a.in.x - a.x), 9);
    expect(a.out.y - a.y).toBeCloseTo(-(a.in.y - a.y), 9);
    // Direction follows the neighbor chord (prev → next).
    const anchors = layer.sourcePaths[0].meta.anchors;
    const chord = { x: anchors[3].x - anchors[1].x, y: anchors[3].y - anchors[1].y };
    const handle = { x: a.out.x - a.x, y: a.out.y - a.y };
    const cross = chord.x * handle.y - chord.y * handle.x;
    expect(Math.abs(cross)).toBeLessThan(1e-9);
  });

  test('open-path endpoints keep the outward handle null', () => {
    const { ctx, layer } = setup([makeOpenPath()]);
    Ops.convertAnchorsToSmooth([ref(0), ref(4)], ctx);
    const anchors = layer.sourcePaths[0].meta.anchors;
    expect(anchors[0].in).toBeNull();
    expect(anchors[4].out).toBeNull();
  });
});

describe('PTH-4 cutAtAnchors', () => {
  test('closed path cut at one anchor becomes ONE open path starting/ending there', () => {
    const { ctx, layer } = setup([makeSmoothClosedPath()]);
    const res = Ops.cutAtAnchors([ref(1)], ctx);
    expect(res.changed).toBe(true);
    expect(layer.sourcePaths).toHaveLength(1);
    const meta = layer.sourcePaths[0].meta;
    expect(meta.closed).toBe(false);
    const anchors = meta.anchors;
    expect(anchors).toHaveLength(5); // 4 + duplicated cut anchor
    expect(anchors[0].x).toBe(100);
    expect(anchors[0].y).toBe(50);
    expect(anchors[anchors.length - 1].x).toBe(100);
    expect(anchors[anchors.length - 1].y).toBe(50);
    // Handle split: start keeps out, end keeps in.
    expect(anchors[0].in).toBeNull();
    expect(anchors[0].out).not.toBeNull();
    expect(anchors[anchors.length - 1].in).not.toBeNull();
    expect(anchors[anchors.length - 1].out).toBeNull();
  });

  test('closed path cut at two anchors becomes TWO open subpaths', () => {
    const { ctx, layer } = setup([makeSmoothClosedPath()]);
    Ops.cutAtAnchors([ref(0), ref(2)], ctx);
    expect(layer.sourcePaths).toHaveLength(2);
    layer.sourcePaths.forEach((p) => {
      expect(p.meta.closed).toBe(false);
      expect(p.meta.anchors).toHaveLength(3);
    });
  });

  test('open path cut at an interior anchor splits into two open subpaths', () => {
    const { ctx, layer } = setup([makeOpenPath()]);
    Ops.cutAtAnchors([ref(2)], ctx);
    expect(layer.sourcePaths).toHaveLength(2);
    expect(layer.sourcePaths[0].meta.anchors).toHaveLength(3);
    expect(layer.sourcePaths[1].meta.anchors).toHaveLength(3);
    expect(layer.sourcePaths[0].meta.anchors[2].x).toBe(50);
    expect(layer.sourcePaths[1].meta.anchors[0].x).toBe(50);
  });

  test('canCut: endpoint of an open path is not cuttable; closed anchors are', () => {
    const open = setup([makeOpenPath()]);
    expect(Ops.canCut([ref(0)], open.ctx).ok).toBe(false);
    expect(Ops.canCut([ref(4)], open.ctx).ok).toBe(false);
    expect(Ops.canCut([ref(2)], open.ctx).ok).toBe(true);
    const closed = setup([makeSmoothClosedPath()]);
    expect(Ops.canCut([ref(0)], closed.ctx).ok).toBe(true);
  });

  test('pushes exactly one history entry', () => {
    const { ctx, app } = setup([makeSmoothClosedPath()]);
    Ops.cutAtAnchors([ref(0), ref(2)], ctx);
    expect(app.pushCount).toBe(1);
  });
});

describe('PTH-4 joinEndpoints', () => {
  test('the two ends of one open path close it with a straight segment', () => {
    const { ctx, layer } = setup([makeOpenPath()]);
    const res = Ops.joinEndpoints([ref(0), ref(4)], ctx);
    expect(res.changed).toBe(true);
    expect(layer.sourcePaths).toHaveLength(1);
    const meta = layer.sourcePaths[0].meta;
    expect(meta.closed).toBe(true);
    // Straight closing segment: outward handles at the seam stay null.
    expect(meta.anchors[0].in).toBeNull();
    expect(meta.anchors[meta.anchors.length - 1].out).toBeNull();
    // Polyline is point-closed.
    const p = layer.sourcePaths[0];
    expect(p[0].x).toBeCloseTo(p[p.length - 1].x, 9);
    expect(p[0].y).toBeCloseTo(p[p.length - 1].y, 9);
  });

  test('two open paths merge into one with a straight junction', () => {
    const a = makeOpenPath();
    const b = makeOpenPath().map((pt) => ({ x: pt.x + 200, y: pt.y }));
    b.meta = {
      kind: 'poly',
      closed: false,
      anchors: makeOpenPath().meta.anchors.map((an) => ({ ...an, x: an.x + 200 })),
    };
    const { ctx, layer } = setup([a, b]);
    const res = Ops.joinEndpoints([ref(4, 0), ref(0, 1)], ctx);
    expect(res.changed).toBe(true);
    expect(layer.sourcePaths).toHaveLength(1);
    const anchors = layer.sourcePaths[0].meta.anchors;
    expect(anchors).toHaveLength(10);
    expect(anchors[4].x).toBe(100); // end of A
    expect(anchors[5].x).toBe(200); // start of B
    expect(layer.sourcePaths[0].meta.closed).toBe(false);
  });

  test('reverses a path when joining start-to-start', () => {
    const a = makeOpenPath();
    const b = makeOpenPath().map((pt) => ({ x: pt.x + 200, y: pt.y }));
    b.meta = {
      kind: 'poly',
      closed: false,
      anchors: makeOpenPath().meta.anchors.map((an) => ({ ...an, x: an.x + 200 })),
    };
    const { ctx, layer } = setup([a, b]);
    Ops.joinEndpoints([ref(0, 0), ref(0, 1)], ctx);
    expect(layer.sourcePaths).toHaveLength(1);
    const anchors = layer.sourcePaths[0].meta.anchors;
    expect(anchors).toHaveLength(10);
    // A reversed: starts at its far end (100), junction at A[0] (0) → B[0] (200).
    expect(anchors[0].x).toBe(100);
    expect(anchors[4].x).toBe(0);
    expect(anchors[5].x).toBe(200);
  });

  test('canJoin: exactly two OPEN endpoints in the same layer', () => {
    const open2 = () => {
      const b = makeOpenPath().map((pt) => ({ x: pt.x + 200, y: pt.y }));
      b.meta = {
        kind: 'poly',
        closed: false,
        anchors: makeOpenPath().meta.anchors.map((an) => ({ ...an, x: an.x + 200 })),
      };
      return b;
    };
    const { ctx } = setup([makeOpenPath(), open2()]);
    expect(Ops.canJoin([ref(4, 0), ref(0, 1)], ctx).ok).toBe(true);
    expect(Ops.canJoin([ref(4, 0)], ctx).ok).toBe(false); // one ref
    expect(Ops.canJoin([ref(2, 0), ref(0, 1)], ctx).ok).toBe(false); // interior anchor
    expect(Ops.canJoin([ref(4, 0), ref(4, 0)], ctx).ok).toBe(false); // same endpoint twice
    const closed = setup([makeSmoothClosedPath()]);
    expect(Ops.canJoin([ref(0), ref(2)], closed.ctx).ok).toBe(false); // closed path
  });

  test('pushes exactly one history entry', () => {
    const { ctx, app } = setup([makeOpenPath()]);
    Ops.joinEndpoints([ref(0), ref(4)], ctx);
    expect(app.pushCount).toBe(1);
  });
});
