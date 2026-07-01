/*
 * BUG 2a — On-canvas Type-tool layer creation must be immediately editable.
 *
 * The global ALGO_DEFAULTS.text.font is a web font ('google:inter') for which
 * the edit controller's mutation gate (canMutate) returns false — so typing into
 * a layer created with that font inserts NOTHING. The on-canvas creation path
 * (App._createPointTextLayerAt, wired to TextEditController.beginNewAt via the
 * createTextLayerAt host hook) must instead default to the built-in Vectura
 * stroke font so insert/delete work the instant the box is created.
 *
 * These tests drive the REAL app path (not a stand-in host) so a regression in
 * app.js — reverting the font override — is caught here.
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

  test('_createPointTextLayerAt yields a built-in (non-web) font that canMutate accepts', () => {
    const layer = app._createPointTextLayerAt(120, 90);
    expect(layer).toBeTruthy();
    // Built-in Vectura stroke font — NOT the global 'google:inter' web default.
    expect(layer.params.font).toBe('sans');
    expect(window.Vectura.GoogleFonts.isWebFontKey(layer.params.font)).toBe(false);
    // The mutation gate must accept it so typing is not blocked.
    expect(app.textEdit.canMutate(layer)).toBe(true);
  });

  test('create-then-type through beginNewAt actually writes params.text', () => {
    const layer = app.textEdit.beginNewAt(60, 60);
    try {
      expect(layer).toBeTruthy();
      expect(app.textEdit.isActive()).toBe(true);
      // Without the fix the created layer carries 'google:inter' → canMutate false
      // → insertText returns false and params.text stays empty.
      expect(app.textEdit.insertText('H')).toBe(true);
      expect(app.textEdit.insertText('i')).toBe(true);
      expect(layer.params.text).toBe('Hi');
      expect(app.textEdit.getCaretIndex()).toBe(2);
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
