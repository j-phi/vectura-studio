/**
 * Scene3D.SurfaceLockChart — object-space chart metric shared by every surface-lock baker
 * (docs/surface-lock-contract.md §3). Pose-free by construction: nothing here reads a camera,
 * a light or an object rotation.
 *
 *   metric(mode, sizes, scale) -> M | null
 *     mode, sizes   exactly what algorithms/scene3d.js curvedChartParams returns (SurfaceFill.chartFor input)
 *     scale         { sx, sy, sz } object scale (transform.scale / sx / sy / sz resolved); the bake frame is
 *                   diag(scale) * chart(a, b), the SCALED LOCAL frame
 *     M.sample(a, b) -> { x, y, z, dax, day, daz, dbx, dby, dbz, nx, ny, nz } | null
 *                   point, chart derivatives dP/da and dP/db (mm per unit param), OUTWARD unit normal.
 *                   Normals use the inverse-transpose of the scale (correct under non-uniform scale).
 *     M.orientation  +1 or -1 (the divergence test SurfaceFill's chartOrientation uses)
 *     M.periodicA, M.periodicB  booleans (chart(0, u) == chart(1, u) etc.)
 *   hash(i, j, salt) -> [0, 1)    the sfHash formula with an explicit salt (never the module global)
 *   spatialHash3(cell) -> { insert(x, y, z, id), near(x, y, z, r, fn(id, d2)), clear(), size }
 *                   3D occupancy in object mm (pole and seam safe; contract §3)
 */
