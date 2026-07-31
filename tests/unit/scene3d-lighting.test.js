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
