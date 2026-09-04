const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Job 2 (fs-d1-engine) — consume obj.border.offset in the border geometry.
 *
 * `obj.border.offset` (mm, default 0, clamped [-2, 2], negative = inward /
 * positive = outward) is normalized by `src/core/scene3d/params.js`'s
 * `normalizeObjectBorder` (the sibling branch that declared it has since
 * merged — see the "border.offset is normalized" test below, which replaced
 * a stale test documenting the pre-merge gap). The `normalizeParams` splice
 * in `beforeEach` below is now redundant with the real normalizer but is kept
 * as a harmless no-op-equivalent boundary shim rather than touched, since
 * this file does not own params.js.
 *
 * scene3d.js's job is the GEOMETRY consumption: the border's multi-pass band
 * must shift by `offset` mm, inward for negative / outward for positive,
 * keeping the passes' relative spread — for EVERY camera angle, not just one.
 *
 * SIGN / WINDING (fs-u2-borderdir fix). A prior pass picked a single fixed
 * sign for offsetRun's `d`, "empirically determined" from one sphere at one
 * fixed camera (yaw 0 / pitch 0, this file's default `scene()` camera). That
 * was the actual bug the product owner reported ("increasing the offset
 * doesn't make the border larger"): offsetRun's normal is the LEFT side of
 * the chain's screen-space travel direction, and which way a silhouette
 * chain winds (CW vs CCW) depends on the camera view, not on the codebase's
 * geometry in general. Proof: the SAME sphere at the app's actual default
 * scene camera (yaw -30 / pitch 20 — what every new 3D Scene layer ships
 * with) grew OUTWARD at NEGATIVE offset and shrank at POSITIVE under the old
 * fixed-sign code — exactly inverted. The fix in `emitBorderChains` computes
 * polarity PER STRIP (a tiny probe offset compared against the object's
 * projected-vertex centroid), so positive `offset` reads as outward
 * regardless of camera/winding. The "winding-independent" test below pins
 * this at the app's real default camera in addition to the original yaw
 * 0/pitch 0 tests, which stay on the original camera and therefore keep
 * proving the fix didn't disturb the already-correct case.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D border.offset geometry consumption (Job 2)', () => {
  let runtime; let V; let algo; let defaults; let realNormalize;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  beforeEach(() => {
    realNormalize = V.Scene3D.Params.normalizeParams;
    // Splice `border.offset` onto the real normalizer's output, reading it
    // straight off the RAW (pre-normalization) object — simulating the
    // not-yet-merged params.js contract (clamp [-2, 2], default 0).
    V.Scene3D.Params.normalizeParams = (raw) => {
      const p = realNormalize(raw);
      const rawObjects = (raw && Array.isArray(raw.objects)) ? raw.objects : [];
      p.objects.forEach((obj, i) => {
        const rawBorder = rawObjects[i] && rawObjects[i].border;
        const offset = rawBorder && typeof rawBorder.offset === 'number'
          ? Math.max(-2, Math.min(2, rawBorder.offset))
          : 0;
        obj.border = { ...obj.border, offset };
      });
      return p;
    };
  });
  afterEach(() => {
    V.Scene3D.Params.normalizeParams = realNormalize;
  });

  const DEFAULT_CAMERA = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
  // The app's ACTUAL default 3D Scene camera (Engine.addSceneTree /
  // scene3d-panel's factory) — every new scene ships at this angle, not at
  // the yaw0/pitch0 head-on view the original tests used.
  const APP_DEFAULT_CAMERA = { projection: 'orthographic', yaw: -30, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

  // A sphere head-on: a smooth, many-vertex, single-loop convex silhouette
  // with no sharp corners to distort a per-vertex tangent-based offset.
  const scene = (border, camera = DEFAULT_CAMERA) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'Sphere', primitive: 'sphere', params: { radius: 40, detail: 24 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', ...(border !== undefined ? { border } : {}),
    }];
    p.ground = { enabled: false };
    p.camera = camera;
    p.styleTable = { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };

  const edgesOf = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge');

  const bbox = (paths) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    paths.forEach((p) => (p || []).forEach((pt) => {
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    }));
    return { w: maxX - minX, h: maxY - minY };
  };

  // Border-off silhouette edge count is the fixed baseline every `on` run
  // appends its extra pass(es) AFTER (append order is deterministic), so the
  // tail of an `on` run's edge list is exactly the border-emitted geometry.
  const borderOnlyPaths = (border, camera = DEFAULT_CAMERA) => {
    const off = edgesOf(algo.generate(scene({ enabled: false }, camera), null, null, BOUNDS));
    const on = edgesOf(algo.generate(scene(border, camera), null, null, BOUNDS));
    return on.slice(off.length);
  };

  test('border.offset is normalized and clamped to [-2, 2] (sibling branch merged)', () => {
    expect(realNormalize({ objects: [{ primitive: 'box', border: { enabled: true, offset: 1.5 } }] })
      .objects[0].border.offset).toBe(1.5);
    expect(realNormalize({ objects: [{ primitive: 'box', border: { enabled: true, offset: 5 } }] })
      .objects[0].border.offset).toBe(2);
    expect(realNormalize({ objects: [{ primitive: 'box', border: { enabled: true, offset: -5 } }] })
      .objects[0].border.offset).toBe(-2);
    expect(realNormalize({ objects: [{ primitive: 'box', border: { enabled: true } }] })
      .objects[0].border.offset).toBe(0);
  });

  // RGR pin for the fs-u2-borderdir fix: at the app's real default camera,
  // positive offset must still grow the bbox and negative must still shrink
  // it — this FAILED before the per-strip polarity fix (grew at negative,
  // shrank at positive; the exact inversion the product owner reported).
  test('positive offset stays outward across camera angles (winding-independent)', () => {
    const zero = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: 0 }, APP_DEFAULT_CAMERA));
    const out = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: 1.5 }, APP_DEFAULT_CAMERA));
    const inw = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: -1.5 }, APP_DEFAULT_CAMERA));
    expect(out.w).toBeGreaterThan(zero.w);
    expect(out.h).toBeGreaterThan(zero.h);
    expect(inw.w).toBeLessThan(zero.w);
    expect(inw.h).toBeLessThan(zero.h);
  });

  test('positive offset (outward) GROWS the border pass bbox vs. offset 0', () => {
    const zero = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: 0 }));
    const out = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: 1.5 }));
    expect(out.w).toBeGreaterThan(zero.w);
    expect(out.h).toBeGreaterThan(zero.h);
  });

  test('negative offset (inward) SHRINKS the border pass bbox vs. offset 0', () => {
    const zero = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: 0 }));
    const inw = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: -1.5 }));
    expect(inw.w).toBeLessThan(zero.w);
    expect(inw.h).toBeLessThan(zero.h);
  });

  test('offset magnitude tracks bbox size monotonically (more outward => bigger)', () => {
    const w05 = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: 0.5 })).w;
    const w15 = bbox(borderOnlyPaths({ enabled: true, strength: 0.25, offset: 1.5 })).w;
    expect(w15).toBeGreaterThan(w05);
  });

  test('multi-pass band keeps its relative spread regardless of offset (whole band shifts together)', () => {
    // strength=1 -> passes = round(1*2) = 2 (k=1 inner-ish, k=2 outer-ish).
    // The spread (outer pass bbox width - inner pass bbox width) should be
    // unchanged by a uniform band shift.
    const spreadOf = (offset) => {
      const paths = borderOnlyPaths({ enabled: true, strength: 1, offset });
      const widths = paths.map((p) => bbox([p]).w);
      return Math.max(...widths) - Math.min(...widths);
    };
    const spreadZero = spreadOf(0);
    const spreadShifted = spreadOf(1.5);
    expect(Math.abs(spreadShifted - spreadZero)).toBeLessThan(0.02);
  });

  test('REGRESSION: offset 0 is byte-identical to today\'s border output (no field present)', () => {
    const withZero = JSON.stringify(algo.generate(scene({ enabled: true, strength: 1, offset: 0 }), null, null, BOUNDS));
    const withoutField = JSON.stringify(algo.generate(scene({ enabled: true, strength: 1 }), null, null, BOUNDS));
    expect(withZero).toBe(withoutField);
  });
});
