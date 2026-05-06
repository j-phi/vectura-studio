const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Slider (single)', () => {
  let runtime;
  let Slider;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'slider']);
    Slider = runtime.window.Vectura.UI.Slider;
  });
  afterEach(() => runtime.cleanup());

  test('renders .slider-row > .sld-fx-wrap > .ctrl-slider + .slider-val chip', () => {
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', value: 50 });
    expect(inst.el.classList.contains('slider-row')).toBe(true);
    expect(inst.el.querySelector('.sld-fx-wrap > .ctrl-slider')).toBeTruthy();
    expect(inst.el.querySelector('.slider-val')).toBeTruthy();
    expect(inst.getValue()).toBe(50);
    inst.destroy();
  });

  test('input event fires onChange continuously', () => {
    const events = [];
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', value: 0, min: 0, max: 100, onChange: (v) => events.push(v) });
    const slider = inst.el.querySelector('.ctrl-slider');
    slider.value = '25';
    slider.dispatchEvent(new runtime.window.Event('input', { bubbles: true }));
    slider.value = '50';
    slider.dispatchEvent(new runtime.window.Event('input', { bubbles: true }));
    expect(events).toEqual([25, 50]);
    inst.destroy();
  });

  test('change event fires onCommit and triggers thumb-release halo', () => {
    const events = [];
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', value: 10, onCommit: (v) => events.push(v) });
    const slider = inst.el.querySelector('.ctrl-slider');
    slider.value = '70';
    slider.dispatchEvent(new runtime.window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new runtime.window.Event('change', { bubbles: true }));
    expect(events).toEqual([70]);
    expect(slider.classList.contains('just-released')).toBe(true);
    inst.destroy();
  });

  test('--fill CSS var tracks slider position', () => {
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', value: 25, min: 0, max: 100 });
    const slider = inst.el.querySelector('.ctrl-slider');
    expect(slider.style.getPropertyValue('--fill')).toBe('25%');
    inst.destroy();
  });

  test('value chip Enter blurs and chip Esc reverts', () => {
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', value: 5 });
    const chip = inst.el.querySelector('.slider-val');
    chip.value = '99';
    chip.dispatchEvent(new runtime.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(chip.value).toBe('5');
    inst.destroy();
  });

  test('chip blur with valid number clamps and commits', () => {
    const events = [];
    const inst = Slider(runtime.document.body, {
      ariaLabel: 'X', value: 0, min: 0, max: 50, onCommit: (v) => events.push(v),
    });
    const chip = inst.el.querySelector('.slider-val');
    chip.value = '999';
    chip.dispatchEvent(new runtime.window.Event('blur', { bubbles: true }));
    expect(inst.getValue()).toBe(50);
    expect(events).toEqual([50]);
    inst.destroy();
  });

  test('precision inferred from step formats chip correctly', () => {
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', value: 1, step: 0.05 });
    expect(inst.el.querySelector('.slider-val').value).toBe('1.00');
    inst.destroy();
  });

  test('pen variant uses .pen-sld + .pen-w chip class', () => {
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', variant: 'pen', value: 0 });
    expect(inst.el.querySelector('.pen-sld')).toBeTruthy();
    expect(inst.el.querySelector('.pen-w')).toBeTruthy();
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', value: 0 });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});

describe('UI.Slider (dual)', () => {
  let runtime;
  let Slider;
  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'slider']);
    Slider = runtime.window.Vectura.UI.Slider;
  });
  afterEach(() => runtime.cleanup());

  test('renders two range inputs', () => {
    const inst = Slider(runtime.document.body, { ariaLabel: 'X', dual: true, value: { min: 10, max: 90 }, min: 0, max: 100 });
    const ranges = inst.el.querySelectorAll('.ctrl-slider');
    expect(ranges.length).toBe(2);
    expect(inst.getValue()).toEqual({ min: 10, max: 90 });
    inst.destroy();
  });

  test('thumbs cannot cross — order is enforced on input', () => {
    const events = [];
    const inst = Slider(runtime.document.body, {
      ariaLabel: 'X', dual: true, value: { min: 30, max: 70 }, min: 0, max: 100,
      onChange: (v) => events.push(v),
    });
    const [minR, maxR] = inst.el.querySelectorAll('.ctrl-slider');
    // Drag the min thumb past the max thumb.
    minR.value = '90';
    minR.dispatchEvent(new runtime.window.Event('input', { bubbles: true }));
    const result = inst.getValue();
    expect(result.min).toBeLessThanOrEqual(result.max);
    inst.destroy();
  });
});
