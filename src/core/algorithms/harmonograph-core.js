/**
 * harmonograph-core — shared, pipeline-free harmonograph evaluator.
 *
 * This is the "evaluate-only seam" the live playback needs: a pure
 * params -> path function that bypasses the full display-geometry pipeline
 * (engine.generate -> computeAllDisplayGeometry -> masking/optimize), so it
 * is cheap enough to call every animation frame. The algorithm's generate()
 * keeps its own copy for now (it has no visual baseline to guard a refactor);
 * the panel's virtual-plotter widget delegates here.
 *
 * Exposes window.Vectura.HarmonographCore.evaluatePath(params, opts).
 *   opts.cx, opts.cy   — center offset added to every point (default 0).
 *   opts.sampleCap     — hard cap on sample count for cheap live preview;
 *                        the curve spans the same duration, just coarser.
 *   opts.samples       — explicit sample-count override (else params.samples).
 * Returns { path: [{ x, y, t }], durationSec }.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const DEG2RAD = Math.PI / 180;

  // Normalize the pendulum set from either the modern array form or the
  // legacy freq1/freq2/freq3 individual params (mirrors harmonograph.js).
  const normalizePendulums = (p) => {
    // An explicit array (even empty) is authoritative — only fall back to the
    // legacy freq1/freq2/freq3 params when no pendulums array is present.
    if (Array.isArray(p.pendulums)) {
      return p.pendulums.map((pend) => ({
        ax: pend.ampX ?? 0,
        ay: pend.ampY ?? 0,
        phaseX: (pend.phaseX ?? 0) * DEG2RAD,
        phaseY: (pend.phaseY ?? 0) * DEG2RAD,
        freq: pend.freq ?? 1,
        micro: pend.micro ?? 0,
        damp: Math.max(0, pend.damp ?? 0),
        enabled: pend.enabled !== false,
      }));
    }
    return [1, 2, 3].map((n) => ({
      ax: p[`ampX${n}`] ?? 0,
      ay: p[`ampY${n}`] ?? 0,
      phaseX: (p[`phaseX${n}`] ?? 0) * DEG2RAD,
      phaseY: (p[`phaseY${n}`] ?? 0) * DEG2RAD,
      freq: p[`freq${n}`] ?? 1,
      micro: p[`micro${n}`] ?? 0,
      damp: Math.max(0, p[`damp${n}`] ?? 0),
      enabled: true,
    }));
  };

  const evaluatePath = (params, opts = {}) => {
    const p = params || {};
    const cx = opts.cx ?? 0;
    const cy = opts.cy ?? 0;
    const requested = Math.max(200, Math.floor(opts.samples ?? p.samples ?? 4000));
    const cap = Number.isFinite(opts.sampleCap) ? Math.max(2, Math.floor(opts.sampleCap)) : Infinity;
    const count = Math.min(requested, cap);

    const duration = Math.max(1, p.duration ?? 30);
    const scale = p.scale ?? 1;
    const rotSpeed = (p.paperRotation ?? 0) * Math.PI * 2;
    const loopDrift = p.loopDrift ?? 0;
    const settleThreshold = Math.max(0, p.settleThreshold ?? 0);
    const settleWindow = Math.max(1, Math.floor(p.settleWindow ?? 24));

    const pendulums = normalizePendulums(p).filter((pend) => pend.enabled !== false);
    if (!pendulums.length) return { path: [], durationSec: 0 };

    const path = [];
    const dt = duration / count;
    let settleCount = 0;
    for (let i = 0; i <= count; i += 1) {
      const t = i * dt;
      let x = 0;
      let y = 0;
      for (let k = 0; k < pendulums.length; k += 1) {
        const pend = pendulums[k];
        const freq = (pend.freq + pend.micro + loopDrift * t) * Math.PI * 2;
        const decay = Math.exp(-pend.damp * t);
        x += pend.ax * Math.sin(freq * t + pend.phaseX) * decay;
        y += pend.ay * Math.sin(freq * t + pend.phaseY) * decay;
      }
      x *= scale;
      y *= scale;
      if (rotSpeed) {
        const ang = rotSpeed * t;
        const rx = x * Math.cos(ang) - y * Math.sin(ang);
        const ry = x * Math.sin(ang) + y * Math.cos(ang);
        x = rx;
        y = ry;
      }
      path.push({ x: cx + x, y: cy + y, t });
      if (settleThreshold > 0) {
        const mag = Math.hypot(x, y);
        settleCount = mag <= settleThreshold ? settleCount + 1 : 0;
        if (settleCount >= settleWindow) break;
      }
    }

    return { path, durationSec: path.length ? path[path.length - 1].t : 0 };
  };

  Vectura.HarmonographCore = { evaluatePath, normalizePendulums };
})();
