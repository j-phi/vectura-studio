/*
 * Vectura Studio — Engine progress tap (Phase 4).
 *
 * Wraps `app.engine.generate(id)` so any single call exceeding ~200 ms surfaces
 * the indeterminate progress bar. The wrap is timer-based: the bar is shown
 * only if the work has not returned by the threshold, and is hidden as soon
 * as the call completes (or as soon as it returns synchronously, since the
 * threshold timer can only fire if generate truly took longer).
 *
 * Idempotent: calling `attach(ui)` more than once is a no-op.
 *
 * UI-only — does not modify engine.generate's behavior, signatures, or
 * results. Pure observation + progress-bar surface wiring.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.Menus = UI.Menus || {};

  const THRESHOLD_MS = 200;
  const ATTACHED = new WeakSet();

  const startProgress = (label) => {
    const PB = UI.overlays && UI.overlays.ProgressBar;
    if (PB && typeof PB.show === 'function') {
      try { return PB.show({ label }); } catch (_) { /* noop */ }
    }
    return null;
  };

  function attach(ui) {
    if (!ui || !ui.app || !ui.app.engine) return;
    const engine = ui.app.engine;
    if (ATTACHED.has(engine)) return;
    if (typeof engine.generate !== 'function') return;
    ATTACHED.add(engine);

    const original = engine.generate.bind(engine);
    let depth = 0; // re-entrancy guard for nested generate() calls.

    engine.generate = function patchedGenerate(...args) {
      // engine.generate is currently synchronous, so a deferred timer will
      // never fire mid-call. We use performance.now() to detect overruns
      // *after* the fact and show a brief progress flash for visual coherence
      // when a single call took meaningful UI-blocking time. Stacked nested
      // calls (e.g. mask groups regenerating children) collapse to one bar.
      depth++;
      const t0 = (typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now();
      let result;
      let threw;
      try {
        result = original(...args);
      } catch (err) {
        threw = err;
      }
      const elapsed = ((typeof performance !== 'undefined' && performance.now)
        ? performance.now() : Date.now()) - t0;
      depth--;
      if (depth === 0 && elapsed >= THRESHOLD_MS) {
        // Surface a brief progress flash on the next frame so the user sees
        // feedback that the long work happened. The bar shows for a short
        // animation cycle, then auto-hides.
        const handle = startProgress('Regenerating layer…');
        if (handle) {
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
              setTimeout(() => handle.done(), 320);
            });
          } else {
            setTimeout(() => handle.done(), 320);
          }
        }
      }
      if (threw) throw threw;
      return result;
    };
  }

  UI.Menus.EngineProgressTap = { attach, _THRESHOLD_MS: THRESHOLD_MS };
})();
