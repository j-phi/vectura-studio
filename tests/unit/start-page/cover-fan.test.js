/**
 * Cover Colorways fan (P4 ux): every cover style has a Colorways button that fans the shown piece's alternates through
 * StartPageFan and opens the picked card via ctx.onOpen (StartPageOpenArt.open in the page); Use as cover obeys Still.
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../../..');
const FILES = [
  'src/ui/start-page/dom.js', 'src/ui/start-page/icons.js', 'src/core/start-page/cover-words.js', 'src/core/start-page/plate-fills.js',
  'src/ui/start-page/cover.js',
];

let dom; let win; let doc; let Cover; let cover; let calls; let toasts; let reduce; let prefs; let scrolled; let fanCalls; let opened; let still;

const svg = '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>';
const makeArts = (n) => Array.from({ length: n }, (_, i) => ({
  id: `w${i}`, kind: 'work', name: `Piece ${i + 1}.vectura`, algorithm: 'Rings', bytes: 1000 + i, getSvg: async () => svg,
}));
const CW = (n) => ({ key: `cw${n}`, paper: '#10131a', ink: '#e8c26a', ink2: null, name: `cw${n}`, penName: 'Gold', paperName: 'Navy' });

const load = () => {
  FILES.forEach((f) => { delete require.cache[path.join(ROOT, f)]; });
  dom = new JSDOM('<!doctype html><body><div id="host"></div></body>', { url: 'http://localhost/', pretendToBeVisual: true });
  win = dom.window; doc = win.document;
  global.window = win; global.document = doc;
  still = false; reduce = false; toasts = []; scrolled = [];
  win.matchMedia = (q) => ({ matches: /reduce/.test(q) ? reduce : false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(win, 'scrollY', { value: 400, writable: true, configurable: true });
  Object.defineProperty(win, 'pageYOffset', { get: () => win.scrollY, configurable: true });
  win.scrollTo = (a, b) => { const top = typeof a === 'object' ? a.top : b; scrolled.push(typeof a === 'object' ? a : { top }); win.scrollY = top; };
  calls = { fillWord: [], mount: [], drawIn: [], unmount: [] };
  win.Vectura = {
    UI: { overlays: { Toast: { show: (p) => { toasts.push(p); return { dismiss() {}, el: doc.createElement('div') }; } } } },
    StartPageInk: {
      isStill: () => still, finish() {}, setMotion() {},
      unmount: (el) => { calls.unmount.push(el); },
      mount: (el, art, o) => { calls.mount.push({ el, art, o }); el._spInk = { setColorway(cw) { el._cw = cw; } }; return Promise.resolve({}); },
      fillWord: (el, word, art, o) => { calls.fillWord.push({ el, word, art, o }); el._spWord = { setColorway(cw) { el._cw = cw; }, refit() {} }; return Promise.resolve({}); },
      drawIn: (el, o) => { calls.drawIn.push({ el, o }); return Promise.resolve({}); },
    },
  };
  fanCalls = []; opened = [];
  win.Vectura.StartPageColorway = { alternates: (i, id, n, o) => Array.from({ length: n }, (_, k) => ({ key: `alt${k}`, paper: '#fff', ink: '#000', id, mode: o.mode })) };
  win.Vectura.UI.StartPageFan = { open: (anchor, o) => { fanCalls.push({ anchor, o }); return { close() {} }; } };
  FILES.forEach((f) => require(path.join(ROOT, f)));
  Cover = win.Vectura.UI.StartPageCover;
};

const boot = async (style, nArts = 4) => {
  prefs = { coverStyle: style, coverWord: 'vectura', animateIn: 'plot', showName: false, showLine: false, colorMode: 'curated' };
  const arts = makeArts(nArts);
  cover = Cover.create({
    host: doc.getElementById('host'),
    prefs: () => prefs,
    arts: async () => arts,
    colorwaysFor: (list) => list.map((a, i) => CW(i)),
    still: () => false,
    onOpen: (art, cw, o) => opened.push({ art, cw, o }), onPref() {}, onWordPick() {},
  });
  await cover.render({ animate: false });
  return arts;
};
const btn = () => doc.querySelector('.sp-cv-fan');

beforeEach(load);
afterEach(() => { try { cover && cover.destroy(); } catch (_) { /* noop */ } delete global.window; delete global.document; });

describe('cover Colorways fan', () => {
  test.each(['band', 'word', 'mosaic'])('%s: a labelled Colorways button fans the shown piece and opens the picked card', async (style) => {
    const arts = await boot(style);
    expect(btn()).not.toBeNull();
    expect(btn().hidden).toBe(false);
    expect(btn().getAttribute('aria-label')).toMatch(/Colorways/);
    expect(btn().getAttribute('aria-haspopup')).toBe('dialog');
    btn().click();
    expect(fanCalls).toHaveLength(1);
    expect(fanCalls[0].anchor).toBe(btn());
    expect(fanCalls[0].o.art.id).toBe(arts[0].id);
    expect(fanCalls[0].o.alternates).toHaveLength(4);
    expect(fanCalls[0].o.alternates[0].mode).toBe('curated');
    const cw = fanCalls[0].o.alternates[2];
    fanCalls[0].o.onPick(cw);
    expect(opened).toHaveLength(1);
    expect(opened[0].art.id).toBe(arts[0].id);
    expect(opened[0].cw).toBe(cw);
  });

  test('mosaic: the fan follows the letter last focused', async () => {
    const arts = await boot('mosaic');
    const lt = doc.querySelectorAll('.sp-lt')[2];
    lt.dispatchEvent(new win.FocusEvent('focusin', { bubbles: true }));
    btn().click();
    expect(fanCalls[0].o.art.id).toBe(cover.tiles()[2].art.id);
  });

  test('no art: the button is hidden', async () => {
    prefs = { coverStyle: 'band', coverWord: 'vectura', animateIn: 'plot', colorMode: 'curated' };
    cover = Cover.create({ host: doc.getElementById('host'), prefs: () => prefs, arts: async () => [], colorwaysFor: () => [], still: () => false, onOpen() {}, onPref() {}, onWordPick() {} });
    await cover.render({ animate: false });
    expect(btn().hidden).toBe(true);
  });
});

describe('Use as cover under Still', () => {
  test('scrolls instantly when Still is on (not only prefers-reduced-motion)', async () => {
    const arts = await boot('band');
    still = true;
    await cover.useAsCover(arts[2], { colorway: CW(9) });
    expect(scrolled[0].behavior).toBe('auto');
  });
  test('scrolls smoothly otherwise', async () => {
    const arts = await boot('band');
    await cover.useAsCover(arts[2], { colorway: CW(9) });
    expect(scrolled[0].behavior).toBe('smooth');
  });
});
