const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { goldenValues } = require('../helpers/golden-values');

/*
 * Scene3D fill styles keep their look: every Fill Style id (old and current), every
 * retired sub-control bag, and each Type on a curved and a faceted shape must draw
 * exactly the committed golden (tests/baselines/golden-values/scene3d-fill-style-drift.json).
 * A saved document draws what it drew when it was saved; that is the contract.
 *
 * Hash = path count + md5 of the scene3d output (points to 0.001 mm + dash / hidden /
 * weight / pen meta) on a small sphere (r22, detail 12) or a 40 mm box, Density 45,
 * Angle 45, one sun. The old-id rows were captured before the U5 merges (1d16cbaa)
 * and have not moved since. Regenerate only for an intended output change:
 * npm run test:update (and scripts/test-update-goldens-x64.sh), and say so in the commit.
 *
 * Two layers:
 *   1. cheap: the migration resolves each old shape to the SAME internal engine law.
 *   2. heavy: the full render equals the golden. generate() reads a bag only through
 *      Params.normalizeStyle, so bags that normalize to the same style draw the same
 *      scene; each such group renders once and every key in it checks the golden.
 */
const golden = goldenValues('scene3d-fill-style-drift');

// Every legacy id / sub-control bag on the sphere, plus each Type on both primitives.
const ROWS = [
  'sphere|hatch|ladder', 'sphere|hatch|none', 'sphere|hatch|nibAngle', 'sphere|hatch|taperedEnds',
  'sphere|hatch|weightModulated', 'sphere|hatch|isophoteWidth', 'sphere|hatch|whiteBand',
  'sphere|hatch|weightSmoothstep', 'sphere|hatch|fineLadder', 'sphere|hatch|phaseFineLadder',
  'sphere|hatch|perceptualRamp', 'sphere|hatch|lozengeStipple', 'sphere|hatch|deepFillTSP',
  'sphere|hatch|bundleCount', 'sphere|hatch|bundleSubNib', 'sphere|hatch|bundleEased',
  'sphere|hatch|bundleDither', 'sphere|hatch|bundleLozenge', 'sphere|hatch|bundleHandoff',
  'sphere|hatch|contFieldSigmoid', 'sphere|hatch|contFieldTouch', 'sphere|hatch|contFieldFore',
  'sphere|hatch|contFieldSurface', 'sphere|hatch|contFieldQuant', 'sphere|hatch|penInterleave',
  'sphere|hatch|penStipple', 'sphere|hatch|penReserve', 'sphere|hatch|penCross',
  'sphere|hatch|penPitchMatch', 'sphere|hatch|penFacing', 'sphere|hatch|mkScribble',
  'sphere|hatch|mkTick', 'sphere|hatch|mkDashRamp', 'sphere|hatch|mkDotScreen',
  'sphere|hatch|ampSpacing', 'sphere|hatch|weaveDepth', 'sphere|hatch|interlockWeave',
  'sphere|hatch|trochoidLoop', 'sphere|hatch|amplitudeOnly', 'sphere|hatch|onePenDown',
  'sphere|hatch|etfKang', 'sphere|hatch|defectSplit', 'sphere|hatch|mezzoRegion',
  'sphere|hatch|originSpiral', 'sphere|hatch|dutyConst', 'sphere|hatch|endShorten',
  'sphere|hatch|turingStripe', 'sphere|hatch|voronoiWeb', 'sphere|hatch|mazeFill',
  'sphere|crosshatch|ladder', 'sphere|crosshatch|taperedEnds', 'sphere|crosshatch|bundleCount',
  'sphere|crosshatch|ampSpacing', 'sphere|crosshatch|penInterleave',
  'sphere|hatch|taperedEnds|{"bandProfile":"taper"}', 'sphere|hatch|taperedEnds|{"bandProfile":"hard"}',
  'sphere|hatch|taperedEnds|{"bandProfile":"nib"}', 'sphere|hatch|ampSpacing|{"nesting":"single"}',
  'sphere|hatch|ampSpacing|{"nesting":"nested"}', 'sphere|hatch|interlockWeave|{"penDown":"perRuling"}',
  'sphere|hatch|interlockWeave|{"penDown":"continuous"}',
  'sphere|hatch|contFieldSigmoid|{"fieldMetric":"screen"}',
  'sphere|hatch|contFieldSigmoid|{"fieldMetric":"foreshortened"}',
  'sphere|hatch|contFieldSigmoid|{"fieldMetric":"surface"}',
  'sphere|hatch|contFieldSigmoid|{"fieldMetric":"quantised"}',
  'sphere|hatch|contFieldSigmoid|{"fieldFloor":"touch"}',
  'sphere|hatch|contFieldSigmoid|{"fieldMetric":"surface","fieldFloor":"touch"}',
  'sphere|hatch|ladder|{"rungMode":"fine"}', 'sphere|hatch|ladder|{"rungMode":"finePhase"}',
  'sphere|hatch|ladder|{"rungMode":"perceptual"}', 'sphere|hatch|weightModulated|{"weightEase":"smooth"}',
  'sphere|hatch|bundleCount|{"bundleMode":"eased"}', 'sphere|hatch|bundleCount|{"bundleMode":"dither"}',
  'sphere|hatch|bundleCount|{"bundleMode":"handoff"}', 'sphere|hatch|penInterleave|{"penMode":"pitchMatch"}',
  'sphere|hatch|penInterleave|{"penMode":"facing"}', 'sphere|hatch|penInterleave|{"penMode":"stipple"}',
  'sphere|hatch|contFieldFore|{"fieldCurve":"lstar"}', 'sphere|hatch|contFieldSigmoid|{"fieldCurve":"lstar"}',
  // Each Type on the curved and the faceted route.
  'sphere|contour|ladder', 'sphere|spiral|ladder', 'sphere|stipple|ladder',
  'box|hatch|ladder', 'box|crosshatch|ladder', 'box|contour|ladder', 'box|spiral|ladder', 'box|stipple|ladder',
  'box|hatch|turingStripe', 'box|hatch|mazeFill',
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };

