const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Document units and saved preferences', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('unit helpers convert and format metric and imperial lengths', async () => {
    runtime = await loadVecturaRuntime();

    const { UnitUtils } = runtime.window.Vectura;

    expect(UnitUtils.mmToDocumentUnits(25.4, 'imperial')).toBeCloseTo(1, 6);
    expect(UnitUtils.documentUnitsToMm(8.5, 'imperial')).toBeCloseTo(215.9, 6);
    expect(UnitUtils.getDocumentUnitLabel('metric')).toBe('mm');
    expect(UnitUtils.getDocumentUnitLabel('imperial')).toBe('in');
    expect(
      UnitUtils.formatDocumentLength(215.9, 'imperial', {
        trimTrailingZeros: true,
        spaceBeforeUnit: true,
      })
    ).toBe('8.5 in');
    expect(UnitUtils.formatDocumentLength(210, 'metric', { trimTrailingZeros: true })).toBe('210mm');
  });

  test('clearSavedPreferences removes the cookie and disables cookie-backed preferences', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });

    const { window } = runtime;
    window.app = new window.Vectura.App();
    await Promise.resolve();

    window.Vectura.SETTINGS.cookiePreferencesEnabled = true;
    window.Vectura.SETTINGS.margin = 33;
    window.app.persistPreferences({ force: true });

    expect(window.document.cookie).toContain('vectura_prefs=');

    window.app.clearSavedPreferences();

    expect(window.Vectura.SETTINGS.cookiePreferencesEnabled).toBe(false);
    expect(window.app.readCookie('vectura_prefs')).toBeNull();
    expect(window.document.cookie).not.toContain('vectura_prefs=');
  });
});
