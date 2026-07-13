/*
 * Raster-Plane — hidden-line removal & occlusion bias (RGR coverage).
 *
 * Three behaviors land together here:
 *   1. Over-occlusion fix (Lines as Planes, See-Through OFF). buildLines used to
 *      pass the RAW depthBias (0.5) into the painter occlusion, while buildBars
 *      floors the bias at a fraction of the occluder depth spread. On a tall
 *      relief the unscaled bias let a curtain whose mean depth merely grazed a
 *      co-depth neighbor clip genuinely-nearer (front) ridges — front lines
 *      vanished. buildLines now applies the same depth-spread floor.
 *   2. Plain Lines hidden-line removal (Lines as Planes OFF, See-Through OFF).
 *      Plain lines used to ignore See-Through entirely and always stack. They now
 *      hang an invisible curtain to the floor as a painter occluder so back rows
 *      are hidden behind nearer ridges — emitting ONLY the wire, no plane edges.
 *   3. The Occlusion Bias control (p.depthBias) loosens hidden-line removal.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Raster-Plane — hidden-line removal & occlusion bias', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 400 };
  const gen = (extra, seed = 13) =>
    V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'lines', rows: 18, sampleDetail: 36, amplitude: 24, artworkSize: 150, smoothing: 0, ...extra },
      null,
      new V.SimpleNoise(seed),
      bounds,
    );

  const topEdges = (paths) => paths.filter((p) => p.meta && p.meta.planeTop);
  const segLen = (path) => {
    let len = 0;
    for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return len;
  };
  // Total visible line length is the honest occlusion metric: counting paths is
  // misleading because heavy occlusion fragments one edge into many short runs.
  const visibleLen = (paths) => paths.reduce((s, p) => s + (Array.isArray(p) ? segLen(p) : 0), 0);
  // A relief at a realistic scale where the curtains genuinely occlude each other.
  const bigBounds = { width: 800, height: 600 };
  const relief = (extra) =>
    V.AlgorithmRegistry.rasterPlane.generate(
      { mode: 'lines', rows: 42, sampleDetail: 84, amplitude: 20.5, artworkSize: 150, smoothing: 0, rotate: -45, tilt: 60, horizontalLinesAsPlanes: true, ...extra },
      null,
      new V.SimpleNoise(1),
      bigBounds,
    );

  // ---- 2. Plain Lines hidden-line removal -------------------------------------

  test('Plain Lines, See-Through OFF: occludes back rows (no longer a no-op)', () => {
    const on = gen({ horizontalLinesAsPlanes: false, seeThrough: true });
    const off = gen({ horizontalLinesAsPlanes: false, seeThrough: false });

    expect(on.length).toBeGreaterThan(0);
    expect(off.length).toBeGreaterThan(0);
    // Before the fix See-Through was ignored for plain lines, so OFF === ON.
    expect(JSON.stringify(off)).not.toBe(JSON.stringify(on));

    // See-Through ON keeps the lean multi-point polyline per row (Curves-friendly).
    expect(on.some((p) => Array.isArray(p) && p.length >= 3)).toBe(true);

    // See-Through OFF runs floating-horizon HLR: clean continuous runs (mode
    // 'remove' drops hidden spans — never dashes them), tagged as rasterPlane wires.
    expect(off.every((p) => !(p.meta && p.meta.hiddenLine === true))).toBe(true);
    expect(off.some((p) => p.meta && p.meta.algorithm === 'rasterPlane' && p.meta.mode === 'lines')).toBe(true);
    // No painter shatter: visible spans are a handful of runs per row, not the
    // hundreds of sub-pixel ticks the old curtain-occluder produced.
    expect(off.length).toBeLessThan(42 * 6);
  });

  test('Plain Lines, See-Through OFF: occlusion bites at a low view angle (ridgeline plot)', () => {
    // Wire occlusion is geometry-dependent: a low tilt stacks the rows so nearer
    // ridges genuinely hide farther ones. At the default tilt (60°) the rows don't
    // overlap and occlusion is a near-no-op — that's correct, not a bug. Verify the
    // wires-only curtain truly removes line length where the geometry warrants it,
    // and that the Occlusion Bias recovers it (same per-segment representation, so
    // the comparison is apples-to-apples).
    const lowTilt = (extra) =>
      V.AlgorithmRegistry.rasterPlane.generate(
        { mode: 'lines', rows: 42, sampleDetail: 84, amplitude: 40, artworkSize: 150, smoothing: 0, rotate: 0, tilt: 20, horizontalLinesAsPlanes: false, seeThrough: false, ...extra },
        null,
        new V.SimpleNoise(1),
        bigBounds,
      );
    const tight = visibleLen(lowTilt({ depthBias: 0 }));
    const loose = visibleLen(lowTilt({ depthBias: 3 }));
    const on = visibleLen(lowTilt({ seeThrough: true }));
    expect(tight).toBeGreaterThan(0);
    // Maximum occlusion removes a substantial fraction of the wireframe...
    expect(tight).toBeLessThan(on * 0.8);
    // ...and raising the Occlusion Bias recovers much of it.
    expect(loose).toBeGreaterThan(tight * 1.2);
  });

  test('Plain Lines, See-Through ON: unchanged stacked wires (no occlusion)', () => {
    const on = gen({ horizontalLinesAsPlanes: false, seeThrough: true });
    // Legacy path: no plane edges, no hidden dashes — just row polylines.
    expect(on.every((p) => !(p.meta && (p.meta.planeTop || p.meta.planeBase || p.meta.planeDrop)))).toBe(true);
  });

  // ---- 1. Lines-as-Planes solid occlusion (floating-horizon HLR) --------------

  test('Lines as Planes, See-Through OFF: occludes back rows behind nearer curtains', () => {
    // The relief draws the top ridgeline of each row plus the front-bottom contour;
    // the curtain bodies (floor contours) are occluder-only, so this measures
    // genuine top-on-top hidden-line removal. At a low, strongly-stacking tilt the
    // nearer curtains hide the tops of the rows behind them, so See-Through OFF
    // draws materially less ridge line than See-Through ON. (At the default high
    // tilt the rows fan out and don't overlap — correctly a near-no-op.)
    const cfg = { rotate: 0, tilt: 15, baseHeight: 1 };
    const on = visibleLen(relief({ ...cfg, seeThrough: true }));
    const off = visibleLen(relief({ ...cfg, seeThrough: false, depthBias: 0 }));
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThan(on * 0.9); // ≥10% of the ridge hidden behind nearer curtains
  });

  test('Lines as Planes, See-Through OFF: solid block — side faces + bottom drawn, no painter shatter', () => {
    // Contract per "every plane must have a side and bottom, occluded only when
    // another plane blocks it." Each curtain is a closed wall (top + risers + floor):
    // the dense stack of risers fills the front/side FACES and the floors the bottom,
    // so a healthy chunk of the drawn length is near-vertical riser geometry. The
    // outer silhouette legitimately fragments into ~one short edge-sliver per row
    // (each receding wall peeking above its neighbour) — that is wanted, not noise —
    // but the occluder must NOT shatter into hundreds of sub-pixel ticks (the old
    // painter bug). So: sides present, and tiny detached runs bounded by the row count.
    const rowCount = 42;
    const paths = relief({ rows: rowCount, rotate: -45, tilt: 60, baseHeight: 1, seeThrough: false, depthBias: 0.5 });
    expect(paths.length).toBeGreaterThan(10);
    // Side faces really drawn: sum the near-vertical (riser) edge length.
    let riserLen = 0;
    for (const p of paths) {
      for (let i = 1; i < p.length; i++) {
        const dx = Math.abs(p[i].x - p[i - 1].x);
        const dy = Math.abs(p[i].y - p[i - 1].y);
        if (dy > dx * 1.5) riserLen += Math.hypot(dx, dy);
      }
    }
    expect(riserLen).toBeGreaterThan(100); // the solid has visible side/bottom faces
    // No shatter: at most ~one detached edge-sliver per row, not the hundreds the
    // old curtain-occluder produced.
    const lens = paths.map((p) => segLen(p));
    const med = [...lens].sort((a, b) => a - b)[Math.floor(lens.length / 2)];
    const tiny = lens.filter((l) => l < med * 0.1);
    expect(tiny.length).toBeLessThanOrEqual(rowCount);
  });

  test('Lines as Planes, See-Through OFF: the frontmost curtain draws its side risers (solid wall, not bare lines)', () => {
    // Regression for "we lost the sides of the planes": the fringe fix above also
    // stopped drawing EVERY side riser, collapsing the relief to a stack of floating
    // top lines + one floor contour with no plane sides. The nearest curtain is
    // processed first against an empty horizon, so it can draw its FULL closed wall
    // outline (top ridgeline + right riser + floor + left riser) whole — no clipping,
    // hence no fringe — while farther curtains stay riser-free. Proof the sides are
    // back: a closed drawn path (first point == last) that spans a real fraction of
    // the top→floor height. An open top/floor profile satisfies neither.
    const paths = relief({ rotate: -45, tilt: 60, baseHeight: 2, seeThrough: false, depthBias: 0.5 });
    let ymin = Infinity, ymax = -Infinity;
    for (const p of paths) for (const pt of p) { if (pt.y < ymin) ymin = pt.y; if (pt.y > ymax) ymax = pt.y; }
    const spanY = ymax - ymin;
    const closedWall = paths.find((p) => p.meta && p.meta.frontWall && Array.isArray(p) && p.length >= 4
      && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6);
    expect(closedWall).toBeTruthy(); // the front curtain draws as a closed loop → it has sides
    let lo = Infinity, hi = -Infinity;
    for (const pt of closedWall) { if (pt.y < lo) lo = pt.y; if (pt.y > hi) hi = pt.y; }
    expect(hi - lo).toBeGreaterThan(spanY * 0.3); // the wall spans top → floor, not a flat sliver
  });

  // ---- 3. Occlusion Bias control ----------------------------------------------

  test('Occlusion Bias: raising it monotonically recovers occluded lines', () => {
    // depthBias is the floating-horizon screen tolerance (px): a larger value keeps
    // more silhouette-grazing lines whole, so visible length is non-decreasing. Use a
    // low tilt where the ridgelines genuinely overlap (the default high tilt fans the
    // rows apart, so there's nothing for the bias to recover).
    const cfg = { rotate: 0, tilt: 15, baseHeight: 1, seeThrough: false };
    const tight = visibleLen(relief({ ...cfg, depthBias: 0 }));
    const mid = visibleLen(relief({ ...cfg, depthBias: 3 }));
    const loose = visibleLen(relief({ ...cfg, depthBias: 50 }));
    expect(mid).toBeGreaterThanOrEqual(tight);
    expect(loose).toBeGreaterThanOrEqual(mid);
    // The control must actually bite across its range.
    expect(loose).toBeGreaterThan(tight * 1.05);
  });

  test('Occlusion Bias: raising it keeps more grazing lines than the zero default', () => {
    // Enabling Lines as Planes now seeds depthBias 0 — clip exactly at the silhouette.
    // (It used to seed 1.5, and since the bias IS the slack a farther row gets before
    // being hidden, that let every row poke over a pixel through the curtain in front
    // of it.) Raising the slider is the opt-in for keeping grazing lines whole, so a
    // loose tolerance must still retain at least as much line as the exact default.
    const zeroTol = visibleLen(relief({ seeThrough: false, depthBias: 0 }));
    const loosened = visibleLen(relief({ seeThrough: false, depthBias: 1.5 }));
    expect(loosened).toBeGreaterThanOrEqual(zeroTol);
  });

  // ---- 4. Floating-horizon integration locks (the user's reported angle) ------

  test('Lines as Planes, See-Through OFF: the curtain reads SOLID at rotate -60 / tilt 19', () => {
    // The reported angle. A solid extruded relief must occlude the back rows behind
    // nearer curtains rather than leak them through. Apples-to-apples tight vs loose
    // Occlusion Bias: the tight pass hides a measurable fraction of the ridge that a
    // no-occlusion pass would draw (the old painter left the model see-through here).
    const cfg = { rotate: -60, tilt: 19, baseHeight: 1, seeThrough: false };
    const tight = visibleLen(relief({ ...cfg, depthBias: 0 }));
    const loose = visibleLen(relief({ ...cfg, depthBias: 50 }));
    expect(tight).toBeGreaterThan(0);
    expect(tight).toBeLessThan(loose * 0.97);   // occlusion bites — back tops hidden
    expect(tight).toBeGreaterThan(loose * 0.3); // sanity: not collapsed to nothing
  });

  test('Plain Lines, See-Through OFF: visible spans are long continuous runs (no shatter)', () => {
    // The user's image #4 symptom: the old painter shattered each row into hundreds
    // of sub-pixel ticks (mean run length ≈ 1px). Floating-horizon emits clean
    // multi-segment runs.
    const off = relief({ horizontalLinesAsPlanes: false, rotate: 0, tilt: 20, amplitude: 40, seeThrough: false, depthBias: 0.5 });
    const runs = off.filter((p) => Array.isArray(p));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every((p) => p.length >= 2)).toBe(true);
    expect(visibleLen(off) / runs.length).toBeGreaterThan(10);
  });

  test('Plain Lines, See-Through OFF: roll handling stays coherent at rotate -60 / tilt 19', () => {
    // The roll angle is derived per-render from a projected row's screen direction.
    // A wrong axis would measure the horizon band sideways and mass-occlude (or
    // mass-leak). At this flatter tilt most line should survive (ratio ≈ 0.95).
    const on = visibleLen(relief({ horizontalLinesAsPlanes: false, rotate: -60, tilt: 19, seeThrough: true }));
    const off = visibleLen(relief({ horizontalLinesAsPlanes: false, rotate: -60, tilt: 19, seeThrough: false, depthBias: 0.5 }));
    expect(off).toBeGreaterThan(on * 0.6);
    expect(off).toBeLessThanOrEqual(on + 1);
  });
});
