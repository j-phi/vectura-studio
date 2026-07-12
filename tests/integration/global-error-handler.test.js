/*
 * AUD-17 regression coverage.
 *
 * Before this change, no `error`/`unhandledrejection` listener existed
 * anywhere in the app: any uncaught exception left the user staring at a
 * silently dead UI with no message and no recovery hint. This exercises the
 * handler installed in App's constructor (src/app/app.js
 * installGlobalErrorHandler): console.error + a rate-limited danger toast,
 * with benign noise filtered out.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Global error handler (AUD-17)', () => {
  let runtime, window, document;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const dangerToasts = () => {
    const host = document.getElementById('vectura-toast-host');
    if (!host) return [];
    return Array.from(host.querySelectorAll('.vectura-toast-danger'));
  };

  test('an uncaught error is logged and toasted', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ev = new window.ErrorEvent('error', { message: 'boom', error: new Error('boom') });
    window.dispatchEvent(ev);

    expect(errSpy).toHaveBeenCalled();
    expect(dangerToasts().length).toBeGreaterThanOrEqual(1);
    errSpy.mockRestore();
  });

  test('an unhandled promise rejection is logged and toasted', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const ev = new window.Event('unhandledrejection');
    ev.reason = new Error('rejected');
    window.dispatchEvent(ev);

    expect(errSpy).toHaveBeenCalled();
    expect(dangerToasts().length).toBeGreaterThanOrEqual(1);
    errSpy.mockRestore();
  });

  test('two errors back-to-back only fire one toast (rate-limited)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    window.dispatchEvent(new window.ErrorEvent('error', { message: 'first', error: new Error('first') }));
    const afterFirst = dangerToasts().length;
    window.dispatchEvent(new window.ErrorEvent('error', { message: 'second', error: new Error('second') }));
    const afterSecond = dangerToasts().length;

    // Both are still logged individually...
    expect(errSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    // ...but only the first produced a toast.
    expect(afterFirst).toBeGreaterThanOrEqual(1);
    expect(afterSecond).toBe(afterFirst);
    errSpy.mockRestore();
  });

  test('a ResizeObserver loop message is filtered — no toast, no console.error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = dangerToasts().length;

    window.dispatchEvent(new window.ErrorEvent('error', {
      message: 'ResizeObserver loop completed with undelivered notifications.',
    }));

    expect(dangerToasts().length).toBe(before);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('a stackless cross-origin "Script error." is filtered — no toast, no console.error', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = dangerToasts().length;

    window.dispatchEvent(new window.ErrorEvent('error', { message: 'Script error.' }));

    expect(dangerToasts().length).toBe(before);
    expect(errSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  test('the handler is installed only once per window across repeated App construction', () => {
    // A second App() in the same window must not stack a second listener —
    // otherwise one dispatched error would produce two toasts.
    // eslint-disable-next-line no-new
    new window.Vectura.App();

    const before = dangerToasts().length;
    window.dispatchEvent(new window.ErrorEvent('error', { message: 'dup-check', error: new Error('dup-check') }));
    expect(dangerToasts().length).toBe(before + 1);
  });
});
