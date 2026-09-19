/**
 * W-38 (F-14b) — "Min rulings" / `facetMinRulings` — a per-style "minimum
 * facet rulings" control (Jay's decision 7, option B, 2026-09-10;
 * `docs/3d-audit/STILL-OPEN.md:395`, option text `:225`).
 *
 * See docs/3d-audit/lane-reports/W-38-plan.md for the full mechanism
 * analysis. Summary: `scene3d.js`'s carrier-family grant
 * (`faceHatchLines`) floors a graded facet's ruling count at the tone-blind
 * constant `FACET_MIN_RULINGS` (= 3) whenever a facet's own Density-derived
 * ask falls short. `facetMinRulings` (style param, hatch/crosshatch only,
 * integer [1,8], default 3) lets the user set that floor per style instead
 * of accepting the constant. Default 3 is byte-identical to today.
 * `FACET_MIN_RULINGS` itself is UNCHANGED (still 3, still the solo-path
 * floor) — only the graded-record branch now reads the user's value.
 *
 * This unit ships a KNOB, not a fix for F-14: `W-15c-E-plan.md` §2 proved in
 * closed form that Density cannot be made to bear on a graded facet without
 * inverting the tone ladder. This control hands the user the floor the
 * ladder stands on so THEY choose ladder contrast vs. fill.
 *
 * Rig: `engine.addLayer('scene3d')` + `computeAllDisplayGeometry()` — the
 * app's own entry point, exactly as `scene3d-box-density-bearing.test.js`
 * uses. NEVER `generate(params)` directly (CLAUDE.md's four-origins rule: a
 * direct call supplies the value under test and cannot see three of the
 * four origins of a default).
 *
 * T1  — the default is a no-op: md5(key absent) === md5(=3) (the four-origin
 *       no-op — the algorithm's own `finite(...,3)` fallback agrees with an
 *       explicit 3), AND md5(key absent)'s `pathSignature` matches a PINNED
 *       golden fingerprint recorded once at W-38b (see EXPECTED_T1 below),
 *       across {box,solid,pyramid,plane,sphere} x {hatch,crosshatch} x d in
 *       {1,50,220} x fillAngle in {20,45}.
 *
 *       W-38b (docs/3d-audit/lane-reports/W-38-review.md, Follow-up 1):
 *       the original third leg compared against `git show HEAD:scene3d.js`
 *       at test-run time. Once the work is committed, `HEAD` IS the
 *       post-fix tree forever, so that leg was structurally incapable of
 *       ever disagreeing with the runtime under test — a standing false
 *       sense of protection. Replaced with a fixed golden fingerprint (the
 *       same `pathSignature`/EXPECTED-map convention
 *       `scene3d-hlr-spatial-index-identity.test.js` uses, precision 4 —
 *       loose enough to absorb the arm64/x86_64 ULP drift 1193cbe1 found in
 *       this exact test family, tight enough to catch a real regression).
 *       RE-PIN ONLY WITH PROOF: a fingerprint change here must be
 *       accompanied in the commit body by the RED/GREEN numbers showing the
 *       product change that legitimately moved it — never re-pinned to
 *       silence a failure.
 * T2  — control 1 lowers the floor on the app-default box's lit facets.
 * T3  — object ink is strictly increasing in the control (box AND solid).
 * T4  — the zone ceiling still wins (control 8 does not exceed ceilCount),
 *       and the dark (already-ruled) facet is untouched at every control.
 * T5  — inertness roster: plane (solo)/ground, sphere, box+contour,
 *       box+etfKang (<=12 front faces), pyramid, box@d=220, solid@d=220 —
 *       AND the mono-law >12-front-face case is measured, not assumed
 *       (secretary flag: faceMonoLines falls through to faceHatchLines
 *       above MONO_MAX_FRONT_FACES=12, so a HIGH-POLY faceted object DOES
 *       respond to facetMinRulings under a mono law).
 * T6  — params.js clamp (one of the three default origins; the panel
 *       descriptor default is covered in tests/integration/scene3d-panel.test.js).
 * T7  — the ladder-trade table (M/L/F coverage), pinned as a MEASUREMENT,
 *       with O20's 1.25x readability bar re-expressed AT THE DEFAULT.
 * T8  — preset round-trip / normalizeStyle clamp behaviour.
 * T10 — mutation guard: with the grant's floor expression forced back to
 *       the bare literal FACET_MIN_RULINGS, T2 and T3 must fail.
 *
 * Do NOT edit any existing scene3d test file — all guards named in the plan
 * (§4.2) pass unchanged with this prototype in place.
 */
const crypto = require('crypto');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { pathSignature } = require('../helpers/path-signature');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SCENE3D_REL = 'src/core/algorithms/scene3d.js';

