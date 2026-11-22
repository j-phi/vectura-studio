/**
 * Start Page live 3D models, idle cost + keyboard role (src/ui/start-page/orbit3d.js).
 * The idle sway redraws at ~15 fps (not the display rate), parks after ~20 s without interaction and resumes on
 * pointer enter; the software z-buffer is reused while the view matrix is unchanged; the canvas is an operable
 * `application` whose name states the keys.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/ui/start-page/orbit3d.js'), 'utf8');

let dom; let W; let O; let now; let rafQ; let timers; let strokes;
const load = () => {
  dom = new JSDOM('<!doctype html><html><body><div id="m" style="width:300px;height:300px"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: false });
  W = dom.window;
  now = 1000; rafQ = []; timers = []; strokes = 0;
  W.performance.now = () => now;
  W.requestAnimationFrame = (f) => { rafQ.push(f); return rafQ.length; };
  W.cancelAnimationFrame = () => {};
  W.setTimeout = (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; };
  W.clearTimeout = () => {};
  W.matchMedia = () => ({ matches: false });
  W.Path2D = class { moveTo() {} lineTo() {} };
  const noop = () => {};
  W.HTMLCanvasElement.prototype.getContext = () => ({ setTransform: noop, clearRect: noop, stroke: () => { strokes++; }, setLineDash: noop, createLinearGradient: () => ({ addColorStop: noop }) });
  W.Element.prototype.getBoundingClientRect = () => ({ width: 300, height: 300, left: 0, top: 0, right: 300, bottom: 300 });
  vm.runInContext(SRC, dom.getInternalVMContext(), { filename: 'orbit3d.js' });
  O = W.Vectura.StartPageOrbit3D;
};
// Drive the page at 60 Hz for `ms`: due timers fire, queued rAF callbacks run with the frame time. Returns renders (5 strokes each).
const run = (ms) => {
  const before = strokes; const end = now + ms;
  while (now < end) {
    now += 1000 / 60;
    timers.filter((t) => t.at <= now).forEach((t) => { timers.splice(timers.indexOf(t), 1); t.f(); });
    const q = rafQ.splice(0); q.forEach((f) => f(now));
  }
  return Math.round((strokes - before) / 5);
};

describe('StartPageOrbit3D idle cost', () => {
  beforeEach(() => load());
  afterEach(() => dom.window.close());

  it('the sway redraws at ~15 fps, not at the display rate', () => {
    const el = W.document.getElementById('m');
    O.mount(el, { type: 'topoform', colorway: { paper: '#fff', ink: '#111' } });
    run(3000); // plot-in settled, idle threshold passed, sway eased in
    const renders = run(2000);
    expect(renders).toBeGreaterThan(18); // it is still swaying
    expect(renders).toBeLessThanOrEqual(36); // ~15 fps x 2 s (+ slack), a 24 fps loop would be ~48, a 60 fps loop ~120
  });

  it('keeps the canvas on its own compositor layer so a sway frame never repaints the plate around it', () => {
    const el = W.document.getElementById('m');
    O.mount(el, { type: 'topoform', colorway: { paper: '#fff', ink: '#111' } });
    expect(el.querySelector('canvas').style.willChange).toBe('transform');
  });

  it('the sway parks after ~20 s without interaction, schedules nothing, and resumes on pointer enter', () => {
    const el = W.document.getElementById('m');
    const h = O.mount(el, { type: 'topoform', colorway: { paper: '#fff', ink: '#111' } });
    run(24000);
    const pose = h.matrix.join(',');
    expect(run(2000)).toBe(0);
    expect(rafQ.length + timers.length).toBe(0); // the loop ended
    expect(h.matrix.join(',')).toBe(pose);
    el.querySelector('canvas').dispatchEvent(new W.Event('pointerenter'));
    expect(rafQ.length + timers.length).toBeGreaterThan(0);
    run(3000);
    expect(run(1000)).toBeGreaterThan(5); // swaying again
  });

  it('reuses the z-buffer while the view matrix has not changed', () => {
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: 'terrain', colorway: { paper: '#fff', ink: '#111' } });
    run(300); // plot-in done, no sway yet
    const before = h.stats.zbufferReuses;
    h.setColorway({ paper: '#eee', ink: '#222' }); // repaint, same matrix
    run(100);
    expect(h.stats.zbufferReuses).toBeGreaterThan(before);
  });
});

describe('StartPageOrbit3D keyboard role', () => {
  beforeEach(() => load());
  afterEach(() => dom.window.close());
  it('is an application whose accessible name states the keys', () => {
    const el = W.document.getElementById('m');
    O.mount(el, { type: 'topoform' });
    const cv = el.querySelector('canvas');
    expect(cv.getAttribute('role')).toBe('application');
    expect(cv.tabIndex).toBe(0);
    expect(cv.getAttribute('aria-label')).toMatch(/arrow keys/i);
  });
});
