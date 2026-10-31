/*
 * Show example plates: a switch in Start Page settings > Plates (not an automatic hide). On (default) the examples show
 * after the user's own works; off they are hidden (an empty state when there are no works). The setting is a
 * Start Page pref. Examples are edited and removed like works, a removed one comes back from the Add plate menu, and
 * an edit persists in the plates store under the example's id (the bundled definitions are never mutated).
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;
const work = (n) => ({ id: `work:w${n}`, kind: 'work', name: `mine${n}.vectura`, algorithm: 'Flowfield', collection: 'Studies', recentId: `w${n}`, workId: `w${n}`, bytes: 900, ownColors: null, getSvg: async () => SVG(20 + n) });

describe('Start Page: Show example plates', () => {
  let runtime; let window; let document; let app; let V; let works; let realExamples;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    V = window.Vectura;
    works = [];
    V.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el) => { el._spInk = { setColorway() {}, setFrame() {} }; return Promise.resolve({}); },
      fillWord: (el) => { el._spWord = { setColorway() {}, refit() {} }; return Promise.resolve({}); },
    };
    const real = V.StartPageArtSource;
    realExamples = real.examples();
    V.StartPageArtSource = {
      list: async () => works, listRecentFirst: async () => works.slice(), subscribe: () => () => {},
      examples: () => real.examples().map((a, i) => Object.assign({}, a, { getSvg: async () => SVG(10 + i) })),
    };
    app = window.app = new V.App();
    await tick();
    app.startPage.show();
    await tick(200);
  });

  afterEach(async () => {
    await tick(250);
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  const sp = () => document.getElementById('start-page');
  const q = (s) => sp().querySelector(s);
  const qa = (s) => [...sp().querySelectorAll(s)];
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  const plates = () => qa('.sp-pl:not([data-off])');
  const box = () => q('#sp-settings [data-set="showExamples"]');
  const on = () => box().getAttribute('aria-checked') === 'true';
  const toggle = async (want) => {
    click(q('#sp-settings-btn'));
    if (on() !== want) click(box());
    await tick(300);
    click(q('#sp-settings-btn'));
  };

  test('the switch is in Start Page settings (not the Plates header), on by default, and toggles the examples live', async () => {
    expect(box()).toBeTruthy();
    expect(box().getAttribute('role')).toBe('switch');
    expect(q('#sp-plates #sp-pl-examples')).toBeNull();
    click(q('#sp-settings-btn'));
    expect(on()).toBe(true);
    expect(q('#sp-set-showExamples-l').textContent).toMatch(/Show example plates/i);
    click(q('#sp-settings-btn'));
    expect(plates()).toHaveLength(10);
    await toggle(false);
    expect(plates()).toHaveLength(0);
    expect(q('.sp-pl-empty').hidden).toBe(false); // no works: the honest empty state
    await toggle(true);
    expect(plates()).toHaveLength(10);
    expect(q('.sp-pl-empty').hidden).toBe(true);
  });

  test('the setting is a Start Page pref that survives a re-show', async () => {
    await toggle(false);
    expect(V.SETTINGS.startPage.showExamples).toBe(false);
    expect(V.START_PAGE.sanitize({ showExamples: false }).showExamples).toBe(false);
    expect(V.START_PAGE.sanitize({}).showExamples).toBe(true);
    app.startPage.hide({ restoreFocus: false });
    await tick(60);
    app.startPage.show();
    await tick(300);
    click(q('#sp-settings-btn'));
    expect(on()).toBe(false);
    expect(plates()).toHaveLength(0);
  });

  test('examples mix with works (works first), the count line says so, and unchecking leaves only the works', async () => {
    works = [work(1), work(2)];
    await app.startPage.plates.refresh();
    await tick(150);
    expect(plates()).toHaveLength(12);
    const ps = qa('.sp-pl');
    expect(ps.slice(0, 2).every((w) => !w.dataset.example)).toBe(true);
    expect(ps.slice(2).every((w) => w.dataset.example === '1')).toBe(true);
    expect(q('.sp-pl-count').textContent).toBe('2 works · 10 examples');
    await toggle(false);
    expect(plates()).toHaveLength(2);
    expect(q('.sp-pl-count').textContent).toBe('2 works · in your order');
  });

  test('an example can be edited: the edit persists under its id and the bundled definition is untouched', async () => {
    const w = plates()[0];
    const id = w.dataset.plateId;
    const btn = w.querySelector('[data-act="edit"]');
    expect(btn).toBeTruthy();
    click(btn);
    await tick(150);
    expect(w.dataset.editing).toBe('1');
    const lay = [...document.querySelectorAll('.spe-lay[data-layout]')].find((b) => b.getAttribute('aria-checked') !== 'true');
    expect(lay).toBeTruthy();
    click(lay);
    await tick(150);
    const snap = await app.startPage.plates.store.load();
    const rec = snap.plates.find((r) => r.id === id);
    expect(rec).toBeTruthy();
    expect(rec.layout).toBe(lay.dataset.layout);
    expect(realExamples.find((a) => a.id === id).exampleMeta.layout).not.toBe(lay.dataset.layout); // definitions are never mutated
    expect(qa('.sp-pl')[0].dataset.layout || qa('.sp-pl')[0].querySelector('.spl')?.dataset.layout).toBe(lay.dataset.layout);
  });

  test('an example can be removed in its editor and restored from the Add plate menu', async () => {
    const w = plates()[0];
    const id = w.dataset.plateId;
    click(w.querySelector('[data-act="edit"]'));
    await tick(150);
    click(document.querySelector('[data-spe-remove]'));
    await tick(300);
    expect(plates()).toHaveLength(9);
    expect(qa('.sp-pl').some((x) => x.dataset.plateId === id)).toBe(false);
    click(q('#sp-pl-add'));
    const item = q(`[data-restore-art="${id}"]`);
    expect(item).toBeTruthy();
    click(item);
    await tick(300);
    expect(plates()).toHaveLength(10);
    expect(qa('.sp-pl').some((x) => x.dataset.plateId === id)).toBe(true);
  });
});
