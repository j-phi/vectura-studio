const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.overlays.DragDropOverlay', () => {
  let runtime;
  let DragDropOverlay;

  // JSDOM lacks DataTransfer; provide a minimal stub used by the listeners.
  const mkDt = (files) => ({
    types: ['Files'],
    files: files || [],
    dropEffect: 'copy',
    effectAllowed: 'all',
  });

  const mkEvent = (kind, opts = {}) => {
    const ev = new runtime.window.Event(kind, { bubbles: true, cancelable: true });
    if (opts.dataTransfer) Object.defineProperty(ev, 'dataTransfer', { value: opts.dataTransfer });
    return ev;
  };

  beforeEach(() => {
    runtime = loadUIComponent(['utils', 'drag-drop']);
    DragDropOverlay = runtime.window.Vectura.UI.overlays.DragDropOverlay;
  });
  afterEach(() => runtime.cleanup());

  test('hidden until dragenter with files is received', () => {
    const inst = DragDropOverlay(runtime.document.body, { onDrop: () => {} });
    inst.activate();
    expect(inst.isVisible()).toBe(false);
    runtime.window.dispatchEvent(mkEvent('dragenter', { dataTransfer: mkDt() }));
    expect(inst.isVisible()).toBe(true);
    inst.destroy();
  });

  test('dragleave from the window hides it once depth returns to 0', () => {
    const inst = DragDropOverlay(runtime.document.body, { onDrop: () => {} });
    inst.activate();
    runtime.window.dispatchEvent(mkEvent('dragenter', { dataTransfer: mkDt() }));
    runtime.window.dispatchEvent(mkEvent('dragleave', { dataTransfer: mkDt() }));
    expect(inst.isVisible()).toBe(false);
    inst.destroy();
  });

  test('drop fires onDrop with the FileList contents', () => {
    const log = [];
    const inst = DragDropOverlay(runtime.document.body, { onDrop: (files) => log.push(files) });
    inst.activate();
    runtime.window.dispatchEvent(mkEvent('dragenter', { dataTransfer: mkDt() }));
    const fakeFile = new runtime.window.File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' });
    runtime.window.dispatchEvent(mkEvent('drop', { dataTransfer: mkDt([fakeFile]) }));
    expect(log.length).toBe(1);
    expect(log[0][0].name).toBe('a.svg');
    expect(inst.isVisible()).toBe(false);
    inst.destroy();
  });

  test('accept filters files by extension', () => {
    const log = [];
    const inst = DragDropOverlay(runtime.document.body, {
      accept: ['.svg'],
      onDrop: (files) => log.push(files),
    });
    inst.activate();
    runtime.window.dispatchEvent(mkEvent('dragenter', { dataTransfer: mkDt() }));
    const txt = new runtime.window.File(['x'], 'a.txt', { type: 'text/plain' });
    runtime.window.dispatchEvent(mkEvent('drop', { dataTransfer: mkDt([txt]) }));
    expect(log.length).toBe(0);
    inst.destroy();
  });

  test('deactivate detaches the listeners', () => {
    const inst = DragDropOverlay(runtime.document.body, { onDrop: () => {} });
    inst.activate();
    inst.deactivate();
    runtime.window.dispatchEvent(mkEvent('dragenter', { dataTransfer: mkDt() }));
    expect(inst.isVisible()).toBe(false);
    inst.destroy();
  });
});
