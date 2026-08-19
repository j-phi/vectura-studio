const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * A RULING ENDS ON THE BOUNDARY OF VISIBLE SURFACE — NOT ONE SAMPLE SHORT OF IT.
 *
 * `scene3d-fill-seam-continuity` and `scene3d-fill-span-verdict` pin WHY a
 * ruling may stop (the draw/skip verdict is a whole-span property, so a span
 * ends only where the surface does). This file pins WHERE it stops once that
 * verdict has been taken.
 *
 * THE DEFECT. The emitter walks a ruling at `nSteps` samples and keeps the ones
 * whose camera-space normal faces the camera, so a ruling ends at the last
 * sample that happened to test front-facing — up to one whole sample step
 * inside the silhouette. On a SMOOTH chart that costs nothing, because `nz`
 * decays to zero AT the silhouette. On a chart with CREASES it costs the whole
 * step. Measured on the app-default scene (engine.addSceneTree(), zero
 * overrides): the shipped pyramid (`detail: 8`, a 45° wrapped ruling sampled
 * every 3.4 mm) ended its rulings 3.43 mm (hatch/crosshatch) and 4.85 mm
 * (contour) inside open front-facing surface — a bare wedge along both lower
 * slant edges — while sphere, ellipsoid, cylinder, cone, capsule and
 * superellipsoid measured 0.00 mm on the same instrument.
 *
 * THE INSTRUMENT. The reference is the CHART, not the ink. `SurfaceFill.chartFor`
 * is pushed through the same `applyTransform` / `projectWorld` the emitter used
 * and rasterised into a z-buffer, which gives VISIBLE FRONT SURFACE exactly: a
 * screen cell counts only if a front-facing sample lands there AND nothing
 * nearer does. A torus' hole and a knot's interior are excluded by
 * construction, where a convex hull of the ink scored them as bare paper
 * (85 % / 51 % of R), and a fragmented border pass cannot mislead it.
 *
 * Its BOUNDARY is then one thing rather than a list of special cases — the edge
 * of that mask. It is the silhouette where the object ends, the fold where the
 * surface turns away inside its own image (a torus' outer equator, a cylinder's
 * top rim), and the self-occlusion contour HLR cuts against. A ruling may end
 * there, or at a chart POLE (>= 3 rulings converging on one point clear of the
 * boundary). Anything else is a ruling stopping in open surface.
 *
 * The SPIRAL is excluded, deliberately and with a measurement behind it: a
 * helix's rank IS the turn it is on, so a turn begins and ends on the wind
 * meridian, which is open surface. The only continuous variant of that verdict
 * was measured and rejected — it collapsed the tone ramp from 2.06x to 1.04x
 * (see `spanDrops`). It is named, not hidden.
 */

const CELL = 0.35;        // mm, mask raster
const GRID = 420;         // chart samples per axis (edges rasterised, so no holes)
const NZ_FOLD = 0.6;      // mm of z slack the rasterised z-buffer needs at a fold
const TOL_MM = 1.0;       // > 3x the 0.3 mm pen; the defect measured 3.43-4.85 mm

