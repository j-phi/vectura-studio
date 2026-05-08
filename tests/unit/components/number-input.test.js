const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.NumberInput', () => {
  let runtime;
  let NumberInput;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'number-input']);
    NumberInput = runtime.window.Vectura.UI.NumberInput;
  });
  afterEach(() => runtime.cleanup());

  test('renders an input.ctrl-inp with the initial value', () => {
    const inst = NumberInput(runtime.document.body, { value: 3, ariaLabel: 'X' });
    expect(inst.el.classList.contains('ctrl-inp')).toBe(true);
    expect(inst.el.value).toBe('3');
    inst.destroy();
  });

  test('Enter commits parsed input and clamps to bounds', () => {
    const events = [];
    const inst = NumberInput(runtime.document.body, { value: 0, min: 0, max: 10, onChange: (v) => events.push(v) });
    inst.el.value = '99';
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(10);
    expect(events).toEqual([10]);
    inst.destroy();
  });

  test('blur with invalid input restores last value', () => {
    const inst = NumberInput(runtime.document.body, { value: 7 });
    inst.el.value = 'asdf';
    inst.el.dispatchEvent(new runtime.window.Event('blur'));
    expect(inst.el.value).toBe('7');
    inst.destroy();
  });

  test('ArrowUp and ArrowDown nudge by step; Shift multiplies', () => {
    const inst = NumberInput(runtime.document.body, { value: 0, step: 0.1 });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBeCloseTo(0.1, 5);
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBeCloseTo(-0.9, 5);
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = NumberInput(runtime.document.body, { value: 0 });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
