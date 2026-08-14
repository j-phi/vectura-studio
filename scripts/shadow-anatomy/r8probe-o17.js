/* O17 probe: the screen crossing angle, per zone, read off the drawing.
 * Fixture from render.js; nothing restated. */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const PATCH = 4;
const BINS = 36;
const MIN_SEP = 20;
const VIEW = process.argv[2] || 'E-bands4';

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
};

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;
  const np = R7.buildParams(V, VIEW);
  const paths = R7.buildPaths(V, VIEW);
  const scn = Sc.assembleScene(np, R7.BOUNDS);
  const obj = np.objects.find((o) => o.primitive === 'sphere');
  const r = obj.params.radius;
  const chart = V.Scene3D.SurfaceFill.chartFor('sphere', { sx: r, sy: r, sz: r });
  const t = obj.transform;
  const E = 1e-3; const N = Math.max(200, Math.round(200 * (r / 46)));
  const cell = {};
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const a = i / N; const b = j / N;
      const p0 = chart(a, b); const pa = chart(Math.min(1, a + E), b); const pb = chart(a, Math.min(1, b + E));
      if (!p0 || !pa || !pb) continue;
      let nn = G3.cross(G3.sub(pa, p0), G3.sub(pb, p0));
      const L = Math.hypot(nn.x, nn.y, nn.z); if (L < 1e-9) continue;
      nn = G3.mul(nn, 1 / L);
      if (G3.dot(nn, p0) < 0) nn = G3.mul(nn, -1);
      const world = Sc.applyObjectTransform(p0, t);
      if (G3.rotatePoint(nn, scn.camera).z <= 0) continue;
      const scr = scn.projectWorld(world); if (!scr) continue;
      const z = R.formZone(nn, world, { tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * r } });
      const k = `${Math.floor(scr.y / PATCH)},${Math.floor(scr.x / PATCH)}`;
      (cell[k] = cell[k] || {})[z] = (cell[k][z] || 0) + 1;
    }
  }
  const zoneAt = {};
  Object.entries(cell).forEach(([k, h]) => {
    const tot = Object.values(h).reduce((s, v) => s + v, 0);
    if (tot < 20) return;
    const dom = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
    if (dom[1] < 0.65 * tot) return;
    zoneAt[k] = dom[0];
  });

  const hist = {};
  paths.forEach((p) => {
    const m = p.meta || {}; const tt = m.sceneTarget || {};
    if (m.kind !== 'sceneFill' || tt.objectId !== obj.id) return;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const L = Math.hypot(dx, dy); if (!(L > 1e-6)) continue;
      let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      ang = ((ang % 180) + 180) % 180;
      const key = `${Math.floor(((a.y + b.y) / 2) / PATCH)},${Math.floor(((a.x + b.x) / 2) / PATCH)}`;
      const c = hist[key] || (hist[key] = new Float64Array(BINS));
      const f = (ang / 180) * BINS;
      const k0 = Math.floor(f) % BINS; const fr = f - Math.floor(f);
      c[k0] += L * (1 - fr); c[(k0 + 1) % BINS] += L * fr;
    }
  });

  const byZone = {};
  Object.entries(hist).forEach(([key, h]) => {
    const z = zoneAt[key] || '?';
    const tot = h.reduce((s, v) => s + v, 0);
    if (tot < 6) return;
    const s = new Float64Array(BINS);
    for (let i = 0; i < BINS; i++) s[i] = 0.25 * h[(i + BINS - 1) % BINS] + 0.5 * h[i] + 0.25 * h[(i + 1) % BINS];
    let i1 = 0; for (let i = 1; i < BINS; i++) if (s[i] > s[i1]) i1 = i;
    let i2 = -1;
    for (let i = 0; i < BINS; i++) {
      const d = Math.abs(i - i1); const sep = Math.min(d, BINS - d) * (180 / BINS);
      if (sep < MIN_SEP) continue;
      if (i2 < 0 || s[i] > s[i2]) i2 = i;
    }
    const rec = byZone[z] || (byZone[z] = { one: 0, seps: [] });
    if (i2 < 0 || s[i2] / s[i1] < 0.25) { rec.one++; return; }
    const d = Math.abs(i1 - i2); rec.seps.push(Math.min(d, BINS - d) * (180 / BINS));
  });
  console.log(`view ${VIEW}`);
  Object.entries(byZone).sort().forEach(([z, rec]) => {
    const ss = rec.seps.slice().sort((a, b) => a - b);
    if (!ss.length) { console.log(`  ${z}: ${rec.one} single-family, 0 crossed`); return; }
    const q = (f) => ss[Math.min(ss.length - 1, Math.floor(f * ss.length))];
    const n80 = ss.filter((x) => x >= 80).length;
    const inband = ss.filter((x) => x >= 55 && x <= 75).length;
    console.log(`  ${z}: crossed n=${ss.length} (+${rec.one} single)  p10 ${q(0.1)}  med ${q(0.5)}  p90 ${q(0.9)}  max ${ss[ss.length - 1]}  >=80: ${n80} (${(100 * n80 / ss.length).toFixed(0)}%)  within 65+-10: ${(100 * inband / ss.length).toFixed(0)}%`);
  });
  rt.cleanup();
  process.exit(0);
})();
