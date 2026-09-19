const L = require('./lib'); const fs = require('fs'); const path = require('path');
const tag = process.argv[2]; const dens = (process.argv[3] || '50').split(',').map(Number);
const cells = (process.argv[4] || 'sphere/hatch,sphere/contour,torus/hatch,torus/contour,cone/hatch,cone/contour').split(',');
const rigs = (process.argv[5] || 'create,test').split(',');
const W = L.BOUNDS.penWidth;
function segd(px, py, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; let t = l2 < 1e-12 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - a.x - t * dx, py - a.y - t * dy); }
function contact(fills) {
  const cell = 2, g = new Map();
  fills.forEach((q, i) => { const seen = new Set(); q.forEach((p) => { const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`; if (!seen.has(k)) { seen.add(k); if (!g.has(k)) g.set(k, []); g.get(k).push(i); } }); });
  let tips = 0, tipc = 0; const touched = new Uint8Array(fills.length);
  fills.forEach((q, i) => {
    [q[0], q[q.length - 1]].forEach((t) => {
      tips++; let hit = false; const cx = Math.floor(t.x / cell), cy = Math.floor(t.y / cell); const cand = new Set();
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) (g.get(`${cx + dx},${cy + dy}`) || []).forEach((j) => cand.add(j));
      cand.delete(i);
      for (const j of cand) { const r = fills[j]; for (let k = 1; k < r.length; k++) if (segd(t.x, t.y, r[k - 1], r[k]) < W) { hit = true; touched[i] = 1; touched[j] = 1; break; } if (hit) break; }
      if (hit) tipc++;
    });
  });
  return { tipContact: +(tipc / tips).toFixed(4), markContact: +(touched.reduce((a, b) => a + b, 0) / fills.length).toFixed(4) };
}
(async () => {
  const root = L.ROOTS[tag]; const sfp = path.join(root, 'src/core/scene3d/surface-fill.js');
  let src = fs.readFileSync(sfp, 'utf8');
  const N = 'mkStat.tickSites.push(sv.I, sv.R, sv.P, drawnLen ? 1 : 0);';
  if (src.split(N).length !== 2) throw new Error('needle ' + (src.split(N).length - 1));
  src = src.replace(N, N + ' { const __g = (typeof window !== "undefined" ? window : globalThis); (__g.__T27 = __g.__T27 || []).push([sv.I, sv.R, sv.P, sv.L, drawnLen || 0]); }');
  const V = await L.makeRuntime(tag, { 'src/core/scene3d/surface-fill.js': src });
  const Wd = require(root + '/tests/helpers/scene3d-mktick-wedge.js');
  const win = V.Scene3D && V.__proto__; // unused
  const out = [];
  for (const d of dens) for (const rig of rigs) for (const c of cells) {
    const [primitive, mapper] = c.split('/');
    const G = (typeof window !== 'undefined') ? window : globalThis;
    // the runtime's globalThis is jsdom window: reach it via V's window
    const vw = V.__win || null;
    const params = L.buildParams(V, { primitive, mapper, rig, density: d });
    const hook = () => (vw ? vw.__T27 : null);
    if (vw) vw.__T27 = [];
    const paths = V.AlgorithmRegistry.scene3d.generate(params, null, null, L.BOUNDS);
    const stat = V.Scene3D.SurfaceFill.lastMarkStats;
    const sites = (vw && vw.__T27) || [];
    const fills = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill').map(L.pts).filter((q) => q.length > 1);
    const lens = fills.map(L.plen); const MIN = 2 * W;
    const wed = Wd.measureWedge({ tickField: stat.tickField, paths, penWidth: W });
    const o5 = Wd.lengthCarriesTone(stat.lenByThird, stat.cntByThird);
    // tone decomposition over drawn sites, I<0.9
    const ds = sites.filter((s) => s[4] > 0 && s[0] < 0.9 && s[3] > 0 && s[2] > 0);
    const y = ds.map((s) => Math.log(s[3] * W / (s[1] * s[2]))); const sp = ds.map((s) => Math.log(W / s[2]));
    const mean = (a) => a.reduce((x, z) => x + z, 0) / a.length;
    const my = mean(y), ms = mean(sp); let cv = 0, vy = 0; y.forEach((v, i) => { cv += (sp[i] - ms) * (v - my); vy += (v - my) ** 2; });
    const spacingShare = vy > 0 ? cv / vy : null;
    // binned delivered coverage vs I (area weighted, all sites incl. undrawn)
    const nb = 9, num = Array(nb).fill(0), den = Array(nb).fill(0);
    sites.forEach((s) => { if (s[0] >= 0.9) return; const b = Math.min(nb - 1, Math.floor(s[0] / 0.1)); num[b] += s[4] > 0 ? s[3] * W : 0; den[b] += s[1] * s[2]; });
    const cov = num.map((v, i) => (den[i] > 0 ? +(v / den[i]).toFixed(4) : null));
    const cc = cov.filter((v) => v != null); let nonMono = 0, maxStep = 0;
    for (let i = 1; i < cc.length; i++) { if (cc[i] > cc[i - 1] + 1e-9) nonMono++; maxStep = Math.max(maxStep, Math.abs(cc[i] - cc[i - 1])); }
    const range = cc.length ? cc[0] - cc[cc.length - 1] : 0;
    const pT = [0, 0, 0], nT = [0, 0, 0], lT = [0, 0, 0];
    sites.forEach((s) => { if (!(s[4] > 0)) return; const t = Math.min(2, Math.floor(Math.max(0, Math.min(1, s[0])) * 3)); pT[t] += s[2]; lT[t] += s[3] / s[1]; nT[t] += 1; });
    const mP = pT.map((v, i) => (nT[i] ? v / nT[i] : null)); const mL = lT.map((v, i) => (nT[i] ? v / nT[i] : null));
    const SP5 = (mP[0] && mP[2]) ? +(mP[2] / mP[0]).toFixed(3) : null;
    const th = (hiCut) => { const Ls = [0, 0, 0], Ps = [0, 0, 0], ns = [0, 0, 0]; const lo = 0; sites.forEach((s) => { if (!(s[4] > 0) || s[0] >= hiCut) return; const t = Math.min(2, Math.floor(Math.max(0, s[0]) / (hiCut / 3))); Ls[t] += s[4]; Ps[t] += s[2]; ns[t] += 1; }); const mL2 = Ls.map((v, i) => (ns[i] ? v / ns[i] : null)); const mP2 = Ps.map((v, i) => (ns[i] ? v / ns[i] : null)); return { O5: (mL2[0] && mL2[2]) ? +(mL2[0] / mL2[2]).toFixed(3) : null, O5mono: mL2[0] >= mL2[1] && mL2[1] >= mL2[2], SP5: (mP2[0] && mP2[2]) ? +(mP2[2] / mP2[0]).toFixed(3) : null, SP5mono: mP2[0] <= mP2[1] && mP2[1] <= mP2[2] }; };
    const popFull = th(1.0001); const popLt09 = th(0.9);
    const SP5mono = mP[0] != null && mP[1] != null && mP[2] != null && mP[0] <= mP[1] && mP[1] <= mP[2];
    // GUTTER / LIMB metric: march outward from every tick tip along its own end direction
    const rast = Wd.rasterizeField(stat.tickField, 6);
    const fillPaths = paths.filter((p) => p.meta && p.meta.kind === 'sceneFill');
    const edgePaths = paths.filter((p) => !(p.meta && p.meta.kind === 'sceneFill'));
    const inkF = Wd.rasterizeInk(rast, fillPaths, W); const inkE = Wd.rasterizeInk(rast, edgePaths, W);
    const RP = stat.tickField.rowPitch; const PMT = 1.6 * W; const at = (x, y) => { const i = rast.px(x), j = rast.py(y); return (i < 0 || j < 0 || i >= rast.W || j >= rast.H) ? -1 : j * rast.W + i; };
    const gut = { dm: [], lim: [] };
    fills.forEach((q) => {
      [[q[0], q[1]], [q[q.length - 1], q[q.length - 2]]].forEach(([t, t2]) => {
        const dx = t.x - t2.x, dy = t.y - t2.y, dl = Math.hypot(dx, dy); if (dl < 1e-9) return;
        const ux = dx / dl, uy = dy / dl; const k0 = at(t.x, t.y); if (k0 < 0) return; const Iv = rast.tone[k0]; if (!(Iv < 2 / 3)) return;
        let s = W; let hit = null;
        for (; s <= 1.5 * RP; s += 0.05) { const k = at(t.x + ux * s, t.y + uy * s); if (k < 0 || !rast.surf[k]) { hit = null; break; } if (inkE[k]) { hit = 'edge'; break; } if (inkF[k]) { hit = 'ink'; break; } }
        const run = s - W / 2; if (hit === 'ink') gut.dm.push(run); else if (hit === 'edge') gut.lim.push(run);
      });
    });
    const q95 = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return +b[Math.floor(0.95 * (b.length - 1))].toFixed(3); };
    const gutter = { tipsDM: gut.dm.length, bareSeamFrac: gut.dm.length ? +(gut.dm.filter((v) => v > 2 * PMT).length / gut.dm.length).toFixed(4) : null,
      bareSeamP95RP: gut.dm.length ? +(q95(gut.dm) / RP).toFixed(3) : null, limbTips: gut.lim.length,
      limbGapFrac: gut.lim.length ? +(gut.lim.filter((v) => v > 2 * PMT).length / gut.lim.length).toFixed(4) : null, limbGapP95RP: gut.lim.length ? +(q95(gut.lim) / RP).toFixed(3) : null };
    const r = { tag, d, rig, cell: c, ...gutter, paths: paths.length, fills: fills.length, inkMm: +lens.reduce((a, b) => a + b, 0).toFixed(1),
      siteCoverage: +(Wd.siteCoverage(stat.tickSites) || 0).toFixed(4), tooShort: stat.tooShort, subMin: lens.filter((v) => v < MIN - 1e-6).length,
      wedge25: +wed.wedge25.toFixed(5), holeMax: +(wed.holeMax || 0).toFixed(3), O5: o5.ratio && +o5.ratio.toFixed(4), O5mono: o5.monotone,
      spacingShare: spacingShare && +spacingShare.toFixed(3), SP5, SP5mono, popFull, popLt09, LoverR: mL.map((v) => v && +v.toFixed(3)), meanP: mP.map((v) => v && +v.toFixed(3)), covByI: cov, nonMono, maxStepFrac: range > 0 ? +(maxStep / range).toFixed(3) : null,
      ...contact(fills), md5: L.md5(paths).slice(0, 10) };
    out.push(r); console.log(JSON.stringify(r));
  }
  fs.writeFileSync(`${L.S}/metrics_${tag}_${dens.join('-')}_${rigs.join('-')}.json`, JSON.stringify(out));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
