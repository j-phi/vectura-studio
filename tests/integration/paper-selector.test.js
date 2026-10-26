/*
 * Paper selector — full-stack behaviour: default-paper preference + legacy
 * migration, per-project round-trip/undo/theme sync, the Paper panel, and the
 * renderer hooks (incl. the physical-mm texture scale), plus the pure layers
 * (catalogue, model, texture synthesis; formerly tests/unit/paper-model.test.js).
 * One file on purpose:
 * the shard-weights roster tolerates only a handful of unweighted new files.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Minimal in-memory IndexedDB (one database, object stores with keyPath)
// for the DOM-free runtime. failPut: throw this error from the next put.
const makeFakeIdb = () => {
  const dbs = new Map();
  const fake = { failPut: null, opens: 0 };
  const later = (fn) => Promise.resolve().then(fn);
  fake.open = (name) => {
    fake.opens += 1;
    const req = {};
    later(() => {
      let db = dbs.get(name);
      const isNew = !db;
      if (!db) {
        const stores = new Map();
        db = {
          stores,
          objectStoreNames: { contains: (n) => stores.has(n) },
          createObjectStore: (n, o) => { stores.set(n, { keyPath: o.keyPath, data: new Map() }); },
          transaction: (n) => {
            const st = stores.get(n);
            const tx = {};
            const reqs = [];
            const mk = (fn) => { const r = {}; reqs.push(() => { r.result = fn(); if (r.onsuccess) r.onsuccess(); }); return r; };
            tx.objectStore = () => ({
              put: (rec) => {
                if (fake.failPut) { const e = fake.failPut; fake.failPut = null; throw e; }
                return mk(() => { st.data.set(rec[st.keyPath], JSON.parse(JSON.stringify(rec))); return rec[st.keyPath]; });
              },
              get: (k) => mk(() => (st.data.has(k) ? JSON.parse(JSON.stringify(st.data.get(k))) : undefined)),
              delete: (k) => mk(() => { st.data.delete(k); }),
              getAllKeys: () => mk(() => Array.from(st.data.keys())),
            });
            later(() => { reqs.forEach((f) => f()); if (tx.oncomplete) tx.oncomplete(); });
            return tx;
          },
        };
        dbs.set(name, db);
      }
      req.result = db;
      if (isNew && req.onupgradeneeded) req.onupgradeneeded();
      if (req.onsuccess) req.onsuccess();
    });
    return req;
  };
  // "Fresh profile": empty every store (connections stay valid).
  fake.reset = () => dbs.forEach((db) => db.stores.forEach((st) => st.data.clear()));
  return fake;
};

const bytesUrl = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const tinyPng = (salt = 1) => bytesUrl('image/png', [...PNG_SIG, 0, 0, 0, 13, salt, salt + 1, salt + 2, 7, 7, 7, 7, 7]);

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
    // Edit Pen 1 through the real pens panel colour input (a user pick).
    const input = window.document.querySelector('#pen-list input[type="color"]');
    input.value = '#f4f1e8';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(pen1().themeManaged).toBe(false);
    app.setProjectPaper(Paper.forType('hot-press'), { history: true });
    expect(pen1().color).toBe('#f4f1e8');
    app.applyTheme('light', { persist: false, syncPen1: true, syncDocumentBg: true, refreshUi: false, render: false });
    expect(pen1().color).toBe('#f4f1e8');
  });

  test('picking light stock under the dark theme makes an untouched Pen 1 dark, in the SAME undo step', () => {
    app.applyTheme('dark', { persist: false, syncPen1: true, syncDocumentBg: true, refreshUi: false, render: false });
    app.setProjectPaper({ type: 'none', color: '#121214' }, { history: false });
    pen1().color = '#e6f1ff';
    pen1().themeManaged = true;
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

  test('a deliberately chosen black or white Pen 1 is never recoloured (explicit managed flag, not colour matching)', () => {
    app.setProjectPaper(Paper.forType('cold-press'), { history: false });
    const input = window.document.querySelector('#pen-list input[type="color"]');
    input.value = '#000000';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.setProjectPaper(Paper.forType('black'), { history: false });
    expect(pen1().color).toBe('#000000');
    input.value = '#ffffff';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
    app.setProjectPaper(Paper.forType('hot-press'), { history: false });
    expect(pen1().color).toBe('#ffffff');
  });

  test('the managed flag is saved with the project; legacy files infer it from colour only when they have no paper', () => {
    pen1().color = '#e6f1ff';
    pen1().themeManaged = true;
    const saved = JSON.parse(JSON.stringify(app.captureState()));
    expect(saved.settings.pens.find((p) => p.id === 'pen-1').themeManaged).toBe(true);
    // Pre-paper file: no settings.paper, no flag, theme-default colour -> managed.
    const legacy = JSON.parse(JSON.stringify(saved));
    delete legacy.settings.paper;
    legacy.settings.pens.forEach((p) => { delete p.themeManaged; });
    app.applyState(legacy);
    expect(pen1().themeManaged).toBe(true);
    // Same but a custom colour -> not managed.
    legacy.settings.pens.find((p) => p.id === 'pen-1').color = '#123456';
    app.applyState(legacy);
    expect(pen1().themeManaged).toBe(false);
    // A file with paper but no flag (1.4.20/21) -> left alone.
    const withPaper = JSON.parse(JSON.stringify(saved));
    withPaper.settings.pens.forEach((p) => { delete p.themeManaged; });
    app.applyState(withPaper);
    expect(pen1().themeManaged).toBe(false);
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

  describe('custom papers (My papers) in the panel', () => {
    const KEY = 'vectura.customPapers';
    let prompts;
    let saved;
    let origPrompt;
    let origSave;
    beforeAll(() => {
      origPrompt = window.Vectura.UI.overlays.Prompt.show;
      origSave = window.Vectura.Download.saveBlob;
      window.Vectura.UI.overlays.Prompt.show = (props) => { prompts.push(props); return Promise.resolve(prompts.answer); };
      window.Vectura.Download.saveBlob = (blob, filename) => { saved.push({ blob, filename }); return Promise.resolve('downloaded'); };
    });
    afterAll(() => {
      window.Vectura.UI.overlays.Prompt.show = origPrompt;
      window.Vectura.Download.saveBlob = origSave;
    });
    beforeEach(() => {
      prompts = [];
      saved = [];
    });
    const P = () => window.Vectura.Paper;
    const actions = () => app.ui._paperCustomActions;
    const blobText = (blob) => new Promise((res) => { const fr = new window.FileReader(); fr.onload = () => res(fr.result); fr.readAsText(blob); });
    const customSwatches = () => Array.from(document.querySelectorAll('.paper-swatch.is-custom')).map((b) => b.dataset.paperType);
    const drag = (el, values) => {
      el.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      values.forEach((v) => { el.value = String(v); el.dispatchEvent(new window.Event('input', { bubbles: true })); });
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
    };

    test('+ Save as custom… names the paper, adds a swatch after the built-ins and switches the document to it (one undo step)', async () => {
      window.localStorage.removeItem(KEY);
      app.setProjectPaper(P().forType('rough'), { history: false });
      const look = { ...P().effective() };
      expect(document.getElementById('paper-advanced').hidden).toBe(true);
      const before = app.history.length;
      prompts.answer = 'My rough';
      document.getElementById('btn-paper-save-custom').click();
      await app.ui._paperSavePending;
      expect(prompts[0].value).toBe('Rough watercolor (custom)');
      const lib = P().customLibrary().list();
      expect(lib).toHaveLength(1);
      expect(lib[0]).toMatchObject({ name: 'My rough', base: 'rough', color: look.color, defaultTexture: look.texture, defaultBleed: look.bleed });
      const id = lib[0].id;
      // Swatch: after every built-in, a radio, checked, with its own thumbnail key.
      const types = Array.from(document.querySelectorAll('#paper-section-body .paper-swatch')).map((b) => b.dataset.paperType);
      expect(types).toEqual([...window.Vectura.PAPERS.ORDER, id]);
      const sw = document.querySelector(`.paper-swatch[data-paper-type="${id}"]`);
      expect(sw.getAttribute('role')).toBe('radio');
      expect(sw.getAttribute('aria-checked')).toBe('true');
      // The document now uses it, looks identical (same realism as rough) and embeds it.
      expect(S.paper).toMatchObject({ type: id, color: look.color, texture: look.texture, bleed: look.bleed });
      const T = window.Vectura.PAPERS.TYPES;
      window.Vectura.PAPERS.PARAM_KEYS.forEach((k) => expect(T[id][k], k).toBe(T.rough[k]));
      expect(app.captureState().settings.paper.custom).toMatchObject({ name: 'My rough', base: 'rough' });
      expect(app.history.length).toBe(before + 1);
      expect(document.getElementById('paper-current-name').textContent).toContain('My rough');
      // Custom papers get the Advanced disclosure.
      expect(document.getElementById('paper-advanced').hidden).toBe(false);
      expect(document.getElementById('paper-custom-status').dataset.state).toBe('saved');
      // Cancelling the name prompt saves nothing.
      prompts.answer = null;
      document.getElementById('btn-paper-save-custom').click();
      await app.ui._paperSavePending;
      expect(P().customLibrary().list()).toHaveLength(1);
      expect(app.history.length).toBe(before + 1);
    });

    test('Advanced sliders: one undo step per drag, no empty steps; undo restores the realism; Update saved paper stores it', () => {
      const id = S.paper.type;
      const tooth = document.getElementById('paper-param-tooth');
      const start = S.paper.custom.params.tooth;
      const before = app.history.length;
      // No-op interaction: focus/pointerdown/change and a same-value input push nothing.
      tooth.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
      tooth.value = String(start);
      tooth.dispatchEvent(new window.Event('input', { bubbles: true }));
      tooth.dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(app.history.length).toBe(before);
      drag(tooth, [0.2, 0.15, 0.1]);
      expect(app.history.length).toBe(before + 1);
      expect(S.paper.custom.params.tooth).toBe(0.1);
      expect(window.Vectura.PAPERS.TYPES[id].tooth).toBe(0.1); // the renderer sees it
      expect(document.getElementById('paper-param-tooth-value').textContent).toBe('10%');
      drag(document.getElementById('paper-param-grainMm'), [2.2]);
      expect(app.history.length).toBe(before + 2);
      expect(document.getElementById('paper-param-grainMm-value').textContent).toBe('2.20 mm');
      // Library still has the old values: status says so, Update is enabled.
      expect(document.getElementById('paper-custom-status').dataset.state).toBe('modified');
      expect(document.getElementById('btn-paper-update-saved').disabled).toBe(false);
      app.undo();
      expect(S.paper.custom.params.grainMm).toBe(window.Vectura.PAPERS.TYPES.rough.grainMm);
      expect(window.Vectura.PAPERS.TYPES[id].grainMm).toBe(window.Vectura.PAPERS.TYPES.rough.grainMm);
      expect(S.paper.custom.params.tooth).toBe(0.1);
      const h = app.history.length;
      document.getElementById('btn-paper-update-saved').click();
      expect(P().customLibrary().get(id).params.tooth).toBe(0.1);
      expect(document.getElementById('paper-custom-status').dataset.state).toBe('saved');
      expect(document.getElementById('btn-paper-update-saved').disabled).toBe(true);
      expect(app.history.length).toBe(h); // a library write is not a document edit
      // Advanced is hidden for built-in papers.
      document.querySelector('.paper-swatch[data-paper-type="kraft"]').click();
      expect(document.getElementById('paper-advanced').hidden).toBe(true);
      document.querySelector(`.paper-swatch[data-paper-type="${id}"]`).click();
      expect(S.paper.custom.params.tooth).toBe(0.1);
    });

    test('per-swatch ⋯: Rename, Export; section ⋯: Export all; Import merges and shows hostile names as text', async () => {
      const id = S.paper.type;
      const more = document.querySelector(`.paper-swatch-more[data-paper-more="${id}"]`);
      expect(more.tabIndex).toBe(0); // the checked custom swatch's ⋯ is keyboard reachable
      more.click();
      const menu = Array.from(document.querySelectorAll('.menu-dropdown.paper-menu')).find((m) => m.style.display !== 'none');
      expect(Array.from(menu.querySelectorAll('.menu-entry')).map((e) => e.dataset.key)).toEqual(['rename', 'export', 'delete']);
      prompts.answer = 'Rough & ready';
      menu.querySelector('[data-key="rename"]').click();
      await new Promise((r) => setTimeout(r, 0));
      expect(P().customLibrary().get(id).name).toBe('Rough & ready');
      expect(S.paper.custom.name).toBe('Rough & ready');
      expect(document.querySelector(`.paper-swatch[data-paper-type="${id}"]`).getAttribute('aria-label')).toContain('Rough & ready');
      await actions().exportOne(id);
      expect(saved[0].filename).toBe('vectura-papers-rough-ready.json');
      const one = JSON.parse(await blobText(saved[0].blob));
      expect(one).toMatchObject({ schema: 'vectura-papers', version: 1, papers: [{ id, name: 'Rough & ready' }] });
      document.getElementById('btn-paper-library-menu').click();
      const libMenu = Array.from(document.querySelectorAll('.menu-dropdown.paper-menu')).find((m) => m.style.display !== 'none');
      expect(Array.from(libMenu.querySelectorAll('.menu-entry')).map((e) => e.dataset.key)).toEqual(['rename-current', 'export-current', 'delete-current', 'export-all', 'import']);
      libMenu.querySelector('[data-key="export-all"]').click();
      for (let i = 0; i < 20 && saved.length < 2; i += 1) await new Promise((r) => setTimeout(r, 5));
      expect(saved[1].filename).toBe('vectura-papers.json');
      // Import (through the real file input): one hostile entry, one duplicate.
      const bundle = JSON.stringify({ schema: 'vectura-papers', version: 1, papers: [
        { ...one.papers[0] },
        { id: 'custom-evil1', name: '<img src=x onerror="window.__pwned=1">', color: 'red;}body{display:none', params: { tooth: 0.9 } },
      ] });
      const input = document.getElementById('inp-paper-import');
      const file = new window.File([bundle], 'papers.json', { type: 'application/json' });
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      const res = await app.ui._paperImportPending;
      expect(res).toMatchObject({ ok: true, skipped: 1 });
      expect(res.added.map((e) => e.id)).toEqual(['custom-evil1']);
      expect(customSwatches()).toEqual([id, 'custom-evil1']);
      const body = document.getElementById('paper-section-body');
      expect(body.querySelector('img')).toBeNull();
      expect(window.__pwned).toBeUndefined();
      const evil = document.querySelector('.paper-swatch[data-paper-type="custom-evil1"]');
      expect(evil.querySelector('.paper-swatch-label').textContent).toContain('<img');
      expect(window.Vectura.PAPERS.TYPES['custom-evil1'].color).toBe(window.Vectura.PAPERS.TYPES['cold-press'].color);
      // A hostile/foreign file surfaces an error and changes nothing.
      expect(await actions().importText('{"schema":"vectura-papers","version":99,"papers":[{}]}')).toMatchObject({ ok: false, reason: 'version' });
      expect(customSwatches()).toEqual([id, 'custom-evil1']);
    });

    test('image paper: import dialog (scale, attribution, BY-SA note) creates a lean library paper and an embedded document paper', async () => {
      if (!window.indexedDB) window.indexedDB = makeFakeIdb();
      const PI = window.Vectura.PaperImage;
      const tile = tinyPng(21);
      const origProcess = PI.processImport;
      let seenOpts = null;
      PI.processImport = async (blob, opts) => {
        seenOpts = opts;
        return { image: { tile, tileMm: opts.tileMm || 254, w: 16, h: 16, ref: PI.refFor(tile, '') }, meanColor: '#e8e0d0', srcW: 1600, srcH: 1600 };
      };
      try {
        const before = app.history.length;
        const source = { provider: 'Wikimedia Commons', providerId: 'wikimedia', assetId: '7', title: 'Old paper 7', author: 'Bo & Co', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0', url: 'https://commons.wikimedia.org/wiki/File:Old_paper_7.jpg', attribution: 'Bo & Co, CC BY-SA 4.0, via Wikimedia Commons' };
        actions().openImport({ blob: new window.Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), name: 'Old paper 7', source, tileMm: 150, scaleGuessed: true });
        const dlg = document.querySelector('.paper-import-dialog');
        expect(dlg).toBeTruthy();
        expect(document.getElementById('paper-import-name').value).toBe('Old paper 7');
        expect(document.getElementById('paper-import-scale-mode').value).toBe('mm');
        expect(document.getElementById('paper-import-scale').value).toBe('150');
        expect(dlg.querySelector('.paper-import-sa')).toBeTruthy();
        expect(dlg.querySelector('.paper-attribution a').getAttribute('rel')).toBe('noopener noreferrer');
        document.getElementById('paper-import-scale').value = '210';
        document.getElementById('paper-import-create').click();
        expect(await app.ui._paperImageImport.promise).not.toBe(false);
        expect(seenOpts.tileMm).toBe(210);
        const entry = P().customLibrary().list().find((e) => e.name === 'Old paper 7');
        expect(entry.image).toEqual({ ref: PI.refFor(tile, ''), tileMm: 210, w: 16, h: 16 });
        expect(entry.source).toMatchObject({ licence: 'CC BY-SA 4.0', author: 'Bo & Co', providerId: 'wikimedia', assetId: '7' });
        expect(entry.color).toBe('#e8e0d0');
        expect(entry.params.fiberDensity).toBe(0); // the photo supplies fibres/mottle
        expect(window.localStorage.getItem(KEY)).not.toContain('base64');
        expect(S.paper.type).toBe(entry.id);
        expect(S.paper.custom.image.tile).toBe(tile); // embedded: portable
        expect(app.captureState().settings.paper.custom.source.attribution).toBe('Bo & Co, CC BY-SA 4.0, via Wikimedia Commons');
        expect(app.history.length).toBe(before + 1);
        const attr = document.getElementById('paper-attribution');
        expect(attr.hidden).toBe(false);
        expect(attr.textContent).toContain('CC BY-SA 4.0');
        expect(attr.querySelector('a').getAttribute('href')).toBe(source.url);
      } finally {
        PI.processImport = origProcess;
      }
    });

    test('search sheet (mocked network): results with licence badges + credits; a CORS-blocked download offers source page + upload', async () => {
      const ov = (id, extra = {}) => ({ id, title: `Paper ${id}`, thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`, url: `https://live.staticflickr.com/1/${id}.jpg`, width: 4000, height: 3000, license: 'cc0', license_version: '1.0', license_url: 'https://creativecommons.org/publicdomain/zero/1.0/', creator: 'Ann <b>', foreign_landing_url: `https://www.flickr.com/photos/ann/${id}`, ...extra });
      let fullMode = 'cors';
      window.fetch = async (url) => {
        if (url.startsWith('https://api.openverse.org/v1/images/?')) return { ok: true, json: async () => ({ results: [ov('a1'), ov('a2', { title: '<img src=x onerror="window.__pwned2=1">' }), ov('a3', { license: 'by-nc' })] }) };
        if (url.startsWith('https://live.staticflickr.com/')) {
          if (fullMode === 'cors') throw new TypeError('Failed to fetch');
          return { ok: true, headers: { get: () => '3' }, blob: async () => new window.Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }) };
        }
        throw new TypeError('offline');
      };
      window.Vectura.PaperTextureSearch.clearCache();
      try {
        const sheet = actions().openSearch();
        await sheet.pending;
        const cards = Array.from(document.querySelectorAll('.paper-search-card'));
        expect(cards.map((c) => c.dataset.result)).toEqual(['openverse:a1', 'openverse:a2']); // NC filtered out
        expect(cards[0].querySelector('.paper-licence-badge').textContent).toBe('CC0 1.0');
        expect(document.querySelector('.paper-search-sheet img[src^="x"]')).toBeNull();
        expect(window.__pwned2).toBeUndefined();
        expect(cards[1].querySelector('.paper-search-title').textContent).toContain('<img');
        expect(document.querySelector('.paper-search-credits a').textContent).toBe('Powered by Openverse');
        expect(document.querySelector('.paper-search-status').textContent).toMatch(/2 textures/);
        // Key-gated collections are listed but disabled until a key is saved.
        expect(document.querySelector('.paper-search-chip[data-provider="pexels"]').disabled).toBe(true);
        // Use -> CORS refusal -> fallback actions.
        cards[0].querySelector('.paper-search-use').click();
        await cards[0].pending;
        const open = cards[0].querySelector('a.paper-search-fallback');
        expect(open.getAttribute('href')).toBe('https://www.flickr.com/photos/ann/a1');
        expect(open.getAttribute('target')).toBe('_blank');
        expect(open.getAttribute('rel')).toBe('noopener noreferrer');
        expect(cards[0].querySelector('.paper-search-upload')).toBeTruthy();
        expect(cards[0].querySelector('.paper-search-note').textContent).toMatch(/does not allow direct downloads/);
        // Allowed download -> the import dialog opens with the attribution.
        fullMode = 'ok';
        cards[0].querySelector('.paper-search-use').click();
        await cards[0].pending;
        expect(document.getElementById('paper-import-name').value).toBe('Paper a1');
        expect(document.querySelector('.paper-import-dialog .paper-attribution').textContent).toContain('CC0 1.0');
        app.ui.closeModal();
      } finally {
        delete window.fetch;
      }
      // Back to the earlier custom paper for the tests below.
      const rough = P().customLibrary().list().find((e) => e.name === 'Rough & ready');
      document.querySelector(`.paper-swatch[data-paper-type="${rough.id}"]`).click();
      expect(S.paper.type).toBe(rough.id);
    });

    test('deleting the custom paper in use keeps the document working ("From file — Save to my papers")', () => {
      const id = S.paper.type;
      const params = { ...S.paper.custom.params };
      actions().deleteCustom(id);
      const confirm = Array.from(document.querySelectorAll('.vectura-dialog-footer button')).find((b) => b.textContent === 'Delete');
      confirm.click();
      expect(P().customLibrary().has(id)).toBe(false);
      // Still the document's paper, still realistic, still embedded with its params.
      expect(S.paper.type).toBe(id);
      expect(P().isRealistic(S.paper)).toBe(true);
      expect(window.Vectura.PAPERS.TYPES[id].tooth).toBe(params.tooth);
      expect(app.captureState().settings.paper.custom.params).toEqual(params);
      // It stays a (checked) swatch, flagged as from this file.
      const wrap = document.querySelector(`.paper-swatch-wrap[data-custom-id="${id}"]`);
      expect(wrap.classList.contains('is-from-file')).toBe(true);
      expect(wrap.querySelector('.paper-swatch').getAttribute('aria-checked')).toBe('true');
      expect(document.getElementById('paper-custom-status').dataset.state).toBe('from-file');
      // Save to my papers -> back in the library under the same id.
      document.getElementById('btn-paper-custom-save').click();
      expect(P().customLibrary().get(id).params).toEqual(params);
      expect(document.getElementById('paper-custom-status').dataset.state).toBe('saved');
    });

    test('a custom default paper survives reload (even after deleting it from the library) and is listed in Document Setup', () => {
      const id = S.paper.type;
      const params = { ...S.paper.custom.params };
      document.getElementById('btn-paper-set-default').click();
      expect(S.paperDefault.custom.params).toEqual(params);
      expect(JSON.parse(window.localStorage.getItem('vectura.paperDefault')).custom.params).toEqual(params);
      const select = document.getElementById('set-default-paper-type');
      expect(select.value).toBe(id);
      expect(select.querySelector(`optgroup option[value="${id}"]`).textContent).toBe('Rough & ready');
      P().customLibrary().remove(id);
      P().unregisterCustomType(id);
      const fresh = new window.Vectura.App();
      expect(fresh).toBeTruthy();
      expect(S.paper).toMatchObject({ type: id });
      expect(S.paper.custom.params).toEqual(params);
      expect(window.Vectura.PAPERS.TYPES[id].tooth).toBe(params.tooth);
      expect(P().isRealistic(S.paper)).toBe(true);
      fresh.ui.refreshDefaultPaperControls();
      const sel = document.getElementById('set-default-paper-type');
      expect(sel.value).toBe(id);
      // Picking a library paper as the default from Document Setup.
      sel.value = 'custom-evil1';
      sel.dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(S.paperDefault).toMatchObject({ type: 'custom-evil1' });
      expect(S.paperDefault.custom.params.tooth).toBe(0.9);
      app.setPaperDefault(null);
    });

    test('quota failure on Save as custom: error toast, no library entry, no undo step', async () => {
      const count = P().customLibrary().list().length;
      const before = app.history.length;
      const type = S.paper.type;
      const proto = Object.getPrototypeOf(window.localStorage);
      const orig = proto.setItem;
      proto.setItem = function setItem(k, v) {
        if (k === KEY) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
        return orig.call(this, k, v);
      };
      try {
        prompts.answer = 'Too much';
        document.getElementById('btn-paper-save-custom').click();
        await app.ui._paperSavePending;
      } finally {
        proto.setItem = orig;
      }
      expect(P().customLibrary().list()).toHaveLength(count);
      expect(app.history.length).toBe(before);
      expect(S.paper.type).toBe(type);
      const toasts = Array.from(document.querySelectorAll('.vectura-toast-danger')).map((t) => t.textContent);
      expect(toasts.some((t) => /storage is full/i.test(t))).toBe(true);
    });
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

  // A huge retina view: 2560×1440 @ DPR2 (5120×2880 device px) at 35 px/mm.
  const bigView = () => {
    const pxPerMm = 35;
    return { pxPerMm, view: { x: 20, y: 20, w: 5120 / pxPerMm, h: 2880 / pxPerMm }, sheet: { x: 0, y: 0, w: 432, h: 279 } };
  };
  const mmCtx = () => { const ctx = recordingCtx(r.canvas); ctx.scale(35, 35); return ctx; };

  test('a huge viewport settles: refinement drains, redraws re-queue nothing, memory stays bounded (no thrash)', () => {
    PT.clearCache();
    const cfg = { ...Paper.forType('cold-press') };
    const v = bigView();
    PT.drawSurface(mmCtx(), cfg, v);
    const first = PT.cacheStats();
    expect(first.queued).toBeGreaterThan(0);
    PT.flush();
    expect(PT.cacheStats().queued).toBe(0);
    const builds = PT.cacheStats().builds;
    for (let n = 0; n < 3; n += 1) {
      PT.drawSurface(mmCtx(), cfg, v);
      expect(PT.cacheStats().queued, `redraw ${n}`).toBe(0);
    }
    expect(PT.cacheStats().builds).toBe(builds);
    expect(PT.cacheStats().bytes).toBeLessThanOrEqual(window.Vectura.PAPERS.LIMITS.hardCacheBytes);
  });

  test('switching paper mid-refine drops the old paper\'s queued work; nearest-the-centre first', () => {
    PT.clearCache();
    const v = bigView();
    PT.drawSurface(mmCtx(), { ...Paper.forType('rough') }, v);
    expect(PT.cacheStats().queuedKeys.every((k) => k.startsWith('rough|'))).toBe(true);
    PT.drawSurface(mmCtx(), { ...Paper.forType('kraft') }, v);
    const q = PT.cacheStats().queuedKeys;
    expect(q.length).toBeGreaterThan(0);
    expect(q.every((k) => k.startsWith('kraft|'))).toBe(true);
    // Ordering: the queued exact chunks start at the view centre.
    const C = (k) => { const [, , b, i, j] = k.split('|').map(Number); const mm = 256 / b; return { b, x: (i + 0.5) * mm, y: (j + 0.5) * mm }; };
    const exact = q.map(C).filter((c, idx, all) => c.b === Math.max(...all.map((a) => a.b)));
    const cx = v.view.x + v.view.w / 2; const cy = v.view.y + v.view.h / 2;
    const d = (c) => Math.hypot(c.x - cx, c.y - cy);
    expect(d(exact[0])).toBeLessThanOrEqual(d(exact[exact.length - 1]));
  });

  test('cold cache: the coarse fallback is the same paper (bucket/8 built now), bucket/4 refines first', () => {
    PT.clearCache();
    const v = bigView();
    const cfg = { ...Paper.forType('cold-press') };
    PT.drawSurface(mmCtx(), cfg, v);
    const st = PT.cacheStats();
    const buckets = (keys) => Array.from(new Set(keys.map((k) => Number(k.split('|')[2])))).sort((a, b) => a - b);
    const built = buckets(st.keys);
    const queued = buckets(st.queuedKeys);
    expect(built.length).toBe(1);
    const exactB = Math.max(...queued);
    expect(built[0]).toBe(exactB / 8);
    expect(Number(st.queuedKeys[0].split('|')[2])).toBe(exactB / 4);
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

  test('a custom-paper project opened on a clean profile (empty library) renders with its own realism', () => {
    const id = 'custom-clean01';
    expect(Paper.customLibrary().list().some((e) => e.id === id)).toBe(false);
    expect(Paper.isKnownType(id)).toBe(false);
    const { PARAM_KEYS, PARAM_LIMITS, TYPES } = window.Vectura.PAPERS;
    const params = Object.fromEntries(PARAM_KEYS.map((k) => [k, TYPES.newsprint[k] ?? PARAM_LIMITS[k].min]));
    Object.assign(params, { inkOpacity: 0.77, tooth: 0.6, grainMm: 1.9 });
    const state = app.captureState();
    state.settings.paper = { type: id, color: '#e9e2d0', texture: 0.7, bleed: 0.6, seed: 3, custom: { name: 'Shop newsprint', base: 'newsprint', color: '#e9e2d0', params } };
    app.applyState(JSON.parse(JSON.stringify(state)));
    const info = window.Vectura.PAPERS.TYPES[id];
    window.Vectura.PAPERS.PARAM_KEYS.forEach((k) => expect(info[k], k).toBe(Math.round(params[k] * 1e4) / 1e4));
    expect(Paper.isRealistic(S.paper)).toBe(true);
    const prevCtx = r.ctx;
    r.ctx = recordingCtx(r.canvas);
    try { expect(r._paperInkPlan().info).toBe(info); } finally { r.ctx = prevCtx; }
    setSize('a4');
    PT.clearCache();
    const calls = drawWith();
    const ink = calls.find((c) => c.op === 'drawImage' && c.image === r._paperInkCanvas);
    expect(ink.globalAlpha).toBeCloseTo(0.77, 5);
    expect(PT.cacheStats().keys.some((k) => k.startsWith(`${id}|`))).toBe(true);
    // Saving again embeds the same block (portable both ways).
    expect(app.captureState().settings.paper.custom.params.inkOpacity).toBe(0.77);
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

// ---- pure layers: catalogue, model, texture synthesis (formerly tests/unit/paper-model.test.js) ----
{

// ---- from the former papers-catalogue.test.js ----
{
/*
 * Paper selector — the paper catalogue (src/config/papers.js).
 *
 * Guards the data contract the renderer, the Paper panel and the Document
 * Setup Default paper row all read: every listed type exists, carries a valid
 * stock colour and in-range physical/ink parameters (texture features are
 * physical millimetres), 'none' is a plain sheet, and the realistic papers are
 * actually distinct from one another.
 */

