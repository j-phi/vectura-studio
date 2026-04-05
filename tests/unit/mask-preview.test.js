const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Mask preview renderer helpers', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const createRenderer = () => {
    const { Renderer, Layer } = runtime.window.Vectura;
    const engine = {
      layers: [],
      currentProfile: { width: 240, height: 180 },
      getBounds() {
        return { width: 240, height: 180, m: 20, dW: 200, dH: 140, truncate: true };
      },
    };
    const renderer = new Renderer('main-canvas', engine);
    const maskLayer = new Layer('mask-preview-shape', 'expanded', 'Mask');
    maskLayer.paths = [[
      { x: 80, y: 80 },
      { x: 160, y: 80 },
      { x: 160, y: 120 },
      { x: 80, y: 120 },
      { x: 80, y: 80 },
    ]];
    engine.layers = [maskLayer];
    renderer.maskPreview = {
      maskLayerId: maskLayer.id,
      descendantIds: new Set(),
      entries: [],
    };
    return { renderer, maskLayer };
  };

  const getBounds = (polygon) => {
    const points = polygon || [];
    return {
      minX: Math.min(...points.map((point) => point.x)),
      maxX: Math.max(...points.map((point) => point.x)),
      minY: Math.min(...points.map((point) => point.y)),
      maxY: Math.max(...points.map((point) => point.y)),
    };
  };

  test('transformed preview clip polygons honor move, resize, and rotate transforms', () => {
    const { renderer, maskLayer } = createRenderer();
    const base = renderer.getMaskPreviewClipPolygons(maskLayer, {
      dx: 0,
      dy: 0,
      scaleX: 1,
      scaleY: 1,
      origin: { x: 120, y: 100 },
      rotation: 0,
    })[0];
    const moved = renderer.getMaskPreviewClipPolygons(maskLayer, {
      dx: 20,
      dy: 10,
      scaleX: 1,
      scaleY: 1,
      origin: { x: 120, y: 100 },
      rotation: 0,
    })[0];
    const resized = renderer.getMaskPreviewClipPolygons(maskLayer, {
      dx: 0,
      dy: 0,
      scaleX: 1.5,
      scaleY: 0.5,
      origin: { x: 120, y: 100 },
      rotation: 0,
    })[0];
    const rotated = renderer.getMaskPreviewClipPolygons(maskLayer, {
      dx: 0,
      dy: 0,
      scaleX: 1,
      scaleY: 1,
      origin: { x: 120, y: 100 },
      rotation: 90,
    })[0];

    expect(moved[0].x).toBeCloseTo(base[0].x + 20, 5);
    expect(moved[0].y).toBeCloseTo(base[0].y + 10, 5);

    const baseBounds = getBounds(base);
    const resizedBounds = getBounds(resized);
    const rotatedBounds = getBounds(rotated);

    expect(resizedBounds.maxX - resizedBounds.minX).toBeGreaterThan(baseBounds.maxX - baseBounds.minX);
    expect(resizedBounds.maxY - resizedBounds.minY).toBeLessThan(baseBounds.maxY - baseBounds.minY);
    expect(rotatedBounds.maxX - rotatedBounds.minX).toBeCloseTo(baseBounds.maxY - baseBounds.minY, 5);
    expect(rotatedBounds.maxY - rotatedBounds.minY).toBeCloseTo(baseBounds.maxX - baseBounds.minX, 5);
  });
});
