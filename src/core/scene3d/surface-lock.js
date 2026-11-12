/**
 * Scene3D.SurfaceLock — surface-locked fills: bake once, frame per pose (docs/surface-lock-contract.md).
 *
 *   effectiveMarkSpace(style, ctx) -> 'pose' | 'surface'     contract §12 (EXCLUSIONS is data)
 *   explainMarkSpace(style, ctx) -> { mode, reason }          the same decision with the exclusion id / 'no baker'
 *   bakerFor(spec) -> baker | null                            contract §9 (BAKER_KEYS order)
 *   bakeKey(spec) -> string                                   contract §8
 *   bake(spec) -> MarkSet (cached, LRU by bytes)              contract §8, §9
 *   toneTable(spec, toneCtx) -> { lut, scaleFn }              contract §5 (memoized per baker + tone key)
 *   poseOf(transform, camera, bounds) -> Pose                 contract §4
 *   frame(markSets, pose, view) -> lines                      contract §5-§6 (Level F output, §6.1)
 *   frameable(p, bounds) -> boolean                           contract §13 (Level S gate; FRAMEABLE is data)
 *   sceneFrame(p, bounds, ctx) -> undefined                   contract §13 (Level S output, §6.2)
 *   takeFreshBakes(opts) -> [{ key, ms }]                    the MarkSets baked since the last take (a worker hands them to the main thread)
 *   adopt(entries) -> n                                       installs baked MarkSets into the cache (no bake, no stat bump)
 *   missingBakes(specs) -> specs                              the specs whose MarkSet is not cached (the cache is not touched)
 *   sceneBakeSpecs(p, bounds, ctx) -> specs                   the BakeSpec of every filled object (what sceneFrame would bake)
 *   stats, resetStats(), clearCache(), setCacheLimitBytes()   contract §8, §11
 *
 * Neighbour modules are looked up lazily at call time (Vectura.Scene3D.X), never at load (contract §1).
 *
 * Interfaces this module ASSUMES from the neighbours that are still stubs (W1-B / W1-E may differ; W2-C reconciles):
 *   SurfaceLockVisibility.supports(obj) -> bool
 *   SurfaceLockVisibility.meshBake(obj) -> mesh                         pose-free, cached here by (primitive, params, scale)
 *   SurfaceLockVisibility.occluder(meshBakes, { cam, objs }) -> occ     occ.segFor(bake), occ.clipRun(pts, seg) -> [{ pts, visible }], occ.closedMerge(runs)
 *   SurfaceLockVisibility.outline(mesh, pose, occ) -> { silhouette, crease, boundary }   each an array of visible runs { pts, visible }
 *   SurfaceLockShadow.supports({ shadow, light, lights, ground, casters }) -> bool
 *   SurfaceLockShadow.bakeGround(groundSpec, shadowCfg, penWidth, seed) -> groundHatch
 *   SurfaceLockShadow.frameShadow(groundHatch, casters, lightDirWorld, pose) -> { runs: [{ pts: [{x,y,z}] }] }
 */
