/**
 * FACETED TONE — the two defects a per-facet instrument finally made visible.
 *
 * O20 — CUBE FACE ORDERING. "Three readable values from three orientations."
 *   Threshold quantization is calibrated for a CONTINUUM of normals. A cube has
 *   three. Measured on the design fixture, the cube's best-lit face sat at band
 *   2 of 4 and its second face at band 1, so the two lit faces came out D 0.053
 *   against 0.065 — a 0.012 separation, which is not a readable value, it is
 *   carrier crowding. At bands 3 the two faces landed in the SAME band and the
 *   order INVERTED (the brighter face drew darker). The fix is a quantizer fix:
 *   rank-quantize an object's own facet orientations across the ladder when the
 *   thresholds leave the top of that ladder unused.
 *
 * O21 — LOW-POLY TERMINATOR. "A discrete ring of facets at the terminator is
 *   darker than the facets below it, D(T) >= 1.25 x D(F)." Measured 0.91x —
 *   INVERTED. Root cause: the faceted terminator was decided topologically
 *   against a hard-coded `I >= 0.5` light test, but `Regions.formZone` refuses
 *   T to anything above band 0 (`if (b > 0) return 'M'`). Every facet the
 *   topological rule could flag sat at I just under 0.5, i.e. in band 1, i.e.
 *   zone M — so the T zone was UNREACHABLE on a faceted object and its crossed
 *   family never drew. T and F measured identical because they WERE identical.
 *
 * HOW THESE ARE MEASURED, AND WHY NOT OTHERWISE
 * ---------------------------------------------
 * - Per-face ink is LENGTH / PROJECTED AREA, not total length: the cube's three
 *   visible faces have very different projected areas, so a raw total says
 *   nothing about which face is darker. Length/area is 1/pitch in screen space,
 *   which is what the eye reads and what the rasterised D tracks.
 * - Only `kind: 'sceneFill'` counts. Silhouette and boundary EDGES are drawn per
 *   face too, and on a lightly-hatched face the outline outweighs the fill —
 *   the first cut of this instrument reported the lit faces almost entirely as
 *   edge ink.
 * - The terminator is verified STRUCTURALLY as well as tonally: a T facet's
 *   second family rules at the SAME pitch as its first (formInk.cross 1.00) and
 *   an F facet's at 0.40 of it, so clustering a face's fill by DIRECTION
 *   separates "has a core shadow" from "has a form shadow" without reference to
 *   any total. That is what keeps O22 (a cube has an edge, not a terminator)
 *   checkable in the same breath.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (v) => JSON.parse(JSON.stringify(v));

const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: 0.3, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
const SEED = 0;
// Camera and light are the DESIGN FIXTURE's (docs/design-shadow-anatomy.md, and
// the per-facet instrument that scored O20/O21), so a number here and a number
// off the rasterised drawing are talking about the same picture.
const CAMERA = { projection: 'orthographic', yaw: -30, pitch: 32, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: true };
const TONE = {
  2: { enabled: true, bands: 2, thresholds: [0.5], ladder: [0.25, 0.8], specular: { enabled: true, size: 1 } },
  3: { enabled: true, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85], specular: { enabled: true, size: 1 } },
  4: { enabled: true, bands: 4, thresholds: [0.25, 0.5, 0.75], ladder: [0.15, 0.4, 0.65, 0.9], specular: { enabled: true, size: 1 } },
};

const CUBE = {
  id: 'cube', name: 'Cube', primitive: 'box', params: { sx: 62, sy: 62, sz: 62 },
  transform: { x: 0, y: 31, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};
// A geodesic polyhedron goes through the FACETED fill path; primitive:'sphere'
// is chart-wrapped and would exercise SurfaceFill instead.
const LOWPOLY = {
  id: 'lowpoly', name: 'LowPoly', primitive: 'solid', params: { solidType: 'geodesic', radius: 40, frequency: 2 },
  transform: { x: 0, y: 42, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
};

const inkOf = (path) => {
  let L = 0;
  for (let i = 1; i < path.length; i += 1) L += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return L;
};
const polyArea = (poly) => {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(s) / 2;
};

describe('faceted tone — cube face ordering (O20) and the low-poly terminator (O21/O22)', () => {
  let runtime; let V; let algo; let Params; let Regions;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    Params = V.Scene3D.Params;
    Regions = V.Scene3D.Regions;
  });

  afterAll(() => runtime.cleanup());

  const compose = (objects, tone) => {
    const p = clone(V.ALGO_DEFAULTS.scene3d);
    p.seed = SEED;
    p.camera = clone(CAMERA);
    p.ground = { enabled: false };   // nothing but the object's own facets carry ink
    p.backdrop = { enabled: false };
    p.objects = clone(objects);
    p.lights = [clone(SUN)];
    p.tone = clone(tone);
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85 } };
    const byObject = {};
    p.objects.forEach((o) => { byObject[o.id] = clone(base); });
    p.styleTable = { scene: clone(base), byObject, byFace: {} };
    const np = Params.normalizeParams(p);
    return algo.generate(
      Params.collectSceneParams(np, []),
      new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS,
    ) || [];
  };

  // Per visible face: fill ink, projected area, world normal, and the fill's
  // own DIRECTION SPECTRUM (ink length bucketed by segment angle mod 180).
  const facesOf = (paths, objectId) => {
    const bag = new Map();
    paths.forEach((path) => {
      const meta = path.meta || {};
      const t = meta.sceneTarget;
      if (meta.kind !== 'sceneFill' || !t || t.objectId !== objectId || t.faceId == null) return;
      let row = bag.get(t.faceId);
      if (!row) {
        row = { id: t.faceId, normal: t.normal, area: polyArea(t.pickPolygon || []), ink: 0, dirs: new Map(), mids: [] };
        bag.set(t.faceId, row);
      }
      for (let i = 1; i < path.length; i += 1) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        const len = Math.hypot(dx, dy);
        if (!(len > 1e-6)) continue;
        row.ink += len;
        const key = Math.round((((Math.atan2(dy, dx) * 180) / Math.PI) + 360) % 180 / 5);
        row.dirs.set(key, (row.dirs.get(key) || 0) + len);
        row.mids.push({ x: (path[i].x + path[i - 1].x) / 2, y: (path[i].y + path[i - 1].y) / 2, k: key });
      }
    });
    return [...bag.values()]
      .filter((r) => r.area > 1 && r.ink > 0)
      .map((r) => {
        // Primary direction = the heaviest 5-degree bucket; "cross" = every
        // bucket more than 2 buckets away from it. A face ruled by ONE family
        // scores ~0; a form shadow (cross 0.40) ~0.4; a core shadow (cross 1.00) ~1.
        const buckets = [...r.dirs.entries()].sort((a, b) => b[1] - a[1]);
        const primaryKey = buckets.length ? buckets[0][0] : 0;
        let same = 0; let cross = 0;
        buckets.forEach(([k, len]) => {
          const d = Math.min(Math.abs(k - primaryKey), 36 - Math.abs(k - primaryKey));
          if (d <= 2) same += len; else cross += len;
        });
        // On-screen PERPENDICULAR PITCH of the primary family. Unlike ink/area
        // this is free of the projection's SHEAR (an affine map of a plane keeps
        // areas and lengths in a fixed ratio only when the ruling direction and
        // the direction across it stay orthogonal, which an orbit breaks), so it
        // is the only per-face quantity that can be compared BETWEEN cameras.
        const axis = ((primaryKey * 5) + 90) * Math.PI / 180;
        const offs = [];
        r.mids.forEach(({ x, y, k }) => {
          const d = Math.min(Math.abs(k - primaryKey), 36 - Math.abs(k - primaryKey));
          if (d <= 2) offs.push(x * Math.cos(axis) + y * Math.sin(axis));
        });
        offs.sort((a, b) => a - b);
        const gaps = [];
        for (let i = 1; i < offs.length; i += 1) {
          const g = offs[i] - offs[i - 1];
          if (g > 0.05) gaps.push(g);   // same ruling, split into runs ⇒ not a gap
        }
        gaps.sort((a, b) => a - b);
        return {
          ...r,
          density: r.ink / r.area,
          crossRatio: same > 0 ? cross / same : 0,
          same,
          cross,
          pitch: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null,
        };
      });
  };

  const nlOf = (normal, lights) => Regions.signedLambert(normal, { x: 0, y: 0, z: 0 }, lights);

  // ── O20: the quantizer itself ──────────────────────────────────────────────
  describe('rank quantization of an object\'s facet orientations (O20)', () => {
    it('exists as a pure, band-count-driven function on Regions', () => {
      expect(typeof Regions.rankBands).toBe('function');
    });

    it('spreads a cube\'s three orientations to the TOP of a 4-band ladder', () => {
      // The cube fixture's own intensities: two lit faces and four at zero.
      const I = [0.624, 0.469, 0, 0, 0, 0];
      const out = Regions.rankBands(I, TONE[4]);
      expect(out.length).toBe(6);
      // Three orientations, three DISTINCT bands, and the brightest reaches the
      // top of the ladder — which threshold quantization never did (it stopped
      // at band 2 of 4, compressing the object into the dark two thirds).
      expect(new Set(out).size).toBe(3);
      expect(out[0]).toBe(TONE[4].ladder.length - 1);
      expect(out[0]).toBeGreaterThan(out[1]);
      expect(out[1]).toBeGreaterThan(out[2]);
    });

    it('is monotone in intensity and never DARKENS a facet', () => {
      const I = [0.624, 0.469, 0, 0, 0, 0];
      [2, 3, 4].forEach((b) => {
        const out = Regions.rankBands(I, TONE[b]);
        out.forEach((band, i) => {
          expect(band).toBeGreaterThanOrEqual(Regions.band(I[i], TONE[b]));
          expect(band).toBeLessThanOrEqual(TONE[b].ladder.length - 1);
        });
        // monotone: sorting by intensity must sort by band
        const order = I.map((v, i) => i).sort((x, y) => I[x] - I[y]);
        for (let k = 1; k < order.length; k += 1) {
          expect(out[order[k]]).toBeGreaterThanOrEqual(out[order[k - 1]]);
        }
      });
    });

    it('leaves an object that ALREADY spans the ladder exactly as the thresholds put it', () => {
      // A low-poly sphere's facets reach both ends of the ladder on their own.
      // Re-quantizing those would be a blanket re-grade, which is not what this
      // is for, and would move every faceted golden in the suite.
      const I = [0.99, 0.78, 0.66, 0.52, 0.41, 0.27, 0.15, 0.03, 0];
      const out = Regions.rankBands(I, TONE[4]);
      out.forEach((band, i) => expect(band).toBe(Regions.band(I[i], TONE[4])));
    });

    it('does nothing when the object has effectively ONE orientation', () => {
      const I = [0.62, 0.60, 0.61];
      const out = Regions.rankBands(I, TONE[4]);
      out.forEach((band, i) => expect(band).toBe(Regions.band(I[i], TONE[4])));
    });
  });

  // ── O20: the drawing ───────────────────────────────────────────────────────
  describe('a cube draws three readable values from three orientations (O20)', () => {
    [2, 3, 4].forEach((bands) => {
      it(`bands ${bands}: three visible faces, three distinct densities, strictly decreasing in N.L`, () => {
        const rows = facesOf(compose([CUBE], TONE[bands]), 'cube')
          .sort((a, b) => nlOf(b.normal, [SUN]) - nlOf(a.normal, [SUN]));
        expect(rows.length).toBe(3);
        // Strictly ORDERED: the better-lit face must draw lighter. At bands 3
        // this was inverted before the fix.
        expect(rows[0].density).toBeLessThan(rows[1].density);
        expect(rows[1].density).toBeLessThan(rows[2].density);
        // And READABLE, not merely ordered: the lit face is at least 1.2x
        // lighter than the next face along. 1.20x was the measured failure at
        // bands 4 (D 0.053 vs 0.065) and 0.85x at bands 3 (inverted).
        expect(rows[1].density).toBeGreaterThan(rows[0].density * 1.25);
        expect(rows[2].density).toBeGreaterThan(rows[1].density * 1.25);
      });
    });

    it('the emitted ink stays a FUNCTION OF BAND COUNT (the protected contract)', () => {
      // A naive per-facet tilt produced the ordering above but collapsed this,
      // and was correctly reverted. Rank quantization emits a band INDEX, so
      // the value still comes from that band count's own ladder.
      const totals = [2, 3, 4].map((b) => facesOf(compose([CUBE], TONE[b]), 'cube')
        .reduce((s, r) => s + r.ink, 0));
      totals.forEach((t) => expect(t).toBeGreaterThan(0));
      expect(new Set(totals.map((t) => Math.round(t))).size).toBe(3);
      expect(Math.abs(totals[0] - totals[1])).toBeGreaterThan(1);
      expect(Math.abs(totals[1] - totals[2])).toBeGreaterThan(1);
    });

    it('is VIEW-INDEPENDENT: orbiting the camera does not re-grade the facets (O28)', () => {
      // Rank quantization ranks EVERY facet of the object, front and back, so
      // the grade is a property of the object and the light, never of where the
      // camera happens to be. Ranking only the VISIBLE ones would re-band the
      // cube the moment an orbit brought a new face round, which is the defect
      // O28 names.
      //
      // A face's rung is read as tonedInk / flatLadderInk: the same object, the
      // same camera, the same zones and the same cross families, differing only
      // in what the ladder says each rung is worth. Every geometric term —
      // projected area, foreshortening, and the SHEAR that an orbit puts into
      // the ruling grid — is identical between the two renders and divides out,
      // which raw ink or ink/area cannot do.
      const shot = (yaw, ladder) => {
        const p = clone(V.ALGO_DEFAULTS.scene3d);
        p.seed = SEED;
        p.camera = { ...clone(CAMERA), yaw };
        p.ground = { enabled: false };
        p.backdrop = { enabled: false };
        p.objects = [clone(CUBE)];
        p.lights = [clone(SUN)];
        // Specular OFF: the glint is placed off the HALF-VECTOR and therefore
        // moves with the camera by design. Leaving it on would let a moving
        // highlight masquerade as the diffuse leak O28 is actually about.
        p.tone = { ...clone(TONE[4]), ladder, specular: { enabled: false, size: 1 } };
        const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 85 } };
        p.styleTable = { scene: clone(base), byObject: { cube: clone(base) }, byFace: {} };
        const np = Params.normalizeParams(p);
        const paths = algo.generate(Params.collectSceneParams(np, []),
          new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS) || [];
        const out = {};
        facesOf(paths, 'cube').forEach((r) => { out[r.id] = r.ink; });
        return out;
      };
      const FLAT = [0.5, 0.5, 0.5, 0.5];
      const rungs = (yaw) => {
        const toned = shot(yaw, TONE[4].ladder);
        const flat = shot(yaw, FLAT);
        const out = {};
        Object.keys(toned).forEach((k) => { if (flat[k] > 0) out[k] = toned[k] / flat[k]; });
        return out;
      };
      // A wide orbit, so the VISIBLE SET itself changes: a grade computed from
      // the visible facets alone could not survive this, which is the point.
      const a = rungs(-30);
      const b = rungs(40);
      const shared = Object.keys(a).filter((k) => k in b);
      expect(shared.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(a).sort().join()).not.toBe(Object.keys(b).sort().join());
      shared.forEach((k) => {
        expect(a[k]).toBeGreaterThan(0);
        expect(b[k] / a[k]).toBeGreaterThan(0.94);
        expect(b[k] / a[k]).toBeLessThan(1.06);
      });
    });
  });

  // ── O21 / O22 ──────────────────────────────────────────────────────────────
  describe('the low-poly terminator is a discrete darker ring (O21)', () => {
    const zonesOf = (rows) => rows.map((r) => ({
      ...r,
      zone: Regions.formZone(r.normal, { x: 0, y: 0, z: 0 }, { tone: TONE[4], lights: [clone(SUN)] }),
    }));

    it('T facets exist on a faceted sphere at all', () => {
      // Before the fix the faceted T zone was unreachable: the topological
      // terminator test used I >= 0.5 while formZone refuses T above band 0, so
      // no facet was ever both flagged AND eligible.
      const rows = zonesOf(facesOf(compose([LOWPOLY], TONE[4]), 'lowpoly'));
      expect(rows.filter((r) => r.zone === 'T').length).toBeGreaterThanOrEqual(3);
    });

    it('D(terminator facets) >= 1.25 x D(facets below it)', () => {
      const rows = zonesOf(facesOf(compose([LOWPOLY], TONE[4]), 'lowpoly'));
      const T = rows.filter((r) => r.zone === 'T');
      const below = rows.filter((r) => r.zone === 'F' || r.zone === 'R');
      expect(T.length).toBeGreaterThan(0);
      expect(below.length).toBeGreaterThan(0);
      const mean = (set) => set.reduce((s, r) => s + r.density, 0) / set.length;
      expect(mean(T)).toBeGreaterThan(mean(below) * 1.25);
    });

    it('a T facet carries a SECOND FAMILY at its own pitch, an F facet a lighter one', () => {
      // The tonal ratio above can in principle be bought with spacing; this
      // pins the mechanism the spec actually asks for (§5.0: past the pitch
      // floor, density spills into a DIRECTION). formInk: T cross 1.00, F 0.40.
      const rows = zonesOf(facesOf(compose([LOWPOLY], TONE[4]), 'lowpoly'));
      const T = rows.filter((r) => r.zone === 'T');
      const F = rows.filter((r) => r.zone === 'F');
      expect(T.length).toBeGreaterThan(0);
      expect(F.length).toBeGreaterThan(0);
      // Aggregated over the zone, not per facet: a geodesic facet is small
      // enough that a 2.5x-pitch second family lands one ruling on it or none,
      // and a single facet's ratio is that quantization, not the recipe.
      const ratio = (set) => set.reduce((s, r) => s + r.cross, 0) / set.reduce((s, r) => s + r.same, 0);
      expect(ratio(T)).toBeGreaterThan(0.75);
      expect(ratio(F)).toBeLessThan(0.75);
      expect(ratio(F)).toBeGreaterThan(0.15);
      expect(ratio(T)).toBeGreaterThan(ratio(F) * 1.5);
    });

    it('a CUBE still grows no core shadow — an edge is not a terminator (O22)', () => {
      // The dihedral gate. Every unlit face of a cube touches a lit one, so
      // without it all of them would classify as terminator and the cube would
      // lose its form shadow entirely.
      const rows = facesOf(compose([CUBE], TONE[4]), 'cube');
      expect(rows.length).toBe(3);
      rows.forEach((r) => expect(r.crossRatio).toBeLessThan(0.75));
    });
  });
});
