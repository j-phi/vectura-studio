/*
 * Start Page P4 "data lane" review fixes: reopen keeps the recent's identity and name, a Save after Open keeps the
 * file's name, a handle reopen validates before it hides the page, New Canvas drops the opened piece's fill stash,
 * the preference cookie falls back to a minimal payload, the editor wordmark is a real button.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Start Page P4 data fixes', () => {
  let runtime;
  let window;
  let document;
  let app;
  let SETTINGS;

  const boot = async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
    SETTINGS = window.Vectura.SETTINGS;
    await tick();
  };
  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });
  const docOf = () => ({ type: 'vectura', version: 'x', state: app.captureState(), images: {} });
  const recordRecent = (name, extra = {}) => app.recents.record({
    name, source: 'open', algorithm: 'Rings', paper: 'A3', pens: [{ color: '#112233', width: 0.3 }], thumb: null, payload: docOf(), ...extra,
  });
  const cookieOf = () => (window.document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith('vectura_prefs=')) || '');

  test('3. reopening from the stored copy updates that recent in place (same id, no duplicate)', async () => {
    await boot();
    app.engine.addLayer('wavetable');
    const entry = await recordRecent('keep.vectura');
    app.engine.layers = [];
    app.markDocumentClean();
    expect(await app.recents.open(entry.id)).toBe(true);
    await app.recents.refresh();
    const list = await app.recents.store.listWorks();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(entry.id);
    expect(app.currentRecentId).toBe(entry.id);
  });

  test('4. opening a file names the document, so Save keeps the file name and the recent keeps its name', async () => {
    await boot();
    app.engine.addLayer('wavetable');
    const payload = docOf();
    const file = new window.File([JSON.stringify(payload)], 'Riverbed.vectura');
    app.ui.openVecturaFile(file);
    await tick(120);
    expect(app.documentName).toBe('Riverbed');
    const saved = [];
    window.Vectura.Download.saveBlob = (blob, filename) => { saved.push(filename); return Promise.resolve('saved'); };
    app.ui.saveVecturaFile();
    await tick(120);
    expect(saved).toEqual(['Riverbed.vectura']);
    await app.recents.refresh();
    const names = (await app.recents.store.listWorks()).map((e) => e.name);
    expect(names).toEqual(['Riverbed.vectura']);
  });

  test('4b. reopening a recent from its stored copy names the document after the recent', async () => {
    await boot();
    app.engine.addLayer('wavetable');
    const entry = await recordRecent('Kept.vectura');
    app.engine.layers = [];
    app.markDocumentClean();
    expect(await app.recents.open(entry.id)).toBe(true);
    expect(app.documentName).toBe('Kept');
  });

  test('18. a handle that yields an invalid file falls back to the stored copy and hides the page only on success', async () => {
    await boot();
    app.engine.addLayer('wavetable');
    const bad = new window.File(['not json at all'], 'gone.vectura');
    const handle = { getFile: async () => bad, queryPermission: async () => 'granted', isSameEntry: async () => false };
    const entry = await recordRecent('gone.vectura', { handle });
    app.engine.layers = [];
    app.markDocumentClean();
    app.startPage.show();
    const hide = vi.spyOn(app.startPage, 'hide');
    const calls = [];
    hide.mockImplementation(() => { calls.push('hide'); });
    expect(await app.recents.open(entry.id)).toBe(true);
    expect(app.engine.layers.length).toBe(1);
    // the unreadable file never hid the page: the one hide belongs to the stored copy that actually opened
    expect(calls).toEqual(['hide']);
    const toastText = [...document.querySelectorAll('#vectura-toast-host .vectura-toast')].map((t) => t.textContent).join(' ');
    expect(toastText).toMatch(/saved copy/);
    expect(document.querySelector('.modal-text')?.textContent || '').not.toMatch(/could not be loaded/);
  });

  test('10. New Canvas drops the opened piece\'s special-fill stash', async () => {
    await boot();
    SETTINGS.startPageFill = { kind: 'sunset', ink: '#e8603c', ink2: null };
    await app.newCanvas({ paper: 'A4', confirm: false });
    expect(SETTINGS.startPageFill).toBeUndefined();
    expect(app.captureState().settings.startPageFill).toBeUndefined();
  });

  test('17. a cookie still too big after trimming falls back to a minimal payload', async () => {
    await boot();
    SETTINGS.cookiePreferencesEnabled = true;
    SETTINGS.startPage.showOnLaunch = false;
    SETTINGS.startPage.motionStill = true;
    const real = app.getPreferenceSnapshot.bind(app);
    app.getPreferenceSnapshot = () => ({ ...real(), bulky: 'z'.repeat(6000) });
    app.persistPreferences({ force: true });
    const cookie = cookieOf();
    expect(cookie).not.toBe('');
    expect(cookie.length).toBeLessThan(4000);
    const raw = cookie.slice('vectura_prefs='.length);
    const data = JSON.parse(decodeURIComponent(escape(window.atob(raw)))).data;
    expect(data.cookiePreferencesEnabled).toBe(true);
    expect(data.startPage.showOnLaunch).toBe(false);
    expect(data.startPage.motionStill).toBe(true);
    expect(data.bulky).toBeUndefined();
  });

  test('16. the editor wordmark is a real, focusable button that opens the Start Page', async () => {
    await boot();
    const h1 = document.querySelector('#app-header h1');
    const btn = h1.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn.tabIndex).toBe(0);
    expect(btn.textContent.trim().length).toBeGreaterThan(0);
    btn.click();
    expect(app.startPage.isOpen()).toBe(true);
  });

  test('thumbSrc encodes a given SVG once and reuses the data URI', async () => {
    await boot();
    const enc = vi.spyOn(window, 'encodeURIComponent');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L${Math.random()} 5"/></svg>`;
    const entry = { thumb: { kind: 'svg', data: svg } };
    const a = app.recents.thumbSrc(entry);
    const calls = enc.mock.calls.length;
    const b = app.recents.thumbSrc({ thumb: { kind: 'svg', data: svg } });
    expect(b).toBe(a);
    expect(enc.mock.calls.length).toBe(calls);
    enc.mockRestore();
  });
});
