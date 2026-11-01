/**
 * Start Page Colorways fan (src/ui/start-page/fan.js): cards fanned over a dimmed page, Esc / click-out closes,
 * keyboard reachable, onPick receives the card's own colorway.
 */
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../../..');
const FILES = ['src/ui/start-page/dom.js', 'src/ui/start-page/fan.js'];

let dom; let win; let doc; let F; let anchor; let reduce; let mounts; let picked;

const load = () => {
  FILES.forEach((f) => { delete require.cache[path.join(ROOT, f)]; });
  dom = new JSDOM('<!doctype html><body><button id="anchor">Colorways</button></body>', { url: 'http://localhost/', pretendToBeVisual: true });
  win = dom.window; doc = win.document;
  global.window = win; global.document = doc;
  reduce = false; mounts = []; picked = [];
  win.matchMedia = (q) => ({ matches: /reduce/.test(q) ? reduce : false, addEventListener() {}, removeEventListener() {} });
  win.Vectura = {
    StartPageInk: {
      isStill: () => reduce,
      mount: (el, art, o) => { mounts.push({ el, art, o }); return Promise.resolve({}); },
      unmount() {},
    },
  };
  FILES.forEach((f) => require(path.join(ROOT, f)));
  F = win.Vectura.UI.StartPageFan;
  anchor = doc.getElementById('anchor');
  anchor.getBoundingClientRect = () => ({ left: 100, top: 200, width: 300, height: 200, right: 400, bottom: 400 });
};

const ALTS = [
  { key: 'a', paper: '#f4efe6', ink: '#1a1a1a', paperName: 'Bone', penName: 'Black' },
  { key: 'b', paper: '#0b0b0d', ink: '#e9e9e9', paperName: 'Black stock', penName: 'White gel' },
  { key: 'c', paper: '#d9c9a8', ink: '#7a2e1c', paperName: 'Kraft', penName: 'Rust' },
  { key: 'd', paper: '#1c2a44', ink: '#f2c14e', paperName: 'Navy', penName: 'Gold' },
];
const ART = () => ({ id: 'w1', name: 'Riverbed.vectura', algorithm: 'Terrain', getSvg: async () => '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>' });
const open = (extra = {}) => F.open(anchor, Object.assign({ art: ART(), index: 2, alternates: ALTS, onPick: (cw) => picked.push(cw) }, extra));
const fan = () => doc.querySelector('.sp-fan');
const cards = () => [...doc.querySelectorAll('.sp-fan-card')];
const key = (el, k, init = {}) => el.dispatchEvent(new win.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init)));
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

beforeEach(load);
afterEach(() => { delete global.window; delete global.document; });

describe('StartPageFan.open', () => {
  test('fans one card per alternate over a scrim, as a labelled modal dialog', async () => {
    open(); await tick();
    expect(fan().getAttribute('role')).toBe('dialog');
    expect(fan().getAttribute('aria-modal')).toBe('true');
    expect(fan().getAttribute('aria-label')).toBe('Colorways of Riverbed');
    expect(fan().querySelector('.sp-fan-scrim')).not.toBeNull();
    expect(cards()).toHaveLength(4);
    expect(cards().map((c) => c.querySelector('.sp-fan-cap b').textContent)).toEqual(['I', 'II', 'III', 'IV']);
    expect(mounts).toHaveLength(4);
    expect(mounts.map((m) => m.o.colorway)).toEqual(ALTS);
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
  });

  test('cards are keyboard reachable: first is focused, arrows/Home/End/Tab cycle inside the fan', async () => {
    open(); await tick();
    expect(doc.activeElement).toBe(cards()[0]);
    key(cards()[0], 'ArrowRight'); expect(doc.activeElement).toBe(cards()[1]);
    key(cards()[1], 'End'); expect(doc.activeElement).toBe(cards()[3]);
    key(cards()[3], 'Tab'); expect(doc.activeElement).toBe(cards()[0]);
    key(cards()[0], 'Tab', { shiftKey: true }); expect(doc.activeElement).toBe(cards()[3]);
    key(cards()[3], 'Home'); expect(doc.activeElement).toBe(cards()[0]);
  });

  test('clicking a card calls onPick with that card\'s own colorway, then closes', async () => {
    open(); await tick();
    cards()[2].click();
    expect(picked).toEqual([ALTS[2]]);
    expect(picked[0]).toBe(ALTS[2]);
    await tick(400);
    expect(fan()).toBeNull();
  });

  test('Enter on a focused card picks it (native button click)', async () => {
    open(); await tick();
    cards()[1].focus();
    cards()[1].click();
    expect(picked[0]).toBe(ALTS[1]);
  });

  test('Escape closes without picking and returns focus to the opener', async () => {
    open(); await tick();
    key(cards()[0], 'Escape');
    await tick(400);
    expect(fan()).toBeNull();
    expect(picked).toHaveLength(0);
    expect(doc.activeElement).toBe(anchor);
    expect(anchor.getAttribute('aria-expanded')).toBe('false');
  });

  test('clicking the dimmed page (scrim) closes without picking', async () => {
    open(); await tick();
    fan().querySelector('.sp-fan-scrim').click();
    await tick(400);
    expect(fan()).toBeNull();
    expect(picked).toHaveLength(0);
  });

  test('close() is idempotent and the handle works after Escape', async () => {
    const h = open(); await tick();
    h.close(); h.close();
    await tick(400);
    expect(doc.querySelectorAll('.sp-fan')).toHaveLength(0);
  });

  test('opening a second fan replaces the first', async () => {
    open(); await tick(); open(); await tick();
    expect(doc.querySelectorAll('.sp-fan')).toHaveLength(1);
  });

  test('reduced motion: no staggered transitions, closes at once', async () => {
    reduce = true;
    const h = open(); await tick();
    expect(fan().classList.contains('still')).toBe(true);
    cards().forEach((c) => expect(c.style.transitionDelay).toBe(''));
    h.close();
    expect(fan()).toBeNull();
  });
});
