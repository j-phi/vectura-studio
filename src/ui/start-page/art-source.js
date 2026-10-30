/**
 * Start Page art source — window.Vectura.StartPageArtSource.
 *
 * One list of pieces for the cover, the plate grid and the rail:
 *   Art = { id, kind: 'work'|'pick', name, algorithm, collection, workId?, presetId?, recentId?,
 *           getSvg(): Promise<string>, ownColors: {paper, ink, penName, paperName} }
 *
 *   list()            -> Promise<Art[]>   works in addedAt order (plates), then studio picks
 *   listRecentFirst() -> Promise<Art[]>   works most recently opened first, then studio picks
 *   subscribe(fn)     -> unsubscribe      fires when the saved works change ('vectura:recents-changed')
 *   create({ store, renderer, cache, picks, presets, version }) -> a private source (tests)
 *
 * A work shows its stored thumbnail when that is an SVG (its paper-colored ground rect is removed so the
 * art recolors); otherwise its saved document is rendered once by StartPageArtRenderer. Picks are always
 * rendered. Every render is cached in IndexedDB, database `vectura-start-art`, store `thumbs`, keyed by
 * piece id + app version (a sibling of the recents database, so its schema is untouched); older versions
 * are pruned on first open. Without IndexedDB the cache lives in memory for the session.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DB_NAME = 'vectura-start-art';
  const STORE = 'thumbs';
  const EVENT = 'vectura:recents-changed';
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
    const version = String(opts.version || Vectura.APP_VERSION || '0');
    const cache = opts.cache || createCache(
      () => { try { return G.indexedDB || null; } catch (_e) { return null; } }, version);
    const picksCfg = () => opts.picks || Vectura.START_PAGE_PICKS || { STUDIO_PICKS: [], PICK_NAMES: {}, collectionFor: () => 'Studies' };
    const presetsList = () => opts.presets || Vectura.PRESETS || [];
    const inflight = new Map();

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
        paper: groundOf(entry.thumb && entry.thumb.kind === 'svg' ? entry.thumb.data : '') || FALLBACK_COLORS.paper,
        ink: pen && isHex(pen.color) ? pen.color : FALLBACK_COLORS.ink,
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

    const pickArts = () => {
      const cfg = picksCfg();
      const byId = new Map(presetsList().map((p) => [p.id, p]));
      return (cfg.STUDIO_PICKS || []).map((id) => byId.get(id)).filter(Boolean).map((preset) => {
        const art = {
          id: `pick:${preset.id}`,
          kind: 'pick',
          name: (cfg.PICK_NAMES && cfg.PICK_NAMES[preset.id]) || preset.name || preset.id,
          algorithm: preset.preset_system,
          collection: cfg.collectionFor ? cfg.collectionFor(preset.preset_system) : 'Studies',
          presetId: preset.id,
          ownColors: Object.assign({}, FALLBACK_COLORS),
          getSvg: async () => {
            const rec = await cached(`pick:${preset.id}`, () => getRenderer().renderPreset(preset));
            if (rec.ownColors) Object.assign(art.ownColors, rec.ownColors);
            return rec.svg;
          },
        };
        return art;
      });
    };

    const works = async () => {
      const store = getStore();
      if (!store || typeof store.listWorks !== 'function') return [];
      let entries = [];
      try { entries = await store.listWorks(); } catch (_e) { entries = []; }
      return entries.filter(Boolean).map(workArt);
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
        return entries.map(workArt).concat(pickArts());
      },
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
    list: () => sharedSource().list(),
    listRecentFirst: () => sharedSource().listRecentFirst(),
    subscribe: (fn) => sharedSource().subscribe(fn),
    DB_NAME,
    STORE,
  };
})();
