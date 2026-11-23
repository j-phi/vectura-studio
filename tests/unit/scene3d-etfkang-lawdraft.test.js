/*
 * RGR — etfKang on the 'law' drag tier. The Kang direction field can't be baked
 * (it is the screen gradient of depth), so the drag draft stays a real compose
 * but runs a 48 grid x 2 passes field instead of 96 x 4. Settled output is
 * byte-identical. RED on the base tree: no `etfWork` counter (undefined).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pinLegacySun } = require('../helpers/legacy-sun');

const hashPaths = (paths) => {
  let h = 0x811c9dc5 >>> 0; let n = 0; let pts = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
  (paths || []).forEach((p) => {
    if (!Array.isArray(p)) return;
    n++; mix('|');
    p.forEach((q) => { pts++; mix(`${q.x},${q.y};`); });
  });
  return { hash: h.toString(16), paths: n, pts };
};
// Settled etfKang sphere (yaw 33, same scene as scene3d-mono-draft-substrate; x64 value of its pinned golden, recorded pre-change).
const SETTLED = { hash: 'b2689b20', paths: 285, pts: 13885 };
const BASE_WORK = 96 * 96 * 4;

describe('etfKang law-tier draft', () => {
  let runtime; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: false });
    V = runtime.window.Vectura;
    V.SETTINGS.scenePoseWarp = false;
  }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

  const makeScene = () => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    pinLegacySun(engine, gid);
    const group = engine.layers.find((l) => l.id === gid);
    const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
    child.params.primitive = 'sphere';
    child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: 'etfKang' } };
    child.params.transform.yaw = 33; child.params.transform.pitch = 0; child.params.transform.roll = 0;
    return { engine, gid, group };
  };
  const settled = () => {
    const s = makeScene();
    s.engine.computeAllDisplayGeometry();
    return { ...s, diag: runtime.window.__MONO_DIAG };
  };
  const draft = () => {
    const s = makeScene();
    s.engine.computeAllDisplayGeometry();
    s.group._sceneLastFullMs = 5000; // slow settled compose => 'law' tier
    runtime.window.__MONO_DIAG = null;
    s.engine.generate(s.gid, { preview: true });
    expect(s.group._pathsFromDraft).toBe(true);
    return { ...s, diag: runtime.window.__MONO_DIAG };
  };

  test('settled compose is byte-identical and keeps the 96 x 4 field', () => {
    const s = settled();
    expect(hashPaths(s.group.scenePaths)).toEqual(SETTLED);
    expect(s.diag.etfWork).toBe(BASE_WORK);
  }, 180000);

  test('law-tier compose does at most 0.3x the field work', () => {
    const d = draft().diag;
    expect(typeof d.etfWork).toBe('number');
    expect(d.etfWork).toBeLessThanOrEqual(BASE_WORK * 0.3);
    expect(d.emitted).toBeGreaterThan(0);
  }, 180000);

  test('draft output stays tone-monotone: darker regions carry more ink', () => {
    runtime.window.__MONO_TRACE = true;
    try {
      const d = draft();
      const C = runtime.window.__MONO_CTX;
      expect(C).toBeTruthy();
      const pts = (d.group.scenePaths || []).filter(Array.isArray);
      const cell = 2;
      const bins = new Map();
      const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
      pts.forEach((p) => {
        for (let i = 1; i < p.length; i++) {
          const k = key((p[i].x + p[i - 1].x) / 2, (p[i].y + p[i - 1].y) / 2);
          bins.set(k, (bins.get(k) || 0) + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
        }
      });
      // On-surface cells with their tone density (dens: higher = darker).
      const cells = new Map();
      for (let i = 0; i < C.lat.length; i++) {
        const q = C.lat[i]; const k = key(q.x, q.y);
        if (cells.has(k)) continue;
        const sm = C.inv(q.x, q.y);
        if (sm) cells.set(k, C.dens(sm));
      }
      const rows = [...cells.entries()].map(([k, d]) => ({ d, ink: bins.get(k) || 0 })).sort((a, b) => b.d - a.d);
      const q = Math.floor(rows.length / 4);
      const mean = (a) => a.reduce((t, r) => t + r.ink, 0) / Math.max(1, a.length);
      const quart = [0, 1, 2, 3].map((i) => mean(rows.slice(i * q, (i + 1) * q)));
      const dark = quart[0]; const light = quart[3];
      expect(rows.length).toBeGreaterThan(40);
      expect(dark).toBeGreaterThan(light * 2);
      expect(dark).toBeGreaterThanOrEqual(Math.max(quart[1], quart[2]));
    } finally { delete runtime.window.__MONO_TRACE; delete runtime.window.__MONO_CTX; }
  }, 180000);
});
