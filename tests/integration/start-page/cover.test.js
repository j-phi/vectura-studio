/*
 * Start Page cover + controls (P1): settings persistence (cover style, toggles, motionStill + cookie auto-enable +
 * Undo, rail collapse, color mode / seed), word picker, identity sanitize, the seven-letter cover. Drives the real
 * App through the runtime loader. Art comes from a stubbed StartPageArtSource; ink canvases are stubbed because
 * jsdom has no 2D canvas (the real compositing is covered by the unit + e2e layers).
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;

describe('Start Page cover and controls', () => {
  let runtime; let window; let document; let app; let SETTINGS; let inkCalls;

  const makeArts = (n) => Array.from({ length: n }, (_, i) => ({
    id: `work-${i}`, kind: 'work', name: `Piece ${i + 1}.vectura`, algorithm: ['Rings', 'Terrain', 'Flowfield'][i % 3], collection: 'Studies',
    recentId: `r${i}`, bytes: 1000 + i, ownColors: null, getSvg: async () => SVG(10 + i),
  }));

  const boot = async ({ arts = makeArts(8) } = {}) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    SETTINGS = window.Vectura.SETTINGS;
    inkCalls = { fillWord: [], mount: [], drawIn: [] };
    window.Vectura.StartPageInk = {
      isStill: () => false,
      setMotion: (o) => { inkCalls.motion = o; },
      finish() {},
      unmount() {},
      mount: (el, art, o) => { inkCalls.mount.push({ el, art, o }); el._spInk = { setColorway(cw) { el._cw = cw; } }; el.dataset.spKey = o.colorway.key; return Promise.resolve({}); },
      fillWord: (el, word, art, o) => { inkCalls.fillWord.push({ el, word, art, o }); el._spWord = { setColorway(cw) { el._cw = cw; el.dataset.spKey = cw.key; }, refit() {} }; el.dataset.spKey = o.colorway.key; return Promise.resolve({}); },
      drawIn: (el, o) => { inkCalls.drawIn.push({ el, o }); return Promise.resolve({}); },
    };
    window.Vectura.StartPageArtSource = {
      list: async () => arts, listRecentFirst: async () => arts.slice().reverse(), subscribe: () => () => {},
    };
    app = window.app = new window.Vectura.App();
    await tick();
    app.startPage.show();
    await tick(80);
  };

  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  const sp = () => document.getElementById('start-page');
  const q = (s) => sp().querySelector(s);
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const openSettings = async () => { click(q('#sp-settings-btn')); await tick(); };

  test('the cover sets the word as seven letter buttons, each with its own piece', async () => {
    await boot();
    const letters = [...sp().querySelectorAll('.sp-lt')];
    expect(letters).toHaveLength(7);
    expect(new Set(letters.map((l) => l.dataset.artId)).size).toBe(7);
    expect(letters[0].getAttribute('aria-label')).toMatch(/^V, Piece \d/);
    expect(inkCalls.fillWord.map((c) => c.word).join('')).toBe('Vectura');
    expect(q('.sp-key-row')).toBeTruthy();
  });

  test('cover style changes through Settings and persists', async () => {
    await boot();
    await openSettings();
    const specimen = sp().querySelector('[data-style="word"]');
    click(specimen);
    await tick(80);
    expect(SETTINGS.startPage.coverStyle).toBe('word');
    expect(sp().querySelectorAll('.sp-lt')).toHaveLength(0);
    expect(inkCalls.fillWord.at(-1).word).toBe('Vectura');
    click(sp().querySelector('[data-style="band"]'));
    await tick(80);
    expect(SETTINGS.startPage.coverStyle).toBe('band');
    expect(sp().querySelector('.sp-pf')).toBeTruthy();
    expect(inkCalls.mount.at(-1).o.fit).toBe('cover');
    const snap = app.getPreferenceSnapshot();
    expect(snap.startPage.coverStyle).toBe('band');
  });

  test('name and practice line are hidden by default; the Settings toggles show them', async () => {
    await boot();
    expect(q('.sp-name')).toBeNull();
    expect(q('.sp-line-text')).toBeNull();
    await openSettings();
    click(sp().querySelector('[data-set="showName"]'));
    click(sp().querySelector('[data-set="showLine"]'));
    await tick(50);
    expect(SETTINGS.startPage.showName).toBe(true);
    expect(SETTINGS.startPage.showLine).toBe(true);
    expect(q('.sp-name')).toBeTruthy();
    expect(q('.sp-line-text')).toBeTruthy();
  });

  test('click-to-edit saves through sanitize on Enter and cancels on Escape', async () => {
    await boot();
    SETTINGS.startPage.showName = true;
    app.startPage.render();
    await tick(60);
    click(q('.sp-name .sp-edit-btn'));
    let input = q('.sp-name input');
    expect(input).toBeTruthy();
    input.value = '<b>Ada</b> Quill';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick(40);
    expect(SETTINGS.startPage.name).not.toMatch(/[<>]/);
    expect(SETTINGS.startPage.name).toContain('Quill');
    click(q('.sp-name .sp-edit-btn'));
    input = q('.sp-name input');
    input.value = 'Nope';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await tick(40);
    expect(SETTINGS.startPage.name).not.toBe('Nope');
  });

  test('word picker: choose a word, name-based choices are disabled until a name exists, custom is sanitized', async () => {
    await boot();
    click(q('#sp-word-btn'));
    await tick();
    const items = [...sp().querySelectorAll('#sp-word-menu [role="menuitemradio"]')];
    expect(items.map((i) => i.dataset.word)).toEqual(['vectura', 'vectura-studio', 'last-name', 'first-last', 'studies', 'botanicals', 'experiments', 'custom']);
    expect(items.find((i) => i.dataset.word === 'first-last').getAttribute('aria-disabled')).toBe('true');
    click(items.find((i) => i.dataset.word === 'studies'));
    await tick(80);
    expect(SETTINGS.startPage.coverWord).toBe('studies');
    expect(sp().querySelectorAll('.sp-lt')).toHaveLength(7);
    click(q('#sp-word-btn'));
    await tick();
    click(sp().querySelector('#sp-word-menu [data-word="custom"]'));
    await tick();
    const input = sp().querySelector('#sp-word-menu input');
    input.value = 'Rings<script>';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await tick(80);
    expect(SETTINGS.startPage.coverWord).toBe('custom');
    expect(SETTINGS.startPage.customWord).not.toMatch(/[<>]/);
    expect(inkCalls.fillWord.map((c) => c.word).join('')).toContain('Ringsscript');
  });

  test('Still: persists through the snapshot, auto-enables the cookie, and Undo restores both', async () => {
    await boot();
    SETTINGS.cookiePreferencesEnabled = false;
    click(q('#sp-motion-btn'));
    await tick();
    expect(SETTINGS.startPage.motionStill).toBe(true);
    expect(SETTINGS.cookiePreferencesEnabled).toBe(true);
    expect(inkCalls.motion).toEqual({ still: true });
    expect(q('#sp-motion-btn').getAttribute('aria-pressed')).toBe('true');
    const saved = JSON.parse(window.localStorage.getItem('vectura_prefs'));
    expect(saved.data.startPage.motionStill).toBe(true);
    const undo = document.querySelector('#vectura-toast-host [data-action="undo"]');
    expect(undo).toBeTruthy();
    undo.click();
    await tick();
    expect(SETTINGS.startPage.motionStill).toBe(false);
    expect(SETTINGS.cookiePreferencesEnabled).toBe(false);
    expect(inkCalls.motion).toEqual({ still: false });
  });

  test('rail collapse persists and toggles the strip', async () => {
    await boot();
    expect(sp().dataset.rail).toBe('open');
    click(q('#sp-rail-toggle'));
    await tick();
    expect(SETTINGS.startPage.railCollapsed).toBe(true);
    expect(sp().dataset.rail).toBe('closed');
    expect(q('#sp-rail-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(q('#sp-colo')).toBeTruthy();
    expect(app.getPreferenceSnapshot().startPage.railCollapsed).toBe(true);
    click(q('#sp-rail-toggle'));
    expect(SETTINGS.startPage.railCollapsed).toBe(false);
  });

  test('color modes recolor every letter without re-filling; Randomize seeds a random run', async () => {
    await boot();
    const fills = inkCalls.fillWord.length;
    const before = [...sp().querySelectorAll('.sp-lt .sp-vw')].map((e) => e.dataset.spKey);
    click(q('[data-sp-mode="wildcard"]'));
    await tick(50);
    expect(SETTINGS.startPage.colorMode).toBe('wildcard');
    expect(inkCalls.fillWord.length).toBe(fills);
    const after = [...sp().querySelectorAll('.sp-lt .sp-vw')].map((e) => e.dataset.spKey);
    expect(after).not.toEqual(before);
    click(q('#sp-dice'));
    await tick(50);
    expect(SETTINGS.startPage.seed).toMatch(/^[A-Z0-9]{5}$/);
    expect(q('#sp-dice').getAttribute('aria-pressed')).toBe('true');
    expect(q('.sp-seed').textContent).toBe(SETTINGS.startPage.seed);
    expect(inkCalls.fillWord.length).toBe(fills);
    click(q('[data-sp-mode="mono"]'));
    await tick(50);
    expect(SETTINGS.startPage.seed).toBeNull();
    expect(SETTINGS.startPage.colorMode).toBe('mono');
    expect(q('.sp-own-note').textContent).toMatch(/Mono/);
  });

  test('every tile keeps its resolved colorway available (data-sp-key)', async () => {
    await boot();
    const keys = [...sp().querySelectorAll('.sp-lt .sp-vw')].map((e) => e.dataset.spKey);
    expect(keys).toHaveLength(7);
    keys.forEach((k) => expect(k).toBeTruthy());
  });

  test('with no art the cover says so honestly and still shows the word', async () => {
    await boot({ arts: [] });
    expect(sp().querySelectorAll('.sp-lt')).toHaveLength(0);
    expect(q('.sp-cover-empty')).toBeTruthy();
    expect(q('.sp-cover-empty').textContent).toMatch(/Vectura/);
  });

  test('Launch toggle in Settings stays in sync with Document Setup', async () => {
    await boot();
    await openSettings();
    const sw = sp().querySelector('[data-set="showOnLaunch"]');
    click(sw);
    await tick();
    expect(SETTINGS.startPage.showOnLaunch).toBe(false);
    expect(document.getElementById('set-show-start-page')?.checked ?? false).toBe(false);
  });
});