(function registerSceneSurfaceLock() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});
  const CFG = Vectura.SCENE3D_SURFACE_LOCK || {};

  const NZ_CULL = CFG.NZ_CULL || 0.08;
  const LUT_N = CFG.TONE_LUT_SIZE || 256;
  const NEAR_FRAC = CFG.NEAR_PLANE_FRAC || 0.05;
  const CACHE_MB = CFG.CACHE_MB || 64;
  const CACHE_MB_MOBILE = CFG.CACHE_MB_MOBILE || 24;
  const TONE_MEMO_MAX = CFG.TONE_LUT_MEMO_ENTRIES || 32;
  const AUX_CACHE_MAX = CFG.AUX_CACHE_ENTRIES || 16;
  const BAKE_VERSION = CFG.BAKE_VERSION || 1;
  const FLOOR_SLACK = CFG.PLOT_FLOOR_SLACK || 0.8;
  const FALLBACK_FLOOR_PEN = CFG.FALLBACK_FLOOR_PEN || 2.2;
  const FRESH_MAX = CFG.FRESH_MAX || 256;
  const FACING_COMP = Number.isFinite(CFG.V2 && CFG.V2.FACING_COMP) ? CFG.V2.FACING_COMP : 1;

  // Dispatch order (contract §9): the first baker whose supports(spec) is true bakes the spec.
  // Each is its own Scene3D namespace so Engine's sceneModuleFingerprint sees its functions.
  const BAKER_KEYS = Object.freeze(['SurfaceLockMezzo', 'SurfaceLockLadder', 'SurfaceLockLaws', 'SurfaceLockFaceted']);

  const now = () => ((globalScope.performance && typeof globalScope.performance.now === 'function') ? globalScope.performance.now() : Date.now());
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : (Number.isFinite(Number(v)) && v !== null && v !== '' && v !== undefined ? Number(v) : d));

  const freshStats = () => ({
    bakes: 0, bakeHits: 0, bakeMisses: 0, frames: 0, sceneFrames: 0,
    verticesIn: 0, verticesOut: 0, runsIn: 0, runsOut: 0,
    culledFacing: 0, culledGrazing: 0, culledTone: 0, culledOccluded: 0, toneEvals: 0, toneRemapPow: 0,
    bakeErrors: 0, adopted: 0, sceneFallbacks: 0, msBake: 0, msFrame: 0, msFrameLast: 0, cacheBytes: 0, cacheEntries: 0, evictions: 0,
  });
  const stats = freshStats();
  // The cache counters describe live state, not events: resetStats keeps them in step with the cache.
  const resetStats = () => {
    Object.assign(stats, freshStats());
    stats.cacheBytes = cacheBytes; stats.cacheEntries = cache.size;
    return stats;
  };

  // ── exclusions (contract §12): data, each with an example the tests drive ─────────────────────────────────────────
  const truthyList = (v) => (Array.isArray(v) ? v.length > 0 : !!v);
  // Pose-mode highlightCfg normalisation: 'keep' is an alias of 'none'; an unknown or empty value reads as 'blank'.
  const HIGHLIGHT_TREATMENTS = Object.freeze(['blank', 'none', 'restyle', 'thin', 'dashed', 'dotted', 'sparse', 'altFill', 'burst', 'stippleOut']);
  const highlightTreatmentOf = (st) => {
    const raw = st.highlightTreatment === 'keep' ? 'none' : st.highlightTreatment;
    return HIGHLIGHT_TREATMENTS.indexOf(raw) !== -1 ? raw : 'blank';
  };
  const EXCLUSIONS = Object.freeze([
    { id: 'xray', test: (st, cx) => cx.visibility === 'xray', example: { ctx: { visibility: 'xray' } } },
    { id: 'highlightTreatment', test: (st) => { const t = highlightTreatmentOf(st); return t !== 'blank' && t !== 'none'; }, example: { style: { highlightTreatment: 'thin' } } },
    { id: 'highlightLightDriven', test: (st) => st.highlightMode === 'lightDriven', example: { style: { highlightMode: 'lightDriven' } } },
    { id: 'toneBands', test: (st) => Math.round(num(st.toneBands, 0)) >= 2, example: { style: { toneBands: 3 } } },
    { id: 'tierPens', test: (st) => truthyList(st.tierPens), example: { style: { tierPens: ['a', 'b'] } } },
    { id: 'wrapFlat', test: (st) => st.wrap === 'flat', example: { style: { wrap: 'flat' } } },
    { id: 'contourRegion', test: (st, cx, mp) => mp === 'contour' && st.contourStyle === 'region', example: { style: { contourStyle: 'region' }, ctx: { mapper: 'contour' } } },
    { id: 'spiralFlatClip', test: (st, cx, mp) => mp === 'spiral' && st.spiralMode === 'flatClip', example: { style: { spiralMode: 'flatClip' }, ctx: { mapper: 'spiral' } } },
    { id: 'emissiveCoreBlank', test: (st, cx) => cx.emissiveCoreBlank === true, example: { ctx: { emissiveCoreBlank: true } } },
    { id: 'csgCarve', test: (st, cx) => cx.csgCarve === true, example: { ctx: { csgCarve: true } } },
    { id: 'receiveShadow', test: (st, cx) => cx.receiveShadow === true, example: { ctx: { receiveShadow: true } } }, // lifted by W3-C
    { id: 'areaLight', test: (st, cx) => cx.areaLight === true, example: { ctx: { areaLight: true } } },
    // Pose-independent: the object carries a per-face style override (or several fill styles), so one MarkSet cannot cover it.
    { id: 'faceStyles', test: (st, cx) => cx.faceStyles === true, example: { ctx: { faceStyles: true } } },
    // Depth fade reads the projected record (view-dependent), so it cannot live in a world-keyed tone memo.
    { id: 'depthFade', test: (st) => st.depthFade === true, example: { style: { depthFade: true } } },
  ]);

  const bakerFor = (spec) => {
    if (!spec) return null;
    for (let i = 0; i < BAKER_KEYS.length; i++) {
      const b = Scene3D[BAKER_KEYS[i]];
      if (b && typeof b.supports === 'function' && b.supports(spec)) return b;
    }
    return null;
  };

  // style: normalized style params ({ markSpace, ... }). ctx: { spec?, mapper?, primitive?, ... exclusion flags }.
  const effectiveMarkSpace = (style, ctx) => {
    const st = style && typeof style === 'object' ? style : {};
    if (st.markSpace !== 'surface') return 'pose';
    const cx = ctx && typeof ctx === 'object' ? ctx : {};
    const spec = cx.spec || Object.assign({}, cx, { style: st });
    const mapper = spec.mapper || cx.mapper || st.mapper;
    for (let i = 0; i < EXCLUSIONS.length; i++) if (EXCLUSIONS[i].test(st, cx, mapper)) return 'pose';
    return bakerFor(spec) ? 'surface' : 'pose';
  };

  // Why a style is (not) surface-locked: effectiveMarkSpace plus the reason, so the panel can say why the control is
  // disabled. reason: 'markSpace' (the style asks for pose), an EXCLUSIONS id, 'no baker', or 'surface' (locked).
  const explainMarkSpace = (style, ctx) => {
    const st = style && typeof style === 'object' ? style : {};
    if (st.markSpace !== 'surface') return { mode: 'pose', reason: 'markSpace' };
    const cx = ctx && typeof ctx === 'object' ? ctx : {};
    const spec = cx.spec || Object.assign({}, cx, { style: st });
    const mapper = spec.mapper || cx.mapper || st.mapper;
    for (let i = 0; i < EXCLUSIONS.length; i++) if (EXCLUSIONS[i].test(st, cx, mapper)) return { mode: 'pose', reason: EXCLUSIONS[i].id };
    return bakerFor(spec) ? { mode: 'surface', reason: 'surface' } : { mode: 'pose', reason: 'no baker' };
  };

  // ── bake key and cache (contract §8) ────────────────────────────────────────────────────────────────────────────
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).sort().forEach((k) => { o[k] = stable(v[k]); }); return o; }
    return v;
  };
  const stableStyle = (style) => {
    const s = Object.assign({}, style || {});
    delete s.markSpace;
    return stable(s);
  };
  // Style keys that only shape tone (no baker reads them): they never change a MarkSet, so the bake key drops them.
  // The tone-table key keeps them (stableStyle).
  const TONE_ONLY_STYLE_KEYS = Object.freeze(['toneGamma', 'toneContrast', 'shadowSensitivity']);
  const TONE_ONLY_STYLE_PREFIXES = Object.freeze(['depthFade', 'highlight']);
  const bakeStyle = (style) => {
    const s = Object.assign({}, style || {});
    Object.keys(s).forEach((k) => {
      if (TONE_ONLY_STYLE_KEYS.indexOf(k) !== -1 || TONE_ONLY_STYLE_PREFIXES.some((pre) => k.indexOf(pre) === 0)) delete s[k];
    });
    delete s.markSpace;
    return stable(s);
  };
  const bakeKey = (spec) => {
    const baker = bakerFor(spec);
    const parts = [BAKE_VERSION, baker ? baker.id : null, spec.primitive, spec.mode, stable(spec.sizes),
      stable(spec.scale), spec.mapper, spec.toneLaw, bakeStyle(spec.style), spec.penWidth, spec.scaleRef, stable(spec.seed)];
    // A16: the tone model is part of the bake (the v2 bakers draw different marks), so a legacy and a v2 spec never share an
    // entry. Appended only for v2, so every legacy key is byte-identical to the one an older build produced.
    if (spec.toneModel === 'v2') parts.push('v2');
    return JSON.stringify(parts);
  };

  const cache = new Map(); // key -> { ms, bytes } ; Map order = LRU order (oldest first)
  let cacheBytes = 0;
  const freshKeys = []; // keys baked here since the last takeFreshBakes (a worker's handoff list; capped)
  let limitOverride = null;
  const cacheLimitBytes = () => {
    if (limitOverride !== null) return limitOverride;
    let mobile = false;
    try { mobile = !!(Scene3D.SpinRing && typeof Scene3D.SpinRing.isMobile === 'function' && Scene3D.SpinRing.isMobile()); } catch (e) { mobile = false; }
    return (mobile ? CACHE_MB_MOBILE : CACHE_MB) * 1048576;
  };
  const setCacheLimitBytes = (n) => { limitOverride = Number.isFinite(n) ? n : null; evictToLimit(null); };
  function evictToLimit(keep) {
    const limit = cacheLimitBytes();
    for (const [k, e] of cache) {
      if (cacheBytes <= limit) break;
      if (k === keep) continue;
      cache.delete(k); cacheBytes -= e.bytes; stats.evictions += 1;
    }
    stats.cacheBytes = cacheBytes; stats.cacheEntries = cache.size;
  }
  const clearCache = () => {
    cache.clear(); cacheBytes = 0; freshKeys.length = 0; toneMemo.clear(); scaleMemo.clear(); auxCaches.forEach((m) => m.clear());
    stats.cacheBytes = 0; stats.cacheEntries = 0;
  };

  const bake = (spec) => {
    stats.bakes += 1;
    const baker = bakerFor(spec);
    if (!baker) return null;
    const key = bakeKey(spec);
    const hit = cache.get(key);
    if (hit) {
      stats.bakeHits += 1;
      cache.delete(key); cache.set(key, hit); // most recently used last
      return hit.ms;
    }
    stats.bakeMisses += 1;
    const t0 = now();
    let ms = null;
    try { ms = baker.bake(spec); } catch (e) { ms = null; stats.bakeErrors += 1; }
    stats.msBake += now() - t0;
    if (!ms) return null;
    ms.key = key; // the cache key is authoritative; a baker's own meta.key is informational
    const MS = Scene3D.SurfaceLockMarkSet;
    const bytes = MS && MS.byteSize ? MS.byteSize(ms) : 0;
    cache.set(key, { ms, bytes }); cacheBytes += bytes;
    if (freshKeys.length < FRESH_MAX) freshKeys.push(key);
    evictToLimit(key);
    return ms;
  };

  // OFF-THREAD BAKE HANDOFF (W2-B2). A worker's compose bakes into the WORKER's cache; the main thread's cache stays cold, so
  // the next Level S frame there would bake again (0.1-0.65 s). The job therefore returns what it baked and the main thread
  // adopts it. A MarkSet is content-addressed (its key is the whole bake input) and its typed arrays are its own buffers
  // (the builder slices them), so adopting is a Map insert. `release` drops the taken entries from THIS cache so a worker
  // can transfer their buffers without leaving detached arrays behind.
  const takeFreshBakes = (opts) => {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < freshKeys.length; i++) {
      const key = freshKeys[i];
      if (seen.has(key)) continue;
      seen.add(key);
      const e = cache.get(key);
      if (e) out.push({ key, ms: e.ms });
    }
    freshKeys.length = 0;
    if (opts && opts.release) {
      out.forEach((e) => { const c = cache.get(e.key); if (c) { cache.delete(e.key); cacheBytes -= c.bytes; } });
      stats.cacheBytes = cacheBytes; stats.cacheEntries = cache.size;
    }
    return out;
  };
  const adopt = (entries) => {
    const MS = Scene3D.SurfaceLockMarkSet;
    let n = 0;
    (entries || []).forEach((e) => {
      if (!e || typeof e.key !== 'string' || !e.ms || !e.ms.positions || cache.has(e.key)) return;
      e.ms.key = e.key;
      const bytes = MS && MS.byteSize ? MS.byteSize(e.ms) : 0;
      cache.set(e.key, { ms: e.ms, bytes }); cacheBytes += bytes; n += 1; stats.adopted += 1;
      evictToLimit(e.key);
    });
    return n;
  };
  // The specs among `specs` that would bake (a baker exists) but are not cached. Read-only: no LRU touch, no stat.
  const missingBakes = (specs) => (specs || []).filter((spec) => spec && bakerFor(spec) && !cache.has(bakeKey(spec)));

  // ── tone table (contract §5, A16) ──────────────────────────────────────────────────────────────────────────────────────
  // The LUT is memoized per baker + tone shape and never depends on the light's position: the v2 model only changes it through
  // `light.model` and "no lights" (tone off), so those two are the light's whole share of the LUT key. The specular scaleFn is a
  // second, cheap memo keyed by the light itself, so a light move rebuilds a closure and never a LUT.
  const toneMemo = new Map();
  const scaleMemo = new Map();
  const lightsEmpty = (light) => !!light && Array.isArray(light.lights) && light.lights.length === 0;
  const lightScaleKey = (light) => JSON.stringify([light.model, stable(light.lights), light.shininess, light.ks, light.s0, light.s1, light.shadowKey === undefined ? null : light.shadowKey]);

  // The view-dependent glint multiplier (A16): scaleFn(n_w, p_w, e_w) = Regions.specularKeep(S, s0, s1), where S is the Blinn-Phong
  // term Regions.shade computes (the unit test pins the two equal). Directional lights are inlined (one dot product and a pow per
  // visible vertex per frame); any other type goes through Regions.shade. `light.shadowFnFor(n_w)` (optional) blocks the glint
  // inside a cast shadow, exactly as shade does; it is asked only where the glint is not already negligible.
  const buildScaleFn = (light) => {
    const R = Scene3D.Regions;
    if (!light || light.model !== 'v2' || !R || typeof R.specularKeep !== 'function' || typeof R.shade !== 'function') return null;
    const D = R.SHADE_DEFAULTS || {};
    const ks = num(light.ks, num(D.ks, 1));
    if (!(ks > 0)) return null;
    const s0 = num(light.s0, num(D.s0, 0.55)); const s1 = num(light.s1, num(D.s1, 0.9));
    const sh = Math.max(1, num(light.shininess, typeof R.shininessForSize === 'function' ? R.shininessForSize(num(D.size, 1)) : 5));
    const direct = (Array.isArray(light.lights) ? light.lights : []).filter((l) => l && l.type !== 'ambient');
    if (!direct.length) return null;
    const dirs = []; const others = [];
    direct.forEach((l) => {
      if (!l.type || l.type === 'directional') {
        const t = R.towardLight(l);
        dirs.push({ l, x: t.x, y: t.y, z: t.z, w: Math.min(1, Math.max(0, num(l.intensity, 1))) * ks });
      } else others.push(l);
    });
    const shadowFnFor = typeof light.shadowFnFor === 'function' ? light.shadowFnFor : null;
    return (n, p, e) => {
      let nx = n.x; let ny = n.y; let nz = n.z;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      let ex = e.x; let ey = e.y; let ez = e.z;
      const el = Math.sqrt(ex * ex + ey * ey + ez * ez) || 1; ex /= el; ey /= el; ez /= el;
      let S = 0; let blocked;
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i];
        if (nx * d.x + ny * d.y + nz * d.z <= 0) continue;
        const hx = d.x + ex; const hy = d.y + ey; const hz = d.z + ez;
        const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        const nh = (nx * hx + ny * hy + nz * hz) / hl;
        if (nh <= 0) continue;
        const s = d.w * Math.pow(nh, sh);
        if (s <= S || s <= s0) continue; // below s0 the keep is 1 whatever the shadow says
        if (shadowFnFor) { if (blocked === undefined) blocked = shadowFnFor(n); if (blocked(p, d.l)) continue; }
        S = s;
      }
      if (others.length) {
        const r = R.shade(n, p, others, { model: 'v2', eye: e, shininess: sh, ks, shadowFn: shadowFnFor ? shadowFnFor(n) : null });
        if (r.S > S) S = r.S;
      }
      return S <= s0 ? 1 : R.specularKeep(Math.min(1, S), s0, s1);
    };
  };

  const toneTable = (spec, toneCtx) => {
    const baker = bakerFor(spec);
    if (!baker) return null;
    const light = toneCtx && toneCtx.light ? toneCtx.light : null;
    const keyCtx = light ? Object.assign({}, toneCtx, { light: { model: light.model, empty: lightsEmpty(light) } }) : toneCtx;
    const key = JSON.stringify([baker.id, stable(keyCtx), stableStyle(spec.style), spec.penWidth, spec.toneLaw, spec.mapper]);
    let t = toneMemo.get(key);
    if (!t) {
      t = baker.toneLUT(spec, toneCtx);
      if (toneMemo.size >= TONE_MEMO_MAX) toneMemo.delete(toneMemo.keys().next().value);
      toneMemo.set(key, t);
    }
    // A16: v2 only, and only when the baker did not bring its own scaleFn; `noHighlight` (highlight treatment 'none') keeps the ink.
    if (!t || !light || light.model !== 'v2' || t.scaleFn || (toneCtx && toneCtx.noHighlight)) return t;
    const skey = key + '|' + lightScaleKey(light);
    let t2 = scaleMemo.get(skey);
    if (!t2) {
      t2 = Object.assign({}, t, { scaleFn: buildScaleFn(light) });
      if (scaleMemo.size >= TONE_MEMO_MAX * 2) scaleMemo.delete(scaleMemo.keys().next().value);
      scaleMemo.set(skey, t2);
    }
    return t2;
  };

  // ── pose (contract §4) ──────────────────────────────────────────────────────────────────────────────────────────
  const rotMatrix = (angles) => {
    const rot = Vectura.Geometry3D.makeRotator(angles);
    const ex = rot({ x: 1, y: 0, z: 0 }); const ey = rot({ x: 0, y: 1, z: 0 }); const ez = rot({ x: 0, y: 0, z: 1 });
    return [ex.x, ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z]; // row-major
  };
  const mul3 = (A, B) => {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return o;
  };

  const poseOf = (transform, camera, bounds) => {
    const t = transform || {}; const cam = camera || {}; const b = bounds || {};
    const opts = Scene3D.Scene.buildProjOpts(cam, { width: b.width, height: b.height });
    const persp = Number.isFinite(opts.focal) && opts.focal > 0;
    return {
      cam: {
        yaw: num(cam.yaw, 0), pitch: num(cam.pitch, 0), roll: num(cam.roll, 0),
        scale: opts.scale, cx: opts.centerX, cy: opts.centerY,
        persp, focal: persp ? opts.focal : 0, dist: persp ? num(opts.cameraDist, 0) : 0,
      },
      obj: { x: num(t.x, 0), y: num(t.y, 0), z: num(t.z, 0), yaw: num(t.yaw, 0), pitch: num(t.pitch, 0), roll: num(t.roll, 0) },
    };
  };

  // ── frame (contract §5-§6) ──────────────────────────────────────────────────────────────────────────────────────
  // Decoded unit normals per MarkSet: derived data, computed once (the octahedral decode is the costly part of a visit).
  const normalCache = new WeakMap();
  const decodedNormals = (ms) => {
    let d = normalCache.get(ms);
    if (d && d.length === 3 * ms.vertexCount) return d;
    const nv = ms.vertexCount; const o = ms.normals; const OCT = CFG.OCT_SCALE || 32767;
    d = new Float32Array(3 * nv);
    for (let v = 0; v < nv; v++) {
      const u = o[2 * v] / OCT; const w = o[2 * v + 1] / OCT;
      let z = 1 - Math.abs(u) - Math.abs(w); let x = u; let y = w;
      if (z < 0) { x = (1 - Math.abs(w)) * (u < 0 ? -1 : 1); y = (1 - Math.abs(u)) * (w < 0 ? -1 : 1); }
      const L = Math.sqrt(x * x + y * y + z * z) || 1;
      d[3 * v] = x / L; d[3 * v + 1] = y / L; d[3 * v + 2] = z / L;
    }
    normalCache.set(ms, d);
    return d;
  };

  // Tone memo (contract §11): per MarkSet, the clamped light intensity per vertex, valid for one view.toneKey. The intensity
  // is a function of world position and normal only, so it survives camera moves; NaN = not evaluated yet.
  const toneMemoI = new WeakMap();
  const memoFor = (ms, key) => {
    let m = toneMemoI.get(ms);
    if (!m || m.key !== key || m.I.length !== ms.vertexCount) {
      m = { key, I: new Float64Array(ms.vertexCount).fill(NaN) };
      toneMemoI.set(ms, m);
    }
    return m.I;
  };

  // Per-vertex scratch, grown on demand and shared (a frame is synchronous; the worker has its own copy).
  let SX = new Float64Array(0); let SY = SX; let SZ = SX; let SC = SX; let STE = SX; let SNR = SX; let SCAP = SX;
  const ensureScratch = (n) => {
    if (SX.length >= n) return;
    const m = Math.max(n, 1024, SX.length * 2);
    SX = new Float64Array(m); SY = new Float64Array(m); SZ = new Float64Array(m);
    SC = new Float64Array(m); STE = new Float64Array(m); SNR = new Float64Array(m); SCAP = new Float64Array(m);
  };

  const nW = { x: 0, y: 0, z: 0 }; const pW = { x: 0, y: 0, z: 0 }; const eW = { x: 0, y: 0, z: 0 };
  const mkPt = (x, y, z) => ({ x, y, z });
  const lineLength = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return s; };

  // Pre-pass: per vertex camera-space position -> screen, facing cosine, tone demand t_eff (contract §5).
  const prepass = (ms, F, view) => {
    const nv = ms.vertexCount; const pos = ms.positions; const nrm = decodedNormals(ms);
    const meta = ms.meta || {};
    const p0 = meta.p0; const gain = meta.gain || 2;
    const q = gain === 2 ? 1 : (gain === 4 ? 2 : Math.log2(gain));
    const lut = view.tone && view.tone.lut; const scaleFn = (view.tone && !view.specOff) ? view.tone.scaleFn : null;
    const toneFn = typeof view.toneFn === 'function' ? view.toneFn : null;
    let floorPitch = Number.isFinite(view.floorPitch) ? view.floorPitch : 0;
    // A law may declare its own floor (pen multiples) and the minimum separation its bake guarantees (fraction of nominal pitch).
    if (Number.isFinite(meta.floorPitchPen) && meta.floorPitchPen > 0) floorPitch = meta.floorPitchPen * num(view.penWidth, 0);
    const minSep = Number.isFinite(meta.minSepFrac) && meta.minSepFrac > 0 ? meta.minSepFrac : 1;
    const remap = meta.capToneRemap === true && !!lut;
    // capKey 'ruling' (contract A13): the cap is compared against each run's own capRank, not folded into the tone demand.
    const capSep = meta.capKey === 'ruling' && !!ms.runCapRank;
    // A fixed-pitch law (contract §16 A10) reads its tone at the bake scale, so a zoom inside one octave never moves it.
    const toneScaleFree = meta.toneScaleFree === true && Number.isFinite(meta.scaleRef) && meta.scaleRef > 0;
    // A17: tone model v2 equalises the ink per SCREEN area: a surface-pitch mark set puts 1/facing more ink into a foreshortened
    // patch, so the tone demand is scaled by g(c) = 1 + strength * (2c / (1 + c) - 1) (the mean foreshortening of a mark of any
    // direction in the tangent plane is (1 + c) / 2). Off (strength 0) unless the caller says view.toneModel === 'v2'.
    const facingComp = view.toneModel === 'v2' ? FACING_COMP : 0;
    const remapLuts = new Map();
    const memoI = (toneFn && typeof view.toneKey === 'string') ? memoFor(ms, view.toneKey) : null;
    const { A, objR, camR, tx, ty, tz, ox, oy, oz, persp, focal, scale, cxs, cys, eyeZ, nearD } = F;
    const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = A;
    const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = objR;
    for (let v = 0; v < nv; v++) {
      const px = pos[3 * v]; const py = pos[3 * v + 1]; const pz = pos[3 * v + 2];
      const nx = nrm[3 * v]; const ny = nrm[3 * v + 1]; const nz = nrm[3 * v + 2];
      const cx = a00 * px + a01 * py + a02 * pz + tx;
      const cy = a10 * px + a11 * py + a12 * pz + ty;
      const cz = a20 * px + a21 * py + a22 * pz + tz;
      let sv = scale; let facing; let valid = 1;
      if (persp) {
        const denom = eyeZ - cz;
        SNR[v] = denom - nearD;
        if (denom <= nearD) valid = 0;
        sv = focal / (denom > nearD ? denom : nearD) * scale;
        const ncx = a00 * nx + a01 * ny + a02 * nz; const ncy = a10 * nx + a11 * ny + a12 * nz; const ncz = a20 * nx + a21 * ny + a22 * nz;
        const wx = -cx; const wy = -cy; const wz = eyeZ - cz;
        const wl = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
        facing = (ncx * wx + ncy * wy + ncz * wz) / wl;
      } else {
        facing = a20 * nx + a21 * ny + a22 * nz;
      }
      SX[v] = cxs + cx * sv; SY[v] = cys - cy * sv; SZ[v] = cz; SC[v] = facing;
      if (!valid || facing <= 0) { STE[v] = 0; SCAP[v] = 0; continue; }
      let capT = 0; const hasCap = floorPitch > 0;
      if (hasCap) {
        // Plot-floor cap, quantised to whole density steps (powers of `gain`): a PARTIAL level can leave two of its marks
        // one level-pitch apart, below the floor, so the cap only ever admits complete levels, each once its pitch is >= FLOOR_SLACK x floor (or a regular 1/gain^m
        // thinning of level 0 below the base pitch). The drawn subset then never falls under the floor.
        const cr = p0 * sv * facing * minSep / (floorPitch * FLOOR_SLACK);
        const T0 = q === 1 ? cr : (q === 2 ? cr * cr : Math.pow(cr, q));
        let T = 0;
        if (T0 > 1e-6) { // largest power of `gain` <= T0, by stepping (a handful of multiplies; log/pow per vertex cost ~15 ms at 60k)
          T = 1;
          if (T0 >= 1) { while (T * gain <= T0) T *= gain; } else { while (T > T0) T /= gain; }
        }
        capT = T;
      }
      SCAP[v] = hasCap ? capT : Infinity;
      // tone
      let te = Infinity;
      if (lut) {
        let I = 1;
        if (toneFn) {
          const cached = memoI ? memoI[v] : NaN;
          if (cached === cached) { // memo hit; the world frame is only rebuilt when scaleFn needs it
            I = cached;
            if (scaleFn) {
              pW.x = r00 * px + r01 * py + r02 * pz + ox; pW.y = r10 * px + r11 * py + r12 * pz + oy; pW.z = r20 * px + r21 * py + r22 * pz + oz;
              nW.x = r00 * nx + r01 * ny + r02 * nz; nW.y = r10 * nx + r11 * ny + r12 * nz; nW.z = r20 * nx + r21 * ny + r22 * nz;
            }
          } else {
            pW.x = r00 * px + r01 * py + r02 * pz + ox; pW.y = r10 * px + r11 * py + r12 * pz + oy; pW.z = r20 * px + r21 * py + r22 * pz + oz;
            nW.x = r00 * nx + r01 * ny + r02 * nz; nW.y = r10 * nx + r11 * ny + r12 * nz; nW.z = r20 * nx + r21 * ny + r22 * nz;
            I = toneFn(nW, pW);
            I = I > 0 ? (I < 1 ? I : 1) : 0;
            stats.toneEvals += 1;
            if (memoI) memoI[v] = I;
          }
        }
        const f = I * LUT_N; let k0 = f | 0; if (k0 >= LUT_N) k0 = LUT_N - 1;
        const l = lut[k0] + (f - k0) * (lut[k0 + 1] - lut[k0]);
        let dm = p0 * (toneScaleFree ? meta.scaleRef : sv) * l;
        if (remap && capT > 0) { // cap-aware tone remap (contract §5): squeeze [m, D] into [m, T] in log space so tone stays monotone inside a cap ring
          const mD = p0 * sv * lut[LUT_N]; const dD = p0 * sv * lut[0]; const tD = q === 1 ? capT : (q === 2 ? Math.sqrt(capT) : Math.pow(capT, 1 / q));
          if (!(mD > 0) && dD > 0 && tD > 0 && tD < dD) {
            // A18: a paper-ended v2 LUT (lut[LUT_N] == 0) has no log-space floor to squeeze toward, so the whole range is scaled by
            // tD / dD instead: the darkest tone lands on the cap, lighter tones keep their order, and paper stays paper.
            dm *= tD / dD;
          } else if (mD > 0 && tD > mD && tD < dD) {
            if (!persp) {
              let rl = remapLuts.get(capT);
              if (!rl) {
                const kk = Math.log(tD / mD) / Math.log(dD / mD);
                rl = new Float32Array(LUT_N + 1);
                for (let j = 0; j <= LUT_N; j++) { const dj = p0 * sv * lut[j]; rl[j] = dj > 0 ? mD * Math.pow(dj / mD, kk) : 0; }
                remapLuts.set(capT, rl);
              }
              dm = rl[k0] + (f - k0) * (rl[k0 + 1] - rl[k0]);
            } else if (dm > 0) {
              stats.toneRemapPow += 1;
              dm = mD * Math.pow(dm / mD, Math.log(tD / mD) / Math.log(dD / mD));
            }
          }
        }
        if (scaleFn && toneFn && dm > 0) {
          if (persp) {
            const wx = -cx; const wy = -cy; const wz = eyeZ - cz; const wl = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
            const ex = wx / wl; const ey = wy / wl; const ez = wz / wl;
            eW.x = camR[0] * ex + camR[3] * ey + camR[6] * ez; eW.y = camR[1] * ex + camR[4] * ey + camR[7] * ez; eW.z = camR[2] * ex + camR[5] * ey + camR[8] * ez;
          } else { eW.x = camR[6]; eW.y = camR[7]; eW.z = camR[8]; }
          const sc = scaleFn(nW, pW, eW);
          if (sc !== null && sc !== undefined) dm *= (sc > 0 ? (sc < 1 ? sc : 1) : 0);
        }
        te = q === 1 ? dm : (q === 2 ? dm * dm : Math.pow(dm, q));
        if (facingComp > 0) te *= 1 + facingComp * (2 * facing / (1 + facing) - 1);
      }
      if (hasCap && capT < te && !capSep) te = capT;
      STE[v] = te;
    }
    return undefined;
  };

  const frameSet = (ms, F, view, out, acc) => {
    const MS = Scene3D.SurfaceLockMarkSet;
    prepass(ms, F, view);
    const meta = ms.meta || {};
    const gain = meta.gain || 2;
    const minMark = num(meta.minMarkMM, 0);
    const glyph = meta.glyph || null;
    const join = meta.joinTouching === true; // A11
    let tail = null; let tailRun = -2;
    const persp = F.persp;
    const nr = ms.runCount; const rs = ms.runStart; const rl = ms.runLevel; const rr = ms.runRank; const rf = ms.runFlags;
    const capSep = meta.capKey === 'ruling' && !!ms.runCapRank; const rcap = capSep ? ms.runCapRank : null;
    const DOT = MS.FLAG.DOT; const CLOSED = MS.FLAG.CLOSED; const RS = MS.RANK_SCALE;
    for (let r = 0; r < nr; r++) {
      const v0 = rs[r]; const n = rs[r + 1] - v0; const flags = rf[r]; const L = rl[r];
      const rank = rr[r] / RS;
      const k = L === 0 ? rank : Math.pow(gain, L - 1) * (1 + (gain - 1) * rank);
      const ck = capSep ? rcap[r] / RS : 0;
      acc.runsIn += 1; acc.verticesIn += n;
      // vertex counters
      let anyOk = false;
      for (let i = v0; i < v0 + n; i++) {
        const c = SC[i];
        if ((persp && SNR[i] <= 0) || c <= 0) acc.culledFacing += 1;
        else if (c < NZ_CULL) acc.culledGrazing += 1;
        else if (!(STE[i] > k) || (capSep && !(SCAP[i] > ck))) acc.culledTone += 1;
        else anyOk = true;
      }
      if (flags & DOT) {
        if (!anyOk) continue;
        const segs = glyph && glyph.segs >= 4 ? glyph.segs : 8; const gr = glyph ? glyph.r : 0;
        const ring = [];
        for (let s = 0; s <= segs; s++) {
          const a = (s % segs) * 2 * Math.PI / segs;
          ring.push(mkPt(SX[v0] + gr * Math.cos(a), SY[v0] + gr * Math.sin(a), SZ[v0]));
        }
        ring.back = false; out.push(ring); acc.runsOut += 1; acc.verticesOut += ring.length;
        continue;
      }
      let nEff = n; const closed = (flags & CLOSED) !== 0;
      if (closed && n >= 3) {
        const a = 3 * v0; const b = 3 * (v0 + n - 1); const P = ms.positions;
        if (P[a] === P[b] && P[a + 1] === P[b + 1] && P[a + 2] === P[b + 2]) nEff = n - 1;
      }
      const nSeg = closed ? nEff : nEff - 1;
      const subs = []; let cur = null; let firstFromV0 = false;
      for (let s = 0; s < nSeg; s++) {
        const i = v0 + s; const j = (closed && s === nEff - 1) ? v0 : i + 1;
        let lo = 0; let hi = 1;
        // facing / grazing
        const d0 = SC[i] - NZ_CULL; const d1 = SC[j] - NZ_CULL;
        const c0 = d0 >= 0; const c1 = d1 >= 0;
        if (!c0 && !c1) { if (cur) { subs.push(cur); cur = null; } continue; }
        if (c0 !== c1) { const u = d0 / (d0 - d1); if (c0) { if (u < hi) hi = u; } else if (u > lo) lo = u; }
        // tone
        const e0 = STE[i] - k; const e1 = STE[j] - k;
        const t0ok = e0 > 0; const t1ok = e1 > 0;
        if (!t0ok && !t1ok) { if (cur) { subs.push(cur); cur = null; } continue; }
        if (t0ok !== t1ok) { const u = e0 / (e0 - e1); if (t0ok) { if (u < hi) hi = u; } else if (u > lo) lo = u; }
        // plot-floor cap on the ruling's rank (capKey 'ruling'): a second linear clip, intersected with the tone clip
        if (capSep) {
          const g0 = SCAP[i] - ck; const g1 = SCAP[j] - ck;
          const q0 = g0 > 0; const q1 = g1 > 0;
          if (!q0 && !q1) { if (cur) { subs.push(cur); cur = null; } continue; }
          if (q0 !== q1) { const u = g0 / (g0 - g1); if (q0) { if (u < hi) hi = u; } else if (u > lo) lo = u; }
        }
        // near plane (perspective)
        if (persp) {
          const n0 = SNR[i]; const n1 = SNR[j];
          const o0 = n0 > 0; const o1 = n1 > 0;
          if (!o0 && !o1) { if (cur) { subs.push(cur); cur = null; } continue; }
          if (o0 !== o1) { const u = n0 / (n0 - n1); if (o0) { if (u < hi) hi = u; } else if (u > lo) lo = u; }
        }
        if (lo > hi) { if (cur) { subs.push(cur); cur = null; } continue; }
        if (!cur) {
          cur = [];
          if (s === 0 && lo === 0) firstFromV0 = true;
          cur.push(lo === 0 ? mkPt(SX[i], SY[i], SZ[i]) : mkPt(SX[i] + lo * (SX[j] - SX[i]), SY[i] + lo * (SY[j] - SY[i]), SZ[i] + lo * (SZ[j] - SZ[i])));
        }
        cur.push(hi === 1 ? mkPt(SX[j], SY[j], SZ[j]) : mkPt(SX[i] + hi * (SX[j] - SX[i]), SY[i] + hi * (SY[j] - SY[i]), SZ[i] + hi * (SZ[j] - SZ[i])));
        if (hi < 1) { subs.push(cur); cur = null; }
      }
      if (cur) {
        if (closed && subs.length && firstFromV0) subs[0] = cur.concat(subs[0].slice(1)); // the loop's seam was inside a drawn stretch
        else subs.push(cur);
      }
      for (let s = 0; s < subs.length; s++) {
        const line = subs[s];
        if (line.length < 2) continue;
        if (join && s === 0 && tail && tailRun === r - 1 && Math.abs(tail[tail.length - 1].x - line[0].x) < 1e-4
          && Math.abs(tail[tail.length - 1].y - line[0].y) < 1e-4 && Math.abs(tail[tail.length - 1].z - line[0].z) < 1e-4) {
          for (let q = 1; q < line.length; q++) tail.push(line[q]);
          acc.verticesOut += line.length - 1; tailRun = r;
          if (subs.length > 1) tail = null;
          continue;
        }
        if (minMark > 0 && lineLength(line) < minMark) continue;
        line.back = false; out.push(line); acc.runsOut += 1; acc.verticesOut += line.length;
        if (join) { tail = (s === subs.length - 1) ? line : null; tailRun = r; }
      }
    }
  };

  const frameSetup = (pose) => {
    const camR = rotMatrix({ yaw: pose.cam.yaw, pitch: pose.cam.pitch, roll: pose.cam.roll });
    const objR = rotMatrix({ yaw: pose.obj.yaw, pitch: pose.obj.pitch, roll: pose.obj.roll });
    const A = mul3(camR, objR);
    const o = pose.obj; const c = pose.cam;
    return {
      A, objR, camR,
      tx: camR[0] * o.x + camR[1] * o.y + camR[2] * o.z,
      ty: camR[3] * o.x + camR[4] * o.y + camR[5] * o.z,
      tz: camR[6] * o.x + camR[7] * o.y + camR[8] * o.z,
      ox: o.x, oy: o.y, oz: o.z,
      persp: !!c.persp, focal: c.focal || 0, scale: c.scale, cxs: c.cx, cys: c.cy,
      eyeZ: (c.focal || 0) + (c.dist || 0), nearD: NEAR_FRAC * (c.focal || 0),
    };
  };

  const floorPenOf = () => {
    const R = Scene3D.Regions;
    return (R && Number.isFinite(R.PLOT_FLOOR_PEN)) ? R.PLOT_FLOOR_PEN : FALLBACK_FLOOR_PEN;
  };

  const frame = (markSets, pose, view) => {
    const t0 = now();
    const sets = Array.isArray(markSets) ? markSets : [markSets];
    const v = Object.assign({}, view || {});
    v.floorPitch = floorPenOf() * num(v.penWidth, 0);
    v.penWidth = num(v.penWidth, 0);
    const F = frameSetup(pose);
    let total = 0; sets.forEach((ms) => { if (ms) total = Math.max(total, ms.vertexCount || 0); });
    ensureScratch(total);
    const out = [];
    const acc = { runsIn: 0, verticesIn: 0, runsOut: 0, verticesOut: 0, culledFacing: 0, culledGrazing: 0, culledTone: 0 };
    for (let s = 0; s < sets.length; s++) if (sets[s] && sets[s].vertexCount) frameSet(sets[s], F, v, out, acc);
    stats.frames += 1;
    stats.runsIn += acc.runsIn; stats.verticesIn += acc.verticesIn; stats.runsOut += acc.runsOut; stats.verticesOut += acc.verticesOut;
    stats.culledFacing += acc.culledFacing; stats.culledGrazing += acc.culledGrazing; stats.culledTone += acc.culledTone;
    const dt = now() - t0;
    stats.msFrame += dt; stats.msFrameLast = dt;
    return out;
  };

  // ── Level S gate (contract §13): data, grows only with tests ────────────────────────────────────────────────────
  const isMapperNoFill = (m) => !m || m === 'none' || m === 'wireframe';
  const objectStyleOf = (p, id) => {
    const t = p.styleTable || {};
    return (t.byObject && t.byObject[id]) || t.scene || { mapper: 'none', params: {} };
  };
  // A16: the scene's tone model. Only a scene saying 'v2' is v2; a spec of a legacy scene carries no toneModel at all (so its bake
  // key, its tone-table key and every baker path are those of an older build).
  const toneModelOf = (p) => (p && p.tone && p.tone.model === 'v2' ? 'v2' : 'legacy');
  // `ctx.specFor` may return a whole spec of its own (the compositor's); the model is the scene's whatever it says.
  const withToneModel = (p, spec) => { if (toneModelOf(p) === 'v2') spec.toneModel = 'v2'; return spec; };
  const specOfObject = (p, obj, bounds, seed) => {
    const st = objectStyleOf(p, obj.id);
    const sp = st.params || {};
    const P = Scene3D.Params;
    const tr = obj.transform || {};
    const s = num(tr.scale, 1);
    return {
      objectId: obj.id, primitive: obj.primitive, mode: undefined, sizes: obj.params, detail: undefined,
      scale: { sx: num(tr.sx, s), sy: num(tr.sy, s), sz: num(tr.sz, s) },
      mapper: st.mapper, toneLaw: P && P.resolveToneLaw ? P.resolveToneLaw(sp) : sp.toneLaw,
      style: sp, penWidth: num(bounds && bounds.penWidth, 0), scaleRef: 1, seed: seed || null,
      ...(toneModelOf(p) === 'v2' ? { toneModel: 'v2' } : {}),
    };
  };
  const receiveMapAvailable = () => {
    const Sh = Scene3D.SurfaceLockShadow; const SR = Scene3D.ShadowReceive;
    return !!Sh && typeof Sh.receiveMap === 'function' && !!SR && typeof SR.buildDepthMap === 'function';
  };
  const exclusionCtx = (p, obj) => ({
    visibility: obj.visibility,
    emissiveCoreBlank: !!(obj.emissive && obj.emissive.enabled && obj.emissive.coreBlank),
    areaLight: (p.lights || []).some((l) => l && l.type === 'area'),
    // The pose path builds its shadow-receive occluder from this flag. A16: lifted for a v2 scene when the light-space receive map
    // exists (the tone memo then takes the shadow from it); a legacy scene keeps the exclusion, so its look is the pose look.
    receiveShadow: !!(p.shadow && p.shadow.shadowReceiveOnObjects) && !(toneModelOf(p) === 'v2' && receiveMapAvailable()),
  });
  const FRAMEABLE = Object.freeze([
    { id: 'hasObjects', test: (p) => Array.isArray(p.objects) && p.objects.length > 0 },
    { id: 'noBooleans', test: (p) => !(p.groups && (Array.isArray(p.groups) ? p.groups.length : Object.keys(p.groups).length)) },
    { id: 'noBackdrop', test: (p) => !(p.backdrop && p.backdrop.enabled) },
    { id: 'lights', test: (p) => (p.lights || []).every((l) => l && (l.type === 'directional' || l.type === 'ambient')) },
    { id: 'noBorderEmissiveXray', test: (p) => p.objects.every((o) => !(o.border && o.border.enabled) && !(o.emissive && o.emissive.enabled) && o.visibility !== 'xray') },
    {
      id: 'edgesDropHidden',
      test: (p) => {
        const dashes = (h) => !!(h && h.hiddenTreatment && h.hiddenTreatment !== 'drop');
        if (p.edgeStyles && dashes(p.edgeStyles.hidden)) return false;
        const by = p.edgeStylesByObject;
        return !(by && typeof by === 'object' && Object.keys(by).some((id) => by[id] && dashes(by[id].hidden)));
      },
    },
    { id: 'noFaceStyles', test: (p) => !(p.styleTable && p.styleTable.byFace && Object.keys(p.styleTable.byFace).length) },
    { id: 'visibilitySupports', test: (p) => { const V = Scene3D.SurfaceLockVisibility; return !!V && typeof V.supports === 'function' && p.objects.every((o) => V.supports(o)); } },
    {
      id: 'fillsLocked',
      test: (p, bounds) => p.objects.every((o) => {
        const st = objectStyleOf(p, o.id);
        if (st.mapper === 'wireframe') return false; // the mesh edges are not framed
        if (isMapperNoFill(st.mapper)) return true;
        if (st.mapper === 'contourSlice') return false;
        const spec = specOfObject(p, o, bounds, null);
        return effectiveMarkSpace(st.params, Object.assign(exclusionCtx(p, o), { spec, mapper: st.mapper })) === 'surface';
      }),
    },
    // The ground plate draws its outline only: a fill style on the scene (which the ground inherits) is a pose look.
    {
      id: 'groundNoFill',
      test: (p) => {
        if (!p.ground || p.ground.enabled === false) return true;
        const m = objectStyleOf(p, 'ground').mapper;
        return !m || m === 'none' || m === 'wireframe';
      },
    },
    // A scene with no surface-locked fill stays pose, byte-identical (its outlines and shadow are the pose path's).
    { id: 'hasLockedFill', test: (p) => p.objects.some((o) => !isMapperNoFill(objectStyleOf(p, o.id).mapper)) },
    {
      id: 'shadow',
      test: (p) => {
        const lights = p.lights || [];
        const suns = lights.filter((l) => l && l.type === 'directional' && l.castShadows !== false);
        const casts = suns.length > 0 && p.ground && p.ground.enabled !== false;
        if (!casts) return true;
        const S = Scene3D.SurfaceLockShadow;
        // Every casting sun is framed (pose casts one footprint per sun), so every one must be supported.
        return !!S && typeof S.supports === 'function' && suns.every((light) => S.supports({ shadow: p.shadow, light, lights, ground: p.ground, casters: p.objects }));
      },
    },
  ]);
  const frameable = (p, bounds) => {
    if (!p || typeof p !== 'object') return false;
    for (let i = 0; i < FRAMEABLE.length; i++) if (!FRAMEABLE[i].test(p, bounds || {})) return false;
    return true;
  };

  // ── sceneFrame (contract §6.2, §13) ─────────────────────────────────────────────────────────────────────────────
  const auxCaches = [new Map(), new Map(), new Map()]; // 0: mesh bakes, 1: ground hatch bakes, 2: receive-caster world triangles
  const auxGet = (which, key, make) => {
    const m = auxCaches[which];
    if (m.has(key)) { const v = m.get(key); m.delete(key); m.set(key, v); return v; }
    const v = make();
    if (m.size >= AUX_CACHE_MAX) m.delete(m.keys().next().value);
    m.set(key, v);
    return v;
  };

  // World-space caster record for the shadow module (contract §10): a uniform-scale sphere is analytic, anything else a hull.
  const casterOf = (o, mesh, pose) => {
    const t = o.transform || {};
    const sc = mesh && mesh.scale ? mesh.scale : [1, 1, 1];
    const tr = { x: num(t.x, 0), y: num(t.y, 0), z: num(t.z, 0) };
    const uniform = Math.abs(sc[0] - sc[1]) < 1e-9 && Math.abs(sc[1] - sc[2]) < 1e-9;
    if (o.primitive === 'sphere' && uniform && mesh && mesh.analytic && mesh.analytic.radii) {
      return { primitive: o.primitive, shape: 'sphere', center: tr, radius: mesh.analytic.radii[0] };
    }
    const R = rotMatrix({ yaw: pose.obj.yaw, pitch: pose.obj.pitch, roll: pose.obj.roll });
    const V = mesh && mesh.vertices ? mesh.vertices : [];
    const points = [];
    for (let i = 0; i + 2 < V.length; i += 3) {
      points.push({
        x: R[0] * V[i] + R[1] * V[i + 1] + R[2] * V[i + 2] + tr.x,
        y: R[3] * V[i] + R[4] * V[i + 1] + R[5] * V[i + 2] + tr.y,
        z: R[6] * V[i] + R[7] * V[i + 1] + R[8] * V[i + 2] + tr.z,
      });
    }
    return { primitive: o.primitive, shape: 'hull', points };
  };

  // The projected, closed ground outline, cut exactly as the pose ground record is (Scene.buildGroundRecord): the
  // perspective near plane, and an enlarged plate (> 1x) to the artboard plus a 25 % pad. Null when nothing is visible.
  // (buildGroundRecord is private to scene.js and a full assembleScene is what Level S exists to avoid; the cut is the
  // same Sutherland-Hodgman against linear camera-space planes, and the ground-parity test pins it to the pose outline.)
  const groundRing = (ground, camera, bounds) => {
    const G3 = Vectura.Geometry3D;
    const g = ground || {}; const cam = camera || {}; const b = bounds || {};
    const width = num(b.width, 200); const height = num(b.height, 200);
    const o = Scene3D.Scene.buildProjOpts(cam, { width, height });
    const ang = { yaw: num(cam.yaw, 0), pitch: num(cam.pitch, 0), roll: num(cam.roll, 0) };
    const persp = Number.isFinite(o.focal) && o.focal > 0;
    const focal = persp ? o.focal : 0; const camDist = persp ? num(o.cameraDist, 0) : 0;
    const span = Math.max(width, height) * 0.75;
    const hx = span * Math.max(0, num(g.scaleX, 1)); const hz = span * Math.max(0, num(g.scaleZ, 1));
    let verts = [{ x: -hx, y: 0, z: hz }, { x: hx, y: 0, z: hz }, { x: hx, y: 0, z: -hz }, { x: -hx, y: 0, z: -hz }];
    const clip = (vs, keep) => {
      const vals = vs.map((pt) => keep(G3.rotatePoint(pt, ang)));
      if (vals.every((d) => d >= 0)) return vs;
      const out = [];
      vs.forEach((a, i) => {
        const j = (i + 1) % vs.length; const da = vals[i]; const db = vals[j];
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push({ x: a.x + (vs[j].x - a.x) * t, y: a.y + (vs[j].y - a.y) * t, z: a.z + (vs[j].z - a.z) * t }); }
      });
      return out;
    };
    if (persp) {
      const zMax = focal + camDist - focal * 0.1;
      verts = clip(verts, (c) => zMax - c.z);
      if (verts.length < 3) return null;
    }
    if (Math.max(num(g.scaleX, 1), num(g.scaleZ, 1)) > 1) {
      const pad = Math.max(width, height) * 0.25;
      const x0 = -pad; const x1 = width + pad; const y0 = -pad; const y1 = height + pad;
      const cx = num(o.centerX, width / 2); const cy = num(o.centerY, height / 2);
      const scale = num(o.scale, 1); const k = persp ? focal * scale : scale;
      const den = persp ? (c) => focal + camDist - c.z : () => 1;
      const planes = [
        (c) => (cx - x0) * den(c) + k * c.x, (c) => (x1 - cx) * den(c) - k * c.x,
        (c) => (cy - y0) * den(c) - k * c.y, (c) => (y1 - cy) * den(c) + k * c.y,
      ];
      for (let i = 0; i < planes.length && verts.length >= 3; i += 1) verts = clip(verts, planes[i]);
      if (verts.length < 3) return null;
    }
    const pr = verts.map((v) => G3.projectPoint(G3.rotatePoint(v, ang), o));
    if (!pr.every((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y))) return null;
    return pr.concat([pr[0]]).map((q) => ({ x: q.x, y: q.y, z: q.z }));
  };

  // The BakeSpec of every filled object, built exactly as sceneFrame builds it (so the keys are the frame's keys).
  const sceneBakeSpecs = (p, bounds, ctx) => {
    const Vis = Scene3D.SurfaceLockVisibility;
    const penWidth = num(bounds && bounds.penWidth, 0);
    const seedOf = (id) => (typeof ctx.seedFor === 'function' ? ctx.seedFor(id) : null) || { salt: 0, phase: 0, off: false };
    const specs = [];
    (p.objects || []).forEach((o) => {
      const st = objectStyleOf(p, o.id);
      if (isMapperNoFill(st.mapper)) return;
      const mesh = auxGet(0, JSON.stringify([o.id, o.primitive, o.params, o.transform && [o.transform.scale, o.transform.sx, o.transform.sy, o.transform.sz]]), () => Vis.meshBake(o));
      const spec = specOfObject(p, o, Object.assign({}, bounds, { penWidth }), seedOf(o.id));
      if (typeof ctx.specFor === 'function') Object.assign(spec, ctx.specFor(o, spec, mesh));
      specs.push(withToneModel(p, spec));
    });
    return specs;
  };
  // ── light model v2 wiring (A16) ─────────────────────────────────────────────────────────────────────────────────────────
  // What a v2 scene adds around one object's frame: the light context for toneTable (so the glint is paper), a diffuse-only tone
  // function built on Regions.shade (ambient + bounce, no eye, so it stays view independent and memoizable), and, when the scene
  // asks for shadows on objects, a per-receiver light-space receive map over the OTHER objects (pose excludes the receiver's own
  // geometry too). The map is fetched lazily on the first tone miss, so a pure camera orbit never touches it, and it is rebuilt
  // only when the light or a caster's transform changes (casters[].key is the caster's transform key).
  const hashStr = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = (Math.imul(h, 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); };
  const worldTriangles = (o, mesh, pose) => {
    const R = rotMatrix({ yaw: pose.obj.yaw, pitch: pose.obj.pitch, roll: pose.obj.roll });
    const V = mesh.vertices; const T = mesh.triVerts; const tr = pose.obj;
    const pt = (i) => ({
      x: R[0] * V[3 * i] + R[1] * V[3 * i + 1] + R[2] * V[3 * i + 2] + tr.x,
      y: R[3] * V[3 * i] + R[4] * V[3 * i + 1] + R[5] * V[3 * i + 2] + tr.y,
      z: R[6] * V[3 * i] + R[7] * V[3 * i + 1] + R[8] * V[3 * i + 2] + tr.z,
    });
    const verts = new Map(); const at = (i) => { let q = verts.get(i); if (!q) { q = pt(i); verts.set(i, q); } return q; };
    const out = [];
    for (let k = 0; k + 2 < T.length; k += 3) out.push({ a: at(T[k]), b: at(T[k + 1]), c: at(T[k + 2]) });
    return out;
  };
  // { key, get() } for the receiver `idx`, or null when the scene does not ask for shadows on objects (or nothing else can cast).
  const receiveCtxFor = (p, objects, meshes, poses, idx) => {
    if (!(p.shadow && p.shadow.shadowReceiveOnObjects) || !receiveMapAvailable()) return null;
    const casters = [];
    objects.forEach((o, j) => {
      if (j === idx || !meshes[j]) return;
      casters.push({ j, id: o.id, key: JSON.stringify([o.id, o.primitive, o.params, o.transform || null]) });
    });
    if (!casters.length) return null;
    const key = hashStr(casters.map((c) => c.key).join('|'));
    let map = null;
    return {
      key,
      get: () => {
        if (!map) {
          map = Scene3D.SurfaceLockShadow.receiveMap({
            lights: p.lights,
            casters: casters.map((c) => ({ id: c.id, key: c.key, triangles: auxGet(2, c.key, () => worldTriangles(objects[c.j], meshes[c.j], poses[c.j])) })),
          });
        }
        return map;
      },
    };
  };
  // toneCtx.light for a v2 scene (null for a legacy one): the model, the lights and the specular tunables (Regions.SHADE_DEFAULTS).
  const lightCtxOf = (p, recv) => {
    if (toneModelOf(p) !== 'v2') return null;
    const R = Scene3D.Regions || {}; const D = R.SHADE_DEFAULTS || {};
    const t = p.tone || {}; const spc = t.specular || {};
    return {
      model: 'v2', lights: p.lights || [],
      shininess: typeof R.shininessForSize === 'function' ? R.shininessForSize(num(spc.size, num(D.size, 1))) : undefined,
      ks: spc.enabled === false ? 0 : num(D.ks, 1), s0: D.s0, s1: D.s1,
      shadowKey: recv ? recv.key : null,
      shadowFnFor: recv ? (nw) => recv.get().shadowFnFor(nw) : undefined,
    };
  };
  // The v2 diffuse tone function: Regions.shade's L (ambient + bounce + shadowed direct), then the style's tone shape.
  const toneFnV2 = (p, spec, recv) => {
    const R = Scene3D.Regions; const lights = p.lights || []; const t = p.tone || {};
    const shape = typeof R.toneShapeOf === 'function' ? R.toneShapeOf(spec.style, null) : null;
    return (nw, wp) => {
      const L = R.shade(nw, wp, lights, { model: 'v2', eye: null, ambient: t.ambient, bounce: t.bounce, shadowFn: recv ? recv.get().shadowFnFor(nw) : null }).L;
      return shape ? R.shapeTone(L, wp, shape) : L;
    };
  };

  const sceneFrame = (p, bounds, ctx) => {
    const t0 = now();
    stats.sceneFrames += 1;
    const Vis = Scene3D.SurfaceLockVisibility; const Sh = Scene3D.SurfaceLockShadow;
    const objects = p.objects || [];
    const penWidth = num(bounds && bounds.penWidth, 0);
    const seedOf = (id) => (typeof ctx.seedFor === 'function' ? ctx.seedFor(id) : null) || { salt: 0, phase: 0, off: false };
    const meshes = objects.map((o) => auxGet(0, JSON.stringify([o.id, o.primitive, o.params, o.transform && [o.transform.scale, o.transform.sx, o.transform.sy, o.transform.sz]]), () => Vis.meshBake(o)));
    const poses = objects.map((o) => poseOf(o.transform, p.camera, bounds));
    const camPose = poseOf({}, p.camera, bounds);

    const lights = p.lights || [];
    const suns = lights.filter((l) => l && l.type === 'directional' && l.castShadows !== false);
    const shadowOn = !!(suns.length && p.ground && p.ground.enabled !== false && Sh && suns.every((sun) => Sh.supports({ shadow: p.shadow, light: sun, lights, ground: p.ground, casters: objects })));

    // Occlusion buffer: several objects, a non-convex one, or a cast shadow to clip (contract §7).
    let occ = null;
    if (Vis && typeof Vis.occluder === 'function' && (objects.length > 1 || meshes.some((m) => m && !m.convex) || shadowOn)) {
      occ = Vis.occluder(meshes, { cam: camPose.cam, objs: poses.map((q) => q.obj) });
    }
    const countPts = (runs) => { let n = 0; runs.forEach((r) => { n += r.pts.length; }); return n; };
    // Clip one polyline against the buffer; keeps the visible runs and counts the dropped vertices.
    const clipLine = (pts, seg, closed) => {
      if (!occ) return [{ pts, visible: true }];
      let runs = occ.clipRun(pts, seg);
      if (closed && typeof occ.closedMerge === 'function') runs = occ.closedMerge(runs);
      const kept = runs.filter((r) => r.visible && r.pts.length > 1);
      stats.culledOccluded += Math.max(0, pts.length - countPts(kept));
      return kept.map((r) => ({ pts: r.pts, visible: true }));
    };
    const GROUND_SEG = { obj: -1, mode: 'fill' };

    // 1. the ground outline and the cast shadow (world-fixed). They are computed here but emitted after the objects, in
    // pose order (objects, ground edges, shadows last): `out` drives the export's first-seen pen-group order.
    const cam = p.camera || {};
    const groundOn = !!(p.ground && p.ground.enabled !== false);
    const deferredGround = []; const deferredShadow = [];
    if (shadowOn) {
      const seed = seedOf('ground');
      const persp = camPose.cam.persp;
      const scaleRef = Math.pow(2, Math.round(Math.log2(Math.max(1e-6, num(cam.zoom, 1) * (persp ? camPose.cam.focal / (camPose.cam.focal + camPose.cam.dist) : 1)))));
      const gspec = { width: num(bounds && bounds.width, 200), height: num(bounds && bounds.height, 200), scaleX: num(p.ground.scaleX, 1), scaleZ: num(p.ground.scaleZ, 1), scaleRef };
      const hatch = auxGet(1, JSON.stringify([gspec, p.shadow, penWidth, seed]), () => Sh.bakeGround(gspec, p.shadow, penWidth, seed));
      const L = Scene3D.Lighting;
      // A per-object cast toggle (obj.shadow.enabled === false) drops that object's shadow, as Shadows.build does.
      const casting = objects.map((o, i) => i).filter((i) => !(objects[i].shadow && objects[i].shadow.enabled === false));
      const casters = casting.map((i) => casterOf(objects[i], meshes[i], poses[i]));
      // Pose casts one footprint per casting sun; the ground hatch bake is light-free and shared.
      suns.forEach((sun, si) => {
        const dir = (si === 0 && ctx.lightDirWorld) || (L && L.lightWorldDir ? L.lightWorldDir(sun) : { x: 0, y: -1, z: 0 });
        const res = Sh.frameShadow(hatch, casters, dir, camPose);
        if (res && res.runs && res.runs.length) {
          const out = [];
          res.runs.forEach((r) => clipLine(r.pts, GROUND_SEG, false).forEach((q) => out.push(q)));
          if (out.length) deferredShadow.push(() => ctx.emitShadow(out, { footprints: res.footprints || [], casterIds: casting.map((i) => objects[i].id), camPose }));
        }
      });
    }
    if (groundOn && typeof ctx.emitGround === 'function') {
      const ring = groundRing(p.ground, cam, bounds);
      if (ring) {
        const out = clipLine(ring, GROUND_SEG, false);
        if (out.length) deferredGround.push(() => ctx.emitGround(out));
      }
    }

    // 2. per object: fills then edges
    let complete = true;
    objects.forEach((o, i) => {
      const st = objectStyleOf(p, o.id);
      if (!isMapperNoFill(st.mapper)) {
        const spec = specOfObject(p, o, bounds, seedOf(o.id));
        if (typeof ctx.specFor === 'function') Object.assign(spec, ctx.specFor(o, spec, meshes[i]));
        withToneModel(p, spec);
        const ms = bake(spec);
        if (ms) {
          const v2 = spec.toneModel === 'v2';
          const recv = v2 ? receiveCtxFor(p, objects, meshes, poses, i) : null;
          const toneCtx = { tone: p.tone, penWidth, noHighlight: !!(spec.noHighlight) };
          if (v2) toneCtx.light = lightCtxOf(p, recv);
          const tone = toneTable(spec, toneCtx);
          let toneFn = ctx.toneFnFor(o.id);
          let toneKey = typeof ctx.toneKeyFor === 'function' ? ctx.toneKeyFor(o.id, o) : null;
          if (v2 && toneFn) {
            toneFn = toneFnV2(p, spec, recv);
            // everything toneFnV2 reads beyond the hub's key: the model parameters and the casters that can shadow this receiver
            if (toneKey !== null) toneKey += '|v2|' + num(p.tone && p.tone.ambient, '') + '|' + num(p.tone && p.tone.bounce, '') + '|' + (recv ? recv.key : '');
          }
          const lines = frame([ms], poses[i], { toneFn, toneKey, tone, penWidth, objectId: o.id, specOff: !!spec.seed && !!spec.seed.off, toneModel: v2 ? 'v2' : undefined });
          // A lone convex object never occludes its own marks (contract §7): the buffer exists for the shadow, so
          // its fills skip the per-vertex test.
          const clipFills = !!occ && (objects.length > 1 || !meshes[i].convex);
          const seg = clipFills ? occ.segFor(meshes[i]) : null;
          const runs = [];
          if (!clipFills) {
            for (let k = 0; k < lines.length; k++) runs.push({ pts: lines[k], visible: true });
          } else {
            lines.forEach((line) => {
              const a = line[0]; const b = line[line.length - 1];
              const closed = line.length > 3 && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
              clipLine(line, seg, closed).forEach((q) => runs.push(q));
            });
          }
          if (runs.length) ctx.emitFill(o.id, runs);
        } else complete = false; // no baker (or a throwing one): the caller renders this scene in pose mode
      }
      if (Vis && typeof Vis.outline === 'function') {
        const ol = Vis.outline(meshes[i], poses[i], occ) || {};
        ['silhouette', 'crease', 'boundary'].forEach((cls) => {
          if (ol[cls] && ol[cls].length) ctx.emitEdge(o.id, cls, ol[cls]);
        });
      }
    });
    deferredGround.forEach((fn) => fn());
    deferredShadow.forEach((fn) => fn());
    const dt = now() - t0;
    stats.msFrameLast = dt;
    return complete ? undefined : false;
  };

  Scene3D.SurfaceLock = {
    VERSION: 1,
    BAKER_KEYS,
    EXCLUSIONS,
    FRAMEABLE,
    stats,
    resetStats,
    effectiveMarkSpace,
    explainMarkSpace,
    bakerFor,
    frameable,
    bakeKey,
    bake,
    takeFreshBakes,
    adopt,
    missingBakes,
    sceneBakeSpecs,
    toneTable,
    exclusionCtx,
    toneModelOf,
    lightCtxOf,
    toneFnV2,
    receiveCtxFor,
    poseOf,
    frame,
    sceneFrame,
    clearCache,
    setCacheLimitBytes,
  };
})();
