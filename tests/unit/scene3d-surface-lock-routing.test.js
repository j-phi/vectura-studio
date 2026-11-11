const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// W3-B routing (docs/surface-lock-contract.md §16 A9, A10): dutyConst and endShorten on hatch / crosshatch reach the laws baker
// through frameable, effectiveMarkSpace, explainMarkSpace and the spec builder (Level F and Level S), and the fixed-pitch laws
// declare `meta.toneScaleFree` so a zoom inside one scale octave does not move their tone.

const ROUTED = ['dutyConst', 'endShorten'];
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

describe('surface lock W3-B routing', () => {
  let rt; let V; let SL; let MS; let Laws;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock; MS = V.Scene3D.SurfaceLockMarkSet; Laws = V.Scene3D.SurfaceLockLaws;
  }, 120000);
  afterAll(() => rt && rt.cleanup());
  beforeEach(() => { SL.clearCache(); SL.resetStats(); });

  describe('frame honours meta.toneScaleFree (A10)', () => {
    // 20 level-0 runs, ranks i/20, all facing the camera. A run is drawn iff te = p0 * s * lut > rank.
    const ramp = (meta) => {
      const b = MS.createBuilder({ bakerId: 'synthetic', key: 'k', objectId: 'o', meta: { p0: 1, gain: 2, minMarkMM: 0, ...meta } });
      for (let i = 0; i < 20; i++) { b.beginRun(0, i / 20, 0, 0); b.vertex(i - 10, 0, 20, 0, 0, 1); b.vertex(i - 10, 1, 20, 0, 0, 1); b.endRun(); }
      return b.finish();
    };
    const cam = (zoom) => ({ yaw: 0, pitch: 0, roll: 0, zoom, projection: 'orthographic' });
    const T = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    const drawn = (ms, zoom, lutValue) => {
      const pose = SL.poseOf(T, cam(zoom), BOUNDS);
      const lut = new Float32Array(257).fill(lutValue);
      return SL.frame([ms], pose, { toneFn: () => 1, tone: { lut }, penWidth: 0, objectId: 'o' }).length;
    };
    const s1 = () => SL.poseOf(T, cam(1), BOUNDS).cam.scale;

    it('default (flag absent): tone follows the screen scale, today\'s behaviour', () => {
      const l = 0.5 / s1();
      const ms = ramp({});
      expect(drawn(ms, 1, l)).toBe(10);
      expect(drawn(ms, 1.4, l)).toBe(15);
    });
    it('toneScaleFree: the drawn set is the same at zoom 1 and 1.4 (tone is read at the bake scale)', () => {
      const l = 0.5 / s1();
      const ms = ramp({ toneScaleFree: true, scaleRef: s1() });
      expect(drawn(ms, 1, l)).toBe(10);
      expect(drawn(ms, 1.4, l)).toBe(10);
      expect(drawn(ms, 0.7, l)).toBe(10);
    });
  });

  describe('frame joins touching runs under meta.joinTouching (A11)', () => {
    // One ruling cut into three consecutive runs (outer-left, centre, outer-right) that touch end to start.
    const chain = (meta) => {
      const b = MS.createBuilder({ bakerId: 'synthetic', key: 'k', objectId: 'o', meta: { p0: 1, gain: 2, minMarkMM: 0, ...meta } });
      [[-3, -1], [-1, 1], [1, 3]].forEach(([a, c]) => { b.beginRun(0, 0, 0, 0); b.vertex(a, 0, 20, 0, 0, 1); b.vertex(c, 0, 20, 0, 0, 1); b.endRun(); });
      return b.finish();
    };
    const lines = (ms) => {
      const T = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      const pose = SL.poseOf(T, { yaw: 0, pitch: 0, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
      return SL.frame([ms], pose, { toneFn: () => 1, tone: { lut: new Float32Array(257).fill(10) }, penWidth: 0, objectId: 'o' });
    };
    it('default: three runs stay three lines', () => { expect(lines(chain({})).length).toBe(3); });
    it('joinTouching: they come out as one line of four vertices', () => {
      const l = lines(chain({ joinTouching: true }));
      expect(l.length).toBe(1);
      expect(l[0].length).toBe(4);
    });
    it('a dutyConst sphere bakes the flag and a framed dutyConst sphere emits fewer lines than it has runs', () => {
      const sp = { objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 }, detail: 24, scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw: 'dutyConst', style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: 0.3, scaleRef: 1, seed: { salt: 1, phase: 0, off: 0 } };
      const ms = Laws.bake(sp);
      expect(ms.meta.joinTouching).toBe(true);
      const T = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      const pose = SL.poseOf(T, { yaw: -30, pitch: 20, roll: 0, zoom: 1, projection: 'orthographic' }, BOUNDS);
      SL.resetStats();
      SL.frame([ms], pose, { toneFn: () => 0, tone: Laws.toneLUT(sp), penWidth: 0.3, objectId: 'o' });
      const joined = SL.stats.runsOut;
      const plain = Laws.bake(sp); plain.meta = { ...plain.meta, joinTouching: false };
      SL.resetStats();
      SL.frame([plain], pose, { toneFn: () => 0, tone: Laws.toneLUT(sp), penWidth: 0.3, objectId: 'o' });
      expect(joined).toBeLessThan(SL.stats.runsOut * 0.5);
    });
  });

  describe('the bake declares it', () => {
    const spec = (toneLaw) => ({
      objectId: 'o1', primitive: 'sphere', mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 }, detail: 24,
      scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', toneLaw,
      style: { fillAngle: 45, fillDensity: 50, densityScale: 1 }, penWidth: 0.3, scaleRef: 2, seed: { salt: 1, phase: 0, off: 0 },
    });
    it.each(ROUTED)('%s: meta.toneScaleFree is true and carries scaleRef', (law) => {
      const ms = Laws.bake(spec(law));
      expect(ms.meta.toneScaleFree).toBe(true);
      expect(ms.meta.scaleRef).toBe(2);
    });
    it.each(['mergeLadder', 'phaseBlue'])('%s (dormant): no flag', (law) => {
      expect(Laws.bake(spec(law)).meta.toneScaleFree).toBeUndefined();
    });
    it.each(ROUTED)('%s: a zoom of 1.4 leaves the framed ink unchanged; stripping the flag moves it', (law) => {
      const ms = Laws.bake(spec(law));
      const lutT = Laws.toneLUT(spec(law));
      const T = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      const run = (m, zoom) => {
        SL.resetStats();
        const pose = SL.poseOf(T, { yaw: -30, pitch: 20, roll: 0, zoom, projection: 'orthographic' }, BOUNDS);
        const o = { ...pose, cam: { ...pose.cam, scale: 2 * (zoom) } }; // scaleRef 2 = the bake scale at zoom 1
        SL.frame([m], o, { toneFn: () => 0.35, tone: lutT, penWidth: 0, objectId: 'o' });
        return SL.stats.culledTone;
      };
      expect(run(ms, 1.4)).toBe(run(ms, 1));
      const stripped = { ...ms, meta: { ...ms.meta, toneScaleFree: undefined } };
      expect(run(stripped, 1.4)).not.toBe(run(stripped, 1));
    });
  });

  describe('dispatch', () => {
    const build = (law, extra = {}) => buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: law, mapper: 'hatch', markSpace: 'surface', ...extra });
    const withoutLevelS = (fn) => { const real = SL.frameable; SL.frameable = () => false; try { return fn(); } finally { SL.frameable = real; } };
    const spyBake = () => {
      const real = Laws.bake; const calls = { n: 0 };
      Laws.bake = function bake(s) { calls.n += 1; return real.call(this, s); };
      calls.restore = () => { Laws.bake = real; };
      return calls;
    };
    const fillsOf = (paths, id) => paths.filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.meta.sceneTarget && p.meta.sceneTarget.objectId === id);
    const totalLen = (paths) => paths.reduce((a, p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return a + l; }, 0);

    it.each(ROUTED)('%s: the sphere is frameable, effectiveMarkSpace is surface, and the laws baker bakes it (Level S and Level F)', (law) => {
      const s = build(law);
      s.setPose({ camYaw: -30, camPitch: 20 });
      const spy = spyBake();
      try {
        s.composeFull();
        const p = V.Scene3D.Params.normalizeParams(s.group._sceneAssembled);
        expect(SL.frameable(p, BOUNDS)).toBe(true);
        expect(spy.n).toBeGreaterThan(0);
        expect(SL.stats.sceneFrames).toBeGreaterThan(0);
        spy.n = 0; SL.clearCache();
        withoutLevelS(() => s.composeFull());
        expect(spy.n).toBeGreaterThan(0);
      } finally { spy.restore(); }
      const sty = { markSpace: 'surface', toneLaw: law, fillDensity: 50 };
      const ctx = { spec: { mapper: 'hatch', toneLaw: law, primitive: 'sphere', mode: 'sphere', style: sty } };
      expect(SL.effectiveMarkSpace(sty, ctx)).toBe('surface');
      expect(SL.explainMarkSpace(sty, ctx)).toEqual({ mode: 'surface', reason: 'surface' });
    });

    it.each(ROUTED)('%s: Level S equals Level F (same fill count and ink at three poses)', (law) => {
      const s = build(law);
      [{ camYaw: -30, camPitch: 20 }, { camYaw: 40, camPitch: 10 }, { camYaw: -30, camPitch: 20, objYaw: 40 }].forEach((pose) => {
        s.setPose(pose);
        const S = s.composeFull();
        const F = withoutLevelS(() => s.composeFull());
        const id = s.objectsOf()[0].id;
        const fs = fillsOf(S, id); const ff = fillsOf(F, id);
        expect(fs.length, JSON.stringify(pose)).toBeGreaterThan(20);
        expect(fs.length).toBe(ff.length);
        expect(Math.abs(totalLen(fs) / totalLen(ff) - 1)).toBeLessThan(1e-4);
      });
    });

    it('a laws bake key carries the tone law (dutyConst and endShorten never share a MarkSet)', () => {
      const a = build('dutyConst'); const b = build('endShorten');
      const keyOf = (s) => { s.composeFull(); const sp = []; return SL.stats && s; };
      keyOf(a); keyOf(b);
      const base = { objectId: 'o', primitive: 'sphere', mode: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 }, scale: { sx: 1, sy: 1, sz: 1 }, mapper: 'hatch', style: { fillDensity: 50, densityScale: 1 }, penWidth: 0.3, scaleRef: 1, seed: { salt: 1, phase: 0, off: 0 } };
      const k1 = SL.bake({ ...base, toneLaw: 'dutyConst' }); const k2 = SL.bake({ ...base, toneLaw: 'endShorten' });
      expect(k1.key).not.toBe(k2.key);
      expect(k1.bakerId).toBe('laws');
    });
  });
});
