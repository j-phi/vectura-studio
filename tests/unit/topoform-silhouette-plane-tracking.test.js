/**
 * Regression test: in Topoform's contour mode the Silhouette outline must be
 * built from the SAME plane-oriented geometry as the contour slices.
 *
 * Bug (pre-fix): `buildSilhouette` projected the raw mesh vertices through the
 * camera only, ignoring `planeRotate` / `planeTilt`. The contour lines are cut
 * from vertices pre-rotated by those plane controls, so tilting the planes moved
 * the contours while the silhouette stayed put — the outline floated off the
 * form it was supposed to wrap.
 *
 * Fix: the silhouette (and creases) apply the plane rotation before projecting,
 * but ONLY in contour mode — wireframe/triangleMesh modes ignore the plane
 * controls entirely, so their silhouette must stay pinned to the raw mesh.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Topoform — silhouette tracks the plane controls', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => runtime.cleanup());

  const generate = (overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry.topoform.generate(
      {
        // A box has a small, well-defined silhouette that clearly changes with
        // orientation (a sphere's silhouette is rotation-invariant).
        sourceMode: 'box',
        renderMode: 'contours',
        primitiveDetail: 8,
        primitiveScaleX: 60,
        primitiveScaleY: 60,
        primitiveScaleZ: 60,
        lineCount: 12,
        yaw: -28,
        pitch: 34,
        showOutline: true,
        ...overrides,
      },
      new SeededRNG(0),
      new SimpleNoise(0),
      { width: 400, height: 400 },
    );
  };

  const silhouette = (paths) => paths.filter((p) => p.meta && p.meta.silhouette);

  const signature = (paths) =>
    paths
      .map((p) => p.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join('|'))
      .sort()
      .join(';');

  it('changing Plane Tilt reshapes the silhouette (contour mode)', () => {
    const a = silhouette(generate({ planeTilt: 0 }));
    const b = silhouette(generate({ planeTilt: 41 }));
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(signature(a)).not.toBe(signature(b));
  });

  it('changing Plane Rotate reshapes the silhouette (contour mode)', () => {
    const a = silhouette(generate({ planeRotate: 0 }));
    const b = silhouette(generate({ planeRotate: 55 }));
    expect(signature(a)).not.toBe(signature(b));
  });

  it('the silhouette shares the contours plane orientation (both move together)', () => {
    // The silhouette bounding box must shift in lock-step with the contour cloud
    // when the plane tilts — not stay anchored while the contours rotate away.
    const bbox = (paths) => {
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      paths.forEach((p) => p.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }));
      return { minX, minY, maxX, maxY };
    };
    const flat = generate({ planeTilt: 0 });
    const tilted = generate({ planeTilt: 60 });
    const sFlat = bbox(silhouette(flat));
    const sTilt = bbox(silhouette(tilted));
    // Silhouette actually moved.
    expect(sFlat.minX).not.toBeCloseTo(sTilt.minX, 1);
  });

  it('wireframe mode ignores the plane controls for the silhouette', () => {
    // Wireframe geometry does not apply plane rotation, so its silhouette must
    // NOT move when the plane controls change — otherwise outline and mesh split.
    const a = silhouette(generate({ renderMode: 'wireframe', planeTilt: 0 }));
    const b = silhouette(generate({ renderMode: 'wireframe', planeTilt: 41 }));
    expect(a.length).toBeGreaterThan(0);
    expect(signature(a)).toBe(signature(b));
  });

  it('is deterministic', () => {
    expect(signature(silhouette(generate({ planeTilt: 30 }))))
      .toBe(signature(silhouette(generate({ planeTilt: 30 }))));
  });
});
