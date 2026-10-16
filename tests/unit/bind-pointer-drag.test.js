/**
 * TUX-018: bindPointerDrag captures on down, pairs pointerup with pointercancel, and ignores a second pointer.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Vectura.UI.bindPointerDrag', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime({}); });
  afterAll(() => runtime.cleanup());

  const setup = (opts) => {
    const { window } = runtime;
    const el = window.document.createElement('div');
    window.document.body.appendChild(el);
    el.setPointerCapture = vi.fn();
    const calls = [];
    const unbind = window.Vectura.UI.bindPointerDrag(el, {
      down: () => calls.push('down'),
      move: () => calls.push('move'),
      end: () => calls.push('end'),
      abort: () => calls.push('abort'),
      ...opts,
    });
    const fire = (target, type, id = 1) => {
      const e = new window.Event(type, { bubbles: true });
      e.pointerId = id; e.button = 0; e.clientX = 1; e.clientY = 1;
      target.dispatchEvent(e);
    };
    return { el, calls, unbind, fire, window };
  };

  test('capture on down, move, end on pointerup', () => {
    const { el, calls, fire, window } = setup();
    fire(el, 'pointerdown');
    expect(el.setPointerCapture).toHaveBeenCalledWith(1);
    fire(window, 'pointermove');
    fire(window, 'pointerup');
    fire(window, 'pointermove');
    expect(calls).toEqual(['down', 'move', 'end']);
  });

  test('pointercancel runs abort, never end', () => {
    const { el, calls, fire, window } = setup();
    fire(el, 'pointerdown');
    fire(window, 'pointercancel');
    fire(window, 'pointerup');
    expect(calls).toEqual(['down', 'abort']);
  });

  test('a second pointer is ignored while a drag runs', () => {
    const { el, calls, fire, window } = setup();
    fire(el, 'pointerdown', 1);
    fire(window, 'pointerup', 2);
    fire(window, 'pointermove', 2);
    expect(calls).toEqual(['down']);
    fire(window, 'pointerup', 1);
    expect(calls).toEqual(['down', 'end']);
  });

  test('down returning false refuses the drag', () => {
    const { el, calls, fire, window } = setup({ down: () => false });
    fire(el, 'pointerdown');
    fire(window, 'pointermove');
    expect(calls).toEqual([]);
    expect(el.setPointerCapture).not.toHaveBeenCalled();
  });
});
