/**
 * Text / Type fill WATERTIGHTNESS contract — Red-Green-Refactor RED proof.
 *
 * The Type (text) algorithm collects EVERY glyph contour — outer shells AND
 * counter holes (the enclosed gaps in O, R, 8, e, 4, ...) — into one flat
 * region set and ALWAYS hits the COMPOSITE branch of generatePatternFillPaths.
 *
 * EVEN-ODD GROUND TRUTH: a point is "ink" iff its even-odd parity over the
 * full region set is TRUE. A point inside a counter has EVEN crossing parity
 * (false) and must NEVER receive fill geometry.
 *
 * Composite fills that clip globally against the even-odd helpers
 * (hatch, wave, ...) already honour this. The per-region fills
 * (dots/stipple/grid, contour, scribble, halftone, voronoi, truchet, maze,
 * lsystem, spirograph, weave) loop `for (const r of regions)` and treat every
 * loop — including counter holes — as solid positive area, so they LEAK ink
 * into counters (and several leave whole glyphs empty).
 *
 * This file asserts the contract on a synthetic multi-glyph "word" fixture for
 * every broken fill, plus a regression guard that hatch & wave stay watertight.
 * The broken-fill assertions are EXPECTED TO FAIL until the composite fills are
 * fixed; the hatch/wave guards must stay green throughout.
 *
 * Coverage and leak detection both sample emitted geometry DENSELY along each
 * segment (not just at vertices) because hatch/wave emit long lines whose only
 * vertices are the clipped endpoints.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Type fill watertightness (composite even-odd contract)', () => {
  let runtime;
  let gen;
  let inPoly;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
    inPoly = runtime.window.Vectura.AlgorithmRegistry._polyContainsPoint;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // ── even-odd parity helper (the definition of "is this point ink") ────────
  const ink = (regions, x, y) =>
    regions.reduce((s, r) => (inPoly(r, x, y) ? !s : s), false);

  // ── synthetic glyph topology builders (font-independent) ──────────────────
  // Axis-aligned square loops; coordinates are large and integral so the 0.5mm
  // flatten tolerance inside the engine never distorts the topology.
  const square = (x, y, s) => ([
    { x, y },
    { x: x + s, y },
    { x: x + s, y: y + s },
    { x, y: y + s },
    { x, y },
  ]);

  // Each glyph contributes:
  //   loops   — its contours (outer shells + counter holes), pushed into the
  //             shared flat region list (exactly how Type feeds the engine).
  //   solids  — sample points GUARANTEED to be ink (in the thick border).
  //   counters— sample points GUARANTEED to be inside a counter hole (NOT ink).
  // Sample points are pre-verified by even-odd parity in a beforeAll guard.

  // "O" — outer square + concentric inner square counter (hole).
  const glyphO = (ox, oy) => ({
    loops: [square(ox, oy, 60), square(ox + 18, oy + 18, 24)],
    solids: [{ x: ox + 6, y: oy + 30 }, { x: ox + 54, y: oy + 30 }],
    counters: [{ x: ox + 30, y: oy + 30 }],
  });

  // "8" — outer + TWO stacked counters.
  const glyph8 = (ox, oy) => ({
    loops: [
      square(ox, oy, 60),
      square(ox + 18, oy + 8, 24),  // upper counter (8..32 x, 16..32 y span)
      square(ox + 18, oy + 40, 14), // lower counter
    ],
    solids: [{ x: ox + 6, y: oy + 30 }, { x: ox + 54, y: oy + 30 }],
    counters: [{ x: ox + 30, y: oy + 20 }, { x: ox + 25, y: oy + 47 }],
  });

  // "R" — outer + one offset counter (the bowl).
  const glyphR = (ox, oy) => ({
    loops: [square(ox, oy, 60), square(ox + 12, oy + 10, 22)],
    solids: [{ x: ox + 4, y: oy + 30 }, { x: ox + 50, y: oy + 50 }],
    counters: [{ x: ox + 23, y: oy + 21 }],
  });

  // "V" — solid shape, NO counter.
  const glyphV = (ox, oy) => ({
    loops: [square(ox, oy, 60)],
    solids: [{ x: ox + 30, y: oy + 30 }],
    counters: [],
  });

  // "i" — TWO disjoint solid shapes (dot + stem), neither has a counter.
  const glyphI = (ox, oy) => ({
    loops: [square(ox, oy, 20), square(ox, oy + 28, 20)],
    solids: [{ x: ox + 10, y: oy + 10 }, { x: ox + 10, y: oy + 38 }],
    counters: [],
  });

  // "word" — disjoint glyphs side by side: O R V i 8. Mix of solid shells and
  // counters; all share one flat region list, exactly like Type feeds them.
  const buildWord = () => {
    const advance = 90;
    const glyphs = [
      glyphO(0, 0),
      glyphR(advance, 0),
      glyphV(advance * 2, 0),
      glyphI(advance * 3 + 20, 0),
      glyph8(advance * 4, 0),
    ];
    const regions = [];
    const solids = [];
    const counters = [];
    glyphs.forEach((g) => {
      regions.push(...g.loops);
      solids.push(...g.solids);
      counters.push(...g.counters);
    });
    return { regions, solids, counters };
  };

  // ── fixture integrity guard: prove the sample points are what we claim ─────
  it('fixture: solid samples are ink, counter samples are NOT ink', () => {
    const { regions, solids, counters } = buildWord();
    for (const s of solids) {
      expect(ink(regions, s.x, s.y)).toBe(true);
    }
    for (const c of counters) {
      expect(ink(regions, c.x, c.y)).toBe(false);
    }
    expect(solids.length).toBeGreaterThan(0);
    expect(counters.length).toBeGreaterThan(0);
  });

  // ── dense sampling of emitted geometry along every segment ────────────────
  const STEP = 0.75; // mm between samples along a segment
  const densePoints = (paths) => {
    const pts = [];
    (paths || []).forEach((p) => {
      if (!Array.isArray(p) || p.length === 0) return;
      if (p.length === 1) {
        const a = p[0];
        if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) pts.push({ x: a.x, y: a.y });
        return;
      }
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i];
        const b = p[i + 1];
        if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const n = Math.max(1, Math.ceil(len / STEP));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
    });
    return pts;
  };

  // A LEAK = an emitted point solidly inside a counter, away from any edge.
  // We require the point AND a small neighborhood to all be non-ink so that a
  // segment merely grazing a counter boundary is not miscounted.
  const TOL = 1.0; // mm
  const isLeak = (regions, x, y) => {
    const probes = [
      [0, 0], [TOL, 0], [-TOL, 0], [0, TOL], [0, -TOL],
    ];
    return probes.every(([dx, dy]) => ink(regions, x + dx, y + dy) === false);
  };

  const base = (fillType, overrides = {}) => {
    const { regions } = buildWord();
    return {
      regions,
      region: regions[0],
      fillType,
      density: 5,
      dotSize: 1.0,
      angle: 0,
      mazeCellSize: 6,
      truchetTileSize: 6,
      voronoiSeeds: 30,
      scribbleSeed: 1,
      lsysIterations: 3,
      halftoneFrequency: 5,
      spiroTurns: 30,
      weaveStrandWidth: 1.5,
      ...overrides,
    };
  };

  // Audit a fill: count counter leaks and measure solid-shell coverage.
  const auditFill = (fillType, overrides = {}) => {
    const { regions, solids, counters } = buildWord();
    const paths = gen(base(fillType, overrides));
    const pts = densePoints(paths);

    let leaks = 0;
    for (const pt of pts) {
      if (isLeak(regions, pt.x, pt.y)) leaks++;
    }

    // FULL COVERAGE: each glyph's guaranteed-ink solid sample must have some
    // emitted geometry within COVER mm of it. Disjoint glyphs (V, both halves
    // of i) each carry their own solid sample, so an empty letter fails here.
    const COVER = 22; // mm — half a glyph; generous but local to the shell
    let coveredSolids = 0;
    for (const s of solids) {
      if (pts.some((pt) => Math.hypot(pt.x - s.x, pt.y - s.y) < COVER)) coveredSolids++;
    }

    return {
      paths,
      pts,
      leaks,
      totalPts: pts.length,
      solids: solids.length,
      coveredSolids,
      counters: counters.length,
    };
  };

  const BROKEN_FILLS = [
    'dots', 'stipple', 'grid',
    'contour', 'scribble', 'halftone',
    'voronoi', 'truchet', 'maze',
    'lsystem', 'spirograph', 'weave',
  ];

  describe('(A) NO LEAK — broken composite fills must never paint counters', () => {
    for (const fillType of BROKEN_FILLS) {
      it(`${fillType}: zero fill points inside letter counters`, () => {
        const { leaks, totalPts } = auditFill(fillType);
        expect(totalPts).toBeGreaterThan(0); // sanity: the fill emitted geometry
        expect(leaks).toBe(0);
      });
    }
  });

  describe('(B) FULL COVERAGE — every solid shell receives fill geometry', () => {
    for (const fillType of BROKEN_FILLS) {
      it(`${fillType}: all solid shells contain emitted fill`, () => {
        const { solids, coveredSolids } = auditFill(fillType);
        expect(solids).toBeGreaterThan(0);
        expect(coveredSolids).toBe(solids);
      });
    }
  });

  // ── SCRIBBLE-specific regression fixtures ─────────────────────────────────
  // The disjoint-glyph / concentric-counter "word" fixture above catches neither
  // (1) the even-odd overlap hole formed where two SOLID shells interpenetrate,
  //     nor (2) a single non-convex glyph whose bbox center sits OUTSIDE the ink.
  describe('SCRIBBLE regression — interpenetrating shells + non-convex single glyph', () => {
    // (1) Two overlapping solid squares. Their intersection has even-odd parity
    //     EVEN → it is a HOLE (not ink). Scribble must clip against the full ink
    //     set (topo.valid), not just one group's loops, or it leaks into the hole.
    const interpenetratingFixture = () => {
      const a = square(0, 0, 60);
      const b = square(40, 0, 60); // overlaps a on x in [40,60]
      const regions = [a, b];
      // overlap region: x in [40,60], y in [0,60] → even-odd EVEN → hole.
      const counters = [{ x: 50, y: 30 }];
      // solid (odd) samples in the non-overlapping wings.
      const solids = [{ x: 20, y: 30 }, { x: 80, y: 30 }];
      return { regions, solids, counters };
    };

    it('fixture integrity: interpenetration overlap is a hole, wings are ink', () => {
      const { regions, solids, counters } = interpenetratingFixture();
      for (const s of solids) expect(ink(regions, s.x, s.y)).toBe(true);
      for (const c of counters) expect(ink(regions, c.x, c.y)).toBe(false);
    });

    it('scribble: NO LEAK into the even-odd interpenetration hole', () => {
      const { regions } = interpenetratingFixture();
      const paths = gen({
        regions,
        region: regions[0],
        fillType: 'scribble',
        density: 4,
        scribbleSeed: 7,
        scribbleCoverage: 2,
        angle: 0,
      });
      const pts = densePoints(paths);
      expect(pts.length).toBeGreaterThan(0);
      let leaks = 0;
      for (const pt of pts) if (isLeak(regions, pt.x, pt.y)) leaks++;
      expect(leaks).toBe(0);
    });

    // (2) A single non-convex "C"/"U" glyph: one outer loop whose bbox center is
    //     OUTSIDE the ink (the open throat). With only one valid loop the engine
    //     re-dispatches to the single-region scribble path, which historically
    //     seeded at the bbox center and left the glyph EMPTY. The seed must come
    //     from a verified interior point instead.
    const uGlyph = () => {
      // A "U" channel: outer rectangle with a deep notch cut from the top so the
      // bbox center (30,30) lands in the empty throat, not the ink.
      const loop = [
        { x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 60 },
        { x: 44, y: 60 }, { x: 44, y: 20 }, { x: 16, y: 20 },
        { x: 16, y: 60 }, { x: 0, y: 60 }, { x: 0, y: 0 },
      ];
      return loop;
    };

    it('fixture integrity: U-glyph bbox center is OUTSIDE the ink', () => {
      const loop = uGlyph();
      // bbox center
      expect(inPoly(loop, 30, 30)).toBe(false);
      // a guaranteed-ink point in the bottom bar
      expect(inPoly(loop, 30, 10)).toBe(true);
    });

    it('scribble: single non-convex glyph is NOT left empty', () => {
      const loop = uGlyph();
      const paths = gen({
        regions: [loop],
        region: loop,
        fillType: 'scribble',
        density: 4,
        scribbleSeed: 3,
        scribbleCoverage: 2,
        angle: 0,
      });
      const pts = densePoints(paths);
      expect(pts.length).toBeGreaterThan(0);
      // coverage: the bottom bar (a guaranteed solid) must contain emitted geometry.
      const covered = pts.some((pt) => Math.hypot(pt.x - 30, pt.y - 10) < 22);
      expect(covered).toBe(true);
      // and no leak into the throat.
      let leaks = 0;
      for (const pt of pts) if (isLeak([loop], pt.x, pt.y)) leaks++;
      expect(leaks).toBe(0);
    });
  });

  // ── CONTOUR thin-wall regression ──────────────────────────────────────────
  // The "O"/"R"/"8" fixtures above have THICK walls (≥18mm). High-contrast serif
  // and script faces (Playfair, Lobster) have walls THINNER than one contour
  // step: insetting only the outer skips the wall straight into the counter and
  // every ring is clipped away → the whole letter renders EMPTY. The annulus
  // contour must offset the counter outward too, capping the step to the wall.
  // A counter-LESS glyph stroke (V, E, C, T, L, the stem of most letters) is a
  // thin SOLID shape. Its width is far smaller than the density-derived step sized
  // to the whole letter, so the first inset overshoots the centreline and the
  // stroke collapses after ZERO rings — only the single-ring fallback fires and
  // the letter looks empty (reported on a "VECTURA" contour fill). The solid step
  // must be capped to the stroke thickness so it carries several rings.
  describe('CONTOUR regression — thin solid stroke fills with multiple rings', () => {
    const rect = (x, y, w, h) => ([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }]);
    for (const [w, h] of [[70, 5], [50, 4], [60, 10]]) {
      it(`solid ${w}×${h}mm stroke gets ≥3 contour rings (not 1)`, () => {
        const r = rect(0, 0, w, h);
        const paths = gen({ regions: [r], region: r, fillType: 'contour', density: 4 });
        expect(paths.length).toBeGreaterThanOrEqual(3);
      });
    }
    it('thick shape still scales rings with density (cap does not engage)', () => {
      const r = rect(0, 0, 60, 60);
      const d4 = gen({ regions: [r], region: r, fillType: 'contour', density: 4 }).length;
      const d8 = gen({ regions: [r], region: r, fillType: 'contour', density: 8 }).length;
      expect(d8).toBeGreaterThan(d4); // density, not the thin-stroke cap, governs
    });
  });

  // Naive polygon offsetting (insetPolygon) self-intersects into garbage on
  // NON-CONVEX shapes at depth — reported as a chaotic "VECTURA" contour on a
  // script face. The distance-field contour produces clean iso-rings for any
  // shape: every emitted path is finite, has ≥2 points, and the path count stays
  // bounded (grid-limited) instead of exploding with density.
  describe('CONTOUR regression — non-convex shape fills cleanly, stays bounded', () => {
    // A thin "V" chevron: a non-convex closed band that classic offsetting mangles.
    const chevron = () => ([
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 30, y: 44 }, { x: 52, y: 0 }, { x: 60, y: 0 },
      { x: 34, y: 52 }, { x: 26, y: 52 }, { x: 0, y: 0 },
    ]);

    it('non-convex chevron gets ≥2 clean rings (all finite, length ≥2)', () => {
      const r = chevron();
      const paths = gen({ regions: [r], region: r, fillType: 'contour', density: 6 });
      expect(paths.length).toBeGreaterThanOrEqual(2);
      for (const p of paths) {
        expect(p.length).toBeGreaterThanOrEqual(2);
        for (const pt of p) { expect(Number.isFinite(pt.x)).toBe(true); expect(Number.isFinite(pt.y)).toBe(true); }
      }
    });

    it('high density stays bounded (no self-intersection explosion)', () => {
      const r = chevron();
      const hi = gen({ regions: [r], region: r, fillType: 'contour', density: 40 });
      // bounded by grid resolution, not the runaway loops naive offsetting produced
      expect(hi.length).toBeLessThan(2000);
      expect(hi.length).toBeGreaterThan(0);
    });

    // OUTSET must also go through the distance field (was left on the old
    // insetPolygon path, producing tangled self-intersecting halo rings that
    // collide between letters). Iso-contours of the OUTSIDE distance field give a
    // clean halo expanding outward.
    it('outset rings expand OUTSIDE the shape, clean and bounded', () => {
      const r = square(40, 40, 40); // spans 40..80
      const paths = gen({ regions: [r], region: r, fillType: 'contour', density: 6, contourDirection: 'outset' });
      expect(paths.length).toBeGreaterThan(0);
      expect(paths.length).toBeLessThan(600); // bounded halo, not a canvas flood
      let outside = 0, total = 0;
      for (const p of paths) {
        expect(p.length).toBeGreaterThanOrEqual(2);
        for (const pt of p) {
          total++;
          expect(Number.isFinite(pt.x)).toBe(true);
          if (!inPoly(r, pt.x, pt.y)) outside++;
        }
      }
      expect(outside / total).toBeGreaterThan(0.8); // the halo lives outside the ink
    });

    it('inset still fills INSIDE the shape (direction routing intact)', () => {
      const r = square(40, 40, 40);
      const paths = gen({ regions: [r], region: r, fillType: 'contour', density: 6, contourDirection: 'inset' });
      let inside = 0, total = 0;
      for (const p of paths) for (const pt of p) { total++; if (inPoly(r, pt.x, pt.y)) inside++; }
      expect(inside / total).toBeGreaterThan(0.8);
    });
  });

  describe('CONTOUR regression — hairline-walled annulus is never left empty', () => {
    // Outer 80mm square, counter 74mm square → a 3mm wall all around.
    const thinWall = () => {
      const outer = square(0, 0, 80);
      const counter = square(3, 3, 74);
      const regions = [outer, counter];
      return { regions, wallSamples: [{ x: 1.5, y: 40 }, { x: 78.5, y: 40 }, { x: 40, y: 1.5 }, { x: 40, y: 78.5 }], counter: { x: 40, y: 40 } };
    };

    it('fixture integrity: 3mm wall is ink, interior is a counter', () => {
      const { regions, wallSamples, counter } = thinWall();
      for (const s of wallSamples) expect(ink(regions, s.x, s.y)).toBe(true);
      expect(ink(regions, counter.x, counter.y)).toBe(false);
    });

    for (const density of [4, 8, 14]) {
      it(`contour @density ${density}: rings reach the hairline wall, no counter leak`, () => {
        const { regions, wallSamples } = thinWall();
        const paths = gen({ regions, region: regions[0], fillType: 'contour', density, contourDirection: 'inset' });
        const pts = densePoints(paths);
        expect(pts.length).toBeGreaterThan(0);
        for (const s of wallSamples) {
          expect(pts.some((pt) => Math.hypot(pt.x - s.x, pt.y - s.y) < 6)).toBe(true);
        }
        let leaks = 0;
        for (const pt of pts) if (isLeak(regions, pt.x, pt.y)) leaks++;
        expect(leaks).toBe(0);
      });
    }
  });

  // ── CONTOUR bezier smoothing — rounds corners WITHOUT overshoot ────────────
  // Plain Catmull-Rom on a decimated ring balloons into self-intersecting loops
  // that escape the shape (reported as "wild" smoothing). Handles are clamped to a
  // third of the shorter adjacent segment, so the flattened curve must stay inside
  // the shape's own bounds — it may only round corners, never loop outward.
  describe('CONTOUR bezier smoothing — corners round, curve never overshoots', () => {
    let GU;
    beforeAll(() => { GU = runtime.window.Vectura.GeometryUtils; });
    const square2 = (x, y, s) => square(x, y, s);

    it('emits cubic anchors when contourBezier is on', () => {
      const r = square2(0, 0, 80);
      const paths = gen({ regions: [r], region: r, fillType: 'contour', density: 6, contourBezier: true, contourSmoothing: 0.6 });
      expect(paths.length).toBeGreaterThan(0);
      const curved = paths.filter((p) => p.meta && p.meta.anchors && p.meta.anchors.some((a) => a.in || a.out));
      expect(curved.length).toBeGreaterThan(0);
    });

    for (const smoothing of [0.6, 1]) {
      it(`smoothing ${smoothing}: flattened rings stay within the shape (no wild loops)`, () => {
        const r = square2(0, 0, 80); // inset rings live well inside [0,80]
        const paths = gen({ regions: [r], region: r, fillType: 'contour', density: 6, contourBezier: true, contourSmoothing: smoothing });
        expect(paths.length).toBeGreaterThan(0);
        const M = 3; // mm margin — a true round stays put; an overshoot loop blows past this
        for (const p of paths) {
          const flat = GU.flattenSmoothedPath(p, 0.25);
          for (const pt of flat) {
            expect(pt.x).toBeGreaterThan(-M);
            expect(pt.x).toBeLessThan(80 + M);
            expect(pt.y).toBeGreaterThan(-M);
            expect(pt.y).toBeLessThan(80 + M);
          }
        }
      });
    }
  });

  // ── Cross-glyph clip soundness (per-shell fills) ──────────────────────────
  // A per-shell fill must clip against the even-odd ink of OVERLAPPING NEIGHBOUR
  // glyphs, not just its own counters. The bug: a neighbour's wide outer overlaps
  // the target glyph's bbox while the neighbour's small counter does NOT — a
  // per-loop bbox filter then drops that counter, the neighbour's body reads as
  // solid ink, and the fill leaks into the dropped counter (seen on Playfair
  // "RABO80", glyph R leaking into A's bowl). Whole-group clipping fixes it.
  describe('Cross-glyph clip soundness — neighbour counter outside target bbox', () => {
    const crossFixture = () => {
      const a = square(0, 0, 60);              // glyph A, bbox x[0,60]
      const bOuter = square(40, 0, 120);       // glyph B wide outer, overlaps A in x[40,60]
      const bCounter = square(112, 40, 30);    // B's counter, bbox x[112,142] — misses A
      const regions = [a, bOuter, bCounter];
      return { regions, counter: { x: 127, y: 55 }, solids: [{ x: 10, y: 30 }, { x: 150, y: 10 }] };
    };

    it('fixture integrity: B-counter is a hole whose bbox misses glyph A', () => {
      const { regions, counter } = crossFixture();
      expect(ink(regions, counter.x, counter.y)).toBe(false);
      expect(112).toBeGreaterThan(60);
    });

    for (const fillType of ['scribble', 'contour', 'voronoi', 'truchet', 'maze', 'lsystem', 'spirograph', 'weave', 'flowfield']) {
      it(`${fillType}: never leaks into a neighbour counter outside its bbox`, () => {
        const { regions } = crossFixture();
        const paths = gen({
          regions, region: regions[0], fillType, density: 6,
          scribbleSeed: 5, scribbleCoverage: 3, mazeCellSize: 6, truchetTileSize: 6,
          voronoiSeeds: 40, lsysIterations: 3, spiroTurns: 30, weaveStrandWidth: 1.5, angle: 0,
        });
        const pts = densePoints(paths);
        let leaks = 0;
        for (const pt of pts) if (isLeak(regions, pt.x, pt.y)) leaks++;
        expect(leaks).toBe(0);
      });
    }
  });

  // ── NONZERO winding (connected scripts) ───────────────────────────────────
  // Glyph outlines are authored for the nonzero rule (outer +, counter −). Script
  // faces (Pacifico, Dancing Script, …) physically OVERLAP adjacent glyph outers,
  // which even-odd reads as a hole at the join and whose depth-classifier mis-reads
  // an overlapped outer as a counter (leaving its letter empty / bleeding fill into
  // real counters). Text passes `windingRule:'nonzero'`: overlapping same-wound
  // outers UNION, opposite-wound counters still carve. For NON-overlapping loops
  // nonzero ≡ even-odd, so non-script text and all other fills are unchanged.
  describe('NONZERO winding — overlapping glyph outers union, counters still carve', () => {
    const rel = runtime; // alias for clarity
    const _cls = () => runtime.window.Vectura.AlgorithmRegistry._classifyRegionTopology;
    // directed loops: square() is positive-area (an outer); squareCW() is its
    // reverse (negative-area, a counter).
    const squareCW = (x, y, s) => square(x, y, s).slice().reverse();
    // nonzero ink: winding number over all loops ≠ 0.
    const windNZ = (loop, x, y) => {
      let w = 0;
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        if (a.y <= y) { if (b.y > y && ((b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)) > 0) w++; }
        else if (b.y <= y && ((b.x - a.x) * (y - a.y) - (x - a.x) * (b.y - a.y)) < 0) w--;
      }
      return w;
    };
    const inkNZ = (regions, x, y) => regions.reduce((w, r) => w + windNZ(r, x, y), 0) !== 0;
    // distance to the nearest edge across all loops — a real leak must be a hole
    // point AWAY from every boundary (a fill endpoint landing exactly on a convex
    // outline corner reads as non-ink on all sides but is not a counter leak).
    const distEdge = (regions, x, y) => {
      let md = Infinity;
      for (const r of regions) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        const dx = b.x - a.x, dy = b.y - a.y, L2 = (dx * dx + dy * dy) || 1e-9;
        let t = ((x - a.x) * dx + (y - a.y) * dy) / L2; t = Math.max(0, Math.min(1, t));
        md = Math.min(md, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
      }
      return md;
    };

    // Glyph 1: outer 80mm square + a 40mm counter (CW). Glyph 2: outer overlapping
    // glyph 1 on the right (a connected-script join). All three loops in one set.
    const scriptFixture = () => {
      const a = square(0, 0, 80);
      const counterA = squareCW(20, 20, 40);
      const b = square(55, 0, 60);            // overlaps A in x[55,80]
      const regions = [a, counterA, b];
      return { regions, counter: { x: 40, y: 40 }, join: { x: 67, y: 30 }, solids: [{ x: 8, y: 40 }, { x: 110, y: 30 }] };
    };

    it('fixture integrity: counter is a nonzero hole, the join is nonzero ink', () => {
      const { regions, counter, join, solids } = scriptFixture();
      expect(inkNZ(regions, counter.x, counter.y)).toBe(false); // winding 0
      expect(inkNZ(regions, join.x, join.y)).toBe(true);        // winding 2 (both outers)
      for (const s of solids) expect(inkNZ(regions, s.x, s.y)).toBe(true);
    });

    it('classification: both overlapping outers are shells, counter is a hole', () => {
      const { regions } = scriptFixture();
      const topo = _cls()(regions, true); // nonzero classification
      expect(topo.groups.length).toBe(2); // A and B both kept as solid shells
      const totalHoles = topo.groups.reduce((n, g) => n + g.holes.length, 0);
      expect(totalHoles).toBe(1);         // counterA owned by exactly one shell
    });

    for (const fillType of ['contour', 'scribble', 'dots', 'voronoi', 'maze', 'weave', 'hatch']) {
      it(`${fillType}: nonzero — 0 counter leak, both letters + the join filled`, () => {
        const { regions, solids } = scriptFixture();
        const paths = gen({
          regions, region: regions[0], fillType, windingRule: 'nonzero', density: 6,
          dotSize: 1, scribbleSeed: 3, scribbleCoverage: 2, mazeCellSize: 6, voronoiSeeds: 40,
          weaveStrandWidth: 1.5, angle: 0,
        });
        const pts = densePoints(paths);
        expect(pts.length).toBeGreaterThan(0);
        // no emitted point sits in the nonzero hole (the counter).
        let leaks = 0;
        for (const pt of pts) {
          if (!inkNZ(regions, pt.x, pt.y) && distEdge(regions, pt.x, pt.y) > 0.6) leaks++;
        }
        expect(leaks).toBe(0);
        // both disjoint solid lobes carry fill (overlapped letter is not empty).
        for (const s of solids) {
          expect(pts.some((pt) => Math.hypot(pt.x - s.x, pt.y - s.y) < 22)).toBe(true);
        }
      });
    }

    it('even-odd unchanged: nonzero ≡ even-odd output for NON-overlapping glyphs', () => {
      // two disjoint (non-overlapping) glyphs with counters — the two rules must
      // produce byte-identical hatch geometry.
      const regions = [square(0, 0, 60), squareCW(15, 15, 30), square(90, 0, 60), squareCW(105, 15, 30)];
      const ev = gen({ regions, region: regions[0], fillType: 'hatch', density: 5, angle: 30 });
      const nz = gen({ regions, region: regions[0], fillType: 'hatch', density: 5, angle: 30, windingRule: 'nonzero' });
      expect(JSON.stringify(nz)).toBe(JSON.stringify(ev));
    });
  });

  describe('REGRESSION GUARD — hatch & wave already watertight, must stay green', () => {
    for (const fillType of ['hatch', 'wave']) {
      it(`${fillType}: NO LEAK into counters`, () => {
        const { leaks, totalPts } = auditFill(fillType);
        expect(totalPts).toBeGreaterThan(0);
        expect(leaks).toBe(0);
      });
      it(`${fillType}: FULL COVERAGE of all solid shells`, () => {
        const { solids, coveredSolids } = auditFill(fillType);
        expect(solids).toBeGreaterThan(0);
        expect(coveredSolids).toBe(solids);
      });
    }
  });
});
