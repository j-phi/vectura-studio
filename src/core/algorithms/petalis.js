/**
 * Petalis algorithm: radial petal structures with center modifiers.
 */
(() => {
  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = 137.507764;
  const { clamp, lerp } = window.Vectura.AlgorithmUtils;
  const smoothstep = (edge0, edge1, x) => {
    const denom = Math.max(1e-6, edge1 - edge0);
    const t = clamp((x - edge0) / denom, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hasDesignerAnchors = (designer) =>
    Array.isArray(designer?.anchors) && designer.anchors.length >= 2;
  const normalizeDesignerSymmetry = (value) => {
    if (value === 'horizontal' || value === 'vertical' || value === 'both') return value;
    return 'none';
  };
  const normalizeDesignerTarget = (value) =>
    value === 'inner' || value === 'outer' || value === 'both' ? value : 'both';
  const profileBlendWeight = (progress, positionPct, featherPct) => {
    const pos = clamp((positionPct ?? 50) / 100, 0, 1);
    const feather = clamp((featherPct ?? 0) / 100, 0, 1);
    if (feather <= 1e-6) return progress >= pos ? 1 : 0;
    const half = feather * 0.5;
    const start = pos - half;
    const end = pos + half;
    return smoothstep(start, end, progress);
  };
  const toRad = (deg) => (deg * Math.PI) / 180;
  const tipClamp = (t, tipCurl, sharpness, profile) => {
    const curl = clamp(tipCurl ?? 0, 0, 1);
    const sharp = clamp(sharpness ?? 0, 0, 1);
    const allowFull = profile === 'oval';
    const minClamp = sharp <= 0 && !allowFull ? 0.06 : 0;
    const clampAmt = Math.max(0, minClamp * (1 - curl));
    return clamp(t, clampAmt, 1 - clampAmt);
  };
  const tipLengthScale = (tipCurl) => 1 - clamp(tipCurl ?? 0, 0, 1) * 0.35;
  const pathLength = (path) => {
    if (!Array.isArray(path) || path.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < path.length; i++) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      len += Math.hypot(dx, dy);
    }
    return len;
  };
  // Arch-7 (audit 2026-05-20): the inline `fallbackNoiseRack` (with its own
  // `combineBlend` + `createEvaluator`) was removed. `src/core/noise-rack.js`
  // is loaded before `src/core/algorithms/petalis.js` in index.html, so the
  // fallback was unreachable dead code AND a maintenance hazard — a parallel
  // implementation that maintainers could silently edit instead of NoiseRack
  // itself. We now reference `window.Vectura.NoiseRack` directly and throw
  // a loud, clear error if it ever goes missing (i.e. someone reorders the
  // <script> tags in index.html).
  const getNoiseRackApi = () => {
    const rack = window.Vectura?.NoiseRack;
    if (!rack) {
      throw new Error(
        'petalis: window.Vectura.NoiseRack is unavailable. ' +
          'Ensure src/core/noise-rack.js is loaded before src/core/algorithms/petalis.js.'
      );
    }
    return rack;
  };
  const createLegacyNoiseLayer = (overrides = {}) => ({
    enabled: true,
    type: 'simplex',
    blend: 'add',
    amplitude: 1,
    zoom: 0.2,
    freq: 1,
    angle: 0,
    shiftX: 0,
    shiftY: 0,
    tileMode: 'off',
    tilePadding: 0,
    patternScale: 1,
    warpStrength: 1,
    cellularScale: 1,
    cellularJitter: 1,
    stepsCount: 5,
    seed: 0,
    octaves: 1,
    lacunarity: 2,
    gain: 0.5,
    noiseStyle: 'linear',
    noiseThreshold: 0,
    imageWidth: 1,
    imageHeight: 1,
    microFreq: 0,
    imageInvertColor: false,
    imageInvertOpacity: false,
    imageId: '',
    imageName: '',
    imagePreview: '',
    imageAlgo: 'luma',
    imageEffects: [],
    polygonZoomReference: 0.01,
    polygonRadius: 2,
    polygonSides: 6,
    polygonRotation: 0,
    polygonOutline: 0,
    polygonEdgeRadius: 0,
    ...overrides,
  });
  const createNoiseStackSampler = ({ noise, seed = 0, layers = [], fallbackLayer }) => {
    const rackApi = getNoiseRackApi();
    const rack = rackApi.createEvaluator({ noise, seed });
    const baseLayer = createLegacyNoiseLayer(fallbackLayer || {});
    const activeLayers = (Array.isArray(layers) && layers.length ? layers : [baseLayer])
      .map((layer) => ({
        ...baseLayer,
        ...(layer || {}),
        enabled: layer?.enabled !== false,
      }))
      .filter((layer) => layer.enabled !== false);
    const maxAmp = activeLayers.reduce((sum, layer) => sum + Math.abs(layer.amplitude ?? 0), 0) || 1;
    return (x, y, meta = {}) => {
      let combined;
      activeLayers.forEach((layer) => {
        const value = rack.sampleScalar(x, y, layer, meta) * (layer.amplitude ?? 1);
        combined = rackApi.combineBlend({
          combined,
          value,
          blend: layer.blend || 'add',
          maxAmplitude: maxAmp,
        });
      });
      return combined ?? 0;
    };
  };

  const slicePathByPattern = (path, dash, gap) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    const segments = [];
    let draw = true;
    let remaining = dash;
    let current = [];

    for (let i = 0; i < path.length - 1; i++) {
      let a = path[i];
      let b = path[i + 1];
      let segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen < 1e-6) continue;
      while (segLen > 1e-6) {
        const step = Math.min(segLen, remaining);
        const t = step / segLen;
        const pt = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
        if (draw) {
          if (!current.length) current.push(a);
          current.push(pt);
        }
        segLen -= step;
        a = pt;
        if (Math.abs(step - remaining) < 1e-6) {
          if (draw && current.length > 1) segments.push(current);
          current = [];
          draw = !draw;
          remaining = draw ? dash : gap;
        } else {
          remaining -= step;
        }
      }
    }
    if (draw && current.length > 1) segments.push(current);
    return segments;
  };

  const applyLineType = (path, lineType, spacing) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    const safeSpacing = Math.max(0.2, spacing || 0.5);
    if (lineType === 'dashed') {
      return slicePathByPattern(path, safeSpacing * 2, safeSpacing * 1.2);
    }
    if (lineType === 'dotted') {
      return slicePathByPattern(path, safeSpacing * 0.4, safeSpacing * 1.4);
    }
    if (lineType === 'stitch') {
      return slicePathByPattern(path, safeSpacing * 1.2, safeSpacing * 0.8);
    }
    return [path];
  };

  // Petal silhouette library. Each profile is a smooth, CONVEX half-width(t)
  // curve (t: 0 = base/attachment, 1 = apex/tip) built from a peak-shifted sine
  // so the widest point sits where that morphology actually bulges — ovate
  // petals widest below the middle, spatulate/obovate widest near the tip, etc.
  // `round` < 1 = fuller/blunter margin, > 1 = narrower/more acute. `notch`
  // carves a soft apical cleft (obcordate / emarginate). This replaces the old
  // bezier-times-sharpness^2.6 construction that collapsed every profile into an
  // identical concave 4-pointed star.
  const PETAL_SHAPES = {
    // peak  = where the petal is widest (0 base .. 1 tip)
    // round = margin fullness (<1 blunt/full, >1 acute/narrow)
    // claw  = base-neck fraction (larger = longer slender attachment)
    // notch = apical cleft depth (heart / obcordate)
    oval: { peak: 0.5, round: 0.62, claw: 0.1 },
    rounded: { peak: 0.5, round: 0.44, claw: 0.08 },
    teardrop: { peak: 0.42, round: 0.74, claw: 0.16 },
    ovate: { peak: 0.4, round: 0.8, claw: 0.18 },
    lanceolate: { peak: 0.34, round: 1.45, claw: 0.22 },
    marquise: { peak: 0.5, round: 1.5, claw: 0.2 },
    dagger: { peak: 0.28, round: 2.0, claw: 0.24 },
    spatulate: { peak: 0.72, round: 0.7, claw: 0.26 },
    spoon: { peak: 0.74, round: 0.5, claw: 0.2 },
    heart: { peak: 0.66, round: 0.56, claw: 0.18, notch: 0.6 },
    notched: { peak: 0.58, round: 0.58, claw: 0.14, notch: 0.4 },
  };

  const smoothstep01 = (x) => {
    const c = clamp(x, 0, 1);
    return c * c * (3 - 2 * c);
  };

  const petalShape = (t, type) => {
    const s = PETAL_SHAPES[type] || PETAL_SHAPES.oval;
    const m = s.peak;
    // Peak-shifted argument: maps [0,m]->[0,0.5] and [m,1]->[0.5,1] so sin() peaks at t=m.
    const g =
      t <= m
        ? 0.5 * (t / Math.max(1e-4, m))
        : 0.5 + 0.5 * ((t - m) / Math.max(1e-4, 1 - m));
    let w = Math.pow(Math.max(0, Math.sin(Math.PI * g)), s.round);
    // Base claw: real petals attach at a narrowed neck, not a blunt balloon.
    // Suppress the half-width over the first ~claw fraction of the length so the
    // base tapers to a slender stalk (and, in a flower, the bases converge on
    // the receptacle instead of jamming as fat blocks).
    const clawEnd = s.claw ?? 0.16;
    if (clawEnd > 0) w *= 0.06 + 0.94 * smoothstep01(t / clawEnd);
    if (s.notch) {
      // Bilobed apex: pinch the half-width over the last ~16% so the two margins
      // dip toward the centreline and read as a heart/obcordate cleft.
      const n = clamp((t - 0.84) / 0.16, 0, 1);
      w *= 1 - s.notch * Math.pow(n, 1.4);
    }
    return w;
  };

  // Kept for callers that sample width along the petal (shading, non-designer
  // path). Now delegates to the unified convex shape library.
  const profileBase = (t, type) => petalShape(t, type);

  const sharpnessExponent = (t, sharpness) => {
    const amt = clamp(sharpness ?? 0, 0, 1);
    const bias = 0.2 + 0.8 * clamp(t, 0, 1);
    return lerp(0.9, 2.6, amt * bias);
  };

  const widthAt = (t, opts) => {
    const {
      profile,
      centerProfile,
      morphWeight,
      sharpness,
      baseFlare,
      basePinch,
      waveAmp,
      waveFreq,
      wavePhase,
    } = opts;
    const base = profileBase(t, profile);
    const center = profileBase(t, centerProfile || profile);
    let w = lerp(base, center, morphWeight);
    const sharpPow = sharpnessExponent(t, sharpness);
    w = Math.pow(Math.max(0, w), sharpPow);
    const baseFactor = 1 + (baseFlare - basePinch) * Math.pow(1 - t, 2);
    w *= baseFactor;
    if (waveAmp > 0) {
      w *= 1 + waveAmp * Math.sin(TAU * t * waveFreq + wavePhase);
    }
    return Math.max(0, w);
  };

  const cubicBezierPoint = (p0, p1, p2, p3, t) => {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    const uuu = uu * u;
    const ttt = tt * t;
    return {
      x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
      y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
    };
  };

  const buildLeafProfile = (opts) => {
    const {
      length,
      widthRatio,
      steps,
      profile,
      centerProfile,
      morphWeight,
      sharpness,
      baseFlare,
      basePinch,
      waveAmp,
      waveFreq,
      wavePhase,
      leafSidePos,
      leafSideWidth,
      leafBaseHandle,
      leafSideHandle,
      leafTipHandle,
    } = opts;
    const safeSteps = Math.max(16, Math.round(steps));
    const sideWidth = clamp(leafSideWidth ?? 1, 0.2, 2);
    const maxHalf = Math.max(0.5, widthRatio * length * 0.5 * sideWidth);
    // sharpness gently tunes overall pointiness without producing cusps: 0.5 is
    // neutral, higher = a touch more acute, lower = blunter.
    const sharpAdj = lerp(0.78, 1.28, clamp(sharpness ?? 0.5, 0, 1));
    const points = [];
    for (let i = 0; i <= safeSteps; i++) {
      const t = i / safeSteps;
      let w = petalShape(t, profile);
      if (centerProfile && centerProfile !== profile && morphWeight > 0) {
        w = lerp(w, petalShape(t, centerProfile), clamp(morphWeight, 0, 1));
      }
      w = Math.pow(Math.max(0, w), sharpAdj);
      const baseFactor = 1 + (baseFlare - basePinch) * Math.pow(1 - t, 2);
      const waveFactor = waveAmp > 0 ? 1 + waveAmp * Math.sin(TAU * t * waveFreq + wavePhase) : 1;
      points.push({ x: t * length, y: Math.max(0, maxHalf * w * baseFactor * waveFactor) });
    }
    return points;
  };

  const buildDesignerProfile = (designer, length, widthRatio, steps = 32) => {
    const anchors = Array.isArray(designer?.anchors) ? designer.anchors : [];
    if (anchors.length < 2) return null;
    const clampHandleT = (value) => clamp(value, -1, 2);
    const usable = anchors
      .map((anchor) => ({
        t: clamp(anchor?.t ?? 0, 0, 1),
        w: Math.max(0, anchor?.w ?? 0),
        in: anchor?.in
          ? {
              t: clampHandleT(anchor.in.t ?? anchor.t ?? 0),
              w: Number.isFinite(anchor.in.w) ? anchor.in.w : anchor?.w ?? 0,
            }
          : null,
        out: anchor?.out
          ? {
              t: clampHandleT(anchor.out.t ?? anchor.t ?? 0),
              w: Number.isFinite(anchor.out.w) ? anchor.out.w : anchor?.w ?? 0,
            }
          : null,
      }))
      .sort((a, b) => a.t - b.t);
    if (usable.length < 2) return null;
    usable[0].t = 0;
    usable[0].w = 0;
    usable[usable.length - 1].t = 1;
    usable[usable.length - 1].w = 0;
    const maxHalf = Math.max(0.5, (widthRatio * length * 0.5));
    const toLocal = (point) => ({
      x: point.t * length,
      y: point.w * maxHalf,
    });
    const samples = [];
    const stepsPerSeg = Math.max(6, Math.round((steps || 32) / Math.max(1, usable.length - 1)));
    for (let i = 0; i < usable.length - 1; i++) {
      const a = usable[i];
      const b = usable[i + 1];
      const p0 = toLocal(a);
      const p3 = toLocal(b);
      const outDefault = {
        t: lerp(a.t, b.t, 1 / 3),
        w: a.w,
      };
      const inDefault = {
        t: lerp(a.t, b.t, 2 / 3),
        w: b.w,
      };
      const p1 = toLocal(a.out || outDefault);
      const p2 = toLocal(b.in || inDefault);
      for (let s = 0; s <= stepsPerSeg; s++) {
        const t = s / stepsPerSeg;
        const pt = cubicBezierPoint(p0, p1, p2, p3, t);
        if (samples.length && s === 0) continue;
        samples.push({
          x: clamp(pt.x, 0, length),
          y: Math.max(0, pt.y),
        });
      }
    }
    return samples;
  };

  const sampleProfileWidth = (x, points) => {
    if (!Array.isArray(points) || points.length < 2) return 0;
    if (x <= points[0].x) return points[0].y;
    if (x >= points[points.length - 1].x) return points[points.length - 1].y;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (x <= b.x + 1e-6) {
        const denom = Math.max(1e-6, b.x - a.x);
        const t = (x - a.x) / denom;
        return lerp(a.y, b.y, t);
      }
    }
    return points[points.length - 1].y;
  };

  const applyDesignerProfileSymmetry = (points, length, symmetry) => {
    if (!Array.isArray(points) || points.length < 2) return points;
    const mode = normalizeDesignerSymmetry(symmetry);
    if (mode !== 'horizontal' && mode !== 'vertical' && mode !== 'both') {
      return points.map((pt) => ({ x: pt.x, y: Math.max(0, pt.y) }));
    }
    const safeLength = Math.max(1e-6, length ?? points[points.length - 1]?.x ?? 1);
    return points.map((pt) => {
      const x = clamp(pt.x, 0, safeLength);
      const mirroredX = safeLength - x;
      const mirrored = sampleProfileWidth(mirroredX, points);
      return {
        x,
        y: Math.max(0, (Math.max(0, pt.y) + Math.max(0, mirrored)) * 0.5),
      };
    });
  };

  const blendProfilePoints = (innerPoints, outerPoints, blend, length, steps = 32) => {
    const hasInner = Array.isArray(innerPoints) && innerPoints.length >= 2;
    const hasOuter = Array.isArray(outerPoints) && outerPoints.length >= 2;
    if (!hasInner && !hasOuter) return null;
    if (!hasInner) return outerPoints.map((pt) => ({ x: pt.x, y: pt.y }));
    if (!hasOuter) return innerPoints.map((pt) => ({ x: pt.x, y: pt.y }));
    const mix = clamp(blend, 0, 1);
    const sampleCount = Math.max(12, Math.round(steps));
    const out = [];
    const safeLength = Math.max(1, length);
    for (let i = 0; i <= sampleCount; i++) {
      const t = i / sampleCount;
      const x = safeLength * t;
      const iw = sampleProfileWidth(x, innerPoints);
      const ow = sampleProfileWidth(x, outerPoints);
      out.push({ x, y: Math.max(0, lerp(iw, ow, mix)) });
    }
    return out;
  };

  const buildRoundedTipArc = (left, right, roundAmt) => {
    if (roundAmt <= 0 || left.length < 3 || right.length < 3) {
      return { left, right, arc: [] };
    }
    const leftEdge = left[left.length - 2];
    const rightEdge = right[right.length - 2];
    const midY = (leftEdge.y + rightEdge.y) / 2;
    const half = Math.abs(leftEdge.y - rightEdge.y) / 2;
    if (half < 1e-4) return { left, right, arc: [] };
    const bulge = half * roundAmt;
    const center = { x: leftEdge.x + bulge, y: midY };
    const radius = Math.hypot(bulge, half);
    const a0 = Math.atan2(leftEdge.y - center.y, leftEdge.x - center.x);
    const a1 = Math.atan2(rightEdge.y - center.y, rightEdge.x - center.x);
    const start = Math.max(a0, a1);
    const end = Math.min(a0, a1);
    const steps = Math.max(6, Math.round(12 * roundAmt));
    const arc = [];
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const ang = start + (end - start) * t;
      arc.push({ x: center.x + Math.cos(ang) * radius, y: center.y + Math.sin(ang) * radius });
    }
    return { left: left.slice(0, -1), right: right.slice(0, -1), arc };
  };

  const buildPetal = (opts) => {
    const {
      length,
      widthRatio,
      steps,
      tipTwist,
      tipCurl,
      curlBoost,
      baseX,
      baseY,
      angle,
      profile,
      centerProfile,
      morphWeight,
      sharpness,
      baseFlare,
      basePinch,
      waveAmp,
      waveFreq,
      wavePhase,
      profilePoints,
      leafSidePos,
      leafSideWidth,
      leafBaseHandle,
      leafSideHandle,
      leafTipHandle,
    } = opts;
    const curlAmt = (tipTwist || 0) * (1 + curlBoost);
    const effectiveSharpness = clamp(sharpness ?? 0.5, 0, 1) * (1 - clamp(tipCurl ?? 0, 0, 1) * 0.6);
    const lengthScale = tipLengthScale(tipCurl);
    const effectiveLength = Math.max(1, length * lengthScale);
    const baseProfile =
      profilePoints && profilePoints.length
        ? profilePoints
        : buildLeafProfile({
            length: effectiveLength,
            widthRatio,
            steps,
            profile,
            centerProfile,
            morphWeight,
            sharpness: effectiveSharpness,
            baseFlare,
            basePinch,
            waveAmp,
            waveFreq,
            wavePhase,
            leafSidePos,
            leafSideWidth,
            leafBaseHandle,
            leafSideHandle,
            leafTipHandle,
          });
    const left = baseProfile.map((pt) => {
      const t = clamp(pt.x / effectiveLength, 0, 1);
      const curl = curlAmt * effectiveLength * 0.02 * t * t;
      return { x: pt.x, y: pt.y + curl };
    });
    const right = left.map((pt) => ({ x: pt.x, y: -pt.y }));
    const roundAmt = clamp(tipCurl ?? 0, 0, 1);
    const rounded = buildRoundedTipArc(left, right, roundAmt);
    const outline = rounded.left.concat(rounded.arc, rounded.right.reverse());
    outline.push({ ...outline[0] });
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const transformed = outline.map((pt) => ({
      x: baseX + pt.x * cosA - pt.y * sinA,
      y: baseY + pt.x * sinA + pt.y * cosA,
    }));
    return transformed;
  };

  // A small deterministic LCG (same constants as SeededRNG) used to give the
  // shading pass its OWN random stream per petal, so raising shading jitter or
  // adding a stipple shade never re-rolls the shared layout RNG (which would
  // visibly rearrange the whole flower). Seed is derived from the layer seed +
  // the petal's global index.
  const makeSubRng = (seed) => {
    const m = 0x80000000;
    const a = 1103515245;
    const c = 12345;
    let state = Math.abs(Math.floor(seed)) % m || 1;
    return {
      nextFloat() {
        state = (a * state + c) % m;
        return state / (m - 1);
      },
      nextRange(min, max) {
        return min + this.nextFloat() * (max - min);
      },
    };
  };

  const buildShadingLines = (opts) => {
    const {
      length,
      widthRatio,
      steps,
      profile,
      centerProfile,
      morphWeight,
      sharpness,
      baseFlare,
      basePinch,
      waveAmp,
      waveFreq,
      wavePhase,
      angle,
      baseX,
      baseY,
      shadings,
      tipTwist,
      tipCurl,
      curlBoost,
      rng,
      noise,
      profilePoints,
    } = opts;
    const lines = [];
    const active = Array.isArray(shadings) ? shadings.filter((s) => s && s.enabled !== false) : [];
    if (!active.length) return lines;

    const twist = (tipTwist || 0) * (1 + (curlBoost || 0));
    const effectiveSharpness = clamp(sharpness ?? 0.5, 0, 1) * (1 - clamp(tipCurl ?? 0, 0, 1) * 0.6);
    const lengthScale = tipLengthScale(tipCurl);
    const effectiveLength = Math.max(1, length * lengthScale);

    // A constant half-width band (nominal max), used by 'parallel' so its lines
    // stay straight in petal-local space (clipped to the silhouette downstream)
    // instead of following the width taper like 'radial'.
    const flatHalf = (widthRatio * effectiveLength) / 2;
    const makeLine = (offset, tStart, tEnd, hatchAngle, gradient = 0, spiral = 0, flat = false) => {
      const path = [];
      for (let i = 0; i <= steps; i++) {
        const tRaw = lerp(tStart, tEnd, i / steps);
        const t = tipClamp(tRaw, tipCurl, effectiveSharpness, profile);
        let w;
        if (profilePoints && profilePoints.length) {
          w = sampleProfileWidth(t * effectiveLength, profilePoints);
        } else {
          w = widthAt(t, {
            profile,
            centerProfile,
            morphWeight,
            sharpness: effectiveSharpness,
            baseFlare,
            basePinch,
            waveAmp,
            waveFreq,
            wavePhase,
          });
        }
        const half = flat
          ? flatHalf
          : profilePoints && profilePoints.length
          ? w
          : (w * widthRatio * effectiveLength) / 2;
        const g = gradient ? lerp(1, 0.4, t) : 1;
        const spiralOffset = spiral ? offset + t * 0.3 * spiral : offset;
        const curl = twist * effectiveLength * 0.02 * t * t;
        path.push({ x: t * effectiveLength, y: spiralOffset * half * g + curl });
      }
      const hatch = toRad(hatchAngle || 0);
      if (Math.abs(hatch) > 1e-6 && path.length) {
        // Rotate hatch orientation around each line's own center so hatch angle
        // does not translate the shading band across the canvas.
        const pivot = path.reduce(
          (acc, pt) => {
            acc.x += pt.x;
            acc.y += pt.y;
            return acc;
          },
          { x: 0, y: 0 }
        );
        const inv = 1 / path.length;
        pivot.x *= inv;
        pivot.y *= inv;
        const cosH = Math.cos(hatch);
        const sinH = Math.sin(hatch);
        for (let i = 0; i < path.length; i++) {
          const dx = path[i].x - pivot.x;
          const dy = path[i].y - pivot.y;
          path[i] = {
            x: pivot.x + dx * cosH - dy * sinH,
            y: pivot.y + dx * sinH + dy * cosH,
          };
        }
      }
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      return path.map((pt) => ({
        x: baseX + pt.x * cosA - pt.y * sinA,
        y: baseY + pt.x * sinA + pt.y * cosA,
      }));
    };

    const buildOffsets = (shade, halfWidth) => {
      const widthY = clamp(shade.widthY ?? 100, 0, 100) / 100;
      const posY = clamp(shade.posY ?? 50, 0, 100) / 100;
      const offsetCenter = (posY - 0.5) * 2;
      const halfRange = widthY;
      const offsetStart = clamp(offsetCenter - halfRange, -1, 1);
      const offsetEnd = clamp(offsetCenter + halfRange, -1, 1);
      const gapY = clamp(shade.gapY ?? 0, 0, 100) / 100;
      const gapPosY = clamp(shade.gapPosY ?? 50, 0, 100) / 100;
      const gapCenter = (gapPosY - 0.5) * 2;
      const gapHalf = gapY;
      const gapStart = gapCenter - gapHalf;
      const gapEnd = gapCenter + gapHalf;
      const spacing = Math.max(0.2, shade.lineSpacing ?? 1);
      const density = Math.max(0.2, shade.density ?? 1);
      const span = Math.abs(offsetEnd - offsetStart) * halfWidth;
      const count = Math.max(1, Math.round((span / spacing) * density));
      return { offsetStart, offsetEnd, gapStart, gapEnd, count, hasYGap: gapY > 0 };
    };

    const buildRanges = (shade) => {
      const widthX = clamp(shade.widthX ?? 100, 0, 100) / 100;
      const posX = clamp(shade.posX ?? 50, 0, 100) / 100;
      const halfRange = widthX / 2;
      const tStart = clamp(posX - halfRange, 0, 1);
      const tEnd = clamp(posX + halfRange, 0, 1);
      const gapX = clamp(shade.gapX ?? 0, 0, 100) / 100;
      const gapPosX = clamp(shade.gapPosX ?? 50, 0, 100) / 100;
      const gapHalf = gapX / 2;
      const gapStart = gapPosX - gapHalf;
      const gapEnd = gapPosX + gapHalf;
      const ranges = [];
      if (gapX > 0 && gapStart < tEnd && gapEnd > tStart) {
        if (tStart < gapStart) ranges.push([tStart, clamp(gapStart, 0, 1)]);
        if (gapEnd < tEnd) ranges.push([clamp(gapEnd, 0, 1), tEnd]);
      } else {
        ranges.push([tStart, tEnd]);
      }
      return ranges;
    };

    active.forEach((shade) => {
      const halfWidth = (widthRatio * effectiveLength) / 2;
      const { offsetStart, offsetEnd, gapStart, gapEnd, count, hasYGap } = buildOffsets(shade, halfWidth);
      const ranges = buildRanges(shade);
      const type = shade.type || 'radial';
      const hatchAngle = shade.angle ?? 0;
      const lineType = shade.lineType || 'solid';
      const spacing = Math.max(0.2, shade.lineSpacing ?? 1);
      const jitter = clamp(shade.jitter ?? 0, 0, 1);
      const lengthJitter = clamp(shade.lengthJitter ?? 0, 0, 1);

      const emitLine = (path) => {
        const typed = applyLineType(path, lineType, spacing);
        typed.forEach((seg) => {
          if (seg.length > 1) lines.push(seg);
        });
      };

      if (type === 'vein') {
        // Botanical venation: a midrib down the petal axis plus secondary veins
        // branching toward the margins. Lines are clipped to the petal outline
        // downstream, so they read as the central vein + pinnate side veins.
        emitLine(makeLine(0, 0.04, 0.95, hatchAngle, 0, 0));
        const veinPairs = clamp(Math.round(shade.veinCount ?? 4), 0, 12);
        const reach = clamp(shade.veinReach ?? 0.62, 0.1, 0.95);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const toWorld = (lx, ly) => ({ x: baseX + lx * cosA - ly * sinA, y: baseY + lx * sinA + ly * cosA });
        for (let k = 1; k <= veinPairs; k++) {
          const tb = lerp(0.12, 0.82, k / (veinPairs + 1));
          const tt = Math.min(0.96, tb + 0.18);
          const wTt =
            profilePoints && profilePoints.length
              ? sampleProfileWidth(tt * effectiveLength, profilePoints)
              : widthAt(tt, {
                  profile,
                  centerProfile,
                  morphWeight,
                  sharpness: effectiveSharpness,
                  baseFlare,
                  basePinch,
                  waveAmp,
                  waveFreq,
                  wavePhase,
                });
          const halfTt = profilePoints && profilePoints.length ? wTt : (wTt * widthRatio * effectiveLength) / 2;
          [1, -1].forEach((sgn) => {
            emitLine([toWorld(tb * effectiveLength, 0), toWorld(tt * effectiveLength, sgn * halfTt * reach)]);
          });
        }
        return;
      }

      if (type === 'outline' || type === 'rim' || type === 'contour') {
        const outline = buildPetal({
          length,
          widthRatio,
          steps,
          tipTwist,
          tipCurl,
          curlBoost,
          baseX,
          baseY,
          angle,
          profile,
          centerProfile,
          morphWeight,
          sharpness,
          baseFlare,
          basePinch,
          waveAmp,
          waveFreq,
          wavePhase,
        });
        emitLine(outline);
        if (type === 'rim') {
          const innerOutline = buildPetal({
            length: length * 0.98,
            widthRatio: widthRatio * 0.92,
            steps,
            tipTwist,
            tipCurl,
            curlBoost,
            baseX,
            baseY,
            angle,
            profile,
            centerProfile,
            morphWeight,
            sharpness,
            baseFlare,
            basePinch,
            waveAmp,
            waveFreq,
            wavePhase,
          });
          emitLine(innerOutline);
        }
        if (type === 'contour') {
          const levels = clamp(Math.round(count / 2), 2, 10);
          for (let i = 1; i < levels; i++) {
            const scale = 1 - (i / (levels + 1)) * 0.35;
            const inner = buildPetal({
              length: length * (0.9 + 0.1 * scale),
              widthRatio: widthRatio * scale,
              steps,
              tipTwist,
              tipCurl,
              curlBoost,
              baseX,
              baseY,
              angle,
              profile,
              centerProfile,
              morphWeight,
              sharpness,
              baseFlare,
              basePinch,
              waveAmp,
              waveFreq,
              wavePhase,
            });
            emitLine(inner);
          }
        }
        return;
      }

      for (let i = 0; i < count; i++) {
        const frac = count === 1 ? 0.5 : i / (count - 1);
        let offset = lerp(offsetStart, offsetEnd, frac);
        if (jitter > 0) {
          offset += (rng.nextFloat() - 0.5) * jitter * 0.4;
        }
        offset = clamp(offset, -1, 1);
        // The Y-gap carves a band out of the hatch — but only when it has a
        // nonzero width. With gapY:0 the window is a single point (default at
        // offset 0), which used to silently delete the centerline.
        if (hasYGap && offset >= gapStart && offset <= gapEnd) continue;
        if (type === 'chiaroscuro') {
          offset = lerp(offsetStart, offsetEnd, Math.pow(frac, 1.6));
        }
        ranges.forEach(([tStart, tEnd]) => {
          if (tEnd <= tStart) return;
          let t0 = tStart;
          let t1 = tEnd;
          if (lengthJitter > 0) {
            const span = Math.max(0.001, tEnd - tStart);
            const jitterAmt = span * lengthJitter * 0.5;
            t0 = clamp(tStart + (rng.nextFloat() - 0.5) * jitterAmt, 0, 1);
            t1 = clamp(tEnd + (rng.nextFloat() - 0.5) * jitterAmt, 0, 1);
            if (t1 < t0) [t0, t1] = [t1, t0];
            if (t1 - t0 < 0.01) return;
          }
          if (type === 'stipple') {
            const stepsCount = Math.max(8, Math.round(steps * 0.6));
            for (let s = 0; s < stepsCount; s++) {
              const t = lerp(t0, t1, (s + 1) / (stepsCount + 1));
              const w = profilePoints && profilePoints.length ? sampleProfileWidth(t * effectiveLength, profilePoints) : widthAt(t, {
                profile,
                centerProfile,
                morphWeight,
                sharpness,
                baseFlare,
                basePinch,
                waveAmp,
                waveFreq,
                wavePhase,
              });
              const half = profilePoints && profilePoints.length ? w : (w * widthRatio * effectiveLength) / 2;
              const jitter = (rng.nextFloat() - 0.5) * 0.2;
              const localY = (offset + jitter) * half;
              const curl = twist * effectiveLength * 0.02 * t * t;
              const cosA = Math.cos(angle);
              const sinA = Math.sin(angle);
              const x = baseX + (t * effectiveLength) * cosA - (localY + curl) * sinA;
              const y = baseY + (t * effectiveLength) * sinA + (localY + curl) * cosA;
              lines.push([
                { x, y },
                { x: x + 0.2, y: y + 0.2 },
              ]);
            }
          } else if (type === 'spiral') {
            const path = makeLine(offset, t0, t1, hatchAngle, 0, 1);
            emitLine(path);
          } else if (type === 'gradient') {
            const path = makeLine(offset, t0, t1, hatchAngle, 1, 0);
            emitLine(path);
          } else if (type === 'crosshatch') {
            emitLine(makeLine(offset, t0, t1, hatchAngle, 0, 0));
            emitLine(makeLine(offset, t0, t1, hatchAngle + 90, 0, 0));
          } else if (type === 'parallel') {
            // Straight constant-width bands (do not follow the width taper),
            // clipped to the silhouette downstream.
            emitLine(makeLine(offset, t0, t1, hatchAngle, 0, 0, true));
          } else if (type === 'edge') {
            // Cluster lines toward the rim: map |offset| 0..1 -> 0.5..1 so the
            // centre stays open and the petal margin is emphasised.
            const eo = (offset >= 0 ? 1 : -1) * (0.5 + 0.5 * Math.abs(offset));
            emitLine(makeLine(eo, t0, t1, hatchAngle, 0, 0));
          } else {
            // 'radial' (and any unknown type): width-following hatch.
            const path = makeLine(offset, t0, t1, hatchAngle, 0, 0);
            emitLine(path);
          }
        });
      }
    });

    return lines;
  };

  const expandCircle = (meta, segments = 64) => {
    const cx = meta.cx ?? meta.x ?? 0;
    const cy = meta.cy ?? meta.y ?? 0;
    const r = meta.r ?? meta.rx ?? 0;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * TAU;
      pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
    }
    return pts;
  };

  const applyModifiers = (paths, modifiers, center, maxRadius, noise) => {
    if (!Array.isArray(modifiers) || !modifiers.length) return paths;
    const active = modifiers
      .filter((mod) => mod && mod.enabled !== false)
      .map((mod, index) => {
        if (mod.type === 'radialNoise') {
          return {
            ...mod,
            rackSample: createNoiseStackSampler({
              noise,
              seed: (mod.seed ?? 0) + index,
              layers: mod.noises,
              fallbackLayer: createLegacyNoiseLayer({
                zoom: Math.max(0.0001, mod.scale ?? 0.2),
                seed: mod.seed ?? 0,
              }),
            }),
          };
        }
        if (mod.type === 'circularOffset') {
          return {
            ...mod,
            rackSample: createNoiseStackSampler({
              noise,
              seed: (mod.seed ?? 0) + index,
              layers: mod.noises,
              fallbackLayer: createLegacyNoiseLayer({
                zoom: 1,
                seed: mod.seed ?? 0,
              }),
            }),
          };
        }
        return mod;
      });
    if (!active.length) return paths;
    return paths.map((path) => {
      const closed =
        Array.isArray(path) &&
        path.length > 2 &&
        Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y) < 1e-6;
      const pts = path && path.meta && path.meta.kind === 'circle' ? expandCircle(path.meta, 80) : path.slice();
      const next = pts.map((pt) => {
        let x = pt.x - center.x;
        let y = pt.y - center.y;
        active.forEach((mod) => {
          let r = Math.hypot(x, y);
          let a = Math.atan2(y, x);
          switch (mod.type) {
            case 'ripple': {
              const amp = mod.amount ?? 0;
              const freq = mod.frequency ?? 4;
              r += Math.sin(a * freq) * amp;
              break;
            }
            case 'twist': {
              const amt = toRad(mod.amount ?? 0);
              a += amt * (r / Math.max(1, maxRadius));
              break;
            }
            case 'radialNoise': {
              const amp = mod.amount ?? 0;
              const n = mod.rackSample
                ? mod.rackSample(x, y, { worldX: center.x + x, worldY: center.y + y })
                : 0;
              r += n * amp;
              break;
            }
            case 'falloff': {
              const amt = clamp(mod.amount ?? 0, 0, 1);
              r *= 1 - amt * (r / Math.max(1, maxRadius));
              break;
            }
            case 'clip': {
              const radius = mod.radius ?? maxRadius;
              r = Math.min(r, radius);
              break;
            }
            case 'offset': {
              x += mod.offsetX ?? 0;
              y += mod.offsetY ?? 0;
              r = Math.hypot(x, y);
              a = Math.atan2(y, x);
              break;
            }
            case 'circularOffset': {
              const seed = mod.seed ?? 0;
              const randomness = clamp(mod.randomness ?? 0, 0, 1);
              const dir = clamp(mod.direction ?? 0, -1, 1);
              const amp = mod.amount ?? 2;
              const n = mod.rackSample
                ? mod.rackSample(x * 0.02 + seed, y * 0.02 - seed, {
                    worldX: center.x + x,
                    worldY: center.y + y,
                  })
                : 0;
              const sign = dir === 0 ? Math.sign(n || 1) : Math.sign(dir);
              r += sign * Math.abs(n) * amp * randomness;
              break;
            }
            default:
              break;
          }
          x = Math.cos(a) * r;
          y = Math.sin(a) * r;
        });
        return { x: center.x + x, y: center.y + y };
      });
      if (closed && next.length) next[next.length - 1] = { ...next[0] };
      if (path.meta) next.meta = { ...path.meta };
      return next;
    });
  };

  const applyPetalModifiers = (paths, modifiers, base, angle, length, noise) => {
    if (!Array.isArray(modifiers) || !modifiers.length) return paths;
    const active = modifiers
      .filter((mod) => mod && mod.enabled !== false)
      .map((mod, index) => {
        if (mod.type === 'noise') {
          return {
            ...mod,
            rackSample: createNoiseStackSampler({
              noise,
              seed: (mod.seed ?? 0) + index,
              layers: mod.noises,
              fallbackLayer: createLegacyNoiseLayer({
                zoom: Math.max(0.0001, mod.scale ?? 0.2),
                seed: mod.seed ?? 0,
              }),
            }),
          };
        }
        return mod;
      });
    if (!active.length) return paths;
    const cosA = Math.cos(-angle);
    const sinA = Math.sin(-angle);
    const invCos = Math.cos(angle);
    const invSin = Math.sin(angle);
    const safeLen = Math.max(1, length);
    return paths.map((path) => {
      if (!Array.isArray(path) || (path.meta && path.meta.kind === 'circle')) return path;
      const next = path.map((pt) => {
        let lx = (pt.x - base.x) * cosA - (pt.y - base.y) * sinA;
        let ly = (pt.x - base.x) * sinA + (pt.y - base.y) * cosA;
        active.forEach((mod) => {
          const t = clamp(lx / safeLen, 0, 1);
          switch (mod.type) {
            case 'ripple': {
              const amp = mod.amount ?? 0;
              const freq = mod.frequency ?? 6;
              ly += Math.sin(t * TAU * freq) * amp;
              break;
            }
            case 'twist': {
              const amt = toRad(mod.amount ?? 0);
              const twist = amt * t;
              const rx = lx * Math.cos(twist) - ly * Math.sin(twist);
              const ry = lx * Math.sin(twist) + ly * Math.cos(twist);
              lx = rx;
              ly = ry;
              break;
            }
            case 'noise': {
              const amp = mod.amount ?? 0;
              const n = mod.rackSample
                ? mod.rackSample(lx, ly, { worldX: base.x + lx, worldY: base.y + ly })
                : 0;
              ly += n * amp;
              break;
            }
            case 'shear': {
              const amt = mod.amount ?? 0;
              ly += lx * amt * 0.2;
              break;
            }
            case 'taper': {
              const amt = mod.amount ?? 0;
              const scale = 1 + amt * (t - 0.5);
              ly *= scale;
              break;
            }
            case 'offset': {
              lx += mod.offsetX ?? 0;
              ly += mod.offsetY ?? 0;
              break;
            }
            default:
              break;
          }
        });
        return { x: base.x + lx * invCos - ly * invSin, y: base.y + lx * invSin + ly * invCos };
      });
      if (path.meta) next.meta = path.meta;
      return next;
    });
  };

  const buildCentralElements = (p, rng, noise, center, maxRadius) => {
    const paths = [];
    const radius = Math.max(0.5, p.centerRadius ?? 6);
    const density = Math.max(1, Math.round(p.centerDensity ?? 12));
    const falloff = clamp(p.centerFalloff ?? 0.6, 0, 1);
    const type = p.centerType || 'disk';
    const labelMap = {
      disk: 'Disk',
      dome: 'Dome',
      starburst: 'Starburst',
      dot: 'Dot Field',
      filament: 'Filaments',
    };
    const groupLabel = `Center: ${labelMap[type] || 'Elements'}`;
    const filamentNoiseSample = createNoiseStackSampler({
      noise,
      seed: (p.seed ?? 0) + 401,
      layers: p.centerFilamentNoises,
      fallbackLayer: createLegacyNoiseLayer({
        zoom: 1,
        seed: p.seed ?? 0,
      }),
    });

    if (type === 'disk') {
      const circle = [];
      circle.meta = { kind: 'circle', cx: center.x, cy: center.y, r: radius, group: groupLabel, label: 'Disk' };
      paths.push(circle);
    } else if (type === 'dome') {
      const rings = clamp(Math.round(density / 2), 2, 30);
      for (let i = 0; i < rings; i++) {
        const r = radius * (1 - i / rings);
        const circle = [];
        circle.meta = {
          kind: 'circle',
          cx: center.x,
          cy: center.y,
          r: Math.max(0.2, r),
          group: groupLabel,
          label: `Ring ${String(i + 1).padStart(2, '0')}`,
        };
        paths.push(circle);
      }
    } else if (type === 'starburst') {
      for (let i = 0; i < density; i++) {
        const ang = (i / density) * TAU;
        const len = radius * (0.6 + 0.4 * rng.nextFloat());
        const path = [
          { x: center.x, y: center.y },
          { x: center.x + Math.cos(ang) * len, y: center.y + Math.sin(ang) * len },
        ];
        path.meta = { group: groupLabel, label: `Ray ${String(i + 1).padStart(2, '0')}` };
        paths.push(path);
      }
    } else if (type === 'dot') {
      for (let i = 0; i < density; i++) {
        const ang = rng.nextFloat() * TAU;
        const r = Math.sqrt(rng.nextFloat()) * radius;
        const dot = [];
        dot.meta = {
          kind: 'circle',
          cx: center.x + Math.cos(ang) * r,
          cy: center.y + Math.sin(ang) * r,
          r: 0.4 + rng.nextFloat() * 0.6,
          group: groupLabel,
          label: `Dot ${String(i + 1).padStart(2, '0')}`,
        };
        paths.push(dot);
      }
    } else if (type === 'filament') {
      for (let i = 0; i < density; i++) {
        const ang = rng.nextFloat() * TAU;
        const len = radius * (0.6 + 0.6 * rng.nextFloat());
        const curve = [];
        const steps = 8;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const curveAng = ang + filamentNoiseSample(t * 2, i * 0.2, { worldX: center.x, worldY: center.y }) * falloff;
          const rr = len * t;
          curve.push({ x: center.x + Math.cos(curveAng) * rr, y: center.y + Math.sin(curveAng) * rr });
        }
        curve.meta = { group: groupLabel, label: `Filament ${String(i + 1).padStart(2, '0')}` };
        paths.push(curve);
      }
    }

    if (p.centerRing) {
      const ringRadius = Math.max(0.5, p.centerRingRadius ?? radius * 1.6);
      const ringCount = Math.max(6, Math.round(p.centerRingDensity ?? density));
      for (let i = 0; i < ringCount; i++) {
        const ang = (i / ringCount) * TAU;
        const dot = [];
        dot.meta = {
          kind: 'circle',
          cx: center.x + Math.cos(ang) * ringRadius,
          cy: center.y + Math.sin(ang) * ringRadius,
          r: 0.35 + rng.nextFloat() * 0.4,
          group: 'Center: Ring',
          label: `Ring Dot ${String(i + 1).padStart(2, '0')}`,
        };
        paths.push(dot);
      }
    }

    if (p.centerConnectors) {
      const count = Math.max(4, Math.round(p.connectorCount ?? density));
      const len = Math.max(1, p.connectorLength ?? radius);
      const jitter = clamp(p.connectorJitter ?? 0, 0, 1);
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * TAU;
        const jitterAng = ang + (rng.nextFloat() - 0.5) * jitter;
        const startR = radius * 0.6;
        const path = [
          { x: center.x + Math.cos(jitterAng) * startR, y: center.y + Math.sin(jitterAng) * startR },
          { x: center.x + Math.cos(jitterAng) * (startR + len), y: center.y + Math.sin(jitterAng) * (startR + len) },
        ];
        path.meta = { group: 'Center: Connectors', label: `Connector ${String(i + 1).padStart(2, '0')}` };
        paths.push(path);
      }
    }

    return applyModifiers(paths, p.centerModifiers, center, maxRadius, noise);
  };

  const bboxFromPoints = (pts) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    pts.forEach((pt) => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });
    return { minX, minY, maxX, maxY };
  };

  const bboxIntersects = (a, b) =>
    !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);

  // Precompute a polygon's closed edges with a per-edge AABB. clipSegmentOutside
  // is the dominant cost when petal count is high (each petal outline is clipped
  // against every overlapping occluder, ~O(n) of them, so the whole pass is
  // O(n^2)). Caching the edges + their boxes once per occluder lets the clip skip
  // — with a cheap box reject — the vast majority of occluder edges nowhere near
  // a given segment, instead of running full intersection math on all of them.
  // The set of edges actually tested for intersection is unchanged, so output is
  // identical; only the wasted intersection tests are removed.
  const buildOccluderEdges = (poly) => {
    const edges = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % n];
      edges.push({
        a,
        b,
        minX: a.x < b.x ? a.x : b.x,
        maxX: a.x > b.x ? a.x : b.x,
        minY: a.y < b.y ? a.y : b.y,
        maxY: a.y > b.y ? a.y : b.y,
      });
    }
    return edges;
  };

  const pointInPoly = (pt, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const pointOnSegment = (pt, a, b, eps = 1e-5) => {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = pt.x - a.x;
    const apy = pt.y - a.y;
    const cross = abx * apy - aby * apx;
    if (Math.abs(cross) > eps) return false;
    const dot = apx * abx + apy * aby;
    if (dot < -eps) return false;
    const lenSq = abx * abx + aby * aby;
    if (dot - lenSq > eps) return false;
    return true;
  };

  const pointInOrOnPoly = (pt, poly) => {
    if (!Array.isArray(poly) || poly.length < 3) return false;
    if (pointInPoly(pt, poly)) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (pointOnSegment(pt, a, b)) return true;
    }
    return false;
  };

  const segmentIntersection = (a, b, c, d) => {
    const r = { x: b.x - a.x, y: b.y - a.y };
    const s = { x: d.x - c.x, y: d.y - c.y };
    const denom = r.x * s.y - r.y * s.x;
    if (Math.abs(denom) < 1e-9) return null;
    const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { t, u };
    return null;
  };

  const segmentIntersectsPoly = (a, b, poly) => {
    if (!Array.isArray(poly) || poly.length < 2) return false;
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const hit = segmentIntersection(a, b, p1, p2);
      if (hit) return true;
    }
    return false;
  };

  const isPointShadowed = (pt, light, center, occluders) => {
    if (!light) return true;
    const toCenter = { x: pt.x - center.x, y: pt.y - center.y };
    const toLight = { x: light.x - pt.x, y: light.y - pt.y };
    const centerLen = Math.hypot(toCenter.x, toCenter.y);
    const facing = centerLen < 1e-4 ? false : toLight.x * toCenter.x + toLight.y * toCenter.y > 0;
    if (!occluders.length) return !facing;
    const rayBox = bboxFromPoints([pt, light]);
    const occluded = occluders.some((occ) => {
      if (!bboxIntersects(rayBox, occ.bbox)) return false;
      if (pointInPoly(light, occ.points)) return true;
      return segmentIntersectsPoly(light, pt, occ.points);
    });
    return occluded || !facing;
  };

  const splitPathByShadow = (path, light, center, occluders) => {
    if (!light) return [path];
    if (!Array.isArray(path) || path.length < 2) return [];
    const segments = [];
    let current = [];
    const eps = 1e-4;
    const append = (pt) => {
      if (!current.length) {
        current.push(pt);
        return;
      }
      const last = current[current.length - 1];
      if (Math.hypot(last.x - pt.x, last.y - pt.y) < eps) return;
      current.push(pt);
    };
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const shadowed = isPointShadowed(mid, light, center, occluders);
      if (shadowed) {
        append(a);
        append(b);
      } else {
        if (current.length > 1) segments.push(current);
        current = [];
      }
    }
    if (current.length > 1) segments.push(current);
    return segments;
  };

  const clipSegmentOutside = (a, b, occluders) => {
    if (!occluders.length) return [[a, b]];
    const segMinX = a.x < b.x ? a.x : b.x;
    const segMaxX = a.x > b.x ? a.x : b.x;
    const segMinY = a.y < b.y ? a.y : b.y;
    const segMaxY = a.y > b.y ? a.y : b.y;
    const intersections = [];
    // A point outside an occluder's bbox cannot be inside that occluder, so the
    // bbox guard skips the pointInPoly walk for occluders the point misses.
    const insideAny = (pt) =>
      occluders.some((occ) => {
        const ob = occ.bbox;
        if (pt.x < ob.minX || pt.x > ob.maxX || pt.y < ob.minY || pt.y > ob.maxY) return false;
        return pointInPoly(pt, occ.points);
      });

    for (let o = 0; o < occluders.length; o++) {
      const occ = occluders[o];
      const ob = occ.bbox;
      if (segMaxX < ob.minX || segMinX > ob.maxX || segMaxY < ob.minY || segMinY > ob.maxY) continue;
      const edges = occ.edges || buildOccluderEdges(occ.points);
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        // Per-edge AABB reject: the bulk of an occluder's edges sit far from any
        // single segment, so this cheap test removes most intersection math.
        if (segMaxX < e.minX || segMinX > e.maxX || segMaxY < e.minY || segMinY > e.maxY) continue;
        const hit = segmentIntersection(a, b, e.a, e.b);
        if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) intersections.push(hit.t);
      }
    }
    const ts = [0, 1, ...intersections].sort((x, y) => x - y);
    const uniq = [];
    ts.forEach((t) => {
      if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 1e-5) uniq.push(t);
    });
    const segments = [];
    for (let i = 0; i < uniq.length - 1; i++) {
      const t0 = uniq[i];
      const t1 = uniq[i + 1];
      if (t1 - t0 < 1e-5) continue;
      const mid = (t0 + t1) / 2;
      const midPt = { x: lerp(a.x, b.x, mid), y: lerp(a.y, b.y, mid) };
      if (!insideAny(midPt)) {
        const s0 = { x: lerp(a.x, b.x, t0), y: lerp(a.y, b.y, t0) };
        const s1 = { x: lerp(a.x, b.x, t1), y: lerp(a.y, b.y, t1) };
        segments.push([s0, s1]);
      }
    }
    return segments;
  };

  const clipPathOutside = (path, occluders) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    if (!occluders.length) return [path];
    const output = [];
    let current = [];
    const eps = 1e-4;
    const appendPoint = (pt) => {
      if (!current.length) {
        current.push(pt);
        return;
      }
      const last = current[current.length - 1];
      if (Math.hypot(last.x - pt.x, last.y - pt.y) < eps) return;
      current.push(pt);
    };
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const pieces = clipSegmentOutside(a, b, occluders);
      if (!pieces.length) {
        if (current.length > 1) output.push(current);
        current = [];
        continue;
      }
      pieces.forEach((seg, idx) => {
        const [s0, s1] = seg;
        if (!current.length) {
          current = [s0, s1];
        } else {
          const last = current[current.length - 1];
          if (Math.hypot(last.x - s0.x, last.y - s0.y) > eps) {
            output.push(current);
            current = [s0, s1];
          } else {
            appendPoint(s1);
          }
        }
        if (idx < pieces.length - 1) {
          output.push(current);
          current = [];
        }
      });
    }
    if (current.length > 1) output.push(current);
    return output;
  };

  // polyBox/edges may be precomputed once by the caller (the same polygon is
  // reused across every segment of every shading line) — recomputing the
  // polygon bbox + edge list per segment was a measurable cost on shaded petals.
  const clipSegmentInsidePolygon = (a, b, polygon, polyBox, edges) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return [[a, b]];
    const box = polyBox || bboxFromPoints(polygon);
    const segMinX = a.x < b.x ? a.x : b.x;
    const segMaxX = a.x > b.x ? a.x : b.x;
    const segMinY = a.y < b.y ? a.y : b.y;
    const segMaxY = a.y > b.y ? a.y : b.y;
    if (segMaxX < box.minX || segMinX > box.maxX || segMaxY < box.minY || segMinY > box.maxY) return [];
    const polyEdges = edges || buildOccluderEdges(polygon);
    const intersections = [];
    for (let i = 0; i < polyEdges.length; i++) {
      const e = polyEdges[i];
      if (segMaxX < e.minX || segMinX > e.maxX || segMaxY < e.minY || segMinY > e.maxY) continue;
      const hit = segmentIntersection(a, b, e.a, e.b);
      if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) intersections.push(hit.t);
    }
    const ts = [0, 1, ...intersections].sort((x, y) => x - y);
    const uniq = [];
    ts.forEach((t) => {
      if (!uniq.length || Math.abs(t - uniq[uniq.length - 1]) > 1e-5) uniq.push(t);
    });
    const segments = [];
    for (let i = 0; i < uniq.length - 1; i++) {
      const t0 = uniq[i];
      const t1 = uniq[i + 1];
      if (t1 - t0 < 1e-5) continue;
      const mid = (t0 + t1) / 2;
      const midPt = { x: lerp(a.x, b.x, mid), y: lerp(a.y, b.y, mid) };
      if (!pointInOrOnPoly(midPt, polygon)) continue;
      segments.push([
        { x: lerp(a.x, b.x, t0), y: lerp(a.y, b.y, t0) },
        { x: lerp(a.x, b.x, t1), y: lerp(a.y, b.y, t1) },
      ]);
    }
    return segments;
  };

  const clipPathInsidePolygon = (path, polygon, polyBox, edges) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    if (!Array.isArray(polygon) || polygon.length < 3) return [path];
    const box = polyBox || bboxFromPoints(polygon);
    const polyEdges = edges || buildOccluderEdges(polygon);
    const output = [];
    let current = [];
    const eps = 1e-4;
    const appendPoint = (pt) => {
      if (!current.length) {
        current.push(pt);
        return;
      }
      const last = current[current.length - 1];
      if (Math.hypot(last.x - pt.x, last.y - pt.y) < eps) return;
      current.push(pt);
    };
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      const pieces = clipSegmentInsidePolygon(a, b, polygon, box, polyEdges);
      if (!pieces.length) {
        if (current.length > 1) output.push(current);
        current = [];
        continue;
      }
      pieces.forEach((seg, idx) => {
        const [s0, s1] = seg;
        if (!current.length) {
          current = [s0, s1];
        } else {
          const last = current[current.length - 1];
          if (Math.hypot(last.x - s0.x, last.y - s0.y) > eps) {
            output.push(current);
            current = [s0, s1];
          } else {
            appendPoint(s1);
          }
        }
        if (idx < pieces.length - 1) {
          output.push(current);
          current = [];
        }
      });
    }
    if (current.length > 1) output.push(current);
    return output;
  };

  const clipPathsInsidePolygon = (paths, polygon) => {
    if (!Array.isArray(paths) || !paths.length) return [];
    // The polygon (a petal outline) is identical for every shading line, so its
    // bbox + edge list are built once here rather than per line, per segment.
    const polyBox = Array.isArray(polygon) && polygon.length >= 3 ? bboxFromPoints(polygon) : null;
    const polyEdges = polyBox ? buildOccluderEdges(polygon) : null;
    const output = [];
    paths.forEach((path) => {
      const clipped = clipPathInsidePolygon(path, polygon, polyBox, polyEdges);
      clipped.forEach((seg) => {
        if (seg.length < 2) return;
        if (path.meta) seg.meta = { ...path.meta };
        output.push(seg);
      });
    });
    return output;
  };

  const generate = (p, rng, noise, bounds) => {
    const { m, width, height } = bounds;
    const center = { x: width / 2, y: height / 2 };
    const maxRadius = Math.min(width, height) / 2 - m;
    const paths = [];
    const petals = [];
    const occluders = [];
    const layering = p.layering !== false;
    const designerShapeOnly = Boolean(
      p.useDesignerShapeOnly || p.label === 'Petalis' || p.label === 'Petalis Designer'
    );
    const shadings = Array.isArray(p.shadings) ? p.shadings : [];
    const modifiers = Array.isArray(p.petalModifiers) ? p.petalModifiers : [];
    const legacyShadings = [];
    if (!shadings.length && !designerShapeOnly && (p.innerShading || p.outerShading)) {
      if (p.innerShading) {
        legacyShadings.push({
          id: 'legacy-inner',
          enabled: true,
          type: p.innerShadingType || 'radial',
          widthX: 100,
          widthY: 60,
          posX: 50,
          posY: 50,
          gapX: 0,
          gapY: 0,
          gapPosX: 50,
          gapPosY: 50,
          lineType: 'solid',
          lineSpacing: 1,
          angle: p.hatchAngle ?? 0,
        });
      }
      if (p.outerShading) {
        legacyShadings.push({
          id: 'legacy-outer',
          enabled: true,
          type: p.outerShadingType || 'rim',
          widthX: 100,
          widthY: 100,
          posX: 50,
          posY: 50,
          gapX: 0,
          gapY: 0,
          gapPosX: 50,
          gapPosY: 50,
          lineType: 'solid',
          lineSpacing: 1,
          angle: p.hatchAngle ?? 0,
        });
      }
    }
    const baseShadingStack = (shadings.length ? shadings : legacyShadings).map((shade) => ({
      ...(shade || {}),
      target: normalizeDesignerTarget(shade?.target),
    }));
    const baseModifierStack = modifiers.map((modifier) => ({
      ...(modifier || {}),
      target: normalizeDesignerTarget(modifier?.target),
    }));
    const ringMode = designerShapeOnly ? 'dual' : p.ringMode || 'single';
    const singleRingTarget = 'outer';
    const getRingShadingStack = (ringTarget) => {
      if (!designerShapeOnly) return baseShadingStack;
      const resolved = ringTarget === 'inner' || ringTarget === 'outer' ? ringTarget : 'both';
      return baseShadingStack.filter((shade) => {
        const target = normalizeDesignerTarget(shade?.target);
        return target === 'both' || target === resolved;
      });
    };
    const getRingModifierStack = (ringTarget) => {
      if (!designerShapeOnly) return baseModifierStack;
      const resolved = ringTarget === 'inner' || ringTarget === 'outer' ? ringTarget : 'both';
      return baseModifierStack.filter((modifier) => {
        const target = normalizeDesignerTarget(modifier?.target);
        return target === 'both' || target === resolved;
      });
    };
    const normalizeTipRotate = (value) => (value > 10 ? value / 10 : value);
    const tipTwist = designerShapeOnly ? 0 : p.tipTwist ?? 0;
    const tipRotate = normalizeTipRotate(tipTwist);
    // Bloom macro (0..100, 100 = fully open = neutral). Lower values curl the
    // petal tips inward and pull the rings together into a closing bud. At 100
    // it is a no-op, so the default look and baselines are unchanged.
    const bloom = clamp(p.bloom ?? 100, 0, 100) / 100;
    const bloomCurl = (1 - bloom) * 0.7;
    const bloomRingFactor = lerp(0.45, 1, bloom);
    const tipCurl = designerShapeOnly ? bloomCurl : p.tipCurl ?? 0;
    // Petal asymmetry (0..100): per-petal lateral lean that breaks the perfect
    // mirror symmetry for a more organic, hand-drawn read. 0 = neutral.
    const petalAsymmetry = clamp(p.petalAsymmetry ?? 0, 0, 100) / 100;
    const tipSharpness = designerShapeOnly ? 1 : p.tipSharpness ?? 0.5;
    const baseFlare = designerShapeOnly ? 0 : p.baseFlare ?? 0;
    const basePinch = designerShapeOnly ? 0 : p.basePinch ?? 0;
    const rawCenterBoost = designerShapeOnly ? 0 : p.centerCurlBoost ?? 0;
    const centerBoost = rawCenterBoost > 2 ? rawCenterBoost / 50 : rawCenterBoost;
    const lengthRatio = Math.max(0.1, p.petalLengthRatio ?? 1);
    const sizeRatio = Math.max(0.1, p.petalSizeRatio ?? 1);
    const baseLength = Math.max(4, (p.petalScale ?? 30) * lengthRatio);
    const baseWidthRatio = (p.petalWidthRatio ?? 0.45) * sizeRatio;
    const anchorMode = p.anchorToCenter || 'central';
    const anchorRadius =
      anchorMode === 'off' ? 0 : Math.max(0, (p.centerRadius ?? 0) * (p.anchorRadiusRatio ?? 1));
    const visibilitySpan = baseLength * (lengthRatio + sizeRatio);
    const visibleMaxR = Math.min(maxRadius, anchorRadius + visibilitySpan);
    const countJitter = clamp(p.countJitter ?? 0, 0, 0.5);
    const petalSteps = clamp(Math.round(p.petalSteps ?? 28), 12, 80);
    const rotationJitter = toRad(p.rotationJitter ?? 0);
    const sizeJitter = clamp(p.sizeJitter ?? 0, 0, 0.6);
    // Layout mode gates the per-petal angle + radius math. 'whorl' (default)
    // lays each band's petals at even TAU/count spacing on a constant per-band
    // radius (clean concentric rings). 'spiral' is the verbatim golden-angle
    // Vogel packing — correct for dense composites (dahlia/chrysanthemum).
    const layoutMode = p.layoutMode === 'spiral' ? 'spiral' : 'whorl';
    const spiralMode = p.spiralMode || 'golden';
    const baseAngle = toRad(spiralMode === 'custom' ? p.customAngle ?? GOLDEN_ANGLE : GOLDEN_ANGLE);
    const spiralTightness = Math.max(0.5, p.spiralTightness ?? 1);
    const radialGrowth = Math.max(0.1, p.radialGrowth ?? 1);
    const spiralStart = clamp(p.spiralStart ?? 0, 0, 1);
    const spiralEnd = clamp(p.spiralEnd ?? 1, 0, 1);
    const spiralMin = Math.min(spiralStart, spiralEnd);
    const spiralMax = Math.max(spiralStart, spiralEnd);
    const designerDualRing = designerShapeOnly && ringMode === 'dual';
    const designerInnerCount = Math.max(1, Math.round(p.innerCount ?? 120));
    const designerOuterCount = Math.max(1, Math.round(p.outerCount ?? 180));
    const designerCountSplit = clamp(
      designerInnerCount / Math.max(1, designerInnerCount + designerOuterCount),
      0.1,
      0.9
    );
    // In whorl mode the ring radius must be count-INDEPENDENT (a clean ring at
    // a predictable radius), so honour p.ringSplit directly. In spiral mode it
    // stays count-derived to preserve dense-bloom band placement.
    const ringSplit =
      layoutMode === 'whorl'
        ? clamp(p.ringSplit ?? 0.45, 0.1, 0.9)
        : designerDualRing
        ? designerCountSplit
        : clamp(p.ringSplit ?? 0.5, 0.1, 0.9);
    const ringOffset = toRad(p.ringOffset ?? 0);
    const driftStrength = clamp(p.driftStrength ?? 0, 0, 1);
    const driftNoise = Math.max(0.01, p.driftNoise ?? 0.2);
    const angularDrift = toRad(p.angularDrift ?? 0);
    let designerInner = hasDesignerAnchors(p.designerInner) ? p.designerInner : null;
    let designerOuter = hasDesignerAnchors(p.designerOuter) ? p.designerOuter : null;
    if (p.innerOuterLock) {
      const locked = designerInner || designerOuter;
      if (locked) {
        designerInner = locked;
        designerOuter = locked;
      }
    }
    const canBlendDesignerProfiles = Boolean(designerInner && designerOuter);
    const transitionPosition = designerDualRing
      ? clamp(designerCountSplit * 100, 0, 100)
      : clamp(p.profileTransitionPosition ?? 50, 0, 100);
    const transitionFeather = clamp(p.profileTransitionFeather ?? 0, 0, 100);
    const designerInnerSymmetry = normalizeDesignerSymmetry(p.designerInnerSymmetry ?? p.designerSymmetry);
    const designerOuterSymmetry = normalizeDesignerSymmetry(p.designerOuterSymmetry ?? p.designerSymmetry);
    const getRingSymmetry = (ringTarget) =>
      ringTarget === 'inner' ? designerInnerSymmetry : designerOuterSymmetry;

    // Whorl mode allows an empty inner (or outer) band — e.g. a single ring of
    // petals around a center. Spiral mode keeps the legacy floor of 1.
    const countFloor = layoutMode === 'whorl' ? 0 : 1;
    const innerSplitR = visibleMaxR * ringSplit;
    const ringDefs =
      ringMode === 'dual'
        ? [
            {
              count: Math.max(countFloor, Math.round((p.innerCount ?? 0) * (1 + rng.nextRange(-countJitter, countJitter)))),
              minR: 0,
              maxR: innerSplitR,
              midR: innerSplitR / 2,
              offset: 0,
            },
            {
              count: Math.max(countFloor, Math.round((p.outerCount ?? 0) * (1 + rng.nextRange(-countJitter, countJitter)))),
              minR: innerSplitR,
              maxR: visibleMaxR,
              midR: (innerSplitR + visibleMaxR) / 2,
              offset: ringOffset,
            },
          ]
        : [
            {
              count: Math.max(
                1,
                Math.round(
                  (p.count ?? 120) * (1 + rng.nextRange(-countJitter, countJitter))
                )
              ),
              minR: 0,
              maxR: visibleMaxR,
              midR: visibleMaxR / 2,
              offset: 0,
            },
          ];

    const totalRingCount = ringDefs.reduce((sum, ring) => sum + Math.max(0, ring.count || 0), 0);
    // Whorl base radii: anchor the innermost POPULATED ring at the receptacle,
    // then step each further populated ring outward by a fraction of the petal
    // length so successive whorls layer with overlap — a packed corolla rather
    // than a detached pinwheel floating off the centre. radialGrowth opens or
    // tightens the spacing (1 = default), independent of the spiral-mode meaning.
    if (layoutMode === 'whorl') {
      // ringSplit controls how far successive whorls spread (layer spacing):
      // tighter = packed rosette, wider = open layered bloom. The Bloom macro
      // pulls the rings together as the flower closes toward a bud.
      const whorlStep = baseLength * (0.25 + 0.5 * ringSplit) * bloomRingFactor;
      let baseR = anchorRadius;
      ringDefs.forEach((ring) => {
        ring.baseR = baseR;
        if ((ring.count || 0) > 0) baseR += whorlStep;
      });
      // radiusScale ramp basis: petals within one whorl are uniform (an index
      // ramp would put a size discontinuity at the ring's wrap-around seam), so
      // the ramp runs across populated rings — innermost 1×, outermost 1+scale.
      const populated = ringDefs.filter((ring) => (ring.count || 0) > 0);
      populated.forEach((ring, ord) => {
        ring.scaleT = populated.length <= 1 ? 0 : ord / (populated.length - 1);
      });
    }
    let ringProgressOffset = 0;
    ringDefs.forEach((ring, ringIndex) => {
      const { count, minR, maxR, offset, midR, baseR } = ring;
      const ringTarget = ringMode === 'dual' ? (ringIndex === 0 ? 'inner' : 'outer') : singleRingTarget;
      const ringSymmetry = getRingSymmetry(ringTarget);
      const ringShadingStack = getRingShadingStack(ringTarget);
      const ringModifierStack = getRingModifierStack(ringTarget);
      const ringDesigner =
        ringMode === 'dual'
          ? ringIndex === 0
            ? p.designerInner
            : p.designerOuter
          : designerShapeOnly
          ? ringTarget === 'inner'
            ? p.designerInner || p.designerOuter
            : p.designerOuter || p.designerInner
          : p.designerOuter || p.designerInner;
      const fallbackRingProfile =
        ringDesigner?.profile || designerInner?.profile || designerOuter?.profile || p.petalProfile || 'teardrop';
      const legacyRingProfile = ringDesigner?.profile || p.petalProfile || fallbackRingProfile;
      const innerProfileName = designerInner?.profile || legacyRingProfile;
      const outerProfileName = designerOuter?.profile || legacyRingProfile;
      const driftNoiseSample = createNoiseStackSampler({
        noise,
        seed: (p.seed ?? 0) + ringIndex * 97,
        layers: p.driftNoises,
        fallbackLayer: createLegacyNoiseLayer({
          zoom: 1,
          seed: p.seed ?? 0,
        }),
      });
      for (let i = 0; i < count; i++) {
        const t = count <= 1 ? 0.5 : i / (count - 1);
        const spiralT = lerp(spiralMin, spiralMax, Math.pow(t, spiralTightness));
        // Whorl: every petal in a ring shares the ring's constant base radius
        // (anchored near the receptacle, layered outward). Spiral: radius ramps
        // with petal index (Vogel spiral). `radial` is expressed relative to the
        // receptacle so radialBase = anchorRadius + radial stays consistent.
        const radial =
          layoutMode === 'whorl'
            ? Math.max(0, (baseR ?? anchorRadius) - anchorRadius)
            : lerp(minR, maxR, spiralT) * radialGrowth;
        const radialProgress = clamp(radial / Math.max(1e-6, visibleMaxR), 0, 1);
        const countProgress = totalRingCount <= 1 ? 0.5 : (ringProgressOffset + i) / Math.max(1, totalRingCount - 1);
        const transitionBasis = designerDualRing ? countProgress : radialProgress;
        const transitionMix = canBlendDesignerProfiles
          ? profileBlendWeight(transitionBasis, transitionPosition, transitionFeather)
          : 0;
        const ringProfile = canBlendDesignerProfiles
          ? transitionMix < 0.5
            ? innerProfileName
            : outerProfileName
          : legacyRingProfile;
        const ringCenterProfile = p.centerProfile || ringProfile;
        let radialBase = anchorRadius + radial;
        if (anchorMode === 'all') radialBase = anchorRadius;
        const drift =
          angularDrift *
          driftStrength *
          driftNoiseSample(i * driftNoise, ringIndex * 2.1, {
            worldX: center.x,
            worldY: center.y,
          });
        // Whorl: even angular spacing TAU/count, with `offset` (0 for the inner
        // band, ringOffset for the outer) giving a quincuncial interleave — the
        // wrapping gap is exactly TAU/count, so no petal juts out alone.
        // Spiral: cumulative golden/custom angle (Vogel packing) — unchanged.
        let angle =
          layoutMode === 'whorl'
            ? offset + (count > 0 ? (TAU * i) / count : 0) + drift
            : baseAngle * i + offset + drift;
        angle += (rng.nextFloat() - 0.5) * rotationJitter;
        const centerFactor = clamp(1 - radialBase / Math.max(1, visibleMaxR), 0, 1);
        const morphCurve = Math.pow(centerFactor, p.centerSizeCurve ?? 1);
        const sizeMorph = 1 + (p.centerSizeMorph ?? 0) * 0.01 * morphCurve;
        const radiusRampT = layoutMode === 'whorl' ? ring.scaleT ?? 0 : t;
        const radiusScale = 1 + (p.radiusScale ?? 0) * Math.pow(radiusRampT, p.radiusScaleCurve ?? 1);
        const jitter = 1 + (rng.nextFloat() * 2 - 1) * sizeJitter;
        const length = Math.max(4, baseLength * sizeMorph * radiusScale * jitter);

        let widthRatio = baseWidthRatio;
        const budMode = Boolean(p.budMode);
        if (budMode) {
          const budRadius = clamp(p.budRadius ?? 0.15, 0.05, 2);
          const budFactor = clamp((centerFactor - (1 - budRadius)) / Math.max(0.01, budRadius), 0, 1);
          const budTight = clamp(p.budTightness ?? 0.5, 0, 10);
          const budEffect = budFactor * budTight * 0.08;
          widthRatio = Math.max(0.05, widthRatio * (1 - budEffect));
        }

        const baseX = center.x + Math.cos(angle) * radialBase;
        const baseY = center.y + Math.sin(angle) * radialBase;
        const morphWeight = clamp((p.centerShapeMorph ?? 0) * (0.35 + 0.65 * morphCurve), 0, 1);
        const curlBoost = centerBoost * centerFactor;
        const waveBoost = (p.centerWaveBoost ?? 0) * centerFactor;
        const wavePhase = rng.nextFloat() * TAU;
        // Per-petal asymmetry: a deterministic lateral lean from an isolated
        // stream (so it doesn't disturb the layout RNG). Neutral at 0.
        const petalTwist =
          tipRotate +
          (petalAsymmetry > 0
            ? (makeSubRng((p.seed ?? 0) * 7919 + (ringProgressOffset + i) * 131 + 3).nextFloat() * 2 - 1) *
              petalAsymmetry *
              0.6
            : 0);
        const lengthScale = tipLengthScale(tipCurl);
        const effectiveLength = Math.max(1, length * lengthScale);
        const waveAmp = Math.max(0, (p.edgeWaveAmp ?? 0) * (1 + waveBoost));
        const fallbackProfile = () =>
          buildLeafProfile({
            length: effectiveLength,
            widthRatio,
            steps: petalSteps,
            profile: ringProfile,
            centerProfile: ringCenterProfile,
            morphWeight,
            sharpness: tipSharpness,
            baseFlare,
            basePinch,
            waveAmp,
            waveFreq: p.edgeWaveFreq ?? 2,
            wavePhase,
            leafSidePos: p.leafSidePos,
            leafSideWidth: p.leafSideWidth,
            leafBaseHandle: p.leafBaseHandle,
            leafSideHandle: p.leafSideHandle,
            leafTipHandle: p.leafTipHandle,
          });
        let profilePoints = null;
        if (canBlendDesignerProfiles) {
          const innerPoints = buildDesignerProfile(designerInner, effectiveLength, widthRatio, petalSteps);
          const outerPoints = buildDesignerProfile(designerOuter, effectiveLength, widthRatio, petalSteps);
          profilePoints = blendProfilePoints(
            innerPoints,
            outerPoints,
            transitionMix,
            effectiveLength,
            petalSteps
          );
        } else {
          profilePoints = buildDesignerProfile(ringDesigner, effectiveLength, widthRatio, petalSteps);
        }
        if (!profilePoints) profilePoints = fallbackProfile();
        profilePoints = applyDesignerProfileSymmetry(profilePoints, effectiveLength, ringSymmetry);
        let outline = buildPetal({
          length,
          widthRatio,
          steps: petalSteps,
          tipTwist: petalTwist,
          tipCurl,
          curlBoost,
          baseX,
          baseY,
          angle,
          profile: ringProfile,
          centerProfile: ringCenterProfile,
          morphWeight,
          sharpness: tipSharpness,
          baseFlare,
          basePinch,
          waveAmp,
          waveFreq: p.edgeWaveFreq ?? 2,
          wavePhase,
          profilePoints,
          leafSidePos: p.leafSidePos,
          leafSideWidth: p.leafSideWidth,
          leafBaseHandle: p.leafBaseHandle,
          leafSideHandle: p.leafSideHandle,
          leafTipHandle: p.leafTipHandle,
        });
        let shadingLines = buildShadingLines({
          length,
          widthRatio,
          steps: Math.max(6, Math.round(petalSteps / 2)),
          profile: ringProfile,
          centerProfile: ringCenterProfile,
          morphWeight,
          sharpness: tipSharpness,
          baseFlare,
          basePinch,
          waveAmp,
          waveFreq: p.edgeWaveFreq ?? 2,
          wavePhase,
          angle,
          baseX,
          baseY,
          shadings: ringShadingStack,
          tipTwist: petalTwist,
          tipCurl,
          curlBoost,
          // Shading gets its own per-petal RNG stream, isolated from the layout
          // RNG, so editing shading never rearranges the flower.
          rng: makeSubRng((p.seed ?? 0) * 2654435761 + (ringProgressOffset + i) * 40503 + 17),
          noise,
          profilePoints,
        });
        const modifierBase = { x: baseX, y: baseY };
        outline = applyPetalModifiers([outline], ringModifierStack, modifierBase, angle, length, noise)[0] || outline;
        shadingLines = applyPetalModifiers(shadingLines, ringModifierStack, modifierBase, angle, length, noise);
        shadingLines = clipPathsInsidePolygon(shadingLines, outline);
        const petalIndex = petals.length + 1;
        const groupLabel = `Petal ${String(petalIndex).padStart(2, '0')}`;
        outline.meta = { ...(outline.meta || {}), group: groupLabel, label: 'Outline' };
        shadingLines.forEach((line, idx) => {
          if (!Array.isArray(line)) return;
          const nextLabel = line.meta?.label || `Shade ${String(idx + 1).padStart(2, '0')}`;
          line.meta = { ...(line.meta || {}), group: groupLabel, label: nextLabel };
        });
        petals.push({
          radius: radialBase,
          outline,
          shading: shadingLines,
          bbox: bboxFromPoints(outline),
          ringIndex,
          ringPetalIndex: i,
          ringPetalCount: count,
        });
      }
      ringProgressOffset += count;
    });

    if (petals.length) {
      const pushSegment = (seg, meta) => {
        if (!seg || seg.length <= 1) return;
        if (meta) seg.meta = { ...meta };
        paths.push(seg);
      };
      const bboxesOverlap = (a, b) =>
        a && b && a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
      const asOccluder = (petal) => {
        // Cache the edge list on the petal so it is built once, not rebuilt for
        // every overlapping petal that clips against it.
        if (!petal._occEdges) petal._occEdges = buildOccluderEdges(petal.outline);
        return { points: petal.outline, bbox: petal.bbox, edges: petal._occEdges, ringIndex: petal.ringIndex };
      };
      const renderPetal = (petal, clipOccluders) => {
        let shadingLines = petal.shading;
        if (p.lightSource) {
          const shadowed = [];
          shadingLines.forEach((line) => {
            const pieces = splitPathByShadow(line, p.lightSource, center, clipOccluders);
            pieces.forEach((seg) => {
              if (seg.length > 1) {
                // splitPathByShadow returns bare point arrays — re-tag with the
                // line's group/label so layers-panel grouping and SVG export
                // navigation survive lighting (mirrors clipPathsInsidePolygon).
                if (line.meta) seg.meta = { ...line.meta };
                shadowed.push(seg);
              }
            });
          });
          shadingLines = shadowed;
        }
        if (layering && clipOccluders.length) {
          const clippedOutline = clipPathOutside(petal.outline, clipOccluders);
          clippedOutline.forEach((seg) => pushSegment(seg, petal.outline.meta));
          shadingLines.forEach((line) => {
            const clipped = clipPathOutside(line, clipOccluders);
            clipped.forEach((seg) => pushSegment(seg, line.meta));
          });
        } else {
          paths.push(petal.outline);
          shadingLines.forEach((line) => {
            if (line.length > 1) paths.push(line);
          });
        }
      };
      if (layoutMode === 'whorl') {
        // A whorl is a CLOSED ring, so a painter's total order cannot close it:
        // the first-drawn petal (always at angle 0 — 3 o'clock) sat fully on top
        // of the design and the last-drawn petals lost their entire bases to the
        // accumulated occluders. Instead each petal tucks under its forward
        // neighbours (window < half the ring), which orients every overlapping
        // pair exactly once — rotationally uniform, no seam, no holes. Rings
        // still occlude each other innermost-on-top, matching a real corolla.
        const ringGroups = new Map();
        petals.forEach((petal) => {
          const list = ringGroups.get(petal.ringIndex) || [];
          list.push(petal);
          ringGroups.set(petal.ringIndex, list);
        });
        const ringOrder = [...ringGroups.keys()].sort(
          (a, b) => ringGroups.get(a)[0].radius - ringGroups.get(b)[0].radius
        );
        const completedRings = [];
        ringOrder.forEach((ri) => {
          const ringPetals = ringGroups.get(ri).slice().sort((a, b) => a.ringPetalIndex - b.ringPetalIndex);
          const n = ringPetals.length;
          const fwdWindow = Math.floor((n - 1) / 2);
          ringPetals.forEach((petal, idx) => {
            const clipOccluders = completedRings.slice();
            for (let d = 1; d <= fwdWindow; d++) {
              const neighbor = ringPetals[(idx + d) % n];
              if (bboxesOverlap(petal.bbox, neighbor.bbox)) clipOccluders.push(asOccluder(neighbor));
            }
            renderPetal(petal, clipOccluders);
          });
          ringPetals.forEach((petal) => completedRings.push(asOccluder(petal)));
        });
        completedRings.forEach((occ) => occluders.push(occ));
      } else {
        // Spiral mode keeps the radial painter's order — a spiral has a genuine
        // start and end, so inner petals legitimately sit on top of outer ones.
        const ordered = petals.slice().sort((a, b) => a.radius - b.radius);
        ordered.forEach((petal) => {
          renderPetal(petal, occluders);
          occluders.push(asOccluder(petal));
        });
      }
    }

    const centerPaths = buildCentralElements(p, rng, noise, center, maxRadius);
    centerPaths.forEach((path) => paths.push(path));

    return paths;
  };

  const formula = (p) => {
    const designerShapeOnly = Boolean(
      p.useDesignerShapeOnly || p.label === 'Petalis' || p.label === 'Petalis Designer'
    );
    const profileExpr = designerShapeOnly ? 'designer(inner->outer)' : `profile(${p.petalProfile || 'teardrop'})`;
    return (
      `θ = i * ${p.spiralMode === 'custom' ? p.customAngle ?? GOLDEN_ANGLE : GOLDEN_ANGLE}°\n` +
      `r = lerp(${p.spiralStart ?? 0}, ${p.spiralEnd ?? 1}, t^${p.spiralTightness ?? 1}) * ${p.radialGrowth ?? 1}\n` +
      `petal = ${profileExpr}`
    );
  };

  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.PetalisAlgorithm = { generate, formula };
})();
