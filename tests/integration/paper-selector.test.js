/*
 * Paper selector — full-stack behaviour: default-paper preference + legacy
 * migration, per-project round-trip/undo/theme sync, the Paper panel, and the
 * renderer hooks (incl. the physical-mm texture scale). One file on purpose:
 * the shard-weights roster tolerates only a handful of unweighted new files.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// ---- from the former paper-preference-migration.test.js ----
{
/*
 * Paper selector — the user's default paper as a preference.
 *
 * Migration decision (documented in plans.md → Decisions): a preference
 * snapshot from a pre-paper build has no `paperDefault`, but every snapshot
 * carries `bgColor` (theme toggles write it too). Only a saved bgColor that
 * DIFFERS from that snapshot theme's document colour was a deliberate choice,
 * so only that becomes the default paper. A theme-matching colour leaves the
 * default unset, so theme toggles keep recolouring the sheet as before.
 */

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('paper default preference + legacy bgColor migration', () => {
  let runtime;
  let window;
  let app;
  let S;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    S = window.Vectura.SETTINGS;
  });

  afterAll(() => runtime?.cleanup?.());

  beforeEach(() => {
    S.paperDefault = null;
    window.localStorage.removeItem('vectura.paperDefault');
  });

  test('legacy snapshot with a custom bgColor migrates to a plain default paper', () => {
    app.applyPreferenceSnapshot({ uiTheme: 'dark', bgColor: '#336699' });
    expect(S.paperDefault).toEqual({ type: 'none', color: '#336699', texture: 0.6, bleed: 0.5, seed: 1 });
  });

  test('legacy snapshot whose bgColor is just the theme colour sets no default (theme sync preserved)', () => {
    app.applyPreferenceSnapshot({ uiTheme: 'dark', bgColor: '#121214' });
    expect(S.paperDefault).toBeNull();
    app.applyPreferenceSnapshot({ uiTheme: 'lark', bgColor: '#FFFFFF' });
    expect(S.paperDefault).toBeNull();
  });

  test('a tampered legacy bgColor is rejected and does not become a default', () => {
    app.applyPreferenceSnapshot({ uiTheme: 'dark', bgColor: 'red; background:url(x)' });
    expect(S.paperDefault).toBeNull();
  });

  test('a snapshot with paperDefault wins over its bgColor and is normalized', () => {
    app.applyPreferenceSnapshot({ uiTheme: 'dark', bgColor: '#336699', paperDefault: { type: 'kraft', color: 'nope', texture: 9 } });
    expect(S.paperDefault).toEqual({ type: 'kraft', color: window.Vectura.PAPERS.TYPES.kraft.color, texture: 1, bleed: 0.5, seed: 1 });
    app.applyPreferenceSnapshot({ uiTheme: 'dark', bgColor: '#336699', paperDefault: null });
    expect(S.paperDefault).toBeNull();
  });

  test('getPreferenceSnapshot carries paperDefault (and keeps bgColor for old builds)', () => {
    app.setPaperDefault({ type: 'rough', color: '#f5f0e2', texture: 0.8, bleed: 0.4, seed: 3 });
    const snap = app.getPreferenceSnapshot();
    expect(snap.paperDefault).toEqual({ type: 'rough', color: '#f5f0e2', texture: 0.8, bleed: 0.4, seed: 3 });
    expect(typeof snap.bgColor).toBe('string');
  });

  test('setPaperDefault stores the default in its own key, independent of cookie consent', () => {
    S.cookiePreferencesEnabled = false;
    app.setPaperDefault({ type: 'hot-press' });
    const raw = JSON.parse(window.localStorage.getItem('vectura.paperDefault'));
    expect(raw.type).toBe('hot-press');
    expect(window.Vectura.Paper.loadDefault()).toEqual(S.paperDefault);
    app.setPaperDefault(null);
    expect(window.localStorage.getItem('vectura.paperDefault')).toBe('null');
    expect(window.Vectura.Paper.loadDefault()).toBeNull();
  });

  test('a fresh app boots its document on the stored default paper', () => {
    window.Vectura.Paper.saveDefault({ type: 'cotton-rag', color: '#f4efe2', texture: 0.5, bleed: 0.5, seed: 2 });
    const fresh = new window.Vectura.App();
    expect(S.paperDefault).toMatchObject({ type: 'cotton-rag' });
    expect(S.paper).toMatchObject({ type: 'cotton-rag', color: '#f4efe2', texture: 0.5 });
    expect(S.bgColor).toBe('#f4efe2');
    expect(fresh).toBeTruthy();
  });

  test("a new document never inherits the last project's paper colour (only the default or the theme)", () => {
    S.cookiePreferencesEnabled = true;
    app.setPaperDefault(null);
    app.setProjectPaper({ type: 'none', color: '#ff00aa' }, { history: false });
    app.persistPreferences({ force: true });
    const fresh = new window.Vectura.App();
    expect(fresh).toBeTruthy();
    const themeBg = window.Vectura.THEMES[S.uiTheme].documentBg;
    expect(S.paper).toMatchObject({ type: 'none', color: themeBg });
    expect(S.bgColor).toBe(themeBg);
    S.cookiePreferencesEnabled = false;
  });

  test('clearing saved preferences clears the stored default paper', () => {
    app.setPaperDefault({ type: 'kraft' });
    app.clearSavedPreferences();
    expect(S.paperDefault).toBeNull();
    expect(window.localStorage.getItem('vectura.paperDefault')).toBeNull();
    expect(S.paper.type).toBe('none');
  });
});
}

