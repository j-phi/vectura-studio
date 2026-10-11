const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const crypto = require('crypto');

/*
 * U5 — Style sub-setting folds (fill-style review R3-1, R3-2, R3-3, R3-6, R3-7, R3-8,
 * NEW-2, NEW-3, NEW-7, M9a). Each row is { n, prim, mapper, legacy, neu, opts, gold }:
 *   - `legacy` is the style-params bag a document saved BEFORE the fold carries;
 *   - `neu` is the bag the new controls write;
 *   - `gold` is the md5 of the scene3d output for `legacy`, captured on the commit
 *     BEFORE the folds (1d16cbaa) and never to move.
 * Both bags must draw `gold` byte for byte on the new build. The sphere is r22 / detail
 * 12, the box 40 mm, Density 45, Angle 45, one sun.
 *
 * Covered: Wrap (contourStyle region / spiralMode flatClip / angleRef screen), X-ray
 * Front: Faded = a dotted front line, X-ray Back line: Solid = Dashed, X-ray Depth cue =
 * two flags, highlight Dashed / Dotted = Restyle + Line, Sparse / Stipple = Thin + Thin by,
 * Alt fill Hatch / Crosshatch = Lines + Layers, the shared radial-ray emitter (Burst and
 * Halo: Burst), one source for the crossing angles and the plot floor, and Origin Spiral =
 * the Spiral Type with Centre: Glint.
 */
