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

  const regularRing = (count, radius, y = 0, phase = -Math.PI / 2) => {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * TAU;
      pts.push(v(Math.cos(a) * radius, y, Math.sin(a) * radius));
    }
    return pts;
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
      return {
        vertices: mesh.vertices.map((vt) => v(finite(vt.x) * radius, finite(vt.y) * radius, finite(vt.z) * radius)),
        faces: mesh.faces.map((f) => f.slice()),
      };
    }
    if (type === 'flatPolygon') {
      return { vertices: regularRing(sides, radius, 0), faces: [Array.from({ length: sides }, (_, i) => i)] };
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
      return { vertices, faces };
    }
    if (type === 'bipyramid') {
      const ring = regularRing(sides, radius, 0);
      const top = ring.length;
      const bottom = top + 1;
      const vertices = ring.concat([v(0, depth / 2, 0), v(0, -depth / 2, 0)]);
      const faces = [];
      for (let i = 0; i < sides; i++) {
        const n = (i + 1) % sides;
        faces.push([top, i, n]);
        faces.push([bottom, n, i]);
      }
      return { vertices, faces };
    }
    if (type === 'tetrahedron') {
      const a = radius / Math.sqrt(3);
      return {
        vertices: [v(a, a, a), v(-a, -a, a), v(-a, a, -a), v(a, -a, -a)].map((pt) => mul(normalize(pt), radius)),
        faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
      };
    }
    if (type === 'cube') {
      const r = radius / Math.sqrt(3);
      return {
        vertices: [
          v(-r, -r, -r), v(r, -r, -r), v(r, r, -r), v(-r, r, -r),
          v(-r, -r, r), v(r, -r, r), v(r, r, r), v(-r, r, r),
        ],
        faces: [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]],
      };
    }
    if (type === 'octahedron') {
      return {
        vertices: [v(radius, 0, 0), v(-radius, 0, 0), v(0, radius, 0), v(0, -radius, 0), v(0, 0, radius), v(0, 0, -radius)],
        faces: [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]],
      };
    }
    if (type === 'icosahedron') {
      const phi = (1 + Math.sqrt(5)) / 2;
      const raw = [
        v(-1, phi, 0), v(1, phi, 0), v(-1, -phi, 0), v(1, -phi, 0),
        v(0, -1, phi), v(0, 1, phi), v(0, -1, -phi), v(0, 1, -phi),
        v(phi, 0, -1), v(phi, 0, 1), v(-phi, 0, -1), v(-phi, 0, 1),
      ].map((pt) => mul(normalize(pt), radius));
      return {
        vertices: raw,
        faces: [
          [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
          [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
          [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
          [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
        ],
      };
    }

    const lat = 5;
    const lon = 10;
    const vertices = [v(0, radius, 0)];
    for (let y = 1; y < lat; y++) {
      const vv = y / lat;
      const theta = vv * Math.PI;
      const rr = Math.sin(theta) * radius;
      const yy = Math.cos(theta) * radius;
      for (let x = 0; x < lon; x++) {
        const a = (x / lon) * TAU + (y % 2) * (Math.PI / lon);
        vertices.push(v(Math.cos(a) * rr, yy, Math.sin(a) * rr));
      }
    }
    const bottom = vertices.length;
    vertices.push(v(0, -radius, 0));
    const faces = [];
    for (let x = 0; x < lon; x++) faces.push([0, 1 + x, 1 + ((x + 1) % lon)]);
    for (let y = 1; y < lat - 1; y++) {
      const row = 1 + (y - 1) * lon;
      const next = row + lon;
      for (let x = 0; x < lon; x++) faces.push([row + x, row + ((x + 1) % lon), next + ((x + 1) % lon), next + x]);
    }
    const last = 1 + (lat - 2) * lon;
    for (let x = 0; x < lon; x++) faces.push([bottom, last + ((x + 1) % lon), last + x]);
    return { vertices, faces };
  };

  const applyVertexEffects = (pt, p) => {
    const expand = clamp(finite(p.expand, 100) / 100, 0.1, 3);
    let out = mul(pt, expand);
    const bulge = finite(p.bulge, 0);
    if (Math.abs(bulge) > 0.001) out = add(out, mul(normalize(out), bulge));
    const twist = finite(p.twist, 0);
    if (Math.abs(twist) > 0.001) {
      const amount = (out.y / Math.max(1, finite(p.depth, 94))) * twist;
      out = rotatePoint(out, { yaw: amount });
    }
    return out;
  };

  const renderedFace = (mesh, vertices, face, faceIndex, p) => {
    const base = face.map((idx) => vertices[idx]);
    const center = mul(base.reduce((acc, pt) => add(acc, pt), v(0, 0, 0)), 1 / Math.max(1, base.length));
    const normal = faceNormal(base);
    const explode = finite(p.explode, 0);
    const extrude = finite(p.extrude, 0);
    const shard = clamp(finite(p.shard, 0) / 100, 0, 1);
    return base.map((pt, i) => {
      let out = add(pt, mul(normal, extrude));
      out = add(out, mul(normalize(center), explode));
      if (shard > 0) {
        out = add(out, mul(normal, (hash01(faceIndex * 19 + i * 7) - 0.5) * shard * 18));
      }
      return out;
    });
  };

  const projectFace = (facePts, p, bounds) => {
    const view = { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28), roll: 0 };
    const rotated = facePts.map((pt) => rotatePoint(pt, view));
    const normal = faceNormal(rotated);
    const projected = rotated.map((pt) => projectPoint(pt, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) }));
    const depth = rotated.reduce((sum, pt) => sum + pt.z, 0) / Math.max(1, rotated.length);
    return { rotated, projected, normal, front: normal.z >= -0.001, depth };
  };

  const pushPath = (paths, pts, visible, p, meta = {}) => {
    if (!visible && (p.faceOpacityMode === 'opaque' || p.surfaceMode === 'front')) return;
    const path = pts.map((pt) => ({ x: pt.x, y: pt.y }));
    path.meta = { algorithm: 'polyhedron', straight: true, ...meta };
    if (!visible) markHidden(path);
    paths.push(path);
  };

  const scaledFaceLoop = (face, scale) => {
    const center = face.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
    center.x /= Math.max(1, face.length);
    center.y /= Math.max(1, face.length);
    return face.map((pt) => ({ x: center.x + (pt.x - center.x) * scale, y: center.y + (pt.y - center.y) * scale }));
  };

  window.Vectura.AlgorithmRegistry.polyhedron = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = params || {};
      const mesh = createSolidMesh(p);
      const vertices = mesh.vertices.map((pt) => applyVertexEffects(pt, p));
      const paths = [];
      const faceBands = Math.max(0, Math.round(clamp(finite(p.faceBands, 4), 0, 32)));
      const showFaces = p.showFaces !== false;
      const showEdges = p.showEdges !== false;
      const showVertices = p.showVertices !== false;
      const faceRecords = mesh.faces.map((face, index) => {
        const pts = renderedFace(mesh, vertices, face, index, p);
        return { index, face, ...projectFace(pts, p, bounds) };
      }).sort((a, b) => a.depth - b.depth);

      if (showFaces && faceBands > 0) {
        faceRecords.forEach((record) => {
          const visible = p.surfaceMode === 'all' ? true : record.front;
          for (let b = 1; b <= faceBands; b++) {
            const loop = closePath(scaledFaceLoop(record.projected, b / (faceBands + 1)));
            pushPath(paths, loop, visible && record.front, p, { face: record.index, closed: true });
          }
        });
      }

      if (showEdges) {
        const edgeStyle = p.edgeStyle || 'dash';
        if (finite(p.explode, 0) || finite(p.extrude, 0) || finite(p.shard, 0)) {
          faceRecords.forEach((record) => {
            const visible = p.surfaceMode === 'all' ? true : record.front;
            for (let i = 0; i < record.projected.length; i++) {
              const a = record.projected[i];
              const b = record.projected[(i + 1) % record.projected.length];
              pushPath(paths, [a, b], visible && record.front, p, {
                edge: true,
                strokeDash: edgeStyle === 'dash' ? [Math.max(1, finite(p.edgeSpacing, 11) * 0.45), Math.max(1, finite(p.edgeSpacing, 11) * 0.35)] : null,
              });
            }
          });
        } else {
          collectEdges(mesh.faces).forEach((edge) => {
            const a3 = vertices[edge.a];
            const b3 = vertices[edge.b];
            const visibleFaces = edge.faces.map((idx) => faceRecords.find((record) => record.index === idx)).filter(Boolean);
            const front = visibleFaces.some((record) => record.front);
            const a = projectPoint(rotatePoint(a3, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) }), { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
            const b = projectPoint(rotatePoint(b3, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) }), { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) });
            pushPath(paths, [a, b], front, p, {
              edge: true,
              strokeDash: edgeStyle === 'dash' ? [Math.max(1, finite(p.edgeSpacing, 11) * 0.45), Math.max(1, finite(p.edgeSpacing, 11) * 0.35)] : null,
            });
          });
        }
      }

      if (showVertices) {
        const projectedVertices = vertices.map((pt) => {
          const rotated = rotatePoint(pt, { yaw: finite(p.rotate, -18), pitch: finite(p.tilt, 28) });
          return { ...projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) }), front: rotated.z >= 0 };
        });
        projectedVertices.forEach((pt, index) => {
          const visible = p.vertexOcclusionMode === 'occlude' ? pt.front : true;
          if ((!visible || !pt.front) && p.faceOpacityMode === 'opaque') return;
          for (let ring = 1; ring <= Math.max(1, Math.round(finite(p.vertexRings, 1))); ring++) {
            const loop = circlePath(pt.x, pt.y, Math.max(0.4, finite(p.vertexSize, 4.2) * ring * 0.45), 18, {
              algorithm: 'polyhedron',
              vertex: index,
              closed: true,
              straight: true,
            });
            if (!pt.front && p.faceOpacityMode !== 'opaque') markHidden(loop);
            paths.push(loop);
          }
        });
      }

      return cleanPaths(paths);
    },
    formula: () => 'Polyhedral faces projected with face-normal visibility and dashed hidden paths.',
  };
})();
