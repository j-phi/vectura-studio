/**
 * Scene3D.Mappers — surface-fill mappers beyond hatch/crosshatch.
 *
 * Each function takes an array of CLOSED screen-space loops (a face polygon, or
 * the linked silhouette boundary of a curved region) plus a target `spacing`
 * (document mm, already tone-modulated by the caller) and returns SCREEN-space
 * polylines. The scene3d algorithm maps those back onto the surface plane /
 * assigns depth, HLR-clips them, and emits them as `sceneFill` paths — so these
 * generators stay purely 2D and deterministic (A-17: no RNG).
 *
 *   contour — concentric inset rings of the region (a topographic look).
 *   spiral  — the same rings stitched into one continuous inward snake per loop
 *             (plotter-efficient: one pen path instead of many closed rings).
 *   stipple — deterministic jittered dot lattice, density from `spacing`; each
 *             dot is a small closed circle. Denser tone bands ⇒ more dots.
 */
(() => {
  const scope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (scope.Vectura = scope.Vectura || {});

  const G3 = () => Vectura.Geometry3D || {};
  const GU = () => Vectura.GeometryUtils || {};
  const PB = () => Vectura.PathBoolean || {};

  const finite = (n, d) => (Number.isFinite(n) ? n : d);

  // Drop non-finite points, consecutive coincidences, and a closing duplicate.
  const cleanRing = (loop) => {
    const pts = [];
    (loop || []).forEach((p) => {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.y - p.y) < 1e-9) return;
      pts.push({ x: p.x, y: p.y });
    });
    if (pts.length >= 2) {
      const f = pts[0];
      const l = pts[pts.length - 1];
      if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) pts.pop();
    }
    return pts;
  };
  const closeRing = (ring) => (ring.length ? ring.concat([{ x: ring[0].x, y: ring[0].y }]) : ring);

  // Progressive inward offset of one ring by `spacing`, outermost first. Stops
  // when the ring collapses or stops shrinking. Fallback for a single convex-ish
  // loop when the boolean multi-polygon offset is unavailable (see insetPasses).
  const insetRings = (loop, spacing, includeOuter) => {
    const off = GU().miterOffsetClosedRing;
    const rings = [];
    let ring = cleanRing(loop);
    if (ring.length < 3) return rings;
    if (includeOuter) rings.push(ring);
    if (typeof off !== 'function') return rings;
    const step = Math.max(0.3, spacing);
    let guard = 0;
    let prevArea = ringArea(ring);
    while (guard++ < 500) {
      const next = cleanRing(off(ring, -step));
      if (next.length < 3) break;
      const area = ringArea(next);
      if (!(area > 1e-3) || area >= prevArea - 1e-6) break; // collapsed / not shrinking
      rings.push(next);
      ring = next;
      prevArea = area;
    }
    return rings;
  };

  // Concentric offset PASSES of a whole region (all loops together, holes and
  // concavity respected) via the boolean multi-polygon inset. passes[0] is the
  // region boundary itself, passes[k] the k-th inward offset; each pass is an
  // array of closed {x,y} rings. Falls back to per-loop miter offset (treats each
  // loop as a separate solid — no hole carving) when the boolean offset is absent.
  const insetPasses = (loops, spacing) => {
    const rings0 = (loops || []).map(cleanRing).filter((r) => r.length >= 3);
    if (!rings0.length) return [];
    const inset = GU().insetMultiPolygon;
    const step = Math.max(0.5, spacing);
    if (typeof inset !== 'function') {
      // Fallback: independent per-loop insets (a hole loop fills its own hole —
      // acceptable degradation only when FillBoolean is unavailable).
      const per = loops.map((l) => insetRings(l, step, true));
      const depth = Math.max(...per.map((r) => r.length), 0);
      const passes = [];
      for (let k = 0; k < depth; k++) passes.push(per.map((r) => r[k]).filter(Boolean));
      return passes;
    }
    const passes = [rings0];
    let mp = [rings0]; // one polygon, every loop a ring → even-odd carves holes
    let guard = 0;
    while (guard++ < 300) {
      let out;
      try { out = inset(mp, step); } catch (_e) { break; }
      if (!Array.isArray(out) || !out.length) break;
      // out: multiPolygon [ polygon[ ring[ [x,y] ] ] ]. Flatten to {x,y} rings.
      const level = [];
      out.forEach((poly) => (poly || []).forEach((ring) => {
        const pts = (ring || []).map((p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : p))
          .filter((p) => p && Number.isFinite(p.x));
        if (pts.length >= 3) level.push(pts);
      }));
      if (!level.length) break;
      passes.push(level);
      mp = out;
    }
    return passes;
  };

  const ringArea = (ring) => {
    let a = 0;
    for (let i = 0, n = ring.length; i < n; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  };

  // Walk each ring fully (closed), jumping to the next inner ring at its nearest
  // vertex, so the whole nest is one continuous polyline.
  const stitchSpiral = (ringList) => {
    const out = [];
    let prevEnd = null;
    ringList.forEach((raw) => {
      const r = cleanRing(raw);
      if (r.length < 3) return;
      let start = 0;
      if (prevEnd) {
        let best = Infinity;
        for (let i = 0; i < r.length; i++) {
          const d = (r[i].x - prevEnd.x) ** 2 + (r[i].y - prevEnd.y) ** 2;
          if (d < best) { best = d; start = i; }
        }
      }
      for (let i = 0; i <= r.length; i++) out.push(r[(start + i) % r.length]);
      prevEnd = out[out.length - 1];
    });
    return out;
  };

  // Deterministic 2D integer hash → [0,1) jitter, so stipple is stable across
  // regenerations (no RNG per A-17) yet not visibly gridded.
  const hash2 = (a, b) => {
    let h = ((a | 0) * 73856093) ^ ((b | 0) * 19349663);
    h ^= h >>> 13;
    h = Math.imul(h, 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  const STIPPLE_MAX_CELLS = 12000;

  const stipple = (loops, spacing, dotRadius) => {
    // Close each ring: PathBoolean.pointInPolygon needs the closing vertex
    // (rejects rings with < 4 points), so a 3-vertex triangular face would test
    // every point as "outside" and emit no dots without this.
    const rings = (loops || []).map(cleanRing).filter((r) => r.length >= 3).map(closeRing);
    if (!rings.length) return [];
    const pip = PB().pointInPolygon;
    const circle = G3().circlePath;
    if (typeof pip !== 'function' || typeof circle !== 'function') return [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    rings.forEach((r) => r.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }));
    if (!(maxX > minX) || !(maxY > minY)) return [];
    // Coarsen the lattice UNIFORMLY when a large/dense region would exceed the
    // cell budget, so the whole region thins rather than a raster-order cut
    // leaving the lower part blank.
    let step = Math.max(1, spacing);
    const cells = ((maxX - minX) / step) * ((maxY - minY) / step);
    if (cells > STIPPLE_MAX_CELLS) step *= Math.sqrt(cells / STIPPLE_MAX_CELLS);
    const r = Math.max(0.25, dotRadius);
    const dots = [];
    let gy = 0;
    for (let y = minY + step * 0.5; y <= maxY; y += step, gy++) {
      let gx = 0;
      for (let x = minX + step * 0.5; x <= maxX; x += step, gx++) {
        const jx = (hash2(gx, gy) - 0.5) * step * 0.7;
        const jy = (hash2(gx + 9973, gy + 8191) - 0.5) * step * 0.7;
        const px = x + jx;
        const py = y + jy;
        let inside = false;
        rings.forEach((ring) => { if (pip({ x: px, y: py }, ring)) inside = !inside; });
        if (!inside) continue;
        dots.push(circle(px, py, r, 10, null));
      }
    }
    return dots;
  };

  // mapper: 'contour' | 'spiral' | 'stipple'. loops: closed screen polygons
  // (outer boundary + any holes). opts: { spacing, dotRadius }. Returns an array
  // of screen-space polylines. contour/spiral offset the WHOLE region together
  // (holes carved, concavity handled) via the boolean multi-polygon inset.
  const regionFill = (mapper, loops, opts = {}) => {
    const spacing = Math.max(0.5, finite(opts.spacing, 3));
    if (!Array.isArray(loops) || !loops.length) return [];
    if (mapper === 'contour') {
      return insetPasses(loops, spacing).flat().map(closeRing).filter((r) => r.length >= 4);
    }
    if (mapper === 'spiral') {
      const passes = insetPasses(loops, spacing);
      if (!passes.length) return [];
      const stitch = GU().stitchConcentricRings;
      if (typeof stitch === 'function') {
        const snakes = stitch(passes, Math.max(1, spacing * 1.5)) || [];
        const ok = snakes.filter((s) => Array.isArray(s) && s.length >= 2);
        if (ok.length) return ok;
      }
      // Fallback: stitch each loop's own nested rings into a snake.
      return loops.map((l) => stitchSpiral(insetRings(l, spacing, true))).filter((s) => s && s.length >= 2);
    }
    if (mapper === 'stipple') {
      return stipple(loops, spacing, finite(opts.dotRadius, Math.max(0.35, spacing * 0.18)));
    }
    return [];
  };

  const api = { regionFill, insetRings, stitchSpiral, stipple, cleanRing, closeRing };
  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Mappers: api });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
