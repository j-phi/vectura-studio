/*
 * M4 — Selection granularity (RGR).
 *
 * Drives Vectura.TextEditController's public selection API directly (the DOM
 * multi-click / drag pointer detection in renderer.handleTypeToolDown lives in
 * the renderer and is exercised by e2e). The controller reads all caret/cell
 * geometry ONLY from world-space `layer.glyphs` via Vectura.TextMetrics.
 *
 * Covered:
 *   - double-click → WORD range (wordRangeAt); triple-click → PARAGRAPH range.
 *   - click-drag: beyond the screen threshold selects a range, below stays caret.
 *   - shift-click / shift-arrow EXTEND the focus while keeping the anchor.
 *   - typing a char / Enter REPLACES a non-empty selection; Backspace/Delete
 *     delete the range; the caret collapses to the edit point afterwards.
 *   - MUTATION GATE: on a shaped (google) face, selection + navigation still
 *     work but range deletion / replacement is blocked.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Type tool selection granularity (M4)', () => {
  let runtime, V, win, doc;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    win = runtime.window;
    doc = runtime.document;
  });
  afterEach(() => runtime.cleanup());

  const makeTextLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'ab cd ef', font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    return { id, layer };
  };

  // bindKeys:false → tests drive controller methods directly (no window listener).
  const makeHost = (engine, over = {}) => ({
    bindKeys: false,
    regen: (layer) => engine.generate(layer.id),
    pushHistory: vi.fn(),
    ...over,
  });

  // Real-event host (window capture listener active) for keyboard-driven cases.
  const makeKeyHost = (engine, over = {}) => ({
    regen: (layer) => engine.generate(layer.id),
    pushHistory: vi.fn(),
    requestDraw: vi.fn(),
    refreshPanel: vi.fn(),
    ...over,
  });

  const dispatchKey = (key, opts = {}) => {
    const ev = new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
    doc.body.dispatchEvent(ev);
    return ev;
  };

  const glyphAt = (layer, sourceIndex) => layer.glyphs.find((g) => g.sourceIndex === sourceIndex);
  const centerOf = (g) => ({
    x: (g.quad[0].x + g.quad[1].x) / 2,
    y: (g.quad[0].y + g.quad[3].y) / 2,
  });

  // ── Word / paragraph selection ─────────────────────────────────────────────
  test('double-click selects the WORD under the cursor', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'ab cd ef' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    // World point over the 'c' cell (sourceIndex 3).
    const g = glyphAt(layer, 3);
    const c = centerOf(g);
    expect(ctrl.selectWordAtWorld(c.x, c.y)).toBe(true);
    const sel = ctrl.getSelection();
    expect(sel).toEqual({ start: 3, end: 5 }); // 'cd'
    expect(ctrl.hasSelection()).toBe(true);
    ctrl.end();
  });

  test('triple-click selects the PARAGRAPH under the cursor', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'ab\ncd' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    const g = glyphAt(layer, 3); // 'c' on line 2
    const c = centerOf(g);
    expect(ctrl.selectParagraphAtWorld(c.x, c.y)).toBe(true);
    expect(ctrl.getSelection()).toEqual({ start: 3, end: 5 }); // 'cd'
    ctrl.end();
  });

  test('selectWordAt / selectParagraphAt map source index → range', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'ab cd ef' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    expect(ctrl.selectWordAt(0)).toBe(true);
    expect(ctrl.getSelection()).toEqual({ start: 0, end: 2 }); // 'ab'
    expect(ctrl.selectParagraphAt(4)).toBe(true);
    expect(ctrl.getSelection()).toEqual({ start: 0, end: 8 }); // whole single line
    ctrl.end();
  });

  // ── Drag threshold ─────────────────────────────────────────────────────────
  test('drag beyond the screen threshold selects a range; below stays a caret', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'ab cd ef' });
    const ctrl = new V.TextEditController(makeHost(engine));
    // Press at the start of 'a'.
    const g0 = glyphAt(layer, 0);
    const p0 = { x: g0.quad[0].x, y: (g0.quad[0].y + g0.quad[3].y) / 2 };
    ctrl.placeCaretAtWorld(layer, p0.x, p0.y);
    expect(ctrl.hasSelection()).toBe(false);

    // Below threshold → caller does NOT extend → stays a collapsed caret.
    expect(ctrl.exceedsDragThreshold(0, 0, 2, 0)).toBe(false);
    expect(ctrl.hasSelection()).toBe(false);

    // Beyond threshold → caller extends the drag to a later cell → range.
    expect(ctrl.exceedsDragThreshold(0, 0, 10, 0)).toBe(true);
    const g4 = glyphAt(layer, 4);
    const c4 = centerOf(g4);
    expect(ctrl.updateSelectionDragToWorld(c4.x, c4.y)).toBe(true);
    const sel = ctrl.getSelection();
    expect(sel.start).toBe(0);
    expect(sel.end).toBeGreaterThanOrEqual(4);
    ctrl.end();
  });

  // ── Shift-click extend ─────────────────────────────────────────────────────
  test('shift-click extends the focus while keeping the anchor', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'ab cd ef' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 1); // anchor at index 1
    const g5 = glyphAt(layer, 5);
    const c5 = centerOf(g5);
    expect(ctrl.extendSelectionToWorld(c5.x, c5.y)).toBe(true);
    const sel = ctrl.getSelection();
    expect(sel.start).toBe(1); // anchor preserved
    expect(sel.end).toBeGreaterThanOrEqual(5);
    ctrl.end();
  });

  // ── Shift-arrow extend (real events) ───────────────────────────────────────
  test('Shift+ArrowRight/Left extends the selection focus by one char', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'abcdef' });
    const ctrl = new V.TextEditController(makeKeyHost(engine));
    try {
      ctrl.begin(layer, 2);
      dispatchKey('ArrowRight', { shiftKey: true });
      dispatchKey('ArrowRight', { shiftKey: true });
      expect(ctrl.getSelection()).toEqual({ start: 2, end: 4 });
      expect(ctrl.hasSelection()).toBe(true);
      dispatchKey('ArrowLeft', { shiftKey: true });
      expect(ctrl.getSelection()).toEqual({ start: 2, end: 3 });
    } finally {
      ctrl.end();
    }
  });

  test('plain ArrowLeft/Right collapses an existing selection to its edge', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'abcdef' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 1);
    ctrl.selectRange(1, 4); // anchor 1, focus 4
    expect(ctrl.hasSelection()).toBe(true);
    ctrl.moveLeft(); // plain → collapse to start
    expect(ctrl.hasSelection()).toBe(false);
    expect(ctrl.getCaretIndex()).toBe(1);
    ctrl.selectRange(1, 4);
    ctrl.moveRight(); // plain → collapse to end
    expect(ctrl.getCaretIndex()).toBe(4);
    expect(ctrl.hasSelection()).toBe(false);
    ctrl.end();
  });

  // ── Editing replaces / deletes the selection ───────────────────────────────
  test('typing a printable char REPLACES the selected range', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'abcdef' });
    const ctrl = new V.TextEditController(makeKeyHost(engine));
    try {
      ctrl.begin(layer, 0);
      ctrl.selectRange(1, 4); // select 'bcd'
      dispatchKey('X');
      expect(layer.params.text).toBe('aXef');
      expect(ctrl.getCaretIndex()).toBe(2);
      expect(ctrl.hasSelection()).toBe(false);
    } finally {
      ctrl.end();
    }
  });

  test('Backspace with a non-empty selection deletes the range', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'abcdef' });
    const ctrl = new V.TextEditController(makeKeyHost(engine));
    try {
      ctrl.begin(layer, 0);
      ctrl.selectRange(1, 4); // 'bcd'
      dispatchKey('Backspace');
      expect(layer.params.text).toBe('aef');
      expect(ctrl.getCaretIndex()).toBe(1);
      expect(ctrl.hasSelection()).toBe(false);
    } finally {
      ctrl.end();
    }
  });

  test('Enter with a non-empty selection replaces it with a newline', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'abcdef' });
    const ctrl = new V.TextEditController(makeKeyHost(engine));
    try {
      ctrl.begin(layer, 0);
      ctrl.selectRange(1, 4);
      dispatchKey('Enter');
      expect(layer.params.text).toBe('a\nef');
      expect(ctrl.hasSelection()).toBe(false);
    } finally {
      ctrl.end();
    }
  });

  // ── Mutation gate ──────────────────────────────────────────────────────────
  test('gated (google-font) layer: selection + nav work, range delete is blocked', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'abcdef', font: 'google:inter' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    expect(ctrl.canMutate(layer)).toBe(false);
    // Selection still works (display-only).
    expect(ctrl.selectWordAt(0)).toBe(true);
    expect(ctrl.hasSelection()).toBe(true);
    // Navigation still works.
    ctrl.selectRange(1, 4);
    // Range delete / replace are BLOCKED.
    expect(ctrl.deleteBackward()).toBe(false);
    expect(ctrl.deleteForward()).toBe(false);
    expect(ctrl.insertText('X')).toBe(false);
    expect(layer.params.text).toBe('abcdef');
    ctrl.end();
  });

  // ── Selection highlight geometry ───────────────────────────────────────────
  test('getSelectionQuads returns one world quad per selected cell', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'abcdef' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    ctrl.selectRange(1, 4); // cells 1,2,3
    const quads = ctrl.getSelectionQuads();
    expect(quads.length).toBe(3);
    for (const q of quads) {
      expect(q.length).toBe(4);
      expect(Number.isFinite(q[0].x)).toBe(true);
    }
    // Collapsed selection → no highlight.
    ctrl.selectRange(2, 2);
    expect(ctrl.getSelectionQuads().length).toBe(0);
    ctrl.end();
  });
});
