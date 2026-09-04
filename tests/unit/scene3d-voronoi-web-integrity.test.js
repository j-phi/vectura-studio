const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * voronoiWeb — THE WEB MUST BE A WEB (surface-fill-mono.js `lawVoronoi`).
 *
 * THE REQUIREMENT, in the owner's words: the fill "must clearly read as
 * voronoi with no breaks, but the size of the voronoi openings should be
 * smaller in areas of shadow and larger in areas of highlight."
 *
 * That is two properties, and the law met neither.
 *
 * 1. NO BREAKS. A Voronoi diagram is a connected planar graph: every cell
 *    wall is shared by exactly two cells and meets its neighbours at
 *    degree-3 vertices. The old law emitted every wall as its OWN path
 *    through `emitScr`, and `emitScr` refuses any run shorter than
 *    `MINMARK` (2 x penWidth). Every wall below that length was therefore
 *    silently DELETED, and tone was in effect being expressed by removing
 *    edges — which is exactly what tears the web. It also clipped each
 *    cell against only the neighbours inside `p.r * 3.2`, a radius derived
 *    from the seed's OWN cell size, so across a density gradient a small
 *    dark cell never saw its large lit neighbour, the two cells disagreed
 *    about where their shared wall was, and the ad-hoc "lower key owns the
 *    wall" test then dropped or doubled it.
 *
 *    MEASURED on the sphere fixture before the fix: 3987 connected
 *    components (the largest holding 701 of 15635 welded vertices, 4.5 %),
 *    8229 interior degree-1 vertices — dangling stubs that end in the
 *    middle of the form — and only 846 degree-3 vertices where a real
 *    Voronoi of that seed count would carry thousands.
 *
 * 2. CELL SIZE CARRIES THE TONE. Seed density was already driven by `I`,
 *    but through `pitchFor(I) * 1.15`, whose dark end bottoms out at
 *    `INK / A_DARK * 1.15` = 0.43 mm at a 0.3 mm pen. That is BELOW
 *    `penWidth * 2` — a 0.43 mm cell drawn with a 0.3 mm pen has a 0.13 mm
 *    hole in it and reads as solid black, not as a web. Measured band ink
 *    density across five radiance bands was [1.551, 1.569, 1.538, 1.374,
 *    0.896] — NOT monotonic (the two darkest bands are inverted) and only
 *    a 1.73x span end to end.
 *
 * THE CONTRACT THIS FILE PINS. Cell size is remapped onto an explicit,
 * clamped range: `CELL_MIN = penWidth * 3.25` (a clear opening of
 * 2.25 x penWidth once the two half-pen walls are subtracted, so strictly
 * wider than the `penWidth * 2` floor the owner named) up to a ceiling tied
 * to the form's own screen radius and the app's lightest pitch. Every wall
 * is emitted, chained into long continuous strokes so `MINMARK` can never
 * delete one, and the walls come from a symmetric k-nearest bisector clip
 * with snapped, welded vertices so both cells agree on every shared edge.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const PEN = 0.3;
const BOUNDS = {
  width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: PEN,
};

// Vertex weld tolerance for the graph audit, in mm. Well below the smallest
// cell (0.975 mm) and well above the emitter's own snap grid (0.002 mm), so
// it welds what the law meant to weld and nothing else.
const WELD = 0.05;