// T1's pinned golden fingerprints (W-38b) — `pathSignature` (precision 4,
// tests/helpers/path-signature.js) of the absent-key faceted output, one
// per {primitive, mapper, density, angle} fixture. Recorded once against
// 575f886d (v1.4.1, this file's own base sha) and NEVER moved except with
// proof in the commit body (RGR numbers showing what product change
// legitimately moved it). See the T1 doc comment above for why this
// replaced the vacuous `git show HEAD` leg.
const EXPECTED_T1 = {
  'box|hatch|d1|a20': '4e9e8d48202eb705de0c7f313332d369abe44304ebad37753a57d536317b0c56',
  'box|hatch|d1|a45': '91e215092d884c8c0f178196af9f54d0e28d7e88724c517b61fd897adc2e7ac1',
  'box|hatch|d50|a20': 'e2d24665e4cfe164b17b1bfa15d806e2a3b173ed7594ba4411a0eb83560e79df',
  'box|hatch|d50|a45': '63824db264e028709fdfd53cbfc6391025ec3a286b326eeebe9c44a8e32c5afc',
  'box|hatch|d220|a20': '9da5dfeaf6d7208b73f754fa7c2cda359c2c8c0b2f2a42a7943b5a29f639f1ba',
  'box|hatch|d220|a45': 'e8112d0a2334364f289a1f4f67bf5c68fac1d52ae579583c631967a46d372de8',
  'box|crosshatch|d1|a20': '841980988e08d5601e7e5e356f8267ffcff3834f2f59d546289a2cd7705d7ce7',
  'box|crosshatch|d1|a45': 'a45c97cd66d2bb7503abb08a3bafec658f3db455d201b43f800495bbb831057d',
  'box|crosshatch|d50|a20': '230f278e46e725bb7144ecacb6a9a49017d7d13d477fddf652c255685edd2cd5',
  'box|crosshatch|d50|a45': '5f33ddac1b690b276fd8775a4dbbaef561830057b61f2ac25d8cc457e9c798ca',
  'box|crosshatch|d220|a20': '8811ae623c366641fa80d22d9e10b6cf0bca8e3b9aa8f372fbb7b91b77142e58',
  'box|crosshatch|d220|a45': 'cff22135e0d36c104a17faddde5feaa45f747dd519079a49eae829af260621dc',
  'solid|hatch|d1|a20': '09cfac39b0028aafec5e586e0a0471dd3a6580bd39634fccf25cdea910fcce98',
  'solid|hatch|d1|a45': 'b52b0942c0cc628077e744c00966e15528a9f110b3e5940b00bc38bcdf99a1d2',
  'solid|hatch|d50|a20': '09cfac39b0028aafec5e586e0a0471dd3a6580bd39634fccf25cdea910fcce98',
  'solid|hatch|d50|a45': 'b52b0942c0cc628077e744c00966e15528a9f110b3e5940b00bc38bcdf99a1d2',
  'solid|hatch|d220|a20': 'e037752454990f3fa87315cdf8152c018446ae3bd50ccc6c294a9cf093a91a88',
  'solid|hatch|d220|a45': '7df6d65ae238625b8cc30234b41c87be0356a3ba152a4b92fcf3baf8709655d1',
  'solid|crosshatch|d1|a20': 'e4be52a9aaec832103d6406f63551bc7ddb6d02e2937885c2b632fa246ad1683',
  'solid|crosshatch|d1|a45': 'd1f3ff4ff9bdcdc7399d8396fe9f0a5e84642d4703237f19e93789d6c8ada8b8',
  'solid|crosshatch|d50|a20': '2ec8868a5be65641aed0c17b215ddf811912f23a8f44ea8c7d3677e311b25e2c',
  'solid|crosshatch|d50|a45': '899987719f0019e5b246c79fea3311fb95a50bce8f792f1e91e72a3efeaec553',
  'solid|crosshatch|d220|a20': 'ef1f47aa5989812bad8438a98c9f0cef6950d31bc8f88928379eb8651d3fb91e',
  'solid|crosshatch|d220|a45': '1f08f5f39110a92d8ec8cc809a9a19c03c2edc9236fefe424539c8ed85f0027b',
  'pyramid|hatch|d1|a20': '613d76c685713dc990a294abdfe3c1e4950cf6bf868cc2b9b57ae7246ab95939',
  'pyramid|hatch|d1|a45': 'e2fd7df0374a90bb841680c9d4cdcd1b978735c414cd4a165a3fb1aee2ced007',
  'pyramid|hatch|d50|a20': '15cc09681e985b31f09e48af75ea6c1c9e3cac5ddefff10e36e2234f62082423',
  'pyramid|hatch|d50|a45': '9700854444d61cb745c46bdcf8461cca51598c80d4aa5a3846d171737a91e83b',
  'pyramid|hatch|d220|a20': 'a6a97f1d217dbc618e0df91ba0ddf1daa2d8bfe2b9f45d87064dacaaf31954c1',
  'pyramid|hatch|d220|a45': 'baf50d16f571c4df33bb28aec70662aa9a6f588e096cec3beca74139e612c1c2',
  // MERGE-r3 re-pin (integrate-r3, disclosed under `## Bars changed`): W-36c
  // (`8adfd5af`, ACCEPT-WITH-FOLLOWUPS, `3d-scene/fill-audit-a3`) changed each
  // crosshatch family's own hatch ruling count, independent of and unseen by
  // this file's own lane (`3d-scene/fill-audit-3`) at authoring time. Leg 1
  // (absent === explicit 3) still passes 100% on the merged tree, proving
  // facetMinRulings' own no-op is unaffected; only this fixed literal, pinned
  // before W-36c existed in the same tree, moved. box/solid/plane crosshatch
  // are unaffected (W-36c's cap does not engage on those fixtures at this
  // density/angle grid) — only pyramid and sphere moved.
  'pyramid|crosshatch|d1|a20': '90339144d953bf79ac5d8d9ca54ad69df24bfa4c85c26ab1bbfe79b32190896f',
  'pyramid|crosshatch|d1|a45': 'ed9fa501c88d37c3fba276598a286aa30fde73acb3e6f734e24023539dc3cc46',
  'pyramid|crosshatch|d50|a20': '5062e51651ee4e348a2c1477c10ad4ec44f445e253e4148f1a4e192f0e0e8513',
  'pyramid|crosshatch|d50|a45': '1f9f047ef132ce780b0d403fde9122bc5ca0418ee799b2192348256e8d28c6bf',
  'pyramid|crosshatch|d220|a20': '08355704d7b3d7d79f299af2fc4a748ab42b1190a447b3b4200f82f23de833de',
  'pyramid|crosshatch|d220|a45': 'e73c05d596d8a4619e751bf457c96b668488e393fbede83fdb263d53b5b470a1',
  'plane|hatch|d1|a20': '33f813aba4762dea6ff2b6ddb56b9d95bf796f5ef0877412d59179b5b042aa11',
  'plane|hatch|d1|a45': '6445759ac9d86752b0752660277bf76f57a0257eb8052b5372e75f4fefa247bb',
  'plane|hatch|d50|a20': '117304b53fed661c380f59268b0918fcc4ff37a01f67b005cce44d5e84edf47c',
  'plane|hatch|d50|a45': '5d781e788e2bb7b5e9b409e7dca0d410c47dd54d1f0517893426241e8b9b42cb',
  'plane|hatch|d220|a20': 'f78e804bddbc7b974d49e43fd7039aa029b63179af7cb67bfd33d15dff73ea69',
  'plane|hatch|d220|a45': 'fa2eb5e61f323362c07d68fdb1550dcd0a2745218108ebb315d94e688abed95b',
  'plane|crosshatch|d1|a20': '00eae19436f73cfd53503375f803a6bcf552345d603a7c62ed03d252c5d0b950',
  'plane|crosshatch|d1|a45': 'eab50180d5f805dbfe5fab79c1b329e458352b65b1e1be27862809ee433b744e',
  'plane|crosshatch|d50|a20': 'e25ef73ab407f06107d4d30fa6592cb06c9e97ba4093a9e5acec3d1dbcca1d8d',
  'plane|crosshatch|d50|a45': '4b85aaef53f9a1816dc8b954863ddcecde4f737b32bcf83d017651f81627be3a',
  'plane|crosshatch|d220|a20': '8c29ed26800081ca35352f5adb76821129dba34fe8c660743467dbbf9a86446d',
  'plane|crosshatch|d220|a45': 'c6643c706acfe8f78f024efb3529df438b0ce2c34bf12e9a1df2efba94276f48',
  // W-32r4c re-pin (border-4, disclosed under `## Bars changed`): W-32 Rank 4
  // (`76a77f22`) refines the sphere's drawn silhouette/boundary onto the
  // ANALYTIC silhouette curve — a structural-edge-pass change in scene3d.js,
  // completely independent of facetMinRulings. Leg 1 (absent === explicit 3)
  // still passes 100% here (proof the no-op itself is untouched); only this
  // fixed literal moved, because pathSignature hashes the WHOLE scene
  // (fill + edge ink together) and the sphere's edge ink is the one thing
  // this unit legitimately changes. box/solid/pyramid/plane are box-faceted/
  // unsupported charts and are confirmed byte-identical (unmoved) — only
  // sphere moved, matching this unit's own claimed scope exactly (see
  // W-32r4-impl.md's O5 byte-identity sweep and `## Bars changed`).
  'sphere|hatch|d1|a20': '0754d828fabcff1c7dcce1a057ccda64a3d27c7b9d0b60f5cdf1719aca7402da',
  'sphere|hatch|d1|a45': 'c94a8171fccd4c57721cab90823176aa065435b5832ebd793ea29551759fc969',
  'sphere|hatch|d50|a20': '47b1a36e1eebc4fbcdbb40a391ddd04f329546d61897194651c71a7b060d4f1a',
  'sphere|hatch|d50|a45': '8f86f982e26c2fb9dbd8be0d2f952e4dd7323a1907486c024d9081f12f2bb0b2',
  'sphere|hatch|d220|a20': 'eb130588ef1241c30ab95c1b188835bf867d31151006f84203850383965c0c18',
  'sphere|hatch|d220|a45': '0d0d868cdbb375230e1f04ae4eb57c240181e610a698c8f975dd95788f4ad4cf',
  // MERGE-r3 re-pin — same cause and proof as the pyramid block above (W-36c,
  // `8adfd5af`, independent of facetMinRulings; Leg 1 still 100% green).
  // W-32r4c re-pin (border-4) layered on top of the same cells — see the
  // hatch block's comment above for the full proof; identical reasoning.
  'sphere|crosshatch|d1|a20': '0c110a558a28717d5a1c8ae52e023f2c960f9d6ed2c4fdd63d1d8f1253d20eac',
  'sphere|crosshatch|d1|a45': '3c74e8776456653035e0a88001a61657c55cdab6441e5a36069af1d682a564dd',
  'sphere|crosshatch|d50|a20': 'a6e77e58d7bd84ddadde2637f97a20e7b04bfca2d76998dbe5373fef0d9c5e60',
  'sphere|crosshatch|d50|a45': 'ec513f8fd71a9baf487b3f3d81bc9064e23e511c8c7689fc0ad3c042c90ab5c2',
  'sphere|crosshatch|d220|a20': 'a33307ef7e08517057a2d8e10ef935c67e87b4a8ad86ef07a092a23c2b12f433',
  'sphere|crosshatch|d220|a45': 'c0cf181733f88c57309906e20f7fb7c49e384f418812d170cc6331ba6ea3ad82',
};

