/**
 * Pen Studio lab maths — window.Vectura.PenStudioLab. Pure (no DOM): the
 * numbers and stroke geometry behind the lab strips, the paper matrix and the
 * woven pair preview. Everything is in mm; previews are drawn by
 * InkRenderer.drawSample({ paths }) so the rendering is the real ink model.
 *
 *   paperFor(type) -> paper config      papers() -> [{type,name,color,dark}]
 *   metrics(docPen, paperType) -> { nibMm, laidMm, bleedMmPerSide, blobMm,
 *                                   overlapPct, opaque, skipPct, starvePct }
 *   fit(color, paperType, docPen) -> { ratio, note:'crisp'|'reads'|'barely', faint }
 *   testSpec(kind, { pen, comp, paperType, mini }) ->
 *                  { kind, values, strokes:[{pen, pts}], boxMm:{w,h}, compressed? }
 *   weave(n, mode, {w,h}) -> [{ pts, comp }]
 *
 * Ink keys added by unit A (overlap / starvation / coverOnDark) are read
 * through PenModel.inkValue when it knows them, else from the pen override or
 * the model field, so this works before and after that unit lands.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const DEF = {
    STRIP_MM: { w: 25, h: 2.4 },
    MATRIX_CELL_MM: { w: 14, h: 3 },
    CONTRAST: { faint: 1.6, crisp: 7, darkFaintCover: 0.3 },
    WEAVE: { min: 3, max: 7, default: 5, modes: ['alt', 'third', 'mid'] },
  };
  const cfg = () => Vectura.PEN_STUDIO || {};
  const CONTRAST = () => ({ ...DEF.CONTRAST, ...(cfg().CONTRAST || {}) });
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const fin = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const comp = () => Vectura.PenStudioComplement;

  const paperFor = (type) => Vectura.Paper.forType(type);
  const papers = () => {
    const PA = Vectura.PAPERS || { ORDER: [], TYPES: {} };
    return PA.ORDER.filter((t) => t !== 'none').map((type) => {
      const color = paperFor(type).color;
      const info = PA.TYPES[type] || {};
      return { type, name: info.short || info.label || type, color, dark: comp().isDark(color, type) };
    });
  };

  const traitsOn = (pen, type) => {
    const PA = Vectura.PAPERS || { TYPES: {} };
    return Vectura.PenModel.resolveTraits(pen, paperFor(type), PA.TYPES[type] || {});
  };

  // Ink value that works with or without unit A's new keys.
  const NEW_KEY_MODEL_FIELD = {
    overlap: (m) => fin(m.overlapDarkening),
    starvation: (m) => fin(m.starvation && m.starvation.strength),
    coverOnDark: (m) => fin(m.coverOnDark, 1),
  };
  const inkKey = (pen, key) => {
    const PM = Vectura.PenModel;
    if (pen && pen.ink && own(pen.ink, key) && Number.isFinite(pen.ink[key])) {
      const lim = (Vectura.PEN_MODELS && Vectura.PEN_MODELS.PARAM_LIMITS || {})[key];
      return lim ? clamp(pen.ink[key], lim[0], lim[1]) : pen.ink[key];
    }
    const d = PM && PM.inkDefaults ? PM.inkDefaults(pen) : {};
    if (own(d, key)) return d[key];
    const m = PM && PM.modelOf ? PM.modelOf(pen) : null;
    if (m && NEW_KEY_MODEL_FIELD[key]) return NEW_KEY_MODEL_FIELD[key](m);
    return key === 'coverOnDark' ? 1 : 0;
  };

  const nibOf = (pen) => {
    if (pen && Number.isFinite(pen.nibMm) && pen.nibMm > 0) return pen.nibMm;
    const PM = Vectura.PenModel;
    const m = PM.modelOf(pen);
    const s = m && PM.sizeOf(m, pen.size);
    return s && Number.isFinite(s.nominalWidthMm) ? s.nominalWidthMm : fin(pen && pen.width, 0.3);
  };

  const metrics = (docPen, paperType) => {
    const t = traitsOn(docPen, paperType);
    const laid = t ? t.laidW : fin(docPen.width, 0.3);
    return {
      nibMm: nibOf(docPen),
      laidMm: laid,
      // paper.feather x featherResponse x (.5 + wet) is unitless (0..1.5); x .15 mm
      // matches the mockup's "wet x paper feather x .15 mm per side".
      bleedMmPerSide: t ? t.feather * 0.15 : 0,
      blobMm: t ? t.startBlobMm : 0,
      overlapPct: Math.round(clamp(inkKey(docPen, 'overlap'), 0, 1) * 100),
      opaque: !!(t && t.opaque),
      skipPct: (t ? t.skipRate : 0) * 100,
      starvePct: Math.round(clamp(inkKey(docPen, 'starvation'), 0, 0.9) * 100),
    };
  };

  const fit = (color, paperType, docPen) => {
    const C = CONTRAST();
    const p = paperFor(paperType);
    const ratio = comp().contrast(color, p.color);
    const cover = docPen && docPen.model ? inkKey(docPen, 'coverOnDark') : 1;
    const faint = ratio < C.faint || (comp().isDark(p.color, paperType) && cover < C.darkFaintCover);
    return { ratio, note: faint ? 'barely' : (ratio > C.crisp ? 'crisp' : 'reads'), faint };
  };

  // ---- test strips -----------------------------------------------------------

  const fx = (n, d = 2) => n.toFixed(d);
  const line = (x0, x1, y, n = 24) => {
    const pts = [];
    for (let i = 0; i <= n; i += 1) pts.push({ x: x0 + ((x1 - x0) * i) / n, y });
    return pts;
  };

  const testSpec = (kind, { pen, comp: compPen, paperType, mini = false } = {}) => {
    const box = mini ? (cfg().MATRIX_CELL_MM || DEF.MATRIX_CELL_MM) : (cfg().STRIP_MM || DEF.STRIP_MM);
    const w = box.w; const h = box.h;
    const m = metrics(pen, paperType);
    const y = h / 2; const x0 = 0.5; const x1 = w - 0.5;
    const spec = { kind, values: {}, strokes: [], boxMm: { w, h } };
    const one = (pts, p = pen) => spec.strokes.push({ pen: p, pts });
    if (kind === 'line') {
      spec.values = { nib: fx(m.nibMm), laid: fx(m.laidMm) };
      one(line(x0, x1, y));
    } else if (kind === 'bleed') {
      spec.values = { mm: fx(m.bleedMmPerSide) };
      one(line(x0, x1, y));
    } else if (kind === 'blob') {
      const mid = w / 2; const gap = w * 0.06;
      spec.values = { mm: fx(m.laidMm + m.blobMm) };
      one(line(x0 + 0.4, mid - gap, y, 10));
      one(line(mid + gap, x1 - 0.4, y, 10));
    } else if (kind === 'cross') {
      const n = mini ? 4 : 8; const step = (w - 2) / n; const pad = Math.min(0.3, h * 0.1);
      spec.values = { pct: m.overlapPct, dye: !m.opaque, mode: m.opaque ? 'opaque' : 'dye' };
      for (let i = 0; i < n; i += 1) {
        const a = 1 + i * step; const b = a + step * 0.8;
        one([{ x: a, y: pad }, { x: b, y: h - pad }], pen);
        one([{ x: b, y: pad }, { x: a, y: h - pad }], compPen || pen);
      }
    } else if (kind === 'skip') {
      spec.values = { pct: fx(m.skipPct, 1) };
      one(line(x0, x1, y));
    } else if (kind === 'starv') {
      // Real starvation fades over metres of plotting; the strip is 25 mm, so the
      // fade is compressed into the strip: 12 segments of falling width/ink.
      const s = clamp(inkKey(pen, 'starvation'), 0, 0.9);
      spec.values = { pct: m.starvePct };
      spec.compressed = true;
      const segs = s > 0 ? 12 : 1;
      const base = fin(pen.width, m.laidMm);
      const op0 = Vectura.PenModel.inkValue(pen, 'opacity');
      for (let i = 0; i < segs; i += 1) {
        const f = segs > 1 ? i / (segs - 1) : 0;
        const a = x0 + ((x1 - x0) * i) / segs; const b = x0 + ((x1 - x0) * (i + 1)) / segs;
        const clone = segs > 1
          ? { ...pen, width: Math.max(0.05, base * (1 - s * f * 0.45)), ink: { ...(pen.ink || {}), opacity: clamp(op0 * (1 - s * f * 0.7), 0, 1) } }
          : pen;
        one([{ x: a, y }, { x: b + (i < segs - 1 ? 0.05 : 0), y }], clone);
      }
    }
    return spec;
  };

  // ---- weave -----------------------------------------------------------------

  const isComp = (i, n, mode) => (mode === 'third' ? i % 3 === 2 : mode === 'mid' ? i === Math.floor(n / 2) : i % 2 === 1);

  const weave = (n, mode, { w, h }) => {
    const W = cfg().WEAVE || DEF.WEAVE;
    const count = clamp(Math.round(n), W.min, W.max);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const y0 = (h * (i + 1)) / (count + 1);
      const pts = [];
      for (let k = 0; k <= 80; k += 1) {
        const u = k / 80;
        const env = 0.35 + 0.65 * Math.sin(Math.PI * u);
        pts.push({
          x: w * (0.043 + 0.914 * u),
          y: y0 + env * h * (0.069 * Math.sin(u * 7.5 + i * 0.9) + 0.035 * Math.sin(u * 2.6 - i * 0.5)),
        });
      }
      out.push({ pts, comp: isComp(i, count, mode) });
    }
    return out;
  };

  Vectura.PenStudioLab = { paperFor, papers, metrics, fit, testSpec, weave, inkKey };
})();
