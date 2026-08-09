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

  // ── Shadow ANATOMY: zone model (contact → umbra → penumbra → outer) ────────
  //
  // WHY THE OLD LAYER MODEL READ AS A FLAT BLOB
  // -------------------------------------------
  // It nested `Mappers.insetPasses` — concentric offsets of the FOOTPRINT — and
  // hatched every layer at the SAME angle with an independently derived spacing.
  // Three faults followed:
  //   D1  concentric insets of an elongated cast footprint make a bullseye on the
  //       footprint CENTROID. That has nothing to do with where the object meets
  //       the ground, so the densest ink sat mid-shadow, not at the base.
  //   D2  same-angle rulings at incommensurate spacings overlap. Ink drawn on top
  //       of ink is invisible on paper — so "more layers" added strokes without
  //       adding tone. That is precisely the reported symptom.
  //   D3  there was no contact/occlusion band at all — the single darkest and most
  //       structurally important value in a shaded drawing was simply absent.
  //
  // THE MODEL THAT REPLACES IT
  // --------------------------
  // Two scalar fields over the footprint drive everything:
  //   t(p) = dist(p, CONTACT) / L    throw parameter; 0 at the object's base,
  //                                  1 at the far tip. CONTACT is the caster's
  //                                  NADIR drop (silhouette projected straight
  //                                  DOWN), never the light projection.
  //   e(p) = dist(p, ∂FOOTPRINT)     how far in from the outline p sits, measured
  //                                  only against edges that face PAPER (the rim
  //                                  against the caster's own body is excluded —
  //                                  the base is not an "edge" of the shadow).
  // The umbra is a WEDGE, not a uniform inset: real penumbra widens with distance
  // from the caster, so the umbra is wide at the base and narrows to nothing
  // partway down the throw — w(t) = w0 + k·t·L. That retreat is the "layers of
  // decreasing rounds" being asked for, and `shadowFalloff` now drives k.
  //
  // Zones (first match wins), and what each Layers setting turns on:
  //   Off → Z2 only, via the untouched legacy path (byte-identical).
  //   2   → Z0 contact collar + Z2.            The object LANDS.
  //   3   → + Z1 umbra wedge.                  The shadow gains a core.
  //   4   → + Z3 outer penumbra / far tail.    It stops being a cut-out.
  //
  // WHY RULING SUBSETS AND NOT ZONE POLYGONS
  // ----------------------------------------
  // Every zone's family-A lines are a SUBSET of one master grid whose phase is
  // anchored to a fixed world origin. Because a sparser zone keeps every k-th line
  // of the same grid the denser zone drew, lines can never double up (D2) and can
  // never shift phase at a boundary — it is geometrically impossible for a contour
  // line to appear at a zone edge. Zone membership is decided per line SEGMENT by
  // sampling the fields; no zone polygon is ever built.
  //
  // WHY EXTRA DENSITY GOES INTO CROSSED FAMILIES, NOT TIGHTER SPACING
  // -----------------------------------------------------------------
  // Past ~1.2·penWidth, ruling closer floods the paper instead of darkening it.
  // So no family is ever emitted below PLOT_FLOOR; the contact band reaches its
  // ~4× tone by crossing families at +65° and +32° (never +90°, which reads as a
  // square grid and beats against the raster).
  const UMBRA_RIN = 0.10;
  const PLOT_FLOOR_MULT = 1.2;   // min spacing for ANY single family, × penWidth
  const CROSS_B_DEG = 65;
  const CROSS_C_DEG = 32;
  const Z_CONTACT = 0;
  const Z_UMBRA = 1;
  const Z_PENUMBRA = 2;
  const Z_OUTER = 3;

  // Deterministic [0,1) hash. Feathering must be stable frame to frame or the
  // line ends swim as the camera orbits (same failure the hatch bearing has).
  const hash01 = (a, b) => {
    let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x9e3779b9, 0x85ebca6b)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };

  // Contact-collar half-width. Thin by construction: a wide "contact" band is
  // just a second umbra, and the accent stops reading as contact.
  const contactWidthOf = (contactSegs) => {
    const pts = [];
    (contactSegs || []).forEach(([a, b]) => { pts.push(a, b); });
    return Math.max(1.2, 0.12 * ringMinExtent(pts));
  };

  const ringsToSegs = (rings) => {
    const segs = [];
    (rings || []).forEach((ring) => {
      if (!Array.isArray(ring) || ring.length < 2) return;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        if (isFinitePt(ring[j]) && isFinitePt(ring[i])) segs.push([ring[j], ring[i]]);
      }
    });
    return segs;
  };

  const distToSegs = (px, py, segs) => {
    let best = Infinity;
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i][0]; const b = segs[i][1];
      const vx = b.x - a.x; const vy = b.y - a.y;
      const wx = px - a.x; const wy = py - a.y;
      const vv = vx * vx + vy * vy;
      let s = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
      if (s < 0) s = 0; else if (s > 1) s = 1;
      const dx = wx - vx * s; const dy = wy - vy * s;
      const d = dx * dx + dy * dy;
      if (d < best) best = d;
    }
    return best === Infinity ? Infinity : Math.sqrt(best);
  };

  const pointInRings = (px, py, rings) => {
    let inside = false;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j]; const b = ring[i];
        if (!isFinitePt(a) || !isFinitePt(b)) continue;
        if ((a.y > py) !== (b.y > py)) {
          const x = a.x + ((py - a.y) / ((b.y - a.y) || 1e-12)) * (b.x - a.x);
          if (px < x) inside = !inside;
        }
      }
    }
    return inside;
  };

  const ringsBBox = (ringGroups) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    ringGroups.forEach((rings) => (rings || []).forEach((ring) => (ring || []).forEach((pt) => {
      if (!isFinitePt(pt)) return;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    })));
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  };

  // Sample the two fields on a lattice ONCE, then bilinear-sample per hatch
  // segment. A ruling at the master pitch over a large footprint produces tens of
  // thousands of midpoint queries; against a boolean-produced outline (hundreds of
  // segments) the direct form is O(n·m) per frame. The lattice bounds that to one
  // O(cells·m) build plus O(1) lookups, and the interpolation keeps zone edges
  // smooth rather than stair-stepped at the cell size.
  const buildShadowFields = (footRings, cSegs, edgeSegs) => {
    const box = ringsBBox([footRings]);
    if (!box) return null;
    const pad = 2;
    const minX = box.minX - pad; const minY = box.minY - pad;
    const w = (box.maxX - box.minX) + pad * 2;
    const h = (box.maxY - box.minY) + pad * 2;
    if (!(w > 0) || !(h > 0)) return null;
    // ~1 mm cells, capped so a huge grazing-light footprint cannot blow up.
    const MAX_CELLS = 40000;
    let cell = 1.0;
    while ((w / cell + 1) * (h / cell + 1) > MAX_CELLS) cell *= 1.5;
    const nx = Math.max(2, Math.ceil(w / cell) + 1);
    const ny = Math.max(2, Math.ceil(h / cell) + 1);
    const dC = new Float32Array(nx * ny);
    const dE = new Float32Array(nx * ny);
    const hasContact = cSegs.length > 0;
    for (let j = 0; j < ny; j++) {
      const y = minY + j * cell;
      for (let i = 0; i < nx; i++) {
        const x = minX + i * cell;
        const k = j * nx + i;
        // Distance to the contact SEGMENTS, with no inside test: the collar hugs
        // the boundary of the contact set, it never fills it. Filling it is how a
        // rounded caster's band grows to a whole diameter.
        dC[k] = hasContact ? distToSegs(x, y, cSegs) : 0;
        dE[k] = edgeSegs.length ? distToSegs(x, y, edgeSegs) : 1e6;
      }
    }
    const sample = (arr, x, y) => {
      let fx = (x - minX) / cell; let fy = (y - minY) / cell;
      if (fx < 0) fx = 0; else if (fx > nx - 1.0001) fx = nx - 1.0001;
      if (fy < 0) fy = 0; else if (fy > ny - 1.0001) fy = ny - 1.0001;
      const i0 = fx | 0; const j0 = fy | 0;
      const tx = fx - i0; const ty = fy - j0;
      const k = j0 * nx + i0;
      const a = arr[k]; const b = arr[k + 1];
      const c = arr[k + nx]; const d = arr[k + nx + 1];
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    };
    // Throw length L: the largest contact-distance anywhere in the footprint. The
    // max of a distance function over a region is attained on its boundary, so the
    // outline's own vertices are a sufficient (and cheap) sample set.
    let L = 0;
    (footRings || []).forEach((ring) => (ring || []).forEach((pt) => {
      if (!isFinitePt(pt)) return;
      const d = sample(dC, pt.x, pt.y);
      if (d > L) L = d;
    }));
    if (!(L > 1e-6)) L = Math.max(w, h) * 0.5;
    // Inradius: the largest distance-in-from-the-outline anywhere inside the
    // footprint, i.e. half the shadow's widest section. The umbra's base width
    // has to be a fraction of THIS, not of the throw — on a compact footprint a
    // throw-derived penumbra margin is sub-millimetre and the umbra becomes the
    // whole shadow.
    let Rin = 0;
    for (let j = 0; j < ny; j++) {
      const y = minY + j * cell;
      for (let i = 0; i < nx; i++) {
        const x = minX + i * cell;
        if (!pointInRings(x, y, footRings || [])) continue;
        const d = dE[j * nx + i];
        if (d > Rin) Rin = d;
      }
    }
    return {
      L,
      Rin,
      distContact: (x, y) => sample(dC, x, y),
      distEdge: (x, y) => sample(dE, x, y),
    };
  };

  // Family-A stride ladder. `shadowDensity` fixes S_base (today's flat spacing);
  // the master pitch is the FINEST plot-safe subdivision of it, at most S_base/3.
  // Z2 is pinned to stride N so the penumbra keeps exactly the flat shadow's
  // spacing — the backward-compatible anchor. When S_base is already close to the
  // plot floor (dense shadows) N collapses toward 1, family A stops separating the
  // zones, and the crossed families carry the whole ladder. That is the correct
  // engraving answer, not a degradation.
  // ROUND 2. The first cut pinned the crossed families at sBase/3 — at the
  // default density that is the PLOT FLOOR itself, so one crossed family alone
  // covered ~83% of the paper and two of them flooded the collar solid. That is
  // the §0 craft rule violated from the inside: extra density must go into
  // another DIRECTION at the same pitch, never into a tighter one.
  //
  // So every family now rules at the PENUMBRA pitch, and the ladder is built out
  // of family COUNT (+ one stride step for the contact accent, + dash duty for
  // the tail). At penWidth 0.3 / density 50 that is:
  //   Z2  1 family  @ sPen            0.40 coverage   1.00x   (the anchor)
  //   Z1  2 families                  0.64            1.60x   (crossed, near)
  //   Z1far  + duty 0.5 on B          0.52            1.30x   (recedes)
  //   Z0  A at stride 1 + B           0.88            2.20x   (contact accent)
  //   Z3  A at stride 2N + duty ramp  0.15            0.37x   (dissolves)
  // — every pitch at or above 1.2 x penWidth (C15), at most two directions at
  // default density (C14), and the ratios land on the spec's shape with the TOP
  // compressed rather than the bottom lifted (C16).
  const strideLadder = (sPen, penWidth) => {
    const floorSp = Math.max(0.05, PLOT_FLOOR_MULT * Math.max(0.05, penWidth));
    let N = 3;
    while (N > 1 && sPen / N < floorSp) N--;
    const master = Math.max(floorSp, sPen / N);
    return {
      master,
      floorSp,
      N,
      sBase: sPen,
      // The crossing families rule at the penumbra pitch, never at the floor.
      crossPitch: Math.max(floorSp, sPen),
      strideA: {
        // The contact accent is the ONE place family A steps down a rung on the
        // master grid; when N is 1 there is no rung to take and the collar is
        // carried by the crossed family alone (still a legible 1.6x).
        [Z_CONTACT]: 1,
        [Z_UMBRA]: N,
        [Z_PENUMBRA]: N,
        // C10 — Z3 keeps the SAME grid subset as Z2 and lightens purely by dash
        // duty. A stride change at the Z2/Z3 boundary is a phase break, which is
        // exactly the "abrupt tonal step" the outer margin must not have; duty is
        // continuous, so the two zones share every ruling and the transition can
        // only be read as a tone, never as a line.
        [Z_OUTER]: N,
      },
    };
  };

  // ── Tonal headroom ────────────────────────────────────────────────────────
  // A flat shadow at the default density already lays down ~50% ink. The contact
  // band wants to be ~4x that, and 4 x 50% is not "darker" — it is solid black,
  // and so is anything above ~2x. Stack a ladder on top of an already-dark base
  // and the top three rungs collapse into one flooded value; that is the same
  // trap the old layer model fell into from the other direction.
  //
  // So when zones are on, the ladder is scaled so its DARKEST rung lands just
  // below saturation and the rungs below it keep their RATIOS. Ratios, not
  // absolute values, are what read as an even tonal ladder (Weber), so the
  // penumbra lightening is the price of the contact band existing at all.
  // Perceived coverage composes as 1 - PROD(1 - c_i) because crossed families
  // overlap; treating it as additive would over-report and keep the base too dark.
  const SATURATION = 0.9;
  const perceivedCoverage = (spacings, penWidth) => {
    let clear = 1;
    spacings.forEach((s) => { clear *= 1 - clamp(penWidth / Math.max(penWidth, s), 0, 1); });
    return 1 - clear;
  };
  // Darkest zone = family A at stride 1 (the master pitch) + ONE crossed family
  // at the penumbra pitch. That is what Z0 actually emits at default density; a
  // third direction only joins when the master grid is coarse enough (N >= 3).
  const darkestCoverage = (sBase, penWidth) => {
    const l = strideLadder(sBase, penWidth);
    const fams = l.N >= 3 ? [l.master, l.crossPitch, l.crossPitch] : [l.master, l.crossPitch];
    return perceivedCoverage(fams, penWidth);
  };
  // Smallest scale >= 1 on sBase that brings the contact band under saturation.
  // Monotone in the scale, so a short bisection is exact enough and cannot loop.
  const headroomScale = (sBase, penWidth) => {
    if (darkestCoverage(sBase, penWidth) <= SATURATION) return 1;
    let lo = 1; let hi = 8;
    if (darkestCoverage(sBase * hi, penWidth) > SATURATION) return hi;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (darkestCoverage(sBase * mid, penWidth) > SATURATION) lo = mid; else hi = mid;
    }
    return hi;
  };

  // One hatch family over `rings`, phase-anchored to an ABSOLUTE origin (not the
  // ring bbox) so every zone and every region share one grid and the rulings never
  // shift as the footprint changes. Yields { i, a, b } with i the global ruling
  // index — the identity the stride ladder and the feather hash both key off.
  const familyRulings = (rings, angleDeg, spacing, out) => {
    const segs = ringsToSegs(rings);
    if (segs.length < 2) return;
    const ang = finite(angleDeg, 45) * Math.PI / 180;
    const dirX = Math.cos(ang); const dirY = Math.sin(ang);
    const perpX = -dirY; const perpY = dirX;
    let pMin = Infinity; let pMax = -Infinity;
    for (let i = 0; i < segs.length; i++) {
      for (let k = 0; k < 2; k++) {
        const pr = segs[i][k].x * perpX + segs[i][k].y * perpY;
        if (pr < pMin) pMin = pr;
        if (pr > pMax) pMax = pr;
      }
    }
    if (!Number.isFinite(pMin)) return;
    const sp = Math.max(0.05, spacing);
    const i0 = Math.ceil(pMin / sp);
    const i1 = Math.floor(pMax / sp);
    if (i1 - i0 > 6000) return; // pathological footprint: refuse rather than hang
    for (let idx = i0; idx <= i1; idx++) {
      const offset = idx * sp;
      const hits = [];
      for (let s = 0; s < segs.length; s++) {
        const a = segs[s][0]; const b = segs[s][1];
        const pa = a.x * perpX + a.y * perpY;
        const pb = b.x * perpX + b.y * perpY;
        if ((pa > offset) === (pb > offset)) continue;
        const t = (offset - pa) / ((pb - pa) || 1e-9);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        hits.push({ s: x * dirX + y * dirY, x, y });
      }
      hits.sort((p, q) => p.s - q.s);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        out.push({ i: idx, a: { x: hits[k].x, y: hits[k].y }, b: { x: hits[k + 1].x, y: hits[k + 1].y } });
      }
    }
  };

  // Walk one ruling, classify each sample by zone, and return contiguous
  // [s0, s1, zone] spans in the ruling's own arc-length parameter.
  const zoneSpans = (a, b, zoneAt, step) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > 1e-6)) return [];
    const n = Math.max(1, Math.ceil(len / step));
    const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
    const spans = [];
    let curZone = -1; let curStart = 0;
    for (let k = 0; k < n; k++) {
      const s = (k + 0.5) * (len / n);
      const z = zoneAt(a.x + ux * s, a.y + uy * s);
      if (z !== curZone) {
        if (curZone >= 0) spans.push([curStart, k * (len / n), curZone]);
        curZone = z; curStart = k * (len / n);
      }
    }
    if (curZone >= 0) spans.push([curStart, len, curZone]);
    return spans;
  };

  // Emit one family over one region, ruling-subset by zone.
  //
  // FEATHERING. Where two zones of DIFFERENT density meet, the shared cut is
  // displaced along the ruling by Δ = (hash(i, cutOrdinal) − 0.5)·1.4·bandWidth —
  // one Δ for both sides, so the spans stay adjacent (no gap, no overlap). Some
  // rulings from the denser zone poke into the sparser one and some stop short, so
  // the two interlace over a band instead of terminating on a common line. That is
  // what a burin does at a value transition; it costs no extra pen-up moves and it
  // is the only thing standing between Layers=4 and four concentric contours. The
  // contact/umbra cut is deliberately NOT feathered — a contact accent has a crisp
  // inner edge, and softening it reads as a mistake. At the footprint outline the
  // displacement is clamped negative (retract only) so feathering can stagger the
  // rim without throwing ink onto bare paper outside the shadow.
  const emitFamily = (opts) => {
    const {
      rings, angle, spacing, keepFor, zoneAt, fields, dashFor, sink,
      groundPlane, clipper, out, meta, treat, draft, familyId,
    } = opts;
    const rulings = [];
    familyRulings(rings, angle, spacing, rulings);
    if (!rulings.length) return;
    const sampleStep = Math.max(0.5, Math.min(2.5, spacing));
    const lines = [];
    rulings.forEach((r) => {
      const len = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
      if (!(len > MIN_RUN_MM)) return;
      const ux = (r.b.x - r.a.x) / len; const uy = (r.b.y - r.a.y) / len;
      const spans = zoneSpans(r.a, r.b, zoneAt, sampleStep);
      if (!spans.length) return;
      // Feather the internal cuts (shared endpoints), then the two rim ends.
      for (let c = 1; c < spans.length; c++) {
        const zL = spans[c - 1][2]; const zR = spans[c][2];
        if (zL === zR) continue;
        // Hard boundary: contact ↔ anything. Everything else interdigitates.
        if (zL === Z_CONTACT || zR === Z_CONTACT) continue;
        const mid = spans[c][0];
        const band = Math.max(1.2, 0.5 * fields.bandWidthAt(r.a.x + ux * mid, r.a.y + uy * mid));
        const d = (hash01(r.i * 131 + familyId, c) - 0.5) * 1.4 * band;
        const lo = spans[c - 1][0] + 0.2;
        const hi = spans[c][1] - 0.2;
        const shifted = Math.max(lo, Math.min(hi, mid + d));
        spans[c - 1][1] = shifted;
        spans[c][0] = shifted;
      }
      spans.forEach((sp, si) => {
        const zone = sp[2];
        const keep = keepFor(zone, r.i, (sp[0] + sp[1]) * 0.5, r);
        if (!keep) return;
        let s0 = sp[0]; let s1 = sp[1];
        // Rim retraction: stagger the outermost line ends inward so the footprint
        // outline stops being readable as an edge.
        if (si === 0) s0 += hash01(r.i * 977 + familyId, 7) * 1.2 * fields.rimFeather;
        if (si === spans.length - 1) s1 -= hash01(r.i * 977 + familyId, 9) * 1.2 * fields.rimFeather;
        if (!(s1 - s0 > MIN_RUN_MM)) return;
        const emit = (t0, t1) => {
          if (!(t1 - t0 > MIN_RUN_MM)) return;
          lines.push([
            { x: r.a.x + ux * t0, y: r.a.y + uy * t0 },
            { x: r.a.x + ux * t1, y: r.a.y + uy * t1 },
          ]);
        };
        // Dash duty: the outer penumbra breaks its rulings so the shadow dissolves
        // into paper rather than ending on a tone step.
        const duty = dashFor ? dashFor(zone, (s0 + s1) * 0.5, r) : 1;
        if (duty >= 0.999) { emit(s0, s1); return; }
        // Long dashes, not a dotted screen: the period is tied to the region, not
        // to the ruling pitch. Tying it to pitch turned every ruling into dozens
        // of fragments (100k+ paths on one shadow) and cost far more pen-up travel
        // than the tone was worth.
        const period = Math.max(4, spacing * 10);
        const jitter = hash01(r.i * 31 + familyId, 3) * period;
        for (let s = s0 - jitter; s < s1; s += period) {
          emit(Math.max(s0, s), Math.min(s1, s + period * duty));
        }
      });
    });
    if (lines.length) emitHatchLines(lines, groundPlane, clipper, out, meta, treat, draft);
    if (sink) sink.push(lines.length);
  };

  // Hatch a shadow polygon (rings = [outer, hole…]).
  //   layers off / draft / no fields → single flat hatch (the legacy path, and the
  //   Off compatibility contract — this must stay byte-identical);
  //   layers on → the zone anatomy above.
  const emitShadowRegion = (rings, groundPlane, clipper, out, meta, treat, draft, cfg) => {
    if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 3) return;
    const { angle, coverage, penWidth, layers, layerCount, falloff } = cfg;
    const sBase = coverageToSpacing(coverage, penWidth);
    const flat = () => emitHatchLines(hatchRingsEvenOdd(rings, angle, sBase), groundPlane, clipper, out, meta, treat, draft);
    if (!layers || draft) { flat(); return; }

    // Edge field excludes the rim that hugs the caster's body: the base of a
    // shadow is not an "edge" of it, and counting it would push the darkest zone
    // into the lightest one exactly where the contact band belongs.
    const contactSegs = (cfg.contactSegs && cfg.contactSegs.length) ? cfg.contactSegs : [];
    let contactWidth = contactWidthOf(contactSegs);
    const edgeSegs = ringsToSegs(rings).filter(([a, b]) => {
      if (!contactSegs.length) return true;
      const mx = (a.x + b.x) * 0.5; const my = (a.y + b.y) * 0.5;
      return distToSegs(mx, my, contactSegs) > contactWidth * 1.5;
    });
    const fields = buildShadowFields(rings, contactSegs, edgeSegs);
    if (!fields) { flat(); return; }

    const L = fields.L;
    // C3 as a hard clamp: the collar is an ACCENT and must stay thin relative to
    // the throw. A wide contact band is just a second umbra, and it is what makes
    // the dark end of the ladder flood.
    // `contactWidth` is a HALF-width (the collar reaches that far on BOTH sides
    // of the contact boundary), so C3's "width <= 12% of the throw" is a 0.06 L
    // clamp here. Clamping at 0.12 L drew a collar twice the allowed width and
    // was a large part of why the first cut read as a black worm.
    contactWidth = Math.min(contactWidth, 0.06 * L);
    // Penumbra retreat law. `shadowFalloff` is repurposed as SOFTNESS: at 0.2 the
    // umbra survives nearly to the tip (hard sun); at 1.0 it dies inside the first
    // third (broad source). The coefficient range is deliberately wide — the
    // wedge's length has to change VISIBLY across the slider or the control has
    // not earned its place.
    const soft = clamp(finite(falloff, 0.5), 0.2, 1);
    const k = 0.03 + 1.2 * soft;
    const w0 = Math.max(0.8, 0.02 * L, UMBRA_RIN * finite(fields.Rin, 0));
    const wAt = (t) => w0 + k * t * L;
    // The wedge also has to END, and `e > w(t)` alone does not end it. On a
    // COMPACT footprint (a low object, a short throw) w stays small everywhere,
    // so the umbra swallowed the whole shadow and Layers 3 emitted 2.3x the flat
    // shadow's ink — C11 blown, and the "retreating wedge" invisible because
    // there was nothing for it to retreat from. Terminating it at a softness-
    // driven throw fraction bounds the area AND gives C13 its lever: this is the
    // number the Softness slider actually moves.
    const tUmbraMax = clamp(1.05 - 0.75 * soft, 0.25, 0.95);

    const nZones = clamp(Math.round(finite(layerCount, 3)), 2, 4);
    const wantUmbra = nZones >= 3;
    const wantOuter = nZones >= 4;
    const contactOn = contactSegs.length > 0;
    const outerMargin = clamp(Math.min(0.05 * L, 0.30 * finite(fields.Rin, L)), 0.8, 5);

    const zoneAt = (x, y) => {
      const dc = fields.distContact(x, y);
      const t = L > 1e-6 ? dc / L : 0;
      if (contactOn && dc <= contactWidth) return Z_CONTACT;
      const e = fields.distEdge(x, y);
      const w = wAt(t);
      if (wantUmbra && t < tUmbraMax && e > w) return Z_UMBRA;
      // Z3 is a RIM band plus the far tail. Deriving its margin from w(t) — as
      // the first cut did — is a trap: w grows along the throw, so past mid-throw
      // "the outer w/3" is the entire local width and Z3 swallows the shadow
      // (Layers 4 lost 39% of its ink to it, blowing C11). The rim is a fixed
      // fraction of the THROW instead, which is what the eye reads it as.
      if (wantOuter && (e <= outerMargin || t > 0.9)) return Z_OUTER;
      return Z_PENUMBRA;
    };
    fields.bandWidthAt = (x, y) => {
      const t = L > 1e-6 ? fields.distContact(x, y) / L : 0;
      return clamp(wAt(t) * 0.45, 1.2, Math.max(1.2, L * 0.08));
    };
    fields.rimFeather = wantOuter ? clamp(L * 0.03, 0.8, 6) : 0;

    // C16: turning Layers ON must never make the penumbra weaker than the flat
    // shadow — that reads as "I enabled Layers and lost my shadow". So the
    // headroom scale is capped: when the ladder still cannot fit, the TOP is
    // compressed (fewer families, lower duty), never the bottom lifted.
    // The ladder needs a RUNG. When sBase/2 sits under the plot floor the master
    // grid collapses to N = 1, family A cannot step down for the contact accent,
    // and every zone rules at the flat shadow's own pitch — so Layers can only
    // ADD crossed families and the total climbs (2.3x the flat shadow on a
    // compact footprint). Buying N = 2 costs at most the same 1.25 the C16 cap
    // already budgets, so spend it there rather than leave the ladder flat.
    const floorSp = Math.max(0.05, PLOT_FLOOR_MULT * Math.max(0.05, penWidth));
    const rungScale = sBase > 1e-6 ? (2 * floorSp) / sBase : 1;
    const scale = clamp(Math.max(headroomScale(sBase, penWidth), rungScale), 1, 1.25);
    const ladder = strideLadder(sBase * scale, penWidth);
    const strideA = ladder.strideA;
    const crossPitch = ladder.crossPitch;
    // THIRD LEVER — dash duty. It can only ever LIGHTEN, and C16 pins the
    // penumbra at 0.8x the flat shadow, which the headroom cap already spends in
    // full. So duty is spent where it is free: thinning the crossed family along
    // the umbra's throw (the wedge has to get lighter as it recedes even before
    // it narrows — C6) and ramping the outer penumbra out to paper (C8). Family
    // A itself stays solid everywhere but Z3.
    const dutyLadder = { [Z_CONTACT]: 1, [Z_UMBRA]: 1, [Z_PENUMBRA]: 1 };
    const keepA = (zone, i) => {
      const st = strideA[zone] || 1;
      return st <= 1 || (((i % st) + st) % st) === 0;
    };
    const dashA = (zone, s, r) => {
      if (zone === Z_OUTER) {
        // C8 wants the outer margin at <= 0.55x the penumbra and visibly broken;
        // C11 wants the total not to collapse when Layers goes 3 -> 4. Duty ramps
        // 0.7 -> 0.3 across the throw: mean ~0.5x, inside C8, and roughly half the
        // ink loss a stride step would have cost.
        const t = L > 1e-6 ? fields.distContact(r.a.x, r.a.y) / L : 0;
        return clamp(0.75 - 0.4 * clamp(t, 0, 1), 0.35, 0.75);
      }
      return dutyLadder[zone] != null ? dutyLadder[zone] : 1;
    };

    const base = {
      rings, zoneAt, fields, groundPlane, clipper, out, treat, draft,
    };
    const zoneMeta = (zone) => {
      if (!meta.sceneTarget) return meta;
      return { ...meta, sceneTarget: { ...meta.sceneTarget, shadowLayer: zone } };
    };
    // Family A — the master grid. Every zone is a keep-every-k-th subset of it.
    emitFamily({
      ...base, angle, spacing: ladder.master, familyId: 0,
      keepFor: keepA, dashFor: dashA, meta: zoneMeta(Z_PENUMBRA),
    });
    // ONE crossed family at default density, ruling at the PENUMBRA pitch. It
    // covers the contact collar and the umbra wedge; the umbra's copy thins by
    // DASH DUTY along the throw (continuous, moire-free, plotter-native) rather
    // than by a second stride, which is what beat against family A into a dot
    // lattice in the first cut. A second crossed direction over a near-solid
    // collar reads as plaid, so +32 only joins when the master grid is coarse
    // enough (N >= 3) for three directions to stay visually separable.
    emitFamily({
      ...base, angle: angle + CROSS_B_DEG, spacing: crossPitch, familyId: 1,
      meta: zoneMeta(Z_CONTACT),
      dashFor: (zone, s, r) => {
        if (zone === Z_CONTACT) return 1;
        if (zone !== Z_UMBRA) return 0;
        // C6 — the wedge recedes in TONE as well as in width.
        const t = L > 1e-6 ? fields.distContact(r.a.x, r.a.y) / L : 0;
        return clamp(0.85 - 0.9 * clamp(t, 0, 1), 0.3, 0.85);
      },
      keepFor: (zone) => zone === Z_CONTACT || zone === Z_UMBRA,
    });
    if (contactOn && ladder.N >= 3) {
      emitFamily({
        ...base, angle: angle + CROSS_C_DEG, spacing: crossPitch, familyId: 2,
        meta: zoneMeta(Z_CONTACT),
        keepFor: (zone) => zone === Z_CONTACT,
      });
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
    const compose = (rings, casterId, penId, contactSegs) => {
      if (inverse) {
        if (groundFillSink) thinGroundFillInRings(groundFillSink, rings, invRemoveShare, invReplace, invAcc);
        return;
      }
      emitShadowRegion(rings, groundPlane, clipper, out,
        shadowMeta(rings, casterId, penFor(penId), groundDepth), shadowTreat, draftFrame,
        contactSegs && contactSegs.length ? { ...cfg, contactSegs } : cfg);
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
    // CONTACT SET — where the caster actually MEETS the ground, dropped straight
    // down (nadir) and camera-projected. Deliberately NOT the light projection:
    // ambient occlusion sits where the object meets the ground and does not move
    // when the sun does.
    //
    // Only points NEAR the ground contribute. Dropping the whole silhouette is
    // wrong for anything that is not a prism: a sphere's full nadir drop is its
    // entire equatorial disc, so the contact band would swallow the whole near
    // half of the shadow as one solid mass — which is exactly the flat blob this
    // work exists to remove, reintroduced from the other side. The near-ground
    // slice is also the physically right set: it is the region close enough to
    // occlude the ambient dome, which is what a contact shadow IS. For a resting
    // box that recovers the whole base; for a sphere, the small cap around the
    // tangent point.
    // CONTACT SET — PROXIMITY, not projection.
    //
    // The contact set is where the caster comes close enough to the ground to
    // occlude the ambient dome:  C = { p : minHeight(caster, p) <= h },
    // h = max(0.5, 0.03 * casterHeight). Projection is the wrong operator here:
    // a sphere touches at a POINT, but its nadir drop is the whole equatorial
    // disc, so a projection-based collar is one diameter across and swallows the
    // near half of the shadow — the flat blob this work exists to remove, back
    // from the other side. A prism is the only shape for which the two agree,
    // which is why a cube looked right and a sphere did not.
    //
    // C is carried as SEGMENTS (the caster's near-ground edges, dropped to y = 0
    // and camera-projected), never a convex hull: distance-to-segments is exact
    // for concave and ring-shaped bases, and the collar then hugs the BOUNDARY of
    // C rather than filling it. A resting box yields its base outline; a sphere,
    // the small ring around its tangent cap.
    const nadirContact = (record) => {
      const world = record.world || [];
      if (!world.length) return null;
      let minY = Infinity; let maxY = -Infinity;
      for (let i = 0; i < world.length; i++) {
        const P = world[i];
        if (!P || !Number.isFinite(P.y)) continue;
        if (P.y < minY) minY = P.y;
        if (P.y > maxY) maxY = P.y;
      }
      if (!Number.isFinite(minY)) return null;
      const base = Math.max(minY, 0);
      const drop = (P) => {
        const q = projectPoint(rotatePoint({ x: P.x, y: 0, z: P.z }, camAngles0), projOpts0);
        return (q && Number.isFinite(q.x) && Number.isFinite(q.y)) ? { x: q.x, y: q.y } : null;
      };
      // Widen the slice until the mesh actually resolves something inside it — a
      // coarse sphere can have no edge wholly within h of the ground.
      const h0 = Math.max(0.5, 0.03 * Math.max(0, maxY - minY));
      for (let pass = 0; pass < 5; pass++) {
        const cut = base + h0 * Math.pow(2, pass);
        const segs = [];
        const pts = [];
        (record.edges || []).forEach((edge) => {
          const A = world[edge.a]; const B = world[edge.b];
          if (!A || !B || !Number.isFinite(A.y) || !Number.isFinite(B.y)) return;
          if (A.y > cut || B.y > cut) return;
          const a = drop(A); const b = drop(B);
          if (a && b) { segs.push([a, b]); pts.push(a, b); }
        });
        if (segs.length) {
          const hull = convexHull(pts);
          return { segs, hull: hull.length >= 3 ? hull : null };
        }
      }
      // No edges resolved at all (point cloud / degenerate mesh): fall back to the
      // lowest vertices as a degenerate segment set so the band still appears.
      const cut = base + h0 * 8;
      const pts = [];
      for (let i = 0; i < world.length; i++) {
        const P = world[i];
        if (!P || !Number.isFinite(P.y) || P.y > cut || P.y < -1e-6) continue;
        const q = drop(P);
        if (q) pts.push(q);
      }
      if (pts.length < 2) return null;
      const segs = [];
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
      const hull = convexHull(pts);
      return { segs, hull: hull.length >= 3 ? hull : null };
    };

    const casters = [];
    (scene.objects || []).forEach((record) => {
      if (!record || record.isGround) return;
      if (!objectCasts(record.id)) return; // per-object cast toggle
      const hull = casterHull(record, projectVertex);
      if (!hull) return;
      const loops = casterSilhouetteLoops(record, projectVertex, lightClassifyEdges);
      const style = styleOf ? (styleOf(record.id) || {}) : {};
      casters.push({
        id: record.id, hull, loops, contact: nadirContact(record),
        penId: style.penId || null, classKey: style.penId || '',
      });
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

    // ── Occlusion collar (Layers ≥ 2 only) ────────────────────────────────────
    // A cast footprint only ever lies AWAY from the light, so on its own it can
    // never darken the lit side of the base — yet ambient occlusion does not care
    // where the sun is, and without ink on that side the object still floats. So
    // when zones are on, each class's footprint is unioned with a thin collar
    // dilated off the contact set (ground-clipped, own-body subtracted). The zone
    // field then classifies that collar as contact automatically — no separate
    // region pass, and the collar and the footprint share one master ruling grid.
    // Layers = Off skips this entirely: the Off render must not move.
    const MO = (Vectura.GeometryUtils && Vectura.GeometryUtils.miterOffsetClosedRing) || null;
    const collarFor = (cls) => {
      if (!shadowLayers || !MO) return [];
      const rings = [];
      cls.casterIds.forEach((id) => {
        const c = casters.find((k) => k.id === id);
        if (c && c.contact && c.contact.hull) rings.push(c.contact.hull);
      });
      if (!rings.length) return [];
      const grown = [];
      rings.forEach((ring) => {
        // The collar REGION only has to cover the band; the zone field decides
        // what is actually contact, so a convex grow of the near-ground set is
        // enough here even though the field itself uses exact segments.
        const w = Math.max(1.2, 0.12 * ringMinExtent(ring)) * 2;
        let ext = null;
        try { ext = MO(ring, w); } catch (_e) { ext = null; }
        const pts = (ext || []).filter(isFinitePt);
        if (pts.length >= 3) grown.push(FillBoolean.ringToMultiPolygon(pts));
      });
      if (!grown.length) return [];
      let geom = FillBoolean.union(...grown);
      geom = clipToGround(geom);
      cls.casterIds.forEach((id) => {
        const own = ownSilhouette(id);
        if (own.length && geom.length) geom = FillBoolean.difference(geom, own);
      });
      return geom || [];
    };

    classList.forEach((cls, i) => {
      let geom = cls.geom;
      const collar = collarFor(cls);
      if (collar.length) geom = geom && geom.length ? FillBoolean.union(geom, collar) : collar;
      if (!geom || !geom.length) return;
      // Subtract higher-precedence classes.
      for (let j = i + 1; j < classList.length; j++) {
        const higher = classList[j].geom;
        if (higher && higher.length) geom = FillBoolean.difference(geom, higher);
      }
      if (!geom || !geom.length) return;
      const casterId = cls.casterIds.size === 1 ? [...cls.casterIds][0] : null;
      const contactSegs = [];
      cls.casterIds.forEach((id) => {
        const c = casters.find((k) => k.id === id);
        if (c && c.contact) contactSegs.push(...c.contact.segs);
      });
      // One region per polygon (outer + holes) so even-odd keeps holes empty.
      geom.forEach((polygon) => {
        const rings = (polygon || [])
          .map((ring) => (ring || []).map((pt) => ({ x: pt[0], y: pt[1] })))
          .filter((ring) => ring.length >= 3);
        if (!rings.length) return;
        compose(rings, casterId, cls.penId, contactSegs);
      });
    });

    return finalize();
  };

  // Test seam: the ruling ladder is the thing C15 (plot-safe pitches) and the
  // whole density argument turn on, and it is not observable from the emitted
  // paths (a pitch shows up as a spacing only where two rulings both survive
  // clipping). Exposed read-only, prefixed so it reads as a seam, not API.
  const __ladderForTest = (sBase, penWidth) => strideLadder(sBase, penWidth);

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Shadows: { build, __ladderForTest } });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { build, __ladderForTest };
  }
})();
