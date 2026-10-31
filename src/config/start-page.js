/**
 * Start Page configuration — window.Vectura.START_PAGE.
 *
 * Defaults, enums, limits and shortcut labels for the Start Page, plus
 * sanitize(), which turns any untrusted object (a saved preference snapshot,
 * an import) into a complete, valid `startPage` preference object.
 * Identity text (name, practice line, cover word) is a preference only and is
 * never written into .vectura files.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DEFAULTS = Object.freeze({
    showOnLaunch: true,
    coverStyle: 'mosaic',
    showName: false,
    showLine: false,
    motionStill: false,
    railCollapsed: false,
    visiblePlates: 5,
    showExamples: true, // example plates show beside (after) the user's own works; unchecked hides them
    animateIn: 'plot',
    hover: 'default',
    colorMode: 'curated',
    seed: null,
    coverWord: 'vectura',
    customWord: '',
    name: '',
    practiceLine: '',
    newPaper: 'A3',
    // "Use as cover": the chosen piece's id (colors follow the page mode), its framing and special fill kind.
    coverArtId: '',
    coverFrame: null,
    coverFill: '',
    communityNotify: false,
  });

  const ENUMS = Object.freeze({
    coverStyle: Object.freeze(['mosaic', 'word', 'band']),
    colorMode: Object.freeze(['curated', 'mono', 'basic', 'wildcard']),
    animateIn: Object.freeze(['plot', 'sweep', 'fade-up', 'ink-bleed', 'stroke-cascade', 'scan-lines', 'iris', 'none']),
    hover: Object.freeze([
      'default', 'none', 'retrigger', 'lift', 'glare', 'replot',
      'holo', 'ripple', 'stipple', 'breeze', 'gravity', 'current',
    ]),
    visiblePlates: Object.freeze([0, 1, 3, 5, 10, 15, 20, 'all']),
    coverWord: Object.freeze(['vectura', 'vectura-studio', 'last-name', 'first-last', 'studies', 'botanicals', 'experiments', 'custom']),
    newPaper: Object.freeze(['A4', 'A3', 'Letter', '9x12']),
  });

  const LIMITS = Object.freeze({
    recentsShown: 8,
    entriesMax: 48,
    docsMaxBytes: 40 * 1024 * 1024,
    textMax: Object.freeze({ name: 60, practiceLine: 120, customWord: 24 }),
  });

  const SHORTCUTS = Object.freeze({
    startPage: 'Shift+Cmd+H',
    newCanvas: 'Cmd+N',
    openRecent: 'Alt+Cmd+1..8',
  });

  // Letters/numbers (any script), space, and . , ' ’ - & ( ) / ·
  const DISALLOWED_TEXT = /[^\p{L}\p{N} .,'’\-&()/·]/gu;
  const SEED_RE = /^[A-Z0-9]{5}$/;

  const text = (value, max, fallback) => {
    if (typeof value !== 'string') return fallback;
    const cleaned = value.replace(DISALLOWED_TEXT, '').replace(/\s+/g, ' ').trim();
    return cleaned.slice(0, max).trim();
  };
  const ID_RE = /^[\w:#.\-]{1,80}$/;
  const FILL_RE = /^[a-z][a-z-]{0,31}$/;
  const num = (v, lo, hi) => (Number.isFinite(+v) && v !== null && v !== '' ? Math.max(lo, Math.min(hi, +v)) : null);
  const frame = (v) => {
    if (!v || typeof v !== 'object') return null;
    const z = num(v.z, 0.5, 4);
    const cx = num(v.cx, 0, 1); const cy = num(v.cy, 0, 1);
    const out = {};
    if (v.fit === 'cover' || v.fit === 'contain') out.fit = v.fit;
    if (z != null) out.z = Math.round(z * 1000) / 1000;
    if (cx != null && cy != null) { out.cx = Math.round(cx * 1000) / 1000; out.cy = Math.round(cy * 1000) / 1000; }
    return Object.keys(out).length ? out : null;
  };
  const oneOf = (list, value, fallback) => (list.includes(value) ? value : fallback);
  const bool = (value, fallback) => (value === undefined ? fallback : Boolean(value));

  const sanitize = (input) => {
    const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const has = (k) => Object.prototype.hasOwnProperty.call(src, k);
    const pick = (k) => (has(k) ? src[k] : undefined);

    let plates = pick('visiblePlates');
    if (typeof plates === 'string' && plates !== 'all' && plates.trim() !== '') plates = Number(plates);
    let seed = pick('seed');
    seed = typeof seed === 'string' ? seed.toUpperCase() : null;

    return {
      showOnLaunch: bool(pick('showOnLaunch'), DEFAULTS.showOnLaunch),
      coverStyle: oneOf(ENUMS.coverStyle, pick('coverStyle'), DEFAULTS.coverStyle),
      showName: bool(pick('showName'), DEFAULTS.showName),
      showLine: bool(pick('showLine'), DEFAULTS.showLine),
      motionStill: bool(pick('motionStill'), DEFAULTS.motionStill),
      railCollapsed: bool(pick('railCollapsed'), DEFAULTS.railCollapsed),
      visiblePlates: oneOf(ENUMS.visiblePlates, plates, DEFAULTS.visiblePlates),
      showExamples: bool(pick('showExamples'), DEFAULTS.showExamples),
      animateIn: oneOf(ENUMS.animateIn, pick('animateIn'), DEFAULTS.animateIn),
      hover: oneOf(ENUMS.hover, pick('hover'), DEFAULTS.hover),
      colorMode: oneOf(ENUMS.colorMode, pick('colorMode'), DEFAULTS.colorMode),
      seed: seed && SEED_RE.test(seed) ? seed : null,
      coverWord: oneOf(ENUMS.coverWord, pick('coverWord'), DEFAULTS.coverWord),
      customWord: text(pick('customWord'), LIMITS.textMax.customWord, DEFAULTS.customWord),
      name: text(pick('name'), LIMITS.textMax.name, DEFAULTS.name),
      practiceLine: text(pick('practiceLine'), LIMITS.textMax.practiceLine, DEFAULTS.practiceLine),
      newPaper: oneOf(ENUMS.newPaper, pick('newPaper'), DEFAULTS.newPaper),
      coverArtId: typeof pick('coverArtId') === 'string' && ID_RE.test(pick('coverArtId')) ? pick('coverArtId') : DEFAULTS.coverArtId,
      coverFrame: frame(pick('coverFrame')),
      coverFill: typeof pick('coverFill') === 'string' && FILL_RE.test(pick('coverFill')) ? pick('coverFill') : DEFAULTS.coverFill,
      communityNotify: bool(pick('communityNotify'), DEFAULTS.communityNotify),
    };
  };

  Vectura.START_PAGE = Object.freeze({ DEFAULTS, ENUMS, LIMITS, SHORTCUTS, sanitize });
})();
