const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FS-F1: byte-identity guard for the HLR occluder spatial index (hlr.js) and
 * its reuse in shadow generation (shadows.js).
 *
 * The spatial index is an ACCELERATION STRUCTURE, not an algorithm change —
 * every visible/hidden classification (HLR.createClipper's hiddenAt) and
 * every emitted shadow region must be exactly what it was before, for every
 * scene below. This file captures a fingerprint of full generation output
 * across several overlapping, multi-primitive (faceted + curved) scenes —
 * both settled (full quality) and draft (bounds.fastPreview) — and asserts
 * the fingerprint after the optimization matches the one recorded here,
 * captured from the pre-optimization linear-scan implementation.
 *
 * Written BEFORE the spatial index was implemented (RGR step 2) — the
 * hashes below are the pre-change baseline.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

// Full path signature: point coordinates + every meta field that could be
// affected by an occluder-lookup change (occlusion, hidden-line dashing,
// edge class, region carving). Order-sensitive (emission order is part of
// the contract HLR consumers rely on).
const fingerprint = (paths) => {
  const payload = (paths || []).map((p) => ({
    pts: p.map((pt) => [pt.x, pt.y]),
    meta: p.meta || null,
  }));
  const json = JSON.stringify(payload);
  return {
    hash: crypto.createHash('sha256').update(json).digest('hex'),
    pathCount: payload.length,
    pointCount: payload.reduce((n, p) => n + p.pts.length, 0),
  };
};

const BOUNDS_SETTLED = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3, truncate: true };
const BOUNDS_DRAFT = { ...BOUNDS_SETTLED, fastPreview: true };

