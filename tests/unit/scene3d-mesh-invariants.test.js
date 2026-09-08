/**
 * Scene3D.Mesh invariants + parity — the extracted tessellators and solid
 * generators must reproduce the PRE-extraction meshes bit-for-bit, and the
 * built meshes must satisfy structural invariants (watertightness, weld
 * de-fan, geodesic vertex-count formula).
 *
 * Goldens under tests/baselines/scene3d/ were captured from the original
 * in-algorithm code (topoform createPrimitiveMesh, polyhedron createSolidMesh)
 * BEFORE the move to src/core/scene3d/mesh.js. Comparisons are exact — never
 * regenerate the goldens to make a drift pass.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const readGolden = (name) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../baselines/scene3d', name), 'utf8'));

// JSON serialization canonicalizes -0 to 0, so mirror that on the computed side
// (Object.is-based toEqual would otherwise flag -0 vs 0 — a distinction the SVG
// pipeline cannot observe). All other values must match to 9dp — tight enough
// to catch any real extraction bug, loose enough to absorb the last-ULP
// arm64/x86_64 trig/matrix rounding drift the goldens (captured on arm64)
// otherwise baked in as a platform-specific "bug".
const R9 = 1e9;
const round9 = (n) => Math.round(n * R9) / R9;
const roundTriples = (triples) => triples.map((t) => t.map(round9));
const z0 = (n) => (n === 0 ? 0 : round9(n));
const toTriples = (vertices) => vertices.map((pt) => [z0(pt.x), z0(pt.y), z0(pt.z)]);

describe('Scene3D.Mesh parity + invariants', () => {
  let runtime;
  let Vectura;
  let Mesh;
  let G3;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Vectura = runtime.window.Vectura;
    Mesh = Vectura.Scene3D.Mesh;
    G3 = Vectura.Geometry3D;
  });

  afterAll(() => runtime.cleanup());

  // Closed surface: every undirected edge is shared by exactly two faces.
  const assertWatertight = (mesh) => {
    const edges = G3.collectEdges(mesh.faces);
    expect(edges.length).toBeGreaterThan(0);
    edges.forEach((edge) => {
      expect(edge.faces.length).toBe(2);
    });
  };

  describe('topoform primitives (createTopoformMesh)', () => {
    const golden = readGolden('mesh-topoform.json');

    golden.cases.forEach(({ label, mode, detail, sizes, raw, welded }) => {
      it(`matches the pre-extraction mesh exactly — ${label}`, () => {
        const rawMesh = Mesh.buildTopoformPrimitive(mode, sizes, detail);
        expect(toTriples(rawMesh.vertices)).toEqual(roundTriples(raw.vertices));
        expect(rawMesh.faces).toEqual(raw.faces);
        const weldedMesh = Mesh.createTopoformMesh(mode, sizes, detail);
        expect(toTriples(weldedMesh.vertices)).toEqual(roundTriples(welded.vertices));
        expect(weldedMesh.faces).toEqual(welded.faces);
      });
    });

    it('weldMesh de-fans UV poles: shared pole vertex, no degenerate faces', () => {
      const sizes = { sx: 63, sy: 63, sz: 63 };
      const raw = Mesh.buildTopoformPrimitive('sphere', sizes, 8);
      const welded = Mesh.createTopoformMesh('sphere', sizes, 8);
      // The pole rows (17 coincident vertices each) and the seam column collapse.
      expect(welded.vertices.length).toBeLessThan(raw.vertices.length);
      // Zero-area pole slivers are dropped: no face keeps a repeated index.
      welded.faces.forEach((face) => {
        expect(new Set(face).size).toBe(face.length);
      });
      // The weld must leave the sphere closed.
      assertWatertight(welded);
    });

    it('closed welded primitives are watertight', () => {
      const sizes = { sx: 63, sy: 63, sz: 63 };
      ['sphere', 'ellipsoid', 'torus', 'capsule', 'superellipsoid', 'torusKnot', 'cube'].forEach((mode) => {
        assertWatertight(Mesh.createTopoformMesh(mode, sizes, 8));
      });
    });
  });

  describe('polyhedron solids (createSolidMesh)', () => {
    const golden = readGolden('mesh-polyhedron.json');

    // The buckyball is the ONE deliberate departure from the pre-extraction
    // capture. Those goldens were taken while scaleMeshToRadius divided by a
    // Math.max(1, …)-floored circumradius, which clamped the divide away for the
    // truncated icosahedron (the only construction whose pre-scale circumradius
    // is below 1) and built it at 0.8685 · Radius. The golden is NOT regenerated
    // — it still pins every vertex — but the buckyball cases now assert the
    // built mesh is exactly the golden scaled by 1/factor, which keeps the
    // historical parity AND pins the size correction. See
    // scene3d-buckyball-radius-migration.test.js.
    const isBuckyball = (params) => !params.solidType || params.solidType === 'buckyball';

    golden.cases.forEach(({ label, params, mesh }) => {
      it(`matches the pre-extraction mesh exactly — ${label}`, () => {
        const built = Mesh.createSolidMesh(params);
        expect(built.faces).toEqual(mesh.faces);
        if (isBuckyball(params)) {
          const k = 1 / Mesh.legacyTruncatedIcosahedronScale();
          const got = toTriples(built.vertices);
          expect(got.length).toBe(mesh.vertices.length);
          got.forEach((triple, i) => {
            triple.forEach((component, axis) => {
              expect(component).toBeCloseTo(mesh.vertices[i][axis] * k, 9);
            });
          });
          if (mesh.bounds) {
            expect(built.bounds.maxRadius).toBeCloseTo(mesh.bounds.maxRadius * k, 9);
          }
          return;
        }
        expect(toTriples(built.vertices)).toEqual(roundTriples(mesh.vertices));
        if (mesh.bounds) {
          expect(built.bounds.maxRadius).toBe(mesh.bounds.maxRadius);
          expect(built.bounds.maxDepth).toBe(mesh.bounds.maxDepth);
        }
      });
    });

    it('closed solids are watertight', () => {
      const closedTypes = ['buckyball', 'prism', 'antiprism', 'bipyramid', 'cone', 'frustum',
        'cupola', 'starPrism', 'tetrahedron', 'cube', 'octahedron', 'dodecahedron',
        'icosahedron', 'geodesic', 'goldberg'];
      closedTypes.forEach((solidType) => {
        assertWatertight(Mesh.createSolidMesh({ solidType }));
      });
    });

    it('geodesic sphere follows the class-I vertex/face count formulas', () => {
      const ladder = golden.geodesicLadder;
      expect(ladder.length).toBeGreaterThan(0);
      ladder.forEach(({ frequency, vertexCount, faceCount }) => {
        const mesh = Mesh.createGeodesicMesh(76, frequency);
        // V = 10f^2 + 2, F = 20f^2 for a class-I geodesic icosahedron.
        expect(mesh.vertices.length).toBe(10 * frequency * frequency + 2);
        expect(mesh.faces.length).toBe(20 * frequency * frequency);
        // And byte-parity with the pre-extraction counts.
        expect(mesh.vertices.length).toBe(vertexCount);
        expect(mesh.faces.length).toBe(faceCount);
      });
    });

    it('goldberg dual keeps 12 pentagons among hexagons', () => {
      const mesh = Mesh.createSolidMesh({ solidType: 'goldberg', frequency: 3 });
      const pentagons = mesh.faces.filter((face) => face.length === 5).length;
      const hexagons = mesh.faces.filter((face) => face.length === 6).length;
      expect(pentagons).toBe(12);
      expect(hexagons).toBe(mesh.faces.length - 12);
    });
  });

  describe('algorithm rewiring keep-alives', () => {
    it('topoform __captureMesh hook still observes the post-weld mesh', () => {
      const { AlgorithmRegistry, SeededRNG, SimpleNoise } = Vectura;
      Vectura.__captureMesh = true;
      try {
        AlgorithmRegistry.topoform.generate(
          { sourceMode: 'sphere', primitiveDetail: 12 },
          new SeededRNG(0),
          new SimpleNoise(0),
          { width: 400, height: 400 },
        );
        const captured = Vectura.__lastMesh;
        expect(captured).toBeTruthy();
        // The hook sees the WELDED mesh, identical to Mesh.createTopoformMesh
        // with topoform's resolved defaults (scale 63, detail 12).
        const expected = Mesh.createTopoformMesh('sphere', { sx: 63, sy: 63, sz: 63 }, 12);
        expect(toTriples(captured.vertices)).toEqual(toTriples(expected.vertices));
        expect(captured.faces).toEqual(expected.faces);
      } finally {
        delete Vectura.__captureMesh;
        delete Vectura.__lastMesh;
      }
    });

    it('spiralizer shapePoint is the shared Charts sampler', () => {
      const Charts = Vectura.Scene3D.Charts;
      const paths = Vectura.AlgorithmRegistry.spiralizer.generate(
        { shape: 'sphere', curveResolution: 120 },
        null,
        null,
        { width: 400, height: 400 },
      );
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
      // Charts is loaded and produces the sphere the algorithm wrapped.
      const s = Charts.spiralizerSurface({ shape: 'sphere' }, 0.5, 0);
      expect(s.point.y).toBe(0);
    });

    it('polyhedron generate() consumes Mesh.createSolidMesh (default buckyball renders)', () => {
      const paths = Vectura.AlgorithmRegistry.polyhedron.generate(
        {},
        null,
        null,
        { width: 400, height: 400 },
      );
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
    });
  });
});
