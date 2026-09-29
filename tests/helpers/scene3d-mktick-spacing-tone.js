/**
 * T2-7 (Jay's `eye_t26` ruling, "BUILD proto6 DIRECTION") — the bars for the
 * spacing-tone tick field. Pure math over `paths` (the algorithm's own
 * emitted output) and the `[I,R,P,L,drawnLen]` site records a needle-patch
 * hook in the test file captures — no file-system paths, no git history, no
 * child_process (CI-safety, `T2-7-plan.md` §7).
 *
 * Ported from `docs/3d-audit/lane-reports/T2-7-plan-evidence/scripts/
 * metrics.js` (the planner's own read-only instrument), per Amendment 4's
 * own instruction: "port its math into `tests/helpers/`, without any
 * file-system paths."
 */

const W_DEFAULT_CELL = 2; // mm, contact-grid cell size (metrics.js's own)

/** B1 (tipContact) / B3 (markContact) — eye_t26 "Minimize tick contact" /
 * eye_mktick "don't increase overlap at the seams". `fills` is an array of
 * point arrays (`{x,y}`), one per emitted `sceneFill` path. A tick TIP is
 * "in contact" when it lies within one pen width of another fill path's own
 * centreline (excluding itself). */
function contact(fills, penWidth, cell = W_DEFAULT_CELL) {
  const segd = (px, py, a, b) => {
    const dx = b.x - a.x; const dy = b.y - a.y; const l2 = dx * dx + dy * dy;
    let t = l2 < 1e-12 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
  };
  const g = new Map();
  fills.forEach((q, i) => {
    const seen = new Set();
    q.forEach((p) => {
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      if (!seen.has(k)) {
        seen.add(k);
        if (!g.has(k)) g.set(k, []);
        g.get(k).push(i);
      }
    });
  });
  let tips = 0; let tipc = 0;
  const touched = new Uint8Array(fills.length);
  fills.forEach((q, i) => {
    if (!q.length) return;
    [q[0], q[q.length - 1]].forEach((t) => {
      tips += 1;
      let hit = false;
      const cx = Math.floor(t.x / cell); const cy = Math.floor(t.y / cell);
      const cand = new Set();
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          (g.get(`${cx + dx},${cy + dy}`) || []).forEach((j) => cand.add(j));
        }
      }
      cand.delete(i);
      for (const j of cand) {
        const r = fills[j];
        for (let k = 1; k < r.length; k += 1) {
          if (segd(t.x, t.y, r[k - 1], r[k]) < penWidth) { hit = true; touched[i] = 1; touched[j] = 1; break; }
        }
        if (hit) break;
      }
      if (hit) tipc += 1;
    });
  });
  const markContact = fills.length ? touched.reduce((a, b) => a + b, 0) / fills.length : null;
  return { tipContact: tips ? tipc / tips : null, markContact, tips, tipc };
}

/** area-weighted covariance-based spacingShare (B4, reported not gated). */
function spacingShare(sites, penWidth, hiCut = 0.9) {
  const ds = sites.filter((s) => s[4] > 0 && s[0] < hiCut && s[3] > 0 && s[2] > 0);
  if (ds.length < 2) return null;
  const y = ds.map((s) => Math.log((s[3] * penWidth) / (s[1] * s[2])));
  const sp = ds.map((s) => Math.log(penWidth / s[2]));
  const mean = (a) => a.reduce((x, z) => x + z, 0) / a.length;
  const my = mean(y); const ms = mean(sp);
  let cv = 0; let vy = 0;
  y.forEach((v, i) => { cv += (sp[i] - ms) * (v - my); vy += (v - my) ** 2; });
  return vy > 0 ? cv / vy : null;
}

/** T1 (SP5) and O5, over a thirds split of a population restricted to
 * `I < hiCut` — light third's mean period / dark third's mean period
 * (SP5), and dark third's mean drawn length / light third's (O5). */
