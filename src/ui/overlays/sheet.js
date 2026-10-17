/*
 * Vectura Studio — Sheet (TUX-026 / TUX-046).
 *
 * Shared placement for floating windows and full-screen sheets. The CSS half of a sheet lives in
 * components.css (.vt-sheet slots, the phone full-screen rules). This module is the JS half:
 *
 *   Sheet.isPhone()                       true when the layout classifier says 'phone' (body.phone-layout)
 *   Sheet.bounds({ margin, minTop })      usable rect inside the visual viewport, safe-area insets and margin;
 *                                         minTop keeps a floating window below a fixed app header
 *   Sheet.clampFloating(el, { left, top, margin })
 *                                         size-limit el to the bounds, move it to (left, top) clamped so the
 *                                         whole box stays inside. Returns the final rect.
 *   Sheet.watch(cb)                       call cb on window resize, orientationchange, visual-viewport
 *                                         resize/scroll and layout-class changes. Returns an unsubscribe.
 *
 * The visual viewport is read through KeyboardInset (the single reader). Never size a window with
 * 100vh/100vw: they include the iOS toolbar.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const MARGIN = 12;

  const isPhone = () => !!(document.body && document.body.classList.contains('phone-layout'));

  // env(safe-area-inset-*) has no JS API. Read it through a throwaway element's computed padding.
  const safeInsets = () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;'
      + 'padding:var(--safe-top, env(safe-area-inset-top, 0px)) var(--safe-right, env(safe-area-inset-right, 0px)) '
      + 'var(--safe-bottom, env(safe-area-inset-bottom, 0px)) var(--safe-left, env(safe-area-inset-left, 0px));';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v) => parseFloat(v) || 0;
    const out = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
    probe.remove();
    return out;
  };

  const bounds = ({ margin = MARGIN, minTop = null } = {}) => {
    const KI = Vectura.KeyboardInset;
    const vp = KI && KI.viewportRect
      ? KI.viewportRect()
      : { width: window.innerWidth, height: window.innerHeight, offsetTop: 0, offsetLeft: 0 };
    const inset = safeInsets();
    const minX = vp.offsetLeft + inset.left + margin;
    const minY = Math.max(vp.offsetTop + inset.top + margin, Number.isFinite(minTop) ? minTop + margin : -Infinity);
    const maxX = vp.offsetLeft + vp.width - inset.right - margin;
    const maxY = vp.offsetTop + vp.height - inset.bottom - margin;
    return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
  };

  const clampFloating = (el, { left = null, top = null, margin = MARGIN, minTop = null } = {}) => {
    if (!el) return null;
    const b = bounds({ margin, minTop });
    el.style.maxWidth = `${Math.floor(b.width)}px`;
    el.style.maxHeight = `${Math.floor(b.height)}px`;
    const rect = el.getBoundingClientRect();
    const wantLeft = Number.isFinite(left) ? left : rect.left;
    const wantTop = Number.isFinite(top) ? top : rect.top;
    const x = Math.min(Math.max(wantLeft, b.minX), Math.max(b.minX, b.maxX - rect.width));
    const y = Math.min(Math.max(wantTop, b.minY), Math.max(b.minY, b.maxY - rect.height));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    return el.getBoundingClientRect();
  };

  // Release the inline placement so the stylesheet (phone full-screen rule) owns the box.
  const clearFloating = (el) => {
    if (!el) return;
    ['left', 'top', 'maxWidth', 'maxHeight'].forEach((k) => { el.style[k] = ''; });
  };

  const watch = (cb) => {
    if (typeof cb !== 'function') return () => {};
    const KI = Vectura.KeyboardInset;
    window.addEventListener('resize', cb);
    window.addEventListener('orientationchange', cb);
    window.addEventListener('vectura:layoutchange', cb);
    const offViewport = KI && KI.onViewportChange ? KI.onViewportChange(cb, { scroll: true }) : null;
    return () => {
      window.removeEventListener('resize', cb);
      window.removeEventListener('orientationchange', cb);
      window.removeEventListener('vectura:layoutchange', cb);
      if (typeof offViewport === 'function') offViewport();
    };
  };

  UI.overlays.Sheet = { isPhone, safeInsets, bounds, clampFloating, clearFloating, watch };
})();
