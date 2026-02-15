/**
 * flowfield algorithm definition.
 */
export const flowfield = {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const paths = [];
        const count = Math.max(1, Math.floor(p.density));
        const noiseScale = p.noiseScale ?? 0.01;
        const octaves = Math.max(1, Math.floor(p.octaves ?? 1));
        const lacunarity = Math.max(1.1, p.lacunarity ?? 2);
        const gain = Math.min(1, Math.max(0.1, p.gain ?? 0.5));
        const noiseType = p.noiseType || 'simplex';
        const angleOffset = ((p.angleOffset ?? 0) * Math.PI) / 180;
        const chaos = p.chaos ?? 0;
        const maxSteps = Math.max(1, Math.floor(p.maxSteps ?? 50));
        const minSteps = Math.max(2, Math.floor(p.minSteps ?? 2));
        const minLength = Math.max(0, p.minLength ?? 0);

        const shapeNoise = (val, x, y) => {
          switch (noiseType) {
            case 'ridged':
              return (1 - Math.abs(val)) * 2 - 1;
            case 'billow':
              return Math.abs(val) * 2 - 1;
            case 'turbulence':
              return Math.abs(val) * 2 - 1;
            case 'swirl':
              return Math.sin(x * 2 + val * 2) * Math.cos(y * 2 + val);
            case 'radial':
              return Math.sin(Math.hypot(x, y) * 3 + val * 2);
            case 'checker': {
              const cx = Math.floor(x * 4);
              const cy = Math.floor(y * 4);
              return (cx + cy) % 2 === 0 ? 1 : -1;
            }
            default:
              return val;
          }
        };

        const sampleNoise = (x, y) => {
          let total = 0;
          let amp = 1;
          let freq = 1;
          let norm = 0;
          for (let i = 0; i < octaves; i++) {
            const nx = x * noiseScale * freq;
            const ny = y * noiseScale * freq;
            let val = noise.noise2D(nx, ny);
            val = shapeNoise(val, nx, ny);
            total += val * amp;
            norm += amp;
            amp *= gain;
            freq *= lacunarity;
          }
          return norm ? total / norm : total;
        };

        const curlAngle = (x, y) => {
          const eps = 0.0005;
          let dx = 0;
          let dy = 0;
          let amp = 1;
          let freq = 1;
          let norm = 0;
          for (let i = 0; i < octaves; i++) {
            const scale = noiseScale * freq;
            const n1 = noise.noise2D((x + eps) * scale, y * scale);
            const n2 = noise.noise2D((x - eps) * scale, y * scale);
            const n3 = noise.noise2D(x * scale, (y + eps) * scale);
            const n4 = noise.noise2D(x * scale, (y - eps) * scale);
            dx += (n1 - n2) * amp;
            dy += (n3 - n4) * amp;
            norm += amp;
            amp *= gain;
            freq *= lacunarity;
          }
          if (norm) {
            dx /= norm;
            dy /= norm;
          }
          return Math.atan2(dy, -dx);
        };
        for (let i = 0; i < count; i++) {
          const path = [];
          let x = m + rng.nextFloat() * dW;
          let y = m + rng.nextFloat() * dH;
          path.push({ x, y });
          let length = 0;
          for (let s = 0; s < maxSteps; s++) {
            let angle = 0;
            if (noiseType === 'curl') {
              angle = curlAngle(x, y) * (p.force ?? 1) + angleOffset;
            } else {
              const n = sampleNoise(x, y);
              angle = n * Math.PI * 2 * (p.force ?? 1) + angleOffset;
            }
            angle += (rng.nextFloat() - 0.5) * chaos;
            const dx = Math.cos(angle) * p.stepLen;
            const dy = Math.sin(angle) * p.stepLen;
            x += dx;
            y += dy;
            if (x < m || x > width - m || y < m || y > height - m) break;
            length += Math.hypot(dx, dy);
            path.push({ x, y });
          }
          if (path.length >= minSteps && length >= minLength) paths.push(path);
        }
        return paths;
      },
      formula: (p) =>
        `θ = noise(x * ${p.noiseScale}, y * ${p.noiseScale}) * 2π * ${p.force}\npos += [cos(θ), sin(θ)] * ${p.stepLen}`,
    };
