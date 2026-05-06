const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.PendulumList', () => {
  let runtime;
  let PendulumList;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'slider', 'pendulum-list']);
    PendulumList = runtime.window.Vectura.UI.PendulumList;
  });
  afterEach(() => runtime.cleanup());

  test('renders one row per pendulum with 4 sliders each', () => {
    const inst = PendulumList(runtime.document.body, {
      pendulums: [
        { frequency: 1.5, phase: 0, decay: 0.001, amplitude: 0.5 },
        { frequency: 2.0, phase: 90, decay: 0.002, amplitude: 0.4 },
      ],
      onChange: () => {},
    });
    const rows = inst.el.querySelectorAll('.pendulum-row');
    expect(rows.length).toBe(2);
    rows.forEach((row) => {
      expect(row.querySelectorAll('.ctrl-slider').length).toBe(4);
    });
    inst.destroy();
  });

  test('+ Add adds a new pendulum and fires onChange', () => {
    const log = [];
    const inst = PendulumList(runtime.document.body, {
      pendulums: [{ frequency: 1, phase: 0, decay: 0, amplitude: 1 }],
      onChange: (v) => log.push(v.length),
    });
    inst.el.querySelector('.add-btn').dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual([2]);
    expect(inst.getValue().length).toBe(2);
    inst.destroy();
  });

  test('respects maxCount', () => {
    const inst = PendulumList(runtime.document.body, {
      pendulums: [{ frequency: 1, phase: 0, decay: 0, amplitude: 1 }],
      maxCount: 1,
      onChange: () => {},
    });
    expect(inst.el.querySelector('.add-btn').disabled).toBe(true);
    inst.destroy();
  });

  test('remove button removes a pendulum and fires onChange', () => {
    const log = [];
    const inst = PendulumList(runtime.document.body, {
      pendulums: [
        { frequency: 1, phase: 0, decay: 0, amplitude: 1 },
        { frequency: 2, phase: 0, decay: 0, amplitude: 1 },
      ],
      minCount: 1,
      onChange: (v) => log.push(v.length),
    });
    const removeBtns = inst.el.querySelectorAll('.pendulum-row button[aria-label="Remove pendulum"]');
    removeBtns[0].dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual([1]);
    expect(inst.getValue().length).toBe(1);
    inst.destroy();
  });

  test('destroy() detaches all sliders', () => {
    const inst = PendulumList(runtime.document.body, {
      pendulums: [{ frequency: 1, phase: 0, decay: 0, amplitude: 1 }],
      onChange: () => {},
    });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
