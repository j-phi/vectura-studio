const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Regression for: masking a curve-rendered algorithm (lissajous, spiral, …) changed
// the curve's CHARACTER — smooth arcs became straight radial chords — instead of
// merely clipping it to the mask. The on-screen smoothness of these algorithms is a
// render-time effect: the engine emits a sparse polyline and Renderer.tracePath rounds
// it with midpoint-quadratic smoothing. The masking pipeline used to clip that raw
// sparse polyline, cutting along its chords and discarding the smoothing.
//
// The fix flattens the *displayed* (smoothed) curve into dense points BEFORE clipping
// (GeometryUtils.flattenSmoothedPath), so the masked output traces exactly the curve
// you see unmasked. These tests assert that geometric contract — NOT a point-count
// proxy, which a dense-but-straight chord polyline would also satisfy.
describe('masking: clipped curves trace the displayed curve, not its chords', () => {
  let runtime, V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const makeOval = (cx, cy, rx, ry, n = 36) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const theta = (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(theta) * rx, y: cy + Math.sin(theta) * ry });
    }
    return pts;
  };

  // A sparse Lissajous: 24 samples over the figure, so the midpoint-quadratic
  // smoothing bulges visibly away from the chords between samples. freqX=3,
  // freqY=2 with a phase offset avoids sampling exactly on the axis-crossings
  // (which would degenerate the curve to a straight line).
  const makeLissajous = (closed) => {
    const path = [];
    const span = closed ? Math.PI * 2 : Math.PI * 1.85; // closed: full period
    const N = 24;
    for (let i = 0; i <= (closed ? N : N - 1); i++) {
      const t = (i / N) * span;
      path.push({ x: 300 + Math.sin(3 * t + 0.5) * 200, y: 250 + Math.sin(2 * t) * 160 });
    }
    if (closed) path[path.length - 1] = { x: path[0].x, y: path[0].y };
    return path;
  };

  // The fix is shape-independent — it flattens whatever curve the renderer draws.
  // These sparse generators stand in for the curve-rendered algorithm family
  // (lissajous, spiral, harmonograph, rings, …), which all share the same
  // sparse-polyline + render-time-smoothing model and the same masking gate.
  const SHAPES = [
    { name: 'open lissajous', make: () => makeLissajous(false) },
    { name: 'closed lissajous', make: () => makeLissajous(true) },
    {
      name: 'archimedean spiral', // sparse, open
      make: () => {
        const path = [];
        for (let i = 0; i <= 28; i++) {
          const t = (i / 28) * Math.PI * 6;
          const r = 12 * t;
          path.push({ x: 300 + Math.cos(t) * r, y: 250 + Math.sin(t) * r });
        }
        return path;
      },
    },
    {
      name: 'rose (rhodonea)', // sparse, closed
      make: () => {
        const path = [];
        const N = 60;
        for (let i = 0; i <= N; i++) {
          const t = (i / N) * Math.PI * 2;
          const r = 180 * Math.cos(2.5 * t);
          path.push({ x: 300 + Math.cos(t) * r, y: 250 + Math.sin(t) * r });
        }
        path[path.length - 1] = { x: path[0].x, y: path[0].y };
        return path;
      },
    },
  ];

  // Minimum distance from a point to a polyline (point→segment over all edges).
  const distToPolyline = (p, poly) => {
    let best = Infinity;
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1];
      const b = poly[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + dx * t;
      const cy = a.y + dy * t;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < best) best = d;
    }
    return best;
  };

  const longestEdge = (seg) => {
    let max = 0;
    for (let i = 1; i < seg.length; i++) {
      const d = Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y);
      if (d > max) max = d;
    }
    return max;
  };

  // Largest deviation of any edge MIDPOINT from the reference curve. This is the
  // direct chord-artifact detector: a straight chord across a bulging curve has
  // its midpoint off the curve; a faithful (possibly long, genuinely straight)
  // edge has its midpoint on it.
  const maxMidpointDeviation = (seg, ref) => {
    let max = 0;
    for (let i = 1; i < seg.length; i++) {
      const mp = { x: (seg[i].x + seg[i - 1].x) / 2, y: (seg[i].y + seg[i - 1].y) / 2 };
      const d = distToPolyline(mp, ref);
      if (d > max) max = d;
    }
    return max;
  };

  for (const shape of SHAPES) {
    const label = shape.name;

    test(`${label}: masked points lie on the displayed curve (no shape change)`, () => {
      const path = shape.make();
      const oval = makeOval(300, 250, 110, 90);

      // Ground truth: the curve the renderer actually draws, as dense points.
      const displayed = V.GeometryUtils.flattenSmoothedPath(path);

      const masked = V.Masking.applyMaskToPaths([path], [oval], { invert: true, useCurves: true });
      expect(masked.length).toBeGreaterThan(0);

      const points = masked.flat();
      expect(points.length).toBeGreaterThan(0);

      // (A) Every masked point lies on the displayed curve. A chord-line artifact —
      //     or the old linear-resample kludge, whose points sit on the chords
      //     between sparse samples — would deviate from the smoothed curve and fail.
      const maxDeviation = Math.max(...points.map((p) => distToPolyline(p, displayed)));
      expect(maxDeviation).toBeLessThan(0.5);

      // (B) Edge midpoints lie on the displayed curve too — proves the EDGES follow
      //     the curve, not just the vertices (the actual chord-artifact detector).
      const maxMidDev = Math.max(...masked.map((seg) => maxMidpointDeviation(seg, displayed)));
      expect(maxMidDev).toBeLessThan(1.0);

      // (C) Masking introduces no edge longer than the longest edge the unmasked
      //     curve already has — long faithful straight runs are fine, new chords
      //     spanning the mask are not.
      const displayedMaxEdge = longestEdge(displayed);
      const maxFragmentEdge = Math.max(...masked.map(longestEdge));
      expect(maxFragmentEdge).toBeLessThanOrEqual(displayedMaxEdge + 0.5);

      // (D) Fragments render verbatim (already-baked geometry), never re-smoothed.
      masked.forEach((seg) => expect(seg.meta?.straight).toBe(true));
    });

    test(`${label}: masked geometry stays inside the mask`, () => {
      const path = shape.make();
      const oval = makeOval(300, 250, 110, 90);
      const masked = V.Masking.applyMaskToPaths([path], [oval], { invert: true, useCurves: true });

      // invert:true keeps the inside. Allow a small tolerance for boundary points.
      const inside = (p) =>
        V.PathBoolean.pointInPolygon(p, oval) || distToPolyline(p, oval) < 1.0;
      masked.flat().forEach((p) => expect(inside(p)).toBe(true));
    });
  }

  test('discrimination: clipping the RAW polyline (pre-fix behavior) DOES change the curve', () => {
    // Proves the fidelity assertions above are load-bearing: without flatten-before-clip,
    // the same input produces long straight chords that deviate from the displayed curve.
    const path = makeLissajous(true);
    const oval = makeOval(300, 250, 110, 90);
    const displayed = V.GeometryUtils.flattenSmoothedPath(path);

    // useCurves omitted → raw sparse polyline is clipped (the old, broken path).
    const rawMasked = V.Masking.applyMaskToPaths([path], [oval], { invert: true });

    const displayedMaxEdge = longestEdge(displayed);
    const rawMaxEdge = Math.max(...rawMasked.map(longestEdge));
    const rawMaxDeviation = Math.max(...rawMasked.flat().map((p) => distToPolyline(p, displayed)));

    // The broken output introduces chords longer than the display's own longest
    // edge AND its points deviate from the smoothed curve.
    expect(rawMaxEdge).toBeGreaterThan(displayedMaxEdge + 0.5);
    expect(rawMaxDeviation).toBeGreaterThan(2);
  });
});
