/*
 * RGR — frame-rate drag preview for a 3D Scene (Scene3D.PosePreview).
 *
 *  1. A preview frame whose scene differs from the settled compose only by POSE
 *     (object transform, camera angles/zoom) is served by warping the settled ink:
 *     no generator run (engine.sceneComposeStats.composes unchanged), no re-lift
 *     (PosePreview.stats.lifts unchanged) — counters, not wall-clock.
 *  2. The warp lands where the exact render does (sphere silhouette, box extent).
 *  3. Anything that is NOT pose (light, fill law, ...) must not be warped.
 *  4. The settled compose after a drag is byte-identical to a render that never
 *     had the preview path (SETTINGS.scenePoseWarp = false).
 *
 * RED (pre-change src): Scene3D.PosePreview is undefined and a preview frame runs
 * the generator (composes +1 per frame, lastTier 'law'/'flat', never 'warp').
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const hashPaths = (paths) => {
  let h = 0x811c9dc5 >>> 0; let n = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  (paths || []).forEach((p) => { if (!Array.isArray(p)) return; n++; mix('|'); p.forEach((q) => mix(`${q.x},${q.y};`)); });
  return `${h.toString(16)}:${n}`;
};
const bbox = (paths, pick) => {
  let x0 = 1e9; let x1 = -1e9; let y0 = 1e9; let y1 = -1e9;
  paths.filter(pick).forEach((p) => p.forEach((q) => { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }));
  return { x0, x1, y0, y1 };
};
const isObj = (p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId !== 'ground';

describe('Scene3D.PosePreview — pose-only drag frames are warped, not composed', () => {
  let runtime; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: false });
    V = runtime.window.Vectura;
  }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());
  afterEach(() => { delete V.SETTINGS.scenePoseWarp; });

  const make = (prim, law) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === gid);
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    child.params.primitive = prim;
    if (law) child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: law } };
    engine.computeAllDisplayGeometry();
    return { engine, gid, group, child };
  };

  test('sphere + mezzotint: camera and object drags never re-run the generator or the lift', () => {
    const { engine, gid, group, child } = make('sphere', 'mezzoRegion');
    const PP = V.Scene3D.PosePreview;
    expect(PP).toBeTruthy();
    expect(group._scenePose).toBeTruthy();
    const composes = engine.sceneComposeStats.composes;
    const lifts = PP.stats.lifts;
    for (let i = 1; i <= 6; i++) {
      group.params.camera.yaw += 3; group.params.camera.pitch += 1;
      child.params.transform.yaw += 7;
      engine.generate(gid, { preview: true });
      expect(engine.sceneComposeStats.lastTier).toBe('warp');
      expect(group._pathsFromDraft).toBe(true);
      expect(group.scenePaths.length).toBeGreaterThan(100);
    }
    expect(engine.sceneComposeStats.composes).toBe(composes);
    expect(PP.stats.lifts).toBe(lifts);
    expect(engine.sceneComposeStats.warps).toBeGreaterThanOrEqual(6);
  }, 120000);

  test('warp lands where the exact render does (sphere silhouette, box extent)', () => {
    for (const prim of ['sphere', 'box']) {
      const { engine, gid, group } = make(prim, null);
      group.params.camera.yaw += 20; group.params.camera.pitch += 8;
      engine.generate(gid, { preview: true });
      expect(engine.sceneComposeStats.lastTier).toBe('warp');
      const w = bbox(group.scenePaths, isObj);
      engine.computeAllDisplayGeometry();
      expect(group._pathsFromDraft).toBe(false);
      const f = bbox(group.scenePaths, isObj);
      const tol = 3;
      ['x0', 'x1', 'y0', 'y1'].forEach((k) => expect(Math.abs(w[k] - f[k])).toBeLessThan(tol));
    }
  }, 240000);

  test('a change that is not pose (light) is not warped', () => {
    const { engine, gid, group } = make('sphere', null);
    group.params.lights = [Object.assign({}, (group.params.lights || [])[0] || { type: 'directional', intensity: 1, elevation: 45 }, { azimuth: 200 })];
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: 'mezzoRegion' } };
    engine.generate(gid, { preview: true });
    expect(engine.sceneComposeStats.lastTier).not.toBe('warp');
  }, 120000);

  test('release render is byte-identical to a render that never had the preview', () => {
    const run = (warpOn) => {
      if (!warpOn) V.SETTINGS.scenePoseWarp = false;
      else delete V.SETTINGS.scenePoseWarp;
      const { engine, gid, group, child } = make('sphere', 'mezzoRegion');
      for (let i = 1; i <= 3; i++) { child.params.transform.yaw = 10 * i; group.params.camera.yaw = -30 + 4 * i; engine.generate(gid, { preview: true }); }
      engine.computeAllDisplayGeometry();
      expect(group._pathsFromDraft).toBe(false);
      return hashPaths(group.scenePaths);
    };
    const withWarp = run(true);
    const without = run(false);
    expect(withWarp).toBe(without);
  }, 240000);
});
