const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.AngleDial', () => {
  let runtime;
  let AngleDial;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'angle-dial']);
    AngleDial = runtime.window.Vectura.UI.AngleDial;
  });
  afterEach(() => runtime.cleanup());

  test('renders an SVG dial + numeric input with the value normalized to [0, 360)', () => {
    const inst = AngleDial(runtime.document.body, { value: 405, ariaLabel: 'Angle' });
    expect(inst.el.classList.contains('angle-ctrl')).toBe(true);
    expect(inst.el.querySelector('svg.angle-dial')).toBeTruthy();
    expect(inst.el.querySelector('.angle-inp')).toBeTruthy();
    expect(inst.getValue()).toBe(45);
    expect(inst.el.querySelector('.angle-inp').value).toBe('45');
    inst.destroy();
  });

  test('input Enter commits parsed value and fires onCommit', () => {
    const events = [];
    const inst = AngleDial(runtime.document.body, { value: 0, onCommit: (v) => events.push(v) });
    const input = inst.el.querySelector('.angle-inp');
    input.value = '90';
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(90);
    expect(events).toEqual([90]);
    inst.destroy();
  });

  test('ArrowUp/ArrowDown nudge in input; Shift multiplies', () => {
    const inst = AngleDial(runtime.document.body, { value: 0 });
    const input = inst.el.querySelector('.angle-inp');
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(1);
    input.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe(11);
    inst.destroy();
  });

  test('setValue wraps unless allowOverflow', () => {
    const inst = AngleDial(runtime.document.body, { value: 0 });
    inst.setValue(720, { silent: true });
    expect(inst.getValue()).toBe(0);
    inst.update({ allowOverflow: true });
    inst.setValue(720, { silent: true });
    expect(inst.getValue()).toBe(720);
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = AngleDial(runtime.document.body, { value: 0 });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
