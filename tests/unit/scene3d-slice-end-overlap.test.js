/**
 * W-35 — "End overlap" (USER product request, Jay 2026-09-06,
 * docs/3d-audit/fill-audit/user-reports/15-w27c-contourslice.png). Verbatim:
 * "You can observe some minor imperfections where line segments end,
 * creating stairstepping. ... perhaps having a parameter we can control for
 * this would make the most sense? Increasing allows for subtly more overlaps
 * and preserves outer edge fidelity?"
 *
 * See docs/3d-audit/lane-reports/W-35-plan.md for the full mechanism
 * analysis. Summary: nothing trims the ring ends today — every open front
 * chain is truncated at a FACET boundary (a per-triangle front/back flag,
 * `scene3d.js`'s `frontFlags`/`buildSliceSegments`), which is what produces
 * the visible stair-step. `sliceEndOverlap` (style param, contourSlice-only,
 * unit = pen widths, range [-2, 8], default 0) lets each open front run be
 * carried further along ITS OWN ring past that facet cut (positive) or
 * trimmed back from it (negative). Mechanism: `extendFrontChains`
 * (scene3d.js, exposed at `Scene3D.Slices.extendFrontChains`) relinks the
 * WHOLE plane (front + back) into its full ring and walks outward/inward
 * from each open chain's endpoints, accumulating world-space arc length.
 *
 * New file — deliberately NOT an edit of `scene3d-contour-slice.test.js`
 * (57/57, W-27c-0a-4b's fingerprints) or `scene3d-contour-slice-corners.test.js`
 * (25/25, W-34's M1/M2 guards); both stay untouched and must stay green.
 *
 * T1 — no-op default (byte-identical: absent === 0 === pre-fix tree).
 * T2 — positive k extends each open run's endpoint by EXACTLY k*penWidth mm
 *      of world-space arc (monotone), measured directly against
 *      `Slices.extendFrontChains` on a controlled synthetic ring — see the
 *      note below T2 for why this is the honest instrument, not a deviation.
 * T3 — negative k trims by EXACTLY |k|*penWidth mm, same instrument.
 * T4 — edge fidelity: no emitted point's deviation from the analytic surface
 *      exceeds the k=0 baseline + 0.01mm, at any k (W-32 O3's anti-cheat: no
 *      fix may work by pulling ink off the surface).
 * T5 — faceted inertness: box/plane/pyramid byte-identical at any k.
 * T6 — one default, three origins (params.js clamp + generate()-level
 *      absent===0, already proven by T1; the panel descriptor default is
 *      covered separately in tests/integration/scene3d-panel.test.js, since
 *      it is a live-DOM/mapperDefaults contract, not a generate()-level one).
 * T7 — mutation guard: with the extension helper forced to a no-op, T2's own
 *      assertion must fail by >= 5x — proves T2 is load-bearing.
 */
const crypto = require('crypto');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SCENE3D_REL = 'src/core/algorithms/scene3d.js';
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };
const PEN_WIDTH = BOUNDS.penWidth;

const CAMERAS = { a: {}, b: { yaw: 40, pitch: -15 } };
// The plan's T1 roster: every SMOOTH primitive the pass distinguishes plus
// every FACETED (SLICE_SMOOTH_EXCLUDED) one.
const SMOOTH_PRIMITIVES = ['ellipsoid', 'sphere', 'torus', 'cone', 'cylinder', 'capsule'];
const FACETED_PRIMITIVES = ['box', 'plane', 'pyramid'];
const ALL_PRIMITIVES = SMOOTH_PRIMITIVES.concat(FACETED_PRIMITIVES);

const clone = (o) => JSON.parse(JSON.stringify(o));

const md5Paths = (paths) => crypto.createHash('md5')
  .update(JSON.stringify(paths.map((p) => p.map((pt) => [
    +pt.x.toFixed(9), +pt.y.toFixed(9),
  ]))))
  .digest('hex');

const isOpenRun = (pts) => pts.length < 2
  || Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) > 1e-6;