const HEX6 = /^#[0-9a-f]{6}$/;
const UNIT_KEYS = ['tooth', 'fiberDensity', 'speckle', 'mottle', 'absorbency', 'feather', 'dryskip', 'inkOpacity', 'defaultTexture', 'defaultBleed'];

describe('PAPERS catalogue', () => {
  let runtime;
  let PAPERS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ profile: 'feature', files: ['src/config/papers.js'] });
    PAPERS = runtime.window.Vectura.PAPERS;
  });

  afterAll(() => runtime?.cleanup?.());

  test('ORDER lists exactly the catalogue types, none first', () => {
    expect(PAPERS.ORDER[0]).toBe('none');
    expect([...PAPERS.ORDER].sort()).toEqual(Object.keys(PAPERS.TYPES).sort());
    expect(PAPERS.ORDER).toEqual(expect.arrayContaining([
      'hot-press', 'cold-press', 'rough', 'bristol-smooth', 'bristol-vellum',
      'cotton-rag', 'kraft', 'newsprint', 'black', 'tracing',
    ]));
  });

  test("'none' is a plain sheet: theme colour, no texture, no bleed", () => {
    const none = PAPERS.TYPES.none;
    expect(none.color).toBeNull();
    expect(none.defaultTexture).toBe(0);
    expect(none.defaultBleed).toBe(0);
    expect(none.tooth).toBe(0);
    expect(none.bleedMm).toBe(0);
  });

  test('every realistic type has a stock colour, labels and in-range parameters', () => {
    PAPERS.ORDER.filter((t) => t !== 'none').forEach((type) => {
      const info = PAPERS.TYPES[type];
      expect(info.color, type).toMatch(HEX6);
      expect(typeof info.label).toBe('string');
      expect(typeof info.short).toBe('string');
      expect(info.short.length).toBeLessThanOrEqual(11);
      UNIT_KEYS.forEach((key) => {
        expect(info[key], `${type}.${key}`).toBeGreaterThanOrEqual(0);
        expect(info[key], `${type}.${key}`).toBeLessThanOrEqual(1);
      });
      // Physical sizes are real-world millimetres (paper tooth ~0.3–3 mm,
      // fibres a few mm, ink spread well under a millimetre).
      expect(info.grainMm).toBeGreaterThanOrEqual(0.2);
      expect(info.grainMm).toBeLessThanOrEqual(3);
      expect(info.fiberLenMm).toBeLessThanOrEqual(5);
      expect(info.bleedMm).toBeLessThan(1);
      expect(info.defaultTexture).toBeGreaterThan(0);
    });
  });

  test('papers that should look different do: colour and surface/ink signatures are unique', () => {
    const types = PAPERS.ORDER.filter((t) => t !== 'none');
    const signature = (t) => {
      const i = PAPERS.TYPES[t];
      return [i.color, i.grainMm, i.tooth, i.fiberDensity, i.absorbency, i.bleedMm].join('|');
    };
    expect(new Set(types.map(signature)).size).toBe(types.length);
    const T = PAPERS.TYPES;
    // Physical ordering the realism depends on.
    expect(T.rough.tooth).toBeGreaterThan(T['cold-press'].tooth);
    expect(T['cold-press'].tooth).toBeGreaterThan(T['hot-press'].tooth);
    expect(T['bristol-smooth'].tooth).toBeLessThan(T['hot-press'].tooth);
    expect(T.newsprint.bleedMm).toBeGreaterThan(T['cold-press'].bleedMm);
    expect(T.newsprint.inkOpacity).toBeLessThan(T['bristol-smooth'].inkOpacity);
    expect(T.kraft.fiberDensity).toBeGreaterThan(T['hot-press'].fiberDensity);
    expect(T.tracing.absorbency).toBeLessThan(T['hot-press'].absorbency);
  });

  test('catalogue lookups never resolve inherited members (null prototype)', () => {
    expect(PAPERS.TYPES.constructor).toBeUndefined();
    expect(PAPERS.TYPES.toString).toBeUndefined();
    expect(PAPERS.TYPES.__proto__).toBeUndefined();
  });

  test('limits: chunks stay screen-sharp to extreme zoom and the cache is capped in bytes', () => {
    expect(PAPERS.LIMITS.maxBucket).toBeGreaterThanOrEqual(128);
    expect(PAPERS.LIMITS.cacheBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(PAPERS.LIMITS.chunkPx).toBeGreaterThanOrEqual(128);
    expect(PAPERS.STORAGE_KEY).toBe('vectura.paperDefault');
  });
});
}

