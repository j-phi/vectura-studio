/*
 * Start Page example plates: while the user has no works of their own the Plates section shows five example plates
 * built from bundled presets (pre-rendered art, same plate layouts and colorways), each marked "Example", opening
 * as a NEW unsaved document in the colors shown, and never touching the plates store. They vanish once a work exists.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;

describe('Start Page example plates', () => {
  let runtime; let window; let document; let app; let V; let works; let realOpen;

  const boot = async ({ stubOpen = true } = {}) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    V = window.Vectura;
    works = [];
    V.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el) => { el._spInk = { setColorway(cw) { el._cw = cw; }, setFrame() {} }; return Promise.resolve({}); },
      fillWord: (el) => { el._spWord = { setColorway() {}, refit() {} }; return Promise.resolve({}); },
    };
    const realSource = V.StartPageArtSource;
    // the real example list (ids, names, presets), with the art swapped for a tiny SVG (jsdom has no engine canvas)
    V.StartPageArtSource = {
      list: async () => works, listRecentFirst: async () => works.slice(), subscribe: () => () => {},
      examples: () => realSource.examples().map((a, i) => Object.assign({}, a, { getSvg: async () => SVG(10 + i) })),
    };
    realOpen = V.StartPageOpenArt;
    if (stubOpen) V.StartPageOpenArt = Object.assign({}, realOpen, { open: async (art, colorway, o) => { (boot.calls = boot.calls || []).push({ art, colorway, o }); return true; } });
    boot.calls = [];
    app = window.app = new V.App();
    await tick();
    app.startPage.show();
    await tick(150);
  };

  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  const sp = () => document.getElementById('start-page');
  const q = (s) => sp().querySelector(s);
  const qa = (s) => [...sp().querySelectorAll(s)];
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const live = () => qa('.sp-pl:not([data-off])');

  test('first run shows five marked example plates instead of the empty state', async () => {
    await boot();
    expect(live()).toHaveLength(5);
    expect(qa('.sp-pl[data-example]')).toHaveLength(5);
    expect(q('.sp-pl-empty').hidden).toBe(true);
    live().forEach((w) => { expect(w.querySelector('.sp-pl-example').textContent).toBe('Example'); });
    expect(q('.sp-pl-count').textContent).toMatch(/example/i);
    expect(live().map((w) => w.dataset.layout)).toEqual(['text-wrap', 'spec-sheet', 'vertical-word', 'text-wrap', 'full-bleed-band']);
    live().forEach((w) => { expect(w.dataset.spPaper).toMatch(/^#[0-9a-f]{6}$/); expect(w.dataset.spInk).toMatch(/^#[0-9a-f]{6}$/); });
    expect(live()[0].textContent).toMatch(/Old Growth Oak/);
    expect(live()[1].dataset.cwId).toBe('black-white');
  });

  test('"drag it to turn it" copy appears only on plates with a live 3D model', async () => {
    await boot();
    const ws = live();
    ws.forEach((w) => {
      const live3d = !!w.querySelector('.spl-print[data-model]');
      expect(/drag it to turn it/i.test(w.textContent), w.dataset.plateId).toBe(live3d);
    });
    expect(ws.filter((w) => w.querySelector('.spl-print[data-model]')).map((w) => w.dataset.plateId))
      .toEqual(['example:user-spiralizer-1781359333969', 'example:user-terrain-1781475148727']);
    // a 3D-oriented plate with no live model must not claim to be live
    const art = V.StartPagePlateLayouts.render('text-wrap', {
      plate: { id: 'x', orientation: '3d' }, art: { id: 'x', svg: SVG(10), model: null }, colorway: live()[0] && V.StartPagePlateRhythm.place([{ id: 'x' }], { mode: 'curated', seed: 'a', theme: 'dark' })[0].colorway,
      index: 0, total: 1, texts: { word: 'W', title: 'T', description: 'Desc.', algorithm: 'A', summary: 'A', specs: [], actions: [] }, autoMount: false,
    });
    expect(art.textContent).not.toMatch(/drag it/i);
  });

  test('examples carry no Edit, Remove, Arrange, Add plate, Show or Use as cover', async () => {
    await boot();
    expect(qa('.sp-pl [data-act="edit"]')).toHaveLength(0);
    expect(qa('.sp-pl [data-act="cover"]')).toHaveLength(0);
    expect(qa('.sp-pl [data-act="fan"]')).toHaveLength(5);
    expect(q('#sp-pl-add').hidden).toBe(true);
    expect(q('#sp-pl-arrange').hidden).toBe(true);
    expect(q('.sp-pl-show').hidden).toBe(true);
  });

  test('Open and Open as template have a11y names and pass the colors shown', async () => {
    await boot();
    const w = live()[1];
    const btn = w.querySelector('button[aria-label="Open Cybersigil"]');
    expect(btn).toBeTruthy();
    expect(w.querySelector('button[aria-label^="Open as template"]')).toBeTruthy();
    click(btn);
    await tick(30);
    expect(boot.calls).toHaveLength(1);
    expect(boot.calls[0].art.kind).toBe('pick');
    expect(boot.calls[0].art.presetId).toBeTruthy();
    expect(boot.calls[0].colorway.paper).toBe(w.dataset.spPaper);
    expect(boot.calls[0].colorway.ink).toBe(w.dataset.spInk);
    click(w.querySelector('button[aria-label^="Open as template"]'));
    await tick(30);
    expect(boot.calls[1].o.asTemplate).toBe(true);
  });

  test('opening an example creates a NEW unsaved document in the shown colors', async () => {
    await boot({ stubOpen: false });
    const w = live()[0];
    click(w.querySelector('button[aria-label="Open Old Growth Oak"]'));
    await tick(300);
    expect(app.documentName).toBe('Old Growth Oak (colorway)');
    expect(app.currentRecentId).toBeNull();
    expect(V.SETTINGS.paper.color.toLowerCase()).toBe(w.dataset.spPaper.toLowerCase());
    expect(app.engine.layers.length).toBeGreaterThan(0);
  });

  test('nothing is written to the plates store', async () => {
    await boot();
    const snap = await app.startPage.plates.store.load();
    expect(snap.plates).toHaveLength(0);
    expect(snap.order).toHaveLength(0);
    click(q('.sp-pl [data-act="fan"]'));
    await tick(30);
    expect((await app.startPage.plates.store.load()).plates).toHaveLength(0);
  });

  test('examples are gone as soon as the user has a work, and come back when none remain', async () => {
    await boot();
    expect(qa('.sp-pl[data-example]')).toHaveLength(5);
    works = [{ id: 'work:w1', kind: 'work', name: 'mine.vectura', algorithm: 'Flowfield', collection: 'Studies', recentId: 'w1', workId: 'w1', bytes: 900, ownColors: null, getSvg: async () => SVG(20) }];
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl[data-example]')).toHaveLength(0);
    expect(qa('.sp-pl')).toHaveLength(1);
    expect(q('.sp-pl-example')).toBeNull();
    expect(q('.sp-pl [data-act="edit"]')).toBeTruthy();
    expect(q('#sp-pl-arrange').hidden).toBe(false);
    works = [];
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl[data-example]')).toHaveLength(5);
  });

  test('without an example list the honest empty state stays', async () => {
    await boot();
    V.StartPageArtSource.examples = () => [];
    await app.startPage.plates.refresh();
    await tick(60);
    expect(qa('.sp-pl')).toHaveLength(0);
    expect(q('.sp-pl-empty').hidden).toBe(false);
  });
});
