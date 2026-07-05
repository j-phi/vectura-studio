/*
 * TXT-1 — Outline Text integration (full app: engine + renderer + UI).
 *
 * outlineText() is ONE undo step; undo restores the live editable Text layer
 * with params intact; the result is selected as a group; glyph layers are
 * ordinary layers (movable, deletable, mask-capable). Group/panel semantics
 * are covered in text-outline-group-semantics.test.js (TXT-2).
 *
 * The module has no <script> tag in index.html yet (Lane F owns the shell), so
 * the suite evals it into the runtime window explicitly.
 */
const fs = require('fs');
const path = require('path');

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const MODULE_PATH = path.resolve(__dirname, '../../src/core/text-outline-ops.js');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

describe('Outline Text integration (TXT-1)', () => {
  let runtime;
  let app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });
    runtime.window.eval(fs.readFileSync(MODULE_PATH, 'utf8'));
    runtime.window.app = new runtime.window.Vectura.App();
    app = runtime.window.app;
    await waitForUi();
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
    app = null;
  });

  const makeTextLayer = (text) => {
    const id = app.engine.addLayer('text');
    const layer = app.engine.getLayerById(id);
    Object.assign(layer.params, { text, fitToFrame: false, fontSize: 40, jitter: 0 });
    app.engine.generate(id);
    return { id, layer };
  };

  test('TXT-1: one undo step — undo restores the live Text layer with params intact', () => {
    const { id, layer } = makeTextLayer('Hi p');
    layer.params.tracking = 1.5;
    app.engine.generate(id);
    // Baseline snapshot (push-before-change convention: undo needs the
    // pre-op checkpoint on top of a baseline).
    app.history = [];
    app.redoStack = [];
    app.pushHistory();

    const V = runtime.window.Vectura;
    const result = V.TextOutlineOps.outlineText(id);
    expect(result).toBeTruthy();
    // Exactly ONE history snapshot was pushed by the whole operation.
    expect(app.history.length).toBe(2);
    expect(app.engine.layers.some((l) => l.id === id)).toBe(false);
    const children = app.engine.layers.filter((l) => l.parentId === result.groupId);
    expect(children.map((l) => l.name)).toEqual(['H', 'i', 'p']);

    app.undo();
    const restored = app.engine.layers.find((l) => l.id === id);
    expect(restored).toBeTruthy();
    expect(restored.type).toBe('text');
    expect(restored.params.text).toBe('Hi p');
    expect(restored.params.tracking).toBe(1.5);
    // The group and glyph layers are gone again.
    expect(app.engine.layers.some((l) => l.id === result.groupId)).toBe(false);

    // Redo re-applies the conversion.
    app.redo();
    expect(app.engine.layers.some((l) => l.id === id)).toBe(false);
    expect(app.engine.layers.some((l) => l.id === result.groupId)).toBe(true);
  });

  test('TXT-1: a no-op call leaves history untouched (no phantom undo step)', () => {
    // Whitespace-only text renders nothing → outlineText must reject BEFORE
    // pushing a snapshot, so the undo stack length is unchanged.
    const { id } = makeTextLayer('   ');
    app.history = [];
    app.redoStack = [];
    app.pushHistory();
    const before = app.history.length;

    const V = runtime.window.Vectura;
    expect(V.TextOutlineOps.outlineText(id)).toBeNull();
    expect(app.history.length).toBe(before);

    // Same for a non-text layer and an unknown id.
    const otherId = app.engine.addLayer('lissajous');
    expect(V.TextOutlineOps.outlineText(otherId)).toBeNull();
    expect(V.TextOutlineOps.outlineText('nope')).toBeNull();
    expect(app.history.length).toBe(before);
  });

  test('TXT-1: a throwing render tail does not propagate; mutation stays undo-recoverable', () => {
    const { id, layer } = makeTextLayer('Hi');
    layer.params.text = 'Hi';
    app.engine.generate(id);
    app.history = [];
    app.redoStack = [];
    app.pushHistory();

    // Simulate a Phase-2 caller whose renderer throws during setSelection.
    const original = app.renderer.setSelection.bind(app.renderer);
    app.renderer.setSelection = () => { throw new Error('boom'); };

    const V = runtime.window.Vectura;
    let result;
    expect(() => { result = V.TextOutlineOps.outlineText(id); }).not.toThrow();
    expect(result).toBeTruthy();
    // The engine mutation completed despite the render-tail throw.
    expect(app.engine.layers.some((l) => l.id === id)).toBe(false);
    expect(app.engine.layers.some((l) => l.id === result.groupId)).toBe(true);

    // And it is fully undo-recoverable back to the live Text layer.
    app.renderer.setSelection = original;
    app.undo();
    const restored = app.engine.layers.find((l) => l.id === id);
    expect(restored).toBeTruthy();
    expect(restored.type).toBe('text');
    expect(restored.params.text).toBe('Hi');
  });

  test('TXT-1: result is selected as a group', () => {
    const { id } = makeTextLayer('Go');
    const V = runtime.window.Vectura;
    const result = V.TextOutlineOps.outlineText(id);
    expect(result).toBeTruthy();
    expect(app.engine.activeLayerId).toBe(result.groupId);
    expect(Array.from(app.renderer.selectedLayerIds)).toEqual([result.groupId]);
    expect(app.renderer.selectedLayerId).toBe(result.groupId);
  });

  test('TXT-1: glyph layers are ordinary layers — movable, deletable, mask-capable where closed', () => {
    const { id } = makeTextLayer('On');
    const V = runtime.window.Vectura;
    const result = V.TextOutlineOps.outlineText(id);
    const children = app.engine.layers.filter((l) => l.parentId === result.groupId);
    const glyph = children[0];

    // Movable: nudging params and regenerating shifts world geometry.
    const beforeX = glyph.paths[0][0].x;
    glyph.params.posX += 10;
    app.engine.generate(glyph.id);
    expect(glyph.paths[0][0].x).toBeCloseTo(beforeX + 10, 6);

    // Deletable through the standard engine API.
    app.engine.deleteLayersById([children[1].id]);
    expect(app.engine.layers.some((l) => l.id === children[1].id)).toBe(false);

    // Mask capability refresh runs without error and reports a structured
    // verdict for the shape layer (closed glyph contours can source masks).
    app.engine.refreshMaskCapabilities();
    expect(glyph.maskCapabilities).toBeTruthy();
    expect(typeof glyph.maskCapabilities.canSource).toBe('boolean');
  });
});
