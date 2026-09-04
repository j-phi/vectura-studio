const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Style > Hatch > Angle on a CURVED primitive (Jay live defect).
 *
 * `SurfaceFill.buildObject` documented `fillAngle` in its opts contract and the
 * scene3d caller dutifully passed it — but the module never read it. Every
 * chart-wrapped primitive (sphere, cylinder, cone, torus, capsule,
 * superellipsoid, torusKnot, pyramid) was hard-wired to the meridian family, so
 * turning the Angle dial re-grouped the fill and re-emitted byte-identical line
 * art. Faceted prims (box / plane / solid) and the flat-silhouette fallback
 * (imported mesh, CSG) always honoured the angle, which is why the defect only
 * showed on "at least one of the shapes".
 *
 * Contract: the angle is measured in the surface's own tangent frame, the same
 * convention the faceted path uses — 0 = along the surface's FIRST parametric
 * axis (the meridian family, the legacy hatch), 90 = the parallel family. So
 * angle 0 must stay byte-identical, and any other angle must visibly rotate the
 * emitted line art.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

// Every primitive that routes through the chart-wrapped SurfaceFill path
// (Scene3D TOPOFORM_MODES) — the full broken set from the live sweep.
const CURVED = {
  sphere: { radius: 40, detail: 20 },
  cylinder: { sx: 25, sy: 40, sz: 25, detail: 20 },
  cone: { sx: 25, sy: 40, sz: 25, detail: 20 },
  torus: { sx: 30, sy: 12, sz: 30, detail: 20 },
  capsule: { sx: 20, sy: 40, sz: 20, detail: 20 },
  superellipsoid: { sx: 30, sy: 30, sz: 30, detail: 20 },
  torusKnot: { sx: 28, sy: 10, sz: 28, detail: 20 },
  pyramid: { sx: 30, sy: 35, sz: 30, detail: 12 },
};

describe('Scene3D — Hatch Angle rotates the fill on curved primitives', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const scene = (primitive, params, mapper, fillAngle) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive, params: clone(params),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };

  const fillsOf = (primitive, params, mapper, fillAngle) =>
    (algo.generate(scene(primitive, params, mapper, fillAngle), null, null, BOUNDS) || [])
      .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  // Mean UNDIRECTED segment bearing (deg, 0..180) of a fill family — the
  // objective "which way does the line art actually run" measure. Doubled-angle
  // mean so 179° and 1° average near 0, not near 90; LENGTH-weighted so the long
  // strokes that carry the visual read dominate the tiny tessellation steps.
  const meanBearing = (paths) => {
    let sx = 0; let sy = 0; let w = 0;
    paths.forEach((pp) => {
      for (let i = 0; i + 1 < pp.length; i++) {
        const dx = pp[i + 1].x - pp[i].x;
        const dy = pp[i + 1].y - pp[i].y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const r = 2 * Math.atan2(dy, dx);
        sx += Math.cos(r) * len; sy += Math.sin(r) * len; w += len;
      }
    });
    if (!w) return NaN;
    let m = (Math.atan2(sy / w, sx / w) * 90) / Math.PI;
    if (m < 0) m += 180;
    return m;
  };

  const geomKey = (paths) => paths
    .map((pp) => pp.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(';'))
    .join('|');

  // Smallest undirected separation between two bearings (0..90).
  const bearingGap = (a, b) => {
    const d = Math.abs(a - b) % 180;
    return d > 90 ? 180 - d : d;
  };

  describe.each(Object.keys(CURVED))('%s', (primitive) => {
    const params = CURVED[primitive];

    test('hatch geometry CHANGES when the Angle dial moves (0 vs 45 vs 90)', () => {
      const a0 = fillsOf(primitive, params, 'hatch', 0);
      const a45 = fillsOf(primitive, params, 'hatch', 45);
      const a90 = fillsOf(primitive, params, 'hatch', 90);
      expect(a0.length).toBeGreaterThan(0);
      expect(a45.length).toBeGreaterThan(0);
      expect(a90.length).toBeGreaterThan(0);
      expect(geomKey(a45)).not.toBe(geomKey(a0));
      expect(geomKey(a90)).not.toBe(geomKey(a0));
      expect(geomKey(a90)).not.toBe(geomKey(a45));
    });

    test('the emitted lines actually change DIRECTION with the angle', () => {
      const b0 = meanBearing(fillsOf(primitive, params, 'hatch', 0));
      const b90 = meanBearing(fillsOf(primitive, params, 'hatch', 90));
      expect(Number.isFinite(b0)).toBe(true);
      expect(Number.isFinite(b90)).toBe(true);
      // 0 = meridians, 90 = parallels: two structurally perpendicular families,
      // so their mean screen bearings must be well apart (not the same field).
      expect(bearingGap(b0, b90)).toBeGreaterThan(20);
    });

    test('crosshatch also rotates with the Angle dial', () => {
      const a0 = fillsOf(primitive, params, 'crosshatch', 0);
      const a30 = fillsOf(primitive, params, 'crosshatch', 30);
      expect(a0.length).toBeGreaterThan(0);
      expect(geomKey(a30)).not.toBe(geomKey(a0));
    });
  });

  test('angle 0 is the legacy meridian family (no regression for existing scenes)', () => {
    // Angle 0 must reproduce the pre-fix wrap exactly: hatch = meridians. A
    // meridian sweeps the along-axis, so each line is a multi-point polyline
    // that runs pole-to-pole rather than a flat scanline.
    const a0 = fillsOf('sphere', CURVED.sphere, 'hatch', 0);
    expect(a0.length).toBeGreaterThan(0);
    const multi = a0.filter((pp) => pp.length >= 4).length;
    expect(multi).toBeGreaterThan(a0.length * 0.5);
  });

  test('faceted + fallback prims keep honouring the angle (unchanged surfaces)', () => {
    const box0 = fillsOf('box', { sx: 30, sy: 30, sz: 30 }, 'hatch', 0);
    const box45 = fillsOf('box', { sx: 30, sy: 30, sz: 30 }, 'hatch', 45);
    expect(geomKey(box45)).not.toBe(geomKey(box0));
  });
});
