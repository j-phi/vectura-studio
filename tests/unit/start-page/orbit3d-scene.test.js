/**
 * Start Page live 3D models for 3D Scene pieces (src/ui/start-page/orbit3d.js).
 * A scene3d preset (e.g. the Studio Shadows pick) gets a live model built from its own objects and camera, so it
 * rotates on drag and rocks gently when idle, like the torus / sphere / terrain / icosahedron models.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SCENE_SRC = ['src/core/algorithms/geometry3d.js', 'src/core/scene3d/charts.js', 'src/core/scene3d/mesh.js', 'src/core/scene3d/scene.js', 'src/core/scene3d/params.js'];
const ORBIT = read('src/ui/start-page/orbit3d.js');
const studio = JSON.parse(read('user-presets/scene3d/studio-shadows.vectura'));
const PRESET = { id: 'scene3d-studio-shadows', name: studio.name, preset_system: 'scene3d', params: studio.layers[0].params };
const ID = 'scene:scene3d-studio-shadows';

let dom; let W; let O; let now; let rafQ; let timers; let lines;
const load = ({ scene = true } = {}) => {
  dom = new JSDOM('<!doctype html><html><body><div id="m" style="width:300px;height:300px"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: false });
  W = dom.window;
  now = 1000; rafQ = []; timers = []; lines = 0;
  W.performance.now = () => now;
  W.requestAnimationFrame = (f) => { rafQ.push(f); return rafQ.length; };
  W.cancelAnimationFrame = () => {};
  W.setTimeout = (f, ms) => { timers.push({ f, at: now + ms }); return timers.length; };
  W.clearTimeout = () => {};
  W.matchMedia = () => ({ matches: false });
  W.Path2D = class { moveTo() {} lineTo() { lines++; } };
  const noop = () => {};
  W.HTMLCanvasElement.prototype.getContext = () => ({ setTransform: noop, clearRect: noop, stroke: noop, setLineDash: noop, createLinearGradient: () => ({ addColorStop: noop }) });
  W.Element.prototype.getBoundingClientRect = () => ({ width: 300, height: 300, left: 0, top: 0, right: 300, bottom: 300 });
  const ctx = dom.getInternalVMContext();
  if (scene) SCENE_SRC.forEach((p) => vm.runInContext(read(p), ctx, { filename: p }));
  vm.runInContext('window.Vectura = window.Vectura || {}; window.Vectura.PRESETS = [];', ctx);
  W.Vectura.PRESETS.push(JSON.parse(JSON.stringify(PRESET)));
  vm.runInContext(ORBIT, ctx, { filename: 'orbit3d.js' });
  O = W.Vectura.StartPageOrbit3D;
};
const run = (ms) => {
  const end = now + ms;
  while (now < end) {
    now += 1000 / 60;
    timers.filter((t) => t.at <= now).forEach((t) => { timers.splice(timers.indexOf(t), 1); t.f(); });
    rafQ.splice(0).forEach((f) => f(now));
  }
};
const ptr = (cv, type, x, y) => cv.dispatchEvent(new W.MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }));
const differs = (a, b) => a.some((v, i) => Math.abs(v - b[i]) > 1e-6);

describe('StartPageOrbit3D: 3D Scene pieces', () => {
  beforeEach(() => load());
  afterEach(() => dom.window.close());

  it('modelFor gives a scene3d preset a live scene model, and nothing for an unknown preset', () => {
    expect(O.modelFor('scene3d', 'scene3d-studio-shadows')).toBe(ID);
    expect(O.modelFor('scene3d', 'no-such-preset')).toBe(null);
    expect(O.modelFor('scene3d')).toBe(null);
  });

  it('without the Scene3D modules there is no live model (the piece keeps its drawing)', () => {
    dom.window.close(); load({ scene: false });
    expect(O.modelFor('scene3d', 'scene3d-studio-shadows')).toBe(null);
  });

  it('mounts the scene posed by its own camera and draws its lines', () => {
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: ID, colorway: { paper: '#fff', ink: '#111' } });
    expect(h.model).toBe(ID);
    expect(h.info).toMatchObject({ title: 'Studio Shadows', algo: 'Scene 3D' });
    const cam = PRESET.params.camera; const r = (d) => d * Math.PI / 180;
    // home pose = roll · pitch · yaw (Geometry3D.rotatePoint order): row 1 col 2 is sin(pitch) for roll 0
    expect(h.matrix[7]).toBeCloseTo(Math.sin(r(cam.pitch)), 6);
    run(2500);
    expect(lines).toBeGreaterThan(200);
  });

  it('rotates on drag', () => {
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: ID });
    expect(h.model).toBe(ID);
    run(2500);
    const cv = el.querySelector('canvas');
    const before = h.matrix;
    ptr(cv, 'pointerdown', 100, 100); ptr(cv, 'pointermove', 160, 120); ptr(cv, 'pointerup', 160, 120);
    expect(differs(before, h.matrix)).toBe(true);
  });

  it('rocks gently back and forth when idle', () => {
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: ID });
    expect(h.model).toBe(ID);
    run(2000);
    const poses = [];
    for (let i = 0; i < 12; i++) { run(500); poses.push(h.matrix); }
    expect(poses.some((p, i) => i && differs(p, poses[i - 1]))).toBe(true);
    // subtle: never strays more than ~0.15 rad from the home pose
    const home = poses[0];
    poses.forEach((p) => p.forEach((v, i) => expect(Math.abs(v - home[i])).toBeLessThan(0.3)));
  });

  it('a saved scene TREE (scene group + Object 3D children) becomes a live model under its own key', () => {
    const obj = (id, primitive, params, x) => ({ id, type: 'object3d', parentId: 'g', visible: true, params: { primitive, params, transform: { x, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } } });
    const payload = { type: 'vectura', state: { engine: { layers: [
      { id: 'g', type: 'scene3d', isGroup: true, containerRole: 'scene', visible: true, params: { camera: { yaw: 40, pitch: 30, roll: 0 } } },
      obj('a', 'box', { sx: 30, sy: 30, sz: 30 }, -30),
      obj('b', 'sphere', { radius: 20, detail: 20 }, 30),
      { id: 'hid', type: 'object3d', parentId: 'g', visible: false, params: { primitive: 'box', params: { sx: 5, sy: 5, sz: 5 }, transform: { x: 500 } } },
      { id: 'gr', type: 'sceneGround3d', parentId: 'g', visible: true, params: {} },
    ] } } };
    const scene = O.sceneFromDoc(payload);
    expect(scene.objects.length).toBe(2); // the hidden object contributes nothing
    expect(scene.camera.yaw).toBe(40);
    expect(O.modelFor('object3d', 'work:7')).toBe(null);
    expect(O.registerScene('work:7', scene, 'My Scene')).toBe('scene:work:7');
    expect(O.modelFor('object3d', 'work:7')).toBe('scene:work:7');
    expect(O.modelFor('light', 'work:7')).toBe('scene:work:7'); // a tree's work label can be any child's
    const el = W.document.getElementById('m');
    const h = O.mount(el, { model: 'scene:work:7' });
    expect(h.model).toBe('scene:work:7');
    expect(h.info.title).toBe('My Scene');
    run(2500);
    expect(lines).toBeGreaterThan(100);
    expect(O.sceneFromDoc({ state: { engine: { layers: [{ id: 'x', type: 'rings', params: {} }] } } })).toBe(null);
  });
});

