/*
 * SVG serialization for the visual baselines.
 *
 * The branch decision ("cubic, verbatim, or quadratic?") is NOT restated here:
 * it is PathDraw.commands, the single source of truth shared with
 * renderer.tracePath and the production SVG exporters. Only the FORMATTING is
 * local — the baselines are byte-compared and use a tighter spelling than
 * PathDraw.toSvgD ('M1 2', no space after the command letter).
 *
 * `useCurves: false` is deliberate and matches the callers: the baseline tests
 * invoke Algorithms[type].generate() directly and never pass a `curves` flag,
 * so a path here draws as native cubics only via its own meta.forceCurves
 * opt-in, and as a verbatim polyline otherwise.
 */
const PathDraw = require('../../src/core/path-draw.js');

const fmt = (value, precision = 3) => Number(value).toFixed(precision);

const dashAttr = (path, precision = 3) => {
  const meta = path?.meta || {};
  const dash = Array.isArray(meta.strokeDash) && meta.strokeDash.length
    ? meta.strokeDash
    : meta.hiddenLine
    ? [3, 2]
    : null;
  if (!dash) return '';
  const values = dash
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => fmt(value, precision));
  return values.length ? ` stroke-dasharray="${values.join(' ')}"` : '';
};

const shapeToSvg = (path, precision = 3) => {
  if (path && path.meta && path.meta.kind === 'circle') {
    const cx = path.meta.cx ?? path.meta.x ?? 0;
    const cy = path.meta.cy ?? path.meta.y ?? 0;
    const rx = path.meta.rx ?? path.meta.r ?? 0;
    const ry = path.meta.ry ?? path.meta.r ?? rx;
    if (Math.abs(rx - ry) < 1e-6) {
      return `<circle cx="${fmt(cx, precision)}" cy="${fmt(cy, precision)}" r="${fmt(rx, precision)}"${dashAttr(path, precision)} />`;
    }
    return `<ellipse cx="${fmt(cx, precision)}" cy="${fmt(cy, precision)}" rx="${fmt(rx, precision)}" ry="${fmt(ry, precision)}"${dashAttr(path, precision)} />`;
  }

  if (!Array.isArray(path) || !path.length) return '';

  const commands = PathDraw.commands(path, { useCurves: false });
  // A lone point yields no commands; the baselines' historical spelling for it
  // is a bare moveto.
  const d = commands.length
    ? commands
      .map((cmd) => (cmd[0] === 'Z' ? 'Z' : `${cmd[0]}${cmd.slice(1).map((v) => fmt(v, precision)).join(' ')}`))
      .join(' ')
    : `M${fmt(path[0].x, precision)} ${fmt(path[0].y, precision)}`;
  return `<path d="${d}"${dashAttr(path, precision)} />`;
};

const pathsToSvg = ({ width, height, paths, precision = 3 }) => {
  const body = (paths || [])
    .map((path) => shapeToSvg(path, precision))
    .filter(Boolean)
    .join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width, 0)} ${fmt(height, 0)}">`,
    body,
    '</svg>',
    '',
  ].join('\n');
};

module.exports = {
  shapeToSvg,
  pathsToSvg,
};
