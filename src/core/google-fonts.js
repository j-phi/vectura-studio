/**
 * Web font catalog + outline loader for the Text algorithm.
 *
 * The built-in stroke font (window.Vectura.StrokeFont) ships five monoline
 * typefaces. This module unlocks the full public web-font catalog as an optional
 * source: the user can pick any one of ~2000 families and the Text algorithm
 * traces its glyph *outlines* into pen-ready polylines (an outline font is two
 * contours per stroke, not a single pass — honest to what the typeface is).
 *
 * Nothing here runs at load time. Everything is lazy and degrades silently when
 * the network, the DOM, or the parser are unavailable (headless tests, offline):
 *
 *   1. loadCatalog()  — fetch the family list once (CORS-friendly metadata API),
 *      cache it in memory + localStorage so reopening the picker is instant.
 *   2. ensureFont(id) — on first use of a family, lazy-load the outline parser,
 *      fetch that family's TTF, parse it, and register a FontFace so the picker
 *      can preview the real letterforms. Cached thereafter.
 *   3. layout(text, …) — turn a parsed family + string into positioned polylines
 *      in the same { paths, width, height } shape StrokeFont.layout returns, so
 *      the Text algorithm can swap sources without caring which kind it is.
 *
 * Coordinate space matches StrokeFont: millimetres, y increasing DOWNWARD, the
 * first line's cap-top near the origin. The parser already emits baseline-relative
 * y-down paths, so glyphs drop straight in.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  // ── Endpoints ───────────────────────────────────────────────────────────────
  // Catalog: a CORS-enabled metadata mirror of the public font library. Each entry
  // gives the slug we need for the file URL plus the family name and category.
  const CATALOG_URL = 'https://api.fontsource.org/v1/fonts';
  // Font files: the same mirror serves every family as a plain TTF (CORS-enabled,
  // parseable directly — no brotli/woff2 decode needed). Pattern is
  // <slug>@latest/<subset>-<weight>-<style>.ttf.
  const FILE_BASE = 'https://cdn.jsdelivr.net/fontsource/fonts';
  // Outline parser (vendored UMD); only injected when a family is first traced.
  const PARSER_SRC = './src/vendor/opentype.min.js';

  const CACHE_KEY = 'vectura.webfont.catalog.v1';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — names change rarely.
  const KEY_PREFIX = 'google:'; // p.font = 'google:<slug>' selects a web family.

  // Fontsource slugs in descending order of universal popularity (Google Fonts usage analytics).
  // Fonts not listed fall after these in alphabetical order.
  const POPULARITY_RANK = [
    'roboto', 'open-sans', 'lato', 'montserrat', 'oswald', 'source-sans-3',
    'poppins', 'inter', 'raleway', 'nunito', 'merriweather', 'pt-sans',
    'playfair-display', 'ubuntu', 'rubik', 'work-sans', 'mukta', 'noto-sans',
    'lora', 'cabin', 'josefin-sans', 'fira-sans', 'barlow', 'nunito-sans',
    'dancing-script', 'mulish', 'manrope', 'dm-sans', 'heebo', 'quicksand',
    'libre-baskerville', 'inconsolata', 'arimo', 'bitter', 'oxygen', 'lobster',
    'dosis', 'titillium-web', 'crimson-text', 'exo-2', 'pt-serif', 'teko',
    'noto-serif', 'karla', 'varela-round', 'arvo', 'exo', 'ibm-plex-sans',
    'anton', 'libre-franklin', 'be-vietnam-pro', 'jost', 'outfit', 'figtree',
    'hanken-grotesk', 'plus-jakarta-sans', 'space-grotesk', 'sora', 'urbanist',
    'lexend', 'public-sans', 'dm-serif-display', 'cormorant-garamond',
    'eb-garamond', 'source-serif-4', 'spectral', 'zilla-slab', 'rokkitt',
    'bricolage-grotesque', 'instrument-sans', 'instrument-serif', 'geist',
    'domine', 'frank-ruhl-libre', 'volkhov', 'neuton', 'gloock',
  ];

  // ── State ─────────────────────────────────────────────────────────────────
  let families = []; // [{ id, family, category, weights, subsets, defSubset }]
  let catalogStatus = 'idle'; // idle | loading | ready | error
  let catalogError = '';
  let catalogPromise = null;
  let libPromise = null;

  const fontStore = (Vectura.WEBFONT_GLYPHS = Vectura.WEBFONT_GLYPHS || {}); // slug → parsed font
  const fontState = {}; // slug → 'idle' | 'loading' | 'ready' | 'error'
  const fontPromise = {}; // slug → in-flight ensureFont promise
  let regenHook = null; // called after an async load lands, to re-render

  const isBrowser = () => typeof document !== 'undefined' && !!document;
  const canFetch = () => typeof fetch === 'function';

  // ── Catalog ───────────────────────────────────────────────────────────────
  const readCache = () => {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.families) || !parsed.savedAt) return null;
      if (Date.now() - parsed.savedAt > CACHE_TTL) return null;
      return parsed.families;
    } catch (_) {
      return null;
    }
  };

  const writeCache = (list) => {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), families: list }));
    } catch (_) {
      /* private mode / quota — caching is best-effort */
    }
  };

  // Normalise one raw catalog record into the slim shape the picker needs. Only
  // families that ship a Latin subset (what the stroke text is authored in) and a
  // usable weight are kept, so every listed family can actually be traced.
  const normalizeEntry = (raw) => {
    if (!raw || !raw.id || !raw.family) return null;
    const subsets = Array.isArray(raw.subsets) ? raw.subsets : [];
    const defSubset = raw.defSubset || (subsets.includes('latin') ? 'latin' : subsets[0]);
    if (!defSubset) return null;
    const weights = Array.isArray(raw.weights) && raw.weights.length ? raw.weights.slice() : [400];
    return {
      id: String(raw.id),
      family: String(raw.family),
      category: String(raw.category || 'other'),
      weights,
      subsets,
      defSubset,
    };
  };

  const loadCatalog = () => {
    if (catalogStatus === 'ready') return Promise.resolve(families);
    if (catalogPromise) return catalogPromise;

    const cached = readCache();
    if (cached && cached.length) {
      families = cached.slice().sort((a, b) => {
        const ai = POPULARITY_RANK.indexOf(a.id);
        const bi = POPULARITY_RANK.indexOf(b.id);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.family.localeCompare(b.family);
      });
      catalogStatus = 'ready';
      return Promise.resolve(families);
    }

    if (!canFetch()) {
      catalogStatus = 'error';
      catalogError = 'Web fonts need a network connection.';
      return Promise.resolve([]);
    }

    catalogStatus = 'loading';
    catalogError = '';
    catalogPromise = fetch(CATALOG_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Catalog request failed (${res.status}).`);
        return res.json();
      })
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        families = arr
          .filter((e) => !e.type || e.type === 'google')
          .map(normalizeEntry)
          .filter(Boolean)
          .sort((a, b) => {
            const ai = POPULARITY_RANK.indexOf(a.id);
            const bi = POPULARITY_RANK.indexOf(b.id);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            return a.family.localeCompare(b.family);
          });
        if (!families.length) throw new Error('Catalog was empty.');
        catalogStatus = 'ready';
        writeCache(families);
        return families;
      })
      .catch((err) => {
        catalogStatus = 'error';
        catalogError = (err && err.message) || 'Web fonts are unavailable.';
        families = [];
        return [];
      })
      .finally(() => {
        catalogPromise = null;
      });
    return catalogPromise;
  };

  const getFamilies = () => families;
  const findFamily = (id) => families.find((f) => f.id === id) || null;
  const getCatalogStatus = () => ({ status: catalogStatus, errorMessage: catalogError });

  // ── File URL ──────────────────────────────────────────────────────────────
  // Pick the weight closest to Regular (400) the family actually ships, so a
  // display face with only 700 still resolves to a real file.
  const pickWeight = (weights) => {
    if (!Array.isArray(weights) || !weights.length) return 400;
    return weights.reduce((best, w) => (Math.abs(w - 400) < Math.abs(best - 400) ? w : best), weights[0]);
  };

  const fileUrl = (entry, opts = {}) => {
    const weight = opts.weight || pickWeight(entry.weights);
    const subset = opts.subset || entry.defSubset || 'latin';
    const style = opts.style || 'normal';
    return `${FILE_BASE}/${entry.id}@latest/${subset}-${weight}-${style}.ttf`;
  };

  // ── Outline parser (lazy) ───────────────────────────────────────────────────
  const ensureLib = () => {
    if (typeof window !== 'undefined' && window.opentype) return Promise.resolve(window.opentype);
    if (libPromise) return libPromise;
    if (!isBrowser()) return Promise.reject(new Error('No DOM for the outline parser.'));
    libPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-vectura-opentype]');
      const onReady = () => (window.opentype ? resolve(window.opentype) : reject(new Error('Parser failed to load.')));
      if (existing) {
        if (window.opentype) return resolve(window.opentype);
        existing.addEventListener('load', onReady);
        existing.addEventListener('error', () => reject(new Error('Parser failed to load.')));
        return;
      }
      const script = document.createElement('script');
      script.src = PARSER_SRC;
      script.async = true;
      script.setAttribute('data-vectura-opentype', '');
      script.addEventListener('load', onReady);
      script.addEventListener('error', () => reject(new Error('Parser failed to load.')));
      document.head.appendChild(script);
    }).catch((err) => {
      libPromise = null;
      throw err;
    });
    return libPromise;
  };

  // Register a FontFace so the picker can preview the family in its own letters.
  // Best-effort and DOM-only; the trace path never depends on it.
  const registerPreviewFace = (entry, url) => {
    try {
      if (typeof FontFace !== 'function' || !document.fonts) return;
      const face = new FontFace(`Vectura WF ${entry.family}`, `url(${url})`);
      face.load().then((loaded) => document.fonts.add(loaded)).catch(() => {});
    } catch (_) {
      /* preview is optional */
    }
  };

  const getFontStatus = (id) => fontState[id] || 'idle';
  const getParsed = (id) => fontStore[id] || null;

  // Load + parse one family's outlines. Idempotent; the regen hook fires once the
  // outlines land so a layer that asked for the font (a fresh selection, or a
  // reloaded project) re-renders itself with the real letterforms.
  const ensureFont = (id) => {
    if (fontStore[id]) return Promise.resolve(fontStore[id]);
    if (fontPromise[id]) return fontPromise[id];

    fontState[id] = 'loading';
    fontPromise[id] = loadCatalog()
      .then(() => {
        const entry = findFamily(id);
        if (!entry) throw new Error(`Unknown font "${id}".`);
        if (!canFetch()) throw new Error('Web fonts need a network connection.');
        const url = fileUrl(entry);
        return Promise.all([ensureLib(), fetch(url).then((res) => {
          if (!res.ok) throw new Error(`Font request failed (${res.status}).`);
          return res.arrayBuffer();
        })]).then(([opentype, buffer]) => {
          const font = opentype.parse(buffer);
          fontStore[id] = font;
          fontState[id] = 'ready';
          registerPreviewFace(entry, url);
          if (typeof regenHook === 'function') {
            try { regenHook(id); } catch (_) { /* host re-render is best-effort */ }
          }
          return font;
        });
      })
      .catch((err) => {
        fontState[id] = 'error';
        throw err;
      })
      .finally(() => {
        fontPromise[id] = null;
      });
    return fontPromise[id];
  };

  // ── Outline flattening ──────────────────────────────────────────────────────
  // Walk a parsed glyph's draw commands into closed polylines, sampling quadratic
  // and cubic segments by recursive de Casteljau subdivision until each chord is
  // within `tolerance` of the true curve. Sharp corners (M/L joints) are preserved
  // exactly; only the curved spans gain points. Pure and dependency-free so it can
  // be unit-tested directly.
  const flattenCommands = (commands, tolerance = 0.05) => {
    const polylines = [];
    const tolSq = Math.max(1e-9, tolerance * tolerance);
    let sub = null;
    let startX = 0;
    let startY = 0;
    let cx = 0;
    let cy = 0;

    const finish = () => {
      if (sub && sub.length >= 2) polylines.push(sub);
      sub = null;
    };

    const cubic = (p0x, p0y, c1x, c1y, c2x, c2y, p1x, p1y, depth) => {
      const dx = p1x - p0x;
      const dy = p1y - p0y;
      const chordSq = dx * dx + dy * dy;
      if (depth >= 12 || chordSq < tolSq) {
        sub.push({ x: p1x, y: p1y });
        return;
      }
      const d1 = (c1x - p0x) * dy - (c1y - p0y) * dx;
      const d2 = (c2x - p0x) * dy - (c2y - p0y) * dx;
      const thresh = tolSq * chordSq;
      if (d1 * d1 <= thresh && d2 * d2 <= thresh) {
        sub.push({ x: p1x, y: p1y });
        return;
      }
      const m01x = (p0x + c1x) * 0.5, m01y = (p0y + c1y) * 0.5;
      const m12x = (c1x + c2x) * 0.5, m12y = (c1y + c2y) * 0.5;
      const m23x = (c2x + p1x) * 0.5, m23y = (c2y + p1y) * 0.5;
      const a012x = (m01x + m12x) * 0.5, a012y = (m01y + m12y) * 0.5;
      const a123x = (m12x + m23x) * 0.5, a123y = (m12y + m23y) * 0.5;
      const midx = (a012x + a123x) * 0.5, midy = (a012y + a123y) * 0.5;
      cubic(p0x, p0y, m01x, m01y, a012x, a012y, midx, midy, depth + 1);
      cubic(midx, midy, a123x, a123y, m23x, m23y, p1x, p1y, depth + 1);
    };

    for (const cmd of commands) {
      if (cmd.type === 'M') {
        finish();
        sub = [{ x: cmd.x, y: cmd.y }];
        startX = cx = cmd.x;
        startY = cy = cmd.y;
      } else if (cmd.type === 'L') {
        if (!sub) sub = [{ x: cx, y: cy }];
        sub.push({ x: cmd.x, y: cmd.y });
        cx = cmd.x; cy = cmd.y;
      } else if (cmd.type === 'Q') {
        if (!sub) sub = [{ x: cx, y: cy }];
        // Promote the quadratic to its equivalent cubic, then reuse the sampler.
        const c1x = cx + (2 / 3) * (cmd.x1 - cx);
        const c1y = cy + (2 / 3) * (cmd.y1 - cy);
        const c2x = cmd.x + (2 / 3) * (cmd.x1 - cmd.x);
        const c2y = cmd.y + (2 / 3) * (cmd.y1 - cmd.y);
        cubic(cx, cy, c1x, c1y, c2x, c2y, cmd.x, cmd.y, 0);
        cx = cmd.x; cy = cmd.y;
      } else if (cmd.type === 'C') {
        if (!sub) sub = [{ x: cx, y: cy }];
        cubic(cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, 0);
        cx = cmd.x; cy = cmd.y;
      } else if (cmd.type === 'Z') {
        if (sub) {
          sub.push({ x: startX, y: startY });
          cx = startX; cy = startY;
        }
        finish();
      }
    }
    finish();
    return polylines;
  };

  // ── Outline → bezier anchors ─────────────────────────────────────────────────
  const ANCHOR_EPS = 1e-4;

  // Convert a parsed glyph's draw commands into the engine's bezier `anchors`
  // representation: one array of {x, y, in, out} anchors per contour, where `in`
  // / `out` are ABSOLUTE cubic control points (null for a straight join). The
  // renderer (tracePath) and SVG export (pathToSvg) consume this directly to emit
  // native cubic `C` curves instead of flattened polylines. Quadratics are
  // promoted to cubics (matching flattenCommands). Every glyph contour is closed,
  // so the segment back to the start is implied by `meta.closed`; the duplicate
  // closing point that coincides with the start anchor is merged in (its `in`
  // handle preserved) rather than emitted twice. Pure + dependency-free.
  const commandsToAnchors = (commands) => {
    const contours = [];
    let cur = null;
    let prevX = 0;
    let prevY = 0;

    const ensure = () => {
      if (!cur) cur = [{ x: prevX, y: prevY, in: null, out: null }];
    };
    const finishContour = () => {
      if (cur && cur.length >= 2) {
        const first = cur[0];
        const last = cur[cur.length - 1];
        if (Math.abs(last.x - first.x) < ANCHOR_EPS && Math.abs(last.y - first.y) < ANCHOR_EPS) {
          if (last.in) first.in = last.in;
          cur.pop();
        }
      }
      if (cur && cur.length >= 2) contours.push(cur);
      cur = null;
    };

    for (const cmd of commands) {
      if (cmd.type === 'M') {
        finishContour();
        cur = [{ x: cmd.x, y: cmd.y, in: null, out: null }];
        prevX = cmd.x; prevY = cmd.y;
      } else if (cmd.type === 'L') {
        ensure();
        cur.push({ x: cmd.x, y: cmd.y, in: null, out: null });
        prevX = cmd.x; prevY = cmd.y;
      } else if (cmd.type === 'C') {
        ensure();
        cur[cur.length - 1].out = { x: cmd.x1, y: cmd.y1 };
        cur.push({ x: cmd.x, y: cmd.y, in: { x: cmd.x2, y: cmd.y2 }, out: null });
        prevX = cmd.x; prevY = cmd.y;
      } else if (cmd.type === 'Q') {
        ensure();
        const c1x = prevX + (2 / 3) * (cmd.x1 - prevX);
        const c1y = prevY + (2 / 3) * (cmd.y1 - prevY);
        const c2x = cmd.x + (2 / 3) * (cmd.x1 - cmd.x);
        const c2y = cmd.y + (2 / 3) * (cmd.y1 - cmd.y);
        cur[cur.length - 1].out = { x: c1x, y: c1y };
        cur.push({ x: cmd.x, y: cmd.y, in: { x: c2x, y: c2y }, out: null });
        prevX = cmd.x; prevY = cmd.y;
      } else if (cmd.type === 'Z') {
        finishContour();
      }
    }
    finishContour();
    return contours;
  };

  // Nudge near-cardinal bezier handles onto exact horizontal/vertical tangents.
  // High-quality outlines place on-curve points at extrema with axis-aligned
  // handles; real fonts mostly already do, so this is a light, distortion-free
  // cleanup — it only snaps a handle already within `tolDeg` of 0/90/180/270° to
  // that axis (handle length preserved). Aggressiveness scales with `smoothing`.
  const optimizeAnchorsCardinal = (anchors, opt = {}) => {
    if (!Array.isArray(anchors) || anchors.length < 2) return anchors;
    const smoothing = Math.max(0, Number(opt.smoothing) || 0);
    const tol = (Math.min(20, 4 + smoothing * 2) * Math.PI) / 180;
    const quarter = Math.PI / 2;
    const snap = (anchor, key) => {
      const h = anchor[key];
      if (!h) return;
      const dx = h.x - anchor.x;
      const dy = h.y - anchor.y;
      const len = Math.hypot(dx, dy);
      if (len < ANCHOR_EPS) return;
      const ang = Math.atan2(dy, dx);
      const cardinal = Math.round(ang / quarter) * quarter;
      if (Math.abs(ang - cardinal) <= tol) {
        anchor[key] = { x: anchor.x + Math.cos(cardinal) * len, y: anchor.y + Math.sin(cardinal) * len };
      }
    };
    anchors.forEach((a) => { snap(a, 'in'); snap(a, 'out'); });
    return anchors;
  };

  // ── Layout ──────────────────────────────────────────────────────────────────
  // Cap height in font units → the reference the user's "Size" maps to, matching
  // StrokeFont (whose CAP unit maps to size). Falls back to a typical 0.7em.
  const capHeightEm = (font) => {
    const os2 = font.tables && font.tables.os2;
    if (os2 && os2.sCapHeight) return os2.sCapHeight / font.unitsPerEm;
    if (font.ascender) return (font.ascender * 0.72) / font.unitsPerEm;
    return 0.7;
  };

  // x-height in em — the optical-midpoint reference for a strikethrough rule.
  // Falls back to a typical 0.72 of cap height when the OS/2 metric is absent.
  const xHeightEm = (font) => {
    const os2 = font.tables && font.tables.os2;
    if (os2 && os2.sxHeight) return os2.sxHeight / font.unitsPerEm;
    return capHeightEm(font) * 0.72;
  };
  // x-height as a fraction of cap height (cap height is what "size" maps to).
  const xHeightFrac = (font) => {
    const cap = capHeightEm(font);
    return cap > 0 ? xHeightEm(font) / cap : 0.5;
  };

  // Synthesis constants — mirror StrokeFont so smallCaps / super- / sub-script
  // read the same regardless of source.
  const SMALL_CAPS_SCALE = 0.78;
  const SUPSUB_SCALE = 0.62;
  const SUP_DY = -0.42; // fraction of size (cap height); y-up is negative
  const SUB_DY = 0.18;

  // ── Weighted faces ──────────────────────────────────────────────────────────
  // fontWeight maps a label to a numeric OS/2 weight; a weighted face is parsed
  // and cached under a composite key so layout() can swap to it when present. The
  // base ensureFont() always loads the family's nearest-Regular file, so a heavier
  // face only appears once the host explicitly requests it via loadWeight().
  const WEIGHT_BY_LABEL = { Regular: 400, Medium: 500, Semibold: 600, Bold: 700 };
  const weightNum = (label) => WEIGHT_BY_LABEL[label] || (Number(label) || 400);
  const weightKey = (id, weight) => `${id}::w${weight}`;

  const loadWeight = (id, label) => {
    const weight = weightNum(label);
    const key = weightKey(id, weight);
    if (fontStore[key]) return Promise.resolve(fontStore[key]);
    if (fontPromise[key]) return fontPromise[key];
    fontState[key] = 'loading';
    fontPromise[key] = loadCatalog()
      .then(() => {
        const entry = findFamily(id);
        if (!entry) throw new Error(`Unknown font "${id}".`);
        if (!canFetch()) throw new Error('Web fonts need a network connection.');
        // Snap the requested weight to the nearest the family actually ships.
        const avail = Array.isArray(entry.weights) && entry.weights.length ? entry.weights : [400];
        const snapped = avail.reduce((b, w) => (Math.abs(w - weight) < Math.abs(b - weight) ? w : b), avail[0]);
        const url = fileUrl(entry, { weight: snapped });
        return Promise.all([ensureLib(), fetch(url).then((res) => {
          if (!res.ok) throw new Error(`Font request failed (${res.status}).`);
          return res.arrayBuffer();
        })]).then(([opentype, buffer]) => {
          const font = opentype.parse(buffer);
          fontStore[key] = font;
          fontState[key] = 'ready';
          if (typeof regenHook === 'function') {
            try { regenHook(id); } catch (_) { /* host re-render is best-effort */ }
          }
          return font;
        });
      })
      .catch((err) => { fontState[key] = 'error'; throw err; })
      .finally(() => { fontPromise[key] = null; });
    return fontPromise[key];
  };

  // Build the opentype.js render-options feature map from the OT opts. IMPORTANT —
  // the vendored opentype.min.js (v1) only ever invokes lookupFeature({tag:'liga'})
  // for Latin word ranges (the Bidi shaper is hardcoded), so `liga` (standard
  // ligatures) is the ONLY GSUB feature it can actually apply to Latin text. Every
  // other tag below is registered honestly but is inert in this build; we pass them
  // so a future/heavier opentype build would shape them, and so the call never
  // misrepresents intent. `rlig` defaults on to match opentype's defaultRenderOptions.
  const buildFeatureMap = (opt) => {
    const has = (k) => Object.prototype.hasOwnProperty.call(opt, k);
    if (!has('otLigatures') && !has('otContextual') && !has('otDiscretionary') &&
        !has('otSwash') && !has('otStylistic') && !has('otFractions') &&
        !has('otFigures') && !has('otPosition')) {
      return null; // no OT opts set → use opentype's defaults (back-compat)
    }
    const map = { liga: opt.otLigatures !== false, rlig: true };
    if (opt.otContextual) map.calt = true;
    if (opt.otDiscretionary) map.dlig = true;
    if (opt.otSwash) map.swsh = true;
    if (opt.otStylistic) map.salt = true;
    if (opt.otFractions) map.frac = true;
    if (opt.otFigures === 'tabular') map.tnum = true;
    else if (opt.otFigures === 'oldstyle') map.onum = true;
    if (opt.otPosition === 'super') map.sups = true;
    else if (opt.otPosition === 'sub') map.subs = true;
    return map;
  };

  // Shape a line into glyphs, honouring the OT feature map where opentype supports
  // it. Never throws: a parser that rejects the options falls back to plain shaping.
  const shapeLine = (font, line, featureMap) => {
    if (featureMap) {
      try { return font.stringToGlyphs(line, { kerning: true, features: featureMap }); }
      catch (_) { /* fall through to default shaping */ }
    }
    return font.stringToGlyphs(line);
  };

  // Minimal dependency-free soft-wrap (mirrors StrokeFont.softWrap). Greedy,
  // language-agnostic; hyphenates an over-wide word at an arbitrary mid character.
  const softWrap = (lines, maxMM, advOf) => {
    if (!(maxMM > 0)) return lines;
    const spaceAdv = advOf(' ');
    const out = [];
    for (const line of lines) {
      if (line.trim().length === 0) { out.push(line); continue; }
      const words = line.split(/(\s+)/).filter((w) => w.length && w.trim().length);
      let cur = '', curW = 0;
      const wordW = (w) => Array.from(w).reduce((s, ch) => s + advOf(ch), 0);
      const flush = () => { if (cur.length) { out.push(cur); cur = ''; curW = 0; } };
      for (let w of words) {
        let ww = wordW(w);
        while (ww > maxMM && Array.from(w).length > 1) {
          flush();
          const chars = Array.from(w);
          let piece = '', pieceW = 0, k = 0;
          for (; k < chars.length - 1; k++) {
            const aw = advOf(chars[k]);
            if (pieceW + aw + advOf('-') > maxMM && piece.length) break;
            piece += chars[k]; pieceW += aw;
          }
          out.push(piece + '-');
          w = chars.slice(k).join(''); ww = wordW(w);
        }
        const add = (cur.length ? spaceAdv : 0) + ww;
        if (curW + add > maxMM && cur.length) { flush(); cur = w; curW = ww; }
        else { cur = cur.length ? cur + ' ' + w : w; curW += add; }
      }
      flush();
    }
    return out;
  };

  // Area-type word-wrap with EXACT raw sourceIndex tracking (mirrors
  // StrokeFont.areaWrap). Greedy line-fill by word: a soft break happens at the
  // last space that fits and that ONE space is consumed, so each visual line is a
  // CONTIGUOUS slice of the source — keeping `lineStart[li] + ci` an exact raw
  // index (used by on-canvas editing). A hard '\n' ends the line and is consumed.
  // A single word wider than the column OVERFLOWS (no synthetic hyphen, which is
  // absent from the source and would desync sourceIndex). Requires 1:1 char↔glyph
  // (ligatures off) — the state the editor puts a web layer in. Returns
  // { lines: string[], starts: number[] } where starts[i] is the raw code-point
  // index of lines[i]'s first character.
  const areaWrap = (text, maxMM, advOf) => {
    const chars = Array.from(String(text == null ? '' : text));
    const n = chars.length;
    const lines = [];
    const starts = [];
    let lineStart = 0;
    let i = 0;
    let width = 0;
    let lastSpace = -1;
    const emit = (endExclusive) => {
      lines.push(chars.slice(lineStart, endExclusive).join(''));
      starts.push(lineStart);
    };
    while (i < n) {
      const ch = chars[i];
      if (ch === '\n') { emit(i); lineStart = i + 1; i += 1; width = 0; lastSpace = -1; continue; }
      const adv = advOf(ch);
      if (width + adv > maxMM && i > lineStart && lastSpace > lineStart) {
        emit(lastSpace);
        lineStart = lastSpace + 1; i = lineStart; width = 0; lastSpace = -1;
        continue;
      }
      if (ch === ' ' || ch === '\t') lastSpace = i;
      width += adv;
      i += 1;
    }
    emit(n); // final line (also handles empty input → one empty line)
    return { lines, starts };
  };

  /**
   * Lay text out into positioned outline polylines.
   *
   * @param {string} text  supports '\n' line breaks.
   * @param {object} opt   base: { id, size, tracking, lineHeight, align, bezier, smoothing }
   *   size       cap height in mm (default 14, matching StrokeFont)
   *   tracking   extra letter spacing in mm (default 0)
   *   lineHeight line advance as a multiple of size (default 1.4)
   *   align      'left'|'center'|'right'|'justify-left'|'justify-center'|
   *              'justify-right'|'justify-all' (default 'left')
   *
   *   New optional opts (each a no-op at its default → historical output unchanged):
   *     fontWeight  swaps to a parsed weighted face (loadWeight) when present, else
   *                 falls back to the base face.
   *     vScale/hScale  percent (100 = unchanged); scale the flattened contour coords
   *                    about the glyph baseline origin. hScale also scales advance.
   *     kernPairs   sparse per-pair kern map keyed by caret index (the gap
   *                 between char c-1 and char c) → extra advance for THAT gap
   *                 only, in mm. No global uniform kern.
   *     baselineShift  mm; raises the whole block.
   *     indentLeft/indentRight/indentFirst  mm; per-line / paragraph-head indents.
   *     spaceBefore/spaceAfter  mm; vertical gap before/after each paragraph.
   *     smallCaps/superscript/subscript  synthesized per-glyph (scale + reposition;
   *                 smallCaps shapes the uppercased character). These render as
   *                 polylines (no native bezier anchors) and shape per-character, so
   *                 ligatures/kerning within those runs are intentionally dropped.
   *     ot*         OpenType opts — applied via opentype.js where supported. In the
   *                 vendored build only `liga` (standard ligatures, toggled by
   *                 otLigatures) is actually shaped for Latin; all other features are
   *                 silently inert (see buildFeatureMap).
   *     hyphenate + wrapWidth  soft-wrap; only engages when hyphenate===true AND a
   *                 wrapWidth (mm column) is supplied. Without wrapWidth it is a
   *                 no-op. The break heuristic is greedy and dictionary-free.
   * @returns {{ paths, meta, width, height, cells, anchors? }} mm, y-down. `meta`
   *   runs parallel to `paths`: { glyphIndex, charIndex, lineIndex, baselineY,
   *   x0, x1 }. `cells` is dense over the source string (one per char incl.
   *   spaces): { sourceIndex, lineIndex, x0, x1, baselineY, advance, isSpace }.
   */
  const layout = (text, opt = {}) => {
    let font = getParsed(opt.id);
    // fontWeight: prefer a parsed weighted face if the host has loaded one.
    if (font && opt.fontWeight && weightNum(opt.fontWeight) !== 400) {
      const wf = getParsed(weightKey(opt.id, weightNum(opt.fontWeight)));
      if (wf) font = wf;
    }
    if (!font) return { paths: [], meta: [], width: 0, height: 0, cells: [] };

    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const size = Math.max(0.1, Number(opt.size) || 14);
    const emSize = size / capHeightEm(font); // mm per em so cap-height maps to size
    const fu = emSize / font.unitsPerEm; // font units → mm
    const tracking = Number(opt.tracking) || 0;
    // Per-pair kern (mm), keyed by caret index (the gap between char c-1 and
    // char c). kernAfter(s) is the kern applied AFTER the char at source index s
    // — i.e. the gap at caret index s+1. No global uniform kern.
    const kernPairs = (opt.kernPairs && typeof opt.kernPairs === 'object') ? opt.kernPairs : null;
    const kernAfter = (srcIdx) => {
      if (!kernPairs) return 0;
      const v = Number(kernPairs[srcIdx + 1]);
      return Number.isFinite(v) ? v : 0;
    };
    const lineHeight = (Number(opt.lineHeight) || 1.4) * size;
    const vScale = num(opt.vScale, 100) / 100;
    const hScale = num(opt.hScale, 100) / 100;
    const baselineShift = num(opt.baselineShift, 0); // mm
    const indentLeft = num(opt.indentLeft, 0);
    const indentRight = num(opt.indentRight, 0);
    const indentFirst = num(opt.indentFirst, 0);
    const spaceBefore = num(opt.spaceBefore, 0);
    const spaceAfter = num(opt.spaceAfter, 0);
    const wrapWidth = num(opt.wrapWidth, 0);
    const smallCaps = opt.smallCaps === true;
    const superscript = opt.superscript === true;
    const subscript = opt.subscript === true;
    const synth = smallCaps || superscript || subscript;

    const rawAlign = opt.align || 'left';
    const justify = typeof rawAlign === 'string' && rawAlign.indexOf('justify') === 0;
    const justifySuffix = justify ? (rawAlign.slice('justify-'.length) || 'left') : '';
    const baseAlign = justify
      ? (justifySuffix === 'all' ? 'left' : justifySuffix)
      : (rawAlign === 'center' || rawAlign === 'right' ? rawAlign : 'left');

    const wantBezier = opt.bezier === true && !synth;
    const smoothing = Math.max(0, Number(opt.smoothing) || 0);
    const tolerance = Math.max(1e-4, (emSize * 0.004) / (1 + smoothing));
    const featureMap = buildFeatureMap(opt);

    // Per-glyph synthesis scale/offset (smallCaps shapes the uppercased char).
    const charScale = () => {
      let cs = 1, dy = 0;
      if (superscript) { cs = SUPSUB_SCALE; dy = SUP_DY * size; }
      else if (subscript) { cs = SUPSUB_SCALE; dy = SUB_DY * size; }
      return { cs, dy };
    };

    let rawLines = String(text == null ? '' : text).split('\n');
    let areaStart = null; // per-visual-line raw char offsets when areaWrap is used
    if (wrapWidth > 0 && (opt.areaWrap === true || opt.hyphenate === true)) {
      // Advance estimate per char for wrapping (font kerning ignored — fast path).
      const advOf = (ch) => {
        const gs = font.stringToGlyphs(ch);
        const g = gs[0];
        const sc = synth ? charScale().cs : 1;
        return ((g && g.advanceWidth) || 0) * fu * hScale * sc + tracking;
      };
      const colMM = wrapWidth - indentLeft - indentRight;
      if (opt.areaWrap === true) {
        // AREA type: word-wrap with exact raw sourceIndex (editable, liga-off).
        const wrapped = areaWrap(String(text == null ? '' : text), colMM, advOf);
        rawLines = wrapped.lines;
        areaStart = wrapped.starts;
      } else {
        rawLines = softWrap(rawLines, colMM, advOf);
      }
    }

    // Build per-line glyph cells with measured advances. The default (non-synth)
    // path shapes the whole line so font kerning + ligatures stay intact.
    const lineCells = rawLines.map((line) => {
      if (synth) {
        // Per-character shaping with synthesis scale (uppercase for smallCaps).
        return Array.from(line).map((ch, ci) => {
          const drawCh = smallCaps && ch >= 'a' && ch <= 'z' ? ch.toUpperCase() : ch;
          const isSmall = smallCaps && ch >= 'a' && ch <= 'z';
          const { cs, dy } = charScale();
          const sc = cs * (isSmall ? SMALL_CAPS_SCALE : 1);
          const gs = font.stringToGlyphs(drawCh);
          const g = gs[0] || null;
          const adv = ((g && g.advanceWidth) || 0) * fu * hScale * sc + tracking;
          return { g, sc, dy, charIndex: ci, isSpace: ch === ' ', adv };
        });
      }
      const glyphs = shapeLine(font, line, featureMap);
      return glyphs.map((g, i) => {
        let adv = (g.advanceWidth || 0) * fu * hScale;
        if (i < glyphs.length - 1) adv += (font.getKerningValue(g, glyphs[i + 1]) || 0) * fu;
        adv += tracking;
        const u = g.unicode != null ? g.unicode : (g.unicodes && g.unicodes[0]);
        return { g, sc: 1, dy: 0, charIndex: i, isSpace: u === 32, adv };
      });
    });
    // Per-character cell source offsets (M1 seam). `cells` runs dense over the
    // RAW input string; sourceIndex accounts for the '\n' between lines. NOTE:
    // ligature shaping can fold multiple source chars into one glyph cell, so on
    // ligated runs sourceIndex is the per-line glyph index rather than a precise
    // source offset — exact for 1:1 (non-ligated) text, which is the common case.
    // Computed here so per-pair kern folds into advances before measurement.
    const lineStart = [];
    {
      let accIdx = 0;
      for (let i = 0; i < lineCells.length; i++) {
        // AREA type carries EXACT raw offsets (contiguous slices, ligatures off);
        // otherwise fall back to the cumulative per-glyph offset (exact for 1:1
        // non-ligated text, the common case).
        lineStart[i] = areaStart ? areaStart[i] : accIdx;
        accIdx += lineCells[i].length + 1; // +1 for the consumed newline
      }
    }
    // Fold each glyph's per-pair kern (toward the next glyph on its line) into its
    // advance, so width, alignment slack and pen positioning stay consistent.
    lineCells.forEach((cells, li) => {
      for (let ci = 0; ci < cells.length - 1; ci++) cells[ci].adv += kernAfter(lineStart[li] + ci);
    });
    const lineWidth = (cells) => Math.max(0, cells.reduce((w, c) => w + c.adv, 0) - tracking);
    const widths = lineCells.map(lineWidth);
    const maxW = widths.reduce((m, w) => Math.max(m, w), 0);

    const blank = rawLines.map((l) => l.trim().length === 0);
    const firstOfPara = rawLines.map((_, i) => !blank[i] && (i === 0 || blank[i - 1]));
    const lastOfPara = rawLines.map((_, i) => !blank[i] && (i === rawLines.length - 1 || blank[i + 1]));
    const colWidth = wrapWidth > 0 ? wrapWidth : (maxW + indentLeft + indentRight);

    const paths = [];
    const meta = [];
    const cellOut = [];
    const anchors = wantBezier ? [] : null;
    let penY = 0;
    rawLines.forEach((line, li) => {
      if (firstOfPara[li]) penY += spaceBefore;
      const cells = lineCells[li];
      const lineW = widths[li];
      const avail = colWidth - indentLeft - indentRight - (firstOfPara[li] ? indentFirst : 0);
      const slack = Math.max(0, avail - lineW);
      const gaps = cells.filter((c) => c.isSpace).length;
      const doJustify = justify && gaps > 0 && slack > 1e-6 &&
        (justifySuffix === 'all' || !lastOfPara[li]);
      const perGap = doJustify ? slack / gaps : 0;
      const alignOffset = doJustify ? 0
        : baseAlign === 'center' ? slack / 2
        : baseAlign === 'right' ? slack : 0;

      let penX = indentLeft + (firstOfPara[li] ? indentFirst : 0) + alignOffset;
      const baselineY = li * lineHeight + size; // cap-top of line 0 sits near y=0
      // Empty line (a bare '\n') gets a zero-width caret anchor at the line start
      // so the editor can blink a caret on the new line and grow the text box the
      // instant Enter is pressed. Skipped for a lone empty line so a brand-new box
      // keeps its origin-anchored caret fallback (mirrors StrokeFont.layout).
      if (cells.length === 0 && rawLines.length > 1) {
        cellOut.push({
          sourceIndex: lineStart[li],
          lineIndex: li,
          x0: penX,
          x1: penX,
          baselineY: baselineY - baselineShift,
          advance: 0,
          isSpace: true,
          caretAnchor: true,
        });
      }
      cells.forEach((cell, ci) => {
        const { g, sc, dy } = cell;
        const x0 = penX;
        if (g && typeof g.getPath === 'function' && (g.advanceWidth || g.path)) {
          const gp = g.getPath(penX, baselineY, emSize, undefined, font);
          if (gp && gp.commands && gp.commands.length) {
            const polylines = flattenCommands(gp.commands, tolerance);
            const contours = wantBezier ? commandsToAnchors(gp.commands) : null;
            const aligned = wantBezier && contours && contours.length === polylines.length;
            // Transform a point about the glyph baseline origin (penX, baselineY):
            // scale, then raise the whole block by baselineShift.
            const tx = (px, py) => ({
              x: penX + (px - penX) * hScale * sc,
              y: baselineY + (py - baselineY) * vScale * sc + dy - baselineShift,
            });
            for (let ci = 0; ci < polylines.length; ci++) {
              const poly = polylines[ci].map((pt) => tx(pt.x, pt.y));
              if (poly.length < 2) continue;
              paths.push(poly);
              meta.push({
                glyphIndex: cell.charIndex,
                charIndex: cell.charIndex,
                lineIndex: li,
                baselineY: baselineY - baselineShift,
                x0,
                x1: penX + cell.adv,
              });
              if (wantBezier) {
                let a = aligned ? contours[ci] : null;
                // Minimal-anchor re-trace (Illustrator "Create Outlines" parity):
                // native TrueType/quadratic outlines carry ~2–3× the on-curve points
                // a cubic shape needs (each quad is its own segment; smooth joins are
                // split across zero-length seams). reduceAnchors fuses the seams and
                // fits the FEWEST cubics per corner→corner run, tagging real corners —
                // so the glyph traces to a clean, minimal, Illustrator-like anchor set
                // (one node per quad becomes a handful). The fit tolerance is the same
                // chord tolerance the coarse polyline uses, so the re-trace stays at
                // least as faithful to the true edge as the coarse contour (render,
                // fill and node-edit all share this one outline).
                const GU = Vectura.GeometryUtils;
                if (a && GU && typeof GU.reduceAnchors === 'function') {
                  a = GU.reduceAnchors(a, true, { tolerance: tolerance * 0.6, cornerAngleDeg: 30 });
                }
                if (a) a = optimizeAnchorsCardinal(a, { smoothing });
                anchors.push(a ? a.map((an) => ({
                  ...tx(an.x, an.y),
                  in: an.in ? tx(an.in.x, an.in.y) : null,
                  out: an.out ? tx(an.out.x, an.out.y) : null,
                  corner: an.corner === true,
                })) : null);
              }
            }
          }
        }
        // Per-pair kern is already folded into cell.adv above.
        const eff = cell.adv + (cell.isSpace ? perGap : 0);
        cellOut.push({
          sourceIndex: lineStart[li] + ci,
          lineIndex: li,
          x0,
          x1: penX + eff,
          baselineY: baselineY - baselineShift,
          advance: eff,
          isSpace: cell.isSpace === true,
        });
        penX += eff;
      });
      penY += lineHeight;
      if (lastOfPara[li]) penY += spaceAfter;
    });

    const height = Math.max(0, penY - lineHeight) + size * 1.35;
    const out = { paths, meta, width: colWidth, height, cells: cellOut, xHeightFrac: xHeightFrac(font) };
    if (wantBezier) out.anchors = anchors;
    // The layout-space chord tolerance used to flatten the coarse `paths`. The Type
    // algorithm scales it to display units to size its winding-canonicalization
    // epsilon when a glyph falls back to these coarse contours (no bézier anchors).
    out.flattenTol = tolerance;
    // mm per em (layout space) — the Type algorithm derives ABSOLUTE anchor-fit
    // scales from it when re-tracing welded overlap clusters.
    out.emSize = emSize;
    return out;
  };

  // ── Vendored (offline) families ───────────────────────────────────────────
  // Register a font family whose TTF is shipped locally in the repo, so the
  // DEFAULT Text layer can render real outlines in the browser with no network.
  // BROWSER-ONLY and SILENT-FAIL by design: in node/jsdom there is no usable
  // document/fetch and no opentype global, so this no-ops and getParsed stays
  // null → the Text algorithm falls back to the built-in stroke font (which is
  // what keeps the headless test baselines deterministic and unchanged).
  //
  // Idempotent: skips when the family is already parsed or in flight. Also seeds
  // a catalog entry so findFamily(id) resolves for the picker even before the
  // network catalog lands. Everything is wrapped so it can never throw at boot.
  const registerVendored = (id, family, url) => {
    try {
      if (!id || !url) return Promise.resolve(null);
      if (fontStore[id]) return Promise.resolve(fontStore[id]);
      if (fontPromise[id]) return fontPromise[id];
      if (!isBrowser() || !canFetch()) return Promise.resolve(null);

      // Seed a minimal catalog entry so the family is selectable/resolvable.
      if (!findFamily(id)) {
        families.push({
          id: String(id),
          family: String(family || id),
          category: 'sans-serif',
          weights: [400],
          subsets: ['latin'],
          defSubset: 'latin',
        });
      }
      const entry = findFamily(id);

      fontState[id] = 'loading';
      fontPromise[id] = Promise.all([
        ensureLib(),
        fetch(url).then((res) => {
          if (!res.ok) throw new Error(`Vendored font request failed (${res.status}).`);
          return res.arrayBuffer();
        }),
      ])
        .then(([opentype, buffer]) => {
          const font = opentype.parse(buffer);
          fontStore[id] = font;
          fontState[id] = 'ready';
          if (entry) registerPreviewFace(entry, url);
          if (typeof regenHook === 'function') {
            try { regenHook(id); } catch (_) { /* host re-render is best-effort */ }
          }
          return font;
        })
        .catch(() => {
          // Silent fail: leave the family unparsed so text falls back to sans.
          fontState[id] = 'error';
          return null;
        })
        .finally(() => {
          fontPromise[id] = null;
        });
      return fontPromise[id];
    } catch (_) {
      return Promise.resolve(null);
    }
  };

  // ── Key helpers ─────────────────────────────────────────────────────────────
  const isWebFontKey = (key) => typeof key === 'string' && key.startsWith(KEY_PREFIX);
  const keyToId = (key) => (isWebFontKey(key) ? key.slice(KEY_PREFIX.length) : '');
  const idToKey = (id) => KEY_PREFIX + id;

  Vectura.GoogleFonts = {
    KEY_PREFIX,
    CATALOG_URL,
    FILE_BASE,
    isWebFontKey,
    keyToId,
    idToKey,
    loadCatalog,
    getFamilies,
    findFamily,
    getCatalogStatus,
    fileUrl,
    pickWeight,
    ensureFont,
    loadWeight,
    registerVendored,
    getFontStatus,
    getParsed,
    flattenCommands,
    commandsToAnchors,
    optimizeAnchorsCardinal,
    layout,
    setRegenHook: (fn) => { regenHook = typeof fn === 'function' ? fn : null; },
  };
})();
