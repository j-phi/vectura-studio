const fs = require('fs');
const path = require('path');
const { SCENE3D_FILES } = require('../helpers/runtime-profiles');
const { loadSurfaceLockRuntime, buildSurfaceLockScene, signature } = require('../helpers/surface-lock-scene');

// Surface-locked fills: the scaffold contract (docs/surface-lock-contract.md §1-§3, §14).
// Pins the module roster and manifests, the MarkSet layout, the shared chart metric, the shared rig,
// and the one invariant that holds at every stage of the rollout: a style that ASKS for
// markSpace 'surface' but whose effective mode is 'pose' renders exactly like a style without the key.

const ROOT = path.resolve(__dirname, '../..');
const MODULES = [
  'src/core/scene3d/surface-lock-markset.js', 'src/core/scene3d/surface-lock-chart.js',
  'src/core/scene3d/surface-lock-mezzo.js', 'src/core/scene3d/surface-lock-ladder.js',
  'src/core/scene3d/surface-lock-laws.js', 'src/core/scene3d/surface-lock-faceted.js',
  'src/core/scene3d/surface-lock-visibility.js', 'src/core/scene3d/surface-lock-shadow.js',
  'src/core/scene3d/surface-lock.js',
];
const CONFIG = 'src/config/scene3d-surface-lock.js';
const NAMESPACES = ['SurfaceLockMarkSet', 'SurfaceLockChart', 'SurfaceLockMezzo', 'SurfaceLockLadder', 'SurfaceLockLaws',
  'SurfaceLockFaceted', 'SurfaceLockVisibility', 'SurfaceLockShadow', 'SurfaceLock'];

