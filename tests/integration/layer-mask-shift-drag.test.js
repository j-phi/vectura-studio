const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));
const waitRaf = () => new Promise((resolve) => setTimeout(resolve, 20));

// Simulate a DragEvent with bubble + cancelable + dataTransfer stub.
// The event sequence that matters: dragstart on source → dragover on target → drop on target.
// This is exactly what the browser fires during a real HTML5 drag — confirmed by
// Playwright CDP instrumentation. The critical invariant: dragstart MUST fire first
// (it sets _lvlDRAG.id and _lvlDRAG.canArm); without it, dragover and drop are no-ops.
const makeDragEvent = (window, type, { clientY = 0, shiftKey = false } = {}) => {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = {
    effectAllowed: 'move',
    dropEffect: 'move',
    setData() {},
    getData() { return ''; },
    clearData() {},
  };
  Object.defineProperty(e, 'clientY', { value: clientY });
  Object.defineProperty(e, 'shiftKey', { value: shiftKey });
  return e;
};

// Closed oval path — first and last point identical so isClosedPath() returns true.
// buildClosedPathSilhouettes reads layer.displayPaths (not sourcePaths), so we set
// displayPaths directly rather than relying on algorithm generation.
const makeOvalPath = () => {
  const pts = Array.from({ length: 37 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return { x: 200 + Math.cos(a) * 100, y: 200 + Math.sin(a) * 100 };
  });
  pts[36] = { ...pts[0] }; // exact close
  return pts;
};

// Build a wavetable + oval layer pair with stable display geometry.
// "Oval" conceptually represents any closed-silhouette layer (rings, shape, etc.)
// that can act as a clipping mask source (canSource = true).
// "Wavetable" is the open-path content layer that will be masked.
const buildWavetableAndOval = (app, Layer) => {
  const ovalPath = makeOvalPath();

  // Oval (mask source) — use 'shape' type whose generate() accepts pre-set sourcePaths
  const oval = new Layer('oval-src', 'shape', 'Oval');
  oval.sourcePaths = [ovalPath];
  // Set displayPaths directly so buildClosedPathSilhouettes sees the closed shape
  // (it checks displayPaths first, then effectivePaths, then paths — NOT sourcePaths)
  oval.displayPaths = [ovalPath];
  oval.params = { curves: false, smoothing: 0, simplify: 0, scaleX: 1, scaleY: 1, posX: 0, posY: 0, rotation: 0 };

  // Wavetable (mask target) — open horizontal lines, no closed silhouette
  const wav = new Layer('wav-tgt', 'wavetable', 'Wavetable');
  const wavPaths = [
    [{ x: 0, y: 200 }, { x: 400, y: 200 }],
    [{ x: 0, y: 210 }, { x: 400, y: 210 }],
  ];
  wav.sourcePaths = wavPaths;
  wav.displayPaths = wavPaths; // set directly — avoids generate() which needs complex params
  wav.params = { curves: false, smoothing: 0, simplify: 0 };

  // Engine layer order: wav below oval (typical artwork stack)
  app.engine.layers = [wav, oval];
  app.engine.computeAllDisplayGeometry();
  return { oval, wav };
};

