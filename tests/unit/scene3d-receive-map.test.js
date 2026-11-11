const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');
const LR = require('../helpers/light-realism');

// Light realism U9: SurfaceLockShadow.receiveMap — a light-space depth map giving vis(p) for any receiver
// (other objects AND self cast shadows). Module level; rebuilt only on light / caster change, never on a camera orbit.

const DEG = Math.PI / 180;
const v = (x, y, z) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return v(a.x / l, a.y / l, a.z / l); };

// ---- meshes (world-space triangle soups; inscribed like the app's tessellations) -------------------------------
const gridMesh = (nu, nv, f) => {
  const tris = [];
  const P = (i, j) => f(i / nu, j / nv);
  for (let i = 0; i < nu; i += 1) for (let j = 0; j < nv; j += 1) {
    const a = P(i, j); const b = P(i + 1, j); const c = P(i + 1, j + 1); const d = P(i, j + 1);
    tris.push({ a, b, c }, { a, b: c, c: d });
  }
  return tris;
};
const sphereMesh = (c, r, n = 64) => gridMesh(n, n / 2, (u, w) => {
  const th = u * 2 * Math.PI; const ph = w * Math.PI;
  return v(c.x + r * Math.sin(ph) * Math.cos(th), c.y + r * Math.cos(ph), c.z + r * Math.sin(ph) * Math.sin(th));
});
const torusMesh = (c, R, r, nu = 96, nv = 48) => gridMesh(nu, nv, (u, w) => {
  const th = u * 2 * Math.PI; const ph = w * 2 * Math.PI;
  return v(c.x + (R + r * Math.cos(ph)) * Math.cos(th), c.y + r * Math.sin(ph), c.z + (R + r * Math.cos(ph)) * Math.sin(th));
});
const torusNormal = (c, R, th, ph) => v(Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th));
const boxMesh = (c, hx, hy, hz) => {
  const q = (a, b, cc, d) => [{ a, b, c: cc }, { a, b: cc, c: d }];
  const p = (sx, sy, sz) => v(c.x + sx * hx, c.y + sy * hy, c.z + sz * hz);
  return [].concat(
    q(p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1)), q(p(-1, -1, -1), p(-1, -1, 1), p(1, -1, 1), p(1, -1, -1)),
    q(p(-1, -1, -1), p(1, -1, -1), p(1, 1, -1), p(-1, 1, -1)), q(p(-1, -1, 1), p(-1, 1, 1), p(1, 1, 1), p(1, -1, 1)),
    q(p(-1, -1, -1), p(-1, 1, -1), p(-1, 1, 1), p(-1, -1, 1)), q(p(1, -1, -1), p(1, -1, 1), p(1, 1, 1), p(1, 1, -1)));
};
const SUN = (az = 135, el = 55, extra = {}) => Object.assign({ type: 'directional', azimuth: az, elevation: el, intensity: 1, castShadows: true }, extra);
const toward = (V, light) => V.Scene3D.Lighting.towardLight(light);

// Independent oracle: does the toward-light ray from P hit the sphere?
const sphereOccludes = (P, t, c, r) => {
  const oc = sub(c, P); const tca = dot(oc, t);
  if (tca <= 0) return { hit: false, off: Infinity };
  const d = Math.sqrt(Math.max(0, dot(oc, oc) - tca * tca));
  return { hit: d < r, off: Math.abs(d - r) };
};

