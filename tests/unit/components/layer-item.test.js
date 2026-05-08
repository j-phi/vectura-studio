const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.LayerItem', () => {
  let runtime;
  let LayerItem;

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'icons', 'layer-item']);
    LayerItem = runtime.window.Vectura.UI.LayerItem;
  });
  afterEach(() => runtime.cleanup());

  test('renders bar, name, tag, and default action buttons', () => {
    const inst = LayerItem(runtime.document.body, { id: 'L1', name: 'My Layer', tag: 'FLOW', color: '#ff8800' });
    expect(inst.el.classList.contains('layer-item')).toBe(true);
    expect(inst.el.dataset.layerId).toBe('L1');
    expect(inst.el.querySelector('.layer-bar')).toBeTruthy();
    expect(inst.el.querySelector('.layer-name').textContent).toBe('My Layer');
    expect(inst.el.querySelector('.layer-tag').textContent).toBe('FLOW');
    expect(inst.el.querySelectorAll('.layer-act').length).toBe(2);
    inst.destroy();
  });

  test('main click fires onClick with the layer id', () => {
    const events = [];
    const inst = LayerItem(runtime.document.body, { id: 'L1', name: 'X', onClick: (id) => events.push(id) });
    inst.el.querySelector('.layer-name').dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events).toEqual(['L1']);
    inst.destroy();
  });

  test('action button click fires onAction with the action key', () => {
    const events = [];
    const inst = LayerItem(runtime.document.body, { id: 'L1', name: 'X', onAction: (k, id) => events.push({ k, id }) });
    const eyeBtn = inst.el.querySelector('.layer-act[data-action-key="visibility"]');
    eyeBtn.dispatchEvent(new runtime.window.MouseEvent('click', { bubbles: true }));
    expect(events).toEqual([{ k: 'visibility', id: 'L1' }]);
    inst.destroy();
  });

  test('active and dim classes track props', () => {
    const inst = LayerItem(runtime.document.body, { id: 'X', name: 'X', active: true, dim: true });
    expect(inst.el.classList.contains('active')).toBe(true);
    expect(inst.el.classList.contains('dim')).toBe(true);
    inst.update({ active: false });
    expect(inst.el.classList.contains('active')).toBe(false);
    inst.destroy();
  });

  test('drop fires onReorder with from/to ids and position', () => {
    const a = LayerItem(runtime.document.body, { id: 'A', name: 'A' });
    const events = [];
    const b = LayerItem(runtime.document.body, { id: 'B', name: 'B', onReorder: (from, to, pos) => events.push({ from, to, pos }) });
    // JSDOM has no DataTransfer constructor; use a minimal stub. Same instance
    // travels across dragover→drop so getData() returns what setData() wrote.
    const store = new Map();
    const dt = {
      types: ['text/x-vectura-layer-id'],
      setData(type, value) { store.set(type, value); },
      getData(type) { return store.get(type) || ''; },
      effectAllowed: 'all', dropEffect: 'move',
    };
    dt.setData('text/x-vectura-layer-id', 'A');
    const overEvent = new runtime.window.Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(overEvent, 'dataTransfer', { value: dt });
    Object.defineProperty(overEvent, 'clientY', { value: -5 });
    b.el.dispatchEvent(overEvent);
    expect(b.el.classList.contains('drop-above')).toBe(true);
    const dropEvent = new runtime.window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(dropEvent, 'dataTransfer', { value: dt });
    Object.defineProperty(dropEvent, 'clientY', { value: 5 });
    b.el.dispatchEvent(dropEvent);
    expect(events.length).toBe(1);
    expect(events[0].from).toBe('A');
    expect(events[0].to).toBe('B');
    a.destroy(); b.destroy();
  });

  test('destroy() detaches and removes', () => {
    const inst = LayerItem(runtime.document.body, { id: 'X', name: 'X' });
    const el = inst.el;
    inst.destroy();
    expect(el.parentNode).toBeNull();
  });
});
