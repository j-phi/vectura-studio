/**
 * Bugs-7 (audit-2026-05-20): applyPreferenceSnapshot must reject malformed
 * field values (CSS-injection vectors, NaN, out-of-range numbers, unknown
 * enums) and fall back to defaults instead of writing them into SETTINGS.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('applyPreferenceSnapshot field validation (Bugs-7)', () => {
  let runtime;
  let originalWarn;
  let warnCalls;

  beforeEach(() => {
    warnCalls = [];
    originalWarn = console.warn;
    console.warn = (...args) => { warnCalls.push(args); };
  });

  afterEach(() => {
    console.warn = originalWarn;
    runtime?.cleanup?.();
    runtime = null;
  });

  const bootApp = async () => {
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
    return window;
  };

  test('rejects bgColor with CSS-injection payload, falls back to default', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    const defaultBg = SETTINGS.bgColor;

    window.app.applyPreferenceSnapshot({
      bgColor: 'red; background: url(https://attacker/x)',
    });

    expect(SETTINGS.bgColor).toBe(defaultBg);
    expect(SETTINGS.bgColor).not.toContain(';');
    expect(SETTINGS.bgColor).not.toContain('url');
    expect(warnCalls.some((c) => /bgColor/.test(String(c[0] || '')))).toBe(true);
  });

  test('rejects bgColor with javascript: url, falls back to default', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    const defaultBg = SETTINGS.bgColor;

    window.app.applyPreferenceSnapshot({
      bgColor: 'url(javascript:alert(1))',
    });

    expect(SETTINGS.bgColor).toBe(defaultBg);
  });

  test('rejects bgColor with invalid hex chars (#zzzzzz)', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    const defaultBg = SETTINGS.bgColor;

    window.app.applyPreferenceSnapshot({ bgColor: '#zzzzzz' });

    expect(SETTINGS.bgColor).toBe(defaultBg);
  });

  test('accepts valid hex colors (#fff, #ffffff, #ffffffff)', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;

    window.app.applyPreferenceSnapshot({ bgColor: '#fff' });
    expect(SETTINGS.bgColor).toBe('#fff');

    window.app.applyPreferenceSnapshot({ bgColor: '#abcdef' });
    expect(SETTINGS.bgColor).toBe('#abcdef');

    window.app.applyPreferenceSnapshot({ bgColor: '#12345678' });
    expect(SETTINGS.bgColor).toBe('#12345678');
  });

  test('rejects NaN / -Infinity / non-numeric paneLeftWidth', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    const defaultLeft = SETTINGS.paneLeftWidth;

    window.app.applyPreferenceSnapshot({ paneLeftWidth: NaN });
    expect(SETTINGS.paneLeftWidth).toBe(defaultLeft);

    window.app.applyPreferenceSnapshot({ paneLeftWidth: '-Infinity' });
    expect(SETTINGS.paneLeftWidth).toBe(defaultLeft);

    window.app.applyPreferenceSnapshot({ paneLeftWidth: 'not-a-number' });
    expect(SETTINGS.paneLeftWidth).toBe(defaultLeft);
  });

  test('rejects out-of-range numeric margin (NaN, Infinity)', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    const defaultMargin = SETTINGS.margin;

    window.app.applyPreferenceSnapshot({ margin: NaN });
    expect(SETTINGS.margin).toBe(defaultMargin);

    window.app.applyPreferenceSnapshot({ margin: Infinity });
    expect(SETTINGS.margin).toBe(defaultMargin);

    window.app.applyPreferenceSnapshot({ margin: 'large' });
    expect(SETTINGS.margin).toBe(defaultMargin);
  });

  test('rejects path-traversal uiTheme value, uses default', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;

    window.app.applyPreferenceSnapshot({ uiTheme: '../../../etc/passwd' });

    // normalizeThemeName falls back to 'dark' for unknown themes
    expect(SETTINGS.uiTheme).toBe('dark');
  });

  test('rejects invalid documentUnits enum value', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;

    window.app.applyPreferenceSnapshot({ documentUnits: 'parsecs' });

    expect(['metric', 'imperial']).toContain(SETTINGS.documentUnits);
  });

  test('rejects malicious color in marginLineColor and gridColor', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;
    const defaultMargin = SETTINGS.marginLineColor;
    const defaultGrid = SETTINGS.gridColor;

    window.app.applyPreferenceSnapshot({
      marginLineColor: 'expression(alert(1))',
      gridColor: 'red; background: url(x)',
    });

    expect(SETTINGS.marginLineColor).toBe(defaultMargin);
    expect(SETTINGS.gridColor).toBe(defaultGrid);
  });

  test('positive control: a fully valid snapshot is accepted verbatim', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;

    const valid = {
      uiTheme: 'dark',
      margin: 25,
      speedDown: 200,
      speedUp: 250,
      precision: 4,
      strokeWidth: 0.5,
      bgColor: '#202020',
      truncate: false,
      cropExports: false,
      removeHiddenGeometry: false,
      outsideOpacity: 0.3,
      marginLineVisible: true,
      marginLineWeight: 0.4,
      marginLineColor: '#abcdef',
      marginLineDotting: 2,
      showGuides: false,
      snapGuides: false,
      selectionOutline: false,
      selectionOutlineColor: '#ff0000',
      selectionOutlineWidth: 0.2,
      gridType: 'standard',
      gridOpacity: 0.5,
      gridStyle: 'cartesian',
      gridColor: '#ffffff',
      gridSize: 12,
      gridMinorOpacity: 0.1,
      gridMinorColor: '#cccccc',
      gridMinorSize: 6,
      gridSnapEnabled: true,
      gridSnapSensitivity: 30,
      undoSteps: 30,
      documentUnits: 'imperial',
      paneLeftWidth: 400,
      paneRightWidth: 350,
    };

    window.app.applyPreferenceSnapshot(valid);

    expect(SETTINGS.uiTheme).toBe('dark');
    expect(SETTINGS.margin).toBe(25);
    expect(SETTINGS.speedDown).toBe(200);
    expect(SETTINGS.precision).toBe(4);
    expect(SETTINGS.strokeWidth).toBe(0.5);
    expect(SETTINGS.bgColor).toBe('#202020');
    expect(SETTINGS.outsideOpacity).toBe(0.3);
    expect(SETTINGS.marginLineColor).toBe('#abcdef');
    expect(SETTINGS.marginLineDotting).toBe(2);
    expect(SETTINGS.selectionOutlineColor).toBe('#ff0000');
    expect(SETTINGS.gridType).toBe('standard');
    expect(SETTINGS.gridStyle).toBe('cartesian');
    expect(SETTINGS.gridColor).toBe('#ffffff');
    expect(SETTINGS.gridSize).toBe(12);
    expect(SETTINGS.documentUnits).toBe('imperial');
    expect(SETTINGS.paneLeftWidth).toBe(400);
    expect(SETTINGS.paneRightWidth).toBe(350);
  });

  test('default snapshot roundtrips cleanly (save → load → identical SETTINGS)', async () => {
    const window = await bootApp();
    const { SETTINGS } = window.Vectura;

    const before = JSON.stringify(window.app.getPreferenceSnapshot());
    window.app.applyPreferenceSnapshot(JSON.parse(before));
    const after = JSON.stringify(window.app.getPreferenceSnapshot());

    expect(after).toBe(before);
    // No warn should fire for a clean default-state snapshot.
    expect(warnCalls.length).toBe(0);
    // Spot check fields that we know are validated.
    expect(typeof SETTINGS.bgColor).toBe('string');
    expect(SETTINGS.bgColor.startsWith('#')).toBe(true);
  });

  test('Vectura.Validators is exposed with hex / finite / enum helpers', async () => {
    const window = await bootApp();
    const V = window.Vectura.Validators;
    expect(V).toBeTruthy();
    expect(typeof V.isHexColor).toBe('function');
    expect(V.isHexColor('#fff')).toBe(true);
    expect(V.isHexColor('#abcdef')).toBe(true);
    expect(V.isHexColor('#12345678')).toBe(true);
    expect(V.isHexColor('red; background: url(x)')).toBe(false);
    expect(V.isHexColor('#zz')).toBe(false);
    expect(V.isHexColor('expression(1)')).toBe(false);
    expect(V.isHexColor('')).toBe(false);
    expect(V.isHexColor(null)).toBe(false);

    expect(typeof V.finiteInRange).toBe('function');
    expect(V.finiteInRange(5, 0, 10)).toBe(5);
    expect(V.finiteInRange('5', 0, 10)).toBe(5);
    expect(V.finiteInRange(NaN, 0, 10)).toBe(null);
    expect(V.finiteInRange(Infinity, 0, 10)).toBe(null);
    expect(V.finiteInRange(-1, 0, 10)).toBe(0);
    expect(V.finiteInRange(99, 0, 10)).toBe(10);

    expect(typeof V.fromEnum).toBe('function');
    expect(V.fromEnum('a', ['a', 'b'])).toBe('a');
    expect(V.fromEnum('z', ['a', 'b'])).toBe(null);
    expect(V.fromEnum('../../../etc/passwd', ['a', 'b'])).toBe(null);
  });
});
