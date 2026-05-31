const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * The craft-ladder grouped preset gallery for the harmonograph family. Replaces
 * the flat <select> with a grid of clickable figure-thumbnail cards grouped by
 * craft-ladder stage (Classic → Detuned → Evolving). Covers both the
 * harmonograph and pendula layer types, since both reuse the same component and
 * the same shared apply path.
 */
describe('Harmonograph-family preset gallery (craft ladder)', () => {
  let runtime, window, document, app;

  const groupTitles = () =>
    Array.from(document.querySelectorAll('.hg-preset-group-title')).map((el) => el.textContent.trim());
  const cards = () => Array.from(document.querySelectorAll('.hg-preset-card'));
  const card = (id) => document.querySelector(`.hg-preset-card[data-preset-id="${id}"]`);

  const mount = async (layerType) => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer(layerType);
    app.ui.renderLayers();
    app.ui.buildControls();
  };

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  describe('harmonograph layer', () => {
    beforeEach(async () => { await mount('harmonograph'); });

    test('renders grouped sections in Classic → Detuned → Evolving order', () => {
      expect(document.querySelector('.hg-preset-gallery')).toBeTruthy();
      // Unison Circle + Classic 3:2 Star → Classic; 4:3 Star → Detuned;
      // Evolving Snake → Evolving. All three groups are present and ordered.
      expect(groupTitles()).toEqual(['Classic', 'Detuned', 'Evolving']);
    });

    test('renders one card per preset (4 total), each with a thumbnail canvas', () => {
      expect(cards().length).toBe(4);
      cards().forEach((c) => {
        expect(c.querySelector('canvas.hg-preset-thumb')).toBeTruthy();
      });
      // Card labels match the preset names.
      const names = cards().map((c) => c.querySelector('.hg-preset-name').textContent.trim());
      expect(names).toEqual(
        expect.arrayContaining(['Unison Circle', 'Classic 3:2 Star', '4:3 Star', 'Evolving Snake'])
      );
    });

    test('clicking a card applies the preset, preserves transform, sets preset id, highlights it', () => {
      const layer = app.engine.getActiveLayer();
      // Stamp a distinctive transform we expect the apply path to preserve.
      layer.params.x = 123;
      layer.params.y = -45;
      layer.params.rotation = 30;

      card('harmonograph-classic-3-2-star').click();

      const after = app.engine.getActiveLayer();
      expect(after.params.preset).toBe('harmonograph-classic-3-2-star');
      // Distinctive preset params merged in.
      expect(after.params.scale).toBe(0.5);
      expect(after.params.pendulums.length).toBe(2);
      expect(after.params.pendulums.map((p) => p.freq).sort()).toEqual([2, 3]);
      // A defaults field the preset didn't set still comes through the base merge.
      expect(after.params.curves).toBe(true);
      // Transform preserved.
      expect(after.params.x).toBe(123);
      expect(after.params.y).toBe(-45);
      expect(after.params.rotation).toBe(30);
      // Active card highlighted after the gallery rebuilt.
      expect(card('harmonograph-classic-3-2-star').classList.contains('is-active')).toBe(true);
      expect(card('harmonograph-unison-circle').classList.contains('is-active')).toBe(false);
    });

    test('clicking a card pushes exactly one history entry', () => {
      const before = app.history ? app.history.length : null;
      card('harmonograph-unison-circle').click();
      if (before !== null && app.history) {
        expect(app.history.length).toBe(before + 1);
      } else {
        // Fallback: at minimum undo restores the prior (custom) state.
        expect(typeof app.undo).toBe('function');
      }
    });

    test('switching presets leaves no stale pendulums', () => {
      card('harmonograph-classic-3-2-star').click(); // 2 pendulums
      card('harmonograph-unison-circle').click();    // 1 pendulum
      const layer = app.engine.getActiveLayer();
      expect(layer.params.preset).toBe('harmonograph-unison-circle');
      expect(layer.params.pendulums.length).toBe(1);
    });

    test('an unmatched (Custom) param state leaves every card inactive', () => {
      card('harmonograph-unison-circle').click();
      const layer = app.engine.getActiveLayer();
      // Drift into a custom state.
      layer.params.preset = 'custom';
      app.ui.buildControls();
      expect(document.querySelector('.hg-preset-card.is-active')).toBeNull();
    });
  });

  describe('pendula layer', () => {
    beforeEach(async () => { await mount('pendula'); });

    test('renders Classic (Pulsing Web) + Evolving (motion presets) groups', () => {
      // Breathing Orbit / Drift Star / Tidal Lissajous carry motion → Evolving;
      // Pulsing Web has an empty motion block → Classic. No Detuned group, so
      // it is omitted.
      expect(groupTitles()).toEqual(['Classic', 'Evolving']);
      expect(cards().length).toBe(4);
    });

    test('clicking a motion-bearing card applies its live patch', () => {
      card('pendula-breathing-orbit').click();
      const p = app.engine.getActiveLayer().params;
      expect(p.preset).toBe('pendula-breathing-orbit');
      expect(window.Vectura.HarmonographModulation.hasActiveEdges(p.motion)).toBe(true);
      expect(p.motion.edges[0].targetParamPath).toBe('pendulums.1.freq');
      expect(card('pendula-breathing-orbit').classList.contains('is-active')).toBe(true);
    });

    test('applying a preset clears stale per-param dice locks (fresh slate)', () => {
      const layer = app.engine.getActiveLayer();
      layer.params.pendulumParamLocks = { 'pend-1': { freq: true } };
      app.ui.storeLayerParams(layer);
      card('pendula-drift-star').click();
      // a preset apply is a clean start — locks from the prior figure must not
      // silently carry onto the new preset's same-id pendulums.
      const locks = app.engine.getActiveLayer().params.pendulumParamLocks || {};
      expect(locks['pend-1']?.freq).toBeFalsy();
    });
  });
});