describe('surface lock scaffold', () => {
  let rt; let V;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; });
  afterAll(() => rt && rt.cleanup());

  it('loads every module, in order, from index.html, the worker manifest and the test manifest', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const order = [...html.matchAll(/<script[^>]*src="\.\/([^"?]+)/g)].map((m) => m[1]);
    const at = (f) => order.indexOf(f);
    [CONFIG, ...MODULES].forEach((f) => expect(at(f), f).toBeGreaterThan(-1));
    expect(at(CONFIG)).toBeLessThan(at('src/core/scene3d/surface-lock-markset.js'));
    MODULES.forEach((f, i) => { if (i) expect(at(f), f).toBeGreaterThan(at(MODULES[i - 1])); });
    expect(at(MODULES[0])).toBeGreaterThan(at('src/core/scene3d/surface-fill.js'));
    expect(at(MODULES[MODULES.length - 1])).toBeLessThan(at('src/core/algorithms/scene3d.js'));
    const worker = V.Scene3D.ComposeClient.WORKER_SCRIPTS;
    [CONFIG, ...MODULES].forEach((f) => { expect(worker, f).toContain(f); expect(SCENE3D_FILES, f).toContain(f); });
  });

  it('registers each module as its own Scene3D namespace with the contract surface', () => {
    NAMESPACES.forEach((k) => expect(V.Scene3D[k], k).toBeTruthy());
    expect(V.SCENE3D_SURFACE_LOCK.NZ_CULL).toBe(0.08);
    const SL = V.Scene3D.SurfaceLock;
    ['effectiveMarkSpace', 'bakerFor', 'bakeKey', 'bake', 'poseOf', 'frame', 'frameable', 'sceneFrame', 'resetStats', 'clearCache']
      .forEach((fn) => expect(typeof SL[fn], fn).toBe('function'));
    expect(SL.BAKER_KEYS).toEqual(['SurfaceLockMezzo', 'SurfaceLockLadder', 'SurfaceLockLaws', 'SurfaceLockFaceted']);
    SL.BAKER_KEYS.forEach((k) => {
      const b = V.Scene3D[k];
      expect(typeof b.id, k).toBe('string');
      expect(Array.isArray(b.FIT), k).toBe(true);
      ['supports', 'bake', 'toneLUT'].forEach((fn) => expect(typeof b[fn], `${k}.${fn}`).toBe('function'));
    });
    ['bakes', 'frames', 'verticesIn', 'verticesOut', 'culledFacing', 'culledGrazing', 'culledTone', 'msBake', 'msFrame']
      .forEach((c) => expect(SL.stats[c], c).toBe(0));
  });

  it('MarkSet builder: layout, validation, determinism, octahedral normals', () => {
    const MS = V.Scene3D.SurfaceLockMarkSet;
    const build = () => {
      const b = MS.createBuilder({ bakerId: 'test', key: 'k', objectId: 'o', meta: { p0: 1.5 } });
      b.beginRun(0, 0.25, 0, 0); b.vertex(0, 0, 20, 0, 0, 1); b.vertex(1, 0, 20, 0.05, 0, 1); b.endRun();
      b.beginRun(1, 0.5, 1, 0); b.vertex(5, 5, 5, 1, 1, 1); expect(b.endRun()).toBe(false); // < 2 vertices: dropped
      b.beginRun(2, 0.999, 0, MS.FLAG.DOT); b.vertex(0, -20, 0, 0, -1, 0); b.endRun();
      return b.finish();
    };
    const ms = build();
    expect(MS.validate(ms)).toEqual([]);
    expect([ms.vertexCount, ms.runCount, ms.levels]).toEqual([3, 2, 3]);
    expect(Array.from(ms.runStart)).toEqual([0, 2, 3]);
    expect(Array.from(ms.runLevel)).toEqual([0, 2]);
    expect(MS.rankOf(ms, 0)).toBe(0.25);
    expect(ms.positions.constructor.name).toBe('Float32Array'); // vm realm: no instanceof
    expect(ms.normals.constructor.name).toBe('Int16Array');
    const again = build();
    ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'].forEach((k) => expect(Array.from(again[k])).toEqual(Array.from(ms[k])));
    const ARR = ['positions', 'normals', 'runStart', 'runLevel', 'runRank', 'runFamily', 'runFlags'];
    expect(MS.byteSize(ms)).toBe(ARR.reduce((n, k) => n + ms[k].byteLength, 0));
    expect(MS.transferList(ms).length).toBe(ARR.length);
    const b = MS.createBuilder({});
    expect(() => b.beginRun(9, 0, 0, 0)).toThrow(/level/);
    expect(() => b.beginRun(0, 1, 0, 0)).toThrow(/rank/);
    // Octahedral round trip: worst angular error over a deterministic sphere of directions.
    const oct = new Int16Array(2); const o = [0, 0, 0]; let worst = 0;
    for (let i = 0; i < 4000; i++) {
      const u = -1 + (2 * (i + 0.5)) / 4000; const t = i * 2.399963229728653; const r = Math.sqrt(1 - u * u);
      const n = [r * Math.cos(t), r * Math.sin(t), u];
      MS.octEncode(n[0], n[1], n[2], oct, 0); MS.octDecode(oct, 0, o);
      worst = Math.max(worst, Math.acos(Math.min(1, n[0] * o[0] + n[1] * o[1] + n[2] * o[2])));
    }
    expect(worst).toBeLessThan(1e-4);
  });

  it('chart metric: object-space points, outward normals (inverse-transpose under scale), seams and poles', () => {
    const C = V.Scene3D.SurfaceLockChart;
    const sph = C.metric('sphere', { sx: 20, sy: 20, sz: 20 }, { sx: 1, sy: 1, sz: 1 });
    expect([sph.periodicA, sph.periodicB]).toEqual([false, true]);
    let worst = 0;
    for (let i = 0; i <= 32; i++) {
      for (let j = 0; j <= 32; j++) {
        const s = sph.sample(i / 32, j / 32);
        expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(20, 6);
        worst = Math.max(worst, Math.hypot(s.nx - s.x / 20, s.ny - s.y / 20, s.nz - s.z / 20));
      }
    }
    expect(worst).toBeLessThan(1e-6);
    const sc = { sx: 2, sy: 1, sz: 0.5 };
    const ell = C.metric('sphere', { sx: 20, sy: 20, sz: 20 }, sc);
    const s = ell.sample(0.37, 0.21);
    const g = [s.x / (sc.sx * sc.sx), s.y / (sc.sy * sc.sy), s.z / (sc.sz * sc.sz)];
    const gl = Math.hypot(...g);
    expect(Math.hypot(s.nx - g[0] / gl, s.ny - g[1] / gl, s.nz - g[2] / gl)).toBeLessThan(1e-6);
    ['cylinder', 'cone', 'capsule', 'superellipsoid', 'pyramid'].forEach((mode) => {
      const M = C.metric(mode, { sx: 20, sy: 30, sz: 20 }, {});
      for (let i = 1; i < 16; i++) {
        const q = M.sample(i / 16, 0.3);
        expect(q.x * q.nx + q.y * q.ny + q.z * q.nz, mode).toBeGreaterThan(0);
      }
    });
    const tor = C.metric('torus', { sx: 20, sy: 20, sz: 20 }, {});
    expect([tor.periodicA, tor.periodicB]).toEqual([true, true]);
    expect(C.hash(3, 7, 0)).toBe(C.hash(3, 7, 0));
    expect(C.hash(3, 7, 0)).not.toBe(C.hash(3, 7, 12345));
    const H3 = C.spatialHash3(0.5);
    H3.insert(0, 0, 0, 1); H3.insert(1, 0, 0, 2); H3.insert(-3, 2, 1, 3);
    const hits = []; H3.near(0.4, 0, 0, 0.7, (id) => { hits.push(id); });
    expect(hits.sort()).toEqual([1, 2]);
  });

  it('the shared rig builds sphere, box and two-object scenes through engine.addLayer', () => {
    const counts = {};
    ['sphere', 'box', 'two'].forEach((kind) => {
      const s = buildSurfaceLockScene(V, { kind, markSpace: 'surface', shadow: false });
      const paths = s.composeFull();
      counts[kind] = s.objectsOf().length;
      expect(s.fills(paths).length, kind).toBeGreaterThan(0);
      expect(s.edges(paths).length, kind).toBeGreaterThan(0);
      s.objectsOf().forEach((leaf) => expect(leaf.params.style.params.markSpace).toBe('surface'));
    });
    expect(counts).toEqual({ sphere: 1, box: 1, two: 2 });
  });

  it('a style asking for surface whose effective mode is pose renders exactly like one without the key', () => {
    // etfKang follows the light gradient: it never fits (contract §12), at every stage of the rollout.
    const opts = { kind: 'sphere', toneLaw: 'etfKang', ground: false, shadow: false };
    const scene = buildSurfaceLockScene(V, { ...opts, markSpace: 'surface' });
    const style = scene.objectsOf()[0].params.style;
    expect(V.Scene3D.SurfaceLock.effectiveMarkSpace(style, {})).toBe('pose');
    const asked = signature(scene.composeFull());
    delete style.params.markSpace;
    const plain = signature(scene.composeFull());
    expect(asked.length).toBeGreaterThan(1000);
    expect(asked === plain).toBe(true);
  });
});
