const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Pendula studio UI: the harmonograph control panel + a Motion Rack, with its
 * own preset gallery (some presets ship pre-wired LFO patches).
 */
describe('Pendula studio — controls, presets, Motion Rack', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer('pendula');
    app.ui.renderLayers();
    app.ui.buildControls();
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const layer = () => app.engine.getActiveLayer();
  const presetSelect = () => Array.from(document.querySelectorAll('select')).find((s) =>
    Array.from(s.options).some((o) => o.value === 'pendula-breathing-orbit'));

  test('the pendula preset library is filtered from PRESETS (4 presets)', () => {
    const lib = window.Vectura.PresetLibraries.pendula;
    expect(lib.length).toBe(4);
    expect(lib.map((p) => p.id)).toEqual(expect.arrayContaining([
      'pendula-breathing-orbit', 'pendula-drift-star', 'pendula-tidal-lissajous', 'pendula-pulsing-web',
    ]));
    expect(lib.every((p) => p.preset_system === 'pendula')).toBe(true);
  });

  test('pendula panel renders the preset selector, the virtual plotter, and the Motion Rack', () => {
    expect(presetSelect()).toBeTruthy();
    expect(document.querySelector('.harmonograph-plotter')).toBeTruthy(); // reused live plotter
    expect(document.querySelector('.motion-rack')).toBeTruthy();
    expect(document.querySelector('.motion-add-lfo')).toBeTruthy();
  });

  test('applying a motion-bearing preset wires up a live patch (Breathing Orbit)', () => {
    const sel = presetSelect();
    sel.value = 'pendula-breathing-orbit';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const p = layer().params;
    expect(p.preset).toBe('pendula-breathing-orbit');
    expect(window.Vectura.HarmonographModulation.hasActiveEdges(p.motion)).toBe(true);
    expect(p.motion.edges[0].targetParamPath).toBe('pendulums.1.freq');
  });

  test('every pendula preset evaluates to a real figure; motion ones actually evolve', () => {
    const core = window.Vectura.HarmonographCore;
    const mod = window.Vectura.HarmonographModulation;
    window.Vectura.PresetLibraries.pendula.forEach((preset) => {
      const params = { ...window.Vectura.ALGO_DEFAULTS.pendula, ...preset.params };
      const { path } = core.evaluatePath(params, { sampleCap: 1200 });
      const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
      expect(Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeGreaterThan(1);
      if (mod.hasActiveEdges(params.motion)) {
        const dur = params.duration || 30;
        const a = core.evaluatePath(mod.applyModulation(params, params.motion, dur * 0.25, dur), { sampleCap: 1200 }).path;
        const b = core.evaluatePath(mod.applyModulation(params, params.motion, dur * 0.75, dur), { sampleCap: 1200 }).path;
        let maxDelta = 0;
        for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
          maxDelta = Math.max(maxDelta, Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y));
        }
        expect(maxDelta).toBeGreaterThan(1);
      }
    });
  });

  test('Motion Rack on a pendula layer: add LFO + assign creates an edge', () => {
    document.querySelector('.motion-add-lfo').click();
    expect(layer().params.motion.sources.length).toBe(1);
    const tgt = document.querySelector('.motion-assign-target');
    tgt.value = 'pendulums.0.freq';
    document.querySelector('.motion-assign-add').click();
    expect(layer().params.motion.edges.length).toBe(1);
    expect(layer().params.motion.edges[0].targetParamPath).toBe('pendulums.0.freq');
  });

  test('Motion Rack: "+ Macro" adds a macro source with a value control and no shape selector', () => {
    document.querySelector('.motion-add-macro').click();
    const sources = layer().params.motion.sources;
    expect(sources.length).toBe(1);
    expect(sources[0].type).toBe('macro');
    expect(typeof sources[0].value).toBe('number');
    const card = document.querySelector('.motion-macro-card');
    expect(card).toBeTruthy();
    expect(card.querySelector('.motion-macro-value')).toBeTruthy();
    expect(card.querySelector('.motion-lfo-shape')).toBeNull();
  });

  test('Motion Rack: a macro can be assigned to a param edge like any other source', () => {
    document.querySelector('.motion-add-macro').click();
    const tgt = document.querySelector('.motion-macro-card .motion-assign-target');
    tgt.value = 'scale';
    document.querySelector('.motion-macro-card .motion-assign-add').click();
    const edges = layer().params.motion.edges;
    expect(edges.length).toBe(1);
    expect(edges[0].sourceId).toBe(layer().params.motion.sources[0].id);
    expect(edges[0].targetParamPath).toBe('scale');
  });

  test('Motion Rack: selecting shape "drawn" mounts the curve editor and seeds points', () => {
    document.querySelector('.motion-add-lfo').click();
    const shapeSel = document.querySelector('.motion-lfo-shape');
    expect(Array.from(shapeSel.options).some((o) => o.value === 'drawn')).toBe(true);
    shapeSel.value = 'drawn';
    shapeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(layer().params.motion.sources[0].shape).toBe('drawn');
    expect(Array.isArray(layer().params.motion.sources[0].points)).toBe(true);
    expect(layer().params.motion.sources[0].points.length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('.motion-drawn-editor')).toBeTruthy();
  });

  test('Motion Rack: macro and drawn sources serialize into layer.params.motion', () => {
    document.querySelector('.motion-add-macro').click();
    document.querySelector('.motion-add-lfo').click();
    const shapeSel = document.querySelectorAll('.motion-lfo-shape')[0];
    shapeSel.value = 'drawn';
    shapeSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    const serialized = JSON.parse(JSON.stringify(layer().params.motion));
    expect(serialized.sources.some((s) => s.type === 'macro')).toBe(true);
    const drawn = serialized.sources.find((s) => s.shape === 'drawn');
    expect(drawn).toBeTruthy();
    expect(Array.isArray(drawn.points)).toBe(true);
  });

  test('harmonograph is left untouched — no Motion Rack on a harmonograph layer', () => {
    app.engine.addLayer('harmonograph');
    app.ui.renderLayers();
    app.ui.buildControls();
    expect(document.querySelector('.motion-rack')).toBeNull();
    // but its plotter still mounts
    expect(document.querySelector('.harmonograph-plotter')).toBeTruthy();
  });
});
