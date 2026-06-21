const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Text font picker UI (RGR coverage for the fontPicker control).
 *
 * The Text algorithm's Font control is a custom `fontPicker`: a Built-in tab
 * (the five stroke faces) and a Google Fonts tab (the web catalog, traced as
 * outlines). This boots the full app, selects a Text layer, builds its controls,
 * and asserts the picker renders and selecting a built-in face updates the layer.
 * The web catalog is network-bound, so offline (jsdom) the Google tab degrades to
 * a status note rather than throwing — which is the contract we pin here.
 */
describe('Text font picker control', () => {
  let runtime;
  let window;
  let app;
  let doc;

  const FULL_STACK = {
    includeRenderer: true,
    includeUi: true,
    includeApp: true,
    includeMain: false,
    useIndexHtml: true,
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    window = runtime.window;
    doc = window.document;
    app = new window.Vectura.App();
    await Promise.resolve();
    // Make a Text layer the active selection, then rebuild the config panel.
    const id = app.engine.addLayer('text');
    app.engine.activeLayerId = id;
    app.renderer.setSelection([id], id);
    app.ui.buildControls();
  });

  afterAll(() => runtime.cleanup());

  const fontControl = () => {
    // The Font control's tab buttons carry these labels; find the control's wrapper.
    const buttons = Array.from(doc.querySelectorAll('button'));
    return {
      builtinTab: buttons.find((b) => b.textContent.trim() === 'Built-in'),
      googleTab: buttons.find((b) => b.textContent.trim() === 'Google Fonts'),
      faceButtons: buttons.filter((b) => b.dataset && b.dataset.value),
    };
  };

  test('renders Built-in and Google Fonts tabs', () => {
    const { builtinTab, googleTab } = fontControl();
    expect(builtinTab).toBeTruthy();
    expect(googleTab).toBeTruthy();
  });

  test('lists the five built-in stroke faces on the Built-in tab', () => {
    // The default Text font is a vendored web family (google:inter), so the
    // picker opens on the Google tab; switch to Built-in to see the stroke faces.
    fontControl().builtinTab.click();
    const labels = fontControl().faceButtons.map((b) => b.dataset.value);
    ['sans', 'italic', 'condensed', 'wide', 'oblique'].forEach((v) => expect(labels).toContain(v));
  });

  test('selecting a built-in face updates the layer font', () => {
    fontControl().builtinTab.click();
    const wide = fontControl().faceButtons.find((b) => b.dataset.value === 'wide');
    expect(wide).toBeTruthy();
    wide.click();
    const layer = app.engine.layers.find((l) => l.id === app.engine.activeLayerId);
    expect(layer.params.font).toBe('wide');
  });

  // Find the font-picker control's wrapper by locating the Built-in tab's
  // ancestor that also contains the face-button list.
  const fontWrapper = () => {
    const { builtinTab } = fontControl();
    let el = builtinTab;
    while (el && !el.querySelector('button[data-value]')) el = el.parentElement;
    return el;
  };

  test('built-in faces render an inline SVG stroke sample', () => {
    // Make sure we are on the Built-in tab (a prior test may have switched away).
    fontControl().builtinTab.click();
    const wrap = fontWrapper();
    expect(wrap).toBeTruthy();
    const sampleSvg = wrap.querySelector('button[data-value] svg polyline');
    expect(sampleSvg).toBeTruthy();
  });

  test('search filters the built-in list', () => {
    fontControl().builtinTab.click();
    const wrap = fontWrapper();
    const before = wrap.querySelectorAll('button[data-value]').length;
    expect(before).toBeGreaterThan(1);
    // The search input sits inside the same wrapper; type a query unique to one face.
    const input = wrap.querySelector('input[type="search"]');
    expect(input).toBeTruthy();
    input.value = 'wide';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    const after = Array.from(wrap.querySelectorAll('button[data-value]'));
    expect(after.length).toBeLessThan(before);
    expect(after.some((b) => b.dataset.value === 'wide')).toBe(true);
    // Reset the query so later tests see the full list.
    input.value = '';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  });

  test('Google Fonts tab degrades gracefully when the catalog is unavailable', () => {
    const { googleTab } = fontControl();
    expect(() => googleTab.click()).not.toThrow();
    // Offline: the list shows a status note, never the built-in faces and never a throw.
    const text = doc.body.textContent;
    expect(/web fonts|Loading web fonts/i.test(text)).toBe(true);
  });

  // Regression: switching to a web family that hasn't been parsed yet must NOT
  // regenerate the canvas immediately (that flashed the built-in stroke fallback).
  // The swap is deferred until the outline lands; a parsed/built-in face swaps now.
  test('switching to an unparsed web font defers regen; parsed/built-in swap immediately', () => {
    const GF = window.Vectura.GoogleFonts;
    const fams = [
      { id: 'aaa', family: 'Aaa Sans', category: 'sans-serif', weights: [400], subsets: ['latin'], defSubset: 'latin' },
      { id: 'bbb', family: 'Bbb Serif', category: 'serif', weights: [400], subsets: ['latin'], defSubset: 'latin' },
    ];
    const fakeFont = {
      unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map(() => ({
        advanceWidth: 500,
        getPath: (x, y) => ({ commands: [{ type: 'M', x, y }, { type: 'L', x: x + 1, y }, { type: 'L', x: x + 1, y: y + 1 }, { type: 'Z' }] }),
      })),
    };
    const saved = { gcs: GF.getCatalogStatus, gf: GF.getFamilies, ff: GF.findFamily, gp: GF.getParsed, ef: GF.ensureFont };
    GF.getCatalogStatus = () => ({ status: 'ready', errorMessage: '' });
    GF.getFamilies = () => fams;
    GF.findFamily = (id) => fams.find((f) => f.id === id) || null;
    window.Vectura.WEBFONT_GLYPHS.aaa = fakeFont;
    GF.getParsed = (id) => (id === 'aaa' ? fakeFont : null);
    GF.ensureFont = () => Promise.resolve();
    const origRegen = app.regen;
    let regens = 0;
    app.regen = () => { regens += 1; };
    try {
      const layer = app.engine.layers.find((l) => l.id === app.engine.activeLayerId);
      layer.params.font = 'google:aaa';
      app.ui.buildControls();

      const findBtn = (val) => Array.from(doc.querySelectorAll('button')).find((b) => b.dataset && b.dataset.value === val);

      findBtn('google:bbb').click();        // unparsed → deferred
      expect(layer.params.font).toBe('google:bbb');
      expect(regens).toBe(0);

      findBtn('google:aaa').click();         // parsed → immediate
      expect(layer.params.font).toBe('google:aaa');
      expect(regens).toBe(1);
    } finally {
      app.regen = origRegen;
      GF.getCatalogStatus = saved.gcs; GF.getFamilies = saved.gf; GF.findFamily = saved.ff; GF.getParsed = saved.gp; GF.ensureFont = saved.ef;
      delete window.Vectura.WEBFONT_GLYPHS.aaa;
    }
  });
});
