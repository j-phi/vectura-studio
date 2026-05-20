/**
 * Renderer token-cache contract.
 *
 * The renderer exposes its closure-local `getThemeToken(name, fallback)` cache
 * on `window.Vectura.Renderer.__tokenCache.get(name, fallback)`. The cache:
 *
 *   1. Reads `--ui-*` tokens directly from `getComputedStyle`. The legacy
 *      `--color-*` alias indirection was removed in Meridian Step 3.3b
 *      (2026-05-20) once every JS caller migrated to `--ui-*`.
 *   2. Invalidates on the `vectura:skin-change` event (dispatched by
 *      `src/ui/skin/skin-manager.js`) so the next read refetches from
 *      `getComputedStyle`.
 *
 * Without these guarantees the renderer reads stale values across skin
 * swaps — a regression the visual baselines would catch on next CI run.
 */
const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

describe('Renderer token cache', () => {
  let runtime;
  let cache;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    document = runtime.document;
    cache = runtime.window.Vectura.Renderer.__tokenCache;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  beforeEach(() => {
    // Reset any test pollution on the documentElement.
    const root = document.documentElement;
    root.style.removeProperty('--ui-test-token');
    root.style.removeProperty('--ui-accent');
    cache.invalidate();
  });

  test('exposes the public API surface', () => {
    expect(cache).toBeDefined();
    expect(typeof cache.get).toBe('function');
    expect(typeof cache.invalidate).toBe('function');
  });

  test('reads --ui-* tokens directly via getComputedStyle', () => {
    document.documentElement.style.setProperty('--ui-test-token', '#abcdef');
    cache.invalidate();
    expect(cache.get('--ui-test-token', '#000')).toBe('#abcdef');
  });

  test('returns the fallback when the token is unset', () => {
    cache.invalidate();
    expect(cache.get('--ui-not-defined', '#fallback')).toBe('#fallback');
  });

  test('caches reads (second read is served from cache, not getComputedStyle)', () => {
    document.documentElement.style.setProperty('--ui-test-token', '#111111');
    cache.invalidate();
    expect(cache.get('--ui-test-token', '#000')).toBe('#111111');
    // Mutating the variable AFTER first read should not be observed until invalidate.
    document.documentElement.style.setProperty('--ui-test-token', '#222222');
    expect(cache.get('--ui-test-token', '#000')).toBe('#111111');
  });

  test('invalidates on vectura:skin-change event', () => {
    document.documentElement.style.setProperty('--ui-test-token', '#aaaaaa');
    cache.invalidate();
    expect(cache.get('--ui-test-token', '#000')).toBe('#aaaaaa');

    // Simulate a skin swap.
    document.documentElement.style.setProperty('--ui-test-token', '#bbbbbb');
    document.dispatchEvent(new runtime.window.CustomEvent('vectura:skin-change', {
      detail: { skinId: 'test-after' },
    }));

    expect(cache.get('--ui-test-token', '#000')).toBe('#bbbbbb');
  });

  test('reads --ui-accent directly (canonical Meridian accent token)', () => {
    // Post Meridian Step 3.3b, every reader requests the canonical `--ui-*`
    // token by name. The cache performs a direct getComputedStyle read.
    document.documentElement.style.setProperty('--ui-accent', '#4e9ee1');
    cache.invalidate();
    expect(cache.get('--ui-accent', '#000')).toBe('#4e9ee1');
  });
});
