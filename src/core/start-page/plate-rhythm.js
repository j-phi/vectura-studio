/**
 * Start Page plate rhythm — window.Vectura.StartPagePlateRhythm.
 *
 * Places a colorway on each plate of the Plates section and advises on the result. Pure: no DOM, no storage.
 * Palette data lives in src/config/start-page-plate-palette.js (32 entries on the app's real papers and pens);
 * contrast / near-identical checks reuse Vectura.StartPageColorway; the plain-sheet modes (basic, mono) reuse its
 * colorways so a plate and a card in the same mode agree.
 *
 * A placed colorway is a frozen object with at least
 *   { id, name, class: 'light'|'ground'|'dark', fam, ground, ink, accent, paperType, paperName, penId, penName }
 * (palette entries as they are; basic / mono colorways are adapted to that shape and carry mode 'basic' | 'mono').
 *
 *   MODES, LAYOUTS
 *   place(plates, { mode, seed, theme }) -> [{ id, colorway, reason }]
 *     curated: cycle L C L D C L D L C D; random: seeded reshuffle of the same rules; wildcard: saturated grounds
 *     with darks interspersed. Never two darks adjacent; neighbors never share a hue family or a near-identical
 *     ground + ink. A plate's `pin` (palette id) wins in curated and the rules bend around it (a pin is the user's
 *     word: pins are ignored in the other modes, which own plate color). basic: theme paper + the pen box, neighbors
 *     differ. mono: theme ink on theme paper for every plate.
 *   advise(placed, index) -> [{ code, message, fix: { useRhythmColor: true } }]
 *   suggestLayouts(colorwayClass, artOrientation) -> layout ids
 *   contrast(a, b)
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const MODES = Object.freeze(['curated', 'mono', 'basic', 'wildcard', 'random']);
  const LAYOUTS = Object.freeze(['vertical-word', 'spec-sheet', 'text-wrap', 'waterfall', 'knockout', 'full-sheet',
    'full-bleed-band', 'diptych', 'specimen-frame', 'big-numeral', 'words-both-sides', 'plot-stages', 'knockout-title',
    'detail-full', 'four-crops', 'pull-quote']);
  const CYCLE = Object.freeze(['light', 'ground', 'light', 'dark', 'ground', 'light', 'dark', 'light', 'ground', 'dark']);
  const CLASSES = Object.freeze(['light', 'ground', 'dark']);
  const ART_MIN = 3;
  const TEXT_MIN = 4.5;

  const cw = () => Vectura.StartPageColorway;
  const contrast = (a, b) => cw().contrast(a, b);
  const palette = () => Vectura.START_PAGE_PLATE_PALETTE || [];
  const normTheme = (t) => (t === 'light' || t === 'lark' ? 'light' : 'dark');
  const pad2 = (n) => String(n).padStart(2, '0');

  const hashStr = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const rng = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const shuffle = (list, r) => {
    const l = list.slice();
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = l[i]; l[i] = l[j]; l[j] = t; }
    return l;
  };

  // ------------------------------------------------------------------ similarity
  const asPaperInk = (e) => ({ key: e.id, paper: e.ground, ink: e.ink, ink2: null });
  // Neighbors clash when they are the same colorway, share a hue family, or look alike (ground + ink).
  const clash = (a, b) => !!a && !!b && (a.id === b.id || a.fam === b.fam || cw().near(asPaperInk(a), asPaperInk(b)));
  const bothDark = (a, b) => !!a && !!b && a.class === 'dark' && b.class === 'dark';

  // ------------------------------------------------------------------ plain-sheet modes
  const hueFamily = (hex) => {
    const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    if (mx - mn < 24) return 'neutral';
    let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    h = ((h * 60) + 360) % 360;
    return ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'violet', 'pink'][Math.floor(((h + 22.5) % 360) / 45)];
  };
  const fromModeColorway = (c, mode, theme) => Object.freeze({
    id: c.key, key: c.key, name: c.name, class: theme === 'light' ? 'light' : 'dark', fam: mode === 'mono' ? 'mono' : hueFamily(c.ink),
    ground: c.paper, ink: c.ink, accent: c.ink, textInk: c.textInk, paperType: c.paperType, paperName: c.paperName,
    paperId: c.paperId, penId: c.penId, penName: c.penName, mode,
  });
  const basicRun = (n, theme) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      let c = fromModeColorway(cw().colorwayFor({ mode: 'basic', theme, index: i }), 'basic', theme);
      // The pen box is longer than a page's neighbors need; the swap table can still collide, so step on.
      for (let k = 1; k < 12 && out[i - 1] && out[i - 1].ink === c.ink; k++) {
        c = fromModeColorway(cw().colorwayFor({ mode: 'basic', theme, index: i + k }), 'basic', theme);
      }
      out.push(c);
    }
    return out;
  };

  // ------------------------------------------------------------------ rhythm
  const placeRhythm = (plates, mode, seed) => {
    const n = plates.length;
    const byId = new Map(palette().map((e) => [e.id, e]));
    const rnd = mode === 'random' ? rng(hashStr('r' + seed)) : mode === 'wildcard' ? rng(hashStr('w' + seed)) : null;
    const lists = {}; const cur = { light: 0, ground: 0, dark: 0 };
    CLASSES.forEach((c) => { const l = palette().filter((e) => e.class === c); lists[c] = rnd ? shuffle(l, rnd) : l; });
    const shift = mode === 'random' ? Math.floor(rnd() * CYCLE.length) : 0;
    const pinAt = (i) => {
      const p = plates[i] && plates[i].pin;
      return mode === 'curated' && p && byId.has(p) ? byId.get(p) : null;
    };
    const out = [];
    for (let i = 0; i < n; i++) {
      const pin = pinAt(i);
      if (pin) { out.push({ id: plates[i].id, colorway: pin, reason: 'Pinned by you' }); continue; }
      const prev = out[i - 1] && out[i - 1].colorway;
      const next = pinAt(i + 1);
      const base = CYCLE[(i + shift) % CYCLE.length];
      let cls = mode === 'wildcard' ? (base === 'dark' ? 'dark' : 'ground') : base;
      let reason = mode === 'curated' ? 'Rhythm: ' + cls : mode === 'random' ? 'Reshuffled: ' + cls : 'Wildcard: ' + cls;
      const darkBlocked = bothDark({ class: cls }, prev) || bothDark({ class: cls }, next);
      if (darkBlocked) {
        cls = mode === 'wildcard' ? 'ground' : (prev && prev.class === 'light' ? 'ground' : 'light');
        reason = 'Rhythm bends around a dark neighbor: ' + cls;
      }
      const ok = (e) => !clash(e, prev) && !clash(e, next) && !(e.class === 'dark' && ((prev && prev.class === 'dark') || (next && next.class === 'dark')));
      // preferred class (round-robin), then the other non-dark classes, then anything that still clears the rules
      const order = [cls, ...(mode === 'wildcard' ? ['ground'] : ['light', 'ground']).filter((c) => c !== cls), ...CLASSES];
      let pick = null; let from = cls;
      for (const c of order) {
        const l = lists[c];
        for (let s = 0; s < l.length; s++) {
          const e = l[(cur[c] + s) % l.length];
          if (ok(e)) { pick = e; cur[c] = (cur[c] + s + 1) % l.length; from = c; break; }
        }
        if (pick) break;
      }
      if (!pick) { pick = lists[cls][cur[cls]++ % lists[cls].length]; reason += ' (no clean option)'; } else if (from !== cls) reason = 'Rhythm bends to keep neighbors apart: ' + from;
      out.push({ id: plates[i].id, colorway: pick, reason });
    }
    return out;
  };

  const place = (plates, o = {}) => {
    const list = (Array.isArray(plates) ? plates : []).filter((p) => p && p.id != null);
    const mode = MODES.includes(o.mode) ? o.mode : 'curated';
    const theme = normTheme(o.theme);
    const seed = String(o.seed == null ? '' : o.seed).toUpperCase();
    if (mode === 'mono') {
      const c = fromModeColorway(cw().colorwayFor({ mode: 'mono', theme }), 'mono', theme);
      return list.map((p) => ({ id: p.id, colorway: c, reason: 'Mono: theme ink on theme paper' }));
    }
    if (mode === 'basic') {
      return basicRun(list.length, theme).map((c, i) => ({ id: list[i].id, colorway: c, reason: 'Basic: theme paper, pen box ' + (i + 1) }));
    }
    return placeRhythm(list, mode, seed);
  };

  // ------------------------------------------------------------------ advice
  const FIX = () => ({ useRhythmColor: true });
  const advise = (placed, index) => {
    const out = [];
    const list = Array.isArray(placed) ? placed : [];
    const here = list[index] && list[index].colorway;
    if (!here) return out;
    const plain = here.mode === 'basic' || here.mode === 'mono';
    if (!plain) {
      [index - 1, index + 1].forEach((j) => {
        const other = list[j] && list[j].colorway;
        if (!other || other.mode === 'basic' || other.mode === 'mono') return;
        if (bothDark(here, other)) out.push({ code: 'two-darks', message: 'Two dark plates in a row: plate ' + pad2(j + 1) + ' is dark too.', fix: FIX() });
        else if (clash(here, other)) out.push({ code: 'near-neighbor', message: 'Plate ' + pad2(j + 1) + ' has a near-identical color.', fix: FIX() });
      });
    }
    const text = contrast(here.ink, here.ground); const art = Math.min(text, here.accent ? contrast(here.accent, here.ground) : Infinity);
    if (text < TEXT_MIN || art < ART_MIN) {
      out.push({ code: 'low-contrast', message: text < TEXT_MIN ? 'Ink on this color is below 4.5:1, so captions are hard to read.' : 'Accent on this color is below 3:1.', fix: FIX() });
    }
    return out;
  };

  // ------------------------------------------------------------------ layout suggestions
  const BY_CLASS = {
    dark: ['spec-sheet', 'full-bleed-band', 'big-numeral'],
    ground: ['knockout', 'knockout-title', 'vertical-word'],
    light: ['text-wrap', 'specimen-frame', 'diptych'],
  };
  const BY_ORIENT = {
    landscape: ['full-bleed-band', 'full-sheet', 'diptych', 'knockout-title', 'plot-stages', 'waterfall'],
    portrait: ['vertical-word', 'words-both-sides', 'text-wrap', 'specimen-frame', 'detail-full', 'pull-quote'],
    square: ['specimen-frame', 'four-crops', 'big-numeral', 'text-wrap', 'spec-sheet', 'knockout'],
    '3d': ['spec-sheet', 'specimen-frame', 'big-numeral', 'text-wrap', 'full-sheet', 'diptych'],
  };
  const suggestLayouts = (colorwayClass, artOrientation) => {
    const cls = colorwayClass === 'color' ? 'ground' : (BY_CLASS[colorwayClass] ? colorwayClass : 'light');
    const ori = BY_ORIENT[artOrientation] || BY_ORIENT.square;
    const aff = BY_CLASS[cls];
    const both = aff.filter((l) => ori.includes(l));
    const seen = new Set(); const out = [];
    [...both, ...aff, ...ori].forEach((l) => { if (!seen.has(l)) { seen.add(l); out.push(l); } });
    return out.slice(0, 5);
  };

  Vectura.StartPagePlateRhythm = { MODES, LAYOUTS, CYCLE, place, advise, suggestLayouts, contrast };
})();
