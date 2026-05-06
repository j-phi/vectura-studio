const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.InfoBadge', () => {
  let runtime;
  let InfoBadge;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'tooltip', 'info-badge']);
    InfoBadge = runtime.window.Vectura.UI.InfoBadge;
  });
  afterEach(() => runtime.cleanup());

  test('renders an `i` button with .info-badge and aria-label', () => {
    const inst = InfoBadge(runtime.document.body, { text: 'Help' });
    expect(inst.el.tagName).toBe('BUTTON');
    expect(inst.el.classList.contains('info-badge')).toBe(true);
    expect(inst.el.textContent).toBe('i');
    expect(inst.el.getAttribute('aria-label')).toBe('Help');
    inst.destroy();
  });

  test('pointerenter shows the tooltip with the prop text', async () => {
    const inst = InfoBadge(runtime.document.body, { text: 'Tip text' });
    inst.el.dispatchEvent(new runtime.window.Event('pointerenter'));
    await new Promise((r) => setTimeout(r, 230));
    const tooltipEl = runtime.document.querySelector('.vectura-tooltip');
    expect(tooltipEl).toBeTruthy();
    expect(tooltipEl.style.visibility).toBe('visible');
    expect(tooltipEl.textContent).toBe('Tip text');
    inst.destroy();
  });

  test('pointerleave hides the tooltip', async () => {
    const inst = InfoBadge(runtime.document.body, { text: 'X' });
    inst.el.dispatchEvent(new runtime.window.Event('pointerenter'));
    await new Promise((r) => setTimeout(r, 230));
    inst.el.dispatchEvent(new runtime.window.Event('pointerleave'));
    await new Promise((r) => setTimeout(r, 120));
    const tooltipEl = runtime.document.querySelector('.vectura-tooltip');
    expect(tooltipEl.style.visibility).toBe('hidden');
    inst.destroy();
  });

  test('click invokes onOpenLong only when longContent is set', () => {
    let count = 0;
    const inst = InfoBadge(runtime.document.body, {
      text: 'short', longContent: 'long body', onOpenLong: () => { count += 1; },
    });
    inst.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(count).toBe(1);
    inst.destroy();

    let count2 = 0;
    const noLong = InfoBadge(runtime.document.body, { text: 'short', onOpenLong: () => { count2 += 1; } });
    noLong.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(count2).toBe(0);
    noLong.destroy();
  });

  test('Enter and Space trigger onOpenLong when longContent is set', () => {
    let count = 0;
    const inst = InfoBadge(runtime.document.body, {
      text: 'short', longContent: 'long', onOpenLong: () => { count += 1; },
    });
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    inst.el.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(count).toBe(2);
    inst.destroy();
  });

  test('update() refreshes text and aria-label', () => {
    const inst = InfoBadge(runtime.document.body, { text: 'A' });
    inst.update({ text: 'B' });
    expect(inst.el.getAttribute('aria-label')).toBe('B');
    inst.destroy();
  });

  test('destroy() removes the badge and the tooltip element', async () => {
    const inst = InfoBadge(runtime.document.body, { text: 'X' });
    inst.el.dispatchEvent(new runtime.window.Event('pointerenter'));
    await new Promise((r) => setTimeout(r, 230));
    expect(runtime.document.querySelector('.vectura-tooltip')).toBeTruthy();
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
    expect(runtime.document.querySelector('.vectura-tooltip')).toBeFalsy();
  });
});
