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
        const truncate = Boolean(p.truncate);
        const flatCaps = Boolean(p.flatCaps);
        const edgeFade = Math.min(0.45, Math.max(0, p.edgeFade ?? 0.2));
        const noiseAngle = ((p.noiseAngle ?? 0) * Math.PI) / 180;
        const cosA = Math.cos(noiseAngle);
        const sinA = Math.sin(noiseAngle);
        for (let i = 0; i < p.lines; i++) {
          const path = [];
          let hasOutOfBounds = false;
          const by = m + i * lSpace * p.gap;
          const xOffset = p.tilt * i;
          for (let j = 0; j <= pts; j++) {
            const x = m + j * xStep + xOffset;
            const nx = x * p.zoom * p.freq;
            const ny = by * p.zoom;
            const rx = nx * cosA - ny * sinA;
            const ry = nx * sinA + ny * cosA;
            const n = noise.noise2D(rx, ry);
            const off = Math.abs(n) * p.amplitude;
            let taper = 1.0;
            const distC = Math.abs(j / pts - 0.5) * 2;
            if (edgeFade > 0) {
              const edgeStart = 1 - edgeFade;
              if (distC > edgeStart) taper = 1.0 - (distC - edgeStart) / edgeFade;
            }
            const y = by - off * taper;
            const inside = y > m && y < height - m;
            if (!inside) hasOutOfBounds = true;
            if (truncate) {
              if (inside) path.push({ x, y });
            } else {
              path.push({ x, y });
            }
          }
          if (!truncate && hasOutOfBounds) continue;
          if (path.length > 1) paths.push(path);
        }

        if (truncate || flatCaps) {
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
        const dotSize = Math.max(0.1, p.dotSize ?? 1);
        const angleOffset = rng.nextFloat() * Math.PI * 2;
        for (let i = 0; i < p.count; i++) {
          const r = p.spacing * Math.sqrt(i) * p.divergence;
          const a = i * angleStep + angleOffset;
          let x = pcx + r * Math.cos(a);
          let y = pcy + r * Math.sin(a);
          const n = noise.noise2D(x * 0.05, y * 0.05);
          x += n * p.noiseInf;
          y += n * p.noiseInf;
          const circle = [];
          for (let k = 0; k <= 8; k++) {
            const ca = (k / 8) * Math.PI * 2;
            circle.push({ x: x + Math.cos(ca) * dotSize, y: y + Math.sin(ca) * dotSize });
          }
          if (x > m && x < width - m && y > m && y < height - m) paths.push(circle);
        }
        return paths;
      },
      formula: () => 'θ = i * 137.5°, r = c√i\npos = [cos(θ)*r, sin(θ)*r]',
    },
    cityscape: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const root = { x: m, y: m, w: dW, h: dH };
        const candidates = [root];
        const settled = [];
        const maxCount = Math.max(10, Math.floor(p.count));
        const minSize = Math.max(2, p.minSize ?? 6);
        let guard = 0;

        const splitRect = (rect) => {
          const ratio = rng.nextRange(0.35, 0.65);
          const wide = rect.w / rect.h > 1.2;
          const tall = rect.h / rect.w > 1.2;
          const splitVertical = wide ? true : tall ? false : rng.nextFloat() > 0.5;
          if (splitVertical) {
            const w1 = rect.w * ratio;
            const w2 = rect.w - w1;
            if (w1 < minSize || w2 < minSize) return null;
            return [
              { x: rect.x, y: rect.y, w: w1, h: rect.h },
              { x: rect.x + w1, y: rect.y, w: w2, h: rect.h },
            ];
          }
          const h1 = rect.h * ratio;
          const h2 = rect.h - h1;
          if (h1 < minSize || h2 < minSize) return null;
          return [
            { x: rect.x, y: rect.y, w: rect.w, h: h1 },
            { x: rect.x, y: rect.y + h1, w: rect.w, h: h2 },
          ];
        };

        while (candidates.length && settled.length + candidates.length < maxCount && guard < maxCount * 10) {
          candidates.sort((a, b) => b.w * b.h - a.w * a.h);
          const rect = candidates.shift();
          if (!rect) break;
          if (rect.w < minSize * 2 || rect.h < minSize * 2) {
            settled.push(rect);
            guard++;
            continue;
          }
          const parts = splitRect(rect);
          if (!parts) {
            settled.push(rect);
            guard++;
            continue;
          }
          candidates.push(...parts);
          guard++;
        }

        const rects = [...settled, ...candidates];
        rects.sort((a, b) => b.w * b.h - a.w * a.h);
        const trimmed = rects.slice(0, maxCount);

        const pad = Math.max(0, p.padding ?? 0);
        const voidChance = Math.max(0, Math.min(1, p.voidChance ?? 0));
        const centerX = m + dW / 2;
        const centerY = m + dH / 2;
        const maxDist = Math.sqrt((dW / 2) ** 2 + (dH / 2) ** 2);
        const heightMin = p.heightMin ?? 10;
        const heightRange = p.heightRange ?? 120;
        const heightVar = Math.max(0, Math.min(1, p.heightVar ?? 0.2));
        const heightFalloff = p.heightFalloff ?? 1.4;
        const noiseAmp = p.heightNoise ?? 0;
        const noiseFreq = p.heightNoiseFreq ?? 0.02;
        const hatchSpacing = Math.max(0.5, p.hatchSpacing ?? 2);
        const hatchJitter = Math.max(0, p.hatchJitter ?? 0);
        const topOutline = Boolean(p.topOutline);
        const showPerspective = Boolean(p.showPerspective);
        const lineScale = p.perspective ?? 1;
        const coreSize = Math.max(10, p.coreSize ?? Math.min(dW, dH) * 0.2);
        const coreHalf = coreSize / 2;
        const coreX = Math.min(width - m - coreHalf, Math.max(m + coreHalf, centerX + (p.coreX ?? 0)));
        const coreY = Math.min(height - m - coreHalf, Math.max(m + coreHalf, centerY + (p.coreY ?? 0)));
        const coreCenter = { x: coreX, y: coreY };

        const vpTop = {
          x: centerX + (p.vpTopX ?? 0),
          y: centerY + (p.vpTopY ?? -dH * 2.5),
        };
        const vpRight = {
          x: centerX + (p.vpRightX ?? dW * 2.8),
          y: centerY + (p.vpRightY ?? 0),
        };
        const vpBottom = {
          x: centerX + (p.vpBottomX ?? 0),
          y: centerY + (p.vpBottomY ?? dH * 2.5),
        };
        const vpLeft = {
          x: centerX + (p.vpLeftX ?? -dW * 2.8),
          y: centerY + (p.vpLeftY ?? 0),
        };

        const norm = (vx, vy) => {
          const len = Math.sqrt(vx * vx + vy * vy);
          if (len < 0.0001) return { x: 0, y: 0 };
          return { x: vx / len, y: vy / len };
        };

        const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

        const lineIntersection = (a1, a2, b1, b2) => {
          const dx1 = a2.x - a1.x;
          const dy1 = a2.y - a1.y;
          const dx2 = b2.x - b1.x;
          const dy2 = b2.y - b1.y;
          const denom = dx1 * dy2 - dy1 * dx2;
          if (Math.abs(denom) < 1e-6) return null;
          const t = ((b1.x - a1.x) * dy2 - (b1.y - a1.y) * dx2) / denom;
          return { x: a1.x + t * dx1, y: a1.y + t * dy1 };
        };

        const lineSegIntersection = (a1, a2, b1, b2) => {
          const pt = lineIntersection(a1, a2, b1, b2);
          if (!pt) return null;
          const minX = Math.min(b1.x, b2.x) - 0.01;
          const maxX = Math.max(b1.x, b2.x) + 0.01;
          const minY = Math.min(b1.y, b2.y) - 0.01;
          const maxY = Math.max(b1.y, b2.y) + 0.01;
          if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY) return null;
          return pt;
        };

        const pointInPoly = (pt, poly) => {
          let inside = false;
          for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const xi = poly[i].x;
            const yi = poly[i].y;
            const xj = poly[j].x;
            const yj = poly[j].y;
            const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.00001) + xi;
            if (intersect) inside = !inside;
          }
          return inside;
        };

        const polysIntersect = (polyA, polyB) => {
          for (let i = 0; i < polyA.length; i++) {
            const a1 = polyA[i];
            const a2 = polyA[(i + 1) % polyA.length];
            for (let j = 0; j < polyB.length; j++) {
              const b1 = polyB[j];
              const b2 = polyB[(j + 1) % polyB.length];
              if (segmentIntersectT(a1, a2, b1, b2) !== null) return true;
            }
          }
          if (pointInPoly(polyA[0], polyB)) return true;
          if (pointInPoly(polyB[0], polyA)) return true;
          return false;
        };

        const segmentIntersectT = (a, b, c, d) => {
          const dx1 = b.x - a.x;
          const dy1 = b.y - a.y;
          const dx2 = d.x - c.x;
          const dy2 = d.y - c.y;
          const denom = dx1 * dy2 - dy1 * dx2;
          if (Math.abs(denom) < 1e-6) return null;
          const t = ((c.x - a.x) * dy2 - (c.y - a.y) * dx2) / denom;
          const u = ((c.x - a.x) * dy1 - (c.y - a.y) * dx1) / denom;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
          return null;
        };

        const clipSegment = (start, end, occluders) => {
          for (const poly of occluders) {
            if (pointInPoly(start, poly)) return null;
          }
          let minT = 1;
          for (const poly of occluders) {
            for (let i = 0; i < poly.length; i++) {
              const c = poly[i];
              const d = poly[(i + 1) % poly.length];
              const t = segmentIntersectT(start, end, c, d);
              if (t !== null && t < minT) minT = t;
            }
          }
          if (minT < 1) {
            return {
              x: start.x + (end.x - start.x) * minT,
              y: start.y + (end.y - start.y) * minT,
            };
          }
          return end;
        };

        const dirTop = norm(vpTop.x - coreX, vpTop.y - coreY);
        const dirRight = norm(vpRight.x - coreX, vpRight.y - coreY);
        const dirBottom = norm(vpBottom.x - coreX, vpBottom.y - coreY);
        const dirLeft = norm(vpLeft.x - coreX, vpLeft.y - coreY);

        const cTop = { x: coreX + dirTop.x * coreHalf, y: coreY + dirTop.y * coreHalf };
        const cRight = { x: coreX + dirRight.x * coreHalf, y: coreY + dirRight.y * coreHalf };
        const cBottom = { x: coreX + dirBottom.x * coreHalf, y: coreY + dirBottom.y * coreHalf };
        const cLeft = { x: coreX + dirLeft.x * coreHalf, y: coreY + dirLeft.y * coreHalf };
        const corePoly = [cTop, cRight, cBottom, cLeft];

        const coreEdgeH = { a: cTop, b: cBottom };
        const coreEdgeV = { a: cLeft, b: cRight };

        const buildings = [];
        const paths = [];

        if (showPerspective) {
          paths.push([vpLeft, cTop], [vpLeft, cBottom], [vpRight, cTop], [vpRight, cBottom]);
          paths.push([vpTop, cLeft], [vpTop, cRight], [vpBottom, cLeft], [vpBottom, cRight]);
        }

        trimmed.forEach((rect) => {
          if (rng.nextFloat() < voidChance) return;
          const x = rect.x + pad * 0.5;
          const y = rect.y + pad * 0.5;
          const w = rect.w - pad;
          const h = rect.h - pad;
          if (w < minSize || h < minSize) return;

          const cx = x + w / 2;
          const cy = y + h / 2;
          const dist = Math.sqrt((cx - centerX) ** 2 + (cy - centerY) ** 2);
          const radial = Math.max(0, 1 - dist / maxDist);
          const radialPow = Math.pow(radial, heightFalloff);
          const noiseVal = noise.noise2D(cx * noiseFreq, cy * noiseFreq);
          const jitter = (rng.nextFloat() * 2 - 1) * heightVar * heightRange;
          const baseHeight = heightMin + radialPow * heightRange + noiseVal * noiseAmp + jitter;
          const height = Math.max(1, baseHeight);
          const heightNorm = Math.max(0, Math.min(1, height / Math.max(1, heightMin + heightRange)));

          const u = Math.max(0.05, Math.min(0.95, (cy - m) / dH));
          const v = Math.max(0.05, Math.min(0.95, (cx - m) / dW));
          const du = Math.max(0.02, Math.min(0.35, (h / dH) * 0.8));
          const dv = Math.max(0.02, Math.min(0.35, (w / dW) * 0.8));
          const u0 = Math.max(0.02, Math.min(0.98, u - du / 2));
          const u1 = Math.max(0.02, Math.min(0.98, u + du / 2));
          const v0 = Math.max(0.02, Math.min(0.98, v - dv / 2));
          const v1 = Math.max(0.02, Math.min(0.98, v + dv / 2));

          const pLeftEdge = lerp(coreEdgeH.a, coreEdgeH.b, u0);
          const pRightEdge = lerp(coreEdgeH.a, coreEdgeH.b, u1);
          const pTopEdge = lerp(coreEdgeV.a, coreEdgeV.b, v0);
          const pBottomEdge = lerp(coreEdgeV.a, coreEdgeV.b, v1);

          const topLeft = lineIntersection(vpLeft, pLeftEdge, vpTop, pTopEdge);
          const topRight = lineIntersection(vpRight, pRightEdge, vpTop, pTopEdge);
          const bottomRight = lineIntersection(vpRight, pRightEdge, vpBottom, pBottomEdge);
          const bottomLeft = lineIntersection(vpLeft, pLeftEdge, vpBottom, pBottomEdge);
          if (!topLeft || !topRight || !bottomRight || !bottomLeft) return;

          const roof = [topLeft, topRight, bottomRight, bottomLeft];
          if (polysIntersect(roof, corePoly)) return;

          const roofCenter = {
            x: (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4,
            y: (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4,
          };

          buildings.push({
            roof,
            dist: Math.sqrt((roofCenter.x - coreX) ** 2 + (roofCenter.y - coreY) ** 2),
            heightNorm,
            u0,
            u1,
            v0,
            v1,
          });
        });

        buildings.sort((a, b) => a.dist - b.dist);
        const occluders = [];

        buildings.forEach((b) => {
          const faces = [
            { key: 'left', vp: vpLeft, edge: [b.roof[0], b.roof[3]], coreEdge: coreEdgeH, t0: b.u0, t1: b.u1 },
            { key: 'right', vp: vpRight, edge: [b.roof[1], b.roof[2]], coreEdge: coreEdgeH, t0: b.u0, t1: b.u1 },
            { key: 'top', vp: vpTop, edge: [b.roof[0], b.roof[1]], coreEdge: coreEdgeV, t0: b.v0, t1: b.v1 },
            { key: 'bottom', vp: vpBottom, edge: [b.roof[3], b.roof[2]], coreEdge: coreEdgeV, t0: b.v0, t1: b.v1 },
          ];

          const faceScores = faces.map((face) => {
            const mid = { x: (face.edge[0].x + face.edge[1].x) / 2, y: (face.edge[0].y + face.edge[1].y) / 2 };
            const toCore = norm(coreX - mid.x, coreY - mid.y);
            const edgeDir = norm(face.edge[1].x - face.edge[0].x, face.edge[1].y - face.edge[0].y);
            const normal = { x: -edgeDir.y, y: edgeDir.x };
            const score = normal.x * toCore.x + normal.y * toCore.y;
            return { ...face, score };
          });

          faceScores.sort((a, b) => b.score - a.score);
          const visibleFaces = faceScores.filter((f) => f.score > 0.1).slice(0, 2);
          if (topOutline) paths.push([...b.roof, b.roof[0]]);
          if (!visibleFaces.length) {
            occluders.push(b.roof);
            return;
          }

          const edgeLens = visibleFaces.map((face) => {
            const dx = face.edge[1].x - face.edge[0].x;
            const dy = face.edge[1].y - face.edge[0].y;
            return Math.sqrt(dx * dx + dy * dy);
          });
          const minEdgeLen = Math.min(...edgeLens);
          const density = Math.max(1, Math.floor((minEdgeLen / hatchSpacing) * lineScale));
          const lineCount = Math.max(1, Math.min(240, density));

          visibleFaces.forEach((face) => {
            for (let i = 0; i < lineCount; i++) {
              const base = (i + 0.5) / lineCount;
              const jitter = (rng.nextFloat() - 0.5) * hatchJitter / lineCount;
              const t = Math.min(1, Math.max(0, base + jitter));
              const corePoint = lerp(face.coreEdge.a, face.coreEdge.b, face.t0 + (face.t1 - face.t0) * t);
              const roofPoint = lineSegIntersection(face.vp, corePoint, face.edge[0], face.edge[1]);
              if (!roofPoint) continue;
              const basePoint = {
                x: roofPoint.x + (corePoint.x - roofPoint.x) * b.heightNorm,
                y: roofPoint.y + (corePoint.y - roofPoint.y) * b.heightNorm,
              };
              const clipped = clipSegment(roofPoint, basePoint, occluders);
              if (clipped) paths.push([roofPoint, clipped]);
            }
          });

          occluders.push(b.roof);
        });

        return paths;
      },
      formula: (p) =>
        `height = (${p.heightMin} + falloff(dist)^${p.heightFalloff} * ${p.heightRange})\nline = VP -> core edge`,
    },
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.Algorithms = Algorithms;
})();
