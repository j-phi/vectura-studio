/**
 * polyhedron algorithm definition.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  const G3 = Vectura.Geometry3D;
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const {
    TAU,
    clamp,
    finite,
    v,
    add,
    sub,
    mul,
    dot,
    cross,
    normalize,
    rotatePoint,
    projectPoint,
    faceNormal,
    collectEdges,
    circlePath,
    closePath,
    markHidden,
    cleanPaths,
  } = G3;

  const hash01 = (n) => {
    const s = Math.sin(n * 127.1) * 43758.5453123;
    return s - Math.floor(s);
  };

  // Solid-mesh construction (regularRing, mesh helpers, platonic / geodesic /
  // dual builders, createSolidMesh) moved verbatim to Scene3D.Mesh. average3 and
  // lerp3 are shared helpers the face renderer below still uses.
  const { average3, lerp3, createSolidMesh } = Vectura.Scene3D.Mesh;

  const applyVertexEffects = (pt, p, boundsInfo = {}) => {
    const expand = clamp(finite(p.expand, 100) / 100, 0.5, 1.8);
    let out = mul(pt, expand);
    const twist = finite(p.twist, 0);
    if (Math.abs(twist) > 0.001) {
      const safeDepth = Math.max(1, boundsInfo.maxDepth || boundsInfo.maxRadius || finite(p.depth, 94));
      const amount = (out.z / safeDepth) * twist * (Math.PI / 180);
      const c = Math.cos(amount);
      const s = Math.sin(amount);
      out = v(out.x * c - out.y * s, out.x * s + out.y * c, out.z);
    }
    return out;
  };

  const renderedFace = (mesh, vertices, face, faceIndex, p, faceBands = 0) => {
    const base = face.map((idx) => vertices[idx]);
    const center = average3(base);
    const normal = faceNormal(base);
    const outward = normalize(center);
    const explode = finite(p.explode, 0);
    const extrude = finite(p.extrude, 0);
    const shard = clamp(finite(p.shard, 0) / 100, 0, 1);
    const shiftedCenter = add(center, add(mul(normal, extrude), mul(outward, explode)));
    const outer = base.map((pt, i) => {
      const radial = sub(pt, center);
      const shardScale = 1 + shard * ((hash01(faceIndex * 97 + i * 37) * 2) - 1) * 0.7;
      return add(shiftedCenter, mul(radial, shardScale));
    });
    const bands = [];
    const bulge = finite(p.bulge, 0);
    for (let band = 1; band <= faceBands; band++) {
      const t = band / (faceBands + 1);
      const bulgeProfile = Math.pow(1 - t, 1.35);
      bands.push(outer.map((pt) => add(
        lerp3(shiftedCenter, pt, t),
        mul(normal, bulge * bulgeProfile)
      )));
    }
    return { outer, bands };
  };

  // Shared view Euler angles: rotate = yaw, tilt = pitch, roll = image-plane
  // spin (Rotate Z). Every rotatePoint call must go through this so all render
  // passes (faces, edges, silhouette, creases, vertex markers) agree.
  const viewAngles = (p) => ({ yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28), roll: finite(p.roll, 0) });

  const projectFace = (facePts, p, bounds) => {
    const view = viewAngles(p);
    const rotated = facePts.map((pt) => rotatePoint(pt, view));
    const normal = faceNormal(rotated);
    const projected = rotated.map((pt) => projectPoint(pt, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) }));
    const depth = rotated.reduce((sum, pt) => sum + pt.z, 0) / Math.max(1, rotated.length);
    return { rotated, projected, normal, front: normal.z >= -0.001, depth };
  };

  // Rotate + project every base mesh vertex once through the shared view. Used by
  // the silhouette / crease / hidden-line enhancements, which need the canonical
  // (un-exploded) topology where faces share vertices — renderedFace's
  // explode/extrude/shard offsets break that sharing per-face. Returns a parallel
  // array of { screen:{x,y}, z } so callers can read screen position + camera z.
  const projectMeshVertices = (vertices, p, bounds) =>
    vertices.map((pt) => {
      const rotated = rotatePoint(pt, viewAngles(p));
      const screen = projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
      return { screen, z: rotated.z };
    });

  const pushPath = (paths, pts, visible, p, meta = {}) => {
    if (!visible && (p.faceOpacityMode === 'opaque' || p.surfaceMode === 'front')) return;
    const path = pts.map((pt) => ({ x: pt.x, y: pt.y }));
    path.meta = { algorithm: 'polyhedron', straight: true, ...meta };
    if (!visible) markHidden(path);
    paths.push(path);
  };

  const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const distanceToSegment = (point, start, end) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq <= 1e-9) return pointDistance(point, start);
    const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq, 0, 1);
    return pointDistance(point, { x: start.x + dx * t, y: start.y + dy * t });
  };

  const distanceToPolygonEdge = (point, polygon) => {
    let min = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      min = Math.min(min, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
    }
    return min;
  };

  const pointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      const intersects = ((a.y > point.y) !== (b.y > point.y))
        && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-9) + a.x);
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const dedupeVertexMarkers = (points, epsilon = 0.8) => {
    const unique = [];
    points.forEach((point) => {
      const match = unique.find((existing) => pointDistance(existing, point) <= epsilon);
      if (!match) {
        unique.push({ ...point });
      } else if (point.depth > match.depth + 1e-6) {
        Object.assign(match, point);
      } else if (point.front) {
        match.front = true;
      }
    });
    return unique;
  };

  const isPointOccludedByFaces = (point, faceRecords, tolerance) => {
    for (const record of faceRecords) {
      if (!record.front || record.depth <= point.depth + 0.02) continue;
      if (distanceToPolygonEdge(point, record.projected) <= tolerance) continue;
      if (pointInPolygon(point, record.projected)) return true;
    }
    return false;
  };

  const buildVertexMarkers = (faceRecords, p) => {
    const candidates = [];
    faceRecords.forEach((record) => {
      if (p.surfaceMode !== 'all' && !record.front) return;
      record.projected.forEach((screen, index) => {
        const rotated = record.rotated[index];
        candidates.push({
          x: screen.x,
          y: screen.y,
          depth: rotated?.z ?? screen.z ?? record.depth,
          front: record.front,
        });
      });
    });

    const size = Math.max(0.2, finite(p.vertexSize, 4.2));
    const rings = Math.max(1, Math.round(finite(p.vertexRings, 1)));
    const loops = [];
    const masks = [];
    dedupeVertexMarkers(candidates).forEach((point, index) => {
      if (p.faceOpacityMode === 'opaque' && isPointOccludedByFaces(point, faceRecords, size * 0.16)) return;
      // D1 — 'Hide Interior' (vertexOcclusionMode === 'occlude'): drop the vertex
      // glyph entirely when its projected point falls inside a NEARER opaque front
      // face. isPointOccludedByFaces only counts front faces whose camera depth is
      // closer than the vertex (with a +0.02 epsilon) and skips faces the vertex
      // sits on the edge of (size * 0.16 tolerance), so a vertex never occludes
      // itself or its own incident faces. On convex solids (default buckyball,
      // platonics) no vertex is behind a nearer face, so this is a no-op there;
      // the effect only manifests on self-occluding deformations (twist/shard/
      // explode) or overlapping imported meshes. Default mode is 'outline', so
      // baseline output is byte-identical.
      if (p.vertexOcclusionMode === 'occlude') {
        if (isPointOccludedByFaces(point, faceRecords, size * 0.16)) return;
        masks.push({ center: { x: point.x, y: point.y }, radius: size * 1.08 });
      }
      for (let ring = 0; ring < rings; ring++) {
        const radius = size * (1 - ring * 0.28);
        if (radius <= 0.15) continue;
        const loop = circlePath(point.x, point.y, radius, 18, {
          algorithm: 'polyhedron',
          vertex: index,
          closed: true,
          straight: true,
        });
        if (!point.front && p.faceOpacityMode !== 'opaque') markHidden(loop);
        loops.push(loop);
      }
    });
    return { loops, masks };
  };

  const clonePathMeta = (source) => (source?.meta ? JSON.parse(JSON.stringify(source.meta)) : null);

  const visibleCircleSegments = (start, end, mask) => {
    const params = [0, 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const fx = start.x - mask.center.x;
    const fy = start.y - mask.center.y;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - mask.radius * mask.radius;
    const discriminant = b * b - 4 * a * c;
    if (a > 1e-9 && discriminant > 1e-9) {
      const root = Math.sqrt(discriminant);
      const t1 = (-b - root) / (2 * a);
      const t2 = (-b + root) / (2 * a);
      if (t1 > 1e-6 && t1 < 1 - 1e-6) params.push(t1);
      if (t2 > 1e-6 && t2 < 1 - 1e-6) params.push(t2);
    }
    params.sort((left, right) => left - right);
    const deduped = [];
    params.forEach((value) => {
      if (!deduped.length || Math.abs(value - deduped[deduped.length - 1]) > 1e-6) deduped.push(value);
    });
    const parts = [];
    for (let i = 0; i < deduped.length - 1; i++) {
      const t0 = deduped[i];
      const t1 = deduped[i + 1];
      if (t1 - t0 <= 1e-6) continue;
      const mid = {
        x: start.x + dx * ((t0 + t1) * 0.5),
        y: start.y + dy * ((t0 + t1) * 0.5),
      };
      if (pointDistance(mid, mask.center) < mask.radius - 0.01) continue;
      parts.push([
        { x: start.x + dx * t0, y: start.y + dy * t0 },
        { x: start.x + dx * t1, y: start.y + dy * t1 },
      ]);
    }
    return parts;
  };

  const splitPathByCircle = (path, mask) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    const out = [];
    let current = [];
    const flush = () => {
      if (current.length >= 2) {
        const segment = current.map((pt) => ({ x: pt.x, y: pt.y }));
        const meta = clonePathMeta(path);
        if (meta) {
          delete meta.closed;
          segment.meta = meta;
        }
        out.push(segment);
      }
      current = [];
    };
    for (let i = 0; i < path.length - 1; i++) {
      const parts = visibleCircleSegments(path[i], path[i + 1], mask);
      if (!parts.length) {
        flush();
        continue;
      }
      parts.forEach((part) => {
        if (!current.length) {
          current = [part[0], part[1]];
        } else if (pointDistance(current[current.length - 1], part[0]) <= 0.02) {
          current.push(part[1]);
        } else {
          flush();
          current = [part[0], part[1]];
        }
      });
    }
    flush();
    return out;
  };

  const clipPathsByCircleMasks = (paths, masks) => {
    if (!Array.isArray(masks) || !masks.length) return paths;
    let clipped = paths;
    masks.forEach((mask) => {
      const next = [];
      clipped.forEach((path) => splitPathByCircle(path, mask).forEach((fragment) => next.push(fragment)));
      clipped = next;
    });
    return clipped;
  };

  window.Vectura.AlgorithmRegistry.polyhedron = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = params || {};
      const mesh = createSolidMesh(p);
      const vertices = mesh.vertices.map((pt) => applyVertexEffects(pt, p, mesh.bounds));
      let paths = [];
      const faceBands = Math.max(0, Math.round(clamp(finite(p.faceBands, 4), 0, 32)));
      const showFaces = p.showFaces !== false;
      const showEdges = p.showEdges !== false;
      const showVertices = p.showVertices !== false;
      // Enhancement toggles — all default OFF so generate() stays byte-identical.
      const depthCueOn = (p.depthCue || 'off') !== 'off';
      const hiddenLineOn = (p.hiddenLineMode || 'backface') !== 'backface';
      const faceRecords = mesh.faces.map((face, index) => {
        const rendered = renderedFace(mesh, vertices, face, index, p, faceBands);
        return {
          index,
          face,
          rendered,
          ...projectFace(rendered.outer, p, bounds),
          projectedBands: rendered.bands.map((band) => projectFace(band, p, bounds)),
        };
      }).sort((a, b) => a.depth - b.depth);

      if (showFaces) {
        faceRecords.forEach((record) => {
          const visible = p.surfaceMode === 'all' ? true : record.front;
          record.projectedBands.forEach((band) => {
            const loop = closePath(band.projected);
            const meta = { face: record.index, closed: true };
            if (depthCueOn) meta.depth = band.depth;
            pushPath(paths, loop, visible && record.front, p, meta);
          });
          if (!showEdges) {
            const loop = closePath(record.projected);
            const meta = { face: record.index, closed: true, outline: true };
            if (depthCueOn) meta.depth = record.depth;
            pushPath(paths, loop, visible && record.front, p, meta);
          }
        });
      }

      if (showEdges) {
        const edgeStyle = p.edgeStyle || 'dash';
        const edgeDash = edgeStyle === 'dash'
          ? [Math.max(1, finite(p.edgeSpacing, 11) * 0.45), Math.max(1, finite(p.edgeSpacing, 11) * 0.35)]
          : null;
        if (finite(p.explode, 0) || finite(p.extrude, 0) || finite(p.shard, 0)) {
          faceRecords.forEach((record) => {
            const visible = p.surfaceMode === 'all' ? true : record.front;
            for (let i = 0; i < record.projected.length; i++) {
              const a = record.projected[i];
              const b = record.projected[(i + 1) % record.projected.length];
              const meta = { edge: true, strokeDash: edgeDash };
              if (depthCueOn) meta.depth = record.depth;
              pushPath(paths, [a, b], visible && record.front, p, meta);
            }
          });
        } else if (hiddenLineOn) {
          // Enhancement #4 — screen-space painter occlusion. Replace the legacy
          // back-face cull with true hidden-line removal/dashing: occlude every
          // mesh edge against the front faces' projected polygons.
          const projVerts = projectMeshVertices(vertices, p, bounds);
          const occluders = faceRecords
            .filter((record) => record.front)
            .map((record) => ({ polygon: record.projected, depth: record.depth }));
          const segments = collectEdges(mesh.faces).map((edge) => {
            const va = projVerts[edge.a];
            const vb = projVerts[edge.b];
            return {
              a: { x: va.screen.x, y: va.screen.y, z: va.z },
              b: { x: vb.screen.x, y: vb.screen.y, z: vb.z },
              meta: depthCueOn
                ? { algorithm: 'polyhedron', straight: true, edge: true, strokeDash: edgeDash, depth: (va.z + vb.z) / 2 }
                : { algorithm: 'polyhedron', straight: true, edge: true, strokeDash: edgeDash },
            };
          });
          G3.occludeSegments(segments, occluders, { mode: p.hiddenLineMode, depthBias: finite(p.depthBias, 0.5) })
            .forEach((path) => paths.push(path));
        } else {
          collectEdges(mesh.faces).forEach((edge) => {
            const a3 = vertices[edge.a];
            const b3 = vertices[edge.b];
            const visibleFaces = edge.faces.map((idx) => faceRecords.find((record) => record.index === idx)).filter(Boolean);
            const front = visibleFaces.some((record) => record.front);
            const a = projectPoint(rotatePoint(a3, viewAngles(p)), { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
            const b = projectPoint(rotatePoint(b3, viewAngles(p)), { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
            const meta = { edge: true, strokeDash: edgeDash };
            if (depthCueOn) {
              const za = rotatePoint(a3, viewAngles(p)).z;
              const zb = rotatePoint(b3, viewAngles(p)).z;
              meta.depth = (za + zb) / 2;
            }
            pushPath(paths, [a, b], front, p, meta);
          });
        }
      }

      // Enhancement #3 — silhouette outline + feature creases. Both work off the
      // canonical (un-exploded) mesh topology so shared edges resolve correctly.
      if (p.emphasizeOutline || p.showCreases) {
        const projVerts = projectMeshVertices(vertices, p, bounds);
        const projectedScreen = projVerts.map((pv) => pv.screen);
        if (p.emphasizeOutline) {
          const faceFront = faceRecords.slice().sort((a, b) => a.index - b.index).map((record) => record.front);
          G3.extractSilhouette(mesh.faces, projectedScreen, faceFront, { weightScale: finite(p.outlineWeight, 2) })
            .forEach((path) => {
              path.meta = { algorithm: 'polyhedron', ...(path.meta || {}) };
              paths.push(path);
            });
        }
        if (p.showCreases) {
          // Per-face normals indexed by original face index (not depth-sorted).
          const faceNormals = mesh.faces.map((face) =>
            faceNormal(face.map((idx) => rotatePoint(vertices[idx], viewAngles(p)))));
          G3.extractCreases(collectEdges(mesh.faces), faceNormals, finite(p.creaseAngle, 35), projectedScreen, { weightScale: finite(p.outlineWeight, 2) })
            .forEach((path) => {
              path.meta = { algorithm: 'polyhedron', ...(path.meta || {}) };
              paths.push(path);
            });
        }
      }

      // Enhancement #5 — Lambert-shaded hatching of every visible (front) face.
      if (p.hatchEnable) {
        const lightVec = G3.resolveLight(p);
        // Spacing floor rises under a fast preview to cap line density on drag.
        const previewScale = G3.previewDetailScale(bounds);
        const baseSpacing = Math.max(1, finite(p.hatchSpacing, 6) / Math.max(0.0001, previewScale));
        faceRecords.forEach((record) => {
          if (!record.front) return;
          G3.lambertHatch(record.normal, lightVec, record.projected, {
            baseSpacing,
            angleDeg: finite(p.hatchAngle, 45),
            crossHatch: !!p.crossHatch,
          }).forEach((path) => {
            path.meta = { algorithm: 'polyhedron', ...(path.meta || {}) };
            paths.push(path);
          });
        });
      }

      if (showVertices) {
        const vertexData = buildVertexMarkers(faceRecords, p);
        paths = clipPathsByCircleMasks(paths, vertexData.masks);
        vertexData.loops.forEach((loop) => paths.push(loop));
      }

      const cleaned = cleanPaths(paths);
      // Enhancement #2 — depth cueing via dash density (no-op when depthCue off).
      G3.applyDepthCue(cleaned, p);
      return cleaned;
    },
    // Convert-to-Scene (I1) — the fully-built, DEFORMED index mesh a bake needs.
    // Vertex-level deformers (expand/twist via applyVertexEffects) map cleanly
    // onto the shared vertices; per-face deformers (explode/extrude/shard, which
    // break vertex sharing) bake each face as its OWN polygon so an exploded
    // solid converts faithfully. bulge/faceBands are interior line-art only (no
    // effect on the outer face polygon), so they never trigger the per-face split.
    bakeMesh: (params = {}) => {
      const p = params || {};
      const base = createSolidMesh(p);
      if (!Array.isArray(base.vertices) || !base.vertices.length
        || !Array.isArray(base.faces) || !base.faces.length) return { vertices: [], faces: [] };
      const dv = base.vertices.map((pt) => applyVertexEffects(pt, p, base.bounds));
      const perFace = finite(p.explode, 0) || finite(p.extrude, 0) || finite(p.shard, 0);
      if (!perFace) {
        return {
          vertices: dv.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })),
          faces: base.faces.map((f) => f.slice()),
        };
      }
      const vertices = [];
      const faces = [];
      base.faces.forEach((face, index) => {
        const { outer } = renderedFace(base, dv, face, index, p, 0);
        faces.push(outer.map((pt) => {
          vertices.push({ x: pt.x, y: pt.y, z: pt.z });
          return vertices.length - 1;
        }));
      });
      return { vertices, faces };
    },
    formula: () => 'Polyhedral faces projected with face-normal visibility and dashed hidden paths.',
  };
})();
