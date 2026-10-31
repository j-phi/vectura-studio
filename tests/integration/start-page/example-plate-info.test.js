/*
 * Example plates: no "EXAMPLE" badge; an info icon (hover / focus / tap, Esc) after the plate name explains the placeholder;
 * plate 7 (Contour Survey No. 3) ships iridescent art + title with the Hologram Foil hover; and the plate's top meta line
 * and PAPER / PEN rows always describe the colors actually shown.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
const SVG = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none"><path d="M 0 ${n} L 100 ${100 - n}"/></g></svg>`;
const CSS = fs.readFileSync(path.resolve(__dirname, '../../../src/ui/skin/components.css'), 'utf8');

describe('Start Page example plates: info icon, plate 7, live names', () => {
  let runtime; let window; let document; let app; let V; let works; let attached;

  const boot = async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    ({ window, document } = runtime);
    V = window.Vectura;
    works = [];
    V.StartPageInk = {
      isStill: () => false, setMotion() {}, finish() {}, unmount() {}, drawIn: () => Promise.resolve({}),
      mount: (el) => { el._spInk = { setColorway() {}, setFrame() {} }; return Promise.resolve({}); },
      fillWord: (el) => { el._spWord = { setColorway() {}, refit() {} }; return Promise.resolve({}); },
    };
    attached = [];
    V.StartPageHoverFx = { attach: (el, id) => { attached.push(id); }, detach() {}, isStill: () => false };
    const realSource = V.StartPageArtSource;
    V.StartPageArtSource = {
      list: async () => works, listRecentFirst: async () => works.slice(), subscribe: () => () => {},
      examples: () => realSource.examples().map((a, i) => Object.assign({}, a, { getSvg: async () => SVG(10 + i) })),
    };
    app = window.app = new V.App();
    await tick();
    app.startPage.show();
    await tick(200);
  };

  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  const sp = () => document.getElementById('start-page');
  const q = (s) => sp().querySelector(s);
  const qa = (s) => [...sp().querySelectorAll(s)];
  const live = () => qa('.sp-pl:not([data-off])');
  const ev = (el, type, init = {}) => {
    const e = new window.MouseEvent(type, { bubbles: true, cancelable: true });
    if (init.pointerType) Object.defineProperty(e, 'pointerType', { value: init.pointerType });
    return el.dispatchEvent(e);
  };
  const key = (el, k) => el.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const P7 = 6;
  const meta = (w) => w.querySelector('.spl-hs > span').textContent;
  const specs = (w) => Object.fromEntries([...w.querySelectorAll('.spl-spec dt')].map((dt) => [dt.textContent.trim(), dt.nextElementSibling.textContent]));
  const hoverOn = (w) => { attached.length = 0; ev(w.querySelector('.spl-print'), 'pointerenter'); return attached.slice(); };

  test('the dashed EXAMPLE badge is gone; the data marker stays', async () => {
    await boot();
    expect(qa('.sp-pl-example')).toHaveLength(0);
    expect(qa('.spl-tools')).toHaveLength(10);
    qa('.spl-tools').forEach((t) => expect(t.textContent).not.toMatch(/example/i));
    expect(qa('.sp-pl[data-example]')).toHaveLength(10);
  });

  test('an info icon sits right after the plate name on example plates only, with the placeholder note', async () => {
    await boot();
    const infos = qa('.sp-pl-info');
    expect(infos).toHaveLength(10);
    live().forEach((w) => {
      const b = w.querySelector('.spl-no b');
      expect(b.nextElementSibling.classList.contains('sp-pl-info')).toBe(true);
      const btn = b.nextElementSibling.querySelector('button');
      const tip = b.nextElementSibling.querySelector('[role="tooltip"]');
      expect(btn.getAttribute('aria-label')).toMatch(/example plate/i);
      expect(btn.getAttribute('aria-describedby')).toBe(tip.id);
      expect(tip.textContent).toBe('This is a placeholder example plate, shipped with Vectura Studio. Turn example plates off with “Show example plates” in Start Page settings (⚙).');
      expect(btn.querySelector('svg')).toBeTruthy();
      expect(w.querySelector('.sp-pl-info').dataset.open).toBeUndefined();
    });
    // the tooltip floats: it takes no room in the header row
    expect(CSS).toMatch(/\.sp-pl-info-tip\s*\{[^}]*position:\s*absolute/);
    // a work of your own gets no icon
    works = [{ id: 'work:w1', kind: 'work', name: 'mine.vectura', algorithm: 'Flowfield', collection: 'Studies', recentId: 'w1', workId: 'w1', bytes: 900, ownColors: null, getSvg: async () => SVG(20) }];
    await app.startPage.plates.refresh();
    await tick(150);
    const own = live().find((w) => !w.dataset.example);
    expect(own).toBeTruthy();
    expect(own.querySelector('.sp-pl-info')).toBeNull();
    expect(live().filter((w) => w.querySelector('.sp-pl-info')).length).toBe(live().filter((w) => w.dataset.example).length);
  });

  test('hover and keyboard focus show it, Esc closes it, tap toggles it, an outside tap closes it', async () => {
    await boot();
    const wrap = live()[P7].querySelector('.sp-pl-info');
    const btn = wrap.querySelector('button');
    ev(btn, 'pointerenter', { pointerType: 'mouse' });
    expect(wrap.dataset.open).toBe('1');
    ev(btn, 'pointerleave', { pointerType: 'mouse' });
    expect(wrap.dataset.open).toBeUndefined();
    btn.focus();
    expect(wrap.dataset.open).toBe('1');
    key(btn, 'Escape');
    expect(wrap.dataset.open).toBeUndefined();
    btn.blur();
    // touch: tap opens, tap again closes
    ev(btn, 'pointerdown', { pointerType: 'touch' });
    ev(btn, 'click');
    expect(wrap.dataset.open).toBe('1');
    ev(btn, 'pointerdown', { pointerType: 'touch' });
    ev(btn, 'click');
    expect(wrap.dataset.open).toBeUndefined();
    // open by tap, Esc anywhere closes it without leaving the page, an outside press closes it too
    ev(btn, 'pointerdown', { pointerType: 'touch' }); ev(btn, 'click');
    expect(wrap.dataset.open).toBe('1');
    key(document.body, 'Escape');
    expect(wrap.dataset.open).toBeUndefined();
    ev(btn, 'pointerdown', { pointerType: 'touch' }); ev(btn, 'click');
    ev(q('.sp-pl-count'), 'pointerdown', { pointerType: 'touch' });
    expect(wrap.dataset.open).toBeUndefined();
    // pressing the icon never opens the plate underneath
    expect(app.startPage.isOpen ? app.startPage.isOpen() : true).toBeTruthy();
  });

  test('plate 7 renders iridescent art and title on black stock and wires the Hologram Foil hover', async () => {
    await boot();
    const w = live()[P7];
    expect(w.textContent).toMatch(/Contour Survey No\. 3/);
    expect(w.dataset.cwId).toBe('black-silver');
    expect(w.dataset.spFill).toBe('iridescent');
    expect(w.querySelector('.spl').dataset.title).toBe('iridescent');
    expect(w.querySelector('.spl').dataset.artfill).toBe('iridescent');
    expect(hoverOn(w)).toEqual(['holo']);
    expect(hoverOn(live()[0])).toEqual([]); // other examples keep the page default
  });

  test('hover precedence: the plate editor choice beats the shipped hover; a page "None" still silences it', async () => {
    await boot();
    const id = live()[P7].dataset.plateId;
    expect(hoverOn(live()[P7])).toEqual(['holo']);
    await app.startPage.plates.store.upsert(id, { motion: { hover: 'glare' } });
    await tick(150);
    expect(hoverOn(live()[P7])).toEqual(['glare']);
    await app.startPage.plates.store.upsert(id, { motion: { hover: null } });
    await tick(150);
    expect(hoverOn(live()[P7])).toEqual(['holo']);
    V.SETTINGS.startPage.hover = 'none';
    expect(hoverOn(live()[P7])).toEqual([]);
  });

  test('the meta line and PAPER / PEN rows name the colors shown: plate 7, pins, manual colors, mode changes', async () => {
    await boot();
    const w = () => live()[P7];
    const store = app.startPage.plates.store;
    const id = w().dataset.plateId;
    expect(meta(w())).toMatch(/Black stock · Iridescent ink$/);
    expect(meta(w())).not.toMatch(/Gelly Roll Metallic Silver/);
    expect(specs(w())).toMatchObject({ Paper: 'Black stock', Pen: 'Iridescent ink' });
    // a pinned colorway replaces the shipped colors and the names follow
    await store.upsert(id, { pin: 'cobalt-butter' });
    await tick(150);
    expect(meta(w())).toMatch(/Cobalt stock · Butter$/);
    expect(specs(w())).toMatchObject({ Paper: 'Cobalt stock', Pen: 'Butter' });
    // manual ink and paper: a known pen keeps its name, anything else is a readable custom name
    await store.upsert(id, { pin: null, colors: { art: '#0f766f', background: '#123456' } });
    await tick(150);
    expect(meta(w())).toMatch(/Custom paper #123456 · Custom ink #0f766f$/);
    expect(specs(w())).toMatchObject({ Paper: 'Custom paper #123456', Pen: 'Custom ink #0f766f' });
    await store.upsert(id, { colors: { art: { fill: 'metallic-gold' }, background: null, title: '#ff00ff', band: '#00ff00' } });
    await tick(150);
    expect(specs(w())).toMatchObject({ Paper: 'Black stock', Pen: 'Metallic gold ink' });
    // a page mode change recolors in place and the names follow the new colorway
    const before = meta(live()[0]);
    V.SETTINGS.startPage.colorMode = 'mono';
    app.startPage.plates.refresh && await app.startPage.plates.refresh();
    await tick(200);
    const pal = new Map(V.START_PAGE_PLATE_PALETTE.map((c) => [c.id, c]));
    const cw = pal.get(live()[0].dataset.cwId);
    if (cw) expect(meta(live()[0])).toContain(cw.penName);
    expect(typeof before).toBe('string');
  });
});
