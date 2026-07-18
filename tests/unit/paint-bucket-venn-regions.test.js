/**
 * @vitest-environment jsdom
 *
 * Venn faces in the paint-bucket fill ladder.
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
  p.push({ x: p[0].x, y: p[0].y }); // exactly closed
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

const contains = (poly, x, y) =>
  globalThis.Vectura.AlgorithmRegistry._polyContainsPoint(poly, x, y);

// Two overlapping r=50 circles: A at (110,110), B at (170,110).
// Lens spans x ∈ [120, 160]; lens center (140, 110).
const vennEngine = () => makeEngine([
  makeLayer('A', [circleRing(110, 110, 50)]),
  makeLayer('B', [circleRing(170, 110, 50)]),
]);

describe('paint-bucket venn faces (overlapping closed rings)', () => {
  it('offers the lens (A∩B) first at a point inside both circles', () => {
    const { stack } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(
      vennEngine(), 140, 110, { scope: 'all-objects', sensitivity: 5 }
    );
    const face = stack[0];
    expect(face.isDocBounds).toBe(false);
    // The lens is far smaller than a full circle (π·50² ≈ 7854).
    expect(face.area).toBeLessThan(3000);
    expect(face.area).toBeGreaterThan(500);
    expect(contains(face.polygon, 140, 110)).toBe(true);
    // Lune points are NOT part of the lens.
    expect(contains(face.polygon, 90, 110)).toBe(false);
    expect(contains(face.polygon, 190, 110)).toBe(false);
  });

  it('offers the lune (A\\B) first at a point inside only circle A', () => {
    const { stack } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(
      vennEngine(), 90, 110, { scope: 'all-objects', sensitivity: 5 }
    );
    const face = stack[0];
    expect(face.isDocBounds).toBe(false);
    expect(face.area).toBeLessThan(7500); // strictly smaller than the full disc
    expect(contains(face.polygon, 90, 110)).toBe(true);
    // The lens is carved OUT of the lune.
    expect(contains(face.polygon, 140, 110)).toBe(false);
  });

  it('scroll-out ladder still reaches both full circles, then their union, then doc bounds', () => {
    const { stack } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(
      vennEngine(), 140, 110, { scope: 'all-objects', sensitivity: 5 }
    );
    // Full-circle rungs survive (area ≈ π·50², sampled 64-gon slightly less).
    const fullCircles = stack.filter((e) => !e.isDocBounds && e.area > 7500 && e.area < 8200);
    expect(fullCircles.length).toBe(2);
    // A union rung sits between the circles and doc bounds.
    const unionIdx = stack.findIndex((e) => !e.isDocBounds && e.area > 8200);
    expect(unionIdx).toBeGreaterThan(-1);
    expect(contains(stack[unionIdx].polygon, 90, 110)).toBe(true);
    expect(contains(stack[unionIdx].polygon, 190, 110)).toBe(true);
    // Doc bounds is last, and after the union.
    expect(stack[stack.length - 1].isDocBounds).toBe(true);
    expect(unionIdx).toBeLessThan(stack.length - 1);
  });

  it('non-overlapping circles get no venn rungs', () => {
    const engine = makeEngine([
      makeLayer('A', [circleRing(80, 110, 50)]),
      makeLayer('B', [circleRing(300, 110, 50)]),
    ]);
    const { stack } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(
      engine, 80, 110, { scope: 'all-objects', sensitivity: 5 }
    );
    // Ladder is exactly: circle A, circle B, doc bounds — no boolean faces.
    expect(stack.length).toBe(3);
    expect(stack[0].area).toBeGreaterThan(7500);
    expect(stack[stack.length - 1].isDocBounds).toBe(true);
  });

  it('nested rings keep band behavior — no venn rungs for full containment', () => {
    const engine = makeEngine([
      makeLayer('outer', [circleRing(150, 110, 80)]),
      makeLayer('inner', [circleRing(150, 110, 30)]),
    ]);
    const { stack } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(
      engine, 150, 160, { scope: 'all-objects', sensitivity: 5 }
    );
    expect(stack.some((e) => String(e.loopId).startsWith('venn'))).toBe(false);
    // Band entry (outer with inner carved) still present.
    expect(stack.some((e) => e.innerPolygon)).toBe(true);
  });

  it('degrades to the classic ladder when FillBoolean is unavailable', () => {
    delete globalThis.Vectura.FillBoolean;
    if (typeof window !== 'undefined' && window.Vectura) delete window.Vectura.FillBoolean;
    const { stack } = globalThis.Vectura.PaintBucketOps.findFillTargetStack(
      vennEngine(), 140, 110, { scope: 'all-objects', sensitivity: 5 }
    );
    expect(stack.length).toBe(3);
    expect(stack[stack.length - 1].isDocBounds).toBe(true);
  });
});
