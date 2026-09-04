/**
 * 3D Scene Studio — Phase 1 artistic build-out (stream P4).
 *
 * RGR coverage for the three Phase-1 asks, all driven through the real
 * generate() path (not a mapper called in isolation) so a default change is
 * verified where it actually lands:
 *
 *  1.2 DENSITY BUG — with tone ON, the fillDensity slider was discarded (the
 *      tone path spaced hatch by coverage only). A LOW density must now yield
 *      measurably SPARSER hatch than a HIGH density. Fails red on pre-fix code
 *      (equal ink) and passes after.
 *  1.3 CROSSHATCH — crossAngleDelta rotates the second family (old code hardcoded
 *      +90 and ignored it); crossDensityRatio makes family-B sparser (old code
 *      reused family-A spacing).
 *  1.1 STROKE TREATMENT — lineType='dashed' stamps meta.strokeDash on emitted
 *      lines; wobble>0 perturbs fill vertices deterministically (same seed →
 *      identical, different wobble → different); wobble=0 leaves output identical
 *      to the untreated fill (the tone-off / no-treatment regression guard).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };
const clone = (o) => JSON.parse(JSON.stringify(o));

const box = (extra = {}) => ({
  id: 'obj-1',
  name: 'Box 1',
  primitive: 'box',
  params: { sx: 44, sy: 44, sz: 44 },
  transform: { x: 0, y: 0, z: 0, yaw: 24, pitch: 12, roll: 0, scale: 1 },
  visibility: 'solid',
  ...extra,
});

const runLen = (pts) => {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
};
const fillsOf = (paths) => paths.filter((p) => p.meta && p.meta.kind === 'sceneFill');
const totalFillInk = (paths) => fillsOf(paths).reduce((s, p) => s + runLen(p), 0);
const strip = (paths) => paths.map((p) => ({ pts: p.map((q) => ({ x: q.x, y: q.y })), meta: p.meta || null }));

describe('scene3d Phase 1 — density fix, crosshatch families, stroke treatment', () => {
  let runtime;
  let V;
  let algo;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // Scene with light-driven tone ON (the density bug only manifests with tone on).
  const sceneWith = (mapper, params, { tone = true } = {}) => {
    const p = clone(defaults);
    p.seed = 1;
    p.objects = [box()];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    if (!tone) p.tone = { ...clone(p.tone), enabled: false };
    p.styleTable = { scene: { penId: null, mapper, params }, byObject: {}, byFace: {} };
    return p;
  };
  const gen = (p) => algo.generate(p, null, null, BOUNDS) || [];

  // ── 1.2 Density bug (the headline) ──────────────────────────────────────────
  describe('1.2 density is authoritative with tone ON', () => {
    test('low fillDensity → sparser hatch than high fillDensity (was: no effect)', () => {
      const low = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 6 }));
      const high = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 96 }));
      const lowInk = totalFillInk(low);
      const highInk = totalFillInk(high);
      expect(lowInk).toBeGreaterThan(0);
      expect(highInk).toBeGreaterThan(0);
      // Denser slider ⇒ meaningfully more plotted ink. Pre-fix these were equal.
      expect(highInk).toBeGreaterThan(lowInk * 1.5);
      expect(fillsOf(high).length).toBeGreaterThan(fillsOf(low).length);
    });
  });

  // ── 1.3 Independent crosshatch families ─────────────────────────────────────
  describe('1.3 crosshatch families', () => {
    test('crossAngleDelta rotates family-B (was: hardcoded +90)', () => {
      const p90 = gen(sceneWith('crosshatch', { fillAngle: 0, fillDensity: 50, crossAngleDelta: 90 }, { tone: false }));
      const p140 = gen(sceneWith('crosshatch', { fillAngle: 0, fillDensity: 50, crossAngleDelta: 140 }, { tone: false }));
      expect(fillsOf(p90).length).toBeGreaterThan(0);
      // Changing the delta must change the emitted geometry.
      expect(strip(p140)).not.toEqual(strip(p90));
    });

    test('crossDensityRatio makes family-B sparser (fewer lines at a higher ratio)', () => {
      const dense = gen(sceneWith('crosshatch', { fillAngle: 0, fillDensity: 55, crossDensityRatio: 0.5 }, { tone: false }));
      const sparse = gen(sceneWith('crosshatch', { fillAngle: 0, fillDensity: 55, crossDensityRatio: 2 }, { tone: false }));
      expect(fillsOf(dense).length).toBeGreaterThan(fillsOf(sparse).length);
    });
  });

  // ── 1.1 Shared stroke treatment ─────────────────────────────────────────────
  describe('1.1 stroke treatment', () => {
    test("lineType='dashed' stamps meta.strokeDash on emitted lines", () => {
      const solid = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, lineType: 'solid' }, { tone: false }));
      const dashed = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, lineType: 'dashed', dashScale: 1 }, { tone: false }));
      expect(solid.some((p) => p.meta && Array.isArray(p.meta.strokeDash))).toBe(false);
      const dashedFills = fillsOf(dashed).filter((p) => p.meta && Array.isArray(p.meta.strokeDash) && p.meta.strokeDash.length);
      expect(dashedFills.length).toBeGreaterThan(0);
      // [3,2] * dashScale=1
      expect(dashedFills[0].meta.strokeDash).toEqual([3, 2]);
    });

    test('dashScale scales the dash pattern', () => {
      const dashed = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, lineType: 'dashed', dashScale: 2 }, { tone: false }));
      const f = fillsOf(dashed).find((p) => p.meta && Array.isArray(p.meta.strokeDash));
      expect(f).toBeTruthy();
      expect(f.meta.strokeDash).toEqual([6, 4]);
    });

    test('wobble>0 perturbs fill vertices deterministically; wobble=0 leaves them untouched', () => {
      const plain = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, wobble: 0 }, { tone: false }));
      const wob1 = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, wobble: 45 }, { tone: false }));
      const wob2 = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, wobble: 45 }, { tone: false }));
      // Determinism: same seed + wobble → byte-identical.
      expect(strip(wob2)).toEqual(strip(wob1));
      // Wobble changes fill geometry (resample + normal displacement).
      expect(strip(wob1)).not.toEqual(strip(plain));
      // Different wobble amount → different geometry.
      const wob3 = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, wobble: 90 }, { tone: false }));
      expect(strip(wob3)).not.toEqual(strip(wob1));
    });

    test('wobble=0 is byte-identical to omitting the key (no-treatment regression guard)', () => {
      const explicit = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60, wobble: 0, lineType: 'solid' }, { tone: false }));
      const omitted = gen(sceneWith('hatch', { fillAngle: 20, fillDensity: 60 }, { tone: false }));
      expect(strip(explicit)).toEqual(strip(omitted));
    });

    test('draft frame still stamps the (free) dash', () => {
      const draftBounds = { ...BOUNDS, fastPreview: true };
      const p = sceneWith('hatch', { fillAngle: 20, fillDensity: 60, wobble: 60, lineType: 'dashed' }, { tone: false });
      const draft = algo.generate(p, null, null, draftBounds) || [];
      expect(draft.some((q) => q.meta && Array.isArray(q.meta.strokeDash))).toBe(true);
    });
  });
});
