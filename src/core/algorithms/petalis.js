/**
 * Petalis algorithm: radial petal structures with center modifiers.
 */
(() => {
  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = 137.507764;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const profileBase = (t, type) => {
    const s = Math.sin(Math.PI * t);
    switch (type) {
      case 'oval':
        return s;
      case 'teardrop':
        return s * (1 - 0.35 * t);
      case 'lanceolate':
        return Math.pow(s, 1.4);
      case 'heart':
        return s * (1 + 0.25 * Math.sin(2 * Math.PI * t));
      case 'spoon':
        return s * (0.7 + 0.3 * (1 - t)) + 0.08 * Math.sin(Math.PI * t);
      default:
        return s;
    }
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
    const sharpPow = lerp(0.8, 2.4, clamp(sharpness, 0, 1));
    w = Math.pow(Math.max(0, w), sharpPow);
    const baseFactor = 1 + (baseFlare - basePinch) * Math.pow(1 - t, 2);
    w *= baseFactor;
    if (waveAmp > 0) {
      w *= 1 + waveAmp * Math.sin(TAU * t * waveFreq + wavePhase);
    }
    return Math.max(0, w);
  };

  const buildPetal = (opts) => {
    const {
      length,
      widthRatio,
      steps,
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
    } = opts;
    const left = [];
    const right = [];
    const curlAmt = tipCurl * (1 + curlBoost);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const w = widthAt(t, {
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
      const half = (w * widthRatio * length) / 2;
      const curl = curlAmt * length * 0.15 * t * t;
      left.push({ x: t * length, y: half + curl });
      right.push({ x: t * length, y: -half + curl });
    }
    const outline = left.concat(right.reverse());
    outline.push({ ...outline[0] });
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const transformed = outline.map((pt) => ({
      x: baseX + pt.x * cosA - pt.y * sinA,
      y: baseY + pt.x * sinA + pt.y * cosA,
    }));
    return transformed;
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
      inner,
      innerType,
      innerDensity,
      outer,
      outerType,
      outerDensity,
      transition,
      hatchAngle,
      hatchNoise,
      rng,
      noise,
    } = opts;
    const lines = [];
    const innerBand = clamp(1 - transition, 0.2, 1);
    const hatchJitter = hatchNoise ? noise.noise2D(baseX * 0.002, baseY * 0.002) * hatchNoise * 30 : 0;
    const hatch = toRad((hatchAngle || 0) + hatchJitter);
    const cosH = Math.cos(hatch);
    const sinH = Math.sin(hatch);
    const rotate = (pt) => ({ x: pt.x * cosH - pt.y * sinH, y: pt.x * sinH + pt.y * cosH });

    const makeLine = (offset, tStart = 0, tEnd = 1, gradient = 0, spiral = 0) => {
      const path = [];
      for (let i = 0; i <= steps; i++) {
        const t = lerp(tStart, tEnd, i / steps);
        const w = widthAt(t, {
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
        const half = (w * widthRatio * length) / 2;
        const g = gradient ? lerp(1, 0.4, t) : 1;
        const spiralOffset = spiral ? offset + t * 0.3 * spiral : offset;
        const local = rotate({ x: t * length, y: spiralOffset * half * g });
        path.push(local);
      }
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      return path.map((pt) => ({
        x: baseX + pt.x * cosA - pt.y * sinA,
        y: baseY + pt.x * sinA + pt.y * cosA,
      }));
    };

    if (inner) {
      const count = clamp(Math.round(innerDensity * 14), 1, 24);
      for (let i = 0; i < count; i++) {
        const frac = (i + 1) / (count + 1);
        const offset = lerp(-innerBand / 2, innerBand / 2, frac);
        if (innerType === 'stipple') {
          const stepsCount = Math.max(6, Math.round(steps / 2));
          for (let s = 0; s < stepsCount; s++) {
            const t = (s + 1) / (stepsCount + 1);
            const w = widthAt(t, {
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
            const half = (w * widthRatio * length) / 2;
            const jitter = (rng.nextFloat() - 0.5) * 0.2;
            const local = rotate({ x: t * length, y: (offset + jitter) * half });
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const pt = {
              x: baseX + local.x * cosA - local.y * sinA,
              y: baseY + local.x * sinA + local.y * cosA,
            };
            lines.push([pt, { x: pt.x + 0.15, y: pt.y + 0.15 }]);
          }
        } else if (innerType === 'gradient') {
          lines.push(makeLine(offset, 0, 1, 1));
        } else if (innerType === 'spiral') {
          lines.push(makeLine(offset, 0, 1, 0, 1));
        } else {
          lines.push(makeLine(offset, 0, 1, 0));
        }
      }
    }

    if (outer) {
      if (outerType === 'outline' || outerType === 'rim') {
        const outline = buildPetal({
          length,
          widthRatio,
          steps,
          tipCurl: 0,
          curlBoost: 0,
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
        lines.push(outline);
      }
      if (outerType === 'edge') {
        const edgeCount = clamp(Math.round(outerDensity * 6), 1, 10);
        for (let i = 0; i < edgeCount; i++) {
          const frac = (i + 1) / (edgeCount + 1);
          const offset = lerp(innerBand / 2, 1, frac);
          lines.push(makeLine(offset));
          lines.push(makeLine(-offset));
        }
      }
    }
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
    const active = modifiers.filter((mod) => mod && mod.enabled !== false);
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
              const scale = mod.scale ?? 0.2;
              r += noise.noise2D(x * scale, y * scale) * amp;
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
            default:
              break;
          }
          x = Math.cos(a) * r;
          y = Math.sin(a) * r;
        });
        return { x: center.x + x, y: center.y + y };
      });
      if (closed && next.length) next[next.length - 1] = { ...next[0] };
      return next;
    });
  };

  const buildCentralElements = (p, rng, noise, center, maxRadius) => {
    const paths = [];
    const radius = Math.max(0.5, p.centerRadius ?? 6);
    const density = Math.max(1, Math.round(p.centerDensity ?? 12));
    const falloff = clamp(p.centerFalloff ?? 0.6, 0, 1);
    const type = p.centerType || 'disk';

    if (type === 'disk') {
      const circle = [];
      circle.meta = { kind: 'circle', cx: center.x, cy: center.y, r: radius };
      paths.push(circle);
    } else if (type === 'dome') {
      const rings = clamp(Math.round(density / 2), 2, 30);
      for (let i = 0; i < rings; i++) {
        const r = radius * (1 - i / rings);
        const circle = [];
        circle.meta = { kind: 'circle', cx: center.x, cy: center.y, r: Math.max(0.2, r) };
        paths.push(circle);
      }
    } else if (type === 'starburst') {
      for (let i = 0; i < density; i++) {
        const ang = (i / density) * TAU;
        const len = radius * (0.6 + 0.4 * rng.nextFloat());
        paths.push([
          { x: center.x, y: center.y },
          { x: center.x + Math.cos(ang) * len, y: center.y + Math.sin(ang) * len },
        ]);
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
          const curveAng = ang + noise.noise2D(t * 2, i * 0.2) * falloff;
          const rr = len * t;
          curve.push({ x: center.x + Math.cos(curveAng) * rr, y: center.y + Math.sin(curveAng) * rr });
        }
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
        paths.push([
          { x: center.x + Math.cos(jitterAng) * startR, y: center.y + Math.sin(jitterAng) * startR },
          { x: center.x + Math.cos(jitterAng) * (startR + len), y: center.y + Math.sin(jitterAng) * (startR + len) },
        ]);
      }
    }

    return applyModifiers(paths, p.centerModifiers, center, maxRadius, noise);
  };

  const generate = (p, rng, noise, bounds) => {
    const { m, width, height } = bounds;
    const center = { x: width / 2, y: height / 2 };
    const maxRadius = Math.min(width, height) / 2 - m;
    const paths = [];
    const ringMode = p.ringMode || 'single';
    const countJitter = clamp(p.countJitter ?? 0, 0, 0.5);
    const petalSteps = clamp(Math.round(p.petalSteps ?? 28), 12, 80);
    const rotationJitter = toRad(p.rotationJitter ?? 0);
    const sizeJitter = clamp(p.sizeJitter ?? 0, 0, 0.6);
    const spiralMode = p.spiralMode || 'golden';
    const baseAngle = toRad(spiralMode === 'custom' ? p.customAngle ?? GOLDEN_ANGLE : GOLDEN_ANGLE);
    const spiralTightness = Math.max(0.5, p.spiralTightness ?? 1);
    const radialGrowth = Math.max(0.1, p.radialGrowth ?? 1);
    const ringSplit = clamp(p.ringSplit ?? 0.5, 0.1, 0.9);
    const ringOffset = toRad(p.ringOffset ?? 0);
    const driftStrength = clamp(p.driftStrength ?? 0, 0, 1);
    const driftNoise = Math.max(0.01, p.driftNoise ?? 0.2);
    const angularDrift = toRad(p.angularDrift ?? 0);

    const ringDefs =
      ringMode === 'dual'
        ? [
            {
              count: Math.max(1, Math.round((p.innerCount ?? 0) * (1 + rng.nextRange(-countJitter, countJitter)))),
              minR: 0,
              maxR: maxRadius * ringSplit,
              offset: 0,
            },
            {
              count: Math.max(1, Math.round((p.outerCount ?? 0) * (1 + rng.nextRange(-countJitter, countJitter)))),
              minR: maxRadius * ringSplit,
              maxR: maxRadius,
              offset: ringOffset,
            },
          ]
        : [
            {
              count: Math.max(1, Math.round((p.count ?? 120) * (1 + rng.nextRange(-countJitter, countJitter)))),
              minR: 0,
              maxR: maxRadius,
              offset: 0,
            },
          ];

    ringDefs.forEach((ring, ringIndex) => {
      const { count, minR, maxR, offset } = ring;
      for (let i = 0; i < count; i++) {
        const t = count <= 1 ? 0.5 : i / (count - 1);
        const radial = lerp(minR, maxR, Math.pow(t, spiralTightness)) * radialGrowth;
        const drift = angularDrift * driftStrength * noise.noise2D(i * driftNoise, ringIndex * 2.1);
        let angle = baseAngle * i + offset + drift;
        angle += (rng.nextFloat() - 0.5) * rotationJitter;
        const centerFactor = clamp(1 - radial / maxRadius, 0, 1);
        const morphCurve = Math.pow(centerFactor, p.centerSizeCurve ?? 1);
        const sizeMorph = 1 + (p.centerSizeMorph ?? 0) * morphCurve;
        const radiusScale = 1 + (p.radiusScale ?? 0) * Math.pow(t, p.radiusScaleCurve ?? 1);
        const jitter = 1 + (rng.nextFloat() * 2 - 1) * sizeJitter;
        const length = Math.max(4, (p.petalScale ?? 30) * sizeMorph * radiusScale * jitter);

        let widthRatio = p.petalWidthRatio ?? 0.45;
        const budMode = Boolean(p.budMode);
        if (budMode) {
          const budRadius = clamp(p.budRadius ?? 0.15, 0.05, 0.5);
          const budFactor = clamp((centerFactor - (1 - budRadius)) / budRadius, 0, 1);
          const budTight = clamp(p.budTightness ?? 0.5, 0, 1);
          widthRatio *= 1 - budFactor * budTight * 0.6;
        }

        const baseX = center.x + Math.cos(angle) * radial;
        const baseY = center.y + Math.sin(angle) * radial;
        const morphWeight = clamp((p.centerShapeMorph ?? 0) * morphCurve, 0, 1);
        const curlBoost = (p.centerCurlBoost ?? 0) * centerFactor;
        const waveBoost = (p.centerWaveBoost ?? 0) * centerFactor;
        const wavePhase = rng.nextFloat() * TAU;
        const outline = buildPetal({
          length,
          widthRatio,
          steps: petalSteps,
          tipCurl: p.tipCurl ?? 0,
          curlBoost,
          baseX,
          baseY,
          angle,
          profile: p.petalProfile || 'teardrop',
          centerProfile: p.centerProfile || p.petalProfile || 'teardrop',
          morphWeight,
          sharpness: p.tipSharpness ?? 0.5,
          baseFlare: p.baseFlare ?? 0,
          basePinch: p.basePinch ?? 0,
          waveAmp: Math.max(0, (p.edgeWaveAmp ?? 0) * (1 + waveBoost)),
          waveFreq: p.edgeWaveFreq ?? 2,
          wavePhase,
        });
        paths.push(outline);

        const shadingLines = buildShadingLines({
          length,
          widthRatio,
          steps: Math.max(6, Math.round(petalSteps / 2)),
          profile: p.petalProfile || 'teardrop',
          centerProfile: p.centerProfile || p.petalProfile || 'teardrop',
          morphWeight,
          sharpness: p.tipSharpness ?? 0.5,
          baseFlare: p.baseFlare ?? 0,
          basePinch: p.basePinch ?? 0,
          waveAmp: Math.max(0, (p.edgeWaveAmp ?? 0) * (1 + waveBoost)),
          waveFreq: p.edgeWaveFreq ?? 2,
          wavePhase,
          angle,
          baseX,
          baseY,
          inner: Boolean(p.innerShading),
          innerType: p.innerShadingType || 'radial',
          innerDensity: clamp(p.innerDensity ?? 0.4, 0, 1),
          outer: Boolean(p.outerShading),
          outerType: p.outerShadingType || 'rim',
          outerDensity: clamp(p.outerDensity ?? 0.4, 0, 1),
          transition: clamp(p.shadingTransition ?? 0.3, 0, 1),
          hatchAngle: p.hatchAngle ?? 0,
          hatchNoise: p.hatchNoise ?? 0,
          rng,
          noise,
        });
        shadingLines.forEach((line) => {
          if (line.length > 1) paths.push(line);
        });
      }
    });

    const centerPaths = buildCentralElements(p, rng, noise, center, maxRadius);
    centerPaths.forEach((path) => paths.push(path));

    return paths;
  };

  const formula = (p) =>
    `θ = i * ${p.spiralMode === 'custom' ? p.customAngle ?? GOLDEN_ANGLE : GOLDEN_ANGLE}°\n` +
    `r = f(i) * ${p.spiralTightness ?? 1}\n` +
    `petal = profile(${p.petalProfile || 'teardrop'})`;

  window.Vectura = window.Vectura || {};
  window.Vectura.PetalisAlgorithm = { generate, formula };
})();
