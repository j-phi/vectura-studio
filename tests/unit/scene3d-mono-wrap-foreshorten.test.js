const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * originSpiral / mazeFill WRAP (surface-fill-mono.js `wrapPitch`).
 *
 * BEFORE THIS FIX, both laws built their geometry entirely in flat SCREEN
 * (x, y): `originSpiral` grew a ring radius from a fixed screen origin,
 * `mazeFill` walked a grid at fixed screen x/y steps. Neither read anything
 * about how much of the actual curved surface a given screen millimetre
 * represents, so a turn or a grid cell was the same physical size on screen
 * whether it sat dead-centre on the form (facing the camera) or was riding
 * the limb (nearly edge-on) -- a flat projection sitting on top of the
 * curvature, not following it.
 *
 * THE FIX reuses a signal `surface-fill.js` already computes and already
 * spends for an analogous purpose: `nz`, the camera-space normal's z
 * component (1 dead-on to the camera, 0 exactly ON the silhouette; see
 * `surface-fill.js:3513-3524`'s `limbCrossTaper`, "the taper is stated in
 * the geometry's own terms and needs no radius, no bbox and no projection
 * assumption"). `wrapPitch` (surface-fill-mono.js) folds the tone-driven
 * pitch tighter as `nz` approaches 0, bounded so it can compress a pitch to
 * at most a fraction of its tone-only value -- deliberately conservative,
 * because pattern SCALE carrying TONE is this file's load-bearing
 * constraint and wrap must not compete with it for the same ink budget (an
 * earlier, stronger setting in this session pushed originSpiral's
 * shadow/lit ratio from 1.5 down to 1.06 before it was caught and dialled
 * back).
 *
 * THIS TEST isolates the wrap effect from tone with a same-scene,
 * mechanism-toggled comparison rather than a threshold pulled from thin
 * air: it measures ink density in the outer 12% of the sphere's own radius
 * (the "rim", low nz) against the inner 50% (the "core", high nz almost
 * everywhere), on the SAME sphere/light/camera used by the tonal-range
 * tests. Comparing rim/core density directly to a tone-only quintile split
 * would conflate wrap with tone (the rim happens to straddle both the
 * lit and shadow limbs); this radial split does not, because it pools ALL
 * azimuths at a given radius, so tone contributes roughly the same net
 * amount to both bands and only curvature/wrap should move the ratio.
 * Measured with `wrapPitch` compiled out (git-stash of this file back to
 * the prior, scale-ramp-only commit): originSpiral rim/core = 0.892,
 * mazeFill rim/core = 0.781 -- the rim was NOT denser than the core, i.e.
 * no wrap signal. With `wrapPitch` wired in: originSpiral rim/core = 1.260,
 * mazeFill rim/core = 0.815 -- both moved in the compressing direction,
 * mazeFill's more modestly because its own `pitchLegible` floor (mazeFill's
 * stated identity: "reaches black where the cell drops to about two ink
 * widths", never below) caps how far wrap can additionally compress it.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D originSpiral / mazeFill wrap (limb foreshortening)', () => {
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

  // Rim (outer 12% of the sphere's own screen radius, from ITS OWN centre —
  // not either law's own origin) vs core (inner 50%). Pooling every azimuth
  // at a given radius means tone contributes roughly evenly to both bands.
  const rimVsCore = (paths) => {
    const ff = fills(paths);
    let minX = 1e9; let maxX = -1e9; let minY = 1e9; let maxY = -1e9;
    ff.forEach((pp) => pp.forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }));
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2;
    const R = Math.max(maxX - minX, maxY - minY) / 2;
    let rimLen = 0; let coreLen = 0;
    const rimArea = Math.PI * (R * R - (0.88 * R) * (0.88 * R));
    const coreArea = Math.PI * (0.5 * R) * (0.5 * R);
    ff.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) {
        const mx = (pp[i - 1].x + pp[i].x) / 2; const my = (pp[i - 1].y + pp[i].y) / 2;
        const d = Math.hypot(mx - cx, my - cy) / R;
        const len = Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
        if (d >= 0.88) rimLen += len;
        else if (d <= 0.5) coreLen += len;
      }
    });
    return rimLen / rimArea / (coreLen / coreArea);
  };

  test('originSpiral: rim (near-limb) density exceeds core (face-on) density', () => {
    const paths = algo.generate(scene('originSpiral'), null, null, BOUNDS) || [];
    const ratio = rimVsCore(paths);
    // Pre-wrap (confirmed via git stash of surface-fill-mono.js back to the
    // scale-ramp-only commit) measured 0.892 -- the rim was SPARSER than
    // the core, no wrap signal. Post-wrap measured 1.260. 1.05 sits
    // strictly between the two.
    expect(ratio).toBeGreaterThan(1.05);
  }, 60000);

  test('mazeFill: rim (near-limb) density exceeds its pre-wrap baseline', () => {
    const paths = algo.generate(scene('mazeFill'), null, null, BOUNDS) || [];
    const ratio = rimVsCore(paths);
    // Pre-wrap measured 0.781 (the rim is still less dense than the core in
    // absolute terms here -- mazeFill's own boundary cells shrink the live
    // grid near the true silhouette regardless of wrap -- but the WRAP
    // TERM'S OWN contribution is what this test isolates). Post-wrap
    // measured 0.815. 0.795 sits strictly between the two.
    expect(ratio).toBeGreaterThan(0.795);
  }, 60000);

  // THE CONSTANT-PEN-WIDTH CONSTRAINT, restated for the wrap term
  // specifically: compressing pattern spacing near the limb must still ride
  // geometry, never stroke weight.
  test('wrap does not introduce a varying meta.weightScale on either law', () => {
    ['originSpiral', 'mazeFill'].forEach((law) => {
      const paths = algo.generate(scene(law), null, null, BOUNDS) || [];
      const ff = fills(paths);
      expect(ff.length).toBeGreaterThan(0);
      const weights = new Set(ff.map((pp) => (pp.meta && pp.meta.weightScale != null ? pp.meta.weightScale : 1)));
      expect(weights.size).toBe(1);
      expect([...weights][0]).toBe(1);
    });
  }, 60000);
});
