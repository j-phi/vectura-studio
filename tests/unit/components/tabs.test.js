const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Tabs', () => {
  let runtime;
  let Tabs;
  const tabs = [
    { value: 'layers', label: 'Layers' },
    { value: 'pens', label: 'Pens' },
  ];

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'tabs']);
    Tabs = runtime.window.Vectura.UI.Tabs;
  });
  afterEach(() => runtime.cleanup());

  test('renders a tablist with one .tab-btn per tab', () => {
    const inst = Tabs(runtime.document.body, { tabs, ariaLabel: 'Right pane' });
    expect(inst.el.classList.contains('tab-bar')).toBe(true);
    expect(inst.el.getAttribute('role')).toBe('tablist');
    expect(inst.el.querySelectorAll('.tab-btn').length).toBe(2);
    expect(inst.el.querySelector('.tab-btn.active').textContent).toBe('Layers');
    expect(inst.getActive()).toBe('layers');
    inst.destroy();
  });

  test('click switches the active tab and fires onChange', () => {
    const events = [];
    const inst = Tabs(runtime.document.body, { tabs, onChange: (v) => events.push(v) });
    const buttons = inst.el.querySelectorAll('.tab-btn');
    buttons[1].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(inst.getActive()).toBe('pens');
    expect(events).toEqual(['pens']);
    inst.destroy();
  });

  test('arrow keys cycle, Home/End jump', () => {
    const inst = Tabs(runtime.document.body, { tabs, active: 'layers' });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(inst.getActive()).toBe('pens');
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }));
    expect(inst.getActive()).toBe('layers');
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    expect(inst.getActive()).toBe('pens');
    inst.destroy();
  });

  test('aria-selected and tabindex follow the active tab', () => {
    const inst = Tabs(runtime.document.body, { tabs, active: 'pens' });
    const buttons = inst.el.querySelectorAll('.tab-btn');
    expect(buttons[0].getAttribute('aria-selected')).toBe('false');
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].tabIndex).toBe(0);
    expect(buttons[0].tabIndex).toBe(-1);
    inst.destroy();
  });

  test('update() with new tabs rebuilds buttons', () => {
    const inst = Tabs(runtime.document.body, { tabs });
    inst.update({ tabs: [{ value: 'x', label: 'X' }] });
    expect(inst.el.querySelectorAll('.tab-btn').length).toBe(1);
    expect(inst.getActive()).toBe('x');
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = Tabs(runtime.document.body, { tabs });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
