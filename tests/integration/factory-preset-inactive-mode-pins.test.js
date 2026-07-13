const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * A factory preset must not pin a value for a mode it is not in.
 *
 * `user-presets/<type>/default.vectura` files are app-saved FULL PARAM DUMPS — someone
 * posed a scene, hit Save, and every parameter they never thought about got frozen in
 * alongside the handful they meant. Layer (src/core/layer.js) applies the preset ON TOP
 * of ALGO_DEFAULTS, so the preset WINS: whatever junk it captured is what a new layer
 * gets, forever.
 *
 * The junk is invisible while the layer stays in the mode the dump was saved in — which
 * is exactly what makes it dangerous. It detonates the moment the user flips that mode.
 * terrain's factory preset shipped `perspectiveMode: 'free-3d'` with `vpLeftX: 0` /
 * `vpRightX: 100` frozen in beside it. Free-3D never reads them, so they were inert and
 * unseen; switch Perspective Mode to Two-point and both vanishing points land on the
 * canvas edges, which collapses the projection (see the second suite below).
 *
 * The signature is mechanical, so the guard can be too: a parameter whose OWN `showIf`
 * gate hides it under the preset's OWN effective params is, by construction, a parameter
 * the preset's author could not have been looking at when they saved. It has no business
 * being pinned. Let it fall through to the curated value in ALGO_DEFAULTS.
 *
 * This is not a snapshot of the status quo — it names no algorithm and no value. Any new
 * factory preset that freezes a hidden param fails it on arrival.
 */
describe('factory presets pin nothing for a mode they are not in', () => {
  let runtime, window, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  // Every control the algorithm exposes, keyed by param id. CONTROL_DEFS entries are a
  // flat list per algorithm (sections are entries too, and carry no id).
  const controlsById = (V, type) => {
    const defs = (V.UI.CONTROL_DEFS || {})[type] || [];
    const map = new Map();
    defs.forEach((c) => { if (c && c.id) map.set(c.id, c); });
    return map;
  };

  // The params a NEW layer of this type actually gets: ALGO_DEFAULTS cloned, then the
  // factory preset assigned on top. Buying the layer through the engine is the only way
  // to see that — a hand-written param object supplies the values it is testing.
  const effectiveParams = (type) => {
    app.engine.addLayer(type);
    const layer = app.engine.getActiveLayer();
    const params = { ...layer.params };
    app.engine.removeLayer(layer.id);
    return params;
  };

  const factoryDefaults = (V) =>
    (V.PRESETS || []).filter(
      (p) => p.preset_system && p.id === `${p.preset_system.toLowerCase()}-default` && p.params && Object.keys(p.params).length,
    );

  // THE sweep. Both tests below call this exact function — the mutation test must exercise
  // the guard, not re-derive its preconditions. Re-deriving them means a later refactor of
  // the oracle can blind the guard while the mutation test stays cheerfully green, which is
  // the same "proof that cannot fail" this whole test file exists to prevent.
  const findOffenders = (V) => {
    const offenders = [];
    factoryDefaults(V).forEach((preset) => {
      const type = preset.preset_system;
      const params = effectiveParams(type);
      const byId = controlsById(V, type);

      Object.keys(preset.params).forEach((key) => {
        const ctrl = byId.get(key);
        if (!ctrl || typeof ctrl.showIf !== 'function') return; // ungated => always live
        if (ctrl.showIf(params)) return;                        // gate is open => legitimately curated
        offenders.push(
          `${preset.id} pins ${key}=${JSON.stringify(preset.params[key])} but its showIf gate HIDES it ` +
          `(ALGO_DEFAULTS has ${JSON.stringify((V.ALGO_DEFAULTS[type] || {})[key])}) — junk frozen in from a mode the preset is not in`,
        );
      });
    });
    return offenders;
  };

  test('no factory default pins a param its own showIf gate hides', () => {
    const V = window.Vectura;
    expect(
      factoryDefaults(V).length,
      'no sparsified factory defaults found — the sweep would be vacuous',
    ).toBeGreaterThan(0);

    const offenders = findOffenders(V);
    expect(offenders, `\n  ${offenders.join('\n  ')}\n`).toEqual([]);
  });

  // The guard above is a claim about EVERY factory preset, so it must be able to see a
  // violation in ANY of them. Plant one and RUN THE SWEEP — a guard that cannot fail is a
  // false statement of safety.
  test('the sweep above can actually FAIL — plant a hidden pin and re-run it', () => {
    const V = window.Vectura;
    const terrain = (V.PRESETS || []).find((p) => p.id === 'terrain-default');
    expect(terrain).toBeTruthy();

    expect(findOffenders(V), 'the sweep must be clean before the pin is planted').toEqual([]);

    // vpLeftX is gated on perspectiveMode === 'two-point'; the preset ships 'free-3d'.
    // This is precisely the historical bug, re-planted.
    terrain.params.vpLeftX = 0;
    try {
      const caught = findOffenders(V);
      expect(
        caught.length,
        'the sweep did not catch a pin on a param its own gate hides — it is measuring nothing',
      ).toBeGreaterThan(0);
      expect(caught.join('\n')).toContain('vpLeftX');
    } finally {
      delete terrain.params.vpLeftX;   // PRESETS is shared shipped state — put it back
    }

    expect(findOffenders(V), 'the sweep must be clean again once the pin is removed').toEqual([]);
  });
});

