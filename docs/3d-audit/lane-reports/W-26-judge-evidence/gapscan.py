"""Image-space drawn-gap analysis for W-26 judge.

For a rendered cell, scan lines PERPENDICULAR to the ruling direction through the
object interior and measure the WHITE (paper) gaps between consecutive inked
runs. This is what the user's eye sees: "irregular gaps".
"""
import sys, os, math, statistics
from PIL import Image

SP = '/private/tmp/claude-501/-Users-jayphi-Documents-github-vectura-studio/f704cbd6-35ca-465f-9186-5c18a39c1856/scratchpad'


def ink_mask(im, thresh=110):
    g = im.convert('L')
    w, h = g.size
    px = g.load()
    # dark background render: ink is BRIGHT. detect polarity from corner
    corner = px[1, 1]
    bright_ink = corner < 128
    m = [[False] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            v = px[x, y]
            m[y][x] = (v > 150) if bright_ink else (v < thresh)
    return m, w, h


def scan_gaps(mask, w, h, angle_deg, n_lines=40, frac_lo=0.25, frac_hi=0.75):
    """Rotate the sample direction: walk lines at `angle_deg`+90 (perpendicular
    to the rulings) and collect white gaps between inked runs."""
    a = math.radians(angle_deg + 90.0)
    dx, dy = math.cos(a), math.sin(a)
    # perpendicular offsets for the family of scan lines
    px_, py_ = -dy, dx
    cx, cy = w / 2.0, h / 2.0
    diag = math.hypot(w, h)
    all_gaps = []
    per_line = []
    for k in range(n_lines):
        t = (k + 0.5) / n_lines
        off = (t - 0.5) * diag * 0.55
        ox, oy = cx + px_ * off, cy + py_ * off
        hits = []
        s = -diag / 2
        prev = False
        step = 0.5
        while s < diag / 2:
            x = int(round(ox + dx * s)); y = int(round(oy + dy * s))
            if 0 <= x < w and 0 <= y < h:
                cur = mask[y][x]
                if cur and not prev:
                    hits.append(s)
                prev = cur
            else:
                prev = False
            s += step
        if len(hits) < 4:
            continue
        # interior only
        g = [hits[i] - hits[i - 1] for i in range(1, len(hits))]
        g = [v for v in g if v > 1.5]  # ignore double-hit on one thick stroke
        if len(g) < 3:
            continue
        per_line.append(g)
        all_gaps.extend(g)
    return all_gaps, per_line


def stats(gaps, per_line):
    if len(gaps) < 4:
        return None
    gs = sorted(gaps)
    def q(p):
        i = min(len(gs) - 1, max(0, int(round(p * (len(gs) - 1)))))
        return gs[i]
    agj = []
    for g in per_line:
        for i in range(1, len(g)):
            agj.append(max(g[i] / g[i - 1], g[i - 1] / g[i]))
    return {
        'n': len(gs),
        'p05': round(q(0.05), 1), 'p25': round(q(0.25), 1),
        'med': round(q(0.5), 1), 'p75': round(q(0.75), 1), 'p95': round(q(0.95), 1),
        'p95_p05': round(q(0.95) / q(0.05), 2) if q(0.05) > 0 else None,
        'p75_p25': round(q(0.75) / q(0.25), 2) if q(0.25) > 0 else None,
        'agj_med': round(statistics.median(agj), 2) if agj else None,
        'agj_p90': round(sorted(agj)[int(0.9 * (len(agj) - 1))], 2) if agj else None,
    }


CELLS = [
    ('A', 'ellipsoid__contour__ladder__med__a', 0),
    ('A', 'ellipsoid__contour__ladder__max__a', 0),
    ('A', 'ellipsoid__contour__ladder__low__a', 0),
    ('A', 'cylinder__contour__ladder__med__a', 0),
    ('A', 'cylinder__crosshatch__ladder__med__a', 45),
    ('A', 'cylinder__crosshatch__ladder__max__a', 45),
    ('A', 'cylinder__crosshatch__ladder__low__a', 45),
    ('A', 'ellipsoid__crosshatch__ladder__med__a', 45),
    ('A', 'sphere__contour__ladder__med__a', 0),
    ('A', 'sphere__hatch__ladder__med__a', 45),
    ('B', 'cone__contour__fineLadder__med__a', 0),
    ('B', 'cone__contour__fineLadder__max__a', 0),
    ('B', 'cone__contour__phaseFineLadder__med__a', 0),
    ('B', 'cone__contour__phaseFineLadder__max__a', 0),
    ('B', 'sphere__contour__fineLadder__med__a', 0),
    ('B', 'sphere__hatch__fineLadder__med__a', 45),
    ('B', 'sphere__hatch__phaseFineLadder__med__a', 45),
    ('B', 'sphere__hatch__phaseFineLadder__max__a', 45),
]

hdr = f"{'cell':46s} {'tree':7s} {'n':>4s} {'p05':>6s} {'med':>6s} {'p95':>6s} {'p95/p05':>7s} {'p75/p25':>7s} {'agjMed':>6s} {'agjP90':>6s}"
print(hdr)
print('-' * len(hdr))
for tier, name, ang in CELLS:
    row = {}
    for t in ('before', 'after'):
        p = f'{SP}/shots-{t}/shots/{tier}/{name}.webp'
        if not os.path.exists(p):
            continue
        im = Image.open(p)
        m, w, h = ink_mask(im)
        gaps, per_line = scan_gaps(m, w, h, ang)
        st = stats(gaps, per_line)
        row[t] = st
        if st:
            print(f"{name:46s} {t:7s} {st['n']:4d} {st['p05']:6.1f} {st['med']:6.1f} {st['p95']:6.1f} "
                  f"{st['p95_p05']:7.2f} {st['p75_p25']:7.2f} {st['agj_med']:6.2f} {st['agj_p90']:6.2f}")
    print()
