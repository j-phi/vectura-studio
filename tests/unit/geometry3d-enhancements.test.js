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