const CASES = [
  {"n":"wrap|contour|region","prim":"sphere","mapper":"contour","legacy":{"contourStyle":"region"},"neu":{"wrap":"flat"},"opts":{},"gold":"55:1433cf361663"},
  {"n":"wrap|contour|surface","prim":"sphere","mapper":"contour","legacy":{"contourStyle":"surface"},"neu":{},"opts":{},"gold":"71:cd2ffabcf443"},
  {"n":"wrap|spiral|flatClip","prim":"sphere","mapper":"spiral","legacy":{"spiralMode":"flatClip"},"neu":{"wrap":"flat"},"opts":{},"gold":"53:177884fd1a2d"},
  {"n":"wrap|spiral|helix","prim":"sphere","mapper":"spiral","legacy":{"spiralMode":"surfaceHelix"},"neu":{},"opts":{},"gold":"74:b1dbf0bf5870"},
  {"n":"wrap|hatch|screen","prim":"box","mapper":"hatch","legacy":{"angleRef":"screen"},"neu":{"wrap":"flat"},"opts":{},"gold":"16:5026db559bb3"},
  {"n":"wrap|crosshatch|screen","prim":"box","mapper":"crosshatch","legacy":{"angleRef":"screen"},"neu":{"wrap":"flat"},"opts":{},"gold":"24:0cf4ffd903ac"},
  {"n":"wrap|hatch|worldUp","prim":"box","mapper":"hatch","legacy":{"angleRef":"worldUp"},"neu":{"angleRef":"worldUp"},"opts":{},"gold":"19:3dec4d612d55"},
  {"n":"xray|front faded","prim":"sphere","mapper":"hatch","legacy":{"xrayFront":"faded"},"neu":{"xrayFrontLineType":"dotted"},"opts":{"visibility":"xray"},"gold":"88:afc462184d11"},
  {"n":"xray|front solid","prim":"sphere","mapper":"hatch","legacy":{"xrayFront":"solid"},"neu":{},"opts":{"visibility":"xray"},"gold":"88:38daeebb3a80"},
  {"n":"xray|back solid","prim":"sphere","mapper":"hatch","legacy":{"xrayBackLineType":"solid"},"neu":{"xrayBackLineType":"dashed"},"opts":{"visibility":"xray"},"gold":"88:38daeebb3a80"},
  {"n":"xray|back dotted","prim":"sphere","mapper":"hatch","legacy":{"xrayBackLineType":"dotted"},"neu":{"xrayBackLineType":"dotted"},"opts":{"visibility":"xray"},"gold":"88:63e319d318e2"},
  {"n":"xray|cue density","prim":"sphere","mapper":"hatch","legacy":{"xrayDepthCue":"density"},"neu":{"xrayCueDensity":true},"opts":{"visibility":"xray"},"gold":"99:b442f1a5ffaf"},
  {"n":"xray|cue weight","prim":"sphere","mapper":"hatch","legacy":{"xrayDepthCue":"weight"},"neu":{"xrayCueWeight":true},"opts":{"visibility":"xray"},"gold":"88:61214439b5d7"},
  {"n":"xray|cue both","prim":"sphere","mapper":"hatch","legacy":{"xrayDepthCue":"both"},"neu":{"xrayCueDensity":true,"xrayCueWeight":true},"opts":{"visibility":"xray"},"gold":"99:55d927875b23"},
  {"n":"xray|box faded","prim":"box","mapper":"hatch","legacy":{"xrayFront":"faded"},"neu":{"xrayFrontLineType":"dotted"},"opts":{"visibility":"xray"},"gold":"26:5acdeab4a27e"},
  {"n":"hl|dashed","prim":"box","mapper":"hatch","legacy":{"highlightTreatment":"dashed"},"neu":{"highlightTreatment":"restyle","highlightLineType":"dashed"},"opts":{},"gold":"19:6673acbe061b"},
  {"n":"hl|dotted","prim":"box","mapper":"hatch","legacy":{"highlightTreatment":"dotted"},"neu":{"highlightTreatment":"restyle","highlightLineType":"dotted"},"opts":{},"gold":"19:72fcc85a3b9e"},
  {"n":"hl|sparse","prim":"box","mapper":"hatch","legacy":{"highlightTreatment":"sparse"},"neu":{"highlightTreatment":"thin","highlightThinBy":"ruling"},"opts":{},"gold":"17:76b4e16cc3d2"},
  {"n":"hl|stippleOut","prim":"box","mapper":"hatch","legacy":{"highlightTreatment":"stippleOut"},"neu":{"highlightTreatment":"thin","highlightThinBy":"sample"},"opts":{},"gold":"18:c9df114397e2"},
  {"n":"hl|altFill hatch","prim":"box","mapper":"hatch","legacy":{"highlightTreatment":"altFill","altFillMapper":"hatch"},"neu":{"highlightTreatment":"altFill","altFillMapper":"lines","altFillLayers":1},"opts":{},"gold":"19:7bec9af6e27d"},
  {"n":"hl|altFill crosshatch","prim":"box","mapper":"hatch","legacy":{"highlightTreatment":"altFill","altFillMapper":"crosshatch"},"neu":{"highlightTreatment":"altFill","altFillMapper":"lines","altFillLayers":2},"opts":{},"gold":"22:5382f76ced86"},
  {"n":"hl|burst box","prim":"box","mapper":"hatch","legacy":{"highlightTreatment":"burst","burstCount":12},"neu":{"highlightTreatment":"burst","burstCount":12},"opts":{},"gold":"28:89215261be05"},
  {"n":"hl|burst sphere","prim":"sphere","mapper":"hatch","legacy":{"highlightTreatment":"burst","burstCount":10,"burstCenter":"centroid"},"neu":{"highlightTreatment":"burst","burstCount":10,"burstCenter":"centroid"},"opts":{},"gold":"90:398a0b87ebbd"},
  {"n":"emissive|halo burst","prim":"sphere","mapper":"hatch","legacy":{},"neu":{},"opts":{"emissive":{"enabled":true,"intensity":1.5,"halo":"burst","haloCount":14,"coreBlank":true}},"gold":"66:56b3d13739a1"},
  {"n":"emissive|halo ring","prim":"sphere","mapper":"hatch","legacy":{},"neu":{},"opts":{"emissive":{"enabled":true,"intensity":1,"halo":"ring","haloRings":3,"coreBlank":true}},"gold":"55:81aace93467b"},
  {"n":"crosshatch|ladder","prim":"sphere","mapper":"crosshatch","legacy":{"crossAngleDelta":70,"crossDensityRatio":0.8},"neu":{"crossAngleDelta":70,"crossDensityRatio":0.8},"opts":{},"gold":"118:028a783ca137"},
  {"n":"crosshatch|triple none","prim":"sphere","mapper":"crosshatch","legacy":{"toneLaw":"none","tripleHatch":true},"neu":{"toneLaw":"none","tripleHatch":true},"opts":{},"gold":"118:ea0e82f58aff"},
  {"n":"crosshatch|penCross","prim":"sphere","mapper":"crosshatch","legacy":{"toneLaw":"penCross"},"neu":{"toneLaw":"penCross"},"opts":{},"gold":"108:f7c9d77df785"},
  {"n":"crosshatch|penReserve","prim":"sphere","mapper":"crosshatch","legacy":{"toneLaw":"penReserve"},"neu":{"toneLaw":"penReserve"},"opts":{},"gold":"248:f55bbbcec55b"},
  {"n":"crosshatch|mono mezzo","prim":"sphere","mapper":"crosshatch","legacy":{"toneLaw":"mezzoRegion"},"neu":{"toneLaw":"mezzoRegion"},"opts":{},"gold":"773:cde9182dcbda"},
  {"n":"spiral|sphere hatch","prim":"sphere","mapper":"hatch","legacy":{"toneLaw":"originSpiral"},"neu":{"__mapper":"spiral","spiralCenter":"highlight"},"opts":{},"gold":"234:2237c97d7ec0"},
  {"n":"spiral|sphere crosshatch","prim":"sphere","mapper":"crosshatch","legacy":{"toneLaw":"originSpiral"},"neu":{"__mapper":"spiral","spiralCenter":"highlight"},"opts":{},"gold":"234:2237c97d7ec0"},
  {"n":"spiral|sphere contour","prim":"sphere","mapper":"contour","legacy":{"toneLaw":"originSpiral"},"neu":{"__mapper":"spiral","spiralCenter":"highlight"},"opts":{},"gold":"234:2237c97d7ec0"},
  {"n":"spiral|box hatch","prim":"box","mapper":"hatch","legacy":{"toneLaw":"originSpiral"},"neu":{"__mapper":"spiral","spiralCenter":"highlight"},"opts":{},"gold":"175:4921560931ca"},
  {"n":"spiral|sphere spiral centroid (unchanged)","prim":"sphere","mapper":"spiral","legacy":{},"neu":{"spiralCenter":"centroid"},"opts":{},"gold":"74:b1dbf0bf5870"},
  {"n":"spiral|sphere spiral originSpiral (inert, unchanged)","prim":"sphere","mapper":"spiral","legacy":{"toneLaw":"originSpiral"},"neu":{"toneLaw":"originSpiral"},"opts":{},"gold":"92:8d4a5005419c"},
];

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };

