const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Pattern Designer edit tools — line/polyline/polygon support and _srcElementIndex', () => {
  let runtime;
  let mixin;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    mixin = runtime.window.Vectura._UIPatternDesignerMixin;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const makeEl = (html) => {
    const doc = runtime.window.document;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = html;
    return svg.firstElementChild;
  };

  // ── _svgElementToEditSet: line ────────────────────────────────────────────

  test('_svgElementToEditSet returns non-null for a <line> element', () => {
    const el = makeEl('<line x1="0" y1="5" x2="10" y2="5"/>');
    expect(mixin._svgElementToEditSet(el, 0)).not.toBeNull();
  });

  test('_svgElementToEditSet line editSet has exactly 2 anchors', () => {
    const el = makeEl('<line x1="1" y1="2" x2="8" y2="9"/>');
    const result = mixin._svgElementToEditSet(el, 0);
    expect(result.anchors).toHaveLength(2);
  });

  test('_svgElementToEditSet line anchors match x1/y1 and x2/y2', () => {
    const el = makeEl('<line x1="1" y1="2" x2="8" y2="9"/>');
    const { anchors } = mixin._svgElementToEditSet(el, 0);
    expect(anchors[0]).toMatchObject({ x: 1, y: 2 });
    expect(anchors[1]).toMatchObject({ x: 8, y: 9 });
  });

  test('_svgElementToEditSet line is open (closed: false)', () => {
    const el = makeEl('<line x1="0" y1="0" x2="10" y2="10"/>');
    expect(mixin._svgElementToEditSet(el, 0).closed).toBe(false);
  });

  // ── _svgElementToEditSet: polyline ────────────────────────────────────────

  test('_svgElementToEditSet returns non-null for a <polyline> element', () => {
    const el = makeEl('<polyline points="0,0 5,10 10,0"/>');
    expect(mixin._svgElementToEditSet(el, 0)).not.toBeNull();
  });

  test('_svgElementToEditSet polyline anchors match points attribute', () => {
    const el = makeEl('<polyline points="0,0 5,10 10,0"/>');
    const { anchors } = mixin._svgElementToEditSet(el, 0);
    expect(anchors).toHaveLength(3);
    expect(anchors[0]).toMatchObject({ x: 0, y: 0 });
    expect(anchors[1]).toMatchObject({ x: 5, y: 10 });
    expect(anchors[2]).toMatchObject({ x: 10, y: 0 });
  });

  test('_svgElementToEditSet polyline is open (closed: false)', () => {
    const el = makeEl('<polyline points="0,0 5,10 10,0"/>');
    expect(mixin._svgElementToEditSet(el, 0).closed).toBe(false);
  });

  // ── _svgElementToEditSet: polygon ─────────────────────────────────────────

  test('_svgElementToEditSet returns non-null for a <polygon> element', () => {
    const el = makeEl('<polygon points="0,0 5,10 10,0"/>');
    expect(mixin._svgElementToEditSet(el, 0)).not.toBeNull();
  });

  test('_svgElementToEditSet polygon is closed (closed: true)', () => {
    const el = makeEl('<polygon points="0,0 5,10 10,0"/>');
    expect(mixin._svgElementToEditSet(el, 0).closed).toBe(true);
  });

  test('_svgElementToEditSet polygon anchors match points attribute', () => {
    const el = makeEl('<polygon points="0,0 5,10 10,0"/>');
    const { anchors } = mixin._svgElementToEditSet(el, 0);
    expect(anchors).toHaveLength(3);
    expect(anchors[0]).toMatchObject({ x: 0, y: 0 });
  });

  // ── compilePatternMeta: fill-only paths must have _srcElementIndex ─────────

  test('compilePatternMeta fill-only group paths have _srcElementIndex defined', () => {
    const patternGetGroups = runtime.window.Vectura.AlgorithmRegistry?.patternGetGroups;
    const registry = runtime.window.Vectura.PatternRegistry;
    const FILL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="black"/></svg>';
    const saved = registry.saveCustomPattern({ id: 'fill-only-index-test', name: 'Fill Only Index', svg: FILL_SVG });
    const data = patternGetGroups(saved.id);
    const allPaths = data.groups.flatMap((g) => g.paths);
    expect(allPaths.length).toBeGreaterThan(0);
    expect(allPaths.every((p) => p._srcElementIndex !== undefined)).toBe(true);
    registry.deleteCustomPattern(saved.id);
  });
});
