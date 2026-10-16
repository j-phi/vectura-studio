/*
 * Vectura Studio — Toast overlay (Phase 1).
 *
 * Lightweight notification surface. Singleton container hosts a stack of
 * dismissable toasts. Use cases per plan §3 Phase 3: layer-add success,
 * project save/load result, export complete, error states.
 *
 * Public API:
 *   const toast = UI.overlays.Toast.show({ message, variant, duration });
 *   toast.dismiss()
 *
 * Props:
 *   message  — string. Required.
 *   variant  — 'info' | 'success' | 'warning' | 'danger'. Default 'info'.
 *   duration — ms before auto-dismiss. Default 4000. 0 disables.
 *   onClick(toast) — optional click handler (whole-toast click).
 *   action   — { label, onAction, ariaLabel }. TUX-037: appends a real
 *              <button data-action="undo">. Only the button runs onAction (then
 *              dismisses); a click on the toast body does nothing. Default
 *              duration becomes 6000 when an action is set.
 *
 * Returns: { el, dismiss, update, disableAction }
 *
 * Undo helper (TUX-037): Toast.undoable({ app, label, token }) — see below.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});
  UI.overlays = UI.overlays || {};

  const ROLE = {
    info: 'status',
    success: 'status',
    warning: 'alert',
    danger: 'alert',
  };

  const ensureContainer = (ownerDoc) => {
    let host = ownerDoc.getElementById('vectura-toast-host');
    if (host) return host;
    host = ownerDoc.createElement('div');
    host.id = 'vectura-toast-host';
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', 'Notifications');
    // TUX-037/048: every visual and positional rule lives in skin CSS (components.css, TUX-048 block).
    host.className = 'vectura-toast-host';
    ownerDoc.body.appendChild(host);
    return host;
  };

  // TUX-048: bottom-docked chrome the touch toast must clear. Same list as tests/e2e/touch/toasts.spec.js.
  // Measured (not hard-coded) because the modifier bar moves per layout (bottom on phones, floating top on iPad landscape).
  const BOTTOM_CHROME = '#tool-bar, #touch-modifier-bar, #status-bar, #bottom-pane:not(.bottom-pane-collapsed)';
  // The collapsed bottom pane is a small strip (the expand button). It counts as chrome only where the toast can reach it:
  // within half of the widest toast (max-width 320 px) of the centre line. On a short phone it sits left of the toast.
  const COLLAPSED_CHROME = '#bottom-pane.bottom-pane-collapsed, #btn-pane-toggle-bottom';
  const TOAST_HALF_SPAN = 168;
  const positionHost = (host) => {
    const ownerDoc = host.ownerDocument;
    const view = ownerDoc.defaultView;
    if (!ownerDoc.body.classList.contains('touch-ui') || !view) return;
    let clear = 0;
    try {
      const KI = Vectura.KeyboardInset;
      const vr = KI && KI.viewportRect ? KI.viewportRect() : { height: view.innerHeight, offsetTop: 0 };
      const midY = vr.offsetTop + vr.height / 2;
      const cx = (vr.offsetLeft || 0) + (vr.width !== undefined ? vr.width : view.innerWidth) / 2;
      ownerDoc.querySelectorAll(`${BOTTOM_CHROME}, ${COLLAPSED_CHROME}`).forEach((e) => {
        const cs = view.getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || r.width <= 0 || r.height <= 0) return;
        // On touch-wide the status strip is a non-interactive overlay on the canvas (Q17); a toast may cover it.
        const strip = e.closest ? e.closest('.hud-bar') : null;
        if (strip && ownerDoc.body.classList.contains('touch-wide-layout') && view.getComputedStyle(strip).pointerEvents === 'none') return;
        if (e.matches(COLLAPSED_CHROME) && (r.right < cx - TOAST_HALF_SPAN || r.left > cx + TOAST_HALF_SPAN)) return;
        if (r.top > midY) clear = Math.max(clear, view.innerHeight - r.top);
      });
    } catch (_) { /* layout probe is best effort */ }
    host.style.setProperty('--toast-bottom', `${Math.max(0, Math.round(clear))}px`);
  };
  let vvBound = false;
  const bindViewport = (host) => {
    const KI = Vectura.KeyboardInset;
    if (vvBound || !KI || !KI.onViewportChange) return;
    vvBound = true;
    KI.onViewportChange(() => { if (host.childElementCount) positionHost(host); }, { scroll: true });
  };

  const show = (props) => {
    const ownerDoc = document;
    const variant = props && props.variant ? props.variant : 'info';
    const action = props && props.action && typeof props.action.onAction === 'function' ? props.action : null;
    const duration = props && Number.isFinite(props.duration) ? props.duration : (action ? 6000 : 4000);
    const host = ensureContainer(ownerDoc);
    positionHost(host);
    bindViewport(host);

    const el = ownerDoc.createElement('div');
    el.className = `vectura-toast vectura-toast-${variant}`;
    el.setAttribute('role', ROLE[variant] || 'status');
    el.setAttribute('aria-live', variant === 'danger' || variant === 'warning' ? 'assertive' : 'polite');
    if (action || (props && typeof props.onClick === 'function')) el.classList.add('is-actionable');
    let msgEl = null;
    let actionBtn = null;
    if (action) {
      el.classList.add('has-action');
      msgEl = ownerDoc.createElement('span');
      msgEl.className = 'vectura-toast-msg';
      msgEl.textContent = (props && props.message) || '';
      el.appendChild(msgEl);
    } else {
      el.textContent = (props && props.message) || '';
    }
    host.appendChild(el);

    let dismissed = false;
    let timer = 0;
    let pausedAt = 0;
    let remaining = duration;
    let startedAt = Date.now();

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      if (timer) clearTimeout(timer);
      ownerDoc.removeEventListener('pointerup', endPress, true);
      ownerDoc.removeEventListener('pointercancel', endPress, true);
      if (el.parentNode) el.parentNode.removeChild(el);
    };

    let hovered = false;
    let focused = false;
    let pressed = false;

    const startAuto = () => {
      if (duration <= 0) return;
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
    };

    const pause = () => {
      if (!timer) return;
      pausedAt = Date.now();
      remaining -= pausedAt - startedAt;
      clearTimeout(timer);
      timer = 0;
    };
    const resume = () => {
      if (hovered || focused || pressed) return;
      if (timer || remaining <= 0 || dismissed) return;
      startAuto();
    };
    // Separate hover / focus / press flags: the timer runs only when none is active.
    const setFlag = (name, on) => {
      if (name === 'hover') hovered = on;
      else if (name === 'focus') focused = on;
      else pressed = on;
      if (on) pause(); else resume();
    };

    // Hover pause is for a real mouse only. A touch tap fires compat mouseenter with
    // no mouseleave, which would freeze the timer forever, so those are ignored.
    let touched = false;
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') touched = false; });
    el.addEventListener('mouseenter', () => { if (!touched) setFlag('hover', true); });
    el.addEventListener('mouseleave', () => setFlag('hover', false));
    el.addEventListener('focusin', () => setFlag('focus', true));
    el.addEventListener('focusout', () => setFlag('focus', false));
    el.addEventListener('focus', () => setFlag('focus', true));
    el.addEventListener('blur', () => setFlag('focus', false));
    // A held finger pauses the timer like hover does for a mouse (TUX-037). The release
    // may land off the toast, so listen on the document until it ends.
    const endPress = () => {
      ownerDoc.removeEventListener('pointerup', endPress, true);
      ownerDoc.removeEventListener('pointercancel', endPress, true);
      setFlag('press', false);
    };
    el.addEventListener('pointerdown', (e) => {
      touched = !!e.pointerType && e.pointerType !== 'mouse';
      if (touched) { hovered = false; }
      ownerDoc.addEventListener('pointerup', endPress, true);
      ownerDoc.addEventListener('pointercancel', endPress, true);
      setFlag('press', true);
    });
    el.addEventListener('pointerup', endPress);
    el.addEventListener('pointercancel', endPress);
    if (action) {
      actionBtn = ownerDoc.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'vectura-toast-action';
      actionBtn.setAttribute('data-action', 'undo');
      actionBtn.textContent = action.label || 'Undo';
      if (action.ariaLabel) actionBtn.setAttribute('aria-label', action.ariaLabel);
      actionBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (actionBtn.disabled) return;
        try { action.onAction({ dismiss, disableAction }); } finally { dismiss(); }
      });
      el.appendChild(actionBtn);
      // Body click is inert for action toasts (a stray tap must not dismiss or act).
      el.addEventListener('click', (ev) => ev.stopPropagation());
    } else {
      el.addEventListener('click', () => {
        if (props && typeof props.onClick === 'function') props.onClick({ dismiss });
        dismiss();
      });
    }

    function disableAction() {
      if (!actionBtn) return;
      actionBtn.disabled = true;
      actionBtn.setAttribute('aria-disabled', 'true');
    }

    startAuto();
    return {
      el,
      dismiss,
      disableAction,
      update(newProps) {
        if (newProps && typeof newProps.message === 'string') (msgEl || el).textContent = newProps.message;
      },
    };
  };

  // TUX-037: one Undo toast at a time. `token` is the history snapshot the delete
  // just pushed; Undo only runs while that snapshot is still the top entry.
  let current = null;
  const undoable = ({ app, label, token, ariaLabel }) => {
    if (current) { current.dismiss(); current = null; }
    const hist = app && app.history;
    // maxHistory 1 (or an empty stack) leaves nothing to undo to: plain toast.
    const canUndo = Array.isArray(hist) && hist.length >= 2 && token && hist[hist.length - 1] === token;
    if (!canUndo) {
      current = show({ message: label });
      return current;
    }
    let t = null;
    t = show({
      message: label,
      action: {
        label: 'Undo',
        ariaLabel: ariaLabel || `Undo ${label.replace(/^Deleted/, 'delete')}`.trim(),
        onAction: ({ disableAction: off }) => {
          const h = app.history;
          if (!Array.isArray(h) || h[h.length - 1] !== token) { off(); return; }
          const ui = app.ui;
          if (ui && typeof ui.triggerTopMenuAction === 'function') ui.triggerTopMenuAction('btn-undo');
          else app.undo();
        },
      },
    });
    t.el.setAttribute('role', 'status');
    t.el.setAttribute('aria-live', 'polite');
    const dismissOrig = t.dismiss;
    t.dismiss = () => { if (current === t) current = null; dismissOrig(); };
    // Stale: another history entry landed, so Undo would revert the wrong step.
    const isStale = () => !(app.history && app.history[app.history.length - 1] === token);
    const btn = t.el.querySelector('[data-action="undo"]');
    if (btn) btn.addEventListener('pointerdown', () => { if (isStale()) t.disableAction(); }, true);
    current = t;
    return t;
  };

  UI.overlays.Toast = { show, undoable };
})();
