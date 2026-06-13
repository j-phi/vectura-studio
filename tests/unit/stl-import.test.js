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

  test('meshTopography renders an imported STL mesh', () => {
    const mesh = V.StlParser.parse(buildBinaryStl(TET_FACES), 'tetra.stl');
    const wire = generate('meshTopography', { sourceMode: 'stlMesh', importedMesh: mesh, renderMode: 'wireframe' });
    expect(finitePaths(wire)).toBe(true);
    // An empty/absent mesh yields nothing rather than throwing.
    const empty = generate('meshTopography', { sourceMode: 'stlMesh', importedMesh: null });
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
    const id = engine.addLayer('meshTopography');
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
