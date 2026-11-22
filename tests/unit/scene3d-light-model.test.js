/**
 * Light realism U1 — Regions.shade: ambient + bounce + specular light model.
 * legacy == combinedIntensity byte for byte; v2 adds A (ambient), R (bounce),
 * S (view-dependent specular peaking where n = normalize(L + e)).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const DEG = Math.PI / 180;
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rvec = () => norm({ x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() * 2 - 1 });

describe('Regions.shade', () => {
  let R; let Lighting;
  beforeAll(async () => {
    const rt = await loadVecturaRuntime();
    R = rt.window.Vectura.Scene3D.Regions;
    Lighting = rt.window.Vectura.Scene3D.Lighting;
  });

  const sun = { type: 'directional', azimuth: 135, elevation: 45, intensity: 1 };

  test('legacy is byte-identical to combinedIntensity on 1000 random samples', () => {
    const lights = [sun, { type: 'point', position: { x: 50, y: 80, z: 20 }, intensity: 0.7, range: 400 },
      { type: 'ambient', intensity: 0.1 }];
    for (let i = 0; i < 1000; i++) {
      const n = rvec(); const p = { x: rnd() * 100 - 50, y: rnd() * 100 - 50, z: rnd() * 100 - 50 };
      const shadowFn = i % 3 === 0 ? (pt, l) => l.type === 'point' : undefined;
      const out = R.shade(n, p, lights, { model: 'legacy', eye: rvec(), shadowFn });
      const ref = R.combinedIntensity(n, p, lights, shadowFn);
      expect(out.L).toBe(ref);
      expect(out.S).toBe(0);
    }
    expect(R.shade(rvec(), { x: 0, y: 0, z: 0 }, [sun], {}).S).toBe(0); // default model is legacy
  });

  test('v2 specular peaks at n = normalize(L + e) within 1 degree', () => {
    const e = norm({ x: 0.2, y: 0.3, z: 1 });
    const L = R.towardLight(sun);
    const H = norm({ x: L.x + e.x, y: L.y + e.y, z: L.z + e.z });
    let best = -1; let bestN = null;
    for (let i = 0; i < 40000; i++) {
      const n = rvec();
      const s = R.shade(n, { x: 0, y: 0, z: 0 }, [sun], { model: 'v2', eye: e }).S;
      if (s > best) { best = s; bestN = n; }
    }
    expect(Math.acos(Math.min(1, dot(bestN, H))) / DEG).toBeLessThan(1.5); // sampling resolution
    const atH = R.shade(H, { x: 0, y: 0, z: 0 }, [sun], { model: 'v2', eye: e });
    expect(atH.S).toBeCloseTo(1, 6);
    // within 1 degree of H the peak is >= cos(1deg)^shininess, and strictly the maximum at H
    const tilt = norm({ x: H.x + 0.01, y: H.y, z: H.z });
    expect(R.shade(tilt, { x: 0, y: 0, z: 0 }, [sun], { model: 'v2', eye: e }).S).toBeLessThan(atH.S);
  });

  test('v2 specular needs an eye, is gated by shadow and by n.L > 0', () => {
    const e = { x: 0, y: 0, z: 1 };
    const L = R.towardLight(sun);
    const H = norm({ x: L.x + e.x, y: L.y + e.y, z: L.z + e.z });
    const p0 = { x: 0, y: 0, z: 0 };
    expect(R.shade(H, p0, [sun], { model: 'v2', eye: null }).S).toBe(0);
    expect(R.shade(H, p0, [sun], { model: 'v2', eye: e, shadowFn: () => true }).S).toBe(0);
    const back = R.shade({ x: -L.x, y: -L.y, z: -L.z }, p0, [sun], { model: 'v2', eye: e });
    expect(back.S).toBe(0);
  });

  test('v2 ambient lifts the unlit back face; bounce lifts the attached-shadow rim', () => {
    const L = R.towardLight(sun);
    const away = { x: -L.x, y: -L.y, z: -L.z };
    const p0 = { x: 0, y: 0, z: 0 };
    const v2 = R.shade(away, p0, [sun], { model: 'v2', eye: { x: 0, y: 0, z: 1 }, ambient: 0.08, bounce: 0 });
    expect(R.shade(away, p0, [sun], { model: 'legacy' }).L).toBe(0);
    expect(v2.A).toBeCloseTo(0.08, 9);
    expect(v2.L).toBeCloseTo(0.08, 9);
    const withBounce = R.shade(away, p0, [sun], { model: 'v2', ambient: 0.08, bounce: 0.12 });
    expect(withBounce.L).toBeGreaterThan(v2.L + 0.1);
    // default constants when opts omit them
    const dflt = R.shade(away, p0, [sun], { model: 'v2' });
    expect(dflt.A).toBeCloseTo(R.SHADE_DEFAULTS.a0, 9);
    expect(dflt.L).toBeCloseTo(R.SHADE_DEFAULTS.a0 + R.SHADE_DEFAULTS.r0, 9);
    // lit side: L = A + D, clamped
    const lit = R.shade(L, p0, [sun], { model: 'v2' });
    expect(lit.D).toBeCloseTo(1, 9);
    expect(lit.L).toBe(1);
    // ambient-type scene lights add to A and are never shadowed
    const amb = R.shade(away, p0, [sun, { type: 'ambient', intensity: 0.2 }],
      { model: 'v2', ambient: 0.05, bounce: 0, shadowFn: () => true });
    expect(amb.A).toBeCloseTo(0.25, 9);
    expect(amb.L).toBeCloseTo(0.25, 9);
  });

  test('exports tunable constants and specular mask edges', () => {
    const d = R.SHADE_DEFAULTS;
    expect(d.a0).toBe(0.08); expect(d.r0).toBe(0.12); expect(d.ks).toBe(1);
    expect(d.s0).toBeLessThan(d.s1);
    expect(Lighting).toBeTruthy();
  });
});
