/**
 * Scene3D.Shadows — Phase 2 cast shadows on the ground plane (spec §3.2, §7
 * group E). Pure/deterministic; degrades (never throws) on pathological input.
 *
 * A shadow is the sun's silhouette of a caster on the y = 0 receiver. For each
 * world vertex P of a caster face we project along the travel direction d
 * (d.y < 0) to the ground:  G = P − (P.y / d.y)·d  (G.y = 0). The ground point
 * is camera-projected exactly like the mesh, so the shadow lands under the
 * object in screen space. Casters are grouped into shadow style-equivalence
 * classes; FillBoolean.union merges overlapping footprints within a class (no
 * internal seam); a higher-precedence class subtracts from a lower one; the
 * casters' own screen silhouettes are subtracted (caster-bound). The resulting
 * regions are hatched at the ground support-plane depth and routed through the
 * HLR clipper as 'ground' fills, so object faces occlude them for free (an
 * object standing in its own shadow drops the runs beneath it).
 *
 * Robustness (CONTRACT L4 + spec guardrails):
 *   - grazing light (elevation ≲ 2°) is skipped — projections blow up there;
 *   - every boolean routes through FillBoolean (safeOp → [] on the AUD-05
 *     "Unable to complete output ring" throw), so a self-intersecting caster
 *     degrades to an empty region rather than crashing generate();
 *   - draft preview (bounds.fastPreview) SKIPS all booleans and emits flat
 *     per-caster ground-projection tints — cheap and crash-proof under drag.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const finite = G3.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const rotatePoint = G3.rotatePoint;
  const projectPoint = G3.projectPoint;
  const pathWithMeta = G3.pathWithMeta || ((pts) => pts);
  // Shared stroke treatment (Phase 1.1): a shadow inherits its caster's line
  // type / wobble, stamped at the shadow emit chokepoint below.
  const strokeTreatment = G3.strokeTreatment || (() => G3.NO_STROKE_TREATMENT);
  const applyStrokeTreatment = G3.applyStrokeTreatment || ((pts) => pts);
  const overstrokeCopy = G3.overstrokeCopy || ((pts) => pts);
  const NO_STROKE_TREATMENT = G3.NO_STROKE_TREATMENT || { active: false, dash: null, wobble: 0, overstroke: false };

  // Skip shadows below this elevation (|d.y| < sin) — grazing light stretches
  // the ground projection toward infinity and reads as garbage on a plotter.
  const MIN_ELEVATION_DEG = 2;
  const MIN_ABS_DY = Math.sin(MIN_ELEVATION_DEG * Math.PI / 180);
  const MIN_RUN_MM = 0.6;
  // Legacy fall-backs (Phase 5): a caller that supplies NO shadow bag renders
  // the pre-Phase-5 look — 45° hatch at coverage 0.5, solid, single flat hull.
  const SHADOW_ANGLE = 45;
  const SHADOW_COVERAGE = 0.5; // shadow tone: moderately dense hatch
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  const runLength = (pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  };

  const isFinitePt = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y);

  // ── I26 inverse / subtractive shadow helpers ──────────────────────────────
  // Even-odd point test against a polygon-with-holes (rings = [outer, hole…]).
  // Combining every ring under one parity means a point in a torus HOLE reads as
  // OUTSIDE — so inverse thinning never touches the ground fill under the hole
  // (the annular footprint keeps its centre intact, mirroring the additive fill).
  const pointInRingsEvenOdd = (rings, x, y) => {
    let inside = false;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      if (!Array.isArray(ring) || ring.length < 3) continue;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]; const b = ring[j];
        if (!isFinitePt(a) || !isFinitePt(b)) continue;
        if (((a.y > y) !== (b.y > y)) &&
            (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-12) + a.x)) {
          inside = !inside;
        }
      }
    }
    return inside;
  };

  // A ground layer's OWN surface-fill line (the pattern inverse mode thins). NOT
  // a cast-shadow hatch (regionClass 'castShadow') — inverse emits none of those.
  const isGroundOwnFill = (path) => {
    const m = path && path.meta;
    if (!m || m.kind !== 'sceneFill') return false;
    const t = m.sceneTarget;
    return !!t && t.objectId === 'ground' && t.regionClass !== 'castShadow';
  };

  // Analytic clip of a polyline to the pieces OUTSIDE the even-odd footprint
  // rings — the ground fill lines span the whole plate, so a midpoint test can't
  // see a line that merely CROSSES a small offset footprint; we must erase the
  // in-footprint SUB-segment. For each segment, gather its crossings with every
  // ring edge, split at them, and keep only the sub-intervals whose midpoint is
  // OUTSIDE (even-odd, so a torus hole counts as outside → its ground fill
  // survives). Returns { pieces:[polyline…], hadInside } — a purely analytic
  // difference (no FillBoolean), cheap enough for the draft frame.
  const clipPolylineOutsideRings = (path, rings) => {
    const pieces = [];
    let hadInside = false;
    for (let s = 0; s + 1 < path.length; s++) {
      const p0 = path[s]; const p1 = path[s + 1];
      if (!isFinitePt(p0) || !isFinitePt(p1)) continue;
      const dx = p1.x - p0.x; const dy = p1.y - p0.y;
      const ts = [0, 1];
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        if (!Array.isArray(ring) || ring.length < 3) continue;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i]; const b = ring[j];
          if (!isFinitePt(a) || !isFinitePt(b)) continue;
          const ex = b.x - a.x; const ey = b.y - a.y;
          const denom = dx * ey - dy * ex;
          if (Math.abs(denom) < 1e-12) continue;
          const t = ((a.x - p0.x) * ey - (a.y - p0.y) * ex) / denom;
          const u = ((a.x - p0.x) * dy - (a.y - p0.y) * dx) / denom;
          if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
        }
      }
      ts.sort((m, n) => m - n);
      let cur = null;
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k]; const t1 = ts[k + 1];
        if (t1 - t0 < 1e-9) continue;
        const tm = (t0 + t1) / 2;
        const outside = !pointInRingsEvenOdd(rings, p0.x + dx * tm, p0.y + dy * tm);
        if (outside) {
          const A = { x: p0.x + dx * t0, y: p0.y + dy * t0 };
          const B = { x: p0.x + dx * t1, y: p0.y + dy * t1 };
          if (!cur) { cur = [A, B]; } else { cur.push(B); }
        } else {
          hadInside = true;
          if (cur) { if (cur.length >= 2) pieces.push(cur); cur = null; }
        }
      }
      if (cur && cur.length >= 2) pieces.push(cur);
    }
    return { pieces, hadInside };
  };

  // I26 composition. Inside the projected footprint (rings, even-odd), ERASE the
  // in-footprint portion of a `removeFraction` share of the ground's own fill
  // lines so more dark paper shows through → the shadow reads darker on dark
  // paper. This is an analytic per-line difference against the footprint (spec
  // option a, done WITHOUT FillBoolean): robust on dense ground fill, no
  // polygon-clipping fragility (AUD-05), holes preserved for free, and cheap
  // enough for the draft frame. Only lines that actually cross the footprint are
  // candidates; a shared phase accumulator distributes the erasures evenly and
  // ties the removed share to shadow density. Erased lines are recorded in
  // `replaceMap` (path → surviving outside pieces); the caller splices+inserts
  // once so a line already handled by another footprint is not reprocessed.
  const thinGroundFillInRings = (sink, rings, removeFraction, replaceMap, accRef) => {
    if (!Array.isArray(sink) || !Array.isArray(rings) || !rings.length || removeFraction <= 0) return;
    for (let i = 0; i < sink.length; i++) {
      const path = sink[i];
      if (replaceMap.has(path) || !isGroundOwnFill(path)) continue;
      const { pieces, hadInside } = clipPolylineOutsideRings(path, rings);
      if (!hadInside) continue; // line does not enter this footprint → leave intact
      accRef.v += removeFraction;
      if (accRef.v >= 1) { accRef.v -= 1; replaceMap.set(path, pieces); }
    }
  };

  // Even-odd scanline hatch of a polygon-with-holes (rings = [outer, hole…],
  // each ring an array of {x,y}). Holes stay empty — the shadow of a ring-shaped
  // region, or a footprint carved by caster-bound subtraction, reads correctly.
  const hatchRingsEvenOdd = (rings, angleDeg, spacing) => {
    const segs = [];
    rings.forEach((ring) => {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (isFinitePt(ring[j]) && isFinitePt(ring[i])) segs.push([ring[j], ring[i]]);
      }
    });
    if (segs.length < 2) return [];
    const ang = finite(angleDeg, 45) * Math.PI / 180;
    const dirX = Math.cos(ang); const dirY = Math.sin(ang);
    const perpX = -dirY; const perpY = dirX;
    let pMin = Infinity; let pMax = -Infinity;
    segs.forEach(([a, b]) => {
      [a, b].forEach((pt) => {
        const pr = pt.x * perpX + pt.y * perpY;
        if (pr < pMin) pMin = pr;
        if (pr > pMax) pMax = pr;
      });
    });
    if (!Number.isFinite(pMin)) return [];
    const sp = Math.max(0.05, spacing);
    const count = Math.min(4000, Math.floor((pMax - pMin) / sp));
    const out = [];
    for (let i = 1; i <= count; i++) {
      const offset = pMin + i * sp;
      const hits = [];
      segs.forEach(([a, b]) => {
        const pa = a.x * perpX + a.y * perpY;
        const pb = b.x * perpX + b.y * perpY;
        if ((pa > offset) === (pb > offset)) return;
        const t = (offset - pa) / ((pb - pa) || 1e-9);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        hits.push({ s: x * dirX + y * dirY, x, y });
      });
      hits.sort((p, q) => p.s - q.s);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        out.push([{ x: hits[k].x, y: hits[k].y }, { x: hits[k + 1].x, y: hits[k + 1].y }]);
      }
    }
    return out;
  };

  // Project a world vertex onto the y = 0 ground along the light travel dir,
  // then camera-project. Returns a screen {x,y,z} or null when non-finite.
  const projectShadowVertex = (P, d, camAngles, projOpts) => {
    if (!P || !Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) return null;
    if (Math.abs(d.y) < MIN_ABS_DY) return null;
    const t = P.y / d.y; // ≤ 0 for a caster above ground
    const gx = P.x - t * d.x;
    const gz = P.z - t * d.z;
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return null;
    const cam = rotatePoint({ x: gx, y: 0, z: gz }, camAngles);
    const proj = projectPoint(cam, projOpts);
    if (!proj || !Number.isFinite(proj.x) || !Number.isFinite(proj.y)) return null;
    return proj;
  };

  // PERSPECTIVE projection: cast a ray from the light POSITION Lp THROUGH the
  // world vertex P and find where it crosses the ground y = 0. The ray is
  // Lp + t·(P − Lp); y = 0 ⇒ t = Lp.y / (Lp.y − P.y). A point light's rays
  // DIVERGE, so the ground footprint is larger than the caster (an enlarged
  // umbra), unlike the parallel directional path. Guards (no Infinity/NaN into
  // the hull): the light must sit above the ground (Lp.y > 0); a vertex at or
  // above the light height (Lp.y − P.y ≤ 0) or one whose ray does not cross the
  // ground going downward (t ≤ 0) casts no finite ground shadow and is skipped.
  const projectShadowVertexPositional = (P, Lp, camAngles, projOpts) => {
    if (!P || !Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) return null;
    if (!Lp || !Number.isFinite(Lp.y) || Lp.y <= 0) return null;
    const denom = Lp.y - P.y;
    if (!(denom > 1e-6)) return null; // vertex at/above the light height
    const t = Lp.y / denom;
    if (!(t > 0) || !Number.isFinite(t)) return null;
    const gx = Lp.x + t * (P.x - Lp.x);
    const gz = Lp.z + t * (P.z - Lp.z);
    if (!Number.isFinite(gx) || !Number.isFinite(gz)) return null;
    const cam = rotatePoint({ x: gx, y: 0, z: gz }, camAngles);
    const proj = projectPoint(cam, projOpts);
    if (!proj || !Number.isFinite(proj.x) || !Number.isFinite(proj.y)) return null;
    return proj;
  };

  // 2D convex hull (Andrew's monotone chain). Screen points → CCW hull ring.
  const convexHull = (input) => {
    const pts = (input || [])
      .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
      .map((pt) => ({ x: pt.x, y: pt.y }));
    if (pts.length < 3) return pts;
    pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (let i = 0; i < pts.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
      lower.push(pts[i]);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
      upper.push(pts[i]);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  };

  // One clean shadow footprint for a caster: project EVERY above-ground world
  // vertex to the ground (y = 0) along the light, then take the 2D convex hull —
  // the light-lab model (proposal §Prototypes, shadowHulls). Robust where the old
  // per-face-ring union was fragile: no mixed-winding ring soup, no FillBoolean
  // needed to merge a single object's faces, and a below-ground vertex (a caster
  // straddling the receiver) is simply dropped rather than projected the wrong
  // way into a mirrored bow-tie. Trade-off: the hull fills a concave/torus hole.
  // The DRAFT frame uses this cheap convex approximation; the FULL frame prefers
  // the true silhouette loops below (holes preserved). Returns a screen-space
  // ring (≥3 pts) or null.
  const casterHull = (record, projectVertex) => {
    const world = record.world || [];
    const pts = [];
    for (let i = 0; i < world.length; i++) {
      const P = world[i];
      if (!P || !Number.isFinite(P.y) || P.y < -1e-6) continue; // below ground casts nothing onto y=0
      const q = projectVertex(P);
      if (q) pts.push({ x: q.x, y: q.y });
    }
    const hull = convexHull(pts);
    return hull.length >= 3 ? hull : null;
  };

  const ringSignedArea = (ring) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
    return a / 2;
  };

  // World-space centroid of a face (its worldVerts), used to derive the per-face
  // light direction of a POINT/SPOT light (normalize(lightPos − faceCenter)).
  const faceCenterWorld = (face) => {
    const w = (face && face.worldVerts) || [];
    let cx = 0; let cy = 0; let cz = 0;
    for (let i = 0; i < w.length; i++) { cx += w[i].x; cy += w[i].y; cz += w[i].z; }
    const n = Math.max(1, w.length);
    return { x: cx / n, y: cy / n, z: cz / n };
  };

  // Chain a set of undirected edges (each [aIdx, bIdx] into the vertex array)
  // into ordered vertex-index loops. A manifold silhouette gives clean degree-2
  // loops (a torus → outer rim + inner rim); a branchy set walks greedily and any
  // leftover open chain is dropped. Small, deterministic — no boolean.
  const chainLoops = (edges) => {
    const adj = new Map();
    const push = (u, w) => { let l = adj.get(u); if (!l) { l = []; adj.set(u, l); } l.push(w); };
    edges.forEach(([a, b]) => { push(a, b); push(b, a); });
    const used = new Set();
    const ek = (u, w) => (u < w ? `${u}_${w}` : `${w}_${u}`);
    const maxSteps = edges.length + 5;
    const loops = [];
    edges.forEach(([a0, b0]) => {
      if (used.has(ek(a0, b0))) return;
      used.add(ek(a0, b0));
      const loop = [a0];
      let prev = a0; let cur = b0; let guard = 0;
      while (cur !== a0 && guard++ < maxSteps) {
        loop.push(cur);
        const nbrs = adj.get(cur) || [];
        let next = -1;
        for (const n of nbrs) { if (n !== prev && !used.has(ek(cur, n))) { next = n; break; } }
        if (next < 0) { for (const n of nbrs) { if (!used.has(ek(cur, n))) { next = n; break; } } }
        if (next < 0) break;
        used.add(ek(cur, next));
        prev = cur; cur = next;
      }
      if (loop.length >= 3) loops.push(loop);
    });
    return loops;
  };

  // True projected silhouette of a caster: classify its edges (the caller passes
  // a LIGHT-relative classifier — silhouette = a toward/away-the-light frontier —
  // so the footprint depends only on the light + geometry, not the camera), keep
  // the silhouette + boundary rims (light frontier + open-surface borders),
  // chain them into ordered loops, and project each loop's world vertices to the
  // ground along the light. A torus yields an OUTER and an INNER ground loop, so
  // an even-odd fill leaves the middle open (I25 — annular shadow, hole intact).
  // ROBUSTNESS: only the small clean loop set is projected (not every triangle),
  // so there is no dense polygon-clipping on the hot path. Returns screen-space
  // rings (outer first) or null — null falls back to the convex hull, which keeps
  // a caster straddling the receiver from folding into a mirrored bow-tie.
  const casterSilhouetteLoops = (record, projectVertex, classifyEdges) => {
    let classified;
    try { classified = classifyEdges(record, {}); } catch (_e) { return null; }
    if (!Array.isArray(classified)) return null;
    const world = record.world || [];
    const silEdges = [];
    for (let i = 0; i < classified.length; i++) {
      const e = classified[i];
      if (!e || (e.cls !== 'silhouette' && e.cls !== 'boundary')) continue;
      const Pa = world[e.a]; const Pb = world[e.b];
      // A silhouette vertex below the receiver folds the ground projection into a
      // bow-tie; bail to the hull rather than emit a mirrored loop.
      if ((Pa && Pa.y < -1e-6) || (Pb && Pb.y < -1e-6)) return null;
      silEdges.push([e.a, e.b]);
    }
    if (silEdges.length < 3) return null;
    const loops = chainLoops(silEdges);
    if (!loops.length) return null;
    const rings = [];
    loops.forEach((loop) => {
      const ring = [];
      for (let k = 0; k < loop.length; k++) {
        const P = world[loop[k]];
        const q = P ? projectVertex(P) : null;
        if (q) ring.push({ x: q.x, y: q.y });
      }
      if (ring.length >= 3) rings.push(ring);
    });
    if (!rings.length) return null;
    // Outer (largest |area|) first — pickPolygon / ring-extent expect it.
    rings.sort((a, b) => Math.abs(ringSignedArea(b)) - Math.abs(ringSignedArea(a)));
    return rings;
  };

  // Cheap analytic clip of a subject polygon against a CONVEX clip polygon
  // (Sutherland–Hodgman). Used by the DRAFT shadow path ONLY, to bound each
  // caster hull to the finite ground quad before hatching — no FillBoolean, so
  // orbit responsiveness stays intact (CONTRACT L4). A projected ground plane is
  // a convex quad, so the clip is exact; a convex hull ∩ convex quad is convex.
  const clipPolyToConvex = (subject, clip) => {
    if (!Array.isArray(subject) || subject.length < 3 || !Array.isArray(clip) || clip.length < 3) return subject;
    // Clip-polygon orientation → which side of each edge is "inside".
    let area = 0;
    for (let i = 0, j = clip.length - 1; i < clip.length; j = i++) {
      area += clip[j].x * clip[i].y - clip[i].x * clip[j].y;
    }
    const sign = area >= 0 ? 1 : -1;
    let output = subject.map((p) => ({ x: p.x, y: p.y }));
    for (let e = 0, f = clip.length - 1; e < clip.length; f = e++) {
      if (!output.length) break;
      const A = clip[f]; const B = clip[e];
      const ex = B.x - A.x; const ey = B.y - A.y;
      const inside = (p) => sign * (ex * (p.y - A.y) - ey * (p.x - A.x)) >= -1e-9;
      const intersect = (p, q) => {
        const dpx = q.x - p.x; const dpy = q.y - p.y;
        const denom = ex * dpy - ey * dpx;
        if (Math.abs(denom) < 1e-12) return { x: q.x, y: q.y };
        const t = -(ex * (p.y - A.y) - ey * (p.x - A.x)) / denom;
        return { x: p.x + t * dpx, y: p.y + t * dpy };
      };
      const input = output;
      output = [];
      for (let i = 0; i < input.length; i++) {
        const cur = input[i];
        const prev = input[(i + input.length - 1) % input.length];
        const curIn = inside(cur);
        const prevIn = inside(prev);
        if (curIn) {
          if (!prevIn) output.push(intersect(prev, cur));
          output.push({ x: cur.x, y: cur.y });
        } else if (prevIn) {
          output.push(intersect(prev, cur));
        }
      }
    }
    return output;
  };

  // Density (1..100) → coverage (0.02..1) → spacing. 50 maps to the legacy
  // coverage 0.5, so a default shadow bag reproduces the pre-Phase-5 spacing.
  const densityToCoverage = (density) => clamp(finite(density, 50) / 100, 0.02, 1);
  const coverageToSpacing = (coverage, penWidth) => {
    const Regions = Vectura.Scene3D && Vectura.Scene3D.Regions;
    if (Regions && typeof Regions.coverageToSpacing === 'function') {
      return Regions.coverageToSpacing(coverage, penWidth);
    }
    const pw = Math.max(0.05, finite(penWidth, 0.3));
    return Math.max(pw, pw / clamp(finite(coverage, 0.5), 0.02, 1));
  };

  // Stamp a set of even-odd hatch lines onto the ground plane, clip against the
  // occluders (ground never occludes; object faces do), and push visible runs.
  const emitHatchLines = (lines, groundPlane, clipper, out, meta, tr, draft) => {
    const treat = tr || NO_STROKE_TREATMENT;
    lines.forEach((line) => {
      const pts = line.map((pt) => ({
        x: pt.x,
        y: pt.y,
        z: groundPlane ? groundPlane.A * pt.x + groundPlane.B * pt.y + groundPlane.C : 0,
      }));
      const clip = clipper.clipPath(pts, { objectId: 'ground' });
      clip.runs.forEach((run) => {
        if (!run.visible) return; // ground shadow: hidden runs simply drop
        if (runLength(run.pts) < MIN_RUN_MM) return;
        const m = treat.active ? { ...meta } : meta;
        const rpts = applyStrokeTreatment(run.pts, treat, m, draft);
        const path = pathWithMeta(rpts, m);
        if (path.length >= 2) {
          out.push(path);
          if (treat.overstroke && !draft) {
            const dbl = pathWithMeta(overstrokeCopy(rpts), m);
            if (dbl.length >= 2) out.push(dbl);
          }
        }
      });
    });
  };

  // Bounding-box min extent of a ring (used to scale the penumbra inset step).
  const ringMinExtent = (ring) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    (ring || []).forEach((pt) => {
      if (!isFinitePt(pt)) return;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
    if (!Number.isFinite(minX)) return 0;
    return Math.min(maxX - minX, maxY - minY);
  };

  // Hatch a shadow polygon (rings = [outer, hole…]). When cfg.layers is on and
  // this is a full (non-draft) frame, emit NESTED inset rings — a penumbra: the
  // rim is the full footprint (sparsest), successive insets crowd toward the
  // caster's ground contact (densest core). Each layer is its own hatch region
  // so the core accumulates ink from every enclosing layer.
  const emitShadowRegion = (rings, groundPlane, clipper, out, meta, treat, draft, cfg) => {
    if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 3) return;
    const { angle, coverage, penWidth, layers, layerCount, falloff, Mappers } = cfg;
    // Draft / layers-off / no inset util → single flat hatch (legacy path).
    if (!layers || draft || !Mappers || typeof Mappers.insetPasses !== 'function') {
      const spacing = coverageToSpacing(coverage, penWidth);
      emitHatchLines(hatchRingsEvenOdd(rings, angle, spacing), groundPlane, clipper, out, meta, treat, draft);
      return;
    }
    // Penumbra: passes[0] is the footprint boundary, passes[k] the k-th inward
    // offset. Step so `layerCount` insets stay well inside the footprint.
    const ext = ringMinExtent(rings[0]);
    const step = Math.max(1, ext / (layerCount * 2));
    let passes = [];
    try { passes = Mappers.insetPasses(rings, step) || []; } catch (_e) { passes = []; }
    if (passes.length < 2) {
      const spacing = coverageToSpacing(coverage, penWidth);
      emitHatchLines(hatchRingsEvenOdd(rings, angle, spacing), groundPlane, clipper, out, meta, treat, draft);
      return;
    }
    const n = Math.min(layerCount, passes.length);
    for (let L = 0; L < n; L++) {
      const layerRings = passes[L];
      if (!Array.isArray(layerRings) || !layerRings.length) continue;
      // Penumbra build-up: L = 0 (rim / full footprint) carries the base coverage
      // — the shadow edge matches a flat shadow — and each inward layer adds a
      // sparser hatch (coverage·falloff^L). The layers nest and overlap, so the
      // core (covered by every layer) accumulates the most ink = densest, fading
      // outward to the rim. `falloff` sets how fast the per-layer add-on drops.
      const cov = clamp(coverage * Math.pow(falloff, L), 0.02, 1);
      const spacing = coverageToSpacing(cov, penWidth);
      const layerMeta = { ...meta };
      if (layerMeta.sceneTarget) {
        layerMeta.sceneTarget = { ...meta.sceneTarget, shadowLayer: L, pickPolygon: layerRings[0].map((pt) => ({ x: pt.x, y: pt.y })) };
      }
      emitHatchLines(hatchRingsEvenOdd(layerRings, angle, spacing), groundPlane, clipper, out, layerMeta, treat, draft);
    }
  };

  const shadowMeta = (rings, casterId, penId, depth) => ({
    algorithm: 'scene3d',
    kind: 'sceneFill',
    sceneTarget: {
      objectId: 'ground',
      faceId: 'face:ground',
      regionClass: 'castShadow',
      casterId: casterId || null,
      pickPolygon: rings[0].map((pt) => ({ x: pt.x, y: pt.y })),
      edgeClass: null,
      depth: finite(depth, 0),
      normal: { x: 0, y: 1, z: 0 },
      facingUp: true,
      occluded: false,
    },
    ...(penId ? { penId } : {}),
  });

  // build(scene, params, bounds, clipper, lightDir, opts)
  //   opts.styleOf(objectId)   -> { penId } (optional shadow style key source)
  //   opts.lightPosition {x,y,z} -> when set, casts a PERSPECTIVE (point/spot)
  //     shadow from that world position instead of the PARALLEL directional
  //     projection along `lightDir` (which may then be null).
  //   opts.light {type,range,target,coneAngle,penumbra} -> optional full light
  //     record. A SPOT casts only within its illuminated cone; any positional
  //     light with a finite range casts nothing past that range. Absent ⇒ the
  //     legacy omnidirectional, range-less projection (byte-identical).
  // Returns an array of emitted shadow fill paths (sceneFill / regionClass
  // 'castShadow'). Empty when there is no ground, no caster, or grazing light.
  const build = (scene, params, bounds = {}, clipper, lightDir, opts = {}) => {
    const out = [];
    if (!scene || !scene.ground || !clipper) return out;
    const HLR = Vectura.Scene3D && Vectura.Scene3D.HLR;
    const FillBoolean = Vectura.FillBoolean;
    // build() casts for the ONE light passed in — the caller decides which
    // lights cast (multi-light) and filters out ambient / castShadows:false
    // lights before calling. A positional light supplies opts.lightPosition; a
    // directional light supplies its travel direction in lightDir.
    const cam0 = scene.camera || {};
    const camAngles0 = { yaw: finite(cam0.yaw, 0), pitch: finite(cam0.pitch, 0), roll: finite(cam0.roll, 0) };
    const projOpts0 = scene.projOpts || {};
    const lightPosition = opts.lightPosition;
    const positional = Boolean(lightPosition && Number.isFinite(lightPosition.y) && lightPosition.y > 0);
    // Full light record (optional): a SPOT casts only within its illuminated
    // cone, and a positional light with a finite `range` casts nothing past it —
    // a caster the light never reaches drops no ground shadow. A POINT light
    // stays omnidirectional (range only). Absent record ⇒ legacy omni behaviour
    // (byte-identical: the existing point tests pass no record).
    const lightRec = opts.light || null;
    const rangeLimit = positional && lightRec ? finite(lightRec.range, 0) : 0;
    const isSpot = positional && lightRec && lightRec.type === 'spot';
    let spotAxis = null;
    let spotCos = -1; // cos of the OUTER cone edge (cone + penumbra)
    if (isSpot) {
      const target = lightRec.target || { x: 0, y: 0, z: 0 };
      const ax = { x: target.x - lightPosition.x, y: target.y - lightPosition.y, z: target.z - lightPosition.z };
      const al = Math.hypot(ax.x, ax.y, ax.z) || 1;
      spotAxis = { x: ax.x / al, y: ax.y / al, z: ax.z / al };
      const cone = finite(lightRec.coneAngle, 30);
      const pen = finite(lightRec.penumbra, 8);
      spotCos = Math.cos((cone + pen) * Math.PI / 180);
    }
    // A world vertex casts a shadow only if the light actually reaches it: within
    // range, and (spot only) inside the illuminated cone. Directional / omni
    // point with no range ⇒ always true (byte-identical legacy path).
    const vertexLit = (P) => {
      if (rangeLimit > 0) {
        const dx = P.x - lightPosition.x; const dy = P.y - lightPosition.y; const dz = P.z - lightPosition.z;
        if (Math.hypot(dx, dy, dz) > rangeLimit) return false;
      }
      if (isSpot) {
        const fx = P.x - lightPosition.x; const fy = P.y - lightPosition.y; const fz = P.z - lightPosition.z;
        const fl = Math.hypot(fx, fy, fz) || 1;
        const cosA = (fx * spotAxis.x + fy * spotAxis.y + fz * spotAxis.z) / fl;
        if (cosA < spotCos) return false; // outside the (soft) cone → not lit → no caster contribution
      }
      return true;
    };
    let projectVertex;
    let projectVertexRaw; // ungated (ignores cone/range) — for the hatch-angle probe
    if (positional) {
      projectVertexRaw = (P) => projectShadowVertexPositional(P, lightPosition, camAngles0, projOpts0);
      projectVertex = (rangeLimit > 0 || isSpot)
        ? (P) => (vertexLit(P) ? projectVertexRaw(P) : null)
        : projectVertexRaw;
    } else {
      const d = lightDir;
      if (!d || !Number.isFinite(d.y) || Math.abs(d.y) < MIN_ABS_DY) return out; // grazing/absent
      projectVertex = (P) => projectShadowVertex(P, d, camAngles0, projOpts0);
      projectVertexRaw = projectVertex;
    }

    // ── Light-relative silhouette (camera-invariant shadow SHAPE) ──────────────
    // The cast shadow's outline depends only on the LIGHT + geometry, never on
    // where the camera sits. So the silhouette edge set is classified from the
    // LIGHT's viewpoint: an edge is a silhouette when its two adjacent faces
    // straddle the light — one faces TOWARD it, the other AWAY (a sign change of
    // dot(faceNormalWorld, lightDir)). This is the light analog of the camera
    // front/back test; classifying from the CAMERA instead made a torus's
    // shadow-hole swim as the view orbited (physically wrong under a fixed light).
    //   - DIRECTIONAL: lightDir is the constant world travel direction (shared by
    //     both faces of every edge).
    //   - POINT / SPOT: the direction is per-face — normalize(lightPos − faceCenter)
    //     — so a diverging light silhouettes each face by its own bearing.
    // Only the CLASSIFICATION source changes; the loops still chain + project +
    // even-odd fill through the exact same path as before.
    const lightFaceSign = (face) => {
      const n = face && face.normalWorld;
      if (!n) return 0;
      let lx; let ly; let lz;
      if (positional) {
        const c = faceCenterWorld(face);
        lx = lightPosition.x - c.x; ly = lightPosition.y - c.y; lz = lightPosition.z - c.z;
      } else {
        lx = lightDir.x; ly = lightDir.y; lz = lightDir.z;
      }
      return n.x * lx + n.y * ly + n.z * lz;
    };
    // Drop-in replacement for Edges.classifyEdges within casterSilhouetteLoops:
    // returns { a, b, cls } per edge with cls ∈ {silhouette, boundary, interior}
    // decided by the LIGHT, not the camera. Boundary (single-face / open-surface)
    // rims still bound the footprint, exactly as the camera classifier did.
    const lightClassifyEdges = (record) => {
      const faces = record.faces || [];
      return (record.edges || []).map((edge) => {
        const adjacent = edge.faces.map((idx) => faces[idx]).filter(Boolean);
        let cls = 'interior';
        if (adjacent.length === 1) {
          cls = 'boundary';
        } else if (adjacent.length === 2) {
          const s0 = lightFaceSign(adjacent[0]);
          const s1 = lightFaceSign(adjacent[1]);
          if ((s0 >= 0) !== (s1 >= 0)) cls = 'silhouette';
        }
        return { a: edge.a, b: edge.b, cls };
      });
    };

    const groundFace = scene.ground.faces && scene.ground.faces[0];
    const groundPlane = groundFace && HLR ? HLR.fitSupportPlane(groundFace.polygon) : null;
    const groundDepth = groundFace ? -finite(groundFace.centroidZ, 0) : 0;
    const penWidth = finite(bounds.penWidth, 0.3);
    const styleOf = typeof opts.styleOf === 'function' ? opts.styleOf : null;
    const Mappers = Vectura.Scene3D && Vectura.Scene3D.Mappers;
    const draftFrame = Boolean(bounds && bounds.fastPreview);

    // ── Phase 5 shadow bag. Absent ⇒ the legacy constants (byte-identical). ────
    const shadowBag = opts.shadow || {};
    const coverage = shadowBag.shadowDensity != null
      ? densityToCoverage(shadowBag.shadowDensity) : SHADOW_COVERAGE;
    const followsLight = shadowBag.shadowAngleFollowsLight === true;
    // Hatch orientation is CAMERA-INDEPENDENT: we pick a direction in the WORLD
    // ground plane (y = 0) and project it to a screen bearing ONCE per frame.
    // Anchoring to the ground (not the screen) keeps the fill texture glued to
    // the plate as the camera orbits — a fixed SCREEN angle would slide the hatch
    // across the footprint every frame (the "swim" bug, fix-map #1).
    const projectGroundDir = (wx, wz) => {
      const o = projectPoint(rotatePoint({ x: 0, y: 0, z: 0 }, camAngles0), projOpts0);
      const p = projectPoint(rotatePoint({ x: wx, y: 0, z: wz }, camAngles0), projOpts0);
      if (!o || !p || !Number.isFinite(o.x) || !Number.isFinite(p.x)) return null;
      const bx = p.x - o.x; const by = p.y - o.y;
      if (!(Math.hypot(bx, by) > 1e-6)) return null;
      return Math.atan2(by, bx) * 180 / Math.PI;
    };
    // World-space hatch direction: perpendicular to the light's horizontal travel
    // when follow-light is set (the shadow extends along that travel dir), else
    // the explicit shadow angle read as a bearing in the ground XZ plane.
    let worldDirX; let worldDirZ;
    if (followsLight) {
      let hx; let hz;
      if (positional) { hx = -lightPosition.x; hz = -lightPosition.z; }
      else { hx = lightDir ? lightDir.x : 0; hz = lightDir ? lightDir.z : 0; }
      const hl = Math.hypot(hx, hz);
      if (hl > 1e-9) { worldDirX = -hz / hl; worldDirZ = hx / hl; }
      else { worldDirX = 1; worldDirZ = 0; }
    } else {
      const th = clamp(finite(shadowBag.shadowAngle, SHADOW_ANGLE), 0, 360) * Math.PI / 180;
      worldDirX = Math.cos(th); worldDirZ = Math.sin(th);
    }
    let hatchAngle = clamp(finite(shadowBag.shadowAngle, SHADOW_ANGLE), 0, 360);
    const projectedAngle = projectGroundDir(worldDirX * 100, worldDirZ * 100);
    if (projectedAngle != null) hatchAngle = projectedAngle;
    // An AREA light casts a SOFTER shadow: it always uses the Phase-5 nested
    // penumbra build-up (densest core, fading rim) even when the scene shadow
    // bag leaves layers off — that is what makes a soft light read as soft. A
    // hard point/directional light keeps the bag's explicit setting, so a scene
    // with no area light stays byte-identical.
    const isArea = lightRec && lightRec.type === 'area';
    const shadowLayers = shadowBag.shadowLayers === true || isArea;
    const layerCount = clamp(Math.round(finite(shadowBag.shadowLayerCount, 3)), 2, 4);
    const falloff = clamp(finite(shadowBag.shadowFalloff, 0.5), 0.2, 1);
    const penOverride = (typeof shadowBag.shadowPenId === 'string' && shadowBag.shadowPenId) ? shadowBag.shadowPenId : null;
    const cfg = { angle: hatchAngle, coverage, penWidth, layers: shadowLayers, layerCount, falloff, Mappers };
    // ── I26 shadow MODE. 'additive' (default) EMITS shadow hatch; 'inverse'
    // instead THINS the ground layer's own fill inside the footprint (dark-paper
    // shadow). Inverse needs the accumulated scene output (opts.groundFillPaths)
    // to reach the ground's fill lines; absent it degrades to a no-op. removeShare
    // is tied to shadow density (coverage 0.5 ⇒ drop half the lines in-footprint).
    const inverse = shadowBag.shadowMode === 'inverse';
    const groundFillSink = inverse && Array.isArray(opts.groundFillPaths) ? opts.groundFillPaths : null;
    const invRemoveShare = clamp(coverage, 0.02, 1);
    const invReplace = new Map(); // ground fill path → surviving outside pieces
    const invAcc = { v: 0 };
    // Emit hatch (additive) OR thin the ground fill (inverse). One chokepoint so
    // every footprint path — draft hull, degrade fallback, full class union —
    // composes identically.
    const compose = (rings, casterId, penId) => {
      if (inverse) {
        if (groundFillSink) thinGroundFillInRings(groundFillSink, rings, invRemoveShare, invReplace, invAcc);
        return;
      }
      emitShadowRegion(rings, groundPlane, clipper, out,
        shadowMeta(rings, casterId, penFor(penId), groundDepth), shadowTreat, draftFrame, cfg);
    };
    // Inverse mode erases the in-footprint portion of the chosen ground-fill
    // lines: splice each original out of the shared sink and splice its surviving
    // OUTSIDE pieces back in (descending, so indices stay valid). Each piece
    // inherits the original's meta so it still reads/picks as ground fill. Every
    // shadow-emitting return routes through here so this is not skipped.
    const finalize = () => {
      if (inverse && groundFillSink && invReplace.size) {
        for (let i = groundFillSink.length - 1; i >= 0; i--) {
          const orig = groundFillSink[i];
          if (!invReplace.has(orig)) continue;
          const pieces = (invReplace.get(orig) || []).map((pts) => {
            const piece = pts.map((pt) => ({ x: pt.x, y: pt.y }));
            if (orig.meta) piece.meta = orig.meta;
            return piece;
          });
          groundFillSink.splice(i, 1, ...pieces);
        }
      }
      return out;
    };
    // Stroke treatment: line type comes from the shadow bag (default solid, so a
    // default scene is byte-identical); wobble/dash-scale still inherit the scene
    // stroke params. Draft keeps the dash but skips the wobble geometry.
    const shadowTreat = strokeTreatment({ ...(opts.styleParams || {}), lineType: shadowBag.shadowLineType || 'solid' });
    // Effective pen: the shadow-pen override wins over the caster's inherited pen.
    const penFor = (casterPen) => penOverride || casterPen || null;

    // Per-object cast toggle (obj.shadow.enabled): null ⇒ inherit (cast), true ⇒
    // cast, false ⇒ this object drops no shadow. Read from the source params.
    const objectCasts = (objectId) => {
      const o = (params && Array.isArray(params.objects)) ? params.objects.find((ob) => ob && ob.id === objectId) : null;
      const en = o && o.shadow ? o.shadow.enabled : null;
      return en !== false;
    };

    // Per caster: a convex hull (cheap draft footprint) AND — when available —
    // its TRUE silhouette loops (outer + inner rims). The full frame prefers the
    // loops so holes stay open (I25); the draft uses the hull.
    const casters = [];
    (scene.objects || []).forEach((record) => {
      if (!record || record.isGround) return;
      if (!objectCasts(record.id)) return; // per-object cast toggle
      const hull = casterHull(record, projectVertex);
      if (!hull) return;
      const loops = casterSilhouetteLoops(record, projectVertex, lightClassifyEdges);
      const style = styleOf ? (styleOf(record.id) || {}) : {};
      casters.push({ id: record.id, hull, loops, penId: style.penId || null, classKey: style.penId || '' });
    });
    if (!casters.length) return out;

    // ── Draft (CONTRACT L4): NO booleans. Flat per-caster face tints. ──────────
    // Each hull is CHEAPLY clipped to the finite ground quad (Sutherland–Hodgman,
    // no FillBoolean) so a low sun can't throw the hull's hatch off the plate and
    // across the whole viewport, and the draft footprint matches the settled
    // one's extent as the camera orbits (fix-map #2).
    if (bounds && bounds.fastPreview) {
      const groundRing = groundFace && Array.isArray(groundFace.polygon)
        ? groundFace.polygon.filter(isFinitePt).map((pt) => ({ x: pt.x, y: pt.y }))
        : null;
      const groundClipReady = groundRing && groundRing.length >= 3;
      casters.forEach((caster) => {
        const ring = caster.hull;
        const clipped = groundClipReady ? clipPolyToConvex(ring, groundRing) : ring;
        if (!Array.isArray(clipped) || clipped.length < 3) return;
        compose([clipped], caster.id, caster.penId);
      });
      return finalize();
    }

    // ── Full quality: class union + precedence + caster-bound subtract. ────────
    // Union each ring as its OWN polygon (not a single nonzero multipolygon):
    // the mesh's faces project with mixed windings, so a nonzero fill would read
    // clockwise faces as holes and cancel the footprint. Independent union of
    // shells merges overlaps and is winding-agnostic.
    const unionRings = (rings) => {
      const geoms = rings
        .map((ring) => FillBoolean.ringToMultiPolygon(ring))
        .filter((geom) => geom.length);
      return geoms.length ? FillBoolean.union(...geoms) : [];
    };
    if (!FillBoolean || typeof FillBoolean.union !== 'function') {
      // No boolean surface available: degrade to the flat per-caster tint. The
      // silhouette loops (even-odd, holes intact) beat the hull when present.
      casters.forEach((caster) => {
        const rings = (caster.loops && caster.loops.length) ? caster.loops : [caster.hull];
        compose(rings, caster.id, caster.penId);
      });
      return finalize();
    }

    // Per-caster footprint geometry. Prefer the true silhouette loops folded into
    // a hole-preserving multipolygon (containment parity → inner rim = hole); one
    // boolean over a SMALL clean loop set, not dense triangles. Fall back to the
    // convex hull when loops are unavailable/degenerate (e.g. a straddling caster)
    // or the boolean collapses.
    const footprintGeom = (caster) => {
      const loops = caster.loops;
      if (loops && loops.length && typeof FillBoolean.nonZeroUnionByContainment === 'function') {
        const g = FillBoolean.nonZeroUnionByContainment(loops);
        if (g && g.length) return g;
      }
      return unionRings([caster.hull]);
    };

    // Ground extent (clip every shadow to the receiver quad before unioning).
    const groundGeom = groundFace ? FillBoolean.ringToMultiPolygon(
      groundFace.polygon.map((pt) => ({ x: pt.x, y: pt.y }))) : [];
    const clipToGround = (geom) => (groundGeom.length && geom.length
      ? FillBoolean.intersection(geom, groundGeom) : geom);

    // Per-object front-face SCREEN silhouette (the caster-bound region). A
    // caster subtracts its OWN silhouette from its OWN shadow so no hatch draws
    // over its body — but NOT other objects' bodies (those are the HLR
    // clipper's job, depth-correct: an object standing over another's shadow
    // occludes it). Per-caster (not blanket) keeps the two mechanisms distinct.
    const ownSilhouette = (objectId) => {
      const record = (scene.objects || []).find((r) => r && r.id === objectId);
      if (!record) return [];
      const rings = [];
      (record.faces || []).forEach((face) => {
        if (!face || !face.front || !Array.isArray(face.polygon)) return;
        const ring = face.polygon.filter(isFinitePt).map((pt) => ({ x: pt.x, y: pt.y }));
        if (ring.length >= 3) rings.push(ring);
      });
      return rings.length ? unionRings(rings) : [];
    };

    // Per-caster shadow footprint: ground-clipped union of its face projections,
    // minus its own silhouette (caster-bound).
    casters.forEach((caster) => {
      let geom = clipToGround(footprintGeom(caster));
      const own = ownSilhouette(caster.id);
      if (own.length && geom.length) geom = FillBoolean.difference(geom, own);
      caster.geom = geom;
    });

    // Group casters into style-equivalence classes; union member footprints.
    const classes = new Map();
    casters.forEach((caster) => {
      let cls = classes.get(caster.classKey);
      if (!cls) { cls = { key: caster.classKey, penId: caster.penId, geoms: [], casterIds: new Set() }; classes.set(caster.classKey, cls); }
      if (caster.geom && caster.geom.length) cls.geoms.push(caster.geom);
      cls.casterIds.add(caster.id);
    });

    // Precedence: '' (unstyled) sorts first = lowest precedence. A class
    // subtracts the union of every higher-precedence (later) class's geom, so
    // a styled shadow wins the overlap against an unstyled one.
    const classList = [...classes.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    classList.forEach((cls) => { cls.geom = cls.geoms.length ? FillBoolean.union(...cls.geoms) : []; });

    classList.forEach((cls, i) => {
      let geom = cls.geom;
      if (!geom || !geom.length) return;
      // Subtract higher-precedence classes.
      for (let j = i + 1; j < classList.length; j++) {
        const higher = classList[j].geom;
        if (higher && higher.length) geom = FillBoolean.difference(geom, higher);
      }
      if (!geom || !geom.length) return;
      const casterId = cls.casterIds.size === 1 ? [...cls.casterIds][0] : null;
      // One region per polygon (outer + holes) so even-odd keeps holes empty.
      geom.forEach((polygon) => {
        const rings = (polygon || [])
          .map((ring) => (ring || []).map((pt) => ({ x: pt[0], y: pt[1] })))
          .filter((ring) => ring.length >= 3);
        if (!rings.length) return;
        compose(rings, casterId, cls.penId);
      });
    });

    return finalize();
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Shadows: { build } });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { build };
  }
})();
