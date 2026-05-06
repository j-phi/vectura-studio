const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.HarmonographPlotter', () => {
  let runtime;
  let HarmonographPlotter;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'harmonograph-plotter']);
    HarmonographPlotter = runtime.window.Vectura.UI.HarmonographPlotter;
  });
  afterEach(() => runtime.cleanup());

  test('renders a canvas of the requested size', () => {
    const inst = HarmonographPlotter(runtime.document.body, { width: 160, height: 120 });
    const canvas = inst.el.querySelector('canvas');
    expect(canvas.width).toBe(160);
    expect(canvas.height).toBe(120);
    inst.destroy();
  });

  test('redraw() can be called without throwing on empty pendulums', () => {
    const inst = HarmonographPlotter(runtime.document.body, {});
    expect(() => inst.redraw()).not.toThrow();
    inst.destroy();
  });

  test('update() resizes the canvas when width/height change', () => {
    const inst = HarmonographPlotter(runtime.document.body, { width: 100, height: 80 });
    inst.update({ width: 200, height: 150 });
    const canvas = inst.el.querySelector('canvas');
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(150);
    inst.destroy();
  });

  test('plotter does not throw with realistic pendulum input', () => {
    const inst = HarmonographPlotter(runtime.document.body, {
      pendulums: [
        { frequency: 1.5, phase: 0, decay: 0.001, amplitude: 1 },
        { frequency: 2.0, phase: 90, decay: 0.0015, amplitude: 0.8 },
        { frequency: 1.7, phase: 45, decay: 0.0005, amplitude: 0.9 },
        { frequency: 1.9, phase: 30, decay: 0.0008, amplitude: 0.7 },
      ],
      duration: 10,
      sampleStep: 0.05,
    });
    expect(() => inst.redraw()).not.toThrow();
    inst.destroy();
  });

  test('destroy() removes the element', () => {
    const inst = HarmonographPlotter(runtime.document.body, {});
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