describe('receive shadow map (SurfaceLockShadow.receiveMap)', () => {
  let rt; let V; let SH; let SR; let Reg;
  beforeAll(async () => { rt = await loadSurfaceLockRuntime(); V = rt.V; SH = V.Scene3D.SurfaceLockShadow; SR = V.Scene3D.ShadowReceive; Reg = V.Scene3D.Regions; });
  afterAll(() => rt && rt.cleanup());
  beforeEach(() => { SH.clearCache(); SH.resetReceiveStats(); });

  const C = v(0, 45, 0); const R = 20;
  const sphere = () => ({ id: 'ball', triangles: sphereMesh(C, R, 64) });
  const slab = () => ({ id: 'slab', triangles: boxMesh(v(0, 5, 0), 70, 5, 70) });
  const topPoints = (step = 2) => { const out = []; for (let x = -60; x <= 60; x += step) for (let z = -60; z <= 60; z += step) out.push(v(x, 10, z)); return out; };
  const UP = v(0, 1, 0);

  it('points in the footprint of a sphere over a box get vis 0; the rest stay lit (vs an analytic oracle)', () => {
    const light = SUN(135, 55);
    const map = SH.receiveMap({ lights: [light], casters: [sphere(), slab()] });
    const t = toward(V, light);
    let inFoot = 0; let agree = 0; let total = 0; let shadowedWrong = 0;
    topPoints(1.5).forEach((P) => {
      const o = sphereOccludes(P, t, C, R);
      if (o.off < 1.0) return; // within 1 mm of the penumbra edge: both answers are legitimate
      total += 1;
      const vis = map.visFn(UP, P);
      if (o.hit) inFoot += 1;
      if ((o.hit ? 0 : 1) === vis) agree += 1; else if (vis === 0) shadowedWrong += 1;
    });
    expect(inFoot).toBeGreaterThan(300);
    expect(agree / total).toBeGreaterThanOrEqual(0.995);
    expect(shadowedWrong).toBeLessThanOrEqual(2); // never darkens lit paper
  });

  it('no shadow acne: lit faces of the caster itself stay vis 1', () => {
    const light = SUN(135, 40);
    const map = SH.receiveMap({ lights: [light], casters: [sphere()] });
    const t = toward(V, light);
    let n = 0; let dark = 0;
    for (let i = 0; i < 4000; i += 1) {
      const th = i * 2.399963; const ph = Math.acos(1 - 2 * ((i + 0.5) / 4000));
      const nrm = v(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      if (dot(nrm, t) < 0.05) continue;
      n += 1;
      const P = v(C.x + R * nrm.x, C.y + R * nrm.y, C.z + R * nrm.z);
      if (map.visFn(nrm, P) < 0.5) dark += 1;
    }
    expect(n).toBeGreaterThan(1500);
    expect(dark / n).toBeLessThanOrEqual(0.002);
    // The normal-free shadowFn hook (Regions.shade) must not acne either.
    let dark2 = 0;
    for (let i = 0; i < 2000; i += 1) {
      const th = i * 2.399963; const ph = Math.acos(1 - 2 * ((i + 0.5) / 2000));
      const nrm = v(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      if (dot(nrm, t) < 0.15) continue;
      if (map.shadowFn(v(C.x + R * nrm.x, C.y + R * nrm.y, C.z + R * nrm.z), light)) dark2 += 1;
    }
    expect(dark2).toBeLessThanOrEqual(4);
  });

  it('self cast shadow: the inside of a torus matches an exact ray test', () => {
    const TC = v(0, 12, 0); const TR = 30; const Tr = 12;
    const light = SUN(135, 22);
    const tris = torusMesh(TC, TR, Tr);
    const map = SH.receiveMap({ lights: [light], casters: [{ id: 'ring', triangles: tris }] });
    const occ = { triangles: tris.map((tr) => ({ a: tr.a, b: tr.b, c: tr.c, objectId: 'ring' })) };
    const t = toward(V, light);
    let n = 0; let shadowed = 0; let agree = 0;
    for (let i = 0; i < 90; i += 1) for (let j = 0; j < 90; j += 1) {
      const th = (i / 90) * 2 * Math.PI; const ph = (j / 90) * 2 * Math.PI + 0.01;
      const nrm = torusNormal(TC, TR, th, ph);
      if (dot(nrm, t) < 0.1) continue;
      const P = v(TC.x + (TR + Tr * Math.cos(ph)) * Math.cos(th) + nrm.x * 0.02, TC.y + Tr * Math.sin(ph) + nrm.y * 0.02, TC.z + (TR + Tr * Math.cos(ph)) * Math.sin(th) + nrm.z * 0.02);
      const exact = SR.pointInShadow(P, light, occ) ? 0 : 1;
      n += 1;
      if (exact === 0) shadowed += 1;
      if (map.visFn(nrm, P) === exact) agree += 1;
    }
    expect(shadowed).toBeGreaterThan(40); // not vacuous: the hole really shades its own inner wall
    expect(agree / n).toBeGreaterThanOrEqual(0.97);
  });

  it('thin casters (rod 0.2 mm) still cast a continuous shadow line', () => {
    const light = SUN(90, 60);
    const rod = { id: 'rod', triangles: boxMesh(v(0, 30, 0), 30, 0.1, 0.1) };
    const ground = { id: 'g', triangles: boxMesh(v(0, -1, 0), 80, 1, 80) };
    const map = SH.receiveMap({ lights: [light], casters: [rod, ground] });
    const trv = SR.buildOccluderSet; void trv;
    const dirTravel = V.Scene3D.Lighting.lightWorldDir(light);
    const s = 30 / -dirTravel.y; // travel from y=30 to y=0
    const cx = 0 + dirTravel.x * s; const cz = 0 + dirTravel.z * s;
    let hit = 0; let n = 0; let offHit = 0;
    for (let x = -25; x <= 25; x += 0.5) {
      n += 1;
      if (map.visFn(UP, v(cx + x, 0, cz)) === 0) hit += 1;
      if (map.visFn(UP, v(cx + x, 0, cz + 4)) === 0) offHit += 1;
    }
    expect(hit / n).toBeGreaterThanOrEqual(0.95);
    expect(offHit).toBe(0);
  });

  it('multiple directional lights: per-light vis, and an n.L-weighted blend', () => {
    const a = SUN(135, 55); const b = SUN(315, 55, { intensity: 1 });
    const map = SH.receiveMap({ lights: [a, b], casters: [sphere(), slab()] });
    const ta = toward(V, a);
    // A ground point on the ray from the ball toward light A's shadow, which light B (opposite side) leaves lit.
    const travel = V.Scene3D.Lighting.lightWorldDir(a);
    const s = (C.y - 10) / -travel.y;
    const P = v(C.x + travel.x * s, 10, C.z + travel.z * s);
    expect(map.visForLight(0, UP, P)).toBe(0);
    expect(map.visForLight(1, UP, P)).toBe(1);
    const blend = map.visFn(UP, P);
    expect(blend).toBeGreaterThan(0.1); expect(blend).toBeLessThan(0.9);
    // Regions.shade accepts the hook: light A blocked => D comes from light B only.
    const lit = Reg.shade(UP, P, [a, b], { model: 'v2', shadowFn: map.shadowFn });
    const none = Reg.shade(UP, P, [a, b], { model: 'v2' });
    expect(lit.D).toBeLessThan(none.D - 0.1);
    void ta;
  });

  it('point lights fall back to the exact ray test (correct, not mapped)', () => {
    const light = { type: 'point', position: v(0, 120, 0), intensity: 1, castShadows: true };
    const map = SH.receiveMap({ lights: [light], casters: [sphere(), slab()] });
    expect(map.visFn(UP, v(0, 10, 0))).toBe(0);
    expect(map.visFn(UP, v(50, 10, 50))).toBe(1);
  });

  it('M8 (module level): shadowed points shade to ambient and lose the direct term; lit points do not', () => {
    const light = SUN(135, 55);
    const map = SH.receiveMap({ lights: [light], casters: [sphere(), slab()] });
    const t = toward(V, light);
    const A = Reg.SHADE_DEFAULTS.a0;
    const cells = { L: [], vis: [], ink: [] };
    const cov = (L) => 0.4 * (1 - L); // any non-increasing tone law
    topPoints(2).forEach((P) => {
      const r = Reg.shade(UP, P, [light], { model: 'v2', shadowFn: map.shadowFn });
      const o = sphereOccludes(P, t, C, R);
      if (o.off < 1.0) return;
      cells.L.push(r.L); cells.vis.push(map.visFn(UP, P)); cells.ink.push(cov(r.L));
      if (o.hit) { expect(r.D).toBe(0); expect(Math.abs(r.L - A)).toBeLessThan(0.011); }
    });
    const profile = { n: cells.L.length, areaCell: 1, penWidth: 1, cells: { L: Float32Array.from(cells.L), vis: Float32Array.from(cells.vis), ink: Float32Array.from(cells.ink) } };
    const m8 = LR.m8Shadow(profile, { cAmbient: cov(A) });
    expect(m8.shaded).not.toBeNull();
    expect(m8.pass).toBe(true);
  });

  it('rebuild counters: 0 on a camera orbit, 1 on a light move, 1 on a caster move', () => {
    const light = SUN(135, 55);
    const args = (lt, dx = 0) => ({ lights: [lt], casters: [{ id: 'ball', triangles: sphereMesh(v(dx, 45, 0), R, 64) }, slab()] });
    SH.receiveMap(args(light));
    expect(SH.receiveStats().builds).toBe(1);
    SH.resetReceiveStats();
    for (let yaw = 0; yaw < 24; yaw += 1) SH.receiveMap(args(SUN(135, 55))); // an orbit re-asks with identical light + geometry
    expect(SH.receiveStats().builds).toBe(0);
    expect(SH.receiveStats().hits).toBe(24);
    SH.receiveMap(args(SUN(150, 55)));
    expect(SH.receiveStats().builds).toBe(1);
    SH.receiveMap(args(SUN(150, 55), 3));
    expect(SH.receiveStats().builds).toBe(2);
    SH.receiveMap(args(SUN(150, 55, { intensity: 0.5 }), 3)); // brightness is not geometry
    expect(SH.receiveStats().builds).toBe(2);
  });

  it('perf: map build on a two-object scene', () => {
    const casters = [{ id: 'ball', triangles: sphereMesh(C, R, 96) }, { id: 'torus', triangles: torusMesh(v(60, 15, 0), 20, 8, 96, 48) }, slab()];
    const t0 = performance.now();
    const map = SH.receiveMap({ lights: [SUN(135, 55)], casters });
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`receiveMap build: ${ms.toFixed(1)} ms, ${map.triangles} tris, ${map.res}^2 @ ${map.texel.toFixed(3)} mm`);
    expect(ms).toBeLessThan(400);
    const q0 = performance.now();
    for (let i = 0; i < 100000; i += 1) map.visFn(UP, v((i % 100) - 50, 10, ((i / 100) | 0) % 100 - 50));
    expect(performance.now() - q0).toBeLessThan(500);
  });
});
