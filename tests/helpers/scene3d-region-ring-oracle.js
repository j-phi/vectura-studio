/**
 * Independent geometric oracle for F6 — the torus inner-hole fold-cusp defect
 * where ribbon/wall ink shows a short filled wedge on the inner-hole
 * silhouette (near 4/8 o'clock) and/or breaks a band that should run
 * continuous (roughly 2-4 o'clock).
 *
 * Root cause (see the "F6 — A SINGLE RING CAN CROSS ITSELF, TOO" comment
 * block in `surface-fill.js`): at the fold cusp the marching-squares tracer
 * in `buildRegionRings` can produce ONE region ring that crosses ITSELF
 * (measured on the factory torus, `taperedEnds`, default 3/4 view: 3
 * self-crossings in a 128-point ring). `RibbonGeometry.clipMultiPolygonToRegion`
 * is a pure polygon-clipping boolean with no defined behaviour for a
 * self-intersecting CLIP boundary — that undefined behaviour is what lets a
 * wedge of ink through in one place and cuts a band that should be
 * continuous in another. A per-vertex check of the FINAL emitted ink against
 * an independently re-sampled true depth field was tried and rejected as an
 * oracle: `surface-fill.js` stamps every outline/fill path with ONE constant
 * z per run (`z = run[st.a].z`, `surface-fill.js:6407`/`:6322`), not a true
 * per-vertex value, so even entirely correct ink reads back with a multi-mm
 * to 30+mm "depth mismatch" against its own true surface purely from that
 * stamping — noise on the same order as the defect itself, with no
 * threshold that separates the two on this fixture (measured: even a 20mm
 * tolerance left 126 false "hits").
 *
 * The reliable, independent claim instead: every region ring `surface-
 * fill.js` ever hands `clipMultiPolygonToRegion` is a SIMPLE polygon (never
 * crosses itself). `captureRegionRings` hooks that one shared call site —
 * exactly the pattern `tests/helpers/scene3d-wall-clip-oracle.js` (F5) uses —
 * and `findSelfIntersectingRings` checks the captured rings with a
 * self-intersection test written FRESH here, never calling into
 * `ringHasSelfIntersection` / `resolveRingSelfIntersections` / any other
 * `surface-fill.js` internal. It does not need to know which sheet is near
 * or far, or reconstruct per-vertex depth at all — a simple ring is
 * necessary (though not sufficient on its own) for `clipMultiPolygonToRegion`
 * to behave the way both classes' own contracts already assume it does.
 */

const captureRegionRings = (Vectura) => {
  const RGm = Vectura.RibbonGeometry;
  const orig = RGm.clipMultiPolygonToRegion;
  const seen = new Set();
  const regions = [];
  RGm.clipMultiPolygonToRegion = function patchedClip(subjectMP, clipRings) {
    if (Array.isArray(clipRings) && !seen.has(clipRings)) {
      seen.add(clipRings);
      regions.push(clipRings);
    }
    return orig.apply(this, arguments);
  };
  return {
    regions,
    restore: () => { RGm.clipMultiPolygonToRegion = orig; },
  };
};

// Proper-crossing test between two segments — endpoint touches (t/u exactly
// 0 or 1) excluded on purpose, since every edge pair adjacent in a ring
// shares a vertex and that is not a crossing.
const segmentsCross = (a, b, c, d) => {
  const d1x = b.x - a.x; const d1y = b.y - a.y;
  const d2x = d.x - c.x; const d2y = d.y - c.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-12) return false;
  const t = ((c.x - a.x) * d2y - (c.y - a.y) * d2x) / denom;
  const u = ((c.x - a.x) * d1y - (c.y - a.y) * d1x) / denom;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
};

const ringSelfIntersectionCount = (ring) => {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const n = ring.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = ring[i]; const b = ring[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) count += 1;
    }
  }
  return count;
};

// Every self-intersecting ring found across every distinct captured region.
const findSelfIntersectingRings = (regions) => {
  const hits = [];
  (regions || []).forEach((region, ri) => {
    (region || []).forEach((ring, gi) => {
      const crossings = ringSelfIntersectionCount(ring);
      if (crossings > 0) hits.push({ regionIndex: ri, ringIndex: gi, points: ring.length, crossings });
    });
  });
  return hits;
};

module.exports = { captureRegionRings, ringSelfIntersectionCount, findSelfIntersectingRings };
