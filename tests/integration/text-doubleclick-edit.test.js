/*
 * M5 — Selection-tool double-click-to-edit (RGR).
 *
 * With the Selection tool (or Direct-Selection tool — SAME code path) active,
 * double-clicking a text layer switches to the Type tool and starts an edit
 * session with the caret at the clicked boundary. The renderer's raw double-click
 * pointer detection (timing / clientX-Y) is exercised by e2e; here we drive the
 * focused seam `renderer._beginTextEditFromHit(hitLayer, world)` that the
 * double-click branch dispatches into, over a REAL Renderer + engine.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Selection-tool double-click enters Type editing (M5)', () => {
  let runtime, V, doc;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
    doc = runtime.document;
  });
  afterEach(() => runtime.cleanup());

  const makeTextLayer = (engine, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text: 'Hello', font: 'sans', fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    return { id, layer };
  };

  const build = () => {
    const engine = new V.VectorEngine();
    const renderer = new V.Renderer('main-canvas', engine);
    const ctrl = new V.TextEditController({
      bindKeys: false,
      regen: (layer) => engine.generate(layer.id),
      pushHistory: vi.fn(),
      requestDraw: () => renderer.draw(),
    });
    // Minimal app adapter: ui.setActiveTool routes through renderer.setTool so
    // switching to the Type tool during a double-click keeps the renderer in sync.
    const ui = { setActiveTool: vi.fn((t) => renderer.setTool(t)) };
    renderer.app = { textEdit: ctrl, ui };
    return { engine, renderer, ctrl, ui };
  };

  const glyphCenter = (layer, sourceIndex) => {
    const g = layer.glyphs.find((q) => q.sourceIndex === sourceIndex);
    return { x: (g.quad[0].x + g.quad[1].x) / 2, y: (g.quad[0].y + g.quad[3].y) / 2 };
  };

  test('renderer is constructible in the harness', () => {
    const { renderer } = build();
    expect(renderer.ready).toBe(true);
  });

  test('Selection tool: double-click a text layer → Type tool + session + caret placed', () => {
    const { renderer, ctrl, ui, layer } = (() => {
      const b = build();
      const { layer } = makeTextLayer(b.engine);
      return { ...b, layer };
    })();
    renderer.setTool('select');
    const c = glyphCenter(layer, 2);
    const ok = renderer._beginTextEditFromHit(layer, c);
    expect(ok).toBe(true);
    expect(ui.setActiveTool).toHaveBeenCalledWith('type');
    expect(renderer.activeTool).toBe('type');
    expect(ctrl.isActive()).toBe(true);
    expect(ctrl.getActiveLayer()).toBe(layer);
    expect(ctrl.getCaretIndex()).toBe(2);
    ctrl.end();
  });

  test('Direct-Selection tool: double-click a text layer → same result', () => {
    const b = build();
    const { layer } = makeTextLayer(b.engine);
    b.renderer.setTool('direct');
    const c = glyphCenter(layer, 1);
    const ok = b.renderer._beginTextEditFromHit(layer, c);
    expect(ok).toBe(true);
    expect(b.renderer.activeTool).toBe('type');
    expect(b.ctrl.isActive()).toBe(true);
    expect(b.ctrl.getCaretIndex()).toBe(1);
    b.ctrl.end();
  });

  test('jitter gate: double-click a jittered text layer does NOT enter editing', () => {
    const b = build();
    const { layer } = makeTextLayer(b.engine, { jitter: 6 });
    b.renderer.setTool('select');
    const c = glyphCenter(layer, 0);
    const ok = b.renderer._beginTextEditFromHit(layer, c);
    expect(ok).toBe(false);
    expect(b.ctrl.isActive()).toBe(false);
    // Tool did switch to type (Illustrator switches even if the caret can't land),
    // but no session is active on the jittered layer.
  });

  test('non-text hit is a no-op (returns false, no tool switch)', () => {
    const b = build();
    b.renderer.setTool('select');
    const nonText = { id: 'x1', type: 'wavetable' };
    const ok = b.renderer._beginTextEditFromHit(nonText, { x: 0, y: 0 });
    expect(ok).toBe(false);
    expect(b.renderer.activeTool).toBe('select');
    expect(b.ui.setActiveTool).not.toHaveBeenCalled();
  });
});
