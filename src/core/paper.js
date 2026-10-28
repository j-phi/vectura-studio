/**
 * Paper model (paper selector) — window.Vectura.Paper.
 *
 * Pure helpers around the project paper config
 *   { type, color: '#rrggbb', texture: 0..1, bleed: 0..1, scale: 0.25..3, seed: int }
 * (scale: the Paper panel's Scale slider, 1 = calibrated physical grain;
 * missing in older files -> 1)
 * plus the single writer of SETTINGS.paper (setActive), which also mirrors the
 * colour into the legacy SETTINGS.bgColor so every older reader (export modal
 * preview, animated-SVG background, old builds opening new files) keeps working.
 *
 * Precedence when a project is opened/restored (resolveProjectPaper):
 *   state.paper  >  legacy state.bgColor (as a plain 'none' sheet)
 *                >  the user's default paper  >  built-in default.
 *
 * Custom papers ("My papers"): a project on a custom type carries the
 * type's realism parameters in paper.custom = { name, base, color, params }
 * so the file opens the same on a machine whose library lacks it.
 * registerCustomType() writes a custom type into the runtime
 * PAPERS.TYPES[id] (flag custom:true; ORDER stays built-in only), which is
 * all the renderer and texture code read. setActive / resolveProjectPaper
 * register the project's embedded block, so it wins over a library entry
 * with the same id. The library itself is a Vectura.UserLibraryStore
 * (customLibrary()).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const catalogue = () => Vectura.PAPERS || { TYPES: { none: { color: null } }, ORDER: ['none'], DEFAULT: { type: 'none', color: null, texture: 0.6, bleed: 0.5, scale: 1, seed: 1 }, LIMITS: { seedMax: 0x7fffffff, scaleMin: 0.25, scaleMax: 3 } };
  const settings = () => Vectura.SETTINGS || {};

  const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const isHexColor = (value) => {
    const V = Vectura.Validators;
    if (V && typeof V.isHexColor === 'function') return V.isHexColor(value);
    return typeof value === 'string' && value.length <= 9 && HEX_RE.test(value);
  };

  // '#abc' / '#abcd' / '#aabbccdd' -> '#aabbcc' (lower case). Alpha is dropped:
  // paper is opaque.
  const toHex6 = (value) => {
    if (!isHexColor(value)) return null;
    let h = value.slice(1).toLowerCase();
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    return `#${h.slice(0, 6)}`;
  };

  const clamp01 = (value, fallback) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  };

  // Paper Scale: a multiplier on every physical size of the surface,
  // clamped to LIMITS.scaleMin..scaleMax and rounded to 1 %. Missing or
  // invalid (an older file) -> the fallback (1 = calibrated real-world scale).
  // Any positive number clamps (1e9 and +Infinity both -> scaleMax); NaN,
  // non-numbers, 0 and negatives are invalid -> the fallback.
  const clampScale = (value, fallback = 1) => {
    const n = typeof value === 'number' ? value : Number(value);
    if (value === null || value === undefined || value === '' || Number.isNaN(n) || !(n > 0)) return fallback;
    const L = catalogue().LIMITS || {};
    return Math.round(Math.max(L.scaleMin || 0.25, Math.min(L.scaleMax || 3, n)) * 100) / 100;
  };

  const themeDocumentBg = () => {
    const S = settings();
    const theme = Vectura.THEMES && Vectura.THEMES[S.uiTheme];
    return toHex6(theme && theme.documentBg) || '#121214';
  };

  const hasType = (type) => typeof type === 'string'
    && Object.prototype.hasOwnProperty.call(catalogue().TYPES, type);

  // A shipped type (in the catalogue ORDER), as opposed to a runtime custom one.
  const isBuiltinType = (type) => typeof type === 'string'
    && Array.isArray(catalogue().ORDER) && catalogue().ORDER.includes(type) && hasType(type);

  const customCfg = () => catalogue().CUSTOM || { ID_RE: /^custom-[a-z0-9]{1,24}$/, DEFAULT_BASE: 'cold-press', NAME_MAX: 48, SHORT_MAX: 11, HINT: 'Custom paper', FALLBACK_NAME: 'Custom paper' };
  const isCustomId = (type) => typeof type === 'string' && customCfg().ID_RE.test(type);
  const isCustomType = (type) => isCustomId(type) && hasType(type) && catalogue().TYPES[type].custom === true;

  const typeInfo = (type) => catalogue().TYPES[hasType(type) ? type : 'none'] || {};

  // A paper type this build doesn't know (saved by a newer build) is kept
  // verbatim so the project round-trips, but renders as a plain sheet.
  const SAFE_TYPE = /^[a-z0-9][a-z0-9-]{0,31}$/;
  const keepType = (type) => (hasType(type) ? type
    : (typeof type === 'string' && SAFE_TYPE.test(type) ? type : 'none'));

  // A type's stock colour; 'none' has no colour of its own and follows the theme.
  const baseColorFor = (type) => toHex6(typeInfo(type).color) || themeDocumentBg();

  // ---- custom papers -------------------------------------------------------

  const finiteOr = (value, fallback) => {
    if (value === null || value === undefined || value === '' || typeof value === 'boolean') return fallback;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  // The built-in realistic type a custom paper starts from (never 'none' or
  // another custom type).
  const cleanBase = (base) => (typeof base === 'string' && base !== 'none' && isBuiltinType(base)
    ? base : customCfg().DEFAULT_BASE);

  const cleanCustomName = (name) => {
    const U = Vectura.UserLibraryStore;
    const max = customCfg().NAME_MAX || 48;
    if (U && typeof U.cleanName === 'function') return U.cleanName(name, max);
    return typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
  };

  // Whitelisted, clamped realism parameters; anything missing or not a
  // finite number takes the base type's value.
  const cleanParams = (params, base) => {
    const { PARAM_KEYS = [], PARAM_LIMITS = {}, TYPES } = catalogue();
    const src = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
    const info = TYPES[cleanBase(base)] || {};
    const out = {};
    PARAM_KEYS.forEach((k) => {
      const lim = PARAM_LIMITS[k] || { min: -Infinity, max: Infinity };
      const own = Object.prototype.hasOwnProperty.call(src, k) ? src[k] : undefined;
      const fallback = finiteOr(info[k], lim.min);
      const v = finiteOr(own, fallback);
      out[k] = Math.round(Math.max(lim.min, Math.min(lim.max, v)) * 1e4) / 1e4;
    });
    return out;
  };

  // The block a project embeds: { name, base, color, params }.
  // ---- image papers: the embedded/lean image block and attribution ------

  const imageCfg = () => catalogue().IMAGE || { tileMmMin: 5, tileMmMax: 2000, tileMaxBytes: 1536 * 1024 };
  const REF_RE = /^img-[a-z0-9]{8,24}$/;

  /**
   * An image block: { ref, tileMm, w?, h?, tile?, height? }. `tile`/`height`
   * are base64 PNG/JPEG/WebP data URLs (validated by magic bytes, size-capped);
   * a block without `tile` is "lean" (library entries; the pixels live in
   * IndexedDB under `ref`). Anything else -> null.
   */
  const normalizeImage = (raw, { lean = false } = {}) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const PI = Vectura.PaperImage;
    const C = imageCfg();
    const valid = (v) => (PI && PI.validateDataUrl ? PI.validateDataUrl(v, C.tileMaxBytes) : null);
    const tile = raw.tile !== undefined ? valid(raw.tile) : null;
    if (raw.tile !== undefined && !tile) return null; // a hostile/broken tile rejects the block
    const height = tile && raw.height ? valid(raw.height) : null;
    let ref = typeof raw.ref === 'string' && REF_RE.test(raw.ref) ? raw.ref : null;
    if (tile && PI && PI.refFor) ref = PI.refFor(tile, height || '');
    if (!ref) return null;
    const mm = finiteOr(raw.tileMm, NaN);
    if (!Number.isFinite(mm)) return null;
    const out = { ref, tileMm: Math.round(Math.max(C.tileMmMin, Math.min(C.tileMmMax, mm)) * 100) / 100 };
    ['w', 'h'].forEach((k) => {
      const n = Math.floor(finiteOr(raw[k], 0));
      if (n > 0 && n <= 16384) out[k] = n;
    });
    // Lean blocks (library entries) keep the content ref only.
    if (tile && !lean) out.tile = tile;
    if (height && !lean) out.height = height;
    return out;
  };

  const SAFE_URL_RE = /^https:\/\/[^\s"'<>`]{1,480}$/;
  const cleanText = (v, max) => {
    const U = Vectura.UserLibraryStore;
    return U && U.cleanName ? U.cleanName(typeof v === 'string' ? v : '', max) : '';
  };
  /** Attribution of a downloaded texture: author, licence, source URL. */
  const normalizeSource = (raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {};
    const provider = cleanText(raw.provider, 40);
    const title = cleanText(raw.title, 120);
    const author = cleanText(raw.author, 120);
    const licence = cleanText(raw.licence, 60);
    if (provider) out.provider = provider;
    if (typeof raw.providerId === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.providerId)) out.providerId = raw.providerId;
    const assetId = cleanText(raw.assetId != null ? String(raw.assetId) : '', 80);
    if (assetId) out.assetId = assetId;
    const attribution = cleanText(raw.attribution, 300);
    if (attribution) out.attribution = attribution;
    if (title) out.title = title;
    if (author) out.author = author;
    if (licence) out.licence = licence;
    if (typeof raw.url === 'string' && SAFE_URL_RE.test(raw.url)) out.url = raw.url;
    if (typeof raw.licenceUrl === 'string' && SAFE_URL_RE.test(raw.licenceUrl)) out.licenceUrl = raw.licenceUrl;
    return Object.keys(out).length ? out : null;
  };

  const normalizeCustomBlock = (raw, opts = {}) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!raw.params || typeof raw.params !== 'object' || Array.isArray(raw.params)) return null;
    const base = cleanBase(raw.base);
    const baseInfo = catalogue().TYPES[base] || {};
    const out = {
      name: cleanCustomName(raw.name) || customCfg().FALLBACK_NAME,
      base,
      color: toHex6(raw.color) || toHex6(baseInfo.color) || '#ffffff',
      params: cleanParams(raw.params, base),
    };
    if (raw.image !== undefined && raw.image !== null) {
      const image = normalizeImage(raw.image, opts);
      if (!image) return null; // an image paper without a usable image is refused, not silently plain
      out.image = image;
    }
    const source = normalizeSource(raw.source);
    if (source) out.source = source;
    return out;
  };

  // A library entry: the block plus id and the slider values a fresh pick
  // starts from. The id is checked by the store; null for anything else.
  // Library entries are always lean: an image's pixels live in IndexedDB.
  const normalizeCustomEntry = (raw) => {
    const block = normalizeCustomBlock(raw, { lean: true });
    if (!block) return null;
    const baseInfo = catalogue().TYPES[block.base] || {};
    const out = {
      id: isCustomId(raw.id) ? raw.id : null,
      name: block.name,
      base: block.base,
      color: block.color,
      defaultTexture: clamp01(raw.defaultTexture, clamp01(baseInfo.defaultTexture, 0.6)),
      defaultBleed: clamp01(raw.defaultBleed, clamp01(baseInfo.defaultBleed, 0.5)),
      defaultScale: clampScale(raw.defaultScale, 1),
      params: block.params,
    };
    if (block.image) out.image = block.image;
    if (block.source) out.source = block.source;
    return out;
  };

  const blockFromRegistered = (type) => {
    if (!isCustomType(type)) return null;
    const info = catalogue().TYPES[type];
    return normalizeCustomBlock({ name: info.label, base: info.base, color: info.color, params: info, image: info.image, source: info.source });
  };

  const paramsEqual = (a, b) => {
    const keys = catalogue().PARAM_KEYS || [];
    if (!a || !b) return false;
    return keys.every((k) => Math.round((a[k] || 0) * 1e4) === Math.round((b[k] || 0) * 1e4));
  };

  const shortName = (name) => {
    const n = String(name || '');
    const max = customCfg().SHORT_MAX || 11;
    return n.length > max ? `${n.slice(0, max - 1)}…` : n;
  };

  /**
   * Register (or update) a custom paper type in the runtime catalogue.
   * `entry` is a library entry or an embedded block (`id` given separately
   * or on the entry). Returns the registered info, or null when invalid.
   * Updating an already registered type with different parameters clears
   * the texture caches (chunks are keyed by type id).
   */
  const registerCustomType = (entry, idArg) => {
    const id = idArg || (entry && entry.id);
    if (!isCustomId(id)) return null;
    const T = catalogue().TYPES;
    if (!T) return null;
    const prev = Object.prototype.hasOwnProperty.call(T, id) ? T[id] : null;
    if (prev && prev.custom !== true) return null; // never shadow a shipped type
    const block = normalizeCustomBlock(entry);
    if (!block) return null;
    const base = T[block.base] || {};
    const prevDefaults = prev ? { defaultTexture: prev.defaultTexture, defaultBleed: prev.defaultBleed, defaultScale: prev.defaultScale } : {};
    const info = {
      label: block.name,
      short: shortName(block.name),
      hint: customCfg().HINT,
      color: block.color,
      ...block.params,
      defaultTexture: clamp01(entry.defaultTexture, clamp01(prevDefaults.defaultTexture, clamp01(base.defaultTexture, 0.6))),
      defaultBleed: clamp01(entry.defaultBleed, clamp01(prevDefaults.defaultBleed, clamp01(base.defaultBleed, 0.5))),
      defaultScale: clampScale(entry.defaultScale, clampScale(prevDefaults.defaultScale, 1)),
      custom: true,
      base: block.base,
    };
    if (block.image) {
      // Keep pixels we already have for the same image (a lean block names
      // the same ref).
      const prevImg = prev && prev.image && prev.image.ref === block.image.ref ? prev.image : null;
      info.image = { ...block.image };
      if (!info.image.tile && prevImg && prevImg.tile) {
        info.image.tile = prevImg.tile;
        if (prevImg.height) info.image.height = prevImg.height;
      }
      // Re-registering the same lean image keeps the "missing" verdict.
      if (!info.image.tile && prevImg && prev.imageMissing) info.imageMissing = true;
    }
    if (block.source) info.source = block.source;
    const imgKey = (i) => (i && i.image ? `${i.image.ref}|${i.image.tileMm}` : '');
    const changed = !prev || !paramsEqual(prev, info) || prev.color !== info.color || imgKey(prev) !== imgKey(info);
    T[id] = info;
    if (changed && prev) {
      const PT = Vectura.PaperTexture;
      if (PT && typeof PT.clearCache === 'function') PT.clearCache(id);
    }
    if (info.image) loadImageFor(id, info.image);
    return info;
  };

  const notifyTexture = (type) => {
    try {
      if (typeof G.dispatchEvent === 'function' && typeof G.CustomEvent === 'function') {
        G.dispatchEvent(new G.CustomEvent('vectura:paper-texture-ready', { detail: { type } }));
      }
    } catch (_e) { /* noop */ }
  };

  // Put an embedded tile back into the project/default blocks that name the
  // same ref but arrived lean (from the library or the stored default), so
  // the document stays portable when saved.
  const patchSettingsImage = (rec) => {
    const S = settings();
    ['paper', 'paperDefault'].forEach((k) => {
      const cfg = S[k];
      const img = cfg && cfg.custom && cfg.custom.image;
      if (img && img.ref === rec.ref && !img.tile) {
        img.tile = rec.tile;
        if (rec.height) img.height = rec.height;
      }
    });
  };

  /**
   * Make sure a registered image paper's render maps exist: hydrate a lean
   * block from IndexedDB, decode, then clear the texture caches and announce
   * 'vectura:paper-texture-ready' (the Paper panel repaints). Async, best effort.
   */
  const loadImageFor = (id, image) => {
    const PI = Vectura.PaperImage;
    if (!PI || !image || !image.ref) return Promise.resolve(false);
    if (PI.mapsFor(image)) return Promise.resolve(true);
    const T = catalogue().TYPES;
    const stillCurrent = () => T[id] && T[id].image && T[id].image.ref === image.ref;
    const withTile = image.tile
      ? Promise.resolve(image)
      : (() => {
        const TS = Vectura.TextureStore;
        if (!TS || !TS.shared) return Promise.resolve(null);
        return TS.shared().get(image.ref).then((rec) => {
          if (!rec) {
            // The library names an image this browser no longer holds: say
            // so (the panel offers a re-upload) instead of silently falling
            // back to the procedural base paper.
            if (stillCurrent() && !T[id].image.tile) {
              T[id].imageMissing = true;
              notifyTexture(id);
            }
            return null;
          }
          if (stillCurrent()) {
            T[id].image.tile = rec.tile;
            if (rec.height) T[id].image.height = rec.height;
            delete T[id].imageMissing;
          }
          patchSettingsImage(rec);
          return { ...image, tile: rec.tile, height: rec.height };
        }, () => null);
      })();
    return withTile.then((img) => (img ? PI.loadMaps(img) : null)).then((maps) => {
      if (!maps || !stillCurrent()) return false;
      const PT = Vectura.PaperTexture;
      if (PT && typeof PT.clearCache === 'function') PT.clearCache(id);
      notifyTexture(id);
      return true;
    }, () => false);
  };

  /**
   * Store an image block's pixels in IndexedDB (library papers). A lean
   * block (no pixels) succeeds only when IndexedDB already holds its ref.
   * -> { ok, ref } | { ok:false, reason: 'unavailable'|'quota'|'invalid'|'image-missing' }
   */
  const storeImage = async (image) => {
    const TS = Vectura.TextureStore;
    if (!image || !image.ref) return { ok: false, reason: 'invalid' };
    if (!TS || !TS.shared) return { ok: false, reason: 'unavailable' };
    if (!image.tile) {
      let rec = null;
      try { rec = await TS.shared().get(image.ref); } catch (_e) { rec = null; }
      return rec ? { ok: true, ref: image.ref } : { ok: false, reason: 'image-missing' };
    }
    return TS.shared().put({ ref: image.ref, tile: image.tile, height: image.height, tileMm: image.tileMm, w: image.w, h: image.h });
  };

  /**
   * Delete a stored image when nothing references it any more: no library
   * paper, not the open document, not the default paper (in memory or in its
   * own storage key). Resolves true when it was removed.
   */
  const releaseImageIfUnused = async (ref) => {
    const TS = Vectura.TextureStore;
    if (!ref || !TS || !TS.shared) return false;
    const lib = customLibrary();
    const S = settings();
    const refOf = (cfg) => (cfg && cfg.custom && cfg.custom.image ? cfg.custom.image.ref : null);
    let stored = null;
    try { stored = loadDefault(); } catch (_e) { stored = null; }
    const used = (lib ? lib.list() : []).some((e) => e.image && e.image.ref === ref)
      || refOf(S.paper) === ref || refOf(S.paperDefault) === ref || refOf(stored) === ref;
    if (used) return false;
    const res = await TS.shared().remove(ref);
    return Boolean(res && res.ok);
  };

  const leanImage = (image) => {
    if (!image) return undefined;
    const out = { ref: image.ref, tileMm: image.tileMm };
    if (image.w) out.w = image.w;
    if (image.h) out.h = image.h;
    return out;
  };

  const unregisterCustomType = (id) => {
    if (!isCustomType(id)) return false;
    delete catalogue().TYPES[id];
    return true;
  };

  // A fresh pick of a library entry: its stock colour and slider values,
  // the realism block embedded; the seed carries over.
  const fromCustomEntry = (entry, base = null) => {
    const e = normalizeCustomEntry(entry);
    const id = entry && isCustomId(entry.id) ? entry.id : null;
    if (!e || !id) return null;
    const prev = base ? normalize(base) : null;
    // Reuse pixels the runtime already has for this image (else the block
    // stays lean and is hydrated from IndexedDB on registration).
    const reg = catalogue().TYPES[id];
    const image = e.image && reg && reg.image && reg.image.ref === e.image.ref && reg.image.tile
      ? { ...e.image, tile: reg.image.tile, height: reg.image.height }
      : e.image;
    return normalize({
      type: id,
      color: e.color,
      texture: e.defaultTexture,
      bleed: e.defaultBleed,
      scale: e.defaultScale,
      seed: prev ? prev.seed : undefined,
      custom: { name: e.name, base: e.base, color: e.color, params: e.params, image, source: e.source },
    });
  };

  // A library entry capturing a paper as it looks now (Save as custom /
  // Save to my papers / Update saved paper).
  const entryFromPaper = (cfg, name, id = null) => {
    const p = normalize(cfg);
    const T = catalogue().TYPES;
    let base;
    let params;
    let image;
    let source;
    if (p.custom) {
      ({ base, params, image, source } = p.custom);
    } else {
      base = cleanBase(p.type);
      params = T[hasType(p.type) && p.type !== 'none' ? p.type : base];
    }
    return normalizeCustomEntry({
      id,
      name: name || (p.custom && p.custom.name) || (T[p.type] && T[p.type].label) || customCfg().FALLBACK_NAME,
      base,
      color: p.color,
      defaultTexture: p.type === 'none' ? (T[base] || {}).defaultTexture : p.texture,
      defaultBleed: p.type === 'none' ? (T[base] || {}).defaultBleed : p.bleed,
      defaultScale: p.type === 'none' ? 1 : p.scale,
      params,
      image: leanImage(image),
      source,
    });
  };

  /**
   * Export library papers (all, or the given ids) as a `vectura-papers`
   * file whose image papers carry their pixels inline (portable). Pixels
   * come from IndexedDB, else from a registered type / the project.
   * Resolves { ok, text, filename, count, missingImages } | { ok:false, reason }.
   */
  const exportCustomPapers = async (ids = null, extra = []) => {
    const lib = customLibrary();
    if (!lib) return { ok: false, reason: 'unavailable' };
    const C = customCfg();
    let entries = lib.list();
    if (Array.isArray(ids)) entries = entries.filter((e) => ids.includes(e.id));
    entries = entries.concat(extra || []);
    let missingImages = 0;
    const TS = Vectura.TextureStore;
    const T = catalogue().TYPES;
    const papers = [];
    for (const e of entries) {
      const out = { ...e };
      if (e.image) {
        let rec = null;
        if (TS && TS.shared) { try { rec = await TS.shared().get(e.image.ref); } catch (_e) { rec = null; } }
        if (!rec) {
          const reg = Object.values(T).find((i) => i && i.custom && i.image && i.image.ref === e.image.ref && i.image.tile);
          const S = settings();
          const proj = S.paper && S.paper.custom && S.paper.custom.image;
          rec = reg ? reg.image : (proj && proj.ref === e.image.ref && proj.tile ? proj : null);
        }
        if (rec && rec.tile) {
          out.image = { ...e.image, tile: rec.tile };
          if (rec.height) out.image.height = rec.height;
        } else {
          missingImages += 1;
        }
      }
      papers.push(out);
    }
    const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'paper';
    const filename = papers.length === 1 && Array.isArray(ids)
      ? `${C.FILE_STEM}-${slug(papers[0].name)}.json` : `${C.FILE_STEM}.json`;
    try {
      const text = JSON.stringify({ schema: C.SCHEMA, version: C.VERSION, appVersion: Vectura.APP_VERSION || '', papers }, null, 2);
      return { ok: true, text, filename, count: papers.length, missingImages };
    } catch (_e) {
      return { ok: false, reason: 'invalid' };
    }
  };

  /**
   * Import a `vectura-papers` file (merge). Image papers: every tile is
   * validated (PNG/JPEG/WebP by magic bytes, size cap) and must decode; it
   * is stored in IndexedDB under its content ref and the entry kept lean. A
   * paper whose image is unusable is rejected. Resolves the store's import
   * result (+ rejected images) or { ok:false, reason }.
   */
  const importCustomPapers = async (text) => {
    const lib = customLibrary();
    if (!lib) return { ok: false, reason: 'unavailable' };
    const C = customCfg();
    const I = imageCfg();
    if (typeof text !== 'string') return { ok: false, reason: 'parse' };
    if (text.length > (I.importMaxBytes || 64 * 1024 * 1024)) return { ok: false, reason: 'too-large' };
    let doc;
    try { doc = JSON.parse(text); } catch (_e) { return { ok: false, reason: 'parse' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || doc.schema !== C.SCHEMA || !Array.isArray(doc.papers)) {
      return lib.importBundle(text.length > lib.maxBytes ? '{}' : text, 'merge');
    }
    const v = Number(doc.version);
    if (Number.isFinite(v) && Math.floor(v) > C.VERSION) return { ok: false, reason: 'version' };
    const PI = Vectura.PaperImage;
    let imageRejected = 0;
    const papers = [];
    for (const raw of doc.papers) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.image === undefined || raw.image === null) {
        papers.push(raw);
        continue;
      }
      const image = normalizeImage(raw.image);
      let ok = Boolean(image && image.tile);
      if (image && !image.tile) {
        // A lean paper (exported without pixels) imports only when this
        // browser already holds its image.
        const TS = Vectura.TextureStore;
        let rec = null;
        if (TS && TS.shared) { try { rec = await TS.shared().get(image.ref); } catch (_e) { rec = null; } }
        if (rec) { papers.push({ ...raw, image: leanImage(image) }); continue; }
      }
      if (ok && PI && PI.decode) {
        try { await PI.decode(image.tile, 64); } catch (_e) { ok = false; }
      }
      if (ok) {
        const res = await storeImage(image);
        if (!res.ok) return { ok: false, reason: res.reason === 'quota' ? 'quota' : 'unavailable' };
      }
      if (!ok) { imageRejected += 1; continue; }
      papers.push({ ...raw, image: leanImage(image) });
    }
    const lean = JSON.stringify({ schema: doc.schema, version: doc.version, papers });
    if (!papers.length && imageRejected) return { ok: true, added: [], skipped: 0, renamed: 0, rejected: imageRejected, full: false };
    const res = lib.importBundle(lean, 'merge');
    if (res.ok) res.rejected += imageRejected;
    return res;
  };

  let libraryStore = null;
  const customLibrary = () => {
    if (libraryStore) return libraryStore;
    const U = Vectura.UserLibraryStore;
    if (!U || typeof U.create !== 'function') return null;
    const C = customCfg();
    libraryStore = U.create({
      key: C.LIBRARY_KEY,
      schema: C.SCHEMA,
      version: C.VERSION,
      itemsKey: 'papers',
      validate: normalizeCustomEntry,
      max: C.MAX_ENTRIES,
      maxBytes: C.MAX_BYTES,
      idPrefix: C.ID_PREFIX,
      nameMax: C.NAME_MAX,
      fileStem: C.FILE_STEM,
      appVersion: () => Vectura.APP_VERSION || '',
    });
    return libraryStore;
  };

  /**
   * Register every library entry (for swatches/menus), then the default's
   * and the project's embedded blocks — the project's last, so it wins over
   * a library entry with the same id. Returns the library entries.
   */
  const syncCustomTypes = () => {
    const lib = customLibrary();
    const entries = lib ? lib.list() : [];
    const S = settings();
    const project = S.paper && typeof S.paper === 'object' && isCustomId(S.paper.type) ? S.paper : null;
    const projectBlock = project ? normalizeCustomBlock(project.custom) : null;
    const def = S.paperDefault && typeof S.paperDefault === 'object' && isCustomId(S.paperDefault.type) ? S.paperDefault : null;
    entries.forEach((e) => {
      if (projectBlock && e.id === project.type) return;
      registerCustomType(e);
    });
    if (def && def.custom && !(projectBlock && def.type === project.type) && !entries.some((e) => e.id === def.type)) {
      registerCustomType(def.custom, def.type);
    }
    if (projectBlock) registerCustomType(projectBlock, project.type);
    return entries;
  };

  // Register a config's embedded custom block (the project or default paper).
  const registerFromConfig = (cfg) => {
    if (cfg && cfg.custom && isCustomId(cfg.type)) registerCustomType(cfg.custom, cfg.type);
    return cfg;
  };

  /**
   * Clamp/validate an untrusted paper config. Unknown type -> 'none'. A colour
   * that is not a strict hex (e.g. a CSS-injection string) falls back to
   * opts.fallbackColor, then the type's stock colour.
   */
  const normalize = (cfg, opts = {}) => {
    const src = cfg && typeof cfg === 'object' ? cfg : {};
    const { DEFAULT, LIMITS } = catalogue();
    const type = keepType(src.type);
    // A custom type carries its realism block (from the config, else from
    // the registered type) so it survives save/load on any machine.
    const custom = isCustomId(type) ? (normalizeCustomBlock(src.custom) || blockFromRegistered(type)) : null;
    const color = toHex6(src.color) || toHex6(opts.fallbackColor)
      || (custom ? custom.color : null) || baseColorFor(type);
    const seedRaw = Number(src.seed);
    const seedMax = (LIMITS && LIMITS.seedMax) || 0x7fffffff;
    const seed = Number.isFinite(seedRaw) && seedRaw >= 1
      ? Math.min(seedMax, Math.floor(seedRaw))
      : (DEFAULT.seed || 1);
    const out = {
      type,
      color,
      texture: clamp01(src.texture, DEFAULT.texture),
      bleed: clamp01(src.bleed, DEFAULT.bleed),
      scale: clampScale(src.scale, clampScale(DEFAULT.scale, 1)),
      seed,
    };
    if (custom) out.custom = custom;
    return out;
  };

  const builtinDefault = () => normalize({ ...catalogue().DEFAULT, color: themeDocumentBg() });

  const fromLegacyBg = (hex) => normalize({ ...catalogue().DEFAULT, type: 'none', color: hex });

  // The paper a fresh pick of `type` starts from: the type's stock colour and
  // its tuned texture/bleed. The seed carries over so the grain doesn't jump.
  const forType = (type, base = null) => {
    const info = typeInfo(type);
    const prev = base ? normalize(base) : null;
    return normalize({
      type: hasType(type) ? type : 'none',
      color: baseColorFor(type),
      texture: type === 'none' ? (prev ? prev.texture : undefined) : info.defaultTexture,
      bleed: type === 'none' ? (prev ? prev.bleed : undefined) : info.defaultBleed,
      scale: type === 'none' ? (prev ? prev.scale : undefined) : clampScale(info.defaultScale, 1),
      seed: prev ? prev.seed : undefined,
      custom: isCustomType(type) ? blockFromRegistered(type) : undefined,
    });
  };

  const resolveProjectPaper = (state, userDefault) => {
    const s = state && typeof state === 'object' ? state : {};
    if (s.paper && typeof s.paper === 'object') {
      return registerFromConfig(normalize(s.paper, { fallbackColor: s.bgColor }));
    }
    if (isHexColor(s.bgColor)) return fromLegacyBg(s.bgColor);
    if (userDefault && typeof userDefault === 'object') return registerFromConfig(normalize(userDefault));
    return builtinDefault();
  };

  // The paper the renderer paints. SETTINGS.bgColor is the colour of record
  // (setActive keeps the two in sync; tolerating a direct bgColor write keeps
  // legacy callers and tests correct).
  const effective = () => {
    const S = settings();
    const base = S.paper && typeof S.paper === 'object' ? S.paper : { type: 'none' };
    return normalize({ ...base, color: toHex6(S.bgColor) || base.color });
  };

  const isRealistic = (cfg) => {
    if (!cfg || typeof cfg !== 'object') return false;
    if (cfg.type === 'none' || !hasType(cfg.type)) return false;
    return clamp01(cfg.texture, 0) > 0 || clamp01(cfg.bleed, 0) > 0;
  };

  // WCAG relative luminance of a hex colour (0..1).
  const luminance = (hex) => {
    const h = toHex6(hex);
    if (!h) return 0;
    const lin = (i) => {
      const c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  };

  // Light stock: ink multiplies into the sheet (picks up its colour and tooth).
  // Dark stock: ink sits on top so light/metallic ink stays readable.
  const inkBlendFor = (cfg) => (luminance(cfg && cfg.color) >= 0.4 ? 'multiply' : 'source-over');

  const equals = (a, b) => {
    if (!a || !b) return false;
    const na = normalize(a);
    const nb = normalize(b);
    const r = (v) => Math.round(v * 100);
    // Custom papers also compare their realism parameters (and base).
    const imgRef = (c) => (c.image ? `${c.image.ref}|${c.image.tileMm}` : '');
    const sameCustom = (!na.custom && !nb.custom)
      || (Boolean(na.custom && nb.custom) && na.custom.base === nb.custom.base
        && paramsEqual(na.custom.params, nb.custom.params) && imgRef(na.custom) === imgRef(nb.custom));
    return na.type === nb.type && na.color === nb.color
      && r(na.texture) === r(nb.texture) && r(na.bleed) === r(nb.bleed) && r(na.scale) === r(nb.scale) && sameCustom;
  };

  /**
   * The single writer of the project paper. Mirrors the colour into
   * SETTINGS.bgColor. opts.history pushes ONE undo checkpoint before the
   * change (callers that stream edits — colour drags, sliders — arm it once
   * per edit session and pass history:false afterwards).
   */
  const setActive = (cfg, opts = {}) => {
    const { app = null, history = false, render = true } = opts;
    const S = settings();
    if (history && app && typeof app.pushHistory === 'function') app.pushHistory();
    const next = registerFromConfig(normalize(cfg));
    S.paper = next;
    S.bgColor = next.color;
    if (render && app && typeof app.render === 'function') app.render();
    try {
      if (typeof G.dispatchEvent === 'function' && typeof G.CustomEvent === 'function') {
        G.dispatchEvent(new G.CustomEvent('vectura:paper-change', { detail: { paper: JSON.parse(JSON.stringify(next)) } }));
      }
    } catch (_e) { /* never block a paper write on a notify failure */ }
    return next;
  };

  // Theme sync rule: a theme change may recolour the paper only when the user
  // has no default paper and the project sheet is plain ('none') in the
  // previous theme's colour.
  // previousBg: the documentBg of the theme being left. The sheet follows the
  // theme only while it is still that theme's own plain colour.
  const themeMaySync = (previousBg) => {
    const S = settings();
    if (S.paperDefault) return false;
    const p = S.paper;
    if (!p) return true;
    if (p.type !== 'none' && hasType(p.type)) return false;
    const prev = toHex6(previousBg);
    if (!prev) return true;
    return toHex6(S.bgColor || p.color) === prev;
  };

  const storage = () => {
    try { return G.localStorage || null; } catch (_e) { return null; }
  };
  const storageKey = () => catalogue().STORAGE_KEY || 'vectura.paperDefault';

  // undefined = nothing stored (fall back to the preference snapshot);
  // null = explicitly no default; object = the stored default (normalized).
  const loadDefault = () => {
    const ls = storage();
    if (!ls) return undefined;
    let raw = null;
    try { raw = ls.getItem(storageKey()); } catch (_e) { return undefined; }
    if (raw == null) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? normalize(parsed) : null;
    } catch (_e) {
      return undefined;
    }
  };

  // An explicit "no default" is stored as null so it overrides a stale copy
  // in the preference snapshot; removeDefault() forgets the key entirely
  // (Clear saved preferences).
  // A copy without image pixels (refs only) for small stores (the default
  // paper key, the preference snapshot); the pixels live in IndexedDB.
  const leanCopy = (cfg) => {
    if (!cfg || typeof cfg !== 'object') return cfg;
    const n = normalize(cfg);
    if (n.custom && n.custom.image) n.custom = { ...n.custom, image: leanImage(n.custom.image) };
    return n;
  };

  const saveDefault = (cfg) => {
    const ls = storage();
    if (!ls) return;
    const n = cfg && typeof cfg === 'object' ? normalize(cfg) : null;
    if (n && n.custom && n.custom.image && n.custom.image.tile) storeImage(n.custom.image);
    try {
      ls.setItem(storageKey(), n ? JSON.stringify(leanCopy(n)) : 'null');
    } catch (_e) { /* quota / disabled */ }
  };

  const removeDefault = () => {
    const ls = storage();
    if (!ls) return;
    try { ls.removeItem(storageKey()); } catch (_e) { /* disabled */ }
  };

  Vectura.Paper = {
    isKnownType: hasType,
    isBuiltinType,
    isCustomId,
    isCustomType,
    normalizeCustomBlock,
    normalizeCustomEntry,
    registerCustomType,
    unregisterCustomType,
    fromCustomEntry,
    entryFromPaper,
    customLibrary,
    syncCustomTypes,
    paramsEqual,
    normalizeImage,
    normalizeSource,
    loadImageFor,
    storeImage,
    releaseImageIfUnused,
    leanCopy,
    exportCustomPapers,
    importCustomPapers,
    loadDefault,
    saveDefault,
    removeDefault,
    isHexColor,
    toHex6,
    themeDocumentBg,
    baseColorFor,
    normalize,
    clampScale,
    builtinDefault,
    fromLegacyBg,
    forType,
    resolveProjectPaper,
    effective,
    isRealistic,
    luminance,
    inkBlendFor,
    equals,
    setActive,
    themeMaySync,
  };
})();
