/* TUX-044: PointerReorder helper. Threshold, midpoint drop, abort, commit-on-change. */
const { loadUIComponent } = require('../helpers/load-ui-component');

describe('Vectura.UI.PointerReorder', () => {
  let ctx; let window; let document; let PR;
  beforeEach(() => {
    ctx = loadUIComponent(['pointer-reorder']);
    ({ window, document } = ctx);
    PR = window.Vectura.UI.PointerReorder;
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
    global.requestAnimationFrame = window.requestAnimationFrame;
    global.cancelAnimationFrame = window.cancelAnimationFrame;
  });
  afterEach(() => ctx.cleanup());

  const fire = (target, type, y, extra = {}) => {
    const ev = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: y, button: 0 });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    Object.defineProperty(ev, 'pointerType', { value: extra.pointerType || 'touch' });
    target.dispatchEvent(ev);
    return ev;
  };

  const build = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const items = [0, 1, 2].map((i) => {
      const el = document.createElement('div');
      el.className = 'item';
      el.dataset.i = String(i);
      el.getBoundingClientRect = () => ({ top: i * 100, height: 100, bottom: i * 100 + 100, left: 0, right: 100, width: 100 });
      const grip = document.createElement('button');
      grip.className = 'grip';
      el.appendChild(grip);
      container.appendChild(el);
      return { el, grip };
    });
    return { container, items };
  };
  const bindAll = (container, items, onCommit) => items.map(({ el, grip }) => PR.bind(grip, {
    container, itemSelector: '.item', dragEl: el, indicatorClass: 'ind', onCommit,
  }));

  test('no lift before 6 px of movement', () => {
    const { container, items } = build();
    bindAll(container, items, () => {});
    fire(items[2].grip, 'pointerdown', 250);
    fire(window, 'pointermove', 246);
    expect(container.querySelector('.ind')).toBeNull();
    expect(items[2].el.classList.contains('dragging')).toBe(false);
    fire(window, 'pointermove', 240);
    expect(container.querySelector('.ind')).not.toBeNull();
    expect(items[2].el.classList.contains('dragging')).toBe(true);
    fire(window, 'pointercancel', 240);
  });

  test('the drop index comes from item midpoints and commit runs once', () => {
    const { container, items } = build();
    const calls = [];
    bindAll(container, items, (n, s) => calls.push([n, s]));
    fire(items[2].grip, 'pointerdown', 250);
    fire(window, 'pointermove', 120); // above item 1's midpoint (150)
    fire(window, 'pointerup', 120);
    expect(calls).toEqual([[1, 2]]);
    expect(container.querySelector('.ind')).toBeNull();
    expect(items[2].el.classList.contains('dragging')).toBe(false);
  });

  test('no commit when the index is unchanged', () => {
    const { container, items } = build();
    const calls = [];
    bindAll(container, items, (n, s) => calls.push([n, s]));
    fire(items[1].grip, 'pointerdown', 150);
    fire(window, 'pointermove', 170);
    fire(window, 'pointerup', 170);
    expect(calls).toEqual([]);
  });

  test('a downward drop lands in the slot the indicator shows', () => {
    const { container, items } = build();
    const calls = [];
    bindAll(container, items, (n, s) => calls.push([n, s]));
    fire(items[0].grip, 'pointerdown', 50);
    fire(window, 'pointermove', 270); // below item 2's midpoint (250): drop last
    fire(window, 'pointerup', 270);
    expect(calls).toEqual([[2, 0]]);
  });

  test('pointercancel aborts: no callback, order and DOM restored', () => {
    const { container, items } = build();
    const calls = [];
    bindAll(container, items, (n, s) => calls.push([n, s]));
    fire(items[2].grip, 'pointerdown', 250);
    fire(window, 'pointermove', 20);
    expect(container.querySelector('.ind')).not.toBeNull();
    fire(window, 'pointercancel', 20);
    expect(calls).toEqual([]);
    expect(container.querySelector('.ind')).toBeNull();
    expect(items[2].el.classList.contains('dragging')).toBe(false);
    expect(Array.from(container.children).map((c) => c.dataset.i)).toEqual(['0', '1', '2']);
  });

  test('the draggable ancestor is switched off for the drag and restored after', () => {
    const { container, items } = build();
    items[0].el.setAttribute('draggable', 'true');
    bindAll(container, items, () => {});
    fire(items[0].grip, 'pointerdown', 50);
    expect(items[0].el.getAttribute('draggable')).toBe('false');
    fire(window, 'pointercancel', 50);
    expect(items[0].el.getAttribute('draggable')).toBe('true');
  });

  test('a right mouse button does not start a drag', () => {
    const { container, items } = build();
    bindAll(container, items, () => {});
    const ev = new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientY: 50, button: 2 });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    Object.defineProperty(ev, 'pointerType', { value: 'mouse' });
    items[0].grip.dispatchEvent(ev);
    fire(window, 'pointermove', 90);
    expect(container.querySelector('.ind')).toBeNull();
  });
});
