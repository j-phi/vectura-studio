/**
 * Modifier geometry helpers.
 */
(() => {
  const {
    MODIFIER_DEFAULTS = {},
    MODIFIER_GUIDE_COLORS = [],
  } = window.Vectura || {};
  const OptimizationUtils = window.Vectura?.OptimizationUtils || {};

  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  const EPSILON = 1e-6;
  const closePathIfNeeded = OptimizationUtils.closePathIfNeeded || ((path) => path);

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const pointsEqual = (a, b, epsilon = EPSILON) =>
    Boolean(a && b && Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon);

  const makeId = (prefix = 'modifier') => `${prefix}-${Math.random().toString(36).slice(2, 11)}`;

  const getMirrorColor = (index = 0) =>
    MODIFIER_GUIDE_COLORS[index % Math.max(1, MODIFIER_GUIDE_COLORS.length)] || '#56b4e9';

  const flattenCirclePath = (meta, steps = 72) => {
    const cx = meta?.cx ?? meta?.x ?? 0;
    const cy = meta?.cy ?? meta?.y ?? 0;
    const rx = meta?.rx ?? meta?.r ?? 0;
    const ry = meta?.ry ?? meta?.r ?? rx;
    const rotation = meta?.rotation ?? 0;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = (i / steps) * Math.PI * 2;
      const px = Math.cos(t) * rx;
      const py = Math.sin(t) * ry;
      points.push({
        x: cx + px * cosR - py * sinR,
        y: cy + px * sinR + py * cosR,
      });
    }
    return points;
  };

  const flattenPath = (path) => {
    if (!Array.isArray(path)) return [];
    const points = path.meta?.kind === 'circle'
      ? flattenCirclePath(path.meta)
      : path.map((pt) => ({ x: pt.x, y: pt.y }));
    if (path.meta) points.meta = clone(path.meta);
    return points;
  };

  const clonePath = (path) => {
    if (!Array.isArray(path)) return [];
    const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
    if (path.meta) next.meta = clone(path.meta);
    return next;
  };

  const isClosedSourcePath = (path) => {
    if (!Array.isArray(path)) return false;
    if (path.meta?.kind === 'circle' || path.meta?.kind === 'shape' || path.meta?.kind === 'polygon') return true;
    if (path.meta?.closed) return true;
    if (path.length < 3) return false;
    return pointsEqual(path[0], path[path.length - 1]);
  };

  const toOpenPolygon = (path) => {
    const points = flattenPath(path);
    if (points.length >= 2 && pointsEqual(points[0], points[points.length - 1])) {
      return points.slice(0, -1);
    }
    return points.slice();
  };

  const toClosedPolygonPath = (points, sourcePath) => {
    const closed = closePathIfNeeded(points.map((pt) => ({ x: pt.x, y: pt.y })), true);
    closed.meta = {
      ...(sourcePath?.meta ? clone(sourcePath.meta) : {}),
      kind: 'polygon',
      closed: true,
    };
    if (closed.meta.anchors) delete closed.meta.anchors;
    if (closed.meta.shape) delete closed.meta.shape;
    if (closed.meta.r != null) delete closed.meta.r;
    if (closed.meta.rx != null) delete closed.meta.rx;
    if (closed.meta.ry != null) delete closed.meta.ry;
    if (closed.meta.cx != null) delete closed.meta.cx;
    if (closed.meta.cy != null) delete closed.meta.cy;
    if (closed.meta.x != null) delete closed.meta.x;
    if (closed.meta.y != null) delete closed.meta.y;
    if (closed.meta.rotation != null) delete closed.meta.rotation;
    return closed;
  };

  const reflectPath = (path, axis) => {
    const next = path.map((pt) => reflectPointAcrossAxis(pt, axis));
    if (path.meta) next.meta = clone(path.meta);
    return next;
  };

  const createMirrorLine = (index = 0, overrides = {}) => ({
    id: makeId('mirror'),
    enabled: true,
    guideVisible: true,
    locked: false,
    type: 'line',
    angle: 90,
    xShift: 0,
    yShift: 0,
    replacedSide: 'positive',
    color: getMirrorColor(index),
    ...clone(overrides),
  });

  const createModifierState = (type = 'mirror', overrides = {}) => {
    const base = clone(MODIFIER_DEFAULTS[type] || MODIFIER_DEFAULTS.mirror || {});
    return {
      ...base,
      type,
      ...clone(overrides),
    };
  };

  const isModifierLayer = (layer) => Boolean(layer && layer.isGroup && layer.containerRole === 'modifier' && layer.modifier);

  const getMirrorAxis = (mirror, bounds) => {
    const angle = (((mirror?.angle ?? 90) % 360) * Math.PI) / 180;
    const point = {
      x: (bounds?.width ?? 0) / 2 + (mirror?.xShift ?? 0),
      y: (bounds?.height ?? 0) / 2 + (mirror?.yShift ?? 0),
    };
    const tangent = { x: Math.cos(angle), y: Math.sin(angle) };
    const tangentMag = Math.hypot(tangent.x, tangent.y) || 1;
    tangent.x /= tangentMag;
    tangent.y /= tangentMag;
    const normal = { x: -tangent.y, y: tangent.x };
    const replacedSign = mirror?.replacedSide === 'negative' ? -1 : 1;
    return { point, tangent, normal, replacedSign };
  };

  const signedDistanceToAxis = (pt, axis) =>
    (pt.x - axis.point.x) * axis.normal.x + (pt.y - axis.point.y) * axis.normal.y;

  const reflectPointAcrossAxis = (pt, axis) => {
    const distance = signedDistanceToAxis(pt, axis);
    return {
      x: pt.x - 2 * distance * axis.normal.x,
      y: pt.y - 2 * distance * axis.normal.y,
    };
  };

  const clipInfiniteAxisToBounds = (axis, bounds) => {
    const minX = Number.isFinite(bounds?.x) ? bounds.x : 0;
    const minY = Number.isFinite(bounds?.y) ? bounds.y : 0;
    const width = bounds?.width ?? 0;
    const height = bounds?.height ?? 0;
    const maxX = minX + width;
    const maxY = minY + height;
    const point = axis.point;
    const tangent = axis.tangent;
    const candidates = [];
    const addCandidate = (pt) => {
      if (!pt) return;
      if (pt.x < minX - EPSILON || pt.x > maxX + EPSILON || pt.y < minY - EPSILON || pt.y > maxY + EPSILON) return;
      const next = { x: clamp(pt.x, minX, maxX), y: clamp(pt.y, minY, maxY) };
      if (!candidates.some((existing) => pointsEqual(existing, next, 1e-4))) candidates.push(next);
    };

    if (Math.abs(tangent.x) > EPSILON) {
      const tLeft = (minX - point.x) / tangent.x;
      const tRight = (maxX - point.x) / tangent.x;
      addCandidate({ x: minX, y: point.y + tangent.y * tLeft });
      addCandidate({ x: maxX, y: point.y + tangent.y * tRight });
    }
    if (Math.abs(tangent.y) > EPSILON) {
      const tTop = (minY - point.y) / tangent.y;
      const tBottom = (maxY - point.y) / tangent.y;
      addCandidate({ x: point.x + tangent.x * tTop, y: minY });
      addCandidate({ x: point.x + tangent.x * tBottom, y: maxY });
    }
    if (candidates.length < 2) return null;

    let best = [candidates[0], candidates[1]];
    let bestDist = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const dist = Math.hypot(candidates[i].x - candidates[j].x, candidates[i].y - candidates[j].y);
        if (dist > bestDist) {
          best = [candidates[i], candidates[j]];
          bestDist = dist;
        }
      }
    }
    return bestDist > EPSILON ? best : null;
  };

  /** Splits an open path into sub-paths at every intersection with axis. Returns array of point arrays; segments lying exactly on the axis are included in whichever sub-path precedes them. */
  const splitPathByAxis = (path, axis) => {
    const points = flattenPath(path);
    if (points.length < 2) return [];
    const out = [];
    let current = [points[0]];

    for (let i = 0; i < points.length - 1; i += 1) {
      const a = points[i];
      const b = points[i + 1];
      const da = signedDistanceToAxis(a, axis);
      const db = signedDistanceToAxis(b, axis);
      if (da * db < -EPSILON * EPSILON) {
        const t = da / (da - db);
        const hit = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        };
        if (!pointsEqual(current[current.length - 1], hit)) current.push(hit);
        if (current.length > 1) out.push(current);
        current = [hit];
      }
      if (!pointsEqual(current[current.length - 1], b)) current.push(b);
    }
    if (current.length > 1) out.push(current);
    return out;
  };

  /**
   * Sutherland-Hodgman clip of a closed polygon path against an infinite axis line.
   * @param {Array} path - Closed polygon path (as returned by the engine); converted internally to open form.
   * @param {{point,normal,tangent,replacedSign}} axis - Result of buildAxis() / getMirrorAxis().
   * @param {number} keepSign - +1 keeps points on the positive-normal side; -1 keeps the negative side.
   * @returns {Array} Clipped closed polygon path, or [] if the polygon is fully on the discarded side.
   */
  const clipClosedPolygonByAxis = (path, axis, keepSign) => {
    const polygon = toOpenPolygon(path);
    if (polygon.length < 3) return [];
    const isInside = (pt) => signedDistanceToAxis(pt, axis) * keepSign >= -EPSILON;
    const intersect = (a, b) => {
      const da = signedDistanceToAxis(a, axis);
      const db = signedDistanceToAxis(b, axis);
      const denom = da - db;
      if (Math.abs(denom) <= EPSILON) {
        return { x: b.x, y: b.y };
      }
      const t = da / denom;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      };
    };

    const output = [];
    for (let i = 0; i < polygon.length; i += 1) {
      const current = polygon[i];
      const next = polygon[(i + 1) % polygon.length];
      const currentInside = isInside(current);
      const nextInside = isInside(next);
      if (currentInside && nextInside) {
        if (!output.length || !pointsEqual(output[output.length - 1], next)) output.push({ x: next.x, y: next.y });
      } else if (currentInside && !nextInside) {
        const hit = intersect(current, next);
        if (!output.length || !pointsEqual(output[output.length - 1], hit)) output.push(hit);
      } else if (!currentInside && nextInside) {
        const hit = intersect(current, next);
        if (!output.length || !pointsEqual(output[output.length - 1], hit)) output.push(hit);
        if (!output.length || !pointsEqual(output[output.length - 1], next)) output.push({ x: next.x, y: next.y });
      }
    }
    if (output.length < 3) return [];
    return toClosedPolygonPath(output, path);
  };

  const classifyPieceSide = (piece, axis) => {
    if (!Array.isArray(piece) || !piece.length) return 0;
    const midIndex = Math.floor(piece.length / 2);
    const anchor = piece[midIndex] || piece[0];
    const distance = signedDistanceToAxis(anchor, axis);
    if (Math.abs(distance) <= EPSILON) return 0;
    return distance > 0 ? 1 : -1;
  };

  const buildAxisFromAngle = (cx, cy, angleDeg) => {
    const angle = (angleDeg * Math.PI) / 180;
    const tangent = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -tangent.y, y: tangent.x };
    return { point: { x: cx, y: cy }, tangent, normal, replacedSign: 1 };
  };

  const rotatePath = (path, angleRad, cx, cy) => {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const next = path.map((pt) => ({
      x: cx + (pt.x - cx) * cos - (pt.y - cy) * sin,
      y: cy + (pt.x - cx) * sin + (pt.y - cy) * cos,
    }));
    if (path.meta) next.meta = clone(path.meta);
    return next;
  };

  const clipPathsToHalfPlane = (paths, center, angleDeg, keepSign) => {
    const axis = buildAxisFromAngle(center.x, center.y, angleDeg);
    const output = [];
    (paths || []).forEach((path) => {
      if (isClosedSourcePath(path)) {
        const clipped = clipClosedPolygonByAxis(path, axis, keepSign);
        if (clipped.length) output.push(clipped);
        return;
      }
      splitPathByAxis(path, axis).forEach((piece) => {
        const side = classifyPieceSide(piece, axis);
        if (side === 0 || side === keepSign) output.push(piece);
      });
    });
    return output.filter((p) => Array.isArray(p) && p.length >= 2);
  };

  const splitPathByCircle = (path, cx, cy, R) => {
    const points = flattenPath(path);
    if (points.length < 2) return [];
    const out = [];
    let current = [points[0]];
    for (let i = 0; i < points.length - 1; i += 1) {
      const A = points[i];
      const B = points[i + 1];
      const rA = Math.hypot(A.x - cx, A.y - cy) - R;
      const rB = Math.hypot(B.x - cx, B.y - cy) - R;
      if (rA * rB < -(EPSILON * EPSILON)) {
        const Dx = B.x - A.x;
        const Dy = B.y - A.y;
        const Ex = A.x - cx;
        const Ey = A.y - cy;
        const a = Dx * Dx + Dy * Dy;
        const b2 = Dx * Ex + Dy * Ey;
        const c = Ex * Ex + Ey * Ey - R * R;
        const disc = b2 * b2 - a * c;
        if (disc >= 0) {
          const sqrtDisc = Math.sqrt(Math.max(0, disc));
          const ts = [(-b2 - sqrtDisc) / a, (-b2 + sqrtDisc) / a]
            .filter((t) => t > EPSILON && t < 1 - EPSILON)
            .sort((p, q) => p - q);
          ts.forEach((t) => {
            const hit = { x: A.x + t * Dx, y: A.y + t * Dy };
            if (!pointsEqual(current[current.length - 1], hit)) current.push(hit);
            if (current.length > 1) out.push(current);
            current = [hit];
          });
        }
      }
      if (!pointsEqual(current[current.length - 1], B)) current.push(B);
    }
    if (current.length > 1) out.push(current);
    return out;
  };

  const reflectPointAcrossCircle = (pt, cx, cy, R) => {
    const dx = pt.x - cx;
    const dy = pt.y - cy;
    const r2 = dx * dx + dy * dy;
    if (r2 < EPSILON * EPSILON) return { x: cx + R, y: cy };
    const scale = (R * R) / r2;
    return { x: cx + dx * scale, y: cy + dy * scale };
  };

  const createRadialMirror = (index = 0, overrides = {}) => ({
    id: makeId('mirror'),
    enabled: true,
    guideVisible: true,
    locked: false,
    type: 'radial',
    count: 6,
    mode: 'dihedral',
    centerX: 0,
    centerY: 0,
    angle: 0,
    color: getMirrorColor(index),
    ...clone(overrides),
  });

  const createArcMirror = (index = 0, overrides = {}) => ({
    id: makeId('mirror'),
    enabled: true,
    guideVisible: true,
    locked: false,
    type: 'arc',
    centerX: 0,
    centerY: 0,
    radius: 100,
    arcStart: -90,
    arcEnd: 90,
    replacedSide: 'outer',
    strength: 100,
    falloff: 0,
    color: getMirrorColor(index),
    ...clone(overrides),
  });

  const applyRadialMirrorToPaths = (paths, mirror, bounds) => {
    if (!mirror?.enabled) return (paths || []).map(clonePath).filter((p) => p.length >= 2);
    const count = Math.max(2, Math.round(mirror.count ?? 6));
    const mode = mirror.mode ?? 'dihedral';
    const cx = (bounds?.width ?? 0) / 2 + (mirror.centerX ?? 0);
    const cy = (bounds?.height ?? 0) / 2 + (mirror.centerY ?? 0);
    const center = { x: cx, y: cy };
    const baseAngleDeg = mirror.angle ?? 0;
    const fullWedgeDeg = 360 / count;

    if (mode === 'edge') {
      let current = (paths || []).map(clonePath).filter((p) => p.length >= 2);
      for (let k = 0; k < count; k += 1) {
        const edgeAngleDeg = baseAngleDeg + (k + 0.5) * fullWedgeDeg;
        const fakeMirror = {
          enabled: true,
          type: 'line',
          angle: edgeAngleDeg,
          xShift: mirror.centerX ?? 0,
          yShift: mirror.centerY ?? 0,
          replacedSide: 'positive',
        };
        current = applyMirrorToPaths(current, fakeMirror, bounds);
      }
      return current;
    }

    const halfWedgeDeg = fullWedgeDeg / 2;
    const clipEndDeg = mode === 'dihedral' ? baseAngleDeg + halfWedgeDeg : baseAngleDeg + fullWedgeDeg;
    let clipped = (paths || []).map(clonePath).filter((p) => p.length >= 2);
    clipped = clipPathsToHalfPlane(clipped, center, baseAngleDeg, +1);
    clipped = clipPathsToHalfPlane(clipped, center, clipEndDeg, -1);
    if (!clipped.length) return [];

    const output = [];
    const fullWedgeRad = (fullWedgeDeg * Math.PI) / 180;

    if (mode === 'rotation') {
      for (let k = 0; k < count; k += 1) {
        clipped.forEach((path) => output.push(rotatePath(path, k * fullWedgeRad, cx, cy)));
      }
    } else {
      const reflectAxisDeg = clipEndDeg;
      const reflAxis = buildAxisFromAngle(cx, cy, reflectAxisDeg);
      const reflected = clipped.map((path) => {
        if (isClosedSourcePath(path)) return toClosedPolygonPath(reflectPath(path, reflAxis), path);
        return reflectPath(path, reflAxis);
      }).filter((p) => Array.isArray(p) && p.length >= 2);

      for (let k = 0; k < count; k += 1) {
        const rot = k * fullWedgeRad;
        clipped.forEach((path) => output.push(rotatePath(path, rot, cx, cy)));
        reflected.forEach((path) => output.push(rotatePath(path, rot, cx, cy)));
      }
    }
    return output.filter((p) => Array.isArray(p) && p.length >= 2);
  };

  const applyArcMirrorToPaths = (paths, mirror, bounds) => {
    if (!mirror?.enabled) return (paths || []).map(clonePath).filter((p) => p.length >= 2);
    const cx = (bounds?.width ?? 0) / 2 + (mirror.centerX ?? 0);
    const cy = (bounds?.height ?? 0) / 2 + (mirror.centerY ?? 0);
    const R = Math.max(1, mirror.radius ?? 100);
    const replacedOutside = (mirror.replacedSide ?? 'outer') === 'outer';
    const sourceSign = replacedOutside ? -1 : +1;

    const strength = Math.max(0, Math.min(100, mirror.strength ?? 100)) / 100;
    if (strength === 0) return (paths || []).map(clonePath).filter((p) => p.length >= 2);
    const falloff = Math.max(0, Math.min(100, mirror.falloff ?? 0)) / 100;
    const arcStartRad = ((mirror.arcStart ?? -90) * Math.PI) / 180;
    const arcEndRad = ((mirror.arcEnd ?? 90) * Math.PI) / 180;
    const arcMidRad = (arcStartRad + arcEndRad) / 2;
    const arcHalfSpan = Math.abs(arcEndRad - arcStartRad) / 2;

    const pointBlend = (pt) => {
      if (strength === 0) return 0;
      let diff = Math.atan2(pt.y - cy, pt.x - cx) - arcMidRad;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const distFromEdge = arcHalfSpan - Math.abs(diff);
      if (distFromEdge <= 0) return 0;
      if (falloff === 0 || arcHalfSpan < 1e-6) return strength;
      const fadeZone = arcHalfSpan * falloff;
      const t = fadeZone > 0 ? Math.min(1, distFromEdge / fadeZone) : 1;
      return strength * t;
    };

    const radialSide = (pt) => {
      const d = Math.hypot(pt.x - cx, pt.y - cy) - R;
      if (Math.abs(d) <= EPSILON) return 0;
      return d > 0 ? +1 : -1;
    };
    const pieceSide = (piece) => {
      if (!piece.length) return 0;
      return radialSide(piece[Math.floor(piece.length / 2)] || piece[0]);
    };
    const reflectPt = (pt) => {
      const blend = pointBlend(pt);
      if (blend <= 0) return { x: pt.x, y: pt.y };
      const full = reflectPointAcrossCircle(pt, cx, cy, R);
      return { x: pt.x + blend * (full.x - pt.x), y: pt.y + blend * (full.y - pt.y) };
    };
    const reflectArcPath = (path) => {
      const next = path.map(reflectPt);
      if (path.meta) next.meta = clone(path.meta);
      return next;
    };

    const output = [];
    (paths || []).forEach((path) => {
      if (isClosedSourcePath(path)) {
        const flat = flattenPath(path);
        const centroid = flat.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
        centroid.x /= Math.max(1, flat.length);
        centroid.y /= Math.max(1, flat.length);
        const side = radialSide(centroid);
        if (side === 0 || side === sourceSign) {
          output.push(path);
          output.push(toClosedPolygonPath(reflectArcPath(flattenPath(path)), path));
        }
        return;
      }
      splitPathByCircle(path, cx, cy, R).forEach((piece) => {
        const side = pieceSide(piece);
        if (side === 0) { output.push(piece); return; }
        if (side !== sourceSign) return;
        output.push(piece);
        output.push(reflectArcPath(piece));
      });
    });
    return output.filter((p) => Array.isArray(p) && p.length >= 2);
  };

  /**
   * Applies a single mirror config to a path array.
   * Closed paths are polygon-clipped to the source half-plane, then the kept half is reflected.
   * Open paths are split at the axis; only pieces on the source side are kept and reflected.
   * The "source side" is the side opposite to mirror.replacedSign (i.e. the side the user draws on).
   */
  const applyMirrorToPaths = (paths, mirror, bounds) => {
    if (!mirror?.enabled) {
      return (paths || []).map((path) => clonePath(path)).filter((path) => path.length >= 2);
    }
    if (mirror.type === 'radial') return applyRadialMirrorToPaths(paths, mirror, bounds);
    if (mirror.type === 'arc') return applyArcMirrorToPaths(paths, mirror, bounds);
    const axis = getMirrorAxis(mirror, bounds);
    const sourceSign = axis.replacedSign * -1;
    const output = [];

    (paths || []).forEach((path) => {
      if (isClosedSourcePath(path)) {
        const sourcePolygon = clipClosedPolygonByAxis(path, axis, sourceSign);
        if (!sourcePolygon.length) return;
        output.push(sourcePolygon);
        const distances = sourcePolygon.map((pt) => Math.abs(signedDistanceToAxis(pt, axis)));
        const liesOnAxis = distances.every((distance) => distance <= EPSILON);
        if (!liesOnAxis) {
          output.push(toClosedPolygonPath(reflectPath(sourcePolygon, axis), sourcePolygon));
        }
        return;
      }
      splitPathByAxis(path, axis).forEach((piece) => {
        const side = classifyPieceSide(piece, axis);
        if (side === 0) {
          output.push(piece);
          return;
        }
        if (side !== sourceSign) return;
        output.push(piece);
        output.push(reflectPath(piece, axis));
      });
    });
    return output.filter((path) => Array.isArray(path) && path.length >= 2);
  };

  const applyModifierToPaths = (paths, modifier, bounds) => {
    if (!modifier?.enabled) return (paths || []).map((path) => clonePath(path)).filter((path) => path.length >= 2);
    if (modifier.type !== 'mirror') return (paths || []).map((path) => clonePath(path)).filter((path) => path.length >= 2);
    return (modifier.mirrors || []).reduce((current, mirror) => applyMirrorToPaths(current, mirror, bounds), paths || []);
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.Modifiers = {
    EPSILON,
    createModifierState,
    createMirrorLine,
    createRadialMirror,
    createArcMirror,
    isModifierLayer,
    flattenPath,
    getMirrorAxis,
    buildAxisFromAngle,
    signedDistanceToAxis,
    reflectPointAcrossAxis,
    reflectPointAcrossCircle,
    clipInfiniteAxisToBounds,
    applyMirrorToPaths,
    applyRadialMirrorToPaths,
    applyArcMirrorToPaths,
    applyModifierToPaths,
  };
})();
