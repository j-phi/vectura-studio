/**
 * grid algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.grid = {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const paths = [];
        const rack = window.Vectura.NoiseRack.createEvaluator({ noise, seed: p.seed ?? 0 });
        const legacyNoise = {
          enabled: true,
          type: p.noiseType || 'simplex',
          blend: 'add',
          amplitude: 1,
          zoom: p.noiseScale ?? 0.05,
          freq: 1,
          angle: 0,
          shiftX: 0,
          shiftY: 0,
          tileMode: 'off',
          tilePadding: 0,
          patternScale: 1,
          warpStrength: 1,
          cellularScale: 1,
          cellularJitter: 1,
          stepsCount: 5,
          seed: 0,
          octaves: 1,
          lacunarity: 2,
          gain: 0.5,
          noiseStyle: 'linear',
          noiseThreshold: 0,
          imageWidth: 1,
          imageHeight: 1,
          microFreq: 0,
          imageInvertColor: false,
          imageInvertOpacity: false,
          imageId: '',
          imageName: '',
          imagePreview: '',
          imageAlgo: 'luma',
          imageEffects: [],
          polygonZoomReference: p.noiseScale ?? 0.05,
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
        const sampleField = (x, y) => {
          let combined;
          noiseLayers.forEach((noiseLayer) => {
            const sampleX = noiseLayer.type === 'polygon' ? x - width / 2 : x;
            const sampleY = noiseLayer.type === 'polygon' ? y - height / 2 : y;
            const value =
              rack.sampleScalar(sampleX, sampleY, noiseLayer, { worldX: x, worldY: y }) * (noiseLayer.amplitude ?? 1);
            combined = window.Vectura.NoiseRack.combineBlend({
              combined,
              value,
              blend: noiseLayer.blend || 'add',
              maxAmplitude: maxAmp,
            });
          });
          return combined ?? 0;
        };
        const colW = dW / p.cols;
        const rowH = dH / p.rows;
        for (let r = 0; r <= p.rows; r++) {
          const path = [];
          for (let c = 0; c <= p.cols; c++) {
            let x = m + c * colW;
            let y = m + r * rowH;
            const n = sampleField(x, y);
            if (p.type === 'warp') {
              x += Math.cos(n * Math.PI) * p.distortion;
              y += Math.sin(n * Math.PI) * p.distortion;
            } else {
              y -= n * p.distortion;
            }
            x += (rng.nextFloat() - 0.5) * p.chaos;
            y += (rng.nextFloat() - 0.5) * p.chaos;
            path.push({ x, y });
          }
          paths.push(path);
        }
        for (let c = 0; c <= p.cols; c++) {
          const path = [];
          for (let r = 0; r <= p.rows; r++) {
            let x = m + c * colW;
            let y = m + r * rowH;
            const n = sampleField(x, y);
            if (p.type === 'warp') {
              x += Math.cos(n * Math.PI) * p.distortion;
              y += Math.sin(n * Math.PI) * p.distortion;
            } else {
              y -= n * p.distortion;
            }
            x += (rng.nextFloat() - 0.5) * p.chaos;
            y += (rng.nextFloat() - 0.5) * p.chaos;
            path.push({ x, y });
          }
          paths.push(path);
        }
        return paths;
      },
      formula: () => 'pos += Noise Rack field(x,y) * distortion',
    };
})();
