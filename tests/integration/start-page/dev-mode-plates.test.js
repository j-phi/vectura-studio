/*
 * Developer Mode and the Start Page example plates. The existing Document Setup switch (SETTINGS.devMode, "Developer mode"
 * in Contributor / Presets) makes the shipped example plates editable: the same editor, Arrange, Add from preset, Remove,
 * a local draft that survives a reload, Reset to shipped and Export defaults. With the switch off none of it exists.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;

describe('Start Page Developer Mode: editable example plates', () => {
  let runtime; let window; let document; let app; let V; let works;

  const boot = async ({ dev = false, preload = null } = {}) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    V = window.Vectura;
    works = [];
    V.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el) => { el._spInk = { setColorway() {}, setFrame() {} }; return Promise.resolve({}); },
      fillWord: (el) => { el._spWord = { setColorway() {}, refit() {} }; return Promise.resolve({}); },
    };
    const realSource = V.StartPageArtSource;
    V.StartPageArtSource = {
      list: async () => works, listRecentFirst: async () => works.slice(), subscribe: () => () => {},
      examples: (list) => realSource.examples(list).map((a, i) => Object.assign({}, a, { getSvg: async () => SVG(10 + i) })),
    };
    if (preload) window.localStorage.setItem(V.StartPageExamplePlates.KEY, JSON.stringify(preload));
    V.SETTINGS.devMode = dev;
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
  const draft = () => app.startPage.plates.draft;
  const flip = async (on) => { V.DevMode.set(on, { app }); await tick(150); };
  const type = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };
  const openEditor = async (i) => { click(live()[i].querySelector('[data-act="edit"]')); await tick(60); };

  test('Developer Mode off: no bar, no badge, no draft, no Document Setup button (the user-level example plates are unchanged)', async () => {
    await boot();
    expect(live()).toHaveLength(10);
    expect(q('#sp-dev')).toBeNull();
    expect(q('[data-dev-dialog]')).toBeNull();
    expect(q('#sp-dev-pill').hidden).toBe(true);
    expect(q('#sp-pl-add .sp-pl-btn, #sp-pl-add span').textContent).toBe('Add plate');
    expect(app.startPage.plates.isDev()).toBe(false);
    expect(app.startPage.plates.draft).toBeNull();
    expect(window.localStorage.getItem(V.StartPageExamplePlates.KEY)).toBeNull();
    const btn = document.getElementById('btn-edit-start-page-plates');
    expect(btn).not.toBeNull();
    expect(btn.closest('[data-dev-only]').hidden).toBe(true);
  });

  test('the Developer Mode pill sits in a centered header slot, not beside the date', async () => {
    await boot({ dev: true });
    const pill = q('#sp-dev-pill');
    const hdr = q('.sp-hdr');
    expect(pill.parentElement).toBe(hdr);
    expect(pill.nextElementSibling && pill.nextElementSibling.id).not.toBe('sp-today');
    const css = require('fs').readFileSync(require('path').join(__dirname, '../../../src/ui/skin/components.css'), 'utf8');
    expect(css).toMatch(/\.sp-hdr\s*\{[^}]*position:\s*relative/);
    const rule = (css.match(/\.sp-dev-pill\s*\{[^}]*\}/) || [''])[0];
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/left:\s*50%/);
    expect(rule).toMatch(/translate\(-50%,\s*-50%\)/);
    expect(css).toMatch(/@container sp \(max-width: 560px\)\s*\{[^}]*\.sp-dev-pill/);
  });

  test('switching the existing flag on and off enters and leaves Developer Mode live', async () => {
    await boot();
    await flip(true);
    expect(V.SETTINGS.devMode).toBe(true);
    expect(q('#sp-dev')).not.toBeNull();
    expect(q('#sp-dev-pill').hidden).toBe(false);
    expect(app.startPage.plates.isDev()).toBe(true);
    expect(live()).toHaveLength(10);
    expect(qa('[data-act="edit"]')).toHaveLength(10);
    expect(q('#sp-pl-add span').textContent).toBe('Add from preset');
    expect(document.getElementById('btn-edit-start-page-plates').closest('[data-dev-only]').hidden).toBe(false);
    await flip(false);
    expect(q('#sp-dev')).toBeNull();
    expect(q('#sp-dev-pill').hidden).toBe(true);
    expect(app.startPage.plates.isDev()).toBe(false);
    expect(q('#sp-pl-add span').textContent).toBe('Add plate');
    expect(live()).toHaveLength(10);
  });

  test('the dev bar Exit button turns the same setting off', async () => {
    await boot({ dev: true });
    click(q('[data-dev-act="exit"]'));
    await tick(150);
    expect(V.SETTINGS.devMode).toBe(false);
    expect(document.getElementById('set-dev-mode').checked).toBe(false);
    expect(q('#sp-dev')).toBeNull();
  });

  test('the shipped examples are editable even when the user has works and has hidden the examples', async () => {
    await boot();
    works = [{ id: 'work:1', kind: 'work', name: 'Mine', algorithm: 'Rings', collection: 'Studies', ownColors: { paper: '#fff', ink: '#000' }, getSvg: async () => SVG(5) }];
    V.SETTINGS.startPage.showExamples = false;
    await app.startPage.plates.refresh();
    await tick(100);
    expect(qa('.sp-pl[data-example]')).toHaveLength(0); // their own plate only
    await flip(true);
    expect(live()).toHaveLength(10);
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    expect(qa('[data-act="edit"]')).toHaveLength(10);
    await flip(false);
    expect(qa('.sp-pl[data-example]')).toHaveLength(0);
    expect(live()).toHaveLength(1);
  });

  test('edits the word, title, layout and pin; the draft holds them and a reload keeps them', async () => {
    await boot({ dev: true });
    const id = live()[0].dataset.plateId;
    await openEditor(0);
    expect(q('[data-plate-editor]').dataset.devExample).toBe('1');
    expect(q('[data-spe-sec="frame"]').hidden).toBe(true);
    type(q('[data-spe-field="word"]'), 'Acorn');
    type(q('[data-spe-field="title"]'), 'Old Oak Study');
    await tick(60);
    click(q('.spe-pal [data-pin="black-white"]'));
    click(q(".spe-lay[data-layout=\"full-sheet\"]"));
    await tick(120);
    const rec = draft().plates().find((p) => p.key === id);
    expect(rec).toMatchObject({ word: 'Acorn', title: 'Old Oak Study', pin: 'black-white', layout: 'full-sheet' });
    expect(live()[0].dataset.layout).toBe('full-sheet');
    expect(live()[0].textContent).toMatch(/Old Oak Study/);
    expect(q('#sp-dev').dataset.dirty).toBe('true');
    expect(JSON.parse(window.localStorage.getItem(V.StartPageExamplePlates.KEY)).plates[0]).toMatchObject({ word: 'Acorn', title: 'Old Oak Study' });
    // a reload: a fresh app on the same storage
    const saved = JSON.parse(window.localStorage.getItem(V.StartPageExamplePlates.KEY));
    app.startPage.hide({ restoreFocus: false });
    runtime.cleanup();
    await boot({ dev: true, preload: saved });
    expect(live()[0].textContent).toMatch(/Old Oak Study/);
    expect(live()[0].dataset.layout).toBe('full-sheet');
  });

  test('removes a plate (editor) with undo, and adds one from a bundled preset (picker)', async () => {
    await boot({ dev: true });
    const before = draft().plates().length;
    await openEditor(2);
    click(q('[data-spe-remove]'));
    await tick(100);
    expect(live()).toHaveLength(before - 1);
    expect(draft().plates().some((p) => p.presetId === 'rainfall-downpour')).toBe(false);
    click(q('[data-dev-act="add"]'));
    await tick(30);
    const dlg = q('[data-dev-dialog="picker"]');
    expect(dlg).not.toBeNull();
    const search = dlg.querySelector('input');
    type(search, 'rainfall-downpour');
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    click(dlg.querySelector('[data-preset-id="rainfall-downpour"]'));
    await tick(150);
    expect(q('[data-dev-dialog]')).toBeNull();
    expect(live()).toHaveLength(before);
    expect(draft().plates().at(-1).presetId).toBe('rainfall-downpour');
    expect(live().at(-1).dataset.plateId).toBe(draft().plates().at(-1).key);
  });

  test('Arrange reorders the examples and the draft follows', async () => {
    await boot({ dev: true });
    const ids = draft().plates().map((p) => p.key);
    click(q('#sp-pl-arrange'));
    await tick(80);
    const row = q('.sp-arr-row[data-plate-id="' + ids[0] + '"]');
    expect(row).not.toBeNull();
    click(row.querySelector('[data-arr-down]'));
    await tick(120);
    expect(draft().plates().map((p) => p.key).slice(0, 2)).toEqual([ids[1], ids[0]]);
    click(q('[data-arr-done]'));
    await tick(120);
    expect(live().map((w) => w.dataset.plateId).slice(0, 2)).toEqual([ids[1], ids[0]]);
  });

  test('Reset to shipped restores the shipped list, and Export defaults shows the exact block', async () => {
    await boot({ dev: true });
    const M = V.StartPageExamplePlates;
    const reset = q('[data-dev-act="reset"]');
    expect(reset.disabled).toBe(true);
    await draft().remove(draft().plates()[0].key);
    await tick(100);
    expect(q('[data-dev-act="reset"]').disabled).toBe(false);
    click(q('[data-dev-act="export"]'));
    await tick(30);
    const text = q('[data-dev-dialog="export"] textarea').value;
    expect(text).toBe(M.serialize(draft().plates()));
    expect(text).not.toMatch(/rings-old-growth-oak/);
    expect(q('[data-dev-dialog="export"]').textContent).toMatch(/npm run start-page:picks/);
    click(q('[data-dev-close]'));
    click(q('[data-dev-act="reset"]'));
    await tick(150);
    expect(live()).toHaveLength(10);
    expect(q('[data-dev-act="reset"]').disabled).toBe(true);
    expect(M.serialize(draft().plates())).toBe(M.serialize(M.fromShipped(V.START_PAGE_PICKS.EXAMPLE_PLATES)));
  });

  test('Export defaults writes the region back through the File System Access API', async () => {
    await boot({ dev: true });
    const M = V.StartPageExamplePlates;
    const fs = require('fs'); const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../../src/config/start-page-picks.js'), 'utf8');
    let written = null;
    window.showOpenFilePicker = async () => [{ name: 'start-page-picks.js', requestPermission: async () => 'granted', getFile: async () => ({ text: async () => src }), createWritable: async () => ({ write: async (t) => { written = t; }, close: async () => {} }) }];
    await draft().upsert(draft().plates()[0].key, { texts: { title: 'Edited Title' } });
    click(q('[data-dev-act="export"]'));
    await tick(30);
    click(q('[data-dev-do="write"]'));
    await tick(80);
    expect(written).toContain("title: 'Edited Title'");
    expect(written).toBe(M.replaceRegion(src, M.serialize(draft().plates())));
    expect(q('[data-dev-dialog="export"]').textContent).toMatch(/Wrote start-page-picks\.js/);
  });

  test('Document Setup "Edit Start Page plates…" opens the Start Page in edit mode (Developer Mode only)', async () => {
    await boot();
    app.startPage.hide({ restoreFocus: false });
    expect(sp().hidden).toBe(true);
    const row = () => document.getElementById('btn-edit-start-page-plates').closest('[data-dev-only]');
    expect(row().hidden).toBe(true);
    V.DevMode.set(true, { app });
    expect(row().hidden).toBe(false);
    works = [{ id: 'work:1', kind: 'work', name: 'Mine', algorithm: 'Rings', collection: 'Studies', ownColors: { paper: '#fff', ink: '#000' }, getSvg: async () => SVG(5) }];
    document.getElementById('settings-panel').classList.add('open');
    let scrolled = 0;
    window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() { if (this.id === 'sp-plates') scrolled += 1; };
    click(document.getElementById('btn-edit-start-page-plates'));
    await tick(250);
    expect(sp().hidden).toBe(false);
    expect(document.getElementById('settings-panel').classList.contains('open')).toBe(false);
    expect(q('#sp-dev')).not.toBeNull();
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
    expect(qa('[data-act="edit"]')).toHaveLength(10);
    expect(scrolled).toBeGreaterThan(0);
    // closing returns to the editor as normal
    app.startPage.hide({ restoreFocus: false });
    expect(sp().hidden).toBe(true);
    // with the flag off the click does nothing
    V.DevMode.set(false, { app });
    click(document.getElementById('btn-edit-start-page-plates'));
    await tick(60);
    expect(sp().hidden).toBe(true);
  });
});
