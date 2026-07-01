/*
 * M3 — On-canvas keystroke editing (RGR).
 *
 * Drives Vectura.TextEditController mutation/navigation methods (and the
 * handleKey dispatcher) against a real VectorEngine. Each mutation rewrites
 * layer.params.text at the caret, re-runs generate(), and re-derives the caret
 * from the NEW world-space glyphs.
 *
 * Binding entry conditions verified here:
 *   - printable insert / Backspace / Delete / arrows / Home / End / Enter;
 *   - Up/Down move to the adjacent line at the nearest x;
 *   - mutation gate: a ligature (google) / soft-wrap layer blocks insert+delete
 *     but still allows caret navigation;
 *   - a contiguous typing run coalesces into ONE undo (pushHistory) step.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Type tool keystroke editing (M3)', () => {
  let runtime, V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  const makeTextLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: '', font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    return { id, layer };
  };

  const makeHost = (engine, over = {}) => ({
    bindKeys: false,
    regen: (layer) => engine.generate(layer.id),
    pushHistory: vi.fn(),
    ...over,
  });

  const caretLineOf = (layer, idx) => {
    const glyphs = layer.glyphs || [];
    const at = glyphs.find((g) => g.sourceIndex === idx);
    if (at) return at.lineIndex;
    const before = glyphs.find((g) => g.sourceIndex === idx - 1);
    return before ? before.lineIndex : 0;
  };

  test('typing "Hi" into a fresh caret writes params.text and leaves the caret after "i"', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: '' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    expect(ctrl.insertText('H')).toBe(true);
    expect(ctrl.insertText('i')).toBe(true);
    expect(layer.params.text).toBe('Hi');
    expect(ctrl.getCaretIndex()).toBe(2);
    expect(layer.glyphs.length).toBe(2);
    ctrl.end();
  });

  test('handleKey routes printable keys, Backspace, arrows and Enter', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: '' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    const key = (k) => ctrl.handleKey({ key: k, preventDefault() {}, stopPropagation() {} });
    expect(key('H')).toBe(true);
    expect(key('i')).toBe(true);
    expect(layer.params.text).toBe('Hi');
    expect(key('Backspace')).toBe(true);
    expect(layer.params.text).toBe('H');
    expect(ctrl.getCaretIndex()).toBe(1);
    ctrl.end();
  });

  test('Backspace removes the preceding char; Delete removes the following char', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'Hi' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 2);
    expect(ctrl.deleteBackward()).toBe(true);
    expect(layer.params.text).toBe('H');
    expect(ctrl.getCaretIndex()).toBe(1);
    // Now caret at 1 (end); deleteForward is a no-op at end of string.
    ctrl.deleteForward();
    expect(layer.params.text).toBe('H');
    // From caret 0, Delete removes the following char.
    ctrl.moveLineStart();
    expect(ctrl.getCaretIndex()).toBe(0);
    expect(ctrl.deleteForward()).toBe(true);
    expect(layer.params.text).toBe('');
    ctrl.end();
  });

  test('Left/Right move the caret one char (clamped at the ends)', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'Hi' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 1);
    ctrl.moveRight();
    expect(ctrl.getCaretIndex()).toBe(2);
    ctrl.moveRight(); // clamp at end
    expect(ctrl.getCaretIndex()).toBe(2);
    ctrl.moveLeft(); ctrl.moveLeft();
    expect(ctrl.getCaretIndex()).toBe(0);
    ctrl.moveLeft(); // clamp at start
    expect(ctrl.getCaretIndex()).toBe(0);
    ctrl.end();
  });

  test('Enter inserts a newline at the caret', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'AB' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 1);
    expect(ctrl.insertNewline()).toBe(true);
    expect(layer.params.text).toBe('A\nB');
    expect(ctrl.getCaretIndex()).toBe(2);
    // The char now after the caret ('B') is on line 1.
    expect(caretLineOf(layer, 2)).toBe(1);
    ctrl.end();
  });

  test('Up/Down move the caret to the adjacent line at the nearest x', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'AB\nCD' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 1); // after 'A', line 0
    expect(caretLineOf(layer, ctrl.getCaretIndex())).toBe(0);
    expect(ctrl.moveDown()).toBe(true);
    expect(caretLineOf(layer, ctrl.getCaretIndex())).toBe(1);
    expect(ctrl.moveUp()).toBe(true);
    expect(caretLineOf(layer, ctrl.getCaretIndex())).toBe(0);
    ctrl.end();
  });

  test('Home/End jump to the start/end of the current line', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'AB\nCD' });
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 4); // between C and D on line 1
    ctrl.moveLineStart();
    expect(ctrl.getCaretIndex()).toBe(3); // start of 'CD'
    ctrl.moveLineEnd();
    expect(ctrl.getCaretIndex()).toBe(5); // end of 'CD'
    ctrl.end();
  });

  test('a contiguous typing run coalesces into ONE undo (pushHistory) step', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: '' });
    const pushHistory = vi.fn();
    const ctrl = new V.TextEditController(makeHost(engine, { pushHistory }));
    ctrl.begin(layer, 0);
    ctrl.insertText('H');
    ctrl.insertText('i');
    ctrl.insertText('!');
    expect(pushHistory).toHaveBeenCalledTimes(1);
    // A caret move breaks the run; the next typing burst is a fresh undo step.
    ctrl.moveLeft();
    ctrl.insertText('?');
    expect(pushHistory).toHaveBeenCalledTimes(2);
    ctrl.end();
  });

  test('mutation gate: a soft-wrap layer blocks insert/delete but allows caret nav', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'AB', hyphenate: true, wrapWidth: 100 });
    const ctrl = new V.TextEditController(makeHost(engine));
    expect(ctrl.canMutate(layer)).toBe(false);
    ctrl.begin(layer, 1);
    expect(ctrl.insertText('X')).toBe(false);
    expect(layer.params.text).toBe('AB'); // unchanged
    expect(ctrl.deleteBackward()).toBe(false);
    expect(layer.params.text).toBe('AB');
    // Navigation is still permitted.
    expect(ctrl.moveRight()).toBe(true);
    expect(ctrl.getCaretIndex()).toBe(2);
    ctrl.end();
  });

  test('mutation gate: a google (shaped) font layer cannot mutate', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'AB', font: 'google:inter' });
    const ctrl = new V.TextEditController(makeHost(engine));
    expect(ctrl.canMutate(layer)).toBe(false);
  });

  // BUG 2b: a brand-new empty box drew NO caret because caretIndexToWorldSegment
  // returns null for empty glyphs — the user saw "nothing happens" on click.
  test('empty box: getCaretSegment falls back to a caret at the layer origin', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: '', posX: 20, posY: -15, fontSize: 40 });
    expect(layer.glyphs.length).toBe(0); // nothing typed yet
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 0);
    const seg = ctrl.getCaretSegment();
    expect(seg).not.toBeNull();
    // Vertical bar near the point-type origin (layer.origin + posX/posY), cap-tall.
    const cx = layer.origin.x + 20;
    const cy = layer.origin.y - 15;
    expect(seg.x0).toBeCloseTo(cx, 6);
    expect(seg.x1).toBeCloseTo(cx, 6);
    expect(Math.abs(seg.y1 - seg.y0)).toBeCloseTo(40, 6); // ~cap-height tall
    expect((seg.y0 + seg.y1) / 2).toBeCloseTo(cy, 6);
    // After typing, the caret comes from real glyphs (no longer the fallback).
    expect(ctrl.insertText('A')).toBe(true);
    const seg2 = ctrl.getCaretSegment();
    expect(seg2).not.toBeNull();
    expect(Number.isFinite(seg2.x0)).toBe(true);
    ctrl.end();
  });

  test('blinking timer is cleared on end() (no leaked interval)', () => {
    vi.useFakeTimers();
    try {
      const engine = new V.VectorEngine();
      const { layer } = makeTextLayer(engine, { text: 'Hi' });
      const requestDraw = vi.fn();
      const ctrl = new V.TextEditController(makeHost(engine, { requestDraw }));
      ctrl.begin(layer, 0);
      vi.advanceTimersByTime(2000);
      const blinks = requestDraw.mock.calls.length;
      expect(blinks).toBeGreaterThan(0);
      ctrl.end();
      requestDraw.mockClear();
      vi.advanceTimersByTime(2000);
      expect(requestDraw).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
