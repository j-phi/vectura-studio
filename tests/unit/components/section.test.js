const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Section', () => {
  let runtime;
  let Section;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'tooltip', 'info-badge', 'section']);
    Section = runtime.window.Vectura.UI.Section;
  });
  afterEach(() => runtime.cleanup());

  test('renders header + body with the title text', () => {
    const inst = Section(runtime.document.body, { title: 'Layers', children: (b) => { b.appendChild(runtime.document.createElement('p')); } });
    expect(inst.el.classList.contains('sect')).toBe(true);
    expect(inst.el.querySelector('.sect-hdr')).toBeTruthy();
    expect(inst.el.querySelector('.sect-hdr-title').textContent).toBe('Layers');
    expect(inst.el.querySelector('.sect-body')).toBeTruthy();
    expect(inst.el.querySelector('.sect-body p')).toBeTruthy();
    inst.destroy();
  });

  test('arrow has .down when expanded and is plain when collapsed', () => {
    const a = Section(runtime.document.body, { title: 'A', collapsed: false });
    expect(a.el.querySelector('.sect-arrow').classList.contains('down')).toBe(true);
    a.destroy();
    const b = Section(runtime.document.body, { title: 'B', collapsed: true });
    expect(b.el.querySelector('.sect-arrow').classList.contains('down')).toBe(false);
    b.destroy();
  });

  test('header click toggles collapsed state and fires onToggle', () => {
    const events = [];
    const inst = Section(runtime.document.body, {
      title: 'X',
      collapsed: false,
      onToggle: (open) => events.push(open),
    });
    const header = inst.el.querySelector('.sect-hdr');
    header.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(inst.isCollapsed()).toBe(true);
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(events).toEqual([false]);
    header.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(inst.isCollapsed()).toBe(false);
    expect(events).toEqual([false, true]);
    inst.destroy();
  });

  test('right variant uses .right-sect-hdr', () => {
    const inst = Section(runtime.document.body, { title: 'L', variant: 'right' });
    expect(inst.el.querySelector('.right-sect-hdr')).toBeTruthy();
    expect(inst.el.querySelector('.sect-hdr')).toBeFalsy();
    inst.destroy();
  });

  test('infoText mounts an info badge inside the header', () => {
    const inst = Section(runtime.document.body, { title: 'Algo', infoText: 'About this section' });
    expect(inst.el.querySelector('.info-badge')).toBeTruthy();
    inst.destroy();
  });

  test('clicking the info badge does not toggle the section', () => {
    const inst = Section(runtime.document.body, { title: 'A', infoText: 'help', collapsed: false });
    const badge = inst.el.querySelector('.info-badge');
    badge.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(inst.isCollapsed()).toBe(false);
    inst.destroy();
  });

  test('update() refreshes title and respects collapsed change', () => {
    const inst = Section(runtime.document.body, { title: 'A', collapsed: false });
    inst.update({ title: 'B', collapsed: true });
    expect(inst.el.querySelector('.sect-hdr-title').textContent).toBe('B');
    expect(inst.isCollapsed()).toBe(true);
    inst.destroy();
  });

  test('destroy() removes element and detaches click', () => {
    const inst = Section(runtime.document.body, { title: 'X' });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
