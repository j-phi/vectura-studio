/*
 * Point-text VERTICAL anchoring — absolute (non-fit) point text pins its first
 * line's metric cap box to the display anchor (RGR).
 *
 * The horizontal anchor was already pinned to the layout-cell edge, but the
 * vertical anchor stayed the whole-string INK bbox midpoint: typing the first
 * ascender or descender changed the ink extents and nudged every earlier glyph
 * up/down. The fix pins blockCy to the FIRST line's baseline metrics
 * (baselineY - size/2 = midpoint of the cap box), which is also exactly the
 * empty-box caret's midpoint (_emptyBoxCaretSegment) — so the first keystroke
 * lands on the caret and Enter grows strictly downward (Illustrator point-type
 * behaviour). Fit-to-frame text keeps ink-bbox centring (fit semantics).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Point-text metric vertical anchoring', () => {
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
      font: 'sans', fontSize: 40, align: 'left', fitToFrame: false, jitter: 0, posX: 0, posY: 0,
    }, params);
    return { id, layer };
  };

  const firstTopY = (layer) => layer.glyphs[0].quad[0].y;

  test('appending an ascender does not nudge earlier glyphs vertically', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, { text: 'aaa' });
    engine.generate(id);
    const before = firstTopY(layer);

    layer.params.text = 'aal';
    engine.generate(id);

    expect(firstTopY(layer)).toBeCloseTo(before, 6);
  });

  test('appending a descender does not nudge earlier glyphs vertically', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, { text: 'aaa' });
    engine.generate(id);
    const before = firstTopY(layer);

    layer.params.text = 'aag';
    engine.generate(id);

    expect(firstTopY(layer)).toBeCloseTo(before, 6);
  });

  test("first cell's vertical midpoint sits on the display anchor (caret continuity)", () => {
    const engine = new V.VectorEngine();
    // 'x' has x-height ink: its ink midpoint differs from the cap-box midpoint,
    // so this catches ink-bbox centring specifically.
    const { id, layer } = makeLayer(engine, { text: 'x' });
    engine.generate(id);

    const { m, dH } = engine.getBounds();
    const q = layer.glyphs[0].quad;
    const cellMidY = (q[0].y + q[3].y) / 2;
    // Cap box spans (baselineY - size .. baselineY); its midpoint must equal
    // the display anchor — the same point the empty-box caret centres on.
    expect(cellMidY).toBeCloseTo(m + dH / 2, 6);
  });

  test('vertical placement is independent of which characters are typed', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, { text: 'x' });
    engine.generate(id);
    const before = firstTopY(layer);

    layer.params.text = 'E'; // cap-height ink instead of x-height ink
    engine.generate(id);

    expect(firstTopY(layer)).toBeCloseTo(before, 6);
  });

  test('fit-to-frame text still centres its ink bbox on the anchor (unchanged)', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeLayer(engine, { text: 'x', fitToFrame: true });
    engine.generate(id);

    let minY = Infinity; let maxY = -Infinity;
    for (const seg of layer.paths) {
      for (const pt of seg) {
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
    const { m, dH } = engine.getBounds();
    expect((minY + maxY) / 2).toBeCloseTo(m + dH / 2, 3);
  });
});
