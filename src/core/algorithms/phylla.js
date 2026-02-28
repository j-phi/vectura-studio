/**
 * phylla algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.phylla = {
      generate: (p, rng, noise, bounds) => {
        const { m, width, height } = bounds;
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
        const pcx = width / 2;
        const pcy = height / 2;
        const angleStep = p.angleStr * (Math.PI / 180);
        const dotSize = Math.max(0.1, p.dotSize ?? 1);
        const shapeType = p.shapeType || 'circle';
        const baseSides = Math.max(3, Math.min(100, Math.round(p.sides ?? 6)));
        const sideJitter = Math.max(0, Math.min(50, Math.round(p.sideJitter ?? 0)));
        const angleOffset = rng.nextFloat() * Math.PI * 2;
        for (let i = 0; i < p.count; i++) {
          const r = p.spacing * Math.sqrt(i) * p.divergence;
          const a = i * angleStep + angleOffset;
          let x = pcx + r * Math.cos(a);
          let y = pcy + r * Math.sin(a);
          const n = sampleField(x, y);
          x += n * p.noiseInf;
          y += n * p.noiseInf;
          if (x > m && x < width - m && y > m && y < height - m) {
            if (shapeType === 'circle') {
              const circle = [];
              circle.meta = { kind: 'circle', cx: x, cy: y, r: dotSize };
              paths.push(circle);
            } else {
              const jitter = sideJitter ? Math.round((rng.nextFloat() * 2 - 1) * sideJitter) : 0;
              const sides = Math.max(3, Math.min(100, baseSides + jitter));
              const poly = [];
              for (let k = 0; k <= sides; k++) {
                const ca = (k / sides) * Math.PI * 2;
                poly.push({ x: x + Math.cos(ca) * dotSize, y: y + Math.sin(ca) * dotSize });
              }
              paths.push(poly);
            }
          }
        }
        return paths;
      },
      formula: () => 'θ = i * 137.5°, r = c√i\npos = [cos(θ)*r, sin(θ)*r] + Noise Rack field * influence',
    };
})();
