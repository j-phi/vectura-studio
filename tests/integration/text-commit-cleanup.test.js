/*
 * M6 — Commit / cancel + empty-object cleanup (RGR).
 *
 * The controller is host-driven: on commit (Cmd/Ctrl+Enter) or cancel (Esc) it
 * ends the session AND asks the host to return the active tool to Selection
 * (`host.setTool('select')`). A layer CREATED this session via `beginNewAt` that
 * never received real (non-whitespace) text is discarded via
 * `host.discardCreatedLayer`, which also unwinds the creation history push so
 * undo/redo stays consistent (no dangling entry for a layer that never existed).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Type tool commit / cancel + empty-object cleanup (M6)', () => {
  let runtime, V;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterEach(() => runtime.cleanup());

  const makeTextLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'Hi', font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    return { id, layer };
  };

  // Host mirroring the app: pushHistory / createTextLayerAt use a real history
  // array so the empty-object cleanup's undo integrity can be verified end to end.
  const makeHost = (engine, extra = {}) => {
    const history = [];
    const host = {
      bindKeys: false,
      history,
      regen: (layer) => engine.generate(layer.id),
      pushHistory: () => history.push(engine.exportState()),
      requestDraw: vi.fn(),
      refreshPanel: vi.fn(),
      setTool: vi.fn(),
      createTextLayerAt: (wx, wy) => {
        history.push(engine.exportState()); // push-before-change, like _createPointTextLayerAt
        host._createHistoryLen = history.length; // tag creation depth (mirrors app.js)
        const id = engine.addLayer('text');
        const layer = engine.layers.find((l) => l.id === id);
        Object.assign(layer.params, { text: '', font: 'sans', fitToFrame: false, jitter: 0, posX: wx, posY: wy });
        engine.generate(id);
        return layer;
      },
      // Mirrors app.js: pop the creation snapshot ONLY if it is still the stack
      // top (no unrelated push interleaved) — never unwind the wrong entry.
      discardCreatedLayer: (layer, opts = {}) => {
        engine.removeLayer(layer.id);
        if (opts.unwindHistory && history.length && history.length === host._createHistoryLen) {
          history.pop();
        }
        host._createHistoryLen = null;
      },
      ...extra,
    };
    return host;
  };

  // ── Commit / cancel return to Select tool ──────────────────────────────────
  test('Cmd/Ctrl+Enter commits: ends the session and returns to the Select tool', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'Hi' });
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    ctrl.begin(layer, 2);
    expect(ctrl.isActive()).toBe(true);
    const handled = ctrl.handleKey({ key: 'Enter', metaKey: true });
    expect(handled).toBe(true);
    expect(ctrl.isActive()).toBe(false);
    expect(host.setTool).toHaveBeenCalledWith('select');
    // Plain Enter still inserts a newline (does NOT commit).
    expect(layer.params.text).toBe('Hi');
  });

  test('plain Enter inserts a newline and does NOT commit', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'Hi' });
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    ctrl.begin(layer, 2);
    ctrl.handleKey({ key: 'Enter' });
    expect(layer.params.text).toBe('Hi\n');
    expect(ctrl.isActive()).toBe(true);
    expect(host.setTool).not.toHaveBeenCalled();
    ctrl.end();
  });

  test('Esc cancels: ends the session and returns to the Select tool', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { text: 'Hi' });
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    ctrl.begin(layer, 1);
    const handled = ctrl.handleKey({ key: 'Escape' });
    expect(handled).toBe(true);
    expect(ctrl.isActive()).toBe(false);
    expect(host.setTool).toHaveBeenCalledWith('select');
  });

  // ── Empty-object cleanup ───────────────────────────────────────────────────
  test('create-empty-then-click-away discards the layer and unwinds creation history', () => {
    const engine = new V.VectorEngine();
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    const beforeCount = engine.layers.length;
    const beforeHistory = host.history.length;

    const layer = ctrl.beginNewAt(50, 50);
    expect(layer).toBeTruthy();
    expect(engine.layers.length).toBe(beforeCount + 1);
    expect(host.history.length).toBe(beforeHistory + 1); // creation pushed one entry

    // Click away / tool-switch ends the session with empty text.
    ctrl.end();
    expect(engine.layers.some((l) => l.id === layer.id)).toBe(false); // discarded
    expect(engine.layers.length).toBe(beforeCount);
    expect(host.history.length).toBe(beforeHistory); // creation push unwound

    // Undo integrity: the popped history matches the live (pre-creation) state —
    // no dangling entry that would resurrect a broken empty layer.
    const live = engine.exportState();
    expect(live.layers.length).toBe(beforeCount);
  });

  test('whitespace-only new layer is also discarded', () => {
    const engine = new V.VectorEngine();
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    const beforeCount = engine.layers.length;
    const layer = ctrl.beginNewAt(10, 10);
    // Whitespace-only insert (still a mutation, but "blank" for cleanup purposes).
    ctrl.insertText('   ');
    ctrl.end();
    expect(engine.layers.some((l) => l.id === layer.id)).toBe(false);
    expect(engine.layers.length).toBe(beforeCount);
  });

  test('create-then-type KEEPS the layer and its committed text', () => {
    const engine = new V.VectorEngine();
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    const beforeCount = engine.layers.length;
    const layer = ctrl.beginNewAt(20, 20);
    ctrl.insertText('Hello');
    ctrl.end();
    expect(engine.layers.some((l) => l.id === layer.id)).toBe(true);
    expect(engine.layers.length).toBe(beforeCount + 1);
    expect(layer.params.text).toBe('Hello');
  });

  test('an unrelated history push during a created-empty session is NOT popped by cleanup', () => {
    // Guards the "creation entry is always the stack top" fragility: if any
    // unrelated push interleaves, cleanup must discard the layer WITHOUT popping
    // the wrong (unrelated) entry.
    const engine = new V.VectorEngine();
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    const beforeCount = engine.layers.length;

    const layer = ctrl.beginNewAt(50, 50);
    const afterCreateHistory = host.history.length; // creation entry on top

    // An unrelated push lands on top of the creation entry (e.g. some other
    // feature committing state while the empty session is active).
    const sentinel = { sentinel: true };
    host.history.push(sentinel);
    expect(host.history.length).toBe(afterCreateHistory + 1);

    ctrl.end();
    // Layer still discarded…
    expect(engine.layers.some((l) => l.id === layer.id)).toBe(false);
    expect(engine.layers.length).toBe(beforeCount);
    // …but the unrelated entry is untouched (not popped) — no undo corruption.
    expect(host.history.length).toBe(afterCreateHistory + 1);
    expect(host.history[host.history.length - 1]).toBe(sentinel);
  });

  test('editing an EXISTING (non-created) empty layer never discards it', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, { text: '' });
    const host = makeHost(engine);
    const ctrl = new V.TextEditController(host);
    const beforeCount = engine.layers.length;
    ctrl.begin(layer, 0);
    ctrl.end();
    // Not created this session → survives even though blank.
    expect(engine.layers.some((l) => l.id === id)).toBe(true);
    expect(engine.layers.length).toBe(beforeCount);
  });
});
