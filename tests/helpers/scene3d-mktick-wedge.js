/**
 * T2-3 — the RASTERISED bare-wedge oracle for mkTick.
 *
 * `docs/3d-audit/lane-reports/T2-3-plan.md` §1.3: the pre-existing per-site
 * coverage metric (`Σ(R·P) over lit undrawn sites`) scores a lattice CELL as
 * fully covered the instant it draws ANY tick inside its own cell, however
 * short — it is blind in the cross-row direction, which is exactly where the
 * T2 (`dbad2d88`) and T2-2 (`9d911b05`) length-response curves both opened a
 * bare WEDGE (a strip of `(R-L)/2` on both sides of every row, converging
 * because `L` grades along the row — see `surface-fill.js`'s `MK.mkTick`
 * entry). That defect shipped and was rejected twice under a passing
 * coverage bar.
 *
 * This measures bare area against a RASTERISED shaded silhouette instead:
 *   1. "surface" + per-pixel tone come from `lastMarkStats.tickField`
 *      (`{pts:[x,y,I,...], rowPitch}`), which `surface-fill.js` republishes
 *      — gated to mkTick's own shape — from field samples EVERY ruling
 *      already computed (no extra `sampleAt` calls). Each field point is
 *      splatted as a disc of radius `rowPitch/2` (the row's own half-pitch,
 *      i.e. exactly the band a row owns before length-response shrinks a
 *      mark), so the union of splats reconstructs the shaded silhouette
 *      without needing per-point row-direction vectors.
 *   2. "ink" is stamped directly from the algorithm's own returned paths —
 *      the actual drawn output, not a re-derivation.
 *   3. A two-pass chamfer distance transform from ink, computed only over
 *      pixels the field ever marked "surface", classifies each SHADED
 *      (surface, non-highlight) bare pixel by how far it sits from the
 *      nearest ink.
 *
 * Sub-bars (row-pitch-normalised, so they are scale-free):
 *   - wedge25(cell): shaded ∧ bare ∧ dist(ink) >= 0.25*rowPitch, ÷ shaded
 *     area. Bare regions at least HALF a row pitch across. Gates R2 ("the
 *     only gaps allowed are where highlights are") — the fine white between
 *     strokes that legitimately IS light tone is deliberately excluded.
 *   - holeMax(cell): 2 * max(dist(ink) over shaded-bare) ÷ rowPitch. The
 *     diameter of the largest inscribed bare disc. Gates R2's "hard-edged"
 *     clause: a flat-topped plateau necessarily leaves a hole as wide as its
 *     own wall; a graded texture cannot.
 *   - siteCoverage: the PRE-EXISTING per-site metric
 *     (`1 - Σ(R·P over undrawn I<0.90 sites) / Σ(R·P over all I<0.90
 *     sites)`), from `lastMarkStats.tickSites` (`[I,R,P,drawn]` quads).
 *     Reported, NOT gated — this is the metric proven blind to the wedge.
 */

const PPMM_DEFAULT = 6;
const HI_DEFAULT = 0.90;

/** Splat `tickField.pts` (flat [x,y,I,...]) into a surface+tone raster. Each
 * point is stamped as a disc of radius `rowPitch/2` (the row's own
 * half-pitch — the band a row owns before any length-response shrinkage),
 * so the union of discs along a row, one row-pitch apart from its
 * neighbours, tiles the shaded silhouette. */
function rasterizeField(tickField, ppmm) {
  const pts = tickField.pts;
  const rowPitch = tickField.rowPitch;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i]; const y = pts[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const pad = (rowPitch || 5) + 1;
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = Math.max(1, Math.ceil((x1 - x0) * ppmm));
  const H = Math.max(1, Math.ceil((y1 - y0) * ppmm));
  const px = (x) => Math.round((x - x0) * ppmm);
  const py = (y) => Math.round((y - y0) * ppmm);

  const surf = new Uint8Array(W * H);
  const tone = new Float32Array(W * H);
  const toneN = new Float32Array(W * H);
  const r = Math.max(1, Math.round((rowPitch / 2) * ppmm));
  const r2 = r * r;
  for (let i = 0; i < pts.length; i += 3) {
    const cx = px(pts[i]); const cy = py(pts[i + 1]); const I = pts[i + 2];
    for (let dj = -r; dj <= r; dj += 1) {
      const jj = cy + dj; if (jj < 0 || jj >= H) continue;
      for (let di = -r; di <= r; di += 1) {
        if (di * di + dj * dj > r2) continue;
        const ii = cx + di; if (ii < 0 || ii >= W) continue;
        const k = jj * W + ii;
        surf[k] = 1; tone[k] += I; toneN[k] += 1;
      }
    }
  }
  for (let k = 0; k < W * H; k += 1) if (toneN[k]) tone[k] /= toneN[k];
  return {
    W, H, x0, y0, ppmm, surf, tone, px, py,
  };
}

/** Stamp every emitted path segment at the pen width into an ink mask sized
 * to match a raster already built by `rasterizeField`. */
