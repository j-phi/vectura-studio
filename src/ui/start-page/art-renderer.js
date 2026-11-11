/**
 * Start Page art renderer — window.Vectura.StartPageArtRenderer.
 *
 * Turns a saved document (.vectura payload) or a bundled preset into a plotter
 * SVG string on a PRIVATE VectorEngine, without touching the live editor:
 *
 *   renderDocument(payload) -> Promise<{ svg, bytes, algorithm, ownColors, pathCount, ms }>
 *   renderPreset(preset)    -> Promise<same>
 *   presetPayload(preset)   -> .vectura object (sync) for opening a preset in the editor
 *   sceneSession(payload)   -> { render(pose {yaw,pitch}, label) -> Promise<same>, dispose() }: one engine for every camera pose of a
 *                              3D Scene document (byte-identical to renderDocument of the posed document, cheaper per pose)
 *   stats()                 -> { count, slowestMs, slowestId, lastMs }
 *
 * The engine and the export code read the global SETTINGS (paper, margin, pens,
 * crop flags, layer counter ...), so every render snapshots SETTINGS first and
 * restores it in a finally block, even when the render throws; noise images the
 * payload brings along are removed again. Renders run one at a time, each on an
 * idle callback (setTimeout fallback), because the engine is synchronous.
 *
 * ownColors = { paper, ink, penName, paperName } comes from the document's own
 * settings (a preset reports the fixed Start Page paper and pen).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  // Presets are drawn on a fixed sheet with a fixed pen so a cached thumbnail never depends on
  // whatever paper or pen the user's current document uses.
  const PRESET_SHEET = Object.freeze({ paperSize: 'a4', paperOrientation: 'landscape', margin: 10 });
  const PRESET_PEN = Object.freeze({ id: 'pen-1', name: 'Pen 1', color: '#111111', width: 0.3 });
  const PRESET_PAPER = Object.freeze({ color: '#f4efe4', name: 'Paper' });
  // Presets with no UI apply path (bespoke panels): they load through importState like a saved scene.
  const NO_UI_APPLY_PATH = new Set(['text', 'scene3d']);
  const TRANSFORM_RESET = Object.freeze({ posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 });

  const copyOf = (v) => (v === undefined ? v : Vectura.Utils.clone(v));
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c);
  const bytesOf = (text) => {
    try { if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length; } catch (_e) { /* fall through */ }
    return text.length;
  };

  // ---------------------------------------------------------------- isolation
  // Every render starts from a PRISTINE copy of the factory SETTINGS (the App's defaultSettingsSnapshot, taken before
  // cookie preferences were applied; this module's own load-time copy when there is no App), overlaid with the
  // document's settings. A document that omits lightSource / pens / optimizationDefaults therefore renders with the
  // defaults, never with whatever the live editor has right now, and the cached thumbnail is reproducible.
  // The live SETTINGS is restored IN PLACE (same object identities, deep-assigned) in finally, so modules holding a
  // reference to SETTINGS or to one of its objects (pens, lightSource ...) never see a replacement.
  const isObj = (v) => v !== null && typeof v === 'object';
  const assignInPlace = (target, src) => {
    if (Array.isArray(target)) {
      const old = target.slice();
      target.length = 0;
      src.forEach((v, i) => { target[i] = reuse(old[i], v); });
      return target;
    }
    const old = Object.assign({}, target);
    Object.keys(target).forEach((k) => { delete target[k]; });
    Object.keys(src).forEach((k) => { target[k] = reuse(old[k], src[k]); });
    return target;
  };
  const reuse = (cur, next) => (isObj(cur) && isObj(next) && Array.isArray(cur) === Array.isArray(next) ? assignInPlace(cur, next) : next);
  const LOAD_TIME_DEFAULTS = (() => { try { return copyOf(Vectura.SETTINGS); } catch (_e) { return null; } })();
  const pristineSettings = () => (G.app && G.app.defaultSettingsSnapshot) || LOAD_TIME_DEFAULTS || null;

  const snapshotSettings = () => {
    const S = Vectura.SETTINGS;
    const saved = new Map();
    Object.keys(S).forEach((k) => {
      let json;
      try { json = JSON.stringify(S[k]); } catch (_e) { json = undefined; } // not serializable: reference only
      saved.set(k, { ref: S[k], json });
    });
    const restore = () => {
      Object.keys(S).forEach((k) => { if (!saved.has(k)) delete S[k]; });
      saved.forEach(({ ref, json }, k) => {
        if (json === undefined) { S[k] = ref; return; }
        const was = JSON.parse(json);
        if (isObj(ref) && isObj(was) && Array.isArray(ref) === Array.isArray(was)) { assignInPlace(ref, was); S[k] = ref; } else S[k] = was;
      });
    };
    const base = pristineSettings();
    if (base) {
      Object.keys(S).forEach((k) => {
        if (!Object.prototype.hasOwnProperty.call(base, k)) { S[k] = undefined; return; }
        const next = copyOf(base[k]);
        const cur = saved.get(k) && saved.get(k).ref;
        if (isObj(cur) && isObj(next) && Array.isArray(cur) === Array.isArray(next)) { assignInPlace(cur, next); S[k] = cur; } else S[k] = next;
      });
    }
    return restore;
  };

  const snapshotNoiseImages = () => {
    const V = Vectura;
    const before = V.NOISE_IMAGES;
    const keys = before ? new Map(Object.entries(before)) : null;
    return () => {
      if (!before) { if (V.NOISE_IMAGES && V.NOISE_IMAGES !== before) delete V.NOISE_IMAGES; return; }
      V.NOISE_IMAGES = before;
      Object.keys(before).forEach((id) => { if (!keys.has(id)) delete before[id]; });
      keys.forEach((img, id) => { if (before[id] !== img) before[id] = img; });
    };
  };

  const applyPens = (pens) => {
    if (!Array.isArray(pens) || !pens.length) return false;
    const validator = Vectura.PenValidate && Vectura.PenValidate.validatePens;
    const validated = typeof validator === 'function' ? validator(copyOf(pens)) : copyOf(pens);
    if (!validated.length) return false;
    Vectura.SETTINGS.pens = validated;
    return true;
  };

  // The slice of Project > applyState that the engine and the export read.
  const applyDocumentSettings = (s) => {
    const S = Vectura.SETTINGS;
    const take = (key) => { if (s[key] !== undefined) S[key] = s[key]; };
    // A document is untrusted: numbers that reach the SVG export string must be numbers.
    const takeNumber = (key) => {
      const v = s[key];
      if ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))) S[key] = Number(v);
    };
    ['margin', 'precision', 'strokeWidth', 'paperWidth', 'paperHeight', 'plotterOptimize', 'globalLayerCount'].forEach(takeNumber);
    ['truncate', 'cropExports', 'removeHiddenGeometry', 'paperSize', 'paperOrientation', 'preview3dQuality'].forEach(take);
    S.strokeWidthOverride = s.strokeWidthOverride === true;
    if (s.lightSource) S.lightSource = copyOf(s.lightSource);
    if (s.optimizationDefaults) S.optimizationDefaults = copyOf(s.optimizationDefaults);
    if (isHex(s.bgColor)) S.bgColor = s.bgColor;
    applyPens(s.pens);
    S.optimizationExport = false;
  };

  // ---------------------------------------------------------------- colors
  const paperNameOf = (type) => {
    const t = Vectura.PAPERS && Vectura.PAPERS.TYPES && type && Vectura.PAPERS.TYPES[type];
    return (t && (t.label || t.short)) || 'Paper';
  };
  const ownColorsOf = (settings, engine) => {
    const s = settings || {};
    const P = Vectura.Paper;
    const paperCfg = s.paper && typeof s.paper === 'object' ? s.paper : null;
    let paper = (P && P.toHex6 && (P.toHex6(paperCfg && paperCfg.color) || P.toHex6(s.bgColor))) || null;
    if (!paper && P && P.baseColorFor) paper = P.baseColorFor(paperCfg && paperCfg.type);
    if (!isHex(paper)) paper = '#ffffff';
    const pens = Array.isArray(Vectura.SETTINGS.pens) ? Vectura.SETTINGS.pens : [];
    const inked = (engine && engine.layers || []).find((l) => l && !l.isGroup && Array.isArray(l.paths) && l.paths.length);
    const pen = (inked && pens.find((p) => p.id === inked.penId)) || pens[0] || {};
    const ink = isHex(pen.color) ? pen.color : (inked && isHex(inked.color) ? inked.color : '#000000');
    return { paper, ink, penName: pen.name || 'Pen 1', paperName: paperNameOf(paperCfg && paperCfg.type) };
  };

  const algorithmOf = (engine) => {
    let best = null;
    let bestN = -1;
    (engine.layers || []).forEach((l) => {
      if (!l || l.isGroup || l.modifier || l.type === 'compound') return;
      const n = Array.isArray(l.paths) ? l.paths.length : 0;
      if (n > bestN) { best = l.type; bestN = n; }
    });
    if (best) return best;
    const first = (engine.layers || [])[0];
    return first ? first.type : '';
  };

  const buildSvg = (engine) => {
    const B = Vectura.ExportSvgBuilder;
    if (!B) throw new Error('ExportSvgBuilder is not loaded');
    // importState / addLayer already ran computeAllDisplayGeometry once; the snapshot reuses it.
    const snapshot = B.buildExportSnapshot(engine, { computeDisplayGeometry: () => {}, optimizeTargets: null });
    return { svg: B.buildSvgDocument(snapshot), pathCount: B.countPaths(snapshot) };
  };

  // ---------------------------------------------------------------- the two renders
  const loadDocumentImages = (payload) => {
    if (!payload.images || typeof payload.images !== 'object') return;
    const store = (Vectura.NOISE_IMAGES = Vectura.NOISE_IMAGES || {});
    Object.entries(payload.images).forEach(([id, img]) => {
      if (!img || !Array.isArray(img.data)) return;
      store[id] = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
    });
  };

  const documentJob = (payload) => {
    const state = payload && (payload.state || payload);
    if (!state || !state.engine || !state.settings) throw new Error('Not a Vectura document');
    const restoreSettings = snapshotSettings();
    const restoreImages = snapshotNoiseImages();
    try {
      applyDocumentSettings(state.settings);
      loadDocumentImages(payload);
      const engine = new Vectura.VectorEngine();
      if (Vectura.SETTINGS.paperSize) engine.setProfile(Vectura.SETTINGS.paperSize);
      engine.importState(copyOf(state.engine));
      const { svg, pathCount } = buildSvg(engine);
      return { svg, pathCount, algorithm: algorithmOf(engine), ownColors: ownColorsOf(state.settings, engine) };
    } finally {
      restoreImages();
      restoreSettings();
    }
  };

  // Builds the private engine for a preset inside the settings/noise-image snapshot and hands it to `use`.
  // The one preset -> document path: renderPreset draws it, presetPayload serializes it for the editor.
  const withPresetEngine = (preset, use) => {
    const type = preset && preset.preset_system;
    if (!type || !preset.params) throw new Error('Not a preset');
    const restoreSettings = snapshotSettings();
    const restoreImages = snapshotNoiseImages();
    try {
      const S = Vectura.SETTINGS;
      Object.assign(S, PRESET_SHEET, { optimizationExport: false, plotterOptimize: 0, truncate: true, cropExports: true,
        removeHiddenGeometry: true, strokeWidthOverride: false, precision: 3, strokeWidth: PRESET_PEN.width });
      S.pens = [copyOf(PRESET_PEN)];
      S.globalLayerCount = 0;
      const engine = new Vectura.VectorEngine();
      engine.setProfile(S.paperSize);
      const id = engine.addLayer(type);
      const layer = engine.layers.find((l) => l.id === id)
        || engine.layers.find((l) => l.type === type && !l.parentId);
      if (!layer) throw new Error(`Cannot create a ${type} layer`);
      const base = Vectura.ALGO_DEFAULTS && Vectura.ALGO_DEFAULTS[type] ? copyOf(Vectura.ALGO_DEFAULTS[type]) : {};
      // The preset's own seed keeps the picture stable (the UI apply path keeps the layer's random seed instead).
      const params = { ...layer.params, ...base, ...copyOf(preset.params), ...TRANSFORM_RESET, preset: preset.id };
      // A preset without its own seed would otherwise inherit the new layer's RANDOM seed and draw a different picture
      // on every render (and on every `npm run start-page:picks`); pin it so a cover piece is reproducible.
      if (!Number.isFinite(Number(preset.params.seed))) params.seed = 1;
      if (NO_UI_APPLY_PATH.has(type)) {
        // Bespoke panels: load the params the way an opened file does.
        const doc = engine.exportState();
        const target = doc.layers.find((l) => l.id === layer.id);
        target.params = params;
        if (type === 'scene3d') {
          // A scene preset is a saved MONOLITH scene: one non-group layer in a format-1 document.
          target.isGroup = false;
          target.containerRole = null;
          target.groupType = null;
          doc.layers = [target];
          doc.activeLayerId = target.id;
          doc.formatVersion = 1;
        }
        engine.importState(doc);
      } else {
        layer.params = params;
        engine.generate(layer.id);
        engine.computeAllDisplayGeometry();
      }
      return use(engine, type);
    } finally {
      restoreImages();
      restoreSettings();
    }
  };

  const presetJob = (preset) => withPresetEngine(preset, (engine, type) => {
    const { svg, pathCount } = buildSvg(engine);
    return {
      svg, pathCount, algorithm: type,
      ownColors: { paper: PRESET_PAPER.color, ink: PRESET_PEN.color, penName: PRESET_PEN.name, paperName: PRESET_PAPER.name },
    };
  });

  // A preset as a complete .vectura document (fixed Start Page sheet, pen and paper) that the editor can open.
  // Synchronous: it borrows SETTINGS and puts them back before returning, so it cannot interleave with a render.
  const presetPayload = (preset) => withPresetEngine(preset, (engine) => {
    const S = Vectura.SETTINGS;
    const profile = engine.currentProfile || {};
    return {
      type: 'vectura',
      version: `${Vectura.APP_VERSION || ''}`,
      state: {
        engine: engine.exportState(),
        settings: {
          paperSize: S.paperSize, paperOrientation: S.paperOrientation, margin: S.margin,
          paperWidth: profile.width, paperHeight: profile.height,
          precision: S.precision, strokeWidth: S.strokeWidth, strokeWidthOverride: false,
          truncate: S.truncate, cropExports: S.cropExports, removeHiddenGeometry: S.removeHiddenGeometry,
          plotterOptimize: S.plotterOptimize,
          paper: { type: 'none', color: PRESET_PAPER.color }, bgColor: PRESET_PAPER.color,
          pens: copyOf(S.pens),
        },
      },
      images: {},
    };
  });

  // ---------------------------------------------------------------- sliced work
  // A baked pose used to land as one 80-200 ms task (curve finish, then the whole SVG). Everything that is left on the main thread
  // for a worker-composed pose now runs in slices of SLICE_MS, each its own task, and holds back while the user scrolls or
  // interacts (QUIET_MS after the last scroll / wheel / pointer / touch / key event), so the page paints and scrolls between them.
  const tuning = { sliceMs: 4, quietMs: 120 }; // mutable for tests and tools
  const sliceStat = { slices: 0, maxMs: 0, sumMs: 0, pauses: 0, guardMs: 0, worst: [] }; // worst: the few slowest slices as [ms, phase]
  let lastInteract = -Infinity;
  let watching = false;
  const watchInteraction = () => {
    if (watching || !G.addEventListener) return;
    watching = true;
    const bump = () => { lastInteract = nowMs(); };
    ['pointermove', 'pointerdown', 'wheel', 'touchmove', 'keydown'].forEach((n) => G.addEventListener(n, bump, { capture: true, passive: true }));
    if (G.document && G.document.addEventListener) G.document.addEventListener('scroll', bump, { capture: true, passive: true });
  };
  // step() -> { done, value }: one slice. Each slice is its own task, run only while the page is quiet.
  const sliceLoop = (step, phase) => new Promise((resolve, reject) => {
    watchInteraction();
    const tick = () => {
      const quiet = tuning.quietMs - (nowMs() - lastInteract);
      if (quiet > 0) { sliceStat.pauses += 1; setTimeout(tick, quiet); return; }
      const t0 = nowMs();
      let r;
      try { r = step(); } catch (err) { reject(err); return; }
      const d = nowMs() - t0;
      sliceStat.slices += 1; sliceStat.sumMs += d; if (d > sliceStat.maxMs) sliceStat.maxMs = d;
      if (d > 12) { sliceStat.worst.push([Math.round(d * 10) / 10, `${phase || ''}>${r.done ? 'end' : (r.value || '')}`]); if (sliceStat.worst.length > 12) sliceStat.worst.shift(); }
      if (r.done) resolve(r.value); else setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  });
  // The worker's packed ink as point objects, a few milliseconds of entries per task.
  const unpackSliced = (packed) => {
    const Job = Vectura.Scene3D && Vectura.Scene3D.ComposeJob;
    const entries = (packed && packed.paths) || [];
    const out = [];
    let i = 0;
    return sliceLoop(() => {
      const t0 = nowMs();
      while (i < entries.length && nowMs() - t0 < tuning.sliceMs) { out.push(Job.unpackEntry(entries[i])); i += 1; }
      return i >= entries.length ? { done: true, value: out } : { done: false };
    }, 'unpack');
  };

  // ---------------------------------------------------------------- scene sessions
  // A turning 3D Scene draws many poses of ONE document. A session builds the private engine once (the same setup as
  // documentJob) and, for each pose, moves only the scene camera and recomputes the display geometry, then builds the SVG
  // exactly as documentJob does: the same bytes as a fresh renderDocument of the posed document, minus the engine build and the
  // per-object generation. Every call still snapshots and restores SETTINGS inside the shared idle queue, so it interleaves
  // safely with other Start Page renders.
  const isSceneCameraLayer = (l) => !!(l && l.type === 'scene3d' && l.params && typeof l.params === 'object' && (!l.isGroup || l.containerRole === 'scene'));
  const turnCamera = (layers, pose) => {
    (layers || []).forEach((l) => {
      if (isSceneCameraLayer(l)) l.params.camera = Object.assign({}, l.params.camera || {}, { yaw: pose.yaw, pitch: pose.pitch });
    });
  };
  const sameCamera = (a, b) => !!(a && b && a.yaw === b.yaw && a.pitch === b.pitch);

  const sceneSession = (payload) => {
    const state = payload && (payload.state || payload);
    if (!state || !state.engine || !state.settings) throw new Error('Not a Vectura document');
    let engine = null;
    let current = null;
    let settled = false; // the engine has done at least one exact compose (something to warp from)
    let disposed = false;
    const job = (pose) => {
      if (disposed) throw new Error('Scene session disposed');
      const restoreSettings = snapshotSettings();
      const restoreImages = snapshotNoiseImages();
      try {
        applyDocumentSettings(state.settings);
        loadDocumentImages(payload);
        if (!engine) {
          const doc = copyOf(state.engine);
          turnCamera(doc.layers, pose);
          const built = new Vectura.VectorEngine();
          if (Vectura.SETTINGS.paperSize) built.setProfile(Vectura.SETTINGS.paperSize);
          built.importState(doc);
          engine = built;
        } else if (!sameCamera(current, pose)) {
          turnCamera(engine.layers, pose);
          engine.computeAllDisplayGeometry();
        }
        current = { yaw: pose.yaw, pitch: pose.pitch };
        settled = true;
        const { svg, pathCount } = buildSvg(engine);
        return { svg, pathCount, algorithm: algorithmOf(engine), ownColors: ownColorsOf(state.settings, engine) };
      } finally {
        restoreImages();
        restoreSettings();
      }
    };
    // Once the session has one exact compose, every further pose is composed in a Web Worker (the same compose the
    // engine runs, byte-identical): stage A posts the job under the document's settings, stage B installs the result
    // and builds the SVG under them again. The main thread never runs the generator for a baked pose. No worker, a
    // scene the worker cannot take, or a stale result: the exact synchronous render below.
    let client;
    const workerClient = () => {
      if (client === undefined) {
        const C = Vectura.Scene3D && Vectura.Scene3D.ComposeClient;
        client = C && typeof C.create === 'function' && C.available() ? C.create() : null;
      }
      return client;
    };
    // Run `fn` with the document's settings and noise images applied, then put the live ones back (the same isolation every render has).
    const underDoc = (fn) => {
      const t0 = nowMs();
      const restoreSettings = snapshotSettings();
      const restoreImages = snapshotNoiseImages();
      let inner = 0;
      try {
        applyDocumentSettings(state.settings);
        if (payload.images) loadDocumentImages(payload);
        const t1 = nowMs();
        try { return fn(); } finally { inner = nowMs() - t1; }
      } finally {
        restoreImages();
        restoreSettings();
        sliceStat.guardMs += nowMs() - t0 - inner;
      }
    };
    const SCENE_TREE_TYPES = new Set(['scene3d', 'object3d', 'sceneGround3d', 'sceneLight3d', 'booleanGroup3d']);
    // The finishing stage of a worker-composed pose, in slices: the worker's finished ink is unpacked a few milliseconds at a time, installed,
    // and the SVG snapshot and document are built a few milliseconds at a time. Same builders, same bytes; only the task sizes differ.
    const finishPose = (pose, done, label) => {
      const Job = Vectura.Scene3D && Vectura.Scene3D.ComposeJob;
      const B = Vectura.ExportSvgBuilder;
      if (!B) throw new Error('ExportSvgBuilder is not loaded');
      const usable = done.filter(Boolean);
      return Promise.all(usable.map((d) => {
        const r = d.res || {};
        // a lazy result keeps its ink packed: unpack the finished ink in slices. An unpacked result (a client that does not do lazy) is used as it is.
        if (r.finishedPacked && Job) return unpackSliced(r.finishedPacked).then((finished) => ({ paths: [], finished, packed: r.packed, ms: r.ms, bakes: r.bakes || [] }));
        if (r.packed && !r.paths && !r.finished && Job) return Promise.resolve({ paths: Job.unpack(r.packed), finished: null, packed: r.packed, ms: r.ms, bakes: r.bakes || [] });
        return Promise.resolve(r);
      })).then((results) => {
        if (disposed) throw new Error('Scene session disposed');
        let allDelivered = done.length > 0 && usable.length === done.length;
        let workerMs = 0;
        underDoc(() => {
          usable.forEach((d, i) => { if (!engine.finishSceneAsync(d.c, results[i])) allDelivered = false; workerMs += Number(results[i].ms) || 0; });
          // A scene-only document has nothing else to recompute: the worker's ink is installed and the display geometry would only
          // compose each scene group a second time (a memo hit that runs the curve finish again on this thread). Anything else - another
          // layer, an optimized export, a group the worker did not deliver - recomputes exactly as before.
          const sceneOnly = (engine.layers || []).every((l) => l && SCENE_TREE_TYPES.has(l.type) && !(l.mask && l.mask.enabled));
          if (!(allDelivered && sceneOnly && !Vectura.SETTINGS.optimizationExport)) engine.computeAllDisplayGeometry();
        });
        current = { yaw: pose.yaw, pitch: pose.pitch };
        const buildOpts = { computeDisplayGeometry: () => {}, optimizeTargets: null, sliceMs: tuning.sliceMs };
        const snap = B.snapshotSteps(engine, buildOpts);
        return sliceLoop(() => underDoc(() => snap.next()), 'snapshot').then((snapshot) => {
          const doc = B.documentSteps(snapshot, { sliceMs: tuning.sliceMs });
          return sliceLoop(() => underDoc(() => doc.next()), 'document').then((svg) => ({
            svg, pathCount: B.countPaths(snapshot), algorithm: algorithmOf(engine), ownColors: ownColorsOf(state.settings, engine), worker: true, workerMs, sliced: true,
          }));
        });
      });
    };
    const renderPose = (pose, label, gate) => {
      const sync = () => enqueue(label || 'scene', () => job(pose));
      if (!engine || !settled || sameCamera(current, pose) || !workerClient()) return sync();
      return enqueue(`${label || 'scene'}~post`, () => {
        if (disposed) throw new Error('Scene session disposed');
        return underDoc(() => {
          turnCamera(engine.layers, pose);
          current = null;
          const begun = [];
          for (const l of engine.layers) {
            if (!(l && l.isGroup && l.type === 'scene3d' && l.containerRole === 'scene')) continue;
            const c = engine.beginSceneAsync(l.id, { client, lazy: true });
            if (!c) return { begun: null };
            begun.push(c);
          }
          return { begun };
        });
      }).then(({ begun }) => {
        if (!begun) return sync();
        return Promise.all(begun.map((c) => (c.done ? null : c.promise.then((res) => ({ c, res }), () => null)))).then((done) => Promise.resolve(typeof gate === 'function' ? gate() : undefined).then(() => done)).then((done) => enqueueSliced(`${label || 'scene'}~done`, () => {
          if (disposed) throw new Error('Scene session disposed');
          return finishPose(pose, done, label);
        }));
      });
    };
    return {
      render: (pose, label, gate) => renderPose(pose, label, gate),
      dispose: () => { disposed = true; engine = null; current = null; settled = false; if (client) { try { client.terminate(); } catch (e) { /* gone */ } } client = null; },
    };
  };

  // ---------------------------------------------------------------- idle queue
  let tail = Promise.resolve();
  const stat = { count: 0, slowestMs: 0, slowestId: null, lastMs: 0 };
  const onIdle = (fn) => new Promise((resolve, reject) => {
    const run = () => { try { resolve(fn()); } catch (err) { reject(err); } };
    // No forcing timeout: a render is one long synchronous task, so it waits for a genuinely idle moment (the cover
    // paints and takes input between pieces) instead of being force-run into the middle of a busy frame.
    if (typeof G.requestIdleCallback === 'function') G.requestIdleCallback(run);
    else setTimeout(run, 0);
  });
  const nowMs = () => (G.performance && typeof G.performance.now === 'function' ? G.performance.now() : Date.now());

  const enqueue = (label, job) => {
    const run = tail.then(() => onIdle(() => {
      const t0 = nowMs();
      const out = job();
      const ms = nowMs() - t0;
      stat.count += 1;
      stat.lastMs = ms;
      if (ms > stat.slowestMs) { stat.slowestMs = ms; stat.slowestId = label; }
      const total = ms + (Number(out.workerMs) || 0); // a worker-composed pose also owns the compose time it took off this thread
      return Object.assign(out, { bytes: typeof out.svg === 'string' ? bytesOf(out.svg) : 0, ms: total });
    }));
    tail = run.then(() => undefined, () => undefined);
    return run;
  };

  // Like `enqueue`, for a job that finishes in slices (it returns a promise): it holds the queue until the promise settles, and what it
  // reports as the slowest render is the longest single TASK it ran (the longest slice), which is what blocks the page.
  const enqueueSliced = (label, job) => {
    const run = tail.then(() => onIdle(() => 0)).then(() => {
      const before = { n: sliceStat.slices, max: sliceStat.maxMs, sum: sliceStat.sumMs };
      sliceStat.maxMs = 0;
      const t0 = nowMs();
      return Promise.resolve().then(job).then((out) => {
        const wall = nowMs() - t0;
        const task = sliceStat.maxMs;
        sliceStat.maxMs = Math.max(before.max, task);
        stat.count += 1;
        stat.lastMs = task;
        if (task > stat.slowestMs) { stat.slowestMs = task; stat.slowestId = label; }
        return Object.assign(out, { bytes: typeof out.svg === 'string' ? bytesOf(out.svg) : 0, ms: (sliceStat.sumMs - before.sum) + (Number(out.workerMs) || 0), wallMs: wall, sliceMaxMs: task });
      });
    });
    tail = run.then(() => undefined, () => undefined);
    return run;
  };

  Vectura.StartPageArtRenderer = {
    renderDocument: (payload, label) => enqueue(label || 'document', () => documentJob(payload)),
    sceneSession,
    renderPreset: (preset) => enqueue(preset && preset.id, () => presetJob(preset)),
    presetPayload,
    stats: () => Object.assign({}, stat, { slices: sliceStat.slices, sliceMaxMs: sliceStat.maxMs, slicePauses: sliceStat.pauses, sliceGuardMs: sliceStat.guardMs, sliceSumMs: sliceStat.sumMs, sliceWorst: sliceStat.worst.slice() }),
    tuning,
    PRESET_SHEET,
    PRESET_PEN,
  };
})();
