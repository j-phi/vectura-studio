const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Engine-level wiring for fill-aware morph: _computeMorphGroups must split each
 * child's outline from its paint-bucket fill, carry the fill records into the
 * morph, and regenerate interpolated fill per intermediate ring using the REAL
 * PaintBucketOps generator (not a stub). fillMode:'off' must emit no morph fill.
 */
describe('Morph modifier — fill pipeline (real generator)', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const square = (off) => [
    { x: 20 + off, y: 20 },
    { x: 60 + off, y: 20 },
    { x: 60 + off, y: 60 },
    { x: 20 + off, y: 60 },
    { x: 20 + off, y: 20 },
  ];

  const buildFilledMorph = () => {
    const { VectorEngine, Layer, PaintBucketOps } = runtime.window.Vectura;
    expect(typeof PaintBucketOps.generatePathsForFillRecord).toBe('function'); // export guard
    const engine = new VectorEngine();
    const modifierId = engine.addModifierLayer('morph');
    [0, 30].forEach((off, i) => {
      const child = new Layer(`mf-child-${i}`, 'shape', `Child ${i}`);
      child.parentId = modifierId;
      child.sourcePaths = [square(off)];
      engine.layers.push(child);
      engine.generate(child.id);
      // Attach a hatch paint-bucket fill covering the child's square.
      const rec = PaintBucketOps.buildFillRecord(
        { polygon: square(off), loopId: `loop-${i}`, isDocBounds: false },
        { fillMode: 'hatch', fillDensity: 1, fillAngle: i === 0 ? 0 : 90 }
      );
      child.fills = [rec];
    });
    engine.computeAllDisplayGeometry();
    return { engine, modifierId };
  };

  const countMorphFill = (paths) => (paths || []).filter((p) => p && p.meta && p.meta.morphFill).length;

  test('regenerates interpolated fill on intermediate rings', () => {
    const { engine, modifierId } = buildFilledMorph();
    const group = engine.layers.find((l) => l.id === modifierId);
    expect(Array.isArray(group.morphedPaths)).toBe(true);
    // Default steps=6, one pair → at least the per-ring regenerated fills appear.
    expect(countMorphFill(group.morphedPaths)).toBeGreaterThan(0);
    // Morph fill paths must NOT carry an editable bucket id (they are morph-owned).
    group.morphedPaths
      .filter((p) => p.meta && p.meta.morphFill)
      .forEach((p) => expect(p.meta.paintBucketFillId).toBeUndefined());
  });

  test('fillMode:"off" emits no morph fill geometry', () => {
    const { engine, modifierId } = buildFilledMorph();
    const group = engine.layers.find((l) => l.id === modifierId);
    group.modifier.fillMode = 'off';
    engine.computeAllDisplayGeometry();
    expect(countMorphFill(group.morphedPaths)).toBe(0);
  });
});
