const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.Modal', () => {
  let runtime;
  let Modal;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'focus', 'modal']);
    Modal = runtime.window.Vectura.UI.overlays.Modal;
  });
  afterEach(() => runtime.cleanup());

  test('opens hidden by default and shows the dialog on open()', () => {
    const inst = Modal(runtime.document.body, {
      title: 'X', render: (b) => { b.appendChild(runtime.document.createElement('p')); },
    });
    expect(inst.el.style.display).toBe('none');
    inst.open();
    expect(inst.el.style.display).toBe('flex');
    expect(inst.isOpen()).toBe(true);
    inst.destroy();
  });

  test('Esc closes when keyboard:true (default)', async () => {
    const inst = Modal(runtime.document.body, {
      title: 'X', render: (b) => { b.appendChild(runtime.document.createElement('button')); },
    });
    inst.open();
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('keyboard:false suppresses Esc', () => {
    const inst = Modal(runtime.document.body, {
      title: 'X', keyboard: false, render: (b) => { b.appendChild(runtime.document.createElement('button')); },
    });
    inst.open();
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(inst.isOpen()).toBe(true);
    inst.destroy();
  });

  test('dismissOnBackdrop:true closes on backdrop click; default does not', () => {
    const a = Modal(runtime.document.body, { title: 'X', render: (b) => { b.appendChild(runtime.document.createElement('p')); } });
    a.open();
    a.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(a.isOpen()).toBe(true);
    a.destroy();

    const b = Modal(runtime.document.body, { title: 'X', dismissOnBackdrop: true, render: (body) => body.appendChild(runtime.document.createElement('p')) });
    b.open();
    b.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(b.isOpen()).toBe(false);
    b.destroy();
  });

  test('focus is restored to the trigger on close', async () => {
    const trigger = runtime.document.createElement('button');
    runtime.document.body.appendChild(trigger);
    trigger.focus();

    const inst = Modal(runtime.document.body, {
      title: 'X', render: (body) => {
        const inp = runtime.document.createElement('input');
        body.appendChild(inp);
      },
    });
    inst.open();
    await new Promise((r) => setTimeout(r, 5));
    inst.close();
    expect(runtime.document.activeElement).toBe(trigger);
    inst.destroy();
  });

  test('lifecycle callbacks fire', () => {
    const log = [];
    const inst = Modal(runtime.document.body, {
      title: 'X',
      render: (b) => b.appendChild(runtime.document.createElement('p')),
      onOpen: () => log.push('open'),
      onClose: () => log.push('close'),
    });
    inst.open();
    inst.close();
    expect(log).toEqual(['open', 'close']);
    inst.destroy();
  });

  test('destroy() removes from DOM', () => {
    const inst = Modal(runtime.document.body, { title: 'X', render: (b) => b.appendChild(runtime.document.createElement('p')) });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
