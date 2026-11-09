/**
 * Scene3D.ComposeJob — the scene compose as a self-contained, transferable job.
 *
 * The full compose of a 3D Scene (`Algorithms.scene3d.generate`) is a pure function of
 * (assembled scene, seed, bounds) plus two module-level switches, so it can run in a Web
 * Worker (compose-worker.js) with the same Scene3D modules loaded there. This file holds the
 * parts shared by both sides:
 *
 *   run(job)      -> packed ink      (worker side; also callable on the main thread / in tests)
 *   pack(paths)   -> { paths, buffers } ; unpack(packed) -> paths
 *
 * `pack` exists because structured clone drops the non-index properties of an array and a
 * scene path carries `.meta` (and `.closed` ...) on the array itself. A path whose points are
 * plain {x, y} travels as one Float64Array; anything richer travels as its point objects.
 * `unpack(pack(p))` is value-identical to `p` (the unit test hashes both).
 */
(function registerSceneComposeJob() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  const isIndex = (k) => /^\d+$/.test(k);

  const pack = (paths) => {
    const out = []; const buffers = [];
    (paths || []).forEach((path) => {
      if (!Array.isArray(path)) { out.push({ raw: path }); return; }
      const props = {};
      let metaJson = null;
      Object.keys(path).forEach((k) => {
        if (isIndex(k)) return;
        // `meta` is the heavy part (curve anchors); it crosses as JSON text, which the main thread
        // parses once for the live path and keeps unparsed for the compose memo.
        if (k === 'meta' && path[k] && typeof path[k] === 'object') metaJson = JSON.stringify(path[k]);
        else props[k] = path[k];
      });
      let plain = true;
      for (let i = 0; i < path.length && plain; i++) {
        const q = path[i];
        if (!q || typeof q.x !== 'number' || typeof q.y !== 'number') { plain = false; break; }
        for (const k in q) { if (k !== 'x' && k !== 'y') { plain = false; break; } }
      }
      if (plain) {
        const flat = new Float64Array(path.length * 2);
        for (let i = 0; i < path.length; i++) { flat[2 * i] = path[i].x; flat[2 * i + 1] = path[i].y; }
        buffers.push(flat.buffer);
        out.push({ flat, props, metaJson });
      } else {
        out.push({ pts: path.map((q) => (q && typeof q === 'object' ? { ...q } : q)), props, metaJson });
      }
    });
    return { paths: out, buffers };
  };

  const unpackEntry = (entry) => {
    if ('raw' in entry) return entry.raw;
    let path;
    if (entry.flat) {
      const f = entry.flat; path = new Array(f.length / 2);
      for (let i = 0; i < path.length; i++) path[i] = { x: f[2 * i], y: f[2 * i + 1] };
    } else path = entry.pts;
    Object.keys(entry.props || {}).forEach((k) => { path[k] = entry.props[k]; });
    if (entry.metaJson != null) path.meta = JSON.parse(entry.metaJson);
    return path;
  };
  const unpack = (packed) => (packed.paths || []).map(unpackEntry);
  // A slice of the same unpack (entries [from, to)): lets a caller materialize a big ink a few thousand points per task.
  const unpackRange = (packed, from, to) => (packed.paths || []).slice(from, to).map(unpackEntry);
  // Points an entry holds without materializing it (for budgeting and bounds).
  const entryPoints = (entry) => (entry.flat ? entry.flat.length / 2 : entry.pts ? entry.pts.length : 8);

  // job = { assembled, seed, bounds, globals? }. Returns { packed, ms }.
  const run = (job) => {
    const V = globalScope.Vectura;
    const algo = V.Algorithms && V.Algorithms.scene3d;
    if (!algo || typeof algo.generate !== 'function') throw new Error('scene3d algorithm is not loaded');
    const g = job.globals || {};
    if ('silProtoOff' in g) globalScope.__SIL_PROTO_OFF = g.silProtoOff;
    if ('silProtoTorusOn' in g) globalScope.__SIL_PROTO_TORUS_ON = g.silProtoTorusOn;
    if ('strokeFillDefault' in g) V.SCENE3D_STROKE_FILL_DEFAULT = g.strokeFillDefault;
    const rng = new V.SeededRNG(job.seed);
    const noise = new V.SimpleNoise(job.seed);
    const t0 = (globalScope.performance || Date).now();
    const paths = algo.generate(job.assembled, rng, noise, job.bounds) || [];
    const ms = (globalScope.performance || Date).now() - t0;
    const packed = pack(paths); // the settled generator output (what the compose memo keeps)
    let finished = null;
    // The scene's output finish (Curves / Smoothing / Simplify) is a pure function of the paths and
    // the scene input, so it runs here too and the main thread only unpacks the result.
    if (job.finish && V.VectorEngine && V.VectorEngine.prototype._applySceneCurveFinish) {
      const objectLayers = new Map((job.finish.objectParams || []).map(([id, params]) => [id, { params }]));
      const fin = V.VectorEngine.prototype._applySceneCurveFinish.call({ currentProfile: { width: job.bounds.width, height: job.bounds.height } }, paths, job.assembled, objectLayers, { params: job.finish.groupParams });
      finished = pack(fin);
    }
    return { packed, finished, ms };
  };

  Scene3D.ComposeJob = { run, pack, unpack, unpackRange, entryPoints };
  if (typeof module !== 'undefined' && module.exports) module.exports = Scene3D.ComposeJob;
})();
