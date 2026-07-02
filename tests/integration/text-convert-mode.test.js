/*
 * Point↔Area conversion (RGR) — the baseline-dot widget's toggle behavior.
 *
 * convertTextMode(layer, mode, dims):
 *   - point → area: sets textMode='area' + frameWidth/frameHeight (from dims, the
 *     layer's current natural extent in local mm) so existing text is now framed;
 *   - area → point: sets textMode='point' (unwraps);
 *   - 'toggle' flips the current mode;
 *   - pushes one pre-change history snapshot and regenerates;
 *   - no-op (returns null) when already in the target mode.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Point↔Area conversion (TextEditController.convertTextMode)', () => {
  let runtime, V;
  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterEach(() => runtime.cleanup());

  const setup = () => {
    const engine = new V.VectorEngine();
    const history = [];
    const host = {
      bindKeys: false,
      regen: (l) => engine.generate(l.id),
      pushHistory: () => history.push(engine.exportState()),
      requestDraw: () => {},
      refreshPanel: () => {},
    };
    const ctrl = new V.TextEditController(host);
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'hello world foo bar', font: 'sans', fitToFrame: false, jitter: 0, fontSize: 20, textMode: 'point' });
    engine.generate(id);
    return { engine, ctrl, layer, history };
  };

  test('point → area sets textMode + frame dims and wraps', () => {
    const { ctrl, layer, history } = setup();
    const h0 = history.length;
    const res = ctrl.convertTextMode(layer, 'area', { width: 60, height: 40 });
    expect(res).toBe('area');
    expect(layer.params.textMode).toBe('area');
    expect(layer.params.frameWidth).toBe(60);
    expect(layer.params.frameHeight).toBe(40);
    expect(history.length).toBe(h0 + 1); // one pre-change snapshot
    // With a 60mm frame the text wraps to >1 line.
    const lines = new Set(layer.glyphs.map((g) => g.lineIndex)).size;
    expect(lines).toBeGreaterThan(1);
  });

  test('area → point unwraps back to a single line', () => {
    const { ctrl, layer } = setup();
    ctrl.convertTextMode(layer, 'area', { width: 60, height: 40 });
    const res = ctrl.convertTextMode(layer, 'point');
    expect(res).toBe('point');
    expect(layer.params.textMode).toBe('point');
    const lines = new Set(layer.glyphs.map((g) => g.lineIndex)).size;
    expect(lines).toBe(1); // no wrap in point mode
  });

  test("'toggle' flips the current mode", () => {
    const { ctrl, layer } = setup();
    expect(ctrl.convertTextMode(layer, 'toggle', { width: 60, height: 40 })).toBe('area');
    expect(ctrl.convertTextMode(layer, 'toggle')).toBe('point');
  });

  test('converting to the current mode is a no-op (null)', () => {
    const { ctrl, layer, history } = setup();
    const h0 = history.length;
    expect(ctrl.convertTextMode(layer, 'point')).toBe(null);
    expect(history.length).toBe(h0); // no history pushed
  });

  test('default frame dims when none supplied (derived from fontSize)', () => {
    const { ctrl, layer } = setup();
    ctrl.convertTextMode(layer, 'area');
    expect(layer.params.frameWidth).toBeGreaterThan(0);
    expect(layer.params.frameHeight).toBeGreaterThan(0);
  });
});
