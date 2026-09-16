/**
 * T2-3b — the DIRECTIONAL BANDING INSTRUMENT for mkTick's CONTOUR-mapper
 * moiré. `docs/3d-audit/lane-reports/T2-3b-plan.md` §1, a JS port of the
 * plan's own `T2-3b-plan-evidence/tools/band.py` (that file is the reference
 * implementation and the two must be read together).
 *
 * WHY THIS EXISTS, AND WHY THE SCOUT'S VERSION READ BACKWARDS. The T2-3
 * moiré review photographed broad diagonal light/dark sweeps across
 * `sphere/contour` and `cone/contour` (`T2-3-review.md` §7, "the new
 * diagonal banding is real"). An earlier scout tried to measure it by
 * subtracting a spatial Gaussian (sigma ~= 3x rowPitch) from the RAW local
 * ink density and read the metric BACKWARDS (preferring the banded tree)
 * because on these 40-57mm objects there is no scale separation between the
 * intended whole-object tone taper (~40mm) and the bands (12-22mm, only
 * ~2.7x apart in frequency) — a Gaussian subtraction cannot split them —
 * and because with no LOW-PASS on the signal side, the 4.5mm row comb and
 * individual-tick granularity survive into the "residual" and dominate it,
 * which differs hugely between `chan:'count'` (near-solid abutting ticks)
 * and `chan:'len'` (thin dotted lines) for reasons that have nothing to do
 * with banding.
 *
 * THIS INSTRUMENT, INSTEAD:
 *   1. Rasterises the algorithm's own returned vector paths (mm) at
 *      PPMM px/mm, pen width `penMm` — no browser, no `.webp`, no
 *      `tickField` dependency, so it works identically on any tree.
 *   2. Builds an OBJECT MASK from the ink via morphological closing (fills
 *      the ~4.5mm row gaps into one silhouette) then erodes a full row pitch
 *      inward so nothing is read at the silhouette edge. Closing is
 *      idempotent, so one closing pass is exact, not an approximation of the
 *      plan's double-closing Python (`close`, then `dilate+erode` again with
 *      the SAME structuring element is provably a no-op — closing(closing(x))
 *      == closing(x) for any structuring element).
 *   3. LOW-PASSES first (normalised Gaussian blur, sigma1 = 0.45*rowPitch by
 *      default at PPMM=8, attenuating the 4.5mm row comb by ~x0.02 while
 *      passing a 15mm band at ~x0.70) — this is the step that fixes the
 *      scout's failure.
 *   4. Detrends with a DEGREE-3 2D POLYNOMIAL least-squares fit over the
 *      mask, subtracted. This removes the intended whole-object tone taper
 *      REGARDLESS of its length scale (it is smooth and low-order) and
 *      cannot absorb a 2-4-cycle oscillation.
 *   5. Scans direction theta = 0..179 in 1 degree steps, projects the
 *      residual onto axis n(theta), bins at 0.4mm, keeps bins with >= 25% of
 *      the max bin population, and takes p95-p5 of the resulting 1-D
 *      profile. `bandC` = max-over-theta of that spread, divided by mean ink
 *      density over the mask (a dimensionless contrast). `theta*` is the
 *      argmax (the axis PERPENDICULAR to the bands); the period comes from a
 *      direct frequency-domain scan of the profile at theta*, restricted to
 *      lambda in [1.5, 9] x rowPitch (this port uses a direct Goertzel-style
 *      sum over candidate periods rather than an FFT — equivalent for a
 *      frequency range this narrow, and needs no FFT library).
 *
 * Non-vacuity (recovers injected angle to +/-1 deg and period to +/-1mm on
 * synthetic bands; does not trip on the clean pre tree or an ink-matched
 * random-path-drop control) is proved in the test file's own instrument-
 * correctness block, mirroring `wedgeFromMasks`'s own synthetic tests.
 */

const PPMM_DEFAULT = 8;
const PEN_DEFAULT = 0.3;

/** Rasterise path segments (array of point-arrays, `[{x,y}, ...]`, mm) into
 * a binary ink mask at `ppmm` px/mm, pen width `penMm`. Returns the raster
 * plus the mm-space origin of pixel (0,0), so callers can convert back. */
function rasterInk(paths, { ppmm = PPMM_DEFAULT, penMm = PEN_DEFAULT, padMm = 5 } = {}) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  (paths || []).forEach((pp) => {
    (pp || []).forEach((pt) => {
      if (pt.x < x0) x0 = pt.x; if (pt.x > x1) x1 = pt.x;
      if (pt.y < y0) y0 = pt.y; if (pt.y > y1) y1 = pt.y;
    });
  });
  if (!Number.isFinite(x0)) return null;
  x0 -= padMm; y0 -= padMm; x1 += padMm; y1 += padMm;
  const W = Math.max(1, Math.ceil((x1 - x0) * ppmm));
  const H = Math.max(1, Math.ceil((y1 - y0) * ppmm));
  const ink = new Uint8Array(W * H);
  const r = Math.max(1, Math.round((penMm / 2) * ppmm));
  const r2 = r * r;
  const px = (x) => Math.round((x - x0) * ppmm);
  const py = (y) => Math.round((y - y0) * ppmm);
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
  return {
    W, H, x0, y0, ppmm, ink,
  };
}