// ---- from the former paper-model.test.js ----
{
/*
 * Paper selector — the paper model (src/core/paper.js, window.Vectura.Paper).
 */

const FILES = [
  'src/config/machines.js',
  'src/config/defaults.js',
  'src/config/papers.js',
  'src/config/paper-texture-sources.js',
  'src/core/validators.js',
  'src/core/user-library-store.js',
  'src/core/texture-store.js',
  'src/core/paper-texture-search.js',
  'src/core/paper.js',
  'src/render/paper-image.js',
];


describe('Vectura.Paper model', () => {
  let runtime;
  let V;
  let Paper;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ profile: 'feature', files: FILES });
    V = runtime.window.Vectura;
    Paper = V.Paper;
    // The DOM-free feature runtime has no Web Storage: give it a minimal one
    // (a class, so a test can stub Storage.prototype.setItem like a browser's).
    // Browser primitives the image/search code reads at call time.
    Object.assign(runtime.window, { atob, Blob, Response, AbortController, DecompressionStream, TextEncoder });
    runtime.window.indexedDB = makeFakeIdb();
    if (!runtime.window.localStorage) {
      class MemStorage {
        constructor() { Object.defineProperty(this, 'm', { value: new Map() }); }
        getItem(k) { return this.m.has(String(k)) ? this.m.get(String(k)) : null; }
        setItem(k, v) { this.m.set(String(k), String(v)); }
        removeItem(k) { this.m.delete(String(k)); }
      }
      runtime.window.localStorage = new MemStorage();
    }
  });

  afterAll(() => runtime?.cleanup?.());

  beforeEach(() => {
    V.SETTINGS.uiTheme = 'dark';
    V.SETTINGS.paper = null;
    V.SETTINGS.paperDefault = null;
    V.SETTINGS.bgColor = '#121214';
  });

  test('normalize clamps, validates, keeps future types and rejects unsafe ones', () => {
    expect(Paper.normalize({ type: 'cold-press', color: '#ABCDEF', texture: 4, bleed: -1, seed: 9.7 }))
      .toEqual({ type: 'cold-press', color: '#abcdef', texture: 1, bleed: 0, seed: 9 });
    // A type from a newer build is kept verbatim (renders as a plain sheet);
    // anything that isn't a safe identifier is rejected.
    expect(Paper.normalize({ type: 'papyrus', color: '#fff' }).type).toBe('papyrus');
    expect(Paper.isRealistic({ type: 'papyrus', texture: 1, bleed: 1 })).toBe(false);
    expect(Paper.isKnownType('papyrus')).toBe(false);
    expect(Paper.normalize({ type: '<img src=x>', color: '#fff' }).type).toBe('none');
    expect(Paper.normalize({ type: 'constructor' }).color).toBe('#121214');
    expect(Paper.normalize({ type: 'kraft', color: '#abc' }).color).toBe('#aabbcc');
    expect(Paper.normalize({ type: 'kraft', color: '#11223344' }).color).toBe('#112233');
    expect(Paper.normalize(null)).toMatchObject({ type: 'none', texture: 0.6, bleed: 0.5, seed: 1 });
    expect(Paper.normalize({ type: 'kraft', texture: 'NaN', seed: -3 })).toMatchObject({ texture: 0.6, seed: 1 });
  });

  test('a CSS-injection colour never survives normalize (falls back to the stock colour)', () => {
    const evil = 'red; background: url(https://attacker/x)';
    const out = Paper.normalize({ type: 'kraft', color: evil });
    expect(out.color).toBe(V.PAPERS.TYPES.kraft.color);
    expect(Paper.normalize({ type: 'none', color: evil }, { fallbackColor: '#ffffff' }).color).toBe('#ffffff');
  });

  test('fromLegacyBg wraps an old background colour as a plain sheet', () => {
    expect(Paper.fromLegacyBg('#FFEEDD')).toEqual({ type: 'none', color: '#ffeedd', texture: 0.6, bleed: 0.5, seed: 1 });
  });

  test('resolveProjectPaper precedence: state.paper > legacy bgColor > user default > built-in', () => {
    const userDefault = { type: 'kraft', color: '#c39a6b', texture: 0.7, bleed: 0.5, seed: 1 };
    const projectPaper = { type: 'rough', color: '#f5f0e2', texture: 0.3, bleed: 0.2, seed: 4 };
    expect(Paper.resolveProjectPaper({ paper: projectPaper, bgColor: '#000000' }, userDefault)).toEqual(projectPaper);
    expect(Paper.resolveProjectPaper({ bgColor: '#222222' }, userDefault)).toMatchObject({ type: 'none', color: '#222222' });
    expect(Paper.resolveProjectPaper({}, userDefault)).toEqual(userDefault);
    expect(Paper.resolveProjectPaper({}, null)).toEqual({ type: 'none', color: '#121214', texture: 0.6, bleed: 0.5, seed: 1 });
    // A tampered paper colour falls back to the file's bgColor.
    expect(Paper.resolveProjectPaper({ paper: { type: 'rough', color: 'x;y' }, bgColor: '#010203' }, null).color).toBe('#010203');
  });

  test('built-in default follows the theme document colour', () => {
    V.SETTINGS.uiTheme = 'lark';
    expect(Paper.builtinDefault()).toMatchObject({ type: 'none', color: '#ffffff' });
  });

  test('forType resets colour/texture/bleed to the type and keeps the seed', () => {
    const next = Paper.forType('newsprint', { type: 'kraft', color: '#123456', texture: 0.1, bleed: 0.1, seed: 42 });
    const info = V.PAPERS.TYPES.newsprint;
    expect(next).toEqual({ type: 'newsprint', color: info.color, texture: info.defaultTexture, bleed: info.defaultBleed, seed: 42 });
  });

  test('isRealistic and inkBlendFor', () => {
    expect(Paper.isRealistic({ type: 'none', texture: 1, bleed: 1 })).toBe(false);
    expect(Paper.isRealistic({ type: 'kraft', texture: 0, bleed: 0 })).toBe(false);
    expect(Paper.isRealistic({ type: 'kraft', texture: 0.4, bleed: 0 })).toBe(true);
    expect(Paper.isRealistic(null)).toBe(false);
    // Light stock multiplies, dark stock keeps light ink on top.
    expect(Paper.inkBlendFor({ color: '#f7f2e6' })).toBe('multiply');
    expect(Paper.inkBlendFor({ color: '#1c1c1e' })).toBe('source-over');
    expect(Paper.inkBlendFor({ color: '#c39a6b' })).toBe('source-over');
  });

  test('setActive is the single writer: normalizes, mirrors bgColor, pushes history only when asked', () => {
    const calls = [];
    const app = { pushHistory: () => calls.push('history'), render: () => calls.push('render') };
    const out = Paper.setActive({ type: 'cold-press', color: '#FAFAFA', texture: 2 }, { app });
    expect(V.SETTINGS.paper).toEqual(out);
    expect(out.texture).toBe(1);
    expect(V.SETTINGS.bgColor).toBe('#fafafa');
    expect(calls).toEqual(['render']);
    Paper.setActive({ type: 'kraft' }, { app, history: true, render: false });
    expect(calls).toEqual(['render', 'history']);
  });

  test('effective() takes the colour of record from bgColor (legacy writers stay correct)', () => {
    Paper.setActive({ type: 'kraft', color: '#c39a6b' });
    V.SETTINGS.bgColor = '#000000';
    expect(Paper.effective()).toMatchObject({ type: 'kraft', color: '#000000' });
  });

  test('themeMaySync: only a plain sheet still in the previous theme colour, with no user default, follows the theme', () => {
    expect(Paper.themeMaySync('#121214')).toBe(true);
    Paper.setActive({ type: 'none', color: '#121214' });
    expect(Paper.themeMaySync('#121214')).toBe(true);
    // A custom plain colour is the user's choice: never overwritten.
    Paper.setActive({ type: 'none', color: '#ff0000' });
    expect(Paper.themeMaySync('#121214')).toBe(false);
    Paper.setActive({ type: 'cold-press' });
    expect(Paper.themeMaySync('#121214')).toBe(false);
    Paper.setActive({ type: 'none', color: '#121214' });
    V.SETTINGS.paperDefault = Paper.fromLegacyBg('#ffffff');
    expect(Paper.themeMaySync('#121214')).toBe(false);
  });

  // ---- custom papers (My papers) ----------------------------------------

  const ARCHES = {
    id: 'custom-arches1',
    name: 'Arches 300',
    base: 'cold-press',
    color: '#f6f1e4',
    defaultTexture: 0.8,
    defaultBleed: 0.4,
    params: {
      grainMm: 1.6, grainAngle: 0.6, grainStretch: 1.4, tooth: 0.7, fiberDensity: 0.3, fiberLenMm: 2.8, fiberTone: 0.25,
      speckle: 0.05, mottle: 0.35, absorbency: 0.65, bleedMm: 0.15, feather: 0.45, dryskip: 0.55, inkOpacity: 0.9,
    },
  };
  const clearCustom = () => {
    Object.keys(V.PAPERS.TYPES).filter((t) => t.startsWith('custom-')).forEach((t) => Paper.unregisterCustomType(t));
    runtime.window.localStorage.removeItem('vectura.customPapers');
  };

  test('registerCustomType adds a full realistic type to the runtime catalogue (ORDER stays built-in only)', () => {
    clearCustom();
    const order = [...V.PAPERS.ORDER];
    const info = Paper.registerCustomType(ARCHES);
    expect(info).toMatchObject({ custom: true, base: 'cold-press', label: 'Arches 300', color: '#f6f1e4', defaultTexture: 0.8, defaultBleed: 0.4 });
    // Every realism key the renderer and texture code read is present and is the custom value.
    V.PAPERS.PARAM_KEYS.forEach((k) => expect(V.PAPERS.TYPES['custom-arches1'][k], k).toBe(ARCHES.params[k]));
    expect(V.PAPERS.ORDER).toEqual(order);
    expect(Paper.isKnownType('custom-arches1')).toBe(true);
    expect(Paper.isBuiltinType('custom-arches1')).toBe(false);
    expect(Paper.isBuiltinType('cold-press')).toBe(true);
    expect(Paper.isRealistic({ type: 'custom-arches1', texture: 0.5, bleed: 0 })).toBe(true);
    // Ids that are not custom ids never register (no shadowing built-ins / prototype names).
    ['cold-press', '__proto__', 'constructor', 'custom-<img>', 'custom-', 'Custom-abc'].forEach((id) => {
      expect(Paper.registerCustomType({ ...ARCHES, id }), id).toBeNull();
    });
    expect(V.PAPERS.TYPES['cold-press'].custom).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(V.PAPERS.TYPES, '__proto__')).toBe(false);
  });

  test('normalize embeds a clamped custom block for custom types only; hostile values never survive', () => {
    clearCustom();
    expect(Paper.normalize({ type: 'kraft' }).custom).toBeUndefined();
    const evil = Paper.normalize({
      type: 'custom-x1',
      color: 'red; background:url(//x)',
      custom: {
        name: 'Nice\u0000<img src=x onerror=alert(1)>\n', base: '__proto__', color: 'url(javascript:alert(1))',
        params: { grainMm: 'NaN', tooth: 9, inkOpacity: -4, fiberTone: -5, __proto__: { polluted: 1 }, extra: 'x', bleedMm: Infinity },
      },
    });
    expect(evil.custom.name).toBe('Nice <img src=x onerror=alert(1)>');
    expect(evil.custom.base).toBe('cold-press');
    expect(evil.custom.color).toBe(V.PAPERS.TYPES['cold-press'].color);
    expect(evil.color).toBe(evil.custom.color);
    const P = evil.custom.params;
    expect(Object.keys(P)).toEqual(V.PAPERS.PARAM_KEYS);
    expect(P.grainMm).toBe(V.PAPERS.TYPES['cold-press'].grainMm); // NaN -> base value
    expect(P.tooth).toBe(1);
    expect(P.inkOpacity).toBe(V.PAPERS.PARAM_LIMITS.inkOpacity.min);
    expect(P.fiberTone).toBe(-1);
    expect(P.bleedMm).toBe(V.PAPERS.TYPES['cold-press'].bleedMm);
    expect(({}).polluted).toBeUndefined();
    // A block that is not an object (or has no params) is dropped.
    expect(Paper.normalize({ type: 'custom-x1', custom: 'nope' }).custom).toBeUndefined();
    expect(Paper.normalize({ type: 'custom-x1', custom: { name: 'a', params: [1, 2] } }).custom).toBeUndefined();
  });

  test('setActive registers the embedded block, and it wins over a library entry with the same id', () => {
    clearCustom();
    const calls = [];
    const prevPT = V.PaperTexture;
    V.PaperTexture = { clearCache: () => calls.push('clear') };
    try {
      Paper.registerCustomType(ARCHES); // the library's version
      const fromFile = { ...ARCHES.params, tooth: 0.2, grainMm: 0.9 };
      Paper.setActive({ type: 'custom-arches1', color: '#eeeeee', texture: 0.5, bleed: 0.5, custom: { name: 'Arches (file)', base: 'rough', params: fromFile } });
      const T = V.PAPERS.TYPES['custom-arches1'];
      expect(T.tooth).toBe(0.2);
      expect(T.grainMm).toBe(0.9);
      expect(T.base).toBe('rough');
      expect(V.SETTINGS.paper.custom.params.tooth).toBe(0.2);
      // Params changed for an already-registered type -> texture caches cleared once.
      expect(calls).toEqual(['clear']);
      // Re-applying the same block is a no-op for the caches.
      Paper.setActive(V.SETTINGS.paper);
      expect(calls).toEqual(['clear']);
    } finally {
      V.PaperTexture = prevPT;
    }
  });

  test('a project on a custom paper opens on an empty library with exactly its own parameters', () => {
    clearCustom();
    const saved = JSON.parse(JSON.stringify({ paper: Paper.fromCustomEntry(ARCHES), bgColor: ARCHES.color }));
    expect(saved.paper.custom.params).toEqual(ARCHES.params);
    clearCustom(); // "another machine": nothing registered, nothing in the library
    expect(Paper.isKnownType('custom-arches1')).toBe(false);
    const opened = Paper.resolveProjectPaper(saved, null);
    expect(opened).toEqual(saved.paper);
    V.PAPERS.PARAM_KEYS.forEach((k) => expect(V.PAPERS.TYPES['custom-arches1'][k], k).toBe(ARCHES.params[k]));
    expect(Paper.isRealistic(opened)).toBe(true);
  });

  test('equals compares custom parameters; forType / fromCustomEntry / entryFromPaper round-trip', () => {
    clearCustom();
    const a = Paper.fromCustomEntry(ARCHES);
    expect(a).toMatchObject({ type: 'custom-arches1', color: '#f6f1e4', texture: 0.8, bleed: 0.4 });
    const b = { ...a, custom: { ...a.custom, params: { ...a.custom.params, tooth: 0.1 } } };
    expect(Paper.equals(a, JSON.parse(JSON.stringify(a)))).toBe(true);
    expect(Paper.equals(a, b)).toBe(false);
    Paper.registerCustomType(ARCHES);
    expect(Paper.forType('custom-arches1').custom.params).toEqual(ARCHES.params);
    const entry = Paper.entryFromPaper(a, 'Again');
    expect(entry).toMatchObject({ id: null, name: 'Again', base: 'cold-press', color: '#f6f1e4', defaultTexture: 0.8, defaultBleed: 0.4, params: ARCHES.params });
    // A built-in captured as a custom paper keeps the built-in's look.
    const fromKraft = Paper.entryFromPaper(Paper.forType('kraft'), 'My kraft');
    expect(fromKraft.base).toBe('kraft');
    expect(fromKraft.params.fiberDensity).toBe(V.PAPERS.TYPES.kraft.fiberDensity);
  });

  describe('image papers: embed, IndexedDB library, export/import, hostile tiles', () => {
    const KEY = 'vectura.customPapers';
    const decoded = (w = 16, h = 16) => ({ data: new Uint8ClampedArray(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 37) % 251)), w, h });
    let idb;
    beforeEach(() => {
      clearCustom();
      idb = runtime.window.indexedDB;
      idb.reset();
      V.PaperImage.clearMaps();
      // Test decoder: any image whose bytes contain DE AD is "corrupt".
      V.PaperImage.setDecoder(async (src) => {
        const bytes = typeof src === 'string' ? Buffer.from(src.split(',')[1] || '', 'base64') : Buffer.alloc(0);
        if (bytes.includes(Buffer.from([0xde, 0xad]))) throw new Error('bad');
        return decoded();
      });
    });
    afterAll(() => V.PaperImage.setDecoder(null));
    const imageBlock = (salt = 1, extra = {}) => ({ tile: tinyPng(salt), tileMm: 80, w: 16, h: 16, ...extra });
    const IMG_PAPER = (salt = 1) => ({ ...ARCHES, id: undefined, name: `Photo ${salt}`, image: imageBlock(salt), source: { provider: 'ambientCG', title: 'Paper 006', author: 'ambientCG', licence: 'CC0 1.0', url: 'https://ambientcg.com/a/Paper006' } });

    test('normalize keeps a validated image block (content ref, clamped tileMm) and attribution; hostile tiles reject the block', () => {
      const p = Paper.normalize({ type: 'custom-img1', custom: IMG_PAPER(1) });
      expect(p.custom.image).toMatchObject({ tileMm: 80, w: 16, h: 16, tile: tinyPng(1) });
      expect(p.custom.image.ref).toBe(V.PaperImage.refFor(tinyPng(1), ''));
      expect(p.custom.source).toEqual({ provider: 'ambientCG', title: 'Paper 006', author: 'ambientCG', licence: 'CC0 1.0', url: 'https://ambientcg.com/a/Paper006' });
      expect(Paper.normalize({ type: 'custom-img1', custom: { ...IMG_PAPER(1), image: { ...imageBlock(1), tileMm: 1e9 } } }).custom.image.tileMm).toBe(2000);
      const hostile = [
        'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
        'data:text/html;base64,PHNjcmlwdD4=',
        'javascript:alert(1)',
        bytesUrl('image/jpeg', [...PNG_SIG, 1, 2, 3]), // PNG bytes claiming JPEG
        `data:image/png;base64,${'A'.repeat(3 * 1024 * 1024)}`, // over the cap
        'https://example.com/x.png',
      ];
      hostile.forEach((tile) => {
        expect(Paper.normalize({ type: 'custom-img1', custom: { ...IMG_PAPER(1), image: { ...imageBlock(1), tile } } }).custom, tile.slice(0, 30)).toBeUndefined();
      });
      // Attribution: only https URLs, text capped and cleaned.
      const src = Paper.normalizeSource({ url: 'javascript:alert(1)', author: 'A\u0000<b>', licenceUrl: 'http://x', title: 'x'.repeat(500) });
      expect(src).toEqual({ author: 'A <b>', title: 'x'.repeat(120) });
    });

    test('a project on an image paper embeds the tile and opens on an empty library + empty IndexedDB with the same pixels', async () => {
      Paper.setActive({ type: 'custom-img1', color: '#eeeadf', texture: 0.85, bleed: 0.5, custom: IMG_PAPER(2) });
      const saved = JSON.parse(JSON.stringify({ paper: Paper.effective() }));
      expect(saved.paper.custom.image.tile).toBe(tinyPng(2));
      clearCustom();
      idb.reset();
      V.PaperImage.clearMaps();
      const opened = Paper.resolveProjectPaper(saved, null);
      expect(opened.custom.image).toEqual(saved.paper.custom.image);
      expect(V.PAPERS.TYPES['custom-img1'].image.tile).toBe(tinyPng(2));
      expect(await Paper.loadImageFor('custom-img1', V.PAPERS.TYPES['custom-img1'].image)).toBe(true);
      const maps = V.PaperImage.mapsFor(V.PAPERS.TYPES['custom-img1'].image);
      expect(maps).toMatchObject({ w: 16, h: 16, tileMm: 80 });
    });

    test('library entries stay lean (pixels in IndexedDB); a lean pick hydrates the document so it stays portable', async () => {
      const full = Paper.normalizeCustomBlock(IMG_PAPER(3)).image;
      expect((await Paper.storeImage(full)).ok).toBe(true);
      const put = Paper.customLibrary().put(IMG_PAPER(3));
      expect(put.ok).toBe(true);
      expect(put.item.image).toEqual({ ref: full.ref, tileMm: 80, w: 16, h: 16 });
      expect(runtime.window.localStorage.getItem(KEY)).not.toContain('base64');
      clearCustom(); // runtime registry gone; library + IndexedDB remain…
      Paper.customLibrary().put(put.item);
      const lean = Paper.fromCustomEntry(put.item);
      expect(lean.custom.image.tile).toBeUndefined();
      Paper.setActive(lean);
      expect(await Paper.loadImageFor(lean.type, V.PAPERS.TYPES[lean.type].image)).toBe(true);
      expect(V.SETTINGS.paper.custom.image.tile).toBe(full.tile); // hydrated into the document
      expect(JSON.stringify(Paper.leanCopy(V.SETTINGS.paper))).not.toContain('base64');
    });

    test('export inlines the pixels; import into a fresh profile re-stores them; identical re-import is skipped', async () => {
      const full = Paper.normalizeCustomBlock(IMG_PAPER(4)).image;
      await Paper.storeImage(full);
      Paper.customLibrary().put(IMG_PAPER(4));
      const exp = await Paper.exportCustomPapers(null);
      expect(exp).toMatchObject({ ok: true, count: 1, missingImages: 0 });
      const doc = JSON.parse(exp.text);
      expect(doc.papers[0].image.tile).toBe(full.tile);
      expect(doc.papers[0].source.licence).toBe('CC0 1.0');
      // Fresh profile.
      runtime.window.localStorage.removeItem(KEY);
      idb.reset();
      const r = await Paper.importCustomPapers(exp.text);
      expect(r).toMatchObject({ ok: true, rejected: 0 });
      expect(r.added).toHaveLength(1);
      expect(r.added[0].image).toEqual({ ref: full.ref, tileMm: 80, w: 16, h: 16 });
      expect((await V.TextureStore.shared().get(full.ref)).tile).toBe(full.tile);
      expect(await Paper.importCustomPapers(exp.text)).toMatchObject({ ok: true, skipped: 1 });
    });

    test('hostile image imports: wrong format, undecodable, quota; nothing half-imported', async () => {
      const bad = (image) => JSON.stringify({ schema: 'vectura-papers', version: 1, papers: [{ ...IMG_PAPER(5), image }] });
      let r = await Paper.importCustomPapers(bad({ tile: 'data:image/svg+xml;base64,PHN2Zz4=', tileMm: 50 }));
      expect(r).toMatchObject({ ok: true, rejected: 1, added: [] });
      r = await Paper.importCustomPapers(bad({ tile: bytesUrl('image/png', [...PNG_SIG, 0, 0, 0, 13, 0xde, 0xad, 2, 3]), tileMm: 50 }));
      expect(r).toMatchObject({ ok: true, rejected: 1, added: [] }); // fails to decode
      r = await Paper.importCustomPapers(bad({ ref: 'img-abcdefgh12', tileMm: 50 })); // lean, unknown image
      expect(r).toMatchObject({ ok: true, rejected: 1, added: [] });
      expect(await Paper.importCustomPapers('x'.repeat(64 * 1024 * 1024 + 1))).toEqual({ ok: false, reason: 'too-large' });
      const quota = new Error('full'); quota.name = 'QuotaExceededError';
      idb.failPut = quota;
      r = await Paper.importCustomPapers(bad(imageBlock(6)));
      expect(r).toEqual({ ok: false, reason: 'quota' });
      expect(Paper.customLibrary().list()).toEqual([]);
    });

    test('TextureStore: CRUD, invalid records, unavailable IndexedDB', async () => {
      const TS = V.TextureStore.create({ dbName: 'test-db', indexedDB: () => idb });
      const rec = { ref: 'img-0123456789', tile: tinyPng(7), tileMm: 30 };
      expect(await TS.put(rec)).toEqual({ ok: true, ref: 'img-0123456789' });
      expect(await TS.get('img-0123456789')).toMatchObject({ ref: 'img-0123456789', tile: tinyPng(7), tileMm: 30 });
      expect(await TS.keys()).toEqual(['img-0123456789']);
      expect(await TS.put({ ...rec, tile: 'data:image/svg+xml;base64,PHN2Zz4=' })).toEqual({ ok: false, reason: 'invalid' });
      expect(await TS.put({ ...rec, ref: '__proto__' })).toEqual({ ok: false, reason: 'invalid' });
      expect(await TS.remove('img-0123456789')).toEqual({ ok: true });
      expect(await TS.get('img-0123456789')).toBeNull();
      const none = V.TextureStore.create({ indexedDB: () => null });
      expect(await none.put(rec)).toEqual({ ok: false, reason: 'unavailable' });
      expect(await none.get('img-0123456789')).toBeNull();
      const throwing = V.TextureStore.create({ indexedDB: () => ({ open() { throw new Error('SecurityError'); } }) });
      expect(await throwing.keys()).toEqual([]);
    });
  });

  describe('online texture search (mocked fetch)', () => {
    let PTS;
    let conf;
    const prov = (id) => conf.PROVIDERS.find((p) => p.id === id);
    const openverseItem = (id, extra = {}) => ({
      id, title: `Paper ${id}`, thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`, url: `https://live.staticflickr.com/1/${id}.jpg`,
      width: 4000, height: 3000, license: 'by', license_version: '2.0', license_url: 'https://creativecommons.org/licenses/by/2.0/',
      creator: 'Ann', foreign_landing_url: `https://www.flickr.com/photos/ann/${id}`, attribution: `"Paper ${id}" by Ann is licensed under CC BY 2.0.`, ...extra,
    });
    const acgItem = (id, extra = {}) => ({
      id, title: `Paper ${id}`, dimensions: { width: 30, height: 30 }, maps: ['color', 'displacement'],
      thumbnails: { '512-JPG-FFFFFF': `https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/512-JPG-FFFFFF/${id}.jpg` }, ...extra,
    });
    const wikiPage = (pageid, ext = {}) => ({
      pageid, title: `File:Old_paper_${pageid}.jpg`,
      imageinfo: [{ url: `https://upload.wikimedia.org/x/${pageid}.jpg`, thumburl: `https://upload.wikimedia.org/thumb/${pageid}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:Old_paper_${pageid}.jpg`,
        width: 3000, height: 2000, mime: 'image/jpeg',
        extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' }, Artist: { value: '<a href="https://x/User:Bo" onclick="alert(1)">Bo &amp; Co</a>' }, ...ext } }],
    });
    const jsonRes = (body) => ({ ok: true, json: async () => body, headers: { get: () => null } });
    beforeAll(() => {
      PTS = V.PaperTextureSearch;
      conf = V.PAPER_TEXTURE_SOURCES;
    });
    beforeEach(() => { PTS.clearCache(); runtime.window.localStorage.removeItem('vectura.textureKeys'); });

    test('normalise: Openverse / ambientCG / Wikimedia records map to one shape; NC/ND and non-https never survive', () => {
      const ov = PTS.normalise(prov('openverse'), openverseItem('a1'));
      expect(ov).toMatchObject({
        provider: 'openverse', id: 'a1', title: 'Paper a1', fullUrl: 'https://live.staticflickr.com/1/a1.jpg', licence: 'CC BY 2.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/2.0/', author: 'Ann', sourceUrl: 'https://www.flickr.com/photos/ann/a1',
        attribution: '"Paper a1" by Ann is licensed under CC BY 2.0.', width: 4000, scaleGuessed: true, physicalMm: 150,
      });
      expect(PTS.normalise(prov('openverse'), openverseItem('a2', { license: 'cc0' })).licence).toBe('CC0 1.0');
      expect(PTS.normalise(prov('openverse'), openverseItem('a3', { license: 'by-nc', license_version: '2.0' }))).toBeNull();
      expect(PTS.normalise(prov('openverse'), openverseItem('a4', { license: 'by-nd' }))).toBeNull();
      expect(PTS.normalise(prov('openverse'), openverseItem('a5', { url: 'http://insecure/x.jpg' }))).toBeNull();
      expect(PTS.normalise(prov('openverse'), openverseItem('a6', { thumbnail: 'javascript:alert(1)' }))).toBeNull();
      expect(PTS.normalise(prov('openverse'), openverseItem('a7', { title: 'Watercolour sheet' })).physicalMm).toBe(300);
      const acg = PTS.normalise(prov('ambientcg'), acgItem('Paper004'));
      expect(acg).toMatchObject({
        id: 'Paper004', licence: 'CC0 1.0', author: 'ambientCG', physicalMm: 300,
        fullUrl: 'https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/Paper004/Paper004_SQ_Color.jpg',
        heightUrl: 'https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/Paper004/Paper004_SQ_Displacement.jpg',
        sourceUrl: 'https://ambientcg.com/view?id=Paper004',
        hires: { url: 'https://ambientcg.com/get?file=Paper004_2K-JPG.zip', archive: 'zip' },
      });
      expect(acg.scaleGuessed).toBeUndefined();
      expect(PTS.normalise(prov('ambientcg'), acgItem('Paper001', { dimensions: { width: 0 } })).scaleGuessed).toBe(true);
      const wm = PTS.normalise(prov('wikimedia'), wikiPage(7));
      expect(wm).toMatchObject({ id: '7', title: 'Old paper 7', author: 'Bo & Co', licence: 'CC BY-SA 4.0', shareAlike: true, fullUrl: 'https://upload.wikimedia.org/x/7.jpg' });
      expect(PTS.normalise(prov('wikimedia'), wikiPage(8, { LicenseShortName: { value: 'CC BY-NC-SA 3.0' } }))).toBeNull();
      expect(PTS.normalise(prov('wikimedia'), wikiPage(9, { LicenseShortName: { value: 'Fair use' } }))).toBeNull();
      expect(PTS.normalise(prov('wikimedia'), wikiPage(10, { LicenseShortName: { value: 'Copyrighted free use' } }))).toBeNull();
      const svg = wikiPage(11); svg.imageinfo[0].mime = 'image/svg+xml';
      expect(PTS.normalise(prov('wikimedia'), svg)).toBeNull();
    });

    test('search: providers in parallel, Wikimedia keyed results, key-gated providers, caching, failures and timeouts', async () => {
      const prevT = conf.TIMEOUT_MS;
      conf.TIMEOUT_MS = 30;
      const calls = [];
      let ambientMode = 'ok';
      const fetch = (url, init) => {
        calls.push({ url, headers: init.headers });
        if (url.startsWith('https://api.openverse.org/')) return Promise.resolve(jsonRes({ results: [openverseItem('o1'), openverseItem('o2', { license: 'by-nc' }), 'junk', null] }));
        if (url.startsWith('https://commons.wikimedia.org/')) return Promise.resolve(jsonRes({ query: { pages: { 7: wikiPage(7), 8: wikiPage(8) } } }));
        if (url.startsWith('https://ambientcg.com/')) {
          if (ambientMode === 'hang') return new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('AbortError'))));
          return Promise.reject(new TypeError('Failed to fetch'));
        }
        if (url.startsWith('https://api.pexels.com/')) return Promise.resolve(jsonRes({ photos: [{ id: 5, alt: 'Kraft paper', src: { medium: 'https://images.pexels.com/5m.jpg', original: 'https://images.pexels.com/5.jpg' }, url: 'https://www.pexels.com/photo/5/', photographer: 'Cy', width: 6000, height: 4000 }] }));
        if (url.endsWith('index.json')) return Promise.resolve({ ok: false, status: 404 });
        return Promise.reject(new Error(`unexpected ${url}`));
      };
      try {
        let out = await PTS.search('cold press', { fetch });
        expect(out.results.map((r) => `${r.provider}:${r.id}`)).toEqual(['openverse:o1', 'wikimedia:7', 'wikimedia:8']);
        expect(out.errors).toEqual([{ provider: 'ambientcg', reason: 'network' }]);
        expect(out.absent).toEqual(['bundle']);
        expect(calls.some((c) => c.url.includes('pexels') || c.url.includes('unsplash'))).toBe(false); // no key yet
        expect(calls[0].url).toContain('q=cold%20press');
        const n = calls.length;
        await PTS.search('cold press', { fetch, providers: ['openverse', 'wikimedia'] });
        expect(calls.length).toBe(n); // cached
        // A user key enables Pexels (sent as the Authorization header, stored locally only).
        expect(PTS.setKey('pexels', 'bad key!')).toBe(false);
        expect(PTS.setKey('openverse', 'abcdefgh1234')).toBe(false);
        expect(PTS.setKey('pexels', 'abcdefgh1234')).toBe(true);
        out = await PTS.search('kraft', { fetch, providers: ['pexels'] });
        expect(out.results[0]).toMatchObject({ provider: 'pexels', title: 'Kraft paper', author: 'Cy', attribution: 'Photo by Cy on Pexels', licence: 'Pexels Licence' });
        expect(calls[calls.length - 1].headers).toEqual({ Authorization: 'abcdefgh1234' });
        // Timeout.
        ambientMode = 'hang';
        out = await PTS.search('rough', { fetch, providers: ['ambientcg'] });
        expect(out.errors).toEqual([{ provider: 'ambientcg', reason: 'timeout' }]);
      } finally {
        conf.TIMEOUT_MS = prevT;
      }
    });

    // A stored (method 0) zip with the given { name: bytes } members.
    const storedZip = (files) => {
      const parts = []; const central = []; let offset = 0;
      Object.entries(files).forEach(([name, data]) => {
        const nb = Buffer.from(name);
        const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(0, 8);
        local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nb.length, 26);
        parts.push(local, nb, Buffer.from(data));
        const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0, 10);
        c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(offset, 42);
        central.push(c, nb);
        offset += 30 + nb.length + data.length;
      });
      const cd = Buffer.concat(central);
      const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 10);
      end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
      return Buffer.concat([...parts, cd, end]);
    };
    const blobRes = (bytes) => ({ ok: true, headers: { get: () => String(bytes.length) }, blob: async () => new Blob([bytes]) });

    test('download: colour + height maps; High-res ZIP unpacked; CORS refusal -> fallback; caps; cors:no never fetches', async () => {
      const r = PTS.normalise(prov('ambientcg'), acgItem('Paper006'));
      const seen = [];
      const ok = await PTS.download(r, { fetch: async (url) => { seen.push(url); return blobRes(Buffer.from(url.includes('Displacement') ? [0xff, 0xd8, 0xff, 9] : [0xff, 0xd8, 0xff, 1])); } });
      expect(ok.ok).toBe(true);
      expect(seen).toEqual([r.fullUrl, r.heightUrl]);
      expect(Array.from(new Uint8Array(await ok.height.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff, 9]);
      const zip = storedZip({ 'Paper006_2K-JPG_Color.jpg': [0xff, 0xd8, 0xff, 1, 2], 'Paper006_2K-JPG_Displacement.jpg': [0xff, 0xd8, 0xff, 3], 'Paper006.usda': [1] });
      const hi = await PTS.download(r, { hires: true, fetch: async (url) => { expect(url).toBe('https://ambientcg.com/get?file=Paper006_2K-JPG.zip'); return blobRes(zip); } });
      expect(hi.ok).toBe(true);
      expect(Array.from(new Uint8Array(await hi.albedo.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff, 1, 2]);
      expect(hi.albedo.type).toBe('image/jpeg');
      expect(Array.from(new Uint8Array(await hi.height.arrayBuffer()))).toEqual([0xff, 0xd8, 0xff, 3]);
      expect(await PTS.download(r, { fetch: () => Promise.reject(new TypeError('Failed to fetch')) })).toEqual({ ok: false, reason: 'cors' });
      expect(await PTS.download(r, { fetch: async () => ({ ok: false, status: 404 }) })).toEqual({ ok: false, reason: 'http' });
      expect(await PTS.download(r, { fetch: async () => ({ ok: true, headers: { get: () => String(1e9) }, blob: async () => new Blob([]) }) })).toEqual({ ok: false, reason: 'too-large' });
      expect(await PTS.download(r, { hires: true, fetch: async () => blobRes(Buffer.from('not a zip')) })).toEqual({ ok: false, reason: 'archive' });
      let fetched = false;
      expect(await PTS.download({ ...r, cors: 'no' }, { fetch: async () => { fetched = true; } })).toEqual({ ok: false, reason: 'cors' });
      expect(fetched).toBe(false);
    });

    test('curated bundle: listed only when its same-origin index exists; relative files resolve on this origin only', async () => {
      Object.assign(runtime.window, { URL, location: { origin: 'http://localhost', href: 'http://localhost/index.html' } });
      try {
        const index = { schema: 'vectura-paper-texture-bundle', version: 1, textures: [
          { id: 'ambientcg-paper004', title: 'ambientCG Paper004', source: 'ambientCG', author: 'ambientCG', licence: 'CC0 1.0', landingUrl: 'https://ambientcg.com/view?id=Paper004', albedo: 'ambientcg-paper004.webp', height: 'ambientcg-paper004_height.webp', thumb: 'ambientcg-paper004_thumb.webp', physicalMm: 300, tags: ['paper'] },
          { id: 'evil', title: 'Evil', licence: 'CC0 1.0', albedo: 'javascript:alert(1)', thumb: '//evil.example/x.webp' },
          { id: 'up', title: 'Up', licence: 'CC0 1.0', albedo: '../../etc/x.webp', thumb: 'x.webp' },
        ] };
        const fetch = async (url) => (url === 'assets/paper-textures/index.json' ? jsonRes(index) : Promise.reject(new Error('offline')));
        const out = await PTS.search('paper', { fetch, providers: ['bundle'] });
        expect(out.results.map((r) => r.id)).toEqual(['ambientcg-paper004']);
        expect(out.results[0]).toMatchObject({
          fullUrl: 'http://localhost/assets/paper-textures/ambientcg-paper004.webp',
          heightUrl: 'http://localhost/assets/paper-textures/ambientcg-paper004_height.webp',
          physicalMm: 300, cors: 'yes', licence: 'CC0 1.0',
        });
        PTS.clearCache();
        const none = await PTS.search('paper', { fetch: async () => ({ ok: false, status: 404 }), providers: ['bundle'] });
        expect(none).toMatchObject({ results: [], errors: [], absent: ['bundle'] });
      } finally {
        delete runtime.window.location;
        PTS.clearCache();
      }
    });

    test('Unsplash: used photos report download_location with the key (provider rule)', async () => {
      PTS.setKey('unsplash', 'abcdefgh1234');
      const item = { id: 'u1', alt_description: 'white paper', urls: { small: 'https://images.unsplash.com/s.jpg', full: 'https://images.unsplash.com/f.jpg' },
        links: { html: 'https://unsplash.com/photos/u1', download_location: 'https://api.unsplash.com/photos/u1/download' }, user: { name: 'Dee' }, width: 5000, height: 3000 };
      const r = PTS.normalise(prov('unsplash'), item);
      expect(r).toMatchObject({ attribution: 'Photo by Dee on Unsplash', sourceUrl: 'https://unsplash.com/photos/u1?utm_source=vectura_studio&utm_medium=referral' });
      const calls = [];
      await PTS.download(r, { fetch: async (url, init) => { calls.push([url, init.headers]); return blobRes(Buffer.from([0xff, 0xd8, 0xff])); } });
      expect(calls[0]).toEqual(['https://api.unsplash.com/photos/u1/download', { Authorization: 'Client-ID abcdefgh1234' }]);
      expect(calls[1][0]).toBe('https://images.unsplash.com/f.jpg');
    });
  });

  describe('My papers library (UserLibraryStore)', () => {
    const KEY = 'vectura.customPapers';
    const ls = () => runtime.window.localStorage;
    const lib = () => Paper.customLibrary();
    beforeEach(() => clearCustom());

    test('put / rename / remove persist in localStorage; a new store instance (reload) reads the same library', () => {
      const res = lib().put({ ...ARCHES, id: undefined });
      expect(res.ok).toBe(true);
      expect(res.item.id).toMatch(/^custom-[a-z0-9]{7}$/);
      const second = lib().put({ ...ARCHES, id: undefined });
      expect(second.item.name).toBe('Arches 300 (2)');
      expect(lib().rename(res.item.id, '  Arches\t300 rough  ').item.name).toBe('Arches 300 rough');
      const stored = JSON.parse(ls().getItem(KEY));
      expect(stored).toMatchObject({ schema: 'vectura-papers', version: 1 });
      expect(stored.papers.map((p) => p.name)).toEqual(['Arches 300 rough', 'Arches 300 (2)']);
      const reloaded = V.UserLibraryStore.create({ key: KEY, schema: 'vectura-papers', version: 1, itemsKey: 'papers', validate: Paper.normalizeCustomEntry, idPrefix: 'custom-' });
      expect(reloaded.list()).toEqual(lib().list());
      expect(reloaded.get(res.item.id).params).toEqual(ARCHES.params);
      expect(lib().remove(res.item.id).ok).toBe(true);
      expect(lib().list().map((p) => p.name)).toEqual(['Arches 300 (2)']);
      expect(lib().remove('custom-missing').ok).toBe(false);
    });

    test('export one / all -> import into a fresh library: merge, identical-skip, collision rename', () => {
      const a = lib().put(ARCHES).item;
      const b = lib().put({ ...ARCHES, id: 'custom-hotp1', name: 'Smooth', base: 'hot-press', params: { ...ARCHES.params, tooth: 0.1 } }).item;
      const one = lib().exportOne(a.id);
      const all = lib().exportAll();
      expect(one).toMatchObject({ ok: true, count: 1, filename: 'vectura-papers-arches-300.json' });
      expect(all).toMatchObject({ ok: true, count: 2, filename: 'vectura-papers.json' });
      expect(JSON.parse(all.text)).toMatchObject({ schema: 'vectura-papers', version: 1, papers: [{ id: a.id }, { id: b.id }] });
      // Fresh profile.
      ls().removeItem(KEY);
      expect(lib().list()).toEqual([]);
      let r = lib().importBundle(one.text, 'merge');
      expect(r).toMatchObject({ ok: true, skipped: 0, renamed: 0, rejected: 0 });
      expect(r.added.map((p) => p.id)).toEqual([a.id]);
      // Export all over it: the identical one is skipped, the other added.
      r = lib().importBundle(all.text, 'merge');
      expect(r).toMatchObject({ ok: true, skipped: 1, renamed: 0 });
      expect(lib().list().map((p) => p.id)).toEqual([a.id, b.id]);
      // Same id, different content -> new id and "Name (2)"; same name -> "(2)" too.
      const clash = JSON.parse(one.text);
      clash.papers[0].params.tooth = 0.05;
      r = lib().importBundle(JSON.stringify(clash), 'merge');
      expect(r).toMatchObject({ ok: true, renamed: 1 });
      expect(r.added[0].id).not.toBe(a.id);
      expect(r.added[0].name).toBe('Arches 300 (2)');
      expect(lib().get(a.id).params.tooth).toBe(ARCHES.params.tooth); // never overwritten
    });

    test('hostile imports are refused or sanitised; nothing is polluted', () => {
      const ok = (o) => JSON.stringify({ schema: 'vectura-papers', version: 1, papers: o });
      expect(lib().importBundle('x'.repeat(512 * 1024 + 1), 'merge')).toEqual({ ok: false, reason: 'too-large' });
      expect(lib().importBundle('{"schema":', 'merge')).toEqual({ ok: false, reason: 'parse' });
      expect(lib().importBundle('[]', 'merge')).toEqual({ ok: false, reason: 'schema' });
      expect(lib().importBundle(JSON.stringify({ schema: 'vectura-pens', version: 1, papers: [ARCHES] }), 'merge')).toEqual({ ok: false, reason: 'schema' });
      expect(lib().importBundle(JSON.stringify({ schema: 'vectura-papers', version: 2, papers: [ARCHES] }), 'merge')).toEqual({ ok: false, reason: 'version' });
      expect(lib().importBundle(JSON.stringify({ schema: 'vectura-papers', version: 'x', papers: [ARCHES] }), 'merge')).toEqual({ ok: false, reason: 'schema' });
      expect(lib().importBundle(ok([]), 'merge')).toEqual({ ok: false, reason: 'empty' });
      const text = `{"schema":"vectura-papers","version":1,"__proto__":{"polluted":true},"papers":[
        {"id":"__proto__","name":"P1","base":"cold-press","params":{"tooth":0.2}},
        {"id":"constructor","name":"P2","params":{"tooth":0.3,"__proto__":{"polluted":true},"constructor":{"x":1}}},
        {"id":"custom-ok1","name":"<img src=x onerror=alert(1)>","color":"red;background:url(x)","params":{"grainMm":"NaN","inkOpacity":null,"tooth":1e9}},
        "not an object", null, 42, {"name":"no params"}, {"name":"array params","params":[]}
      ]}`;
      const r = lib().importBundle(text, 'merge');
      expect(r.ok).toBe(true);
      expect(r.rejected).toBe(5);
      expect(r.added).toHaveLength(3);
      r.added.forEach((p) => {
        expect(p.id).toMatch(/^custom-[a-z0-9]{1,24}$/);
        expect(Object.keys(p)).toEqual(['id', 'name', 'base', 'color', 'defaultTexture', 'defaultBleed', 'params']);
        expect(Object.keys(p.params)).toEqual(V.PAPERS.PARAM_KEYS);
      });
      const evil = r.added[2];
      expect(evil.id).toBe('custom-ok1');
      expect(evil.color).toBe(V.PAPERS.TYPES['cold-press'].color);
      expect(evil.params.grainMm).toBe(V.PAPERS.TYPES['cold-press'].grainMm);
      expect(evil.params.inkOpacity).toBe(V.PAPERS.TYPES['cold-press'].inkOpacity);
      expect(evil.params.tooth).toBe(1);
      expect(({}).polluted).toBeUndefined();
      expect(Object.prototype.polluted).toBeUndefined();
      // A corrupt stored library reads as empty (never throws) and is replaced on the next write.
      ls().setItem(KEY, '{broken');
      expect(lib().list()).toEqual([]);
      expect(lib().put(ARCHES).ok).toBe(true);
    });

    test('quota / blocked storage: writes fail cleanly with reason quota and leave the library unchanged', () => {
      lib().put(ARCHES);
      const before = ls().getItem(KEY);
      const proto = Object.getPrototypeOf(ls());
      const orig = proto.setItem;
      proto.setItem = function setItem() {
        const err = new Error('The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      };
      try {
        expect(lib().put({ ...ARCHES, id: undefined, name: 'More' })).toEqual({ ok: false, reason: 'quota' });
        expect(lib().rename(ARCHES.id, 'Renamed')).toEqual({ ok: false, reason: 'quota' });
        expect(lib().importBundle(JSON.stringify({ schema: 'vectura-papers', version: 1, papers: [{ ...ARCHES, id: 'custom-zz9', params: { tooth: 0.01 } }] }), 'merge'))
          .toEqual({ ok: false, reason: 'quota' });
      } finally {
        proto.setItem = orig;
      }
      expect(ls().getItem(KEY)).toBe(before);
      // A store whose storage throws on every access never throws itself.
      const broken = V.UserLibraryStore.create({ key: KEY, schema: 'vectura-papers', validate: Paper.normalizeCustomEntry, idPrefix: 'custom-', storage: () => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }) });
      expect(broken.list()).toEqual([]);
      expect(broken.put(ARCHES)).toEqual({ ok: false, reason: 'unavailable' });
      const none = V.UserLibraryStore.create({ key: KEY, schema: 'vectura-papers', validate: Paper.normalizeCustomEntry, storage: () => null });
      expect(none.put(ARCHES)).toEqual({ ok: false, reason: 'unavailable' });
    });

    test('the library is capped (max entries -> full)', () => {
      const small = V.UserLibraryStore.create({ key: 'vectura.testCap', schema: 'vectura-papers', validate: Paper.normalizeCustomEntry, idPrefix: 'custom-', max: 2 });
      expect(small.put({ ...ARCHES, id: undefined }).ok).toBe(true);
      expect(small.put({ ...ARCHES, id: undefined, name: 'B' }).ok).toBe(true);
      expect(small.put({ ...ARCHES, id: undefined, name: 'C' })).toEqual({ ok: false, reason: 'full' });
      ls().removeItem('vectura.testCap');
    });
  });

  test('equals compares the visible paper (rounded sliders), not object identity', () => {
    expect(Paper.equals({ type: 'kraft', color: '#C39A6B', texture: 0.701, bleed: 0.5 }, { type: 'kraft', color: '#c39a6b', texture: 0.7, bleed: 0.5 })).toBe(true);
    expect(Paper.equals({ type: 'kraft', color: '#c39a6b' }, { type: 'rough', color: '#c39a6b' })).toBe(false);
    expect(Paper.equals(null, { type: 'kraft' })).toBe(false);
  });
});
}

