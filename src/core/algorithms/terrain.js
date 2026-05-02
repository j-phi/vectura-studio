/**
 * terrain algorithm definition.
 *
 * Heightfield-driven scanlines with selectable perspective projection.
 * World coords: xW in [0, 1] across the canvas, zW in [0, 1] from far (0) to near (1).
 * Pipeline: build H(xW, zW) -> optional river carving -> sample scanlines ->
 * project per perspectiveMode -> hidden-line clip -> emit paths plus rivers/coastline.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.terrain = {
    generate: (p, rng, noise, bounds) => {
      const { m, width, height } = bounds;
      const inset = bounds.truncate ? m : 0;
      const innerW = width - inset * 2;
      const innerH = height - inset * 2;
      if (innerW < 1 || innerH < 1) return [];

      const clamp01 = (v) => Math.max(0, Math.min(1, v));
      const lerp = (a, b, t) => a + (b - a) * t;
      // Local LCG so river seeds and valley axes are deterministic from p.seed
      // even when no SeededRNG is supplied (and independent of any shared rng state).
      let lcgState = ((p.seed ?? 0) >>> 0) || 1;
      const rand = () => {
        lcgState = (lcgState * 1664525 + 1013904223) >>> 0;
        return lcgState / 4294967296;
      };
      const EPS = 1e-9;

      // --- Resolution ---
      const depthSlices = Math.max(4, Math.floor(p.depthSlices ?? 80));
      const xResolution = Math.max(8, Math.floor(p.xResolution ?? 240));
      const occlusionOn = p.occlusion !== false;

      // --- Perspective ---
      const mode = ['orthographic', 'one-point', 'one-point-landscape', 'two-point', 'isometric'].includes(p.perspectiveMode)
        ? p.perspectiveMode
        : 'one-point';
      // Pinhole modes (one-point and one-point-landscape) share projection math; the
      // landscape variant additionally emits an explicit horizon line at horizonY.
      const isPinholeOnePoint = mode === 'one-point' || mode === 'one-point-landscape';
      const horizonT = clamp01((p.horizonHeight ?? 50) / 100);
      const horizonY = inset + innerH * horizonT;
      const groundBottom = inset + innerH;
      const rowSpan = Math.max(1, groundBottom - horizonY);
      const vpX = inset + innerW * clamp01((p.vanishingPointX ?? 50) / 100);
      const vpLeftX = inset + innerW * clamp01((p.vpLeftX ?? 20) / 100);
      const vpRightX = inset + innerW * clamp01((p.vpRightX ?? 80) / 100);
      const isoAngle = ((p.isoAngle ?? 30) * Math.PI) / 180;
      const depthCompression = clamp01((p.depthCompression ?? 60) / 100);
      const depthExp = 0.4 + depthCompression * 3.0;
      const depthScalePx = Math.max(1, p.depthScale ?? 80);

      const heightScalePerspective = innerH * 0.5;
      const heightScaleIsometric = innerH * 0.4;
      const heightScaleOrthographic = innerH * 0.18;

      // Project world (xW, zW, h) to screen (x, y).
      // h is in [0, 1] units relative to mountainAmplitude (already-baked-in elsewhere).
      const project = (xW, zW, h) => {
        const xWS = inset + xW * innerW;
        if (mode === 'orthographic') {
          // Top-down map. zW maps linearly down the canvas height. h provides a small
          // upward bump so peaks are still visible as line wiggle.
          const x = xWS;
          const yBase = inset + zW * Math.min(innerH, depthScalePx * (innerH / 220));
          const y = yBase - h * heightScaleOrthographic;
          return { x, y };
        }
        if (mode === 'isometric') {
          const xOff = zW * innerH * Math.cos(isoAngle) * 0.5;
          const yBase = inset + zW * innerH * Math.sin(isoAngle);
          const x = xWS + xOff;
          const y = yBase - h * heightScaleIsometric;
          return { x, y };
        }
        // Pinhole projection (one-point, one-point-landscape, or two-point).
        // zW=0 -> at horizon, zW=1 -> near camera.
        const tCompressed = zW <= 0 ? 0 : zW >= 1 ? 1 : Math.pow(zW, depthExp);
        const yRow = horizonY + tCompressed * rowSpan;
        // Skyline relief: distant peaks retain a residual height (lerp from 0.25 -> 1)
        // so tall mountains can visibly rise above horizonY. Without this, peaks
        // asymptote to the horizon line (their relief shrinks at the same rate
        // their row recedes), and "things above the horizon" can never happen.
        const reliefScale = lerp(0.25, 1, tCompressed);
        let xConverged;
        if (mode === 'two-point') {
          // Trapezoidal two-VP: each side converges to its own VP.
          const leftEdge = lerp(vpLeftX, inset, tCompressed);
          const rightEdge = lerp(vpRightX, inset + innerW, tCompressed);
          xConverged = lerp(leftEdge, rightEdge, xW);
        } else {
          xConverged = lerp(vpX, xWS, tCompressed);
        }
        const y = yRow - h * heightScalePerspective * reliefScale;
        return { x: xConverged, y };
      };

      // --- Noise rack for additional displacement ---
      const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
      const defaultLayer = {
        id: 'noise-1', enabled: true, type: 'simplex', blend: 'add',
        amplitude: 0, zoom: 0.01, freq: 1.0, angle: 0, shiftX: 0, shiftY: 0,
        tileMode: 'off', tilePadding: 0, patternScale: 1, warpStrength: 1,
        cellularScale: 1, cellularJitter: 1, stepsCount: 5, seed: 0,
        noiseStyle: 'linear', noiseThreshold: 0, imageWidth: 1, imageHeight: 1,
        microFreq: 0, imageInvertColor: false, imageInvertOpacity: false,
        imageId: '', imageName: '', imagePreview: '', imageAlgo: 'luma',
        imageEffects: [], polygonZoomReference: 0.01, polygonRadius: 2,
        polygonSides: 6, polygonRotation: 0, polygonOutline: 0, polygonEdgeRadius: 0,
      };
      const noiseStack = (Array.isArray(p.noises) && p.noises.length ? p.noises : [])
        .map((layer) => ({ ...defaultLayer, ...(layer || {}), enabled: layer?.enabled !== false }))
        .filter((layer) => layer.enabled !== false);
      const maxAmp = noiseStack.reduce((s, l) => s + Math.abs(l.amplitude ?? 0), 0) || 1;

      const rackSamplers = noiseStack.map((layer) => {
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
      const sampleRack = (wx, wy) => {
        if (!rackSamplers.length) return 0;
        let combined;
        rackSamplers.forEach((s) => {
          const value = s.sample(wx, wy) * s.amplitude;
          combined = window.Vectura.NoiseRack.combineBlend({ combined, value, blend: s.blend, maxAmplitude: maxAmp });
        });
        return combined ?? 0;
      };

      // --- Mountain layer (ridged multifractal via NoiseRack) ---
      const mountainAmp = clamp01((p.mountainAmplitude ?? 40) / 100);
      const mountainFreq = Math.max(0.0005, p.mountainFrequency ?? 0.008);
      const mountainOctaves = Math.max(1, Math.floor(p.mountainOctaves ?? 5));
      const mountainLacunarity = Math.max(1.5, p.mountainLacunarity ?? 2.0);
      const mountainGain = clamp01(p.mountainGain ?? 0.5);
      const peakSharpness = Math.max(0.5, p.peakSharpness ?? 2.0);
      const mountainLayer = {
        ...defaultLayer,
        id: 'terrain-mountain', type: 'ridged', blend: 'add',
        amplitude: 1, zoom: mountainFreq, freq: 1,
        octaves: mountainOctaves, lacunarity: mountainLacunarity, gain: mountainGain,
        seed: (p.seed ?? 0) + 17,
      };
      const sampleMountain = (wx, wy) => {
        const v = rack.evaluate(wx * mountainFreq, wy * mountainFreq, mountainLayer, { worldX: wx, worldY: wy });
        // Map ridged value [-1, 1] to [0, 1] then sharpen peaks.
        const n01 = clamp01((v + 1) * 0.5);
        return Math.pow(n01, peakSharpness);
      };

      // --- Valleys: precompute axes (each valley is a sinuous spline across the field) ---
      const valleyCount = Math.max(0, Math.floor(p.valleyCount ?? 2));
      const valleyDepth = clamp01((p.valleyDepth ?? 30) / 100);
      const valleyWidth = Math.max(2, p.valleyWidth ?? 20);
      const valleyShape = clamp01(p.valleyShape ?? 0.4);
      const valleyMeander = clamp01((p.valleyMeander ?? 40) / 100);
      const valleyAxes = [];
      for (let i = 0; i < valleyCount; i++) {
        const baseX = (i + 0.5) / valleyCount + (rand() - 0.5) * 0.2;
        const phase = rand() * Math.PI * 2;
        const meander = (0.05 + valleyMeander * 0.25) * (rand() * 0.5 + 0.5);
        const wavelength = 0.4 + rand() * 0.6; // in zW
        valleyAxes.push({ baseX, phase, meander, wavelength });
      }
      const valleyContribution = (xW, zW) => {
        if (!valleyCount || valleyDepth <= 0) return 0;
        let depth = 0;
        valleyAxes.forEach((axis) => {
          const ax = axis.baseX + axis.meander * Math.sin((zW / axis.wavelength) * Math.PI * 2 + axis.phase);
          const dxNorm = (xW - ax) * innerW; // in canvas-pixel units
          const sigma = Math.max(2, valleyWidth);
          // valleyShape 0 = V (sharp |x|), 1 = U (gaussian)
          const vProfile = Math.exp(-Math.abs(dxNorm) / sigma);
          const uProfile = Math.exp(-0.5 * Math.pow(dxNorm / sigma, 2));
          depth += lerp(vProfile, uProfile, valleyShape);
        });
        return Math.min(1, depth) * valleyDepth;
      };

      // --- Heightfield grid (so river carving and coastline can read/write it) ---
      // Resolution decoupled from xResolution to keep it tractable.
      const gridCols = Math.max(20, Math.min(220, Math.floor(xResolution / 2)));
      const gridRows = Math.max(20, Math.min(220, Math.floor(depthSlices / 1.5)));
      const grid = new Float32Array(gridRows * gridCols);
      const cellW = innerW / (gridCols - 1);
      const cellH = innerH / (gridRows - 1);
      for (let r = 0; r < gridRows; r++) {
        const zW = r / (gridRows - 1);
        for (let c = 0; c < gridCols; c++) {
          const xW = c / (gridCols - 1);
          const wx = inset + c * cellW;
          const wy = inset + r * cellH;
          let h = sampleMountain(wx, wy) * mountainAmp;
          h -= valleyContribution(xW, zW);
          // Rack contributes additional displacement scaled to the heightfield's
          // [0, 1]-ish range. Wavetable-template defaults give amplitude=9, so
          // 0.05 puts a typical added noise on the same scale as a default mountain.
          h += sampleRack(wx, wy) * 0.05;
          grid[r * gridCols + c] = h;
        }
      }

      // --- Oceans ---
      const oceansEnabled = p.oceansEnabled === true;
      const drawCoastline = p.drawCoastline !== false;
      const waterLevel = clamp01((p.waterLevel ?? 20) / 100) * Math.max(0.001, mountainAmp);

      // Water clamp on the grid (do this before river carving so rivers carve into land,
      // not below water).
      if (oceansEnabled) {
        for (let i = 0; i < grid.length; i++) {
          if (grid[i] < waterLevel) grid[i] = waterLevel;
        }
      }

      // --- Rivers: steepest-descent traces, carved into the grid ---
      const riversEnabled = p.riversEnabled === true;
      const riverCount = Math.max(1, Math.floor(p.riverCount ?? 2));
      const riverWidth = Math.max(1, p.riverWidth ?? 3);
      const riverDepth = Math.max(0, p.riverDepth ?? 8) / 100;
      const riverMeander = clamp01((p.riverMeander ?? 50) / 100);
      const riverPaths = [];

      const sampleGrid = (xW, zW) => {
        const c = Math.max(0, Math.min(gridCols - 1, xW * (gridCols - 1)));
        const r = Math.max(0, Math.min(gridRows - 1, zW * (gridRows - 1)));
        const c0 = Math.floor(c), c1 = Math.min(gridCols - 1, c0 + 1);
        const r0 = Math.floor(r), r1 = Math.min(gridRows - 1, r0 + 1);
        const tx = c - c0, ty = r - r0;
        const v00 = grid[r0 * gridCols + c0];
        const v10 = grid[r0 * gridCols + c1];
        const v01 = grid[r1 * gridCols + c0];
        const v11 = grid[r1 * gridCols + c1];
        return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
      };

      const carveAt = (xW, zW, depthFrac) => {
        const cCenter = Math.round(xW * (gridCols - 1));
        const rCenter = Math.round(zW * (gridRows - 1));
        const radius = Math.max(1, Math.round(riverWidth / Math.max(1, cellW)));
        for (let dr = -radius; dr <= radius; dr++) {
          for (let dc = -radius; dc <= radius; dc++) {
            const r = rCenter + dr;
            const c = cCenter + dc;
            if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) continue;
            const dist = Math.hypot(dr, dc);
            if (dist > radius) continue;
            const fall = Math.exp(-0.5 * Math.pow(dist / Math.max(0.5, radius * 0.5), 2));
            const idx = r * gridCols + c;
            grid[idx] = Math.max(oceansEnabled ? waterLevel : -Infinity, grid[idx] - depthFrac * fall);
          }
        }
      };

      if (riversEnabled) {
        for (let i = 0; i < riverCount; i++) {
          // Seed at a high point — sample several candidates and pick the highest.
          let seed = null;
          let seedH = -Infinity;
          for (let k = 0; k < 12; k++) {
            const xC = rand();
            const zC = rand() * 0.6; // bias toward back/upper (further) of canvas
            const h = sampleGrid(xC, zC);
            if (h > seedH) { seedH = h; seed = { xW: xC, zW: zC }; }
          }
          if (!seed) continue;
          const trace = [{ ...seed }];
          let xW = seed.xW;
          let zW = seed.zW;
          let lastDir = 0;
          for (let step = 0; step < 800; step++) {
            const eps = 1 / Math.max(gridCols, gridRows);
            const dHdx = (sampleGrid(Math.min(1, xW + eps), zW) - sampleGrid(Math.max(0, xW - eps), zW)) / (2 * eps);
            const dHdz = (sampleGrid(xW, Math.min(1, zW + eps)) - sampleGrid(xW, Math.max(0, zW - eps))) / (2 * eps);
            const grad = Math.hypot(dHdx, dHdz);
            if (grad < 1e-5) break;
            // Move opposite to gradient. Add meander as a tangent-perpendicular wiggle.
            let dx = -dHdx / grad;
            let dz = -dHdz / grad;
            if (riverMeander > 0) {
              const wiggle = Math.sin(step * 0.25 + lastDir) * riverMeander;
              const tx = -dz, tz = dx;
              dx += tx * wiggle * 0.6;
              dz += tz * wiggle * 0.6;
              const norm = Math.hypot(dx, dz) || 1;
              dx /= norm; dz /= norm;
            }
            lastDir += rand() - 0.5;
            const stepLen = 0.005;
            xW = clamp01(xW + dx * stepLen);
            zW = clamp01(zW + dz * stepLen);
            const h = sampleGrid(xW, zW);
            trace.push({ xW, zW });
            carveAt(xW, zW, riverDepth);
            if (oceansEnabled && h <= waterLevel + 1e-4) break;
            if (xW <= 0 || xW >= 1 || zW <= 0 || zW >= 1) break;
          }
          if (trace.length >= 2) riverPaths.push(trace);
        }
      }

      // --- Scanlines (constant zW each), processed near -> far for hidden-line removal ---
      const scanlines = []; // each = array of {x, y} in screen space
      const heightAtScreen = (xW, zW) => sampleGrid(xW, zW);

      for (let i = 0; i < depthSlices; i++) {
        const zW = depthSlices === 1 ? 0.5 : i / (depthSlices - 1);
        const row = [];
        for (let j = 0; j < xResolution; j++) {
          const xW = xResolution === 1 ? 0.5 : j / (xResolution - 1);
          const h = heightAtScreen(xW, zW);
          row.push(project(xW, zW, h));
        }
        scanlines.push(row);
      }

      // --- Hidden-line removal via per-screen-column min-Y envelope ---
      // Map screen-x to envelope buckets covering the canvas width.
      const envSlots = Math.max(64, xResolution);
      const envXMin = inset - innerW * 0.2;
      const envXMax = inset + innerW * 1.2;
      const envSpan = envXMax - envXMin;
      const envelope = new Float64Array(envSlots).fill(groundBottom + innerH);
      const xToSlot = (x) => {
        const t = (x - envXMin) / envSpan;
        const k = Math.floor(t * envSlots);
        return Math.max(0, Math.min(envSlots - 1, k));
      };
      const envAtX = (x) => envelope[xToSlot(x)];

      const clipRow = (row) => {
        const segs = [];
        let cur = null;
        for (let j = 0; j < row.length - 1; j++) {
          const r1 = row[j], r2 = row[j + 1];
          const e1 = envAtX(r1.x), e2 = envAtX(r2.x);
          const v1 = r1.y < e1;
          const v2 = r2.y < e2;
          if (v1 && v2) {
            if (!cur) cur = [r1];
            cur.push(r2);
          } else if (!v1 && !v2) {
            if (cur) { if (cur.length >= 2) segs.push(cur); cur = null; }
          } else {
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

      const updateEnvelope = (row) => {
        for (let j = 0; j < row.length; j++) {
          const slot = xToSlot(row[j].x);
          if (row[j].y < envelope[slot]) envelope[slot] = row[j].y;
        }
        // Bridge gaps between sample columns so we don't leak through aliased buckets.
        let lastSet = -1;
        for (let s = 0; s < envSlots; s++) {
          if (envelope[s] < groundBottom + innerH) {
            if (lastSet >= 0 && s - lastSet > 1) {
              const eA = envelope[lastSet], eB = envelope[s];
              for (let k = lastSet + 1; k < s; k++) {
                const t = (k - lastSet) / (s - lastSet);
                const interp = lerp(eA, eB, t);
                if (interp < envelope[k]) envelope[k] = interp;
              }
            }
            lastSet = s;
          }
        }
      };

      const paths = [];
      // Process near to far so closer terrain occludes farther terrain.
      for (let i = scanlines.length - 1; i >= 0; i--) {
        const row = scanlines[i];
        if (occlusionOn) {
          paths.push(...clipRow(row));
          updateEnvelope(row);
        } else {
          paths.push(row);
        }
      }

      // --- Coastline contour at h == waterLevel via marching squares on the grid ---
      if (oceansEnabled && drawCoastline) {
        const cases = {
          1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
          5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]],
          8: [[2, 3]], 9: [[0, 2]], 10: [[0, 3], [1, 2]],
          11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]],
        };
        const segs = [];
        const threshold = waterLevel + 1e-4;
        const cellRows = gridRows - 1;
        const cellCols = gridCols - 1;
        for (let r = 0; r < cellRows; r++) {
          for (let c = 0; c < cellCols; c++) {
            const v0 = grid[r * gridCols + c];
            const v1 = grid[r * gridCols + (c + 1)];
            const v2 = grid[(r + 1) * gridCols + (c + 1)];
            const v3 = grid[(r + 1) * gridCols + c];
            const idx = (v0 > threshold ? 1 : 0)
              | ((v1 > threshold ? 1 : 0) << 1)
              | ((v2 > threshold ? 1 : 0) << 2)
              | ((v3 > threshold ? 1 : 0) << 3);
            if (idx === 0 || idx === 15) continue;
            const interp = (a, b, va, vb) => {
              const denom = vb - va || 1e-6;
              return (threshold - va) / denom;
            };
            const xW0 = c / (gridCols - 1), xW1 = (c + 1) / (gridCols - 1);
            const zW0 = r / (gridRows - 1), zW1 = (r + 1) / (gridRows - 1);
            const edgePoint = (e) => {
              switch (e) {
                case 0: { const t = interp(0, 1, v0, v1); return { xW: lerp(xW0, xW1, t), zW: zW0 }; }
                case 1: { const t = interp(0, 1, v1, v2); return { xW: xW1, zW: lerp(zW0, zW1, t) }; }
                case 2: { const t = interp(0, 1, v2, v3); return { xW: lerp(xW1, xW0, t), zW: zW1 }; }
                case 3: { const t = interp(0, 1, v3, v0); return { xW: xW0, zW: lerp(zW1, zW0, t) }; }
                default: return { xW: xW0, zW: zW0 };
              }
            };
            let edges = cases[idx];
            if (idx === 5 || idx === 10) {
              const center = (v0 + v1 + v2 + v3) / 4;
              if (idx === 5) edges = center > threshold ? [[3, 0], [1, 2]] : [[3, 2], [0, 1]];
              if (idx === 10) edges = center > threshold ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
            }
            edges.forEach(([e0, e1]) => {
              const a = edgePoint(e0);
              const b = edgePoint(e1);
              segs.push([a, b]);
            });
          }
        }
        // Project each coastline segment.
        segs.forEach(([a, b]) => {
          const ph = waterLevel; // coastline drawn at water level
          const pa = project(a.xW, a.zW, ph);
          const pb = project(b.xW, b.zW, ph);
          const seg = [pa, pb];
          seg.meta = { kind: 'coastline' };
          paths.push(seg);
        });
      }

      // --- Project river paths ---
      if (riversEnabled) {
        riverPaths.forEach((trace) => {
          const projected = trace.map((pt) => {
            const h = sampleGrid(pt.xW, pt.zW);
            return project(pt.xW, pt.zW, h);
          });
          if (projected.length >= 2) {
            projected.meta = { kind: 'river' };
            paths.push(projected);
          }
        });
      }

      // --- Explicit horizon line for the landscape variant ---
      // Required: the horizon line MUST appear so the area below it reads as the
      // landscape's ground plane. The scanline pipeline already fills horizonY ->
      // groundBottom, so "below horizon" always has content. Where terrain peaks
      // rise above horizonY (envelope[col] < horizonY), those peaks occlude the
      // horizon line — we walk across the canvas, sampling the envelope, and emit
      // one segment per visible run.
      if (mode === 'one-point-landscape') {
        const xL = inset;
        const xR = inset + innerW;
        if (!occlusionOn) {
          // No envelope tracking when occlusion is off — emit the full horizon.
          const seg = [{ x: xL, y: horizonY }, { x: xR, y: horizonY }];
          seg.meta = { kind: 'horizon' };
          paths.push(seg);
        } else {
          const samples = Math.max(64, xResolution);
          let runStartX = null;
          let runEndX = null;
          const flush = () => {
            if (runStartX === null || runEndX === null) return;
            if (runEndX - runStartX < EPS) {
              runStartX = runEndX = null;
              return;
            }
            const seg = [{ x: runStartX, y: horizonY }, { x: runEndX, y: horizonY }];
            seg.meta = { kind: 'horizon' };
            paths.push(seg);
            runStartX = runEndX = null;
          };
          for (let i = 0; i <= samples; i++) {
            const x = xL + (i / samples) * innerW;
            const visible = envAtX(x) >= horizonY - EPS;
            if (visible) {
              if (runStartX === null) runStartX = x;
              runEndX = x;
            } else {
              flush();
            }
          }
          flush();
        }
      }

      return paths;
    },

    formula: (p) => {
      const mode = p.perspectiveMode || 'one-point';
      const features = [];
      if ((p.mountainAmplitude ?? 40) > 0) features.push('mountains');
      if ((p.valleyCount ?? 2) > 0 && (p.valleyDepth ?? 30) > 0) features.push('valleys');
      if (p.riversEnabled) features.push('rivers');
      if (p.oceansEnabled) features.push('oceans');
      return `terrain · ${mode}\nslices=${p.depthSlices ?? 80} · res=${p.xResolution ?? 240}\nfeatures: ${features.join(', ') || 'flat'}`;
    },
  };
})();
