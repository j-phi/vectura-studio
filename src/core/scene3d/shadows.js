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
  // Mirrors params.js DEFAULT_SHADOW.shadowToneDepth — defensive fallback only
  // (a caller that skips normalizeParams still degrades to the shipped value,
  // same convention as SHADOW_COVERAGE/SHADOW_ANGLE above).
  const SHADOW_TONE_DEPTH_DEFAULT = 0.75;
  // "No Tone" (fs-z2 Cycle 2) — the Stage-0 reference law (roster family
  // 'ref', laws: ['none']): the tone apparatus switched OFF. src/core/
  // scene3d/surface-fill.js's own `askedLaw === 'none'` reads the same way.
  const NO_TONE_LAW_ID = 'none';
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
  //
  // `spacing` is either the legacy NUMBER (uniform pitch, byte-identical to the
  // pre-gradient code below) or a FUNCTION `(x, y) => spacingMm` (fs-z2,
  // shadowToneDepth Stage 1.1 re-expression): the scan then marches the
  // perpendicular offset by a locally-varying step instead of a fixed one, so
  // tone becomes RULING SPACING — fewer, full-length lines near the far tip —
  // rather than chopping each ruling into keep/drop chunks (the fragmenting
  // defect this replaces). Every emitted line is still one unbroken hit-pair;
  // only the GAP between rulings changes. A function spacing may carry a
  // `.baseHint` (a representative numeric pitch) used only as a last-resort
  // fallback when a scanline misses the polygon entirely (nothing to sample).
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
    let dMin = Infinity; let dMax = -Infinity;
    segs.forEach(([a, b]) => {
      [a, b].forEach((pt) => {
        const pr = pt.x * perpX + pt.y * perpY;
        if (pr < pMin) pMin = pr;
        if (pr > pMax) pMax = pr;
        const dr = pt.x * dirX + pt.y * dirY;
        if (dr < dMin) dMin = dr;
        if (dr > dMax) dMax = dr;
      });
    });
    if (!Number.isFinite(pMin)) return [];
    const scanAt = (offset) => {
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
      return hits;
    };
    const out = [];
    if (typeof spacing === 'function') {
      const dMid = (Number.isFinite(dMin) && Number.isFinite(dMax)) ? (dMin + dMax) / 2 : 0;
      const MAX_ITERS = 4000;
      const stepAt = (offset, hits) => {
        let step = null;
        for (let k = 0; k + 1 < hits.length; k += 2) {
          const mx = (hits[k].x + hits[k + 1].x) / 2; const my = (hits[k].y + hits[k + 1].y) / 2;
          const sp = spacing(mx, my);
          if (Number.isFinite(sp) && (step == null || sp < step)) step = sp;
        }
        if (step == null) {
          // No hit at this offset (outside the footprint, or a hole) — sample
          // a reference point along the ruling direction so the march still
          // advances at a plausible pitch instead of stalling or guessing 0.
          const refX = perpX * offset + dirX * dMid;
          const refY = perpY * offset + dirY * dMid;
          const sp = spacing(refX, refY);
          step = Number.isFinite(sp) ? sp : (spacing.baseHint || 1);
        }
        return Math.max(0.05, step);
      };
      let offset = pMin + stepAt(pMin, scanAt(pMin));
      let iters = 0;
      while (offset <= pMax && iters < MAX_ITERS) {
        iters++;
        const hits = scanAt(offset);
        for (let k = 0; k + 1 < hits.length; k += 2) {
          out.push([{ x: hits[k].x, y: hits[k].y }, { x: hits[k + 1].x, y: hits[k + 1].y }]);
        }
        offset += stepAt(offset, hits);
      }
      return out;
    }
    const sp = Math.max(0.05, spacing);
    const count = Math.min(4000, Math.floor((pMax - pMin) / sp));
    for (let i = 1; i <= count; i++) {
      const offset = pMin + i * sp;
      const hits = scanAt(offset);
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

  // The OBJECT's own tone ladder — Regions.band + Regions.coverageFor, the same
  // pair surface-fill.js's coverageForSample calls — reused verbatim so the
  // shadow gradient (shadowToneDepth, below) is literally the object's ladder,
  // not a lookalike ramp. Returns null (not a guessed number) when Regions or a
  // usable ladder isn't loaded, so a caller can tell "no gradient available"
  // apart from "gradient computed to a low value".
  const ladderCoverageAt = (I, tone) => {
    const Regions = Vectura.Scene3D && Vectura.Scene3D.Regions;
    if (!Regions || typeof Regions.band !== 'function' || typeof Regions.coverageFor !== 'function') return null;
    const b = Regions.band(clamp(finite(I, 0), 0, 1), tone);
    return Regions.coverageFor(b, tone);
  };

  // ── Fill Style (tone-law mark class) on shadow hatch ────────────────────────
  // Scene3D face fills expose a Fill Style / tone-law picker: `style.params.
  // toneLaw`, one of 47 ids grouped into 8 perceptual MARK CLASSES (roster +
  // grouping owned by src/config/scene3d-tone-laws.js + src/config/context-
  // bar.js:94-141). Shadows had no such concept: every shadow was one family of
  // parallel rulings regardless of what toneLaw said elsewhere in the scene.
  // `shadowToneLaw` (params.js DEFAULT_SHADOW) closes that gap for the FLAT
  // hatch path — the single-family ground fill used whenever `shadowLayers` is
  // off (the default) or the zone-anatomy field build degrades (`emitShadow
  // Region`'s `flat()`). The Z_CONTACT..Z_OUTER zone-anatomy family system
  // above is deliberately UNTOUCHED: it is a separate, already-tuned apparatus
  // (see the "Shadow ANATOMY" block) and folding tone-law mark generation into
  // it is out of scope for this contract.
  //
  // Not every mark class is honest on a flat, ground-projected, coverage-driven
  // field — a shadow footprint carries a bearing + a coverage number, nothing
  // resembling a surface normal, curvature, or a solved direction field. See
  // `TONE_MARK_APPLICABLE` below for which classes get real, distinct geometry
  // and `toneLawApplies` for the predicate the UI is expected to gate its
  // picker on. A law whose class is NOT in that set still renders — it falls
  // back to plain parallel hatch — rather than silently doing nothing; that
  // fallback is a documented, deliberate degrade, not the bug this batch fixes
  // (which was toneLaw being accepted and having NO effect on ANY shadow, ever).
  const clampToneLawId = (value) => {
    const roster = Vectura.SCENE3D_TONE_LAWS || null;
    const R = (roster && roster.IDS) || null;
    // Same reasoning as params.js clampStyleParam('toneLaw') (fs-z2 Cycle 0):
    // the shipped default is deliberately NOT in the roster's IDS (context-
    // bar.js:162-164), so it must be accepted explicitly before the IDS
    // membership test — otherwise this is correct today only by coincidence
    // of its own fallback value being the same string.
    const DEF = (roster && roster.DEFAULT) || 'ladder';
    if (typeof value === 'string' && value === DEF) return DEF;
    return (typeof value === 'string' && (!R || R.indexOf(value) !== -1)) ? value : 'ladder';
  };
  // markClass lookup is owned by src/config/context-bar.js (Vectura.SCENE_
  // FILL_STYLES.markClass) — the one roster→mark-class map every consumer (the
  // UI picker, this file) must share, never duplicated. Absent (a bare test
  // process, or a stripped runtime) degrades to 'hatch': the shipped default
  // ('ladder') IS 'hatch', so that fallback is byte-identical on a stock scene.
  const toneLawMarkClass = (lawId) => {
    const SFS = Vectura.SCENE_FILL_STYLES;
    if (SFS && typeof SFS.markClass === 'function') {
      const mc = SFS.markClass(lawId);
      if (typeof mc === 'string' && mc) return mc;
    }
    return 'hatch';
  };
  // Mark classes judged genuinely meaningful on a flat coverage-driven field:
  //   ref   — "no tone, one pitch/weight" IS what the flat hatch already is.
  //   hatch — one family of parallel rulings: the literal existing mechanism.
  //   cross — crosshatching is a purely 2D density technique (two ruled
  //           families), no surface normal/curvature involved anywhere.
  //   wave  — a lateral sinusoid on a ruling is a 2D perturbation of the line
  //           geometry only; needs no body parameterization.
  //   dash  — duty-cycle breaks of a ruling are exactly what the zone-anatomy
  //           outer-penumbra dash logic above already does; purely geometric.
  //   dot   — stipple/flick placement over an area needs only an inside/outside
  //           test against the footprint rings (`pointInRingsEvenOdd`, already
  //           used by the I26 inverse-mode code above).
  // Excluded:
  //   flow  — flow lines follow a direction FIELD solved over a body's surface
  //           parameterization/curvature. A flat ground projection carries no
  //           such field (only a bearing + a coverage number), so "flow" would
  //           just redraw 'hatch' under a different name — not honest.
  //   web   — space-filling networks (maze / voronoi / TSP tour) solve a full
  //           2D domain-filling problem; that is surface-fill.js's own
  //           standalone engine, not something this file's coverage-only
  //           contract can reproduce honestly without duplicating it.
  const TONE_MARK_APPLICABLE = new Set(['ref', 'hatch', 'cross', 'wave', 'dash', 'dot']);
  // Per-id narrowing (option (b) of the fs-n2 batch) ON TOP OF the mark-class
  // gate above. `isophoteWidth`'s own mechanism is "stroke thickness = image-
  // space distance from the sample to the chosen ISOPHOTE, d = (I_iso - I) /
  // |grad I|" — a per-point luminance-GRADIENT quantity. Every other law that
  // shares the 'hatch' class reduces its own spatially-varying input (a local
  // grey, a facing ratio, a coverage schedule) to the ONE global coverage
  // scalar this flat, single-family shadow hatch actually carries, and that
  // reduction still says something real (see HATCH_LAW_RECIPES below).
  // isophoteWidth's input is a GRADIENT, and a single scalar has no gradient —
  // there is nothing to substitute it with that is not simply invented, so
  // this is the one id judged to have nothing honest to express here (option
  // (b): narrow the roster) rather than option (a).
  //
  // `onePenDown` (fs-t1): its own mechanism text is explicit that the bridge
  // between rulings is built IN THE CHART and walked sample-by-sample against
  // the actual surface (`sampleAt`, on-surface + front-facing checks) — see
  // surface-fill.js's "'onePenDown' — ONE CONTINUOUS PATH OVER THE WHOLE
  // FORM" block, which spells out the reason directly: "a straight segment
  // in (a, b)… sampled, with every sample required to be on the surface and
  // front-facing… never a chord across the silhouette, WHICH IS WHAT A
  // SCREEN-SPACE LINK WOULD BE on a convex limb." A cast shadow's footprint
  // has no chart and no `sampleAt` to walk — it is already flat screen-space
  // rings, exactly the case that quote names as unsafe. Bridging there could
  // only be a straight screen-space link (an invented technique, not this
  // law's own verified-on-the-surface one), so — like isophoteWidth — this is
  // narrowed rather than given fabricated geometry.
  const TONE_LAW_NOT_DISTINGUISHABLE = new Set(['isophoteWidth', 'onePenDown']);
  // Exported predicate (see tail of file): lets the UI hide toneLaw options
  // whose mark class does not change shadow geometry, instead of offering a
  // choice that quietly does nothing.
  const toneLawApplies = (lawId) =>
    TONE_MARK_APPLICABLE.has(toneLawMarkClass(lawId)) && !TONE_LAW_NOT_DISTINGUISHABLE.has(lawId);

  // Exported predicate #2 (fs-q1) — lets the UI hide the ENTIRE Fill Style row
  // (not just narrow its options, as toneLawApplies does) when Shadow Layers
  // routes every caster onto the zone-anatomy path (see emitShadowRegion
  // below), where toneLaw is read once but the zone build never receives the
  // mark class — a diagnosed, deliberately out-of-scope gap (folding toneLaw
  // into that already-tuned pipeline is a large, separate change).
  //
  // Empirically verified (fs-q1 probe, 6 scenarios incl. a mixed light set and
  // a 1mm/extreme-range degenerate caster): the flat-vs-zone fork is exactly
  // `!layers || draft` where `layers = shadowBag.shadowLayers === true ||
  // light.type === 'area'` (see `isArea` below, ~line 1941 at time of writing —
  // AREA lights force the softer zone build even with the Layers TOGGLE off).
  // `draft` is a transient interaction-time render mode, not a settled UI
  // state, so this predicate ignores it — a row shown here is live at rest; it
  // may ALSO be live for one extra frame mid-drag, never the reverse. The
  // buildShadowFields-null degenerate fallback (a zero-area footprint bbox) is
  // real in the code but was not reproducible with any tested real caster
  // geometry, so it is documented rather than modeled.
  // FAILURE MODE: in that unreached degenerate case the row would read hidden
  // while the control briefly still worked — an over-hide, never a lie the
  // other way (a shown row is always genuinely live at rest).
  //
  // Scene-wide (one row covers every light): shown when AT LEAST ONE
  // shadow-casting light is NOT on the zone-anatomy path, since hiding then
  // would remove real control over that light's shadow. No shadow-casting
  // light at all → nothing to prove inert → default to shown.
  const shadowFillStyleApplies = (shadowBag, lights) => {
    const casters = (Array.isArray(lights) ? lights : [])
      .filter((l) => l && l.type !== 'ambient' && l.castShadows !== false);
    if (!casters.length) return true;
    const explicitLayers = !!(shadowBag && shadowBag.shadowLayers === true);
    return casters.some((l) => !(explicitLayers || l.type === 'area'));
  };

  const CROSS_MARK_DEG = 60;      // avoid a 90° square-grid moiré (mirrors CROSS_B_DEG's reasoning above)
  const CROSS_MARK_SPACING_MULT = 1.5; // wider pitch per crossed family so total ink stays comparable to plain hatch
  const DASH_PERIOD_MULT = 6;     // dash period scales with the ruling pitch, not a fixed screen-space stipple
  const DASH_DUTY = 0.5;
  const DOT_FLICK_LEN_MULT = 2.5; // a "dot" is drawn as a short flick — a bare vertex would fail MIN_RUN_MM below
  const WAVE_STEP_MM = 2.5;
  const WAVE_WAVELEN_MM = 7;

  // dash: break one ruling segment into fixed-duty dashes.
  const dashSegment = (a, b, period, duty) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > MIN_RUN_MM)) return [];
    const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
    const out = [];
    for (let s = 0; s < len; s += period) {
      const e = Math.min(len, s + period * duty);
      if (e - s > MIN_RUN_MM) {
        out.push([{ x: a.x + ux * s, y: a.y + uy * s }, { x: a.x + ux * e, y: a.y + uy * e }]);
      }
    }
    return out;
  };

  // wave: resample one ruling segment into a polyline carrying a lateral
  // sinusoid. Amplitude is capped to a fraction of the pitch so neighbouring
  // rulings cannot cross (a wavy hatch that self-intersects reads as noise).
  // `opts` (fs-n2 — see WAVE_LAW_RECIPES) lets a specific law id bend the
  // waveform (amplitude/wavelength scale, phase, a triangle profile for
  // "scribble", a light second harmonic for a trochoid's looping crests)
  // without duplicating the resampling loop per law.
  const waveSegment = (a, b, spacing, opts) => {
    const o = opts || {};
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!(len > MIN_RUN_MM)) return null;
    const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
    const px = -uy; const py = ux;
    const amp = clamp((o.ampMult || 1) * 0.3 * spacing, 0.15, 2.2);
    const wavelen = Math.max(2, WAVE_WAVELEN_MM * (o.wavelenMult || 1));
    const phase = o.phase || 0;
    const n = Math.max(2, Math.ceil(len / WAVE_STEP_MM));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * len;
      const theta = (2 * Math.PI * s) / wavelen + phase;
      let off = o.triangle ? amp * (2 / Math.PI) * Math.asin(Math.sin(theta)) : amp * Math.sin(theta);
      if (o.secondHarmonic) off += amp * 0.35 * Math.sin(2 * theta + phase * 1.7);
      pts.push({ x: a.x + ux * s + px * off, y: a.y + uy * s + py * off });
    }
    return pts;
  };

  // dot: a jittered lattice over the footprint's bounding box, kept where the
  // jittered sample lands inside the rings (even-odd — holes stay empty, same
  // test the I26 inverse mode uses). Each kept sample becomes a short FLICK
  // rather than a bare point: `emitHatchLines` drops any run under MIN_RUN_MM,
  // so a true zero-length dot would be silently discarded downstream. The cell
  // count is capped exactly like `buildShadowFields`'s lattice above — a huge,
  // grazing-light footprint at a fine density must degrade, never hang.
  // `opts` (fs-n2 — see DOT_LAW_RECIPES) scales pitch/flick-length/jitter so
  // "lozengeStipple"/"penStipple" read as distinct stipple textures from the
  // base dot screen instead of the same lattice under a different name.
  const dotMarks = (rings, spacing, opts) => {
    const o = opts || {};
    const box = ringsBBox([rings]);
    if (!box) return [];
    const MAX_CELLS = 20000;
    let pitch = Math.max(0.6, spacing * (o.pitchMult || 1));
    const w = Math.max(1e-6, box.maxX - box.minX);
    const h = Math.max(1e-6, box.maxY - box.minY);
    while (((w / pitch) + 1) * ((h / pitch) + 1) > MAX_CELLS) pitch *= 1.5;
    const flickLen = MIN_RUN_MM * DOT_FLICK_LEN_MULT * (o.flickLenMult || 1);
    const jitterMult = o.jitterMult || 1;
    const out = [];
    let row = 0;
    for (let y = box.minY; y <= box.maxY; y += pitch) {
      const jx = (hash01(row, 11) - 0.5) * pitch * 0.6 * jitterMult;
      const jy = (hash01(row, 13) - 0.5) * pitch * 0.3 * jitterMult;
      let col = 0;
      for (let x = box.minX; x <= box.maxX; x += pitch) {
        const key = row * 977 + col;
        const px = x + jx + (hash01(key, 17) - 0.5) * pitch * 0.4 * jitterMult;
        const py = y + jy + (hash01(key, 19) - 0.5) * pitch * 0.4 * jitterMult;
        if (pointInRingsEvenOdd(rings, px, py)) {
          const ang = hash01(key, 23) * Math.PI;
          const hl = flickLen / 2;
          out.push([
            { x: px - Math.cos(ang) * hl, y: py - Math.sin(ang) * hl },
            { x: px + Math.cos(ang) * hl, y: py + Math.sin(ang) * hl },
          ]);
        }
        col += 1;
      }
      row += 1;
    }
    return out;
  };

  // ── fs-n2 Stage 1 — per-law-id variation within a shared mark class ────────
  // `shadowMarkLines` used to dispatch on MARK CLASS ONLY: every id sharing a
  // class (23 of the roster's 47 share 'hatch' alone) rendered byte-identical
  // geometry, so the picker offered dozens of options that were secretly the
  // same picture (see the file-header comment block above `clampToneLawId`
  // for the measured counts). These three generic transforms — and the small
  // per-id constant tables below them — give each OFFERED id (every id
  // `toneLawApplies` accepts) its own real geometry, keyed off the law's own
  // curated `mechanism` text (`src/config/scene3d-tone-laws.js`) wherever that
  // text describes something expressible on a flat, single-coverage-scalar
  // shadow footprint. Where a law's own text reduces to a global constant
  // here (a "local grey" or "facing ratio" that does not vary across a flat
  // projection), the constant is still used honestly — it is not invented,
  // it is the law's own quantity evaluated on the one input this footprint
  // actually has. `'ladder'` (the shipped default) is deliberately NEVER
  // routed through any of these — it stays the literal, unwrapped
  // `hatchRingsEvenOdd` call so the Off/draft byte-identical compatibility
  // contract (`emitShadowRegion`'s comment, and the REGRESSION test in
  // `tests/unit/scene3d-shadow-tone-law.test.js`) is untouched.

  // `spacing` may now be the legacy number or a graded (x,y)=>mm function (see
  // hatchRingsEvenOdd). These two helpers let every recipe below keep doing
  // plain arithmetic on it either way, so the fs-z2 spacing-gradient reaches
  // every hatch/cross recipe for free instead of just the unwrapped default.
  const scaleSpacing = (spacing, mult) => {
    const m = mult || 1;
    if (typeof spacing !== 'function') return spacing * m;
    const fn = (x, y) => spacing(x, y) * m;
    fn.baseHint = (spacing.baseHint != null ? spacing.baseHint : 1) * m;
    return fn;
  };
  const numericHint = (spacing) => (typeof spacing === 'function'
    ? (spacing.baseHint != null ? spacing.baseHint : 1)
    : spacing);

  // hatch family: an angle nudge + a spacing multiplier. Cheap, but each
  // combination below is chosen so no two ids land on the same (angle, mult)
  // pair, and none lands on (0, 1) — the untouched 'ladder' baseline.
  const hatchOffset = (rings, angleDeg, spacing, angleNudgeDeg, spacingMult) =>
    hatchRingsEvenOdd(rings, angleDeg + (angleNudgeDeg || 0), scaleSpacing(spacing, spacingMult));

  // "bundle"/"three-pen" families: N adjacent passes of the same ruling,
  // offset a fraction of a pitch apart — apparent weight from PHYSICAL
  // REPETITION, exactly as bundleCount/penInterleave's own mechanism text
  // describes ("a heavier pen or a doubled pass"), not a fabricated width.
  const hatchDoublePass = (rings, angleDeg, spacing, opts) => {
    const o = opts || {};
    const passes = Math.max(1, o.passes || 2);
    const passSpacingMult = o.passSpacingMult || 0.3;
    const base = hatchRingsEvenOdd(rings, angleDeg + (o.angleNudgeDeg || 0), spacing);
    const ang = ((angleDeg + (o.angleNudgeDeg || 0)) * Math.PI) / 180;
    const perpX = -Math.sin(ang); const perpY = Math.cos(ang);
    const out = [];
    for (let k = 0; k < passes; k++) {
      const jitter = o.jitterMm ? (hash01(k, 29) - 0.5) * o.jitterMm : 0;
      const off = (k - (passes - 1) / 2) * numericHint(spacing) * passSpacingMult + jitter;
      base.forEach(([a, b]) => out.push([
        { x: a.x + perpX * off, y: a.y + perpY * off },
        { x: b.x + perpX * off, y: b.y + perpY * off },
      ]));
    }
    return out;
  };

  // "width"/"mono" end-treatment families: trim a fraction off both ends of
  // every ruling. Matches taperedEnds/endShorten's own "pull the ends back"
  // mechanism directly — no width channel is invented, only end position.
  const hatchEndTrim = (lines, trimFrac) => {
    const t = clamp(trimFrac, 0, 0.45);
    const out = [];
    lines.forEach(([a, b]) => {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(len > MIN_RUN_MM * 2)) return;
      const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
      const na = { x: a.x + ux * len * t, y: a.y + uy * len * t };
      const nb = { x: b.x - ux * len * t, y: b.y - uy * len * t };
      if (Math.hypot(nb.x - na.x, nb.y - na.y) > MIN_RUN_MM) out.push([na, nb]);
    });
    return out;
  };

  // nibAngle: width = w·|sin(theta_stroke - theta_nib)| is a per-DIRECTION
  // quantity; a flat single-family hatch has exactly one ruling direction, so
  // the formula evaluates to one scalar for the whole footprint. Reused here
  // as an angle nudge (never a fabricated width channel), with a floor so it
  // can never land on 0 (colliding with the untouched 'ladder' baseline) for
  // any scene angle. Non-1 spacing mult additionally guards that collision.
  const nibAngleNudge = (angleDeg) => 2.5 + 4 * Math.sin(((angleDeg - 45) * Math.PI) / 180);

  // hatch-class recipes. Every id `toneLawApplies` currently accepts under
  // 'hatch' (23 of the 47, minus isophoteWidth — see TONE_LAW_NOT_
  // DISTINGUISHABLE above) has an entry; an id without one falls back to the
  // plain hatch (the same degrade an inapplicable class already gets).
  // `'ladder'` (the shipped default) is deliberately absent from this table —
  // it must always take the fallback (unwrapped `hatchRingsEvenOdd`), never a
  // recipe. `none` ('ref' class — its own text: "one pitch, one weight...
  // nothing modulating it") is genuinely the SAME idea as plain hatch, but
  // still needs a real, non-zero, non-1x nudge here so it does not render
  // byte-identical to 'ladder' — the acceptance bar this batch exists to
  // satisfy is "no two OFFERED options collide," not "every option must look
  // different from every other," and 'none' vs 'ladder' is the one pair
  // where that tension is real. The nudge is intentionally too small to read
  // as a different texture.
  const HATCH_LAW_RECIPES = {
    none: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 3, 1),
    // width family — see per-recipe comments for how each reduces its own
    // curvature/local-grey input to this footprint's one coverage scalar.
    nibAngle: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, nibAngleNudge(angleDeg), 1.02),
    taperedEnds: (rings, angleDeg, spacing) => hatchEndTrim(hatchRingsEvenOdd(rings, angleDeg, spacing), 0.06),
    weightModulated: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 2, passSpacingMult: 0.28 }),
    whiteBand: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 2, passSpacingMult: 0.5 }),
    weightSmoothstep: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 2, passSpacingMult: 0.34, angleNudgeDeg: 0.6 }),
    // ladder family — coverage-driven rung selection, at a finer/phase-
    // shifted/perceptually-remapped rung than the shipped default.
    fineLadder: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 0, 0.97),
    phaseFineLadder: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 1.2, 0.97),
    perceptualRamp: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 0, 1.05),
    // bundle family — adjacent-pass repetition, per-id pass count/pitch/end
    // treatment straight out of each law's own mechanism text.
    bundleCount: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 3, passSpacingMult: 0.3 }),
    bundleSubNib: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 4, passSpacingMult: 0.2 }),
    bundleEased: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 3, passSpacingMult: 0.22 }),
    bundleDither: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 3, passSpacingMult: 0.3, jitterMm: numericHint(spacing) * 0.15 }),
    bundleLozenge: (rings, angleDeg, spacing) => hatchEndTrim(hatchDoublePass(rings, angleDeg, spacing, { passes: 3, passSpacingMult: 0.3 }), 0.08),
    bundleHandoff: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 2, passSpacingMult: 0.3, angleNudgeDeg: 0.8 }),
    // continuous-spacing-field family — the field is one constant on a flat
    // shadow, so it is expressed as a distinct constant pitch/skew per id.
    contFieldSigmoid: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 0, 1.08),
    contFieldTouch: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 0, 0.85),
    contFieldFore: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 1.6, 1),
    contFieldSurface: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, -1.6, 1.12),
    contFieldQuant: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 0, 0.93),
    // three-pen family (the hatch-mark-class subset — penCross/penReserve are
    // 'cross', penStipple is 'dot') — penInterleave's "alternating nib" is a
    // 2-pass bundle; the other two are pitch/facing constants.
    penInterleave: (rings, angleDeg, spacing) => hatchDoublePass(rings, angleDeg, spacing, { passes: 2, passSpacingMult: 0.45 }),
    penPitchMatch: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 0, 1.15),
    penFacing: (rings, angleDeg, spacing) => hatchOffset(rings, angleDeg, spacing, 2.4, 1),
    // mono family (hatch subset) — endShorten's own text is literally an end
    // treatment, at a heavier fraction than taperedEnds's soft taper.
    endShorten: (rings, angleDeg, spacing) => hatchEndTrim(hatchRingsEvenOdd(rings, angleDeg, spacing), 0.14),
  };

  // cross-class recipes. penCross keeps the original single-cross
  // implementation (the class's long-standing representative, and what the
  // HEADLINE regression test already pins against 'ladder').
  //
  // fs-z2 Cycle 3 (Defect 1): every recipe below used raw `spacing * N`
  // arithmetic, which is only valid for the legacy NUMBER form — multiplying
  // a graded `(x,y)=>mm` FUNCTION by a number produces NaN, so
  // `hatchRingsEvenOdd` fell through its `typeof spacing === 'function'`
  // branch never, and every cross ruling kept being emitted at the uniform
  // legacy pitch while the flat-path caller separately chunked the result
  // via `applyShadowToneGradient` — the exact fragmentation this batch
  // retires. `scaleSpacing` (above, already built for this) multiplies
  // either form correctly, so grading now reaches every cross recipe too.
  const crossBase = (rings, angleDeg, spacing) => {
    const spCross = scaleSpacing(spacing, CROSS_MARK_SPACING_MULT);
    return hatchRingsEvenOdd(rings, angleDeg, spCross)
      .concat(hatchRingsEvenOdd(rings, angleDeg + CROSS_MARK_DEG, spCross));
  };
  const CROSS_LAW_RECIPES = {
    penCross: crossBase,
    // penReserve: a broad primary family plus a much sparser TRANSVERSE
    // (90°) reserve-cut family, matching "white reserves cut transverse to
    // the ruling" directly instead of the 60°/1.5x cross penCross already
    // stands for.
    penReserve: (rings, angleDeg, spacing) => hatchRingsEvenOdd(rings, angleDeg, spacing)
      .concat(hatchRingsEvenOdd(rings, angleDeg + 90, scaleSpacing(spacing, 3))),
    // mezzoRegion: "no global direction anywhere" — three sparse families at
    // angles spread >=30° apart rather than one dominant cross, standing in
    // for the blue-noise per-region angle scatter its full mechanism uses.
    mezzoRegion: (rings, angleDeg, spacing) => hatchRingsEvenOdd(rings, angleDeg, scaleSpacing(spacing, 2.2))
      .concat(hatchRingsEvenOdd(rings, angleDeg + 31, scaleSpacing(spacing, 2.6)))
      .concat(hatchRingsEvenOdd(rings, angleDeg + 64, scaleSpacing(spacing, 3.1))),
  };

  // wave-class recipes, via the parametrized `waveSegment` above. `waveSegment`
  // itself takes a NUMERIC spacing (it uses it arithmetically for amplitude —
  // `amp = ampMult * 0.3 * spacing` — and the task is explicit that grading
  // must widen ruling PITCH only, never touch amplitude), so every call below
  // passes `numericHint(spacing)` to it while `hatchRingsEvenOdd` still gets
  // the real (possibly graded) `spacing` for pitch. Before this fix these
  // passed `spacing` straight through to `waveSegment`, which produced NaN
  // amplitudes whenever spacing was a function and silently discarded every
  // wave mark (`waveSegment` returns null below MIN_RUN_MM / non-finite amp
  // corrupts every point) — the class fell back to the (invisible) empty
  // array rather than a fixed pitch, worse than the cross case above.
  const waveBase = (rings, angleDeg, spacing, opts) => hatchRingsEvenOdd(rings, angleDeg, spacing)
    .map(([a, b]) => waveSegment(a, b, numericHint(spacing), opts))
    .filter(Boolean);
  const WAVE_LAW_RECIPES = {
    // amplitudeOnly: "the control experiment for the whole wave family" — the
    // plain sinusoid, unmodified.
    amplitudeOnly: (rings, angleDeg, spacing) => waveBase(rings, angleDeg, spacing, {}),
    ampSpacing: (rings, angleDeg, spacing) => waveBase(rings, angleDeg, spacing, { ampMult: 0.85, wavelenMult: 1.25 }),
    // weaveDepth: a nested (anti-phase) pair of waves — two calls appended
    // rather than one.
    weaveDepth: (rings, angleDeg, spacing) => hatchRingsEvenOdd(rings, angleDeg, spacing)
      .flatMap(([a, b]) => [waveSegment(a, b, numericHint(spacing), { ampMult: 0.6, phase: 0 }), waveSegment(a, b, numericHint(spacing), { ampMult: 0.6, phase: Math.PI })])
      .filter(Boolean),
    // interlockWeave: neighbouring rulings alternate phase (even/odd index)
    // instead of overlaying two families on the same ruling.
    interlockWeave: (rings, angleDeg, spacing) => hatchRingsEvenOdd(rings, angleDeg, spacing)
      .map(([a, b], i) => waveSegment(a, b, numericHint(spacing), { ampMult: 0.75, wavelenMult: 0.9, phase: (i % 2) ? Math.PI : 0 }))
      .filter(Boolean),
    trochoidLoop: (rings, angleDeg, spacing) => waveBase(rings, angleDeg, spacing, { ampMult: 1.1, wavelenMult: 0.55, secondHarmonic: true }),
    mkScribble: (rings, angleDeg, spacing) => waveBase(rings, angleDeg, spacing, { ampMult: 1.2, wavelenMult: 0.7, triangle: true }),
  };

  // dash-class recipes.
  const DASH_LAW_RECIPES = {
    // dutyConst: "the period is fixed... duty runs" — the original constant-
    // duty dash, unmodified.
    dutyConst: (rings, angleDeg, spacing) => {
      const period = Math.max(spacing * DASH_PERIOD_MULT, 2 * MIN_RUN_MM);
      const out = [];
      hatchRingsEvenOdd(rings, angleDeg, spacing).forEach(([a, b]) => {
        dashSegment(a, b, period, DASH_DUTY).forEach((seg) => out.push(seg));
      });
      return out;
    },
    // mkTick: "short dashes drawn PERPENDICULAR to the ruling" — a comb of
    // cross-ticks along each ruling, not a broken ruling.
    mkTick: (rings, angleDeg, spacing) => {
      const period = Math.max(spacing * 3, 2 * MIN_RUN_MM);
      const tickLen = Math.max(spacing * 0.8, MIN_RUN_MM * 1.5);
      const out = [];
      hatchRingsEvenOdd(rings, angleDeg, spacing).forEach(([a, b]) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(len > MIN_RUN_MM)) return;
        const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
        const px = -uy; const py = ux;
        for (let s = 0; s < len; s += period) {
          const cx = a.x + ux * s; const cy = a.y + uy * s;
          out.push([
            { x: cx - px * tickLen / 2, y: cy - py * tickLen / 2 },
            { x: cx + px * tickLen / 2, y: cy + py * tickLen / 2 },
          ]);
        }
      });
      return out;
    },
    // mkDashRamp: "only the mark's own extent changes" as tone ramps — duty
    // ramps continuously along each ruling instead of holding constant.
    mkDashRamp: (rings, angleDeg, spacing) => {
      const period = Math.max(spacing * DASH_PERIOD_MULT, 2 * MIN_RUN_MM);
      const out = [];
      hatchRingsEvenOdd(rings, angleDeg, spacing).forEach(([a, b]) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(len > MIN_RUN_MM)) return;
        const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
        for (let s = 0; s < len; s += period) {
          const duty = 0.2 + 0.7 * (s / len);
          const e = Math.min(len, s + period * duty);
          if (e - s > MIN_RUN_MM) out.push([{ x: a.x + ux * s, y: a.y + uy * s }, { x: a.x + ux * e, y: a.y + uy * e }]);
        }
      });
      return out;
    },
  };

  // dot-class recipes, via the parametrized `dotMarks` above.
  const DOT_LAW_RECIPES = {
    // mkDotScreen: the original dot lattice, unmodified.
    mkDotScreen: (rings, angleDeg, spacing) => dotMarks(rings, spacing),
    // lozengeStipple: "thickening toward the shadow" — a denser lattice of
    // longer flicks.
    lozengeStipple: (rings, angleDeg, spacing) => dotMarks(rings, spacing, { pitchMult: 0.75, flickLenMult: 1.6, jitterMult: 0.5 }),
    // penStipple: "the fine nib stippling... by shortening its marks" — a
    // sparser lattice of short, more jittered flicks.
    penStipple: (rings, angleDeg, spacing) => dotMarks(rings, spacing, { pitchMult: 1.3, flickLenMult: 0.5, jitterMult: 1.4 }),
  };

  // The chokepoint: rings + the shadow's own hatch angle/spacing (exactly what
  // the flat hatch already computes) + the resolved mark class + the raw law
  // id → an array of polylines in the SAME shape `hatchRingsEvenOdd` returns
  // ([[a,b], …] or, for 'wave'/'dot', longer/short polylines), ready for the
  // unchanged `emitHatchLines`. `lawId` selects a per-id recipe within the
  // class (see the *_LAW_RECIPES tables above); an id with no recipe —
  // including `'ladder'`, which must never get one — falls back to the plain
  // per-class base, exactly as before this batch.
  const shadowMarkLines = (rings, angleDeg, spacing, markClass, lawId) => {
    switch (markClass) {
      case 'cross':
        return (CROSS_LAW_RECIPES[lawId] || crossBase)(rings, angleDeg, spacing);
      case 'dash':
        return (DASH_LAW_RECIPES[lawId] || DASH_LAW_RECIPES.dutyConst)(rings, angleDeg, spacing);
      case 'dot':
        return (DOT_LAW_RECIPES[lawId] || DOT_LAW_RECIPES.mkDotScreen)(rings, angleDeg, spacing);
      case 'wave':
        return (WAVE_LAW_RECIPES[lawId] || WAVE_LAW_RECIPES.amplitudeOnly)(rings, angleDeg, spacing);
      case 'ref':
      case 'hatch':
      default:
        return (HATCH_LAW_RECIPES[lawId] || hatchRingsEvenOdd)(rings, angleDeg, spacing);
    }
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
  // decreasing rounds" being asked for, and `shadowFalloff` — relabelled
  // **Softness** in the UI — now drives k. It no longer means "density drop per
  // layer"; that lever was deleted by the fixed integer ladder of §2.3.
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
  //
  // fs-z3 (item 3). Scaled off the RING'S OWN minor extent, this degenerates to
  // its 1.2mm floor on any round caster: a sphere's near-ground slice projects
  // to a thin annulus (e.g. 13.17 x 4.51mm), so 0.12 x 4.51 = 0.54mm never beats
  // the floor — the collar occupied only ~6% of the shadow's area regardless of
  // caster size, and its share FELL as the caster grew (10.3% -> 6.2% -> 4.0% ->
  // 4.0% across r10/20/46/92). The contact ring's minor extent is degenerate BY
  // CONSTRUCTION for anything that is not a prism (see nadirContact's own
  // comment), so scaling off it can never track the shadow it is meant to
  // accent. Scaled off the shadow's own throw length L instead — the one
  // quantity every caster shape actually produces a non-degenerate value for —
  // floored at 1.2mm and capped at 6% of L so a short throw cannot blow the
  // collar out past the C3 width clamp already applied at the call site (which
  // restates the same 0.06*L ceiling; kept there too as a belt-and-braces clamp
  // once L is known there).
  //
  // Target 4.5% of L, not the first-cut 3%: at 3% the box fixture in
  // `scene3d-shadow-controls.test.js` (a 50mm cube half-buried at y=20, a
  // near-prism where the OLD ring-extent-based width was never degenerate —
  // measured 560.27mm of Z0 ink) dropped to 280.67mm, and because Z0 is
  // IDENTICAL across Layers 2/3/4 (C3) that flat mm loss is a much bigger
  // fraction of Layers 2's smaller total than of Layers 3/4's larger one,
  // pushing that fixture's C11 ratio from 1.552 to 1.703 (over the 1.667
  // ceiling) — a real regression on a caster this fix was never meant to
  // touch. 4.5% recovers most of that margin (measured Z0 421mm, ratio 1.60,
  // comment/table below) while still lifting the sphere well off its 1.2mm
  // floor: r20's L=40.6mm now gives a target of 1.83mm against the 1.2mm
  // floor, versus 1.22mm (barely off the floor) at 3%.
  const contactWidthOf = (L) => clamp(0.045 * finite(L, 0), 1.2, Math.max(1.2, 0.06 * finite(L, 0)));

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

  // Like `distToSegs`, but returns the nearest POINT rather than the distance —
  // used by `buildShadowFields` (fs-z2 Cycle 3, Defect 2) to derive the shadow's
  // throw AXIS (far tip minus its nearest point on the contact set), not just
  // its throw LENGTH.
  const nearestPtOnSegs = (px, py, segs) => {
    let best = Infinity; let bx = px; let by = py;
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i][0]; const b = segs[i][1];
      const vx = b.x - a.x; const vy = b.y - a.y;
      const wx = px - a.x; const wy = py - a.y;
      const vv = vx * vx + vy * vy;
      let s = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
      if (s < 0) s = 0; else if (s > 1) s = 1;
      const qx = a.x + vx * s; const qy = a.y + vy * s;
      const dx = px - qx; const dy = py - qy;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; bx = qx; by = qy; }
    }
    return { x: bx, y: by };
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
    // outline's own vertices are a sufficient (and cheap) sample set. Track WHERE
    // that max is attained too (farX/farY) — the throw AXIS (Defect 2, below)
    // needs a far-tip point, not just the scalar length.
    let L = 0; let farX = 0; let farY = 0; let haveFar = false;
    (footRings || []).forEach((ring) => (ring || []).forEach((pt) => {
      if (!isFinitePt(pt)) return;
      const d = sample(dC, pt.x, pt.y);
      if (d > L) { L = d; farX = pt.x; farY = pt.y; haveFar = true; }
    }));
    if (!(L > 1e-6)) L = Math.max(w, h) * 0.5;
    // ── Throw axis (fs-z2 Cycle 3, Defect 2) ──────────────────────────────────
    // `spacingAt`'s marching-scan sampling takes the spacing at each scanline's
    // OWN hit-pair midpoint. When the hatch bearing runs parallel to this axis,
    // every scanline's midpoint sits at close to the same t (see the mechanism
    // comment above `buildGradedSpacing`), so the resulting pitch is uniform but
    // NOT at sBase — it silently spends the full ink budget of a graded shadow
    // while rendering no gradient. Approximated as (far tip) minus (its nearest
    // point on the contact set): cheap, and matches the field's own definition
    // of t (distance-to-contact-set) exactly, since that IS the direction t
    // increases fastest away from the contact set for a typical elongated
    // footprint (the two-fixture rectangle this is tested against is exact; a
    // curved/branching footprint only gets an approximation, which is all a
    // ~30 degree tolerance band needs).
    let throwAngleDeg = 0;
    if (hasContact && haveFar) {
      const near = nearestPtOnSegs(farX, farY, cSegs);
      const dx = farX - near.x; const dy = farY - near.y;
      if (Math.hypot(dx, dy) > 1e-6) throwAngleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    }
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
      throwAngleDeg,
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
  // compressed rather than the bottom lifted.
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
        // The umbra takes the SAME rung as the penumbra and gets its extra
        // weight from the crossed family instead. Leaving it at N while the
        // penumbra stepped to 2N made Layers 3 gain what Layers 2 could not
        // (the wedge doubled the mid's pitch on its own), and the ink spread
        // across 2/3/4 blew past C11 at 1.82:1. C5 only asks for the umbra to sit
        // between 1.35x and 2.4x the penumbra, and one crossed direction already
        // delivers that — without the family-A rung, and without ink the
        // conservation rule says a new zone must not add.
        [Z_UMBRA]: 2 * N,
        // ROUND 4 — the mid steps UP a rung (C1, and answer (c) taken properly).
        //
        // Round 3 tried to buy the separation by SCALING sBase, via SATURATION and
        // the headroom cap. That was a no-op and I should have measured it: when
        // the darkest rung is already under saturation `headroomScale` returns 1,
        // so `scale` stayed 1 and NOTHING moved. Z2's interior measured 0.440
        // before and 0.440 after — identical to Round 2 — while the number I
        // reported came from averaging half-empty fringe patches at the footprint
        // edge. A metric that moves when the geometry doesn't is worse than none.
        //
        // And scaling could never have worked anyway: it moves Z0 and Z2 together,
        // so the RATIO C1 measures is invariant under it. The ratio only changes
        // if the ZONES take different rungs. So the penumbra now keeps every
        // 2N-th ruling instead of every N-th — one rung lighter — while the collar
        // stays exactly where it is (the instruction was to lighten the mid, never
        // to darken the accent).
        //
        // Strides stay NESTED (1 | N | 2N), so every zone is still a subset of the
        // same master grid and a boundary still cannot produce a phase break.
        [Z_PENUMBRA]: 2 * N,
        // C10 — Z3 keeps the SAME grid subset as Z2 and lightens purely by dash
        // duty. A stride change at the Z2/Z3 boundary is a phase break, which is
        // exactly the "abrupt tonal step" the outer margin must not have; duty is
        // continuous, so the two zones share every ruling and the transition can
        // only be read as a tone, never as a line.
        [Z_OUTER]: 2 * N,
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
  // ROUND 3, designer's answer (c) — "take the separation: headroom, not taste".
  // At the Round-2 ceiling the flat shadow measured D = 0.527 and Z2 measured
  // 0.439, so NO contact band could exceed ~1.9x and 4.5x ink landed at D = 0.94
  // — the solid black already under the low-poly. The flattening bought nothing
  // and cost the anatomy. So buy the separation by LIGHTENING THE MID, never by
  // darkening the accent: the whole ladder is built downward, Z0 to 0.70-0.80 and
  // Z2 to 0.22-0.28. C11 is formally amended to +-35% for this.
  const SATURATION = 0.78;
  // C15 — the composed ceiling for the contact collar. Below the 1.0 a third
  // direction would reach, so the accent stays an accent and the plot stays dry.
  const COLLAR_CEIL = 0.80;
  // C15, ROUND 6. The collar was `keep-1-of-1` on a grid already floored at
  // 1.2 x pen, so family A ALONE composes to ~0.83 there — and then one or two
  // crossed families land on top of it and the accent becomes a solid slab with
  // no resolvable rulings (56 patches >= 0.90 in the trio view, and the same
  // slab visible in the running app). Capping the PITCH cannot fix that: the
  // pitch was already at the floor, which is precisely why it floods "by
  // construction" — past the floor the craft rule says density must go into
  // another DIRECTION, and here it was going into both at once.
  //
  // So the collar's family-A STRIDE is chosen to satisfy a composed ceiling: it
  // takes the tightest stride whose total, with the crossed families it will
  // actually get, still leaves white paper between rulings. Every candidate is a
  // subset of the same master grid, so no new line ever appears and the
  // ruling-subset architecture is untouched; and Z0's outer boundary is HARD by
  // design (§4), so a stride that is not nested with Z1's cannot produce a
  // readable phase break either.
  const collarStrideFor = (master, crossPitch, penWidth, withThird) => {
    for (let st = 1; st <= 6; st++) {
      const fams = withThird
        ? [master * st, crossPitch, crossPitch]
        : [master * st, crossPitch];
      if (perceivedCoverage(fams, penWidth) <= COLLAR_CEIL) return st;
    }
    return 6;
  };
  // C15, ROUND 7 — the same error as Round 6's, one term over.
  //
  // Round 6 discharged the collar's ceiling by striding family A. That works
  // only while family A is the term that busts it. At a wide pen it is not:
  // the crossed families rule at `crossPitch`, and at pen 0.8 on a 0.96 mm grid
  // ONE crossed family alone composes to 0.833 against a 0.80 bound. No stride
  // on A can bring that down, because A is not what is over budget — and the
  // search dutifully returned stride 6 and reported itself satisfied while the
  // collar flooded. A cap must bind every term the criterion composes over.
  //
  // So the crossed families take a ruling-subset stride of their own. It is the
  // same keep-every-k-th rule on the same shared grid, so no new line can appear
  // and the subset architecture is untouched.
  //
  // WHEN IT ENGAGES — corrected in Round 8, and worth stating exactly, because
  // the claim that stood here through Round 7 was false. It read: "At every
  // shipped pen and density it evaluates to 1 and the emitted geometry is
  // byte-identical." It is not 1 at every shipped pen and density. Driving
  // `__collarForTest` across the whole grid gives `crossStride = 2` at:
  //
  //     pen 0.3   sBase <= 0.36
  //     pen 0.4   sBase <= 0.50
  //     pen 0.5   sBase <= 0.60
  //     pen 0.6   sBase <= 0.75
  //     pen 0.8   sBase <= 1.00
  //     pen 1.0   sBase <= 1.25
  //
  // i.e. at EVERY pen, over a band of densities that widens with the pen — not
  // in a corner of the parameter space. What IS true, and is the claim that
  // matters, is narrower: it is inert on every fixture in the shadow-anatomy
  // harness. `Z0` is bit-identical at 1318.44 mm / 211 paths across Layers
  // 2/3/4 with and without it.
  //
  // UNTESTED REGIME, recorded rather than left to be rediscovered: wherever the
  // stride engages, composed coverage lands at 0.480-0.498 against the 0.80
  // ceiling, so the collar spends about 62 % of its budget. C1 and C2 require
  // the collar to be the darkest thing in the drawing, and neither has ever been
  // measured at pen >= 0.5.
  const collarCrossStrideFor = (pitchA, crossPitch, penWidth, withThird) => {
    for (let cs = 1; cs <= 8; cs++) {
      const fams = withThird
        ? [pitchA, crossPitch * cs, crossPitch * cs]
        : [pitchA, crossPitch * cs];
      if (perceivedCoverage(fams, penWidth) <= COLLAR_CEIL) return cs;
    }
    return 8;
  };
  // The collar's complete family plan, in ONE place. The emitter and the test
  // seam both read it, so the ceiling cannot be asserted over a different set of
  // families than the one actually drawn — which is how C15 stayed broken for
  // three rounds.
  const collarPlan = (ladder, penWidth) => {
    const stride = collarStrideFor(
      ladder.master, ladder.crossPitch, penWidth,
      perceivedCoverage([ladder.master, ladder.crossPitch, ladder.crossPitch], penWidth) <= COLLAR_CEIL,
    );
    const pitchA = ladder.master * stride;
    const withThird = perceivedCoverage([pitchA, ladder.crossPitch, ladder.crossPitch], penWidth) <= COLLAR_CEIL;
    const crossStride = collarCrossStrideFor(pitchA, ladder.crossPitch, penWidth, withThird);
    const crossPitch = ladder.crossPitch * crossStride;
    return {
      stride,
      crossStride,
      withThird,
      families: withThird ? [pitchA, crossPitch, crossPitch] : [pitchA, crossPitch],
    };
  };
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

  // fs-z3, item 4 — refuse to zone-split a ruling into slivers.
  //
  // `zoneSpans` cuts a ruling wherever the sampled zone changes, with no floor
  // on how short a resulting span can be. That is fine when zones are wide
  // relative to a ruling (the design assumption spelled out above `emitFamily`)
  // but on a compact caster it is routinely violated: measured on the owner's
  // default sphere at Layers 4, 197 rulings averaging 11.0mm produced 643 zone
  // spans (3.26 per ruling, median 2.15-2.47mm) — median span 4.5x SHORTER than
  // the ruling it came from. Because `keepFor`/`dashFor` are applied PER SPAN,
  // a ruling kept in one zone and dropped in the next leaves an isolated stub
  // rather than a coherent line: only 25% of those spans survived their zone's
  // stride, so what should read as "fewer, longer marks" read as scattered
  // noise instead (median emitted mark 2.34mm against the flat shadow's
  // 13.27mm, 40% of marks under 2mm).
  //
  // The fix is a floor on span length, in multiples of the ruling PITCH (the
  // `spacing` a family rules at) — the natural unit for "is this span wide
  // enough to carry its own zone's texture" is how many rulings of THIS
  // family's own grid would fit across it, not an absolute mm figure. A span
  // under the floor is not dropped (that would just move the fragmentation to
  // a different failure) — it is MERGED into whichever neighbour is longer,
  // adopting that neighbour's zone. Merging into the bigger neighbour (rather
  // than always left or always right) keeps the merge deterministic and
  // unbiased with respect to ruling direction. A final pass then coalesces any
  // now-adjacent spans that ended up sharing a zone (two large same-zone spans
  // that had a sliver of a third zone between them, once that sliver is
  // absorbed into one side, are one span, not two).
  const SPAN_COALESCE_PITCH_MULT = 6;
  // C3 — the contact collar is a HARD boundary (see the feathering loop above,
  // which already excludes Z_CONTACT from interdigitation for the same
  // reason) and it must be ANCHORED: identical at every Layers setting,
  // because it does not depend on `nZones` at all. Coalescing must not touch
  // it either way: a short Z_CONTACT sliver must never be merged AWAY (that
  // would erode the one value the whole drawing is anchored to), and a short
  // NON-contact sliver must never be merged INTO a Z_CONTACT neighbour (that
  // would let the collar's boundary drift with whatever nZones happens to
  // classify next to it — precisely the coupling C3 forbids). A short span
  // that cannot merge on either side because both its neighbours are (or one
  // neighbour is Z_CONTACT and the other doesn't exist) is left as-is, same
  // as a ruling that is one short span with no neighbour at all.
  const coalesceSpans = (spans, minLen) => {
    if (!spans || spans.length < 2) return spans || [];
    let out = spans.map((s) => s.slice());
    let changed = true;
    while (changed && out.length > 1) {
      changed = false;
      for (let i = 0; i < out.length; i++) {
        if (out[i][2] === Z_CONTACT) continue; // never merge the collar away
        if (out[i][1] - out[i][0] >= minLen) continue;
        const hasPrev = i > 0 && out[i - 1][2] !== Z_CONTACT;
        const hasNext = i < out.length - 1 && out[i + 1][2] !== Z_CONTACT;
        if (!hasPrev && !hasNext) continue; // only mergeable neighbour(s) are the collar — leave it
        const prevLen = hasPrev ? out[i - 1][1] - out[i - 1][0] : -1;
        const nextLen = hasNext ? out[i + 1][1] - out[i + 1][0] : -1;
        if (nextLen > prevLen) {
          out[i + 1][0] = out[i][0]; // extend the (larger) next span backward; its zone wins
        } else {
          out[i - 1][1] = out[i][1]; // extend the (larger) previous span forward; its zone wins
        }
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
    // Coalesce adjacent spans a merge above left sharing the same zone.
    const merged = [];
    out.forEach((s) => {
      const last = merged[merged.length - 1];
      if (last && last[2] === s[2]) last[1] = s[1]; else merged.push(s.slice());
    });
    return merged;
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
      // fs-z3 test seam: when present, every FINAL emitted mark (post-feather,
      // post-keep, post-dash — i.e. exactly what would be drawn) is also
      // recorded here as { familyId, ruling, zone, t0, t1 }, pre-ground-clip.
      // Lets a test measure spans-per-ruling / mark length / boundary-gap
      // statistics directly off the real emission logic instead of a
      // restatement of it. See `__emitShadowRegionForTest` at the tail of the
      // file.
      rawSink,
    } = opts;
    const rulings = [];
    familyRulings(rings, angle, spacing, rulings);
    if (!rulings.length) return;
    const sampleStep = Math.max(0.5, Math.min(2.5, spacing));
    // fs-z3, item 4 — see the comment above `coalesceSpans`.
    const spanCoalesceMinLen = SPAN_COALESCE_PITCH_MULT * spacing;
    const lines = [];
    rulings.forEach((r) => {
      const len = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
      if (!(len > MIN_RUN_MM)) return;
      const ux = (r.b.x - r.a.x) / len; const uy = (r.b.y - r.a.y) / len;
      const spans = coalesceSpans(zoneSpans(r.a, r.b, zoneAt, sampleStep), spanCoalesceMinLen);
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
        //
        // NOT on the contact collar. The collar sits ON the footprint's near rim,
        // so this fired on it and ate 40% of the accent's ink the moment Layers
        // went to 4 (measured 1.011 -> 0.601): turning the outer penumbra ON
        // eroded the contact band, which is the one value the whole drawing is
        // anchored to. Z0's edge is deliberately HARD anyway (§4) — a contact
        // accent with a feathered edge reads as a mistake, not as subtlety — so
        // there was never a case for retracting it.
        //
        // NOT on Z_OUTER either (fs-z3, item 2). Z3 already has ITS OWN softening
        // mechanism — the duty ramp in `dashA` (0.75 -> 0.35 across the throw,
        // "the shadow dissolves into paper") — and stacking rim retraction on top
        // of it was the second half of why Z3 read as mottled stubs rather than a
        // soft edge: every mark in the rim was simultaneously shortened at BOTH
        // ends by up to 1.2 x rimFeather AND chopped into dashes, so what should
        // read as "fewer, shorter marks" instead read as noise. One mechanism
        // wins; dash duty was already the deliberate, documented lever for this
        // zone (see the comment on Z_OUTER's dashA branch), so retraction is
        // scoped OFF it.
        if (zone !== Z_CONTACT && zone !== Z_OUTER) {
          if (si === 0) s0 += hash01(r.i * 977 + familyId, 7) * 1.2 * fields.rimFeather;
          if (si === spans.length - 1) s1 -= hash01(r.i * 977 + familyId, 9) * 1.2 * fields.rimFeather;
        }
        if (!(s1 - s0 > MIN_RUN_MM)) return;
        const emit = (t0, t1) => {
          if (!(t1 - t0 > MIN_RUN_MM)) return;
          const seg = [
            { x: r.a.x + ux * t0, y: r.a.y + uy * t0 },
            { x: r.a.x + ux * t1, y: r.a.y + uy * t1 },
          ];
          seg.zone = zone;   // per-SPAN, see the emit grouping below
          lines.push(seg);
          if (rawSink) rawSink.push({ familyId, ruling: r.i, zone, t0, t1 });
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
    // ── shadowLayer is stamped PER SPAN, not per family ─────────────────────
    //
    // It used to be one constant for a whole `emitFamily` call, and that made
    // every cast-shadow measurement quoted for three rounds wrong in the same
    // way. Family A carried Z_PENUMBRA over its entire length and family B
    // carried Z_CONTACT over its entire length — but family B covers the collar
    // AND the umbra, and family A crosses all four zones. So anything bucketing
    // by this tag was separating CROSSED-family ink from MASTER-family ink and
    // calling the result "contact vs penumbra". That is how the Round-4 harness
    // reported the ratio as 0.89 with n = 1, and reported the mid as un-rebased,
    // when the same drawing measured geometrically by throw parameter gives
    // 4.4x / 5.1x / 2.5x. The zone is known exactly where each span is emitted;
    // it simply was not being written down.
    if (lines.length) {
      const byZone = new Map();
      lines.forEach((seg) => {
        if (!byZone.has(seg.zone)) byZone.set(seg.zone, []);
        byZone.get(seg.zone).push(seg);
      });
      byZone.forEach((segs, z) => {
        const m = (meta && meta.sceneTarget)
          ? { ...meta, sceneTarget: { ...meta.sceneTarget, shadowLayer: z } }
          : meta;
        emitHatchLines(segs, groundPlane, clipper, out, m, treat, draft);
      });
    }
    if (sink) sink.push(lines.length);
  };

  // ── Stage 1 flat-path tone gradient (shadowToneDepth) ──────────────────────
  // Local ink density on the FLAT shadow, driven by distance from the caster's
  // contact point through the OBJECT's own ladder (ladderCoverageAt, above):
  // t = distContact/L (0 at contact, 1 at the far tip); pseudo-intensity
  // I = 1 - t so NEAR reads as the ladder's brightest-mapped (densest, darkest
  // on paper) rung and FAR as its darkest-mapped (sparsest, lightest) rung —
  // "closest to the object is darkest shadow". Verified empirically (not
  // assumed): Regions.band/coverageFor is an ASCENDING ladder, I=1 -> the
  // highest coverage number, so the near/far mapping must invert t, not pass
  // it straight through.
  //
  // shadowToneDepth (0..1) blends the flat scalar spacing every shadow has
  // always used (0) toward this pure ladder ramp (1) via a per-chunk KEEP
  // duty — each mark is cut into short chunks and each chunk survives a
  // deterministic hash test against `duty = coverage(t) / coverage(I=1)`. This
  // is class-agnostic (applied after shadowMarkLines, whatever markClass
  // produced) — the engine half. S2 replaces it with a per-recipe covAt()
  // lever (pitch for hatch/cross, duty for dash, stipple rate for dot,
  // amplitude for wave) so each Fill Style expresses the ramp on its own terms.
  // Chunk length is a plot-time lever, not just a resolution one: every DROPPED
  // chunk between two KEPT ones is an extra pen-up/pen-down, and halving this
  // value on the shadow-anatomy A-off fixture roughly doubled path count for a
  // near-identical ink total and near/far ratio (2mm: 5966 paths/11455.75 ink;
  // 4mm: 3144/11564.67; 6mm: 2174/11583.00 — chosen). 6mm keeps the ramp
  // clearly readable while not flooding the plot queue with short strokes.
  const TONE_CHUNK_MM = 6;
  const applyShadowToneGradient = (lines, fields, tone, depth) => {
    if (!fields || !(fields.L > 1e-6) || !(depth > 0) || !tone || tone.enabled === false) return lines;
    const maxCov = ladderCoverageAt(1, tone);
    if (maxCov == null || !(maxCov > 0)) return lines;
    const L = fields.L;
    const out = [];
    lines.forEach((line, li) => {
      if (!Array.isArray(line) || line.length < 2) { if (line) out.push(line); return; }
      let chunkIdx = 0;
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i]; const b = line[i + 1];
        if (!isFinitePt(a) || !isFinitePt(b)) continue;
        const segLen = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(segLen > 1e-6)) continue;
        const steps = Math.max(1, Math.ceil(segLen / TONE_CHUNK_MM));
        for (let s = 0; s < steps; s++) {
          const u0 = s / steps; const u1 = (s + 1) / steps;
          const p0 = { x: a.x + (b.x - a.x) * u0, y: a.y + (b.y - a.y) * u0 };
          const p1 = { x: a.x + (b.x - a.x) * u1, y: a.y + (b.y - a.y) * u1 };
          const mx = (p0.x + p1.x) * 0.5; const my = (p0.y + p1.y) * 0.5;
          const t = clamp(fields.distContact(mx, my) / L, 0, 1);
          const cov = ladderCoverageAt(1 - t, tone);
          const duty = clamp((cov == null ? maxCov : cov) / maxCov, 0.02, 1);
          const keepProb = 1 - depth * (1 - duty);
          if (hash01(li, chunkIdx) < keepProb) out.push([p0, p1]);
          chunkIdx++;
        }
      }
    });
    return out;
  };

  // ── Stage 1.1 (fs-z2) — spacing gradient, replacing the chunker above for
  // continuous-ruling mark classes ────────────────────────────────────────────
  // The chunker's fragmentation cost was measured directly (path 535 -> 2174,
  // ink 16110mm -> 11583mm on a real scene at the default): each ruling was
  // being cut into ~6mm pieces and thinned piece-by-piece, so tone read as
  // scattered stubs, not a graceful falloff. Tone in a hatch belongs in the
  // GAP between rulings, not inside them, so this builds a spacing FUNCTION
  // (x, y) => mm for `hatchRingsEvenOdd`'s marching scan (above) instead of a
  // per-chunk survival probability — every emitted line stays one unbroken
  // hit-pair; only the pitch between lines changes.
  //
  // Reuses `coverageToSpacing` (the same primitive the uniform baseline
  // already calls, one scope up) at both ends of the ratio so the "no
  // flooding" contract carries over exactly: duty = sMin/sTarget is 1.0 at
  // t=0 (the ladder's own densest rung, by construction) and falls toward
  // minCov/maxCov at the far tip, then blends 0..depth exactly like the
  // retired per-chunk `duty = cov(t)/maxCov` did — same shape, applied to a
  // continuous pitch instead of a discrete keep/drop.
  const buildGradedSpacing = (sBase, fields, tone, depth, penWidth, angleDeg) => {
    if (!fields || !(fields.L > 1e-6) || !(depth > 0) || !tone || tone.enabled === false) return null;
    const maxCov = ladderCoverageAt(1, tone);
    if (maxCov == null || !(maxCov > 0)) return null;
    const sMin = coverageToSpacing(maxCov, penWidth);
    const L = fields.L;
    // ── Parallel-to-throw clamp (fs-z2 Cycle 3, Defect 2) ────────────────────
    // See the throw-axis mechanism comment above `nearestPtOnSegs`'s use in
    // `buildShadowFields`. When the ruling bearing runs within ~30 degrees of
    // the throw axis, `hatchRingsEvenOdd`'s marching scan samples spacing at
    // each scanline's OWN hit-pair midpoint — and in that orientation every
    // scanline's midpoint sits at close to the same t, so the pitch it computes
    // is uniform but NOT at sBase (it is the tone of wherever the ruling's own
    // midpoint happens to sit). That spends the shadow's full ink budget while
    // rendering zero gradient — the honest degrade is uniform spacing AT
    // sBase, i.e. unchanged from the un-graded shadow, never a wrong pitch.
    // Ruling termination (cutting a graded gap mid-ruling so even a parallel
    // bearing can show SOME fall-off) would be the complete fix but is out of
    // scope here (explicit task instruction: minimum-viable only) — this
    // clamps the computed pitch back toward sBase instead. Blended smoothly
    // over the 30-60 degree band (not switched at exactly 30) so the pitch
    // cannot visibly pop as a light orbits through that band; 45 degrees (the
    // default `shadowAngle`, independent of the light azimuth the throw axis
    // follows) sits mid-band and gets roughly half the achievable contrast, on
    // purpose — full contrast only where the ruling is genuinely crosswise.
    const rulingDeg = finite(angleDeg, 45);
    const throwDeg = fields.throwAngleDeg || 0;
    const acuteDiff = (() => {
      const d = Math.abs(rulingDeg - throwDeg) % 180;
      return Math.min(d, 180 - d);
    })();
    const clampWeight = acuteDiff <= 30 ? 1 : (acuteDiff >= 60 ? 0 : 1 - (acuteDiff - 30) / 30);
    const spacingAt = (x, y) => {
      const rawT = fields.distContact(x, y) / L;
      // Defect 3 (fs-z2 Cycle 3): an unsupported/out-of-range field sample
      // (NaN distContact) used to launder silently into `clamp(NaN,0,1) ->
      // NaN`, which `ladderCoverageAt` absorbed into its sparsest rung instead
      // of surfacing as a defect — the exact "|| DEFAULT becomes confidently
      // wrong" class this batch has hit three times elsewhere. Fail safely to
      // the flat baseline instead of propagating NaN downstream (the
      // `Number.isFinite(sp)` guard in `stepAt`, `hatchRingsEvenOdd`, never
      // fires because the NaN never survives this far as NaN).
      if (!Number.isFinite(rawT)) return sBase;
      const t = clamp(rawT, 0, 1);
      const cov = ladderCoverageAt(1 - t, tone);
      const sTarget = coverageToSpacing(cov == null ? maxCov : cov, penWidth);
      const duty = clamp(sMin / sTarget, 0.02, 1);
      const keepProb = clamp(1 - depth * (1 - duty), 0.02, 1);
      const graded = sBase / keepProb;
      return clampWeight > 0 ? graded * (1 - clampWeight) + sBase * clampWeight : graded;
    };
    spacingAt.baseHint = sBase;
    return spacingAt;
  };

  // Mark classes whose marks are a family of continuous parallel rulings built
  // purely from `hatchRingsEvenOdd` (see shadowMarkLines/HATCH_LAW_RECIPES) —
  // for these, tone is expressed as ruling spacing (buildGradedSpacing, above).
  // 'dash'/'dot' marks are already discontinuous BY DESIGN (a dash is short
  // segments, a dot is discrete flicks), so they stay on the legacy per-chunk
  // gradient below (`applyShadowToneGradient`) deliberately — chunking a mark
  // that is already short segments/flicks costs nothing extra.
  //
  // fs-z2 Cycle 3 (Defect 1): 'cross' and 'wave' were left off this set on
  // the theory that the reported regression and its default Fill Style
  // ('ladder'/'hatch', 'none'/'ref') didn't exercise them — but 9 of the 15
  // laws left on the chunker (penReserve/penCross/mezzoRegion, mkScribble/
  // ampSpacing/weaveDepth/interlockWeave/trochoidLoop/amplitudeOnly) genuinely
  // shred continuous rulings into ~6mm stubs, which is exactly the picker-
  // reachable defect this batch exists to close (scene3d-panel.js's Fill
  // Style picker offers all of them). CROSS_LAW_RECIPES/WAVE_LAW_RECIPES now
  // consume the graded spacing function correctly (via `scaleSpacing`/
  // `numericHint`, above), so both classes are safe to add here.
  //
  // 'ref' is NOT included: its only roster law is 'none' (NO_TONE_LAW_ID),
  // and `build()` forces `toneDepth` to 0 whenever `shadowToneLaw === 'none'`
  // (the noTone sentinel, this file's `build()`) — so `canGrade` below can
  // never observe `toneDepth > 0` while markClass is 'ref'. Listing it here
  // would be dead code, not a real coverage claim.
  const GRADEABLE_MARK_CLASSES = new Set(['hatch', 'cross', 'wave']);

  // ── Zone model (fs-z3) ──────────────────────────────────────────────────────
  // Everything downstream of `fields` in the zone-anatomy build — the contact
  // half-width, the excluded-rim edge field, the umbra wedge law, and the
  // classifier `zoneAt` itself — used to be inlined in `emitShadowRegion`.
  // Factored out here so the same, single definition of "what zone is this
  // point in" can also be driven by a TEST SEAM (`__zoneAreaShareForTest`,
  // below): measuring Z3's AREA share (not just its ink share) needs to grid-
  // sample `zoneAt` directly, and a restated copy of this logic in a test
  // would be exactly the "harness restates and drifts from production" failure
  // this codebase's own comments warn about repeatedly. Returns null on the
  // same degenerate-footprint condition `buildShadowFields` already guards.
  const buildZoneModel = (rings, contactSegs, penWidth, layerCount, falloff) => {
    // contactWidthOf (item 3) is scaled off the throw length L, not the contact
    // ring's own minor extent — but L itself comes from buildShadowFields, and
    // the edge field it also returns needs contactWidth to exclude the rim
    // that hugs the caster's body first. So L is fetched with a throwaway,
    // edge-free pass (dE costs nothing when edgeSegs is empty — see
    // buildShadowFields's own `edgeSegs.length ? … : 1e6` guard) before the
    // real pass is built with the edge field properly excluded.
    const fieldsForL = buildShadowFields(rings, contactSegs, []);
    if (!fieldsForL) return null;
    let contactWidth = contactWidthOf(fieldsForL.L);
    // Edge field excludes the rim that hugs the caster's body: the base of a
    // shadow is not an "edge" of it, and counting it would push the darkest zone
    // into the lightest one exactly where the contact band belongs.
    const edgeSegs = ringsToSegs(rings).filter(([a, b]) => {
      if (!contactSegs.length) return true;
      const mx = (a.x + b.x) * 0.5; const my = (a.y + b.y) * 0.5;
      return distToSegs(mx, my, contactSegs) > contactWidth * 1.5;
    });
    const fields = buildShadowFields(rings, contactSegs, edgeSegs);
    if (!fields) return null;

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
    // ROUND 3 (C6). k was 0.03 + 1.2*soft — at the default softness that is 0.63,
    // 2.25x the spec's law, so w(t) outgrew the footprint's local half-width by
    // t = 0.24 and the umbra died there. Measured: "a fat contact smudge, not a
    // wedge". The spec's own coefficients (§2.1) put the death at t ~ 0.55 at the
    // default, which is what makes the wedge read as a SHAPE. `tUmbraMax` below
    // remains the second lever, so C13's slider range is untouched.
    const k = 0.06 + 0.44 * soft;
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
    // fs-z3 (item 1). Z3 is meant to be a RIM — a thin band plus the far tail —
    // but bounding it at 30% of the local inradius made it 23-37% of the
    // shadow's AREA at every caster size tested (34.8% at r10, 37.4% at r20/r46,
    // 23.3% at r92), because a 45 deg sun guarantees the footprint is thin
    // somewhere along its whole length, and 30% of a thin cross-section is most
    // of it. Every mm^2 in there also carried BOTH rim retraction and dash duty
    // (see item 2) at once, which is what turned it into mottled stubs rather
    // than a soft edge. Bounded to 10% of Rin instead — a genuine rim margin,
    // not a second zone eating the shadow from the outside in.
    const outerMargin = clamp(Math.min(0.02 * L, 0.10 * finite(fields.Rin, L)), 0.8, 5);

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

    return {
      fields, L, contactWidth, outerMargin, nZones, wantUmbra, wantOuter, zoneAt, w0, k, tUmbraMax,
    };
  };

  // Hatch a shadow polygon (rings = [outer, hole…]).
  //   layers off / draft / no fields → single flat hatch (the legacy path, and
  //   the Off/shadowToneDepth:0 compatibility contract — that combination must
  //   stay byte-identical to the pre-gradient renderer);
  //   layers on → the zone anatomy above (Stage 1 does not touch this path).
  const emitShadowRegion = (rings, groundPlane, clipper, out, meta, treat, draft, cfg) => {
    if (!Array.isArray(rings) || !rings.length || !Array.isArray(rings[0]) || rings[0].length < 3) return;
    const { angle, coverage, penWidth, layers, layerCount, falloff } = cfg;
    const sBase = coverageToSpacing(coverage, penWidth);
    // Fill Style on the flat hatch: a law whose mark class isn't judged
    // applicable to a shadow (see TONE_MARK_APPLICABLE) falls back to plain
    // 'hatch' — the default toneLaw ('ladder') IS 'hatch', so this keeps the
    // Off/draft byte-identical compatibility contract intact untouched.
    const toneLawId = clampToneLawId(cfg.toneLaw);
    const markClass = toneLawApplies(toneLawId) ? toneLawMarkClass(toneLawId) : 'hatch';
    const contactSegs = (cfg.contactSegs && cfg.contactSegs.length) ? cfg.contactSegs : [];
    // Defect 2 (fs-z2 Cycle 2): "No Tone" (`NO_TONE_LAW_ID`) already forced
    // `cfg.toneDepth` to 0 upstream in `build()` (tested against the RAW
    // `shadowBag.shadowToneLaw`, never a clamped id — see that comment for
    // why). Re-clamped here defensively, same convention every other cfg
    // field in this function already follows.
    const toneDepth = clamp(finite(cfg.toneDepth, 0), 0, 1);
    const flat = () => {
      const canGrade = toneDepth > 0 && contactSegs.length && GRADEABLE_MARK_CLASSES.has(markClass);
      let flatFields = null;
      let spacingArg = sBase;
      if (canGrade) {
        flatFields = buildShadowFields(rings, contactSegs, []);
        if (flatFields) {
          const graded = buildGradedSpacing(sBase, flatFields, cfg.tone, toneDepth, penWidth, angle);
          if (graded) spacingArg = graded;
        }
      }
      const marks = shadowMarkLines(rings, angle, spacingArg, markClass, toneLawId);
      let graded = marks;
      // Legacy per-chunk fallback: only for mark classes NOT covered by the
      // spacing re-expression above. fs-z2 Cycle 3 (Defect 1) moved 'cross'
      // and 'wave' into GRADEABLE_MARK_CLASSES, so this branch is now reached
      // only by 'dash'/'dot' — both discontinuous BY DESIGN (see the comment
      // above GRADEABLE_MARK_CLASSES), which is why they were never migrated.
      if (toneDepth > 0 && contactSegs.length && typeof spacingArg !== 'function') {
        if (!flatFields) flatFields = buildShadowFields(rings, contactSegs, []);
        if (flatFields) graded = applyShadowToneGradient(marks, flatFields, cfg.tone, toneDepth);
      }
      emitHatchLines(graded, groundPlane, clipper, out, meta, treat, draft);
    };
    if (!layers || draft) { flat(); return; }

    const model = buildZoneModel(rings, contactSegs, penWidth, layerCount, falloff);
    if (!model) { flat(); return; }
    const {
      fields, L, contactWidth, outerMargin, nZones, wantUmbra, wantOuter, zoneAt,
    } = model;

    // The headroom cap. This used to cite a criterion that does not exist and
    // assert that turning Layers ON must never weaken the penumbra. The spec has
    // C1-C15 only, the rule was invented during implementation, and it was
    // countermanded outright: the mid is supposed to come DOWN so the contact
    // accent can read against it. That invented rule is why the first rebase
    // attempt was written as a scale — which is a no-op on the ratio the criterion
    // actually measures. The test encoding it was corrected a round ago; this
    // rationale was not, and a stale rationale in the source is exactly how the
    // defect survived. Deleted rather than softened.
    // The ladder needs a RUNG. When sBase/2 sits under the plot floor the master
    // grid collapses to N = 1, family A cannot step down for the contact accent,
    // and every zone rules at the flat shadow's own pitch — so Layers can only
    // ADD crossed families and the total climbs (2.3x the flat shadow on a
    // compact footprint). Buying N = 2 costs at most the same headroom the cap
    // already budgets, so spend it there rather than leave the ladder flat.
    const floorSp = Math.max(0.05, PLOT_FLOOR_MULT * Math.max(0.05, penWidth));
    const rungScale = sBase > 1e-6 ? (2 * floorSp) / sBase : 1;
    // The 1.25 ceiling was the old "Layers must never weaken the penumbra" rule.
    // That rule is what pinned Z2 at 0.44 and left the ladder no room; it is
    // deliberately relaxed here (see SATURATION) so the mid can come down.
    const scale = clamp(Math.max(headroomScale(sBase, penWidth), rungScale), 1, 2.2);
    const ladder = strideLadder(sBase * scale, penWidth);
    const strideA = ladder.strideA;
    // C15 — the collar takes the tightest FAMILY PLAN that still leaves paper
    // showing: a stride on family A, and (only where A cannot discharge the
    // ceiling on its own) a stride on the crossed families too.
    const collar = collarPlan(ladder, penWidth);
    strideA[Z_CONTACT] = collar.stride;
    const crossPitch = ladder.crossPitch;
    // Keep-every-k-th for the collar's copy of a crossed family. 1 everywhere a
    // shipped pen/density lands, so this is inert on every current fixture.
    const keepCollarCross = (i) => {
      const cs = collar.crossStride;
      return cs <= 1 || (((i % cs) + cs) % cs) === 0;
    };
    // THIRD LEVER — dash duty. It can only ever LIGHTEN, and the headroom cap
    // already spends what it has. So duty is spent where it is free: thinning the crossed family along
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
      rings, zoneAt, fields, groundPlane, clipper, out, treat, draft, rawSink: cfg.rawSink || null,
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
      keepFor: (zone, i) => (zone === Z_UMBRA)
        || (zone === Z_CONTACT && keepCollarCross(i)),
    });
    // ROUND 3 (C2/O13). The contact collar must be the darkest patch ANYWHERE —
    // if the object's own terminator out-inks it, the object floats. With the
    // ladder rebased downward Z0 landed at 0.60 while the form's core shadow
    // reached 0.81, so the third direction is no longer gated on a coarse master
    // grid: the collar is the ONE place in the drawing that is allowed three
    // directions, and it is where the drawing needs them.
    // C15 on the SHADOW side. The object stopped flooding in Round 3; the collar
    // did not — 11,218 solid 1mm windows in the trio view, and the accent read as
    // a black bar rather than as an accent. Family A rules the collar at the
    // MASTER pitch (stride 1), and two crossed families land on top of it, so the
    // composed coverage runs past 0.99 whenever the master grid is fine.
    //
    // Same treatment that fixed the object side: compose the coverage properly as
    // 1 - PROD(1 - c) and admit the third direction only while the pair is still
    // under the ceiling. The collar keeps its two directions unconditionally —
    // those carry the accent, and C1 depends on them.
    // The third direction joins only if the collar still has room for it AFTER
    // the stride has been chosen — otherwise it is the thing that floods.
    const collarThird = contactSegs.length > 0 && collar.withThird;
    if (collarThird) {
      emitFamily({
        ...base, angle: angle + CROSS_C_DEG, spacing: crossPitch, familyId: 2,
        meta: zoneMeta(Z_CONTACT),
        keepFor: (zone, i) => zone === Z_CONTACT && keepCollarCross(i),
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
    // Defensively clamped here too (not just in params.js normalizeShadow) —
    // every other shadowBag field in this file re-clamps at the read site so a
    // caller that skips normalizeParams still degrades safely; toneLaw follows
    // the same convention.
    const toneLaw = clampToneLawId(shadowBag.shadowToneLaw);
    // "No Tone" is the Stage-0 reference: the tone apparatus OFF. Tested on the RAW
    // bag value, never on a clamped id — a clamp can only launder an unknown id INTO
    // something, never out of 'none'. Same test surface-fill.js:1379 uses.
    const noTone = shadowBag.shadowToneLaw === NO_TONE_LAW_ID;
    const toneDepth = noTone ? 0 : clamp(finite(shadowBag.shadowToneDepth, SHADOW_TONE_DEPTH_DEFAULT), 0, 1);
    const cfg = {
      angle: hatchAngle, coverage, penWidth, layers: shadowLayers, layerCount, falloff, Mappers, toneLaw,
      toneDepth, tone: params && params.tone,
    };
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

  // Test seam #2 (C15, ROUND 7). The collar's plot-safety is a property of the
  // COMPOSED coverage of the families it actually emits — family A at its
  // chosen stride, plus the crossed families that will land on top of it. That
  // composition is not observable from the emitted paths either: a stride shows
  // up as a spacing only where two adjacent rulings both survive clipping, and
  // in the collar they mostly do not. Round 6 fixed the flood and shipped no
  // test; this is the seam that lets one exist.
  //
  // Returns exactly what the ceiling is asserted over, so the test cannot
  // re-derive (and therefore re-bless) the implementation's own arithmetic.
  const __collarForTest = (sBase, penWidth) => {
    const l = strideLadder(sBase, penWidth);
    const plan = collarPlan(l, penWidth);
    return {
      ...plan,
      composed: perceivedCoverage(plan.families, penWidth),
      ceil: COLLAR_CEIL,
      master: l.master,
      floorSp: l.floorSp,
    };
  };

  // Test seam #3 (shadowToneDepth, S1). The flat-path tone gradient is not
  // cleanly observable from a real scene's emitted paths — the shadow
  // footprint's own WEDGE SHAPE (narrow near the caster, wide at the far tip
  // for most light angles) confounds a raw near-third-vs-far-third ink
  // comparison with the actual tone effect. These seams let a test build the
  // distance field and run the gradient directly against SYNTHETIC, known
  // rings (e.g. a plain rectangle) so the ratio it measures is the mechanism's
  // alone. Read-only, prefixed so it reads as a seam, not API.
  const __shadowFieldsForTest = (rings, contactSegs) => buildShadowFields(rings, contactSegs || [], []);
  const __toneGradientForTest = (lines, fields, tone, depth) => applyShadowToneGradient(lines, fields, tone, depth);
  const __ladderCoverageForTest = (I, tone) => ladderCoverageAt(I, tone);
  // Test seam #4 (fs-z2, shadowToneDepth Stage 1.1). Exercises the SPACING
  // re-expression directly against the same synthetic-rectangle fixture #3
  // uses, at a chosen ruling angle — so a test can drive both the "good"
  // orientation (rulings crosswise to the throw, where spacing modulation
  // maps cleanly onto the near/far gradient) and the adversarial one (rulings
  // parallel to the throw, where no scan-axis spacing can express a gradient
  // at all — see the mechanism comment above `buildGradedSpacing`) without
  // going through a full scene build.
  const __gradedHatchForTest = (rings, angleDeg, sBase, fields, tone, depth, penWidth) => {
    const spacing = buildGradedSpacing(sBase, fields, tone, depth, penWidth, angleDeg) || sBase;
    return hatchRingsEvenOdd(rings, angleDeg, spacing);
  };
  // Test seam #5 (fs-z2 Cycle 3, Defect 2/3). Exposes `buildGradedSpacing`
  // itself (rather than the marching-scan output `__gradedHatchForTest`
  // returns) so a test can call the resulting `spacingAt(x, y)` directly —
  // needed to pin the exact clamped pitch at a chosen angle (Defect 2) and to
  // drive `fields.distContact` with a NaN/non-finite return (Defect 3), which
  // a real `buildShadowFields` field never produces on its own.
  const __buildGradedSpacingForTest = (sBase, fields, tone, depth, penWidth, angleDeg) => buildGradedSpacing(sBase, fields, tone, depth, penWidth, angleDeg);

  // Test seam #5b (fs-z3). Exposes `buildZoneModel` directly (fields, L,
  // Rin, contactWidth, outerMargin and the zoneAt closure itself) so a test
  // can isolate ONE zone-law coefficient's effect (e.g. compare the outerMargin
  // formula against the SAME real distContact/distEdge fields it would use in
  // production) instead of only reading the aggregate area/ink shares.
  const __zoneModelForTest = (rings, contactSegs, penWidth, layerCount, falloff) => buildZoneModel(rings, contactSegs || [], penWidth, layerCount, falloff);

  // Test seam #6 (fs-z3, item 1). `zoneAt` classifies a POINT, not a region, so
  // "what share of the shadow's AREA is Z3" is not observable from emitted ink
  // at all — ink also carries the master grid's stride and Z3's own dash duty,
  // both of which make a zone draw LESS densely without making it any smaller.
  // That is exactly why the old outerMargin (30% of Rin) read as "only" an
  // 11% ink share while still being 23-37% of the actual AREA. This grid-
  // samples the real `zoneAt` from `buildZoneModel` (the same function
  // `emitShadowRegion` calls) over the footprint, so the measurement cannot
  // drift from what production actually classifies.
  const __zoneAreaShareForTest = (rings, contactSegs, penWidth, layerCount, falloff) => {
    const model = buildZoneModel(rings, contactSegs || [], penWidth, layerCount, falloff);
    if (!model) return null;
    const box = ringsBBox([rings]);
    if (!box) return null;
    const w = box.maxX - box.minX; const h = box.maxY - box.minY;
    if (!(w > 0) || !(h > 0)) return null;
    const MAX_SAMPLES = 250000;
    let cell = 0.4;
    while (((w / cell) + 1) * ((h / cell) + 1) > MAX_SAMPLES) cell *= 1.5;
    const areas = {}; let total = 0;
    for (let y = box.minY + cell / 2; y < box.maxY; y += cell) {
      for (let x = box.minX + cell / 2; x < box.maxX; x += cell) {
        if (!pointInRings(x, y, rings)) continue;
        const z = model.zoneAt(x, y);
        areas[z] = (areas[z] || 0) + 1;
        total += 1;
      }
    }
    const shares = {};
    Object.keys(areas).forEach((z) => { shares[z] = areas[z] / (total || 1); });
    return { areas, total, shares, cell, L: model.L, Rin: model.fields.Rin };
  };

  // Test seam #7 (fs-z3, items 2 & 4). Runs the REAL zone-anatomy emitter
  // (`emitShadowRegion`, the exact function `build()` calls once a footprint
  // is composed) against a caller-supplied footprint/contact set, through a
  // pass-through clipper (every candidate segment survives — only the
  // MIN_RUN_MM floor inside `emitHatchLines` can still drop one, same as
  // production), and returns both the final emitted paths (`out`, with the
  // usual `meta.sceneTarget.shadowLayer` tagging) and the pre-clip raw marks
  // (`raw`, one entry per emitted mark: familyId/ruling/zone/t0/t1) captured
  // via `rawSink`. `raw` is what a test needs for spans-per-ruling, mark
  // length and boundary-gap statistics — measuring the emitter's own output,
  // not a restatement of its internals.
  const __passThroughClipper = { clipPath: (pts) => ({ runs: [{ visible: true, pts }] }) };
  const __emitShadowRegionForTest = (rings, contactSegs, cfg) => {
    const out = [];
    const rawSink = [];
    const meta = { sceneTarget: {} };
    emitShadowRegion(
      rings, null, __passThroughClipper, out, meta, NO_STROKE_TREATMENT, false,
      { ...cfg, contactSegs: contactSegs || [], rawSink },
    );
    return { out, raw: rawSink };
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, {
    Shadows: {
      build,
      // Fill Style (tone-law) on shadow hatch: `toneLawApplies(lawId)` is the
      // predicate a UI picker should gate on (hide ids whose mark class does
      // not change shadow geometry); `toneLawMarkClass` is the underlying
      // classifier it is built from, exposed for anything that wants the raw
      // class instead of a boolean.
      toneLawApplies,
      toneLawMarkClass,
      // fs-q1 — whole-row visibility gate (Layers ON, or any area light,
      // makes the row inert). See the comment above its definition.
      shadowFillStyleApplies,
      __ladderForTest,
      __collarForTest,
      __shadowFieldsForTest,
      __toneGradientForTest,
      __ladderCoverageForTest,
      __gradedHatchForTest,
      __buildGradedSpacingForTest,
      __zoneModelForTest,
      __zoneAreaShareForTest,
      __emitShadowRegionForTest,
    },
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      build, toneLawApplies, toneLawMarkClass, shadowFillStyleApplies, __ladderForTest, __collarForTest,
      __shadowFieldsForTest, __toneGradientForTest, __ladderCoverageForTest, __gradedHatchForTest,
      __buildGradedSpacingForTest, __zoneModelForTest, __zoneAreaShareForTest, __emitShadowRegionForTest,
    };
  }
})();