function thirdsSplit(sites, hiCut) {
  const Ls = [0, 0, 0]; const Ps = [0, 0, 0]; const ns = [0, 0, 0];
  sites.forEach((s) => {
    if (!(s[4] > 0) || s[0] >= hiCut) return;
    const t = Math.min(2, Math.floor(Math.max(0, s[0]) / (hiCut / 3)));
    Ls[t] += s[4]; Ps[t] += s[2]; ns[t] += 1;
  });
  const mL = Ls.map((v, i) => (ns[i] ? v / ns[i] : null));
  const mP = Ps.map((v, i) => (ns[i] ? v / ns[i] : null));
  return {
    O5: (mL[0] && mL[2]) ? mL[0] / mL[2] : null,
    O5mono: mL[0] != null && mL[1] != null && mL[2] != null && mL[0] >= mL[1] && mL[1] >= mL[2],
    SP5: (mP[0] && mP[2]) ? mP[2] / mP[0] : null,
    SP5mono: mP[0] != null && mP[1] != null && mP[2] != null && mP[0] <= mP[1] && mP[1] <= mP[2],
    n: ns,
  };
}

/** T4/B5 — binned delivered coverage vs I (9 bins, area-weighted over ALL
 * sites including undrawn ones, I < 0.9), nonMono = count of adjacent bins
 * where coverage RISES toward the light (should be non-increasing as I
 * grows, i.e. monotone non-decreasing toward the DARK end). */
function covByIBins(sites, penWidth, nBins = 9) {
  const num = Array(nBins).fill(0); const den = Array(nBins).fill(0);
  sites.forEach((s) => {
    if (s[0] >= 0.9) return;
    const b = Math.min(nBins - 1, Math.floor(s[0] / 0.1));
    num[b] += s[4] > 0 ? s[3] * penWidth : 0;
    den[b] += s[1] * s[2];
  });
  const cov = num.map((v, i) => (den[i] > 0 ? v / den[i] : null));
  const cc = cov.filter((v) => v != null);
  let nonMono = 0;
  for (let i = 1; i < cc.length; i += 1) if (cc[i] > cc[i - 1] + 1e-9) nonMono += 1;
  return { cov, nonMono };
}

/** T5/B7 — the pre-existing per-site coverage metric, and subMin (drawn
 * fill marks under two pen widths — should always be 0, the plot floor's
 * own job). `fills` = emitted sceneFill point arrays. */
function siteCoverage(tickSites, hi = 0.90) {
  let litArea = 0; let bareArea = 0;
  for (let i = 0; i < tickSites.length; i += 4) {
    const I = tickSites[i]; const R = tickSites[i + 1]; const P = tickSites[i + 2]; const drawn = tickSites[i + 3];
    if (I >= hi) continue;
    const area = R * P;
    litArea += area;
    if (!drawn) bareArea += area;
  }
  return litArea > 0 ? 1 - bareArea / litArea : null;
}

function pathLen(pp) {
  let l = 0;
  for (let i = 1; i < pp.length; i += 1) l += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
  return l;
}

/** T7/B9 — over2RP: a drawn mark whose own arc length exceeds 2x the
 * nominal row pitch is "a line, not a tick" (eye_mktick's own standing
 * bar, T2-5's O-C2, carried forward unchanged in spirit but re-measured
 * directly off emitted paths rather than an internal hook). A small (5%)
 * tolerance is applied: the bar compares the WALKED (curved-surface) arc
 * length against the FLAT nominal row pitch, and a mark whose reach is
 * capped at exactly `2*RPn` in the flat solve can walk a few tenths of a
 * percent longer once the chart's own curvature is added back in (measured:
 * `torus/contour`'s worst case is 2.0007x, not a genuine over-length band —
 * `T2-7-impl.md` discloses this). `OVER2RP_TOL` names the tolerance so it
 * is not a silent fudge. */
