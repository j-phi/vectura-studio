const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.EmptyStates (Phase 4 illustrations)', () => {
  let runtime;
  let EmptyStates;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'empty-state', 'empty-state-illustrations']);
    EmptyStates = runtime.window.Vectura.UI.EmptyStates;
  });
  afterEach(() => runtime.cleanup());

  test('exposes ICONS for the four canonical empty surfaces', () => {
    expect(EmptyStates).toBeTruthy();
    expect(typeof EmptyStates.ICONS.layers).toBe('string');
    expect(typeof EmptyStates.ICONS.canvas).toBe('string');
    expect(typeof EmptyStates.ICONS.palette).toBe('string');
    expect(typeof EmptyStates.ICONS.patterns).toBe('string');
    Object.values(EmptyStates.ICONS).forEach((svg) => {
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('currentColor');
    });
  });

  test('attach(host, { kind }) renders illustration into EmptyState shell', () => {
    const inst = EmptyStates.attach(runtime.document.body, {
      kind: 'layers',
      title: 'No layers yet',
      message: 'Add an algorithm to begin',
    });
    expect(inst).toBeTruthy();
    expect(inst.el.classList.contains('vectura-empty-state')).toBe(true);
    const svg = inst.el.querySelector('.vectura-empty-state-illustration svg');
    expect(svg).toBeTruthy();
    expect(inst.el.querySelector('.vectura-empty-state-title').textContent).toBe('No layers yet');
    inst.destroy();
  });

  test('attach honors raw illustration override', () => {
    const inst = EmptyStates.attach(runtime.document.body, {
      illustration: '<svg data-test="custom"></svg>',
      title: 'X',
    });
    const svg = inst.el.querySelector('.vectura-empty-state-illustration svg');
    expect(svg.getAttribute('data-test')).toBe('custom');
    inst.destroy();
  });

  test('attach with cta wires onClick', () => {
    const log = [];
    const inst = EmptyStates.attach(runtime.document.body, {
      kind: 'palette',
      title: 'No swatches',
      cta: { label: 'Add', onClick: () => log.push('hit') },
    });
    const btn = inst.el.querySelector('.add-btn');
    expect(btn.textContent).toBe('Add');
    btn.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['hit']);
    inst.destroy();
  });

  test('attach returns null if EmptyState primitive missing', () => {
    delete runtime.window.Vectura.UI.overlays.EmptyState;
    const inst = EmptyStates.attach(runtime.document.body, { kind: 'layers' });
    expect(inst).toBeNull();
  });
});
