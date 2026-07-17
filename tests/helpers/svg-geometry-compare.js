'use strict';

/*
 * Compare two exported SVGs as GEOMETRY within a tolerance — not as exact strings.
 *
 * Why: the curve system fits cubics with a least-squares fit whose segmentation is
 * driven by corner detection (an angle threshold) and RDP decimation (an error
 * threshold). Both are float-sensitive: microscopic rounding differences between
 * macOS arm64 and CI's Linux x64 flip a threshold, so the two platforms legitimately
 * place DIFFERENT anchors — different count, different control points — for the same
 * visual curve. A byte-exact baseline therefore fails on whichever platform did not
 * record it (which is exactly how these baselines failed on CI while passing on Mac).
 *
 * This compares what a path DRAWS, not how it is spelled: each element is flattened
 * to points and arc-length-resampled to a fixed count, so two curves that trace the
 * same shape with different anchorings line up and compare equal within tolerance,
 * while a real regression (a path added/removed, an element type changed, or geometry
 * that moved well beyond float noise) still fails. Structural coverage — "curves are
 * actually emitted", "the toggle is live" — stays with the ratchet tests that already
 * assert it; this function owns geometric equivalence only.
 */

const SAMPLES_PER_SEG = 8; // fixed sub-samples per curve segment (deterministic count)
const RESAMPLE_N = 64; // arc-length resample target — aligns differing anchor counts
const CIRCLE_SAMPLES = 64;

const num = (s) => parseFloat(s);

// ---- element extraction -----------------------------------------------------

const attrOf = (markup, name) => {
  const m = markup.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};

// Ordered list of drawable elements: { kind, points:[{x,y}...] } (pre-resample).
const extractElements = (svg) => {
  const els = [];
  const re = /<(path|circle|ellipse)\b([^>]*?)\/?>/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    const kind = m[1];
    const markup = m[2];
    if (kind === 'path') {
      const d = attrOf(markup, 'd');
      if (d) els.push({ kind, points: flattenPathData(d) });
    } else if (kind === 'circle') {
      els.push({ kind, points: sampleCircle(num(attrOf(markup, 'cx')), num(attrOf(markup, 'cy')), num(attrOf(markup, 'r'))) });
    } else if (kind === 'ellipse') {
      els.push({
        kind,
        points: sampleEllipse(
          num(attrOf(markup, 'cx')), num(attrOf(markup, 'cy')),
          num(attrOf(markup, 'rx')), num(attrOf(markup, 'ry'))
        ),
      });
    }
  }
  return els;
};

// ---- flattening -------------------------------------------------------------

const cubicAt = (p0, c1, c2, p1, t) => {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
};

const quadAt = (p0, c, p1, t) => {
  const u = 1 - t;
  const a = u * u, b = 2 * u * t, d = t * t;
  return { x: a * p0.x + b * c.x + d * p1.x, y: a * p0.y + b * c.y + d * p1.y };
};

// Tokenize an absolute-command path (M L C Q Z, as the exporter emits) into a dense
// polyline. Subpaths are concatenated in order — deterministic on both platforms.
const flattenPathData = (d) => {
  const tokens = d.match(/[MLCQZ]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  const pts = [];
  let i = 0;
  let cur = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  const readPt = () => ({ x: parseFloat(tokens[i++]), y: parseFloat(tokens[i++]) });

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === 'M') {
      cur = readPt(); start = cur; pts.push(cur);
    } else if (cmd === 'L') {
      cur = readPt(); pts.push(cur);
    } else if (cmd === 'C') {
      const c1 = readPt(), c2 = readPt(), p1 = readPt();
      for (let s = 1; s <= SAMPLES_PER_SEG; s++) pts.push(cubicAt(cur, c1, c2, p1, s / SAMPLES_PER_SEG));
      cur = p1;
    } else if (cmd === 'Q') {
      const c = readPt(), p1 = readPt();
      for (let s = 1; s <= SAMPLES_PER_SEG; s++) pts.push(quadAt(cur, c, p1, s / SAMPLES_PER_SEG));
      cur = p1;
    } else if (cmd === 'Z') {
      pts.push(start); cur = start;
    }
    // Unknown token (stray number without a command): skip to avoid an infinite loop.
    else if (!/[MLCQZ]/i.test(cmd)) { /* skip */ }
  }
  return pts;
};

