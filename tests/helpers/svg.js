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
  // Mirror production ui.pathToSvg: when a path carries bezier anchors with
  // handles (Geometry3D.smoothToBezier / morph rings stamp forceCurves), emit
  // true cubic 'C' commands so the baseline actually exercises the cubic export
  // path instead of silently serializing the sparse control polyline.
  const anchors = path.meta && path.meta.anchors;
  const useCubic = path.meta && path.meta.forceCurves && !path.meta.straight
    && Array.isArray(anchors) && anchors.length >= 2
    && anchors.some((a) => a && (a.in || a.out));
  if (useCubic) {
    const closed = path.meta.closed === true;
    let d = `M${fmt(anchors[0].x, precision)} ${fmt(anchors[0].y, precision)}`;
    for (let i = 0; i < anchors.length - 1; i++) {
      const c1 = anchors[i].out || anchors[i];
      const c2 = anchors[i + 1].in || anchors[i + 1];
      d += ` C${fmt(c1.x, precision)} ${fmt(c1.y, precision)} ${fmt(c2.x, precision)} ${fmt(c2.y, precision)} ${fmt(anchors[i + 1].x, precision)} ${fmt(anchors[i + 1].y, precision)}`;
    }
    if (closed) {
      const c1 = anchors[anchors.length - 1].out || anchors[anchors.length - 1];
      const c2 = anchors[0].in || anchors[0];
      d += ` C${fmt(c1.x, precision)} ${fmt(c1.y, precision)} ${fmt(c2.x, precision)} ${fmt(c2.y, precision)} ${fmt(anchors[0].x, precision)} ${fmt(anchors[0].y, precision)} Z`;
    }
    return `<path d="${d}"${dashAttr(path, precision)} />`;
  }
  const d = path
    .map((pt, index) => `${index === 0 ? 'M' : 'L'}${fmt(pt.x, precision)} ${fmt(pt.y, precision)}`)
    .join(' ');
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
