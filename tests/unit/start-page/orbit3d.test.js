/**
 * Start Page 3D detection (src/ui/start-page/orbit3d.js) — window.Vectura.StartPageOrbit3D.
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

  it('is only a detector now: no live model, mount or sway is exposed', () => {
    expect(O.mount).toBeUndefined();
    expect(Object.keys(O).sort()).toEqual(['MAP', 'isScene', 'modelFor', 'registerScene', 'sceneFromDoc']);
  });
});
