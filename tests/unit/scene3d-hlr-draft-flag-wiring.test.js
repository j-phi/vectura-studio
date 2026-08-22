const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FS-R2: P5 (draft-only coarser HLR sampling, hlr.js SAMPLE_STEP) is fully
 * implemented and RGR-proven against HLR.createClipper({ draft: true })
 * directly, but scene3d.js never threads bounds.fastPreview through to it —
 * the `draft` local is computed 40 lines AFTER createClipper() is already
 * called, so opts.draft is always undefined at the real call site.
 *
 * This test proves the flag ARRIVES at createClipper, not merely that the
 * code compiles: it spies on Vectura.Scene3D.HLR.createClipper and asserts
 * the opts it actually receives from a live algo.generate() call carry
 * draft:true when bounds.fastPreview is true, and no truthy draft flag when
 * it is absent. It must fail on current HEAD (opts.draft is always
 * undefined regardless of bounds.fastPreview).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

const BOUNDS_SETTLED = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3, truncate: true };
const BOUNDS_DRAFT = { ...BOUNDS_SETTLED, fastPreview: true };

const box = (id, x, y, z, size, extra = {}) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z, yaw: extra.yaw || 0, pitch: 0, roll: 0, scale: 1 },
  visibility: extra.visibility || 'solid',
});

describe('scene3d draft flag wiring (P5 activation)', () => {
  let runtime;
  let V;
  let algo;
  let HLR;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    HLR = V.Scene3D.HLR;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const sceneParams = () => ({
    ...clone(defaults),
    seed: 3,
    objects: [
      box('b0', -8, 0, -8, 24),
      box('b1', 6, 0, 4, 22, { yaw: 20 }),
    ],
    ground: { enabled: false },
    backdrop: { enabled: false },
    camera: {
      projection: 'orthographic', yaw: -25, pitch: 24, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    },
  });

  const spyOn = () => {
    const original = HLR.createClipper;
    const calls = [];
    HLR.createClipper = (faces, opts) => {
      calls.push(opts || {});
      return original(faces, opts);
    };
    return { calls, restore: () => { HLR.createClipper = original; } };
  };

  test('bounds.fastPreview:true reaches createClipper as opts.draft:true', () => {
    const spy = spyOn();
    try {
      algo.generate(sceneParams(), null, null, BOUNDS_DRAFT);
    } finally {
      spy.restore();
    }
    expect(spy.calls.length).toBeGreaterThan(0);
    expect(spy.calls[0].draft).toBe(true);
  });

  test('settled bounds (no fastPreview) do not set opts.draft truthy', () => {
    const spy = spyOn();
    try {
      algo.generate(sceneParams(), null, null, BOUNDS_SETTLED);
    } finally {
      spy.restore();
    }
    expect(spy.calls.length).toBeGreaterThan(0);
    expect(spy.calls[0].draft).toBeFalsy();
  });
});
