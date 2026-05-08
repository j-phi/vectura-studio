/**
 * Phase 2 step 7 RGR test: renderer token cache reads `--ui-*` directly and
 * invalidates on `vectura:skin-change`.
 *
 * The renderer historically read `--color-*` tokens via a closure-local
 * `getThemeToken(name, fallback)` cache, with the cache key derived from
 * `document.documentElement.dataset.theme`. The Phase 2 closure exposes that
 * helper as `window.Vectura.Renderer.__tokenCache.get(name, fallback)` and
 * makes it:
 *
 *   1. Read `--ui-*` tokens directly when present (e.g. `--ui-accent`),
 *      falling back to a legacy `--color-*` alias if the requested name
 *      starts with `--color-` and no `--ui-*` value is set.
 *   2. Invalidate on the `vectura:skin-change` event (dispatched by
 *      `src/ui/skin/skin-manager.js`) so the next read refetches from
 *      `getComputedStyle`.
 *
 * Without these guarantees the renderer reads stale values across skin
 * swaps and ignores Meridian's canonical `--ui-*` palette — both regressions
 * the visual baselines would catch on next CI run.
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
    root.style.removeProperty('--color-accent');
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

  test('--color-accent reads honor --ui-accent first (Meridian canonical token)', () => {
    // Meridian skins set --ui-accent canonically; legacy skins alias --ui-accent
    // to --color-accent. Either way, asking for --color-accent should return the
    // --ui-accent value when present.
    document.documentElement.style.setProperty('--ui-accent', '#4e9ee1');
    cache.invalidate();
    expect(cache.get('--color-accent', '#000')).toBe('#4e9ee1');
  });

  test('--color-* fall back to direct read when no --ui-* equivalent is set', () => {
    // Some legacy --color-* tokens (e.g. unusual ones) may not have a --ui-*
    // shadow. In that case the cache should still resolve the underlying var.
    document.documentElement.style.setProperty('--color-accent', '#0e6fe0');
    cache.invalidate();
    expect(cache.get('--color-accent', '#000')).toBe('#0e6fe0');
  });
});
