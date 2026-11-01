/*
 * Start Page P0 review fixes: shortcuts blocked behind the overlay, the file-picker fallback, UTF-8 and
 * size-bounded preference cookies, Save updating the current recent, confirm-before-reopen, New Canvas
 * orientation, recents reopen paths, Undo clearing storage, theme icon, and single refresh per record.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Start Page P0 review fixes', () => {
  let runtime;
  let window;
  let document;
  let app;
  let SETTINGS;

  const boot = async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
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

  const toasts = () => [...document.querySelectorAll('#vectura-toast-host .vectura-toast')].map((t) => t.textContent);
  const undoBtn = () => document.querySelector('#vectura-toast-host [data-action="undo"]');
  const key = (init) => {
    const e = new window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(e);
    return e;
  };
  const recordRecent = (name, extra = {}) => app.recents.record({
    name, source: 'open', algorithm: 'Rings', paper: 'A3', pens: [{ color: '#112233', width: 0.3 }], thumb: null,
    payload: { type: 'vectura', version: 'x', state: app.captureState(), images: {} }, ...extra,
  });
  const cookieOf = () => (window.document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith('vectura_prefs=')) || '');

  describe('1. editor shortcuts are inert behind the Start Page', () => {
    test('Delete, Ctrl+Z and Ctrl+D do nothing while it is open; its own shortcuts still work', async () => {
      await boot();
      app.engine.addLayer('wavetable');
      app.pushHistory();
      const layer = app.engine.layers[0];
      app.renderer.selectLayer?.(layer.id);
      app.startPage.show();
      key({ key: 'Delete', code: 'Delete' });
      key({ key: 'Backspace', code: 'Backspace' });
      key({ key: 'z', code: 'KeyZ', ctrlKey: true });
      key({ key: 'd', code: 'KeyD', ctrlKey: true });
      await tick();
      expect(app.engine.layers.length).toBe(1);
      expect(app.engine.layers[0].id).toBe(layer.id);
      // Shift+Cmd+H still leaves the page (a canvas is live)
      key({ key: 'H', code: 'KeyH', shiftKey: true, metaKey: true });
      expect(app.startPage.isOpen()).toBe(false);
    });
  });

  describe('2. pickVecturaFile with a rejecting showOpenFilePicker', () => {
    test('falls back to the <input type=file> exactly once (forceInput is honored)', async () => {
      await boot();
      const picker = vi.fn(() => Promise.reject(new Error('SecurityError')));
      window.showOpenFilePicker = picker;
      const pick = vi.spyOn(window.Vectura.FilePicker, 'pickFile').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      app.ui.pickVecturaFile({});
      await tick(80);
      expect(picker).toHaveBeenCalledTimes(1);
      expect(pick).toHaveBeenCalledTimes(1);
    });
  });

  describe('3 + 4. preference persistence', () => {
    test('a non-Latin-1 name still writes the cookie, and it reads back', async () => {
      await boot();
      SETTINGS.cookiePreferencesEnabled = true;
      SETTINGS.startPage.name = 'José’s Studio';
      expect(() => app.persistPreferences({ force: true })).not.toThrow();
      expect(cookieOf()).not.toBe('');
      window.localStorage.removeItem('vectura_prefs');
      SETTINGS.startPage.name = '';
      app.applyPreferencesFromCookie();
      expect(SETTINGS.startPage.name).toBe('José’s Studio');
    });

    test('a legacy ASCII base64 cookie is still readable', async () => {
      await boot();
      window.localStorage.removeItem('vectura_prefs');
      const json = JSON.stringify({ version: 1, data: { startPage: { name: 'Legacy' } } });
      window.document.cookie = `vectura_prefs=${window.btoa(json)}; Path=/`;
      app.applyPreferencesFromCookie();
      expect(SETTINGS.startPage.name).toBe('Legacy');
    });

    test('with every identity field at max length the cookie stays under 4,000 bytes; localStorage keeps it all', async () => {
      await boot();
      SETTINGS.cookiePreferencesEnabled = true;
      SETTINGS.startPage.showOnLaunch = false;
      SETTINGS.startPage.motionStill = true;
      SETTINGS.startPage.name = 'N'.repeat(60);
      SETTINGS.startPage.practiceLine = 'P'.repeat(120);
      SETTINGS.startPage.customWord = 'W'.repeat(24);
      // A real-world snapshot is already ~3.9 KB encoded: pad the bulky optional keys to reproduce that.
      const real = app.getPreferenceSnapshot.bind(app);
      app.getPreferenceSnapshot = () => ({ ...real(), uiSections: { pad: 'x'.repeat(500) }, autoColorization: { pad: 'y'.repeat(400) } });
      app.persistPreferences({ force: true });
      const cookie = cookieOf();
      expect(cookie).not.toBe('');
      expect(cookie.length).toBeLessThan(4000);
      const full = JSON.parse(window.localStorage.getItem('vectura_prefs'));
      expect(full.data.startPage.name).toBe('N'.repeat(60));
      const raw = cookie.slice('vectura_prefs='.length);
      const inCookie = JSON.parse(decodeURIComponent(escape(window.atob(raw)))).data;
      expect(inCookie.cookiePreferencesEnabled).toBe(true);
      expect(inCookie.startPage.showOnLaunch).toBe(false);
      expect(inCookie.startPage.motionStill).toBe(true);
    });
  });

  describe('5. Save updates the current recent', () => {
    const save = async () => {
      app.ui.saveVecturaFile();
      await tick(80);
      await app.recents.refresh();
    };
    test('two saves the same day are one recent; a Save after New Canvas is a new one', async () => {
      await boot();
      window.Vectura.Download.saveBlob = () => Promise.resolve('saved');
      app.engine.addLayer('wavetable');
      await save();
      expect(app.recents.list().length).toBe(1);
      app.engine.addLayer('lissajous');
      await save();
      expect(app.recents.list().length).toBe(1);
      await app.newCanvas({ paper: 'A4', confirm: false });
      app.engine.addLayer('rings');
      await save();
      expect(app.recents.list().length).toBe(2);
    });
  });

  describe('6. reopening a recent asks before replacing unsaved work', () => {
    test('cancel keeps the canvas; confirm opens the recent', async () => {
      await boot();
      app.engine.addLayer('wavetable');
      const entry = await recordRecent('one.vectura');
      app.engine.addLayer('lissajous'); // unsaved change
      expect(app.isDocumentDirty()).toBe(true);
      const pending = app.recents.open(entry.id);
      await tick();
      expect(document.querySelector('.vectura-dialog-msg')).toBeTruthy();
      document.querySelector('.vectura-dialog-footer .hdr-btn:not(.is-danger)').click();
      expect(await pending).toBe(false);
      expect(app.engine.layers.length).toBe(2);
      const again = app.recents.open(entry.id);
      await tick();
      document.querySelector('.vectura-dialog-footer .is-danger, .vectura-dialog-footer .add-btn').click();
      expect(await again).toBe(true);
      expect(app.engine.layers.length).toBe(1);
    });
  });

  describe('7. New Canvas orientation matches the caption', () => {
    test('A3 from a portrait document is 420 x 297 landscape', async () => {
      await boot();
      SETTINGS.paperOrientation = 'portrait';
      await app.newCanvas({ paper: 'A3', confirm: false });
      expect(SETTINGS.paperOrientation).toBe('landscape');
      expect(app.engine.currentProfile.width).toBe(420);
      expect(app.engine.currentProfile.height).toBe(297);
      SETTINGS.paperOrientation = 'portrait';
      await app.newCanvas({ paper: '9x12', confirm: false });
      expect(app.engine.currentProfile.width).toBeGreaterThan(app.engine.currentProfile.height);
    });
  });

  describe('7b. New Canvas is a standard canvas, whatever was opened before', () => {
    test('a plate opened in a vivid colorway does not carry its paper or pens into New blank canvas', async () => {
      await boot();
      await app.newCanvas({ paper: 'A3', confirm: false });
      const clean = { paper: SETTINGS.paper.color, bg: SETTINGS.bgColor, pens: JSON.stringify(SETTINGS.pens.map((p) => [p.id, p.color, p.width, !!p.themeManaged])) };
      const preset = (window.Vectura.PRESETS || []).find((p) => p && /^rings-/.test(p.id)) || window.Vectura.PRESETS[0];
      const vivid = { key: 'vivid', paper: '#ff00aa', ink: '#00ff66', ink2: null };
      const ok = await window.Vectura.StartPageOpenArt.open({ kind: 'pick', id: `pick:${preset.id}`, presetId: preset.id, name: 'Vivid' }, vivid, { app });
      expect(ok).toBe(true);
      expect(SETTINGS.paper.color.toLowerCase()).toBe('#ff00aa');
      expect(SETTINGS.pens.some((p) => p.color.toLowerCase() === '#00ff66')).toBe(true);
      await app.newCanvas({ paper: 'A3', confirm: false });
      expect(app.engine.layers).toHaveLength(0);
      expect(SETTINGS.paper.color).toBe(clean.paper);
      expect(SETTINGS.bgColor).toBe(clean.bg);
      expect(JSON.stringify(SETTINGS.pens.map((p) => [p.id, p.color, p.width, !!p.themeManaged]))).toBe(clean.pens);
      expect(SETTINGS.pens.some((p) => p.color.toLowerCase() === '#00ff66')).toBe(false);
      expect(SETTINGS.startPageFill).toBeUndefined();
    });

    test("New Canvas uses the user's default paper when one is set", async () => {
      await boot();
      app.setPaperDefault({ ...window.Vectura.Paper.builtinDefault(), type: 'none', color: '#f4efe2' });
      window.Vectura.Paper.setActive({ ...SETTINGS.paper, type: 'none', color: '#123456' }, { render: false });
      await app.newCanvas({ paper: 'A4', confirm: false });
      expect(SETTINGS.paper.color.toLowerCase()).toBe('#f4efe2');
    });
  });

  describe('9. recents reopen paths, Save recording, Undo', () => {
    test('a stored file handle is tried first', async () => {
      await boot();
      app.engine.addLayer('wavetable');
      const payload = { type: 'vectura', version: 'x', state: app.captureState(), images: {} };
      const file = new window.File([JSON.stringify(payload)], 'h.vectura');
      const handle = { getFile: vi.fn(async () => file), queryPermission: vi.fn(async () => 'granted'), isSameEntry: async () => false };
      const entry = await recordRecent('h.vectura', { handle });
      app.markDocumentClean();
      const spy = vi.spyOn(app.ui, 'openVecturaFile').mockImplementation(() => {});
      expect(await app.recents.open(entry.id)).toBe(true);
      expect(handle.getFile).toHaveBeenCalled();
      expect(spy).toHaveBeenCalledWith(file, expect.objectContaining({ handle }));
    });

    test('without a handle the stored copy opens with the "Opened your saved copy" toast', async () => {
      await boot();
      app.engine.addLayer('wavetable');
      const entry = await recordRecent('c.vectura');
      app.engine.layers = [];
      app.markDocumentClean();
      expect(await app.recents.open(entry.id)).toBe(true);
      expect(app.engine.layers.length).toBe(1);
      expect(toasts().join(' ')).toMatch(/Opened your saved copy from/);
    });

    test('Save records a recent with source "save"', async () => {
      await boot();
      window.Vectura.Download.saveBlob = () => Promise.resolve('saved');
      app.engine.addLayer('wavetable');
      app.ui.saveVecturaFile();
      await tick(80);
      await app.recents.refresh();
      const [e] = app.recents.list();
      expect(e.source).toBe('save');
      expect(e.name).toMatch(/^vectura-\d{4}-\d{2}-\d{2}\.vectura$/);
    });

    test('Undo of the auto-enable toast clears localStorage and the cookie', async () => {
      await boot();
      SETTINGS.cookiePreferencesEnabled = false;
      app.setShowStartPageOnLaunch(false);
      expect(window.localStorage.getItem('vectura_prefs')).toBeTruthy();
      expect(cookieOf()).not.toBe('');
      undoBtn().click();
      expect(window.localStorage.getItem('vectura_prefs')).toBeNull();
      expect(cookieOf()).toBe('');
      expect(SETTINGS.cookiePreferencesEnabled).toBe(false);
    });
  });

  describe('10. theme icon follows the theme manifest', () => {
    test('lark (dark chrome) is not light; light is light', async () => {
      await boot();
      app.startPage.show();
      const sp = document.getElementById('start-page');
      app.applyTheme('lark', { persist: false });
      app.startPage.syncTheme?.();
      expect(sp.dataset.light).toBe('false');
      app.applyTheme('light', { persist: false });
      app.startPage.syncTheme?.();
      expect(sp.dataset.light).toBe('true');
    });
  });

  describe('11. one refresh per record', () => {
    test('record renders the menu and notifies subscribers once', async () => {
      await boot();
      await app.recents.refresh();
      let renders = 0;
      let emits = 0;
      const original = app.recents.renderMenu;
      app.recents.renderMenu = (...a) => { renders += 1; return original(...a); };
      app.recents.subscribe(() => { emits += 1; });
      await recordRecent('once.vectura');
      await tick(40);
      expect(renders).toBe(1);
      expect(emits).toBe(1);
    });
  });
});
