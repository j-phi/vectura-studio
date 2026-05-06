const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.TogGrp', () => {
  let runtime;
  let TogGrp;
  const opts = [
    { value: 'x', label: 'X' },
    { value: 'y', label: 'Y' },
    { value: 'z', label: 'Z' },
  ];

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'tog-grp']);
    TogGrp = runtime.window.Vectura.UI.TogGrp;
  });
  afterEach(() => runtime.cleanup());

  test('single-select default: selecting fires string value', () => {
    const events = [];
    const inst = TogGrp(runtime.document.body, { ariaLabel: 'X', options: opts, onChange: (v) => events.push(v) });
    const buttons = inst.el.querySelectorAll('.tog-btn');
    buttons[1].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events).toEqual(['y']);
    expect(inst.getValue()).toBe('y');
    expect(buttons[1].classList.contains('active')).toBe(true);
    expect(buttons[0].classList.contains('active')).toBe(false);
    inst.destroy();
  });

  test('multi-select: clicks toggle membership and fire array value', () => {
    const events = [];
    const inst = TogGrp(runtime.document.body, {
      ariaLabel: 'X', multiple: true, options: opts, value: [], onChange: (v) => events.push(v),
    });
    const buttons = inst.el.querySelectorAll('.tog-btn');
    buttons[0].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    buttons[2].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events.length).toBe(2);
    expect(events[0]).toEqual(['x']);
    expect(events[1]).toEqual(['x', 'z']);
    // Click again removes membership.
    buttons[0].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events[2]).toEqual(['z']);
    expect(inst.getValue()).toEqual(['z']);
    inst.destroy();
  });

  test('multi-select buttons expose aria-pressed; single uses aria-checked', () => {
    const single = TogGrp(runtime.document.body, { ariaLabel: 'A', options: opts });
    expect(single.el.querySelector('.tog-btn').getAttribute('aria-checked')).toBeDefined();
    single.destroy();

    const multi = TogGrp(runtime.document.body, { ariaLabel: 'B', multiple: true, options: opts });
    expect(multi.el.querySelector('.tog-btn').getAttribute('aria-pressed')).toBeDefined();
    multi.destroy();
  });

  test('update() can swap between single/multi modes and rebuilds buttons', () => {
    const inst = TogGrp(runtime.document.body, { ariaLabel: 'X', options: opts, value: 'x' });
    expect(inst.getValue()).toBe('x');
    inst.update({ multiple: true, value: ['y', 'z'] });
    expect(inst.el.getAttribute('role')).toBe('group');
    expect(inst.getValue()).toEqual(['y', 'z']);
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = TogGrp(runtime.document.body, { ariaLabel: 'X', options: opts });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
