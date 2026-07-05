/*
 * M2 — On-canvas Type-tool caret placement (RGR).
 *
 * Drives Vectura.TextEditController public methods directly (the canvas pointer
 * wiring in renderer.down() is exercised by e2e, not jsdom). A real VectorEngine
 * generates world-space `layer.glyphs`; the controller reads caret position ONLY
 * from those glyphs via Vectura.TextMetrics — it never recomputes pen geometry.
 *
 * Binding entry conditions verified here:
 *   - caret placed from layer.glyphs / TextMetrics.pointToCaretIndex;
 *   - empty-canvas click creates a new point-type text layer (caret 0);
 *   - jitter>0 layers do NOT enter edit mode (jitter gate).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Type tool caret placement (M2)', () => {
  let runtime, V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  const makeTextLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'Hello', font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    return { id, layer };
  };

  // Host adapter: regen re-runs the engine (refreshing world-space glyphs);
  // bindKeys:false keeps the controller from attaching a real window listener
  // (tests drive handleKey directly — see the keystroke suite).
  const makeHost = (engine, over = {}) => ({
    bindKeys: false,
    regen: (layer) => engine.generate(layer.id),
    pushHistory: vi.fn(),
    ...over,
  });

  test('registers TextEditController', () => {
    expect(typeof V.TextEditController).toBe('function');
  });

  test('click inside a text layer places the caret and activates an edit session', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine);
    const ctrl = new V.TextEditController(makeHost(engine));
    // Click in the LEFT quarter of the cell whose sourceIndex === 2 → caret BEFORE it.
    const g = layer.glyphs.find((q) => q.sourceIndex === 2);
    expect(g).toBeTruthy();
    const tl = g.quad[0]; const tr = g.quad[1]; const bl = g.quad[3];
    const wx = tl.x + (tr.x - tl.x) * 0.25;
    const wy = (tl.y + bl.y) / 2;

    const ok = ctrl.placeCaretAtWorld(layer, wx, wy);
    expect(ok).toBe(true);
    expect(ctrl.isActive()).toBe(true);
    expect(layer._edit).toBeTruthy();
    expect(layer._edit.active).toBe(true);
    expect(layer._edit.caretIndex).toBe(2);
    expect(ctrl.getCaretIndex()).toBe(2);
    // The caret segment is derived from world-space glyphs (no NaN).
    const seg = ctrl.getCaretSegment();
    expect(seg).toBeTruthy();
    expect(Number.isFinite(seg.x0)).toBe(true);
    expect(Number.isFinite(seg.y0)).toBe(true);
    ctrl.end();
  });

  test('click on empty canvas creates a new point-type text layer with caret at 0', () => {
    const engine = new V.VectorEngine();
    const before = engine.layers.length;
    const host = makeHost(engine, {
      createTextLayerAt: (wx, wy) => {
        const id = engine.addLayer('text');
        const layer = engine.layers.find((l) => l.id === id);
        Object.assign(layer.params, { text: '', font: 'sans', fitToFrame: false, posX: wx, posY: wy, jitter: 0 });
        engine.generate(id);
        return layer;
      },
    });
    const ctrl = new V.TextEditController(host);

    const created = ctrl.beginNewAt(120, 80);
    expect(created).toBeTruthy();
    expect(created.type).toBe('text');
    expect(engine.layers.length).toBe(before + 1);
    expect(engine.layers).toContain(created);
    expect(ctrl.isActive()).toBe(true);
    expect(ctrl.getCaretIndex()).toBe(0);
    expect(created._edit.active).toBe(true);
    ctrl.end();
  });

  test('pressing Enter places the caret on the new blank line (line-1 caret anchor)', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine); // "Hello", one line
    const ctrl = new V.TextEditController(makeHost(engine));
    ctrl.begin(layer, 5); // caret at end of "Hello"
    expect(ctrl.insertNewline()).toBe(true);
    expect(layer.params.text).toBe('Hello\n');
    expect(ctrl.getCaretIndex()).toBe(6);
    // A zero-width caret anchor now exists ON line 1 at the caret's source index,
    // even though no glyph has been typed there yet.
    const anchor = layer.glyphs.find((g) => g.lineIndex === 1 && g.sourceIndex === 6);
    expect(anchor).toBeTruthy();
    // The caret segment sits on line 1 — strictly below line 0's baseline (y-down).
    const line0 = layer.glyphs.filter((g) => g.lineIndex === 0);
    const line0Baseline = Math.max(...line0.map((g) => g.quad[3].y));
    const seg = ctrl.getCaretSegment();
    expect(seg).toBeTruthy();
    expect(seg.y0).toBeGreaterThan(line0Baseline);
    ctrl.end();
  });

  test('jitter>0 layer does NOT enter edit mode (jitter gate)', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine, { jitter: 5 });
    const ctrl = new V.TextEditController(makeHost(engine));
    const g = layer.glyphs[0];
    const wx = (g.quad[0].x + g.quad[1].x) / 2;
    const wy = (g.quad[0].y + g.quad[3].y) / 2;

    const ok = ctrl.placeCaretAtWorld(layer, wx, wy);
    expect(ok).toBe(false);
    expect(ctrl.isActive()).toBe(false);
    expect(layer._edit).toBeNull();
  });

  test('regen-before-edit: empty glyphs are repopulated before indexing (no index into empty)', () => {
    const engine = new V.VectorEngine();
    const { layer } = makeTextLayer(engine);
    const regen = vi.fn((l) => engine.generate(l.id));
    const ctrl = new V.TextEditController(makeHost(engine, { regen }));
    // Simulate post-import/undo: glyphs sidecar cleared until next regen.
    layer.glyphs = [];
    const g0wx = 0; const g0wy = 0; // any point — should not throw on empty
    const ok = ctrl.placeCaretAtWorld(layer, g0wx, g0wy);
    expect(ok).toBe(true);
    expect(regen).toHaveBeenCalled();
    expect(layer.glyphs.length).toBeGreaterThan(0);
    ctrl.end();
  });
});
