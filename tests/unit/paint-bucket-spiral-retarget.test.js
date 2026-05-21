/**
 * RGR regression: Paint Bucket > Spiral controls must affect the rendered fill.
 *
 * Reported bugs (2026-05-21):
 *   - Spiral Turns slider does nothing on poured fills
 *   - Spiral Tightness slider does nothing on poured fills
 *   - Spiral Direction select does nothing on poured fills
 *   - Density is "backwards" — higher value should produce a denser spiral
 *   - Padding behaves erratically — increasing padding jitters the spiral
 *     center because the inset polygon's bounding box shifts with each tick
 *
 * Root causes:
 *   1. `renderer.updateLastPaintedFills` FIELD_MAP omitted spiralTurns,
 *      spiralTightness, spiralDirection. Panel changes never propagated to
 *      existing fill records.
 *   2. Spiral dispatch passed `density` (slider value) straight through as the
 *      Archimedean ring spacing. With a slider labelled "Density" users expect
 *      higher = denser; mapping density → 1/density preserves the default
 *      value behavior (density=1 → 1mm spacing) and inverts the direction.
 *   3. `effectiveRegions` (the padding-inset polygon) was used for both the
 *      spiral's center/radius AND the clipping mask. As padding grows, the
 *      inset polygon's bounding box drifts non-monotonically, which moves the
 *      spiral center and shrinks/regrows the spiral erratically. Using the
 *      ORIGINAL region for bounds and the inset for clipping stabilizes it.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Paint Bucket Spiral fill — slider plumbing & geometry', () => {
  let runtime;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    gen = runtime.window.Vectura.AlgorithmRegistry._generatePatternFillPaths;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // ──────────────────────────────────────────────────────────────────
  // 1. FIELD_MAP plumbing — spiralTurns/Tightness/Direction propagate.
  // ──────────────────────────────────────────────────────────────────
  describe('Renderer.updateLastPaintedFills — spiral params', () => {
    const makeRenderer = (engine) => {
      const { Renderer } = runtime.window.Vectura;
      return new Renderer('main-canvas', engine);
    };
    const makeEngine = (fills) => ({
      layers: [{ id: 'layer-1', fills }],
      computeAllDisplayGeometry: vi.fn(),
    });
    const spiralFillRecord = (overrides = {}) => ({
      id: 'fill-spiral-1',
      fillType: 'spiral',
      density: 5,
      angle: 0,
      padding: 0,
      shiftX: 0,
      shiftY: 0,
      spiralTurns: 8,
      spiralTightness: 0.5,
      spiralDirection: 'cw',
      region: [
        { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
      ],
      ...overrides,
    });

    test('spiralTurns is updated in the fill record when slider changes', () => {
      const rec = spiralFillRecord({ spiralTurns: 8 });
      const engine = makeEngine([rec]);
      const renderer = makeRenderer(engine);
      renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-spiral-1' }];
      const changed = renderer.updateLastPaintedFills({ fillSpiralTurns: 24 });
      expect(changed).toBe(true);
      expect(rec.spiralTurns).toBe(24);
    });

    test('spiralTightness is updated in the fill record when slider changes', () => {
      const rec = spiralFillRecord({ spiralTightness: 0.5 });
      const engine = makeEngine([rec]);
      const renderer = makeRenderer(engine);
      renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-spiral-1' }];
      renderer.updateLastPaintedFills({ fillSpiralTightness: 0.95 });
      expect(rec.spiralTightness).toBe(0.95);
    });

    test('spiralDirection is updated in the fill record when slider changes', () => {
      const rec = spiralFillRecord({ spiralDirection: 'cw' });
      const engine = makeEngine([rec]);
      const renderer = makeRenderer(engine);
      renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-spiral-1' }];
      renderer.updateLastPaintedFills({ fillSpiralDirection: 'ccw' });
      expect(rec.spiralDirection).toBe('ccw');
    });

    test('computeAllDisplayGeometry is called when spiral params change', () => {
      const rec = spiralFillRecord();
      const engine = makeEngine([rec]);
      const renderer = makeRenderer(engine);
      renderer.lastPaintedFillRefs = [{ layerId: 'layer-1', fillId: 'fill-spiral-1' }];
      renderer.updateLastPaintedFills({ fillSpiralTurns: 20 });
      expect(engine.computeAllDisplayGeometry).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 2. Density direction — higher slider value = denser spiral output.
  // ──────────────────────────────────────────────────────────────────
  describe('Spiral density direction (higher slider = denser fill)', () => {
    const rect = (x, y, w, h) => ([
      { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y },
    ]);
    // Free-running spiral (turns=0 → uncapped) so density alone controls
    // how much arc the spiral lays down inside the region.
    const base = (overrides = {}) => ({
      region: rect(0, 0, 200, 200),
      regions: [rect(0, 0, 200, 200)],
      angle: 0,
      shiftX: 0,
      shiftY: 0,
      padding: 0,
      fillType: 'spiral',
      spiralTurns: 0,
      spiralTightness: 0,
      spiralDirection: 'cw',
      ...overrides,
    });
    const totalLength = (paths) => paths.reduce(
      (acc, p) => acc + p.reduce(
        (a, pt, i) => (i === 0 ? a : a + Math.hypot(pt.x - p[i - 1].x, pt.y - p[i - 1].y)),
        0,
      ),
      0,
    );

    test('density=10 produces a longer/denser spiral than density=1', () => {
      const sparse = totalLength(gen(base({ density: 1 })));
      const dense = totalLength(gen(base({ density: 10 })));
      expect(sparse).toBeGreaterThan(0);
      expect(dense).toBeGreaterThan(sparse);
    });

    test('density=1 keeps roughly 1mm ring spacing (default semantics)', () => {
      // The default density value (1) historically produced ~1mm spacing
      // between rings. The fix preserves this default — only the slider
      // *direction* changes, not the value at density=1.
      const paths = gen(base({ density: 1 }));
      expect(paths.length).toBeGreaterThan(0);
      // A free-running 1mm-spacing spiral inside a 200x200 region produces
      // at least dozens of turns worth of arc length.
      expect(totalLength(paths)).toBeGreaterThan(200);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  // 3. Padding stability — spiral center must not drift as padding grows.
  // ──────────────────────────────────────────────────────────────────
  describe('Spiral padding — center stays anchored to the original region', () => {
    // Isosceles triangle pointing up: bbox 50..150 × 50..200 (center
    // 100, 125). The bbox center sits inside the triangle. Insetting the
    // triangle shifts the *inset* polygon's bbox center vertically because
    // the slanted edges contract toward the apex more than the flat base
    // does — exactly the asymmetry that made padding feel "erratic" on
    // non-rectangular shapes.
    const tri = () => ([
      { x: 100, y: 50 }, { x: 150, y: 200 }, { x: 50, y: 200 }, { x: 100, y: 50 },
    ]);
    const base = (overrides = {}) => ({
      region: tri(),
      regions: [tri()],
      density: 1,
      angle: 0,
      shiftX: 0,
      shiftY: 0,
      fillType: 'spiral',
      spiralTurns: 0,
      spiralTightness: 0,
      spiralDirection: 'cw',
      padding: 0,
      ...overrides,
    });
    // The spiral's expected anchor is the ORIGINAL region's bbox center
    // (100, 125). Measure as the centroid of the innermost ~5% of points.
    const innermostCenter = (paths) => {
      const all = paths.flat();
      if (!all.length) return { x: NaN, y: NaN };
      const EX = 100, EY = 125;
      const sorted = all.slice().sort(
        (a, b) => ((a.x - EX) ** 2 + (a.y - EY) ** 2) - ((b.x - EX) ** 2 + (b.y - EY) ** 2)
      );
      const take = Math.max(5, Math.floor(sorted.length * 0.05));
      const slice = sorted.slice(0, take);
      const sx = slice.reduce((s, p) => s + p.x, 0) / slice.length;
      const sy = slice.reduce((s, p) => s + p.y, 0) / slice.length;
      return { x: sx, y: sy };
    };

    test('spiral center is stable as padding sweeps 0 → 2 → 5 → 10mm on a triangle', () => {
      const c0 = innermostCenter(gen(base({ padding: 0 })));
      const c1 = innermostCenter(gen(base({ padding: 2 })));
      const c2 = innermostCenter(gen(base({ padding: 5 })));
      const c3 = innermostCenter(gen(base({ padding: 10 })));
      // The fix anchors spiral params on the ORIGINAL region's bbox, so
      // the spiral center is invariant under padding. Pre-fix it drifted
      // by 10+ mm as the inset triangle's bbox shifted with each step.
      const drift = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      expect(drift(c0, c1)).toBeLessThan(3);
      expect(drift(c0, c2)).toBeLessThan(3);
      expect(drift(c0, c3)).toBeLessThan(3);
    });

    test('padding still trims the visible spiral inward from the boundary', () => {
      // Padding must still apply as a clipping margin. The triangle's base
      // is at y=200; with padding=10, no spiral point should reach y≥199.
      const paths = gen(base({ padding: 10 }));
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        for (const pt of path) {
          expect(pt.y).toBeLessThan(199);
        }
      }
    });
  });
});
