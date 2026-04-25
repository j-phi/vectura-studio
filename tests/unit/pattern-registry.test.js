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

  test('getPatternCategories returns exactly [default, user]', () => {
    const registry = runtime.window.Vectura.PatternRegistry;
    expect(typeof registry.getPatternCategories).toBe('function');
    expect(registry.getPatternCategories()).toEqual(['default', 'user']);
  });

  test('exportPatternSvg returns SVG string for a saved custom pattern', () => {
    const registry = runtime.window.Vectura.PatternRegistry;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line stroke="#000" x1="0" y1="0" x2="10" y2="10"/></svg>';
    const saved = registry.saveCustomPattern({ id: 'svg-export-test', name: 'SVG Export Test', svg });
    const result = registry.exportPatternSvg(saved.id);
    expect(typeof result).toBe('string');
    expect(result).toContain('<svg');
  });

  test('exportPatternSvg returns null for an unknown id', () => {
    const registry = runtime.window.Vectura.PatternRegistry;
    expect(registry.exportPatternSvg('nonexistent-id-xyz')).toBeNull();
  });

  test('deleteCustomPattern returns true on first delete, false on repeated call', () => {
    const registry = runtime.window.Vectura.PatternRegistry;
    registry.saveCustomPattern({
      id: 'delete-twice-test',
      name: 'Delete Twice',
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
    });
    expect(registry.deleteCustomPattern('custom-delete-twice-test')).toBe(true);
    expect(registry.deleteCustomPattern('custom-delete-twice-test')).toBe(false);
  });

  test('draft patterns do not appear in getCustomPatterns', () => {
    const registry = runtime.window.Vectura.PatternRegistry;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
    registry.saveCustomPattern({ id: 'draft-test-item', name: 'Draft Item', svg, isDraft: true });
    const custom = registry.getCustomPatterns();
    expect(custom.every((p) => !p.isDraft)).toBe(true);
    expect(custom.some((p) => p.id === 'draft-draft-test-item')).toBe(false);
  });

  test('discardDraftPattern removes draft from getPatterns and returns true', () => {
    const registry = runtime.window.Vectura.PatternRegistry;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
    const saved = registry.saveCustomPattern({ id: 'discard-test', name: 'Discard Test', svg, isDraft: true });
    expect(registry.getPatternById(saved.id)).not.toBeNull();
    const result = registry.discardDraftPattern(saved.id);
    expect(result).toBe(true);
    expect(registry.getPatternById(saved.id)).toBeNull();
  });
});
