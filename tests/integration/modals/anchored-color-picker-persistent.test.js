/*
 * Regression test for the anchored native color picker (desktop path).
 *
 * On macOS the system color panel (NSColorPanel) stays open across multiple
 * selections and fires one `change` event per pick. The picker must keep
 * applying EVERY selection to the target input until it is dismissed — not just
 * the first. A prior bug tore down all listeners on the first `change`, so the
 * second and subsequent colour clicks in the still-open panel did nothing.
 *
 * This is the contract behind the line-sort / draw-order overlay start/end
 * colours and every other anchored color button (grid, margin, background,
 * legend, …) that routes through `openColorPickerAnchoredTo`.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Anchored native color picker — persistent panel', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = new window.Vectura.App();
    window.app = app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('keeps applying every selection while the native panel stays open', () => {
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#000000';
    document.body.appendChild(colorInput);
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    const changes = [];
    colorInput.addEventListener('change', () => changes.push(colorInput.value));

    app.ui.openColorPickerAnchoredTo(colorInput, trigger, { title: 'Test' });

    const proxy = document.getElementById('anchored-color-proxy-input');
    expect(proxy).toBeTruthy();

    // Simulate the user clicking three colours in a row in the still-open panel.
    const pick = (hex) => {
      proxy.value = hex;
      proxy.dispatchEvent(new window.Event('input', { bubbles: true }));
      proxy.dispatchEvent(new window.Event('change', { bubbles: true }));
    };
    pick('#ff0000');
    pick('#00ff00');
    pick('#0000ff');

    // Every pick must propagate — not just the first.
    expect(colorInput.value).toBe('#0000ff');
    expect(changes).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });

  test('a second anchored open tears down the previous session (no double-apply)', () => {
    const firstInput = document.createElement('input');
    firstInput.type = 'color';
    firstInput.value = '#000000';
    document.body.appendChild(firstInput);
    const secondInput = document.createElement('input');
    secondInput.type = 'color';
    secondInput.value = '#000000';
    document.body.appendChild(secondInput);
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);

    app.ui.openColorPickerAnchoredTo(firstInput, trigger, { title: 'First' });
    // Re-open the (singleton) proxy for a different target.
    app.ui.openColorPickerAnchoredTo(secondInput, trigger, { title: 'Second' });

    const proxy = document.getElementById('anchored-color-proxy-input');
    proxy.value = '#abcdef';
    proxy.dispatchEvent(new window.Event('change', { bubbles: true }));

    // Only the active (second) session should receive the value.
    expect(secondInput.value).toBe('#abcdef');
    expect(firstInput.value).toBe('#000000');
  });
});
