const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Lighting + Scene3D.Regions (Phase 2 stream 2A).
 *
 * - lightWorldDir implements the CONTRACT L1 convention (az 0=+Z/90=+X,
 *   el 0=horizon/90=overhead; travel d.y < 0 above the horizon).
 * - Regions.intensity is Lambert: n=L → 1, n=-L → 0.
 * - band → coverage → spacing is a monotonic ladder, deterministic.
 */

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const normalizeVec = (v) => {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
};

describe('Scene3D.Lighting + Regions (CONTRACT L1/L3)', () => {
  let runtime;
  let Lighting;
  let Regions;
  let Params;
  let TONE;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    const V = runtime.window.Vectura;
    Lighting = V.Scene3D.Lighting;
    Regions = V.Scene3D.Regions;
    Params = V.Scene3D.Params;
    TONE = V.Scene3D.Params.DEFAULT_TONE;
  });

  afterAll(() => runtime.cleanup());

  test('lightWorldDir convention: az/el → expected travel vector', () => {
    // az 0, el 0 → sun at +Z on the horizon; travel points -Z.
    const a = Lighting.lightWorldDir({ azimuth: 0, elevation: 0 });
    expect(near(a.x, 0, 1e-9)).toBe(true);
    expect(near(a.y, 0, 1e-9)).toBe(true);
    expect(near(a.z, -1, 1e-9)).toBe(true);

    // az 90, el 0 → sun at +X; travel points -X.
    const b = Lighting.lightWorldDir({ azimuth: 90, elevation: 0 });
    expect(near(b.x, -1, 1e-9)).toBe(true);
    expect(near(b.z, 0, 1e-9)).toBe(true);

    // el 90 → sun overhead; travel straight down.
    const c = Lighting.lightWorldDir({ azimuth: 135, elevation: 90 });
    expect(near(c.x, 0, 1e-9)).toBe(true);
    expect(near(c.y, -1, 1e-9)).toBe(true);
    expect(near(c.z, 0, 1e-9)).toBe(true);
  });

  test('travel d.y < 0 for every elevation above the horizon', () => {
    for (let el = 1; el <= 89; el += 7) {
      for (let az = 0; az < 360; az += 45) {
        const d = Lighting.lightWorldDir({ azimuth: az, elevation: el });
        expect(d.y).toBeLessThan(0);
        expect(near(Math.hypot(d.x, d.y, d.z), 1, 1e-9)).toBe(true); // unit
      }
    }
  });

  test('lightFromDir inverts lightWorldDir', () => {
    const light = { azimuth: 42, elevation: 33 };
    const back = Lighting.lightFromDir(Lighting.lightWorldDir(light));
    expect(near(back.azimuth, 42, 1e-6)).toBe(true);
    expect(near(back.elevation, 33, 1e-6)).toBe(true);
  });

  test('Regions.intensity is Lambert: n=L → 1, n=-L → 0', () => {
    const light = { azimuth: 135, elevation: 45 };
    const L = Regions.towardLight(light);
    expect(near(Regions.intensity(L, light), 1, 1e-9)).toBe(true);
    expect(Regions.intensity({ x: -L.x, y: -L.y, z: -L.z }, light)).toBe(0);
    // accepts either a light record or a precomputed toward-light vector
    expect(near(Regions.intensity(L, L), 1, 1e-9)).toBe(true);
  });

  test('Regions.combinedIntensity (multi-light: ambient fill + directional sum, clamped)', () => {
    const sun = { type: 'directional', azimuth: 135, elevation: 45, intensity: 1 };
    const L = Regions.towardLight(sun);
    const away = { x: -L.x, y: -L.y, z: -L.z };
    // Signature is combinedIntensity(normalWorld, worldPoint, lights); direction-
    // only lights (directional/ambient) ignore the point, so null is fine here.
    // A lone directional sun reduces EXACTLY to single-light Lambert (regression).
    expect(near(Regions.combinedIntensity(L, null, [sun]), Regions.intensity(L, sun), 1e-9)).toBe(true);
    expect(Regions.combinedIntensity(away, null, [sun])).toBe(0);
    // Ambient adds a flat fill on the UNLIT side (no longer pure black).
    const amb = { type: 'ambient', intensity: 0.3 };
    expect(near(Regions.combinedIntensity(away, null, [sun, amb]), 0.3, 1e-9)).toBe(true);
    expect(Regions.combinedIntensity(away, null, [sun, amb])).toBeGreaterThan(Regions.combinedIntensity(away, null, [sun]));
    // Two directional lights sum; the total is clamped to 1 (never overflows).
    const sun2 = { type: 'directional', azimuth: 315, elevation: 45, intensity: 1 };
    expect(Regions.combinedIntensity(L, null, [sun, sun2])).toBeGreaterThanOrEqual(Regions.intensity(L, sun));
    expect(Regions.combinedIntensity(L, null, [sun, amb, sun2])).toBeLessThanOrEqual(1);
    // An unknown/future type shades as directional (does not crash or zero out).
    expect(Regions.combinedIntensity(L, null, [{ type: 'hemisphere', azimuth: 135, elevation: 45, intensity: 1 }])).toBeGreaterThan(0.9);
  });

  test('area light: softer terminator than a point light + deterministic', () => {
    // A point + an area light at the SAME position/intensity. The point is a hard
    // Lambert edge (0 the instant n·dir crosses 0); the area light averages N
    // deterministic sub-samples spread across its extent, so the terminator is a
    // soft, non-zero, smoothly-decaying ramp.
    const pos = { x: 0, y: 0, z: 400 };
    const point = { type: 'point', intensity: 1, range: 0, position: pos };
    const area = { type: 'area', intensity: 1, size: 240, samples: 8, position: pos };
    const P = { x: 0, y: 0, z: 0 };
    // Normal sweep about the y axis: n(θ) = (sinθ, 0, cosθ). θ=0 faces the light,
    // θ=90° is the terminator, θ>90° faces away.
    const nAt = (deg) => { const r = deg * Math.PI / 180; return { x: Math.sin(r), y: 0, z: Math.cos(r) }; };
    const areaAt = (deg) => Regions.combinedIntensity(nAt(deg), P, [area]);
    const pointAt = (deg) => Regions.combinedIntensity(nAt(deg), P, [point]);

    // Determinism: identical output across two identical calls (no RNG).
    expect(areaAt(60)).toBe(areaAt(60));
    expect(areaAt(90)).toBe(areaAt(90));

    // At the terminator the area light already exceeds the point's hard edge
    // (~0 for a flat point light — float cos90) by a clear margin (soft falloff).
    expect(areaAt(90)).toBeGreaterThan(pointAt(90) + 0.02);
    // Past the terminator the point is exactly dark but the area still glows.
    // The area's soft band spans its angular radius (~atan((size/2)/dist) ≈ 17°
    // for size 240 at z=400), so it stays lit well past 90° — tested at 100°,
    // comfortably inside that band — while the point is hard-dark the instant
    // n·dir crosses 0.
    expect(pointAt(95)).toBe(0);
    expect(areaAt(95)).toBeGreaterThan(0);
    expect(pointAt(100)).toBe(0);
    expect(areaAt(100)).toBeGreaterThan(0);

    // The area ramp is smooth + monotonically non-increasing across the whole
    // sweep (no oscillation / no hard cliff).
    let prev = Infinity;
    for (let deg = 0; deg <= 180; deg += 5) {
      const val = areaAt(deg);
      expect(val).toBeLessThanOrEqual(prev + 1e-9);
      prev = val;
    }
  });

  test('area light: more samples do not break determinism or clamp range', () => {
    const pos = { x: 0, y: 200, z: 0 };
    const P = { x: 0, y: 0, z: 0 };
    const n = { x: 0, y: 1, z: 0 };
    const a6 = Regions.combinedIntensity(n, P, [{ type: 'area', intensity: 1, size: 120, samples: 6, position: pos }]);
    const a16 = Regions.combinedIntensity(n, P, [{ type: 'area', intensity: 1, size: 120, samples: 16, position: pos }]);
    expect(a6).toBeGreaterThan(0);
    expect(a16).toBeGreaterThan(0);
    // Both stay a well-defined intensity in [0,1].
    [a6, a16].forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); });
    // Deterministic across a repeat.
    expect(Regions.combinedIntensity(n, P, [{ type: 'area', intensity: 1, size: 120, samples: 16, position: pos }])).toBe(a16);
  });

  test('point light: Lambert × distance falloff (nearer = brighter, behind = 0)', () => {
    // Point light on the +z axis; a face facing +z toward it. range 200 (linear).
    const point = { type: 'point', intensity: 1, range: 200, position: { x: 0, y: 0, z: 100 } };
    const nUp = { x: 0, y: 0, z: 1 }; // faces toward the light
    const near50 = { x: 0, y: 0, z: 50 };   // dist 50  → atten 0.75
    const far50 = { x: 0, y: 0, z: -50 };   // dist 150 → atten 0.25
    const iNear = Regions.combinedIntensity(nUp, near50, [point]);
    const iFar = Regions.combinedIntensity(nUp, far50, [point]);
    expect(iNear).toBeGreaterThan(iFar);           // falloff: nearer is brighter
    expect(near(iNear, 0.75, 1e-6)).toBe(true);
    expect(near(iFar, 0.25, 1e-6)).toBe(true);
    // A face turned AWAY from the light gets ~0 (Lambert back-face).
    const nDown = { x: 0, y: 0, z: -1 };
    expect(Regions.combinedIntensity(nDown, near50, [point])).toBe(0);
    // range 0 ⇒ no falloff: intensity is distance-invariant (still Lambert-gated).
    const noFall = { type: 'point', intensity: 1, range: 0, position: { x: 0, y: 0, z: 100 } };
    expect(near(Regions.combinedIntensity(nUp, near50, [noFall]), 1, 1e-9)).toBe(true);
    expect(near(Regions.combinedIntensity(nUp, far50, [noFall]), 1, 1e-9)).toBe(true);
  });

  test('spot light: fragment inside the cone is lit, outside the cone is dark', () => {
    // Spot overhead at y=100 aimed straight down at the origin; 30° half-angle.
    const spot = {
      type: 'spot', intensity: 1, range: 400,
      position: { x: 0, y: 100, z: 0 }, target: { x: 0, y: 0, z: 0 },
      coneAngle: 30, penumbra: 8,
    };
    const nUp = { x: 0, y: 1, z: 0 }; // faces up toward the spot
    const inside = { x: 0, y: 0, z: 0 };     // on the cone axis → fully lit
    const outside = { x: 200, y: 0, z: 0 };  // ~63° off-axis → outside the cone
    const iIn = Regions.combinedIntensity(nUp, inside, [spot]);
    const iOut = Regions.combinedIntensity(nUp, outside, [spot]);
    expect(iIn).toBeGreaterThan(0.5);   // inside the cone: lit (0.75 = Lambert×atten)
    expect(iOut).toBe(0);               // outside the cone: gated to dark
  });

  test('soft falloff floor: past range is small-but-nonzero and smoothly decreasing (no cliff)', () => {
    // Point on +z, face turned toward it (Lambert 1) so intensity == atten.
    const nUp = { x: 0, y: 0, z: 1 };
    const at = (z) => Regions.combinedIntensity(nUp, { x: 0, y: 0, z }, [
      { type: 'point', intensity: 1, range: 100, position: { x: 0, y: 0, z: 200 } },
    ]);
    // In-range values are the EXACT linear ramp (regression: unchanged).
    expect(near(at(150), 0.5, 1e-6)).toBe(true);   // dist 50  → 1 − 50/100
    expect(near(at(125), 0.25, 1e-6)).toBe(true);  // dist 75  → 1 − 75/100
    // AT the range boundary the tone no longer collapses to 0 — a small floor.
    const atRange = at(100);                        // dist 100 == range
    expect(atRange).toBeGreaterThan(0);
    expect(atRange).toBeLessThan(0.1);              // subtle
    // Just past range: still nonzero, and monotonically decreasing outward.
    const past1 = at(80);   // dist 120
    const past2 = at(60);   // dist 140
    const past3 = at(0);    // dist 200 (well past the tail)
    expect(past1).toBeGreaterThan(0);
    expect(atRange).toBeGreaterThanOrEqual(past1);  // nearer never darker
    expect(past1).toBeGreaterThanOrEqual(past2);
    expect(past2).toBeGreaterThanOrEqual(past3);
    expect(past3).toBe(0);                          // far enough → truly dark
  });

  test('soft floor does NOT touch in-range values or the range-0 (no-falloff) case', () => {
    const nUp = { x: 0, y: 0, z: 1 };
    // The original Phase-2 assertions must hold byte-for-byte.
    const point = { type: 'point', intensity: 1, range: 200, position: { x: 0, y: 0, z: 100 } };
    expect(near(Regions.combinedIntensity(nUp, { x: 0, y: 0, z: 50 }, [point]), 0.75, 1e-6)).toBe(true);
    expect(near(Regions.combinedIntensity(nUp, { x: 0, y: 0, z: -50 }, [point]), 0.25, 1e-6)).toBe(true);
    const noFall = { type: 'point', intensity: 1, range: 0, position: { x: 0, y: 0, z: 100 } };
    expect(near(Regions.combinedIntensity(nUp, { x: 0, y: 0, z: -400 }, [noFall]), 1, 1e-9)).toBe(true);
  });

  test('directional/ambient intensity is INDEPENDENT of the world point (per-sample refactor guard)', () => {
    // The curved-group per-face sampling threads a world point into combined-
    // Intensity; directional and ambient MUST ignore it so directional scenes
    // stay byte-identical no matter which face centroid is passed.
    const sun = { type: 'directional', azimuth: 135, elevation: 45, intensity: 1 };
    const amb = { type: 'ambient', intensity: 0.3 };
    const n = normalizeVec({ x: 0.2, y: 0.9, z: 0.3 });
    const p1 = { x: 999, y: -50, z: 12 };
    const p2 = { x: -333, y: 400, z: -88 };
    expect(Regions.combinedIntensity(n, p1, [sun, amb]))
      .toBe(Regions.combinedIntensity(n, p2, [sun, amb]));
    expect(Regions.combinedIntensity(n, null, [sun, amb]))
      .toBe(Regions.combinedIntensity(n, p1, [sun, amb]));
  });

  test('normalizeParams: an area light carries position + clamped size/samples', () => {
    const p = Params.normalizeParams({
      lights: [{ id: 'a1', type: 'area', position: { x: 10, y: 20, z: 30 }, size: 5000, samples: 99, intensity: 0.8 }],
    });
    const a = p.lights[0];
    expect(a.type).toBe('area');
    expect(a.position).toEqual({ x: 10, y: 20, z: 30 });
    expect(a.size).toBeLessThanOrEqual(600);   // clamped from 5000
    expect(a.samples).toBeLessThanOrEqual(16);  // clamped from 99
    expect(Number.isInteger(a.samples)).toBe(true);
    // Defaults back-fill when absent.
    const d = Params.normalizeParams({ lights: [{ type: 'area' }] }).lights[0];
    expect(d.size).toBe(120);
    expect(d.samples).toBe(6);
    expect(d.position).toBeTruthy();
  });

  test('band round-trip: low I → band 0, high I → top band', () => {
    const nB = TONE.ladder.length;
    expect(Regions.band(0, TONE)).toBe(0);
    expect(Regions.band(1, TONE)).toBe(nB - 1);
    // an intensity just above the first threshold lands in band 1
    expect(Regions.band(TONE.thresholds[0] + 1e-6, TONE)).toBe(1);
  });

  test('coverage ladder is monotonic; spacing decreases with coverage for each pen width', () => {
    const nB = TONE.ladder.length;
    [0.2, 0.35, 0.5].forEach((pw) => {
      let prevCoverage = -Infinity;
      let prevSpacing = Infinity;
      for (let b = 0; b < nB; b++) {
        const cov = Regions.coverageFor(b, TONE);
        const sp = Regions.coverageToSpacing(cov, pw);
        expect(cov).toBeGreaterThan(prevCoverage); // dark→light increasing
        expect(sp).toBeLessThan(prevSpacing);      // denser coverage → tighter
        expect(sp).toBeGreaterThanOrEqual(pw);     // never finer than the pen
        prevCoverage = cov;
        prevSpacing = sp;
      }
    });
  });

  test('coverageToSpacing round-trip and clamps degenerate coverage', () => {
    // coverage 1 → spacing == pen width (solid); coverage 0 → clamped, finite.
    expect(near(Regions.coverageToSpacing(1, 0.3), 0.3, 1e-9)).toBe(true);
    expect(Number.isFinite(Regions.coverageToSpacing(0, 0.3))).toBe(true);
  });

  test('toneLadder swatch: one row per band, spacing matches coverageToSpacing', () => {
    const rows = Regions.toneLadder(TONE, 0.35);
    expect(rows.length).toBe(TONE.ladder.length);
    rows.forEach((row, i) => {
      expect(row.band).toBe(i);
      expect(near(row.spacing, Regions.coverageToSpacing(row.coverage, 0.35), 1e-9)).toBe(true);
    });
  });

  test('deterministic: same inputs → identical intensity/spacing', () => {
    const light = { azimuth: 70, elevation: 25 };
    const n = { x: 0.2, y: 0.9, z: 0.3 };
    expect(Regions.intensity(n, light)).toBe(Regions.intensity(n, light));
    expect(Regions.spacingFor(n, Regions.towardLight(light), TONE, 0.35))
      .toBe(Regions.spacingFor(n, Regions.towardLight(light), TONE, 0.35));
  });
});
