const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Polish P-B — per-OBJECT EdgeStyle override. An object3d may override the
 * scene-wide edge styles for ITS OWN edges. p.edgeStylesByObject maps
 * objectId -> { <class>: EdgeStyle } and keeps ONLY the classes the object
 * overrode; the emit resolves objectOverride[class] ?? sceneEdgeStyle[class] ??
 * inherit. DEFAULT (no per-object overrides) is byte-identical to today.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D per-object EdgeStyle override (Polish P-B)', () => {
  let runtime; let V; let algo; let defaults; let Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    Params = V.Scene3D.Params;
  });
  afterAll(() => runtime.cleanup());

  // Two wireframe boxes on an empty stage; edgeStylesByObject / edgeStyles are
  // attached verbatim so a test can isolate one object's edge class.
  const scene = (opts = {}) => {
    const p = clone(defaults);
    p.objects = [
      { id: 'o1', name: 'A', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: -40, y: 50, z: 0, yaw: 24, pitch: 18, roll: 0, scale: 1 }, visibility: 'solid' },
      { id: 'o2', name: 'B', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 40, y: 50, z: 0, yaw: 24, pitch: 18, roll: 0, scale: 1 }, visibility: 'solid' },
    ];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -22, pitch: 16, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    if (opts.edgeStyles) p.edgeStyles = opts.edgeStyles;
    if (opts.edgeStylesByObject) p.edgeStylesByObject = opts.edgeStylesByObject;
    return p;
  };

  const edges = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge');
  const edgesOf = (paths, objectId, cls) => edges(paths).filter((pp) => pp.meta.sceneTarget
    && pp.meta.sceneTarget.objectId === objectId
    && (cls == null || pp.meta.sceneTarget.edgeClass === cls));
  const hiddenOf = (paths, objectId) => edges(paths).filter((pp) => pp.meta.hiddenLine === true
    && pp.meta.sceneTarget && pp.meta.sceneTarget.objectId === objectId);

  // ── normalizer: absent = inherit; only present classes survive. ─────────────
  test('normalizeObjectEdgeStyles keeps only overridden classes (null when empty)', () => {
    expect(Params.normalizeObjectEdgeStyles(undefined)).toBe(null);
    expect(Params.normalizeObjectEdgeStyles({})).toBe(null);
    const out = Params.normalizeObjectEdgeStyles({ silhouette: { weightMm: 1.2 } });
    expect(Object.keys(out)).toEqual(['silhouette']);
    expect(out.silhouette.weightMm).toBeCloseTo(1.2, 6);
    // Not-overridden classes are absent (inherit), NOT filled with no-op defaults.
    expect(out.crease).toBeUndefined();
    expect(out.hidden).toBeUndefined();
  });

  // ── (a) DEFAULT PIN: no per-object overrides ⇒ byte-identical to no map. ─────
  test('absent edgeStylesByObject is byte-identical to a bare scene', () => {
    const bare = JSON.stringify(algo.generate(scene(), null, null, BOUNDS));
    const empty = JSON.stringify(algo.generate(scene({ edgeStylesByObject: {} }), null, null, BOUNDS));
    expect(empty).toBe(bare);
  });

  // ── (b) a per-object override changes ONLY that object's edge class. ─────────
  test('per-object silhouette weight override stamps weightScale on that object only', () => {
    const p = scene({ edgeStylesByObject: { o1: { silhouette: { pen: null, weightMm: 1.2, dash: null } } } });
    const paths = algo.generate(p, null, null, BOUNDS);
    const a = edgesOf(paths, 'o1', 'silhouette');
    const b = edgesOf(paths, 'o2', 'silhouette');
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
    expect(a.every((pp) => Number.isFinite(pp.meta.weightScale) && pp.meta.weightScale > 1)).toBe(true);
    // Object B (no override) is untouched — no weightScale.
    expect(b.every((pp) => pp.meta.weightScale === undefined)).toBe(true);
  });

  test('per-object hidden dash affects only that object; the other still drops', () => {
    const p = scene({ edgeStylesByObject: { o1: { hidden: { pen: null, weightMm: null, dash: null, hiddenTreatment: 'dash' } } } });
    const paths = algo.generate(p, null, null, BOUNDS);
    expect(hiddenOf(paths, 'o1').length).toBeGreaterThan(0); // A dashes its occluded edges
    expect(hiddenOf(paths, 'o2').length).toBe(0);            // B keeps today's drop
  });

  // ── override falls back to the scene table for non-overridden classes. ───────
  test('object override for one class still inherits the scene table for others', () => {
    const es = {
      silhouette: { pen: null, weightMm: null, dash: null },
      crease: { pen: 'pen-2', weightMm: null, dash: null },
      boundary: { pen: null, weightMm: null, dash: null },
      interior: { pen: null, weightMm: null, dash: null },
      hidden: { pen: null, weightMm: null, dash: null, hiddenTreatment: 'drop' },
    };
    // Scene sets crease pen-2; object o1 overrides ONLY silhouette weight.
    const p = scene({ edgeStyles: es, edgeStylesByObject: { o1: { silhouette: { pen: null, weightMm: 0.9, dash: null } } } });
    const paths = algo.generate(p, null, null, BOUNDS);
    // o1's crease still inherits the scene pen-2 (not overridden on the object).
    const cre = edgesOf(paths, 'o1', 'crease');
    expect(cre.length).toBeGreaterThan(0);
    expect(cre.every((pp) => pp.meta.penId === 'pen-2')).toBe(true);
  });

  test('deterministic: same per-object overrides → byte-identical output', () => {
    const map = { o1: { silhouette: { pen: null, weightMm: 0.8, dash: null }, hidden: { pen: null, weightMm: null, dash: null, hiddenTreatment: 'dash' } } };
    const a = JSON.stringify(algo.generate(scene({ edgeStylesByObject: clone(map) }), null, null, BOUNDS));
    const b = JSON.stringify(algo.generate(scene({ edgeStylesByObject: clone(map) }), null, null, BOUNDS));
    expect(a).toBe(b);
  });
});
