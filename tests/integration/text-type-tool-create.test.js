/*
 * On-canvas Type-tool layer creation defaults to Inter AND stays editable.
 *
 * New Type-tool text inherits the global default face — Inter ('google:inter'),
 * a web font vendored locally (src/vendor/inter-400.ttf) and parsed at boot — so
 * it matches panel-created text instead of forcing the built-in stroke font.
 * A raw web-font layer is gated (canMutate false: ligatures desync sourceIndex),
 * but begin() calls _enableWebEdit which switches the layer ligatures-off (1:1
 * char↔glyph), so insert/delete work the instant the edit session starts.
 *
 * These tests drive the REAL app path (App._createPointTextLayerAt, wired to
 * TextEditController.beginNewAt via the createTextLayerAt host hook) so a
 * regression in app.js / the controller is caught here.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Type tool on-canvas layer creation (BUG 2a)', () => {
  let runtime;
  let window;
  let app;

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
    app = new window.Vectura.App();
    await Promise.resolve();
  });

  afterAll(() => runtime.cleanup());

  test('_createPointTextLayerAt inherits the default Inter web face, editable via the session', () => {
    const layer = app._createPointTextLayerAt(120, 90);
    try {
      expect(layer).toBeTruthy();
      // Inherits the global default face — Inter (web font), NOT the stroke font.
      expect(layer.params.font).toBe('google:inter');
      expect(window.Vectura.GoogleFonts.isWebFontKey(layer.params.font)).toBe(true);
      // Beginning an edit session switches the layer ligatures-off so the
      // mutation gate accepts it (typing is not blocked).
      expect(app.textEdit.begin(layer, 0)).toBe(true);
      expect(app.textEdit.canMutate(layer)).toBe(true);
    } finally {
      app.textEdit.end();
    }
  });

  test('create-then-type through beginNewAt actually writes params.text', () => {
    const layer = app.textEdit.beginNewAt(60, 60);
    try {
      expect(layer).toBeTruthy();
      expect(app.textEdit.isActive()).toBe(true);
      // The created layer carries 'google:inter'; beginNewAt's session switched it
      // ligatures-off, so insertText writes through instead of no-oping.
      expect(app.textEdit.insertText('H')).toBe(true);
      expect(app.textEdit.insertText('i')).toBe(true);
      expect(layer.params.text).toBe('Hi');
      expect(app.textEdit.getCaretIndex()).toBe(2);
    } finally {
      app.textEdit.end();
    }
  });

  test('pressing Enter grows the editing outline to include the new blank line', () => {
    const layer = app.textEdit.beginNewAt(60, 60);
    try {
      for (const ch of 'Hello') app.textEdit.insertText(ch);
      const before = app.renderer.getLayerBounds(layer);
      const h0 = before.maxY - before.minY;
      app.textEdit.insertNewline();
      const after = app.renderer.getLayerBounds(layer);
      const h1 = after.maxY - after.minY;
      // The blank second line adds ~one line-height to the box (grows, not static).
      expect(h1).toBeGreaterThan(h0 * 1.3);
    } finally {
      app.textEdit.end();
    }
  });

  test('typing pushes text RIGHT of the insertion point — earlier glyphs never move left', () => {
    // Left-aligned point text created by the Type tool must grow rightward from
    // the click: the empty-box caret marks where the first glyph's left edge lands,
    // and that edge stays put as more characters are appended.
    const clickX = 140;
    const layer = app.textEdit.beginNewAt(clickX, 100);
    try {
      // Empty box: the caret marks the pen origin (the initial flashing bar).
      const emptyCaret = app.textEdit.getCaretSegment();
      expect(emptyCaret).toBeTruthy();
      const caretX = emptyCaret.x0;

      app.textEdit.insertText('A');
      const leftAfterA = layer.glyphs[0].quad[0].x;
      // The first glyph's left edge lands exactly where the empty caret was.
      expect(leftAfterA).toBeCloseTo(caretX, 3);

      app.textEdit.insertText('long the way');
      const leftAfterMore = layer.glyphs[0].quad[0].x;
      // Appending more text does NOT drag the first glyph left.
      expect(leftAfterMore).toBeCloseTo(leftAfterA, 3);
    } finally {
      app.textEdit.end();
    }
  });
});
