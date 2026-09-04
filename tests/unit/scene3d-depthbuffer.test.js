const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene depth-buffer API coverage (Phase 1 stream 1A — spec F-04).
 *
 * Scene3D.Depth.build(tris) rasterizes the triangle soup ONCE into a retained
 * buffer and returns { depthAt, occlude }. Segments carry per-segment
 * { ownerId, mode, bias }; owner-aware lookup prevents self-occlusion acne.
 */

describe('Scene3D.Depth (scene depth buffer)', () => {
  let runtime;
  let Depth;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Depth = runtime.window.Vectura.Scene3D && runtime.window.Vectura.Scene3D.Depth;
  });

  afterAll(() => runtime.cleanup());

  const square = (d, owner) => ([
    { pts: [{ x: 0, y: 0, d }, { x: 100, y: 0, d }, { x: 100, y: 100, d }], owner },
    { pts: [{ x: 0, y: 0, d }, { x: 100, y: 100, d }, { x: 0, y: 100, d }], owner },
  ]);

  test('build + depthAt: inside ≈ tri depth, outside is -Infinity', () => {
    const buf = Depth.build(square(50, 'A'), { cellSize: 2 });
    expect(typeof buf.depthAt).toBe('function');
    expect(typeof buf.occlude).toBe('function');
    expect(buf.depthAt(50, 50)).toBeCloseTo(50, 5);
    expect(buf.depthAt(-40, -40)).toBe(-Infinity);
  });

  test('mode remove drops hidden runs; mode dash keeps them dashed', () => {
    const buf = Depth.build(square(50, 'A'), { cellSize: 2 });
    const seg = (mode) => [{
      a: { x: -50, y: 50, z: 0 },
      b: { x: 150, y: 50, z: 0 },
      ownerId: 'S',
      mode,
      bias: 0.5,
    }];
    const removed = buf.occlude(seg('remove'));
    expect(removed.length).toBe(2); // the two runs outside the square
    removed.forEach((path) => {
      expect(path.meta && path.meta.hiddenLine).toBeFalsy();
      path.forEach((pt) => {
        // No visible sample deep inside the square.
        expect(pt.x < 3 || pt.x > 97).toBe(true);
      });
    });
    const dashed = buf.occlude(seg('dash'));
    expect(dashed.length).toBe(3);
    const hidden = dashed.filter((path) => path.meta && path.meta.hiddenLine);
    expect(hidden.length).toBe(1);
    expect(Array.isArray(hidden[0].meta.strokeDash)).toBe(true);
  });

  test('per-segment owner prevents self-occlusion on the surface', () => {
    const buf = Depth.build(square(50, 'A'), { cellSize: 2 });
    const out = buf.occlude([{
      a: { x: 10, y: 50, z: 49.9 },
      b: { x: 90, y: 50, z: 49.9 },
      ownerId: 'A',
      mode: 'remove',
      bias: 0.5,
    }]);
    expect(out.length).toBe(1);
    const xs = out[0].map((pt) => pt.x);
    expect(Math.min(...xs)).toBeLessThan(11);
    expect(Math.max(...xs)).toBeGreaterThan(89);
  });

  test('owner exclusion still sees NEARER geometry from other owners', () => {
    // Owner A at depth 50 and owner B at depth 40 over the same square.
    const buf = Depth.build([...square(50, 'A'), ...square(40, 'B')], { cellSize: 2 });
    expect(buf.depthAt(50, 50)).toBeCloseTo(50, 5);
    // Excluding the top owner surfaces the runner-up from a different owner.
    expect(buf.depthAt(50, 50, 'A')).toBeCloseTo(40, 5);
    expect(buf.depthAt(50, 50, 'B')).toBeCloseTo(50, 5);

    // A segment owned by A at z=45: A (50) is excluded, B (40) is behind → visible.
    const ownA = buf.occlude([{
      a: { x: 10, y: 50, z: 45 }, b: { x: 90, y: 50, z: 45 },
      ownerId: 'A', mode: 'remove', bias: 0.5,
    }]);
    expect(ownA.length).toBe(1);
    // A third-party segment at z=45: A (50) hides it.
    const ownC = buf.occlude([{
      a: { x: 10, y: 50, z: 45 }, b: { x: 90, y: 50, z: 45 },
      ownerId: 'C', mode: 'remove', bias: 0.5,
    }]);
    expect(ownC.length).toBe(0);
  });

  test('no triangles → segments pass through untouched', () => {
    const buf = Depth.build([], {});
    const out = buf.occlude([{
      a: { x: 0, y: 0, z: 0 }, b: { x: 10, y: 0, z: 0 }, ownerId: 'S', mode: 'remove',
    }]);
    expect(out.length).toBe(1);
    expect(out[0].length).toBeGreaterThanOrEqual(2);
  });
});
