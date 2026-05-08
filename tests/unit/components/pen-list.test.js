const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.PenList', () => {
  let runtime;
  let PenList;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'slider', 'pen-item', 'pen-list']);
    PenList = runtime.window.Vectura.UI.PenList;
  });
  afterEach(() => runtime.cleanup());

  test('renders one PenItem per pen', () => {
    const inst = PenList(runtime.document.body, {
      pens: [
        { id: 'a', label: 'P1', color: '#000', weight: 0.4 },
        { id: 'b', label: 'P2', color: '#fff', weight: 0.8 },
      ],
      onChange: () => {},
    });
    expect(inst.el.querySelectorAll('.pen-item').length).toBe(2);
    inst.destroy();
  });

  test('+ Add adds a pen and fires onChange', () => {
    const log = [];
    const inst = PenList(runtime.document.body, {
      pens: [{ id: 'a', label: 'P1', color: '#000', weight: 0.4 }],
      onChange: (v) => log.push(v.length),
    });
    inst.el.querySelector('.add-btn').dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual([2]);
    inst.destroy();
  });

  test('weight slider input fires onChange with updated pen weight', () => {
    const log = [];
    const inst = PenList(runtime.document.body, {
      pens: [{ id: 'a', label: 'P1', color: '#000', weight: 0.4 }],
      onChange: (v) => log.push(v),
    });
    const slider = inst.el.querySelector('.pen-sld');
    slider.value = '1.2';
    slider.dispatchEvent(new runtime.window.Event('input', { bubbles: true }));
    expect(log.length).toBe(1);
    expect(log[0][0].weight).toBe(1.2);
    inst.destroy();
  });

  test('color dot click bubbles up to onColorClick', () => {
    const log = [];
    const inst = PenList(runtime.document.body, {
      pens: [{ id: 'pen-7', label: 'P7', color: '#000', weight: 0.4 }],
      onColorClick: (id) => log.push(id),
      onChange: () => {},
    });
    inst.el.querySelector('.pen-dot').dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(log).toEqual(['pen-7']);
    inst.destroy();
  });

  test('respects minCount on remove', () => {
    const inst = PenList(runtime.document.body, {
      pens: [{ id: 'a', label: 'P1', color: '#000', weight: 0.4 }],
      minCount: 1,
      onChange: () => {},
    });
    expect(inst.el.querySelector('.pen-list-remove')).toBeFalsy();
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = PenList(runtime.document.body, {
      pens: [{ id: 'a', label: 'P1', color: '#000', weight: 0.4 }],
      onChange: () => {},
    });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
