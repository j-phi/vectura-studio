/*
 * Start Page plates: a plate the visitor has already seen comes back drawn, not replayed (scrolling away and back drops
 * and remounts it), and plates lazy-mount whether refresh() or render() reaches the section first.
 * Drives the real App through the runtime loader with a fake IntersectionObserver; Ink / Motion calls are recorded.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;
const EXIT_MS = 1700; // the section drops a plate 1.5 s after it leaves the margin

describe('Start Page plates: remount of a seen plate and the lazy-mount race', () => {
  let runtime; let window; let document; let app; let V; let arts; let ios; let replays; let pre; let mo;

  const makeArts = (n) => Array.from({ length: n }, (_, i) => ({
    id: `work:w${i}`, kind: 'work', name: `piece-${i + 1}.vectura`, algorithm: 'Flowfield', collection: 'Studies',
    recentId: `w${i}`, workId: `w${i}`, bytes: 1000 + i, ownColors: null, getSvg: async () => SVG(10 + i),
  }));

  class FakeIO {
    constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = new Set(); ios.push(this); }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); }
  }
  // the page has other observers (ink, 3D); the plates section's is the one that watches the plate wrapper
  const observers = (el) => ios.filter((o) => o.targets.has(el));
  const fire = (el, isIntersecting) => observers(el).forEach((o) => o.cb([{ target: el, isIntersecting }]));

  const load = async ({ n = 3, refreshFirst = false, withIO = true } = {}) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    V = window.Vectura;
    ios = []; replays = []; pre = 0;
    mo = new window.MutationObserver((recs) => recs.forEach((r) => {
      if (r.target.classList.contains('sp-pre') && !String(r.oldValue || '').split(/\s+/).includes('sp-pre')) pre += 1;
    }));
    mo.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
    if (withIO) window.IntersectionObserver = FakeIO; else delete window.IntersectionObserver;
    arts = makeArts(n);
    V.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el) => { el._spInk = { setColorway() {}, setFrame() {} }; return Promise.resolve({}); },
      fillWord: (el) => { el._spWord = { setColorway() {}, refit() {} }; return Promise.resolve({}); },
    };
    V.StartPageArtSource = { list: async () => arts, listRecentFirst: async () => arts.slice().reverse(), subscribe: () => () => {} };
    V.StartPageMotion.replay = (handle) => { replays.push(handle); return Promise.resolve(handle); };
    V.StartPageOpenArt = { ...V.StartPageOpenArt, FILL_INKS: {}, open: async () => true };
    app = window.app = new V.App();
    await tick();
    if (refreshFirst) {
      // The real race: a works change lands (plates.refresh) while the page is still opening, before plates.render() runs.
      const shown = app.startPage.show();
      for (let i = 0; i < 200 && !app.startPage.plates; i += 1) await tick(0);
      app.startPage.plates.refresh();
      await shown;
    } else app.startPage.show();
    await tick(120);
  };

  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    if (mo) mo.disconnect();
    runtime?.cleanup?.();
    runtime = null;
  });

  const wrap = (i) => document.querySelectorAll('#start-page .sp-pl')[i];
  const main = (w) => w.querySelector('.spl-print');
  const enter = async (w) => { fire(w, true); await tick(60); };
  const leave = async (w) => { fire(w, false); await tick(EXIT_MS); };

  test('a never-seen plate animates in on its first appearance', async () => {
    await load();
    const w = wrap(0);
    expect(w.querySelector('.spl')).toBeNull(); // lazy: nothing built until it is observed on screen
    await enter(w);
    expect(pre).toBeGreaterThan(0); // held blank (sp-pre) until its draw-in starts
    expect(replays).toHaveLength(1);
  });

  test('a plate dropped on exit and re-entered comes back drawn: no sp-pre, no draw-in replay', async () => {
    await load();
    const w = wrap(0);
    await enter(w);
    expect(replays).toHaveLength(1);
    await leave(w);
    expect(w.querySelector('.spl')).toBeNull(); // dropped: the DOM is freed
    expect(w.dataset.state).toBe('idle');
    pre = 0;
    await enter(w);
    expect(w.querySelector('.spl')).not.toBeNull();
    expect(pre).toBe(0); // never blanked
    expect(replays).toHaveLength(1); // still just the first appearance
  });

  test('a plate whose art changed animates in again', async () => {
    await load();
    const store = app.startPage.plates.store;
    await store.upsert('copy1', { artId: 'work:w1' });
    await app.startPage.plates.refresh();
    await tick(60);
    const w = [...document.querySelectorAll('#start-page .sp-pl')].find((x) => x.dataset.plateId === 'copy1');
    await enter(w);
    const before = replays.length;
    await leave(w);
    await store.upsert('copy1', { artId: 'work:w2' });
    await app.startPage.plates.refresh();
    await tick(60);
    pre = 0;
    await enter(w);
    expect(pre).toBeGreaterThan(0);
    expect(replays.length).toBe(before + 1);
  });

  test('a seen live 3D model remounts already plotted (no plot-in)', async () => {
    await load();
    const mounts = [];
    V.StartPageOrbit3D = { ...V.StartPageOrbit3D, mount: (el, o) => { mounts.push(o); return null; }, isScene: () => false };
    V.StartPageMotion.modelFor = () => 'torus';
    const w = wrap(0);
    await enter(w);
    await leave(w);
    await enter(w);
    expect(mounts.length).toBe(2);
    expect(mounts[0].plotted).toBe(false); // first appearance: the model's own plot-in
    expect(mounts[1].plotted).toBe(true); // seen: shown plotted at once
  });

  test('refresh() reaching the section before render(): plates are still observed, mounted on entry and dropped on exit', async () => {
    await load({ refreshFirst: true });
    const w = wrap(0);
    expect(w.querySelector('.spl')).toBeNull(); // not rendered directly
    expect(observers(w)).toHaveLength(1); // observed, so it mounts on entry
    await enter(w);
    expect(w.querySelector('.spl')).not.toBeNull();
    await leave(w);
    expect(w.querySelector('.spl')).toBeNull();
  });

  test('without IntersectionObserver the plates render directly', async () => {
    await load({ withIO: false });
    expect(wrap(0).querySelector('.spl')).not.toBeNull();
  });
});