// ---- from the former paper-state-roundtrip.test.js ----
{
/*
 * Paper selector — paper is saved per project (captureState/applyState feed
 * both .vectura files and undo snapshots) and the theme-sync rule.
 */

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('paper state round-trip, undo and theme sync', () => {
  let runtime;
  let window;
  let app;
  let S;
  let Paper;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    S = window.Vectura.SETTINGS;
    Paper = window.Vectura.Paper;
  });

  afterAll(() => runtime?.cleanup?.());

  beforeEach(() => {
    S.paperDefault = null;
  });

  test('captureState saves the project paper (and its bgColor mirror)', () => {
    app.setProjectPaper({ type: 'cold-press', color: '#f7f2e6', texture: 0.4, bleed: 0.3, seed: 5 }, { history: false });
    const state = app.captureState();
    expect(state.settings.paper).toEqual({ type: 'cold-press', color: '#f7f2e6', texture: 0.4, bleed: 0.3, seed: 5 });
    expect(state.settings.bgColor).toBe('#f7f2e6');
    // JSON round-trip (what saveVecturaFile writes) restores it exactly.
    const reopened = JSON.parse(JSON.stringify(state));
    app.setProjectPaper({ type: 'kraft' }, { history: false });
    app.applyState(reopened);
    expect(S.paper).toEqual({ type: 'cold-press', color: '#f7f2e6', texture: 0.4, bleed: 0.3, seed: 5 });
    expect(S.bgColor).toBe('#f7f2e6');
  });

  test('a legacy file without paper opens as a plain sheet in its bgColor, even with a user default', () => {
    S.paperDefault = Paper.normalize({ type: 'kraft' });
    const legacy = app.captureState();
    delete legacy.settings.paper;
    legacy.settings.bgColor = '#ddeeff';
    app.applyState(legacy);
    expect(S.paper).toMatchObject({ type: 'none', color: '#ddeeff' });
    expect(S.bgColor).toBe('#ddeeff');
  });

  test('a hostile paper colour in a file is rejected', () => {
    const state = app.captureState();
    state.settings.paper = { type: 'rough', color: '"><img onerror=alert(1)>' };
    state.settings.bgColor = '#010203';
    app.applyState(state);
    expect(S.paper.color).toBe('#010203');
  });

  test('undo restores the previous paper; redo re-applies it', () => {
    app.setProjectPaper({ type: 'hot-press' }, { history: false });
    app.pushHistory();
    app.setProjectPaper(Paper.forType('newsprint'), { history: true });
    expect(S.paper.type).toBe('newsprint');
    app.undo();
    expect(S.paper.type).toBe('hot-press');
    expect(S.bgColor).toBe(window.Vectura.PAPERS.TYPES['hot-press'].color);
    app.redo();
    expect(S.paper.type).toBe('newsprint');
  });

  test('theme toggle recolours a plain sheet when no default is set', () => {
    app.setProjectPaper({ type: 'none', color: '#121214' }, { history: false });
    app.applyTheme('lark', { persist: false, syncDocumentBg: true, refreshUi: false, render: false });
    expect(S.paper).toMatchObject({ type: 'none', color: '#ffffff' });
    expect(S.bgColor).toBe('#ffffff');
    app.applyTheme('dark', { persist: false, syncDocumentBg: true, refreshUi: false, render: false });
    expect(S.bgColor).toBe('#121214');
  });

  test('theme toggle never overwrites a textured paper or a user default', () => {
    app.setProjectPaper(Paper.forType('kraft'), { history: false });
    app.applyTheme('lark', { persist: false, syncDocumentBg: true, refreshUi: false, render: false });
    expect(S.paper.type).toBe('kraft');
    expect(S.bgColor).toBe(window.Vectura.PAPERS.TYPES.kraft.color);

    app.setProjectPaper({ type: 'none', color: '#336699' }, { history: false });
    S.paperDefault = Paper.fromLegacyBg('#336699');
    app.applyTheme('dark', { persist: false, syncDocumentBg: true, refreshUi: false, render: false });
    expect(S.bgColor).toBe('#336699');
  });

  test('theme toggle never overwrites a custom plain colour (no default set)', () => {
    S.paperDefault = null;
    app.applyTheme('dark', { persist: false, syncDocumentBg: true, refreshUi: false, render: false });
    app.setProjectPaper({ type: 'none', color: '#ff0000' }, { history: false });
    const before = app.history.length;
    app.applyTheme('lark', { persist: false, syncDocumentBg: true, refreshUi: false, render: false });
    expect(S.paper).toMatchObject({ type: 'none', color: '#ff0000' });
    expect(S.bgColor).toBe('#ff0000');
    expect(app.history.length).toBe(before);
  });

  // WCAG contrast of two hex colours.
  const contrast = (a, b) => {
    const la = Paper.luminance(a); const lb = Paper.luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const pen1 = () => S.pens.find((p) => p.id === 'pen-1');

  test('theme toggle keeps an untouched Pen 1 legible on the PAPER (black stock + light theme)', () => {
    S.paperDefault = null;
    app.applyTheme('dark', { persist: false, syncPen1: true, syncDocumentBg: true, refreshUi: false, render: false });
    app.setProjectPaper(Paper.forType('black'), { history: false });
    ['lark', 'light', 'dark', 'lark'].forEach((t) => {
      app.applyTheme(t, { persist: false, syncPen1: true, syncDocumentBg: true, refreshUi: false, render: false });
      expect(contrast(pen1().color, S.bgColor), `${t}: ${pen1().color} on ${S.bgColor}`).toBeGreaterThanOrEqual(3);
    });
  });

  test('a pen the user customised is never recoloured by a theme toggle or a paper pick', () => {
    app.applyTheme('dark', { persist: false, syncPen1: true, syncDocumentBg: true, refreshUi: false, render: false });
    pen1().color = '#f4f1e8';
    app.setProjectPaper(Paper.forType('hot-press'), { history: true });
    expect(pen1().color).toBe('#f4f1e8');
    app.applyTheme('light', { persist: false, syncPen1: true, syncDocumentBg: true, refreshUi: false, render: false });
    expect(pen1().color).toBe('#f4f1e8');
  });

  test('picking light stock under the dark theme makes an untouched Pen 1 dark, in the SAME undo step', () => {
    app.applyTheme('dark', { persist: false, syncPen1: true, syncDocumentBg: true, refreshUi: false, render: false });
    app.setProjectPaper({ type: 'none', color: '#121214' }, { history: false });
    pen1().color = '#e6f1ff';
    const layer = app.engine.layers[0];
    if (layer) { layer.penId = 'pen-1'; layer.color = '#e6f1ff'; }
    const before = app.history.length;
    app.setProjectPaper(Paper.forType('hot-press'), { history: true });
    expect(app.history.length).toBe(before + 1);
    expect(contrast(pen1().color, S.bgColor)).toBeGreaterThanOrEqual(3);
    if (layer) expect(layer.color).toBe(pen1().color);
    app.undo();
    expect(S.paper.type).toBe('none');
    expect(pen1().color).toBe('#e6f1ff');
  });

  test('a paper type from a newer build round-trips unchanged and renders as a plain sheet', () => {
    const state = app.captureState();
    state.settings.paper = { type: 'washi-2030', color: '#f0ece0', texture: 0.4, bleed: 0.2, seed: 3 };
    app.applyState(JSON.parse(JSON.stringify(state)));
    expect(S.paper.type).toBe('washi-2030');
    expect(Paper.isRealistic(S.paper)).toBe(false);
    expect(app.captureState().settings.paper).toMatchObject({ type: 'washi-2030', color: '#f0ece0' });
  });
});
}

