const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * voronoiWeb dark-end cell size (surface-fill-mono.js `lawVoronoi`).
 *
 * THE CONVENTION. See `scene3d-turing-polarity.test.js`'s header for the full
 * `areaFor`/`pitchFor`/`pitchLegible` contract (`surface-fill-mono.js:495-
 * 501`). `voronoiWeb` is the owner-confirmed-correct reference law: its own
 * header states "Dark => many seeds => small cells => more edge length per
 * square millimetre" — brighter cells are bigger, darker cells are smaller.
 * `lawVoronoi` already gets the DIRECTION right (the reference check in
 * `scene3d-turing-polarity.test.js` passes), but its seed radius is built
 * from `pitchLegible`, the "never crowd past legibility" variant that floors
 * at `FLOOR` (~2 ink widths) — the same floor-plateau shape the sibling
 * `mazeFill` bug hit (`scene3d-maze-tonal-range.test.js`). The owner's own
 * words: "the highlight is the most open area of the voronoi — I'd love to
 * see busier/smaller cells near areas of shadow." The current floor caps how
 * small a shadow cell can get well above what the network is capable of.
 *
 * THE FIX. Swap the seed radius (and its matching spatial-hash `GRID`) from
 * `pitchLegible` to `pitchFor` — the flooring-capable variant every "reaches
 * black" law in this file that is allowed to crowd past the legibility floor
 * already uses (see e.g. `lawEtf`, `lawDefect`, `lawMezzo`). `pitchFor(I)`
 * is IDENTICAL to `pitchLegible(I)` for every `I` whose natural pitch is
 * already above `FLOOR` — so the lit end of the map, where the owner
 * explicitly wants the CURRENT character preserved, is mathematically
 * unchanged. Only the dark end, where `pitchFor(I)` would have wanted to go
 * below `FLOOR` and was being clamped up, is affected — it can now shrink
 * toward `INK / A_DARK`, well below the old floor, delivering the
 * "busier/smaller cells near shadow" the owner asked for.
 *
 * THIS TEST measures real generated geometry with the identical
 * scene/harness `scene3d-turing-polarity.test.js` uses. Since a Voronoi
 * network's total edge length scales with sqrt(seed count) but its EDGE
 * COUNT (one path per wall) scales linearly with seed count, and seed count
 * is inversely proportional to cell AREA, edge-count-per-unit-area is a more
 * direct proxy for "1 / mean cell size" than ink length. The test partitions
 * emitted Voronoi wall paths into screen-X quintiles by midpoint and counts
 * PATHS per unit area (not ink length) in the shadow quintile vs the lit
 * quintile.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D voronoiWeb dark-end cell size', () => {
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

  // Edges (one path per Voronoi wall) per unit AREA in a screen-X quintile of
  // the silhouette bbox, area-normalized the same way
  // scene3d-turing-polarity.test.js's quintileDensity is. Quintile 0 =
  // leftmost fifth (shadow, world -X); quintile 4 = rightmost fifth (lit,
  // world +X). Edge count per area is proportional to 1 / mean cell area.
  const quintileEdgeDensity = (paths) => {
    const ff = fills(paths);
    let minX = 1e9; let maxX = -1e9;
    ff.forEach((pp) => pp.forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); }));
    const cx = (minX + maxX) / 2; const R = (maxX - minX) / 2;
    const span = Math.max(1e-6, maxX - minX); const binW = span / 5;
    const counts = new Array(5).fill(0); const areas = new Array(5).fill(0);
    ff.forEach((pp) => {
      let sx = 0; let n = 0;
      pp.forEach((pt) => { sx += pt.x; n += 1; });
      const mx = n ? sx / n : 0;
      let b = Math.floor(((mx - minX) / span) * 5);
      b = Math.max(0, Math.min(4, b));
      counts[b] += 1;
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
    return counts.map((c, i) => c / Math.max(1e-6, areas[i]));
  };

  test('voronoiWeb: shadow (screen-left) has more, smaller cells than lit (screen-right)', () => {
    const paths = algo.generate(scene('voronoiWeb'), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    const d = quintileEdgeDensity(paths);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[4]).toBeGreaterThan(0);
    // Pre-fix (rad from pitchLegible, floored at FLOOR for most of the dark
    // range) measured edge-density ratio 1.171 — direction correct but weak.
    // Post-fix (rad from pitchFor, allowed to crowd past FLOOR at the dark
    // end) measured 1.304. 1.22 sits strictly between the two: it fails on
    // the pre-fix behaviour and passes on the corrected one.
    expect(d[0] / d[4]).toBeGreaterThan(1.22);
  }, 60000);

  test('voronoiWeb: lit-end character is preserved (unchanged within noise)', () => {
    const paths = algo.generate(scene('voronoiWeb'), null, null, BOUNDS) || [];
    const d = quintileEdgeDensity(paths);
    // Pre-fix measured lit-quintile (index 4) edge density: see this file's
    // sibling table run. `pitchFor` is IDENTICAL to `pitchLegible` for any I
    // whose natural pitch already clears FLOOR, so the lit end (which sits
    // above that threshold) should be unaffected by the dark-end swap,
    // within the seed-adjacency noise a shared dart-throwing pass can carry
    // across the tone boundary.
    const PRE_FIX_LIT_EDGE_DENSITY = 1.2863732808958204;
    expect(d[4]).toBeGreaterThan(PRE_FIX_LIT_EDGE_DENSITY * 0.7);
    expect(d[4]).toBeLessThan(PRE_FIX_LIT_EDGE_DENSITY * 1.3);
  }, 60000);

  test('voronoiWeb: cell/segment count stays bounded (no dark-end explosion)', () => {
    const paths = algo.generate(scene('voronoiWeb'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    let segCount = 0;
    ff.forEach((pp) => { segCount += Math.max(0, pp.length - 1); });
    // Today's (pre-fix) measured segment count is ~24100 and the dart-throw
    // budget (TRIES = 26000) already bounds worst-case seed count. This
    // guards against a future change quietly blowing past that by an order
    // of magnitude.
    expect(segCount).toBeLessThan(120000);
    expect(ff.length).toBeLessThan(26000);
  }, 60000);
});
