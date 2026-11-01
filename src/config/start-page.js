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

  // Cover type (the big Name in Ink / Specimen word). The typefaces on offer, the size range and the GLOBAL defaults.
  // Admin: set the defaults for everyone either here, or by defining `window.Vectura.START_PAGE_ADMIN = { coverFont, coverScale,
  // lockCoverType }` in a script that loads before this file (so a deployment can change them without editing source).
  // A user's own choice (Start Page settings > Cover > Typeface / Size) is saved with their preferences and wins, unless
  // `lockCoverType` is true: then the admin values apply to everyone and the controls are disabled. A user who picks the
  // global default again is stored as "no choice", so later admin changes reach them too.
  const COVER_FONTS = Object.freeze([
    Object.freeze({ id: 'grotesk', name: 'Space Grotesk', css: '"Space Grotesk", system-ui, sans-serif', weight: 700, kern: true }),
    Object.freeze({ id: 'mono', name: 'JetBrains Mono', css: '"JetBrains Mono", ui-monospace, monospace', weight: 700, kern: false }),
    Object.freeze({ id: 'sans', name: 'System sans', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weight: 700, kern: false }),
    Object.freeze({ id: 'serif', name: 'Serif', css: 'Georgia, "Times New Roman", serif', weight: 700, kern: false }),
  ]);
  const COVER_SCALE = Object.freeze({ min: 50, max: 100, step: 5 }); // % of the size that fits the column (100 = as large as fits)
  const fontId = (v, fallback) => (COVER_FONTS.some((f) => f.id === v) ? v : fallback);
  const scaleOf = (v, fallback) => {
    if (v === null || v === '' || !Number.isFinite(+v)) return fallback;
    const s = Math.round(Math.max(COVER_SCALE.min, Math.min(COVER_SCALE.max, +v)) / COVER_SCALE.step) * COVER_SCALE.step;
    return s;
  };
  const ADMIN_IN = (Vectura.START_PAGE_ADMIN && typeof Vectura.START_PAGE_ADMIN === 'object') ? Vectura.START_PAGE_ADMIN : {};
  const ADMIN = Object.freeze({
    coverFont: fontId(ADMIN_IN.coverFont, 'grotesk'),
    coverScale: scaleOf(ADMIN_IN.coverScale, 100),
    lockCoverType: ADMIN_IN.lockCoverType === true,
  });

  const DEFAULTS = Object.freeze({
    showOnLaunch: true,
    coverStyle: 'mosaic',
    coverFont: ADMIN.coverFont,
    coverScale: ADMIN.coverScale,
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
    // Per-slot cover choices set in Start Page settings. coverArt: a piece id per style ('' = automatic; mosaic is per
    // letter). coverColors: a stored colorway per slot (null = follow the page colorway).
    coverArt: Object.freeze({ mosaic: Object.freeze([]), word: '', band: '' }),
    coverColors: Object.freeze({ mosaic: Object.freeze([]), word: null, band: null }),
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

  // What counts as a genuine click that opens art (StartPageDom.onOpenClick). Anything past these is a drag (orbit,
  // pan) or a long press, and the click the browser fires on release is swallowed. 350 ms sits under the ~500 ms OS
  // long-press and above a deliberate click (typically 80-250 ms); touch gets a looser radius for finger wobble.
  const CLICK = Object.freeze({ maxMovePx: 5, maxMoveTouchPx: 10, maxPressMs: 350, clickGapMs: 700 });

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

  // Identity text allows letters, numbers, punctuation and symbols (e.g. "Line + Design"). Only control/format
  // characters and angle brackets (markup) are dropped; the text is always rendered via textContent.
  const DISALLOWED_TEXT = /[\p{C}<>]/gu;
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
  const SLOTS_MAX = 40;
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  const KEY_RE = /^[\w:.\-|#]{1,80}$/;
  const artId = (v) => (typeof v === 'string' && ID_RE.test(v) ? v : '');
  const trimTail = (list, empty) => { const out = list.slice(); while (out.length && out[out.length - 1] === empty) out.pop(); return out; };
  const colorway = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    if (![v.paper, v.ink].every((c) => typeof c === 'string' && HEX_RE.test(c))) return null;
    const ink = v.ink.toLowerCase();
    const textInk = typeof v.textInk === 'string' && HEX_RE.test(v.textInk) ? v.textInk.toLowerCase() : ink;
    return {
      key: typeof v.key === 'string' && KEY_RE.test(v.key) ? v.key : 'custom',
      paper: v.paper.toLowerCase(),
      ink,
      ink2: typeof v.ink2 === 'string' && HEX_RE.test(v.ink2) ? v.ink2.toLowerCase() : null,
      textInk,
      paperName: text(v.paperName, 60, ''),
      penName: text(v.penName, 60, ''),
    };
  };
  const objectOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const coverArt = (v) => {
    const o = objectOf(v);
    return { mosaic: trimTail((Array.isArray(o.mosaic) ? o.mosaic : []).slice(0, SLOTS_MAX).map(artId), ''), word: artId(o.word), band: artId(o.band) };
  };
  const coverColors = (v) => {
    const o = objectOf(v);
    return { mosaic: trimTail((Array.isArray(o.mosaic) ? o.mosaic : []).slice(0, SLOTS_MAX).map(colorway), null), word: colorway(o.word), band: colorway(o.band) };
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
      coverFont: fontId(pick('coverFont'), DEFAULTS.coverFont),
      coverScale: scaleOf(pick('coverScale'), DEFAULTS.coverScale),
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
      coverArt: coverArt(pick('coverArt')),
      coverColors: coverColors(pick('coverColors')),
    };
  };

  // The type the cover sets for a preference object: { id, css, weight, kern, scale (percent) }. The admin lock wins.
  const coverType = (prefs) => {
    const p = prefs && typeof prefs === 'object' ? prefs : {};
    const id = ADMIN.lockCoverType ? ADMIN.coverFont : fontId(p.coverFont, ADMIN.coverFont);
    const scale = ADMIN.lockCoverType ? ADMIN.coverScale : scaleOf(p.coverScale, ADMIN.coverScale);
    return Object.assign({}, COVER_FONTS.find((f) => f.id === id), { scale });
  };

  Vectura.START_PAGE = Object.freeze({ DEFAULTS, ENUMS, LIMITS, CLICK, SHORTCUTS, COVER_FONTS, COVER_SCALE, ADMIN, coverType, sanitize });
})();
