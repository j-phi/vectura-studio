/*
 * PTH-3 — PathEditOps.smoothSelection(layerIds, strength): one-shot undoable
 * smoothing verb over the existing geometry-utils smoothing pipeline.
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

// Jagged sawtooth path (straight-tagged so it flattens verbatim).
const makeJaggedPath = (n = 80) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: i * 2, y: (i % 2) * 8 });
  }
  pts.meta = { straight: true, closed: false };
  return pts;
};

// Variance of interior turning angles — the jaggedness metric of PTH-3.
const angleVariance = (p) => {
  const angles = [];
  for (let i = 1; i < p.length - 1; i++) {
    const a1 = Math.atan2(p[i].y - p[i - 1].y, p[i].x - p[i - 1].x);
    const a2 = Math.atan2(p[i + 1].y - p[i].y, p[i + 1].x - p[i].x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    angles.push(d);
  }
  const mean = angles.reduce((s, a) => s + a, 0) / angles.length;
  return angles.reduce((s, a) => s + (a - mean) * (a - mean), 0) / angles.length;
};

const setup = () => {
  const engine = makeEngine();
  const app = makeApp(engine);
  const layer = makeShapeLayer('S1', [makeJaggedPath()]);
  engine.layers.push(layer);
  engine.generate(layer.id);
  return { engine, app, layer, ctx: { app, engine } };
};

describe('PTH-3 smoothSelection', () => {
  test('reduces turning-angle variance on a jagged path', () => {
    const { ctx, layer } = setup();
    const before = angleVariance(layer.sourcePaths[0]);
    const res = Ops.smoothSelection([layer.id], 0.8, ctx);
    expect(res.changed).toBe(true);
    const after = angleVariance(layer.sourcePaths[0]);
    expect(after).toBeLessThan(before);
  });

  test('pushes exactly one history entry (undoable one-shot verb)', () => {
    const { ctx, app, layer } = setup();
    Ops.smoothSelection([layer.id], 0.5, ctx);
    expect(app.pushCount).toBe(1);
  });

  test('strength 0 or no eligible layers is a no-op with no history push', () => {
    const { ctx, app, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    expect(Ops.smoothSelection([layer.id], 0, ctx).changed).toBe(false);
    expect(Ops.smoothSelection(['nope'], 0.7, ctx).changed).toBe(false);
    expect(app.pushCount).toBe(0);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(original);
  });

  test('clears the stale smoothing baseline so a later regen cannot clobber it', () => {
    const { ctx, layer } = setup();
    layer.params.smoothing = 0.9;
    layer.sourcePaths[0].meta.originalAnchors = [{ x: 0, y: 0, in: null, out: null }];
    Ops.smoothSelection([layer.id], 0.6, ctx);
    expect(layer.params.smoothing).toBe(0);
    expect(layer.params.simplify).toBe(0);
    expect(layer.sourcePaths[0].meta.originalAnchors).toBeUndefined();
  });
});
