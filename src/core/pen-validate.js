/**
 * Pen-record validator — sanitizes pen entries restored from untrusted
 * sources (.vectura project files) before they land in SETTINGS.pens.
 *
 * SETTINGS.pens is rendered into innerHTML by several panels; we must not
 * allow XSS payloads to survive an import. The validator enforces:
 *   - id:    non-empty safe identifier (A-Z, a-z, 0-9, _, -), ≤ LIMITS.penIdMaxLen (64)
 *   - color: must be a hex color (#rgb, #rgba, #rrggbb, #rrggbbaa)
 *   - width: must be a finite number, clamped to [0, 100]
 *   - name:  coerced to a string; left untouched (escapeHtml handles render)
 *
 * Pen models (src/config/pen-models.js) add optional fields, each kept only
 * when valid so a plain pen comes back with exactly its old keys:
 *   - model:  /^[a-z0-9-]+$/, ≤ LIMITS.modelIdMaxLen (48) (an id this build doesn't know is KEPT, for
 *             round-trip, and renders as a plain pen)
 *   - size:   string ≤ LIMITS.sizeMaxLen (48) chars, control characters stripped
 *   - effect: one of PEN_MODELS.EFFECTS
 *   - color2: hex colour
 *   - ink:    only PEN_MODELS.INK_KEYS, finite numbers clamped to
 *             PARAM_LIMITS, on a null-prototype object (no __proto__ games);
 *             dropped when empty
 *
 * Public API: window.Vectura.PenValidate.validatePens(arr) -> array<pen>
 *
 * Invalid entries are dropped. Callers should fall back to defaults if the
 * returned array is empty.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const ID_RE = /^[A-Za-z0-9_-]+$/;
  // Allow only canonical CSS hex colors: #rgb, #rgba, #rrggbb, #rrggbbaa.
  // 5-/7-char hex are invalid and would not match a real color picker output.
  const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

  const isHexColor = (value) => typeof value === 'string' && HEX_RE.test(value);
  const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

  // Length caps come from PEN_MODELS.LIMITS (fallbacks when standalone).
  const lim = (key, d) => {
    const L = Vectura.PEN_MODELS && Vectura.PEN_MODELS.LIMITS;
    return L && Number.isFinite(L[key]) ? L[key] : d;
  };
  const MODEL_RE = /^[a-z0-9-]+$/;
  // Fallback effect list when the catalogue is absent (standalone loads).
  const FALLBACK_EFFECTS = ['metallic', 'dual-metallic', 'fluorescent', 'glow', 'glitter', 'white'];
  const catalogue = () => Vectura.PEN_MODELS || null;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  // Validate the optional pen-model fields onto `out` (mutates, returns out).
  const validateModelFields = (pen, out) => {
    const C = catalogue();
    if (typeof pen.model === 'string' && pen.model.length <= lim('modelIdMaxLen', 48) && MODEL_RE.test(pen.model) && pen.model !== 'plain') out.model = pen.model;
    if (out.model && typeof pen.size === 'string') {
      // eslint-disable-next-line no-control-regex
      const size = pen.size.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, lim('sizeMaxLen', 48)).trim();
      if (size) out.size = size;
    }
    const effects = (C && Array.isArray(C.EFFECTS)) ? C.EFFECTS : FALLBACK_EFFECTS;
    if (typeof pen.effect === 'string' && effects.includes(pen.effect)) out.effect = pen.effect;
    if (isHexColor(pen.color2)) out.color2 = pen.color2;
    const ink = pen.ink;
    if (ink && typeof ink === 'object' && !Array.isArray(ink) && C && C.PARAM_LIMITS) {
      const clean = Object.create(null);
      let n = 0;
      (C.INK_KEYS || Object.keys(C.PARAM_LIMITS)).forEach((key) => {
        const lim = C.PARAM_LIMITS[key];
        if (!lim || !own(ink, key)) return;
        let v = ink[key];
        if (typeof v === 'string' && v.trim() !== '') v = Number(v);
        if (!isFiniteNumber(v)) return;
        clean[key] = Math.max(lim[0], Math.min(lim[1], v));
        n += 1;
      });
      if (n) out.ink = clean;
    }
    return out;
  };

  const validatePen = (pen) => {
    if (!pen || typeof pen !== 'object') return null;
    const id = `${pen.id ?? ''}`;
    if (!id || id.length > lim('penIdMaxLen', 64) || !ID_RE.test(id)) return null;
    if (!isHexColor(pen.color)) return null;
    let width = pen.width;
    if (typeof width === 'string') {
      const parsed = Number(width);
      width = Number.isFinite(parsed) ? parsed : NaN;
    }
    if (!isFiniteNumber(width)) return null;
    // Defensive clamp — pen widths above ~10mm are nonsensical and a runaway
    // value should never propagate.
    if (width < 0) width = 0;
    if (width > 100) width = 100;
    const name = typeof pen.name === 'string' ? pen.name : `${pen.name ?? id}`;
    const out = { id, name, color: pen.color, width };
    if (typeof pen.lineCap === 'string' && /^[A-Za-z]+$/.test(pen.lineCap)) {
      out.lineCap = pen.lineCap;
    }
    // Paper selector: true while Pen 1's colour is still theme/paper managed.
    if (typeof pen.themeManaged === 'boolean') out.themeManaged = pen.themeManaged;
    return validateModelFields(pen, out);
  };

  // Effective-pen resolution — the SINGLE rule that decides which pen a path
  // actually plots with, shared by the SVG export (ui-file-io.js) and the
  // engine's per-pen grouping / dedup / computeStats. A path's own
  // `meta.penId` wins, but ONLY if it is a real pen in the current set; a
  // stale/unknown penId falls back to the layer's pen (again only if it is in
  // the set), and finally to the synthetic 'default' bucket. `penSet` is any
  // object with a `.has(id)` membership test (a Map keyed by id, or a Set of
  // ids). Keeping export and engine on this one function stops the stats /
  // preview from ever counting a path under a phantom pen the export coerces
  // away.
  const resolveEffectivePenId = (pathMeta, layerPenId, penSet) => {
    const has = (id) => !!id && !!penSet && typeof penSet.has === 'function' && penSet.has(id);
    const metaPen = pathMeta && pathMeta.penId;
    if (has(metaPen)) return metaPen;
    if (has(layerPenId)) return layerPenId;
    return 'default';
  };

  const validatePens = (input) => {
    if (!Array.isArray(input)) return [];
    const seen = new Set();
    const out = [];
    for (let i = 0; i < input.length; i += 1) {
      const pen = validatePen(input[i]);
      if (!pen) continue;
      if (seen.has(pen.id)) continue;
      seen.add(pen.id);
      out.push(pen);
    }
    return out;
  };

  Vectura.PenValidate = { validatePens, validatePen, validateModelFields, resolveEffectivePenId };
})();
