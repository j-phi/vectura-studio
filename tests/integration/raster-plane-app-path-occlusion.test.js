const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Raster-Plane — no line breaks through a curtain, ON THE PATH THE USER TAKES.
 *
 * Every other test of this behaviour calls AlgorithmRegistry.rasterPlane.generate()
 * with a hand-written param object. That reaches exactly ONE of the places the
 * Occlusion Bias default comes from — the `finite(p.depthBias, …)` fallback — and is
 * structurally blind to the other three:
 *
 *   ALGO_DEFAULTS.rasterPlane          seeds a new layer's params
 *   user-presets/rasterPlane/default   the factory preset, applied ON TOP of those
 *                                      (src/core/layer.js) — so it WINS
 *   the "Lines as Planes" cascade      writes params when the checkbox is ticked
 *
 * That blindness is not hypothetical: the bias shipped wrong from the preset, and
 * again from the cascade (which seeded 1.5), while 2600 generate()-level tests
 * stayed green both times. A hand-written param object cannot see a bad default,
 * because it *supplies* the value it is testing.
 *
 * So this test buys the layer the way a user does — addLayer (ALGO_DEFAULTS + the
 * factory preset), tick the real checkbox (the cascade), regenerate through the
 * engine — and then asserts on the OUTPUT. It never names a parameter value, so it
 * cannot be fooled by any of the four origins agreeing on a wrong one.
 *
 * The last test injects the historical bad value and REQUIRES this suite to notice.
 * A guard that cannot fail is worse than no guard: it is a false statement of safety.
 */