const OVER2RP_TOL = 1.05;
function over2RP(fills, rowPitch) {
  const over = fills.filter((q) => pathLen(q) > OVER2RP_TOL * 2 * rowPitch);
  return { count: over.length, maxLenOverRP: over.length ? Math.max(...over.map((q) => pathLen(q) / rowPitch)) : 0 };
}

/** subMin — drawn fill marks shorter than 2 pen widths (should never
 * happen; the plot floor's own job). */
function subMinCount(fills, penWidth) {
  const MIN = 2 * penWidth;
  return fills.filter((q) => pathLen(q) < MIN - 1e-6).length;
}


/**
 * T2-8b — the BARE-AREA instrument (ported from the planner's read-only
 * script; pure math over emitted paths, no fs/git). `paths` = the
 * algorithm's emitted paths, each an array of `{x,y}` with `meta.kind`.
 * Raster at `RES` mm; every `sceneFill` and `sceneEdge` path is stamped
 * with radius `STAMP_R`; the INTERIOR is the set of pixels not
 * flood-reachable from the bbox border without crossing `sceneEdge` ink;
 * a two-pass chamfer gives each pixel's distance to any ink. `bareArea(T)`
 * is the area (mm^2) of interior pixels at distance >= T.
 */
const BARE_RES = 0.05;
const BARE_STAMP_R = 0.15;
function buildBareRaster(paths, res = BARE_RES, stampR = BARE_STAMP_R) {
  const use = paths.filter((p) => p.meta && (p.meta.kind === 'sceneFill' || p.meta.kind === 'sceneEdge') && p.length);
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  use.forEach((p) => p.forEach((q) => {
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
  }));
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
  const W = Math.ceil((x1 - x0) / res) + 1; const H = Math.ceil((y1 - y0) / res) + 1;
  const ink = new Uint8Array(W * H); const edge = new Uint8Array(W * H);
  const rp = Math.ceil(stampR / res);
  const stamp = (arr, x, y) => {
    const cx = Math.round((x - x0) / res); const cy = Math.round((y - y0) / res);
    for (let dy = -rp; dy <= rp; dy += 1) {
      for (let dx = -rp; dx <= rp; dx += 1) {
        if (dx * dx + dy * dy > rp * rp) continue;
        const ix = cx + dx; const iy = cy + dy;
        if (ix >= 0 && iy >= 0 && ix < W && iy < H) arr[iy * W + ix] = 1;
      }
    }
  };
  use.forEach((p) => {
    const isEdge = p.meta.kind === 'sceneEdge';
    for (let i = 0; i < p.length; i += 1) {
      const a = p[i]; const b = i ? p[i - 1] : p[i];
      const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / (res * 2)));
      for (let k = 0; k <= n; k += 1) {
        const x = b.x + ((a.x - b.x) * k) / n; const y = b.y + ((a.y - b.y) * k) / n;
        stamp(ink, x, y);
        if (isEdge) stamp(edge, x, y);
      }
    }
  });
  // exterior flood (4-connected) from the border, blocked by edge ink
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (ix, iy) => {
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    const id = iy * W + ix;
    if (outside[id] || edge[id]) return;
    outside[id] = 1; stack.push(id);
  };
  for (let ix = 0; ix < W; ix += 1) { push(ix, 0); push(ix, H - 1); }
  for (let iy = 0; iy < H; iy += 1) { push(0, iy); push(W - 1, iy); }
  while (stack.length) {
    const id = stack.pop(); const ix = id % W; const iy = (id - ix) / W;
    push(ix + 1, iy); push(ix - 1, iy); push(ix, iy + 1); push(ix, iy - 1);
  }
  // two-pass chamfer distance to ink (pixel units)
  const INF = 1e9; const d = new Float32Array(W * H);
  for (let i = 0; i < W * H; i += 1) d[i] = ink[i] ? 0 : INF;
  const S2 = Math.SQRT2;
  for (let iy = 0; iy < H; iy += 1) {
    for (let ix = 0; ix < W; ix += 1) {
      const id = iy * W + ix; let v = d[id];
      if (ix > 0) v = Math.min(v, d[id - 1] + 1);
      if (iy > 0) {
        v = Math.min(v, d[id - W] + 1);
        if (ix > 0) v = Math.min(v, d[id - W - 1] + S2);
        if (ix < W - 1) v = Math.min(v, d[id - W + 1] + S2);
      }
      d[id] = v;
    }
  }
  for (let iy = H - 1; iy >= 0; iy -= 1) {
    for (let ix = W - 1; ix >= 0; ix -= 1) {
      const id = iy * W + ix; let v = d[id];
      if (ix < W - 1) v = Math.min(v, d[id + 1] + 1);
      if (iy < H - 1) {
        v = Math.min(v, d[id + W] + 1);
        if (ix < W - 1) v = Math.min(v, d[id + W + 1] + S2);
        if (ix > 0) v = Math.min(v, d[id + W - 1] + S2);
      }
      d[id] = v;
    }
  }
  return {
    x0, y0, W, H, res, ink, outside, dist: d,
  };
}