/*
 * Terrain — Two-point perspective must actually converge.
 *
 * Two-point mode builds a trapezoid: each side of the ground plane runs from its own
 * vanishing point at the horizon out to the canvas edge at the camera. Put the two VPs
 * ON the canvas edges (0 and 100) and the trapezoid degenerates into a RECTANGLE —
 * `lerp(vpLeftX, inset, t)` is constant when vpLeftX already equals inset — so every
 * depth row spans the full width and the mode's defining feature vanishes entirely.
 *
 * That is what the factory preset shipped. It asserts on the OUTPUT geometry and names
 * no parameter value, so it cannot be fooled by any of the four origins of a default
 * agreeing on a bad one.
 */
describe('Terrain — switching to Two-point yields real perspective convergence', () => {
  let runtime, window, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  // A flat heightfield makes every depth row a pure horizontal polyline, so a row's
  // x-extent IS the trapezoid width at that depth. Convergence is then far/near width.
  const FLAT = {
    mountainAmplitude: 0, valleyCount: 0, riversEnabled: false, oceansEnabled: false,
    occlusion: false, curves: false, simplify: 0, smoothing: 0,
  };

  // Buy the layer the way a user does (ALGO_DEFAULTS + factory preset), then flip the
  // one control the user flips. `poison` forces values in afterwards — used only to
  // prove the measurement can fail.
  const convergenceViaApp = (poison = null) => {
    app.engine.addLayer('terrain');
    const layer = app.engine.getActiveLayer();
    Object.assign(layer.params, FLAT);
    layer.params.perspectiveMode = 'two-point';   // the user flips Perspective Mode
    if (poison) Object.assign(layer.params, poison);

    // app.regen() is what the UI calls. engine.generate() takes an ID, not a layer —
    // handing it a layer is a silent no-op that leaves the previous render in place.
    app.engine.activeLayerId = layer.id;
    app.regen();

    const rows = new Map();
    (layer.paths || []).forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      path.forEach((pt) => {
        const key = Math.round(pt.y * 100) / 100;
        const r = rows.get(key) || { min: Infinity, max: -Infinity };
        r.min = Math.min(r.min, pt.x);
        r.max = Math.max(r.max, pt.x);
        rows.set(key, r);
      });
    });
    const widths = [...rows.entries()]
      .sort((a, b) => a[0] - b[0])                       // far (small y, at the horizon) -> near
      .map(([, r]) => r.max - r.min)
      .filter((w) => w > 0.01);

    const params = { ...layer.params };
    app.engine.removeLayer(layer.id);
    return {
      rows: widths.length,
      far: widths[0],
      near: widths[widths.length - 1],
      ratio: widths[0] / widths[widths.length - 1],
      distinct: new Set(widths.map((w) => w.toFixed(3))).size,
      params,
    };
  };

  test('a fresh layer switched to Two-point converges toward the horizon', () => {
    const r = convergenceViaApp();
    expect(r.rows, 'no ground rows were drawn — the measurement is empty').toBeGreaterThan(4);
    expect(
      r.ratio,
      `the far row is ${r.far.toFixed(1)}px and the near row ${r.near.toFixed(1)}px ` +
      `(ratio ${r.ratio.toFixed(3)}): Two-point perspective is not converging`,
    ).toBeLessThan(0.95);
    expect(
      r.distinct,
      'every depth row has the same width — the two VPs sit on the canvas edges and the trapezoid has collapsed to a rectangle',
    ).toBeGreaterThan(1);
  });

  test('the measurement can actually FAIL — inject the historical edge-pinned VPs', () => {
    // vpLeftX 0 / vpRightX 100 is what the factory preset shipped. If this suite cannot
    // see that, the test above is worthless.
    const degenerate = convergenceViaApp({ vpLeftX: 0, vpRightX: 100 });
    expect(
      degenerate.ratio,
      'the guard is VACUOUS: it reports convergence even with both VPs on the canvas edges',
    ).toBeGreaterThan(0.99);
    expect(degenerate.distinct, 'edge-pinned VPs must flatten every row to one width').toBe(1);

    // ...and the same scene, unpoisoned, still converges. Same code path, same oracle.
    expect(convergenceViaApp().ratio).toBeLessThan(0.95);
  });
});