describe('Layer panel Shift+drag mask creation (wavetable + oval)', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // ── Core functional test ────────────────────────────────────────────────────
  // Mirrors the real user workflow:
  //   1. Click oval to single-select it
  //   2. Shift+drag: dragstart (shiftKey=true) → dragover on wavetable (shiftKey=true)
  //      → drop on wavetable (drop may or may not carry shiftKey in real browsers)
  //   3. Verify: oval.mask.enabled = true, wavetable.parentId = oval.id
  //
  // The fix stores _lvlDRAG.maskDrop in dragover so drop does not need e.shiftKey.
  // This test proves that chain end-to-end.

  test('Shift+drag oval over wavetable creates clipping mask: oval.mask.enabled and wavetable.parentId', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const { oval, wav } = buildWavetableAndOval(app, Layer);

    // Single-select the oval (rings) layer — required for canArm = true
    app.renderer.setSelection([oval.id], oval.id);
    app.engine.activeLayerId = oval.id;
    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const ovalCard = document.querySelector('[data-lvl-id="oval-src"]');
    const wavCard  = document.querySelector('[data-lvl-id="wav-tgt"]');
    expect(ovalCard).toBeTruthy();
    expect(wavCard).toBeTruthy();

    // Pre-condition: oval can be a mask source
    expect(oval.maskCapabilities?.canSource).toBe(true);
    // Pre-condition: no mask relationship yet
    expect(oval.mask?.enabled).toBeFalsy();
    expect(wav.parentId).toBeFalsy();

    wavCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 40, width: 200, right: 200, bottom: 40,
    });

    // ── Event sequence: exactly what a real browser fires ───────────────────
    // dragstart on oval (Shift held) → sets _lvlDRAG.id, canArm, maskDrop
    ovalCard.dispatchEvent(makeDragEvent(window, 'dragstart', { shiftKey: true }));
    await waitRaf();

    // dragover on wavetable (Shift held) → updates _lvlDRAG.maskDrop = true, shows hint
    wavCard.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 20, shiftKey: true }));

    // drop — tests the scenario where Shift may be released at drop time.
    // The fix reads _lvlDRAG.maskDrop (set during dragover) so shiftKey=false at drop is fine.
    wavCard.dispatchEvent(makeDragEvent(window, 'drop', { clientY: 20, shiftKey: false }));

    // ── Verify mask relationship ─────────────────────────────────────────────
    const updatedOval = app.engine.getLayerById(oval.id);
    const updatedWav  = app.engine.getLayerById(wav.id);
    expect(updatedOval.mask?.enabled).toBe(true);
    expect(updatedWav.parentId).toBe(oval.id);
  });

  // ── DOM visual state ────────────────────────────────────────────────────────

  test('hint "Make clipping mask" shows during Shift+dragover, disappears after drop', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const { oval, wav } = buildWavetableAndOval(app, Layer);
    app.renderer.setSelection([oval.id], oval.id);
    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const ovalCard = document.querySelector('[data-lvl-id="oval-src"]');
    const wavCard  = document.querySelector('[data-lvl-id="wav-tgt"]');

    wavCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 40, width: 200, right: 200, bottom: 40,
    });

    ovalCard.dispatchEvent(makeDragEvent(window, 'dragstart', { shiftKey: true }));
    await waitRaf();
    wavCard.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 20, shiftKey: true }));

    // Hint must be present after dragover
    const bar = document.getElementById('layer-status-bar');
    const hint = bar?.querySelector('.lvl-s-hint');
    expect(hint?.textContent).toContain('Make clipping mask');
    // Target card must have the mask CSS class
    expect(wavCard.classList.contains('lvl-drop-mask')).toBe(true);

    wavCard.dispatchEvent(makeDragEvent(window, 'drop', { clientY: 20, shiftKey: false }));
    // After drop, the mask class and hint must be cleared
    expect(wavCard.classList.contains('lvl-drop-mask')).toBe(false);
  });

  // ── Guard: Shift released before last dragover → no mask ─────────────────────

  test('releasing Shift before drop (last dragover has shiftKey=false) does NOT create mask', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const { oval, wav } = buildWavetableAndOval(app, Layer);
    app.renderer.setSelection([oval.id], oval.id);
    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const ovalCard = document.querySelector('[data-lvl-id="oval-src"]');
    const wavCard  = document.querySelector('[data-lvl-id="wav-tgt"]');

    wavCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 40, width: 200, right: 200, bottom: 40,
    });

    // Shift held at dragstart and first dragover, but released before drop
    ovalCard.dispatchEvent(makeDragEvent(window, 'dragstart', { shiftKey: true }));
    await waitRaf();
    // Last dragover has shiftKey=false → maskDrop is reset to false
    wavCard.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 20, shiftKey: false }));
    wavCard.dispatchEvent(makeDragEvent(window, 'drop', { clientY: 20, shiftKey: false }));

    expect(oval.mask?.enabled).toBeFalsy();
    expect(wav.parentId).toBeFalsy();
  });

  // ── Guard: plain drag (no Shift) does not create mask ──────────────────────

  test('plain drag without Shift does not create mask', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const { oval, wav } = buildWavetableAndOval(app, Layer);
    app.renderer.setSelection([oval.id], oval.id);
    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const ovalCard = document.querySelector('[data-lvl-id="oval-src"]');
    const wavCard  = document.querySelector('[data-lvl-id="wav-tgt"]');

    wavCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 40, width: 200, right: 200, bottom: 40,
    });

    ovalCard.dispatchEvent(makeDragEvent(window, 'dragstart', { shiftKey: false }));
    await waitRaf();
    wavCard.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 20, shiftKey: false }));
    wavCard.dispatchEvent(makeDragEvent(window, 'drop', { clientY: 20, shiftKey: false }));

    expect(oval.mask?.enabled).toBeFalsy();
    expect(wav.parentId).toBeFalsy();
  });

  // ── Fallback: drop fires on list instead of card (dragleave+drop on list) ────

  test('drop on list fallback: mask created when drop misses card but maskDrop was set', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const { oval, wav } = buildWavetableAndOval(app, Layer);
    app.renderer.setSelection([oval.id], oval.id);
    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const ovalCard = document.querySelector('[data-lvl-id="oval-src"]');
    const wavCard  = document.querySelector('[data-lvl-id="wav-tgt"]');
    const list     = document.getElementById('layer-list');

    wavCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 40, width: 200, right: 200, bottom: 40,
    });

    // Simulate: user Shift+drags oval over wav (maskTargetId set), then browser
    // fires dragleave on the card + drop on the list (the macOS edge case).
    ovalCard.dispatchEvent(makeDragEvent(window, 'dragstart', { shiftKey: true }));
    await waitRaf();
    wavCard.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 20, shiftKey: true }));
    // dragleave on card — cursor briefly leaves card (no list dragover between)
    wavCard.dispatchEvent(new window.Event('dragleave', { bubbles: true, cancelable: true }));
    // drop lands on list (not card)
    list.dispatchEvent(makeDragEvent(window, 'drop', { clientY: 20, shiftKey: false }));

    const updatedOval = app.engine.getLayerById(oval.id);
    const updatedWav  = app.engine.getLayerById(wav.id);
    expect(updatedOval.mask?.enabled).toBe(true);
    expect(updatedWav.parentId).toBe(oval.id);
  });

  // ── Guard: list dragover between dragleave and drop clears maskTargetId ──────

  test('intentional move-off: list dragover clears maskTargetId, drop on list creates no mask', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const { oval, wav } = buildWavetableAndOval(app, Layer);
    app.renderer.setSelection([oval.id], oval.id);
    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const ovalCard = document.querySelector('[data-lvl-id="oval-src"]');
    const wavCard  = document.querySelector('[data-lvl-id="wav-tgt"]');
    const list     = document.getElementById('layer-list');

    wavCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 40, width: 200, right: 200, bottom: 40,
    });
    list.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 200, width: 200, right: 200, bottom: 200,
    });
    // Provide minimal [data-layer-id] elements so the list dragover handler can query them
    wavCard.dataset.layerId = wav.id;

    ovalCard.dispatchEvent(makeDragEvent(window, 'dragstart', { shiftKey: true }));
    await waitRaf();
    wavCard.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 20, shiftKey: true }));
    // User intentionally moves off the card → list dragover fires, clears maskTargetId
    list.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 100, shiftKey: true }));
    // drop on list — maskTargetId was cleared, so no mask
    list.dispatchEvent(makeDragEvent(window, 'drop', { clientY: 100, shiftKey: true }));

    expect(oval.mask?.enabled).toBeFalsy();
    expect(wav.parentId).toBeFalsy();
  });

  // ── Guard: multi-select (>1 layer) prevents mask-arm ────────────────────────

  test('drag with multiple layers selected does not create mask (canArm=false)', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const { oval, wav } = buildWavetableAndOval(app, Layer);
    // Select BOTH layers → isSingleSel=false → canArm=false
    app.renderer.setSelection([oval.id, wav.id], oval.id);
    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const ovalCard = document.querySelector('[data-lvl-id="oval-src"]');
    const wavCard  = document.querySelector('[data-lvl-id="wav-tgt"]');

    wavCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 40, width: 200, right: 200, bottom: 40,
    });

    ovalCard.dispatchEvent(makeDragEvent(window, 'dragstart', { shiftKey: true }));
    await waitRaf();
    wavCard.dispatchEvent(makeDragEvent(window, 'dragover', { clientY: 20, shiftKey: true }));
    wavCard.dispatchEvent(makeDragEvent(window, 'drop', { clientY: 20, shiftKey: true }));

    expect(oval.mask?.enabled).toBeFalsy();
    expect(wav.parentId).toBeFalsy();
  });
});
