/**
 * Pen Studio complement logic — window.Vectura.PenStudioComplement.
 *
 * Pure colour maths + candidate selection for the "pair" column: which inks
 * go well with the selected pen on a given paper, and which of them the
 * paper would swallow. No DOM. Thresholds come from PEN_STUDIO.CONTRAST
 * (config, unit B) with the same defaults built in.
 *
 *   contrast(a, b)                     WCAG ratio of two hex colours
 *   hsl(hex) -> [H(0..360), S, L]      hex(h, s, l) -> '#rrggbb'
 *   readable(h, s, l, paperHex, target = 2.6)
 *                                      nudge lightness until the hue reads
 *   allCandidates(opts)                curated, 3 hues, EVERY box mate
 *   candidates(opts)                   allCandidates filtered by fits(), box
 *                                      mates capped at BOX_MATES_MAX
 *   fits(cand, pen, paperType)         paper >= 2, pen >= 1.25, dark paper
 *                                      needs coverOnDark >= .5 (real pens)
 *   hidden(all, pen, paperType)        names of real candidates fits() drops
 *   nearestOwned(hex, owned, pen, paperType)  closest owned pen that fits
 *   randomize(cands, currentId, paperType, rng)
 *
 * opts = { pen, penId, paperType, boxPens:[StudioPen], curated }
 *   pen      doc-pen-like {color, model?, ink?, id?}
 *   curated  the CURATED_PAIRS entry for this pen: {model,color} | {hex,name}
 *            | {penId} (a pen of boxPens)
 * Candidate = { id, hex, name, kind:'curated'|'hue'|'box'|'random', real,
 *               penId?, model?, ink?, labelKey? }
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DEFAULTS = {
    CONTRAST: { paperMin: 2.0, penMin: 1.25, readable: 2.6, faint: 1.6, crisp: 7, darkCoverMin: 0.5, darkFaintCover: 0.3 },
    HUES: [
      { id: 'c180', deg: 180, key: 'COMPLEMENT' },
      { id: 'c150', deg: 150, key: 'SPLIT_MINUS' },
      { id: 'c210', deg: 210, key: 'SPLIT_PLUS' },
    ],
    BOX_MATES_MAX: 3,
  };
  const HUE_NAMES = { COMPLEMENT: 'Complement', SPLIT_MINUS: 'Split −', SPLIT_PLUS: 'Split +' };

  const cfg = () => Vectura.PEN_STUDIO || {};
  const CONTRAST = () => ({ ...DEFAULTS.CONTRAST, ...(cfg().CONTRAST || {}) });
  const HUES = () => (Array.isArray(cfg().HUES) && cfg().HUES.length ? cfg().HUES : DEFAULTS.HUES);
  const MATES_MAX = () => (Number.isFinite(cfg().BOX_MATES_MAX) ? cfg().BOX_MATES_MAX : DEFAULTS.BOX_MATES_MAX);
  const cat = () => Vectura.PEN_MODELS || { MODELS: {} };
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  // ---- colour maths -----------------------------------------------------------

  const rgb = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(`${h || ''}`);
    const v = m ? parseInt(m[1], 16) : 0;
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const lum = (h) => {
    const c = rgb(h).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = (a, b) => {
    const x = lum(a); const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hsl = (hex) => {
    const [r, g, b] = rgb(hex).map((v) => v / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    let H = 0; let S = 0; const L = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      S = L > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      H *= 60;
    }
    return [H, S, L];
  };
  const hex = (H, S, L) => {
    const f = (n) => {
      const k = (n + H / 30) % 12; const a = S * Math.min(L, 1 - L);
      const c = L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(c * 255).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };
  const readable = (H, S, L, paperHex, target = CONTRAST().readable) => {
    let l = L;
    for (let i = 0; i < 12 && contrast(hex(H, S, l), paperHex) < target; i += 1) l += lum(paperHex) > 0.3 ? -0.06 : 0.06;
    return hex(H, Math.max(0.35, S), Math.max(0.08, Math.min(0.92, l)));
  };

  // ---- paper / pen helpers ------------------------------------------------------

  const paperInfo = (type) => {
    const P = Vectura.Paper;
    const color = P && typeof P.forType === 'function' ? P.forType(type).color : '#ffffff';
    return { color, dark: isDark(color) };
  };
  // Same test as PenModel.resolveTraits' darkStock (luminance < .4), so the
  // studio hides exactly the pens the renderer would draw faintly (kraft too).
  const isDark = (color) => lum(color) < 0.4;

  // coverOnDark of a pen-like {model?, ink?}: ink override, else model, else
  // null for a model-less pen (treated as fully covering).
  const coverOf = (p) => {
    if (!p || !p.model) return null;
    const PM = Vectura.PenModel;
    if (p.ink && Number.isFinite(p.ink.coverOnDark)) return Math.max(0, Math.min(1, p.ink.coverOnDark));
    if (PM && typeof PM.inkValue === 'function') {
      const d = PM.inkDefaults ? PM.inkDefaults({ model: p.model }) : {};
      if (own(d, 'coverOnDark')) return d.coverOnDark;
    }
    const m = own(cat().MODELS, p.model) ? cat().MODELS[p.model] : null;
    return m && Number.isFinite(m.coverOnDark) ? m.coverOnDark : 1;
  };

  const fits = (cand, pen, paperType) => {
    const C = CONTRAST();
    const paper = paperInfo(paperType);
    if (contrast(cand.hex, paper.color) < C.paperMin) return false;
    if (pen && pen.color && contrast(cand.hex, pen.color) < C.penMin) return false;
    if (isDark(paper.color) && cand.model) {
      const cov = coverOf(cand);
      if (cov != null && cov < C.darkCoverMin) return false;
    }
    return true;
  };

  const curatedCandidate = (curated, boxPens) => {
    if (!curated) return null;
    const pens = Array.isArray(boxPens) ? boxPens : [];
    if (curated.penId) {
      const sp = pens.find((q) => q.id === curated.penId);
      return sp ? { id: 'cur', hex: sp.color, name: sp.name, kind: 'curated', real: true, penId: sp.id, model: sp.model || undefined, ink: sp.ink } : null;
    }
    if (curated.model && curated.color) {
      const m = own(cat().MODELS, curated.model) ? cat().MODELS[curated.model] : null;
      const want = `${curated.color}`.toLowerCase();
      const col = m && (m.colours || []).find((c) => `${c.name}`.toLowerCase() === want);
      const sp = pens.find((q) => q.model === curated.model && `${q.name}`.toLowerCase().includes(want));
      const hx = (sp && sp.color) || (col && col.hex);
      if (!hx) return null;
      return { id: 'cur', hex: hx, name: (sp && sp.name) || `${m.short} ${col.name}`, kind: 'curated', real: true, penId: sp ? sp.id : undefined, model: curated.model };
    }
    if (curated.hex) return { id: 'cur', hex: curated.hex, name: curated.name || curated.hex, kind: 'curated', real: false };
    return null;
  };

  const allCandidates = ({ pen, penId, paperType, boxPens, curated } = {}) => {
    const out = [];
    const base = pen && pen.color ? pen.color : '#000000';
    const paper = paperInfo(paperType);
    const cu = curatedCandidate(curated, boxPens);
    if (cu) out.push(cu);
    const [H, S, Lh] = hsl(base);
    const sat = Math.max(S, 0.45);
    const lig = Lh < 0.12 || Lh > 0.9 ? 0.5 : Lh;
    HUES().forEach((h) => {
      out.push({
        id: h.id, hex: readable((H + h.deg) % 360, sat, lig, paper.color), name: HUE_NAMES[h.key] || h.key,
        labelKey: h.key, kind: 'hue', real: false, deg: h.deg,
      });
    });
    (Array.isArray(boxPens) ? boxPens : []).forEach((sp) => {
      if (!sp || sp.id === penId || sp.id === (pen && pen.id)) return;
      out.push({ id: `p:${sp.id}`, hex: sp.color, name: sp.name, kind: 'box', real: true, penId: sp.id, model: sp.model || undefined, ink: sp.ink });
    });
    return out;
  };

  const candidates = (opts = {}) => {
    const all = allCandidates(opts);
    let mates = 0;
    return all.filter((c) => fits(c, opts.pen, opts.paperType) && (c.kind !== 'box' || (mates += 1) <= MATES_MAX()));
  };

  const hidden = (all, pen, paperType) => (all || []).filter((c) => c.real && !fits(c, pen, paperType)).map((c) => c.name);

  const nearestOwned = (hx, ownedPens, pen, paperType) => {
    const c = rgb(hx);
    let best = null; let bd = Infinity;
    (ownedPens || []).forEach((q) => {
      if (!q || q.id === (pen && pen.id)) return;
      if (!fits({ hex: q.color, model: q.model || undefined, ink: q.ink }, pen, paperType)) return;
      const d = rgb(q.color).reduce((a, v, i) => a + (v - c[i]) * (v - c[i]), 0);
      if (d < bd) { bd = d; best = q; }
    });
    return best;
  };

  const randomize = (cands, currentId, paperType, rng = Math.random) => {
    const pool = (cands || []).filter((c) => c.id !== currentId);
    const paper = paperInfo(paperType);
    if (rng() < 0.5 && pool.length) return pool[Math.floor(rng() * pool.length)];
    const H2 = rng() * 360;
    const sat = 0.55 + rng() * 0.3;
    return { id: `rnd${Math.floor(rng() * 1e6)}`, hex: readable(H2, sat, 0.5, paper.color), name: 'Wildcard', kind: 'random', real: false };
  };

  Vectura.PenStudioComplement = {
    contrast, hsl, hex, readable, allCandidates, candidates, fits, hidden, nearestOwned, randomize, coverOf, isDark,
  };
})();
