/**
 * Scene3D.SpinRing — a pre-baked turntable for a 3D Scene.
 *
 * WHY. Rotating a Scene (a mezzotint sphere is 0.5-2 s per compose) can only be smooth if no compose
 * happens while the pointer moves. So the poses are composed AHEAD of the drag: the scene's exact full
 * compose is run, in Web Workers, for a ring of yaws (72 at 5 degrees), and a drag frame just picks the nearest
 * baked one. Nothing here approximates: a frame is the output of the same compose a normal render runs
 * (same assembled scene, seed, bounds, output finish), so installing it is byte-identical to rendering
 * the scene at that yaw (Engine.installSpinFrame verifies the compose key first).
 *
 *   SpinRing.create({ engine, group, target, step?, runnerFactory?, maxBytes? }) -> ring
 *     target  { id, get() -> yaw, set(yaw), fixed? }  the angle being swept (camera yaw, or one object's yaw)
 *     ring.key0         the scene's compose key with the swept yaw zeroed: "the scene hash minus yaw"
 *     ring.valid()      key0 still matches the scene (any other edit makes the ring stale)
 *     ring.start()      bake outward from the current yaw (0, +1, -1, +2, -2 ... steps)
 *     ring.nearest(yaw) the ready frame closest to `yaw` (circular), or null
 *     ring.dispose()    cancel the in-flight bakes and drop every frame
 *
 * A baked frame keeps the worker's ink PACKED. The first frames to land (`exactBytes`, a third of the cap at most) are EXACT, one Float64Array
 * per path: installing one is byte-identical to a fresh render. Every other frame is PLAYBACK ink: the finished ink with Uint16 coordinates
 * (<= 0.0025 mm off, a quarter of the bytes) and no raw copy, so all 72 angles fit the cap that held 17-39 exact ones. A playback frame is
 * only ever drawn; release re-composes its exact ink (the ordinary settle) while its raster stays on screen. `maxBytes` caps the total (the
 * ring then stops baking and keeps the frames nearest the starting yaw). Cached rasters (the renderer's drawImage layer) hang off `frame.raster` and are
 * evicted least-recently-used by `trimRasters`.
 */
