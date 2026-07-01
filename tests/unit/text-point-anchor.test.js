/*
 * Point-text anchoring — absolute (non-fit) point text anchors on its ALIGNMENT
 * edge so on-canvas Type-tool editing grows away from a fixed point (RGR).
 *
 * The Type tool creates layers with `align:'left', fitToFrame:false`. When the
 * user places the caret and types, the text must push SOLELY to the right of the
 * initial insertion point — existing glyphs must never shift left. This is only
 * true if the block is anchored by its LEFT edge (not its centre): a centre
 * anchor re-centres the growing bbox, dragging earlier glyphs leftward.
 *
 * Fit-to-frame text (the panel default) stays centred — it is scaled to fill the
 * frame — so its centre-anchoring is unchanged.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Point-text alignment-edge anchoring', () => {
  let runtime, V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  const makeLayer = (engine, params) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, {
      font: 'sans', fontSize: 40, fitToFrame: false, jitter: 0, posX: 0, posY: 0,
    }, params);
    return { id, layer };
  };

  // Left edge of the first glyph cell in world space (top-left corner x).
  const firstLeftEdge = (layer) => layer.glyphs[0].quad[0].x;

  test('left-aligned point text keeps its left edge fixed as it grows', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, { align: 'left', text: 'A' });
    engine.generate(id);
    const before = firstLeftEdge(layer);

    layer.params.text = 'Along the way';
    engine.generate(id);
    const after = firstLeftEdge(layer);

    // The first glyph's left edge must not move — new text extends rightward only.
    expect(after).toBeCloseTo(before, 3);
  });

  test('right-aligned point text keeps its right edge fixed as it grows', () => {
    const engine = new V.VectorEngine();
    const rightEdge = (layer) => {
      let mx = -Infinity;
      for (const g of layer.glyphs) for (const pt of g.quad) if (pt.x > mx) mx = pt.x;
      return mx;
    };
    const { id, layer } = makeLayer(engine, { align: 'right', text: 'A' });
    engine.generate(id);
    const before = rightEdge(layer);

    layer.params.text = 'Along the way';
    engine.generate(id);
    const after = rightEdge(layer);

    expect(after).toBeCloseTo(before, 3);
  });

  test('centre-aligned point text still re-centres (unchanged legacy behaviour)', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, { align: 'center', text: 'A' });
    engine.generate(id);
    const before = firstLeftEdge(layer);

    layer.params.text = 'Along the way';
    engine.generate(id);
    const after = firstLeftEdge(layer);

    // Centre anchor grows both ways, so the left edge moves LEFT as text grows.
    expect(after).toBeLessThan(before - 1);
  });

  test('fit-to-frame left-aligned text stays centred (does NOT left-anchor)', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, { align: 'left', fitToFrame: true, text: 'A' });
    engine.generate(id);
    const before = firstLeftEdge(layer);

    layer.params.text = 'Along the way';
    engine.generate(id);
    const after = firstLeftEdge(layer);

    // Fit-to-frame re-centres/scales the block, so the left edge is NOT pinned.
    expect(after).not.toBeCloseTo(before, 1);
  });
});
