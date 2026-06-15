const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Unit coverage for the shared 3D enhancement helpers added to Geometry3D
// (depth-cue dash #2, silhouette/crease weight #3, hidden-line removal #4,
// Lambert hatching #5). These are the PURE helpers the per-algorithm teams bind
// to; the algorithms themselves are not wired up here.

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

describe('Geometry3D shared enhancement helpers', () => {
  let runtime;
  let G;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    G = runtime.window.Vectura.Geometry3D;
  });

  afterAll(() => runtime.cleanup());

  describe('resolveLight', () => {
    it('returns a unit vector for the defaults', () => {
      const lv = G.resolveLight({});
      const len = Math.hypot(lv.x, lv.y, lv.z);
      expect(Math.abs(len - 1)).toBeLessThan(1e-9);
    });

    it('elevation 90 points straight toward the viewer (+z)', () => {
      const lv = G.resolveLight({ lightElevation: 90 });
      expect(lv.z).toBeCloseTo(1, 9);
      expect(Math.abs(lv.x)).toBeLessThan(1e-9);
      expect(Math.abs(lv.y)).toBeLessThan(1e-9);
    });

    it('azimuth 0 / elevation 0 points along +x', () => {
      const lv = G.resolveLight({ lightAzimuth: 0, lightElevation: 0 });
      expect(lv.x).toBeCloseTo(1, 9);
      expect(Math.abs(lv.y)).toBeLessThan(1e-9);
      expect(Math.abs(lv.z)).toBeLessThan(1e-9);
    });

    it('is deterministic', () => {
      const a = G.resolveLight({ lightAzimuth: 200, lightElevation: 33 });
      const b = G.resolveLight({ lightAzimuth: 200, lightElevation: 33 });
      expect(a).toEqual(b);
    });
  });

  describe('hatchPolygon', () => {
    // A 100x100 axis-aligned square.
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    it('fills a square with horizontal scan lines at the expected count and span', () => {
      // angle 0 → horizontal lines; spacing 10 over a 100-tall square interior.
      const segs = G.hatchPolygon(square, { angleDeg: 0, spacing: 10 });
      // floor((100-0)/10) = 10 candidate offsets; offsets exactly on a vertex
      // edge may drop, so allow 9..10.
      expect(segs.length).toBeGreaterThanOrEqual(9);
      expect(segs.length).toBeLessThanOrEqual(10);
      segs.forEach((seg) => {
        expect(seg.meta.hatch).toBe(true);
        expect(seg.meta.straight).toBe(true);
        expect(seg.length).toBe(2);
        // A full-width horizontal chord spans ~100.
        expect(dist(seg[0], seg[1])).toBeCloseTo(100, 6);
      });
    });

    it('keeps every hatch point inside the square', () => {
      const segs = G.hatchPolygon(square, { angleDeg: 45, spacing: 8 });
      expect(segs.length).toBeGreaterThan(0);
      segs.forEach((seg) => {
        seg.forEach((pt) => {
          expect(pt.x).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.x).toBeLessThanOrEqual(100 + 1e-6);
          expect(pt.y).toBeGreaterThanOrEqual(-1e-6);
          expect(pt.y).toBeLessThanOrEqual(100 + 1e-6);
        });
      });
    });

    it('enforces a spacing floor of 1 (bounded count)', () => {
      const segs = G.hatchPolygon(square, { angleDeg: 0, spacing: 0 });
      // spacing clamped to 1 → at most ~100 lines, never an unbounded blow-up.
      expect(segs.length).toBeLessThanOrEqual(101);
    });

    it('is deterministic', () => {
      const a = G.hatchPolygon(square, { angleDeg: 30, spacing: 7 });
      const b = G.hatchPolygon(square, { angleDeg: 30, spacing: 7 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  describe('lambertHatch', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 0, y: 50 },
    ];

    it('produces denser hatching for a dark (back-to-light) face than a lit face', () => {
      const light = G.v(0, 0, 1);
      const litFace = G.v(0, 0, 1); // facing the light
      const darkFace = G.v(0, 0, -1); // away from the light → shade 0
      const lit = G.lambertHatch(litFace, light, square, { baseSpacing: 6, angleDeg: 0 });
      const dark = G.lambertHatch(darkFace, light, square, { baseSpacing: 6, angleDeg: 0 });
      expect(dark.length).toBeGreaterThan(lit.length);
    });

    it('adds a cross-hatch pass on a dark face when crossHatch is on', () => {
      const light = G.v(0, 0, 1);
      const darkFace = G.v(0, 0, -1);
      const single = G.lambertHatch(darkFace, light, square, { baseSpacing: 6, angleDeg: 0, crossHatch: false });
      const cross = G.lambertHatch(darkFace, light, square, { baseSpacing: 6, angleDeg: 0, crossHatch: true });
      expect(cross.length).toBeGreaterThan(single.length);
    });
  });

  describe('occludeSegments', () => {
    // A nearer square occluder covering the centre of the screen.
    const occluder = {
      polygon: [
        { x: 20, y: 20 },
        { x: 80, y: 20 },
        { x: 80, y: 80 },
        { x: 20, y: 80 },
      ],
      depth: 100, // near
    };

    it('removes a segment fully behind a covering nearer occluder', () => {
      const seg = { a: { x: 30, y: 50, z: 0 }, b: { x: 70, y: 50, z: 0 }, meta: { straight: true } };
      const out = G.occludeSegments([seg], [occluder], { mode: 'remove', depthBias: 0.5 });
      expect(out.length).toBe(0);
    });

    it('keeps a segment with no occluder unchanged', () => {
      const seg = { a: { x: 30, y: 50, z: 0 }, b: { x: 70, y: 50, z: 0 }, meta: { straight: true } };
      const out = G.occludeSegments([seg], [], { mode: 'remove' });
      expect(out.length).toBe(1);
      expect(out[0].length).toBe(2);
      expect(out[0].meta.straight).toBe(true);
    });

    it('does not occlude a segment that is NEARER than the occluder', () => {
      const seg = { a: { x: 30, y: 50, z: 200 }, b: { x: 70, y: 50, z: 200 }, meta: {} };
      const out = G.occludeSegments([seg], [occluder], { mode: 'remove' });
      expect(out.length).toBeGreaterThan(0);
    });

    it('dash mode routes hidden runs through markHidden (keeps them, flagged)', () => {
      const seg = { a: { x: 30, y: 50, z: 0 }, b: { x: 70, y: 50, z: 0 }, meta: {} };
      const out = G.occludeSegments([seg], [occluder], { mode: 'dash', depthBias: 0.5 });
      expect(out.length).toBeGreaterThan(0);
      expect(out.some((p) => p.meta && p.meta.hiddenLine === true)).toBe(true);
    });

    it('splits a partially covered segment into visible + hidden runs', () => {
      // Segment runs from outside the occluder, through it, back outside.
      const seg = { a: { x: 0, y: 50, z: 0 }, b: { x: 100, y: 50, z: 0 }, meta: {} };
      const removed = G.occludeSegments([seg], [occluder], { mode: 'remove', depthBias: 0.5 });
      // The left + right exposed runs survive; the middle is dropped.
      expect(removed.length).toBeGreaterThanOrEqual(1);
      removed.forEach((run) => {
        run.forEach((pt) => {
          const insideX = pt.x > 21 && pt.x < 79;
          expect(insideX).toBe(false);
        });
      });
    });

    it('is deterministic', () => {
      const seg = { a: { x: 0, y: 50, z: 0 }, b: { x: 100, y: 50, z: 0 }, meta: {} };
      const a = G.occludeSegments([seg], [occluder], { mode: 'dash' });
      const b = G.occludeSegments([seg], [occluder], { mode: 'dash' });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

  });

  describe('occludeSegmentsDepthBuffer', () => {
    // A square of two nearer (depth 100) triangles covering x,y ∈ [20,80].
    const nearQuad = (depth) => ([
      [{ x: 20, y: 20, d: depth }, { x: 80, y: 20, d: depth }, { x: 80, y: 80, d: depth }],
      [{ x: 20, y: 20, d: depth }, { x: 80, y: 80, d: depth }, { x: 20, y: 80, d: depth }],
    ]);

    it('removes a segment fully behind nearer occluder triangles', () => {
      const seg = { a: { x: 30, y: 50, z: 0 }, b: { x: 70, y: 50, z: 0 }, meta: { straight: true } };
      const out = G.occludeSegmentsDepthBuffer([seg], nearQuad(100), { mode: 'remove', depthBias: 0.5 });
      expect(out.length).toBe(0);
    });

    it('keeps a segment with no occluders unchanged', () => {
      const seg = { a: { x: 30, y: 50, z: 0 }, b: { x: 70, y: 50, z: 0 }, meta: { straight: true } };
      const out = G.occludeSegmentsDepthBuffer([seg], [], { mode: 'remove' });
      expect(out.length).toBe(1);
      expect(out[0].meta.straight).toBe(true);
    });

    it('does not occlude a segment NEARER than the occluder', () => {
      const seg = { a: { x: 30, y: 50, z: 200 }, b: { x: 70, y: 50, z: 200 }, meta: {} };
      const out = G.occludeSegmentsDepthBuffer([seg], nearQuad(100), { mode: 'remove' });
      expect(out.length).toBeGreaterThan(0);
    });

    it('splits a partially covered segment into exposed runs', () => {
      const seg = { a: { x: 0, y: 50, z: 0 }, b: { x: 100, y: 50, z: 0 }, meta: {} };
      const out = G.occludeSegmentsDepthBuffer([seg], nearQuad(100), { mode: 'remove', depthBias: 0.5 });
      expect(out.length).toBeGreaterThanOrEqual(1);
      out.forEach((run) => run.forEach((pt) => {
        expect(pt.x > 22 && pt.x < 78).toBe(false); // covered middle is dropped
      }));
    });

    it('dash mode flags hidden runs instead of dropping them', () => {
      const seg = { a: { x: 30, y: 50, z: 0 }, b: { x: 70, y: 50, z: 0 }, meta: {} };
      const out = G.occludeSegmentsDepthBuffer([seg], nearQuad(100), { mode: 'dash', depthBias: 0.5 });
      expect(out.some((p) => p.meta && p.meta.hiddenLine === true)).toBe(true);
    });

    it('is deterministic', () => {
      const seg = { a: { x: 0, y: 50, z: 0 }, b: { x: 100, y: 50, z: 0 }, meta: {} };
      const a = G.occludeSegmentsDepthBuffer([seg], nearQuad(100), { mode: 'dash' });
      const b = G.occludeSegmentsDepthBuffer([seg], nearQuad(100), { mode: 'dash' });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    // A steep depth RAMP (d = 10·x across the cell) is the heightfield-self-occlusion
    // case: a line lying ON the surface samples the cell-centre depth while the
    // buffer holds the cell's nearer max-depth, so a fixed bias self-occludes it
    // into dotted fragments. slopeScale must absorb that per-cell thickness.
    const ramp = () => ([
      [{ x: 0, y: 0, d: 0 }, { x: 100, y: 0, d: 1000 }, { x: 100, y: 100, d: 1000 }],
      [{ x: 0, y: 0, d: 0 }, { x: 100, y: 100, d: 1000 }, { x: 0, y: 100, d: 0 }],
    ]);
    // Segment coplanar with the ramp: z = 10·x along its length.
    const onRamp = () => ({ a: { x: 5, y: 50, z: 50 }, b: { x: 95, y: 50, z: 950 }, meta: { kind: 'scanline' } });
    const pointCount = (out) => out.reduce((n, p) => n + p.length, 0);

    it('slopeScale=0 self-occludes a line lying on a steep surface (the dotted-line bug)', () => {
      const out = G.occludeSegmentsDepthBuffer([onRamp()], ramp(), { mode: 'remove', depthBias: 0.5, slopeScale: 0 });
      // Without slope bias the coplanar line is chopped/removed by its own surface.
      expect(pointCount(out)).toBeLessThan(20);
    });

    it('slopeScale>0 keeps a line lying on a steep surface whole', () => {
      const out = G.occludeSegmentsDepthBuffer([onRamp()], ramp(), { mode: 'remove', depthBias: 0.5, slopeScale: 1 });
      expect(out.length).toBeGreaterThan(0);
      const xs = out.flat().map((p) => p.x);
      // The whole span survives: samples reach both the near and far ends.
      expect(Math.min(...xs)).toBeLessThan(10);
      expect(Math.max(...xs)).toBeGreaterThan(90);
    });

    it('slopeScale does not relax genuine occlusion behind a flat nearer surface', () => {
      // nearQuad is flat (constant depth) → zero local gradient → no slope relief,
      // so a line clearly behind it is still removed.
      const seg = { a: { x: 30, y: 50, z: 0 }, b: { x: 70, y: 50, z: 0 }, meta: {} };
      const out = G.occludeSegmentsDepthBuffer([seg], nearQuad(100), { mode: 'remove', depthBias: 0.5, slopeScale: 1 });
      expect(out.length).toBe(0);
    });
  });

  describe('occludeRowsFloatingHorizon', () => {
    // A horizontal row at screen-y `y`, spanning x∈[0,100], at camera depth `depth`
    // (larger = nearer). `occludes` defaults true (extends the silhouette band).
    const row = (y, depth, occludes = true) =>
      ({ pts: [{ x: 0, y }, { x: 50, y }, { x: 100, y }], depth, occludes, meta: { kind: 'scanline' } });
    const ys = (out) => out.flatMap((p) => p.map((pt) => pt.y));

    it('keeps a single row whole — a row is never occluded by itself', () => {
      const out = G.occludeRowsFloatingHorizon([row(50, 1)], { mode: 'remove' });
      expect(out.length).toBe(1);
      const xs = out[0].map((p) => p.x);
      expect(Math.min(...xs)).toBeLessThanOrEqual(0.5);
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(99.5);
    });

    it('removes a far row that falls inside the near silhouette band', () => {
      // Two near rows (depth 3) at y=20 and y=80 build an opaque band [20,80];
      // the far row (depth 0) at y=50 sits inside it → hidden.
      const out = G.occludeRowsFloatingHorizon(
        [row(20, 3), row(80, 3), row(50, 0)], { mode: 'remove' });
      expect(out.length).toBe(2); // the two near rows survive, far row dropped
      expect(ys(out).every((y) => Math.abs(y - 50) > 1)).toBe(true);
    });

    it('keeps a far row that pokes above the near silhouette band', () => {
      const out = G.occludeRowsFloatingHorizon(
        [row(20, 3), row(80, 3), row(10, 0)], { mode: 'remove' });
      expect(out.length).toBe(3); // far row at y=10 is above the band → visible
      expect(ys(out).some((y) => Math.abs(y - 10) < 1)).toBe(true);
    });

    it('dash mode flags the hidden run instead of dropping it', () => {
      const out = G.occludeRowsFloatingHorizon(
        [row(20, 3), row(80, 3), row(50, 0)], { mode: 'dash' });
      expect(out.length).toBe(3);
      expect(out.some((p) => p.meta && p.meta.hiddenLine === true)).toBe(true);
    });

    it('occludes:false rows are tested but do not extend the horizon', () => {
      // With the lower bound contributed by an OCCLUDING row, the band is [20,80]
      // and the far row hides; flip that lower row to occludes:false and the band
      // collapses to [20,20], so the same far row is now visible.
      const hidden = G.occludeRowsFloatingHorizon(
        [row(20, 3, true), row(80, 3, true), row(50, 0)], { mode: 'remove' });
      const shown = G.occludeRowsFloatingHorizon(
        [row(20, 3, true), row(80, 3, false), row(50, 0)], { mode: 'remove' });
      expect(hidden.length).toBe(2);
      expect(shown.length).toBe(3);
    });

    it('respects roll via opts.angle (de-rolls before measuring the band)', () => {
      const theta = 0.4;
      const c = Math.cos(theta), s = Math.sin(theta);
      const rot = (r) => ({ ...r, pts: r.pts.map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c })) });
      const rolled = [row(20, 3), row(80, 3), row(50, 0)].map(rot);
      const out = G.occludeRowsFloatingHorizon(rolled, { mode: 'remove', angle: theta });
      expect(out.length).toBe(2); // same occlusion result as the un-rolled scene
    });

    it('is deterministic', () => {
      const rows = [row(20, 3), row(80, 3), row(50, 0), row(35, 1)];
      const a = G.occludeRowsFloatingHorizon(rows, { mode: 'dash' });
      const b = G.occludeRowsFloatingHorizon(rows, { mode: 'dash' });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });

  describe('applyDepthCue', () => {
    it('is a no-op when depthCue is off', () => {
      const paths = [Object.assign([{ x: 0, y: 0 }, { x: 1, y: 1 }], { meta: { depth: 5 } })];
      const out = G.applyDepthCue(paths, { depthCue: 'off' });
      expect(out[0].meta.strokeDash).toBeUndefined();
    });

    it('stamps strokeDash scaled by depth, near vs far differ', () => {
      const near = Object.assign([{ x: 0, y: 0 }, { x: 1, y: 1 }], { meta: { depth: 100 } });
      const far = Object.assign([{ x: 0, y: 0 }, { x: 1, y: 1 }], { meta: { depth: 0 } });
      G.applyDepthCue([near, far], { depthCue: 'dash', depthCueStrength: 80 });
      expect(Array.isArray(near.meta.strokeDash)).toBe(true);
      expect(Array.isArray(far.meta.strokeDash)).toBe(true);
      // Far path is sparser → larger gap than the near path.
      expect(far.meta.strokeDash[1]).toBeGreaterThan(near.meta.strokeDash[1]);
    });

    it('SKIPS paths already flagged hiddenLine (hidden dashes win)', () => {
      const hidden = Object.assign([{ x: 0, y: 0 }, { x: 1, y: 1 }], {
        meta: { depth: 50, hiddenLine: true, strokeDash: [3, 2] },
      });
      const visible = Object.assign([{ x: 0, y: 0 }, { x: 1, y: 1 }], { meta: { depth: 0 } });
      G.applyDepthCue([hidden, visible], { depthCue: 'dash', depthCueStrength: 60 });
      expect(hidden.meta.strokeDash).toEqual([3, 2]);
      expect(Array.isArray(visible.meta.strokeDash)).toBe(true);
    });

    it('skips paths with no finite depth', () => {
      const a = Object.assign([{ x: 0, y: 0 }, { x: 1, y: 1 }], { meta: { depth: 10 } });
      const b = Object.assign([{ x: 0, y: 0 }, { x: 1, y: 1 }], { meta: {} });
      G.applyDepthCue([a, b], { depthCue: 'dash' });
      expect(Array.isArray(a.meta.strokeDash)).toBe(true);
      expect(b.meta.strokeDash).toBeUndefined();
    });
  });

  describe('extractSilhouette / extractCreases', () => {
    // Two triangles sharing edge 1-2: one front, one back. Shared edge is a
    // silhouette boundary; the outer edges touch only one face so are skipped.
    const faces = [[0, 1, 2], [1, 2, 3]];
    const projected = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
    ];

    it('returns the boundary edge for a front/back pair', () => {
      const faceFront = [true, false];
      const sil = G.extractSilhouette(faces, projected, faceFront, { weightScale: 2 });
      // Only the shared edge (1,2) is one-front-one-back.
      expect(sil.length).toBe(1);
      expect(sil[0].meta.outline).toBe(true);
      expect(sil[0].meta.weightScale).toBe(2);
      expect(sil[0].meta.straight).toBe(true);
      // It is the diagonal between vertices 1 and 2.
      const ends = [sil[0][0], sil[0][1]];
      expect(ends.some((p) => dist(p, projected[1]) < 1e-9)).toBe(true);
      expect(ends.some((p) => dist(p, projected[2]) < 1e-9)).toBe(true);
    });

    it('returns nothing when both faces are front-facing', () => {
      const sil = G.extractSilhouette(faces, projected, [true, true]);
      expect(sil.length).toBe(0);
    });

    it('extractCreases flags edges whose face normals diverge beyond the angle', () => {
      const edges = G.collectEdges(faces);
      // Two normals 90deg apart on the shared edge.
      const faceNormals = [G.v(0, 0, 1), G.v(1, 0, 0)];
      const creases = G.extractCreases(edges, faceNormals, 35, projected, { weightScale: 3 });
      // The shared edge (90deg > 35deg) is a crease; outer edges have only one
      // adjacent face so are skipped.
      expect(creases.length).toBe(1);
      expect(creases[0].meta.crease).toBe(true);
      expect(creases[0].meta.weightScale).toBe(3);
    });

    it('extractCreases skips edges below the angle threshold', () => {
      const edges = G.collectEdges(faces);
      const faceNormals = [G.v(0, 0, 1), G.v(0, 0, 1)]; // coplanar → 0deg
      const creases = G.extractCreases(edges, faceNormals, 35, projected);
      expect(creases.length).toBe(0);
    });
  });
});
