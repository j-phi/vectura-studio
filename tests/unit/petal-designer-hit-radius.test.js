const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// TUX-026 D6 mouse-parity proof: hitDesignerShapeControl keeps the 10 px mouse radius exactly and
// gives a finger a 22 px anchor radius with handle proximity priority.

const makeShape = () => ({
  anchors: [
    { t: 0, w: 0, in: null, out: { t: 0.18, w: 0 } },
    { t: 0.52, w: 0.7, in: { t: 0.34, w: 0.7 }, out: { t: 0.7, w: 0.7 } },
    { t: 1, w: 0, in: { t: 0.84, w: 0 }, out: null },
  ],
});

describe('Petal Designer control hit radius', () => {
  let runtime;
  let helper;
  let canvas;
  let shape;
  let anchor;
  let handles;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const hit = (pos, opts) => helper.hitDesignerShapeControl(shape, canvas, pos, null, 'none', opts);
  // Direction (unit vector) from the anchor that keeps every handle and every other anchor at
  // least `minOther` px from the point `radius` px away.
  const farPoint = (radius, minOther) => {
    for (let deg = 0; deg < 360; deg += 5) {
      const a = (deg * Math.PI) / 180;
      const p = { x: anchor.x + Math.cos(a) * radius, y: anchor.y + Math.sin(a) * radius };
      const ok = handles.concat(others).every((c) => dist(p, c) >= minOther);
      if (ok) return p;
    }
    throw new Error('no clear direction');
  };
  let others;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    const proto = runtime.window.Vectura.UI.prototype;
    helper = {};
    [
      'normalizeDesignerShape', 'normalizeDesignerSymmetryMode', 'designerSymmetryHasVerticalAxis',
      'designerSymmetryHasHorizontalAxis', 'getDesignerCanvasMetrics', 'getPetalDesignerWidthRatioForCanvas',
      'normalizePetalDesignerWidthRatio', 'designerToCanvas', 'sampleDesignerControls', 'hitDesignerShapeControl',
    ].forEach((name) => { helper[name] = proto[name]; });
    helper.getDesignerCanvasMetrics = () => ({ width: 220, height: 180, dpr: 1 });
    helper.getPetalDesignerWidthRatioForCanvas = () => 1;
    canvas = runtime.document.createElement('canvas');
    shape = makeShape();
    helper.normalizeDesignerShape.call(helper, shape);
    const controls = helper.sampleDesignerControls.call(helper, shape, canvas, null, 'none');
    anchor = controls.find((c) => c.kind === 'anchor' && c.index === 1).point;
    handles = controls.filter((c) => c.kind === 'handle').map((c) => c.point);
    others = controls.filter((c) => c.kind === 'anchor' && c.index !== 1).map((c) => c.point);
  });

  afterAll(() => runtime.cleanup());

  test('mouse keeps the 10 px radius', () => {
    const mouse = { pointerType: 'mouse' };
    expect(hit(farPoint(15, 12), mouse)).toBeNull();
    const near = hit(farPoint(9, 12), mouse);
    expect(near && near.kind).toBe('anchor');
    expect(near.index).toBe(1);
  });

  test('no options behaves exactly like mouse', () => {
    expect(hit(farPoint(15, 12))).toBeNull();
    expect(hit(farPoint(9, 12)).kind).toBe('anchor');
    expect(hit(farPoint(15, 12), {})).toBeNull();
    expect(hit(farPoint(15, 12), { pointerType: 'pen' })).toBeNull();
  });

  test('touch grabs an anchor from 15 px and 21 px, not 23 px', () => {
    const touch = { pointerType: 'touch' };
    const a15 = hit(farPoint(15, 13), touch);
    expect(a15 && a15.kind).toBe('anchor');
    expect(a15.index).toBe(1);
    const a21 = hit(farPoint(21, 13), touch);
    expect(a21 && a21.kind).toBe('anchor');
    expect(hit(farPoint(23, 24), touch)).toBeNull();
  });

  test('touch prefers a handle the finger is almost on', () => {
    const h = handles.find((p) => dist(p, anchor) > 8);
    const result = hit({ x: h.x + 3, y: h.y }, { pointerType: 'touch' });
    expect(result && result.kind).toBe('handle');
  });
});
