const crypto = require('crypto');

const round = (num, precision = 4) => {
  const factor = Math.pow(10, precision);
  return Math.round(Number(num) * factor) / factor;
};

const normalizePath = (path, precision = 4) => {
  if (!Array.isArray(path)) return path;
  const normalized = path.map((pt) => ({ x: round(pt.x, precision), y: round(pt.y, precision) }));
  if (path.meta) {
    normalized.meta = JSON.parse(
      JSON.stringify(path.meta, (_, value) => (typeof value === 'number' ? round(value, precision) : value))
    );
  }
  return normalized;
};

const normalizePaths = (paths, precision = 4) => {
  const out = (paths || []).map((path) => normalizePath(path, precision));
  if (paths && paths.helpers) {
    out.helpers = normalizePaths(paths.helpers, precision);
  }
  return out;
};

const serializePaths = (paths, precision = 4) => JSON.stringify(normalizePaths(paths, precision));

const pathSignature = (paths, precision = 4) =>
  crypto.createHash('sha256').update(serializePaths(paths, precision)).digest('hex');

module.exports = {
  normalizePaths,
  serializePaths,
  pathSignature,
};
