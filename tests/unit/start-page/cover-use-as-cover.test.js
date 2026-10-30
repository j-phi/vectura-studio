/**
 * StartPageCover.useAsCover(art, { colorway, frame, fill }) in each cover style: scrolls to the top, takes the
 * piece into the cover (mosaic letter 01 / the word / the band), passes frame + fill to the band, offers Undo.
 * Ink and the toast are stubbed (jsdom has no 2D canvas); the cover module itself is the real one.
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../../..');
const FILES = [
  'src/ui/start-page/dom.js', 'src/ui/start-page/icons.js', 'src/core/start-page/cover-words.js', 'src/core/start-page/plate-fills.js',
  'src/ui/start-page/word-picker.js', 'src/ui/start-page/cover.js',
];

let dom; let win; let doc; let Cover; let cover; let calls; let toasts; let reduce; let prefs; let scrolled;

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
  reduce = false; toasts = []; scrolled = [];
  win.matchMedia = (q) => ({ matches: /reduce/.test(q) ? reduce : false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(win, 'scrollY', { value: 400, writable: true, configurable: true });
  Object.defineProperty(win, 'pageYOffset', { get: () => win.scrollY, configurable: true });
  win.scrollTo = (a, b) => { const top = typeof a === 'object' ? a.top : b; scrolled.push(typeof a === 'object' ? a : { top }); win.scrollY = top; };
  calls = { fillWord: [], mount: [], drawIn: [], unmount: [] };
  win.Vectura = {
    UI: { overlays: { Toast: { show: (p) => { toasts.push(p); return { dismiss() {}, el: doc.createElement('div') }; } } } },
    StartPageInk: {
      isStill: () => false, finish() {}, setMotion() {},
      unmount: (el) => { calls.unmount.push(el); },
      mount: (el, art, o) => { calls.mount.push({ el, art, o }); el._spInk = { setColorway(cw) { el._cw = cw; } }; return Promise.resolve({}); },
      fillWord: (el, word, art, o) => { calls.fillWord.push({ el, word, art, o }); el._spWord = { setColorway(cw) { el._cw = cw; }, refit() {} }; return Promise.resolve({}); },
      drawIn: (el, o) => { calls.drawIn.push({ el, o }); return Promise.resolve({}); },
    },
  };
  FILES.forEach((f) => require(path.join(ROOT, f)));
  Cover = win.Vectura.UI.StartPageCover;
};

const boot = async (style, nArts = 8) => {
  prefs = { coverStyle: style, coverWord: 'vectura', animateIn: 'plot', showName: false, showLine: false };
  const arts = makeArts(nArts);
  cover = Cover.create({
    host: doc.getElementById('host'),
    prefs: () => prefs,
    arts: async () => arts,
    colorwaysFor: (list) => list.map((a, i) => CW(i)),
    still: () => false,
    onOpen() {}, onPref() {}, onWordPick() {},
  });
  await cover.render({ animate: false });
  return arts;
};
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const toast = () => toasts[toasts.length - 1];

beforeEach(load);
afterEach(() => { try { cover && cover.destroy(); } catch (_) { /* noop */ } delete global.window; delete global.document; });

