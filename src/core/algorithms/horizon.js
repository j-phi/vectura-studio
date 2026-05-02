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
      // terrainDepth: 0 = rows clustered at horizon (steep perspective compression);
      // 100 = rows pushed densely toward the viewer (gentle compression).
      const terrainDepthN = clamp01((p.terrainDepth ?? 30) / 100);
      const depthExp = 0.4 + (1 - terrainDepthN) * 3.0;

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
        const cornerL = Math.atan2(vpX - inset,          Math.max(1, rowSpan));
        const cornerR = Math.atan2(inset + innerW - vpX,  Math.max(1, rowSpan));

        if (mode === 'perspective') {
          const a = lerp(-cornerL, cornerR, t_raw);
          return vpX + Math.tan(a) * (fanBottomY - horizonY);
        }

        // exitFrac = fraction of rowSpan where outermost line exits the side wall.
        // Non-linear curve: subtle effect over [0, 0.5], dramatic over [0.5, 1].
        // f(0)=1 (corners), f(0.5)≈0.98 (just above corners), f(1)=0 (near horizon).
        const exitFrac = 1 - Math.pow(fanReach, 6);
        const maxL = Math.atan2(vpX - inset,          Math.max(0.5, exitFrac * rowSpan));
        const maxR = Math.atan2(inset + innerW - vpX,  Math.max(0.5, exitFrac * rowSpan));

        if (mode === 'bias') {
          const x = t_raw * 2 - 1;
          const exp = Math.max(0.1, 1 + (p.convergenceSpacingBias ?? 0) / 100);
          const mapped = x === 0 ? 0 : Math.sign(x) * Math.pow(Math.abs(x), exp);
          const a = lerp(-maxL, maxR, (mapped + 1) / 2);
          return vpX + Math.tan(a) * (fanBottomY - horizonY);
        }

        const a = lerp(-maxL, maxR, t_raw);
        return vpX + Math.tan(a) * (fanBottomY - horizonY);
      };

      // --- Terrain noise master toggle ---
      const terrainNoiseEnabled = p.terrainNoiseEnabled === true;

      // --- Noise rack (additional noises, layered on top of mountain) ---
      const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
      const defaultLayer = {
        id: 'noise-1', enabled: true, type: 'simplex', blend: 'add',
        amplitude: 0, zoom: 0.02, freq: 1.0, angle: 0, shiftX: 0, shiftY: 0,
        tileMode: 'off', tilePadding: 0, patternScale: 1, warpStrength: 1,
        cellularScale: 1, cellularJitter: 1, stepsCount: 5, seed: 0,
        noiseStyle: 'linear', noiseThreshold: 0, imageWidth: 1, imageHeight: 1,
        microFreq: 0, imageInvertColor: false, imageInvertOpacity: false,
        imageId: '', imageName: '', imagePreview: '', imageAlgo: 'luma',
        imageEffects: [], polygonZoomReference: 0.02, polygonRadius: 2,
        polygonSides: 6, polygonRotation: 0, polygonOutline: 0, polygonEdgeRadius: 0,
      };

      const noiseStack = (Array.isArray(p.noises) && p.noises.length ? p.noises : [])
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

      const sampleRackNoise = (wx, wy) => {
        if (!noiseSamplers.length) return 0;
        let combined;
        noiseSamplers.forEach((s) => {
          const value = s.sample(wx, wy) * s.amplitude;
          combined = window.Vectura.NoiseRack.combineBlend({ combined, value, blend: s.blend, maxAmplitude: maxAmp });
        });
        return combined ?? 0;
      };

      // --- Built-in mountain surface noise (single-knob: amplitude only) ---
      const mountainAmpRaw = Math.max(0, p.mountainAmplitude ?? 5);
      const mountainAmpMm = mountainAmpRaw * 6;
      const MOUNTAIN_ZOOM = 0.025;   // = 0.005 + 0.40 * 0.05 (legacy default)
      const MOUNTAIN_FREQ = 1.0;
      const mountainLayer = {
        ...defaultLayer,
        id: 'horizon-mountain', type: 'simplex', blend: 'add',
        amplitude: 1, zoom: MOUNTAIN_ZOOM, freq: MOUNTAIN_FREQ,
        seed: p.seed ?? 0,
      };
      // Y-coherence = 0 → every row samples the same mountain X-profile, so rows
      // stack as a draped wireframe of one underlying surface (vertical-translation
      // copies). Per-row amplitude still varies with `skylineRelief`.
      const MOUNTAIN_Y_COHERENCE = 0;
      const sampleMountain = (wx, wy) => {
        const anchoredY = horizonY + (wy - horizonY) * MOUNTAIN_Y_COHERENCE;
        const nx = wx * MOUNTAIN_ZOOM * MOUNTAIN_FREQ;
        const ny = anchoredY * MOUNTAIN_ZOOM * MOUNTAIN_FREQ;
        return rack.evaluate(nx, ny, mountainLayer, { worldX: wx, worldY: wy });
      };

      // --- Unified Center Region: shared geometry drives both the heightfield
      //     center profile and the noise mask. One Width, one Edge Softness,
      //     one Compress at Horizon — plus per-effect strengths.
      const centerWidthN          = Math.max(0.05, (p.centerWidth ?? 28) / 100);
      const centerSoftnessN       = clamp01((p.centerSoftness ?? 50) / 100);
      const centerCompressN       = clamp01((p.centerCompress ?? 0) / 100);
      const centerDepthN          = clamp01((p.centerDepth ?? 0) / 100);
      const shoulderLiftN         = clamp01((p.shoulderLift ?? 0) / 100);
      const ridgeSharpnessN       = clamp01((p.ridgeSharpness ?? 0) / 100);
      const centerNoiseDampeningN = clamp01((p.centerNoiseDampening ?? 60) / 100);

      // Single softness slider drives all the legacy curve/falloff knobs.
      // softness=0 → hard edges, sharp valley, steep shoulder, sharp falloff.
      // softness=100 → fully Gaussian edges, rounded valley, gentle shoulder, slow falloff.
      const softInv          = 1 - centerSoftnessN;
      const cornerHardness   = softInv;
      const valleyExp        = 0.5 + softInv * 2.5;
      const shoulderExp      = 1 + softInv * 3;
      const dampenFalloffExp = 0.4 + softInv * 3.0;
      const maskGaussianMix  = centerSoftnessN;

      const widthAt = (depthFrac) => {
        const widthScale = lerp(1 - centerCompressN, 1, depthFrac);
        return Math.max(1e-4, centerWidthN * widthScale);
      };

      const centerProfile = (wx, depthFrac) => {
        const w = widthAt(depthFrac);
        const xAbs = Math.abs((wx - vpX) / (innerW * 0.5 + 1e-6));
        const gauss = Math.exp(-0.5 * Math.pow(xAbs / w, 2 * valleyExp));
        const hard = xAbs <= w ? 1 : 0;
        const corridor = lerp(gauss, hard, cornerHardness);
        const shoulder = Math.pow(1 - corridor, shoulderExp);
        const ridgeW = Math.max(0.05, w * 0.3);
        const ridgePeak = Math.exp(-0.5 * Math.pow((xAbs - w) / ridgeW, 2));
        return centerDepthN * corridor - shoulderLiftN * shoulder - ridgeSharpnessN * ridgePeak;
      };

      const dampen = (wx, wy) => {
        if (centerNoiseDampeningN <= 0) return 1;
        const depthFrac = clamp01((wy - horizonY) / rowSpan);
        const w = widthAt(depthFrac);
        const xAbs = Math.abs((wx - vpX) / (innerW * 0.5 + 1e-6));
        const hard = xAbs <= w ? 1 : 0;
        const gauss = Math.exp(-0.5 * Math.pow(xAbs / w, 2));
        const mask = lerp(hard, gauss, maskGaussianMix);
        const shaped = xAbs <= w ? mask : Math.pow(mask, dampenFalloffExp);
        return 1 - centerNoiseDampeningN * shaped;
      };

      const sampleNoise = (wx, wy) => {
        const mountain = (terrainNoiseEnabled && mountainAmpMm > 0)
          ? sampleMountain(wx, wy) * mountainAmpMm * dampen(wx, wy)
          : 0;
        return mountain + sampleRackNoise(wx, wy);
      };

      // --- Terrain shape ---
      const skylineRelief = clamp01((p.skylineRelief ?? 22) / 100);
      const terrainHeight = clamp01((p.terrainHeight ?? 50) / 100);
      // Bidirectional floor offset: signed [-100..100], expressed as a fraction of rowSpan.
      // Negative SVG-Y → positive floorHeight raises the terrain visually.
      const floorOffsetPx = -Math.max(-1, Math.min(1, (p.floorHeight ?? 0) / 100)) * rowSpan;
      const noiseMirrorN = clamp01((p.noiseMirror ?? 0) / 100);

      const displace = (wx, wy, depthNorm) => {
        let nv = sampleNoise(wx, wy);
        if (noiseMirrorN > 0) nv = lerp(nv, sampleNoise(2 * vpX - wx, wy), noiseMirrorN);
        const reliefScale = lerp(skylineRelief, 1, depthNorm);
        const disp = (-nv + centerProfile(wx, depthNorm) * terrainHeight * innerH * 0.5) * reliefScale;
        return wy + disp + floorOffsetPx;
      };

      // --- Displaced rows (index 0 = at horizon, index N_h-1 = near) ---
      const pts = Math.max(2, Math.floor(innerW / 2));
      const xPos = Array.from({ length: pts }, (_, j) => inset + (j / (pts - 1)) * innerW);
      const displacedRows = [];

      // Distribute rows in the half-open interval (0, 1]: nearest row sits at the
      // ground, farthest row sits a small step in front of the horizon — never
      // exactly on it. The horizon line itself is the vanishing line at infinity
      // and should not be drawn.
      for (let i = 0; i < N_h; i++) {
        const t_raw = (i + 1) / N_h;
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

      // Fan lines follow the displaced terrain. When terrain is inactive
      // (no height, no noise, no floor offset) we keep each fan as a single
      // straight segment — both for output cleanliness and to preserve
      // baseline structure for flat-grid scenes.
      const rackHasAmplitude = noiseSamplers.some((s) => Math.abs(s.amplitude) > 0);
      const noiseActive = (terrainNoiseEnabled && mountainAmpMm > 0) || rackHasAmplitude;
      const shapeActive = terrainHeight > 0 && (centerDepthN > 0 || shoulderLiftN > 0 || ridgeSharpnessN > 0);
      const terrainActive = noiseActive || shapeActive || floorOffsetPx !== 0;

      const fullLineSpan = fanBottomY - horizonY;
      const groundU = fullLineSpan > 0 ? Math.min(1, rowSpan / fullLineSpan) : 1;
      const fanSamples = terrainActive ? Math.max(2, Math.floor(rowSpan / 4)) : 2;

      for (let i = 0; i < N_v; i++) {
        const t_raw = N_v === 1 ? 0.5 : i / (N_v - 1);
        const botX = getFanBottomX(t_raw);
        const xAt = (u) => vpX + (botX - vpX) * u;
        const yAt = (u) => horizonY + fullLineSpan * u;

        if (!terrainActive) {
          // Single straight segment from VP to fanBottom — original behavior.
          paths.push(...clipFanLine(vpX, horizonY, xAt(1), yAt(1)));
          continue;
        }

        const polyline = [];
        for (let k = 0; k < fanSamples; k++) {
          const u = (k / (fanSamples - 1)) * groundU;
          const lineX = xAt(u);
          const lineY = yAt(u);
          const depthNorm = clamp01((lineY - horizonY) / rowSpan);
          polyline.push({ x: lineX, y: displace(lineX, lineY, depthNorm) });
        }
        if (groundU < 1) {
          polyline.push({ x: xAt(1), y: yAt(1) });
        }
        for (let k = 0; k < polyline.length - 1; k++) {
          const a = polyline[k];
          const b = polyline[k + 1];
          paths.push(...clipFanLine(a.x, a.y, b.x, b.y));
        }
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
