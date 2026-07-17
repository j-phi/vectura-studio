const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Engine-level parameter-space morph: two same-algorithm children whose
 * difference is transform (rotation/scale/position) and/or an algorithm param
 * must produce intermediates that step through the interpolated transform —
 * not geometry-blend tangles. Regression for the "rotated+resized polyhedron
 * copy morphs into mush" report.
 */
describe('morph group — parameter-space morph through the engine', () => {
  let runtime;
  let engine;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  beforeEach(() => {
    engine = new Vectura.VectorEngine();
    engine.layers = [];
  });

  const unionBBox = (paths) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    };
    paths.forEach((p) => {
      if (!Array.isArray(p)) return;
      // Circle primitives (phylla dots) carry extent in meta, not points.
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

  const setupMorphPair = (type, mutateB, steps = 4) => {
    const modifierId = engine.addModifierLayer('morph');
    const group = engine.layers.find((l) => l.id === modifierId);
    group.modifier.steps = steps;
    group.modifier.emitSources = false;
    group.modifier.fillMode = 'off';
    const children = [0, 1].map((i) => {
      const child = new Vectura.Layer(`pm-child-${i}`, type, `Child ${i}`);
      child.parentId = modifierId;
      child.params.seed = 42; // copies share a seed
      engine.layers.push(child);
      return child;
    });
    mutateB(children[1]);
    children.forEach((c) => engine.generate(c.id));
    engine.computeAllDisplayGeometry();
    return { group, children };
  };

  test('polyhedron copy rotated+resized+moved: steps interpolate the transform', () => {
    const { group, children } = setupMorphPair('polyhedron', (b) => {
      b.params.posX = 120;
      b.params.rotation = 60;
      b.params.scaleX = 0.5;
      b.params.scaleY = 0.5;
    });
    const morphed = group.morphedPaths;
    expect(Array.isArray(morphed)).toBe(true);
    expect(morphed.length).toBeGreaterThan(0);

    const bA = unionBBox(children[0].effectivePaths);
    const bB = unionBBox(children[1].effectivePaths);
    // Each source produced the same number of paths (same seed/params modulo
    // transform), and param morph regenerates ALL of them per step.
    const perStep = morphed.length / 4;
    expect(perStep).toBeGreaterThan(1);
    expect(Number.isInteger(perStep)).toBe(true);

    // Group rings by step (param morph emits step-by-step in order).
    for (let s = 0; s < 4; s += 1) {
      const stepPaths = morphed.slice(s * perStep, (s + 1) * perStep);
      const b = unionBBox(stepPaths);
      const t = (s + 1) / 5;
      // Center x tracks the interpolated posX.
      const expectedCx = bA.cx + (bB.cx - bA.cx) * t;
      expect(Math.abs(b.cx - expectedCx)).toBeLessThan(Math.max(20, bA.w * 0.2));
      // Extent shrinks monotonically toward the 0.5-scaled copy: strictly
      // between the sources, never collapsed.
      expect(b.w).toBeLessThan(bA.w * 1.15);
      expect(b.w).toBeGreaterThan(bB.w * 0.85);
      expect(b.w).toBeGreaterThan(5);
    }
    // Monotonic size progression (rotation+scale steps, not tangles).
    const widths = [];
    for (let s = 0; s < 4; s += 1) {
      widths.push(unionBBox(morphed.slice(s * perStep, (s + 1) * perStep)).w);
    }
    for (let s = 1; s < widths.length; s += 1) {
      expect(widths[s]).toBeLessThan(widths[s - 1] * 1.05);
    }
  });

  test('one-param change (phylla count): intermediates step the param, full-size structure', () => {
    const { group, children } = setupMorphPair('phylla', (b) => {
      const cur = Number(b.params.count ?? b.params.points ?? b.params.dots ?? 100);
      const key = ['count', 'points', 'dots'].find((k) => b.params[k] !== undefined) || 'count';
      b.params[key] = Math.max(10, Math.round(cur * 0.4));
    });
    const morphed = group.morphedPaths;
    expect(morphed.length).toBeGreaterThan(0);
    const bA = unionBBox(children[0].effectivePaths);
    const bAll = unionBBox(morphed);
    // Intermediates stay comparable to the source footprint — never the
    // collapsed merge-centroid squiggles.
    expect(bAll.w).toBeGreaterThan(bA.w * 0.4);
    expect(bAll.h).toBeGreaterThan(bA.h * 0.4);
  });

  test('regen parity: generateParamMorphPaths at a child\'s own params matches its baked paths', () => {
    const { children } = setupMorphPair('spiral', (b) => { b.params.posX = 50; });
    const child = children[1];
    const regen = engine.generateParamMorphPaths(child.type, child.params, { penId: child.penId });
    expect(regen.length).toBeGreaterThan(0);
    const bBaked = unionBBox(child.paths);
    const bRegen = unionBBox(regen);
    expect(bRegen.cx).toBeCloseTo(bBaked.cx, 0);
    expect(bRegen.cy).toBeCloseTo(bBaked.cy, 0);
    expect(bRegen.w).toBeCloseTo(bBaked.w, 0);
  });

  test('live-drag hot refold blends geometry for dragged children; full recompute restores param morph', () => {
    const { group, children } = setupMorphPair('polyhedron', (b) => {
      b.params.posX = 120;
      b.params.rotation = 60;
    }, 3);
    let regenCalls = 0;
    const origRegen = engine.generateParamMorphPaths.bind(engine);
    engine.generateParamMorphPaths = (...args) => { regenCalls += 1; return origRegen(...args); };

    // Hot-path refold during a live drag of child B: the renderer rewrites
    // B's paths directly (params are stale), so the param branch must yield.
    engine.refoldMorphGroupsForLayers([children[1].id]);
    expect(regenCalls).toBe(0);
    expect(group.morphedPaths.length).toBeGreaterThan(0);
    expect(group.morphedPaths.some((p) => p.meta && p.meta.morphStep)).toBe(false);

    // Release recompute: parameter-space morph returns.
    engine.computeAllDisplayGeometry();
    expect(regenCalls).toBeGreaterThan(0);
    expect(group.morphedPaths.some((p) => p.meta && p.meta.morphStep)).toBe(true);
  });

  test('shape children still geometry-blend (no morphSource)', () => {
    const modifierId = engine.addModifierLayer('morph');
    const group = engine.layers.find((l) => l.id === modifierId);
    group.modifier.steps = 3;
    group.modifier.emitSources = false;
    group.modifier.fillMode = 'off';
    const square = (off) => {
      const p = [
        { x: 20 + off, y: 20 }, { x: 60 + off, y: 20 },
        { x: 60 + off, y: 60 }, { x: 20 + off, y: 60 }, { x: 20 + off, y: 20 },
      ];
      return p;
    };
    [0, 100].forEach((off, i) => {
      const child = new Vectura.Layer(`shape-${i}`, 'shape', `S${i}`);
      child.parentId = modifierId;
      child.sourcePaths = [square(off)];
      engine.layers.push(child);
      engine.generate(child.id);
    });
    engine.computeAllDisplayGeometry();
    expect(group.morphedPaths.length).toBe(3);
  });
});
