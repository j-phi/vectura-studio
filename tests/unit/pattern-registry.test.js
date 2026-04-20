const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Pattern registry and tile validation', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  afterEach(() => {
    runtime.window.Vectura.PatternRegistry?.replaceLocalPatterns?.([]);
    runtime.window.Vectura.PatternRegistry?.replaceProjectPatterns?.([]);
  });

  test('saves a custom pattern into the merged runtime registry', () => {
    const registry = runtime.window.Vectura.PatternRegistry;
    expect(registry).toBeTruthy();

    const saved = registry.saveCustomPattern({
      id: 'demo-tile',
      name: 'Demo Tile',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="#000" d="M0 0h20v20H0z"/></svg>',
    });

    expect(saved.id).toBe('custom-demo-tile');
    expect(registry.getPatternById(saved.id)?.name).toBe('Demo Tile');
    expect(registry.exportAllCustomPatterns()).toHaveLength(1);
  });

  test('flags unmatched mirrored seam crossings for invalid stroke-authored tiles', () => {
    const validate = runtime.window.Vectura.AlgorithmRegistry.patternValidateMeta;
    expect(typeof validate).toBe('function');

    const invalid = validate({
      id: 'custom-invalid-stroke',
      name: 'Invalid Stroke',
      lines: true,
      fills: false,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="none" stroke="#000" d="M10 0L10 12"/></svg>',
    }, { cache: false });

    expect(invalid.valid).toBe(false);
    expect(invalid.issues.some((issue) => issue.code === 'seam-unmatched')).toBe(true);
  });

  test('accepts simple mirrored seam crossings for valid stroke-authored tiles', () => {
    const validate = runtime.window.Vectura.AlgorithmRegistry.patternValidateMeta;

    const valid = validate({
      id: 'custom-valid-stroke',
      name: 'Valid Stroke',
      lines: true,
      fills: false,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="none" stroke="#000" d="M10 0L10 20"/></svg>',
    }, { cache: false });

    expect(valid.valid).toBe(true);
    expect(valid.blockers).toBe(0);
  });
});
