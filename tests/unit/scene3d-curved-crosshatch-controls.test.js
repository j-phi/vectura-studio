const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * CURVED CROSSHATCH — crossAngleDelta / crossDensityRatio / tripleHatch.
 *
 * Same class of gap as the hatch-angle defect next door: scene3d.js never handed
 * these three to SurfaceFill.buildObject, so on every chart-wrapped primitive the
 * crossing family was hard-wired at +90, at family A's density, with no triple
 * pass — while faceted geometry (crossFamilies → hatchPolygon) and the flat
 * silhouette fallback (hatchSegments) had honoured all three since Phase 1.3.
 *
 * The curved fill must interpret them EXACTLY as the faceted path does:
 *   • family B sits at fillAngle + crossAngleDelta        (clamped 10..170)
 *   • family B's SPACING is scaled by crossDensityRatio   (clamped 0.25..2;
 *     ratio > 1 ⇒ wider spacing ⇒ sparser B). A wrapped family's spacing is
 *     1/count, so that is count ÷ ratio here.
 *   • tripleHatch adds a third pass at fillAngle + 45 on family-B's spacing,
 *     ONLY in the darkest tone band — the caller owns that gate, as it does for
 *     the faceted path.
 * And the defaults (90 / 1 / off) must be strictly inert.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

const CURVED = {
  sphere: { radius: 40, detail: 20 },
  cylinder: { sx: 25, sy: 40, sz: 25, detail: 20 },
  torus: { sx: 30, sy: 12, sz: 30, detail: 20 },
};

