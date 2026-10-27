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

  // ---- special inks ---------------------------------------------------------

  // The pen's effective special ink: its own `effect`, else its model's
  // default; 'plain' when none.
  const effectOf = (pen) => {
    const E = cat().EFFECTS || [];
    // An explicit 'plain' switches a model's built-in special ink off.
    if (pen && pen.effect === 'plain') return 'plain';
    if (pen && typeof pen.effect === 'string' && E.includes(pen.effect)) return pen.effect;
    const model = modelOf(pen);
    return model && E.includes(model.effect) ? model.effect : 'plain';
  };

  // Model fx block for an effect (dual metallic reads the metallic block).
  const modelFx = (model, effect) => {
    const fx = model && model.fx;
    if (!fx) return null;
    if (effect === 'glow') return fx.glowInDark || null;
    if (effect === 'dual-metallic') return fx.metallic || null;
    if (effect === 'glitter' && fx.glitter) {
      const g = fx.glitter;
      return { flakeDensity: g.density, flakeSizeMm: g.sizeMm, sizeJitter: g.sizeJitter, strength: g.sparkle };
    }
    return fx[effect] || null;
  };

  // Effect parameters: EFFECT_DEFAULTS[effect] ← the model's fx (only for
  // the model's own effect family) ← pen.ink.effectStrength / flakeDensity.
  const fxOf = (pen, effectArg) => {
    const effect = effectArg || effectOf(pen);
    if (effect === 'plain') return null;
    const D = (cat().EFFECT_DEFAULTS || {})[effect] || {};
    const out = Object.assign({}, D);
    const model = modelOf(pen);
    const mfx = modelFx(model, effect);
    if (mfx) {
      Object.keys(D).forEach((k) => { if (Number.isFinite(mfx[k])) out[k] = mfx[k]; });
    }
    const ink = pen && pen.ink;
    const lim = cat().PARAM_LIMITS || {};
    if (ink && own(ink, 'effectStrength') && Number.isFinite(ink.effectStrength)) {
      out.strength = clamp(ink.effectStrength, lim.effectStrength ? lim.effectStrength[0] : 0, lim.effectStrength ? lim.effectStrength[1] : 1);
    }
    if (own(out, 'flakeDensity') && ink && own(ink, 'flakeDensity') && Number.isFinite(ink.flakeDensity)) {
      out.flakeDensity = clamp(ink.flakeDensity, lim.flakeDensity ? lim.flakeDensity[0] : 0, lim.flakeDensity ? lim.flakeDensity[1] : 600);
    }
    out.effect = effect;
    return out;
  };

  const hasFlakes = (effect) => effect === 'metallic' || effect === 'dual-metallic' || effect === 'glitter' || effect === 'glow';

  // Special-inks swatch pick: colour + effect (+ color2). One undo step is
  // the caller's job (PensPanel.commitPenEdit). `null` clears the effect.
  const applyEffectSwatch = (pen, swatch) => {
    if (!pen) return pen;
    if (!swatch) {
      // "No special ink": on a model with a built-in effect (Gelly Roll
      // Metallic, Moonlight, …) that needs an explicit 'plain' override.
      const model = modelOf(pen);
      if (model && model.effect && model.effect !== 'plain') pen.effect = 'plain';
      else delete pen.effect;
      delete pen.color2;
      return pen;
    }
    if (typeof swatch.hex === 'string') pen.color = swatch.hex;
    if (typeof swatch.effect === 'string' && (cat().EFFECTS || []).includes(swatch.effect)) pen.effect = swatch.effect;
    else delete pen.effect;
    const second = swatch.color2 || swatch.secondHex || swatch.glowHex;
    if (typeof second === 'string' && /^#[0-9a-f]{6}$/i.test(second)) pen.color2 = second;
    else delete pen.color2;
    pen.themeManaged = false;
    return pen;
  };

  const swatchById = (id) => (cat().EFFECT_SWATCHES || []).find((s) => s.id === id) || null;

  // ---- colour helpers -------------------------------------------------------
  const rgbOf = (hex) => {
    const m = /^#?([0-9a-f]{3,8})$/i.exec(`${hex || ''}`);
    if (!m) return [0, 0, 0];
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    const v = parseInt(h.slice(0, 6), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  const hexOf = (rgb) => `#${rgb.map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
  const mixHex = (a, b, k) => {
    const x = rgbOf(a); const y = rgbOf(b);
    return hexOf(x.map((c, i) => c + (y[i] - c) * k));
  };
  // Neon: push the chroma up (HSL saturation), keep the lightness.
  const neonHex = (hex) => {
    const [r, g, b] = rgbOf(hex).map((c) => c / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return hexOf([r * 255, g * 255, b * 255]);
    const d = mx - mn;
    const s0 = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
    const s = Math.min(1, s0 * 1.15 + 0.1);
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      let u = t; if (u < 0) u += 1; if (u > 1) u -= 1;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 1 / 2) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    return hexOf([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]);
  };

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
    const out = {
      wetness: num(b.bleed && b.bleed.wetness),
      roughness: num(b.edge && b.edge.roughness),
      opacity: num(b.opacity, 1),
      blobs: 1,
      skips: num(b.skip && b.skip.rate),
      jitter: num(b.widthJitter && b.widthJitter.amount),
    };
    // Special inks: the effect sliders' defaults (only while an effect is set).
    const eff = effectOf(pen);
    if (eff !== 'plain') {
      const base = Object.assign({}, (cat().EFFECT_DEFAULTS || {})[eff] || {});
      const mfx = modelFx(modelOf(pen), eff);
      if (mfx) Object.keys(base).forEach((k) => { if (Number.isFinite(mfx[k])) base[k] = mfx[k]; });
      out.effectStrength = num(base.strength, 1);
      if (Number.isFinite(base.flakeDensity)) out.flakeDensity = base.flakeDensity;
    }
    return out;
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
    const effect = effectOf(pen);
    if (!model && !hasInk(pen) && !realistic && effect === 'plain') return null;
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

    // Special inks (preview only): the base ink's colour / coverage per
    // effect, plus the fx block the effects layer draws with.
    const fx = fxOf(pen, effect);
    let effOpaque = opaque;
    if (fx) {
      // Effects look at the sheet colour itself (paper None too).
      const darkSheet = luminance(paper && paper.color) < 0.4;
      const strength = clamp(num(fx.strength, 1), 0, 1);
      const userOpacity = hasInk(pen) && own(pen.ink, 'opacity') ? clamp(opacity, 0, 1) : null;
      if (effect === 'white') {
        // Opaque white paint: covers dark stock (source-over), never multiplies.
        effOpaque = true;
        alpha = userOpacity != null ? userOpacity : (darkSheet ? num(fx.coverOnDark, 0.92) : Math.max(alpha, 0.95));
        inkColor = pen.color;
      } else if (effect === 'metallic' || effect === 'dual-metallic') {
        // Metallic gel is opaque; off the glint it reads darker than its swatch.
        effOpaque = true;
        if (!opaque) alpha = userOpacity != null ? userOpacity : (darkSheet ? 0.88 : 0.95);
        // Off the glint metallic ink reads a little darker than its swatch
        // on white; on dark stock its flakes scatter light, so it lifts.
        inkColor = darkSheet
          ? mixHex(pen.color, '#ffffff', 0.1 * strength)
          : mixHex(pen.color, '#000000', clamp(num(fx.baseDarken) * 0.5 * strength, 0, 0.9));
      } else if (effect === 'fluorescent') {
        effOpaque = true;
        if (!opaque) alpha = userOpacity != null ? userOpacity : (darkSheet ? 0.82 : 0.95);
        inkColor = neonHex(pen.color);
      } else if (effect === 'glow') {
        // Daylight: a pale, grainy, chalky lacquer — cream on dark stock
        // (not a translucent olive), barely there on white.
        effOpaque = true;
        alpha = userOpacity != null ? userOpacity : (darkSheet ? 0.88 : clamp(num(fx.dayAlpha, 0.6), 0.05, 1));
        inkColor = darkSheet ? mixHex(pen.color, '#f4f1e2', 0.55) : pen.color;
      } else if (effect === 'glitter' && !model) {
        // Translucent tinted gel; the particles carry the sparkle.
        alpha = userOpacity != null ? userOpacity : clamp(num(fx.alpha, 0.7), 0.05, 1);
      }
      const second = /^#[0-9a-f]{6}$/i.test(`${pen.color2 || ''}`) ? pen.color2 : null;
      fx.base = pen.color;
      fx.sheen = effect === 'dual-metallic'
        ? mixHex(second || mixHex(pen.color, '#ffffff', 0.5), '#ffffff', 0.2)
        : mixHex(pen.color, '#ffffff', effect === 'glitter' ? 0.45 : 0.55);
      fx.flake = effect === 'dual-metallic' ? mixHex(second || pen.color, '#ffffff', 0.35) : mixHex(pen.color, '#ffffff', 0.7);
      fx.flakeAlt = effect === 'glitter' ? mixHex(pen.color, '#ffffff', 0.25) : fx.flake;
      // Glitter particles off the glint: lighter than the gel on dark
      // stock, a shade darker on light stock (so they read on white).
      fx.particle = darkSheet ? fx.flakeAlt : mixHex(pen.color, '#000000', 0.3);
      fx.grainColor = darkSheet ? mixHex(pen.color, '#b9b8a6', 0.6) : mixHex(pen.color, '#8a9078', 0.55);
      fx.glow = effect === 'glow' ? (second || cat().GLOW_DEFAULT_HEX || '#7dff9a') : null;
      fx.neon = effect === 'fluorescent' ? inkColor : null;
      fx.darkStock = darkSheet;
      fx.flakes = hasFlakes(effect);
    }
    // A plain pen that only carries an effect, on paper None: crisp edges
    // (no lumps, pools or skips) — the effect layer adds the look.
    const crisp = !model && !hasInk(pen) && !realistic;

    // Pen-dependent noise seed on the paper's seed: deterministic, sheet-locked.
    const seed = ((num(paper && paper.seed, 1) | 0) ^ hashStr(pen.id || 'pen')) >>> 0;

    const out = {
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
      opaque: effOpaque,
      overlapDarkening: clamp(num(b.overlapDarkening), 0, 1),
      dryskipK: clamp(0.5 + num(b.dryskipResponse, 0.5), 0, 2),
      haloWeight: clamp(wet / 0.5, 0, 1),
      effect,
      fx,
      seed,
      realistic,
    };
    if (crisp) {
      out.edgeAmpMm = 0; out.jitter = 0; out.startBlobMm = 0; out.startBlobP = 0; out.endPoolMm = 0;
      out.cornerPool = 0; out.skipRate = 0; out.starveLenMm = 0; out.starveStrength = 0; out.nib = null;
    }
    return out;
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

  // Special ink name for labels ('' when plain).
  const EFFECT_NAMES = { metallic: 'Metallic', 'dual-metallic': 'Dual metallic', fluorescent: 'Neon', glow: 'Glow in the dark', glitter: 'Glitter', white: 'Opaque white' };
  const effectLabel = (pen) => {
    const e = effectOf(pen);
    return e === 'plain' ? '' : (EFFECT_NAMES[e] || e);
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
    effectOf,
    effectLabel,
    fxOf,
    applyEffectSwatch,
    swatchById,
    mixHex,
    neonHex,
  };
})();