/** Two-pass chamfer (approximate Euclidean) distance transform, in px, from
 * `mask===1`. Identical algorithm to `scene3d-mktick-wedge.js`'s own
 * `distanceTransform` (duplicated here so this file has no dependency on
 * that one — the two instruments are independent). */
function chamferDistance(W, H, mask) {
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

const dilateMask = (W, H, mask, rPx) => {
  const dt = chamferDistance(W, H, mask);
  const out = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k += 1) out[k] = dt[k] <= rPx ? 1 : 0;
  return out;
};

const erodeMask = (W, H, mask, rPx) => {
  const inv = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k += 1) inv[k] = mask[k] ? 0 : 1;
  const dt = chamferDistance(W, H, inv);
  const out = new Uint8Array(W * H);
  for (let k = 0; k < W * H; k += 1) out[k] = dt[k] > rPx ? 1 : 0;
  return out;
};

/** Object mask: closing(ink, 1.2*rowPitch) then eroded 1.0*rowPitch inward,
 * so nothing is read at the silhouette edge. `band.py`'s second
 * dilate+erode with the SAME structuring element after the closing is a
 * no-op (closing is idempotent) and is intentionally omitted here. */
function objectMask(W, H, ink, rowPitchMm, ppmm) {
  const closeR = Math.round(1.2 * rowPitchMm * ppmm);
  const erR = Math.round(1.0 * rowPitchMm * ppmm);
  const closed = erodeMask(W, H, dilateMask(W, H, ink, closeR), closeR);
  return erodeMask(W, H, closed, erR);
}

/** Separable Gaussian blur, normalised-convolution style: returns
 * blur(field*mask) / blur(mask), zero where the denominator is negligible.
 * `sigmaPx` is the Gaussian sigma in pixels. */
function normBlur(field, mask, W, H, sigmaPx) {
  const radius = Math.max(1, Math.ceil(3 * sigmaPx));
  const kernel = new Float64Array(2 * radius + 1);
  let ksum = 0;
  for (let i = -radius; i <= radius; i += 1) {
    const v = Math.exp(-(i * i) / (2 * sigmaPx * sigmaPx));
    kernel[i + radius] = v; ksum += v;
  }
  for (let i = 0; i < kernel.length; i += 1) kernel[i] /= ksum;

  const num0 = new Float64Array(W * H);
  const den0 = new Float64Array(W * H);
  for (let k = 0; k < W * H; k += 1) { num0[k] = field[k] * mask[k]; den0[k] = mask[k]; }

  const convH = (src) => {
    const out = new Float64Array(W * H);
    for (let j = 0; j < H; j += 1) {
      const row = j * W;
      for (let i = 0; i < W; i += 1) {
        let acc = 0;
        for (let t = -radius; t <= radius; t += 1) {
          const ii = i + t; if (ii < 0 || ii >= W) continue;
          acc += src[row + ii] * kernel[t + radius];
        }
        out[row + i] = acc;
      }
    }
    return out;
  };
  const convV = (src) => {
    const out = new Float64Array(W * H);
    for (let i = 0; i < W; i += 1) {
      for (let j = 0; j < H; j += 1) {
        let acc = 0;
        for (let t = -radius; t <= radius; t += 1) {
          const jj = j + t; if (jj < 0 || jj >= H) continue;
          acc += src[jj * W + i] * kernel[t + radius];
        }
        out[j * W + i] = acc;
      }
    }
    return out;
  };

  const num = convV(convH(num0));
  const den = convV(convH(den0));
  const out = new Float64Array(W * H);
  for (let k = 0; k < W * H; k += 1) out[k] = den[k] > 1e-6 ? num[k] / den[k] : 0;
  return out;
}

/** Degree-3 2D polynomial least-squares fit over `mask`, subtracted from
 * `D`. Coordinates are centred/scaled (mean 0, std 1) before fitting, as
 * `band.py` does, so the fit is numerically well-conditioned regardless of
 * the object's absolute size or position. Returns the residual field
 * (zero outside the mask). */