// ---- texture synthesis ----
{
/*
 * Paper selector — texture synthesis (src/render/paper-texture.js).
 *
 * The surface is one global, non-periodic function of document millimetres,
 * rasterised at a zoom "bucket": the same bump must sit at the same mm
 * position at every bucket (no re-randomising while zooming), nothing may
 * repeat, and chunk resolution follows on-screen px/mm only.
 */

const FILES = ['src/config/papers.js', 'src/core/rng.js', 'src/render/paper-image.js', 'src/render/paper-texture.js'];

const corr = (a, b) => {
  const n = a.length;
  let ma = 0; let mb = 0;
  for (let i = 0; i < n; i += 1) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0; let saa = 0; let sbb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - ma; const db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return sab / Math.sqrt(saa * sbb);
};

// Box-downsample a size×size field by an integer factor.
const down = (f, size, k) => {
  const n = size / k;
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      let s = 0;
      for (let j = 0; j < k; j += 1) for (let i = 0; i < k; i += 1) s += f[(y * k + j) * size + x * k + i];
      out[y * n + x] = s / (k * k);
    }
  }
  return out;
};

describe('PaperTexture', () => {
  let runtime;
  let PT;
  let PAPERS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ profile: 'feature', files: FILES });
    PT = runtime.window.Vectura.PaperTexture;
    PAPERS = runtime.window.Vectura.PAPERS;
  });

  afterAll(() => runtime?.cleanup?.());

  // The same 32 mm window at two adjacent zoom buckets, compared at the
  // coarser resolution.
  const bucketPair = (type, seed, b, x0 = 13.7, y0 = 41.2) => {
    const mm = 32;
    const lo = PT.heightField(type, seed, x0, y0, mm * b, b);
    const hi = PT.heightField(type, seed, x0, y0, mm * b * 2, b * 2);
    return corr(lo, down(hi, mm * b * 2, 2));
  };

  test('features are stable across zoom buckets (same bumps at the same mm)', () => {
    ['cold-press', 'rough', 'hot-press', 'kraft'].forEach((type) => {
      [2, 4, 8].forEach((b) => {
        expect(bucketPair(type, 1, b), `${type} @${b}→${b * 2}`).toBeGreaterThan(0.85);
      });
    });
  });

  test('stability witness: an unrelated field (other seed) does NOT correlate', () => {
    // Mutation proof for the check above: re-randomising per bucket (what a
    // per-bucket lattice did) looks like a different seed.
    const mm = 32; const b = 4;
    const a = PT.heightField('rough', 1, 13.7, 41.2, mm * b, b);
    const c = PT.heightField('rough', 2, 13.7, 41.2, mm * b, b);
    expect(Math.abs(corr(a, c))).toBeLessThan(0.3);
  });

  test('no repetition: windows 32–512 mm apart are uncorrelated', () => {
    const b = 4; const size = 64;
    const base = PT.heightField('kraft', 1, 10, 10, size, b);
    [32, 64, 128, 256, 512].forEach((shift) => {
      const other = PT.heightField('kraft', 1, 10 + shift, 10, size, b);
      expect(Math.abs(corr(base, other)), `shift ${shift} mm`).toBeLessThan(0.3);
    });
  });

  test('fields are deterministic per seed', () => {
    const a = PT.heightField('rough', 7, 0, 0, 64, 4);
    const b = PT.heightField('rough', 7, 0, 0, 64, 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    a.forEach((v) => { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); });
  });

  // ---- image-based papers -------------------------------------------------

  // A w×h RGBA "photo": fine random grain under a strong left→right lighting
  // gradient, with mismatched edges (not tileable).
  const photo = (w, h, seed = 3) => {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const light = 0.45 + 0.5 * (x / (w - 1));
        const v = Math.round(255 * light * (0.82 + 0.18 * rnd()));
        const o = (y * w + x) * 4;
        data[o] = v; data[o + 1] = v; data[o + 2] = Math.round(v * 0.95); data[o + 3] = 255;
      }
    }
    return { data, w, h };
  };
  const meanOf = (f, w, x0, x1, h) => { let t = 0; let n = 0; for (let y = 0; y < h; y += 1) for (let x = x0; x < x1; x += 1) { t += f[y * w + x]; n += 1; } return t / n; };

  test('image import pipeline: de-light removes the lighting gradient, tiling removes the seam', () => {
    const PI = runtime.window.Vectura.PaperImage;
    const { data, w, h } = photo(96, 64);
    const lum = PI.luminance(data, w, h);
    const left = meanOf(lum, w, 0, 24, h); const right = meanOf(lum, w, 72, 96, h);
    expect(right / left).toBeGreaterThan(1.5);
    const lit = PI.delight(lum, w, h);
    const l2 = meanOf(lit, w, 0, 24, h); const r2 = meanOf(lit, w, 72, 96, h);
    expect(Math.abs(r2 / l2 - 1)).toBeLessThan(0.08);
    // Seam: the raw edges jump (gradient wraps), the tiled image does not.
    expect(PI.seamScore(lum, w, h)).toBeGreaterThan(3);
    const tiled = PI.makeTileable(lit, w, h);
    expect(PI.seamScore(tiled, w, h)).toBeLessThan(1.5);
    // Mutation witness: an un-feathered offset (pure wrap shift) keeps a seam inside.
    const shifted = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) shifted[y * w + x] = lum[y * w + ((x + w / 2) % w)];
    expect(PI.seamScore(shifted, w, h)).toBeLessThan(1.5);
    expect(PI.seamScore(PI.makeTileable(lum, w, h), w, h)).toBeLessThan(1.5);
    // Height: high-pass of the detail, bounded, zero-mean.
    const maps = PI.mapsFromPixels({ data, w, h }, { tileMm: 40 });
    let mean = 0; maps.height.forEach((v) => { expect(Math.abs(v)).toBeLessThanOrEqual(1); mean += v; });
    expect(Math.abs(mean / maps.height.length)).toBeLessThan(0.05);
    // A supplied height map wins over the derived one.
    const flat = { data: new Uint8ClampedArray(w * h * 4).fill(128), w, h };
    const withHeight = PI.mapsFromPixels({ data, w, h }, { tileMm: 40, height: flat });
    expect(Math.max(...withHeight.height.map(Math.abs))).toBeLessThan(1e-6);
  });

  test('physical scale: dpi / tile width -> mm, clamped', () => {
    const PI = runtime.window.Vectura.PaperImage;
    expect(PI.tileMmFrom({ pxWidth: 3000, dpi: 300 })).toBe(254);
    expect(PI.tileMmFrom({ pxWidth: 3000 })).toBe(254); // default 300 dpi
    expect(PI.tileMmFrom({ pxWidth: 1200, dpi: 600 })).toBe(50.8);
    expect(PI.tileMmFrom({ pxWidth: 3000, tileMm: 120 })).toBe(120);
    expect(PI.tileMmFrom({ pxWidth: 1, dpi: 4800 })).toBe(PAPERS.IMAGE.tileMmMin);
    expect(PI.tileMmFrom({ pxWidth: 1e9, dpi: 1 })).toBe(PAPERS.IMAGE.tileMmMax);
  });

  test('an image paper is sampled in document mm: wraps every tileMm, same bump at the same mm across zoom buckets', () => {
    const V = runtime.window.Vectura;
    const PI = V.PaperImage;
    // A paper-like height field: random grain smoothed to ~0.5 mm features
    // (4 map px per mm), tileable by construction (wrapping blur).
    const w = 64; const h = 64;
    let seed = 9;
    const noise = Float32Array.from({ length: w * h }, () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; });
    const field = PI.boxBlurWrap(noise, w, h, 2);
    let mx = 0; field.forEach((v) => { mx = Math.max(mx, Math.abs(v)); });
    const height = field.map((v) => v / mx);
    const maps = { w, h, tileMm: 16, height, albedo: height.map((v) => v * 0.1) };
    PI.putMaps('img-test0001', maps);
    PAPERS.TYPES['custom-imgt1'] = { ...PAPERS.TYPES['cold-press'], custom: true, image: { ref: 'img-test0001', tileMm: 16 } };
    try {
      // Periodic in mm (tile = 16 mm) at and below the image's native 4 px/mm.
      [2, 4].forEach((b) => {
        const a = PT.heightField('custom-imgt1', 1, 3, 5, 32, b);
        const c = PT.heightField('custom-imgt1', 1, 3 + 16, 5 - 32, 32, b);
        a.forEach((v, i) => expect(c[i]).toBeCloseTo(v, 5));
      });
      // Value at an mm position = the map at mm × (px per mm), independent of the bucket.
      const at = (b) => PT.heightField('custom-imgt1', 1, 7.3, 2.1, 1, b)[0];
      const expectAt = (b) => PI.sampleWrap(maps.height, w, h, (7.3 + 0.5 / b) * (w / 16) - 0.5, (2.1 + 0.5 / b) * (w / 16) - 0.5);
      expect(at(4)).toBeCloseTo(expectAt(4), 5); // ≤ native 4 px/mm: pure image
      expect(bucketPair('custom-imgt1', 1, 1)).toBeGreaterThan(0.85);
      // Isotropic: the albedo field is the map sampled with square mm pixels.
      const alb = PT.albedoField('custom-imgt1', 0, 0, 8, 4);
      expect(alb).toHaveLength(64);
      expect(PT.albedoField('cold-press', 0, 0, 8, 4)).toBeNull();
      // Past native resolution the procedural tooth is blended in (more relief than the bilinear image alone;
      // the chunk's fine octave + fibre web add the sharpest detail on top).
      const deep = PT.heightField('custom-imgt1', 1, 3, 3, 64, 64);
      let hf = 0; for (let i = 1; i < 64; i += 1) hf += Math.abs(deep[i] - deep[i - 1]);
      const smoothOnly = Array.from({ length: 64 }, (_, i) => PI.sampleWrap(maps.height, w, h, (3 + (i + 0.5) / 64) * 4 - 0.5, (3 + 0.5 / 64) * 4 - 0.5));
      let hs = 0; for (let i = 1; i < 64; i += 1) hs += Math.abs(smoothOnly[i] - smoothOnly[i - 1]);
      expect(hf).toBeGreaterThan(hs * 1.1);
    } finally {
      delete PAPERS.TYPES['custom-imgt1'];
      PI.clearMaps();
    }
  });

  test('procedural papers never take the image path (None + procedural unchanged)', () => {
    const V = runtime.window.Vectura;
    const withPI = PT.heightField('rough', 7, 1, 2, 32, 4);
    const saved = V.PaperImage;
    V.PaperImage = undefined;
    try {
      expect(Array.from(PT.heightField('rough', 7, 1, 2, 32, 4))).toEqual(Array.from(withPI));
    } finally {
      V.PaperImage = saved;
    }
  });

  test('image validation: only real PNG/JPEG/WebP data URLs under the cap', () => {
    const PI = runtime.window.Vectura.PaperImage;
    const url = (mime, bytes) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
    const jpg = [0xff, 0xd8, 0xff, 0xe0, 0, 0];
    const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    expect(PI.sniffMime(new Uint8Array(png))).toBe('image/png');
    expect(PI.sniffMime(new Uint8Array(jpg))).toBe('image/jpeg');
    expect(PI.sniffMime(new Uint8Array(webp))).toBe('image/webp');
    expect(PI.sniffMime(new Uint8Array(Buffer.from('<svg onload=alert(1)>')))).toBeNull();
    expect(PI.validateDataUrl(url('image/png', png))).toBeTruthy();
    expect(PI.validateDataUrl(url('image/jpeg', jpg))).toBeTruthy();
    expect(PI.validateDataUrl(url('image/webp', webp))).toBeTruthy();
    expect(PI.validateDataUrl(url('image/png', jpg))).toBeNull();
    expect(PI.validateDataUrl(url('image/svg+xml', Buffer.from('<svg/>')))).toBeNull();
    expect(PI.validateDataUrl(`${url('image/png', png)}"><img src=x>`)).toBeNull();
    expect(PI.validateDataUrl(url('image/png', png), 4)).toBeNull();
    expect(PI.validateDataUrl({ toString: () => url('image/png', png) })).toBeNull();
  });

  test('chunk buckets are powers of two of on-screen px/mm, clamped, up to extreme zoom', () => {
    expect(PT.bucketFor(3.1)).toBe(4);
    expect(PT.bucketFor(5.5)).toBe(4);
    expect(PT.bucketFor(6)).toBe(8);
    expect(PT.bucketFor(110)).toBe(128);
    expect(PT.bucketFor(0.01)).toBe(PAPERS.LIMITS.minBucket);
    expect(PT.bucketFor(5000)).toBe(PAPERS.LIMITS.maxBucket);
    // A chunk covers chunkPx / bucket mm — a property of zoom, not sheet size.
    expect(PT.chunkMmFor(4)).toBe(PAPERS.LIMITS.chunkPx / 4);
  });
});
}
}
