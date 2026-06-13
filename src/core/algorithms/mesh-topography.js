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
    extractCreases,
    occludeSegments,
    lambertHatch,
    resolveLight,
    applyDepthCue,
  } = G3;

  // A 3D enhancement is active only when at least one opt-in toggle is set; this
  // gate keeps the legacy path byte-identical when every control sits at its
  // default (all off). Hidden-line is "on" only for the non-backface modes.
  const hiddenLineActive = (p) => (p.hiddenLineMode || 'backface') !== 'backface';

  // Front-facing screen polygons (with mean rotated z as painter depth) used as
  // occluders for hidden-line removal/dashing. Built from the projected mesh.
  const buildOccluders = (mesh, projected, bounds, cap) => {
    const occluders = [];
    for (let i = 0; i < mesh.faces.length; i++) {
      const face = mesh.faces[i];
      const rotated = face.map((idx) => projected[idx].rotated);
      if (faceNormal(rotated).z < -0.001) continue; // back face — not an occluder
      const polygon = face.map((idx) => {
        const pr = projected[idx].projected;
        return { x: pr.x, y: pr.y };
      });
      if (polygon.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) continue;
      const depth = rotated.reduce((sum, pt) => sum + pt.z, 0) / (rotated.length || 1);
      occluders.push({ polygon, depth });
      if (cap && occluders.length >= cap) break;
    }
    return occluders;
  };

  // Run hidden-line occlusion over already-built paths whose meta carries a
  // straight 2-point screen edge plus per-endpoint camera z (depthA/depthB).
  // Paths that are not simple straight segments are passed through untouched.
  const occludePaths = (paths, occluders, mode, depthBias) => {
    const out = [];
    paths.forEach((path) => {
      if (!path || !path.meta || path.meta.straight !== true || path.length !== 2 ||
          !Number.isFinite(path.meta.depthA) || !Number.isFinite(path.meta.depthB)) {
        out.push(path);
        return;
      }
      const meta = { ...path.meta };
      delete meta.depthA;
      delete meta.depthB;
      const seg = {
        a: { x: path[0].x, y: path[0].y, z: path.meta.depthA },
        b: { x: path[1].x, y: path[1].y, z: path.meta.depthB },
        meta,
      };
      occludeSegments([seg], occluders, { mode, depthBias }).forEach((p) => out.push(p));
    });
    return out;
  };

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
    const rotated = rotatePoint(pt, { yaw: finite(p.yaw, finite(p.rotate, -28)), pitch: finite(p.pitch, finite(p.tilt, 34)), roll: finite(p.roll, 0) });
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

  const buildWireframe = (mesh, p, bounds, flags = {}) => {
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
      const za = projected[edge.a].rotated.z;
      const zb = projected[edge.b].rotated.z;
      if (flags.depthCue) path.meta.depth = (za + zb) / 2;
      if (flags.occlude) { path.meta.depthA = za; path.meta.depthB = zb; }
      if (!front) markHidden(path);
      paths.push(path);
    });
    return paths;
  };

  const buildContours = (mesh, p, bounds, flags = {}) => {
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
    const stampDepth = flags.depthCue || flags.occlude;
    const paths = [];
    for (let level = 1; level <= count; level++) {
      const z = minZ + (level / (count + 1)) * (maxZ - minZ || 1);
      const visibleSegments = [];
      const hiddenSegments = [];
      // Parallel array of mean rotated camera-z per slice segment, only when a
      // depth-aware enhancement needs it (keeps the legacy path allocation-free).
      const visibleDepths = stampDepth ? [] : null;
      const hiddenDepths = stampDepth ? [] : null;
      mesh.faces.forEach((face) => {
        const tri = face.map((idx) => planeVertices[idx]);
        const seg = trianglePlaneSegment(tri, z);
        if (!seg) return;
        const rotatedTri = tri.map((pt) => rotatePoint(pt, { yaw: finite(p.yaw, finite(p.rotate, -28)), pitch: finite(p.pitch, finite(p.tilt, 34)), roll: finite(p.roll, 0) }));
        const front = faceNormal(rotatedTri).z >= -0.001;
        if (!front && !full) return;
        const projectedSeg = seg.map((pt) => project3(pt, p, bounds));
        const projected = projectedSeg.map((pr) => pr.projected);
        if (flags.occlude) {
          // Carry per-endpoint camera z on the slice segment for occlusion.
          projected.za = projectedSeg[0].rotated.z;
          projected.zb = projectedSeg[1].rotated.z;
        }
        (front ? visibleSegments : hiddenSegments).push(projected);
        if (stampDepth) {
          const meanZ = (projectedSeg[0].rotated.z + projectedSeg[1].rotated.z) / 2;
          (front ? visibleDepths : hiddenDepths).push(meanZ);
        }
      });
      if (flags.occlude) {
        // Hidden-line mode: emit raw, occludable 2-point slice segments (with
        // per-endpoint camera z) instead of linked+smoothed polylines, so the
        // painter occluder can split them where front faces hide them.
        const emitRaw = (segments, depths, hidden) => {
          segments.forEach((seg, i) => {
            const path = [{ x: seg[0].x, y: seg[0].y }, { x: seg[1].x, y: seg[1].y }];
            path.meta = { algorithm: 'meshTopography', contour: true, straight: true };
            path.meta.depthA = seg.za;
            path.meta.depthB = seg.zb;
            if (flags.depthCue && depths && depths[i] != null) path.meta.depth = depths[i];
            if (hidden) markHidden(path);
            paths.push(path);
          });
        };
        emitRaw(visibleSegments, visibleDepths, false);
        emitRaw(hiddenSegments, hiddenDepths, true);
      } else {
        // A contour curves when the layer's Curves toggle is on OR the Contour
        // Smoothing slider is raised (smoothing implies curves for back-compat).
        // Curves-on is the master enable; Contour Smoothing controls how hard the
        // oversampled slice polyline is simplified before bezier handles are fit,
        // so the result is smooth AND lean ("optimized, elegant lines" on export).
        const smoothAmt = clamp(finite(p.contourSmoothing, 0), 0, 100);
        const curvesOn = p.curves === true;
        const wantBezier = curvesOn || smoothAmt > 0;
        const emit = (segments, depths, hidden) => {
          linkSegments(segments).forEach((path) => {
            path.meta = { algorithm: 'meshTopography', contour: true, straight: true };
            if (stampDepth && depths && depths.length) {
              // Representative depth = mean of all contributing slice midpoints.
              path.meta.depth = depths.reduce((s, d) => s + d, 0) / depths.length;
            }
            if (wantBezier) {
              // Tolerance scales with each contour's own bounding-box diagonal so it
              // adapts to artwork size: Curves-on alone trims the densest oversampling
              // (~0.4% of the diagonal); the slider drives it up to ~2.4%.
              let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
              for (let i = 0; i < path.length; i++) {
                const pt = path[i];
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }
              const diag = Math.hypot(maxX - minX, maxY - minY) || 1;
              const tol = Math.max(curvesOn ? diag * 0.004 : 0, (smoothAmt / 100) * diag * 0.024);
              // Tension floor keeps Curves-on smooth even at smoothing 0 (else the
              // simplified anchors would join as flat, faceted chords).
              const tension = Math.min(100, 55 + smoothAmt * 0.45);
              path = G3.smoothToBezier(path, tension, { simplifyTolerance: tol });
            }
            if (hidden) markHidden(path);
            paths.push(path);
          });
        };
        emit(visibleSegments, visibleDepths, false);
        emit(hiddenSegments, hiddenDepths, true);
      }
    }
    return paths;
  };

  const buildSilhouette = (mesh, p, bounds, flags = {}) => {
    // Gate on the legacy outline toggle OR the new emphasizeOutline enhancement.
    const emphasize = p.emphasizeOutline === true;
    if (p.showOutline === false && !emphasize) return [];
    const projected = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const faceFront = mesh.faces.map((face) => faceNormal(face.map((idx) => projected[idx].rotated)).z >= -0.001);
    const weightScale = emphasize ? Math.max(0.1, finite(p.outlineWeight, 2)) : null;
    const paths = [];
    collectEdges(mesh.faces).forEach((edge) => {
      const sides = edge.faces.map((idx) => faceFront[idx]);
      if (sides.length < 2 || sides[0] === sides[1]) return;
      const path = [projected[edge.a].projected, projected[edge.b].projected].map((pt) => ({ x: pt.x, y: pt.y }));
      path.meta = { algorithm: 'meshTopography', silhouette: true, straight: true };
      // #3 emphasize: stamp the outline weight so the renderer/SVG draws it heavier.
      if (weightScale != null) { path.meta.outline = true; path.meta.weightScale = weightScale; }
      if (flags.depthCue) {
        path.meta.depth = (projected[edge.a].rotated.z + projected[edge.b].rotated.z) / 2;
      }
      paths.push(path);
    });
    return paths;
  };

  // #3 — crease (feature-edge) extraction. Per-face normals are computed from the
  // rotated (camera-space) face vertices so the threshold is view-consistent.
  const buildCreases = (mesh, p, bounds, flags = {}) => {
    const projectedVerts = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const projected = projectedVerts.map((pr) => ({ x: pr.projected.x, y: pr.projected.y }));
    const faceNormals = mesh.faces.map((face) => faceNormal(face.map((idx) => projectedVerts[idx].rotated)));
    const edges = collectEdges(mesh.faces);
    const paths = extractCreases(edges, faceNormals, finite(p.creaseAngle, 35), projected, {
      weightScale: Math.max(0.1, finite(p.outlineWeight, 2)),
    });
    // Map a screen point back to a vertex camera z for optional depth cueing.
    const zByKey = flags.depthCue ? new Map() : null;
    if (zByKey) {
      projectedVerts.forEach((pr) => {
        zByKey.set(`${pr.projected.x.toFixed(3)},${pr.projected.y.toFixed(3)}`, pr.rotated.z);
      });
    }
    paths.forEach((path) => {
      path.meta = { ...(path.meta || {}), algorithm: 'meshTopography' };
      if (zByKey && path.length === 2) {
        const za = zByKey.get(`${path[0].x.toFixed(3)},${path[0].y.toFixed(3)}`);
        const zb = zByKey.get(`${path[1].x.toFixed(3)},${path[1].y.toFixed(3)}`);
        if (Number.isFinite(za) && Number.isFinite(zb)) path.meta.depth = (za + zb) / 2;
      }
    });
    return paths;
  };

  // #5 — Lambert-shaded hatching, one pass per FRONT face. Spacing is raised and
  // the face count capped during a fast preview to keep live drags responsive.
  const buildHatching = (mesh, p, bounds, preview) => {
    const projectedVerts = mesh.vertices.map((pt) => project3(pt, p, bounds));
    const light = resolveLight(p);
    const baseSpacing = Math.max(1, finite(p.hatchSpacing, 6) * (preview ? 2 : 1));
    const angleDeg = finite(p.hatchAngle, 45);
    const crossHatch = p.crossHatch === true;
    const maxFaces = preview ? G3.previewCap(bounds, 600) : 4000;
    const paths = [];
    let faceCount = 0;
    for (let i = 0; i < mesh.faces.length; i++) {
      if (faceCount >= maxFaces) break;
      const face = mesh.faces[i];
      const rotated = face.map((idx) => projectedVerts[idx].rotated);
      const normal = faceNormal(rotated);
      if (normal.z < -0.001) continue; // hatch only front faces
      const polygon = face.map((idx) => {
        const pr = projectedVerts[idx].projected;
        return { x: pr.x, y: pr.y };
      });
      if (polygon.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) continue;
      const segments = lambertHatch(normal, light, polygon, { baseSpacing, angleDeg, crossHatch });
      segments.forEach((seg) => {
        seg.meta = { ...(seg.meta || {}), algorithm: 'meshTopography' };
        paths.push(seg);
      });
      faceCount++;
    }
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

      // Resolve the opt-in 3D enhancement toggles (all default OFF → legacy path).
      const depthCueOn = (p.depthCue || 'off') !== 'off';
      const occludeOn = hiddenLineActive(p);
      const flags = { depthCue: depthCueOn, occlude: occludeOn };

      let paths = [];
      const mode = p.renderMode || 'contours';
      if (mode === 'wireframe' || mode === 'triangleMesh') paths = buildWireframe(mesh, p, bounds, flags);
      else paths = buildContours(mesh, p, bounds, flags);

      // #4 hidden-line: occlude the (straight, depth-carrying) wireframe/contour
      // segments against the front-facing screen polygons. 'dash' marks hidden
      // runs; anything else ('remove') drops them.
      if (occludeOn) {
        const occCap = preview ? G3.previewCap(bounds, 1200) : 0;
        const occluders = buildOccluders(mesh, mesh.vertices.map((pt) => project3(pt, p, bounds)), bounds, occCap);
        const occMode = (p.hiddenLineMode === 'dash') ? 'dash' : 'remove';
        paths = occludePaths(paths, occluders, occMode, finite(p.depthBias, 0.5));
      }

      paths.push(...buildSilhouette(mesh, p, bounds, flags));

      // #3 creases — feature edges sharper than creaseAngle.
      if (p.showCreases === true) paths.push(...buildCreases(mesh, p, bounds, flags));

      // #5 hatching — Lambert tonal fill on front faces.
      if (p.hatchEnable === true) paths.push(...buildHatching(mesh, p, bounds, preview));

      // #2 depth cue — stamp dash density by per-path camera depth (no-op when off,
      // skips hidden-line paths). Runs once, just before the final cleanup.
      applyDepthCue(paths, p);

      return cleanPaths(paths);
    },
    formula: () => 'Primitive mesh sliced by depth planes or drawn as a projected wireframe.',
  };
})();
