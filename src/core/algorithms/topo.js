/**
 * topo algorithm definition.
 */
export const topo = {
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
        const noiseScale = p.noiseScale ?? 0.001;
        const noiseOffsetX = p.noiseOffsetX ?? 0;
        const noiseOffsetY = p.noiseOffsetY ?? 0;
        const octaves = Math.max(1, Math.floor(p.octaves ?? 1));
        const lacunarity = p.lacunarity ?? 2.0;
        const gain = p.gain ?? 0.5;
        const sensitivity = Math.max(0.01, p.sensitivity ?? 1);
        const thresholdOffset = p.thresholdOffset ?? 0;
        const noiseType = p.noiseType || 'simplex';
        const levels = Math.max(1, Math.floor(p.levels ?? 10));

        const baseNoise = (x, y) => noise.noise2D(x, y);
        const hash2D = (x, y) => {
          const n = Math.sin(x * 127.1 + y * 311.7 + (p.seed ?? 0) * 0.1) * 43758.5453;
          return n - Math.floor(n);
        };
        const cellularNoise = (x, y) => {
          const xi = Math.floor(x);
          const yi = Math.floor(y);
          let minDist = Infinity;
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const cx = xi + dx + hash2D(xi + dx, yi + dy);
              const cy = yi + dy + hash2D(xi + dx + 7.21, yi + dy + 3.17);
              const dist = Math.hypot(x - cx, y - cy);
              if (dist < minDist) minDist = dist;
            }
          }
          const v = Math.max(0, Math.min(1, 1 - minDist));
          return v * 2 - 1;
        };
        const fbmNoise = (x, y) => {
          let totalNoise = 0;
          let ampNoise = 1;
          let freq = 1;
          let norm = 0;
          for (let i = 0; i < octaves; i++) {
            totalNoise += baseNoise(x * freq, y * freq) * ampNoise;
            norm += ampNoise;
            ampNoise *= gain;
            freq *= lacunarity;
          }
          return norm ? totalNoise / norm : totalNoise;
        };
        const noiseValue = (x, y) => {
          const n = baseNoise(x, y);
          switch (noiseType) {
            case 'ridged':
              return (1 - Math.abs(n)) * 2 - 1;
            case 'billow':
              return Math.abs(n) * 2 - 1;
            case 'turbulence': {
              const n2 = baseNoise(x * 2, y * 2);
              const n3 = baseNoise(x * 4, y * 4);
              const t = (Math.abs(n) + Math.abs(n2) * 0.5 + Math.abs(n3) * 0.25) / 1.75;
              return t * 2 - 1;
            }
            case 'stripes':
              return Math.sin(x * 2 + n * 1.5);
            case 'marble':
              return Math.sin((x + y) * 1.5 + n * 2);
            case 'steps': {
              const t = Math.round(((n + 1) / 2) * 5) / 5;
              return t * 2 - 1;
            }
            case 'triangle': {
              const t = (n + 1) / 2;
              const tri = 1 - Math.abs((t % 1) * 2 - 1);
              return tri * 2 - 1;
            }
            case 'warp':
              return baseNoise(x + n * 1.5, y + n * 1.5);
            case 'cellular':
              return cellularNoise(x, y);
            case 'fbm':
              return fbmNoise(x, y);
            case 'swirl':
              return Math.sin(x * 2 + n * 2) * Math.cos(y * 2 + n);
            case 'radial':
              return Math.sin(Math.hypot(x, y) * 3 + n * 2);
            case 'checker': {
              const cx = Math.floor(x * 4);
              const cy = Math.floor(y * 4);
              return (cx + cy) % 2 === 0 ? 1 : -1;
            }
            case 'zigzag': {
              const t = Math.abs((x * 2) % 2 - 1);
              return (1 - t) * 2 - 1;
            }
            case 'ripple':
              return Math.sin((x + y) * 3 + n * 2);
            case 'spiral': {
              const ang = Math.atan2(y, x);
              const rad = Math.hypot(x, y);
              return Math.sin(ang * 4 + rad * 2 + n);
            }
            case 'grain':
              return hash2D(x * 10, y * 10) * 2 - 1;
            case 'crosshatch':
              return (Math.sin(x * 3) + Math.sin(y * 3)) * 0.5;
            case 'pulse': {
              const t = Math.abs(Math.sin(x * 2 + n) * Math.cos(y * 2 + n));
              return t * 2 - 1;
            }
            default:
              return n;
          }
        };

        const field = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (let y = 0; y <= rows; y++) {
          for (let x = 0; x <= cols; x++) {
            const wx = left + x * cellW;
            const wy = top + y * cellH;
            const nx = (wx + noiseOffsetX) * noiseScale;
            const ny = (wy + noiseOffsetY) * noiseScale;
            let v = noiseValue(nx, ny);
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

        const smoothPath = (path, iterations = 1) => {
          let pts = path.slice();
          for (let iter = 0; iter < iterations; iter++) {
            const next = [];
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i + 1];
              const q = { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 };
              const r = { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 };
              next.push(q, r);
            }
            pts = next;
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
            let next = path;
            if (p.mappingMode === 'smooth') next = smoothPath(path, 1);
            if (p.mappingMode === 'bezier') next = smoothPath(path, 2);
            paths.push(next);
          });
        });

        return paths;
      },
      formula: (p) =>
        `field = noise(x*${p.noiseScale}, y*${p.noiseScale})\ncontours = marchingSquares(field, ${p.levels})`,
    };
