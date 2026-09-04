/* Where is the object's darkest window, and what drew it?
 * Reads the rasterised grid written by r8lad.js and attributes the ink in the
 * top windows by path kind / regionClass. Fixture from render.js. */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const DIR = process.argv[2] || './r8a';
const VIEW = process.argv[3] || 'W-bigball-bands4';
const PATCH = 4;
const STEP = 0.25;

const inPoly = (x, y, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x)) inside = !inside;
  }
  return inside;
};
const hull = (pts) => {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = []; const up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
};

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;
  const density = require(path.resolve(DIR, 'density.json'));
  const g = density[VIEW];
  const np = R7.buildParams(V, VIEW);
  const paths = R7.buildPaths(V, VIEW);
  const scn = Sc.assembleScene(np, R7.BOUNDS);
  const obj = np.objects.find((o) => o.primitive === 'sphere');
  const r = obj.params.radius;
  const chart = V.Scene3D.SurfaceFill.chartFor('sphere', { sx: r, sy: r, sz: r });
  const t = obj.transform;
  const E = 1e-3; const N = Math.max(200, Math.round(200 * (r / 46)));
  const cell = {}; const pts = [];
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
      const camN = G3.rotatePoint(nn, scn.camera);
      if (camN.z <= 0) continue;
      const scr = scn.projectWorld(world); if (!scr) continue;
      const z = R.formZone(nn, world, { tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * r } });
      pts.push({ x: scr.x, y: scr.y, z, nz: camN.z });
    }
  }
  const sil = hull(pts);
  pts.forEach((q) => {
    const k = `${Math.floor(q.y / PATCH)},${Math.floor(q.x / PATCH)}`;
    const c = cell[k] || (cell[k] = { z: {}, nz: [] });
    c.z[q.z] = (c.z[q.z] || 0) + 1; c.nz.push(q.nz);
  });
  // ink by source
  const ink = {};
  paths.forEach((p) => {
    if (!p || p.length < 2) return;
    const m = p.meta || {}; const tt = m.sceneTarget || {};
    const src = `${m.kind || '?'}/${tt.regionClass || '-'}`;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const L = Math.hypot(b.x - a.x, b.y - a.y); if (!(L > 0)) continue;
      const n = Math.max(1, Math.ceil(L / STEP)); const dl = L / n;
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const key = `${Math.floor((a.y + (b.y - a.y) * u) / PATCH)},${Math.floor((a.x + (b.x - a.x) * u) / PATCH)}`;
        const c = ink[key] || (ink[key] = {});
        c[src] = (c[src] || 0) + dl;
      }
    }
  });
  const rows = [];
  Object.entries(cell).forEach(([k, c]) => {
    const [gy, gx] = k.split(',').map(Number);
    const row = g.g[gy]; if (!row || row[gx] == null) return;
    const x0 = gx * PATCH; const y0 = gy * PATCH;
    const corners = [[x0, y0], [x0 + PATCH, y0], [x0, y0 + PATCH], [x0 + PATCH, y0 + PATCH]];
    if (!corners.every(([X, Y]) => inPoly(X, Y, sil))) return;
    const tot = Object.values(c.z).reduce((s, v) => s + v, 0);
    if (tot < 20) return;
    const dom = Object.entries(c.z).sort((a, b) => b[1] - a[1])[0];
    if (dom[1] < 0.65 * tot) return;
    const nz = c.nz.reduce((s, v) => s + v, 0) / c.nz.length;
    rows.push({ k, gx, gy, D: row[gx], zone: dom[0], nz, ink: ink[k] || {} });
  });
  rows.sort((a, b) => b.D - a.D);
  console.log(`${VIEW}  (${DIR})  top windows by D`);
  rows.slice(0, 12).forEach((r0) => {
    const src = Object.entries(r0.ink).sort((a, b) => b[1] - a[1])
      .map(([s, v]) => `${s}:${v.toFixed(1)}`).join(' ');
    const tot = Object.values(r0.ink).reduce((s, v) => s + v, 0);
    console.log(`  D ${r0.D.toFixed(3)}  zone ${r0.zone}  nz ${r0.nz.toFixed(2)}  at (${(r0.gx * PATCH).toFixed(0)},${(r0.gy * PATCH).toFixed(0)})  ink ${tot.toFixed(1)}mm  ${src}`);
  });
  const WATCH = ['132,12', '120,0', '136,16', '176,36', '100,84', '96,84'];
  console.log('  -- watched windows (x,y in mm)');
  WATCH.forEach((w) => {
    const [wx, wy] = w.split(',').map(Number);
    const r0 = rows.find((q) => q.gx * PATCH === wx && q.gy * PATCH === wy);
    if (!r0) { console.log(`     (${w}) not scored`); return; }
    const tot = Object.values(r0.ink).reduce((s, v) => s + v, 0);
    console.log(`     (${w}) D ${r0.D.toFixed(3)}  zone ${r0.zone}  ink ${tot.toFixed(1)}mm`);
  });
  const byZone = {};
  rows.forEach((r0) => { (byZone[r0.zone] = byZone[r0.zone] || []).push(r0.D); });
  Object.entries(byZone).sort().forEach(([z, a]) => {
    a.sort((x, y) => y - x);
    console.log(`  zone ${z}: n=${a.length} max ${a[0].toFixed(3)}  #>0.56: ${a.filter((x) => x > 0.56).length}`);
  });
  rt.cleanup();
  process.exit(0);
})();
