const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// TUX-038 req 5: the double-tap that renames a layer is measured with the pointer events' own
// timeStamp, never with the clock at handler run time. A busy main thread (a slow regenerate)
// delays the second handler. The old code read Date.now() there and so dropped a real double-tap.
// jsdom, coarse pointer. Both taps are pointerdown + click pairs on the same .lvl-name.
const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('TUX-038 layer rename uses event.timeStamp', () => {
  let runtime;
  let clock;
  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const boot = async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true });
    const { window } = runtime;
    window.matchMedia = (q) => ({
      matches: /pointer:\s*coarse/.test(String(q)),
      media: String(q),
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    });
    window.app = new window.Vectura.App();
    await waitForUi();
    window.app.engine.addLayer('spiral');
    window.app.engine.addLayer('rings');
    window.app.ui.renderLayers();
    await waitForUi();
    // Wall clock under test control from here on (the blocked-thread simulation).
    clock = 5_000_000;
    window.Date.now = () => clock;
    return window;
  };

  const nameEl = (window, id) => window.document.querySelector(`#layer-list [data-lvl-id="${id}"] .lvl-name`);

  // One tap: pointerdown then click, both stamped with `stamp` (the browser stamps events when it
  // queues them, not when the handler runs).
  const tap = (window, id, stamp) => {
    const el = nameEl(window, id);
    const mk = (Type, type) => {
      const ev = new Type(type, { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7 });
      Object.defineProperty(ev, 'timeStamp', { value: stamp });
      return ev;
    };
    el.dispatchEvent(mk(window.MouseEvent, 'pointerdown'));
    el.dispatchEvent(mk(window.MouseEvent, 'click'));
  };

  test('two taps 120 ms apart open the rename input although the second handler runs 400 ms late', async () => {
    const window = await boot();
    const id = window.app.engine.layers[0].id;
    tap(window, id, 1000);
    clock += 400; // main thread blocked: the second handler runs 400 ms after the first
    tap(window, id, 1120);
    expect(window.document.querySelector('#layer-list .lvl-ren-inp'), 'rename input').toBeTruthy();
  });

  test('two taps 600 ms apart do not rename', async () => {
    const window = await boot();
    const id = window.app.engine.layers[0].id;
    tap(window, id, 1000);
    clock += 600;
    tap(window, id, 1600);
    expect(window.document.querySelector('#layer-list .lvl-ren-inp')).toBeNull();
  });

  test('two quick taps on different rows do not rename', async () => {
    const window = await boot();
    const [a, b] = window.app.engine.layers.map((l) => l.id);
    tap(window, a, 1000);
    tap(window, b, 1100);
    expect(window.document.querySelector('#layer-list .lvl-ren-inp')).toBeNull();
  });
});
