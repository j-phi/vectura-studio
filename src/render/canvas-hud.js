/**
 * Canvas HUD (TUX-020): one-tap Undo, Redo, Zoom Out, Zoom In and Fit for fingers.
 *
 * Also owns the single history path for touch: runHistory('undo' | 'redo'). The HUD buttons and the
 * two-/three-finger tap (Renderer._finishMultiTap) both call it. It runs the same top-menu command
 * as Cmd+Z / Cmd+Shift+Z (ui.triggerTopMenuAction), and does nothing while a modal is open (the
 * same rule as shortcuts.js).
 *
 * Availability comes from App._notifyHistory() ('vectura:history' on window). This module sets
 * `disabled` and aria-disabled on its own buttons AND on the phone header Undo / Redo buttons
 * (#btn-header-undo, #btn-header-redo, TUX-001) by id.
 *
 * Visible only under body.touch-ui (CSS). Undo / Redo are tablet and touch-wide only; the phone
 * header serves them.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const ICON = {
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6"/>',
    zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6"/><path d="M11 8v6"/>',
    fit: '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  };

  // id, label, icon, group. 'history' buttons are hidden on the phone layout (CSS).
  const BUTTONS = [
    { id: 'btn-hud-undo', label: 'Undo', icon: 'undo', group: 'history', kind: 'undo' },
    { id: 'btn-hud-redo', label: 'Redo', icon: 'redo', group: 'history', kind: 'redo' },
    { id: 'btn-hud-zoom-out', label: 'Zoom out', icon: 'zoomOut', group: 'view', kind: 'zoom-out' },
    { id: 'btn-hud-zoom-in', label: 'Zoom in', icon: 'zoomIn', group: 'view', kind: 'zoom-in' },
    { id: 'btn-hud-fit', label: 'Fit to view', icon: 'fit', group: 'view', kind: 'fit' },
  ];

  const state = { canUndo: false, canRedo: false };

  const isModalOverlayOpen = () => {
    const overlays = Vectura.UI && Vectura.UI.overlays;
    if (overlays && overlays.Modal && overlays.Modal.anyOpen && overlays.Modal.anyOpen()) return true;
    const legacy = document.getElementById('modal-overlay');
    return Boolean(legacy && legacy.classList.contains('open'));
  };

  const app = () => window.app || null;

  // The one history path. Returns true when a history action ran.
  const runHistory = (kind) => {
    if (isModalOverlayOpen()) return false;
    const a = app();
    const ui = a && a.ui;
    if (!ui || typeof ui.triggerTopMenuAction !== 'function') return false;
    return !!ui.triggerTopMenuAction(kind === 'redo' ? 'btn-redo' : 'btn-undo');
  };

  const setDisabled = (el, off) => {
    if (!el) return;
    el.disabled = off;
    el.setAttribute('aria-disabled', off ? 'true' : 'false');
    el.classList.toggle('is-disabled', off);
  };

  const applyState = () => {
    // A late timer can fire after a test runtime tears the document down.
    if (typeof document === 'undefined' || !document) return;
    setDisabled(document.getElementById('btn-hud-undo'), !state.canUndo);
    setDisabled(document.getElementById('btn-hud-redo'), !state.canRedo);
    setDisabled(document.getElementById('btn-header-undo'), !state.canUndo);
    setDisabled(document.getElementById('btn-header-redo'), !state.canRedo);
    // The pop-out Petal Designer window carries its own pair (it covers the HUD and the phone header).
    document.querySelectorAll('.petal-hist.petal-undo').forEach((el) => setDisabled(el, !state.canUndo));
    document.querySelectorAll('.petal-hist.petal-redo').forEach((el) => setDisabled(el, !state.canRedo));
  };

  const readFromApp = () => {
    const a = app();
    if (!a || !Array.isArray(a.history)) return;
    state.canUndo = a.history.length >= 2;
    state.canRedo = Array.isArray(a.redoStack) && a.redoStack.length > 0;
    applyState();
  };

  const act = (kind) => {
    if (isModalOverlayOpen()) return;
    const r = app() && app().renderer;
    if (kind === 'undo' || kind === 'redo') { runHistory(kind); return; }
    if (!r) return;
    const step = (Vectura.VIEW && Vectura.VIEW.zoomStep) || 1.25;
    if (kind === 'zoom-in') r.zoomBy(step);
    else if (kind === 'zoom-out') r.zoomBy(1 / step);
    else if (kind === 'fit') r.fitToView();
  };

  const mount = () => {
    const host = document.getElementById('viewport-container');
    if (!host || document.getElementById('canvas-hud')) return;
    const hud = document.createElement('div');
    hud.id = 'canvas-hud';
    hud.className = 'canvas-hud';
    hud.setAttribute('role', 'toolbar');
    hud.setAttribute('aria-label', 'Canvas controls');
    let lastGroup = null;
    BUTTONS.forEach((def) => {
      if (lastGroup && lastGroup !== def.group) {
        const sep = document.createElement('span');
        sep.className = 'canvas-hud-sep';
        sep.setAttribute('aria-hidden', 'true');
        hud.appendChild(sep);
      }
      lastGroup = def.group;
      const b = document.createElement('button');
      b.type = 'button';
      b.id = def.id;
      b.className = `canvas-hud-btn canvas-hud-${def.group}`;
      b.setAttribute('aria-label', def.label);
      b.dataset.hud = def.kind;
      b.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[def.icon]}</svg>`;
      b.addEventListener('click', (e) => { e.preventDefault(); act(def.kind); });
      hud.appendChild(b);
    });
    host.appendChild(hud);
    applyState();
  };

  // Batch R: a HUD button that another layer covers at its centre (the pop-out Petal Designer window, a pane or sheet over the
  // HUD, the formula sheet) cannot take a tap but would show as a live control. Mark it `data-covered` (CSS hides it); a button
  // the layer leaves clear stays. Each pass clears the mark first, so a layer that goes away restores the button.
  const stepAsideCovered = () => {
    const hud = document.getElementById('canvas-hud');
    if (!hud || getComputedStyle(hud).display === 'none') return;
    const host = document.getElementById('viewport-container');
    const hudHidden = getComputedStyle(hud).visibility === 'hidden';
    hud.querySelectorAll('.canvas-hud-btn').forEach((b) => {
      if (hudHidden) { b.removeAttribute('data-covered'); return; } // a hidden HUD needs no mark, and its buttons must not be touched
      // Measure the button as if shown: a visibility transition would otherwise leave it hidden (and so un-hittable) for a moment.
      b.removeAttribute('data-covered');
      const hadVis = b.style.visibility; const hadTr = b.style.transition;
      b.style.transition = 'none';
      b.style.visibility = 'visible';
      const r = b.getBoundingClientRect();
      let covered = false;
      if (r.width >= 1 && r.height >= 1) {
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        covered = !!hit && hit !== b && !b.contains(hit) && !hud.contains(hit) && !(host && host.contains(hit));
      }
      b.style.visibility = hadVis; b.style.transition = hadTr;
      if (covered) b.setAttribute('data-covered', '1');
    });
  };
  const scheduleStepAside = (() => {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; stepAsideCovered(); });
    };
  })();
  const watchCovers = () => {
    if (typeof MutationObserver !== 'function') return;
    const host = document.getElementById('viewport-container');
    new MutationObserver((records) => {
      if (records.some((m) => !(host && m.target && m.target.nodeType === 1 && host.contains(m.target)))) scheduleStepAside();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', scheduleStepAside);
    document.addEventListener('transitionend', scheduleStepAside, true);
    scheduleStepAside();
  };

  const bindForeignFingers = () => {
    // Fingers that land outside the canvas (HUD, chrome) must not combine with canvas fingers
    // into a tap. Report them to the arbiter; capture phase sees them before any handler.
    const arbiter = () => app() && app().renderer && app().renderer.touchArbiter;
    const onCanvas = (e) => e.target && e.target.id === 'main-canvas';
    document.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || onCanvas(e)) return;
      const arb = arbiter();
      if (arb) arb.foreignDown(e.pointerId);
    }, true);
    const up = (e) => {
      if (e.pointerType !== 'touch') return;
      const arb = arbiter();
      if (arb) arb.foreignUp(e.pointerId);
    };
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  };

  const init = () => {
    mount();
    window.addEventListener('vectura:history', (e) => {
      const d = (e && e.detail) || {};
      state.canUndo = !!d.canUndo;
      state.canRedo = !!d.canRedo;
      applyState();
    });
    // Safety net for history edits that do not announce themselves.
    const resync = () => requestAnimationFrame(readFromApp);
    document.addEventListener('pointerup', resync, true);
    document.addEventListener('pointercancel', resync, true);
    document.addEventListener('keyup', () => requestAnimationFrame(readFromApp), true);
    bindForeignFingers();
    watchCovers();
    readFromApp();
    applyState();
  };

  Vectura.CanvasHud = { runHistory, isModalOverlayOpen, syncFromApp: readFromApp, stepAsideCovered, init, BUTTONS };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
