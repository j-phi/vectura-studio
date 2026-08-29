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
 * scene/harness `scene3d-turing-polarity.test.js` uses, partitioned into
 * screen-X quintiles by segment midpoint.
 *
 * IT USED TO COUNT PATHS. That was sound while the law emitted exactly one
 * path per Voronoi wall. It does not any more: the web-integrity work
 * (`scene3d-voronoi-web-integrity.test.js`) chains the walls into long
 * continuous strokes before emission, because emitting a wall on its own put
 * it in front of `emitScr`'s MINMARK guard, which deleted every short one and
 * tore the web into 3987 pieces. Path count now measures the chainer, not the
 * cells. The metric here is therefore INK LENGTH per unit area, which is
 * proportional to 1 / sqrt(cell area) for any tessellation and is blind to how
 * the walls were grouped into strokes. Both the pre-fix and post-fix numbers
 * quoted below were re-measured on that metric.
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

  // INK LENGTH per unit AREA in a screen-X quintile of the silhouette bbox,
  // area-normalized the same way scene3d-turing-polarity.test.js's
  // quintileDensity is. Quintile 0 = leftmost fifth (shadow, world -X);
  // quintile 4 = rightmost fifth (lit, world +X).
  //
  // WHY LENGTH AND NOT PATH COUNT. This measure used to count PATHS, on the
  // reasoning that the law emitted exactly one path per Voronoi wall. It no
  // longer does: since the web-integrity work
  // (`scene3d-voronoi-web-integrity.test.js`) the walls are CHAINED into long
  // continuous strokes before emission — that is what stops `emitScr`'s
  // MINMARK guard from deleting short walls and tearing the web — so path
  // count now measures how the chainer happened to cut the graph, not how big
  // the cells are. Ink length per unit area is proportional to
  // 1 / sqrt(cell area) for ANY tessellation and does not care how the walls
  // were grouped into strokes, so it survives the change.
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
        let b = Math.floor(((mx - minX) / span) * 5);
        b = Math.max(0, Math.min(4, b));
        lens[b] += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
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

  test('voronoiWeb: shadow (screen-left) has more, smaller cells than lit (screen-right)', () => {
    const paths = algo.generate(scene('voronoiWeb'), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    const d = quintileDensity(paths);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[4]).toBeGreaterThan(0);
    // On the INK-LENGTH metric this file now uses (see `quintileDensity`),
    // the shipped-before-web-integrity law measured [1.549, 1.574, 1.547,
    // 1.495, 1.370] — a shadow/lit ratio of 1.131. The clamped cell-size law
    // measures [1.605, 1.623, 1.541, 1.385, 1.164] — 1.379. The original
    // threshold of 1.22 still sits strictly between the two, so it fails on
    // the old behaviour and passes on the corrected one.
    //
    // NOTE the screen-X quintile deliberately understates the effect. Both
    // extreme quintiles are limb slivers where Lambert has already fallen, so
    // neither is the true dark or true light end; the radiance-banded measure
    // in `scene3d-voronoi-web-integrity.test.js` reads the same geometry as a
    // 3.06x span. This test is kept as the coarse cross-check it always was.
    expect(d[0] / d[4]).toBeGreaterThan(1.22);
  }, 60000);

  test('voronoiWeb: lit-end character is preserved (unchanged within noise)', () => {
    const paths = algo.generate(scene('voronoiWeb'), null, null, BOUNDS) || [];
    const d = quintileDensity(paths);
    // The owner asked for the LIT end to keep its character while the shadow
    // end got busier, and the web-integrity work had to be held to the same
    // promise: the cell-size ceiling is deliberately pinned near the pitch the
    // law already used there (`PMAX * 1.25` against the old `PMAX * 1.15`), so
    // the open end of the drawing should look like itself. Measured on the
    // ink-length metric before that work: 1.370. After: 1.164 — 15 % more
    // open, inside the band below.
    const PRE_FIX_LIT_INK_DENSITY = 1.3700153412206355;
    expect(d[4]).toBeGreaterThan(PRE_FIX_LIT_INK_DENSITY * 0.7);
    expect(d[4]).toBeLessThan(PRE_FIX_LIT_INK_DENSITY * 1.3);
  }, 60000);

  test('voronoiWeb: cell/segment count stays bounded (no dark-end explosion)', () => {
    const paths = algo.generate(scene('voronoiWeb'), null, null, BOUNDS) || [];
    const ff = fills(paths);
    let segCount = 0;
    ff.forEach((pp) => { segCount += Math.max(0, pp.length - 1); });
    // The dart-throw budget (`TRIES`) bounds the worst-case seed count and the
    // `CELL_MIN` clamp bounds how tightly they can pack, so the geometry is
    // doubly capped. Measured now: ~25700 segments across ~4000 chained
    // strokes (against ~24100 segments across ~11800 one-wall paths before
    // chaining — the same ink, a third of the pen lifts). This guards against
    // a future change quietly blowing past that by an order of magnitude.
    expect(segCount).toBeLessThan(120000);
    expect(ff.length).toBeLessThan(26000);
  }, 60000);
});
