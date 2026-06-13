/**
 * Regression test for audit defect D2: meshTopography `artworkSize` is DEAD.
 *
 * The mesh size is fully controlled by primitiveScaleX/Y/Z. `artworkSize`
 * (formerly default 150) was only read as an inert fallback in the generator
 * and changing it produced NO output change. It was removed.
 *
 * This guard proves it is truly inert and stays removed:
 *  1. Sweeping artworkSize ∈ {30, 150, 260} with otherwise default params
 *     yields an IDENTICAL geometry signature (path count + total point count +
 *     total length) in both `contours` and `wireframe` render modes.
 *  2. `ALGO_DEFAULTS.meshTopography.artworkSize` is `undefined` after removal.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mesh Topography — artworkSize removed (audit D2, dead/redundant)', () => {
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
        primitiveDetail: 18,
        primitiveScaleX: 65,
        primitiveScaleY: 65,
        primitiveScaleZ: 65,
        lineCount: 26,
        yaw: -28,
        pitch: 34,
        contourVisibility: 'visibleOnly',
        ...overrides,
      },
      new SeededRNG(42),
      new SimpleNoise(42),
      { width: 400, height: 400 },
    );
  };

  // Geometry signature: path count | total point count | total length.
  const signature = (paths) => {
    let points = 0;
    let length = 0;
    for (const path of paths) {
      points += path.length;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        length += Math.hypot(dx, dy);
      }
    }
    return `${paths.length}|${points}|${length.toFixed(4)}`;
  };

  const SWEEP = [30, 150, 260];

  it('artworkSize sweep is inert in contours mode (signature identical)', () => {
    const sigs = SWEEP.map((artworkSize) =>
      signature(generate({ renderMode: 'contours', artworkSize })),
    );
    const baseline = signature(generate({ renderMode: 'contours' })); // no artworkSize key at all
    expect(new Set([...sigs, baseline]).size).toBe(1);
  });

  it('artworkSize sweep is inert in wireframe mode (signature identical)', () => {
    const sigs = SWEEP.map((artworkSize) =>
      signature(generate({ renderMode: 'wireframe', artworkSize })),
    );
    const baseline = signature(generate({ renderMode: 'wireframe' })); // no artworkSize key at all
    expect(new Set([...sigs, baseline]).size).toBe(1);
  });

  it('ALGO_DEFAULTS.meshTopography.artworkSize is undefined (key removed)', () => {
    const { ALGO_DEFAULTS } = runtime.window.Vectura;
    expect(ALGO_DEFAULTS.meshTopography.artworkSize).toBeUndefined();
  });

  it('imageSurface.artworkSize is left intact (real parameter, not removed)', () => {
    const { ALGO_DEFAULTS } = runtime.window.Vectura;
    expect(ALGO_DEFAULTS.imageSurface.artworkSize).toBe(150);
  });
});
