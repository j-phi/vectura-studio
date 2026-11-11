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
    child.params.style.params = { ...(child.params.style.params || {}), markSpace: 'pose' }; // W3-E: pose-mode machinery under test; a fresh scene is born surface
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
    child.params.style.params = { ...(child.params.style.params || {}), markSpace: 'pose' }; // W3-E: pose-mode machinery under test; a fresh scene is born surface
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
  test('sphere warp covers the whole disc and never piles foreshortened ink on the limb', () => {
    const { engine, gid, group } = make('sphere', 'mezzoRegion');
    const settled = group.scenePaths.filter(isObj).filter((p) => p.meta.sceneTarget.edgeClass !== 'silhouette');
    const sil = group.scenePaths.find((p) => isObj(p) && p.meta.sceneTarget.edgeClass === 'silhouette');
    expect(sil).toBeTruthy();
    group.params.camera.yaw += 90; // a quarter turn: the old limb ring is now the centre
    engine.generate(gid, { preview: true });
    expect(engine.sceneComposeStats.lastTier).toBe('warp');
    const sp = group.scenePaths.filter(isObj).filter((p) => p.meta.sceneTarget.edgeClass !== 'silhouette');
    const b = bbox(group.scenePaths, (p) => isObj(p) && p.meta.sceneTarget.edgeClass === 'silhouette');
    const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2; const R = (b.x1 - b.x0) / 2;
    // every one of 8 sectors x 3 radial rings holds ink (no crescent gap)
    const cells = new Set(); const ring = [0, 0, 0, 0];
    sp.forEach((p) => p.forEach((q) => {
      const r = Math.hypot(q.x - cx, q.y - cy) / R;
      if (r > 1.001) return;
      const sector = Math.floor(((Math.atan2(q.y - cy, q.x - cx) + Math.PI) / (2 * Math.PI)) * 8) % 8;
      cells.add(`${sector}:${Math.min(2, Math.floor(r * 3))}`);
      ring[Math.min(3, Math.floor(r * 4))] += 1;
    }));
    for (let sct = 0; sct < 8; sct++) for (let rg = 0; rg < 3; rg++) expect(cells.has(`${sct}:${rg}`)).toBe(true);
    // vertices per unit area at the rim stay within 3x of the middle (the old band was several times denser)
    const area = (i) => (((i + 1) / 4) ** 2 - (i / 4) ** 2);
    const dens = ring.map((n, i) => n / area(i));
    expect(dens[3]).toBeLessThan(3 * (dens[1] + dens[2]) / 2);
    expect(settled.length).toBeGreaterThan(0);
  }, 240000);

  test('the cast shadow follows the object when it moves', () => {
    const { engine, gid, group, child } = make('sphere', 'mezzoRegion');
    const shadow = (paths) => paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');
    const centroid = (paths) => { let sx = 0; let sy = 0; let n = 0; shadow(paths).forEach((p) => p.forEach((q) => { sx += q.x; sy += q.y; n++; })); return { x: sx / n, y: sy / n, n }; };
    const c0 = centroid(group.scenePaths);
    expect(c0.n).toBeGreaterThan(20);
    child.params.transform.x = (child.params.transform.x || 0) + 25;
    engine.generate(gid, { preview: true });
    expect(engine.sceneComposeStats.lastTier).toBe('warp');
    const wp = group.scenePaths;
    const cw = centroid(wp);
    engine.computeAllDisplayGeometry();
    const cf = centroid(group.scenePaths);
    expect(Math.hypot(cw.x - c0.x, cw.y - c0.y)).toBeGreaterThan(5); // moved (frozen shadow would not)
    // the far (left) edge of the shadow lands where the exact render puts it
    const left = (paths) => bbox(paths, (p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow').x0;
    expect(Math.abs(left(wp) - left(group.scenePaths))).toBeLessThan(4);
  }, 240000);
});

describe('Scene3D.ComposeJob — the worker compose is byte-identical to the main-thread compose', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeUi: false }); V = runtime.window.Vectura; }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

  const make = () => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === gid);
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    child.params.style.params = { ...(child.params.style.params || {}), markSpace: 'pose' }; // W3-E: pose-mode machinery under test; a fresh scene is born surface
    child.params.primitive = 'sphere';
    child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: 'mezzoRegion' } };
    group.params.seed = 4242;
    return { engine, gid, group };
  };

  test('pack/unpack round-trips ink and meta exactly', () => {
    const { engine, group } = make();
    engine.computeAllDisplayGeometry();
    const CJ = V.Scene3D.ComposeJob;
    const back = CJ.unpack(structuredClone(CJ.pack(group.scenePaths)).paths ? { paths: structuredClone(CJ.pack(group.scenePaths).paths) } : null);
    expect(hashPaths(back)).toBe(hashPaths(group.scenePaths));
    back.forEach((p, i) => expect(JSON.stringify(p.meta)).toBe(JSON.stringify(group.scenePaths[i].meta)));
  }, 240000);

  test('generateAsync with a (simulated) worker settles to the same bytes as generate, and the memo hit agrees', async () => {
    const CJ = V.Scene3D.ComposeJob;
    const realClient = V.Scene3D.ComposeClient;
    V.Scene3D.ComposeClient = {
      available: () => true, warm() { return Promise.resolve(false); },
      run: (job) => {
        const r = CJ.run(job);
        const wire = { packed: { paths: structuredClone(r.packed.paths) }, finished: r.finished ? { paths: structuredClone(r.finished.paths) } : null };
        const res = { paths: CJ.unpack(wire.packed), finished: wire.finished ? CJ.unpack(wire.finished) : null, packed: wire.packed, ms: r.ms };
        return { promise: Promise.resolve(res), cancel() {} };
      },
    };
    try {
      const a = make();
      const ok = await a.engine.generateAsync(a.gid);
      expect(ok).toBe(true);
      const asyncHash = hashPaths(a.group.scenePaths);
      const b = make();
      b.engine.generate(b.gid);
      expect(asyncHash).toBe(hashPaths(b.group.scenePaths));
      a.engine.generate(a.gid); // memo hit (lazily unpacked)
      expect(hashPaths(a.group.scenePaths)).toBe(asyncHash);
    } finally { V.Scene3D.ComposeClient = realClient; }
  }, 240000);

  test('the worker script manifest matches index.html and the test runtime', () => {
    const fs = require('fs'); const path = require('path');
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    ['pose-preview.js', 'compose-job.js', 'compose-client.js'].forEach((f) => expect(html).toContain(`src/core/scene3d/${f}`));
    const worker = fs.readFileSync(path.join(__dirname, '../../src/core/scene3d/compose-worker.js'), 'utf8');
    expect(worker).toContain('self.window = self');
    expect(worker).toContain('importScripts');
    (V.Scene3D.ComposeClient.WORKER_SCRIPTS || []).forEach((f) => expect(html).toContain(f.replace(/^\.?\//, '')));
  });
});
