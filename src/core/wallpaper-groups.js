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
        const { a1, a2, O, P, M10, M01, angleA1, angleA2 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        const half1 = { x: 0.5 * a1.x, y: 0.5 * a1.y };
        const R = P(0.25, 0.5); // 2-fold rotation center at (W/4, H/2) in lattice coords
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => reflPt(pt, M10.x, M10.y, angleA2),
            (pt) => rotPt(pt, R.x, R.y, 180),
            (pt) => {
              const r = reflPt(pt, M01.x, M01.y, angleA1);
              return { x: r.x + half1.x, y: r.y + half1.y };
            },
          ],
          fundamentalDomain: [O, M10, P(0.5, 0.5), M01],
        };
      },
    },

    pgg: {
      label: 'pgg — 2 Glide Reflections',
      lattice: 'rectangular',
      defaultTileAngle: 90,
      symmetric: false,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, C, M10, M01, P, angleA1, angleA2 } = getCell(W, H, tileAngle, cx, cy, rotDeg);
        const half1 = { x: 0.5 * a1.x, y: 0.5 * a1.y };
        const half2 = { x: 0.5 * a2.x, y: 0.5 * a2.y };
        const GH = P(0, 0.25); // horizontal glide axis (angle a1) passes through (0, H/4)
        const GV = P(0.25, 0); // vertical glide axis (angle a2) passes through (W/4, 0)
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 180),
            (pt) => {
              const r = reflPt(pt, GH.x, GH.y, angleA1);
              return { x: r.x + half1.x, y: r.y + half1.y };
            },
            (pt) => {
              const r = reflPt(pt, GV.x, GV.y, angleA2);
              return { x: r.x + half2.x, y: r.y + half2.y };
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
        const { a1, a2, O, C, P10, angleA1, angleA2 } = getCell(sz, sz, tileAngle, cx, cy, rotDeg);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => reflPt(pt, C.x, C.y, (angleA1 + angleA2) / 2),
            (pt) => reflPt(pt, C.x, C.y, (angleA1 + angleA2) / 2 + 90),
            (pt) => rotPt(pt, C.x, C.y, 180),
          ],
          fundamentalDomain: [O, P10, C],
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
      hasV1: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg, options = {}) {
        const { a1, a2, O, C, M10, M01, M10r, M01t, P, angleA1, angleA2 } = getCell(W, W, 90, cx, cy, rotDeg);
        if (options.variant === 'v1') {
          // Pre-fix aesthetic: 4 mirrors at edge midpoints (ops 4/6 and 5/7 are
          // lattice-equivalent duplicates, giving a 25% gap in coverage).
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
        }
        // v2 (default): 4-fold at C; mirror displaced from C by W/4 so it doesn't
        // pass through the 4-fold center — the defining feature vs. p4m.
        const Q = P(0.25, 0);
        const baseRefl = (pt) => reflPt(pt, Q.x, Q.y, angleA2);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, C.x, C.y, 90),
            (pt) => rotPt(pt, C.x, C.y, 180),
            (pt) => rotPt(pt, C.x, C.y, 270),
            baseRefl,
            (pt) => rotPt(baseRefl(pt), C.x, C.y, 90),
            (pt) => rotPt(baseRefl(pt), C.x, C.y, 180),
            (pt) => rotPt(baseRefl(pt), C.x, C.y, 270),
          ],
          fundamentalDomain: [P(0.25, 0), P(0.5, 0), P(0.5, 0.5), P(0.25, 0.5)],
        };
      },
    },

    p3: {
      label: 'p3 — 3-fold Rotation',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      hasV1: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg, options = {}) {
        const { a1, a2, O, P10, P01, P } = getCell(W, W, 60, cx, cy, rotDeg);
        const rot3 = P(1 / 3, 1 / 3);
        const ops = [
          (pt) => ({ x: pt.x, y: pt.y }),
          (pt) => rotPt(pt, rot3.x, rot3.y, 120),
          (pt) => rotPt(pt, rot3.x, rot3.y, 240),
        ];
        if (options.variant === 'v1') {
          // Triangular wedge fund — fills up-triangles only, leaves
          // down-triangles empty (the canonical "alternating triangles" look).
          return { latticeA: a1, latticeB: a2, ops, fundamentalDomain: [O, P10, rot3] };
        }
        // v2 (default): primitive cell of C₃ sublattice, exact tiling.
        return { latticeA: a1, latticeB: a2, ops, fundamentalDomain: [O, rot3, P01, P(-1 / 3, 2 / 3)] };
      },
    },

    p3m1: {
      label: 'p3m1 — 3-fold + Mirrors',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      hasV1: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg, options = {}) {
        const { a1, a2, O, P, angleA1 } = getCell(W, W, 60, cx, cy, rotDeg);
        const rot3 = P(1 / 3, 1 / 3);
        const ops = [
          (pt) => ({ x: pt.x, y: pt.y }),
          (pt) => rotPt(pt, rot3.x, rot3.y, 120),
          (pt) => rotPt(pt, rot3.x, rot3.y, 240),
          (pt) => reflPt(pt, rot3.x, rot3.y, angleA1),
          (pt) => reflPt(pt, rot3.x, rot3.y, angleA1 + 60),
          (pt) => reflPt(pt, rot3.x, rot3.y, angleA1 + 120),
        ];
        if (options.variant === 'v1') {
          // Smaller triangle fund — coverage 0.5, creates open spacing.
          return { latticeA: a1, latticeB: a2, ops, fundamentalDomain: [O, P(0.5, 0), rot3] };
        }
        // v2: 60° sub-wedge of the Voronoi hexagon at rot3 — exact tiling.
        return {
          latticeA: a1, latticeB: a2, ops,
          fundamentalDomain: [rot3, P(5 / 6, 1 / 3), P(2 / 3, 2 / 3), P(1 / 3, 5 / 6)],
        };
      },
    },

    p31m: {
      label: 'p31m — 3-fold + Mirrors (alt)',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg) {
        const { a1, a2, O, P10, P, angleA1 } = getCell(W, W, 60, cx, cy, rotDeg);
        // Use the C₃ center at P(1/3,1/3) (a valid C₃ center for this basis;
        // (1/3,2/3) is NOT — rotating around it doesn't preserve the lattice).
        const rot3 = P(1 / 3, 1 / 3);
        return {
          latticeA: a1, latticeB: a2,
          ops: [
            (pt) => ({ x: pt.x, y: pt.y }),
            (pt) => rotPt(pt, rot3.x, rot3.y, 120),
            (pt) => rotPt(pt, rot3.x, rot3.y, 240),
            (pt) => reflPt(pt, O.x, O.y, angleA1),
            (pt) => reflPt(pt, O.x, O.y, angleA1 + 60),
            (pt) => reflPt(pt, O.x, O.y, angleA1 + 120),
          ],
          // 60° wedge at O with edges along the a1 mirror (0°) and the
          // O-to-rot3 line, area 1/6 of cell.
          fundamentalDomain: [O, P10, rot3],
        };
      },
    },

    p6: {
      label: 'p6 — 6-fold Rotation',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      hasV1: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg, options = {}) {
        const { a1, a2, O, P10, P } = getCell(W, W, 60, cx, cy, rotDeg);
        const ops = [0, 60, 120, 180, 240, 300].map((deg) => (pt) => rotPt(pt, O.x, O.y, deg));
        if (options.variant === 'v1') {
          // Half-cell triangle fund — gives ~3× overlap, dense woven aesthetic.
          return { latticeA: a1, latticeB: a2, ops, fundamentalDomain: [O, P10, P(1, 1)] };
        }
        // v2: 60° wedge at O — exact tiling.
        return { latticeA: a1, latticeB: a2, ops, fundamentalDomain: [O, P10, P(1 / 3, 1 / 3)] };
      },
    },

    p6m: {
      label: 'p6m — 6-fold + Mirrors',
      lattice: 'hexagonal',
      defaultTileAngle: 60,
      symmetric: true,
      hasV1: true,
      getOps(W, H, tileAngle, cx, cy, rotDeg, options = {}) {
        const { a1, a2, O, P, angleA1 } = getCell(W, W, 60, cx, cy, rotDeg);
        const ops = [
          ...[0, 60, 120, 180, 240, 300].map((deg) => (pt) => rotPt(pt, O.x, O.y, deg)),
          ...[0, 30, 60, 90, 120, 150].map((deg) => (pt) => reflPt(pt, O.x, O.y, angleA1 + deg)),
        ];
        if (options.variant === 'v1') {
          // Off-axis triangle — partial overlap, subtle woven aesthetic.
          return { latticeA: a1, latticeB: a2, ops, fundamentalDomain: [O, P(0.5, 0), P(2 / 3, 1 / 3)] };
        }
        // v2: 30° wedge at O — exact tiling.
        return { latticeA: a1, latticeB: a2, ops, fundamentalDomain: [O, P(0.5, 0), P(1 / 3, 1 / 3)] };
      },
    },
  };

  const GROUP_IDS = Object.keys(GROUPS);

  // Compute integer (n,m) range to cover canvas bounds with lattice translations.
  // cx/cy: lattice origin in canvas space (tile center point). Canvas corners must be
  // expressed relative to this origin before solving for lattice indices.
  const getTileRange = (bounds, a1, a2, cx = 0, cy = 0) => {
    const w = bounds.width ?? 0;
    const h = bounds.height ?? 0;
    const det = a1.x * a2.y - a1.y * a2.x;
    if (Math.abs(det) < 1e-8) return { nMin: -8, nMax: 8, mMin: -8, mMax: 8 };
    const corners = [{ x: -cx, y: -cy }, { x: w - cx, y: -cy }, { x: -cx, y: h - cy }, { x: w - cx, y: h - cy }];
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

  // Which tile parameters does each lattice actually consume? Square and
  // hexagonal lattices force H = W and a fixed cell angle, so the
  // tileHeight / tileAngle sliders have no effect there. Rhombic lattices
  // use sz = W internally (H ignored) but still honor tileAngle.
  const LOCKED_AXES = {
    square:      { tileHeight: true,  tileAngle: true  },
    hexagonal:   { tileHeight: true,  tileAngle: true  },
    rhombic:     { tileHeight: true,  tileAngle: false },
    rectangular: { tileHeight: false, tileAngle: false },
    oblique:     { tileHeight: false, tileAngle: false },
  };
  const getLockedAxes = (groupId) => {
    const lat = GROUPS[groupId]?.lattice;
    return LOCKED_AXES[lat] || { tileHeight: false, tileAngle: false };
  };

  // ────────────────────────────────────────────────────────────────────────
  // Composable symmetry model. The 17 crystallographic groups are the valid
  // combinations of a (lattice, rotation, mirrors) tuple — this lets the UI
  // present them as three orthogonal toggles instead of a flat 17-cell grid.
  // ────────────────────────────────────────────────────────────────────────
  const FEATURES = {
    p1:   { lattice: 'oblique',     rotation: 1, mirrors: 'none' },
    p2:   { lattice: 'oblique',     rotation: 2, mirrors: 'none' },
    pm:   { lattice: 'rectangular', rotation: 1, mirrors: 'straight' },
    pg:   { lattice: 'rectangular', rotation: 1, mirrors: 'glide' },
    cm:   { lattice: 'rhombic',     rotation: 1, mirrors: 'straight' },
    pmm:  { lattice: 'rectangular', rotation: 2, mirrors: 'straight' },
    pmg:  { lattice: 'rectangular', rotation: 2, mirrors: 'straight+glide' },
    pgg:  { lattice: 'rectangular', rotation: 2, mirrors: 'glide' },
    cmm:  { lattice: 'rhombic',     rotation: 2, mirrors: 'straight' },
    p4:   { lattice: 'square',      rotation: 4, mirrors: 'none' },
    p4m:  { lattice: 'square',      rotation: 4, mirrors: 'straight' },
    p4g:  { lattice: 'square',      rotation: 4, mirrors: 'glide' },
    p3:   { lattice: 'hexagonal',   rotation: 3, mirrors: 'none' },
    p3m1: { lattice: 'hexagonal',   rotation: 3, mirrors: 'corners' },
    p31m: { lattice: 'hexagonal',   rotation: 3, mirrors: 'edges' },
    p6:   { lattice: 'hexagonal',   rotation: 6, mirrors: 'none' },
    p6m:  { lattice: 'hexagonal',   rotation: 6, mirrors: 'all' },
  };

  // Valid rotations per lattice — used to snap an incoming rotation to the
  // nearest legal value when the user toggles lattices.
  const LATTICE_ROTATIONS = {
    oblique:     [1, 2],
    rectangular: [1, 2],
    rhombic:     [1, 2],
    square:      [4],
    hexagonal:   [3, 6],
  };

  // Resolver priority order per (lattice, rotation). Only contains mirror
  // values that map to a real group for that tuple — the resolver walks this
  // list to pick the best replacement when the user's mirror choice doesn't
  // exist for the current lattice/rotation.
  const MIRROR_CHAINS = {
    'oblique:1':     ['none'],
    'oblique:2':     ['none'],
    'rectangular:1': ['straight', 'glide'],
    'rectangular:2': ['straight', 'straight+glide', 'glide'],
    'rhombic:1':     ['straight'],
    'rhombic:2':     ['straight'],
    'square:4':      ['straight', 'glide', 'none'],
    'hexagonal:3':   ['none', 'corners', 'edges'],
    'hexagonal:6':   ['none', 'all'],
  };

  // Complexity scale used for the canonical cycleInFamily ordering — keeps
  // 'none' first, then matched pairs of straight/corners, glide/edges,
  // straight+glide/all (the rectangular and hexagonal twins each step in
  // parallel).
  const MIRROR_COMPLEXITY = {
    'none': 0,
    'straight': 1,
    'corners': 1,
    'glide': 2,
    'edges': 2,
    'straight+glide': 3,
    'all': 3,
  };

  // Build a (lattice, rotation, mirrors) → groupId lookup once.
  const FEATURE_INDEX = {};
  for (const id of Object.keys(FEATURES)) {
    const f = FEATURES[id];
    FEATURE_INDEX[`${f.lattice}:${f.rotation}:${f.mirrors}`] = id;
  }

  const featuresToGroupId = (target) => {
    if (!target) return null;
    const key = `${target.lattice}:${target.rotation}:${target.mirrors}`;
    return FEATURE_INDEX[key] || null;
  };

  const snapRotation = (lattice, rotation) => {
    const opts = LATTICE_ROTATIONS[lattice] || [1];
    let best = opts[0];
    let bestDist = Math.abs(rotation - best);
    for (let i = 1; i < opts.length; i++) {
      const dist = Math.abs(rotation - opts[i]);
      // Ties prefer the higher rotation (per plan).
      if (dist < bestDist || (dist === bestDist && opts[i] > best)) {
        best = opts[i];
        bestDist = dist;
      }
    }
    return best;
  };

  const snapMirrors = (lattice, rotation, mirrors) => {
    const chain = MIRROR_CHAINS[`${lattice}:${rotation}`] || ['none'];
    if (chain.includes(mirrors)) return mirrors;
    // Coming from 'none' and 'none' is allowed → keep 'none'.
    if (mirrors === 'none' && chain.includes('none')) return 'none';
    // Otherwise prefer the first non-'none' option so a user who *had*
    // mirrors keeps mirrors after the snap (escalate-not-relax rule).
    const firstNonNone = chain.find((m) => m !== 'none');
    return firstNonNone || chain[0];
  };

  const nearestValidGroup = (target) => {
    const t = target || {};
    const lattice = LATTICE_ROTATIONS[t.lattice] ? t.lattice : 'square';
    const rotation = snapRotation(lattice, Number.isFinite(t.rotation) ? t.rotation : 4);
    const mirrors = snapMirrors(lattice, rotation, t.mirrors ?? 'none');
    return featuresToGroupId({ lattice, rotation, mirrors }) || 'p4m';
  };

  // Canonical in-family order: rotation asc, then mirror complexity asc
  // (with 'none' first). This is the order ⌘← / ⌘→ walks.
  const familyOrder = (lattice) => {
    const ids = Object.keys(FEATURES).filter((id) => FEATURES[id].lattice === lattice);
    return ids.sort((a, b) => {
      const fa = FEATURES[a], fb = FEATURES[b];
      if (fa.rotation !== fb.rotation) return fa.rotation - fb.rotation;
      const ca = MIRROR_COMPLEXITY[fa.mirrors] ?? 99;
      const cb = MIRROR_COMPLEXITY[fb.mirrors] ?? 99;
      if (ca !== cb) return ca - cb;
      return a.localeCompare(b);
    });
  };

  const cycleInFamily = (currentGroupId, dir = 1) => {
    const feat = FEATURES[currentGroupId];
    if (!feat) return currentGroupId;
    const order = familyOrder(feat.lattice);
    const idx = order.indexOf(currentGroupId);
    if (idx < 0) return order[0] || currentGroupId;
    const step = dir >= 0 ? 1 : -1;
    const next = ((idx + step) % order.length + order.length) % order.length;
    return order[next];
  };

  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.WallpaperGroups = {
    GROUPS, GROUP_IDS, getTileRange, getCell, rotPt, reflPt, getLockedAxes,
    FEATURES, LATTICE_ROTATIONS, MIRROR_CHAINS, MIRROR_COMPLEXITY,
    featuresToGroupId, nearestValidGroup, cycleInFamily,
  };
})();
