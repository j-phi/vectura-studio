const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Regression: the morph Corner Match in-between rings are smooth SPARSE bezier
 * curves by construction, but they live in a GROUP layer whose `curves` param
 * defaults to false. The renderer's tracePath only emitted the stored cubic
 * anchors when the layer had curves ON, so the rings were drawn as their raw
 * few-point flattened polyline — visibly faceted ("excessive line segments")
 * even though the geometry was smooth.
 *
 * Fix: the morph stamps `meta.forceCurves = true` on each corner-matched ring,
 * and tracePath honors `meta.forceCurves` as a per-path opt-in (mirroring the
 * existing `meta.straight` force-straight flag) so the ring renders as native
 * cubics regardless of the owning layer's curves setting.
 *
 * Two locks:
 *  1. Engine: a circle->sharp-hexagon morph ring carries meta.forceCurves + the
 *     bezier handles needed to draw it smooth.
 *  2. Renderer: tracePath draws those anchors with bezierCurveTo when
 *     forceCurves is set even though useCurves is false; and a plain handle-less
 *     polyline with forceCurves still falls back to straight segments.
 */
describe('morph render — corner-matched rings draw as curves with group curves OFF', () => {
  let runtime;
  let M;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    if (!runtime.window.Vectura.Modifiers.applyMorphModifierToPaths) {
      const code = fs.readFileSync(path.resolve(__dirname, '../../src/core/morph-modifier.js'), 'utf8');
      const sandbox = { window: runtime.window, document: runtime.window.document };
      sandbox.global = sandbox; sandbox.globalThis = sandbox;
      vm.runInContext(code, vm.createContext(sandbox), { filename: 'morph-modifier.js' });
    }
    M = runtime.window.Vectura.Modifiers;
  });

  afterAll(() => runtime.cleanup());

  // Sharp hexagon (null handles) as an anchored 'shape', and a circle.
  const polyPath = (cx, cy, R, sides, rot) => {
    const anchors = [];
    for (let k = 0; k < sides; k += 1) {
      const a = rot + (k / sides) * Math.PI * 2;
      anchors.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), in: null, out: null });
    }
    const pts = anchors.map((a) => ({ x: a.x, y: a.y }));
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { kind: 'shape', closed: true, anchors };
    return pts;
  };
  const circlePath = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 48; i += 1) { const a = (i / 48) * Math.PI * 2; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    pts.push({ x: pts[0].x, y: pts[0].y });
    pts.meta = { kind: 'circle', cx, cy, r, closed: true };
    return pts;
  };
  const child = (p) => ({ outline: [p], fillPaths: [], fills: [], penId: null });

  const rings = () => {
    const mod = { type: 'morph', enabled: true, steps: 6, easing: 'linear', emitSources: false, closureMode: 'auto', fillMode: 'off', multiPathStrategy: 'merge-centroid', correspondenceMode: 'centroid-angle', resampleCount: 128 };
    const out = M.applyMorphModifierToPaths([child(polyPath(700, 300, 80, 6, 0)), child(circlePath(250, 300, 80))], mod, null);
    return out.filter((p) => !(p.meta && (p.meta.morphFill || p.meta.paintBucketFillId)));
  };

  test('RC-01: every corner-matched ring carries meta.forceCurves with bezier handles', () => {
    const all = rings();
    expect(all.length).toBe(6);
    all.forEach((ring) => {
      expect(ring.meta && ring.meta.forceCurves).toBe(true);
      expect(Array.isArray(ring.meta.anchors)).toBe(true);
    });
    // A near-circle ring (later step) must actually carry handles to draw smooth.
    const last = all[all.length - 1];
    const hasHandles = last.meta.anchors.some((a) => a.in || a.out);
    expect(hasHandles).toBe(true);
  });

  // Recording 2D context — captures which path ops tracePath emits.
  const recordingCtx = () => {
    const ops = [];
    return {
      ops,
      moveTo: () => ops.push('moveTo'),
      lineTo: () => ops.push('lineTo'),
      bezierCurveTo: () => ops.push('bezierCurveTo'),
      quadraticCurveTo: () => ops.push('quadraticCurveTo'),
    };
  };

  const makeRenderer = () => {
    const { Renderer, VectorEngine } = runtime.window.Vectura;
    const r = new Renderer('main-canvas', new VectorEngine());
    return r;
  };

  test('RC-02: tracePath draws a forceCurves ring as cubics even when useCurves is false', () => {
    const ring = rings().find((rg) => rg.meta.anchors.some((a) => a.in || a.out));
    const r = makeRenderer();
    const ctx = recordingCtx();
    r.ctx = ctx;
    r.tracePath(ring, false); // useCurves OFF (the morph group default)
    expect(ctx.ops).toContain('bezierCurveTo');
    expect(ctx.ops).not.toContain('lineTo');
  });

  test('RC-03: forceCurves does NOT smooth a handle-less polyline (stays straight)', () => {
    const r = makeRenderer();
    const ctx = recordingCtx();
    r.ctx = ctx;
    // No anchors / no handles, but forceCurves set: must fall back to lineTo, not
    // invent curvature (only stored bezier handles earn cubic rendering).
    const poly = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 0, y: 0 }];
    poly.meta = { forceCurves: true };
    r.tracePath(poly, false);
    expect(ctx.ops).not.toContain('bezierCurveTo');
    expect(ctx.ops).toContain('lineTo');
  });
});
