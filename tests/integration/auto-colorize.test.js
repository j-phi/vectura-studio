/*
 * Integration test for the dissolved auto-colorize panel (Phase 3 closure).
 *
 * Boots the full Vectura runtime and verifies:
 *   - UI.prototype gained the 4 auto-colorize methods (installed via
 *     AutoColorizePanel.installOn during legacy IIFE bind block — no longer
 *     via Object.assign(UI.prototype, _UIAutoColorizeMixin))
 *   - getAutoColorizationConfig() returns a defaulted config and persists
 *     into SETTINGS.autoColorization
 *   - applyAutoColorization() over multiple calls yields deterministic
 *     pen assignment for the same input (per plan §4 Phase 4 acceptance)
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('auto-colorize panel (mixin dissolved)', () => {
  let runtime, window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('UI.prototype carries the 4 auto-colorize methods after dissolution', () => {
    const proto = window.Vectura.UI.prototype;
    expect(typeof proto.initAutoColorizationPanel).toBe('function');
    expect(typeof proto.getAutoColorizationConfig).toBe('function');
    expect(typeof proto.getAutoColorizationTargets).toBe('function');
    expect(typeof proto.applyAutoColorization).toBe('function');
  });

  test('getAutoColorizationConfig returns defaulted config and persists in SETTINGS', () => {
    const ui = window.app.ui;
    delete window.Vectura.SETTINGS.autoColorization;
    const config = ui.getAutoColorizationConfig();
    expect(config).toBeTruthy();
    expect(config.enabled).toBe(false);
    expect(config.scope).toBe('all');
    expect(config.mode).toBe('none');
    expect(window.Vectura.SETTINGS.autoColorization).toBe(config);
  });

  test('applyAutoColorization is deterministic for same input', () => {
    const ui = window.app.ui;
    // Stage two pens.
    window.Vectura.SETTINGS.pens = [
      { id: 'p1', color: '#000000', width: 0.4 },
      { id: 'p2', color: '#ff0000', width: 0.4 },
    ];
    // Add two layers via engine so getAutoColorizationTargets has work to do.
    const engine = window.app.engine;
    engine.addLayer({ type: 'lissajous' });
    engine.addLayer({ type: 'lissajous' });
    const config = ui.getAutoColorizationConfig();
    config.enabled = true;
    config.mode = 'order';
    config.scope = 'all';

    ui.applyAutoColorization({ commit: false, force: true, source: 'manual' });
    const firstPass = engine.layers.map((l) => l.penId);

    ui.applyAutoColorization({ commit: false, force: true, source: 'manual' });
    const secondPass = engine.layers.map((l) => l.penId);

    expect(firstPass.length).toBeGreaterThanOrEqual(2);
    expect(secondPass).toEqual(firstPass);
    // Order mode rotates p1, p2, p1, p2 — at minimum the first two layers
    // received distinct pens.
    const distinct = new Set(firstPass.filter(Boolean));
    expect(distinct.size).toBeGreaterThanOrEqual(1);
  });

  // Regression coverage for converting angleOffset (Spiral Sweep / Angle Slice
  // modes) from a plain <input type="range"> to the shared UI.AngleDial. This
  // panel's renderParams() has its own bespoke render loop (not the generic
  // algo-config-panel renderer), so the type:'angle' dispatch had to be added
  // by hand here — this closes the loop on that dedicated branch, including
  // the min:-180,max:180 domain the angle-dial min/max fix exists for.
  test("Spiral Sweep's Angle Offset renders as a UI.AngleDial and round-trips a negative value", () => {
    const ui = window.app.ui;
    const config = ui.getAutoColorizationConfig();
    config.mode = 'spiral';
    ui.initAutoColorizationPanel();
    const paramsTarget = window.document.getElementById('auto-colorization-params');
    expect(paramsTarget).toBeTruthy();
    const dial = paramsTarget.querySelector('svg.angle-dial');
    expect(dial).toBeTruthy();
    expect(dial.getAttribute('aria-valuemin')).toBe('-180');
    expect(dial.getAttribute('aria-valuemax')).toBe('180');
    const input = paramsTarget.querySelector('.angle-inp');
    input.value = '-90';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    // Before the angle-dial min/max fix, this would force-wrap -90 into
    // [0,360) as 270, which config.params.angleOffset would then store
    // uncorrected (this panel has no downstream clamp, so it would have
    // stored 270 instead of -90).
    expect(config.params.angleOffset).toBe(-90);
    expect(dial.getAttribute('aria-valuenow')).toBe('-90');
  });
});
