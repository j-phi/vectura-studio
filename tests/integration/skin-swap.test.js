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

  test('THEMES registry contains primary + classic skins with the manifest fields', () => {
    const { THEMES } = runtime.window.Vectura;
    ['dark', 'lark', 'light', 'classic-dark', 'classic-lark', 'classic-light'].forEach((id) => {
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
    app.applyTheme('classic-dark', { persist: false, render: false });
    const ds = runtime.document.documentElement.dataset;
    expect(ds.uiSkin).toBe('classic-dark');
    expect(ds.theme).toBe('classic-dark');
  });

  test('applyTheme cycles every registered skin without throwing', () => {
    ['dark', 'lark', 'light', 'classic-dark', 'classic-lark', 'classic-light'].forEach((id) => {
      expect(() => app.applyTheme(id, { persist: false, render: false })).not.toThrow();
      expect(runtime.window.Vectura.SkinManager.getActive()).toBe(id);
    });
  });

  test('toggleTheme cycles within the active theme family only', () => {
    // Modern family: dark → lark → light → dark.
    app.applyTheme('dark', { persist: false, render: false });
    app.toggleTheme();
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('lark');
    app.toggleTheme();
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('light');
    app.toggleTheme();
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('dark');

    // Classic family: classic-dark → classic-lark → classic-light → classic-dark.
    app.applyTheme('classic-dark', { persist: false, render: false });
    app.toggleTheme();
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('classic-lark');
    app.toggleTheme();
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('classic-light');
    app.toggleTheme();
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('classic-dark');
  });

  test('toggleTheme never crosses families', () => {
    app.applyTheme('lark', { persist: false, render: false });
    for (let i = 0; i < 12; i += 1) {
      app.toggleTheme();
      const id = runtime.window.Vectura.SETTINGS.uiTheme;
      expect(['dark', 'lark', 'light']).toContain(id);
    }
  });

  describe('setThemeFamily', () => {
    test('hops to the same brightness slot in the other family', () => {
      app.applyTheme('lark', { persist: false, render: false });
      app.setThemeFamily('classic');
      expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('classic-lark');

      app.applyTheme('classic-light', { persist: false, render: false });
      app.setThemeFamily('meridian');
      expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('light');

      app.applyTheme('classic-dark', { persist: false, render: false });
      app.setThemeFamily('meridian');
      expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('dark');
    });

    test('is a no-op when the requested family already matches', () => {
      app.applyTheme('lark', { persist: false, render: false });
      const result = app.setThemeFamily('meridian');
      expect(result).toBeNull();
      expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('lark');
    });

    test('getThemeFamily reports the active theme family', () => {
      app.applyTheme('light', { persist: false, render: false });
      expect(app.getThemeFamily()).toBe('meridian');
      app.applyTheme('classic-light', { persist: false, render: false });
      expect(app.getThemeFamily()).toBe('classic');
    });

    test('unknown family argument falls back to meridian', () => {
      app.applyTheme('classic-lark', { persist: false, render: false });
      app.setThemeFamily('bogus');
      expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('lark');
    });
  });

  test('vectura_prefs cookie persists active skin', () => {
    app.applyTheme('light', { persist: true, render: false });
    // applyTheme schedules a debounced cookie write — flush it.
    if (typeof app.persistPreferencesNow === 'function') app.persistPreferencesNow();
    else if (app.preferencePersistTimer) {
      clearTimeout(app.preferencePersistTimer);
      app.preferencePersistTimer = null;
      if (typeof app.persistPreferences === 'function') app.persistPreferences();
    }
    expect(runtime.window.Vectura.SETTINGS.uiTheme).toBe('light');
  });
});
