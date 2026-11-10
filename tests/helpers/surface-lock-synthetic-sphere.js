// Synthetic lat-long sphere MarkSet for the surface-lock frame tests (docs/surface-lock-contract.md §2, §14).
// Rings of constant z (axis +z), radius R, nested by level (spacing p0 / 2^level, 5 levels), van der Corput ranks.
// Lives in tests/helpers: the surface-lock frame tests share it; no source module reads it.
const vdc2 = (j) => { let f = 0.5; let r = 0; let n = j; while (n > 0) { if (n & 1) r += f; n >>= 1; f /= 2; } return r; };
const tz = (i) => { let n = 0; let v = i; while (v && !(v & 1)) { n += 1; v >>= 1; } return n; };

const buildSphere = (V, { R = 20, step = 1, M = 512, thetaMax = Math.PI, levels = 5, ranksOnly = null } = {}) => {
  const MS = V.Scene3D.SurfaceLockMarkSet;
  const top = levels - 1; // finest level index
  const p0 = Math.PI * R / (M / (1 << top));
  const b = MS.createBuilder({ bakerId: 'synthetic', key: 'synthetic', objectId: 'o', meta: { p0, gain: 2, toneModel: 'pitch', scaleRef: 1, minMarkMM: 0, convex: true } });
  const members = Array.from({ length: levels }, () => []);
  for (let i = 1; i < M; i++) {
    if (Math.PI * i / M > thetaMax) break;
    members[Math.max(0, top - tz(i))].push(i);
  }
  const rings = [];
  members.forEach((list, level) => list.forEach((i, j) => {
    const th = Math.PI * i / M; const z = R * Math.cos(th); const r = R * Math.sin(th);
    const rank = ranksOnly ? ranksOnly[j % ranksOnly.length] : vdc2(j);
    const n = Math.max(8, Math.ceil(2 * Math.PI * r / step));
    b.beginRun(level, rank, 0, MS.FLAG.CLOSED);
    for (let k = 0; k < n; k++) {
      const ph = 2 * Math.PI * k / n;
      const x = r * Math.cos(ph); const y = r * Math.sin(ph);
      b.vertex(x, y, z, x / R, y / R, z / R);
    }
    b.endRun();
    rings.push({ i, level, rank, z, r, n });
  }));
  return { ms: b.finish(), rings, p0, R };
};

module.exports = { buildSphere, vdc2 };
