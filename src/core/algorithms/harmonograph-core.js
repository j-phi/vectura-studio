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
  const TAU = Math.PI * 2;

  // Normalize the pendulum set from either the modern array form or the
  // legacy freq1/freq2/freq3 individual params (mirrors harmonograph.js).
  const normalizePendulums = (p) => {
    // An explicit array (even empty) is authoritative — only fall back to the
    // legacy freq1/freq2/freq3 params when no pendulums array is present.
    // Pintograph machine type = constant-velocity disks, no decay: damping is
    // forced to 0 so the figure loops perpetually (vs the Lateral pendulum's
    // exponential spiral-in). Applied at this single shared chokepoint.
    const noDamp = p.machineType === 'pintograph';
    if (Array.isArray(p.pendulums)) {
      return p.pendulums.map((pend) => ({
        ax: pend.ampX ?? 0,
        ay: pend.ampY ?? 0,
        phaseX: (pend.phaseX ?? 0) * DEG2RAD,
        phaseY: (pend.phaseY ?? 0) * DEG2RAD,
        freq: pend.freq ?? 1,
        micro: pend.micro ?? 0,
        damp: noDamp ? 0 : Math.max(0, pend.damp ?? 0),
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
      damp: noDamp ? 0 : Math.max(0, p[`damp${n}`] ?? 0),
      enabled: true,
    }));
  };

  // Resolve every motion edge to a typed target against the NORMALIZED struct,
  // folding all unit conversions into the amount so the per-sample loop only
  // ever adds raw deltas (no clones, no string parsing per sample). Phase is
  // radians in the struct but degrees in raw params; paperRotation is *2PI.
  const compileEdges = (motion, normalized) => {
    const compiled = [];
    const used = new Set();
    (motion.edges || []).forEach((e) => {
      if (!e || e.sourceId == null) return;
      const amt = Number.isFinite(e.amount) ? e.amount : 0;
      if (!amt) return;
      const path = String(e.targetParamPath || '');
      let target = null;
      let pendIdx = -1;
      let amount = amt;
      if (path === 'scale') target = 'scale';
      else if (path === 'loopDrift') target = 'loopDrift';
      else if (path === 'paperRotation') { target = 'rotSpeed'; amount = amt * TAU; }
      else {
        const m = path.match(/^pendulums\.(\d+)\.(\w+)$/);
        if (m) {
          pendIdx = Number(m[1]);
          const key = m[2];
          if (key === 'freq') target = 'freq';
          else if (key === 'micro') target = 'micro';
          else if (key === 'ampX') target = 'ax';
          else if (key === 'ampY') target = 'ay';
          else if (key === 'phaseX') { target = 'phaseX'; amount = amt * DEG2RAD; }
          else if (key === 'phaseY') { target = 'phaseY'; amount = amt * DEG2RAD; }
          else if (key === 'damp') target = 'damp';
        }
      }
      if (target && (pendIdx < 0 || normalized[pendIdx])) {
        compiled.push({ sourceId: e.sourceId, target, pendIdx, amount });
        used.add(e.sourceId);
      }
    });
    return { compiled, used };
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
    const rotSpeed = (p.paperRotation ?? 0) * TAU;
    const loopDrift = p.loopDrift ?? 0;
    const settleThreshold = Math.max(0, p.settleThreshold ?? 0);
    const settleWindow = Math.max(1, Math.floor(p.settleWindow ?? 24));

    const normalized = normalizePendulums(p);
    const active = normalized.filter((pend) => pend.enabled !== false);
    if (!active.length) return { path: [], durationSec: 0 };

    // Motion: an LFO is a function of the figure's own progress t, baked per
    // sample into the geometry, so the modulated figure is deterministic and
    // STATIC. Both the plotter ghost and generate() use this, so the live
    // preview and the final output match.
    const motion = opts.motion ?? p.motion;
    const mod = (typeof window !== 'undefined' ? window : globalThis)?.Vectura?.HarmonographModulation;
    const hasMotion = !!(mod && mod.hasActiveEdges && mod.hasActiveEdges(motion));

    const path = [];
    const dt = duration / count;
    let settleCount = 0;

    if (!hasMotion) {
      // Unmodulated path — byte-identical to the original (no scratch reads).
      for (let i = 0; i <= count; i += 1) {
        const t = i * dt;
        let x = 0;
        let y = 0;
        for (let k = 0; k < active.length; k += 1) {
          const pend = active[k];
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
    }

    // Modulated path. Edges are resolved against `normalized` (original indices
    // survive disabled-pendulum filtering); the inner sum skips disabled ones.
    const { compiled, used } = compileEdges(motion, normalized);
    const sources = (motion.sources || []).filter((s) => s && used.has(s.id) && s.enabled !== false);
    const pd = normalized.map(() => ({ freq: 0, micro: 0, ax: 0, ay: 0, phaseX: 0, phaseY: 0, damp: 0 }));
    const sv = Object.create(null);
    for (let i = 0; i <= count; i += 1) {
      const t = i * dt;
      for (let s = 0; s < sources.length; s += 1) sv[sources[s].id] = mod.evaluateSource(sources[s], t, duration);
      let dScale = 0;
      let dLoop = 0;
      let dRot = 0;
      for (let k = 0; k < pd.length; k += 1) {
        const o = pd[k];
        o.freq = 0; o.micro = 0; o.ax = 0; o.ay = 0; o.phaseX = 0; o.phaseY = 0; o.damp = 0;
      }
      for (let e = 0; e < compiled.length; e += 1) {
        const edge = compiled[e];
        const add = edge.amount * (sv[edge.sourceId] || 0);
        if (edge.target === 'scale') dScale += add;
        else if (edge.target === 'loopDrift') dLoop += add;
        else if (edge.target === 'rotSpeed') dRot += add;
        else pd[edge.pendIdx][edge.target] += add;
      }
      const scaleM = scale + dScale;
      const loopDriftM = loopDrift + dLoop;
      const rotSpeedM = rotSpeed + dRot;
      let x = 0;
      let y = 0;
      for (let k = 0; k < normalized.length; k += 1) {
        const pend = normalized[k];
        if (pend.enabled === false) continue;
        const s = pd[k];
        const freq = (pend.freq + s.freq + pend.micro + s.micro + loopDriftM * t) * Math.PI * 2;
        const decay = Math.exp(-Math.max(0, pend.damp + s.damp) * t); // clamp: bipolar damp LFO must not blow up
        x += (pend.ax + s.ax) * Math.sin(freq * t + pend.phaseX + s.phaseX) * decay;
        y += (pend.ay + s.ay) * Math.sin(freq * t + pend.phaseY + s.phaseY) * decay;
      }
      x *= scaleM;
      y *= scaleM;
      if (rotSpeedM) {
        const ang = rotSpeedM * t;
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
