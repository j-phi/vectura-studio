/*
 * The jsdom test runtime must stub canvas EXPORT, not just canvas drawing.
 *
 * `load-vectura-runtime` stubs `getContext` (canvas is a no-op in these tests)
 * but left `toDataURL`/`toBlob` as jsdom's real implementations, which have no
 * backend: each call emits a `jsdomError` ("Not implemented: ...") that the
 * default virtual console forwards to `console.error` with a full stack trace.
 *
 * That fired ~2,344 times across the suite. Vitest's worker console interceptor
 * ships every console call to the parent process over birpc, so the flood
 * saturated the parent's event loop; it then failed to ack a worker's
 * `onTaskUpdate` within birpc's hard-coded 60s RPC timeout, and the run died on
 * "[vitest-worker]: Timeout calling onTaskUpdate" — an unhandled error that
 * fails CI even though every single test passed.
 *
 * Keep canvas export stubbed so the suite stays quiet on the RPC wire.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('jsdom runtime: canvas export is stubbed', () => {
  let runtime;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); });
  afterAll(() => runtime.cleanup());

  test('toDataURL returns a data URL instead of emitting a jsdom "Not implemented" error', () => {
    const canvas = runtime.document.createElement('canvas');
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    let url;
    try {
      url = canvas.toDataURL('image/png');
    } finally {
      console.error = original;
    }

    expect(typeof url).toBe('string');
    expect(url.startsWith('data:image/png')).toBe(true);
    expect(errors.join('\n')).not.toMatch(/Not implemented/);
  });

  test('toBlob invokes its callback instead of emitting a jsdom "Not implemented" error', () => {
    const canvas = runtime.document.createElement('canvas');
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args.map(String).join(' '));
    let called = false;
    try {
      canvas.toBlob(() => { called = true; });
    } finally {
      console.error = original;
    }

    expect(called).toBe(true);
    expect(errors.join('\n')).not.toMatch(/Not implemented/);
  });
});
