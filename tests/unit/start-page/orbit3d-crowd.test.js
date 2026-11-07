/**
 * Start Page live 3D models, shared sway budget (src/ui/start-page/orbit3d.js).
 * One swaying model keeps ~15 fps. With 2 or more swaying on screen at once, each drops to ~8 fps (START_PAGE.ORBIT_SWAY), so three
 * models cost about half of what three independent 15 fps loops did; a model whose frames overrun its budget drops too.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/ui/start-page/orbit3d.js'), 'utf8');

let dom; let W; let O; let now; let rafQ; let timers; let strokes; let frameCost;
const load = () => {
  dom = new JSDOM('<!doctype html><html><body><div id="a"></div><div id="b"></div><div id="c"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only' });
  W = dom.window;
  now = 1000; rafQ = []; timers = []; strokes = 0; frameCost = 0;
  W.performance.now = () => now;
  W.requestAnimationFrame = (f) => { rafQ.push(f); return rafQ.length; };
  W.cancelAnimationFrame = () => {};
  W.setTimeout = (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; };
  W.clearTimeout = () => {};
  W.matchMedia = () => ({ matches: false });
  W.Path2D = class { moveTo() {} lineTo() {} };
  const noop = () => {};
  W.HTMLCanvasElement.prototype.getContext = () => ({ setTransform: noop, clearRect: noop, stroke: () => { strokes++; now += frameCost / 5; }, setLineDash: noop, createLinearGradient: () => ({ addColorStop: noop }) });
  W.Element.prototype.getBoundingClientRect = () => ({ width: 300, height: 300, left: 0, top: 0, right: 300, bottom: 300 });
  vm.runInContext(SRC, dom.getInternalVMContext(), { filename: 'orbit3d.js' });
  O = W.Vectura.StartPageOrbit3D;
};
const run = (ms) => {
  const before = strokes; const end = now + ms;
  while (now < end) {
    now += 1000 / 60;
    timers.filter((t) => t.at <= now).forEach((t) => { timers.splice(timers.indexOf(t), 1); t.f(); });
    rafQ.splice(0).forEach((f) => f(now));
  }
  return Math.round((strokes - before) / 5);
};
const cw = { paper: '#fff', ink: '#111' };

describe('StartPageOrbit3D shared sway budget', () => {
  beforeEach(() => load());
  afterEach(() => dom.window.close());

  it('three swaying models redraw at ~8 fps each, well under three 15 fps loops', () => {
    ['a', 'b', 'c'].forEach((id) => O.mount(W.document.getElementById(id), { type: 'topoform', colorway: cw }));
    run(3500);
    const total = run(2000);
    expect(total).toBeGreaterThan(30); // all three still sway (8 fps x 3 x 2 s = 48)
    expect(total).toBeLessThanOrEqual(60); // three 15 fps loops would be ~90
  });

  it('a single model keeps its ~15 fps, and returns to it when the others are destroyed', () => {
    const hs = ['a', 'b', 'c'].map((id) => O.mount(W.document.getElementById(id), { type: 'topoform', colorway: cw }));
    run(3500);
    hs[1].destroy(); hs[2].destroy();
    run(1000);
    const renders = run(2000);
    expect(renders).toBeGreaterThan(18);
    expect(renders).toBeLessThanOrEqual(36);
  });

  it('a lone model whose frames overrun the budget drops to the crowded rate', () => {
    O.mount(W.document.getElementById('a'), { type: 'topoform', colorway: cw });
    run(3500);
    frameCost = 40; // each draw "takes" 40 ms (over overrunMs)
    run(1500);
    const renders = run(2000);
    expect(renders).toBeLessThanOrEqual(20); // ~8 fps x 2 s (+ slack); 15 fps would be ~30
  });
});
