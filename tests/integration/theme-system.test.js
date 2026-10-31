/*
 * "System" theme state: the theme rotation is dark -> lark -> light -> system -> dark (within the active skin
 * family). System follows prefers-color-scheme live (light OS -> the family's light theme, dark OS -> its dark
 * theme), is persisted as SETTINGS.uiThemeSystem in the preference snapshot, and is shown by BOTH selectors (the
 * editor header #theme-toggle and the Start Page header toggle) with the same state, label and icon.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const tick = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('System theme state', () => {
  let runtime;
  let window;
  let document;
  let app;
  let SETTINGS;
  let os;

  // A controllable prefers-color-scheme: the app asks for (prefers-color-scheme: dark).
  const installOs = (dark) => {
    const listeners = new Set();
    os = {
      dark,
      listeners,
      flip(nextDark) {
        os.dark = nextDark;
        listeners.forEach((fn) => fn({ matches: nextDark, media: '(prefers-color-scheme: dark)' }));
      },
    };
    window.matchMedia = (query) => {
      const q = `${query}`;
      const isDark = /prefers-color-scheme:\s*dark/.test(q);
      const isLight = /prefers-color-scheme:\s*light/.test(q);
      return {
        get matches() { return isDark ? os.dark : isLight ? !os.dark : false; },
        media: q,
        addEventListener: (type, fn) => { if (type === 'change' && (isDark || isLight)) listeners.add(fn); },
        removeEventListener: (type, fn) => { if (type === 'change') listeners.delete(fn); },
        addListener: (fn) => { if (isDark || isLight) listeners.add(fn); },
        removeListener: (fn) => listeners.delete(fn),
        dispatchEvent: () => false,
      };
    };
  };

  const boot = async ({ dark = true, prefs = null } = {}) => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    ({ window, document } = runtime);
    installOs(dark);
    if (prefs) window.localStorage.setItem('vectura_prefs', JSON.stringify({ version: 1, data: prefs }));
    app = window.app = new window.Vectura.App();
    SETTINGS = window.Vectura.SETTINGS;
    await tick();
  };

  afterEach(() => {
    try { app?.startPage?.hide?.({ restoreFocus: false }); } catch (_) { /* noop */ }
    runtime?.cleanup?.();
    runtime = null;
  });

  const header = () => document.getElementById('theme-toggle');
  const startToggle = () => document.querySelector('.sp-theme[data-act="theme"]');
  const click = async (el) => { el.click(); await tick(10); };

  describe('rotation and default', () => {
    test('new users keep the explicit Dark default (not System)', async () => {
      await boot({ dark: false });
      expect(SETTINGS.uiTheme).toBe('dark');
      expect(SETTINGS.uiThemeSystem).toBe(false);
      expect(app.getThemeState().mode).toBe('dark');
    });

    test('the header button cycles dark -> lark -> light -> system -> dark', async () => {
      await boot({ dark: true });
      const seen = [app.getThemeState().mode];
      for (let i = 0; i < 4; i += 1) { await click(header()); seen.push(app.getThemeState().mode); }
      expect(seen).toEqual(['dark', 'lark', 'light', 'system', 'dark']);
      expect(SETTINGS.uiThemeSystem).toBe(false);
    });

    test('the classic family rotates the same way and System resolves inside the family', async () => {
      await boot({ dark: true });
      app.setThemeFamily('classic');
      expect(SETTINGS.uiTheme).toBe('classic-dark');
      const seen = [];
      for (let i = 0; i < 3; i += 1) { await click(header()); seen.push(`${SETTINGS.uiTheme}|${app.getThemeState().mode}`); }
      expect(seen).toEqual(['classic-lark|lark', 'classic-light|light', 'classic-dark|system']);
      os.flip(false);
      expect(SETTINGS.uiTheme).toBe('classic-light');
      expect(SETTINGS.uiThemeSystem).toBe(true);
      app.setThemeFamily('meridian');
      expect(SETTINGS.uiTheme).toBe('light');
      expect(SETTINGS.uiThemeSystem).toBe(true);
    });
  });

  describe('following the OS', () => {
    test('System resolves to the dark/light theme for the OS scheme and names state and next in the label', async () => {
      await boot({ dark: false });
      app.setThemeMode('system');
      expect(SETTINGS.uiThemeSystem).toBe(true);
      expect(SETTINGS.uiTheme).toBe('light');
      expect(document.documentElement.dataset.uiSkin).toBe('light');
      expect(header().dataset.activeIcon).toBe('system');
      expect(header().getAttribute('aria-label')).toBe('Theme: System (Light). Switch to Dark theme.');
      expect(header().title).toBe('Theme: System (Light). Switch to Dark theme.');
    });

    test('an OS scheme change re-themes live while System is on, and is ignored otherwise', async () => {
      await boot({ dark: true });
      app.setThemeMode('system');
      expect(SETTINGS.uiTheme).toBe('dark');
      os.flip(false);
      expect(SETTINGS.uiTheme).toBe('light');
      expect(document.documentElement.dataset.uiSkin).toBe('light');
      expect(header().getAttribute('aria-label')).toBe('Theme: System (Light). Switch to Dark theme.');
      os.flip(true);
      expect(SETTINGS.uiTheme).toBe('dark');
      app.setThemeMode('lark');
      expect(SETTINGS.uiThemeSystem).toBe(false);
      os.flip(false);
      expect(SETTINGS.uiTheme).toBe('lark');
    });

    test('the labels name the current and next state for every mode', async () => {
      await boot({ dark: true });
      const labels = [header().getAttribute('aria-label')];
      for (let i = 0; i < 4; i += 1) { await click(header()); labels.push(header().getAttribute('aria-label')); }
      expect(labels).toEqual([
        'Theme: Dark. Switch to Lark theme.',
        'Theme: Lark. Switch to Light theme.',
        'Theme: Light. Switch to System theme.',
        'Theme: System (Dark). Switch to Dark theme.',
        'Theme: Dark. Switch to Lark theme.',
      ]);
    });
  });

  describe('persistence', () => {
    test('the snapshot carries system vs explicit, and applying it restores the mode', async () => {
      await boot({ dark: true });
      app.setThemeMode('system');
      expect(app.getPreferenceSnapshot().uiThemeSystem).toBe(true);
      app.setThemeMode('lark');
      expect(app.getPreferenceSnapshot().uiThemeSystem).toBe(false);
      expect(app.getPreferenceSnapshot().uiTheme).toBe('lark');
    });

    test('a saved System choice re-resolves against the OS at load', async () => {
      await boot({ dark: false, prefs: { uiTheme: 'dark', uiThemeSystem: true, cookiePreferencesEnabled: true } });
      expect(SETTINGS.uiThemeSystem).toBe(true);
      expect(SETTINGS.uiTheme).toBe('light');
      expect(document.documentElement.dataset.uiSkin).toBe('light');
      expect(app.getThemeState().mode).toBe('system');
      os.flip(true);
      expect(SETTINGS.uiTheme).toBe('dark');
    });

    test('a saved explicit theme is not moved by the OS, and a snapshot without the key is explicit', async () => {
      await boot({ dark: false, prefs: { uiTheme: 'lark', cookiePreferencesEnabled: true } });
      expect(SETTINGS.uiThemeSystem).toBe(false);
      expect(SETTINGS.uiTheme).toBe('lark');
    });

    test('junk values for uiThemeSystem are explicit', async () => {
      await boot({ dark: true });
      app.applyPreferenceSnapshot({ uiTheme: 'light', uiThemeSystem: 'yes' });
      expect(SETTINGS.uiThemeSystem).toBe(false);
      expect(SETTINGS.uiTheme).toBe('light');
    });

    test('clearing saved preferences returns to explicit Dark', async () => {
      await boot({ dark: true });
      app.setThemeMode('system');
      app.clearSavedPreferences();
      expect(SETTINGS.uiThemeSystem).toBe(false);
      expect(SETTINGS.uiTheme).toBe('dark');
    });
  });

  describe('both selectors stay in sync', () => {
    const open = async () => { app.startPage.show(); await tick(60); };

    test('the Start Page toggle shows the same state, label and a system icon', async () => {
      await boot({ dark: false });
      await open();
      const sp = startToggle();
      expect(sp).toBeTruthy();
      expect(sp.dataset.mode).toBe('dark');
      expect(sp.getAttribute('aria-label')).toBe(header().getAttribute('aria-label'));
      await click(sp); await click(sp); await click(sp);
      expect(app.getThemeState().mode).toBe('system');
      expect(sp.dataset.mode).toBe('system');
      expect(header().dataset.activeIcon).toBe('system');
      expect(sp.getAttribute('aria-label')).toBe('Theme: System (Light). Switch to Dark theme.');
      expect(sp.title).toBe(sp.getAttribute('aria-label'));
      expect(sp.querySelector('.sp-ico-sun-moon')).toBeTruthy();
      await click(sp);
      expect(sp.dataset.mode).toBe('dark');
      expect(sp.getAttribute('aria-label')).toBe(header().getAttribute('aria-label'));
    });

    test('an OS flip updates the Start Page toggle and its light/dark surface while System is on', async () => {
      await boot({ dark: true });
      await open();
      app.setThemeMode('system');
      await tick(60);
      const root = document.querySelector('.sp');
      expect(root.dataset.light).toBe('false');
      os.flip(false);
      await tick(120);
      expect(root.dataset.light).toBe('true');
      expect(startToggle().getAttribute('aria-label')).toBe('Theme: System (Light). Switch to Dark theme.');
      expect(startToggle().getAttribute('aria-label')).toBe(header().getAttribute('aria-label'));
    });

    test('changing the mode from the header updates an open Start Page toggle', async () => {
      await boot({ dark: true });
      await open();
      await click(header());
      await tick(80);
      expect(startToggle().dataset.mode).toBe('lark');
      expect(startToggle().getAttribute('aria-label')).toBe('Theme: Lark. Switch to Light theme.');
    });
  });

  describe('paper theme-sync rule under System', () => {
    test('a plain sheet in the theme colour follows an OS flip, with Pen 1 staying legible', async () => {
      await boot({ dark: true });
      app.setThemeMode('system');
      const dark = window.Vectura.THEMES.dark.documentBg;
      const light = window.Vectura.THEMES.light.documentBg;
      expect(SETTINGS.bgColor).toBe(dark);
      os.flip(false);
      expect(SETTINGS.bgColor).toBe(light);
      expect(SETTINGS.paper).toMatchObject({ type: 'none', color: light });
      const pen1 = SETTINGS.pens.find((p) => p.id === 'pen-1');
      expect(pen1.color).toBe(window.Vectura.THEMES.light.pen1Color);
      os.flip(true);
      expect(SETTINGS.bgColor).toBe(dark);
    });

    test('a default paper, a textured sheet or a custom plain colour is never recoloured', async () => {
      await boot({ dark: true });
      app.setThemeMode('system');
      const Paper = window.Vectura.Paper;
      Paper.setActive({ ...SETTINGS.paper, type: 'none', color: '#123456' }, { render: false });
      os.flip(false);
      expect(SETTINGS.bgColor).toBe('#123456');
      os.flip(true);
      Paper.setActive({ ...SETTINGS.paper, type: 'none', color: window.Vectura.THEMES.dark.documentBg }, { render: false });
      SETTINGS.paperDefault = Paper.normalize({ ...SETTINGS.paper, color: '#abcdef' });
      os.flip(false);
      expect(SETTINGS.bgColor).toBe(window.Vectura.THEMES.dark.documentBg);
    });
  });
});
