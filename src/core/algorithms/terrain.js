/**
 * terrain algorithm definition.
 *
 * Heightfield-driven scanlines with selectable perspective projection.
 * World coords: xW in [0, 1] across the canvas, zW in [0, 1] from far (0) to near (1).
 * Pipeline: build H(xW, zW) -> optional river carving -> sample scanlines ->
 * project per perspectiveMode -> hidden-line clip -> emit paths plus rivers/coastline.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  const { clamp01, lerp } = window.Vectura.AlgorithmUtils;

  // Marching-squares coastline at `threshold` over the heightfield grid, returned
  // as world-space {xW, zW} segment pairs. Shared by every perspective mode so the
  // coastline is projected through the same projector as the rest of the terrain
  // (legacy project() or the free-3d Geometry3D engine).
  const buildCoastlineSegs = (grid, gridRows, gridCols, threshold) => {
    const cases = {
      1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]],
      5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 2]],
      8: [[2, 3]], 9: [[0, 2]], 10: [[0, 3], [1, 2]],
      11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[3, 0]],
    };
    const segs = [];
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
        const interp = (va, vb) => {
          const denom = vb - va || 1e-6;
          return (threshold - va) / denom;
        };
        const xW0 = c / (gridCols - 1), xW1 = (c + 1) / (gridCols - 1);
        const zW0 = r / (gridRows - 1), zW1 = (r + 1) / (gridRows - 1);
        const edgePoint = (e) => {
          switch (e) {
            case 0: { const t = interp(v0, v1); return { xW: lerp(xW0, xW1, t), zW: zW0 }; }
            case 1: { const t = interp(v1, v2); return { xW: xW1, zW: lerp(zW0, zW1, t) }; }
            case 2: { const t = interp(v2, v3); return { xW: lerp(xW1, xW0, t), zW: zW1 }; }
            case 3: { const t = interp(v3, v0); return { xW: xW0, zW: lerp(zW1, zW0, t) }; }
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
          segs.push([edgePoint(e0), edgePoint(e1)]);
        });
      }
    }
    return segs;
  };

  window.Vectura.AlgorithmRegistry.terrain = {
    generate: (p, rng, noise, bounds) => {
      const { m, width, height } = bounds;
      const inset = bounds.truncate ? m : 0;
      const innerW = width - inset * 2;
      const innerH = height - inset * 2;
      if (innerW < 1 || innerH < 1) return [];


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
      const mode = ['orthographic', 'one-point', 'one-point-landscape', 'two-point', 'isometric', 'free-3d'].includes(p.perspectiveMode)
        ? p.perspectiveMode
        : 'one-point';
      const isFree3d = mode === 'free-3d';
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
      const { stack: defaultStack, layer: defaultLayer } =
        window.Vectura.NoiseRack.defaultConfigFor('terrain', p);
      const noiseStack = (Array.isArray(p.noises) && p.noises.length ? p.noises : defaultStack)
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
        // sampleScalar runs the FBM octave loop (octaves/lacunarity/gain); rack.evaluate
        // is a SINGLE octave and silently ignores them. zoom already carries mountainFreq,
        // so pass RAW world coords — pre-multiplying would square the base frequency.
        const v = rack.sampleScalar(wx, wy, mountainLayer, { worldX: wx, worldY: wy });
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

      // --- Rivers: DEM hydrology (priority-flood fill → D8 → flow accumulation →
      // drainage network → dendritic channels), carved once into the grid. ---
      const riversEnabled = p.riversEnabled === true;
      const riverCount = Math.max(1, Math.floor(p.riverCount ?? 2));
      const riverWidth = Math.max(1, p.riverWidth ?? 3);
      // Relief-relative depth: a fraction of the visible mountain relief (same idiom
      // as waterLevel above), so the slider means the same thing at any
      // mountainAmplitude — and a hard floor below keeps it from "dripping".
      const reliefUnit = Math.max(0.02, mountainAmp);
      const riverDepth = clamp01((p.riverDepth ?? 8) / 100) * reliefUnit;
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

      // Rivers are computed by a small terrain-hydrology pipeline run ONCE over the
      // heightfield. It is fully deterministic — derived from the (seed-stable) grid
      // with no rand() — so the same terrain always yields the same drainage network.
      if (riversEnabled) {
        const N = gridRows * gridCols;
        const idxOf = (r, c) => r * gridCols + c;
        const rowOf = (idx) => (idx / gridCols) | 0;
        // 8-neighbour offsets with their euclidean step length.
        const NB = [
          [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
          [-1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [1, 1, Math.SQRT2],
        ];
        const downstreamOf = (idx, d) => {
          if (d < 0) return -1;
          const r = rowOf(idx);
          return idxOf(r + NB[d][0], (idx - r * gridCols) + NB[d][1]);
        };

        // (1) Priority-flood depression fill (+ε) so every cell drains to a border
        // and raised flats still slope downhill. Flat array-backed binary min-heap
        // keyed by elevation, tie-broken by cell index for determinism.
        // Float64 (not Float32): the +EPS_FILL staircase can be smaller than a
        // Float32 ULP at moderate absolute elevations, which would silently collapse
        // raised flats back to true flats and leave interior drainage sinks.
        const filled = Float64Array.from(grid);
        const EPS_FILL = 1e-6 * reliefUnit;
        const hKey = new Float64Array(N);
        const hIdx = new Int32Array(N);
        let hSize = 0;
        const less = (i, j) => hKey[i] < hKey[j] || (hKey[i] === hKey[j] && hIdx[i] < hIdx[j]);
        const swap = (i, j) => {
          const k = hKey[i]; hKey[i] = hKey[j]; hKey[j] = k;
          const x = hIdx[i]; hIdx[i] = hIdx[j]; hIdx[j] = x;
        };
        const hPush = (key, idx) => {
          let i = hSize++; hKey[i] = key; hIdx[i] = idx;
          while (i > 0) { const par = (i - 1) >> 1; if (!less(i, par)) break; swap(i, par); i = par; }
        };
        const hPop = () => {
          const top = hIdx[0]; hSize--; hKey[0] = hKey[hSize]; hIdx[0] = hIdx[hSize];
          let i = 0;
          for (;;) {
            const l = 2 * i + 1, r = 2 * i + 2; let m = i;
            if (l < hSize && less(l, m)) m = l;
            if (r < hSize && less(r, m)) m = r;
            if (m === i) break; swap(i, m); i = m;
          }
          return top;
        };
        const closed = new Uint8Array(N);
        for (let r = 0; r < gridRows; r++) {
          for (let c = 0; c < gridCols; c++) {
            if (r === 0 || r === gridRows - 1 || c === 0 || c === gridCols - 1) {
              const idx = idxOf(r, c); closed[idx] = 1; hPush(filled[idx], idx);
            }
          }
        }
        while (hSize > 0) {
          const cur = hPop();
          const cr = rowOf(cur), cc = cur - cr * gridCols;
          for (let n = 0; n < 8; n++) {
            const nr = cr + NB[n][0], nc = cc + NB[n][1];
            if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;
            const nidx = idxOf(nr, nc);
            if (closed[nidx]) continue;
            if (filled[nidx] <= filled[cur] + EPS_FILL) filled[nidx] = filled[cur] + EPS_FILL;
            closed[nidx] = 1; hPush(filled[nidx], nidx);
          }
        }

        // (2) D8 flow direction on the filled surface. Border cells (and below-water
        // cells when oceans are on) are outlets; equal-slope ties break by lowest
        // neighbour index, so the network is deterministic.
        const dir = new Int8Array(N);
        for (let r = 0; r < gridRows; r++) {
          for (let c = 0; c < gridCols; c++) {
            const idx = idxOf(r, c);
            if (r === 0 || r === gridRows - 1 || c === 0 || c === gridCols - 1 ||
                (oceansEnabled && filled[idx] <= waterLevel + 1e-6)) { dir[idx] = -1; continue; }
            let best = -1, bestSlope = 0;
            for (let n = 0; n < 8; n++) {
              const nidx = idxOf(r + NB[n][0], c + NB[n][1]);
              const slope = (filled[idx] - filled[nidx]) / NB[n][2];
              if (slope > bestSlope) { bestSlope = slope; best = n; }
            }
            dir[idx] = best;
          }
        }

        // (3) Flow accumulation: process cells high→low so each donates its full
        // upstream count to its downstream neighbour. accum ≈ contributing area.
        const order = Array.from({ length: N }, (_, i) => i);
        order.sort((a, b) => (filled[b] - filled[a]) || (a - b));
        const accum = new Float32Array(N).fill(1);
        for (let i = 0; i < N; i++) {
          const idx = order[i];
          const ds = downstreamOf(idx, dir[idx]);
          if (ds >= 0) accum[ds] += accum[idx];
        }

        // (4) Drainage network: a cell is a channel when its accumulation clears a
        // threshold set as an accumulation percentile over land. riverCount sweeps
        // that percentile (sparser → denser); it is a drainage-density knob, not a
        // literal river count.
        let accumMax = 1;
        const landAccum = [];
        for (let i = 0; i < N; i++) {
          if (!oceansEnabled || filled[i] > waterLevel) {
            landAccum.push(accum[i]); if (accum[i] > accumMax) accumMax = accum[i];
          }
        }
        const channel = new Uint8Array(N);
        if (accumMax > 1 && landAccum.length) {
          landAccum.sort((a, b) => a - b);
          const pct = lerp(0.985, 0.9, clamp01((riverCount - 1) / 5));
          const T = Math.max(2, landAccum[Math.min(landAccum.length - 1, Math.floor(pct * landAccum.length))]);
          for (let i = 0; i < N; i++) {
            if ((!oceansEnabled || filled[i] > waterLevel) && accum[i] >= T) channel[i] = 1;
          }
        }

        // (5) Trace channels into dendritic polylines: walk downstream from each
        // source (a channel cell with no channel inflow), following D8 until an
        // outlet or an already-traced cell (a confluence — its node is shared, so
        // tributaries visually join the trunk). Long runs are plotter-friendly.
        const inDeg = new Uint16Array(N);
        for (let i = 0; i < N; i++) {
          if (!channel[i]) continue;
          const ds = downstreamOf(i, dir[i]);
          if (ds >= 0 && channel[ds]) inDeg[ds]++;
        }
        const sources = [];
        for (let i = 0; i < N; i++) if (channel[i] && inDeg[i] === 0) sources.push(i);
        sources.sort((a, b) => (accum[a] - accum[b]) || (a - b));
        const cellCenter = (idx) => {
          const r = rowOf(idx), c = idx - r * gridCols;
          return { xW: gridCols > 1 ? c / (gridCols - 1) : 0.5, zW: gridRows > 1 ? r / (gridRows - 1) : 0.5 };
        };
        const used = new Uint8Array(N);
        for (let s = 0; s < sources.length; s++) {
          let idx = sources[s];
          const cells = [];
          for (;;) {
            cells.push(idx);
            if (used[idx]) break;            // joined an existing chain (share the node)
            used[idx] = 1;
            const ds = downstreamOf(idx, dir[idx]);
            if (ds < 0 || !channel[ds]) break; // reached an outlet / left the network
            idx = ds;
          }
          if (cells.length >= 2) riverPaths.push(cells.map(cellCenter));
        }

        // Optional hydrology-conditioned sinuosity: a small deterministic lateral
        // wobble (perpendicular to flow) that only opens up in wide, low-relief
        // reaches. Bounded well under one cell so the line stays in its carved groove.
        if (riverMeander > 0) {
          // Keep the max lateral shift well under one cell so the meandered line
          // stays inside its carved groove (the carve is centred on the channel
          // cells, and a typical groove is ~1 cell wide).
          const ampW = riverMeander * 0.3 / Math.max(1, gridCols - 1);
          riverPaths.forEach((trace) => {
            if (trace.length < 3) return;
            const orig = trace.map((q) => ({ xW: q.xW, zW: q.zW }));
            for (let i = 1; i < orig.length - 1; i++) {
              let tx = orig[i + 1].xW - orig[i - 1].xW;
              let tz = orig[i + 1].zW - orig[i - 1].zW;
              const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
              const wob = Math.sin(i * 0.9) * ampW;
              trace[i] = { xW: clamp01(orig[i].xW - tz * wob), zW: clamp01(orig[i].zW + tx * wob) };
            }
          });
        }

        // (6) Carve the channels into the grid ONCE per cell, against a pre-carve
        // snapshot so overlapping discs converge to a single target depth instead of
        // accumulating (the old per-step subtract gouged cells to -∞ → the "drips").
        // Depth/width scale with discharge; a hard floor guarantees no runaway.
        const baseGrid = Float32Array.from(grid);
        let gridMin = Infinity;
        for (let i = 0; i < N; i++) if (baseGrid[i] < gridMin) gridMin = baseGrid[i];
        const carveFloor = oceansEnabled ? waterLevel : (gridMin - riverDepth);
        for (let i = 0; i < N; i++) {
          if (!channel[i]) continue;
          const q = Math.min(1, accum[i] / accumMax);
          const wCells = Math.max(1, Math.round(riverWidth * Math.sqrt(q) / Math.max(1, cellW)));
          const depthAmt = riverDepth * Math.pow(q, 0.3);
          const cr = rowOf(i), cc = i - cr * gridCols;
          const sigma = Math.max(0.5, wCells * 0.5);
          for (let dr = -wCells; dr <= wCells; dr++) {
            for (let dc = -wCells; dc <= wCells; dc++) {
              const r = cr + dr, c = cc + dc;
              if (r < 0 || r >= gridRows || c < 0 || c >= gridCols) continue;
              const dist = Math.hypot(dr, dc);
              if (dist > wCells) continue;
              const fall = Math.exp(-0.5 * Math.pow(dist / sigma, 2));
              const idx = idxOf(r, c);
              const target = Math.max(carveFloor, baseGrid[idx] - depthAmt * fall);
              if (target < grid[idx]) grid[idx] = target;
            }
          }
        }
      }

      // --- Free 3D: route the same heightfield through the shared Geometry3D
      // engine (yaw/pitch/roll + ortho/perspective) instead of the fixed
      // vanishing-point projector, and do hidden-line removal with the engine's
      // screen-space painter occlusion. All feature data above (grid, rivers,
      // coastline) is projection-independent and reused verbatim. ---
      if (isFree3d) {
        const G3 = window.Vectura.Geometry3D;
        const { finite } = G3;
        const depthExtent = innerH * 1.4;          // world depth (far -> near) span
        const heightScaleFree = innerH * 0.5;      // height -> world Y span
        const centerX = inset + innerW / 2;
        const centerY = inset + innerH / 2;
        const proj = G3.resolveProjection(p);
        const angles = { yaw: finite(p.yaw, -25), pitch: finite(p.pitch, 58), roll: finite(p.roll, 0) };
        // Footprint fan: widen the FAR (top) edge relative to the near (base) edge
        // so the rectangular footprint opens into a trapezoid. topWidth is the
        // far/near width ratio (1 = native rectangle, up to 10×). The per-row scale
        // ramps linearly from topWidth at zW=0 (far) to 1 at zW=1 (near).
        const topWidthScale = clamp01((finite(p.topWidth, 1) - 1) / 9) * 9 + 1;
        // World (xW in [0,1], zW in [0,1] far->near, h height) -> centered cube
        // -> rotate -> project. Larger camera z = nearer (engine convention).
        const project3d = (xW, zW, h) => {
          const fan = 1 + (topWidthScale - 1) * (1 - zW);
          const X = (xW - 0.5) * innerW * fan;
          const Z = (zW - 0.5) * depthExtent;
          const Y = h * heightScaleFree;
          const rotated = G3.rotatePoint({ x: X, y: Y, z: Z }, angles);
          const point = G3.projectPoint(rotated, { centerX, centerY, scale: 1, ...proj });
          return { point, rotated };
        };

        const occlusionOn = p.occlusion !== false;
        const fast = p.fastPreview || bounds.fastPreview;
        const drawSlices = fast ? Math.min(depthSlices, G3.previewCap(bounds, 48)) : depthSlices;
        const drawXRes = fast ? Math.min(xResolution, G3.previewCap(bounds, 120)) : xResolution;

        // Project every grid vertex once — reused for occluders, silhouette,
        // creases, and hatching.
        const projGrid = new Array(gridRows);
        for (let r = 0; r < gridRows; r++) {
          const zW = gridRows === 1 ? 0.5 : r / (gridRows - 1);
          const rowArr = new Array(gridCols);
          for (let c = 0; c < gridCols; c++) {
            const xW = gridCols === 1 ? 0.5 : c / (gridCols - 1);
            rowArr[c] = project3d(xW, zW, grid[r * gridCols + c]);
          }
          projGrid[r] = rowArr;
        }

        // Silhouette/crease faces stay on the coarse projGrid — their topology (and
        // the Shading & Lines baselines) is unaffected by the occluder change below.
        const faceFront = [];
        const faces = [];
        const faceNormals = [];
        const wantFaces = p.emphasizeOutline === true || p.showCreases === true;
        if (wantFaces) {
          for (let r = 0; r < gridRows - 1; r++) {
            for (let c = 0; c < gridCols - 1; c++) {
              const a = projGrid[r][c];
              const b = projGrid[r][c + 1];
              const cc = projGrid[r + 1][c + 1];
              const d = projGrid[r + 1][c];
              const normal = G3.faceNormal([a.rotated, b.rotated, cc.rotated, d.rotated]);
              const i0 = r * gridCols + c;
              faces.push([i0, i0 + 1, i0 + gridCols + 1, i0 + gridCols]);
              faceFront.push(normal.z >= -0.001);
              faceNormals.push(normal);
            }
          }
        }

        // Hidden-line removal is a floating-horizon sweep (the classic stacked-
        // ridgeline algorithm). Build the drawable rows from the SAME projected
        // heightfield grid: each scanline (constant zW) is one opaque row, while
        // rivers and the coastline ride ON the surface — they're occluded by nearer
        // terrain but never occlude (they don't extend the horizon). The sweep
        // tests each row only against NEARER rows, never the surface it lies on, so
        // there is no self-occlusion "acne", no quantisation gaps, and no back-slope
        // leaks — visible spans come out as long continuous (plotter-friendly) runs.
        const occRows = drawSlices;
        const occCols = drawXRes;
        const occGrid = new Array(occRows);
        for (let r = 0; r < occRows; r++) {
          const zW = occRows === 1 ? 0.5 : r / (occRows - 1);
          const rowArr = new Array(occCols);
          for (let c = 0; c < occCols; c++) {
            const xW = occCols === 1 ? 0.5 : c / (occCols - 1);
            rowArr[c] = project3d(xW, zW, sampleGrid(xW, zW));
          }
          occGrid[r] = rowArr;
        }
        const finitePt = (q) => q && q.point && !q.point.behind
          && Number.isFinite(q.point.x) && Number.isFinite(q.point.y);

        const rows = []; // { pts, depth, occludes, meta } for the horizon sweep
        const rawPaths = []; // emitted directly when occlusion is off

        // Scanlines (constant zW) — the opaque surface rows.
        for (let i = 0; i < drawSlices; i++) {
          const pts = [];
          let zSum = 0;
          for (let j = 0; j < drawXRes; j++) {
            const cur = occGrid[i][j];
            if (!finitePt(cur)) continue;
            pts.push({ x: cur.point.x, y: cur.point.y });
            zSum += cur.rotated.z;
          }
          if (pts.length < 2) continue;
          const meta = { kind: 'scanline', depth: zSum / pts.length };
          if (occlusionOn) rows.push({ pts, depth: meta.depth, occludes: true, meta });
          else { pts.meta = meta; rawPaths.push(pts); }
        }

        // Rivers ride the surface — occluded by nearer terrain, never occluders.
        if (riversEnabled) {
          riverPaths.forEach((trace) => {
            const pts = [];
            let zSum = 0;
            trace.forEach((pt) => {
              const cur = project3d(pt.xW, pt.zW, sampleGrid(pt.xW, pt.zW));
              if (!finitePt(cur)) return;
              pts.push({ x: cur.point.x, y: cur.point.y });
              zSum += cur.rotated.z;
            });
            if (pts.length < 2) return;
            const meta = { kind: 'river', depth: zSum / pts.length };
            if (occlusionOn) rows.push({ pts, depth: meta.depth, occludes: false, meta });
            else { pts.meta = meta; rawPaths.push(pts); }
          });
        }

        // Coastline contour at water level (each marching-squares segment a row).
        if (oceansEnabled && drawCoastline) {
          buildCoastlineSegs(grid, gridRows, gridCols, waterLevel + 1e-4).forEach(([a, b]) => {
            const pa = project3d(a.xW, a.zW, waterLevel);
            const pb = project3d(b.xW, b.zW, waterLevel);
            if (!finitePt(pa) || !finitePt(pb)) return;
            const pts = [{ x: pa.point.x, y: pa.point.y }, { x: pb.point.x, y: pb.point.y }];
            const meta = { kind: 'coastline', depth: (pa.rotated.z + pb.rotated.z) / 2 };
            if (occlusionOn) rows.push({ pts, depth: meta.depth, occludes: false, meta });
            else { pts.meta = meta; rawPaths.push(pts); }
          });
        }

        let paths;
        if (occlusionOn && rows.length) {
          const occMode = (p.hiddenLineMode || 'remove') === 'dash' ? 'dash' : 'remove';
          // "Occlusion Bias" (depthBias) is the screen-space tolerance (px) that
          // keeps silhouette-grazing lines whole and stops adjacent rows z-fighting.
          paths = G3.occludeRowsFloatingHorizon(rows, {
            mode: occMode,
            eps: finite(p.depthBias, 0.5),
            angle: finite(p.roll, 0) * Math.PI / 180,
          });
        } else {
          paths = rawPaths;
        }

        // Enhancement #3 — silhouette / crease emphasis from the grid faces.
        if (wantFaces && faces.length) {
          const projectedFlat = [];
          for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) projectedFlat.push(projGrid[r][c].point);
          }
          if (p.emphasizeOutline === true) {
            G3.extractSilhouette(faces, projectedFlat, faceFront, { weightScale: finite(p.outlineWeight, 2) })
              .forEach((path) => paths.push(path));
          }
          if (p.showCreases === true) {
            const edges = [];
            const edgeMap = new Map();
            faces.forEach((face, fi) => {
              for (let k = 0; k < face.length; k++) {
                const va = face[k];
                const vb = face[(k + 1) % face.length];
                const key = va < vb ? `${va}:${vb}` : `${vb}:${va}`;
                if (!edgeMap.has(key)) edgeMap.set(key, { a: va, b: vb, faces: [] });
                edgeMap.get(key).faces.push(fi);
              }
            });
            edgeMap.forEach((e) => edges.push(e));
            G3.extractCreases(edges, faceNormals, finite(p.creaseAngle, 35), projectedFlat, { weightScale: finite(p.outlineWeight, 2) })
              .forEach((path) => paths.push(path));
          }
        }

        // Enhancement #5 — Lambert hatching of the lit front faces.
        if (p.hatchEnable === true) {
          const light = G3.resolveLight(p);
          const cap = fast ? G3.previewCap(bounds, (gridRows - 1) * (gridCols - 1)) : (gridRows - 1) * (gridCols - 1);
          let hatched = 0;
          for (let r = 0; r < gridRows - 1 && hatched < cap; r++) {
            for (let c = 0; c < gridCols - 1 && hatched < cap; c++) {
              const a = projGrid[r][c];
              const b = projGrid[r][c + 1];
              const cc = projGrid[r + 1][c + 1];
              const d = projGrid[r + 1][c];
              const normal = G3.faceNormal([a.rotated, b.rotated, cc.rotated, d.rotated]);
              if (normal.z < -0.001) continue;
              const polygon = [a.point, b.point, cc.point, d.point];
              if (polygon.some((pt) => pt.behind || !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) continue;
              const depth = (a.rotated.z + b.rotated.z + cc.rotated.z + d.rotated.z) / 4;
              G3.lambertHatch(normal, light, polygon, {
                baseSpacing: Math.max(1, finite(p.hatchSpacing, 6)) * (fast ? 2 : 1),
                angleDeg: finite(p.hatchAngle, 45),
                crossHatch: !!p.crossHatch,
              }).forEach((seg) => {
                seg.meta = { kind: 'hatch', hatch: true, depth };
                paths.push(seg);
              });
              hatched++;
            }
          }
        }

        // Enhancement #2 — depth-cue dash density (no-op when depthCue === 'off').
        G3.applyDepthCue(paths, p);

        // Fit-to-canvas: free rotation has no inherent screen size, so orbiting
        // can swing the projected terrain well outside the artwork box. Frame the
        // whole scene into the canvas (small margin, recentered) with one uniform
        // 2D transform applied AFTER occlusion — hidden-line relationships were
        // resolved in raw projected space, and a uniform scale/translate preserves
        // them. The layer's own transform handles still allow manual resizing.
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        paths.forEach((path) => {
          if (!Array.isArray(path)) return;
          for (let i = 0; i < path.length; i++) {
            const pt = path[i];
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }
        });
        const bw = maxX - minX;
        const bh = maxY - minY;
        if (bw > 1e-6 && bh > 1e-6) {
          const fit = 0.92 * Math.min(innerW / bw, innerH / bh);
          const cx = (minX + maxX) / 2;
          const cy = (minY + maxY) / 2;
          paths.forEach((path) => {
            if (!Array.isArray(path)) return;
            for (let i = 0; i < path.length; i++) {
              path[i] = { x: centerX + (path[i].x - cx) * fit, y: centerY + (path[i].y - cy) * fit };
            }
          });
        }
        return paths.filter((path) => Array.isArray(path) && path.length >= 2);
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
        const segs = buildCoastlineSegs(grid, gridRows, gridCols, waterLevel + 1e-4);
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
      const view = mode === 'free-3d'
        ? `\nyaw=${p.yaw ?? -25}° · pitch=${p.pitch ?? 58}° · roll=${p.roll ?? 0}°`
        : '';
      return `terrain · ${mode}${view}\nslices=${p.depthSlices ?? 80} · res=${p.xResolution ?? 240}\nfeatures: ${features.join(', ') || 'flat'}`;
    },
  };
})();
