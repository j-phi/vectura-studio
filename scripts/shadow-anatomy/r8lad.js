/* ROUND 8 fast inner loop — the four-fixture ladder + a real O17 instrument.
 *
 * The fixture is NEVER restated: every scene comes from render.js via
 * buildParams/buildPaths, exactly as m4.js does. This script only shortens the
 * loop (4 views instead of 190) so the cross-frame fix and the F rebuild can be
 * iterated; the numbers it prints reproduce m4.js's on the same views.
 *
 * NEW — the O17 CROSS-ANGLE instrument. O17/§2.3 forbid the two families
 * crossing at ~90 deg ON SCREEN. Nothing in the harness measured that; the
 * breach had to be caught by eye in `S-litpole`. This reads the SCREEN angle off
 * the DRAWING (a length-weighted orientation histogram per 4 mm window, mod
 * 180), finds the two dominant directions in each window, and reports the
 * distribution of their separation. It never asks the renderer what angle it
 * intended.
 *
 * Run: node r8lad.js <outDir> [viewA viewB ...]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');   // repo root, wherever this worktree lives
const { loadVecturaRuntime } = require(path.join(ROOT, 'tests/helpers/load-vectura-runtime'));
const { chromium } = require(path.join(ROOT, 'node_modules/playwright'));
const R7 = require('./render.js');

const OUT = process.argv[2] || path.join(__dirname, 'r8lad');
const VIEWS = process.argv.slice(3).length ? process.argv.slice(3)
  : ['E-bands4', 'V-E-bands4-sun45', 'W-bigball-bands4', 'W-bigball-sun45'];
const PATCH = 4;
const PX = R7.PX;
const ZOOM = 2;

// ── shared helpers (identical to m4.js) ─────────────────────────────────────
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
  const lower = []; const upper = [];
  for (const q of p) { while (lower.length >= 2 && cr(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cr(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
};
const stats = (a) => {
  if (!a || !a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))];
  return { n: s.length, mean: s.reduce((t, v) => t + v, 0) / s.length, p50: q(0.5), p90: q(0.9), max: s[s.length - 1] };
};
const fmt = (st) => (st ? `n=${String(st.n).padStart(4)}  mean ${st.mean.toFixed(3)}  p50 ${st.p50.toFixed(3)}  p90 ${st.p90.toFixed(3)}  max ${st.max.toFixed(3)}` : '(none)');

const GRID_FN = async ({ W, H, Z, PXX, PATCH_MM }) => {
  const svgEl = document.querySelector('svg');
  const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * Z); c.height = Math.ceil(H * Z);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const step = PATCH_MM * PXX * Z;
  const gx = Math.floor(c.width / step); const gy = Math.floor(c.height / step);
  const g = [];
  for (let j = 0; j < gy; j++) {
    const row = [];
    for (let i = 0; i < gx; i++) {
      let dark = 0; let n = 0;
      for (let y = Math.floor(j * step); y < Math.floor((j + 1) * step); y++) {
        for (let x = Math.floor(i * step); x < Math.floor((i + 1) * step); x++) {
          const k = (y * c.width + x) * 4;
          n++; if (data[k] < 160) dark++;
        }
      }
      row.push(Math.round((dark / Math.max(1, n)) * 1000) / 1000);
    }
    g.push(row);
  }
  URL.revokeObjectURL(url);
  return { gx, gy, patchMM: PATCH_MM, g };
};

// ── O17 — the SCREEN crossing angle, read off the drawing ───────────────────
// Per 4 mm window: a length-weighted orientation histogram of every drawn
// segment (angle mod 180, 36 bins of 5 deg, smoothed). The two dominant peaks
// at least MIN_SEP apart are the two families; their separation is the number
// O17 is about. Windows with only one family present are reported separately —
// a window with one direction is not a plaid and must not be scored as a wide
// crossing.
const BINS = 36;
const MIN_SEP = 20;
const crossAngles = (paths, keep, zoneOf) => {
  const cells = {};
  paths.forEach((p) => {
    if (!p || p.length < 2 || !keep(p)) return;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const L = Math.hypot(dx, dy);
      if (!(L > 1e-6)) return;
      let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      ang = ((ang % 180) + 180) % 180;
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      const key = `${Math.floor(my / PATCH)},${Math.floor(mx / PATCH)}`;
      const c = cells[key] || (cells[key] = new Float64Array(BINS));
      const f = (ang / 180) * BINS;
      const k0 = Math.floor(f) % BINS; const fr = f - Math.floor(f);
      c[k0] += L * (1 - fr); c[(k0 + 1) % BINS] += L * fr;
    }
  });
  const out = [];
  Object.entries(cells).forEach(([key, h]) => {
    const [gy, gx] = key.split(',').map(Number);
    const z = zoneOf ? zoneOf(gy, gx) : 'any';
    if (!z) return;
    const tot = h.reduce((s, v) => s + v, 0);
    if (tot < 6) return; // mm of ink — below this a window is not two families
    // circular smoothing (mod 180)
    const s = new Float64Array(BINS);
    for (let i = 0; i < BINS; i++) s[i] = 0.25 * h[(i + BINS - 1) % BINS] + 0.5 * h[i] + 0.25 * h[(i + 1) % BINS];
    let i1 = 0;
    for (let i = 1; i < BINS; i++) if (s[i] > s[i1]) i1 = i;
    let i2 = -1;
    for (let i = 0; i < BINS; i++) {
      const d = Math.abs(i - i1); const sep = Math.min(d, BINS - d) * (180 / BINS);
      if (sep < MIN_SEP) continue;
      if (i2 < 0 || s[i] > s[i2]) i2 = i;
    }
    if (i2 < 0) { out.push({ zone: z, sep: null, ratio: 0 }); return; }
    const d = Math.abs(i1 - i2); const sep = Math.min(d, BINS - d) * (180 / BINS);
    out.push({ zone: z, sep, ratio: s[i2] / Math.max(1e-9, s[i1]) });
  });
  return out;
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const rt = await loadVecturaRuntime();
  const V = rt.window.Vectura;
  const R = V.Scene3D.Regions; const Sc = V.Scene3D.Scene; const G3 = V.Geometry3D;

  const built = {};
  for (const id of VIEWS) {
    const np = R7.buildParams(V, id);
    const paths = R7.buildPaths(V, id);
    built[id] = { np, paths };
    fs.writeFileSync(path.join(OUT, `${id}.svg`), R7.toSvg(paths, R7.BOUNDS), 'utf8');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const density = {};
  for (const id of VIEWS) {
    const svg = fs.readFileSync(path.join(OUT, `${id}.svg`), 'utf8');
    const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
    const W = Number(m[1]); const H = Number(m[2]);
    await page.setViewportSize({ width: Math.ceil(W * ZOOM), height: Math.ceil(H * ZOOM) });
    await page.setContent(`<body style="margin:0;background:#fff">${svg.replace('<svg ', `<svg style="width:${W * ZOOM}px;height:${H * ZOOM}px" `)}</body>`);
    await page.screenshot({ path: path.join(OUT, `${id}.png`) });
    density[id] = await page.evaluate(GRID_FN, { W, H, Z: ZOOM, PXX: PX, PATCH_MM: PATCH });
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'density.json'), `${JSON.stringify(density)}\n`, 'utf8');

  const rows = [];
  for (const id of VIEWS) {
    const { np, paths } = built[id];
    const g = density[id];
    const scn = Sc.assembleScene(np, R7.BOUNDS);
    const obj = np.objects.find((o) => o.primitive === 'sphere');
    if (!obj) continue;
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
        if (G3.rotatePoint(nn, scn.camera).z <= 0) continue;
        const scr = scn.projectWorld(world); if (!scr) continue;
        const z = R.formZone(nn, world, { tone: np.tone, lights: np.lights, ground: { y0: 0, height: 2 * r } });
        pts.push({ x: scr.x, y: scr.y, z });
      }
    }
    const sil = hull(pts);
    pts.forEach((q) => {
      const k = `${Math.floor(q.y / PATCH)},${Math.floor(q.x / PATCH)}`;
      (cell[k] = cell[k] || {})[q.z] = (cell[k][q.z] || 0) + 1;
    });
    const acc = {}; const zoneAt = {};
    Object.entries(cell).forEach(([k, h]) => {
      const [gy, gx] = k.split(',').map(Number);
      const row = g.g[gy]; if (!row || row[gx] == null) return;
      const x0 = gx * PATCH; const y0 = gy * PATCH;
      const corners = [[x0, y0], [x0 + PATCH, y0], [x0, y0 + PATCH], [x0 + PATCH, y0 + PATCH]];
      if (!corners.every(([X, Y]) => inPoly(X, Y, sil))) return;
      const tot = Object.values(h).reduce((s, v) => s + v, 0);
      if (tot < 20) return;
      const dom = Object.entries(h).sort((a, b) => b[1] - a[1])[0];
      if (dom[1] < 0.65 * tot) return;
      (acc[dom[0]] = acc[dom[0]] || []).push(row[gx]);
      zoneAt[k] = dom[0];
    });
    const m = {};
    console.log(`\n== ${id}`);
    ['H', 'L', 'M', 'T', 'F', 'R'].forEach((z) => { const st = stats(acc[z]); if (st) { m[z] = st; console.log(`   ${z}  ${fmt(st)}`); } });
    const rat = (a, b) => (m[a] && m[b] ? m[a].mean / m[b].mean : NaN);
    const TF = rat('T', 'F'); const FM = rat('F', 'M'); const RF = rat('R', 'F');
    const DL = m.L ? m.L.mean : NaN;
    const objMax = Math.max(...Object.values(acc).flat());
    console.log(`   T/F ${TF.toFixed(3)} (spec >=1.25)   F/M ${FM.toFixed(3)} (target 1.45-1.70)   R/F ${RF.toFixed(3)} (<=0.60)   D(L) ${DL.toFixed(3)} (spec >=0.10)   max(object) ${objMax.toFixed(3)} (<=0.56)`);
    rows.push({ id, TF, FM, RF, DL, objMax, T: m.T && m.T.mean, F: m.F && m.F.mean, M: m.M && m.M.mean, R: m.R && m.R.mean });

    // O17 — screen crossing angle, from the drawing, in the T and F zones.
    const objId = obj.id;
    const keep = (p) => {
      const mm = p.meta || {}; const tt = mm.sceneTarget || {};
      return mm.kind === 'sceneFill' && tt.objectId === objId;
    };
    const ca = crossAngles(paths, keep, (gy, gx) => {
      const z = zoneAt[`${gy},${gx}`];
      return (z === 'T' || z === 'F') ? z : null;
    });
    const seps = ca.filter((c) => c.sep != null && c.ratio >= 0.25).map((c) => c.sep);
    const single = ca.length - seps.length;
    if (seps.length) {
      const ss = seps.slice().sort((a, b) => a - b);
      const q = (f) => ss[Math.min(ss.length - 1, Math.floor(f * ss.length))];
      const n80 = ss.filter((x) => x >= 80).length;
      console.log(`   O17 screen crossing angle over T/F windows: n=${ss.length} (+${single} single-family)  `
        + `p10 ${q(0.1).toFixed(0)}  median ${q(0.5).toFixed(0)}  p90 ${q(0.9).toFixed(0)}  max ${ss[ss.length - 1].toFixed(0)}  `
        + `>=80deg: ${n80} (${(100 * n80 / ss.length).toFixed(0)}%)`);
    } else {
      console.log(`   O17 screen crossing angle: no two-family windows (${single} single-family)`);
    }
  }
  console.log('\n== four-fixture summary');
  console.log('   fixture                    T      F      M      R     T/F    F/M    R/F   D(L)');
  rows.forEach((r) => console.log(`   ${r.id.padEnd(22)} ${(r.T || 0).toFixed(3)}  ${(r.F || 0).toFixed(3)}  ${(r.M || 0).toFixed(3)}  ${(r.R || 0).toFixed(3)}  ${r.TF.toFixed(3)}  ${r.FM.toFixed(3)}  ${r.RF.toFixed(3)}  ${r.DL.toFixed(3)}`));
  const fin = (v) => Number.isFinite(v);
  const tf = rows.map((r) => r.TF).filter(fin); const fm = rows.map((r) => r.FM).filter(fin); const dl = rows.map((r) => r.DL).filter(fin);
  console.log(`   T/F range ${Math.min(...tf).toFixed(3)}–${Math.max(...tf).toFixed(3)}   F/M range ${Math.min(...fm).toFixed(3)}–${Math.max(...fm).toFixed(3)}   D(L) range ${Math.min(...dl).toFixed(3)}–${Math.max(...dl).toFixed(3)}`);
  rt.cleanup();
  process.exit(0);
})();
