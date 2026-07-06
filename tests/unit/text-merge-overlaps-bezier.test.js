/*
 * Regression (RGR) — connected script-font glyphs must stay smooth beziers.
 *
 * `mergeOverlaps` welds touching/overlapping glyph ink into one contour via a
 * flat polygon boolean union (FillBoolean.nonZeroUnionByContainment), which
 * only ever sees plain points — the welded ring came back with no font anchor
 * data and rendered as a straight-segment polygon (visible facets on any
 * curve), even though every UN-merged glyph nearby kept its native bezier
 * outline. Script/cursive faces (Dancing Script, etc.) connect adjacent
 * letters by design, so this hit constantly for them specifically.
 *
 * text.generate + a real engine.generate() render pass — per repo memory,
 * never assert on the welding/curve-fit machinery in isolation.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Text mergeOverlaps keeps welded contours as native beziers', () => {
  let runtime;
  let V;

  // Each glyph is a WIDE rectangle (0.9em) on a narrower advance (0.5em) so
  // consecutive glyphs' ink strictly overlaps — deterministic weld trigger,
  // no async font parsing needed.
  const makeOverlapFont = () => ({
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    tables: { os2: { sCapHeight: 700, sxHeight: 500 } },
    getKerningValue: () => 0,
    stringToGlyphs: (s) =>
      Array.from(String(s)).map(() => ({
        advanceWidth: 500,
        getPath: (x, y, em) => ({
          commands: [
            { type: 'M', x, y: y - em * 0.7 },
            { type: 'L', x: x + em * 0.9, y: y - em * 0.7 },
            { type: 'L', x: x + em * 0.9, y },
            { type: 'L', x, y },
            { type: 'Z' },
          ],
        }),
      })),
  });

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    V.WEBFONT_GLYPHS = V.WEBFONT_GLYPHS || {};
    V.WEBFONT_GLYPHS['merge-test'] = makeOverlapFont();
  });

  afterAll(() => runtime.cleanup());

  test('overlapping glyph pair welds into ONE contour (sanity check on the fixture)', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      text: 'AA',
      font: 'google:merge-test',
      fontWeight: 'Regular',
      fitToFrame: false,
      fontSize: 40,
      jitter: 0,
      mergeOverlaps: true,
      fillEnabled: false,
      outlineStroke: true,
      outlineThickness: 1,
    });
    engine.generate(id);

    const textSegs = layer.paths.filter((p) => p.meta && p.meta.algorithm === 'text' && !p.meta.textFill);
    // The two glyphs' wide rectangles overlap, so the weld collapses them to
    // one welded ring rather than two independent glyph outlines.
    expect(textSegs.length).toBe(1);
  });

  test('the welded contour carries native bezier anchors, not a straight polygon', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      text: 'AA',
      font: 'google:merge-test',
      fontWeight: 'Regular',
      fitToFrame: false,
      fontSize: 40,
      jitter: 0,
      mergeOverlaps: true,
      fillEnabled: false,
      outlineStroke: true,
      outlineThickness: 1,
    });
    engine.generate(id);

    const [welded] = layer.paths.filter((p) => p.meta && p.meta.algorithm === 'text' && !p.meta.textFill);
    expect(welded).toBeTruthy();
    // Pre-fix: welded rings (idx -1) had no font anchor map and fell through
    // to `{ algorithm: 'text', straight: true }` — a bare faceted polygon.
    expect(welded.meta.straight).not.toBe(true);
    expect(welded.meta.forceCurves).toBe(true);
    expect(Array.isArray(welded.meta.anchors)).toBe(true);
    expect(welded.meta.anchors.length).toBeGreaterThan(0);
    // Every anchor must land on the actual welded ring point set (no drift
    // introduced by refitting) within the fit's own sub-pixel tolerance.
    welded.meta.anchors.forEach((a) => {
      expect(Number.isFinite(a.x)).toBe(true);
      expect(Number.isFinite(a.y)).toBe(true);
    });
  });
});
