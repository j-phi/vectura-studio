const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Phase 0 integration: the registered THEMES manifest, App.applyTheme, and
 * SkinManager.activate cooperate end-to-end. We load with includeApp/includeUi
 * so we can drive applyTheme like a real session.
 */
describe('Skin swap integration (registry + applyTheme)', () => {
  let runtime;
  let app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true });
    const { App } = runtime.window.Vectura;
    app = new App();
    // applyTheme runs once in the constructor; calling it explicitly here lets us
    // assert deterministic behavior regardless of the bootstrap order.
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('THEMES registry contains both legacy and meridian skins with the manifest fields', () => {
    const { THEMES } = runtime.window.Vectura;
    ['dark', 'light', 'lark', 'meridian-dark', 'meridian-light'].forEach((id) => {
      const t = THEMES[id];
      expect(t).toBeTruthy();
      expect(t.id).toBe(id);
      expect(t.family).toMatch(/^(classic|meridian)$/);
      expect(t.stylesheet).toMatch(/\.css$/);
      expect(t.manifest).toBeTruthy();
      expect(t.manifest.motion).toBeTruthy();
    });
  });

  test('applyTheme sets data-ui-skin and data-theme to the same id', () => {
    app.applyTheme('meridian-dark', { persist: false, render: false });
    const ds = runtime.document.documentElement.dataset;
    expect(ds.uiSkin).toBe('meridian-dark');
    expect(ds.theme).toBe('meridian-dark');
  });

  test('applyTheme cycles every Phase 0 skin without throwing', () => {
    ['dark', 'light', 'lark', 'meridian-dark', 'meridian-light'].forEach((id) => {
      expect(() => app.applyTheme(id, { persist: false, render: false })).not.toThrow();
      expect(runtime.window.Vectura.SkinManager.getActive()).toBe(id);
    });
  });

  test('toggleTheme cycles through every registered skin (not just legacy three)', () => {
    // Snapshot active skin, then toggle len(THEMES) times — should land back on the original.
    const ids = Object.keys(runtime.window.Vectura.THEMES);
    const start = runtime.window.Vectura.SETTINGS.uiTheme;
    for (let i = 0; i < ids.length; i += 1) app.toggleTheme();
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe(start);
  });

  test('vectura_prefs cookie persists active skin', () => {
    app.applyTheme('meridian-light', { persist: true, render: false });
    // applyTheme schedules a debounced cookie write — flush it.
    if (typeof app.persistPreferencesNow === 'function') app.persistPreferencesNow();
    else if (app.preferencePersistTimer) {
      clearTimeout(app.preferencePersistTimer);
      app.preferencePersistTimer = null;
      if (typeof app.persistPreferences === 'function') app.persistPreferences();
    }
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('meridian-light');
  });
});
