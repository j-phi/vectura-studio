// Shared fixtures for the split scene3d-ribbon-weightscale integration files.
const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SPHERE = { radius: 40, detail: 20 };

// §2 of the plan. Written out, exactly as `RIBBON_LAWS` is in surface-fill.js.
const BUCKET_B = [
  'nibAngle', 'taperedEnds', 'weightModulated', 'isophoteWidth',
  'whiteBand', 'weightSmoothstep', 'ampSpacing', 'weaveDepth',
  'interlockWeave', 'trochoidLoop', 'amplitudeOnly', 'onePenDown',
];
const BUCKET_C = [
  'penInterleave', 'penStipple', 'penReserve', 'penCross', 'penPitchMatch', 'penFacing',
];
// One witness per mechanism (R-27). Every bucket-B law reaches the same
// ribbon gate (`isRibbonLaw()` in ribbonize), and ribbonizeCore throws on any
// weightScale != 1 it would emit, so two light laws witness the gate. One
// bucket-C law witnesses the multi-pen exemption.
const BUCKET_B_WITNESS = ['taperedEnds', 'whiteBand'];
const BUCKET_C_WITNESS = ['penInterleave'];

const buildScene = (defaults, styleParams) => {
  const p = clone(defaults);
  p.objects = [{
    id: 'o1', name: 'o', primitive: 'sphere', params: clone(SPHERE),
    transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
  }];
  p.ground = { enabled: false };
  p.camera = {
    projection: 'orthographic', yaw: -20, pitch: 15, roll: 0,
    cameraDistance: 620, focalLength: 520, zoom: 1,
  };
  p.styleTable = {
    scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, ...(styleParams || {}) } },
    byObject: {}, byFace: {},
  };
  p.tone = { ...clone(defaults).tone, enabled: true };
  p.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: false }];
  return p;
};

// An absent meta.weightScale means 1.
const effWeight = (pp) => {
  const raw = Number(pp.meta && pp.meta.weightScale);
  return Number.isFinite(raw) ? raw : 1;
};

module.exports = {
  clone, BOUNDS, SPHERE, BUCKET_B, BUCKET_C, BUCKET_B_WITNESS, BUCKET_C_WITNESS, buildScene, effWeight,
};
