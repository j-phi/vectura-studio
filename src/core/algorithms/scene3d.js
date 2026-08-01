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
      const resolveStyle = makeStyleResolver(p.styleTable);
      const out = [];

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
      const intensityFn = toneOn ? (nw, wp) => Regions.combinedIntensity(nw, wp, p.lights) : null;
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
      // midpoint gain of ~1 (lit/high-coverage bands pack tighter, dark/low-
      // coverage bands open up), floored at the pen width. Coverage 0..1 →
      // gain 0.5..1.6, so changing Density visibly re-spaces the fill with tone
      // ON, instead of the old coverage-only spacing that discarded it.
      const coverageGain = (bandIdx) => 0.5 + clamp(Regions.coverageFor(bandIdx, p.tone), 0, 1) * 1.1;
      const spacingBand = (normalWorld, styleParams, worldPoint) => {
        const s0 = hatchSpacing(styleParams.fillDensity);
        if (!toneOn) return { spacing: s0, bandIdx: -1 };
        const bandIdx = Regions.band(intensityFn(normalWorld, worldPoint), p.tone);
        return { spacing: Math.max(penWidth, s0 / coverageGain(bandIdx)), bandIdx };
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
        const toScreen = (pt) => scene.projectWorld(add(origin, add(mul(U, pt.x), mul(V, pt.y))));
        return { uv, toScreen };
      };

      // Independent crosshatch families (Phase 1.3): family-A is the primary
      // hatch at fillAngle; family-B (crosshatch only) is at fillAngle +
      // crossAngleDelta with spacing × crossDensityRatio (ratio > 1 ⇒ sparser
      // B); tripleHatch adds a third pass at +45° in the darkest tone band only.
      const crossFamilies = (target, angleDeg, spacing, styleParams, crossPass, darkBand, push) => {
        push(hatchPolygon(target, { angleDeg, spacing }));
        if (crossPass) {
          const delta = clamp(finite(styleParams.crossAngleDelta, 90), 10, 170);
          const ratio = clamp(finite(styleParams.crossDensityRatio, 1), 0.25, 2);
          push(hatchPolygon(target, { angleDeg: angleDeg + delta, spacing: spacing * ratio }));
          if (styleParams.tripleHatch === true && darkBand) {
            push(hatchPolygon(target, { angleDeg: angleDeg + 45, spacing: spacing * ratio }));
          }
        } else if (darkBand) {
          // Plain hatch densifies the darkest band with a perpendicular pass
          // (extra ink where the surface is unlit) — NOT the crosshatch family.
          push(hatchPolygon(target, { angleDeg: angleDeg + 90, spacing }));
        }
      };

      const faceHatchLines = (face, styleParams, normalWorld, crossPass) => {
        const angleDeg = finite(styleParams.fillAngle, 45);
        // Sample point/spot lights at the face's world centroid.
        const worldPoint = faceWorldCentroid(face);
        const scaf = faceUVScaffold(face, normalWorld);
        if (!scaf) {
          // Cheap screen-space hatch (draft / no world verts) — snaps back to the
          // surface-oriented hatch on release.
          const { spacing, bandIdx } = spacingBand(normalWorld, styleParams, worldPoint);
          const lines = [];
          crossFamilies(face.polygon, angleDeg, spacing, styleParams, crossPass, bandIdx === 0,
            (segs) => segs.forEach((l) => lines.push(l)));
          return lines;
        }
        const { spacing, bandIdx } = spacingBand(normalWorld, styleParams, worldPoint);
        const uvLines = [];
        crossFamilies(scaf.uv, angleDeg, spacing, styleParams, crossPass, bandIdx === 0,
          (segs) => segs.forEach((l) => uvLines.push(l)));
        return uvLines.map((line) => line.map(scaf.toScreen));
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

      const faceRegionLines = (face, mapper, normalWorld, styleParams) => {
        if (!Mappers || typeof Mappers.regionFill !== 'function') return [];
        // Region fills (rings/dots/spiral) read the Density slider directly
        // (1–14mm) — NOT the tone spacing, which floors near the pen width for
        // line coverage and would pack thousands of rings/dots. Tone-driven
        // region density is a later refinement.
        const spacing = hatchSpacing(finite(styleParams.fillDensity, 50));
        const opts = mapper === 'spiral' ? { spacing, ...spiralOptsFrom(styleParams) } : { spacing };
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
        runs.forEach((run) => {
          if (runLength(run.pts) < MIN_RUN_MM) return;
          if (run.visible && !forceHidden) {
            if (hiddenOnly) return;
            const meta = treat.active ? { ...baseMeta } : baseMeta;
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
          const meta = { ...baseMeta, sceneTarget: { ...baseMeta.sceneTarget, occluded: true, ...(hiddenExtras || {}) } };
          const pts = applyStrokeTreatment(run.pts, treat, meta, draft);
          const path = pathWithMeta(pts, meta);
          if (path.length >= 2) out.push(markHidden(path));
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
        };
      };

      const records = scene.ground ? scene.objects.concat([scene.ground]) : scene.objects;

      records.forEach((record) => {
        const hiddenTreatment = record.visibility === 'xray' ? 'dash' : 'remove';
        // Object-scope x-ray settings (drive the hidden-edge toggle + the faceted
        // back-face loop). Per-fill details re-read the specific style below.
        const xrayOn = record.visibility === 'xray';
        const recXray = xrayOn ? xrayCfg((resolveStyle(record.id, null).params) || {}) : null;
        const edgeHidden = (xrayOn && recXray.hiddenEdges) ? 'dash' : 'remove';
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

        // ── Faces: outlines (closed when fully visible) + hatch fills.
        record.faces.forEach((face) => {
          if (!face.front) return;
          const style = styleOf(face);
          if (style.mapper === 'wireframe') return; // edges only for this face
          // A surface fill (hatch, and later spiral/contour/…) REPLACES the
          // per-face wireframe: the face outline and its crease edges are
          // suppressed so the treatment reads as the surface, not confetti over
          // a mesh. The shape's real outline still comes from silhouette +
          // boundary edges below. Face picking survives via the hatch lines,
          // which carry the full face outline as pickPolygon.
          const surfaceFill = SURFACE_FILL.has(style.mapper);
          const faceTreat = strokeTreatment(style.params);
          const segCtx = { ownerKeys: [face.key], objectId: record.id };
          const loop = face.polygon.concat([face.polygon[0]]);
          const clipped = clipper.clipPath(loop, segCtx);
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
          // polyhedra, ground) keep their face outlines: those ARE the clean
          // cube/plane edges, and they carry the face pick polygon.
          const suppressMeshOutline = !faceted && !surfaceFill;
          if (!surfaceFill && !suppressMeshOutline) {
            if (clipped.fullyVisible) {
              const pts = face.polygon.map((pt) => ({ x: pt.x, y: pt.y }));
              pts.push({ x: pts[0].x, y: pts[0].y });
              // Structural outline: line-type dash only (no wobble — see dashOnly).
              const outlineMeta = { ...baseMeta, closed: true };
              if (faceTreat.dash) outlineMeta.strokeDash = faceTreat.dash.slice();
              const path = pathWithMeta(pts, outlineMeta);
              if (path.length >= 3) out.push(path);
            } else {
              // Partially-occluded face: the visible outline is emitted as open
              // runs, so face picking (point-in-poly) has no closed surface.
              // Stamp the full closed face outline into meta so the renderer
              // hit-tests the whole face — drawn geometry stays the runs.
              emitRuns(clipped.runs, {
                ...baseMeta,
                sceneTarget: { ...target, pickPolygon },
              }, hiddenTreatment, null, dashOnly(faceTreat));
            }
          }

          if (faceted && surfaceFill) {
            const plane = HLR.fitSupportPlane(face.polygon);
            if (plane) {
              const styleParams = style.params || {};
              // Draft (live drag) always renders the cheap screen-space hatch so
              // a coalesced frame stays responsive; full quality dispatches the
              // real mapper. Line fills (hatch/crosshatch) hatch IN-PLANE for the
              // 3D read; region fills (contour/spiral/stipple) fill the projected
              // face polygon and are mapped back onto the plane below.
              let lines;
              if (draft || !REGION_MAPPERS.has(style.mapper)) {
                lines = faceHatchLines(face, styleParams, face.normalWorld, style.mapper === 'crosshatch');
              } else {
                lines = faceRegionLines(face, style.mapper, face.normalWorld, styleParams);
              }
              const fillMeta = {
                algorithm: 'scene3d',
                kind: 'sceneFill',
                // Face pick surface: with the outline suppressed, the hatch
                // lines carry the face outline so a click still resolves.
                sceneTarget: { ...target, pickPolygon },
                ...(style.penId ? { penId: style.penId } : {}),
              };
              lines.forEach((line) => {
                const pts = line.map((pt) => ({
                  x: pt.x,
                  y: pt.y,
                  z: plane.A * pt.x + plane.B * pt.y + plane.C,
                }));
                const fillClip = clipper.clipPath(pts, segCtx);
                emitRuns(fillClip.runs, fillMeta, hiddenTreatment, null, faceTreat);
              });
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
          record.faces.forEach((face) => {
            if (face.front) return; // back faces only
            const style = styleOf(face);
            if (!SURFACE_FILL.has(style.mapper)) return;
            const plane = HLR.fitSupportPlane(face.polygon);
            if (!plane) return;
            const sp = style.params || {};
            const xr = xrayCfg(sp);
            if (!xr.backFaces) return;
            // Reduced density = a scaled-down Density slider (lower ⇒ wider spacing).
            const backParams = { ...sp, fillDensity: finite(sp.fillDensity, 50) * xr.backDensity };
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
            lines.forEach((line) => {
              const pts = line.map((pt) => ({
                x: pt.x, y: pt.y, z: plane.A * pt.x + plane.B * pt.y + plane.C,
              }));
              const fillClip = clipper.clipPath(pts, backCtx);
              emitRuns(fillClip.runs, backMeta, 'dash', null, backTreat, { forceHidden: true });
            });
          });
        }

        // ── Curved-surface hatch: one continuous fill over the visible
        // front-face region (the silhouette boundary), grouped by hatch style.
        // Per-face hatch fails here — the tessellation faces are smaller than
        // the line spacing — so the fill reads as the whole surface.
        if (!faceted) {
          const groups = new Map();
          record.faces.forEach((face, idx) => {
            if (!face.front) return;
            const st = styleOf(face);
            if (!SURFACE_FILL.has(st.mapper)) return;
            const sp = st.params || {};
            const key = `${st.penId || ''}|${st.mapper}|${finite(sp.fillAngle, 45)}|${finite(sp.fillDensity, 50)}`;
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
              let px = 0; let py = 0; let pz = 0; let pcnt = 0;
              g.faces.forEach((fi) => {
                const face = record.faces[fi];
                const n = face && face.normalWorld;
                if (n) { mx += n.x; my += n.y; mz += n.z; cnt += 1; }
                const c = faceWorldCentroid(face);
                if (c) { px += c.x; py += c.y; pz += c.z; pcnt += 1; }
              });
              const meanN = cnt ? { x: mx / cnt, y: my / cnt, z: mz / cnt } : { x: 0, y: 0, z: 1 };
              // Group centroid: the sample point for point/spot lights over the
              // whole continuous region (one spacing for the region, deterministic).
              const meanP = pcnt ? { x: px / pcnt, y: py / pcnt, z: pz / pcnt } : null;
              const bandIdx = Regions.band(intensityFn(meanN, meanP), p.tone);
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
            const chartParams = !draft && SurfaceFill && !spiralFlatClip
              ? curvedChartParams(objById.get(record.id) || {}) : null;
            // X-ray: ask SurfaceFill for the far surface too (a tagged, sparser
            // back family) so a hatched sphere shows through (Phase 6, THE FIX).
            const grpXray = xrayOn ? xrayCfg(sp) : null;
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
                toneOn,
                intensityFn,
                xray: (grpXray && grpXray.backFaces)
                  ? { backFaces: true, backDensity: grpXray.backDensity } : null,
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
                const regionSpacing = hatchSpacing(finite(sp.fillDensity, 50));
                const regionOpts = g.style.mapper === 'spiral'
                  ? { spacing: regionSpacing, ...spiralOptsFrom(sp) }
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
            lines.forEach((line) => {
              // SurfaceFill lines carry per-sample camera-depth (they wrap the
              // form); flat-fill lines don't → fall back to the group's nearZ.
              const isBack = line.back === true;
              const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: Number.isFinite(pt.z) ? pt.z : nearZ }));
              const clip = clipper.clipPath(pts, segCtx);
              if (isBack) {
                // Far surface: force the dashed/occluded treatment so it reads as
                // "seen through" even where self-occlusion is skipped (selfObject).
                emitRuns(clip.runs, backMeta, 'dash', null, backTreat, { forceHidden: true });
              } else {
                emitRuns(clip.runs, fillMeta, hiddenTreatment, null, frontTreat);
              }
            });
          });
        }

        // ── Specular highlight: the brightest tone band of the wrap fill is left
        // UN-hatched (SurfaceFill's per-sample ordered dither drops every line
        // toward high intensity), so blank paper reads as the highlight — the
        // line-art-correct treatment. The old solid-white filled disc
        // (Regions.specularRegion) is retired: it obscured the form and read as a
        // pasted-on sphere, not a highlight. (The function stays for reference.)

        // ── Edges: silhouette / crease / boundary (+ every edge of a
        // wireframe-mapped face); hidden runs drop (solid) or dash (x-ray).
        const classified = Edges.classifyEdges(record, {});
        classified.forEach((entry) => {
          const adjacentFaces = entry.faceIndices.map((idx) => record.faces[idx]).filter(Boolean);
          const wireframeDemand = adjacentFaces.some((face) => styleOf(face).mapper === 'wireframe');
          const structural = entry.cls !== 'interior';
          if (!structural && !wireframeDemand) return;
          // A crease that borders only surface-filled faces is suppressed — the
          // fill replaces the mesh wireframe. Silhouette and boundary edges
          // (the shape's real outline) always survive. UNDER X-RAY (hidden edges
          // on) a suppressed crease still passes as HIDDEN-ONLY: its visible
          // portion drops (no confetti over the fill) but its occluded portion
          // dashes, so the far-side edges of a hatched box read through (Phase 6).
          const creaseSuppressed = entry.cls === 'crease' && !wireframeDemand
            && adjacentFaces.length && adjacentFaces.every((face) => SURFACE_FILL.has(styleOf(face).mapper));
          const hiddenOnlyEdge = creaseSuppressed && xrayOn && recXray.hiddenEdges;
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
          // Structural edge: line-type dash only (double-drawn with the face
          // outline, so wobble is fill-scoped — see dashOnly). Hidden edges dash
          // under x-ray unless xrayHiddenEdges is off (edgeHidden = 'remove').
          emitRuns(clipped.runs, baseMeta, edgeHidden, { edgeClass: 'hidden' }, dashOnly(strokeTreatment(style.params)),
            hiddenOnlyEdge ? { hiddenOnly: true } : undefined);
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
        // Multi-light: every shadow-casting light drops its own footprint
        // (ambient lights don't cast). Directional lights project PARALLEL along
        // their travel dir; point/spot lights project in PERSPECTIVE from their
        // world position (rays diverge → an enlarged umbra). A lone sun → one
        // shadow set, exactly as before.
        (p.lights || []).forEach((lt) => {
          if (!lt || lt.type === 'ambient' || lt.castShadows === false) return;
          if (lt.type === 'point' || lt.type === 'spot') {
            if (!lt.position) return;
            Shadows.build(scene, p, bounds, clipper, null, { styleOf: shadowStyleOf, styleParams: shadowStyleParams, lightPosition: lt.position })
              .forEach((path) => out.push(path));
            return;
          }
          const dir = Lighting.lightWorldDir(lt);
          if (!dir) return;
          Shadows.build(scene, p, bounds, clipper, dir, { styleOf: shadowStyleOf, styleParams: shadowStyleParams })
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
