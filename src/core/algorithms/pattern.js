/**
 * Pattern tiling algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const svgCache = new Map();

  const parseNumber = (val, fallback = 0) => {
    if (val === undefined || val === null) return fallback;
    const cleaned = `${val}`.replace(/[^0-9.+-]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : fallback;
  };

  const svgElementToPaths = (el, offsetX = 0, offsetY = 0) => {
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
                      allSubPaths.push(normalizePoints(currentPath));
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
        if (currentPath.length > 0) allSubPaths.push(normalizePoints(currentPath));
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
      
      const paths = svgElementToPaths(clone, vbMinX, vbMinY);
      
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

        let rowCount = 0;
        for (let y = startY; y < m + dH + scaledH; y += scaledH) {
           let xOffset = 0;
           if (tileMethod === 'brick') {
               xOffset = (rowCount % 2 !== 0) ? (scaledW / 2) : 0;
           }
           
           for (let x = startX + xOffset - scaledW; x < m + dW + scaledW; x += scaledW) {
               data.groups.forEach(group => {
                   const penId = p.penMapping && p.penMapping[group.id] ? p.penMapping[group.id] : null;

                   group.paths.forEach(originalPath => {
                       const translatedPath = [];
                       for (let pt of originalPath) {
                           translatedPath.push({
                               x: x + (pt.x * scale),
                               y: y + (pt.y * scale)
                           });
                       }
                       translatedPath.meta = { penId };
                       paths.push(translatedPath);
                   });
               });
           }
           rowCount++;
        }

        return paths;
      },
      formula: (p) => `pattern = ${p.patternId}\nscale = ${p.scale}, tile = ${p.tileMethod}`
  };
})();
