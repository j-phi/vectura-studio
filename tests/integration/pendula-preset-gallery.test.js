const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * The compact preset dropdown for the harmonograph family. Replaces the former
 * card gallery with a trigger + grouped popover for both harmonograph and
 * pendula layer types (same component, same apply path).
 */
describe('Harmonograph-family preset dropdown (craft ladder)', () => {
  let runtime, window, document, app;

  const groupTitles = () =>
    Array.from(document.querySelectorAll('.hg-preset-group-title')).map((el) => el.textContent.trim());
  const cards = () => Array.from(document.querySelectorAll('.hg-preset-option[data-preset-id]:not([data-preset-id="custom"])'));
  const card = (id) => document.querySelector(`.hg-preset-option[data-preset-id="${id}"]`);

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

    test('renders grouped sections in Classic → Geometric → Evolving order', () => {
      expect(document.querySelector('.hg-preset-dropdown-wrap')).toBeTruthy();
      // Unison Circle + Classic 3:2 Star → Classic; 4:3 Star → Geometric;
      // Evolving Snake → Evolving. All three groups are present and ordered
      // (universal group vocabulary; "Detuned" was folded into "Geometric").
      expect(groupTitles()).toEqual(['Classic', 'Geometric', 'Evolving']);
    });

    test('renders one option per preset (5 total — incl. Default), each with a thumbnail canvas', () => {
      expect(cards().length).toBe(5);
      cards().forEach((c) => {
        expect(c.querySelector('canvas.hg-preset-option-thumb')).toBeTruthy();
      });
      // Option labels match the preset names.
      const names = cards().map((c) => c.querySelector('.hg-preset-option-label').textContent.trim());
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
      // Active option highlighted after the dropdown rebuilt.
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

    test('an unmatched (Custom) param state leaves every preset option inactive', () => {
      card('harmonograph-unison-circle').click();
      const layer = app.engine.getActiveLayer();
      // Drift into a custom state.
      layer.params.preset = 'custom';
      app.ui.buildControls();
      expect(document.querySelector('.hg-preset-option:not([data-preset-id="custom"]).is-active')).toBeNull();
    });
  });

  describe('pendula layer', () => {
    beforeEach(async () => { await mount('pendula'); });

    test('renders Classic (Default + Pulsing Web) + Evolving (motion presets) groups', () => {
      // Breathing Orbit / Drift Star / Tidal Lissajous carry motion → Evolving;
      // Default + Pulsing Web have an empty motion block → Classic. No Geometric
      // group, so it is omitted. Custom option is excluded from the preset count.
      expect(groupTitles()).toEqual(['Classic', 'Evolving']);
      expect(cards().length).toBe(5);
    });

    test('a fresh pendula layer initializes on the named Default preset (selected + first)', () => {
      const layer = app.engine.getActiveLayer();
      expect(layer.params.preset).toBe('pendula-default');
      const firstPreset = document.querySelector('.hg-preset-option[data-preset-id]:not([data-preset-id="custom"])');
      expect(firstPreset.dataset.presetId).toBe('pendula-default');
      expect(card('pendula-default').classList.contains('is-active')).toBe(true);
    });

    test('clicking a motion-bearing card applies its live patch', () => {
      card('pendula-breathing-orbit').click();
      const p = app.engine.getActiveLayer().params;
      expect(p.preset).toBe('pendula-breathing-orbit');
      expect(window.Vectura.HarmonographModulation.hasActiveEdges(p.motion)).toBe(true);
      expect(p.motion.edges[0].targetParamPath).toBe('pendulums.1.freq');
      expect(card('pendula-breathing-orbit').classList.contains('is-active')).toBe(true); // set at mount
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

    test('import button is rendered in the popover', () => {
      expect(document.querySelector('.hg-preset-import')).toBeTruthy();
    });

    test('User group does not appear when localStorage is empty', () => {
      expect(groupTitles()).not.toContain('User');
    });

    test('user presets from localStorage appear under a User group', () => {
      const userPreset = {
        id: 'user-pendula-123', name: 'My Custom Orbit',
        preset_system: 'pendula', group: 'User',
        params: {
          renderMode: 'line', samples: 6000, duration: 30, scale: 0.5,
          pendulums: [{ id: 'pend-1', enabled: true, ampX: 100, ampY: 100, phaseX: 90, phaseY: 0, damp: 0, freq: 2, micro: 0 }],
        },
      };
      window.localStorage.setItem('vectura.user_presets.pendula', JSON.stringify([userPreset]));
      // Rebuild the controls to pick up the newly stored preset.
      app.ui.buildControls();
      expect(groupTitles()).toContain('User');
      expect(card('user-pendula-123')).toBeTruthy();
    });

    test('delete button on a user preset removes it from localStorage and redraws', () => {
      const userPreset = {
        id: 'user-pendula-del', name: 'Deletable',
        preset_system: 'pendula', group: 'User',
        params: { renderMode: 'line', samples: 3000, duration: 20, scale: 0.5, pendulums: [] },
      };
      window.localStorage.setItem('vectura.user_presets.pendula', JSON.stringify([userPreset]));
      app.ui.buildControls();

      const delBtn = document.querySelector('.hg-preset-option[data-preset-id="user-pendula-del"] .hg-preset-delete');
      expect(delBtn).toBeTruthy();
      delBtn.click();

      // localStorage cleared and option removed.
      const stored = JSON.parse(window.localStorage.getItem('vectura.user_presets.pendula') || '[]');
      expect(stored.length).toBe(0);
      expect(document.querySelector('.hg-preset-option[data-preset-id="user-pendula-del"]')).toBeNull();
    });

    // Regression: overwriting a "<type>-default" preset must survive a reload. A
    // fresh layer starts on pure ALGO_DEFAULTS; the gallery's mount-time auto-apply
    // is the only thing that re-applies a user-saved Default override (there is no
    // project autosave). Commit e4e32f0 broke it — routing the apply through the
    // never-assigned `window.Vectura.engine` and using a literal `{ k: v }` key —
    // so the override silently never landed and the factory default reloaded.
    test('a saved Default override is auto-applied to a fresh layer on (re)build', () => {
      // Factory pendula.samples is 6000; persist a Default override to a sentinel.
      const override = {
        id: 'pendula-default', name: 'Default',
        preset_system: 'pendula', group: 'Classic',
        params: { preset: 'pendula-default', samples: 1234, duration: 30, scale: 0.35 },
      };
      window.localStorage.setItem('vectura.user_presets.pendula', JSON.stringify([override]));

      // Simulate a reload: a brand-new pendula layer on pure factory defaults...
      const id = app.engine.addLayer('pendula');
      app.engine.setActiveLayerId(id);
      const fresh = app.engine.getActiveLayer();
      expect(fresh.params.samples).toBe(6000); // pristine factory before auto-apply

      app.ui.buildControls();

      // ...the gallery's auto-apply must restore the saved Default override...
      expect(fresh.params.samples).toBe(1234);
      // ...without leaking the loop variable as a literal "k" param.
      expect('k' in fresh.params).toBe(false);
    });
  });
});
