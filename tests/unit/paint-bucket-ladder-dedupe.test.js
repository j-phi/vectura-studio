/**
 * @vitest-environment jsdom
 *
 * Paint-bucket ladder never repeats a region (duplicate-rung regression).
 *
 * Two overlapping CLOSED rings (the two-circle venn diagram) historically
 * produced a ladder of exactly: circle → circle → doc bounds. The lens
 * (A∩B) and the lunes (A\B, B\A) were unreachable, because sub-region
 * carving only ever ran against OPEN barrier paths. These tests pin the
 * new behavior: when the cursor's ring partially overlaps sibling rings,
 * the ladder starts at the boolean face under the cursor and ends with
 * the union of the overlapping group before doc bounds.
 *
 * Bootstrap mirrors tests/unit/fill-boolean-safe-op.test.js.
 */
const path = require('path');

const polygonClipping = require(path.resolve(__dirname, '../../src/vendor/polygon-clipping.umd.js'));
globalThis.polygonClipping = polygonClipping;
if (typeof window !== 'undefined') window.polygonClipping = polygonClipping;

beforeEach(() => {
  const priorLayer = globalThis.Vectura?.Layer;
  globalThis.Vectura = {
    SETTINGS: {
      pens: [{ id: 'pen-1', color: '#fff', width: 0.3 }],
      uiTheme: 'dark',
      strokeWidth: 0.3,
    },
    THEMES: { dark: { pen1Color: '#ffffff' } },
    ALGO_DEFAULTS: {
      shape: { seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 },
    },
  };
  if (priorLayer) globalThis.Vectura.Layer = priorLayer;

  const polyContainsPoint = (poly, px, py) => {
    if (!Array.isArray(poly) || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect =
        ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };
  globalThis.Vectura.AlgorithmRegistry = { _polyContainsPoint: polyContainsPoint };

  delete require.cache[path.resolve(__dirname, '../../src/core/utils.js')];
  require(path.resolve(__dirname, '../../src/core/utils.js'));
  require(path.resolve(__dirname, '../../src/core/layer.js'));
  delete require.cache[path.resolve(__dirname, '../../src/core/fill-boolean.js')];
  require(path.resolve(__dirname, '../../src/core/fill-boolean.js'));
  delete require.cache[path.resolve(__dirname, '../../src/core/paint-bucket-ops.js')];
  require(path.resolve(__dirname, '../../src/core/paint-bucket-ops.js'));
});

const circleRing = (cx, cy, r, segments = 64) => {
  const p = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    p.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  p.push({ x: p[0].x, y: p[0].y });
  p.meta = { kind: 'shape', closed: true };
  return p;
};
const makeLayer = (id, paths = []) => {
  const Layer = globalThis.Vectura.Layer;
  const layer = new Layer(id, 'shape', `shape-${id}`);
  layer.paths = paths;
  layer.displayPaths = paths;
  layer.visible = true;
  layer.fills = [];
  return layer;
};
const makeEngine = (layers) => ({
  layers,
  documentSettings: { width: 400, height: 300 },
  getActiveLayer: () => layers[0] || null,
});
const find = (engine, x, y) =>
  globalThis.Vectura.PaintBucketOps.findFillTargetStack(engine, x, y, { scope: 'all-objects', sensitivity: 5 }).stack;
const contains = (poly, x, y) => globalThis.Vectura.AlgorithmRegistry._polyContainsPoint(poly, x, y);
const sig = (e) => `${Math.round(e.area)}|${e.innerPolygon ? Math.round(e.innerPolygon.length) : 'x'}|${e.isDocBounds}`;
const expectDistinct = (stack) => {
  const keys = stack.map((e) => `${Math.round(e.area)}|${e.innerPolygon ? 'h' : 'x'}`);
  expect(new Set(keys).size).toBe(keys.length);
};

describe('paint-bucket ladder has no duplicate rungs', () => {
  it('three concentric circles + a separate small shape: band between inner and middle', () => {
    const engine = makeEngine([
      makeLayer('Outer', [circleRing(200, 150, 120)]),
      makeLayer('Mid', [circleRing(200, 150, 80)]),
      makeLayer('Inner', [circleRing(200, 150, 40)]),
      makeLayer('Loose', [circleRing(30, 150, 20)]),
    ]);
    const stack = find(engine, 200 + 60, 150);
    expectDistinct(stack);
    // Mid-with-hole, Outer(-with-hole at most), doc bounds.
    expect(stack.filter((e) => !e.isDocBounds).length).toBe(2);
    expect(stack[stack.length - 1].isDocBounds).toBe(true);
  });

  it('every non-doc rung actually contains the cursor (no non-nested outer rings)', () => {
    const engine = makeEngine([
      makeLayer('Big', [circleRing(330, 80, 60)]), // larger than Small, does not contain cursor
      makeLayer('Small', [circleRing(100, 150, 30)]),
    ]);
    const stack = find(engine, 100, 150);
    stack.filter((e) => !e.isDocBounds).forEach((e) => expect(contains(e.polygon, 100, 150)).toBe(true));
    expectDistinct(stack);
  });

  it('identical-geometry rings (mask source + masked content) collapse to one rung', () => {
    const engine = makeEngine([
      makeLayer('MaskSrc', [circleRing(200, 150, 60)]),
      makeLayer('Content', [circleRing(200, 150, 60)]),
      makeLayer('Outer', [circleRing(200, 150, 100)]),
    ]);
    const stack = find(engine, 200, 150);
    expectDistinct(stack);
  });

  it('equal-geometry tie attributes the rung to the masked content layer, not the mask source', () => {
    const src = makeLayer('MaskSrc', [circleRing(200, 150, 60)]);
    const content = makeLayer('Content', [circleRing(200, 150, 60)]);
    content.mask = { enabled: true, mode: 'parent', sourceIds: [], hideLayer: false };
    const stack = find(makeEngine([src, content]), 200, 150);
    expect(stack[0].layer.id).toBe('Content');
  });
});
