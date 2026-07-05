/*
 * PTH-3b — PathEditOps progressive smooth session (begin/preview/commit/cancel).
 *
 * The interactive Smooth slider rounds corners progressively (Illustrator
 * parity): higher t = more corner rounding, with live preview + a single
 * undoable commit. Closed paths round uniformly (ring-aware); open paths hold
 * their endpoints. Mirrors the simplify-session pure-core test harness.
 */
const path = require('path');

const geometry = require(path.resolve(__dirname, '../../src/core/geometry-utils.js'));
const optimization = require(path.resolve(__dirname, '../../src/core/optimization-utils.js'));
const pathBoolean = require(path.resolve(__dirname, '../../src/core/path-boolean.js'));

globalThis.Vectura = globalThis.Vectura || {};
globalThis.Vectura.GeometryUtils = { ...(globalThis.Vectura.GeometryUtils || {}), ...geometry };
globalThis.Vectura.OptimizationUtils = { ...(globalThis.Vectura.OptimizationUtils || {}), ...optimization };
globalThis.Vectura.PathBoolean = { ...(globalThis.Vectura.PathBoolean || {}), ...pathBoolean };

require(path.resolve(__dirname, '../../src/core/path-edit-ops.js'));
const Ops = globalThis.Vectura.PathEditOps;

const cloneDeepPaths = (paths) => (paths || []).map((p) => {
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
  getLayerDescendants() { return []; },
});

const makeApp = (engine) => {
  const app = { engine, pushCount: 0 };
  app.pushHistory = () => { app.pushCount += 1; };
  return app;
};

const makeShapeLayer = (id, sourcePaths) => ({
  id, name: id, type: 'shape', isGroup: false, visible: true,
  params: { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 },
  origin: { x: 0, y: 0 }, sourcePaths, paths: [], fills: [],
});

// A sharp closed pentagon (straight-tagged so flatten passes through).
const makePolygon = () => {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pts.push({ x: 50 + Math.cos(a) * 40, y: 50 + Math.sin(a) * 40 });
  }
  pts.push({ x: pts[0].x, y: pts[0].y }); // closed ring
  pts.meta = { straight: true, closed: true };
  return pts;
};

const makeOpenPath = () => {
  const pts = [
    { x: 0, y: 0 }, { x: 20, y: 40 }, { x: 40, y: 0 }, { x: 60, y: 40 }, { x: 80, y: 0 },
  ];
  pts.meta = { straight: true, closed: false };
  return pts;
};

// A dense closed circle (like a Shape algorithm's polyline output): many input
// points that a good curve fit should collapse to a handful of bezier anchors.
const makeDenseCircle = (n = 60, r = 100) => {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) }); }
  pts.push({ x: pts[0].x, y: pts[0].y });
  pts.meta = { straight: true, closed: true };
  return pts;
};

const setup = (factory = makePolygon) => {
  const engine = makeEngine();
  const app = makeApp(engine);
  const layer = makeShapeLayer('L1', [factory()]);
  engine.layers.push(layer);
  engine.generate(layer.id);
  return { engine, app, layer, ctx: { app, engine } };
};

const anchorsOf = (path) => (path && path.meta && Array.isArray(path.meta.anchors)) ? path.meta.anchors : [];

afterEach(() => { Ops.smoothCancel({}); });

describe('PTH-3b smooth session', () => {
  test('smoothBegin returns the eligible layer ids and getSmoothState reflects active', () => {
    const { ctx } = setup();
    const res = Ops.smoothBegin(['L1'], ctx);
    expect(res).toBeTruthy();
    expect(res.layerIds).toEqual(['L1']);
    expect(Ops.getSmoothState().active).toBe(true);
  });

  test('fits the FEWEST bezier anchors, not one-per-point, and stays faithful', () => {
    const { ctx, layer } = setup(makeDenseCircle);
    const inputCount = layer.sourcePaths[0].length; // ~61 points
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(30, ctx);
    const anchors = anchorsOf(layer.sourcePaths[0]);
    // Minimal: far fewer anchors than input points, and they carry handles.
    expect(anchors.length).toBeGreaterThan(1);
    expect(anchors.length).toBeLessThan(inputCount / 4);
    expect(anchors.every((a) => a.in || a.out)).toBe(true);
    // Faithful: the flattened fitted curve stays within 5% of the r=100 circle.
    const maxDev = Math.max(...layer.sourcePaths[0].map((p) => Math.abs(Math.hypot(p.x, p.y) - 100)));
    expect(maxDev).toBeLessThan(5);
    // Stamped forceCurves so it renders/exports as true cubic beziers even with
    // the layer's Curves toggle off.
    expect(layer.sourcePaths[0].meta.forceCurves).toBe(true);
  });

  test('higher t → looser fit → same-or-fewer anchors (progressive)', () => {
    const { ctx, layer } = setup(makeDenseCircle);
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(5, ctx);
    const cLow = anchorsOf(layer.sourcePaths[0]).length;
    Ops.smoothPreview(90, ctx);
    const cHigh = anchorsOf(layer.sourcePaths[0]).length;
    expect(cHigh).toBeLessThanOrEqual(cLow);
  });

  test('preview(t=0) restores the original point count', () => {
    const { ctx, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(60, ctx);
    Ops.smoothPreview(0, ctx);
    expect(layer.sourcePaths[0].length).toBe(original[0].length);
  });

  test('scrubbing is lossless: t>0 then back to 0 restores the original geometry', () => {
    const { ctx, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(80, ctx);
    Ops.smoothPreview(0, ctx);
    expect(layer.sourcePaths[0].length).toBe(original[0].length);
    layer.sourcePaths[0].forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(original[0][i].x, 6);
      expect(pt.y).toBeCloseTo(original[0][i].y, 6);
    });
  });

  test('commit pushes exactly one history entry and clears the session', () => {
    const { ctx, app } = setup();
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(60, ctx);
    const before = app.pushCount;
    const res = Ops.smoothCommit(ctx);
    expect(res.committed).toBe(true);
    expect(app.pushCount).toBe(before + 1);
    expect(Ops.getSmoothState().active).toBe(false);
  });

  test('commit at t=0 is a cancel (no history, no change)', () => {
    const { ctx, app, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(0, ctx);
    const res = Ops.smoothCommit(ctx);
    expect(res.committed).toBe(false);
    expect(app.pushCount).toBe(0);
    expect(layer.sourcePaths[0].length).toBe(original[0].length);
  });

  test('closed shape stays a closed ring; fitted anchors carry handles', () => {
    const { ctx, layer } = setup(makeDenseCircle);
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(70, ctx);
    const p = layer.sourcePaths[0];
    expect(p.meta.closed).toBe(true);
    const anchors = anchorsOf(p);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    // Closed ring: every anchor (including the closure) is a smooth bezier point.
    expect(anchors.every((a) => a.in && a.out)).toBe(true);
  });

  test('open path keeps its endpoints as one-sided anchors (no outer handle)', () => {
    const { ctx, layer } = setup(makeOpenPath);
    Ops.smoothBegin(['L1'], ctx);
    Ops.smoothPreview(100, ctx);
    const anchors = anchorsOf(layer.sourcePaths[0]);
    expect(anchors.length).toBeGreaterThanOrEqual(2);
    // First endpoint has no incoming handle; last has no outgoing handle.
    expect(anchors[0].in).toBeNull();
    expect(anchors[anchors.length - 1].out).toBeNull();
  });
});
