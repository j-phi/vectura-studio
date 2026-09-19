/* T2-6 oracles A1/A2/A3 + the inherited bars. READ-ONLY. */
const SF = '/private/tmp/claude-501/scratch-T26/tests/helpers/';
const wedgeH = require(SF + 'scene3d-mktick-wedge.js');
const bandH = require(SF + 'scene3d-mktick-band.js');
const { pathPts, plen } = require('/private/tmp/claude-501/scratch-T26/_t26/lib.js');

const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x,y)=>x-y); const i = p*(s.length-1); const lo=Math.floor(i), hi=Math.ceil(i); return lo===hi?s[lo]:s[lo]+(s[hi]-s[lo])*(i-lo); };
const mean = (a) => (a.length ? a.reduce((x,y)=>x+y,0)/a.length : null);
const med = (a) => pct(a, 0.5);
const HI = 0.90;                     // highlight threshold (T2-3's own)

/* Group emitted sub-tick records into SITES (one solve = one lattice cell). */
function sites(marks, RP) {
  const byKey = new Map();
  marks.filter((m) => m.shape === 'tick').forEach((m) => {
    const k = `${m.lineIndex}|${m.k}|${m.a.toFixed(5)}`;
    if (!byKey.has(k)) byKey.set(k, { row: m.lineIndex, k: m.k, a: m.a, I: m.I, R: m.R, P: m.P, L: m.L, nPoly: m.nPoly, subs: [] });
    const pts = m.pts;
    const Ld = plen(pts);
    const dx = pts[pts.length-1].x - pts[0].x, dy = pts[pts.length-1].y - pts[0].y, dl = Math.hypot(dx,dy) || 1;
    byKey.get(k).subs.push({ Ld, v0: m.v0, v1: m.v1, cx: (pts[0].x+pts[pts.length-1].x)/2, cy: (pts[0].y+pts[pts.length-1].y)/2, vx: dx/dl, vy: dy/dl });
  });
  const out = [...byKey.values()];
  out.forEach((s) => {
    s.Tlen = s.subs.reduce((a,b)=>a+b.Ld, 0);
    s.cx = mean(s.subs.map((q)=>q.cx)); s.cy = mean(s.subs.map((q)=>q.cy));
    // band coverage in the across-row coordinate v, band = [-R/2, +R/2]
    const iv = s.subs.filter((q)=>q.v0!=null && q.v1!=null)
      .map((q)=>[Math.min(q.v0,q.v1), Math.max(q.v0,q.v1)]).sort((a,b)=>a[0]-b[0]);
    const lo = -s.R/2, hi = s.R/2;
    let cov = 0, bareMax = 0, cur = lo;
    const bares = [];
    iv.forEach((p) => {
      const a0 = Math.max(lo, p[0]), a1 = Math.min(hi, p[1]);
      if (a0 > cur) { bares.push(a0-cur); cur = a0; }
      if (a1 > cur) { cov += a1-cur; cur = a1; }
    });
    if (hi > cur) bares.push(hi-cur);
    bareMax = bares.length ? Math.max(...bares) : 0;
    s.cov = cov; s.bareMax = bareMax; s.bareArea = Math.max(0, s.R - cov);
    s.bareMaxN = bareMax / s.R; s.bareMaxRP = bareMax / RP;
    s.covFrac = cov / s.R;
  });
  return out;
}

/* A1  — graded-gap-fill share: the fraction of the non-highlight band-gap area
 *       (bare area inside a band, weighted by the site's own along-row period)
 *       that sits inside a GRADED RUN: >=2 consecutive sites along one row whose
 *       total tick length is monotone non-increasing toward the brighter side
 *       AND whose neighbour ratio never drops below STEP_MIN (0.5).
 * A1b — bareRunP95 / bareRunMax: the actual size of the black gap, in row
 *       pitches. The bar that MOVES when the gaps fill.
 * A2  — fragment count: emitted sub-ticks under 0.5 RP outside the highlight
 *       (A2n) and under 0.5x their own local neighbour median (A2loc).
 * A3  — within-band length-vs-tone R^2: R^2 of Ld/RP on (1-I) computed PER ROW,
 *       then the count-weighted mean over rows with >= 8 ticks.  */
