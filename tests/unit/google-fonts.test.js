/*
 * Web-font source for the Text algorithm (RGR coverage).
 *
 * window.Vectura.GoogleFonts unlocks the public web-font catalog as an optional
 * Text source: any family's glyph *outlines* are traced into pen-ready polylines.
 * The network-bound pieces (catalog fetch, TTF load, parse) are exercised in the
 * browser; these tests pin the pure, offline contract:
 *   - the `google:<slug>` key scheme the Text algorithm branches on
 *   - file-URL + weight resolution
 *   - bezier→polyline flattening (sharp corners preserved, curves subdivided)
 *   - layout() positioning/alignment against a synthetic parsed font
 *   - the Text algorithm's swap-to-outline / fall-back-to-stroke branch
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('GoogleFonts web-font source', () => {
  let runtime;
  let V;
  let GF;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    GF = V.GoogleFonts;
  });

  afterAll(() => runtime.cleanup());

  // A synthetic opentype-shaped font: every glyph is a unit square outline so the
  // layout math is exactly predictable. capHeight 700/1000 em → cap maps to size.
  const makeFont = () => ({
    unitsPerEm: 1000,
    tables: { os2: { sCapHeight: 700 } },
    getKerningValue: () => 0,
    stringToGlyphs: (s) => Array.from(String(s)).map(() => ({
      advanceWidth: 500,
      getPath: (x, y, em) => ({
        commands: [
          { type: 'M', x, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.4, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.4, y },
          { type: 'L', x, y },
          { type: 'Z' },
        ],
      }),
    })),
  });

  test('key scheme round-trips and is distinct from built-in ids', () => {
    expect(GF.isWebFontKey('google:roboto')).toBe(true);
    expect(GF.isWebFontKey('sans')).toBe(false);
    expect(GF.isWebFontKey('')).toBe(false);
    expect(GF.keyToId('google:open-sans')).toBe('open-sans');
    expect(GF.idToKey('open-sans')).toBe('google:open-sans');
    expect(GF.keyToId(GF.idToKey('lobster'))).toBe('lobster');
  });

  test('weight resolution prefers the family weight nearest Regular (400)', () => {
    expect(GF.pickWeight([400, 700])).toBe(400);
    expect(GF.pickWeight([300, 700])).toBe(300); // 300 is closer to 400 than 700
    expect(GF.pickWeight([700])).toBe(700);
    expect(GF.pickWeight([])).toBe(400);
  });

  test('file URL targets the CORS TTF mirror with the resolved subset/weight', () => {
    const url = GF.fileUrl({ id: 'open-sans', weights: [400, 700], defSubset: 'latin' });
    expect(url).toBe('https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-400-normal.ttf');
    const url2 = GF.fileUrl({ id: 'noto-sans-jp', weights: [700], defSubset: 'japanese' });
    expect(url2).toBe('https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.ttf');
  });

  test('flattenCommands keeps straight corners exact and closes on Z', () => {
    const poly = GF.flattenCommands([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
    ]);
    expect(poly.length).toBe(1);
    // 3 declared vertices + the closing return to the start, no interpolation.
    expect(poly[0]).toEqual([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 },
    ]);
  });

  test('flattenCommands subdivides curves and honours the tolerance', () => {
    const cmds = [
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 0, y1: 40, x2: 40, y2: 40, x: 40, y: 0 },
    ];
    const coarse = GF.flattenCommands(cmds, 5);
    const fine = GF.flattenCommands(cmds, 0.05);
    expect(coarse[0].length).toBeGreaterThan(2);
    expect(fine[0].length).toBeGreaterThan(coarse[0].length);
    // Endpoints are exact regardless of subdivision depth.
    expect(fine[0][0]).toEqual({ x: 0, y: 0 });
    expect(fine[0][fine[0].length - 1]).toEqual({ x: 40, y: 0 });
  });

  test('flattenCommands emits one polyline per contour (M starts a new subpath)', () => {
    const poly = GF.flattenCommands([
      { type: 'M', x: 0, y: 0 }, { type: 'L', x: 5, y: 0 }, { type: 'L', x: 5, y: 5 }, { type: 'Z' },
      { type: 'M', x: 10, y: 0 }, { type: 'L', x: 15, y: 0 }, { type: 'L', x: 15, y: 5 }, { type: 'Z' },
    ]);
    expect(poly.length).toBe(2);
  });

  describe('layout()', () => {
    const ID = '__test-font__';
    beforeEach(() => { V.WEBFONT_GLYPHS[ID] = makeFont(); });
    afterEach(() => { delete V.WEBFONT_GLYPHS[ID]; });

    test('returns nothing when the family is not yet parsed', () => {
      const out = GF.layout('AB', { id: 'not-loaded', size: 14 });
      expect(out.paths).toEqual([]);
      expect(out.width).toBe(0);
    });

    test('produces one outline contour per glyph with proportional advance', () => {
      const out = GF.layout('AB', { id: ID, size: 14, align: 'left' });
      expect(out.paths.length).toBe(2); // one square contour each
      // advance per glyph = 500fu × (size/cap)/em = 14/1.4 = 10mm → width 20mm.
      expect(out.width).toBeCloseTo(20, 5);
      out.paths.forEach((p) => expect(p.length).toBeGreaterThanOrEqual(2));
    });

    test('centre alignment indents the shorter line by half the slack', () => {
      const out = GF.layout('A\nAB', { id: ID, size: 14, align: 'center' });
      // Line 0 ('A', 10mm) inside a 20mm block → 5mm left indent. Its single glyph
      // is the first contour emitted, so paths[0] is line 0.
      const minX = Math.min(...out.paths[0].map((pt) => pt.x));
      expect(minX).toBeCloseTo(5, 4);
    });
  });

  describe('commandsToAnchors (outline → bezier anchors)', () => {
    test('a straight closed contour yields one handle-free anchor per corner', () => {
      const contours = GF.commandsToAnchors([
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 10, y: 0 },
        { type: 'L', x: 10, y: 10 },
        { type: 'L', x: 0, y: 0 }, // explicit return to start
        { type: 'Z' },
      ]);
      expect(contours.length).toBe(1);
      // The closing point coincides with the start, so it is merged away.
      expect(contours[0].length).toBe(3);
      contours[0].forEach((a) => { expect(a.in).toBeNull(); expect(a.out).toBeNull(); });
    });

    test('cubic commands wire out-handle on the from-anchor and in-handle on the to-anchor', () => {
      const [c] = GF.commandsToAnchors([
        { type: 'M', x: 0, y: 0 },
        { type: 'C', x1: 0, y1: 5, x2: 5, y2: 5, x: 5, y: 0 },
        { type: 'C', x1: 5, y1: -5, x2: 0, y2: -5, x: 0, y: 0 }, // closes back to start
        { type: 'Z' },
      ]);
      expect(c.length).toBe(2);
      expect(c[0].out).toEqual({ x: 0, y: 5 });   // first cubic's c1
      expect(c[1].in).toEqual({ x: 5, y: 5 });    // first cubic's c2
      expect(c[1].out).toEqual({ x: 5, y: -5 });  // closing cubic's c1
      expect(c[0].in).toEqual({ x: 0, y: -5 });   // closing cubic's c2 merged onto start
    });

    test('quadratics are promoted to cubics with the 2/3 control rule', () => {
      const [c] = GF.commandsToAnchors([
        { type: 'M', x: 0, y: 0 },
        { type: 'Q', x1: 10, y1: 10, x: 20, y: 0 },
      ]);
      expect(c.length).toBe(2);
      expect(c[0].out.x).toBeCloseTo(20 / 3, 6);
      expect(c[0].out.y).toBeCloseTo(20 / 3, 6);
      expect(c[1].in.x).toBeCloseTo(20 - 20 / 3, 6);
      expect(c[1].in.y).toBeCloseTo(20 / 3, 6);
    });
  });

  describe('optimizeAnchorsCardinal', () => {
    test('snaps a near-horizontal handle to exactly horizontal, preserving length', () => {
      const anchors = [
        { x: 0, y: 0, in: null, out: { x: 10, y: 0.3 } }, // ~1.7° off horizontal
        { x: 20, y: 0, in: null, out: null },
      ];
      GF.optimizeAnchorsCardinal(anchors, { smoothing: 0 });
      expect(anchors[0].out.y).toBeCloseTo(0, 6);
      expect(Math.hypot(anchors[0].out.x, anchors[0].out.y)).toBeCloseTo(Math.hypot(10, 0.3), 6);
    });

    test('leaves a clearly diagonal handle untouched', () => {
      const anchors = [
        { x: 0, y: 0, in: null, out: { x: 10, y: 10 } }, // 45°
        { x: 20, y: 0, in: null, out: null },
      ];
      GF.optimizeAnchorsCardinal(anchors, { smoothing: 0 });
      expect(anchors[0].out).toEqual({ x: 10, y: 10 });
    });
  });

  describe('smoothing → flatten tolerance', () => {
    const ID = '__curve-font__';
    const curveFont = () => ({
      unitsPerEm: 1000,
      tables: { os2: { sCapHeight: 700 } },
      getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map(() => ({
        advanceWidth: 500,
        getPath: (x, y, em) => ({
          commands: [
            { type: 'M', x, y: y - em * 0.5 },
            { type: 'C', x1: x + em * 0.3, y1: y - em * 0.5, x2: x + em * 0.3, y2: y, x, y },
            { type: 'Z' },
          ],
        }),
      })),
    });
    beforeEach(() => { V.WEBFONT_GLYPHS[ID] = curveFont(); });
    afterEach(() => { delete V.WEBFONT_GLYPHS[ID]; });

    test('higher smoothing subdivides curves more finely (more points)', () => {
      const coarse = GF.layout('O', { id: ID, size: 40, smoothing: 0 });
      const fine = GF.layout('O', { id: ID, size: 40, smoothing: 6 });
      expect(fine.paths[0].length).toBeGreaterThan(coarse.paths[0].length);
    });

    test('bezier mode returns anchors parallel to paths with real handles', () => {
      const out = GF.layout('O', { id: ID, size: 40, bezier: true });
      expect(Array.isArray(out.anchors)).toBe(true);
      expect(out.anchors.length).toBe(out.paths.length);
      const withHandles = out.anchors.filter(Boolean).some((c) => c.some((a) => a.in || a.out));
      expect(withHandles).toBe(true);
    });
  });

  describe('Text algorithm web-font branch', () => {
    const bounds = { width: 400, height: 300, m: 20, dW: 360, dH: 260 };
    const gen = (extra) => V.AlgorithmRegistry.text.generate(
      { ...V.ALGO_DEFAULTS.text, ...extra },
      new V.SeededRNG(1),
      new V.SimpleNoise(1),
      bounds,
    );

    // The Text algorithm reads the parse cache (Vectura.WEBFONT_GLYPHS) through the
    // module's own getParsed, so a parsed family is simulated by seeding the store;
    // the async loader is stubbed so no test ever touches the network.
    const PARSED_ID = '__parsed-web__';
    let savedEnsure;
    let savedStatus;
    beforeEach(() => { savedEnsure = GF.ensureFont; savedStatus = GF.getFontStatus; });
    afterEach(() => {
      GF.ensureFont = savedEnsure;
      GF.getFontStatus = savedStatus;
      delete V.WEBFONT_GLYPHS[PARSED_ID];
    });

    test('traces glyph outlines when the chosen web family is parsed', () => {
      V.WEBFONT_GLYPHS[PARSED_ID] = makeFont();
      // bezierOutline off → flattened polyline passthrough (the bezier-on branch is
      // covered separately); outlines must not be re-smoothed by the engine.
      const paths = gen({ font: `google:${PARSED_ID}`, text: 'AB', fitToFrame: false, fontSize: 40, bezierOutline: false });
      expect(paths.length).toBeGreaterThan(0);
      paths.forEach((p) => expect(p.length).toBeGreaterThanOrEqual(2));
      expect(paths.every((p) => p.meta && p.meta.straight === true)).toBe(true);
    });

    test('falls back to the stroke font and kicks off the load while unparsed', () => {
      let requested = null;
      GF.getFontStatus = () => 'idle';
      GF.ensureFont = (id) => { requested = id; return Promise.resolve(); };
      const paths = gen({ font: 'google:lobster', text: 'AB', fitToFrame: false, fontSize: 40 });
      expect(paths.length).toBeGreaterThan(0); // stroke placeholder renders meanwhile
      expect(requested).toBe('lobster');
    });

    test('does not re-request a family that is already loading', () => {
      let calls = 0;
      GF.getFontStatus = () => 'loading';
      GF.ensureFont = () => { calls += 1; return Promise.resolve(); };
      gen({ font: 'google:lobster', text: 'AB' });
      expect(calls).toBe(0);
    });
  });

  describe('Text outline features (bezier / fill / thickening / plot order)', () => {
    const bounds = { width: 400, height: 300, m: 20, dW: 360, dH: 260 };
    const PARSED = '__outline-feat__';
    const gen = (extra) => V.AlgorithmRegistry.text.generate(
      { ...V.ALGO_DEFAULTS.text, ...extra },
      new V.SeededRNG(1),
      new V.SimpleNoise(1),
      bounds,
    );
    // A glyph whose outline is a single cubic-bearing closed contour.
    const curveFont = () => ({
      unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map(() => ({
        advanceWidth: 500,
        getPath: (x, y, em) => ({ commands: [
          { type: 'M', x, y: y - em * 0.5 },
          { type: 'C', x1: x + em * 0.3, y1: y - em * 0.5, x2: x + em * 0.3, y2: y, x, y },
          { type: 'Z' },
        ] }),
      })),
    });
    afterEach(() => { delete V.WEBFONT_GLYPHS[PARSED]; });

    test('bezierOutline attaches native cubic anchors to the stroke paths', () => {
      V.WEBFONT_GLYPHS[PARSED] = curveFont();
      // mergeOverlaps flattens to straight polygons, so the bezier path is only
      // reachable with merge off.
      const paths = gen({ font: `google:${PARSED}`, text: 'O', fitToFrame: false, fontSize: 40, bezierOutline: true, mergeOverlaps: false });
      const curved = paths.filter((p) => p.meta && p.meta.anchors);
      expect(curved.length).toBeGreaterThan(0);
      curved.forEach((p) => {
        expect(p.meta.straight).toBe(false);
        expect(p.meta.forceCurves).toBe(true);
        expect(p.meta.closed).toBe(true);
        expect(p.meta.anchors.some((a) => a.in || a.out)).toBe(true);
      });
    });

    test('bezierOutline is suppressed under jitter (no clean curve to keep)', () => {
      V.WEBFONT_GLYPHS[PARSED] = curveFont();
      const paths = gen({ font: `google:${PARSED}`, text: 'O', fitToFrame: false, fontSize: 40, bezierOutline: true, jitter: 2, mergeOverlaps: false });
      expect(paths.every((p) => !(p.meta && p.meta.anchors))).toBe(true);
    });

    test('fillEnabled hatches the glyph interior with tagged fill paths', () => {
      V.WEBFONT_GLYPHS[PARSED] = makeFont();
      const plain = gen({ font: `google:${PARSED}`, text: 'A', fitToFrame: false, fontSize: 40 });
      const filled = gen({ font: `google:${PARSED}`, text: 'A', fitToFrame: false, fontSize: 40, fillEnabled: true, fillType: 'hatch', fillDensity: 6 });
      expect(filled.length).toBeGreaterThan(plain.length);
      expect(filled.some((p) => p.meta && p.meta.textFill)).toBe(true);
    });

    test('contour fill smooths to bezier curves when fillContourBezier is on', () => {
      V.WEBFONT_GLYPHS[PARSED] = makeFont();
      const filled = gen({
        font: `google:${PARSED}`, text: 'A', fitToFrame: false, fontSize: 40,
        fillEnabled: true, fillType: 'contour', fillDensity: 6,
        fillContourBezier: true, fillContourSmoothing: 0.6,
      });
      const rings = filled.filter((p) => p.meta && p.meta.textFill);
      expect(rings.length).toBeGreaterThan(0);
      // At least one ring carries native cubic handles so the plotter draws a
      // smooth curve instead of grid-quantized stairsteps.
      const curved = rings.filter((p) => p.meta.anchors);
      expect(curved.length).toBeGreaterThan(0);
      curved.forEach((p) => {
        expect(p.meta.straight).toBe(false);
        expect(p.meta.forceCurves).toBe(true);
        expect(p.meta.anchors.some((a) => a.in || a.out)).toBe(true);
      });
    });

    test('contour fill stays straight polylines when fillContourBezier is off', () => {
      V.WEBFONT_GLYPHS[PARSED] = makeFont();
      const filled = gen({
        font: `google:${PARSED}`, text: 'A', fitToFrame: false, fontSize: 40,
        fillEnabled: true, fillType: 'contour', fillDensity: 6,
        fillContourBezier: false,
      });
      const rings = filled.filter((p) => p.meta && p.meta.textFill);
      expect(rings.length).toBeGreaterThan(0);
      expect(rings.every((p) => p.meta.straight === true)).toBe(true);
      expect(rings.every((p) => !p.meta.anchors)).toBe(true);
    });

    test('outlineStroke:false yields fill-only output (no stroke contours)', () => {
      V.WEBFONT_GLYPHS[PARSED] = makeFont();
      const out = gen({ font: `google:${PARSED}`, text: 'A', fitToFrame: false, fontSize: 40, fillEnabled: true, fillType: 'hatch', fillDensity: 6, outlineStroke: false });
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((p) => p.meta && p.meta.textFill)).toBe(true);
    });

    test('outlineThickness > 1 adds concentric outward offset passes to the outline', () => {
      V.WEBFONT_GLYPHS[PARSED] = makeFont();
      const thin = gen({ font: `google:${PARSED}`, text: 'A', fitToFrame: false, fontSize: 40 });
      const thick = gen({ font: `google:${PARSED}`, text: 'A', fitToFrame: false, fontSize: 40, outlineThickness: 6, thickeningMode: 'parallel' });
      // The base outline is still drawn; heavier weight ADDS concentric copies, so
      // there are strictly more paths than at weight 1.
      expect(thick.length).toBeGreaterThan(thin.length);
      // Each concentric pass is a closed offset ring (the widening outline).
      const isClosed = (p) => p.length >= 4
        && Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-6;
      expect(thick.filter(isClosed).length).toBeGreaterThan(thin.filter(isClosed).length);
      // Offsets grow the glyph OUTWARD: the thick output reaches beyond the thin bbox.
      const bbox = (paths) => {
        let minX = Infinity, maxX = -Infinity;
        paths.forEach((p) => p.forEach((pt) => { if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x; }));
        return { minX, maxX };
      };
      const a = bbox(thin); const b = bbox(thick);
      expect(b.maxX).toBeGreaterThan(a.maxX - 1e-6);
      expect(b.minX).toBeLessThan(a.minX + 1e-6);
      // Every coordinate is finite (no fold/offset blow-up).
      for (const p of thick) for (const pt of p) {
        expect(Number.isFinite(pt.x) && Number.isFinite(pt.y)).toBe(true);
      }
    });

    test('plotOrder leftToRight sorts paths by ascending min-x', () => {
      V.WEBFONT_GLYPHS[PARSED] = makeFont();
      const sorted = gen({ font: `google:${PARSED}`, text: 'AB', fitToFrame: false, fontSize: 40, plotOrder: 'leftToRight' });
      const minX = sorted.map((p) => Math.min(...p.map((pt) => pt.x)));
      for (let i = 1; i < minX.length; i++) expect(minX[i]).toBeGreaterThanOrEqual(minX[i - 1]);
    });
  });

  describe('Merge Overlaps (outline welding)', () => {
    const bounds = { width: 400, height: 300, m: 20, dW: 360, dH: 260 };
    const MERGE = '__merge-overlap__';
    const gen = (extra) => V.AlgorithmRegistry.text.generate(
      { ...V.ALGO_DEFAULTS.text, ...extra },
      new V.SeededRNG(1),
      new V.SimpleNoise(1),
      bounds,
    );
    afterEach(() => { delete V.WEBFONT_GLYPHS[MERGE]; });

    // Each glyph is a 0.7em right triangle but only advances 0.25em, so adjacent
    // glyphs ink-overlap — the worst case of a tight kern pair (RA, AV…). A
    // triangle (rather than an axis-aligned square) guarantees the overlapping
    // edges cross PROPERLY, which the crossing detector below relies on.
    const overlapFont = () => ({
      unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map(() => ({
        advanceWidth: 250,
        getPath: (x, y, em) => ({ commands: [
          { type: 'M', x, y },
          { type: 'L', x: x + em * 0.7, y },
          { type: 'L', x, y: y - em * 0.7 },
          { type: 'Z' },
        ] }),
      })),
    });

    // A glyph whose outline is a single cubic-bearing closed contour, confined to
    // the left of its advance so a standalone instance touches no neighbour.
    const curveFont = () => ({
      unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map(() => ({
        advanceWidth: 500,
        getPath: (x, y, em) => ({ commands: [
          { type: 'M', x, y: y - em * 0.5 },
          { type: 'C', x1: x + em * 0.3, y1: y - em * 0.5, x2: x + em * 0.3, y2: y, x, y },
          { type: 'Z' },
        ] }),
      })),
    });

    // Two glyph shapes keyed by char: 'I' is a narrow cubic contour pinned to the
    // left of its advance (touches no neighbour); every other char is a wide
    // triangle that ink-overlaps its neighbours. Lets one string mix glyphs that
    // must weld with glyphs that must keep their native curve.
    const mixedFont = () => ({
      unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map((ch) => (ch === 'I'
        ? { advanceWidth: 250, getPath: (x, y, em) => ({ commands: [
            { type: 'M', x, y: y - em * 0.5 },
            { type: 'C', x1: x + em * 0.12, y1: y - em * 0.5, x2: x + em * 0.12, y2: y, x, y },
            { type: 'Z' },
          ] }) }
        : { advanceWidth: 250, getPath: (x, y, em) => ({ commands: [
            { type: 'M', x, y },
            { type: 'L', x: x + em * 0.7, y },
            { type: 'L', x, y: y - em * 0.7 },
            { type: 'Z' },
          ] }) })),
    });

    // One glyph = outer square + an inner counter wound the SAME direction (so a
    // signed-area classifier would mis-handle it); a correct nonzero union by
    // containment must still carve the hole.
    const holedFont = () => ({
      unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map(() => ({
        advanceWidth: 800,
        getPath: (x, y, em) => ({ commands: [
          { type: 'M', x, y: y - em * 0.7 },
          { type: 'L', x: x + em * 0.7, y: y - em * 0.7 },
          { type: 'L', x: x + em * 0.7, y },
          { type: 'L', x, y },
          { type: 'Z' },
          { type: 'M', x: x + em * 0.2, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.45, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.45, y: y - em * 0.2 },
          { type: 'L', x: x + em * 0.2, y: y - em * 0.2 },
          { type: 'Z' },
        ] }),
      })),
    });

    // Proper segment crossing (shared endpoints / collinear touches don't count).
    const cross = (a, b, c, d) => {
      const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      const s1 = o(a, b, c); const s2 = o(a, b, d); const s3 = o(c, d, a); const s4 = o(c, d, b);
      return s1 !== s2 && s3 !== s4 && s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0;
    };
    const anyCrossingBetweenRings = (rings) => {
      for (let i = 0; i < rings.length; i += 1) {
        for (let j = i + 1; j < rings.length; j += 1) {
          const A = rings[i]; const B = rings[j];
          for (let a = 1; a < A.length; a += 1) {
            for (let b = 1; b < B.length; b += 1) {
              if (cross(A[a - 1], A[a], B[b - 1], B[b])) return true;
            }
          }
        }
      }
      return false;
    };

    test('RED proof: un-merged overlapping glyphs draw crossing contour lines', () => {
      V.WEBFONT_GLYPHS[MERGE] = overlapFont();
      const raw = gen({ font: `google:${MERGE}`, text: 'HH', fitToFrame: false, fontSize: 40, mergeOverlaps: false });
      expect(raw.length).toBe(2); // one closed contour per glyph
      expect(anyCrossingBetweenRings(raw)).toBe(true);
    });

    test('merge welds overlapping glyphs into a single non-crossing outline', () => {
      V.WEBFONT_GLYPHS[MERGE] = overlapFont();
      const welded = gen({ font: `google:${MERGE}`, text: 'HH', fitToFrame: false, fontSize: 40 });
      // The two overlapping squares union into one boundary loop…
      expect(welded.length).toBe(1);
      // …and nothing crosses anything anymore.
      expect(anyCrossingBetweenRings(welded)).toBe(false);
      // The union boolean only ever sees flat points, so the welded ring has no
      // font anchor map of its own — it must be RE-FIT into native bezier
      // anchors (same as any un-merged glyph) rather than left as a bare
      // straight-segment polygon, so a connected script run stays smooth.
      expect(welded.every((p) => p.meta && p.meta.straight === false && p.meta.forceCurves === true
        && Array.isArray(p.meta.anchors) && p.meta.anchors.length > 0)).toBe(true);
    });

    test('merge preserves counters (hole survives, is not flooded)', () => {
      V.WEBFONT_GLYPHS[MERGE] = holedFont();
      const welded = gen({ font: `google:${MERGE}`, text: 'O', fitToFrame: false, fontSize: 40 });
      // Outer boundary + carved counter = two rings; a flooded hole would be one.
      expect(welded.length).toBe(2);
    });

    test('merge keeps native bezier outlines for non-overlapping glyphs (default)', () => {
      V.WEBFONT_GLYPHS[MERGE] = curveFont();
      // A standalone curved glyph touches nothing, so the default (merge on) must
      // preserve its native cubic outline rather than flatten it to a polygon —
      // merge overlaps and full bezier accuracy coexist by default.
      const def = gen({ font: `google:${MERGE}`, text: 'O', fitToFrame: false, fontSize: 40, bezierOutline: true });
      const curved = def.filter((p) => p.meta && p.meta.anchors);
      expect(curved.length).toBeGreaterThan(0);
      curved.forEach((p) => {
        expect(p.meta.straight).toBe(false);
        expect(p.meta.forceCurves).toBe(true);
        expect(p.meta.anchors.some((a) => a.in || a.out)).toBe(true);
      });
    });

    test('merge welds only the overlapping glyphs and keeps the rest as beziers', () => {
      V.WEBFONT_GLYPHS[MERGE] = mixedFont();
      // "IXX": the narrow curved I touches nothing; the two wide X triangles ink-
      // overlap each other. Default merge must weld the XX pair into one
      // boundary while leaving I as a native cubic outline (selective merge).
      // The welded boundary is re-fit into its own bezier anchors (no font
      // anchor map survives a boolean union), so BOTH the untouched I and the
      // welded XX ring end up native-curve — welding no longer means faceted.
      const out = gen({ font: `google:${MERGE}`, text: 'IXX', fitToFrame: false, fontSize: 40 });
      const curved = out.filter((p) => p.meta && p.meta.anchors);
      const flat = out.filter((p) => p.meta && p.meta.straight === true && !p.meta.anchors);
      // the I survived as a native curve, and the welded XX ring is native too…
      expect(curved.length).toBe(2);
      expect(curved.every((p) => p.meta.forceCurves === true)).toBe(true);
      // …so nothing is left as a bare straight-segment polygon…
      expect(flat.length).toBe(0);
      // …and the welded ring's fitted anchors still don't cross anything.
      expect(anyCrossingBetweenRings(curved.map((p) => p.meta.anchors))).toBe(false);
    });

    test('bezierOutline off + merge keeps non-overlapping glyphs as plain polylines', () => {
      V.WEBFONT_GLYPHS[MERGE] = curveFont();
      const out = gen({ font: `google:${MERGE}`, text: 'O', fitToFrame: false, fontSize: 40, bezierOutline: false });
      expect(out.length).toBeGreaterThan(0);
      expect(out.every((p) => p.meta && p.meta.straight === true && !p.meta.anchors)).toBe(true);
    });

    test('nonZeroUnionByContainment welds overlaps and carves holes (orientation-robust)', () => {
      const FB = V.FillBoolean;
      const sq = (x, y, s) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }];
      // Two overlapping shells → one polygon; a same-wound inner square (kept
      // clear of the dissolved seam at x=10) → a carved hole.
      const mp = FB.nonZeroUnionByContainment([sq(0, 0, 12), sq(8, 0, 12), sq(2, 2, 3)]);
      expect(mp.length).toBe(1); // single merged polygon
      expect(mp[0].length).toBe(2); // exterior ring + one carved hole
    });
  });
});
