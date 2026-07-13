/**
 * PathDraw parity + contract.
 *
 * PathDraw replaces six hand-synced copies of the "which curve branch does this
 * path take?" decision. Before any consumer switches over, it has to reproduce
 * each of them exactly — so these tests re-implement the ORIGINAL branches
 * inline and assert PathDraw agrees, branch for branch.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const withMeta = (points, meta) => {
  const p = points.slice();
  if (meta) p.meta = meta;
  return p;
};

const OPEN = [
  { x: 0, y: 0 }, { x: 10, y: 20 }, { x: 30, y: 25 }, { x: 50, y: 5 }, { x: 70, y: 30 },
];
const CLOSED = [
  { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }, { x: 0, y: 0 },
];
const ANCHORED = withMeta(
  [{ x: 0, y: 0 }, { x: 50, y: 50 }],
  {
    anchors: [
      { x: 0, y: 0, in: null, out: { x: 20, y: 0 } },
      { x: 50, y: 50, in: { x: 30, y: 50 }, out: null },
    ],
    closed: false,
  },
);

describe('PathDraw', () => {
  let runtime;
  let PathDraw;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    PathDraw = runtime.window.Vectura.PathDraw;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  describe('the branch decision', () => {
    test('native cubics when anchors carry handles and curves are on', () => {
      expect(PathDraw.classify(ANCHORED, { useCurves: true }).mode).toBe('cubic');
    });

    test('meta.forceCurves emits cubics even with the Curves toggle off', () => {
      const path = withMeta(ANCHORED.slice(), { ...ANCHORED.meta, forceCurves: true });
      expect(PathDraw.classify(path, { useCurves: false }).mode).toBe('cubic');
    });

    test('meta.straight vetoes curves outright — it beats both the toggle and forceCurves', () => {
      const path = withMeta(ANCHORED.slice(), { ...ANCHORED.meta, forceCurves: true, straight: true });
      expect(PathDraw.classify(path, { useCurves: true }).mode).toBe('verbatim');
    });

    test('meta.baked also renders verbatim — it is already the display curve', () => {
      const path = withMeta(ANCHORED.slice(), { ...ANCHORED.meta, forceCurves: true, baked: true });
      expect(PathDraw.classify(path, { useCurves: true }).mode).toBe('verbatim');
      expect(PathDraw.isVerbatim(path)).toBe(true);
    });

    test('anchors with only NULL handles fall through to the quadratic, not degenerate cubics', () => {
      // An exploded wavetable rebuilt at smoothing 0 populates meta.anchors with
      // null in/out. Feeding those to bezierCurveTo yields straight segments and
      // reintroduces the kinks the curve was meant to remove.
      const path = withMeta(OPEN.slice(), {
        anchors: OPEN.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
      });
      expect(PathDraw.classify(path, { useCurves: true }).mode).toBe('quadratic');
    });

    test('curves off, or fewer than 3 points, renders verbatim', () => {
      expect(PathDraw.classify(OPEN, { useCurves: false }).mode).toBe('verbatim');
      expect(PathDraw.classify([{ x: 0, y: 0 }, { x: 1, y: 1 }], { useCurves: true }).mode).toBe('verbatim');
    });

    test('legacyQuadratic:false retires the corner-cut — an unfitted polyline draws as itself', () => {
      expect(PathDraw.classify(OPEN, { useCurves: true }).mode).toBe('quadratic');
      expect(PathDraw.classify(OPEN, { useCurves: true, legacyQuadratic: false }).mode).toBe('verbatim');
    });
  });

  describe('parity with the original renderer.tracePath', () => {
    // Verbatim re-implementation of the pre-PathDraw tracePath, recording calls.
    const legacyTrace = (path, useCurves, isClosedPath) => {
      const calls = [];
      const ctx = {
        moveTo: (x, y) => calls.push(['M', x, y]),
        lineTo: (x, y) => calls.push(['L', x, y]),
        quadraticCurveTo: (a, b, c, d) => calls.push(['Q', a, b, c, d]),
        bezierCurveTo: (a, b, c, d, e, f) => calls.push(['C', a, b, c, d, e, f]),
        closePath: () => calls.push(['Z']),
      };
      if (!path || path.length < 2) return calls;
      const forceCurves = path.meta?.forceCurves === true;
      const anchors = (useCurves || forceCurves) && !path.meta?.straight ? path.meta?.anchors : null;
      const hasHandles = Array.isArray(anchors) && anchors.some((a) => a && (a.in || a.out));
      if (hasHandles && anchors.length >= 2) {
        const closed = path.meta?.closed === true;
        ctx.moveTo(anchors[0].x, anchors[0].y);
        for (let i = 0; i < anchors.length - 1; i++) {
          const a = anchors[i];
          const b = anchors[i + 1];
          ctx.bezierCurveTo((a.out || a).x, (a.out || a).y, (b.in || b).x, (b.in || b).y, b.x, b.y);
        }
        if (closed) {
          const a = anchors[anchors.length - 1];
          const b = anchors[0];
          ctx.bezierCurveTo((a.out || a).x, (a.out || a).y, (b.in || b).x, (b.in || b).y, b.x, b.y);
        }
        return calls;
      }
      if (!useCurves || path.meta?.straight || path.length < 3) {
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
        return calls;
      }
      if (isClosedPath(path)) {
        const n = path.length - 1;
        const m0x = (path[0].x + path[1].x) / 2;
        const m0y = (path[0].y + path[1].y) / 2;
        ctx.moveTo(m0x, m0y);
        for (let i = 1; i < n; i++) {
          ctx.quadraticCurveTo(path[i].x, path[i].y, (path[i].x + path[i + 1].x) / 2, (path[i].y + path[i + 1].y) / 2);
        }
        ctx.quadraticCurveTo(path[0].x, path[0].y, m0x, m0y);
        return calls;
      }
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length - 1; i++) {
        ctx.quadraticCurveTo(path[i].x, path[i].y, (path[i].x + path[i + 1].x) / 2, (path[i].y + path[i + 1].y) / 2);
      }
      const last = path[path.length - 1];
      ctx.lineTo(last.x, last.y);
      return calls;
    };

    const record = (path, opts) => {
      const calls = [];
      PathDraw.toCanvas({
        moveTo: (x, y) => calls.push(['M', x, y]),
        lineTo: (x, y) => calls.push(['L', x, y]),
        quadraticCurveTo: (a, b, c, d) => calls.push(['Q', a, b, c, d]),
        bezierCurveTo: (a, b, c, d, e, f) => calls.push(['C', a, b, c, d, e, f]),
        closePath: () => calls.push(['Z']),
      }, path, opts);
      return calls;
    };

    const CASES = [
      ['open polyline, curves on', OPEN, true],
      ['open polyline, curves off', OPEN, false],
      ['closed polyline, curves on', CLOSED, true],
      ['closed polyline, curves off', CLOSED, false],
      ['anchored, curves on', ANCHORED, true],
      ['straight-flagged, curves on', withMeta(OPEN.slice(), { straight: true }), true],
      ['2-point, curves on', [{ x: 0, y: 0 }, { x: 9, y: 9 }], true],
    ];

    test.each(CASES)('%s', (_name, path, useCurves) => {
      const { isClosedPath } = runtime.window.Vectura.OptimizationUtils;
      const legacy = legacyTrace(path, useCurves, isClosedPath);
      const actual = record(path, { useCurves });
      // The legacy closed-quadratic branch never emitted closePath(); PathDraw
      // emits an explicit Z. Drop it for the comparison — the traced geometry is
      // identical, and the renderer strokes rather than fills.
      expect(actual.filter((c) => c[0] !== 'Z')).toEqual(legacy);
    });
  });

  describe('emitters agree with each other', () => {
    test('toSvgD emits the same commands toCanvas does', () => {
      const d = PathDraw.toSvgD(ANCHORED, { useCurves: true }, 3);
      expect(d).toBe('M 0.000 0.000 C 20.000 0.000 30.000 50.000 50.000 50.000');
    });

    test('toPolyline traces the drawn curve, not the control polyline', () => {
      const flat = PathDraw.toPolyline(ANCHORED, { useCurves: true }, 0.05);
      expect(flat.length).toBeGreaterThan(2);
      // The cubic bulges away from the straight chord between its endpoints.
      const offChord = flat.some((p) => Math.abs(p.x - p.y) > 1);
      expect(offChord).toBe(true);
      expect(flat[0]).toMatchObject({ x: 0, y: 0 });
      expect(flat[flat.length - 1]).toMatchObject({ x: 50, y: 50 });
    });

    test('a verbatim path flattens to exactly its own points', () => {
      const path = withMeta(OPEN.slice(), { straight: true });
      expect(PathDraw.toPolyline(path, { useCurves: true })).toEqual(OPEN);
    });
  });

  describe('pattern tile edges stay sharp', () => {
    test('sharpEdges honours per-point _tileEdge in the quadratic branch', () => {
      const pts = OPEN.map((p, i) => (i === 2 ? { ...p, _tileEdge: true } : { ...p }));
      const soft = PathDraw.commands(pts, { useCurves: true, sharpEdges: false });
      const sharp = PathDraw.commands(pts, { useCurves: true, sharpEdges: true });
      expect(soft.some((c) => c[0] === 'Q')).toBe(true);
      // The flagged vertex becomes a hard corner instead of a rounded control point.
      expect(sharp).toContainEqual(['L', 30, 25]);
      expect(soft).not.toContainEqual(['L', 30, 25]);
    });
  });
});
