/*
 * Renderer.tracePath is no longer its own curve-branch implementation — it is a
 * thin delegate to PathDraw, the single source of truth shared with SVG export,
 * the export preview, and the masking flattener. Those copies had drifted, which
 * is the whole reason PathDraw exists.
 *
 * This pins the delegation: for every branch tracePath can take, the canvas calls
 * it makes must be exactly the calls PathDraw.toCanvas makes. If someone re-inlines
 * the branch decision in the renderer — or "fixes" one copy without the other —
 * this fails.
 *
 * Branch coverage below (one case per arm of PathDraw.classify):
 *   open polyline curves on   → quadratic
 *   open polyline curves off  → verbatim
 *   closed polyline curves on → quadratic (closed / wrap-around variant)
 *   anchored with handles     → cubic
 *   meta.straight             → verbatim (vetoes curves)
 *   2-point                   → verbatim (too short to smooth)
 *   null-handle anchors       → quadratic, NOT degenerate cubics
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const STACK = {
  includeRenderer: true,
  includeUi: false,
  includeApp: false,
  includeMain: false,
  useIndexHtml: true,
};

// Duck-typed recording ctx: tracePath touches nothing but this.ctx, so the
// renderer never needs a real canvas (or a real Renderer instance).
const makeRecordingCtx = () => {
  const calls = [];
  return {
    calls,
    moveTo(x, y) { calls.push(['moveTo', x, y]); },
    lineTo(x, y) { calls.push(['lineTo', x, y]); },
    quadraticCurveTo(cx, cy, x, y) { calls.push(['quadraticCurveTo', cx, cy, x, y]); },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { calls.push(['bezierCurveTo', c1x, c1y, c2x, c2y, x, y]); },
    closePath() { calls.push(['closePath']); },
  };
};

const withMeta = (points, meta) => {
  const p = points.map((pt) => ({ ...pt }));
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
const NULL_HANDLES = withMeta(OPEN, {
  anchors: OPEN.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
  closed: false,
});

describe('Renderer.tracePath delegates to PathDraw', () => {
  let runtime;
  let window;
  let PathDraw;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(STACK);
    ({ window } = runtime);
    PathDraw = window.Vectura.PathDraw;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // tracePath reads only this.ctx — no real Renderer construction needed.
  const trace = (path, useCurves) => {
    const ctx = makeRecordingCtx();
    window.Vectura.Renderer.prototype.tracePath.call({ ctx }, path, useCurves);
    return ctx.calls;
  };

  const viaPathDraw = (path, useCurves) => {
    const ctx = makeRecordingCtx();
    PathDraw.toCanvas(ctx, path, { useCurves });
    return ctx.calls;
  };

  const CASES = [
    ['open polyline, curves on', OPEN, true, 'quadratic'],
    ['open polyline, curves off', OPEN, false, 'verbatim'],
    ['closed polyline, curves on', CLOSED, true, 'quadratic'],
    ['closed polyline, curves off', CLOSED, false, 'verbatim'],
    ['anchored cubic, curves on', ANCHORED, true, 'cubic'],
    ['meta.straight, curves on', withMeta(OPEN, { straight: true }), true, 'verbatim'],
    ['2-point, curves on', [{ x: 0, y: 0 }, { x: 9, y: 9 }], true, 'verbatim'],
    ['null-handle anchors, curves on', NULL_HANDLES, true, 'quadratic'],
  ];

  test.each(CASES)('%s produces exactly PathDraw.toCanvas', (_name, path, useCurves, mode) => {
    // Guard the fixture itself: if a case stops exercising the branch it was
    // written for, the parity assertion below would still pass vacuously.
    expect(PathDraw.classify(path, { useCurves }).mode).toBe(mode);
    expect(trace(path, useCurves)).toEqual(viaPathDraw(path, useCurves));
  });

  test('the delegation is not vacuous — the cases really do draw curves', () => {
    const ops = (calls) => calls.map((c) => c[0]);
    expect(ops(trace(OPEN, true))).toContain('quadraticCurveTo');
    expect(ops(trace(ANCHORED, true))).toContain('bezierCurveTo');
    expect(ops(trace(OPEN, false))).not.toContain('quadraticCurveTo');
  });

  test('a degenerate path draws nothing at all', () => {
    expect(trace([{ x: 1, y: 1 }], true)).toEqual([]);
    expect(trace([], true)).toEqual([]);
    expect(trace(null, true)).toEqual([]);
  });

  // Circles never reach tracePath: traceLayerPath hands them to traceCircle,
  // which draws them in the canvas's own idiom (arc/ellipse). PathDraw has no
  // circle branch, so this split has to stay where it is.
  test('traceLayerPath still routes parametric circles to traceCircle, not PathDraw', () => {
    const ctx = makeRecordingCtx();
    ctx.arc = (...args) => ctx.calls.push(['arc', ...args]);
    ctx.ellipse = (...args) => ctx.calls.push(['ellipse', ...args]);

    const proto = window.Vectura.Renderer.prototype;
    const circle = [{ x: 10, y: 0 }, { x: -10, y: 0 }];
    circle.meta = { kind: 'circle', cx: 0, cy: 0, r: 10 };

    const self = { ctx, tracePath: proto.tracePath, traceCircle: proto.traceCircle };
    proto.traceLayerPath.call(self, circle, { params: { curves: true } });

    const ops = ctx.calls.map((c) => c[0]);
    expect(ops).toContain('arc');
    expect(ops).not.toContain('quadraticCurveTo');
    expect(ops).not.toContain('bezierCurveTo');
  });
});
