const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Regression coverage for the Spiralizer algorithm (renamed from "Helix" / "3D Spiral"):
//  - bezier-circle dots, the five new marker render styles,
//  - the multi-strand helix shape primitive + helixCount,
//  - emphasizeOutline working across all render styles,
//  - full-shape silhouette outlining.

const bounds = { width: 800, height: 600, m: 3.7795 };

const clone = (v) => JSON.parse(JSON.stringify(v));

const isFinitePt = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y);
const finitePaths = (paths) =>
  Array.isArray(paths) && paths.length > 0 && paths.every((p) => Array.isArray(p) && p.length >= 2 && p.every(isFinitePt));
const countPoints = (paths) => (paths || []).reduce((sum, p) => sum + (p ? p.length : 0), 0);
const geomClosed = (path) => {
  const a = path?.[0];
  const b = path?.[path.length - 1];
  return !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
};

describe('Spiralizer algorithm', () => {
  let runtime;
  let V;
  let G3;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    G3 = V.Geometry3D;
  });

  afterAll(() => runtime.cleanup());

  const generate = (overrides = {}, seed = 4242, extraBounds = {}) => {
    const params = { ...clone(V.ALGO_DEFAULTS.spiralizer), ...clone(overrides), seed };
    return V.Algorithms.spiralizer.generate(
      params,
      new V.SeededRNG(seed),
      new V.SimpleNoise(seed),
      { ...bounds, ...extraBounds }
    ) || [];
  };

  // ── bezierCircle primitive ───────────────────────────────────────────────
  test('Geometry3D.bezierCircle is a closed 4-anchor cubic circle', () => {
    const circle = G3.bezierCircle(10, 20, 8);
    expect(circle.meta.forceCurves).toBe(true);
    expect(circle.meta.closed).toBe(true);
    expect(circle.meta.straight).toBeUndefined();
    expect(Array.isArray(circle.meta.anchors)).toBe(true);
    expect(circle.meta.anchors).toHaveLength(4);
    circle.meta.anchors.forEach((a) => {
      expect(a.in && Number.isFinite(a.in.x)).toBe(true);
      expect(a.out && Number.isFinite(a.out.x)).toBe(true);
    });
    // Fallback polyline is geometrically closed.
    expect(geomClosed(circle)).toBe(true);
  });

  // ── dots are bezier circles ──────────────────────────────────────────────
  test('dots render style emits 4-anchor bezier circles, not polygons', () => {
    const paths = generate({ renderStyle: 'dots', dotSpacing: 8, curveResolution: 120 });
    const dot = paths.find((p) => p.meta && p.meta.dot);
    expect(dot, 'expected at least one dot path').toBeTruthy();
    expect(dot.meta.forceCurves).toBe(true);
    expect(dot.meta.anchors).toHaveLength(4);
    expect(geomClosed(dot)).toBe(true);
  });

  // ── the marker render styles ─────────────────────────────────────────────
  test.each(['plusses', 'crosses', 'squares', 'triangles', 'dashes'])(
    '%s render style produces finite marker geometry',
    (style) => {
      const paths = generate({ renderStyle: style, dotSpacing: 8, curveResolution: 120, outlineMode: 'none' });
      expect(finitePaths(paths)).toBe(true);
      const markers = paths.filter((p) => p.meta && p.meta.marker);
      expect(markers.length).toBeGreaterThan(0);
      if (style === 'squares' || style === 'triangles') {
        expect(markers.some((m) => m.meta.closed === true)).toBe(true);
      } else {
        // plus / cross / dash glyphs are open 2-point strokes
        expect(markers.some((m) => m.length === 2 && m.meta.straight === true)).toBe(true);
      }
    }
  );

  test('plusses and crosses emit two strokes per sample; dashes emit one', () => {
    const opts = { dotSpacing: 10, curveResolution: 120, outlineMode: 'none', surfaceMode: 'seeThrough' };
    const plusses = generate({ ...opts, renderStyle: 'plusses' }).filter((p) => p.meta && p.meta.marker);
    const dashes = generate({ ...opts, renderStyle: 'dashes' }).filter((p) => p.meta && p.meta.marker);
    // Same sampling stride → plusses (2 strokes/marker) outnumber dashes (1 stroke).
    expect(plusses.length).toBeGreaterThan(dashes.length);
  });

  // ── points = solid filled discs ──────────────────────────────────────────
  test('points render style emits filled bezier-circle discs', () => {
    const paths = generate({ renderStyle: 'points', dotSpacing: 8, curveResolution: 120, outlineMode: 'none' });
    const pts = paths.filter((p) => p.meta && p.meta.marker && p.meta.fill);
    expect(pts.length).toBeGreaterThan(0);
    pts.forEach((m) => {
      expect(m.meta.dot).toBe(true);
      expect(m.meta.forceCurves).toBe(true);
      expect(geomClosed(m)).toBe(true);
    });
  });

  // ── helix shape primitive + helixCount ───────────────────────────────────
  test('helix shape produces finite geometry and helixCount adds strands', () => {
    const single = generate({ shape: 'helix', helixCount: 1, curveResolution: 200, outlineMode: 'none' });
    const triple = generate({ shape: 'helix', helixCount: 3, curveResolution: 200, outlineMode: 'none' });
    expect(finitePaths(single)).toBe(true);
    expect(finitePaths(triple)).toBe(true);
    // Three intertwined strands carry substantially more geometry than one.
    expect(countPoints(triple)).toBeGreaterThan(countPoints(single) * 1.5);
  });

  // ── twists default + DNA base-pair rungs ─────────────────────────────────
  test('helix twist count defaults to 1 (single strand)', () => {
    expect(V.ALGO_DEFAULTS.spiralizer.helixCount).toBe(1);
  });

  test('a single twist emits no base-pair rungs', () => {
    const paths = generate({ shape: 'helix', helixCount: 1, helixRungs: true, curveResolution: 200, outlineMode: 'none' });
    expect(paths.some((p) => p.meta && p.meta.rung)).toBe(false);
  });

  test('two twists with Base Pairs on emit DNA rungs bridging the strands', () => {
    const paths = generate({ shape: 'helix', helixCount: 2, helixRungs: true, helixRungSpacing: 16, curveResolution: 200, outlineMode: 'none' });
    const rungs = paths.filter((p) => p.meta && p.meta.rung);
    expect(rungs.length).toBeGreaterThan(0);
    rungs.forEach((r) => {
      expect(r.length).toBe(2); // a rung is a single straight segment
      expect(isFinitePt(r[0]) && isFinitePt(r[1])).toBe(true);
    });
  });

  test('Base Pairs off suppresses rungs even at two twists', () => {
    const paths = generate({ shape: 'helix', helixCount: 2, helixRungs: false, curveResolution: 200, outlineMode: 'none' });
    expect(paths.some((p) => p.meta && p.meta.rung)).toBe(false);
  });

  test('tighter rung spacing yields more base pairs', () => {
    const base = { shape: 'helix', helixCount: 2, helixRungs: true, curveResolution: 200, outlineMode: 'none' };
    const sparse = generate({ ...base, helixRungSpacing: 40 }).filter((p) => p.meta && p.meta.rung);
    const dense = generate({ ...base, helixRungSpacing: 6 }).filter((p) => p.meta && p.meta.rung);
    expect(dense.length).toBeGreaterThan(sparse.length);
  });

  // ── thickness selector ───────────────────────────────────────────────────
  test('thickness multiplies the per-path stroke weightScale', () => {
    const base = { shape: 'sphere', renderStyle: 'line', outlineMode: 'none', curveResolution: 200 };
    const thin = generate({ ...base, thickness: '1' });
    const heavy = generate({ ...base, thickness: '2' });
    expect(thin.every((p) => !p.meta || p.meta.weightScale === undefined || p.meta.weightScale === 1)).toBe(true);
    expect(heavy.some((p) => p.meta && p.meta.weightScale === 2)).toBe(true);
  });

  // ── marker spacing is true arc-length (mm) ───────────────────────────────
  test('smaller marker spacing places more glyphs (mm arc-length cadence)', () => {
    const base = { shape: 'sphere', renderStyle: 'dots', outlineMode: 'none', curveResolution: 300, surfaceMode: 'seeThrough' };
    const wide = generate({ ...base, dotSpacing: 12 }).filter((p) => p.meta && p.meta.marker);
    const tight = generate({ ...base, dotSpacing: 3 }).filter((p) => p.meta && p.meta.marker);
    expect(tight.length).toBeGreaterThan(wide.length);
  });

  // ── universal fill for hollow markers ────────────────────────────────────
  test('markerFill patterns the interior of hollow dot glyphs', () => {
    const base = { shape: 'sphere', renderStyle: 'dots', dotSpacing: 10, dotSizeMiddle: 8, curveResolution: 200, outlineMode: 'none', surfaceMode: 'seeThrough' };
    const plain = generate({ ...base, markerFill: 'none' });
    const filled = generate({ ...base, markerFill: 'spiral', fillDensity: 4 });
    expect(plain.some((p) => p.meta && p.meta.markerFill)).toBe(false);
    expect(filled.some((p) => p.meta && p.meta.markerFill)).toBe(true);
    // The fill adds geometry on top of the unfilled glyphs.
    expect(filled.length).toBeGreaterThan(plain.length);
  });

  // ── emphasizeOutline across render styles ────────────────────────────────
  test('emphasizeOutline densifies outline markers for marker styles', () => {
    const base = { renderStyle: 'dots', dotSpacing: 12, curveResolution: 160, outlineMode: 'outline', shape: 'sphere' };
    const plain = generate({ ...base, emphasizeOutline: false }).filter((p) => p.meta && p.meta.outline);
    const dense = generate({ ...base, emphasizeOutline: true }).filter((p) => p.meta && p.meta.outline);
    expect(plain.length).toBeGreaterThan(0);
    expect(dense.length).toBeGreaterThan(plain.length);
  });

  test('emphasizeOutline weights the line-style silhouette stroke', () => {
    const paths = generate({
      renderStyle: 'line', outlineMode: 'outline', emphasizeOutline: true, outlineWeight: 3, shape: 'capsule',
    });
    const weighted = paths.filter((p) => p.meta && p.meta.outline && p.meta.weightScale === 3);
    expect(weighted.length).toBeGreaterThan(0);
  });

  // ── full-shape silhouette outline ────────────────────────────────────────
  test('Show Outline traces the entire shape (closed multi-point silhouette)', () => {
    const paths = generate({ renderStyle: 'line', outlineMode: 'outline', shape: 'capsule', curveResolution: 160 });
    const outlines = paths.filter((p) => p.meta && p.meta.outline);
    expect(outlines.length).toBeGreaterThan(0);
    const full = outlines.find((p) => p.length > 10 && geomClosed(p));
    expect(full, 'expected a closed silhouette loop with many vertices').toBeTruthy();
  });

  test('Hide Outline emits no outline geometry', () => {
    const paths = generate({ renderStyle: 'line', outlineMode: 'none', shape: 'sphere' });
    expect(paths.some((p) => p.meta && p.meta.outline)).toBe(false);
  });

  // ── helix is a coil, not a cylinder (v1.1.131 redesign) ──────────────────
  test('helix defaults to the helix shape as an open coil (turns 3, no outline)', () => {
    const d = V.ALGO_DEFAULTS.spiralizer;
    expect(d.shape).toBe('helix');
    expect(d.turns).toBe(3);
    expect(d.outlineMode).toBe('none');
    expect(d.surfaceMode).toBe('seeThrough');
    expect(d.helixGrooveOffset).toBe(160);
  });

  test('helix outline is an OPEN axis line, never a closed cylinder hull', () => {
    const paths = generate({ shape: 'helix', helixCount: 1, outlineMode: 'outline', curveResolution: 200 });
    const outlines = paths.filter((p) => p.meta && p.meta.outline);
    expect(outlines.length).toBeGreaterThan(0);
    // No closed many-vertex barrel hull (that was the cylinder bug).
    expect(outlines.some((p) => p.length > 4 && geomClosed(p))).toBe(false);
    // The axis line is a single open 2-point segment.
    expect(outlines.every((p) => p.length === 2 && p.meta.closed === false)).toBe(true);
  });

  test('non-helix shapes keep their closed convex-hull silhouette (unchanged)', () => {
    const paths = generate({ shape: 'sphere', outlineMode: 'outline', curveResolution: 200 });
    const full = paths.filter((p) => p.meta && p.meta.outline).find((p) => p.length > 10 && geomClosed(p));
    expect(full, 'sphere outline must still be a closed multi-vertex hull').toBeTruthy();
  });

  test('two-twist (DNA) backbone uses the groove offset; three-strand does not', () => {
    const sig = (paths) => paths.filter((p) => !(p.meta && (p.meta.outline || p.meta.rung)))
      .reduce((s, p) => s + p.reduce((a, pt) => a + pt.x * 13.7 + pt.y * 7.3, 0), 0);
    // DNA double spiralizer: groove offset materially changes the backbone geometry.
    const dna160 = generate({ shape: 'helix', helixCount: 2, helixGrooveOffset: 160, outlineMode: 'none', curveResolution: 240 });
    const dna180 = generate({ shape: 'helix', helixCount: 2, helixGrooveOffset: 180, outlineMode: 'none', curveResolution: 240 });
    expect(Math.abs(sig(dna160) - sig(dna180))).toBeGreaterThan(1);
    // Triple spiralizer: groove offset must NOT leak — even 1/n split regardless.
    const tri160 = generate({ shape: 'helix', helixCount: 3, helixGrooveOffset: 160, outlineMode: 'none', curveResolution: 240 });
    const tri180 = generate({ shape: 'helix', helixCount: 3, helixGrooveOffset: 180, outlineMode: 'none', curveResolution: 240 });
    expect(Math.abs(sig(tri160) - sig(tri180))).toBeLessThan(1e-6);
  });

  test('DNA rung ladder density lands in the legible 3–6 per turn band', () => {
    const turns = 3;
    const paths = generate({ shape: 'helix', helixCount: 2, turns, helixRungSpacing: 10, outlineMode: 'none', curveResolution: 240 });
    const rungs = paths.filter((p) => p.meta && p.meta.rung).length;
    expect(rungs).toBeGreaterThanOrEqual(3 * turns);
    expect(rungs).toBeLessThanOrEqual(6 * turns + 2); // +2 endpoint inclusivity slack
  });

  test('helix marker-style outline walks the axis once (open), never back-traced', () => {
    const opts = { shape: 'helix', helixCount: 1, outlineMode: 'outline', dotSpacing: 10, curveResolution: 200 };
    const axis = generate({ ...opts, renderStyle: 'line' }).find((p) => p.meta && p.meta.outline);
    const axisLen = Math.hypot(axis[1].x - axis[0].x, axis[1].y - axis[0].y);
    const markers = generate({ ...opts, renderStyle: 'dots' }).filter((p) => p.meta && p.meta.outline && p.meta.marker);
    expect(markers.length).toBeGreaterThan(0);
    // A single pass along the axis ≈ axisLen/step markers; a force-closed walk
    // would back-trace and roughly double the count.
    expect(markers.length).toBeLessThanOrEqual(Math.ceil(axisLen / 10) + 2);
  });

  test('twistedLines wrap never receives the DNA groove offset (helix-only isolation)', () => {
    const sig = (paths) => paths.reduce((s, p) => s + p.reduce((a, pt) => a + pt.x * 11 + pt.y * 5, 0), 0);
    const base = { shape: 'sphere', wrapType: 'twistedLines', lineCount: 2, twistTurns: 6, outlineMode: 'none', curveResolution: 200 };
    const a = generate({ ...base, helixGrooveOffset: 160 });
    const b = generate({ ...base, helixGrooveOffset: 180 });
    expect(Math.abs(sig(a) - sig(b))).toBeLessThan(1e-6);
  });

  test('helix coil openness responds to Turns (more turns → longer coil wire)', () => {
    const wireLen = (paths) => paths
      .filter((p) => !(p.meta && (p.meta.outline || p.meta.rung)))
      .reduce((sum, p) => {
        let l = 0;
        for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        return sum + l;
      }, 0);
    const few = generate({ shape: 'helix', helixCount: 1, turns: 3, outlineMode: 'none', curveResolution: 600 });
    const many = generate({ shape: 'helix', helixCount: 1, turns: 8, outlineMode: 'none', curveResolution: 600 });
    expect(wireLen(many)).toBeGreaterThan(wireLen(few) * 1.4);
  });
});
