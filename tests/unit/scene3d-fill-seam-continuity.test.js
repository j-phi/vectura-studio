const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * THE WIND SEAM IS NOT A WALL.
 *
 * Jay, 2026-08-17, on a lit sphere with Highlight = None: the rulings stop short
 * of the outline in a column down the RIGHT side, leaving a gap between the line
 * ends and the silhouette. The LEFT limb is clean. Both `contour` (rings) and
 * `hatch` (the 45-degree helical family) show it; `hatch` also grew a cluster of
 * short stubs where the family converges on the top pole.
 *
 * THE ASYMMETRY IS THE WHOLE DIAGNOSIS. Nothing uniform — tessellation, back-face
 * culling granularity, the discrete sample step, or any inherent property of
 * ruling a curved surface — can favour one limb over the other. A chart's `b`
 * axis is the WIND SEAM, and on this camera (yaw 0) longitude 0 projects to the
 * right-hand limb. Two separate mechanisms cut ink there and nowhere else:
 *
 *   1. `sampleAt` measured its tangents with a FORWARD difference and clamped the
 *      partner into the domain, so at b = 1 the partner landed on top of the
 *      sample, the cross product collapsed and the sample returned null. Every
 *      sweep silently lost its last sample. A contour ring is CLOSED — b = 1 IS
 *      b = 0 — so the ring came back as two pieces with a one-step notch on the
 *      seam instead of one continuous stroke.
 *
 *   2. `angleFamily` slab-clipped its rulings to the unit SQUARE, so an angled
 *      ruling stopped dead on the b = 1 meridian. That meridian is NOT the
 *      silhouette: on a yaw-0 sphere it runs from the right-hand equator point
 *      (which is on the silhouette) up to the pole (at 0.87 R), so the lune
 *      between it and the right limb is real, visible, front-facing surface that
 *      no ruling crossed.
 *
 * THE LAW THESE TESTS PIN. On a lone convex primitive there are exactly three
 * places a front-face ruling may end: the silhouette, a chart pole, or nowhere
 * (a closed ring). A ruling that stops in open surface is a defect, whatever
 * produced it. That is asserted geometrically — the distance from each free end
 * to the silhouette — so it stays true if the emitter is rewritten again.
 *
 * These tests deliberately do NOT assert ink totals or ruling counts: dropping
 * whole rulings is how this engine makes tone, and it must stay free to.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const PEN = 0.3;
const BOUNDS = {
  width: 200, height: 200, m: 8, dW: 184, dH: 184,
  penWidth: PEN, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};

// A lone sphere, orthographic, yaw 0 — so the chart's wind seam (longitude 0)
// lands squarely on the right-hand limb and any seam defect is unmissable.
// This is NOT the shadow-anatomy rig and must not become it (pitch 30 / sun
// elevation 35 are deliberately clear of that fixture's 32 / 28 signature).
const CAMERA = {
  projection: 'orthographic', yaw: 0, pitch: 30, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
};
const SUN = {
  type: 'directional', azimuth: 135, elevation: 35, intensity: 1, castShadows: false,
};
const RADIUS = 62;

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

