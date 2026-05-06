const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.SegCtrl', () => {
  let runtime;
  let SegCtrl;
  const opts = [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
    { value: 'c', label: 'C' },
  ];

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'seg-ctrl']);
    SegCtrl = runtime.window.Vectura.UI.SegCtrl;
  });
  afterEach(() => runtime.cleanup());

  test('renders one .seg-opt per option with the first marked active by default', () => {
    const inst = SegCtrl(runtime.document.body, { ariaLabel: 'X', options: opts });
    const buttons = inst.el.querySelectorAll('.seg-opt');
    expect(buttons.length).toBe(3);
    expect(buttons[0].classList.contains('active')).toBe(true);
    expect(inst.getValue()).toBe('a');
    inst.destroy();
  });

  test('click selects an option and fires onChange exactly once', () => {
    const events = [];
    const inst = SegCtrl(runtime.document.body, { ariaLabel: 'X', options: opts, onChange: (v) => events.push(v) });
    const buttons = inst.el.querySelectorAll('.seg-opt');
    buttons[1].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(inst.getValue()).toBe('b');
    expect(events).toEqual(['b']);
    // Re-clicking the active option does not refire.
    buttons[1].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events).toEqual(['b']);
    inst.destroy();
  });

  test('ArrowRight cycles forward, ArrowLeft cycles backward', () => {
    const events = [];
    const inst = SegCtrl(runtime.document.body, { ariaLabel: 'X', options: opts, onChange: (v) => events.push(v) });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe('b');
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe('a');
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    // wraps to last
    expect(inst.getValue()).toBe('c');
    inst.destroy();
  });

  test('Home/End jump to first/last', () => {
    const inst = SegCtrl(runtime.document.body, { ariaLabel: 'X', options: opts, value: 'b' });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe('c');
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(inst.getValue()).toBe('a');
    inst.destroy();
  });

  test('update() with new options rebuilds buttons and preserves value when still present', () => {
    const inst = SegCtrl(runtime.document.body, { ariaLabel: 'X', options: opts, value: 'b' });
    inst.update({ options: [{ value: 'b', label: 'B' }, { value: 'd', label: 'D' }] });
    expect(inst.el.querySelectorAll('.seg-opt').length).toBe(2);
    expect(inst.getValue()).toBe('b');
    inst.update({ options: [{ value: 'x', label: 'X' }] });
    expect(inst.getValue()).toBe('x');
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = SegCtrl(runtime.document.body, { ariaLabel: 'X', options: opts });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
