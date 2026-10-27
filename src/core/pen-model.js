/**
 * Pen model resolution (pen models) — window.Vectura.PenModel.
 *
 * Turns a document pen record + the project paper into the numbers the ink
 * renderer (src/render/ink-renderer.js) draws with. Pure: no DOM, no canvas.
 *
 *   isPlain(pen)                 true for a colour + diameter pen (no known
 *                                model, no ink overrides)
 *   modelOf(pen)                 the catalogue model, or null (plain / unknown)
 *   sizeOf(model, label)         a size record, or null
 *   applyModel(pen, id, size?)   writes model/size/width for a model pick
 *                                (id null/'plain' clears it); returns pen
 *   applySize(pen, label)        size pick: laid width, keeps ink overrides
 *   syncSizeToWidth(pen)         typed width ≠ size laid width → 'custom'
 *   inkDefaults(pen)             the slider defaults ({ wetness, roughness,
 *                                opacity, blobs, skips, jitter })
 *   inkValue(pen, key)           override ?? model default
 *   resolveTraits(pen, paper, paperInfo)
 *                                merged render traits, or null when the pen is
 *                                drawn exactly as before (a plain pen on a
 *                                non-realistic paper)
 *   traitsKey(traits)            stable hash of everything that shapes the
 *                                ribbon geometry (ribbon cache key)
 *
 * Combining pen × paper (pen fields scale the paper's, research formulas):
 *   laidW   = pen.width + absorbency · bleed · absorbentWidthGainMm · (wet / model wet)
 *   feather = paper.feather · featherResponse · (0.5 + wet)
 *   edgeAmp = 0.8 · laidW · roughness · (0.5 + feather) · paperK
 *             paperK = 0.3 + 1.4 · paper bleed on realistic paper, 0.35 on None
 *   ink     = translucent dye on light stock: colour c^√opacity at alpha 1
 *             (absorbance); dark stock: alpha max(0.12, coverOnDark);
 *             opaque ink: alpha opacity (coverOnDark on dark stock)
 * A plain pen with no overrides on a non-realistic paper resolves to null
 * (edgeAmp 0, the exact pre-model renderer path).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const cat = () => Vectura.PEN_MODELS || { MODELS: Object.create(null), PLAIN_TRAITS: {}, PARAM_LIMITS: {}, INK_KEYS: [] };
  const own = (obj, key) => !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

  const modelOf = (pen) => {
    if (!pen || typeof pen.model !== 'string' || pen.model === 'plain') return null;
    const M = cat().MODELS;
    return own(M, pen.model) ? M[pen.model] : null;
  };

  const hasInk = (pen) => !!(pen && pen.ink && typeof pen.ink === 'object'
    && (cat().INK_KEYS || []).some((k) => own(pen.ink, k) && Number.isFinite(pen.ink[k])));

  const isPlain = (pen) => !modelOf(pen) && !hasInk(pen);

  const sizeOf = (model, label) => {
    if (!model || !Array.isArray(model.sizes)) return null;
    return model.sizes.find((s) => s.label === label) || null;
  };

  const defaultSizeOf = (model) => sizeOf(model, model && model.defaultSize) || (model && model.sizes && model.sizes[0]) || null;

  // Model pick: model + size + laid width (the plotted width). Clears ink
  // overrides and the explicit effect (the model's defaults apply).
  const applyModel = (pen, modelId, sizeLabel) => {
    if (!pen) return pen;
    const M = cat().MODELS;
    if (!modelId || modelId === 'plain' || !own(M, modelId)) {
      delete pen.model;
      delete pen.size;
      delete pen.ink;
      delete pen.effect;
      delete pen.color2;
      return pen;
    }
    const model = M[modelId];
    const size = sizeOf(model, sizeLabel) || defaultSizeOf(model);
    pen.model = modelId;
    if (size) {
      pen.size = size.label;
      if (Number.isFinite(size.laidWidthMm)) pen.width = Math.round(size.laidWidthMm * 1000) / 1000;
    }
    delete pen.ink;
    delete pen.effect;
    delete pen.color2;
    return pen;
  };

  // Size pick on a model pen: writes the size's laid width; keeps the ink
  // overrides. 'custom' (or an unknown label) leaves the width alone.
  const applySize = (pen, sizeLabel) => {
    const model = modelOf(pen);
    if (!model) return pen;
    const size = sizeOf(model, sizeLabel);
    if (!size) { pen.size = 'custom'; return pen; }
    pen.size = size.label;
    if (Number.isFinite(size.laidWidthMm)) pen.width = Math.round(size.laidWidthMm * 1000) / 1000;
    return pen;
  };

  // A typed / dragged width on a model pen that no longer matches the size's
  // laid width marks the size 'custom'.
  const syncSizeToWidth = (pen) => {
    const model = modelOf(pen);
    if (!model) return pen;
    const size = sizeOf(model, pen.size);
    if (!size || Math.abs(size.laidWidthMm - pen.width) > 1e-6) {
      const match = model.sizes.find((s) => Math.abs(s.laidWidthMm - pen.width) <= 1e-6);
      pen.size = match ? match.label : 'custom';
    }
    return pen;
  };

  const baseOf = (pen) => modelOf(pen) || cat().PLAIN_TRAITS || {};

  const inkDefaults = (pen) => {
    const b = baseOf(pen);
    return {
      wetness: num(b.bleed && b.bleed.wetness),
      roughness: num(b.edge && b.edge.roughness),
      opacity: num(b.opacity, 1),
      blobs: 1,
      skips: num(b.skip && b.skip.rate),
      jitter: num(b.widthJitter && b.widthJitter.amount),
    };
  };

  const inkValue = (pen, key) => {
    const ink = pen && pen.ink;
    if (ink && own(ink, key) && Number.isFinite(ink[key])) {
      const lim = (cat().PARAM_LIMITS || {})[key];
      return lim ? clamp(ink[key], lim[0], lim[1]) : ink[key];
    }
    const d = inkDefaults(pen);
    return own(d, key) ? d[key] : 0;
  };

  // FNV-1a over a string → uint32 (pen id hash for the noise seed).
  const hashStr = (s) => {
    let h = 0x811c9dc5;
    const str = `${s}`;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  const luminance = (hex) => {
    const P = Vectura.Paper;
    if (P && typeof P.luminance === 'function') return P.luminance(hex);
    const m = /^#?([0-9a-f]{6})$/i.exec(`${hex || ''}`);
    if (!m) return 1;
    const v = parseInt(m[1], 16);
    const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
  };

  // Per-channel transmittance c^rho (sRGB, as the canvas multiplies it).
  const dyeColor = (hex, rho) => {
    const m = /^#?([0-9a-f]{3,8})$/i.exec(`${hex || ''}`);
    if (!m) return hex;
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    const v = parseInt(h.slice(0, 6), 16);
    const ch = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.round(255 * ((c / 255) ** rho)));
    return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  };

  const isRealisticPaper = (paper) => {
    const P = Vectura.Paper;
    if (P && typeof P.isRealistic === 'function') return P.isRealistic(paper);
    return !!(paper && paper.type && paper.type !== 'none');
  };

  const resolveTraits = (pen, paper, paperInfo) => {
    if (!pen) return null;
    const model = modelOf(pen);
    const realistic = isRealisticPaper(paper);
    if (!model && !hasInk(pen) && !realistic) return null;
    const b = baseOf(pen);
    const info = realistic ? (paperInfo || {}) : {};
    const bleedS = realistic ? clamp(num(paper && paper.bleed), 0, 1) : 0;
    const absorb = clamp(num(info.absorbency), 0, 1);

    const baseWet = num(b.bleed && b.bleed.wetness);
    const wet = inkValue(pen, 'wetness');
    const rough = inkValue(pen, 'roughness');
    const opacity = inkValue(pen, 'opacity');
    const blobsK = inkValue(pen, 'blobs');
    const skipRate = inkValue(pen, 'skips');
    const jitter = inkValue(pen, 'jitter');
    const wetK = baseWet > 0 ? wet / baseWet : 1 + wet;

    const width = Math.max(0.01, num(pen.width, 0.3));
    const laidW = width + absorb * bleedS * num(b.absorbentWidthGainMm) * wetK;
    const feather = clamp(num(info.feather) * num(b.bleed && b.bleed.featherResponse) * (0.5 + wet), 0, 1.5);
    const paperK = realistic ? 0.3 + 1.4 * bleedS : 0.35;
    // ×1.6 calibrated on the reference scan: a 0.4 mm fibre-tip line on
    // absorbent stock shows ≈ ±0.03 mm lumps.
    const edgeAmpMm = 0.8 * laidW * rough * (0.5 + feather) * paperK;
    // Edge lumps follow the paper grain (reference: lumps at ~0.3× the grain).
    const grain = realistic ? num(info.grainMm, 0.8) : 0.6;
    const edgeScaleMm = Math.max(num(b.edge && b.edge.scaleMm, 0.05) * 3, 0.3 * grain);

    const darkStock = realistic && luminance(paper && paper.color) < 0.4;
    const baseOpacity = num(b.opacity, 1) || 1;
    const opaque = b.blend === 'source-over';
    // Translucent dye on light stock is an ABSORBER, not a veil: one pass
    // multiplies the paper by the dye's transmittance c^ρ (Beer–Lambert,
    // ρ = √opacity), drawn at full alpha — a black Sharpie stays near-black,
    // a pale yellow stays a transparent yellow, and crossings compound.
    // On dark stock a dye barely shows: coverOnDark with a small floor.
    const dark = darkStock && !opaque;
    const dyeFloor = (cat().LIMITS && cat().LIMITS.dyeOnDarkFloor) || 0.12;
    let alpha;
    let inkColor = pen.color;
    if (opaque || !model) {
      alpha = clamp(darkStock && model ? num(b.coverOnDark, 1) * (opacity / baseOpacity) : (model ? opacity : 1), 0, 1);
    } else if (dark) {
      alpha = clamp(Math.max(dyeFloor, num(b.coverOnDark)) * (opacity / baseOpacity), 0, 1);
    } else {
      alpha = 1;
      inkColor = dyeColor(pen.color, Math.sqrt(clamp(opacity, 0.01, 1)));
    }

    // Pools scale with the ink's wetness and the paper's absorbency a little.
    const poolK = blobsK * (0.75 + 0.5 * absorb * bleedS);
    const nib = model && model.nibDirectional ? { strength: num(model.nibDirectional.strength), angle: num(model.nibDirectional.angleRad) } : null;
    const effect = (typeof pen.effect === 'string' && pen.effect) || (model && model.effect) || 'plain';

    // Pen-dependent noise seed on the paper's seed: deterministic, sheet-locked.
    const seed = ((num(paper && paper.seed, 1) | 0) ^ hashStr(pen.id || 'pen')) >>> 0;

    return {
      penId: pen.id,
      plain: !model,
      modelId: model ? model.id : null,
      color: pen.color,
      inkColor,
      dyeOnDark: dark,
      width,
      laidW,
      edgeAmpMm,
      edgeScaleMm,
      feather,
      jitter: clamp(jitter, 0, 0.5),
      jitterScaleMm: Math.max(0.5, num(b.widthJitter && b.widthJitter.scaleMm, 5)),
      startBlobMm: num(b.startBlob && b.startBlob.mm) * poolK,
      startBlobP: clamp(num(b.startBlob && b.startBlob.probability) * Math.min(1.5, blobsK), 0, 1),
      endPoolMm: num(b.endPool && b.endPool.mm) * poolK,
      cornerPool: num(b.cornerPool) * blobsK,
      skipRate: clamp(skipRate, 0, 0.25),
      skipLenMm: Math.max(0.2, num(b.skip && b.skip.lengthMm, 1)),
      starveLenMm: num(b.starvation && b.starvation.lengthMm),
      starveStrength: clamp(num(b.starvation && b.starvation.strength), 0, 0.9),
      nib,
      alpha,
      opaque,
      overlapDarkening: clamp(num(b.overlapDarkening), 0, 1),
      dryskipK: clamp(0.5 + num(b.dryskipResponse, 0.5), 0, 2),
      haloWeight: clamp(wet / 0.5, 0, 1),
      effect,
      seed,
      realistic,
    };
  };

  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const traitsKey = (t) => {
    if (!t) return '';
    return [
      t.seed, r4(t.laidW), r4(t.edgeAmpMm), r4(t.edgeScaleMm), r4(t.jitter), r4(t.jitterScaleMm),
      r4(t.startBlobMm), r4(t.startBlobP), r4(t.endPoolMm), r4(t.cornerPool), r4(t.skipRate), r4(t.skipLenMm),
      r4(t.starveLenMm), r4(t.starveStrength), t.nib ? `${r4(t.nib.strength)}/${r4(t.nib.angle)}` : '-',
    ].join('|');
  };

  // Chip label: "Plain", or "<short> · <size>".
  const labelOf = (pen) => {
    const model = modelOf(pen);
    if (!model) return pen && typeof pen.model === 'string' && pen.model !== 'plain' ? `${pen.model}` : 'Plain';
    const size = pen.size === 'custom' ? 'custom' : (pen.size || '');
    return size ? `${model.short} · ${size}` : model.short;
  };

  Vectura.PenModel = {
    isPlain,
    hasInk,
    modelOf,
    sizeOf,
    defaultSizeOf,
    applyModel,
    applySize,
    syncSizeToWidth,
    inkDefaults,
    inkValue,
    resolveTraits,
    traitsKey,
    labelOf,
    hashStr,
    dyeColor,
  };
})();
