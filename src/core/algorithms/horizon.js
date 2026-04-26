/**
 * horizon algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.horizon = {
    generate: (p, rng, noise, bounds) => {
      const { m, width, height } = bounds;
      const inset = bounds.truncate ? m : 0;
      const innerW = width - inset * 2;
      const innerH = height - inset * 2;
      if (innerW < 1 || innerH < 1) return [];

      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const lerp = (a, b, t) => a + (b - a) * t;
      const EPS = 1e-9;

      // --- Geometry ---
      const horizonT = clamp01((p.horizonHeight ?? 50) / 100);
      const horizonY = inset + innerH * horizonT;
      const vpX = inset + innerW * clamp01((p.vanishingPointX ?? 50) / 100);
      const groundBottom = inset + innerH;
      const rowSpan = Math.max(1, groundBottom - horizonY);
      const fanReach = Math.max(0, (p.fanReach ?? 42) / 100);
      const fanBottomY = groundBottom + fanReach * innerH;

      // --- Line counts ---
      const N_h = Math.max(1, Math.floor(p.horizontalLines ?? 58));
      const N_v = p.linkDensities ? N_h : Math.max(0, Math.floor(p.convergenceLines ?? 58));

      // --- Spacing ---
      const depthExp = 0.4 + clamp01((p.depthCompression ?? 70) / 100) * 3.0;

      const applyRowSpacing = (t_raw) => {
        const mode = p.horizontalSpacingMode || 'perspective';
        if (mode === 'perspective') {
          return t_raw <= 0 ? 0 : t_raw >= 1 ? 1 : Math.pow(t_raw, depthExp);
        }
        if (mode === 'bias') {
          const exp = Math.max(0.1, 1 + (p.horizontalSpacingBias ?? 0) / 100);
          return t_raw <= 0 ? 0 : t_raw >= 1 ? 1 : Math.pow(t_raw, exp);
        }
        return t_raw;
      };

      const getFanBottomX = (t_raw) => {
        const mode = p.convergenceSpacingMode || 'even';
        const tExtend = rowSpan > EPS ? (fanBottomY - horizonY) / rowSpan : 1;
        let groundX;
        if (mode === 'perspective') {
          const leftA  = Math.atan2(vpX - inset,          Math.max(1, rowSpan));
          const rightA = Math.atan2(inset + innerW - vpX, Math.max(1, rowSpan));
          const a = lerp(-leftA, rightA, t_raw);
          groundX = vpX + Math.tan(a) * rowSpan;
        } else if (mode === 'bias') {
          const x = t_raw * 2 - 1;
          const exp = Math.max(0.1, 1 + (p.convergenceSpacingBias ?? 0) / 100);
          const mapped = x === 0 ? 0 : Math.sign(x) * Math.pow(Math.abs(x), exp);
          groundX = vpX + mapped * (innerW / 2);
        } else {
          groundX = inset + t_raw * innerW;
        }
        return vpX + tExtend * (groundX - vpX);
      };

      // --- Noise rack ---
      const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
      const defaultLayer = {
        id: 'noise-1', enabled: true, type: 'simplex', blend: 'add',
        amplitude: 9, zoom: 0.02, freq: 1.0, angle: 0, shiftX: 0, shiftY: 0,
        tileMode: 'off', tilePadding: 0, patternScale: 1, warpStrength: 1,
        cellularScale: 1, cellularJitter: 1, stepsCount: 5, seed: 0,
        noiseStyle: 'linear', noiseThreshold: 0, imageWidth: 1, imageHeight: 1,
        microFreq: 0, imageInvertColor: false, imageInvertOpacity: false,
        imageId: '', imageName: '', imagePreview: '', imageAlgo: 'luma',
        imageEffects: [], polygonZoomReference: 0.02, polygonRadius: 2,
        polygonSides: 6, polygonRotation: 0, polygonOutline: 0, polygonEdgeRadius: 0,
      };

      const noiseStack = (Array.isArray(p.noises) && p.noises.length ? p.noises : [defaultLayer])
        .map((layer) => ({ ...defaultLayer, ...(layer || {}), enabled: layer?.enabled !== false }))
        .filter((layer) => layer.enabled !== false);

      const maxAmp = noiseStack.reduce((s, l) => s + Math.abs(l.amplitude ?? 0), 0) || 1;

      const noiseSamplers = noiseStack.map((layer) => {
        const a = ((layer.angle ?? 0) * Math.PI) / 180;
        const cosA = Math.cos(a);
        const sinA = Math.sin(a);
        const zoom = window.Vectura.NoiseRack.resolveEffectiveZoom(layer, defaultLayer.zoom);
        const freq = layer.freq ?? 1;
        const shiftX = (layer.shiftX ?? 0) * innerW * 0.5;
        const shiftY = (layer.shiftY ?? 0) * innerH * 0.5;
        return {
          blend: layer.blend || 'add',
          amplitude: layer.amplitude ?? 0,
          sample: (wx, wy) => {
            const nx = (wx + shiftX) * zoom * freq;
            const ny = (wy + shiftY) * zoom;
            return rack.evaluate(nx * cosA - ny * sinA, nx * sinA + ny * cosA, layer, { worldX: wx, worldY: wy });
          },
        };
      });

      const sampleNoise = (wx, wy) => {
        let combined;
        noiseSamplers.forEach((s) => {
          const value = s.sample(wx, wy) * s.amplitude;
          combined = window.Vectura.NoiseRack.combineBlend({ combined, value, blend: s.blend, maxAmplitude: maxAmp });
        });
        return combined ?? 0;
      };

      // --- Terrain ---
      const skylineRelief = clamp01((p.skylineRelief ?? 22) / 100);
      const terrainHeight = clamp01((p.terrainHeight ?? 50) / 100);
      const floorN = clamp01((p.floorHeight ?? 0) / 100);
      const centerWidthN = Math.max(0.05, (p.centerWidth ?? 28) / 100);
      const centerDepthN = clamp01((p.centerDepth ?? 0) / 100);
      const corridorSoftnessN = clamp01((p.corridorSoftness ?? 0) / 100);
      const shoulderLiftN = clamp01((p.shoulderLift ?? 0) / 100);
      const shoulderCurveN = clamp01((p.shoulderCurve ?? 0) / 100);
      const ridgeSharpnessN = clamp01((p.ridgeSharpness ?? 0) / 100);
      const valleyExp = Math.max(0.5, 1 + (p.valleyProfile ?? 0) / 50);
      const symmetryBlendN = clamp01((p.symmetryBlend ?? 0) / 100);

      const centerProfile = (wx) => {
        const xAbs = Math.abs((wx - vpX) / (innerW * 0.5 + 1e-6));
        const gauss = Math.exp(-0.5 * Math.pow(xAbs / centerWidthN, 2 * valleyExp));
        const hard = xAbs <= centerWidthN ? 1 : 0;
        const corridor = lerp(gauss, hard, corridorSoftnessN);
        const shoulder = Math.pow(1 - corridor, 1 + shoulderCurveN * 3);
        const ridgePeakW = Math.max(0.05, centerWidthN * 0.3);
        const ridgePeak = Math.exp(-0.5 * Math.pow((xAbs - centerWidthN) / ridgePeakW, 2));
        return -centerDepthN * corridor + shoulderLiftN * shoulder + ridgeSharpnessN * ridgePeak;
      };

      const displace = (wx, wy, depthNorm) => {
        let nv = sampleNoise(wx, wy);
        if (symmetryBlendN > 0) nv = lerp(nv, sampleNoise(2 * vpX - wx, wy), symmetryBlendN);
        const ampScale = lerp(skylineRelief, 1, depthNorm);
        let dy = wy - nv * ampScale + centerProfile(wx) * terrainHeight * innerH * 0.5;
        if (floorN > 0) dy = Math.min(dy, groundBottom - floorN * rowSpan);
        return Math.max(dy, horizonY);
      };

      // --- Displaced rows (index 0 = at horizon, index N_h-1 = near) ---
      const pts = Math.max(2, Math.floor(innerW / 2));
      const xPos = Array.from({ length: pts }, (_, j) => inset + (j / (pts - 1)) * innerW);
      const displacedRows = [];

      for (let i = 0; i < N_h; i++) {
        const t_raw = N_h === 1 ? 0.5 : i / (N_h - 1);
        const t = applyRowSpacing(t_raw);
        const rowY = horizonY + t * rowSpan;
        displacedRows.push(xPos.map((wx) => ({ x: wx, y: displace(wx, rowY, t) })));
      }

      // --- Occlusion: process near→far, track per-column min-Y envelope ---
      const envelope = new Float64Array(pts).fill(groundBottom + 1);
      const paths = [];

      const clipRow = (row, env) => {
        const segs = [];
        let cur = null;
        for (let j = 0; j < row.length - 1; j++) {
          const r1 = row[j], r2 = row[j + 1];
          const e1 = env[j], e2 = env[j + 1];
          const v1 = r1.y < e1;
          const v2 = r2.y < e2;
          if (v1 && v2) {
            if (!cur) cur = [r1];
            cur.push(r2);
          } else if (!v1 && !v2) {
            if (cur) { if (cur.length >= 2) segs.push(cur); cur = null; }
          } else {
            // Crossing: intersect row segment with envelope segment
            const dR = r2.y - r1.y, dE = e2 - e1;
            const den = dR - dE;
            let ix = null;
            if (Math.abs(den) > EPS) {
              const tHit = (e1 - r1.y) / den;
              if (tHit > EPS && tHit < 1 - EPS) {
                ix = { x: r1.x + tHit * (r2.x - r1.x), y: r1.y + tHit * dR };
              }
            }
            if (v1) {
              if (!cur) cur = [r1];
              if (ix) cur.push(ix);
              if (cur.length >= 2) segs.push(cur);
              cur = null;
            } else {
              if (cur) { if (cur.length >= 2) segs.push(cur); cur = null; }
              cur = ix ? [ix, r2] : null;
            }
          }
        }
        if (cur && cur.length >= 2) segs.push(cur);
        return segs;
      };

      for (let i = displacedRows.length - 1; i >= 0; i--) {
        const row = displacedRows[i];
        paths.push(...clipRow(row, envelope));
        for (let j = 0; j < pts; j++) {
          if (row[j].y < envelope[j]) envelope[j] = row[j].y;
        }
      }

      // --- Convergence line occlusion: intersect against envelope polyline ---
      const segHit = (ax, ay, bx, by, cx, cy, dx, dy) => {
        const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
        if (Math.abs(den) < EPS) return null;
        const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
        const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
        if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
        return { t: Math.max(0, Math.min(1, t)), x: ax + t * (bx - ax), y: ay + t * (by - ay) };
      };

      const envAtX = (x) => {
        if (x <= xPos[0]) return envelope[0];
        if (x >= xPos[pts - 1]) return envelope[pts - 1];
        const span = innerW / (pts - 1);
        const j = Math.min(pts - 2, Math.floor((x - xPos[0]) / span));
        return lerp(envelope[j], envelope[j + 1], (x - xPos[j]) / (xPos[j + 1] - xPos[j]));
      };

      const clipFanLine = (topX, topY, botX, botY) => {
        const hits = [{ t: 0, x: topX, y: topY }, { t: 1, x: botX, y: botY }];
        for (let j = 0; j < pts - 1; j++) {
          const h = segHit(topX, topY, botX, botY, xPos[j], envelope[j], xPos[j + 1], envelope[j + 1]);
          if (h && !hits.some((e) => Math.abs(e.t - h.t) < EPS * 1e6)) hits.push(h);
        }
        hits.sort((a, b) => a.t - b.t);
        const result = [];
        let cur = null;
        for (let k = 0; k < hits.length - 1; k++) {
          const s = hits[k], e = hits[k + 1];
          if (e.t - s.t < EPS * 1e6) continue;
          const midT = (s.t + e.t) / 2;
          const midY = topY + midT * (botY - topY);
          const midX = topX + midT * (botX - topX);
          if (midY > envAtX(midX)) {
            if (!cur) cur = [{ x: s.x, y: s.y }];
            cur.push({ x: e.x, y: e.y });
          } else {
            if (cur && cur.length >= 2) result.push(cur);
            cur = null;
          }
        }
        if (cur && cur.length >= 2) result.push(cur);
        return result;
      };

      for (let i = 0; i < N_v; i++) {
        const t_raw = N_v === 1 ? 0.5 : i / (N_v - 1);
        paths.push(...clipFanLine(vpX, horizonY, getFanBottomX(t_raw), fanBottomY));
      }

      // --- Mask polygon: terrain silhouette to canvas bottom ---
      paths.maskPolygons = [[
        ...xPos.map((x, j) => ({ x, y: envelope[j] })),
        { x: xPos[pts - 1], y: groundBottom },
        { x: xPos[0], y: groundBottom },
      ]];

      return paths;
    },

    formula: (p) =>
      `VP = (${Math.round(p.vanishingPointX ?? 50)}%, ${Math.round(p.horizonHeight ?? 50)}%)\nrows = ${p.horizontalLines ?? 58} · fan = ${p.convergenceLines ?? 58}\ny = rowBase − noise(x, y) · depth`,
  };
})();
