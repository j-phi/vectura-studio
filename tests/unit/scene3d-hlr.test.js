const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Flat-face hidden-line-removal coverage (Phase 1 stream 1A — spec F-01..F-06).
 *
 * - A far box fully covered by a near box loses all its geometry (solid).
 * - Ground never occludes (F-03).
 * - X-ray objects keep hidden runs as dashes and never occlude others.
 * - Support-plane depth: occluder depth is evaluated per sample from the
 *   face's plane at (x, y), not one scalar per face (F-02) — a tilted
 *   occluder must hide exactly the part of a crossing segment it is in
 *   front of.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true };

const box = (id, size, z, extra = {}) => ({
  id,
  name: id,
  primitive: 'box',
  params: { sx: size, sy: size, sz: size },
  transform: { x: 0, y: 0, z, yaw: 0, pitch: 0, roll: 0, scale: 1, ...(extra.transform || {}) },
  visibility: extra.visibility || 'solid',
});

describe('scene3d flat-face HLR', () => {
  let runtime;
  let V;
  let algo;
  let HLR;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    HLR = V.Scene3D && V.Scene3D.HLR;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  const sceneParams = (objects, extra = {}) => ({
    ...clone(defaults),
    seed: 1,
    objects,
    ground: { enabled: false },
    backdrop: { enabled: false },
    camera: {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    },
    ...extra,
  });

  const byObject = (paths, id) => paths.filter((p) => p.meta.sceneTarget.objectId === id);

  test('a far box fully behind a near box is dropped entirely (solid)', () => {
    // Near box (40) at z=+40; far box (20) at z=-40, strictly inside the near
    // silhouette in screen space → every far-box path is occluded.
    const paths = algo.generate(
      sceneParams([box('obj-1', 40, 40), box('obj-2', 20, -40)]),
      null, null, BOUNDS) || [];
    expect(byObject(paths, 'obj-1').length).toBeGreaterThan(0);
    expect(byObject(paths, 'obj-2').length).toBe(0);
  });

  test('ground never occludes: a box below the ground plane renders identically', () => {
    const below = (extra) => sceneParams(
      [{ ...box('obj-1', 40, 0), transform: { x: 0, y: -40, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } }],
      { camera: { projection: 'orthographic', yaw: -30, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 }, ...extra });
    const withGround = algo.generate(below({ ground: { enabled: true } }), null, null, BOUNDS) || [];
    const withoutGround = algo.generate(below({ ground: { enabled: false } }), null, null, BOUNDS) || [];
    const sig = (paths) => JSON.stringify(byObject(paths, 'obj-1').map((p) => p.map((q) => [q.x, q.y])));
    expect(byObject(withGround, 'obj-1').length).toBeGreaterThan(0);
    expect(sig(withGround)).toBe(sig(withoutGround));
    // Ground itself is a styleable target when enabled.
    expect(byObject(withGround, 'ground').length).toBeGreaterThan(0);
    expect(byObject(withoutGround, 'ground').length).toBe(0);
  });

  // X-RAY FOLD: the see-through dash is owned by edgeStyles.hidden now (a saved
  // scene gets a migrated hidden=dash seed). With that seed the x-ray far box
  // keeps its occluded runs as dashes flagged occluded, exactly as before.
  test('x-ray far box keeps hidden runs as dashed paths flagged occluded', () => {
    const scene = sceneParams([box('obj-1', 40, 40), box('obj-2', 20, -40, { visibility: 'xray' })]);
    scene.edgeStylesByObject = { 'obj-2': { hidden: { hiddenTreatment: 'dash', pen: null, weightMm: null, dash: null } } };
    const paths = algo.generate(scene, null, null, BOUNDS) || [];
    const far = byObject(paths, 'obj-2');
    expect(far.length).toBeGreaterThan(0);
    far.forEach((p) => {
      expect(p.meta.hiddenLine).toBe(true);
      expect(Array.isArray(p.meta.strokeDash)).toBe(true);
      expect(p.meta.sceneTarget.occluded).toBe(true);
      if (p.meta.kind === 'sceneEdge') expect(p.meta.sceneTarget.edgeClass).toBe('hidden');
    });
  });

  test('x-ray objects never occlude others', () => {
    // Near box is x-ray → the far solid box must render fully visible,
    // identical to when it stands alone.
    const behind = algo.generate(
      sceneParams([box('obj-1', 40, 40, { visibility: 'xray' }), box('obj-2', 20, -40)]),
      null, null, BOUNDS) || [];
    const alone = algo.generate(
      sceneParams([box('obj-2', 20, -40)]),
      null, null, BOUNDS) || [];
    const sig = (paths) => JSON.stringify(byObject(paths, 'obj-2').map((p) => p.map((q) => [q.x, q.y])));
    expect(byObject(behind, 'obj-2').length).toBeGreaterThan(0);
    expect(sig(behind)).toBe(sig(alone));
    byObject(behind, 'obj-2').forEach((p) => expect(p.meta.hiddenLine).toBeUndefined());
  });

  describe('support-plane occluder depth (F-02)', () => {
    test('a tilted occluder hides exactly the part of a segment it is in front of', () => {
      // Occluder plane depth falls 100 → 0 across x ∈ [0, 100]. A crossing
      // segment at constant depth 50 must be hidden ONLY where the plane is
      // nearer (x < ~49.5 with bias 0.5). A scalar per-face depth (max 100 or
      // centroid 50) would hide all of it or none of it.
      const faces = [{
        id: 'T/face:0',
        objectId: 'T',
        polygon: [
          { x: 0, y: 0, z: 100 },
          { x: 100, y: 0, z: 0 },
          { x: 100, y: 100, z: 0 },
          { x: 0, y: 100, z: 100 },
        ],
      }];
      const segments = [{
        a: { x: 0, y: 50, z: 50 },
        b: { x: 100, y: 50, z: 50 },
        ownerKeys: [],
        objectId: 'S',
        mode: 'remove',
      }];
      const out = HLR.occludeSegments(segments, faces, { bias: 0.5 });
      expect(out.length).toBeGreaterThan(0);
      let minX = Infinity;
      let maxX = -Infinity;
      out.forEach((path) => path.forEach((pt) => {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
      }));
      // Visible run starts near the crossover (x ≈ 49.5) and reaches the end.
      expect(minX).toBeGreaterThan(40);
      expect(minX).toBeLessThan(58);
      expect(maxX).toBeGreaterThan(95);
    });

    test('a non-planar occluder is fan-triangulated, keeping the exact clip path (F-05)', () => {
      // A non-triangle occluder face (a solid/polyhedron n-gon, an imported mesh
      // polygon, or a CSG fragment) can be non-planar in screen+depth space. The
      // OLD behaviour flipped the WHOLE clipper to the owner-aware depth buffer,
      // whose per-cell depth is too coarse to resolve one curved object occluding
      // another → cross-object peek-through. buildOccluders must instead split the
      // non-planar face into planar triangles so the exact support-plane path is
      // retained for the entire scene.
      const nonPlanarQuad = {
        id: 'C/face:0',
        objectId: 'C',
        polygon: [
          { x: 0, y: 0, z: 0 },
          { x: 100, y: 0, z: 0 },
          { x: 100, y: 100, z: 40 }, // lifts one corner → not affine in (x,y,z)
          { x: 0, y: 100, z: 0 },
        ],
      };
      // Sanity: this quad really is non-planar past the tolerance.
      expect(HLR.fitSupportPlane(nonPlanarQuad.polygon).residual)
        .toBeGreaterThan(HLR.PLANAR_RESIDUAL_TOL);

      const built = HLR.buildOccluders([nonPlanarQuad]);
      // No ambiguity flag → no coarse depth-buffer fallback.
      expect(built.ambiguous).toBe(false);
      // Fan-split into planar triangles (2 for a quad), each an exact plane.
      expect(built.occluders.length).toBe(2);
      built.occluders.forEach((occ) => {
        expect(occ.id).toBe('C/face:0'); // owner identity preserved (self-exclusion)
        expect(occ.objectId).toBe('C');
        expect(occ.plane.residual).toBeLessThanOrEqual(HLR.PLANAR_RESIDUAL_TOL);
      });

      // The clipper stays on the exact path (not the buffer) and still occludes.
      const clip = HLR.createClipper([nonPlanarQuad], { bias: 0.5 });
      expect(clip.ambiguous).toBe(false);
      // A segment well behind the near corner (depth 40 region) is hidden there.
      const out = HLR.occludeSegments([{
        a: { x: 60, y: 90, z: -10 }, b: { x: 95, y: 90, z: -10 },
        ownerKeys: [], objectId: 'S', mode: 'remove',
      }], [nonPlanarQuad], { bias: 0.5 });
      // Fully behind the lifted (near) part of the quad → nothing survives.
      expect(out.length).toBe(0);
    });

    test('a genuinely planar quad occluder is kept whole (byte-identical, not split)', () => {
      // Planar faces (box tris, the ground/plane quad, tone/fill quads) must be
      // untouched by the triangulation guard so existing scenes stay identical.
      const planarQuad = {
        id: 'B/face:0',
        objectId: 'B',
        polygon: [
          { x: 0, y: 0, z: 60 },
          { x: 100, y: 0, z: 60 },
          { x: 100, y: 100, z: 60 },
          { x: 0, y: 100, z: 60 },
        ],
      };
      const built = HLR.buildOccluders([planarQuad]);
      expect(built.ambiguous).toBe(false);
      expect(built.occluders.length).toBe(1); // not split
      expect(built.occluders[0].polygon.length).toBe(4); // original polygon retained
    });

    test('an occluder never hides its own face (ownerKeys exclusion)', () => {
      const faces = [{
        id: 'T/face:0',
        objectId: 'T',
        polygon: [
          { x: 0, y: 0, z: 60 },
          { x: 100, y: 0, z: 60 },
          { x: 100, y: 100, z: 60 },
          { x: 0, y: 100, z: 60 },
        ],
      }];
      // A segment ON the face plane, owned by the face: must stay fully visible.
      const segments = [{
        a: { x: 10, y: 50, z: 60 },
        b: { x: 90, y: 50, z: 60 },
        ownerKeys: ['T/face:0'],
        objectId: 'T',
        mode: 'remove',
      }];
      const out = HLR.occludeSegments(segments, faces, { bias: 0.5 });
      expect(out.length).toBe(1);
      const xs = out[0].map((pt) => pt.x);
      expect(Math.min(...xs)).toBeLessThan(11);
      expect(Math.max(...xs)).toBeGreaterThan(89);
    });
  });

  // FS-F1 P5: draft-only coarser sampling. clipPath samples a segment at
  // fixed steps (x_i = a.x + len*i/steps); a hidden zone entirely between two
  // consecutive samples is invisible to the algorithm by construction (no
  // sampled point ever lands inside it, so no visible/hidden flip is ever
  // observed). This test derives the EXACT settled and draft sample
  // positions from the exported SAMPLE_STEP/DRAFT_SAMPLE_STEP_MULT constants
  // (no hardcoded magic numbers) and places one narrow occluder squarely
  // inside a gap between two consecutive DRAFT samples while a SETTLED
  // sample is guaranteed to land inside it (settled spacing < draft spacing)
  // — so settled must detect the hidden zone and draft must not.
  describe('draft-only coarser sampling (P5)', () => {
    const LEN = 200;
    let gapLo = null;
    let gapHi = null;

    beforeAll(() => {
      const stepsFor = (sampleStep) => Math.min(400, Math.max(2, Math.round(LEN / sampleStep) + 1));
      const settledSteps = stepsFor(HLR.SAMPLE_STEP);
      const draftSteps = stepsFor(HLR.SAMPLE_STEP * HLR.DRAFT_SAMPLE_STEP_MULT);
      const draftSampleX = (i) => (LEN * i) / draftSteps;
      // Find a draft sample index whose gap to the next draft sample also
      // contains a settled sample strictly inside it (guaranteed to exist
      // since settled spacing is smaller — draft spacing / mult — than draft
      // spacing, so on average DRAFT_SAMPLE_STEP_MULT settled samples fall in
      // every draft gap).
      const settledSampleXs = Array.from({ length: settledSteps + 1 }, (_, i) => (LEN * i) / settledSteps);
      for (let j = 0; j < draftSteps && gapLo === null; j++) {
        const lo = draftSampleX(j); const hi = draftSampleX(j + 1);
        const margin = (hi - lo) * 0.15; // stay off the draft sample points themselves
        const innerLo = lo + margin; const innerHi = hi - margin;
        if (innerHi <= innerLo) continue;
        const hasSettled = settledSampleXs.some((sx) => sx > innerLo && sx < innerHi);
        // Also stay comfortably inside the segment body (away from x=0/LEN
        // endpoints, which are always sampled regardless of step).
        if (hasSettled && innerLo > 10 && innerHi < LEN - 10) { gapLo = innerLo; gapHi = innerHi; }
      }
    });

    const picketFace = () => [{
      id: 'P/face:0',
      objectId: 'P',
      polygon: [
        { x: gapLo, y: 0, z: 40 },
        { x: gapHi, y: 0, z: 40 },
        { x: gapHi, y: 100, z: 40 },
        { x: gapLo, y: 100, z: 40 },
      ],
    }];
    const crossingSegment = () => [{
      a: { x: 0, y: 50, z: 0 }, b: { x: LEN, y: 50, z: 0 },
      ownerKeys: [], objectId: 'S', mode: 'remove',
    }];

    test('a hidden zone that fits inside one draft sample gap is found at settled quality', () => {
      expect(gapLo).not.toBeNull(); // sanity: the derived fixture is well-formed
      const settledRuns = HLR.occludeSegments(crossingSegment(), picketFace(), { bias: 0.5 });
      // Settled samples the interior of [gapLo, gapHi] → detects the near
      // picket → splits the single visible run into two.
      expect(settledRuns.length).toBe(2);
    });

    test('draft:true measurably coarsens sampling vs. the default (no opts.draft)', () => {
      const settledRuns = HLR.occludeSegments(crossingSegment(), picketFace(), { bias: 0.5 }).length;
      const draftRuns = HLR.occludeSegments(crossingSegment(), picketFace(), { bias: 0.5, draft: true }).length;
      // Draft never samples inside [gapLo, gapHi] by construction → the
      // narrow occluder is invisible to it → one unbroken visible run.
      expect(draftRuns).toBe(1);
      expect(draftRuns).toBeLessThan(settledRuns);
    });

    test('omitting opts.draft (today\'s real scene3d.js call shape) is untouched', () => {
      // scene3d.js:447 calls HLR.createClipper(occluderFaces, { bias: HLR_BIAS })
      // — no draft key at all. That exact opts shape must behave identically
      // to an explicit draft:false, proving the settled path never moves
      // just because a caller elsewhere in the app runs in draft mode.
      const withoutKey = HLR.occludeSegments(crossingSegment(), picketFace(), { bias: 0.5 });
      const explicitFalse = HLR.occludeSegments(crossingSegment(), picketFace(), { bias: 0.5, draft: false });
      expect(JSON.stringify(withoutKey)).toBe(JSON.stringify(explicitFalse));
    });
  });
});
