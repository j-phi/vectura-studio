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
