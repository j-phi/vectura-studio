/*
 * Start Page example plates: while the user has no works of their own the Plates section shows ten example plates
 * built from bundled presets (pre-rendered art, same plate layouts and colorways), each marked "Example", opening
 * as a NEW unsaved document in the colors shown, and never touching the plates store. They vanish once a work exists.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;

describe('Start Page example plates', () => {
  let runtime; let window; let document; let app; let V; let works; let realOpen;

  const boot = async ({ stubOpen = true, svgDelay = 0, wait = 150 } = {}) => {
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
      examples: () => realSource.examples().map((a, i) => Object.assign({}, a, { getSvg: async () => { if (svgDelay) await tick(svgDelay); return SVG(10 + i); } })),
    };
    realOpen = V.StartPageOpenArt;
    if (stubOpen) V.StartPageOpenArt = Object.assign({}, realOpen, { open: async (art, colorway, o) => { (boot.calls = boot.calls || []).push({ art, colorway, o }); return true; } });
    boot.calls = [];
    app = window.app = new V.App();
    await tick();
    app.startPage.show();
    await tick(wait);
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

  test('first run shows ten marked example plates instead of the empty state', async () => {
    await boot();
    expect(live()).toHaveLength(10);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    expect(q('.sp-pl-empty').hidden).toBe(true);
    live().forEach((w) => { expect(w.querySelector('.sp-pl-example').textContent).toBe('Example'); });
    expect(q('.sp-pl-count').textContent).toMatch(/example/i);
    expect(live().map((w) => w.dataset.layout)).toEqual(['text-wrap', 'spec-sheet', 'vertical-word', 'text-wrap', 'full-bleed-band', 'specimen-frame', 'knockout-title', 'full-bleed-band', 'knockout-title', 'full-sheet']);
    live().forEach((w) => { expect(w.dataset.spPaper).toMatch(/^#[0-9a-f]{6}$/); expect(w.dataset.spInk).toMatch(/^#[0-9a-f]{6}$/); });
    expect(live()[0].textContent).toMatch(/Old Growth Oak/);
    expect(live()[1].dataset.cwId).toBe('black-white');
    // the mockup's last five: kraft, black + silver, sky, ochre wash, lavender
    expect(live().slice(5).map((w) => w.dataset.cwId)).toEqual(['kraft-sepia', 'black-silver', 'sky-prussian', 'ochre-umber', 'lavender-violet']);
    // the placed colorways keep the rhythm: no two dark plates side by side, no repeated colorway neighbors
    const pal = new Map(V.START_PAGE_PLATE_PALETTE.map((c) => [c.id, c]));
    const ids = live().map((w) => w.dataset.cwId);
    ids.forEach((id) => expect(pal.has(id), id).toBe(true));
    for (let i = 1; i < ids.length; i++) {
      expect(pal.get(ids[i]).class === 'dark' && pal.get(ids[i - 1]).class === 'dark', `plates ${i} and ${i + 1} both dark`).toBe(false);
      expect(ids[i], `plates ${i} and ${i + 1} share a colorway`).not.toBe(ids[i - 1]);
    }
  });

  test('Cybersigil carries its own description, not the Rings tree-ring text (other Rings plates keep theirs)', async () => {
    await boot();
    const sigil = live()[1];
    expect(sigil.textContent).toMatch(/Cybersigil/);
    expect(sigil.textContent).toContain('Concentric rings cut by hard, stepped offsets, so each band jumps like a glitch and the whole reads as a geometric sigil.');
    expect(sigil.textContent).not.toMatch(/tree ring|organic|bark|wood|growth/i);
    expect(live()[0].textContent).toMatch(/tree rings/i);
  });

  test('a re-sync while the art is still being fetched does not strand plates without art (first-run race)', async () => {
    // The plates re-sync once the works finish loading; the example entries are rebuilt each time, so a render that was
    // already waiting on its SVG must carry on with the new entry rather than give up and never retry.
    await boot({ svgDelay: 120, wait: 20 });
    await app.startPage.plates.refresh();
    await tick(700);
    const ws = live();
    expect(ws).toHaveLength(10);
    ws.forEach((w) => { expect(w.querySelector('.spl'), w.dataset.plateId).toBeTruthy(); expect(w.dataset.state, w.dataset.plateId).toBe('ready'); });
  });

  test('"drag it to turn it" copy appears only on plates with a live 3D model', async () => {
    await boot();
    const ws = live();
    ws.forEach((w) => {
      const live3d = !!w.querySelector('.spl-print[data-model]');
      expect(/drag it to turn it/i.test(w.textContent), w.dataset.plateId).toBe(live3d);
    });
    expect(ws.filter((w) => w.querySelector('.spl-print[data-model]')).map((w) => w.dataset.plateId))
      .toEqual(['example:user-spiralizer-1781359333969', 'example:user-terrain-1781475148727', 'example:topoform-torus-contours']);
    // a 3D-oriented plate with no live model must not claim to be live
    const art = V.StartPagePlateLayouts.render('text-wrap', {
      plate: { id: 'x', orientation: '3d' }, art: { id: 'x', svg: SVG(10), model: null }, colorway: live()[0] && V.StartPagePlateRhythm.place([{ id: 'x' }], { mode: 'curated', seed: 'a', theme: 'dark' })[0].colorway,
      index: 0, total: 1, texts: { word: 'W', title: 'T', description: 'Desc.', algorithm: 'A', summary: 'A', specs: [], actions: [] }, autoMount: false,
    });
    expect(art.textContent).not.toMatch(/drag it/i);
  });

  test('examples are edited and removed like works (Edit, Add plate, Arrange) but are not a cover piece; Show counts only own works', async () => {
    await boot();
    expect(qa('.sp-pl [data-act="edit"]')).toHaveLength(10);
    expect(qa('.sp-pl [data-act="cover"]')).toHaveLength(0);
    expect(qa('.sp-pl [data-act="fan"]')).toHaveLength(10);
    expect(q('#sp-pl-add').hidden).toBe(false);
    expect(q('#sp-pl-arrange').hidden).toBe(false);
    expect(q('#sp-pl-show').closest('.sp-pl-show').hidden).toBe(true); // no works of your own to count
    expect(q('#sp-pl-examples').checked).toBe(true);
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

  test('examples sit after the user\'s works, and the works go away to leave only examples', async () => {
    await boot();
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    works = [{ id: 'work:w1', kind: 'work', name: 'mine.vectura', algorithm: 'Flowfield', collection: 'Studies', recentId: 'w1', workId: 'w1', bytes: 900, ownColors: null, getSvg: async () => SVG(20) }];
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    expect(qa('.sp-pl')).toHaveLength(11);
    expect(qa('.sp-pl')[0].dataset.example).toBeUndefined(); // works first, then the examples
    expect(qa('.sp-pl')[10].dataset.example).toBe('1');
    expect(q('.sp-pl [data-act="edit"]')).toBeTruthy();
    expect(q('#sp-pl-arrange').hidden).toBe(false);
    works = [];
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
  });


  test('a lone work cleared from Recent leaves only the examples; Undo (or opening it again) brings it back first', async () => {
    await boot();
    const work = (cleared) => ({ id: 'work:w1', kind: 'work', name: 'mine.vectura', algorithm: 'Flowfield', collection: 'Studies', recentId: 'w1', workId: 'w1', cleared, bytes: 900, ownColors: null, getSvg: async () => SVG(20) });
    works = [work(false)];
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    expect(qa('.sp-pl')).toHaveLength(11);
    works = [work(true)]; // Clear next to it in Recent: still a work, but hidden from Recent
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl')).toHaveLength(10);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    works = [work(false)]; // opened again (or Undo): it is back, ahead of the examples
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl')).toHaveLength(11);
    expect(qa('.sp-pl')[0].dataset.example).toBeUndefined();
  });

  test('several works keep their plates when Recent is cleared (only a lone work hands the plates back)', async () => {
    await boot();
    const w = (n) => ({ id: `work:w${n}`, kind: 'work', name: `m${n}.vectura`, algorithm: 'Flowfield', collection: 'Studies', recentId: `w${n}`, workId: `w${n}`, cleared: true, bytes: 900, ownColors: null, getSvg: async () => SVG(20 + n) });
    works = [w(1), w(2)];
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    expect(qa('.sp-pl')).toHaveLength(12);
  });

  test('one explainer says these are examples, that own plates appear automatically on save/open, and that the examples stay until hidden', async () => {
    await boot();
    const ex = q('#sp-plates .sp-pl-explain');
    expect(ex.hidden).toBe(false);
    const t = ex.textContent;
    expect(t).toMatch(/^These are examples\./);
    expect(t).not.toMatch(/\b(five|ten)\b/i); // count-agnostic: the count line carries the number
    expect(t).toMatch(/your own plates appear here automatically/i);
    expect(t).toMatch(/save or open a file/i);
    expect(t).toMatch(/Show example plates/i);
    expect(t).not.toMatch(/step aside/i);
    expect(t).toMatch(/opening an example starts a new document/i);
    expect(t).not.toMatch(/commission|colour|favour/i);
    // real text, wired to the section for assistive tech, stated once (not per plate)
    expect(q('#sp-plates').getAttribute('aria-describedby')).toBe(ex.id);
    expect(qa('#sp-plates .sp-pl').filter((w) => /automatically/i.test(w.textContent))).toHaveLength(0);
    expect(q('.sp-pl-count').textContent).toBe('10 examples · your own work will join them');
    live().forEach((w) => { expect(w.querySelector('.sp-pl-example').getAttribute('title')).toMatch(/Show example plates/i); });
  });

  test('the explainer switches to the works copy (no example claims) once a work exists', async () => {
    await boot();
    works = [{ id: 'work:w1', kind: 'work', name: 'mine.vectura', algorithm: 'Flowfield', collection: 'Studies', recentId: 'w1', workId: 'w1', bytes: 900, ownColors: null, getSvg: async () => SVG(20) }];
    await app.startPage.plates.refresh();
    await tick(100);
    const ex = q('#sp-plates .sp-pl-explain');
    expect(ex.textContent).not.toMatch(/examples|step aside/i);
    expect(ex.textContent).toMatch(/open or save becomes a plate automatically/i);
    expect(q('#sp-plates').hasAttribute('aria-describedby')).toBe(false);
  });

  test('the "plate edits live in Curated" note is hidden while only examples show, and comes back with real plates', async () => {
    await boot();
    const note = q('.sp-own-note');
    expect(note.hidden).toBe(true);
    expect(note.textContent).toBe('');
    // other modes: the mode is still described, but without the claim about plate edits that examples do not have
    click(q('[data-sp-mode="mono"]'));
    await tick(60);
    expect(note.textContent).not.toMatch(/edits/i);
    click(q('[data-sp-mode="curated"]'));
    await tick(60);
    expect(note.hidden).toBe(true);
    works = [{ id: 'work:w1', kind: 'work', name: 'mine.vectura', algorithm: 'Flowfield', collection: 'Studies', recentId: 'w1', workId: 'w1', bytes: 900, ownColors: null, getSvg: async () => SVG(20) }];
    await app.startPage.plates.refresh();
    await tick(100);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe('Your plate edits live in Curated.');
    click(q('[data-sp-mode="mono"]'));
    await tick(60);
    expect(note.textContent).toMatch(/your edits return in Curated/);
    works = [];
    await app.startPage.plates.refresh();
    await tick(100);
    click(q('[data-sp-mode="curated"]'));
    await tick(60);
    expect(note.hidden).toBe(true);
  });

  test('without an example list the honest empty state stays', async () => {
    await boot();
    V.StartPageArtSource.examples = () => [];
    await app.startPage.plates.refresh();
    await tick(60);
    expect(qa('.sp-pl')).toHaveLength(0);
    expect(q('.sp-pl-empty').hidden).toBe(false);
    expect(q('.sp-pl-empty').textContent).toMatch(/save or open a file/i);
    expect(q('.sp-pl-empty').textContent).toMatch(/automatically/i);
    expect(q('#sp-plates .sp-pl-explain').hidden).toBe(true);
  });
});
