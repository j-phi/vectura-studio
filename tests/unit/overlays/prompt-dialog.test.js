const { loadUIComponent } = require('../../helpers/load-ui-component');

const flushTimers = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

describe('UI.overlays.Prompt', () => {
  let runtime;
  let Prompt;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'focus', 'modal', 'dialog']);
    Prompt = runtime.window.Vectura.UI.overlays.Prompt;
  });
  afterEach(() => runtime.cleanup());

  test('renders message + text input (value, placeholder) + cancel + OK', () => {
    const inst = Prompt(runtime.document.body, {
      title: 'Export Profile',
      message: 'Profile name',
      value: 'inner-petal-profile',
      placeholder: 'my-profile',
      onConfirm: () => {},
    });
    inst.open();
    expect(inst.dialogEl.querySelector('.vectura-dialog-msg').textContent).toBe('Profile name');
    const input = inst.dialogEl.querySelector('input[type="text"]');
    expect(input).toBeTruthy();
    expect(input).toBe(inst.inputEl);
    expect(input.value).toBe('inner-petal-profile');
    expect(input.placeholder).toBe('my-profile');
    const buttons = inst.dialogEl.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toBe('Cancel');
    expect(buttons[1].textContent).toBe('OK');
    inst.destroy();
  });

  test('confirm fires onConfirm with the input value and closes', () => {
    const log = [];
    const inst = Prompt(runtime.document.body, {
      title: 'X', message: 'Name', value: 'seed',
      onConfirm: (value) => log.push(value),
    });
    inst.open();
    inst.inputEl.value = 'edited-name';
    const confirm = inst.dialogEl.querySelectorAll('button')[1];
    confirm.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['edited-name']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('cancel fires onCancel (not onConfirm) and closes', () => {
    const log = [];
    const inst = Prompt(runtime.document.body, {
      title: 'X', message: 'Name',
      onConfirm: (value) => log.push(`confirm:${value}`),
      onCancel: () => log.push('cancel'),
    });
    inst.open();
    const cancel = inst.dialogEl.querySelectorAll('button')[0];
    cancel.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['cancel']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('Enter in the input confirms with the current value', () => {
    const log = [];
    const inst = Prompt(runtime.document.body, {
      title: 'X', message: 'Name', value: 'via-enter',
      onConfirm: (value) => log.push(value),
    });
    inst.open();
    inst.inputEl.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(log).toEqual(['via-enter']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('Escape routes to onCancel exactly once', () => {
    const log = [];
    const inst = Prompt(runtime.document.body, {
      title: 'X', message: 'Name',
      onConfirm: () => log.push('confirm'),
      onCancel: () => log.push('cancel'),
    });
    inst.open();
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(log).toEqual(['cancel']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('focuses the input and selects the seeded text on open', async () => {
    const inst = Prompt(runtime.document.body, {
      title: 'X', message: 'Name', value: 'select-me',
      onConfirm: () => {},
    });
    inst.open();
    await flushTimers();
    expect(runtime.document.activeElement).toBe(inst.inputEl);
    expect(inst.inputEl.selectionStart).toBe(0);
    expect(inst.inputEl.selectionEnd).toBe('select-me'.length);
    inst.destroy();
  });

  test('custom confirm/cancel labels are honored', () => {
    const inst = Prompt(runtime.document.body, {
      title: 'X', message: 'Name',
      confirmLabel: 'Export', cancelLabel: 'Never mind',
      onConfirm: () => {},
    });
    inst.open();
    const buttons = inst.dialogEl.querySelectorAll('button');
    expect(buttons[0].textContent).toBe('Never mind');
    expect(buttons[1].textContent).toBe('Export');
    inst.destroy();
  });

  test('destroy cleans up the underlying modal', () => {
    const inst = Prompt(runtime.document.body, { title: 'X', message: 'Y', onConfirm: () => {} });
    inst.open();
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });

  describe('Prompt.show (promise API)', () => {
    test('resolves the entered string on OK and self-destroys', async () => {
      const { document, window } = runtime;
      const pending = Prompt.show({ title: 'T', message: 'Name', value: 'draft' });
      const backdrop = document.querySelector('.vectura-modal-backdrop');
      expect(backdrop).toBeTruthy();
      const input = backdrop.querySelector('input[type="text"]');
      input.value = 'final-name';
      const confirm = backdrop.querySelectorAll('.vectura-dialog-footer button')[1];
      confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await expect(pending).resolves.toBe('final-name');
      expect(document.querySelector('.vectura-modal-backdrop')).toBeNull();
    });

    test('resolves null on Cancel and self-destroys', async () => {
      const { document, window } = runtime;
      const pending = Prompt.show({ title: 'T', message: 'Name' });
      const backdrop = document.querySelector('.vectura-modal-backdrop');
      const cancel = backdrop.querySelectorAll('.vectura-dialog-footer button')[0];
      cancel.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await expect(pending).resolves.toBeNull();
      expect(document.querySelector('.vectura-modal-backdrop')).toBeNull();
    });

    test('resolves null on Escape', async () => {
      const { document, window } = runtime;
      const pending = Prompt.show({ title: 'T', message: 'Name' });
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await expect(pending).resolves.toBeNull();
      expect(document.querySelector('.vectura-modal-backdrop')).toBeNull();
    });

    test('a second show() settles the pending prompt with null before opening', async () => {
      const { document, window } = runtime;
      const first = Prompt.show({ title: 'First', message: 'A' });
      const second = Prompt.show({ title: 'Second', message: 'B' });
      await expect(first).resolves.toBeNull();
      // Only the second prompt remains open.
      const backdrops = document.querySelectorAll('.vectura-modal-backdrop');
      expect(backdrops.length).toBe(1);
      const confirm = backdrops[0].querySelectorAll('.vectura-dialog-footer button')[1];
      backdrops[0].querySelector('input[type="text"]').value = 'b-value';
      confirm.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await expect(second).resolves.toBe('b-value');
    });
  });
});
