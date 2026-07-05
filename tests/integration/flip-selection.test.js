/**
 * SEL-3 (Illustrator tools parity, Phase 1 Lane A): Flip Horizontal / Vertical.
 * Lane A owns only the thin renderer/command wrapper `flipSelection(axis)`; the
 * geometry op `flipLayers(layerIds, axis, opts)` lives in Lane C's
 * `window.Vectura.PathEditOps` (built in parallel — feature-detected here).
 *  - wrapper invokes PathEditOps.flipLayers with the selected ids, axis, and
 *    the selection-bounds center as the mirror pivot;
 *  - it pushes exactly one history snapshot (undoable);
 *  - with no selection, or when PathEditOps is absent, it no-ops (console.warn).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SEL-3: flipSelection wrapper', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setup({ withOps = true } = {}) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const a = new Layer('flip-a', 'shape', 'A');
    a.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    const b = new Layer('flip-b', 'shape', 'B');
    b.sourcePaths = [[
      { x: 140, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 40 },
    ]];
    engine.layers.push(a, b);
    engine.generate(a.id);
    engine.generate(b.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;

    const historyPushes = [];
    renderer.app = { pushHistory: () => historyPushes.push(true) };

    const calls = [];
    if (withOps) {
      // FLIP-1/2 contract: the op OWNS the single history push (via the app the
      // wrapper threads through) and returns a {changed} object — never a bare
      // boolean. This stub mirrors that so the wrapper's delegation is verified.
      runtime.window.Vectura.PathEditOps = {
        flipLayers: (ids, axis, opts) => {
          calls.push({ ids, axis, opts });
          opts.app?.pushHistory?.();
          return { changed: true, layerIds: ids, axis };
        },
      };
    } else {
      delete runtime.window.Vectura.PathEditOps;
    }
    return { renderer, engine, a, b, calls, historyPushes };
  }

  test('invokes PathEditOps.flipLayers with selected ids, axis, app + engine (op owns the pivot)', async () => {
    const { renderer, a, b, calls } = await setup();
    renderer.setSelection([a.id, b.id], a.id);

    const ok = renderer.flipSelection('horizontal');
    expect(ok).toBe(true); // reads res.changed, not `!== false`
    expect(calls).toHaveLength(1);
    expect(calls[0].axis).toBe('horizontal');
    expect(calls[0].ids.slice().sort()).toEqual(['flip-a', 'flip-b']);
    // FLIP-1/2: the wrapper threads the app through (deterministic single push)
    // and no longer computes/passes a pivot — the op derives its own center.
    expect(calls[0].opts.app).toBe(renderer.app);
    expect(calls[0].opts.engine).toBe(renderer.engine);
    expect(calls[0].opts.center).toBeUndefined();
  });

  test('FLIP-1: the wrapper does NOT push its own history — exactly one push, owned by the op', async () => {
    const { renderer, a, historyPushes } = await setup();
    renderer.setSelection([a.id], a.id);
    renderer.flipSelection('vertical');
    // The stub op pushes once (via opts.app). If the wrapper also pushed we'd
    // see 2 — the double-undo-step regression this fix closes.
    expect(historyPushes).toHaveLength(1);
  });

  test('FLIP-2: a falsy/no-op {changed:false} return is reported as not-changed', async () => {
    const { renderer, a } = await setup();
    // Re-stub to return a no-op result object.
    runtime.window.Vectura.PathEditOps.flipLayers = () => ({ changed: false });
    renderer.setSelection([a.id], a.id);
    expect(renderer.flipSelection('horizontal')).toBe(false);
  });

  test('no selection → no-op, no history push, no op call', async () => {
    const { renderer, calls, historyPushes } = await setup();
    renderer.clearSelection();
    const ok = renderer.flipSelection('horizontal');
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
    expect(historyPushes).toHaveLength(0);
  });

  test('PathEditOps absent → warns and no-ops (no throw, no history push)', async () => {
    const { renderer, a, historyPushes } = await setup({ withOps: false });
    renderer.setSelection([a.id], a.id);
    const warns = [];
    const realWarn = runtime.window.console.warn;
    runtime.window.console.warn = (...args) => warns.push(args.join(' '));
    let ok;
    expect(() => { ok = renderer.flipSelection('horizontal'); }).not.toThrow();
    runtime.window.console.warn = realWarn;
    expect(ok).toBe(false);
    expect(historyPushes).toHaveLength(0);
  });
});
