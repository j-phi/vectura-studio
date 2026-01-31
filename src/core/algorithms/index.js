/**
 * Procedural algorithm library.
 */
(() => {
  const Algorithms = {
    flowfield: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const paths = [];
        for (let i = 0; i < p.density; i++) {
          const path = [];
          let x = m + rng.nextFloat() * dW;
          let y = m + rng.nextFloat() * dH;
          path.push({ x, y });
          for (let s = 0; s < p.maxSteps; s++) {
            let n = noise.noise2D(x * p.noiseScale, y * p.noiseScale);
            if (p.octaves > 1) n += 0.5 * noise.noise2D(x * p.noiseScale * 2, y * p.noiseScale * 2);
            const angle = n * Math.PI * 2 * p.force + rng.nextFloat() * p.chaos;
            x += Math.cos(angle) * p.stepLen;
            y += Math.sin(angle) * p.stepLen;
            if (x < m || x > width - m || y < m || y > height - m) break;
            path.push({ x, y });
          }
          if (path.length > 1) paths.push(path);
        }
        return paths;
      },
      formula: (p) =>
        `θ = noise(x * ${p.noiseScale}, y * ${p.noiseScale}) * 2π * ${p.force}\npos += [cos(θ), sin(θ)] * ${p.stepLen}`,
    },
    boids: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const boids = [];
        for (let i = 0; i < p.count; i++) {
          boids.push({
            x: m + rng.nextFloat() * dW,
            y: m + rng.nextFloat() * dH,
            vx: (rng.nextFloat() - 0.5) * p.speed,
            vy: (rng.nextFloat() - 0.5) * p.speed,
            path: [],
          });
        }
        for (let t = 0; t < p.steps; t++) {
          boids.forEach((b) => {
            b.path.push({ x: b.x, y: b.y });
            let sx = 0;
            let sy = 0;
            let ax = 0;
            let ay = 0;
            let cx = 0;
            let cy = 0;
            let tot = 0;
            boids.forEach((other) => {
              if (b === other) return;
              const dx = b.x - other.x;
              const dy = b.y - other.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < p.sepDist) {
                sx += dx / dist;
                sy += dy / dist;
              }
              if (dist < p.alignDist) {
                ax += other.vx;
                ay += other.vy;
              }
              if (dist < p.cohDist) {
                cx += other.x;
                cy += other.y;
                tot++;
              }
            });
            if (tot > 0) {
              cx = (cx / tot - b.x) * 0.01;
              cy = (cy / tot - b.y) * 0.01;
              ax = (ax / tot - b.vx) * 0.05;
              ay = (ay / tot - b.vy) * 0.05;
            }
            b.vx += sx * p.force + ax + cx;
            b.vy += sy * p.force + ay + cy;
            const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            if (sp > p.speed) {
              b.vx = (b.vx / sp) * p.speed;
              b.vy = (b.vy / sp) * p.speed;
            }
            b.x += b.vx;
            b.y += b.vy;
            if (b.x < m) b.vx *= -1;
            if (b.x > width - m) b.vx *= -1;
            if (b.y < m) b.vy *= -1;
            if (b.y > height - m) b.vy *= -1;
          });
        }
        return boids.map((b) => b.path);
      },
      formula: (p) =>
        `v += separate * ${p.sepDist} + align * ${p.alignDist} + cohere * ${p.cohDist}\npos += v * ${p.speed}`,
    },
    attractor: {
      generate: (p, rng, noise, bounds) => {
        const { width, height } = bounds;
        const dt = p.dt;
        let ax = 0.1;
        let ay = 0;
        let az = 0;
        const aPath = [];
        const cx = width / 2;
        const cy = height / 2;
        for (let i = 0; i < p.iter; i++) {
          let dx;
          let dy;
          let dz;
          if (p.type === 'lorenz') {
            dx = p.sigma * (ay - ax);
            dy = ax * (p.rho - az) - ay;
            dz = ax * ay - p.beta * az;
          } else {
            dx = (az - 0.7) * ax - 3.5 * ay;
            dy = 3.5 * ax + (az - 0.7) * ay;
            dz =
              0.6 +
              0.95 * az -
              (az * az * az) / 3 -
              (ax * ax + ay * ay) * (1 + 0.25 * az) +
              0.1 * az * (ax * ax * ax);
          }
          ax += dx * dt;
          ay += dy * dt;
          az += dz * dt;
          aPath.push({ x: cx + ax * p.scale, y: cy + ay * p.scale });
        }
        return [aPath];
      },
      formula: (p) => `dx = ${p.sigma}(y - x)\ndy = x(${p.rho} - z) - y\ndz = xy - ${p.beta}z`,
    },
    hyphae: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const branches = [];
        const paths = [];
        const MAX_BRANCHES = 1000;
        for (let i = 0; i < p.sources; i++) {
          branches.push({
            x: m + rng.nextFloat() * dW,
            y: m + rng.nextFloat() * dH,
            angle: rng.nextFloat() * Math.PI * 2,
            path: [],
          });
        }
        for (let t = 0; t < p.steps; t++) {
          if (branches.length >= MAX_BRANCHES) break;
          for (let i = branches.length - 1; i >= 0; i--) {
            const b = branches[i];
            b.path.push({ x: b.x, y: b.y });
            b.x += Math.cos(b.angle) * p.segLen;
            b.y += Math.sin(b.angle) * p.segLen;
            b.angle += (rng.nextFloat() - 0.5) * p.angleVar;
            if (rng.nextFloat() < p.branchProb && branches.length < MAX_BRANCHES) {
              branches.push({
                x: b.x,
                y: b.y,
                angle: b.angle + Math.PI / 2,
                path: [],
              });
            }
            if (b.x < m || b.x > width - m || b.y < m || b.y > height - m) {
              branches.splice(i, 1);
              paths.push(b.path);
            }
          }
        }
        branches.forEach((b) => paths.push(b.path));
        return paths;
      },
      formula: (p) =>
        `pos += [cos(α), sin(α)] * ${p.segLen}\nif rand() < ${p.branchProb}: branch(α + π/2)`,
    },
    circles: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH } = bounds;
        const circles = [];
        const paths = [];
        for (let i = 0; i < p.attempts; i++) {
          if (circles.length >= p.count) break;
          const r = rng.nextRange(p.minR, p.maxR);
          const cx = m + r + rng.nextFloat() * (dW - r * 2);
          const cy = m + r + rng.nextFloat() * (dH - r * 2);
          let valid = true;
          for (let c of circles) {
            const d = Math.sqrt((cx - c.x) ** 2 + (cy - c.y) ** 2);
            if (d < c.r + r + p.padding) {
              valid = false;
              break;
            }
          }
          if (valid) {
            circles.push({ x: cx, y: cy, r: r });
            const cp = [];
            for (let k = 0; k <= 32; k++) {
              const ang = (k / 32) * Math.PI * 2;
              cp.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
            }
            paths.push(cp);
          }
        }
        return paths;
      },
      formula: (p) =>
        `if dist(p, others) > r + ${p.padding}: add(circle(p, r))\nr = rand(${p.minR}, ${p.maxR})`,
    },
    lissajous: {
      generate: (p, rng, noise, bounds) => {
        const { width, height } = bounds;
        const lcx = width / 2;
        const lcy = height / 2;
        const scale = Math.min(width, height) * 0.4;
        const lPath = [];
        for (let t = 0; t < 200; t += 0.05) {
          const amp = Math.exp(-p.damping * t);
          if (amp < 0.01) break;
          let lx = Math.sin(p.freqX * t + p.phase);
          let ly = Math.sin(p.freqY * t);
          if (p.rotation !== 0) {
            const rot = p.rotation * (Math.PI / 180);
            const rx = lx * Math.cos(rot) - ly * Math.sin(rot);
            const ry = lx * Math.sin(rot) + ly * Math.cos(rot);
            lx = rx;
            ly = ry;
          }
          lPath.push({ x: lcx + lx * scale * amp, y: lcy + ly * scale * amp });
        }
        return [lPath];
      },
      formula: (p) =>
        `x = sin(${p.freqX}t + ${p.phase})\ny = sin(${p.freqY}t)\namp = e^(-${p.damping}t)`,
    },
    wavetable: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, height } = bounds;
        const paths = [];
        const lSpace = dH / p.lines;
        const pts = Math.floor(dW / 2);
        const xStep = dW / pts;
        for (let i = 0; i < p.lines; i++) {
          const path = [];
          const by = m + i * lSpace * p.gap + p.tilt * i;
          for (let j = 0; j <= pts; j++) {
            const x = m + j * xStep;
            const n = noise.noise2D(x * p.zoom * p.freq, by * p.zoom);
            const off = Math.abs(n) * p.amplitude;
            let taper = 1.0;
            const distC = Math.abs(j / pts - 0.5) * 2;
            if (distC > 0.8) taper = 1.0 - (distC - 0.8) / 0.2;
            const y = by - off * taper;
            if (y > m && y < height - m) path.push({ x, y });
          }
          if (path.length > 1) paths.push(path);
        }
        return paths;
      },
      formula: () => 'y = yBase - (|noise(x,y)| * amplitude)',
    },
    spiral: {
      generate: (p, rng, noise, bounds) => {
        const { dW, dH, width, height } = bounds;
        const scx = width / 2;
        const scy = height / 2;
        const spath = [];
        let r = p.startR;
        let theta = 0;
        const maxR = Math.min(dW, dH) / 2;
        const dr = (maxR - p.startR) / (p.loops * p.res);
        const dTheta = (Math.PI * 2) / p.res;
        while (r < maxR) {
          const n = noise.noise2D(Math.cos(theta) * p.noiseFreq, Math.sin(theta) * p.noiseFreq);
          const rMod = r + n * p.noiseAmp;
          spath.push({ x: scx + Math.cos(theta) * rMod, y: scy + Math.sin(theta) * rMod });
          theta += dTheta;
          r += dr;
        }
        return [spath];
      },
      formula: () => 'r = r + (noise(θ) * amp)\nx = cos(θ)*r, y = sin(θ)*r',
    },
    grid: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH } = bounds;
        const paths = [];
        const colW = dW / p.cols;
        const rowH = dH / p.rows;
        for (let r = 0; r <= p.rows; r++) {
          const path = [];
          for (let c = 0; c <= p.cols; c++) {
            let x = m + c * colW;
            let y = m + r * rowH;
            const n = noise.noise2D(x * p.noiseScale, y * p.noiseScale);
            if (p.type === 'warp') {
              x += Math.cos(n * Math.PI) * p.distortion;
              y += Math.sin(n * Math.PI) * p.distortion;
            } else {
              y += n * p.distortion;
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
            const n = noise.noise2D(x * p.noiseScale, y * p.noiseScale);
            if (p.type === 'warp') {
              x += Math.cos(n * Math.PI) * p.distortion;
              y += Math.sin(n * Math.PI) * p.distortion;
            } else {
              y += n * p.distortion;
            }
            x += (rng.nextFloat() - 0.5) * p.chaos;
            y += (rng.nextFloat() - 0.5) * p.chaos;
            path.push({ x, y });
          }
          paths.push(path);
        }
        return paths;
      },
      formula: () => 'pos += noise(x,y) * distortion',
    },
    phylla: {
      generate: (p, rng, noise, bounds) => {
        const { m, width, height } = bounds;
        const paths = [];
        const pcx = width / 2;
        const pcy = height / 2;
        const angleStep = p.angleStr * (Math.PI / 180);
        for (let i = 0; i < p.count; i++) {
          const r = p.spacing * Math.sqrt(i) * p.divergence;
          const a = i * angleStep;
          let x = pcx + r * Math.cos(a);
          let y = pcy + r * Math.sin(a);
          const n = noise.noise2D(x * 0.05, y * 0.05);
          x += n * p.noiseInf;
          y += n * p.noiseInf;
          const circle = [];
          for (let k = 0; k <= 8; k++) {
            const ca = (k / 8) * Math.PI * 2;
            circle.push({ x: x + Math.cos(ca) * 1, y: y + Math.sin(ca) * 1 });
          }
          if (x > m && x < width - m && y > m && y < height - m) paths.push(circle);
        }
        return paths;
      },
      formula: () => 'θ = i * 137.5°, r = c√i\npos = [cos(θ)*r, sin(θ)*r]',
    },
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.Algorithms = Algorithms;
})();