(function registerSurfaceLockChart() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  const EPS = 1 / 4096;
  const POLE_EPS = 2e-3;

  const hash = (i, j, salt) => {
    let h = ((i | 0) * 73856093) ^ ((j | 0) * 19349663);
    h ^= (salt | 0);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  const metric = (mode, sizes, scale) => {
    const SF = Scene3D.SurfaceFill;
    if (!SF || typeof SF.chartFor !== 'function') return null;
    const raw = SF.chartFor(mode, sizes || {});
    if (typeof raw !== 'function') return null;
    const s = scale || {};
    const sx = Number.isFinite(s.sx) ? s.sx : 1; const sy = Number.isFinite(s.sy) ? s.sy : 1; const sz = Number.isFinite(s.sz) ? s.sz : 1;
    const at = (a, b) => {
      const q = raw(a, b);
      return q && Number.isFinite(q.x) && Number.isFinite(q.y) && Number.isFinite(q.z) ? q : null;
    };
    // Orientation: sign of the enclosed volume (local frame; scale has positive determinant).
    let vol = 0;
    const M = 24;
    for (let i = 0; i < M; i++) {
      const a = (i + 0.5) / M;
      for (let j = 0; j < M; j++) {
        const b = (j + 0.5) / M;
        const q0 = at(a, b); const qa = at(a + EPS, b); const qb = at(a, b + EPS);
        if (!q0 || !qa || !qb) continue;
        const ux = qa.x - q0.x; const uy = qa.y - q0.y; const uz = qa.z - q0.z;
        const vx = qb.x - q0.x; const vy = qb.y - q0.y; const vz = qb.z - q0.z;
        vol += q0.x * (uy * vz - uz * vy) + q0.y * (uz * vx - ux * vz) + q0.z * (ux * vy - uy * vx);
      }
    }
    const orientation = vol < 0 ? -1 : 1;
    const close = (p, q) => p && q && Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) < 1e-6 * (1 + Math.hypot(p.x, p.y, p.z));
    const periodicA = [0.25, 0.5, 0.75].every((u) => close(at(0, u), at(1, u)));
    const periodicB = [0.25, 0.5, 0.75].every((u) => close(at(u, 0), at(u, 1)));

    // Central difference inside the domain, one-sided at an edge (sign kept).
    const deriv = (a, b, da, db) => {
      const lo = (da ? a : b) - EPS; const hi = (da ? a : b) + EPS;
      if (da ? periodicA : periodicB) {
        // Periodic axis: a true central difference across the seam.
        const w = (u) => ((u % 1) + 1) % 1;
        const pa = da ? at(w(lo), b) : at(a, w(lo));
        const pb = da ? at(w(hi), b) : at(a, w(hi));
        if (!pa || !pb) return null;
        return { x: (pb.x - pa.x) / (2 * EPS), y: (pb.y - pa.y) / (2 * EPS), z: (pb.z - pa.z) / (2 * EPS) };
      }
      const pt = (u) => (da ? at(u, b) : at(a, u));
      if (lo >= 0 && hi <= 1) {
        const pa = pt(lo); const pb = pt(hi);
        if (!pa || !pb) return null;
        return { x: (pb.x - pa.x) / (2 * EPS), y: (pb.y - pa.y) / (2 * EPS), z: (pb.z - pa.z) / (2 * EPS) };
      }
      // Domain edge: second-order one-sided difference (-3 f0 + 4 f1 - f2) / 2h, sign kept.
      const u0 = da ? a : b; const h = lo < 0 ? EPS : -EPS;
      const f0 = pt(u0); const f1 = pt(u0 + h); const f2 = pt(u0 + 2 * h);
      if (!f0 || !f1 || !f2) return null;
      const k = 1 / (2 * h);
      return { x: (-3 * f0.x + 4 * f1.x - f2.x) * k, y: (-3 * f0.y + 4 * f1.y - f2.y) * k, z: (-3 * f0.z + 4 * f1.z - f2.z) * k };
    };
    const sample = (a, b) => {
      if (!(a >= 0 && a <= 1 && b >= 0 && b <= 1)) return null;
      const p = at(a, b);
      if (!p) return null;
      let dA = deriv(a, b, true, false); let dB = deriv(a, b, false, true);
      if (!dA || !dB) return null;
      let cx = dA.y * dB.z - dA.z * dB.y; let cy = dA.z * dB.x - dA.x * dB.z; let cz = dA.x * dB.y - dA.y * dB.x;
      if (Math.hypot(cx, cy, cz) < 1e-9) {
        // Pole / apex: re-measure the frame just inside the domain (the point is kept). That frame's
        // normal is off by ~POLE_EPS * pi, so where the a-tangents of two meridians a quarter-turn apart
        // span the tangent plane (a true pole) their cross product is used, signed to agree with it.
        const a2 = Math.min(1 - POLE_EPS, Math.max(POLE_EPS, a)); const b2 = Math.min(1 - POLE_EPS, Math.max(POLE_EPS, b));
        dA = deriv(a2, b2, true, false); dB = deriv(a2, b2, false, true);
        if (!dA || !dB) return null;
        cx = dA.y * dB.z - dA.z * dB.y; cy = dA.z * dB.x - dA.x * dB.z; cz = dA.x * dB.y - dA.y * dB.x;
        if (Math.hypot(cx, cy, cz) < 1e-12) return null;
        const t1 = deriv(a, b, true, false); const t2 = deriv(a, (b + 0.25) % 1, true, false);
        if (t1 && t2) {
          const px = t1.y * t2.z - t1.z * t2.y; const py = t1.z * t2.x - t1.x * t2.z; const pz = t1.x * t2.y - t1.y * t2.x;
          const pl = Math.hypot(px, py, pz); const cl = Math.hypot(cx, cy, cz);
          if (pl > 1e-6 * (Math.hypot(t1.x, t1.y, t1.z) * Math.hypot(t2.x, t2.y, t2.z) + 1e-12)) {
            const sgn = px * cx + py * cy + pz * cz < 0 ? -1 : 1;
            cx = (sgn * px * cl) / pl; cy = (sgn * py * cl) / pl; cz = (sgn * pz * cl) / pl;
          }
        }
      }
      // Scaled frame: P' = S P, dP' = S dP, n' ~ S^-1 n.
      let nx = (orientation * cx) / sx; let ny = (orientation * cy) / sy; let nz = (orientation * cz) / sz;
      const L = Math.hypot(nx, ny, nz) || 1;
      nx /= L; ny /= L; nz /= L;
      return {
        x: p.x * sx, y: p.y * sy, z: p.z * sz,
        dax: dA.x * sx, day: dA.y * sy, daz: dA.z * sz,
        dbx: dB.x * sx, dby: dB.y * sy, dbz: dB.z * sz,
        nx, ny, nz,
      };
    };
    return { mode, sizes, scale: { sx, sy, sz }, sample, orientation, periodicA, periodicB };
  };

  const spatialHash3 = (cell) => {
    const C = cell > 0 ? cell : 1;
    const map = new Map();
    let size = 0;
    const K = (i, j, k) => ((i + 1024) * 2048 + (j + 1024)) * 2048 + (k + 1024);
    const pts = [];
    return {
      get size() { return size; },
      insert(x, y, z, id) {
        const i = Math.floor(x / C); const j = Math.floor(y / C); const k = Math.floor(z / C);
        const key = K(i, j, k);
        let list = map.get(key);
        if (!list) { list = []; map.set(key, list); }
        pts.push(x, y, z, id);
        list.push(pts.length - 4);
        size += 1;
      },
      // Calls fn(id, d2) for every inserted point within r; stops early when fn returns true.
      near(x, y, z, r, fn) {
        const R = Math.ceil(r / C);
        const i0 = Math.floor(x / C); const j0 = Math.floor(y / C); const k0 = Math.floor(z / C);
        const r2 = r * r;
        for (let i = i0 - R; i <= i0 + R; i++) {
          for (let j = j0 - R; j <= j0 + R; j++) {
            for (let k = k0 - R; k <= k0 + R; k++) {
              const list = map.get(K(i, j, k));
              if (!list) continue;
              for (let q = 0; q < list.length; q++) {
                const o = list[q];
                const dx = pts[o] - x; const dy = pts[o + 1] - y; const dz = pts[o + 2] - z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 <= r2 && fn(pts[o + 3], d2) === true) return true;
              }
            }
          }
        }
        return false;
      },
      clear() { map.clear(); pts.length = 0; size = 0; },
    };
  };

  Scene3D.SurfaceLockChart = { metric, hash, spatialHash3, EPS };
})();
