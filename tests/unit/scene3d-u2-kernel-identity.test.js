/*
 * U2 kernel perf (fill-style review 2026-10-02) — BIT-IDENTITY proofs.
 *
 * Four of the five U2 kernel changes are pure speed-ups that must not move a
 * single coordinate:
 *   F3    precomputed rotator in Geometry3D.rotatePoint (own test:
 *         geometry3d-rotator-identity.test.js)
 *   NEW-1 the mono streamline spacing grid (quarter-pitch cells, numeric keys)
 *   F7    turingStripe: per-cell Dv hoisted, clamps inlined, ping-pong buffers
 *   F9    ground-shadow fields: segment-grid distance + scanline inside test
 *
 * Two kinds of proof:
 *  1. SCENE GOLDENS. FNV-1a over every `x,y` (full float strings) of the
 *     composed `group.scenePaths`, captured on the parent commit 383d7610
 *     BEFORE any U2 change (scratchpad bench, sphere/box/torus, yaw 33). A
 *     ground shadow is part of every one of these scenes, so the shadow-field
 *     rewrite is covered too. Regenerate ONLY when a scene3d output change is
 *     deliberate (and say so in the commit).
 *  2. SHADOW FIELD ORACLE. `__shadowFieldsForTest` now takes edge segments and
 *     exposes the raw lattice; every cell is compared with Object.is against
 *     the legacy brute-force `distToSegs` / `pointInRings`, copied verbatim
 *     below, on random footprints with holes and non-finite points.
 *
 * RED: before U2, `__shadowFieldsForTest` ignored edge segments and returned
 * no `grid`, so the oracle block fails; the scene goldens pass on both sides
 * by design (that is the identity claim).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const hashPaths = (paths) => {
  let h1 = 0x811c9dc5 >>> 0; let n = 0; let pts = 0;
  const mix = (s) => { for (let i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619) >>> 0; } };
  (paths || []).forEach((p) => {
    if (!Array.isArray(p)) return;
    n++; mix('|');
    p.forEach((q) => { pts++; mix(`${q.x},${q.y};`); });
  });
  return { hash: h1.toString(16), paths: n, pts };
};

// Captured on 383d7610 (pre-U2), once per CPU architecture.
//
// WHY TWO HASHES. The hash covers full-precision float strings, and V8's
// Math.sin/cos/tan/exp/log/atan2/pow (its C++ fdlibm port) round the last
// ULP differently on arm64 (FMA-contracted build) and x86_64. A probe of 20k
// random inputs per function differs on ~0.5% of results. So one byte-exact
// golden can only hold on one architecture: the arm64 hashes (dev Macs) fail
// on GitHub's ubuntu x86_64 runner even though nothing moved. Both columns
// were regenerated on the pre-U2 base 383d7610 itself (arm64 node and x64
// node 20.20.2 under Rosetta), so each one is a true pre-U2 identity on its
// own arch, not a re-pin of current output. Coordinate drift between the two
// columns is <= 1.7e-10 with identical path/point counts.
// Regenerate x64 on a Mac: download node-v<ver>-darwin-x64 and run the same
// scene through `arch -x86_64 <x64 node>`; the result matches CI exactly.
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const GOLDENS = [
  { prim: 'sphere', mapper: 'hatch', law: 'ladder', hash: { arm64: 'b8de834e', x64: 'f51e7a34' }, paths: 112, pts: 1589 },
  { prim: 'sphere', mapper: 'hatch', law: 'etfKang', hash: { arm64: '458964db', x64: 'b2689b20' }, paths: 285, pts: 13885 },
  { prim: 'sphere', mapper: 'hatch', law: 'turingStripe', hash: { arm64: '72b834ca', x64: 'ca0ee727' }, paths: 299, pts: 18773 },
  { prim: 'sphere', mapper: 'hatch', law: 'mezzoRegion', hash: { arm64: 'c9eba689', x64: 'a3a7eb6f' }, paths: 534, pts: 17788 },
  { prim: 'box', mapper: 'hatch', law: 'etfKang', hash: { arm64: '7fa7bd11', x64: '7fa7bd11' }, paths: 249, pts: 14053 },
  { prim: 'torus', mapper: 'crosshatch', law: 'ladder', hash: { arm64: '7b731dab', x64: '3d709a7b' }, paths: 150, pts: 1430 },
];

// ── Legacy shadows.js primitives, VERBATIM (the identity reference) ─────────
const isFinitePt = (pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y);
const distToSegs = (px, py, segs) => {
  let best = Infinity;
  for (let i = 0; i < segs.length; i++) {
    const a = segs[i][0]; const b = segs[i][1];
    const vx = b.x - a.x; const vy = b.y - a.y;
    const wx = px - a.x; const wy = py - a.y;
    const vv = vx * vx + vy * vy;
    let s = vv > 1e-12 ? (wx * vx + wy * vy) / vv : 0;
    if (s < 0) s = 0; else if (s > 1) s = 1;
    const dx = wx - vx * s; const dy = wy - vy * s;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
};
const pointInRings = (px, py, rings) => {
  let inside = false;
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]; const b = ring[i];
      if (!isFinitePt(a) || !isFinitePt(b)) continue;
      if ((a.y > py) !== (b.y > py)) {
        const x = a.x + ((py - a.y) / ((b.y - a.y) || 1e-12)) * (b.x - a.x);
        if (px < x) inside = !inside;
      }
    }
  }
  return inside;
};

const lcg = (seed) => {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
};
const star = (rnd, cx, cy, r0, n) => {
  const ring = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r = r0 * (0.55 + 0.45 * rnd());
    ring.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return ring;
};

describe('U2 kernel perf — bit-identity', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
  }, 300000);

  afterAll(() => runtime && runtime.cleanup());

  // Regression guard (PR #87 CI): a golden pinned on one architecture only
  // passes locally and fails CI. Every row must carry both columns.
  test('every scene golden is pinned for both arm64 and x64', () => {
    GOLDENS.forEach((g) => {
      expect(Object.keys(g.hash).sort()).toEqual(['arm64', 'x64']);
      expect(g.hash.arm64).toMatch(/^[0-9a-f]{1,8}$/);
      expect(g.hash.x64).toMatch(/^[0-9a-f]{1,8}$/);
    });
  });

  test.each(GOLDENS)('scene golden — $prim / $mapper / $law is byte-identical to pre-U2', (g) => {
    const engine = new V.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.layers.find((l) => l.id === gid);
    const child = engine.getLayerDescendants(gid).filter((l) => l && l.type === 'object3d')[0];
    child.params.primitive = g.prim;
    const params = { fillCurves: true };
    if (g.law !== 'ladder') params.toneLaw = g.law;
    child.params.style = { penId: null, mapper: g.mapper, params };
    child.params.transform.yaw = 33;
    child.params.transform.pitch = 0;
    child.params.transform.roll = 0;
    engine.computeAllDisplayGeometry();
    expect(hashPaths(group.scenePaths)).toEqual({ hash: g.hash[ARCH], paths: g.paths, pts: g.pts });
  }, 180000);

  test('shadow fields — segment-grid distance and scanline inside test match the brute force exactly', () => {
    const Shadows = V.Scene3D.Shadows;
    const rnd = lcg(777);
    let cells = 0;
    for (let trial = 0; trial < 12; trial++) {
      const cx = 40 + rnd() * 30; const cy = 30 + rnd() * 20;
      const outer = star(rnd, cx, cy, 15 + rnd() * 25, 24 + Math.floor(rnd() * 160));
      const rings = [outer];
      if (trial % 2 === 0) rings.push(star(rnd, cx, cy, 4 + rnd() * 3, 9).reverse());
      if (trial % 3 === 0) outer.splice(5, 0, { x: NaN, y: cy });
      const contactSegs = [];
      const nc = 1 + Math.floor(rnd() * 30);
      let px = cx - 10 + rnd() * 5; let py = cy - 5 + rnd() * 10;
      for (let i = 0; i < nc; i++) {
        const qx = px + (rnd() - 0.3) * 3; const qy = py + (rnd() - 0.5) * 3;
        contactSegs.push([{ x: px, y: py }, { x: qx, y: qy }]);
        px = qx; py = qy;
      }
      if (trial === 4) contactSegs.push([{ x: Infinity, y: 0 }, { x: 1, y: 1 }]);
      const edgeSegs = [];
      rings.forEach((ring) => {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          if (isFinitePt(ring[j]) && isFinitePt(ring[i])) edgeSegs.push([ring[j], ring[i]]);
        }
      });
      const f = Shadows.__shadowFieldsForTest(rings, contactSegs, trial === 7 ? [] : edgeSegs);
      expect(f && f.grid).toBeTruthy();
      const { dC, dE, nx, ny, minX, minY, cell } = f.grid;
      const refC = new Float32Array(nx * ny);
      const refE = new Float32Array(nx * ny);
      let Rin = 0;
      for (let j = 0; j < ny; j++) {
        const y = minY + j * cell;
        for (let i = 0; i < nx; i++) {
          const x = minX + i * cell;
          const k = j * nx + i;
          refC[k] = contactSegs.length ? distToSegs(x, y, contactSegs) : 0;
          refE[k] = (trial === 7 ? 0 : edgeSegs.length) ? distToSegs(x, y, edgeSegs) : 1e6;
        }
      }
      for (let j = 0; j < ny; j++) {
        const y = minY + j * cell;
        for (let i = 0; i < nx; i++) {
          const x = minX + i * cell;
          if (!pointInRings(x, y, rings)) continue;
          const d = refE[j * nx + i];
          if (d > Rin) Rin = d;
        }
      }
      let bad = 0;
      for (let k = 0; k < refC.length; k++) {
        if (!Object.is(refC[k], dC[k]) || !Object.is(refE[k], dE[k])) bad++;
      }
      cells += refC.length;
      expect(bad).toBe(0);
      expect(Object.is(f.Rin, Rin)).toBe(true);
    }
    expect(cells).toBeGreaterThan(20000);
  });
});
