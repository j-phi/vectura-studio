/**
 * @vitest-environment jsdom
 *
 * Start Page art runtime: mount() inlines small SVG and switches to a
 * device-pixel canvas (never CSS mask-image) for large pieces.
 */
const fs = require('fs');
const path = require('path');

const SRC = (p) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8');
const fixture = (n) => fs.readFileSync(path.resolve(__dirname, '../fixtures/start-page', n), 'utf8');

const ctxStub = () => {
  const calls = [];
  const target = { calls, canvas: null };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10, actualBoundingBoxLeft: 0, actualBoundingBoxRight: String(s).length * 10, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 6, fontBoundingBoxAscent: 24, fontBoundingBoxDescent: 8 });
      return (...a) => { calls.push([String(k), a]); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
};

const load = () => {
  vi.resetModules();
  delete window.Vectura;
  window.Vectura = {};
  HTMLCanvasElement.prototype.getContext = function () { if (!this._ctx) this._ctx = ctxStub(); return this._ctx; };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 0);
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  window.eval(SRC('src/core/start-page/art-geometry.js'));
  window.eval(SRC('src/ui/keyboard-inset.js')); // sole visualViewport reader (ink.js reads pinch scale through it)
  window.eval(SRC('src/ui/start-page/ink.js'));
  return window.Vectura.StartPageInk;
};

const colorway = { key: 'k', paper: '#f4efe4', ink: '#7a3b1e', ink2: null };

const sizeBox = (el, w, h) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => h });
};

