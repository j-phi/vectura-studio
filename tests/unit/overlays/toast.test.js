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

  describe('TUX-037 action toast', () => {
    const mk = (extra = {}) => {
      const log = [];
      const t = Toast.show({ message: 'Deleted "A"', action: { label: 'Undo', onAction: () => log.push('act') }, ...extra });
      return { t, log };
    };

    test('action renders a <button data-action="undo">', () => {
      const { t } = mk({ duration: 0 });
      const b = t.el.querySelector('button[data-action="undo"]');
      expect(b).toBeTruthy();
      expect(b.textContent).toBe('Undo');
      expect(b.type).toBe('button');
      t.dismiss();
    });

    test('a click on the toast body does not call onAction or dismiss', () => {
      const { t, log } = mk({ duration: 0 });
      t.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
      expect(log).toEqual([]);
      expect(t.el.parentNode).not.toBeNull();
      t.dismiss();
    });

    test('the button calls onAction, then dismisses', () => {
      const { t, log } = mk({ duration: 0 });
      t.el.querySelector('button').dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
      expect(log).toEqual(['act']);
      expect(t.el.parentNode).toBeNull();
    });

    test('default duration with an action is at least 5000 ms', () => {
      const spy = vi.spyOn(globalThis, 'setTimeout');
      try {
        const { t } = mk();
        const ms = spy.mock.calls.map((c) => c[1]);
        expect(ms.some((n) => n >= 5000)).toBe(true);
        t.dismiss();
      } finally { spy.mockRestore(); }
    });

    test('pointerdown pauses the timer; pointerup and pointercancel resume it', async () => {
      const { t } = mk({ duration: 40 });
      t.el.dispatchEvent(new runtime.window.Event('pointerdown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 90));
      expect(t.el.parentNode).not.toBeNull();
      t.el.dispatchEvent(new runtime.window.Event('pointerup', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 90));
      expect(t.el.parentNode).toBeNull();

      const { t: t2 } = mk({ duration: 40 });
      t2.el.dispatchEvent(new runtime.window.Event('pointerdown', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 90));
      expect(t2.el.parentNode).not.toBeNull();
      t2.el.dispatchEvent(new runtime.window.Event('pointercancel', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 90));
      expect(t2.el.parentNode).toBeNull();
    });

    test('disableAction() disables the button', () => {
      const { t } = mk({ duration: 0 });
      t.disableAction();
      expect(t.el.querySelector('button').disabled).toBe(true);
      t.dismiss();
    });
  });
});
