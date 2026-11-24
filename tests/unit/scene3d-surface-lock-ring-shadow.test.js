const { loadSurfaceLockRuntime, signature } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');
const crypto = require('crypto');
const shaOf = (paths) => crypto.createHash('sha1').update(signature(paths, 9).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'ID')).digest('hex');

// Non-convex ground shadow (docs/surface-lock-contract.md A34): a torus caster is Level S, its footprint is the exact union of
// the projected triangles (hole kept), and a wrapped fill on it does not flatten on release.

const SHADOW = { shadowAngle: 45, shadowDensity: 50, shadowToneDepth: 0, shadowFalloff: 0.5, shadowLayers: false, shadowToneLaw: 'ladder' };
const GROUND = { enabled: true, scaleX: 1, scaleZ: 1, width: 320, height: 220 };
const SUN = { type: 'directional', azimuth: 135, elevation: 45, castShadows: true };

// A torus lying flat (axis y), R major, r tube, resting on y = 0, as world triangles (9 floats each).
const torusTriangles = (R, r, nu = 48, nv = 20, cx = 0, cz = 0) => {
  const P = (i, j) => {
    const u = (i % nu) / nu * 2 * Math.PI; const v = (j % nv) / nv * 2 * Math.PI;
    return [cx + (R + r * Math.cos(v)) * Math.cos(u), r + r * Math.sin(v), cz + (R + r * Math.cos(v)) * Math.sin(u)];
  };
  const out = [];
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) {
    const a = P(i, j); const b = P(i + 1, j); const c = P(i + 1, j + 1); const d = P(i, j + 1);
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  return Float64Array.from(out);
};
// buildCase centres the torus on the floor (half sunk); rest it on the ground instead (tube radius sy = 9)
const rest = (s) => { s.objectsOf()[0].params.transform.y = 9; return s; };
const castShadow = (paths) => paths.filter((p) => p && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');
const raster = (paths, cell, size) => {
  const set = new Set();
  paths.forEach((p) => {
    for (let i = 1; i < p.length; i += 1) {
      const a = p[i - 1]; const b = p[i]; const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.25)));
      for (let k = 0; k <= n; k += 1) set.add(Math.floor((a.x + (b.x - a.x) * k / n) / cell) + ',' + Math.floor((a.y + (b.y - a.y) * k / n) / cell));
    }
  });
  return set;
};
const iou = (A, B) => { let i = 0; A.forEach((k) => { if (B.has(k)) i += 1; }); return i / (A.size + B.size - i); };

