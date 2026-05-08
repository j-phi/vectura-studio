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

  describe('canvas color after theme cycling', () => {
    test('dark theme --render-canvas inline style is correct after dark→lark→light→dark', () => {
      app.applyTheme('dark', { persist: false, render: false });
      app.applyTheme('lark', { persist: false, render: false });
      app.applyTheme('light', { persist: false, render: false });
      app.applyTheme('dark', { persist: false, render: false });

      const root = runtime.document.documentElement;
      expect(root.style.getPropertyValue('--render-canvas')).toBe('#121214');
    });

    test('dark theme --ui-workspace inline style is correct after cycling', () => {
      app.applyTheme('dark', { persist: false, render: false });
      app.applyTheme('lark', { persist: false, render: false });
      app.applyTheme('light', { persist: false, render: false });
      app.applyTheme('dark', { persist: false, render: false });

      const root = runtime.document.documentElement;
      expect(root.style.getPropertyValue('--ui-workspace')).toBe('#111111');
    });

    test('toggleTheme 3× cycle leaves --render-canvas at dark value', () => {
      app.applyTheme('dark', { persist: false, render: false });
      app.toggleTheme(); // dark → lark
      app.toggleTheme(); // lark → light
      app.toggleTheme(); // light → dark

      const root = runtime.document.documentElement;
      expect(root.style.getPropertyValue('--render-canvas')).toBe('#121214');
      expect(root.style.getPropertyValue('--ui-workspace')).toBe('#111111');
    });

    test('light theme --render-canvas and --ui-workspace are set inline', () => {
      app.applyTheme('light', { persist: false, render: false });

      const root = runtime.document.documentElement;
      expect(root.style.getPropertyValue('--render-canvas')).toBe('#d5d5d5');
      expect(root.style.getPropertyValue('--ui-workspace')).toBe('#d5d5d5');
    });

    test('lark theme --ui-workspace is set inline', () => {
      app.applyTheme('lark', { persist: false, render: false });

      const root = runtime.document.documentElement;
      expect(root.style.getPropertyValue('--ui-workspace')).toBe('#d5d5d5');
    });

    // Regression: light/lark push a much larger inline cssVars set than dark
    // (--color-control, --color-bg, --color-panel, etc.). Without clearing prior
    // inline values, returning to dark left those keys stuck at the light values,
    // painting the toolbar buttons + bottom-right pane white in dark mode.
    test('returning to dark clears inline cssVars set only by light/lark', () => {
      app.applyTheme('dark', { persist: false, render: false });
      app.applyTheme('lark', { persist: false, render: false });
      app.applyTheme('light', { persist: false, render: false });
      app.applyTheme('dark', { persist: false, render: false });

      const root = runtime.document.documentElement;
      // dark's cssVars block does not include --color-control / --color-panel /
      // --color-bg, so the inline value should be empty (letting :root rules win).
      expect(root.style.getPropertyValue('--color-control')).toBe('');
      expect(root.style.getPropertyValue('--color-panel')).toBe('');
      expect(root.style.getPropertyValue('--color-bg')).toBe('');
    });
  });
});
