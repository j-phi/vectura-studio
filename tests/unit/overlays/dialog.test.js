const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.Dialog', () => {
  let runtime;
  let Dialog;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'focus', 'modal', 'dialog']);
    Dialog = runtime.window.Vectura.UI.overlays.Dialog;
  });
  afterEach(() => runtime.cleanup());

  test('renders message + cancel + confirm', () => {
    const inst = Dialog(runtime.document.body, { title: 'Confirm', message: 'Are you sure?', onConfirm: () => {} });
    inst.open();
    const buttons = inst.dialogEl.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe('Cancel');
    expect(buttons[1].textContent).toBe('Confirm');
    expect(inst.dialogEl.querySelector('.vectura-dialog-msg').textContent).toBe('Are you sure?');
    inst.destroy();
  });

  test('confirm fires onConfirm and closes', () => {
    const log = [];
    const inst = Dialog(runtime.document.body, {
      title: 'Confirm', message: 'X', onConfirm: () => log.push('confirm'),
    });
    inst.open();
    const confirm = inst.dialogEl.querySelectorAll('button')[1];
    confirm.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['confirm']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('cancel fires onCancel and closes', () => {
    const log = [];
    const inst = Dialog(runtime.document.body, {
      title: 'Confirm', message: 'X',
      onConfirm: () => {},
      onCancel: () => log.push('cancel'),
    });
    inst.open();
    const cancel = inst.dialogEl.querySelectorAll('button')[0];
    cancel.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['cancel']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('destructive variant flags confirm with .is-danger', () => {
    const inst = Dialog(runtime.document.body, {
      title: 'Delete?', message: 'X', destructive: true, onConfirm: () => {},
    });
    inst.open();
    const confirm = inst.dialogEl.querySelectorAll('button')[1];
    expect(confirm.classList.contains('is-danger')).toBe(true);
    inst.destroy();
  });

  test('destroy cleans up the underlying modal', () => {
    const inst = Dialog(runtime.document.body, { title: 'X', message: 'Y', onConfirm: () => {} });
    inst.open();
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
