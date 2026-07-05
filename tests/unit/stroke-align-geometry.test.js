/*
 * STR-4 — Align Stroke (center / inside / outside).
 *
 * Inside/outside offsets the rendered stroke centerline by ±weight/2 along
 * the path normal for CLOSED paths, as a display-geometry transform
 * recomputed on commit (computeAllDisplayGeometry), using the robust
 * closed-outline machinery (GeometryUtils.miterOffsetClosedRing — the
 * concentric-band engine), never the collapse-prone parallel-pass
 * thickenPaths.
 *
 * In-lane gating decision: the offset applies per-path to closed subpaths
 * only; open paths always render centered. A degenerate or winding-inverted
 * offset (stroke consumed the shape) falls back to the centered geometry.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../..');

const TAU = Math.PI * 2;

const circleRing = (cx, cy, r, segments = 96) => {
  const pts = [];
  for (let i = 0; i < segments; i += 1) {
    const t = (i / segments) * TAU;
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  pts.push({ x: pts[0].x, y: pts[0].y });
  return pts;
};

const radiusStats = (ring, cx, cy) => {
  let min = Infinity;
  let max = -Infinity;
  ring.forEach((pt) => {
    const r = Math.hypot(pt.x - cx, pt.y - cy);
    if (r < min) min = r;
    if (r > max) max = r;
  });
  return { min, max };
};

describe('STR-4 align stroke display-geometry transform', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    runtime.window.eval(
      fs.readFileSync(path.join(ROOT, 'src/config/stroke-options.js'), 'utf8')
    );
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeLayerWithPaths = (paths, { strokeWidth = 2, strokeAlign = 'center', curves = false } = {}) => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('lissajous');
    const layer = engine.getLayerById(id);
    layer.params.curves = curves;
    layer.paths = paths;
    layer.strokeWidth = strokeWidth;
    layer.strokeAlign = strokeAlign;
    engine.computeAllDisplayGeometry();
    return { engine, layer };
  };

  test('outside align pushes a closed circle out by weight/2', () => {
    const { layer } = makeLayerWithPaths([circleRing(95, 75, 30)], {
      strokeWidth: 2,
      strokeAlign: 'outside',
    });
    const ring = layer.displayPaths[0];
    const { min, max } = radiusStats(ring, 95, 75);
    expect(min).toBeGreaterThan(30.9);
    expect(max).toBeLessThan(31.1);
  });

  test('inside align pulls a closed circle in by weight/2', () => {
    const { layer } = makeLayerWithPaths([circleRing(95, 75, 30)], {
      strokeWidth: 2,
      strokeAlign: 'inside',
    });
    const ring = layer.displayPaths[0];
    const { min, max } = radiusStats(ring, 95, 75);
    expect(min).toBeGreaterThan(28.9);
    expect(max).toBeLessThan(29.1);
  });

  test('center align leaves geometry untouched', () => {
    const source = circleRing(95, 75, 30);
    const { layer } = makeLayerWithPaths([source], {
      strokeWidth: 2,
      strokeAlign: 'center',
    });
    const ring = layer.displayPaths[0];
    const { min, max } = radiusStats(ring, 95, 75);
    expect(min).toBeCloseTo(30, 6);
    expect(max).toBeCloseTo(30, 6);
  });

  test('open paths always stay centered (closed-only gate)', () => {
    const open = [
      { x: 20, y: 20 },
      { x: 60, y: 20 },
      { x: 60, y: 60 },
    ];
    const { layer } = makeLayerWithPaths([open.map((pt) => ({ ...pt }))], {
      strokeWidth: 4,
      strokeAlign: 'outside',
    });
    expect(layer.displayPaths[0].map(({ x, y }) => ({ x, y }))).toEqual(open);
  });

  test('winding orientation does not matter (CW ring offsets the same)', () => {
    const cw = circleRing(95, 75, 30).slice().reverse();
    const { layer } = makeLayerWithPaths([cw], {
      strokeWidth: 2,
      strokeAlign: 'outside',
    });
    const { min, max } = radiusStats(layer.displayPaths[0], 95, 75);
    expect(min).toBeGreaterThan(30.9);
    expect(max).toBeLessThan(31.1);
  });

  test('inward collapse falls back to centered geometry instead of inverting', () => {
    const tiny = circleRing(95, 75, 3);
    const { layer } = makeLayerWithPaths([tiny], {
      strokeWidth: 20, // half-width 10 > radius 3 → inside offset would invert
      strokeAlign: 'inside',
    });
    const { min, max } = radiusStats(layer.displayPaths[0], 95, 75);
    expect(min).toBeCloseTo(3, 4);
    expect(max).toBeCloseTo(3, 4);
  });

  test('parametric circle paths (meta.kind circle) offset their radius', () => {
    const parametric = [];
    parametric.meta = { kind: 'circle', cx: 95, cy: 75, r: 30 };
    const { layer } = makeLayerWithPaths([parametric], {
      strokeWidth: 2,
      strokeAlign: 'outside',
    });
    const ring = layer.displayPaths[0];
    expect(ring.meta.kind).toBe('circle');
    expect(ring.meta.r).toBeCloseTo(31, 6);
  });

  test('curve-smoothed closed paths flatten before offsetting (no raw-polyline clip)', () => {
    // Sparse closed diamond rendered smoothed: the offset must run on the
    // flattened curve, so the result is denser than the 5-point source and
    // sits outside it.
    const diamond = [
      { x: 95, y: 45 },
      { x: 125, y: 75 },
      { x: 95, y: 105 },
      { x: 65, y: 75 },
      { x: 95, y: 45 },
    ];
    const { layer } = makeLayerWithPaths([diamond], {
      strokeWidth: 2,
      strokeAlign: 'outside',
      curves: true,
    });
    const ring = layer.displayPaths[0];
    expect(ring.length).toBeGreaterThan(diamond.length);
    // The offset must run on the FLATTENED smoothed curve: its max radius is
    // the flattened curve's max radius + weight/2 (≈ +1). Offsetting the raw
    // 5-point control polygon instead would land at ~31 (diamond apex + 1).
    const flat = runtime.window.Vectura.GeometryUtils.flattenSmoothedPath(
      diamond.map((pt) => ({ ...pt }))
    );
    const flatMax = radiusStats(flat, 95, 75).max;
    const { max } = radiusStats(ring, 95, 75);
    expect(max).toBeGreaterThan(flatMax + 0.8);
    expect(max).toBeLessThan(flatMax + 1.2);
    expect(ring.meta?.straight).toBe(true);
  });

  test('align recomputes from source on every commit (no cumulative drift)', () => {
    const { engine, layer } = makeLayerWithPaths([circleRing(95, 75, 30)], {
      strokeWidth: 2,
      strokeAlign: 'outside',
    });
    engine.computeAllDisplayGeometry();
    engine.computeAllDisplayGeometry();
    const { min, max } = radiusStats(layer.displayPaths[0], 95, 75);
    expect(min).toBeGreaterThan(30.9);
    expect(max).toBeLessThan(31.1);
  });
});
