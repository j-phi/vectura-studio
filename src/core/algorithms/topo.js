/**
 * topo algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.topo = {
      generate: (p, rng, noise, bounds) => {
        const { m, width, height } = bounds;
        const inset = bounds.truncate ? m : 0;
        const left = inset;
        const top = inset;
        const w = width - inset * 2;
        const h = height - inset * 2;
        const res = Math.max(20, Math.floor(p.resolution ?? 120));
        const cols = res;
        const rows = res;
        const cellW = w / cols;
        const cellH = h / rows;
        const sensitivity = Math.max(0.01, p.sensitivity ?? 1);
        const thresholdOffset = p.thresholdOffset ?? 0;
        const levels = Math.max(1, Math.floor(p.levels ?? 10));
        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
        const frac = (v) => v - Math.floor(v);
        const applyPad = (t, pad) => {
          if (pad <= 0) return t;
          const span = 1 - pad * 2;
          if (span <= 0) return 0.5;
          return Math.max(0, Math.min(1, (t - pad) / span));
        };
        const applyTile = (nx, ny, mode, padding = 0) => {
          const pad = Math.max(0, Math.min(0.45, padding));
          switch (mode) {
            case 'brick': { const row = Math.floor(ny); return { x: applyPad(frac(nx + (row % 2) * 0.5), pad), y: applyPad(frac(ny), pad) }; }
            case 'hex': { const hy = ny / 0.866; const row = Math.floor(hy); return { x: applyPad(frac(nx + (row % 2) * 0.5), pad), y: applyPad(frac(hy), pad) }; }
            case 'diamond': { const ax = nx + ny; const ay = -nx + ny; return { x: applyPad(frac(ax), pad), y: applyPad(frac(ay), pad) }; }
            case 'triangle': { let fx = frac(nx); let fy = frac(ny); if (fx + fy > 1) { fx = 1 - fx; fy = 1 - fy; } return { x: applyPad(fx, pad), y: applyPad(fy, pad) }; }
            case 'offset': { const col = Math.floor(nx); return { x: applyPad(frac(nx), pad), y: applyPad(frac(ny + (col % 2) * 0.5), pad) }; }
            case 'radial': { const r = Math.hypot(nx, ny); const a = Math.atan2(ny, nx) / (Math.PI * 2) + 0.5; return { x: applyPad(frac(r), pad) * Math.cos(applyPad(frac(a), pad) * Math.PI * 2), y: applyPad(frac(r), pad) * Math.sin(applyPad(frac(a), pad) * Math.PI * 2) }; }
            case 'checker': { const cx = Math.floor(nx); const cy = Math.floor(ny); let fx = frac(nx); if ((cx + cy) % 2 !== 0) fx = 1 - fx; return { x: applyPad(fx, pad), y: applyPad(frac(ny), pad) }; }
            case 'wave': { return { x: applyPad(frac(nx + Math.sin(ny * Math.PI * 2) * 0.1), pad), y: applyPad(frac(ny + Math.sin(nx * Math.PI * 2) * 0.1), pad) }; }
            case 'grid':
            default: return { x: applyPad(frac(nx), pad), y: applyPad(frac(ny), pad) };
          }
        };

        const legacyNoise = {
          type: p.noiseType || 'simplex',
          blend: 'add',
          amplitude: 1,
          zoom: p.noiseScale ?? 0.003,
          freq: 1,
          angle: 0,
          shiftX: p.noiseOffsetX ?? 0,
          shiftY: p.noiseOffsetY ?? 0,
          tileMode: 'off',
          tilePadding: 0,
          patternScale: 1,
          warpStrength: 1,
          cellularScale: 1,
          cellularJitter: 1,
          stepsCount: 5,
          seed: 0,
          octaves: p.octaves ?? 3,
          lacunarity: p.lacunarity ?? 2.0,
          gain: p.gain ?? 0.5,
          noiseStyle: 'linear',
          noiseThreshold: 0,
          imageWidth: 1,
          imageHeight: 1,
          microFreq: 0,
          imageInvertColor: false,
          imageInvertOpacity: false,
          imageId: p.noiseImageId || '',
          imageName: p.noiseImageName || '',
          imagePreview: '',
          imageAlgo: p.imageAlgo || 'luma',
          imageEffects: [],
          polygonRadius: 2,
          polygonSides: 6,
          polygonRotation: 0,
          polygonOutline: 0,
          polygonEdgeRadius: 0,
        };

        const noiseLayers = (Array.isArray(p.noises) && p.noises.length ? p.noises : [legacyNoise])
          .map((noiseLayer) => ({
            ...legacyNoise,
            ...(noiseLayer || {}),
            enabled: noiseLayer?.enabled !== false,
          }))
          .filter((noiseLayer) => noiseLayer.enabled !== false);

        const maxAmp = noiseLayers.reduce((sum, noiseLayer) => sum + Math.abs(noiseLayer.amplitude ?? 0), 0) || 1;

        const sampleFieldNoise = (worldX, worldY) => {
          let combined;
          noiseLayers.forEach((noiseLayer) => {
            const zoom = Math.max(0.0001, noiseLayer.zoom ?? 0.003);
            const freq = Math.max(0.05, noiseLayer.freq ?? 1);
            const angle = ((noiseLayer.angle ?? 0) * Math.PI) / 180;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const shiftX = noiseLayer.shiftX ?? 0;
            const shiftY = noiseLayer.shiftY ?? 0;
            const dx = worldX - width / 2 + shiftX;
            const dy = worldY - height / 2 + shiftY;
            const rx = dx * cosA - dy * sinA;
            const ry = dx * sinA + dy * cosA;
            const tileMode = noiseLayer.tileMode || 'off';
            const tilePadding = noiseLayer.tilePadding ?? 0;
            let sampleX;
            let sampleY;
            if (noiseLayer.type === 'image' && tileMode === 'off') {
              const u = (worldX - inset + shiftX) / Math.max(1, w) - 0.5;
              const v = (worldY - inset + shiftY) / Math.max(1, h) - 0.5;
              sampleX = u / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1);
              sampleY = v / Math.max(0.05, noiseLayer.imageHeight ?? 1);
            } else {
              const centeredX = noiseLayer.type === 'polygon' ? worldX - (inset + w * 0.5) : worldX;
              const centeredY = noiseLayer.type === 'polygon' ? worldY - (inset + h * 0.5) : worldY;
              const dx2 = centeredX * cosA - centeredY * sinA + shiftX;
              const dy2 = centeredX * sinA + centeredY * cosA + shiftY;
              const widthScale =
                noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageWidth ?? freq ?? 1) : freq;
              const heightScale =
                noiseLayer.type === 'image' ? 1 / Math.max(0.05, noiseLayer.imageHeight ?? 1) : 1;
              sampleX = dx2 * zoom * widthScale;
              sampleY = dy2 * zoom * heightScale;
              if (tileMode !== 'off') {
                const tiled = applyTile(sampleX, sampleY, tileMode, tilePadding);
                sampleX = tiled.x;
                sampleY = tiled.y;
                if (noiseLayer.type === 'polygon') { sampleX = (tiled.x - 0.5) * 2; sampleY = (tiled.y - 0.5) * 2; }
              }
            }
            const value = rack.evaluate(sampleX, sampleY, noiseLayer, { worldX, worldY }) * (noiseLayer.amplitude ?? 1);
            combined = window.Vectura.NoiseRack.combineBlend({
              combined,
              value,
              blend: noiseLayer.blend || 'add',
              maxAmplitude: maxAmp,
            });
          });
          return combined ?? 0;
        };

        const field = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (let y = 0; y <= rows; y++) {
          for (let x = 0; x <= cols; x++) {
            const wx = left + x * cellW;
            const wy = top + y * cellH;
            let v = sampleFieldNoise(wx, wy);
            v = Math.sign(v) * Math.pow(Math.abs(v), 1 / sensitivity);
            field[y][x] = v;
            minVal = Math.min(minVal, v);
            maxVal = Math.max(maxVal, v);
          }
        }

        const thresholds = [];
        const span = maxVal - minVal || 1;
        for (let i = 1; i <= levels; i++) {
          const t = minVal + (i / (levels + 1)) * span + thresholdOffset;
          thresholds.push(t);
        }

        const interp = (p1, p2, v1, v2, t) => {
          const denom = v2 - v1 || 1e-6;
          const ratio = (t - v1) / denom;
          return { x: p1.x + (p2.x - p1.x) * ratio, y: p1.y + (p2.y - p1.y) * ratio };
        };

        const sampleField = (x, y) => {
          const gx = Math.max(0, Math.min(cols, (x - left) / cellW));
          const gy = Math.max(0, Math.min(rows, (y - top) / cellH));
          const x0 = Math.floor(gx);
          const y0 = Math.floor(gy);
          const x1 = Math.min(cols, x0 + 1);
          const y1 = Math.min(rows, y0 + 1);
          const tx = gx - x0;
          const ty = gy - y0;
          const v00 = field[y0][x0];
          const v10 = field[y0][x1];
          const v01 = field[y1][x0];
          const v11 = field[y1][x1];
          const vx0 = v00 + (v10 - v00) * tx;
          const vx1 = v01 + (v11 - v01) * tx;
          return vx0 + (vx1 - vx0) * ty;
        };

        const refineByGradient = (pt, threshold) => {
          const hStep = Math.min(cellW, cellH) * 0.5;
          const fx = (sampleField(pt.x + hStep, pt.y) - sampleField(pt.x - hStep, pt.y)) / (2 * hStep);
          const fy = (sampleField(pt.x, pt.y + hStep) - sampleField(pt.x, pt.y - hStep)) / (2 * hStep);
          const denom = fx * fx + fy * fy + 1e-6;
          const diff = sampleField(pt.x, pt.y) - threshold;
          return { x: pt.x - (diff * fx) / denom, y: pt.y - (diff * fy) / denom };
        };

        const pointKey = (pt) => `${(pt?.x ?? 0).toFixed(3)},${(pt?.y ?? 0).toFixed(3)}`;
        const isClosedPath = (path) =>
          Array.isArray(path) && path.length > 2 && pointKey(path[0]) === pointKey(path[path.length - 1]);
        const ensureClosedPath = (path) => {
          if (!Array.isArray(path) || path.length < 2) return path;
          const next = path.slice();
          if (isClosedPath(next)) {
            const first = next[0];
            next[next.length - 1] = { x: first.x, y: first.y };
            return next;
          }
          const first = next[0];
          next.push({ x: first.x, y: first.y });
          return next;
        };

        const smoothPath = (path, iterations = 1, closed = false) => {
          let pts = path.slice();
          if (closed && pts.length > 1 && isClosedPath(pts)) {
            pts = pts.slice(0, -1);
          }
          for (let iter = 0; iter < iterations; iter++) {
            if (pts.length < 2) break;
            const next = [];
            if (closed) {
              for (let i = 0; i < pts.length; i++) {
                const p0 = pts[i];
                const p1 = pts[(i + 1) % pts.length];
                const q = { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 };
                const r = { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 };
                next.push(q, r);
              }
            } else {
              for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[i];
                const p1 = pts[i + 1];
                const q = { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 };
                const r = { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 };
                next.push(q, r);
              }
            }
            pts = next;
          }
          if (closed && pts.length > 2) {
            pts.push({ x: pts[0].x, y: pts[0].y });
          }
          return pts;
        };

        const linkSegments = (segments) => {
          const key = (pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`;
          const map = new Map();
          segments.forEach((seg, idx) => {
            const k0 = key(seg[0]);
            const k1 = key(seg[1]);
            if (!map.has(k0)) map.set(k0, []);
            if (!map.has(k1)) map.set(k1, []);
            map.get(k0).push({ idx, end: 0 });
            map.get(k1).push({ idx, end: 1 });
          });
          const used = new Set();
          const paths = [];
          segments.forEach((seg, idx) => {
            if (used.has(idx)) return;
            used.add(idx);
            const path = [seg[0], seg[1]];
            let extended = true;
            while (extended) {
              extended = false;
              const endKey = key(path[path.length - 1]);
              const matches = map.get(endKey) || [];
              const nextMatch = matches.find((m) => !used.has(m.idx));
              if (nextMatch) {
                used.add(nextMatch.idx);
                const nextSeg = segments[nextMatch.idx];
                const nextPt = nextMatch.end === 0 ? nextSeg[1] : nextSeg[0];
                path.push(nextPt);
                extended = true;
              }
              const startKey = key(path[0]);
              const matchesStart = map.get(startKey) || [];
              const prevMatch = matchesStart.find((m) => !used.has(m.idx));
              if (prevMatch) {
                used.add(prevMatch.idx);
                const prevSeg = segments[prevMatch.idx];
                const prevPt = prevMatch.end === 0 ? prevSeg[1] : prevSeg[0];
                path.unshift(prevPt);
                extended = true;
              }
            }
            paths.push(path);
          });
          return paths;
        };

        const cases = {
          1: [[3, 0]],
          2: [[0, 1]],
          3: [[3, 1]],
          4: [[1, 2]],
          5: [[3, 2], [0, 1]],
          6: [[0, 2]],
          7: [[3, 2]],
          8: [[2, 3]],
          9: [[0, 2]],
          10: [[0, 3], [1, 2]],
          11: [[1, 2]],
          12: [[1, 3]],
          13: [[0, 1]],
          14: [[3, 0]],
        };

        const paths = [];
        thresholds.forEach((threshold) => {
          const segments = [];
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const v0 = field[y][x];
              const v1 = field[y][x + 1];
              const v2 = field[y + 1][x + 1];
              const v3 = field[y + 1][x];
              const p0 = { x: left + x * cellW, y: top + y * cellH };
              const p1 = { x: left + (x + 1) * cellW, y: top + y * cellH };
              const p2 = { x: left + (x + 1) * cellW, y: top + (y + 1) * cellH };
              const p3 = { x: left + x * cellW, y: top + (y + 1) * cellH };
              const c0 = v0 > threshold ? 1 : 0;
              const c1 = v1 > threshold ? 1 : 0;
              const c2 = v2 > threshold ? 1 : 0;
              const c3 = v3 > threshold ? 1 : 0;
              const idx = c0 | (c1 << 1) | (c2 << 2) | (c3 << 3);
              if (idx === 0 || idx === 15) continue;
              let edges = cases[idx];
              if (idx === 5 || idx === 10) {
                const center = (v0 + v1 + v2 + v3) / 4;
                if (idx === 5) edges = center > threshold ? [[3, 0], [1, 2]] : [[3, 2], [0, 1]];
                if (idx === 10) edges = center > threshold ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
              }
              edges.forEach(([e0, e1]) => {
                const edgePoint = (edge) => {
                  switch (edge) {
                    case 0:
                      return interp(p0, p1, v0, v1, threshold);
                    case 1:
                      return interp(p1, p2, v1, v2, threshold);
                    case 2:
                      return interp(p2, p3, v2, v3, threshold);
                    case 3:
                      return interp(p3, p0, v3, v0, threshold);
                    default:
                      return p0;
                  }
                };
                let a = edgePoint(e0);
                let b = edgePoint(e1);
                if (p.mappingMode === 'gradient') {
                  a = refineByGradient(a, threshold);
                  b = refineByGradient(b, threshold);
                }
                segments.push([a, b]);
              });
            }
          }
          const linked = linkSegments(segments);
          linked.forEach((path) => {
            if (path.length < 2) return;
            const closed = isClosedPath(path);
            let next = path;
            if (p.mappingMode === 'smooth') next = smoothPath(path, 1, closed);
            if (p.mappingMode === 'bezier') next = smoothPath(path, 2, closed);
            if (closed) next = ensureClosedPath(next);
            paths.push(next);
          });
        });

        return paths;
      },
      formula: (p) =>
        `field = Σ Noise Rack layers over x,y\ncontours = marchingSquares(field, ${p.levels})\nmapping = ${p.mappingMode || 'marching'}`,
    };
})();
