/**
 * Pattern tiling algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const svgCache = new Map();

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

  const parseNumber = (val, fallback = 0) => {
    if (val === undefined || val === null) return fallback;
    const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : fallback;
  };

  const svgElementToPaths = (el, offsetX = 0, offsetY = 0, vbMinX = 0, vbMinY = 0, vbW = 0, vbH = 0) => {
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
      try {
        const len = el.getTotalLength ? el.getTotalLength() : 0;
        if (len <= 0) return [];
        const steps = Math.max(10, Math.floor(len / 2));
        const step = len / steps;

        // Exact node coordinates from the d attribute, transformed into the
        // same space as normalizePoints output. Only boundary-adjacent nodes
        // are used as snap targets so that interior subpath nodes (e.g. oval
        // control points in cage) don't corrupt unrelated subpath samples.
        const dNodes = parseSvgDNodes(el.getAttribute('d') || '');
        const dNodesNorm = dNodes.length ? normalizePoints(dNodes) : [];
        const SNAP_TOL = 1.0;
        const BOUNDARY_TOL = 2.0;
        const snapNodes = dNodesNorm.filter(n =>
          Math.abs(n.x - vbMinX) < BOUNDARY_TOL ||
          Math.abs(n.x - vbW)    < BOUNDARY_TOL ||
          Math.abs(n.y - vbMinY) < BOUNDARY_TOL ||
          Math.abs(n.y - vbH)    < BOUNDARY_TOL
        );
        const snapToNodes = (pt) => {
          for (const n of snapNodes) {
            if (Math.hypot(pt.x - n.x, pt.y - n.y) < SNAP_TOL) return n;
          }
          return pt;
        };
        const pushSubPath = (rawPts) => {
          if (rawPts.length < 2) return;
          const norm = normalizePoints(rawPts);
          // Snap each normalised point to the nearest exact d-attribute node.
          const snapped = norm.map(snapToNodes);
          // Remove consecutive duplicates introduced by snapping.
          const deduped = snapped.filter((p, i) =>
            i === 0 || p.x !== snapped[i-1].x || p.y !== snapped[i-1].y
          );
          if (deduped.length >= 2) allSubPaths.push(deduped);
        };

        const allSubPaths = [];
        let currentPath = [];

        for (let idx = 0; idx <= steps + 1; idx++) {
           const actualLen = Math.min(idx * step, len);
           const pt = el.getPointAtLength(actualLen);

           if (currentPath.length > 0) {
              const prev = currentPath[currentPath.length - 1];
              const prevLen = Math.max(0, (idx - 1) * step);
              const dLen = actualLen - prevLen;
              const maxDist = (dLen > 0 ? dLen : step) * 1.5;

              if (Math.hypot(pt.x - prev.x, pt.y - prev.y) > maxDist) {
                  let L = prevLen;
                  let R = actualLen;
                  let beforeJump = L;

                  for (let iter = 0; iter < 8; iter++) {
                      const mid = (L + R) / 2;
                      const midPt = el.getPointAtLength(mid);
                      if (Math.hypot(midPt.x - prev.x, midPt.y - prev.y) > (mid - prevLen) * 1.5) {
                          R = mid;
                      } else {
                          beforeJump = mid;
                          L = mid;
                      }
                  }

                  if (currentPath.length > 1) {
                      const endPt = el.getPointAtLength(beforeJump);
                      currentPath.push({ x: endPt.x, y: endPt.y });
                      pushSubPath(currentPath);
                  }

                  const jumpPt = el.getPointAtLength(beforeJump + 0.05);
                  currentPath = [{ x: jumpPt.x, y: jumpPt.y }, { x: pt.x, y: pt.y }];
                  if (actualLen === len) break;
                  continue;
              }
           }
           currentPath.push({ x: pt.x, y: pt.y });
           if (actualLen === len) break;
        }
        if (currentPath.length > 0) pushSubPath(currentPath);
        return allSubPaths;
      } catch (err) {}
      return [];
    }
    return [];
  };

  const getTargetSvgData = (patternId) => {
    if (svgCache.has(patternId)) return svgCache.get(patternId);
    
    const meta = window.Vectura.PATTERNS.find(x => x.id === patternId);
    if (!meta || !meta.svg) return null;

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
      tempSvg.appendChild(clone);
      
      const stroke = el.getAttribute('stroke') || el.style?.stroke || '';
      const fill = el.getAttribute('fill') || el.style?.fill || '';
      
      // Determine distinct identifier for this element based on styles to group them logically
      const identifier = `${stroke}|${fill}`;
      
      const paths = svgElementToPaths(clone, vbMinX, vbMinY, vbMinX, vbMinY, vbW, vbH);
      
      elementsData.push({
         index,
         identifier,
         paths
      });
      clone.remove();
    });
    
    tempSvg.remove();
    
    // Group identical styled elements into logical pens
    const orderedKeys = [];
    const groups = new Map();
    elementsData.forEach(item => {
        if (!groups.has(item.identifier)) {
            orderedKeys.push(item.identifier);
            groups.set(item.identifier, []);
        }
        groups.get(item.identifier).push(...item.paths);
    });
    
    const parsedGroups = orderedKeys.map((key, i) => ({
       id: `el-${i}`,
       label: `Element ${i+1}`,
       paths: groups.get(key)
    }));

    const result = { vbW, vbH, groups: parsedGroups };
    svgCache.set(patternId, result);
    return result;
  };

  // expose helper for UI drop-downs
  window.Vectura.AlgorithmRegistry.patternGetGroups = getTargetSvgData;

  // ── Pattern fill helpers ──────────────────────────────────────────────────

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

  // Hatch lines at angleDeg, clipped to polygon
  const hatchLines = (poly, density, angleDeg) => {
    const ar = angleDeg * Math.PI / 180;
    const ca = Math.cos(ar), sa = Math.sin(ar);
    const rotPoly = poly.map(p => ({ x: p.x * ca + p.y * sa, y: -p.x * sa + p.y * ca }));
    const ys = rotPoly.map(p => p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const result = [];
    for (let y = Math.ceil(minY / density) * density; y <= maxY + 1e-6; y += density) {
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
  const waveLines = (poly, density) => {
    const ys = poly.map(p => p.y), xs = poly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const amplitude = density * 0.4, wavelength = density * 1.5;
    const stepX = Math.max(0.5, (maxX - minX) / 200);
    const result = [];
    for (let cy = Math.ceil(minY / density) * density; cy <= maxY + 1e-6; cy += density) {
      let seg = null;
      for (let x = minX; x <= maxX + stepX; x += stepX) {
        if (polyContainsPoint(poly, x, cy)) {
          if (!seg) seg = [];
          seg.push({ x, y: cy + amplitude * Math.sin((x / wavelength) * Math.PI * 2) });
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
  const zigzagLines = (poly, density) => {
    const ys = poly.map(p => p.y), xs = poly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const amplitude = density * 0.4, halfPeriod = density * 0.75;
    const result = [];
    for (let cy = Math.ceil(minY / density) * density; cy <= maxY + 1e-6; cy += density) {
      let seg = null, flip = false;
      for (let x = minX; x <= maxX + halfPeriod; x += halfPeriod) {
        if (polyContainsPoint(poly, x, cy)) {
          if (!seg) seg = [];
          seg.push({ x, y: cy + (flip ? amplitude : -amplitude) });
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
  const stippleDots = (poly, density) => {
    const ys = poly.map(p => p.y), xs = poly.map(p => p.x);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const dotR = Math.max(0.15, density * 0.12);
    const result = [];
    let rowOff = false;
    for (let y = Math.ceil(minY / density) * density; y <= maxY + 1e-6; y += density) {
      const x0 = minX + (rowOff ? density / 2 : 0);
      for (let x = x0; x <= maxX + 1e-6; x += density) {
        if (polyContainsPoint(poly, x, y))
          result.push([{ x: x - dotR, y }, { x: x + dotR, y }]);
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

  // Dispatch to the right fill type → array of paths in tile-local SVG coords
  const generatePatternFillPaths = (fill) => {
    const { region, fillType = 'hatch', density = 5 } = fill;
    if (!region || region.length < 3) return [];
    switch (fillType) {
      case 'hatch':       return hatchLines(region, density, 0);
      case 'vhatch':      return hatchLines(region, density, 90);
      case 'dhatch45':    return hatchLines(region, density, 45);
      case 'dhatch135':   return hatchLines(region, density, 135);
      case 'crosshatch':  return [...hatchLines(region, density, 0), ...hatchLines(region, density, 90)];
      case 'xcrosshatch': return [...hatchLines(region, density, 45), ...hatchLines(region, density, 135)];
      case 'wavelines':   return waveLines(region, density);
      case 'zigzag':      return zigzagLines(region, density);
      case 'stipple':     return stippleDots(region, density);
      case 'contour':     return contourLines(region, density);
      default:            return hatchLines(region, density, 0);
    }
  };

  // Expose for UI and testing
  window.Vectura.AlgorithmRegistry._generatePatternFillPaths = generatePatternFillPaths;
  window.Vectura.AlgorithmRegistry._polyContainsPoint = polyContainsPoint;

  // ── Seam removal ─────────────────────────────────────────────────────────

  // Remove duplicate segments that appear at tile seam boundaries, then reconnect split chains.
  const removeSeamSegments = (inputPaths) => {
    const snap = v => Math.round(v * 10) / 10;
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

    // Reconnect open chains that share endpoints using hash-map for O(n) lookup.
    // Handles end→start (direct) and end→end (reverse b) connections.
    const active = chains.slice();
    const byEnd = new Map();
    const byStart = new Map();
    for (let i = 0; i < active.length; i++) {
      const p = active[i];
      if (!p || p.length < 2) continue;
      byEnd.set(pk(p[p.length - 1]), i);
      byStart.set(pk(p[0]), i);
    }

    let anyMerge = true;
    while (anyMerge) {
      anyMerge = false;
      for (let i = 0; i < active.length; i++) {
        const a = active[i];
        if (!a || a.length < 2) continue;
        const aEndKey = pk(a[a.length - 1]);

        // end→start: b starts where a ends
        let j = byStart.get(aEndKey);
        if (j !== undefined && j !== i && active[j]) {
          const b = active[j];
          const merged = a.concat(b.slice(1));
          if (a.meta) merged.meta = a.meta;
          byEnd.delete(aEndKey);
          byStart.delete(pk(b[0]));
          byEnd.delete(pk(b[b.length - 1]));
          byStart.delete(pk(a[0]));
          active[i] = merged;
          active[j] = null;
          byStart.set(pk(merged[0]), i);
          byEnd.set(pk(merged[merged.length - 1]), i);
          anyMerge = true;
          continue;
        }

        // end→end: b ends where a ends — reverse b then append
        j = byEnd.get(aEndKey);
        if (j !== undefined && j !== i && active[j]) {
          const b = active[j];
          const bRev = b.slice().reverse();
          const merged = a.concat(bRev.slice(1));
          if (a.meta) merged.meta = a.meta;
          byEnd.delete(aEndKey);
          byEnd.delete(pk(b[b.length - 1]));
          byStart.delete(pk(b[0]));
          byStart.delete(pk(a[0]));
          active[i] = merged;
          active[j] = null;
          byStart.set(pk(merged[0]), i);
          byEnd.set(pk(merged[merged.length - 1]), i);
          anyMerge = true;
          continue;
        }
      }
    }

    return active.filter(p => p && p.length >= 2);
  };

  // Expose for unit testing
  window.Vectura.AlgorithmRegistry._removeSeamSegments = removeSeamSegments;

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
              for (const pt of originalPath) tp.push({ x: tx + pt.x * scale, y: ty + pt.y * scale });
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