describe('Scene3D.SurfaceFill — a ruling ends on the boundary, not a sample short of it', () => {
  let runtime; let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  const masks = new Map();

  // The APP-DEFAULT scene, verbatim: the Add Layer -> 3D Scene gesture, then the
  // two picks a user makes from the panel (Geometry, Style ▸ Mapper). Nothing
  // else is touched — camera, sun, ground, pen, density and detail are all
  // whatever the app ships, which is the only fixture a live defect can be
  // reproduced on.
  const build = (primitive, mapper) => {
    const eng = new V.VectorEngine();
    eng.currentProfile = { width: 200, height: 200, name: 'boundary-ends' };
    const gid = eng.addSceneTree();
    const obj = eng.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    if (primitive !== 'sphere') eng.setObjectPrimitive(obj.id, primitive);
    if (mapper !== 'hatch') obj.params.style = { penId: null, mapper, params: {} };
    const SF = V.Scene3D.SurfaceFill;
    const orig = SF.buildObject;
    let opts = null;
    SF.buildObject = function wrapped(o) {
      const r = orig.call(this, o);
      if (o && o.mode !== 'plane' && o.mode !== 'box') opts = o;
      return r;
    };
    try { eng.computeAllDisplayGeometry(); } finally { SF.buildObject = orig; }
    const paths = eng.getLayerById(gid).scenePaths || [];
    const fill = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill'
      && p.meta.sceneTarget && p.meta.sceneTarget.objectId === obj.id && !p.meta.sceneTarget.occluded);
    return { opts, fill };
  };

  const maskFor = (primitive, opts) => {
    if (masks.has(primitive)) return masks.get(primitive);
    const SF = V.Scene3D.SurfaceFill;
    const G3 = V.Geometry3D;
    const chart = SF.chartFor(opts.mode, opts.sizes);
    const t = opts.transform || {};
    const rot = { yaw: t.yaw || 0, pitch: t.pitch || 0, roll: t.roll || 0 };
    const cam = opts.camAngles || { yaw: 0, pitch: 0, roll: 0 };
    const E = 1e-3;
    const sub = (u, w) => ({ x: u.x - w.x, y: u.y - w.y, z: u.z - w.z });
    const crs = (u, w) => ({ x: u.y * w.z - u.z * w.y, y: u.z * w.x - u.x * w.z, z: u.x * w.y - u.y * w.x });
    const at = (a, b) => {
      const p = chart(a, b);
      const s = opts.projectWorld(opts.applyTransform(p, t));
      if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
      const ai = Math.min(1 - E, a); const bi = Math.min(1 - E, b);
      const p0 = chart(ai, bi);
      let n = crs(sub(chart(ai + E, bi), p0), sub(chart(ai, bi + E), p0));
      const nl = Math.hypot(n.x, n.y, n.z);
      let nz = 0;                                     // a singular frame IS a fold
      if (nl > 1e-12) {
        n = { x: n.x / nl, y: n.y / nl, z: n.z / nl };
        if (n.x * p0.x + n.y * p0.y + n.z * p0.z < 0) n = { x: -n.x, y: -n.y, z: -n.z };
        nz = G3.rotatePoint(G3.normalize(G3.rotatePoint(n, rot)), cam).z;
      }
      return { x: s.x, y: s.y, z: s.z, nz };
    };

    const rows = [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 0; i <= GRID; i += 1) {
      const row = [];
      for (let j = 0; j <= GRID; j += 1) {
        const s = at(i / GRID, j / GRID);
        row.push(s);
        if (!s) continue;
        if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
        if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
      }
      rows.push(row);
    }
    const ox = minX - 2; const oy = minY - 2;
    const W = Math.ceil((maxX - minX + 4) / CELL) + 1;
    const H = Math.ceil((maxY - minY + 4) / CELL) + 1;
    const zAll = new Float64Array(W * H).fill(-Infinity);   // nearest surface, either side
    const zFront = new Float64Array(W * H).fill(-Infinity); // nearest FRONT-facing surface
    const put = (s) => {
      const gx = Math.round((s.x - ox) / CELL); const gy = Math.round((s.y - oy) / CELL);
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) return;
      const k = gy * W + gx;
      if (s.z > zAll[k]) zAll[k] = s.z;
      if (s.nz > 0 && s.z > zFront[k]) zFront[k] = s.z;
    };
    // Rasterise the parameter grid's EDGES, not just its nodes, so a chart that
    // stretches (a thin knot tube along its length) leaves no holes in the mask.
    const span = (p, q) => {
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / (CELL * 0.7)));
      for (let k = 0; k <= n; k += 1) {
        const f = k / n;
        put({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f, nz: Math.min(p.nz, q.nz) });
      }
    };
    for (let i = 0; i <= GRID; i += 1) {
      for (let j = 0; j <= GRID; j += 1) {
        const s = rows[i][j];
        if (!s) continue;
        put(s);
        if (i < GRID && rows[i + 1][j]) span(s, rows[i + 1][j]);
        if (j < GRID && rows[i][j + 1]) span(s, rows[i][j + 1]);
      }
    }
    // VISIBLE FRONT SURFACE: a front-facing sample lands here and nothing nearer
    // does. `NZ_FOLD` is the depth slack the rasterised z-buffer needs to call
    // two sheets the same sheet at a fold, where they genuinely meet.
    const on = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k += 1) {
      if (zFront[k] > -Infinity && zFront[k] >= zAll[k] - NZ_FOLD) on[k] = 1;
    }
    // BOUNDARY = the edge of that mask, and nothing else needs naming: it IS the
    // silhouette, the fold, and the self-occlusion contour, all at once.
    const bnd = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const k = y * W + x;
        if (!on[k]) continue;
        for (let dy = -1; dy <= 1 && !bnd[k]; dy += 1) {
          for (let dx = -1; dx <= 1 && !bnd[k]; dx += 1) {
            const nx = x + dx; const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H || !on[ny * W + nx]) bnd[k] = 1;
          }
        }
      }
    }
    // Distance (in cells) from every surface cell to the nearest boundary cell.
    // Geodesic distance inside the mask. The queue GROWS — a fixed W*H ring
    // silently truncates (a cell is re-enqueued whenever a shorter path reaches
    // it), and a truncated transform reports Infinity in the middle of the form,
    // which this test would have read as depth 0: a false PASS.
    const D = new Float64Array(W * H).fill(Infinity);
    const q = [];
    for (let k = 0; k < W * H; k += 1) if (bnd[k]) { D[k] = 0; q.push(k); }
    for (let head = 0; head < q.length; head += 1) {
      const k0 = q[head];
      const x = k0 % W; const y = Math.floor(k0 / W);
      const d = D[k0];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx; const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (!on[nk]) continue;
          const nd = d + Math.hypot(dx, dy);
          if (nd < D[nk] - 1e-9) { D[nk] = nd; q.push(nk); }
        }
      }
    }
    const depth = (x, y) => {
      const gx = Math.round((x - ox) / CELL); const gy = Math.round((y - oy) / CELL);
      if (gx < 0 || gy < 0 || gx >= W || gy >= H) return 0;
      const k = gy * W + gx;
      return on[k] && Number.isFinite(D[k]) ? D[k] * CELL : 0;
    };
    const out = { depth, stats: () => { let n=0, mx=0; for (let k=0;k<W*H;k+=1) if (on[k]) { n+=1; if (Number.isFinite(D[k]) && D[k]*CELL>mx) mx=D[k]*CELL; } return { cells: n, maxDepth: +mx.toFixed(2) }; } };
    masks.set(primitive, out);
    return out;
  };

  const freeEnds = (primitive, mapper) => {
    const { opts, fill } = build(primitive, mapper);
    expect(opts).toBeTruthy();
    expect(fill.length).toBeGreaterThan(4);
    const { depth } = maskFor(primitive, opts);
    const raw = [];
    fill.forEach((p) => {
      if (p.length < 2) return;
      if (Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 0.05) return; // closed ring
      [p[0], p[p.length - 1]].forEach((q) => raw.push({ x: q.x, y: q.y }));
    });
    const clusters = [];
    raw.forEach((e) => {
      const c = clusters.find((cc) => Math.hypot(cc.x - e.x, cc.y - e.y) < 0.8);
      if (c) { c.n += 1; c.x = (c.x * (c.n - 1) + e.x) / c.n; c.y = (c.y * (c.n - 1) + e.y) / c.n; } else clusters.push({ x: e.x, y: e.y, n: 1 });
    });
    const poles = clusters.filter((c) => c.n >= 3 && depth(c.x, c.y) > TOL_MM);
    return raw
      .filter((e) => !poles.some((pl) => Math.hypot(e.x - pl.x, e.y - pl.y) < 0.8))
      .map((e) => ({ x: +e.x.toFixed(1), y: +e.y.toFixed(1), mm: +depth(e.x, e.y).toFixed(2) }))
      .sort((a, b) => b.mm - a.mm);
  };

  const PRIMS = ['sphere', 'ellipsoid', 'cylinder', 'cone', 'torus', 'torusKnot', 'capsule', 'superellipsoid', 'pyramid'];
  const CASES = [];
  PRIMS.forEach((p) => ['hatch', 'crosshatch', 'contour', 'stipple'].forEach((m) => CASES.push([p, m])));

  // NAMED EXCEPTIONS — measured, not waived, and still pinned.
  //
  // A contour ring on a torus (or a knot) is a circle around the TUBE, and at
  // the extreme left and right of the ring that circle is seen edge-on: the
  // near and far sheets meet TANGENTIALLY, so a 0.35 mm raster cannot separate
  // them and the mask's edge sits a millimetre or two away from where the sheet
  // actually stops. The ends themselves are produced by `edgeAt`, which by
  // construction lands within 1/4096 of a sample step of the front/back
  // crossing, and they sit exactly there positionally:
  //   torus · contour     3 ends of 100, 1.83 / 1.48 / 1.05 mm, at x 77.4 and
  //                       122.6 — the two ends of a ring whose bbox is x
  //                       [74.9, 125.1], i.e. the outer equator.
  //   torusKnot · contour 2 ends of 154, 1.05 mm, same cause on a 1.20 mm tube.
  // The allowance is the instrument's resolution at a tangency, not a licence:
  // it is a hard ceiling per cell, and 2 mm is still half the 4.5 mm tube.
  const ALLOW = { 'torus/contour': 2.0, 'torusKnot/contour': 1.5 };

  test.each(CASES)('%s · %s: no ruling stops in open front-facing surface', (primitive, mapper) => {
    const bar = ALLOW[`${primitive}/${mapper}`] || TOL_MM;
    const free = freeEnds(primitive, mapper);
    const worst = free[0] || { mm: 0 };
    // Report the offenders, not just the maximum, so a regression names itself.
    expect({ over: free.filter((e) => e.mm > bar) }).toEqual({ over: [] });
    expect(worst.mm).toBeLessThanOrEqual(bar);
  }, 40000);

  test('the named exceptions are exceptions: everything else clears the 1 mm bar', () => {
    expect(Object.keys(ALLOW).sort()).toEqual(['torus/contour', 'torusKnot/contour']);
    // 36 of 38 cells hold the bar outright.
    expect(CASES.length - Object.keys(ALLOW).length).toBe(34);
  });

  // ── THE FLAT CAPS ───────────────────────────────────────────────────────
  // `Charts.topoCylinder` is an open tube and `Charts.topoCone` is a lateral
  // cone, so before `chartFor` capped them the curved fill could not reach the
  // disc the MESH builds and the border pass rims: the app-default cylinder
  // rendered with a completely bare top cap, measured as a 15.1 mm ink-free
  // hole — six times the widest gap anywhere else in the matrix, and the only
  // one that reads as a hole rather than as tone.
  describe('the chart reaches the flat caps', () => {
    test('a cylinder chart closes on BOTH cap centres, a cone on its base only', () => {
      const SF = V.Scene3D.SurfaceFill;
      const sizes = { sx: 22.5, sy: 25, sz: 22.5 };
      const cyl = SF.chartFor('cylinder', sizes);
      // a = 0 and a = 1 are now the cap CENTRES (radius 0), not the rims.
      [0, 0.25, 0.5, 0.75].forEach((b) => {
        expect(Math.hypot(cyl(0, b).x, cyl(0, b).z)).toBeLessThan(0.01);
        expect(Math.hypot(cyl(1, b).x, cyl(1, b).z)).toBeLessThan(0.01);
      });
      expect(cyl(0, 0).y).toBeCloseTo(-25, 5);
      expect(cyl(1, 0).y).toBeCloseTo(25, 5);
      // The rim is still reached, at the arc-length split.
      const f = 22.5 / (50 + 2 * 22.5);
      expect(Math.hypot(cyl(f, 0).x, cyl(f, 0).z)).toBeCloseTo(22.5, 5);
      // The cone tapers to a point on its own, so only its BASE is capped.
      const cone = SF.chartFor('cone', sizes);
      expect(Math.hypot(cone(0, 0).x, cone(0, 0).z)).toBeLessThan(0.01);
      expect(Math.hypot(cone(1, 0).x, cone(1, 0).z)).toBeLessThan(0.01);   // the apex
      expect(cone(0, 0).y).toBeCloseTo(-25, 5);
    });

    test('the app-default cylinder puts ink on its top cap', () => {
      const { opts, fill } = build('cylinder', 'hatch');
      const chart = V.Scene3D.SurfaceFill.chartFor(opts.mode, opts.sizes);
      const centre = opts.projectWorld(opts.applyTransform(chart(1, 0), opts.transform || {}));
      let best = Infinity;
      fill.forEach((p) => p.forEach((q) => {
        const d = Math.hypot(q.x - centre.x, q.y - centre.y);
        if (d < best) best = d;
      }));
      // Before the cap existed the nearest fill ink was the rim, a full cap
      // radius away (22.5 mm of world, ~20 mm on screen).
      expect(best).toBeLessThan(5);
    }, 40000);
  });

  test('the bar is tighter than the defect it replaces, and is stated in pen widths', () => {
    expect(TOL_MM).toBeLessThan(3.43);          // the measured hatch/crosshatch pyramid defect
    expect(TOL_MM / 0.3).toBeGreaterThanOrEqual(3);
  });

  test('the instrument can say NO: a fold is a boundary, a bare interior is not', () => {
    // Sanity on the mask itself — the sphere's centre is deep inside the
    // surface and its silhouette is not, so `depth` is not vacuously zero.
    const { opts } = build('sphere', 'hatch');
    const mask = maskFor('sphere', opts);
    expect(mask.stats().cells * CELL * CELL).toBeGreaterThan(1800);  // ~ pi x 25^2 mm2
    expect(mask.depth(100, 76)).toBeGreaterThan(20);     // the middle of a 50 mm ball
    expect(mask.depth(75.4, 76)).toBeLessThan(1.5);      // on its silhouette
  }, 40000);
});