describe('useAsCover', () => {
  test('mosaic: the piece takes letter 01, every letter re-plots, no piece repeats, and Undo restores', async () => {
    const arts = await boot('mosaic');
    const before = cover.tiles().map((t) => t.art.id);
    expect(before[0]).toBe('w0');
    const cw = { key: 'plate-cw', paper: '#0b0b0d', ink: '#ffffff', ink2: null, name: 'Plate', penName: 'White gel', paperName: 'Black' };
    const done = cover.useAsCover(arts[5], { colorway: cw, frame: { fit: 'cover', z: 1.4, cx: 0.4, cy: 0.5 }, fill: null });
    expect(done).toBeInstanceOf(win.Promise);
    await done;
    const after = cover.tiles();
    expect(after[0].art.id).toBe('w5');
    expect(new Set(after.map((t) => t.art.id)).size).toBe(after.length);
    expect(after[0].cw).toMatchObject({ paper: '#0b0b0d', ink: '#ffffff' });
    expect(calls.fillWord.length).toBeGreaterThanOrEqual(14); // initial 7 + the re-fill of 7
    await tick(1600);
    expect(calls.drawIn.length).toBeGreaterThan(0); // letters plot in again
    expect(scrolled.length).toBeGreaterThan(0);
    expect(scrolled[0]).toMatchObject({ top: 0 });
    expect(toast().message).toMatch(/Piece 6/);
    expect(toast().message).toMatch(/first letter/);
    expect(toast().action.label).toBe('Undo');
    await toast().action.onAction({ dismiss() {}, disableAction() {} });
    await tick(100);
    expect(cover.tiles().map((t) => t.art.id)).toEqual(before);
  });

  test('word: the word re-fills with the piece in the given colorway; Undo restores the old piece', async () => {
    const arts = await boot('word');
    expect(cover.tiles()[0].art.id).toBe('w0');
    const n0 = calls.fillWord.length;
    await cover.useAsCover(arts[3], { colorway: CW(9), frame: null, fill: null });
    expect(cover.tiles()[0].art.id).toBe('w3');
    expect(cover.tiles()[0].cw.key).toBe('cw9');
    expect(calls.fillWord.length).toBe(n0 + 1);
    expect(calls.fillWord[n0].art.id).toBe('w3');
    expect(toast().message).toMatch(/fills the cover word/);
    await toast().action.onAction({ dismiss() {}, disableAction() {} });
    await tick(100);
    expect(cover.tiles()[0].art.id).toBe('w0');
  });

  test('band: the band mounts the piece with the plate frame and fill, then fades the old band out', async () => {
    const arts = await boot('band');
    const frame = { fit: 'cover', z: 1.6, cx: 0.3, cy: 0.6 };
    await cover.useAsCover(arts[2], { colorway: CW(7), frame, fill: 'iridescent' });
    const last = calls.mount[calls.mount.length - 1];
    expect(last.art.id).toBe('w2');
    expect(last.o.frame).toEqual(frame);
    // the fill travels in colorway.fill (the spec StartPageInk paints), built from the colorway on screen
    expect(last.o.colorway.fill.kind).toBe('iridescent');
    expect(last.o.colorway.fill.stops.length).toBeGreaterThan(2);
    expect(last.o.colorway.paper).toBe('#10131a');
    expect(cover.tiles()[0].art.id).toBe('w2');
    await tick(700);
    expect(doc.querySelectorAll('.sp-pf')).toHaveLength(1); // old band gone after the cross-fade
    expect(toast().message).toMatch(/is now the cover/);
    await toast().action.onAction({ dismiss() {}, disableAction() {} });
    await tick(700);
    expect(cover.tiles()[0].art.id).toBe('w0');
    expect(doc.querySelectorAll('.sp-pf')).toHaveLength(1);
  });

  test('the special fill reaches the ink in every cover style (spec with stops in colorway.fill)', async () => {
    for (const style of ['mosaic', 'word', 'band']) {
      const arts = await boot(style);
      const n = (style === 'band' ? calls.mount : calls.fillWord).length;
      await cover.useAsCover(arts[2], { colorway: CW(3), fill: { kind: 'metallic-gold', stops: [[0, '#111']] } });
      const list = style === 'band' ? calls.mount : calls.fillWord;
      const call = list.slice(n).find((c) => c.art.id === 'w2');
      expect(call, style).toBeTruthy();
      const cw = call.o.colorway;
      expect(cw.fill.kind, style).toBe('metallic-gold');
      expect(cw.fill.stops.length, style).toBeGreaterThan(2);
      expect(cw.paper, style).toBe('#10131a');
      cover.destroy();
    }
  });

  test('a restored cover (a saved fill kind) rebuilds the spec from the colorway it shows; a mode switch keeps the fill', async () => {
    const arts = await boot('band');
    cover.setOverride({ art: arts[4], frame: null, fill: 'sunset' });
    await cover.render({ animate: false });
    const last = calls.mount[calls.mount.length - 1];
    expect(last.art.id).toBe('w4');
    expect(last.o.colorway.fill.kind).toBe('sunset');
    expect(last.o.colorway.fill.stops.length).toBeGreaterThan(1);
  });

  test('reduced motion: scrolls instantly, no cross-fade element, no plot-in, still resolves with Undo', async () => {
    reduce = true;
    const arts = await boot('band');
    await cover.useAsCover(arts[1], { colorway: CW(2), frame: null, fill: null });
    expect(scrolled[0].behavior).toBe('auto');
    expect(doc.querySelectorAll('.sp-pf')).toHaveLength(1);
    expect(calls.drawIn).toHaveLength(0);
    expect(toast().action.label).toBe('Undo');
  });

  test('the colorway is optional: without one the cover colors itself', async () => {
    const arts = await boot('word');
    await cover.useAsCover(arts[4], {});
    expect(cover.tiles()[0].art.id).toBe('w4');
    expect(cover.tiles()[0].cw.key).toBe('cw0');
  });

  test('the new cover survives a style change (render) and a recolor drops only the pinned colorway', async () => {
    const arts = await boot('word');
    await cover.useAsCover(arts[6], { colorway: CW(8) });
    prefs.coverStyle = 'band';
    await cover.render({ animate: false });
    expect(cover.tiles()[0].art.id).toBe('w6');
    cover.recolor();
    expect(cover.tiles()[0].cw.key).toBe('cw0');
  });
});
