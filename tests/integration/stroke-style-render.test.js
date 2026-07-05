/**
 * Lane B interface (integration): a full renderer draw() applies the per-layer
 * stroke style fields — the display pipeline calls _applyLayerStrokeCtx for the
 * layer and pushes the layer-level dash to the context. Mock layer carries the
 * new fields (Lane B owns the model; this proves the renderer mirrors them).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer draw() mirrors Lane B stroke fields', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('draw() applies the layer cap/join/miter and layer dash', async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    SETTINGS.documentUnits = 'metric';

    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('stroke-layer', 'shape', 'Dashed');
    layer.sourcePaths = [[
      { x: 40, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 120 }, { x: 40, y: 120 },
    ]];
    // Lane B fields:
    layer.lineCap = 'projecting';
    layer.lineJoin = 'bevel';
    layer.miterLimit = 6;
    layer.dash = { enabled: true, pattern: [12, 2, 12, 5] };
    engine.layers.push(layer);
    engine.generate(layer.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;

    const appliedLayers = [];
    const realApply = renderer._applyLayerStrokeCtx.bind(renderer);
    renderer._applyLayerStrokeCtx = (l) => { appliedLayers.push(l && l.id); return realApply(l); };

    const dashCalls = [];
    const realSetLineDash = renderer.ctx.setLineDash.bind(renderer.ctx);
    renderer.ctx.setLineDash = (a) => { dashCalls.push(a); return realSetLineDash(a); };

    renderer.draw();

    expect(appliedLayers).toContain('stroke-layer');
    // The layer-level dash (metric passthrough) reached the context at least once.
    const sawLayerDash = dashCalls.some((a) => Array.isArray(a)
      && a.length === 4 && a[0] === 12 && a[1] === 2 && a[2] === 12 && a[3] === 5);
    expect(sawLayerDash).toBe(true);
  });
});
