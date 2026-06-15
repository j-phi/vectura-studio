const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('morph modifier — guard / isolation', () => {
  let runtime;
  let Modifiers;
  const bounds = { x: 0, y: 0, width: 200, height: 200 };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    if (!runtime.window.Vectura.Modifiers.applyMorphModifierToPaths) {
      const code = fs.readFileSync(
        path.resolve(__dirname, '../../src/core/morph-modifier.js'),
        'utf8'
      );
      // morph-modifier.js isn't in index.html yet (M5 adds the tag). Eval it
      // into a vm context that exposes the shared jsdom window as `window`, so
      // it appends to the existing window.Vectura.Modifiers in place.
      const sandbox = { window: runtime.window, document: runtime.window.document };
      sandbox.global = sandbox;
      sandbox.globalThis = sandbox;
      vm.runInContext(code, vm.createContext(sandbox), { filename: 'morph-modifier.js' });
    }
    Modifiers = runtime.window.Vectura.Modifiers;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('GUARD-01: unknown modifier type returns cloned passthrough', () => {
    const input = [[{ x: 1, y: 2 }, { x: 3, y: 4 }]];
    const out = Modifiers.applyModifierToPaths(input, { type: 'unknown' }, bounds);
    // Values equal but not the same references.
    expect(out.length).toBe(1);
    expect(out[0]).toEqual(input[0]);
    expect(out[0]).not.toBe(input[0]);
    expect(out[0][0]).not.toBe(input[0][0]);
  });

  test('GUARD-02: createModifierState(mirror) has type mirror', () => {
    const state = Modifiers.createModifierState('mirror');
    expect(state.type).toBe('mirror');
  });

  test('GUARD-03: mirror modifier object round-trips unchanged after morph load', () => {
    const mirror = Modifiers.createModifierState('mirror');
    const round = JSON.parse(JSON.stringify(mirror));
    expect(round).toEqual(mirror);
  });

  test('GUARD-04: morph dispatch through applyModifierToPaths blends two paths', () => {
    const out = Modifiers.applyModifierToPaths(
      [[{ x: 0, y: 0 }], [{ x: 10, y: 10 }]],
      { type: 'morph', steps: 5 },
      bounds
    );
    // 2 sources + 5 blends.
    expect(out.length).toBe(7);
  });
});
