const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

const bounds = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

// A unit tetrahedron: 4 corner vertices, 4 triangular faces.
const TET = [
  [1, 1, 1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, -1, -1],
];
const TET_FACES = [
  [TET[0], TET[1], TET[2]],
  [TET[0], TET[3], TET[1]],
  [TET[0], TET[2], TET[3]],
  [TET[1], TET[3], TET[2]],
];

const buildBinaryStl = (triangles) => {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  let o = 84;
  triangles.forEach((tri) => {
    o += 12; // facet normal (left zero)
    tri.forEach((vtx) => {
      view.setFloat32(o, vtx[0], true);
      view.setFloat32(o + 4, vtx[1], true);
      view.setFloat32(o + 8, vtx[2], true);
      o += 12;
    });
    o += 2; // attribute byte count
  });
  return buffer;
};

const buildAsciiStl = (triangles, name = 'tet') => {
  let s = `solid ${name}\n`;
  triangles.forEach((tri) => {
    s += '  facet normal 0 0 0\n    outer loop\n';
    tri.forEach((vtx) => { s += `      vertex ${vtx[0]} ${vtx[1]} ${vtx[2]}\n`; });
    s += '    endloop\n  endfacet\n';
  });
  s += `endsolid ${name}\n`;
  return s;
};

const finitePaths = (paths) =>
  Array.isArray(paths) && paths.length > 0 &&
  paths.every((path) => Array.isArray(path) && path.length >= 2 &&
    path.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y)));