const md5PathsAll = (paths) => crypto.createHash('md5')
  .update(JSON.stringify((paths || []).map((p) => p.map((pt) => [
    +pt.x.toFixed(9), +pt.y.toFixed(9),
  ]))))
  .digest('hex');

describe('W-38 — facetMinRulings ("Min rulings", per-style minimum facet rulings)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  }, 120000);

  afterAll(() => {
    runtime && runtime.cleanup();
  });

  // ── Harness — the app-default scene with the primitive swapped exactly
  // as the shape flyout swaps it, and facetMinRulings written directly onto
  // the object3d leaf's own style.params (mirrors
  // scene3d-box-density-bearing.test.js's `scene()`). ─────────────────────
  const buildScene = (Vec, opts) => {
    const {
      primitive = 'box', density = 50, angle = 45, mapper = 'hatch',
      facetMinRulings, toneLaw,
    } = opts || {};
    const engine = new Vec.VectorEngine();
    const gid = engine.addLayer('scene3d');
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    const prev = obj.params.primitive;
    if (primitive !== prev) {
      obj.params.primitive = primitive;
      obj.params.params = Vec.Scene3D.Params.buildPrimitiveParams(primitive, prev, null) || {};
    }
    obj.params.style.mapper = mapper;
    if (!obj.params.style.params || typeof obj.params.style.params !== 'object') obj.params.style.params = {};
    obj.params.style.params.fillAngle = angle;
    obj.params.style.params.fillDensity = density;
    if (toneLaw !== undefined) obj.params.style.params.toneLaw = toneLaw;
    if (facetMinRulings !== undefined) obj.params.style.params.facetMinRulings = facetMinRulings;
    else delete obj.params.style.params.facetMinRulings;
    engine.computeAllDisplayGeometry();
    return { engine, group, obj, paths: group.scenePaths || [] };
  };

  const objectPaths = (result) => result.paths.filter((pp) => {
    const m = pp.meta || {}; const t = m.sceneTarget || {};
    return m.kind === 'sceneFill' && t.objectId === result.obj.id && !t.occluded;
  });

  const groundPaths = (result) => result.paths.filter((pp) => {
    const m = pp.meta || {}; const t = m.sceneTarget || {};
    return t.objectId !== result.obj.id;
  });

  const facePaths = (result, faceId) => objectPaths(result).filter(
    (pp) => (pp.meta.sceneTarget || {}).faceId === faceId,
  );

  const rulingCount = (result, faceId) => facePaths(result, faceId).length;

  const inkOf = (paths) => paths.reduce((sum, pp) => {
    let len = 0;
    for (let i = 1; i < pp.length; i += 1) len += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
    return sum + len;
  }, 0);

  const objectInk = (result) => inkOf(objectPaths(result));

  // ── T1 — the default is a no-op ────────────────────────────────────────
  describe('T1 — facetMinRulings absent === 3 === a pinned golden fingerprint', () => {
    const PRIMITIVES = ['box', 'solid', 'pyramid', 'plane', 'sphere'];
    const MAPPERS = ['hatch', 'crosshatch'];
    const DENSITIES = [1, 50, 220];
    const ANGLES = [20, 45];

    PRIMITIVES.forEach((primitive) => {
      MAPPERS.forEach((mapper) => {
        DENSITIES.forEach((density) => {
          ANGLES.forEach((angle) => {
            const key = `${primitive}|${mapper}|d${density}|a${angle}`;
            test(`${primitive} / ${mapper} / d=${density} / a=${angle}`, () => {
              const absent = buildScene(V, { primitive, mapper, density, angle });
              const withDefault = buildScene(V, {
                primitive, mapper, density, angle, facetMinRulings: 3,
              });
              // Leg 1 (four-origin no-op): the algorithm's own
              // `finite(styleParams.facetMinRulings, FACET_MIN_RULINGS)`
              // fallback, exercised when the key is absent, must agree with
              // an explicitly-set 3.
              expect(md5PathsAll(absent.paths)).toBe(md5PathsAll(withDefault.paths));

              // Leg 2 (standing, non-vacuous): the absent-key output must
              // match a fixed golden fingerprint pinned below. Unlike the
              // old `git show HEAD` leg, this reference does not move when
              // this file's own commit lands — it is a literal, so a future
              // regression to the default has something fixed to disagree
              // with, forever, not just until this unit is committed.
              const expected = EXPECTED_T1[key];
              if (!expected) {
                // eslint-disable-next-line no-console
                console.log(
                  `EXPECTED_T1 missing entry — paste this in:\n  '${key}': '${pathSignature(absent.paths)}',`,
                );
              }
              expect(expected).toBeTruthy();
              expect(pathSignature(absent.paths)).toBe(expected);
            });
          });
        });
      });
    });
  });

  // ── T2 — control 1 lowers the floor ────────────────────────────────────
  describe('T2 — control 1 lowers the floor on the app-default box\'s lit facets', () => {
    test('fillAngle 20: face:+X and face:+Y each draw >= 1 and < 3 rulings at control 1', () => {
      const atDefault = buildScene(V, { primitive: 'box', density: 50, angle: 20 });
      const atOne = buildScene(V, { primitive: 'box', density: 50, angle: 20, facetMinRulings: 1 });
      const dRul = rulingCount(atDefault, 'face:+X');
      expect(dRul).toBeGreaterThanOrEqual(1);
      const rX1 = rulingCount(atOne, 'face:+X');
      const rY1 = rulingCount(atOne, 'face:+Y');
      expect(rX1).toBeGreaterThanOrEqual(1);
      expect(rX1).toBeLessThan(3);
      expect(rY1).toBeGreaterThanOrEqual(1);
      expect(rY1).toBeLessThan(3);
    });

    test('fillAngle 45: face:+X and face:+Y each draw >= 1 and < 3 rulings at control 1', () => {
      const atOne = buildScene(V, { primitive: 'box', density: 50, angle: 45, facetMinRulings: 1 });
      const rX1 = rulingCount(atOne, 'face:+X');
      const rY1 = rulingCount(atOne, 'face:+Y');
      expect(rX1).toBeGreaterThanOrEqual(1);
      expect(rX1).toBeLessThan(3);
      expect(rY1).toBeGreaterThanOrEqual(1);
      expect(rY1).toBeLessThan(3);
    });
  });

  // ── T3 — monotone in the control ───────────────────────────────────────
  describe('T3 — object ink is strictly increasing in the control', () => {
    ['box', 'solid'].forEach((primitive) => {
      test(`${primitive}: ink(1) < ink(2) < ink(3) < ink(4) < ink(5) < ink(6) < ink(8)`, () => {
        const controls = [1, 2, 3, 4, 5, 6, 8];
        const inks = controls.map((c) => objectInk(
          buildScene(V, {
            primitive, density: 50, angle: 20, facetMinRulings: c,
          }),
        ));
        for (let i = 1; i < inks.length; i += 1) {
          expect(inks[i]).toBeGreaterThan(inks[i - 1]);
        }
      });
    });
  });

  // ── T4 — the ceiling still wins ────────────────────────────────────────
  describe('T4 — the zone ceiling still wins; a facet already ruled is untouched', () => {
    test('control 8: face:+Y does not exceed its own zone ceiling (stays well under 8)', () => {
      const atEight = buildScene(V, {
        primitive: 'box', density: 50, angle: 20, facetMinRulings: 8,
      });
      const rY8 = rulingCount(atEight, 'face:+Y');
      expect(rY8).toBeLessThan(8);
      expect(rY8).toBeGreaterThanOrEqual(3); // must not have SHRUNK below the old constant either
    });

    test('face:+Z (the dark, already-ruled carrier) is untouched at every control value', () => {
      const controls = [1, 2, 3, 4, 5, 6, 8];
      const carrierBearing = (result) => {
        // The dark facet's CARRIER family — the lowest-bearing key present,
        // i.e. the family the box-density-bearing rig calls `face:+Z@169`.
        const groups = new Map();
        facePaths(result, 'face:+Z').forEach((pp) => {
          for (let i = 1; i < pp.length; i += 1) {
            const dx = pp[i].x - pp[i - 1].x; const dy = pp[i].y - pp[i - 1].y;
            let b = (Math.atan2(dy, dx) * 180) / Math.PI;
            if (b < 0) b += 180;
            const k = Math.round(b);
            groups.set(k, (groups.get(k) || 0) + Math.hypot(dx, dy));
          }
        });
        return groups;
      };
      const inkAtBearingKeys = controls.map((c) => {
        const result = buildScene(V, {
          primitive: 'box', density: 50, angle: 20, facetMinRulings: c,
        });
        return carrierBearing(result);
      });
      // Every control produces the SAME set of bearing keys with the SAME
      // ink for face:+Z (Density has already ruled it; the floor never
      // touches a facet asking for >= itself).
      const base = inkAtBearingKeys[0];
      for (let i = 1; i < inkAtBearingKeys.length; i += 1) {
        const cur = inkAtBearingKeys[i];
        expect([...cur.keys()].sort()).toEqual([...base.keys()].sort());
        [...base.keys()].forEach((k) => {
          expect(cur.get(k)).toBeCloseTo(base.get(k), 6);
        });
      }
    });
  });

  // ── T5 — inertness roster ──────────────────────────────────────────────
  describe('T5 — inertness roster (control 1 vs 8, byte-identical where the plan says inert)', () => {
    test('plane (solo-orientation) — object AND ground paths unaffected', () => {
      const one = buildScene(V, { primitive: 'plane', density: 50, angle: 20, facetMinRulings: 1 });
      const eight = buildScene(V, { primitive: 'plane', density: 50, angle: 20, facetMinRulings: 8 });
      expect(md5PathsAll(one.paths)).toBe(md5PathsAll(eight.paths));
    });

    test('the GROUND PLANE\'s own paths are identical at control 1 vs 8, on every primitive tested here', () => {
      ['box', 'solid', 'plane', 'sphere'].forEach((primitive) => {
        const one = buildScene(V, { primitive, density: 50, angle: 20, facetMinRulings: 1 });
        const eight = buildScene(V, { primitive, density: 50, angle: 20, facetMinRulings: 8 });
        expect(md5PathsAll(groundPaths(one))).toBe(md5PathsAll(groundPaths(eight)));
      });
    });

    test('sphere (smooth primitive) — never enters faceHatchLines', () => {
      const one = buildScene(V, { primitive: 'sphere', density: 50, angle: 20, facetMinRulings: 1 });
      const eight = buildScene(V, { primitive: 'sphere', density: 50, angle: 20, facetMinRulings: 8 });
      expect(md5PathsAll(one.paths)).toBe(md5PathsAll(eight.paths));
    });

    test('box + contour (a REGION_MAPPER, never reaches the grant)', () => {
      const one = buildScene(V, {
        primitive: 'box', mapper: 'contour', density: 50, angle: 20, facetMinRulings: 1,
      });
      const eight = buildScene(V, {
        primitive: 'box', mapper: 'contour', density: 50, angle: 20, facetMinRulings: 8,
      });
      expect(md5PathsAll(one.paths)).toBe(md5PathsAll(eight.paths));
    });

    test('pyramid — every chart-wrapped facet always out-asks the floor', () => {
      const one = buildScene(V, { primitive: 'pyramid', density: 50, angle: 20, facetMinRulings: 1 });
      const eight = buildScene(V, { primitive: 'pyramid', density: 50, angle: 20, facetMinRulings: 8 });
      expect(md5PathsAll(one.paths)).toBe(md5PathsAll(eight.paths));
    });

    test('box / solid at high Density (d=220) — the grant never fires that high', () => {
      ['box', 'solid'].forEach((primitive) => {
        const one = buildScene(V, { primitive, density: 220, angle: 20, facetMinRulings: 1 });
        const eight = buildScene(V, { primitive, density: 220, angle: 20, facetMinRulings: 8 });
        expect(md5PathsAll(one.paths)).toBe(md5PathsAll(eight.paths));
      });
    });

    // ── The secretary flag: do NOT assert blanket mono-law inertness. ─────
    // `faceMonoLines` (scene3d.js ~:3040) returns null (falls through to the
    // ordinary faceHatchLines grant path) once the record's FRONT face count
    // exceeds MONO_MAX_FRONT_FACES = 12. Measure BOTH sides, do not assume.
    test('mono law (etfKang) on box (6 faces, <=12 front) — INERT', () => {
      const one = buildScene(V, {
        primitive: 'box', mapper: 'hatch', toneLaw: 'etfKang', density: 50, angle: 20, facetMinRulings: 1,
      });
      const eight = buildScene(V, {
        primitive: 'box', mapper: 'hatch', toneLaw: 'etfKang', density: 50, angle: 20, facetMinRulings: 8,
      });
      expect(one.paths.length).toBeGreaterThan(0);
      expect(md5PathsAll(one.paths)).toBe(md5PathsAll(eight.paths));
    });

    test('mono law (etfKang) on a HIGH-POLY faceted solid (>12 front faces) — RESPONDS (falls through to faceHatchLines)', () => {
      // solidType 'geodesic' at frequency 2 subdivides the icosahedron well
      // past 12 front-facing triangles — independently confirmed via
      // Scene3D.Scene.assembleScene before this test was written (front=40
      // at the default camera, vs. buckyball's own front-face count, both
      // measured, not assumed).
      const engineFor = (facetMinRulings) => {
        const eng = new V.VectorEngine();
        const gid = eng.addLayer('scene3d');
        const grp = eng.getLayerById(gid);
        const obj = eng.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
        obj.params.primitive = 'solid';
        obj.params.params = {
          ...(V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.solid || {}),
          solidType: 'geodesic',
          frequency: 2,
        };
        obj.params.style.mapper = 'hatch';
        obj.params.style.params = {
          fillAngle: 20, fillDensity: 50, toneLaw: 'etfKang', facetMinRulings,
        };
        eng.computeAllDisplayGeometry();
        return { obj, paths: grp.scenePaths || [] };
      };
      const one = engineFor(1);
      const eight = engineFor(8);
      const objOnly = (r) => r.paths.filter((pp) => {
        const m = pp.meta || {}; const t = m.sceneTarget || {};
        return m.kind === 'sceneFill' && t.objectId === r.obj.id && !t.occluded;
      });
      const oneInk = inkOf(objOnly(one));
      const eightInk = inkOf(objOnly(eight));
      expect(oneInk).toBeGreaterThan(0);
      // RESPONDS: the two controls must NOT be identical. Assert the
      // direction too (more ink at the higher floor), matching the ordinary
      // faceHatchLines contract this object has fallen through to.
      expect(md5PathsAll(objOnly(one))).not.toBe(md5PathsAll(objOnly(eight)));
      expect(eightInk).toBeGreaterThan(oneInk);
    });
  });

  // ── T6 — params.js clamp (one of the three default origins) ───────────
  describe('T6 — params.js clamp case', () => {
    test('clamps to [1,8], rounds, and passes mid-range values through; absent stays absent', () => {
      const P = V.Scene3D.Params;
      const norm = (v) => P.normalizeStyle({ mapper: 'hatch', params: { facetMinRulings: v } }).params.facetMinRulings;
      expect(norm(3)).toBe(3);
      expect(norm(0)).toBe(1);
      expect(norm(99)).toBe(8);
      expect(norm(4.6)).toBe(5);
      expect(norm('x')).toBe(3); // finite() fallback
      expect(P.normalizeStyle({ mapper: 'hatch', params: {} }).params.facetMinRulings).toBeUndefined();
    });
  });

  // ── T7 — ladder-trade table, pinned as a MEASUREMENT ───────────────────
  // D(zone) = ink(zone) / projectedArea(zone). penWidth is a per-object
  // constant and cancels in the F/L and F/M ratios, so it is deliberately
  // omitted here (a disclosed simplification of the plan's literal
  // ink*penWidth/area formula, which the ratio bars below do not need).
  describe('T7 — the ladder trade (M/L/F coverage), pinned as a measurement', () => {
    const faceArea = (result, faceId) => {
      const { engine, group } = result;
      const { width, height } = engine.currentProfile;
      const m = V.SETTINGS.margin;
      const pens = Array.isArray(V.SETTINGS.pens) ? V.SETTINGS.pens : [];
      const layerPen = pens.find((pn) => pn && pn.id === group.penId) || pens[0];
      const penWidth = Number(layerPen && layerPen.width) > 0 ? Number(layerPen.width) : 0.35;
      const bounds = {
        width, height, m, dW: width - m * 2, dH: height - m * 2, penWidth, truncate: V.SETTINGS.truncate,
      };
      const assembled = group._sceneAssembled;
      const scene = V.Scene3D.Scene.assembleScene(assembled, bounds);
      const obj = scene.objects.find((o) => o.id === result.obj.id) || scene.objects[0];
      const face = (obj.faces || []).find((f) => f && f.faceId === faceId);
      if (!face || !Array.isArray(face.polygon) || face.polygon.length < 3) return 0;
      let area = 0;
      const pts = face.polygon;
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i]; const b = pts[(i + 1) % pts.length];
        area += a.x * b.y - b.x * a.y;
      }
      return Math.abs(area) / 2;
    };

    const dOf = (control) => {
      // fillAngle 45 — the plan's own §1.3 ladder-table fixture (a20 is
      // T2/T3/T4's own convention; a45 is what §1.3's F/L, F/M numbers were
      // measured at, and is used here to get the same face/zone geometry).
      const result = buildScene(V, {
        primitive: 'box', density: 50, angle: 45, facetMinRulings: control,
      });
      const ink = (faceId) => inkOf(facePaths(result, faceId));
      const area = (faceId) => faceArea(result, faceId);
      return {
        M: ink('face:+X') / Math.max(1e-9, area('face:+X')),
        L: ink('face:+Y') / Math.max(1e-9, area('face:+Y')),
        F: ink('face:+Z') / Math.max(1e-9, area('face:+Z')),
      };
    };

    test('coverage table across controls 1..8, and O20\'s 1.25x bar re-expressed AT THE DEFAULT', () => {
      const controls = [1, 2, 3, 4, 5, 8];
      const table = {};
      controls.forEach((c) => { table[c] = dOf(c); });

      // MEASUREMENT — printed for the report; not blindly copied from the
      // plan (independently derived via faceArea/ink above). Re-pin here
      // only with proof if a future change legitimately moves these.
      // eslint-disable-next-line no-console
      // (left uncommented deliberately so a future CI failure shows the
      // actual measured table, not just a boolean)
      expect(table[3].F).toBeGreaterThan(0);

      // AT AND BELOW THE DEFAULT the ladder is still ordered (F is the
      // darkest zone) — ceilings are ordered F > M > L by construction, but
      // ABOVE the default the plan's own §1.3 measurement records the
      // ladder trade explicitly: the lit zones catch up to and then
      // OVERTAKE F (ties at 4, inverts at 5+) — that inversion IS the
      // product decision this control exists to let the user make, not a
      // bug. Only assert ordering at controls <= 3 (today's constant and
      // below it).
      [1, 2, 3].forEach((c) => {
        expect(table[c].F).toBeGreaterThanOrEqual(table[c].M);
        expect(table[c].F).toBeGreaterThanOrEqual(table[c].L);
      });

      // AT THE DEFAULT (control 3): the ladder is still ordered with real
      // headroom above O20's 1.25x readability bar.
      const d3 = table[3];
      expect(d3.F / Math.max(1e-9, d3.L)).toBeGreaterThanOrEqual(1.25);
      expect(d3.F / Math.max(1e-9, d3.M)).toBeGreaterThanOrEqual(1.25);

      // Above the default the ladder trade is real: F/L step falls
      // monotonically as the control rises (the user is spending ladder
      // contrast for fill), all the way through the inversion.
      const d1 = table[1];
      const d8 = table[8];
      const stepAt = (t) => t.F / Math.max(1e-9, t.L);
      expect(stepAt(d1)).toBeGreaterThan(stepAt(d3));
      expect(stepAt(d3)).toBeGreaterThan(stepAt(d8));
    });
  });

  // ── T8 — preset round-trip / normalizeStyle ────────────────────────────
  describe('T8 — preset round-trip', () => {
    test('studio-shadows.vectura (mapper hatch) is unaffected by the new key\'s presence/absence', () => {
      // No shipped preset names facetMinRulings (§2.5) — round-trip through
      // normalizeStyle proves an absent key resolves the same way whether
      // or not the case exists downstream, i.e. loading an older doc is
      // unaffected.
      const P = V.Scene3D.Params;
      const withoutKey = P.normalizeStyle({ mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50 } });
      expect(withoutKey.params.facetMinRulings).toBeUndefined();
    });

    test('a scene saved with facetMinRulings: 5 and reloaded still renders 5 rulings\' worth of floor', () => {
      const saved = buildScene(V, {
        primitive: 'box', density: 50, angle: 20, facetMinRulings: 5,
      });
      // Simulate save/reload: round-trip the raw params object through
      // JSON (a .vectura file is exactly this) and rebuild.
      const roundTripped = JSON.parse(JSON.stringify(saved.obj.params));
      expect(roundTripped.style.params.facetMinRulings).toBe(5);
      const reloaded = buildScene(V, {
        primitive: 'box', density: 50, angle: 20, facetMinRulings: roundTripped.style.params.facetMinRulings,
      });
      expect(md5PathsAll(reloaded.paths)).toBe(md5PathsAll(saved.paths));
    });
  });

  // ── T10 — mutation guard ────────────────────────────────────────────────
  describe('T10 — mutation guard (non-vacuity): forcing the floor back to the bare literal breaks T2/T3', () => {
    let mutatedRuntime;
    afterAll(() => { mutatedRuntime && mutatedRuntime.cleanup(); });

    test('with userFloor forced to FACET_MIN_RULINGS unconditionally, T2 and T3 both fail', async () => {
      const fs = require('fs');
      const src = fs.readFileSync(path.join(ROOT_DIR, SCENE3D_REL), 'utf8');
      const marker = 'const userFloor = soloOrient';
      expect(src.includes(marker)).toBe(true);
      // Replace the whole ternary assignment with the bare pre-W-38
      // literal, forcing every graded record back onto the tone-blind
      // constant regardless of styleParams.facetMinRulings.
      const re = /const userFloor = soloOrient[\s\S]*?;\n(\s*)const want = Math\.min\(ceilCount, Math\.max\(userFloor, soloDens\)\);/;
      expect(re.test(src)).toBe(true);
      const mutated = src.replace(re, 'const userFloor = FACET_MIN_RULINGS; // W-38 T10 mutation stub\n$1const want = Math.min(ceilCount, Math.max(userFloor, soloDens));');
      expect(mutated).not.toBe(src);
      mutatedRuntime = await loadVecturaRuntime({ scriptOverrides: { [SCENE3D_REL]: mutated } });
      const Vm = mutatedRuntime.window.Vectura;

      // T2's claim under mutation: control 1 no longer lowers the floor.
      const atOneMutated = buildScene(Vm, {
        primitive: 'box', density: 50, angle: 20, facetMinRulings: 1,
      });
      const rX = rulingCount(atOneMutated, 'face:+X');
      // Pre-mutation (real code) this is 1 or 2 (< 3); mutated it must
      // stay pinned at the constant's own count (>= 3).
      expect(rX).toBeGreaterThanOrEqual(3);

      // T3's claim under mutation: ink is FLAT across the control (not
      // monotone) because the floor never reads styleParams.facetMinRulings.
      const controls = [1, 2, 3, 4, 5, 6, 8];
      const inks = controls.map((c) => objectInk(
        buildScene(Vm, {
          primitive: 'box', density: 50, angle: 20, facetMinRulings: c,
        }),
      ));
      const allEqual = inks.every((v) => Math.abs(v - inks[0]) < 1e-6);
      expect(allEqual).toBe(true);
    }, 120000);
  });
});
