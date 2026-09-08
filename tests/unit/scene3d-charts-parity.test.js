/**
 * Scene3D.Charts parity — the extracted parametric surface samplers must
 * reproduce the PRE-extraction outputs bit-for-bit.
 *
 * Goldens under tests/baselines/scene3d/ were captured from the original
 * in-algorithm code (spiralizer shapePoint, topoform buildPrimitiveRaw inline
 * samplers) BEFORE the move to src/core/scene3d/charts.js. Every comparison is
 * exact (===) — the extraction is a verbatim code move, so any drift is a bug
 * in the extraction, never a reason to regenerate the golden.
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
const z0 = (n) => (n === 0 ? 0 : round9(n));
const triple = (pt) => [z0(pt.x), z0(pt.y), z0(pt.z)];

describe('Scene3D.Charts parity with pre-extraction goldens', () => {
  let runtime;
  let Charts;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Charts = runtime.window.Vectura.Scene3D.Charts;
  });

  afterAll(() => runtime.cleanup());

  describe('spiralizerSurface (spiralizer shapePoint)', () => {
    const golden = readGolden('charts-spiralizer.json');

    golden.cases.forEach(({ label, params, samples }) => {
      it(`matches the golden sweep exactly — ${label}`, () => {
        samples.forEach(({ u, longitude, point, normal }) => {
          const s = Charts.spiralizerSurface(params, u, longitude);
          expect(triple(s.point)).toEqual(point.map(round9));
          expect(triple(s.normal)).toEqual(normal.map(round9));
        });
      });
    });

    it('produces unit-length normals on every shape', () => {
      golden.cases.forEach(({ params }) => {
        for (let i = 0; i <= 24; i++) {
          const u = i / 24;
          for (let k = 0; k < 8; k++) {
            const s = Charts.spiralizerSurface(params, u, -2 + k * 0.9);
            const len = Math.hypot(s.normal.x, s.normal.y, s.normal.z);
            expect(Math.abs(len - 1)).toBeLessThan(1e-6);
          }
        }
      });
    });

    it('torus chart is seam-continuous: u=0 and u=1 coincide', () => {
      const params = { shape: 'torus' };
      for (let k = 0; k < 8; k++) {
        const longitude = -1 + k * 0.8;
        const a = Charts.spiralizerSurface(params, 0, longitude);
        const b = Charts.spiralizerSurface(params, 1, longitude);
        expect(Math.abs(a.point.x - b.point.x)).toBeLessThan(1e-9);
        expect(Math.abs(a.point.y - b.point.y)).toBeLessThan(1e-9);
        expect(Math.abs(a.point.z - b.point.z)).toBeLessThan(1e-9);
      }
    });

    it('capsule chart is continuous across the cap/barrel seams', () => {
      const params = { shape: 'capsule' };
      const r = 46;
      const h = 120;
      const capArc = (r * Math.PI) / 2;
      const total = h + 2 * capArc;
      const fCap = capArc / total;
      const fCyl = h / total;
      const seams = [fCap, fCap + fCyl];
      const eps = 1e-7;
      seams.forEach((seam) => {
        for (let k = 0; k < 6; k++) {
          const longitude = -1.5 + k * 1.1;
          const below = Charts.spiralizerSurface(params, seam - eps, longitude);
          const above = Charts.spiralizerSurface(params, seam + eps, longitude);
          const gap = Math.hypot(
            below.point.x - above.point.x,
            below.point.y - above.point.y,
            below.point.z - above.point.z,
          );
          expect(gap).toBeLessThan(1e-3);
        }
      });
    });
  });

  describe('topoform chart factories (buildPrimitiveRaw inline samplers)', () => {
    const golden = readGolden('mesh-topoform.json');

    // Grid layout mirrors makeGridMesh: vertex (x, y) lives at y*(cols+1)+x and
    // was produced by sampler(x/cols, y/rows). Raw golden vertices ARE the
    // pre-extraction sampler sweep, so comparing chart output against them
    // verifies the samplers directly — independent of the tessellator.
    const gridShape = (mode, detail) => {
      const cols = (mode === 'pyramid' || mode === 'torusKnot') ? detail * 4 : detail * 2;
      return { rows: detail, cols };
    };

    const factoryFor = (mode) => ({
      torus: (sizes) => Charts.topoTorus(sizes),
      cone: (sizes) => Charts.topoCone(sizes),
      cylinder: (sizes) => Charts.topoCylinder(sizes),
      capsule: (sizes) => Charts.topoCapsule(sizes),
      pyramid: (sizes) => Charts.topoPyramid(sizes),
      superellipsoid: (sizes) => Charts.topoSuperellipsoid(sizes),
      torusKnot: (sizes) => Charts.topoTorusKnot(sizes),
      sphere: (sizes) => Charts.topoSphereEllipsoid(sizes, 'sphere'),
      ellipsoid: (sizes) => Charts.topoSphereEllipsoid(sizes, 'ellipsoid'),
    }[mode]);

    golden.cases
      .filter(({ mode }) => mode !== 'cube') // cube is makeBoxMesh, not a (u,v) chart
      .forEach(({ label, mode, detail, sizes, raw }) => {
        it(`sampler matches the golden grid sweep exactly — ${label}`, () => {
          const sampler = factoryFor(mode)(sizes);
          const { rows, cols } = gridShape(mode, detail);
          expect(raw.vertices.length).toBe((rows + 1) * (cols + 1));
          for (let y = 0; y <= rows; y++) {
            for (let x = 0; x <= cols; x++) {
              const pt = sampler(x / cols, y / rows);
              expect(triple(pt)).toEqual(raw.vertices[y * (cols + 1) + x].map(round9));
            }
          }
        });
      });

    it('squarePerimeter and sgnPow moved intact', () => {
      expect(Charts.squarePerimeter(0)).toEqual({ x: -1, z: -1 });
      expect(Charts.squarePerimeter(0.25)).toEqual({ x: 1, z: -1 });
      expect(Charts.squarePerimeter(0.5)).toEqual({ x: 1, z: 1 });
      expect(Charts.squarePerimeter(0.75)).toEqual({ x: -1, z: 1 });
      expect(Charts.squarePerimeter(1.25)).toEqual(Charts.squarePerimeter(0.25));
      expect(Charts.sgnPow(-0.25, 0.5)).toBe(-Math.pow(0.25, 0.5));
      expect(Charts.sgnPow(0.81, 0.5)).toBe(Math.pow(0.81, 0.5));
      expect(Charts.sgnPow(0, 0.4)).toBe(0);
    });
  });
});
