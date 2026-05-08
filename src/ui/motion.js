/*
 * Vectura Studio — motion helpers (Phase 1).
 *
 * Centralizes the small amount of imperative animation that components need
 * outside CSS keyframes. CSS keyframes (motion.css) handle the steady-state
 * effects; this file provides the trigger entry points.
 *
 * Public API: window.Vectura.UI.motion.{ triggerBtnPulse, triggerSliderPulse,
 *                                        triggerThumbRelease, triggerDialWave,
 *                                        rafLoop }
 *
 * All triggers respect `prefers-reduced-motion` via Vectura.UI.utils.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const utils = () => UI.utils || {};
  const reduced = () => (utils().prefersReducedMotion ? utils().prefersReducedMotion() : false);

  /**
   * Add `.btn-pulse` to `el` and remove it after the keyframe completes so the
   * class can be re-added on the next click. Duration is the CSS variable
   * `--motion-btn-fade-dur` (per-skin manifest).
   */
  const triggerBtnPulse = (el) => {
    if (!el || !el.classList) return;
    el.classList.remove('btn-pulse');
    // Force a reflow so animation restarts when class is re-applied.
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth;
    el.classList.add('btn-pulse');
    const handle = (e) => {
      if (e.target !== el) return;
      el.classList.remove('btn-pulse');
      el.removeEventListener('animationend', handle);
    };
    el.addEventListener('animationend', handle);
  };

  /**
   * Adds `.fx-active` to a `.sld-fx-wrap` and removes it after the pulse so
   * subsequent slider events can retrigger it. Reduced-motion fall-through is
   * handled by motion.css.
   */
  const triggerSliderPulse = (wrapEl) => {
    if (!wrapEl || !wrapEl.classList) return;
    wrapEl.classList.remove('fx-active');
    void wrapEl.offsetWidth;
    wrapEl.classList.add('fx-active');
    const handle = (e) => {
      if (e.target !== wrapEl && !(e.target && e.target.matches && e.target.matches('.sld-fx-wrap'))) return;
      wrapEl.classList.remove('fx-active');
      wrapEl.removeEventListener('animationend', handle);
    };
    wrapEl.addEventListener('animationend', handle);
  };

  /**
   * Triggers the thumb-release halo on a `<input type="range">` slider.
   * Uses the `.just-released` class scoped to ::-webkit-slider-thumb in
   * components.css.
   */
  const triggerThumbRelease = (slider) => {
    if (!slider || !slider.classList) return;
    slider.classList.remove('just-released');
    void slider.offsetWidth;
    slider.classList.add('just-released');
    const handle = (e) => {
      if (e.target !== slider) return;
      slider.classList.remove('just-released');
      slider.removeEventListener('animationend', handle);
    };
    slider.addEventListener('animationend', handle);
  };

  /**
   * Plays a one-shot expanding-ring "wave" inside an `<svg.angle-dial>`. The
   * caller passes the SVG element plus the cx/cy in dial-local coordinates
   * (typically the center of the dial). Reduced motion → no-op.
   *
   * Reads timing/peak/maxR from CSS vars set by SkinManager.activate().
   * Returns a `{ cancel() }` handle; cancel removes the in-progress circle.
   */
  const triggerDialWave = (svg, cx = 0, cy = 0) => {
    if (reduced()) return { cancel() {} };
    if (!svg || svg.namespaceURI !== 'http://www.w3.org/2000/svg') return { cancel() {} };
    if (typeof window.requestAnimationFrame !== 'function') return { cancel() {} };

    const root = (typeof document !== 'undefined' && document.documentElement)
      ? getComputedStyle(document.documentElement)
      : null;
    const readVar = (name, fallback) => {
      if (!root) return fallback;
      const raw = root.getPropertyValue(name).trim();
      if (!raw) return fallback;
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : fallback;
    };
    const dur = readVar('--motion-dial-wave-dur', 520);
    const peak = readVar('--motion-dial-wave-peak', 0.63);
    const maxR = readVar('--motion-dial-wave-max-r', 24);

    const NS = 'http://www.w3.org/2000/svg';
    const ring = document.createElementNS(NS, 'circle');
    ring.setAttribute('cx', String(cx));
    ring.setAttribute('cy', String(cy));
    ring.setAttribute('r', '1');
    ring.setAttribute('fill', 'none');
    ring.setAttribute('stroke', 'var(--ui-accent, currentColor)');
    ring.setAttribute('stroke-width', '1.4');
    ring.setAttribute('opacity', String(peak));
    ring.classList.add('dial-wave-ring');
    svg.appendChild(ring);

    let start = 0;
    let frameId = 0;
    let cancelled = false;
    const tick = (now) => {
      if (cancelled) return;
      if (!start) start = now;
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 2.5);
      const r = 1 + (maxR - 1) * eased;
      const sw = 1.4 - 1.0 * eased;
      const opacity = peak * (1 - eased);
      ring.setAttribute('r', String(r));
      ring.setAttribute('stroke-width', String(Math.max(0.4, sw)));
      ring.setAttribute('opacity', String(opacity));
      if (t < 1) {
        frameId = window.requestAnimationFrame(tick);
      } else {
        ring.remove();
      }
    };
    frameId = window.requestAnimationFrame(tick);
    return {
      cancel() {
        cancelled = true;
        if (frameId && typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(frameId);
        }
        if (ring.parentNode) ring.remove();
      },
    };
  };

  /**
   * Tiny rAF loop helper for sliders/dials that need continuous updates while
   * dragging. `tick(t01, raw)` is called with t01 = elapsed/dur clamped to
   * [0, 1] and raw = elapsed ms. Returns a `{ cancel() }` handle.
   */
  const rafLoop = (durMs, tick) => {
    if (typeof window.requestAnimationFrame !== 'function' || typeof tick !== 'function') {
      return { cancel() {} };
    }
    let start = 0;
    let id = 0;
    let cancelled = false;
    const step = (now) => {
      if (cancelled) return;
      if (!start) start = now;
      const elapsed = now - start;
      const t = durMs > 0 ? Math.min(1, elapsed / durMs) : 1;
      tick(t, elapsed);
      if (t < 1) id = window.requestAnimationFrame(step);
    };
    id = window.requestAnimationFrame(step);
    return {
      cancel() {
        cancelled = true;
        if (id && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
      },
    };
  };

  UI.motion = { triggerBtnPulse, triggerSliderPulse, triggerThumbRelease, triggerDialWave, rafLoop };
})();
