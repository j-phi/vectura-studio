/**
 * Start Page art source — window.Vectura.StartPageArtSource.
 *
 * One list of pieces for the cover, the plate grid and the rail:
 *   Art = { id, kind: 'work'|'pick', name, algorithm, collection, workId?, presetId?, recentId?, sceneId?,
 *           getSvg(): Promise<string>, ownColors: {paper, ink, penName, paperName} }
 *
 *   list()            -> Promise<Art[]>   works in addedAt order (plates), then studio picks
 *   listRecentFirst() -> Promise<Art[]>   works most recently opened first, then studio picks
 *   coverPicks()      -> Art[]            the default cover word's pieces in letter order (coverSlot, coverColorway); not in list()
 *   examples(list?)   -> Art[]            the first-run example plates (kind 'pick', example:true, exampleMeta); not in list().
 *                                         `list` = Developer Mode's draft entries instead of the shipped EXAMPLE_PLATES
 *   subscribe(fn)     -> unsubscribe      fires when the saved works change ('vectura:recents-changed')
 *   create({ store, renderer, cache, picks, presets, version }) -> a private source (tests)
 *
 * A work shows its stored thumbnail when that is an SVG (its paper-colored ground rect is removed so the
 * art recolors); otherwise its saved document is rendered once by StartPageArtRenderer. Picks are always
 * rendered. Every render is cached in IndexedDB, database `vectura-start-art`, store `thumbs`, keyed by
 * piece id + a hash of the piece's CONTENT (picks) or its last-opened stamp (works) + RENDER_VERSION (a sibling of
 * the recents database, so its schema is untouched). The key does not carry the app version, so a patch release
 * does not re-render anything; bump RENDER_VERSION when the renderer or an algorithm changes how pieces look.
 *
 * Picks are fixed bundled presets, so their art is PRE-RENDERED at development time (`npm run start-page:picks`
 * -> assets/start-page/picks/<id>.svg + the START_PAGE_PICKS_ART manifest). On a cache miss a pick first fetches
 * that file, but only while the manifest's hash for it equals the preset's current content hash and the manifest's
 * version equals RENDER_VERSION; a mismatch, a failed fetch (file://, offline) or a non-SVG body falls back to the
 * live render, so an edited preset never shows stale art.
 * Entries from another RENDER_VERSION are pruned on first open. Without IndexedDB the cache lives in memory.
 * A 3D Scene work also turns on the Start Page: its stored document's scene is registered with StartPageOrbit3D
 * (registerScene / sceneFromDoc) under `work:<id>`, and the art carries that key as `sceneId`. A 3D Scene piece (a work
 * like that, or a scene3d preset) carries getScenePayload(): the .vectura document StartPageSceneOrbit re-renders with
 * the camera turned, so every pose is drawn by the app's own scene pipeline.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DB_NAME = 'vectura-start-art';
  const STORE = 'thumbs';
  const EVENT = 'vectura:recents-changed';
  const RENDER_VERSION = 'r1';
  const FALLBACK_COLORS = Object.freeze({ paper: '#f4efe4', ink: '#111111', penName: 'Pen 1', paperName: 'Paper' });

  // ---------------------------------------------------------------- thumbs cache
  const createCache = (getIdb, version) => {
    const mem = new Map();
    let dbPromise = null;
    const open = () => {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        let idb = null;
        try { idb = getIdb(); } catch (_e) { idb = null; }
        if (!idb || typeof idb.open !== 'function') { resolve(null); return; }
        let req;
        try { req = idb.open(DB_NAME, 1); } catch (_e) { resolve(null); return; }
        req.onupgradeneeded = () => {
          try {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
          } catch (_e) { /* resolved by onerror */ }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      });
      return dbPromise;
    };
    const tx = (mode, fn) => open().then((db) => new Promise((resolve) => {
      if (!db) { resolve({ ok: false }); return; }
      let result;
      let t;
      try {
        t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        if (req) req.onsuccess = () => { result = req.result; };
      } catch (_e) { resolve({ ok: false }); return; }
      t.oncomplete = () => resolve({ ok: true, result });
      t.onerror = () => resolve({ ok: false });
      t.onabort = () => resolve({ ok: false });
    }));
    const keyOf = (id) => `${id}@${version}`;
    let pruned = false;
    const prune = async () => {
      if (pruned) return;
      pruned = true;
      const res = await tx('readonly', (s) => s.getAllKeys());
      if (!res.ok || !Array.isArray(res.result)) return;
      const stale = res.result.filter((k) => typeof k === 'string' && !k.endsWith(`@${version}`));
      for (const k of stale) await tx('readwrite', (s) => s.delete(k));
    };
    return {
      async get(id) {
        const key = keyOf(id);
        if (mem.has(key)) return mem.get(key);
        await prune();
        const res = await tx('readonly', (s) => s.get(key));
        const rec = res.ok && res.result && typeof res.result.svg === 'string' ? res.result : null;
        if (rec) mem.set(key, rec);
        return rec;
      },
      async put(id, rec) {
        const key = keyOf(id);
        mem.set(key, rec);
        await tx('readwrite', (s) => s.put(Object.assign({ id: key }, rec)));
      },
    };
  };

  // ---------------------------------------------------------------- helpers
  const stripExt = (name) => String(name || 'Untitled').replace(/\.vectura$/i, '');
  // The recents thumbnail wraps the export SVG with a paper-colored ground rect; the page recolors art
  // through CSS variables, so the ground goes (the tile draws its own paper).
  const stripGround = (svg) => svg.replace(/(<svg\b[^>]*>)\s*<rect\b[^>]*\/>/, '$1');
  const groundOf = (svg) => {
    const m = /^\s*(?:<\?xml[^>]*\?>)?\s*<svg\b[^>]*>\s*<rect\b[^>]*\bfill="(#[0-9a-f]{3,8})"/i.exec(svg || '');
    return m ? m[1] : null;
  };
  // FNV-1a over the JSON text: a cheap, stable content stamp for a preset (not a security hash).
  const hashOf = (value) => {
    let text = '';
    try { text = JSON.stringify(value) || ''; } catch (_e) { text = String(value); }
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  };
  const isHex = (c) => typeof c === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c);

  const labelFor = (algorithm) => {
    const fn = Vectura.PresetNameHeuristics && Vectura.PresetNameHeuristics.algoLabel;
    try { return (typeof fn === 'function' && fn(algorithm)) || algorithm; } catch (_e) { return algorithm; }
  };
  // Recents stores a display label ("Rings") in entry.algorithm; the collection table is keyed by type.
  const typeFromLabel = (label) => {
    const raw = String(label || '');
    const C = (Vectura.START_PAGE_PICKS && Vectura.START_PAGE_PICKS.COLLECTIONS) || {};
    if (Object.prototype.hasOwnProperty.call(C, raw)) return raw;
    const lower = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
    return Object.keys(C).find((k) => k.toLowerCase() === lower) || raw;
  };

  const create = (opts = {}) => {
    const getStore = () => opts.store
      || (G.app && G.app.recents && G.app.recents.store)
      || (Vectura.RecentsStore && Vectura.RecentsStore.shared && Vectura.RecentsStore.shared())
      || null;
    const getRenderer = () => opts.renderer || Vectura.StartPageArtRenderer;
    const cache = opts.cache || createCache(
      () => { try { return G.indexedDB || null; } catch (_e) { return null; } }, RENDER_VERSION);
    const picksCfg = () => opts.picks || Vectura.START_PAGE_PICKS || { STUDIO_PICKS: [], PICK_NAMES: {}, collectionFor: () => 'Studies' };
    const presetsList = () => opts.presets || Vectura.PRESETS || [];
    const inflight = new Map();
    const artManifest = () => (opts.prerendered !== undefined ? opts.prerendered : Vectura.START_PAGE_PICKS_ART) || null;
    const doFetch = () => opts.fetch || (typeof G.fetch === 'function' ? G.fetch.bind(G) : null);

    // The pre-rendered SVG for a pick, or null (stale / missing / unreachable): the caller then renders live.
    const prerenderedPick = async (preset, hash) => {
      const m = artManifest();
      const f = doFetch();
      if (!m || !f || m.version !== RENDER_VERSION || !m.hashByPick || m.hashByPick[preset.id] !== hash) return null;
      try {
        const res = await f(`${m.path || './assets/start-page/picks/'}${encodeURIComponent(preset.id)}.svg`);
        if (!res || !res.ok) return null;
        const svg = await res.text();
        if (typeof svg !== 'string' || !/^\s*(?:<\?xml[^>]*\?>\s*)?<svg\b/.test(svg)) return null;
        return { svg, algorithm: preset.preset_system, ownColors: Object.assign({}, FALLBACK_COLORS), bytes: svg.length };
      } catch (_e) { return null; }
    };

    // One cached render per piece id; concurrent callers share the promise.
    const cached = (cacheId, render) => {
      if (inflight.has(cacheId)) return inflight.get(cacheId);
      const p = (async () => {
        const hit = await cache.get(cacheId);
        if (hit) return hit;
        const out = await render();
        const rec = { svg: out.svg, ownColors: out.ownColors, algorithm: out.algorithm, bytes: out.bytes, at: Date.now() };
        await cache.put(cacheId, rec);
        return rec;
      })();
      inflight.set(cacheId, p);
      const done = () => { inflight.delete(cacheId); };
      p.then(done, done);
      return p;
    };

    const workArt = (entry) => {
      const type = typeFromLabel(entry.algorithm);
      const pen = Array.isArray(entry.pens) && entry.pens[0] ? entry.pens[0] : null;
      const ownColors = {
        // the document's own colors stored at record time; the SVG thumbnail's ground and the first pen serve entries from before
        paper: (isHex(entry.paperColor) && entry.paperColor) || groundOf(entry.thumb && entry.thumb.kind === 'svg' ? entry.thumb.data : '') || FALLBACK_COLORS.paper,
        ink: (isHex(entry.inkColor) && entry.inkColor) || (pen && isHex(pen.color) ? pen.color : FALLBACK_COLORS.ink),
        penName: 'Pen 1',
        paperName: FALLBACK_COLORS.paperName,
      };
      const art = {
        id: `work:${entry.id}`,
        kind: 'work',
        name: stripExt(entry.name),
        algorithm: entry.algorithm || '',
        collection: picksCfg().collectionFor ? picksCfg().collectionFor(type) : 'Studies',
        workId: entry.id,
        recentId: entry.id,
        cleared: !!entry.cleared, // hidden from Recent by Clear (still a work)
        ownColors,
        getSvg: async () => {
          if (entry.thumb && entry.thumb.kind === 'svg' && entry.thumb.data) return stripGround(entry.thumb.data);
          const rec = await cached(`work:${entry.id}:${entry.lastOpened}`, async () => {
            const store = getStore();
            const doc = store && await store.getDoc(entry.id);
            if (!doc) throw new Error('This saved work has no stored copy to draw from');
            return getRenderer().renderDocument(doc, `work:${entry.id}`);
          });
          if (rec.ownColors) Object.assign(art.ownColors, rec.ownColors);
          return rec.svg;
        },
      };
      return art;
    };

    const presetArt = (preset, extra) => {
      const cfg = picksCfg();
      const art = Object.assign({
        id: `pick:${preset.id}`,
        kind: 'pick',
        name: (cfg.PICK_NAMES && cfg.PICK_NAMES[preset.id]) || preset.name || preset.id,
        algorithm: preset.preset_system,
        collection: cfg.collectionFor ? cfg.collectionFor(preset.preset_system) : 'Studies',
        presetId: preset.id,
        ownColors: Object.assign({}, FALLBACK_COLORS),
        // a scene preset turns on the Start Page by re-rendering this document (the one its drawing came from)
        ...(preset.preset_system === 'scene3d' ? { getScenePayload: () => getRenderer().presetPayload(preset) } : {}),
        getSvg: async () => {
          const hash = hashOf(preset);
          const rec = await cached(`pick:${preset.id}:${hash}`, async () => (await prerenderedPick(preset, hash)) || getRenderer().renderPreset(preset));
          if (rec.ownColors) Object.assign(art.ownColors, rec.ownColors);
          return rec.svg;
        },
      }, extra || {});
      return art;
    };

    const pickArts = () => {
      const byId = new Map(presetsList().map((p) => [p.id, p]));
      return (picksCfg().STUDIO_PICKS || []).map((id) => byId.get(id)).filter(Boolean).map((preset) => presetArt(preset));
    };

    // The example plates: kind 'pick' (they open as a new document from the preset) with example:true and the
    // mockup's copy / layout / pin. Never part of list(): the Plates section asks for them only on a first run.
    // `list` (Developer Mode's draft: [{ key, presetId, title, word, layout, pin }]) replaces the shipped EXAMPLE_PLATES; each art
    // then carries its draft key in exampleMeta.key. A pick with no pre-rendered file (or a stale one) renders live.
    // `colors` (optional manual colors, same shape as the plates store) is validated here: unknown roles / malformed values drop out.
    const exampleColors = (c) => { const X = Vectura.StartPageExamplePlates; return X && typeof X.sanitizeColors === 'function' ? X.sanitizeColors(c) : null; };
    const exampleHover = (v) => { const X = Vectura.StartPageExamplePlates; return X && typeof X.sanitizeHover === 'function' ? X.sanitizeHover(v) : null; };
    const exampleArts = (list) => {
      const byId = new Map(presetsList().map((p) => [p.id, p]));
      const src = Array.isArray(list) ? list : (picksCfg().EXAMPLE_PLATES || []);
      return src.filter((e) => e && byId.has(e.presetId)).map((e) => presetArt(byId.get(e.presetId), {
        id: `example:${e.presetId}`, name: e.title || byId.get(e.presetId).name, example: true,
        exampleMeta: { title: e.title || null, description: e.description || null, word: e.word || null, layout: e.layout || null, pin: e.pin || null, key: e.key || null, colors: exampleColors(e.colors), hover: exampleHover(e.hover) },
      }));
    };

    // The default cover word's pieces, one per letter (config COVER_WORD_PICKS): coverSlot is the letter index and
    // coverColorway the pinned paper + pen ids. They are ordinary picks otherwise (same id as the studio pick when shared).
    const coverArts = () => {
      const byId = new Map(presetsList().map((p) => [p.id, p]));
      return (picksCfg().COVER_WORD_PICKS || []).map((e, i) => {
        const preset = byId.get(e.presetId);
        return preset ? presetArt(preset, { coverSlot: i, coverColorway: { paper: e.paper, pen: e.pen, pen2: e.pen2 || null } }) : null;
      }).filter(Boolean);
    };

    // A 3D Scene work: read its stored document once and register its scene as a live model (art.sceneId).
    // The work's label is its first drawable layer's (a scene tree's first child: Object 3D, Light, Ground, ...).
    const SCENE_TYPES = new Set(['scene3d', 'object3d', 'booleangroup3d', 'light', 'ground', 'scenelight3d', 'sceneground3d']);
    const liveScenes = async (arts, entries) => {
      const O = Vectura.StartPageOrbit3D;
      const store = getStore();
      if (!O || typeof O.registerScene !== 'function' || typeof O.sceneFromDoc !== 'function' || !store || typeof store.getDoc !== 'function') return arts;
      await Promise.all(entries.map(async (entry, i) => {
        if (!SCENE_TYPES.has(typeFromLabel(entry.algorithm).toLowerCase().replace(/[^a-z0-9]/g, ''))) return;
        try {
          const doc = await store.getDoc(entry.id);
          const scene = doc ? O.sceneFromDoc(doc) : null;
          const key = `work:${entry.id}`;
          if (scene && O.registerScene(key, scene, arts[i].name)) { arts[i].sceneId = key; arts[i].getScenePayload = () => store.getDoc(entry.id); }
        } catch (_e) { /* no live model: the piece keeps its drawing */ }
      }));
      return arts;
    };
    const workArts = (entries) => liveScenes(entries.map(workArt), entries);

    const works = async () => {
      const store = getStore();
      if (!store || typeof store.listWorks !== 'function') return [];
      let entries = [];
      try { entries = await store.listWorks(); } catch (_e) { entries = []; }
      return workArts(entries.filter(Boolean));
    };

    return {
      async list() {
        return (await works()).concat(pickArts());
      },
      async listRecentFirst() {
        const store = getStore();
        let entries = [];
        try { entries = store && store.listWorks ? await store.listWorks() : []; } catch (_e) { entries = []; }
        entries = entries.slice().sort((a, b) => (b.lastOpened - a.lastOpened) || (b.addedAt - a.addedAt));
        return (await workArts(entries)).concat(pickArts());
      },
      examples: exampleArts,
      coverPicks: coverArts,
      subscribe(fn) {
        if (typeof fn !== 'function') return () => {};
        const handler = () => { try { fn(); } catch (_e) { /* subscriber errors stay local */ } };
        if (typeof G.addEventListener === 'function') G.addEventListener(EVENT, handler);
        return () => { if (typeof G.removeEventListener === 'function') G.removeEventListener(EVENT, handler); };
      },
      cache,
      labelFor,
    };
  };

  let shared = null;
  const sharedSource = () => { if (!shared) shared = create(); return shared; };
  Vectura.StartPageArtSource = {
    create,
    createCache,
    RENDER_VERSION,
    hashOf,
    list: () => sharedSource().list(),
    listRecentFirst: () => sharedSource().listRecentFirst(),
    subscribe: (fn) => sharedSource().subscribe(fn),
    examples: (list) => sharedSource().examples(list),
    coverPicks: () => sharedSource().coverPicks(),
    DB_NAME,
    STORE,
  };
})();
