/**
 * 3D Scene Studio — Phase 2 per-mapper controls. Covers the mapper-specific
 * params layered on top of the Phase-1 shared stroke treatment:
 *   HATCH     angleRef (face/screen/worldUp) + linkFill (boustrophedon)
 *   CONTOUR   contourStyle (region rings vs surface parallels)
 *   STIPPLE   dotShape / dotSize / stippleJitter / dotAngle marks
 *   WIREFRAME edgeClasses (per-class visibility) + showHidden (dashed occluded)
 *
 * RGR: every one of these keys is inert on the pre-Phase-2 branch (the mappers
 * ignore them, Mappers.stippleMark is undefined, the wireframe draws all edges
 * always), so each behavioural assertion FAILS before Phase 2 and passes after.
 * The final block guards that all NEW defaults reproduce the pre-Phase-2 output.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

describe('3D Scene Studio Phase 2 — per-mapper controls', () => {
  let runtime;
  let V;
  let algo;
  let defaults;
  let realCascade;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
    realCascade = V.Scene3D.StyleCascade;
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => { if (V.Scene3D) V.Scene3D.StyleCascade = realCascade; });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const box = (id, extra = {}) => ({
    id, name: id, primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 24, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', ...extra,
  });
  const sphere = (id, extra = {}) => ({
    id, name: id, primitive: 'sphere', params: { radius: 22, detail: 18 },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', ...extra,
  });
  const sceneParams = (mapper, objects, params = {}) => {
    const p = clone(defaults);
    p.seed = 1;
    p.objects = objects;
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper, params: { fillAngle: 0, fillDensity: 50, ...params } }, byObject: {}, byFace: {} };
    return p;
  };
  // Stub cascade so style.params pass through verbatim (no whitelist in the way).
  const installStub = () => {
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId, faceId }) {
        const t = styleTable || {};
        const s = (t.byFace && t.byFace[`${objectId}/${faceId}`]) || (t.byObject && t.byObject[objectId]) || t.scene || {};
        return { penId: s.penId != null ? s.penId : null, mapper: s.mapper || 'none', params: { ...(s.params || {}) }, provenance: { scope: 'test' } };
      },
    };
  };
  const gen = (mapper, objects, params, bounds) => algo.generate(sceneParams(mapper, objects, params), null, null, bounds || BOUNDS) || [];
  const fills = (paths) => paths.filter((p) => p.meta.kind === 'sceneFill' && p.length >= 2);
  const edges = (paths) => paths.filter((p) => p.meta.kind === 'sceneEdge');
  const dir = (p) => Math.round(Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) * 180 / Math.PI + 360) % 180;

  // ── HATCH angleRef ──────────────────────────────────────────────────────────
  describe('hatch angleRef', () => {
    test("'worldUp' reorients the hatch vs 'face' on a tilted box (line directions differ)", () => {
      installStub();
      const faceLines = fills(gen('hatch', [box('obj-1')], { angleRef: 'face' }));
      const upLines = fills(gen('hatch', [box('obj-1')], { angleRef: 'worldUp' }));
      expect(faceLines.length).toBeGreaterThan(0);
      expect(upLines.length).toBeGreaterThan(0);
      // Per-face dominant screen direction. worldUp keeps lines upright regardless
      // of the face, so the tilted side faces re-orient relative to the face frame.
      const dirsByFace = (ls) => {
        const m = {};
        ls.forEach((p) => { const f = p.meta.sceneTarget.faceId; if (m[f] === undefined) m[f] = dir(p); });
        return m;
      };
      const a = dirsByFace(faceLines);
      const b = dirsByFace(upLines);
      const changed = Object.keys(a).filter((f) => b[f] !== undefined && Math.abs(a[f] - b[f]) > 3);
      expect(changed.length).toBeGreaterThan(0);
    });

    test("'worldUp' reads near-vertical on the tilted SIDE faces (facing-up faces exempt)", () => {
      installStub();
      const upLines = fills(gen('hatch', [box('obj-1')], { angleRef: 'worldUp' }));
      const byFace = {};
      upLines.forEach((p) => {
        const t = p.meta.sceneTarget;
        // Skip the box's top face: its normal ∥ world up, so a "vertical" hatch is
        // undefined in-plane and legitimately falls back to the face frame.
        if (t.facingUp) return;
        if (byFace[t.faceId] === undefined) byFace[t.faceId] = dir(p);
      });
      const sides = Object.values(byFace);
      expect(sides.length).toBeGreaterThan(0);
      sides.forEach((d) => {
        const fromVertical = Math.min(Math.abs(d - 90), Math.abs(d - 90 + 180), Math.abs(d - 90 - 180));
        expect(fromVertical).toBeLessThan(30);
      });
    });
  });

  // ── HATCH linkFill (boustrophedon) ──────────────────────────────────────────
  describe('hatch linkFill', () => {
    test('linkFill=true yields fewer, longer polylines than linkFill=false', () => {
      installStub();
      const disjoint = fills(gen('hatch', [box('obj-1')], { linkFill: false }));
      const linked = fills(gen('hatch', [box('obj-1')], { linkFill: true }));
      expect(disjoint.length).toBeGreaterThan(linked.length);
      const maxLen = (ls) => Math.max(...ls.map((p) => p.length));
      // A boustrophedon path chains many segments into one run ⇒ far more vertices.
      expect(maxLen(linked)).toBeGreaterThan(maxLen(disjoint));
    });
  });

  // ── CONTOUR contourStyle ────────────────────────────────────────────────────
  describe('contour contourStyle', () => {
    test("'region' vs 'surface' produce structurally different fills on a sphere", () => {
      installStub();
      const surface = fills(gen('contour', [sphere('obj-1')], { contourStyle: 'surface' }));
      const region = fills(gen('contour', [sphere('obj-1')], { contourStyle: 'region' }));
      expect(surface.length).toBeGreaterThan(0);
      expect(region.length).toBeGreaterThan(0);
      const closed = (ls) => ls.filter((p) => Math.hypot(p[0].x - p[p.length - 1].x, p[0].y - p[p.length - 1].y) < 1e-3).length;
      // Region = concentric CLOSED inset rings, every one of them. Surface = the
      // chart's own parallels, most of which the form CUTS and which therefore
      // come back open.
      //
      // This used to read `closed(region) > closed(surface)`, which was only ever
      // true because the emitter dropped the b = 1 sample of every sweep: a
      // latitude ring the silhouette does not touch is a CLOSED loop and always
      // was one, and it arrived open by exactly one sample step. With the seam
      // fixed the two counts tie at 3, so the structural claim is now stated as
      // what actually separates the two styles — region is closed THROUGHOUT,
      // surface is not.
      expect(closed(region)).toBe(region.length);
      expect(closed(surface)).toBeLessThan(surface.length);
      expect(JSON.stringify(region)).not.toBe(JSON.stringify(surface));
    });
  });

  // ── STIPPLE marks (pure Mappers) ────────────────────────────────────────────
  describe('stipple marks', () => {
    const SQ = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];

    test('stippleMark is exported and cross/plus emit two strokes, tick one, dot/ring one', () => {
      const M = V.Scene3D.Mappers;
      expect(typeof M.stippleMark).toBe('function');
      expect(M.stippleMark('cross', 5, 5, 1, 0).length).toBe(2);
      expect(M.stippleMark('plus', 5, 5, 1, 0).length).toBe(2);
      expect(M.stippleMark('tick', 5, 5, 1, 0).length).toBe(1);
      expect(M.stippleMark('dot', 5, 5, 1, 0).length).toBe(1);
      expect(M.stippleMark('ring', 5, 5, 1, 0).length).toBe(1);
    });

    test("dotShape='cross' emits ~2× the polylines of 'dot' (more segments per dot)", () => {
      const M = V.Scene3D.Mappers;
      const dots = M.regionFill('stipple', [SQ], { spacing: 8, dotShape: 'dot' });
      const cross = M.regionFill('stipple', [SQ], { spacing: 8, dotShape: 'cross' });
      expect(dots.length).toBeGreaterThan(0);
      expect(cross.length).toBeGreaterThan(dots.length * 1.5);
    });

    test('dotSize scales the marks (a bigger dot spans a wider extent)', () => {
      const M = V.Scene3D.Mappers;
      const span = (marks) => {
        const xs = marks.flat().map((p) => p.x);
        return Math.max(...xs) - Math.min(...xs);
      };
      const small = M.regionFill('stipple', [SQ], { spacing: 10, dotShape: 'plus', dotRadius: 0.5, stippleJitter: 0 });
      const big = M.regionFill('stipple', [SQ], { spacing: 10, dotShape: 'plus', dotRadius: 2.5, stippleJitter: 0 });
      // Same lattice (jitter 0), larger marks ⇒ a wider overall footprint.
      expect(span(big)).toBeGreaterThan(span(small));
    });

    test('stippleJitter=0 is a regular lattice; >0 perturbs it deterministically', () => {
      const M = V.Scene3D.Mappers;
      const step = 8;
      const regular = M.regionFill('stipple', [SQ], { spacing: step, dotShape: 'dot', stippleJitter: 0 });
      const centre = (ring) => ({ x: ring.reduce((s, p) => s + p.x, 0) / ring.length, y: ring.reduce((s, p) => s + p.y, 0) / ring.length });
      // Lattice centres sit at step*(i+0.5) (minX=0) — (cx/step − 0.5) is integral.
      regular.forEach((ring) => {
        const c = centre(ring);
        const k = c.x / step - 0.5;
        expect(Math.abs(k - Math.round(k))).toBeLessThan(0.05);
      });
      const jittered = M.regionFill('stipple', [SQ], { spacing: step, dotShape: 'dot', stippleJitter: 60 });
      // Perturbed ⇒ different centres, but deterministic (byte-stable) across runs.
      expect(JSON.stringify(jittered)).not.toBe(JSON.stringify(regular));
      const again = M.regionFill('stipple', [SQ], { spacing: step, dotShape: 'dot', stippleJitter: 60 });
      expect(JSON.stringify(again)).toBe(JSON.stringify(jittered));
    });

    test("dotShape='cross' renders on a box face through the algorithm", () => {
      installStub();
      const dotF = fills(gen('stipple', [box('obj-1')], { dotShape: 'dot' }));
      const crossF = fills(gen('stipple', [box('obj-1')], { dotShape: 'cross' }));
      expect(crossF.length).toBeGreaterThan(dotF.length);
    });
  });

  // ── WIREFRAME edgeClasses + showHidden ──────────────────────────────────────
  describe('wireframe edge classes', () => {
    const wf = (params) => { installStub(); const p = sceneParams('wireframe', [box('obj-1')]); p.styleTable.scene.params = params; return edges(algo.generate(p, null, null, BOUNDS) || []); };
    const creaseCount = (es) => es.filter((p) => p.meta.sceneTarget.edgeClass === 'crease').length;

    test('toggling off crease removes crease edges; keeps silhouette', () => {
      const all = wf({});
      const noCrease = wf({ edgeClasses: { silhouette: true, boundary: true, crease: false, interior: true } });
      expect(creaseCount(all)).toBeGreaterThan(0);
      expect(creaseCount(noCrease)).toBe(0);
      expect(noCrease.some((p) => p.meta.sceneTarget.edgeClass === 'silhouette')).toBe(true);
    });

    test('showHidden=true adds dashed occluded edges (none by default)', () => {
      const solid = wf({});
      const xrayLike = wf({ showHidden: true });
      const occluded = (es) => es.filter((p) => p.meta.sceneTarget && p.meta.sceneTarget.occluded === true).length;
      expect(occluded(solid)).toBe(0);
      expect(occluded(xrayLike)).toBeGreaterThan(0);
    });
  });

  // ── REGRESSION: every NEW default reproduces the pre-Phase-2 output ──────────
  describe('Phase-2 defaults are no-ops', () => {
    test('hatch: explicit face/linkFill:false defaults == bare hatch', () => {
      installStub();
      const bare = gen('hatch', [box('obj-1')]);
      const explicit = gen('hatch', [box('obj-1')], { angleRef: 'face', linkFill: false });
      expect(JSON.stringify(explicit)).toBe(JSON.stringify(bare));
    });

    test('stipple: explicit dot/jitter:40 defaults == bare stipple', () => {
      installStub();
      const bare = gen('stipple', [box('obj-1')]);
      const explicit = gen('stipple', [box('obj-1')], { dotShape: 'dot', stippleJitter: 40 });
      expect(JSON.stringify(explicit)).toBe(JSON.stringify(bare));
    });

    test('contour: explicit surface default == bare contour (curved + faceted)', () => {
      installStub();
      ['obj-1'].forEach(() => {
        const bareBox = gen('contour', [box('obj-1')]);
        const explicitBox = gen('contour', [box('obj-1')], { contourStyle: 'surface' });
        expect(JSON.stringify(explicitBox)).toBe(JSON.stringify(bareBox));
        const bareSph = gen('contour', [sphere('obj-1')]);
        const explicitSph = gen('contour', [sphere('obj-1')], { contourStyle: 'surface' });
        expect(JSON.stringify(explicitSph)).toBe(JSON.stringify(bareSph));
      });
    });

    test('wireframe: all-edges default == bare wireframe', () => {
      installStub();
      const p = sceneParams('wireframe', [box('obj-1')]);
      const bare = algo.generate(p, null, null, BOUNDS) || [];
      const p2 = sceneParams('wireframe', [box('obj-1')]);
      p2.styleTable.scene.params = { edgeClasses: { silhouette: true, boundary: true, crease: true, interior: true }, showHidden: false };
      const explicit = algo.generate(p2, null, null, BOUNDS) || [];
      expect(JSON.stringify(explicit)).toBe(JSON.stringify(bare));
    });
  });
});
