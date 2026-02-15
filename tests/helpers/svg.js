const fmt = (value, precision = 3) => Number(value).toFixed(precision);

const shapeToSvg = (path, precision = 3) => {
  if (path && path.meta && path.meta.kind === 'circle') {
    const cx = path.meta.cx ?? path.meta.x ?? 0;
    const cy = path.meta.cy ?? path.meta.y ?? 0;
    const rx = path.meta.rx ?? path.meta.r ?? 0;
    const ry = path.meta.ry ?? path.meta.r ?? rx;
    if (Math.abs(rx - ry) < 1e-6) {
      return `<circle cx="${fmt(cx, precision)}" cy="${fmt(cy, precision)}" r="${fmt(rx, precision)}" />`;
    }
    return `<ellipse cx="${fmt(cx, precision)}" cy="${fmt(cy, precision)}" rx="${fmt(rx, precision)}" ry="${fmt(ry, precision)}" />`;
  }

  if (!Array.isArray(path) || !path.length) return '';
  const d = path
    .map((pt, index) => `${index === 0 ? 'M' : 'L'}${fmt(pt.x, precision)} ${fmt(pt.y, precision)}`)
    .join(' ');
  return `<path d="${d}" />`;
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
