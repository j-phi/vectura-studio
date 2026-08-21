const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Job 2 (fs-d1-engine) — consume obj.border.offset in the border geometry.
 *
 * Another agent declared the normalized field `obj.border.offset` (mm,
 * default 0, clamped [-2, 2], negative = inward / positive = outward) on a
 * SIBLING branch (3d-scene/fs-c2-shadow, commit 01a5753e) that has not been
 * merged into this branch's base (3d-scene/fs-b2-xray) — so on THIS branch,
 * `src/core/scene3d/params.js`'s `normalizeObjectBorder` does not carry
 * `offset` through yet (verified: it normalizes to `{enabled, strength,
 * penId}` only here). That file is out of scope for this task (owned by the
 * params agent) and is not edited here.
 *
 * scene3d.js's job is the GEOMETRY consumption: once `record.border.offset`
 * IS present (as it will be the moment the branches merge), the border's
 * multi-pass band must shift by that many mm, inward for negative / outward
 * for positive, keeping the passes' relative spread.
 *
 * To prove that consumption logic in isolation from the params-side gap,
 * these tests wrap `Vectura.Scene3D.Params.normalizeParams` for the duration
 * of the test to splice `offset` onto the normalized border block exactly as
 * the real normalizer will once merged (clamped [-2, 2], default 0) — a
 * boundary mock of a dependency this file does not own, not an edit to it.
 *
 * SIGN. offsetRun's `d` sign was determined empirically (per this task's
 * instructions), not assumed from the literal, using a SPHERE's smooth
 * convex silhouette (many vertices, no sharp-corner artifacts — a box
 * wireframe's edges do not form one simple closed loop and were found to give
 * an unreliable reading) and measuring the offset pass's bbox against the
 * un-offset silhouette's: positive `d` grows the bbox (outward), negative
 * shrinks it (inward). These tests use the same bbox method.
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

  // A sphere head-on: a smooth, many-vertex, single-loop convex silhouette
  // with no sharp corners to distort a per-vertex tangent-based offset.
  const scene = (border) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'Sphere', primitive: 'sphere', params: { radius: 40, detail: 24 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', ...(border !== undefined ? { border } : {}),
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
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
  const borderOnlyPaths = (border) => {
    const off = edgesOf(algo.generate(scene({ enabled: false }), null, null, BOUNDS));
    const on = edgesOf(algo.generate(scene(border), null, null, BOUNDS));
    return on.slice(off.length);
  };

  test('offset field is not yet normalized on this branch (documents the sibling-branch gap)', () => {
    const p = realNormalize({ objects: [{ primitive: 'box', border: { enabled: true, offset: 1.5 } }] });
    expect(p.objects[0].border.offset).toBeUndefined();
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