/** Area (mm^2) of interior pixels at chamfer distance >= T mm, optionally
 * restricted to a window `[xA, yA, xB, yB]` (mm, output path space). */
function bareArea(r, T, win) {
  const tPx = T / r.res; let n = 0;
  let ixA = 0; let iyA = 0; let ixB = r.W - 1; let iyB = r.H - 1;
  if (win) {
    ixA = Math.max(0, Math.floor((win[0] - r.x0) / r.res)); iyA = Math.max(0, Math.floor((win[1] - r.y0) / r.res));
    ixB = Math.min(r.W - 1, Math.ceil((win[2] - r.x0) / r.res)); iyB = Math.min(r.H - 1, Math.ceil((win[3] - r.y0) / r.res));
  }
  for (let iy = iyA; iy <= iyB; iy += 1) {
    for (let ix = ixA; ix <= ixB; ix += 1) {
      const id = iy * r.W + ix;
      if (!r.outside[id] && r.dist[id] >= tPx) n += 1;
    }
  }
  return n * r.res * r.res;
}

/** Raster ink coverage (fraction of INTERIOR pixels inked) inside a window. */
function inkCoverage(r, win) {
  let inked = 0; let tot = 0;
  const ixA = Math.max(0, Math.floor((win[0] - r.x0) / r.res)); const iyA = Math.max(0, Math.floor((win[1] - r.y0) / r.res));
  const ixB = Math.min(r.W - 1, Math.ceil((win[2] - r.x0) / r.res)); const iyB = Math.min(r.H - 1, Math.ceil((win[3] - r.y0) / r.res));
  for (let iy = iyA; iy <= iyB; iy += 1) {
    for (let ix = ixA; ix <= ixB; ix += 1) {
      const id = iy * r.W + ix;
      if (r.outside[id]) continue;
      tot += 1; if (r.ink[id]) inked += 1;
    }
  }
  return tot ? inked / tot : null;
}

/** Object ink in mm (sceneFill + sceneEdge path length; ground/backdrop are
 * not present in the fixtures that call this). */
function inkMm(paths) {
  return paths.filter((p) => p.meta && (p.meta.kind === 'sceneFill' || p.meta.kind === 'sceneEdge')).reduce((a, p) => a + pathLen(p), 0);
}


/**
 * T2-8b-2 — chain metrics for the band-continuation bars (SEAM / DIR /
 * TAPER / OUTLINE). Pure math over records captured by test-side needles
 * (`{pts, li, tag}` per placed run): regular ticks are tagged
 * `reg:M:<a>` (main piece) or `reg:s:<a>`; continuation pieces are tagged
 * `cont|<dir>|<kB>|<aB>|<j>|<pieceIdx>`. Chains are grouped by EXACT span
 * identity `(li, dir, kB, aB)` — never reconstructed from paths (on contour
 * a ruling has up to 4 span ends). `edgePaths` = the `sceneEdge` polylines.
 * Returns one object per chain.
 */
