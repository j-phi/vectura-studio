const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Crop Exports settings wiring', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('records history and persists preferences when toggled', () => {
    const { UI, SETTINGS } = runtime.window.Vectura;
    const input = runtime.document.createElement('input');
    input.id = 'set-crop-exports';
    input.type = 'checkbox';
    runtime.document.body.appendChild(input);

    let historyCalls = 0;
    let persistCalls = 0;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    SETTINGS.cropExports = true;

    UI.prototype.bindGlobal.call({
      app: {
        pushHistory: () => {
          historyCalls += 1;
        },
        persistPreferencesDebounced: () => {
          persistCalls += 1;
        },
      },
    });

    warnSpy.mockRestore();

    input.checked = false;
    input.dispatchEvent(new runtime.window.Event('change', { bubbles: true }));

    expect(SETTINGS.cropExports).toBe(false);
    expect(historyCalls).toBe(1);
    expect(persistCalls).toBe(1);
  });
});