describe('surface lock ring shadow (A34): non-convex caster footprint', () => {
  let rt; let V; let SH; let SL;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SH = V.Scene3D.SurfaceLockShadow; SL = V.Scene3D.SurfaceLock; });
  afterAll(() => rt && rt.cleanup());

  it('RED: supports() accepts a torus caster (primitive record and mesh record), still refuses an unknown non-convex primitive', () => {
    const base = { shadow: { shadowLayers: false, shadowToneLaw: 'ladder' }, light: SUN, ground: GROUND };
    expect(SH.supports({ ...base, casters: [{ primitive: 'torus' }] })).toBe(true);
    expect(SH.supports({ ...base, casters: [{ primitive: 'torus', shape: 'mesh', triangles: torusTriangles(30, 8) }] })).toBe(true);
    expect(SH.supports({ ...base, casters: [{ primitive: 'superformula3d' }] })).toBe(false);
    expect(SH.supports({ ...base, shadow: { shadowLayers: true }, casters: [{ primitive: 'torus' }] })).toBe(false);
  });

  it('RED: the mesh footprint is the exact union of the projected triangles (sound and complete along every drawn line) and keeps the hole', () => {
    const R = 30; const r = 8;
    const tris = torusTriangles(R, r);
    const light = { azimuth: 135, elevation: 70, type: 'directional', castShadows: true }; // steep: the hole stays open
    const dir = V.Scene3D.Lighting.lightWorldDir(light);
    const h = SH.bakeGround(GROUND, SHADOW, 0.3, 1);
    const f = SH.frameShadow(h, [{ primitive: 'torus', shape: 'mesh', triangles: tris }], dir, null);
    expect(f.world.length).toBeGreaterThan(200);
    // truth: brute-force point in the projected triangles
    const n = tris.length / 9; const P = new Float64Array(n * 6);
    for (let t = 0; t < n; t += 1) for (let v = 0; v < 3; v += 1) { const y = tris[9 * t + 3 * v + 1]; const k = y / dir.y; P[6 * t + 2 * v] = tris[9 * t + 3 * v] - k * dir.x; P[6 * t + 2 * v + 1] = tris[9 * t + 3 * v + 2] - k * dir.z; }
    const inside = (x, z) => {
      for (let t = 0; t < n; t += 1) {
        const o = 6 * t; const s = (P[o + 2] - P[o]) * (P[o + 5] - P[o + 1]) - (P[o + 3] - P[o + 1]) * (P[o + 4] - P[o]);
        let ok = true;
        for (let q = 0; q < 3 && ok; q += 1) {
          const ax = P[o + 2 * q]; const az = P[o + 2 * q + 1]; const bx = P[o + 2 * ((q + 1) % 3)]; const bz = P[o + 2 * ((q + 1) % 3) + 1];
          if (((bx - ax) * (z - az) - (bz - az) * (x - ax)) * (s > 0 ? 1 : -1) < -1e-9) ok = false;
        }
        if (ok) return true;
      }
      return false;
    };
    // soundness: every drawn segment lies inside the truth (sampled)
    let bad = 0; let tot = 0;
    const byLine = new Map();
    for (let q = 0; q < f.world.length; q += 4) {
      const x0 = f.world[q]; const z0 = f.world[q + 1]; const x1 = f.world[q + 2]; const z1 = f.world[q + 3];
      for (let k = 1; k < 8; k += 1) { tot += 1; if (!inside(x0 + (x1 - x0) * k / 8, z0 + (z1 - z0) * k / 8)) bad += 1; }
      const key = ((x0 * h.nX + z0 * h.nZ)).toFixed(6);
      if (!byLine.has(key)) byLine.set(key, []);
      byLine.get(key).push([x0, z0, x1, z1]);
    }
    expect(bad / tot).toBeLessThan(1e-3);
    // completeness: along each drawn line, truth-inside samples are covered (seam / run-floor slack only)
    let miss = 0; let ins = 0;
    byLine.forEach((segs) => {
      const [x0, z0] = segs[0]; const off = x0 * h.nX + z0 * h.nZ;
      for (let s = -80; s <= 80; s += 0.37) {
        const x = off * h.nX + s * h.dirX; const z = off * h.nZ + s * h.dirZ;
        if (!inside(x, z)) continue;
        ins += 1;
        const sx = x * h.dirX + z * h.dirZ;
        const cov = segs.some((g) => { const a = g[0] * h.dirX + g[1] * h.dirZ; const b = g[2] * h.dirX + g[3] * h.dirZ; return sx >= Math.min(a, b) - 1e-6 && sx <= Math.max(a, b) + 1e-6; });
        if (!cov) miss += 1;
      }
    });
    expect(ins).toBeGreaterThan(300);
    expect(miss / ins).toBeLessThan(0.01);
    // the hole: the footprint centre (tube mid-height projected) carries no ink while the ring does
    const cx = -(r / dir.y) * dir.x; const cz = -(r / dir.y) * dir.z;
    let centreInk = 0; let ringInk = 0;
    for (let q = 0; q < f.world.length; q += 4) {
      const mx = (f.world[q] + f.world[q + 2]) / 2 - cx; const mz = (f.world[q + 1] + f.world[q + 3]) / 2 - cz;
      const rad = Math.hypot(mx, mz);
      if (rad < R - r - 8) centreInk += 1; if (Math.abs(rad - R) < r * 0.5) ringInk += 1;
    }
    expect(centreInk, 'the hole is open').toBe(0);
    expect(ringInk).toBeGreaterThan(20);
    // determinism
    const g = SH.frameShadow(h, [{ primitive: 'torus', shape: 'mesh', triangles: tris }], dir, null);
    expect(Array.from(g.world)).toEqual(Array.from(f.world));
  });

  it('sphere / box outputs are untouched (existing hull + ellipse paths): a mesh record never changes a convex frame', () => {
    const dir = V.Scene3D.Lighting.lightWorldDir(SUN);
    const h = SH.bakeGround(GROUND, SHADOW, 0.3, 1);
    const sph = { primitive: 'sphere', shape: 'sphere', center: { x: 0, y: 25, z: 0 }, radius: 25 };
    const a = SH.frameShadow(h, [sph], dir, null);
    SH.frameShadow(h, [{ primitive: 'torus', shape: 'mesh', triangles: torusTriangles(30, 8) }], dir, null);
    expect(Array.from(SH.frameShadow(h, [sph], dir, null).world)).toEqual(Array.from(a.world));
  });

  it('RED: a torus with the ground shadow on is Level S: mazeFill and voronoiWeb are wrapped at rest (settled == drag, not the pose compose)', () => {
    ['mazeFill', 'voronoiWeb'].forEach((law) => {
      const a = rest(LR.buildCase(V, { object: 'torus', law, markSpace: 'surface', ground: true, shadow: true }));
      const b = rest(LR.buildCase(V, { object: 'torus', law, markSpace: 'pose', ground: true, shadow: true }));
      SL.clearCache(); SL.resetStats();
      const settled = a.composeFull();
      expect(SL.stats.sceneFrames, law + ': Level S frame').toBeGreaterThan(0);
      expect(shaOf(settled), law + ': not the pose compose').not.toBe(shaOf(b.composeFull()));
      a.setPose({ camYaw: 50, camPitch: 25 });
      const drag = a.composePreview();
      const rested = a.composeFull();
      expect(shaOf(rested), law + ': settled == drag at the same pose').toBe(shaOf(drag));
      expect(castShadow(rested).length, law + ': the shadow is there').toBeGreaterThan(8);
    });
  }, 300000);

  it('RED: the Level S torus shadow matches the pose-mode shadow footprint (raster IoU) at three light directions', () => {
    const lights = [{ az: 135, el: 45 }, { az: 40, el: 60 }, { az: 250, el: 35 }];
    const out = [];
    lights.forEach((l) => {
      const a = rest(LR.buildCase(V, { object: 'torus', law: 'ladder', markSpace: 'surface', ground: true, shadow: true, azimuth: l.az, elevation: l.el }));
      const b = rest(LR.buildCase(V, { object: 'torus', law: 'ladder', markSpace: 'pose', ground: true, shadow: true, azimuth: l.az, elevation: l.el }));
      SL.clearCache(); SL.resetStats();
      const sa = castShadow(a.composeFull());
      expect(SL.stats.sceneFrames, 'Level S at ' + JSON.stringify(l)).toBeGreaterThan(0);
      SL.resetStats();
      const sb = castShadow(b.composeFull());
      expect(SL.stats.sceneFrames, 'pose reference at ' + JSON.stringify(l)).toBe(0);
      expect(sa.length).toBeGreaterThan(8); expect(sb.length).toBeGreaterThan(8);
      const v = iou(raster(sa, 2), raster(sb, 2));
      out.push(v);
    });
    console.log('ring shadow IoU', JSON.stringify(out));
    out.forEach((v) => expect(v, JSON.stringify(out)).toBeGreaterThan(0.9)); // observed 0.94 - 0.98; the residual is hatch phase / pitch and 2 mm raster edge cells
  }, 300000);
});
