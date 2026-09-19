const SF = '/private/tmp/claude-501/scratch-T25/tests/helpers/';
const wedgeH = require(SF + 'scene3d-mktick-wedge.js');
const bandH = require(SF + 'scene3d-mktick-band.js');
const { pathPts, plen } = require('/private/tmp/claude-501/scratch-T25/_t25/lib.js');

const pct = (arr, p) => { if (!arr.length) return null; const s = arr.slice().sort((a,b)=>a-b); const i = p*(s.length-1); const lo=Math.floor(i), hi=Math.ceil(i); return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(i-lo); };
const mean = (a) => (a.length ? a.reduce((x,y)=>x+y,0)/a.length : null);

/* Tick-level geometry from instrumented mark records. */
function tickMetrics(marks, rowPitch, penWidth) {
  const ticks = marks.filter((m) => m.shape === 'tick');
  if (!ticks.length) return null;
  const rec = ticks.map((m) => {
    const pts = m.pts;
    const Ld = plen(pts);
    const cx = (pts[0].x + pts[pts.length-1].x)/2, cy = (pts[0].y + pts[pts.length-1].y)/2;
    const dx = pts[pts.length-1].x - pts[0].x, dy = pts[pts.length-1].y - pts[0].y;
    const dl = Math.hypot(dx,dy) || 1;
    return { ...m, Ld, cx, cy, ux: dx/dl, uy: dy/dl, ratio: Ld/m.R, cOffN: (m.cOff||0)/m.R };
  });
  // seam overlap (analytic, in the chart's across-row coordinate): a tick of
  // effective length Le centred cOff off its row line crosses its own band
  // boundary (+-R/2) by max(0, |cOff| + Le/2 - R/2).
  // Seam overlap, measured from the mark's OWN LOCAL across-row extent [v0,v1]
  // against the band it owns (R / nPoly — the sub-band when a mark is re-tiled).
  const ov = rec.map((t) => {
    if (t.v0 == null || t.v1 == null) { const Le = Math.min(t.L, t.Ld); return Math.max(0, Math.abs(t.cOff || 0) + Le/2 - t.R/2) / t.R; }
    const band = t.band || (t.R / Math.max(1, t.nPoly || 1));
    const half = band / 2;
    const c = (t.v0 + t.v1) / 2;
    const n = t.band ? Math.max(1, Math.round(t.R / t.band)) : Math.max(1, t.nPoly || 1);
    const j = Math.round(c / band + (n - 1) / 2);
    const centre = (j - (n - 1) / 2) * band;
    const lo = Math.min(t.v0, t.v1) - centre;
    const hi = Math.max(t.v0, t.v1) - centre;
    return Math.max(0, Math.max(-lo, hi) - half) / band;
  });
  // gradual-shortening: nearest neighbour in a DIFFERENT row, |dLd|/R
  const RP = rowPitch || mean(rec.map((t)=>t.R));
  const cell = 1.6 * RP;
  const grid = new Map();
  rec.forEach((t, i) => { const k = `${Math.floor(t.cx/cell)},${Math.floor(t.cy/cell)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  const stepsAcross = []; const stepsAlong = [];
  rec.forEach((t, i) => {
    const gx = Math.floor(t.cx/cell), gy = Math.floor(t.cy/cell);
    let bestA = null, bestAd = Infinity, bestL = null, bestLd = Infinity;
    for (let j=-1;j<=1;j++) for (let k=-1;k<=1;k++) {
      const arr = grid.get(`${gx+j},${gy+k}`); if (!arr) continue;
      for (const n of arr) { if (n===i) continue; const o = rec[n];
        const d = Math.hypot(o.cx-t.cx, o.cy-t.cy); if (d > 2.2*RP) continue;
        if (o.lineIndex !== t.lineIndex) { if (d < bestAd) { bestAd = d; bestA = o; } }
        else if (d < bestLd) { bestLd = d; bestL = o; }
      }
    }
    if (bestA) stepsAcross.push(Math.abs(bestA.Ld - t.Ld)/RP);
    if (bestL) stepsAlong.push(Math.abs(bestL.Ld - t.Ld)/RP);
  });
  // length-carries-tone fit: ratio vs (1-I)
  const xs = rec.map((t)=>1-t.I), ys = rec.map((t)=>t.ratio);
  const mx = mean(xs), my = mean(ys);
  let sxy=0, sxx=0, syy=0;
  for (let i=0;i<xs.length;i+=1){ sxy+=(xs[i]-mx)*(ys[i]-my); sxx+=(xs[i]-mx)**2; syy+=(ys[i]-my)**2; }
  const r2 = (sxx>0 && syy>0) ? (sxy*sxy)/(sxx*syy) : null;
  // cross-row END CONTACT: a tick tip within `tol` of a tip of a tick in a DIFFERENT row.
  const tol = Math.max(1.0 * (penWidth || 0.3), 0.06 * RP);
  const eg = new Map();
  const ecell = Math.max(tol * 2, 0.2 * RP);
  const tips = [];
  rec.forEach((t, i) => { tips.push({ i, row: t.lineIndex, x: t.pts[0].x, y: t.pts[0].y }); tips.push({ i, row: t.lineIndex, x: t.pts[t.pts.length-1].x, y: t.pts[t.pts.length-1].y }); });
  tips.forEach((tp, n) => { const k = `${Math.floor(tp.x/ecell)},${Math.floor(tp.y/ecell)}`; if (!eg.has(k)) eg.set(k, []); eg.get(k).push(n); });
  let contacts = 0; const contactTicks = new Set();
  tips.forEach((tp, n) => {
    const gx = Math.floor(tp.x/ecell), gy = Math.floor(tp.y/ecell);
    for (let j=-1;j<=1;j++) for (let k=-1;k<=1;k++) { const arr = eg.get(`${gx+j},${gy+k}`); if (!arr) continue;
      for (const o of arr) { if (o <= n) continue; const q = tips[o]; if (q.row === tp.row) continue;
        if (Math.hypot(q.x-tp.x, q.y-tp.y) <= tol) { contacts += 1; contactTicks.add(tp.i); contactTicks.add(q.i); } } }
  });
  // local length ROUGHNESS: |Ld - median(neighbour Ld within 2*RP)| / RP
  const rough = [];
  rec.forEach((t, i) => {
    const gx = Math.floor(t.cx/cell), gy = Math.floor(t.cy/cell); const ns = [];
    for (let j=-2;j<=2;j++) for (let k=-2;k<=2;k++) { const arr = grid.get(`${gx+j},${gy+k}`); if (!arr) continue;
      for (const n of arr) { if (n===i) continue; const o = rec[n]; if (Math.hypot(o.cx-t.cx,o.cy-t.cy) <= 2*RP) ns.push(o.Ld); } }
    if (ns.length >= 4) { ns.sort((a,b)=>a-b); const med = ns[Math.floor(ns.length/2)]; rough.push(Math.abs(t.Ld-med)/RP); }
  });
  const xs2 = rec.map((t)=>1-t.I), ys2 = rec.map((t)=>t.Ld/RP);
  const mx2 = mean(xs2), my2 = mean(ys2); let a2=0,b2=0,c2=0;
  for (let i=0;i<xs2.length;i+=1){ a2+=(xs2[i]-mx2)*(ys2[i]-my2); b2+=(xs2[i]-mx2)**2; c2+=(ys2[i]-my2)**2; }
  const r2n = (b2>0&&c2>0)?(a2*a2)/(b2*c2):null;
  const cs = rec.map((t)=>Math.abs(t.cOffN));
  const thirds = [[],[],[]];
  rec.forEach((t)=>{ thirds[Math.min(2, Math.floor(Math.max(0,Math.min(1,t.I))*3))].push(t.Ld); });
  const tm = thirds.map((a)=>mean(a));
  const o5t25 = (tm[0]!=null && tm[2]!=null && tm[2]>0) ? tm[0]/tm[2] : null;
  return {
    nTicks: rec.length,
    meanLenRatio: mean(rec.map((t)=>t.ratio)),
    fragFrac035: rec.filter((t)=>t.ratio < 0.35).length / rec.length,
    anchorAbsMean: mean(cs), anchorP95: pct(cs, 0.95), anchorMax: Math.max(...cs),
    seamOvFrac: ov.filter((v)=>v>1e-9).length / ov.length,
    seamOvMean: mean(ov), seamOvP95: pct(ov, 0.95), seamOvMax: Math.max(...ov),
    stepAcrossP95: pct(stepsAcross, 0.95), stepAcrossMax: stepsAcross.length?Math.max(...stepsAcross):null,
    stepAcrossMean: mean(stepsAcross), nAcrossPairs: stepsAcross.length,
    stepAlongP95: pct(stepsAlong, 0.95), stepAlongMean: mean(stepsAlong),
    lenToneR2: r2,
    rowPitchUsed: RP,
    endContacts: contacts, endContactFrac: contactTicks.size / rec.length, endContactTol: tol,
    roughP95: pct(rough, 0.95), roughMean: mean(rough), roughMax: rough.length?Math.max(...rough):null,
    lenToneR2n: r2n,
    O5t25: o5t25, O5t25means: tm,
    O5t25monotone: (tm[0]!=null&&tm[1]!=null&&tm[2]!=null&&tm[0]>=tm[1]&&tm[1]>=tm[2]),
  };
}

/* Purity: which emitted paths are NOT mkTick marks. */
function purity(paths, marks, runs) {
  const key = (pts) => pts.map((q)=>`${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(';');
  const markKeys = new Set(marks.map((m)=>key(m.pts)));
  const markEnds = new Set(marks.map((m)=>`${m.pts[0].x.toFixed(2)},${m.pts[0].y.toFixed(2)}|${m.pts[m.pts.length-1].x.toFixed(2)},${m.pts[m.pts.length-1].y.toFixed(2)}`));
  const runBySrc = new Map(); runs.forEach((r)=>runBySrc.set(key(r.pts), r.src));
  const classes = {};
  const nonBand = [];
  paths.forEach((p, i) => {
    const pts = pathPts(p);
    const k = key(pts);
    const isMark = markKeys.has(k) || markEnds.has(`${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}|${pts[pts.length-1].x.toFixed(2)},${pts[pts.length-1].y.toFixed(2)}`);
    const kind = (p.meta && p.meta.kind) || '?';
    const emit = (p.meta && p.meta.t25emit) || '?';
    const sfsrc = runBySrc.get(k) || null;
    const cls = isMark ? 'mkTick mark' : `${kind} ${sfsrc ? '(surface-fill ' + sfsrc + ')' : '(non-fill pass ' + emit + ')'}`;
    if (!classes[cls]) classes[cls] = { count: 0, mm: 0 };
    classes[cls].count += 1; classes[cls].mm += plen(pts);
    if (!isMark) nonBand.push({ i, cls, len: plen(pts), n: pts.length });
  });
  Object.keys(classes).forEach((c)=>{ classes[c].mm = Math.round(classes[c].mm*10)/10; });
  return { classes, nonBandCount: nonBand.length, nonBandMm: Math.round(nonBand.reduce((a,b)=>a+b.len,0)*10)/10, nonBand };
}

function allMetrics({ paths, stat, runs }, penWidth = 0.3) {
  const out = { pathCount: paths.length, inkMm: Math.round(paths.reduce((a,p)=>a+plen(pathPts(p)),0)*10)/10 };
  if (stat && stat.tickField && stat.tickField.rowPitch) {
    const w = wedgeH.measureWedge({ tickField: stat.tickField, paths, penWidth });
    out.rowPitch = Math.round(stat.tickField.rowPitch*1000)/1000;
    out.wedge25 = w.wedge25; out.holeMax = w.holeMax; out.bareFrac = w.bareFrac;
    const b = bandH.measure(paths, { rowPitch: stat.tickField.rowPitch, penMm: penWidth });
    out.bandC = b ? b.bandC : null; out.bandPeriodMm = b ? b.periodMm : null;
  }
  if (stat) {
    out.siteCoverage = wedgeH.siteCoverage(stat.tickSites || []);
    if (stat.lenByThird && stat.cntByThird) {
      const o5 = wedgeH.lengthCarriesTone(stat.lenByThird, stat.cntByThird);
      out.O5ratio = o5.ratio; out.O5monotone = o5.monotone; out.O5means = o5.meanByThird;
    } else { out.O5ratio = null; out.O5monotone = null; out.O5means = null; out.O5note = 'lenByThird absent at this sha (pre-T2-2 chan:count mkTick)'; }
    out.marks = stat.marks; out.trunc = stat.trunc; out.tooShort = stat.tooShort; out.dupStub = stat.dupStub;
    out.tick = tickMetrics(stat.t25marks || [], (stat.tickField && stat.tickField.rowPitch) || null, penWidth);
  }
  out.purity = purity(paths, (stat && stat.t25marks) || [], runs || []);
  return out;
}
module.exports = { allMetrics, tickMetrics, purity, pct, mean };