describe('Raster-Plane — the app path draws no line through a nearer curtain', () => {
  let runtime, window, document, app, G3;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    G3 = window.Vectura.Geometry3D;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  const findCheckbox = (label) => {
    for (const cb of document.querySelectorAll('input[type="checkbox"]')) {
      let n = cb;
      for (let i = 0; i < 5 && n; i++) {
        n = n.parentElement;
        const lbl = n && n.querySelector && n.querySelector('.control-label');
        if (lbl && lbl.textContent.trim() === label) return cb;
      }
    }
    return null;
  };

  const pointInPoly = (px, py, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  const distToPolyEdge = (px, py, poly) => {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j].x, ay = poly[j].y, bx = poly[i].x, by = poly[i].y;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) best = d;
    }
    return best;
  };

  /*
   * Buy a Lines-as-Planes layer the way the UI does, render it, and count ink that
   * ended up INSIDE a curtain standing in front of it.
   *
   * The unclipped curtain outlines are captured from the hidden-line pass itself:
   * the emitted paths are already clipped and so cannot answer the question being
   * asked about them. Curtains are ordered by the depth the algorithm sorted them
   * by, so "nearer" needs no reimplementation here.
   *
   * `poison` lets a caller force a bias in after the cascade — used only to prove
   * this measurement can fail.
   */
  const renderViaApp = (view = {}, poison = null, { useCascade = true } = {}) => {
    app.engine.addLayer('rasterPlane');
    const layer = app.engine.getActiveLayer();
    layer.params.mode = 'lines';
    app.ui.buildControls();

    if (useCascade) {
      // Path A — the user ticks the checkbox. The cascade fires and PINS the
      // mode-critical params, so it is the last word on this path.
      const cb = findCheckbox('Lines as Planes');
      expect(cb, 'the Lines as Planes checkbox must exist — the cascade is what we are testing').toBeTruthy();
      cb.checked = true;
      cb.dispatchEvent(new window.Event('change'));
    } else {
      // Path B — planes arrive already ON, from a saved document or a preset that
      // ships with them enabled. The cascade NEVER RUNS, so nothing overwrites the
      // bias and whatever ALGO_DEFAULTS / the factory preset supplied is what the
      // algorithm sees. Path A is blind to those two origins precisely because the
      // cascade clobbers them; this is the path that can see them.
      layer.params.horizontalLinesAsPlanes = true;
      layer.params.seeThrough = false;
      layer.params.baseHeight = 1;
    }

    Object.assign(layer.params, view);
    if (poison) Object.assign(layer.params, poison);

    let captured = null;
    const orig = G3.occludeRowsFloatingHorizon;
    G3.occludeRowsFloatingHorizon = (rows, opts) => { captured = rows; return orig(rows, opts); };
    // app.regen() is what the UI calls. engine.generate() takes an ID, not a layer —
    // handing it the layer is a silent no-op that leaves the PREVIOUS render in place,
    // which is exactly how a test like this ends up quietly measuring nothing.
    app.engine.activeLayerId = layer.id;
    try { app.regen(); } finally { G3.occludeRowsFloatingHorizon = orig; }

    const curtains = (captured || []).filter(
      (r) => r && r.occludes !== false && r.meta && r.meta.row != null && Array.isArray(r.pts) && r.pts.length > 2,
    );
    const drawn = (layer.paths || []).filter(
      (p) => Array.isArray(p) && p.length >= 2 && p.meta && p.meta.row != null,
    );

    const curtainOf = new Map(curtains.map((c) => [c.meta.row, c]));
    let breaches = 0;
    let deepest = 0;
    drawn.forEach((p) => {
      const own = curtainOf.get(p.meta.row);
      if (!own) return;
      curtains.forEach((c) => {
        if (c.meta.row === p.meta.row) return;
        if (!(c.depth > own.depth)) return;           // only curtains genuinely IN FRONT
        for (let i = 0; i < p.length - 1; i++) {
          const steps = Math.max(1, Math.round(Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y)));
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const x = p[i].x + (p[i + 1].x - p[i].x) * t;
            const y = p[i].y + (p[i + 1].y - p[i].y) * t;
            if (!pointInPoly(x, y, c.pts)) continue;
            const pen = distToPolyEdge(x, y, c.pts);
            if (pen > 0.05) breaches++;
            if (pen > deepest) deepest = pen;
          }
        }
      });
    });

    const params = { ...layer.params };
    app.engine.removeLayer(layer.id);
    return { breaches, deepest, params, curtains: curtains.length, drawn: drawn.length };
  };

  test('a fresh layer + the Lines as Planes cascade yields an EXACT clip (Occlusion Bias 0)', () => {
    const r = renderViaApp();
    // Asserted on the value that actually reached the algorithm, not on any one
    // of the four places it could have come from.
    expect(r.params.depthBias, 'a bias above 0 is slack for a farther row to protrude').toBe(0);
    expect(r.params.planeWidth, 'thin free-standing curtains are the point of the mode').toBe(1);
    expect(r.curtains).toBeGreaterThan(2);
    expect(r.drawn).toBeGreaterThan(2);
  });

  // The camera the user actually gets is the FACTORY PRESET's, not ALGO_DEFAULTS'.
  // Sweep heights and tilts around it: a single pose is a single sample, and a bias
  // is invisible at some of them (head-on, or with the slices fused into a slab).
  const VIEWS = [
    { label: 'as shipped', view: {} },
    { label: 'height 20mm', view: { amplitude: 20 } },
    { label: 'height 80mm', view: { amplitude: 80 } },
    { label: 'height 145mm', view: { amplitude: 145 } },
    { label: 'low tilt', view: { tilt: 20, amplitude: 80 } },
    { label: 'high tilt', view: { tilt: 70, amplitude: 80 } },
    { label: 'default camera', view: { rotate: -45, tilt: 60, amplitude: 80 } },
  ];

  test.each(VIEWS)('no ink inside a nearer curtain — $label', ({ view }) => {
    const r = renderViaApp(view);
    expect(
      r.breaches,
      `${r.breaches} points break through a nearer curtain; deepest ${r.deepest.toFixed(2)}px`,
    ).toBe(0);
  });

  // Path B: planes already ON (a saved document, or a preset that ships with them
  // enabled), so the cascade never fires. This is the ONLY path that can see a bad
  // ALGO_DEFAULTS or a bad factory preset — on path A the cascade overwrites both.
  test.each([
    { label: 'as shipped', view: {} },
    { label: 'height 145mm', view: { amplitude: 145 } },
    { label: 'low tilt', view: { tilt: 20, amplitude: 80 } },
  ])('no ink inside a nearer curtain without the cascade (saved doc / preset) — $label', ({ view }) => {
    const r = renderViaApp(view, null, { useCascade: false });
    expect(
      r.params.depthBias,
      'nothing pins the bias on this path — it comes straight from ALGO_DEFAULTS / the factory preset',
    ).toBe(0);
    expect(
      r.breaches,
      `${r.breaches} points break through a nearer curtain; deepest ${r.deepest.toFixed(2)}px`,
    ).toBe(0);
  });

  test('the measurement above can actually FAIL — inject the historical bad bias', () => {
    // Occlusion Bias 0.5 shipped for months and put visible hooks on every border.
    // If this suite cannot see that, every "0 breakthrough" above is worthless. This
    // is the assertion that makes the others mean something.
    const poisoned = renderViaApp({ amplitude: 80 }, { depthBias: 0.5 });
    expect(
      poisoned.breaches,
      'the guard is VACUOUS: it reports a clean render even at the bias that caused the bug',
    ).toBeGreaterThan(0);
    expect(poisoned.deepest).toBeGreaterThan(0.1);

    // ...and the same scene, clean, still measures zero. Same code path, same oracle.
    const clean = renderViaApp({ amplitude: 80 });
    expect(clean.breaches).toBe(0);
  });
});
