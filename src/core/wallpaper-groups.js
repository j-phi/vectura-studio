/**
 * Definitions for all 17 crystallographic wallpaper groups.
 * Each group provides point-symmetry ops and fundamental-domain geometry.
 */
(() => {
  const PI = Math.PI;
  const cos = Math.cos;
  const sin = Math.sin;

  const rotPt = (pt, cx, cy, deg) => {
    const r = deg * PI / 180;
    const c = cos(r), s = sin(r);
    const dx = pt.x - cx, dy = pt.y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  };

  const reflPt = (pt, px, py, axisDeg) => {
    const r = 2 * axisDeg * PI / 180;
    const dx = pt.x - px, dy = pt.y - py;
    return { x: px + dx * cos(r) + dy * sin(r), y: py + dx * sin(r) - dy * cos(r) };
  };

  const getCell = (W, H, tileAngleDeg, cx, cy, rotDeg) => {
    const rA = rotDeg * PI / 180;
    const rB = (rotDeg + tileAngleDeg) * PI / 180;
    const a1 = { x: W * cos(rA), y: W * sin(rA) };
    const a2 = { x: H * cos(rB), y: H * sin(rB) };
    const P = (u, v) => ({ x: cx + u * a1.x + v * a2.x, y: cy + u * a1.y + v * a2.y });
    return {
      a1, a2, P,
      O: P(0, 0),
      P10: P(1, 0),
      P01: P(0, 1),
      P11: P(1, 1),
      C: P(0.5, 0.5),
      M10: P(0.5, 0),
      M01: P(0, 0.5),
      M10r: P(1, 0.5),
      M01t: P(0.5, 1),
      angleA1: rotDeg,
      angleA2: rotDeg + tileAngleDeg,
    };
  };

  const GROUPS = {
    p1: {
      label: 'p1 — Translation',
      lattice: 'oblique',
      defaultTileAngle: 70,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P10, P11, P01 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [(pt) => ({ x: pt.x, y: pt.y })],
          fundamentalDomain: [O, P10, P11, P01],
        };
      },
    },

    p2: {
      label: 'p2 — 180° Rotation',
      lattice: 'oblique',
      defaultTileAngle: 70,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P10, P01, C, P } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 180),
          ],
          fundamentalDomain: [O, P10, P(1, 0.5), P(0, 0.5)],
        };
      },
    },

    pm: {
      label: 'pm — Mirror',
      lattice: 'rectangular',
      defaultTileAngle: 90,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P01, M10, P, angleA2 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => reflPt(pt, M10.x, M10.y, angleA2),
          ],
          fundamentalDomain: [O, M10, P(0.5, 1), P01],
        };
      },
    },

    pg: {
      label: 'pg — Glide Reflection',
      lattice: 'rectangular',
      defaultTileAngle: 90,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P01, M10, P, angleA2 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        const half2 = { x: 0.5 * a2.x, y: 0.5 * a2.y };
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => {
              const r = reflPt(pt, M10.x, M10.y, angleA2);
              return { x: r.x + half2.x, y: r.y + half2.y };
            },
          ],
          fundamentalDomain: [O, M10, P(0.5, 1), P01],
        };
      },
    },

    cm: {
      label: 'cm — Mirror (Rhombic)',
      lattice: 'rhombic',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const sz = W;
        const { a1, a2, O, P10, M01, P, angleA1 } = getCell(sz, sz, tileAngle, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => reflPt(pt, M01.x, M01.y, angleA1),
          ],
          fundamentalDomain: [O, P10, P(1, 0.5), P(0, 0.5)],
        };
      },
    },

    pmm: {
      label: 'pmm — 2 Mirrors',
      lattice: 'rectangular',
      defaultTileAngle: 90,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, C, M10, M01, angleA1, angleA2 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => reflPt(pt, M10.x, M10.y, angleA2),
            (pt) => reflPt(pt, M01.x, M01.y, angleA1),
            (pt) => rotPt(pt, C.x, C.y, 180),
          ],
          fundamentalDomain: [O, M10, C, M01],
        };
      },
    },

    pmg: {
      label: 'pmg — Mirror + Glide',
      lattice: 'rectangular',
      defaultTileAngle: 90,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, C, M10, M01, angleA1 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        const half1 = { x: 0.5 * a1.x, y: 0.5 * a1.y };
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 180),
            (pt) => reflPt(pt, M01.x, M01.y, angleA1),
            (pt) => {
              const r = reflPt(pt, M01.x, M01.y, angleA1);
              return { x: r.x + half1.x, y: r.y + half1.y };
            },
          ],
          fundamentalDomain: [O, M10, C, M01],
        };
      },
    },

    pgg: {
      label: 'pgg — 2 Glide Reflections',
      lattice: 'rectangular',
      defaultTileAngle: 90,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, C, M10, M01, angleA1, angleA2 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        const half1 = { x: 0.5 * a1.x, y: 0.5 * a1.y };
        const half2 = { x: 0.5 * a2.x, y: 0.5 * a2.y };
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 180),
            (pt) => {
              const r = reflPt(pt, M10.x, M10.y, angleA2);
              return { x: r.x + half2.x, y: r.y + half2.y };
            },
            (pt) => {
              const r = reflPt(pt, M01.x, M01.y, angleA1);
              return { x: r.x + half1.x, y: r.y + half1.y };
            },
          ],
          fundamentalDomain: [O, M10, C, M01],
        };
      },
    },

    cmm: {
      label: 'cmm — 2 Mirrors (Rhombic)',
      lattice: 'rhombic',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const sz = W;
        const { a1, a2, O, C, M10, M01, angleA1, angleA2 } = getCell(sz, sz, tileAngle, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => reflPt(pt, C.x, C.y, angleA1),
            (pt) => reflPt(pt, C.x, C.y, angleA2),
            (pt) => rotPt(pt, C.x, C.y, 180),
          ],
          fundamentalDomain: [O, M10, C, M01],
        };
      },
    },

    p4: {
      label: 'p4 — 4-fold Rotation',
      lattice: 'square',
      defaultTileAngle: 90,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, C, M10, M01 } = getCell(W, W, 90, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 90),
            (pt) => rotPt(pt, C.x, C.y, 180),
            (pt) => rotPt(pt, C.x, C.y, 270),
          ],
          fundamentalDomain: [O, M10, C, M01],
        };
      },
    },

    p4m: {
      label: 'p4m — 4-fold + Mirrors',
      lattice: 'square',
      defaultTileAngle: 90,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, C, M10, M01, angleA1 } = getCell(W, W, 90, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 90),
            (pt) => rotPt(pt, C.x, C.y, 180),
            (pt) => rotPt(pt, C.x, C.y, 270),
            (pt) => reflPt(pt, C.x, C.y, angleA1),
            (pt) => reflPt(pt, C.x, C.y, angleA1 + 90),
            (pt) => reflPt(pt, C.x, C.y, angleA1 + 45),
            (pt) => reflPt(pt, C.x, C.y, angleA1 - 45),
          ],
          fundamentalDomain: [O, M10, C],
        };
      },
    },

    p4g: {
      label: 'p4g — 4-fold + Glides',
      lattice: 'square',
      defaultTileAngle: 90,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, C, M10, M01, M10r, M01t, angleA1, angleA2 } = getCell(W, W, 90, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 90),
            (pt) => rotPt(pt, C.x, C.y, 180),
            (pt) => rotPt(pt, C.x, C.y, 270),
            (pt) => reflPt(pt, M10.x, M10.y, angleA2),
            (pt) => reflPt(pt, M01.x, M01.y, angleA1),
            (pt) => reflPt(pt, M10r.x, M10r.y, angleA2),
            (pt) => reflPt(pt, M01t.x, M01t.y, angleA1),
          ],
          fundamentalDomain: [O, M10, C],
        };
      },
    },

    p3: {
      label: 'p3 — 3-fold Rotation',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P10, P } = getCell(W, W, 60, cx, cy, rotDeg);
        const rot3 = P(1 / 3, 1 / 3);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, rot3.x, rot3.y, 120),
            (pt) => rotPt(pt, rot3.x, rot3.y, 240),
          ],
          fundamentalDomain: [O, P10, rot3],
        };
      },
    },

    p3m1: {
      label: 'p3m1 — 3-fold + Mirrors',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P, angleA1 } = getCell(W, W, 60, cx, cy, rotDeg);
        const rot3 = P(1 / 3, 1 / 3);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, rot3.x, rot3.y, 120),
            (pt) => rotPt(pt, rot3.x, rot3.y, 240),
            (pt) => reflPt(pt, rot3.x, rot3.y, angleA1),
            (pt) => reflPt(pt, rot3.x, rot3.y, angleA1 + 60),
            (pt) => reflPt(pt, rot3.x, rot3.y, angleA1 + 120),
          ],
          fundamentalDomain: [O, P(0.5, 0), rot3],
        };
      },
    },

    p31m: {
      label: 'p31m — 3-fold + Mirrors (alt)',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P, angleA1, angleA2 } = getCell(W, W, 60, cx, cy, rotDeg);
        const rot3 = P(1 / 3, 2 / 3);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, rot3.x, rot3.y, 120),
            (pt) => rotPt(pt, rot3.x, rot3.y, 240),
            (pt) => reflPt(pt, O.x, O.y, angleA1),
            (pt) => reflPt(pt, O.x, O.y, angleA2),
            (pt) => reflPt(pt, O.x, O.y, angleA1 + 60),
          ],
          fundamentalDomain: [O, P(0.5, 0), rot3],
        };
      },
    },

    p6: {
      label: 'p6 — 6-fold Rotation',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P10, P } = getCell(W, W, 60, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [0, 60, 120, 180, 240, 300].map((deg) => (pt) => rotPt(pt, O.x, O.y, deg)),
          fundamentalDomain: [O, P10, P(1, 1)],
        };
      },
    },

    p6m: {
      label: 'p6m — 6-fold + Mirrors',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P, angleA1 } = getCell(W, W, 60, cx, cy, rotDeg);
        const mid1 = P(0.5, 0);
        const innerPt = P(2 / 3, 1 / 3);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            ...[0, 60, 120, 180, 240, 300].map((deg) => (pt) => rotPt(pt, O.x, O.y, deg)),
            ...[0, 30, 60, 90, 120, 150].map((deg) => (pt) => reflPt(pt, O.x, O.y, angleA1 + deg)),
          ],
          fundamentalDomain: [O, mid1, innerPt],
        };
      },
    },
  };

  const GROUP_IDS = Object.keys(GROUPS);

  // Compute integer (n,m) range to cover canvas bounds with lattice translations.
  const getTileRange = (bounds, a1, a2) => {
    const w = bounds.width ?? 0;
    const h = bounds.height ?? 0;
    const det = a1.x * a2.y - a1.y * a2.x;
    if (Math.abs(det) < 1e-8) return { nMin: -8, nMax: 8, mMin: -8, mMax: 8 };
    const corners = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: 0, y: h }, { x: w, y: h }];
    let nMin = Infinity, nMax = -Infinity, mMin = Infinity, mMax = -Infinity;
    corners.forEach((c) => {
      const n = (c.x * a2.y - c.y * a2.x) / det;
      const m = (a1.x * c.y - a1.y * c.x) / det;
      if (n < nMin) nMin = n;
      if (n > nMax) nMax = n;
      if (m < mMin) mMin = m;
      if (m > mMax) mMax = m;
    });
    return {
      nMin: Math.floor(nMin) - 1,
      nMax: Math.ceil(nMax) + 1,
      mMin: Math.floor(mMin) - 1,
      mMax: Math.ceil(mMax) + 1,
    };
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.WallpaperGroups = { GROUPS, GROUP_IDS, getTileRange };
})();
