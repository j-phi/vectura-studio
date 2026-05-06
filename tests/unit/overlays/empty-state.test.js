const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.EmptyState', () => {
  let runtime;
  let EmptyState;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'empty-state']);
    EmptyState = runtime.window.Vectura.UI.overlays.EmptyState;
  });
  afterEach(() => runtime.cleanup());

  test('renders illustration, title, message, and CTA', () => {
    const log = [];
    const inst = EmptyState(runtime.document.body, {
      illustration: '<svg width="32" height="32"></svg>',
      title: 'No layers',
      message: 'Add a layer to get started',
      cta: { label: 'Add Layer', onClick: () => log.push('clicked') },
    });
    expect(inst.el.querySelector('.vectura-empty-state-illustration svg')).toBeTruthy();
    expect(inst.el.querySelector('.vectura-empty-state-title').textContent).toBe('No layers');
    expect(inst.el.querySelector('.vectura-empty-state-message').textContent).toBe('Add a layer to get started');
    const ctaBtn = inst.el.querySelector('.add-btn');
    expect(ctaBtn).toBeTruthy();
    ctaBtn.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['clicked']);
    inst.destroy();
  });

  test('omitted parts hide cleanly', () => {
    const inst = EmptyState(runtime.document.body, { title: 'Hello' });
    expect(inst.el.querySelector('.vectura-empty-state-message').style.display).toBe('none');
    expect(inst.el.querySelector('.add-btn')).toBeFalsy();
    inst.destroy();
  });

  test('update() refreshes content', () => {
    const inst = EmptyState(runtime.document.body, { title: 'A' });
    inst.update({ title: 'B', message: 'New message' });
    expect(inst.el.querySelector('.vectura-empty-state-title').textContent).toBe('B');
    expect(inst.el.querySelector('.vectura-empty-state-message').textContent).toBe('New message');
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = EmptyState(runtime.document.body, { title: 'X' });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
