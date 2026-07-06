/*
 * PTH-1 — PathEditOps simplify session API (begin/preview/commit/cancel).
 * PTH-2 — autoSmooth() suggestion.
 *
 * Pure-core tests: fake engine + fake app (history spy). The module resolves
 * Vectura.GeometryUtils lazily from the shared root, so we stitch the
 * namespace together exactly like the browser IIFE load order does.
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
    // Identity transform (posX/posY 0, scale 1, rotation 0): world == source.
    layer.paths = cloneDeepPaths(layer.sourcePaths);
  },
  getLayerDescendants() {
    return [];
  },
});

const makeApp = (engine) => {
  const app = { engine, pushCount: 0 };
  app.pushHistory = () => {
    app.pushCount += 1;
  };
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

// Dense noisy open path: a straight-tagged polyline (flatten passthrough) with
// jitter, so simplification has real work to do and counts are predictable.
const makeNoisyPath = (n = 200) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: t * 100, y: Math.sin(t * Math.PI * 4) * 10 + ((i % 3) - 1) * 0.35 });
  }
  pts.meta = { straight: true, closed: false };
  return pts;
};

// Default-drawn rectangle: handle-less `meta.anchors`, NOT straight-tagged,
// in a curves:false layer — the renderer draws it SHARP (tracePath lineTo).
// A curves-blind flatten would midpoint-smooth its 4 corners into a blob.
const makeSharpRectPath = () => {
  const anchors = [
    { x: 0, y: 0, in: null, out: null },
    { x: 40, y: 0, in: null, out: null },
    { x: 40, y: 20, in: null, out: null },
    { x: 0, y: 20, in: null, out: null },
  ];
  const pts = geometry.buildPolylineFromAnchors(anchors, true).map((p) => ({ x: p.x, y: p.y }));
  pts.meta = { kind: 'shape', closed: true, anchors, shape: { type: 'rect', x1: 0, y1: 0, x2: 40, y2: 20, cornerRadii: [0, 0, 0, 0] } };
  return pts;
};

// Minimal path: 4 corners of a square, already straight — nothing removable.
const makeMinimalPath = () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  pts.meta = { straight: true, closed: false };
  return pts;
};

// A closed triangle stored as a straight polyline (3 corners + closing dup).
// Three hard corners → nothing removable (the "3 points does nothing" case).
const makeTrianglePath = () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 30, y: 50 },
    { x: 0, y: 0 },
  ];
  pts.meta = { straight: true, closed: true };
  return pts;
};

// An OPEN 4-point gentle arc (no sharp interior corners), so bezier fitting can
// collapse it to fewer anchors while holding the silhouette (the "four → three,
// leveraging beziers" case).
const makeGentleQuadPath = () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 4 },
    { x: 20, y: 4 },
    { x: 30, y: 0 },
  ];
  pts.meta = { straight: true, closed: false };
  return pts;
};

// Editable-anchor count under the renderer's semantics (meta.anchors when
// present, else polyline points with a closed path's duplicate vertex dropped).
const anchorCount = (path) => {
  const a = path && path.meta && path.meta.anchors;
  if (Array.isArray(a) && a.length >= 2) return a.length;
  const closed = !!(path.meta && path.meta.closed)
    || (path.length > 2 && Math.abs(path[0].x - path[path.length - 1].x) < 1e-6
      && Math.abs(path[0].y - path[path.length - 1].y) < 1e-6);
  return closed && path.length > 2 ? path.length - 1 : path.length;
};

const setup = (pathFactory = makeNoisyPath, layerPatch = {}) => {
  const engine = makeEngine();
  const app = makeApp(engine);
  const layer = makeShapeLayer('L1', [pathFactory()]);
  Object.assign(layer.params, layerPatch);
  engine.layers.push(layer);
  engine.generate(layer.id);
  return { engine, app, layer, ctx: { app, engine } };
};

const corners = (path) => [
  { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 },
].map((c) => path.some((pt) => Math.abs(pt.x - c.x) < 1e-6 && Math.abs(pt.y - c.y) < 1e-6));

afterEach(() => {
  // Never leak an active session between tests.
  Ops.simplifyCancel({});
});

// ---------------------------------------------------------------------------
// BLOCKING-1 regression: a default (curves:false) rect must NOT round its
// corners under simplify — flattenForEdit must mirror tracePath's curves-off
// (straight) branch, not midpoint-smooth handle-less anchors.
// ---------------------------------------------------------------------------

describe('PTH-1 preserves sharp corners of a curves:false rectangle', () => {
  test('simplify(t=5) keeps all four corners (no smoothing blob)', () => {
    const { ctx, layer } = setup(makeSharpRectPath, { curves: false });
    Ops.simplifyBegin([layer.id], ctx);
    const res = Ops.simplifyPreview(5, ctx);
    const path = layer.sourcePaths[0];
    // 5 points originally (4 corners + closing dup); a smoothing blob would be
    // dozens. Corners must survive.
    expect(path.length).toBeLessThanOrEqual(6);
    expect(corners(path)).toEqual([true, true, true, true]);
    expect(res.pointsAfter).toBeLessThanOrEqual(5);
  });

  test('simplify commit stays rectangular (Rectangle → Path stays sharp)', () => {
    const { ctx, layer } = setup(makeSharpRectPath, { curves: false });
    Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(5, ctx);
    Ops.simplifyCommit(ctx);
    const path = layer.sourcePaths[0];
    expect(corners(path)).toEqual([true, true, true, true]);
    expect(path.length).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// PTH-1 — simplify session
// ---------------------------------------------------------------------------

describe('PTH-1 simplifyBegin/Preview/Commit/Cancel', () => {
  test('simplifyBegin snapshots and reports pointsBefore', () => {
    const { ctx, layer } = setup();
    const res = Ops.simplifyBegin([layer.id], ctx);
    expect(res).toBeTruthy();
    expect(res.layerIds).toEqual([layer.id]);
    expect(res.pointsBefore).toBe(200);
  });

  test('simplifyBegin ignores ineligible layers and returns null when none eligible', () => {
    const engine = makeEngine();
    const app = makeApp(engine);
    engine.layers.push({ id: 'G', isGroup: true, type: 'group' });
    engine.layers.push({ id: 'F', isGroup: false, type: 'flowfield', params: {} });
    expect(Ops.simplifyBegin(['G', 'F'], { app, engine })).toBeNull();
  });

  test('preview(0) restores the exact original geometry (lossless scrub)', () => {
    const { ctx, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(65, ctx);
    expect(layer.sourcePaths[0].length).toBeLessThan(original[0].length);
    Ops.simplifyPreview(0, ctx);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(original);
  });

  test('preview is idempotent from the snapshot — never chained off a prior preview', () => {
    const { ctx, layer } = setup();
    Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(80, ctx);
    const first = cloneDeepPaths(layer.sourcePaths);
    Ops.simplifyPreview(5, ctx);
    Ops.simplifyPreview(100, ctx);
    Ops.simplifyPreview(80, ctx);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(first);
  });

  test('pointsAfter decreases monotonically with t on a dense path', () => {
    const { ctx, layer } = setup();
    Ops.simplifyBegin([layer.id], ctx);
    const counts = [10, 35, 60, 95].map((t) => Ops.simplifyPreview(t, ctx).pointsAfter);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
    expect(counts[counts.length - 1]).toBeLessThan(200);
  });

  test('commit bakes the preview as ONE history push; undo snapshot is pre-simplify', () => {
    const { ctx, app, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(70, ctx);
    const previewed = cloneDeepPaths(layer.sourcePaths);
    const res = Ops.simplifyCommit(ctx);
    expect(res.committed).toBe(true);
    expect(app.pushCount).toBe(1);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(previewed);
    expect(previewed).not.toEqual(original);
    // Session cleared
    expect(Ops.getSimplifyState().active).toBe(false);
  });

  test('commit at t=0 is a no-op: no history push, original untouched', () => {
    const { ctx, app, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(40, ctx);
    Ops.simplifyPreview(0, ctx);
    const res = Ops.simplifyCommit(ctx);
    expect(res.committed).toBe(false);
    expect(app.pushCount).toBe(0);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(original);
  });

  test('cancel restores the snapshot with no history push', () => {
    const { ctx, app, layer } = setup();
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(90, ctx);
    Ops.simplifyCancel(ctx);
    expect(app.pushCount).toBe(0);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(original);
    expect(Ops.getSimplifyState().active).toBe(false);
  });

  test('preview restores/zeroes params.smoothing so the shape rebuild cannot clobber it', () => {
    const { ctx, layer } = setup();
    layer.params.smoothing = 0.8;
    Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(50, ctx);
    expect(layer.params.smoothing).toBe(0);
    Ops.simplifyPreview(0, ctx);
    expect(layer.params.smoothing).toBe(0.8);
    Ops.simplifyCancel(ctx);
    expect(layer.params.smoothing).toBe(0.8);
  });
});

// ---------------------------------------------------------------------------
// PTH-1 — anchor-reduction ladder (complex → simple, bounded slider travel)
// ---------------------------------------------------------------------------

describe('PTH-1 reduction ladder: bounded travel + bezier-preserving reduction', () => {
  test('simplifyBegin reports maxSteps > 0 for a reducible path', () => {
    const { ctx, layer } = setup(makeNoisyPath);
    const res = Ops.simplifyBegin([layer.id], ctx);
    expect(Number.isInteger(res.maxSteps)).toBe(true);
    expect(res.maxSteps).toBeGreaterThan(0);
  });

  test('a triangle (3 corners) has nothing to simplify: maxSteps 0, slider cannot move', () => {
    const { ctx, layer } = setup(makeTrianglePath);
    const original = cloneDeepPaths(layer.sourcePaths);
    const res = Ops.simplifyBegin([layer.id], ctx);
    expect(res.maxSteps).toBe(0);
    // Any drag is clamped to rung 0 → the original, untouched.
    Ops.simplifyPreview(5, ctx);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(original);
    const commit = Ops.simplifyCommit(ctx);
    expect(commit.committed).toBe(false);
  });

  test('a curves:false rectangle (4 corners) also has nothing to simplify', () => {
    const { ctx, layer } = setup(makeSharpRectPath, { curves: false });
    const res = Ops.simplifyBegin([layer.id], ctx);
    expect(res.maxSteps).toBe(0);
  });

  test('a 4-point gentle curve reduces below 4 anchors, leveraging beziers', () => {
    const { ctx, layer } = setup(makeGentleQuadPath);
    const res = Ops.simplifyBegin([layer.id], ctx);
    expect(res.maxSteps).toBeGreaterThanOrEqual(1);
    const preview = Ops.simplifyPreview(res.maxSteps, ctx);
    const path = layer.sourcePaths[0];
    // Endpoints were removed (4 → 3 or fewer) and the reduced outline is a
    // true-curve (forceCurves) bezier path, not a stair-stepped polyline.
    expect(anchorCount(path)).toBeLessThan(4);
    expect(preview.pointsAfter).toBeLessThan(preview.pointsBefore);
    expect(path.meta.forceCurves).toBe(true);
    expect(Array.isArray(path.meta.anchors)).toBe(true);
  });

  test('preview clamps the rung index to maxSteps (no travel past the minimum)', () => {
    const { ctx, layer } = setup(makeNoisyPath);
    const { maxSteps } = Ops.simplifyBegin([layer.id], ctx);
    Ops.simplifyPreview(maxSteps, ctx);
    const atMax = cloneDeepPaths(layer.sourcePaths);
    Ops.simplifyPreview(maxSteps + 500, ctx);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(atMax);
    expect(Ops.getSimplifyState().index).toBe(maxSteps);
  });

  test('anchor count is monotonic non-increasing from complex (0) to simple (maxSteps)', () => {
    const { ctx, layer } = setup(makeNoisyPath);
    const { maxSteps } = Ops.simplifyBegin([layer.id], ctx);
    const samples = [0, Math.round(maxSteps / 3), Math.round((2 * maxSteps) / 3), maxSteps];
    const counts = samples.map((i) => Ops.simplifyPreview(i, ctx).pointsAfter);
    for (let k = 1; k < counts.length; k += 1) {
      expect(counts[k]).toBeLessThanOrEqual(counts[k - 1]);
    }
    expect(counts[0]).toBe(200); // rung 0 = the untouched original
    expect(counts[counts.length - 1]).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// PTH-2 — autoSmooth
// ---------------------------------------------------------------------------

describe('PTH-2 autoSmooth', () => {
  test('returns 0 for an already-minimal path', () => {
    const { ctx, layer } = setup(makeMinimalPath);
    expect(Ops.autoSmooth([layer.id], ctx)).toBe(0);
  });

  test('returns t > 0 for a noisy path', () => {
    const { ctx, layer } = setup(makeNoisyPath);
    const t = Ops.autoSmooth([layer.id], ctx);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(100);
  });

  test('does not mutate geometry or push history', () => {
    const { ctx, app, layer } = setup(makeNoisyPath);
    const original = cloneDeepPaths(layer.sourcePaths);
    Ops.autoSmooth([layer.id], ctx);
    expect(cloneDeepPaths(layer.sourcePaths)).toEqual(original);
    expect(app.pushCount).toBe(0);
  });
});
