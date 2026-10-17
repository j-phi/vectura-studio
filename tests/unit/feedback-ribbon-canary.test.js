const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { polylineLenMm } = require('../helpers/scene3d-ribbon-width');

const WIDTH_FLOOR_MM = 0.83572; // 0.85x the shipped default-camera width (0.9832 mm)

const inspectRibbon = (Vectura) => {
  const engine = new Vectura.VectorEngine();
  const groupId = engine.addLayer('scene3d');
  const group = engine.layers.find((layer) => layer && layer.id === groupId);
  const object = engine.getLayerDescendants(groupId).find((layer) => layer && layer.type === 'object3d');
  object.params.primitive = 'torus';
  object.params.style = object.params.style || { penId: null, mapper: 'hatch', params: {} };
  object.params.style.mapper = 'hatch';
  object.params.style.params = { ...(object.params.style.params || {}), toneLaw: 'interlockWeave', fillDensity: 50 };
  group.params.seed = 0;

  const surfaceFill = Vectura.Scene3D.SurfaceFill;
  const ribbonGeometry = Vectura.RibbonGeometry;
  const rawRuns = [];
  const widthCalls = [];
  const originalBuild = surfaceFill.buildObject;
  const originalRibbon = ribbonGeometry.buildRibbonMultiPolygon;
  surfaceFill.buildObject = function captureRuns(opts) {
    const result = originalBuild.call(this, opts);
    if (result) result.forEach((run) => rawRuns.push(run));
    return result;
  };
  ribbonGeometry.buildRibbonMultiPolygon = function captureWidth(centre, half, options) {
    widthCalls.push({
      length: polylineLenMm(centre),
      halfMean: half?.length ? half.reduce((sum, value) => sum + value, 0) / half.length : 0,
      minHalfWidth: options?.minHalfWidth,
    });
    return originalRibbon.apply(this, arguments);
  };

  try {
    engine.computeAllDisplayGeometry();
  } finally {
    surfaceFill.buildObject = originalBuild;
    ribbonGeometry.buildRibbonMultiPolygon = originalRibbon;
  }

  const stats = { ...surfaceFill.lastRibbonStats };
  const grid = { ...surfaceFill.lastMasterGridStats };
  const ribbonCalls = widthCalls.filter((call) => Math.abs(call.minHalfWidth - stats.penWidth / 2) < 1e-9);
  const totalLength = ribbonCalls.reduce((sum, call) => sum + call.length, 0);
  const meanWidthMm = totalLength > 0
    ? ribbonCalls.reduce((sum, call) => sum + call.length * 2 * call.halfMean, 0) / totalLength
    : null;
  const familyA = [...new Set(rawRuns
    .filter((run) => !run.back && typeof run.fam === 'string' && run.fam.startsWith('A#')
      && Number.isInteger(run.lineIndex))
    .map((run) => run.lineIndex))].sort((a, b) => a - b);
  const flatCov = grid.masterPitch / (10 * stats.penWidth * 1.12);
  const flatPrediction = surfaceFill.__ladderForTest(new Array(grid.N).fill(flatCov), 0.5)
    .map((keep, index) => keep ? index : null).filter((index) => index != null);

  return {
    penWidth: stats.penWidth,
    ribbonCount: ribbonCalls.length,
    singlePenStrokes: rawRuns.every((run) => run.weightScale === undefined || run.weightScale === 1),
    meanWidthMm,
    familyA,
    flatPrediction,
  };
};

// The bars are absolute, so a synthetic fault needs no runtime of its own here.
// Mutation proofs (R-27, commit message): placement `wvPlaceCov` -> `wvFlatCov()`
// fails the familyA bar; ribbon half-width x0.6 fails the width floor.
describe('compact live ribbon feedback canary', () => {
  test('screen-distance placement and pen-scaled ribbon width hold on the shipped renderer', async () => {
    const runtime = await loadVecturaRuntime({ includeUi: true });
    let actual;
    try {
      actual = inspectRibbon(runtime.window.Vectura);
    } finally {
      runtime.cleanup();
    }

    expect(actual.ribbonCount).toBeGreaterThan(0);
    expect(actual.singlePenStrokes).toBe(true);
    expect(actual.penWidth).toBeCloseTo(0.3, 6);
    expect(actual.meanWidthMm).toBeGreaterThanOrEqual(WIDTH_FLOOR_MM);
    expect(actual.meanWidthMm / actual.penWidth).toBeGreaterThanOrEqual(2.7);

    // The old flat-field placement emits only rulings its own flat prediction
    // keeps. Screen-distance placement must emit at least one ruling outside
    // that prediction.
    expect(actual.familyA.length).toBeGreaterThan(4);
    expect(actual.familyA.some((index) => !actual.flatPrediction.includes(index))).toBe(true);
  }, 120000);
});
