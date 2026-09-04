/* Does the form shadow's crossed family run to the SILHOUETTE?
 *
 * §5.1 / O3: the form shadow's rulings should compress toward the limb and the
 * terminator should stay separable as a band. The Round 7 review's finding was
 * that F's crossed family "covers the whole left of the form out to the
 * contour", so the ball reads as one woven mesh from limb to terminator.
 *
 * Instrument: classify every 4 mm window by form zone AND by how close it sits
 * to the contour, using the camera-space normal's z (nz = 1 facing the camera,
 * 0 ON the silhouette) — the exact, projection-correct measure. Then read off
 * the DRAWING how many of those windows carry TWO families.
 *
 * Fixture from render.js; nothing restated.
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const R7 = require('./render.js');

const PATCH = 4; const BINS = 36; const MIN_SEP = 20;
const VIEWS = process.argv.slice(2).length ? process.argv.slice(2) : ['E-bands4', 'W-bigball-bands4'];

(async () => {
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;
  for (const VIEW of VIEWS) {
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
        const camN = G3.rotatePoint(nn, scn.camera);
        if (camN.z <= 0) continue;
        const scr = scn.projectWorld(world); if (!scr) continue;
        const z = R.formZone(nn, world, { tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * r } });
        const k = `${Math.floor(scr.y / PATCH)},${Math.floor(scr.x / PATCH)}`;
        const c = cell[k] || (cell[k] = { z: {}, nz: 0, n: 0 });
        c.z[z] = (c.z[z] || 0) + 1; c.nz += camN.z; c.n += 1;
      }
    }
    const info = {};
    Object.entries(cell).forEach(([k, c]) => {
      if (c.n < 20) return;
      const dom = Object.entries(c.z).sort((a, b) => b[1] - a[1])[0];
      if (dom[1] < 0.65 * c.n) return;
      info[k] = { zone: dom[0], nz: c.nz / c.n };
    });
    const hist = {};
    paths.forEach((p) => {
      const m = p.meta || {}; const tt = m.sceneTarget || {};
      if (m.kind !== 'sceneFill' || tt.objectId !== obj.id) return;
      for (let i = 1; i < p.length; i++) {
        const a = p[i - 1]; const b = p[i];
        const dx = b.x - a.x; const dy = b.y - a.y;
        const L = Math.hypot(dx, dy); if (!(L > 1e-6)) continue;
        const ang = ((((Math.atan2(dy, dx) * 180) / Math.PI) % 180) + 180) % 180;
        const key = `${Math.floor(((a.y + b.y) / 2) / PATCH)},${Math.floor(((a.x + b.x) / 2) / PATCH)}`;
        const c = hist[key] || (hist[key] = new Float64Array(BINS));
        const f = (ang / 180) * BINS;
        const k0 = Math.floor(f) % BINS; const fr = f - Math.floor(f);
        c[k0] += L * (1 - fr); c[(k0 + 1) % BINS] += L * fr;
      }
    });
    const bands = { 'limb nz<0.30': [], 'mid 0.30-0.60': [], 'face nz>0.60': [] };
    Object.entries(info).forEach(([k, v]) => {
      if (v.zone !== 'F') return;
      const h = hist[k];
      const two = (() => {
        if (!h) return false;
        if (h.reduce((s, x) => s + x, 0) < 6) return null;
        const s = new Float64Array(BINS);
        for (let i = 0; i < BINS; i++) s[i] = 0.25 * h[(i + BINS - 1) % BINS] + 0.5 * h[i] + 0.25 * h[(i + 1) % BINS];
        let i1 = 0; for (let i = 1; i < BINS; i++) if (s[i] > s[i1]) i1 = i;
        let i2 = -1;
        for (let i = 0; i < BINS; i++) {
          const d = Math.abs(i - i1);
          if (Math.min(d, BINS - d) * (180 / BINS) < MIN_SEP) continue;
          if (i2 < 0 || s[i] > s[i2]) i2 = i;
        }
        return i2 >= 0 && s[i2] / s[i1] >= 0.25;
      })();
      if (two === null) return;
      const band = v.nz < 0.30 ? 'limb nz<0.30' : (v.nz < 0.60 ? 'mid 0.30-0.60' : 'face nz>0.60');
      bands[band].push(two);
    });
    console.log(`\n${VIEW} — F-zone windows carrying TWO families, by distance from the contour`);
    Object.entries(bands).forEach(([b, arr]) => {
      if (!arr.length) { console.log(`   ${b.padEnd(16)} (no windows)`); return; }
      const n = arr.filter(Boolean).length;
      console.log(`   ${b.padEnd(16)} ${n}/${arr.length} = ${(100 * n / arr.length).toFixed(0)}% crossed`);
    });
  }
  rt.cleanup();
  process.exit(0);
})();
