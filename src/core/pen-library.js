/**
 * Pen files + "My pens" — window.Vectura.PenLibrary.
 *
 * Pen file format (export / import, and the My pens localStorage shape):
 *   { schema: 'vectura-pens', version: 1, appVersion: '1.4.32',
 *     pens: [ { name, color, width, lineCap?, model?, size?, effect?,
 *               color2?, ink?: { wetness, roughness, opacity, blobs, skips,
 *                                jitter, effectStrength, flakeDensity } } ] }
 * File pens carry no document id; My pens entries carry a library id
 * ('mypen-xxxxxxx'). Every field is re-validated on the way in
 * (Vectura.PenValidate: hex colours, finite clamped widths, model id
 * pattern, effect enum, whitelisted + clamped ink keys on a null-prototype
 * object); names are control-stripped plain text, always rendered escaped.
 *
 *   toFilePen(pen)            -> whitelisted file record | null
 *   exportDoc(pens)           -> { schema, version, appVersion, pens }
 *   exportText(pens, name?)   -> { ok, text, filename, count }
 *   parseImport(text, { existingIds }) -> { ok, pens:[document pens with NEW
 *                                ids], rejected } | { ok:false, reason }
 *       reason ∈ 'parse' | 'too-large' | 'schema' | 'version' | 'empty' | 'too-many'
 *   newPenId(taken)           -> 'pen-' + 7 [a-z0-9] not in `taken`
 *   applyEntry(pen, entry)    copy an entry's ink (colour, width, model,
 *                             size, effect, color2, ink, cap) onto a pen; keeps
 *                             the pen's id and name
 *   library()                 the My pens UserLibraryStore (key
 *                             PEN_MODELS.LIBRARY_KEY, ≤ FILE_LIMITS.libraryMax)
 * Caps: PEN_MODELS.FILE_LIMITS (256 KB, 64 pens per file, 128 My pens,
 * widths 0 < w ≤ 20 mm — a pen outside that is skipped and counted).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const C = () => Vectura.PEN_MODELS || {};
  const FL = () => C().FILE_LIMITS || { maxBytes: 256 * 1024, maxPens: 64, libraryMax: 128, libraryMaxBytes: 256 * 1024, nameMax: 48, fileStem: 'vectura-pens', libraryIdPrefix: 'mypen-' };
  const SCHEMA = () => C().SCHEMA || { id: 'vectura-pens', version: 1 };
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const cleanName = (v) => {
    const U = Vectura.UserLibraryStore;
    const max = FL().nameMax || 48;
    if (U && U.cleanName) return U.cleanName(typeof v === 'string' ? v : '', max);
    // eslint-disable-next-line no-control-regex
    return typeof v === 'string' ? v.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
  };
  const appVersion = () => String(Vectura.APP_VERSION || Vectura.VERSION || '');

  const FIELDS = ['lineCap', 'model', 'size', 'effect', 'color2'];

  // Whitelisted file record of a pen (document pen, file pen or library
  // entry). Null when the pen is not valid.
  const toFilePen = (pen) => {
    if (!pen || typeof pen !== 'object' || Array.isArray(pen)) return null;
    const PV = Vectura.PenValidate;
    if (!PV || !PV.validatePen) return null;
    const v = PV.validatePen({
      id: 'pen-file',
      name: typeof pen.name === 'string' ? pen.name : '',
      color: pen.color,
      width: pen.width,
      lineCap: pen.lineCap,
      model: pen.model,
      size: pen.size,
      effect: pen.effect,
      color2: pen.color2,
      ink: pen.ink,
    });
    if (!v) return null;
    // A pen file / library pen must be a real pen: 0 < width ≤ maxWidthMm
    // (the validator alone would clamp 1e308 to 100 mm).
    const raw = typeof pen.width === 'string' ? Number(pen.width) : pen.width;
    if (!(raw > 0) || raw > (FL().maxWidthMm || 20)) return null;
    const out = { name: cleanName(v.name) || 'Pen', color: v.color, width: v.width };
    FIELDS.forEach((k) => { if (own(v, k)) out[k] = v[k]; });
    if (v.ink) {
      const ink = {};
      Object.keys(v.ink).forEach((k) => { ink[k] = v.ink[k]; });
      out.ink = ink;
    }
    return out;
  };

  const exportDoc = (pens) => ({
    schema: SCHEMA().id,
    version: SCHEMA().version,
    appVersion: appVersion(),
    pens: (Array.isArray(pens) ? pens : []).map(toFilePen).filter(Boolean),
  });

  const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pen';

  const exportText = (pens, name = null) => {
    const doc = exportDoc(pens);
    if (!doc.pens.length) return { ok: false, reason: 'empty' };
    const stem = FL().fileStem || 'vectura-pens';
    try {
      return {
        ok: true,
        text: JSON.stringify(doc, null, 2),
        filename: name ? `${stem}-${slug(name)}.json` : `${stem}.json`,
        count: doc.pens.length,
      };
    } catch (_e) {
      return { ok: false, reason: 'invalid' };
    }
  };

  const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const newPenId = (taken = new Set()) => {
    const rnd = (G.crypto && typeof G.crypto.getRandomValues === 'function')
      ? () => { const a = new Uint32Array(1); G.crypto.getRandomValues(a); return a[0]; }
      : () => Math.floor(Math.random() * 0xffffffff);
    for (let i = 0; i < 1000; i += 1) {
      let s = 'pen-';
      for (let j = 0; j < 7; j += 1) s += ID_CHARS[rnd() % ID_CHARS.length];
      if (!taken.has(s)) return s;
    }
    return `pen-${Date.now().toString(36)}`;
  };

  // Parse an untrusted pen file into document pens (fresh ids, never an
  // existing one). Nothing here touches SETTINGS: the caller adds the pens
  // in one undo step.
  const parseImport = (text, opts = {}) => {
    const L = FL();
    if (typeof text !== 'string') return { ok: false, reason: 'parse' };
    if (text.length > (L.maxBytes || 256 * 1024)) return { ok: false, reason: 'too-large' };
    let doc = null;
    try { doc = JSON.parse(text); } catch (_e) { return { ok: false, reason: 'parse' }; }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, reason: 'schema' };
    if (doc.schema !== SCHEMA().id) return { ok: false, reason: 'schema' };
    const v = Number(doc.version);
    if (!Number.isFinite(v) || v < 1) return { ok: false, reason: 'schema' };
    if (Math.floor(v) > SCHEMA().version) return { ok: false, reason: 'version' };
    const incoming = Array.isArray(doc.pens) ? doc.pens : null;
    if (!incoming) return { ok: false, reason: 'schema' };
    if (!incoming.length) return { ok: false, reason: 'empty' };
    if (incoming.length > (L.maxPens || 64)) return { ok: false, reason: 'too-many' };
    const taken = new Set(Array.isArray(opts.existingIds) ? opts.existingIds : []);
    const pens = [];
    let rejected = 0;
    incoming.forEach((raw) => {
      const p = toFilePen(raw);
      if (!p) { rejected += 1; return; }
      const id = newPenId(taken);
      taken.add(id);
      pens.push({ id, ...p, themeManaged: false });
    });
    if (!pens.length) return { ok: false, reason: 'empty', rejected };
    return { ok: true, pens, rejected };
  };

  // Copy an entry's ink onto a document pen (id and name stay).
  const applyEntry = (pen, entry) => {
    const rec = toFilePen(entry);
    if (!pen || !rec) return false;
    pen.color = rec.color;
    pen.width = rec.width;
    FIELDS.concat(['ink']).forEach((k) => {
      if (own(rec, k)) pen[k] = rec[k];
      else delete pen[k];
    });
    pen.themeManaged = false;
    return true;
  };

  let store = null;
  const library = () => {
    if (store) return store;
    const U = Vectura.UserLibraryStore;
    if (!U || !U.create) return null;
    const L = FL();
    store = U.create({
      key: C().LIBRARY_KEY || 'vectura.penLibrary',
      schema: SCHEMA().id,
      version: SCHEMA().version,
      itemsKey: 'pens',
      validate: toFilePen,
      max: L.libraryMax || 128,
      maxBytes: L.libraryMaxBytes || 256 * 1024,
      idPrefix: L.libraryIdPrefix || 'mypen-',
      nameMax: L.nameMax || 48,
      fileStem: L.fileStem || 'vectura-pens',
      appVersion,
    });
    return store;
  };

  Vectura.PenLibrary = { toFilePen, exportDoc, exportText, parseImport, newPenId, applyEntry, library };
})();
