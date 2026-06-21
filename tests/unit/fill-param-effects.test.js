/**
 * Fill-parameter effect tests.
 *
 * For every parameter we expect to influence the rendered path data, this
 * hashes the polyline output of `_generatePatternFillPaths` twice — once with
 * the knob at value A, once at value B — and asserts the hashes differ.
 *
 * Reproductions match the dead-knob audit (2026-05-20). A second cohort
 * spot-checks already-working knobs to guard against regressions, and a
 * third cohort verifies the new FILL_CAPS gating + conditional showIf
 * predicates introduced alongside the algorithm fixes.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

function hashPaths(paths) {
  let h = 0x811c9dc5 >>> 0;
  for (const p of paths) {
    for (const pt of p) {
      h ^= Math.round(pt.x * 100); h = Math.imul(h, 0x01000193);
      h ^= Math.round(pt.y * 100); h = Math.imul(h, 0x01000193);
    }
    h ^= 0xff; h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

const rect = (x, y, w, h) => ([
  { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y },
]);
const ngon = (n, cx, cy, r) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  out.push({ x: out[0].x, y: out[0].y });
  return out;
};

describe('Fill parameter effects (path-data hash)', () => {
  let runtime;
  let gen;
  let FILL_CAPS;
  let controlDefs;
  let controlMap;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
    FILL_CAPS = runtime.window.Vectura.FillPanel.FILL_CAPS;
    controlDefs = runtime.window.Vectura.FillPanel.buildFillControlDefs();
    controlMap = new Map(controlDefs.map((d) => [d.id, d]));
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const sq = rect(0, 0, 200, 200);
  const ng32 = ngon(32, 100, 100, 90);

  const base = (region, overrides) => ({ region, regions: [region], ...overrides });
  const hash = (region, overrides) => hashPaths(gen(base(region, overrides)));
  const expectDifferent = (region, a, b) => {
    const ha = hash(region, a);
    const hb = hash(region, b);
    expect(ha).not.toBe(hb);
  };

  // ──────────────────────────────────────────────────────────────────
  // Fill Density slider direction: higher value = denser, for every fill.
  // Total vertex count is the density proxy (works for line fills AND the
  // single-path spiral). Before the slider-inversion fix, the spacing-based
  // fills (hatch/dots/…) went the WRONG way — higher density = fewer lines.
  // ──────────────────────────────────────────────────────────────────
  describe('Fill Density reads higher = denser', () => {
    const pointCount = (region, overrides) => gen(base(region, overrides)).reduce((s, p) => s + p.length, 0);
    const denserWithHigherDensity = (overrides) => {
      const sparse = pointCount(sq, { ...overrides, density: 2 });
      const dense = pointCount(sq, { ...overrides, density: 20 });
      return { sparse, dense };
    };
    test.each([
      ['hatch', { fillType: 'hatch' }],
      ['crosshatch', { fillType: 'crosshatch' }],
      ['wave', { fillType: 'wave' }],
      ['dots', { fillType: 'dots', dotPattern: 'grid', dotShape: 'tick' }],
      ['meander', { fillType: 'meander' }],
      ['polygonal', { fillType: 'polygonal' }],
      ['scribble', { fillType: 'scribble' }],
    ])('spacing fill %s: higher density → more geometry', (_label, overrides) => {
      const { sparse, dense } = denserWithHigherDensity(overrides);
      expect(dense).toBeGreaterThan(sparse);
    });
    // contour (ring count) and radial (spoke count) already grew denser with the
    // value and are NOT inverted — confirm that still holds. (Spiral is excluded:
    // its point budget saturates at a turn cap, so vertex count is a poor proxy.)
    test.each([
      ['contour', { fillType: 'contour' }],
      ['radial', { fillType: 'radial' }],
    ])('already-denser fill %s keeps higher density → more geometry', (_label, overrides) => {
      const { sparse, dense } = denserWithHigherDensity(overrides);
      expect(dense).toBeGreaterThan(sparse);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Previously-dead knobs from the 2026-05-20 audit. After fixes these
  // must change the hash.
  // ──────────────────────────────────────────────────────────────────
  describe('previously-dead knobs (after fix)', () => {
    test('weave.weavePattern: plain vs basket differs at default Over=Under=1', () => {
      expectDifferent(
        sq,
        { fillType: 'weave', weavePattern: 'plain' },
        { fillType: 'weave', weavePattern: 'basket' },
      );
    });

    test('weave.weavePattern: plain vs twill differs at default Over=Under=1', () => {
      expectDifferent(
        sq,
        { fillType: 'weave', weavePattern: 'plain' },
        { fillType: 'weave', weavePattern: 'twill' },
      );
    });

    test('weave.weavePattern: plain vs satin differs at default Over=Under=1', () => {
      expectDifferent(
        sq,
        { fillType: 'weave', weavePattern: 'plain' },
        { fillType: 'weave', weavePattern: 'satin' },
      );
    });

    test('maze.mazeAlgorithm: dfs vs prim differs', () => {
      expectDifferent(
        sq,
        { fillType: 'maze', mazeAlgorithm: 'dfs' },
        { fillType: 'maze', mazeAlgorithm: 'prim' },
      );
    });

    test('maze.mazeAlgorithm: dfs vs wilson differs', () => {
      expectDifferent(
        sq,
        { fillType: 'maze', mazeAlgorithm: 'dfs' },
        { fillType: 'maze', mazeAlgorithm: 'wilson' },
      );
    });

    test('maze.mazeAlgorithm: dfs vs recursive-division differs', () => {
      expectDifferent(
        sq,
        { fillType: 'maze', mazeAlgorithm: 'dfs' },
        { fillType: 'maze', mazeAlgorithm: 'recursive-division' },
      );
    });

    test('maze.mazeAlgorithm: dfs vs eller differs', () => {
      expectDifferent(
        sq,
        { fillType: 'maze', mazeAlgorithm: 'dfs' },
        { fillType: 'maze', mazeAlgorithm: 'eller' },
      );
    });

    test('maze.mazeWallMode: walls vs corridors differs', () => {
      expectDifferent(
        sq,
        { fillType: 'maze', mazeWallMode: 'walls' },
        { fillType: 'maze', mazeWallMode: 'corridors' },
      );
    });

    // The two algorithms below were ALREADY working before this patch — we
    // lock them in so a future regression is caught.
    test('contour.contourSimplify reduces vertex count on a 32-gon (already-working, lock-in)', () => {
      const a = gen(base(ng32, { fillType: 'contour', contourSimplify: 0.05 }));
      const b = gen(base(ng32, { fillType: 'contour', contourSimplify: 3.0 }));
      const ptsA = a.reduce((n, p) => n + p.length, 0);
      const ptsB = b.reduce((n, p) => n + p.length, 0);
      expect(ptsB).toBeLessThan(ptsA);
    });

    test('scribble.scribbleCoverage scales path length (already-working, lock-in)', () => {
      const a = gen(base(sq, { fillType: 'scribble', scribbleCoverage: 1.0 }));
      const b = gen(base(sq, { fillType: 'scribble', scribbleCoverage: 0.3 }));
      const ptsA = a.reduce((n, p) => n + p.length, 0);
      const ptsB = b.reduce((n, p) => n + p.length, 0);
      expect(ptsB).toBeLessThan(ptsA);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // The audit also flagged six shift knobs (hatch / wave / dots /
  // polygonal). Investigation showed the algorithms are mathematically
  // correct: shifting by exactly `density` is a no-op (visually identical
  // pattern by definition of phase). At sub-density values the shifts
  // produce different output. These tests use sub-density shifts to
  // confirm the algorithms ARE responsive.
  // ──────────────────────────────────────────────────────────────────
  describe('shift parameters (sub-density values produce different output)', () => {
    test('hatch.shiftY moves lines at shiftY = density/2', () => {
      expectDifferent(
        sq,
        { fillType: 'hatch', shiftY: 0 },
        { fillType: 'hatch', shiftY: 2.5 },
      );
    });

    test('hatch.shiftX moves lines at shiftX = density/2 when angle != 0', () => {
      expectDifferent(
        sq,
        { fillType: 'hatch', shiftX: 0, angle: 30 },
        { fillType: 'hatch', shiftX: 2.5, angle: 30 },
      );
    });

    test('wave.shiftY moves wave rows at shiftY = density/2', () => {
      expectDifferent(
        sq,
        { fillType: 'wave', shiftY: 0 },
        { fillType: 'wave', shiftY: 2.5 },
      );
    });

    test('dots.shiftX moves dot grid at shiftX = density/2', () => {
      expectDifferent(
        sq,
        { fillType: 'dots', shiftX: 0 },
        { fillType: 'dots', shiftX: 2.5 },
      );
    });

    test('dots.shiftY moves dot grid at shiftY = density/2', () => {
      expectDifferent(
        sq,
        { fillType: 'dots', shiftY: 0 },
        { fillType: 'dots', shiftY: 2.5 },
      );
    });

    test('polygonal.shiftX moves tile grid at shiftX = density/2', () => {
      expectDifferent(
        sq,
        { fillType: 'polygonal', shiftX: 0 },
        { fillType: 'polygonal', shiftX: 2.5 },
      );
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Spot-check ten already-working knobs to lock them in.
  // ──────────────────────────────────────────────────────────────────
  describe('working-knob lock-ins', () => {
    test('spiral.spiralTurns', () => {
      expectDifferent(sq, { fillType: 'spiral', spiralTurns: 0 }, { fillType: 'spiral', spiralTurns: 6 });
    });
    test('voronoi.voronoiSeeds', () => {
      expectDifferent(sq, { fillType: 'voronoi', voronoiSeeds: 30 }, { fillType: 'voronoi', voronoiSeeds: 80 });
    });
    test('halftone.halftoneMaxR', () => {
      expectDifferent(sq, { fillType: 'halftone', halftoneMaxR: 1.5 }, { fillType: 'halftone', halftoneMaxR: 4.5 });
    });
    test('halftone.halftoneSource', () => {
      expectDifferent(sq, { fillType: 'halftone', halftoneSource: 'radial' }, { fillType: 'halftone', halftoneSource: 'noise' });
    });
    test('truchet.truchetTileSet', () => {
      expectDifferent(sq, { fillType: 'truchet', truchetTileSet: 'quarter-arcs' }, { fillType: 'truchet', truchetTileSet: 'diagonals' });
    });
    test('flowfield.flowSeed', () => {
      expectDifferent(sq, { fillType: 'flowfield', flowSeed: 1 }, { fillType: 'flowfield', flowSeed: 42 });
    });
    test('lsystem.lsysIterations', () => {
      expectDifferent(sq, { fillType: 'lsystem', lsysIterations: 2 }, { fillType: 'lsystem', lsysIterations: 4 });
    });
    test('spirograph.spiroRatioA', () => {
      expectDifferent(sq, { fillType: 'spirograph', spiroRatioA: 3 }, { fillType: 'spirograph', spiroRatioA: 7 });
    });
    test('polygonal.axes', () => {
      expectDifferent(sq, { fillType: 'polygonal', axes: 3 }, { fillType: 'polygonal', axes: 6 });
    });
    test('hatch.lineCount', () => {
      expectDifferent(sq, { fillType: 'hatch', lineCount: 1 }, { fillType: 'hatch', lineCount: 3 });
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // Conditional knobs only effective when a prereq is met. Verify the
  // algorithm responds when the prereq holds AND the UI gating hides
  // the control when it doesn't.
  // ──────────────────────────────────────────────────────────────────
  describe('conditional knobs (algorithm + UI gating)', () => {
    test('halftoneFrequency: differs when source=noise, hidden when source=radial', () => {
      // Effect
      expectDifferent(
        sq,
        { fillType: 'halftone', halftoneSource: 'noise', halftoneFrequency: 2 },
        { fillType: 'halftone', halftoneSource: 'noise', halftoneFrequency: 12 },
      );
      // No effect when source != noise
      const a = hash(sq, { fillType: 'halftone', halftoneSource: 'radial', halftoneFrequency: 2 });
      const b = hash(sq, { fillType: 'halftone', halftoneSource: 'radial', halftoneFrequency: 12 });
      expect(a).toBe(b);
      // UI gating
      const def = controlMap.get('fillHalftoneFrequency');
      expect(def).toBeDefined();
      expect(def.showIf({ fillMode: 'halftone', fillHalftoneSource: 'noise' })).toBe(true);
      expect(def.showIf({ fillMode: 'halftone', fillHalftoneSource: 'radial' })).toBe(false);
    });

    test('stripeSecondaryDensity: gated to fillStripeSecondary !== none', () => {
      const def = controlMap.get('fillStripeSecondaryDensity');
      expect(def).toBeDefined();
      expect(def.showIf({ fillMode: 'stripes', fillStripeSecondary: 'hatch' })).toBe(true);
      expect(def.showIf({ fillMode: 'stripes', fillStripeSecondary: 'none' })).toBe(false);
    });

    test('radial: density drives spoke count; dead knobs removed', () => {
      // Density is the sole spoke-count control — higher density yields more
      // spokes, so the path data must change.
      expectDifferent(
        sq,
        { fillType: 'radial', density: 5 },
        { fillType: 'radial', density: 20 },
      );
      // Density slider is always shown for radial now (no spokes-override gate).
      const dens = controlMap.get('fillDensity');
      expect(dens.showIf({ fillMode: 'radial' })).toBe(true);
      // The removed knobs no longer have control defs.
      expect(controlMap.has('fillRadialCentralDensity')).toBe(false);
      expect(controlMap.has('fillRadialOuterDiameter')).toBe(false);
      expect(controlMap.has('fillRadialSpokes')).toBe(false);
      // Radial Skip remains and is exposed.
      expect(controlMap.has('fillRadialSkip')).toBe(true);
    });

    test('weaveOver/weaveUnder: hidden when weavePattern=plain', () => {
      const over = controlMap.get('fillWeaveOver');
      const under = controlMap.get('fillWeaveUnder');
      expect(over.showIf({ fillMode: 'weave', fillWeavePattern: 'plain' })).toBe(false);
      expect(under.showIf({ fillMode: 'weave', fillWeavePattern: 'plain' })).toBe(false);
      expect(over.showIf({ fillMode: 'weave', fillWeavePattern: 'basket' })).toBe(true);
      expect(under.showIf({ fillMode: 'weave', fillWeavePattern: 'twill' })).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // FILL_CAPS density flag — the six B-series fills that own their own
  // spacing knob hide the global Fill Density slider.
  // ──────────────────────────────────────────────────────────────────
  describe('FILL_CAPS density flag (gates global Fill Density slider)', () => {
    const HIDDEN = ['flowfield', 'truchet', 'maze', 'lsystem', 'spirograph', 'weave'];
    const SHOWN = ['hatch', 'wave', 'dots', 'contour', 'spiral', 'radial', 'voronoi', 'scribble', 'halftone', 'stripes'];

    test.each(HIDDEN)('density cap is false for %s', (fillType) => {
      expect(FILL_CAPS[fillType].density).toBe(false);
    });

    test.each(SHOWN)('density cap is not-false (default visible) for %s', (fillType) => {
      // Undefined or true both pass — we only forbid explicit false.
      expect(FILL_CAPS[fillType].density).not.toBe(false);
    });

    test('Fill Density slider hidden by showIf for flagged fills', () => {
      const def = controlMap.get('fillDensity');
      expect(def).toBeDefined();
      for (const f of HIDDEN) {
        expect(def.showIf({ fillMode: f })).toBe(false);
      }
      for (const f of SHOWN) {
        expect(def.showIf({ fillMode: f })).toBe(true);
      }
    });
  });
});
