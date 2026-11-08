/**
 * Scene3D.ComposeClient — runs scene composes in a Web Worker (compose-worker.js).
 *
 *   available()       -> true when Workers exist and the page's script tags can be resolved
 *   warm()            -> start the worker and load the Scene3D modules in it (idempotent)
 *   run(job)          -> { promise, cancel }  promise resolves { paths, ms } (unpacked ink) or rejects
 *   cancel()          -> drop the in-flight job (the worker is terminated and re-started lazily)
 *   stats             -> counters for tests
 *
 * Nothing here runs the compositor on the calling thread: the main thread only posts the job
 * and unpacks the result (one Float64Array per path).
 */
(function registerSceneComposeClient() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // The modules the compositor needs, index.html-relative, in load order (the same manifest the
  // DOM-free test runtime uses for the Scene3D path; tests/unit/scene3d-compose-worker.test.js
  // keeps it in step with index.html).
  const WORKER_SCRIPTS = Object.freeze([
    'src/config/machines.js', 'src/config/defaults.js', 'src/config/modifiers.js', 'src/core/utils.js',
    'src/config/context-bar.js', 'src/config/scene3d-tone-laws.js', 'src/config/scene3d-fill-controls.js',
    'src/core/algorithm-utils.js', 'src/core/algorithms/geometry3d.js', 'src/core/rng.js', 'src/core/noise.js',
    'src/core/noise-rack.js', 'src/core/geometry-utils.js', 'src/core/optimization-utils.js', 'src/core/path-draw.js',
    'src/core/path-boolean.js', 'src/vendor/polygon-clipping.umd.js', 'src/core/fill-boolean.js', 'src/core/masking.js',
    'src/core/modifiers.js', 'src/core/scene3d/charts.js', 'src/core/scene3d/ray-torus.js',
    'src/core/scene3d/torus-occlusion.js', 'src/core/scene3d/mesh.js', 'src/core/scene3d/csg.js',
    'src/core/scene3d/style-cascade.js', 'src/core/scene3d/params.js', 'src/core/scene3d/boolean.js',
    'src/core/scene3d/scene.js', 'src/core/scene3d/edges.js', 'src/core/scene3d/depth.js', 'src/core/scene3d/hlr.js',
    'src/core/scene3d/regions.js', 'src/core/scene3d/shadows.js', 'src/core/scene3d/shadow-receive.js',
    'src/core/scene3d/mappers.js', 'src/core/scene3d/ribbon-geometry.js', 'src/core/pen-fill.js',
    'src/core/scene3d/surface-fill-mono.js', 'src/core/scene3d/surface-fill.js', 'src/core/algorithms/spiralizer.js',
    'src/core/algorithms/polyhedron.js', 'src/core/algorithms/topoform.js', 'src/core/algorithms/scene3d.js',
    'src/core/algorithms/object3d.js', 'src/core/algorithms/booleanGroup3d.js', 'src/core/algorithms/sceneLight3d.js',
    'src/core/algorithms/sceneGround3d.js', 'src/core/algorithms/index.js', 'src/core/layer.js', 'src/core/engine.js',
    'src/core/scene3d/compose-job.js',
  ]);

  const stats = { starts: 0, jobs: 0, cancels: 0, failures: 0 };
  let worker = null;
  let ready = null; // Promise resolved when the worker has loaded its modules
  let pending = null; // { id, resolve, reject }
  let nextId = 1;
  let broken = false;

  const resolveScripts = () => {
    if (typeof document === 'undefined') return null;
    const tags = Array.prototype.slice.call(document.querySelectorAll('script[src]'));
    const urls = [];
    for (const rel of WORKER_SCRIPTS) {
      const hit = tags.find((t) => {
        const raw = t.getAttribute('src') || '';
        return raw.replace(/^\.\//, '').replace(/\?.*$/, '') === rel;
      });
      if (!hit) return null;
      urls.push(hit.src);
    }
    return urls;
  };
  const workerUrl = () => {
    const tag = Array.prototype.slice.call(document.querySelectorAll('script[src]'))
      .find((t) => /src\/core\/scene3d\/compose-client\.js/.test(t.getAttribute('src') || ''));
    if (!tag) return null;
    return tag.src.replace('compose-client.js', 'compose-worker.js');
  };

  const available = () => !broken && typeof Worker === 'function' && typeof document !== 'undefined'
    && location.protocol !== 'file:' && !!resolveScripts() && !!workerUrl();

  const stop = () => {
    if (worker) { try { worker.terminate(); } catch (_) { /* gone */ } }
    worker = null; ready = null;
    if (pending) { const p = pending; pending = null; p.reject(new Error('cancelled')); }
  };

  const warm = () => {
    if (ready) return ready;
    if (!available()) return Promise.reject(new Error('worker unavailable'));
    stats.starts += 1;
    ready = new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(workerUrl()); } catch (err) { broken = true; reject(err); return; }
      worker = w;
      w.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'ready') { resolve(); return; }
        if (m.type === 'result' && pending && pending.id === m.id) {
          const p = pending; pending = null;
          const tU = (globalScope.performance || Date).now();
          try { p.resolve({ paths: Scene3D.ComposeJob.unpack(m.packed), finished: m.finished ? Scene3D.ComposeJob.unpack(m.finished) : null, packed: m.packed, ms: m.ms }); } catch (err) { p.reject(err); }
          stats.lastUnpackMs = (globalScope.performance || Date).now() - tU;
        } else if (m.type === 'error') {
          stats.failures += 1; stats.lastError = m.message; if (typeof console !== 'undefined') console.warn('[ComposeClient]', m.message);
          if (pending && pending.id === m.id) { const p = pending; pending = null; p.reject(new Error(m.message)); }
          else { broken = true; reject(new Error(m.message)); }
        }
      };
      w.onerror = (e) => { broken = true; stats.failures += 1; reject(new Error(e && e.message || 'worker error')); if (pending) { const p = pending; pending = null; p.reject(new Error('worker error')); } };
      w.postMessage({ type: 'init', scripts: resolveScripts().concat([]) });
    });
    ready.catch(() => { stop(); });
    return ready;
  };

  const run = (job) => {
    stats.jobs += 1;
    const id = nextId++;
    const promise = warm().then(() => new Promise((resolve, reject) => {
      if (!worker) { reject(new Error('cancelled')); return; }
      pending = { id, resolve, reject };
      try { worker.postMessage({ type: 'job', id, job }); } catch (err) { pending = null; reject(err); }
    }));
    return { promise, cancel: () => { if (pending && pending.id === id) { stats.cancels += 1; stop(); } } };
  };

  Scene3D.ComposeClient = { available, warm, run, cancel: () => { if (pending) { stats.cancels += 1; stop(); } }, stats, WORKER_SCRIPTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Scene3D.ComposeClient;
})();
