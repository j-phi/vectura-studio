const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.BtnPulse', () => {
  let runtime;
  let BtnPulse;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'btn-pulse']);
    BtnPulse = runtime.window.Vectura.UI.BtnPulse;
  });
  afterEach(() => runtime.cleanup());

  test('returns a {el, update, destroy} instance', () => {
    const inst = BtnPulse(runtime.document.body, { label: 'Hello', onClick: () => {} });
    expect(inst.el).toBeInstanceOf(runtime.window.HTMLButtonElement);
    expect(typeof inst.update).toBe('function');
    expect(typeof inst.destroy).toBe('function');
  });

  test('renders the label text', () => {
    const inst = BtnPulse(runtime.document.body, { label: 'Save', onClick: () => {} });
    expect(inst.el.textContent).toContain('Save');
  });

  test('applies the variant class', () => {
    const inst = BtnPulse(runtime.document.body, { label: 'Add', variant: 'primary', onClick: () => {} });
    expect(inst.el.classList.contains('add-btn')).toBe(true);
    expect(inst.el.classList.contains('hdr-btn')).toBe(false);
  });

  test('renders an icon before the label when provided', () => {
    const inst = BtnPulse(runtime.document.body, {
      label: 'X',
      icon: '<svg width="8" height="8"></svg>',
      onClick: () => {},
    });
    const icon = inst.el.querySelector('.btn-pulse-icon');
    expect(icon).toBeTruthy();
    expect(icon.querySelector('svg')).toBeTruthy();
    // Icon should precede the label span.
    expect(inst.el.firstElementChild).toBe(icon);
  });

  test('click adds .btn-pulse and invokes onClick', () => {
    let count = 0;
    const inst = BtnPulse(runtime.document.body, { label: 'Tap', onClick: () => { count += 1; } });
    inst.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(count).toBe(1);
    expect(inst.el.classList.contains('btn-pulse')).toBe(true);
  });

  test('does not invoke onClick when disabled', () => {
    let count = 0;
    const inst = BtnPulse(runtime.document.body, { label: 'X', disabled: true, onClick: () => { count += 1; } });
    inst.el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(count).toBe(0);
  });

  test('update() swaps label, icon, variant, and disabled state without re-creating el', () => {
    const inst = BtnPulse(runtime.document.body, { label: 'A', onClick: () => {} });
    const ref = inst.el;
    inst.update({ label: 'B', variant: 'tool', icon: '<svg></svg>', disabled: true, onClick: () => {} });
    expect(inst.el).toBe(ref);
    expect(inst.el.textContent).toContain('B');
    expect(inst.el.classList.contains('tool-btn')).toBe(true);
    expect(inst.el.classList.contains('hdr-btn')).toBe(false);
    expect(inst.el.disabled).toBe(true);
    expect(inst.el.querySelector('.btn-pulse-icon')).toBeTruthy();
  });

  test('destroy() removes el from DOM and detaches click listener', () => {
    let count = 0;
    const inst = BtnPulse(runtime.document.body, { label: 'X', onClick: () => { count += 1; } });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
    el.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(count).toBe(0);
  });

  test('host=null leaves caller responsible for appending', () => {
    const inst = BtnPulse(null, { label: 'Detached', onClick: () => {} });
    expect(inst.el.parentNode).toBeNull();
  });
});
