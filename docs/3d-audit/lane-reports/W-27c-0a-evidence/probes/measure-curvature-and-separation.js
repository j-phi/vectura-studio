'use strict';
const fs = require('fs');
const SP = '/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad';
const cap = JSON.parse(fs.readFileSync(SP + '/out0a/capture.json'));
const PXMM = cap.scale; // CSS px per mm at the audit framing (7.4839)

const paths = cap.scenePaths.map((p) => p.pts);

// ── 1. Minimum radius of curvature per path (circumradius of consecutive triples)
function radii(pts) {
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const A = Math.hypot(b.x - a.x, b.y - a.y);
    const B = Math.hypot(c.x - b.x, c.y - b.y);
    const C = Math.hypot(c.x - a.x, c.y - a.y);
    const s = (A + B + C) / 2;
    const area2 = Math.max(0, s * (s - A) * (s - B) * (s - C));
    const area = Math.sqrt(area2);
    if (area < 1e-15) continue;
    out.push({ i, r: (A * B * C) / (4 * area), x: b.x, y: b.y });
  }
  return out;
}
let allR = [];
paths.forEach((p, pi) => radii(p).forEach((r) => allR.push({ pi, n: p.length, ...r })));
allR.sort((a, b) => a.r - b.r);
console.log('=== curvature radius of the DRAWN polyline (device mm) ===');
console.log('vertices measured', allR.length);
[0.02, 0.05, 0.1, 0.2, 0.5].forEach((t) => console.log(`  radius < ${t}mm : ${allR.filter((r) => r.r < t).length} vertices, ${new Set(allR.filter((r)=>r.r<t).map((r)=>r.pi)).size} paths`));
console.log('tightest 12:');
allR.slice(0, 12).forEach((r) => console.log(`  path#${r.pi} n=${r.n} i=${r.i} r=${r.r.toFixed(4)}mm (${(r.r*PXMM).toFixed(3)} css px) at mm(${r.x.toFixed(2)},${r.y.toFixed(2)})`));

// ── 2. Hairpin arm separation: for each path, min distance between two vertices
//      of the SAME path that are far apart in index (>8) — the hairpin pinch.
console.log('\n=== hairpin arm separation (same path, index-distant) ===');
const pinch = [];
paths.forEach((p, pi) => {
  let best = { d: Infinity };
  for (let i = 0; i < p.length; i += 1) {
    for (let j = i + 9; j < p.length; j += 1) {
      const d = Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y);
      if (d < best.d) best = { d, i, j, x: p[i].x, y: p[i].y };
    }
  }
  if (best.d < Infinity) pinch.push({ pi, n: p.length, ...best });
});
pinch.sort((a, b) => a.d - b.d);
pinch.slice(0, 10).forEach((q) => console.log(`  path#${q.pi} n=${q.n} arms ${q.i}/${q.j} gap=${q.d.toFixed(4)}mm (${(q.d*PXMM).toFixed(2)} css px) at mm(${q.x.toFixed(2)},${q.y.toFixed(2)})`));

// ── 3. Inter-ring crowding: nearest vertex on a DIFFERENT path
console.log('\n=== inter-ring separation (nearest vertex on another path) ===');
const flat = [];
paths.forEach((p, pi) => p.forEach((q, i) => flat.push({ pi, i, x: q.x, y: q.y })));
// grid index
const CELL = 1.0;
const grid = new Map();
const key = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
flat.forEach((f, idx) => { const k = key(f.x, f.y); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(idx); });
const near = [];
flat.forEach((f) => {
  let best = Infinity;
  const gx = Math.floor(f.x / CELL); const gy = Math.floor(f.y / CELL);
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const arr = grid.get(`${gx + dx},${gy + dy}`); if (!arr) continue;
    arr.forEach((idx) => { const g = flat[idx]; if (g.pi === f.pi) return; const d = Math.hypot(g.x - f.x, g.y - f.y); if (d < best) best = d; });
  }
  near.push(best);
});
const finite = near.filter((d) => Number.isFinite(d)).sort((a, b) => a - b);
const frac = (t) => (near.filter((d) => d < t).length / near.length * 100).toFixed(1);
[0.1, 0.2, 0.3, 0.5].forEach((t) => console.log(`  vertices with another ring within ${t}mm: ${frac(t)}%  (${near.filter((d)=>d<t).length}/${near.length})`));
console.log('  min inter-ring distance', finite[0].toFixed(5), 'mm');

// ── 4. Turn accumulated per DEVICE pixel at the audit framing (dpr 2 => 2*PXMM px/mm)
const DEV = PXMM * 2;
function turnsOf(pts) {
  const t = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (lu < 1e-12 || lv < 1e-12) { t.push(0); continue; }
    let cs = (ux * vx + uy * vy) / (lu * lv); cs = Math.max(-1, Math.min(1, cs));
    t.push(Math.acos(cs) * 180 / Math.PI);
  }
  return t;
}
console.log('\n=== turning accumulated inside ONE device pixel (audit framing, ' + DEV.toFixed(2) + ' px/mm) ===');
let worst = { deg: 0 };
paths.forEach((p, pi) => {
  const t = turnsOf(p);
  const seg = []; for (let i = 1; i < p.length; i++) seg.push(Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y) * DEV);
  for (let i = 0; i < t.length; i++) {
    let sum = t[i], fwd = 0, k = i, back = 0, m = i;
    while (k + 1 < t.length && fwd + seg[k + 1] <= 0.5) { fwd += seg[k + 1]; k++; sum += t[k]; }
    while (m - 1 >= 0 && back + seg[m] <= 0.5) { back += seg[m]; m--; sum += t[m]; }
    if (sum > worst.deg) worst = { deg: sum, pi, i, x: p[i + 1].x, y: p[i + 1].y };
  }
});
console.log('  worst turn inside 1 device px:', worst.deg.toFixed(1) + '°', 'path#' + worst.pi, 'mm(' + worst.x.toFixed(2) + ',' + worst.y.toFixed(2) + ')');
