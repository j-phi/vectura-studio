/*
 * Raster-Plane — Lines as Planes must clip EXACTLY at the curtain border.
 *
 * With See-Through OFF each row extrudes a free-standing curtain, and the
 * floating-horizon pass hides whatever lies behind a plan-nearer one. Two
 * opposite defects live at that border, and a fix for either one alone just
 * trades it for the other — so both are pinned here, at five heights:
 *
 *   overlap  — a farther row drawn INSIDE a nearer curtain. The screen-space
 *              horizon test only hides a sample once it is past the Occlusion
 *              Bias margin, so any bias > 0 lets the row punch through by up to
 *              that much: little hooks and whiskers at every junction.
 *   gap      — a clipped run that stops SHORT of the border. The horizon is
 *              sampled on a ~1px grid, so a run cut at the last outside sample
 *              ends up to one sample shy of the true crossing: a hanging line.
 *
 * The contract is "visible AT the border, with no overlap": clipped ends land
 * ON the silhouette, and no ink survives inside it.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — Lines as Planes clip exactly at the curtain border', () => {
  let runtime;
  let V;
  let G3;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    G3 = V.Geometry3D;
  });

  afterAll(() => runtime.cleanup());

  const BOUNDS = { width: 800, height: 600 };
  const AMPS = [20, 50, 80, 110, 145];
  const ROWS = 42;
  const SIZE = 150;

  const pointInPoly = (px, py, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  const distToPolyEdge = (px, py, poly) => {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j].x, ay = poly[j].y, bx = poly[i].x, by = poly[i].y;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) best = d;
    }
    return best;
  };
  const eachSample = (p, step, cb) => {
    for (let i = 0; i < p.length - 1; i++) {
      const n = Math.max(1, Math.round(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y) / step));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        cb(p[i].x + (p[i + 1].x - p[i].x) * t, p[i].y + (p[i + 1].y - p[i].y) * t);
      }
    }
  };
  const inkOf = (paths) => paths.reduce((s, p) => {
    let d = 0;
    for (let i = 0; i < p.length - 1; i++) d += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
    return s + d;
  }, 0);

  // Generate, capturing the UNCLIPPED curtain loops the horizon pass is handed.
  // They are the ground truth for "inside a nearer curtain" — the emitted paths
  // are already clipped and cannot answer that question about themselves.
  const build = (extra = {}) => {
    const params = {
      mode: 'lines', rows: ROWS, sampleDetail: 84, artworkSize: SIZE,
      rotate: -45, tilt: 60, roll: 0, horizontalLinesAsPlanes: true, baseHeight: 0,
      seeThrough: false, planeWidth: 1, mapBlur: 18, amplitude: 80, ...extra,
    };
    let captured = null;
    const orig = G3.occludeRowsFloatingHorizon;
    G3.occludeRowsFloatingHorizon = (rows, opts) => { captured = rows; return orig(rows, opts); };
    let paths;
    try {
      paths = V.AlgorithmRegistry.rasterPlane.generate(params, null, new V.SimpleNoise(7), BOUNDS);
    } finally {
      G3.occludeRowsFloatingHorizon = orig;
    }
    const curtains = (captured || []).filter((r) => r && r.occludes !== false && r.meta && r.meta.row != null);
    // Plan depth increases monotonically with row index; take its sign from the
    // projection rather than assuming which end of the sheet faces the camera.
    const planZ = (py) => G3.rotatePoint({ x: 0, y: 0, z: py }, { yaw: params.rotate, pitch: params.tilt, roll: 0 }).z;
    const zAt = (row) => planZ(-SIZE / 2 + (row / (ROWS - 1)) * SIZE);
    const dir = Math.sign(zAt(ROWS - 1) - zAt(0)) || 1;
    const nearerThan = (row) => curtains.filter((c) => (c.meta.row - row) * dir > 0);
    const drawn = paths.filter((p) => Array.isArray(p) && p.length >= 2 && p.meta && p.meta.row != null);
    return { paths, drawn, curtains, nearerThan, ink: inkOf(paths) };
  };

  it.each(AMPS)('draws no ink inside a plan-nearer curtain (amplitude %i)', (amplitude) => {
    const { drawn, nearerThan } = build({ amplitude });
    expect(drawn.length).toBeGreaterThan(0);

    let worst = 0;
    let worstAt = null;
    let breaches = 0;
    drawn.forEach((p) => {
      const nearer = nearerThan(p.meta.row);
      eachSample(p, 1, (x, y) => {
        for (const c of nearer) {
          if (!pointInPoly(x, y, c.pts)) continue;
          const pen = distToPolyEdge(x, y, c.pts);
          if (pen > 0.05) breaches++;
          if (pen > worst) { worst = pen; worstAt = { row: p.meta.row, into: c.meta.row, x: +x.toFixed(1), y: +y.toFixed(1) }; }
        }
      });
    });
    expect(
      breaches,
      `${breaches} points break through a nearer curtain; deepest ${worst.toFixed(2)}px ${JSON.stringify(worstAt)}`,
    ).toBe(0);
  });

  it.each(AMPS)('ends clipped runs ON the border, not short of it (amplitude %i)', (amplitude) => {
    const { drawn, nearerThan } = build({ amplitude });

    // An endpoint was produced BY a clip iff stepping a hair further along the
    // run's own direction lands inside the curtain that cut it. That endpoint
    // must sit on that curtain's silhouette — any distance is a hanging line.
    // Measure the PERPENDICULAR distance from the end to the border that cut it —
    // that is the error you can actually see. (Measuring along the line's own
    // direction instead would wildly overstate a grazing cut: where a row slips
    // behind a ridge at a shallow angle, a hair of perpendicular error stretches
    // into a long along-the-line distance while remaining invisible.)
    //
    // Where several nearer curtains overlap, the run was cut by whichever border it
    // reached first, so score the closest — otherwise curtains stacked behind the
    // cutting one get counted as phantom gaps.
    //
    // The bound is a quarter-pixel, not zero: the horizon rasterises its occluders
    // into columns, so it rounds the silhouette by a fraction of the column pitch
    // and cannot be exactly zero by construction. A quarter-pixel is far under both
    // a plotted line's width and a screen pixel — the defect this pins is the old
    // HALF-pixel hooks, which were plainly visible.
    const STEP = 0.3;
    const TOL = 0.25;
    let worstGap = 0;
    let hanging = 0;
    drawn.forEach((p) => {
      const closed = Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-9;
      if (closed) return;
      const nearer = nearerThan(p.meta.row);
      const ends = [
        { end: p[0], prev: p[1] },
        { end: p[p.length - 1], prev: p[p.length - 2] },
      ];
      ends.forEach(({ end, prev }) => {
        const dx = end.x - prev.x, dy = end.y - prev.y;
        const L = Math.hypot(dx, dy);
        if (!L) return;
        const ax = end.x + (dx / L) * STEP, ay = end.y + (dy / L) * STEP;
        let gap = Infinity;
        for (const c of nearer) {
          if (!pointInPoly(ax, ay, c.pts)) continue;   // a curtain that could have cut the run
          gap = Math.min(gap, distToPolyEdge(end.x, end.y, c.pts));
        }
        if (!Number.isFinite(gap)) return;             // not a clipped end at all
        if (gap > TOL) hanging++;
        if (gap > worstGap) worstGap = gap;
      });
    });
    expect(
      hanging,
      `${hanging} clipped ends hang short of the curtain that cut them; worst ${worstGap.toFixed(2)}px`,
    ).toBe(0);
    // Half a pixel was the old defect's size — nothing may come back at that scale.
    expect(worstGap).toBeLessThan(0.5);
  });

  it('keeps the drawing intact — exact clipping must not eat the wireframe', () => {
    // Guards the opposite failure: a "fix" that simply occludes MORE would sail
    // through both border tests while quietly deleting the artwork.
    //
    // The front-most curtain is the sharpest invariant available — nothing is in
    // front of it, so exact clipping must leave its closed outline untouched. Any
    // over-occlusion deep enough to matter would bite into it.
    AMPS.forEach((amplitude) => {
      const exact = build({ amplitude });
      const front = exact.paths.find((p) => p.meta && p.meta.frontWall);
      expect(front, `amplitude ${amplitude} lost its front curtain entirely`).toBeTruthy();
      const closed = Math.hypot(front[0].x - front[front.length - 1].x, front[0].y - front[front.length - 1].y);
      expect(closed, `amplitude ${amplitude} front curtain is no longer a closed outline`).toBeLessThan(1e-6);

      // And the sheet as a whole survives: a bias of 3px keeps ~3px of extra ink at
      // every clipped end (there are hundreds), so exact clipping is EXPECTED to sit
      // some way below it. This bound only catches a collapse, not that difference.
      const loose = build({ amplitude, depthBias: 3 });
      expect(exact.ink / loose.ink, `amplitude ${amplitude} lost too much ink vs a loose bias`).toBeGreaterThan(0.75);
      expect(exact.drawn.length).toBeGreaterThan(ROWS / 2);
    });
  });

  it('still lets Occlusion Bias loosen the clip when the user asks for it', () => {
    // The exactness is a DEFAULT, not a removal of the control.
    const exact = build({ amplitude: 80 });
    const loose = build({ amplitude: 80, depthBias: 3 });
    expect(loose.ink).toBeGreaterThan(exact.ink);
  });
});
