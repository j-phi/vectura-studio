/*
 * RGR — etfKang strokes are the slices of the object by planes perpendicular to a wrap axis (default: the top pole),
 * not the depth isocontours of the camera. Rings are locked to the OBJECT: latitudes on a sphere, horizontal rings on
 * a cylinder's side, straight parallel lines on a face that looks along the axis (a cylinder cap). The Wrap origin
 * (wrapOriginX / wrapOriginY) tilts the axis. RED on the base tree (depth isocontours): the sphere's strokes ran
 * around the camera-facing point, so they were not perpendicular to +Y and the wrapOrigin keys were ignored.
 *
 * The field itself is measured: for each substrate the law ran on (a sphere, a cylinder's side, a cylinder cap) the
 * test steps 0.3 mm along the published direction field, reads the WORLD position of both ends through the substrate's
 * own `inv`, and checks the step against the wrap axis a (ring: no motion along a) and the straight axis e (cap: no
 * motion along e).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('etfKang wrap rings (object-locked)', () => {
  let runtime; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: false });
    V = runtime.window.Vectura;
    V.SETTINGS.scenePoseWarp = false;
  }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

  // Run a scene and keep EVERY substrate the law ran on (the mono emit publishes its ctx under __MONO_TRACE).
  const run = ({ primitive = 'sphere', transform = {}, params = {}, camera = null, azimuth = null }) => {
    const ctxs = [];
    runtime.window.__MONO_TRACE = true;
    Object.defineProperty(runtime.window, '__MONO_CTX', { configurable: true, set(c) { ctxs.push(c); }, get() { return ctxs[ctxs.length - 1]; } });
    try {
      const engine = new V.VectorEngine();
      const gid = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l.id === gid);
      group.params.tone = { ...(group.params.tone || {}), model: 'v2' };
      if (camera) group.params.camera = { ...(group.params.camera || {}), ...camera };
      const kids = engine.getLayerDescendants(gid);
      if (azimuth !== null) { const L = kids.find((l) => l && l.type === 'sceneLight3d'); if (L) L.params.azimuth = azimuth; }
      const child = kids.find((l) => l && l.type === 'object3d');
      child.params.primitive = primitive;
      child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: 'etfKang', ...params } };
      Object.assign(child.params.transform, { yaw: 33, pitch: 0, roll: 0 }, transform);
      engine.computeAllDisplayGeometry();
      return { ctxs: ctxs.slice(), group };
    } finally { delete runtime.window.__MONO_TRACE; delete runtime.window.__MONO_CTX; }
  };

  // Sample a ctx's direction field: [{ along a, along e, |a x n| }] for every grid point where the field exists.
  const probe = (C, wrap = C.wrap) => {
    const out = [];
    const a = wrap.a; const e = wrap.e;
    for (let y = C.minY + C.H * 0.08; y < C.maxY - C.H * 0.08; y += C.H / 40) {
      for (let x = C.minX + C.W * 0.08; x < C.maxX - C.W * 0.08; x += C.W / 40) {
        const d = C.__dirAt({ x, y });
        const s0 = C.inv(x, y);
        if (!d || !s0 || !s0.world || !s0.wN) continue;
        const s1 = C.inv(x + d.x * 0.3, y + d.y * 0.3);
        if (!s1 || !s1.world) continue;
        const dw = { x: s1.world.x - s0.world.x, y: s1.world.y - s0.world.y, z: s1.world.z - s0.world.z };
        const L = Math.hypot(dw.x, dw.y, dw.z);
        if (!(L > 1e-6)) continue;
        const n = s0.wN;
        const cr = Math.hypot(a.y * n.z - a.z * n.y, a.z * n.x - a.x * n.z, a.x * n.y - a.y * n.x);
        out.push({
          alongA: Math.abs(dw.x * a.x + dw.y * a.y + dw.z * a.z) / L,
          alongE: Math.abs(dw.x * e.x + dw.y * e.y + dw.z * e.z) / L,
          sin: cr, dir: d,
        });
      }
    }
    return out;
  };
  const median = (arr) => { const s = arr.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const ringStats = (C, wrap = C.wrap) => {
    const pts = probe(C, wrap).filter((p) => p.sin > 0.5);   // well away from the axis: a ring is well defined
    return { n: pts.length, med: median(pts.map((p) => p.alongA)), p90: median(pts.map((p) => p.alongA).sort((p, q) => q - p).slice(0, Math.max(1, Math.floor(pts.length * 0.1)))) };
  };

  test('sphere, default origin: strokes are latitude rings (no motion along +Y), whatever the camera or the light', () => {
    const base = run({ primitive: 'sphere' });
    const C = base.ctxs[base.ctxs.length - 1];
    expect(C.wrap).toBeTruthy();
    expect(Math.abs(C.wrap.a.y)).toBeGreaterThan(0.999);       // the object's top pole
    const st = ringStats(C);
    expect(st.n).toBeGreaterThan(60);
    expect(st.med).toBeLessThan(0.12);
    // A different camera and a different light: the rings stay on the object (a ring is a ring in object space).
    const cam = run({ primitive: 'sphere', camera: { yaw: 70, pitch: 35 }, azimuth: 200 });
    const stc = ringStats(cam.ctxs[cam.ctxs.length - 1]);
    expect(stc.n).toBeGreaterThan(60);
    expect(stc.med).toBeLessThan(0.12);
  }, 240000);

  test('the rings rotate with the object, not with the camera', () => {
    const r = run({ primitive: 'sphere', transform: { pitch: 40, roll: 25 } });
    const C = r.ctxs[r.ctxs.length - 1];
    expect(Math.abs(C.wrap.a.y)).toBeLessThan(0.95);            // the axis left +Y with the object
    const st = ringStats(C);
    expect(st.n).toBeGreaterThan(60);
    expect(st.med).toBeLessThan(0.12);
  }, 240000);

  test('Wrap origin tilts the axis: rings follow the new axis and no longer the old one', () => {
    const top = run({ primitive: 'sphere' }).ctxs.pop();
    const moved = run({ primitive: 'sphere', params: { wrapOriginX: 0.7, wrapOriginY: 0.5 } }).ctxs.pop();
    expect(Math.abs(moved.wrap.a.y - top.wrap.a.y)).toBeGreaterThan(0.2);
    const st = ringStats(moved);
    expect(st.n).toBeGreaterThan(60);
    expect(st.med).toBeLessThan(0.12);
    // Measured against the OLD axis the same field is far from a ring.
    expect(ringStats(moved, top.wrap).med).toBeGreaterThan(st.med * 2.5);
  }, 240000);

  test('cylinder: the side is horizontal rings', () => {
    const r = run({ primitive: 'cylinder' });
    const C = r.ctxs[r.ctxs.length - 1];
    expect(C.wrap).toBeTruthy();
    const pts = probe(C);
    expect(median(pts.map((p) => p.sin))).toBeGreaterThan(0.9);   // the tube's side faces away from the axis
    expect(ringStats(C).n).toBeGreaterThan(60);
    expect(ringStats(C).med).toBeLessThan(0.1);
  }, 240000);

  test('box: the top (a face looking along the axis) is straight parallel lines, the sides are horizontal', () => {
    const r = run({ primitive: 'box' });
    let top = null; let side = null; let topN = 0; let sideN = 0;
    r.ctxs.forEach((C) => {
      if (!C.wrap || !C.__dirAt) return;
      const pts = probe(C);
      if (pts.length < 12) return;
      const sinMed = median(pts.map((p) => p.sin));
      if (sinMed < 0.05 && pts.length > topN) { top = C; topN = pts.length; }
      else if (sinMed > 0.9 && pts.length > sideN) { side = C; sideN = pts.length; }
    });
    expect(top).toBeTruthy();
    expect(side).toBeTruthy();
    const tp = probe(top);
    expect(median(tp.map((p) => p.alongE))).toBeLessThan(0.1);          // no motion along e: level sets of P.e
    const d0 = tp[0].dir;
    expect(median(tp.map((p) => Math.abs(p.dir.x * d0.y - p.dir.y * d0.x)))).toBeLessThan(0.08);   // one direction
    expect(median(probe(side).map((p) => p.alongA))).toBeLessThan(0.1); // horizontal on a side face
  }, 240000);

  test('deterministic: the same scene gives the same field and the same ink', () => {
    const grid = (r) => { const C = r.ctxs[r.ctxs.length - 1]; return probe(C).map((p) => `${p.dir.x.toFixed(5)},${p.dir.y.toFixed(5)}`).join(';'); };
    const h = (r) => JSON.stringify((r.group.scenePaths || []).filter(Array.isArray).map((p) => p.map((q) => [q.x, q.y])));
    const A = run({ primitive: 'sphere', params: { wrapOriginX: 0.3, wrapOriginY: -0.2 } });
    const B = run({ primitive: 'sphere', params: { wrapOriginX: 0.3, wrapOriginY: -0.2 } });
    expect(grid(A)).toBe(grid(B));
    expect(h(A)).toBe(h(B));
  }, 240000);
});
