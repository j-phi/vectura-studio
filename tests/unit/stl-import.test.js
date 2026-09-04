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

  /*
   * ── Reducer defects (2026-08-07 adversarial review of the clustering rewrite)
   * The rewrite is the right call — it keeps the surface connected, which is
   * what makes plottable contours — but as landed it:
   *   1. stepped the grid ×0.8 down from a fixed start and stopped at the FIRST
   *      fit, so it threw away most of the budget (36.7% used on a 40:1 rod);
   *   2. sized every cell from the LONGEST axis, so a slender mesh's short-axis
   *      detail collapsed (a 40:1 rod: 240 distinct angles around its mid
   *      cross-section down to 20 — a lumpy polygon viewed down its own axis);
   *   3. left triangles INVERTED where clustering moved vertices past each
   *      other, flipping their normals against the source surface;
   *   4. had NO lower bound, so a mutant reducer emitting 3.2% of the budget
   *      passed every assertion above.
   */

  // A closed capped cylinder along X. `len` is the length:radius aspect ratio.
  const rodMesh = (segs, rings, len, rad = 1) => {
    const map = new Map();
    const vertices = [];
    const idx = (p) => {
      const q = (val) => (Math.abs(val) < 1e-9 ? 0 : val).toFixed(6);
      const k = `${q(p.x)}|${q(p.y)}|${q(p.z)}`;
      if (!map.has(k)) { map.set(k, vertices.length); vertices.push(p); }
      return map.get(k);
    };
    const P = (i, j) => {
      const th = (j / segs) * Math.PI * 2;
      return { x: -len / 2 + (i / rings) * len, y: rad * Math.cos(th), z: rad * Math.sin(th) };
    };
    const faces = [];
    for (let i = 0; i < rings; i += 1) {
      for (let j = 0; j < segs; j += 1) {
        const a = idx(P(i, j)); const b = idx(P(i + 1, j));
        const c = idx(P(i + 1, j + 1)); const d = idx(P(i, j + 1));
        if (a !== b && b !== c) faces.push([a, b, c]);
        if (a !== c && c !== d) faces.push([a, c, d]);
      }
    }
    const c0 = idx({ x: -len / 2, y: 0, z: 0 });
    const c1 = idx({ x: len / 2, y: 0, z: 0 });
    for (let j = 0; j < segs; j += 1) {
      faces.push([c0, idx(P(0, j)), idx(P(0, j + 1))]);
      faces.push([c1, idx(P(rings, j + 1)), idx(P(rings, j))]);
    }
    return { vertices, faces };
  };

  // Distinct 1°-bucketed vertex directions around the mid cross-section, about
  // the long (X) axis. This is what makes a rod read as a circle rather than a
  // polygon when it is viewed end-on.
  const midSectionAngles = (mesh) => {
    let minX = Infinity; let maxX = -Infinity;
    mesh.vertices.forEach((p) => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; });
    const mid = (minX + maxX) / 2;
    const half = (maxX - minX) * 0.06;
    const seen = new Set();
    mesh.vertices.forEach((p) => {
      if (Math.abs(p.x - mid) > half) return;
      if (Math.hypot(p.y, p.z) < 1e-9) return;
      seen.add(Math.round((Math.atan2(p.z, p.y) * 180) / Math.PI));
    });
    return seen.size;
  };

  // Faces whose normal points INTO the mesh. On a star-shaped closed surface
  // (a UV sphere) every consistently wound face points outward, so this is the
  // inverted-triangle count.
  const inwardFaceCount = (mesh) => {
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    let minZ = Infinity; let maxZ = -Infinity;
    mesh.vertices.forEach((p) => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    });
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2; const cz = (minZ + maxZ) / 2;
    let bad = 0;
    mesh.faces.forEach((f) => {
      const p = mesh.vertices[f[0]]; const q = mesh.vertices[f[1]]; const r = mesh.vertices[f[2]];
      const ux = q.x - p.x; const uy = q.y - p.y; const uz = q.z - p.z;
      const vx = r.x - p.x; const vy = r.y - p.y; const vz = r.z - p.z;
      const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
      const gx = (p.x + q.x + r.x) / 3 - cx;
      const gy = (p.y + q.y + r.y) / 3 - cy;
      const gz = (p.z + q.z + r.z) / 3 - cz;
      if (nx * gx + ny * gy + nz * gz < 0) bad += 1;
    });
    return bad;
  };

  // #4 — the LOWER bound. Without this a reducer may emit any tiny fraction of
  // the budget and still satisfy every "≤ budget / still connected" assertion.
  test('downsample spends most of the face budget it is given', () => {
    const MAX = V.StlParser.MAX_FACES;
    const FILL = V.StlParser.MIN_BUDGET_FILL;
    expect(FILL).toBeGreaterThan(0);
    const floor = MAX * FILL;
    // Isotropic and strongly anisotropic sources both have to land near budget.
    // BEFORE the binary search the 40:1 rod stored 4,400 faces (36.7%).
    [uvSphereMesh(160, 80), rodMesh(240, 160, 40)].forEach((mesh) => {
      expect(mesh.faces.length).toBeGreaterThan(MAX);
      const out = V.StlParser.downsample(mesh, MAX);
      expect(out.faces.length).toBeLessThanOrEqual(MAX);
      expect(out.faces.length).toBeGreaterThan(floor);
    });
  });

  // #2 — anisotropic cells. Cubic cells sized off the LONGEST axis collapse a
  // slender mesh's cross-section; per-axis cells keep it.
  test('downsample keeps short-axis resolution on a slender mesh', () => {
    const mesh = rodMesh(240, 160, 40); // 40:1 rod, 240 facets around, 77,280 tris
    const before = midSectionAngles(mesh);
    expect(before).toBeGreaterThan(200);
    const out = V.StlParser.downsample(mesh, V.StlParser.MAX_FACES);
    // BEFORE the per-axis cells this was 20 of 240 — the rod rendered as a
    // 20-gon down its own axis. Half the source resolution is the bar.
    expect(midSectionAngles(out)).toBeGreaterThan(before / 2);
  });

  // #3 — re-winding. Clustering can move a triangle's vertices past each other
  // and invert it; the reducer compares against the SOURCE normal and swaps.
  test('downsample re-winds the triangles clustering inverted', () => {
    const mesh = uvSphereMesh(200, 100); // ~39,600 faces, all outward-wound
    expect(inwardFaceCount(mesh)).toBe(0);
    const out = V.StlParser.downsample(mesh, V.StlParser.MAX_FACES);
    // BEFORE: 225 of 9,168 faces (2.45%) pointed inward. Re-winding leaves only
    // the handful whose SOURCE triangle also collapsed to a degenerate normal.
    expect(inwardFaceCount(out) / out.faces.length).toBeLessThan(0.01);
  });

  // The stride reducer is the documented last resort. It is reachable only for
  // a budget below what 8 clusters can span (≤ 56 triangles), so drive it there
  // rather than leaving it as unexercised dead code.
  test('downsample falls back to the stride reducer below the cluster floor', () => {
    const mesh = uvSphereMesh(80, 40);
    const out = V.StlParser.downsample(mesh, 8);
    expect(out.faces.length).toBeLessThanOrEqual(8);
    expect(out.faces.length).toBeGreaterThan(0);
    out.faces.forEach((f) => f.forEach((i) => {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(out.vertices.length);
    }));
  });

  // #6 — every STL import surface must be able to say the mesh was reduced.
  test('parse reports the pre-budget source triangle count', () => {
    const sphere = uvSphereMesh(120, 60); // 14,160 faces — over MAX_FACES
    const tris = sphere.faces.map((f) => f.map((i) => {
      const v = sphere.vertices[i];
      return [v.x, v.y, v.z];
    }));
    const parsed = V.StlParser.parse(buildBinaryStl(tris), 'sphere.stl');
    expect(parsed.sourceTriangles).toBeGreaterThan(V.StlParser.MAX_FACES);
    expect(parsed.triangles).toBeLessThanOrEqual(V.StlParser.MAX_FACES);
    expect(parsed.sourceTriangles).toBeGreaterThan(parsed.triangles);
    // A mesh inside the budget reports the same count both ways (no false
    // "reduced from" notice).
    const tet = V.StlParser.parse(buildBinaryStl(TET_FACES), 'tetra.stl');
    expect(tet.sourceTriangles).toBe(tet.triangles);
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
