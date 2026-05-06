const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('window.Vectura.UI.focus', () => {
  let runtime;
  beforeEach(() => {
    runtime = loadUIComponent(['focus']);
  });
  afterEach(() => runtime.cleanup());

  const buildShell = (doc) => {
    const root = doc.createElement('div');
    root.innerHTML = `
      <button id="btn-a">A</button>
      <input id="inp-b" type="text" />
      <button id="btn-c" disabled>C</button>
      <a id="lnk-d" href="#">D</a>
      <button id="btn-e" tabindex="-1">E</button>
    `;
    doc.body.appendChild(root);
    return root;
  };

  test('exposes API surface', () => {
    const { focus } = runtime.window.Vectura.UI;
    expect(focus).toBeTruthy();
    ['getFocusable', 'trap', 'restoreOnReturn'].forEach((n) => expect(typeof focus[n]).toBe('function'));
  });

  test('getFocusable filters disabled and tabindex=-1', () => {
    const root = buildShell(runtime.document);
    const ids = runtime.window.Vectura.UI.focus.getFocusable(root).map((el) => el.id);
    expect(ids).toEqual(['btn-a', 'inp-b', 'lnk-d']);
  });

  test('trap cycles Tab from last to first and Shift+Tab from first to last', () => {
    const { focus } = runtime.window.Vectura.UI;
    const root = buildShell(runtime.document);
    const release = focus.trap(root);

    const focusable = focus.getFocusable(root);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    last.focus();
    const ev1 = new runtime.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    root.dispatchEvent(ev1);
    expect(runtime.document.activeElement).toBe(first);

    first.focus();
    const ev2 = new runtime.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(ev2);
    expect(runtime.document.activeElement).toBe(last);

    release.release();
  });

  test('restoreOnReturn returns focus to the previously active element', () => {
    const { focus } = runtime.window.Vectura.UI;
    const trigger = runtime.document.createElement('button');
    runtime.document.body.appendChild(trigger);
    trigger.focus();
    const restore = focus.restoreOnReturn(runtime.document);
    const other = runtime.document.createElement('button');
    runtime.document.body.appendChild(other);
    other.focus();
    expect(runtime.document.activeElement).toBe(other);
    restore();
    expect(runtime.document.activeElement).toBe(trigger);
  });
});
