/*
 * RGR — etfKang's two faces meet at a crease (a cylinder's rim) with their own directions. The Kang smoothing, the
 * central differences of the h / q gradients and the nearest-cell field lookup used to mix the cap's straight lines and
 * the side's rings across the rim, and a stroke ran on over it: it bent, a cap hatch continuing onto the side. Edge-aware
 * (ETF.EDGE_DEG): a crease is a cell whose neighbours' normals turn by more than 30 degrees; the field of a face is only ever
 * read from cells of that face (one-sided differences, no smoothing across), and a stroke ends where it would step
 * onto a crease or another face (it never turns a corner onto it).
 *
 * Measured on the strokes the scene emits (screen mm), through the substrate's own `inv`:
 *   - crossing: a stroke carrying vertices on the cap AND on the side (outlines excluded);
 *   - cap stroke segments within 2 mm of the rim must not move along the straight axis e (p90 of the world-step fraction).
 * The witness switches the edge-awareness off (EDGE_DEG 0) and must fail the same bars, so the bars are real.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('etfKang wrap rings: the rim keeps both faces', () => {
  let runtime; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: false });
    V = runtime.window.Vectura;
    V.SETTINGS.scenePoseWarp = false;
  }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

  const run = ({ primitive = 'cylinder', pitch = null, edgeDeg = null }) => {
    const ctxs = [];
    const lock0 = V.SCENE3D_SURFACE_LOCK;
    if (edgeDeg !== null) V.SCENE3D_SURFACE_LOCK = { ...lock0, ETF: { ...lock0.ETF, EDGE_DEG: edgeDeg } };
    runtime.window.__MONO_TRACE = true;
    Object.defineProperty(runtime.window, '__MONO_CTX', { configurable: true, set(c) { ctxs.push(c); }, get() { return ctxs[ctxs.length - 1]; } });
    try {
      const engine = new V.VectorEngine();
      const gid = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l.id === gid);
      group.params.tone = { ...(group.params.tone || {}), model: 'v2' };
      if (pitch !== null) group.params.camera = { ...(group.params.camera || {}), pitch };
      const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
      child.params.primitive = primitive;
      child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: 'etfKang' } };
      Object.assign(child.params.transform, { yaw: 33, pitch: 0, roll: 0 });
      engine.computeAllDisplayGeometry();
      return { C: ctxs.filter((c) => c.wrap).pop(), paths: group.scenePaths || [] };
    } finally {
      V.SCENE3D_SURFACE_LOCK = lock0;
      delete runtime.window.__MONO_TRACE; delete runtime.window.__MONO_CTX;
    }
  };

  const strokeStats = ({ C, paths }) => {
    const a = C.wrap.a; const e = C.wrap.e;
    const nAt = (x, y) => { const s = C.inv(x, y); return s && s.wN ? s : null; };
    const ring = (x, y, n, r) => {
      for (let q = 0; q < 8; q++) {
        const s1 = nAt(x + Math.cos(q * Math.PI / 4) * r, y + Math.sin(q * Math.PI / 4) * r);
        if (s1 && s1.wN.x * n.x + s1.wN.y * n.y + s1.wN.z * n.z < 0.6) return true;
      }
      return false;
    };
    const cap = []; let crossing = 0; let strokes = 0;
    paths.forEach((P) => {
      const pts = P.points || P;
      if (!pts || pts.length < 3) return;
      const lab = []; let onEdge = 0; let tot = 0;
      for (let i = 0; i < pts.length; i++) {
        const s = nAt(pts[i].x, pts[i].y);
        if (!s) { lab.push(null); continue; }
        const an = Math.abs(a.x * s.wN.x + a.y * s.wN.y + a.z * s.wN.z);
        lab.push(an > 0.95 ? 'c' : (an < 0.2 ? 's' : 'm'));
        if (i % 2 === 0) {
          tot += 1;
          const silhouette = [0, 1, 2, 3, 4, 5, 6, 7].some((q) => !nAt(pts[i].x + Math.cos(q * Math.PI / 4) * 0.8, pts[i].y + Math.sin(q * Math.PI / 4) * 0.8));
          if (silhouette || ring(pts[i].x, pts[i].y, s.wN, 0.25)) onEdge += 1;
        }
      }
      if (tot && onEdge / tot > 0.4) return;            // an outline (rim or silhouette), not a stroke
      strokes += 1;
      if (lab.includes('c') && lab.includes('s')) crossing += 1;
      for (let i = 0; i + 1 < pts.length; i++) {
        if (lab[i] !== 'c' || lab[i + 1] !== 'c') continue;
        const sm = nAt((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        if (!sm) continue;
        const mx = (pts[i].x + pts[i + 1].x) / 2; const my = (pts[i].y + pts[i + 1].y) / 2;
        if (!(ring(mx, my, sm.wN, 0.6) || ring(mx, my, sm.wN, 1.2) || ring(mx, my, sm.wN, 2.0)) || ring(mx, my, sm.wN, 0.15)) continue;
        const s0 = nAt(pts[i].x, pts[i].y); const s1 = nAt(pts[i + 1].x, pts[i + 1].y);
        if (!s0 || !s1) continue;
        const dw = { x: s1.world.x - s0.world.x, y: s1.world.y - s0.world.y, z: s1.world.z - s0.world.z };
        const L = Math.hypot(dw.x, dw.y, dw.z);
        if (L > 1e-6) cap.push(Math.abs(dw.x * e.x + dw.y * e.y + dw.z * e.z) / L);
      }
    });
    const s = cap.slice().sort((p, q) => p - q);
    return { strokes, crossing, nCap: cap.length, capP90: s.length ? s[Math.floor(s.length * 0.9)] : NaN };
  };

  [['default camera', null], ['pitch -65', -65]].forEach(([name, pitch]) => {
    test(`cylinder, ${name}: no stroke runs from the cap onto the side, and the cap stays straight to the rim`, () => {
      const st = strokeStats(run({ pitch }));
      expect(st.strokes).toBeGreaterThan(40);
      expect(st.nCap).toBeGreaterThan(40);
      expect(st.crossing).toBe(0);
      expect(st.capP90).toBeLessThan(0.22);
    }, 240000);
  });

  test('witness: with the edge-awareness off strokes run over the rim and bend (the old behaviour), so the bars above are real', () => {
    const st = strokeStats(run({ pitch: -65, edgeDeg: 0 }));
    expect(st.crossing).toBeGreaterThan(4);
    expect(st.capP90).toBeGreaterThan(0.22);
  }, 240000);

  test('a smooth surface is one face: a sphere has a single region, and so does a plane-free ring of strokes', () => {
    expect(run({ primitive: 'sphere' }).C.etfRegions).toBe(1);
  }, 240000);
});
