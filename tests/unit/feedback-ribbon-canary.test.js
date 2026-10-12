const fs = require('node:fs');
const path = require('node:path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { polylineLenMm } = require('../helpers/scene3d-ribbon-width');

const ROOT = path.resolve(__dirname, '../..');
const SURFACE_FILL = 'src/core/scene3d/surface-fill.js';
const THIN_NEEDLE = '          hw.push(Math.max(half[i], HALF_MIN));';
const PLACE_NEEDLE = 'if (isWaveLaw() && !isWv6()) return wvPlaceCov(localPitch);';
const WIDTH_FLOOR_MM = 0.83572; // 0.85x the shipped default-camera width (0.9832 mm)

const replaceOne = (source, needle, replacement, label) => {
  const count = source.split(needle).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one source match, found ${count}`);
  return source.replace(needle, replacement);
};

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

describe('compact live ribbon feedback canary', () => {
  test('screen-distance placement and pen-scaled ribbon width reject their known bad implementation', async () => {
    const source = fs.readFileSync(path.join(ROOT, SURFACE_FILL), 'utf8');
    const placementFaultSource = replaceOne(
      source, PLACE_NEEDLE, 'if (isWaveLaw() && !isWv6()) return wvFlatCov();', 'flat-placement fault',
    );
    const widthFaultSource = replaceOne(
      source, THIN_NEEDLE, '          hw.push(Math.max(half[i], HALF_MIN) * 0.6);', 'thin-ribbon fault',
    );
    const inspectVariant = async (scriptOverrides) => {
      const runtime = await loadVecturaRuntime({ includeUi: true, ...(scriptOverrides ? { scriptOverrides } : {}) });
      try {
        return inspectRibbon(runtime.window.Vectura);
      } finally {
        runtime.cleanup();
      }
    };
    const actual = await inspectVariant();
    const flatPlacement = await inspectVariant({ [SURFACE_FILL]: placementFaultSource });
    const thinned = await inspectVariant({ [SURFACE_FILL]: widthFaultSource });

    expect(actual.ribbonCount).toBeGreaterThan(0);
    expect(actual.penWidth).toBeCloseTo(0.3, 6);
    expect(actual.meanWidthMm).toBeGreaterThanOrEqual(WIDTH_FLOOR_MM);
    expect(actual.meanWidthMm / actual.penWidth).toBeGreaterThanOrEqual(2.7);

    // Compare emitted rulings against the old flat-field prediction. Some
    // predicted rulings are legitimately clipped by the curved surface, so
    // require every emitted mutant ruling to belong to the prediction rather
    // than requiring equality. Current code must emit at least one ruling
    // outside the old model, and differ from the known-fault geometry.
    expect(actual.familyA.length).toBeGreaterThan(4);
    expect(flatPlacement.familyA.length).toBeGreaterThan(4);
    expect(flatPlacement.familyA.every((index) => flatPlacement.flatPrediction.includes(index))).toBe(true);
    expect(actual.familyA.some((index) => !actual.flatPrediction.includes(index))).toBe(true);
    expect(flatPlacement.familyA).not.toEqual(actual.familyA);

    // The source-level 0.6x width mutation preserves the same ribbon
    // population while moving the measured, generated width below its floor.
    expect(thinned.ribbonCount).toBe(actual.ribbonCount);
    expect(thinned.meanWidthMm).toBeLessThan(actual.meanWidthMm);
    expect(thinned.meanWidthMm).toBeLessThan(WIDTH_FLOOR_MM);
  }, 300000);
});
