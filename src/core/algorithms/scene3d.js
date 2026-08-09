/**
 * scene3d algorithm — 3D Scene Studio Phase 1 orchestrator.
 *
 * Pipeline (spec §6): S1 assemble (Scene3D.Scene) → S2 project → S3 classify
 * edges (Scene3D.Edges) → S6 visibility (Scene3D.HLR flat-face fast path,
 * Scene3D.Depth fallback) → emit paths stamped with the CONTRACT B meta
 * channel (kind sceneFace/sceneEdge/sceneFill + sceneTarget + penId).
 *
 * Style resolution routes through Vectura.Scene3D.StyleCascade (CONTRACT C,
 * owned by stream 1B) when present; a neutral { penId: null, mapper: 'none' }
 * fallback keeps this stream self-sufficient. Phase 1 mappers: none | hatch |
 * wireframe.
 *
 * Determinism (A-17): no randomness anywhere — the same params + bounds
 * produce byte-identical output.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const G3 = Vectura.Geometry3D;
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const { finite, clamp, pathWithMeta, markHidden, hatchPolygon,
    v, add, sub, mul, dot, cross, normalize,
    strokeTreatment, applyStrokeTreatment, overstrokeCopy, NO_STROKE_TREATMENT } = G3;

  // Support-plane depth is exact, so the anti-z-fight bias can sit just above
  // fp/perspective-fit noise. A large bias grows "whisker" stubs where hidden
  // edges leave a silhouette corner (the covering face's plane depth converges
  // to the edge's own depth there). The depth-buffer fallback floors this to
  // 0.5 internally (quantized cells need the headroom).
  const HLR_BIAS = 0.05;
  // Emission floor (document mm): visibility crumbs shorter than this draw as
  // dots at best on a plotter and are usually corner-transition artifacts.
  const MIN_RUN_MM = 0.6;

  const runLength = (pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  };

  // ── CtS I5 — depth-slice ('contourSlice') geometry + budgets ────────────────
  // Slice an assembled mesh with parallel planes (topographic cross-sections),
  // mirroring topoform's trianglePlaneSegment cut math (topoform.js:132-147) but
  // generalized to an arbitrary plane orientation and working directly in WORLD
  // space, so every cut point projects to an EXACT camera depth for HLR.
  //
  // Anti-hang backstop ONLY: slicing by N planes costs triCount × planes cheap
  // world-space cuts. This cap is set high enough that it NEVER bites at
  // primitiveDetail ≤ 100 (a detail-100 topoform is ~40k faces ≈ 80k tris; even
  // at the max 120 planes that is ~9.6M cuts, well under the budget) — so the
  // effective plane count stays a pure function of sliceCount. It exists only to
  // stop a truly pathological (programmatic, out-of-slider-range) detail from
  // hanging. The real render cost is the HLR clip work, bounded in the pass.
  const SLICE_TRI_BUDGET = 24000000;

  // buildSliceSegments({ world, faces, front?, sliceCount, sliceRotate, sliceTilt })
  //   world       [{x,y,z}]  world-space vertices (record.world)
  //   faces       [[i,j,k…]] index faces (record.faceIndexArrays); quads+ fan
  //   front       [bool]     per-face front flag (record.faces[i].front), 1:1
  //   sliceCount             plane count (clamped 2..120, then arithmetic-capped)
  //   sliceRotate/Tilt (deg) plane orientation (topoform planeRotate/planeTilt)
  // Returns { segments: [{ a:{x,y,z}, b:{x,y,z}, front, plane }], planes }. Each
  // segment is tagged with its 1-based `plane` index so the caller can link the
  // per-triangle cuts of a single plane into continuous contour polylines (the
  // 2D linkSegments key is only unique WITHIN a plane). Pure + deterministic (no
  // RNG). A plane outside [minD,maxD] never crosses a face, so only in-range
  // planes emit segments.
  const buildSliceSegments = (opts = {}) => {
    const world = Array.isArray(opts.world) ? opts.world : [];
    const faces = Array.isArray(opts.faces) ? opts.faces : [];
    const front = Array.isArray(opts.front) ? opts.front : null;
    if (!world.length || !faces.length) return { segments: [], planes: 0 };
    let count = Math.max(2, Math.round(finite(opts.sliceCount, 26)));
    // Plane normal = world +z after rotate(yaw:sliceRotate, pitch:sliceTilt),
    // matching rotatePoint's yaw→pitch order (geometry3d.js). Cutting on the
    // scalar d = v·N keeps the crossing point in world space (no inverse
    // rotation), so its projected depth is exact.
    const yr = (finite(opts.sliceRotate, 0) * Math.PI) / 180;
    const pr = (finite(opts.sliceTilt, 0) * Math.PI) / 180;
    const cy = Math.cos(yr); const sy = Math.sin(yr);
    const cp = Math.cos(pr); const sp = Math.sin(pr);
    const nx = -sy * cp; const ny = sp; const nz = cy * cp;
    const d = new Array(world.length);
    let minD = Infinity; let maxD = -Infinity;
    for (let i = 0; i < world.length; i++) {
      const w = world[i];
      const dv = w.x * nx + w.y * ny + w.z * nz;
      d[i] = dv;
      if (dv < minD) minD = dv;
      if (dv > maxD) maxD = dv;
    }
    let triCount = 0;
    for (let f = 0; f < faces.length; f++) triCount += Math.max(0, faces[f].length - 2);
    if (triCount > 0) {
      const planeCap = Math.max(2, Math.floor(SLICE_TRI_BUDGET / triCount));
      if (count > planeCap) count = planeCap;
    }
    const span = (maxD - minD) || 1;
    const segments = [];
    const edgeCross = (va, vb, dva, dvb, level, pts) => {
      const ea = dva - level;
      const eb = dvb - level;
      if (Math.abs(ea) < 1e-6) pts.push({ x: va.x, y: va.y, z: va.z });
      if (ea * eb < 0) {
        const t = Math.abs(ea) / (Math.abs(ea) + Math.abs(eb));
        pts.push({ x: va.x + (vb.x - va.x) * t, y: va.y + (vb.y - va.y) * t, z: va.z + (vb.z - va.z) * t });
      }
    };
    for (let level = 1; level <= count; level++) {
      const z = minD + (level / (count + 1)) * span;
      for (let f = 0; f < faces.length; f++) {
        const face = faces[f];
        const isFront = front ? front[f] !== false : true;
        // Fan-triangulate the (quad+) face; cut each triangle at z.
        for (let t = 1; t + 1 < face.length; t++) {
          const ia = face[0]; const ib = face[t]; const ic = face[t + 1];
          const pa = world[ia]; const pb = world[ib]; const pc = world[ic];
          if (!pa || !pb || !pc) continue;
          const pts = [];
          edgeCross(pa, pb, d[ia], d[ib], z, pts);
          if (pts.length < 2) edgeCross(pb, pc, d[ib], d[ic], z, pts);
          if (pts.length < 2) edgeCross(pc, pa, d[ic], d[ia], z, pts);
          if (pts.length < 2) continue;
          segments.push({ a: pts[0], b: pts[1], front: isFront, plane: level });
        }
      }
    }
    return { segments, planes: count };
  };

  // FIXED HLR work budget for the contourSlice pass, expressed in OCCLUDER-TESTS.
  // clipPath resamples each path every ~SLICE_SAMPLE_STEP mm and tests every
  // sample against every occluder face, so the true cost of clipping a path is
  // (pathLength / step) × occluders — NOT "one test per segment": a long linked
  // ring costs its length in samples (up to ~400 per straight span), so a naive
  // clip-CALL count undercounts by that per-clip sample factor. The pass tracks
  // this actual cost and, once the budget is spent, emits the remaining front
  // rings RAW (un-occluded) so every plane still draws — only occlusion fidelity
  // degrades on a pathological (detail > 100) density. The plane count is never
  // touched, so it stays a pure function of sliceCount (camera pose, occluder
  // count, other scene objects, and draft-vs-full never change it).
  const SLICE_SAMPLE_STEP = 2.5; // mirrors HLR SAMPLE_STEP (hlr.js)
  const SLICE_CLIP_WORK = 35000000;

  const Scene3DNS = (Vectura.Scene3D = Vectura.Scene3D || {});
  Scene3DNS.Slices = { buildSliceSegments };

  const FALLBACK_STYLE = { penId: null, mapper: 'none', params: {} };

  // Mappers that fill the SURFACE (vs 'none' = outlines, 'wireframe' = edges).
  // A surface fill replaces the face outline + creases with the treatment.
  // hatch/crosshatch are line fills handled in-plane; contour/spiral/stipple are
  // region fills delegated to Scene3D.Mappers on the projected region polygon.
  const SURFACE_FILL = new Set(['hatch', 'crosshatch', 'contour', 'spiral', 'stipple']);
  const REGION_MAPPERS = new Set(['contour', 'spiral', 'stipple']);

  const makeStyleResolver = (styleTable) => {
    const cascade = Vectura.Scene3D && Vectura.Scene3D.StyleCascade;
    const cache = new Map();
    return (objectId, faceId) => {
      const key = `${objectId}/${faceId}`;
      if (cache.has(key)) return cache.get(key);
      let style = FALLBACK_STYLE;
      if (cascade && typeof cascade.resolve === 'function') {
        try {
          style = cascade.resolve(styleTable, { objectId, faceId }) || FALLBACK_STYLE;
        } catch (err) {
          style = FALLBACK_STYLE;
        }
      }
      cache.set(key, style);
      return style;
    };
  };

  // Fold every CSG record's per-fragment source-attributed styles into a
  // NON-PERSISTENT clone of the style table, so a combined unit's fragments
  // resolve to their originating objects through the ordinary byFace cascade.
  // Keys are `${record.id}/${faceId}` — record.id is the primary the carve
  // borrows, faceId the unique `face:csg:<i>`, so entries never collide. Returns
  // the ORIGINAL table (same reference) when no record carries overrides, so the
  // common single-style case is byte-identical.
  const mergeCsgFaceStyles = (styleTable, records) => {
    const extra = {};
    let any = false;
    (records || []).forEach((r) => {
      const ov = r && r.faceStyleOverrides;
      if (!ov) return;
      Object.keys(ov).forEach((faceId) => { extra[`${r.id}/${faceId}`] = ov[faceId]; any = true; });
    });
    if (!any) return styleTable;
    const src = styleTable && typeof styleTable === 'object' ? styleTable : {};
    return { ...src, byFace: { ...(src.byFace || {}), ...extra } };
  };

  // fillDensity (0–100) → hatch spacing in document mm. Monotonic: denser in,
  // tighter lines out; hatchPolygon floors spacing at 1.
  const hatchSpacing = (density) => Math.max(1, 14 - 0.13 * clamp(finite(density, 50), 0, 100));

  // Strip the geometry-mutating part of a treatment, keeping only the line-type
  // dash. Edges and per-face outlines are DOUBLE-DRAWN (the face outline loop and
  // the silhouette/crease/boundary edge pass both emit the same structural edge);
  // wobbling only one copy would split them. So structural lines take dash only,
  // while sceneFill lines (unique, no double-draw) take the full wobble/overstroke.
  const dashOnly = (tr) => {
    if (!tr || (tr.wobble <= 0 && !tr.overstroke)) return tr;
    return {
      lineType: tr.lineType, dash: tr.dash, wobble: 0, wobbleScale: tr.wobbleScale,
      overstroke: false, amp: 0, active: Boolean(tr.dash),
    };
  };

  // The 2D boundary of a set of front faces = edges shared by exactly one face
  // in the set (interior edges appear twice and cancel). Returns [[p0,p1],…] in
  // projected 2D. This silhouette (outer rim + any holes) is what a continuous
  // surface hatch fills, via the even-odd rule below.
  const frontRegionBoundary = (record, faceIndices) => {
    const counts = new Map();
    const seg = new Map();
    faceIndices.forEach((fi) => {
      const idx = record.faceIndexArrays[fi];
      if (!Array.isArray(idx)) return;
      for (let e = 0, f = idx.length - 1; e < idx.length; f = e++) {
        const a = idx[f]; const b = idx[e];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!seg.has(key)) seg.set(key, [a, b]);
      }
    });
    const out = [];
    counts.forEach((c, key) => {
      if (c !== 1) return;
      const [a, b] = seg.get(key);
      const pa = record.projected[a]; const pb = record.projected[b];
      if (pa && pb && Number.isFinite(pa.x) && Number.isFinite(pb.x)) {
        out.push([{ x: pa.x, y: pa.y }, { x: pb.x, y: pb.y }]);
      }
    });
    return out;
  };

  // Scanline hatch across the region bounded by `segments` (an arbitrary set of
  // 2D edges forming one or more closed loops), even-odd rule so holes stay
  // empty. Returns [[p0,p1],…]. Continuous across the whole surface, unlike
  // per-face hatching of a fine tessellation.
  const hatchSegments = (segments, angleDeg, spacing) => {
    if (!segments.length) return [];
    const ang = finite(angleDeg, 45) * Math.PI / 180;
    const dirX = Math.cos(ang); const dirY = Math.sin(ang);
    const perpX = -dirY; const perpY = dirX;
    let pMin = Infinity; let pMax = -Infinity;
    segments.forEach(([a, b]) => {
      [a, b].forEach((p) => {
        const proj = p.x * perpX + p.y * perpY;
        if (proj < pMin) pMin = proj;
        if (proj > pMax) pMax = proj;
      });
    });
    if (!Number.isFinite(pMin)) return [];
    const sp = Math.max(1, spacing);
    const count = Math.min(3000, Math.floor((pMax - pMin) / sp));
    const out = [];
    for (let i = 1; i <= count; i++) {
      const offset = pMin + i * sp;
      const hits = [];
      segments.forEach(([a, b]) => {
        const pa = a.x * perpX + a.y * perpY;
        const pb = b.x * perpX + b.y * perpY;
        if ((pa > offset) === (pb > offset)) return;
        const t = (offset - pa) / ((pb - pa) || 1e-9);
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        hits.push({ s: x * dirX + y * dirY, x, y });
      });
      hits.sort((p, q) => p.s - q.s);
      // Even-odd: fill between hit pairs (0-1, 2-3, …).
      for (let k = 0; k + 1 < hits.length; k += 2) {
        out.push([{ x: hits[k].x, y: hits[k].y }, { x: hits[k + 1].x, y: hits[k + 1].y }]);
      }
    }
    return out;
  };

  const sceneTargetMeta = (objectId, face, edgeClass, depthZ, occluded) => {
    const normal = (face && face.normalWorld) || { x: 0, y: 0, z: 1 };
    return {
      objectId,
      faceId: face ? face.faceId : null,
      edgeClass: edgeClass || null,
      depth: -finite(depthZ, 0), // CONTRACT B: bigger = farther (camera z is bigger = nearer)
      normal: { x: normal.x, y: normal.y, z: normal.z },
      facingUp: normal.y > 0.7,
      occluded: Boolean(occluded),
    };
  };

  window.Vectura.AlgorithmRegistry.scene3d = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const Params = Vectura.Scene3D.Params;
      const Scene = Vectura.Scene3D.Scene;
      const Edges = Vectura.Scene3D.Edges;
      const HLR = Vectura.Scene3D.HLR;

      const p = Params.normalizeParams(params);
      const scene = Scene.assembleScene(p, bounds);
      // Per-fragment CSG styling: a combined carve borrows the primary solid's
      // id, so each fragment's source-attributed style (Scene3D.Boolean) is
      // merged into a NON-PERSISTENT byFace clone keyed `${primaryId}/${faceId}`.
      // resolveStyle then routes every fragment (faces, edges, x-ray, highlight)
      // to its originating object's style through the ordinary cascade. When no
      // record carries overrides the clone is skipped and p.styleTable is used
      // verbatim (byte-identical single-style path).
      const styleTable = mergeCsgFaceStyles(p.styleTable, scene.objects);
      const resolveStyle = makeStyleResolver(styleTable);
      const out = [];

      // ── Per-edge-class EdgeStyle (C-06). p.edgeStyles maps each class
      // (silhouette/crease/boundary/interior/hidden) → { pen, weightMm, dash[,
      // hiddenTreatment] }. Absent / all-default ⇒ every overlay below is null ⇒
      // byte-identical output. weightMm is expressed against the layer's base pen
      // width (bounds.penWidth, 0.3mm fallback) and rides the SAME tested
      // meta.weightScale path the silhouette-emphasis passes use.
      const EDGE_REF_WIDTH = finite(bounds && bounds.penWidth, 0.3);
      // Polish P-B + X-ray fold — per-object override resolves PER FIELD, not
      // whole-class: each field is objectOverride[field] ?? sceneEdgeStyle[field]
      // ?? null (pen / weightMm / dash, plus hiddenTreatment for the hidden class),
      // resolved INDEPENDENTLY. So an object that overrides only ONE field inherits
      // the scene class's other fields — and, critically, the X-ray fold's migrated
      // hidden seed (which sets ONLY hiddenTreatment='dash', leaving pen/weightMm/
      // dash null) still inherits the scene hidden class's pen/weight/dash OVERLAY,
      // reproducing pre-fold x-ray byte-for-byte. An object that overrides nothing
      // falls straight through to the scene class (or null). p.edgeStylesByObject
      // (assembled by collectSceneParams) keeps ONLY the classes an object touched.
      const edgeStyleFor = (cls, objectId) => {
        const byObj = p.edgeStylesByObject;
        const ov = (objectId && byObj && byObj[objectId]) ? byObj[objectId][cls] : null;
        const t = p.edgeStyles;
        const base = (t && t[cls]) || null;
        if (!ov) return base;
        if (!base) return ov;
        const pick = (k) => (ov[k] != null ? ov[k] : (base[k] != null ? base[k] : null));
        const merged = { pen: pick('pen'), weightMm: pick('weightMm'), dash: pick('dash') };
        if (cls === 'hidden') merged.hiddenTreatment = ov.hiddenTreatment || base.hiddenTreatment || 'drop';
        return merged;
      };
      // Build a meta overlay (penId / weightScale / strokeDash) from an EdgeStyle,
      // or null when the style is a pure no-op. penId overrides the object pen;
      // weightScale/strokeDash are honored by the renderer + SVG export.
      const edgeStyleMeta = (es) => {
        if (!es) return null;
        const m = {};
        if (es.pen) m.penId = es.pen;
        if (es.weightMm != null) {
          const ws = clamp(es.weightMm / (EDGE_REF_WIDTH || 0.3), 0.1, 6);
          if (ws !== 1) m.weightScale = ws;
        }
        if (Array.isArray(es.dash) && es.dash.length) m.strokeDash = es.dash.slice();
        return Object.keys(m).length ? m : null;
      };

      // ── Occluder set (S6): solid front faces occlude everyone; x-ray front
      // faces occlude only their own object; ground/backdrop never occlude.
      const occluderFaces = [];
      scene.objects.forEach((record) => {
        record.faces.forEach((face) => {
          if (!face.front) return;
          occluderFaces.push({
            id: face.key,
            objectId: record.id,
            polygon: face.polygon,
            onlyOwnObject: record.visibility === 'xray',
          });
        });
      });
      const clipper = HLR.createClipper(occluderFaces, { bias: HLR_BIAS });

      // ── Phase 2 lighting: light-made tone + cast shadows (streams 2A). ──────
      const Lighting = Vectura.Scene3D.Lighting;
      const Regions = Vectura.Scene3D.Regions;
      const Shadows = Vectura.Scene3D.Shadows;
      const Mappers = Vectura.Scene3D.Mappers;
      const SurfaceFill = Vectura.Scene3D.SurfaceFill;
      const linkSegments = G3.linkSegments;

      // Correlate a scene record back to its source object (records don't carry
      // params/transform) so SurfaceFill can re-evaluate the object's chart.
      const objById = new Map((p.objects || []).map((o) => [o.id, o]));
      // The primitive → chart (mode, sizes, detail) mapping — mirrors
      // Scene.buildPrimitiveMesh so the wrap fill lands on the rendered surface.
      const TOPOFORM_MODES = {
        sphere: 'sphere', ellipsoid: 'sphere', cylinder: 'cylinder', cone: 'cone',
        torus: 'torus', torusKnot: 'torusKnot', capsule: 'capsule',
        superellipsoid: 'superellipsoid', pyramid: 'pyramid',
      };
      const curvedChartParams = (obj) => {
        const mode = TOPOFORM_MODES[obj.primitive];
        if (!mode) return null; // box/plane/solid are faceted, not chart-wrapped
        const pr = obj.params || {};
        const detail = Math.max(4, Math.round(finite(pr.detail, 24)));
        const r = finite(pr.radius, 20);
        const sizes = obj.primitive === 'sphere'
          ? { sx: r, sy: r, sz: r }
          : { sx: finite(pr.sx, 20), sy: finite(pr.sy, 20), sz: finite(pr.sz, 20) };
        return { mode, sizes, detail };
      };
      const light = (p.lights && p.lights[0]) || {};
      const lightDir = Lighting && typeof Lighting.lightWorldDir === 'function'
        ? Lighting.lightWorldDir(light) : null;
      // toneOn drives the intensity → band → coverage → spacing modulation of the
      // existing hatch. When false, hatching is EXACTLY Phase 1 (density-based,
      // light-invariant) — CONTRACT L3 regression safety.
      // Draft previews (live drag) SKIP tone banding and the specular hotspot —
      // the same responsiveness contract that makes shadows skip booleans (L4).
      // The drag shows flat Phase-1 hatch; full tone returns on release.
      const draft = Boolean(bounds && bounds.fastPreview);
      const toneOn = Boolean(!draft && p.tone && p.tone.enabled && Regions && lightDir);
      // Multi-light shading: intensity at a world normal + world POINT is
      // ambient + every directional Lambert term + every positional (point/spot)
      // term (distance falloff, spot cone), clamped to [0,1] (Regions.combined-
      // Intensity). A lone sun reduces to the Phase-2 single-light look. The
      // world point is only consulted by point/spot lights; a call site with no
      // meaningful point passes the region centroid.
      // `activeLights` is REASSIGNED per record (below) so an EMISSIVE object's
      // co-located point light shades every OTHER object but never itself. With
      // no emissive object it stays === p.lights, so intensityFn — and thus every
      // toned scene — is byte-identical to pre-emissive. intensityFn reads the
      // live binding, so the per-record reassignment is picked up by every helper
      // (spacingBand, the curved pass, SurfaceFill) without re-plumbing them.
      let activeLights = p.lights;
      const intensityFn = toneOn ? (nw, wp) => Regions.combinedIntensity(nw, wp, activeLights) : null;
      // I8 — per-sample specular term for light-driven highlight mode. Reads the
      // live `activeLights` binding (like intensityFn) so an emissive object's
      // co-located light is picked up. shininess derives from the tone Specular
      // size (bigger size → broader glint). Only consumed when a style opts into
      // highlightMode:'lightDriven'; a null fn is a strict no-op otherwise.
      const specShininess = (toneOn && Regions && typeof Regions.shininessForSize === 'function')
        ? Regions.shininessForSize(p.tone && p.tone.specular && p.tone.specular.size) : 24;
      const specularFn = (toneOn && Regions && typeof Regions.specularTerm === 'function')
        ? (nw, wp) => Regions.specularTerm(nw, wp, activeLights, scene.camera, specShininess) : null;
      const penWidth = finite(bounds.penWidth, 0.3);

      // Mean world position of a face's verts (the point at which point/spot
      // lights are sampled for that face). null when the face has no world verts.
      const faceWorldCentroid = (face) => {
        const wv = face && face.worldVerts;
        if (!Array.isArray(wv) || !wv.length) return null;
        let x = 0; let y = 0; let z = 0; let c = 0;
        for (let i = 0; i < wv.length; i++) {
          const pw = wv[i];
          if (pw && Number.isFinite(pw.x) && Number.isFinite(pw.y) && Number.isFinite(pw.z)) {
            x += pw.x; y += pw.y; z += pw.z; c += 1;
          }
        }
        return c ? { x: x / c, y: y / c, z: z / c } : null;
      };

      // The object's own FOOTING — world-Y floor and height — for the reflected
      // (bounce) term of §5.2. Bounce comes up off the ground and dies over
      // roughly one object height, so a floating object must not collect light
      // it cannot physically receive. Cached per record: every sample of a
      // curved fill asks for it.
      const groundCache = new Map();
      const recordGround = (record) => {
        if (!record) return null;
        if (groundCache.has(record)) return groundCache.get(record);
        let lo = Infinity; let hi = -Infinity;
        ((record && record.faces) || []).forEach((f) => {
          ((f && f.worldVerts) || []).forEach((pw) => {
            if (pw && Number.isFinite(pw.y)) {
              if (pw.y < lo) lo = pw.y;
              if (pw.y > hi) hi = pw.y;
            }
          });
        });
        const g = (Number.isFinite(lo) && hi > lo) ? { y0: lo, height: hi - lo } : null;
        groundCache.set(record, g);
        return g;
      };

      // Hatch a flat face IN ITS OWN PLANE and project the result to screen, so
      // the strokes lie on the surface and foreshorten with it — a cube reads as
      // three distinct 3D planes, not one flat screen field. The hatch angle is
      // measured in the face plane (0 = along the face's first edge). Spacing is
      // Phase-1 density when tone is off, else intensity→coverage; the darkest
      // tone band adds a perpendicular cross-pass. Returns SCREEN-space lines.
      // Tone-aware fill spacing for a face/region normal + its darkest-band flag.
      // Phase-1 density when tone is off, else intensity→band→coverage→spacing.
      // Density is AUTHORITATIVE; tone is a MULTIPLIER (Phase-1 density bug fix).
      // s0 = density-driven base spacing; a band's coverage warps it around a
      // midpoint gain of ~1, floored at the pen width. Coverage 0..1 → gain
      // 0.5..1.6, so changing Density visibly re-spaces the fill with tone ON.
      //
      // I27 (direction unify): faceted fills now shade DARK = DENSE, BRIGHT =
      // SPARSE — the SAME physically-correct direction the curved SurfaceFill
      // path uses (dark surface = every line; the lit cap = near-blank = the
      // highlight). Before this, faceted read the ladder coverage DIRECTLY
      // (dark→light), so a lit band packed tighter → bright=DENSE, the OPPOSITE
      // of a sphere in the same scene. We now read the COMPLEMENT band's coverage
      // (nBands-1-bandIdx), matching SurfaceFill.coverageForSample, so a cube and
      // a sphere lit alike shade alike.
      const toneBandCount = () => (p.tone && Array.isArray(p.tone.ladder) && p.tone.ladder.length) ? p.tone.ladder.length : 3;
      const coverageGain = (bandIdx) => {
        const nb = toneBandCount();
        return 0.5 + clamp(Regions.coverageFor(nb - 1 - bandIdx, p.tone), 0, 1) * 1.1;
      };
      // ── Faceted TERMINATOR — topological, with a dihedral gate ───────────────
      //
      // A facet has one normal, so it has one value; the terminator cannot be a
      // gradient the way it is on a curved surface. It is instead a TOPOLOGICAL
      // property: a facet is a terminator facet when it is unlit AND it shares a
      // SMOOTH edge with a lit one.
      //
      // The dihedral gate is what makes this correct rather than merely plausible.
      // Every unlit face of a cube touches its lit top, so without the gate all of
      // them classify as terminator, both visible sides go darkest, and the cube
      // loses its form shadow entirely. But a cube has no terminator — it has an
      // EDGE. The terminator is a curvature phenomenon, so only edges that are
      // smooth (dihedral below TERMINATOR_SMOOTH_DEG, the same intrinsic
      // world-space measure Edges.classifyEdges uses for crease) can carry one.
      // A low-poly sphere's facets sit well inside that angle and produce a
      // discrete ring of terminator facets; a cube's 90-degree edges never do.
      //
      // "Unlit" is read off the SAME combined intensity the rest of the tone
      // system uses, not a single light's N·L, so a multi-light rig classifies
      // consistently with the bands it is about to be sorted into.
      const TERMINATOR_SMOOTH_DEG = 40;
      const TERMINATOR_TH = 0.5;
      const terminatorCache = new Map();
      const terminatorFaces = (record) => {
        if (terminatorCache.has(record)) return terminatorCache.get(record);
        const set = new Set();
        const faces = (record && record.faces) || [];
        const edges = (record && record.edges) || [];
        if (faces.length && edges.length) {
          const cosSmooth = Math.cos(TERMINATOR_SMOOTH_DEG * Math.PI / 180);
          const lit = faces.map((f) => {
            const n = f && f.normalWorld;
            return n ? intensityFn(n, faceWorldCentroid(f)) >= TERMINATOR_TH : false;
          });
          edges.forEach((edge) => {
            const idx = edge && edge.faces;
            if (!idx || idx.length !== 2) return;
            const [i, j] = idx;
            const fi = faces[i]; const fj = faces[j];
            if (!fi || !fj || !fi.normalWorld || !fj.normalWorld) return;
            if (lit[i] === lit[j]) return;              // not a light boundary
            const d = clamp(dot(normalize(fi.normalWorld), normalize(fj.normalWorld)), -1, 1);
            if (d < cosSmooth) return;                  // hard edge: an edge, not a terminator
            set.add(lit[i] ? fj : fi);                  // the UNLIT side carries the core shadow
          });
        }
        terminatorCache.set(record, set);
        return set;
      };

      // I8 parity — per-FACE specular. A facet either catches the glint or it does
      // not, so Regions.specularTerm evaluates once per face. That discreteness IS
      // flat shading (a low-poly sphere pops one or two facets; a cube often none)
      // and must not be smoothed into a fake hotspot. Before this the faceted path
      // ignored tone.specular entirely while the curved fill honoured it — the same
      // class of divergence I27 already had to repair once.
      const specOnFaceted = Boolean(toneOn && p.tone && p.tone.specular && p.tone.specular.enabled !== false);
      const specSizeFaceted = specOnFaceted ? clamp(finite(p.tone.specular.size, 1), 0, 3) : 0;
      const faceSpecular = (normalWorld, worldPoint) => {
        if (!specOnFaceted || !Regions || typeof Regions.specularTerm !== 'function') return 0;
        return clamp(Regions.specularTerm(normalWorld, worldPoint, activeLights, scene.camera, specShininess), 0, 1);
      };

      // FORM ZONE for a facet — the faceted twin of the curved classifier, and
      // the same function, which is what keeps a cube and a sphere in the same
      // zones under one light (§5.5.3, the I27 contract). The one difference is
      // that `terminator` is decided HERE and handed in: on a facet the
      // terminator is topological, and the dihedral gate (a cube has an edge,
      // not a terminator) is the thing that must not be second-guessed.
      const faceZone = (normalWorld, worldPoint, face, record) => {
        if (!Regions || typeof Regions.formZone !== 'function') return null;
        return Regions.formZone(normalWorld, worldPoint, {
          tone: p.tone,
          lights: activeLights,
          ground: recordGround(record),
          terminator: Boolean(record && face && terminatorFaces(record).has(face)),
        });
      };

      const spacingBand = (normalWorld, styleParams, worldPoint, face, record, opts) => {
        const s0 = hatchSpacing(styleParams.fillDensity);
        if (!toneOn) return { spacing: s0, bandIdx: -1, terminator: false };
        // `none` — the total highlight/specular bypass (Jay, 2026-08-09). Nothing
        // below may thin, re-space or re-tag this facet's ink on a highlight's
        // account, so the specular gain multiplier is skipped outright.
        const hlOff = styleParams.highlightTreatment === 'none' || styleParams.highlightTreatment === 'keep';
        const I = intensityFn(normalWorld, worldPoint);
        const bandIdx = Regions.band(I, p.tone);
        let gain = coverageGain(bandIdx);
        // shadowStage parity: the dark-side coverage boost was curved-path only, so
        // faceted objects got no grading below the terminator and read flat.
        const shadowSens = clamp(Math.round(finite(styleParams.shadowSensitivity, 1)), 1, 8);
        if (shadowSens > 1 && typeof Regions.shadowStage === 'function') {
          const stg = Regions.shadowStage(I, shadowSens, TERMINATOR_TH);
          if (stg && Number.isFinite(stg.boost)) gain *= clamp(stg.boost, 0.5, 2);
        }
        // Specular: the glint facet reads LIGHTER, never denser — the highlight is
        // negative space bounded by the surrounding hatch, never a drawn disc.
        // O24: the response must EXTINGUISH as tone.specular.size → 0, so the
        // size multiplies straight through with no floor under it.
        const S = hlOff ? 0 : faceSpecular(normalWorld, worldPoint);
        if (S > 0 && specSizeFaceted > 0) gain *= clamp(1 - 0.55 * specSizeFaceted * S, 0.25, 1);
        const terminator = Boolean(record && face && terminatorFaces(record).has(face));
        // ── The form-zone ladder on facets (§5.1) ──────────────────────────────
        //
        // Round 2 wrote `if (terminator) gain = max(gain, coverageGain(0))`, which
        // made a terminator facet IDENTICAL to a band-0 facet: T could never
        // exceed F by construction, so O1/O3/O21 were unreachable no matter what
        // the ladder said. The ceiling is real — gain tops out at 1.6 — so the
        // excess has to go into a second DIRECTION (§5.0), which `faceHatchLines`
        // now spends on T and ONLY on T. Band 0 loses the +90 cross it used to
        // get for free, which is what opens the gap between T and F.
        //
        // R (reflected) is the other half of the dip: the away-facing rim was
        // falling to a hard Lambert 0 with nothing under it, so a low-poly
        // sphere's LOWEST facets came out its darkest. R lightens them back.
        const zone = faceZone(normalWorld, worldPoint, face, record);
        if (zone === 'T') gain = Math.max(gain, coverageGain(0));
        else if (zone === 'R') gain = Math.min(gain, coverageGain(0) * 0.55);
        return { spacing: Math.max(penWidth, s0 / gain), bandIdx, terminator, zone };
      };

      // In-plane basis for a flat face: its world verts expressed in a 2D (u,v)
      // frame on the face (WORLD mm), plus a uv→screen projector. Fills are
      // generated in this frame so their spacing is true surface mm and they
      // foreshorten with the face when projected. null ⇒ caller falls back to
      // the cheap screen-space fill (draft, or a face without world verts).
      const faceUVScaffold = (face, normalWorld) => {
        const wv = face.worldVerts;
        if (draft || !scene.projectWorld || !Array.isArray(wv) || wv.length < 3) return null;
        const origin = wv[0];
        const U = normalize(sub(wv[1], origin));
        const V = normalize(cross(normalWorld, U)); // in-plane, ⟂ U
        const uv = wv.map((pw) => { const d = sub(pw, origin); return { x: dot(d, U), y: dot(d, V) }; });
        // uv → WORLD (for per-sample lighting, I8) and uv → SCREEN.
        const toWorld = (pt) => add(origin, add(mul(U, pt.x), mul(V, pt.y)));
        const toScreen = (pt) => scene.projectWorld(toWorld(pt));
        return { uv, toScreen, toWorld, origin, U, V };
      };

      // WORLD-UP hatch reference (Phase 2 `angleRef:'worldUp'`): the in-plane
      // angle (deg, hatchPolygon convention) whose lines run along world vertical
      // projected onto the face plane, so a tilted face still engraves "upright".
      // Returns 0 when world up is (near) parallel to the face normal (a floor/
      // ceiling face) so the fill degrades to the face-frame angle.
      const worldUpAngleInUV = (scaf) => {
        if (!scaf || !scaf.U || !scaf.V) return 0;
        const up = { x: 0, y: 1, z: 0 };
        const ua = dot(up, scaf.U);
        const va = dot(up, scaf.V);
        if (Math.hypot(ua, va) < 1e-4) return 0;
        return Math.atan2(va, ua) * 180 / Math.PI;
      };

      // Boustrophedon linking (Phase 2 `linkFill`): chain disjoint scanline
      // segments into one continuous pen path, joining each segment to the nearest
      // end of the previous one (so the connectors are short). Fewer, longer
      // polylines = one pen-down per family. Deterministic; input order preserved.
      const linkBoustrophedon = (segments) => {
        const segs = segments.filter((s) => Array.isArray(s) && s.length >= 2);
        if (segs.length < 2) return segs;
        const path = [segs[0][0], segs[0][segs[0].length - 1]];
        for (let i = 1; i < segs.length; i++) {
          const s = segs[i];
          const a = s[0];
          const b = s[s.length - 1];
          const last = path[path.length - 1];
          const d0 = (a.x - last.x) ** 2 + (a.y - last.y) ** 2;
          const d1 = (b.x - last.x) ** 2 + (b.y - last.y) ** 2;
          if (d1 < d0) { path.push(b, a); } else { path.push(a, b); }
        }
        return [path];
      };

      // Independent crosshatch families (Phase 1.3): family-A is the primary
      // hatch at fillAngle; family-B (crosshatch only) is at fillAngle +
      // crossAngleDelta with spacing × crossDensityRatio (ratio > 1 ⇒ sparser
      // B); tripleHatch adds a third pass at +45° in the darkest tone band only.
      // §2.3 — object-side crossed families are +65° / +32°, NEVER +90°.
      const CROSS_OBJ_DEG_B = (Regions && Regions.CROSS_OBJ_DEG) || 65;
      const CROSS_OBJ_DEG_C = 32;
      const crossFamilies = (target, angleDeg, spacing, styleParams, crossPass, darkBand, push) => {
        push(hatchPolygon(target, { angleDeg, spacing }));
        if (crossPass) {
          const delta = clamp(finite(styleParams.crossAngleDelta, 90), 10, 170);
          const ratio = clamp(finite(styleParams.crossDensityRatio, 1), 0.25, 2);
          push(hatchPolygon(target, { angleDeg: angleDeg + delta, spacing: spacing * ratio }));
          if (styleParams.tripleHatch === true && darkBand) {
            // §2.3 — the tone-driven third pass sits at +32°, not +45°. With
            // family B already at the user's delta, +45 lands close enough to A
            // or B to beat against it.
            push(hatchPolygon(target, { angleDeg: angleDeg + CROSS_OBJ_DEG_C, spacing: spacing * ratio }));
          }
        } else if (darkBand) {
          // The TERMINATOR's second family. Two Round-2 defects, both fixed here:
          //
          //   O17 — it ruled at +90°, which is a square grid. On a faceted object
          //         that reads as wire mesh, and it beats against the raster.
          //         §2.3 bans +90 outright; +65 is the engraver's answer.
          //   O1  — it fired on ALL of band 0, so the form shadow got the same
          //         two directions the core shadow did and T could never out-ink
          //         F. `darkBand` is now the T zone alone (see faceHatchLines),
          //         which is what opens the dip.
          push(hatchPolygon(target, { angleDeg: angleDeg + CROSS_OBJ_DEG_B, spacing }));
        }
      };

      // linkFill (Phase 2): boustrophedon-chain each hatch family into one pen
      // path. Default off ⇒ disjoint segments (Phase-1 output). Draft frames skip
      // the linking (cheap live drag). Applied per family so crosshatch keeps two
      // independent connected passes.
      const maybeLink = (segs, styleParams) =>
        (styleParams.linkFill === true && !draft ? linkBoustrophedon(segs) : segs);

      // Screen-space compression of one unit measured ACROSS the rulings, under
      // the current projection. 1 = face-on, → 0 as the face turns edge-on.
      // Sampled numerically from the scaffold's own uv→screen map so it is exact
      // for every projection mode (orthographic and perspective alike).
      const uvCompression = (scaf, acrossAngleDeg) => {
        if (!scaf || typeof scaf.toScreen !== 'function') return 1;
        const a = finite(acrossAngleDeg, 0) * Math.PI / 180;
        const nx = Math.cos(a); const ny = Math.sin(a);
        const D = 1; // one world mm across the rulings
        const o = scaf.uv[0] || { x: 0, y: 0 };
        const p0 = scaf.toScreen({ x: o.x, y: o.y });
        const p1 = scaf.toScreen({ x: o.x + nx * D, y: o.y + ny * D });
        if (!p0 || !p1 || !Number.isFinite(p0.x) || !Number.isFinite(p1.x)) return 1;
        const k = Math.hypot(p1.x - p0.x, p1.y - p0.y) / D;
        return clamp(k, 0.12, 4); // floored: an edge-on face must not ask for infinity
      };
      // §0 / C15 — no single family may rule below 1.2 x pen width ON PAPER.
      const PLOT_FLOOR_MULT_OBJ = 1.2;

      const faceHatchLines = (face, styleParams, normalWorld, crossPass, record, hlOpts) => {
        // angleRef (Phase 2): 'face' (default) measures the hatch angle in the
        // face plane; 'screen' engraves flat in screen space regardless of the
        // face; 'worldUp' keeps the lines upright (world vertical projected onto
        // the face). 'screen' reuses the cheap screen-space path below.
        const angleRef = styleParams.angleRef === 'screen' || styleParams.angleRef === 'worldUp'
          ? styleParams.angleRef : 'face';
        const userAngle = finite(styleParams.fillAngle, 45);
        // Sample point/spot lights at the face's world centroid.
        const worldPoint = faceWorldCentroid(face);
        const scaf = angleRef === 'screen' ? null : faceUVScaffold(face, normalWorld);
        if (!scaf) {
          // Cheap screen-space hatch (draft / no world verts / angleRef:'screen')
          // — snaps back to the surface-oriented hatch on release.
          const sb = spacingBand(normalWorld, styleParams, worldPoint, face, record, hlOpts);
          const lines = [];
          crossFamilies(face.polygon, userAngle, sb.spacing, styleParams, crossPass, sb.zone === 'T',
            (segs) => maybeLink(segs, styleParams).forEach((l) => lines.push(l)));
          return lines;
        }
        const { spacing, zone } = spacingBand(normalWorld, styleParams, worldPoint, face, record, hlOpts);
        // worldUp rotates the in-plane base angle so the lines follow world
        // vertical; 'face' leaves the user angle measured in the face frame.
        const baseAngle = angleRef === 'worldUp' ? worldUpAngleInUV(scaf) + userAngle : userAngle;
        const uvLines = [];
        // ── FORESHORTENING COMPENSATION (O20, and half of C15) ─────────────────
        //
        // The fill is generated in the face's OWN plane in world mm and then
        // projected, which is what makes a cube read as three 3D planes. But it
        // also means a grazing face's spacing is COMPRESSED on paper: the tone
        // the ladder asked for is not the tone that lands.
        //
        // The cube proved it. Top face N·L = 0.707, near side N·L = 0.5 — the top
        // is the better-lit face and must be the lighter one. Measured, the top
        // came out D = 0.22 against the side's 0.125: 1.76x DARKER, purely
        // because the top is seen at 22 degrees and its rulings piled up. The cube
        // read side-lit. At a steeper grazing angle the same effect flooded a face
        // to D = 1.000 — solid black, well under the 1.2 x pen floor, and a wet
        // blown-out plot.
        //
        // So measure how much one unit ACROSS the rulings compresses under the
        // projection and divide it back out. The tone ladder then lands in SCREEN
        // space, where the eye reads it, and the plot-safe floor is enforced there
        // too. `kFloor` stops a near-edge-on face from asking for infinite spacing.
        //
        // Gated on `toneOn`. An UNTONED fill makes no tonal claim — its spacing
        // is the user's Density, read in the face plane, and every existing
        // untoned scene (and every byte-identical golden that pins one) must
        // stay exactly as it was. The defect being fixed is a TONE-ordering
        // defect, so it is corrected where tone is doing the talking.
        const compress = toneOn ? uvCompression(scaf, baseAngle + 90) : 1;
        const screenSpacing = toneOn ? Math.max(spacing, PLOT_FLOOR_MULT_OBJ * penWidth) : spacing;
        const planeSpacing = screenSpacing / compress;
        // A terminator facet crosses a second family: the ladder tops out at 1.6x
        // gain, so the core shadow is unreachable by spacing alone. Reserved for
        // T — band 0 alone no longer buys a second direction (O1/O17).
        crossFamilies(scaf.uv, baseAngle, planeSpacing, styleParams, crossPass, zone === 'T',
          (segs) => maybeLink(segs, styleParams).forEach((l) => uvLines.push(l)));
        return uvLines.map((line) => line.map(scaf.toScreen));
      };

      // Deterministic screen hash (mirrors SurfaceFill.sfHash) for the light-driven
      // per-sample drop dither. Same quantized point → same value, no RNG.
      const ldHash = (a, b) => {
        let h = ((a | 0) * 73856093) ^ ((b | 0) * 19349663);
        h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
      };

      // I8 — LIGHT-DRIVEN faceted fill. The base tone hatch (dark=dense) still
      // runs; on top of it the actual per-sample specular term S carves the lit
      // glint. Because a POSITIONAL light's direction varies across a flat face,
      // S>0 clusters near the light-facing corner and SPANS the two adjacent
      // faces (the semicircular highlight) — NOT the per-face-uniform band the
      // perFace path uses. Sensitivity stages the drop: 1 = binary (the whole
      // region treated uniformly), N = a gradient (brightest = blankest).
      // Returns { base:[screenLines], hl:[screenLines] } or null (no scaffold →
      // caller uses the plain faceHatchLines path). Deterministic.
      const faceLightDrivenLines = (face, styleParams, normalWorld, crossPass, hlCfg) => {
        if (draft || !specularFn) return null;
        const angleRef = styleParams.angleRef === 'worldUp' ? 'worldUp' : 'face';
        const scaf = faceUVScaffold(face, normalWorld);
        if (!scaf) return null;
        const worldPoint = faceWorldCentroid(face);
        const { spacing, bandIdx } = spacingBand(normalWorld, styleParams, worldPoint);
        const userAngle = finite(styleParams.fillAngle, 45);
        const baseAngle = angleRef === 'worldUp' ? worldUpAngleInUV(scaf) + userAngle : userAngle;
        const uvLines = [];
        crossFamilies(scaf.uv, baseAngle, spacing, styleParams, crossPass, bandIdx === 0,
          (segs) => uvLines.push(...segs));
        const SREG = 0.025;
        const N = hlCfg.sensitivity;
        const treat = hlCfg.treatment;
        const routeHL = treat === 'dashed' || treat === 'dotted';
        const STEP_MM = 2.5;                         // resample so S varies smoothly across a big face
        const base = []; const hl = [];
        uvLines.forEach((line) => {
          let baseRun = []; let hlRun = [];
          const flushBase = () => { if (baseRun.length >= 2) base.push(baseRun); baseRun = []; };
          const flushHL = () => { if (hlRun.length >= 2) hl.push(hlRun); hlRun = []; };
          for (let seg = 0; seg + 1 < line.length; seg++) {
            const a = line[seg]; const b = line[seg + 1];
            const dx = b.x - a.x; const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1e-6;
            const steps = Math.max(1, Math.round(len / STEP_MM));
            for (let s = seg === 0 ? 0 : 1; s <= steps; s++) {
              const tt = s / steps;
              const uv = { x: a.x + dx * tt, y: a.y + dy * tt };
              const wp = scaf.toWorld(uv);
              const S = specularFn(normalWorld, wp);
              const st = Regions.highlightStage(S, N, SREG);
              const scr = scaf.toScreen(uv);
              if (!st.inRegion) { flushHL(); baseRun.push({ x: scr.x, y: scr.y }); continue; }
              // In the glint: `openness` is the per-sample treatment strength
              // (brightest → ~1). A TREATED sample is rerouted (keep/dashed/dotted
              // → highlight channel) or blanked (blank/sparse → bare paper); an
              // UNTREATED sample stays on the normal base run. sensitivity 1 →
              // openness 1 → whole region treated (binary); N → graded.
              const treated = ldHash(Math.round(scr.x * 4), Math.round(scr.y * 4)) < st.openness;
              if (routeHL) {
                if (treated) { flushBase(); hlRun.push({ x: scr.x, y: scr.y }); }
                else { flushHL(); baseRun.push({ x: scr.x, y: scr.y }); }
              } else if (treated) { flushBase(); flushHL(); }        // blank glint
              else { flushHL(); baseRun.push({ x: scr.x, y: scr.y }); }
            }
          }
          flushBase(); flushHL();
        });
        return { base, hl };
      };

      // Region fill (contour/spiral/stipple) for a flat face — generated IN THE
      // FACE PLANE (true surface mm) then projected, so density matches hatch and
      // the fill foreshortens with the face. Falls back to a screen-space fill
      // when there is no plane scaffold.
      // True-spiral (Phase 3) controls read off style.params, passed to
      // Mappers.regionFill('spiral', …). pitch omitted ⇒ density-derived spacing;
      // eccentricity omitted ⇒ auto-fit the region aspect.
      const spiralOptsFrom = (styleParams) => ({
        pitch: Number.isFinite(styleParams.spiralPitch) ? styleParams.spiralPitch : undefined,
        center: styleParams.spiralCenter === 'bboxCenter' ? 'bboxCenter' : 'centroid',
        offset: finite(styleParams.spiralAngleOffset, 0),
        axisSnap: styleParams.axisSnap === true,
        eccentricity: Number.isFinite(styleParams.spiralEccentricity) ? styleParams.spiralEccentricity : undefined,
      });

      // Spiral pitch (mm) from Density (I13): Density 100 collapses the pitch
      // toward the pen width so the loops FULLY overlap (max ink, no gaps); lower
      // Density opens it up to ~14mm. An explicit spiralPitch alias still wins
      // (spiralOptsFrom → trueSpiral.pitch); this only sets the density fallback.
      const spiralPitchFor = (density) => clamp(14 - 0.136 * clamp(finite(density, 50), 0, 100), 0.35, 14);
      // Region-fill spacing (mm): the explicit contourStep alias wins over the
      // Density mapping when the user set it (contour only); the spiral uses the
      // full-overlap pitch law above; every other region mapper uses Density.
      const regionSpacingFor = (mapper, styleParams) => {
        if (mapper === 'contour' && Number.isFinite(styleParams.contourStep)) return clamp(styleParams.contourStep, 0.5, 40);
        if (mapper === 'spiral') return spiralPitchFor(finite(styleParams.fillDensity, 50));
        return hatchSpacing(finite(styleParams.fillDensity, 50));
      };

      // Stipple mark options (Phase 2) read off style.params. Absent keys keep
      // the legacy circle / derived radius / 0.7 jitter — a no-op default.
      const stippleOptsFrom = (styleParams) => ({
        dotShape: styleParams.dotShape,
        dotAngle: finite(styleParams.dotAngle, 0),
        stippleJitter: styleParams.stippleJitter,
        ...(Number.isFinite(styleParams.dotSize) ? { dotRadius: clamp(styleParams.dotSize, 0.1, 3) } : {}),
      });

      const faceRegionLines = (face, mapper, normalWorld, styleParams) => {
        if (!Mappers || typeof Mappers.regionFill !== 'function') return [];
        // Region fills (rings/dots/spiral) read the Density slider directly
        // (1–14mm) — NOT the tone spacing, which floors near the pen width for
        // line coverage and would pack thousands of rings/dots. Tone-driven
        // region density is a later refinement.
        const spacing = regionSpacingFor(mapper, styleParams);
        const opts = mapper === 'spiral'
          ? { spacing, ...spiralOptsFrom(styleParams) }
          : mapper === 'stipple'
            ? { spacing, ...stippleOptsFrom(styleParams) }
            : { spacing };
        const scaf = faceUVScaffold(face, normalWorld);
        // Faceted faces are always a flat clip — a genuine spiral in the face
        // plane, projected so it foreshortens with the face.
        if (!scaf) return Mappers.regionFill(mapper, [face.polygon], opts) || [];
        const uvLines = Mappers.regionFill(mapper, [scaf.uv], opts) || [];
        return uvLines.map((line) => line.map(scaf.toScreen));
      };

      // Emit chokepoint — the single home for the shared stroke treatment
      // (line type / wobble / overstroke, Phase 1.1). `tr` is a descriptor from
      // strokeTreatment(style.params); a call site with nothing to apply passes
      // NO_STROKE_TREATMENT. Draft frames keep the (free) dash but skip the
      // geometry-mutating wobble/overstroke so live drags stay responsive.
      // `opts.forceHidden` routes EVERY run (even geometrically-visible ones)
      // through the occluded/dashed branch — this is how x-ray back-face FILLS
      // are emitted (the far surface reads as dashed "seen-through" lines), a
      // generalization of the hiddenTreatment==='dash' edge branch to fills.
      const emitRuns = (runs, baseMeta, hiddenTreatment, hiddenExtras, tr, opts) => {
        const treat = tr || NO_STROKE_TREATMENT;
        const forceHidden = Boolean(opts && opts.forceHidden);
        // `hiddenOnly` drops visible runs and keeps only the occluded (dashed)
        // ones — an x-ray suppressed crease shows its far side, not its front.
        const hiddenOnly = Boolean(opts && opts.hiddenOnly);
        // Per-edge-class overlays (C-06). Only the structural-edge pass passes
        // these; every other caller leaves them undefined ⇒ byte-identical.
        const visibleMeta = opts && opts.visibleMeta;
        const hiddenMeta = opts && opts.hiddenMeta;
        runs.forEach((run) => {
          if (runLength(run.pts) < MIN_RUN_MM) return;
          if (run.visible && !forceHidden) {
            if (hiddenOnly) return;
            const meta = (treat.active || visibleMeta) ? { ...baseMeta, ...(visibleMeta || {}) } : baseMeta;
            const pts = applyStrokeTreatment(run.pts, treat, meta, draft);
            const path = pathWithMeta(pts, meta);
            if (path.length >= 2) {
              out.push(path);
              if (treat.overstroke && !draft) {
                const dbl = pathWithMeta(overstrokeCopy(pts), meta);
                if (dbl.length >= 2) out.push(dbl);
              }
            }
            return;
          }
          if (hiddenTreatment !== 'dash') return; // solid: hidden runs drop
          const meta = { ...baseMeta, sceneTarget: { ...baseMeta.sceneTarget, occluded: true, ...(hiddenExtras || {}) }, ...(hiddenMeta || {}) };
          const pts = applyStrokeTreatment(run.pts, treat, meta, draft);
          // The hidden class's own dash (when set) is authoritative over the line
          // type applyStrokeTreatment may have stamped; markHidden then keeps it
          // rather than falling back to [3,2].
          if (hiddenMeta && Array.isArray(hiddenMeta.strokeDash)) meta.strokeDash = hiddenMeta.strokeDash.slice();
          const path = pathWithMeta(pts, meta);
          if (path.length >= 2) out.push(markHidden(path));
        });
      };

      // Per-vertex normal offset of a screen-space run by `d` mm — used by the
      // silhouette border emphasis to lay parallel over-strikes beside an edge.
      const offsetRun = (pts, d) => {
        const arr = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[Math.max(0, i - 1)];
          const b = pts[Math.min(pts.length - 1, i + 1)];
          let tx = b.x - a.x; let ty = b.y - a.y;
          const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
          arr.push({ x: pts[i].x - ty * d, y: pts[i].y + tx * d, z: pts[i].z });
        }
        return arr;
      };
      // Border emphasis (ask #8): when an object's border is enabled, its
      // silhouette + boundary edges get extra parallel over-strikes so the
      // outline reads as a heavy, deliberate frame. Pass count + spread scale
      // with `strength`; `penId` (null ⇒ inherit the edge pen) recolours the
      // band. Draft frames skip it (keeps live drags cheap); a record with no
      // border block never enters here, so default-off output is byte-identical.
      const BORDER_STEP_MM = 0.12;
      const emitBorderPasses = (record, clippedRuns, baseMeta) => {
        const border = record && record.border;
        if (!border || !border.enabled || draft) return;
        const strength = clamp(finite(border.strength, 1), 0.25, 4);
        const passes = Math.max(1, Math.round(strength * 2));
        const meta0 = {
          ...baseMeta,
          sceneTarget: { ...baseMeta.sceneTarget },
          ...(border.penId ? { penId: border.penId } : {}),
        };
        clippedRuns.forEach((run) => {
          if (!run.visible) return; // emphasise only the visible outline
          const pts = run.pts;
          if (!Array.isArray(pts) || runLength(pts) < MIN_RUN_MM) return;
          for (let k = 1; k <= passes; k++) {
            const sign = (k % 2 === 0) ? 1 : -1;
            const mag = sign * BORDER_STEP_MM * Math.ceil(k / 2);
            const path = pathWithMeta(offsetRun(pts, mag), { ...meta0 });
            if (path.length >= 2) out.push(path);
          }
        });
      };

      // X-ray (Phase 6) config read off a style.params bag. `visibility:'xray'`
      // on the object is the on/off; these shape it. Back-face fills default ON
      // (the actual fix), dashed, at 0.4× density, inheriting the object pen.
      const STROKE_LINE_TYPES = ['solid', 'dashed', 'dotted', 'dashdot'];
      const xrayCfg = (sp) => {
        const s = sp || {};
        return {
          backFaces: s.xrayBackFaces !== false,
          hiddenEdges: s.xrayHiddenEdges !== false,
          backDensity: clamp(finite(s.xrayBackDensity, 0.4), 0.2, 1),
          backLineType: STROKE_LINE_TYPES.includes(s.xrayBackLineType) ? s.xrayBackLineType : 'dashed',
          backPenId: (typeof s.xrayBackPenId === 'string' && s.xrayBackPenId) ? s.xrayBackPenId : null,
          front: s.xrayFront === 'faded' ? 'faded' : 'solid',
          depthCue: XRAY_DEPTH_CUES.includes(s.xrayDepthCue) ? s.xrayDepthCue : 'off',
        };
      };

      // ── Quantitative X-ray, interpretation A (depth-cued see-through fill).
      // Map a NORMALIZED depth gap (0 = flush behind the front surface, 1 =
      // deepest material) to a see-through back-fill look: a DENSITY keep-fraction
      // and/or a stroke WEIGHT scale. Deterministic (no RNG): the density keep is a
      // golden-ratio low-discrepancy dither over a FULL-density hatch, so deeper
      // material keeps more lines (reads denser); weight ramps faint→heavy with
      // depth. 'off' (default) never touches the flat x-ray path ⇒ byte-identical.
      const XRAY_DEPTH_CUES = ['off', 'density', 'weight', 'both'];
      const XRAY_CUE_MIN_KEEP = 0.25; // shallowest kept fraction of the full hatch
      const XRAY_CUE_W_LO = 0.5;      // faint stroke at the front surface
      const XRAY_CUE_W_HI = 2.2;      // heavy stroke deep in the material
      const cueKeepFraction = (norm) => XRAY_CUE_MIN_KEEP + (1 - XRAY_CUE_MIN_KEEP) * clamp(norm, 0, 1);
      const cueWeightScale = (norm) => clamp(XRAY_CUE_W_LO + (XRAY_CUE_W_HI - XRAY_CUE_W_LO) * clamp(norm, 0, 1), 0.1, 6);
      const cueDitherKeep = (idx, keep) => ((idx * 0.6180339887498949) % 1) < keep; // low-discrepancy, deterministic
      const round3 = (val) => Math.round(val * 1000) / 1000;
      const pipXY = (x, y, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const yi = poly[i].y; const yj = poly[j].y;
          if (((yi > y) !== (yj > y))
            && (x < (poly[j].x - poly[i].x) * (y - yi) / (yj - yi) + poly[i].x)) inside = !inside;
        }
        return inside;
      };
      // Screen-depth extent of an object's projected faces, plus the frontmost
      // (nearest, largest-z) FRONT support plane covering a screen point — the
      // reference the back-fill gap is measured against. Falls back to the object
      // near bound where no front plane covers the point (design v1).
      const objDepthBounds = (record) => {
        let zMin = Infinity; let zMax = -Infinity;
        record.faces.forEach((f) => (f.polygon || []).forEach((v0) => {
          if (v0.z < zMin) zMin = v0.z;
          if (v0.z > zMax) zMax = v0.z;
        }));
        const extent = (zMax - zMin) > 1e-6 ? (zMax - zMin) : 1;
        return { zMin, zMax, extent };
      };

      // ── Highlight treatments (Phase 4): the top tone band(s) render as a
      // chosen treatment instead of ALWAYS dropping to bare paper. Read off a
      // style.params bag. `blank` (default) is a strict no-op — every highlight
      // branch below is gated on treatment !== 'blank', so toned output with the
      // default is byte-identical to pre-Phase-4.
      // 'none' (formerly 'keep') is a TOTAL bypass, not a subtle treatment — see
      // the note on HIGHLIGHT_TREATMENTS in params.js. `keep` is accepted as a
      // silent alias so saved documents render identically.
      const HIGHLIGHT_TREATMENTS = ['blank', 'none', 'dashed', 'dotted', 'sparse', 'altFill', 'burst', 'stippleOut'];
      const ALT_FILL_MAPPERS = new Set(['hatch', 'crosshatch', 'contour', 'spiral', 'stipple']);
      const highlightCfg = (sp) => {
        const s = sp || {};
        const raw = s.highlightTreatment === 'keep' ? 'none' : s.highlightTreatment;
        const treatment = HIGHLIGHT_TREATMENTS.includes(raw) ? raw : 'blank';
        return {
          treatment,
          // I8 — light-driven highlight/shadow. mode 'lightDriven' places the
          // highlight by the per-sample specular term; sensitivity/shadowSensitivity
          // are stage counts (1 = binary, N = graded). All default to the no-op.
          mode: s.highlightMode === 'lightDriven' ? 'lightDriven' : 'perFace',
          sensitivity: clamp(Math.round(finite(s.highlightSensitivity, 1)), 1, 6),
          shadowSensitivity: clamp(Math.round(finite(s.shadowSensitivity, 1)), 1, 6),
          bands: clamp(Math.round(finite(s.highlightBands, 1)), 1, 2),
          penId: (typeof s.highlightPenId === 'string' && s.highlightPenId) ? s.highlightPenId : null,
          density: clamp(finite(s.highlightDensity, 25), 1, 100),
          altFillMapper: ALT_FILL_MAPPERS.has(s.altFillMapper) ? s.altFillMapper : 'stipple',
          burstCount: clamp(Math.round(finite(s.burstCount, 16)), 6, 48),
          burstCenter: s.burstCenter === 'centroid' ? 'centroid' : 'specular',
        };
      };
      // Total tone-band count (ladder length is authoritative) and the highlight
      // predicate: a sample/face is in the highlight band when its band index is
      // within the top `bands` of the ladder. Only meaningful when tone is on.
      const nBands = (p.tone && Array.isArray(p.tone.ladder) && p.tone.ladder.length) ? p.tone.ladder.length : 3;
      const isHighlightBand = (I, bands) => toneOn && Regions.band(I, p.tone) >= (nBands - clamp(bands, 1, 2));
      // The line type stamped on dashed/dotted highlight runs.
      const hlLineType = (treatment) => (treatment === 'dotted' ? 'dotted' : 'dashed');

      // Mean WORLD position of every vert across a record's faces — the point a
      // co-located emissive light sits at (the object's centroid). null when the
      // record carries no world verts (e.g. a draft/degenerate assembly).
      const recordWorldCentroid = (record) => {
        let x = 0; let y = 0; let z = 0; let c = 0;
        (record.faces || []).forEach((face) => {
          const wv = face && face.worldVerts;
          if (!Array.isArray(wv)) return;
          for (let i = 0; i < wv.length; i++) {
            const pw = wv[i];
            if (pw && Number.isFinite(pw.x) && Number.isFinite(pw.y) && Number.isFinite(pw.z)) {
              x += pw.x; y += pw.y; z += pw.z; c += 1;
            }
          }
        });
        return c ? { x: x / c, y: y / c, z: z / c } : null;
      };

      // ── Emissive contribution (Phase 7): every ENABLED emissive object injects
      // a co-located POINT light at its world centroid (range 0 ⇒ pure Lambert,
      // no distance falloff — a legible, monotonic lift on the surfaces it faces).
      // `_srcId` lets the per-record reassignment exclude the emitter from lighting
      // ITSELF (its glow is the self-render below). No emissive objects ⇒ empty
      // list ⇒ activeLights stays === p.lights (byte-identical regression pin).
      const emissiveLights = [];
      scene.objects.forEach((record) => {
        const src = objById.get(record.id);
        const em = src && src.emissive;
        if (!em || !em.enabled) return;
        const c = recordWorldCentroid(record);
        if (!c) return;
        emissiveLights.push({ type: 'point', position: c, intensity: em.intensity, range: 0, _srcId: record.id });
      });

      const records = scene.ground ? scene.objects.concat([scene.ground]) : scene.objects;

      records.forEach((record) => {
        // Shade THIS record under the scene lights plus every OTHER object's
        // emissive point light (self excluded). Empty emissive list ⇒ p.lights.
        activeLights = emissiveLights.length
          ? p.lights.concat(emissiveLights.filter((e) => e._srcId !== record.id))
          : p.lights;
        // Emissive self-render config for this object (never the ground).
        const emSrc = objById.get(record.id);
        const emCfg = (emSrc && emSrc.emissive && emSrc.emissive.enabled && record.id !== 'ground')
          ? emSrc.emissive : null;
        const emissiveCoreBlank = Boolean(emCfg && emCfg.coreBlank);
        // X-ray fold: x-ray's SEE-THROUGH FILLS stay coupled to visibility — the
        // occluded BASE-FILL / face-outline dash is a fills concern (the far
        // surface reads through), independent of edgeStyles.hidden. Only the pure
        // hidden-EDGE treatment (dash vs drop of the structural edge pass below)
        // moves to edgeStyles.hidden. So this stays exactly as pre-fold.
        const hiddenTreatment = record.visibility === 'xray' ? 'dash' : 'remove';
        // Object-scope x-ray settings (drive the see-through back-face FILL loop +
        // the hidden-only crease-over-fill). Per-fill details re-read the style below.
        const xrayOn = record.visibility === 'xray';
        const recXray = xrayOn ? xrayCfg((resolveStyle(record.id, null).params) || {}) : null;
        const styleOf = (face) => resolveStyle(record.id, face.faceId);
        // Flat/faceted primitives (box, plane, polyhedra) hatch per face so each
        // planar face fills in its own orientation. Curved primitives are a fine
        // tessellation whose faces are too small to hatch individually — they
        // hatch as ONE continuous surface region (see the union-hatch pass
        // after the face loop).
        const faceted = record.primitive === 'box'
          || record.primitive === 'plane'
          || record.primitive === 'solid'
          || record.id === 'ground';
        // NOTE: a CSG carve is deliberately NOT faceted. Its BSP output splits
        // every coplanar face into many small T-junctioned triangles, so per-face
        // in-plane hatch would phase-fragment across the seam (each fragment
        // hatched independently → broken-looking fill). CSG units therefore route
        // through the continuous front-region path below (the same clean path the
        // curved cut uses), which merges all coplanar front faces into one region
        // and hatches it continuously. `record.csgFaceted` is retained as metadata
        // but no longer steers the hatch path.

        // Edge classification (silhouette | crease | boundary | interior),
        // computed ONCE per record and shared by the face-outline pass (below,
        // to know which face segments are the object outline vs interior creases)
        // and the structural edge pass (further down). edgeClsById maps the
        // canonical vertex-pair key → class.
        const classified = Edges.classifyEdges(record, {});
        const edgeClsById = new Map();
        classified.forEach((e) => edgeClsById.set(e.edgeId, e.cls));
        // A faceted face-edge is part of the object OUTLINE (drawn for 'none')
        // when it is NOT an interior crease/interior edge. edgeKey canonicalises
        // the vertex-index pair the same way classifyEdges does.
        const edgeKey3 = G3.edgeKey;
        const isOutlineFaceEdge = (va, vb) => {
          const cls = edgeClsById.get(edgeKey3(va, vb));
          return cls !== 'crease' && cls !== 'interior';
        };

        // ── Faces: outlines (closed when fully visible) + hatch fills.
        record.faces.forEach((face) => {
          if (!face.front) return;
          const style = styleOf(face);
          if (style.mapper === 'wireframe') return; // edges only for this face
          // contourSlice REPLACES per-face outlines/fills with depth-slice
          // cross-sections (emitted once per record, after this loop). Suppress
          // the normal face pass so the slices read as the surface. The object's
          // silhouette still draws via the structural-edge pass below.
          if (style.mapper === 'contourSlice') return;
          // A surface fill (hatch, and later spiral/contour/…) REPLACES the
          // per-face wireframe: the face outline and its crease edges are
          // suppressed so the treatment reads as the surface, not confetti over
          // a mesh. The shape's real outline still comes from silhouette +
          // boundary edges below. Face picking survives via the hatch lines,
          // which carry the full face outline as pickPolygon.
          const surfaceFill = SURFACE_FILL.has(style.mapper);
          const faceTreat = strokeTreatment(style.params);
          const segCtx = { ownerKeys: [face.key], objectId: record.id };
          const target = sceneTargetMeta(record.id, face, null, face.centroidZ, false);
          const pickPolygon = face.polygon.map((pt) => ({ x: pt.x, y: pt.y }));
          const baseMeta = {
            algorithm: 'scene3d',
            kind: 'sceneFace',
            sceneTarget: target,
            ...(style.penId ? { penId: style.penId } : {}),
          };
          // Curved (tessellated) primitives with mapper 'none' must NOT emit a
          // per-face outline for every triangle — that draws the whole mesh.
          // "None" shows just the object OUTLINE, which the silhouette/boundary
          // edges (Edges pass below) already provide. Faceted prims (box, plane,
          // polyhedra, ground) also show only their OUTLINE for 'none': each face
          // draws just its silhouette/boundary edges, so a cube reads as its outer
          // hexagon — the interior crease edges (the near-corner Y) are the
          // WIREFRAME look and are skipped here (I5). Every drawn segment carries
          // the full face polygon as pickPolygon, so face-mode point-in-poly
          // picking still resolves. (The structural edge pass below draws the same
          // outline — documented double-draw.)
          const suppressMeshOutline = !faceted && !surfaceFill;
          if (!surfaceFill && !suppressMeshOutline) {
            const idx = face.indices || [];
            const poly = face.polygon;
            const n = poly.length;
            const hasIdx = idx.length === n;
            const outlineMeta = { ...baseMeta, sceneTarget: { ...target, pickPolygon } };
            if (faceTreat.dash) outlineMeta.strokeDash = faceTreat.dash.slice();
            const dashTreat = dashOnly(faceTreat);
            for (let i = 0; i < n; i++) {
              // Skip only edges we can positively classify as interior creases.
              // Missing/mismatched indices ⇒ draw the segment (safe fallback to the
              // full outline, e.g. the ground plate whose edges are all boundary).
              if (hasIdx && !isOutlineFaceEdge(idx[i], idx[(i + 1) % n])) continue;
              const segClip = clipper.clipPath([poly[i], poly[(i + 1) % n]], segCtx);
              emitRuns(segClip.runs, outlineMeta, hiddenTreatment, null, dashTreat);
            }
          }

          // coreBlank (emissive self-render): leave the emitter's own surface
          // fill blank so the core reads as bright/glowing. Outlines + edges still
          // draw (the shape stays legible); only the interior fill is dropped.
          if (faceted && surfaceFill && !emissiveCoreBlank) {
            const plane = HLR.fitSupportPlane(face.polygon);
            if (plane) {
              const styleParams = style.params || {};
              // Highlight treatment (Phase 4) on a FACETED prim is per-FACE band:
              // a face in the top tone band(s) renders with the object's chosen
              // treatment. 'blank'/'keep' = the normal hatch (byte-identical);
              // burst/altFill blank the face (the region pass fills it); dashed/
              // dotted dash it on the highlight pen; sparse/stippleOut thin it by
              // scaling the Density down.
              const faceHL = highlightCfg(styleParams);
              // I8 — LIGHT-DRIVEN faceted fill: the highlight is placed by the
              // per-sample specular term (a localized glint spanning faces near a
              // point light), not the per-face tone band. Engaged for LINE mappers
              // (hatch/crosshatch) with tone on and not a draft frame; region
              // mappers fall through to the perFace path. burst/altFill keep using
              // the region pass (the base fill is suppressed as before).
              // `none` is a total bypass — not even lightDriven may re-route this
              // face's ink (Jay, 2026-08-09).
              const faceLD = toneOn && !draft && faceHL.mode === 'lightDriven'
                && faceHL.treatment !== 'none'
                && !REGION_MAPPERS.has(style.mapper)
                && faceHL.treatment !== 'burst' && faceHL.treatment !== 'altFill';
              if (faceLD) {
                const ld = faceLightDrivenLines(face, styleParams, face.normalWorld,
                  style.mapper === 'crosshatch', faceHL);
                if (ld) {
                  const dashLD = faceHL.treatment === 'dashed' || faceHL.treatment === 'dotted';
                  const zAt = (pt) => plane.A * pt.x + plane.B * pt.y + plane.C;
                  const baseMetaLD = {
                    algorithm: 'scene3d', kind: 'sceneFill',
                    sceneTarget: { ...target, pickPolygon },
                    ...(style.penId ? { penId: style.penId } : {}),
                  };
                  ld.base.forEach((line) => {
                    const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: zAt(pt) }));
                    const clip = clipper.clipPath(pts, segCtx);
                    emitRuns(clip.runs, baseMetaLD, hiddenTreatment, null, faceTreat);
                  });
                  const hlTreatLD = dashLD
                    ? strokeTreatment({ ...styleParams, lineType: hlLineType(faceHL.treatment), wobble: 0, overstroke: false })
                    : faceTreat;
                  const hlMetaLD = {
                    algorithm: 'scene3d', kind: 'sceneFill',
                    sceneTarget: { ...target, pickPolygon, highlight: true },
                    ...(faceHL.penId ? { penId: faceHL.penId } : (style.penId ? { penId: style.penId } : {})),
                  };
                  ld.hl.forEach((line) => {
                    const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: zAt(pt) }));
                    const clip = clipper.clipPath(pts, segCtx);
                    emitRuns(clip.runs, hlMetaLD, hiddenTreatment, null, hlTreatLD);
                  });
                  return; // lightDriven handled this face
                }
              }
              const faceIsHL = toneOn && faceHL.treatment !== 'blank' && faceHL.treatment !== 'none'
                && isHighlightBand(intensityFn(face.normalWorld, faceWorldCentroid(face)), faceHL.bands);
              const suppressFill = faceIsHL && (faceHL.treatment === 'burst' || faceHL.treatment === 'altFill');
              if (!suppressFill) {
                const thin = faceIsHL && (faceHL.treatment === 'sparse' || faceHL.treatment === 'stippleOut');
                const fillParams = thin
                  ? { ...styleParams, fillDensity: finite(styleParams.fillDensity, 50) * (faceHL.density / 100) }
                  : styleParams;
                // Draft (live drag) always renders the cheap screen-space hatch so
                // a coalesced frame stays responsive; full quality dispatches the
                // real mapper. Line fills (hatch/crosshatch) hatch IN-PLANE for the
                // 3D read; region fills (contour/spiral/stipple) fill the projected
                // face polygon and are mapped back onto the plane below.
                let lines;
                if (draft || !REGION_MAPPERS.has(style.mapper)) {
                  // The former `keep` branch (render the highlight face at FULL
                  // density instead of the ladder's cap) is gone with the
                  // treatment: `none` must leave the fill exactly as the ladder
                  // made it, which means not overriding the spacing either.
                  lines = faceHatchLines(face, fillParams, face.normalWorld, style.mapper === 'crosshatch', record, null);
                } else {
                  lines = faceRegionLines(face, style.mapper, face.normalWorld, fillParams);
                }
                const dashHL = faceIsHL && (faceHL.treatment === 'dashed' || faceHL.treatment === 'dotted');
                const emitTreat = dashHL
                  ? strokeTreatment({ ...styleParams, lineType: hlLineType(faceHL.treatment), wobble: 0, overstroke: false })
                  : faceTreat;
                const fillMeta = {
                  algorithm: 'scene3d',
                  kind: 'sceneFill',
                  // Face pick surface: with the outline suppressed, the hatch
                  // lines carry the face outline so a click still resolves.
                  sceneTarget: { ...target, pickPolygon, ...(faceIsHL ? { highlight: true } : {}) },
                  // O11 — the highlight pen used to be gated on dashed/dotted only,
                  // so `keep` / `sparse` / `stippleOut` ink came out in the object
                  // pen and read as ordinary (slightly thinner) fill. Any treated
                  // highlight face now carries the highlight pen.
                  ...(faceIsHL && faceHL.penId ? { penId: faceHL.penId } : (style.penId ? { penId: style.penId } : {})),
                };
                lines.forEach((line) => {
                  const pts = line.map((pt) => ({
                    x: pt.x,
                    y: pt.y,
                    z: plane.A * pt.x + plane.B * pt.y + plane.C,
                  }));
                  const fillClip = clipper.clipPath(pts, segCtx);
                  emitRuns(fillClip.runs, fillMeta, hiddenTreatment, null, emitTreat);
                });
              }
            }
          }
        });

        // ── X-ray back-face fills (faceted prims, Phase 6): the FAR planar
        // faces, hatched at reduced density and dashed so the near surface is
        // seen through. Emitted via forceHidden (the object never occludes its
        // own fill, so these read as dashed "seen-through" lines). Gated strictly
        // on x-ray + fastPreview-off so solid output is byte-identical and live
        // drags stay cheap.
        if (faceted && xrayOn && recXray.backFaces && !draft) {
          // Depth-cue reference (interpretation A): the object's screen-depth
          // extent and the frontmost FRONT support plane covering a screen point.
          const bounds = objDepthBounds(record);
          const frontPlanes = [];
          record.faces.forEach((f) => {
            if (!f.front) return;
            const pl = HLR.fitSupportPlane(f.polygon);
            if (pl) frontPlanes.push({ poly: f.polygon, plane: pl });
          });
          const frontDepthAt = (x, y) => {
            let best = -Infinity;
            for (let i = 0; i < frontPlanes.length; i++) {
              const fp = frontPlanes[i];
              if (!pipXY(x, y, fp.poly)) continue;
              const d = fp.plane.A * x + fp.plane.B * y + fp.plane.C;
              if (d > best) best = d; // frontmost = largest depth (nearest)
            }
            return best === -Infinity ? bounds.zMax : best; // fallback: object near bound
          };
          record.faces.forEach((face) => {
            if (face.front) return; // back faces only
            const style = styleOf(face);
            if (!SURFACE_FILL.has(style.mapper)) return;
            const plane = HLR.fitSupportPlane(face.polygon);
            if (!plane) return;
            const sp = style.params || {};
            const xr = xrayCfg(sp);
            if (!xr.backFaces) return;
            const cue = xr.depthCue;
            const cueDensity = cue === 'density' || cue === 'both';
            const cueWeight = cue === 'weight' || cue === 'both';
            // Density-cued fills are generated at FULL density and thinned per-line
            // by depth (deep keeps more); off/weight keep today's uniform reduced
            // density = a scaled-down Density slider (lower ⇒ wider spacing).
            const genDensity = cueDensity
              ? finite(sp.fillDensity, 50)
              : finite(sp.fillDensity, 50) * xr.backDensity;
            const backParams = { ...sp, fillDensity: genDensity };
            const lines = REGION_MAPPERS.has(style.mapper)
              ? faceRegionLines(face, style.mapper, face.normalWorld, backParams)
              : faceHatchLines(face, backParams, face.normalWorld, style.mapper === 'crosshatch');
            const backTreat = strokeTreatment({ ...sp, lineType: xr.backLineType, wobble: 0, overstroke: false });
            const target = sceneTargetMeta(record.id, face, null, face.centroidZ, false);
            const backMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: { ...target, xrayBack: true },
              ...(xr.backPenId ? { penId: xr.backPenId } : (style.penId ? { penId: style.penId } : {})),
            };
            const backCtx = { objectId: record.id, selfObject: true };
            let backLineIdx = 0;
            lines.forEach((line) => {
              const pts = line.map((pt) => ({
                x: pt.x, y: pt.y, z: plane.A * pt.x + plane.B * pt.y + plane.C,
              }));
              if (cue === 'off') {
                const fillClip = clipper.clipPath(pts, backCtx);
                emitRuns(fillClip.runs, backMeta, 'dash', null, backTreat, { forceHidden: true });
                return;
              }
              // Depth gap at the line midpoint: how far this back sample sits
              // BEHIND the nearest front surface, normalized over the object depth.
              const mid = pts[(pts.length / 2) | 0] || pts[0];
              const norm = clamp((frontDepthAt(mid.x, mid.y) - mid.z) / bounds.extent, 0, 1);
              const idx = backLineIdx++;
              if (cueDensity && !cueDitherKeep(idx, cueKeepFraction(norm))) return; // thinned (shallow)
              const lineMeta = {
                ...backMeta,
                sceneTarget: { ...backMeta.sceneTarget, xrayDepth: round3(norm) },
                ...(cueWeight ? { weightScale: round3(cueWeightScale(norm)) } : {}),
              };
              const fillClip = clipper.clipPath(pts, backCtx);
              emitRuns(fillClip.runs, lineMeta, 'dash', null, backTreat, { forceHidden: true });
            });
          });
        }

        // ── Curved-surface hatch: one continuous fill over the visible
        // front-face region (the silhouette boundary), grouped by hatch style.
        // Per-face hatch fails here — the tessellation faces are smaller than
        // the line spacing — so the fill reads as the whole surface.
        if (!faceted && !emissiveCoreBlank) {
          // Depth-cue reference (interpretation A) for curved prims: the object's
          // screen-depth extent; the front surface reference is the near bound
          // (no per-point front support plane on a wrapped surface — design v1).
          const curveBounds = objDepthBounds(record);
          const groups = new Map();
          record.faces.forEach((face, idx) => {
            if (!face.front) return;
            const st = styleOf(face);
            if (!SURFACE_FILL.has(st.mapper)) return;
            const sp = st.params || {};
            // Faces only share a continuous fill region when every parameter
            // that STEERS that fill matches. The crosshatch family-B controls
            // now do, so they join the key — for any other mapper they are
            // absent and contribute a constant suffix (same partition, same
            // output), and two crosshatch faces only split when they genuinely
            // disagree (which used to render one of them with the other's
            // crossing family).
            const crossKey = st.mapper === 'crosshatch'
              ? `|${finite(sp.crossAngleDelta, 90)}|${finite(sp.crossDensityRatio, 1)}|${sp.tripleHatch === true}` : '';
            const key = `${st.penId || ''}|${st.mapper}|${finite(sp.fillAngle, 45)}|${finite(sp.fillDensity, 50)}${crossKey}`;
            let g = groups.get(key);
            if (!g) { g = { style: st, faces: [] }; groups.set(key, g); }
            g.faces.push(idx);
          });
          groups.forEach((g) => {
            const boundary = frontRegionBoundary(record, g.faces);
            if (!boundary.length) return;
            const sp = g.style.params || {};
            const angleDeg = finite(sp.fillAngle, 45);
            // Curved surface (v1): sample intensity from the GROUP's mean world
            // normal — one spacing for the whole continuous region, deterministic.
            let spacing = hatchSpacing(sp.fillDensity);
            let darkBand = false;
            if (toneOn) {
              let mx = 0; let my = 0; let mz = 0; let cnt = 0;
              // Per-sample point/spot sampling: sample the light at EACH face's
              // own world centroid (not one region centroid) and take the region's
              // brightest reading. A large curved object partly within a near
              // point/spot light no longer collapses to a dark averaged-centroid
              // band — its lit side sets the fallback spacing, matching the
              // per-sample gradient SurfaceFill already wraps onto the surface.
              // Directional lights ignore the world point, so every per-face
              // reading equals intensity(meanN) ⇒ this max is byte-identical to
              // the old single sample (position-independent regression safety).
              let bestI = 0;
              g.faces.forEach((fi) => {
                const face = record.faces[fi];
                const n = face && face.normalWorld;
                if (n) { mx += n.x; my += n.y; mz += n.z; cnt += 1; }
              });
              const meanN = cnt ? { x: mx / cnt, y: my / cnt, z: mz / cnt } : { x: 0, y: 0, z: 1 };
              g.faces.forEach((fi) => {
                const I = intensityFn(meanN, faceWorldCentroid(record.faces[fi]));
                if (I > bestI) bestI = I;
              });
              const bandIdx = Regions.band(bestI, p.tone);
              // Density authoritative, tone a multiplier (Phase-1 density fix) —
              // same law as spacingBand so faceted + curved fills respond alike.
              spacing = Math.max(penWidth, hatchSpacing(sp.fillDensity) / coverageGain(bandIdx));
              darkBand = bandIdx === 0;
            }
            // FULL QUALITY: wrap the fill around the parametric surface so it
            // reads as a 3D form, with per-sample tone (dark→dense, brightest
            // band left blank = the highlight). Falls back to the flat
            // silhouette fill on draft frames or an unsupported primitive.
            let lines = null;
            // spiralMode 'flatClip' opts out of the wrapped surface helix and
            // fills the projected silhouette with the SAME clipped Archimedean
            // spiral the faceted path uses; 'surfaceHelix' (default curved) wraps
            // the parametric form. Non-spiral mappers are unaffected.
            const spiralFlatClip = g.style.mapper === 'spiral' && sp.spiralMode === 'flatClip';
            // contourStyle 'region' opts a curved prim OUT of the parametric
            // parallels (SurfaceFill) into the flat silhouette inset rings — a
            // structurally different, topographic contour. 'surface' (default)
            // keeps the wrapped parallels. Non-contour mappers are unaffected.
            const contourRegion = g.style.mapper === 'contour' && sp.contourStyle === 'region';
            const chartParams = !draft && SurfaceFill && !spiralFlatClip && !contourRegion
              ? curvedChartParams(objById.get(record.id) || {}) : null;
            // X-ray: ask SurfaceFill for the far surface too (a tagged, sparser
            // back family) so a hatched sphere shows through (Phase 6, THE FIX).
            const grpXray = xrayOn ? xrayCfg(sp) : null;
            // Depth cue (interpretation A): density mode asks SurfaceFill for the
            // FULL back family (backDensity 1) and thins it per-line by depth at
            // emit; weight/off keep the flat reduced family. 'off' ⇒ byte-identical.
            const grpCue = grpXray ? grpXray.depthCue : 'off';
            const grpCueDensity = grpCue === 'density' || grpCue === 'both';
            const grpCueWeight = grpCue === 'weight' || grpCue === 'both';
            // Highlight (Phase 4): a non-'blank' treatment engages the per-sample
            // band classifier inside SurfaceFill (keep/dashed/dotted/sparse/
            // stippleOut). altFill/burst drop here and are drawn by the region
            // pass below. Only meaningful with tone on.
            const grpHL = highlightCfg(sp);
            // I8 — lightDriven engages the highlight path even with the 'blank'
            // treatment (blank in lightDriven = a graded blank glint), and adds
            // per-sample shadow grading. perFace + blank stays the no-op.
            // `none` — the total highlight bypass (Jay, 2026-08-09): no ink may
            // be removed, thinned, re-spaced, dashed, re-penned or re-tagged on a
            // highlight's account, and the glint cap must not fire. It outranks
            // lightDriven, which is a highlight PLACEMENT mode, not a treatment.
            const grpHLOff = grpHL.treatment === 'none';
            const grpLD = toneOn && !grpHLOff && grpHL.mode === 'lightDriven';
            const hlActive = toneOn && !grpHLOff && (grpHL.treatment !== 'blank' || grpLD);
            // Shadow sensitivity applies in BOTH modes (default 1 = no-op).
            const grpShadowSens = toneOn ? grpHL.shadowSensitivity : 1;
            if (chartParams) {
              lines = SurfaceFill.buildObject({
                mode: chartParams.mode,
                sizes: chartParams.sizes,
                detail: chartParams.detail,
                transform: (objById.get(record.id) || {}).transform,
                applyTransform: Scene.applyObjectTransform,
                projectWorld: scene.projectWorld,
                camAngles: scene.camera,
                mapper: g.style.mapper,
                fillAngle: angleDeg,
                fillDensity: finite(sp.fillDensity, 50),
                // Crosshatch family-B controls. They were already live on faceted
                // geometry and on the flat silhouette fallback below, but were
                // never handed to the curved fill — so on every chart-wrapped
                // primitive the crossing family was hard-wired at +90, at family
                // A's density, with no triple pass. Same clamps, same meaning as
                // crossFamilies(): +delta, spacing × ratio, and the third pass
                // only in the DARKEST tone band (the gate lives here, exactly as
                // it does for the faceted path).
                cross: g.style.mapper === 'crosshatch' ? {
                  angleDelta: clamp(finite(sp.crossAngleDelta, 90), 10, 170),
                  densityRatio: clamp(finite(sp.crossDensityRatio, 1), 0.25, 2),
                  triple: sp.tripleHatch === true && darkBand,
                } : null,
                // Spiral controls (I14): wire angleOffset / eccentricity / centre /
                // axis-snap into the wrapped surfaceHelix so each visibly changes the
                // spiral on curved primitives (they were previously only read by the
                // faceted flat-clip path). Every default is a strict no-op.
                spiral: g.style.mapper === 'spiral' ? {
                  offset: finite(sp.spiralAngleOffset, 0),
                  eccentricity: Number.isFinite(sp.spiralEccentricity) ? clamp(sp.spiralEccentricity, 0.3, 3) : undefined,
                  center: sp.spiralCenter === 'bboxCenter' ? 'bboxCenter' : 'centroid',
                  axisSnap: sp.axisSnap === true,
                } : null,
                // Stipple mark controls (Phase 2) — absent ⇒ legacy dot (no-op).
                dotShape: sp.dotShape,
                dotAngle: finite(sp.dotAngle, 0),
                dotSize: Number.isFinite(sp.dotSize) ? clamp(sp.dotSize, 0.1, 3) : undefined,
                toneOn,
                intensityFn,
                // Pass the tone LADDER so SurfaceFill quantizes each sample into
                // band → coverage (not a purely geometric (i+0.5)/count dither):
                // band count, thresholds, coverage ladder, and the specular glint
                // cap all steer the curved fill (items 1+2). Directionally the
                // fill stays dark→dense / bright→sparse (blank cap = highlight).
                tone: p.tone,
                // The FORM-ZONE context (§5.1–§5.3). Handing the curved fill the
                // lights and the object's own footing lets it classify H/L/M/T/F/R
                // through the SAME Regions.formZone the faceted path uses — which
                // is the only reason a cube, a low-poly sphere and a capsule under
                // one light now agree (the I27 parity contract).
                formZone: toneOn ? { lights: activeLights, ground: recordGround(record) } : null,
                // The line budget is floored off the pen so the ladder has a grid
                // to stand on (§5.4 #1); without a pen width it stays exactly
                // `lineCountFor(density)`.
                penWidth,
                // I8 — shadow sensitivity (stage count) graded darkening on the
                // dark end; default 1 = no-op. Per-sample specular fn drives the
                // lightDriven highlight region.
                shadowSensitivity: grpShadowSens,
                // The blank highlight is placed by the specular term in BOTH
                // modes now — under perFace it was previously placed by "the top
                // tone band", which is why it covered a quarter of the silhouette
                // and ignored `tone.specular` entirely (O4/O5/O24).
                specularFn: grpHLOff ? null : specularFn,
                specShininess,
                noHighlight: grpHLOff,
                xray: (grpXray && grpXray.backFaces)
                  ? { backFaces: true, backDensity: grpCueDensity ? 1 : grpXray.backDensity } : null,
                highlight: hlActive ? {
                  treatment: grpHL.treatment,
                  isHL: (I) => isHighlightBand(I, grpHL.bands),
                  density: grpHL.density,
                  // lightDriven: per-sample specular region + sensitivity stages.
                  lightDriven: grpLD,
                  sensitivity: grpHL.sensitivity,
                } : null,
              });
            }
            if (!lines) {
              // Fallback: flat silhouette fill. Draft (live drag) or a primitive
              // SurfaceFill can't chart. Region mappers link the boundary loops;
              // line mappers scanline-fill. Plain hatch is NOT auto-crossed in
              // the dark band any more (that made hatch look like crosshatch).
              if (draft || !REGION_MAPPERS.has(g.style.mapper)) {
                lines = hatchSegments(boundary, angleDeg, spacing);
                if (g.style.mapper === 'crosshatch') {
                  // Independent family-B (Phase 1.3): +crossAngleDelta, ×ratio.
                  const delta = clamp(finite(sp.crossAngleDelta, 90), 10, 170);
                  const ratio = clamp(finite(sp.crossDensityRatio, 1), 0.25, 2);
                  hatchSegments(boundary, angleDeg + delta, spacing * ratio).forEach((l) => lines.push(l));
                  if (sp.tripleHatch === true && darkBand) {
                    hatchSegments(boundary, angleDeg + 45, spacing * ratio).forEach((l) => lines.push(l));
                  }
                }
              } else {
                const loops = (linkSegments ? linkSegments(boundary) : [])
                  .filter((lp) => Array.isArray(lp) && lp.length >= 3);
                const regionSpacing = regionSpacingFor(g.style.mapper, sp);
                const regionOpts = g.style.mapper === 'spiral'
                  ? { spacing: regionSpacing, ...spiralOptsFrom(sp) }
                  : g.style.mapper === 'stipple'
                    ? { spacing: regionSpacing, ...stippleOptsFrom(sp) }
                    : { spacing: regionSpacing };
                lines = Mappers && typeof Mappers.regionFill === 'function'
                  ? (Mappers.regionFill(g.style.mapper, loops, regionOpts) || [])
                  : [];
              }
            }
            // Nearest front-face depth for the group: hatch draws over farther
            // objects and is hidden behind nearer ones; the object never
            // occludes its own fill (selfObject).
            let nearZ = Infinity;
            g.faces.forEach((fi) => {
              const z = record.faces[fi] && record.faces[fi].centroidZ;
              if (Number.isFinite(z) && z < nearZ) nearZ = z;
            });
            if (!Number.isFinite(nearZ)) nearZ = 0;
            const fillMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: sceneTargetMeta(record.id, null, null, nearZ, false),
              ...(g.style.penId ? { penId: g.style.penId } : {}),
            };
            const segCtx = { objectId: record.id, selfObject: true };
            const groupTreat = strokeTreatment(g.style.params);
            // X-ray front 'faded' reads the near surface as dotted (lighter); the
            // back family is dashed at the back line type, on the back pen.
            const frontTreat = (grpXray && grpXray.front === 'faded')
              ? strokeTreatment({ ...sp, lineType: 'dotted' }) : groupTreat;
            const backTreat = grpXray
              ? strokeTreatment({ ...sp, lineType: grpXray.backLineType, wobble: 0, overstroke: false })
              : NO_STROKE_TREATMENT;
            const backMeta = grpXray ? {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: { ...sceneTargetMeta(record.id, null, null, nearZ, false), xrayBack: true },
              ...(grpXray.backPenId ? { penId: grpXray.backPenId } : (g.style.penId ? { penId: g.style.penId } : {})),
            } : fillMeta;
            // Highlight-band runs (dashed/dotted treatments) carry their own
            // dash line type + optional highlight pen and are tagged so the
            // renderer/tests can find them.
            // dashed/dotted stamp their dash line type; 'keep' stays SOLID (it
            // keeps the lines, just on the highlight channel/pen). Others (sparse/
            // stippleOut) keep the group's line type too.
            const hlDash = grpHL.treatment === 'dashed' || grpHL.treatment === 'dotted';
            const hlTreat = hlActive
              ? strokeTreatment({ ...sp, ...(hlDash ? { lineType: hlLineType(grpHL.treatment) } : {}), wobble: 0, overstroke: false })
              : NO_STROKE_TREATMENT;
            const hlMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: { ...sceneTargetMeta(record.id, null, null, nearZ, false), highlight: true },
              ...(grpHL.penId ? { penId: grpHL.penId } : (g.style.penId ? { penId: g.style.penId } : {})),
            };
            let backLineIdx = 0;
            lines.forEach((line) => {
              // SurfaceFill lines carry per-sample camera-depth (they wrap the
              // form); flat-fill lines don't → fall back to the group's nearZ.
              const isBack = line.back === true;
              const isHL = line.highlight === true;
              const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: Number.isFinite(pt.z) ? pt.z : nearZ }));
              const clip = clipper.clipPath(pts, segCtx);
              if (isBack) {
                // Far surface: force the dashed/occluded treatment so it reads as
                // "seen through" even where self-occlusion is skipped (selfObject).
                if (grpCue !== 'off') {
                  // Depth cue (interpretation A): gap = how far this back sample
                  // sits behind the object's near bound, normalized over its depth.
                  const mid = pts[(pts.length / 2) | 0] || pts[0];
                  const midZ = mid ? mid.z : curveBounds.zMax;
                  const norm = clamp((curveBounds.zMax - midZ) / curveBounds.extent, 0, 1);
                  const idx = backLineIdx++;
                  if (grpCueDensity && !cueDitherKeep(idx, cueKeepFraction(norm))) return; // thinned (shallow)
                  const backMetaCued = {
                    ...backMeta,
                    sceneTarget: { ...backMeta.sceneTarget, xrayDepth: round3(norm) },
                    ...(grpCueWeight ? { weightScale: round3(cueWeightScale(norm)) } : {}),
                  };
                  emitRuns(clip.runs, backMetaCued, 'dash', null, backTreat, { forceHidden: true });
                } else {
                  emitRuns(clip.runs, backMeta, 'dash', null, backTreat, { forceHidden: true });
                }
              } else if (isHL) {
                emitRuns(clip.runs, hlMeta, hiddenTreatment, null, hlTreat);
              } else {
                emitRuns(clip.runs, fillMeta, hiddenTreatment, null, frontTreat);
              }
            });
          });
        }

        // ── contourSlice (CtS I5): depth-plane cross-sections through the mesh.
        // The mesh is cut by EXACTLY `sliceCount` parallel planes (world +z
        // rotated by sliceRotate/sliceTilt); each cut segment is projected and
        // run through the SAME clipper the surface fills use, so the slices are
        // occluded by other objects AND self-occluded (a far-side slice hides
        // behind the near hemisphere) and shadowed by the compositor.
        //
        // INVARIANT: the plane count is a pure function of sliceCount — it does
        // NOT depend on the occluder count, camera pose, other scene objects, or
        // draft-vs-full. Every plane's per-triangle cuts are LINKED into
        // continuous contour polylines (per plane, front + back separately) so a
        // dense mesh draws long rings — not thousands of sub-MIN_RUN chords that
        // the emission floor would silently drop (that inversion is what made a
        // detail-100 convert render ~8 fragments). Perf is bounded by a FIXED
        // clip-work budget (sampled length × occluders) that degrades gracefully
        // WITHOUT dropping planes: once the budget is spent, the remaining front
        // rings emit RAW (un-occluded) so every plane still draws — only
        // occlusion fidelity degrades on a pathological (detail > 100) density.
        // Draft frames differ from full ONLY by skipping HLR (raw), at the SAME
        // plane count.
        {
          const sliceStyle = resolveStyle(record.id, null);
          if (sliceStyle.mapper === 'contourSlice' && record.id !== 'ground'
            && !emissiveCoreBlank && Array.isArray(record.world)
            && Array.isArray(record.faceIndexArrays) && record.faceIndexArrays.length) {
            const sp = sliceStyle.params || {};
            const visibleOnly = (sp.sliceVisibility || 'visibleOnly') !== 'fullContour';
            const frontFlags = record.faces.map((f) => !!(f && f.front));
            // Plane count depends ONLY on sliceCount (clamped to its param range).
            const planes = clamp(Math.round(finite(sp.sliceCount, 26)), 2, 120);
            const occluderCount = (clipper.occluders && clipper.occluders.length) || 0;
            const sliced = buildSliceSegments({
              world: record.world,
              faces: record.faceIndexArrays,
              front: frontFlags,
              sliceCount: planes,
              sliceRotate: finite(sp.sliceRotate, 0),
              sliceTilt: finite(sp.sliceTilt, 0),
            });
            const sliceTreat = strokeTreatment(sp);
            // NOT selfObject: a through-body slice SHOULD self-occlude (the far
            // side hides behind the near surface) — only on-surface fills opt out.
            const segCtx = { objectId: record.id };
            // Group the flat cut list by (plane, front|back). Insertion order is
            // plane-ascending (buildSliceSegments emits level 1..N), so Map order
            // is deterministic. The 2D link key is unique WITHIN a plane, so
            // linking never fuses two different planes' rings.
            const byPlane = new Map();
            sliced.segments.forEach((s) => {
              let g = byPlane.get(s.plane);
              if (!g) { g = { front: [], back: [] }; byPlane.set(s.plane, g); }
              (s.front ? g.front : g.back).push([s.a, s.b]);
            });
            const linkPlane = (segs) => (linkSegments ? linkSegments(segs)
              : segs.map((e) => [e[0], e[1]]));
            const projectPath = (worldPts) => {
              const proj = [];
              for (let i = 0; i < worldPts.length; i++) {
                const P = scene.projectWorld(worldPts[i]);
                if (P && Number.isFinite(P.x) && Number.isFinite(P.y)) {
                  proj.push({ x: P.x, y: P.y, z: P.z });
                }
              }
              return proj;
            };
            const metaFor = (proj) => {
              let zsum = 0;
              for (let i = 0; i < proj.length; i++) zsum += proj[i].z;
              return {
                algorithm: 'scene3d',
                kind: 'sceneFill',
                sceneTarget: sceneTargetMeta(record.id, null, null, zsum / proj.length, false),
                ...(sliceStyle.penId ? { penId: sliceStyle.penId } : {}),
              };
            };
            // FIXED work budget as occluder-tests (clipPath samples every
            // SLICE_SAMPLE_STEP mm and tests each sample against every occluder).
            // Bounding sampled-length × occluders keeps the work fixed regardless
            // of detail / camera / occluder count; overflow front rings emit raw.
            let workUsed = 0;
            byPlane.forEach((g) => {
              // Front rings: HLR-clipped (occluded/self-occluded) until the fixed
              // budget is spent, then raw — never dropped.
              linkPlane(g.front).forEach((worldPts) => {
                const proj = projectPath(worldPts);
                if (proj.length < 2) return;
                const meta = metaFor(proj);
                if (draft || workUsed >= SLICE_CLIP_WORK) {
                  emitRuns([{ visible: true, pts: proj }], meta, hiddenTreatment, null, sliceTreat);
                  return;
                }
                let len = 0;
                for (let i = 1; i < proj.length; i++) {
                  len += Math.hypot(proj[i].x - proj[i - 1].x, proj[i].y - proj[i - 1].y);
                }
                workUsed += Math.max(2, Math.ceil(len / SLICE_SAMPLE_STEP)) * (occluderCount + 1);
                const clip = clipper.clipPath(proj, segCtx);
                emitRuns(clip.runs, meta, hiddenTreatment, null, sliceTreat);
              });
              // Far-side rings (fullContour only): raw see-through DASHES —
              // forceHidden routes them through the occluded/dashed branch even
              // on a solid object (whose 'remove' would otherwise drop them,
              // making Full ≡ visibleOnly). They never consume the clip budget.
              if (visibleOnly) return;
              linkPlane(g.back).forEach((worldPts) => {
                const proj = projectPath(worldPts);
                if (proj.length < 2) return;
                emitRuns([{ visible: true, pts: proj }], metaFor(proj), 'dash', null, sliceTreat, { forceHidden: true });
              });
            });
          }
        }

        // ── Highlight region pass (Phase 4): altFill / burst fill the specular
        // sub-region on the blank highlight band. altFill runs the alternate
        // mapper clipped to the hotspot disc; burst emits radial rays from the
        // glint (an engraved specular sparkle). Both work for faceted AND curved
        // records — Regions.specularHotspot finds the lit front face on either.
        // The base fill already left this zone blank (curved: SurfaceFill drop;
        // faceted: the highlight-band face was suppressed). Gated on tone +
        // fastPreview-off + a burst|altFill treatment, so 'blank' is untouched.
        if (toneOn && !draft && Regions && typeof Regions.specularHotspot === 'function'
          && record.id !== 'ground') {
          const hcfg = highlightCfg((resolveStyle(record.id, null).params) || {});
          if (hcfg.treatment === 'burst' || hcfg.treatment === 'altFill') {
            const light0 = (p.lights && p.lights[0]) || {};
            const hs = Regions.specularHotspot(record, scene.camera, p.tone && p.tone.specular, light0);
            if (hs) {
              let cx = hs.cx; let cy = hs.cy;
              if (hcfg.burstCenter === 'centroid' && hs.projBounds) {
                cx = (hs.projBounds.minX + hs.projBounds.maxX) / 2;
                cy = (hs.projBounds.minY + hs.projBounds.maxY) / 2;
              }
              const hlMeta = {
                algorithm: 'scene3d',
                kind: 'sceneFill',
                sceneTarget: { ...sceneTargetMeta(record.id, hs.face, null, hs.depth, false), highlight: true },
                ...(hcfg.penId ? { penId: hcfg.penId } : {}),
              };
              const hlCtx = { objectId: record.id, selfObject: true };
              if (hcfg.treatment === 'burst') {
                const N = hcfg.burstCount;
                const inner = hs.radius * 0.12;
                for (let k = 0; k < N; k++) {
                  const ang = (k / N) * Math.PI * 2;
                  const p0 = { x: cx + Math.cos(ang) * inner, y: cy + Math.sin(ang) * inner, z: hs.depth };
                  const p1 = { x: cx + Math.cos(ang) * hs.radius, y: cy + Math.sin(ang) * hs.radius, z: hs.depth };
                  const clip = clipper.clipPath([p0, p1], hlCtx);
                  emitRuns(clip.runs, hlMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
                }
              } else {
                // altFill: fill the hotspot disc with the alternate mapper.
                const SEG = 40;
                const circle = [];
                for (let k = 0; k < SEG; k++) {
                  const a = (k / SEG) * Math.PI * 2;
                  circle.push({ x: cx + Math.cos(a) * hs.radius, y: cy + Math.sin(a) * hs.radius });
                }
                const spacing = hatchSpacing(hcfg.density);
                let alines = [];
                if (REGION_MAPPERS.has(hcfg.altFillMapper) && Mappers && typeof Mappers.regionFill === 'function') {
                  alines = Mappers.regionFill(hcfg.altFillMapper, [circle], { spacing }) || [];
                } else {
                  const edges = [];
                  for (let k = 0; k < SEG; k++) edges.push([circle[k], circle[(k + 1) % SEG]]);
                  alines = hatchSegments(edges, 45, spacing);
                  if (hcfg.altFillMapper === 'crosshatch') {
                    hatchSegments(edges, 135, spacing).forEach((l) => alines.push(l));
                  }
                }
                alines.forEach((line) => {
                  const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: hs.depth }));
                  const clip = clipper.clipPath(pts, hlCtx);
                  emitRuns(clip.runs, hlMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
                });
              }
            }
          }
        }

        // ── Emissive self-render (Phase 7): an enabled emissive object draws its
        // OWN glow — an outward radial BURST (sun rays) or concentric halo RINGS
        // around the projected silhouette, reusing the Phase-4 burst emitter shape
        // (radial rays from a center). Deterministic (no RNG). Independent of tone
        // (a glow reads even with light-made tone off). Scaled by intensity; drawn
        // on emissive.penId if set. Rays sit at the object's near depth (+ a small
        // camera-ward bias) so the object never occludes its own glow, while a
        // NEARER object still can. Skipped only on the ground.
        if (emCfg && emCfg.halo !== 'none') {
          // Projected bounds → glow center + base radius (half the diagonal).
          let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
          (record.projected || []).forEach((pt) => {
            if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
          });
          if (Number.isFinite(minX)) {
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;
            const radius = Math.max(2, Math.hypot(maxX - minX, maxY - minY) / 2);
            // Near depth = the front-most face (bigger camera z = nearer); + a 1mm
            // camera-ward bias so own faces (at nearZ) never clip the glow.
            let nearZ = -Infinity;
            record.faces.forEach((face) => {
              if (face && face.front && Number.isFinite(face.centroidZ) && face.centroidZ > nearZ) nearZ = face.centroidZ;
            });
            if (!Number.isFinite(nearZ)) nearZ = 0;
            const glowZ = nearZ + 1;
            const norm = clamp(finite(emCfg.intensity, 1), 0, 4) / 4; // 0..1 glow scale
            const emMeta = {
              algorithm: 'scene3d',
              kind: 'sceneFill',
              sceneTarget: {
                objectId: record.id,
                faceId: null,
                edgeClass: null,
                regionClass: 'emissive',
                depth: -glowZ,
                normal: { x: 0, y: 0, z: 1 },
                facingUp: false,
                occluded: false,
                emissive: true,
              },
              ...(emCfg.penId ? { penId: emCfg.penId } : {}),
            };
            const emCtx = { objectId: record.id, selfObject: false };
            if (emCfg.halo === 'burst') {
              const N = clamp(Math.round(finite(emCfg.haloCount, 16)), 4, 48);
              const inner = radius * 0.9;
              const outer = radius * (1.2 + 0.5 * norm);
              for (let k = 0; k < N; k++) {
                const ang = (k / N) * Math.PI * 2;
                const c = Math.cos(ang); const s = Math.sin(ang);
                const p0 = { x: cx + c * inner, y: cy + s * inner, z: glowZ };
                const p1 = { x: cx + c * outer, y: cy + s * outer, z: glowZ };
                const clip = clipper.clipPath([p0, p1], emCtx);
                emitRuns(clip.runs, emMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
              }
            } else {
              // ring: concentric circles expanding outward from the silhouette.
              const rings = clamp(Math.round(finite(emCfg.haloRings, 3)), 1, 6);
              const SEG = 48;
              const step = radius * (0.16 + 0.12 * norm);
              for (let ri = 0; ri < rings; ri++) {
                const rr = radius * 1.02 + ri * step;
                const ring = [];
                for (let k = 0; k <= SEG; k++) {
                  const a = (k / SEG) * Math.PI * 2;
                  ring.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, z: glowZ });
                }
                const clip = clipper.clipPath(ring, emCtx);
                emitRuns(clip.runs, emMeta, hiddenTreatment, null, NO_STROKE_TREATMENT);
              }
            }
          }
        }

        // ── Specular highlight: the brightest tone band of the wrap fill is left
        // UN-hatched (SurfaceFill's per-sample ordered dither drops every line
        // toward high intensity), so blank paper reads as the highlight — the
        // line-art-correct treatment. The old solid-white filled disc
        // (Regions.specularRegion) is retired: it obscured the form and read as a
        // pasted-on sphere, not a highlight. (The function stays for reference.)

        // ── Edges: silhouette / crease / boundary (+ every edge of a
        // wireframe-mapped face); hidden runs drop (solid) or dash (x-ray).
        // `classified` was computed once above (shared with the face-outline pass).
        classified.forEach((entry) => {
          const adjacentFaces = entry.faceIndices.map((idx) => record.faces[idx]).filter(Boolean);
          const wireframeFace = adjacentFaces.find((face) => styleOf(face).mapper === 'wireframe');
          const wireframeDemand = Boolean(wireframeFace);
          const structural = entry.cls !== 'interior';
          if (!structural && !wireframeDemand) return;
          // CSG seam suppression: a boolean RESULT is a closed manifold, so every
          // genuine edge is shared by exactly two faces (silhouette + crease
          // survive, classified separately). The count-1 'boundary' edges on a csg
          // mesh are fan-triangulation T-junction artifacts along the cut seam —
          // drawing them paints spurious solid lines radiating across the carved
          // flat faces (and a confetti of rim whiskers on curved cuts). Skip
          // DRAWING them; HLR occlusion rides on FACES (occluderFaces), not these
          // edges, so hidden-line removal is unaffected. The real carve rim (a
          // wall meeting a face at ~90°) is a count-2 CREASE edge and still draws.
          if (record.primitive === 'csg' && entry.cls === 'boundary') return;
          // CSG triangulation-fan suppression (I32): a boolean RESULT mesh is
          // fan-triangulated, so every flat face is split into many COPLANAR
          // triangles whose shared diagonals classify as 'interior'. On an
          // ordinary primitive those diagonals don't exist (quad faces), so a
          // wireframe mapper surfaces interior edges harmlessly — but on a CSG
          // result a wireframe would paint that whole triangulation fan across
          // the carved faces (Box−Cylinder "stray diagonal edges" defect). Only
          // the FUSED solid's genuine features (silhouette/crease/boundary)
          // read as real geometry; the coplanar diagonals never do — suppress
          // them even under wireframe. Real carve rims are ~90° count-2 CREASE
          // edges (structural) and still draw; this drops ONLY 'interior'.
          if (record.primitive === 'csg' && !structural) return;
          // Wireframe edge classes (Phase 2): a wireframe face publishes which
          // edge classes it draws (default all four = the current all-edges look)
          // and whether occluded edges dash (showHidden). Filter this edge's class
          // and pick its hidden treatment. entry.cls is the RAW class
          // (silhouette|boundary|crease|interior); the edgeClasses keys match it.
          let wfShowHidden = false;
          if (wireframeDemand) {
            const wfParams = styleOf(wireframeFace).params || {};
            const ec = wfParams.edgeClasses;
            if (ec && ec[entry.cls] === false) return; // this class hidden for the wireframe
            wfShowHidden = wfParams.showHidden === true;
          }
          // A crease/interior edge is part of the WIREFRAME look, NOT the object
          // OUTLINE: it is drawn ONLY when an adjacent face is wireframe-mapped.
          // For 'none' (outline only) and for surface fills (the fill replaces the
          // mesh), the crease is suppressed — so a 'none' cube shows just its outer
          // hexagon, not the near-corner Y (I5). Silhouette and boundary edges (the
          // shape's real outline) always survive. UNDER X-RAY (hidden edges on) a
          // crease that borders only SURFACE-FILLED faces still passes as
          // HIDDEN-ONLY: its visible portion drops (no confetti over the fill) but
          // its occluded portion dashes, so the far-side edges of a hatched box read
          // through (Phase 6). A bare 'none' object has no fill to read through, so
          // it drops the crease outright.
          const bordersSurfaceFill = adjacentFaces.length
            && adjacentFaces.every((face) => SURFACE_FILL.has(styleOf(face).mapper));
          // A CSG carve rim (a wall meeting a face at ~90°) is a genuine cut
          // boundary that reads as part of the object outline, not mesh confetti —
          // so on a CSG result a crease is suppressed ONLY when a surface fill
          // would otherwise bury it (legacy). On ordinary primitives 'none' drops
          // every crease (outline only).
          const creaseSuppressed = entry.cls === 'crease' && !wireframeDemand
            && (record.primitive === 'csg' ? bordersSurfaceFill : true);
          // A suppressed crease over a surface-filled face survives as HIDDEN-ONLY
          // (its visible portion drops, its occluded portion reads through the
          // shown fill) ONLY when the x-ray see-through FILL is active. This is a
          // FILLS concern (gated on visibility, NOT edgeStyles.hidden) so a
          // NON-x-ray surface-filled box with a scene hidden=dash class is
          // unaffected — its creases are not see-through creases.
          const hiddenOnlyEdge = creaseSuppressed && bordersSurfaceFill && xrayOn && recXray.hiddenEdges;
          if (creaseSuppressed && !hiddenOnlyEdge) return;
          // Interior edges surfaced by a wireframe mapper report as creases —
          // the closest CONTRACT B class (the enum has no 'interior').
          const cls = structural ? entry.cls : 'crease';
          const a = record.projected[entry.a];
          const b = record.projected[entry.b];
          if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return;
          const metaFace = entry.frontFace || entry.metaFace;
          const style = metaFace ? resolveStyle(record.id, metaFace.faceId) : FALLBACK_STYLE;
          const midZ = (finite(a.z, 0) + finite(b.z, 0)) / 2;
          const target = sceneTargetMeta(record.id, entry.frontFace, cls, midZ, false);
          const baseMeta = {
            algorithm: 'scene3d',
            kind: 'sceneEdge',
            straight: true,
            sceneTarget: target,
            ...(style.penId ? { penId: style.penId } : {}),
          };
          const ownerKeys = adjacentFaces.map((face) => face.key);
          const clipped = clipper.clipPath([a, b], { ownerKeys, objectId: record.id });
          // Per-edge-class EdgeStyle (C-06). VISIBLE runs take the edge's own class
          // style (raw entry.cls, so a wireframe interior edge gets the 'interior'
          // style); HIDDEN runs take the 'hidden' class style. Default table ⇒ both
          // overlays null ⇒ byte-identical.
          const visOverlay = edgeStyleMeta(edgeStyleFor(entry.cls, record.id));
          const hidOverlay = edgeStyleMeta(edgeStyleFor('hidden', record.id));
          // Structural edge: line-type dash only (double-drawn with the face
          // outline, so wobble is fill-scoped — see dashOnly). X-RAY FOLD: x-ray
          // no longer forces hidden edges to dash — the per-object/scene
          // edgeStyles.hidden.hiddenTreatment is the SOLE owner (default 'drop' ⇒
          // 'remove' ⇒ today's non-x-ray look; a migrated x-ray object carries
          // 'dash'). A wireframe face's showHidden stays an orthogonal override.
          // Polish P-B — the hidden treatment resolves per-object too (an object
          // may override Drop→Dash for its OWN occluded edges); a non-overriding
          // object falls through to the scene-wide hidden class.
          const hiddenStyle = edgeStyleFor('hidden', record.id);
          const sceneHidden = (hiddenStyle && hiddenStyle.hiddenTreatment === 'dash') ? 'dash' : 'remove';
          const thisEdgeHidden = wfShowHidden ? 'dash' : sceneHidden;
          const emitOpts = {};
          if (hiddenOnlyEdge) emitOpts.hiddenOnly = true;
          if (visOverlay) emitOpts.visibleMeta = visOverlay;
          if (hidOverlay) emitOpts.hiddenMeta = hidOverlay;
          emitRuns(clipped.runs, baseMeta, thisEdgeHidden, { edgeClass: 'hidden' }, dashOnly(strokeTreatment(style.params)),
            Object.keys(emitOpts).length ? emitOpts : undefined);
          // Border emphasis: silhouette + boundary edges only (the shape's real
          // outline), never creases/interior. Gated on record.border.enabled.
          if (structural && (cls === 'silhouette' || cls === 'boundary')) {
            emitBorderPasses(record, clipped.runs, baseMeta);
          }
        });
      });

      // ── Cast shadows on the ground (stream 2A). Orthogonal to tone: driven by
      // light.castShadows, degrades on grazing light / degenerate geometry.
      // Shadows render on EVERY frame, including live drags: objects and their
      // shadows must not vanish while orbiting or dragging (user contract). A
      // draft frame routes through shadows.js's boolean-free per-caster path
      // (CONTRACT L4) — cheap ground projection, no FillBoolean union — while a
      // full frame does the clean class union. Both are y≥0-clipped so a caster
      // straddling the receiver still projects a correct footprint.
      if (Shadows && typeof Shadows.build === 'function' && Lighting) {
        const shadowStyleOf = (objectId) => {
          const st = resolveStyle(objectId, null);
          return { penId: st && st.penId ? st.penId : null };
        };
        // Scene-scope stroke treatment (line type / wobble) for every shadow line.
        const shadowStyleParams = (p.styleTable && p.styleTable.scene && p.styleTable.scene.params) || {};
        // Phase 5 — scene-level shadow controls (angle / density / pen / line
        // type / penumbra layers). Absent ⇒ the legacy hardcoded shadow look.
        const shadowBag = p.shadow || {};
        // I26 inverse mode reaches the ground's OWN fill lines (already emitted
        // into `out` above) to THIN them inside the footprint instead of adding
        // hatch. Passed on every build; only consumed when shadowMode==='inverse'.
        const shadowGroundSink = out;
        // Multi-light: every shadow-casting light drops its own footprint
        // (ambient lights don't cast). Directional lights project PARALLEL along
        // their travel dir; point/spot lights project in PERSPECTIVE from their
        // world position (rays diverge → an enlarged umbra). A lone sun → one
        // shadow set, exactly as before.
        (p.lights || []).forEach((lt) => {
          if (!lt || lt.type === 'ambient' || lt.castShadows === false) return;
          if (lt.type === 'point' || lt.type === 'spot' || lt.type === 'area') {
            if (!lt.position) return;
            // Pass the full record so a spot clips its shadow to the cone and a
            // ranged light drops casters it never reaches (point stays omni).
            Shadows.build(scene, p, bounds, clipper, null, { styleOf: shadowStyleOf, styleParams: shadowStyleParams, shadow: shadowBag, lightPosition: lt.position, light: lt, groundFillPaths: shadowGroundSink })
              .forEach((path) => out.push(path));
            return;
          }
          const dir = Lighting.lightWorldDir(lt);
          if (!dir) return;
          Shadows.build(scene, p, bounds, clipper, dir, { styleOf: shadowStyleOf, styleParams: shadowStyleParams, shadow: shadowBag, groundFillPaths: shadowGroundSink })
            .forEach((path) => out.push(path));
        });
      }

      return out;
    },
    formula: (p = {}) => {
      const count = Array.isArray(p.objects) && p.objects.length ? p.objects.length : 1;
      const projection = (p.camera && p.camera.projection) === 'perspective' ? 'perspective' : 'orthographic';
      return `3D scene: ${count} object${count === 1 ? '' : 's'} assembled, projected (${projection}) and hidden-line resolved into styled face, edge, and fill targets.`;
    },
  };
})();