function oraclesA(marks, RP, penWidth) {
  const S = sites(marks, RP);
  if (!S.length) return null;
  const STEP_MIN = 0.5;
  const shaded = S.filter((s) => s.I < HI);
  // ---- A1 (WITHIN-BAND: the gap region occupied by a graded comb) ----------
  const rows = new Map();
  S.forEach((s) => { if (!rows.has(s.row)) rows.set(s.row, []); rows.get(s.row).push(s); });
  // across-row tone gradient per site, from the nearest site in ANOTHER row
  const cellG = 1.6 * RP; const gG = new Map();
  S.forEach((s, i) => { const k = `${Math.floor(s.cx/cellG)},${Math.floor(s.cy/cellG)}`; if (!gG.has(k)) gG.set(k, []); gG.get(k).push(i); });
  S.forEach((s, i) => {
    const vx = s.subs[0].vx, vy = s.subs[0].vy;
    const gx = Math.floor(s.cx/cellG), gy = Math.floor(s.cy/cellG);
    let best = null, bd = Infinity;
    for (let j=-1;j<=1;j++) for (let k=-1;k<=1;k++) { const arr = gG.get(`${gx+j},${gy+k}`); if (!arr) continue;
      for (const n of arr) { if (n===i) continue; const o = S[n]; if (o.row === s.row) continue;
        const d = Math.hypot(o.cx-s.cx, o.cy-s.cy); if (d < bd && d <= 2.0*RP) { bd = d; best = o; } } }
    if (best) {
      const dv = (best.cx-s.cx)*vx + (best.cy-s.cy)*vy;
      s.gradSgn = Math.abs(dv) > 1e-6 ? Math.sign((best.I - s.I) / dv) : 0;   // +1 => +v is BRIGHTER
    } else s.gradSgn = 0;
  });
  let gapTot = 0, gapGraded = 0, gapGradedDir = 0, nComb = 0, nCombGraded = 0;
  shaded.forEach((s) => {
    const wgt = s.bareArea * s.P; gapTot += wgt;
    if (s.subs.length < 2) return;                    // a single tick is no comb
    nComb += 1;
    const ord = s.subs.slice().filter((q)=>q.v0!=null).sort((a,b)=>((a.v0+a.v1)/2)-((b.v0+b.v1)/2));
    if (ord.length < 2) return;
    const L = ord.map((q)=>q.Ld);
    const nonInc = L.every((v,i)=> i===0 || v <= L[i-1] + 1e-9);   // shortening toward +v
    const nonDec = L.every((v,i)=> i===0 || v >= L[i-1] - 1e-9);   // shortening toward -v
    let bounded = true;
    for (let i=1;i<L.length;i+=1){ const lo=Math.min(L[i],L[i-1]), hi=Math.max(L[i],L[i-1]); if (hi>0 && lo/hi < STEP_MIN) bounded = false; }
    if (!(nonInc || nonDec) || !bounded) return;
    nCombGraded += 1; gapGraded += wgt;
    // direction check: the comb must shorten toward the BRIGHTER side
    const towardPlus = nonInc;                       // lengths fall as v rises
    if (s.gradSgn > 0 ? towardPlus : (s.gradSgn < 0 ? !towardPlus : false)) gapGradedDir += wgt;
  });
  // ---- A1b ----------------------------------------------------------------
  const bareRuns = shaded.map((s) => s.bareMaxRP);
  // ---- A2 -----------------------------------------------------------------
  const subsShaded = [];
  shaded.forEach((s) => s.subs.forEach((q) => subsShaded.push({ Ld: q.Ld, cx: q.cx, cy: q.cy })));
  const A2n = subsShaded.filter((q) => q.Ld < 0.5 * RP).length;
  const cell = 1.6 * RP; const grid = new Map();
  subsShaded.forEach((q, i) => { const k = `${Math.floor(q.cx/cell)},${Math.floor(q.cy/cell)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
  let A2loc = 0;
  subsShaded.forEach((q, i) => {
    const gx = Math.floor(q.cx/cell), gy = Math.floor(q.cy/cell); const ns = [];
    for (let j=-1;j<=1;j++) for (let k=-1;k<=1;k++) { const arr = grid.get(`${gx+j},${gy+k}`); if (!arr) continue;
      for (const n of arr) { if (n===i) continue; const o = subsShaded[n]; if (Math.hypot(o.cx-q.cx,o.cy-q.cy) <= 1.5*RP) ns.push(o.Ld); } }
    if (ns.length >= 3 && q.Ld < 0.5 * med(ns)) A2loc += 1;
  });
  // ---- A3 -----------------------------------------------------------------
  const r2s = []; const wts = [];
  rows.forEach((arr) => {
    const pts = []; arr.forEach((s) => s.subs.forEach((q) => pts.push([1 - s.I, q.Ld / RP])));
    if (pts.length < 8) return;
    const mx = mean(pts.map((p)=>p[0])), my = mean(pts.map((p)=>p[1]));
    let sxy=0,sxx=0,syy=0; pts.forEach((p)=>{ sxy+=(p[0]-mx)*(p[1]-my); sxx+=(p[0]-mx)**2; syy+=(p[1]-my)**2; });
    if (sxx > 1e-12 && syy > 1e-12) { r2s.push((sxy*sxy)/(sxx*syy)); wts.push(pts.length); }
  });
  const wsum = wts.reduce((a,b)=>a+b,0);
  const A3 = wsum ? r2s.reduce((a,v,i)=>a+v*wts[i],0)/wsum : null;
  // ---- pooled (T2-5's own instrument, for continuity) ----------------------
  const allSubs = []; S.forEach((s) => s.subs.forEach((q) => allSubs.push({ x: 1-s.I, y: q.Ld/RP })));
  const mx2 = mean(allSubs.map((p)=>p.x)), my2 = mean(allSubs.map((p)=>p.y));
  let a2=0,b2=0,c2=0; allSubs.forEach((p)=>{ a2+=(p.x-mx2)*(p.y-my2); b2+=(p.x-mx2)**2; c2+=(p.y-my2)**2; });
  const pooledR2 = (b2>1e-12&&c2>1e-12)?(a2*a2)/(b2*c2):null;
  // ---- seam overlap (O-B, T2-5's definition) + over2RP (O-C2) -------------
  const ov = []; let over2 = 0; let over2mm = 0; const lens = [];
  S.forEach((s) => { const n = Math.max(1, s.nPoly || 1); const band = s.R / n; const half = band/2;
    s.subs.forEach((q) => {
      lens.push(q.Ld);
      if (q.Ld > 2 * RP) { over2 += 1; over2mm += q.Ld; }
      if (q.v0 == null) return;
      const c = (q.v0+q.v1)/2; const j = Math.round(c/band + (n-1)/2); const centre = (j-(n-1)/2)*band;
      const lo = Math.min(q.v0,q.v1)-centre, hi = Math.max(q.v0,q.v1)-centre;
      ov.push(Math.max(0, Math.max(-lo, hi) - half) / band);
    }); });
  return {
    nSites: S.length, nSubs: lens.length, subsPerSite: lens.length / S.length,
    A1_gradedGapShare: gapTot > 0 ? gapGraded/gapTot : null,
    A1dir_gradedGapShare: gapTot > 0 ? gapGradedDir/gapTot : null,
    A1_combSites: nComb, A1_combGraded: nCombGraded,
    A1b_bareRunP95: pct(bareRuns, 0.95), A1b_bareRunMean: mean(bareRuns), A1b_bareRunMax: bareRuns.length?Math.max(...bareRuns):null,
    A2n_fragLt050RP: A2n, A2n_frac: subsShaded.length ? A2n/subsShaded.length : null,
    A2loc_fragLtHalfNbr: A2loc, A2loc_frac: subsShaded.length ? A2loc/subsShaded.length : null,
    A3_withinBandR2: A3, A3_rows: r2s.length, A3_median: med(r2s),
    pooledLenToneR2n: pooledR2,
    ovMax: ov.length?Math.max(...ov):null, ovMean: mean(ov),
    over2RP: over2, over2RPmm: Math.round(over2mm*10)/10,
    maxLdRP: lens.length ? Math.max(...lens)/RP : null,
    meanCovFrac: mean(S.map((s)=>s.covFrac)),
  };
}

function allMetrics({ paths, stat, runs }, penWidth = 0.3) {
  const out = { pathCount: paths.length, inkMm: Math.round(paths.reduce((a,p)=>a+plen(pathPts(p)),0)*10)/10 };
  if (stat && stat.tickField && stat.tickField.rowPitch) {
    const RP = stat.tickField.rowPitch;
    const w = wedgeH.measureWedge({ tickField: stat.tickField, paths, penWidth });
    out.rowPitch = Math.round(RP*1000)/1000;
    out.wedge25 = w.wedge25; out.holeMax = w.holeMax; out.bareFrac = w.bareFrac;
    const b = bandH.measure(paths, { rowPitch: RP, penMm: penWidth });
    out.bandC = b ? b.bandC : null;
    out.A = oraclesA(stat.t26marks || [], RP, penWidth);
  }
  if (stat) {
    out.siteCoverage = wedgeH.siteCoverage(stat.tickSites || []);
    if (stat.lenByThird && stat.cntByThird) {
      const o5 = wedgeH.lengthCarriesTone(stat.lenByThird, stat.cntByThird);
      out.O5 = o5.ratio; out.O5monotone = o5.monotone;
    }
    out.marks = stat.marks; out.pens = stat.pens; out.tooShort = stat.tooShort; out.trunc = stat.trunc;
  }
  return out;
}
module.exports = { allMetrics, oraclesA, sites, pct, mean, med };
