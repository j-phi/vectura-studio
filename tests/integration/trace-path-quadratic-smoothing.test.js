/*
 * Regression: a6d4dff added a 3-line gate in Renderer.tracePath that flipped
 * useCurves=false whenever path.meta.anchors existed. That meant exploded
 * wavetable → Shape layers (which carry meta.anchors after applyShapeAnchorRebuild
 * even at smoothing=0) rendered as straight lineTo segments instead of being
 * quadratic-smoothed at draw time. Visible as angular kinks at every original
 * anchor along an otherwise-curved wavetable line.
 *
 * The fix removes the gate so quadratic smoothing always applies when useCurves
 * is on and the polyline is long enough. This test pins that behavior.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const STACK = {
  includeRenderer: true,
  includeUi: false,
  includeApp: false,
  includeMain: false,
  useIndexHtml: true,
};

describe('Renderer.tracePath — quadratic smoothing with meta.anchors', () => {
  let runtime, window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(STACK);
    ({ window } = runtime);
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const makeRecordingCtx = () => {
    const calls = [];
    return {
      calls,
      beginPath() { calls.push(['beginPath']); },
      moveTo(x, y) { calls.push(['moveTo', x, y]); },
      lineTo(x, y) { calls.push(['lineTo', x, y]); },
      quadraticCurveTo(cx, cy, x, y) { calls.push(['quadraticCurveTo', cx, cy, x, y]); },
      stroke() {},
      closePath() {},
    };
  };

  // Construct a renderer instance without a real DOM canvas. tracePath only
  // reads from this.ctx and does not depend on any other renderer state.
  const makeRendererWithCtx = (ctx) => ({
    ctx,
    tracePath: window.Vectura.Renderer.prototype.tracePath,
  });

  test('a path with meta.anchors and useCurves=true is rendered with quadraticCurveTo, not just lineTo', () => {
    // Mimics a shape layer freshly rebuilt by applyShapeAnchorRebuild at
    // curves=ON / smoothing=0: meta.anchors is populated but the polyline
    // is a chord polyline (no real bezier curvature baked in).
    const path = [
      { x: 0,  y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: -3 },
      { x: 30, y: 4 },
      { x: 40, y: 0 },
    ];
    path.meta = {
      anchors: path.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
      originalAnchors: path.map((p) => ({ x: p.x, y: p.y, in: null, out: null })),
      closed: false,
    };

    const ctx = makeRecordingCtx();
    const renderer = makeRendererWithCtx(ctx);
    renderer.tracePath(path, true);

    const ops = ctx.calls.map((c) => c[0]);
    expect(ops).toContain('quadraticCurveTo');
    // The bug was: useCurves got flipped to false, so the only drawing ops
    // were moveTo + a string of lineTo. Make sure that pattern is not what we got.
    const quadCount = ops.filter((op) => op === 'quadraticCurveTo').length;
    expect(quadCount).toBeGreaterThanOrEqual(path.length - 2);
  });

  test('useCurves=false still draws straight segments (no smoothing applied)', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: -3 },
    ];
    path.meta = { anchors: path.map((p) => ({ x: p.x, y: p.y, in: null, out: null })) };

    const ctx = makeRecordingCtx();
    const renderer = makeRendererWithCtx(ctx);
    renderer.tracePath(path, false);

    const ops = ctx.calls.map((c) => c[0]);
    expect(ops).not.toContain('quadraticCurveTo');
    expect(ops).toContain('lineTo');
  });

  test('paths without meta.anchors still get quadratic smoothing (unchanged behavior)', () => {
    const path = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: -3 },
      { x: 30, y: 4 },
    ];
    const ctx = makeRecordingCtx();
    const renderer = makeRendererWithCtx(ctx);
    renderer.tracePath(path, true);

    const ops = ctx.calls.map((c) => c[0]);
    expect(ops).toContain('quadraticCurveTo');
  });
});
