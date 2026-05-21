const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const STACK = {
  includeRenderer: true,
  includeUi: false,
  includeApp: false,
  includeMain: false,
  useIndexHtml: true,
};

describe('Renderer paint-bucket: updateLastPaintedFills + hover clear', () => {
  let runtime, window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(STACK);
    ({ window } = runtime);
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function makeRect(minX, minY, maxX, maxY) {
    const p = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
      { x: minX, y: minY },
    ];
    p.meta = { kind: 'rect', closed: true };
    return p;
  }

  function makeFakeEngine() {
    const layer = {
      id: 'L1',
      visible: true,
      isGroup: false,
      paths: [makeRect(0, 0, 100, 100)],
      displayPaths: [makeRect(0, 0, 100, 100)],
      fills: [
        {
          id: 'f1', fillType: 'hatch', density: 4, angle: 0, amplitude: 1, dotSize: 0.6,
          padding: 0, shiftX: 0, shiftY: 0, dotPattern: 'brick', axes: 3, polyTile: 'grid',
          sensitivity: 5, penId: 'pen-1',
          region: makeRect(0, 0, 100, 100),
        },
        {
          id: 'f2', fillType: 'hatch', density: 4, angle: 0, amplitude: 1, dotSize: 0.6,
          padding: 0, shiftX: 0, shiftY: 0, dotPattern: 'brick', axes: 3, polyTile: 'grid',
          sensitivity: 5, penId: 'pen-1',
          region: makeRect(10, 10, 50, 50),
        },
      ],
    };
    return {
      layer,
      engine: {
        layers: [layer],
        computeAllDisplayGeometry: function () { this._computed = (this._computed || 0) + 1; },
        _computed: 0,
      },
    };
  }

  test('updateLastPaintedFills rewrites every record in the batch and recomputes geometry', () => {
    const Renderer = window.Vectura.Renderer;
    const { engine, layer } = makeFakeEngine();
    const rendererLike = {
      engine,
      lastPaintedFillRefs: [
        { layerId: 'L1', fillId: 'f1' },
        { layerId: 'L1', fillId: 'f2' },
      ],
    };
    const changed = Renderer.prototype.updateLastPaintedFills.call(rendererLike, {
      fillMode: 'stipple',
      fillDensity: 9,
      fillAngle: 30,
      fillDotLength: 2.5,
    });
    expect(changed).toBe(true);
    expect(layer.fills[0].fillType).toBe('stipple');
    expect(layer.fills[0].density).toBe(9);
    expect(layer.fills[0].angle).toBe(30);
    expect(layer.fills[0].dotLength).toBe(2.5);
    expect(layer.fills[1].fillType).toBe('stipple');
    expect(layer.fills[1].density).toBe(9);
    expect(engine._computed).toBe(1);
  });

  test('updateLastPaintedFills is a no-op when no batch is tracked', () => {
    const Renderer = window.Vectura.Renderer;
    const { engine, layer } = makeFakeEngine();
    const rendererLike = { engine, lastPaintedFillRefs: [] };
    const changed = Renderer.prototype.updateLastPaintedFills.call(rendererLike, { fillDensity: 99 });
    expect(changed).toBe(false);
    expect(layer.fills[0].density).toBe(4);
    expect(engine._computed).toBe(0);
  });

  test('updateLastPaintedFills prunes refs whose fill record was deleted', () => {
    const Renderer = window.Vectura.Renderer;
    const { engine, layer } = makeFakeEngine();
    layer.fills = layer.fills.filter((f) => f.id === 'f2');
    const rendererLike = {
      engine,
      lastPaintedFillRefs: [
        { layerId: 'L1', fillId: 'f1' },
        { layerId: 'L1', fillId: 'f2' },
      ],
      _notifyBatchState: Renderer.prototype._notifyBatchState,
    };
    Renderer.prototype.updateLastPaintedFills.call(rendererLike, { fillDensity: 7 });
    expect(rendererLike.lastPaintedFillRefs).toEqual([{ layerId: 'L1', fillId: 'f2' }]);
    expect(layer.fills[0].density).toBe(7);
  });

  test('_paintBucketClearHover wipes hover state but keeps lastPaintedFillRefs', () => {
    const Renderer = window.Vectura.Renderer;
    const rendererLike = {
      activeTool: 'fill',
      paintBucketStack: [{ loopId: 'foo' }],
      paintBucketStackKey: 'k',
      paintBucketScopeIndex: 2,
      patternFillPreviewPolygon: [{ x: 0, y: 0 }],
      lastPourLoopId: 'foo',
      lastPaintedFillRefs: [{ layerId: 'L1', fillId: 'f1' }],
      hideFillLoupe() { this._loupeHidden = true; },
      draw() { this._drew = true; },
      app: { ui: { setPaintBucketHint(text) { rendererLike._hint = text; } } },
    };
    Renderer.prototype._paintBucketClearHover.call(rendererLike);
    expect(rendererLike.paintBucketStack).toBeNull();
    expect(rendererLike.paintBucketStackKey).toBeNull();
    expect(rendererLike.patternFillPreviewPolygon).toBeNull();
    expect(rendererLike.lastPourLoopId).toBeNull();
    expect(rendererLike._loupeHidden).toBe(true);
    expect(rendererLike._drew).toBe(true);
    expect(rendererLike._hint).toMatch(/Shift\+drag/);
    // Critically: the param-edit target list survives so slider tweaks still
    // retarget the most recent pour after the cursor leaves the canvas.
    expect(rendererLike.lastPaintedFillRefs).toEqual([{ layerId: 'L1', fillId: 'f1' }]);
  });

  test('_paintBucketClearHover is a no-op when the active tool is not fill', () => {
    const Renderer = window.Vectura.Renderer;
    const rendererLike = {
      activeTool: 'select',
      paintBucketStack: [{ loopId: 'foo' }],
      patternFillPreviewPolygon: [{ x: 0, y: 0 }],
      hideFillLoupe() { this._loupeHidden = true; },
      draw() { this._drew = true; },
      app: { ui: { setPaintBucketHint() {} } },
    };
    Renderer.prototype._paintBucketClearHover.call(rendererLike);
    expect(rendererLike.paintBucketStack).toEqual([{ loopId: 'foo' }]);
    expect(rendererLike.patternFillPreviewPolygon).toEqual([{ x: 0, y: 0 }]);
    expect(rendererLike._loupeHidden).toBeUndefined();
    expect(rendererLike._drew).toBeUndefined();
  });

  test('commitActiveBatch clears refs and notifies the panel', () => {
    const Renderer = window.Vectura.Renderer;
    const notified = [];
    const rendererLike = {
      lastPaintedFillRefs: [{ layerId: 'L1', fillId: 'f1' }],
      draw() { this._drew = true; },
      app: { paintBucketPanel: { onBatchStateChange: (s) => notified.push(s) } },
      _notifyBatchState: Renderer.prototype._notifyBatchState,
    };
    const committed = Renderer.prototype.commitActiveBatch.call(rendererLike);
    expect(committed).toBe(true);
    expect(rendererLike.lastPaintedFillRefs).toEqual([]);
    expect(notified).toEqual([{ activeCount: 0 }]);
    expect(rendererLike._drew).toBe(true);
  });

  test('commitActiveBatch is a no-op when there is no active batch', () => {
    const Renderer = window.Vectura.Renderer;
    const notified = [];
    const rendererLike = {
      lastPaintedFillRefs: [],
      draw() { this._drew = true; },
      app: { paintBucketPanel: { onBatchStateChange: (s) => notified.push(s) } },
    };
    const committed = Renderer.prototype.commitActiveBatch.call(rendererLike);
    expect(committed).toBe(false);
    expect(notified).toEqual([]);
    expect(rendererLike._drew).toBeUndefined();
  });

  test('_paintBucketAdoptAtPoint replaces the batch with the clicked fill and loads its params', () => {
    const Renderer = window.Vectura.Renderer;
    const { engine, layer } = makeFakeEngine();
    const notified = [];
    const loaded = [];
    const rendererLike = {
      engine,
      lastPaintedFillRefs: [{ layerId: 'L1', fillId: 'f1' }],
      draw() {},
      app: {
        paintBucketPanel: {
          loadParamsFromFill: (rec) => loaded.push(rec.id),
          onBatchStateChange: (s) => notified.push(s),
        },
      },
      _notifyBatchState: Renderer.prototype._notifyBatchState,
    };
    // PaintBucketOps.findFillAtPoint will pick f2 (the smaller inner region).
    const ok = Renderer.prototype._paintBucketAdoptAtPoint.call(rendererLike, { x: 20, y: 20 });
    expect(ok).toBe(true);
    expect(rendererLike.lastPaintedFillRefs).toEqual([{ layerId: 'L1', fillId: 'f2' }]);
    expect(loaded).toEqual(['f2']);
    expect(notified).toEqual([{ activeCount: 1 }]);
    // The original batch was implicitly committed (f1 is no longer in refs).
    expect(rendererLike.lastPaintedFillRefs.some((r) => r.fillId === 'f1')).toBe(false);
    // Unrelated: layer fill records themselves are untouched by adoption.
    expect(layer.fills.length).toBe(2);
  });

  test('_paintBucketAdoptAtPoint returns false when no fill covers the point', () => {
    const Renderer = window.Vectura.Renderer;
    const { engine } = makeFakeEngine();
    const rendererLike = {
      engine,
      lastPaintedFillRefs: [],
      // patternFillPreviewPolygon is null (no prior hover) — the pour guard
      // must skip the pour and leave refs empty.
      patternFillPreviewPolygon: null,
      draw() {},
      app: { paintBucketPanel: {} },
    };
    const ok = Renderer.prototype._paintBucketAdoptAtPoint.call(rendererLike, { x: 999, y: 999 });
    expect(ok).toBe(false);
    expect(rendererLike.lastPaintedFillRefs).toEqual([]);
  });
});
