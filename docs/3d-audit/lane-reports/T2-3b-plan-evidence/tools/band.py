"""T2-3b planner — DIRECTIONAL BANDING INSTRUMENT.

bandC = max over orientation theta of the p95-p5 spread of the ink-density
profile projected onto axis n(theta), after (a) a Gaussian pre-smooth that
kills the row comb and individual ticks, and (b) a degree-3 2D polynomial
detrend that removes the INTENDED whole-object tone taper regardless of its
length scale (the scale-separation trick the T2-3b scout's sigma-subtraction
could not do on a 40mm object where taper and bands are only ~2.7x apart in
frequency).  Normalised by mean ink density so it is a contrast, not an
absolute ink number.
"""
import json, math, sys
import numpy as np
from scipy.ndimage import gaussian_filter, binary_closing, binary_erosion, binary_dilation

PPMM = 8.0
PEN = 0.3

def raster_ink(paths, x0, y0, W, H, ppmm=PPMM, pen=PEN):
    ink = np.zeros((H, W), np.float32)
    r = max(1, int(round(pen / 2 * ppmm)))
    yy, xx = np.mgrid[-r:r+1, -r:r+1]
    disc = (xx*xx + yy*yy) <= r*r
    for f in paths:
        xs = np.asarray(f[0::2], float); ys = np.asarray(f[1::2], float)
        if xs.size == 0: continue
        px = []; py = []
        if xs.size == 1:
            px = [xs[0]]; py = [ys[0]]
        else:
            for i in range(1, xs.size):
                n = max(1, int(math.ceil(math.hypot(xs[i]-xs[i-1], ys[i]-ys[i-1]) * ppmm)))
                t = np.linspace(0, 1, n+1)
                px.append(xs[i-1] + (xs[i]-xs[i-1])*t); py.append(ys[i-1] + (ys[i]-ys[i-1])*t)
            px = np.concatenate(px); py = np.concatenate(py)
        ix = np.round((np.asarray(px)-x0)*ppmm).astype(int)
        iy = np.round((np.asarray(py)-y0)*ppmm).astype(int)
        ok = (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
        ix, iy = ix[ok], iy[ok]
        for dy in range(-r, r+1):
            for dx in range(-r, r+1):
                if not disc[dy+r, dx+r]: continue
                jx = ix+dx; jy = iy+dy
                m = (jx >= 0)&(jx < W)&(jy >= 0)&(jy < H)
                ink[jy[m], jx[m]] = 1.0
    return ink

def object_mask(ink, rowpitch, ppmm=PPMM):
    close_r = int(round(1.2 * rowpitch * ppmm))
    er_r    = int(round(1.0 * rowpitch * ppmm))
    yy, xx = np.mgrid[-close_r:close_r+1, -close_r:close_r+1]
    se = (xx*xx+yy*yy) <= close_r*close_r
    m = binary_closing(ink > 0, structure=se)
    m = binary_dilation(m, structure=se)          # fill highlight voids
    m = binary_erosion(m, structure=se)
    yy, xx = np.mgrid[-er_r:er_r+1, -er_r:er_r+1]
    se2 = (xx*xx+yy*yy) <= er_r*er_r
    m = binary_erosion(m, structure=se2)
    return m

def norm_blur(field, mask, sigma_px):
    a = gaussian_filter(np.where(mask, field, 0.0).astype(np.float64), sigma_px, mode='constant')
    b = gaussian_filter(mask.astype(np.float64), sigma_px, mode='constant')
    return np.divide(a, b, out=np.zeros_like(a), where=b > 1e-6)

def poly_detrend(D, mask, deg=3):
    ys, xs = np.nonzero(mask)
    if xs.size < 40: return np.zeros_like(D), 0.0
    xc = (xs - xs.mean())/max(1.0, xs.std()); yc = (ys - ys.mean())/max(1.0, ys.std())
    cols = [xc**i * yc**j for i in range(deg+1) for j in range(deg+1-i)]
    A = np.stack(cols, 1)
    v = D[ys, xs]
    coef, *_ = np.linalg.lstsq(A, v, rcond=None)
    res = np.zeros_like(D); res[ys, xs] = v - A @ coef
    return res, float(v.mean())

def directional(res, mask, ppmm=PPMM, binmm=0.4, thetas=None):
    ys, xs = np.nonzero(mask)
    v = res[ys, xs]
    X = xs/ppmm; Y = ys/ppmm
    best = None
    if thetas is None: thetas = np.arange(0, 180, 1.0)
    for th in thetas:
        a = math.radians(th); nx, ny = math.cos(a), math.sin(a)
        s = X*nx + Y*ny
        b = np.floor((s - s.min())/binmm).astype(int)
        nb = b.max()+1
        cnt = np.bincount(b, minlength=nb)
        sm  = np.bincount(b, weights=v, minlength=nb)
        keep = cnt >= max(8, 0.25*cnt.max())
        if keep.sum() < 12: continue
        prof = sm[keep]/cnt[keep]
        spread = float(np.percentile(prof, 95) - np.percentile(prof, 5))
        if best is None or spread > best[0]:
            best = (spread, th, prof, binmm)
    return best

def dom_period(prof, binmm, lo_mm, hi_mm):
    p = prof - prof.mean()
    n = p.size
    if n < 8: return None
    w = np.hanning(n)
    F = np.abs(np.fft.rfft(p*w, n=max(256, 4*n)))
    N = max(256, 4*n)
    freqs = np.fft.rfftfreq(N, d=binmm)
    ok = (freqs > 1.0/hi_mm) & (freqs < 1.0/lo_mm)
    if not ok.any(): return None
    k = np.argmax(np.where(ok, F, -1))
    return float(1.0/freqs[k])

def measure(paths, mask, x0, y0, W, H, rowpitch, sigma_mm=2.0):
    ink = raster_ink(paths, x0, y0, W, H)
    D = norm_blur(ink, mask, sigma_mm*PPMM)
    mean_ink = float(D[mask].mean())
    res, _ = poly_detrend(D, mask, deg=3)
    best = directional(res, mask)
    if best is None or mean_ink <= 0: return None
    spread, th, prof, binmm = best
    per = dom_period(prof, binmm, 1.5*rowpitch, 9.0*rowpitch)
    return dict(bandC=spread/mean_ink, bandAbs=spread, theta=th, periodMm=per,
                meanInk=mean_ink, inkPx=int((ink > 0).sum()), maskPx=int(mask.sum()))
