const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.Toast', () => {
  let runtime;
  let Toast;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'toast']);
    Toast = runtime.window.Vectura.UI.overlays.Toast;
  });
  afterEach(() => runtime.cleanup());

  test('show() returns an instance and appends to a singleton host', () => {
    const t = Toast.show({ message: 'Hi' });
    expect(t.el).toBeInstanceOf(runtime.window.HTMLElement);
    expect(runtime.document.getElementById('vectura-toast-host')).toBeTruthy();
    expect(t.el.textContent).toBe('Hi');
    t.dismiss();
  });

  test('auto-dismiss after duration', async () => {
    const t = Toast.show({ message: 'Bye', duration: 30 });
    await new Promise((r) => setTimeout(r, 100));
    expect(t.el.parentNode).toBeNull();
  });

  test('duration:0 disables auto-dismiss', async () => {
    const t = Toast.show({ message: 'Stay', duration: 0 });
    await new Promise((r) => setTimeout(r, 60));
    expect(t.el.parentNode).not.toBeNull();
    t.dismiss();
  });

  test('hover pauses and leave resumes the timer', async () => {
    const t = Toast.show({ message: 'X', duration: 30 });
    t.el.dispatchEvent(new runtime.window.MouseEvent('mouseenter'));
    await new Promise((r) => setTimeout(r, 80));
    expect(t.el.parentNode).not.toBeNull();
    t.el.dispatchEvent(new runtime.window.MouseEvent('mouseleave'));
    await new Promise((r) => setTimeout(r, 100));
    expect(t.el.parentNode).toBeNull();
  });

  test('danger variant has assertive aria-live', () => {
    const t = Toast.show({ message: 'Boom', variant: 'danger' });
    expect(t.el.getAttribute('aria-live')).toBe('assertive');
    expect(t.el.getAttribute('role')).toBe('alert');
    t.dismiss();
  });

  test('click invokes onClick and dismisses', () => {
    const log = [];
    const t = Toast.show({ message: 'Click me', duration: 0, onClick: () => log.push(1) });
    t.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual([1]);
    expect(t.el.parentNode).toBeNull();
  });
});
