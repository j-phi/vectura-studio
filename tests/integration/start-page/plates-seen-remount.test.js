/*
 * Start Page plates: a plate the visitor has already seen comes back drawn, not replayed (scrolling away and back drops
 * and remounts it), and plates lazy-mount whether refresh() or render() reaches the section first.
 * Drives the real App through the runtime loader with a fake IntersectionObserver; Ink / Motion calls are recorded.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;
const IDLE_MS = 60; // test override of START_PAGE.PLATE_DROP.idleMs
// a list this short never drops; the tests that exercise dropping lower minPlates
const DROPS = { minPlates: 1, screens: 3, idleMs: IDLE_MS };

describe('Start Page plates: remount of a seen plate, the drop rules and the lazy-mount race', () => {
  let runtime; let window; let document; let app; let V; let arts; let ios; let svgCalls; let maxInflight; let sampler; let replays; let pre; let mo;

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
  // two observers watch a plate: the lazy-mount one (800 px margin) and the drop one (screens x viewport heights)
  const nearOf = (el) => observers(el).find((o) => /px/.test(o.opts.rootMargin));
  const farOf = (el) => observers(el).find((o) => /%/.test(o.opts.rootMargin));
  const fire = (el, isIntersecting) => nearOf(el).cb([{ target: el, isIntersecting }]);
  const fireFar = (el, isIntersecting) => farOf(el).cb([{ target: el, isIntersecting }]);

  const load = async ({ n = 3, refreshFirst = false, withIO = true, drop = DROPS, premount = { enabled: false }, slow = false, setup = null } = {}) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    V = window.Vectura;
    if (setup) setup(window);
    V.START_PAGE = { ...V.START_PAGE, ...(drop ? { PLATE_DROP: drop } : {}), PLATE_PREMOUNT: { idleTimeoutMs: 2000, fallbackMs: 20, ...premount } };
    ios = []; replays = []; pre = 0;
    mo = new window.MutationObserver((recs) => recs.forEach((r) => {
      if (r.target.classList.contains('sp-pre') && !String(r.oldValue || '').split(/\s+/).includes('sp-pre')) pre += 1;
    }));
    mo.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class'] });
    if (withIO) window.IntersectionObserver = FakeIO; else delete window.IntersectionObserver;
    arts = makeArts(n);
    svgCalls = []; maxInflight = 0;
    if (slow) arts.forEach((a, i) => { a.getSvg = async () => { await tick(15); return SVG(10 + i); }; });
    // sample which plates are mid-render (renderPlate fetching its svg): the order they start in, and how many overlap
    clearInterval(sampler); const seenRender = new Set();
    sampler = setInterval(() => {
      const busy = [...document.querySelectorAll('#start-page .sp-pl')].filter((w) => w._sp && w._sp.rendering);
      maxInflight = Math.max(maxInflight, busy.length);
      busy.forEach((w) => { if (!seenRender.has(w)) { seenRender.add(w); svgCalls.push(+w.dataset.index); } });
    }, 1);
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
    clearInterval(sampler);
    if (mo) mo.disconnect();
    runtime?.cleanup?.();
    runtime = null;
  });

  const wrap = (i) => document.querySelectorAll('#start-page .sp-pl')[i];
  const main = (w) => w.querySelector('.spl-print');
  const enter = async (w) => { fireFar(w, true); fire(w, true); await tick(60); };
  // the plate's art (.spl-print) scrolled to >= 30 % in view: its animate-in observer fires (animate-in plays on scroll, not on mount)
  const see = async (w) => { const m = main(w); observers(m).filter((o) => o.opts.threshold).forEach((o) => o.cb([{ target: m, isIntersecting: true, intersectionRatio: 0.5 }])); await tick(60); };
  const leave = async (w) => { fireFar(w, false); await tick(IDLE_MS + 60); };

  test('a never-seen plate animates in on its first appearance', async () => {
    await load();
    const w = wrap(0);
    expect(w.querySelector('.spl')).toBeNull(); // lazy: nothing built until it is observed on screen
    await enter(w);
    expect(pre).toBeGreaterThan(0); // held blank (sp-pre) until its draw-in starts
    expect(replays).toHaveLength(0); // ...which waits for the art to be scrolled into view (>= 30 %)
    expect(main(w).classList.contains('sp-pre')).toBe(true);
    await see(w);
    expect(replays).toHaveLength(1);
  });

  // RED (before the fix): the draw-in played at mount time, so a plate mounted ahead of the viewport was already finished
  // (replays 1, no sp-pre) by the time it was scrolled to.
  test('a plate mounted below the fold is still undrawn until it scrolls into view, then plays once', async () => {
    await load();
    const w = wrap(0);
    await enter(w); // mounted by the lazy margin / pre-mount, not yet 30 % visible
    await tick(120);
    expect(replays).toHaveLength(0);
    expect(main(w).classList.contains('sp-pre')).toBe(true);
    await see(w);
    expect(replays).toHaveLength(1);
    expect(main(w).classList.contains('sp-pre')).toBe(false);
    await see(w); // once per page view
    expect(replays).toHaveLength(1);
  });

  test('a plate dropped before it was ever seen is still undrawn when it comes back', async () => {
    await load();
    const w = wrap(0);
    await enter(w);
    await leave(w);
    pre = 0;
    await enter(w);
    expect(pre).toBeGreaterThan(0);
    expect(replays).toHaveLength(0);
    await see(w);
    expect(replays).toHaveLength(1);
  });

  test('Still / animate-in None: the plate is shown finished at once, never held', async () => {
    await load();
    V.StartPageInk.isStill = () => true;
    V.StartPageMotion.isStill = () => true;
    const w = wrap(0);
    await enter(w);
    expect(pre).toBe(0);
    expect(main(w).classList.contains('sp-pre')).toBe(false);
  });

  test('a plate dropped on exit and re-entered comes back drawn: no sp-pre, no draw-in replay', async () => {
    await load();
    const w = wrap(0);
    await enter(w);
    await see(w);
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
    await see(w);
    const before = replays.length;
    await leave(w);
    await store.upsert('copy1', { artId: 'work:w2' });
    await app.startPage.plates.refresh();
    await tick(60);
    pre = 0;
    await enter(w);
    expect(pre).toBeGreaterThan(0);
    await see(w);
    expect(replays.length).toBe(before + 1);
  });

  test('a seen live 3D model remounts already plotted (no plot-in)', async () => {
    await load();
    const mounts = [];
    V.StartPageOrbit3D = { ...V.StartPageOrbit3D, mount: (el, o) => { mounts.push(o); return null; }, isScene: () => false };
    V.StartPageMotion.modelFor = () => 'torus';
    const w = wrap(0);
    await enter(w);
    await see(w);
    await leave(w);
    await enter(w);
    expect(mounts.length).toBe(2);
    expect(mounts[0].plotted).toBe(false); // first appearance: the model's own plot-in
    expect(mounts[1].plotted).toBe(true); // seen: shown plotted at once
  });

  test('a 3D Scene plate mounts no orbit model: a still drawing that animates in when seen', async () => {
    await load();
    const mounts = [];
    V.StartPageOrbit3D = { ...V.StartPageOrbit3D, mount: (el, o) => { mounts.push(o); return null; } };
    V.StartPageMotion.modelFor = () => 'scene:demo';
    const w = wrap(0);
    await enter(w);
    expect(mounts).toHaveLength(0);
    expect(w.querySelector('.spl-print')._spInk).toBeTruthy();
    expect(replays).toHaveLength(0);
    await see(w);
    expect(replays).toHaveLength(1);
  });

  test('refresh() reaching the section before render(): plates are still observed, mounted on entry and dropped when far', async () => {
    await load({ refreshFirst: true });
    const w = wrap(0);
    expect(w.querySelector('.spl')).toBeNull(); // not rendered directly
    expect(observers(w)).toHaveLength(2); // observed (mount + drop), so it mounts on entry
    await enter(w);
    expect(w.querySelector('.spl')).not.toBeNull();
    await leave(w);
    expect(w.querySelector('.spl')).toBeNull();
  });

  test('leaving the lazy-mount margin alone never drops a plate', async () => {
    await load();
    const w = wrap(0);
    await enter(w);
    fire(w, false);
    await tick(IDLE_MS + 100);
    expect(w.querySelector('.spl')).not.toBeNull();
  });

  test('a short list never drops, however long a plate stays far away', async () => {
    await load({ n: 3, drop: { minPlates: 24, screens: 3, idleMs: IDLE_MS } });
    const w = wrap(0);
    await enter(w);
    fireFar(w, false);
    await tick(IDLE_MS * 4);
    expect(w.querySelector('.spl')).not.toBeNull();
    expect(w.dataset.state).toBe('ready');
  });

  test('a long list drops a far plate only after the idle delay, and returning in time keeps it', async () => {
    await load({ n: 4, drop: { minPlates: 4, screens: 3, idleMs: 200 } });
    const w = wrap(0);
    await enter(w);
    fireFar(w, false);
    await tick(80);
    expect(w.querySelector('.spl')).not.toBeNull(); // not yet idle long enough
    fireFar(w, true); // came back within the idle delay
    await tick(250);
    expect(w.querySelector('.spl')).not.toBeNull();
    fireFar(w, false);
    await tick(320);
    expect(w.querySelector('.spl')).toBeNull(); // far and idle: dropped
    expect(w.dataset.state).toBe('idle');
  });

  test('the drop observer margin is screens x the viewport height; mounting keeps the 800 px margin', async () => {
    await load({ drop: { minPlates: 1, screens: 2, idleMs: IDLE_MS } });
    const w = wrap(0);
    expect(nearOf(w).opts.rootMargin).toBe('800px 0px');
    expect(farOf(w).opts.rootMargin).toBe('200% 0px');
  });

  test('a plate mounted while out of view (never reported far-then-near) still becomes eligible to drop', async () => {
    await load({ n: 4, drop: { minPlates: 4, screens: 3, idleMs: 100 } });
    const w = wrap(1);
    fireFar(w, false); // the first pass: the drop observer reports it far while nothing is mounted yet
    fire(w, true); // the mount observer builds it (the drop observer still says far)
    await tick(60);
    expect(w.querySelector('.spl')).not.toBeNull();
    await tick(250);
    expect(w.querySelector('.spl')).toBeNull();
  });

  describe('placeholder', () => {
    const stubRects = (plateH) => {
      const proto = window.HTMLElement.prototype;
      const orig = proto.getBoundingClientRect;
      proto.getBoundingClientRect = function rect() {
        if (this.classList && this.classList.contains('sp-pl')) return { top: 0, bottom: plateH, height: plateH, left: 0, right: 100, width: 100 };
        return orig.call(this);
      };
      return () => { proto.getBoundingClientRect = orig; };
    };

    test('is the dropped plate\'s exact height and carries its paper colour', async () => {
      await load();
      const restore = stubRects(612);
      try {
        const w = wrap(0);
        await enter(w);
        expect(w.dataset.spPaper).toMatch(/^#[0-9a-f]{6}$/i);
        await leave(w);
        expect(w.style.getPropertyValue('--sp-pl-h')).toBe('612px');
        const ph = w.querySelector('.sp-pl-ph');
        expect(ph).not.toBeNull();
        expect(ph.style.getPropertyValue('--sp-ph-paper')).toBe(w.dataset.spPaper);
        expect(ph.textContent).toMatch(/Plate 01/); // keeps its label
      } finally { restore(); }
    });

    test('the stylesheet makes plate box, placeholder and padding agree in both box-sizing modes', () => {
      const css = require('fs').readFileSync(require('path').join(__dirname, '../../../src/ui/skin/components.css'), 'utf8');
      const inRule = css.match(/\n\.sp-pl-in \{[^}]*\}/)[0];
      expect(inRule).toMatch(/box-sizing:\s*border-box/);
      expect(inRule).toMatch(/padding-bottom:\s*var\(--sp-pl-pad\)/);
      const phRule = css.match(/\n\.sp-pl-ph \{[^}]*\}/)[0];
      expect(phRule).toMatch(/box-sizing:\s*border-box/);
      expect(phRule).toMatch(/min-height:\s*calc\(var\(--sp-pl-h[^)]*\)\s*-\s*var\(--sp-pl-pad\)\)/);
      expect(phRule).toMatch(/background:\s*var\(--sp-ph-paper/);
    });
  });

  describe('live 3D first mount', () => {
    const stubGeometry = (plateTop) => {
      const proto = window.HTMLElement.prototype;
      const orig = proto.getBoundingClientRect;
      proto.getBoundingClientRect = function rect() {
        if (this.classList && this.classList.contains('sp-pl')) return { top: plateTop, bottom: plateTop + 600, height: 600, left: 0, right: 100, width: 100 };
        if (this.id === 'sp-scroll') return { top: 0, bottom: 800, height: 800, left: 0, right: 100, width: 100 };
        return orig.call(this);
      };
      return () => { proto.getBoundingClientRect = orig; };
    };
    const run = async (plateTop) => {
      await load();
      const mounts = [];
      V.StartPageOrbit3D = { ...V.StartPageOrbit3D, mount: (el, o) => { mounts.push(o); return null; }, isScene: () => false };
      V.StartPageMotion.modelFor = () => 'torus';
      const restore = stubGeometry(plateTop);
      try { await enter(wrap(0)); } finally { restore(); }
      return mounts;
    };

    test('mounting off screen (inside the margin) still plots in when it scrolls into view', async () => {
      const mounts = await run(1200); // below the 800 px viewport, inside the 800 px mount margin
      expect(mounts).toHaveLength(1);
      expect(mounts[0].plotted).toBe(false); // the model's own plot-in waits for 30 % visible
    });

    test('mounting in view plots in as before', async () => {
      const mounts = await run(100);
      expect(mounts).toHaveLength(1);
      expect(mounts[0].plotted).toBe(false);
    });
  });

  describe('pre-mount of a short list in idle time', () => {
    const PRE = { enabled: true, idleTimeoutMs: 2000, fallbackMs: 20 };
    const settle = async (ms = 700) => tick(ms);
    const mountedCount = () => document.querySelectorAll('#start-page .sp-pl .spl').length;

    test('mounts every plate one at a time via requestIdleCallback, never two renders in flight', async () => {
      const idle = [];
      await load({ n: 4, drop: { minPlates: 24, screens: 3, idleMs: IDLE_MS }, premount: PRE, slow: true, setup: (win) => {
        win.requestIdleCallback = (cb, o) => { idle.push(o); return setTimeout(() => cb({ didTimeout: false }), 5); };
        win.cancelIdleCallback = (id) => clearTimeout(id);
      } });
      await settle(900);
      expect(idle.length).toBeGreaterThan(0);
      expect(idle[0]).toEqual({ timeout: 2000 });
      expect(mountedCount()).toBe(4); // nobody scrolled: no observer fired
      expect(maxInflight).toBe(1);
      expect(svgCalls).toHaveLength(4);
    });

    test('falls back to a timer where requestIdleCallback is missing', async () => {
      await load({ n: 3, drop: { minPlates: 24, screens: 3, idleMs: IDLE_MS }, premount: PRE, slow: true });
      await settle();
      expect(mountedCount()).toBe(3);
      expect(maxInflight).toBe(1);
    });

    test('mounts below the viewport first (nearest first), then above', async () => {
      const tops = [-1200, 3000, 900, 1800];
      await load({ n: 4, drop: { minPlates: 24, screens: 3, idleMs: IDLE_MS }, premount: PRE, slow: true, setup: (win) => {
        const proto = win.HTMLElement.prototype; const orig = proto.getBoundingClientRect;
        proto.getBoundingClientRect = function rect() {
          if (this.classList && this.classList.contains('sp-pl')) { const t = tops[+this.dataset.index]; return { top: t, bottom: t + 600, height: 600, left: 0, right: 100, width: 100 }; }
          if (this.id === 'sp-scroll') return { top: 0, bottom: 800, height: 800, left: 0, right: 100, width: 100 };
          return orig.call(this);
        };
      } });
      await settle(900);
      expect(svgCalls).toEqual([2, 3, 1, 0]);
    });

    test('a long list keeps pure lazy mounting: nothing pre-mounts', async () => {
      await load({ n: 4, drop: { minPlates: 4, screens: 3, idleMs: IDLE_MS }, premount: PRE, slow: true });
      await settle();
      expect(mountedCount()).toBe(0);
    });

    test('destroying the section stops the queue', async () => {
      await load({ n: 6, drop: { minPlates: 24, screens: 3, idleMs: IDLE_MS }, premount: { ...PRE, fallbackMs: 60 }, slow: true });
      await tick(100);
      const before = svgCalls.length;
      expect(before).toBeGreaterThan(0);
      expect(before).toBeLessThan(6);
      app.startPage.plates.destroy();
      await settle();
      expect(svgCalls.length).toBeLessThanOrEqual(before + 1); // at most the render already in flight
    });
  });

  test('without IntersectionObserver the plates render directly', async () => {
    await load({ withIO: false });
    expect(wrap(0).querySelector('.spl')).not.toBeNull();
  });
});
