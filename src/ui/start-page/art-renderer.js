/**
 * Start Page art renderer — window.Vectura.StartPageArtRenderer.
 *
 * Turns a saved document (.vectura payload) or a bundled preset into a plotter
 * SVG string on a PRIVATE VectorEngine, without touching the live editor:
 *
 *   renderDocument(payload) -> Promise<{ svg, bytes, algorithm, ownColors, pathCount, ms }>
 *   renderPreset(preset)    -> Promise<same>
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
  const documentJob = (payload) => {
    const state = payload && (payload.state || payload);
    if (!state || !state.engine || !state.settings) throw new Error('Not a Vectura document');
    const restoreSettings = snapshotSettings();
    const restoreImages = snapshotNoiseImages();
    try {
      applyDocumentSettings(state.settings);
      if (payload.images && typeof payload.images === 'object') {
        const store = (Vectura.NOISE_IMAGES = Vectura.NOISE_IMAGES || {});
        Object.entries(payload.images).forEach(([id, img]) => {
          if (!img || !Array.isArray(img.data)) return;
          store[id] = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
        });
      }
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

  const presetJob = (preset) => {
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
      if (!Number.isFinite(Number(params.seed))) params.seed = 1;
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
      const { svg, pathCount } = buildSvg(engine);
      return {
        svg, pathCount, algorithm: type,
        ownColors: { paper: PRESET_PAPER.color, ink: PRESET_PEN.color, penName: PRESET_PEN.name, paperName: PRESET_PAPER.name },
      };
    } finally {
      restoreImages();
      restoreSettings();
    }
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
      return Object.assign(out, { bytes: bytesOf(out.svg), ms });
    }));
    tail = run.then(() => undefined, () => undefined);
    return run;
  };

  Vectura.StartPageArtRenderer = {
    renderDocument: (payload, label) => enqueue(label || 'document', () => documentJob(payload)),
    renderPreset: (preset) => enqueue(preset && preset.id, () => presetJob(preset)),
    stats: () => Object.assign({}, stat),
    PRESET_SHEET,
    PRESET_PEN,
  };
})();