describe('STL import', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const generate = (type, overrides = {}) => {
    const params = {
      ...clone(V.ALGO_DEFAULTS[type]),
      ...overrides,
      seed: 7, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, simplify: 0,
    };
    return V.Algorithms[type].generate(params, new V.SeededRNG(7), new V.SimpleNoise(7), bounds) || [];
  };

  test('parses a binary STL into a welded, normalized mesh', () => {
    const mesh = V.StlParser.parse(buildBinaryStl(TET_FACES), 'tetra.stl');
    expect(mesh.vertices.length).toBe(4); // 12 raw corners welded to 4 unique
    expect(mesh.faces.length).toBe(4);
    expect(mesh.name).toBe('tetra');
    expect(mesh.triangles).toBe(4);
    // Normalized: every coordinate within the centred unit box.
    mesh.vertices.forEach((v) => {
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(v.z)).toBeLessThanOrEqual(1.0001);
    });
    // Faces reference valid vertex indices.
    mesh.faces.forEach((f) => f.forEach((idx) => expect(idx).toBeLessThan(mesh.vertices.length)));
  });

  test('parses an ASCII STL equivalently', () => {
    const mesh = V.StlParser.parse(buildAsciiStl(TET_FACES), 'tetra.stl');
    expect(mesh.vertices.length).toBe(4);
    expect(mesh.faces.length).toBe(4);
  });

  test('rejects an STL with no triangles', () => {
    expect(() => V.StlParser.parse('solid empty\nendsolid empty\n')).toThrow();
  });

  /*
   * ── Face budget (2026-08-07) ────────────────────────────────────────────────
   * `downsample` is now the SHARED reducer for both import paths (STL and OBJ,
   * through VectorEngine.buildImportedMeshParams). It reduces by vertex
   * clustering, which keeps the surface CONNECTED — the previous keep-every-Nth
   * -face reducer left the budget's worth of disconnected triangles, where every
   * edge is a boundary edge: a 25,280-face sphere reduced to 12,000 took
   * 131,033 ms to compose, versus 1,759 ms for the clustered result.
   */
  const uvSphereMesh = (segments, rings) => {
    const P = (u, v) => {
      const th = u * Math.PI * 2;
      const ph = v * Math.PI;
      return { x: Math.sin(ph) * Math.cos(th), y: Math.cos(ph), z: Math.sin(ph) * Math.sin(th) };
    };
    const key = (p) => `${p.x.toFixed(5)}|${p.y.toFixed(5)}|${p.z.toFixed(5)}`;
    const map = new Map();
    const vertices = [];
    const idx = (p) => {
      const k = key(p);
      if (!map.has(k)) { map.set(k, vertices.length); vertices.push(p); }
      return map.get(k);
    };
    const faces = [];
    for (let i = 0; i < segments; i += 1) {
      for (let j = 0; j < rings; j += 1) {
        const a = idx(P(i / segments, j / rings));
        const b = idx(P((i + 1) / segments, j / rings));
        const c = idx(P((i + 1) / segments, (j + 1) / rings));
        const d = idx(P(i / segments, (j + 1) / rings));
        if (a !== b && b !== c && a !== c) faces.push([a, b, c]);
        if (a !== c && c !== d && a !== d) faces.push([a, c, d]);
      }
    }
    return { vertices, faces };
  };

  // Adjacency ratio: shared edges / total edges. A connected closed surface is
  // near 1.0; a shredded soup of disconnected triangles is 0.
  const sharedEdgeRatio = (mesh) => {
    const counts = new Map();
    mesh.faces.forEach((f) => {
      for (let i = 0; i < 3; i += 1) {
        const a = f[i];
        const b = f[(i + 1) % 3];
        const k = a < b ? `${a}|${b}` : `${b}|${a}`;
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    });
    let shared = 0;
    counts.forEach((n) => { if (n > 1) shared += 1; });
    return shared / counts.size;
  };

  test('downsample leaves a mesh already within budget untouched', () => {
    const mesh = uvSphereMesh(8, 4);
    expect(mesh.faces.length).toBeLessThan(V.StlParser.MAX_FACES);
    expect(V.StlParser.downsample(mesh)).toBe(mesh); // same object, no copy
  });

  test('downsample reduces an over-budget mesh and keeps it CONNECTED', () => {
    const mesh = uvSphereMesh(160, 80); // ~25,280 faces, welded + connected
    expect(mesh.faces.length).toBeGreaterThan(V.StlParser.MAX_FACES);
    const before = sharedEdgeRatio(mesh);
    expect(before).toBeGreaterThan(0.95);

    const out = V.StlParser.downsample(mesh);
    expect(out.faces.length).toBeLessThanOrEqual(V.StlParser.MAX_FACES);
    expect(out.faces.length).toBeGreaterThan(0);
    // The reduced mesh is still a connected surface, not triangle confetti.
    expect(sharedEdgeRatio(out)).toBeGreaterThan(0.95);
    // Fewer vertices than faces-times-three proves vertices are shared.
    expect(out.vertices.length).toBeLessThan(out.faces.length * 3);
    // Indices are valid and re-based; no orphan vertices are carried along.
    const used = new Set();
    out.faces.forEach((f) => f.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(out.vertices.length);
      used.add(i);
    }));
    expect(used.size).toBe(out.vertices.length);
    // No degenerate triangles survive the collapse.
    out.faces.forEach((f) => {
      expect(f[0]).not.toBe(f[1]);
      expect(f[1]).not.toBe(f[2]);
      expect(f[0]).not.toBe(f[2]);
    });
  });

  test('downsample honours an explicit smaller budget', () => {
    const mesh = uvSphereMesh(80, 40); // ~6,240 faces
    const out = V.StlParser.downsample(mesh, 500);
    expect(out.faces.length).toBeLessThanOrEqual(500);
    expect(out.faces.length).toBeGreaterThan(0);
  });

  test('topoform renders an imported STL mesh', () => {
    const mesh = V.StlParser.parse(buildBinaryStl(TET_FACES), 'tetra.stl');
    const wire = generate('topoform', { sourceMode: 'stlMesh', importedMesh: mesh, renderMode: 'wireframe' });
    expect(finitePaths(wire)).toBe(true);
    // An empty/absent mesh yields nothing rather than throwing.
    const empty = generate('topoform', { sourceMode: 'stlMesh', importedMesh: null });
    expect(Array.isArray(empty)).toBe(true);
    expect(empty.length).toBe(0);
  });

  test('polyhedron renders an imported STL mesh', () => {
    const mesh = V.StlParser.parse(buildBinaryStl(TET_FACES), 'tetra.stl');
    const solid = generate('polyhedron', { solidType: 'importedMesh', importedMesh: mesh, showEdges: true, showFaces: false, showVertices: false });
    expect(finitePaths(solid)).toBe(true);
  });

  test('imported mesh survives param sanitization on import', () => {
    const mesh = V.StlParser.parse(buildBinaryStl(TET_FACES), 'tetra.stl');
    const engine = new V.VectorEngine();
    engine.layers = [];
    const id = engine.addLayer('topoform');
    const layer = engine.layers.find((l) => l.id === id);
    layer.params.sourceMode = 'stlMesh';
    layer.params.importedMesh = mesh;
    layer.params.meshName = 'tetra';
    const exported = engine.exportState();
    const engine2 = new V.VectorEngine();
    engine2.importState(exported);
    const restored = engine2.layers.find((l) => l.params.meshName === 'tetra');
    expect(restored).toBeTruthy();
    expect(restored.params.importedMesh.vertices.length).toBe(4);
    expect(restored.params.importedMesh.faces.length).toBe(4);
  });
});
