/*
 * Regression: the Petal Designer shading/modifier stacks must be usable.
 *
 * ui-petal-designer.js referenced createPetalisShading / createPetalModifier /
 * PETALIS_SHADING_TYPES / PETALIS_LINE_TYPES / PETALIS_PETAL_MODIFIER_TYPES as
 * BARE free variables that were never bound into the mixin's IIFE closure
 * (only ui.js binds them, into its own scope). Any code path that built a
 * shading or modifier — clicking "+ Add Shading"/"+ Add Modifier", or
 * hydrating a layer that already carries a non-empty stack — threw a
 * ReferenceError. All 20 shipped presets happen to ship empty stacks, so it
 * stayed latent. These tests fail (ReferenceError) before the factory binding
 * fix and pass after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Petal Designer shading/modifier stacks', () => {
  let runtime, window, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('ControlDefsData exposes the shading/modifier factories', () => {
    const cd = window.Vectura.UI.ControlDefsData;
    expect(typeof cd.createPetalisShading).toBe('function');
    expect(typeof cd.createPetalModifier).toBe('function');
    expect(Array.isArray(cd.PETALIS_SHADING_TYPES)).toBe(true);
    expect(Array.isArray(cd.PETALIS_LINE_TYPES)).toBe(true);
    expect(Array.isArray(cd.PETALIS_PETAL_MODIFIER_TYPES)).toBe(true);
  });

  test('normalizePetalDesignerShading builds a shade without throwing', () => {
    expect(() => app.ui.normalizePetalDesignerShading({}, 0)).not.toThrow();
    const shade = app.ui.normalizePetalDesignerShading({}, 0);
    expect(shade).toBeTruthy();
    expect(shade.enabled).toBe(true);
    expect(typeof shade.type).toBe('string');
    expect(typeof shade.lineType).toBe('string');
    expect(shade.id).toBe('designer-shade-1');
  });

  test('normalizePetalDesignerModifier builds a modifier without throwing', () => {
    expect(() => app.ui.normalizePetalDesignerModifier({}, 0)).not.toThrow();
    const mod = app.ui.normalizePetalDesignerModifier({ type: 'ripple' }, 0);
    expect(mod).toBeTruthy();
    expect(mod.enabled).toBe(true);
    expect(mod.type).toBe('ripple');
    expect(mod.id).toBe('designer-mod-1');
  });

  test('getPetalDesignerModifierType resolves a known type', () => {
    expect(() => app.ui.getPetalDesignerModifierType('twist')).not.toThrow();
    const def = app.ui.getPetalDesignerModifierType('twist');
    expect(def).toBeTruthy();
    expect(def.value).toBe('twist');
  });

  test('hydrating a layer carrying a non-empty shading + modifier stack does not throw', () => {
    const Layer = window.Vectura.Layer;
    const layer = new Layer(`test-stacks-${Date.now()}`, 'petalisDesigner', 'StackRT');
    layer.params = {
      innerCount: 8,
      outerCount: 8,
      shadings: [{ id: 's1', enabled: true, type: 'radial' }],
      petalModifiers: [{ id: 'm1', enabled: true, type: 'ripple', amount: 4 }],
    };
    app.engine.layers.push(layer);
    expect(() => app.ui.openPetalDesigner({ layer })).not.toThrow();
    const state = app.ui.petalDesigner?.state;
    expect(state).toBeTruthy();
    expect(Array.isArray(state.shadings)).toBe(true);
    expect(state.shadings.length).toBe(1);
    expect(Array.isArray(state.petalModifiers)).toBe(true);
    expect(state.petalModifiers.length).toBe(1);
    app.ui.closePetalDesigner();
  });

  test('opening the designer does NOT mutate a clean named-profile layer (non-destructive mount)', () => {
    const Layer = window.Vectura.Layer;
    const defaults = window.Vectura.ALGO_DEFAULTS.petalisDesigner;
    const layer = new Layer(`test-mount-${Date.now()}`, 'petalisDesigner', 'MountRT');
    // A clean named-profile flower (the default / a preset): no drawn profiles.
    layer.params = JSON.parse(JSON.stringify(defaults));
    app.engine.layers.push(layer);
    app.engine.activeLayerId = layer.id;

    const before = {
      innerCount: layer.params.innerCount,
      outerCount: layer.params.outerCount,
      designerInner: layer.params.designerInner,
      designerOuter: layer.params.designerOuter,
      petalProfile: layer.params.petalProfile,
      petalSteps: layer.params.petalSteps,
      rotationJitter: layer.params.rotationJitter,
    };

    app.ui.openPetalDesigner({ layer });

    // Mounting the designer must not bump counts, synthesize drawn profiles,
    // re-inject jitter, or force petalSteps. (Pre-fix it became 5/6 with
    // designerInner/Outer set to 4-anchor drawn shapes → lumpy extra petals.)
    expect(layer.params.innerCount).toBe(before.innerCount);
    expect(layer.params.outerCount).toBe(before.outerCount);
    expect(layer.params.designerInner ?? null).toBe(null);
    expect(layer.params.designerOuter ?? null).toBe(null);
    expect(layer.params.petalProfile).toBe(before.petalProfile);
    expect(layer.params.rotationJitter ?? 0).toBe(0);
    app.ui.closePetalDesigner();
  });
});
