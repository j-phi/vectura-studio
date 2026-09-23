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

module.exports = {
  contact,
  spacingShare,
  thirdsSplit,
  covByIBins,
  siteCoverage,
  pathLen,
  over2RP,
  subMinCount,
};