// ---- from the former paper-panel.test.js ----
{
/*
 * Paper selector — the Paper section of the right pane's Pen / Paper tab.
 */

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

describe('Paper panel (Pen / Paper tab)', () => {
  let runtime;
  let window;
  let document;
  let app;
  let S;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    S = window.Vectura.SETTINGS;
  });

  afterAll(() => runtime?.cleanup?.());

  const swatch = (type) => document.querySelector(`.paper-swatch[data-paper-type="${type}"]`);

  test('renders one ≥44px radio swatch per paper type, with the active type checked', () => {
    const grid = document.querySelector('#paper-section-body .paper-swatch-grid');
    expect(grid.getAttribute('role')).toBe('radiogroup');
    const types = Array.from(grid.querySelectorAll('.paper-swatch')).map((b) => b.dataset.paperType);
    expect(types).toEqual(window.Vectura.PAPERS.ORDER);
    expect(swatch(S.paper.type).getAttribute('aria-checked')).toBe('true');
    expect(swatch('none').getAttribute('role')).toBe('radio');
  });

  test('picking a type sets type + stock colour, renders, and pushes exactly one history entry', () => {
    const before = app.history.length;
    swatch('cold-press').click();
    expect(S.paper.type).toBe('cold-press');
    expect(S.paper.color).toBe(window.Vectura.PAPERS.TYPES['cold-press'].color);
    expect(S.bgColor).toBe(S.paper.color);
    expect(app.history.length).toBe(before + 1);
    expect(swatch('cold-press').getAttribute('aria-checked')).toBe('true');
    expect(document.getElementById('paper-texture').disabled).toBe(false);
    // Re-picking the active type is a no-op (no extra undo step).
    swatch('cold-press').click();
    expect(app.history.length).toBe(before + 1);
  });

  test('any colour can be chosen; editing colour keeps the type; one undo step per picker session', () => {
    const before = app.history.length;
    const input = document.getElementById('inp-paper-color');
    input.value = '#ff00aa';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.value = '#ee00bb';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(S.paper).toMatchObject({ type: 'cold-press', color: '#ee00bb' });
    expect(app.history.length).toBe(before + 1);
    expect(document.getElementById('paper-color-pill').textContent).toBe('#EE00BB');
  });

  test('texture and bleed sliders write 0..1 with one undo step per drag', () => {
    const before = app.history.length;
    const tex = document.getElementById('paper-texture');
    tex.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    tex.value = '25';
    tex.dispatchEvent(new window.Event('input', { bubbles: true }));
    tex.value = '30';
    tex.dispatchEvent(new window.Event('input', { bubbles: true }));
    tex.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(S.paper.texture).toBeCloseTo(0.3, 5);
    expect(document.getElementById('paper-texture-value').textContent).toBe('30%');
    const bleed = document.getElementById('paper-bleed');
    bleed.value = '80';
    bleed.dispatchEvent(new window.Event('input', { bubbles: true }));
    bleed.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(S.paper.bleed).toBeCloseTo(0.8, 5);
    expect(app.history.length).toBe(before + 2);
  });

  test("'none' disables the texture/bleed sliders", () => {
    swatch('none').click();
    expect(S.paper.type).toBe('none');
    expect(document.getElementById('paper-texture').disabled).toBe(true);
    expect(document.getElementById('paper-bleed').disabled).toBe(true);
    swatch('kraft').click();
  });

  test('Set as default writes the preference (no undo step) and shows the Default badge', () => {
    const before = app.history.length;
    const badge = document.getElementById('paper-default-badge');
    expect(badge.hidden).toBe(true);
    document.getElementById('btn-paper-set-default').click();
    expect(S.paperDefault).toEqual(window.Vectura.Paper.effective());
    expect(app.history.length).toBe(before);
    expect(badge.hidden).toBe(false);
    expect(document.getElementById('set-default-paper-type').value).toBe('kraft');
  });

  test('Use default applies the default to the project with one undo step', () => {
    swatch('tracing').click();
    expect(document.getElementById('paper-default-badge').hidden).toBe(true);
    const before = app.history.length;
    document.getElementById('btn-paper-reset-default').click();
    expect(S.paper.type).toBe('kraft');
    expect(app.history.length).toBe(before + 1);
    expect(document.getElementById('paper-default-badge').hidden).toBe(false);
  });

  test('Tab / no-op keys on a slider and an opened-then-cancelled colour picker push no undo step', () => {
    const before = app.history.length;
    const tex = document.getElementById('paper-texture');
    tex.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    tex.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    tex.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Same value "input" (e.g. a click on the thumb) changes nothing.
    tex.value = String(Math.round(S.paper.texture * 100));
    tex.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('paper-color-pill').click();
    expect(app.history.length).toBe(before);
    // A real change still records exactly one step.
    tex.value = String(Math.round(S.paper.texture * 100) === 50 ? 60 : 50);
    tex.dispatchEvent(new window.Event('input', { bubbles: true }));
    tex.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(app.history.length).toBe(before + 1);
  });

  test('"Use default" is disabled when no default paper exists', () => {
    app.setPaperDefault(null);
    expect(document.getElementById('btn-paper-reset-default').disabled).toBe(true);
    app.setProjectPaper(window.Vectura.Paper.forType('kraft'), { history: false });
    app.setPaperDefault(window.Vectura.Paper.effective());
    expect(document.getElementById('btn-paper-reset-default').disabled).toBe(true); // project already on it
    swatch('rough').click();
    expect(document.getElementById('btn-paper-reset-default').disabled).toBe(false);
    app.undo();
  });

  test('undo of a paper change refreshes the panel', () => {
    swatch('rough').click();
    app.undo();
    expect(S.paper.type).toBe('kraft');
    expect(swatch('kraft').getAttribute('aria-checked')).toBe('true');
  });
});
}

