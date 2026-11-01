// Shared jsdom harness for the Start Page hover-effect tests: loads the real modules from disk
// (so each script runs exactly as the lazy loader would run it), fakes rAF with a manual clock, and
// builds a stand-in ink handle (the Start Page art runtime is covered by its own tests).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BASE = 'http://localhost/src/ui/start-page/hover-fx/';

const ctxStub = () => new Proxy({}, {
  get(t, k) {
    if (k in t) return t[k];
    if (k === 'createLinearGradient' || k === 'createConicGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
  set(t, k, v) { t[k] = v; return true; },
});

const sizeBox = (el, w, h) => {
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => h });
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0 });
};

/** Fresh window.Vectura with art-geometry + the hover-fx loader. Script elements appended to <head> are
 *  "fetched" from disk: their source is evaluated and onload fires, and the URL is recorded in `fetched`. */
const load = ({ still = false, reduced = false } = {}) => {
  delete window.Vectura;
  window.Vectura = {};
  HTMLCanvasElement.prototype.getContext = function getContext() { if (!this._ctx) this._ctx = ctxStub(); return this._ctx; };
  window.matchMedia = () => ({ matches: reduced, addEventListener() {}, removeEventListener() {} });
  const clock = { now: 0, queue: [], id: 0 };
  window.requestAnimationFrame = (cb) => { clock.queue.push([++clock.id, cb]); return clock.id; };
  window.cancelAnimationFrame = (id) => { clock.queue = clock.queue.filter(([i]) => i !== id); };
  /** run frames at 60 Hz for `ms` of fake time; returns the number of frames run */
  clock.run = (ms) => {
    let n = 0; const end = clock.now + ms;
    while (clock.now < end) {
      clock.now += 1000 / 60;
      const q = clock.queue; clock.queue = [];
      q.forEach(([, cb]) => cb(clock.now)); n += q.length;
      if (!q.length && !clock.queue.length) { clock.now = end; break; }
    }
    return n;
  };
  document.head.innerHTML = ''; document.body.innerHTML = '';
  const fetched = [];
  const realAppend = document.head.appendChild.bind(document.head);
  document.head.appendChild = (node) => {
    if (node && node.tagName === 'SCRIPT' && node.src) {
      fetched.push(node.src);
      const rel = node.src.replace(BASE, '');
      let src;
      try { src = read(`src/ui/start-page/hover-fx/${rel}`); } catch (e) { setTimeout(() => node.onerror && node.onerror(new Error('404')), 0); return node; }
      setTimeout(() => { window.eval(src); node.onload && node.onload(); }, 0);
      return node;
    }
    return realAppend(node);
  };
  window.eval(read('src/core/start-page/art-geometry.js'));
  window.eval(read('src/ui/start-page/hover-fx/index.js'));
  const H = window.Vectura.StartPageHoverFx;
  H.setBase(BASE);
  H.setMotion({ still });
  return { H, fetched, clock, V: window.Vectura };
};

/** A tile element + the handle shape hover effects read from StartPageInk (box, parsed, w/h, look, colorway). */
const makeTile = (w = 400, h = 300) => {
  const el = document.createElement('div'); el.className = 'sp-ink';
  const box = document.createElement('div'); box.className = 'sp-ink-art'; el.appendChild(box);
  document.body.appendChild(el); sizeBox(el, w, h); sizeBox(box, w, h);
  const poly = (k) => { const p = []; for (let i = 0; i < 40; i++) p.push(20 + (i * 2 + k * 3) % 60, 20 + Math.sin(i / 5 + k) * 25 + 30); return Float32Array.from(p); };
  const polys = [0, 1, 2, 3, 4, 5].map(poly);
  const parsed = { vb: [0, 0, 100, 100], polys, widths: polys.map(() => 0.3), lens: polys.map(() => 50), total: 300, strokes: polys.length };
  const handle = {
    kind: 'tile', el, box, parsed, mode: 'svg', fit: 'contain', w, h, win: [0, 0, 100, 100], s: 3, look: { lw: 0.6, alpha: 1 },
    colorway: { paper: '#f4efe4', ink: '#7a3b1e', ink2: null, key: 'k' }, run: null,
    ready: Promise.resolve(), alive: () => el._spInk === handle,
  };
  el._spInk = handle;
  return { el, box, handle };
};

module.exports = { load, makeTile, sizeBox, read, BASE };
