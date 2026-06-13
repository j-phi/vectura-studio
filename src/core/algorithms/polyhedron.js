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

  const regularRing = (count, radius, z = 0, phase = -Math.PI / 2) => {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * TAU;
      pts.push(v(Math.cos(a) * radius, Math.sin(a) * radius, z));
    }
    return pts;
  };

  const average3 = (points) => {
    const total = (points || []).reduce((acc, pt) => add(acc, pt), v(0, 0, 0));
    return mul(total, points?.length ? 1 / points.length : 0);
  };

  const lerp3 = (a, b, t) => v(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t
  );

  const meshBounds = (vertices) => {
    let maxRadius = 0;
    let maxDepth = 0;
    (vertices || []).forEach((pt) => {
      maxRadius = Math.max(maxRadius, Math.hypot(pt.x, pt.y, pt.z));
      maxDepth = Math.max(maxDepth, Math.abs(pt.z));
    });
    return {
      maxRadius: Math.max(1, maxRadius),
      maxDepth: Math.max(1, maxDepth || maxRadius),
    };
  };

  const withBounds = (mesh) => ({
    ...mesh,
    bounds: mesh.bounds || meshBounds(mesh.vertices),
  });

  const scaleMeshToRadius = (mesh, radius) => {
    const current = meshBounds(mesh.vertices).maxRadius;
    const scale = current > 0 ? radius / current : 1;
    return withBounds({
      vertices: mesh.vertices.map((pt) => mul(pt, scale)),
      faces: mesh.faces.map((face) => face.slice()),
    });
  };

  const orientFace = (face, vertices) => {
    const indices = face.slice();
    const points = indices.map((idx) => vertices[idx]);
    if (dot(faceNormal(points), average3(points)) < 0) indices.reverse();
    return indices;
  };

  const projectToTangent = (vector, normal) => sub(vector, mul(normal, dot(vector, normal)));

  const buildNeighborsByVertex = (faces, vertexCount) => {
    const neighbors = Array.from({ length: vertexCount }, () => []);
    faces.forEach((face) => {
      for (let i = 0; i < face.length; i++) {
        const current = face[i];
        const next = face[(i + 1) % face.length];
        const previous = face[(i + face.length - 1) % face.length];
        if (!neighbors[current].includes(next)) neighbors[current].push(next);
        if (!neighbors[current].includes(previous)) neighbors[current].push(previous);
      }
    });
    return neighbors;
  };

  const sortNeighborsAroundVertex = (vertexIndex, neighbors, vertices) => {
    const origin = vertices[vertexIndex];
    const normal = normalize(origin);
    const reference = Math.abs(normal.z) < 0.9 ? v(0, 0, 1) : v(0, 1, 0);
    const basisX = normalize(cross(reference, normal));
    const basisY = normalize(cross(normal, basisX));
    return (neighbors || []).slice().sort((left, right) => {
      const leftVector = normalize(projectToTangent(sub(vertices[left], origin), normal));
      const rightVector = normalize(projectToTangent(sub(vertices[right], origin), normal));
      const leftAngle = Math.atan2(dot(leftVector, basisY), dot(leftVector, basisX));
      const rightAngle = Math.atan2(dot(rightVector, basisY), dot(rightVector, basisX));
      return leftAngle - rightAngle;
    });
  };

  const createIcosahedronMesh = (radius) => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      v(-1, phi, 0), v(1, phi, 0), v(-1, -phi, 0), v(1, -phi, 0),
      v(0, -1, phi), v(0, 1, phi), v(0, -1, -phi), v(0, 1, -phi),
      v(phi, 0, -1), v(phi, 0, 1), v(-phi, 0, -1), v(-phi, 0, 1),
    ].map((pt) => mul(normalize(pt), radius));
    return withBounds({
      vertices,
      faces: [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
      ],
    });
  };

  const createTruncatedIcosahedronMesh = (radius) => {
    const base = createIcosahedronMesh(1);
    const orientedBaseFaces = base.faces.map((face) => orientFace(face, base.vertices));
    const directedVertexMap = new Map();
    const vertices = [];

    const getDirectedVertex = (start, end) => {
      const key = `${start}:${end}`;
      if (directedVertexMap.has(key)) return directedVertexMap.get(key);
      const index = vertices.length;
      vertices.push(lerp3(base.vertices[start], base.vertices[end], 1 / 3));
      directedVertexMap.set(key, index);
      return index;
    };

    const faces = [];
    orientedBaseFaces.forEach((face) => {
      const [a, b, c] = face;
      faces.push([
        getDirectedVertex(a, b),
        getDirectedVertex(b, a),
        getDirectedVertex(b, c),
        getDirectedVertex(c, b),
        getDirectedVertex(c, a),
        getDirectedVertex(a, c),
      ]);
    });

    const neighborsByVertex = buildNeighborsByVertex(orientedBaseFaces, base.vertices.length);
    for (let vertexIndex = 0; vertexIndex < base.vertices.length; vertexIndex++) {
      const neighbors = sortNeighborsAroundVertex(vertexIndex, neighborsByVertex[vertexIndex], base.vertices);
      if (neighbors.length >= 3) {
        faces.push(neighbors.map((neighbor) => getDirectedVertex(vertexIndex, neighbor)));
      }
    }

    return scaleMeshToRadius({
      vertices,
      faces: faces.map((face) => orientFace(face, vertices)),
    }, radius);
  };

  const createSolidMesh = (p) => {
    const type = p.solidType || 'buckyball';
    const radius = Math.max(1, finite(p.radius, 76));
    const sides = Math.max(3, Math.round(clamp(finite(p.sideCount, 5), 3, 180)));
    const depth = Math.max(0.1, finite(p.depth, 94));
    if (type === 'importedMesh') {
      const mesh = p.importedMesh;
      if (!mesh || !Array.isArray(mesh.vertices) || !mesh.vertices.length || !Array.isArray(mesh.faces)) {
        return { vertices: [], faces: [] };
      }
      return withBounds({
        vertices: mesh.vertices.map((vt) => v(finite(vt.x) * radius, finite(vt.y) * radius, finite(vt.z) * radius)),
        faces: mesh.faces.map((f) => f.slice()),
      });
    }
    if (type === 'flatPolygon') {
      return withBounds({ vertices: regularRing(sides, radius, 0), faces: [Array.from({ length: sides }, (_, i) => i)] });
    }
    if (type === 'prism' || type === 'antiprism') {
      const top = regularRing(sides, radius, depth / 2, type === 'antiprism' ? Math.PI / sides - Math.PI / 2 : -Math.PI / 2);
      const bottom = regularRing(sides, radius, -depth / 2, -Math.PI / 2);
      const vertices = top.concat(bottom);
      const faces = [Array.from({ length: sides }, (_, i) => i), Array.from({ length: sides }, (_, i) => sides + sides - 1 - i)];
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        if (type === 'antiprism') {
          faces.push([i, sides + i, n]);
          faces.push([n, sides + i, sides + n]);
        } else {
          faces.push([i, n, sides + n, sides + i]);
        }
      }
      return withBounds({ vertices, faces });
    }
    if (type === 'bipyramid') {
      const ring = regularRing(sides, radius, 0);
      const top = ring.length;
      const bottom = top + 1;
      const vertices = ring.concat([v(0, 0, depth / 2), v(0, 0, -depth / 2)]);
      const faces = [];
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        faces.push([top, i, n]);
        faces.push([bottom, n, i]);
      }
      return withBounds({ vertices, faces });
    }
    if (type === 'tetrahedron') {
      const a = radius / Math.sqrt(3);
      return withBounds({
        vertices: [v(a, a, a), v(-a, -a, a), v(-a, a, -a), v(a, -a, -a)].map((pt) => mul(normalize(pt), radius)),
        faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
      });
    }
    if (type === 'cube') {
      const r = radius / Math.sqrt(3);
      return withBounds({
        vertices: [
          v(-r, -r, -r), v(r, -r, -r), v(r, r, -r), v(-r, r, -r),
          v(-r, -r, r), v(r, -r, r), v(r, r, r), v(-r, r, r),
        ],
        faces: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]],
      });
    }
    if (type === 'octahedron') {
      return withBounds({
        vertices: [v(radius, 0, 0), v(-radius, 0, 0), v(0, radius, 0), v(0, -radius, 0), v(0, 0, radius), v(0, 0, -radius)],
        faces: [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]],
      });
    }
    if (type === 'icosahedron') {
      return createIcosahedronMesh(radius);
    }
    return createTruncatedIcosahedronMesh(radius);
  };

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

  const projectFace = (facePts, p, bounds) => {
    const view = { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28), roll: 0 };
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
      const rotated = rotatePoint(pt, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) });
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
      if (p.vertexOcclusionMode === 'occlude') {
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
            const a = projectPoint(rotatePoint(a3, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) }), { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
            const b = projectPoint(rotatePoint(b3, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) }), { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
            const meta = { edge: true, strokeDash: edgeDash };
            if (depthCueOn) {
              const za = rotatePoint(a3, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) }).z;
              const zb = rotatePoint(b3, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) }).z;
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
            faceNormal(face.map((idx) => rotatePoint(vertices[idx], { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) }))));
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
    formula: () => 'Polyhedral faces projected with face-normal visibility and dashed hidden paths.',
  };
})();
