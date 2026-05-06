const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.PenItem', () => {
  let runtime;
  let PenItem;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'motion', 'slider', 'pen-item']);
    PenItem = runtime.window.Vectura.UI.PenItem;
  });
  afterEach(() => runtime.cleanup());

  test('renders dot, label, pen slider with .pen-w chip', () => {
    const inst = PenItem(runtime.document.body, { id: 1, label: 'P1', color: '#aabbcc', weight: 0.4 });
    expect(inst.el.classList.contains('pen-item')).toBe(true);
    expect(inst.el.dataset.penId).toBe('1');
    expect(inst.el.querySelector('.pen-dot')).toBeTruthy();
    expect(inst.el.querySelector('.pen-nm').textContent).toBe('P1');
    expect(inst.el.querySelector('.pen-sld')).toBeTruthy();
    expect(inst.el.querySelector('.pen-w')).toBeTruthy();
    inst.destroy();
  });

  test('clicking the dot fires onColorClick with the pen id', () => {
    const events = [];
    const inst = PenItem(runtime.document.body, { id: 7, label: 'P7', onColorClick: (id) => events.push(id) });
    inst.el.querySelector('.pen-dot').dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events).toEqual([7]);
    inst.destroy();
  });

  test('weight slider fires onWeightChange/Commit with the pen id', () => {
    const changes = [];
    const commits = [];
    const inst = PenItem(runtime.document.body, {
      id: 'p2', weight: 0.4,
      onWeightChange: (w, id) => changes.push({ w, id }),
      onWeightCommit: (w, id) => commits.push({ w, id }),
    });
    const slider = inst.el.querySelector('.pen-sld');
    slider.value = '1';
    slider.dispatchEvent(new runtime.window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new runtime.window.Event('change', { bubbles: true }));
    expect(changes).toEqual([{ w: 1, id: 'p2' }]);
    expect(commits).toEqual([{ w: 1, id: 'p2' }]);
    inst.destroy();
  });

  test('update() syncs color, label, and weight without recreating el', () => {
    const inst = PenItem(runtime.document.body, { id: 1, label: 'A', color: '#000', weight: 0.4 });
    const ref = inst.el;
    inst.update({ label: 'B', color: '#ffffff', weight: 1.2 });
    expect(inst.el).toBe(ref);
    expect(inst.el.querySelector('.pen-nm').textContent).toBe('B');
    expect(inst.el.querySelector('.pen-sld').value).toBe('1.2');
    inst.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = PenItem(runtime.document.body, { id: 1, weight: 0.4 });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
