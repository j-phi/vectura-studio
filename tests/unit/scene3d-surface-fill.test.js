const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { readHlStageSync } = require('../helpers/read-hl-stage-sync');

// DORMANT UNDER HL_STAGE STAGE 1 (surface-fill.js:276, toneZones / specular:
// false). These two assertions are correct and unmodified. Flip the named flag
// and the test re-arms automatically. See docs/pre-release-hardening-log.md
// PRH-027 and tests/unit/scene3d-hl-stage-roster.test.js, which pins this
// roster.
const STAGE = readHlStageSync();
const whenZones = STAGE.toneZones ? test : test.skip;
const whenSpecular = STAGE.specular ? test : test.skip;

/*
 * Scene3D.SurfaceFill — curved-surface fills that WRAP the 3D form (Jay live-test
 * D/I/F). Before this, a sphere/torus hatch flat-filled the 2D silhouette with
 * parallel scanlines (read as a flat disc), tone had no visible effect, and the
 * highlight was a jarring solid-white disc. Now the fill follows the parametric
 * surface, its density tracks the local light, and the brightest band is left
 * blank (that IS the highlight — the disc is retired).
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D.SurfaceFill — curved fills wrap the form (D/I/F)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const sphereScene = (mapper, light, toneOn = true) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 's', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: toneOn };
    if (light) p.lights = [light];
    return p;
  };
  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  test('module is registered', () => {
    expect(V.Scene3D.SurfaceFill && typeof V.Scene3D.SurfaceFill.buildObject).toBe('function');
  });

  test('curved hatch WRAPS the surface — multi-point polylines, not flat 2-point scanlines', () => {
    const paths = fills(algo.generate(sphereScene('hatch', null, false), null, null, BOUNDS) || []);
    expect(paths.length).toBeGreaterThan(0);
    // A flat scanline fill emits straight 2-point segments; a wrapped meridian is
    // a curved polyline with many points that follow the surface and foreshorten.
    const multi = paths.filter((pp) => pp.length >= 4).length;
    expect(multi).toBeGreaterThan(paths.length * 0.5);
  });

  whenZones('tone reads across the surface: the lit side thins (highlight left blank)', () => {
    const light = { id: 'sun', type: 'directional', azimuth: 270, elevation: 10, castShadows: false };
    const asym = (toneOn) => {
      const paths = fills(algo.generate(sphereScene('contour', light, toneOn), null, null, BOUNDS) || []);
      let minX = 1e9; let maxX = -1e9;
      paths.forEach((pp) => pp.forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); }));
      const cx = (minX + maxX) / 2;
      // INK, not points: the tone ladder splits rulings, and a split adds points
      // without adding ink — so a point count reads a feathered boundary as
      // "denser" and washes the lit/dark asymmetry out. (Same trap as the I27
      // measurement in scene3d-light-driven-highlight.test.js.)
      let l = 0; let r = 0;
      paths.forEach((pp) => {
        for (let i = 1; i < pp.length; i += 1) {
          const mx = (pp[i - 1].x + pp[i].x) / 2;
          const len = Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
          if (mx < cx) l += len; else r += len;
        }
      });
      return Math.abs(l - r) / Math.max(1e-9, l + r);
    };
    // Tone introduces a clear lit/shadow density asymmetry the flat (no-tone) fill
    // doesn't have — the bright side is left blank.
    expect(asym(true)).toBeGreaterThan(asym(false) + 0.08);
  });

  test('hatch ≠ crosshatch (crosshatch adds the perpendicular family)', () => {
    const h = fills(algo.generate(sphereScene('hatch', null, false), null, null, BOUNDS) || []).length;
    const c = fills(algo.generate(sphereScene('crosshatch', null, false), null, null, BOUNDS) || []).length;
    expect(c).toBeGreaterThan(h);
  });

  test('no solid specular disc is emitted (retired — highlight is the blank band)', () => {
    const paths = algo.generate(sphereScene('hatch', null, true), null, null, BOUNDS) || [];
    expect(paths.filter((pp) => pp.meta && pp.meta.specular).length).toBe(0);
  });

  test('deterministic: same params → byte-identical fills', () => {
    const a = JSON.stringify(fills(algo.generate(sphereScene('hatch', null, true), null, null, BOUNDS) || []));
    const b = JSON.stringify(fills(algo.generate(sphereScene('hatch', null, true), null, null, BOUNDS) || []));
    expect(a).toBe(b);
  });

  // ── Items 1+2 (fix-map): SurfaceFill consumes the TONE LADDER, not a purely
  // geometric (i+0.5)/count dither. Band COUNT + coverage + specular now steer
  // the curved fill. ─────────────────────────────────────────────────────────
  const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };
  const toneToned = (mapper, tone) => { const p = sphereScene(mapper, SUN, true); p.tone = tone; return p; };
  const totalPts = (paths) => paths.reduce((acc, pp) => acc + pp.length, 0);
  const bands2 = { enabled: true, bands: 2, thresholds: [0.5], ladder: [0.25, 0.75], specular: { enabled: false, size: 0 } };
  const bands4 = { enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.125, 0.375, 0.625, 0.875], specular: { enabled: false, size: 0 } };

  test('tone BAND COUNT changes the curved fill: Bands 2 ≠ Bands 4 (ladder consumed)', () => {
    const b2 = fills(algo.generate(toneToned('hatch', bands2), null, null, BOUNDS) || []);
    const b4 = fills(algo.generate(toneToned('hatch', bands4), null, null, BOUNDS) || []);
    expect(b2.length).toBeGreaterThan(0);
    expect(b4.length).toBeGreaterThan(0);
    // A geometric (i+0.5)/count dither ignores band count → identical. Consuming
    // the ladder makes the two band counts quantize the surface differently.
    expect(totalPts(b2)).not.toBe(totalPts(b4));
  });

  whenSpecular('specular toggle changes the curved fill (gates the blank glint cap)', () => {
    // Low top threshold so the lit cap reliably reaches the brightest band.
    const on = { enabled: true, bands: 3, thresholds: [0.2, 0.4], ladder: [0.2, 0.5, 0.85], specular: { enabled: true, size: 2 } };
    const off = { ...on, specular: { enabled: false, size: 0 } };
    const a = fills(algo.generate(toneToned('hatch', on), null, null, BOUNDS) || []);
    const b = fills(algo.generate(toneToned('hatch', off), null, null, BOUNDS) || []);
    expect(b.length).toBeGreaterThan(0);
    // Specular ON blanks/sparsens the brightest band → fewer plotted points than
    // OFF (bright reads LIGHTER, not denser — the "dark specular" fix).
    expect(totalPts(a)).toBeLessThan(totalPts(b));
  });
});
