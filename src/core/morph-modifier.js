/**
 * Morph modifier geometry helpers (M1 — core morph math).
 *
 * Loads AFTER src/core/modifiers.js and APPENDS to the existing
 * window.Vectura.Modifiers object. Implements arc-length resampling,
 * correspondence alignment, linear path blending with easing, and the
 * multi-child morph pipeline that produces graduated in-between rings.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const Modifiers = Vectura.Modifiers || (Vectura.Modifiers = {});

  const clone = Vectura.Utils.clone;
  const clampFn = Vectura.AlgorithmUtils.clamp;

  // ---------------------------------------------------------------------------
  // Easing
  // ---------------------------------------------------------------------------
  const EASING = {
    'linear': (t) => t,
    'ease-in': (t) => t * t,
    'ease-out': (t) => t * (2 - t),
    'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    'cubic-in': (t) => t * t * t,
    'cubic-out': (t) => 1 - Math.pow(1 - t, 3),
  };

  const applyEasing = (name, t) => {
    const fn = EASING[name] || EASING.linear;
    return fn(t);
  };

  // ---------------------------------------------------------------------------
  // Flattening helpers
  // ---------------------------------------------------------------------------
  const flattenCircle = (meta, count) => {
    const cx = meta?.cx ?? meta?.x ?? 0;
    const cy = meta?.cy ?? meta?.y ?? 0;
    const rx = meta?.rx ?? meta?.r ?? 0;
    const ry = meta?.ry ?? meta?.r ?? rx;
    const rotation = meta?.rotation ?? 0;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const points = [];
    const n = Math.max(3, Math.round(count) || 72);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.cos(a) * rx;
      const py = Math.sin(a) * ry;
      points.push({
        x: cx + px * cosR - py * sinR,
        y: cy + px * sinR + py * cosR,
      });
    }
    return points;
  };

  /**
   * Flattens a path into a plain {x,y}[] of vertices, expanding circles and
   * bezier-anchor paths. Preserves .meta (cloned) on the returned array.
   */
  const flattenForMorph = (path, resampleCount) => {
    if (!Array.isArray(path)) return [];
    let points;
    if (path.meta && path.meta.kind === 'circle') {
      points = flattenCircle(path.meta, resampleCount);
    } else if (path.meta && path.meta.anchors) {
      // Flatten from anchors HONORING handles: straight segments where in/out
      // are null (sharp polygon corners), bezier where present (ovals/curves).
      // NOT flattenSmoothedPath — that midpoint-smooths a handle-less polygon
      // into a circle, which silently rounds away sharp corners before the morph
      // ever sees them (a hexagon would blend as a circle).
      const buildPoly = window.Vectura?.GeometryUtils?.buildPolylineFromAnchors;
      if (typeof buildPoly === 'function') {
        const flat = buildPoly(path.meta.anchors, path.meta.closed === true);
        points = (flat && flat.length)
          ? flat.map((pt) => ({ x: pt.x, y: pt.y }))
          : path.map((pt) => ({ x: pt.x, y: pt.y }));
      } else {
        points = path.map((pt) => ({ x: pt.x, y: pt.y }));
      }
    } else {
      points = path.map((pt) => ({ x: pt.x, y: pt.y }));
    }
    if (path.meta) points.meta = clone(path.meta);
    return points;
  };

  const clonePath = (path) => {
    if (!Array.isArray(path)) return [];
    const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
    if (path.meta) next.meta = clone(path.meta);
    return next;
  };

  // ---------------------------------------------------------------------------
  // Corner detection (structural complexity of a source outline)
  // ---------------------------------------------------------------------------
  // Turn angle (radians, 0..PI) at a flattened vertex i within a closed ring.
  const turnAt = (pts, i, closed) => {
    const n = pts.length;
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    if (!closed && (i === 0 || i === n - 1)) return 0;
    const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
    const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  };

  // Structural corner count of a source path. Circles → 0 (no corners, fully
  // round). Anchored shapes with null in/out handles → count of sharp anchors.
  // Otherwise count flattened vertices whose turn exceeds a corner threshold.
  // Drives the auto anchor count for corner-matched bezier morphing.
  const CORNER_TURN_THRESHOLD = (28 * Math.PI) / 180; // ~28° = a real corner
  const cornerCountOf = (rawPath) => {
    const meta = rawPath && rawPath.meta;
    if (meta && meta.kind === 'circle') return 0;
    if (meta && Array.isArray(meta.anchors) && meta.anchors.length) {
      let sharp = 0;
      meta.anchors.forEach((a) => {
        if (!a.in && !a.out) sharp += 1;
      });
      // A handle-less anchored polygon: every anchor is a sharp corner.
      if (sharp === meta.anchors.length) return sharp;
      // Mixed/curved anchored shape: fall through to geometric detection so a
      // rounded-rect (4 sharp + 4 curved) doesn't undercount.
    }
    const pts = flattenForMorph(rawPath, 128);
    const closed = isPathClosed(rawPath);
    let n = pts.length;
    // Drop a trailing wrap vertex so a closed ring isn't double-counted.
    if (closed && n > 1 && Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y) < 1e-6) {
      n -= 1;
    }
    let corners = 0;
    for (let i = 0; i < n; i += 1) {
      if (turnAt(pts, i, closed) > CORNER_TURN_THRESHOLD) corners += 1;
    }
    return corners;
  };

  // ---------------------------------------------------------------------------
  // Corner-matched bezier representation
  // ---------------------------------------------------------------------------
  // Build K anchors evenly along a source by arc length, plus per-anchor data
  // needed to interpolate ROUNDNESS: each anchor carries its position and the
  // half-segment length used to size tangential bezier handles for a smooth
  // (circle-like) rendering, and a `round` 0..1 weight (0 = sharp corner → zero
  // handles, 1 = fully round → tangential handles). A polygon source yields
  // round≈0 at its corners; a circle yields round≈1 everywhere, so blending the
  // handle weights rounds a hexagon smoothly into a circle while keeping K
  // anchors throughout.
  const buildCornerSamples = (rawPath, K, closed) => {
    const resampled = resamplePath(rawPath, K, closed, 'arc-length');
    const pts = resampled.map((p) => ({ x: p.x, y: p.y }));
    const isCircle = !!(rawPath && rawPath.meta && rawPath.meta.kind === 'circle');
    const n = pts.length;
    const samples = [];
    for (let i = 0; i < n; i += 1) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      // Tangent direction = chord prev→next (Catmull-Rom style), used to orient
      // bezier handles tangentially for a smooth curve.
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const tlen = Math.hypot(tx, ty) || 1;
      const ux = tx / tlen;
      const uy = ty / tlen;
      // Handle length ≈ 1/3 of the local segment length (standard Catmull-Rom→
      // bezier factor) — this is the length that, on a circle, reproduces the
      // arc closely.
      const segIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      const segOut = Math.hypot(next.x - cur.x, next.y - cur.y);
      // Roundness weight: a circle is fully round; otherwise the local turn angle
      // tells us how sharp this anchor is (small turn → already smooth/round,
      // large turn → sharp corner that should stay sharp until blended).
      let round;
      if (isCircle) {
        round = 1;
      } else {
        const turn = turnAt(pts, i, closed);
        // turn 0 (flat) → round 1; turn >= threshold (sharp) → round 0.
        round = clampFn(1 - turn / (Math.PI * 0.5), 0, 1);
      }
      samples.push({
        x: cur.x,
        y: cur.y,
        ux,
        uy,
        hIn: (segIn / 3),
        hOut: (segOut / 3),
        round,
      });
    }
    return samples;
  };

  // Rotate sample array by offset r (closed loops only) so two sample sets
  // correspond anchor-to-anchor after correspondenceAlign.
  const rotateSamples = (samples, r) => {
    const n = samples.length;
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(samples[(i + r) % n]);
    return out;
  };

  // Reverse a sample ring's traversal direction, fixing per-anchor tangent data:
  // reversing swaps each anchor's prev/next neighbours, so the tangent direction
  // flips (negate ux/uy) and the in/out handle lengths swap. Reversing positions
  // alone would leave handles pointing the wrong way and kink asymmetric shapes.
  const reverseSamples = (samples) =>
    samples.slice().reverse().map((s) => ({
      x: s.x,
      y: s.y,
      ux: -s.ux,
      uy: -s.uy,
      hIn: s.hOut,
      hOut: s.hIn,
      round: s.round,
    }));

  // Build an anchored bezier ring from two corresponding sample sets at blend t.
  // Positions lerp; handle lengths AND roundness lerp, so corners round
  // gradually. Returns { points, anchors } where points is the flattened
  // polyline (few, smoothly-curved vertices — NOT 128 straight segments) and
  // anchors carry in/out handles for direct-selection editing and bezier export.
  const blendCornerRing = (sa, sb, t, closed) => {
    const n = Math.min(sa.length, sb.length);
    const anchors = [];
    for (let i = 0; i < n; i += 1) {
      const a = sa[i];
      const b = sb[i];
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      // Blend roundness and handle length independently per side, then scale the
      // tangential handle by the roundness weight: round≈0 → null handle (sharp
      // straight corner), round≈1 → full tangential handle (smooth curve).
      const round = a.round + (b.round - a.round) * t;
      const ux = a.ux + (b.ux - a.ux) * t;
      const uy = a.uy + (b.uy - a.uy) * t;
      const ulen = Math.hypot(ux, uy) || 1;
      const dirx = ux / ulen;
      const diry = uy / ulen;
      const hIn = (a.hIn + (b.hIn - a.hIn) * t) * round;
      const hOut = (a.hOut + (b.hOut - a.hOut) * t) * round;
      const anchor = { x, y, in: null, out: null };
      if (hIn > 1e-6) anchor.in = { x: x - dirx * hIn, y: y - diry * hIn };
      if (hOut > 1e-6) anchor.out = { x: x + dirx * hOut, y: y + diry * hOut };
      anchors.push(anchor);
    }
    const points = flattenAnchorRing(anchors, closed === true);
    return { points, anchors };
  };

  // Flatten an anchored ring into a SPARSE polyline. Straight segments (null
  // handles → sharp polygon corners) emit just the two endpoints; bezier
  // segments are adaptively sampled with a COARSE tolerance so a smoothly
  // rounded ring carries a few points per arc rather than ~16 (buildPolyline-
  // FromAnchors' default tolerance 0.1 would emit ~90 points for a hexagon-
  // sized ring). This is the plotter-efficiency win: corner anchors stay sharp
  // and large, round arcs become a handful of points. Tolerance is scaled to
  // the ring size so the chord error stays a small fraction of the shape.
  const flattenAnchorRing = (anchors, closed) => {
    const sampleBez = window.Vectura?.GeometryUtils?.sampleCubicBezier;
    const n = anchors.length;
    if (n < 2) return anchors.map((a) => ({ x: a.x, y: a.y }));
    // Ring extent → tolerance ≈ 0.8% of the larger dimension (clamped), a good
    // plotter/screen compromise that keeps arcs smooth without flooding points.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i += 1) {
      if (anchors[i].x < minX) minX = anchors[i].x;
      if (anchors[i].y < minY) minY = anchors[i].y;
      if (anchors[i].x > maxX) maxX = anchors[i].x;
      if (anchors[i].y > maxY) maxY = anchors[i].y;
    }
    const extent = Math.max(maxX - minX, maxY - minY) || 1;
    const tol = clampFn(extent * 0.008, 0.25, 4);
    const pts = [];
    const emit = (a, b) => {
      let seg;
      if ((!a.out && !b.in) || typeof sampleBez !== 'function') {
        seg = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }];
      } else {
        seg = sampleBez(a, a.out || a, b.in || b, b, tol);
      }
      if (pts.length) seg.shift();
      for (let i = 0; i < seg.length; i += 1) pts.push({ x: seg[i].x, y: seg[i].y });
    };
    for (let i = 0; i < n - 1; i += 1) emit(anchors[i], anchors[i + 1]);
    if (closed && n >= 2) emit(anchors[n - 1], anchors[0]);
    return pts;
  };

  // A path is treated as a closed loop for morphing if its meta says so, if it's
  // a circle, or if its endpoints coincide. Closed shapes must blend with
  // rotational correspondence (not open index-matching) or their start vertices
  // misalign and the in-between rings twist / collapse through the centroid.
  const isPathClosed = (path) => {
    if (!Array.isArray(path) || path.length < 3) return false;
    const meta = path.meta;
    if (meta) {
      if (meta.kind === 'circle') return true;
      if (typeof meta.closed === 'boolean') return meta.closed;
    }
    const a = path[0];
    const b = path[path.length - 1];
    return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  };

  // ---------------------------------------------------------------------------
  // Arc-length resampling
  // ---------------------------------------------------------------------------
  const resamplePath = (pts, N, closed = false, mode = 'arc-length') => {
    const target = Math.max(0, Math.round(N) || 0);
    // Flatten circle / bezier inputs into plain vertices first.
    const src = flattenForMorph(pts, target);
    const srcMeta = (pts && pts.meta) ? clone(pts.meta) : null;

    const finalize = (arr) => {
      if (srcMeta) arr.meta = srcMeta;
      return arr;
    };

    if (!src.length) return finalize([]);
    if (target < 1) return finalize([]);

    // Uniform-index mode: evenly-spaced VERTICES (faster, coarser) rather than
    // perceptually-even arc-length spacing. Useful when source vertices are
    // already meaningfully distributed and arc-length redistribution is unwanted.
    if (mode === 'uniform-index') {
      const seq = closed ? src.concat([src[0]]) : src;
      const span = seq.length - 1;
      const out = [];
      if (span <= 0) {
        for (let k = 0; k < target; k += 1) out.push({ x: src[0].x, y: src[0].y });
        return finalize(out);
      }
      const denom = (closed ? target : Math.max(1, target - 1));
      for (let k = 0; k < target; k += 1) {
        const f = closed ? (k * span) / denom : (k * span) / denom;
        let i = Math.floor(f);
        if (i >= seq.length - 1) i = seq.length - 2;
        const t = f - i;
        const a = seq[i];
        const b = seq[i + 1] || a;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      return finalize(out);
    }

    // Total arc length (+ closing segment if closed).
    const segLens = [];
    let L = 0;
    for (let i = 0; i < src.length - 1; i += 1) {
      const d = Math.hypot(src[i + 1].x - src[i].x, src[i + 1].y - src[i].y);
      segLens.push(d);
      L += d;
    }
    if (closed && src.length >= 2) {
      const d = Math.hypot(src[0].x - src[src.length - 1].x, src[0].y - src[src.length - 1].y);
      segLens.push(d);
      L += d;
    }

    if (L < 1e-6) {
      const out = [];
      for (let k = 0; k < target; k += 1) out.push({ x: src[0].x, y: src[0].y });
      return finalize(out);
    }

    // Cumulative LUT over the vertex sequence (including wrap point if closed).
    const seq = closed ? src.concat([src[0]]) : src;
    const cum = [0];
    for (let i = 0; i < segLens.length; i += 1) cum.push(cum[i] + segLens[i]);

    const sampleAt = (dist) => {
      const d = clampFn(dist, 0, L);
      // Binary search for the segment containing d.
      let lo = 0;
      let hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < d) lo = mid + 1;
        else hi = mid;
      }
      let seg = lo - 1;
      if (seg < 0) seg = 0;
      const segLen = segLens[seg] || 0;
      const a = seq[seg];
      const b = seq[seg + 1] || a;
      const t = segLen > 1e-9 ? (d - cum[seg]) / segLen : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    };

    const out = [];
    if (closed) {
      for (let k = 0; k < target; k += 1) out.push(sampleAt((k * L) / target));
    } else if (target === 1) {
      out.push({ x: src[0].x, y: src[0].y });
    } else {
      for (let k = 0; k < target; k += 1) out.push(sampleAt((k * L) / (target - 1)));
    }
    return finalize(out);
  };

  // ---------------------------------------------------------------------------
  // Correspondence alignment
  // ---------------------------------------------------------------------------
  const centroidOf = (pts) => {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < pts.length; i += 1) {
      sx += pts[i].x;
      sy += pts[i].y;
    }
    const n = Math.max(1, pts.length);
    return { x: sx / n, y: sy / n };
  };

  const correspondenceAlign = (A, B, mode = 'centroid-angle') => {
    if (A.length !== B.length) {
      throw new Error('correspondenceAlign: paths must have equal length');
    }
    const N = A.length;
    if (N === 0) return 0;

    if (mode === 'arc-length') return 0;

    if (mode === 'nearest') {
      let best = 0;
      let bestCost = Infinity;
      for (let r = 0; r < N; r += 1) {
        let cost = 0;
        for (let v = 0; v < N; v += 1) {
          const b = B[(v + r) % N];
          const dx = A[v].x - b.x;
          const dy = A[v].y - b.y;
          cost += dx * dx + dy * dy;
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = r;
        }
      }
      return best;
    }

    // default: centroid-angle
    const ca = centroidOf(A);
    const cb = centroidOf(B);
    const targetAngle = Math.atan2(A[0].y - ca.y, A[0].x - ca.x);
    let best = 0;
    let bestDiff = Infinity;
    for (let r = 0; r < N; r += 1) {
      const angle = Math.atan2(B[r].y - cb.y, B[r].x - cb.x);
      let diff = Math.abs(angle - targetAngle);
      if (diff > Math.PI) diff = Math.abs(diff - 2 * Math.PI);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = r;
      }
    }
    return best;
  };

  // ---------------------------------------------------------------------------
  // Blending
  // ---------------------------------------------------------------------------
  const blendPaths = (A, B, t, easing = 'linear') => {
    const tt = applyEasing(easing, t);
    return A.map((a, i) => {
      const b = B[i] || a;
      return { x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt };
    });
  };

  // ---------------------------------------------------------------------------
  // Selective Catmull-Rom smoothing
  // ---------------------------------------------------------------------------
  const catmullRomMidpoint = (p0, p1, p2) => {
    // Catmull-Rom evaluated at the parameter midpoint between p0..p2 with
    // tension 0.5 — for a single replacement vertex we blend toward the
    // average of the neighbors (the centripetal midpoint of the local span).
    return {
      x: 0.5 * p1.x + 0.25 * p0.x + 0.25 * p2.x,
      y: 0.5 * p1.y + 0.25 * p0.y + 0.25 * p2.y,
    };
  };

  const smoothRing = (pts, smoothing, closed) => {
    if (!(smoothing > 0) || pts.length < 3) return pts;
    const threshold = (1 - smoothing) * (Math.PI / 4);
    const out = pts.map((p) => ({ x: p.x, y: p.y }));
    const n = pts.length;
    const turning = (prev, cur, next) => {
      const a1 = Math.atan2(cur.y - prev.y, cur.x - prev.x);
      const a2 = Math.atan2(next.y - cur.y, next.x - cur.x);
      let d = a2 - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return Math.abs(d);
    };
    const start = closed ? 0 : 1;
    const end = closed ? n : n - 1;
    for (let i = start; i < end; i += 1) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      if (turning(prev, cur, next) > threshold) {
        out[i] = catmullRomMidpoint(prev, cur, next);
      }
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // Parameter resolution
  // ---------------------------------------------------------------------------
  const resolveMorphParams = (modifier) => {
    const m = modifier || {};
    return {
      steps: clampFn(Math.round(m.steps ?? 6), 0, 64),
      resampleCount: clampFn(Math.round(m.resampleCount ?? 128), 8, 512),
      // Corner-matched bezier morphing (default ON). When enabled and a pair is
      // a closed loop, intermediate rings are built from a small set of anchors
      // (≈ the busier source's structural complexity) with interpolated bezier
      // handles — a hexagon keeps ~6 anchors and rounds smoothly into a circle,
      // instead of every ring being a 128-point polyline. Falls back to dense
      // arc-length resampling for open paths or when explicitly disabled.
      cornerMatch: m.cornerMatch !== false,
      // Max anchors the corner-matched path may use (keeps complex sources from
      // exploding). Clamped to the dense resampleCount as an upper bound.
      cornerMatchMax: clampFn(Math.round(m.cornerMatchMax ?? 64), 4, 256),
      resampleMode: m.resampleMode === 'uniform-index' ? 'uniform-index' : 'arc-length',
      easing: m.easing || 'linear',
      sequenceMode: m.sequenceMode || 'sequential',
      correspondenceMode: m.correspondenceMode || 'centroid-angle',
      windingCheck: m.windingCheck !== false,
      multiPathStrategy: m.multiPathStrategy || 'auto',
      emitSources: m.emitSources !== false,
      closureMode: m.closureMode || 'auto',
      smoothing: clampFn(Number(m.smoothing) || 0, 0, 1),
      fillMode: m.fillMode === 'off' ? 'off' : 'morph',
      fillRegenLimit: clampFn(Math.round(m.fillRegenLimit ?? 0), 0, 4096),
    };
  };

  // ---------------------------------------------------------------------------
  // Representative selection per child for a pair (A,B)
  // ---------------------------------------------------------------------------
  const averagePaths = (paths, resampleCount, closed) => {
    const resampled = paths.map((p) => resamplePath(p, resampleCount, closed));
    const N = resampleCount;
    const out = [];
    for (let i = 0; i < N; i += 1) {
      let sx = 0;
      let sy = 0;
      for (let k = 0; k < resampled.length; k += 1) {
        const pt = resampled[k][i] || resampled[k][resampled[k].length - 1] || { x: 0, y: 0 };
        sx += pt.x;
        sy += pt.y;
      }
      out.push({ x: sx / resampled.length, y: sy / resampled.length });
    }
    // Inherit meta from the first path for pen/closure propagation.
    if (paths[0] && paths[0].meta) out.meta = clone(paths[0].meta);
    return out;
  };

  const longestPath = (paths) => {
    let best = paths[0];
    for (let i = 1; i < paths.length; i += 1) {
      if (paths[i].length > best.length) best = paths[i];
    }
    return best;
  };

  /**
   * Returns { listA, listB } of representative paths for a pair of children,
   * each list having equal length K. Each representative is a raw (un-resampled)
   * path; resampling happens in the pair loop.
   */
  const buildRepresentatives = (childA, childB, strategy, resampleCount, closed = false) => {
    const countA = childA.length;
    const countB = childB.length;

    let resolved = strategy;
    if (strategy === 'auto') {
      const minC = Math.min(countA, countB);
      const maxC = Math.max(countA, countB);
      if (minC === 1 && maxC > 1) {
        // Cross-kind (shape↔algorithm, shape↔mirrored-group): one child is a
        // single outline, the other is many paths. Merge to the dominant outline
        // rather than averaging a dense polyline into mush.
        resolved = 'merge-longest';
      } else {
        resolved = Math.abs(countA - countB) > 3 ? 'merge-centroid' : 'index-match';
      }
    }

    if (resolved === 'merge-centroid') {
      return {
        listA: [averagePaths(childA, resampleCount, closed)],
        listB: [averagePaths(childB, resampleCount, closed)],
      };
    }
    if (resolved === 'merge-longest') {
      return {
        listA: [longestPath(childA)],
        listB: [longestPath(childB)],
      };
    }
    // index-match: pad shorter list by repeating its LAST path.
    const K = Math.max(countA, countB);
    const listA = [];
    const listB = [];
    for (let i = 0; i < K; i += 1) {
      listA.push(childA[Math.min(i, countA - 1)]);
      listB.push(childB[Math.min(i, countB - 1)]);
    }
    return { listA, listB };
  };

  // ---------------------------------------------------------------------------
  // Meta for blend rings
  // ---------------------------------------------------------------------------
  const buildRingMeta = (srcMeta, closureMode, keepAnchors = false) => {
    const meta = srcMeta ? clone(srcMeta) : {};
    // In the corner-matched bezier path the caller supplies fresh per-ring
    // anchors, so we keep an .anchors slot (overwritten downstream). In the
    // legacy dense path anchors/shape are stripped and a circle is downgraded
    // to a polygon (the ring is a plain polyline, no longer a true circle).
    if (!keepAnchors) {
      if (meta.anchors) delete meta.anchors;
      if (meta.shape) delete meta.shape;
      if (meta.kind === 'circle') meta.kind = 'polygon';
    } else {
      if (meta.shape) delete meta.shape;
      if (meta.kind === 'circle') {
        // A corner-matched ring is an anchored shape, not a circle; drop the
        // stale circle primitive fields so no downstream reader keying off
        // meta.r/cx/cy (without checking kind) picks up dead geometry.
        meta.kind = 'shape';
        delete meta.cx; delete meta.cy; delete meta.r;
        delete meta.rx; delete meta.ry; delete meta.rotation;
      }
    }
    if (closureMode === 'force-closed') meta.closed = true;
    else if (closureMode === 'force-open') meta.closed = false;
    return meta;
  };

  // ---------------------------------------------------------------------------
  // Fill interpolation
  //
  // A paint-bucket fill record (src/core/paint-bucket-ops.js buildFillRecord)
  // carries a `region` polygon + ~40 pattern params. To morph fill we synthesize
  // an interpolated record per intermediate ring and re-fill the ring's own
  // outline via PaintBucketOps.generatePathsForFillRecord. Same fillType →
  // numeric params lerp; different fillType (or seeds) → threshold-switch at the
  // visual midpoint (no meaningful param bridge across types/seeds).
  // ---------------------------------------------------------------------------
  // Keys that are set explicitly (not interpolated) on the synthesized record.
  const FILL_SKIP_KEYS = new Set(['id', 'region', 'innerRegion', 'loopId', 'isDocBounds', 'createdAt']);
  // Numeric keys whose interpolation is meaningless — threshold instead.
  const FILL_THRESHOLD_NUM = new Set(['truchetSeed', 'mazeSeed']);
  // Numeric keys that must stay integers after interpolation.
  const FILL_INT_KEYS = new Set(['lineCount', 'axes', 'truchetRotations', 'weaveOver', 'weaveUnder', 'radialSkip']);

  const lerpFillRecord = (a, b, t) => {
    const out = {};
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    keys.forEach((k) => {
      if (FILL_SKIP_KEYS.has(k)) return;
      const av = a ? a[k] : undefined;
      const bv = b ? b[k] : undefined;
      if (typeof av === 'number' && typeof bv === 'number' && !FILL_THRESHOLD_NUM.has(k)) {
        let v = av + (bv - av) * t;
        if (FILL_INT_KEYS.has(k)) v = Math.round(v);
        out[k] = v;
      } else {
        out[k] = t < 0.5 ? av : bv;
      }
    });
    return out;
  };

  /**
   * Regenerate interpolated fill geometry for a single blended ring. Pairs the
   * two children's fill records by index, synthesizes an interpolated record for
   * each pair, sets its region to the ring outline, and generates clean fill
   * polylines. Returns [] when no fills are present or the ring is degenerate.
   * Each returned path is stamped meta.penId (the ring's threshold pen) and
   * meta.morphFill = true (morph-owned, not an editable bucket fill).
   */
  const regenerateRingFill = (ring, fillsA, fillsB, et, ringPenId) => {
    const gen = window.Vectura?.PaintBucketOps?.generatePathsForFillRecord;
    if (typeof gen !== 'function') return [];
    if (!Array.isArray(ring) || ring.length < 3) return [];
    const fa = Array.isArray(fillsA) ? fillsA : [];
    const fb = Array.isArray(fillsB) ? fillsB : [];
    const pairCount = Math.max(fa.length, fb.length);
    if (pairCount === 0) return [];
    const region = ring.map((p) => ({ x: p.x, y: p.y }));
    const out = [];
    for (let i = 0; i < pairCount; i += 1) {
      const recA = fa[i] || null;
      const recB = fb[i] || null;
      let rec = null;
      if (recA && recB) {
        rec = recA.fillType === recB.fillType ? lerpFillRecord(recA, recB, et) : clone(et < 0.5 ? recA : recB);
      } else if (recA) {
        if (et < 0.5) rec = clone(recA); else continue; // single-sided fill fades out past midpoint
      } else if (recB) {
        if (et >= 0.5) rec = clone(recB); else continue; // single-sided fill fades in past midpoint
      }
      if (!rec || rec.fillType === 'none') continue;
      rec.region = region;
      rec.innerRegion = null;
      let paths;
      try {
        paths = gen(rec) || [];
      } catch (err) {
        paths = [];
      }
      paths.forEach((p) => {
        if (!Array.isArray(p) || p.length < 2) return;
        const meta = p.meta ? { ...p.meta } : {};
        if (ringPenId) meta.penId = ringPenId;
        if (meta.paintBucketFillId) delete meta.paintBucketFillId;
        meta.morphFill = true;
        p.meta = meta;
        out.push(p);
      });
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // THE CORE
  // ---------------------------------------------------------------------------
  // Normalize a child entry into a payload { outline, fillPaths, fills, penId }.
  // Back-compat: a plain path[] (old callers / unit tests) becomes an outline
  // with no fills. The new engine caller passes the payload object directly.
  const normalizeChild = (c) => {
    if (Array.isArray(c)) {
      return { outline: c, fillPaths: [], fills: [], penId: (c[0] && c[0].meta && c[0].meta.penId) || null };
    }
    if (c && typeof c === 'object') {
      return {
        outline: Array.isArray(c.outline) ? c.outline : [],
        fillPaths: Array.isArray(c.fillPaths) ? c.fillPaths : [],
        fills: Array.isArray(c.fills) ? c.fills : [],
        penId: c.penId || null,
      };
    }
    return { outline: [], fillPaths: [], fills: [], penId: null };
  };

  const applyMorphModifierToPaths = (pathsPerChild, modifier, bounds) => {
    const children = (Array.isArray(pathsPerChild) ? pathsPerChild : []).map(normalizeChild);

    const passthrough = () => {
      const out = [];
      children.forEach((child) => {
        child.outline.forEach((p) => out.push(clonePath(p)));
        child.fillPaths.forEach((p) => out.push(clonePath(p)));
      });
      return out;
    };

    if (!modifier || modifier.enabled === false || children.length < 2) {
      return passthrough();
    }

    const params = resolveMorphParams(modifier);

    // Drop children with no outline geometry from the chain.
    const activeChildren = children.filter((c) => c.outline.length > 0);
    if (activeChildren.length < 2) {
      const out = [];
      activeChildren.forEach((child) => {
        child.outline.forEach((p) => out.push(clonePath(p)));
        child.fillPaths.forEach((p) => out.push(clonePath(p)));
      });
      return out;
    }

    // Build pairs of child indices.
    const pairs = [];
    for (let i = 0; i < activeChildren.length - 1; i += 1) pairs.push([i, i + 1]);
    if (params.sequenceMode === 'cyclic' && activeChildren.length > 2) {
      pairs.push([activeChildren.length - 1, 0]);
    } else if (params.sequenceMode === 'cyclic' && activeChildren.length === 2) {
      pairs.push([1, 0]);
    }

    // Fill regeneration is the expensive part: gate it and cap total rings so a
    // heavy morph doesn't explode plot/compute time. Beyond the cap, fill only
    // the midpoint ring of each pair so the transition still reads.
    const doFill = params.fillMode !== 'off';
    const fillCap = params.fillRegenLimit > 0 ? params.fillRegenLimit : 32;
    const fillEveryRing = doFill && pairs.length * params.steps <= fillCap;
    const midStep = Math.round((params.steps + 1) / 2);

    // Compute blend rings (outline + interpolated fill, interleaved) per pair.
    const blendsForPair = pairs.map(([ai, bi]) => {
      const childA = activeChildren[ai];
      const childB = activeChildren[bi];
      // Closure is per-pair: forced modes win; 'auto' treats the pair as closed
      // only when BOTH children are entirely closed loops. Closed pairs use
      // rotational correspondence so a hexagon's corners map to the circle's
      // matching angles and round gradually instead of twisting / collapsing.
      let pairClosed;
      if (params.closureMode === 'force-closed') pairClosed = true;
      else if (params.closureMode === 'force-open') pairClosed = false;
      else pairClosed = childA.outline.length > 0 && childB.outline.length > 0
        && childA.outline.every(isPathClosed) && childB.outline.every(isPathClosed);
      const isOpen = !pairClosed;
      const { listA, listB } = buildRepresentatives(
        childA.outline,
        childB.outline,
        params.multiPathStrategy,
        params.resampleCount,
        pairClosed
      );
      const emitted = [];
      for (let k = 0; k < listA.length; k += 1) {
        // --- Corner-matched bezier morph (default, closed pairs) -------------
        // Represent both sources with K ≈ the busier source's structural corner
        // count, interpolate anchor positions AND bezier handle roundness, and
        // emit anchored rings whose flattened polyline carries only a handful of
        // smoothly-curved vertices (per bezier segment) instead of 128 straight
        // ones. resampleCount is still honored as the per-segment flatten cap and
        // as the fallback density; cornerMatch can be disabled to force the dense
        // legacy path.
        if (params.cornerMatch && pairClosed) {
          const cornersA = cornerCountOf(listA[k]);
          const cornersB = cornerCountOf(listB[k]);
          // Anchor count: at least the busier source's corners (min 3 for a
          // closed loop), capped so complex sources stay bounded. A circle
          // contributes 0 corners, so circle↔hexagon → 6 anchors.
          let K = Math.max(cornersA, cornersB, 3);
          K = Math.min(K, params.cornerMatchMax, params.resampleCount);
          const samplesA = buildCornerSamples(listA[k], K, true);
          let samplesB = buildCornerSamples(listB[k], K, true);
          const KA = samplesA.length;
          const KB = samplesB.length;
          if (KA >= 3 && KB >= 3 && KA === KB) {
            // Rotational correspondence on anchor positions.
            const Apos = samplesA.map((s) => ({ x: s.x, y: s.y }));
            const Bpos = samplesB.map((s) => ({ x: s.x, y: s.y }));
            const r = correspondenceAlign(Apos, Bpos, params.correspondenceMode);
            let sB = rotateSamples(samplesB, r);
            // Winding check: reverse B samples if it lowers correspondence cost.
            if (params.windingCheck) {
              const cost = (cand) => {
                let s = 0;
                for (let v = 0; v < KA; v += 1) {
                  const dx = samplesA[v].x - cand[v].x;
                  const dy = samplesA[v].y - cand[v].y;
                  s += dx * dx + dy * dy;
                }
                return s;
              };
              const rev = reverseSamples(sB);
              if (cost(rev) < cost(sB)) sB = rev;
            }
            const ringMetaC = buildRingMeta(
              (listA[k] && listA[k].meta) || null,
              params.closureMode,
              true
            );
            if (params.closureMode === 'auto') ringMetaC.closed = true;
            else if (params.closureMode === 'force-open') ringMetaC.closed = false;
            else ringMetaC.closed = true;
            for (let i = 1; i <= params.steps; i += 1) {
              const tRaw = i / (params.steps + 1);
              const et = applyEasing(params.easing, tRaw);
              const ringPenId = et < 0.5 ? childA.penId : childB.penId;
              const built = blendCornerRing(samplesA, sB, et, ringMetaC.closed);
              let ring = built.points;
              if (params.smoothing > 0) ring = smoothRing(ring, params.smoothing, ringMetaC.closed);
              // Close the flattened ring (first===last) like closed sources do.
              if (ringMetaC.closed && ring.length > 1) {
                const f = ring[0];
                const l = ring[ring.length - 1];
                if (Math.hypot(f.x - l.x, f.y - l.y) > 1e-9) ring.push({ x: f.x, y: f.y });
              }
              const meta = clone(ringMetaC);
              meta.anchors = built.anchors.map((a) => ({
                x: a.x,
                y: a.y,
                in: a.in ? { x: a.in.x, y: a.in.y } : null,
                out: a.out ? { x: a.out.x, y: a.out.y } : null,
              }));
              if (ringPenId) meta.penId = ringPenId;
              ring.meta = meta;
              emitted.push(ring);
              if (doFill && (fillEveryRing || i === midStep)) {
                // Fills consume the ring as a region POLYGON — pass the flattened
                // points (the ring array already is the bezier polyline), so an
                // anchored ring still fills correctly.
                const fillPaths = regenerateRingFill(ring, childA.fills, childB.fills, et, ringPenId);
                fillPaths.forEach((p) => emitted.push(p));
              }
            }
            continue;
          }
          // else: degenerate sample counts → fall through to dense legacy path.
        }

        // --- Dense arc-length morph (legacy / open paths / disabled) ----------
        const Arep = resamplePath(listA[k], params.resampleCount, pairClosed, params.resampleMode);
        let Brep = resamplePath(listB[k], params.resampleCount, pairClosed, params.resampleMode);
        const N = Arep.length;
        if (N === 0 || Brep.length === 0) continue;

        // Correspondence alignment.
        let Brot;
        if (isOpen) {
          // Open paths: skip rotation; optionally reverse by endpoint distance.
          const fwdStart = Math.hypot(Arep[0].x - Brep[0].x, Arep[0].y - Brep[0].y);
          const fwdEnd = Math.hypot(
            Arep[N - 1].x - Brep[N - 1].x,
            Arep[N - 1].y - Brep[N - 1].y
          );
          const revStart = Math.hypot(Arep[0].x - Brep[N - 1].x, Arep[0].y - Brep[N - 1].y);
          const revEnd = Math.hypot(Arep[N - 1].x - Brep[0].x, Arep[N - 1].y - Brep[0].y);
          if (revStart + revEnd < fwdStart + fwdEnd) {
            Brot = Brep.slice().reverse();
          } else {
            Brot = Brep.slice();
          }
        } else {
          const r = correspondenceAlign(Arep, Brep, params.correspondenceMode);
          Brot = Brep.map((_, i) => Brep[(i + r) % N]);
        }

        // Winding check: reverse Brot if it lowers the correspondence cost.
        if (params.windingCheck) {
          const cost = (cand) => {
            let s = 0;
            for (let v = 0; v < N; v += 1) {
              const dx = Arep[v].x - cand[v].x;
              const dy = Arep[v].y - cand[v].y;
              s += dx * dx + dy * dy;
            }
            return s;
          };
          const rev = Brot.slice().reverse();
          if (cost(rev) < cost(Brot)) Brot = rev;
        }

        const ringMeta = buildRingMeta(Arep.meta, params.closureMode);
        if (params.closureMode === 'auto') ringMeta.closed = pairClosed;
        for (let i = 1; i <= params.steps; i += 1) {
          const tRaw = i / (params.steps + 1);
          const et = applyEasing(params.easing, tRaw);
          // Pen + fill switch together at the visual midpoint (pens are discrete;
          // there is no halfway pen — see plan: appearance out of scope).
          const ringPenId = et < 0.5 ? childA.penId : childB.penId;
          let ring = blendPaths(Arep, Brot, tRaw, params.easing);
          if (params.smoothing > 0) ring = smoothRing(ring, params.smoothing, pairClosed);
          // Rule: if both source shapes are closed, every in-between ring is
          // closed. resamplePath(closed) returns N points around the loop WITHOUT
          // the wrap vertex, so append a copy of the first point — matching how
          // closed source paths store first===last — so the renderer and SVG
          // export draw a closed shape (meta.closed alone isn't honored here).
          if (pairClosed && ring.length > 1) {
            const f = ring[0];
            const l = ring[ring.length - 1];
            if (Math.hypot(f.x - l.x, f.y - l.y) > 1e-9) ring.push({ x: f.x, y: f.y });
          }
          const meta = clone(ringMeta);
          if (ringPenId) meta.penId = ringPenId;
          ring.meta = meta;
          emitted.push(ring);
          if (doFill && (fillEveryRing || i === midStep)) {
            const fillPaths = regenerateRingFill(ring, childA.fills, childB.fills, et, ringPenId);
            fillPaths.forEach((p) => emitted.push(p));
          }
        }
      }
      return emitted;
    });

    // Assemble output.
    const output = [];
    const emitSources = params.emitSources;
    const cyclic = params.sequenceMode === 'cyclic';

    const emitChildSources = (child) => {
      child.outline.forEach((p) => output.push(clonePath(p)));
      child.fillPaths.forEach((p) => output.push(clonePath(p)));
    };

    if (emitSources) {
      // child0 sources, pair0 blends, child1 sources, pair1 blends, ...
      // For sequential chains each child's sources appear once; B is the
      // shared anchor and is emitted as the "next child" once, not duplicated.
      const linearPairCount = cyclic ? blendsForPair.length - 1 : blendsForPair.length;
      for (let i = 0; i < activeChildren.length; i += 1) {
        emitChildSources(activeChildren[i]);
        if (i < linearPairCount && i < blendsForPair.length) {
          blendsForPair[i].forEach((p) => output.push(p));
        }
      }
      // Cyclic wrap pair: append its blends at the end (no extra source).
      if (cyclic && blendsForPair.length > 0) {
        blendsForPair[blendsForPair.length - 1].forEach((p) => output.push(p));
      }
    } else {
      blendsForPair.forEach((paths) => paths.forEach((p) => output.push(p)));
    }

    return output;
  };

  // ---------------------------------------------------------------------------
  // Multi-child dispatch
  // ---------------------------------------------------------------------------
  const applyModifierToMultiChildPaths = (pathsPerChild, modifier, bounds) => {
    if (modifier && modifier.type === 'morph') {
      return applyMorphModifierToPaths(pathsPerChild, modifier, bounds);
    }
    // Fallback: map each child through the (original) single-child modifier.
    const out = [];
    (pathsPerChild || []).forEach((child) => {
      const result = _origApplyModifierToPaths(child, modifier, bounds);
      result.forEach((p) => out.push(p));
    });
    return out;
  };

  // ---------------------------------------------------------------------------
  // Wrap applyModifierToPaths for single-arg morph dispatch
  // ---------------------------------------------------------------------------
  const _origApplyModifierToPaths = Modifiers.applyModifierToPaths;

  Modifiers.applyModifierToPaths = (paths, modifier, bounds) => {
    if (modifier && modifier.type === 'morph') {
      return applyMorphModifierToPaths((paths || []).map((p) => [p]), modifier, bounds);
    }
    return _origApplyModifierToPaths(paths, modifier, bounds);
  };

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------
  Modifiers.resamplePath = resamplePath;
  Modifiers.correspondenceAlign = correspondenceAlign;
  Modifiers.blendPaths = blendPaths;
  Modifiers.applyEasing = applyEasing;
  Modifiers.lerpFillRecord = lerpFillRecord;
  Modifiers.regenerateRingFill = regenerateRingFill;
  Modifiers.applyMorphModifierToPaths = applyMorphModifierToPaths;
  Modifiers.applyModifierToMultiChildPaths = applyModifierToMultiChildPaths;
})();
