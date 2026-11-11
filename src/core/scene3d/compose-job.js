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
    } else if (entry.q) {
      // a playback-only (quantized) entry: Uint16 steps from the entry's own origin
      const q = entry.q; const { ox, oy, st } = entry; path = new Array(q.length / 2);
      for (let i = 0; i < path.length; i++) path[i] = { x: ox + q[2 * i] * st, y: oy + q[2 * i + 1] * st };
    } else path = entry.pts;
    Object.keys(entry.props || {}).forEach((k) => { path[k] = entry.props[k]; });
    if (entry.metaJson != null) path.meta = JSON.parse(entry.metaJson);
    return path;
  };
  const unpack = (packed) => (packed.paths || []).map(unpackEntry);
  // A slice of the same unpack (entries [from, to)): lets a caller materialize a big ink a few thousand points per task.
  const unpackRange = (packed, from, to) => (packed.paths || []).slice(from, to).map(unpackEntry);
  // Points an entry holds without materializing it (for budgeting and bounds).
  const entryPoints = (entry) => (entry.flat ? entry.flat.length / 2 : entry.q ? entry.q.length / 2 : entry.pts ? entry.pts.length : 8);

  // PLAYBACK COMPACTION. A packed ink whose Float64 coordinates are replaced by Uint16 steps from each path's own corner
  // (step = max(QUANT_STEP, extent / 65000) mm, so a path up to 325 mm across is held to 0.0025 mm, a 420 mm sheet to 0.0032 mm): a quarter of the
  // bytes, and a stroked frame cannot be told from the exact one (0.0025 mm is a hundredth of a pen width). It is for frames that are only
  // DRAWN (the Scene3D spin ring's drag playback); the ink a scene keeps and exports is always the exact one. Entries without plain
  // {x, y} points ({raw}, {pts}) pass through unchanged.
  const QUANT_STEP = 0.005;
  const quantizePacked = (packed) => {
    if (!packed) return packed;
    const paths = (packed.paths || []).map((e) => {
      const f = e.flat;
      if (!f || !f.length) return e;
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (let i = 0; i < f.length; i += 2) {
        const x = f[i]; const y = f[i + 1];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const st = Math.max(QUANT_STEP, Math.max(maxX - minX, maxY - minY) / 65000);
      if (!(st > 0) || !Number.isFinite(st)) return e;
      const q = new Uint16Array(f.length);
      for (let i = 0; i < f.length; i += 2) { q[i] = Math.round((f[i] - minX) / st); q[i + 1] = Math.round((f[i + 1] - minY) / st); }
      const out = { q, ox: minX, oy: minY, st };
      if (e.props) out.props = e.props;
      if (e.metaJson != null) out.metaJson = e.metaJson;
      return out;
    });
    return { paths, buffers: [], compact: true };
  };

  // job = { assembled, seed, bounds, globals? }. Returns { packed, finished, bakes, ms }.
  // `bakes` is what the compose baked into the SurfaceLock cache ([{ key, ms: MarkSet }]); the main thread adopts it so its own
  // cache is warm for the next frame. `opts.release` (the worker) drops them from this cache so their buffers can be transferred.
  const run = (job, opts) => {
    const V = globalScope.Vectura;
    const algo = V.Algorithms && V.Algorithms.scene3d;
    if (!algo || typeof algo.generate !== 'function') throw new Error('scene3d algorithm is not loaded');
    const SL = V.Scene3D && V.Scene3D.SurfaceLock;
    if (SL && typeof SL.takeFreshBakes === 'function') SL.takeFreshBakes(); // only this job's own bakes are handed back
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
    const bakes = SL && typeof SL.takeFreshBakes === 'function' ? SL.takeFreshBakes({ release: !!(opts && opts.release) }) : [];
    return { packed, finished, bakes, ms };
  };
  // The ArrayBuffers of a bake list (for a transfer).
  const bakeBuffers = (bakes) => {
    const MS = globalScope.Vectura && globalScope.Vectura.Scene3D && globalScope.Vectura.Scene3D.SurfaceLockMarkSet;
    const out = [];
    (bakes || []).forEach((b) => { if (MS && b && b.ms) MS.transferList(b.ms).forEach((buf) => out.push(buf)); });
    return out;
  };

  Scene3D.ComposeJob = { run, bakeBuffers, pack, unpack, unpackRange, unpackEntry, entryPoints, quantizePacked, QUANT_STEP };
  if (typeof module !== 'undefined' && module.exports) module.exports = Scene3D.ComposeJob;
})();
