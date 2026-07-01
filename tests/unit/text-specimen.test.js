/*
 * Text panel specimen renderer (RGR coverage).
 *
 * window.Vectura.UI.TextSpecimen.create(refs) draws the live preview inside the
 * bespoke Text panel: it styles the editable specimen text and paints the guide /
 * outline-node / fill-line SVG overlays from layer.params + a view object. These
 * tests pin its contract against the real engine runtime (GoogleFonts, StrokeFont):
 *   - it populates the SVG overlays without throwing for a built-in face and a
 *     (synthetically parsed) web face;
 *   - every guide mode emits the right kind of guide geometry (none clears);
 *   - showFillLines recolours the fill toolpaths (reveal blue + screen blend);
 *   - showOutlines layers real on-curve node markers;
 *   - editing leaves the specimen as plain CSS text (caret-safe, no jitter spans);
 *   - destroy() disconnects the ResizeObserver and stops re-rendering.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('TextSpecimen renderer', () => {
  let runtime;
  let win;
  let doc;
  let V;

  // A synthetic opentype-shaped font: each glyph is a unit-square outline so the
  // trace/weld/metric math is predictable and getPath emits real M/L/Z commands
  // (so node collection + welding actually run).
  const makeFont = () => ({
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    tables: { os2: { sCapHeight: 700, sxHeight: 500 } },
    getKerningValue: () => 0,
    stringToGlyphs: (s) =>
      Array.from(String(s)).map(() => ({
        advanceWidth: 600,
        getPath: (x, y, em) => ({
          commands: [
            { type: 'M', x, y: y - em * 0.7 },
            { type: 'L', x: x + em * 0.5, y: y - em * 0.7 },
            { type: 'L', x: x + em * 0.5, y },
            { type: 'L', x, y },
            { type: 'Z' },
          ],
        }),
      })),
  });

  // Give a freshly-created element a non-zero layout box (jsdom reports 0 for
  // clientWidth/Height, which would otherwise make the specimen fall back to its
  // default box). 266x78 mirrors the real .vtp-spec-stage.
  const sized = (el, w = 266, h = 78) => {
    Object.defineProperty(el, 'clientWidth', { configurable: true, value: w });
    Object.defineProperty(el, 'clientHeight', { configurable: true, value: h });
    el.getBoundingClientRect = () => ({ width: w, height: h, left: 0, top: 0, right: w, bottom: h });
    return el;
  };

  const makeRefs = () => {
    const stage = sized(doc.createElement('div'));
    const specText = doc.createElement('div');
    const guideSvg = doc.createElementNS(SVG_NS, 'svg');
    const fillSvg = doc.createElementNS(SVG_NS, 'svg');
    const outlineSvg = doc.createElementNS(SVG_NS, 'svg');
    stage.appendChild(guideSvg);
    stage.appendChild(specText);
    stage.appendChild(fillSvg);
    stage.appendChild(outlineSvg);
    return { stage, specText, guideSvg, fillSvg, outlineSvg };
  };

  const baseParams = (over) =>
    Object.assign(
      {
        text: 'AB',
        font: 'google:specimen-test',
        fontWeight: 'Regular',
        fitToFrame: false,
        fillRatio: 0.85,
        fontSize: 40,
        tracking: 0,
        lineHeight: 1.15,
        vScale: 100,
        hScale: 100,
        kerning: 0,
        baselineShift: 0,
        charRotation: 0,
        jitter: 0,
        allCaps: false,
        align: 'center',
        offsetX: 0,
        offsetY: 0,
        outlineStroke: true,
        outlineThickness: 1,
        thickeningMode: 'parallel',
        mergeOverlaps: true,
        fillEnabled: false,
        fillType: 'hatch',
        fillDensity: 14,
        fillAngle: 45,
        fillInsetEnabled: false,
        fillInset: 1.5,
        fillOffsetX: 0,
        fillOffsetY: 0,
      },
      over || {}
    );

  const webLayer = (over) => ({ id: 1, type: 'text', params: baseParams(over) });
  const builtinLayer = (over) => ({ id: 2, type: 'text', params: baseParams(Object.assign({ font: 'sans' }, over)) });

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    win = runtime.window;
    doc = runtime.document;
    V = win.Vectura;
    // Register a synthetic parsed face under the web key the layers reference, so
    // getParsed('specimen-test') resolves without any network.
    V.WEBFONT_GLYPHS = V.WEBFONT_GLYPHS || {};
    V.WEBFONT_GLYPHS['specimen-test'] = makeFont();
  });

  afterAll(() => runtime.cleanup());

  test('registers a create() factory returning a render/destroy controller', () => {
    expect(V.UI && V.UI.TextSpecimen).toBeTruthy();
    expect(typeof V.UI.TextSpecimen.create).toBe('function');
    const c = V.UI.TextSpecimen.create(makeRefs());
    expect(typeof c.render).toBe('function');
    expect(typeof c.destroy).toBe('function');
    c.destroy();
  });

  test('built-in face renders without throwing and exposes no fillable interior', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    expect(() => c.render(builtinLayer({ fillEnabled: true }), { guides: 'frame' })).not.toThrow();
    // frame guide drew a rect
    expect(refs.guideSvg.innerHTML).toContain('<rect');
    // built-in/stroke faces are not fillable → no fill toolpaths painted
    expect(refs.fillSvg.innerHTML).toBe('');
    // the specimen text was populated from params.text
    expect(refs.specText.textContent).toBe('AB');
    c.destroy();
  });

  test('built-in face draws the REAL stroke-font geometry (faithful, not a CSS stand-in)', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    // Non-editing, no jitter, outline on → the specimen must trace the actual
    // Vectura monoline glyphs so it matches the plotted output. Before this was
    // wired, a built-in face left the outline overlay empty and showed the UI sans.
    c.render(builtinLayer({ text: 'VECTURA' }), { guides: 'frame' });
    expect(refs.outlineSvg.innerHTML).toContain('<path');
    expect(refs.outlineSvg.innerHTML).toContain('stroke="#f1f1f1"');
    // The curved skeleton (arcs + splines) emits many line segments per glyph.
    expect((refs.outlineSvg.innerHTML.match(/L/g) || []).length).toBeGreaterThan(40);
    // …and the CSS specimen text stand-in is hidden (the strokes ARE the specimen).
    expect(parseFloat(refs.specText.style.webkitTextStrokeWidth)).toBe(0);
    c.destroy();
  });

  test('built-in specimen under jitter falls back to the CSS stand-in (caret-safe)', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    c.render(builtinLayer({ jitter: 2, text: 'ABC' }), { guides: 'none', editing: false });
    // Jitter is owned by the CSS spans, so the faithful stroke trace is suppressed.
    expect(refs.outlineSvg.innerHTML).toBe('');
    expect(refs.specText.querySelectorAll('span').length).toBe(3);
    c.destroy();
  });

  test('web face traces glyph contours into the outline overlay without throwing', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    expect(() => c.render(webLayer(), { guides: 'frame' })).not.toThrow();
    // outlineStroke on + faithful trace → a stroked contour path
    expect(refs.outlineSvg.innerHTML).toContain('<path');
    expect(refs.outlineSvg.innerHTML).toContain('stroke="#f1f1f1"');
    c.destroy();
  });

  test('guide modes emit their distinct geometry; none clears the overlay', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    const layer = webLayer();

    c.render(layer, { guides: 'frame' });
    expect(refs.guideSvg.innerHTML).toContain('<rect');

    c.render(layer, { guides: 'center' });
    expect(refs.guideSvg.innerHTML).toContain('<rect');
    expect(refs.guideSvg.innerHTML).toContain('<line');

    c.render(layer, { guides: 'baseline' });
    expect(refs.guideSvg.innerHTML).toContain('<line');

    c.render(layer, { guides: 'ruled' });
    expect((refs.guideSvg.innerHTML.match(/<line/g) || []).length).toBeGreaterThanOrEqual(2);

    c.render(layer, { guides: 'hand' });
    expect((refs.guideSvg.innerHTML.match(/<line/g) || []).length).toBeGreaterThanOrEqual(5);

    c.render(layer, { guides: 'dots' });
    expect(refs.guideSvg.innerHTML).toContain('<circle');

    c.render(layer, { guides: 'none' });
    expect(refs.guideSvg.innerHTML).toBe('');

    c.destroy();
  });

  test('showFillLines recolours the fill toolpaths (reveal blue + screen blend)', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    const layer = webLayer({ fillEnabled: true });

    c.render(layer, { guides: 'frame', showFillLines: false });
    const plain = refs.fillSvg.innerHTML;
    expect(plain).not.toBe('');
    expect(plain).toContain('#f1f1f1');
    expect(plain).not.toContain('mix-blend-mode:screen');

    c.render(layer, { guides: 'frame', showFillLines: true });
    const reveal = refs.fillSvg.innerHTML;
    expect(reveal).toContain('rgba(86,150,222');
    expect(reveal).toContain('mix-blend-mode:screen');

    c.destroy();
  });

  test('fill clips to traced glyph rings via an evenodd mask', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    c.render(webLayer({ fillEnabled: true, fillType: 'cross', fillDensity: 20 }), { guides: 'none' });
    expect(refs.fillSvg.innerHTML).toContain('<mask');
    expect(refs.fillSvg.innerHTML).toContain('fill-rule="evenodd"');
    expect(refs.fillSvg.innerHTML).toContain('mask="url(#');
    c.destroy();
  });

  test('showOutlines layers real on-curve node markers on the contour', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);

    c.render(webLayer(), { guides: 'none', showOutlines: false });
    const without = (refs.outlineSvg.innerHTML.match(/<rect/g) || []).length;

    c.render(webLayer(), { guides: 'none', showOutlines: true });
    const withNodes = (refs.outlineSvg.innerHTML.match(/<rect/g) || []).length;

    expect(withNodes).toBeGreaterThan(without);
    expect(refs.outlineSvg.innerHTML).toContain('#cfe6ff'); // on-curve anchor markers
    c.destroy();
  });

  test('editing keeps the specimen as plain CSS text (no jitter spans, caret-safe)', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    // Even with heavy jitter, an editing render must not split the text into spans.
    refs.specText.textContent = 'PRESET';
    c.render(webLayer({ jitter: 3, text: 'PRESET' }), { guides: 'none', editing: true });
    expect(refs.specText.querySelectorAll('span').length).toBe(0);
    // and the editing render uses the CSS stroke (faithful trace is suppressed)
    expect(parseFloat(refs.specText.style.webkitTextStrokeWidth) >= 0).toBe(true);
    c.destroy();
  });

  test('jitter (non-editing) splits the specimen into per-letter transformed spans', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    c.render(webLayer({ jitter: 2, text: 'ABC' }), { guides: 'none', editing: false });
    expect(refs.specText.querySelectorAll('span').length).toBe(3);
    c.destroy();
  });

  test('missing/loading web face falls back to the CSS preview without throwing', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    expect(() =>
      c.render(webLayer({ font: 'google:not-cached-anywhere', fillEnabled: true }), { guides: 'ruled' })
    ).not.toThrow();
    // guides still drew (fixed-ratio metric fallback), text still set
    expect(refs.guideSvg.innerHTML).toContain('<line');
    expect(refs.specText.textContent).toBe('AB');
    c.destroy();
  });

  test('honours vScale/hScale/charRotation/offset in the specimen transform', () => {
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    c.render(webLayer({ hScale: 120, vScale: 80, charRotation: 10, offsetX: 5 }), { guides: 'none' });
    const tf = refs.specText.style.transform;
    expect(tf).toContain('scale(1.2,0.8)');
    expect(tf).toContain('rotate(1.5deg)'); // charRotation * 0.15
    c.destroy();
  });

  test('destroy() disconnects the ResizeObserver and stops re-rendering', () => {
    let disconnected = 0;
    const observed = [];
    const RealRO = win.ResizeObserver;
    win.ResizeObserver = class {
      constructor(cb) {
        this.cb = cb;
      }
      observe(el) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {
        disconnected++;
      }
    };
    const refs = makeRefs();
    const c = V.UI.TextSpecimen.create(refs);
    c.render(webLayer(), { guides: 'frame' });
    expect(observed.length).toBe(1);
    c.destroy();
    expect(disconnected).toBe(1);
    // a post-destroy render is inert (no throw, leaves overlays untouched is fine)
    refs.guideSvg.innerHTML = 'SENTINEL';
    expect(() => c.render(webLayer(), { guides: 'dots' })).not.toThrow();
    expect(refs.guideSvg.innerHTML).toBe('SENTINEL');
    win.ResizeObserver = RealRO;
  });
});