describe('U5 — sub-setting folds draw byte-identical to the pre-fold build', () => {
  let runtime; let V; let algo; let defaults; let Params;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    Params = V.Scene3D.Params;
  });
  afterAll(() => runtime.cleanup());

  const gen = (prim, mapper, params, opts = {}) => {
    const p = clone(defaults);
    const pp = prim === 'sphere' ? { radius: 22, detail: 12 } : { sx: 40, sy: 40, sz: 40 };
    p.objects = [Object.assign({ id: 'o1', name: 's', primitive: prim, params: pp, transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 0, roll: 0, scale: 1 }, visibility: opts.visibility || 'solid' }, opts.emissive ? { emissive: opts.emissive } : {})];
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

  test.each(CASES.map((c) => [c.n, c]))('%s — the old bag draws the golden', (name, c) => {
    expect(gen(c.prim, c.mapper, c.legacy, c.opts)).toBe(c.gold);
  }, 240000);

  test.each(CASES.map((c) => [c.n, c]))('%s — the new bag draws the same', (name, c) => {
    const neu = Object.assign({}, c.neu);
    const mapper = neu.__mapper || c.mapper;
    delete neu.__mapper;
    expect(gen(c.prim, mapper, neu, c.opts)).toBe(c.gold);
  }, 240000);

  test('the old bags migrate to the new keys and the retired keys are dropped (normalizeStyle)', () => {
    const norm = (mapper, params) => Params.normalizeStyle({ mapper, params: { ...params } }).params;
    expect(norm('contour', { contourStyle: 'region' })).toMatchObject({ wrap: 'flat' });
    expect(norm('contour', { contourStyle: 'region' }).contourStyle).toBeUndefined();
    expect(norm('contour', { contourStyle: 'surface' }).wrap).toBeUndefined();
    expect(norm('spiral', { spiralMode: 'flatClip' })).toMatchObject({ wrap: 'flat' });
    expect(norm('spiral', { spiralMode: 'flatClip' }).spiralMode).toBeUndefined();
    expect(norm('hatch', { angleRef: 'screen' })).toMatchObject({ wrap: 'flat', angleRef: 'face' });
    expect(norm('hatch', { angleRef: 'worldUp' })).toMatchObject({ angleRef: 'worldUp' });
    // Each old key is read for the bag's OWN Type only (a stale spiralMode on a Contour is dead).
    expect(norm('contour', { spiralMode: 'flatClip' }).wrap).toBeUndefined();
    expect(norm('hatch', { xrayFront: 'faded' })).toMatchObject({ xrayFrontLineType: 'dotted' });
    expect(norm('hatch', { xrayFront: 'faded' }).xrayFront).toBeUndefined();
    expect(norm('hatch', { xrayBackLineType: 'solid' })).toMatchObject({ xrayBackLineType: 'dashed' });
    expect(norm('hatch', { xrayDepthCue: 'both' })).toMatchObject({ xrayCueDensity: true, xrayCueWeight: true });
    expect(norm('hatch', { xrayDepthCue: 'density' })).toMatchObject({ xrayCueDensity: true });
    expect(norm('hatch', { xrayDepthCue: 'density' }).xrayCueWeight).toBeUndefined();
    expect(norm('hatch', { xrayDepthCue: 'both' }).xrayDepthCue).toBeUndefined();
    expect(norm('hatch', { highlightTreatment: 'dashed' })).toMatchObject({ highlightTreatment: 'restyle', highlightLineType: 'dashed' });
    expect(norm('hatch', { highlightTreatment: 'dotted' })).toMatchObject({ highlightTreatment: 'restyle', highlightLineType: 'dotted' });
    expect(norm('hatch', { highlightTreatment: 'sparse' })).toMatchObject({ highlightTreatment: 'thin', highlightThinBy: 'ruling' });
    expect(norm('hatch', { highlightTreatment: 'stippleOut' })).toMatchObject({ highlightTreatment: 'thin', highlightThinBy: 'sample' });
    expect(norm('hatch', { highlightTreatment: 'keep' })).toMatchObject({ highlightTreatment: 'none' });
    expect(norm('hatch', { highlightTreatment: 'altFill', altFillMapper: 'hatch' })).toMatchObject({ altFillMapper: 'lines', altFillLayers: 1 });
    expect(norm('hatch', { highlightTreatment: 'altFill', altFillMapper: 'crosshatch' })).toMatchObject({ altFillMapper: 'lines', altFillLayers: 2 });
    // An explicit new key is never overwritten by the migration.
    expect(norm('hatch', { highlightTreatment: 'dashed', highlightLineType: 'dashdot' })).toMatchObject({ highlightLineType: 'dashdot' });
  });

  test('Origin Spiral moves to the Spiral Type (Hatch / Crosshatch / Contour only); the other Types keep the raw id', () => {
    ['hatch', 'crosshatch', 'contour'].forEach((mapper) => {
      const out = Params.normalizeStyle({ mapper, params: { toneLaw: 'originSpiral', fillDensity: 60 } });
      expect(out.mapper).toBe('spiral');
      expect(out.params.spiralCenter).toBe('highlight');
      expect(out.params.toneLaw).toBeUndefined();
      expect(out.params.fillDensity).toBe(60);
    });
    ['spiral', 'stipple', 'wireframe'].forEach((mapper) => {
      const out = Params.normalizeStyle({ mapper, params: { toneLaw: 'originSpiral' } });
      expect(out.mapper).toBe(mapper);
      expect(out.params.toneLaw).toBe('originSpiral');
    });
    expect(V.SCENE3D_TONE_LAWS.PICKER_IDS).not.toContain('originSpiral');
    expect(V.SCENE3D_TONE_LAWS.IDS).toContain('originSpiral');
  });

  test('the torus write-back restores the old Type on Ladder for a moved Origin Spiral (W-10d)', () => {
    const norm = Params.normalizeObjectLayerParams({ primitive: 'torus', style: { penId: null, mapper: 'crosshatch', params: { toneLaw: 'originSpiral' } } });
    expect(norm.style.mapper).toBe('crosshatch');
    expect(norm.style.params.spiralCenter).toBeUndefined();
    expect(norm.style.params.toneLaw).toBe('ladder');
    expect(norm.style.params.movedFromMapper).toBeUndefined();
    const sphere = Params.normalizeObjectLayerParams({ primitive: 'sphere', style: { penId: null, mapper: 'crosshatch', params: { toneLaw: 'originSpiral' } } });
    expect(sphere.style.mapper).toBe('spiral');
    expect(sphere.style.params.spiralCenter).toBe('highlight');
  });

  test('Show hidden (wireframe) = Hidden edges Occluded: Dashed; and an empty hidden dash IS the [3,2] dash (R3-3, R3-4)', () => {
    const wire = (params, mut) => {
      const p = clone(defaults);
      p.objects = [{ id: 'o1', name: 'b', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 50, z: 0, yaw: 25, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
      p.ground = { enabled: false };
      p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      p.styleTable = { scene: { penId: null, mapper: 'wireframe', params }, byObject: {}, byFace: {} };
      p.lights = [SUN];
      if (mut) mut(p);
      const out = algo.generate(p, null, null, BOUNDS) || [];
      return crypto.createHash('md5').update(JSON.stringify(out.map((pth) => [(pth.points || pth).map((q) => [Math.round(q.x * 1000), Math.round(q.y * 1000)]), (pth.meta || {}).strokeDash || null, !!(pth.meta || {}).hiddenLine]))).digest('hex');
    };
    const viaToggle = wire({ showHidden: true });
    const viaEdge = wire({}, (p) => { p.edgeStyles = { hidden: { hiddenTreatment: 'dash' } }; });
    const viaEdgeDash = wire({}, (p) => { p.edgeStyles = { hidden: { hiddenTreatment: 'dash', dash: [3, 2] } }; });
    const dropped = wire({});
    expect(viaToggle).toBe(viaEdge);
    expect(viaEdge).toBe(viaEdgeDash);
    expect(viaToggle).not.toBe(dropped);
  });

  test('Cross (dot) = Plus turned 45 degrees at 1.41x the size: the same marks (R3-5), up to arm direction', () => {
    const stipple = (shape, size, angle) => {
      const p = clone(defaults);
      p.objects = [{ id: 'o1', name: 's', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }];
      p.ground = { enabled: false };
      p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      p.styleTable = { scene: { penId: null, mapper: 'stipple', params: { fillDensity: 45, dotShape: shape, dotSize: size, dotAngle: angle } }, byObject: {}, byFace: {} };
      p.tone = { ...clone(defaults).tone, enabled: true };
      p.lights = [SUN];
      const r3 = (n) => Math.round(n * 100) / 100;
      return (algo.generate(p, null, null, BOUNDS) || []).map((pth) => {
        const pts = (pth.points || pth).map((q) => [r3(q.x), r3(q.y)]);
        return JSON.stringify(pts[0][0] < pts[pts.length - 1][0] || (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] <= pts[pts.length - 1][1]) ? pts : pts.slice().reverse());
      }).sort();
    };
    const cross = stipple('cross', 0.7, 0);
    const plus = stipple('plus', 0.7 * Math.SQRT2, 45);
    expect(cross.length).toBeGreaterThan(0);
    expect(plus).toEqual(cross);
  });
});
