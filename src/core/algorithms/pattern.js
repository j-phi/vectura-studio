/**
 * Pattern tiling algorithm definition.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const svgCache = new Map();
  const deepClone = (value) => JSON.parse(JSON.stringify(value));
  const getPatternRegistry = () => window.Vectura?.PatternRegistry || null;
  const getPatternMeta = (patternOrId) => {
    if (patternOrId && typeof patternOrId === 'object' && patternOrId.svg) return patternOrId;
    const registry = getPatternRegistry();
    if (registry?.getPatternById) return registry.getPatternById(patternOrId);
    return (window.Vectura.PATTERNS || []).find((pattern) => pattern?.id === patternOrId) || null;
  };
  const getPatternCacheKey = (meta = {}) => {
    if (!meta?.id) return '';
    const version = window.Vectura?.PATTERN_REGISTRY_VERSION || 0;
    const stamp = meta.customUpdatedAt || meta.validation?.validatedAt || meta.validation?.updatedAt || '';
    return `${meta.id}::${stamp}::${version}`;
  };

  // Extract all explicit node coordinates from an SVG path d attribute.
  // Only absolute/relative M, L, H, V, Z are used for straight-line nodes;
  // curve commands just track the current point without emitting a node.
  const parseSvgDNodes = (d) => {
    if (!d) return [];
    const nodes = [];
    const cmdRe = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
    let cx = 0, cy = 0, sx = 0, sy = 0;
    const floats = s => s.trim().split(/[\s,]+/).map(parseFloat).filter(v => isFinite(v));
    let m;
    while ((m = cmdRe.exec(d)) !== null) {
      const c = m[1], ns = floats(m[2]);
      switch (c) {
        case 'M': for (let i = 0; i + 1 < ns.length; i += 2) { cx = ns[i]; cy = ns[i+1]; if (i===0){sx=cx;sy=cy;} nodes.push({x:cx,y:cy}); } break;
        case 'm': for (let i = 0; i + 1 < ns.length; i += 2) { cx+=ns[i]; cy+=ns[i+1]; if (i===0){sx=cx;sy=cy;} nodes.push({x:cx,y:cy}); } break;
        case 'L': for (let i = 0; i + 1 < ns.length; i += 2) { cx=ns[i]; cy=ns[i+1]; nodes.push({x:cx,y:cy}); } break;
        case 'l': for (let i = 0; i + 1 < ns.length; i += 2) { cx+=ns[i]; cy+=ns[i+1]; nodes.push({x:cx,y:cy}); } break;
        case 'H': for (const x of ns) { cx=x; nodes.push({x:cx,y:cy}); } break;
        case 'h': for (const x of ns) { cx+=x; nodes.push({x:cx,y:cy}); } break;
        case 'V': for (const y of ns) { cy=y; nodes.push({x:cx,y:cy}); } break;
        case 'v': for (const y of ns) { cy+=y; nodes.push({x:cx,y:cy}); } break;
        case 'C': for (let i=0;i+5<ns.length;i+=6){cx=ns[i+4];cy=ns[i+5];} break;
        case 'c': for (let i=0;i+5<ns.length;i+=6){cx+=ns[i+4];cy+=ns[i+5];} break;
        case 'S': for (let i=0;i+3<ns.length;i+=4){cx=ns[i+2];cy=ns[i+3];} break;
        case 's': for (let i=0;i+3<ns.length;i+=4){cx+=ns[i+2];cy+=ns[i+3];} break;
        case 'Q': for (let i=0;i+3<ns.length;i+=4){cx=ns[i+2];cy=ns[i+3];} break;
        case 'q': for (let i=0;i+3<ns.length;i+=4){cx+=ns[i+2];cy+=ns[i+3];} break;
        case 'T': for (let i=0;i+1<ns.length;i+=2){cx=ns[i];cy=ns[i+1];} break;
        case 't': for (let i=0;i+1<ns.length;i+=2){cx+=ns[i];cy+=ns[i+1];} break;
        case 'A': for (let i=0;i+6<ns.length;i+=7){cx=ns[i+5];cy=ns[i+6];} break;
        case 'a': for (let i=0;i+6<ns.length;i+=7){cx+=ns[i+5];cy+=ns[i+6];} break;
        case 'Z': case 'z': nodes.push({x:sx,y:sy}); cx=sx; cy=sy; break;
      }
    }
    return nodes;
  };

  // Split a path d attribute into individual subpath strings, each starting
  // with an absolute M command. Handles relative m by converting to absolute.
  const getSubpathStrings = (d) => {
    if (!d) return [];
    const cmdRe = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
    const floats = s => s.trim().split(/[\s,]+/).map(parseFloat).filter(v => isFinite(v));
    let cx = 0, cy = 0, sx = 0, sy = 0;
    const result = [];
    let currentParts = [];
    let m;
    while ((m = cmdRe.exec(d)) !== null) {
      const c = m[1], ns = floats(m[2]);
      if (c === 'M' || c === 'm') {
        if (currentParts.length) result.push(currentParts.join(''));
        const ax = c === 'M' ? (ns[0] ?? 0) : cx + (ns[0] ?? 0);
        const ay = c === 'M' ? (ns[1] ?? 0) : cy + (ns[1] ?? 0);
        let head = `M${ax},${ay}`;
        if (ns.length > 2) {
          let lx = ax, ly = ay;
          for (let i = 2; i + 1 < ns.length; i += 2) {
            if (c === 'M') { lx = ns[i]; ly = ns[i+1]; }
            else { lx += ns[i]; ly += ns[i+1]; }
            head += `L${lx},${ly}`;
          }
          cx = lx; cy = ly;
        } else {
          cx = ax; cy = ay;
        }
        sx = ax; sy = ay;
        currentParts = [head];
      } else {
        currentParts.push(c + m[2]);
        switch (c) {
          case 'L': if (ns.length >= 2) { cx = ns[ns.length-2]; cy = ns[ns.length-1]; } break;
          case 'l': for (let i=0;i+1<ns.length;i+=2){cx+=ns[i];cy+=ns[i+1];} break;
          case 'H': if (ns.length) cx = ns[ns.length-1]; break;
          case 'h': for (const x of ns) cx += x; break;
          case 'V': if (ns.length) cy = ns[ns.length-1]; break;
          case 'v': for (const y of ns) cy += y; break;
          case 'C': if (ns.length >= 6) { cx = ns[ns.length-2]; cy = ns[ns.length-1]; } break;
          case 'c': for (let i=0;i+5<ns.length;i+=6){cx+=ns[i+4];cy+=ns[i+5];} break;
          case 'S': if (ns.length >= 4) { cx = ns[ns.length-2]; cy = ns[ns.length-1]; } break;
          case 's': for (let i=0;i+3<ns.length;i+=4){cx+=ns[i+2];cy+=ns[i+3];} break;
          case 'Q': if (ns.length >= 4) { cx = ns[ns.length-2]; cy = ns[ns.length-1]; } break;
          case 'q': for (let i=0;i+3<ns.length;i+=4){cx+=ns[i+2];cy+=ns[i+3];} break;
          case 'T': if (ns.length >= 2) { cx = ns[ns.length-2]; cy = ns[ns.length-1]; } break;
          case 't': for (let i=0;i+1<ns.length;i+=2){cx+=ns[i];cy+=ns[i+1];} break;
          case 'A': if (ns.length >= 7) { cx = ns[ns.length-2]; cy = ns[ns.length-1]; } break;
          case 'a': for (let i=0;i+6<ns.length;i+=7){cx+=ns[i+5];cy+=ns[i+6];} break;
          case 'Z': case 'z': cx = sx; cy = sy; break;
        }
      }
    }
    if (currentParts.length) result.push(currentParts.join(''));
    return result;
  };

  const extractExactLineSubpathPoints = (d) => {
    if (!d) return null;
    const points = [];
    const cmdRe = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
    const floats = (s) => s.trim().split(/[\s,]+/).map(parseFloat).filter((v) => Number.isFinite(v));
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let match = cmdRe.exec(d);
    while (match) {
      const command = match[1];
      const values = floats(match[2]);
      if (!/[MmLlHhVvZz]/.test(command)) return null;
      switch (command) {
        case 'M':
        case 'm': {
          for (let i = 0; i + 1 < values.length; i += 2) {
            if (command === 'M') {
              cx = values[i];
              cy = values[i + 1];
            } else {
              cx += values[i];
              cy += values[i + 1];
            }
            if (i === 0) {
              sx = cx;
              sy = cy;
            }
            points.push({ x: cx, y: cy });
          }
          break;
        }
        case 'L':
          for (let i = 0; i + 1 < values.length; i += 2) {
            cx = values[i];
            cy = values[i + 1];
            points.push({ x: cx, y: cy });
          }
          break;
        case 'l':
          for (let i = 0; i + 1 < values.length; i += 2) {
            cx += values[i];
            cy += values[i + 1];
            points.push({ x: cx, y: cy });
          }
          break;
        case 'H':
          values.forEach((value) => {
            cx = value;
            points.push({ x: cx, y: cy });
          });
          break;
        case 'h':
          values.forEach((value) => {
            cx += value;
            points.push({ x: cx, y: cy });
          });
          break;
        case 'V':
          values.forEach((value) => {
            cy = value;
            points.push({ x: cx, y: cy });
          });
          break;
        case 'v':
          values.forEach((value) => {
            cy += value;
            points.push({ x: cx, y: cy });
          });
          break;
        case 'Z':
        case 'z':
          points.push({ x: sx, y: sy });
          cx = sx;
          cy = sy;
          break;
      }
      match = cmdRe.exec(d);
    }
    return points.length >= 2 ? points : null;
  };

  const parseNumber = (val, fallback = 0) => {
    if (val === undefined || val === null) return fallback;
    const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : fallback;
  };

  const resolveInheritedSvgAttribute = (el, attr) => {
    let node = el;
    while (node && typeof node.getAttribute === 'function') {
      const value = node.getAttribute(attr);
      if (value !== null && value !== '') return value;
      node = node.parentElement;
    }
    return '';
  };

  const clonePath = (path = []) => {
    const next = Array.isArray(path) ? path.map((pt) => ({ ...pt })) : [];
    if (path?.meta) next.meta = { ...path.meta };
    return next;
  };

  const dedupeSequentialPoints = (path = [], tolerance = 1e-6) =>
    (path || []).filter((pt, index, arr) =>
      index === 0 || Math.hypot(pt.x - arr[index - 1].x, pt.y - arr[index - 1].y) > tolerance
    );

  const { isClosedPath } = window.Vectura.OptimizationUtils;

  const mergeTouchingChains = (inputPaths = []) => {
    const snap = (v) => Math.round(v * 20) / 20;
    const keyForPoint = (pt) => `${snap(pt.x)},${snap(pt.y)}`;
    const active = inputPaths
      .filter((path) => Array.isArray(path) && path.length >= 2)
      .map((path) => clonePath(path));
    const tangentForEndpoint = (path, endpoint) => {
      if (!Array.isArray(path) || path.length < 2) return { x: 0, y: 0 };
      if (endpoint === 'start') {
        return {
          x: path[1].x - path[0].x,
          y: path[1].y - path[0].y,
        };
      }
      return {
        x: path[path.length - 2].x - path[path.length - 1].x,
        y: path[path.length - 2].y - path[path.length - 1].y,
      };
    };
    const normalizeVec = (vec) => {
      const len = Math.hypot(vec.x, vec.y);
      if (len < 1e-9) return { x: 0, y: 0 };
      return {
        x: vec.x / len,
        y: vec.y / len,
      };
    };
    const scoreEndpointPair = (a, b) => {
      const ta = normalizeVec(tangentForEndpoint(active[a.pathIndex], a.endpoint));
      const tb = normalizeVec(tangentForEndpoint(active[b.pathIndex], b.endpoint));
      return ta.x * tb.x + ta.y * tb.y;
    };
    const orientForMerge = (path, endpoint, desiredEndpoint) => {
      if (!Array.isArray(path)) return [];
      if (endpoint === desiredEndpoint) return path;
      return path.slice().reverse();
    };
    const normalizeMergedPath = (path) => {
      if (!Array.isArray(path) || path.length < 4) return path;
      const seen = new Map();
      let bestRange = null;
      path.forEach((point, index) => {
        const key = keyForPoint(point);
        if (!seen.has(key)) {
          seen.set(key, index);
          return;
        }
        const startIndex = seen.get(key);
        if (index - startIndex < 3) return;
        if (!bestRange || (index - startIndex) > (bestRange.end - bestRange.start)) {
          bestRange = { start: startIndex, end: index };
        }
      });
      if (!bestRange) return path;
      const normalized = path.slice(bestRange.start, bestRange.end + 1);
      if (path.meta) normalized.meta = { ...path.meta };
      return normalized;
    };

    let mergedAny = true;
    while (mergedAny) {
      mergedAny = false;
      const buckets = new Map();
      active.forEach((path, pathIndex) => {
        if (!path || path.length < 2) return;
        [
          { endpoint: 'start', point: path[0] },
          { endpoint: 'end', point: path[path.length - 1] },
        ].forEach((entry) => {
          const key = keyForPoint(entry.point);
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push({ pathIndex, endpoint: entry.endpoint });
        });
      });

      for (const entries of buckets.values()) {
        const available = entries.filter((entry) => active[entry.pathIndex]);
        if (available.length < 2) continue;
        let bestPair = null;
        for (let i = 0; i < available.length; i += 1) {
          for (let j = i + 1; j < available.length; j += 1) {
            const left = available[i];
            const right = available[j];
            if (left.pathIndex === right.pathIndex) continue;
            const score = scoreEndpointPair(left, right);
            if (!bestPair || score < bestPair.score) {
              bestPair = { left, right, score };
            }
          }
        }
        if (!bestPair) continue;

        const a = active[bestPair.left.pathIndex];
        const b = active[bestPair.right.pathIndex];
        if (!a || !b) continue;
        const aOriented = orientForMerge(a, bestPair.left.endpoint, 'end');
        const bOriented = orientForMerge(b, bestPair.right.endpoint, 'start');
        const merged = aOriented.concat(bOriented.slice(1));
        if (a.meta) merged.meta = a.meta;
        active[bestPair.left.pathIndex] = merged;
        active[bestPair.right.pathIndex] = null;
        mergedAny = true;
        break;
      }
    }

    return active
      .filter((path) => Array.isArray(path) && path.length >= 2)
      .map((path) => normalizeMergedPath(path))
      .map((path) => {
        const first = path[0];
        const last = path[path.length - 1];
        if (first && last && keyForPoint(first) === keyForPoint(last)) return path;
        return path;
      });
  };

  const choosePatternFillResolution = (vbW = 0, vbH = 0, complexity = 1) => {
    const aspectSafeW = Math.max(1, Number(vbW) || 1);
    const aspectSafeH = Math.max(1, Number(vbH) || 1);
    const baseCellSize = complexity > 24 ? 0.32 : 0.4;
    const maxCells = complexity > 24 ? 448 : 384;
    const minCells = 64;
    const nx = Math.max(minCells, Math.min(maxCells, Math.round(aspectSafeW / baseCellSize)));
    const ny = Math.max(minCells, Math.min(maxCells, Math.round(aspectSafeH / baseCellSize)));
    return { nx, ny };
  };

  const simplifyCollinearPoints = (path = [], tolerance = 1e-6) => {
    if (!Array.isArray(path) || path.length < 3) return path;
    const closed = isClosedPath(path);
    const working = closed ? path.slice(0, -1) : path.slice();
    if (working.length < 3) return path;
    const simplified = [];
    for (let i = 0; i < working.length; i += 1) {
      const prev = working[(i - 1 + working.length) % working.length];
      const curr = working[i];
      const next = working[(i + 1) % working.length];
      if (!closed && (i === 0 || i === working.length - 1)) {
        simplified.push({ ...curr });
        continue;
      }
      const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
      if (Math.abs(cross) > tolerance) simplified.push({ ...curr });
    }
    if (closed && simplified.length) simplified.push({ ...simplified[0] });
    return simplified.length >= 2 ? simplified : path;
  };

  const perpendicularDistanceToSegment = (point, start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) return Math.hypot(point.x - start.x, point.y - start.y);
    const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq;
    const clamped = Math.max(0, Math.min(1, t));
    const projX = start.x + dx * clamped;
    const projY = start.y + dy * clamped;
    return Math.hypot(point.x - projX, point.y - projY);
  };

  const simplifyPathRdp = (points = [], tolerance = 0) => {
    if (!Array.isArray(points) || points.length <= 2 || tolerance <= 0) return points;
    let maxDistance = -1;
    let splitIndex = -1;
    for (let i = 1; i < points.length - 1; i += 1) {
      const distance = perpendicularDistanceToSegment(points[i], points[0], points[points.length - 1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = i;
      }
    }
    if (maxDistance <= tolerance || splitIndex === -1) return [points[0], points[points.length - 1]];
    const left = simplifyPathRdp(points.slice(0, splitIndex + 1), tolerance);
    const right = simplifyPathRdp(points.slice(splitIndex), tolerance);
    return left.slice(0, -1).concat(right);
  };

  const normalizeContourPath = (path = [], vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0, cellW = 1, cellH = 1) => {
    if (!Array.isArray(path) || path.length < 2) return path;
    const boundaryTol = Math.max(cellW, cellH) * 0.35;
    const snapBoundaryValue = (value, low, high) => {
      if (Math.abs(value - low) <= boundaryTol) return low;
      if (Math.abs(value - high) <= boundaryTol) return high;
      return value;
    };
    let next = path.map((pt) => ({
      x: snapBoundaryValue(pt.x, vbMinX, vbMinX + vbW),
      y: snapBoundaryValue(pt.y, vbMinY, vbMinY + vbH),
    }));
    next = dedupeSequentialPoints(next);
    const first = next[0];
    const last = next[next.length - 1];
    if (first && last && Math.hypot(first.x - last.x, first.y - last.y) < Math.max(cellW, cellH) * 0.5) {
      next[next.length - 1] = { ...first };
    }
    next = simplifyCollinearPoints(next, 1e-5);
    if (isClosedPath(next)) {
      const open = next.slice(0, -1);
      const simplified = simplifyPathRdp(open, Math.max(cellW, cellH) * 0.12);
      next = dedupeSequentialPoints(simplified);
      if (next.length >= 3) next.push({ ...next[0] });
    } else if (next.length >= 2) {
      next = dedupeSequentialPoints(simplifyPathRdp(next, Math.max(cellW, cellH) * 0.12));
    }
    return simplifyCollinearPoints(next, 1e-5);
  };

  const tracePeriodicFillBoundaries = (contains, vbW = 0, vbH = 0, options = {}) => {
    if (typeof contains !== 'function') return [];
    const vbMinX = Number(options.vbMinX) || 0;
    const vbMinY = Number(options.vbMinY) || 0;
    const complexity = Math.max(1, Number(options.complexity) || 1);
    const periodic = options.periodic !== false;
    const chosen = choosePatternFillResolution(vbW, vbH, complexity);
    const nx = Math.max(2, Number(options.nx) || chosen.nx);
    const ny = Math.max(2, Number(options.ny) || chosen.ny);
    const cellW = vbW / nx;
    const cellH = vbH / ny;
    const occupancy = Array.from({ length: ny }, () => Array(nx).fill(false));
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const x = vbMinX + ((i + 0.5) / nx) * vbW;
        const y = vbMinY + ((j + 0.5) / ny) * vbH;
        occupancy[j][i] = !!contains(x, y);
      }
    }

    const segments = [];
    const xAt = (column) => vbMinX + (column / nx) * vbW;
    const yAt = (row) => vbMinY + (row / ny) * vbH;
    const pushSegment = (a, b) => {
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-9) return;
      segments.push([a, b]);
    };

    for (let j = 0; j < ny; j += 1) {
      const topRow = yAt(j);
      const bottomRow = yAt(j + 1);
      for (let i = 0; i < nx; i += 1) {
        if (!occupancy[j][i]) continue;
        const leftIndex = periodic ? (i - 1 + nx) % nx : i - 1;
        const rightIndex = periodic ? (i + 1) % nx : i + 1;
        const aboveIndex = periodic ? (j - 1 + ny) % ny : j - 1;
        const belowIndex = periodic ? (j + 1) % ny : j + 1;
        const leftX = xAt(i);
        const rightX = xAt(i + 1);
        const leftFilled = leftIndex >= 0 && leftIndex < nx ? occupancy[j][leftIndex] : false;
        const rightFilled = rightIndex >= 0 && rightIndex < nx ? occupancy[j][rightIndex] : false;
        const aboveFilled = aboveIndex >= 0 && aboveIndex < ny ? occupancy[aboveIndex][i] : false;
        const belowFilled = belowIndex >= 0 && belowIndex < ny ? occupancy[belowIndex][i] : false;
        if (!leftFilled) pushSegment({ x: leftX, y: bottomRow }, { x: leftX, y: topRow });
        if (!rightFilled) pushSegment({ x: rightX, y: topRow }, { x: rightX, y: bottomRow });
        if (!aboveFilled) pushSegment({ x: leftX, y: topRow }, { x: rightX, y: topRow });
        if (!belowFilled) pushSegment({ x: rightX, y: bottomRow }, { x: leftX, y: bottomRow });
      }
    }

    if (!segments.length) return [];
    const merged = mergeTouchingChains(segments);
    return merged
      .filter((path) => Array.isArray(path) && path.length >= 2)
      .map((path) => normalizeContourPath(path, vbMinX, vbMinY, vbW, vbH, cellW, cellH))
      .filter((path) => Array.isArray(path) && path.length >= 2);
  };

  const traceFillOnlyPolygonUnionBoundaries = (elements = [], vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0) => {
    const FillBoolean = window.Vectura?.FillBoolean || {};
    const ringsToEvenOddMultiPolygon = FillBoolean.ringsToEvenOddMultiPolygon;
    const ringsToNonZeroMultiPolygon = FillBoolean.ringsToNonZeroMultiPolygon;
    const union = FillBoolean.union;
    const intersection = FillBoolean.intersection;
    const offsetMultiPolygon = FillBoolean.offsetMultiPolygon;
    const rectToMultiPolygon = FillBoolean.rectToMultiPolygon;
    const multiPolygonToPaths = FillBoolean.multiPolygonToPaths;
    if (
      typeof ringsToEvenOddMultiPolygon !== 'function'
      || typeof ringsToNonZeroMultiPolygon !== 'function'
      || typeof union !== 'function'
      || typeof intersection !== 'function'
      || typeof offsetMultiPolygon !== 'function'
      || typeof rectToMultiPolygon !== 'function'
      || typeof multiPolygonToPaths !== 'function'
    ) {
      return [];
    }

    const fillElements = (elements || []).filter((el) => typeof el?.isPointInFill === 'function');
    if (!fillElements.length) return [];
    const perElement = fillElements.map((el) => {
      const rings = svgElementToPaths(el, vbMinX, vbMinY, vbMinX, vbMinY, vbW, vbH, {
        sampleDistance: 0.4,
        snapTolerance: 0.35,
        boundaryTolerance: 1.0,
      })
        .filter((path) => isClosedPath(path))
        .map((path) => dedupeSequentialPoints(path).map((pt) => ({ x: pt.x, y: pt.y })))
        .filter((ring) => ring.length >= 3);
      if (!rings.length) return [];
      const fillRule = (resolveInheritedSvgAttribute(el, 'fill-rule') || el.getAttribute?.('fill-rule') || 'nonzero').toLowerCase();
      return fillRule === 'evenodd'
        ? ringsToEvenOddMultiPolygon(rings)
        : ringsToNonZeroMultiPolygon(rings);
    }).filter((multiPolygon) => Array.isArray(multiPolygon) && multiPolygon.length);

    if (!perElement.length) return [];

    const repeated = [];
    perElement.forEach((multiPolygon) => {
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          repeated.push(offsetMultiPolygon(multiPolygon, ox * vbW, oy * vbH));
        }
      }
    });

    const unioned = union(...repeated);
    const clipped = intersection(unioned, rectToMultiPolygon(vbMinX, vbMinY, vbMinX + vbW, vbMinY + vbH));
    if (!clipped.length) return [];
    const clippedPaths = multiPolygonToPaths(clipped, {
      minX: vbMinX,
      minY: vbMinY,
      maxX: vbMinX + vbW,
      maxY: vbMinY + vbH,
      snapTol: Math.max(vbW, vbH) / 1000,
    })
      .filter((path) => Array.isArray(path) && path.length >= 4)
      .map((path) => dedupeSequentialPoints(path))
      .filter((path) => path.length >= 4)
      .flatMap((path) => {
        const normalized = path.map((pt) => ({ x: pt.x, y: pt.y }));
        if (isClosedPath(normalized)) normalized[normalized.length - 1] = { ...normalized[0] };
        return [normalized];
      });
    return clippedPaths;
  };

  const traceFilledElementsVisibleBoundaries = (elements = [], vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0) => {
    return traceFillOnlyPolygonUnionBoundaries(elements, vbMinX, vbMinY, vbW, vbH);
  };

  const traceFilledGroupVisibleBoundaries = (paths = []) => {
    const PathBoolean = window.Vectura?.PathBoolean || {};
    const segmentPathByPolygons = PathBoolean.segmentPathByPolygons;
    if (typeof segmentPathByPolygons !== 'function') return paths;

    const closedPaths = (paths || []).filter((path) => isClosedPath(path));
    const passthrough = (paths || []).filter((path) => !isClosedPath(path)).map((path) => clonePath(path));
    if (closedPaths.length < 2) return paths;

    const outsideChains = [];
    closedPaths.forEach((path, index) => {
      const others = closedPaths.filter((_, otherIndex) => otherIndex !== index);
      const clipped = segmentPathByPolygons(path, others, { closed: false }) || [];
      clipped.forEach((segment) => {
        if (Array.isArray(segment) && segment.length >= 2) outsideChains.push(segment);
      });
    });
    if (!outsideChains.length) return passthrough;

    const withoutSharedEdges = removeSeamSegments(outsideChains);
    const merged = mergeTouchingChains(withoutSharedEdges);
    if (!merged.length) return passthrough;

    const normalized = merged.map((path) => {
      const next = clonePath(path);
      const first = next[0];
      const last = next[next.length - 1];
      if (first && last && Math.hypot(first.x - last.x, first.y - last.y) < 0.01) {
        next[next.length - 1] = { ...first };
      }
      return next;
    });
    return passthrough.concat(normalized);
  };

  // Trace the visible fill boundary of a compound-path SVG element using the browser's
  // isPointInFill oracle. Samples each subpath and keeps segments where fill differs across
  // the segment (i.e., the segment lies on the fill boundary). More accurate than the
  // FillBoolean approach for evenodd compound paths because it uses the same oracle as the
  // source-fidelity tests. Returns null for non-path elements or single-subpath paths
  // (caller falls back to traceFillOnlyPolygonUnionBoundaries).
  const traceFilledPathElementVisibleBoundaries = (el, offsetX = 0, offsetY = 0, vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0) => {
    if (!el || el.tagName?.toLowerCase() !== 'path' || typeof el.isPointInFill !== 'function') return null;
    const d = el.getAttribute('d') || '';
    const subpathStrs = getSubpathStrings(d);
    if (subpathStrs.length < 2) return null;

    const svgContainer = el.parentElement;
    if (!svgContainer) return null;

    const matrix = typeof el.getCTM === 'function' ? el.getCTM() : null;
    const applyMatrix = (pt) => {
      if (!matrix) return pt;
      return { x: pt.x * matrix.a + pt.y * matrix.c + matrix.e, y: pt.x * matrix.b + pt.y * matrix.d + matrix.f };
    };
    const applyOffset = (pt) => ({ x: pt.x - offsetX, y: pt.y - offsetY });
    const normalizePoint = (pt) => applyOffset(applyMatrix(pt));

    const dNodes = parseSvgDNodes(d);
    const dNodesNorm = dNodes.length ? dNodes.map((pt) => normalizePoint(pt)) : [];
    const SNAP_TOL = 1.0;
    const BOUNDARY_TOL = 2.0;
    const maxX = vbMinX + vbW;
    const maxY = vbMinY + vbH;
    const snapNodes = dNodesNorm.filter((n) =>
      Math.abs(n.x - vbMinX) < BOUNDARY_TOL || Math.abs(n.x - maxX) < BOUNDARY_TOL ||
      Math.abs(n.y - vbMinY) < BOUNDARY_TOL || Math.abs(n.y - maxY) < BOUNDARY_TOL
    );
    const snapToNodes = (pt) => {
      for (const n of snapNodes) {
        if (Math.hypot(pt.x - n.x, pt.y - n.y) < SNAP_TOL) return { ...n };
      }
      return pt;
    };

    const epsilon = 0.35;
    const visibleSegments = [];
    const pointForFill = (x, y) =>
      typeof DOMPoint === 'function' ? new DOMPoint(x, y) : { x, y };

    for (const subStr of subpathStrs) {
      const tmpPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      tmpPath.setAttribute('d', subStr);
      svgContainer.appendChild(tmpPath);
      try {
        const len = tmpPath.getTotalLength ? tmpPath.getTotalLength() : 0;
        if (len <= 0) continue;
        const steps = Math.max(24, Math.floor(len / 1.5));
        const rawPts = [];
        for (let i = 0; i <= steps; i += 1) {
          const pt = tmpPath.getPointAtLength((i / steps) * len);
          rawPts.push({ x: pt.x, y: pt.y });
        }
        for (let i = 0; i + 1 < rawPts.length; i += 1) {
          const a = rawPts[i];
          const b = rawPts[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const segLen = Math.hypot(dx, dy);
          if (segLen < 1e-6) continue;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const nx = -dy / segLen;
          const ny = dx / segLen;
          const leftInside = !!el.isPointInFill(pointForFill(mx + nx * epsilon, my + ny * epsilon));
          const rightInside = !!el.isPointInFill(pointForFill(mx - nx * epsilon, my - ny * epsilon));
          if (leftInside === rightInside) continue;

          const aNorm = snapToNodes(normalizePoint(a));
          const bNorm = snapToNodes(normalizePoint(b));
          const segment = [aNorm, bNorm].filter((pt, si, arr) =>
            si === 0 || Math.hypot(pt.x - arr[si - 1].x, pt.y - arr[si - 1].y) > 1e-6
          );
          if (segment.length < 2) continue;
          const EDGE_TOL = 0.15;
          segment.forEach((pt) => {
            if (
              Math.abs(pt.x - vbMinX) < EDGE_TOL || Math.abs(pt.x - maxX) < EDGE_TOL ||
              Math.abs(pt.y - vbMinY) < EDGE_TOL || Math.abs(pt.y - maxY) < EDGE_TOL
            ) pt._tileEdge = true;
          });
          visibleSegments.push(segment);
        }
      } catch (err) {
        console.warn('[Pattern] fill boundary trace:', err);
      }
      tmpPath.remove();
    }

    if (!visibleSegments.length) return null;
    const withoutSharedEdges = removeSeamSegments(visibleSegments);
    const merged = mergeTouchingChains(withoutSharedEdges);
    if (!merged.length) return null;
    return merged.map((path) => {
      const next = clonePath(path);
      const first = next[0];
      const last = next[next.length - 1];
      if (first && last && Math.hypot(first.x - last.x, first.y - last.y) < 0.01)
        next[next.length - 1] = { ...first };
      return next;
    });
  };

  const svgElementToPaths = (el, offsetX = 0, offsetY = 0, vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0, options = {}) => {
    if (!el) return [];
    const tag = el.tagName.toLowerCase();
    const applyMatrix = (pt, matrix) => {
      if (!matrix) return pt;
      return {
        x: pt.x * matrix.a + pt.y * matrix.c + matrix.e,
        y: pt.x * matrix.b + pt.y * matrix.d + matrix.f,
      };
    };
    const applyOffset = (pt) => ({ x: pt.x - offsetX, y: pt.y - offsetY });
    const matrix = typeof el.getCTM === 'function' ? el.getCTM() : null;
    const normalizePoints = (points) =>
      points.map((pt) => applyOffset(applyMatrix({ x: pt.x, y: pt.y }, matrix)));

    if (tag === 'line') {
      const x1 = parseNumber(el.getAttribute('x1'));
      const y1 = parseNumber(el.getAttribute('y1'));
      const x2 = parseNumber(el.getAttribute('x2'));
      const y2 = parseNumber(el.getAttribute('y2'));
      return [normalizePoints([{ x: x1, y: y1 }, { x: x2, y: y2 }])];
    }
    if (tag === 'polyline' || tag === 'polygon') {
      const pointsAttr = el.getAttribute('points') || '';
      const coords = pointsAttr
        .trim()
        .split(/[\s,]+/)
        .map((val) => parseFloat(val))
        .filter((val) => Number.isFinite(val));
      const points = [];
      for (let i = 0; i < coords.length; i += 2) {
        points.push({ x: coords[i], y: coords[i + 1] });
      }
      if (tag === 'polygon' && points.length) points.push({ ...points[0] });
      return points.length ? [normalizePoints(points)] : [];
    }
    if (tag === 'rect') {
      const x = parseNumber(el.getAttribute('x'));
      const y = parseNumber(el.getAttribute('y'));
      const w = parseNumber(el.getAttribute('width'));
      const h = parseNumber(el.getAttribute('height'));
      const points = [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
        { x, y },
      ];
      return [normalizePoints(points)];
    }
    if (tag === 'circle' || tag === 'ellipse') {
      const cx = parseNumber(el.getAttribute('cx'));
      const cy = parseNumber(el.getAttribute('cy'));
      const rx = tag === 'circle' ? parseNumber(el.getAttribute('r')) : parseNumber(el.getAttribute('rx'));
      const ry = tag === 'circle' ? parseNumber(el.getAttribute('r')) : parseNumber(el.getAttribute('ry'));
      const steps = 36;
      const points = [];
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        points.push({ x: cx + rx * Math.cos(theta), y: cy + ry * Math.sin(theta) });
      }
      return [normalizePoints(points)];
    }
    if (tag === 'path') {
      const d = el.getAttribute('d') || '';
      const subpathStrs = getSubpathStrings(d);
      if (!subpathStrs.length) return [];
      const svgContainer = el.parentElement;
      if (!svgContainer) return [];

      const dNodes = parseSvgDNodes(d);
      const dNodesNorm = dNodes.length ? normalizePoints(dNodes) : [];
      const SNAP_TOL = Number.isFinite(options.snapTolerance) ? options.snapTolerance : 1.0;
      const BOUNDARY_TOL = Number.isFinite(options.boundaryTolerance) ? options.boundaryTolerance : 2.0;
      const maxX = vbMinX + vbW;
      const maxY = vbMinY + vbH;
      const snapNodes = dNodesNorm.filter(n =>
        Math.abs(n.x - vbMinX) < BOUNDARY_TOL ||
        Math.abs(n.x - maxX)   < BOUNDARY_TOL ||
        Math.abs(n.y - vbMinY) < BOUNDARY_TOL ||
        Math.abs(n.y - maxY)   < BOUNDARY_TOL
      );
      const snapToNodes = (pt) => {
        for (const n of snapNodes) {
          if (Math.hypot(pt.x - n.x, pt.y - n.y) < SNAP_TOL) return n;
        }
        return pt;
      };

      const allSubPaths = [];
      for (const subStr of subpathStrs) {
        const exactPoints = extractExactLineSubpathPoints(subStr);
        if (exactPoints?.length >= 2) {
          const norm = normalizePoints(exactPoints);
          const snapped = norm.map(snapToNodes);
          const deduped = dedupeSequentialPoints(snapped, 1e-6);
          if (deduped.length >= 2) {
            allSubPaths.push(deduped);
            continue;
          }
        }
        const tmpPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tmpPath.setAttribute('d', subStr);
        svgContainer.appendChild(tmpPath);
        try {
          const len = tmpPath.getTotalLength ? tmpPath.getTotalLength() : 0;
          if (len > 0) {
            const requestedDistance = Number(options.sampleDistance) || 0.35;
            const sampleDistance = Math.max(0.08, Math.min(requestedDistance, len / 24 || requestedDistance));
            const steps = Math.max(24, Math.ceil(len / sampleDistance));
            const rawPts = [];
            for (let i = 0; i <= steps; i++) {
              const pt = tmpPath.getPointAtLength((i / steps) * len);
              rawPts.push({ x: pt.x, y: pt.y });
            }
            if (rawPts.length >= 2) {
              const norm = normalizePoints(rawPts);
              const snapped = norm.map(snapToNodes);
              const deduped = snapped.filter((p, i) =>
                i === 0 || p.x !== snapped[i-1].x || p.y !== snapped[i-1].y
              );
              // Mark points on tile boundaries (used by tileEdgeCurves to keep sharp corners)
              const EDGE_TOL = 0.15;
              for (const p of deduped) {
                if (
                  Math.abs(p.x - vbMinX) < EDGE_TOL || Math.abs(p.x - maxX) < EDGE_TOL ||
                  Math.abs(p.y - vbMinY) < EDGE_TOL || Math.abs(p.y - maxY) < EDGE_TOL
                ) p._tileEdge = true;
              }
              if (deduped.length >= 2) allSubPaths.push(deduped);
            }
          }
        } catch (err) {
          console.warn('[Pattern] path sampling:', err);
        }
        tmpPath.remove();
      }
      return allSubPaths;
    }
    return [];
  };

  const compilePatternMeta = (patternOrId, options = {}) => {
    const meta = getPatternMeta(patternOrId);
    if (!meta || !meta.svg) return null;
    const cacheKey = options.cache === false ? '' : (options.cacheKey || getPatternCacheKey(meta));
    if (cacheKey && svgCache.has(cacheKey)) return svgCache.get(cacheKey);
    if (cacheKey && meta.cachedTile?.groups?.length) {
      const cached = deepClone(meta.cachedTile);
      svgCache.set(cacheKey, cached);
      return cached;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(meta.svg, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;

    const viewBox = svg.getAttribute('viewBox');
    let vbMinX = 0;
    let vbMinY = 0;
    let vbW = parseNumber(svg.getAttribute('width'), 100);
    let vbH = parseNumber(svg.getAttribute('height'), 100);
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map((v) => parseFloat(v));
      if (parts.length >= 4) {
        [vbMinX, vbMinY, vbW, vbH] = parts;
      }
    }

    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (viewBox) tempSvg.setAttribute('viewBox', viewBox);
    if (vbW && vbH) {
      tempSvg.setAttribute('width', vbW);
      tempSvg.setAttribute('height', vbH);
    }
    tempSvg.style.position = 'absolute';
    tempSvg.style.left = '-9999px';
    tempSvg.style.top = '-9999px';
    tempSvg.style.width = '0';
    tempSvg.style.height = '0';
    tempSvg.style.visibility = 'hidden';
    document.body.appendChild(tempSvg);

    const elementsData = [];
    const elements = svg.querySelectorAll('path, line, polyline, polygon, rect, circle, ellipse');
    elements.forEach((el, index) => {
      const clone = el.cloneNode(true);
      ['fill', 'stroke', 'fill-rule', 'stroke-width'].forEach((attr) => {
        if (!clone.hasAttribute(attr)) {
          const inherited = resolveInheritedSvgAttribute(el, attr);
          if (inherited) clone.setAttribute(attr, inherited);
        }
      });
      tempSvg.appendChild(clone);
      
      const stroke = resolveInheritedSvgAttribute(el, 'stroke') || el.style?.stroke || '';
      const fill = resolveInheritedSvgAttribute(el, 'fill') || el.style?.fill || '';
      
      // Determine distinct identifier for this element based on styles to group them logically
      const identifier = `${stroke}|${fill}`;
      const fillVisible = fill && fill !== 'none';
      const strokeVisible = stroke && stroke !== 'none';
      const paths = (fillVisible && !strokeVisible)
        ? []
        : svgElementToPaths(clone, vbMinX, vbMinY, vbMinX, vbMinY, vbW, vbH, {
          sampleDistance: 0.22,
          snapTolerance: 0.18,
          boundaryTolerance: 0.6,
        });
      paths.forEach(p => { p._srcElementIndex = index; });

      elementsData.push({
         index,
         identifier,
         element: clone,
         fillVisible,
         strokeVisible,
         paths
      });
    });

    // Group identical styled elements into logical pens
    const orderedKeys = [];
    const groups = new Map();
    const groupedItems = new Map();
    elementsData.forEach((item) => {
        if (!groups.has(item.identifier)) {
            orderedKeys.push(item.identifier);
            groups.set(item.identifier, []);
            groupedItems.set(item.identifier, []);
        }
        groups.get(item.identifier).push(...item.paths);
        groupedItems.get(item.identifier).push(item);
    });
    
    const parsedGroups = orderedKeys.map((key, i) => {
      const groupPaths = groups.get(key) || [];
      const sourceItems = groupedItems.get(key) || [];
      const isFillOnly = sourceItems.some((item) => item.fillVisible) && sourceItems.every((item) => !item.strokeVisible);
      if (!isFillOnly) return { id: `el-${i}`, label: `Element ${i+1}`, isFillOnly, paths: groupPaths };
      // For fill-only elements, extract raw subpaths then trace visible fill boundaries using
      // PathBoolean (same approach as 222d6a8 which the source-fidelity tests were written against).
      const rawPaths = sourceItems.flatMap((item) =>
        svgElementToPaths(item.element, vbMinX, vbMinY, vbMinX, vbMinY, vbW, vbH, {
          sampleDistance: 0.22, snapTolerance: 0.18, boundaryTolerance: 0.6,
        })
      );
      const ps = traceFilledGroupVisibleBoundaries(rawPaths);
      const firstIndex = sourceItems[0]?.index;
      if (firstIndex !== undefined) ps.forEach((p) => { p._srcElementIndex = firstIndex; });
      return { id: `el-${i}`, label: `Element ${i+1}`, isFillOnly, paths: ps };
    });

    elementsData.forEach((item) => item.element?.remove?.());
    tempSvg.remove();

    const result = { vbW, vbH, groups: parsedGroups };
    if (cacheKey) svgCache.set(cacheKey, result);
    return result;
  };

  const getTargetSvgData = (patternId) => compilePatternMeta(patternId);

  const invalidatePatternCache = (patternId) => {
    if (!patternId) {
      svgCache.clear();
      return;
    }
    Array.from(svgCache.keys()).forEach((key) => {
      if (key === patternId || `${key}`.startsWith(`${patternId}::`)) svgCache.delete(key);
    });
  };

  // expose helper for UI drop-downs
  window.Vectura.AlgorithmRegistry.patternGetGroups = getTargetSvgData;
  window.Vectura.AlgorithmRegistry.patternCompileMeta = compilePatternMeta;
  window.Vectura.AlgorithmRegistry.patternInvalidateCache = invalidatePatternCache;

  // ── Pattern fill helpers ──────────────────────────────────────────────────

  const getFillRegions = (fill = {}) => {
    if (Array.isArray(fill.regions) && fill.regions.length) {
      return fill.regions
        .map((region) => pathToLoop(region, 0.5))
        .filter(Boolean);
    }
    if (Array.isArray(fill.region) && fill.region.length) {
      const single = pathToLoop(fill.region, 0.5);
      return single ? [single] : [];
    }
    return [];
  };

  const compositeContainsPoint = (regions = [], x, y) =>
    regions.reduce((inside, region) => (polyContainsPoint(region, x, y) ? !inside : inside), false);

  const scanLineClipComposite = (regions = [], y) => {
    const xs = [];
    regions.forEach((poly) => {
      const n = poly.length;
      for (let i = 0; i < n; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % n];
        if ((a.y < y) !== (b.y < y)) xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
      }
    });
    xs.sort((a, b) => a - b);
    const pairs = [];
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (xs[i + 1] - xs[i] > 1e-6) pairs.push([xs[i], xs[i + 1]]);
    }
    return pairs;
  };

  const compositeBounds = (regions = []) => {
    const points = regions.flat();
    return {
      minX: Math.min(...points.map((pt) => pt.x)),
      maxX: Math.max(...points.map((pt) => pt.x)),
      minY: Math.min(...points.map((pt) => pt.y)),
      maxY: Math.max(...points.map((pt) => pt.y)),
    };
  };

  const hatchLinesComposite = (regions, density, angleDeg, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar);
    const sa = Math.sin(ar);
    const rotated = regions.map((poly) => poly.map((p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca })));
    const ys = rotated.flat().map((p) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let y = yStart; y <= maxY + 1e-6; y += density) {
      for (const [x0, x1] of scanLineClipComposite(rotated, y)) {
        result.push([
          { x: x0 * ca - y * sa, y: x0 * sa + y * ca },
          { x: x1 * ca - y * sa, y: x1 * sa + y * ca },
        ]);
      }
    }
    return result;
  };

  const waveLinesComposite = (regions, density, angleDeg = 0, amplitude = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotRegions = ar !== 0 ? regions.map(r => r.map(rotatePt)) : regions;
    const bounds = compositeBounds(rotRegions);
    const amp = density * 0.4 * amplitude;
    const wavelength = density * 1.5;
    const stepX = Math.max(0.5, (bounds.maxX - bounds.minX) / 200);
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let cy = yStart; cy <= bounds.maxY + 1e-6; cy += density) {
      const rawPts = [];
      for (let x = bounds.minX; x <= bounds.maxX + stepX; x += stepX) {
        const xc = Math.min(x, bounds.maxX);
        rawPts.push(unrotatePt({ x: xc, y: cy + amp * Math.sin(((xc + rotShiftX) / wavelength) * Math.PI * 2) }));
      }
      for (const seg of clipPolylineToComposite(rawPts, regions)) result.push(seg);
    }
    return result;
  };

  const zigzagLinesComposite = (regions, density, angleDeg = 0, amplitude = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotRegions = ar !== 0 ? regions.map(r => r.map(rotatePt)) : regions;
    const bounds = compositeBounds(rotRegions);
    const amp = density * 0.4 * amplitude;
    const halfPeriod = density * 0.75;
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let cy = yStart; cy <= bounds.maxY + 1e-6; cy += density) {
      let flip = (((Math.floor(-rotShiftX / halfPeriod) % 2) + 2) % 2) !== 0;
      const rawPts = [];
      for (let x = bounds.minX; x <= bounds.maxX + halfPeriod; x += halfPeriod) {
        rawPts.push(unrotatePt({ x: Math.min(x, bounds.maxX), y: cy + (flip ? amp : -amp) }));
        flip = !flip;
      }
      for (const seg of clipPolylineToComposite(rawPts, regions)) result.push(seg);
    }
    return result;
  };

  // ── C1: Unified wave renderer (composite) ─────────────────────────────────
  // Samples a single waveform that interpolates between a triangle wave
  // (smoothing=0) and a sinusoid (smoothing=1).
  const _waveSample = (phase, smoothing) => {
    const TAU = Math.PI * 2;
    const triBase = 4 * Math.abs(phase - Math.floor(phase + 0.5)) - 1;
    const sine = Math.sin(phase * TAU);
    const s = Math.max(0, Math.min(1, smoothing));
    return s * sine + (1 - s) * triBase;
  };

  const waveLinesUnifiedComposite = (regions, density, angleDeg = 0, amplitude = 1.0, smoothing = 1.0, waveFrequency = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotRegions = ar !== 0 ? regions.map(r => r.map(rotatePt)) : regions;
    const bounds = compositeBounds(rotRegions);
    const amp = density * 0.4 * amplitude;
    const wavelength = density * 1.5 / Math.max(0.01, waveFrequency);
    const s = Math.max(0, Math.min(1, smoothing));
    // Zigzag (s≈0): one sample per half-wavelength, aligned to exact peaks/troughs.
    // Sine (s≈1): many samples per wavelength for smooth curves.
    const stepX = s < 0.01
      ? wavelength / 2
      : Math.max(0.25, wavelength / Math.max(4, Math.round(4 + s * 24)));
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    // Align x-start to the nearest half-wavelength boundary so zigzag samples
    // land exactly on triangle-wave peaks and troughs.
    const xStart = s < 0.01
      ? Math.floor((bounds.minX + rotShiftX) / (wavelength / 2)) * (wavelength / 2) - rotShiftX
      : bounds.minX;
    const result = [];
    for (let cy = yStart; cy <= bounds.maxY + 1e-6; cy += density) {
      const rawPts = [];
      for (let x = xStart; x <= bounds.maxX + stepX; x += stepX) {
        const xc = Math.min(x, bounds.maxX);
        const phase = (xc + rotShiftX) / wavelength;
        rawPts.push(unrotatePt({ x: xc, y: cy + amp * _waveSample(phase, s) }));
      }
      for (const seg of clipPolylineToComposite(rawPts, regions)) {
        if (s < 0.01) { if (!seg.meta) seg.meta = {}; seg.meta.straight = true; }
        result.push(seg);
      }
    }
    return result;
  };

  const waveLinesUnified = (poly, density, angleDeg = 0, amplitude = 1.0, smoothing = 1.0, waveFrequency = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotPoly = ar !== 0 ? poly.map(p => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca })) : poly;
    const ys = rotPoly.map(p => p.y), xs = rotPoly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const amp = density * 0.4 * amplitude;
    const wavelength = density * 1.5 / Math.max(0.01, waveFrequency);
    const s = Math.max(0, Math.min(1, smoothing));
    const stepX = s < 0.01
      ? wavelength / 2
      : Math.max(0.25, wavelength / Math.max(4, Math.round(4 + s * 24)));
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((minY - yPhase) / density) * density + yPhase;
    const xStart = s < 0.01
      ? Math.floor((minX + rotShiftX) / (wavelength / 2)) * (wavelength / 2) - rotShiftX
      : minX;
    const result = [];
    for (let cy = yStart; cy <= maxY + 1e-6; cy += density) {
      const rawPts = [];
      for (let x = xStart; x <= maxX + stepX; x += stepX) {
        const xc = Math.min(x, maxX);
        const phase = (xc + rotShiftX) / wavelength;
        rawPts.push(unrotatePt({ x: xc, y: cy + amp * _waveSample(phase, s) }));
      }
      for (const seg of clipPolylineToPoly(rawPts, poly)) {
        if (s < 0.01) { if (!seg.meta) seg.meta = {}; seg.meta.straight = true; }
        result.push(seg);
      }
    }
    return result;
  };

  const stippleDotsComposite = (regions, density, dotSizeRatio = 1.0, shiftX = 0, shiftY = 0, angleDeg = 0, patternType = 'brick') => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt   = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa,  y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa,  y:  p.x * sa + p.y * ca }) : (p) => p;
    const rotRegions = ar !== 0 ? regions.map(r => r.map(rotatePt)) : regions;
    const bounds = compositeBounds(rotRegions);
    const dotR = Math.max(density * 0.005, density * 0.12 * dotSizeRatio);
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const xPhase = ((rotShiftX % density) + density) % density;
    const yPhase  = ((rotShiftY % density) + density) % density;
    const yStart  = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    const result = [];
    let rowOff = false;
    for (let y = yStart; y <= bounds.maxY + 1e-6; y += density) {
      const offset = (patternType === 'brick' && rowOff) ? density / 2 : 0;
      const xStart = Math.ceil((bounds.minX - xPhase) / density) * density + xPhase + offset;
      for (let x = xStart; x <= bounds.maxX + 1e-6; x += density) {
        if (compositeContainsPoint(rotRegions, x, y)) {
          const wp = unrotatePt({ x, y });
          result.push([{ x: wp.x - dotR, y: wp.y }, { x: wp.x + dotR, y: wp.y }]);
        }
      }
      rowOff = !rowOff;
    }
    return result;
  };

  // ── C5: spiral with optional turns / tightness / direction ─────────────────
  // tightness blends Archimedean (r ∝ θ, tightness=0) with log-spiral
  // (r ∝ exp(k·θ), tightness=1); intermediate values lerp between the two.
  // direction='ccw' negates angle progression. turns hard-caps total
  // revolutions so the path stays inside the region's bbox circle.
  const _buildSpiralPts = (cx, cy, density, angleDeg, maxR, turns, tightness, direction) => {
    const angleOffset = angleDeg * Math.PI / 180;
    const t = Math.max(0, Math.min(1, tightness));
    const sign = direction === 'ccw' ? -1 : 1;
    // Archimedean: r = (θ/2π) · density → θ_max for full bbox = (maxR/density)·2π
    // Log-spiral: r = r0 · exp(k·θ), pick k so r doubles every 2π → k = ln2/2π.
    //   choose r0 = density (so first turn radius ≈ density), then
    //   θ_max_log = ln(maxR / r0) / k
    const k = Math.log(2) / (2 * Math.PI);
    const r0 = Math.max(density * 0.5, 0.5);
    const archThetaMax = (maxR / density) * 2 * Math.PI + 2 * Math.PI;
    const logThetaMax = Math.max(1, Math.log(Math.max(maxR / r0, 1.1)) / k);
    // Cap by user-requested turns (if specified).
    const turnsCap = (turns > 0 ? turns * 2 * Math.PI : Infinity);
    const thetaMax = Math.min(turnsCap, (1 - t) * archThetaMax + t * logThetaMax);
    const totalSteps = Math.min(50000, Math.ceil(thetaMax / 0.05));
    const stepAngle = thetaMax / Math.max(1, totalSteps);
    const pts = [];
    for (let i = 0; i <= totalSteps; i++) {
      const theta = i * stepAngle;
      const rArch = (theta / (2 * Math.PI)) * density;
      const rLog = r0 * Math.exp(k * theta);
      const r = (1 - t) * rArch + t * rLog;
      const a = sign * theta + angleOffset;
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    return pts;
  };

  // `boundsRegions` anchors the spiral (center + maxR) and stays fixed across
  // padding changes; `clipRegions` is what we trim the spiral against. Keeping
  // them separate avoids the "padding wobble" where the inset polygon's bbox
  // drifted non-monotonically and dragged the spiral center with it.
  const spiralFillComposite = (boundsRegions, clipRegions, density, angleDeg = 0, shiftX = 0, shiftY = 0, turns = 0, tightness = 0, direction = 'cw') => {
    const bounds = compositeBounds(boundsRegions);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = 0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density;
    const spiralPts = _buildSpiralPts(cx, cy, density, angleDeg, maxR, turns, tightness, direction);
    return clipPolylineToComposite(spiralPts, clipRegions);
  };

  const radialFillComposite = (regions, density, angleDeg = 0, shiftX = 0, shiftY = 0, radialSkip = 0) => {
    const bounds = compositeBounds(regions);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = 0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density;
    // Higher density = more spokes (density is a count driver, not spacing).
    const spokeCount = Math.max(8, Math.round(density * 4));
    const skip = Math.max(0, Math.min(5, Math.round(radialSkip)));
    const angleOffset = angleDeg * Math.PI / 180;
    const result = [];
    for (let i = 0; i < spokeCount; i++) {
      if (skip > 0 && ((i + 1) % (skip + 1)) === 0) continue;
      const angle = (i / spokeCount) * 2 * Math.PI + angleOffset;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const p0 = { x: cx, y: cy };
      const p1 = { x: cx + cosA * maxR, y: cy + sinA * maxR };
      for (const [a, b] of clipSegmentToComposite(p0, p1, regions)) result.push([a, b]);
    }
    return result;
  };

  const gridDotsComposite = (regions, density, angleDeg = 0, dotSizeRatio = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotRegions = ar !== 0 ? regions.map(r => r.map(rotatePt)) : regions;
    const bounds = compositeBounds(rotRegions);
    const dotR = Math.max(0.15, density * 0.12 * dotSizeRatio);
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const xPhase = ((rotShiftX % density) + density) % density;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let y = yStart; y <= bounds.maxY + 1e-6; y += density) {
      const xStart = Math.ceil((bounds.minX - xPhase) / density) * density + xPhase;
      for (let x = xStart; x <= bounds.maxX + 1e-6; x += density) {
        if (compositeContainsPoint(rotRegions, x, y)) {
          const wp = unrotatePt({ x, y });
          result.push([{ x: wp.x - dotR, y: wp.y }, { x: wp.x + dotR, y: wp.y }]);
        }
      }
    }
    return result;
  };

  const meanderLinesComposite = (regions, density, angleDeg = 0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotRegions = ar !== 0 ? regions.map(r => r.map(rotatePt)) : regions;
    const bounds = compositeBounds(rotRegions);
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    const stepX = Math.max(0.5, density * 0.4);
    const result = [];
    let allPts = [];
    let forward = true;
    for (let y = yStart; y <= bounds.maxY + 1e-6; y += density) {
      const rowClips = scanLineClipComposite(rotRegions, y);
      if (rowClips.length === 0) {
        if (allPts.length >= 2) result.push(allPts);
        allPts = [];
        continue;
      }
      const segs = forward ? rowClips : [...rowClips].reverse().map(([a, b]) => [b, a]);
      for (const [x0, x1] of segs) {
        const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
        if (x0 <= x1) {
          for (let x = lo; x <= hi + 1e-6; x += stepX) {
            const pt = { x: Math.min(x, hi), y };
            allPts.push(ar !== 0 ? unrotatePt(pt) : pt);
          }
        } else {
          for (let x = hi; x >= lo - 1e-6; x -= stepX) {
            const pt = { x: Math.max(x, lo), y };
            allPts.push(ar !== 0 ? unrotatePt(pt) : pt);
          }
        }
      }
      forward = !forward;
    }
    if (allPts.length >= 2) result.push(allPts);
    return result;
  };

  const polygonalLinesComposite = (regions, density, angleOffset = 0, shiftX = 0, shiftY = 0, numAxes = 3, tileMethod = 'grid', polyPadding = 0, polyRotation = 0, polyRotationStep = 0, polyScaleStep = 0) => {
    const { minX, maxX, minY, maxY } = compositeBounds(regions);
    const transformsActive = polyPadding > 0 || polyRotation !== 0 || polyRotationStep !== 0 || polyScaleStep !== 0;
    if (transformsActive) {
      // Synthesize a bbox poly for the per-tile generator and clip to all
      // regions via clipSegmentToComposite.
      const bboxPoly = [
        { x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY },
      ];
      return _polyTilesTransformed(bboxPoly, density, angleOffset, shiftX, shiftY, numAxes, tileMethod, polyPadding, polyRotation, polyRotationStep, polyScaleStep, (p0, p1) => clipSegmentToComposite(p0, p1, regions));
    }
    return tessellateEdges(
      minX, maxX, minY, maxY, density, angleOffset, shiftX, shiftY, numAxes, tileMethod,
      (p0, p1) => clipSegmentToComposite(p0, p1, regions)
    );
  };

  const triaxialLinesComposite = (regions, density, angleOffset = 0, shiftX = 0, shiftY = 0) =>
    polygonalLinesComposite(regions, density, angleOffset, shiftX, shiftY, 3);

  // Clip a horizontal scan line at y against a closed polygon → [[x0,x1], ...]
  const scanLineClip = (poly, y) => {
    const xs = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      if ((a.y < y) !== (b.y < y))
        xs.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    xs.sort((a, b) => a - b);
    const pairs = [];
    for (let i = 0; i + 1 < xs.length; i += 2) pairs.push([xs[i], xs[i + 1]]);
    return pairs;
  };

  // Point-in-polygon (ray casting)
  const polyContainsPoint = (poly, px, py) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  };

  // Signed polygon area (positive = CCW)
  const polyArea = (poly) => {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      a += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    return a / 2;
  };

  const normalizeGeneratedLoops = (paths = []) =>
    mergeTouchingChains(paths)
      .filter((path) => Array.isArray(path) && path.length >= 2)
      .map((path) => {
        const next = dedupeSequentialPoints(clonePath(path), 1e-6);
        if (isClosedPath(next)) next[next.length - 1] = { ...next[0] };
        return next;
      });

  const generatedContains = (paths = [], x, y) => {
    let inside = false;
    (paths || []).forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      for (let i = 0; i + 1 < path.length; i += 1) {
        const a = path[i];
        const b = path[i + 1];
        if ((a.y > y) === (b.y > y)) continue;
        const xCross = a.x + ((y - a.y) * (b.x - a.x)) / ((b.y - a.y) || 1e-9);
        if (xCross > x) inside = !inside;
      }
    });
    return inside;
  };

  const pathToLoop = (path = [], closeTolerance = 0.5) => {
    if (!Array.isArray(path) || path.length < 3) return null;
    const next = dedupeSequentialPoints(path.map((pt) => ({ x: pt.x, y: pt.y })));
    if (next.length < 3) return null;
    const first = next[0];
    const last = next[next.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) <= closeTolerance) next.pop();
    return next.length >= 3 ? next : null;
  };

  const loopBounds = (loop = []) => loop.reduce((acc, pt) => ({
    minX: Math.min(acc.minX, pt.x),
    minY: Math.min(acc.minY, pt.y),
    maxX: Math.max(acc.maxX, pt.x),
    maxY: Math.max(acc.maxY, pt.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });

  const findLoopInteriorPoint = (loop = []) => {
    if (!Array.isArray(loop) || loop.length < 3) return null;
    const bounds = loopBounds(loop);
    const width = Math.max(1e-6, bounds.maxX - bounds.minX);
    const height = Math.max(1e-6, bounds.maxY - bounds.minY);
    const candidates = [];
    for (let iy = 1; iy <= 5; iy += 1) {
      for (let ix = 1; ix <= 5; ix += 1) {
        candidates.push({
          x: bounds.minX + (ix / 6) * width,
          y: bounds.minY + (iy / 6) * height,
        });
      }
    }
    const centroid = loop.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
    candidates.unshift({ x: centroid.x / loop.length, y: centroid.y / loop.length });
    return candidates.find((pt) => polyContainsPoint(loop, pt.x, pt.y)) || null;
  };

  const collectCompiledPaths = (data = {}) => {
    const paths = [];
    (data.groups || []).forEach((group, groupIndex) => {
      (group.paths || []).forEach((path, pathIndex) => {
        const cloned = clonePath(path);
        cloned.meta = { ...(cloned.meta || {}), groupIndex, pathIndex };
        paths.push(cloned);
      });
    });
    return paths;
  };

  const compilePatternFillTargetsFromData = (data = {}, options = {}) => {
    const closeTolerance = Math.max(0.1, Number(options.closeTolerance) || 0.5);
    const loops = collectCompiledPaths(data)
      .map((path) => {
        const loop = pathToLoop(path, closeTolerance);
        if (!loop) return null;
        const area = Math.abs(polyArea(loop));
        if (area < 1e-3) return null;
        const sample = findLoopInteriorPoint(loop);
        if (!sample) return null;
        return {
          id: `loop-${path.meta?.groupIndex ?? 0}-${path.meta?.pathIndex ?? 0}`,
          groupIndex: path.meta?.groupIndex ?? 0,
          pathIndex: path.meta?.pathIndex ?? 0,
          loop,
          area,
          sample,
          bounds: loopBounds(loop),
          parentId: null,
          childIds: [],
        };
      })
      .filter(Boolean);

    loops.forEach((loop) => {
      let parent = null;
      loops.forEach((candidate) => {
        if (candidate === loop) return;
        if (candidate.area <= loop.area) return;
        if (!polyContainsPoint(candidate.loop, loop.sample.x, loop.sample.y)) return;
        if (!parent || candidate.area < parent.area) parent = candidate;
      });
      if (parent) {
        loop.parentId = parent.id;
        parent.childIds.push(loop.id);
      }
    });

    const loopById = new Map(loops.map((loop) => [loop.id, loop]));
    const targets = loops.map((loop) => ({
      id: `target-${loop.id}`,
      ownerLoopId: loop.id,
      groupIndex: loop.groupIndex,
      pathIndex: loop.pathIndex,
      depth: (() => {
        let depth = 0;
        let current = loop.parentId ? loopById.get(loop.parentId) : null;
        while (current) {
          depth += 1;
          current = current.parentId ? loopById.get(current.parentId) : null;
        }
        return depth;
      })(),
      area: loop.area,
      outer: loop.loop.map((pt) => ({ ...pt })),
      holes: loop.childIds.map((childId) => loopById.get(childId)?.loop?.map((pt) => ({ ...pt })) || []).filter(Boolean),
      regions: [
        loop.loop.map((pt) => ({ ...pt })),
        ...loop.childIds.map((childId) => loopById.get(childId)?.loop?.map((pt) => ({ ...pt })) || []).filter(Boolean),
      ],
    }));
    const targetByLoopId = new Map(targets.map((target) => [target.ownerLoopId, target]));
    return {
      loops,
      loopById,
      targets,
      targetByLoopId,
    };
  };

  const getFillTargetsAtPoint = (compiledTargets, x, y, options = {}) => {
    if (!compiledTargets?.loops?.length) return { smallest: null, ancestors: [], containingLoops: [] };
    const containingLoops = compiledTargets.loops
      .filter((loop) => polyContainsPoint(loop.loop, x, y))
      .sort((a, b) => a.area - b.area);
    if (!containingLoops.length) return { smallest: null, ancestors: [], containingLoops: [] };
    const smallestLoop = containingLoops[0];
    const ancestors = [];
    let current = smallestLoop;
    while (current) {
      const target = compiledTargets.targetByLoopId.get(current.id);
      if (target) ancestors.push(target);
      current = current.parentId ? compiledTargets.loopById.get(current.parentId) : null;
    }
    return {
      smallest: compiledTargets.targetByLoopId.get(smallestLoop.id) || null,
      ancestors,
      containingLoops,
    };
  };

  const buildSourceFillSampler = (meta) => {
    if (!meta?.svg || typeof DOMParser === 'undefined') return null;
    const parser = new DOMParser();
    const doc = parser.parseFromString(meta.svg, 'image/svg+xml');
    const svg = doc.querySelector('svg');
    if (!svg) return null;
    const viewBox = svg.getAttribute('viewBox');
    let dims = [
      0,
      0,
      parseNumber(svg.getAttribute('width'), 100),
      parseNumber(svg.getAttribute('height'), 100),
    ];
    if (viewBox) {
      const parts = viewBox.split(/[\s,]+/).map(Number);
      if (parts.length >= 4) dims = parts;
    }
    const [minX, minY, width, height] = dims;
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.setAttribute('width', width);
    tempSvg.setAttribute('height', height);
    tempSvg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
    tempSvg.style.position = 'absolute';
    tempSvg.style.left = '-9999px';
    tempSvg.style.top = '-9999px';
    tempSvg.style.visibility = 'hidden';
    tempSvg.innerHTML = svg.innerHTML || '';
    document.body.appendChild(tempSvg);
    const fillElements = [...tempSvg.querySelectorAll('path, polygon, rect, circle, ellipse')].filter((el) => {
      const fill = resolveInheritedSvgAttribute(el, 'fill');
      return fill && fill !== 'none';
    });
    return {
      minX,
      minY,
      width,
      height,
      contains(x, y) {
        const localX = ((((x - minX) % width) + width) % width) + minX;
        const localY = ((((y - minY) % height) + height) % height) + minY;
        const pt = typeof DOMPoint === 'function' ? new DOMPoint(localX, localY) : { x: localX, y: localY };
        return fillElements.some((el) => typeof el.isPointInFill === 'function' && el.isPointInFill(pt));
      },
      cleanup() {
        tempSvg.remove();
      },
    };
  };

  const collectBoundaryCrossings = (paths = [], vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0) => {
    const maxX = vbMinX + vbW;
    const maxY = vbMinY + vbH;
    const edges = { top: [], bottom: [], left: [], right: [] };
    const seen = new Set();
    const pushCrossing = (side, point, tangent, pathIndex, segmentIndex) => {
      const key = `${side}:${pathIndex}:${segmentIndex}:${Math.round(point.x * 1000) / 1000}:${Math.round(point.y * 1000) / 1000}`;
      if (seen.has(key)) return;
      seen.add(key);
      edges[side].push({
        side,
        point,
        tangent,
        pathIndex,
        segmentIndex,
        pos: side === 'top' || side === 'bottom' ? point.x : point.y,
      });
    };
    const registerIntersection = (side, a, b, pathIndex, segmentIndex, point) => {
      pushCrossing(side, point, { x: b.x - a.x, y: b.y - a.y }, pathIndex, segmentIndex);
    };

    (paths || []).forEach((path, pathIndex) => {
      if (!Array.isArray(path) || path.length < 2) return;
      for (let i = 0; i + 1 < path.length; i += 1) {
        const a = path[i];
        const b = path[i + 1];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.abs(dy) > 1e-9) {
          const tTop = (vbMinY - a.y) / dy;
          const tBottom = (maxY - a.y) / dy;
          if (tTop >= 0 && tTop <= 1) {
            const x = a.x + dx * tTop;
            if (x >= vbMinX - 1e-6 && x <= maxX + 1e-6) registerIntersection('top', a, b, pathIndex, i, { x, y: vbMinY });
          }
          if (tBottom >= 0 && tBottom <= 1) {
            const x = a.x + dx * tBottom;
            if (x >= vbMinX - 1e-6 && x <= maxX + 1e-6) registerIntersection('bottom', a, b, pathIndex, i, { x, y: maxY });
          }
        }
        if (Math.abs(dx) > 1e-9) {
          const tLeft = (vbMinX - a.x) / dx;
          const tRight = (maxX - a.x) / dx;
          if (tLeft >= 0 && tLeft <= 1) {
            const y = a.y + dy * tLeft;
            if (y >= vbMinY - 1e-6 && y <= maxY + 1e-6) registerIntersection('left', a, b, pathIndex, i, { x: vbMinX, y });
          }
          if (tRight >= 0 && tRight <= 1) {
            const y = a.y + dy * tRight;
            if (y >= vbMinY - 1e-6 && y <= maxY + 1e-6) registerIntersection('right', a, b, pathIndex, i, { x: maxX, y });
          }
        }
      }
    });
    return edges;
  };

  const pairBoundaryCrossings = (primary = [], secondary = [], tolerance = 0.2) => {
    const remaining = secondary.slice();
    const issues = [];
    primary.forEach((entry) => {
      let bestIndex = -1;
      let bestDistance = Infinity;
      remaining.forEach((candidate, candidateIndex) => {
        const distance = Math.abs(entry.pos - candidate.pos);
        if (distance <= tolerance && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = candidateIndex;
        }
      });
      if (bestIndex === -1) {
        issues.push({
          severity: 'blocker',
          code: 'seam-unmatched',
          side: entry.side,
          message: `${entry.side} seam crossing has no mirrored partner.`,
          points: [entry.point],
        });
        return;
      }
      const match = remaining.splice(bestIndex, 1)[0];
      const magA = Math.hypot(entry.tangent.x, entry.tangent.y) || 1;
      const magB = Math.hypot(match.tangent.x, match.tangent.y) || 1;
      const dot = Math.abs((entry.tangent.x * match.tangent.x + entry.tangent.y * match.tangent.y) / (magA * magB));
      if (dot < 0.95) {
        issues.push({
          severity: 'blocker',
          code: 'seam-tangent-mismatch',
          side: entry.side,
          message: `${entry.side} seam crossing does not continue with a compatible tangent.`,
          points: [entry.point, match.point],
        });
      }
    });
    remaining.forEach((entry) => {
      issues.push({
        severity: 'blocker',
        code: 'seam-unmatched',
        side: entry.side,
        message: `${entry.side} seam crossing has no mirrored partner.`,
        points: [entry.point],
      });
    });
    return issues;
  };

  const collectBoundaryEndpointCandidates = (paths = [], vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0, tolerance = 0) => {
    if (!(tolerance > 0)) return { top: [], bottom: [], left: [], right: [] };
    const maxX = vbMinX + vbW;
    const maxY = vbMinY + vbH;
    const candidates = { top: [], bottom: [], left: [], right: [] };
    paths.forEach((path) => {
      if (!Array.isArray(path) || path.length < 2 || isClosedPath(path)) return;
      ['start', 'end'].forEach((endpoint) => {
        const point = endpoint === 'start' ? path[0] : path[path.length - 1];
        const neighbor = endpoint === 'start' ? path[1] : path[path.length - 2];
        if (!point || !neighbor) return;
        const sideDistances = [
          { side: 'top', distance: Math.abs(point.y - vbMinY), pos: point.x, snap: { x: point.x, y: vbMinY } },
          { side: 'bottom', distance: Math.abs(point.y - maxY), pos: point.x, snap: { x: point.x, y: maxY } },
          { side: 'left', distance: Math.abs(point.x - vbMinX), pos: point.y, snap: { x: vbMinX, y: point.y } },
          { side: 'right', distance: Math.abs(point.x - maxX), pos: point.y, snap: { x: maxX, y: point.y } },
        ].sort((a, b) => a.distance - b.distance);
        const nearest = sideDistances[0];
        if (!nearest || nearest.distance > tolerance) return;
        candidates[nearest.side].push({
          side: nearest.side,
          point: { ...nearest.snap },
          rawPoint: { ...point },
          endpoint,
          tangent: { x: point.x - neighbor.x, y: point.y - neighbor.y },
          pos: nearest.pos,
          groupIndex: path.meta?.groupIndex ?? 0,
          pathIndex: path.meta?.pathIndex ?? 0,
        });
      });
    });
    return candidates;
  };

  const collectGapIssues = (primary = [], secondary = [], tolerance = 0.2, seamTolerance = 0.2) => {
    if (!(tolerance > 0)) return [];
    const remaining = secondary.slice();
    const issues = [];
    primary.forEach((entry) => {
      let bestIndex = -1;
      let bestDistance = Infinity;
      remaining.forEach((candidate, index) => {
        const distance = Math.abs(entry.pos - candidate.pos);
        if (distance > seamTolerance && distance <= tolerance && distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      if (bestIndex === -1) return;
      const match = remaining.splice(bestIndex, 1)[0];
      const averaged = (entry.pos + match.pos) / 2;
      issues.push({
        severity: 'warning',
        code: 'seam-gap',
        kind: 'gap',
        gapDistance: bestDistance,
        side: `${entry.side}-${match.side}`,
        message: `Gap of ${bestDistance.toFixed(2)}px between ${entry.side} and ${match.side} endpoints can be auto-closed.`,
        points: [entry.point, match.point],
        autoFixable: true,
        fixAction: 'auto-close-gap',
        fix: {
          target: 'endpoint-pair',
          axis: entry.side === 'top' || entry.side === 'bottom' ? 'x' : 'y',
          value: averaged,
          endpoints: [
            {
              groupIndex: entry.groupIndex,
              pathIndex: entry.pathIndex,
              endpoint: entry.endpoint,
              side: entry.side,
            },
            {
              groupIndex: match.groupIndex,
              pathIndex: match.pathIndex,
              endpoint: match.endpoint,
              side: match.side,
            },
          ],
        },
      });
    });
    return issues;
  };

  const validateCompiledPattern = (meta, data, options = {}) => {
    if (!meta || !data) return null;
    const paths = normalizeGeneratedLoops(collectCompiledPaths(data));
    const vbMinX = 0;
    const vbMinY = 0;
    const vbW = data.vbW || 0;
    const vbH = data.vbH || 0;
    const seamTolerance = Math.max(vbW, vbH) / 400 || 0.2;
    const gapTolerance = Math.max(0, Number(options.gapTolerance) || 0);
    const issues = [];

    const edges = collectBoundaryCrossings(paths, vbMinX, vbMinY, vbW, vbH);
    issues.push(...pairBoundaryCrossings(edges.top, edges.bottom, seamTolerance));
    issues.push(...pairBoundaryCrossings(edges.left, edges.right, seamTolerance));
    const endpointCandidates = collectBoundaryEndpointCandidates(paths, vbMinX, vbMinY, vbW, vbH, gapTolerance);
    issues.push(...collectGapIssues(endpointCandidates.top, endpointCandidates.bottom, gapTolerance, seamTolerance));
    issues.push(...collectGapIssues(endpointCandidates.left, endpointCandidates.right, gapTolerance, seamTolerance));

    const nearEdgeWarnings = [];
    paths.forEach((path) => {
      path.forEach((point) => {
        const distances = [
          Math.abs(point.x - vbMinX),
          Math.abs(point.x - (vbMinX + vbW)),
          Math.abs(point.y - vbMinY),
          Math.abs(point.y - (vbMinY + vbH)),
        ];
        const minDistance = Math.min(...distances);
        if (minDistance > 1e-6 && minDistance < seamTolerance * 0.5) {
          nearEdgeWarnings.push(point);
        }
      });
    });
    if (nearEdgeWarnings.length) {
      issues.push({
        severity: 'warning',
        code: 'near-edge-geometry',
        message: 'Geometry sits very close to a tile edge and may snap unexpectedly.',
        points: nearEdgeWarnings.slice(0, 8),
      });
    }

    if (meta.fills) {
      const sampler = buildSourceFillSampler(meta);
      if (sampler) {
        let mismatch = 0;
        let total = 0;
        const mismatchPoints = [];
        const cols = 12;
        const rows = 12;
        for (let iy = 0; iy < rows; iy += 1) {
          for (let ix = 0; ix < cols; ix += 1) {
            const x = ((ix + 0.37) / cols) * vbW;
            const y = ((iy + 0.61) / rows) * vbH;
            const sourceValue = sampler.contains(x, y);
            const generatedValue = generatedContains(paths, x, y);
            total += 1;
            if (sourceValue !== generatedValue) {
              mismatch += 1;
              if (mismatchPoints.length < 12) mismatchPoints.push({ x, y });
            }
          }
        }
        [-0.6, -0.2, 0.2, 0.6].forEach((offset) => {
          for (let ix = 0; ix < 16; ix += 1) {
            const x = ((ix + 0.5) / 16) * vbW;
            const topY = vbMinY + offset;
            const leftX = vbMinX + offset;
            total += 2;
            if (sampler.contains(x, topY) !== generatedContains(paths, x, vbMinY + offset)) {
              mismatch += 1;
              if (mismatchPoints.length < 12) mismatchPoints.push({ x, y: vbMinY });
            }
            const y = ((ix + 0.5) / 16) * vbH;
            if (sampler.contains(leftX, y) !== generatedContains(paths, vbMinX + offset, y)) {
              mismatch += 1;
              if (mismatchPoints.length < 12) mismatchPoints.push({ x: vbMinX, y });
            }
          }
        });
        if (mismatch > 0) {
          issues.push({
            severity: 'blocker',
            code: 'fill-source-mismatch',
            message: `Imported outline differs from the source SVG fill silhouette at ${mismatch} sample points.`,
            points: mismatchPoints,
            mismatch,
            total,
          });
        }
        sampler.cleanup();
      }
    }

    const blockers = issues.filter((issue) => issue.severity === 'blocker');
    const warnings = issues.filter((issue) => issue.severity !== 'blocker');
    return {
      valid: blockers.length === 0,
      blockers: blockers.length,
      warnings: warnings.length,
      issues,
      compiled: {
        vbW: data.vbW,
        vbH: data.vbH,
        groups: deepClone(data.groups || []),
      },
    };
  };

  const validatePatternMeta = (patternOrId, options = {}) => {
    const meta = getPatternMeta(patternOrId);
    if (!meta?.svg) return null;
    const data = compilePatternMeta(meta, { cache: options.cache !== false, cacheKey: options.cacheKey });
    if (!data) return null;
    return validateCompiledPattern(meta, data, options);
  };

  // Hatch lines at angleDeg, clipped to polygon
  const hatchLines = (poly, density, angleDeg, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotPoly = poly.map(p => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }));
    const ys = rotPoly.map(p => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let y = yStart; y <= maxY + 1e-6; y += density) {
      for (const [x0, x1] of scanLineClip(rotPoly, y)) {
        if (x1 - x0 < 1e-6) continue;
        result.push([
          { x: x0 * ca - y * sa, y: x0 * sa + y * ca },
          { x: x1 * ca - y * sa, y: x1 * sa + y * ca },
        ]);
      }
    }
    return result;
  };

  // Sinusoidal wave scan lines clipped exactly to the polygon boundary.
  // The full wave is generated across the bounding box and then clipped so that
  // wave peaks/troughs that poke outside a curved region are cut at the precise edge.
  const waveLines = (poly, density, angleDeg = 0, amplitude = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotPoly = ar !== 0 ? poly.map(p => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca })) : poly;
    const ys = rotPoly.map(p => p.y), xs = rotPoly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const amp = density * 0.4 * amplitude;
    const wavelength = density * 1.5;
    const stepX = Math.max(0.5, (maxX - minX) / 200);
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let cy = yStart; cy <= maxY + 1e-6; cy += density) {
      const rawPts = [];
      for (let x = minX; x <= maxX + stepX; x += stepX) {
        const xc = Math.min(x, maxX);
        rawPts.push(unrotatePt({ x: xc, y: cy + amp * Math.sin(((xc + rotShiftX) / wavelength) * Math.PI * 2) }));
      }
      for (const seg of clipPolylineToPoly(rawPts, poly)) result.push(seg);
    }
    return result;
  };

  // Triangle-wave (zigzag) scan lines clipped exactly to the polygon boundary.
  // The full zigzag is generated across the bounding box and then clipped so that
  // peaks/troughs that poke outside a curved region are cut at the precise edge.
  const zigzagLines = (poly, density, angleDeg = 0, amplitude = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotPoly = ar !== 0 ? poly.map(p => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca })) : poly;
    const ys = rotPoly.map(p => p.y), xs = rotPoly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const amp = density * 0.4 * amplitude;
    const halfPeriod = density * 0.75;
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let cy = yStart; cy <= maxY + 1e-6; cy += density) {
      let flip = (((Math.floor(-rotShiftX / halfPeriod) % 2) + 2) % 2) !== 0;
      const rawPts = [];
      for (let x = minX; x <= maxX + halfPeriod; x += halfPeriod) {
        rawPts.push(unrotatePt({ x: Math.min(x, maxX), y: cy + (flip ? amp : -amp) }));
        flip = !flip;
      }
      for (const seg of clipPolylineToPoly(rawPts, poly)) result.push(seg);
    }
    return result;
  };

  // Dot grid (short tick marks at grid intersections)
  const stippleDots = (poly, density, dotSizeRatio = 1.0, shiftX = 0, shiftY = 0, angleDeg = 0, patternType = 'brick') => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt   = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa,  y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa,  y:  p.x * sa + p.y * ca }) : (p) => p;
    const rotPoly = ar !== 0 ? poly.map(rotatePt) : poly;
    const ys = rotPoly.map(p => p.y), xs = rotPoly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const dotR = Math.max(density * 0.005, density * 0.12 * dotSizeRatio);
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const xPhase = ((rotShiftX % density) + density) % density;
    const yPhase  = ((rotShiftY % density) + density) % density;
    const yStart  = Math.ceil((minY - yPhase) / density) * density + yPhase;
    const result = [];
    let rowOff = false;
    for (let y = yStart; y <= maxY + 1e-6; y += density) {
      const offset = (patternType === 'brick' && rowOff) ? density / 2 : 0;
      const xStart = Math.ceil((minX - xPhase) / density) * density + xPhase + offset;
      for (let x = xStart; x <= maxX + 1e-6; x += density) {
        if (polyContainsPoint(rotPoly, x, y)) {
          const wp = unrotatePt({ x, y });
          result.push([{ x: wp.x - dotR, y: wp.y }, { x: wp.x + dotR, y: wp.y }]);
        }
      }
      rowOff = !rowOff;
    }
    return result;
  };

  // Returns the interior intersection of two segments, or null if none.
  const segmentIntersectPt = (a1, a2, b1, b2) => {
    const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
    const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) return null;
    const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
    const u = ((b1.x - a1.x) * dy1 - (b1.y - a1.y) * dx1) / denom;
    if (t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9) {
      return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
    }
    return null;
  };

  // Remove self-intersecting "ears" from a polygon by shortcutting each crossing.
  // Concave inward offsets create ears where non-adjacent edges cross; this clips
  // them by replacing the path between the two crossing edges with the intersection
  // point. Iterates until no crossings remain.
  const removePolygonSelfIntersections = (poly) => {
    let pts = poly.slice();
    let safety = 0;
    let changed = true;
    while (changed && safety++ < 200) {
      changed = false;
      const n = pts.length;
      if (n < 3) return null;
      outer: for (let i = 0; i < n; i++) {
        const a1 = pts[i], a2 = pts[(i + 1) % n];
        for (let j = i + 2; j < n; j++) {
          if (i === 0 && j === n - 1) continue; // share vertex 0
          const b1 = pts[j], b2 = pts[(j + 1) % n];
          const p = segmentIntersectPt(a1, a2, b1, b2);
          if (p) {
            pts = [...pts.slice(0, i + 1), p, ...pts.slice(j + 1)];
            changed = true;
            break outer;
          }
        }
      }
    }
    return pts.length >= 3 ? pts : null;
  };

  // Inset polygon by distance d (miter offset), with self-intersection removal
  // so concave vertices don't produce crossing contour rings.
  const insetPolygon = (poly, d) => {
    const n = poly.length;
    if (n < 3) return null;
    const dir = polyArea(poly) > 0 ? 1 : -1;
    const result = [];
    for (let i = 0; i < n; i++) {
      const prev = poly[(i + n - 1) % n], curr = poly[i], next = poly[(i + 1) % n];
      const e1x = curr.x - prev.x, e1y = curr.y - prev.y;
      const e2x = next.x - curr.x, e2y = next.y - curr.y;
      const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
      const n1x = -e1y / l1 * dir, n1y = e1x / l1 * dir;
      const n2x = -e2y / l2 * dir, n2y = e2x / l2 * dir;
      const bx = (n1x + n2x) / 2, by = (n1y + n2y) / 2;
      const bl = Math.hypot(bx, by) || 1;
      result.push({ x: curr.x + bx * d / bl, y: curr.y + by * d / bl });
    }
    const cleaned = removePolygonSelfIntersections(result);
    if (!cleaned) return null;
    const newArea = polyArea(cleaned);
    if (newArea * polyArea(poly) < 0) return null;
    return cleaned;
  };

  // ── C7: contour helpers ──────────────────────────────────────────────────
  // Douglas-Peucker simplification — recursive iterative variant. tolerance is
  // the perpendicular distance below which intermediate vertices are dropped.
  const _douglasPeucker = (pts, tolerance) => {
    if (!Array.isArray(pts) || pts.length < 3 || tolerance <= 0) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = 1;
    keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    const sqTol = tolerance * tolerance;
    while (stack.length) {
      const [i0, i1] = stack.pop();
      const a = pts[i0], b = pts[i1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let maxD = 0, maxI = -1;
      for (let i = i0 + 1; i < i1; i += 1) {
        const px = pts[i].x - a.x, py = pts[i].y - a.y;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const nx = a.x + t * dx - pts[i].x, ny = a.y + t * dy - pts[i].y;
        const d = nx * nx + ny * ny;
        if (d > maxD) { maxD = d; maxI = i; }
      }
      if (maxD > sqTol && maxI !== -1) {
        keep[maxI] = 1;
        stack.push([i0, maxI]);
        stack.push([maxI, i1]);
      }
    }
    const out = [];
    for (let i = 0; i < pts.length; i += 1) if (keep[i]) out.push(pts[i]);
    return out;
  };

  // Mulberry-32 indexed per-step jitter so spacing variance is deterministic
  // across calls with identical params.
  const _contourStepNoise = (idx, density, variance) => {
    if (variance <= 0) return density;
    let s = ((idx + 1) * 2654435761) >>> 0;
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return density * (1 + variance * (r - 0.5));
  };

  // Concentric inset (or outset) rings of the polygon boundary.
  //
  // density = approximate number of rings from boundary to geometric center;
  // step is auto-calibrated as √(area/π)/density so the ring count is
  // shape-independent (a circle and a rectangle at density=10 both yield ~10
  // rings). Higher density → tighter spacing → more rings.
  //
  // centerPadding (mm): rings stop when the remaining polygon's inscribed
  // radius drops below this value, leaving a clear centre zone. 0 = fill all
  // the way to centre.
  const contourLines = (poly, density, direction = 'inset', stepVariance = 0, simplify = 0, centerPadding = 0) => {
    const result = [];
    let current = poly.slice();
    const sign = direction === 'outset' ? -1 : 1;
    const shapeRadius = Math.sqrt(Math.abs(polyArea(poly)) / Math.PI);
    const step0 = Math.max(0.01, shapeRadius / Math.max(0.01, density));
    // minInradius: half a step keeps the last ring geometrically clean; centerPadding
    // shifts the cutoff outward to leave a deliberate empty zone at centre.
    // inradius = 2·area/perimeter (exact for circles and regular polygons).
    const minInradius = Math.max(step0 * 0.5, centerPadding);
    for (let iter = 0; iter < 500; iter++) {
      const step = _contourStepNoise(iter, step0, stepVariance) * sign;
      // Guard against centre artifacts: stop before the polygon is too small
      // for a clean inset step (inradius = 2·area/perimeter).
      if (sign > 0) {
        const area = Math.abs(polyArea(current));
        const perim = current.reduce((s, pt, i) => {
          const nxt = current[(i + 1) % current.length];
          return s + Math.hypot(nxt.x - pt.x, nxt.y - pt.y);
        }, 0);
        if (perim < 1e-6 || 2 * area / perim < minInradius) break;
      }
      current = insetPolygon(current, step);
      if (!current || current.length < 3) break;
      // outset has no natural inner-area termination; cap rings at 8 for outset
      if (sign < 0 && iter >= 8) break;
      let ring = [...current, current[0]];
      if (simplify > 0) ring = _douglasPeucker(ring, simplify);
      result.push(ring);
    }
    return result;
  };

  // Contour for multi-region: insets the outer ring and segments rings around holes
  const contourLinesComposite = (regions, density, direction = 'inset', stepVariance = 0, simplify = 0, centerPadding = 0) => {
    if (regions.length === 1) return contourLines(regions[0], density, direction, stepVariance, simplify, centerPadding);
    const outer = regions[0];
    const holes = regions.slice(1);
    const result = [];
    let current = outer.slice();
    const sign = direction === 'outset' ? -1 : 1;
    const shapeRadius = Math.sqrt(Math.abs(polyArea(outer)) / Math.PI);
    const step0 = Math.max(0.01, shapeRadius / Math.max(0.01, density));
    const minInradius = Math.max(step0 * 0.5, centerPadding);
    for (let iter = 0; iter < 500; iter++) {
      const step = _contourStepNoise(iter, step0, stepVariance) * sign;
      if (sign > 0) {
        const area = Math.abs(polyArea(current));
        const perim = current.reduce((s, pt, i) => {
          const nxt = current[(i + 1) % current.length];
          return s + Math.hypot(nxt.x - pt.x, nxt.y - pt.y);
        }, 0);
        if (perim < 1e-6 || 2 * area / perim < minInradius) break;
      }
      const next = insetPolygon(current, step);
      if (!next || next.length < 3) break;
      if (sign < 0 && iter >= 8) break;
      if (holes.length === 0) {
        let ring = [...next, next[0]];
        if (simplify > 0) ring = _douglasPeucker(ring, simplify);
        result.push(ring);
      } else {
        const closedRing = [...next, next[0]];
        let seg = null;
        for (const pt of closedRing) {
          if (holes.some((h) => polyContainsPoint(h, pt.x, pt.y))) {
            if (seg && seg.length >= 2) result.push(simplify > 0 ? _douglasPeucker(seg, simplify) : seg);
            seg = null;
          } else {
            if (!seg) seg = [];
            seg.push(pt);
          }
        }
        if (seg && seg.length >= 2) result.push(simplify > 0 ? _douglasPeucker(seg, simplify) : seg);
      }
      current = next;
    }
    return result;
  };

  // See spiralFillComposite — boundsRegion anchors, clipRegion trims.
  const spiralFill = (boundsRegion, clipRegion, density, angleDeg = 0, shiftX = 0, shiftY = 0, turns = 0, tightness = 0, direction = 'cw') => {
    const bounds = loopBounds(boundsRegion);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = 0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density;
    const spiralPts = _buildSpiralPts(cx, cy, density, angleDeg, maxR, turns, tightness, direction);
    return clipPolylineToPoly(spiralPts, clipRegion);
  };

  const radialFill = (region, density, angleDeg = 0, shiftX = 0, shiftY = 0, radialSkip = 0) => {
    const bounds = loopBounds(region);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = 0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density;
    // Higher density = more spokes (density is a count driver, not spacing).
    const spokeCount = Math.max(8, Math.round(density * 4));
    const skip = Math.max(0, Math.min(5, Math.round(radialSkip)));
    const angleOffset = angleDeg * Math.PI / 180;
    const result = [];
    for (let i = 0; i < spokeCount; i++) {
      if (skip > 0 && ((i + 1) % (skip + 1)) === 0) continue;
      const angle = (i / spokeCount) * 2 * Math.PI + angleOffset;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const p0 = { x: cx, y: cy };
      const p1 = { x: cx + cosA * maxR, y: cy + sinA * maxR };
      for (const [a, b] of clipSegmentToPoly(p0, p1, region)) result.push([a, b]);
    }
    return result;
  };

  const gridDots = (region, density, angleDeg = 0, dotSizeRatio = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotRegion = ar !== 0 ? region.map(rotatePt) : region;
    const bounds = loopBounds(rotRegion);
    const dotR = Math.max(0.15, density * 0.12 * dotSizeRatio);
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const xPhase = ((rotShiftX % density) + density) % density;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    const result = [];
    for (let y = yStart; y <= bounds.maxY + 1e-6; y += density) {
      const xStart = Math.ceil((bounds.minX - xPhase) / density) * density + xPhase;
      for (let x = xStart; x <= bounds.maxX + 1e-6; x += density) {
        if (polyContainsPoint(rotRegion, x, y)) {
          const wp = unrotatePt({ x, y });
          result.push([{ x: wp.x - dotR, y: wp.y }, { x: wp.x + dotR, y: wp.y }]);
        }
      }
    }
    return result;
  };

  // ── C2: Unified dots renderer ─────────────────────────────────────────────
  // Combines stipple + grid into a single fill type with:
  //   - pattern: grid | brick | hex | jitter (lattice arrangement)
  //   - shape:   circle | square | cross | tick (per-stamp glyph)
  //   - jitter:  0..1 fraction of cell spacing (applies to all patterns)
  // Returns plain polyline segments; circle stamps are emitted as short
  // horizontal ticks here and (when dotLength > 0) expanded into spirals by
  // expandDotsToSpirals downstream — same contract as stippleDots/gridDots.
  const _mulberry32 = (seed) => {
    let s = (seed >>> 0) || 1;
    return () => {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const _emitDotStamp = (wp, dotR, shape, ca, sa, out, penW = 0.3) => {
    // All stamps use the rotated local frame's basis vectors (ca, sa) — so the
    // glyph orientation follows fill angle + dot rotation. wp is world coords.
    const ex = { x: ca * dotR, y: sa * dotR };       // local +x
    const ey = { x: -sa * dotR, y: ca * dotR };      // local +y
    if (shape === 'circle') {
      // Round dot: a zero-length point renders as a filled disc under round caps.
      out.push([{ x: wp.x, y: wp.y }, { x: wp.x, y: wp.y }]);
    } else if (shape === 'tick') {
      out.push([{ x: wp.x - ex.x, y: wp.y - ex.y }, { x: wp.x + ex.x, y: wp.y + ex.y }]);
    } else if (shape === 'cross') {
      out.push([{ x: wp.x - ex.x, y: wp.y - ex.y }, { x: wp.x + ex.x, y: wp.y + ex.y }]);
      out.push([{ x: wp.x - ey.x, y: wp.y - ey.y }, { x: wp.x + ey.x, y: wp.y + ey.y }]);
    } else if (shape === 'square') {
      const c00 = { x: wp.x - ex.x - ey.x, y: wp.y - ex.y - ey.y };
      const c10 = { x: wp.x + ex.x - ey.x, y: wp.y + ex.y - ey.y };
      const c11 = { x: wp.x + ex.x + ey.x, y: wp.y + ex.y + ey.y };
      const c01 = { x: wp.x - ex.x + ey.x, y: wp.y - ex.y + ey.y };
      out.push([c00, c10]);
      out.push([c10, c11]);
      out.push([c11, c01]);
      out.push([c01, c00]);
    } else if (shape === 'filled-square') {
      // Hatch lines along local-x direction at penW spacing — plotter-safe fill.
      const step = Math.max(penW * 0.9, dotR * 0.15);
      const nLines = Math.max(1, Math.round(2 * dotR / step) + 1);
      for (let i = 0; i < nLines; i++) {
        const t = nLines === 1 ? 0 : (i / (nLines - 1)) * 2 - 1; // -1..+1 in ey direction
        out.push([
          { x: wp.x + t * ey.x - ex.x, y: wp.y + t * ey.y - ex.y },
          { x: wp.x + t * ey.x + ex.x, y: wp.y + t * ey.y + ex.y },
        ]);
      }
    }
  };

  const dotsFill = (poly, density, dotSizeRatio = 1.0, angleDeg = 0, shiftX = 0, shiftY = 0, pattern = 'brick', shape = 'circle', jitter = 0, glyphSize = 0, rotationDeg = 0, penW = 0.3) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    // Glyph orientation = fill angle + dot rotation (grid layout stays on angleDeg)
    const gr = (angleDeg + rotationDeg) * Math.PI / 180;
    const gca = Math.cos(gr), gsa = Math.sin(gr);
    const rotatePt   = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y:  p.x * sa + p.y * ca }) : (p) => p;
    const rotPoly = ar !== 0 ? poly.map(rotatePt) : poly;
    const ys = rotPoly.map(p => p.y), xs = rotPoly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    // glyphSize (mm) sizes the stamp glyph directly when > 0 (Paint Bucket
    // "Dot Size"); otherwise fall back to the density/ratio-derived radius.
    const dotR = glyphSize > 0 ? glyphSize / 2 : Math.max(density * 0.005, density * 0.12 * dotSizeRatio);
    const rotShiftX = shiftX * ca + shiftY * sa;
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const xPhase = ((rotShiftX % density) + density) % density;
    const yPhase = ((rotShiftY % density) + density) % density;
    const j = Math.max(0, Math.min(1, jitter));
    const rng = _mulberry32(0x53D ^ Math.floor(density * 1000) ^ Math.floor(angleDeg * 13));
    const result = [];
    const emit = (x, y) => {
      if (!polyContainsPoint(rotPoly, x, y)) return;
      const wp = unrotatePt({ x, y });
      if (shape === 'circle') {
        _emitDotStamp(wp, dotR, shape, gca, gsa, result, penW);
      } else {
        // Clip non-circle stamps to the polygon so arms don't bleed past the boundary.
        const temp = [];
        _emitDotStamp(wp, dotR, shape, gca, gsa, temp, penW);
        for (const seg of temp) {
          for (const c of clipSegmentToPoly(seg[0], seg[1], poly)) result.push(c);
        }
      }
    };
    if (pattern === 'hex') {
      // Rows alternate; vertical spacing s * sqrt(3)/2.
      const rowH = density * Math.sqrt(3) / 2;
      const yStart = Math.ceil((minY - yPhase) / rowH) * rowH + yPhase;
      let rowIdx = 0;
      for (let y = yStart; y <= maxY + 1e-6; y += rowH) {
        const off = (rowIdx % 2 === 0) ? 0 : density / 2;
        const xStart = Math.ceil((minX - xPhase - off) / density) * density + xPhase + off;
        for (let x = xStart; x <= maxX + 1e-6; x += density) {
          const jx = j ? (rng() - 0.5) * density * j : 0;
          const jy = j ? (rng() - 0.5) * density * j : 0;
          emit(x + jx, y + jy);
        }
        rowIdx++;
      }
    } else {
      const yStart = Math.ceil((minY - yPhase) / density) * density + yPhase;
      let rowOff = false;
      // 'jitter' pattern always perturbs (min 0.5); other patterns scale
      // linearly with the slider. Applied once — no squaring.
      const jAmt = pattern === 'jitter' ? Math.max(j, 0.5) : j;
      for (let y = yStart; y <= maxY + 1e-6; y += density) {
        const off = (pattern === 'brick' && rowOff) ? density / 2 : 0;
        const xStart = Math.ceil((minX - xPhase - off) / density) * density + xPhase + off;
        for (let x = xStart; x <= maxX + 1e-6; x += density) {
          const jx = jAmt ? (rng() - 0.5) * density * jAmt : 0;
          const jy = jAmt ? (rng() - 0.5) * density * jAmt : 0;
          emit(x + jx, y + jy);
        }
        rowOff = !rowOff;
      }
    }
    return result;
  };

  const dotsFillComposite = (regions, density, dotSizeRatio, angleDeg, shiftX, shiftY, pattern, shape, jitter, glyphSize = 0, rotationDeg = 0, penW = 0.3) => {
    if (regions.length === 1) return dotsFill(regions[0], density, dotSizeRatio, angleDeg, shiftX, shiftY, pattern, shape, jitter, glyphSize, rotationDeg, penW);
    const out = [];
    for (const r of regions) out.push(...dotsFill(r, density, dotSizeRatio, angleDeg, shiftX, shiftY, pattern, shape, jitter, glyphSize, rotationDeg, penW));
    return out;
  };

  const meanderLines = (region, density, angleDeg = 0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotRegion = ar !== 0 ? region.map(rotatePt) : region;
    const bounds = loopBounds(rotRegion);
    const rotShiftY = -shiftX * sa + shiftY * ca;
    const yPhase = ((rotShiftY % density) + density) % density;
    const yStart = Math.ceil((bounds.minY - yPhase) / density) * density + yPhase;
    const stepX = Math.max(0.5, density * 0.4);
    const result = [];
    let allPts = [];
    let forward = true;
    for (let y = yStart; y <= bounds.maxY + 1e-6; y += density) {
      const rowClips = scanLineClip(rotRegion, y);
      if (rowClips.length === 0) {
        if (allPts.length >= 2) result.push(allPts);
        allPts = [];
        continue;
      }
      const segs = forward ? rowClips : [...rowClips].reverse().map(([a, b]) => [b, a]);
      for (const [x0, x1] of segs) {
        const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
        if (x0 <= x1) {
          for (let x = lo; x <= hi + 1e-6; x += stepX) {
            const pt = { x: Math.min(x, hi), y };
            allPts.push(ar !== 0 ? unrotatePt(pt) : pt);
          }
        } else {
          for (let x = hi; x >= lo - 1e-6; x -= stepX) {
            const pt = { x: Math.max(x, lo), y };
            allPts.push(ar !== 0 ? unrotatePt(pt) : pt);
          }
        }
      }
      forward = !forward;
    }
    if (allPts.length >= 2) result.push(allPts);
    return result;
  };

  // Clip segment [p0,p1] against a polygon, returning sub-segments that lie inside.
  const clipSegmentToPoly = (p0, p1, poly) => {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const ts = [0, 1];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const a = poly[i], b = poly[(i + 1) % n];
      const ex = b.x - a.x, ey = b.y - a.y;
      const denom = dx * ey - dy * ex;
      if (Math.abs(denom) < 1e-10) continue;
      const t = ((a.x - p0.x) * ey - (a.y - p0.y) * ex) / denom;
      const u = ((a.x - p0.x) * dy - (a.y - p0.y) * dx) / denom;
      if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
    }
    ts.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-9) continue;
      if (polyContainsPoint(poly, p0.x + (t0 + t1) / 2 * dx, p0.y + (t0 + t1) / 2 * dy))
        out.push([{ x: p0.x + t0 * dx, y: p0.y + t0 * dy }, { x: p0.x + t1 * dx, y: p0.y + t1 * dy }]);
    }
    return out;
  };

  const clipSegmentToComposite = (p0, p1, regions) => {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const ts = [0, 1];
    for (const poly of regions) {
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n];
        const ex = b.x - a.x, ey = b.y - a.y;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-10) continue;
        const t = ((a.x - p0.x) * ey - (a.y - p0.y) * ex) / denom;
        const u = ((a.x - p0.x) * dy - (a.y - p0.y) * dx) / denom;
        if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
      }
    }
    ts.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1];
      if (t1 - t0 < 1e-9) continue;
      if (compositeContainsPoint(regions, p0.x + (t0 + t1) / 2 * dx, p0.y + (t0 + t1) / 2 * dy))
        out.push([{ x: p0.x + t0 * dx, y: p0.y + t0 * dy }, { x: p0.x + t1 * dx, y: p0.y + t1 * dy }]);
    }
    return out;
  };

  // Clip a polyline (array of {x,y}) to a polygon, returning clipped sub-polylines.
  // Endpoints land exactly on the polygon boundary — wave/zigzag peaks that poke
  // outside a curved region are clipped at the precise edge intersection.
  const clipPolylineToPoly = (pts, poly) => {
    if (pts.length < 2) return [];
    const result = [];
    let seg = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const clipped = clipSegmentToPoly(pts[i], pts[i + 1], poly);
      if (clipped.length === 0) {
        if (seg && seg.length >= 2) { result.push(seg); seg = null; }
        continue;
      }
      for (const [a, b] of clipped) {
        if (!seg) {
          seg = [a, b];
        } else {
          const last = seg[seg.length - 1];
          if (Math.hypot(a.x - last.x, a.y - last.y) > 1e-4) {
            if (seg.length >= 2) result.push(seg);
            seg = [a, b];
          } else {
            seg.push(b);
          }
        }
      }
    }
    if (seg && seg.length >= 2) result.push(seg);
    return result;
  };

  const clipPolylineToComposite = (pts, regions) => {
    if (pts.length < 2) return [];
    const result = [];
    let seg = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const clipped = clipSegmentToComposite(pts[i], pts[i + 1], regions);
      if (clipped.length === 0) {
        if (seg && seg.length >= 2) { result.push(seg); seg = null; }
        continue;
      }
      for (const [a, b] of clipped) {
        if (!seg) {
          seg = [a, b];
        } else {
          const last = seg[seg.length - 1];
          if (Math.hypot(a.x - last.x, a.y - last.y) > 1e-4) {
            if (seg.length >= 2) result.push(seg);
            seg = [a, b];
          } else {
            seg.push(b);
          }
        }
      }
    }
    if (seg && seg.length >= 2) result.push(seg);
    return result;
  };

  // Generate tessellating polygon cell edges, clipped via clipFn.
  // Grid anchored to world origin; shiftX/shiftY translates the lattice.
  // numAxes=3 → equilateral triangles, numAxes=4 → squares, else → hexagons.
  // Each edge direction is owned by exactly one cell, so no edge is duplicated.
  const tessellateEdges = (minX, maxX, minY, maxY, density, angleOffset, shiftX, shiftY, numAxes, tileMethod, clipFn) => {
    const s = density;
    const ar = angleOffset * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);

    // Compute lattice-space bounding box by inverse-rotating the 4 BB corners
    const toLattice = (wx, wy) => [
      (wx - shiftX) * ca + (wy - shiftY) * sa,
      -(wx - shiftX) * sa + (wy - shiftY) * ca,
    ];
    const c0 = toLattice(minX, minY), c1 = toLattice(maxX, minY);
    const c2 = toLattice(minX, maxY), c3 = toLattice(maxX, maxY);
    const lMinX = Math.min(c0[0], c1[0], c2[0], c3[0]);
    const lMaxX = Math.max(c0[0], c1[0], c2[0], c3[0]);
    const lMinY = Math.min(c0[1], c1[1], c2[1], c3[1]);
    const lMaxY = Math.max(c0[1], c1[1], c2[1], c3[1]);

    // Convert lattice coords to world coords
    const toWorld = (lx, ly) => ({ x: shiftX + lx * ca - ly * sa, y: shiftY + lx * sa + ly * ca });

    const result = [];
    const emit = (lx0, ly0, lx1, ly1) =>
      result.push(...clipFn(toWorld(lx0, ly0), toWorld(lx1, ly1)));

    if (!tileMethod || tileMethod === 'grid') {
      // ── Natural tessellations (default / grid mode) ─────────────────────────
      if (numAxes === 4) {
        // Square lattice: vertices at (q*s, r*s), draw +x and +y edges
        const qMin = Math.floor(lMinX / s) - 1, qMax = Math.ceil(lMaxX / s) + 1;
        const rMin = Math.floor(lMinY / s) - 1, rMax = Math.ceil(lMaxY / s) + 1;
        for (let r = rMin; r <= rMax; r++) {
          for (let q = qMin; q <= qMax; q++) {
            const lx = q * s, ly = r * s;
            emit(lx, ly, lx + s, ly);
            emit(lx, ly, lx, ly + s);
          }
        }
      } else if (numAxes === 3) {
        // Triangular lattice B1=(s,0), B2=(s/2,s√3/2).
        const sqrt3 = Math.sqrt(3);
        const b2x = s / 2, b2y = s * sqrt3 / 2;
        const rMin = Math.floor(lMinY / b2y) - 1, rMax = Math.ceil(lMaxY / b2y) + 1;
        const rAbs = Math.max(Math.abs(rMin), Math.abs(rMax));
        const qMin = Math.floor(lMinX / s) - Math.ceil(rAbs / 2) - 2;
        const qMax = Math.ceil(lMaxX / s) + Math.ceil(rAbs / 2) + 2;
        for (let r = rMin; r <= rMax; r++) {
          for (let q = qMin; q <= qMax; q++) {
            const lx = q * s + r * b2x, ly = r * b2y;
            emit(lx, ly, lx + s, ly);
            emit(lx, ly, lx + b2x, ly + b2y);
            emit(lx, ly, lx + s - b2x, ly - b2y);
          }
        }
      } else if (numAxes === 6) {
        // Hexagonal: pointy-top hex centers at q*hB1 + r*hB2.
        const sqrt3 = Math.sqrt(3);
        const hB1x = s * sqrt3, hB2x = s * sqrt3 / 2, hB2y = s * 1.5;
        const rMinH = Math.floor(lMinY / hB2y) - 1, rMaxH = Math.ceil(lMaxY / hB2y) + 1;
        const rAbsH = Math.max(Math.abs(rMinH), Math.abs(rMaxH));
        const qMinH = Math.floor(lMinX / hB1x) - Math.ceil(rAbsH / 2) - 2;
        const qMaxH = Math.ceil(lMaxX / hB1x) + Math.ceil(rAbsH / 2) + 2;
        for (let r = rMinH; r <= rMaxH; r++) {
          for (let q = qMinH; q <= qMaxH; q++) {
            const cx = q * hB1x + r * hB2x, cy = r * hB2y;
            for (let e = 2; e <= 4; e++) {
              const t0 = (e * 60 + 90) * Math.PI / 180;
              const t1 = ((e + 1) * 60 + 90) * Math.PI / 180;
              emit(cx + s * Math.cos(t0), cy + s * Math.sin(t0), cx + s * Math.cos(t1), cy + s * Math.sin(t1));
            }
          }
        }
      } else {
        // n-gon square grid — gaps exist by design for non-tessellating counts.
        const n = Math.max(3, numAxes);
        const step = 2 * s;
        const qMinN = Math.floor(lMinX / step) - 1, qMaxN = Math.ceil(lMaxX / step) + 1;
        const rMinN = Math.floor(lMinY / step) - 1, rMaxN = Math.ceil(lMaxY / step) + 1;
        for (let r = rMinN; r <= rMaxN; r++) {
          for (let q = qMinN; q <= qMaxN; q++) {
            const cx = q * step, cy = r * step;
            for (let e = 0; e < n; e++) {
              const t0 = 2 * Math.PI * e / n - Math.PI / 2;
              const t1 = 2 * Math.PI * (e + 1) / n - Math.PI / 2;
              emit(cx + s * Math.cos(t0), cy + s * Math.sin(t0),
                   cx + s * Math.cos(t1), cy + s * Math.sin(t1));
            }
          }
        }
      }
    } else {
      // ── Tile-method arrangements: brick / hexagonal / off ────────────────────
      // All polygon types use center-based placement; circumradius = s, step = 2s.
      const n = Math.max(3, numAxes);
      const step = 2 * s;
      const drawNgon = (cx, cy) => {
        for (let e = 0; e < n; e++) {
          const t0 = 2 * Math.PI * e / n - Math.PI / 2;
          const t1 = 2 * Math.PI * (e + 1) / n - Math.PI / 2;
          emit(cx + s * Math.cos(t0), cy + s * Math.sin(t0),
               cx + s * Math.cos(t1), cy + s * Math.sin(t1));
        }
      };
      if (tileMethod === 'off') {
        drawNgon((lMinX + lMaxX) / 2, (lMinY + lMaxY) / 2);
      } else if (tileMethod === 'hexagonal') {
        const rowH = step * Math.sin(Math.PI / 3);
        let rowIdx = 0;
        for (let y = lMinY - step; y <= lMaxY + step; y += rowH) {
          const xOff = (rowIdx % 2) ? step / 2 : 0;
          for (let x = lMinX - step + xOff; x <= lMaxX + step; x += step)
            drawNgon(x, y);
          rowIdx++;
        }
      } else { // brick
        let rowIdx = 0;
        for (let y = lMinY - step; y <= lMaxY + step; y += step) {
          const xOff = (rowIdx % 2) ? step / 2 : 0;
          for (let x = lMinX - step + xOff; x <= lMaxX + step; x += step)
            drawNgon(x, y);
          rowIdx++;
        }
      }
    }
    return result;
  };

  // ── C4: polygonal per-tile transforms ────────────────────────────────────
  // When polyPadding / polyRotation / polyRotationStep / polyScaleStep are
  // non-default, emit each tile as a transformed n-gon polygon (closed path)
  // rather than relying on lattice-edge tessellation. The "ring index" used
  // by rotationStep/scaleStep is the integer chebyshev distance of the tile
  // from the bounding-box center, so the center tile is ring 0 and tiles
  // step outward in concentric square shells.
  const _polyTilesTransformed = (region, density, angleOffset, shiftX, shiftY, numAxes, tileMethod, polyPadding, polyRotation, polyRotationStep, polyScaleStep, clipFn) => {
    const ar = angleOffset * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const s = density;
    const xs = region.map(p => p.x), ys = region.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx0 = (minX + maxX) / 2, cy0 = (minY + maxY) / 2;
    // Lattice→world: rotation by angleOffset around origin, then translate by shift.
    const toWorld = (lx, ly) => ({ x: shiftX + lx * ca - ly * sa, y: shiftY + lx * sa + ly * ca });
    // Inverse: world→lattice for bounding the iteration.
    const toLattice = (wx, wy) => ({ x: (wx - shiftX) * ca + (wy - shiftY) * sa, y: -(wx - shiftX) * sa + (wy - shiftY) * ca });
    const c0 = toLattice(minX, minY), c1 = toLattice(maxX, minY);
    const c2 = toLattice(maxX, maxY), c3 = toLattice(minX, maxY);
    const lMinX = Math.min(c0.x, c1.x, c2.x, c3.x);
    const lMaxX = Math.max(c0.x, c1.x, c2.x, c3.x);
    const lMinY = Math.min(c0.y, c1.y, c2.y, c3.y);
    const lMaxY = Math.max(c0.y, c1.y, c2.y, c3.y);
    const n = Math.max(3, numAxes);
    const step = 2 * s;

    // Build centers in lattice coords per tileMethod.
    const centers = [];
    if (tileMethod === 'off') {
      centers.push({ lx: (lMinX + lMaxX) / 2, ly: (lMinY + lMaxY) / 2 });
    } else if (tileMethod === 'hexagonal') {
      const rowH = step * Math.sin(Math.PI / 3);
      let rowIdx = 0;
      for (let y = lMinY - step; y <= lMaxY + step; y += rowH) {
        const xOff = (rowIdx % 2) ? step / 2 : 0;
        for (let x = lMinX - step + xOff; x <= lMaxX + step; x += step) centers.push({ lx: x, ly: y });
        rowIdx++;
      }
    } else {
      // brick (and 'grid' falls back to centered brick when transforms active)
      let rowIdx = 0;
      for (let y = lMinY - step; y <= lMaxY + step; y += step) {
        const xOff = (tileMethod === 'brick' && rowIdx % 2) ? step / 2 : 0;
        for (let x = lMinX - step + xOff; x <= lMaxX + step; x += step) centers.push({ lx: x, ly: y });
        rowIdx++;
      }
    }

    const result = [];
    const baseRotRad = polyRotation * Math.PI / 180;
    const ringRotPer = polyRotationStep * Math.PI / 180;
    for (const c of centers) {
      const wp = toWorld(c.lx, c.ly);
      // Ring index from bbox center in tile-step units.
      const ringIdx = Math.max(
        Math.round(Math.abs(wp.x - cx0) / step),
        Math.round(Math.abs(wp.y - cy0) / step),
      );
      const scale = Math.max(0.05, 1 + polyScaleStep * ringIdx);
      const rot = baseRotRad + ringRotPer * ringIdx;
      const r = s * scale - polyPadding;
      if (r <= 0) continue;
      // Build n-gon vertices in world coords centered at wp.
      const verts = [];
      for (let e = 0; e < n; e++) {
        const t = 2 * Math.PI * e / n - Math.PI / 2 + rot;
        verts.push({ x: wp.x + r * Math.cos(t), y: wp.y + r * Math.sin(t) });
      }
      // Emit each edge, clipped.
      for (let i = 0; i < n; i++) {
        const a = verts[i], b = verts[(i + 1) % n];
        for (const seg of clipFn(a, b)) result.push(seg);
      }
    }
    return result;
  };

  const polygonalLines = (region, density, angleOffset = 0, shiftX = 0, shiftY = 0, numAxes = 3, tileMethod = 'grid', polyPadding = 0, polyRotation = 0, polyRotationStep = 0, polyScaleStep = 0) => {
    const xs = region.map(p => p.x), ys = region.map(p => p.y);
    const transformsActive = polyPadding > 0 || polyRotation !== 0 || polyRotationStep !== 0 || polyScaleStep !== 0;
    if (transformsActive) {
      return _polyTilesTransformed(region, density, angleOffset, shiftX, shiftY, numAxes, tileMethod, polyPadding, polyRotation, polyRotationStep, polyScaleStep, (p0, p1) => clipSegmentToPoly(p0, p1, region));
    }
    return tessellateEdges(
      Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys),
      density, angleOffset, shiftX, shiftY, numAxes, tileMethod,
      (p0, p1) => clipSegmentToPoly(p0, p1, region)
    );
  };

  const triaxialLines = (region, density, angleOffset = 0, shiftX = 0, shiftY = 0) =>
    polygonalLines(region, density, angleOffset, shiftX, shiftY, 3);

  // Build a single continuous Archimedean spiral path centered at (cx,cy).
  // Loop pitch = penWidth (each full revolution adds penWidth to radius), so
  // when drawn with a stroke of width=penWidth the inner edge of each loop
  // lays on top of the outer edge of the previous one. After reaching outer
  // radius R = dotLength/2, the path closes with a full circle at R — the
  // final loop is fully closed with a touch of overlap on the outer ring.
  const dotSpiralPath = (cx, cy, dotLength, penWidth, rotationDeg = 0) => {
    const R = Math.max(0, dotLength) / 2;
    const pw = Number.isFinite(penWidth) && penWidth > 0 ? penWidth : 0.3;
    if (R <= 1e-6) return null;
    const b = pw / (2 * Math.PI);
    const rotRad = (rotationDeg || 0) * Math.PI / 180;
    const thetaMax = R / b;
    const stepAngle = Math.max(0.04, Math.min(0.25, 0.6 / Math.max(R, 0.5)));
    const pts = [];
    for (let theta = 0; theta <= thetaMax; theta += stepAngle) {
      const r = b * theta;
      const a = theta + rotRad;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    const exitAngle = thetaMax + rotRad;
    pts.push({ x: cx + R * Math.cos(exitAngle), y: cy + R * Math.sin(exitAngle) });
    const circleSteps = Math.max(36, Math.ceil(2 * Math.PI / stepAngle));
    for (let i = 1; i <= circleSteps; i++) {
      const a = exitAngle + (i / circleSteps) * 2 * Math.PI;
      pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    }
    return pts;
  };

  // Replace each tiny dot segment from stippleDots/gridDots with a spiral
  // expansion when dotLength > 0; otherwise pass through unchanged.
  const expandDotsToSpirals = (segments, dotLength, penWidth, rotationDeg) => {
    if (!Number.isFinite(dotLength) || dotLength <= 0) return segments;
    const result = [];
    for (const seg of segments) {
      if (!Array.isArray(seg) || seg.length < 2) continue;
      const a = seg[0], b = seg[seg.length - 1];
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const path = dotSpiralPath(cx, cy, dotLength, penWidth, rotationDeg);
      if (path) result.push(path);
    }
    return result;
  };

  // ─── B-series fill helpers ───────────────────────────────────────────────
  // Shared deterministic 2D hash → value noise. Lattice values are seeded from
  // a fast integer hash so the field is reproducible from (seed, x, y).
  const _hash2 = (ix, iy, seed) => {
    let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (seed | 0) * 2147483647;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  const _hashUnit = (ix, iy, seed) => _hash2(ix, iy, seed) / 4294967296;
  const _smoothstep = (t) => t * t * (3 - 2 * t);
  const _valueNoise2 = (x, y, seed) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const v00 = _hashUnit(ix, iy, seed);
    const v10 = _hashUnit(ix + 1, iy, seed);
    const v01 = _hashUnit(ix, iy + 1, seed);
    const v11 = _hashUnit(ix + 1, iy + 1, seed);
    const sx = _smoothstep(fx), sy = _smoothstep(fy);
    const a = v00 * (1 - sx) + v10 * sx;
    const b = v01 * (1 - sx) + v11 * sx;
    return a * (1 - sy) + b * sy;
  };

  // ── B1: Flow Field ───────────────────────────────────────────────────────
  const _flowVectorAt = (x, y, type, scale, seed, cx, cy) => {
    const s = Math.max(0.5, scale);
    if (type === 'radial') {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      // tangent (perpendicular to radial) → swirls outward
      return { dx: -dy / len, dy: dx / len };
    }
    if (type === 'spiral') {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const radial = { dx: dx / len, dy: dy / len };
      const tang = { dx: -dy / len, dy: dx / len };
      const mix = 0.5;
      return { dx: tang.dx * (1 - mix) + radial.dx * mix, dy: tang.dy * (1 - mix) + radial.dy * mix };
    }
    if (type === 'curl') {
      const e = 0.5;
      const n1 = _valueNoise2((x + e) / s, y / s, seed) - _valueNoise2((x - e) / s, y / s, seed);
      const n2 = _valueNoise2(x / s, (y + e) / s, seed) - _valueNoise2(x / s, (y - e) / s, seed);
      // curl: ∂N/∂y, -∂N/∂x
      const dx = n2, dy = -n1;
      const m = Math.hypot(dx, dy) || 1;
      return { dx: dx / m, dy: dy / m };
    }
    // perlin (value-noise) → angle directly from noise
    const n = _valueNoise2(x / s, y / s, seed);
    const a = n * Math.PI * 2 * 2; // two full rotations across the range
    return { dx: Math.cos(a), dy: Math.sin(a) };
  };

  const _flowFieldFill = (poly, density, flowFieldType, flowNoiseScale, flowSeed, flowTraceLen, flowSeparation) => {
    const bounds = loopBounds(poly);
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    if (bw <= 0 || bh <= 0) return [];
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    // Floor separation so candidate lattice never exceeds ~5000 cells on
    // adversarially large regions.
    const targetCandidates = 5000;
    const minSepForCap = Math.sqrt((bw * bh) / targetCandidates);
    const sep = Math.max(0.5, flowSeparation, minSepForCap);
    const step = Math.max(0.5, sep * 0.5);
    const maxSteps = Math.max(5, Math.min(200, Math.round(flowTraceLen)));
    // candidate seed lattice on rotated-bbox grid at ~sep spacing
    const candidates = [];
    const rng = _mulberry32(flowSeed | 0);
    const cols = Math.max(4, Math.ceil(bw / sep));
    const rows = Math.max(4, Math.ceil(bh / sep));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = bounds.minX + (c + 0.5) * (bw / cols) + (rng() - 0.5) * sep * 0.4;
        const py = bounds.minY + (r + 0.5) * (bh / rows) + (rng() - 0.5) * sep * 0.4;
        if (polyContainsPoint(poly, px, py)) candidates.push({ x: px, y: py });
      }
    }
    // shuffle for varied coverage
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = candidates[i]; candidates[i] = candidates[j]; candidates[j] = t;
    }
    // spatial hash for separation enforcement
    const cellSize = sep;
    const grid = new Map();
    const cellKey = (gx, gy) => `${gx}:${gy}`;
    const tooClose = (x, y) => {
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(cellKey(gx + dx, gy + dy));
        if (!arr) continue;
        for (const p of arr) {
          if ((p.x - x) ** 2 + (p.y - y) ** 2 < sep * sep) return true;
        }
      }
      return false;
    };
    const recordPoint = (x, y) => {
      const gx = Math.floor(x / cellSize);
      const gy = Math.floor(y / cellSize);
      const k = cellKey(gx, gy);
      let arr = grid.get(k);
      if (!arr) { arr = []; grid.set(k, arr); }
      arr.push({ x, y });
    };
    const result = [];
    const ftype = flowFieldType || 'perlin';
    for (const seed of candidates) {
      if (tooClose(seed.x, seed.y)) continue;
      // trace forward and backward; rejection only against OTHER streamlines
      const trace = (sign) => {
        const pts = [];
        let x = seed.x, y = seed.y;
        for (let i = 0; i < maxSteps; i++) {
          if (!polyContainsPoint(poly, x, y)) break;
          if (i > 0 && tooClose(x, y)) break;
          pts.push({ x, y });
          const v = _flowVectorAt(x, y, ftype, flowNoiseScale, flowSeed | 0, cx, cy);
          x += v.dx * step * sign;
          y += v.dy * step * sign;
        }
        return pts;
      };
      const fwd = trace(+1);
      const bwd = trace(-1);
      // splice: bwd reversed (minus shared seed) + fwd
      const path = [...bwd.slice(1).reverse(), ...fwd];
      if (path.length >= 2) {
        // commit this stream's points to the separation grid so subsequent
        // seeds and traces stay clear
        for (const pt of path) recordPoint(pt.x, pt.y);
        for (const seg of clipPolylineToPoly(path, poly)) result.push(seg);
      }
    }
    return result;
  };
  const _flowFieldFillComposite = (regions, density, flowFieldType, flowNoiseScale, flowSeed, flowTraceLen, flowSeparation) => {
    const out = [];
    for (const r of regions) out.push(..._flowFieldFill(r, density, flowFieldType, flowNoiseScale, flowSeed, flowTraceLen, flowSeparation));
    return out;
  };

  // ── B2: Voronoi ──────────────────────────────────────────────────────────
  const _voronoiSeeds = (poly, count, mode, jitter, seedSalt) => {
    const bounds = loopBounds(poly);
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;
    const rng = _mulberry32((seedSalt | 0) + 17);
    const n = Math.max(3, Math.min(500, Math.round(count)));
    const pts = [];
    if (mode === 'square' || mode === 'hexgrid') {
      const cols = Math.max(2, Math.round(Math.sqrt(n * bw / bh)));
      const rows = Math.max(2, Math.round(n / cols));
      const cw = bw / cols, ch = bh / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const offX = (mode === 'hexgrid' && r % 2 === 1) ? cw * 0.5 : 0;
          const px = bounds.minX + (c + 0.5) * cw + offX + (rng() - 0.5) * cw * jitter;
          const py = bounds.minY + (r + 0.5) * ch + (rng() - 0.5) * ch * jitter;
          if (polyContainsPoint(poly, px, py)) pts.push({ x: px, y: py });
        }
      }
    } else {
      // random with Poisson-ish bias when jitter low
      const minDist = jitter < 0.5 ? Math.sqrt((bw * bh) / n) * (1 - jitter) : 0;
      let tries = 0;
      while (pts.length < n && tries < n * 30) {
        tries++;
        const px = bounds.minX + rng() * bw;
        const py = bounds.minY + rng() * bh;
        if (!polyContainsPoint(poly, px, py)) continue;
        if (minDist > 0) {
          let ok = true;
          for (const p of pts) {
            if ((p.x - px) ** 2 + (p.y - py) ** 2 < minDist * minDist) { ok = false; break; }
          }
          if (!ok) continue;
        }
        pts.push({ x: px, y: py });
      }
    }
    return pts;
  };

  const _voronoiFill = (poly, density, voronoiSeeds, voronoiJitter, voronoiStroke, voronoiSeedMode) => {
    const seeds = _voronoiSeeds(poly, voronoiSeeds || 60, voronoiSeedMode || 'random', voronoiJitter ?? 0.5, 1);
    if (seeds.length === 0) return [];
    const bounds = loopBounds(poly);
    // brute-force boundary extraction at ~density-sized grid; floor step so
    // cells × seeds stays bounded on large adversarial regions.
    const rawStep = Math.max(0.6, Math.min(2.0, density * 0.5));
    const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
    const targetCells = 40000;
    const minStepForCap = Math.sqrt((bw * bh) / targetCells);
    const step = Math.max(rawStep, minStepForCap);
    const cols = Math.max(2, Math.ceil(bw / step));
    const rows = Math.max(2, Math.ceil(bh / step));
    if (cols * rows > targetCells * 2) return [];
    const owner = new Int32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const py = bounds.minY + (r + 0.5) * step;
      for (let c = 0; c < cols; c++) {
        const px = bounds.minX + (c + 0.5) * step;
        let best = 0, bd = Infinity;
        for (let i = 0; i < seeds.length; i++) {
          const d = (seeds[i].x - px) ** 2 + (seeds[i].y - py) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
        owner[r * cols + c] = best;
      }
    }
    const result = [];
    if (voronoiStroke === 'centroid-spokes' || voronoiStroke === 'boundary+centroid') {
      // approximate cell centroid = average of pixel centers it owns
      const sumX = new Float64Array(seeds.length);
      const sumY = new Float64Array(seeds.length);
      const cnt = new Int32Array(seeds.length);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = owner[r * cols + c];
        sumX[i] += bounds.minX + (c + 0.5) * step;
        sumY[i] += bounds.minY + (r + 0.5) * step;
        cnt[i]++;
      }
      for (let i = 0; i < seeds.length; i++) {
        if (cnt[i] === 0) continue;
        const cx = sumX[i] / cnt[i], cy = sumY[i] / cnt[i];
        for (const [a, b] of clipSegmentToPoly(seeds[i], { x: cx, y: cy }, poly)) result.push([a, b]);
      }
    }
    if (voronoiStroke === 'concentric') {
      // emit concentric polylines from each seed outward up to nearest neighbor
      for (let i = 0; i < seeds.length; i++) {
        let nearest = Infinity;
        for (let j = 0; j < seeds.length; j++) {
          if (i === j) continue;
          const d = Math.hypot(seeds[i].x - seeds[j].x, seeds[i].y - seeds[j].y);
          if (d < nearest) nearest = d;
        }
        if (!isFinite(nearest)) continue;
        const maxR = nearest * 0.45;
        const rings = Math.max(2, Math.round(maxR / Math.max(0.5, density)));
        for (let k = 1; k <= rings; k++) {
          const rr = (k / rings) * maxR;
          const steps = Math.max(12, Math.round(rr * 4));
          const pts = [];
          for (let s = 0; s <= steps; s++) {
            const a = (s / steps) * Math.PI * 2;
            pts.push({ x: seeds[i].x + Math.cos(a) * rr, y: seeds[i].y + Math.sin(a) * rr });
          }
          for (const seg of clipPolylineToPoly(pts, poly)) result.push(seg);
        }
      }
      return result;
    }
    if (voronoiStroke !== 'centroid-spokes') {
      // boundary edges: scan cell-pair changes and emit short ticks
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols - 1; c++) {
          if (owner[r * cols + c] !== owner[r * cols + c + 1]) {
            const x = bounds.minX + (c + 1) * step;
            const y0 = bounds.minY + r * step;
            const y1 = bounds.minY + (r + 1) * step;
            for (const [a, b] of clipSegmentToPoly({ x, y: y0 }, { x, y: y1 }, poly)) result.push([a, b]);
          }
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
          if (owner[r * cols + c] !== owner[(r + 1) * cols + c]) {
            const y = bounds.minY + (r + 1) * step;
            const x0 = bounds.minX + c * step;
            const x1 = bounds.minX + (c + 1) * step;
            for (const [a, b] of clipSegmentToPoly({ x: x0, y }, { x: x1, y }, poly)) result.push([a, b]);
          }
        }
      }
    }
    return result;
  };
  const _voronoiFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._voronoiFill(r, density, ...args));
    return out;
  };

  // ── B3: Truchet Tiles ────────────────────────────────────────────────────
  const _truchetTilePolys = (set, size) => {
    // returns array of polylines in local [0..size]² coords
    const s = size;
    const half = s / 2;
    if (set === 'diagonals') {
      return [[{ x: 0, y: 0 }, { x: s, y: s }]];
    }
    if (set === 'dots-and-lines') {
      return [
        [{ x: half - s * 0.1, y: half }, { x: half + s * 0.1, y: half }],
        [{ x: half, y: 0 }, { x: half, y: s }],
        [{ x: 0, y: half }, { x: s, y: half }],
      ];
    }
    if (set === 'triangle-split') {
      return [[{ x: 0, y: s }, { x: s, y: 0 }]];
    }
    if (set === 'scribble') {
      // small squiggle from one edge to another
      const pts = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = t * s;
        const y = half + Math.sin(t * Math.PI * 3) * s * 0.25;
        pts.push({ x, y });
      }
      return [pts];
    }
    // quarter-arcs: two quarter circles connecting adjacent corners
    const steps = 12;
    const arc = (cx, cy, r, a0, a1) => {
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (a1 - a0) * (i / steps);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      return pts;
    };
    return [
      arc(0, 0, half, 0, Math.PI / 2),
      arc(s, s, half, Math.PI, 3 * Math.PI / 2),
    ];
  };

  const _truchetFill = (poly, density, truchetTileSet, truchetTileSize, truchetSeed, truchetRotations) => {
    const bounds = loopBounds(poly);
    const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
    // Floor tile size to keep tile count bounded on large adversarial regions.
    const targetTiles = 5000;
    const minSizeForCap = Math.sqrt((bw * bh) / targetTiles);
    const size = Math.max(1, truchetTileSize || 6, minSizeForCap);
    const rng = _mulberry32((truchetSeed | 0) + 31);
    const rotsAllowed = Math.max(1, Math.min(4, Math.round(truchetRotations || 4)));
    const tileLocal = _truchetTilePolys(truchetTileSet || 'quarter-arcs', size);
    const result = [];
    for (let y = bounds.minY; y < bounds.maxY; y += size) {
      for (let x = bounds.minX; x < bounds.maxX; x += size) {
        const cx = x + size / 2, cy = y + size / 2;
        if (!polyContainsPoint(poly, cx, cy)) {
          // edge tile — still check via corner sampling
          if (!polyContainsPoint(poly, x + size * 0.25, y + size * 0.25)
            && !polyContainsPoint(poly, x + size * 0.75, y + size * 0.75)) continue;
        }
        const rot = Math.floor(rng() * rotsAllowed) * (Math.PI / 2);
        const ca = Math.cos(rot), sa = Math.sin(rot);
        for (const localPath of tileLocal) {
          // translate to tile center, rotate around center, then translate to world
          const transformed = localPath.map((p) => {
            const lx = p.x - size / 2, ly = p.y - size / 2;
            return { x: cx + lx * ca - ly * sa, y: cy + lx * sa + ly * ca };
          });
          for (const seg of clipPolylineToPoly(transformed, poly)) result.push(seg);
        }
      }
    }
    return result;
  };
  const _truchetFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._truchetFill(r, density, ...args));
    return out;
  };

  // ── B4: Maze (DFS) ───────────────────────────────────────────────────────
  const _mazeFill = (poly, density, mazeCellSize, mazeAlgorithm, mazeBranchBias, mazeSeed, mazeWallMode) => {
    const bounds = loopBounds(poly);
    const cs = Math.max(1, mazeCellSize || 5);
    const cols = Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / cs));
    const rows = Math.max(2, Math.ceil((bounds.maxY - bounds.minY) / cs));
    // Cap cells to keep perf bounded
    if (cols * rows > 4000) return [];
    const inside = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = bounds.minX + (c + 0.5) * cs;
        const cy = bounds.minY + (r + 0.5) * cs;
        if (polyContainsPoint(poly, cx, cy)) inside[r * cols + c] = 1;
      }
    }
    // walls between neighbours: stored as set of removed walls
    // edge index: horizontal walls h[r][c] (between r-1 and r), vertical v[r][c] (between c-1 and c)
    const visited = new Uint8Array(cols * rows);
    const rng = _mulberry32((mazeSeed | 0) + 53);
    // wall presence: hWalls[(r)*cols + c] = wall between cell (r-1,c) and (r,c) [for r in 1..rows-1]
    const hWalls = new Uint8Array(rows * cols);
    const vWalls = new Uint8Array(rows * cols);
    hWalls.fill(1); vWalls.fill(1);
    // find a starting cell
    let start = -1;
    for (let i = 0; i < cols * rows; i++) if (inside[i]) { start = i; break; }
    if (start < 0) return [];
    const branchBias = Math.max(0, Math.min(1, mazeBranchBias ?? 0.5));
    // Neighbours-of helper used by all carving algorithms.
    const neighboursOf = (idx, requireUnvisited) => {
      const r = Math.floor(idx / cols), c = idx % cols;
      const out = [];
      if (r > 0 && inside[(r - 1) * cols + c] && (!requireUnvisited || !visited[(r - 1) * cols + c])) out.push({ idx: (r - 1) * cols + c, wall: 'h', wr: r, wc: c });
      if (r < rows - 1 && inside[(r + 1) * cols + c] && (!requireUnvisited || !visited[(r + 1) * cols + c])) out.push({ idx: (r + 1) * cols + c, wall: 'h', wr: r + 1, wc: c });
      if (c > 0 && inside[r * cols + c - 1] && (!requireUnvisited || !visited[r * cols + c - 1])) out.push({ idx: r * cols + c - 1, wall: 'v', wr: r, wc: c });
      if (c < cols - 1 && inside[r * cols + c + 1] && (!requireUnvisited || !visited[r * cols + c + 1])) out.push({ idx: r * cols + c + 1, wall: 'v', wr: r, wc: c + 1 });
      return out;
    };
    const carve = (e) => {
      if (e.wall === 'h') hWalls[e.wr * cols + e.wc] = 0;
      else vWalls[e.wr * cols + e.wc] = 0;
    };
    const algo = String(mazeAlgorithm || 'dfs').toLowerCase();
    if (algo === 'prim') {
      // Randomised Prim's: maintain a frontier list of edges adjacent to the
      // carved region; repeatedly pick a random edge and carve through it.
      visited[start] = 1;
      const frontier = neighboursOf(start, true);
      while (frontier.length) {
        const pickIdx = Math.floor(rng() * frontier.length);
        const e = frontier[pickIdx];
        // swap-pop
        frontier[pickIdx] = frontier[frontier.length - 1];
        frontier.pop();
        if (visited[e.idx]) continue;
        carve(e);
        visited[e.idx] = 1;
        const more = neighboursOf(e.idx, true);
        for (const m of more) if (!visited[m.idx]) frontier.push(m);
      }
    } else if (algo === 'wilson') {
      // Wilson's: loop-erased random walk. Pick any unvisited cell, walk
      // randomly until we hit a visited cell, then carve the (loop-erased) path.
      visited[start] = 1;
      const unvisitedList = [];
      for (let i = 0; i < cols * rows; i++) if (inside[i] && !visited[i]) unvisitedList.push(i);
      while (unvisitedList.length) {
        const startWalk = unvisitedList[Math.floor(rng() * unvisitedList.length)];
        if (visited[startWalk]) continue;
        const path = [startWalk];
        const seen = new Map(); seen.set(startWalk, 0);
        let cur = startWalk;
        let safety = cols * rows * 8;
        while (!visited[cur] && safety-- > 0) {
          const nbrs = neighboursOf(cur, false);
          if (!nbrs.length) break;
          const next = nbrs[Math.floor(rng() * nbrs.length)];
          // loop-erase: if we've seen `next.idx` before in path, trim back to it.
          if (seen.has(next.idx)) {
            const cut = seen.get(next.idx);
            for (let k = path.length - 1; k > cut; k--) seen.delete(path[k]);
            path.length = cut + 1;
            cur = next.idx;
            continue;
          }
          path.push(next.idx);
          seen.set(next.idx, path.length - 1);
          cur = next.idx;
        }
        // carve walls along the path
        for (let k = 0; k < path.length - 1; k++) {
          const a = path[k], b = path[k + 1];
          const ar = Math.floor(a / cols), ac = a % cols;
          const br = Math.floor(b / cols), bc = b % cols;
          if (ar === br) {
            const wc = Math.max(ac, bc);
            vWalls[ar * cols + wc] = 0;
          } else {
            const wr = Math.max(ar, br);
            hWalls[wr * cols + ac] = 0;
          }
          visited[a] = 1;
        }
        if (path.length) visited[path[path.length - 1]] = 1;
        // refresh unvisited list lazily by filtering
        for (let i = unvisitedList.length - 1; i >= 0; i--) {
          if (visited[unvisitedList[i]]) {
            unvisitedList[i] = unvisitedList[unvisitedList.length - 1];
            unvisitedList.pop();
          }
        }
      }
    } else if (algo === 'eller') {
      // Sidewinder-style row carving (simpler cousin of Eller's that produces
      // a similarly visually distinct pattern of long horizontal corridors
      // capped by occasional vertical passages northward).
      for (let r = 0; r < rows; r++) {
        let runStart = -1;
        for (let c = 0; c < cols; c++) {
          if (!inside[r * cols + c]) { runStart = -1; continue; }
          visited[r * cols + c] = 1;
          const atEast = c === cols - 1 || !inside[r * cols + c + 1];
          const carveEast = !atEast && rng() < 0.5;
          if (runStart < 0) runStart = c;
          if (carveEast) {
            vWalls[r * cols + c + 1] = 0;
          } else {
            // close the run; carve north from a random cell in [runStart..c] if we can
            if (r > 0) {
              const pick = runStart + Math.floor(rng() * (c - runStart + 1));
              if (inside[(r - 1) * cols + pick]) hWalls[r * cols + pick] = 0;
            }
            runStart = -1;
          }
        }
      }
    } else if (algo === 'recursive-division' || algo === 'division') {
      // Recursive division: start with all walls REMOVED, then divide by adding
      // walls with a single passage. Produces visibly different room structure.
      hWalls.fill(0); vWalls.fill(0);
      // Restore boundary walls between inside and outside cells (so the shape
      // edge still reads correctly).
      const divide = (r0, c0, r1, c1) => {
        const h = r1 - r0, w = c1 - c0;
        if (h < 2 && w < 2) return;
        const horizontal = h > w ? true : (h < w ? false : rng() < 0.5);
        if (horizontal && h >= 2) {
          // pick wall row in (r0..r1-1) and a passage col in [c0..c1-1]
          const wallRow = r0 + 1 + Math.floor(rng() * (h - 1));
          const passCol = c0 + Math.floor(rng() * w);
          for (let c = c0; c < c1; c++) {
            if (c === passCol) continue;
            if (inside[wallRow * cols + c] && inside[(wallRow - 1) * cols + c]) {
              hWalls[wallRow * cols + c] = 1;
            }
          }
          divide(r0, c0, wallRow, c1);
          divide(wallRow, c0, r1, c1);
        } else if (w >= 2) {
          const wallCol = c0 + 1 + Math.floor(rng() * (w - 1));
          const passRow = r0 + Math.floor(rng() * h);
          for (let r = r0; r < r1; r++) {
            if (r === passRow) continue;
            if (inside[r * cols + wallCol] && inside[r * cols + wallCol - 1]) {
              vWalls[r * cols + wallCol] = 1;
            }
          }
          divide(r0, c0, r1, wallCol);
          divide(r0, wallCol, r1, c1);
        }
      };
      divide(0, 0, rows, cols);
      for (let i = 0; i < cols * rows; i++) if (inside[i]) visited[i] = 1;
    } else {
      // DFS (default). Same behaviour as before.
      const stack = [start];
      visited[start] = 1;
      while (stack.length) {
        const idx = stack[stack.length - 1];
        const nbrs = neighboursOf(idx, true);
        if (!nbrs.length) { stack.pop(); continue; }
        // branch bias: lower → more likely to pick first nbr (linear corridors)
        let pick;
        if (rng() < branchBias) pick = nbrs[Math.floor(rng() * nbrs.length)];
        else pick = nbrs[0];
        carve(pick);
        visited[pick.idx] = 1;
        stack.push(pick.idx);
      }
    }
    const result = [];
    // Mode semantics:
    //   walls (default): emit walls between adjacent cells where wall is present
    //   corridors:       emit the inverse — segments where the wall was REMOVED
    //                    (drawn at the wall's location, so the carved passages
    //                    appear as the marks)
    //   path:            connect cell centers across removed walls
    //   both:            walls + path
    const mode = String(mazeWallMode || 'walls').toLowerCase();
    const wantWalls = mode === 'walls' || mode === 'both';
    const wantPath = mode === 'path' || mode === 'both';
    const wantCorridors = mode === 'corridors';
    if (wantWalls) {
      // emit remaining walls between adjacent cells
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!inside[r * cols + c] || !inside[(r - 1) * cols + c]) continue;
          if (hWalls[r * cols + c]) {
            const y = bounds.minY + r * cs;
            const x0 = bounds.minX + c * cs;
            const x1 = bounds.minX + (c + 1) * cs;
            for (const [a, b] of clipSegmentToPoly({ x: x0, y }, { x: x1, y }, poly)) result.push([a, b]);
          }
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 1; c < cols; c++) {
          if (!inside[r * cols + c] || !inside[r * cols + c - 1]) continue;
          if (vWalls[r * cols + c]) {
            const x = bounds.minX + c * cs;
            const y0 = bounds.minY + r * cs;
            const y1 = bounds.minY + (r + 1) * cs;
            for (const [a, b] of clipSegmentToPoly({ x, y: y0 }, { x, y: y1 }, poly)) result.push([a, b]);
          }
        }
      }
    }
    if (wantPath) {
      // path = connect cell centers across removed walls
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!inside[r * cols + c]) continue;
          const cx = bounds.minX + (c + 0.5) * cs, cy = bounds.minY + (r + 0.5) * cs;
          if (r + 1 < rows && inside[(r + 1) * cols + c] && !hWalls[(r + 1) * cols + c]) {
            for (const [a, b] of clipSegmentToPoly({ x: cx, y: cy }, { x: cx, y: cy + cs }, poly)) result.push([a, b]);
          }
          if (c + 1 < cols && inside[r * cols + c + 1] && !vWalls[r * cols + c + 1]) {
            for (const [a, b] of clipSegmentToPoly({ x: cx, y: cy }, { x: cx + cs, y: cy }, poly)) result.push([a, b]);
          }
        }
      }
    }
    if (wantCorridors) {
      // Inverse of 'walls' — draw a segment AT every wall location that was
      // CARVED (i.e. removed). Visually swaps which cell boundaries are inked.
      for (let r = 1; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (!inside[r * cols + c] || !inside[(r - 1) * cols + c]) continue;
          if (!hWalls[r * cols + c]) {
            const y = bounds.minY + r * cs;
            const x0 = bounds.minX + c * cs;
            const x1 = bounds.minX + (c + 1) * cs;
            for (const [a, b] of clipSegmentToPoly({ x: x0, y }, { x: x1, y }, poly)) result.push([a, b]);
          }
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 1; c < cols; c++) {
          if (!inside[r * cols + c] || !inside[r * cols + c - 1]) continue;
          if (!vWalls[r * cols + c]) {
            const x = bounds.minX + c * cs;
            const y0 = bounds.minY + r * cs;
            const y1 = bounds.minY + (r + 1) * cs;
            for (const [a, b] of clipSegmentToPoly({ x, y: y0 }, { x, y: y1 }, poly)) result.push([a, b]);
          }
        }
      }
    }
    return result;
  };
  const _mazeFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._mazeFill(r, density, ...args));
    return out;
  };

  // ── B5: Scribble ─────────────────────────────────────────────────────────
  const _scribbleFill = (poly, density, scribbleSmoothness, scribbleSeed, scribbleCoverage) => {
    const bounds = loopBounds(poly);
    const area = Math.abs(polyArea(poly));
    if (area <= 0) return [];
    const stepLen = Math.max(0.5, density);
    const coverage = Math.max(0.1, Math.min(5, scribbleCoverage || 1));
    const totalLen = (area / stepLen) * coverage;
    const stepCount = Math.min(8000, Math.max(50, Math.round(totalLen / stepLen)));
    const rng = _mulberry32((scribbleSeed | 0) + 71);
    const smoothness = Math.max(0, Math.min(1, scribbleSmoothness ?? 0.6));
    // momentum: higher smoothness → angle changes slowly
    const turnLimit = (1 - smoothness) * Math.PI * 0.6 + 0.05;
    let x = (bounds.minX + bounds.maxX) / 2;
    let y = (bounds.minY + bounds.maxY) / 2;
    let theta = rng() * Math.PI * 2;
    const path = [{ x, y }];
    // simple coarse grid memory for repulsion
    const gridSize = Math.max(1.5, stepLen * 1.5);
    const visited = new Map();
    const visitKey = (px, py) => `${Math.floor(px / gridSize)}:${Math.floor(py / gridSize)}`;
    const recordVisit = (px, py) => {
      const k = visitKey(px, py);
      visited.set(k, (visited.get(k) || 0) + 1);
    };
    const visitCount = (px, py) => visited.get(visitKey(px, py)) || 0;
    recordVisit(x, y);
    for (let i = 0; i < stepCount; i++) {
      // sample 3 candidate angles, pick the one with lowest visit count nearby
      let bestTheta = theta;
      let bestCost = Infinity;
      for (let k = 0; k < 5; k++) {
        const dt = (rng() - 0.5) * 2 * turnLimit;
        const t = theta + dt;
        const nx = x + Math.cos(t) * stepLen;
        const ny = y + Math.sin(t) * stepLen;
        if (!polyContainsPoint(poly, nx, ny)) { continue; }
        const cost = visitCount(nx, ny);
        if (cost < bestCost) { bestCost = cost; bestTheta = t; }
      }
      if (bestCost === Infinity) {
        // bounce: rotate sharply
        theta = theta + Math.PI + (rng() - 0.5) * 0.4;
        continue;
      }
      theta = bestTheta;
      x = x + Math.cos(theta) * stepLen;
      y = y + Math.sin(theta) * stepLen;
      path.push({ x, y });
      recordVisit(x, y);
    }
    return clipPolylineToPoly(path, poly);
  };
  const _scribbleFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._scribbleFill(r, density, ...args));
    return out;
  };

  // ── B6: L-System ─────────────────────────────────────────────────────────
  const _LSYSTEM_PRESETS = {
    coral:     { axiom: 'F', rules: { F: 'F[+F]F[-F]F' }, angle: 25, lenFactor: 0.5 },
    lichen:    { axiom: 'F', rules: { F: 'F[+F][-F][++F][--F]' }, angle: 35, lenFactor: 0.45 },
    plant:     { axiom: 'X', rules: { X: 'F[+X][-X]FX', F: 'FF' }, angle: 25, lenFactor: 0.5 },
    dendritic: { axiom: 'F', rules: { F: 'F[+F]F[-F][F]' }, angle: 22, lenFactor: 0.5 },
    algae:     { axiom: 'A', rules: { A: 'AB', B: 'A' }, angle: 30, lenFactor: 0.6 },
  };
  const _lsystemFill = (poly, density, lsysPreset, lsysIterations, lsysAngleVariance, lsysSeed, lsysScale) => {
    const preset = _LSYSTEM_PRESETS[lsysPreset] || _LSYSTEM_PRESETS.coral;
    const iters = Math.max(1, Math.min(6, Math.round(lsysIterations || 4)));
    // expand string
    let s = preset.axiom;
    for (let i = 0; i < iters; i++) {
      let next = '';
      for (const ch of s) next += (preset.rules[ch] != null ? preset.rules[ch] : ch);
      s = next;
      if (s.length > 20000) break;
    }
    // turtle
    const bounds = loopBounds(poly);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const baseLen = Math.max(0.3, Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / Math.pow(2, iters - 1)) * (lsysScale || 1);
    const rng = _mulberry32((lsysSeed | 0) + 97);
    const angVarRad = (lsysAngleVariance || 0) * Math.PI / 180;
    const baseAng = preset.angle * Math.PI / 180;
    let x = cx, y = cy, theta = -Math.PI / 2; // pointing up
    const stack = [];
    const segs = [];
    let cur = [{ x, y }];
    for (const ch of s) {
      if (ch === 'F' || ch === 'A' || ch === 'B') {
        const nx = x + Math.cos(theta) * baseLen;
        const ny = y + Math.sin(theta) * baseLen;
        cur.push({ x: nx, y: ny });
        x = nx; y = ny;
      } else if (ch === '+') {
        theta += baseAng + (rng() - 0.5) * angVarRad * 2;
      } else if (ch === '-') {
        theta -= baseAng + (rng() - 0.5) * angVarRad * 2;
      } else if (ch === '[') {
        stack.push({ x, y, theta });
        if (cur.length >= 2) segs.push(cur);
        cur = [{ x, y }];
      } else if (ch === ']') {
        if (cur.length >= 2) segs.push(cur);
        const st = stack.pop();
        if (st) { x = st.x; y = st.y; theta = st.theta; }
        cur = [{ x, y }];
      }
    }
    if (cur.length >= 2) segs.push(cur);
    const result = [];
    for (const seg of segs) {
      for (const clipped of clipPolylineToPoly(seg, poly)) result.push(clipped);
    }
    return result;
  };
  const _lsystemFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._lsystemFill(r, density, ...args));
    return out;
  };

  // ── B7: Halftone ─────────────────────────────────────────────────────────
  const _halftoneFill = (poly, density, halftoneSource, halftoneMinR, halftoneMaxR, halftoneFrequency, halftoneAngle, halftoneInvert) => {
    const bounds = loopBounds(poly);
    const minR = Math.max(0.05, halftoneMinR ?? 0.2);
    const maxR = Math.max(minR + 0.01, halftoneMaxR ?? 1.5);
    const freq = Math.max(0.1, halftoneFrequency ?? 5);
    const ang = (halftoneAngle || 0) * Math.PI / 180;
    const cax = Math.cos(ang), sax = Math.sin(ang);
    const invert = halftoneInvert === 'on';
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const maxDim = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
    const sourceFn = (x, y) => {
      let t;
      if (halftoneSource === 'linear') {
        const dx = x - cx, dy = y - cy;
        const proj = dx * cax + dy * sax;
        t = 0.5 + proj / (maxDim || 1);
      } else if (halftoneSource === 'noise') {
        t = _valueNoise2(x / freq, y / freq, 1);
      } else if (halftoneSource === 'distance-to-edge') {
        // approximate: distance to polygon edge / half-diag
        let dmin = Infinity;
        const n = poly.length;
        for (let i = 0; i + 1 < n; i++) {
          const a = poly[i], b = poly[i + 1];
          const ex = b.x - a.x, ey = b.y - a.y;
          const tt = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / (ex * ex + ey * ey || 1)));
          const px = a.x + tt * ex, py = a.y + tt * ey;
          const d = Math.hypot(x - px, y - py);
          if (d < dmin) dmin = d;
        }
        t = Math.min(1, dmin / (maxDim * 0.5));
      } else {
        // radial: t increases outward
        const dx = x - cx, dy = y - cy;
        t = Math.min(1, Math.hypot(dx, dy) / (maxDim * 0.5));
      }
      if (invert) t = 1 - t;
      return Math.max(0, Math.min(1, t));
    };
    // Cap cell count to keep perf bounded on large regions × tiny density.
    const rawStep = Math.max(0.5, density);
    const bw = bounds.maxX - bounds.minX, bh = bounds.maxY - bounds.minY;
    const targetCells = 40000;
    const minStepForCap = Math.sqrt((bw * bh) / targetCells);
    const step = Math.max(rawStep, minStepForCap);
    const result = [];
    for (let y = bounds.minY; y < bounds.maxY; y += step) {
      for (let x = bounds.minX; x < bounds.maxX; x += step) {
        if (!polyContainsPoint(poly, x, y)) continue;
        const t = sourceFn(x, y);
        const r = minR + t * (maxR - minR);
        if (r < 0.05) continue;
        // emit tick mark of length 2r horizontally (rotate by halftoneAngle)
        const dx = cax * r, dy = sax * r;
        result.push([{ x: x - dx, y: y - dy }, { x: x + dx, y: y + dy }]);
      }
    }
    return result;
  };
  const _halftoneFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._halftoneFill(r, density, ...args));
    return out;
  };

  // ── B8: Stripes ──────────────────────────────────────────────────────────
  const _stripesFill = (fill, region, regions, density) => {
    const stripeBandWidth = Math.max(0.5, fill.stripeBandWidth ?? 4);
    const stripeGap = Math.max(0, fill.stripeGap ?? 2);
    const stripeAngle = fill.stripeAngle ?? 0;
    let stripePrimary = fill.stripePrimary || 'hatch';
    if (stripePrimary === 'stripes' || stripePrimary === 'none') stripePrimary = 'hatch';
    let stripeSecondary = fill.stripeSecondary || 'none';
    if (stripeSecondary === 'stripes') stripeSecondary = 'none';
    const stripeSecondaryDensity = fill.stripeSecondaryDensity ?? 2;

    const ar = stripeAngle * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotPoly = region.map((p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }));
    const ys = rotPoly.map((p) => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const xs = rotPoly.map((p) => p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const result = [];
    const period = stripeBandWidth + stripeGap;
    if (period <= 0) return [];
    // For each band slab, clip to region by intersecting with horizontal slab
    // in rotated space and unrotating back.
    const unrot = (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca });
    const makeSlab = (y0, y1) => [
      unrot({ x: minX - 1, y: y0 }),
      unrot({ x: maxX + 1, y: y0 }),
      unrot({ x: maxX + 1, y: y1 }),
      unrot({ x: minX - 1, y: y1 }),
      unrot({ x: minX - 1, y: y0 }),
    ];
    const callSub = (subFillType, slabRegion, dens) => {
      const sub = {
        ...fill,
        fillType: subFillType,
        density: dens,
        region: slabRegion,
        regions: [slabRegion],
        padding: 0,
      };
      // Re-enter dispatcher — guarded against recursion since stripePrimary/secondary
      // cannot be 'stripes' (filtered above)
      const segs = generatePatternFillPaths(sub);
      // The slab spans the region's full bounding-box width, so the sub-fill
      // is only band-limited — it still leaks past a non-rectangular parent.
      // Clip each band segment back to the actual region to mask the fill.
      const clipped = [];
      for (const seg of segs) {
        for (const piece of clipPolylineToPoly(seg, region)) {
          if (seg.meta) piece.meta = { ...seg.meta };
          clipped.push(piece);
        }
      }
      return clipped;
    };
    for (let y = minY; y < maxY; y += period) {
      const primSlab = makeSlab(y, y + stripeBandWidth);
      for (const seg of callSub(stripePrimary, primSlab, density)) result.push(seg);
      if (stripeSecondary !== 'none' && stripeGap > 0) {
        const secSlab = makeSlab(y + stripeBandWidth, y + period);
        const secDens = density * Math.max(0.1, stripeSecondaryDensity);
        for (const seg of callSub(stripeSecondary, secSlab, secDens)) result.push(seg);
      }
    }
    return result;
  };

  // ── B9: Spirograph ───────────────────────────────────────────────────────
  const _spirographFill = (poly, density, spiroRatioA, spiroRatioB, spiroPhase, spiroTurns, spiroDeformation) => {
    const A = Math.max(0.5, spiroRatioA ?? 5);
    const B = Math.max(0.5, spiroRatioB ?? 3);
    const phase = (spiroPhase || 0) * Math.PI / 180;
    const turns = Math.max(1, Math.min(200, Math.round(spiroTurns || 50)));
    const def = Math.max(0, Math.min(1, spiroDeformation || 0));
    const bounds = loopBounds(poly);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const halfSize = Math.min(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 2;
    if (halfSize <= 0) return [];
    // Lissajous (def=0): x = sin(A*t+phase), y = sin(B*t)
    // Hypotrochoid (def=1): x = (A-B)cos(t) + B*cos(((A-B)/B)*t + phase)
    // Cap samples to keep perf bounded at high turn counts (max 200 turns → 40k samples uncapped).
    const sampleCount = Math.min(8000, turns * 200);
    const pts = [];
    const tMax = turns * Math.PI * 2;
    let maxLissAmp = 1; // sin in [-1, 1]
    let maxHypoAmp = A; // approx
    for (let i = 0; i <= sampleCount; i++) {
      const t = (i / sampleCount) * tMax;
      // Lissajous
      const lx = Math.sin(A * t + phase);
      const ly = Math.sin(B * t);
      // Hypotrochoid
      const hx = ((A - B) * Math.cos(t) + B * Math.cos(((A - B) / B) * t + phase));
      const hy = ((A - B) * Math.sin(t) - B * Math.sin(((A - B) / B) * t + phase));
      const nx = lx * (1 - def) / maxLissAmp + hx * def / maxHypoAmp;
      const ny = ly * (1 - def) / maxLissAmp + hy * def / maxHypoAmp;
      pts.push({ x: cx + nx * halfSize * 0.95, y: cy + ny * halfSize * 0.95 });
    }
    return clipPolylineToPoly(pts, poly);
  };
  const _spirographFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._spirographFill(r, density, ...args));
    return out;
  };

  // ── B10: Weave ───────────────────────────────────────────────────────────
  const _weaveOverUnder = (warpIdx, weftIdx, pattern, weaveOver, weaveUnder) => {
    // returns true if warp goes OVER at this crossing (weft goes under)
    // NOTE: 'twill', 'basket', and 'satin' embed a minimum group size so the
    // patterns differentiate visually at the default weaveOver = weaveUnder = 1
    // (without this, all three collapse to plain). When the user raises Over or
    // Under, the group multiplies accordingly.
    const over = Math.max(1, weaveOver || 1);
    const under = Math.max(1, weaveUnder || 1);
    if (pattern === 'plain') return (warpIdx + weftIdx) % 2 === 0;
    if (pattern === 'twill') {
      // diagonal twill: shift step is `over`, repeat period is over+under,
      // and the minimum repeat is 3 so the diagonal is visible at o=u=1.
      const period = Math.max(3, over + under);
      return ((warpIdx + weftIdx) % period) < Math.max(1, over);
    }
    if (pattern === 'basket') {
      // 2x2-grouped over/under at default o=u=1; multiplies up with knobs.
      const gw = Math.max(2, over * 2);
      const gh = Math.max(2, under * 2);
      return (Math.floor(warpIdx / gw) + Math.floor(weftIdx / gh)) % 2 === 0;
    }
    if (pattern === 'satin') {
      // 5-harness satin by default: warp floats over `over` per `over+under`
      // repeat, with 2-step weft offset to stagger floats.
      const period = Math.max(5, over + under);
      return ((warpIdx + 2 * weftIdx) % period) < Math.max(1, over);
    }
    return (warpIdx + weftIdx) % 2 === 0;
  };
  const _weaveFill = (poly, density, weavePattern, weaveStrandWidth, weaveGap, weaveAngle, weaveOver, weaveUnder) => {
    const width = Math.max(0.3, weaveStrandWidth || 1.5);
    const gap = Math.max(0, weaveGap || 0);
    const ang = (weaveAngle || 0) * Math.PI / 180;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const rotPoly = poly.map((p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }));
    const unrot = (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca });
    const xs = rotPoly.map((p) => p.x), ys = rotPoly.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const period = width + gap;
    if (period <= 0) return [];
    // collect warp (vertical) and weft (horizontal) center positions in rotated frame
    const warpsX = [];
    for (let x = minX; x <= maxX; x += period) warpsX.push(x);
    const weftsY = [];
    for (let y = minY; y <= maxY; y += period) weftsY.push(y);
    const result = [];
    const cutLen = width + gap;
    // warps: vertical lines, but cut at crossings where warp is under
    for (let i = 0; i < warpsX.length; i++) {
      const x = warpsX[i];
      // build sub-segments between crossings
      let segStart = minY;
      const stops = [];
      for (let j = 0; j < weftsY.length; j++) {
        const y = weftsY[j];
        const warpOver = _weaveOverUnder(i, j, weavePattern, weaveOver, weaveUnder);
        if (!warpOver) {
          // cut a gap centered on y
          stops.push([y - cutLen * 0.5, y + cutLen * 0.5]);
        }
      }
      let cursor = segStart;
      for (const [a, b] of stops) {
        if (a > cursor) {
          const p0 = unrot({ x, y: cursor });
          const p1 = unrot({ x, y: a });
          for (const seg of clipSegmentToPoly(p0, p1, poly)) result.push(seg);
        }
        cursor = Math.max(cursor, b);
      }
      if (cursor < maxY) {
        const p0 = unrot({ x, y: cursor });
        const p1 = unrot({ x, y: maxY });
        for (const seg of clipSegmentToPoly(p0, p1, poly)) result.push(seg);
      }
    }
    // wefts: horizontal lines, cut where weft is under
    for (let j = 0; j < weftsY.length; j++) {
      const y = weftsY[j];
      let cursor = minX;
      const stops = [];
      for (let i = 0; i < warpsX.length; i++) {
        const x = warpsX[i];
        const warpOver = _weaveOverUnder(i, j, weavePattern, weaveOver, weaveUnder);
        if (warpOver) {
          stops.push([x - cutLen * 0.5, x + cutLen * 0.5]);
        }
      }
      for (const [a, b] of stops) {
        if (a > cursor) {
          const p0 = unrot({ x: cursor, y });
          const p1 = unrot({ x: a, y });
          for (const seg of clipSegmentToPoly(p0, p1, poly)) result.push(seg);
        }
        cursor = Math.max(cursor, b);
      }
      if (cursor < maxX) {
        const p0 = unrot({ x: cursor, y });
        const p1 = unrot({ x: maxX, y });
        for (const seg of clipSegmentToPoly(p0, p1, poly)) result.push(seg);
      }
    }
    return result;
  };
  const _weaveFillComposite = (regions, density, ...args) => {
    const out = [];
    for (const r of regions) out.push(..._weaveFill(r, density, ...args));
    return out;
  };

  // Dispatch to the right fill type → array of paths in tile-local SVG coords
  const generatePatternFillPaths = (fill) => {
    const regions = getFillRegions(fill);
    const {
      fillType = 'hatch', density = 5,
      angle = 0, amplitude = 1.0, dotSize = 1.0,
      dotLength = 0, dotRotation = 0, penWidth = 0.3,
      padding = 0, shiftX = 0, shiftY = 0,
      dotPattern = 'brick', axes = 3, polyTile = 'grid',
      waveSmoothing = 1.0, waveFrequency = 1.0,
      dotShape = 'circle', dotJitter = 0,
      lineCount = 1,
      polyPadding = 0, polyRotation = 0, polyRotationStep = 0, polyScaleStep = 0,
      spiralTurns = 0, spiralTightness = 0, spiralDirection = 'cw',
      radialSkip = 0,
      contourDirection = 'inset', contourStepVariance = 0, contourSimplify = 0, contourCenterPadding = 0,
      // B1 Flow Field
      flowFieldType = 'perlin', flowNoiseScale = 6.0, flowSeed = 1, flowTraceLen = 60, flowSeparation = 2.5,
      // B2 Voronoi
      voronoiSeeds = 60, voronoiJitter = 0.5, voronoiStroke = 'boundary', voronoiSeedMode = 'random',
      // B3 Truchet
      truchetTileSet = 'quarter-arcs', truchetTileSize = 6, truchetSeed = 1, truchetRotations = 4,
      // B4 Maze
      mazeCellSize = 5, mazeAlgorithm = 'dfs', mazeBranchBias = 0.5, mazeSeed = 1, mazeWallMode = 'walls',
      // B5 Scribble
      scribbleSmoothness = 0.6, scribbleSeed = 1, scribbleCoverage = 1.0,
      // B6 L-System
      lsysPreset = 'coral', lsysIterations = 4, lsysAngleVariance = 8, lsysSeed = 1, lsysScale = 1.0,
      // B7 Halftone
      halftoneSource = 'radial', halftoneMinR = 0.2, halftoneMaxR = 1.5, halftoneFrequency = 5, halftoneAngle = 0, halftoneInvert = 'off',
      // B9 Spirograph
      spiroRatioA = 5, spiroRatioB = 3, spiroPhase = 0, spiroTurns = 50, spiroDeformation = 0,
      // B10 Weave
      weavePattern = 'plain', weaveStrandWidth = 1.5, weaveGap = 0.3, weaveAngle = 0, weaveOver = 1, weaveUnder = 1,
    } = fill;
    // C3: hatch unified — compute the per-layer angle offsets up-front.
    // 1 layer = [0], 2 layers (crosshatch) = [0, 90], 3 layers (triaxial) = [0, 60, 120].
    const _hatchAnglesForCount = (n) => {
      const k = Math.max(1, Math.min(3, Math.round(n) || 1));
      if (k === 1) return [0];
      if (k === 2) return [0, 90];
      return [0, 60, 120];
    };
    if (!regions.length) return [];
    const effectiveRegions = padding > 0
      ? regions.map(r => insetPolygon(r, polyArea(r) > 0 ? padding : -padding)).filter(Boolean)
      : regions;
    if (!effectiveRegions.length) return [];
    if (effectiveRegions.length === 1) {
      const region = effectiveRegions[0];
      switch (fillType) {
        case 'hatch': {
          const offsets = _hatchAnglesForCount(lineCount);
          const out = [];
          for (const o of offsets) out.push(...hatchLines(region, density, o + angle, shiftX, shiftY));
          return out;
        }
        case 'vhatch':      return hatchLines(region, density, 90 + angle, shiftX, shiftY);
        case 'dhatch45':    return hatchLines(region, density, 45 + angle, shiftX, shiftY);
        case 'dhatch135':   return hatchLines(region, density, 135 + angle, shiftX, shiftY);
        case 'crosshatch':  return [...hatchLines(region, density, 0 + angle, shiftX, shiftY), ...hatchLines(region, density, 90 + angle, shiftX, shiftY)];
        case 'xcrosshatch': return [...hatchLines(region, density, 45 + angle, shiftX, shiftY), ...hatchLines(region, density, 135 + angle, shiftX, shiftY)];
        case 'wave':        return waveLinesUnified(region, density, angle, amplitude, waveSmoothing, waveFrequency, shiftX, shiftY);
        case 'wavelines':   return waveLinesUnified(region, density, angle, amplitude, 1.0, 1.0, shiftX, shiftY);
        case 'zigzag':      return waveLinesUnified(region, density, angle, amplitude, 0.0, 1.0, shiftX, shiftY);
        case 'dots':        return dotShape === 'circle'
          ? expandDotsToSpirals(dotsFill(region, density, dotSize, angle, shiftX, shiftY, dotPattern, 'circle', dotJitter), dotLength, penWidth, dotRotation)
          : dotsFill(region, density, dotSize, angle, shiftX, shiftY, dotPattern, dotShape, dotJitter, dotLength, dotRotation, penWidth);
        case 'stipple':     return expandDotsToSpirals(dotsFill(region, density, dotSize, angle, shiftX, shiftY, dotPattern, 'circle', dotJitter), dotLength, penWidth, dotRotation);
        case 'contour':     return contourLines(region, density, contourDirection, contourStepVariance, contourSimplify, contourCenterPadding);
        case 'spiral': {
          // Slider "Density" is intuitive when higher = denser. Internally
          // the Archimedean ring spacing is the *inverse* (smaller spacing
          // → denser spiral), so we map density → 1/density. At the default
          // value of 1 this is a no-op (spacing = 1mm), so saved fills with
          // density=1 render the same before and after this change.
          const spacing = density > 0 ? 1 / density : 1;
          // Bounds: original `regions[0]`; clip: padded `region`. This keeps
          // the spiral center anchored as padding sweeps.
          return spiralFill(regions[0], region, spacing, angle, shiftX, shiftY, spiralTurns, spiralTightness, spiralDirection);
        }
        case 'radial':      return radialFill(region, density, angle, shiftX, shiftY, radialSkip);
        case 'grid':        return expandDotsToSpirals(dotsFill(region, density, dotSize, angle, shiftX, shiftY, 'grid', 'tick', dotJitter), dotLength, penWidth, dotRotation);
        case 'meander':     return meanderLines(region, density, angle, shiftX, shiftY);
        case 'polygonal':   return polygonalLines(region, density, angle, shiftX, shiftY, axes, polyTile, polyPadding, polyRotation, polyRotationStep, polyScaleStep);
        case 'triaxial':    return triaxialLines(region, density, angle, shiftX, shiftY);
        case 'flowfield':   return _flowFieldFill(region, density, flowFieldType, flowNoiseScale, flowSeed, flowTraceLen, flowSeparation);
        case 'voronoi':     return _voronoiFill(region, density, voronoiSeeds, voronoiJitter, voronoiStroke, voronoiSeedMode);
        case 'truchet':     return _truchetFill(region, density, truchetTileSet, truchetTileSize, truchetSeed, truchetRotations);
        case 'maze':        return _mazeFill(region, density, mazeCellSize, mazeAlgorithm, mazeBranchBias, mazeSeed, mazeWallMode);
        case 'scribble':    return _scribbleFill(region, density, scribbleSmoothness, scribbleSeed, scribbleCoverage);
        case 'lsystem':     return _lsystemFill(region, density, lsysPreset, lsysIterations, lsysAngleVariance, lsysSeed, lsysScale);
        case 'halftone':    return _halftoneFill(region, density, halftoneSource, halftoneMinR, halftoneMaxR, halftoneFrequency, halftoneAngle, halftoneInvert);
        case 'stripes':     return _stripesFill(fill, region, [region], density);
        case 'spirograph':  return _spirographFill(region, density, spiroRatioA, spiroRatioB, spiroPhase, spiroTurns, spiroDeformation);
        case 'weave':       return _weaveFill(region, density, weavePattern, weaveStrandWidth, weaveGap, weaveAngle, weaveOver, weaveUnder);
        default:            return hatchLines(region, density, 0 + angle, shiftX, shiftY);
      }
    }
    switch (fillType) {
      case 'hatch': {
        const offsets = _hatchAnglesForCount(lineCount);
        const out = [];
        for (const o of offsets) out.push(...hatchLinesComposite(effectiveRegions, density, o + angle, shiftX, shiftY));
        return out;
      }
      case 'vhatch':      return hatchLinesComposite(effectiveRegions, density, 90 + angle, shiftX, shiftY);
      case 'dhatch45':    return hatchLinesComposite(effectiveRegions, density, 45 + angle, shiftX, shiftY);
      case 'dhatch135':   return hatchLinesComposite(effectiveRegions, density, 135 + angle, shiftX, shiftY);
      case 'crosshatch':  return [...hatchLinesComposite(effectiveRegions, density, 0 + angle, shiftX, shiftY), ...hatchLinesComposite(effectiveRegions, density, 90 + angle, shiftX, shiftY)];
      case 'xcrosshatch': return [...hatchLinesComposite(effectiveRegions, density, 45 + angle, shiftX, shiftY), ...hatchLinesComposite(effectiveRegions, density, 135 + angle, shiftX, shiftY)];
      case 'wave':        return waveLinesUnifiedComposite(effectiveRegions, density, angle, amplitude, waveSmoothing, waveFrequency, shiftX, shiftY);
      case 'wavelines':   return waveLinesUnifiedComposite(effectiveRegions, density, angle, amplitude, 1.0, 1.0, shiftX, shiftY);
      case 'zigzag':      return waveLinesUnifiedComposite(effectiveRegions, density, angle, amplitude, 0.0, 1.0, shiftX, shiftY);
      case 'dots':        return dotShape === 'circle'
        ? expandDotsToSpirals(dotsFillComposite(effectiveRegions, density, dotSize, angle, shiftX, shiftY, dotPattern, 'circle', dotJitter), dotLength, penWidth, dotRotation)
        : dotsFillComposite(effectiveRegions, density, dotSize, angle, shiftX, shiftY, dotPattern, dotShape, dotJitter, dotLength, dotRotation, penWidth);
      case 'stipple':     return expandDotsToSpirals(dotsFillComposite(effectiveRegions, density, dotSize, angle, shiftX, shiftY, dotPattern, 'circle', dotJitter), dotLength, penWidth, dotRotation);
      case 'contour':     return contourLinesComposite(effectiveRegions, density, contourDirection, contourStepVariance, contourSimplify, contourCenterPadding);
      case 'spiral': {
        const spacing = density > 0 ? 1 / density : 1;
        return spiralFillComposite(regions, effectiveRegions, spacing, angle, shiftX, shiftY, spiralTurns, spiralTightness, spiralDirection);
      }
      case 'radial':      return radialFillComposite(effectiveRegions, density, angle, shiftX, shiftY, radialSkip);
      case 'grid':        return expandDotsToSpirals(dotsFillComposite(effectiveRegions, density, dotSize, angle, shiftX, shiftY, 'grid', 'tick', dotJitter), dotLength, penWidth, dotRotation);
      case 'meander':     return meanderLinesComposite(effectiveRegions, density, angle, shiftX, shiftY);
      case 'polygonal':   return polygonalLinesComposite(effectiveRegions, density, angle, shiftX, shiftY, axes, polyTile, polyPadding, polyRotation, polyRotationStep, polyScaleStep);
      case 'triaxial':    return triaxialLinesComposite(effectiveRegions, density, angle, shiftX, shiftY);
      case 'flowfield':   return _flowFieldFillComposite(effectiveRegions, density, flowFieldType, flowNoiseScale, flowSeed, flowTraceLen, flowSeparation);
      case 'voronoi':     return _voronoiFillComposite(effectiveRegions, density, voronoiSeeds, voronoiJitter, voronoiStroke, voronoiSeedMode);
      case 'truchet':     return _truchetFillComposite(effectiveRegions, density, truchetTileSet, truchetTileSize, truchetSeed, truchetRotations);
      case 'maze':        return _mazeFillComposite(effectiveRegions, density, mazeCellSize, mazeAlgorithm, mazeBranchBias, mazeSeed, mazeWallMode);
      case 'scribble':    return _scribbleFillComposite(effectiveRegions, density, scribbleSmoothness, scribbleSeed, scribbleCoverage);
      case 'lsystem':     return _lsystemFillComposite(effectiveRegions, density, lsysPreset, lsysIterations, lsysAngleVariance, lsysSeed, lsysScale);
      case 'halftone':    return _halftoneFillComposite(effectiveRegions, density, halftoneSource, halftoneMinR, halftoneMaxR, halftoneFrequency, halftoneAngle, halftoneInvert);
      case 'stripes': {
        const out = [];
        for (const r of effectiveRegions) out.push(..._stripesFill(fill, r, [r], density));
        return out;
      }
      case 'spirograph':  return _spirographFillComposite(effectiveRegions, density, spiroRatioA, spiroRatioB, spiroPhase, spiroTurns, spiroDeformation);
      case 'weave':       return _weaveFillComposite(effectiveRegions, density, weavePattern, weaveStrandWidth, weaveGap, weaveAngle, weaveOver, weaveUnder);
      default:            return hatchLinesComposite(effectiveRegions, density, 0 + angle, shiftX, shiftY);
    }
  };

  // Expose for UI and testing
  window.Vectura.AlgorithmRegistry._generatePatternFillPaths = generatePatternFillPaths;
  window.Vectura.AlgorithmRegistry._polyContainsPoint = polyContainsPoint;
  window.Vectura.AlgorithmRegistry._compilePatternFillTargets = compilePatternFillTargetsFromData;
  window.Vectura.AlgorithmRegistry.patternGetFillTargets = (patternOrId, options = {}) => {
    const data = typeof patternOrId === 'object' && patternOrId?.groups ? patternOrId : compilePatternMeta(patternOrId, options);
    if (!data) return null;
    return compilePatternFillTargetsFromData(data, options);
  };
  window.Vectura.AlgorithmRegistry.patternGetFillTargetsAtPoint = (patternOrId, x, y, options = {}) => {
    const compiled = window.Vectura.AlgorithmRegistry.patternGetFillTargets(patternOrId, options);
    if (!compiled) return null;
    return getFillTargetsAtPoint(compiled, x, y, options);
  };

  // ── Seam removal ─────────────────────────────────────────────────────────

  // Remove duplicate segments that appear at tile seam boundaries, then reconnect split chains.
  const removeSeamSegments = (inputPaths) => {
    const snap = v => Math.round(v * 20) / 20;
    const pk = p => `${snap(p.x)},${snap(p.y)}`;
    const sk = (a, b) => { const ka = pk(a), kb = pk(b); return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`; };
    const isCl = p => p.length >= 3 && pk(p[0]) === pk(p[p.length - 1]);

    // Count how many paths contribute each segment (direction-agnostic)
    const freq = new Map();
    for (const path of inputPaths) {
      if (!Array.isArray(path) || path.length < 2) continue;
      for (let i = 0; i + 1 < path.length; i++) {
        const key = sk(path[i], path[i + 1]);
        freq.set(key, (freq.get(key) || 0) + 1);
      }
    }
    if (![...freq.values()].some(c => c > 1)) return inputPaths;

    // Split each path at duplicate segments into open chains
    const chains = [];
    for (const path of inputPaths) {
      if (!Array.isArray(path) || path.length < 2) continue;
      const cl = isCl(path);
      const pts = cl ? path.slice(0, -1) : path;
      const n = pts.length;
      const segCount = cl ? n : n - 1;

      const isDup = i => {
        const j = cl ? (i + 1) % n : i + 1;
        return freq.get(sk(pts[i], pts[j])) > 1;
      };

      let anyDup = false;
      for (let i = 0; i < segCount; i++) if (isDup(i)) { anyDup = true; break; }
      if (!anyDup) { chains.push(path); continue; }

      // For closed paths start traversal right after the first duplicate segment
      let start = 0;
      if (cl) {
        for (let i = 0; i < n; i++) if (isDup(i)) { start = (i + 1) % n; break; }
      }

      let cur = null;
      for (let step = 0; step < segCount; step++) {
        const si = cl ? (start + step) % n : step;
        const sj = cl ? (si + 1) % n : si + 1;
        if (isDup(si)) {
          if (cur && cur.length >= 2) { if (path.meta) cur.meta = path.meta; chains.push(cur); }
          cur = null;
        } else {
          if (!cur) cur = [pts[si]];
          cur.push(pts[sj]);
        }
      }
      if (cur && cur.length >= 2) { if (path.meta) cur.meta = path.meta; chains.push(cur); }
    }

    return mergeTouchingChains(chains).filter(p => p && p.length >= 2);
  };

  // Expose for unit testing
  window.Vectura.AlgorithmRegistry._removeSeamSegments = removeSeamSegments;
  window.Vectura.AlgorithmRegistry._mergeTouchingChains = mergeTouchingChains;
  window.Vectura.AlgorithmRegistry._traceFilledGroupVisibleBoundaries = traceFilledGroupVisibleBoundaries;
  window.Vectura.AlgorithmRegistry._tracePeriodicFillBoundaries = tracePeriodicFillBoundaries;
  window.Vectura.AlgorithmRegistry._traceFilledElementsVisibleBoundaries = traceFilledElementsVisibleBoundaries;
  window.Vectura.AlgorithmRegistry.patternValidateMeta = validatePatternMeta;
  window.Vectura.AlgorithmRegistry._validateCompiledPattern = validateCompiledPattern;

  window.Vectura.AlgorithmRegistry.pattern = {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const patternId = p.patternId || (window.Vectura.PATTERNS[0] ? window.Vectura.PATTERNS[0].id : null);
        if (!patternId) return [];
        
        const data = getTargetSvgData(patternId);
        if (!data) return [];
        
        const scale = p.scale ?? 1;
        const originX = p.originX ?? 0;
        const originY = p.originY ?? 0;
        const tileSpacingX = p.tileSpacingX ?? 0;
        const tileSpacingY = p.tileSpacingY ?? 0;
        const tileMethod = p.tileMethod || 'grid';
        
        const scaledW = (data.vbW + tileSpacingX) * scale;
        const scaledH = (data.vbH + tileSpacingY) * scale;
        
        if (scaledW <= 0 || scaledH <= 0) return [];

        const startX = m + (originX % scaledW) - scaledW;
        const startY = m + (originY % scaledH) - scaledH;
        
        const paths = [];
        const tilePositions = [];

        if (tileMethod === 'off') {
          tilePositions.push({ tx: m + originX, ty: m + originY });
        } else if (tileMethod === 'hexagonal') {
          const rowH = scaledH * Math.sin(Math.PI / 3);
          let rowCount = 0;
          for (let y = startY; y < m + dH + rowH; y += rowH) {
            const xOff = (rowCount % 2) ? scaledW / 2 : 0;
            for (let x = startX + xOff - scaledW; x < m + dW + scaledW; x += scaledW)
              tilePositions.push({ tx: x, ty: y });
            rowCount++;
          }
        } else {
          let rowCount = 0;
          for (let y = startY; y < m + dH + scaledH; y += scaledH) {
            const xOffset = (tileMethod === 'brick' && rowCount % 2 !== 0) ? scaledW / 2 : 0;
            for (let x = startX + xOffset - scaledW; x < m + dW + scaledW; x += scaledW)
              tilePositions.push({ tx: x, ty: y });
            rowCount++;
          }
        }

        for (const { tx, ty } of tilePositions) {
          data.groups.forEach(group => {
            const penId = p.penMapping && p.penMapping[group.id] ? p.penMapping[group.id] : null;
            group.paths.forEach(originalPath => {
              const tp = [];
              for (const pt of originalPath) {
                const tpt = { x: tx + pt.x * scale, y: ty + pt.y * scale };
                if (pt._tileEdge) tpt._tileEdge = true;
                tp.push(tpt);
              }
              tp.meta = { penId };
              paths.push(tp);
            });
          });
        }

        // Apply pattern fills (line fills added via Pattern Designer)
        if (p.patternFills && p.patternFills.length) {
          for (const fill of p.patternFills) {
            const fillPaths = generatePatternFillPaths(fill);
            const penId = fill.penId ?? null;
            for (const { tx, ty } of tilePositions) {
              for (const fp of fillPaths) {
                const tp = fp.map(pt => ({ x: tx + pt.x * scale, y: ty + pt.y * scale }));
                tp.meta = { penId };
                paths.push(tp);
              }
            }
          }
        }

        if (tileMethod === 'off') return paths;

        if (p.removeSeams !== false) {
          const byPen = new Map();
          for (const path of paths) {
            const key = path.meta?.penId ?? null;
            if (!byPen.has(key)) byPen.set(key, []);
            byPen.get(key).push(path);
          }
          paths.length = 0;
          for (const [, group] of byPen) {
            for (const r of removeSeamSegments(group)) paths.push(r);
          }
        }

        return paths;
      },
      formula: (p) => `pattern = ${p.patternId}\nscale = ${p.scale}, tile = ${p.tileMethod}`
  };
})();