// ---- from the former renderer-paper.test.js ----
{
/*
 * Paper selector — renderer hooks (src/render/renderer.js drawPaper /
 * drawPaperTexture / _paperInkPlan / _renderPaperInk / _compositePaperInk).
 *
 *  - 'none' paints exactly the legacy sheet and draws ink straight onto the
 *    main context (no ink canvas): visual baselines cannot move.
 *  - a realistic paper renders ink once into an offscreen ink canvas and
 *    composites it with the paper's ink blend.
 *  - texture is mapped in real document millimetres: same physical grain on
 *    A6 and A1, isotropic (never stretched to the sheet aspect), independent
 *    of the paper size at a given zoom.
 *  - the tile cache hits on repeat and misses on a new key.
 */

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };

// Minimal DOMMatrix for jsdom (2D affine only: a b c d e f).
class Mat {
  constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) { Object.assign(this, { a, b, c, d, e, f }); }
  multiply(m) {
    return new Mat(
      this.a * m.a + this.c * m.b, this.b * m.a + this.d * m.b,
      this.a * m.c + this.c * m.d, this.b * m.c + this.d * m.d,
      this.a * m.e + this.c * m.f + this.e, this.b * m.e + this.d * m.f + this.f,
    );
  }
  translate(x, y) { return this.multiply(new Mat(1, 0, 0, 1, x, y)); }
  scale(sx, sy = sx) { return this.multiply(new Mat(sx, 0, 0, sy, 0, 0)); }
}

