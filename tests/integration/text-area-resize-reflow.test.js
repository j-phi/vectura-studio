/*
 * Area-type frame resize → REFLOW contract (RGR).
 *
 * Dragging a selection handle on an area text layer resizes its FRAME and the
 * text re-wraps at the new width with the point size UNCHANGED (Illustrator area
 * behavior) — it does NOT scale the glyphs. The renderer maps the handle drag to
 * params.frameWidth/frameHeight (browser/e2e-verified); this test pins the
 * observable contract the gesture relies on: regenerating an area layer at a
 * narrower frameWidth yields MORE wrapped lines while fontSize stays constant,
 * and a point-type layer is unaffected by frame params.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Area-type frame resize reflow contract', () => {
  let runtime, V;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterEach(() => runtime.cleanup());

  const lineCount = (layer) =>
    (layer.glyphs && layer.glyphs.length)
      ? new Set(layer.glyphs.map((g) => g.lineIndex)).size
      : 0;

  test('narrowing the frame re-wraps into more lines with fontSize unchanged', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      text: 'the quick brown fox jumps over the lazy dog',
      font: 'sans', fitToFrame: false, jitter: 0, fontSize: 16,
      textMode: 'area', frameWidth: 200, frameHeight: 400,
    });
    engine.generate(id);
    const wideLines = lineCount(layer);
    const size0 = layer.params.fontSize;

    // Simulate what the resize gesture writes: a narrower frame, then regen.
    layer.params.frameWidth = 80;
    engine.generate(id);
    const narrowLines = lineCount(layer);

    expect(narrowLines).toBeGreaterThan(wideLines); // reflowed to more lines
    expect(layer.params.fontSize).toBe(size0);      // point size constant (no scaling)
  });

  test('point-type layer ignores frame params (no reflow model)', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'hello world', font: 'sans', fitToFrame: false, jitter: 0, textMode: 'point' });
    engine.generate(id);
    const before = lineCount(layer);
    // Setting a frameWidth on a POINT layer must not wrap it.
    layer.params.frameWidth = 10;
    engine.generate(id);
    expect(lineCount(layer)).toBe(before);
  });
});
