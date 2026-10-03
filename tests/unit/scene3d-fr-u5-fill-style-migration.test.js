const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const crypto = require('crypto');

/*
 * U5 (fill-style review) — every OLD Fill Style id and every retired sub-control
 * bag must load through the migration and draw BYTE-IDENTICAL to what it drew
 * before the merges (M1-M6) landed.
 *
 * GOLDEN below: md5 of the scene3d output (points to 0.001 mm + dash / hidden /
 * weight / pen meta) on a small sphere (r22, detail 12, Density 45, Angle 45), one
 * entry per old id and per pre-U5 sub-control bag. They were captured on the
 * commit BEFORE the merges (1d16cbaa, 3d-scene/fr-u5) and must never move.
 *
 * Two layers:
 *   1. cheap: the migration resolves each old shape to the SAME internal engine law.
 *   2. heavy: the full render equals the golden hash.
 */
const GOLDEN = {
  "sphere|hatch|ladder": "79:77c25efeb21a",
  "sphere|hatch|none": "75:c54de6e29fc5",
  "sphere|hatch|nibAngle": "138:7f54af290b22",
  "sphere|hatch|taperedEnds": "140:1b19bde3d353",
  "sphere|hatch|weightModulated": "67:42dbd4bc0540",
  "sphere|hatch|isophoteWidth": "117:0693d8cef18c",
  "sphere|hatch|whiteBand": "131:cad8b2d37873",
  "sphere|hatch|weightSmoothstep": "67:2b6f0136ea2e",
  "sphere|hatch|fineLadder": "79:25fb622d5112",
  "sphere|hatch|phaseFineLadder": "79:d97a9a7dd6d4",
  "sphere|hatch|perceptualRamp": "79:8762d30fdf89",
  "sphere|hatch|lozengeStipple": "90:fdc3fd645716",
  "sphere|hatch|deepFillTSP": "79:00f8f50e33ae",
  "sphere|hatch|bundleCount": "134:7a8fb3fa0ed4",
  "sphere|hatch|bundleSubNib": "262:b9c12689c722",
  "sphere|hatch|bundleEased": "133:bad55693d421",
  "sphere|hatch|bundleDither": "135:736dfcaf9e65",
  "sphere|hatch|bundleLozenge": "134:3a5a58a42e6c",
  "sphere|hatch|bundleHandoff": "132:abab111eaaa7",
  "sphere|hatch|contFieldSigmoid": "126:e7a364ed02e8",
  "sphere|hatch|contFieldTouch": "216:5455535bbdd9",
  "sphere|hatch|contFieldFore": "140:7078a41dd184",
  "sphere|hatch|contFieldSurface": "163:6621b432fa06",
  "sphere|hatch|contFieldQuant": "132:1a037235696d",
  "sphere|hatch|penInterleave": "127:960231f2e74c",
  "sphere|hatch|penStipple": "120:3bd5090c74a6",
  "sphere|hatch|penReserve": "187:424b34e5fabb",
  "sphere|hatch|penCross": "96:178a8a240877",
  "sphere|hatch|penPitchMatch": "121:a0e5c23979d3",
  "sphere|hatch|penFacing": "169:f4b9513734b8",
  "sphere|hatch|mkScribble": "69:b1053b52245c",
  "sphere|hatch|mkTick": "520:220a251ccc70",
  "sphere|hatch|mkDashRamp": "216:f96e12411405",
  "sphere|hatch|mkDotScreen": "103:8139cc2bc339",
  "sphere|hatch|ampSpacing": "256:ee5943989443",
  "sphere|hatch|weaveDepth": "201:a07da6941040",
  "sphere|hatch|interlockWeave": "144:ecce3c25ffde",
  "sphere|hatch|trochoidLoop": "449:73b331d547a0",
  "sphere|hatch|amplitudeOnly": "120:112dd792fbad",
  "sphere|hatch|onePenDown": "114:e77775292513",
  "sphere|hatch|etfKang": "184:6ae4890000ff",
  "sphere|hatch|defectSplit": "168:f5702d73d824",
  "sphere|hatch|mezzoRegion": "418:c22088fbf5b4",
  "sphere|hatch|originSpiral": "232:2f8aa995a54f",
  "sphere|hatch|dutyConst": "325:eb11f52174b0",
  "sphere|hatch|endShorten": "102:ef8ee7cb4b9e",
  "sphere|hatch|turingStripe": "217:732b91f3e471",
  "sphere|hatch|voronoiWeb": "1006:96915c847bee",
  "sphere|hatch|mazeFill": "2576:0b0f3408cf1b",
  "sphere|crosshatch|ladder": "106:65321dcd8e92",
  "sphere|crosshatch|taperedEnds": "230:1115409445e7",
  "sphere|crosshatch|bundleCount": "218:1df4906e65cf",
  "sphere|crosshatch|ampSpacing": "432:5ce41ca20bcf",
  "sphere|crosshatch|penInterleave": "192:53f76a0dbeab",
  "sphere|hatch|taperedEnds|{\"bandProfile\":\"taper\"}": "140:1b19bde3d353",
  "sphere|hatch|taperedEnds|{\"bandProfile\":\"hard\"}": "131:cad8b2d37873",
  "sphere|hatch|taperedEnds|{\"bandProfile\":\"nib\"}": "138:7f54af290b22",
  "sphere|hatch|ampSpacing|{\"nesting\":\"single\"}": "256:ee5943989443",
  "sphere|hatch|ampSpacing|{\"nesting\":\"nested\"}": "201:a07da6941040",
  "sphere|hatch|interlockWeave|{\"penDown\":\"perRuling\"}": "144:ecce3c25ffde",
  "sphere|hatch|interlockWeave|{\"penDown\":\"continuous\"}": "114:e77775292513",
  "sphere|hatch|contFieldSigmoid|{\"fieldMetric\":\"screen\"}": "126:e7a364ed02e8",
  "sphere|hatch|contFieldSigmoid|{\"fieldMetric\":\"foreshortened\"}": "131:c39827e47a90",
  "sphere|hatch|contFieldSigmoid|{\"fieldMetric\":\"surface\"}": "149:43c5f0d971c7",
  "sphere|hatch|contFieldSigmoid|{\"fieldMetric\":\"quantised\"}": "126:ecc0d6b3f959",
  "sphere|hatch|contFieldSigmoid|{\"fieldFloor\":\"touch\"}": "183:15f2be623d89",
  "sphere|hatch|contFieldSigmoid|{\"fieldMetric\":\"surface\",\"fieldFloor\":\"touch\"}": "126:e7a364ed02e8",
  "sphere|hatch|ladder|{\"rungMode\":\"fine\"}": "79:25fb622d5112",
  "sphere|hatch|ladder|{\"rungMode\":\"finePhase\"}": "79:d97a9a7dd6d4",
  "sphere|hatch|ladder|{\"rungMode\":\"perceptual\"}": "79:8762d30fdf89",
  "sphere|hatch|weightModulated|{\"weightEase\":\"smooth\"}": "67:2b6f0136ea2e",
  "sphere|hatch|bundleCount|{\"bundleMode\":\"eased\"}": "133:bad55693d421",
  "sphere|hatch|bundleCount|{\"bundleMode\":\"dither\"}": "135:736dfcaf9e65",
  "sphere|hatch|bundleCount|{\"bundleMode\":\"handoff\"}": "132:abab111eaaa7",
  "sphere|hatch|penInterleave|{\"penMode\":\"pitchMatch\"}": "121:a0e5c23979d3",
  "sphere|hatch|penInterleave|{\"penMode\":\"facing\"}": "169:f4b9513734b8",
  "sphere|hatch|penInterleave|{\"penMode\":\"stipple\"}": "120:3bd5090c74a6",
  "sphere|hatch|contFieldFore|{\"fieldCurve\":\"lstar\"}": "140:7078a41dd184",
  "sphere|hatch|contFieldSigmoid|{\"fieldCurve\":\"lstar\"}": "126:e7a364ed02e8",
};

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };

describe('U5 — every old Fill Style id and retired sub-control bag keeps its look', () => {
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

  const gen = (mapper, params) => {
    const p = clone(defaults);
    p.objects = [{ id: 'o1', name: 's', primitive: 'sphere', params: { radius: 22, detail: 12 }, transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
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
  const cases = Object.keys(GOLDEN).map((key) => {
    const parts = key.split('|');
    const mapper = parts[1];
    const bag = parts.length > 3 ? Object.assign({ toneLaw: parts[2] }, JSON.parse(parts.slice(3).join('|'))) : { toneLaw: parts[2] };
    return { key, mapper, bag };
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

  // layer 2 — one test per case keeps a failure's name readable.
  test.each(Object.keys(GOLDEN))('layer 2 — %s renders byte-identical to the pre-merge build', (key) => {
    const c = cases.find((x) => x.key === key);
    expect(gen(c.mapper, c.bag)).toBe(GOLDEN[key]);
  }, 180000);
});
