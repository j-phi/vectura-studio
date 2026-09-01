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
 *
 * Self-occlusion (F7): `seg.selfObject` disarms same-object occluders
 * entirely — correct for a CONVEX object (its own front-facing surface can
 * never hide another front-facing patch of itself). `seg.selfOcclude` (set
 * only for a non-convex object — see scene3d.js's segCtx / scene.js's
 * `record.convex`) re-arms them, subject to SELF_OCCLUDE_BIAS so real
 * self-occlusion crossings still register while same-surface tessellation
 * noise doesn't.
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
  // F7 self-occlusion depth margin (mm). A fill/ribbon sample is taken from
  // the object's exact ANALYTIC surface, while its own occluder faces are a
  // flat-tessellated (chorded) approximation of that same surface — the two
  // disagree by up to the tessellation's own sagitta at their shared patch.
  // MEASURED on the torus fixture (default detail 24): a long, re-stitched
  // ribbon chain ('onePenDown' — the one law whose rulings are CHAINED across
  // most of the visible surface before self-occlusion is even tested, so it
  // samples far more of the mesh's own chording than a single, short ruling
  // does) threw up to ~5 mm of spurious same-surface "self-occlusion" at
  // 1.5 mm bias; every OTHER bucket-B law's genuine self-occlusion (the
  // torus's near tube wall hiding its own far wall through the hole) measured
  // a real 3-D gap of 10 mm or more, never once falling below that. 6 mm sits
  // comfortably above the former and comfortably below the latter, so it
  // fires only on a real crossing, never on same-surface tessellation noise.
  const SELF_OCCLUDE_BIAS = 6;
  // Sample pitch (document mm) along tested paths.
  const SAMPLE_STEP = 2.5;
  // Draft-only coarser sample pitch (P5). Gated STRICTLY on opts.draft being
  // truthy at createClipper() time (never inferred, never defaulted true) —
  // the settled/full-quality render must stay byte-identical to today, and
  // this multiplier is the one part of this batch allowed to move what gets
  // drawn (fewer, coarser samples along a clipped path during a live drag).
  const DRAFT_SAMPLE_STEP_MULT = 2.4;
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
    // Append one occluder record for `polygon` under `face`'s identity. Shared so
    // a whole face and each of its triangulated pieces carry the SAME id/objectId
    // (owner exclusion stays intact — a face never occludes its own segments).
    const pushOccluder = (face, polygon, plane) => {
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
    };
    (Array.isArray(faces) ? faces : []).forEach((face) => {
      if (!face || face.neverOccludes) return;
      const polygon = Array.isArray(face.polygon) ? face.polygon.filter(
        (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) && Number.isFinite(pt.z)) : [];
      if (polygon.length < 3) return;
      if (polygonArea2(polygon) < 1e-6) return; // degenerate footprint occludes nothing
      const plane = fitSupportPlane(polygon);
      if (!plane) return; // edge-on: zero-width footprint, skip
      if (plane.residual <= PLANAR_RESIDUAL_TOL) {
        pushOccluder(face, polygon, plane); // planar (tri, box quad, ground) — keep whole
        return;
      }
      // Non-planar in screen+depth (an n-gon solid/imported/CSG face, or a quad
      // whose projected depth is non-affine under perspective). Rather than flip
      // the WHOLE clipper to the coarse owner-aware depth buffer — too coarse to
      // resolve one curved object occluding another → cross-object peek-through —
      // fan-triangulate this face. Three points always define a plane exactly, so
      // each triangle is planar and the precise support-plane clip path is kept.
      let addedTriangle = false;
      for (let i = 1; i + 1 < polygon.length; i++) {
        const tri = [polygon[0], polygon[i], polygon[i + 1]];
        if (polygonArea2(tri) < 1e-6) continue; // skip zero-area slivers
        const triPlane = fitSupportPlane(tri);
        if (!triPlane) continue; // edge-on sliver
        pushOccluder(face, tri, triPlane);
        addedTriangle = true;
      }
      // Guard: a face that yields no usable planar triangle (all slivers) falls
      // back to the depth buffer so it still occludes SOMETHING.
      if (!addedTriangle) {
        pushOccluder(face, polygon, plane);
        ambiguous = true;
      }
    });
    return { occluders, ambiguous };
  };

  const planeDepthAt = (occluder, x, y) =>
    occluder.plane.A * x + occluder.plane.B * y + occluder.plane.C;

  // ── Occluder spatial index (perf) ───────────────────────────────────────
  // hiddenAt used to linear-scan every occluder for every one of up to 400
  // samples per clipped path — O(paths × samples × occluders). Profiling a
  // 12→24 object draft frame showed that scan at 88-96% of total draft
  // regen time, scaling ~360× over a 24× increase in occluder×sample work
  // (quadratic, since both occluder count and sample count grow with scene
  // size). This is a UNIFORM GRID over occluder screen-space bboxes: build
  // once per createClipper() call (one clip batch = one frame), then every
  // hiddenAt() query looks up only the occluders whose bbox could possibly
  // cover the query point via O(1) cell math, instead of the whole set.
  //
  // A uniform grid (not a BVH/quadtree) was chosen because scene3d occluder
  // bboxes are all roughly similar in scale within one frame (one camera,
  // one set of comparably-sized primitives) — the pathological case a grid
  // handles badly (wildly different bbox sizes clustering into few cells)
  // does not arise here, and a flat grid is the cheapest structure to build
  // fresh every frame (no tree balancing) and to query (integer div, no
  // recursion) on the hot path.
  //
  // Correctness (byte-identity): every occluder is inserted into every grid
  // cell its bbox overlaps, so for any query point p, every occluder whose
  // bbox contains p is guaranteed present in p's cell list — cellXOf/cellYOf
  // are monotonic non-decreasing in x/y, so p's cell index always falls
  // within [cellOf(bbox.min), cellOf(bbox.max)]. The per-occluder bbox/plane/
  // polygon checks inside hiddenAt are UNCHANGED and still run on every
  // candidate — the index only shrinks the candidate set, it never changes
  // which occluders are considered "in range" at a given point, and it never
  // reorders relative to the original occluders array (insertion is a single
  // ascending pass), so the first-match short-circuit in hiddenAt behaves
  // identically to the plain linear scan.
  const GRID_MAX_AXIS_CELLS = 128;
  const GRID_TARGET_PER_CELL = 2;

  const buildOccluderIndex = (occluders) => {
    const n = occluders.length;
    if (!n) return null;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const b = occluders[i].bbox;
      if (!Number.isFinite(b.minX) || !Number.isFinite(b.minY) ||
          !Number.isFinite(b.maxX) || !Number.isFinite(b.maxY)) continue;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) ||
        !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    const width = Math.max(maxX - minX, EPS);
    const height = Math.max(maxY - minY, EPS);
    const targetCells = Math.max(1, Math.ceil(n / GRID_TARGET_PER_CELL));
    const aspect = width / height;
    let cols = clamp(Math.round(Math.sqrt(targetCells * aspect)), 1, GRID_MAX_AXIS_CELLS);
    let rows = clamp(Math.round(targetCells / cols), 1, GRID_MAX_AXIS_CELLS);
    const cellW = width / cols;
    const cellH = height / rows;
    const cellXOf = (x) => clamp(Math.floor((x - minX) / cellW), 0, cols - 1);
    const cellYOf = (y) => clamp(Math.floor((y - minY) / cellH), 0, rows - 1);
    const grid = new Array(cols * rows).fill(null);
    for (let i = 0; i < n; i++) {
      const b = occluders[i].bbox;
      const cx0 = cellXOf(b.minX); const cx1 = cellXOf(b.maxX);
      const cy0 = cellYOf(b.minY); const cy1 = cellYOf(b.maxY);
      for (let cy = cy0; cy <= cy1; cy++) {
        const rowBase = cy * cols;
        for (let cx = cx0; cx <= cx1; cx++) {
          const idx = rowBase + cx;
          const cell = grid[idx];
          if (cell) cell.push(i); else grid[idx] = [i];
        }
      }
    }
    return {
      query: (x, y) => {
        if (x < minX || x > maxX || y < minY || y > maxY) return null;
        return grid[cellYOf(y) * cols + cellXOf(x)];
      },
    };
  };

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
    // Built once per clipper (one clip batch = one frame) and reused across
    // every clipPath()/hiddenAt() call the caller makes with this clipper —
    // including shadows.js's per-hatch-line clipPath calls, which reuse this
    // SAME clipper instance (it is handed to Shadows.build as `clipper`), so
    // shadow generation gets the identical speedup with no code of its own.
    //
    // Test seam: opts.disableIndex (or the module-level api.__forceLinearScan
    // flag below) forces the pre-index linear scan even when a valid index
    // could be built. Nothing in production code sets either — it exists so
    // a test can compute indexed-vs-brute-force output in the SAME run and
    // assert they are identical, instead of only comparing against a static
    // fingerprint that goes stale whenever scene geometry legitimately
    // changes. See scene3d-hlr-spatial-index-identity.test.js.
    const forceLinearScan = Boolean(opts.disableIndex || api.__forceLinearScan);
    const index = (buffer || forceLinearScan) ? null : buildOccluderIndex(occluders);

    // seg: { ownerKeys: [faceKey…], objectId } — context for owner exclusion.
    const hiddenAt = (x, y, z, seg) => {
      // F7b — optional ANALYTIC self-occlusion source (Scene3D.TorusOcclusion,
      // built from a closed-form ray/torus intersection — see that module's
      // header for why the mesh-based test below needs a wide tessellation-
      // noise margin that makes it blind to a shallow cusp crossing, while an
      // exact analytic surface has no such noise and can use a tight one).
      // Purely additive (OR'd in): it can only make a sample MORE hidden than
      // the mesh test alone would, never less, and is a no-op (undefined)
      // for every object that doesn't supply one.
      if (seg && typeof seg.analyticOccluder === 'function' && seg.analyticOccluder(x, y, z)) return true;
      if (buffer) {
        // Owner-aware buffer lookup: exclude the segment's primary face. The
        // secondary adjacent face agrees with the sample along the shared
        // edge, so the bias absorbs it. The buffer path needs a floor of 0.5
        // regardless of the caller's bias — per-cell depth interpolation is
        // quantized, unlike the exact support-plane evaluation.
        // Continuous surface hatch lies ON the front surface, so in the rare
        // buffer-fallback path treat it as visible rather than self-occluding
        // — UNLESS this is a non-convex object opted into real self-occlusion
        // (seg.selfOcclude), in which case the owner-aware buffer lookup below
        // already excludes only the segment's own face, so the normal
        // (larger, tessellation-noise-safe) margin is used instead.
        if (seg.selfObject && !seg.selfOcclude) return false;
        const owner = seg.ownerKeys && seg.ownerKeys.length ? seg.ownerKeys[0] : undefined;
        const buf = seg.selfOcclude ? Math.max(bias, SELF_OCCLUDE_BIAS) : Math.max(bias, 0.5);
        return buffer.depthAt(x, y, owner) > z + buf;
      }
      // Candidate set from the spatial index (every occluder whose bbox could
      // contain (x,y) — see buildOccluderIndex's correctness note); falls
      // back to the full occluders array when there is no index (e.g. a
      // degenerate/empty scene). The per-candidate checks below are UNCHANGED
      // from the plain linear scan.
      const candidates = index ? index.query(x, y) : occluders;
      if (!candidates) return false;
      for (let k = 0; k < candidates.length; k++) {
        const occ = index ? occluders[candidates[k]] : candidates[k];
        if (seg.ownerKeys && seg.ownerKeys.indexOf(occ.id) !== -1) continue; // own face
        const sameObject = occ.objectId === seg.objectId;
        // Continuous surface hatch: a CONVEX object never occludes its own
        // fill (it lies ON the front surface, and a convex body can't have a
        // second front-facing patch behind the first along one ray) — that
        // stays the byte-identical fast path. F7: a non-convex object
        // (seg.selfOcclude, set only for the torus/imported-mesh self-
        // occlusion gate — see scene3d.js's segCtx construction) genuinely
        // can, so it falls through to the real depth test below instead of
        // being skipped outright.
        if (seg.selfObject && sameObject && !seg.selfOcclude) continue;
        if (occ.limitToObject && occ.objectId !== seg.objectId) continue; // x-ray occluder
        if (x < occ.bbox.minX || x > occ.bbox.maxX || y < occ.bbox.minY || y > occ.bbox.maxY) continue;
        // Self-occlusion needs a wider depth margin than cross-object
        // occlusion — see SELF_OCCLUDE_BIAS above.
        const effBias = (seg.selfOcclude && sameObject) ? Math.max(bias, SELF_OCCLUDE_BIAS) : bias;
        if (planeDepthAt(occ, x, y) <= z + effBias) continue; // not nearer here
        if (pointInPolygon({ x, y }, occ.polygon)) return true;
      }
      return false;
    };

    // P5: coarser sample pitch, draft ONLY. `opts.draft` defaults falsy, and
    // today's one real caller (scene3d.js's createClipper(faces, { bias })
    // call) never sets it — so this is dormant on the live app until that
    // call site opts in; every scene below keeps SAMPLE_STEP exactly as
    // before.
    const sampleStep = opts.draft ? SAMPLE_STEP * DRAFT_SAMPLE_STEP_MULT : SAMPLE_STEP;

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
        const steps = clamp(Math.round(len / sampleStep) + 1, 2, 400);
        for (let i = (s === 0 ? 0 : 1); i <= steps; i++) {
          const t = i / steps;
          push(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(za, zb, t));
        }
      }
      flush();
      return { fullyVisible: !sawHidden, runs };
    };

    // Exposed (F7) so a caller can pre-test a single point's visibility
    // BEFORE building path geometry around it — see surface-fill.js's
    // `selfOcclusionTest` / `ribbonize` pre-split. `clipPath` already used
    // this internally; it just wasn't reachable from outside the closure.
    return { ambiguous: Boolean(buffer), occluders, clipPath, hiddenAt, bias };
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
    // Test seam (P5): the draft-only coarser sample pitch is not otherwise
    // observable except through the resulting geometry, so unit tests can
    // derive expected sample spacing directly instead of hardcoding it.
    SAMPLE_STEP,
    DRAFT_SAMPLE_STEP_MULT,
    // Test seam: when true, createClipper always falls back to the linear
    // occluder scan (see forceLinearScan above), even where an index would
    // normally be built. Defaults false; production code never sets this.
    __forceLinearScan: false,
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