// Build a > 250 KB synthetic SVG
const bigSvg = () => {
  let d = '';
  const paths = [];
  for (let i = 0; i < 1400; i++) {
    let s = `M ${i % 100} ${i % 37}`;
    for (let j = 1; j < 24; j++) s += ` L ${(i * 7 + j * 3.3) % 100} ${(i * 3 + j * 2.1) % 100}`;
    paths.push(`<path d="${s}"/>`);
  }
  d = paths.join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g stroke="currentColor" fill="none" stroke-width="0.30">${d}</g></svg>`;
};

describe('StartPageInk.mount', () => {
  let Ink;
  beforeEach(() => { Ink = load(); document.body.innerHTML = ''; });

  test('exports the contract API', () => {
    for (const k of ['mount', 'unmount', 'drawIn', 'finish', 'fillWord', 'setMotion']) expect(typeof Ink[k]).toBe('function');
    expect(Ink.DRAW_STYLES).toBeTruthy();
    expect(typeof Ink.DRAW_STYLES.plot).toBe('function');
  });

  test('small pieces stay inline vector SVG recolored through --sp-* custom properties', async () => {
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 300, 200);
    const h = await Ink.mount(el, { id: 'tre', svg: fixture('lissajous-trefoil.svg') }, { colorway, fit: 'cover' });
    expect(h.mode).toBe('svg');
    expect(el.querySelector('svg')).toBeTruthy();
    expect(el.querySelector('canvas.sp-ink-canvas')).toBeNull();
    expect(el.style.getPropertyValue('--sp-paper')).toBe('#f4efe4');
    expect(el.style.getPropertyValue('--sp-ink')).toBe('#7a3b1e');
    // cover window applied to the viewBox, aspect matches the box
    const vb = el.querySelector('svg').getAttribute('viewBox').split(' ').map(Number);
    expect(vb[2] / vb[3]).toBeCloseTo(300 / 200, 2);
    // recolor
    h.setColorway({ ...colorway, ink: '#112233', ink2: '#445566' });
    expect(el.style.getPropertyValue('--sp-ink')).toBe('#112233');
    expect(el.style.getPropertyValue('--sp-ink2')).toBe('#445566');
  });

  test('pieces over 250 KB rasterize into a device-pixel canvas, never a mask-image', async () => {
    const svg = bigSvg();
    expect(svg.length).toBeGreaterThan(250000);
    window.devicePixelRatio = 2;
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 320, 240);
    const h = await Ink.mount(el, { id: 'big', svg }, { colorway, pad: 0 });
    expect(h.mode).toBe('canvas');
    const cv = el.querySelector('canvas.sp-ink-canvas');
    expect(cv).toBeTruthy();
    expect(cv.width).toBe(640);
    expect(cv.height).toBe(480);
    expect(el.querySelector('svg')).toBeNull();
    expect(el.outerHTML).not.toMatch(/mask-image|mask:/);
    expect(getComputedStyle(cv).maskImage || '').toBe('');
  });

  test('canvas size follows DPR x visualViewport.scale (cap 4)', async () => {
    window.devicePixelRatio = 2;
    window.visualViewport = { scale: 1.5, addEventListener() {}, removeEventListener() {} };
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 200, 100);
    const h = await Ink.mount(el, { id: 'big2', svg: bigSvg() }, { colorway, pad: 0 });
    const cv = el.querySelector('canvas.sp-ink-canvas');
    expect(cv.width).toBe(600);
    expect(h.rasterScale).toBeCloseTo(3, 6);
    window.visualViewport = undefined;
  });

  // A replaced or destroyed raster tile must close its ImageBitmap (garbage collection is not prompt about their pixels).
  test('a re-raster closes the replaced bitmap, and destroy closes the current one', async () => {
    window.devicePixelRatio = 1;
    const closed = [];
    HTMLCanvasElement.prototype.close = function () { closed.push(this); };
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 200, 100);
    const h = await Ink.mount(el, { id: 'bigC', svg: bigSvg() }, { colorway, pad: 0 });
    expect(h.mode).toBe('canvas');
    const first = h.bmp;
    await h.raster();
    expect(h.bmp).not.toBe(first);
    expect(closed).toContain(first);
    const cur = h.bmp;
    Ink.unmount(el);
    expect(closed).toContain(cur);
    delete HTMLCanvasElement.prototype.close;
  });

  test('unmount removes everything it added', async () => {
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 100, 100);
    await Ink.mount(el, { id: 'tre', svg: fixture('lissajous-trefoil.svg') }, { colorway });
    Ink.unmount(el);
    expect(el.querySelector('svg')).toBeNull();
    expect(el.classList.contains('sp-ink')).toBe(false);
  });

  test('strips scripts and event handlers from inline SVG', async () => {
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 100, 100);
    const evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="window.__x=1"><script>window.__x=2</script><g stroke-width="0.3"><path onclick="window.__x=3" d="M 0 0 L 5 5"/></g></svg>';
    await Ink.mount(el, { id: 'evil', svg: evil }, { colorway });
    expect(el.innerHTML).not.toMatch(/<script|onload|onclick/i);
  });

  test('drawIn(plot) with still motion finishes instantly and resolves', async () => {
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 100, 100);
    await Ink.mount(el, { id: 'tre', svg: fixture('lissajous-trefoil.svg') }, { colorway });
    Ink.setMotion({ still: true });
    await Ink.drawIn(el, { style: 'plot' });
    expect(el.classList.contains('sp-ink-drawing')).toBe(false);
    expect(el.querySelector('canvas.sp-ink-draw')).toBeNull();
  });
});

describe('StartPageInk.fillWord', () => {
  test('sizes the canvas from the real ink box (descenders included) and fills with a single crop', async () => {
    const Ink = load(); document.body.innerHTML = '';
    window.devicePixelRatio = 2;
    const el = document.createElement('div'); document.body.appendChild(el); sizeBox(el, 600, 120);
    const h = await Ink.fillWord(el, 'Vectura', { id: 'tre', svg: fixture('lissajous-trefoil.svg') }, { colorway, font: { family: 'serif', weight: 700 } });
    const cv = el.querySelector('canvas.sp-word-fill');
    expect(cv).toBeTruthy();
    expect(h.inkBox.height).toBeGreaterThanOrEqual(h.inkBox.glyphHeight);
    expect(cv.width).toBe(Math.round(h.inkBox.width * h.dpr));
    expect(el.querySelector('.sp-word-text').textContent).toBe('Vectura');
    Ink.unmount(el);
    expect(el.querySelector('canvas')).toBeNull();
  });
});
