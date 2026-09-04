const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D x-ray (Phase 6) — a hatched sphere set to visibility:'xray' must show
 * its FAR surface through the near one. Before this, SurfaceFill back-face-culled
 * (dropped every !front sample) and the curved-group pass iterated only front
 * faces, so a sphere's back surface was never generated and x-ray degraded to
 * "solid minus self-occlusion". The fix emits a tagged, sparser, dashed back
 * family (meta.sceneTarget.xrayBack) so the form reads as translucent line art.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D x-ray back-face fills (Phase 6)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // A single primitive on an empty stage, hatch/crosshatch fill, tone off so the
  // count comparison isolates the front-vs-back geometry (not tone banding).
  const scene = (primitive, visibility, styleParams) => {
    const p = clone(defaults);
    const params = primitive === 'sphere'
      ? { radius: 40, detail: 20 }
      : { sx: 40, sy: 40, sz: 40 };
    p.objects = [{
      id: 'o1', name: 'x', primitive, params,
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 }, visibility,
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60, ...(styleParams || {}) } },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    return p;
  };

  const fills = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const backFills = (paths) => fills(paths).filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.xrayBack === true);
  const frontFills = (paths) => fills(paths).filter((pp) => !(pp.meta.sceneTarget && pp.meta.sceneTarget.xrayBack === true));

  // ── HEADLINE (RGR): a hatched SPHERE in x-ray emits MORE fill geometry than
  // the same sphere solid, because the back surface is now drawn. This FAILS on
  // pre-fix code (back-face culled → identical/fewer). ────────────────────────
  test('sphere hatch x-ray emits MORE fill geometry than solid (back faces drawn)', () => {
    const solid = fills(algo.generate(scene('sphere', 'solid'), null, null, BOUNDS)).length;
    const xray = fills(algo.generate(scene('sphere', 'xray'), null, null, BOUNDS)).length;
    expect(xray).toBeGreaterThan(solid);
  });

  test('sphere x-ray back family is tagged, dashed, and lower-density than the front', () => {
    const paths = algo.generate(scene('sphere', 'xray'), null, null, BOUNDS);
    const back = backFills(paths);
    const front = frontFills(paths);
    expect(back.length).toBeGreaterThan(0);
    // Tagged as far surface + occluded.
    back.forEach((pp) => {
      expect(pp.meta.sceneTarget.xrayBack).toBe(true);
      expect(pp.meta.sceneTarget.occluded).toBe(true);
      expect(pp.meta.hiddenLine).toBe(true);
      const dash = pp.meta.strokeDash;
      expect(Array.isArray(dash) && dash.length >= 2).toBe(true);
    });
    // Sparser: fewer back polylines than front.
    expect(back.length).toBeLessThan(front.length);
  });

  const hiddenEdgesOf = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge'
    && pp.meta.hiddenLine === true && Array.isArray(pp.meta.strokeDash));

  // X-RAY FOLD (Option A): x-ray owns only the see-through back-face FILLS; the
  // hidden-EDGE dash is owned by edgeStyles.hidden. A FRESH x-ray box therefore
  // shows back fills but leaves hidden edges to Edge Styles (default 'drop' ⇒ not
  // dashed). Saved scenes get a migrated hidden=dash seed (scene3d-xray-fold.test.js),
  // so their look is unchanged.
  test('fresh box x-ray shows back fills; hidden edges follow Edge Styles (default: not dashed)', () => {
    const paths = algo.generate(scene('box', 'xray'), null, null, BOUNDS);
    expect(backFills(paths).length).toBeGreaterThan(0);
    expect(hiddenEdgesOf(paths).length).toBe(0);
  });

  test('box x-ray with edgeStyles.hidden=dash shows dashed hidden edges AND back-face fills', () => {
    const p = scene('box', 'xray');
    p.edgeStylesByObject = { o1: { hidden: { hiddenTreatment: 'dash', pen: null, weightMm: null, dash: null } } };
    const paths = algo.generate(p, null, null, BOUNDS);
    expect(backFills(paths).length).toBeGreaterThan(0);
    expect(hiddenEdgesOf(paths).length).toBeGreaterThan(0);
  });

  test('xrayBackFaces=false suppresses back fills (near-only)', () => {
    const on = backFills(algo.generate(scene('sphere', 'xray'), null, null, BOUNDS)).length;
    const off = backFills(algo.generate(scene('sphere', 'xray', { xrayBackFaces: false }), null, null, BOUNDS)).length;
    expect(on).toBeGreaterThan(0);
    expect(off).toBe(0);
  });

  // xrayHiddenEdges is INERT after the fold — hidden edges are dropped by the
  // default Edge Styles regardless, while back fills stay gated on visibility.
  test('xrayHiddenEdges=false: no dashed hidden edges, back fills kept', () => {
    const paths = algo.generate(scene('box', 'xray', { xrayHiddenEdges: false }), null, null, BOUNDS);
    const hiddenEdges = (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge' && pp.meta.hiddenLine === true);
    expect(hiddenEdges.length).toBe(0);
    expect(backFills(paths).length).toBeGreaterThan(0);
  });

  test('xrayBackDensity: lower density ⇒ fewer back fills', () => {
    const dense = backFills(algo.generate(scene('sphere', 'xray', { xrayBackDensity: 1 }), null, null, BOUNDS)).length;
    const sparse = backFills(algo.generate(scene('sphere', 'xray', { xrayBackDensity: 0.2 }), null, null, BOUNDS)).length;
    expect(dense).toBeGreaterThan(sparse);
  });

  // ── REGRESSION GUARD: solid output must be byte-identical regardless of any
  // x-ray params sitting in style.params (back-face emission gated strictly on
  // visibility:'xray'). ───────────────────────────────────────────────────────
  test('solid output is UNCHANGED by stray x-ray params (strict gate)', () => {
    const bare = JSON.stringify(algo.generate(scene('sphere', 'solid'), null, null, BOUNDS));
    const withXrayParams = JSON.stringify(algo.generate(
      scene('sphere', 'solid', { xrayBackFaces: true, xrayBackDensity: 0.8, xrayFront: 'faded' }),
      null, null, BOUNDS,
    ));
    expect(withXrayParams).toBe(bare);
  });

  test('deterministic: same x-ray params → byte-identical output', () => {
    const a = JSON.stringify(algo.generate(scene('sphere', 'xray'), null, null, BOUNDS));
    const b = JSON.stringify(algo.generate(scene('sphere', 'xray'), null, null, BOUNDS));
    expect(a).toBe(b);
  });
});
