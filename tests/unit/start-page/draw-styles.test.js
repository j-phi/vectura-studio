/*
 * Start Page draw-in styles (src/ui/start-page/draw-styles.js) on top of the real ink.js runtime:
 * registration, k=1 end states, finish(), Still, both handle modes, and the hover re-trigger timing.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '../../..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><g fill="none" stroke="#000" stroke-width="0.3">'
  + '<path d="M5 5 L95 5 L95 75 L5 75 Z"/><path d="M10 10 L90 70"/><path d="M10 70 L90 10"/><path d="M50 5 L50 75"/></g></svg>';
const BIG = `${SVG.slice(0, -6)}<!--${'x'.repeat(260000)}--></svg>`; // > 250 KB: canvas mode (comment is stripped by sanitize)

const ctxProxy = () => new Proxy({ calls: [] }, {
  get(t, k) {
    if (k === 'calls') return t.calls;
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return (...a) => { t.calls.push([k, a]); };
  },
  set() { return true; },
});

let dom; let win; let clock; let rafQ;
const boot = () => {
  dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: false, url: 'http://localhost/' });
  win = dom.window; clock = 0; rafQ = [];
  win.performance.now = () => clock;
  win.requestAnimationFrame = (fn) => { rafQ.push(fn); return rafQ.length; };
  win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(win.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 200; } });
  Object.defineProperty(win.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 160; } });
  win.HTMLCanvasElement.prototype.getContext = function getContext() { return (this._c = this._c || ctxProxy()); };
  ['src/core/start-page/art-geometry.js', 'src/ui/start-page/ink.js', 'src/ui/start-page/draw-styles.js'].forEach((f) => win.eval(src(f)));
};
const step = (to) => { clock = to; const q = rafQ; rafQ = []; q.forEach((f) => f(clock)); };
const flush = () => new Promise((r) => setTimeout(r, 0));
const mountTile = async (svg = SVG) => {
  const el = win.document.createElement('div'); win.document.body.appendChild(el);
  const h = await win.Vectura.StartPageInk.mount(el, { id: 't', svg }, { colorway: { paper: '#fff', ink: '#111' } });
  return { el, h };
};

const STYLES = ['sweep', 'cascade', 'fade', 'bleed', 'scan', 'iris', 'none'];
const LAYER = ['fade', 'bleed', 'scan', 'iris'];
const residue = (h) => ['opacity', 'transform', 'filter', 'clip-path', 'mask-image', 'will-change'].map((p) => h.box.style.getPropertyValue(p)).join('');

beforeEach(boot);
afterEach(() => { dom.window.close(); });

describe('registration', () => {
  test('every style registers on StartPageInk next to plot', () => {
    const D = win.Vectura.StartPageInk.DRAW_STYLES;
    ['plot', ...STYLES].forEach((s) => expect(typeof D[s]).toBe('function'));
    expect(win.Vectura.StartPageDrawStyles.STYLES).toEqual(expect.arrayContaining(STYLES));
  });
});

describe.each([['svg', SVG], ['canvas', BIG]])('%s handle', (mode, svg) => {
  test('mode is as expected', async () => {
    const { h } = await mountTile(svg);
    expect(h.mode).toBe(mode);
  });

  test.each(STYLES)('%s: runs, reaches k=1 and leaves the art clean', async (style) => {
    const { el, h } = await mountTile(svg);
    const p = win.Vectura.StartPageInk.drawIn(h, { style, duration: 1000 });
    await flush();
    step(10);
    if (style !== 'none') expect(el.classList.contains('sp-ink-drawing')).toBe(true);
    step(500);
    step(1200);
    await p;
    expect(el.classList.contains('sp-ink-drawing')).toBe(false);
    expect(h.run).toBeNull();
    expect(residue(h)).toBe('');
    expect(el.hasAttribute('data-sp-ds')).toBe(false);
  });

  test.each(STYLES)('%s: finish() completes it instantly', async (style) => {
    const { el, h } = await mountTile(svg);
    const p = win.Vectura.StartPageInk.drawIn(h, { style, duration: 5000 });
    await flush(); step(100);
    win.Vectura.StartPageInk.finish(h);
    await p;
    expect(h.run).toBeNull();
    expect(el.classList.contains('sp-ink-drawing')).toBe(false);
    expect(residue(h)).toBe('');
    expect(h.box.querySelectorAll('.sp-ink-draw').length).toBe(0);
  });

  test.each(STYLES)('%s: Still means instant, no animation', async (style) => {
    const { el, h } = await mountTile(svg);
    win.Vectura.StartPageInk.setMotion({ still: true });
    await win.Vectura.StartPageInk.drawIn(h, { style, duration: 5000 });
    expect(h.run).toBeNull();
    expect(el.classList.contains('sp-ink-drawing')).toBe(false);
    expect(residue(h)).toBe('');
  });
});

describe('art-layer styles animate the art layer', () => {
  test.each(LAYER)('%s changes the layer mid-run and keeps the art visible', async (style) => {
    const { h } = await mountTile();
    win.Vectura.StartPageInk.drawIn(h, { style, duration: 1000 });
    await flush(); step(5); step(300);
    expect(residue(h)).not.toBe('');
    expect(h.svg.style.opacity).toBe('1'); // beats `.sp-ink-drawing .sp-ink-svg { opacity: 0 }`
    win.Vectura.StartPageInk.finish(h);
    expect(h.svg.style.opacity).toBe('');
  });

  test('scan starts fully clipped, iris starts as a point', async () => {
    const { h } = await mountTile();
    win.Vectura.StartPageInk.drawIn(h, { style: 'scan', duration: 1000 });
    await flush();
    expect(h.box.style.getPropertyValue('clip-path')).toMatch(/inset\(0(px)? 0(px)? 100(\.0+)?% 0(px)?\)/);
    win.Vectura.StartPageInk.finish(h);
    win.Vectura.StartPageInk.drawIn(h, { style: 'iris', duration: 1000 });
    await flush();
    expect(h.box.style.getPropertyValue('clip-path')).toMatch(/circle\(0(\.0+)?%/);
  });
});

describe('stroke pipeline', () => {
  test('cascade strokes every polyline exactly once by k=1', async () => {
    const { h } = await mountTile();
    const n = h.parsed.polys.length;
    win.Vectura.StartPageInk.drawIn(h, { style: 'cascade', duration: 1000 });
    await flush(); step(5);
    const cv = h.box.querySelector('.sp-ink-draw');
    expect(cv).toBeTruthy();
    const starts = () => cv._c.calls.filter((c) => c[0] === 'moveTo').length;
    step(400);
    const mid = starts();
    expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(n);
    step(1100);
    expect(starts()).toBe(n);
  });

  test('sweep composes a masked frame mid-run and an unmasked one at the end', async () => {
    const { h } = await mountTile();
    win.Vectura.StartPageInk.drawIn(h, { style: 'sweep', duration: 1000 });
    await flush(); step(5); step(450);
    const cv = h.box.querySelector('.sp-ink-draw');
    expect(cv._c.calls.some((c) => c[0] === 'drawImage')).toBe(true);
    expect(cv._c.calls.some((c) => c[0] === 'fillRect')).toBe(true);
    cv._c.calls.length = 0;
    step(1200);
    // the closing frame has no destination-in mask fill
    expect(cv._c.calls.some((c) => c[0] === 'fillRect')).toBe(false);
  });
});

describe('retrigger', () => {
  const vi_ = vi;
  beforeEach(() => { vi_.useFakeTimers(); win.setTimeout = setTimeout; win.clearTimeout = clearTimeout; win.Date = Date; });
  afterEach(() => { vi_.useRealTimers(); });
  const ev = (type, x = 0, y = 0) => new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: false });
  const setup = async (opts) => {
    const { el, h } = await mountTile();
    const calls = [];
    const real = win.Vectura.StartPageInk.drawIn;
    win.Vectura.StartPageInk.drawIn = (t, o) => { calls.push(o); h.run = { fake: true }; return Promise.resolve(h); };
    const fin = [];
    win.Vectura.StartPageInk.finish = (t) => { fin.push(t); h.run = null; };
    const ctl = win.Vectura.StartPageDrawStyles.retrigger(h, 'fade', opts);
    return { el, h, calls, fin, ctl, real };
  };

  test('fires once per entry after the rest time', async () => {
    const { el, h, calls, ctl } = await setup();
    el.dispatchEvent(ev('pointerenter', 10, 10));
    vi_.advanceTimersByTime(100); expect(calls.length).toBe(0);
    vi_.advanceTimersByTime(30); expect(calls.length).toBe(1);
    expect(calls[0].style).toBe('fade');
    h.run = null; vi_.advanceTimersByTime(5000); expect(calls.length).toBe(1);
    expect(ctl.fired()).toBe(1);
  });

  test('moves over 4 px restart the rest, jitter under 4 px does not', async () => {
    const { el, calls } = await setup();
    el.dispatchEvent(ev('pointerenter', 10, 10));
    vi_.advanceTimersByTime(80); el.dispatchEvent(ev('pointermove', 12, 11)); // 2.2 px: ignored
    vi_.advanceTimersByTime(50); expect(calls.length).toBe(1);
    el.dispatchEvent(ev('pointerleave'));
    vi_.advanceTimersByTime(2000);
    el.dispatchEvent(ev('pointerenter', 0, 0));
    vi_.advanceTimersByTime(100); el.dispatchEvent(ev('pointermove', 30, 0)); // real move: restarts
    vi_.advanceTimersByTime(100); expect(calls.length).toBe(1);
    vi_.advanceTimersByTime(40); expect(calls.length).toBe(2);
  });

  test('cooldown 1.8 s between runs', async () => {
    const { el, h, calls } = await setup();
    el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(130); expect(calls.length).toBe(1);
    el.dispatchEvent(ev('pointerleave')); h.run = null;
    el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(300); expect(calls.length).toBe(1);
    el.dispatchEvent(ev('pointerleave'));
    vi_.advanceTimersByTime(1600);
    el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(130); expect(calls.length).toBe(2);
  });

  test('scroll restarts the rest timer', async () => {
    const { el, calls } = await setup();
    el.dispatchEvent(ev('pointerenter', 0, 0));
    vi_.advanceTimersByTime(100); win.dispatchEvent(new win.Event('scroll'));
    vi_.advanceTimersByTime(100); expect(calls.length).toBe(0);
    vi_.advanceTimersByTime(30); expect(calls.length).toBe(1);
  });

  test('leaving mid-animation finishes it; leaving before the rest cancels', async () => {
    const { el, h, calls, fin } = await setup();
    el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(130);
    el.dispatchEvent(ev('pointerleave')); expect(fin.length).toBe(1);
    vi_.advanceTimersByTime(3000);
    h.run = null; el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(50);
    el.dispatchEvent(ev('pointerleave')); vi_.advanceTimersByTime(500); expect(calls.length).toBe(1);
  });

  test('disabled when Still, and Still mid-run finishes it', async () => {
    const { el, calls, fin } = await setup();
    win.Vectura.StartPageInk.isStill = () => true;
    el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(500); expect(calls.length).toBe(0);
    win.Vectura.StartPageInk.isStill = () => false;
    win.dispatchEvent(new win.CustomEvent('vectura:start-page-motion', { detail: { still: false } }));
    el.dispatchEvent(ev('pointerleave')); vi_.advanceTimersByTime(2000);
    el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(130); expect(calls.length).toBe(1);
    win.dispatchEvent(new win.CustomEvent('vectura:start-page-motion', { detail: { still: true } }));
    expect(fin.length).toBe(1);
  });

  test('destroy removes the listeners', async () => {
    const { el, calls, ctl } = await setup();
    ctl.destroy();
    el.dispatchEvent(ev('pointerenter', 0, 0)); vi_.advanceTimersByTime(500); expect(calls.length).toBe(0);
  });
});
