/**
 * rings algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.rings = {
      generate: (p, rng, noise, bounds) => {
        const { m, width, height } = bounds;
        const inset = bounds.truncate ? m : 0;
        const cx = width / 2 + (p.offsetX ?? 0);
        const cy = height / 2 + (p.offsetY ?? 0);
        const maxR = Math.max(1, Math.min(width, height) / 2 - inset);
        const rings = Math.max(1, Math.floor(p.rings ?? 1));
        const baseGap = rings > 1 ? maxR / (rings - 1) : maxR;
        const gap = baseGap * (p.gap ?? 1);
        const total = gap * (rings - 1);
        const startR = Math.max(0, maxR - total);
        const amp = p.amplitude ?? 0;
        const noiseScale = p.noiseScale ?? 0.001;
        const noiseOffsetX = p.noiseOffsetX ?? 0;
        const noiseOffsetY = p.noiseOffsetY ?? 0;
        const noiseLayer = p.noiseLayer ?? 0;
        const noiseRadius = p.noiseRadius ?? 100;
        const noiseType = p.noiseType || 'simplex';
        const paths = [];
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
          for (let i = 0; i < 4; i++) {
            totalNoise += baseNoise(x * freq, y * freq) * ampNoise;
            norm += ampNoise;
            ampNoise *= 0.5;
            freq *= 2;
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

        for (let i = 0; i < rings; i++) {
          const layerOffset = i * noiseLayer;
          const rBase = Math.max(0.1, startR + i * gap);
          const steps = Math.max(64, Math.floor(rBase * 2));
          const path = [];
          for (let k = 0; k <= steps; k++) {
            const t = (k / steps) * Math.PI * 2;
            const nX = noiseOffsetX + Math.cos(t) * noiseRadius;
            const nY = noiseOffsetY + Math.sin(t) * noiseRadius;
            const n = noiseValue(nX * noiseScale + layerOffset, nY * noiseScale + layerOffset);
            const r = Math.max(0.1, rBase + n * amp);
            path.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
          }
          paths.push(path);
        }

        return paths;
      },
      formula: (p) =>
        `n_x = cosθ * ${p.noiseRadius}, n_y = sinθ * ${p.noiseRadius}\nnoise = noise((n_x+${p.noiseOffsetX})*${p.noiseScale}, (n_y+${p.noiseOffsetY})*${p.noiseScale} + i*${p.noiseLayer})\nr = r0 + ${p.amplitude} * noise`,
    };
})();
