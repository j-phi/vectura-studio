/**
 * Start Page live 3D models (src/ui/start-page/orbit3d.js) — window.Vectura.StartPageOrbit3D.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/ui/start-page/orbit3d.js'), 'utf8');

let dom; let W; let O; let rafQ; let stub;
const load = (still = false) => {
  dom = new JSDOM('<!doctype html><html><body><div id="m" style="width:300px;height:300px"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: false });
  W = dom.window;
  rafQ = [];
  W.requestAnimationFrame = (f) => rafQ.push(f);
  W.cancelAnimationFrame = () => {};
  W.matchMedia = () => ({ matches: still });
  W.Path2D = class { moveTo() {} lineTo() {} };
  const calls = { stroke: 0 };
  const noop = () => {};
  W.HTMLCanvasElement.prototype.getContext = () => ({ setTransform: noop, clearRect: noop, stroke: () => { calls.stroke++; }, setLineDash: noop, createLinearGradient: () => ({ addColorStop: noop }) });
  stub = calls;
  W.Element.prototype.getBoundingClientRect = () => ({ width: 300, height: 300, left: 0, top: 0, right: 300, bottom: 300 });
  vm.runInContext(SRC, dom.getInternalVMContext(), { filename: 'orbit3d.js' });
  O = W.Vectura.StartPageOrbit3D;
};
const key = (cv, k) => cv.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe('StartPageOrbit3D', () => {
  beforeEach(() => load());
  afterEach(() => dom.window.close());

  it('modelFor maps algorithm types', () => {
    expect(O.modelFor('topoform')).toBe('torus');
    expect(O.modelFor('spiralizer')).toBe('coiled-sphere');
    expect(O.modelFor('terrain')).toBe('terrain');
    expect(O.modelFor('terrain', 'terrain-alpine')).toBe('terrain-alpine');
    expect(O.modelFor('terrain', 'terrain-river-delta')).toBe('terrain');
    expect(O.modelFor('polyhedron')).toBe('icosahedron');
    expect(O.modelFor('flowfield')).toBe(null);
    expect(O.modelFor(null)).toBe(null);
  });

  it('mounts a canvas with a drawn-live label and a hint', () => {
    const el = W.document.getElementById('m');
    const h = O.mount(el, { type: 'topoform' });
    expect(h.model).toBe('torus');
    const cv = el.querySelector('canvas');
    expect(cv.getAttribute('aria-label')).toMatch(/drawn live/i);
    expect(el.querySelector('.vorbit-hint').textContent).toBe('Drag to rotate');
    expect(h.info.algo).toBe('Topoform');
  });

  it('keyboard arrows rotate the model (Still: immediate step)', () => {
    dom.window.close(); load(true);
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: 'icosahedron', colorway: { paper: '#111', ink: '#eee' } });
    const cv = el.querySelector('canvas');
    h.show && h.show();
    const before = h.matrix;
    key(cv, 'ArrowRight');
    expect(same(before, h.matrix)).toBe(false);
  });

  it('Still means shown finished and no sway frames', () => {
    dom.window.close(); load(true);
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: 'torus' });
    expect(h.plotted).toBe(1);
    const m0 = h.matrix;
    let t = 0;
    for (let i = 0; i < 40; i++) { const q = rafQ.splice(0); t += 400; q.forEach((f) => f(t)); }
    expect(same(m0, h.matrix)).toBe(true);
  });

  it('live recolor via setColorway paints the paper', () => {
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: 'torus', colorway: { paper: '#101010', ink: '#f0f0f0' } });
    const dark = el.style.backgroundColor;
    h.setColorway({ paper: '#f4efe6', ink: '#222222' });
    expect(el.style.backgroundColor).not.toBe(dark);
  });

  it('disc look: no border, outline or box-shadow on the element', () => {
    const el = W.document.getElementById('m');
    O.mount(el, { model: 'torus', disc: true });
    expect(el.style.borderRadius).toBe('50%');
    expect(el.style.border).toBe('');
    expect(el.style.boxShadow).toBe('');
    expect(W.document.getElementById('vorbit-css').textContent).not.toMatch(/\bborder\s*:|box-shadow/);
  });

  it('destroy removes canvas, hint, listeners and the motion subscription', () => {
    const el = W.document.getElementById('m');
    const adds = []; const rem = [];
    const a = W.addEventListener.bind(W); const r = W.removeEventListener.bind(W);
    W.addEventListener = (t, f, o) => { adds.push([t, f]); return a(t, f, o); };
    W.removeEventListener = (t, f, o) => { rem.push([t, f]); return r(t, f, o); };
    const h = O.mount(el, { model: 'torus' });
    const cv = el.querySelector('canvas');
    let removed = 0; const rc = cv.removeEventListener.bind(cv);
    cv.removeEventListener = (t, f, o) => { removed++; return rc(t, f, o); };
    h.destroy();
    expect(el.querySelector('canvas')).toBe(null);
    expect(el.querySelector('.vorbit-hint')).toBe(null);
    expect(el._vorbit).toBeUndefined();
    expect(removed).toBeGreaterThanOrEqual(6);
    adds.filter(([t]) => t === 'vectura:start-page-motion').forEach(([t, f]) => expect(rem.some(([t2, f2]) => t2 === t && f2 === f)).toBe(true));
  });
});
