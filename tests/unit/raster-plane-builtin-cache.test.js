/*
 * The built-in procedural relief is a CONSTANT — memoize it.
 *
 * `sampleBuiltIn(u, v)` is a pure function of (u, v): no seed, no params, no
 * state. So `renderBuiltinImageData(res)` returns the same pixels every time —
 * yet it re-rendered them from scratch on every call, and the sampler path
 * (createNoiseField) calls it on EVERY generate of a Raster-Plane layer whose
 * source is the default built-in. At SOURCE_RES=384 that is 147,456 samples of
 * exp/sin/cos/hypot per regen — ~950ms of solid synchronous CPU.
 *
 * That made `buildControls()` for a rasterPlane layer cost ~2s (85% of a
 * full-stack test mount). raster-plane-source-widget.test.js mounts per test and
 * so burned ~97s of uninterruptible CPU on CI, starving the vitest worker's event
 * loop until it missed the parent's `onTaskUpdate` ack past birpc's hard-coded
 * 60s RPC timeout — failing CI with "[vitest-worker]: Timeout calling
 * onTaskUpdate" while every single test passed.
 *
 * Consumers only ever sample/draw the raster (never mutate it), so one shared
 * instance per resolution is safe.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('RasterPlaneSource.renderBuiltinImageData memoization', () => {
  let runtime, Source;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Source = runtime.window.Vectura.RasterPlaneSource;
  });
  afterAll(() => runtime.cleanup());

  test('the built-in relief is deterministic, so repeat renders are the same pixels', () => {
    const a = Source.renderBuiltinImageData(64);
    const b = Source.renderBuiltinImageData(64);
    expect(a.width).toBe(64);
    expect(a.height).toBe(64);
    expect(Array.from(b.data)).toEqual(Array.from(a.data));
  });

  test('repeat renders at one resolution reuse the cached raster instead of recomputing', () => {
    const a = Source.renderBuiltinImageData(96);
    const b = Source.renderBuiltinImageData(96);
    // Same instance — the 147k-sample rebuild must not run a second time.
    expect(b).toBe(a);
  });

  test('each resolution is cached independently', () => {
    const small = Source.renderBuiltinImageData(32);
    const large = Source.renderBuiltinImageData(48);
    expect(small.width).toBe(32);
    expect(large.width).toBe(48);
    expect(Source.renderBuiltinImageData(32)).toBe(small);
    expect(Source.renderBuiltinImageData(48)).toBe(large);
  });
});
