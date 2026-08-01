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

describe('Scene3D.Lighting + Regions (CONTRACT L1/L3)', () => {
  let runtime;
  let Lighting;
  let Regions;
  let TONE;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    const V = runtime.window.Vectura;
    Lighting = V.Scene3D.Lighting;
    Regions = V.Scene3D.Regions;
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
    expect(Regions.combinedIntensity(L, null, [{ type: 'area', azimuth: 135, elevation: 45, intensity: 1 }])).toBeGreaterThan(0.9);
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
