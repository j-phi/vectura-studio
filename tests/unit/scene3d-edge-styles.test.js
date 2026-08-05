const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D per-edge-CLASS EdgeStyle (Phase 4A, C-06). Each edge class
 * (silhouette / crease / boundary / interior / hidden) carries its own
 * EdgeStyle { pen, weightMm, dash, hiddenTreatment:'drop'|'dash' }. Defaults
 * reproduce today's output byte-identically; new behavior only when a class is
 * edited. The `hidden` class's hiddenTreatment replaces the scattered
 * hidden-edge default (drop = old solid, dash = old x-ray look) WITHOUT
 * disturbing the per-object x-ray / wireframe-showHidden overrides.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

describe('Scene3D per-edge-class EdgeStyle (C-06)', () => {
  let runtime; let V; let algo; let defaults; let Edges;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    Edges = V.Scene3D.Edges;
  });
  afterAll(() => runtime.cleanup());

  // One box on an empty stage. `mapper` chooses none (outline only) or wireframe
  // (all edge classes). `edgeStyles` is attached verbatim so tests can toggle a
  // class. Tone off so the comparison isolates edge geometry.
  const scene = (mapper, edgeStyles, visibility) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 50, z: 0, yaw: 24, pitch: 18, roll: 0, scale: 1 },
      visibility: visibility || 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -22, pitch: 16, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: mapper || 'none', params: {} },
      byObject: {}, byFace: {},
    };
    p.tone = { ...clone(defaults).tone, enabled: false };
    if (edgeStyles) p.edgeStyles = edgeStyles;
    return p;
  };

  const edges = (paths) => (paths || []).filter((pp) => pp.meta && pp.meta.kind === 'sceneEdge');
  const edgesOfClass = (paths, cls) => edges(paths).filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.edgeClass === cls);
  const hiddenEdges = (paths) => edges(paths).filter((pp) => pp.meta.hiddenLine === true);

  // Default table: every class no-op (null pen/weight/dash; hidden drops).
  const DEFAULT_EDGE_STYLES = {
    silhouette: { pen: null, weightMm: null, dash: null },
    crease: { pen: null, weightMm: null, dash: null },
    boundary: { pen: null, weightMm: null, dash: null },
    interior: { pen: null, weightMm: null, dash: null },
    hidden: { pen: null, weightMm: null, dash: null, hiddenTreatment: 'drop' },
  };

  // ── (a) NO-OP PIN: default edgeStyles → byte-identical render vs no table. ──
  test('default edgeStyles is byte-identical to no edgeStyles (none)', () => {
    const bare = JSON.stringify(algo.generate(scene('none'), null, null, BOUNDS));
    const withDefaults = JSON.stringify(algo.generate(scene('none', clone(DEFAULT_EDGE_STYLES)), null, null, BOUNDS));
    expect(withDefaults).toBe(bare);
  });

  test('default edgeStyles is byte-identical to no edgeStyles (wireframe)', () => {
    const bare = JSON.stringify(algo.generate(scene('wireframe'), null, null, BOUNDS));
    const withDefaults = JSON.stringify(algo.generate(scene('wireframe', clone(DEFAULT_EDGE_STYLES)), null, null, BOUNDS));
    expect(withDefaults).toBe(bare);
  });

  // ── MIGRATION GUARD: an x-ray box still dashes its hidden edges with the
  // default (drop) scene table — the per-object x-ray flag still wins. ─────────
  test('x-ray box still dashes hidden edges under default edgeStyles (migration no-op)', () => {
    const bare = hiddenEdges(algo.generate(scene('wireframe', null, 'xray'), null, null, BOUNDS)).length;
    const withDefaults = hiddenEdges(algo.generate(scene('wireframe', clone(DEFAULT_EDGE_STYLES), 'xray'), null, null, BOUNDS)).length;
    expect(bare).toBeGreaterThan(0);
    expect(withDefaults).toBe(bare);
  });

  // ── (b) hidden → 'dash' produces dashed hidden edges on a NON-xray box that
  // today drops them. RED on pre-change code (edgeStyles ignored → 0). ─────────
  test('hidden class dash emits dashed hidden edges on a non-x-ray wireframe box', () => {
    const dropped = hiddenEdges(algo.generate(scene('wireframe'), null, null, BOUNDS)).length;
    const es = clone(DEFAULT_EDGE_STYLES);
    es.hidden.hiddenTreatment = 'dash';
    const dashed = algo.generate(scene('wireframe', es), null, null, BOUNDS);
    const hid = hiddenEdges(dashed);
    expect(dropped).toBe(0);
    expect(hid.length).toBeGreaterThan(0);
    hid.forEach((pp) => expect(Array.isArray(pp.meta.strokeDash)).toBe(true));
  });

  // ── (c) a per-class weight/pen override changes ONLY that class's strokes. ──
  test('silhouette weight override stamps weightScale on silhouette edges only', () => {
    const es = clone(DEFAULT_EDGE_STYLES);
    es.silhouette.weightMm = 1.2; // 4x the 0.3mm reference
    const paths = algo.generate(scene('wireframe', es), null, null, BOUNDS);
    const sil = edgesOfClass(paths, 'silhouette');
    const cre = edgesOfClass(paths, 'crease');
    expect(sil.length).toBeGreaterThan(0);
    expect(cre.length).toBeGreaterThan(0);
    expect(sil.every((pp) => Number.isFinite(pp.meta.weightScale) && pp.meta.weightScale > 1)).toBe(true);
    expect(cre.every((pp) => pp.meta.weightScale === undefined)).toBe(true);
  });

  test('crease pen override stamps penId on crease edges only', () => {
    const es = clone(DEFAULT_EDGE_STYLES);
    es.crease.pen = 'pen-2';
    const paths = algo.generate(scene('wireframe', es), null, null, BOUNDS);
    const cre = edgesOfClass(paths, 'crease');
    const sil = edgesOfClass(paths, 'silhouette');
    expect(cre.length).toBeGreaterThan(0);
    expect(cre.every((pp) => pp.meta.penId === 'pen-2')).toBe(true);
    expect(sil.every((pp) => pp.meta.penId !== 'pen-2')).toBe(true);
  });

  // ── (d) HLR CLASSIFICATION is unchanged (silhouette/crease/boundary). ───────
  test('edge classification for a box is unchanged (guard)', () => {
    const p = V.Scene3D.Params.normalizeParams(scene('wireframe'));
    const record = V.Scene3D.Scene.assembleScene(p, BOUNDS).objects[0];
    const cls = Edges.classifyEdges(record, {}).map((e) => e.cls).sort();
    // A box (closed manifold quad mesh) has NO boundary/interior edges — only
    // silhouette + crease. This pins the taxonomy against an emit-path regression.
    expect(cls.every((c) => c === 'silhouette' || c === 'crease')).toBe(true);
    expect(cls.filter((c) => c === 'silhouette').length).toBeGreaterThan(0);
    expect(cls.filter((c) => c === 'crease').length).toBeGreaterThan(0);
  });

  test('deterministic: same edge styles → byte-identical output', () => {
    const es = clone(DEFAULT_EDGE_STYLES);
    es.hidden.hiddenTreatment = 'dash';
    es.silhouette.weightMm = 0.9;
    const a = JSON.stringify(algo.generate(scene('wireframe', es), null, null, BOUNDS));
    const b = JSON.stringify(algo.generate(scene('wireframe', clone(es)), null, null, BOUNDS));
    expect(a).toBe(b);
  });
});
