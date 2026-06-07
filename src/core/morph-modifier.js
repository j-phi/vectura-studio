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
      const flatten = window.Vectura?.GeometryUtils?.flattenSmoothedPath;
      if (typeof flatten === 'function') {
        const flat = flatten(path, 0.1);
        points = (flat || []).map((pt) => ({ x: pt.x, y: pt.y }));
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
      resampleMode: m.resampleMode === 'uniform-index' ? 'uniform-index' : 'arc-length',
      easing: m.easing || 'linear',
      sequenceMode: m.sequenceMode || 'sequential',
      correspondenceMode: m.correspondenceMode || 'centroid-angle',
      windingCheck: m.windingCheck !== false,
      multiPathStrategy: m.multiPathStrategy || 'auto',
      emitSources: m.emitSources !== false,
      closureMode: m.closureMode || 'auto',
      smoothing: clampFn(Number(m.smoothing) || 0, 0, 1),
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
  const buildRepresentatives = (childA, childB, strategy, resampleCount) => {
    const countA = childA.length;
    const countB = childB.length;

    let resolved = strategy;
    if (strategy === 'auto') {
      resolved = Math.abs(countA - countB) > 3 ? 'merge-centroid' : 'index-match';
    }

    if (resolved === 'merge-centroid') {
      return {
        listA: [averagePaths(childA, resampleCount, false)],
        listB: [averagePaths(childB, resampleCount, false)],
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
  const buildRingMeta = (srcMeta, closureMode) => {
    const meta = srcMeta ? clone(srcMeta) : {};
    if (meta.anchors) delete meta.anchors;
    if (meta.shape) delete meta.shape;
    if (meta.kind === 'circle') meta.kind = 'polygon';
    if (closureMode === 'force-closed') meta.closed = true;
    else if (closureMode === 'force-open') meta.closed = false;
    return meta;
  };

  // ---------------------------------------------------------------------------
  // THE CORE
  // ---------------------------------------------------------------------------
  const applyMorphModifierToPaths = (pathsPerChild, modifier, bounds) => {
    const children = Array.isArray(pathsPerChild) ? pathsPerChild : [];

    const passthrough = () => {
      const out = [];
      children.forEach((child) => {
        (child || []).forEach((p) => out.push(clonePath(p)));
      });
      return out;
    };

    if (!modifier || modifier.enabled === false || children.length < 2) {
      return passthrough();
    }

    const params = resolveMorphParams(modifier);

    // Drop empty children entirely from the chain.
    const activeChildren = children.filter((c) => Array.isArray(c) && c.length > 0);
    if (activeChildren.length < 2) {
      // Passthrough of whatever non-empty children remain (clones).
      const out = [];
      activeChildren.forEach((child) => child.forEach((p) => out.push(clonePath(p))));
      return out;
    }

    const closed = params.closureMode === 'force-closed';
    const isOpen = params.closureMode !== 'force-closed';

    // Build pairs of child indices.
    const pairs = [];
    for (let i = 0; i < activeChildren.length - 1; i += 1) pairs.push([i, i + 1]);
    if (params.sequenceMode === 'cyclic' && activeChildren.length > 2) {
      pairs.push([activeChildren.length - 1, 0]);
    } else if (params.sequenceMode === 'cyclic' && activeChildren.length === 2) {
      pairs.push([1, 0]);
    }

    // Compute blend rings for each sequential/cyclic pair.
    const blendsForPair = pairs.map(([ai, bi]) => {
      const { listA, listB } = buildRepresentatives(
        activeChildren[ai],
        activeChildren[bi],
        params.multiPathStrategy,
        params.resampleCount
      );
      const rings = [];
      for (let k = 0; k < listA.length; k += 1) {
        const Arep = resamplePath(listA[k], params.resampleCount, closed, params.resampleMode);
        let Brep = resamplePath(listB[k], params.resampleCount, closed, params.resampleMode);
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
        for (let i = 1; i <= params.steps; i += 1) {
          const tRaw = i / (params.steps + 1);
          let ring = blendPaths(Arep, Brot, tRaw, params.easing);
          if (params.smoothing > 0) ring = smoothRing(ring, params.smoothing, closed);
          ring.meta = clone(ringMeta);
          rings.push(ring);
        }
      }
      return rings;
    });

    // Assemble output.
    const output = [];
    const emitSources = params.emitSources;
    const cyclic = params.sequenceMode === 'cyclic';

    if (emitSources) {
      // child0 sources, pair0 blends, child1 sources, pair1 blends, ...
      // For sequential chains each child's sources appear once; B is the
      // shared anchor and is emitted as the "next child" once, not duplicated.
      const linearPairCount = cyclic ? blendsForPair.length - 1 : blendsForPair.length;
      for (let i = 0; i < activeChildren.length; i += 1) {
        activeChildren[i].forEach((p) => output.push(clonePath(p)));
        if (i < linearPairCount && i < blendsForPair.length) {
          blendsForPair[i].forEach((ring) => output.push(ring));
        }
      }
      // Cyclic wrap pair: append its blends at the end (no extra source).
      if (cyclic && blendsForPair.length > 0) {
        blendsForPair[blendsForPair.length - 1].forEach((ring) => output.push(ring));
      }
    } else {
      blendsForPair.forEach((rings) => rings.forEach((ring) => output.push(ring)));
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
  Modifiers.applyMorphModifierToPaths = applyMorphModifierToPaths;
  Modifiers.applyModifierToMultiChildPaths = applyModifierToMultiChildPaths;
})();
