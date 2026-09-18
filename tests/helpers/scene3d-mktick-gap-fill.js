/*
 * T2-6 — oracles A1 (graded-gap share), A1b (black-gap run), A2 (fragments),
 * A3 (within-band length-vs-tone R^2). `docs/3d-audit/lane-reports/T2-6-plan.md`
 * §2. READ-ONLY math over site records collected by the test file's own
 * `__T26_HOOK__` instrumentation — this file does not touch production code.
 *
 * A site record (one per `law.shape === 'tick'` sample, i.e. one `layMark`
 * call): { I, R, P, L, a, k, lineIndex, drawn, comb, dir,
 *   subs: [{ v0, v1 }, ...] }  — `v0`/`v1` are the FRAME-LOCAL across-row
 * bounds of one emitted sub-tick, exactly the geometry handed to `place()`
 * (pre-walk, pre-truncation — the same "attempted, not drawn-and-surviving"
 * caveat `T2-5-plan.md`/`-review.md` §3 already disclosed for this class of
 * hook; the SITE's own `drawn` flag, taken from `place()`'s real return
 * value, is what every oracle below gates on, so a dropped-whole-mark site
 * is correctly excluded).
 */
const HI = 0.90;             // T2-3's own highlight threshold
const STEP_MIN = 0.5;        // Jay's "no tick under half its neighbour"

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((x, y) => x - y);
  const i = p * (s.length - 1);
  const lo = Math.floor(i); const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const median = (arr) => pct(arr, 0.5);

/* Band-gap geometry for one site: covered length inside [-R/2,+R/2] and the
 * longest single UNCOVERED run inside that band (row pitches). */
function siteGap(rec, RP) {
  const R = rec.R;
  const iv = rec.subs
    .filter((s) => Number.isFinite(s.v0) && Number.isFinite(s.v1))
    .map((s) => [Math.min(s.v0, s.v1), Math.max(s.v0, s.v1)])
    .sort((a, b) => a[0] - b[0]);
  const lo = -R / 2; const hi = R / 2;
  let cur = lo; let cov = 0;
  const bares = [];
  iv.forEach(([a0, a1]) => {
    const c0 = Math.max(lo, a0); const c1 = Math.min(hi, a1);
    if (c0 > cur) { bares.push(c0 - cur); cur = c0; }
    if (c1 > cur) { cov += c1 - cur; cur = c1; }
  });
  if (hi > cur) bares.push(hi - cur);
  const bareMax = bares.length ? Math.max(...bares) : 0;
  return { bareArea: Math.max(0, R - cov), bareMaxRP: bareMax / RP };
}

/* A1 / A1b / A2 / A3 — see `T2-6-plan.md` §2 for the definitions each of
 * these implements. `opts.lenOf(sub)` returns a sub-tick's own drawn length
 * (defaults to `|v1-v0|`, i.e. the frame-local across-row extent, which for
 * a `mkTick` mark IS its whole drawn length since ticks run purely across
 * the row — `mkShape`'s `'tick'` branch, `surface-fill.js` `off` is always 0
 * for every polygon this hook records). */
