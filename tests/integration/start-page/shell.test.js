/*
 * Start Page shell (P0): launch preference + automation rule, startPage preference snapshot, the
 * auto-enable-cookie helper with Undo, File > Open Recent, New Canvas, the Start Page overlay and its
 * three keyboard shortcuts. Drives the real App through the runtime loader (index.html script order).
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Start Page shell', () => {
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

  const toasts = () => [...document.querySelectorAll('#vectura-toast-host .vectura-toast')];
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

  describe('launch preference and automation rule', () => {
    test('defaults to showing; off when the preference is off', async () => {
      await boot();
      expect(SETTINGS.startPage.showOnLaunch).toBe(true);
      expect(app.shouldShowStartPageOnLaunch({ webdriver: false, search: '' })).toBe(true);
      SETTINGS.startPage.showOnLaunch = false;
      expect(app.shouldShowStartPageOnLaunch({ webdriver: false, search: '' })).toBe(false);
    });

    test('automation (navigator.webdriver) skips launch unless ?startPage=launch', async () => {
      await boot();
      expect(app.shouldShowStartPageOnLaunch({ webdriver: true, search: '' })).toBe(false);
      expect(app.shouldShowStartPageOnLaunch({ webdriver: true, search: '?startPage=launch' })).toBe(true);
      SETTINGS.startPage.showOnLaunch = false;
      expect(app.shouldShowStartPageOnLaunch({ webdriver: true, search: '?startPage=launch' })).toBe(false);
    });

    test('showing on launch opens #start-page and inerts the editor', async () => {
      await boot();
      app.showStartPageOnLaunchIfWanted({ webdriver: false, search: '' });
      const sp = document.getElementById('start-page');
      expect(sp).toBeTruthy();
      expect(app.startPage.isOpen()).toBe(true);
      expect(document.getElementById('app-header').hasAttribute('inert')).toBe(true);
      app.startPage.hide({ restoreFocus: false });
      expect(app.startPage.isOpen()).toBe(false);
      expect(document.getElementById('app-header').hasAttribute('inert')).toBe(false);
    });
  });

  describe('startPage preferences', () => {
    test('snapshot carries a sanitized startPage object and round trips', async () => {
      await boot();
      SETTINGS.startPage.name = 'Ada Lovelace';
      SETTINGS.startPage.newPaper = 'Letter';
      const snap = app.getPreferenceSnapshot();
      expect(snap.startPage).toMatchObject({ name: 'Ada Lovelace', newPaper: 'Letter' });
      // Only keys that differ from the defaults are stored: the preference cookie is capped at 4 KB.
      expect(snap.startPage.showOnLaunch).toBeUndefined();
      expect(Object.keys(snap.startPage).sort()).toEqual(['name', 'newPaper']);
      SETTINGS.startPage.name = '';
      SETTINGS.startPage.newPaper = 'A3';
      app.applyPreferenceSnapshot(snap);
      expect(SETTINGS.startPage.name).toBe('Ada Lovelace');
      expect(SETTINGS.startPage.newPaper).toBe('Letter');
      expect(SETTINGS.startPage.showOnLaunch).toBe(true);
    });

    test('hostile or invalid values are sanitized on apply', async () => {
      await boot();
      app.applyPreferenceSnapshot({ startPage: { name: '<img src=x onerror=1>Eve', newPaper: 'Tabloid', showOnLaunch: 'nope', junk: 1 } });
      expect(SETTINGS.startPage.name).not.toMatch(/[<>=]/);
      expect(SETTINGS.startPage.newPaper).toBe('A3');
      expect(SETTINGS.startPage.junk).toBeUndefined();
    });

    test('a partial snapshot without startPage does not wipe it', async () => {
      await boot();
      SETTINGS.startPage.name = 'Keep Me';
      SETTINGS.startPage.showOnLaunch = false;
      app.applyPreferenceSnapshot({ uiTheme: 'dark' });
      expect(SETTINGS.startPage.name).toBe('Keep Me');
      expect(SETTINGS.startPage.showOnLaunch).toBe(false);
    });
  });

  describe('turning the launch setting off', () => {
    test('auto-enables cookie saving, persists, toasts, and Undo restores both', async () => {
      await boot();
      SETTINGS.cookiePreferencesEnabled = false;
      app.setShowStartPageOnLaunch(false);
      expect(SETTINGS.startPage.showOnLaunch).toBe(false);
      expect(SETTINGS.cookiePreferencesEnabled).toBe(true);
      const saved = JSON.parse(window.localStorage.getItem('vectura_prefs'));
      expect(saved.data.startPage.showOnLaunch).toBe(false);
      expect(toasts().map((t) => t.textContent).join(' ')).toMatch(/Document Setup/);
      expect(undoBtn()).toBeTruthy();
      undoBtn().click();
      expect(SETTINGS.startPage.showOnLaunch).toBe(true);
      expect(SETTINGS.cookiePreferencesEnabled).toBe(false);
    });

    test('with cookie saving already on there is no auto-enable toast', async () => {
      await boot();
      SETTINGS.cookiePreferencesEnabled = true;
      app.setShowStartPageOnLaunch(false);
      expect(SETTINGS.startPage.showOnLaunch).toBe(false);
      expect(undoBtn()).toBeNull();
    });

    test('Document Setup switch sits under "Show tour on first launch" and stays in sync', async () => {
      await boot();
      const tour = document.getElementById('set-show-tour');
      const sw = document.getElementById('set-show-start-page');
      expect(sw).toBeTruthy();
      expect(tour.closest('.ctrl-row').nextElementSibling.contains(sw)).toBe(true);
      expect(sw.checked).toBe(true);
      SETTINGS.cookiePreferencesEnabled = false;
      sw.checked = false;
      sw.dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(SETTINGS.startPage.showOnLaunch).toBe(false);
      expect(SETTINGS.cookiePreferencesEnabled).toBe(true);
      expect(document.getElementById('set-cookie-preferences').checked).toBe(true);
      // the Start Page checkbox follows
      app.startPage.show();
      expect(document.querySelector('#start-page [data-pref="showOnLaunch"]').checked).toBe(false);
      document.querySelector('#start-page [data-pref="showOnLaunch"]').checked = true;
      document.querySelector('#start-page [data-pref="showOnLaunch"]').dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(SETTINGS.startPage.showOnLaunch).toBe(true);
      expect(sw.checked).toBe(true);
    });
  });

  describe('File > Open Recent', () => {
    test('File menu carries Start Page and New Canvas at the top and an Open Recent submenu', async () => {
      await boot();
      const panel = document.querySelector('[aria-label="File menu"]');
      const ids = [...panel.querySelectorAll('.top-menu-item:not(.top-menu-back)')].map((b) => b.id);
      expect(ids.slice(0, 2)).toEqual(['btn-start-page', 'btn-new-canvas']);
      expect(ids).toContain('btn-open-recent');
      expect(document.getElementById('btn-open-recent').getAttribute('aria-haspopup')).toBe('menu');
    });

    test('empty state is a disabled "No recent files" row', async () => {
      await boot();
      await app.recents.refresh();
      const rows = document.querySelectorAll('#open-recent-panel [role="menuitem"]');
      expect(rows.length).toBe(1);
      expect(rows[0].disabled).toBe(true);
      expect(rows[0].textContent).toMatch(/No recent files/);
    });

    test('renders name, algorithm and the Alt+Cmd hint; Clear Recent hides them with Undo', async () => {
      await boot();
      await recordRecent('alpha.vectura');
      await tick(5);
      await recordRecent('beta.vectura', { algorithm: 'Terrain' });
      await app.recents.refresh();
      const items = [...document.querySelectorAll('#open-recent-panel [data-recent-id]')];
      expect(items.map((i) => i.querySelector('.recent-name').textContent)).toEqual(['beta.vectura', 'alpha.vectura']);
      expect(items[0].textContent).toMatch(/Terrain/);
      expect(items[0].querySelector('.top-menu-shortcut').dataset.shortcutMac).toBe('Alt+Cmd+1');
      document.getElementById('btn-clear-recent').click();
      await tick();
      expect(document.querySelectorAll('#open-recent-panel [data-recent-id]').length).toBe(0);
      expect(undoBtn()).toBeTruthy();
      undoBtn().click();
      await tick();
      expect(document.querySelectorAll('#open-recent-panel [data-recent-id]').length).toBe(2);
    });

    test('opening a recent applies its stored copy', async () => {
      await boot();
      app.engine.addLayer('wavetable');
      app.engine.addLayer('lissajous');
      const expected = app.engine.layers.map((l) => l.type);
      const entry = await recordRecent('two.vectura');
      app.engine.layers = [];
      expect(app.engine.layers.length).toBe(0);
      app.markDocumentClean(); // reopening asks first when there is unsaved work (covered in review-fixes)
      await app.recents.open(entry.id);
      expect(app.engine.layers.map((l) => l.type)).toEqual(expected);
    });

    test('Alt+Cmd+1 (matched on e.code) opens the newest recent', async () => {
      await boot();
      app.engine.addLayer('wavetable');
      await recordRecent('one.vectura');
      app.engine.layers = [];
      app.markDocumentClean();
      key({ code: 'Digit1', key: '¡', altKey: true, metaKey: true });
      await tick(60);
      expect(app.engine.layers.length).toBe(1);
    });
  });

  describe('New Canvas', () => {
    test('empty document is replaced without a confirm and resets history and paper', async () => {
      await boot();
      const ok = await app.newCanvas({ paper: 'A4' });
      expect(ok).toBe(true);
      expect(SETTINGS.paperSize).toBe('a4');
      expect(app.engine.layers.length).toBe(0);
      expect(app.history.length).toBe(1);
      expect(document.querySelector('.vectura-dialog-msg')).toBeNull();
    });

    test('unsaved changes ask first; cancel keeps the document, confirm replaces it', async () => {
      await boot();
      app.engine.addLayer('wavetable');
      app.pushHistory();
      expect(app.isDocumentDirty()).toBe(true);
      const pending = app.newCanvas({ paper: 'Letter' });
      await tick();
      const msg = document.querySelector('.vectura-dialog-msg');
      expect(msg).toBeTruthy();
      document.querySelector('.vectura-dialog-footer .hdr-btn:not(.is-danger)').click();
      expect(await pending).toBe(false);
      expect(app.engine.layers.length).toBe(1);

      const again = app.newCanvas({ paper: 'Letter' });
      await tick();
      document.querySelector('.vectura-dialog-footer .is-danger, .vectura-dialog-footer .add-btn').click();
      expect(await again).toBe(true);
      expect(app.engine.layers.length).toBe(0);
      expect(SETTINGS.paperSize).toBe('letter');
      expect(app.isDocumentDirty()).toBe(false);
    });

    test('9x12 maps to a custom 9 x 12 in sheet; sizes come from config, not literals', async () => {
      await boot();
      await app.newCanvas({ paper: '9x12' });
      expect(SETTINGS.paperSize).toBe('custom');
      // landscape, matching the chip caption (305 x 229 mm)
      expect(Math.round(SETTINGS.paperWidth)).toBe(305);
      expect(Math.round(SETTINGS.paperHeight)).toBe(229);
    });
  });

  describe('Start Page overlay', () => {
    test('rail: Start, Resume, Recent and the launch checkbox; empty main column', async () => {
      await boot();
      await recordRecent('gamma.vectura');
      app.startPage.show();
      await app.startPage.render();
      const sp = document.getElementById('start-page');
      expect(sp.querySelector('#sp-main')).toBeTruthy();
      expect(sp.textContent).toMatch(/New blank canvas/);
      expect(sp.querySelectorAll('[data-paper]').length).toBe(4);
      expect(sp.textContent).toMatch(/Open file/);
      expect(sp.textContent).toMatch(/Resume/);
      expect(sp.querySelectorAll('[data-recent-id]').length).toBeGreaterThanOrEqual(1);
      expect(sp.querySelector('[data-pref="showOnLaunch"]')).toBeTruthy();
      expect(sp.textContent).toMatch(/Document Setup/);
    });

    test('"Back to canvas" only when the canvas holds a document; wordmark and Shift+Cmd+H navigate', async () => {
      await boot();
      app.startPage.show();
      expect(document.querySelector('#start-page [data-act="back"]').hidden).toBe(true);
      app.startPage.hide({ restoreFocus: false });
      app.engine.addLayer('wavetable');
      app.startPage.show();
      expect(document.querySelector('#start-page [data-act="back"]').hidden).toBe(false);
      document.querySelector('#start-page [data-act="back"]').click();
      expect(app.startPage.isOpen()).toBe(false);
      // editor wordmark opens it
      document.querySelector('#app-header h1').click();
      expect(app.startPage.isOpen()).toBe(true);
      app.startPage.hide({ restoreFocus: false });
      key({ code: 'KeyH', key: 'H', shiftKey: true, metaKey: true });
      expect(app.startPage.isOpen()).toBe(true);
    });

    test('Resume offers "Continue current canvas" first when the editor holds a document', async () => {
      await boot();
      await recordRecent('delta.vectura');
      app.engine.addLayer('wavetable');
      app.startPage.show();
      await app.startPage.render();
      const first = document.querySelector('#start-page [data-resume]');
      expect(first.dataset.resume).toBe('current');
    });

    test('theme toggle in the header reuses App#applyTheme', async () => {
      await boot();
      app.startPage.show();
      const before = SETTINGS.uiTheme;
      document.querySelector('#start-page [data-act="theme"]').click();
      expect(SETTINGS.uiTheme).not.toBe(before);
    });
  });
});
