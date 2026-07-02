/*
 * Web-font on-canvas editing via ligature-off (1:1 sourceIndex) — RGR.
 *
 * Web (Google) fonts ligate (fi/ffi…), folding several source chars into one
 * glyph, which desyncs the per-glyph sourceIndex from the raw string. With
 * ligatures OFF the mapping is 1:1 and sourceIndex is exact (proven for the 1:1
 * layout by the M1 seam tests). So:
 *   - canMutate allows a web font only when otLigatures === false;
 *   - entering an edit session (begin / placeCaretAtWorld) switches a ligated web
 *     layer to ligature-off so it becomes editable with exact indices;
 *   - ending a session that made NO edits restores the original setting (a bare
 *     click-in/out doesn't persist the switch);
 *   - ending after edits keeps it ligature-off (committed text stays editable);
 *   - built-in stroke fonts are untouched (they never ligate).
 *
 * font:'google:inter' is web by KEY prefix, so the gate/flip logic is exercised
 * without a network-loaded face.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Web-font editability (ligature-off 1:1)', () => {
  let runtime, V;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterEach(() => runtime.cleanup());

  const setup = (fontOpts = {}) => {
    const engine = new V.VectorEngine();
    const host = { bindKeys: false, regen: (l) => engine.generate(l.id), pushHistory: () => {}, requestDraw: () => {}, refreshPanel: () => {} };
    const ctrl = new V.TextEditController(host);
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'office', fitToFrame: false, jitter: 0, fontSize: 20, ...fontOpts });
    engine.generate(id);
    return { engine, ctrl, layer };
  };

  test('canMutate: web font blocked with ligatures on, allowed with ligatures off', () => {
    const { ctrl, layer } = setup({ font: 'google:inter', otLigatures: true });
    expect(ctrl.canMutate(layer)).toBe(false);
    layer.params.otLigatures = false;
    expect(ctrl.canMutate(layer)).toBe(true);
  });

  test('begin() on a ligated web layer switches it to ligature-off (editable)', () => {
    const { ctrl, layer } = setup({ font: 'google:inter', otLigatures: true });
    ctrl.begin(layer, 0);
    expect(layer.params.otLigatures).toBe(false);
    expect(ctrl.canMutate(layer)).toBe(true);
    ctrl.end();
  });

  test('ending with NO edits restores the original ligature setting', () => {
    const { ctrl, layer } = setup({ font: 'google:inter', otLigatures: true });
    ctrl.begin(layer, 0);
    expect(layer.params.otLigatures).toBe(false);
    ctrl.end();
    expect(layer.params.otLigatures).toBe(true); // restored — click-in/out is a no-op
  });

  test('ending AFTER edits keeps the layer ligature-off (stays editable)', () => {
    const { ctrl, layer } = setup({ font: 'google:inter', otLigatures: true });
    ctrl.begin(layer, 6); // caret at end of "office"
    const inserted = ctrl.insertText('!');
    expect(inserted).toBe(true);            // canMutate true after the flip
    expect(layer.params.text).toBe('office!');
    ctrl.end();
    expect(layer.params.otLigatures).toBe(false); // kept off
  });

  test('built-in stroke font is untouched by web-edit enablement', () => {
    const { ctrl, layer } = setup({ font: 'sans', otLigatures: true });
    ctrl.begin(layer, 0);
    expect(layer.params.otLigatures).toBe(true); // no flip for non-web fonts
    ctrl.end();
    expect(layer.params.otLigatures).toBe(true);
  });
});
