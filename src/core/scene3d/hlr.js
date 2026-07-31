/**
 * Scene3D.HLR — flat-face hidden-line removal (spec F-01, F-02, F-05).
 *
 * Occluders are FRONT-FACING projected face polygons. Occluder depth is
 * evaluated PER SAMPLE from the face's support plane at (x, y) — the plane
 * d = A·x + B·y + C fitted (Newell, in screen+depth space) over the projected
 * polygon — never one scalar z per face; scalar sorting breaks for large
 * receivers, tilted faces, and coplanar contacts.
 *
 * Owner exclusion: each segment carries `ownerKeys` (the face keys it belongs
 * to), so a face never occludes itself or its own edges; adjacent faces are
 * disarmed along shared boundaries by the depth bias (their planes agree
 * there). Occluders flagged `onlyOwnObject` (x-ray objects) only test
 * segments of the SAME object — x-ray never hides others. Ground/backdrop
 * are simply never handed in as occluders (F-03).
 *
 * Fallback (F-05): a face whose projected polygon is NOT affine in
 * screen+depth space beyond a small residual (e.g. a non-planar quad under
 * perspective) marks the clipper `ambiguous`; createClipper then routes every
 * visibility query through the Scene3D.Depth buffer (owner-aware) built from
 * the fan-triangulated occluder set. Depth convention: larger z = nearer.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const { clamp, finite, lerp, pathWithMeta, markHidden } = G3;

  const EPS = 1e-9;
  // Max |plane(x,y) − vertex depth| (mm) before a face is considered
  // non-planar in screen+depth space (→ depth-buffer fallback).
  const PLANAR_RESIDUAL_TOL = 0.05;
  // Sample pitch (document mm) along tested paths.
  const SAMPLE_STEP = 2.5;
  // Perpendicular-distance floor for the collinear decimation of sampled runs.
  const COLLINEAR_EPS = 1e-6;

  const polygonBounds = (polygon) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    polygon.forEach((pt) => {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
    return { minX, minY, maxX, maxY };
  };

  const pointInPolygon = (pt, polygon) => {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      if (!a || !b) continue;
      const intersect =
        ((a.y > pt.y) !== (b.y > pt.y)) &&
        (pt.x < ((b.x - a.x) * (pt.y - a.y)) / ((b.y - a.y) || EPS) + a.x);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const polygonArea2 = (polygon) => {
    let area = 0;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      area += (polygon[j].x * polygon[i].y) - (polygon[i].x * polygon[j].y);
    }
    return Math.abs(area) / 2;
  };

  // Fit the support plane d(x, y) = A·x + B·y + C over the projected polygon
  // (vertices {x, y, z}) via Newell's method in (x, y, depth) space. Returns
  // null for edge-on faces (no usable plane).
  const fitSupportPlane = (polygon) => {
    let nx = 0; let ny = 0; let nz = 0;
    let cx = 0; let cy = 0; let cz = 0;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const current = polygon[i];
      const next = polygon[(i + 1) % n];
      nx += (current.y - next.y) * (current.z + next.z);
      ny += (current.z - next.z) * (current.x + next.x);
      nz += (current.x - next.x) * (current.y + next.y);
      cx += current.x; cy += current.y; cz += current.z;
    }
    cx /= n; cy /= n; cz /= n;
    if (Math.abs(nz) < EPS) return null; // edge-on in screen space
    const A = -nx / nz;
    const B = -ny / nz;
    const C = cz - A * cx - B * cy;
    let residual = 0;
    polygon.forEach((pt) => {
      const err = Math.abs(A * pt.x + B * pt.y + C - pt.z);
      if (err > residual) residual = err;
    });
    return { A, B, C, residual };
  };

  // faces: [{ id, objectId, polygon: [{x,y,z}…], neverOccludes, onlyOwnObject }]
  const buildOccluders = (faces) => {
    const occluders = [];
    let ambiguous = false;
    (Array.isArray(faces) ? faces : []).forEach((face) => {
      if (!face || face.neverOccludes) return;
      const polygon = Array.isArray(face.polygon) ? face.polygon.filter(
        (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z)) : [];
      if (polygon.length < 3) return;
      if (polygonArea2(polygon) < 1e-6) return; // degenerate footprint occludes nothing
      const plane = fitSupportPlane(polygon);
      if (!plane) return; // edge-on: zero-width footprint, skip
      if (plane.residual > PLANAR_RESIDUAL_TOL) ambiguous = true;
      occluders.push({
        id: face.id,
        objectId: face.objectId,
        // X-ray faces occlude ONLY their own object (dash its hidden edges);
        // they never hide anyone else.
        limitToObject: Boolean(face.onlyOwnObject),
        polygon,
        plane,
        bbox: polygonBounds(polygon),
      });
    });
    return { occluders, ambiguous };
  };

  const planeDepthAt = (occluder, x, y) =>
    occluder.plane.A * x + occluder.plane.B * y + occluder.plane.C;

  // Greedy 3-point collinearity filter (same class as geometry3d.js's
  // allowlisted floating-horizon decimator — NOT an RDP/Visvalingam
  // simplifier, so it does not route through GeometryUtils.simplifyPath):
  // sampled runs of straight segments collapse back to their
  // direction-changing vertices, at fp-noise tolerance only.
  const dropCollinearSamples = (pts) => {
    if (pts.length <= 2) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = out[out.length - 1];
      const b = pts[i];
      const c = pts[i + 1];
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(cross) > Math.hypot(c.x - a.x, c.y - a.y) * COLLINEAR_EPS) out.push(b);
    }
    out.push(pts[pts.length - 1]);
    return out;
  };

  // The clipper: one visibility oracle for the whole scene. Flat-face
  // support-plane path by default; owner-aware depth-buffer fallback when any
  // occluder is ambiguous (F-05).
  const createClipper = (faces, opts = {}) => {
    const bias = finite(opts.bias, 0.5);
    const { occluders, ambiguous } = buildOccluders(faces);
    let buffer = null;
    if (ambiguous) {
      const Depth = Vectura.Scene3D && Vectura.Scene3D.Depth;
      if (Depth && typeof Depth.build === 'function') {
        const tris = [];
        occluders.forEach((occ) => {
          // Simple heuristic (Phase 1): x-ray occluders stay out of the shared
          // buffer — the buffer's owner channel can only exclude, not scope an
          // occluder to one object's segments.
          if (occ.limitToObject) return;
          const poly = occ.polygon;
          for (let i = 1; i + 1 < poly.length; i++) {
            tris.push({
              pts: [
                { x: poly[0].x, y: poly[0].y, d: poly[0].z },
                { x: poly[i].x, y: poly[i].y, d: poly[i].z },
                { x: poly[i + 1].x, y: poly[i + 1].y, d: poly[i + 1].z },
              ],
              owner: occ.id,
            });
          }
        });
        buffer = Depth.build(tris, opts.depthBuffer || {});
      }
    }

    // seg: { ownerKeys: [faceKey…], objectId } — context for owner exclusion.
    const hiddenAt = (x, y, z, seg) => {
      if (buffer) {
        // Owner-aware buffer lookup: exclude the segment's primary face. The
        // secondary adjacent face agrees with the sample along the shared
        // edge, so the bias absorbs it. The buffer path needs a floor of 0.5
        // regardless of the caller's bias — per-cell depth interpolation is
        // quantized, unlike the exact support-plane evaluation.
        const owner = seg.ownerKeys && seg.ownerKeys.length ? seg.ownerKeys[0] : undefined;
        return buffer.depthAt(x, y, owner) > z + Math.max(bias, 0.5);
      }
      for (let k = 0; k < occluders.length; k++) {
        const occ = occluders[k];
        if (seg.ownerKeys && seg.ownerKeys.indexOf(occ.id) !== -1) continue; // own face
        if (occ.limitToObject && occ.objectId !== seg.objectId) continue; // x-ray occluder
        if (x < occ.bbox.minX || x > occ.bbox.maxX || y < occ.bbox.minY || y > occ.bbox.maxY) continue;
        if (planeDepthAt(occ, x, y) <= z + bias) continue; // not nearer here
        if (pointInPolygon({ x, y }, occ.polygon)) return true;
      }
      return false;
    };

    // Split a polyline (points carry {x, y, z}) into visible/hidden runs.
    // Returns { fullyVisible, runs: [{ visible, pts }] }; run points are
    // decimated back to their direction-changing vertices. Visibility flips
    // between samples are bisected to the true crossing so a clipped line
    // stops ON the silhouette it was cut at (not up to one sample short) and
    // corner whiskers collapse below the emission floor.
    const clipPath = (pts, seg = {}) => {
      const clean = (Array.isArray(pts) ? pts : []).filter(
        (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y));
      if (clean.length < 2) return { fullyVisible: false, runs: [] };
      const runs = [];
      let current = null;
      let currentVisible = null;
      let prev = null;
      let sawHidden = false;
      const flush = () => {
        if (current && current.length >= 2) runs.push({ visible: currentVisible, pts: dropCollinearSamples(current) });
        current = null;
      };
      const crossing = (a, b, visA) => {
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 20; i++) {
          const m = (lo + hi) / 2;
          const x = lerp(a.x, b.x, m);
          const y = lerp(a.y, b.y, m);
          const z = lerp(a.z, b.z, m);
          if (!hiddenAt(x, y, z, seg) === visA) lo = m; else hi = m;
        }
        const t = (lo + hi) / 2;
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
      };
      const push = (x, y, z) => {
        const pt = { x, y, z };
        const visible = !hiddenAt(x, y, z, seg);
        if (!visible) sawHidden = true;
        if (current && currentVisible !== visible && prev) {
          // Refine the crossover and hand it to BOTH runs so the border is shared.
          const edge = crossing(prev, pt, currentVisible);
          current.push({ x: edge.x, y: edge.y });
          flush();
          current = [{ x: edge.x, y: edge.y }];
          currentVisible = visible;
        }
        if (!current) { current = []; currentVisible = visible; }
        current.push({ x, y });
        prev = pt;
      };
      for (let s = 0; s < clean.length - 1; s++) {
        const a = clean[s];
        const b = clean[s + 1];
        const za = finite(a.z, 0);
        const zb = finite(b.z, 0);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = clamp(Math.round(len / SAMPLE_STEP) + 1, 2, 400);
        for (let i = (s === 0 ? 0 : 1); i <= steps; i++) {
          const t = i / steps;
          push(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(za, zb, t));
        }
      }
      flush();
      return { fullyVisible: !sawHidden, runs };
    };

    return { ambiguous: Boolean(buffer), occluders, clipPath, bias };
  };

  // Convenience wrapper (and the shape the unit tests exercise): clip 2-point
  // segments against face polygons. segments: [{ a:{x,y,z}, b:{x,y,z}, meta,
  // ownerKeys, objectId, mode: 'remove'|'dash' }].
  const occludeSegments = (segments, faces, opts = {}) => {
    const clipper = createClipper(faces, opts);
    const out = [];
    (Array.isArray(segments) ? segments : []).forEach((seg) => {
      if (!seg || !seg.a || !seg.b) return;
      const mode = (seg.mode || opts.mode) === 'dash' ? 'dash' : 'remove';
      const { runs } = clipper.clipPath([seg.a, seg.b], seg);
      runs.forEach((run) => {
        if (run.visible) {
          out.push(pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null));
        } else if (mode === 'dash') {
          out.push(markHidden(pathWithMeta(run.pts, seg.meta ? { ...seg.meta } : null)));
        }
      });
    });
    return out;
  };

  const api = {
    PLANAR_RESIDUAL_TOL,
    buildOccluders,
    fitSupportPlane,
    planeDepthAt,
    pointInPolygon,
    createClipper,
    occludeSegments,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { HLR: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
