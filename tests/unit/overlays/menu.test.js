const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.Menu', () => {
  let runtime;
  let Menu;

  const items = [
    { key: 'open', label: 'Open Project', shortcut: 'Cmd+O' },
    { key: 'save', label: 'Save Project', shortcut: 'Cmd+S' },
    { separator: true },
    { key: 'export', label: 'Export', shortcut: 'Cmd+Shift+E' },
    { key: 'archive', label: 'Archive…', disabled: true },
  ];

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'menu']);
    Menu = runtime.window.Vectura.UI.overlays.Menu;
  });
  afterEach(() => runtime.cleanup());

  test('renders entries, separators, and shortcut hints', () => {
    const inst = Menu(runtime.document.body, { items, onSelect: () => {} });
    const entries = inst.el.querySelectorAll('.menu-entry');
    expect(entries.length).toBe(4); // open + save + export + archive
    expect(inst.el.querySelectorAll('.menu-sep').length).toBe(1);
    expect(entries[0].querySelector('.msc').textContent).toBe('Cmd+O');
    expect(entries[3].classList.contains('dim')).toBe(true);
    inst.destroy();
  });

  test('open(anchor) shows the dropdown; close() hides it', () => {
    const trigger = runtime.document.createElement('button');
    runtime.document.body.appendChild(trigger);
    const inst = Menu(runtime.document.body, { items, onSelect: () => {} });
    inst.open(trigger);
    expect(inst.isOpen()).toBe(true);
    expect(inst.el.style.display).toBe('block');
    inst.close();
    expect(inst.isOpen()).toBe(false);
    expect(inst.el.style.display).toBe('none');
    inst.destroy();
  });

  test('Enter on highlighted entry fires onSelect with the key', () => {
    const log = [];
    const inst = Menu(runtime.document.body, { items, onSelect: (k) => log.push(k) });
    inst.open(runtime.document.body);
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(log).toEqual(['save']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('ArrowDown skips disabled entries when wrapping', () => {
    const inst = Menu(runtime.document.body, { items, onSelect: () => {} });
    inst.open(runtime.document.body);
    // move from open(0) → save(1)
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // → export(2 in enabled list, item index 3 in entries)
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const active = inst.el.querySelector('.menu-entry.is-active');
    expect(active.dataset.key).toBe('export');
    inst.destroy();
  });

  test('Esc closes the menu', () => {
    const inst = Menu(runtime.document.body, { items, onSelect: () => {} });
    inst.open(runtime.document.body);
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('type-ahead jumps to first matching label', () => {
    const inst = Menu(runtime.document.body, { items, onSelect: () => {} });
    inst.open(runtime.document.body);
    runtime.document.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    const active = inst.el.querySelector('.menu-entry.is-active');
    expect(active.dataset.key).toBe('export');
    inst.destroy();
  });

  test('clicking an entry fires onSelect and closes', () => {
    const log = [];
    const inst = Menu(runtime.document.body, { items, onSelect: (k) => log.push(k) });
    inst.open(runtime.document.body);
    inst.el.querySelectorAll('.menu-entry')[0].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['open']);
    expect(inst.isOpen()).toBe(false);
    inst.destroy();
  });

  test('clicking a disabled entry is a no-op', () => {
    const log = [];
    const inst = Menu(runtime.document.body, { items, onSelect: (k) => log.push(k) });
    inst.open(runtime.document.body);
    inst.el.querySelectorAll('.menu-entry')[3].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual([]);
    inst.destroy();
  });

  test('destroy cleans up listeners', () => {
    const inst = Menu(runtime.document.body, { items, onSelect: () => {} });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
