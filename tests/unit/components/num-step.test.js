const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.NumStep', () => {
  let runtime;
  let NumStep;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'num-step']);
    NumStep = runtime.window.Vectura.UI.NumStep;
  });
  afterEach(() => runtime.cleanup());

  test('renders with the initial value', () => {
    const inst = NumStep(runtime.document.body, { value: 7 });
    expect(inst.el.classList.contains('num-step')).toBe(true);
    expect(inst.el.querySelectorAll('.num-step-btn').length).toBe(2);
    expect(inst.el.querySelector('.num-step-inp').value).toBe('7');
    inst.destroy();
  });

  test('+ and − buttons step by `step` and clamp to min/max', () => {
    const events = [];
    const inst = NumStep(runtime.document.body, {
      value: 5, min: 0, max: 6, step: 2, onChange: (v) => events.push(v),
    });
    const [dec, _, inc] = [inst.el.querySelectorAll('.num-step-btn')[0], inst.el.querySelector('.num-step-inp'), inst.el.querySelectorAll('.num-step-btn')[1]];
    inc.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    // 5 + 2 → clamped to 6
    expect(inst.getValue()).toBe(6);
    expect(inc.disabled).toBe(true);
    dec.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(inst.getValue()).toBe(4);
    expect(events).toEqual([6, 4]);
    inst.destroy();
  });

  test('ArrowUp / ArrowDown nudge by step; Shift multiplies by 10', () => {
    const inst = NumStep(runtime.document.body, { value: 0, step: 0.5 });
    const input = inst.el.querySelector('.num-step-inp');
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBeCloseTo(0.5, 5);
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBeCloseTo(5.5, 5);
    inst.destroy();
  });

  test('Enter commits the typed value and blurs', () => {
    const events = [];
    const inst = NumStep(runtime.document.body, { value: 0, onChange: (v) => events.push(v) });
    const input = inst.el.querySelector('.num-step-inp');
    input.value = '42';
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(42);
    expect(events).toEqual([42]);
    inst.destroy();
  });

  test('blur with invalid input restores the last good value', () => {
    const inst = NumStep(runtime.document.body, { value: 7 });
    const input = inst.el.querySelector('.num-step-inp');
    input.value = 'banana';
    input.dispatchEvent(new runtime.window.Event('blur'));
    expect(input.value).toBe('7');
    inst.destroy();
  });

  test('precision is inferred from step', () => {
    const inst = NumStep(runtime.document.body, { value: 1, step: 0.05 });
    expect(inst.el.querySelector('.num-step-inp').value).toBe('1.00');
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = NumStep(runtime.document.body, { value: 0 });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
