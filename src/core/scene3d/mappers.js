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
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
  const DOT_SHAPES = ['dot', 'ring', 'cross', 'plus', 'tick'];

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

  // Legacy jitter fraction (peak-to-peak, as a fraction of the cell step) that
  // stipple used before it was exposed. stippleJitter 0–100 maps to 0–1.75× so
  // the exposed DEFAULT of 40 reproduces this exactly (0.4 × 1.75 = 0.7) — a
  // no-op default that keeps the stipple baseline fixed.
  const LEGACY_JITTER_FRAC = 0.7;
  // Ordered so the default (40) is byte-exact: 40 × 1.75 = 70, / 100 = 0.7 (the
  // same double as the literal LEGACY_JITTER_FRAC), a true no-op default.
  const jitterFracFor = (stippleJitter) => (Number.isFinite(stippleJitter)
    ? clamp(stippleJitter, 0, 100) * 1.75 / 100
    : LEGACY_JITTER_FRAC);

  // A single stipple mark centred at (cx,cy), radius r, rotated by angleDeg.
  // Returns an ARRAY of screen-space polylines (a cross/plus is two strokes) so
  // the caller can push each as its own path. 'dot' is the legacy circle.
  const stippleMark = (shape, cx, cy, r, angleDeg) => {
    const circle = G3().circlePath;
    const rad = (finite(angleDeg, 0) * Math.PI) / 180;
    const ca = Math.cos(rad); const sa = Math.sin(rad);
    // A rotated segment from local (x0,y0) to (x1,y1).
    const seg = (x0, y0, x1, y1) => [
      { x: cx + (x0 * ca - y0 * sa), y: cy + (x0 * sa + y0 * ca) },
      { x: cx + (x1 * ca - y1 * sa), y: cy + (x1 * sa + y1 * ca) },
    ];
    switch (shape) {
      case 'ring': return typeof circle === 'function' ? [circle(cx, cy, Math.max(0.3, r * 1.4), 12, null)] : [];
      case 'cross': return [seg(-r, -r, r, r), seg(-r, r, r, -r)];
      case 'plus': return [seg(-r, 0, r, 0), seg(0, -r, 0, r)];
      case 'tick': return [seg(-r, 0, r, 0)];
      case 'dot':
      default: return typeof circle === 'function' ? [circle(cx, cy, r, 10, null)] : [];
    }
  };

  // opts (all optional): dotShape 'dot'|'ring'|'cross'|'plus'|'tick', dotAngle
  // (deg), stippleJitter (0–100). Absent ⇒ legacy dot / 0.7 jitter (no-op).
  const stipple = (loops, spacing, dotRadius, opts = {}) => {
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
    const shape = DOT_SHAPES.includes(opts.dotShape) ? opts.dotShape : 'dot';
    const dotAngle = finite(opts.dotAngle, 0);
    const jitterFrac = jitterFracFor(opts.stippleJitter);
    const dots = [];
    let gy = 0;
    for (let y = minY + step * 0.5; y <= maxY; y += step, gy++) {
      let gx = 0;
      for (let x = minX + step * 0.5; x <= maxX; x += step, gx++) {
        const jx = (hash2(gx, gy) - 0.5) * step * jitterFrac;
        const jy = (hash2(gx + 9973, gy + 8191) - 0.5) * step * jitterFrac;
        const px = x + jx;
        const py = y + jy;
        let inside = false;
        rings.forEach((ring) => { if (pip({ x: px, y: py }, ring)) inside = !inside; });
        if (!inside) continue;
        // 'dot' at the legacy radius/segments reproduces the old circle exactly.
        if (shape === 'dot') dots.push(circle(px, py, r, 10, null));
        else stippleMark(shape, px, py, r, dotAngle).forEach((m) => { if (m.length) dots.push(m); });
      }
    }
    return dots;
  };

  // ── True spiral (Phase 3) ──────────────────────────────────────────────────
  // A single continuous Archimedean spiral, generated from the region CENTRE and
  // CLIPPED to the region boundary — the plotter-honest answer to "spiral fill".
  // This REPLACES the old stitched-concentric-ring snake (which read as stacked
  // contours, not a spiral): a cube face now fills with one clear spiral, not a
  // set of concentric rings. The recurrence is ported from the spiral algorithm
  // (src/core/algorithms/spiral.js:197–216): theta += dTheta; r += dr;
  // point = centre + (cosθ, sinθ)·r, plus its axisSnap (rectilinear/squared) and
  // angleOffset controls. Eccentricity (auto = region aspect) stretches the
  // spiral so a non-square face fills edge-to-edge. Deterministic (A-17: no RNG).

  const STEPS_PER_REV = 64; // smooth-spiral angular resolution
  const SPIRAL_MAX_STEPS = 24000; // pathological pitch/size guard (cannot hang)

  // Even-odd point-in-region across all (closed) rings.
  const insideComposite = (rings, x, y) => {
    const pip = PB().pointInPolygon;
    if (typeof pip !== 'function') return false;
    const pt = { x, y };
    let inside = false;
    for (let i = 0; i < rings.length; i++) if (pip(pt, rings[i])) inside = !inside;
    return inside;
  };

  // Clip a segment p0→p1 to the composite region (even-odd), returning the inside
  // sub-segments as [[a,b],…]. Mirrors the pattern-algorithm clip machinery.
  const clipSegment = (rings, p0, p1) => {
    const dx = p1.x - p0.x; const dy = p1.y - p0.y;
    const ts = [0, 1];
    for (let g = 0; g < rings.length; g++) {
      const poly = rings[g];
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const a = poly[i]; const b = poly[(i + 1) % n];
        const ex = b.x - a.x; const ey = b.y - a.y;
        const denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-10) continue;
        const t = ((a.x - p0.x) * ey - (a.y - p0.y) * ex) / denom;
        const u = ((a.x - p0.x) * dy - (a.y - p0.y) * dx) / denom;
        if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
      }
    }
    ts.sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i]; const t1 = ts[i + 1];
      if (t1 - t0 < 1e-9) continue;
      const mx = p0.x + ((t0 + t1) / 2) * dx;
      const my = p0.y + ((t0 + t1) / 2) * dy;
      if (insideComposite(rings, mx, my)) {
        out.push([{ x: p0.x + t0 * dx, y: p0.y + t0 * dy }, { x: p0.x + t1 * dx, y: p0.y + t1 * dy }]);
      }
    }
    return out;
  };

  // Clip a polyline to the composite region, returning inside sub-polylines. Keeps
  // consecutive inside sub-segments joined so the central spiral stays ONE run.
  const clipPolyline = (rings, pts) => {
    if (pts.length < 2) return [];
    const result = [];
    let seg = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const clipped = clipSegment(rings, pts[i], pts[i + 1]);
      if (!clipped.length) { if (seg && seg.length >= 2) result.push(seg); seg = null; continue; }
      for (let c = 0; c < clipped.length; c++) {
        const a = clipped[c][0]; const b = clipped[c][1];
        if (!seg) { seg = [a, b]; continue; }
        const last = seg[seg.length - 1];
        if (Math.hypot(a.x - last.x, a.y - last.y) > 1e-4) {
          if (seg.length >= 2) result.push(seg);
          seg = [a, b];
        } else {
          seg.push(b);
        }
      }
    }
    if (seg && seg.length >= 2) result.push(seg);
    return result;
  };

  // trueSpiral(loops, opts) → array of screen-space polylines (the clipped
  // spiral, one continuous central run + boundary arcs). opts:
  //   pitch        mm between successive loops (falls back to opts.spacing)
  //   center       'centroid' (default) | 'bboxCenter'
  //   offset       start-angle offset in DEGREES (default 0)
  //   axisSnap     bool — a squared/rectilinear spiral (axis-aligned segments)
  //   eccentricity 0.3–3 x/y stretch; omitted ⇒ auto-fit the region aspect
  const trueSpiral = (loops, opts = {}) => {
    const rings0 = (loops || []).map(cleanRing).filter((r) => r.length >= 3);
    if (!rings0.length) return [];
    const rings = rings0.map(closeRing); // pointInPolygon needs the closing vertex
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    let cx = 0; let cy = 0; let cN = 0;
    rings0.forEach((r) => r.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      cx += p.x; cy += p.y; cN += 1;
    }));
    if (!(maxX > minX) || !(maxY > minY) || !cN) return [];
    const center = opts.center === 'bboxCenter'
      ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
      : { x: cx / cN, y: cy / cN };
    const bw = Math.max(1e-6, maxX - minX);
    const bh = Math.max(1e-6, maxY - minY);
    // Eccentricity: explicit value, else auto-fit the region's aspect ratio so a
    // wide/tall face fills edge-to-edge instead of an inscribed circle.
    const ecc = Number.isFinite(opts.eccentricity)
      ? clamp(opts.eccentricity, 0.3, 3)
      : clamp(bw / bh, 0.3, 3);
    const sx = Math.sqrt(ecc);
    const sy = 1 / Math.sqrt(ecc);
    // Largest UN-stretched radius needed to reach every region vertex.
    let rMax = 0;
    rings0.forEach((r) => r.forEach((p) => {
      const rr = Math.hypot((p.x - center.x) / sx, (p.y - center.y) / sy);
      if (rr > rMax) rMax = rr;
    }));
    if (!(rMax > 0)) return [];
    // Floor at 0.2mm (below a typical 0.3mm pen) so the Density-100 full-overlap
    // pitch reaches the paper; SPIRAL_MAX_STEPS still guards the sample count.
    const pitch = clamp(finite(opts.pitch, finite(opts.spacing, 3)), 0.2, 40);
    const axisSnap = Boolean(opts.axisSnap);
    // axisSnap: one straight segment per quadrant (a squared spiral). Offsetting
    // the start by 45° makes those segments axis-aligned (horizontal/vertical)
    // for a rectilinear read on cubes.
    const baseOffset = (finite(opts.offset, 0) * Math.PI) / 180 + (axisSnap ? Math.PI / 4 : 0);
    const dTheta = axisSnap ? Math.PI / 2 : (Math.PI * 2) / STEPS_PER_REV;
    const dr = (pitch * dTheta) / (Math.PI * 2); // Archimedean: +pitch per full turn
    // Sweep a bit past rMax so the outermost loop fully covers the corners.
    const rEnd = rMax + pitch;
    const totalSteps = Math.min(SPIRAL_MAX_STEPS, Math.max(4, Math.ceil(rEnd / Math.max(1e-6, dr))));
    const raw = [];
    let theta = baseOffset;
    let r = 0;
    for (let i = 0; i <= totalSteps; i++) {
      raw.push({ x: center.x + Math.cos(theta) * r * sx, y: center.y + Math.sin(theta) * r * sy });
      theta += dTheta;
      r += dr;
    }
    return clipPolyline(rings, raw);
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
      // ONE continuous Archimedean spiral clipped to the region (Phase 3) — not
      // the old stitched concentric rings. spacing drives the default pitch; the
      // caller may pass explicit pitch/center/offset/axisSnap/eccentricity.
      return trueSpiral(loops, {
        pitch: finite(opts.pitch, spacing),
        spacing,
        center: opts.center,
        offset: opts.offset,
        axisSnap: opts.axisSnap,
        eccentricity: opts.eccentricity,
      });
    }
    if (mapper === 'stipple') {
      return stipple(loops, spacing, finite(opts.dotRadius, Math.max(0.35, spacing * 0.18)), opts);
    }
    return [];
  };

  const api = { regionFill, trueSpiral, insetRings, insetPasses, stitchSpiral, stipple, stippleMark, cleanRing, closeRing };
  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Mappers: api });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
