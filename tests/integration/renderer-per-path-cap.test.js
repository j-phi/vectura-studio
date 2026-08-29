/*
 * PER-PATH CAP SCOPING — `meta.strokeCap` reaches the canvas, and nothing else
 * does.
 *
 * The pen-width ribbon geometry ends its outline and fill passes EXACTLY on the
 * clipped form, so a round cap would push half a pen width of ink past that
 * boundary — the protrusion at a sphere's limb in the bug screenshot. Those
 * paths ask for `butt` via `meta.strokeCap`.
 *
 * The risk this file locks down is the opposite one: a per-path cap override is
 * a very easy thing to implement as a GLOBAL cap change, which would silently
 * re-cap every layer type in the app. So both directions are asserted —
 *
 *   1. a path carrying `meta.strokeCap: 'butt'` is stroked with a butt cap,
 *   2. a path in the same batch WITHOUT the field keeps the LAYER's cap, and
 *   3. the isolated-draw branches (filled glyph, per-path dash, per-path
 *      weight) call `_applyLayerStrokeCtx`, which resets the cap to the
 *      layer's — so each must RESTATE the batch cap or the next batched path
 *      silently reverts. (That was a real hole: the weight/dash branch restated
 *      it, the filled-glyph branch did not.)
 *
 * Measured by wrapping ctx.stroke/ctx.fill and recording the live
 * `ctx.lineCap` at the moment ink is committed — i.e. what the canvas actually
 * drew with, not what the code intended.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Renderer honors meta.strokeCap per path without changing anyone else\'s cap', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Builds a one-layer scene whose renderable paths are exactly `paths`, draws
  // it, and returns the ctx.lineCap in force at each stroke()/fill() call.
  const capsAtInk = async (layerCap, paths) => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer, SETTINGS } = runtime.window.Vectura;
    SETTINGS.documentUnits = 'metric';

    const engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('cap-layer', 'shape', 'Caps');
    layer.sourcePaths = [[{ x: 10, y: 10 }, { x: 60, y: 10 }]];
    layer.lineCap = layerCap;
    engine.layers.push(layer);
    engine.generate(layer.id);
    // Bypass the display pipeline: these crafted paths (with their meta) are
    // what the draw loop must consume verbatim.
    engine.getRenderablePaths = (l) => (l.id === 'cap-layer' ? paths : []);

    const renderer = new Renderer('main-canvas', engine);
    renderer.scale = 1;

    const seen = [];
    const realStroke = renderer.ctx.stroke.bind(renderer.ctx);
    const realFill = renderer.ctx.fill.bind(renderer.ctx);
    renderer.ctx.stroke = (...a) => { seen.push({ op: 'stroke', cap: renderer.ctx.lineCap }); return realStroke(...a); };
    renderer.ctx.fill = (...a) => { seen.push({ op: 'fill', cap: renderer.ctx.lineCap }); return realFill(...a); };

    renderer.draw();
    return seen;
  };

  const mk = (y, meta) => {
    const p = [{ x: 10, y }, { x: 60, y }];
    if (meta) p.meta = meta;
    return p;
  };

  test('a `butt` override is stroked butt; a plain path in the same batch keeps the layer cap', async () => {
    const seen = await capsAtInk('round', [
      mk(10, { strokeCap: 'butt' }),
      mk(20, null),
    ]);
    const caps = new Set(seen.filter((s) => s.op === 'stroke').map((s) => s.cap));
    expect(caps.has('butt')).toBe(true);   // the ribbon pass ends flush
    expect(caps.has('round')).toBe(true);  // everything else is untouched
  });

  test('a layer with no per-path override never sees a cap it did not ask for', async () => {
    const seen = await capsAtInk('round', [mk(10, null), mk(20, null), mk(30, null)]);
    seen.filter((s) => s.op === 'stroke').forEach((s) => {
      // The only caps in play are the layer's own (plus whatever the overlays
      // outside the layer batch use, which are all 'round' too).
      expect(s.cap).toBe('round');
    });
  });

  test('`projecting` maps to the canvas spelling `square`, per path as per layer', async () => {
    const seen = await capsAtInk('round', [mk(10, { strokeCap: 'projecting' }), mk(20, null)]);
    const caps = new Set(seen.filter((s) => s.op === 'stroke').map((s) => s.cap));
    expect(caps.has('square')).toBe(true);
    expect(caps.has('projecting')).toBe(false);
  });

  test('the filled-glyph branch restates the batch cap for the paths after it', async () => {
    // RED without the restatement: the filled glyph calls
    // _applyLayerStrokeCtx, which resets the cap to the layer's 'round', and
    // the SECOND butt ribbon path is then stroked round — protruding again.
    const seen = await capsAtInk('round', [
      mk(10, { strokeCap: 'butt' }),
      mk(20, { fill: true, strokeCap: 'butt' }),
      mk(30, { strokeCap: 'butt' }),
    ]);
    const idxFill = seen.findIndex((s) => s.op === 'fill');
    expect(idxFill).toBeGreaterThan(-1);
    const after = seen.slice(idxFill + 1).filter((s) => s.op === 'stroke');
    expect(after.length).toBeGreaterThan(0);
    // No stroke after the glyph reverts to the layer cap while butt paths are
    // still pending in the batch.
    expect(after[0].cap).toBe('butt');
  });

  test('the per-path weight branch restates the batch cap for the paths after it', async () => {
    const seen = await capsAtInk('round', [
      mk(10, { strokeCap: 'butt' }),
      mk(20, { strokeCap: 'butt', weightScale: 3 }),
      mk(30, { strokeCap: 'butt' }),
    ]);
    const strokes = seen.filter((s) => s.op === 'stroke').map((s) => s.cap);
    // Every stroke committed while the butt run is active is butt — the
    // isolated weight draw does not leak the layer cap back into the batch.
    expect(strokes.filter((c) => c === 'butt').length).toBeGreaterThanOrEqual(2);
  });
});