describe('Scene3D fill styles keep their look (old ids, retired sub-control bags, every Type)', () => {
  let runtime; let V; let algo; let defaults; let Params; let R;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    Params = V.Scene3D.Params;
    R = V.SCENE3D_TONE_LAWS;
  });
  afterAll(() => runtime.cleanup());

  const gen = (prim, mapper, params) => {
    const p = clone(defaults);
    p.objects = [{ id: 'o1', name: 's', primitive: prim, params: prim === 'box' ? { sx: 40, sy: 40, sz: 40 } : { radius: 22, detail: 12 }, transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: Object.assign({ fillAngle: 45, fillDensity: 45 }, params) }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];
    const out = algo.generate(p, null, null, BOUNDS) || [];
    const r3 = (n) => Math.round(n * 1000) / 1000;
    const data = out.map((pth) => {
      const pts = (pth.points || pth).map((q) => [r3(q.x), r3(q.y)]);
      const m = pth.meta || {};
      return [pts, m.strokeDash || null, !!m.hiddenLine, m.weightScale || null, m.penId || null];
    });
    return `${out.length}:${crypto.createHash('md5').update(JSON.stringify(data)).digest('hex').slice(0, 12)}`;
  };

  // The case table: key -> { mapper, bag }
  const cases = ROWS.map((key) => {
    const parts = key.split('|');
    const prim = parts[0];
    const mapper = parts[1];
    const bag = parts.length > 3 ? Object.assign({ toneLaw: parts[2] }, JSON.parse(parts.slice(3).join('|'))) : { toneLaw: parts[2] };
    return { key, prim, mapper, bag };
  });

  // The internal law the pre-U5 resolver drew for a bag (the oracle for layer 1).
  const OLD_INTERNAL = (bag) => {
    const bandProfile = { hard: 'whiteBand', nib: 'nibAngle' };
    const t = bag.toneLaw;
    if (t === 'taperedEnds' && bag.bandProfile) return bandProfile[bag.bandProfile] || 'taperedEnds';
    if (t === 'ampSpacing' && bag.nesting === 'nested') return 'weaveDepth';
    if (t === 'interlockWeave' && bag.penDown === 'continuous') return 'onePenDown';
    if (t === 'contFieldSigmoid' && (bag.fieldMetric || bag.fieldFloor)) {
      const metric = { foreshortened: 'contFieldFore', surface: 'contFieldSurface', quantised: 'contFieldQuant' }[bag.fieldMetric];
      const touch = bag.fieldFloor === 'touch';
      if (metric && touch) return 'contFieldSigmoid'; // two active descriptors: bare survivor
      return metric || (touch ? 'contFieldTouch' : 'contFieldSigmoid');
    }
    if (t === 'ladder' && bag.rungMode) return { fine: 'fineLadder', finePhase: 'phaseFineLadder', perceptual: 'perceptualRamp' }[bag.rungMode] || 'ladder';
    if (t === 'weightModulated' && bag.weightEase === 'smooth') return 'weightSmoothstep';
    if (t === 'bundleCount' && bag.bundleMode && bag.bundleMode !== 'count') return { eased: 'bundleEased', dither: 'bundleDither', handoff: 'bundleHandoff' }[bag.bundleMode];
    if (t === 'penInterleave' && bag.penMode && bag.penMode !== 'interleave') return { pitchMatch: 'penPitchMatch', facing: 'penFacing', stipple: 'penStipple' }[bag.penMode];
    return t;
  };

  test('layer 1 — each old shape migrates to the SAME internal engine law (all %N% shapes)'.replace('%N%', String(cases.length)), () => {
    cases.forEach(({ key, bag, mapper }) => {
      const style = Params.normalizeStyle({ mapper, params: { ...bag } });
      if (R.MOVED && R.MOVED[bag.toneLaw] && R.MOVED[bag.toneLaw].from.indexOf(mapper) !== -1) {
        // M9a — Origin Spiral is the Spiral Type with Centre: Glint (the engine runs the same
        // law for it; layer 2 below pins the output to the pre-merge hash).
        expect(style.mapper, key).toBe('spiral');
        expect(style.params.spiralCenter, key).toBe('highlight');
        return;
      }
      const law = Params.resolveToneLaw(style.params);
      expect(law, key).toBe(OLD_INTERNAL(bag));
      // The retired keys are gone after the migration.
      ['bandProfile', 'nesting', 'fieldFloor'].forEach((k) => expect(style.params[k], `${key} ${k}`).toBeUndefined());
      // A survivor + the new keys round-trips to the same law.
      const again = Params.normalizeStyle({ mapper, params: { ...style.params } });
      expect(Params.resolveToneLaw(again.params), `${key} (second pass)`).toBe(law);
    });
  });

  test('layer 1 — every one of the 47 roster ids that is not a Type setting is reachable as survivor + params (byte-identical law)', () => {
    R.IDS.concat(['ladder']).forEach((id) => {
      if (R.MOVED && R.MOVED[id]) return; // Origin Spiral: the Spiral Type's Glint Centre (see layer 1)
      const alias = R.ALIASES[id];
      const bag = alias ? { toneLaw: alias.into, ...alias.params } : { toneLaw: id };
      expect(Params.resolveToneLaw(Params.normalizeStyle({ mapper: 'hatch', params: bag }).params), id).toBe(id);
    });
  });

  test('the legacy contField* ids keep the L*-linear curve; the retired survivor spellings keep the sigmoid', () => {
    ['contFieldFore', 'contFieldSurface', 'contFieldQuant', 'contFieldTouch'].forEach((id) => {
      expect(Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: id } }).params.fieldCurve, id).toBe('lstar');
    });
    expect(Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'contFieldSigmoid' } }).params.fieldCurve).toBeUndefined();
    expect(Params.normalizeStyle({ mapper: 'hatch', params: { toneLaw: 'contFieldSigmoid', fieldMetric: 'surface' } }).params.fieldCurve).toBeUndefined();
  });

  // layer 2 — one test per row keeps a failure's name readable; rows whose bags
  // normalize to the same style share one render.
  const renders = new Map();
  const renderOf = (c) => {
    const style = Params.normalizeStyle({ mapper: c.mapper, params: { fillAngle: 45, fillDensity: 45, ...c.bag } });
    const group = JSON.stringify([c.prim, style]);
    if (!renders.has(group)) renders.set(group, gen(c.prim, c.mapper, c.bag));
    return renders.get(group);
  };
  test.each(ROWS)('layer 2 — %s draws its golden', (key) => {
    golden.expect(key, renderOf(cases.find((x) => x.key === key)));
  }, 180000);
});
