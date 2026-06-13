/**
 * Regression test: Mesh Topography must honour a third rotation axis (`roll`),
 * matching 3D Spiral's three-axis (yaw/pitch/roll) view rotation.
 *
 * Bug (pre-fix): the viewport rotation in mesh-topography.js hard-coded
 * `roll: 0`, so the `roll` slider had no effect — changing it produced
 * byte-identical geometry. This test feeds two different roll angles and
 * asserts the projected output actually changes, then confirms an omitted
 * roll behaves exactly like roll:0 (backward compatibility).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mesh Topography — roll (third rotation axis)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => runtime.cleanup());

  const generate = (overrides = {}) => {
    const { AlgorithmRegistry, SeededRNG, SimpleNoise } = runtime.window.Vectura;
    return AlgorithmRegistry.meshTopography.generate(
      {
        sourceMode: 'sphere',
        renderMode: 'contours',
        primitiveDetail: 12,
        primitiveScaleX: 60,
        primitiveScaleY: 60,
        primitiveScaleZ: 60,
        lineCount: 8,
        rotate: -28,
        tilt: 34,
        contourVisibility: 'fullContour',
        ...overrides,
      },
      new SeededRNG(0),
      new SimpleNoise(0),
      { width: 400, height: 400 },
    );
  };

  // Stable signature of every projected point in the output.
  const signature = (paths) =>
    paths
      .map((p) => p.map((pt) => `${pt.x.toFixed(2)},${pt.y.toFixed(2)}`).join('|'))
      .join(';');

  it('changing roll changes the projected geometry', () => {
    const flat = signature(generate({ roll: 0 }));
    const rolled = signature(generate({ roll: 90 }));
    expect(rolled).not.toBe(flat);
  });

  it('an omitted roll matches roll:0 (backward compatible default)', () => {
    const omitted = signature(generate({}));
    const zero = signature(generate({ roll: 0 }));
    expect(omitted).toBe(zero);
  });

  it('roll is deterministic for a fixed angle', () => {
    expect(signature(generate({ roll: 45 }))).toBe(signature(generate({ roll: 45 })));
  });
});
