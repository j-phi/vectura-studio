/*
 * Petal Designer Profile Editor: Inner|Outer toggle + profile→advanced sync.
 *
 * - The two profile cards now share a single-card stack driven by an Inner|Outer
 *   segmented toggle; only the active side's card is visible, and any per-side
 *   interaction auto-switches the toggle (both flow through activeTarget).
 * - Selecting a named profile resets that side's SHAPE advanced overrides to the
 *   clean baseline (preserving size params) so the sliders match the new profile
 *   and the silhouette is not distorted by leftover tweaks.
 *
 * jsdom does not apply stylesheets, so visibility is asserted via the `.hidden`
 * class (not computed display).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Petal Designer — Inner|Outer toggle + profile→advanced sync', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    // jsdom getContext('2d') returns null; stub a no-op 2D context so the thumb
    // canvases and renderPetalDesigner() don't throw.
    const noopCtx = {
      canvas: { width: 0, height: 0 },
      save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      fill() {}, stroke() {}, fillRect() {}, clearRect() {}, strokeRect() {}, arc() {},
      bezierCurveTo() {}, quadraticCurveTo() {}, rect() {}, translate() {}, rotate() {},
      scale() {}, setTransform() {}, transform() {}, resetTransform() {}, clip() {},
      drawImage() {}, measureText: () => ({ width: 0 }), fillText() {}, strokeText() {},
      setLineDash() {}, getLineDash: () => [], ellipse() {}, arcTo() {},
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    const HC = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
    if (HC) HC.getContext = function () { return noopCtx; };
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function ensurePetalisLayer() {
    let layer = (app.engine.layers || []).find((l) => l && l.type === 'petalisDesigner');
    if (layer) return layer;
    const Layer = window.Vectura.Layer;
    layer = new Layer(`test-petalis-${Date.now()}`, 'petalisDesigner', 'PE');
    layer.params = layer.params || {};
    layer.params.innerCount = 0;
    layer.params.outerCount = 6;
    app.engine.layers.push(layer);
    return layer;
  }

  const openDesigner = () => {
    const layer = ensurePetalisLayer();
    app.ui.openPetalDesigner({ layer });
    return { layer, win: document.getElementById('petal-designer-window'), pd: app.ui.petalDesigner };
  };

  test('the profile editor exposes an Inner|Outer segmented toggle', () => {
    const { win } = openDesigner();
    expect(win.querySelector('[data-petal-profile-side="inner"]')).toBeTruthy();
    expect(win.querySelector('[data-petal-profile-side="outer"]')).toBeTruthy();
    app.ui.closePetalDesigner();
  });

  test('only the active side card is shown; toggle aria-pressed tracks it', () => {
    const { win, pd } = openDesigner();
    pd.state.activeTarget = 'inner';
    app.ui.syncPetalDesignerControls(pd);
    const innerCard = win.querySelector('[data-petal-profile-editor="inner"]');
    const outerCard = win.querySelector('[data-petal-profile-editor="outer"]');
    const innerBtn = win.querySelector('[data-petal-profile-side="inner"]');
    const outerBtn = win.querySelector('[data-petal-profile-side="outer"]');

    expect(innerCard.classList.contains('hidden')).toBe(false);
    expect(outerCard.classList.contains('hidden')).toBe(true);
    expect(innerBtn.getAttribute('aria-pressed')).toBe('true');
    expect(outerBtn.getAttribute('aria-pressed')).toBe('false');

    // Click Outer toggle → visibility + pressed state invert, state follows.
    outerBtn.click();
    expect(pd.state.activeTarget).toBe('outer');
    expect(innerCard.classList.contains('hidden')).toBe(true);
    expect(outerCard.classList.contains('hidden')).toBe(false);
    expect(innerBtn.getAttribute('aria-pressed')).toBe('false');
    expect(outerBtn.getAttribute('aria-pressed')).toBe('true');
    app.ui.closePetalDesigner();
  });

  test('interacting with a side auto-switches the toggle (drives activeTarget)', () => {
    const { win, pd } = openDesigner();
    pd.state.activeTarget = 'inner';
    app.ui.syncPetalDesignerControls(pd);
    // Selecting an outer-card profile thumb calls activateSide('outer').
    const outerThumb = win.querySelector('[data-petal-shape-thumbs="outer"] .petal-profile-thumb[data-profile="dagger"]');
    expect(outerThumb).toBeTruthy();
    outerThumb.click();
    expect(pd.state.activeTarget).toBe('outer');
    expect(win.querySelector('[data-petal-profile-side="outer"]').getAttribute('aria-pressed')).toBe('true');
    app.ui.closePetalDesigner();
  });

  test('the toggle is marked locked when Inner = Outer is on', () => {
    const { win, pd } = openDesigner();
    pd.state.innerOuterLock = true;
    app.ui.syncPetalDesignerControls(pd);
    expect(win.querySelector('[data-petal-profile-side-toggle]').classList.contains('is-locked')).toBe(true);
    pd.state.innerOuterLock = false;
    app.ui.syncPetalDesignerControls(pd);
    expect(win.querySelector('[data-petal-profile-side-toggle]').classList.contains('is-locked')).toBe(false);
    app.ui.closePetalDesigner();
  });

  test('selecting a profile resets the side shape-advanced overrides (preserving size)', () => {
    const { win, pd } = openDesigner();
    pd.state.activeTarget = 'outer';
    // Pre-load the outer side with distorting shape tweaks + size tweaks.
    pd.state.outerRingParams = { petalWidthRatio: 0.3, tipSharpness: 0.2, petalScale: 50, bloom: 80 };
    app.ui.syncPetalDesignerControls(pd);

    const dagger = win.querySelector('[data-petal-shape-thumbs="outer"] .petal-profile-thumb[data-profile="dagger"]');
    expect(dagger).toBeTruthy();
    dagger.click();

    // Shape overrides cleared; size params preserved.
    expect(pd.state.outerRingParams.petalWidthRatio).toBeUndefined();
    expect(pd.state.outerRingParams.tipSharpness).toBeUndefined();
    expect(pd.state.outerRingParams.petalScale).toBe(50);
    expect(pd.state.outerRingParams.bloom).toBe(80);

    // The Width Ratio slider repaints to its baseline (was frozen at 0.30 before).
    const widthInput = win.querySelector('input[data-ring-param="outer-petalWidthRatio"]');
    expect(widthInput).toBeTruthy();
    expect(Number(widthInput.value)).toBeCloseTo(0.74, 2);
    app.ui.closePetalDesigner();
  });

  test('selecting a profile makes preview == flower input, with a small editable anchor set', () => {
    const { win, pd } = openDesigner();
    pd.state.activeTarget = 'outer';
    app.ui.syncPetalDesignerControls(pd);
    win.querySelector('[data-petal-shape-thumbs="outer"] .petal-profile-thumb[data-profile="teardrop"]').click();

    // The overlay preview renders pd.state.outer; the flower renders params.designerOuter.
    const layer = app.ui.getLayerById(pd.state.layerId);
    expect(layer.params.designerOuter.anchors).toEqual(pd.state.outer.anchors);
    // Few editable bezier points (not a dense sampled cloud).
    expect(pd.state.outer.anchors.length).toBeLessThanOrEqual(6);
    app.ui.closePetalDesigner();
  });

  test('templates reproduce the canonical profile (peak location) and are side-aware', () => {
    openDesigner();
    const peakT = (profile, side) => {
      const a = app.ui.buildProfileDesignerShape(profile, side).anchors;
      return a.reduce((best, an) => (an.w > best.w ? an : best), { t: 0.5, w: -1 }).t;
    };
    // teardrop is widest near the base, spoon near the tip — the templates must honor it.
    expect(peakT('teardrop', 'outer')).toBeLessThan(0.5);
    expect(peakT('spoon', 'outer')).toBeGreaterThan(0.5);
    // Inner side runs at 86% of outer width.
    const maxW = (profile, side) =>
      Math.max(...app.ui.buildProfileDesignerShape(profile, side).anchors.map((a) => a.w));
    expect(maxW('teardrop', 'inner') / maxW('teardrop', 'outer')).toBeCloseTo(0.86, 2);
    app.ui.closePetalDesigner();
  });

  test('applied silhouettes track their gallery icon (profileHalfWidth) with minimal anchors', () => {
    // RGR: the fitted-anchor template for a profile is what loads into the pen
    // editor; the gallery icon and flower draw from the algorithm's
    // profileHalfWidth curve. They had drifted apart for these four profiles
    // (e.g. lanceolate carried a stray mid-blade anchor that bowed it ~5.5% off
    // its icon, notched peaked at the wrong t). The fix re-fits each table to the
    // icon curve with the fewest control points; this guards both the alignment
    // (the editable shape must match the icon) and the simplification (anchor
    // budget) so a future re-fit can't silently re-introduce the wobble.
    openDesigner();
    const half = window.Vectura.PetalisAlgorithm.profileHalfWidth;

    // Cubic-bezier point in (t,w) anchor space, mirroring buildLeafProfile's path.
    const cub = (p0, p1, p2, p3, u) => {
      const v = 1 - u;
      return {
        x: v * v * v * p0.x + 3 * v * v * u * p1.x + 3 * v * u * u * p2.x + u * u * u * p3.x,
        y: v * v * v * p0.y + 3 * v * v * u * p1.y + 3 * v * u * u * p2.y + u * u * u * p3.y,
      };
    };
    // Trace the anchor set into a dense (t,w) polyline.
    const trace = (anchors) => {
      const pts = [];
      for (let i = 0; i < anchors.length - 1; i++) {
        const a = anchors[i];
        const b = anchors[i + 1];
        const p0 = { x: a.t, y: a.w };
        const p3 = { x: b.t, y: b.w };
        const p1 = a.out ? { x: a.out.t, y: a.out.w } : { x: a.t + (b.t - a.t) / 3, y: a.w };
        const p2 = b.in ? { x: b.in.t, y: b.in.w } : { x: a.t + (2 * (b.t - a.t)) / 3, y: b.w };
        for (let s = i === 0 ? 0 : 1; s <= 120; s++) pts.push(cub(p0, p1, p2, p3, s / 120));
      }
      return pts;
    };
    // Vertical (half-width) error between the traced anchors and the icon curve.
    const maxError = (anchors, profile) => {
      const cv = trace(anchors);
      // peak-normalize the icon curve so it shares the table's w-peak ~1.0 scale.
      let peak = 0;
      for (let i = 0; i <= 200; i++) peak = Math.max(peak, half(i / 200, profile));
      let max = 0;
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const target = half(t, profile) / (peak || 1);
        let y = null;
        for (let k = 0; k < cv.length - 1; k++) {
          const lo = cv[k];
          const hi = cv[k + 1];
          if ((lo.x <= t && t <= hi.x) || (hi.x <= t && t <= lo.x)) {
            const f = Math.abs(hi.x - lo.x) < 1e-9 ? 0 : (t - lo.x) / (hi.x - lo.x);
            y = lo.y + f * (hi.y - lo.y);
            break;
          }
        }
        if (y === null) continue;
        max = Math.max(max, Math.abs(y - target));
      }
      return max;
    };

    // profile → [max half-width error vs icon, max anchor count].
    const SPECS = {
      lanceolate: [0.03, 3],
      dagger: [0.03, 3],
      rounded: [0.04, 4],
      notched: [0.05, 5],
    };
    for (const [profile, [tol, maxAnchors]] of Object.entries(SPECS)) {
      const { anchors } = app.ui.buildProfileDesignerShape(profile, 'outer');
      expect(anchors.length).toBeLessThanOrEqual(maxAnchors);
      expect(maxError(anchors, profile)).toBeLessThan(tol);
    }
    app.ui.closePetalDesigner();
  });

  test('overlay always draws BOTH inner and outer, active side last with handles', () => {
    const { pd } = openDesigner();
    pd.state.activeTarget = 'outer';
    pd.state.innerCount = 0; // even with an empty inner ring, both profiles preview
    pd.state.outerCount = 6;
    pd.state.viewStyle = 'overlay';

    const orig = app.ui.drawDesignerShape.bind(app.ui);
    let calls = [];
    app.ui.drawDesignerShape = (canvas, shape, opts) => {
      calls.push({ shape, clear: opts?.clearCanvas, controls: opts?.showControls });
      return orig(canvas, shape, opts);
    };
    try {
      app.ui.renderPetalDesigner(pd);
      // Both sides drawn; inactive (inner) first and clears once, active (outer) last with handles.
      expect(calls.length).toBe(2);
      expect(calls[0].shape).toBe(pd.state.inner);
      expect(calls[0].clear).toBe(true);
      expect(calls[0].controls).toBe(false);
      expect(calls[1].shape).toBe(pd.state.outer);
      expect(calls[1].controls).toBe(true);
    } finally {
      app.ui.drawDesignerShape = orig;
    }
    app.ui.closePetalDesigner();
  });
});
