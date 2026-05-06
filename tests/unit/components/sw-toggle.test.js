const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.SwToggle', () => {
  let runtime;
  let SwToggle;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'sw-toggle']);
    SwToggle = runtime.window.Vectura.UI.SwToggle;
  });
  afterEach(() => runtime.cleanup());

  test('renders a labeled switch with hidden checkbox', () => {
    const inst = SwToggle(runtime.document.body, { ariaLabel: 'Enable X', checked: false });
    expect(inst.el.classList.contains('sw-toggle')).toBe(true);
    expect(inst.el.getAttribute('role')).toBe('switch');
    expect(inst.el.getAttribute('aria-checked')).toBe('false');
    expect(inst.el.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(inst.el.querySelector('.sw-track')).toBeTruthy();
    expect(inst.el.querySelector('.sw-thumb')).toBeTruthy();
    inst.destroy();
  });

  test('change event fires onChange and syncs aria-checked', () => {
    let captured = null;
    const inst = SwToggle(runtime.document.body, { ariaLabel: 'X', checked: false, onChange: (v) => { captured = v; } });
    const input = inst.el.querySelector('input');
    input.checked = true;
    input.dispatchEvent(new runtime.window.Event('change', { bubbles: true }));
    expect(captured).toBe(true);
    expect(inst.el.getAttribute('aria-checked')).toBe('true');
    inst.destroy();
  });

  test('Space and Enter toggle the input', () => {
    let count = 0;
    const inst = SwToggle(runtime.document.body, { ariaLabel: 'X', onChange: () => { count += 1; } });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(inst.getChecked()).toBe(true);
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(inst.getChecked()).toBe(false);
    expect(count).toBe(2);
    inst.destroy();
  });

  test('setChecked silently does not invoke onChange', () => {
    let count = 0;
    const inst = SwToggle(runtime.document.body, { ariaLabel: 'X', onChange: () => { count += 1; } });
    inst.setChecked(true, { silent: true });
    expect(inst.getChecked()).toBe(true);
    expect(count).toBe(0);
    inst.destroy();
  });

  test('disabled prevents keyboard toggle', () => {
    let count = 0;
    const inst = SwToggle(runtime.document.body, { ariaLabel: 'X', disabled: true, onChange: () => { count += 1; } });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(count).toBe(0);
    inst.destroy();
  });

  test('update() syncs checked, disabled, and aria-label without recreating el', () => {
    const inst = SwToggle(runtime.document.body, { ariaLabel: 'A', checked: false });
    const ref = inst.el;
    inst.update({ checked: true, disabled: true, ariaLabel: 'B' });
    expect(inst.el).toBe(ref);
    expect(inst.getChecked()).toBe(true);
    expect(inst.el.getAttribute('aria-label')).toBe('B');
    expect(inst.el.querySelector('input').disabled).toBe(true);
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = SwToggle(runtime.document.body, { ariaLabel: 'X' });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
