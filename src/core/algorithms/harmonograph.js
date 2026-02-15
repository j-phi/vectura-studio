/**
 * harmonograph algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.harmonograph = {
      generate: (p, rng, noise, bounds) => {
        const { width, height } = bounds;
        const cx = width / 2;
        const cy = height / 2;
        const samples = Math.max(200, Math.floor(p.samples ?? 4000));
        const duration = Math.max(1, p.duration ?? 30);
        const scale = p.scale ?? 1;
        const rotSpeed = (p.paperRotation ?? 0) * Math.PI * 2;
        const gapSize = Math.max(0, p.gapSize ?? 0);
        const gapOffset = Math.max(0, p.gapOffset ?? 0);
        const gapRandomness = Math.max(0, Math.min(1, p.gapRandomness ?? 0));
        const widthMultiplier = Math.max(1, Math.round(p.widthMultiplier ?? 1));
        const thickeningMode = p.thickeningMode === 'sinusoidal' ? 'sinusoidal' : 'parallel';
        const loopDrift = p.loopDrift ?? 0;
        const settleThreshold = Math.max(0, p.settleThreshold ?? 0);
        const settleWindow = Math.max(1, Math.floor(p.settleWindow ?? 24));

        const normalizePendulums = () => {
          if (Array.isArray(p.pendulums) && p.pendulums.length) {
            return p.pendulums.map((pend) => ({
              ax: pend.ampX ?? 0,
              ay: pend.ampY ?? 0,
              phaseX: ((pend.phaseX ?? 0) * Math.PI) / 180,
              phaseY: ((pend.phaseY ?? 0) * Math.PI) / 180,
              freq: pend.freq ?? 1,
              micro: pend.micro ?? 0,
              damp: Math.max(0, pend.damp ?? 0),
              enabled: pend.enabled !== false,
            }));
          }
          return [
            {
              ax: p.ampX1 ?? 0,
              ay: p.ampY1 ?? 0,
              phaseX: ((p.phaseX1 ?? 0) * Math.PI) / 180,
              phaseY: ((p.phaseY1 ?? 0) * Math.PI) / 180,
              freq: p.freq1 ?? 1,
              micro: p.micro1 ?? 0,
              damp: Math.max(0, p.damp1 ?? 0),
              enabled: true,
            },
            {
              ax: p.ampX2 ?? 0,
              ay: p.ampY2 ?? 0,
              phaseX: ((p.phaseX2 ?? 0) * Math.PI) / 180,
              phaseY: ((p.phaseY2 ?? 0) * Math.PI) / 180,
              freq: p.freq2 ?? 1,
              micro: p.micro2 ?? 0,
              damp: Math.max(0, p.damp2 ?? 0),
              enabled: true,
            },
            {
              ax: p.ampX3 ?? 0,
              ay: p.ampY3 ?? 0,
              phaseX: ((p.phaseX3 ?? 0) * Math.PI) / 180,
              phaseY: ((p.phaseY3 ?? 0) * Math.PI) / 180,
              freq: p.freq3 ?? 1,
              micro: p.micro3 ?? 0,
              damp: Math.max(0, p.damp3 ?? 0),
              enabled: true,
            },
          ];
        };

        const pendulums = normalizePendulums().filter((pend) => pend.enabled !== false);
        if (!pendulums.length) return [];

        const buildPath = (set, count) => {
          const path = [];
          const localDt = duration / count;
          let settleCount = 0;
          for (let i = 0; i <= count; i++) {
            const t = i * localDt;
            let x = 0;
            let y = 0;
            set.forEach((pend) => {
              const freq = (pend.freq + pend.micro + loopDrift * t) * Math.PI * 2;
              const decay = Math.exp(-pend.damp * t);
              x += pend.ax * Math.sin(freq * t + pend.phaseX) * decay;
              y += pend.ay * Math.sin(freq * t + pend.phaseY) * decay;
            });
            x *= scale;
            y *= scale;
            if (rotSpeed) {
              const ang = rotSpeed * t;
              const rx = x * Math.cos(ang) - y * Math.sin(ang);
              const ry = x * Math.sin(ang) + y * Math.cos(ang);
              x = rx;
              y = ry;
            }
            path.push({ x: cx + x, y: cy + y });
            if (settleThreshold > 0) {
              const mag = Math.hypot(x, y);
              settleCount = mag <= settleThreshold ? settleCount + 1 : 0;
              if (settleCount >= settleWindow) break;
            }
          }
          return path;
        };

        const path = buildPath(pendulums, samples);

        const buildSegmentData = (path) => {
          const segs = [];
          let total = 0;
          for (let i = 1; i < path.length; i++) {
            const a = path[i - 1];
            const b = path[i];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (!len) continue;
            segs.push({ a, b, len, start: total });
            total += len;
          }
          return { segs, total };
        };
        const slicePathByDistance = (data, start, end) => {
          if (end <= start) return null;
          const points = [];
          const pushPoint = (pt) => {
            const last = points[points.length - 1];
            if (!last || last.x !== pt.x || last.y !== pt.y) points.push(pt);
          };
          for (let i = 0; i < data.segs.length; i++) {
            const seg = data.segs[i];
            const segStart = seg.start;
            const segEnd = seg.start + seg.len;
            if (segEnd < start) continue;
            if (segStart > end) break;
            if (start >= segStart && start <= segEnd) {
              const t = (start - segStart) / seg.len;
              pushPoint({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
            } else if (segStart >= start) {
              pushPoint(seg.a);
            }
            if (segEnd <= end) {
              pushPoint(seg.b);
            }
            if (end >= segStart && end <= segEnd) {
              const t = (end - segStart) / seg.len;
              pushPoint({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
              break;
            }
          }
          return points.length > 1 ? points : null;
        };
        const iterateSamples = (data, spacing, offset, randomness, cb) => {
          let cursor = Math.max(0, offset);
          let segIndex = 0;
          const segs = data.segs;
          while (cursor <= data.total && segIndex < segs.length) {
            while (segIndex < segs.length && cursor > segs[segIndex].start + segs[segIndex].len) segIndex += 1;
            if (segIndex >= segs.length) break;
            const seg = segs[segIndex];
            const t = (cursor - seg.start) / seg.len;
            const pt = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
            const tangent = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y };
            cb(pt, tangent);
            const jitter = randomness ? (rng.nextFloat() * 2 - 1) * randomness : 0;
            const step = spacing * (1 + jitter);
            cursor += Math.max(0.1, step);
          }
        };

        const applyThickening = (paths) => {
          if (widthMultiplier <= 1) return paths;
          const spacing = 0.35;
          const offsets = [];
          const half = (widthMultiplier - 1) / 2;
          for (let i = 0; i < widthMultiplier; i++) {
            offsets.push((i - half) * spacing);
          }
          const thickened = [];
          paths.forEach((path) => {
            if (!Array.isArray(path) || path.length < 2) return;
            const normals = path.map((pt, i) => {
              const prev = path[i - 1] || pt;
              const next = path[i + 1] || pt;
              const dx = next.x - prev.x;
              const dy = next.y - prev.y;
              const mag = Math.hypot(dx, dy) || 1;
              return { x: -dy / mag, y: dx / mag };
            });
            const phase = rng.nextFloat() * Math.PI * 2;
            const waveFreq = 2 + widthMultiplier * 0.4;
            const waveAmp = spacing * 0.6;
            const offsetPaths = offsets.map((offset, idx) =>
              path.map((pt, i) => {
                let off = offset;
                if (thickeningMode === 'sinusoidal') {
                  const t = path.length > 1 ? i / (path.length - 1) : 0;
                  off += Math.sin(t * Math.PI * 2 * waveFreq + phase + idx) * waveAmp;
                }
                const n = normals[i] || { x: 0, y: 0 };
                return { x: pt.x + n.x * off, y: pt.y + n.y * off };
              })
            );
            offsetPaths.forEach((op) => thickened.push(op));
          });
          return thickened.length ? thickened : paths;
        };

        const renderMode = p.renderMode || 'line';
        const basePaths = applyThickening([path]);
        if (renderMode === 'points') {
          const points = [];
          const stride = Math.max(1, Math.floor(p.pointStride ?? 4));
          const r = Math.max(0.1, p.pointSize ?? 0.4);
          basePaths.forEach((basePath) => {
            const data = buildSegmentData(basePath);
            const avgStep = data.total / Math.max(1, basePath.length - 1);
            const spacing = Math.max(avgStep, avgStep * stride + gapSize);
            iterateSamples(data, spacing, gapOffset, gapRandomness, (pt) => {
              const circle = [];
              circle.meta = { kind: 'circle', cx: pt.x, cy: pt.y, r };
              points.push(circle);
            });
          });
          if (p.showPendulumGuides) {
            const helperSamples = Math.max(200, Math.floor(samples / 4));
            points.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
          }
          return points;
        }

        if (renderMode === 'segments') {
          const segments = [];
          const stride = Math.max(1, Math.floor(p.segmentStride ?? p.pointStride ?? 6));
          const len = Math.max(0.5, p.segmentLength ?? 6);
          const half = len / 2;
          basePaths.forEach((basePath) => {
            const data = buildSegmentData(basePath);
            const avgStep = data.total / Math.max(1, basePath.length - 1);
            const spacing = Math.max(avgStep, avgStep * stride + gapSize);
            iterateSamples(data, spacing, gapOffset, gapRandomness, (pt, tangent) => {
              const mag = Math.hypot(tangent.x, tangent.y) || 1;
              const ux = tangent.x / mag;
              const uy = tangent.y / mag;
              segments.push([
                { x: pt.x - ux * half, y: pt.y - uy * half },
                { x: pt.x + ux * half, y: pt.y + uy * half },
              ]);
            });
          });
          if (p.showPendulumGuides) {
            const helperSamples = Math.max(200, Math.floor(samples / 4));
            segments.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
          }
          return segments;
        }

        if (renderMode === 'dashed') {
          const segments = [];
          const dash = Math.max(0.5, p.dashLength ?? 4);
          const gap = Math.max(0, p.dashGap ?? 2) + gapSize;
          basePaths.forEach((basePath) => {
            const data = buildSegmentData(basePath);
            let cursor = gapOffset;
            let guard = 0;
            while (cursor < data.total && guard < 100000) {
              const dashEnd = cursor + dash;
              const dashSeg = slicePathByDistance(data, cursor, Math.min(dashEnd, data.total));
              if (dashSeg) segments.push(dashSeg);
              const jitter = gapRandomness ? (rng.nextFloat() * 2 - 1) * gapRandomness : 0;
              const gapLen = Math.max(0.1, gap * (1 + jitter));
              cursor = dashEnd + gapLen;
              guard += 1;
            }
          });
          if (p.showPendulumGuides) {
            const helperSamples = Math.max(200, Math.floor(samples / 4));
            segments.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
          }
          return segments.length ? segments : basePaths;
        }

        const output = basePaths;
        if (p.showPendulumGuides) {
          const helperSamples = Math.max(200, Math.floor(samples / 4));
          output.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
        }
        return output;
      },
      formula: (p) =>
        `x = Σ Aᵢ sin((fᵢ+μᵢ)t + φxᵢ) e^(-dᵢ t)\ny = Σ Bᵢ sin((fᵢ+μᵢ)t + φyᵢ) e^(-dᵢ t)`,
    };
})();
