/*
 * M1 foundational seam — engine.generate() populates world-space layer.glyphs (RGR).
 *
 * For a text layer, engine.generate() projects the layout cells through the SAME
 * layer transform (posX/posY/scaleX/scaleY/rotation) the paths use and stores the
 * result on layer.glyphs (WORLD space, recomputed every generate, never cached or
 * serialized). For a non-text layer, layer.glyphs is [].
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('layer.glyphs (M1 seam)', () => {
  let runtime, V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  const makeTextLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'Hi', fitToFrame: false, fontSize: 40 }, extra);
    return { id, layer };
  };

  test('text layer gets world-space glyph quads after generate', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine);
    engine.generate(id);
    expect(Array.isArray(layer.glyphs)).toBe(true);
    expect(layer.glyphs.length).toBeGreaterThan(0);
    layer.glyphs.forEach((g) => {
      expect(Number.isFinite(g.sourceIndex)).toBe(true);
      expect(Array.isArray(g.quad)).toBe(true);
      expect(g.quad.length).toBe(4);
      g.quad.forEach((pt) => {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      });
    });
  });

  test('layer transform (posX) shifts glyph quads in world space', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { posX: 0 });
    engine.generate(id);
    const baseX = layer.glyphs[0].quad[0].x;
    layer.params.posX = 50;
    engine.generate(id);
    const shiftedX = layer.glyphs[0].quad[0].x;
    expect(shiftedX - baseX).toBeCloseTo(50, 3);
  });

  test('non-text layer has empty glyphs', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('lissajous');
    engine.generate(id);
    const layer = engine.layers.find((l) => l.id === id);
    expect(layer.glyphs).toEqual([]);
  });

  test('_edit is null on a fresh layer and not serialized', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine);
    engine.generate(id);
    expect(layer._edit).toBeNull();
    const state = engine.exportState();
    const dumped = state.layers.find((l) => l.id === id);
    expect('_edit' in dumped).toBe(false);
    expect('glyphs' in dumped).toBe(false);
  });
});
