const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

const makeShape = (width) => ({
  anchors: [
    { t: 0, w: 0, in: null, out: { t: 0.18, w: 0 } },
    { t: 0.52, w: width, in: { t: 0.34, w: width }, out: { t: 0.7, w: width } },
    { t: 1, w: 0, in: { t: 0.84, w: 0 }, out: null },
  ],
});

describe('Petal Designer selection helpers', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('overlay body hit prefers the inactive shape when the click lands on its silhouette only', () => {
    const UI = runtime.window.Vectura.UI;
    const proto = UI.prototype;
    const helper = {
      normalizeDesignerShape: proto.normalizeDesignerShape,
      normalizeDesignerSymmetryMode: proto.normalizeDesignerSymmetryMode,
      designerSymmetryHasVerticalAxis: proto.designerSymmetryHasVerticalAxis,
      normalizePetalDesignerRingTarget: proto.normalizePetalDesignerRingTarget,
      getPetalDesignerTarget: proto.getPetalDesignerTarget,
      getPetalDesignerSymmetryForSide: proto.getPetalDesignerSymmetryForSide,
      getPetalDesignerView: proto.getPetalDesignerView,
      getDesignerCanvasMetrics: () => ({ width: 220, height: 180, dpr: 1 }),
      getPetalDesignerWidthRatioForCanvas: () => 1,
      designerToCanvas: proto.designerToCanvas,
      sampleDesignerWidthAt: proto.sampleDesignerWidthAt,
      applyDesignerEdgeSymmetry: proto.applyDesignerEdgeSymmetry,
      sampleDesignerEdge: proto.sampleDesignerEdge,
      buildDesignerPolygon: proto.buildDesignerPolygon,
      pointInDesignerPolygon: proto.pointInDesignerPolygon,
      distanceToDesignerPolygon: proto.distanceToDesignerPolygon,
      hitDesignerShapeBody: proto.hitDesignerShapeBody,
      pickPetalDesignerShapeAtPoint: proto.pickPetalDesignerShapeAtPoint,
    };

    const canvas = runtime.document.createElement('canvas');
    canvas.width = 220;
    canvas.height = 180;
    canvas.getBoundingClientRect = () => ({ width: 220, height: 180, left: 0, top: 0, right: 220, bottom: 180 });

    const state = {
      activeTarget: 'inner',
      target: 'inner',
      innerSymmetry: 'none',
      outerSymmetry: 'none',
      views: {
        inner: { zoom: 1, panX: -32, panY: 0 },
        outer: { zoom: 1, panX: 32, panY: 0 },
      },
      inner: clone(makeShape(0.78)),
      outer: clone(makeShape(0.78)),
    };
    helper.normalizeDesignerShape.call(helper, state.inner);
    helper.normalizeDesignerShape.call(helper, state.outer);

    const innerOnlyPoint = helper.designerToCanvas.call(
      helper,
      canvas,
      { t: 0.55, w: -0.62 },
      state.views.inner
    );
    const selectedSide = helper.pickPetalDesignerShapeAtPoint.call(helper, { state }, canvas, innerOnlyPoint);

    expect(selectedSide).toBe('inner');
  });
});
