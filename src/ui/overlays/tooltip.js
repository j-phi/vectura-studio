/*
 * Vectura Studio — Tooltip overlay (Phase 1).
 *
 * Lightweight hover-/focus-driven tooltip. Used by info-badge and any other
 * element that wants help text on hover. Long content can opt into a
 * "Read more" affordance that opens a modal — that linkage lives at the
 * info-badge layer; this overlay is content-agnostic.
 *
 * Public API:
 *   const tip = UI.overlays.Tooltip(host, props);
 *   tip.show(target, opts), tip.hide(), tip.update({...}), tip.destroy()
 *
 * Props:
 *   text            — string; required for show().
 *   placement       — 'top' | 'bottom' | 'left' | 'right'. Default 'top'.
 *   maxWidth        — px; default 240.
 *   delayShow       — ms hover delay before showing. Default 200.
 *   delayHide       — ms after pointerleave before hiding. Default 80.
 *   margin          — px gap between target and tip. Default 6.
 *
 * The overlay is a single root element that gets reused across show()/hide()
 * pairs. It positions relative to viewport using getBoundingClientRect() and
 * collides with viewport edges by flipping placement.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const DEFAULTS = { placement: 'top', maxWidth: 240, delayShow: 200, delayHide: 80, margin: 6 };

  const create = (host, initialProps = {}) => {
    let props = Object.assign({}, DEFAULTS, initialProps);
    const ownerDoc = (host && host.ownerDocument) || document;

    const el = ownerDoc.createElement('div');
    el.className = 'vectura-tooltip';
    el.setAttribute('role', 'tooltip');
    el.style.cssText = [
      'position: fixed',
      'z-index: 9999',
      'max-width: ' + props.maxWidth + 'px',
      'padding: 6px 10px',
      'background: var(--ui-panel, #252525)',
      'color: var(--ui-text, #e0e0e0)',
      'border: 1px solid var(--ui-border, #333)',
      'border-radius: var(--radius-sm, 4px)',
      'font-family: var(--font-ui, system-ui, sans-serif)',
      'font-size: var(--font-size-xs, 10px)',
      'line-height: 1.4',
      'pointer-events: none',
      'opacity: 0',
      'visibility: hidden',
      'transition: opacity 0.12s, visibility 0s linear 0.12s',
    ].join(';');
    (host || ownerDoc.body).appendChild(el);

    let showTimer = 0;
    let hideTimer = 0;
    let visible = false;
    let currentTarget = null;

    const reposition = () => {
      if (!currentTarget) return;
      const rect = currentTarget.getBoundingClientRect();
      const tipRect = el.getBoundingClientRect();
      const win = ownerDoc.defaultView || window;
      const vw = win.innerWidth || ownerDoc.documentElement.clientWidth || 1024;
      const vh = win.innerHeight || ownerDoc.documentElement.clientHeight || 768;
      const margin = Number.isFinite(props.margin) ? props.margin : 6;

      let placement = props.placement;
      let top = 0;
      let left = 0;

      const compute = (p) => {
        if (p === 'top') {
          top = rect.top - tipRect.height - margin;
          left = rect.left + (rect.width - tipRect.width) / 2;
        } else if (p === 'bottom') {
          top = rect.bottom + margin;
          left = rect.left + (rect.width - tipRect.width) / 2;
        } else if (p === 'left') {
          top = rect.top + (rect.height - tipRect.height) / 2;
          left = rect.left - tipRect.width - margin;
        } else if (p === 'right') {
          top = rect.top + (rect.height - tipRect.height) / 2;
          left = rect.right + margin;
        }
      };
      compute(placement);

      // Edge-flip if off-screen.
      if (top < 0 && placement === 'top') { placement = 'bottom'; compute(placement); }
      else if (top + tipRect.height > vh && placement === 'bottom') { placement = 'top'; compute(placement); }
      else if (left < 0 && placement === 'left') { placement = 'right'; compute(placement); }
      else if (left + tipRect.width > vw && placement === 'right') { placement = 'left'; compute(placement); }

      // Clamp horizontally so we don't run off either edge.
      if (left < margin) left = margin;
      if (left + tipRect.width > vw - margin) left = vw - margin - tipRect.width;
      if (top < margin) top = margin;
      // TUX-039: a tip placed below a bottom-edge target must not run off the bottom.
      if (top + tipRect.height > vh - margin) top = vh - margin - tipRect.height;

      el.style.top = top + 'px';
      el.style.left = left + 'px';
      el.dataset.placement = placement;
    };

    const reveal = () => {
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      el.style.transitionDelay = '0s';
      visible = true;
      reposition();
    };

    const conceal = () => {
      el.style.opacity = '0';
      el.style.visibility = 'hidden';
      visible = false;
      currentTarget = null;
    };

    const show = (target, opts = {}) => {
      if (!target) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = 0; }
      currentTarget = target;
      const delay = Number.isFinite(opts.delay) ? opts.delay : props.delayShow;
      el.textContent = (opts.text != null ? opts.text : props.text) || '';
      if (opts.maxWidth) el.style.maxWidth = opts.maxWidth + 'px';
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(reveal, delay);
    };

    const hide = (opts = {}) => {
      if (showTimer) { clearTimeout(showTimer); showTimer = 0; }
      const delay = Number.isFinite(opts.delay) ? opts.delay : props.delayHide;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(conceal, delay);
    };

    return {
      el,
      show,
      hide,
      reposition,
      isVisible: () => visible,
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        if (newProps && newProps.maxWidth) el.style.maxWidth = newProps.maxWidth + 'px';
      },
      destroy() {
        if (showTimer) clearTimeout(showTimer);
        if (hideTimer) clearTimeout(hideTimer);
        if (el.parentNode) el.parentNode.removeChild(el);
        currentTarget = null;
      },
    };
  };

  UI.overlays.Tooltip = create;

  // ── TUX-039: touch tooltip ─────────────────────────────────────────────────────────────
  // A 500 ms touch hold on an icon-only button shows its aria-label next to it. The hold
  // itself (timer, ring, pop, haptic, click swallow, native contextmenu guard) is the shared
  // TouchHold recogniser: this module owns no timer for it. Mouse and pen never reach it.
  // One shared Tooltip instance. The name comes from aria-label, never title.
  const TIP_ID = 'vectura-touch-tip';
  const HIDE_AFTER_LIFT_MS = 1500;
  const EXCLUDE = [
    '[data-has-submenu]',          // variant tools own a hold menu (TUX-014)
    '[data-tool="algo-draw"]',     // owns a picker hold
    '.toolbar-drag-handle',
    '.lvl-grip',                   // reorder handle: the drag must stay live
    '.layer-grip',
    '.pen-grip',
    '.noise-grip',
    '.optimization-grip',
    '.ctxbar-handle',
    '.mobile-pane-handle',
    '[data-no-hold-tip]',
    '.num-step',
    '[data-repeat]',
    '[disabled]',
  ].join(',');

  const TouchTooltip = (() => {
    let tip = null;
    let held = null;
    let hideTimer = 0;
    let installed = false;

    const stripShortcut = (label) => String(label || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Rendered text, not textContent: on phones a hidden label span still sits in textContent
    // while the button shows only a glyph. innerText skips display:none descendants.
    const renderedText = (btn) => (typeof btn.innerText === 'string' ? btn.innerText : btn.textContent) || '';
    const isIconOnly = (btn) => !/\p{L}/u.test(renderedText(btn));

    const resolve = (btn) => {
      if (!btn.getAttribute('aria-label') || btn.matches(EXCLUDE) || !isIconOnly(btn)) return null;
      return { key: btn.getAttribute('aria-label'), anchorEl: btn };
    };

    const placementFor = (btn) => {
      const r = btn.getBoundingClientRect();
      if (r.left + r.width / 2 < window.innerWidth / 3) return 'right';
      return 'top';
    };

    const hideNow = () => {
      clearTimeout(hideTimer);
      hideTimer = 0;
      if (held) { held.removeAttribute('aria-describedby'); held = null; }
      if (tip) tip.hide({ delay: 0 });
    };

    const scheduleHide = () => {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideNow, HIDE_AFTER_LIFT_MS);
    };

    const show = (btn) => {
      if (!tip) {
        tip = create(document.body, { delayShow: 0, margin: 10, maxWidth: 220 });
        tip.el.id = TIP_ID;
      }
      hideNow();
      held = btn;
      btn.setAttribute('aria-describedby', TIP_ID);
      tip.update({ placement: placementFor(btn) });
      tip.show(btn, { delay: 0, text: stripShortcut(btn.getAttribute('aria-label')) });
      // Lift or cancel: keep the tip a moment. Any new pointerdown hides it at once.
      const onEnd = () => {
        document.removeEventListener('pointerup', onEnd, true);
        document.removeEventListener('pointercancel', onEnd, true);
        scheduleHide();
      };
      document.addEventListener('pointerup', onEnd, true);
      document.addEventListener('pointercancel', onEnd, true);
    };

    const install = () => {
      if (installed) return;
      const TH = UI.TouchHold;
      if (!TH || typeof TH.bind !== 'function' || !document.body) return;
      installed = true;
      TH.bind(document.body, {
        selector: 'button[aria-label]',
        pointerTypes: ['touch'],
        capture: true,
        resolve,
        onFire: ({ target }) => show(target),
      });
      document.addEventListener('pointerdown', () => { if (held) hideNow(); }, true);
    };

    return { install, stripShortcut, _resolve: resolve };
  })();

  UI.overlays.TouchTooltip = TouchTooltip;
  if (typeof window !== 'undefined') {
    if (document.readyState === 'complete') TouchTooltip.install();
    else window.addEventListener('load', () => TouchTooltip.install());
  }
})();
