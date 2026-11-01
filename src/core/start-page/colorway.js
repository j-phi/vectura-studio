/**
 * Start Page colorway engine — window.Vectura.StartPageColorway.
 *
 * Pairs a paper with an ink (and sometimes a second ink) for each work on the Start Page, in five modes
 * (curated, mono, basic, wildcard, random). Pure: no DOM, no storage. The catalogue lives in
 * src/config/start-page-colorways.js and resolves to the app's real papers (Vectura.PAPERS), pen models
 * (Vectura.PEN_MODELS) and palettes (Vectura.PALETTES); validateCatalogue() proves it.
 *
 * A colorway is a frozen object:
 *   { key, mode, paper, ink, ink2|null, textInk, paperType, paperName, paperId, penId, penId2|null,
 *     penModel|null, paletteRef|null, penName, name, contrast, textContrast, nudged }
 * Floors: ink / ink2 vs paper >= 3:1 (nudged in lightness when short), textInk vs paper >= 4.5:1.
 *
 *   MODES, SEED_ALPHABET, newSeed(rand?)
 *   contrast(a, b), ensureContrast(ink, paper, min) -> { hex, nudged }, near(a, b)
 *   colorwayFor({ mode, seed, theme, workId, index })            single, no adjacency
 *   sequence(works, { mode, seed, theme, pins })                 adjacency-safe run in page order
 *   alternates(index, workId, n, { mode, seed, theme, works })   n distinct colorways for one piece
 *   audit(works, { theme })                                      { [mode]: { minContrast, minTextContrast, adjacentNear } }
 *   validateCatalogue()                                          string[] of problems ([] = all real)
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const MODES = Object.freeze(['curated', 'mono', 'basic', 'wildcard', 'random']);
  const ART_MIN = 3;
  const TEXT_MIN = 4.5;
  const cfg = () => Vectura.START_PAGE_COLORWAYS || {};
  const SEED_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  const md = (i, n) => ((i % n) + n) % n;
  const round2 = (v) => Math.round(v * 100) / 100;

  // ------------------------------------------------------------------ color
  const hx = (h) => {
    let s = String(h).replace('#', '');
    if (s.length === 3) s = s.replace(/./g, (c) => c + c);
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const toHex = (a) => '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (h) => { const [r, g, b] = hx(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const contrast = (a, b) => { const A = lum(a); const B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const mix = (a, b, t) => { const A = hx(a); const B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

  // Nudge ink lightness (towards black or white, keeping hue) until it clears `min` against paper.
  const ensureContrast = (ink, paper, min = ART_MIN) => {
    const src = toHex(hx(ink));
    if (contrast(src, paper) >= min) return { hex: src, nudged: false };
    const darker = lum(paper) >= lum(src);
    for (const dir of darker ? ['#0a0a0b', '#ffffff'] : ['#ffffff', '#0a0a0b']) {
      for (let t = 0.04; t <= 1.0001; t += 0.04) {
        const c = mix(src, dir, t);
        if (contrast(c, paper) >= min) return { hex: c, nudged: true };
      }
    }
    return { hex: lum(paper) > 0.18 ? '#0a0a0b' : '#ffffff', nudged: true };
  };

  // ------------------------------------------------------------------ seeds, hashing
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
  const cleanSeed = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12);
  // Unbiased index in [0, n) from uniform Uint32 draws: rejection sampling, so no modulo/float skew.
  const unbiasedIndex = (draw, n) => {
    const limit = 4294967296 - (4294967296 % n); // largest multiple of n at or below 2^32
    for (;;) { const v = draw(); if (v < limit) return v % n; }
  };
  const newSeed = (rand) => {
    const n = SEED_ALPHABET.length;
    let out = '';
    if (typeof rand === 'function') {
      for (let i = 0; i < 5; i++) out += SEED_ALPHABET[Math.min(n - 1, Math.floor(rand() * n))];
      return out;
    }
    let draw = null;
    try {
      const buf = new Uint32Array(8);
      let k = buf.length;
      const c = G.crypto;
      if (!c || typeof c.getRandomValues !== 'function') throw new Error('no crypto');
      draw = () => { if (k >= buf.length) { c.getRandomValues(buf); k = 0; } return buf[k++]; };
      draw(); k = 0; // probe once so a throwing crypto falls back before any char is chosen
    } catch (e) { draw = null; }
    for (let i = 0; i < 5; i++) {
      out += draw ? SEED_ALPHABET[unbiasedIndex(draw, n)] : SEED_ALPHABET[Math.min(n - 1, Math.floor(Math.random() * n))];
    }
    return out;
  };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // A stride that visits every slot of an n-pool (coprime with n), near the preferred one.
  const strideFor = (n, preferred) => { let s = preferred; while (gcd(s, n) !== 1) s++; return s; };

  // ------------------------------------------------------------------ perceptual distance (CIELAB dE76)
  const labCache = new Map();
  const lab = (h) => {
    if (typeof h !== 'string' || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(h)) return [50, 0, 0];
    if (labCache.has(h)) return labCache.get(h);
    const [r, g, b] = hx(h).map(lin);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    const o = [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
    labCache.set(h, o);
    return o;
  };
  const dE = (a, b) => { const A = lab(a); const B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
  // scheme family = paper class (dark / saturated stock hue / light sheet) + ink hue octant (or neutral)
  const family = (cw) => {
    const P = lab(cw.paper); const I = lab(cw.ink);
    const pc = Math.hypot(P[1], P[2]); const ic = Math.hypot(I[1], I[2]);
    const deg = (v) => ((Math.atan2(v[2], v[1]) * 180) / Math.PI + 360) % 360;
    const pClass = P[0] < 32 ? 'dark' : (pc > 34 ? 'stock' + (Math.round(deg(P) / 60) % 6) : 'light');
    const iClass = ic < 14 ? 'n' + (I[0] > 60 ? 'L' : 'D') : 'h' + (Math.round(deg(I) / 45) % 8);
    return pClass + ':' + iClass;
  };
  // Near-identical: same key, or close paper AND close ink, or same family with loosely close colors.
  const near = (a, b) => {
    if (!a || !b) return false;
    if (a.key === b.key) return true;
    const dp = dE(a.paper, b.paper);
    const di = Math.min(dE(a.ink, b.ink), a.ink2 && b.ink2 ? dE(a.ink2, b.ink2) + dE(a.ink, b.ink) * 0.5 : 1e9);
    if (dp < 16 && di < 26) return true;
    return family(a) === family(b) && dp < 30 && di < 42;
  };

  // ------------------------------------------------------------------ catalogue
  const normTheme = (t) => (t === 'light' || t === 'lark' || t === 'dark' ? t : 'dark');
  const pens = () => { const c = cfg(); const m = new Map(); (c.PENS || []).forEach((p) => m.set(p.id, p)); return m; };
  const paperTypes = () => (Vectura.PAPERS && Vectura.PAPERS.TYPES) || {};

  const resolvePaper = (def) => {
    const T = paperTypes()[def.type] || {};
    const base = T.color || '#ffffff';
    const stock = T.short || T.label || def.type;
    let color = def.color || base;
    let name = def.name || stock;
    if (def.tint) {
      const pal = (Vectura.PALETTES || []).find((p) => p.id === def.tint.palette);
      const tint = (pal && pal.colors[def.tint.index]) || base;
      color = mix(base, tint, def.tint.amount);
      name = stock + ' · ' + def.tint.name;
    }
    return { id: def.id, type: def.type, color, name };
  };
  const papers = () => { const m = new Map(); (cfg().PAPERS || []).forEach((p) => m.set(p.id, resolvePaper(p))); return m; };

  // Cached lookups, rebuilt when the config object changes.
  let cacheFor = null;
  let cache = null;
  const tables = () => {
    const c = cfg();
    if (cacheFor !== c || !cache || cache.nPens !== (c.PENS || []).length || cache.nPapers !== (c.PAPERS || []).length) {
      cache = { pens: pens(), papers: papers(), nPens: (c.PENS || []).length, nPapers: (c.PAPERS || []).length, built: new Map() };
      cacheFor = c;
    }
    return cache;
  };
  const penLabel = (p) => (p.model ? p.colour : p.label);
  const penFull = (p) => {
    if (!p.model) return p.label;
    const M = (Vectura.PEN_MODELS && Vectura.PEN_MODELS.MODELS && Vectura.PEN_MODELS.MODELS[p.model]) || {};
    return (M.short || M.label || p.model) + ' ' + p.colour;
  };
  const shortColour = (p) => penLabel(p).replace(/^Fluorescent /, '').replace(/ \(.*\)$/, '');

  const finish = (o) => Object.freeze(o);
  const buildCw = (paper, penA, penB, mode, key) => {
    const a = ensureContrast(penA.hex, paper.color, ART_MIN);
    const b = penB ? ensureContrast(penB.hex, paper.color, ART_MIN) : null;
    const text = contrast(a.hex, paper.color) >= TEXT_MIN ? { hex: a.hex, nudged: false } : ensureContrast(a.hex, paper.color, TEXT_MIN);
    const cA = contrast(a.hex, paper.color);
    const cMin = Math.min(cA, b ? contrast(b.hex, paper.color) : Infinity);
    return finish({
      key: key || (paper.id + '|' + penA.id + (penB ? '+' + penB.id : '')),
      mode,
      paper: paper.color,
      ink: a.hex,
      ink2: b ? b.hex : null,
      textInk: text.hex,
      paperType: paper.type,
      paperName: paper.name,
      paperId: paper.id,
      penId: penA.id,
      penId2: penB ? penB.id : null,
      penModel: penA.model || null,
      paletteRef: penA.model ? null : penA.palette,
      penName: penB ? penFull(penA) + ' + ' + shortColour(penB) : penFull(penA),
      penNameA: penFull(penA),
      penNameB: penB ? penFull(penB) : null,
      name: (penB ? shortColour(penA) + ' & ' + shortColour(penB) : shortColour(penA)) + ' on ' + paper.name,
      contrast: round2(cMin),
      textContrast: round2(contrast(text.hex, paper.color)),
      nudged: a.nudged || (b ? b.nudged : false),
      nudgedA: a.nudged,
      nudgedB: b ? b.nudged : false,
    });
  };
  // Build from catalogue ids (memoized: colorways are immutable).
  const fromIds = (paperId, penAId, penBId, mode) => {
    const t = tables();
    const k = mode + '|' + paperId + '|' + penAId + '|' + (penBId || '');
    if (t.built.has(k)) return t.built.get(k);
    const cw = buildCw(t.papers.get(paperId), t.pens.get(penAId), penBId ? t.pens.get(penBId) : null, mode);
    t.built.set(k, cw);
    return cw;
  };

  // Plain-sheet colorways (mono, basic) use paper type 'none' = the theme's document color.
  const plainPaper = (hex, name) => ({ id: 'plain-' + hex.slice(1), type: 'none', color: hex, name });
  const monoCw = (theme) => {
    const m = cfg().MONO[normTheme(theme)];
    const paper = plainPaper(m.paper, m.name);
    const a = ensureContrast(m.ink, m.paper, ART_MIN);
    const text = contrast(a.hex, m.paper) >= TEXT_MIN ? a.hex : ensureContrast(a.hex, m.paper, TEXT_MIN).hex;
    return finish({
      key: 'mono-' + normTheme(theme), mode: 'mono', paper: paper.color, ink: a.hex, ink2: null, textInk: text,
      paperType: 'none', paperName: m.name, paperId: paper.id, penId: 'theme-pen-1', penId2: null, penModel: null, paletteRef: null,
      penName: 'Pen 1 · theme ink', penNameA: null, penNameB: null, name: 'Pen 1 on ' + m.name,
      contrast: round2(contrast(a.hex, paper.color)), textContrast: round2(contrast(text, paper.color)), nudged: a.nudged,
    });
  };
  const basicCw = (theme, i) => {
    const t = tables(); const B = cfg().BASIC; const th = normTheme(theme);
    const slot = B.pens[md(i, B.pens.length)];
    const pen = t.pens.get(th === 'dark' && B.darkSwap && B.darkSwap[slot] ? B.darkSwap[slot] : slot);
    const k = 'basic|' + th + '|' + pen.id;
    if (t.built.has(k)) return t.built.get(k);
    const paperHex = B.paper[th];
    const cw = buildCw(plainPaper(paperHex, 'Plain'), pen, null, 'basic', 'basic|' + th + '|' + pen.id);
    t.built.set(k, cw);
    return cw;
  };

  // ------------------------------------------------------------------ random
  const randomCw = (seed, slot) => {
    const t = tables(); const R = cfg().RANDOM;
    const r = rng(hashStr(seed + ':' + slot));
    const pa = [...t.papers.values()];
    const paper = pa[Math.floor(r() * pa.length)];
    const all = [...t.pens.values()];
    const ok = all.filter((p) => contrast(p.hex, paper.color) >= ART_MIN + R.margin);
    const pool = ok.length ? ok : all;
    const pen = pool[Math.floor(r() * pool.length)];
    let pen2 = null;
    if (r() < R.duoChance) {
      const p2 = pool.filter((p) => p.id !== pen.id && Math.abs(lum(p.hex) - lum(pen.hex)) < R.duoLumSpread);
      if (p2.length) pen2 = p2[Math.floor(r() * p2.length)];
    }
    const k = 'random|' + paper.id + '|' + pen.id + '|' + (pen2 ? pen2.id : '');
    if (t.built.has(k)) return t.built.get(k);
    const cw = buildCw(paper, pen, pen2, 'random');
    t.built.set(k, cw);
    return cw;
  };

  // ------------------------------------------------------------------ candidates
  const wildcardOffset = (seed) => (seed ? hashStr('wild:' + seed) : 0);
  // Colorway thunks for one slot, the natural pick first. curated keys on workId; the rest on page position.
  const candidates = (mode, index, workId, seed, theme) => {
    const c = cfg(); const out = [];
    if (mode === 'wildcard') {
      const n = c.WILDCARD.length; const st = strideFor(n, 5); const base = index + wildcardOffset(seed);
      for (let k = 0; k < n; k++) { const w = c.WILDCARD[md(base + k * st, n)]; out.push(() => fromIds(w[0], w[1], w[2], 'wildcard')); }
    } else if (mode === 'random') {
      for (let k = 0; k < c.RANDOM.retries; k++) out.push(() => randomCw(seed, k ? index + '~' + k : index));
    } else if (mode === 'basic') {
      for (let k = 0; k < c.BASIC.pens.length; k++) out.push(() => basicCw(theme, index + k));
    } else { // curated
      const n = c.CURATED.length; const st = strideFor(n, 7);
      const own = workId ? hashStr(String(workId)) % n : md(index, n);
      for (let k = 0; k < n; k++) { const w = c.CURATED[md(own + k * st, n)]; out.push(() => fromIds(w[0], w[1], null, 'curated')); }
    }
    return out;
  };
  const pickCw = (cands, bad) => {
    let first = null;
    for (const mk of cands) { const cw = mk(); first = first || cw; if (!bad(cw)) return cw; }
    return first;
  };
  const sameInk = (a, b) => !!a && !!b && a.ink === b.ink;

  // ------------------------------------------------------------------ public: single, sequence
  const modeOf = (m) => (MODES.includes(m) ? m : 'curated');
  const colorwayFor = (o = {}) => {
    const mode = modeOf(o.mode); const theme = normTheme(o.theme); const seed = cleanSeed(o.seed);
    const index = Number.isFinite(o.index) ? o.index : 0;
    if (mode === 'mono') return monoCw(theme);
    return candidates(mode, index, o.workId, seed, theme)[0]();
  };

  const sequence = (works, o = {}) => {
    const mode = modeOf(o.mode); const theme = normTheme(o.theme); const seed = cleanSeed(o.seed);
    const pins = o.pins || {}; const list = Array.isArray(works) ? works : [];
    let prev = null;
    return list.map((w, i) => {
      const id = w && w.id;
      let cw;
      if (id != null && Object.prototype.hasOwnProperty.call(pins, id) && pins[id]) cw = pins[id];
      else if (mode === 'mono') cw = monoCw(theme);
      else {
        const nextId = list[i + 1] && list[i + 1].id;
        const nextPin = mode === 'basic' && nextId != null && Object.prototype.hasOwnProperty.call(pins, nextId) ? pins[nextId] : null;
        const bad = mode === 'basic' ? (x) => sameInk(x, prev) || sameInk(x, nextPin) : (x) => near(x, prev);
        cw = pickCw(candidates(mode, i, id, seed, theme), bad);
      }
      prev = cw;
      return cw;
    });
  };

  // ------------------------------------------------------------------ alternates
  const altPool = (mode, theme, seed, j) => {
    const c = cfg();
    if (mode === 'basic') return c.BASIC.pens.map((_, k) => () => basicCw(theme, k));
    if (mode === 'random') return Array.from({ length: 40 }, (_, k) => () => randomCw(seed, 'alt' + j + '.' + k));
    const seen = new Set(); const out = [];
    c.CURATED.forEach((w) => { const k = w.join('|'); if (!seen.has(k)) { seen.add(k); out.push(() => fromIds(w[0], w[1], null, mode)); } });
    c.WILDCARD.forEach((w) => { const k = w.join('|'); if (!seen.has(k)) { seen.add(k); out.push(() => fromIds(w[0], w[1], w[2], mode)); } });
    return out;
  };
  const altMemo = new Map();
  const alternates = (index, workId, n, o) => {
    if (typeof n === 'object' && n) { o = n; n = null; }
    o = o || {};
    n = Math.max(1, Math.min(8, n || 3));
    let mode = modeOf(o.mode);
    if (mode === 'mono') mode = 'curated';
    const theme = normTheme(o.theme); const seed = cleanSeed(o.seed);
    const list = Array.isArray(o.works) ? o.works : null;
    index = Number.isFinite(index) ? index : 0;
    const idAt = (j) => (j === index ? workId : (list && list[j] ? list[j].id : undefined));
    const sig = list ? hashStr(list.map((w) => w && w.id).join('|')) : '';
    const key = (j, id) => [mode, mode === 'random' || mode === 'wildcard' ? seed : '', mode === 'basic' ? theme : '', n, j, id == null ? '' : id, sig, tables().nPens].join('|');
    if (altMemo.has(key(index, workId))) return altMemo.get(key(index, workId)).slice();
    const steps = [[index, workId]]; let prev = null;
    if (list) {
      for (let j = index - 1; j >= 0; j--) {
        const id = idAt(j); const k = key(j, id);
        if (altMemo.has(k)) { prev = altMemo.get(k); break; }
        steps.unshift([j, id]);
      }
    }
    for (const [j, id] of steps) {
      const set = []; const has = (cw) => set.some((x) => near(x, cw)); const inPrev = (cw) => !!prev && prev.some((x) => x.key === cw.key);
      set.push(pickCw(candidates(mode, j, id, seed, theme), (cw) => !!prev && near(cw, prev[0])));
      const r = rng(hashStr('alt:' + mode + ':' + j + ':' + (mode === 'random' ? seed : '')));
      const pool = altPool(mode, theme, seed, j);
      for (let i = pool.length - 1; i > 0; i--) { const q = Math.floor(r() * (i + 1)); const t = pool[i]; pool[i] = pool[q]; pool[q] = t; }
      const built = pool.map((mk) => mk());
      // look ahead: keep the next piece's own colorway out of this set so its slot 0 never repeats one of ours
      const nxt = pickCw(candidates(mode, j + 1, idAt(j + 1), seed, theme), (cw) => near(cw, set[0]));
      const free = (cw) => !has(cw) && !inPrev(cw) && !near(cw, nxt);
      for (let s = 1; s < n; s++) {
        const tiers = [(cw) => free(cw) && !(prev && prev[s] && near(cw, prev[s])), free, (cw) => !has(cw) && !inPrev(cw), (cw) => !has(cw), (cw) => !set.some((x) => x.key === cw.key)];
        let got = null;
        for (const ok of tiers) { got = built.find(ok); if (got) break; }
        set.push(got || built[s % built.length]);
      }
      altMemo.set(key(j, id), set);
      prev = set;
    }
    return prev.slice();
  };

  // ------------------------------------------------------------------ audit + catalogue check
  const audit = (works, o = {}) => {
    const theme = normTheme(o.theme); const out = {};
    MODES.forEach((mode) => {
      const seq = sequence(works, { mode, seed: 'AUDIT', theme });
      let minC = Infinity; let minT = Infinity; let adj = 0;
      seq.forEach((cw, i) => {
        minC = Math.min(minC, contrast(cw.ink, cw.paper), cw.ink2 ? contrast(cw.ink2, cw.paper) : Infinity);
        minT = Math.min(minT, contrast(cw.textInk, cw.paper));
        if (i && mode !== 'mono' && (mode === 'basic' ? cw.ink === seq[i - 1].ink : near(cw, seq[i - 1]))) adj++;
      });
      out[mode] = { minContrast: seq.length ? round2(minC) : null, minTextContrast: seq.length ? round2(minT) : null, adjacentNear: adj };
    });
    return out;
  };

  // Every table entry must name a real paper type, palette color and pen-model colour.
  const validateCatalogue = () => {
    const c = cfg(); const bad = [];
    const types = paperTypes(); const pals = Vectura.PALETTES || []; const models = (Vectura.PEN_MODELS && Vectura.PEN_MODELS.MODELS) || {};
    const palColor = (id, i) => { const p = pals.find((x) => x.id === id); return p ? p.colors[i] : undefined; };
    const paperIds = new Set(); const penIds = new Set();
    (c.PAPERS || []).forEach((p) => {
      paperIds.add(p.id);
      if (!types[p.type] || p.type === 'none') bad.push('paper ' + p.id + ': unknown type ' + p.type);
      const src = p.tint || (p.palette ? p : null);
      if (src && !palColor(src.palette, src.index)) bad.push('paper ' + p.id + ': unknown palette color ' + src.palette + '[' + src.index + ']');
    });
    (c.PENS || []).forEach((p) => {
      penIds.add(p.id);
      if (p.model) {
        const m = models[p.model]; const col = m && (m.colours || []).find((x) => x.name === p.colour);
        if (!m) bad.push('pen ' + p.id + ': unknown model ' + p.model);
        else if (!col) bad.push('pen ' + p.id + ': model ' + p.model + ' has no colour ' + p.colour);
        else if (col.hex.toLowerCase() !== p.hex.toLowerCase()) bad.push('pen ' + p.id + ': hex differs from model');
      } else {
        const hex = palColor(p.palette, p.index);
        if (!hex) bad.push('pen ' + p.id + ': unknown palette color ' + p.palette + '[' + p.index + ']');
        else if (hex.toLowerCase() !== p.hex.toLowerCase()) bad.push('pen ' + p.id + ': hex differs from palette');
      }
    });
    const chk = (where, paperId, ...ids) => {
      if (!paperIds.has(paperId)) bad.push(where + ': unknown paper ' + paperId);
      ids.forEach((id) => { if (id && !penIds.has(id)) bad.push(where + ': unknown pen ' + id); });
    };
    (c.CURATED || []).forEach((w, i) => chk('curated[' + i + ']', w[0], w[1]));
    (c.WILDCARD || []).forEach((w, i) => chk('wildcard[' + i + ']', w[0], w[1], w[2]));
    ((c.BASIC && c.BASIC.pens) || []).forEach((id, i) => { if (!penIds.has(id)) bad.push('basic[' + i + ']: unknown pen ' + id); });
    Object.keys((c.BASIC && c.BASIC.darkSwap) || {}).forEach((id) => {
      if (!penIds.has(id) || !penIds.has(c.BASIC.darkSwap[id])) bad.push('basic darkSwap ' + id + ': unknown pen');
    });
    return bad;
  };

  Vectura.StartPageColorway = {
    MODES, SEED_ALPHABET, newSeed, contrast, ensureContrast, near, colorwayFor, sequence, alternates, audit, validateCatalogue,
  };
})();
