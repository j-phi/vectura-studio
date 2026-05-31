const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Pendula = the new kinetic-harmonograph studio algorithm, registered in
 * parallel with (and delegating its static render to) harmonograph.
 */
describe('Pendula algorithm — registration & render', () => {
  let runtime, window, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('pendula is registered in the algorithm registry and defaults', () => {
    expect(typeof window.Vectura.Algorithms.pendula?.generate).toBe('function');
    expect(typeof window.Vectura.Algorithms.pendula?.formula).toBe('function');
    const def = window.Vectura.ALGO_DEFAULTS.pendula;
    expect(def).toBeTruthy();
    expect(def.label).toBe('Pendula');
    expect(def.preset).toBe('custom');
    expect(def.motion).toEqual({ sources: [], edges: [] });
    expect(Array.isArray(def.pendulums)).toBe(true);
  });

  test('the primary algorithm dropdown auto-includes Pendula (derived from ALGO_DEFAULTS)', () => {
    const select = runtime.document.getElementById('generator-module');
    expect(select).toBeTruthy();
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain('pendula');
  });

  test('a pendula layer generates a real figure (delegates to the harmonograph renderer)', () => {
    app.engine.addLayer('pendula');
    const layer = app.engine.getActiveLayer();
    expect(layer.type).toBe('pendula');
    app.engine.generate(layer.id);
    const paths = layer.paths || layer.sourcePaths || [];
    expect(paths.length).toBeGreaterThan(0);
    const pts = paths[0];
    expect(Array.isArray(pts)).toBe(true);
    expect(pts.length).toBeGreaterThan(10);
  });

  test('pendula and harmonograph render identically for identical params (true delegation)', () => {
    const params = window.Vectura.ALGO_DEFAULTS.pendula;
    const rng = { nextFloat: () => 0.5, next: () => 0.5 };
    const bounds = { width: 800, height: 600 };
    const a = window.Vectura.Algorithms.pendula.generate(JSON.parse(JSON.stringify(params)), rng, null, bounds);
    const b = window.Vectura.Algorithms.harmonograph.generate(JSON.parse(JSON.stringify(params)), rng, null, bounds);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('Pendula — LFOs reach the final algorithm output (Bug B)', () => {
  let runtime, window, app;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('a pendula layer with an active LFO edge produces DIFFERENT geometry than with motion stripped', () => {
    app.engine.addLayer('pendula');
    const layer = app.engine.getActiveLayer();
    // strong, unambiguous edge: sine LFO on overall scale
    layer.params.scale = 0.5;
    layer.params.motion = {
      sources: [{ id: 's', shape: 'sine', syncMode: 'sync', rate: 1, depth: 1, phase: 0, polarity: 'bi', enabled: true }],
      edges: [{ id: 'e', sourceId: 's', targetParamPath: 'scale', amount: 0.4 }],
    };
    app.engine.generate(layer.id);
    const withMotion = JSON.stringify(layer.paths || layer.sourcePaths);
    layer.params.motion = { sources: [], edges: [] };
    app.engine.generate(layer.id);
    const without = JSON.stringify(layer.paths || layer.sourcePaths);
    expect(withMotion).not.toBe(without); // the LFO is baked into the exported geometry
  });
});
