/**
 * meshTopography algorithm definition.
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
    mul,
    cross,
    normalize,
    rotatePoint,
    projectPoint,
    faceNormal,
    collectEdges,
    linkSegments,
    markHidden,
    cleanPaths,
  } = G3;

  // Point on the perimeter of the unit square [-1,1]^2, parameterised t in [0,1).
  const squarePerimeter = (t) => {
    const s = (((t % 1) + 1) % 1) * 4;
    const side = Math.floor(s);
    const f = s - side;
    if (side === 0) return { x: -1 + 2 * f, z: -1 };
    if (side === 1) return { x: 1, z: -1 + 2 * f };
    if (side === 2) return { x: 1 - 2 * f, z: 1 };
    return { x: -1, z: 1 - 2 * f };
  };

  const sgnPow = (value, exp) => Math.sign(value) * Math.pow(Math.abs(value), exp);

  const makeGridMesh = (rows, cols, sampler) => {
    const vertices = [];
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) vertices.push(sampler(x / cols, y / rows));
    }
    const idx = (x, y) => y * (cols + 1) + x;
    const faces = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        faces.push([idx(x, y), idx(x + 1, y), idx(x + 1, y + 1)]);
        faces.push([idx(x, y), idx(x + 1, y + 1), idx(x, y + 1)]);
      }
    }
    return { vertices, faces };
  };

  const createPrimitiveMesh = (p, detail) => {
    const mode = p.sourceMode || 'sphere';
    const sx = Math.max(1, finite(p.scaleX3d ?? p.primitiveScaleX, finite(p.artworkSize, 150) * 0.42));
    const sy = Math.max(1, finite(p.scaleY3d ?? p.primitiveScaleY, finite(p.artworkSize, 150) * 0.42));
    const sz = Math.max(1, finite(p.scaleZ3d ?? p.primitiveScaleZ, finite(p.artworkSize, 150) * 0.42));
    if (mode === 'stlMesh') {
      const mesh = p.importedMesh;
      if (!mesh || !Array.isArray(mesh.vertices) || !mesh.vertices.length || !Array.isArray(mesh.faces)) {
        return { vertices: [], faces: [] };
      }
      return {
        vertices: mesh.vertices.map((vt) => v(finite(vt.x) * sx, finite(vt.y) * sy, finite(vt.z) * sz)),
        faces: mesh.faces,
      };
    }
    if (mode === 'torus') {
      const major = Math.max(2, sx * 0.75);
      const minor = Math.max(1, Math.min(sy, sz) * 0.28);
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = u * TAU;
        const b = vv * TAU;
        return v(Math.cos(a) * (major + Math.cos(b) * minor), Math.sin(b) * minor, Math.sin(a) * (major + Math.cos(b) * minor));
      });
    }
    if (mode === 'cone') {
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = vv * TAU;
        const r = sx * (1 - u);
        return v(Math.cos(a) * r, (u - 0.5) * sy * 2, Math.sin(a) * r);
      });
    }
    if (mode === 'cube') {
      const vertices = [
        v(-sx, -sy, -sz), v(sx, -sy, -sz), v(sx, sy, -sz), v(-sx, sy, -sz),
        v(-sx, -sy, sz), v(sx, -sy, sz), v(sx, sy, sz), v(-sx, sy, sz),
      ];
      const faces = [[0, 1, 2], [0, 2, 3], [4, 7, 6], [4, 6, 5], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
      return { vertices, faces };
    }
    if (mode === 'cylinder') {
      // Open tube: u sweeps around, vv runs along the height axis.
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = u * TAU;
        return v(Math.cos(a) * sx, (vv - 0.5) * sy * 2, Math.sin(a) * sz);
      });
    }
    if (mode === 'capsule') {
      // Cylindrical body with hemispherical caps; vv runs bottom→top along the axis.
      const r = Math.max(1, Math.min(sx, sz));
      const half = Math.max(r, sy);
      const cylHalf = Math.max(0, half - r);
      const cylFrac = cylHalf / half;
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const a = u * TAU;
        const tt = vv * 2 - 1; // -1..1
        let yy;
        let rad;
        if (Math.abs(tt) <= cylFrac || cylFrac >= 1) {
          yy = tt * half;
          rad = r;
        } else {
          const sign = Math.sign(tt) || 1;
          const e = (Math.abs(tt) - cylFrac) / Math.max(1e-6, 1 - cylFrac);
          const ang = e * (Math.PI / 2);
          yy = sign * (cylHalf + Math.sin(ang) * r);
          rad = Math.cos(ang) * r;
        }
        return v(Math.cos(a) * rad * (sx / r), yy, Math.sin(a) * rad * (sz / r));
      });
    }
    if (mode === 'pyramid') {
      // Square cross-section tapering to an apex; subdivides with detail.
      return makeGridMesh(detail, detail * 4, (u, vv) => {
        const edge = squarePerimeter(u);
        const taper = 1 - vv; // 1 at base, 0 at apex
        return v(edge.x * sx * taper, (vv - 0.5) * sy * 2, edge.z * sz * taper);
      });
    }
    if (mode === 'superellipsoid') {
      const e1 = 0.4;
      const e2 = 0.4;
      return makeGridMesh(detail, detail * 2, (u, vv) => {
        const lon = (u - 0.5) * TAU;
        const lat = (vv - 0.5) * Math.PI;
        const cv = sgnPow(Math.cos(lat), e1);
        const sv = sgnPow(Math.sin(lat), e1);
        const cu = sgnPow(Math.cos(lon), e2);
        const su = sgnPow(Math.sin(lon), e2);
        return v(cv * cu * sx, sv * sy, cv * su * sz);
      });
    }
    if (mode === 'torusKnot') {
      // (p,q) torus knot rendered as a swept tube; u runs along the knot, vv around the tube.
      const pK = 2;
      const qK = 3;
      const R = Math.max(2, sx * 0.62);
      const tubeR = Math.max(1, Math.min(sy, sz) * 0.24);
      const knotCenter = (t) => {
        const r = R * (2 + Math.cos(qK * t)) * 0.5;
        return v(r * Math.cos(pK * t), R * Math.sin(qK * t) * 0.5, r * Math.sin(pK * t));
      };
      return makeGridMesh(detail, detail * 4, (u, vv) => {
        const t = u * TAU;
        const phi = vv * TAU;
        const center = knotCenter(t);
        const ahead = knotCenter(t + 0.01);
        const tangent = normalize(v(ahead.x - center.x, ahead.y - center.y, ahead.z - center.z));
        const refUp = Math.abs(tangent.y) > 0.9 ? v(1, 0, 0) : v(0, 1, 0);
        const binormal = normalize(cross(tangent, refUp));
        const normal = normalize(cross(binormal, tangent));
        return add(center, add(mul(normal, Math.cos(phi) * tubeR), mul(binormal, Math.sin(phi) * tubeR)));
      });
    }
    return makeGridMesh(detail, detail * 2, (u, vv) => {
      const lat = (u - 0.5) * Math.PI;
      const lon = vv * TAU;
      const rx = mode === 'ellipsoid' ? sx * 1.18 : sx;
      const ry = mode === 'ellipsoid' ? sy * 0.72 : sy;
      const rz = sz;
      return v(Math.cos(lon) * Math.cos(lat) * rx, Math.sin(lat) * ry, Math.sin(lon) * Math.cos(lat) * rz);
    });
  };

  const project3 = (pt, p, bounds) => {
    const rotated = rotatePoint(pt, { yaw: finite(p.rotate, -28), pitch: finite(p.tilt, 34), roll: 0 });
    return {
      rotated,
      projected: projectPoint(rotated, { centerX: bounds.width / 2, centerY: bounds.height / 2, scale: 1, ...G3.resolveProjection(p) }),
    };
  };

  const trianglePlaneSegment = (tri, z) => {
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      const da = a.z - z;
      const db = b.z - z;
      if (Math.abs(da) < 1e-6) pts.push(a);
      if (da * db < 0) {
        const t = Math.abs(da) / (Math.abs(da) + Math.abs(db));
        pts.push(v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, z));
      }
    }
    if (pts.length < 2) return null;
    return [pts[0], pts[1]];
  };

  const buildWireframe = (mesh, p, bounds) => {
    const projected = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const faceFront = mesh.faces.map((face) => {
      const pts = face.map((idx) => projected[idx].rotated);
      return faceNormal(pts).z >= -0.001;
    });
    const full = (p.contourVisibility || 'visibleOnly') === 'fullContour';
    const paths = [];
    collectEdges(mesh.faces).forEach((edge) => {
      const front = edge.faces.some((idx) => faceFront[idx]);
      if (!front && !full) return;
      const path = [projected[edge.a].projected, projected[edge.b].projected].map((pt) => ({ x: pt.x, y: pt.y }));
      path.meta = { algorithm: 'meshTopography', straight: true, meshEdge: true };
      if (!front) markHidden(path);
      paths.push(path);
    });
    return paths;
  };

  const buildContours = (mesh, p, bounds) => {
    const planeVertices = mesh.vertices.map((pt) => rotatePoint(pt, {
      yaw: finite(p.planeRotate, 0),
      pitch: finite(p.planeTilt, 0),
    }));
    let minZ = Infinity;
    let maxZ = -Infinity;
    planeVertices.forEach((pt) => {
      minZ = Math.min(minZ, pt.z);
      maxZ = Math.max(maxZ, pt.z);
    });
    const count = Math.max(2, Math.round(clamp(finite(p.lineCount, 26), 2, 120)));
    const full = (p.contourVisibility || 'visibleOnly') === 'fullContour';
    const paths = [];
    for (let level = 1; level <= count; level++) {
      const z = minZ + (level / (count + 1)) * (maxZ - minZ || 1);
      const visibleSegments = [];
      const hiddenSegments = [];
      mesh.faces.forEach((face) => {
        const tri = face.map((idx) => planeVertices[idx]);
        const seg = trianglePlaneSegment(tri, z);
        if (!seg) return;
        const rotatedTri = tri.map((pt) => rotatePoint(pt, { yaw: finite(p.rotate, -28), pitch: finite(p.tilt, 34) }));
        const front = faceNormal(rotatedTri).z >= -0.001;
        if (!front && !full) return;
        const projected = seg.map((pt) => project3(pt, p, bounds).projected);
        (front ? visibleSegments : hiddenSegments).push(projected);
      });
      linkSegments(visibleSegments).forEach((path) => {
        path.meta = { algorithm: 'meshTopography', contour: true, straight: true };
        path = G3.smoothToBezier(path, finite(p.contourSmoothing, 0));
        paths.push(path);
      });
      linkSegments(hiddenSegments).forEach((path) => {
        path.meta = { algorithm: 'meshTopography', contour: true, straight: true };
        path = G3.smoothToBezier(path, finite(p.contourSmoothing, 0));
        markHidden(path);
        paths.push(path);
      });
    }
    return paths;
  };

  const buildSilhouette = (mesh, p, bounds) => {
    if (p.showOutline === false) return [];
    const projected = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const faceFront = mesh.faces.map((face) => faceNormal(face.map((idx) => projected[idx].rotated)).z >= -0.001);
    const paths = [];
    collectEdges(mesh.faces).forEach((edge) => {
      const sides = edge.faces.map((idx) => faceFront[idx]);
      if (sides.length < 2 || sides[0] === sides[1]) return;
      const path = [projected[edge.a].projected, projected[edge.b].projected].map((pt) => ({ x: pt.x, y: pt.y }));
      path.meta = { algorithm: 'meshTopography', silhouette: true, straight: true };
      paths.push(path);
    });
    return paths;
  };

  window.Vectura.AlgorithmRegistry.meshTopography = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      const p = params || {};
      const preview = Boolean(p.fastPreview || bounds.fastPreview);
      const simplify = clamp(finite(p.simplifyMesh, 0), 0, 1);
      const rawDetail = clamp(finite(p.primitiveDetail, 18), 4, preview ? G3.previewCap(bounds, 100) : 100);
      const detail = Math.max(4, Math.round(rawDetail * (1 - simplify * 0.65)));
      const mesh = createPrimitiveMesh(p, detail);
      let paths = [];
      const mode = p.renderMode || 'contours';
      if (mode === 'wireframe' || mode === 'triangleMesh') paths = buildWireframe(mesh, p, bounds);
      else paths = buildContours(mesh, p, bounds);
      paths.push(...buildSilhouette(mesh, p, bounds));
      return cleanPaths(paths);
    },
    formula: () => 'Primitive mesh sliced by depth planes or drawn as a projected wireframe.',
  };
})();
