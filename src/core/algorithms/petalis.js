/**
 * Petalis algorithm: radial petal structures with center modifiers.
 */
(() => {
  const TAU = Math.PI * 2;
  const GOLDEN_ANGLE = 137.507764;
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
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
      case 'rounded':
        return Math.pow(s, 0.7);
      case 'notched':
        return s * (1 - 0.25 * Math.sin(Math.PI * t));
      case 'spatulate':
        return s * (0.5 + 0.5 * t);
      case 'marquise':
        return Math.pow(s, 1.9) * (1 + 0.12 * Math.cos(Math.PI * t));
      case 'dagger':
        return Math.pow(s, 2.6);
      default:
        return s;
    }
  };

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
    const safeSteps = Math.max(8, Math.round(steps));
    const halfSteps = Math.max(4, Math.round(safeSteps / 2));
    const sidePos = clamp(leafSidePos ?? 0.45, 0.12, 0.88);
    const sideWidth = clamp(leafSideWidth ?? 1, 0.2, 2);
    const maxHalf = Math.max(0.5, (widthRatio * length * 0.5) * sideWidth);
    const baseHandle = clamp(leafBaseHandle ?? 0.35, 0, 1) * length * 0.5;
    const sideHandle = clamp(leafSideHandle ?? 0.4, 0, 1) * maxHalf;
    const tipHandle = clamp(leafTipHandle ?? 0.35, 0, 1) * length * 0.5;
    const sideX = length * sidePos;
    const isOval = profile === 'oval' || centerProfile === 'oval';
    const baseHandleX = isOval ? 0 : baseHandle;
    const baseHandleY = isOval ? maxHalf * clamp(leafBaseHandle ?? 0.35, 0, 1) : 0;
    const tipCtrlX = isOval ? length : Math.max(sideX + 0.5, length - tipHandle);
    const tipCtrlY = isOval ? maxHalf * clamp(leafTipHandle ?? 0.35, 0, 1) : 0;

    const seg1 = [
      { x: 0, y: 0 },
      { x: baseHandleX, y: baseHandleY },
      { x: sideX, y: Math.max(0, maxHalf - sideHandle) },
      { x: sideX, y: maxHalf },
    ];
    const seg2 = [
      { x: sideX, y: maxHalf },
      { x: sideX, y: maxHalf + sideHandle },
      { x: tipCtrlX, y: tipCtrlY },
      { x: length, y: 0 },
    ];
    const points = [];
    for (let i = 0; i <= halfSteps; i++) {
      const t = i / halfSteps;
      points.push(cubicBezierPoint(seg1[0], seg1[1], seg1[2], seg1[3], t));
    }
    for (let i = 1; i <= halfSteps; i++) {
      const t = i / halfSteps;
      points.push(cubicBezierPoint(seg2[0], seg2[1], seg2[2], seg2[3], t));
    }
    const adjusted = points.map((pt) => {
      const t = clamp(pt.x / Math.max(1, length), 0, 1);
      const base = profileBase(t, profile);
      const center = profileBase(t, centerProfile || profile);
      let scale = lerp(base, center, morphWeight);
      const sharpPow = sharpnessExponent(t, sharpness);
      scale = Math.pow(Math.max(0, scale), sharpPow);
      const baseFactor = 1 + (baseFlare - basePinch) * Math.pow(1 - t, 2);
      const waveFactor = waveAmp > 0 ? 1 + waveAmp * Math.sin(TAU * t * waveFreq + wavePhase) : 1;
      return { x: pt.x, y: Math.max(0, pt.y * scale * baseFactor * waveFactor) };
    });
    return adjusted;
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

    const makeLine = (offset, tStart, tEnd, hatchAngle, gradient = 0, spiral = 0) => {
      const path = [];
      const hatch = toRad(hatchAngle || 0);
      const cosH = Math.cos(hatch);
      const sinH = Math.sin(hatch);
      const rotate = (pt) => ({ x: pt.x * cosH - pt.y * sinH, y: pt.x * sinH + pt.y * cosH });
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
        const half = profilePoints && profilePoints.length ? w : (w * widthRatio * effectiveLength) / 2;
        const g = gradient ? lerp(1, 0.4, t) : 1;
        const spiralOffset = spiral ? offset + t * 0.3 * spiral : offset;
        const curl = twist * effectiveLength * 0.02 * t * t;
        const local = rotate({ x: t * effectiveLength, y: spiralOffset * half * g + curl });
        path.push(local);
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
      return { offsetStart, offsetEnd, gapStart, gapEnd, count };
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
      const { offsetStart, offsetEnd, gapStart, gapEnd, count } = buildOffsets(shade, halfWidth);
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
        if (offset >= gapStart && offset <= gapEnd) continue;
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
          } else {
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
            case 'circularOffset': {
              const seed = mod.seed ?? 0;
              const randomness = clamp(mod.randomness ?? 0, 0, 1);
              const dir = clamp(mod.direction ?? 0, -1, 1);
              const amp = mod.amount ?? 2;
              const n = noise.noise2D(x * 0.02 + seed, y * 0.02 - seed);
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
    const active = modifiers.filter((mod) => mod && mod.enabled !== false);
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
              const scale = mod.scale ?? 0.2;
              const n = noise.noise2D(lx * scale, ly * scale);
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
          const curveAng = ang + noise.noise2D(t * 2, i * 0.2) * falloff;
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
    const segBox = bboxFromPoints([a, b]);
    const intersections = [];
    const insideAny = (pt) => occluders.some((occ) => pointInPoly(pt, occ.points));

    occluders.forEach((occ) => {
      if (!bboxIntersects(segBox, occ.bbox)) return;
      const pts = occ.points;
      const count = pts.length;
      for (let i = 0; i < count; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % count];
        const hit = segmentIntersection(a, b, p1, p2);
        if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) intersections.push(hit.t);
      }
    });
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

  const generate = (p, rng, noise, bounds) => {
    const { m, width, height } = bounds;
    const center = { x: width / 2, y: height / 2 };
    const maxRadius = Math.min(width, height) / 2 - m;
    const paths = [];
    const petals = [];
    const occluders = [];
    const layering = p.layering !== false;
    const shadings = Array.isArray(p.shadings) ? p.shadings : [];
    const legacyShadings = [];
    if (!shadings.length && (p.innerShading || p.outerShading)) {
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
    const shadingStack = shadings.length ? shadings : legacyShadings;
    const ringMode = p.ringMode || 'single';
    const normalizeTipRotate = (value) => (value > 10 ? value / 10 : value);
    const tipRotate = normalizeTipRotate(p.tipTwist ?? 0);
    const rawCenterBoost = p.centerCurlBoost ?? 0;
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
    const spiralMode = p.spiralMode || 'golden';
    const baseAngle = toRad(spiralMode === 'custom' ? p.customAngle ?? GOLDEN_ANGLE : GOLDEN_ANGLE);
    const spiralTightness = Math.max(0.5, p.spiralTightness ?? 1);
    const radialGrowth = Math.max(0.1, p.radialGrowth ?? 1);
    const spiralStart = clamp(p.spiralStart ?? 0, 0, 1);
    const spiralEnd = clamp(p.spiralEnd ?? 1, 0, 1);
    const spiralMin = Math.min(spiralStart, spiralEnd);
    const spiralMax = Math.max(spiralStart, spiralEnd);
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
              maxR: visibleMaxR * ringSplit,
              offset: 0,
            },
            {
              count: Math.max(1, Math.round((p.outerCount ?? 0) * (1 + rng.nextRange(-countJitter, countJitter)))),
              minR: visibleMaxR * ringSplit,
              maxR: visibleMaxR,
              offset: ringOffset,
            },
          ]
        : [
            {
              count: Math.max(1, Math.round((p.count ?? 120) * (1 + rng.nextRange(-countJitter, countJitter)))),
              minR: 0,
              maxR: visibleMaxR,
              offset: 0,
            },
          ];

    ringDefs.forEach((ring, ringIndex) => {
      const { count, minR, maxR, offset } = ring;
      for (let i = 0; i < count; i++) {
        const t = count <= 1 ? 0.5 : i / (count - 1);
        const spiralT = lerp(spiralMin, spiralMax, Math.pow(t, spiralTightness));
        const radial = lerp(minR, maxR, spiralT) * radialGrowth;
        let radialBase = anchorRadius + radial;
        if (anchorMode === 'all') radialBase = anchorRadius;
        const drift = angularDrift * driftStrength * noise.noise2D(i * driftNoise, ringIndex * 2.1);
        let angle = baseAngle * i + offset + drift;
        angle += (rng.nextFloat() - 0.5) * rotationJitter;
        const centerFactor = clamp(1 - radialBase / Math.max(1, visibleMaxR), 0, 1);
        const morphCurve = Math.pow(centerFactor, p.centerSizeCurve ?? 1);
        const sizeMorph = 1 + (p.centerSizeMorph ?? 0) * 0.01 * morphCurve;
        const radiusScale = 1 + (p.radiusScale ?? 0) * Math.pow(t, p.radiusScaleCurve ?? 1);
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
        const lengthScale = tipLengthScale(p.tipCurl ?? 0);
        const effectiveLength = Math.max(1, length * lengthScale);
        const profilePoints = buildLeafProfile({
          length: effectiveLength,
          widthRatio,
          steps: petalSteps,
          profile: p.petalProfile || 'teardrop',
          centerProfile: p.centerProfile || p.petalProfile || 'teardrop',
          morphWeight,
          sharpness: p.tipSharpness ?? 0.5,
          baseFlare: p.baseFlare ?? 0,
          basePinch: p.basePinch ?? 0,
          waveAmp: Math.max(0, (p.edgeWaveAmp ?? 0) * (1 + waveBoost)),
          waveFreq: p.edgeWaveFreq ?? 2,
          wavePhase,
          leafSidePos: p.leafSidePos,
          leafSideWidth: p.leafSideWidth,
          leafBaseHandle: p.leafBaseHandle,
          leafSideHandle: p.leafSideHandle,
          leafTipHandle: p.leafTipHandle,
        });
        let outline = buildPetal({
          length,
          widthRatio,
          steps: petalSteps,
          tipTwist: tipRotate,
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
          shadings: shadingStack,
          tipTwist: tipRotate,
          tipCurl: p.tipCurl ?? 0,
          curlBoost,
          rng,
          noise,
          profilePoints,
        });
        const modifierBase = { x: baseX, y: baseY };
        outline = applyPetalModifiers([outline], p.petalModifiers || [], modifierBase, angle, length, noise)[0] || outline;
        shadingLines = applyPetalModifiers(shadingLines, p.petalModifiers || [], modifierBase, angle, length, noise);
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
        });
      }
    });

    if (petals.length) {
      const ordered = petals.slice().sort((a, b) => a.radius - b.radius);
      const pushSegment = (seg, meta) => {
        if (!seg || seg.length <= 1) return;
        if (meta) seg.meta = { ...meta };
        paths.push(seg);
      };
      ordered.forEach((petal) => {
        let shadingLines = petal.shading;
        if (p.lightSource) {
          const shadowed = [];
          shadingLines.forEach((line) => {
            const pieces = splitPathByShadow(line, p.lightSource, center, occluders);
            pieces.forEach((seg) => {
              if (seg.length > 1) shadowed.push(seg);
            });
          });
          shadingLines = shadowed;
        }
        if (layering && occluders.length) {
          const clippedOutline = clipPathOutside(petal.outline, occluders);
          clippedOutline.forEach((seg) => pushSegment(seg, petal.outline.meta));
          shadingLines.forEach((line) => {
            const clipped = clipPathOutside(line, occluders);
            clipped.forEach((seg) => pushSegment(seg, line.meta));
          });
        } else {
          paths.push(petal.outline);
          shadingLines.forEach((line) => {
            if (line.length > 1) paths.push(line);
          });
        }
        occluders.push({ points: petal.outline, bbox: petal.bbox });
      });
    }

    const centerPaths = buildCentralElements(p, rng, noise, center, maxRadius);
    centerPaths.forEach((path) => paths.push(path));

    return paths;
  };

  const formula = (p) =>
    `θ = i * ${p.spiralMode === 'custom' ? p.customAngle ?? GOLDEN_ANGLE : GOLDEN_ANGLE}°\n` +
    `r = lerp(${p.spiralStart ?? 0}, ${p.spiralEnd ?? 1}, t^${p.spiralTightness ?? 1}) * ${p.radialGrowth ?? 1}\n` +
    `petal = profile(${p.petalProfile || 'teardrop'})`;

  window.Vectura = window.Vectura || {};
  window.Vectura.PetalisAlgorithm = { generate, formula };
})();
