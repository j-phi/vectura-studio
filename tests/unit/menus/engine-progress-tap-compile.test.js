/*
 * Compile gate for src/ui/menus/engine-progress-tap.js (Phase 4).
 */
const { loadUIComponent } = require('../../helpers/load-ui-component');

describe('UI.Menus.EngineProgressTap (compile gate)', () => {
  let runtime;
  beforeEach(() => {
    runtime = loadUIComponent([
      'utils',
      'progress-bar',
      'src/ui/menus/engine-progress-tap',
    ]);
  });
  afterEach(() => runtime.cleanup());

  test('registers UI.Menus.EngineProgressTap with attach surface', () => {
    const T = runtime.window.Vectura.UI.Menus.EngineProgressTap;
    expect(typeof T).toBe('object');
    expect(typeof T.attach).toBe('function');
    expect(T._THRESHOLD_MS).toBe(200);
  });

  test('attach() with no app/engine is a safe no-op', () => {
    const T = runtime.window.Vectura.UI.Menus.EngineProgressTap;
    expect(() => T.attach({})).not.toThrow();
    expect(() => T.attach({ app: {} })).not.toThrow();
    expect(() => T.attach(null)).not.toThrow();
  });

  test('attach() wraps engine.generate; result + throws pass through', () => {
    const T = runtime.window.Vectura.UI.Menus.EngineProgressTap;
    const calls = [];
    const engine = {
      generate(id) { calls.push(id); return `gen:${id}`; },
    };
    const ui = { app: { engine } };
    T.attach(ui);
    expect(engine.generate('a')).toBe('gen:a');
    expect(calls).toEqual(['a']);

    engine.generate = () => { throw new Error('regen failed'); };
    // attach() is idempotent on the same engine identity, so re-wrap
    // a fresh engine for the throw test.
    const engine2 = { generate: () => { throw new Error('boom'); } };
    T.attach({ app: { engine: engine2 } });
    expect(() => engine2.generate('x')).toThrow('boom');
  });

  test('attach() is idempotent (double-attach does not double-wrap)', () => {
    const T = runtime.window.Vectura.UI.Menus.EngineProgressTap;
    let calls = 0;
    const engine = { generate() { calls++; return calls; } };
    const ui = { app: { engine } };
    T.attach(ui);
    T.attach(ui);
    engine.generate('x');
    expect(calls).toBe(1);
  });
});
