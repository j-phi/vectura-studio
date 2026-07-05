/*
 * TXT-1 — Outline Text verb (unit, RGR).
 *
 * window.Vectura.TextOutlineOps.outlineText(layerId) replaces a Text layer with
 * a group of per-glyph static shape layers. Per repo memory, everything here is
 * exercised THROUGH text.generate + a real engine.generate() render pass (the
 * same transform pipeline the canvas draws from), never the outline machinery
 * in isolation.
 *
 * The module has no <script> tag in index.html yet (Lane F owns the shell), so
 * the suite evals it into the runtime window explicitly.
 */
const fs = require('fs');
const path = require('path');

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const MODULE_PATH = path.resolve(__dirname, '../../src/core/text-outline-ops.js');

// Order-insensitive, epsilon-tolerant path-set serialization: every path (and
// its native cubic anchors, when present) rounded to 3 decimals, sorted.
const pathSetSignature = (paths) => (paths || [])
  .filter((p) => Array.isArray(p) && p.length)
  .map((p) => {
    const pts = p.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(';');
    const anchors = p.meta && Array.isArray(p.meta.anchors)
      ? '|A:' + p.meta.anchors.map((a) => {
          const f = (v) => (v && Number.isFinite(v.x) ? `${v.x.toFixed(3)},${v.y.toFixed(3)}` : '-');
          return `${f(a)}(${f(a.in)})(${f(a.out)})`;
        }).join(';')
      : '';
    return pts + anchors;
  })
  .sort();

