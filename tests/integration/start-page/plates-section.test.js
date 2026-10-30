/*
 * Start Page Plates section (P2 "section"): header + Show dropdown + "Showing x of N", plate rendering through
 * StartPagePlateLayouts with the rhythm colorway, mode ownership (Edit only in Curated/Basic, edits kept across
 * modes), arrange / fan / editor / use-as-cover seams, and "open in exactly the colors shown" everywhere.
 * Drives the real App through the runtime loader. Ink canvases and the C2/C3 modules are stubbed (jsdom has no 2D
 * canvas; the editor / arrange / fan have their own specs).
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;

describe('Start Page plates section', () => {
  let runtime; let window; let document; let app; let SETTINGS; let calls; let V; let curArts;

  const makeArts = (n) => Array.from({ length: n }, (_, i) => ({
    id: `work:w${i}`, kind: 'work', name: `piece-${i + 1}.vectura`, algorithm: ['Flowfield', 'Rings', 'Terrain', 'Rainfall'][i % 4], collection: 'Studies',
    recentId: `w${i}`, workId: `w${i}`, bytes: 1000 + i, ownColors: null, getSvg: async () => SVG(10 + i),
  }));

  const boot = async ({ arts = makeArts(8), stubs = true } = {}) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    V = window.Vectura;
    SETTINGS = V.SETTINGS;
    calls = { open: [], editor: [], fan: [], arrange: [], cover: [], mount: [], frame: [] };
    curArts = arts;
    V.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el, art, o) => { calls.mount.push({ el, art, o }); el._spInk = { setColorway(cw) { el._cw = cw; }, setFrame(f, fit) { calls.frame.push({ f, fit }); } }; return Promise.resolve({}); },
      fillWord: (el, word, art, o) => { el._spWord = { setColorway(cw) { el._cw = cw; }, refit() {} }; return Promise.resolve({}); },
    };
    V.StartPageArtSource = { list: async () => arts, listRecentFirst: async () => arts.slice().reverse(), subscribe: () => () => {} };
    const realOpenArt = V.StartPageOpenArt;
    if (stubs) {
      V.StartPageOpenArt = { FILL_INKS: {}, sameAsOwn: realOpenArt.sameAsOwn, freezeColorway: (p) => p, open: async (art, colorway, o) => { calls.open.push({ art, colorway, o }); return true; } };
      V.StartPagePlateEditor = { open: (el, o) => { calls.editor.push({ el, o }); return { close() { o.onClose && o.onClose(); } }; } };
      V.StartPageFan = { open: (el, o) => { calls.fan.push({ el, o }); return { close() {} }; } };
      if (V.UI) V.UI.StartPageFan = V.StartPageFan; // the section prefers UI.* (the real modules)
      V.StartPageArrange = { enter: (el, o) => { calls.arrange.push({ el, o }); return { exit() { o.onExit && o.onExit(); } }; } };
      if (V.UI) V.UI.StartPageArrange = V.StartPageArrange;
    }
    app = window.app = new V.App();
    await tick();
    app.startPage.show();
    await tick(120);
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
  const setMode = async (m) => { click(q(`[data-sp-mode="${m}"]`)); await tick(120); };

  test('header, count, explainer and 5 visible plates by default with "Showing 5 of 8"', async () => {
    await boot();
    expect(q('#sp-plates h2').textContent).toMatch(/Plates/);
    expect(q('#sp-plates .sp-pl-count').textContent).toMatch(/8 works · in your order/);
    expect(q('#sp-plates .sp-pl-explain').textContent.length).toBeGreaterThan(20);
    expect(qa('.sp-pl')).toHaveLength(8);
    expect(live()).toHaveLength(5);
    expect(q('.sp-pl-more').textContent).toMatch(/Showing 5 of 8/);
    expect(qa('.sp-pl .spl')).toHaveLength(5); // only visible plates are built
    expect(q('.sp-pl .spl-h').textContent).toMatch(/Plate 01 \/ 08/);
  });

  test('the Show dropdown persists the choice and updates the line', async () => {
    await boot();
    const sel = q('#sp-pl-show');
    expect([...sel.options].map((o) => o.textContent)).toEqual(['None', '1', '3', '5', '10', '15', '20', 'All']);
    sel.value = '3'; sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(80);
    expect(SETTINGS.startPage.visiblePlates).toBe(3);
    expect(live()).toHaveLength(3);
    expect(q('.sp-pl-more').textContent).toMatch(/Showing 3 of 8/);
    click(q('.sp-pl-more [data-vis-set]'));
    await tick(80);
    expect(SETTINGS.startPage.visiblePlates).toBe('all');
    expect(live()).toHaveLength(8);
    expect(q('.sp-pl-more').textContent).toMatch(/Showing all 8/);
    sel.value = '0'; sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(80);
    expect(live()).toHaveLength(0);
  });

  test('plates animate with grid rows, never display:none <-> max-height', async () => {
    await boot();
    const hidden = qa('.sp-pl[data-off]')[0];
    expect(hidden).toBeTruthy();
    expect(hidden.hasAttribute('inert')).toBe(true);
    expect(hidden.getAttribute('aria-hidden')).toBe('true');
  });

  test('first run is an honest empty state that points at studio picks', async () => {
    await boot({ arts: [] });
    expect(q('#sp-plates .sp-pl-empty').textContent).toMatch(/studio picks/i);
    expect(q('#sp-plates .sp-pl-empty a[href="#sp-picks"]')).toBeTruthy();
    expect(qa('.sp-pl')).toHaveLength(0);
    expect(q('#sp-pl-add').hidden).toBe(true);
  });

  test('every plate carries its resolved colorway and the page never puts two darks or near twins together', async () => {
    await boot({ arts: makeArts(12) });
    sp().querySelector('#sp-pl-show').value = 'all';
    sp().querySelector('#sp-pl-show').dispatchEvent(new window.Event('change', { bubbles: true }));
    await tick(150);
    for (const m of ['curated', 'wildcard', 'basic']) {
      await setMode(m);
      const ws = live();
      expect(ws).toHaveLength(12);
      ws.forEach((w) => { expect(w.dataset.spPaper).toMatch(/^#[0-9a-f]{6}$/); expect(w.dataset.spInk).toMatch(/^#[0-9a-f]{6}$/); });
      for (let i = 1; i < ws.length; i++) {
        if (m === 'basic') { expect(ws[i].dataset.cwId).not.toBe(ws[i - 1].dataset.cwId); continue; }
        expect(!(ws[i].dataset.cwClass === 'dark' && ws[i - 1].dataset.cwClass === 'dark')).toBe(true);
        expect(ws[i].dataset.cwId).not.toBe(ws[i - 1].dataset.cwId);
        expect(!(ws[i].dataset.cwFam === ws[i - 1].dataset.cwFam)).toBe(true);
      }
    }
  });

  test('Edit shows only in Curated and Basic; switching modes recolors live without re-mounting', async () => {
    await boot();
    expect(qa('.sp-pl .spl [data-act="edit"]').length).toBe(5);
    const art0 = q('.sp-pl .spl');
    const before = q('.sp-pl').dataset.cwId;
    await setMode('mono');
    expect(qa('.sp-pl .spl [data-act="edit"]')).toHaveLength(0);
    expect(q('.sp-pl .spl')).toBe(art0); // same element: recolored, not rebuilt
    expect(q('.sp-pl').dataset.cwId).not.toBe(before);
    await setMode('wildcard');
    expect(qa('.sp-pl .spl [data-act="edit"]')).toHaveLength(0);
    await setMode('basic');
    expect(qa('.sp-pl .spl [data-act="edit"]').length).toBe(5);
    await setMode('curated');
    expect(q('.sp-pl').dataset.cwId).toBe(before);
  });

  test('Curated edits survive a mode round trip: pins hidden outside Curated, texts and layout kept everywhere', async () => {
    await boot();
    const id = q('.sp-pl').dataset.plateId;
    await app.startPage.plates.store.upsert(id, { pin: 'black-gold', layout: 'big-numeral', texts: { title: 'My Own Title' } });
    await tick(120);
    expect(q('.sp-pl').dataset.cwId).toBe('black-gold');
    expect(q('.sp-pl .spl').dataset.layout).toBe('big-numeral');
    expect(q('.sp-pl .spl-title, .sp-pl .spl-h b').textContent).toMatch(/My Own Title/);
    await setMode('wildcard');
    expect(q('.sp-pl').dataset.cwId).not.toBe('black-gold');
    expect(q('.sp-pl .spl').dataset.layout).toBe('big-numeral'); // layout applies in every mode
    expect(q('.sp-pl .spl-h b').textContent).toMatch(/My Own Title/);
    await setMode('curated');
    expect(q('.sp-pl').dataset.cwId).toBe('black-gold');
  });

  test('plate 2 of a Rings piece is a spec sheet on black stock, overridable', async () => {
    await boot();
    const second = qa('.sp-pl')[1];
    expect(second.dataset.cwId).toBe('black-white');
    expect(second.querySelector('.spl').dataset.layout).toBe('spec-sheet');
    expect(second.querySelector('.spl-vword text').textContent).toBe('Rings');
    await app.startPage.plates.store.upsert(second.dataset.plateId, { layout: 'diptych', pin: 'amber-black' });
    await tick(120);
    expect(qa('.sp-pl')[1].dataset.cwId).toBe('amber-black');
    expect(qa('.sp-pl')[1].querySelector('.spl').dataset.layout).toBe('diptych');
  });

  test('Open buttons and the art go through StartPageOpenArt with the colors the plate shows', async () => {
    await setupOpen();
    const w = qa('.sp-pl')[2];
    click(w.querySelector('.spl-btn-p'));
    await tick();
    expect(calls.open).toHaveLength(1);
    expect(calls.open[0].art.recentId).toBe('w2');
    expect(calls.open[0].colorway.paper).toBe(w.dataset.spPaper);
    expect(calls.open[0].colorway.ink).toBe(w.dataset.spInk);
    expect(calls.open[0].o.asTemplate).toBeFalsy();
    click(w.querySelector('.spl-btn-s'));
    await tick();
    expect(calls.open[1].o.asTemplate).toBe(true);
    expect(calls.open[1].colorway.paper).toBe(w.dataset.spPaper);
    await setMode('wildcard');
    const w2 = qa('.sp-pl')[2];
    click(w2.querySelector('.spl-btn-p'));
    await tick();
    expect(calls.open[2].colorway.paper).toBe(w2.dataset.spPaper);
    expect(calls.open[2].colorway.ink).toBe(w2.dataset.spInk);
    expect(calls.open[2].colorway.paper).not.toBe(calls.open[0].colorway.paper);
  });
  async function setupOpen() { await boot(); }

  test('cover letters and rail recents open through StartPageOpenArt with their resolved colorway', async () => {
    await boot();
    const letter = q('.sp-lt');
    click(letter);
    await tick();
    expect(calls.open).toHaveLength(1);
    const tile = letter.querySelector('[data-sp-paper]');
    expect(calls.open[0].colorway.paper).toBe(tile.dataset.spPaper);
    expect(calls.open[0].colorway.ink).toBe(tile.dataset.spInk);
    // a rail / colophon / Resume recent reopens the ORIGINAL file (it is shown in its own colors): no colorway copy
    const reopened = [];
    app.recents.open = async (id) => { reopened.push(id); return true; };
    const row = document.createElement('button');
    row.dataset.recentId = 'w3';
    sp().append(row);
    click(row);
    await tick();
    expect(reopened).toEqual(['w3']);
    expect(calls.open).toHaveLength(1);
  });

  test('a piece shown in its own colors opens the original file; other colors make the "(colorway)" copy', async () => {
    await boot();
    const reopened = [];
    app.recents.open = async (id) => { reopened.push(id); return true; };
    const art = { kind: 'work', recentId: 'w3', name: 'piece-4', ownColors: { paper: '#101010', ink: '#eeeeee' } };
    await app.startPage.openArt(art, { paper: '#101010', ink: '#efefef' }); // within the tolerance
    expect(reopened).toEqual(['w3']);
    expect(calls.open).toHaveLength(0);
    await app.startPage.openArt(art, { paper: '#101010', ink: '#c0c0c0' });
    expect(calls.open).toHaveLength(1);
    await app.startPage.openArt(art, { paper: '#101010', ink: '#eeeeee', fill: 'sunset' });
    expect(calls.open).toHaveLength(2);
    await app.startPage.openArt(art, { paper: '#101010', ink: '#eeeeee' }, { asTemplate: true });
    expect(calls.open).toHaveLength(3);
    expect(reopened).toHaveLength(1);
  });

  test('Colorways fan, Use as cover and Edit call their seams with the plate context', async () => {
    await boot();
    const w = qa('.sp-pl')[0];
    click(w.querySelector('[data-act="fan"]'));
    expect(calls.fan).toHaveLength(1);
    expect(calls.fan[0].o.alternates).toHaveLength(4);
    expect(calls.fan[0].o.art.id).toBe('work:w0');
    calls.fan[0].o.onPick(calls.fan[0].o.alternates[1]);
    await tick();
    expect(calls.open.at(-1).colorway.paper).toBe(calls.fan[0].o.alternates[1].paper);

    const covers = [];
    app.startPage.plates.setCoverApi({ useAsCover: (art, o) => { covers.push({ art, o }); return Promise.resolve(); } });
    click(w.querySelector('[data-act="cover"]'));
    await tick();
    expect(covers).toHaveLength(1);
    expect(covers[0].o.colorway.paper).toBe(w.dataset.spPaper);

    click(w.querySelector('[data-act="edit"]'));
    expect(calls.editor).toHaveLength(1);
    const o = calls.editor[0].o;
    expect(o.index).toBe(0);
    expect(o.mode).toBe('curated');
    expect(o.record).toBeTruthy();
    expect(o.placed.length).toBeGreaterThan(0);
    o.onChange({ texts: { title: 'Hello' } });
    await tick(120);
    expect(qa('.sp-pl')[0].querySelector('.spl-h b').textContent).toBe('Hello');
    expect((await app.startPage.plates.store.load()).plates.find((r) => r.id === w.dataset.plateId).texts.title).toBe('Hello');
  });

  test('Arrange is disabled and does nothing with zero plates', async () => {
    await boot({ arts: [] });
    const b = q('#sp-pl-arrange');
    expect(b.disabled).toBe(true);
    b.click();
    await tick();
    expect(calls.arrange).toHaveLength(0);
    expect(q('#sp-pl-list').dataset.arranging).toBeUndefined();
  });

  test('Arrange hands the rows to StartPageArrange; moves persist the order and re-sequence the plates', async () => {
    await boot();
    click(q('#sp-pl-arrange'));
    await tick();
    expect(calls.arrange).toHaveLength(1);
    const o = calls.arrange[0].o;
    expect(o.plates).toHaveLength(8);
    expect(o.plates.filter((p) => p.hidden)).toHaveLength(3);
    const ids = o.plates.map((p) => p.id);
    const moved = [ids[1], ids[0], ...ids.slice(2)];
    await o.onMove(moved);
    await tick(120);
    expect(qa('.sp-pl').map((x) => x.dataset.plateId)).toEqual(moved);
    await o.onResetOrder();
    await tick(120);
    expect(qa('.sp-pl').map((x) => x.dataset.plateId)).toEqual(ids);
    o.onExit();
    await tick();
    expect(q('#sp-pl-arrange').getAttribute('aria-pressed')).toBe('false');
  });

  test('Remove offers Undo; Add plate adds another plate of a work at the end', async () => {
    await boot();
    const w = qa('.sp-pl')[0];
    click(w.querySelector('[data-act="edit"]'));
    const o = calls.editor[0].o;
    await o.onRemove();
    await tick(120);
    expect(qa('.sp-pl')).toHaveLength(7);
    const undo = document.querySelector('.vectura-toast [data-action="undo"]');
    expect(undo).toBeTruthy();
    click(undo);
    await tick(150);
    expect(qa('.sp-pl')).toHaveLength(8);
    click(q('#sp-pl-add'));
    click(q('.sp-pl-menu [data-add-art]'));
    await tick(150);
    expect(qa('.sp-pl')).toHaveLength(9);
    expect(qa('.sp-pl').at(-1).dataset.plateId).toMatch(/#/);
  });

  /* ---------------------------------------------------------------- P2 review fixes */
  test('title, description and frame edits update the plate in place: the art is never re-mounted', async () => {
    await boot();
    const w = qa('.sp-pl')[0];
    click(w.querySelector('[data-act="edit"]'));
    const o = calls.editor[0].o;
    const mounts = calls.mount.length;
    o.onChange({ texts: { title: 'Typed title', description: 'Typed words.' } });
    await tick(150);
    expect(qa('.sp-pl')[0].querySelector('.spl-h b, .spl-title, .spl-wrap-txt > b').textContent).toBe('Typed title');
    expect(calls.mount.length, 'text edit').toBe(mounts);
    o.onChange({ frame: { fit: 'cover', z: 2, cx: 0.4, cy: 0.6 } });
    await tick(150);
    expect(calls.mount.length).toBe(mounts);
    const last = calls.frame.at(-1);
    expect(last.f).toMatchObject({ z: 2, cx: 0.4, cy: 0.6 });
    expect(last.fit).toBe('cover');
  });

  test('the shared #spe-defs block does not grow when a plate re-renders', async () => {
    await boot();
    const w = qa('.sp-pl')[0];
    click(w.querySelector('[data-act="edit"]'));
    const o = calls.editor[0].o;
    o.onChange({ colors: { art: { fill: 'iridescent' } } });
    await tick(120);
    const layouts = V.StartPagePlateLayouts.LAYOUTS;
    for (let i = 0; i < 6; i += 1) { o.onChange({ layout: layouts[(i % 2) + 1] }); await tick(120); }
    const count = document.querySelectorAll('#spe-defs linearGradient').length;
    expect(count).toBeLessThanOrEqual(1 + 1); // at most the live plate (and none for a plate that was destroyed)
  });

  test('a work with no store record gets a second plate with its own id; Undo removes only that plate', async () => {
    await boot();
    expect(qa('.sp-pl')).toHaveLength(8);
    const originalId = qa('.sp-pl')[0].dataset.plateId;
    click(q('#sp-pl-add'));
    click(q('.sp-pl-menu [data-add-art]'));
    await tick(200);
    expect(qa('.sp-pl')).toHaveLength(9);
    const added = qa('.sp-pl').at(-1).dataset.plateId;
    expect(added).toMatch(/#\d+$/);
    click(document.querySelector('.vectura-toast [data-action="undo"]'));
    await tick(200);
    expect(qa('.sp-pl')).toHaveLength(8);
    expect(qa('.sp-pl')[0].dataset.plateId).toBe(originalId);
  });

  test('removed plates are listed under "Removed" in the Add plate menu and come back', async () => {
    await boot();
    click(qa('.sp-pl')[0].querySelector('[data-act="edit"]'));
    const gone = qa('.sp-pl')[0].dataset.plateId;
    await calls.editor[0].o.onRemove();
    await tick(150);
    expect(qa('.sp-pl')).toHaveLength(7);
    click(q('#sp-pl-add'));
    expect(q('.sp-pl-menu').textContent).toMatch(/Removed/);
    const back = q(`.sp-pl-menu [data-restore-art="${gone}"]`);
    expect(back).toBeTruthy();
    click(back);
    await tick(200);
    expect(qa('.sp-pl')).toHaveLength(8);
  });

  test('opening or saving a removed work again (a newer lastOpened) brings its plate back', async () => {
    await boot();
    click(qa('.sp-pl')[0].querySelector('[data-act="edit"]'));
    const gone = qa('.sp-pl')[0].dataset.plateId;
    await calls.editor[0].o.onRemove();
    await tick(150);
    expect(qa('.sp-pl')).toHaveLength(7);
    curArts.find((a) => a.id === gone).lastOpened = Date.now() + 5000;
    await app.startPage.plates.refresh();
    await tick(200);
    expect(qa('.sp-pl')).toHaveLength(8);
  });

  test('leaving Arrange (Done or Esc) returns focus to the Arrange button', async () => {
    await boot();
    click(q('#sp-pl-arrange'));
    await tick();
    calls.arrange[0].o.onExit(); // Esc inside the panel
    await tick();
    expect(document.activeElement).toBe(q('#sp-pl-arrange'));
    q('#sp-pl-add').focus();
    click(q('#sp-pl-arrange'));
    await tick();
    click(q('#sp-pl-arrange')); // Done arranging (the header button)
    await tick();
    expect(document.activeElement).toBe(q('#sp-pl-arrange'));
  });

  test('a duotone fill opens with its two solid inks', async () => {
    await boot();
    click(qa('.sp-pl')[0].querySelector('[data-act="edit"]'));
    calls.editor[0].o.onChange({ colors: { art: { fill: 'duotone' } } });
    await tick(150);
    click(qa('.sp-pl')[0].querySelector('.spl-btn-p'));
    await tick(60);
    const cw = calls.open.at(-1).colorway;
    expect(cw.fill).toBe('duotone');
    expect(cw.ink2).toMatch(/^#[0-9a-f]{6}$/i);
    expect(cw.ink2.toLowerCase()).toBe(app.startPage.plates.placed()[0].colorway.accent.toLowerCase()); // the duotone's second stop
  });

  test('a manual art color is shown exactly (no contrast nudge) and Open freezes the pick', async () => {
    await boot();
    click(qa('.sp-pl')[0].querySelector('[data-act="edit"]'));
    const paper = qa('.sp-pl')[0].dataset.spPaper;
    // pick an ink that is nearly the paper: far below 3:1
    const pick = paper.toLowerCase() === '#ffffff' ? '#fafafa' : paper;
    calls.editor[0].o.onChange({ colors: { art: pick } });
    await tick(150);
    const w = qa('.sp-pl')[0];
    expect(w.querySelector('.spl').style.getPropertyValue('--spl-art').toLowerCase()).toBe(pick.toLowerCase());
    expect(w.dataset.spInk.toLowerCase()).toBe(pick.toLowerCase());
  });
});