// A recording 2D context whose transform tracks translate/scale/setTransform.
const recordingCtx = (canvas) => {
  const calls = [];
  let m = new Mat();
  const stack = [];
  const state = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', shadowBlur: 0, filter: 'none' };
  const snap = () => ({ ...state });
  const ctx = {
    canvas,
    calls,
    getTransform: () => new Mat(m.a, m.b, m.c, m.d, m.e, m.f),
    setTransform: (a, b, c, d, e, f) => { m = typeof a === 'object' ? new Mat(a.a, a.b, a.c, a.d, a.e, a.f) : new Mat(a, b, c, d, e, f); },
    resetTransform: () => { m = new Mat(); },
    translate: (x, y) => { m = m.translate(x, y); },
    scale: (x, y) => { m = m.scale(x, y); },
    rotate: () => {},
    save: () => stack.push({ m, s: snap() }),
    restore: () => { const top = stack.pop(); if (top) { m = top.m; Object.assign(state, top.s); } },
    createPattern: (image) => {
      const pattern = { image, matrix: null, setTransform(mm) { this.matrix = mm; } };
      calls.push({ op: 'createPattern', image, pattern });
      return pattern;
    },
    fillRect: (...args) => calls.push({ op: 'fillRect', args, ...snap() }),
    drawImage: (image, ...args) => calls.push({ op: 'drawImage', image, args, ...snap() }),
    stroke: () => calls.push({ op: 'stroke', ...snap() }),
    measureText: (t = '') => ({ width: String(t).length * 7 }),
    getLineDash: () => [],
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  return new Proxy(ctx, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in state) return state[key];
      return () => {};
    },
    set(target, key, value) {
      if (key in state) state[key] = value; else target[key] = value;
      return true;
    },
  });
};