describe('TextOutlineOps.outlineText (TXT-1)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    runtime.window.eval(fs.readFileSync(MODULE_PATH, 'utf8'));
  });

  afterAll(() => runtime.cleanup());

  const makeTextLayer = (engine, text, extra = {}) => {
    const id = engine.addLayer('text');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { text, fitToFrame: false, fontSize: 40, jitter: 0 }, extra);
    engine.generate(id);
    return { id, layer };
  };

  // Collect leaf (non-group) shape layers under a group, recursing through any
  // per-letter sub-groups.
  const leafShapesOf = (engine, groupId) => {
    const out = [];
    const walk = (pid) => {
      engine.layers.filter((l) => l.parentId === pid).forEach((l) => {
        if (l.isGroup) walk(l.id); else out.push(l);
      });
    };
    walk(groupId);
    return out;
  };

  test('module registers on window.Vectura', () => {
    expect(V.TextOutlineOps).toBeTruthy();
    expect(typeof V.TextOutlineOps.outlineText).toBe('function');
  });

  test('glyph count equals non-whitespace char count; layers named for their character', () => {
    const engine = new V.VectorEngine();
    const { id } = makeTextLayer(engine, 'Hi there');
    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    const group = engine.layers.find((l) => l.id === result.groupId);
    expect(group).toBeTruthy();
    expect(group.isGroup).toBe(true);
    expect(group.groupType).toBe('group');
    const children = engine.layers.filter((l) => l.parentId === group.id);
    // 'Hi there' → H i t h e r e = 7 non-whitespace chars, space → no layer.
    expect(children.length).toBe(7);
    expect(children.map((l) => l.name)).toEqual(['H', 'i', 't', 'h', 'e', 'r', 'e']);
  });

  test('total outline geometry equals the text layer rendered outlines (path-set, epsilon)', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, 'Vectura 42');
    const before = pathSetSignature(layer.paths);
    expect(before.length).toBeGreaterThan(0);

    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    // Aggregate ALL leaf shapes (recursing per-letter sub-groups) — no ink lost.
    const after = pathSetSignature(leafShapesOf(engine, result.groupId).flatMap((l) => l.paths || []));
    expect(after).toEqual(before);
  });

  test('a glyph with a detached element (i = stem + tittle) becomes a letter group of separate shapes', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, 'i');
    const before = pathSetSignature(layer.paths);
    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    // The single glyph 'i' is ONE direct child of the top group: a letter group.
    const directChildren = engine.layers.filter((l) => l.parentId === result.groupId);
    expect(directChildren.length).toBe(1);
    const letter = directChildren[0];
    expect(letter.name).toBe('i');
    expect(letter.isGroup).toBe(true);
    expect(letter.groupType).toBe('group');
    // …holding two separate shape layers (the vertical bar and the tittle/dot).
    const parts = engine.layers.filter((l) => l.parentId === letter.id);
    expect(parts.length).toBe(2);
    parts.forEach((p) => { expect(Boolean(p.isGroup)).toBe(false); expect(p.type).toBe('shape'); });
    // Grouping is loss-less: the two parts together equal the glyph's ink.
    const after = pathSetSignature(leafShapesOf(engine, result.groupId).flatMap((l) => l.paths || []));
    expect(after).toEqual(before);
  });

  test('a single-element glyph (o) stays one shape layer, not a sub-group', () => {
    const engine = new V.VectorEngine();
    const { id } = makeTextLayer(engine, 'o');
    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    const directChildren = engine.layers.filter((l) => l.parentId === result.groupId);
    expect(directChildren.length).toBe(1);
    expect(Boolean(directChildren[0].isGroup)).toBe(false);
    expect(directChildren[0].type).toBe('shape');
    expect(directChildren[0].name).toBe('o');
  });

  test('multi-line text preserves per-glyph positions and per-line cells', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, 'ab\ncd');
    const before = pathSetSignature(layer.paths);

    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    const children = engine.layers.filter((l) => l.parentId === result.groupId);
    expect(children.length).toBe(4);
    expect(children.map((l) => l.name)).toEqual(['a', 'b', 'c', 'd']);
    const after = pathSetSignature(children.flatMap((l) => l.paths || []));
    expect(after).toEqual(before);
  });

  test('glyph layers are ordinary static shape layers preserving color/pen/appearance', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, 'Ok');
    layer.penId = 'pen-2';
    layer.color = '#ff8800';
    layer.strokeWidth = 0.7;
    layer.lineCap = 'butt';

    const result = V.TextOutlineOps.outlineText(id, { engine });
    const children = engine.layers.filter((l) => l.parentId === result.groupId);
    expect(children.length).toBe(2);
    children.forEach((child) => {
      expect(child.type).toBe('shape');
      expect(child.isGroup).toBe(false);
      expect(Array.isArray(child.sourcePaths)).toBe(true);
      expect(child.sourcePaths.length).toBeGreaterThan(0);
      expect(child.penId).toBe('pen-2');
      expect(child.color).toBe('#ff8800');
      expect(child.strokeWidth).toBe(0.7);
      expect(child.lineCap).toBe('butt');
      // Static geometry: identity params so the baked world-space paths stay put.
      expect(child.params.posX).toBe(0);
      expect(child.params.posY).toBe(0);
      expect(child.params.rotation).toBe(0);
    });
  });

  test('replaces the text layer in place: group takes its slot and parent; text layer removed', () => {
    const engine = new V.VectorEngine();
    engine.addLayer('lissajous');
    const { id, layer } = makeTextLayer(engine, 'Go');
    const parentGroupId = engine.addGroupLayer();
    layer.parentId = parentGroupId;
    const idxBefore = engine.layers.findIndex((l) => l.id === id);

    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(engine.layers.some((l) => l.id === id)).toBe(false);
    const group = engine.layers.find((l) => l.id === result.groupId);
    expect(group.parentId).toBe(parentGroupId);
    expect(engine.layers.indexOf(group)).toBe(idxBefore);
    expect(engine.activeLayerId).toBe(group.id);
  });

  test('layer transform (posX/rotation) is baked into the outlined glyph geometry', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, 'T', { posX: 30, rotation: 25 });
    engine.generate(id);
    const before = pathSetSignature(layer.paths);

    const result = V.TextOutlineOps.outlineText(id, { engine });
    const children = engine.layers.filter((l) => l.parentId === result.groupId);
    const after = pathSetSignature(children.flatMap((l) => l.paths || []));
    expect(after).toEqual(before);
  });

  test('no-ops safely: non-text layer, unknown id, empty text', () => {
    const engine = new V.VectorEngine();
    const otherId = engine.addLayer('lissajous');
    const layersBefore = engine.layers.length;
    expect(V.TextOutlineOps.outlineText(otherId, { engine })).toBeNull();
    expect(V.TextOutlineOps.outlineText('nope', { engine })).toBeNull();
    const { id } = makeTextLayer(engine, '   ');
    expect(V.TextOutlineOps.outlineText(id, { engine })).toBeNull();
    // No structural mutation from the rejected calls (text layer still present).
    expect(engine.layers.length).toBe(layersBefore + 1);
    expect(engine.layers.some((l) => l.id === id)).toBe(true);
  });

  test('canOutline reports eligibility', () => {
    const engine = new V.VectorEngine();
    const { id } = makeTextLayer(engine, 'ok');
    const otherId = engine.addLayer('lissajous');
    expect(V.TextOutlineOps.canOutline(engine.getLayerById(id))).toBe(true);
    expect(V.TextOutlineOps.canOutline(engine.getLayerById(otherId))).toBe(false);
  });

  // ── Documents CURRENT behavior of the disclosed welded-kern gap (PRH-###) ──
  // On parsed web faces, `mergeOverlaps` can weld two glyphs' ink into ONE
  // contour. Geometry stays fully preserved, but the welded ring's centroid
  // sits in exactly one glyph-quad, so the sibling glyph receives zero paths
  // and produces NO layer — diverging from "glyph count = non-whitespace char
  // count". This test pins that behavior with synthetic single-welded-contour
  // input (a headless web-font weld is not otherwise reproducible without async
  // font parsing). Fixing it — split the welded ring per quad, or keep a shared
  // compound path — is tracked in docs/pre-release-hardening-log.md.
  test('welded contour spanning two glyph-quads yields one fewer layer (KNOWN GAP)', () => {
    const engine = new V.VectorEngine();
    const { id, layer } = makeTextLayer(engine, 'AV');
    engine.generate(id);
    // Two glyph cells 'A' and 'V' side by side (world space).
    layer.glyphs = [
      { sourceIndex: 0, lineIndex: 0, isSpace: false, quad: [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 } ] },
      { sourceIndex: 1, lineIndex: 0, isSpace: false, quad: [
        { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 20 } ] },
    ];
    // A single welded ring whose centroid lands inside the 'A' quad.
    const welded = [{ x: 1, y: 1 }, { x: 9, y: 1 }, { x: 9, y: 19 }, { x: 1, y: 19 }];
    welded.meta = { algorithm: 'text', straight: true };
    layer.paths = [welded];

    const result = V.TextOutlineOps.outlineText(id, { engine });
    expect(result).toBeTruthy();
    const children = engine.layers.filter((l) => l.parentId === result.groupId);
    // Two non-whitespace glyphs, but the weld produced only ONE layer — the
    // documented divergence. Geometry is still fully preserved (no path lost).
    expect(children.length).toBe(1);
    const total = children.flatMap((l) => l.paths || []).length;
    expect(total).toBe(1);
  });
});