function polyDetrend(D, mask, W, H, deg = 3) {
  const xs = []; const ys = []; const vs = [];
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const k = j * W + i;
      if (mask[k]) { xs.push(i); ys.push(j); vs.push(D[k]); }
    }
  }
  const n = xs.length;
  const res = new Float64Array(W * H);
  if (n < 40) return res;
  let mx = 0; let my = 0;
  for (let t = 0; t < n; t += 1) { mx += xs[t]; my += ys[t]; }
  mx /= n; my /= n;
  let sx = 0; let sy = 0;
  for (let t = 0; t < n; t += 1) { sx += (xs[t] - mx) ** 2; sy += (ys[t] - my) ** 2; }
  sx = Math.max(1, Math.sqrt(sx / n)); sy = Math.max(1, Math.sqrt(sy / n));

  // Monomial terms xc^p * yc^q for p+q <= deg (10 terms at deg=3).
  const terms = [];
  for (let p = 0; p <= deg; p += 1) {
    for (let q = 0; q <= deg - p; q += 1) terms.push([p, q]);
  }
  const m = terms.length;
  const ATA = new Float64Array(m * m);
  const ATv = new Float64Array(m);
  const feat = new Float64Array(m);
  for (let t = 0; t < n; t += 1) {
    const xc = (xs[t] - mx) / sx; const yc = (ys[t] - my) / sy;
    for (let a = 0; a < m; a += 1) {
      const [p, q] = terms[a];
      feat[a] = (xc ** p) * (yc ** q);
    }
    for (let a = 0; a < m; a += 1) {
      ATv[a] += feat[a] * vs[t];
      for (let b = 0; b < m; b += 1) ATA[a * m + b] += feat[a] * feat[b];
    }
  }
  // Solve ATA * coef = ATv via Gaussian elimination with partial pivoting.
  const A = ATA.slice();
  const bvec = ATv.slice();
  for (let col = 0; col < m; col += 1) {
    let piv = col;
    for (let row = col + 1; row < m; row += 1) {
      if (Math.abs(A[row * m + col]) > Math.abs(A[piv * m + col])) piv = row;
    }
    if (piv !== col) {
      for (let c2 = 0; c2 < m; c2 += 1) {
        const tmp = A[col * m + c2]; A[col * m + c2] = A[piv * m + c2]; A[piv * m + c2] = tmp;
      }
      const tb = bvec[col]; bvec[col] = bvec[piv]; bvec[piv] = tb;
    }
    const pv = A[col * m + col];
    if (Math.abs(pv) < 1e-12) continue;
    for (let row = col + 1; row < m; row += 1) {
      const f = A[row * m + col] / pv;
      if (f === 0) continue;
      for (let c2 = col; c2 < m; c2 += 1) A[row * m + c2] -= f * A[col * m + c2];
      bvec[row] -= f * bvec[col];
    }
  }
  const coef = new Float64Array(m);
  for (let row = m - 1; row >= 0; row -= 1) {
    let s = bvec[row];
    for (let c2 = row + 1; c2 < m; c2 += 1) s -= A[row * m + c2] * coef[c2];
    coef[row] = Math.abs(A[row * m + row]) > 1e-12 ? s / A[row * m + row] : 0;
  }
  for (let t = 0; t < n; t += 1) {
    const xc = (xs[t] - mx) / sx; const yc = (ys[t] - my) / sy;
    let fit = 0;
    for (let a = 0; a < m; a += 1) {
      const [p, q] = terms[a];
      fit += coef[a] * (xc ** p) * (yc ** q);
    }
    res[ys[t] * W + xs[t]] = vs[t] - fit;
  }
  return res;
}

/** Direction scan: for theta = 0..179 (1deg steps), project mask-pixel
 * residuals onto axis n(theta), bin at `binMm`, keep bins with
 * >= max(8, 0.25*maxCount) samples, take p95-p5 of the bin-mean profile.
 * Returns the argmax {spread, thetaDeg, prof, binMm} or null. */
