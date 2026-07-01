/*
 * Area type (Illustrator-style) — create, wrap, edit, gate, serialize (RGR).
 *
 * Click-DRAG with the Type tool on empty canvas creates an AREA text layer whose
 * text WRAPS at the frame width. The controller edits the wrapped text against
 * the RAW string (exact sourceIndex from the area word-wrap), so caret/selection
 * land on correct raw indices even across a wrap boundary.
 *
 * These tests drive the REAL app path (App._createAreaTextLayerAt, wired to
 * TextEditController.beginNewAtArea via the createAreaTextLayerAt host hook), so a
 * regression in app.js / engine.js / the controller is caught here.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Area type create + edit (Illustrator-style)', () => {
  let runtime, window, app;
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

  test('_createAreaTextLayerAt makes an area layer with textMode/frameWidth/frameHeight and a built-in font', () => {
    const layer = app._createAreaTextLayerAt(20, 30, 120, 90);
    expect(layer).toBeTruthy();
    expect(layer.type).toBe('text');
    expect(layer.params.textMode).toBe('area');
    expect(layer.params.frameWidth).toBeCloseTo(100, 3);   // |120 - 20|
    expect(layer.params.frameHeight).toBeCloseTo(60, 3);    // |90 - 30|
    expect(layer.params.fitToFrame).toBe(false);
    // Built-in stroke font so the mutation gate accepts editing immediately.
    expect(window.Vectura.GoogleFonts.isWebFontKey(layer.params.font)).toBe(false);
    expect(app.textEdit.canMutate(layer)).toBe(true);
    // An empty area layer still exposes a frame (engine sidecar) for the overlay.
    expect(Array.isArray(layer.textFrame)).toBe(true);
    expect(layer.textFrame.length).toBe(4);
    app.engine.removeLayer(layer.id);
  });

  test('beginNewAtArea then typing WRAPS at the frame width with exact raw indices', () => {
    // Narrow frame so "hello world foo" must wrap onto multiple lines.
    const layer = app.textEdit.beginNewAtArea(10, 10, 55, 120);
    try {
      expect(layer).toBeTruthy();
      expect(layer.params.textMode).toBe('area');
      expect(app.textEdit.isActive()).toBe(true);
      for (const ch of 'hello world foo') expect(app.textEdit.insertText(ch)).toBe(true);
      expect(layer.params.text).toBe('hello world foo');

      const glyphs = layer.glyphs || [];
      // Wrapping actually happened: more than one visual line.
      const lineCount = new Set(glyphs.map((g) => g.lineIndex)).size;
      expect(lineCount).toBeGreaterThanOrEqual(2);

      // sourceIndex is the EXACT raw index: the cell for 'w' (raw index 6) exists
      // and every non-space cell points at a non-space source character.
      const wCell = glyphs.find((g) => g.sourceIndex === 6);
      expect(wCell).toBeTruthy();
      for (const g of glyphs) {
        if (!g.isSpace) expect(layer.params.text[g.sourceIndex]).not.toBe(' ');
      }
    } finally {
      app.textEdit.end();
    }
  });

  test('caret placement lands on correct raw indices in wrapped text (across the wrap boundary)', () => {
    const layer = app.textEdit.beginNewAtArea(10, 10, 55, 120);
    try {
      for (const ch of 'hello world foo') app.textEdit.insertText(ch);
      const glyphs = layer.glyphs || [];
      // Click at the left edge of the 'w' cell → caret index 6 (start of "world").
      const wCell = glyphs.find((g) => g.sourceIndex === 6);
      const tl = wCell.quad[0]; const bl = wCell.quad[3];
      const cx = (tl.x + bl.x) / 2;
      const cy = (tl.y + bl.y) / 2;
      const TM = window.Vectura.TextMetrics;
      const r = TM.pointToCaretIndex(glyphs, cx - 0.01, cy);
      expect(r.caretIndex).toBe(6);
    } finally {
      app.textEdit.end();
    }
  });

  test('canMutate: built-in area editable, web-font area still gated', () => {
    const areaBuiltin = { type: 'text', params: { textMode: 'area', frameWidth: 100, font: 'sans' } };
    const areaWeb = { type: 'text', params: { textMode: 'area', frameWidth: 100, font: 'google:inter' } };
    const pointBuiltin = { type: 'text', params: { textMode: 'point', font: 'sans' } };
    expect(app.textEdit.canMutate(areaBuiltin)).toBe(true);
    expect(app.textEdit.canMutate(areaWeb)).toBe(false);
    expect(app.textEdit.canMutate(pointBuiltin)).toBe(true);
  });

  test('renderer gesture routing: a drag beyond threshold → area, a sub-threshold press → point', () => {
    const r = app.renderer;
    // Drag beyond threshold spanning a usable rect → AREA type.
    r._areaCreate = { startX: 0, startY: 0, x0: 10, y0: 10, curX: 90, curY: 70, dragging: true };
    r.finishAreaCreate();
    const areaLayer = app.textEdit.getActiveLayer();
    expect(areaLayer).toBeTruthy();
    expect(areaLayer.params.textMode).toBe('area');
    app.textEdit.end();
    app.engine.removeLayer(areaLayer.id);

    // Sub-threshold press (never dragged) → POINT type at the press point.
    r._areaCreate = { startX: 0, startY: 0, x0: 40, y0: 40, curX: 40, curY: 40, dragging: false };
    r.finishAreaCreate();
    const pointLayer = app.textEdit.getActiveLayer();
    expect(pointLayer).toBeTruthy();
    expect(pointLayer.params.textMode).toBe('point');
    app.textEdit.end();
  });

  test('serialization round-trips textMode / frameWidth / frameHeight', () => {
    const layer = app._createAreaTextLayerAt(0, 0, 80, 50);
    layer.params.text = 'round trip';
    app.engine.generate(layer.id);
    const str = JSON.stringify(app.engine.exportState());
    // Re-import the serialized document and confirm the params survived.
    app.engine.importState(JSON.parse(str));
    const restored = app.engine.layers.find((l) => l.id === layer.id);
    expect(restored).toBeTruthy();
    expect(restored.params.textMode).toBe('area');
    expect(restored.params.frameWidth).toBeCloseTo(80, 3);
    expect(restored.params.frameHeight).toBeCloseTo(50, 3);
  });
});
