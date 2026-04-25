const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Pattern Designer library — categories and user pattern management', () => {
  let runtime;
  let registry;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    registry = runtime.window.Vectura.PatternRegistry;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  afterEach(() => {
    registry.replaceLocalPatterns([]);
    registry.replaceProjectPatterns([]);
    registry.discardAllDraftPatterns?.();
  });

  const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line stroke="#000" x1="0" y1="5" x2="10" y2="5"/></svg>';

  test('getPatternCategories returns exactly the two expected categories', () => {
    expect(registry.getPatternCategories()).toEqual(['default', 'user']);
  });

  test('bundled patterns have no custom property and appear as default category', () => {
    const all = registry.getPatterns();
    const bundled = all.filter((p) => !p.custom);
    expect(bundled.length).toBeGreaterThan(0);
  });

  test('saved user patterns have custom: true and a valid customScope', () => {
    const saved = registry.saveCustomPattern({ id: 'scope-check', name: 'Scope Check', svg: SIMPLE_SVG });
    expect(saved.custom).toBe(true);
    expect(['local', 'project']).toContain(saved.customScope);
    expect(saved.isDraft).toBeFalsy();
  });

  test('user patterns appear in getCustomPatterns and in the user category', () => {
    registry.saveCustomPattern({ id: 'user-cat-test', name: 'User Cat Test', svg: SIMPLE_SVG });
    const custom = registry.getCustomPatterns();
    expect(custom.some((p) => p.id === 'custom-user-cat-test')).toBe(true);
    // must not appear in bundled
    const bundled = (runtime.window.Vectura.BUNDLED_PATTERNS || []);
    expect(bundled.some((p) => p.id === 'custom-user-cat-test')).toBe(false);
  });

  test('deleteCustomPattern removes pattern from user category', () => {
    registry.saveCustomPattern({ id: 'del-cat-test', name: 'Del Cat Test', svg: SIMPLE_SVG });
    expect(registry.getCustomPatterns().some((p) => p.id === 'custom-del-cat-test')).toBe(true);
    registry.deleteCustomPattern('custom-del-cat-test');
    expect(registry.getCustomPatterns().some((p) => p.id === 'custom-del-cat-test')).toBe(false);
  });

  test('exportPatternSvg returns the SVG content for a user pattern', () => {
    const saved = registry.saveCustomPattern({ id: 'exp-lib-test', name: 'Exp Lib Test', svg: SIMPLE_SVG });
    const result = registry.exportPatternSvg(saved.id);
    expect(typeof result).toBe('string');
    expect(result).toContain('<svg');
  });

  test('exportPatternSvg returns the SVG content for a bundled pattern', () => {
    const all = registry.getPatterns();
    const bundled = all.find((p) => !p.custom && p.svg);
    expect(bundled).toBeTruthy();
    const result = registry.exportPatternSvg(bundled.id);
    expect(typeof result).toBe('string');
    expect(result).toContain('<svg');
  });

  test('draft patterns are excluded from getCustomPatterns but findable by id', () => {
    const saved = registry.saveCustomPattern({ id: 'draft-lib-test', name: 'Draft Lib', svg: SIMPLE_SVG, isDraft: true });
    expect(registry.getCustomPatterns().some((p) => p.id === saved.id)).toBe(false);
    expect(registry.getPatternById(saved.id)).not.toBeNull();
  });

  test('discardAllDraftPatterns cleans up all drafts', () => {
    registry.saveCustomPattern({ id: 'da-1', name: 'DA 1', svg: SIMPLE_SVG, isDraft: true });
    registry.saveCustomPattern({ id: 'da-2', name: 'DA 2', svg: SIMPLE_SVG, isDraft: true });
    registry.discardAllDraftPatterns?.();
    const all = registry.getPatterns();
    expect(all.every((p) => !p.isDraft)).toBe(true);
  });
});
