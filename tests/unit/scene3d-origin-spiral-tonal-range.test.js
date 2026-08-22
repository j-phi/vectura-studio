const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * originSpiral tonal spacing + wrap (surface-fill-mono.js `lawSpiral`).
 *
 * THE CONVENTION. See `scene3d-turing-polarity.test.js`'s header for the full
 * statement of the shared `areaFor`/`pitchFor`/`pitchLegible` contract
 * (`surface-fill-mono.js:495-501`): brighter `I` -> larger pitch (sparser),
 * darker `I` -> smaller pitch (denser).
 *
 * THE BUG (structural, not a tuning slip). The original law integrated a
 * single radius against a single, ever-advancing angle:
 * `r(phi) = r0 + INTEGRAL(pitch(phi')/(2*pi)) dphi'`. The spacing between
 * turn K and turn K+1 AT A FIXED ANGLE theta is that integral evaluated over
 * the window [theta, theta + 2*pi] -- exactly one full period -- and the
 * integral of a 2*pi-periodic function over any window of exactly one period
 * is the SAME constant no matter where the window starts. So every angle's
 * ring-to-ring spacing converged on the same silhouette-wide average pitch,
 * regardless of how sharply the local pitch itself varied: measured
 * lit/shadow ink-density ratio 0.975 (flat, in the direction that reads as
 * slightly BACKWARDS) even though the per-sample target pitch driving the
 * walk swung a genuine ~2x between shadow (~0.37mm) and lit (~0.72mm)
 * averages -- proof the flatness was structural, not a coverage or
 * off-surface-budget bug.
 *
 * THE FIX. Rings are now a recurrence, not an integral:
 * `r_{k+1}(theta) = r_k(theta) + pitchFor(I(r_k(theta), theta))`. Ring K+1's
 * radius at a given angle is defined directly from ring K's OWN radius and
 * tone AT THAT SAME angle, so consecutive-ring spacing at any angle is
 * exactly the local pitch there, with no averaging across the rest of the
 * form. The rings are still stitched into one continuous polyline (a seam at
 * theta = 0 bridges ring K to ring K+1), so the law is still the single
 * wound line its name promises.
 *
 * THIS TEST measures real generated geometry with the identical
 * scene/harness `scene3d-turing-polarity.test.js` and
 * `scene3d-maze-tonal-range.test.js` use (sphere, world +X light only,
 * azimuth 90 / elevation 45, screen-right = lit / screen-left = shadow).
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D originSpiral tonal spacing + wrap', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  }, 60000);
  afterAll(() => runtime.cleanup());

  const scene = (toneLaw) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1',
      name: 's',
      primitive: 'sphere',
      params: { radius: 46, detail: 24 },
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw } },
      byObject: {},
      byFace: {},
    };
    p.tone = clone(defaults).tone;
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 45, castShadows: false }];
    return p;
  };

  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  // Identical to the harness in scene3d-turing-polarity.test.js /
  // scene3d-maze-tonal-range.test.js. Quintile 0 = leftmost fifth (shadow,
  // world -X); quintile 4 = rightmost fifth (lit, world +X).
  const quintileDensity = (paths) => {
    const ff = fills(paths);
    let minX = 1e9; let maxX = -1e9;
    ff.forEach((pp) => pp.forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); }));
    const cx = (minX + maxX) / 2; const R = (maxX - minX) / 2;
    const span = Math.max(1e-6, maxX - minX); const binW = span / 5;
    const lens = new Array(5).fill(0); const areas = new Array(5).fill(0);
    ff.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) {
        const mx = (pp[i - 1].x + pp[i].x) / 2;
        const len = Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
        let b = Math.floor(((mx - minX) / span) * 5);
        b = Math.max(0, Math.min(4, b));
        lens[b] += len;
      }
    });
    for (let b = 0; b < 5; b += 1) {
      const x0 = minX + b * binW; const x1 = x0 + binW;
      const N = 12; let a = 0;
      for (let k = 0; k < N; k += 1) {
        const x = x0 + (x1 - x0) * ((k + 0.5) / N);
        const d = x - cx;
        a += 2 * Math.sqrt(Math.max(0, R * R - d * d)) * (binW / N);
      }
      areas[b] = a;
    }
    return lens.map((l, i) => l / Math.max(1e-6, areas[i]));
  };

  test('originSpiral: shadow (screen-left) density meaningfully exceeds lit (screen-right) density', () => {
    const paths = algo.generate(scene('originSpiral'), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    const d = quintileDensity(paths);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[4]).toBeGreaterThan(0);
    // Pre-fix (single dr/dphi integral) measured 0.9953/1.0210 = 0.975 --
    // flat, and on the wrong side of 1 to boot. Post-fix (per-angle ring
    // recurrence) measured ~1.50. 1.2 sits strictly between the two.
    expect(d[0] / d[4]).toBeGreaterThan(1.2);
  }, 60000);

  test('originSpiral: segment count stays bounded (no dark-end explosion)', () => {
    const paths = algo.generate(scene('originSpiral'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    let segCount = 0;
    ff.forEach((pp) => { segCount += Math.max(0, pp.length - 1); });
    // Pre-fix measured ~20300 segments. Post-fix (finer angular resolution
    // needed so the outermost ring's chord stays smooth) measured ~24400.
    // 80000 leaves comfortable headroom while still catching a runaway.
    expect(segCount).toBeLessThan(80000);
  }, 60000);

  // THE CONSTANT-PEN-WIDTH CONSTRAINT. Tone must ride geometry spacing, never
  // a per-path stroke-weight channel -- this repo already carries a separate
  // `meta.weightScale` channel and it is the WRONG lever for a monoline law
  // (see this file's header, `surface-fill-mono.js:1-8`). Every emitted path
  // must therefore carry the SAME weight (absent or 1), regardless of how
  // tight the local turns are.
  test('originSpiral: tone rides pattern spacing, not stroke weight (no meta.weightScale)', () => {
    const paths = algo.generate(scene('originSpiral'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    expect(ff.length).toBeGreaterThan(0);
    const weights = new Set(ff.map((pp) => (pp.meta && pp.meta.weightScale != null ? pp.meta.weightScale : 1)));
    expect(weights.size).toBe(1);
    expect([...weights][0]).toBe(1);
  }, 60000);

  test('mazeFill: tone rides pattern spacing, not stroke weight (no meta.weightScale)', () => {
    const paths = algo.generate(scene('mazeFill'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    expect(ff.length).toBeGreaterThan(0);
    const weights = new Set(ff.map((pp) => (pp.meta && pp.meta.weightScale != null ? pp.meta.weightScale : 1)));
    expect(weights.size).toBe(1);
    expect([...weights][0]).toBe(1);
  }, 60000);
});
