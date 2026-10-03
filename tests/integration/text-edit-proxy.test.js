/*
 * TUX-028: soft-keyboard proxy + the shared replaceRange mutation path.
 * Drives the controller directly with a fake host and the jsdom document.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TextEditController proxy (TUX-028)', () => {
  let runtime, V, win, doc;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    win = runtime.window;
    doc = runtime.document;
  });
  afterEach(() => runtime.cleanup());

  const setup = (text = '', hostOver = {}, extra = {}) => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text, font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    const host = {
      regen: (l) => { if (l) engine.generate(l.id); },
      pushHistory: vi.fn(),
      requestDraw: vi.fn(),
      refreshPanel: vi.fn(),
      ...hostOver,
    };
    const ctrl = new V.TextEditController(host);
    return { engine, layer, host, ctrl };
  };
  const press = (type) => {
    const ev = new win.Event('pointerdown', { bubbles: true });
    Object.defineProperty(ev, 'pointerType', { value: type });
    doc.body.dispatchEvent(ev);
  };
  const proxyEl = () => doc.querySelector('[data-text-proxy]');
  const fireInput = (ta, value, caret = value.length) => {
    ta.value = value;
    ta.setSelectionRange(caret, caret);
    ta.dispatchEvent(new win.Event('input', { bubbles: true }));
  };

  it('replaceRange inserts, deletes, replaces a selection and pushes history once per run', () => {
    const { layer, host, ctrl } = setup('abc');
    ctrl.begin(layer, 3);
    expect(ctrl.replaceRange(3, 3, 'd')).toBe(true);
    expect(layer.params.text).toBe('abcd');
    expect(ctrl.getCaretIndex()).toBe(4);
    expect(ctrl.replaceRange(0, 1, '')).toBe(true);
    expect(layer.params.text).toBe('bcd');
    expect(ctrl.replaceRange(1, 3, 'XY')).toBe(true);
    expect(layer.params.text).toBe('bXY');
    expect(ctrl.getCaretIndex()).toBe(3);
    expect(host.pushHistory).toHaveBeenCalledTimes(1);
    expect(ctrl.replaceRange(1, 1, '')).toBe(false);
    ctrl.end();
  });

  it('replaceRange is rejected on a gated layer', () => {
    const { layer, ctrl } = setup('abc', {}, { font: 'sans', textMode: 'point', hyphenate: true, wrapWidth: 50 });
    ctrl.begin(layer, 3);
    expect(ctrl.replaceRange(0, 0, 'Z')).toBe(false);
    expect(layer.params.text).toBe('abc');
    ctrl.end();
  });

  it('a mouse session never creates or focuses the proxy', () => {
    const { layer, ctrl } = setup('abc');
    press('mouse');
    ctrl.begin(layer, 1);
    expect(proxyEl()).toBeNull();
    ctrl.end();
  });

  it('a touch session mirrors text/selection and diffs input through replaceRange', () => {
    const { layer, ctrl } = setup('teh');
    press('touch');
    ctrl.begin(layer, 3);
    const ta = proxyEl();
    expect(ta).toBeTruthy();
    expect(ta.value).toBe('teh');
    expect([ta.selectionStart, ta.selectionEnd]).toEqual([3, 3]);
    expect(doc.activeElement).toBe(ta);
    // insertReplacementText: whole word swapped
    fireInput(ta, 'the');
    expect(layer.params.text).toBe('the');
    // deleteContentBackward
    fireInput(ta, 'th', 2);
    expect(layer.params.text).toBe('th');
    expect(ctrl.getCaretIndex()).toBe(2);
    // repeated characters diff at the caret
    fireInput(ta, 'tth', 1);
    expect(layer.params.text).toBe('tth');
    expect(ctrl.getCaretIndex()).toBe(1);
    ctrl.end();
  });

  it('rejected input resyncs the proxy from the layer text', () => {
    const { layer, ctrl } = setup('abc', {}, { font: 'sans', hyphenate: true, wrapWidth: 50 });
    press('touch');
    ctrl.begin(layer, 3);
    const ta = proxyEl();
    fireInput(ta, 'abcQ');
    expect(layer.params.text).toBe('abc');
    expect(ta.value).toBe('abc');
    ctrl.end();
  });

  it('end() blurs the proxy and removes the vectura:kbinset listener', () => {
    const added = [];
    const removed = [];
    const origAdd = doc.addEventListener.bind(doc);
    const origRemove = doc.removeEventListener.bind(doc);
    doc.addEventListener = (t, f, o) => { if (t === 'vectura:kbinset') added.push(f); return origAdd(t, f, o); };
    doc.removeEventListener = (t, f, o) => { if (t === 'vectura:kbinset') removed.push(f); return origRemove(t, f, o); };
    const { layer, ctrl } = setup('abc');
    press('pen');
    ctrl.begin(layer, 1);
    expect(added).toHaveLength(1);
    ctrl.end();
    expect(doc.activeElement).not.toBe(proxyEl());
    expect(removed).toEqual(added);
    expect(proxyEl().value).toBe('');
    ctrl.end(); // idempotent
  });

  it('pans the canvas up when the keyboard covers the caret, and not when visible', () => {
    // Inset comes from Vectura.KeyboardInset (single visualViewport reader, TUX-032).
    const ki = { inset: 0 };
    V.KeyboardInset = ki;
    Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });
    const panCanvasBy = vi.fn();
    const caret = { x: 100, top: 600, bottom: 640, rect: { left: 0, top: 0, right: 800, bottom: 800 } };
    const { layer, ctrl } = setup('abc', { panCanvasBy, getCaretClientPoint: () => caret });
    press('touch');
    ctrl.begin(layer, 1);
    expect(panCanvasBy).not.toHaveBeenCalled();
    ki.inset = 400; // keyboard opens
    doc.dispatchEvent(new win.CustomEvent('vectura:kbinset', { detail: { inset: 400 } }));
    expect(panCanvasBy).toHaveBeenCalledTimes(1);
    const [dx, dy] = panCanvasBy.mock.calls[0];
    expect(dx).toBe(0);
    expect(dy).toBeLessThan(0);
    expect(dy).toBe(-(640 - (400 - 24)));
    caret.bottom = 200;
    doc.dispatchEvent(new win.CustomEvent('vectura:kbinset', { detail: { inset: 400 } }));
    expect(panCanvasBy).toHaveBeenCalledTimes(1);
    ctrl.end();
  });

  it('forwards app chords (not A/C/V/X) from the proxy to host.handleShortcut', () => {
    const handleShortcut = vi.fn((e) => e.key === 's');
    const { layer, ctrl } = setup('abc', { handleShortcut });
    press('touch');
    ctrl.begin(layer, 1);
    const ta = proxyEl();
    const mk = (key) => {
      const ev = new win.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
      ta.dispatchEvent(ev);
      return ev;
    };
    const s = mk('s');
    expect(handleShortcut).toHaveBeenCalledTimes(1);
    expect(s.defaultPrevented).toBe(true);
    const o = mk('q'); // host declines: native behaviour stays
    expect(o.defaultPrevented).toBe(false);
    handleShortcut.mockClear();
    ['a', 'c', 'v', 'x'].forEach(mk);
    expect(handleShortcut).not.toHaveBeenCalled();
    ctrl.end();
  });
});