(function registerSceneSpinRing() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // Counters for the contract tests.
  const stats = { rings: 0, jobs: 0, frames: 0, disposed: 0, installs: 0 };

  const normYaw = (v) => {
    let n = Number(v) % 360;
    if (n > 180) n -= 360;
    if (n < -180) n += 360;
    return Object.is(n, -0) ? 0 : n;
  };
  const tidy = (v) => {
    const n = Math.round(v * 10) / 10;
    return Object.is(n, -0) ? 0 : n;
  };
  const circDist = (a, b) => Math.abs(normYaw(a - b));
  const now = () => (globalScope.performance || Date).now();

  // Bytes a packed ink holds. The curve metadata crosses as JSON text (pick polygons, anchors) and is mostly
  // repeated from path to path and between the raw and finished ink: identical strings are interned through
  // `pool` (one copy kept, counted once; JSON is one byte per char).
  const internBytes = (packed, pool) => {
    let n = 0;
    ((packed && packed.paths) || []).forEach((e) => {
      if (e.flat) n += e.flat.byteLength;
      else if (e.q) n += e.q.byteLength + 24;
      else if (e.pts) n += e.pts.length * 40;
      n += 64;
      if (e.metaJson) {
        const hit = pool.get(e.metaJson);
        if (hit !== undefined) e.metaJson = hit;
        else { pool.set(e.metaJson, e.metaJson); n += e.metaJson.length; }
      }
    });
    return n;
  };

  // Release the transfer-list `buffers` the worker sent (the typed arrays stay as they arrived: Float64, exactly the compose's output, so an
  // installed frame is byte-identical to a fresh render; memory is bounded by the byte cap instead of by quantizing the ink).
  const releaseBuffers = (packed) => {
    if (packed) packed.buffers = [];
    return packed;
  };
  // Value equality of two packed inks (same entries, same coordinates, same props / meta): when the output finish changed nothing the raw
  // and finished inks are one ink and one copy is kept.
  const samePacked = (a, b) => {
    if (a === b) return true;
    if (!a || !b || a.paths.length !== b.paths.length) return false;
    for (let i = 0; i < a.paths.length; i++) {
      const x = a.paths[i]; const y = b.paths[i];
      if (!!x.flat !== !!y.flat || x.metaJson !== y.metaJson || 'raw' in x !== 'raw' in y) return false;
      if (x.flat) {
        if (x.flat.length !== y.flat.length) return false;
        for (let j = 0; j < x.flat.length; j++) if (x.flat[j] !== y.flat[j]) return false;
      } else if (!x.flat && x.pts && JSON.stringify(x.pts) !== JSON.stringify(y.pts)) return false;
      if (JSON.stringify(x.props || null) !== JSON.stringify(y.props || null)) return false;
    }
    return true;
  };

  // Deep-device heuristic: low-memory / touch devices get the smaller budgets (config: SETTINGS.sceneSpin*).
  const isMobile = () => {
    const nav = globalScope.navigator || {};
    if (Number.isFinite(nav.deviceMemory) && nav.deviceMemory <= 4) return true;
    try { if (globalScope.matchMedia && globalScope.matchMedia('(pointer: coarse)').matches) return true; } catch (err) { /* no media */ }
    return false;
  };
  // A budget by name: SETTINGS[key] on desktop, SETTINGS[key + 'Mobile'] on a low-memory / touch device, else the given default.
  const budgetMB = (key, desktopDefault, mobileDefault) => {
    const S = (globalScope.Vectura && globalScope.Vectura.SETTINGS) || {};
    const mob = isMobile();
    const v = mob ? S[`${key}Mobile`] : S[key];
    return Number.isFinite(v) ? v : (mob ? mobileDefault : desktopDefault);
  };

  // A runner that composes on the calling thread. For tests and tools: it blocks, so the app never uses it.
  const inlineRunner = () => ({
    isReady: () => false, // runs later than the call: the baker hands it a private copy of the job
    run: (job) => {
      const promise = new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            const out = Scene3D.ComposeJob.run(job);
            resolve({ packed: out.packed, finishedPacked: out.finished, ms: out.ms });
          } catch (err) { reject(err); }
        }, 0);
      });
      return { promise, cancel: () => {} };
    },
    terminate: () => {},
  });

  // structuredClone where the platform has it (every browser); a JSON copy in the DOM-free test runtime.
  const deepCopy = (o) => (typeof globalScope.structuredClone === 'function' ? globalScope.structuredClone(o) : JSON.parse(JSON.stringify(o)));

  const defaultPoolSize = () => {
    const hc = (globalScope.navigator && globalScope.navigator.hardwareConcurrency) || 2;
    return Math.max(1, Math.min(3, hc - 1 > 0 ? hc - 1 : 1));
  };

  const create = (opts) => {
    const { engine, group, target } = opts;
    if (!engine || !group || !target) throw new Error('SpinRing.create needs engine, group and target');
    const step = opts.step > 0 ? opts.step : 5;
    const count = Math.max(2, Math.round(360 / step));
    const base = normYaw(target.get());
    const yaws = Array.from({ length: count }, (_, i) => tidy(normYaw(base + i * (360 / count))));
    const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : budgetMB('sceneSpinMaxMB', 24, 12) * 1024 * 1024;
    // the share of the byte cap that may hold EXACT frames (installable on release without a recompose); the rest of the ring is playback ink
    const exactCap = Number.isFinite(opts.exactBytes) ? opts.exactBytes : Math.min(budgetMB('sceneSpinExactMB', 4, 2) * 1024 * 1024, maxBytes / 3);
    const factory = opts.runnerFactory || (() => {
      const C = Scene3D.ComposeClient;
      return C && C.available() ? C.create() : null;
    });

    // Bake order: a COARSE pass first (every second step: the starting yaw, then alternately two steps either side of it, outward) so the
    // whole turntable answers within a step of 2x as soon as half the frames are in; then the FILL pass over the steps in between, again
    // outward. A byte cap that stops the bake therefore leaves an even ring, not a short arc.
    const coarse = opts.coarse !== false && count % 2 === 0 && count >= 8;
    const order = [];
    const seen = new Set();
    const add = (i) => { if (!seen.has(i)) { seen.add(i); order.push(i); } };
    if (coarse) {
      add(0);
      for (let k = 2; order.length < count / 2; k += 2) { add(k % count); add((count - k) % count); }
      for (let k = 1; order.length < count; k += 2) { add(k % count); add((count - k) % count); }
    } else {
      add(0);
      for (let k = 1; order.length < count; k++) { add(k % count); add((count - k) % count); }
    }

    const ring = {
      engine, group, target, step: 360 / count, count, base, yaws,
      pitch: opts.pitch, coarse,
      frames: new Map(), // idx -> frame
      stats: { jobs: 0, baked: 0, failed: 0, bakeMs: 0, startedAt: 0, doneAt: 0, vectorBytes: 0, exactBytes: 0, playbackFrames: 0, capped: false, workers: 0 },
      disposed: false,
      running: false,
      onFrame: opts.onFrame || null,
      key0: null,
    };
    let clock = 0;
    const pool = new Map(); // interned curve metadata, shared by every frame of this ring
    let cursor = 0;
    const runners = [];
    const inflight = new Map(); // runner -> idx

    const computeKey0 = () => {
      const saved = target.get();
      let job = null;
      try { target.set(0); job = engine.sceneJobOnly(group); } finally { target.set(saved); }
      return job ? job.memoKey : null;
    };
    ring.computeKey0 = computeKey0;
    ring.key0 = computeKey0();
    ring.valid = () => !ring.disposed && ring.key0 != null && computeKey0() === ring.key0;

    const globals = () => ({
      silProtoOff: globalScope.__SIL_PROTO_OFF,
      silProtoTorusOn: globalScope.__SIL_PROTO_TORUS_ON,
      strokeFillDefault: Vectura.SCENE3D_STROKE_FILL_DEFAULT,
    });

    const finishIfDone = () => {
      if (inflight.size === 0 && cursor >= order.length || ring.stats.capped) {
        if (inflight.size === 0 && !ring.stats.doneAt) ring.stats.doneAt = now();
      }
    };

    const land = (idx, key, res) => {
      if (ring.disposed) return;
      const Job = Scene3D.ComposeJob;
      const packed = releaseBuffers(res.packed);
      let finishedPacked = releaseBuffers(res.finishedPacked);
      if (finishedPacked && samePacked(packed, finishedPacked)) finishedPacked = packed; // the finish changed nothing: one copy
      // EXACT or PLAYBACK. The first frames to land (nearest the starting yaw, within `exactBytes`) are kept exact: Float64 ink that
      // installs byte for byte. Every later frame is kept as PLAYBACK ink only: the finished ink with Uint16 coordinates (a quarter of
      // the bytes; at most 0.0025 mm off) and no raw copy, which is all a drag needs to draw it. A playback frame is never installed:
      // release re-composes its exact ink (the ordinary settle) while the frame's raster stays on screen.
      let exact = ring.stats.exactBytes < exactCap;
      let kept = exact ? packed : null;
      let kept2 = exact ? finishedPacked : Job.quantizePacked(finishedPacked || packed);
      let bytes = internBytes(kept || kept2, pool) + (exact && kept2 !== kept ? internBytes(kept2, pool) : 0);
      if (exact && ring.frames.size > 0 && ring.stats.exactBytes + bytes > exactCap) {
        // would take the exact share past its cap: this one is playback ink
        exact = false; kept = null; kept2 = Job.quantizePacked(finishedPacked || packed);
        bytes = internBytes(kept2, pool);
      }
      // The cap is enforced where a frame LANDS, against what is held: each frame is counted once, and a frame that would take the ring
      // past the cap is dropped (jobs already in flight when the cap was reached land here too). The first frame is always kept.
      if (ring.frames.size > 0 && ring.stats.vectorBytes + bytes > maxBytes) { ring.stats.capped = true; return; }
      const frame = { idx, yaw: yaws[idx], key, ms: res.ms, packed: kept, finishedPacked: kept2, exact, bytes, used: ++clock, raster: null };
      ring.frames.set(idx, frame);
      ring.stats.baked += 1; stats.frames += 1;
      ring.stats.vectorBytes += bytes;
      if (exact) ring.stats.exactBytes += bytes; else ring.stats.playbackFrames += 1;
      ring.stats.bakeMs += res.ms || 0;
      if (ring.stats.vectorBytes + bytes > maxBytes) ring.stats.capped = true; // another frame this size would not fit: stop feeding
      if (ring.onFrame) { try { ring.onFrame(frame, ring); } catch (err) { /* a listener must not stop the bake */ } }
    };

    const feed = (runner) => {
      if (ring.disposed || !ring.running || inflight.has(runner)) return;
      while (cursor < order.length && ring.frames.has(order[cursor])) cursor += 1;
      if (ring.stats.capped || cursor >= order.length) { finishIfDone(); return; }
      const idx = order[cursor++];
      const yaw = yaws[idx];
      const saved = target.get();
      let job = null;
      try { target.set(yaw); job = engine.sceneJobOnly(group); } catch (err) { job = null; }
      // The post below happens synchronously for a warm worker; a cold one posts later, so give it a private copy.
      let msg = null;
      if (job) {
        msg = { assembled: job.assembled, bounds: job.bounds, seed: job.seed, finish: { objectParams: job.objects, groupParams: group.params }, globals: globals() };
        if (!(runner.isReady && runner.isReady())) { try { msg = deepCopy(msg); } catch (err) { msg = null; } }
      }
      target.set(saved);
      if (!job || !msg) { ring.stats.failed += 1; feed(runner); return; }
      ring.stats.jobs += 1; stats.jobs += 1;
      let h;
      try { h = runner.run(msg, { lazy: true }); } catch (err) { ring.stats.failed += 1; return; }
      inflight.set(runner, idx);
      h.promise.then((res) => {
        inflight.delete(runner);
        land(idx, job.memoKey, res);
      }, () => {
        inflight.delete(runner);
        if (!ring.disposed) ring.stats.failed += 1;
      }).then(() => { if (!ring.disposed && ring.stats.failed < 4) feed(runner); else finishIfDone(); });
    };

    ring.start = () => {
      if (ring.running || ring.disposed || ring.key0 == null) return false;
      const n = Number.isFinite(opts.poolSize) ? opts.poolSize : defaultPoolSize();
      for (let i = 0; i < n; i++) {
        const r = factory();
        if (!r) break;
        runners.push(r);
      }
      if (!runners.length) return false;
      ring.stats.workers = runners.length;
      ring.running = true;
      ring.stats.startedAt = now();
      runners.forEach(feed);
      return true;
    };

    ring.readyCount = () => ring.frames.size;
    ring.complete = () => ring.frames.size >= count;
    // The ring's present spacing: `step` once every frame is in, twice that while only the coarse pass (or part of the fill) is.
    ring.spacing = () => (ring.complete() ? ring.step : ring.step * (coarse ? 2 : 1));

    ring.frameAt = (yaw) => {
      let best = null; let bd = Infinity;
      ring.frames.forEach((f) => { const d = circDist(f.yaw, yaw); if (d < bd) { bd = d; best = f; } });
      if (best) { best.used = ++clock; best.dist = bd; }
      return best;
    };

    // The nearest ready frame that also has a raster (what a drag frame draws), preferring `frameAt` when it has one.
    ring.rasterAt = (yaw, ok) => {
      const f = ring.frameAt(yaw);
      if (f && f.raster && (!ok || ok(f))) return f;
      let best = null; let bd = Infinity;
      ring.frames.forEach((g) => { if (!g.raster || (ok && !ok(g))) return; const d = circDist(g.yaw, yaw); if (d < bd) { bd = d; best = g; } });
      if (best) { best.used = ++clock; best.dist = bd; }
      return best;
    };

    ring.rasterBytes = () => { let n = 0; ring.frames.forEach((f) => { if (f.raster) n += f.raster.bytes; }); return n; };
    ring.loBytes = () => { let n = 0; ring.frames.forEach((f) => { if (f.rasterLo) n += f.rasterLo.bytes; }); return n; };
    ring.loCount = () => { let n = 0; ring.frames.forEach((f) => { if (f.rasterLo) n += 1; }); return n; };
    ring.dropRasters = () => { ring.frames.forEach((f) => { f.raster = null; f.rasterLo = null; }); };
    // Rasters are evicted by how long ago they were useful: the one farthest (circularly) from the yaw being viewed goes
    // first, which for a turntable dragged one way is also the least recently used. `keep` is never dropped.
    ring.farthestRaster = (yaw, except) => {
      let far = null; let fd = -1;
      ring.frames.forEach((f) => { if (!f.raster || f === except) return; const d = circDist(f.yaw, yaw); if (d > fd) { fd = d; far = f; } });
      return far ? { frame: far, dist: fd } : null;
    };
    ring.trimRasters = (maxRasterBytes, keep, yaw) => {
      let total = ring.rasterBytes();
      let dropped = 0;
      while (total > maxRasterBytes) {
        const far = ring.farthestRaster(yaw, keep);
        if (!far) break;
        total -= far.frame.raster.bytes; far.frame.raster = null; dropped += 1;
      }
      return dropped;
    };

    ring.report = () => ({
      count, ready: ring.frames.size, step: ring.step, workers: ring.stats.workers, jobs: ring.stats.jobs, failed: ring.stats.failed,
      capped: ring.stats.capped, exact: ring.stats.baked - ring.stats.playbackFrames, vectorMB: ring.stats.vectorBytes / 1048576, rasterMB: ring.rasterBytes() / 1048576, loMB: ring.loBytes() / 1048576, loReady: ring.loCount(),
      bakeWallMs: ring.stats.doneAt && ring.stats.startedAt ? ring.stats.doneAt - ring.stats.startedAt : null,
      composeMsSum: ring.stats.bakeMs,
    });

    ring.dispose = () => {
      if (ring.disposed) return;
      ring.disposed = true; ring.running = false; stats.disposed += 1;
      runners.forEach((r) => { try { r.terminate(); } catch (err) { /* gone */ } });
      runners.length = 0; inflight.clear();
      ring.frames.clear();
    };

    stats.rings += 1;
    return ring;
  };

  Scene3D.SpinRing = { create, inlineRunner, stats, normYaw, tidy, circDist, budgetMB, isMobile, releaseBuffers, samePacked };
  if (typeof module !== 'undefined' && module.exports) module.exports = Scene3D.SpinRing;
})();