describe('Scene3D HLR spatial index — byte-identity guard', () => {
  let runtime;
  let V;
  let algo;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const box = (id, x, y, z, size, extra = {}) => ({
    id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
    transform: { x, y, z, yaw: extra.yaw || 0, pitch: extra.pitch || 0, roll: 0, scale: 1 },
    visibility: extra.visibility || 'solid',
  });
  const sphere = (id, x, y, z, r, extra = {}) => ({
    id, name: id, primitive: 'sphere', params: { radius: r, detail: 14 },
    transform: { x, y, z, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: extra.visibility || 'solid',
  });
  const cylinder = (id, x, y, z, extra = {}) => ({
    id, name: id, primitive: 'cylinder', params: { radius: 12, sy: 30, detail: 14 },
    transform: { x, y, z, yaw: extra.yaw || 0, pitch: 0, roll: 0, scale: 1 },
    visibility: extra.visibility || 'solid',
  });
  const torus = (id, x, y, z, extra = {}) => ({
    id, name: id, primitive: 'torus', params: { sx: 26, sy: 8, sz: 8, detail: 16 },
    transform: { x, y, z, yaw: extra.yaw || 0, pitch: 30, roll: 0, scale: 1 },
    visibility: extra.visibility || 'solid',
  });
  const cone = (id, x, y, z, extra = {}) => ({
    id, name: id, primitive: 'cone', params: { radius: 12, sy: 26, detail: 14 },
    transform: { x, y, z, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: extra.visibility || 'solid',
  });

  // Scenario 1 — dense faceted overlap, orthographic, plain outline (no
  // mapper) — matches the fixed scene3d-drag.test.js fixture family plus a
  // hatch-filled variant so both the sparse-edge and dense-fill clipPath
  // call patterns are covered.
  const facetedOverlapObjects = () => [
    box('b0', -10, 0, -10, 26),
    box('b1', 8, 0, 4, 24, { yaw: 20 }),
    box('b2', -4, 0, 16, 22, { yaw: -15 }),
    box('b3', 14, 0, -12, 20, { yaw: 40 }),
  ];

  // Scenario 2 — curved primitives (non-planar faces → fan-triangulated
  // occluders), x-ray mixed in, perspective camera.
  const curvedOverlapObjects = () => [
    sphere('s0', -6, 0, -6, 16),
    cylinder('c0', 6, 0, 4, { yaw: 25 }),
    torus('t0', -2, 0, 12),
    cone('n0', 10, 0, -10, { visibility: 'xray' }),
  ];

  // Scenario 3 — larger mixed scene (8 objects), heavier occluder count.
  const denseMixedObjects = () => {
    const out = [];
    const prims = [box, sphere, cylinder, torus, cone];
    for (let i = 0; i < 8; i++) {
      const fn = prims[i % prims.length];
      const x = ((i % 4) - 1.5) * 14;
      const z = (Math.floor(i / 4) - 0.5) * 14;
      out.push(fn(`m${i}`, x, 0, z, fn === box ? 20 : undefined, { yaw: i * 13 }));
    }
    return out;
  };

  const sceneParams = (objects, extra = {}) => ({
    ...clone(defaults),
    seed: 7,
    objects,
    ground: { enabled: true },
    backdrop: { enabled: false },
    camera: {
      projection: 'orthographic', yaw: -25, pitch: 24, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    },
    styleTable: { scene: { mapper: 'hatch', params: { fillDensity: 55 } } },
    ...extra,
  });

  const scenarios = [
    { name: 'facetedOverlap-orthographic-hatch', objects: facetedOverlapObjects(), extra: {} },
    {
      name: 'curvedOverlap-perspective-mixed-xray',
      objects: curvedOverlapObjects(),
      extra: {
        camera: { projection: 'perspective', yaw: 35, pitch: -18, roll: 0, cameraDistance: 480, focalLength: 420, zoom: 1 },
        edgeStylesByObject: { n0: { hidden: { hiddenTreatment: 'dash', pen: null, weightMm: null, dash: null } } },
      },
    },
    {
      name: 'denseMixed-8obj-shadows',
      objects: denseMixedObjects(),
      extra: {
        lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 150, elevation: 42 }],
        shadowLayers: 3,
      },
    },
  ];

  // Baseline fingerprints, captured from the pre-spatial-index (linear scan)
  // implementation on this machine/runtime. Any change to these values means
  // the visible/hidden classification changed — a correctness regression,
  // not an acceptable side effect of an acceleration structure.
  // NOTE (FS-R2): the `|draft` rows below were recaptured when scene3d.js
  // was fixed to actually thread bounds.fastPreview into HLR.createClipper
  // as opts.draft — previously a wiring bug meant draft frames silently
  // fell through to full-quality (settled) sampling, so the old `|draft`
  // hashes were really settled-sampling hashes in disguise. The P5 draft
  // coarser-sampling behavior is EXPECTED to change draft-mode geometry
  // (that is the feature); the `|settled` rows are untouched and still
  // match the pre-spatial-index baseline exactly, proving settled output
  // stayed byte-identical.
  const EXPECTED = {
    'facetedOverlap-orthographic-hatch|settled': { hash: '96e5e0f732b09b4ab57c546e94dcd3d71cb5c917c8fb4d34c5cc071810ce9d59', pathCount: 132, pointCount: 264 },
    'facetedOverlap-orthographic-hatch|draft': { hash: 'c89e3d735e2b53f3c1d154e7f3567d53a1e6053159b9ffa25a5853f7973d6a76', pathCount: 200, pointCount: 400 },
    'curvedOverlap-perspective-mixed-xray|settled': { hash: '98c456f3f08ead41305f0dcdfc46dece0319692cd63905157f1dc2f862bfe865', pathCount: 343, pointCount: 1135 },
    'curvedOverlap-perspective-mixed-xray|draft': { hash: '83aebf997a1e39aed36e2893fb18e7e7ea386755a9493e4868c53c51c80ee2f9', pathCount: 302, pointCount: 604 },
    'denseMixed-8obj-shadows|settled': { hash: 'c369bbc5ffdcf9fdedebc4b47ce61d1794e484679ebe7f0c79ec23ae0abac96b', pathCount: 471, pointCount: 2130 },
    'denseMixed-8obj-shadows|draft': { hash: '9c3de29b1f268348208ebe1395268ad1f099ffdfc1b58d5759e3dc7eba7f4486', pathCount: 466, pointCount: 932 },
  };

  scenarios.forEach(({ name, objects, extra }) => {
    test(`${name}: settled + draft output is byte-identical to the pre-index baseline`, () => {
      const paramsSettled = sceneParams(objects, extra);
      const pathsSettled = algo.generate(paramsSettled, null, null, BOUNDS_SETTLED) || [];
      const fpSettled = fingerprint(pathsSettled);

      const paramsDraft = sceneParams(objects, extra);
      const pathsDraft = algo.generate(paramsDraft, null, null, BOUNDS_DRAFT) || [];
      const fpDraft = fingerprint(pathsDraft);

      const settledKey = `${name}|settled`;
      const draftKey = `${name}|draft`;
      const expectedSettled = EXPECTED[settledKey];
      const expectedDraft = EXPECTED[draftKey];

      if (!expectedSettled || !expectedDraft) {
        // Capture mode: no baseline recorded yet for this scenario. Fail
        // loudly with the value to paste into EXPECTED above, rather than
        // silently passing (a null expectation must never read as "OK").
        throw new Error(
          `No baseline recorded for "${name}". Paste into EXPECTED:\n` +
          `  '${settledKey}': { hash: '${fpSettled.hash}', pathCount: ${fpSettled.pathCount}, pointCount: ${fpSettled.pointCount} },\n` +
          `  '${draftKey}': { hash: '${fpDraft.hash}', pathCount: ${fpDraft.pathCount}, pointCount: ${fpDraft.pointCount} },`,
        );
      }

      expect(fpSettled.pathCount).toBeGreaterThan(0);
      expect(fpSettled).toEqual(expectedSettled);
      expect(fpDraft.pathCount).toBeGreaterThan(0);
      expect(fpDraft).toEqual(expectedDraft);
    });
  });
});
