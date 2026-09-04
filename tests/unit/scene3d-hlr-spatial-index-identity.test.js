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
  //
  // NOTE (FS-Z2): the two `|settled` rows below moved AGAIN, for a reason
  // unrelated to the spatial index. These fingerprints are a PROXY for an
  // indexed-vs-brute-force identity invariant, not an end in themselves —
  // and that invariant was independently re-verified intact for this change:
  // a private patched copy of hlr.js (createClipper's
  // `const index = buffer ? null : buildOccluderIndex(occluders)` forced to
  // `const index = null`) was diffed against the unpatched indexed runtime
  // across all 6 scenario×mode combinations here, on this tree and on clean
  // 421d4ac3 and 443b4800 — byte-identical every time, and hlr.js itself has
  // no diff anywhere across that chain. So the index is sound; only the
  // hard-coded fingerprints are stale, because shadow geometry legitimately
  // changed (ruling-fragmentation was replaced by ruling-spacing, which
  // changes emitted path/point counts for scenes with cast shadows):
  //   facetedOverlap|settled pathCount: 124 (421d4ac3) -> 122 (443b4800) -> 129 (here)
  //   denseMixed|settled     pathCount: 546 (421d4ac3) -> 466 (443b4800) -> 467 (here)
  // The `identity` describe block below now also asserts the invariant
  // DIRECTLY (indexed vs. brute-force output computed in the same run, via
  // the api.__forceLinearScan test seam in hlr.js) so this file no longer
  // depends solely on a human re-diagnosing "did the numbers move for a
  // legitimate reason" every time scene geometry changes. Keep BOTH: the
  // absolute fingerprints below still catch unintended geometry drift that
  // the identity check alone would miss (e.g. a bug that changes indexed
  // AND brute-force output identically).
  //
  // NOTE (F2, 2026-08-29): the two `|settled` rows that carry a TORUS moved
  // again, and only those two — `facetedOverlap` (box only) and both `|draft`
  // rows are bit-for-bit unchanged. `SurfaceFill.sampleAt` used to orient each
  // surface normal on its own with `dot(n, p0) < 0` ("outward, charts centre
  // near origin"), which is a star-shapedness test, not a handedness one. On a
  // torus `dot(n, p) = major·cos(2πv) + minor` goes negative across the inner
  // third of the tube, so 6837 of 24779 samples came back INVERTED and the
  // torus was shaded, and ruled, off the wrong sheet. The orientation is now
  // decided ONCE per chart by the sign of ∮ p·n dA, so the torus finally draws
  // the surface that faces the camera. Every chart whose normal already pointed
  // outward at every sample — sphere, capsule, cylinder, cone, box — is
  // untouched by construction, which is why only the torus scenes moved:
  //   curvedOverlap|settled pathCount: 343 -> 341
  //   denseMixed|settled    pathCount: 467 -> 464
  //
  // NOTE (F7, 2026-09-01): exactly one row per torus-carrying scenario moved
  // AGAIN, each by a handful of points — `curvedOverlap|settled` (1102 -> 1099
  // pts) and `denseMixed|draft` (932 -> 926 pts); the OTHER mode of each
  // scenario, and the box-only `facetedOverlap` scenario entirely, are
  // bit-for-bit unchanged. This is the torus self-occlusion fix
  // (`Scene3D.TorusOcclusion` — closed-form ray/torus intersection, see
  // `tests/unit/scene3d-ribbon-f7-self-occlusion.test.js`): a non-convex
  // object's own far tube wall can now be hidden by its own near tube wall
  // through the inner hole, exactly the reported defect. `hiddenAt`'s new
  // `seg.analyticOccluder` hook only fires for a torus (every other
  // primitive here — box/sphere/cylinder/cone — is provably untouched, see
  // `check-convex-byte-identical` in the F7 report), so only the two
  // torus-carrying scenarios could move, and only the handful of points that
  // sat in the object's own genuine near/far overlap moved.
  // NOTE (sf/shadow-overlap, 2026-09-04): `denseMixed-8obj-shadows|settled`
  // moved AGAIN — 464 -> 560 paths, 2111 -> 2303 points — and this time it is
  // the shadow-overlap darkening feature (`Shadows.build`'s `overlapLevels` /
  // `overlapPitch`), verified deliberately rather than rubber-stamped:
  //   - Of the +96 paths, 91 (70 depth-2 + 21 depth-3) carry the new
  //     `sceneTarget.shadowOverlap` tag — they are exactly the regions the
  //     8-caster class's intersection lattice found two/three footprints
  //     deep, per `azimuth: 150, elevation: 42` with 8 objects packed on a
  //     14-unit grid.
  //   - Re-measuring this exact scene's emitted ink (sum of segment length /
  //     polygon area, grouped by `shadowOverlap`) gives density 0.087 for the
  //     untagged (depth-1) regions vs. 1.62-1.63 for the depth-2/3 regions —
  //     ~19x denser, not the ~1x a coincident-line bug would produce. This is
  //     the tighter-pitch mechanism working, not the documented "emit it
  //     twice" trap.
  //   - The residual +5 paths / +10 points outside the tagged regions come
  //     from splitting the class's footprint into (overlap pieces) + (rest);
  //     "rest" is now `geom` minus the overlap lattice rather than the raw
  //     union, so its hatch clips against a newly-cut boundary — a required
  //     side effect of not double-inking the overlap zone, not a defect.
  //   - `|draft` for this same scenario is UNCHANGED (still 463 / 926,
  //     confirmed byte-identical) — draft frames route through the flat
  //     single-hatch legacy path this file's `emitShadowRegion` comment
  //     already documents, which never sets `cfg.overlapDepth`.
  //   - The other two scenarios in this file (no shadows) and the WIP's own
  //     `tests/unit/scene3d-shadow-overlap.test.js` (single-caster and
  //     non-overlapping-pair fixtures) are still byte-identical, which is
  //     the control: the change is scoped to genuine multi-caster overlap.
  const EXPECTED = {
    'facetedOverlap-orthographic-hatch|settled': { hash: 'edb852cb0986dcbb6a12958f2a539b67f558948fa6dd5428b5cc0548ececc829', pathCount: 129, pointCount: 258 },
    'facetedOverlap-orthographic-hatch|draft': { hash: 'c89e3d735e2b53f3c1d154e7f3567d53a1e6053159b9ffa25a5853f7973d6a76', pathCount: 200, pointCount: 400 },
    'curvedOverlap-perspective-mixed-xray|settled': { hash: 'b47a8383997457c45e0c95a323a09481a362997812958cf4094a427e2c99728f', pathCount: 341, pointCount: 1099 },
    'curvedOverlap-perspective-mixed-xray|draft': { hash: '83aebf997a1e39aed36e2893fb18e7e7ea386755a9493e4868c53c51c80ee2f9', pathCount: 302, pointCount: 604 },
    'denseMixed-8obj-shadows|settled': { hash: '47a37463e73f66365ccc570268da3f0f655bedcb8b1f79ecca810c544e60ec95', pathCount: 560, pointCount: 2303 },
    'denseMixed-8obj-shadows|draft': { hash: 'fdf84edf779e274c8334aff74707d5702e57bc9e73faee8bc1500ae6061aa360', pathCount: 463, pointCount: 926 },
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

  // Direct invariant check: instead of relying only on a static fingerprint
  // (which legitimately goes stale whenever scene geometry changes for
  // unrelated reasons — see the FS-Z2 note above), compute BOTH the indexed
  // and the brute-force-linear-scan output in the SAME test run and assert
  // they are identical. hlr.js exposes a test-only seam for this
  // (`HLR.__forceLinearScan`) that forces createClipper to skip building the
  // spatial index and fall back to the original linear occluder scan — it is
  // never set by production code (see hlr.js for the seam's own doc comment).
  scenarios.forEach(({ name, objects, extra }) => {
    test(`${name}: indexed output matches brute-force linear-scan output (same run)`, () => {
      const HLR = V.Scene3D.HLR;
      try {
        const paramsIndexedSettled = sceneParams(objects, extra);
        HLR.__forceLinearScan = false;
        const pathsIndexedSettled = algo.generate(paramsIndexedSettled, null, null, BOUNDS_SETTLED) || [];
        const fpIndexedSettled = fingerprint(pathsIndexedSettled);

        const paramsBruteSettled = sceneParams(objects, extra);
        HLR.__forceLinearScan = true;
        const pathsBruteSettled = algo.generate(paramsBruteSettled, null, null, BOUNDS_SETTLED) || [];
        const fpBruteSettled = fingerprint(pathsBruteSettled);

        const paramsIndexedDraft = sceneParams(objects, extra);
        HLR.__forceLinearScan = false;
        const pathsIndexedDraft = algo.generate(paramsIndexedDraft, null, null, BOUNDS_DRAFT) || [];
        const fpIndexedDraft = fingerprint(pathsIndexedDraft);

        const paramsBruteDraft = sceneParams(objects, extra);
        HLR.__forceLinearScan = true;
        const pathsBruteDraft = algo.generate(paramsBruteDraft, null, null, BOUNDS_DRAFT) || [];
        const fpBruteDraft = fingerprint(pathsBruteDraft);

        expect(fpIndexedSettled.pathCount).toBeGreaterThan(0);
        expect(fpIndexedSettled).toEqual(fpBruteSettled);
        expect(fpIndexedDraft.pathCount).toBeGreaterThan(0);
        expect(fpIndexedDraft).toEqual(fpBruteDraft);
      } finally {
        // Never leave the shared module-level flag flipped for later tests
        // (this file's own remaining scenarios, or any other suite that
        // shares this jsdom runtime instance).
        V.Scene3D.HLR.__forceLinearScan = false;
      }
    });
  });
});
