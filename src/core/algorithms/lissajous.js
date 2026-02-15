/**
 * lissajous algorithm definition.
 */
(() => {
  window.Vectura = window.Vectura || {};
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};
  window.Vectura.AlgorithmRegistry.lissajous = {
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
    };
})();