function rasterizeInk(raster, paths, penWidth) {
  const {
    W, H, px, py, ppmm,
  } = raster;
  const ink = new Uint8Array(W * H);
  const r = Math.max(1, Math.round((penWidth / 2) * ppmm));
  const r2 = r * r;
  const dot = (i, j) => {
    for (let dj = -r; dj <= r; dj += 1) {
      const jj = j + dj; if (jj < 0 || jj >= H) continue;
      for (let di = -r; di <= r; di += 1) {
        if (di * di + dj * dj > r2) continue;
        const ii = i + di; if (ii < 0 || ii >= W) continue;
        ink[jj * W + ii] = 1;
      }
    }
  };
  (paths || []).forEach((pp) => {
    if (!Array.isArray(pp) || pp.length < 1) return;
    for (let i = 0; i < pp.length; i += 1) {
      const a = pp[i];
      if (i === 0) { dot(px(a.x), py(a.y)); continue; }
      const b = pp[i - 1];
      const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * ppmm));
      for (let t = 0; t <= n; t += 1) dot(px(b.x + (a.x - b.x) * (t / n)), py(b.y + (a.y - b.y) * (t / n)));
    }
  });
  return ink;
}

/** Two-pass chamfer distance transform (in px) from `mask===1`. */
function distanceTransform(W, H, mask) {
  const INF = 1e9;
  const d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k += 1) d[k] = mask[k] ? 0 : INF;
  const D1 = 1; const D2 = Math.SQRT2;
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const k = j * W + i; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + D1);
      if (j > 0) v = Math.min(v, d[k - W] + D1);
      if (i > 0 && j > 0) v = Math.min(v, d[k - W - 1] + D2);
      if (i < W - 1 && j > 0) v = Math.min(v, d[k - W + 1] + D2);
      d[k] = v;
    }
  }
  for (let j = H - 1; j >= 0; j -= 1) {
    for (let i = W - 1; i >= 0; i -= 1) {
      const k = j * W + i; let v = d[k];
      if (i < W - 1) v = Math.min(v, d[k + 1] + D1);
      if (j < H - 1) v = Math.min(v, d[k + W] + D1);
      if (i < W - 1 && j < H - 1) v = Math.min(v, d[k + W + 1] + D2);
      if (i > 0 && j < H - 1) v = Math.min(v, d[k + W - 1] + D2);
      d[k] = v;
    }
  }
  return d;
}

/** Core measurement over already-built raw masks — the piece the
 * instrument-correctness / mutation-proof tests exercise directly, without
 * running the renderer. */
function wedgeFromMasks({
  W, H, surf, tone, ink, rowPitch, ppmm, hi = HI_DEFAULT,
}) {
  const dist = distanceTransform(W, H, ink);
  let nShaded = 0; let nBare = 0; let nHi = 0; let nSurf = 0;
  let maxBareDist = 0;
  let wedgeCells = 0;
  const wedgeThreshMM = 0.25 * rowPitch;
  const toMM = (v) => v / ppmm;
  for (let k = 0; k < W * H; k += 1) {
    if (!surf[k]) continue;
    nSurf += 1;
    if (tone[k] >= hi) { nHi += 1; continue; }
    nShaded += 1;
    if (!ink[k]) {
      nBare += 1;
      const dMM = toMM(dist[k]);
      if (dMM > maxBareDist) maxBareDist = dMM;
      if (dMM >= wedgeThreshMM) wedgeCells += 1;
    }
  }
  return {
    surfacePx: nSurf,
    highlightPx: nHi,
    shadedPx: nShaded,
    barePx: nBare,
    bareFrac: nShaded ? nBare / nShaded : null,
    wedge25: nShaded ? wedgeCells / nShaded : null,
    holeMax: rowPitch ? (2 * maxBareDist) / rowPitch : null,
    rowPitch,
  };
}

/** End-to-end: build the raster from a real render's `tickField` + `paths`
 * + `penWidth`, then measure. */
function measureWedge({
  tickField, paths, penWidth, ppmm = PPMM_DEFAULT, hi = HI_DEFAULT,
}) {
  const raster = rasterizeField(tickField, ppmm);
  const ink = rasterizeInk(raster, paths, penWidth);
  return wedgeFromMasks({
    W: raster.W,
    H: raster.H,
    surf: raster.surf,
    tone: raster.tone,
    ink,
    rowPitch: tickField.rowPitch,
    ppmm,
    hi,
  });
}

/** The pre-existing per-site coverage metric (T2-2-review.md §2), from
 * `lastMarkStats.tickSites` ([I,R,P,drawn] flat quads). Reported for
 * continuity with the two rejected units — NOT a gate here (§1.3: it is
 * exactly the metric proven blind to a cross-row wedge). */
function siteCoverage(tickSites, hi = HI_DEFAULT) {
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

/** O5 — mean drawn tick length by radiance third, dark/light ratio. R1:
 * "ticks must have VARIABLE LENGTH, tick length carries tone." */
function lengthCarriesTone(lenByThird, cntByThird) {
  const meanByThird = lenByThird.map((v, i) => (cntByThird[i] ? v / cntByThird[i] : null));
  const [dark, mid, light] = meanByThird;
  const ratio = (dark != null && light != null && light > 0) ? dark / light : null;
  const monotone = dark != null && mid != null && light != null && dark >= mid && mid >= light;
  return { meanByThird, ratio, monotone };
}

module.exports = {
  PPMM_DEFAULT,
  HI_DEFAULT,
  rasterizeField,
  rasterizeInk,
  distanceTransform,
  wedgeFromMasks,
  measureWedge,
  siteCoverage,
  lengthCarriesTone,
};
