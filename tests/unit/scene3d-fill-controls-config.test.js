const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D fill controls — the render-free contracts: every numeric control clamps
 * into its configured range, unknown enum values fall back, the mono-law Angle /
 * Contour gates match the engine, and the Type list greys Contour under a mono law.
 */

describe('Scene3D fill controls — config, clamps and gates', () => {
  let runtime; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  }, 120000);
  afterAll(() => runtime.cleanup());

  it('normalizeStyle clamps every numeric control into its configured range', () => {
    const FC = V.SCENE_FILL_CONTROLS;
    const { normalizeStyle } = V.Scene3D.Params;
    expect(FC.NUMERIC_KEYS.length).toBeGreaterThan(5);
    const bag = {};
    FC.NUMERIC_KEYS.forEach((k) => {
      const c = FC.CONTROLS[k];
      expect(c.min, k).toBeLessThanOrEqual(c.default);
      expect(c.default, k).toBeLessThanOrEqual(c.max);
      bag[k] = 1e6;
    });
    const hi = normalizeStyle({ mapper: 'hatch', params: bag }).params;
    FC.NUMERIC_KEYS.forEach((k) => { expect(hi[k], k).toBe(FC.CONTROLS[k].max); });
    FC.NUMERIC_KEYS.forEach((k) => { bag[k] = -1e6; });
    const lo = normalizeStyle({ mapper: 'hatch', params: bag }).params;
    FC.NUMERIC_KEYS.forEach((k) => { expect(lo[k], k).toBe(FC.CONTROLS[k].min); });
    expect(normalizeStyle({ mapper: 'hatch', params: { waveCrest: 'bogus' } }).params.waveCrest).toBe('auto');
    expect(normalizeStyle({ mapper: 'hatch', params: { angleRef: 'light' } }).params.angleRef).toBe('light');
    expect(normalizeStyle({ mapper: 'hatch', params: { stripeAlign: 9 } }).params.stripeAlign).toBe(1.2);
  });

  it('readsAngle matches the mono laws that have a hatch direction', () => {
    const M = V.Scene3D.SurfaceFillMono;
    ['dutyConst', 'mezzoRegion', 'endShorten'].forEach((id) => expect(M.readsAngle(id), id).toBe(true));
    ['etfKang', 'defectSplit', 'originSpiral', 'turingStripe', 'voronoiWeb', 'mazeFill'].forEach((id) => {
      expect(M.readsAngle(id), id).toBe(false);
    });
  });

  it('the Type list greys Contour under a mono law and nowhere else', () => {
    const FS = V.SCENE_FILL_STYLES;
    const opts = [{ value: 'hatch', label: 'Hatch' }, { value: 'contour', label: 'Contour' }];
    const mono = FS.typeOptions(opts, 'voronoiWeb');
    expect(mono.find((o) => o.value === 'contour').disabled).toBe(true);
    expect(mono.find((o) => o.value === 'contour').label).toBe('Contour — same as Hatch');
    expect(mono.find((o) => o.value === 'hatch').disabled).toBeUndefined();
    expect(FS.typeOptions(opts, 'ladder')).toBe(opts);
    expect(FS.monoGate('etfKang')).toEqual({ mono: true, contourDead: true, angleDead: true });
    expect(FS.monoGate('dutyConst')).toEqual({ mono: true, contourDead: true, angleDead: false });
    expect(FS.monoGate('ladder')).toEqual({ mono: false, contourDead: false, angleDead: false });
  });
});
