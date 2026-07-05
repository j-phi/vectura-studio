/*
 * SEL-3 — PathEditOps.flipLayers(layerIds, axis): mirror the selection about
 * its world bounds center. Shape/path layers bake reflected geometry (curves
 * flattened first); generative layers flip via transform-param scale negation
 * so regeneration preserves the mirror. flip-twice restores within epsilon.
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

const bbox = (paths) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  paths.forEach((p) => p.forEach((pt) => {
    minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
  }));
  return { minX, minY, maxX, maxY };
};

// Fake engine that applies the SAME transform engine.generate() does: origin
// = source bbox center, then scaleX/scaleY, then posX/posY (no rotation in the
// fixtures). Generative layers keep their fixed raw paths.
const makeEngine = () => ({
  layers: [],
  generate(id) {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    const p = layer.params;
    const raw = layer.type === 'shape' ? layer.sourcePaths : layer._rawPaths;
    if (!raw) return;
    // origin = raw bbox center
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    raw.forEach((path) => path.forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }));
    const origin = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    layer.origin = origin;
    // Mirror engine.transform exactly: (p-origin)·scale, rotate, +origin +pos.
    const rot = ((p.rotation ?? 0) * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    layer.paths = raw.map((path) => {
      const out = path.map((pt) => {
        const x0 = (pt.x - origin.x) * p.scaleX;
        const y0 = (pt.y - origin.y) * p.scaleY;
        return {
          x: x0 * cosR - y0 * sinR + origin.x + p.posX,
          y: x0 * sinR + y0 * cosR + origin.y + p.posY,
        };
      });
      if (path.meta) out.meta = JSON.parse(JSON.stringify(path.meta));
      return out;
    });
  },
});

const makeApp = (engine) => {
  const app = { engine, pushCount: 0 };
  app.pushHistory = () => { app.pushCount += 1; };
  return app;
};

const baseParams = () => ({ posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 });

const makeShapeLayer = (id, pts, offset = { x: 0, y: 0 }) => {
  const src = pts.map((pt) => ({ x: pt.x, y: pt.y }));
  src.meta = { kind: 'poly', closed: false, straight: true };
  const layer = {
    id, name: id, type: 'shape', isGroup: false, visible: true,
    params: { ...baseParams(), posX: offset.x, posY: offset.y },
    origin: { x: 0, y: 0 }, sourcePaths: [src], paths: [], fills: [],
  };
  return layer;
};

const makeGenerativeLayer = (id, pts, offset = { x: 0, y: 0 }) => {
  const raw = pts.map((pt) => ({ x: pt.x, y: pt.y }));
  const layer = {
    id, name: id, type: 'flowfield', isGroup: false, visible: true,
    params: { ...baseParams(), posX: offset.x, posY: offset.y },
    origin: { x: 0, y: 0 }, _rawPaths: [raw], paths: [], fills: [],
  };
  return layer;
};

const setup = (layers) => {
  const engine = makeEngine();
  const app = makeApp(engine);
  layers.forEach((l) => { engine.layers.push(l); engine.generate(l.id); });
  return { engine, app, ctx: { app, engine } };
};

// L-shaped asymmetric polyline so a mirror is detectable.
const LSHAPE = [
  { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 },
];

describe('SEL-3 flipLayers — shape layer (geometry bake)', () => {
  test('horizontal flip mirrors world X about the layer center; Y unchanged', () => {
    const layer = makeShapeLayer('S', LSHAPE);
    const { ctx } = setup([layer]);
    const worldBefore = cloneDeepPaths(layer.paths);
    const center = (worldBefore[0].reduce((s, p) => s + p.x, 0) / worldBefore[0].length);
    const bb = bbox(worldBefore);
    const cx = (bb.minX + bb.maxX) / 2;

    const res = Ops.flipLayers(['S'], 'horizontal', ctx);
    expect(res.changed).toBe(true);
    const worldAfter = layer.paths;
    worldAfter[0].forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(2 * cx - worldBefore[0][i].x, 6);
      expect(pt.y).toBeCloseTo(worldBefore[0][i].y, 6);
    });
    void center;
  });

  test('vertical flip mirrors world Y; X unchanged', () => {
    const layer = makeShapeLayer('S', LSHAPE);
    const { ctx } = setup([layer]);
    const before = cloneDeepPaths(layer.paths);
    const bb = bbox(before);
    const cy = (bb.minY + bb.maxY) / 2;
    Ops.flipLayers(['S'], 'vertical', ctx);
    layer.paths[0].forEach((pt, i) => {
      expect(pt.y).toBeCloseTo(2 * cy - before[0][i].y, 6);
      expect(pt.x).toBeCloseTo(before[0][i].x, 6);
    });
  });

  test('flip twice restores original geometry within epsilon', () => {
    const layer = makeShapeLayer('S', LSHAPE);
    const { ctx } = setup([layer]);
    const before = cloneDeepPaths(layer.paths);
    Ops.flipLayers(['S'], 'horizontal', ctx);
    Ops.flipLayers(['S'], 'horizontal', ctx);
    layer.paths[0].forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(before[0][i].x, 6);
      expect(pt.y).toBeCloseTo(before[0][i].y, 6);
    });
  });

  test('pushes exactly one history entry', () => {
    const layer = makeShapeLayer('S', LSHAPE);
    const { ctx, app } = setup([layer]);
    Ops.flipLayers(['S'], 'horizontal', ctx);
    expect(app.pushCount).toBe(1);
  });
});

describe('SEL-3 flipLayers — generative layer (scale negation)', () => {
  test('horizontal flip negates scaleX (regeneration preserves mirror)', () => {
    const layer = makeGenerativeLayer('G', LSHAPE);
    const { ctx } = setup([layer]);
    const before = cloneDeepPaths(layer.paths);
    const bb = bbox(before);
    const cx = (bb.minX + bb.maxX) / 2;
    Ops.flipLayers(['G'], 'horizontal', ctx);
    expect(layer.params.scaleX).toBe(-1);
    layer.paths[0].forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(2 * cx - before[0][i].x, 6);
    });
  });

  test('vertical flip negates scaleY', () => {
    const layer = makeGenerativeLayer('G', LSHAPE);
    const { ctx } = setup([layer]);
    Ops.flipLayers(['G'], 'vertical', ctx);
    expect(layer.params.scaleY).toBe(-1);
  });

  test('flip twice restores scaleX and geometry', () => {
    const layer = makeGenerativeLayer('G', LSHAPE);
    const { ctx } = setup([layer]);
    const before = cloneDeepPaths(layer.paths);
    Ops.flipLayers(['G'], 'horizontal', ctx);
    Ops.flipLayers(['G'], 'horizontal', ctx);
    expect(layer.params.scaleX).toBe(1);
    layer.paths[0].forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(before[0][i].x, 6);
    });
  });
});

describe('SEL-3 flipLayers — multi-select about the shared center', () => {
  test('two layers mirror about the SELECTION bounds center, not their own', () => {
    const a = makeShapeLayer('A', LSHAPE, { x: 0, y: 0 });
    const b = makeGenerativeLayer('B', LSHAPE, { x: 100, y: 0 });
    const { ctx } = setup([a, b]);
    const worldA = cloneDeepPaths(a.paths);
    const worldB = cloneDeepPaths(b.paths);
    const bb = bbox([...worldA, ...worldB]);
    const cx = (bb.minX + bb.maxX) / 2;

    Ops.flipLayers(['A', 'B'], 'horizontal', ctx);

    a.paths[0].forEach((pt, i) => expect(pt.x).toBeCloseTo(2 * cx - worldA[0][i].x, 5));
    b.paths[0].forEach((pt, i) => expect(pt.x).toBeCloseTo(2 * cx - worldB[0][i].x, 5));
  });

  test('multi-select flip twice restores both layers', () => {
    const a = makeShapeLayer('A', LSHAPE, { x: 0, y: 0 });
    const b = makeGenerativeLayer('B', LSHAPE, { x: 100, y: 0 });
    const { ctx } = setup([a, b]);
    const worldA = cloneDeepPaths(a.paths);
    const worldB = cloneDeepPaths(b.paths);
    Ops.flipLayers(['A', 'B'], 'horizontal', ctx);
    Ops.flipLayers(['A', 'B'], 'horizontal', ctx);
    a.paths[0].forEach((pt, i) => expect(pt.x).toBeCloseTo(worldA[0][i].x, 5));
    b.paths[0].forEach((pt, i) => expect(pt.x).toBeCloseTo(worldB[0][i].x, 5));
  });
});

// A curves:false rect stored as handle-less anchors (drawn SHARP).
const makeSharpRectLayer = (id, offset = { x: 0, y: 0 }, rotationDeg = 0) => {
  const anchors = [
    { x: 0, y: 0, in: null, out: null },
    { x: 40, y: 0, in: null, out: null },
    { x: 40, y: 20, in: null, out: null },
    { x: 0, y: 20, in: null, out: null },
  ];
  const src = geometry.buildPolylineFromAnchors(anchors, true).map((p) => ({ x: p.x, y: p.y }));
  src.meta = { kind: 'shape', closed: true, anchors, shape: { type: 'rect', x1: 0, y1: 0, x2: 40, y2: 20, cornerRadii: [0, 0, 0, 0] } };
  return {
    id, name: id, type: 'shape', isGroup: false, visible: true,
    params: { ...baseParams(), curves: false, posX: offset.x, posY: offset.y, rotation: rotationDeg },
    origin: { x: 0, y: 0 }, sourcePaths: [src], paths: [], fills: [],
  };
};

// BLOCKING-1 regression under flip.
describe('SEL-3 flipLayers preserves sharp rectangle corners', () => {
  const worldCorner = (path, x, y) =>
    path.some((pt) => Math.abs(pt.x - x) < 1e-4 && Math.abs(pt.y - y) < 1e-4);

  test('flipping a curves:false rect keeps its 4 corners sharp (no blob)', () => {
    const layer = makeSharpRectLayer('R');
    const { ctx } = setup([layer]);
    Ops.flipLayers(['R'], 'horizontal', ctx);
    const p = layer.paths[0];
    // 5 world points (4 corners + closing dup); a smoothing blob would be dozens.
    expect(p.length).toBeLessThanOrEqual(6);
    // Mirror about the rect's own center (x=20): corners land at x=40 and x=0.
    expect(worldCorner(p, 40, 0)).toBe(true);
    expect(worldCorner(p, 0, 0)).toBe(true);
    expect(worldCorner(p, 40, 20)).toBe(true);
    expect(worldCorner(p, 0, 20)).toBe(true);
  });
});

// BLOCKING-2 regression: rotated flip must be self-inverse.
describe('SEL-3 flipLayers — rotated shapes are self-inverse (world-exact)', () => {
  [15, 37, 120].forEach((deg) => {
    test(`shape rotated ${deg}° flips twice back to the original within epsilon`, () => {
      const layer = makeSharpRectLayer('R', { x: 30, y: 12 }, deg);
      const { ctx } = setup([layer]);
      const before = cloneDeepPaths(layer.paths);
      Ops.flipLayers(['R'], 'horizontal', ctx);
      Ops.flipLayers(['R'], 'horizontal', ctx);
      layer.paths[0].forEach((pt, i) => {
        expect(pt.x).toBeCloseTo(before[0][i].x, 4);
        expect(pt.y).toBeCloseTo(before[0][i].y, 4);
      });
    });

    test(`generative rotated ${deg}° flips twice back within epsilon`, () => {
      const layer = makeGenerativeLayer('G', LSHAPE, { x: 30, y: 12 });
      layer.params.rotation = deg;
      const { ctx } = setup([layer]);
      const before = cloneDeepPaths(layer.paths);
      Ops.flipLayers(['G'], 'vertical', ctx);
      Ops.flipLayers(['G'], 'vertical', ctx);
      layer.paths[0].forEach((pt, i) => {
        expect(pt.x).toBeCloseTo(before[0][i].x, 4);
        expect(pt.y).toBeCloseTo(before[0][i].y, 4);
      });
    });
  });

  test('rotated shape flip is a true world mirror about the selection center', () => {
    const layer = makeSharpRectLayer('R', { x: 30, y: 12 }, 25);
    const { ctx } = setup([layer]);
    const before = cloneDeepPaths(layer.paths);
    let minX = Infinity, maxX = -Infinity;
    before[0].forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); });
    const cx = (minX + maxX) / 2;
    Ops.flipLayers(['R'], 'horizontal', ctx);
    layer.paths[0].forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(2 * cx - before[0][i].x, 4);
      expect(pt.y).toBeCloseTo(before[0][i].y, 4);
    });
  });
});

describe('SEL-3 flipLayers — guards', () => {
  test('bad axis or empty selection is a no-op with no history push', () => {
    const layer = makeShapeLayer('S', LSHAPE);
    const { ctx, app } = setup([layer]);
    expect(Ops.flipLayers(['S'], 'diagonal', ctx).changed).toBe(false);
    expect(Ops.flipLayers([], 'horizontal', ctx).changed).toBe(false);
    expect(app.pushCount).toBe(0);
  });
});
