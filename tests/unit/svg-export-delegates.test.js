/**
 * The SVG exporter must not own a second opinion about how a path is drawn.
 *
 * `pathToSvg` (src/ui/ui.js) was a hand-copy of the branch decision that now
 * lives in PathDraw; it is delegated. These tests pin the delegation on the
 * production serializer — `_UIExportUtil.shapeToSvg`, the exact entry point
 * ui-file-io.js calls — because `pathToSvg` is IIFE-private.
 *
 * The `d` strings must stay BYTE-identical: tests/baselines/svg/*.svg and
 * tests/baselines/curves/*.svg are compared as bytes, so a stray space is a
 * 63-file diff. The literal-string assertions below are the tripwire for that.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const PRECISION = 3;

describe('SVG export delegates its draw branch to PathDraw', () => {
  let PathDraw;
  let shapeToSvg;
  let ExportSvg;

  // shapeToSvg wraps the `d` in <path …/>; unwrap so we compare serializer output.
  const dOf = (path, useCurves, sharpEdges = false) => {
    const markup = shapeToSvg(path, PRECISION, useCurves, null, sharpEdges);
    if (!markup) return '';
    const match = /\bd="([^"]*)"/.exec(markup);
    return match ? match[1] : '';
  };

  const expectDelegates = (path, useCurves, sharpEdges = false) => {
    const actual = dOf(path, useCurves, sharpEdges);
    const expected = PathDraw.toSvgD(path, { useCurves, sharpEdges }, PRECISION);
    expect(actual).toBe(expected);
    return actual;
  };

  const withMeta = (points, meta) => {
    const path = points.map((p) => ({ ...p }));
    if (meta) path.meta = meta;
    return path;
  };

  const OPEN = [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 30, y: 5 },
    { x: 50, y: 40 },
  ];
  const CLOSED = [
    { x: 0, y: 0 },
    { x: 40, y: 0 },
    { x: 40, y: 40 },
    { x: 0, y: 40 },
    { x: 0, y: 0 },
  ];
  const ANCHORED = withMeta(
    [
      { x: 0, y: 0 },
      { x: 50, y: 50 },
    ],
    {
      anchors: [
        { x: 0, y: 0, out: { x: 10, y: 0 } },
        { x: 50, y: 50, in: { x: 40, y: 50 } },
      ],
    },
  );

  beforeAll(async () => {
    const runtime = await loadVecturaRuntime({ includeUi: true });
    PathDraw = runtime.window.Vectura.PathDraw;
    shapeToSvg = runtime.window.Vectura._UIExportUtil.shapeToSvg;
    ExportSvg = runtime.window.Vectura.UI.Modals.ExportSvg;
    // buildExportPreviewPath throws unless ExportSvg.bind(deps) has run; it needs
    // nothing from deps beyond existing, so a stub keeps this a pure draw test.
    ExportSvg.bind({});
    expect(typeof PathDraw?.toSvgD).toBe('function');
    expect(typeof shapeToSvg).toBe('function');
    expect(typeof ExportSvg?.buildExportPreviewPath).toBe('function');
  });

  it('open polyline, curves off — verbatim M/L', () => {
    const d = expectDelegates(withMeta(OPEN), false);
    // The historical ` L ` join. A different separator here re-writes 63 baselines.
    expect(d).toBe('M 0.000 0.000 L 10.000 20.000 L 30.000 5.000 L 50.000 40.000');
  });

  it('open polyline, curves on — draw-time quadratic', () => {
    const d = expectDelegates(withMeta(OPEN), true);
    expect(d).toBe('M 0.000 0.000 Q 10.000 20.000 20.000 12.500 Q 30.000 5.000 40.000 22.500 L 50.000 40.000');
  });

  it('closed polyline, curves on — wrapped quadratic with a trailing Z', () => {
    const d = expectDelegates(withMeta(CLOSED), true);
    expect(d.startsWith('M 20.000 0.000 Q ')).toBe(true);
    expect(d.endsWith(' Z')).toBe(true);
  });

  it('closed polyline, curves off — verbatim, no Z', () => {
    const d = expectDelegates(withMeta(CLOSED), false);
    expect(d.includes('Q')).toBe(false);
    expect(d.includes('Z')).toBe(false);
  });

  it('anchored path — native cubics', () => {
    const d = expectDelegates(ANCHORED, true);
    expect(d).toBe('M 0.000 0.000 C 10.000 0.000 40.000 50.000 50.000 50.000');
  });

  it('anchored + meta.closed — cubic wrap segment then Z', () => {
    const path = withMeta([...OPEN], {
      closed: true,
      anchors: [
        { x: 0, y: 0, out: { x: 5, y: 0 } },
        { x: 30, y: 5, in: { x: 25, y: 5 }, out: { x: 35, y: 5 } },
        { x: 50, y: 40, in: { x: 45, y: 40 } },
      ],
    });
    const d = expectDelegates(path, true);
    expect(d.endsWith(' Z')).toBe(true);
    expect((d.match(/ C /g) || []).length).toBe(3);
  });

  it('meta.straight — verbatim even with curves on', () => {
    const d = expectDelegates(withMeta(OPEN, { straight: true }), true);
    expect(d.includes('Q')).toBe(false);
    expect(d).toBe(dOf(withMeta(OPEN), false));
  });

  it('meta.forceCurves — cubics even with curves off', () => {
    const path = withMeta([...ANCHORED], { ...ANCHORED.meta, forceCurves: true });
    const d = expectDelegates(path, false);
    expect(d.includes(' C ')).toBe(true);
  });

  it('_tileEdge points stay sharp when sharpEdges is on, and only then', () => {
    const tile = [
      { x: 0, y: 0 },
      { x: 10, y: 20, _tileEdge: true },
      { x: 30, y: 5 },
      { x: 50, y: 40 },
    ];
    const sharp = expectDelegates(withMeta(tile), true, true);
    const round = expectDelegates(withMeta(tile), true, false);
    expect(sharp).toContain('L 10.000 20.000');
    expect(round).toContain('Q 10.000 20.000');
    expect(sharp).not.toBe(round);
  });

  it('closed _tileEdge seam emits the two-lineTo wrap', () => {
    const tile = CLOSED.map((p, i) => (i === 0 ? { ...p, _tileEdge: true } : { ...p }));
    const d = expectDelegates(withMeta(tile), true, true);
    expect(d.endsWith('L 0.000 0.000 L 20.000 0.000 Z')).toBe(true);
  });

  it('2-point path — verbatim regardless of curves', () => {
    const two = [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ];
    expect(expectDelegates(withMeta(two), true)).toBe('M 1.000 2.000 L 3.000 4.000');
    expectDelegates(withMeta(two), false);
  });

  it('degenerate paths serialize to nothing', () => {
    expect(dOf(withMeta([{ x: 1, y: 2 }]), true)).toBe('');
    expect(dOf([], true)).toBe('');
  });

  it('precision is honoured (the exporter passes 2 for previews)', () => {
    const markup = shapeToSvg(withMeta(OPEN), 2, false, null, false);
    const d = /\bd="([^"]*)"/.exec(markup)[1];
    expect(d).toBe(PathDraw.toSvgD(withMeta(OPEN), { useCurves: false }, 2));
    expect(d).toBe('M 0.00 0.00 L 10.00 20.00 L 30.00 5.00 L 50.00 40.00');
  });

  // The export-preview canvas is the other copy that was retired. It must draw
  // the same branch as the `d` string it is previewing — that was the whole bug.
  describe('the export-preview canvas draws the same branch', () => {
    const recorder = () => {
      const calls = [];
      const log = (name) => (...args) => calls.push([name, ...args]);
      return {
        calls,
        moveTo: log('moveTo'),
        lineTo: log('lineTo'),
        quadraticCurveTo: log('quadraticCurveTo'),
        bezierCurveTo: log('bezierCurveTo'),
        closePath: log('closePath'),
        arc: log('arc'),
        ellipse: log('ellipse'),
      };
    };

    const preview = (path, useCurves, sharpEdges = false) => {
      const ctx = recorder();
      ExportSvg.buildExportPreviewPath(ctx, path, useCurves, sharpEdges);
      return ctx.calls;
    };

    const traced = (path, useCurves, sharpEdges = false) => {
      const ctx = recorder();
      PathDraw.toCanvas(ctx, path, { useCurves, sharpEdges });
      return ctx.calls;
    };

    const cases = [
      ['open, curves off', withMeta(OPEN), false, false],
      ['open, curves on', withMeta(OPEN), true, false],
      ['closed, curves on', withMeta(CLOSED), true, false],
      ['anchored cubic', ANCHORED, true, false],
      ['meta.straight', withMeta(OPEN, { straight: true }), true, false],
      ['tile edge, sharp', withMeta(OPEN.map((p, i) => (i === 1 ? { ...p, _tileEdge: true } : p))), true, true],
    ];

    cases.forEach(([name, path, useCurves, sharpEdges]) => {
      it(name, () => {
        expect(preview(path, useCurves, sharpEdges)).toEqual(traced(path, useCurves, sharpEdges));
      });
    });

    it('circles stay parametric — PathDraw never sees them', () => {
      const circle = withMeta([{ x: 0, y: 0 }, { x: 1, y: 1 }], { kind: 'circle', cx: 10, cy: 20, r: 5 });
      const calls = preview(circle, true);
      expect(calls.map((c) => c[0])).toEqual(['moveTo', 'arc']);
      expect(calls[1].slice(1, 4)).toEqual([10, 20, 5]);
    });
  });
});