describe('renderer paper hooks', () => {
  let runtime;
  let window;
  let app;
  let r;
  let S;
  let Paper;
  let PT;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.DOMMatrix = Mat;
    app = new window.Vectura.App();
    r = app.renderer;
    S = window.Vectura.SETTINGS;
    Paper = window.Vectura.Paper;
    PT = window.Vectura.PaperTexture;
    app.engine.addLayer('harmonograph');
    r.canvas.width = 800;
    r.canvas.height = 600;
    r.ready = true;
  });

  afterAll(() => runtime?.cleanup?.());

  const drawWith = () => {
    const ctx = recordingCtx(r.canvas);
    const prev = r.ctx;
    r.ctx = ctx;
    try { r.draw(); } finally { r.ctx = prev; }
    return ctx.calls;
  };

  test("'none' paints the legacy sheet and draws ink directly (no ink canvas)", () => {
    r._paperInkCanvas = undefined;
    Paper.setActive({ type: 'none', color: '#fafafa' });
    expect(r._paperInkPlan()).toBeNull();
    const calls = drawWith();
    const sheet = calls.find((c) => c.op === 'fillRect' && c.fillStyle === '#fafafa');
    expect(sheet).toBeTruthy();
    expect(sheet.shadowBlur).toBe(20);
    expect(calls.some((c) => c.op === 'createPattern')).toBe(false);
    expect(calls.some((c) => c.op === 'stroke')).toBe(true);
    expect(calls.some((c) => c.op === 'drawImage')).toBe(false);
    expect(r._paperInkCanvas).toBeUndefined();
  });

  test('pen-true preview keeps the direct ink path even on a realistic paper', () => {
    Paper.setActive(Paper.forType('cold-press'));
    S.paperPreview = true;
    expect(r._paperInkPlan()).toBeNull();
    S.paperPreview = false;
  });

  test('a realistic paper renders ink into the ink canvas and composites it with the paper blend', () => {
    Paper.setActive(Paper.forType('cold-press'));
    const calls = drawWith();
    expect(r._paperInkCanvas).toBeTruthy();
    const ink = calls.filter((c) => c.op === 'drawImage' && c.image === r._paperInkCanvas);
    expect(ink.length).toBeGreaterThan(0);
    expect(ink[0].globalCompositeOperation).toBe('multiply');
    expect(ink[0].globalAlpha).toBeCloseTo(window.Vectura.PAPERS.TYPES['cold-press'].inkOpacity, 5);
    // Ink strokes went to the offscreen canvas, not the main context.
    expect(calls.some((c) => c.op === 'stroke')).toBe(false);
    // Textured surface drawn as document-mm chunks.
    expect(calls.some((c) => c.op === 'drawImage' && c.image !== r._paperInkCanvas && c.args.length === 4)).toBe(true);
  });

  test('dark stock keeps light ink on top (source-over)', () => {
    Paper.setActive(Paper.forType('black'));
    const calls = drawWith();
    const ink = calls.find((c) => c.op === 'drawImage' && c.image === r._paperInkCanvas);
    expect(ink.globalCompositeOperation).toBe('source-over');
  });

  // ---- physical (mm) texture scale -------------------------------------

  // Surface chunk draws for the current sheet/zoom: each is
  // drawImage(chunkCanvas, xMm, yMm, wMm, hMm) in document-mm space.
  const surfaceDraws = () => {
    PT.clearCache();
    const ctx = recordingCtx(r.canvas);
    const dpr = r.getBackingDpr();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(r.offsetX, r.offsetY);
    ctx.scale(r.scale, r.scale);
    const prof = app.engine.currentProfile;
    expect(r.drawPaperTexture(ctx, prof)).toBe(true);
    PT.flush();
    const again = recordingCtx(r.canvas);
    again.setTransform(dpr, 0, 0, dpr, 0, 0);
    again.translate(r.offsetX, r.offsetY);
    again.scale(r.scale, r.scale);
    r.drawPaperTexture(again, prof);
    const pxPerMm = r.scale * dpr;
    const bucket = PT.bucketFor(pxPerMm);
    const draws = again.calls.filter((c) => c.op === 'drawImage' && c.args.length === 4)
      .map((c) => ({ w: c.image.width, x: c.args[0], y: c.args[1], wMm: c.args[2], hMm: c.args[3] }));
    return { draws, bucket, pxPerMm, prof };
  };

  // Physically mapped = isotropic, exactly `bucket` chunk px per document mm,
  // and on a mm grid anchored at the sheet origin — whatever the sheet size.
  const isPhysical = ({ draws, bucket }) => draws.length > 0 && draws.every((d) => {
    const apron = window.Vectura.PAPERS.LIMITS.apronPx;
    const C = PT.chunkMmFor(bucket);
    const gx = (d.x + apron / bucket) / C;
    const gy = (d.y + apron / bucket) / C;
    return d.wMm === d.hMm && Math.abs(d.w / d.wMm - bucket) < 1e-9
      && Math.abs(gx - Math.round(gx)) < 1e-9 && Math.abs(gy - Math.round(gy)) < 1e-9;
  });

  const setSize = (key) => {
    S.paperSize = key;
    S.paperOrientation = 'portrait';
    app.engine.setProfile(key);
    r.canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
    r.center();
  };

  test('A6 vs A1 at fit-to-screen: same physical grain (mm), different on-screen size', () => {
    Paper.setActive(Paper.forType('cold-press'));
    setSize('a6');
    const a6 = surfaceDraws();
    setSize('a1');
    const a1 = surfaceDraws();
    expect(isPhysical(a6)).toBe(true);
    expect(isPhysical(a1)).toBe(true);
    const grainMm = window.Vectura.PAPERS.TYPES['cold-press'].grainMm;
    // The small sheet fit-to-screen shows the (same, mm-sized) grain bigger…
    expect(grainMm * a6.pxPerMm).toBeGreaterThan(grainMm * a1.pxPerMm * 3);
    // …and gets a sharper chunk resolution (bucket from on-screen px/mm).
    expect(a6.bucket).toBeGreaterThan(a1.bucket);
  });

  test('changing the paper size or orientation at a fixed zoom does not change the texture mapping', () => {
    setSize('a6');
    r.scale = 2; r.offsetX = 0; r.offsetY = 0;
    const small = surfaceDraws();
    setSize('a1');
    r.scale = 2; r.offsetX = 0; r.offsetY = 0;
    const big = surfaceDraws();
    S.paperOrientation = 'landscape';
    app.engine.setProfile('a1');
    r.scale = 2; r.offsetX = 0; r.offsetY = 0;
    const land = surfaceDraws();
    [small, big, land].forEach((x) => expect(isPhysical(x)).toBe(true));
    expect(big.bucket).toBe(small.bucket);
    // The A6 sheet's chunks are exactly the A1 sheet's chunks at the same mm.
    const key = (d) => `${d.x}|${d.y}|${d.wMm}`;
    const bigKeys = new Set(big.draws.map(key));
    small.draws.forEach((d) => expect(bigKeys.has(key(d))).toBe(true));
  });

  test('mutation witness: a sheet-fraction (stretched) mapping is rejected by the physical check', () => {
    setSize('a1');
    const real = surfaceDraws();
    const { width, height } = real.prof;
    const stretched = { ...real, draws: [{ w: 256, x: 0, y: 0, wMm: width, hMm: height }] };
    expect(isPhysical(stretched)).toBe(false);
    const sheetScaled = { ...real, draws: [{ w: 256, x: 0, y: 0, wMm: width, hMm: width }] };
    expect(isPhysical(sheetScaled)).toBe(false);
  });

  test('a cold cache draws a cheap coarse level at once and refines when idle (no blocking build), then repaints', async () => {
    setSize('a4');
    Paper.setActive(Paper.forType('rough'));
    PT.clearCache();
    let ready = 0;
    const ctx = recordingCtx(r.canvas);
    ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.translate(r.offsetX, r.offsetY); ctx.scale(r.scale * 4, r.scale * 4);
    expect(r.drawPaperTexture(ctx, app.engine.currentProfile, () => { ready += 1; })).toBe(true);
    const st = PT.cacheStats();
    // Only the coarse level (a handful of chunks) was built synchronously.
    expect(st.builds).toBeLessThanOrEqual(2);
    expect(st.queued).toBeGreaterThan(0);
    await new Promise((res) => setTimeout(res, 50));
    for (let i = 0; i < 40 && PT.cacheStats().queued; i += 1) await new Promise((res) => setTimeout(res, 10));
    expect(PT.cacheStats().queued).toBe(0);
    expect(ready).toBeGreaterThan(0);
  });

  test('chunk cache: repeat draws hit; the cache is capped in bytes', () => {
    setSize('a4');
    Paper.setActive(Paper.forType('kraft'));
    surfaceDraws();
    const st = PT.cacheStats();
    const ctx = recordingCtx(r.canvas);
    const dpr = r.getBackingDpr();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(r.offsetX, r.offsetY); ctx.scale(r.scale, r.scale);
    r.drawPaperTexture(ctx, app.engine.currentProfile);
    expect(PT.cacheStats().builds).toBe(st.builds);
    expect(PT.cacheStats().hits).toBeGreaterThan(st.hits);
    expect(PT.cacheStats().bytes).toBeLessThanOrEqual(window.Vectura.PAPERS.LIMITS.cacheBytes);
  });

  test('export preview repaints itself (not the canvas) when refined texture lands', () => {
    setSize('a4');
    Paper.setActive(Paper.forType('cold-press'));
    const seen = [];
    const orig = PT.drawSurface;
    PT.drawSurface = (ctx, cfg, opts) => { seen.push(opts.onReady); return true; };
    try {
      const ctx = recordingCtx(r.canvas);
      ctx.scale(3, 3);
      const cb = () => {};
      r.drawPaperTexture(ctx, app.engine.currentProfile, cb);
      expect(seen[0]).toBe(cb);
    } finally { PT.drawSurface = orig; }
  });

  test('bleed halo stays on while panning (re-used, transformed) — no pop on/off', () => {
    setSize('a4');
    Paper.setActive(Paper.forType('newsprint'));
    r.scale = 20; r.offsetX = -1000; r.offsetY = -1000;
    r.isPan = false;
    const idle = drawWith();
    expect(r._paperHaloCanvas).toBeTruthy();
    expect(idle.some((c) => c.op === 'drawImage' && c.image === r._paperHaloCanvas)).toBe(true);
    r.isPan = true;
    r.offsetX += 37;
    try {
      const panning = drawWith();
      expect(panning.some((c) => c.op === 'drawImage' && c.image === r._paperHaloCanvas)).toBe(true);
    } finally { r.isPan = false; }
  });
});
}
