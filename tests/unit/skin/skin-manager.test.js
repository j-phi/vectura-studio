const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

/**
 * Phase 0 unit tests for src/ui/skin/skin-manager.js.
 *
 * The runtime loader executes every <script> from index.html, so once
 * `tokens.js` + `skin-manager.js` are wired in, these tests exercise them via
 * `runtime.window.Vectura.SkinManager`. We avoid loading app.js / ui.js so the
 * tests stay fast and focused on the skin pipeline.
 */
describe('SkinManager', () => {
  let runtime;
  let SkinManager;
  let document;
  let window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ useIndexHtml: true });
    window = runtime.window;
    document = runtime.document;
    SkinManager = runtime.window.Vectura.SkinManager;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  beforeEach(() => {
    // Drop any test-scoped registry pollution between cases.
    Object.keys(runtime.window.Vectura.THEMES).forEach((id) => {
      if (id.startsWith('test-')) delete runtime.window.Vectura.THEMES[id];
    });
    delete document.documentElement.dataset.skinSwapping;
  });

  test('exposes the public API surface', () => {
    expect(typeof SkinManager.register).toBe('function');
    expect(typeof SkinManager.activate).toBe('function');
    expect(typeof SkinManager.getActive).toBe('function');
    expect(typeof SkinManager.list).toBe('function');
    expect(typeof SkinManager.get).toBe('function');
  });

  test('list() includes the six shipping skins', () => {
    const ids = SkinManager.list();
    expect(ids).toEqual(expect.arrayContaining([
      'dark', 'lark', 'light',
      'classic-dark', 'classic-lark', 'classic-light',
    ]));
    expect(ids).not.toContain('meridian-twilight');
  });

  test('register() throws when manifest is missing required fields', () => {
    expect(() => SkinManager.register('test-bad', {})).toThrow();
    expect(() => SkinManager.register('test-bad', { id: 'test-bad', label: 'X' })).toThrow(/cssVars/);
  });

  test('register() throws on duplicate id', () => {
    SkinManager.register('test-dup', { id: 'test-dup', label: 'Dup', cssVars: {} });
    expect(() => SkinManager.register('test-dup', { id: 'test-dup', label: 'Dup', cssVars: {} })).toThrow(/already/);
  });

  test('register() rejects mismatched manifest.id', () => {
    expect(() => SkinManager.register('test-mismatch', { id: 'other', label: 'X', cssVars: {} })).toThrow(/match/);
  });

  test('activate() sets data-ui-skin on documentElement', () => {
    SkinManager.activate('dark');
    expect(document.documentElement.dataset.uiSkin).toBe('dark');
  });

  test('activate() updates link#active-skin href when stylesheet differs', () => {
    const link = document.getElementById('active-skin');
    expect(link).toBeTruthy();
    SkinManager.activate('light');
    // The swap stamps the same ?v=<version> cache-busting query that version:sync
    // applies to the static tags, so the runtime skin swap can't load stale CSS.
    const version = runtime.window.Vectura.APP_VERSION;
    const expected = version
      ? `./src/ui/skin/meridian-light.css?v=${version}`
      : './src/ui/skin/meridian-light.css';
    expect(link.getAttribute('href')).toBe(expected);
  });

  test('activate() writes manifest motion specs to --motion-* CSS vars', () => {
    SkinManager.activate('dark');
    const root = document.documentElement;
    // sliderPulse → --motion-slider-pulse-{dur,ease,peak}
    expect(root.style.getPropertyValue('--motion-slider-pulse-dur').trim()).toBe('550ms');
    expect(root.style.getPropertyValue('--motion-slider-pulse-ease').trim()).toBe('ease-out');
    expect(root.style.getPropertyValue('--motion-slider-pulse-peak').trim()).toBe('0.36');
    // dialWave → maxR is 24 (number, no px).
    expect(root.style.getPropertyValue('--motion-dial-wave-max-r').trim()).toBe('24');
  });

  test('activate() writes structural pane vars from manifest', () => {
    SkinManager.activate('dark');
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--pane-left-width').trim()).toBe('290px');
    expect(root.style.getPropertyValue('--pane-right-width').trim()).toBe('258px');
    expect(root.style.getPropertyValue('--row-height').trim()).toBe('30px');
  });

  test('activate() dispatches vectura:skin-change with the right payload', async () => {
    let captured = null;
    const handler = (e) => { captured = e.detail; };
    document.addEventListener('vectura:skin-change', handler);
    try {
      // First put the runtime into a known state so previousSkinId is deterministic.
      SkinManager.activate('classic-dark');
      await new Promise((r) => setTimeout(r, 30));
      captured = null;
      SkinManager.activate('light');
      await new Promise((r) => setTimeout(r, 30));
      expect(captured).toBeTruthy();
      expect(captured.skinId).toBe('light');
      expect(captured.previousSkinId).toBe('classic-dark');
      expect(captured.colorScheme).toBe('light');
      expect(captured.family).toBe('meridian');
      expect(typeof captured.reducedMotion).toBe('boolean');
    } finally {
      document.removeEventListener('vectura:skin-change', handler);
    }
  });

  test('activate() with the same id is a no-op (no event)', async () => {
    SkinManager.activate('dark');
    await new Promise((r) => setTimeout(r, 30));
    let count = 0;
    const handler = () => { count += 1; };
    document.addEventListener('vectura:skin-change', handler);
    try {
      SkinManager.activate('dark');
      await new Promise((r) => setTimeout(r, 30));
      expect(count).toBe(0);
    } finally {
      document.removeEventListener('vectura:skin-change', handler);
    }
  });

  test('getActive() returns the most recently activated id', () => {
    SkinManager.activate('lark');
    expect(SkinManager.getActive()).toBe('lark');
    SkinManager.activate('classic-dark');
    expect(SkinManager.getActive()).toBe('classic-dark');
  });

  test('activate() throws on unknown skin id', () => {
    expect(() => SkinManager.activate('does-not-exist')).toThrow(/unknown skin/);
  });
});

describe('window.Vectura.UI.tokens', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
  afterAll(() => runtime.cleanup());

  test('tokens.get reads computed CSS variables', () => {
    const { document } = runtime;
    document.documentElement.style.setProperty('--probe-token', '#abcdef');
    const value = runtime.window.Vectura.UI.tokens.get('--probe-token', '#000');
    expect(value).toBe('#abcdef');
  });

  test('tokens.get returns the fallback when the variable is unset', () => {
    const value = runtime.window.Vectura.UI.tokens.get('--definitely-unset-' + Date.now(), '#fallback');
    expect(value).toBe('#fallback');
  });

  test('back-compat alias window.Vectura.UI.getThemeToken === tokens.get', () => {
    expect(runtime.window.Vectura.UI.getThemeToken).toBe(runtime.window.Vectura.UI.tokens.get);
  });
});