const sampleCircle = (cx, cy, r) => {
  const pts = [];
  for (let k = 0; k <= CIRCLE_SAMPLES; k++) {
    const a = (k / CIRCLE_SAMPLES) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
};

const sampleEllipse = (cx, cy, rx, ry) => {
  const pts = [];
  for (let k = 0; k <= CIRCLE_SAMPLES; k++) {
    const a = (k / CIRCLE_SAMPLES) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
};

// ---- arc-length resample ----------------------------------------------------

// Resample a polyline to exactly n points spaced evenly by arc length, so two
// polylines describing the same shape with different point counts become directly
// comparable index-by-index.
const resample = (pts, n) => {
  if (pts.length === 0) return [];
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0] }));

  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: n }, () => ({ ...pts[0] }));

  const out = [];
  let seg = 1;
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total;
    while (seg < pts.length - 1 && cum[seg] < target) seg++;
    const segLen = cum[seg] - cum[seg - 1] || 1;
    const f = (target - cum[seg - 1]) / segLen;
    out.push({
      x: pts[seg - 1].x + (pts[seg].x - pts[seg - 1].x) * f,
      y: pts[seg - 1].y + (pts[seg].y - pts[seg - 1].y) * f,
    });
  }
  return out;
};

const bboxDiag = (pts) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return 0;
  return Math.hypot(maxX - minX, maxY - minY);
};

// ---- comparison -------------------------------------------------------------

/*
 * Returns { ok, reason }. `ok` is true when the two SVGs are geometrically
 * equivalent within tolerance. Tolerance is per element: max(absTol, relTol * the
 * element's bbox diagonal), so it scales with the figure and never collapses to
 * zero on a tiny one. Defaults comfortably exceed the observed cross-platform drift
 * (~1 unit on a ~200-unit canvas) while staying far below a real regression.
 */
const compareSvgGeometry = (actual, baseline, opts = {}) => {
  const absTol = opts.absTol ?? 4.0;
  const relTol = opts.relTol ?? 0.03;
  const n = opts.resampleN ?? RESAMPLE_N;

  const a = extractElements(actual);
  const b = extractElements(baseline);

  if (a.length !== b.length) {
    return { ok: false, reason: `element count differs: actual ${a.length}, baseline ${b.length}` };
  }

  for (let e = 0; e < a.length; e++) {
    if (a[e].kind !== b[e].kind) {
      return { ok: false, reason: `element ${e} kind differs: actual <${a[e].kind}>, baseline <${b[e].kind}>` };
    }
    const ra = resample(a[e].points, n);
    const rb = resample(b[e].points, n);
    if (ra.length !== rb.length) {
      return { ok: false, reason: `element ${e} could not be resampled comparably` };
    }
    const tol = Math.max(absTol, relTol * bboxDiag(b[e].points));
    for (let k = 0; k < ra.length; k++) {
      const dist = Math.hypot(ra[k].x - rb[k].x, ra[k].y - rb[k].y);
      if (dist > tol) {
        return {
          ok: false,
          reason: `element ${e} (<${a[e].kind}>) point ${k} off by ${dist.toFixed(2)} > tol ${tol.toFixed(2)} `
            + `(actual ${ra[k].x.toFixed(1)},${ra[k].y.toFixed(1)} vs baseline ${rb[k].x.toFixed(1)},${rb[k].y.toFixed(1)})`,
        };
      }
    }
  }
  return { ok: true, reason: '' };
};

module.exports = { compareSvgGeometry, extractElements, flattenPathData, resample };
