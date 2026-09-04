/**
 * Scene3D.ShadowReceive — Unit D: shadows falling onto OTHER 3D objects.
 *
 * Stroke-fill handoff item D (docs/stroke-fill-handoff.md). Settled
 * architecture: per surface SAMPLE, ask "is this world point in shadow?" and
 * feed the boolean into the intensity the tone laws already consume
 * (`Regions.combinedIntensity`). No new region geometry — this is what makes
 * a CURVED receiver (a cone) work at all; a projected silhouette is only
 * valid against a plane.
 *
 * Level 1 (module only) — the four cases the handoff names exactly: hit,
 * miss, grazing, self-shadow exclusion.
 * Level 2 (integration, through `Regions.combinedIntensity`) — a sphere
 * caster above a PLANE receiver. An independent ray/sphere oracle (computed
 * here, never calling `ShadowReceive`) says which sample points are inside
 * the shadow and which are not.
 * Level 3 (curved receiver) — the SAME oracle against a CONE receiver.
 * Level 4 (receiver's own fill style) — the full `scene3d.generate()`
 * pipeline, two different `toneLaw`s on the receiver, shadow-region geometry
 * must differ.
 * Level 5 (anti-vacuity) — sceneFill still emits; weightScale stays 1;
 * moving the light so nothing is occluded returns EXACTLY the no-shadow
 * intensities.
 *
 * RED against `d5af9e30` (the commit immediately before this unit) via
 * `makeMultiFilePreShaRuntimeOptions`, pinning `regions.js` + `scene3d.js`.
 * `shadow-receive.js` itself is NOT pinned — it did not exist at that SHA,
 * so overriding it is impossible (and unnecessary: the pinned `regions.js`
 * ignores a 4th `combinedIntensity` argument outright, and the pinned
 * `scene3d.js` never builds one, so the module loads but is never wired in
 * either way — there is no shadow term and assertions 2-5 below fail):
 *
 *   VECTURA_PRE_SHADOWRECV=1 npx vitest run tests/unit/scene3d-shadow-receive.test.js
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { makeMultiFilePreShaRuntimeOptions } = require('../helpers/pre-wip-surface-fill');

const preShadowRecvRuntimeOptions = makeMultiFilePreShaRuntimeOptions(
  'd5af9e30',
  'VECTURA_PRE_SHADOWRECV',
  ['src/core/scene3d/regions.js', 'src/core/algorithms/scene3d.js'],
);

const clone = (val) => JSON.parse(JSON.stringify(val));
const v = (x, y, z) => ({ x, y, z });
const sub = (a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a) => {
  const len = Math.hypot(a.x, a.y, a.z) || 1;
  return v(a.x / len, a.y / len, a.z / len);
};

// Independent ray/sphere occlusion oracle — NEVER calls ShadowReceive. A
// directional light is infinitely far, so any positive-t intersection along
// the toward-light ray occludes P.
const raySphereOccluded = (P, towardLightDir, center, radius) => {
  const oc = sub(center, P);
  const tca = dot(oc, towardLightDir);
  if (tca <= 1e-9) return false; // sphere is behind P relative to the light
  const d2 = dot(oc, oc) - tca * tca;
  if (d2 > radius * radius) return false; // ray misses the sphere entirely
  const thc = Math.sqrt(Math.max(0, radius * radius - d2));
  const t0 = tca - thc;
  return t0 > 1e-6;
};

describe('Scene3D.ShadowReceive — shadows landing on other objects (Unit D)', () => {
  let runtime;
  let V;
  let ShadowReceive;
  let Regions;
  let SceneB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(preShadowRecvRuntimeOptions());
    V = runtime.window.Vectura;
    ShadowReceive = V.Scene3D && V.Scene3D.ShadowReceive;
    Regions = V.Scene3D.Regions;
    SceneB = V.Scene3D.Scene;
  });

  afterAll(() => runtime.cleanup());

  // ── Level 1: the four named cases, module only ──────────────────────────
  describe('pointInShadow — module level (hit / miss / grazing / self-exclusion)', () => {
    // A single horizontal blocking triangle at y=0, well inside a ray fired
    // straight up from below it.
    const blocker = { a: v(-10, 0, -10), b: v(10, 0, -10), c: v(0, 0, 10), objectId: 'objA' };
    const occluders = { triangles: [blocker] };
    const SUN_UP = { id: 'sun', type: 'directional', azimuth: 0, elevation: 90 }; // straight down travel -> straight-up toward-light

    test('hit — a ray toward the light passes through the occluder', () => {
      const P = v(0, -5, -2);
      expect(ShadowReceive.pointInShadow(P, SUN_UP, occluders, {})).toBe(true);
    });

    test('miss — a ray toward the light clears the occluder entirely', () => {
      const P = v(100, -5, -2); // far outside the triangle's xz footprint
      expect(ShadowReceive.pointInShadow(P, SUN_UP, occluders, {})).toBe(false);
    });

    test('grazing — a ray parallel to the triangle plane never returns NaN', () => {
      // A ray whose direction lies IN the triangle's own plane (y=0 plane,
      // horizontal travel) is parallel to it — determinant ~0, documented MISS.
      const grazingDir = norm(v(1, 0, 0));
      const t = ShadowReceive.rayTriangleIntersect(v(0, 0, 0), grazingDir, blocker.a, blocker.b, blocker.c);
      expect(t).toBeNull();
      expect(Number.isNaN(t)).toBe(false);

      // A ray aimed exactly at a shared vertex of a real tessellated curved
      // occluder (many triangles meeting at one point) must also stay a
      // stable, documented boolean — never throw, never NaN.
      const mesh = SceneB.buildPrimitiveMesh({ primitive: 'sphere', params: { radius: 18, detail: 16 } });
      const xf = { x: 0, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      const world = mesh.vertices.map((pt) => SceneB.applyObjectTransform(pt, xf));
      const sphereRecord = {
        id: 'sphere-graze',
        faces: mesh.faces.map((idx, i) => ({ worldVerts: idx.map((vi) => world[vi]), faceId: mesh.faceIds[i] })),
      };
      const sphereOccluders = ShadowReceive.buildOccluderSet([sphereRecord]);
      const vertex = world[0]; // any real mesh vertex — several triangles share it
      const from = v(vertex.x, vertex.y - 200, vertex.z);
      const dir = norm(sub(vertex, from));
      const result = ShadowReceive.pointInShadow(from, { type: 'point', position: vertex }, sphereOccluders, {});
      expect(typeof result).toBe('boolean');
      expect(Number.isNaN(Number(result))).toBe(false);
      // Documented side: a ray landing exactly on a shared vertex/edge is
      // treated INCLUSIVELY (a hit) so adjacent triangles on a tessellated
      // curved occluder never leak a light crack along their shared seam.
      expect(result).toBe(true);
    });

    test('self-shadow exclusion — a point on the caster\'s own surface is never reported shadowed by its own geometry', () => {
      const P = v(0, -5, -2); // sits "on" objA, ray toward the light re-enters the same triangle
      expect(ShadowReceive.pointInShadow(P, SUN_UP, occluders, {})).toBe(true); // sanity: unexcluded, it DOES block
      expect(ShadowReceive.pointInShadow(P, SUN_UP, occluders, { excludeObjectId: 'objA' })).toBe(false);
    });
  });

  // ── Levels 2/3: integration through Regions.combinedIntensity ───────────
  describe('combinedIntensity — shadow term darkens occluded samples (flat + curved receiver)', () => {
    const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 55, intensity: 1 };
    const CASTER_C = v(0, 30, 0);
    const CASTER_R = 18;

    const buildCasterOccluders = () => {
      const mesh = SceneB.buildPrimitiveMesh({ primitive: 'sphere', params: { radius: CASTER_R, detail: 24 } });
      const xf = { x: CASTER_C.x, y: CASTER_C.y, z: CASTER_C.z, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      const world = mesh.vertices.map((pt) => SceneB.applyObjectTransform(pt, xf));
      const record = {
        id: 'caster',
        faces: mesh.faces.map((idx, i) => ({ worldVerts: idx.map((vi) => world[vi]), faceId: mesh.faceIds[i] })),
      };
      return ShadowReceive.buildOccluderSet([record]);
    };

    const towardLightVec = () => Regions.towardLight(SUN);

    test('flat receiver (a plane): oracle-inside reads strictly darker than oracle-outside, unshadowed baseline unaffected outside', () => {
      const occ = buildCasterOccluders();
      const L = towardLightVec();
      const shadowFn = (wp) => ShadowReceive.pointInShadow(wp, SUN, occ, { excludeObjectId: 'plane' });
      const n = v(0, 1, 0); // flat receiver normal, constant everywhere

      // Scan the ground plane along -x (the side the shadow falls toward for
      // this light) to find one oracle-inside and one oracle-outside sample.
      let inside = null;
      let outside = null;
      for (let x = -60; x <= 60; x += 2) {
        const P = v(x, 0, 0);
        const occludedByOracle = raySphereOccluded(P, L, CASTER_C, CASTER_R);
        if (occludedByOracle && !inside) inside = P;
        if (!occludedByOracle && x > 40 && !outside) outside = P; // far side, clearly clear
      }
      expect(inside).not.toBeNull();
      expect(outside).not.toBeNull();

      const Iinside = Regions.combinedIntensity(n, inside, [SUN], shadowFn);
      const Ioutside = Regions.combinedIntensity(n, outside, [SUN], shadowFn);
      expect(Ioutside - Iinside).toBeGreaterThan(0.2); // real margin — a full Lambert term, not noise

      // Anti-vacuity / no false positive: the outside sample is untouched by
      // the shadow term (byte-identical to the no-shadowFn call).
      const IoutsideNoShadow = Regions.combinedIntensity(n, outside, [SUN]);
      expect(Ioutside).toBe(IoutsideNoShadow);

      // And with no shadowFn at all, a directional-only scene is position-
      // independent, so the (would-be) inside/outside values collapse to
      // the SAME number — this is exactly what the pinned pre-fix baseline
      // computes, and exactly why it fails the strict-darker assertion above.
      const IinsideNoShadow = Regions.combinedIntensity(n, inside, [SUN]);
      expect(IinsideNoShadow).toBe(IoutsideNoShadow);
    });

    test('curved receiver (a cone): same oracle, adjacent points straddling the shadow boundary', () => {
      const occ = buildCasterOccluders();
      const L = towardLightVec();
      const shadowFn = (wp) => ShadowReceive.pointInShadow(wp, SUN, occ, { excludeObjectId: 'cone' });

      // A cone standing on the ground, offset so its lateral surface crosses
      // the caster's shadow column.
      const coneApex = v(0, 40, 0);
      const coneBaseY = 0;
      const coneBaseR = 22;
      const height = coneApex.y - coneBaseY;
      // Parametric point on the cone's lateral surface at height fraction f
      // (0=apex,1=base) and azimuth theta; outward normal for a right cone.
      const conePoint = (f, theta) => {
        const r = coneBaseR * f;
        return v(r * Math.cos(theta), coneApex.y - height * f, r * Math.sin(theta));
      };
      const coneNormal = (theta) => {
        // Lateral surface tangent-derived outward normal (slope = r/height).
        const slope = coneBaseR / height;
        const radialN = norm(v(Math.cos(theta), slope, Math.sin(theta)));
        return radialN;
      };

      // Scan azimuth at a fixed mid height for a genuine FALSE→TRUE oracle
      // transition (not just "the first true found from an arbitrary start",
      // which can land inside an already-occluded arc when the shadow wraps
      // through ±180°) — the true occluded set here is one contiguous arc
      // that happens to straddle ±180°, so scanning for the specific
      // direction of flip picks the OTHER edge of the arc deterministically.
      // Once found, step a further MARGIN_DEG degrees to EITHER side of the
      // exact analytic transition before sampling — the real occluder here
      // is a TESSELLATED sphere mesh (ShadowReceive.buildOccluderSet), which
      // can disagree with the idealized analytic sphere oracle right at the
      // knife-edge boundary itself; a few degrees of headroom keeps both
      // sample points solidly on their respective sides for BOTH the oracle
      // and the real triangle mesh, while staying close enough together
      // (a few mm on this cone) that the normal barely changes.
      const f = 0.6;
      const MARGIN_DEG = 6;
      let transitionDeg = null;
      for (let deg = -179; deg <= 179; deg += 1) {
        const thetaA = (deg * Math.PI) / 180;
        const thetaB = ((deg + 1) * Math.PI) / 180;
        const occA = raySphereOccluded(conePoint(f, thetaA), L, CASTER_C, CASTER_R);
        const occB = raySphereOccluded(conePoint(f, thetaB), L, CASTER_C, CASTER_R);
        if (!occA && occB) { transitionDeg = deg; break; }
      }
      expect(transitionDeg).not.toBeNull();

      const thetaOut = ((transitionDeg - MARGIN_DEG) * Math.PI) / 180;
      const thetaIn = ((transitionDeg + 1 + MARGIN_DEG) * Math.PI) / 180;
      const Pin = conePoint(f, thetaIn);
      const Pout = conePoint(f, thetaOut);
      expect(raySphereOccluded(Pin, L, CASTER_C, CASTER_R)).toBe(true);
      expect(raySphereOccluded(Pout, L, CASTER_C, CASTER_R)).toBe(false);

      const nIn = coneNormal(thetaIn);
      const nOut = coneNormal(thetaOut);
      const Iin = Regions.combinedIntensity(nIn, Pin, [SUN], shadowFn);
      const Iout = Regions.combinedIntensity(nOut, Pout, [SUN], shadowFn);

      // The unshadowed baseline at these two nearby points (same normal
      // slope, small azimuth step) — establishes how much of the gap is pure
      // geometry, so the margin below is provably attributable to the
      // shadow term, not curvature.
      const IinBase = Regions.combinedIntensity(nIn, Pin, [SUN]);
      const IoutBase = Regions.combinedIntensity(nOut, Pout, [SUN]);
      const geometryGap = Math.abs(IoutBase - IinBase);

      expect(Iout - Iin).toBeGreaterThan(geometryGap + 0.15);
    });
  });

  // ── Level 4: the receiver's own fill style changes the shadow's look ────
  describe('the shadow renders in the RECEIVER\'s own fill style (full generate() pipeline)', () => {
    const SUN = { id: 'sun', type: 'directional', azimuth: 90, elevation: 55, intensity: 1 };
    const CAMERA = { projection: 'orthographic', yaw: 20, pitch: 45, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    const BOUNDS = { width: 320, height: 220, m: 10, dW: 300, dH: 200, penWidth: 0.3, truncate: 4 };

    // Both objects share z=0 because this SUN's travel direction has ZERO
    // z-component (azimuth 90 keeps the whole light/shadow geometry in the
    // xy-plane) — a receiver offset in z from the caster's axis can NEVER be
    // reached by this shadow no matter how the flag is set (verified with an
    // offline ray/sphere scan before writing this fixture). The cone
    // (topoCone chart: apex at local y=+sy, base at y=-sy, radius sx at the
    // base) sits with its base ON the ground (transform.y = sy) so its axis
    // runs y:0..40; the caster sphere sits beside it at x=30 so this SUN's
    // shadow (travel ≈ (-0.57,-0.82,0)) sweeps across the cone's near flank.
    const caster = {
      id: 'caster', name: 'caster', primitive: 'sphere', params: { radius: 18, detail: 20 },
      transform: { x: 30, y: 30, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };
    const receiver = {
      id: 'receiver', name: 'receiver', primitive: 'cone', params: { sx: 22, sy: 20, sz: 22, detail: 22 },
      transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    };

    const styleTable = (law) => ({
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80, toneLaw: 'ladder' } },
      byObject: {
        caster: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80, toneLaw: 'ladder' } },
        receiver: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 80, toneLaw: law } },
      },
      byFace: {},
    });

    const render = (law, shadowOn = true) => {
      const Params = V.Scene3D.Params;
      const p = clone(V.ALGO_DEFAULTS.scene3d);
      p.seed = 1;
      p.camera = clone(CAMERA);
      p.ground = { enabled: false };
      p.backdrop = { enabled: false };
      p.objects = [clone(caster), clone(receiver)];
      p.lights = [clone(SUN)];
      p.tone = { enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.2, 0.4, 0.65, 0.9] };
      p.styleTable = styleTable(law);
      p.shadow = { ...p.shadow, shadowReceiveOnObjects: shadowOn };
      const np = Params.normalizeParams(p);
      return V.AlgorithmRegistry.scene3d.generate(
        Params.collectSceneParams(np, []), new V.SeededRNG(1), new V.SimpleNoise(1), BOUNDS,
      ) || [];
    };

    const receiverFills = (paths) => paths.filter((q) => q.meta && q.meta.kind === 'sceneFill'
      && q.meta.sceneTarget && q.meta.sceneTarget.objectId === 'receiver');
    const geomSig = (paths) => JSON.stringify(paths.map((q) => q.map((pt) => [
      Math.round(pt.x * 1000) / 1000, Math.round(pt.y * 1000) / 1000,
    ])));

    // NOT the vacuous version of this claim: "two toneLaws emit different
    // geometry" would be true even with the shadow feature entirely absent
    // (toneLaw always reshapes a fill). The genuine, falsifiable claim is
    // that TOGGLING THE SHADOW FLAG ALONE, same toneLaw, same everything
    // else, changes the receiver's own emitted geometry — i.e. the shadow
    // term actually reaches the real pipeline and lands real ink.
    test('HEADLINE — toggling shadowReceiveOnObjects alone (same toneLaw) changes the receiver\'s emitted geometry', () => {
      const off = receiverFills(render('ladder', false));
      const on = receiverFills(render('ladder', true));
      expect(off.length).toBeGreaterThan(0);
      expect(on.length).toBeGreaterThan(0);
      expect(geomSig(on)).not.toBe(geomSig(off));
    });

    test('the shadow reads in the RECEIVER\'s own fill style — two toneLaws (shadow ON) emit different receiver geometry', () => {
      const a = receiverFills(render('ladder', true));
      const b = receiverFills(render('mazeFill', true));
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
      expect(geomSig(a)).not.toBe(geomSig(b));
    });

    test('anti-vacuity — the receiver still emits sceneFill at all, and every path keeps weightScale 1 (or absent)', () => {
      const paths = receiverFills(render('ladder'));
      expect(paths.length).toBeGreaterThan(0);
      paths.forEach((q) => {
        const ws = q.meta && q.meta.weightScale;
        expect(ws == null || ws === 1).toBe(true);
      });
    });

    test('anti-vacuity — moving the light so nothing is occluded reproduces the no-shadow intensities exactly', () => {
      const Params = V.Scene3D.Params;
      const buildWith = (shadowOn, sunOverride) => {
        const p = clone(V.ALGO_DEFAULTS.scene3d);
        p.seed = 1;
        p.camera = clone(CAMERA);
        p.ground = { enabled: false };
        p.backdrop = { enabled: false };
        // Caster moved far away laterally — geometrically cannot occlude the
        // receiver from this light no matter what the flag says.
        p.objects = [{ ...clone(caster), transform: { ...clone(caster.transform), x: 400 } }, clone(receiver)];
        p.lights = [sunOverride || clone(SUN)];
        p.tone = { enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.2, 0.4, 0.65, 0.9] };
        p.styleTable = styleTable('ladder');
        p.shadow = { ...p.shadow, shadowReceiveOnObjects: shadowOn };
        const np = Params.normalizeParams(p);
        return V.AlgorithmRegistry.scene3d.generate(
          Params.collectSceneParams(np, []), new V.SeededRNG(1), new V.SimpleNoise(1), BOUNDS,
        ) || [];
      };
      const withFlag = geomSig(receiverFills(buildWith(true)));
      const withoutFlag = geomSig(receiverFills(buildWith(false)));
      expect(withFlag).toBe(withoutFlag);
    });
  });
});
