/**
 * imageWeave algorithm — "Weave".
 *
 * A picture is rendered as a stack of parallel lines that waver side-to-side; the
 * local darkness of the image drives BOTH the wave amplitude and its frequency, so
 * shadows read as tight high-amplitude wobble and highlights flatten to near-straight
 * lines. One continuous pen stroke per row makes it ideal plotter line art; the
 * Continuity control can thread the rows into a single boustrophedon stroke (single)
 * or stitch them with ladder connectors on both ends (double), mirroring Wavetable.
 * With no uploaded picture it weaves the built-in shaded sphere.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  window.Vectura.AlgorithmRegistry.imageWeave = {
    generate: (p, rng, noise, bounds) => {
      const IS = Vectura.ImageSource;
      if (!IS) return [];
      IS.ensure(p, () => { try { Vectura.appInstance && Vectura.appInstance.regen && Vectura.appInstance.regen(); } catch (e) {} });
      const luma = IS.resolveLuma(p);

      const { m, dW, dH } = bounds;
      const aspect = IS.aspect(p);
      let rectW = dW; let rectH = dW / aspect;
      if (rectH > dH) { rectH = dH; rectW = dH * aspect; }
      const cx = m + dW / 2; const cy = m + dH / 2;

      const lineCount = clamp(Math.round(finite(p.lineCount, 160)), 10, 1000);
      const amplitude = Math.max(0, finite(p.amplitude, 1.2));
      const frequency = clamp(finite(p.frequency, 5000), 5, 10000);
      const detail = clamp(finite(p.detail, 72) / 100, 0.01, 1);
      const angle = (finite(p.lineAngle, 0) * Math.PI) / 180;
      const cos = Math.cos(angle); const sin = Math.sin(angle);
      const drawWhite = p.drawWhiteAreas !== false;
      const continuity = ['none', 'single', 'double'].includes(p.continuity) ? p.continuity : 'none';
      const WHITE_TONE = 0.004;

      // Cycle budget grows non-linearly with the Frequency knob; sample count scales
      // with Detail and the cycle target, capped for bounded cost.
      const targetCycles = 1 + Math.pow(frequency / 10000, 0.85) * 900;
      const sampleBudget = clamp(Math.floor(2200000 / lineCount), 320, 5200);
      const samples = clamp(Math.round(96 + detail * 220 + targetCycles * 4), 48, sampleBudget);
      const basePhaseStep = (Math.PI * 2 * targetCycles) / Math.max(1, samples);
      const span = Math.SQRT2; // cover the rotated diagonal of the unit square

      // Perpendicular (to the row direction) along which the wobble is applied, in mm.
      const normalX = -sin; const normalY = cos;

      const paths = [];
      // Collect each row's in-bounds runs (a row breaks into several when Draw White
      // Areas is off). Continuity is applied afterward, so sampling is always forward
      // and the boustrophedon reversal stays purely post-hoc.
      const rowRuns = [];
      for (let row = 0; row < lineCount; row++) {
        const rowT = lineCount === 1 ? 0.5 : row / (lineCount - 1);
        const localV = (rowT - 0.5) * span;
        // Row-constant halves of the rotation — hoisted out of the per-sample loop
        // (same products, so bit-identical to inlining localV * sin / cos).
        const lvSin = localV * sin;
        const lvCos = localV * cos;
        const runs = [];
        let seg = [];
        const flush = () => { if (seg.length > 1) runs.push(seg); seg = []; };
        let phase = 0;
        for (let s = 0; s <= samples; s++) {
          const t = s / samples;
          const localU = (t - 0.5) * span;
          // Rotate the row by lineAngle into image uv space (centred on 0.5).
          const u = 0.5 + localU * cos - lvSin;
          const v = 0.5 + localU * sin + lvCos;
          if (u < 0 || u > 1 || v < 0 || v > 1) { flush(); continue; }
          const darkness = 1 - luma(u, v);
          if (!drawWhite && darkness <= WHITE_TONE) { flush(); continue; }
          phase += basePhaseStep * (0.18 + darkness * 0.82);
          const offset = Math.sin(phase) * amplitude * darkness;
          seg.push({
            x: cx + (u - 0.5) * rectW + normalX * offset,
            y: cy + (v - 0.5) * rectH + normalY * offset,
          });
        }
        flush();
        rowRuns.push(runs);
      }

      if (continuity === 'single') {
        // One continuous boustrophedon stroke: reverse odd rows, then thread every
        // run together, inserting a jump point wherever successive ends don't meet.
        const snake = [];
        rowRuns.forEach((runs, row) => {
          if (!runs.length) return;
          const ordered = row % 2 === 1
            ? runs.slice().reverse().map((run) => run.slice().reverse())
            : runs;
          ordered.forEach((run) => {
            if (run.length < 2) return;
            if (snake.length) {
              const last = snake[snake.length - 1];
              const start = run[0];
              if (last.x !== start.x || last.y !== start.y) snake.push({ x: start.x, y: start.y });
            }
            snake.push(...run);
          });
        });
        if (snake.length > 1) {
          snake.meta = { algorithm: 'imageWeave', straight: true };
          paths.push(snake);
        }
      } else {
        rowRuns.forEach((runs) => {
          runs.forEach((run) => {
            if (run.length > 1) {
              run.meta = { algorithm: 'imageWeave', straight: true };
              paths.push(run);
            }
          });
        });
        if (continuity === 'double') {
          // Keep rows separate but stitch consecutive rows on BOTH ends, ladder-style.
          const ends = rowRuns.map((runs) => {
            if (!runs.length) return null;
            const first = runs[0];
            const last = runs[runs.length - 1];
            return { left: first[0], right: last[last.length - 1] };
          });
          for (let i = 0; i < ends.length - 1; i++) {
            const a = ends[i];
            const b = ends[i + 1];
            if (!a || !b) continue;
            if (a.left && b.left) {
              const link = [a.left, b.left];
              link.meta = { algorithm: 'imageWeave', straight: true };
              paths.push(link);
            }
            if (a.right && b.right) {
              const link = [a.right, b.right];
              link.meta = { algorithm: 'imageWeave', straight: true };
              paths.push(link);
            }
          }
        }
      }
      return paths.filter((path) => path.length > 1);
    },
    formula: () => 'lateral wobble: freq & amplitude ∝ darkness(u,v)',
  };
})();