function oracles(records, RP) {
  const shaded = records.filter((r) => r.drawn && r.I < HI);
  if (!shaded.length) return null;

  // ---- A1 (graded-gap share) + A1b (bare-run P95/max) --------------------
  let gapTot = 0; let gapGraded = 0; let nCombSites = 0; let nCombGraded = 0;
  const bareRuns = [];
  shaded.forEach((r) => {
    const { bareArea, bareMaxRP } = siteGap(r, RP);
    const wgt = bareArea * r.P;
    gapTot += wgt;
    bareRuns.push(bareMaxRP);
    if (r.subs.length < 2) return;
    nCombSites += 1;
    const ord = r.subs.slice()
      .filter((s) => Number.isFinite(s.v0) && Number.isFinite(s.v1))
      .sort((a, b) => ((a.v0 + a.v1) / 2) - ((b.v0 + b.v1) / 2));
    if (ord.length < 2) return;
    const L = ord.map((s) => Math.abs(s.v1 - s.v0));
    // STRICT monotonicity (not <=/>=): a FLAT comb (all sub-ticks equal, the
    // Rank-4 shape `T2-6-plan.md` §4.5 explicitly rejects as "oracle-gaming")
    // must NOT count as "graded" — Jay's word is "gradually SHORTENING", not
    // merely "more than one tick per band". This is what the RHO=1.0
    // mutation-kill (below) actually trips: under the non-strict form a flat
    // comb still satisfies "non-increasing" and A1 would not fall.
    const strictDec = L.every((v, i) => i === 0 || v < L[i - 1] - 1e-9);
    const strictInc = L.every((v, i) => i === 0 || v > L[i - 1] + 1e-9);
    let bounded = true;
    for (let i = 1; i < L.length; i += 1) {
      const lo = Math.min(L[i], L[i - 1]); const hi = Math.max(L[i], L[i - 1]);
      if (hi > 0 && lo / hi < STEP_MIN) bounded = false;
    }
    if (!(strictDec || strictInc) || !bounded) return;
    nCombGraded += 1;
    gapGraded += wgt;
  });

  // ---- A2 (fragments) ------------------------------------------------------
  const subsShaded = [];
  shaded.forEach((r) => r.subs.forEach((s) => {
    if (!Number.isFinite(s.v0) || !Number.isFinite(s.v1)) return;
    subsShaded.push({ Ld: Math.abs(s.v1 - s.v0), a: r.a, lineIndex: r.lineIndex });
  }));
  const A2n = subsShaded.filter((s) => s.Ld < 0.5 * RP).length;
  // local-neighbour window: same row (`lineIndex`) within 1.5 RP of along-row `a`.
  const byRow = new Map();
  subsShaded.forEach((s, i) => {
    if (!byRow.has(s.lineIndex)) byRow.set(s.lineIndex, []);
    byRow.get(s.lineIndex).push(i);
  });
  let A2loc = 0;
  subsShaded.forEach((s, i) => {
    const row = byRow.get(s.lineIndex) || [];
    const nbrs = row.filter((j) => j !== i && Math.abs(subsShaded[j].a - s.a) <= 1.5 * RP)
      .map((j) => subsShaded[j].Ld);
    if (nbrs.length >= 3 && s.Ld < 0.5 * median(nbrs)) A2loc += 1;
  });

  // ---- A3 (within-band R^2, per row, count-weighted) ------------------------
  const rows = new Map();
  shaded.forEach((r) => {
    if (!rows.has(r.lineIndex)) rows.set(r.lineIndex, []);
    r.subs.forEach((s) => {
      if (!Number.isFinite(s.v0) || !Number.isFinite(s.v1)) return;
      rows.get(r.lineIndex).push([1 - r.I, Math.abs(s.v1 - s.v0) / RP]);
    });
  });
  const r2s = []; const wts = [];
  rows.forEach((pts) => {
    if (pts.length < 8) return;
    const mx = mean(pts.map((p) => p[0])); const my = mean(pts.map((p) => p[1]));
    let sxy = 0; let sxx = 0; let syy = 0;
    pts.forEach((p) => { sxy += (p[0] - mx) * (p[1] - my); sxx += (p[0] - mx) ** 2; syy += (p[1] - my) ** 2; });
    if (sxx > 1e-12 && syy > 1e-12) { r2s.push((sxy * sxy) / (sxx * syy)); wts.push(pts.length); }
  });
  const wsum = wts.reduce((a, b) => a + b, 0);
  const A3 = wsum ? r2s.reduce((a, v, i) => a + v * wts[i], 0) / wsum : null;

  return {
    nSites: shaded.length,
    nSubs: subsShaded.length,
    A1_gradedGapShare: gapTot > 0 ? gapGraded / gapTot : null,
    A1_combSites: nCombSites,
    A1_combGraded: nCombGraded,
    A1b_bareRunP95: pct(bareRuns, 0.95),
    A1b_bareRunMax: bareRuns.length ? Math.max(...bareRuns) : null,
    A2n_fragLt050RP: A2n,
    A2n_frac: subsShaded.length ? A2n / subsShaded.length : null,
    A2loc_fragLtHalfNbr: A2loc,
    A3_withinBandR2: A3,
    A3_rows: r2s.length,
  };
}

/* Neutrality proof (RED test item 5): every emitted comb's own sub-tick
 * lengths sum to the site's own asked `L`, EXACTLY (to float tolerance). */
function combNeutrality(records) {
  let worst = 0;
  records.filter((r) => r.drawn && r.comb).forEach((r) => {
    const sum = r.subs.reduce((a, s) => a + Math.abs(s.v1 - s.v0), 0);
    worst = Math.max(worst, Math.abs(sum - r.L));
  });
  return worst;
}

module.exports = {
  oracles, siteGap, combNeutrality, HI, STEP_MIN, pct, mean, median,
};
