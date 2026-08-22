const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * mazeFill tonal spacing (surface-fill-mono.js `lawMaze`).
 *
 * THE CONVENTION. See `scene3d-turing-polarity.test.js`'s header for the full
 * statement of the shared `areaFor`/`pitchFor`/`pitchLegible` contract
 * (`surface-fill-mono.js:495-501`): brighter `I` -> larger pitch (sparser),
 * darker `I` -> smaller pitch (denser), floored at `FLOOR` (~2 ink widths —
 * `pitchLegible` is the "never crowd past legibility" variant every
 * "reaches black" mono law that means it LITERALLY, incl. `mazeFill`'s own
 * header, uses).
 *
 * THE BUG. `lawMaze` walks its grid lines forward by `pitchLegible(avg local
 * I)`. On a typical lit sphere the RAW local-average I this walk samples
 * rarely climbs high enough to push `pitchFor(I)` above `FLOOR` — measured
 * here, only the brightest ~5% of the visible width crosses that threshold,
 * so ~95% of the grid lines are laid at the SAME floor pitch regardless of
 * how dark the tone actually is there. The maze is not literally undefined
 * or backwards, it is FLAT: shadow and highlight both mostly render at the
 * legibility floor, and the measured lit/shadow ink-density ratio sits at
 * ~0.99 — within noise of 1.0, not a real tonal response.
 *
 * THE FIX. Before feeding the local average into `pitchLegible`, stretch it
 * over its OWN measured min/max on this particular form — the exact
 * technique `lawCrevice`'s ambient-occlusion term already uses in this same
 * file, for the identical reason ("an unstretched term delivers an L* span
 * of 3"). That maps the form's real observed tone range onto the full 0..1
 * `pitchFor` domain, so genuinely dark columns/rows sit at `FLOOR` (still
 * "reaches black" - the intent stated in `lawMaze`'s own header is
 * preserved) and genuinely light ones climb toward `PMAX`, instead of
 * everything but the last few percent collapsing onto the same plateau.
 *
 * THIS TEST measures real generated geometry with the identical
 * scene/harness `scene3d-turing-polarity.test.js` uses (sphere, world +X
 * light only, azimuth 90 / elevation 45, screen-right = lit / screen-left =
 * shadow) so the two files stay directly comparable. It asserts the
 * shadow-quintile ink density meaningfully exceeds the lit-quintile density
 * — a margin that fails on the flat pre-fix behaviour (~0.99) and passes
 * once the stretch restores a real tonal gradient.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D mazeFill tonal spacing', () => {
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

  // Ink length per unit AREA in a screen-X quintile of the silhouette bbox,
  // area-normalized against the sphere's own disc geometry. Quintile 0 =
  // leftmost fifth (shadow, world -X); quintile 4 = rightmost fifth (lit,
  // world +X). Identical to the harness in scene3d-turing-polarity.test.js.
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

  test('mazeFill: shadow (screen-left) density meaningfully exceeds lit (screen-right) density', () => {
    const paths = algo.generate(scene('mazeFill'), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    const d = quintileDensity(paths);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[4]).toBeGreaterThan(0);
    // Pre-fix (unstretched local average, floor-clamped over ~95% of the
    // width) measured 1.4405/1.4587 = 0.988 — flat, fails this margin.
    // Post-fix (stretched over the form's own observed range) restores a
    // real gradient. 1.15 sits strictly above the flat measurement.
    expect(d[0] / d[4]).toBeGreaterThan(1.15);
  }, 60000);

  test('mazeFill: cell/segment count stays bounded (no dark-end explosion)', () => {
    const paths = algo.generate(scene('mazeFill'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    let segCount = 0;
    ff.forEach((pp) => { segCount += Math.max(0, pp.length - 1); });
    // Today's (pre-fix) measured segment count is ~24300. The 300-line grid
    // cap already bounds worst-case cost; this just guards against a future
    // change quietly blowing past it by an order of magnitude.
    expect(segCount).toBeLessThan(120000);
  }, 60000);
});