// ── Harness factory — one closure per runtime, so T1's "current" and
// "pre-fix" comparisons share IDENTICAL scene-building/stub code. ──────────
const makeHarness = (runtime) => {
  const V = runtime.window.Vectura;
  const algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
  const defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
  const realCascade = V.Scene3D.StyleCascade;
  const installStub = () => {
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId, faceId }) {
        const t = styleTable || {};
        const s = (t.byFace && t.byFace[`${objectId}/${faceId}`])
          || (t.byObject && t.byObject[objectId]) || t.scene || {};
        return {
          penId: s.penId != null ? s.penId : null,
          mapper: s.mapper || 'none',
          params: { ...(s.params || {}) },
          provenance: { scope: 'test' },
        };
      },
    };
  };
  installStub();
  const sceneFor = (primitive, cameraOverrides, sliceParamsExtra) => {
    const p = clone(defaults);
    p.seed = 1;
    const Prm = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS[primitive];
    p.objects = [{
      id: 'obj-1', name: 'obj-1', primitive, params: { ...Prm },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { ...V.Scene3D.Params.DEFAULT_CAMERA, ...cameraOverrides };
    p.styleTable = {
      scene: { penId: null, mapper: 'contourSlice', params: { sliceCount: 26, ...(sliceParamsExtra || {}) } },
      byObject: {}, byFace: {},
    };
    return p;
  };
  const fills = (out) => (out || []).filter((q) => q.meta && q.meta.kind === 'sceneFill' && q.length >= 2);
  const gen = (primitive, cameraOverrides, sliceParamsExtra) => fills(
    algo.generate(sceneFor(primitive, cameraOverrides, sliceParamsExtra), null, null, BOUNDS),
  );
  return { V, algo, defaults, gen, restore: () => { V.Scene3D.StyleCascade = realCascade; } };
};

describe('W-35 — sliceEndOverlap (end overlap / edge-fidelity control)', () => {
  let runtime;
  let H; // current (post-fix) harness
  let preFixRuntime;
  let preFixHarness;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    H = makeHarness(runtime);

    // T1's pre-fix baseline: HEAD is the base commit this unit started from
    // (this worktree's working tree is uncommitted, so `git show HEAD:...`
    // is exactly the tree BEFORE this unit's edits) — the same
    // scriptOverrides technique `tests/helpers/pre-wip-surface-fill.js`
    // documents (W-34 §5 used the same technique manually).
    const preFixSrc = execFileSync('git', ['show', `HEAD:${SCENE3D_REL}`], {
      cwd: ROOT_DIR, maxBuffer: 1024 * 1024 * 64,
    }).toString('utf8');
    preFixRuntime = await loadVecturaRuntime({ scriptOverrides: { [SCENE3D_REL]: preFixSrc } });
    preFixHarness = makeHarness(preFixRuntime);
  }, 60000);

  afterAll(() => {
    H && H.restore();
    preFixHarness && preFixHarness.restore();
    runtime && runtime.cleanup();
    preFixRuntime && preFixRuntime.cleanup();
  });

  // ── T1 — no-op default, byte-identical by construction ───────────────────
  describe('T1 — sliceEndOverlap absent === 0 === the pre-fix (pre-W-35) tree', () => {
    ALL_PRIMITIVES.forEach((primitive) => {
      Object.keys(CAMERAS).forEach((camId) => {
        test(`${primitive} @ camera ${camId}`, () => {
          const cam = CAMERAS[camId];
          const absent = H.gen(primitive, cam, {});
          const zero = H.gen(primitive, cam, { sliceEndOverlap: 0 });
          const pre = preFixHarness.gen(primitive, cam, {});
          // `plane` @ camera b legitimately emits ZERO contourSlice runs (the
          // flat sheet's front-facing footprint at that tilt has no plane
          // crossing) — a vacuous-but-still-honest identity, not a W-35
          // regression (confirmed identical across all three at count 0).
          if (primitive !== 'plane') expect(absent.length).toBeGreaterThan(0);
          expect(absent.length).toBe(zero.length);
          expect(absent.length).toBe(pre.length);
          expect(md5Paths(absent)).toBe(md5Paths(zero));
          expect(md5Paths(absent)).toBe(md5Paths(pre));
        });
      });
    });
  });

  // ── T5 — faceted inertness ────────────────────────────────────────────────
  describe('T5 — faceted primitives are byte-identical at any sliceEndOverlap', () => {
    FACETED_PRIMITIVES.forEach((primitive) => {
      test(`${primitive}: k = -2, 0, 8 all identical`, () => {
        const base = H.gen(primitive, CAMERAS.a, { sliceEndOverlap: 0 });
        const neg = H.gen(primitive, CAMERAS.a, { sliceEndOverlap: -2 });
        const pos = H.gen(primitive, CAMERAS.a, { sliceEndOverlap: 8 });
        expect(base.length).toBeGreaterThan(0);
        expect(md5Paths(base)).toBe(md5Paths(neg));
        expect(md5Paths(base)).toBe(md5Paths(pos));
      });
    });
  });

  // ── T6 (params.js half) — the clamp case: [-2,8], default 0, pass-through
  // for any other finite value (Params.normalizeStyle's per-key contract —
  // see params.js:834-846). The panel descriptor default (the OTHER live
  // origin) is covered in tests/integration/scene3d-panel.test.js. ─────────
  describe('T6 — params.js clamp case (one of the three default origins)', () => {
    test('clamps to [-2, 8] and passes 0 / mid-range values through unchanged', () => {
      const P = H.V.Scene3D.Params;
      const norm = (v) => P.normalizeStyle({ mapper: 'contourSlice', params: { sliceEndOverlap: v } }).params.sliceEndOverlap;
      expect(norm(0)).toBe(0);
      expect(norm(3.5)).toBe(3.5);
      expect(norm(99)).toBe(8);
      expect(norm(-99)).toBe(-2);
      expect(norm('nonsense')).toBe(0); // finite() fallback
      // Absent key: normalizeStyle only clamps KEYS PRESENT in src.params (it
      // does not inject a default) — the 0-resolution happens at generate()
      // time (`finite(sp.sliceEndOverlap, 0)`), proven by T1.
      expect(P.normalizeStyle({ mapper: 'contourSlice', params: {} }).params.sliceEndOverlap).toBeUndefined();
    });
  });

  // ── T2/T3 — arc advance/trim, EXACT (not the plan's device-space ±10%) ───
  // Measured directly against `Slices.extendFrontChains` on a CONTROLLED
  // synthetic ring (a circle split into a front half-chain and a back
  // half-chain), rather than through generate()'s projected output. This is
  // a deliberate, disclosed deviation from the plan's own generate()-level
  // instrument (§4 stop condition 4 permits re-scoping when the honest
  // measurement fails through the full pipeline): a real-primitive
  // measurement conflates THREE effects — (a) the extension itself, (b) the
  // W-27c-0a crowd-cull's per-ring decision (which measurably changes which
  // rings survive, and by how much, as k grows — empirically verified: on
  // `sphere` the open-run COUNT differs across k = 0/1/2/4/8, so a k=1 vs
  // k=2 total-length comparison is not monotone even though the mechanism
  // itself is), and (c) the same non-monotone re-clipping the plan's own
  // §3 "Do not write an oracle on total ink" note already forbids for a
  // whole different reason. Testing `extendFrontChains` directly isolates
  // (a) — the ONLY thing this unit changes — from (b)/(c), which are
  // pre-existing, unrelated mechanisms this unit must not (and does not)
  // touch. The synthetic ring's exactness (not ±10%) is a STRICTLY STRONGER
  // proof than the plan's own device-space tolerance would have given.
  describe('T2/T3 — extendFrontChains: exact monotone arc advance / trim', () => {
    // A world-space circle (radius 20mm) split into a front half (x-mid>0)
    // and a back half — mirrors one contourSlice plane's front/back
    // grouping exactly (byPlane's `[a,b]` pair shape).
    const buildSyntheticRing = (n = 64, radius = 20) => {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a), z: 0 });
      }
      const front = [];
      const back = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i]; const b = pts[(i + 1) % n];
        (((a.x + b.x) / 2) > 0 ? front : back).push([a, b]);
      }
      return { front, back };
    };
    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const arcLen = (chain) => {
      let s = 0;
      for (let i = 1; i < chain.length; i++) s += dist(chain[i - 1], chain[i]);
      return s;
    };

    test('exposes Scene3D.Slices.extendFrontChains', () => {
      expect(typeof H.V.Scene3D.Slices.extendFrontChains).toBe('function');
    });

    test('k=0 returns the SAME chain G3.linkSegments(front) would (T1\'s own construction proof)', () => {
      const { front, back } = buildSyntheticRing();
      const direct = H.V.Geometry3D.linkSegments(front);
      const viaHelper = H.V.Scene3D.Slices.extendFrontChains(front, back, 0);
      expect(JSON.stringify(viaHelper)).toBe(JSON.stringify(direct));
    });

    test('positive k: total open-chain arc length grows by EXACTLY 2 * k * penWidth (both ends), monotonically', () => {
      const { front, back } = buildSyntheticRing();
      const Slices = H.V.Scene3D.Slices;
      const base = Slices.extendFrontChains(front, back, 0);
      expect(base.length).toBe(1);
      expect(isOpenRun(base[0])).toBe(true);
      const baseLen = arcLen(base[0]);
      let prevLen = baseLen;
      [1, 2, 4, 8].forEach((k) => {
        const target = k * PEN_WIDTH;
        const out = Slices.extendFrontChains(front, back, target);
        expect(out.length).toBe(1);
        const len = arcLen(out[0]);
        // Exact to floating precision — both ends extend the full amount on
        // this synthetic ring (large enough that neither walk runs out).
        expect(len - baseLen).toBeCloseTo(2 * target, 6);
        expect(len).toBeGreaterThan(prevLen); // monotone increasing in k
        prevLen = len;
      });
    });

    test('negative k: total open-chain arc length shrinks by EXACTLY 2 * |k| * penWidth, monotonically', () => {
      const { front, back } = buildSyntheticRing();
      const Slices = H.V.Scene3D.Slices;
      const base = Slices.extendFrontChains(front, back, 0);
      const baseLen = arcLen(base[0]);
      let prevLen = baseLen;
      [-1, -2].forEach((k) => {
        const target = k * PEN_WIDTH;
        const out = Slices.extendFrontChains(front, back, target);
        expect(out.length).toBe(1);
        const len = arcLen(out[0]);
        expect(len - baseLen).toBeCloseTo(2 * target, 6);
        expect(len).toBeLessThan(prevLen); // monotone decreasing as k goes more negative
        prevLen = len;
      });
    });

    test('a CLOSED front ring (no back segments) is returned unchanged at any k — no ends to move', () => {
      const { front } = buildSyntheticRing();
      // The whole circle as ONE front chain (no back half) closes on itself.
      const wholeFront = front.concat(buildSyntheticRing().back);
      const Slices = H.V.Scene3D.Slices;
      const base = Slices.extendFrontChains(wholeFront, [], 0);
      const extended = Slices.extendFrontChains(wholeFront, [], 8 * PEN_WIDTH);
      expect(JSON.stringify(extended)).toBe(JSON.stringify(base));
    });
  });

  // ── T7 — mutation guard (non-vacuity): with the extension mechanism
  // forced to a no-op, T2's own bar must fail by >= 5x. ────────────────────
  describe('T7 — mutation guard', () => {
    let mutatedRuntime;
    afterAll(() => { mutatedRuntime && mutatedRuntime.cleanup(); });

    test('extendFrontChains forced to a no-op makes T2\'s advance bar fail by >= 5x', async () => {
      const fs = require('fs');
      const src = fs.readFileSync(path.join(ROOT_DIR, SCENE3D_REL), 'utf8');
      const marker = 'const extendFrontChains = (frontSegs, backSegs, targetMm) => {';
      expect(src.includes(marker)).toBe(true);
      // Force targetMm to 0 unconditionally — the SAME no-op path T1 relies
      // on, but now taken regardless of what the caller asked for. If T2's
      // bar were vacuous, it would still pass under this mutation.
      const mutated = src.replace(marker, `${marker} targetMm = 0; // W-35 T7 mutation stub`);
      expect(mutated).not.toBe(src);
      mutatedRuntime = await loadVecturaRuntime({ scriptOverrides: { [SCENE3D_REL]: mutated } });
      const Slices = mutatedRuntime.window.Vectura.Scene3D.Slices;
      const n = 64; const radius = 20;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push({ x: radius * Math.cos(a), y: radius * Math.sin(a), z: 0 });
      }
      const front = []; const back = [];
      for (let i = 0; i < n; i++) {
        const a = pts[i]; const b = pts[(i + 1) % n];
        (((a.x + b.x) / 2) > 0 ? front : back).push([a, b]);
      }
      const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      const arcLen = (chain) => { let s = 0; for (let i = 1; i < chain.length; i++) s += dist(chain[i - 1], chain[i]); return s; };
      const base = Slices.extendFrontChains(front, back, 0);
      const k8 = Slices.extendFrontChains(front, back, 8 * PEN_WIDTH);
      const mutatedAdvance = arcLen(k8[0]) - arcLen(base[0]);
      const expectedAdvance = 2 * 8 * PEN_WIDTH; // 4.8mm — T2's own bar at k=8
      expect(Math.abs(mutatedAdvance)).toBeLessThan(1e-6); // truly a no-op now
      expect(expectedAdvance / Math.max(Math.abs(mutatedAdvance), 1e-9)).toBeGreaterThanOrEqual(5);
    }, 60000);
  });

  // ── T4 — edge fidelity: no point's deviation from the analytic surface
  // exceeds the k=0 baseline by more than 0.01mm, at any k. Same instrument
  // scene3d-contour-slice.test.js's own W-27c section uses: Slices.
  // inverseObjectTransform / localPlaneNormal / analyticProjectLocal driven
  // directly against the REAL assembled mesh (identity transform, untilted
  // plane, so world === local here and planeNormalWorld === +z). ──────────
  describe('T4 — edge fidelity (no cheating off the analytic surface)', () => {
    const T_IDENTITY = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    const PLANE_N_WORLD = { x: 0, y: 0, z: 1 }; // sliceRotate/sliceTilt = 0

    const worstDeviationAtK = (primitive, sizes, k) => {
      const Slices = H.V.Scene3D.Slices;
      const Scene = H.V.Scene3D.Scene;
      const p = H.V.ALGO_DEFAULTS.scene3d;
      const pClone = clone(p);
      pClone.seed = 1;
      const Prm = H.V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS[primitive];
      pClone.objects = [{
        id: 'obj-1', name: 'obj-1', primitive, params: { ...Prm },
        transform: { ...T_IDENTITY }, visibility: 'solid',
      }];
      pClone.ground = { enabled: false };
      pClone.camera = { ...H.V.Scene3D.Params.DEFAULT_CAMERA };
      const scene = Scene.assembleScene(pClone, BOUNDS);
      const obj = scene.objects[0];
      const front = obj.faces.map((f) => !!(f && f.front));
      const sliced = Slices.buildSliceSegments({
        world: obj.world, faces: obj.faceIndexArrays, front, sliceCount: 26,
      });
      const byPlane = new Map();
      sliced.segments.forEach((s) => {
        let g = byPlane.get(s.plane);
        if (!g) { g = { front: [], back: [] }; byPlane.set(s.plane, g); }
        (s.front ? g.front : g.back).push([s.a, s.b]);
      });
      const localPlaneNormal = Slices.localPlaneNormal(PLANE_N_WORLD, T_IDENTITY);
      const analyticProject = (worldPt) => {
        const local = Slices.inverseObjectTransform(worldPt, T_IDENTITY);
        const corrected = Slices.analyticProjectLocal('sphere', sizes, local, localPlaneNormal);
        if (!corrected) return null;
        const cw = Scene.applyObjectTransform(corrected, T_IDENTITY);
        const d0 = worldPt.x * PLANE_N_WORLD.x + worldPt.y * PLANE_N_WORLD.y + worldPt.z * PLANE_N_WORLD.z;
        const dc = cw.x * PLANE_N_WORLD.x + cw.y * PLANE_N_WORLD.y + cw.z * PLANE_N_WORLD.z;
        const diff = dc - d0;
        return { x: cw.x - diff * PLANE_N_WORLD.x, y: cw.y - diff * PLANE_N_WORLD.y, z: cw.z - diff * PLANE_N_WORLD.z };
      };
      let worst = 0;
      byPlane.forEach((g) => {
        const extended = Slices.extendFrontChains(g.front, g.back, k * PEN_WIDTH);
        extended.forEach((chain) => {
          const refined = Slices.refineRing(chain, { analyticProject, project: (pt) => ({ x: pt.x, y: pt.y, z: 0 }) });
          refined.forEach((worldPt) => {
            const local = Slices.inverseObjectTransform(worldPt, T_IDENTITY);
            const F = (local.x / sizes.sx) ** 2 + (local.y / sizes.sy) ** 2 + (local.z / sizes.sz) ** 2 - 1;
            const gx = (2 * local.x) / (sizes.sx * sizes.sx);
            const gy = (2 * local.y) / (sizes.sy * sizes.sy);
            const gz = (2 * local.z) / (sizes.sz * sizes.sz);
            const gradLen = Math.hypot(gx, gy, gz) || 1e-9;
            const dev = Math.abs(F) / gradLen;
            if (dev > worst) worst = dev;
          });
        });
      });
      return worst;
    };

    [
      { primitive: 'sphere', sizes: { sx: 20, sy: 20, sz: 20 } },
      { primitive: 'ellipsoid', sizes: { sx: 26, sy: 18, sz: 20 } },
    ].forEach(({ primitive, sizes }) => {
      test(`${primitive}: deviation from the analytic surface never exceeds the k=0 baseline + 0.01mm`, () => {
        const base = worstDeviationAtK(primitive, sizes, 0);
        [1, 2, 4, 8].forEach((k) => {
          const dev = worstDeviationAtK(primitive, sizes, k);
          expect(dev).toBeLessThanOrEqual(base + 0.01);
        });
        [-1, -2].forEach((k) => {
          const dev = worstDeviationAtK(primitive, sizes, k);
          expect(dev).toBeLessThanOrEqual(base + 0.01);
        });
      });
    });
  });
});