function directionalScan(res, mask, W, H, ppmm, binMm = 0.4) {
  const xs = []; const ys = []; const vs = [];
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const k = j * W + i;
      if (mask[k]) { xs.push(i / ppmm); ys.push(j / ppmm); vs.push(res[k]); }
    }
  }
  const n = xs.length;
  if (n < 40) return null;
  let best = null;
  for (let thetaDeg = 0; thetaDeg < 180; thetaDeg += 1) {
    const a = (thetaDeg * Math.PI) / 180;
    const nx = Math.cos(a); const ny = Math.sin(a);
    let smin = Infinity;
    const s = new Float64Array(n);
    for (let t = 0; t < n; t += 1) {
      const v = xs[t] * nx + ys[t] * ny;
      s[t] = v; if (v < smin) smin = v;
    }
    const binIdx = new Int32Array(n);
    let nb = 0;
    for (let t = 0; t < n; t += 1) {
      const b = Math.floor((s[t] - smin) / binMm);
      binIdx[t] = b; if (b + 1 > nb) nb = b + 1;
    }
    const cnt = new Float64Array(nb);
    const sum = new Float64Array(nb);
    for (let t = 0; t < n; t += 1) { cnt[binIdx[t]] += 1; sum[binIdx[t]] += vs[t]; }
    let maxCnt = 0;
    for (let b = 0; b < nb; b += 1) if (cnt[b] > maxCnt) maxCnt = cnt[b];
    const thresh = Math.max(8, 0.25 * maxCnt);
    const prof = [];
    for (let b = 0; b < nb; b += 1) if (cnt[b] >= thresh) prof.push(sum[b] / cnt[b]);
    if (prof.length < 12) continue;
    const sorted = prof.slice().sort((p1, p2) => p1 - p2);
    const pct = (p) => {
      const idx = p * (sorted.length - 1);
      const lo = Math.floor(idx); const hi = Math.ceil(idx);
      if (lo === hi) return sorted[lo];
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };
    const spread = pct(0.95) - pct(0.05);
    if (!best || spread > best.spread) best = { spread, thetaDeg, prof, binMm };
  }
  return best;
}

/** Period recovery: a direct (Goertzel-style) frequency-domain scan over
 * candidate periods in [loMm, hiMm], no FFT dependency needed for a range
 * this narrow. Returns the period (mm) whose sinusoidal power is highest,
 * or null. */
function dominantPeriod(prof, binMm, loMm, hiMm, stepMm = 0.1) {
  const n = prof.length;
  if (n < 8) return null;
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += prof[i];
  mean /= n;
  const centred = prof.map((v) => v - mean);
  // Hann window, as band.py does before its FFT.
  const win = centred.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))));
  let bestPeriod = null; let bestPower = -1;
  for (let p = loMm; p <= hiMm; p += stepMm) {
    const f = 1 / p;
    let re = 0; let im = 0;
    for (let i = 0; i < n; i += 1) {
      const phase = 2 * Math.PI * f * (i * binMm);
      re += win[i] * Math.cos(phase);
      im += win[i] * Math.sin(phase);
    }
    const power = re * re + im * im;
    if (power > bestPower) { bestPower = power; bestPeriod = p; }
  }
  return bestPeriod;
}

/** End-to-end: `measure(paths, { rowPitch, sigmaMm, ppmm, penMm })` ->
 * `{ bandC, thetaDeg, periodMm, meanInk, maskPx, inkPx }`, or `null` if the
 * object mask is degenerate (too few pixels to fit a trend / scan a
 * direction). */
function measure(paths, {
  rowPitch, sigmaMm = 2.0, ppmm = PPMM_DEFAULT, penMm = PEN_DEFAULT,
} = {}) {
  const r = rasterInk(paths, { ppmm, penMm });
  if (!r) return null;
  const {
    W, H, ink,
  } = r;
  const mask = objectMask(W, H, ink, rowPitch, ppmm);
  let maskPx = 0; let inkPx = 0;
  for (let k = 0; k < W * H; k += 1) { if (mask[k]) maskPx += 1; if (ink[k]) inkPx += 1; }
  if (maskPx < 40) return null;
  const D = normBlur(ink, mask, W, H, sigmaMm * ppmm);
  let sum = 0;
  for (let k = 0; k < W * H; k += 1) if (mask[k]) sum += D[k];
  const meanInk = sum / maskPx;
  if (meanInk <= 0) return null;
  const res = polyDetrend(D, mask, W, H, 3);
  const best = directionalScan(res, mask, W, H, ppmm, 0.4);
  if (!best) return null;
  const periodMm = dominantPeriod(best.prof, best.binMm, 1.5 * rowPitch, 9.0 * rowPitch);
  return {
    bandC: best.spread / meanInk,
    thetaDeg: best.thetaDeg,
    periodMm,
    meanInk,
    maskPx,
    inkPx,
  };
}

/** Intersect two masks pixel-for-pixel over the SAME raster grid — used to
 * compare pre-vs-post on identical populations (standing rule 6). Both
 * rasters must share `{W,H,x0,y0,ppmm}` (same fixture, same padding). */
function intersectMasks(a, b) {
  if (a.length !== b.length) throw new Error('intersectMasks: length mismatch — rasters not aligned');
  const out = new Uint8Array(a.length);
  for (let k = 0; k < a.length; k += 1) out[k] = a[k] && b[k] ? 1 : 0;
  return out;
}

module.exports = {
  PPMM_DEFAULT,
  PEN_DEFAULT,
  rasterInk,
  chamferDistance,
  dilateMask,
  erodeMask,
  objectMask,
  normBlur,
  polyDetrend,
  directionalScan,
  dominantPeriod,
  measure,
  intersectMasks,
};
