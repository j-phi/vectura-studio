/*
 * Animated "draw-on" SVG builder (Pendula studio, Phase 4).
 *
 * Produces a self-contained SVG where the artwork draws itself on a loop using
 * SMIL stroke-dashoffset animation — a shareable artifact that shows the pen
 * tracing the figure. This is a SEPARATE export from the canonical plotter SVG
 * (which must stay clean, static, plotter-ready); <animate> is a screen-only
 * artifact a pen plotter ignores.
 *
 * Pure + DOM-free so it unit-tests standalone. Each polyline is drawn in
 * sequence by cumulative length over `durationSec`, then the whole sequence
 * repeats (repeatCount indefinite) so it loops.
 *
 * window.Vectura.AnimatedSvg.buildDrawOn(polylines, opts)
 *   polylines : Array<Array<{x,y}>>   (the export geometry, line mode)
 *   opts: { width, height, stroke, strokeWidth, durationSec, precision, background }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  const round = (v, p) => {
    const f = Math.pow(10, p);
    return Math.round(v * f) / f;
  };

  const polylineLength = (pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return len;
  };

  const pointsToPathD = (pts, p) =>
    pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${round(pt.x, p)} ${round(pt.y, p)}`).join(' ');

  const buildDrawOn = (polylines, opts = {}) => {
    const width = opts.width ?? 100;
    const height = opts.height ?? 100;
    const stroke = opts.stroke ?? 'black';
    const strokeWidth = opts.strokeWidth ?? 0.3;
    const durationSec = Math.max(0.1, opts.durationSec ?? 8);
    const p = Number.isFinite(opts.precision) ? opts.precision : 2;
    const background = opts.background || null;

    const segs = (polylines || [])
      .filter((pts) => Array.isArray(pts) && pts.length > 1)
      .map((pts) => ({ pts, len: polylineLength(pts) }))
      .filter((s) => s.len > 0);

    const total = segs.reduce((a, s) => a + s.len, 0) || 1;

    let acc = 0;
    const paths = segs.map((s) => {
      const d = pointsToPathD(s.pts, p);
      const L = round(s.len, p);
      const beginFrac = acc / total;          // fraction of the loop when this path starts drawing
      acc += s.len;
      const endFrac = acc / total;            // fraction when it finishes
      // Each path runs one shared `durationSec` loop: hold undrawn (offset=L)
      // until its slot, draw to 0 across [beginFrac,endFrac], hold drawn (0)
      // until the loop end, then repeat. keyTimes must start at 0 and end at 1.
      const kBegin = round(beginFrac, 4);
      const kEnd = Math.max(kBegin, round(endFrac, 4));
      // Gap MUST be strictly > the dash length. A single dasharray value is
      // auto-duplicated by SVG into "L L" (period 2L), which lands a dash
      // boundary exactly on the path endpoint during the holding states; with
      // stroke-linecap="round" that renders a stray dot at each line end. A
      // larger gap pushes the next dash past the path so no endpoint dot forms.
      const gap = round(s.len + 1, p);
      return (
        `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" ` +
        `stroke-linecap="round" stroke-linejoin="round" ` +
        `stroke-dasharray="${L} ${gap}" stroke-dashoffset="${L}">` +
        `<animate attributeName="stroke-dashoffset" values="${L};${L};0;0" ` +
        `keyTimes="0;${kBegin};${kEnd};1" ` +
        `dur="${durationSec}s" repeatCount="indefinite" calcMode="linear" />` +
        `</path>`
      );
    });

    const bg = background ? `<rect x="0" y="0" width="${width}" height="${height}" fill="${background}" />` : '';
    return (
      `<?xml version="1.0" standalone="no"?>` +
      `<svg width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
      bg +
      `<g fill="none">${paths.join('')}</g>` +
      `</svg>`
    );
  };

  Vectura.AnimatedSvg = { buildDrawOn, polylineLength };
})();
