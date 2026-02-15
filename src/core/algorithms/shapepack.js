/**
 * shapePack algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.shapePack = {
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
          if (!perspective || perspectiveType === 'none') return pt;
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

        const usePerspective = perspectiveType !== 'none' && Math.abs(perspective) > 0.0001;
        circles.forEach((c, i) => {
          const cp = [];
          const stepCount = shape === 'circle' ? Math.max(24, segments) : Math.max(3, segments);
          const rot = rotationStep * i;
          for (let k = 0; k <= stepCount; k++) {
            const ang = (k / stepCount) * Math.PI * 2 + (shape === 'circle' ? 0 : rot);
            let pt = { x: c.x + Math.cos(ang) * c.r, y: c.y + Math.sin(ang) * c.r };
            if (shape !== 'circle' || usePerspective) pt = applyPerspective(pt);
            cp.push(pt);
          }
          if (shape === 'circle' && !usePerspective) {
            cp.meta = { kind: 'circle', cx: c.x, cy: c.y, r: c.r };
          } else {
            cp.meta = { kind: 'polygon', cx: c.x, cy: c.y, r: c.r, sides: stepCount, rotation: rot };
          }
          paths.push(cp);
        });
        return paths;
      },
      formula: (p) =>
        `if dist(p, others) > r + ${p.padding}: add(shape(p, r))\nr = rand(${p.minR}, ${p.maxR})\nrot = i * ${p.rotationStep}\nshape = ${p.shape}, sides = ${p.segments}\npersp = ${p.perspectiveType}(${p.perspective})`,
    };
})();
