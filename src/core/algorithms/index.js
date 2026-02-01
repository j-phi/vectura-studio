/**
 * Procedural algorithm library.
 */
(() => {
  const Algorithms = {
    flowfield: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const paths = [];
        const count = Math.max(1, Math.floor((p.density * dW * dH) / 100000));
        for (let i = 0; i < count; i++) {
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
        const sepWeight = p.sepWeight ?? 1;
        const alignWeight = p.alignWeight ?? 1;
        const cohWeight = p.cohWeight ?? 1;
        const mode = p.mode || 'birds';
        const modeSep = mode === 'fish' ? 1.4 : 1;
        const modeAlign = mode === 'fish' ? 1.3 : 1;
        const modeCoh = mode === 'fish' ? 0.8 : 1;
        const verticalDamping = mode === 'fish' ? 0.9 : 1;
        const maxForce = Math.max(0.001, p.force);

        const setMag = (vx, vy, mag) => {
          const len = Math.sqrt(vx * vx + vy * vy) || 1;
          return { x: (vx / len) * mag, y: (vy / len) * mag };
        };

        const limit = (vx, vy, max) => {
          const len = Math.sqrt(vx * vx + vy * vy) || 0;
          if (len > max) return { x: (vx / len) * max, y: (vy / len) * max };
          return { x: vx, y: vy };
        };

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
            let sepCount = 0;
            let alignCount = 0;
            let cohCount = 0;
            boids.forEach((other) => {
              if (b === other) return;
              const dx = b.x - other.x;
              const dy = b.y - other.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < p.sepDist) {
                const safe = dist || 0.0001;
                sx += dx / safe;
                sy += dy / safe;
                sepCount++;
              }
              if (dist < p.alignDist) {
                ax += other.vx;
                ay += other.vy;
                alignCount++;
              }
              if (dist < p.cohDist) {
                cx += other.x;
                cy += other.y;
                cohCount++;
              }
            });

            let steerX = 0;
            let steerY = 0;

            if (sepCount > 0) {
              sx /= sepCount;
              sy /= sepCount;
              const desired = setMag(sx, sy, p.speed);
              const steer = limit(desired.x - b.vx, desired.y - b.vy, maxForce);
              steerX += steer.x * sepWeight * modeSep;
              steerY += steer.y * sepWeight * modeSep;
            }

            if (alignCount > 0) {
              ax /= alignCount;
              ay /= alignCount;
              const desired = setMag(ax, ay, p.speed);
              const steer = limit(desired.x - b.vx, desired.y - b.vy, maxForce);
              steerX += steer.x * alignWeight * modeAlign;
              steerY += steer.y * alignWeight * modeAlign;
            }

            if (cohCount > 0) {
              cx /= cohCount;
              cy /= cohCount;
              const desired = setMag(cx - b.x, cy - b.y, p.speed);
              const steer = limit(desired.x - b.vx, desired.y - b.vy, maxForce);
              steerX += steer.x * cohWeight * modeCoh;
              steerY += steer.y * cohWeight * modeCoh;
            }

            b.vx += steerX;
            b.vy += steerY;
            b.vy *= verticalDamping;
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
        let ax = rng.nextRange(-0.5, 0.5);
        let ay = rng.nextRange(-0.5, 0.5);
        let az = rng.nextRange(-0.5, 0.5);
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
        const MAX_BRANCHES = Math.max(10, Math.floor(p.maxBranches ?? 1000));
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
    shapePack: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const circles = [];
        const paths = [];
        const segments = Math.max(3, Math.floor(p.segments ?? 32));
        const minR = Math.max(0.1, p.minR);
        const maxR = Math.max(minR, p.maxR);
        const maxTries = Math.max(50, Math.floor(p.attempts ?? 200));
        const relaxSteps = 30;
        const shape = p.shape || 'circle';
        const rotationBase = (p.rotation ?? 0) * (Math.PI / 180);
        const rotationStep = (p.rotationStep ?? 0) * (Math.PI / 180);
        const perspectiveType = p.perspectiveType || 'none';
        const perspective = p.perspective ?? 0;
        const origin = {
          x: width / 2 + (p.perspectiveX ?? 0),
          y: height / 2 + (p.perspectiveY ?? 0),
        };
        const maxDist = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2) || 1;
        let tries = 0;

        const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

        const applyPerspective = (pt) => {
          if (shape === 'circle' || !perspective || perspectiveType === 'none') return pt;
          const dx = pt.x - origin.x;
          const dy = pt.y - origin.y;
          let scale = 1;
          if (perspectiveType === 'radial') {
            const dist = Math.sqrt(dx * dx + dy * dy);
            scale = 1 + (dist / maxDist) * perspective;
          } else if (perspectiveType === 'horizontal') {
            const t = dx / (width / 2);
            scale = 1 + t * perspective;
          } else {
            const t = dy / (height / 2);
            scale = 1 + t * perspective;
          }
          return { x: origin.x + dx * scale, y: origin.y + dy * scale };
        };

        while (circles.length < p.count && tries < maxTries) {
          let r = rng.nextRange(minR, maxR);
          let x = m + r + rng.nextFloat() * (dW - r * 2);
          let y = m + r + rng.nextFloat() * (dH - r * 2);
          const c = { x, y, r };

          for (let step = 0; step < relaxSteps; step++) {
            let moved = false;
            for (let other of circles) {
              const dx = c.x - other.x;
              const dy = c.y - other.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
              const target = c.r + other.r + p.padding;
              if (dist < target) {
                const overlap = target - dist;
                const nx = dx / dist;
                const ny = dy / dist;
                c.x += nx * overlap * 0.6;
                c.y += ny * overlap * 0.6;
                c.r = Math.max(minR, c.r - overlap * 0.15);
                moved = true;
              }
            }
            c.x = clamp(c.x, m + c.r, width - m - c.r);
            c.y = clamp(c.y, m + c.r, height - m - c.r);
            if (!moved) break;
          }

          let valid = true;
          for (let other of circles) {
            const dx = c.x - other.x;
            const dy = c.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < c.r + other.r + p.padding - 0.01) {
              valid = false;
              break;
            }
          }

          if (valid) circles.push(c);
          tries++;
        }

        circles.forEach((c, i) => {
          const cp = [];
          const stepCount = shape === 'circle' ? Math.max(24, segments) : Math.max(3, segments);
          const rot = rotationBase + rotationStep * i;
          for (let k = 0; k <= stepCount; k++) {
            const ang = (k / stepCount) * Math.PI * 2 + (shape === 'circle' ? 0 : rot);
            let pt = { x: c.x + Math.cos(ang) * c.r, y: c.y + Math.sin(ang) * c.r };
            if (shape !== 'circle') pt = applyPerspective(pt);
            cp.push(pt);
          }
          cp.meta =
            shape === 'circle'
              ? { kind: 'circle', cx: c.x, cy: c.y, r: c.r }
              : { kind: 'polygon', cx: c.x, cy: c.y, r: c.r, sides: stepCount, rotation: rot };
          paths.push(cp);
        });
        return paths;
      },
      formula: (p) =>
        `if dist(p, others) > r + ${p.padding}: add(shape(p, r))\nr = rand(${p.minR}, ${p.maxR})\nrot = ${p.rotation} + i * ${p.rotationStep}\nshape = ${p.shape}, sides = ${p.segments}\npersp = ${p.perspectiveType}(${p.perspective})`,
    },
    lissajous: {
      generate: (p, rng, noise, bounds) => {
        const { width, height } = bounds;
        const lcx = width / 2;
        const lcy = height / 2;
        const baseScale = Math.min(width, height) * 0.4;
        const scale = baseScale * (p.scale ?? 1);
        const lPath = [];
        const tMax = 200;
        const steps = Math.max(10, Math.floor(p.resolution));
        const tStep = tMax / steps;
        for (let t = 0; t < tMax; t += tStep) {
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
        const dampenExtremes = Boolean(p.dampenExtremes);
        const noOverlap = Boolean(p.noOverlap);
        const flatCaps = Boolean(p.flatCaps);
        const edgeFade = Math.min(1, Math.max(0, p.edgeFade ?? 0.2));
        const noiseAngle = ((p.noiseAngle ?? 0) * Math.PI) / 180;
        const cosA = Math.cos(noiseAngle);
        const sinA = Math.sin(noiseAngle);
        let prevY = null;
        for (let i = 0; i < p.lines; i++) {
          const path = [];
          const by = m + i * lSpace * p.gap;
          const xOffset = p.tilt * i;
          const currY = noOverlap ? new Array(pts + 1) : null;
          for (let j = 0; j <= pts; j++) {
            const x = m + j * xStep + xOffset;
            const nx = x * p.zoom * p.freq;
            const ny = by * p.zoom;
            const rx = nx * cosA - ny * sinA;
            const ry = nx * sinA + ny * cosA;
            const n = noise.noise2D(rx, ry);
            const off = n * p.amplitude;
            let taper = 1.0;
            const distC = Math.abs(j / pts - 0.5) * 2;
            if (edgeFade > 0) {
              const edgeStart = 1 - edgeFade;
              if (distC > edgeStart) taper = 1.0 - (distC - edgeStart) / edgeFade;
            }
            let y = by + off * taper;
            if (dampenExtremes) {
              const minY = m;
              const maxY = height - m;
              if (y < minY || y > maxY) {
                const limit = Math.max(0, y < minY ? by - minY : maxY - by);
                const denom = Math.max(0.001, Math.abs(off) * taper);
                const scale = Math.min(1, limit / denom);
                y = by + off * taper * scale;
              }
            }
            if (noOverlap && prevY) {
              const minGap = Math.max(0.1, lSpace * p.gap * 0.1);
              if (y < prevY[j] + minGap) y = prevY[j] + minGap;
            }
            path.push({ x, y });
            if (currY) currY[j] = y;
          }
          if (path.length > 1) paths.push(path);
          if (currY) prevY = currY;
        }

        if (flatCaps) {
          const top = [];
          const bottom = [];
          for (let j = 0; j <= pts; j++) {
            const x = m + j * xStep;
            top.push({ x, y: m });
            bottom.push({ x, y: height - m });
          }
          paths.push(top, bottom);
        }

        return paths;
      },
      formula: () => 'y = yBase + (noise(x,y) * amplitude)',
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
          const n = noise.noise2D(x * 0.05, y * 0.05);
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
      formula: () => 'θ = i * 137.5°, r = c√i\npos = [cos(θ)*r, sin(θ)*r]',
    },
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.Algorithms = Algorithms;
})();
