/**
 * STL mesh parser for the 3D algorithm suite (topoform, polyhedron).
 *
 * Parses both binary and ASCII .stl files into a compact, JSON-serialisable
 * { vertices:[{x,y,z}], faces:[[i,j,k]], name, triangles } mesh. Vertices are
 * welded (deduplicated) so the shared edge/contour machinery in geometry3d.js
 * (collectEdges, plane slicing, silhouette) sees a real connected mesh rather
 * than 3 unshared verts per triangle. The mesh is normalised into a centred
 * unit-ish box ([-1,1] on its longest axis) so a layer's existing Scale X/Y/Z
 * sliders size it exactly like a built-in primitive.
 *
 * Large meshes are uniformly down-sampled to MAX_FACES so they stay light
 * enough to live in layer.params (and therefore undo history / .vectura files)
 * and render at interactive speed.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const MAX_FACES = 12000;

  const isBinary = (buffer) => {
    if (buffer.byteLength < 84) return false;
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    // Exact size match is the definitive binary signature (an ASCII file whose
    // header happens to start with "solid" can't also satisfy this).
    return buffer.byteLength === 84 + triCount * 50;
  };

  const makeWelder = () => {
    const vertices = [];
    const map = new Map();
    const add = (x, y, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return -1;
      const key = `${x.toFixed(4)}|${y.toFixed(4)}|${z.toFixed(4)}`;
      let idx = map.get(key);
      if (idx === undefined) {
        idx = vertices.length;
        vertices.push({ x, y, z });
        map.set(key, idx);
      }
      return idx;
    };
    return { vertices, add };
  };

  const parseBinary = (buffer) => {
    const view = new DataView(buffer);
    const triCount = view.getUint32(80, true);
    const { vertices, add } = makeWelder();
    const faces = [];
    let offset = 84;
    for (let i = 0; i < triCount; i++) {
      offset += 12; // skip facet normal
      const a = add(view.getFloat32(offset, true), view.getFloat32(offset + 4, true), view.getFloat32(offset + 8, true));
      const b = add(view.getFloat32(offset + 12, true), view.getFloat32(offset + 16, true), view.getFloat32(offset + 20, true));
      const c = add(view.getFloat32(offset + 24, true), view.getFloat32(offset + 28, true), view.getFloat32(offset + 32, true));
      offset += 38; // 3 verts (36) + attribute byte count (2)
      if (a >= 0 && b >= 0 && c >= 0 && a !== b && b !== c && a !== c) faces.push([a, b, c]);
    }
    return { vertices, faces };
  };

  const parseAscii = (text) => {
    const { vertices, add } = makeWelder();
    const faces = [];
    const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    const verts = [];
    let m;
    while ((m = re.exec(text))) verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
    for (let i = 0; i + 2 < verts.length; i += 3) {
      const a = add(verts[i][0], verts[i][1], verts[i][2]);
      const b = add(verts[i + 1][0], verts[i + 1][1], verts[i + 1][2]);
      const c = add(verts[i + 2][0], verts[i + 2][1], verts[i + 2][2]);
      if (a >= 0 && b >= 0 && c >= 0 && a !== b && b !== c && a !== c) faces.push([a, b, c]);
    }
    const nameMatch = /^\s*solid\s+([^\r\n]*)/.exec(text);
    return { vertices, faces, name: (nameMatch && nameMatch[1].trim()) || '' };
  };

  // Centre on the bounding-box midpoint and scale so the longest axis spans
  // [-1, 1]. Returns a NEW vertex array; faces are unchanged.
  const normalize = (vertices) => {
    if (!vertices.length) return vertices;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    vertices.forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
    const k = 2 / extent;
    return vertices.map((p) => ({
      x: Math.round((p.x - cx) * k * 10000) / 10000,
      y: Math.round((p.y - cy) * k * 10000) / 10000,
      z: Math.round((p.z - cz) * k * 10000) / 10000,
    }));
  };

  // Uniformly drop faces until at most MAX_FACES remain, then prune orphan
  // vertices and re-index so the stored mesh stays compact.
  const downsample = (mesh) => {
    if (mesh.faces.length <= MAX_FACES) return mesh;
    const stride = mesh.faces.length / MAX_FACES;
    const kept = [];
    for (let i = 0; i < mesh.faces.length; i += stride) kept.push(mesh.faces[Math.floor(i)]);
    if (kept.length > MAX_FACES) kept.length = MAX_FACES; // hold the documented ≤ MAX_FACES bound
    const remap = new Map();
    const vertices = [];
    const faces = kept.map((face) => face.map((idx) => {
      let next = remap.get(idx);
      if (next === undefined) {
        next = vertices.length;
        vertices.push(mesh.vertices[idx]);
        remap.set(idx, next);
      }
      return next;
    }));
    return { vertices, faces };
  };

  // Copy any ArrayBuffer / typed-array input (which may originate in another
  // realm — FileReader in the browser, the test sandbox under jsdom) into a
  // fresh local ArrayBuffer, so DataView/instanceof are realm-safe.
  const toLocalBuffer = (data) => {
    const src = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : (data && typeof data.byteLength === 'number' ? new Uint8Array(data) : null);
    if (!src) return null;
    const local = new ArrayBuffer(src.byteLength);
    new Uint8Array(local).set(src);
    return local;
  };

  const parse = (data, fileName = '') => {
    let mesh;
    if (typeof data === 'string') {
      mesh = parseAscii(data);
    } else {
      const buffer = toLocalBuffer(data);
      if (!buffer) throw new Error('STL parse: unsupported input');
      if (isBinary(buffer)) {
        mesh = parseBinary(buffer);
      } else {
        // Fall back to ASCII via a UTF-8 decode of the same bytes.
        const text = new TextDecoder('utf-8').decode(new Uint8Array(buffer));
        mesh = parseAscii(text);
      }
    }
    if (!mesh.vertices.length || !mesh.faces.length) {
      throw new Error('STL parse: no triangles found');
    }
    mesh = downsample(mesh);
    return {
      vertices: normalize(mesh.vertices),
      faces: mesh.faces,
      triangles: mesh.faces.length,
      name: mesh.name || fileName.replace(/\.stl$/i, '') || 'mesh',
    };
  };

  Vectura.StlParser = { parse, MAX_FACES };
})();
