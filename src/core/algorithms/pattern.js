/**
 * Pattern tiling algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
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

  const isClosedPath = window.Vectura.OptimizationUtils?.isClosedPath
    || ((path = []) => {
      if (!Array.isArray(path) || path.length < 3) return false;
      const first = path[0]; const last = path[path.length - 1];
      if (!first || !last) return false;
      return Math.hypot(first.x - last.x, first.y - last.y) < 0.01;
    });

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
        } catch (err) {}
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
      return {
        id: `el-${i}`,
        label: `Element ${i+1}`,
        isFillOnly,
        paths: isFillOnly
          ? sourceItems.flatMap((item) => {
              const ps = traceFilledElementsVisibleBoundaries([item.element], vbMinX, vbMinY, vbW, vbH);
              ps.forEach((p) => { p._srcElementIndex = item.index; });
              return ps;
            })
          : groupPaths,
      };
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
      let seg = null;
      for (let x = bounds.minX; x <= bounds.maxX + stepX; x += stepX) {
        if (compositeContainsPoint(rotRegions, x, cy)) {
          if (!seg) seg = [];
          const wy = cy + amp * Math.sin(((x + rotShiftX) / wavelength) * Math.PI * 2);
          seg.push(unrotatePt({ x, y: wy }));
        } else if (seg) {
          if (seg.length >= 2) result.push(seg);
          seg = null;
        }
      }
      if (seg && seg.length >= 2) result.push(seg);
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
      let seg = null;
      let flip = (((Math.floor(-rotShiftX / halfPeriod) % 2) + 2) % 2) !== 0;
      for (let x = bounds.minX; x <= bounds.maxX + halfPeriod; x += halfPeriod) {
        if (compositeContainsPoint(rotRegions, x, cy)) {
          if (!seg) seg = [];
          const wy = cy + (flip ? amp : -amp);
          seg.push(unrotatePt({ x, y: wy }));
        } else if (seg) {
          if (seg.length >= 2) result.push(seg);
          seg = null;
        }
        flip = !flip;
      }
      if (seg && seg.length >= 2) result.push(seg);
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

  const spiralFillComposite = (regions, density, angleDeg = 0, shiftX = 0, shiftY = 0) => {
    const bounds = compositeBounds(regions);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = 0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density;
    const maxAngle = (maxR / density) * 2 * Math.PI + 2 * Math.PI;
    const totalSteps = Math.min(50000, Math.ceil(maxAngle / 0.05));
    const stepAngle = maxAngle / totalSteps;
    const angleOffset = angleDeg * Math.PI / 180;
    const result = [];
    let seg = null;
    for (let i = 0; i <= totalSteps; i++) {
      const spiralAngle = i * stepAngle;
      const r = (spiralAngle / (2 * Math.PI)) * density;
      const x = cx + Math.cos(spiralAngle + angleOffset) * r;
      const y = cy + Math.sin(spiralAngle + angleOffset) * r;
      if (compositeContainsPoint(regions, x, y)) {
        if (!seg) seg = [];
        seg.push({ x, y });
      } else {
        if (seg && seg.length >= 2) result.push(seg);
        seg = null;
      }
    }
    if (seg && seg.length >= 2) result.push(seg);
    return result;
  };

  const radialFillComposite = (regions, density, angleDeg = 0, shiftX = 0, shiftY = 0, centralDensity = 1.0, outerDiameter = 1.0) => {
    const bounds = compositeBounds(regions);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = (0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density) * Math.max(0, outerDiameter);
    const spokeCount = Math.max(8, Math.round(2 * Math.PI * (maxR / 2) / density * centralDensity));
    const stepR = Math.max(0.5, density * 0.3);
    const angleOffset = angleDeg * Math.PI / 180;
    const result = [];
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * 2 * Math.PI + angleOffset;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      let seg = null;
      for (let r = 0; r <= maxR; r += stepR) {
        const x = cx + cosA * r, y2 = cy + sinA * r;
        if (compositeContainsPoint(regions, x, y2)) {
          if (!seg) seg = [];
          seg.push({ x, y: y2 });
        } else {
          if (seg && seg.length >= 2) result.push(seg);
          seg = null;
        }
      }
      if (seg && seg.length >= 2) result.push(seg);
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

  const polygonalLinesComposite = (regions, density, angleOffset = 0, shiftX = 0, shiftY = 0, numAxes = 3) => {
    const { minX, maxX, minY, maxY } = compositeBounds(regions);
    return tessellateEdges(
      minX, maxX, minY, maxY, density, angleOffset, shiftX, shiftY, numAxes,
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

  // Sinusoidal wave scan lines clipped by point-in-polygon
  const waveLines = (poly, density, angleDeg = 0, amplitude = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotPoly = ar !== 0 ? poly.map(rotatePt) : poly;
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
      let seg = null;
      for (let x = minX; x <= maxX + stepX; x += stepX) {
        if (polyContainsPoint(rotPoly, x, cy)) {
          if (!seg) seg = [];
          const wy = cy + amp * Math.sin(((x + rotShiftX) / wavelength) * Math.PI * 2);
          seg.push(unrotatePt({ x, y: wy }));
        } else {
          if (seg && seg.length >= 2) result.push(seg);
          seg = null;
        }
      }
      if (seg && seg.length >= 2) result.push(seg);
    }
    return result;
  };

  // Triangle-wave (zigzag) scan lines clipped by point-in-polygon
  const zigzagLines = (poly, density, angleDeg = 0, amplitude = 1.0, shiftX = 0, shiftY = 0) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotatePt = ar !== 0 ? (p) => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }) : (p) => p;
    const unrotatePt = ar !== 0 ? (p) => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }) : (p) => p;
    const rotPoly = ar !== 0 ? poly.map(rotatePt) : poly;
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
      let seg = null;
      let flip = (((Math.floor(-rotShiftX / halfPeriod) % 2) + 2) % 2) !== 0;
      for (let x = minX; x <= maxX + halfPeriod; x += halfPeriod) {
        if (polyContainsPoint(rotPoly, x, cy)) {
          if (!seg) seg = [];
          const wy = cy + (flip ? amp : -amp);
          seg.push(unrotatePt({ x, y: wy }));
        } else {
          if (seg && seg.length >= 2) result.push(seg);
          seg = null;
        }
        flip = !flip;
      }
      if (seg && seg.length >= 2) result.push(seg);
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

  // Inset polygon by distance d (miter offset)
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
    const newArea = polyArea(result);
    if (newArea * polyArea(poly) < 0) return null;
    return result;
  };

  // Concentric inset rings of the polygon boundary
  const contourLines = (poly, density) => {
    const result = [];
    let current = poly.slice();
    for (let iter = 0; iter < 100; iter++) {
      current = insetPolygon(current, density);
      if (!current || current.length < 3) break;
      if (Math.abs(polyArea(current)) < density * density) break;
      result.push([...current, current[0]]);
    }
    return result;
  };

  // Contour for multi-region: insets the outer ring and segments rings around holes
  const contourLinesComposite = (regions, density) => {
    if (regions.length === 1) return contourLines(regions[0], density);
    const outer = regions[0];
    const holes = regions.slice(1);
    const result = [];
    let current = outer.slice();
    for (let iter = 0; iter < 100; iter++) {
      const next = insetPolygon(current, density);
      if (!next || next.length < 3) break;
      if (Math.abs(polyArea(next)) < density * density) break;
      if (holes.length === 0) {
        result.push([...next, next[0]]);
      } else {
        const closedRing = [...next, next[0]];
        let seg = null;
        for (const pt of closedRing) {
          if (holes.some((h) => polyContainsPoint(h, pt.x, pt.y))) {
            if (seg && seg.length >= 2) result.push(seg);
            seg = null;
          } else {
            if (!seg) seg = [];
            seg.push(pt);
          }
        }
        if (seg && seg.length >= 2) result.push(seg);
      }
      current = next;
    }
    return result;
  };

  const spiralFill = (region, density, angleDeg = 0, shiftX = 0, shiftY = 0) => {
    const bounds = loopBounds(region);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = 0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density;
    const maxAngle = (maxR / density) * 2 * Math.PI + 2 * Math.PI;
    const totalSteps = Math.min(50000, Math.ceil(maxAngle / 0.05));
    const stepAngle = maxAngle / totalSteps;
    const angleOffset = angleDeg * Math.PI / 180;
    const result = [];
    let seg = null;
    for (let i = 0; i <= totalSteps; i++) {
      const spiralAngle = i * stepAngle;
      const r = (spiralAngle / (2 * Math.PI)) * density;
      const x = cx + Math.cos(spiralAngle + angleOffset) * r;
      const y = cy + Math.sin(spiralAngle + angleOffset) * r;
      if (polyContainsPoint(region, x, y)) {
        if (!seg) seg = [];
        seg.push({ x, y });
      } else {
        if (seg && seg.length >= 2) result.push(seg);
        seg = null;
      }
    }
    if (seg && seg.length >= 2) result.push(seg);
    return result;
  };

  const radialFill = (region, density, angleDeg = 0, shiftX = 0, shiftY = 0, centralDensity = 1.0, outerDiameter = 1.0) => {
    const bounds = loopBounds(region);
    const cx = (bounds.minX + bounds.maxX) / 2 + shiftX;
    const cy = (bounds.minY + bounds.maxY) / 2 + shiftY;
    const maxR = (0.5 * Math.sqrt(
      (bounds.maxX - bounds.minX) ** 2 + (bounds.maxY - bounds.minY) ** 2
    ) + density) * Math.max(0, outerDiameter);
    const spokeCount = Math.max(8, Math.round(2 * Math.PI * (maxR / 2) / density * centralDensity));
    const stepR = Math.max(0.5, density * 0.3);
    const angleOffset = angleDeg * Math.PI / 180;
    const result = [];
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * 2 * Math.PI + angleOffset;
      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      let seg = null;
      for (let r = 0; r <= maxR; r += stepR) {
        const x = cx + cosA * r, y = cy + sinA * r;
        if (polyContainsPoint(region, x, y)) {
          if (!seg) seg = [];
          seg.push({ x, y });
        } else {
          if (seg && seg.length >= 2) result.push(seg);
          seg = null;
        }
      }
      if (seg && seg.length >= 2) result.push(seg);
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

  // Generate tessellating polygon cell edges, clipped via clipFn.
  // Grid anchored to world origin; shiftX/shiftY translates the lattice.
  // numAxes=3 → equilateral triangles, numAxes=4 → squares, else → hexagons.
  // Each edge direction is owned by exactly one cell, so no edge is duplicated.
  const tessellateEdges = (minX, maxX, minY, maxY, density, angleOffset, shiftX, shiftY, numAxes, clipFn) => {
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
      // From each vertex draw +B1, +B2, +(B1-B2) — each undirected edge drawn exactly once.
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
    } else {
      // Hexagonal: pointy-top hex centers at q*hB1 + r*hB2.
      // Each hex draws owned edges e=2,3,4 (lower-left, lower-right, right) — every edge drawn once.
      const sqrt3 = Math.sqrt(3);
      const hB1x = s * sqrt3, hB2x = s * sqrt3 / 2, hB2y = s * 1.5;
      const rMin = Math.floor(lMinY / hB2y) - 1, rMax = Math.ceil(lMaxY / hB2y) + 1;
      const rAbs = Math.max(Math.abs(rMin), Math.abs(rMax));
      const qMin = Math.floor(lMinX / hB1x) - Math.ceil(rAbs / 2) - 2;
      const qMax = Math.ceil(lMaxX / hB1x) + Math.ceil(rAbs / 2) + 2;
      for (let r = rMin; r <= rMax; r++) {
        for (let q = qMin; q <= qMax; q++) {
          const cx = q * hB1x + r * hB2x, cy = r * hB2y;
          for (let e = 2; e <= 4; e++) {
            const t0 = (e * 60 + 90) * Math.PI / 180;
            const t1 = ((e + 1) * 60 + 90) * Math.PI / 180;
            emit(cx + s * Math.cos(t0), cy + s * Math.sin(t0), cx + s * Math.cos(t1), cy + s * Math.sin(t1));
          }
        }
      }
    }
    return result;
  };

  const polygonalLines = (region, density, angleOffset = 0, shiftX = 0, shiftY = 0, numAxes = 3) => {
    const xs = region.map(p => p.x), ys = region.map(p => p.y);
    return tessellateEdges(
      Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys),
      density, angleOffset, shiftX, shiftY, numAxes,
      (p0, p1) => clipSegmentToPoly(p0, p1, region)
    );
  };

  const triaxialLines = (region, density, angleOffset = 0, shiftX = 0, shiftY = 0) =>
    polygonalLines(region, density, angleOffset, shiftX, shiftY, 3);

  // Dispatch to the right fill type → array of paths in tile-local SVG coords
  const generatePatternFillPaths = (fill) => {
    const regions = getFillRegions(fill);
    const {
      fillType = 'hatch', density = 5,
      angle = 0, amplitude = 1.0, dotSize = 1.0,
      padding = 0, shiftX = 0, shiftY = 0,
      dotPattern = 'brick', centralDensity = 1.0, outerDiameter = 1.0, axes = 3,
    } = fill;
    if (!regions.length) return [];
    const effectiveRegions = padding > 0
      ? regions.map(r => insetPolygon(r, polyArea(r) > 0 ? padding : -padding)).filter(Boolean)
      : regions;
    if (!effectiveRegions.length) return [];
    if (effectiveRegions.length === 1) {
      const region = effectiveRegions[0];
      switch (fillType) {
        case 'hatch':       return hatchLines(region, density, 0 + angle, shiftX, shiftY);
        case 'vhatch':      return hatchLines(region, density, 90 + angle, shiftX, shiftY);
        case 'dhatch45':    return hatchLines(region, density, 45 + angle, shiftX, shiftY);
        case 'dhatch135':   return hatchLines(region, density, 135 + angle, shiftX, shiftY);
        case 'crosshatch':  return [...hatchLines(region, density, 0 + angle, shiftX, shiftY), ...hatchLines(region, density, 90 + angle, shiftX, shiftY)];
        case 'xcrosshatch': return [...hatchLines(region, density, 45 + angle, shiftX, shiftY), ...hatchLines(region, density, 135 + angle, shiftX, shiftY)];
        case 'wavelines':   return waveLines(region, density, angle, amplitude, shiftX, shiftY);
        case 'zigzag':      return zigzagLines(region, density, angle, amplitude, shiftX, shiftY);
        case 'stipple':     return stippleDots(region, density, dotSize, shiftX, shiftY, angle, dotPattern);
        case 'contour':     return contourLines(region, density);
        case 'spiral':      return spiralFill(region, density, angle, shiftX, shiftY);
        case 'radial':      return radialFill(region, density, angle, shiftX, shiftY, centralDensity, outerDiameter);
        case 'grid':        return gridDots(region, density, angle, dotSize, shiftX, shiftY);
        case 'meander':     return meanderLines(region, density, angle, shiftX, shiftY);
        case 'polygonal':   return polygonalLines(region, density, angle, shiftX, shiftY, axes);
        case 'triaxial':    return triaxialLines(region, density, angle, shiftX, shiftY);
        default:            return hatchLines(region, density, 0 + angle, shiftX, shiftY);
      }
    }
    switch (fillType) {
      case 'hatch':       return hatchLinesComposite(effectiveRegions, density, 0 + angle, shiftX, shiftY);
      case 'vhatch':      return hatchLinesComposite(effectiveRegions, density, 90 + angle, shiftX, shiftY);
      case 'dhatch45':    return hatchLinesComposite(effectiveRegions, density, 45 + angle, shiftX, shiftY);
      case 'dhatch135':   return hatchLinesComposite(effectiveRegions, density, 135 + angle, shiftX, shiftY);
      case 'crosshatch':  return [...hatchLinesComposite(effectiveRegions, density, 0 + angle, shiftX, shiftY), ...hatchLinesComposite(effectiveRegions, density, 90 + angle, shiftX, shiftY)];
      case 'xcrosshatch': return [...hatchLinesComposite(effectiveRegions, density, 45 + angle, shiftX, shiftY), ...hatchLinesComposite(effectiveRegions, density, 135 + angle, shiftX, shiftY)];
      case 'wavelines':   return waveLinesComposite(effectiveRegions, density, angle, amplitude, shiftX, shiftY);
      case 'zigzag':      return zigzagLinesComposite(effectiveRegions, density, angle, amplitude, shiftX, shiftY);
      case 'stipple':     return stippleDotsComposite(effectiveRegions, density, dotSize, shiftX, shiftY, angle, dotPattern);
      case 'contour':     return contourLinesComposite(effectiveRegions, density);
      case 'spiral':      return spiralFillComposite(effectiveRegions, density, angle, shiftX, shiftY);
      case 'radial':      return radialFillComposite(effectiveRegions, density, angle, shiftX, shiftY, centralDensity, outerDiameter);
      case 'grid':        return gridDotsComposite(effectiveRegions, density, angle, dotSize, shiftX, shiftY);
      case 'meander':     return meanderLinesComposite(effectiveRegions, density, angle, shiftX, shiftY);
      case 'polygonal':   return polygonalLinesComposite(effectiveRegions, density, angle, shiftX, shiftY, axes);
      case 'triaxial':    return triaxialLinesComposite(effectiveRegions, density, angle, shiftX, shiftY);
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