describe('Scene3D — curved crosshatch honours its own controls', () => {
  let runtime; let V; let algo; let defaults; let SurfaceFill;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SurfaceFill = V.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  const scene = (primitive, params, styleParams, mapper) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive, params: clone(params),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: mapper || 'crosshatch', params: { fillAngle: 0, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };
  const fills = (p) => (algo.generate(p, null, null, BOUNDS) || [])
    .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const geomKey = (paths) => paths
    .map((pp) => pp.map((pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(';')).join('|');
  const inkLength = (paths) => paths.reduce((sum, pp) => {
    let d = 0;
    for (let i = 0; i + 1 < pp.length; i++) d += Math.hypot(pp[i + 1].x - pp[i].x, pp[i + 1].y - pp[i].y);
    return sum + d;
  }, 0);
  // Length-weighted mean UNDIRECTED bearing (0..180) — "which way does the line
  // art actually run". Doubled-angle mean so 179° and 1° average near 0.
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
  const bearingGap = (a, b) => { const d = Math.abs(a - b) % 180; return d > 90 ? 180 - d : d; };

  // ── DEFAULTS ARE INERT. ────────────────────────────────────────────────────
  describe.each(Object.keys(CURVED))('%s', (primitive) => {
    const params = CURVED[primitive];

    test('explicit default cross params are byte-identical to omitting them', () => {
      const bare = fills(scene(primitive, params, {}));
      const explicit = fills(scene(primitive, params, {
        crossAngleDelta: 90, crossDensityRatio: 1, tripleHatch: false,
      }));
      expect(bare.length).toBeGreaterThan(0);
      expect(geomKey(explicit)).toBe(geomKey(bare));
    });

    // Structural byte-identity pin for the default crossing family: at angle 0 a
    // crosshatch is exactly the meridian family (= hatch) followed by the
    // parallel family (= contour) at the same density. If the default crossing
    // family ever stops being the parallels, this breaks.
    test('the default crossing family at angle 0 IS the parallels family', () => {
      const cross = geomKey(fills(scene(primitive, params, {})));
      const hatch = geomKey(fills(scene(primitive, params, {}, 'hatch')));
      const contour = geomKey(fills(scene(primitive, params, {}, 'contour')));
      expect(cross).toBe(`${hatch}|${contour}`);
    });

    test('crossAngleDelta rotates the crossing family', () => {
      const d90 = fills(scene(primitive, params, { crossAngleDelta: 90 }));
      const d140 = fills(scene(primitive, params, { crossAngleDelta: 140 }));
      const d30 = fills(scene(primitive, params, { crossAngleDelta: 30 }));
      expect(d90.length).toBeGreaterThan(0);
      expect(geomKey(d140)).not.toBe(geomKey(d90));
      expect(geomKey(d30)).not.toBe(geomKey(d90));
      expect(geomKey(d30)).not.toBe(geomKey(d140));
    });

    test('the crossing family actually changes DIRECTION with crossAngleDelta', () => {
      // Family A is emitted first and is identical in every run, so the tail of
      // the crosshatch output IS family B — isolate it and measure only that.
      const hatchOnly = fills(scene(primitive, params, {}, 'hatch'));
      const famB = (delta) => {
        const all = fills(scene(primitive, params, { crossAngleDelta: delta }));
        expect(geomKey(all.slice(0, hatchOnly.length))).toBe(geomKey(hatchOnly)); // A is the prefix
        return all.slice(hatchOnly.length);
      };
      const b90 = meanBearing(famB(90));
      const b30 = meanBearing(famB(30));
      const b150 = meanBearing(famB(150));
      expect(Number.isFinite(b90)).toBe(true);
      expect(bearingGap(b30, b90)).toBeGreaterThan(10);
      expect(bearingGap(b150, b90)).toBeGreaterThan(10);
      // NB: 30 and 150 are NOT compared by bearing. They are mirror-symmetric
      // about the +90 axis, so on a symmetric wrap (the torus) their
      // length-weighted MEAN bearings coincide even though the line art differs
      // — which the geometry test above already proves.
    });

    test('crossDensityRatio makes the crossing family sparser (> 1) / denser (< 1)', () => {
      const base = fills(scene(primitive, params, {}, 'hatch'));       // family A alone
      const dense = fills(scene(primitive, params, { crossDensityRatio: 0.5 }));
      const even = fills(scene(primitive, params, { crossDensityRatio: 1 }));
      const sparse = fills(scene(primitive, params, { crossDensityRatio: 2 }));
      // Family B's ink is the total minus family A's (which never changes).
      const inkB = (paths) => inkLength(paths) - inkLength(base);
      expect(inkB(dense)).toBeGreaterThan(inkB(even) * 1.4);
      expect(inkB(sparse)).toBeLessThan(inkB(even) * 0.75);
      expect(geomKey(sparse)).not.toBe(geomKey(even));
    });
  });

  // ── tripleHatch: the third pass, and the darkest-band gate. ────────────────
  test('tripleHatch adds a third family to the curved fill (SurfaceFill contract)', () => {
    const opts = (cross) => ({
      mode: 'sphere', sizes: { sx: 40, sy: 40, sz: 40 }, detail: 20,
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      applyTransform: V.Scene3D.Scene.applyObjectTransform,
      projectWorld: (w) => ({ x: 160 + w.x, y: 110 - w.y, z: w.z }),
      camAngles: { yaw: 0, pitch: 0, roll: 0 },
      mapper: 'crosshatch', fillAngle: 0, fillDensity: 60, cross,
    });
    const two = SurfaceFill.buildObject(opts({ angleDelta: 90, densityRatio: 1, triple: false }));
    const three = SurfaceFill.buildObject(opts({ angleDelta: 90, densityRatio: 1, triple: true }));
    expect(two.length).toBeGreaterThan(0);
    expect(three.length).toBeGreaterThan(two.length);
    // The extra pass is additive: the two-family output is a strict prefix.
    expect(three.slice(0, two.length)).toEqual(two);
  });

  test('scene3d.js threads all three through, with the faceted clamps and the dark-band gate', () => {
    const seen = [];
    const real = SurfaceFill.buildObject;
    SurfaceFill.buildObject = (o) => { seen.push(o); return real(o); };
    try {
      // Out of range on purpose: the curved path must clamp exactly like
      // crossFamilies() does (10..170 and 0.25..2).
      const p = scene('sphere', CURVED.sphere, {
        crossAngleDelta: 400, crossDensityRatio: 9, tripleHatch: true,
      });
      algo.generate(p, null, null, BOUNDS);
      expect(seen.length).toBeGreaterThan(0);
      expect(seen[0].cross).toEqual({ angleDelta: 170, densityRatio: 2, triple: false });
      // triple is false above because tone is OFF ⇒ there is no darkest band.
      seen.length = 0;
      const toned = scene('sphere', CURVED.sphere, { crossAngleDelta: 90, crossDensityRatio: 1, tripleHatch: true });
      toned.tone = { ...clone(defaults).tone, enabled: true };
      toned.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: false }];
      algo.generate(toned, null, null, BOUNDS);
      expect(seen.length).toBeGreaterThan(0);
      expect(typeof seen[0].cross.triple).toBe('boolean');
      // A non-crosshatch mapper hands no cross bag at all (strict no-op).
      seen.length = 0;
      algo.generate(scene('sphere', CURVED.sphere, {}, 'hatch'), null, null, BOUNDS);
      expect(seen[0].cross).toBe(null);
    } finally {
      SurfaceFill.buildObject = real;
    }
  });

  // ── The curved reading must agree with the faceted one. ────────────────────
  test('a box (faceted) and a sphere (curved) respond to crossAngleDelta the same way', () => {
    const box = (delta) => fills(scene('box', { sx: 40, sy: 40, sz: 40 }, { crossAngleDelta: delta }));
    const sphere = (delta) => fills(scene('sphere', CURVED.sphere, { crossAngleDelta: delta }));
    // Both surfaces must actually move when the dial moves.
    expect(geomKey(box(140))).not.toBe(geomKey(box(90)));
    expect(geomKey(sphere(140))).not.toBe(geomKey(sphere(90)));
    // …and both must get SPARSER family-B ink as the ratio rises.
    const inkOf = (primitive, params, ratio, mapper) =>
      inkLength(fills(scene(primitive, params, { crossDensityRatio: ratio }, mapper)));
    const boxA = inkOf('box', { sx: 40, sy: 40, sz: 40 }, 1, 'hatch');
    const sphA = inkOf('sphere', CURVED.sphere, 1, 'hatch');
    expect(inkOf('box', { sx: 40, sy: 40, sz: 40 }, 2) - boxA)
      .toBeLessThan(inkOf('box', { sx: 40, sy: 40, sz: 40 }, 1) - boxA);
    expect(inkOf('sphere', CURVED.sphere, 2) - sphA)
      .toBeLessThan(inkOf('sphere', CURVED.sphere, 1) - sphA);
  });
});
