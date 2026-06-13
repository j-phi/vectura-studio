/*
 * Regression: window.Vectura.generateId()'s fallback (when crypto.randomUUID is
 * unavailable) must NOT call itself — the refactored fallback was
 * `generateId() + generateId()`, i.e. unbounded recursion → stack overflow.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Vectura.generateId', () => {
  let runtime;
  let window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window } = runtime);
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('returns a unique, non-empty string', () => {
    const a = window.Vectura.generateId();
    const b = window.Vectura.generateId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  test('falls back to a finite generator when crypto.randomUUID is absent (no infinite recursion)', () => {
    const originalCrypto = window.crypto;
    try {
      // Replace crypto with an object lacking randomUUID so generateId takes the
      // fallback branch. Pre-fix that branch recursed forever → RangeError.
      Object.defineProperty(window, 'crypto', { value: {}, configurable: true });
      const id = window.Vectura.generateId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(window, 'crypto', { value: originalCrypto, configurable: true });
    }
  });
});
