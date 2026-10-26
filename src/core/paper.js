/**
 * Paper model (paper selector) — window.Vectura.Paper.
 *
 * Pure helpers around the project paper config
 *   { type, color: '#rrggbb', texture: 0..1, bleed: 0..1, seed: int }
 * plus the single writer of SETTINGS.paper (setActive), which also mirrors the
 * colour into the legacy SETTINGS.bgColor so every older reader (export modal
 * preview, animated-SVG background, old builds opening new files) keeps working.
 *
 * Precedence when a project is opened/restored (resolveProjectPaper):
 *   state.paper  >  legacy state.bgColor (as a plain 'none' sheet)
 *                >  the user's default paper  >  built-in default.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const catalogue = () => Vectura.PAPERS || { TYPES: { none: { color: null } }, ORDER: ['none'], DEFAULT: { type: 'none', color: null, texture: 0.6, bleed: 0.5, seed: 1 }, LIMITS: { seedMax: 0x7fffffff } };
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

  const themeDocumentBg = () => {
    const S = settings();
    const theme = Vectura.THEMES && Vectura.THEMES[S.uiTheme];
    return toHex6(theme && theme.documentBg) || '#121214';
  };

  const hasType = (type) => typeof type === 'string'
    && Object.prototype.hasOwnProperty.call(catalogue().TYPES, type);

  const typeInfo = (type) => catalogue().TYPES[hasType(type) ? type : 'none'] || {};

  // A type's stock colour; 'none' has no colour of its own and follows the theme.
  const baseColorFor = (type) => toHex6(typeInfo(type).color) || themeDocumentBg();

  /**
   * Clamp/validate an untrusted paper config. Unknown type -> 'none'. A colour
   * that is not a strict hex (e.g. a CSS-injection string) falls back to
   * opts.fallbackColor, then the type's stock colour.
   */
  const normalize = (cfg, opts = {}) => {
    const src = cfg && typeof cfg === 'object' ? cfg : {};
    const { DEFAULT, LIMITS } = catalogue();
    const type = hasType(src.type) ? src.type : 'none';
    const color = toHex6(src.color) || toHex6(opts.fallbackColor) || baseColorFor(type);
    const seedRaw = Number(src.seed);
    const seedMax = (LIMITS && LIMITS.seedMax) || 0x7fffffff;
    const seed = Number.isFinite(seedRaw) && seedRaw >= 1
      ? Math.min(seedMax, Math.floor(seedRaw))
      : (DEFAULT.seed || 1);
    return {
      type,
      color,
      texture: clamp01(src.texture, DEFAULT.texture),
      bleed: clamp01(src.bleed, DEFAULT.bleed),
      seed,
    };
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
      seed: prev ? prev.seed : undefined,
    });
  };

  const resolveProjectPaper = (state, userDefault) => {
    const s = state && typeof state === 'object' ? state : {};
    if (s.paper && typeof s.paper === 'object') {
      return normalize(s.paper, { fallbackColor: s.bgColor });
    }
    if (isHexColor(s.bgColor)) return fromLegacyBg(s.bgColor);
    if (userDefault && typeof userDefault === 'object') return normalize(userDefault);
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
    return na.type === nb.type && na.color === nb.color
      && r(na.texture) === r(nb.texture) && r(na.bleed) === r(nb.bleed);
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
    const next = normalize(cfg);
    S.paper = next;
    S.bgColor = next.color;
    if (render && app && typeof app.render === 'function') app.render();
    try {
      if (typeof G.dispatchEvent === 'function' && typeof G.CustomEvent === 'function') {
        G.dispatchEvent(new G.CustomEvent('vectura:paper-change', { detail: { paper: { ...next } } }));
      }
    } catch (_e) { /* never block a paper write on a notify failure */ }
    return next;
  };

  // Theme sync rule: a theme change may recolour the paper only when the user
  // has no default paper and the project sheet is plain ('none').
  const themeMaySync = () => {
    const S = settings();
    if (S.paperDefault) return false;
    const p = S.paper;
    return !p || p.type === 'none' || !hasType(p.type);
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
  const saveDefault = (cfg) => {
    const ls = storage();
    if (!ls) return;
    try {
      ls.setItem(storageKey(), cfg && typeof cfg === 'object' ? JSON.stringify(normalize(cfg)) : 'null');
    } catch (_e) { /* quota / disabled */ }
  };

  const removeDefault = () => {
    const ls = storage();
    if (!ls) return;
    try { ls.removeItem(storageKey()); } catch (_e) { /* disabled */ }
  };

  Vectura.Paper = {
    loadDefault,
    saveDefault,
    removeDefault,
    isHexColor,
    toHex6,
    themeDocumentBg,
    baseColorFor,
    normalize,
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
