/**
 * harmonograph-modulation — temporal modulation engine for the harmonograph
 * studio (Phase 2). This is the time axis the noise-rack never had: it turns a
 * static parameter set into a moving one by applying LFO/envelope "sources" to
 * parameters through a typed edge matrix, evaluated per animation frame.
 *
 * Data model (lives in layer.params.motion, so it serializes into .vectura for
 * free and round-trips through undo):
 *   sources: [{ id, enabled, shape, rate, syncMode, depth, phase, polarity }]
 *     shape    'sine'|'triangle'|'saw'|'square'|'sample-hold'|'random'|'drawn'
 *     points   (shape 'drawn' only) [{x:0..1, y:-1..1}, ...] sorted by x with
 *              endpoints at x=0 and x=1 — a hand-drawn per-loop curve, linearly
 *              interpolated by phase
 *   macro sources: [{ id, type:'macro', enabled, value: 0..1, depth }]
 *     A static knob (no shape/rate/phase/sync). evaluateSource returns
 *     value*depth at every t — one macro can drive many signed edges.
 *     syncMode 'free' (rate = Hz) | 'sync' (rate = cycles per figure duration —
 *              synced LFOs repeat exactly with the loop = a shareable animation)
 *     depth    0..1 attenuator on the source output
 *     phase    0..1 cycle offset
 *     polarity 'bi' (-1..1) | 'uni' (0..1)
 *   edges: [{ id, sourceId, targetParamPath, amount }]
 *     targetParamPath  e.g. 'loopDrift', 'scale', 'pendulums.0.freq'
 *     amount           signed param-space depth: delta = amount * sourceOutput
 *
 * Exposes window.Vectura.HarmonographModulation.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const TAU = Math.PI * 2;

  // Small deterministic hash → [0,1). Used for sample-hold/random so a synced
  // LFO produces the SAME sequence every loop (no Math.random nondeterminism).
  const hash01 = (str, n) => {
    let h = 2166136261 >>> 0;
    const s = `${str}|${n}`;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return (h >>> 0) / 4294967296;
  };

  const wrap01 = (v) => v - Math.floor(v);

  // Raw shape in [-1, 1] for a phase in [0, 1). `points` is only used by the
  // 'drawn' shape (the per-loop hand-drawn curve).
  const shapeValue = (shape, phase, sourceId, cycleIndex, points) => {
    const p = wrap01(phase);
    switch (shape) {
      case 'triangle':
        return 1 - 4 * Math.abs(p - 0.5);
      case 'saw':
        return 2 * p - 1;
      case 'square':
        return p < 0.5 ? 1 : -1;
      case 'sample-hold':
        return hash01(sourceId, cycleIndex) * 2 - 1;
      case 'random': {
        // Smooth (lerped) random between per-cycle hold points.
        const a = hash01(sourceId, cycleIndex) * 2 - 1;
        const b = hash01(sourceId, cycleIndex + 1) * 2 - 1;
        const f = p; // already the within-cycle fraction
        return a + (b - a) * f;
      }
      case 'drawn':
        // Draw-your-own LFO: linearly interpolate y between the two control
        // points surrounding the cycle phase. `points` is sorted by x with
        // endpoints at x=0 and x=1; <2 points means an empty curve → 0.
        return drawnValue(points, p);
      case 'sine':
      default:
        return Math.sin(TAU * p);
    }
  };

  // Linear interpolation across a drawn curve's control points at phase p
  // (0..1). points: [{x,y}, ...] sorted ascending by x. Returns 0 for <2 points.
  const drawnValue = (points, p) => {
    if (!Array.isArray(points) || points.length < 2) return 0;
    if (p <= points[0].x) return points[0].y;
    const last = points[points.length - 1];
    if (p >= last.x) return last.y;
    for (let i = 1; i < points.length; i += 1) {
      const b = points[i];
      if (p <= b.x) {
        const a = points[i - 1];
        const span = b.x - a.x;
        if (span <= 0) return b.y;
        const f = (p - a.x) / span;
        return a.y + (b.y - a.y) * f;
      }
    }
    return last.y;
  };

  // Evaluate one source at playback time clockT (seconds) over a loop of
  // `duration` seconds. Returns a value scaled by depth: [-1,1]*depth for
  // bipolar, [0,1]*depth for unipolar.
  const evaluateSource = (source, clockT, duration) => {
    if (!source || source.enabled === false) return 0;
    // Macro: a static, time-independent knob (0..1) scaled by depth. Unipolar by
    // nature — one macro can drive many edges (each edge carries its own signed
    // amount), so it acts like a hand-positioned constant the baked figure
    // reflects. No shape/rate/phase/sync — value is the same at every t.
    if (source.type === 'macro') {
      const value = Number.isFinite(source.value) ? source.value : 0;
      const macroDepth = Number.isFinite(source.depth) ? source.depth : 1;
      return value * macroDepth;
    }
    const rate = Number.isFinite(source.rate) ? source.rate : 1;
    const depth = Number.isFinite(source.depth) ? source.depth : 1;
    const phaseOff = Number.isFinite(source.phase) ? source.phase : 0;
    const dur = Math.max(0.0001, duration || 30);
    // Position within the LFO cycle. SYNC wraps into the current loop so the
    // sequence (including sample-hold) replays identically every figure loop —
    // a shareable animation. FREE accumulates forever for endless drift.
    let c;
    if (source.syncMode === 'sync') {
      c = wrap01(clockT / dur) * rate + phaseOff;
    } else {
      c = clockT * rate + phaseOff;
    }
    const cycleIndex = Math.floor(c);
    const phase = wrap01(c);
    let v = shapeValue(source.shape || 'sine', phase, source.id || 'src', cycleIndex, source.points);
    if (source.polarity === 'uni') v = (v + 1) / 2;
    return v * depth;
  };

  // Add `delta` to the value at a dot path inside params (mutates the clone).
  // Supports top-level keys and 'pendulums.<i>.<key>'.
  const addAtPath = (params, path, delta) => {
    if (!path || !Number.isFinite(delta)) return;
    const parts = path.split('.');
    let node = params;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      const idx = /^\d+$/.test(key) ? Number(key) : key;
      if (node == null) return;
      node = node[idx];
    }
    if (node == null) return;
    const last = parts[parts.length - 1];
    const lastIdx = /^\d+$/.test(last) ? Number(last) : last;
    const cur = node[lastIdx];
    if (typeof cur === 'number') node[lastIdx] = cur + delta;
  };

  const cloneParams = (params) => {
    const out = Object.assign({}, params);
    if (Array.isArray(params.pendulums)) {
      out.pendulums = params.pendulums.map((p) => Object.assign({}, p));
    }
    return out;
  };

  // Produce a LIVE param set = baseParams with every edge's modulation applied
  // at clockT. Pure: returns a new object, never mutates baseParams.
  const applyModulation = (baseParams, motion, clockT, duration) => {
    const params = cloneParams(baseParams || {});
    if (!motion || !Array.isArray(motion.sources) || !Array.isArray(motion.edges)) return params;
    const dur = Math.max(0.0001, duration || baseParams?.duration || 30);
    const cache = {};
    motion.sources.forEach((s) => {
      if (s && s.id != null) cache[s.id] = evaluateSource(s, clockT, dur);
    });
    motion.edges.forEach((edge) => {
      if (!edge || edge.sourceId == null) return;
      const sv = cache[edge.sourceId];
      if (!Number.isFinite(sv)) return;
      const amount = Number.isFinite(edge.amount) ? edge.amount : 0;
      addAtPath(params, edge.targetParamPath, amount * sv);
    });
    return params;
  };

  // True when a motion patch would actually drive something this frame.
  const hasActiveEdges = (motion) =>
    !!(motion && Array.isArray(motion.edges) && motion.edges.length &&
       Array.isArray(motion.sources) && motion.sources.some((s) => s && s.enabled !== false));

  Vectura.HarmonographModulation = {
    evaluateSource,
    applyModulation,
    hasActiveEdges,
    shapeValue,
    SHAPES: ['sine', 'triangle', 'saw', 'square', 'sample-hold', 'random', 'drawn'],
  };
})();
