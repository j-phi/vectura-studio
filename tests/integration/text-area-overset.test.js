/*
 * Area-type OVERSET detection (RGR).
 *
 * When wrapped area text is taller than the frame, Illustrator shows a red "+"
 * out-port. The engine must flag this: after generate(), an area text layer
 * whose laid height exceeds frameHeight has transient `layer.textOverset === true`
 * (never serialized); a layer whose text fits has `false`; point type never
 * oversets. Threading is out of scope — this only covers the flag the renderer
 * uses to draw the indicator.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Area-type overset flag (engine.generate)', () => {
  let runtime, V;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterEach(() => runtime.cleanup());

  const areaLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      text: 'the quick brown fox jumps over the lazy dog again and again',
      font: 'sans', fitToFrame: false, jitter: 0, fontSize: 20,
      textMode: 'area', frameWidth: 80, frameHeight: 200,
    }, extra);
    engine.generate(id);
    return layer;
  };

  test('text taller than the frame → textOverset true', () => {
    const engine = new V.VectorEngine();
    // Short frame height forces many wrapped lines to exceed it.
    const layer = areaLayer(engine, { frameHeight: 15 });
    expect(layer.textOverset).toBe(true);
  });

  test('text that fits the frame → textOverset false', () => {
    const engine = new V.VectorEngine();
    // Tall frame comfortably holds the wrapped text.
    const layer = areaLayer(engine, { frameHeight: 600, text: 'hi' });
    expect(layer.textOverset).toBe(false);
  });

  test('point-type text never oversets', () => {
    const engine = new V.VectorEngine();
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'hello', font: 'sans', fitToFrame: false, jitter: 0, textMode: 'point' });
    engine.generate(id);
    expect(Boolean(layer.textOverset)).toBe(false);
  });

  test('textOverset is transient — not serialized', () => {
    const engine = new V.VectorEngine();
    areaLayer(engine, { frameHeight: 15 });
    const state = engine.exportState();
    for (const l of state.layers) {
      expect(Object.prototype.hasOwnProperty.call(l, 'textOverset')).toBe(false);
    }
  });
});
