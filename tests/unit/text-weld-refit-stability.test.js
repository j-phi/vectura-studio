/*
 * Regression (RGR) — welded glyph outlines must be STABLE as the string grows.
 *
 * `mergeOverlaps` re-traces each welded ring with GU.reduceAnchors. The re-fit
 * was called with no tolerance opts, so reduceAnchors fell back to defaults
 * RELATIVE to the welded ring's own bbox diagonal (tol = 0.002*diag,
 * windowDist = 0.035*diag, mergeEps = 0.0008*diag). A connected script face
 * (Dancing Script, etc.) welds the whole word into ONE ring, so every typed
 * letter grew the diagonal and re-shaped the cubic fit + corner detection of
 * every EARLIER letter — visible re-smoothing/nudging on each keystroke. The
 * fix passes absolute em-derived tolerances (mirroring the per-glyph fit in
 * google-fonts.js), so anchors away from the new junction stay put.
 *
 * text.generate + a real engine.generate() render pass — per repo memory,
 * never assert on the welding/curve-fit machinery in isolation.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Text mergeOverlaps weld re-fit is string-independent', () => {
  let runtime;
  let V;

  // Each glyph is a CURVED arch (cubic C commands, 0.9em wide) on a narrower
  // advance (0.5em) so consecutive glyphs' ink strictly overlaps and always
  // welds. Curves matter: the existing rectangle mock is all 90° corners and
  // straight runs, which the anchor fit reproduces exactly at ANY tolerance —
  // only curved boundaries expose a tolerance-dependent re-fit.
  const makeCurvedOverlapFont = () => ({
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
            { type: 'M', x, y },
            { type: 'C', x1: x, y1: y - em * 0.75, x2: x + em * 0.9, y2: y - em * 0.75, x: x + em * 0.9, y },
            { type: 'C', x1: x + em * 0.6, y1: y - em * 0.15, x2: x + em * 0.3, y2: y - em * 0.15, x, y },
            { type: 'Z' },
          ],
        }),
      })),
  });

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    V.WEBFONT_GLYPHS = V.WEBFONT_GLYPHS || {};
    V.WEBFONT_GLYPHS['weld-stability-test'] = makeCurvedOverlapFont();
  });

  afterAll(() => runtime.cleanup());

  const makeLayer = (engine, text) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      text,
      font: 'google:weld-stability-test',
      fontWeight: 'Regular',
      align: 'left',
      fitToFrame: false,
      fontSize: 40,
      jitter: 0,
      mergeOverlaps: true,
      bezierOutline: true,
      fillEnabled: false,
      outlineStroke: true,
      outlineThickness: 1,
    });
    return { id, layer };
  };

  // All welded bezier anchors of the layer's outline segs whose anchor point
  // lies left of `cutoff` (world x) — i.e. on the first glyph, away from any
  // glyph-glyph junction.
  const anchorsLeftOf = (layer, cutoff) => {
    const out = [];
    for (const seg of layer.paths) {
      if (!seg.meta || seg.meta.algorithm !== 'text' || seg.meta.textFill) continue;
      if (!Array.isArray(seg.meta.anchors)) continue;
      for (const a of seg.meta.anchors) if (a.x < cutoff) out.push(a);
    }
    // The clipper may rotate the welded ring's start vertex between runs, so
    // compare as a canonically ordered set.
    return out.sort((p, q) => (p.x - q.x) || (p.y - q.y));
  };

  test("appending a letter does not re-shape the first glyph's welded outline", () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, 'nn');
    engine.generate(id);

    // Junction-free window: strictly inside the first glyph's advance cell,
    // clear of the ink-overlap zone (ink spans 0.9em on a 0.5em advance, so
    // everything past the cell's right edge is junction territory).
    const q = layer.glyphs[0].quad;
    const cellW = q[1].x - q[0].x;
    const cutoff = q[1].x - cellW * 0.25;

    const before = anchorsLeftOf(layer, cutoff);
    expect(before.length).toBeGreaterThan(0); // fixture sanity: weld produced anchors here

    layer.params.text = 'nnn';
    engine.generate(id);
    const after = anchorsLeftOf(layer, cutoff);

    // Same anchors, bit-for-bit (modulo ring start rotation): the third glyph
    // only touches the second, so the union boundary — and therefore the fit —
    // over the first glyph must be identical.
    expect(after.length).toBe(before.length);
    before.forEach((a, i) => {
      const b = after[i];
      expect(b.x).toBeCloseTo(a.x, 6);
      expect(b.y).toBeCloseTo(a.y, 6);
      expect(!!a.in).toBe(!!b.in);
      expect(!!a.out).toBe(!!b.out);
      if (a.in && b.in) {
        expect(b.in.x).toBeCloseTo(a.in.x, 6);
        expect(b.in.y).toBeCloseTo(a.in.y, 6);
      }
      if (a.out && b.out) {
        expect(b.out.x).toBeCloseTo(a.out.x, 6);
        expect(b.out.y).toBeCloseTo(a.out.y, 6);
      }
    });
  });
});
