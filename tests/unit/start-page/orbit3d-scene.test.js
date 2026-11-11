/**
 * Start Page 3D Scene pieces in src/ui/start-page/orbit3d.js: recognised, never drawn here.
 * A 3D Scene (a scene3d preset, or a saved work's scene registered with registerScene) gets a 'scene:<key>' model id so
 * the Start Page knows it turns, but orbit3d does not draw it: StartPageSceneOrbit turns the piece's own drawing with
 * real renders (tests/unit/start-page/scene-orbit.test.js), so its fills and shadow shapes match the app.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ORBIT = read('src/ui/start-page/orbit3d.js');
const studio = JSON.parse(read('user-presets/scene3d/studio-shadows.vectura'));
const PRESET = { id: 'scene3d-studio-shadows', name: studio.name, preset_system: 'scene3d', params: studio.layers[0].params };
const ID = 'scene:scene3d-studio-shadows';

let dom; let W; let O;
const load = ({ params = true } = {}) => {
  dom = new JSDOM('<!doctype html><html><body><div id="m" style="width:300px;height:300px"></div></body></html>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: false });
  W = dom.window;
  W.requestAnimationFrame = () => 0;
  W.cancelAnimationFrame = () => {};
  W.matchMedia = () => ({ matches: false });
  const ctx = dom.getInternalVMContext();
  if (params) ['src/core/algorithms/geometry3d.js', 'src/core/scene3d/params.js'].forEach((p) => vm.runInContext(read(p), ctx, { filename: p }));
  vm.runInContext('window.Vectura = window.Vectura || {}; window.Vectura.PRESETS = [];', ctx);
  W.Vectura.PRESETS.push(JSON.parse(JSON.stringify(PRESET)));
  vm.runInContext(ORBIT, ctx, { filename: 'orbit3d.js' });
  O = W.Vectura.StartPageOrbit3D;
};

describe('StartPageOrbit3D: 3D Scene pieces', () => {
  beforeEach(() => load());
  afterEach(() => dom.window.close());

  it('modelFor gives a scene3d preset a scene id, and nothing for an unknown or empty preset', () => {
    expect(O.modelFor('scene3d', 'scene3d-studio-shadows')).toBe(ID);
    expect(O.modelFor('scene3d', 'no-such-preset')).toBe(null);
    expect(O.modelFor('scene3d')).toBe(null);
    expect(O.isScene(ID)).toBe(true);
    expect(O.isScene('torus')).toBe(false);
  });

  it('a saved scene TREE (scene group + Object 3D children) is recognised under its own key', () => {
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
    expect(O.registerScene('work:8', { objects: [] }, 'Empty')).toBe(null);
    expect(O.sceneFromDoc({ state: { engine: { layers: [{ id: 'x', type: 'rings', params: {} }] } } })).toBe(null);
  });
});
