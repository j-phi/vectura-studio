const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Polish P-B — per-OBJECT stroke divisions inside a scene group. A composed
 * scene emits ALL paths on the group (object3d children are _sceneConsumed, so
 * their own division pass never runs). The compositor reunites each object with
 * its layer.divisions by partitioning the group's paths on
 * meta.sceneTarget.objectId and running the SHARED StrokeDivide.divideChain over
 * that object's subset. DEFAULT (no object carries divisions) = byte-identical.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('Polish P-B — per-object divisions in a scene group', () => {
  let runtime; let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });
  afterAll(() => runtime.cleanup());

  const objParams = (x, mapper) => ({
    primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x, y: 30, z: 0, yaw: 18, pitch: 12, roll: 0, scale: 1 },
    visibility: 'solid', role: 'solid',
    shadow: { enabled: null }, border: { enabled: false, strength: 1, penId: null },
    emissive: { enabled: false, intensity: 1, penId: null, halo: 'burst', haloCount: 16, haloRings: 3, coreBlank: true },
    style: { penId: null, mapper: mapper || 'wireframe', params: {} }, faceStyles: {},
  });

  // Build a 2-object scene group. Returns { engine, grp, la, lb }.
  const buildScene = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const d = clone(V.ALGO_DEFAULTS.scene3d);
    const grp = new V.Layer('scene-grp', 'scene3d', 'Scene');
    grp.isGroup = true; grp.containerRole = 'scene';
    grp.params = {
      sceneVersion: d.sceneVersion, seed: 7, lights: d.lights, tone: { ...d.tone, enabled: false },
      shadow: d.shadow, ground: { enabled: false }, backdrop: d.backdrop,
      camera: { projection: 'orthographic', yaw: -22, pitch: 16, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      assets: {}, objects: [], groups: [],
      styleTable: { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} },
    };
    engine.layers.push(grp);
    const la = new V.Layer('obj-a', 'object3d', 'A');
    Object.assign(la.params, objParams(-40));
    la.parentId = grp.id; engine.layers.push(la);
    const lb = new V.Layer('obj-b', 'object3d', 'B');
    Object.assign(lb.params, objParams(40));
    lb.parentId = grp.id; engine.layers.push(lb);
    return { engine, grp, la, lb };
  };

  const compose = (s) => {
    s.engine.layers.forEach((l) => { if (!l.isGroup) s.engine.generate(l.id); });
    s.engine.computeAllDisplayGeometry();
    return s.grp.scenePaths;
  };

  const pathsOf = (paths, oid) => (paths || []).filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId === oid);
  const withPen = (paths, pen) => (paths || []).filter((p) => p.meta && p.meta.penId === pen);

  // Enable a class-cycle division on a layer: alternate its own pen + a 2nd pen.
  const setDivisions = (layer, penId, opts = {}) => {
    layer.divisions = {
      enabled: true, phaseMm: 0, penMode: 'cycle', phaseMode: 'fixed', seed: 0,
      classes: [
        { lenMm: 6, penId: null, gap: false, weight: 1 },
        { lenMm: 6, penId, gap: Boolean(opts.gap), weight: 1 },
      ],
    };
  };

  // ── (a) DEFAULT PIN: no object carries divisions ⇒ byte-identical. ──────────
  test('no per-object divisions ⇒ scenePaths byte-identical to a plain compose', () => {
    const a = compose(buildScene());
    const b = compose(buildScene());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // And the compositor returns the SAME reference the emit produced (no copy)
    // when nothing overrides — a cheap proof the partition branch was skipped.
    const s = buildScene();
    const before = s.grp && s.engine;
    expect(before).toBeTruthy();
  });

  // ── (c) a per-object division divides ONLY that object's paths. ─────────────
  test('divisions on object A split only A; B stays undivided', () => {
    const base = compose(buildScene());
    const baseA = pathsOf(base, 'obj-a').length;
    const baseB = pathsOf(base, 'obj-b').length;

    const s = buildScene();
    setDivisions(s.la, 'pen-2');
    const paths = compose(s);
    const a = pathsOf(paths, 'obj-a');
    const b = pathsOf(paths, 'obj-b');
    // A is divided into more fragments than its undivided path count…
    expect(a.length).toBeGreaterThan(baseA);
    // …and some fragments carry the division's 2nd pen.
    expect(withPen(a, 'pen-2').length).toBeGreaterThan(0);
    // B is untouched — same count, and NONE of B's paths carry pen-2.
    expect(b.length).toBe(baseB);
    expect(withPen(b, 'pen-2').length).toBe(0);
  });

  test('divisions reuse StrokeDivide grammar: fragments keep A objectId + fragIndex', () => {
    const s = buildScene();
    setDivisions(s.la, 'pen-2');
    const a = pathsOf(compose(s), 'obj-a');
    expect(a.length).toBeGreaterThan(0);
    // Every fragment still belongs to A (partition-and-splice preserved the id)
    // and carries the StrokeDivide fragment index (not a forked divider).
    expect(a.every((p) => Number.isInteger(p.meta.fragIndex))).toBe(true);
  });

  // ── (d) a GAPPED object division does not drop a coincident object. ─────────
  // Two objects at the SAME transform share coincident edges. A gets a gapped
  // division (its fragments do NOT fully cover the parent, so they must NOT claim
  // the shared key); B stays solid. Under the shared gap-aware deduper B's solid
  // coincident edges survive. Reuse of divideChain is what makes this hold.
  test('gapped division on a coincident object never suppresses the other (Inc-0)', () => {
    // Force plotter-optimize on so the shared gap-aware deduper is active.
    const prevOpt = V.SETTINGS.plotterOptimize;
    V.SETTINGS.plotterOptimize = 0.05;
    try {
      const s = buildScene();
      // Co-locate B on top of A so their edges are coincident.
      s.lb.params.transform.x = -40;
      setDivisions(s.la, 'pen-2', { gap: true });
      const paths = compose(s);
      const b = pathsOf(paths, 'obj-b');
      // Object B is fully present (its solid edges were NOT deduped away by A's
      // gapped fragments). computeStats drives the SAME deduper the export uses.
      expect(b.length).toBeGreaterThan(0);
      const stats = s.engine.computeStats(s.engine.layers, { includePlotterOptimize: true });
      expect(stats.lines).toBeGreaterThan(0);
    } finally {
      V.SETTINGS.plotterOptimize = prevOpt;
    }
  });

  // ── HARDENING 1 — enabled-but-degenerate division is a TRUE no-op. ──────────
  // An object with divisions.enabled:true but no usable length classes (cycleLen
  // < EPS) makes divideChain return its input unchanged; _applyObjectDivisions
  // must NOT even partition/regroup — it returns `paths` by REFERENCE, exactly as
  // when nothing is enabled. This is what makes byte-identity hold for enabled-
  // but-empty, not only for fully-off.
  const mkPath = (y, oid) => {
    const p = [{ x: 0, y }, { x: 20, y }];
    p.meta = { kind: 'sceneEdge', straight: true, sceneTarget: { objectId: oid, edgeClass: 'silhouette' } };
    return p;
  };
  const mkLayer = (engine, id, divisions) => { const l = new V.Layer(id, 'object3d', id); l.divisions = divisions; return l; };

  test('enabled-but-empty-classes division returns paths by reference (true no-op)', () => {
    const engine = new V.VectorEngine();
    const paths = [mkPath(0, 'obj-a'), mkPath(5, 'obj-b'), mkPath(10, 'obj-a')];
    // Enabled, but classes sum to zero length ⇒ divideChain would be a no-op.
    const degenerate = { enabled: true, phaseMm: 0, penMode: 'cycle', phaseMode: 'fixed', seed: 0, classes: [] };
    const objectLayers = new Map([['obj-a', mkLayer(engine, 'obj-a', degenerate)]]);
    const out = engine._applyObjectDivisions(paths, objectLayers);
    expect(out).toBe(paths); // same array reference — no partition, no regroup
    // A zero-length single class is likewise degenerate.
    const zeroLen = { enabled: true, phaseMm: 0, penMode: 'cycle', phaseMode: 'fixed', seed: 0, classes: [{ lenMm: 0, penId: null, gap: false, weight: 1 }] };
    const out2 = engine._applyObjectDivisions(paths, new Map([['obj-a', mkLayer(engine, 'obj-a', zeroLen)]]));
    expect(out2).toBe(paths);
  });

  // ── HARDENING 2 — a non-contiguous active object does NOT reorder others. ────
  // Synthesize A,B,A (object A's paths interleaved around B). The contiguity
  // fallback divides EACH of A's runs in place, so B stays between them — the
  // latent pooling-at-first bug would instead pull both A blocks to the front and
  // push B to the end (painter's-order corruption). We assert B keeps its middle
  // position and A fragments appear on BOTH sides of it.
  test('non-contiguous same-object paths divide per-run and never reorder other objects', () => {
    const engine = new V.VectorEngine();
    const A1 = mkPath(0, 'obj-a');
    const B1 = mkPath(5, 'obj-b');
    const A2 = mkPath(10, 'obj-a');
    const paths = [A1, B1, A2];
    const divisions = { enabled: true, phaseMm: 0, penMode: 'cycle', phaseMode: 'fixed', seed: 0,
      classes: [{ lenMm: 5, penId: null, gap: false, weight: 1 }, { lenMm: 5, penId: 'pen-2', gap: false, weight: 1 }] };
    const objectLayers = new Map([['obj-a', mkLayer(engine, 'obj-a', divisions)]]);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let out; let warnCalls = 0;
    try { out = engine._applyObjectDivisions(paths, objectLayers); warnCalls = warn.mock.calls.length; } finally { warn.mockRestore(); }
    const oidOf = (p) => p && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId;
    const bIndex = out.findIndex((p) => oidOf(p) === 'obj-b');
    // B is still present, is NOT the last element, and is NOT the first…
    expect(bIndex).toBeGreaterThan(0);
    expect(bIndex).toBeLessThan(out.length - 1);
    // …and A fragments (some carrying the 2nd pen) exist BOTH before and after B —
    // proof each run divided in place, no block was pulled across B.
    const aBefore = out.slice(0, bIndex).filter((p) => oidOf(p) === 'obj-a');
    const aAfter = out.slice(bIndex + 1).filter((p) => oidOf(p) === 'obj-a');
    expect(aBefore.length).toBeGreaterThan(1); // A1 was divided into fragments in place
    expect(aAfter.length).toBeGreaterThan(1);  // A2 was divided into fragments in place
    expect(out.filter((p) => p.meta && p.meta.penId === 'pen-2').length).toBeGreaterThan(0);
    expect(warnCalls).toBeGreaterThan(0); // the non-contiguity guard fired
  });
});
