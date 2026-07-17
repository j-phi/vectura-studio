const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Morph Modifier × every algorithm.
 *
 * For each drawable algorithm type, a morph pair of two same-type children —
 * child B moved, rotated, and resized (the canvas-transform copy scenario) —
 * must engage the parameter-space morph and produce non-degenerate stepped
 * intermediates whose position/extent interpolate the transform. This is the
 * per-algorithm regression net for "rotated/resized copies must morph through
 * in-between transforms, not geometry-blend tangles".
 *
 * ALGO_TYPES is deliberately hardcoded; the completeness test at the bottom
 * fails when a new algorithm lands without being added here (or to SKIP).
 */
const ALGO_TYPES = [
  'wavetable', 'rings', 'topo', 'petalisDesigner', 'rainfall', 'flowfield',
  'lissajous', 'pattern', 'harmonograph', 'pendula', 'spiral', 'halftone',
  'imageWeave', 'text', 'grid', 'phylla', 'boids', 'attractor', 'hyphae',
  'shapePack', 'terrain', 'spirograph', 'spiralizer', 'polyhedron',
  'topoform', 'rasterPlane',
];

// type → reason. These are excluded from the per-type sweep AND accounted for
// in the completeness test.
const SKIP = {
  svgDistort: 'requires an imported SVG source; generates nothing headless',
};

