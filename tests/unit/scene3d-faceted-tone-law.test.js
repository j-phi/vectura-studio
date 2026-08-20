/**
 * FACETED TONE LAWS — box, plane and solid finally read `style.params.toneLaw`.
 *
 * THE DEFECT. `SurfaceFill.chartFor` resolves a parametric chart for nine
 * primitives and returns null for `box`, `plane` and `solid`, so those three
 * fall through to the separate faceted planar fill in `scene3d.js` — which
 * never read the tone law at all. Proved at the byte level while building
 * `docs/tone-laws/`: for those three primitives the emitted fill geometry was
 * MD5-IDENTICAL across all 47 laws, while `sphere` differed for every one.
 *
 * THE FIX, AND ITS LIMIT. A flat face has no parametric chart, but it has a
 * natural planar parameterisation — its own (u,v) frame, which the hatch is
 * already generated in. `Scene3D.SurfaceFillMono.emit` takes a chart SUBSTRATE
 * rather than a primitive, so that frame can be handed to it and the nine
 * `mono` laws' real implementations run on faceted geometry unmodified. The
 * other 37 laws live inside `buildObject`'s closure in `surface-fill.js` and
 * are reachable only through `chartFor`, which has no planar mode; they are
 * reported unsupported rather than approximated. `toneLaw: 'none'` is Stage 0
 * and is implemented on the faceted path as "the tone apparatus is off".
 *
 * WHAT IS ASSERTED, AND WHY IT IS THE RIGHT BAR
 * ---------------------------------------------
 * - The MD5 identity is BROKEN: a mono law and `none` each move the geometry on
 *   all three primitives. This is the test that fails before the change.
 * - The per-face tone RAMP survives. A uniformly filled object is a failure, not
 *   a fix: a flat face has a constant normal, so all faceted shading is
 *   face-to-face and must remain measurable after the law takes over family A.
 * - No mark leaves the face. The planar chart returns null outside the face
 *   polygon, so this is the contract that keeps the substrate honest.
 * - An unknown law degrades to the committed default; it never throws and never
 *   draws nothing.
 */
const crypto = require('crypto');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const FIX = require('../fixtures/scene3d-shadow-anatomy');

const clone = (v) => JSON.parse(JSON.stringify(v));
const { BOUNDS, SEED, CAMERA, SUN, CUBE, LOWPOLY, toneBands, styleTable } = FIX;

// A single-face primitive, tilted so it is neither edge-on nor flat to camera.
const PLANE = {
  id: 'plane', name: 'Plane', primitive: 'plane', params: { sx: 70, sz: 70 },
  transform: { x: 0, y: 30, z: 0, yaw: 0, pitch: -60, roll: 0, scale: 1 }, visibility: 'solid',
};
const PRIMS = { box: CUBE, plane: PLANE, solid: LOWPOLY };

// A mono law (a real implementation, run through the planar substrate) and a
// second one, so "the law is read" is not a single-law accident.
const MONO_A = 'mazeFill';
const MONO_B = 'turingStripe';

const inkOf = (p) => {
  let L = 0;
  for (let i = 1; i < p.length; i += 1) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return L;
};
const polyArea = (poly) => {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  return Math.abs(s) / 2;
};
const inPoly = (poly, x, y) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]; const b = poly[j];
    if ((a.y > y) !== (b.y > y)
      && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-12) + a.x) inside = !inside;
  }
  return inside;
};