describe('Scene3D.SurfaceFill — a ruling ends at the silhouette or at a pole, never in open surface', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const scene = (mapper) => {
    const p = clone(defaults);
    p.seed = 0;
    p.camera = clone(CAMERA);
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.lights = [clone(SUN)];
    p.objects = [{
      id: 'ball',
      name: 'Ball',
      primitive: 'sphere',
      params: { radius: RADIUS, detail: 48 },
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
      role: 'solid',
    }];
    p.tone = {
      enabled: true,
      bands: 3,
      thresholds: [0.33, 0.66],
      ladder: [0.2, 0.5, 0.85],
      specular: { enabled: true, size: 1 },
    };
    const style = {
      penId: null,
      mapper,
      params: { fillDensity: 50, highlightTreatment: 'none' },
    };
    p.styleTable = { scene: clone(style), byObject: { ball: clone(style) }, byFace: {} };
    return p;
  };

  // Read the runs exactly as the fill emitter produced them, with their
  // `fam` / `lineIndex` tags intact (they do not survive the display pipeline).
  const emittedRuns = (mapper) => {
    const SF = V.Scene3D.SurfaceFill;
    const orig = SF.buildObject;
    const raw = [];
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((q) => raw.push(q));
      return r;
    };
    try {
      algo.generate(scene(mapper), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    return raw;
  };

  // The drawn disc, measured off the emitted geometry rather than assumed, so
  // the assertions carry no hard-coded millimetres.
  const disc = (raw) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    raw.forEach((q) => q.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }));
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, R: (maxX - minX) / 2 };
  };

  // A sphere's chart poles project to the two points on the vertical centre
  // line; the family legitimately converges there, so a ruling may end there.
  const poles = (d) => [
    { x: d.cx, y: d.cy - d.R * Math.cos((30 * Math.PI) / 180) },
    { x: d.cx, y: d.cy + d.R * Math.cos((30 * Math.PI) / 180) },
  ];

  // How far INSIDE the silhouette each free end of each front ruling sits, as a
  // fraction of the radius. Closed runs have no free end; ends at a pole are the
  // family's legitimate convergence and are excluded.
  const freeEndDepths = (raw) => {
    const d = disc(raw);
    const P = poles(d);
    const depths = [];
    raw.filter((q) => !q.back && q.length >= 2).forEach((q) => {
      const a = q[0]; const b = q[q.length - 1];
      if (dist(a, b) < 0.05) return;                       // a closed ring: no free end
      [a, b].forEach((e) => {
        if (P.some((pole) => dist(e, pole) < d.R * 0.06)) return;  // converges on a pole
        depths.push((d.R - Math.hypot(e.x - d.cx, e.y - d.cy)) / d.R);
      });
    });
    return depths;
  };

  // One SAMPLE STEP is the irreducible slack: a run's last point is the last
  // sample before the cull, so it may sit up to one step inside the true
  // boundary. On this fixture (detail 48 -> 96 steps) that is ~2% of the radius.
  // The bar is set at twice that; before the fix the deepest free end was 13%.
  const STEP_SLACK = 0.04;

  test.each(['contour', 'hatch'])('%s: no ruling stops in open surface (the right-limb crescent)', (mapper) => {
    const raw = emittedRuns(mapper);
    expect(raw.length).toBeGreaterThan(4);
    const depths = freeEndDepths(raw);
    expect(depths.length).toBeGreaterThan(4);
    const worst = Math.max.apply(null, depths);
    expect(+worst.toFixed(4)).toBeLessThanOrEqual(STEP_SLACK);
  });

  test('the seam is not favoured over the opposite limb (the asymmetry that named the bug)', () => {
    // Same measurement, split by which half of the disc the free end is in. The
    // wind seam is on the RIGHT at yaw 0; before the fix the right half carried
    // every deep end and the left half none.
    const raw = emittedRuns('hatch');
    const d = disc(raw);
    const P = poles(d);
    const half = { left: [], right: [] };
    raw.filter((q) => !q.back && q.length >= 2).forEach((q) => {
      const a = q[0]; const b = q[q.length - 1];
      if (dist(a, b) < 0.05) return;
      [a, b].forEach((e) => {
        if (P.some((pole) => dist(e, pole) < d.R * 0.06)) return;
        const depth = (d.R - Math.hypot(e.x - d.cx, e.y - d.cy)) / d.R;
        half[e.x >= d.cx ? 'right' : 'left'].push(depth);
      });
    });
    expect(half.left.length).toBeGreaterThan(0);
    expect(half.right.length).toBeGreaterThan(0);
    const worst = (arr) => Math.max.apply(null, arr);
    expect(+worst(half.right).toFixed(4)).toBeLessThanOrEqual(STEP_SLACK);
    expect(+worst(half.left).toFixed(4)).toBeLessThanOrEqual(STEP_SLACK);
  });

  test('contour: a latitude ring is ONE stroke — the closed sweep is not cut at its own seam', () => {
    const raw = emittedRuns('contour');
    const open = raw.filter((q) => !q.back && q.lineIndex != null
      && typeof q.fam === 'string' && q.fam.startsWith('A#'));
    expect(open.length).toBeGreaterThan(4);
    const perRuling = new Map();
    open.forEach((q) => {
      const k = `${q.fam}:${q.lineIndex}`;
      perRuling.set(k, (perRuling.get(k) || 0) + 1);
    });
    // A latitude ring on a convex sphere has ONE visible arc. Any ruling that
    // arrives in two pieces was cut at the parameter seam, not by the form.
    const split = [...perRuling.entries()].filter(([, n]) => n > 1);
    expect(split).toEqual([]);
  });

  test('contour: a ring the form does not cut comes back CLOSED, not a step short', () => {
    // The rings above the view horizon are visible end to end. They are the
    // direct probe for the dropped b = 1 sample: before the fix each one came
    // back open by exactly one sample step.
    const raw = emittedRuns('contour');
    const d = disc(raw);
    const rings = raw.filter((q) => !q.back && q.length >= 2 && dist(q[0], q[q.length - 1]) < d.R * 0.05);
    expect(rings.length).toBeGreaterThan(2);
    const gaps = rings.map((q) => +dist(q[0], q[q.length - 1]).toFixed(3));
    expect(Math.max.apply(null, gaps)).toBeLessThanOrEqual(1e-3);
  });
});