describe('Scene3D voronoiWeb web integrity + tone-by-cell-size', () => {
  let runtime; let V; let algo; let defaults;
  let paths; let fills; let C; let diag;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;

    // The substrate keeps its lattice for the harness only when asked. See
    // `surface-fill-mono.js`'s `emit`: "a harness that reimplements `inv` is
    // measuring its own copy".
    runtime.window.__MONO_TRACE = true;

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
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: 'voronoiWeb' } },
      byObject: {},
      byFace: {},
    };
    p.tone = clone(defaults).tone;
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 45, castShadows: false }];

    paths = algo.generate(p, null, null, BOUNDS) || [];
    fills = paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
    C = runtime.window.__MONO_CTX;
    diag = runtime.window.__MONO_DIAG;
  }, 180000);

  afterAll(() => runtime.cleanup());

  /* ── the welded planar graph the emitted ink actually describes ──────────
   * EVERY vertex of every path, not just the endpoints. Once walls are chained
   * into long strokes a junction is an INTERIOR point of the chain that runs
   * through it and an ENDPOINT of the third chain that stops there, so an
   * endpoint-only audit cannot see a junction at all. Welding is a snap to
   * `WELD`: the three cells that meet at a Voronoi vertex all compute it as the
   * circumcentre of the same three seeds, and the emitter inverts identical
   * screen coordinates to an identical surface sample, so the copies are bit
   * identical and land in one bucket.
   */
  let G = null;
  const graph = () => {
    if (G) return G;
    const key = (q) => `${Math.round(q.x / WELD)},${Math.round(q.y / WELD)}`;
    const pos = new Map();
    const adj = new Map();
    const touch = (q) => {
      const k = key(q);
      if (!pos.has(k)) { pos.set(k, q); adj.set(k, new Set()); }
      return k;
    };
    // union-find over the welded vertices, so component ink is one pass
    const parent = new Map();
    const find = (a) => { let r = a; while (parent.get(r) !== r) r = parent.get(r); let c = a; while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n; } return r; };
    const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    const edgeLen = [];
    fills.forEach((pp) => {
      for (let i = 0; i < pp.length; i += 1) {
        const k = touch(pp[i]);
        if (!parent.has(k)) parent.set(k, k);
      }
      for (let i = 1; i < pp.length; i += 1) {
        const a = key(pp[i - 1]); const b = key(pp[i]);
        if (a === b) continue;
        adj.get(a).add(b); adj.get(b).add(a);
        union(a, b);
        edgeLen.push([a, Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y)]);
      }
    });
    const byRoot = new Map();
    let total = 0;
    edgeLen.forEach(([a, L]) => {
      const r = find(a);
      byRoot.set(r, (byRoot.get(r) || 0) + L);
      total += L;
    });
    const inks = [...byRoot.values()].sort((a, b) => b - a);
    G = {
      pos, adj, total, largest: inks[0] || 0, components: inks.length,
    };
    return G;
  };

  // A vertex is ON THE SILHOUETTE when the visible surface runs out within a
  // pen's few tenths of it in ANY direction. Anything else is interior, and an
  // interior degree-1 vertex is a dangling stub — a wall that ends in the
  // middle of the form, going nowhere.
  const isBoundary = (q) => {
    for (let t = 0; t < 12; t += 1) {
      const th = (t * Math.PI) / 6;
      if (!C.inv(q.x + Math.cos(th) * 0.9, q.y + Math.sin(th) * 0.9)) return true;
    }
    return false;
  };

  test('the emitted web is ONE connected graph (no dropped edges)', () => {
    expect(fills.length).toBeGreaterThan(0);
    const g = graph();
    // Pre-fix: 3987 components, the largest holding 8.5 % of the ink.
    expect(g.largest / Math.max(1e-9, g.total)).toBeGreaterThan(0.99);
  }, 180000);

  test('no dangling stubs: every interior vertex has degree >= 2', () => {
    const g = graph();
    const stubs = [...g.adj.entries()]
      .filter(([, s]) => s.size === 1)
      .map(([k]) => g.pos.get(k))
      .filter((q) => !isBoundary(q));
    // Pre-fix: 8229 interior degree-1 vertices.
    expect(stubs.length).toBe(0);
  }, 180000);

  test('the web reads as a Voronoi: most vertices are degree-3 junctions', () => {
    const g = graph();
    const deg3 = [...g.adj.values()].filter((s) => s.size >= 3).length;
    const deg1 = [...g.adj.values()].filter((s) => s.size === 1).length;
    // A Voronoi diagram in general position has ONLY degree-3 vertices.
    // Pre-fix: 846 degree-3 against 8479 degree-1.
    expect(deg3).toBeGreaterThan(deg1 * 8);
  }, 180000);

  // Ink length per unit area is proportional to 1 / sqrt(cell area) for any
  // tessellation, so it is a chaining-agnostic proxy for cell size: it does
  // not care whether the walls were emitted one per path or chained into long
  // strokes. Bands are radiance bands read off the substrate itself.
  const bandDensity = () => {
    const BANDS = 5;
    const len = new Array(BANDS).fill(0);
    const area = new Array(BANDS).fill(0);
    const bandOf = (I) => Math.max(0, Math.min(BANDS - 1, Math.floor(Math.max(0, Math.min(0.999, I)) * BANDS)));
    fills.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) {
        const mx = (pp[i].x + pp[i - 1].x) / 2;
        const my = (pp[i].y + pp[i - 1].y) / 2;
        const s = C.inv(mx, my);
        if (!s) continue;
        len[bandOf(s.I)] += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
      }
    });
    const N = 240;
    const cellA = (C.W / N) * (C.H / N);
    for (let j = 0; j < N; j += 1) {
      for (let i = 0; i < N; i += 1) {
        const s = C.inv(C.minX + (i + 0.5) * (C.W / N), C.minY + (j + 0.5) * (C.H / N));
        if (!s) continue;
        area[bandOf(s.I)] += cellA;
      }
    }
    return len.map((l, i) => (area[i] > 1 ? l / area[i] : null));
  };

  test('cell size grows monotonically with radiance (small in shadow, large in highlight)', () => {
    const d = bandDensity();
    d.forEach((v) => expect(v).toBeGreaterThan(0));
    // Pre-fix: [1.551, 1.569, 1.538, 1.374, 0.896] — bands 0 and 1 INVERTED,
    // which is the defect: the two darkest bands were the same size or worse.
    // Non-increasing, with 3 % of band noise allowed, is the right assertion
    // rather than strictly decreasing: the `CELL_MIN` clamp deliberately puts a
    // PLATEAU on the darkest bands, and that plateau is the owner's own
    // legibility floor doing its job, not a failure to track the light.
    for (let i = 1; i < d.length; i += 1) expect(d[i]).toBeLessThan(d[i - 1] * 1.01);
    // Pre-fix end-to-end span was 1.78x. Post-fix measured
    // [1.608, 1.605, 1.340, 0.984, 0.525] — strictly decreasing, span 3.06x.
    expect(d[0] / d[d.length - 1]).toBeGreaterThan(2.5);
  }, 180000);

  test('the smallest cell stays wider than penWidth * 2', () => {
    expect(diag).toBeTruthy();
    expect(diag.voronoi).toBeTruthy();
    const vd = diag.voronoi;
    // The structural clamp: a Voronoi cell always contains the disc of radius
    // (nearest-neighbour distance / 2), so the cell is at least as wide as the
    // minimum seed separation.
    expect(vd.cellMin).toBeGreaterThan(PEN * 3);
    expect(vd.minSep).toBeGreaterThanOrEqual(vd.cellMin - 1e-6);
    expect(vd.minSep).toBeGreaterThan(PEN * 2);
    // And once the two half-pen walls are subtracted the OPENING is still
    // wider than two pen widths.
    expect(vd.minSep - PEN).toBeGreaterThan(PEN * 2);
  }, 180000);

  test('the largest opening still reads as a cell, not as empty paper', () => {
    expect(diag.voronoi).toBeTruthy();
    const ceiling = diag.voronoi.cellMax;
    expect(ceiling).toBeGreaterThan(diag.voronoi.cellMin * 2.5);
    // Distance transform: the furthest any point of the visible surface sits
    // from ink is half the widest cell. Sampled on a 0.6 mm screen grid.
    const ink = [];
    fills.forEach((pp) => pp.forEach((q) => ink.push(q)));
    const G = 1.5;
    const grid = new Map();
    ink.forEach((q) => {
      const k = `${Math.floor(q.x / G)},${Math.floor(q.y / G)}`;
      let a = grid.get(k);
      if (!a) { a = []; grid.set(k, a); }
      a.push(q);
    });
    const nearest = (x, y) => {
      let best = Infinity;
      const gx = Math.floor(x / G); const gy = Math.floor(y / G);
      for (let ring = 1; ring <= 6; ring += 1) {
        for (let j = -ring; j <= ring; j += 1) {
          for (let i = -ring; i <= ring; i += 1) {
            const a = grid.get(`${gx + i},${gy + j}`);
            if (!a) continue;
            for (let k = 0; k < a.length; k += 1) {
              const d = Math.hypot(a[k].x - x, a[k].y - y);
              if (d < best) best = d;
            }
          }
        }
        if (Number.isFinite(best) && best < (ring - 0.5) * G) break;
      }
      return best;
    };
    const STEP = 0.6;
    let worst = 0;
    for (let y = C.minY; y <= C.maxY; y += STEP) {
      for (let x = C.minX; x <= C.maxX; x += STEP) {
        const s = C.inv(x, y);
        if (!s) continue;
        // Ignore the silhouette band: the web is cut by the form's own edge
        // there, which is a boundary, not an empty cell.
        if (isBoundary({ x, y })) continue;
        const d = nearest(x, y);
        if (d > worst) worst = d;
      }
    }
    // Half the ceiling cell, with slack for a cell that happens to be long.
    expect(worst).toBeLessThan(ceiling * 0.85);
  }, 240000);

  test('nothing lands outside the silhouette', () => {
    let off = 0; let tested = 0;
    fills.forEach((pp) => pp.forEach((q) => { tested += 1; if (!C.inv(q.x, q.y)) off += 1; }));
    expect(tested).toBeGreaterThan(1000);
    expect(off).toBe(0);
    expect(diag.voronoi).toBeTruthy();
    expect(diag.voronoi.seedsOffSurface).toBe(0);
  }, 180000);
});
