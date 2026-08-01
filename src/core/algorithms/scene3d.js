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
    v, add, sub, mul, dot, cross, normalize } = G3;

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
      const linkSegments = G3.linkSegments;
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
      const Lvec = toneOn ? Regions.towardLight(light) : null;
      const penWidth = finite(bounds.penWidth, 0.3);

      // Hatch a flat face IN ITS OWN PLANE and project the result to screen, so
      // the strokes lie on the surface and foreshorten with it — a cube reads as
      // three distinct 3D planes, not one flat screen field. The hatch angle is
      // measured in the face plane (0 = along the face's first edge). Spacing is
      // Phase-1 density when tone is off, else intensity→coverage; the darkest
      // tone band adds a perpendicular cross-pass. Returns SCREEN-space lines.
      // Tone-aware fill spacing for a face/region normal + its darkest-band flag.
      // Phase-1 density when tone is off, else intensity→band→coverage→spacing.
      const spacingBand = (normalWorld, styleParams) => {
        if (!toneOn) return { spacing: hatchSpacing(styleParams.fillDensity), bandIdx: -1 };
        const bandIdx = Regions.band(Regions.intensity(normalWorld, Lvec), p.tone);
        return { spacing: Regions.coverageToSpacing(Regions.coverageFor(bandIdx, p.tone), penWidth), bandIdx };
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

      const faceHatchLines = (face, styleParams, normalWorld, crossPass) => {
        const angleDeg = finite(styleParams.fillAngle, 45);
        const scaf = faceUVScaffold(face, normalWorld);
        if (!scaf) {
          // Cheap screen-space hatch (draft / no world verts) — snaps back to the
          // surface-oriented hatch on release.
          const spacing = spacingBand(normalWorld, styleParams).spacing;
          const lines = hatchPolygon(face.polygon, { angleDeg, spacing });
          if (crossPass) hatchPolygon(face.polygon, { angleDeg: angleDeg + 90, spacing }).forEach((l) => lines.push(l));
          return lines;
        }
        const { spacing, bandIdx } = spacingBand(normalWorld, styleParams);
        const uvLines = hatchPolygon(scaf.uv, { angleDeg, spacing });
        // Crosshatch always adds the perpendicular pass; plain hatch adds it only
        // in the darkest tone band (extra density where the surface is unlit).
        if (crossPass || bandIdx === 0) hatchPolygon(scaf.uv, { angleDeg: angleDeg + 90, spacing }).forEach((l) => uvLines.push(l));
        return uvLines.map((line) => line.map(scaf.toScreen));
      };

      // Region fill (contour/spiral/stipple) for a flat face — generated IN THE
      // FACE PLANE (true surface mm) then projected, so density matches hatch and
      // the fill foreshortens with the face. Falls back to a screen-space fill
      // when there is no plane scaffold.
      const faceRegionLines = (face, mapper, normalWorld, styleParams) => {
        if (!Mappers || typeof Mappers.regionFill !== 'function') return [];
        // Region fills (rings/dots) read the Density slider directly (1–14mm) —
        // NOT the tone spacing, which floors near the pen width for line coverage
        // and would pack thousands of rings/dots. Tone-driven region density is
        // a later refinement.
        const spacing = hatchSpacing(finite(styleParams.fillDensity, 50));
        const scaf = faceUVScaffold(face, normalWorld);
        if (!scaf) return Mappers.regionFill(mapper, [face.polygon], { spacing }) || [];
        const uvLines = Mappers.regionFill(mapper, [scaf.uv], { spacing }) || [];
        return uvLines.map((line) => line.map(scaf.toScreen));
      };

      const emitRuns = (runs, baseMeta, hiddenTreatment, hiddenExtras) => {
        runs.forEach((run) => {
          if (runLength(run.pts) < MIN_RUN_MM) return;
          if (run.visible) {
            const path = pathWithMeta(run.pts, baseMeta);
            if (path.length >= 2) out.push(path);
            return;
          }
          if (hiddenTreatment !== 'dash') return; // solid: hidden runs drop
          const meta = { ...baseMeta, sceneTarget: { ...baseMeta.sceneTarget, occluded: true, ...(hiddenExtras || {}) } };
          const path = pathWithMeta(run.pts, meta);
          if (path.length >= 2) out.push(markHidden(path));
        });
      };

      const records = scene.ground ? scene.objects.concat([scene.ground]) : scene.objects;

      records.forEach((record) => {
        const hiddenTreatment = record.visibility === 'xray' ? 'dash' : 'remove';
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
          if (!surfaceFill) {
            if (clipped.fullyVisible) {
              const pts = face.polygon.map((pt) => ({ x: pt.x, y: pt.y }));
              pts.push({ x: pts[0].x, y: pts[0].y });
              const path = pathWithMeta(pts, { ...baseMeta, closed: true });
              if (path.length >= 3) out.push(path);
            } else {
              // Partially-occluded face: the visible outline is emitted as open
              // runs, so face picking (point-in-poly) has no closed surface.
              // Stamp the full closed face outline into meta so the renderer
              // hit-tests the whole face — drawn geometry stays the runs.
              emitRuns(clipped.runs, {
                ...baseMeta,
                sceneTarget: { ...target, pickPolygon },
              }, hiddenTreatment);
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
                emitRuns(fillClip.runs, fillMeta, hiddenTreatment);
              });
            }
          }
        });

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
              g.faces.forEach((fi) => {
                const n = record.faces[fi] && record.faces[fi].normalWorld;
                if (n) { mx += n.x; my += n.y; mz += n.z; cnt += 1; }
              });
              const meanN = cnt ? { x: mx / cnt, y: my / cnt, z: mz / cnt } : { x: 0, y: 0, z: 1 };
              const bandIdx = Regions.band(Regions.intensity(meanN, Lvec), p.tone);
              spacing = Regions.coverageToSpacing(Regions.coverageFor(bandIdx, p.tone), penWidth);
              darkBand = bandIdx === 0;
            }
            // Dispatch by mapper. Draft frames and line mappers (hatch/
            // crosshatch) use the cheap scanline fill; region mappers (contour/
            // spiral/stipple) fill the linked silhouette loops at full quality.
            let lines;
            if (draft || !REGION_MAPPERS.has(g.style.mapper)) {
              lines = hatchSegments(boundary, angleDeg, spacing);
              if (g.style.mapper === 'crosshatch' || darkBand) {
                hatchSegments(boundary, angleDeg + 90, spacing).forEach((l) => lines.push(l));
              }
            } else {
              const loops = (linkSegments ? linkSegments(boundary) : [])
                .filter((lp) => Array.isArray(lp) && lp.length >= 3);
              // Region fills read the Density slider directly (see faceRegionLines).
              const regionSpacing = hatchSpacing(finite(sp.fillDensity, 50));
              lines = Mappers && typeof Mappers.regionFill === 'function'
                ? (Mappers.regionFill(g.style.mapper, loops, { spacing: regionSpacing }) || [])
                : [];
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
            lines.forEach((line) => {
              const pts = line.map((pt) => ({ x: pt.x, y: pt.y, z: nearZ }));
              const clip = clipper.clipPath(pts, segCtx);
              emitRuns(clip.runs, fillMeta, hiddenTreatment);
            });
          });
        }

        // ── Specular hotspot: one small filled highlight on a lit curved
        // surface (spec group E — the only iso-band region; flat faces get none).
        if (!faceted && toneOn && typeof Regions.specularRegion === 'function'
          && p.tone.specular && p.tone.specular.enabled) {
          const camAngles = { yaw: scene.camera.yaw, pitch: scene.camera.pitch, roll: scene.camera.roll };
          const spec = Regions.specularRegion(record, camAngles, p.tone.specular, light);
          if (spec) out.push(spec);
        }

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
          // (the shape's real outline) always survive.
          if (entry.cls === 'crease' && !wireframeDemand
            && adjacentFaces.length && adjacentFaces.every((face) => SURFACE_FILL.has(styleOf(face).mapper))) {
            return;
          }
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
          emitRuns(clipped.runs, baseMeta, hiddenTreatment, { edgeClass: 'hidden' });
        });
      });

      // ── Cast shadows on the ground (stream 2A). Orthogonal to tone: driven by
      // light.castShadows, degrades on grazing light / degenerate geometry.
      // A draft frame (live drag) SKIPS shadow projection entirely: even the
      // boolean-free per-caster path (CONTRACT L4) costs a full silhouette
      // extraction + ground projection per object every frame, which blows the
      // 12-object drag budget (measured ~150ms vs the 110ms sentinel). The sun
      // WIDGET gives live aim feedback during the drag; the shadow snaps back on
      // release with the full union regen. (Follow-up PRH: a coarse draft shadow
      // — bbox projection, no HLR — could restore live shadow-handle feedback
      // under budget; shadows.js keeps its tested no-boolean path for that.)
      if (!draft && Shadows && typeof Shadows.build === 'function' && lightDir) {
        const shadowStyleOf = (objectId) => {
          const st = resolveStyle(objectId, null);
          return { penId: st && st.penId ? st.penId : null };
        };
        Shadows.build(scene, p, bounds, clipper, lightDir, { styleOf: shadowStyleOf })
          .forEach((path) => out.push(path));
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
