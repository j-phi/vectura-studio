/*
 * Bugs-8 + Bugs-9 regression coverage for `.vectura` import safety.
 *
 * Bugs-9: import must be transactional. A throw mid-apply leaves the
 *         user on the previous good state, not a half-loaded project.
 * Bugs-8: numeric params from the file must be sanitized to finite
 *         numbers so algorithm generate() can't produce NaN paths.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('.vectura import safety (Bugs-8 + Bugs-9)', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    if (typeof window.getThemeToken !== 'function') {
      window.getThemeToken = (_token, fallback) => fallback ?? '';
    }
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // --- Helpers ---

  const buildPayload = (state, extras = {}) => ({
    state,
    images: {},
    ...extras,
  });

  const captureKnownGood = () => {
    // Boot a clean wavetable layer and grab a snapshot the test can diff against.
    const id = app.engine.addLayer('wavetable');
    app.engine.generate(id);
    app.renderer.setSelection([id], id);
    const baseline = app.captureState();
    return { id, baseline };
  };

  const layerSummary = () =>
    app.engine.layers.map((l) => ({ id: l.id, type: l.type, name: l.name }));

  // --- Bugs-9: transactional import ---

  test('failed import rolls back engine + SETTINGS to pre-import state', () => {
    const { baseline } = captureKnownGood();
    const beforeLayers = layerSummary();
    const beforeMargin = window.Vectura.SETTINGS.margin;

    // Build a payload whose engine state will throw inside importState.
    // engine.importState dereferences state.layers via .map; passing
    // a non-array for `layers` triggers a TypeError at the .map call.
    const corruptPayload = buildPayload({
      engine: { activeLayerId: 'bogus', layers: 'not-an-array' },
      settings: { margin: 999, paperSize: baseline.settings.paperSize },
    });

    // Stage a FileReader stub that synchronously resolves with our JSON.
    const realFileReader = window.FileReader;
    const fakeText = JSON.stringify(corruptPayload);
    window.FileReader = class {
      readAsText() {
        this.result = fakeText;
        // Fire onload synchronously — matches how jsdom resolves it in tests.
        if (typeof this.onload === 'function') this.onload();
      }
    };

    try {
      app.ui.openVecturaFile(new window.Blob([fakeText], { type: 'application/json' }));
    } finally {
      window.FileReader = realFileReader;
    }

    // After the failed import:
    //  - layer stack unchanged
    //  - SETTINGS.margin unchanged (no half-applied settings)
    expect(layerSummary()).toEqual(beforeLayers);
    expect(window.Vectura.SETTINGS.margin).toBe(beforeMargin);
  });

  test('failed import does NOT clear the undo history', () => {
    // pushHistory + a known-good snapshot so we can detect erasure.
    app.history = [];
    app.pushHistory();
    const historyDepthBefore = app.history.length;

    const realFileReader = window.FileReader;
    const corrupt = JSON.stringify({
      state: { engine: { layers: 'not-an-array' }, settings: {} },
      images: {},
    });
    window.FileReader = class {
      readAsText() {
        this.result = corrupt;
        if (typeof this.onload === 'function') this.onload();
      }
    };

    try {
      app.ui.openVecturaFile(new window.Blob([corrupt]));
    } finally {
      window.FileReader = realFileReader;
    }

    // History must survive a failed import — the user can still undo any
    // legitimate prior work. The buggy code path clears history *before*
    // confirming success.
    expect(app.history.length).toBeGreaterThanOrEqual(historyDepthBefore);
  });

  // --- Bugs-8: numeric param sanitization ---

  test('importing a layer with NaN/Infinity/string numerics clamps them to safe values', () => {
    // Use a flowfield layer because its defaults declare `density` — the
    // algorithm-specific param the audit calls out as a NaN propagation
    // hazard. Wavetable would not exercise density sanitization.
    const flowId = app.engine.addLayer('flowfield');
    app.engine.generate(flowId);
    const clean = app.captureState();

    const target = clean.engine.layers.find((l) => l.type === 'flowfield');
    expect(target).toBeTruthy();
    target.params.scaleX = NaN;
    target.params.scaleY = Infinity;
    target.params.density = 'not-a-number';
    target.params.posX = -Infinity;
    target.params.rotation = NaN;
    // Nested noise-stack numeric — confirm recursive sanitization.
    if (Array.isArray(target.params.noises) && target.params.noises[0]) {
      target.params.noises[0].amplitude = Infinity;
      target.params.noises[0].zoom = 'bad';
    }

    // Apply directly — this is exactly the path open-from-file exercises.
    app.engine.importState(clean.engine);

    const restored = app.engine.layers.find((l) => l.type === 'flowfield');
    expect(restored).toBeTruthy();
    // Every poisoned numeric must end up finite.
    expect(Number.isFinite(restored.params.scaleX)).toBe(true);
    expect(Number.isFinite(restored.params.scaleY)).toBe(true);
    expect(Number.isFinite(restored.params.posX)).toBe(true);
    expect(Number.isFinite(restored.params.rotation)).toBe(true);
    expect(typeof restored.params.density).toBe('number');
    expect(Number.isFinite(restored.params.density)).toBe(true);
    if (Array.isArray(restored.params.noises) && restored.params.noises[0]) {
      expect(Number.isFinite(restored.params.noises[0].amplitude)).toBe(true);
      expect(Number.isFinite(restored.params.noises[0].zoom)).toBe(true);
    }
  });

  test('post-import generate() produces finite path coordinates', () => {
    captureKnownGood();
    const clean = app.captureState();
    const target = clean.engine.layers.find((l) => l.type === 'wavetable');
    target.params.scaleX = NaN;
    target.params.scaleY = Infinity;
    target.params.amplitude = 'oops';

    app.engine.importState(clean.engine);
    const restored = app.engine.layers.find((l) => l.type === 'wavetable');
    app.engine.generate(restored.id);

    // Every point in every generated path must be finite — NaN in transform()
    // would propagate to every downstream point.
    const allPoints = (restored.paths || []).flatMap((path) =>
      Array.isArray(path) ? path : []
    );
    expect(allPoints.length).toBeGreaterThan(0);
    for (const pt of allPoints) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
  });
});