describe('morph modifier — every algorithm, transform-copy pair', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const unionBBox = (paths) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    };
    paths.forEach((p) => {
      if (!Array.isArray(p)) return;
      if (p.meta && p.meta.kind === 'circle') {
        const cx = p.meta.cx ?? p.meta.x;
        const cy = p.meta.cy ?? p.meta.y;
        const rx = p.meta.rx ?? p.meta.r ?? 0;
        const ry = p.meta.ry ?? p.meta.r ?? 0;
        add(cx - rx, cy - ry); add(cx + rx, cy + ry);
      }
      p.forEach((pt) => add(pt.x, pt.y));
    });
    return {
      minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    };
  };

  const buildPair = (engine, type, mutateB, steps) => {
    const modifierId = engine.addModifierLayer('morph');
    const group = engine.layers.find((l) => l.id === modifierId);
    group.modifier.steps = steps;
    group.modifier.emitSources = false;
    group.modifier.fillMode = 'off';
    const children = [0, 1].map((i) => {
      const child = new Vectura.Layer(`maa-${type}-${i}`, type, `${type} ${i}`);
      child.parentId = modifierId;
      child.params.seed = 7; // a copy shares its source's seed
      engine.layers.push(child);
      return child;
    });
    mutateB(children[1]);
    children.forEach((c) => engine.generate(c.id));
    engine.computeAllDisplayGeometry();
    return { group, children };
  };

  ALGO_TYPES.forEach((type) => {
    test(`${type}: rotated+resized+moved copy morphs through stepped transforms`, () => {
      const engine = new Vectura.VectorEngine();
      engine.layers = [];
      let regenCalls = 0;
      const origRegen = engine.generateParamMorphPaths.bind(engine);
      engine.generateParamMorphPaths = (...args) => {
        regenCalls += 1;
        return origRegen(...args);
      };

      const STEPS = 3;
      const { group, children } = buildPair(engine, type, (b) => {
        b.params.posX = 90;
        b.params.rotation = 40;
        b.params.scaleX = 0.65;
        b.params.scaleY = 0.65;
      }, STEPS);

      const bA = unionBBox(children[0].effectivePaths);
      if (!Number.isFinite(bA.w) || bA.w <= 0) {
        // Algorithm produced nothing headlessly — the morph has no geometry to
        // blend; that is a passthrough case, not a morph defect.
        expect(group.morphedPaths.length).toBe(0);
        return;
      }
      const bB = unionBBox(children[1].effectivePaths);
      const morphed = group.morphedPaths;

      // Parameter-space branch engaged (regen ran once per step per refold).
      expect(regenCalls).toBeGreaterThanOrEqual(STEPS);
      expect(regenCalls % STEPS).toBe(0);
      expect(morphed.length).toBeGreaterThan(0);

      // Rings group by their step stamp (counts may vary per step).
      const byStep = new Map();
      morphed.forEach((p) => {
        const s = p.meta && p.meta.morphStep;
        expect(Number.isInteger(s)).toBe(true);
        if (!byStep.has(s)) byStep.set(s, []);
        byStep.get(s).push(p);
      });
      expect(byStep.size).toBe(STEPS);

      const centers = [];
      for (let s = 1; s <= STEPS; s += 1) {
        const b = unionBBox(byStep.get(s));
        // Non-degenerate: every step keeps a real footprint (the merge-centroid
        // mush collapsed to a fraction of the source size).
        expect(b.w).toBeGreaterThan(Math.min(bA.w, bB.w) * 0.3);
        // Inside the corridor spanned by the two sources (loose envelope).
        const loX = Math.min(bA.minX, bB.minX) - bA.w * 0.25;
        const hiX = Math.max(bA.maxX, bB.maxX) + bA.w * 0.25;
        expect(b.minX).toBeGreaterThan(loX);
        expect(b.maxX).toBeLessThan(hiX);
        centers.push(b.cx);
      }
      // posX interpolation: step centers progress monotonically from A to B.
      const dir = Math.sign(bB.cx - bA.cx) || 1;
      for (let s = 1; s < centers.length; s += 1) {
        expect((centers[s] - centers[s - 1]) * dir).toBeGreaterThan(-Math.abs(bA.w) * 0.05);
      }
    });
  });

  test('polyhedron: 3D spin params (rotate/tilt/roll) step through intermediate projections', () => {
    const engine = new Vectura.VectorEngine();
    engine.layers = [];
    const STEPS = 3;
    const { group, children } = buildPair(engine, 'polyhedron', (b) => {
      b.params.rotate = (b.params.rotate ?? 0) + 120;
      b.params.tilt = (b.params.tilt ?? 0) - 50;
    }, STEPS);
    const morphed = group.morphedPaths;
    expect(morphed.length).toBeGreaterThan(0);
    const byStep = new Map();
    morphed.forEach((p) => {
      const s = p.meta && p.meta.morphStep;
      if (!byStep.has(s)) byStep.set(s, []);
      byStep.get(s).push(p);
    });
    expect(byStep.size).toBe(STEPS);
    // Each intermediate is a distinct real projection (a geometry blend of a
    // spun wireframe collapses inward; a true re-projection keeps extent).
    const bA = unionBBox(children[0].effectivePaths);
    const stepBoxes = [];
    for (let s = 1; s <= STEPS; s += 1) {
      const b = unionBBox(byStep.get(s));
      expect(b.w).toBeGreaterThan(bA.w * 0.5);
      stepBoxes.push(b);
    }
    // Steps genuinely differ from each other (the solid is turning).
    const sig = (b) => `${b.w.toFixed(1)}x${b.h.toFixed(1)}@${b.cx.toFixed(1)},${b.cy.toFixed(1)}`;
    expect(new Set(stepBoxes.map(sig)).size).toBeGreaterThan(1);
  });

  test('phylla: circle-primitive output (0-point paths) survives param morph', () => {
    const engine = new Vectura.VectorEngine();
    engine.layers = [];
    const STEPS = 2;
    let regenCalls = 0;
    const origRegen = engine.generateParamMorphPaths.bind(engine);
    engine.generateParamMorphPaths = (...args) => { regenCalls += 1; return origRegen(...args); };
    const { group } = buildPair(engine, 'phylla', (b) => {
      b.params.posX = 60;
    }, STEPS);
    expect(regenCalls).toBeGreaterThanOrEqual(STEPS);
    expect(regenCalls % STEPS).toBe(0);
    expect(group.morphedPaths.length).toBeGreaterThan(0);
    // The intermediates keep phylla's circle primitives.
    const circles = group.morphedPaths.filter((p) => p.meta && p.meta.kind === 'circle');
    expect(circles.length).toBeGreaterThan(0);
  });

  test('completeness: every drawable registry algorithm is either tested or explicitly skipped', () => {
    const defaults = Vectura.ALGO_DEFAULTS || {};
    const drawable = Object.keys(defaults).filter((t) =>
      Vectura.Algorithms
      && Vectura.Algorithms[t]
      && typeof Vectura.Algorithms[t].generate === 'function'
      && defaults[t] && typeof defaults[t] === 'object'
      && ('preset' in defaults[t] || 'label' in defaults[t]));
    const covered = new Set([...ALGO_TYPES, ...Object.keys(SKIP), 'shape', 'group']);
    const missing = drawable.filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });
});