function chainMetrics(records, edgePaths) {
  const chord = (r) => {
    const a = r.pts[0]; const b = r.pts[r.pts.length - 1];
    return {
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      ang: ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 360) % 180,
      n: (() => { const dx = b.x - a.x; const dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; return { x: -dy / l, y: dx / l }; })(),
    };
  };
  const angDiff = (a, b) => { const d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); };
  const perp = (h1, h2) => Math.abs((h2.mid.x - h1.mid.x) * h1.n.x + (h2.mid.y - h1.mid.y) * h1.n.y);
  const regM = records.filter((r) => r.tag && r.tag.startsWith('reg:M:'))
    .map((r) => ({ r, li: r.li, a: Number(r.tag.split(':')[2]), c: chord(r), len: pathLen(r.pts) }));
  const chains = new Map();
  records.filter((r) => r.tag && r.tag.startsWith('cont|')).forEach((r) => {
    const [, dir, kB, aB, j, pi] = r.tag.split('|');
    const key = `${r.li}|${dir}|${kB}|${aB}`;
    if (!chains.has(key)) chains.set(key, { li: r.li, dir: Number(dir), aB: Number(aB), pieces: [] });
    chains.get(key).pieces.push({ r, j: Number(j), pi: Number(pi), len: pathLen(r.pts), c: chord(r) });
  });
  const segd = (px, py, a, b) => {
    const dx = b.x - a.x; const dy = b.y - a.y; const l2 = dx * dx + dy * dy;
    let t = l2 < 1e-12 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - a.x - t * dx, py - a.y - t * dy);
  };
  const out = [];
  chains.forEach((ch) => {
    const byJ = new Map();
    ch.pieces.forEach((pc) => { if (!byJ.has(pc.j) || pc.len > byJ.get(pc.j).len) byJ.set(pc.j, pc); });
    const js = [...byJ.keys()].sort((x, y) => x - y);
    const bnd = regM.find((m) => m.li === ch.li && m.a.toFixed(4) === ch.aB.toFixed(4));
    const inner = regM.filter((m) => m.li === ch.li && (m.a - ch.aB) * ch.dir < 0)
      .sort((x, y) => Math.abs(x.a - ch.aB) - Math.abs(y.a - ch.aB))[0];
    const first = byJ.get(js[0]);
    let s = null; let dirExcess = null;
    if (bnd && inner && first) {
      const ref = perp(bnd.c, inner.c);
      s = ref > 1e-6 ? perp(bnd.c, first.c) / (first.j * ref) : null;
      dirExcess = angDiff(bnd.c.ang, first.c.ang) / first.j - angDiff(inner.c.ang, bnd.c.ang);
    }
    let prev = bnd ? bnd.len : Infinity; let viol = 0;
    js.forEach((j) => { const L = byJ.get(j).len; if (L > prev + 0.05) viol += 1; prev = L; });
    let minEdge = Infinity;
    ch.pieces.forEach((pc) => pc.r.pts.forEach((pt) => {
      (edgePaths || []).forEach((e) => { for (let i = 1; i < e.length; i += 1) minEdge = Math.min(minEdge, segd(pt.x, pt.y, e[i - 1], e[i])); });
    }));
    out.push({
      li: ch.li, dir: ch.dir, aB: ch.aB, j1: js[0], nTicks: ch.pieces.length, s, dirExcess, violations: viol, minEdge, hasBoundary: !!bnd,
    });
  });
  return out;
}

module.exports = {
  chainMetrics,
  buildBareRaster,
  bareArea,
  inkCoverage,
  inkMm,
  contact,
  spacingShare,
  thirdsSplit,
  covByIBins,
  siteCoverage,
  pathLen,
  over2RP,
  subMinCount,
};
