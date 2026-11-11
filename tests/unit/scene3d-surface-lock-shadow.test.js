const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// Locked ground shadow (docs/surface-lock-contract.md §10): SurfaceLockShadow.supports / bakeGround / frameShadow.

const SHADOW = { shadowAngle: 45, shadowDensity: 50, shadowToneDepth: 0.75, shadowFalloff: 0.5, shadowLayers: false, shadowToneLaw: 'ladder' };
const GROUND = { enabled: true, scaleX: 1, scaleZ: 1, width: 320, height: 220 };
const SUN = { type: 'directional', azimuth: 135, elevation: 45, castShadows: true };
const SPHERE = { primitive: 'sphere', shape: 'sphere', center: { x: 0, y: 25, z: 0 }, radius: 25 };
const poseFor = (yaw, pitch = 20) => ({ cam: { yaw, pitch, roll: 0, scale: 1, cx: 160, cy: 110, persp: false } });
const boxHull = (cx, cy, cz, h) => {
  const pts = [];
  [-1, 1].forEach((a) => [-1, 1].forEach((b) => [-1, 1].forEach((c) => pts.push({ x: cx + a * h, y: cy + b * h, z: cz + c * h }))));
  return { primitive: 'box', shape: 'hull', points: pts };
};

describe('surface lock ground shadow', () => {
  let rt; let V; let SH; let dir;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime(); V = rt.V; SH = V.Scene3D.SurfaceLockShadow;
    dir = V.Scene3D.Lighting.lightWorldDir(SUN);
  });
  afterAll(() => rt && rt.cleanup());
  const bake = (cfg = SHADOW, seed = 1) => SH.bakeGround(GROUND, cfg, 0.3, seed);
  const lineIndexOf = (h, x, z) => {
    const d = x * h.nX + z * h.nZ;
    let best = 0; let bd = Infinity;
    for (let k = 0; k < h.count; k += 1) { const e = Math.abs(h.d[k] - d); if (e < bd) { bd = e; best = k; } }
    return { k: best, err: bd };
  };

  it('bakeGround is pose-free: identical output whatever frames ran before', () => {
    SH.clearCache();
    const a = bake();
    const snap = (h) => JSON.stringify([Array.from(h.d), Array.from(h.t0), Array.from(h.t1), Array.from(h.rank), Array.from(h.level)]);
    const before = snap(a);
    [-30, 80, 150].forEach((yaw) => SH.frameShadow(a, [SPHERE], dir, poseFor(yaw)));
    SH.frameShadow(a, [SPHERE], V.Scene3D.Lighting.lightWorldDir({ azimuth: 10, elevation: 30 }), poseFor(10, 45));
    expect(snap(a)).toBe(before);
    SH.clearCache();
    expect(snap(bake())).toBe(before);
    expect(SH.bakeGround.length).toBe(4); // (groundSpec, shadowCfg, penWidth, seed): no camera, no light
  });

  it('world-lock: across 12 camera yaws every endpoint lies on a baked hatch line (1e-9)', () => {
    const h = bake();
    for (let i = 0; i < 12; i += 1) {
      const f = SH.frameShadow(h, [SPHERE, boxHull(55, 20, 10, 20)], dir, poseFor(-180 + i * 30));
      expect(f.world.length).toBeGreaterThan(40);
      expect(f.runs.length * 4).toBe(f.world.length);
      for (let q = 0; q < f.world.length; q += 2) {
        const { err } = lineIndexOf(h, f.world[q], f.world[q + 1]);
        expect(err).toBeLessThan(1e-9);
      }
    }
  });

  it('sphere footprint: endpoints on the analytic ellipse, union has no overlaps, light moves footprint not lines', () => {
    const h = bake({ ...SHADOW, shadowToneDepth: 0 });
    const f = SH.frameShadow(h, [SPHERE], dir, null);
    const A = 25 / Math.abs(dir.y); const hl = Math.hypot(dir.x, dir.z);
    const hx = dir.x / hl; const hz = dir.z / hl;
    const cx = 0 - (25 / dir.y) * dir.x; const cz = 0 - (25 / dir.y) * dir.z;
    let maxErr = 0;
    for (let q = 0; q < f.world.length; q += 2) {
      const dx = f.world[q] - cx; const dz = f.world[q + 1] - cz;
      const a = (dx * hx + dz * hz) / A; const b = (dx * -hz + dz * hx) / 25;
      // distance error along the radial direction, in mm
      maxErr = Math.max(maxErr, Math.abs(Math.hypot(a, b) - 1) * 25);
    }
    expect(f.world.length).toBeGreaterThan(80);
    expect(maxErr).toBeLessThan(0.01);

    // two overlapping casters: intervals on one line never overlap or touch
    const two = SH.frameShadow(h, [SPHERE, { ...SPHERE, center: { x: 20, y: 25, z: 5 } }], dir, null);
    const byLine = new Map();
    for (let q = 0; q < two.world.length; q += 4) {
      const { k } = lineIndexOf(h, two.world[q], two.world[q + 1]);
      const s0 = two.world[q] * h.dirX + two.world[q + 1] * h.dirZ; const s1 = two.world[q + 2] * h.dirX + two.world[q + 3] * h.dirZ;
      if (!byLine.has(k)) byLine.set(k, []);
      byLine.get(k).push([Math.min(s0, s1), Math.max(s0, s1)]);
    }
    let multi = 0;
    byLine.forEach((list) => {
      list.sort((p, r) => p[0] - r[0]);
      for (let i = 1; i < list.length; i += 1) { multi += 1; expect(list[i][0]).toBeGreaterThan(list[i - 1][1]); }
    });
    // light change: a different footprint, still only baked lines
    const sun2 = V.Scene3D.Lighting.lightWorldDir({ azimuth: 200, elevation: 35 });
    const moved = SH.frameShadow(h, [SPHERE], sun2, null);
    expect(Array.from(moved.world)).not.toEqual(Array.from(f.world));
    for (let q = 0; q < moved.world.length; q += 2) expect(lineIndexOf(h, moved.world[q], moved.world[q + 1]).err).toBeLessThan(1e-9);
    expect(multi).toBeGreaterThanOrEqual(0);
  });

  it('coverage: hatched ink inside the footprint matches the pose-mode Shadows.build default scene within 15%', () => {
    const Sh = V.Scene3D.Shadows; const orig = Sh.build; let cap = null;
    Sh.build = function wrapped(scene, p, bounds, clipper, d2, opts) {
      const r = orig.apply(this, arguments); cap = { r, p, scene }; return r;
    };
    const ratios = [];
    try {
      [-30, 40, 150].forEach((yaw) => {
        // W3-E: this is the POSE-mode arm (it captures Shadows.build), so pin pose; a fresh scene is now born surface
        const s = buildSurfaceLockScene(V, { kind: 'sphere', markSpace: 'pose' });
        s.setPose({ camYaw: yaw, camPitch: 20 });
        s.composeFull();
        const ink = (paths) => paths.reduce((t, q) => { let L = 0; for (let i = 1; i < q.length; i += 1) L += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y); return t + L; }, 0);
        const poseInk = ink(cap.r);
        const po = cap.scene.projOpts;
        const h = SH.bakeGround({ width: 320, height: 220 }, { ...cap.p.shadow, tone: cap.p.tone }, 0.3, 1);
        const f = SH.frameShadow(h, [SPHERE], V.Scene3D.Lighting.lightWorldDir(cap.p.lights[0]),
          { cam: { yaw, pitch: 20, roll: 0, scale: po.scale, cx: po.centerX, cy: po.centerY, persp: false } });
        // pose mode hides what the sphere covers: remove the silhouette disc from the locked segments too
        const P = (x, y, z) => V.Geometry3D.projectPoint(V.Geometry3D.rotatePoint({ x, y, z }, { yaw, pitch: 20, roll: 0 }), { centerX: po.centerX, centerY: po.centerY, scale: po.scale });
        const c = P(0, 25, 0);
        let lockedInk = 0;
        f.runs.forEach((run) => {
          const [a, b] = run.pts; const steps = 40;
          for (let i = 0; i < steps; i += 1) {
            const t = (i + 0.5) / steps; const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t;
            if (Math.hypot(x - c.x, y - c.y) > 25 * po.scale) lockedInk += Math.hypot(b.x - a.x, b.y - a.y) / steps;
          }
        });
        ratios.push({ yaw, poseInk: +poseInk.toFixed(1), lockedInk: +lockedInk.toFixed(1), ratio: +(lockedInk / poseInk).toFixed(3) });
      });
    } finally { Sh.build = orig; }
    console.log('shadow coverage (locked/pose ink)', JSON.stringify(ratios));
    ratios.forEach((r) => { expect(Math.abs(r.ratio - 1)).toBeLessThan(0.15); });
  });

  it('F-S1: every projected run point carries the camera depth z (so a caller can occlusion-clip it)', () => {
    const h = bake();
    const pose = poseFor(40);
    const f = SH.frameShadow(h, [SPHERE], dir, pose);
    expect(f.runs.length).toBeGreaterThan(20);
    f.runs.forEach((run, i) => {
      const w = f.world; // [x0, z0, x1, z1] per run
      run.pts.forEach((pt, e) => {
        expect(Number.isFinite(pt.z)).toBe(true);
        const c = V.Geometry3D.rotatePoint({ x: w[4 * i + 2 * e], y: 0, z: w[4 * i + 2 * e + 1] }, { yaw: 40, pitch: 20, roll: 0 });
        expect(Math.abs(pt.z - c.z)).toBeLessThan(1e-9);
      });
    });
  });

  it('F-S2: the thinned subset is evenly spaced (gaps differ by at most one line) at the density measured at the caster footprint', () => {
    const h = bake({ ...SHADOW, shadowToneDepth: 0 });
    const idxOf = (f) => {
      const set = new Set();
      for (let q = 0; q < f.world.length; q += 4) set.add(lineIndexOf(h, f.world[q], f.world[q + 1]).k);
      return Array.from(set).sort((a, b) => a - b);
    };
    const casters = [{ ...SPHERE, center: { x: 90, y: 25, z: -70 } }];
    // perspective makes the screen pitch at the footprint differ from the one at the world origin
    const cases = [
      { cam: { yaw: 40, pitch: 20, roll: 0, scale: 1, cx: 160, cy: 110, persp: true, focal: 300, dist: 400 } },
      { cam: { yaw: -30, pitch: 35, roll: 0, scale: 1, cx: 160, cy: 110, persp: false } },
      { cam: { yaw: 150, pitch: 10, roll: 0, scale: 1, cx: 160, cy: 110, persp: false } },
    ];
    const lightD = dir;
    cases.forEach((pose, ci) => {
      const f = SH.frameShadow(h, casters, lightD, pose);
      const ks = idxOf(f);
      expect(ks.length).toBeGreaterThan(4);
      const gaps = new Set(); for (let i = 1; i < ks.length; i += 1) gaps.add(ks[i] - ks[i - 1]);
      // expected thin: perpendicular screen pitch per unit world pitch at the footprint centre
      const t = casters[0].center.y / lightD.y;
      const fx = casters[0].center.x - t * lightD.x; const fz = casters[0].center.z - t * lightD.z;
      const c = pose.cam;
      const opts = { centerX: c.cx, centerY: c.cy, scale: c.scale };
      if (c.persp) { opts.focal = c.focal; opts.cameraDist = c.dist; }
      const P = (x, z) => V.Geometry3D.projectPoint(V.Geometry3D.rotatePoint({ x, y: 0, z }, { yaw: c.yaw, pitch: c.pitch, roll: 0 }), opts);
      const o = P(fx, fz); const pu = P(fx + h.dirX, fz + h.dirZ); const pn = P(fx + h.nX, fz + h.nZ);
      const lu = Math.hypot(pu.x - o.x, pu.y - o.y);
      const fac = Math.abs((pu.x - o.x) * (pn.y - o.y) - (pu.y - o.y) * (pn.x - o.x)) / lu / h.scaleRef;
      // FX-S spacing floor (owner Q3): the stride is rounded up so the closest drawn pair stays >= 0.8 x the pose spacing.
      const thin0 = Math.min(1, fac);
      const want = 1 / (thin0 < 1 ? Math.min(thin0, 1 / Math.max(1, Math.ceil(0.8 / thin0 - 1e-9))) : 1);
      expect(want * thin0, `pose ${ci} spacing floor`).toBeGreaterThanOrEqual(0.8 - 1e-9);
      const gl = Array.from(gaps);
      expect(Math.max(...gl) - Math.min(...gl), `pose ${ci} gaps ${gl}`).toBeLessThanOrEqual(1);
      expect(Math.min(...gl)).toBeGreaterThanOrEqual(Math.floor(want - 1e-6));
      expect(Math.max(...gl)).toBeLessThanOrEqual(Math.ceil(want + 1e-6));
      const mean = (ks[ks.length - 1] - ks[0]) / (ks.length - 1);
      expect(Math.abs(mean / want - 1)).toBeLessThan(0.08);
    });
  });

  it('supports: false for area/point/spot lights, shadowLayers, no ground, grazing light; true for the default sun', () => {
    const ok = { shadow: SHADOW, light: SUN, ground: GROUND, casters: [{ primitive: 'sphere' }, { primitive: 'box' }] };
    expect(SH.supports(ok)).toBe(true);
    ['area', 'point', 'spot'].forEach((type) => expect(SH.supports({ ...ok, light: { ...SUN, type, position: { x: 0, y: 100, z: 0 } } }), type).toBe(false));
    expect(SH.supports({ ...ok, shadow: { ...SHADOW, shadowLayers: true } })).toBe(false);
    expect(SH.supports({ ...ok, ground: null })).toBe(false);
    expect(SH.supports({ ...ok, ground: { enabled: false } })).toBe(false);
    expect(SH.supports({ ...ok, light: { ...SUN, elevation: 1 } })).toBe(false);
    expect(SH.supports({ ...ok, light: { ...SUN, castShadows: false } })).toBe(false);
    expect(SH.supports({ ...ok, casters: [{ primitive: 'torus' }] })).toBe(false);
    expect(SH.supports({ ...ok, shadow: { ...SHADOW, shadowMode: 'inverse' } })).toBe(false);
  });

  it('perf: frameShadow and bake stay inside the contract budgets', () => {
    SH.clearCache();
    const t0 = performance.now(); const h = bake(SHADOW, 7); const bakeMs = performance.now() - t0;
    const times = [];
    for (let i = 0; i < 60; i += 1) { const s = performance.now(); SH.frameShadow(h, [SPHERE], dir, poseFor(-30)); times.push(performance.now() - s); }
    times.sort((a, b) => a - b);
    console.log('shadow perf: bake ms', bakeMs.toFixed(2), 'frame median ms', times[30].toFixed(3), 'lines', h.count);
    expect(bakeMs).toBeLessThan(20);
    expect(times[30]).toBeLessThan(1);
  });
});
