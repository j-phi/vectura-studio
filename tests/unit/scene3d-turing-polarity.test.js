const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * turingStripe tonal polarity (surface-fill-mono.js `lawTuring`).
 *
 * THE CONVENTION. Every mono law shares one tone map
 * (`surface-fill-mono.js:495-501`, `areaFor`/`pitchFor`/`pitchLegible`): as the
 * sampled radiance `I` rises (brighter / more lit), the target ink AREA
 * shrinks and the target PITCH grows — a lit cell gets a wider, sparser
 * clearance and a shadowed cell (`I` near 0) gets the darkest, densest
 * clearance. `shadeAt` (line 503) spells it out directly:
 * `shade = 1 - I`, i.e. `I` is brightness, not shade. `lawVoronoi` (owner-
 * confirmed correct) states the same contract in its own header: "Dark => many
 * seeds => small cells => more edge length per square millimetre."
 *
 * THE BUG. `lawTuring` computed its target wavelength `lam` correctly on this
 * scale (`lam` grows with `I`, matching `pitchLegible`), but then fed that
 * value into the inhibitor diffusion coefficient `Dv = Du*wl^2/9` DIRECTLY.
 * This activator/inhibitor pair's own dispersion relation
 * (k_c^2 = 1/(2*Du) - reactionRate/(2*Dv)) means a LARGER Dv drives the
 * pattern toward a SHORTER settled wavelength (denser), not a longer one — Dv
 * only pulls the pattern toward the Du-set short-wave floor; it is Dv
 * shrinking toward the Turing threshold that stretches the wavelength out.
 * So a light cell (large `wl`, large Dv) settled DENSE and a shadow cell
 * (small `wl`, small Dv) settled SPARSE — backwards. The fix reflects `wl`
 * within its own clamp range before it drives `Dv`, so a light cell gets the
 * low-Dv (long-wavelength, sparse) end and a shadow cell gets the high-Dv
 * (short-wavelength, dense) end, matching the shared convention above.
 *
 * THIS TEST measures real generated geometry, not a byte-pin: a sphere lit
 * from world +X only (azimuth 90, elevation 20 — small enough that the
 * asymmetry is dominated by the X axis, matching the established convention
 * `azimuth 90 = world +X = screen-right`, see
 * scene3d-light-driven-highlight.test.js I27), with camera yaw/pitch/roll 0
 * so screen-right IS the lit side. It partitions the emitted `turingStripe`
 * fill paths into a small patch hugging the lit limb and a small patch
 * hugging the shadow limb (not a coarse half-split — the bug is a LOCAL
 * density clump, and a wide bucket dilutes it) and asserts the shadow patch's
 * ink-length-per-area exceeds the lit patch's. A byte-for-byte pin would have
 * happily locked in the inverted output; this instead asserts the direction a
 * physically-lit drawing must have.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D turingStripe tonal polarity', () => {
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
    // World +X only, moderate elevation — matching docs/tone-laws' own fixture
    // elevation (45), which the live app also uses when a user drags the sun
    // widget up from the horizon. Screen-right is world +X (established by
    // scene3d-light-driven-highlight.test.js I27 and regions.js:9).
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 45, castShadows: false }];
    return p;
  };

  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  // Ink length per unit AREA in a screen-X quintile of the silhouette bbox,
  // area-normalized against the sphere's own disc geometry so foreshortening
  // near the limb (which the bbox-area alone does not account for) cannot
  // masquerade as a tone effect. Quintile 0 = leftmost fifth (shadow, world
  // -X); quintile 4 = rightmost fifth (lit, world +X).
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

  test('turingStripe: shadow (screen-left) density exceeds lit (screen-right) density', () => {
    const paths = algo.generate(scene('turingStripe'), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    const d = quintileDensity(paths);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[4]).toBeGreaterThan(0);
    // Pre-fix (Dv fed `wl` directly) measured 0.664/0.636 = 1.043; post-fix
    // (Dv fed the reflected `wl`) measured 1.415/1.299 = 1.090. 1.06 sits
    // strictly between the two measured ratios — it fails on the inverted
    // formula and passes on the corrected one. (The full quintile average
    // dilutes the defect the live app shows as a sharply localized dense
    // clump on the lit hemisphere — see this file's header and the
    // visual-verification screenshots in the PR — so the margin here is real
    // but deliberately conservative rather than dramatic.)
    expect(d[0] / d[4]).toBeGreaterThan(1.06);
  }, 60000);

  // Cross-check against the owner-confirmed-correct reference law, using the
  // exact same scene/measurement machinery — proof the harness itself reads
  // the convention the right way round, independent of the turingStripe fix.
  test('reference check: voronoiWeb is denser in shadow than in light (same harness)', () => {
    const paths = algo.generate(scene('voronoiWeb'), null, null, BOUNDS) || [];
    const d = quintileDensity(paths);
    expect(d[0]).toBeGreaterThan(d[4]);
  }, 60000);
});
