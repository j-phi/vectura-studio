const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Pattern Designer draft edit state machine', () => {
  let runtime;
  let registry;
  let mixin;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    registry = runtime.window.Vectura.PatternRegistry;
    mixin = runtime.window.Vectura._UIPatternDesignerMixin;
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

  const makeCtx = () => ({
    _getPatternMetaForLayer(layer) {
      return registry.getPatternById(layer.params.patternId) || null;
    },
    storeLayerParams() {},
    app: { regen() {}, pushHistory() {} },
  });

  const makePd = (patternId) => ({
    layer: { params: { patternId } },
    draftEdit: null,
    history: [],
    validation: null,
    gapTolerance: 0,
    root: {
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  });

  test('_UIPatternDesignerMixin is exposed on window.Vectura', () => {
    expect(mixin).toBeTruthy();
    expect(typeof mixin._ensurePatternDesignerEditableMeta).toBe('function');
  });

  test('_ensurePatternDesignerEditableMeta on a built-in pattern returns isDraft: true', () => {
    const builtins = registry.getPatterns().filter((p) => !p.custom);
    expect(builtins.length).toBeGreaterThan(0);
    const builtin = builtins[0];
    const pd = makePd(builtin.id);
    const ctx = makeCtx();

    const meta = mixin._ensurePatternDesignerEditableMeta.call(ctx, pd);
    expect(meta).not.toBeNull();
    expect(meta.isDraft).toBe(true);
  });

  test('_ensurePatternDesignerEditableMeta on a built-in does NOT add to getCustomPatterns', () => {
    const builtins = registry.getPatterns().filter((p) => !p.custom);
    const builtin = builtins[0];
    const pd = makePd(builtin.id);
    const ctx = makeCtx();

    const before = registry.getCustomPatterns().length;
    mixin._ensurePatternDesignerEditableMeta.call(ctx, pd);
    const after = registry.getCustomPatterns().length;
    expect(after).toBe(before);
  });

  test('_ensurePatternDesignerEditableMeta sets pd.draftEdit with originalId and draftId', () => {
    const builtins = registry.getPatterns().filter((p) => !p.custom);
    const builtin = builtins[0];
    const pd = makePd(builtin.id);
    const ctx = makeCtx();

    mixin._ensurePatternDesignerEditableMeta.call(ctx, pd);
    expect(pd.draftEdit).not.toBeNull();
    expect(pd.draftEdit.originalId).toBe(builtin.id);
    expect(pd.draftEdit.draftId).toBeTruthy();
    expect(pd.draftEdit.isDirty).toBe(false);
  });

  test('_ensurePatternDesignerEditableMeta on an existing user pattern returns meta directly (no draft)', () => {
    const saved = registry.saveCustomPattern({ id: 'user-edit-direct', name: 'User Edit Direct', svg: SIMPLE_SVG });
    const pd = makePd(saved.id);
    const ctx = makeCtx();

    const meta = mixin._ensurePatternDesignerEditableMeta.call(ctx, pd);
    expect(meta).not.toBeNull();
    expect(meta.isDraft).toBeFalsy();
    expect(meta.id).toBe(saved.id);
    expect(pd.draftEdit).toBeNull();
  });

  test('discardDraftPattern cleans up a draft created by _ensurePatternDesignerEditableMeta', () => {
    const builtins = registry.getPatterns().filter((p) => !p.custom);
    const builtin = builtins[0];
    const pd = makePd(builtin.id);
    const ctx = makeCtx();

    mixin._ensurePatternDesignerEditableMeta.call(ctx, pd);
    const draftId = pd.draftEdit?.draftId;
    expect(registry.getPatternById(draftId)).not.toBeNull();

    registry.discardDraftPattern(draftId);
    expect(registry.getPatternById(draftId)).toBeNull();
  });

  test('calling _ensurePatternDesignerEditableMeta twice on the same pd reuses the existing draft', () => {
    const builtins = registry.getPatterns().filter((p) => !p.custom);
    const builtin = builtins[0];
    const pd = makePd(builtin.id);
    const ctx = makeCtx();

    mixin._ensurePatternDesignerEditableMeta.call(ctx, pd);
    const firstDraftId = pd.draftEdit?.draftId;

    // Simulate the layer pointing at the draft now
    pd.layer.params.patternId = firstDraftId;
    mixin._ensurePatternDesignerEditableMeta.call(ctx, pd);
    // Should return the same draft (not create a second one)
    expect(pd.draftEdit?.draftId).toBe(firstDraftId);
    expect(registry.getCustomPatterns().length).toBe(0);
  });
});
