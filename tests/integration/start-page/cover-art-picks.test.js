/*
 * Start Page cover art + colorway choices: coverArt / coverColors preferences drive the three cover styles
 * (mosaic per letter, word, band), beat "Use as cover" only when set later (wiring), survive recolor, and expose slots().
 * Same harness as cover.test.js (stubbed StartPageArtSource + StartPageInk).
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;
const CW = { key: 'test:chosen', paper: '#102030', ink: '#e0d0c0', ink2: null, textInk: '#e0d0c0', paperName: 'Night', penName: 'Bone' };

describe('Start Page cover art and colorway choices', () => {
  let runtime; let window; let document; let app; let SETTINGS;

  const makeArts = (n) => Array.from({ length: n }, (_, i) => ({
    id: `work-${i}`, kind: 'work', name: `Piece ${i + 1}.vectura`, algorithm: 'Rings', collection: 'Studies',
    recentId: `r${i}`, bytes: 1000 + i, ownColors: i === 1 ? { paper: '#ffffff', ink: '#000000', paperName: 'White', penName: 'Black' } : null, getSvg: async () => SVG(10 + i),
  }));

  const boot = async (prefs = {}) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    SETTINGS = window.Vectura.SETTINGS;
    const arts = makeArts(9);
    window.Vectura.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {},
      mount: (el, art, o) => { el._spInk = { setColorway(cw) { el.dataset.spKey = cw.key; } }; el.dataset.spKey = o.colorway.key; return Promise.resolve({}); },
      fillWord: (el, word, art, o) => { el._spWord = { setColorway(cw) { el.dataset.spKey = cw.key; }, refit() {} }; el.dataset.spKey = o.colorway.key; return Promise.resolve({}); },
      drawIn: () => Promise.resolve({}),
    };
    window.Vectura.StartPageArtSource = { list: async () => arts, listRecentFirst: async () => arts.slice().reverse(), subscribe: () => () => {} };
    SETTINGS.startPage = window.Vectura.START_PAGE.sanitize(prefs);
    app = window.app = new window.Vectura.App();
    SETTINGS.startPage = window.Vectura.START_PAGE.sanitize({ ...SETTINGS.startPage, ...prefs });
    await tick();
    app.startPage.show();
    await tick(80);
    return arts;
  };
  const rerender = async () => { await app.startPage.render(); await tick(60); };

  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });
  const sp = () => document.getElementById('start-page');
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const letterIds = () => [...sp().querySelectorAll('.sp-lt')].map((l) => l.dataset.artId);
  const cover = () => app.startPage.cover;

  test('word style: the chosen piece fills the word', async () => {
    const arts = await boot({ coverStyle: 'word', coverArt: { word: 'work-5' } });
    expect(sp().querySelector('.sp-xc-word').dataset.artId).toBe(arts[5].id);
    expect(cover().tiles()[0].art.id).toBe('work-5');
  });

  test('band style: the chosen piece is the band', async () => {
    await boot({ coverStyle: 'band', coverArt: { band: 'work-4' } });
    expect(sp().querySelector('.sp-pf').dataset.artId).toBe('work-4');
  });

  test('mosaic: letter 2 carries the chosen piece, duplicates allowed', async () => {
    const base = await boot();
    const auto = letterIds();
    runtime.cleanup(); runtime = null;
    await boot({ coverArt: { mosaic: ['', 'work-8'] } });
    const ids = letterIds();
    expect(ids[1]).toBe('work-8');
    expect(ids[0]).toBe(auto[0]);
    expect(ids[2]).toBe(auto[2]);
    expect(base.length).toBe(9);
  });

  test('an unknown id falls back to automatic', async () => {
    await boot({ coverStyle: 'word' });
    const auto = sp().querySelector('.sp-xc-word').dataset.artId;
    runtime.cleanup(); runtime = null;
    await boot({ coverStyle: 'word', coverArt: { word: 'nope-1' } });
    expect(sp().querySelector('.sp-xc-word').dataset.artId).toBe(auto);
  });

  test('a chosen colorway on the band survives a page colour-mode change (recolor)', async () => {
    await boot({ coverStyle: 'band', coverColors: { band: CW } });
    expect(sp().querySelector('.sp-pf').dataset.spKey).toBe('test:chosen');
    click(sp().querySelector('[data-sp-mode="wildcard"]'));
    await tick(60);
    expect(sp().querySelector('.sp-pf').dataset.spKey).toBe('test:chosen');
    expect(cover().tiles()[0].cw.key).toBe('test:chosen');
  });

  test('a chosen mosaic colorway applies to its letter only and survives recolor', async () => {
    await boot({ coverColors: { mosaic: [null, CW] } });
    const keys = () => [...sp().querySelectorAll('.sp-lt .sp-vw')].map((e) => e.dataset.spKey);
    expect(keys()[1]).toBe('test:chosen');
    expect(keys()[0]).not.toBe('test:chosen');
    click(sp().querySelector('[data-sp-mode="wildcard"]'));
    await tick(60);
    expect(keys()[1]).toBe('test:chosen');
  });

  test('slots() describes the mounted cover', async () => {
    await boot({ coverArt: { mosaic: ['', 'work-3'] }, coverColors: { mosaic: [null, CW] } });
    const slots = cover().slots();
    expect(slots).toHaveLength(7);
    expect(slots[0]).toMatchObject({ k: 0, ch: 'V', chosenId: '', chosenCw: null });
    expect(slots[1]).toMatchObject({ k: 1, ch: 'e', chosenId: 'work-3' });
    expect(slots[1].chosenCw.key).toBe('test:chosen');
    expect(slots[1].art.id).toBe('work-3');
    expect(slots[1].cw.key).toBe('test:chosen');
  });

  test('slots() for word/band is a single slot with no letter', async () => {
    await boot({ coverStyle: 'word', coverArt: { word: 'work-2' } });
    const s = cover().slots();
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ k: 0, ch: '', chosenId: 'work-2' });
  });

  test('setCoverArt / setCoverColor / resetCoverArt write through sanitize and re-render', async () => {
    await boot({ coverStyle: 'word' });
    app.startPage.setCoverArt('word', 0, 'work-6');
    await tick(80);
    expect(SETTINGS.startPage.coverArt.word).toBe('work-6');
    expect(sp().querySelector('.sp-xc-word').dataset.artId).toBe('work-6');
    app.startPage.setCoverColor('word', 0, CW);
    await tick(60);
    expect(SETTINGS.startPage.coverColors.word.key).toBe('test:chosen');
    expect(sp().querySelector('.sp-xc-word').dataset.spKey).toBe('test:chosen');
    app.startPage.resetCoverArt('word');
    await tick(80);
    expect(SETTINGS.startPage.coverArt.word).toBe('');
    expect(SETTINGS.startPage.coverColors.word).toBeNull();
  });
});