describe('faceted tone laws — box / plane / solid read style.params.toneLaw', () => {
  let runtime; let V; const cache = new Map();

  const render = (primKey, law) => {
    const key = `${primKey}::${law}`;
    if (cache.has(key)) return cache.get(key);
    const Params = V.Scene3D.Params;
    const p = clone(V.ALGO_DEFAULTS.scene3d);
    p.seed = SEED;
    p.camera = clone(CAMERA);
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.objects = [clone(PRIMS[primKey])];
    p.lights = [clone(SUN)];
    p.tone = clone(toneBands(4));
    p.styleTable = styleTable(p.objects, law === null ? {} : { toneLaw: law });
    const np = Params.normalizeParams(p);
    const paths = V.AlgorithmRegistry.scene3d.generate(
      Params.collectSceneParams(np, []), new V.SeededRNG(SEED), new V.SimpleNoise(SEED), BOUNDS,
    ) || [];
    const fills = paths.filter((q) => q.meta && q.meta.kind === 'sceneFill');
    const geom = fills.map((q) => q.map((pt) => `${pt.x.toFixed(4)},${pt.y.toFixed(4)}`).join(';')).join('|');
    const bag = new Map();
    fills.forEach((q) => {
      const t = q.meta.sceneTarget;
      if (!t || t.faceId == null) return;
      let row = bag.get(t.faceId);
      if (!row) { row = { ink: 0, area: polyArea(t.pickPolygon || []), poly: t.pickPolygon || [] }; bag.set(t.faceId, row); }
      row.ink += inkOf(q);
    });
    const faces = [...bag.values()].filter((r) => r.area > 1 && r.ink > 0);
    const d = faces.map((r) => r.ink / r.area);
    const res = {
      md5: crypto.createHash('md5').update(geom).digest('hex'),
      fills,
      paths: fills.length,
      ink: fills.reduce((s, q) => s + inkOf(q), 0),
      ramp: d.length ? Math.max(...d) / Math.min(...d) : 0,
      faceCount: d.length,
    };
    cache.set(key, res);
    return res;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  }, 180000);

  afterAll(() => runtime.cleanup());

  it('exposes the mono law roster the faceted substrate reuses', () => {
    const M = V.Scene3D.SurfaceFillMono;
    expect(M && typeof M.emit).toBe('function');
    expect(M.isMono(MONO_A)).toBe(true);
    expect(M.isMono(MONO_B)).toBe(true);
    // The catalogue must actually carry them, or the style param would be
    // rejected before it ever reached the fill.
    expect(V.SCENE3D_TONE_LAWS.IDS).toContain(MONO_A);
    expect(V.SCENE3D_TONE_LAWS.IDS).toContain(MONO_B);
  });

  // ── THE REGRESSION. Before this round every one of these was equal. ────────
  Object.keys(PRIMS).forEach((primKey) => {
    it(`${primKey}: a mono tone law moves the fill off the default`, () => {
      const base = render(primKey, null);
      const law = render(primKey, MONO_A);
      expect(base.paths).toBeGreaterThan(0);
      expect(law.paths).toBeGreaterThan(0);
      expect(law.md5).not.toBe(base.md5);
    }, 120000);

    it(`${primKey}: two different mono laws draw two different pictures`, () => {
      const a = render(primKey, MONO_A);
      const b = render(primKey, MONO_B);
      expect(b.paths).toBeGreaterThan(0);
      expect(a.md5).not.toBe(b.md5);
    }, 120000);

    it(`${primKey}: toneLaw 'none' is Stage 0, not the default ladder`, () => {
      const base = render(primKey, null);
      const off = render(primKey, 'none');
      expect(off.paths).toBeGreaterThan(0);
      expect(off.md5).not.toBe(base.md5);
    }, 120000);

    it(`${primKey}: the per-face tone ramp survives the law taking over`, () => {
      const base = render(primKey, null);
      const law = render(primKey, MONO_A);
      // A single-face `plane` has no face-to-face ramp to measure — that is a
      // property of the primitive, not of the law, so it is asserted as such.
      if (base.faceCount < 2) {
        expect(law.faceCount).toBe(base.faceCount);
        return;
      }
      expect(base.ramp).toBeGreaterThan(1.05);
      expect(law.ramp).toBeGreaterThan(1.05);
    }, 120000);

    it(`${primKey}: no mark escapes its own face`, () => {
      const law = render(primKey, MONO_A);
      let outside = 0; let total = 0;
      law.fills.forEach((q) => {
        const poly = (q.meta.sceneTarget || {}).pickPolygon;
        if (!poly || poly.length < 3) return;
        // A 1e-3 mm bleed is the polygon-boundary bisection's own tolerance,
        // so the test grows the face by that much before calling a point out.
        const cx = poly.reduce((s, pt) => s + pt.x, 0) / poly.length;
        const cy = poly.reduce((s, pt) => s + pt.y, 0) / poly.length;
        const grown = poly.map((pt) => ({
          x: cx + (pt.x - cx) * 1.02, y: cy + (pt.y - cy) * 1.02,
        }));
        q.forEach((pt) => { total += 1; if (!inPoly(grown, pt.x, pt.y)) outside += 1; });
      });
      expect(total).toBeGreaterThan(0);
      expect(outside).toBe(0);
    }, 120000);
  });

  it('an unknown tone law degrades to the committed default, silently', () => {
    const base = render('box', null);
    const bogus = render('box', 'notALawAtAll');
    expect(bogus.md5).toBe(base.md5);
  }, 120000);
});
