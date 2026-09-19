/**
 * T2-5 — Jay's USER RULE oracle (cone/hatch/mkTick/d=50, verbatim): "Instead
 * of tick fragments on the right, use gradually shortening ticks to fill the
 * black gaps at the bottom of the vertical waves. Also don't increase
 * overlap at the seams. And remove any lines not part of a tick band."
 * `docs/3d-audit/lane-reports/T2-5-plan.md`.
 *
 * Three clauses, three oracles, over the SAME population: every `mkTick`
 * mark actually emitted (one record per drawn sub-tick — see
 * `__T25_HOOK__` below), captured WITHOUT touching `src/` (the same
 * `scriptOverrides` mutation-mechanism `scene3d-mktick-wedge.test.js`'s own
 * MUTATION-KILL 2 uses — a needle-patched copy of the CURRENT disk source,
 * loaded into its own `loadVecturaRuntime` VM context, never written to
 * disk). This keeps `surface-fill.js` free of permanent instrumentation;
 * `docs/3d-audit/lane-reports/T2-5-plan.md` §0.3 used the identical
 * measurement-only, proven-neutral approach in its own scratch exports.
 *
 * WHICH CLAUSE EACH ORACLE GATES (rule 1 — state it, mutation-prove it):
 *   - O-A (`roughP95`, `lenToneR2n`) gates clause (1)+(2): "gradually
 *     shortening ticks to fill the black gaps... not tick fragments."
 *     `roughP95` is bounded step between arc-neighbours in the SAME row;
 *     `lenToneR2n` is how much of a tick's length is explained by tone
 *     (R² of length/rowPitch regressed on 1-I). Neither says anything about
 *     seam overlap (O-B) or over-long ticks (O-C).
 *   - O-B (`ovMax`, `ovMean`) gates clause "don't increase overlap at the
 *     seams" ONLY. `ov` is the fraction of a tick's own drawn band that
 *     spills past the band it owns (`[-band/2, +band/2]`), taken from the
 *     mark's own local across-row extent as built in `layMark` (exact, not
 *     inferred). It says NOTHING about clause (1)/(2)/(3).
 *   - O-C2 (`over2RP`) gates clause "remove any lines not part of a tick
 *     band" ONLY: a sub-tick whose own drawn length exceeds 2 nominal row
 *     pitches cannot read as "part of a tick band" whatever the solve
 *     intended. Says nothing about O-A/O-B.
 *
 * THE HOOK. `__T25_HOOK__(record)` is called once per emitted sub-tick, from
 * inside `layMark`'s `law.shape === 'tick'` block, with
 * `{ I, R, P, L, a, k, band, each, cOff, nSub, j }` — `each` is the
 * sub-tick's OWN asked length (== the mark's whole `L` when `nSub===1`),
 * `band` is the row-band width THIS sub-tick owns (`R` pre-retile, `R/nSub`
 * post), `cOff` is its own stagger offset within that band. The hook is a
 * plain global (guarded by `typeof ... === 'function'`) — when absent
 * (every other test/production path) it costs nothing and changes nothing;
 * proven by `neutrality` describe block below (md5-identical paths with and
 * without the hook wired, on the BASE-tree stagger block).
 */

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return null;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** O-A1 — roughP95: P95 of |Ld - median(Ld of same-row ticks within 2*RP of
 * this tick's own arc position)| / RP. "Bounded step between neighbours." */
function roughP95(marks, RP) {
  const byRow = new Map();
  marks.forEach((m) => {
    if (!byRow.has(m.k)) byRow.set(m.k, []);
    byRow.get(m.k).push(m);
  });
  const devs = [];
  byRow.forEach((rowMarks) => {
    rowMarks.forEach((m) => {
      const neigh = rowMarks.filter((o) => Math.abs(o.a - m.a) <= 2 * RP).map((o) => o.each);
      const med = median(neigh);
      if (med == null) return;
      devs.push(Math.abs(m.each - med) / RP);
    });
  });
  devs.sort((a, b) => a - b);
  return quantile(devs, 0.95);
}

/** O-A2 — lenToneR2n: R^2 of (Ld/RP) regressed on (1-I), over ALL ticks.
 * "Length is graded by tone, not by a hash." */
function lenToneR2n(marks, RP) {
  const xs = marks.map((m) => 1 - m.I);
  const ys = marks.map((m) => m.each / RP);
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0; let sxy = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx; const dy = ys[i] - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return 0;
  const r = sxy / Math.sqrt(sxx * syy);
  return r * r;
}

/** O-B — per-mark seam overlap: ov = max(0, max(-v0,v1) - band/2) / band,
 * v0 = -each/2+cOff, v1 = each/2+cOff, taken from the mark's OWN local
 * across-row extent and its OWN band (the sub-band once re-tiled). */
function seamOverlap(marks) {
  const ovs = marks.map((m) => {
    const v0 = -m.each / 2 + m.cOff;
    const v1 = m.each / 2 + m.cOff;
    return Math.max(0, Math.max(-v0, v1) - m.band / 2) / m.band;
  });
  const ovMax = ovs.length ? Math.max(...ovs) : null;
  const ovMean = ovs.length ? ovs.reduce((a, b) => a + b, 0) / ovs.length : null;
  return { ovMax, ovMean, ovs };
}

/** O-C2 — over2RP: count (and total mm) of sub-ticks whose OWN drawn/asked
 * length exceeds 2 nominal row pitches — "crosses two whole rows", cannot
 * read as "part of a tick band". */
function over2RP(marks, RP) {
  const hits = marks.filter((m) => m.each > 2 * RP);
  return { count: hits.length, totalMm: hits.reduce((a, b) => a + b.each, 0) };
}

module.exports = {
  roughP95, lenToneR2n, seamOverlap, over2RP, median, quantile,
};
