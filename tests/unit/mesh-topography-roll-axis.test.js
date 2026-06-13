/**
 * Regression test: Mesh Topography exposes 3D Spiral's exact three-axis view
 * controller — `yaw` / `pitch` / `roll` — and honours all three.
 *
 * History:
 *  - The viewport originally rotated on two axes named `rotate`/`tilt` with no
 *    roll (roll was hard-coded 0 in mesh-topography.js).
 *  - v1.1.109 added the third `roll` axis.
 *  - v1.1.110 renamed the controls to `yaw`/`pitch`/`roll` to match the 3D
 *    Spiral controller exactly, keeping the legacy `rotate`/`tilt` keys readable
 *    for back-compat (existing presets / .vectura files).
 *
 * This test asserts each of the three axes changes the projected geometry, that
 * an omitted roll is inert, and that the legacy `rotate`/`tilt` keys still
 * orient identically to their `yaw`/`pitch` replacements.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mesh Topography — yaw / pitch / roll view controller', () => {
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
        yaw: -28,
        pitch: 34,
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

  it('changing yaw changes the projected geometry', () => {
    expect(signature(generate({ yaw: -28 }))).not.toBe(signature(generate({ yaw: 60 })));
  });

  it('changing pitch changes the projected geometry', () => {
    expect(signature(generate({ pitch: 34 }))).not.toBe(signature(generate({ pitch: -80 })));
  });

  it('changing roll changes the projected geometry', () => {
    expect(signature(generate({ roll: 0 }))).not.toBe(signature(generate({ roll: 90 })));
  });

  it('an omitted roll matches roll:0 (backward compatible default)', () => {
    expect(signature(generate({}))).toBe(signature(generate({ roll: 0 })));
  });

  it('legacy rotate/tilt keys orient identically to yaw/pitch (back-compat)', () => {
    const legacy = signature(generate({ yaw: undefined, pitch: undefined, rotate: 45, tilt: -50 }));
    const renamed = signature(generate({ yaw: 45, pitch: -50 }));
    expect(legacy).toBe(renamed);
  });

  it('is deterministic for a fixed orientation', () => {
    expect(signature(generate({ yaw: 12, pitch: -40, roll: 45 })))
      .toBe(signature(generate({ yaw: 12, pitch: -40, roll: 45 })));
  });
});
