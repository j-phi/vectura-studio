/**
 * Procedural algorithm library.
 */
(() => {
  const Algorithms = {
    flowfield: {
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
          const rot = rotationStep * i;
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
        `if dist(p, others) > r + ${p.padding}: add(shape(p, r))\nr = rand(${p.minR}, ${p.maxR})\nrot = i * ${p.rotationStep}\nshape = ${p.shape}, sides = ${p.segments}\npersp = ${p.perspectiveType}(${p.perspective})`,
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
        const intersects = (a, b, c, d) => {
          const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
          if (Math.abs(den) < 1e-6) return null;
          const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
          const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
          if (t <= 1e-4 || t >= 1 - 1e-4 || u <= 1e-4 || u >= 1 - 1e-4) return null;
          return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), t };
        };
        let closed = false;
        for (let t = 0; t < tMax; t += tStep) {
          const amp = Math.exp(-p.damping * t);
          if (amp < 0.01) break;
          let lx = Math.sin(p.freqX * t + p.phase);
          let ly = Math.sin(p.freqY * t);
          const next = { x: lcx + lx * scale * amp, y: lcy + ly * scale * amp };
          if (p.closeLines && lPath.length > 2) {
            const prev = lPath[lPath.length - 1];
            let hit = null;
            for (let i = 0; i < lPath.length - 2; i++) {
              const a = lPath[i];
              const b = lPath[i + 1];
              const inter = intersects(prev, next, a, b);
              if (inter && (!hit || inter.t < hit.t)) hit = inter;
            }
            if (hit) {
              lPath.push({ x: hit.x, y: hit.y });
              closed = true;
              break;
            }
          }
          lPath.push(next);
        }
        if (p.closeLines && lPath.length > 2 && !closed) {
          lPath.push({ ...lPath[0] });
        }
        return [lPath];
      },
      formula: (p) =>
        `x = sin(${p.freqX}t + ${p.phase})\ny = sin(${p.freqY}t)\namp = e^(-${p.damping}t)`,
    },
    harmonograph: {
      generate: (p, rng, noise, bounds) => {
        const { width, height } = bounds;
        const cx = width / 2;
        const cy = height / 2;
        const samples = Math.max(200, Math.floor(p.samples ?? 4000));
        const duration = Math.max(1, p.duration ?? 30);
        const scale = p.scale ?? 1;
        const rotSpeed = (p.paperRotation ?? 0) * Math.PI * 2;
        const gapSize = Math.max(0, p.gapSize ?? 0);
        const gapOffset = Math.max(0, p.gapOffset ?? 0);
        const gapRandomness = Math.max(0, Math.min(1, p.gapRandomness ?? 0));
        const widthMultiplier = Math.max(1, Math.round(p.widthMultiplier ?? 1));
        const thickeningMode = p.thickeningMode || 'parallel';

        const normalizePendulums = () => {
          if (Array.isArray(p.pendulums) && p.pendulums.length) {
            return p.pendulums.map((pend) => ({
              ax: pend.ampX ?? 0,
              ay: pend.ampY ?? 0,
              phaseX: ((pend.phaseX ?? 0) * Math.PI) / 180,
              phaseY: ((pend.phaseY ?? 0) * Math.PI) / 180,
              freq: pend.freq ?? 1,
              micro: pend.micro ?? 0,
              damp: Math.max(0, pend.damp ?? 0),
              enabled: pend.enabled !== false,
            }));
          }
          return [
            {
              ax: p.ampX1 ?? 0,
              ay: p.ampY1 ?? 0,
              phaseX: ((p.phaseX1 ?? 0) * Math.PI) / 180,
              phaseY: ((p.phaseY1 ?? 0) * Math.PI) / 180,
              freq: p.freq1 ?? 1,
              micro: p.micro1 ?? 0,
              damp: Math.max(0, p.damp1 ?? 0),
              enabled: true,
            },
            {
              ax: p.ampX2 ?? 0,
              ay: p.ampY2 ?? 0,
              phaseX: ((p.phaseX2 ?? 0) * Math.PI) / 180,
              phaseY: ((p.phaseY2 ?? 0) * Math.PI) / 180,
              freq: p.freq2 ?? 1,
              micro: p.micro2 ?? 0,
              damp: Math.max(0, p.damp2 ?? 0),
              enabled: true,
            },
            {
              ax: p.ampX3 ?? 0,
              ay: p.ampY3 ?? 0,
              phaseX: ((p.phaseX3 ?? 0) * Math.PI) / 180,
              phaseY: ((p.phaseY3 ?? 0) * Math.PI) / 180,
              freq: p.freq3 ?? 1,
              micro: p.micro3 ?? 0,
              damp: Math.max(0, p.damp3 ?? 0),
              enabled: true,
            },
          ];
        };

        const pendulums = normalizePendulums().filter((pend) => pend.enabled !== false);
        if (!pendulums.length) return [];

        const buildPath = (set, count) => {
          const path = [];
          const localDt = duration / count;
          for (let i = 0; i <= count; i++) {
            const t = i * localDt;
            let x = 0;
            let y = 0;
            set.forEach((pend) => {
              const freq = (pend.freq + pend.micro) * Math.PI * 2;
              const decay = Math.exp(-pend.damp * t);
              x += pend.ax * Math.sin(freq * t + pend.phaseX) * decay;
              y += pend.ay * Math.sin(freq * t + pend.phaseY) * decay;
            });
            x *= scale;
            y *= scale;
            if (rotSpeed) {
              const ang = rotSpeed * t;
              const rx = x * Math.cos(ang) - y * Math.sin(ang);
              const ry = x * Math.sin(ang) + y * Math.cos(ang);
              x = rx;
              y = ry;
            }
            path.push({ x: cx + x, y: cy + y });
          }
          return path;
        };

        const path = buildPath(pendulums, samples);

        const buildSegmentData = (path) => {
          const segs = [];
          let total = 0;
          for (let i = 1; i < path.length; i++) {
            const a = path[i - 1];
            const b = path[i];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (!len) continue;
            segs.push({ a, b, len, start: total });
            total += len;
          }
          return { segs, total };
        };
        const slicePathByDistance = (data, start, end) => {
          if (end <= start) return null;
          const points = [];
          const pushPoint = (pt) => {
            const last = points[points.length - 1];
            if (!last || last.x !== pt.x || last.y !== pt.y) points.push(pt);
          };
          for (let i = 0; i < data.segs.length; i++) {
            const seg = data.segs[i];
            const segStart = seg.start;
            const segEnd = seg.start + seg.len;
            if (segEnd < start) continue;
            if (segStart > end) break;
            if (start >= segStart && start <= segEnd) {
              const t = (start - segStart) / seg.len;
              pushPoint({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
            } else if (segStart >= start) {
              pushPoint(seg.a);
            }
            if (segEnd <= end) {
              pushPoint(seg.b);
            }
            if (end >= segStart && end <= segEnd) {
              const t = (end - segStart) / seg.len;
              pushPoint({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
              break;
            }
          }
          return points.length > 1 ? points : null;
        };
        const iterateSamples = (data, spacing, offset, randomness, cb) => {
          let cursor = Math.max(0, offset);
          let segIndex = 0;
          const segs = data.segs;
          while (cursor <= data.total && segIndex < segs.length) {
            while (segIndex < segs.length && cursor > segs[segIndex].start + segs[segIndex].len) segIndex += 1;
            if (segIndex >= segs.length) break;
            const seg = segs[segIndex];
            const t = (cursor - seg.start) / seg.len;
            const pt = { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
            const tangent = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y };
            cb(pt, tangent);
            const jitter = randomness ? (rng.nextFloat() * 2 - 1) * randomness : 0;
            const step = spacing * (1 + jitter);
            cursor += Math.max(0.1, step);
          }
        };

        const applyThickening = (paths) => {
          if (widthMultiplier <= 1) return paths;
          const spacing = 0.35;
          const offsets = [];
          const half = (widthMultiplier - 1) / 2;
          for (let i = 0; i < widthMultiplier; i++) {
            offsets.push((i - half) * spacing);
          }
          const thickened = [];
          paths.forEach((path) => {
            if (!Array.isArray(path) || path.length < 2) return;
            const normals = path.map((pt, i) => {
              const prev = path[i - 1] || pt;
              const next = path[i + 1] || pt;
              const dx = next.x - prev.x;
              const dy = next.y - prev.y;
              const mag = Math.hypot(dx, dy) || 1;
              return { x: -dy / mag, y: dx / mag };
            });
            const phase = rng.nextFloat() * Math.PI * 2;
            const waveFreq = 2 + widthMultiplier * 0.4;
            const waveAmp = spacing * 0.6;
            const offsetPaths = offsets.map((offset, idx) =>
              path.map((pt, i) => {
                let off = offset;
                if (thickeningMode === 'sinusoidal') {
                  const t = path.length > 1 ? i / (path.length - 1) : 0;
                  off += Math.sin(t * Math.PI * 2 * waveFreq + phase + idx) * waveAmp;
                }
                const n = normals[i] || { x: 0, y: 0 };
                return { x: pt.x + n.x * off, y: pt.y + n.y * off };
              })
            );
            if (thickeningMode === 'snake' && offsetPaths.length > 1) {
              const snake = [];
              offsetPaths.forEach((op, idx) => {
                snake.push(...(idx % 2 === 0 ? op : op.slice().reverse()));
              });
              thickened.push(snake);
            } else {
              offsetPaths.forEach((op) => thickened.push(op));
            }
          });
          return thickened.length ? thickened : paths;
        };

        const renderMode = p.renderMode || 'line';
        const basePaths = applyThickening([path]);
        if (renderMode === 'points') {
          const points = [];
          const stride = Math.max(1, Math.floor(p.pointStride ?? 4));
          const r = Math.max(0.1, p.pointSize ?? 0.4);
          basePaths.forEach((basePath) => {
            const data = buildSegmentData(basePath);
            const avgStep = data.total / Math.max(1, basePath.length - 1);
            const spacing = Math.max(avgStep, avgStep * stride + gapSize);
            iterateSamples(data, spacing, gapOffset, gapRandomness, (pt) => {
              const circle = [];
              circle.meta = { kind: 'circle', cx: pt.x, cy: pt.y, r };
              points.push(circle);
            });
          });
          if (p.showPendulumGuides) {
            const helperSamples = Math.max(200, Math.floor(samples / 4));
            points.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
          }
          return points;
        }

        if (renderMode === 'segments') {
          const segments = [];
          const stride = Math.max(1, Math.floor(p.segmentStride ?? p.pointStride ?? 6));
          const len = Math.max(0.5, p.segmentLength ?? 6);
          const half = len / 2;
          basePaths.forEach((basePath) => {
            const data = buildSegmentData(basePath);
            const avgStep = data.total / Math.max(1, basePath.length - 1);
            const spacing = Math.max(avgStep, avgStep * stride + gapSize);
            iterateSamples(data, spacing, gapOffset, gapRandomness, (pt, tangent) => {
              const mag = Math.hypot(tangent.x, tangent.y) || 1;
              const ux = tangent.x / mag;
              const uy = tangent.y / mag;
              segments.push([
                { x: pt.x - ux * half, y: pt.y - uy * half },
                { x: pt.x + ux * half, y: pt.y + uy * half },
              ]);
            });
          });
          if (p.showPendulumGuides) {
            const helperSamples = Math.max(200, Math.floor(samples / 4));
            segments.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
          }
          return segments;
        }

        if (renderMode === 'dashed') {
          const segments = [];
          const dash = Math.max(0.5, p.dashLength ?? 4);
          const gap = Math.max(0, p.dashGap ?? 2) + gapSize;
          basePaths.forEach((basePath) => {
            const data = buildSegmentData(basePath);
            let cursor = gapOffset;
            let guard = 0;
            while (cursor < data.total && guard < 100000) {
              const dashEnd = cursor + dash;
              const dashSeg = slicePathByDistance(data, cursor, Math.min(dashEnd, data.total));
              if (dashSeg) segments.push(dashSeg);
              const jitter = gapRandomness ? (rng.nextFloat() * 2 - 1) * gapRandomness : 0;
              const gapLen = Math.max(0.1, gap * (1 + jitter));
              cursor = dashEnd + gapLen;
              guard += 1;
            }
          });
          if (p.showPendulumGuides) {
            const helperSamples = Math.max(200, Math.floor(samples / 4));
            segments.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
          }
          return segments.length ? segments : basePaths;
        }

        const output = basePaths;
        if (p.showPendulumGuides) {
          const helperSamples = Math.max(200, Math.floor(samples / 4));
          output.helpers = pendulums.map((pend) => buildPath([pend], helperSamples));
        }
        return output;
      },
      formula: (p) =>
        `x = Σ Aᵢ sin((fᵢ+μᵢ)t + φxᵢ) e^(-dᵢ t)\ny = Σ Bᵢ sin((fᵢ+μᵢ)t + φyᵢ) e^(-dᵢ t)`,
    },
    wavetable: {
      generate: (p, rng, noise, bounds) => {
        const { m, height, width } = bounds;
        const paths = [];
        const inset = bounds.truncate ? m : 0;
        const innerW = width - inset * 2;
        const innerH = height - inset * 2;
        const lines = Math.max(1, Math.floor(p.lines));
        const rowSpan = Math.max(1, lines - 1);
        const baseSpace = innerH / rowSpan;
        const gap = Math.max(0.1, p.gap);
        let lSpace = baseSpace * gap;
        let totalHeight = lines > 1 ? lSpace * (lines - 1) : 0;
        if (lines > 1 && totalHeight > innerH) {
          lSpace = innerH / (lines - 1);
          totalHeight = lSpace * (lines - 1);
        }
        const startY = inset + (innerH - totalHeight) / 2;
        const pts = Math.max(2, Math.floor(innerW / 2));
        const xStep = innerW / pts;
        const dampenExtremes = Boolean(p.dampenExtremes);
        const overlapPadding = Math.max(0, p.overlapPadding ?? 0);
        const flatCaps = Boolean(p.flatCaps);
        const edgeFade = Math.min(100, Math.max(0, p.edgeFade ?? 0));
        const edgeFadeStrength = Math.min(1, edgeFade / 100);
        const edgeFadeThreshold = Math.min(100, Math.max(0, p.edgeFadeThreshold ?? 0));
        const edgeFadeThresholdStrength = Math.min(1, edgeFadeThreshold / 100);
        const edgeFadeFeather = Math.min(100, Math.max(0, p.edgeFadeFeather ?? 0));
        const edgeFadeFeatherStrength = Math.min(1, edgeFadeFeather / 100);
        const edgeFadeMode = ['none', 'left', 'right', 'both'].includes(p.edgeFadeMode)
          ? p.edgeFadeMode
          : 'both';
        const verticalFade = Math.min(100, Math.max(0, p.verticalFade ?? 0));
        const verticalFadeStrength = Math.min(1, verticalFade / 100);
        const verticalFadeThreshold = Math.min(100, Math.max(0, p.verticalFadeThreshold ?? 0));
        const verticalFadeThresholdStrength = Math.min(1, verticalFadeThreshold / 100);
        const verticalFadeFeather = Math.min(100, Math.max(0, p.verticalFadeFeather ?? 0));
        const verticalFadeFeatherStrength = Math.min(1, verticalFadeFeather / 100);
        const verticalFadeMode = ['none', 'top', 'bottom', 'both'].includes(p.verticalFadeMode)
          ? p.verticalFadeMode
          : 'both';
        const lineOffsetAngle = ((p.lineOffset ?? 180) * Math.PI) / 180;
        const lineOffsetX = Math.sin(lineOffsetAngle);
        const lineOffsetY = -Math.cos(lineOffsetAngle);
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
          let total = 0;
          let amp = 1;
          let freq = 1;
          let norm = 0;
          for (let i = 0; i < 4; i++) {
            total += baseNoise(x * freq, y * freq) * amp;
            norm += amp;
            amp *= 0.5;
            freq *= 2;
          }
          return norm ? total / norm : total;
        };
        const noiseValue = (x, y, noiseDef) => {
          const noiseType = noiseDef?.type || 'simplex';
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
            case 'warp': {
              const warp = baseNoise(x + n * 1.5, y + n * 1.5);
              return warp;
            }
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
            case 'image': {
              const store = window.Vectura?.NOISE_IMAGES || {};
              const img = noiseDef?.imageId ? store[noiseDef.imageId] : null;
              if (!img || !img.data) return n;
              const algo = noiseDef?.imageAlgo || 'luma';
              const blur = Math.max(0, Math.min(4, noiseDef?.imageBlur ?? 0));
              const sampleLum = (u, v) => {
                const uu = ((u % 1) + 1) % 1;
                const vv = ((v % 1) + 1) % 1;
                const ix = Math.min(img.width - 1, Math.max(0, Math.floor(uu * img.width)));
                const iy = Math.min(img.height - 1, Math.max(0, Math.floor(vv * img.height)));
                const idx = (iy * img.width + ix) * 4;
                const data = img.data;
                const r = data[idx] ?? 0;
                const g = data[idx + 1] ?? 0;
                const b = data[idx + 2] ?? 0;
                return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
              };
              const sampleBlur = (u, v) => {
                if (!blur) return sampleLum(u, v);
                let total = 0;
                let count = 0;
                for (let dy = -blur; dy <= blur; dy++) {
                  for (let dx = -blur; dx <= blur; dx++) {
                    total += sampleLum(u + dx / img.width, v + dy / img.height);
                    count += 1;
                  }
                }
                return count ? total / count : 0;
              };
              const u = x;
              const v = y;
              if (algo === 'edge') {
                const c = sampleBlur(u, v);
                const sx =
                  -sampleBlur(u - 1 / img.width, v - 1 / img.height) +
                  sampleBlur(u + 1 / img.width, v - 1 / img.height) -
                  2 * sampleBlur(u - 1 / img.width, v) +
                  2 * sampleBlur(u + 1 / img.width, v) -
                  sampleBlur(u - 1 / img.width, v + 1 / img.height) +
                  sampleBlur(u + 1 / img.width, v + 1 / img.height);
                const sy =
                  -sampleBlur(u - 1 / img.width, v - 1 / img.height) -
                  2 * sampleBlur(u, v - 1 / img.height) -
                  sampleBlur(u + 1 / img.width, v - 1 / img.height) +
                  sampleBlur(u - 1 / img.width, v + 1 / img.height) +
                  2 * sampleBlur(u, v + 1 / img.height) +
                  sampleBlur(u + 1 / img.width, v + 1 / img.height);
                const mag = Math.min(1, Math.hypot(sx, sy) * 1.5);
                return (mag + c * 0.2) * 2 - 1;
              }
              let lum = sampleBlur(u, v);
              if (algo === 'invert') lum = 1 - lum;
              if (algo === 'threshold') {
                const t = Math.max(0, Math.min(1, noiseDef?.imageThreshold ?? 0.5));
                lum = lum >= t ? 1 : 0;
              }
              if (algo === 'posterize') {
                const levels = Math.max(2, Math.min(10, Math.round(noiseDef?.imagePosterize ?? 5)));
                lum = Math.round(lum * (levels - 1)) / (levels - 1);
              }
              return lum * 2 - 1;
            }
            default:
              return n;
          }
        };
        const noiseBase = {
          enabled: true,
          type: p.noiseType || 'simplex',
          blend: 'add',
          amplitude: p.amplitude ?? 0,
          zoom: p.zoom ?? 0.02,
          freq: p.freq ?? 1,
          angle: p.noiseAngle ?? 0,
          imageId: p.noiseImageId || '',
          imageName: p.noiseImageName || '',
          imageAlgo: p.imageAlgo || 'luma',
          imageThreshold: p.imageThreshold ?? 0.5,
          imagePosterize: p.imagePosterize ?? 5,
          imageBlur: p.imageBlur ?? 0,
        };
        const noiseStack = (Array.isArray(p.noises) && p.noises.length ? p.noises : [noiseBase]).map((noiseLayer) => ({
          ...noiseBase,
          ...(noiseLayer || {}),
          enabled: noiseLayer?.enabled !== false,
          blend: noiseLayer?.blend || noiseBase.blend,
        }));
        const noiseSamplers = noiseStack
          .filter((noiseLayer) => noiseLayer.enabled !== false)
          .map((noiseLayer) => {
            const angle = ((noiseLayer.angle ?? 0) * Math.PI) / 180;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            const zoom = noiseLayer.zoom ?? noiseBase.zoom;
            const freq = noiseLayer.freq ?? noiseBase.freq;
            const amplitude = noiseLayer.amplitude ?? noiseBase.amplitude;
            return {
              blend: noiseLayer.blend || 'add',
              amplitude,
              sample: (x, y) => {
                const nx = x * zoom * freq;
                const ny = y * zoom;
                const rx = nx * cosA - ny * sinA;
                const ry = nx * sinA + ny * cosA;
                return noiseValue(rx, ry, noiseLayer);
              },
            };
          });
        let prevY = null;
        let prevOffset = 0;
        const rowOrder = overlapPadding > 0 ? [...Array(lines).keys()].reverse() : [...Array(lines).keys()];
        const rowPaths = new Array(lines);
        rowOrder.forEach((i) => {
          const path = [];
          const by = startY + i * lSpace;
          const tRow = lines <= 1 ? 0.5 : i / (lines - 1);
          let vTaper = 1;
          if (verticalFadeStrength > 0 && verticalFadeThresholdStrength > 0 && verticalFadeMode !== 'none') {
            let vDist = 0;
            let zone = 0;
            if (verticalFadeMode === 'top') {
              vDist = tRow;
              zone = verticalFadeThresholdStrength;
            } else if (verticalFadeMode === 'bottom') {
              vDist = 1 - tRow;
              zone = verticalFadeThresholdStrength;
            } else {
              vDist = Math.min(tRow, 1 - tRow);
              zone = verticalFadeThresholdStrength / 2;
            }
            if (vDist <= zone) {
              vTaper = Math.max(0, 1 - verticalFadeStrength);
            } else if (verticalFadeFeatherStrength > 0) {
              const featherZone = Math.max(0.0001, verticalFadeFeatherStrength / (verticalFadeMode === 'both' ? 2 : 1));
              if (vDist <= zone + featherZone) {
                const t = (vDist - zone) / featherZone;
                const eased = Math.max(0, Math.min(1, t));
                const damp = (1 - verticalFadeStrength) + eased * verticalFadeStrength;
                vTaper = Math.max(0, damp);
              }
            }
          }
          const xOffset = p.tilt * i;
          const currY = overlapPadding > 0 ? new Array(pts + 1) : null;
          for (let j = 0; j <= pts; j++) {
            const baseX = inset + j * xStep + xOffset;
            let combined = 0;
            let hasNoise = false;
            noiseSamplers.forEach((sampler) => {
              const value = sampler.sample(baseX, by) * sampler.amplitude;
              if (!hasNoise) {
                combined = value;
                hasNoise = true;
                return;
              }
              switch (sampler.blend) {
                case 'subtract':
                  combined -= value;
                  break;
                case 'multiply':
                  combined *= value;
                  break;
                case 'max':
                  combined = Math.max(combined, value);
                  break;
                case 'min':
                  combined = Math.min(combined, value);
                  break;
                case 'add':
                default:
                  combined += value;
                  break;
              }
            });
            const off = hasNoise ? combined : 0;
            let taper = 1.0;
            if (edgeFadeStrength > 0 && edgeFadeThresholdStrength > 0 && edgeFadeMode !== 'none') {
              const t = j / pts;
              let hDist = 0;
              let zone = 0;
              if (edgeFadeMode === 'left') {
                hDist = t;
                zone = edgeFadeThresholdStrength;
              } else if (edgeFadeMode === 'right') {
                hDist = 1 - t;
                zone = edgeFadeThresholdStrength;
              } else {
                hDist = Math.min(t, 1 - t);
                zone = edgeFadeThresholdStrength / 2;
              }
              if (hDist <= zone) {
                taper = Math.max(0, 1 - edgeFadeStrength);
              } else if (edgeFadeFeatherStrength > 0) {
                const featherZone = Math.max(0.0001, edgeFadeFeatherStrength / (edgeFadeMode === 'both' ? 2 : 1));
                if (hDist <= zone + featherZone) {
                  const tFeather = (hDist - zone) / featherZone;
                  const eased = Math.max(0, Math.min(1, tFeather));
                  const damp = (1 - edgeFadeStrength) + eased * edgeFadeStrength;
                  taper = Math.max(0, damp);
                }
              }
            }
            const amp = off * taper * vTaper;
            const dx = amp * lineOffsetX;
            const dy = amp * lineOffsetY;
            let x = baseX + dx;
            let y = by + dy;
            if (dampenExtremes) {
              const minY = inset;
              const maxY = height - inset;
              if (y < minY || y > maxY) {
                const limit = Math.max(0, y < minY ? by - minY : maxY - by);
                const denom = Math.max(0.001, Math.abs(amp));
                const scale = Math.min(1, limit / denom);
                y = by + amp * scale;
              }
            }
            if (overlapPadding > 0 && prevY) {
              const minGap = overlapPadding * 0.5;
              const prevIndex = (baseX - (inset + prevOffset)) / xStep;
              if (prevIndex >= 0 && prevIndex <= pts) {
                const i0 = Math.floor(prevIndex);
                const i1 = Math.min(pts, i0 + 1);
                const t = prevIndex - i0;
                const prevVal = prevY[i0] + (prevY[i1] - prevY[i0]) * t;
                const ceiling = prevVal - minGap;
                if (y > ceiling) {
                  y = ceiling;
                }
              }
            }
            path.push({ x, y });
            if (currY) currY[j] = y;
          }
          rowPaths[i] = path.length > 1 ? path : null;
          if (currY) {
            prevY = currY;
            prevOffset = xOffset;
          }
        });

        const continuity = ['none', 'single', 'double'].includes(p.continuity) ? p.continuity : 'none';
        if (continuity === 'single') {
          const snake = [];
          rowPaths.forEach((path, idx) => {
            if (!path || path.length < 2) return;
            const segment = idx % 2 === 0 ? path : path.slice().reverse();
            if (snake.length) {
              const last = snake[snake.length - 1];
              const start = segment[0];
              if (last.x !== start.x || last.y !== start.y) snake.push({ x: start.x, y: start.y });
            }
            snake.push(...segment);
          });
          if (snake.length) paths.push(snake);
        } else {
          rowPaths.forEach((path) => {
            if (path) paths.push(path);
          });
          if (continuity === 'double') {
            for (let i = 0; i < rowPaths.length - 1; i++) {
              const a = rowPaths[i];
              const b = rowPaths[i + 1];
              if (!a || !b) continue;
              const leftA = a[0];
              const rightA = a[a.length - 1];
              const leftB = b[0];
              const rightB = b[b.length - 1];
              if (leftA && leftB) paths.push([leftA, leftB]);
              if (rightA && rightB) paths.push([rightA, rightB]);
            }
          }
        }

        if (flatCaps) {
          const top = [];
          const bottom = [];
          const bottomOffset = p.tilt * (lines - 1);
          const topY = startY;
          const bottomY = startY + lSpace * (lines - 1);
          for (let j = 0; j <= pts; j++) {
            const xTop = inset + j * xStep;
            const xBottom = inset + j * xStep + bottomOffset;
            top.push({ x: xTop, y: topY });
            bottom.push({ x: xBottom, y: bottomY });
          }
          paths.push(top, bottom);
        }

        return paths;
      },
      formula: (p) =>
        `y = yBase + Σ noiseᵢ(rotate(x*zoomᵢ*freqᵢ, y*zoomᵢ)) * ampᵢ\nedge/vertical dampening scales noise`,
    },
    rings: {
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
    },
    topo: {
      generate: (p, rng, noise, bounds) => {
        const { m, width, height } = bounds;
        const inset = bounds.truncate ? m : 0;
        const left = inset;
        const top = inset;
        const w = width - inset * 2;
        const h = height - inset * 2;
        const res = Math.max(20, Math.floor(p.resolution ?? 120));
        const cols = res;
        const rows = res;
        const cellW = w / cols;
        const cellH = h / rows;
        const noiseScale = p.noiseScale ?? 0.001;
        const noiseOffsetX = p.noiseOffsetX ?? 0;
        const noiseOffsetY = p.noiseOffsetY ?? 0;
        const octaves = Math.max(1, Math.floor(p.octaves ?? 1));
        const lacunarity = p.lacunarity ?? 2.0;
        const gain = p.gain ?? 0.5;
        const sensitivity = Math.max(0.01, p.sensitivity ?? 1);
        const thresholdOffset = p.thresholdOffset ?? 0;
        const noiseType = p.noiseType || 'simplex';
        const levels = Math.max(1, Math.floor(p.levels ?? 10));

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
          for (let i = 0; i < octaves; i++) {
            totalNoise += baseNoise(x * freq, y * freq) * ampNoise;
            norm += ampNoise;
            ampNoise *= gain;
            freq *= lacunarity;
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

        const field = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (let y = 0; y <= rows; y++) {
          for (let x = 0; x <= cols; x++) {
            const wx = left + x * cellW;
            const wy = top + y * cellH;
            const nx = (wx + noiseOffsetX) * noiseScale;
            const ny = (wy + noiseOffsetY) * noiseScale;
            let v = noiseValue(nx, ny);
            v = Math.sign(v) * Math.pow(Math.abs(v), 1 / sensitivity);
            field[y][x] = v;
            minVal = Math.min(minVal, v);
            maxVal = Math.max(maxVal, v);
          }
        }

        const thresholds = [];
        const span = maxVal - minVal || 1;
        for (let i = 1; i <= levels; i++) {
          const t = minVal + (i / (levels + 1)) * span + thresholdOffset;
          thresholds.push(t);
        }

        const interp = (p1, p2, v1, v2, t) => {
          const denom = v2 - v1 || 1e-6;
          const ratio = (t - v1) / denom;
          return { x: p1.x + (p2.x - p1.x) * ratio, y: p1.y + (p2.y - p1.y) * ratio };
        };

        const sampleField = (x, y) => {
          const gx = Math.max(0, Math.min(cols, (x - left) / cellW));
          const gy = Math.max(0, Math.min(rows, (y - top) / cellH));
          const x0 = Math.floor(gx);
          const y0 = Math.floor(gy);
          const x1 = Math.min(cols, x0 + 1);
          const y1 = Math.min(rows, y0 + 1);
          const tx = gx - x0;
          const ty = gy - y0;
          const v00 = field[y0][x0];
          const v10 = field[y0][x1];
          const v01 = field[y1][x0];
          const v11 = field[y1][x1];
          const vx0 = v00 + (v10 - v00) * tx;
          const vx1 = v01 + (v11 - v01) * tx;
          return vx0 + (vx1 - vx0) * ty;
        };

        const refineByGradient = (pt, threshold) => {
          const hStep = Math.min(cellW, cellH) * 0.5;
          const fx = (sampleField(pt.x + hStep, pt.y) - sampleField(pt.x - hStep, pt.y)) / (2 * hStep);
          const fy = (sampleField(pt.x, pt.y + hStep) - sampleField(pt.x, pt.y - hStep)) / (2 * hStep);
          const denom = fx * fx + fy * fy + 1e-6;
          const diff = sampleField(pt.x, pt.y) - threshold;
          return { x: pt.x - (diff * fx) / denom, y: pt.y - (diff * fy) / denom };
        };

        const smoothPath = (path, iterations = 1) => {
          let pts = path.slice();
          for (let iter = 0; iter < iterations; iter++) {
            const next = [];
            for (let i = 0; i < pts.length - 1; i++) {
              const p0 = pts[i];
              const p1 = pts[i + 1];
              const q = { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 };
              const r = { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 };
              next.push(q, r);
            }
            pts = next;
          }
          return pts;
        };

        const linkSegments = (segments) => {
          const key = (pt) => `${pt.x.toFixed(3)},${pt.y.toFixed(3)}`;
          const map = new Map();
          segments.forEach((seg, idx) => {
            const k0 = key(seg[0]);
            const k1 = key(seg[1]);
            if (!map.has(k0)) map.set(k0, []);
            if (!map.has(k1)) map.set(k1, []);
            map.get(k0).push({ idx, end: 0 });
            map.get(k1).push({ idx, end: 1 });
          });
          const used = new Set();
          const paths = [];
          segments.forEach((seg, idx) => {
            if (used.has(idx)) return;
            used.add(idx);
            const path = [seg[0], seg[1]];
            let extended = true;
            while (extended) {
              extended = false;
              const endKey = key(path[path.length - 1]);
              const matches = map.get(endKey) || [];
              const nextMatch = matches.find((m) => !used.has(m.idx));
              if (nextMatch) {
                used.add(nextMatch.idx);
                const nextSeg = segments[nextMatch.idx];
                const nextPt = nextMatch.end === 0 ? nextSeg[1] : nextSeg[0];
                path.push(nextPt);
                extended = true;
              }
              const startKey = key(path[0]);
              const matchesStart = map.get(startKey) || [];
              const prevMatch = matchesStart.find((m) => !used.has(m.idx));
              if (prevMatch) {
                used.add(prevMatch.idx);
                const prevSeg = segments[prevMatch.idx];
                const prevPt = prevMatch.end === 0 ? prevSeg[1] : prevSeg[0];
                path.unshift(prevPt);
                extended = true;
              }
            }
            paths.push(path);
          });
          return paths;
        };

        const cases = {
          1: [[3, 0]],
          2: [[0, 1]],
          3: [[3, 1]],
          4: [[1, 2]],
          5: [[3, 2], [0, 1]],
          6: [[0, 2]],
          7: [[3, 2]],
          8: [[2, 3]],
          9: [[0, 2]],
          10: [[0, 3], [1, 2]],
          11: [[1, 2]],
          12: [[1, 3]],
          13: [[0, 1]],
          14: [[3, 0]],
        };

        const paths = [];
        thresholds.forEach((threshold) => {
          const segments = [];
          for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
              const v0 = field[y][x];
              const v1 = field[y][x + 1];
              const v2 = field[y + 1][x + 1];
              const v3 = field[y + 1][x];
              const p0 = { x: left + x * cellW, y: top + y * cellH };
              const p1 = { x: left + (x + 1) * cellW, y: top + y * cellH };
              const p2 = { x: left + (x + 1) * cellW, y: top + (y + 1) * cellH };
              const p3 = { x: left + x * cellW, y: top + (y + 1) * cellH };
              const c0 = v0 > threshold ? 1 : 0;
              const c1 = v1 > threshold ? 1 : 0;
              const c2 = v2 > threshold ? 1 : 0;
              const c3 = v3 > threshold ? 1 : 0;
              const idx = c0 | (c1 << 1) | (c2 << 2) | (c3 << 3);
              if (idx === 0 || idx === 15) continue;
              let edges = cases[idx];
              if (idx === 5 || idx === 10) {
                const center = (v0 + v1 + v2 + v3) / 4;
                if (idx === 5) edges = center > threshold ? [[3, 0], [1, 2]] : [[3, 2], [0, 1]];
                if (idx === 10) edges = center > threshold ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
              }
              edges.forEach(([e0, e1]) => {
                const edgePoint = (edge) => {
                  switch (edge) {
                    case 0:
                      return interp(p0, p1, v0, v1, threshold);
                    case 1:
                      return interp(p1, p2, v1, v2, threshold);
                    case 2:
                      return interp(p2, p3, v2, v3, threshold);
                    case 3:
                      return interp(p3, p0, v3, v0, threshold);
                    default:
                      return p0;
                  }
                };
                let a = edgePoint(e0);
                let b = edgePoint(e1);
                if (p.mappingMode === 'gradient') {
                  a = refineByGradient(a, threshold);
                  b = refineByGradient(b, threshold);
                }
                segments.push([a, b]);
              });
            }
          }
          const linked = linkSegments(segments);
          linked.forEach((path) => {
            if (path.length < 2) return;
            let next = path;
            if (p.mappingMode === 'smooth') next = smoothPath(path, 1);
            if (p.mappingMode === 'bezier') next = smoothPath(path, 2);
            paths.push(next);
          });
        });

        return paths;
      },
      formula: (p) =>
        `field = noise(x*${p.noiseScale}, y*${p.noiseScale})\ncontours = marchingSquares(field, ${p.levels})`,
    },
    rainfall: {
      generate: (p, rng, noise, bounds) => {
        const { m, dW, dH, width, height } = bounds;
        const count = Math.max(1, Math.floor(p.count ?? 1));
        const traceLength = Math.max(4, p.traceLength ?? 40);
        const traceStep = Math.max(1, p.traceStep ?? 4);
        const steps = Math.max(2, Math.floor(traceLength / traceStep));
        const turbulence = Math.max(0, p.turbulence ?? 0);
        const rainfallAngle = ((p.rainfallAngle ?? 150) * Math.PI) / 180;
        const windStrength = Math.max(0, p.windStrength ?? 0);
        const windAngle = ((p.windAngle ?? 180) * Math.PI) / 180;
        const fillAngle = ((p.fillAngle ?? 0) * Math.PI) / 180;
        const dropSize = Math.max(0, p.dropSize ?? 0);
        const widthMultiplier = Math.max(1, Math.round(p.widthMultiplier ?? 1));
        const thickeningMode = p.thickeningMode || 'parallel';
        const dropShape = p.dropShape || 'none';
        const dropFill = p.dropFill || 'none';
        const fillDensity = Math.max(0.2, p.fillDensity ?? 1);
        const fillPadding = Math.max(0, p.fillPadding ?? 0);
        const trailBreaks = p.trailBreaks || 'none';
        const breakSpacing = Math.max(1, p.breakSpacing ?? 10);
        const breakLengthJitter = Math.max(0, Math.min(1, p.breakLengthJitter ?? 0));
        const breakWidthJitter = Math.max(0, Math.min(1, p.breakWidthJitter ?? 0));
        const breakRandomness = Math.max(0, Math.min(1, p.breakRandomness ?? 0));
        const noiseScale = 0.01;

        const baseDirX = Math.sin(rainfallAngle);
        const baseDirY = -Math.cos(rainfallAngle);
        const windX = Math.sin(windAngle) * windStrength;
        const windY = -Math.cos(windAngle) * windStrength;
        let headDirX = baseDirX + windX;
        let headDirY = baseDirY + windY;
        const headLen = Math.hypot(headDirX, headDirY) || 1;
        headDirX /= headLen;
        headDirY /= headLen;
        const dirX = -headDirX;
        const dirY = -headDirY;
        const perpX = -dirY;
        const perpY = dirX;

        const store = window.Vectura?.NOISE_IMAGES || {};
        const mask = p.silhouetteId ? store[p.silhouetteId] : null;
        const hasMask = Boolean(mask && mask.data && mask.width && mask.height);
        const maskAlpha = (x, y) => {
          if (!hasMask) return 1;
          const tileW = Math.max(1, p.silhouetteWidth ?? dW);
          const tileH = Math.max(1, p.silhouetteHeight ?? dH);
          const tilesX = Math.max(1, Math.round(p.silhouetteTilesX ?? 1));
          const tilesY = Math.max(1, Math.round(p.silhouetteTilesY ?? 1));
          const spacing = Math.max(0, p.silhouetteSpacing ?? 0);
          const offsetX = p.silhouetteOffsetX ?? 0;
          const offsetY = p.silhouetteOffsetY ?? 0;
          const totalW = tilesX * tileW + (tilesX - 1) * spacing;
          const totalH = tilesY * tileH + (tilesY - 1) * spacing;
          const originX = (width - totalW) / 2 + offsetX;
          const originY = (height - totalH) / 2 + offsetY;
          const relX = x - originX;
          const relY = y - originY;
          if (relX < 0 || relY < 0 || relX > totalW || relY > totalH) return p.silhouetteInvert ? 1 : 0;
          const strideX = tileW + spacing;
          const strideY = tileH + spacing;
          const tileX = Math.floor(relX / strideX);
          const tileY = Math.floor(relY / strideY);
          if (tileX < 0 || tileX >= tilesX || tileY < 0 || tileY >= tilesY) return p.silhouetteInvert ? 1 : 0;
          const localX = relX - tileX * strideX;
          const localY = relY - tileY * strideY;
          if (localX > tileW || localY > tileH) return p.silhouetteInvert ? 1 : 0;
          const u = localX / tileW;
          const v = localY / tileH;
          const ix = Math.min(mask.width - 1, Math.max(0, Math.floor(u * mask.width)));
          const iy = Math.min(mask.height - 1, Math.max(0, Math.floor(v * mask.height)));
          const idx = (iy * mask.width + ix) * 4;
          const alpha = (mask.data[idx + 3] ?? 0) / 255;
          return p.silhouetteInvert ? 1 - alpha : alpha;
        };

        const rotatePoint = (pt, angle) => {
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return { x: pt.x * cos - pt.y * sin, y: pt.x * sin + pt.y * cos };
        };

        const buildDropShape = (center, size, angle) => {
          if (!size || dropShape === 'none') return [];
          const paths = [];
          if (dropShape === 'circle') {
            const circle = [];
            circle.meta = { kind: 'circle', cx: center.x, cy: center.y, r: size };
            paths.push(circle);
          } else if (dropShape === 'square') {
            const pts = [
              { x: -size, y: -size },
              { x: size, y: -size },
              { x: size, y: size },
              { x: -size, y: size },
            ];
            const path = pts.map((pt) => {
              const rotated = rotatePoint(pt, angle);
              return { x: center.x + rotated.x, y: center.y + rotated.y };
            });
            path.push({ ...path[0] });
            paths.push(path);
          } else if (dropShape === 'teardrop') {
            const arcSteps = 18;
            const headR = size;
            const headY = headR * 0.6;
            const tailY = -headR * 1.4;
            const pts = [];
            for (let i = 0; i <= arcSteps; i++) {
              const t = i / arcSteps;
              const theta = t * Math.PI;
              pts.push({ x: Math.cos(theta) * headR, y: Math.sin(theta) * headR + headY });
            }
            pts.push({ x: 0, y: tailY });
            const path = pts.map((pt) => {
              const rotated = rotatePoint(pt, angle);
              return { x: center.x + rotated.x, y: center.y + rotated.y };
            });
            path.push({ ...path[0] });
            paths.push(path);
          }

          if (dropFill !== 'none') {
            const fillPaths = [];
            const fillSize = Math.max(0, size - fillPadding);
            if (fillSize <= 0.1) return paths;
            const fillRotation = angle + fillAngle;
            const outline = (() => {
              if (dropShape === 'circle') {
                const pts = [];
                const steps = 32;
                for (let i = 0; i < steps; i++) {
                  const t = (i / steps) * Math.PI * 2;
                  pts.push({ x: Math.cos(t) * fillSize, y: Math.sin(t) * fillSize });
                }
                return pts;
              }
              if (dropShape === 'square') {
                return [
                  { x: -fillSize, y: -fillSize },
                  { x: fillSize, y: -fillSize },
                  { x: fillSize, y: fillSize },
                  { x: -fillSize, y: fillSize },
                ];
              }
              const arcSteps = 18;
              const headR = fillSize;
              const headY = headR * 0.6;
              const tailY = -headR * 1.4;
              const pts = [];
              for (let i = 0; i <= arcSteps; i++) {
                const t = i / arcSteps;
                const theta = t * Math.PI;
                pts.push({ x: Math.cos(theta) * headR, y: Math.sin(theta) * headR + headY });
              }
              pts.push({ x: 0, y: tailY });
              return pts;
            })();

            const rotateOutline = outline.map((pt) => rotatePoint(pt, angle));
            const outlineAbs = rotateOutline.map((pt) => ({ x: center.x + pt.x, y: center.y + pt.y }));
            const pointInPoly = (pt, poly) => {
              let inside = false;
              for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x;
                const yi = poly[i].y;
                const xj = poly[j].x;
                const yj = poly[j].y;
                const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-6) + xi;
                if (intersect) inside = !inside;
              }
              return inside;
            };
            const clipPath = (path) => {
              let current = [];
              const segments = [];
              path.forEach((pt) => {
                if (pointInPoly(pt, outlineAbs)) {
                  current.push(pt);
                } else {
                  if (current.length > 1) segments.push(current);
                  current = [];
                }
              });
              if (current.length > 1) segments.push(current);
              if (!segments.length) return null;
              return segments.reduce((best, seg) => (seg.length > best.length ? seg : best), segments[0]);
            };

            const centroid = outlineAbs.reduce(
              (acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }),
              { x: 0, y: 0 }
            );
            centroid.x /= outlineAbs.length || 1;
            centroid.y /= outlineAbs.length || 1;

            const lineSegmentsForAngle = (lineAngle, spacing) => {
              const dir = { x: Math.cos(lineAngle), y: Math.sin(lineAngle) };
              const perp = { x: -dir.y, y: dir.x };
              const projections = outlineAbs.map((pt) => (pt.x - centroid.x) * perp.x + (pt.y - centroid.y) * perp.y);
              const minProj = Math.min(...projections);
              const maxProj = Math.max(...projections);
              const segments = [];
              const step = Math.max(0.6, spacing);
              for (let d = minProj; d <= maxProj; d += step) {
                const p0 = { x: centroid.x + perp.x * d, y: centroid.y + perp.y * d };
                const intersections = [];
                for (let i = 0; i < outlineAbs.length; i++) {
                  const a = outlineAbs[i];
                  const b = outlineAbs[(i + 1) % outlineAbs.length];
                  const vx = b.x - a.x;
                  const vy = b.y - a.y;
                  const det = dir.x * vy - dir.y * vx;
                  if (Math.abs(det) < 1e-6) continue;
                  const dx = a.x - p0.x;
                  const dy = a.y - p0.y;
                  const t = (dx * vy - dy * vx) / det;
                  const u = (dx * dir.y - dy * dir.x) / det;
                  if (u >= 0 && u <= 1) {
                    intersections.push({ t, x: p0.x + dir.x * t, y: p0.y + dir.y * t });
                  }
                }
                intersections.sort((a, b) => a.t - b.t);
                for (let k = 0; k + 1 < intersections.length; k += 2) {
                  const p1 = intersections[k];
                  const p2 = intersections[k + 1];
                  segments.push([p1, p2]);
                }
              }
              return segments;
            };

            const densitySpacing = Math.max(0.6, fillSize * 0.35) / fillDensity;
            if (dropFill === 'spiral') {
              const loops = 2.6;
              const steps = 40;
              const path = [];
              for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const ang = t * loops * Math.PI * 2;
                const rr = fillSize * (1 - t);
                const pt = rotatePoint({ x: Math.cos(ang) * rr, y: Math.sin(ang) * rr }, fillRotation);
                path.push({ x: center.x + pt.x, y: center.y + pt.y });
              }
              const clipped = clipPath(path);
              if (clipped) fillPaths.push(clipped);
            } else if (dropFill === 'hash' || dropFill === 'crosshatch') {
              const angles =
                dropFill === 'hash'
                  ? [fillRotation, fillRotation + Math.PI / 2]
                  : [fillRotation + Math.PI / 4, fillRotation - Math.PI / 4];
              angles.forEach((ang) => {
                const segments = lineSegmentsForAngle(ang, densitySpacing);
                segments.forEach(([p1, p2]) => {
                  fillPaths.push([
                    { x: p1.x, y: p1.y },
                    { x: p2.x, y: p2.y },
                  ]);
                });
              });
            } else if (dropFill === 'snake') {
              const segments = lineSegmentsForAngle(fillRotation, densitySpacing);
              if (segments.length) {
                const path = [];
                segments.forEach(([p1, p2], idx) => {
                  if (idx % 2 === 0) {
                    path.push({ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y });
                  } else {
                    path.push({ x: p2.x, y: p2.y }, { x: p1.x, y: p1.y });
                  }
                });
                fillPaths.push(path);
              }
            } else if (dropFill === 'sinusoidal') {
              const segments = lineSegmentsForAngle(fillRotation, densitySpacing);
              const amp = densitySpacing * 0.45;
              segments.forEach(([p1, p2], idx) => {
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.hypot(dx, dy) || 1;
                const steps = Math.max(24, Math.floor(len / 4));
                const dir = { x: dx / len, y: dy / len };
                const perp = { x: -dir.y, y: dir.x };
                const phase = idx % 2 === 0 ? 0 : Math.PI;
                const cycles = Math.max(1, Math.round(len / (densitySpacing * 3)));
                const path = [];
                for (let i = 0; i <= steps; i++) {
                  const t = i / steps;
                  const base = { x: p1.x + dir.x * len * t, y: p1.y + dir.y * len * t };
                  const wave = Math.sin(t * Math.PI * 2 * cycles + phase) * amp;
                  path.push({ x: base.x + perp.x * wave, y: base.y + perp.y * wave });
                }
                fillPaths.push(path);
              });
            }
            fillPaths.forEach((path) => paths.push(path));
          }

          return paths;
        };

        const spacing = Math.max(0.35, dropSize * 0.25, traceStep * 0.15);
        const offsets = [];
        if (widthMultiplier === 1) {
          offsets.push(0);
        } else {
          const half = (widthMultiplier - 1) / 2;
          for (let i = 0; i < widthMultiplier; i++) {
            offsets.push((i - half) * spacing);
          }
        }

        const buildTracePaths = (basePath) => {
          if (!basePath || basePath.length < 2) return [];
          const paths = [];
          const phase = rng.nextFloat() * Math.PI * 2;
          const waveFreq = 2 + widthMultiplier * 0.4;
          const waveAmp = spacing * 0.6;
          const offsetPaths = offsets.map((offset, idx) =>
            basePath.map((pt, i) => {
              let off = offset;
              if (thickeningMode === 'sinusoidal') {
                const t = basePath.length > 1 ? i / (basePath.length - 1) : 0;
                off += Math.sin(t * Math.PI * 2 * waveFreq + phase + idx) * waveAmp;
              }
              return { x: pt.x + perpX * off, y: pt.y + perpY * off };
            })
          );
          if (thickeningMode === 'snake' && offsetPaths.length > 1) {
            const snake = [];
            offsetPaths.forEach((path, idx) => {
              if (idx % 2 === 0) {
                snake.push(...path);
              } else {
                snake.push(...path.slice().reverse());
              }
            });
            paths.push(snake);
          } else {
            offsetPaths.forEach((path) => paths.push(path));
          }
          return paths;
        };

        const applyTrailBreaks = (path) => {
          if (!path || path.length < 2 || trailBreaks === 'none') return [path];
          const baseSeg = Math.max(2, Math.round(breakSpacing / traceStep));
          const segments = [];
          let idx = 0;
          const total = path.length;
          const lengthJitter = (n) =>
            Math.max(1, Math.round(n * (1 + (rng.nextFloat() * 2 - 1) * breakLengthJitter)));
          const gapJitter = (n) =>
            Math.max(1, Math.round(n * (1 + (rng.nextFloat() * 2 - 1) * breakWidthJitter)));
          while (idx < total - 1) {
            const t = idx / Math.max(1, total - 1);
            let segLen = baseSeg;
            let gapLen = baseSeg;
            switch (trailBreaks) {
              case 'sparse':
                segLen = baseSeg * 3;
                gapLen = baseSeg * 2;
                break;
              case 'regular':
                segLen = baseSeg * 2;
                gapLen = baseSeg;
                break;
              case 'random':
                segLen = baseSeg * (0.5 + rng.nextFloat() * 1.5);
                gapLen = baseSeg * (0.5 + rng.nextFloat() * 1.5);
                break;
              case 'stutter':
                segLen = baseSeg * 0.7;
                gapLen = baseSeg * 0.5;
                break;
              case 'dashes':
                segLen = baseSeg * 3;
                gapLen = baseSeg * 1.3;
                break;
              case 'fade':
                segLen = baseSeg * (2 - t);
                gapLen = baseSeg * (0.5 + t * 2);
                break;
              case 'burst':
                segLen = baseSeg * 1.2;
                gapLen = (idx % Math.max(6, baseSeg * 3) === 0 ? baseSeg * 3 : baseSeg * 0.5);
                break;
              case 'drip':
                segLen = baseSeg * (1 + t * 2);
                gapLen = baseSeg * 0.8;
                break;
              case 'speckle':
                segLen = baseSeg * 0.4;
                gapLen = baseSeg * 1.6;
                break;
              default:
                break;
            }
            const randFactor = breakRandomness > 0 ? 1 + (rng.nextFloat() * 2 - 1) * breakRandomness : 1;
            segLen = lengthJitter(segLen * randFactor);
            gapLen = gapJitter(gapLen * randFactor);
            const end = Math.min(total, idx + Math.max(2, Math.round(segLen)));
            const segment = path.slice(idx, end);
            if (segment.length >= 2) segments.push(segment);
            idx = Math.min(total, end + Math.max(1, Math.round(gapLen)));
          }
          return segments.length ? segments : [path];
        };

        const paths = [];
        let created = 0;
        let attempts = 0;
        const maxAttempts = count * 8;
        while (created < count && attempts < maxAttempts) {
          attempts++;
          let x = m + rng.nextFloat() * dW;
          let y = m + rng.nextFloat() * dH;
          if (hasMask) {
            let tries = 0;
            while (tries < 12 && maskAlpha(x, y) < 0.1) {
              x = m + rng.nextFloat() * dW;
              y = m + rng.nextFloat() * dH;
              tries++;
            }
            if (maskAlpha(x, y) < 0.1) continue;
          }

          const basePath = [{ x, y }];
          let px = x;
          let py = y;
          for (let s = 0; s < steps; s++) {
            const n = noise.noise2D(px * noiseScale, py * noiseScale);
            const wobble = n * turbulence;
            const dx = dirX + perpX * wobble;
            const dy = dirY + perpY * wobble;
            const len = Math.hypot(dx, dy) || 1;
            px += (dx / len) * traceStep;
            py += (dy / len) * traceStep;
            if (px < m || px > width - m || py < m || py > height - m) break;
            if (hasMask && maskAlpha(px, py) < 0.1) break;
            basePath.push({ x: px, y: py });
          }
          if (basePath.length < 2) continue;
          const broken = applyTrailBreaks(basePath);
          broken.forEach((segment) => {
            const tracePaths = buildTracePaths(segment);
            tracePaths.forEach((path) => paths.push(path));
          });

          const dropScale = dropSize * (1 + (widthMultiplier - 1) * 0.2);
          const dropCenter = basePath[0];
          const dropAngle = Math.atan2(headDirX, headDirY) + ((p.dropRotate ?? 0) * Math.PI) / 180;
          buildDropShape(dropCenter, dropScale, dropAngle).forEach((path) => paths.push(path));
          created++;
        }

        return paths;
      },
      formula: (p) =>
        `dir = angle(${p.rainfallAngle}°) + wind(${p.windAngle}°, ${p.windStrength})\npos += dir * ${p.traceStep} + noise * ${p.turbulence}`,
    },
    spiral: {
      generate: (p, rng, noise, bounds) => {
        const { dW, dH, width, height } = bounds;
        const scx = width / 2;
        const scy = height / 2;
        const spath = [];
        let r = p.startR;
        const offset = ((p.angleOffset ?? 0) * Math.PI) / 180;
        let theta = offset;
        const maxR = Math.min(dW, dH) / 2;
        const loops = Math.max(1, p.loops ?? 1);
        const stepsPerQuad = Math.max(1, Math.floor(p.res ?? 40));
        const axisSnap = Boolean(p.axisSnap);
        const dTheta = axisSnap ? (Math.PI / 2) / stepsPerQuad : (Math.PI * 2) / stepsPerQuad;
        const totalSteps = Math.max(1, Math.floor((Math.PI * 2 * loops) / dTheta));
        const dr = (maxR - p.startR) / totalSteps;
        for (let i = 0; i <= totalSteps; i++) {
          const n = noise.noise2D(Math.cos(theta) * p.noiseFreq, Math.sin(theta) * p.noiseFreq);
          const pulse = 1 + Math.sin(theta * (p.pulseFreq ?? 0)) * (p.pulseAmp ?? 0);
          const rMod = r * pulse + n * p.noiseAmp;
          spath.push({ x: scx + Math.cos(theta) * rMod, y: scy + Math.sin(theta) * rMod });
          theta += dTheta;
          r += dr;
        }
        const paths = [spath];
        if (p.close && spath.length > 6) {
          const feather = Math.max(0, Math.min(1, p.closeFeather ?? 0.5));
          const buildConnection = (from, target) => {
            const dx = target.x - from.x;
            const dy = target.y - from.y;
            const len = Math.hypot(dx, dy) || 1;
            const mid = { x: (from.x + target.x) / 2, y: (from.y + target.y) / 2 };
            const offset = Math.min(30, len * (0.15 + feather * 0.35));
            const control = { x: mid.x - (dy / len) * offset, y: mid.y + (dx / len) * offset };
            const steps = Math.max(8, Math.floor(len / 6));
            const path = [];
            for (let i = 0; i <= steps; i++) {
              const t = i / steps;
              const u = 1 - t;
              const x = u * u * from.x + 2 * u * t * control.x + t * t * target.x;
              const y = u * u * from.y + 2 * u * t * control.y + t * t * target.y;
              path.push({ x, y });
            }
            return path;
          };

          const exclude = Math.max(6, Math.floor(spath.length * 0.05));
          const end = spath[spath.length - 1];
          let endIdx = 0;
          let endDist = Infinity;
          const endLimit = Math.max(1, spath.length - exclude);
          for (let i = 0; i < endLimit; i++) {
            const pt = spath[i];
            const dx = pt.x - end.x;
            const dy = pt.y - end.y;
            const dist = dx * dx + dy * dy;
            if (dist < endDist) {
              endDist = dist;
              endIdx = i;
            }
          }
          if (spath[endIdx]) paths.push(buildConnection(end, spath[endIdx]));

          const start = spath[0];
          let startIdx = exclude;
          let startDist = Infinity;
          const startLimit = Math.max(exclude + 1, spath.length - exclude);
          for (let i = exclude; i < startLimit; i++) {
            const pt = spath[i];
            const dx = pt.x - start.x;
            const dy = pt.y - start.y;
            const dist = dx * dx + dy * dy;
            if (dist < startDist) {
              startDist = dist;
              startIdx = i;
            }
          }
          if (spath[startIdx]) paths.push(buildConnection(start, spath[startIdx]));
        }
        return paths;
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
