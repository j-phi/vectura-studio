const { loadSurfaceLockRuntime, DEFAULT_POSES } = require('../helpers/surface-lock-scene');
const { buildSphere } = require('../helpers/surface-lock-synthetic-sphere');

// Surface-locked fills: the core frame pipeline, stats and bake cache (docs/surface-lock-contract.md §4, §5, §6, §8, §11, §12, §13).
// All on a synthetic MarkSet (lat-long rings, R 20, nested by level) and fake bakers / visibility / shadow modules.

const BOUNDS = { width: 320, height: 220, penWidth: 0 };
const NZ = 0.08;
const CAM = { yaw: 0, pitch: 0, roll: 0, zoom: 1, projection: 'orthographic' };
const OBJ_POSES = DEFAULT_POSES.map((p, i) => ({ camYaw: p.camYaw, camPitch: p.camPitch, objYaw: p.objYaw || 0, x: 3 * i - 9, y: 2 - i, z: i % 3 }));

describe('surface lock frame pipeline', () => {
  let rt; let V; let SL; let G3; let Scene; let MS; let sph;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime();
    V = rt.V; SL = V.Scene3D.SurfaceLock; G3 = V.Geometry3D; Scene = V.Scene3D.Scene; MS = V.Scene3D.SurfaceLockMarkSet;
    sph = buildSphere(V, {});
  });
  afterAll(() => rt && rt.cleanup());
  beforeEach(() => { SL.resetStats(); SL.clearCache(); });

  const camOf = (p) => ({ ...CAM, yaw: p.camYaw || 0, pitch: p.camPitch || 0 });
  const tOf = (p) => ({ x: p.x || 0, y: p.y || 0, z: p.z || 0, yaw: p.objYaw || 0, pitch: 0, roll: 0, scale: 1 });
  const poseFor = (p) => SL.poseOf(tOf(p), camOf(p), BOUNDS);
  const permissive = { toneFn: () => 1, tone: null, penWidth: 0, objectId: 'o' };

  // Independent oracles (Geometry3D rotation, not the module's matrices).
  const vert = (ms, v) => ({ x: ms.positions[3 * v], y: ms.positions[3 * v + 1], z: ms.positions[3 * v + 2] });
  const facingOf = (ms, v, p) => {
    const n = MS.octDecode(ms.normals, 2 * v, [0, 0, 0]);
    const nw = G3.rotatePoint({ x: n[0], y: n[1], z: n[2] }, { yaw: p.objYaw || 0, pitch: 0, roll: 0 });
    return G3.rotatePoint(nw, { yaw: p.camYaw || 0, pitch: p.camPitch || 0, roll: 0 }).z;
  };
  const oracleProject = (ms, v, p) => Scene.projectWorldPoint(Scene.applyObjectTransform(vert(ms, v), tOf(p)), camOf(p), BOUNDS);
  const flat = (lines) => { const a = []; lines.forEach((l) => l.forEach((q) => a.push(q))); return a; };

  it('1. an orthographic frame vertex equals Scene.projectWorldPoint(applyObjectTransform) within 1e-9 mm at 8 poses (§4)', () => {
    OBJ_POSES.forEach((p) => {
      const lines = SL.frame([sph.ms], poseFor(p), permissive);
      const cell = new Map();
      flat(lines).forEach((q) => { const k = `${Math.round(q.x * 100)}|${Math.round(q.y * 100)}`; (cell.get(k) || cell.set(k, []).get(k)).push(q); });
      let checked = 0; let worst = 0;
      for (let v = 0; v < sph.ms.vertexCount; v += 1) {
        if (facingOf(sph.ms, v, p) < 0.2) continue;
        const o = oracleProject(sph.ms, v, p);
        const cx = Math.round(o.x * 100); const cy = Math.round(o.y * 100);
        let best = Infinity;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          (cell.get(`${cx + dx}|${cy + dy}`) || []).forEach((q) => { best = Math.min(best, Math.max(Math.abs(q.x - o.x), Math.abs(q.y - o.y), Math.abs(q.z - o.z))); });
        }
        worst = Math.max(worst, best); checked += 1;
      }
      expect(checked).toBeGreaterThan(5000);
      expect(worst).toBeLessThan(1e-9);
    });
  });

  it('2. no emitted point has facing cosine < NZ_CULL; cut endpoints sit at c = 0.08 within 1e-6 (§6)', () => {
    // 16 meridians (1 mm steps pole to pole) so every emitted point can be traced to its segment.
    const b = MS.createBuilder({ bakerId: 'synthetic', key: 'm', objectId: 'o', meta: { p0: 2, gain: 2, minMarkMM: 0 } });
    const R = 20; const runs = [];
    for (let m = 0; m < 16; m++) {
      const ph = 2 * Math.PI * m / 16; const n = 63;
      b.beginRun(0, 0, 0, 0); const run = [];
      for (let k = 0; k <= n; k++) {
        const th = Math.PI * k / n; const q = [R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th)];
        b.vertex(q[0], q[1], q[2], q[0] / R, q[1] / R, q[2] / R); run.push(q);
      }
      b.endRun(); runs.push(run);
    }
    const ms = b.finish();
    [OBJ_POSES[0], OBJ_POSES[3], OBJ_POSES[6], OBJ_POSES[7]].forEach((p) => {
      const lines = SL.frame([ms], poseFor(p), permissive);
      const nV = ms.vertexCount; const proj = []; const fac = [];
      for (let v = 0; v < nV; v++) { proj.push(oracleProject(ms, v, p)); fac.push(facingOf(ms, v, p)); }
      let cuts = 0;
      flat(lines).forEach((q) => {
        let found = null;
        for (let r = 0; r < ms.runCount && found === null; r++) {
          for (let v = ms.runStart[r]; v < ms.runStart[r + 1] - 1; v++) {
            const a = proj[v]; const c = proj[v + 1];
            const d = [c.x - a.x, c.y - a.y, c.z - a.z]; const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
            if (L2 < 1e-18) continue;
            const u = ((q.x - a.x) * d[0] + (q.y - a.y) * d[1] + (q.z - a.z) * d[2]) / L2;
            if (u < -1e-9 || u > 1 + 1e-9) continue;
            if (Math.hypot(a.x + u * d[0] - q.x, a.y + u * d[1] - q.y, a.z + u * d[2] - q.z) > 1e-9) continue;
            found = fac[v] + Math.min(1, Math.max(0, u)) * (fac[v + 1] - fac[v]);
            if (u > 1e-9 && u < 1 - 1e-9) { cuts += 1; expect(Math.abs(found - NZ)).toBeLessThan(1e-6); }
            break;
          }
        }
        expect(found, 'emitted point traced to a segment').not.toBeNull();
        expect(found).toBeGreaterThanOrEqual(NZ - 1e-6);
      });
      expect(cuts).toBeGreaterThan(8);
    });
  });

  it('3. constant LUT: drawn run count per level equals the rank-threshold count; tone crossings at t = k within 1e-6 (§5)', () => {
    const cap = buildSphere(V, { thetaMax: Math.PI / 3 }); // +z cap, camera on +z: every vertex faces >= 0.5
    const pose = SL.poseOf({}, CAM, BOUNDS);
    const lutOf = (fn) => { const l = new Float32Array(257); for (let k = 0; k <= 256; k++) l[k] = fn(k / 256); return l; };
    const keyOf = (level, rank) => (level === 0 ? rank : Math.pow(2, level - 1) * (1 + rank));
    [0.51, 1.52, 2.53, 3.3, 7.9, 20].forEach((t) => {
      const lut = lutOf(() => t / cap.p0); // t = p0 * s * lut, s = 1
      const lines = SL.frame([cap.ms], pose, { toneFn: () => 0.5, tone: { lut }, penWidth: 0, objectId: 'o' });
      let expected = 0;
      for (let r = 0; r < cap.ms.runCount; r++) if (keyOf(cap.ms.runLevel[r], MS.rankOf(cap.ms, r)) < t) expected += 1;
      expect(lines.length, `t=${t}`).toBe(expected);
      expect(expected).toBeGreaterThan(0);
    });
    // Ramp: three level-0 rings at ranks .25/.5/.75, I = (x + 20) / 40, lut linear in I => t = 1.6 * I... crossings at t = rank.
    const ramp = buildSphere(V, { thetaMax: Math.PI / 3, levels: 1, M: 32, ranksOnly: [0.25, 0.5, 0.75] });
    const m = 1.6;
    const lut = new Float32Array(257); for (let k = 0; k <= 256; k++) lut[k] = m * (k / 256) / ramp.p0;
    const lines = SL.frame([ramp.ms], pose, { toneFn: (n, p) => (p.x + 20) / 40, tone: { lut }, penWidth: 0, objectId: 'o' });
    const keys = [0.25, 0.5, 0.75]; let cuts = 0; let closedLoops = 0;
    lines.forEach((l) => {
      const a = l[0]; const z = l[l.length - 1];
      if (Math.hypot(a.x - z.x, a.y - z.y) < 1e-9) { closedLoops += 1; return; } // a wholly drawn ring stays closed
      [a, z].forEach((q) => { // both ends of an open arc are tone cuts
        const t = m * ((q.x - pose.cam.cx) + 20) / 40;
        cuts += 1; expect(Math.min(...keys.map((k) => Math.abs(k - t)))).toBeLessThan(1e-6);
      });
    });
    expect(closedLoops).toBeGreaterThan(0);
    expect(cuts).toBeGreaterThan(5);
  });

  it('4. foreshortening cap: with the darkest LUT the drawn screen spacing of adjacent rings is >= 0.8 * floorPitch (§5)', () => {
    const pen = 0.3; const floor = 2.2 * pen;
    const lut = new Float32Array(257).fill(1e6);
    const pose = SL.poseOf({}, CAM, BOUNDS);
    const lines = SL.frame([sph.ms], pose, { toneFn: () => 0, tone: { lut }, penWidth: pen, objectId: 'o' });
    const byZ = new Map();
    lines.forEach((l) => { const k = Math.round(l[0].z * 1e6); (byZ.get(k) || byZ.set(k, []).get(k)).push(l); });
    // front view: ring screen radius = hypot(x - cx, y - cy); rings are concentric circles about the screen centre
    const radii = [...byZ.values()].map((ls) => Math.hypot(ls[0][0].x - pose.cam.cx, ls[0][0].y - pose.cam.cy)).sort((a, b) => a - b);
    expect(radii.length).toBeGreaterThan(10);
    let worst = Infinity;
    for (let i = 1; i < radii.length; i++) worst = Math.min(worst, radii[i] - radii[i - 1]);
    expect(worst).toBeGreaterThanOrEqual(0.8 * floor);
  });

  it('4a. capKey "ruling" (A13): the cap thins RULINGS by runCapRank, never the duty bands inside one ruling; absent runCapRank is unchanged', () => {
    const pen = 0.3; const floor = 2.2 * pen;
    const pose = SL.poseOf({}, CAM, BOUNDS);
    // Constant c = 1 (normal +z, front view), s = 1: T0 = p0 / (floor * 0.8). p0 = 0.7 * 0.8 * floor gives T0 = 0.7 => T = 0.5.
    const p0 = 0.7 * 0.8 * floor;
    const lut = new Float32Array(257).fill(1e6);
    const build = (runs, meta) => {
      const B = MS.createBuilder({ bakerId: 'fake', key: 'k', objectId: 'o' });
      runs.forEach((r) => {
        B.beginRun(0, r.rank, 0, 0, r.cap);
        [[r.x0, r.y], [r.x1, r.y]].forEach(([x, y]) => B.vertex(x, y, 0, 0, 0, 1));
        B.endRun();
      });
      const ms = B.finish(); ms.meta = { p0, gain: 2, ...meta };
      return ms;
    };
    const lenOf = (ls) => ls.reduce((s, l) => s + Math.hypot(l[l.length - 1].x - l[0].x, l[l.length - 1].y - l[0].y), 0);
    const view = { toneFn: () => 0.5, tone: { lut }, penWidth: pen, objectId: 'o' };
    // Two rulings; ruling 2 holds TWO bands (same cap rank 0.5). All bands carry tone key 0.
    const runs = [
      { rank: 0, cap: 0, x0: -5, x1: 5, y: -3 },
      { rank: 0, cap: 0.5, x0: -5, x1: 0, y: 3 }, { rank: 0, cap: 0.5, x0: 0, x1: 5, y: 3 },
    ];
    const ms = build(runs, { capKey: 'ruling' });
    expect(MS.validate(ms)).toEqual([]);
    expect(ms.runCapRank.constructor.name).toBe('Uint16Array');
    const lines = SL.frame([ms], pose, view);
    expect(lines.length).toBe(1);               // ruling 2 (both bands) dropped whole
    expect(lenOf(lines)).toBeCloseTo(10, 6);    // ruling 1 keeps its full dash length
    // Without runCapRank (legacy MarkSet) the cap is folded into the tone key and keys are all 0: nothing is dropped.
    const legacy = build(runs.map((r) => ({ ...r, cap: undefined })), {});
    expect(legacy.runCapRank).toBeUndefined();
    expect(SL.frame([legacy], pose, view).length).toBe(3);
    // transferList / byteSize carry the optional array (the worker adopt path)
    expect(MS.transferList(ms)).toHaveLength(8);
    expect(MS.transferList(legacy)).toHaveLength(7);
    expect(MS.byteSize(ms)).toBeGreaterThan(MS.byteSize(legacy));
    // A cap that falls across a run clips at the crossing (second linear clip), not at a whole-run boundary.
    const tilt = build([{ rank: 0, cap: 0.5, x0: -5, x1: 5, y: 0 }], { capKey: 'ruling' });
    expect(SL.frame([tilt], pose, view).length).toBe(0);
  });

  it('4b. cap-aware tone remap (opt-in meta.capToneRemap): tone stays monotone inside a capped ring; the flag off is unchanged (§5, H1)', () => {
    const cap = buildSphere(V, { M: 128, levels: 5, thetaMax: 0.3 }); // c in [0.955, 1] everywhere: T = 8 < D = 400
    const pose = SL.poseOf({}, CAM, BOUNDS);
    const lut = new Float32Array(257); for (let k = 0; k <= 256; k++) lut[k] = Math.pow(400, 1 - k / 256) / cap.p0;
    const count = (ms, I) => { SL.clearCache(); const out = SL.frame([ms], pose, { toneFn: () => I, tone: { lut }, penWidth: 0.3, objectId: 'o' }); return { n: flat(out).length, out }; };
    const off0 = count(cap.ms, 0); const off5 = count(cap.ms, 0.5);
    expect(off5.n).toBe(off0.n); // today both are pinned at the cap
    expect(JSON.stringify(off5.out)).toBe(JSON.stringify(off0.out));
    const on = { ...cap.ms, meta: { ...cap.ms.meta, capToneRemap: true } };
    const on0 = count(on, 0); const on5 = count(on, 0.5); const on1 = count(on, 1);
    expect(on0.n).toBe(off0.n); // the darkest tone still takes everything the cap allows
    expect(on5.n).toBeLessThan(0.9 * on0.n);
    expect(on1.n).toBeLessThan(on5.n);
  });

  it('5. object-space invariance: inverse-transformed output points lie on the synthetic rings within 1e-6 mm at 8 poses (§14.3)', () => {
    const rot = (a) => { const r = G3.makeRotator(a); const e = [r({ x: 1, y: 0, z: 0 }), r({ x: 0, y: 1, z: 0 }), r({ x: 0, y: 0, z: 1 })]; return [e[0].x, e[1].x, e[2].x, e[0].y, e[1].y, e[2].y, e[0].z, e[1].z, e[2].z]; };
    const tr = (A, x, y, z) => [A[0] * x + A[3] * y + A[6] * z, A[1] * x + A[4] * y + A[7] * z, A[2] * x + A[5] * y + A[8] * z]; // A^T v
    // ring segments grouped by z
    const byZ = new Map();
    for (let r = 0; r < sph.ms.runCount; r++) {
      const k = Math.round(sph.rings[r].z * 1e4); (byZ.get(k) || byZ.set(k, []).get(k)).push(r);
    }
    OBJ_POSES.forEach((p) => {
      const pose = poseFor(p);
      const camR = rot({ yaw: p.camYaw || 0, pitch: p.camPitch || 0, roll: 0 }); const objR = rot({ yaw: p.objYaw || 0, pitch: 0, roll: 0 });
      const pts = flat(SL.frame([sph.ms], pose, permissive));
      let checked = 0;
      for (let i = 0; i < pts.length; i += 61) {
        const q = pts[i];
        const w = tr(camR, (q.x - pose.cam.cx) / pose.cam.scale, -(q.y - pose.cam.cy) / pose.cam.scale, q.z);
        const o = tr(objR, w[0] - p.x, w[1] - p.y, w[2] - p.z);
        const cand = [];
        byZ.forEach((runs, k) => { if (Math.abs(k / 1e4 - o[2]) < 1e-3) runs.forEach((r) => cand.push(r)); });
        let best = Infinity;
        cand.forEach((r) => {
          const v0 = sph.ms.runStart[r]; const n = sph.ms.runStart[r + 1] - v0;
          for (let s = 0; s < n; s++) {
            const a = vert(sph.ms, v0 + s); const c = vert(sph.ms, v0 + (s + 1) % n);
            const d = [c.x - a.x, c.y - a.y, c.z - a.z]; const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
            const u = Math.min(1, Math.max(0, ((o[0] - a.x) * d[0] + (o[1] - a.y) * d[1] + (o[2] - a.z) * d[2]) / L2));
            best = Math.min(best, Math.hypot(a.x + u * d[0] - o[0], a.y + u * d[1] - o[1], a.z + u * d[2] - o[2]));
          }
        });
        expect(best).toBeLessThan(1e-6);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(100);
    });
  });

  it('6. frames are deterministic and the counters are exact (§11)', () => {
    const pose = poseFor(OBJ_POSES[3]);
    const lut = new Float32Array(257).fill(3.3 / sph.p0);
    const view = { toneFn: () => 0.5, tone: { lut }, penWidth: 0, objectId: 'o' };
    const a = SL.frame([sph.ms], pose, view); const b = SL.frame([sph.ms], pose, view);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    SL.resetStats();
    const out = SL.frame([sph.ms], pose, view);
    const ms = sph.ms; let facing = 0; let grazing = 0; let tone = 0;
    for (let r = 0; r < ms.runCount; r++) {
      const L = ms.runLevel[r]; const k = L === 0 ? MS.rankOf(ms, r) : Math.pow(2, L - 1) * (1 + MS.rankOf(ms, r));
      for (let v = ms.runStart[r]; v < ms.runStart[r + 1]; v++) {
        const c = facingOf(ms, v, OBJ_POSES[3]);
        if (c <= 0) facing += 1; else if (c < NZ) grazing += 1; else if (!(3.3 > k)) tone += 1;
      }
    }
    const s = SL.stats;
    expect(s.frames).toBe(1);
    expect(s.runsIn).toBe(ms.runCount);
    expect(s.verticesIn).toBe(ms.vertexCount);
    expect(s.culledFacing).toBe(facing);
    expect(s.culledGrazing).toBe(grazing);
    expect(s.culledTone).toBe(tone);
    expect(s.runsOut).toBe(out.length);
    expect(s.verticesOut).toBe(flat(out).length);
    expect(facing + grazing + tone).toBeGreaterThan(1000);
    expect(s.msFrameLast).toBeGreaterThanOrEqual(0);
  });

  describe('fake bakers', () => {
    let bakes = 0; let supportsOn = true;
    const SPEC = () => ({
      objectId: 'a', primitive: 'sphere', mode: 'chart', sizes: { r: 20 }, detail: 1, scale: { sx: 1, sy: 1, sz: 1 },
      mapper: 'hatch', toneLaw: 'ladder', style: { markSpace: 'surface', angle: 30 }, penWidth: 0.3, scaleRef: 1, seed: { salt: 7, phase: 0 },
    });
    const small = () => buildSphere(V, { M: 64, levels: 3, step: 2 }).ms;
    const fake = {
      id: 'fake', FIT: [], supports: (spec) => supportsOn && spec.mapper === 'hatch',
      bake: () => { bakes += 1; return small(); },
      toneLUT: () => ({ lut: new Float32Array(257).fill(1), scaleFn: null }),
    };
    let saved; let savedLadder;
    // only the fake baker may support a spec here (the real ladder would otherwise claim a sphere hatch)
    beforeEach(() => { bakes = 0; supportsOn = true; saved = V.Scene3D.SurfaceLockMezzo; V.Scene3D.SurfaceLockMezzo = fake; savedLadder = V.Scene3D.SurfaceLockLadder; V.Scene3D.SurfaceLockLadder = { supports: () => false }; SL.setCacheLimitBytes(null); });
    afterEach(() => { V.Scene3D.SurfaceLockMezzo = saved; V.Scene3D.SurfaceLockLadder = savedLadder; SL.setCacheLimitBytes(null); });

    it('7. bake cache: one bake per spec, hits counted, key ignores objectId / pose-side fields, LRU evicts by bytes (§8)', () => {
      const a = SL.bake(SPEC()); const b = SL.bake(SPEC());
      expect(b).toBe(a); expect(bakes).toBe(1);
      expect([SL.stats.bakes, SL.stats.bakeHits, SL.stats.bakeMisses]).toEqual([2, 1, 1]);
      const other = SPEC(); other.objectId = 'zzz'; other.pose = { yaw: 3 }; other.lights = [1]; other.tone = { x: 1 }; other.style.markSpace = 'pose';
      expect(SL.bakeKey(other)).toBe(SL.bakeKey(SPEC()));
      SL.bake(other); expect(bakes).toBe(1);
      const differs = SPEC(); differs.style.angle = 31;
      expect(SL.bakeKey(differs)).not.toBe(SL.bakeKey(SPEC()));
      const scaled = SPEC(); scaled.scale = { sx: 2, sy: 1, sz: 1 };
      expect(SL.bakeKey(scaled)).not.toBe(SL.bakeKey(SPEC()));
      expect(SL.stats.cacheEntries).toBe(1);
      expect(SL.stats.cacheBytes).toBe(MS.byteSize(a));
      // LRU by bytes: room for two
      SL.clearCache(); SL.resetStats();
      SL.setCacheLimitBytes(Math.floor(MS.byteSize(a) * 2.5));
      const mk = (ang) => { const s = SPEC(); s.style.angle = ang; return s; };
      const A = SL.bake(mk(1)); SL.bake(mk(2)); SL.bake(mk(1)); // touch A: B is now the oldest
      SL.bake(mk(3));
      expect(SL.stats.evictions).toBe(1);
      expect(SL.stats.cacheEntries).toBe(2);
      bakes = 0;
      expect(SL.bake(mk(1))).toBe(A); expect(bakes).toBe(0); // A survived
      SL.bake(mk(2)); expect(bakes).toBe(1); // B was evicted
      SL.clearCache(); expect(SL.stats.cacheBytes).toBe(0); expect(SL.stats.cacheEntries).toBe(0);
    });

    it('8. effectiveMarkSpace is pose for every §12 exclusion and when no baker supports (§12)', () => {
      const ctx = () => ({ primitive: 'sphere', mapper: 'hatch' });
      expect(SL.effectiveMarkSpace({ markSpace: 'surface' }, ctx())).toBe('surface');
      expect(SL.effectiveMarkSpace({}, ctx())).toBe('pose');
      expect(SL.effectiveMarkSpace({ markSpace: 'pose' }, ctx())).toBe('pose');
      expect(SL.effectiveMarkSpace(undefined, ctx())).toBe('pose');
      expect(SL.EXCLUSIONS.length).toBeGreaterThanOrEqual(12);
      SL.EXCLUSIONS.forEach((ex) => {
        const style = { markSpace: 'surface', ...(ex.example.style || {}) };
        expect(SL.effectiveMarkSpace(style, { ...ctx(), ...(ex.example.ctx || {}) }), ex.id).toBe('pose');
      });
      supportsOn = false;
      expect(SL.effectiveMarkSpace({ markSpace: 'surface' }, ctx())).toBe('pose');
      supportsOn = true;
      expect(SL.effectiveMarkSpace({ markSpace: 'surface' }, { primitive: 'sphere', mapper: 'stipple' })).toBe('pose'); // fake rejects the mapper
      expect(SL.bakerFor({ mapper: 'hatch' })).toBe(fake);
    });

    it('9. sceneFrame emits shadow, fills, edges in §6.2 order through the ctx callbacks; frameable gates (§6.2, §13)', () => {
      const pt = (x, y) => ({ x, y, z: 0 });
      const calls = [];
      const savedV = V.Scene3D.SurfaceLockVisibility; const savedS = V.Scene3D.SurfaceLockShadow;
      V.Scene3D.SurfaceLockVisibility = {
        supports: () => true, meshBake: (o) => ({ objectId: o.id, convex: true, scale: [1, 1, 1], vertices: new Float64Array(0), analytic: null }),
        occluder: () => ({ segFor: () => ({ obj: 0, mode: 'fill' }), clipRun: (pts) => [{ pts, visible: true }], closedMerge: (r) => r }),
        outline: (mesh, pose) => ({ silhouette: [{ pts: [pt(0, 0), pt(1, 1)], visible: true }], crease: pose.obj.x > 10 ? [{ pts: [pt(2, 2), pt(3, 3)], visible: true }] : [], boundary: [] }),
      };
      V.Scene3D.SurfaceLockShadow = {
        supports: () => true, bakeGround: () => ({ g: 1 }),
        frameShadow: () => ({ runs: [{ pts: [pt(0, 0), pt(5, 5)], visible: true }] }), // points carry z (F-S1)
      };
      try {
        const p = {
          objects: [
            { id: 'a', primitive: 'sphere', params: {}, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid', border: { enabled: false }, emissive: { enabled: false } },
            { id: 'b', primitive: 'sphere', params: {}, transform: { x: 30, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid', border: { enabled: false }, emissive: { enabled: false } },
          ],
          camera: { ...CAM, yaw: -30, pitch: 20 },
          lights: [{ type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
          ground: { enabled: true }, shadow: {}, backdrop: { enabled: false }, groups: [], tone: {},
          // the ground inherits the scene style, so it needs its own: a filled ground is a pose look (groundNoFill)
          styleTable: { scene: { mapper: 'hatch', params: { markSpace: 'surface', toneLaw: 'ladder' } }, byObject: { ground: { mapper: 'none', params: {} } }, byFace: {} },
        };
        expect(SL.frameable(p, BOUNDS)).toBe(true);
        const fg = JSON.parse(JSON.stringify(p)); delete fg.styleTable.byObject.ground;
        expect(SL.frameable(fg, BOUNDS)).toBe(false);
        const bad = JSON.parse(JSON.stringify(p)); bad.lights.push({ type: 'point' });
        expect(SL.frameable(bad, BOUNDS)).toBe(false);
        const bad2 = JSON.parse(JSON.stringify(p)); bad2.objects[1].visibility = 'xray';
        expect(SL.frameable(bad2, BOUNDS)).toBe(false);
        supportsOn = false;
        expect(SL.frameable(p, BOUNDS)).toBe(false);
        supportsOn = true;
        SL.resetStats();
        const ctx = {
          toneFnFor: () => () => 0.5, seedFor: () => ({ salt: 1, phase: 0, off: false }),
          emitShadow: (runs) => calls.push(`shadow:${runs.length}`),
          emitFill: (id, runs) => calls.push(`fill:${id}:${runs.length > 0}`),
          emitEdge: (id, cls, runs) => calls.push(`edge:${id}:${cls}:${runs.length}`),
        };
        expect(SL.sceneFrame(p, BOUNDS, ctx)).toBeUndefined();
        // FX-S (I4): pose order, objects first, then the ground outline, the shadow last.
        expect(calls).toEqual(['fill:a:true', 'edge:a:silhouette:1', 'fill:b:true', 'edge:b:silhouette:1', 'edge:b:crease:1', 'shadow:1']);
        expect(SL.stats.sceneFrames).toBe(1);
        expect(SL.stats.frames).toBe(2);
        expect(bakes).toBe(1); // one spec for both objects (objectId is not in the key)
      } finally { V.Scene3D.SurfaceLockVisibility = savedV; V.Scene3D.SurfaceLockShadow = savedS; }
    });
  });
});
