/**
 * TUX-030 / TUX-031 wiring: pen-draft context, keyboard parity, commit-on-tool-switch and the
 * shared arrangeSelection verb. The finger-level behaviour lives in tests/e2e/touch/pen.spec.js.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('TUX-030 pen draft controls (wiring)', () => {
  let runtime, window, document, app, CB, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true });
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    SETTINGS = window.Vectura.SETTINGS;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const layers = () => app.engine.layers.length;
  const draft = (n) => {
    app.renderer.penDraft = { anchors: Array.from({ length: n }, (_, i) => ({ x: 10 + i * 40, y: 10 + i * 20, in: null, out: null })), closed: false };
  };
  const key = (type, opts) => window.dispatchEvent(new window.KeyboardEvent(type, Object.assign({ bubbles: true, cancelable: true }, opts)));
  const reset = async () => {
    SETTINGS.contextBarEnabled = true;
    app.ui.setActiveTool('pen');
    app.ui.setPenMode('draw');
    app.renderer.cancelPenPath();
    app.renderer.setSelection([], null);
    await nextFrames();
  };

  test('keyboard Enter / Escape / Backspace still commit, cancel and remove last', async () => {
    await reset();
    const base = layers();
    draft(3);
    key('keydown', { key: 'Backspace' });
    expect(app.renderer.penDraft.anchors.length).toBe(2);
    key('keydown', { key: 'Enter' });
    expect(layers()).toBe(base + 1);
    expect(app.renderer.penDraft).toBeNull();
    draft(3);
    key('keydown', { key: 'Escape' });
    expect(app.renderer.penDraft).toBeNull();
    expect(layers()).toBe(base + 1);
  });

  test('Space-pan during a draft does not commit', async () => {
    await reset();
    const base = layers();
    draft(3);
    key('keydown', { code: 'Space', key: ' ' });
    key('keyup', { code: 'Space', key: ' ' });
    expect(layers()).toBe(base);
  });

  test('a real tool switch commits 2+ anchors, not 1, and a temporary switch never commits', async () => {
    await reset();
    const base = layers();
    draft(1);
    app.ui.setActiveTool('select');
    expect(layers()).toBe(base);
    await reset();
    draft(3);
    app.ui.setActiveTool('hand', { temporary: true });
    expect(layers()).toBe(base);
    await reset();
    draft(2);
    app.ui.setActiveTool('select');
    expect(layers()).toBe(base + 1);
  });

  test('pen-draft context only for a draw-purpose draft in draw mode', async () => {
    await reset();
    expect(CB.getContext().kind).not.toBe('pen-draft');
    draft(1);
    expect(CB.getContext().kind).toBe('pen-draft');
    app.renderer.penPurpose = 'select';
    expect(CB.getContext().kind).not.toBe('pen-draft');
    app.renderer.penPurpose = 'draw';
    app.ui.setPenMode('add');
    expect(CB.getContext().kind).not.toBe('pen-draft');
    app.ui.setPenMode('draw');
    app.renderer.cancelPenPath();
  });

  test('chips drive the renderer verbs; Done is aria-disabled under two anchors', async () => {
    await reset();
    draft(1);
    await nextFrames(120);
    const q = (a) => document.querySelector(`.ctxbar [data-action="${a}"]`);
    expect(q('pen-done').getAttribute('aria-disabled')).toBe('true');
    const base = layers();
    q('pen-done').click();
    expect(layers()).toBe(base);
    draft(3);
    await nextFrames(120);
    expect(q('pen-done').getAttribute('aria-disabled')).toBeNull();
    q('pen-remove-last').click();
    expect(app.renderer.penDraft.anchors.length).toBe(2);
    q('pen-done').click();
    expect(layers()).toBe(base + 1);
    draft(2);
    await nextFrames(120);
    q('pen-cancel').click();
    expect(app.renderer.penDraft).toBeNull();
  });

  test('shouldShow bypasses contextBarEnabled for a draft only on a coarse pointer', async () => {
    await reset();
    SETTINGS.contextBarEnabled = false;
    draft(2);
    const bar = () => document.querySelector('#viewport-container .ctxbar');
    const orig = window.matchMedia;
    window.matchMedia = (q) => ({ matches: /pointer:\s*coarse/.test(q), addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    CB._refresh();
    expect(bar().classList.contains('is-visible')).toBe(true);
    window.matchMedia = (q) => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    CB._refresh();
    expect(bar().classList.contains('is-visible')).toBe(false);
    window.matchMedia = orig;
    SETTINGS.contextBarEnabled = true;
    app.renderer.cancelPenPath();
  });

  test('arrangeSelection is the one verb behind the shortcut and the menu', async () => {
    await reset();
    app.renderer.setTool('select');
    const a = app.engine.addLayer('spiral'); app.engine.addLayer('flowfield');
    app.renderer.setSelection([a], a);
    const spy = vi.spyOn(app.ui, 'arrangeSelection');
    key('keydown', { key: ']', metaKey: true, shiftKey: true });
    expect(spy).toHaveBeenCalledWith('top');
    expect(app.engine.layers[app.engine.layers.length - 1].id).toBe(a);
    key('keydown', { key: '[', metaKey: true });
    expect(spy).toHaveBeenCalledWith('backward');
    document.getElementById('btn-object-send-to-back').click();
    expect(spy).toHaveBeenCalledWith('bottom');
    expect(app.engine.layers[0].id).toBe(a);
    spy.mockRestore();
    await nextFrames(150); // let the scrollLayerToTop rAF settle before teardown
  });
});
