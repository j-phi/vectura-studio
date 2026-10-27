/**
 * Paper texture search — window.Vectura.PaperTextureSearch.
 *
 * Queries every enabled provider in src/config/paper-texture-sources.js in
 * parallel (per-provider timeout + abort), maps each response through the
 * provider's declarative record into ONE result shape, and caches results
 * briefly. Downloads a chosen result (CORS fetch; zip archives of maps are
 * unpacked in the browser) for the image-paper import pipeline.
 *
 *   search(query, { providers?, signal?, fetch? })
 *     -> { results: [Result], errors: [{ provider, reason }] }
 *   Result = { provider, providerName, id, title, thumbUrl, fullUrl, heightUrl?, archive?,
 *              members?, width?, height?, physicalMm?, licence, licenceUrl?, author,
 *              sourceUrl, attribution, cors }
 *   download(result, { fetch?, signal? })
 *     -> { ok:true, albedo: Blob, height?: Blob } | { ok:false, reason: 'cors'|'network'|'timeout'|'too-large'|'archive'|'http' }
 *   normalise(provider, rawItem) -> Result | null      (pure; tests)
 *   unzip(arrayBuffer, patterns) -> { name: Blob }      (stored + deflate via DecompressionStream)
 *
 * Only https URLs survive normalisation; every string is length-capped.
 * Network errors never throw out of search()/download().
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const conf = () => Vectura.PAPER_TEXTURE_SOURCES || { PROVIDERS: [], DEFAULT_QUERY: 'paper', TIMEOUT_MS: 12000, CACHE_MS: 300000, MAX_RESULTS: 24 };
  const HTTPS_RE = /^https:\/\/[^\s"'<>`\\]{1,1000}$/;
  const safeUrl = (v) => (typeof v === 'string' && HTTPS_RE.test(v) ? v : null);
  const text = (v, max = 120) => {
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    // eslint-disable-next-line no-control-regex
    return String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  };

  // Own-property dot path lookup ("a.b.0.256-JPG-FFFFFF"); "=x" is a constant.
  const getPath = (obj, path) => {
    if (typeof path !== 'string' || !path) return undefined;
    if (path[0] === '=') return path.slice(1);
    let cur = obj;
    for (const key of path.split('.')) {
      if (!cur || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) return undefined;
      cur = cur[key];
    }
    return cur;
  };

  const fill = (template, vars) => String(template || '').replace(/\{(\w+)\}/g, (_m, k) => (vars[k] == null ? '' : String(vars[k])));
  // Template over item paths: "{a.b}" -> getPath(item, 'a.b').
  const fillPaths = (template, item) => String(template || '').replace(/\{([\w.-]+)\}/g, (_m, k) => {
    const v = getPath(item, k);
    return v == null || typeof v === 'object' ? '' : String(v);
  });

  // HTML -> text without ever parsing it as markup.
  const stripHtml = (v) => String(v || '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");

  /** Evaluate a declarative field spec against one item. */
  const field = (item, spec) => {
    if (spec == null) return undefined;
    if (typeof spec === 'string') return getPath(item, spec);
    if (typeof spec !== 'object') return undefined;
    if (spec.tpl) return fillPaths(spec.tpl, item);
    let v = getPath(item, spec.path);
    if (spec.map) {
      const key = typeof v === 'string' ? v.toLowerCase() : v;
      const tpl = Object.prototype.hasOwnProperty.call(spec.map, key) ? spec.map[key] : null;
      v = tpl == null ? v : fillPaths(tpl, item).trim();
    }
    if (spec.strip === 'html') v = stripHtml(v);
    if (spec.fileTitle && typeof v === 'string') v = v.replace(/^File:/i, '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ');
    return v;
  };

  const pickFile = (raw, spec, base = null) => {
    if (!spec) return null;
    if (spec.tpl) return resolveUrl(fillPaths(spec.tpl, raw), base);
    if (spec.path) return resolveUrl(getPath(raw, spec.path), base);
    const list = getPath(raw, spec.from);
    if (!Array.isArray(list)) return null;
    const where = spec.where || {};
    const hit = list.find((item) => item && typeof item === 'object'
      && Object.keys(where).every((k) => Object.prototype.hasOwnProperty.call(item, k) && item[k] === where[k]));
    return hit ? resolveUrl(getPath(hit, spec.field), base) : null;
  };

  // https anywhere; a relative path only against a same-origin base (the
  // local bundle), never a scheme like data:/javascript:.
  const resolveUrl = (v, base) => {
    if (typeof v !== 'string') return null;
    if (safeUrl(v)) return v;
    if (!base || /^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('//') || v.includes('..')) return null;
    try {
      const u = new G.URL(v, base);
      const loc = G.location && G.location.origin;
      return loc && u.origin === loc ? u.href : null;
    } catch (_e) {
      return null;
    }
  };

  const scaleGuess = (title) => {
    const rules = conf().SCALE_GUESS || [];
    const hit = rules.find((r) => new RegExp(r.match, 'i').test(String(title || '')));
    return hit ? hit.mm : 150;
  };

  const licenceOk = (provider, licence) => {
    const l = String(licence || '');
    if (provider.licenceDeny && new RegExp(provider.licenceDeny, 'i').test(l)) return false;
    if (provider.licenceAllow && !new RegExp(provider.licenceAllow, 'i').test(l.trim())) return false;
    return true;
  };

  /** Map one provider item to the shared Result shape (null if unusable). */
  const normalise = (provider, raw, base = null) => {
    if (!provider || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const f = provider.fields || {};
    const id = text(field(raw, f.id), 80);
    const fullUrl = pickFile(raw, provider.file, base);
    const thumbUrl = resolveUrl(field(raw, f.thumbUrl), base) || resolveUrl(field(raw, f.thumbUrlAlt), base);
    if (!id || !fullUrl || !thumbUrl) return null;
    const mime = text(field(raw, f.mime), 40);
    if (provider.mimeAllow && mime && !new RegExp(provider.mimeAllow, 'i').test(mime)) return null;
    const licence = text(field(raw, f.licence), 60) || text(provider.licence, 60);
    if (!licence || !licenceOk(provider, licence)) return null;
    const title = text(field(raw, f.title), 120) || `${text(provider.name, 40)} ${id}`;
    const author = text(field(raw, f.author), 120) || text(provider.name, 40);
    const out = {
      provider: provider.id,
      providerName: text(provider.name, 40),
      id,
      title,
      thumbUrl,
      fullUrl,
      licence,
      author,
      sourceUrl: resolveUrl(field(raw, f.sourceUrl), base) || safeUrl(provider.homepage) || null,
      cors: (provider.cors && provider.cors.files) || 'unverified',
    };
    const licenceUrl = safeUrl(field(raw, f.licenceUrl)) || safeUrl(provider.licenceUrl);
    if (licenceUrl) out.licenceUrl = licenceUrl;
    const heightUrl = provider.heightFile ? pickFile(raw, provider.heightFile, base) : null;
    if (heightUrl) out.heightUrl = heightUrl;
    if (provider.file && provider.file.archive === 'zip') {
      out.archive = 'zip';
      out.members = { ...(provider.file.members || {}) };
    }
    if (provider.hires) {
      const hu = pickFile(raw, provider.hires, base);
      if (hu) out.hires = { url: hu, archive: provider.hires.archive || null, members: { ...(provider.hires.members || {}) } };
    }
    const proxyUrl = provider.proxyFile ? pickFile(raw, provider.proxyFile, base) : null;
    if (proxyUrl) out.proxyUrl = proxyUrl;
    // "Direct": the image host is known to allow the app to load it.
    try {
      const host = new G.URL(fullUrl).host;
      out.direct = out.cors === 'yes' || (Array.isArray(provider.corsHosts) && provider.corsHosts.includes(host));
    } catch (_e) { out.direct = out.cors === 'yes'; }
    if (provider.onUse) {
      const ou = safeUrl(getPath(raw, provider.onUse.path));
      if (ou) out.onUse = { url: ou, auth: Boolean(provider.onUse.auth) };
    }
    ['width', 'height'].forEach((k) => {
      const n = Number(field(raw, f[k]));
      if (Number.isFinite(n) && n > 0) out[k] = Math.round(n);
    });
    const pm = provider.physicalMm;
    if (pm) {
      const n = Number(getPath(raw, typeof pm === 'string' ? pm : pm.path)) * ((pm && pm.scale) || 1);
      if (Number.isFinite(n) && n > 0) out.physicalMm = Math.round(n * 100) / 100;
    }
    if (!out.physicalMm) {
      out.physicalMm = scaleGuess(title);
      out.scaleGuessed = true;
    }
    if (/\bsa\b|sharealike/i.test(licence)) out.shareAlike = true;
    const attr = text(field(raw, f.attribution), 300);
    out.attribution = attr || text(`${title} — ${author}${licence ? ` (${licence})` : ''}`, 300);
    return out;
  };

  // ---- user API keys (this browser only) -------------------------------------

  const keyStore = () => { try { return G.localStorage || null; } catch (_e) { return null; } };
  const KEY_RE = /^[A-Za-z0-9_\-.]{8,200}$/;
  const readKeys = () => {
    const ls = keyStore();
    if (!ls) return {};
    try {
      const raw = JSON.parse(ls.getItem(conf().KEYS_STORAGE || 'vectura.textureKeys') || '{}');
      const out = {};
      (conf().PROVIDERS || []).forEach((p) => {
        if (p.needsKey && raw && typeof raw[p.id] === 'string' && KEY_RE.test(raw[p.id])) out[p.id] = raw[p.id];
      });
      return out;
    } catch (_e) {
      return {};
    }
  };
  const getKey = (id) => readKeys()[id] || null;
  /** Save (or clear with '') a provider key. Returns false when rejected. */
  const setKey = (id, value) => {
    const p = (conf().PROVIDERS || []).find((x) => x.id === id);
    if (!p || !p.needsKey) return false;
    const v = String(value || '').trim();
    if (v && !KEY_RE.test(v)) return false;
    const keys = readKeys();
    if (v) keys[id] = v; else delete keys[id];
    const ls = keyStore();
    if (!ls) return false;
    try { ls.setItem(conf().KEYS_STORAGE || 'vectura.textureKeys', JSON.stringify(keys)); } catch (_e) { return false; }
    clearCache();
    return true;
  };
  const isUsable = (p) => p && p.enabled !== false && (!p.needsKey || Boolean(getKey(p.id)));

  const authInit = (provider) => {
    const key = provider.needsKey ? getKey(provider.id) : null;
    const headers = {};
    if (provider.auth && key && provider.auth.header) headers[provider.auth.header] = fill(provider.auth.value || '{key}', { key });
    return { headers, key };
  };

  const cache = new Map();
  const clearCache = () => cache.clear();

  const withTimeout = (ms, outer) => {
    const AC = G.AbortController;
    const ctl = AC ? new AC() : null;
    let timedOut = false;
    const timer = G.setTimeout(() => { timedOut = true; if (ctl) ctl.abort(); }, ms);
    const onAbort = () => { if (ctl) ctl.abort(); };
    if (outer && outer.addEventListener) outer.addEventListener('abort', onAbort);
    return {
      signal: ctl ? ctl.signal : undefined,
      timedOut: () => timedOut,
      done: () => { G.clearTimeout(timer); if (outer && outer.removeEventListener) outer.removeEventListener('abort', onAbort); },
    };
  };

  // The curated bundle: a same-origin index (absent unless a maintainer ran
  // scripts/fetch-paper-textures.js). Probed once per session.
  // null = not probed yet; false = absent (remembered for the session, so
  // the 404 is requested once, not on every search).
  let bundleIndex = null;
  const loadBundle = async (provider, doFetch) => {
    if (bundleIndex !== null) return bundleIndex || null;
    try {
      const res = await doFetch(provider.index, { credentials: 'same-origin' });
      if (!res || !res.ok) { bundleIndex = false; return null; }
      const json = await res.json();
      if (!json || json.schema !== 'vectura-paper-texture-bundle' || !Array.isArray(json.textures)) { bundleIndex = false; return null; }
      const base = (G.location && G.location.href) ? new G.URL(provider.index, G.location.href).href : null;
      bundleIndex = { items: json.textures, base };
      return bundleIndex;
    } catch (_e) {
      bundleIndex = false;
      return null;
    }
  };
  const BUNDLE_FIELDS = Object.freeze({
    id: 'id', title: 'title', thumbUrl: 'thumb', sourceUrl: 'landingUrl', author: 'author', licence: 'licence', licenceUrl: 'licenceUrl',
    attribution: 'attribution', width: 'width', height: 'height',
  });

  const searchBundle = async (provider, query, opts) => {
    const doFetch = opts.fetch || G.fetch;
    if (typeof doFetch !== 'function') return { error: 'network' };
    const idx = await loadBundle(provider, doFetch);
    if (!idx) return { results: [], absent: true };
    const words = String(query || '').toLowerCase().split(/\s+/).filter((w) => w && w !== 'paper' && w !== 'texture');
    const spec = { ...provider, fields: BUNDLE_FIELDS, file: { path: 'albedo' }, heightFile: { path: 'heightMap' }, physicalMm: { path: 'physicalMm' } };
    const results = idx.items
      .filter((it) => it && typeof it === 'object')
      .filter((it) => !words.length || words.every((w) => `${it.title || ''} ${(it.tags || []).join(' ')} ${it.source || ''}`.toLowerCase().includes(w)))
      .map((it) => normalise(spec, it, idx.base))
      .filter(Boolean)
      .map((r) => ({ ...r, cors: 'yes' }));
    return { results };
  };

  // One HTTP query of one provider record (or its `fallback` record).
  const queryProvider = async (provider, query, opts) => {
    const C = conf();
    const doFetch = opts.fetch || G.fetch;
    if (typeof doFetch !== 'function') return { error: 'network' };
    const { headers, key: apiKey } = authInit(provider);
    const url = fill(provider.search && provider.search.url, {
      query: encodeURIComponent(query), limit: encodeURIComponent(C.MAX_RESULTS || 24), key: encodeURIComponent(apiKey || ''),
    });
    if (!safeUrl(url)) return { error: 'config' };
    const t = withTimeout(C.TIMEOUT_MS || 12000, opts.signal);
    try {
      const res = await doFetch(url, { signal: t.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', headers });
      if (!res || !res.ok) {
        const st = res && res.status;
        return { error: st === 429 ? 'rate-limited' : (st === 401 || st === 403) ? 'auth' : 'http' };
      }
      let json;
      try { json = await res.json(); } catch (_e) { return { error: 'parse' }; }
      let list = getPath(json, provider.search.results);
      if (provider.search.resultsAreMap && list && typeof list === 'object' && !Array.isArray(list)) {
        list = Object.keys(list).map((k) => list[k]);
      }
      if (!Array.isArray(list)) return { error: 'shape' };
      const results = list
        .map((raw) => normalise(provider, raw))
        .filter(Boolean)
        .slice(0, C.MAX_RESULTS || 24);
      return { results };
    } catch (_e) {
      if (opts.signal && opts.signal.aborted) return { error: 'aborted' };
      return { error: t.timedOut() ? 'timeout' : 'network' };
    } finally {
      t.done();
    }
  };

  const searchOne = async (provider, query, opts) => {
    const C = conf();
    if (provider.kind === 'bundle') return searchBundle(provider, query, opts);
    const key = `${provider.id}|${query}`;
    const hit = cache.get(key);
    const ttl = provider.cacheMs != null ? provider.cacheMs : (C.CACHE_MS || 0);
    if (hit && Date.now() - hit.at < ttl) return { results: hit.results };
    let out = await queryProvider(provider, query, opts);
    // A documented-but-unverified API that fails or changes shape falls back
    // to the provider's alternative (e.g. ambientCG v3 -> the v2 shape that
    // was observed live).
    if (out.error && provider.fallback && !['aborted', 'rate-limited', 'auth'].includes(out.error)) {
      const alt = await queryProvider({ ...provider, ...provider.fallback, fallback: null }, query, opts);
      if (!alt.error) out = alt;
    }
    if (!out.error) cache.set(key, { at: Date.now(), results: out.results });
    return out;
  };

  /** Query the enabled providers in parallel. Never throws. */
  const search = async (query, opts = {}) => {
    const C = conf();
    const q = text(query, 80) || C.DEFAULT_QUERY || 'paper';
    const wanted = Array.isArray(opts.providers) ? opts.providers : null;
    const providers = (C.PROVIDERS || []).filter((p) => isUsable(p) && (!wanted || wanted.includes(p.id)));
    const outs = await Promise.all(providers.map((p) => searchOne(p, q, opts).then((r) => ({ p, r }))));
    const results = [];
    const errors = [];
    const absent = [];
    outs.forEach(({ p, r }) => {
      if (r.error) errors.push({ provider: p.id, reason: r.error });
      else results.push(...r.results);
      if (r.absent) absent.push(p.id);
    });
    return { query: q, results, errors, absent };
  };

  // ---- downloads ---------------------------------------------------------------

  const readCapped = async (res, max) => {
    const len = Number(res.headers && res.headers.get ? res.headers.get('content-length') : NaN);
    if (Number.isFinite(len) && len > max) throw Object.assign(new Error('too-large'), { reason: 'too-large' });
    const blob = await res.blob();
    if (blob.size > max) throw Object.assign(new Error('too-large'), { reason: 'too-large' });
    return blob;
  };

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  const inflateRaw = async (bytes) => {
    if (typeof G.DecompressionStream !== 'function' || typeof G.Blob !== 'function' || typeof G.Response !== 'function') {
      throw Object.assign(new Error('archive'), { reason: 'archive' });
    }
    const stream = new G.Blob([bytes]).stream().pipeThrough(new G.DecompressionStream('deflate-raw'));
    return new Uint8Array(await new G.Response(stream).arrayBuffer());
  };

  const mimeFor = (name) => (/\.png$/i.test(name) ? 'image/png' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg');

  /**
   * Extract the members whose names match `patterns` ({ key: regexString })
   * from a zip. Returns { key: Blob }. Stored and deflate entries only; a
   * member over maxBytes, encryption or a malformed archive -> reason 'archive'.
   */
  const unzip = async (buffer, patterns, maxBytes = 64 * 1024 * 1024) => {
    const b = new Uint8Array(buffer);
    const fail = () => Object.assign(new Error('archive'), { reason: 'archive' });
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i -= 1) {
      if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw fail();
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    const res = {};
    const rx = Object.entries(patterns || {}).map(([k, src]) => [k, new RegExp(src, 'i')]);
    for (let n = 0; n < count && p + 46 <= b.length; n += 1) {
      if (u32(b, p) !== 0x02014b50) throw fail();
      const flags = u16(b, p + 8);
      const method = u16(b, p + 10);
      const csize = u32(b, p + 20);
      const usize = u32(b, p + 24);
      const nlen = u16(b, p + 28);
      const elen = u16(b, p + 30);
      const clen = u16(b, p + 32);
      const lho = u32(b, p + 42);
      let name = '';
      for (let i = 0; i < nlen; i += 1) name += String.fromCharCode(b[p + 46 + i]);
      p += 46 + nlen + elen + clen;
      const hit = rx.find(([k, r]) => !res[k] && r.test(name));
      if (!hit) continue;
      if (flags & 1) throw fail(); // encrypted
      if (usize > maxBytes || csize > maxBytes) throw Object.assign(new Error('too-large'), { reason: 'too-large' });
      if (u32(b, lho) !== 0x04034b50) throw fail();
      const start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28);
      const data = b.subarray(start, start + csize);
      let out;
      if (method === 0) out = data;
      else if (method === 8) out = await inflateRaw(data);
      else throw fail();
      res[hit[0]] = new G.Blob([out], { type: mimeFor(name) });
    }
    return res;
  };

  /** Download a result's image (and height map). Never throws. */
  const download = async (result, opts = {}) => {
    const C = conf();
    if (!result || typeof result.fullUrl !== 'string') return { ok: false, reason: 'network' };
    if (result.cors === 'no') return { ok: false, reason: 'cors' };
    // "High-res (ZIP)": the provider's larger download instead.
    if (opts.hires && result.hires && result.hires.url) {
      result = { ...result, fullUrl: result.hires.url, heightUrl: null, archive: result.hires.archive, members: result.hires.members };
    }
    const doFetch = opts.fetch || G.fetch;
    if (typeof doFetch !== 'function') return { ok: false, reason: 'network' };
    const max = C.DOWNLOAD_MAX_BYTES || 40 * 1024 * 1024;
    const t = withTimeout(C.DOWNLOAD_TIMEOUT_MS || 60000, opts.signal);
    const get = async (url) => {
      let res;
      try {
        res = await doFetch(url, { signal: t.signal, mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      } catch (_e) {
        // A CORS refusal surfaces as a TypeError with no detail: report it as
        // 'cors' so the UI offers the source page + upload fallback.
        throw Object.assign(new Error('fetch'), { reason: t.timedOut() ? 'timeout' : 'cors' });
      }
      if (!res || !res.ok) throw Object.assign(new Error('http'), { reason: 'http' });
      return readCapped(res, max);
    };
    // Provider rule (Unsplash): report the use. Best effort, never blocks.
    if (result.onUse && result.onUse.url) {
      const prov = (C.PROVIDERS || []).find((p) => p.id === result.provider);
      const init = prov && result.onUse.auth ? authInit(prov) : { headers: {} };
      try { Promise.resolve(doFetch(result.onUse.url, { mode: 'cors', credentials: 'omit', headers: init.headers })).catch(() => {}); } catch (_e) { /* noop */ }
    }
    try {
      let blob;
      let via = 'direct';
      try {
        blob = await get(result.fullUrl);
      } catch (err) {
        // The original's host refused the app: use the provider's own
        // (CORS-enabled, possibly lower-resolution) image proxy if it has one.
        if (!(err && err.reason === 'cors' && result.proxyUrl && !opts.hires)) throw err;
        blob = await get(result.proxyUrl);
        via = 'proxy';
      }
      if (result.archive === 'zip') {
        const files = await unzip(await blob.arrayBuffer(), result.members || {}, max);
        if (!files.albedo) return { ok: false, reason: 'archive' };
        return { ok: true, albedo: files.albedo, height: files.height || null };
      }
      let height = null;
      if (typeof result.heightUrl === 'string' && result.heightUrl) {
        try { height = await get(result.heightUrl); } catch (_e) { height = null; }
      }
      return { ok: true, albedo: blob, height, via };
    } catch (err) {
      return { ok: false, reason: (err && err.reason) || 'network' };
    } finally {
      t.done();
    }
  };

  const providers = () => (conf().PROVIDERS || []).filter((p) => p && p.enabled !== false);
  const canUnzip = () => typeof G.DecompressionStream === 'function';

  Vectura.PaperTextureSearch = {
    search, download, normalise, unzip, getPath, clearCache: () => { clearCache(); bundleIndex = null; }, providers,
    getKey, setKey, isUsable, canUnzip, scaleGuess, stripHtml,
  };
})();
