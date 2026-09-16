/**
 * T2-3c — the RUNAWAY-STROKE CENSUS. Pure, renderer-free helpers so the
 * census logic itself can be unit-tested (a fabricated point list) as well
 * as run against a real render. See `tests/unit/scene3d-mktick-runaway.test.js`
 * for the gated bars and `docs/3d-audit/lane-reports/T2-3c-impl.md` for the
 * mechanism this instruments (`place()`'s per-arm walk, `surface-fill.js`).
 */

// Total drawn (Euclidean, mm) length of one path — an array of `{x, y}`
// points, exactly what `Scene3D.generate()` returns per path.
const pathLength = (p) => {
  let tot = 0;
  for (let i = 1; i < p.length; i += 1) tot += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return tot;
};

// The single longest segment (consecutive-point Euclidean distance) inside
// one path — the census's own diagnostic for TELLING a discontinuous walk
// jump (one huge segment among many ordinary ones) apart from a genuinely
// long, smoothly-walked mark (many roughly-equal segments). Not gated by
// itself; reported alongside the per-path length for characterisation.
const maxSegment = (p) => {
  let mx = 0;
  for (let i = 1; i < p.length; i += 1) mx = Math.max(mx, Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
  return mx;
};

// The census itself: longest total path length and the count of paths
// whose drawn length exceeds `thresholdMm` (the audit's own ">15mm" stray-
// stroke definition throughout `T2-3b-plan.md`/`T2-3b-review.md`).
const runawayCensus = (paths, thresholdMm = 15) => {
  let longest = 0;
  let count = 0;
  let longestIndex = -1;
  for (let i = 0; i < paths.length; i += 1) {
    const len = pathLength(paths[i]);
    if (len > longest) { longest = len; longestIndex = i; }
    if (len > thresholdMm) count += 1;
  }
  return {
    longest, count, longestIndex, totalPaths: paths.length,
  };
};

module.exports = {
  pathLength, maxSegment, runawayCensus,
};
