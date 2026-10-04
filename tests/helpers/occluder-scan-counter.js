/**
 * Deterministic work counter for HLR's occluder lookup (replaces wall-clock
 * ratios in the perf guards). Patches Scene3D.HLR.createClipper so each
 * occluder in the clipper's array is swapped for a thin wrapper whose
 * `objectId` getter counts reads. hlr.js hiddenAt() reads `occ.objectId`
 * exactly once per candidate it examines (after the own-face skip), so the
 * count equals the number of occluder candidates tested. With the spatial
 * index only grid-cell candidates are visited; with the linear scan every
 * occluder is. The count is independent of machine load.
 * Returns { count(), restore() }.
 */
const installOccluderScanCounter = (HLR) => {
  const orig = HLR.createClipper;
  let n = 0;
  HLR.createClipper = (...args) => {
    const clipper = orig.apply(HLR, args);
    const occ = clipper.occluders;
    for (let i = 0; i < occ.length; i++) {
      const w = Object.create(occ[i]);
      const oid = occ[i].objectId;
      Object.defineProperty(w, 'objectId', { get() { n++; return oid; } });
      occ[i] = w;
    }
    return clipper;
  };
  return {
    count: () => n,
    reset: () => { n = 0; },
    restore: () => { HLR.createClipper = orig; },
  };
};
module.exports = { installOccluderScanCounter };
