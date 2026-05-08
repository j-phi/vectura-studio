/*
 * Vectura Studio — InfoBadge component (Phase 1).
 *
 * The small `(i)` circle that sits next to a control label (mockup `.info-badge`).
 * Hover/focus shows a tooltip with the help text. If `longContent` is provided
 * AND the tooltip is open, a "Read more" affordance opens the help-modal —
 * but the modal handoff is owned by the consumer (passed via `onOpenLong`).
 *
 * Props:
 *   text         — short tooltip text (always shown).
 *   longContent  — optional longer string; if present, tooltip appends a
 *                  "Read more" hint and clicking the badge calls onOpenLong.
 *   onOpenLong   — callback invoked when user clicks/Enters the badge with
 *                  longContent set. Receives no args.
 *   placement    — tooltip placement passed through to overlays.Tooltip.
 *
 * Returns: { el, update(newProps), destroy() }
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const create = (host, initialProps = {}) => {
    let props = Object.assign({ placement: 'top' }, initialProps);
    const utils = UI.utils || {};
    const overlays = (UI.overlays = UI.overlays || {});

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'info-badge';
    el.textContent = 'i';
    el.setAttribute('aria-label', props.text || 'Info');

    let tip = null;
    const ensureTip = () => {
      if (tip || !overlays.Tooltip) return tip;
      tip = overlays.Tooltip(document.body, { text: props.text, placement: props.placement });
      return tip;
    };

    const handlePointerEnter = () => {
      const t = ensureTip();
      if (!t) return;
      const text = props.longContent ? `${props.text}\n\n(Click for details)` : props.text;
      t.show(el, { text });
    };
    const handlePointerLeave = () => { if (tip) tip.hide(); };
    const handleFocus = handlePointerEnter;
    const handleBlur = handlePointerLeave;
    const handleClick = (event) => {
      if (props.longContent && typeof props.onOpenLong === 'function') {
        event.preventDefault();
        props.onOpenLong();
        if (tip) tip.hide({ delay: 0 });
      }
    };
    const handleKey = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        handleClick(event);
      }
    };

    const offEnter = utils.on ? utils.on(el, 'pointerenter', handlePointerEnter) : (el.addEventListener('pointerenter', handlePointerEnter), () => el.removeEventListener('pointerenter', handlePointerEnter));
    const offLeave = utils.on ? utils.on(el, 'pointerleave', handlePointerLeave) : (el.addEventListener('pointerleave', handlePointerLeave), () => el.removeEventListener('pointerleave', handlePointerLeave));
    const offFocus = utils.on ? utils.on(el, 'focus', handleFocus) : (el.addEventListener('focus', handleFocus), () => el.removeEventListener('focus', handleFocus));
    const offBlur = utils.on ? utils.on(el, 'blur', handleBlur) : (el.addEventListener('blur', handleBlur), () => el.removeEventListener('blur', handleBlur));
    const offClick = utils.on ? utils.on(el, 'click', handleClick) : (el.addEventListener('click', handleClick), () => el.removeEventListener('click', handleClick));
    const offKey = utils.on ? utils.on(el, 'keydown', handleKey) : (el.addEventListener('keydown', handleKey), () => el.removeEventListener('keydown', handleKey));

    if (host) host.appendChild(el);

    return {
      el,
      update(newProps) {
        props = Object.assign({}, props, newProps || {});
        el.setAttribute('aria-label', props.text || 'Info');
        if (tip) tip.update({ text: props.text, placement: props.placement });
      },
      destroy() {
        offEnter(); offLeave(); offFocus(); offBlur(); offClick(); offKey();
        if (tip) { tip.destroy(); tip = null; }
        if (el.parentNode) el.parentNode.removeChild(el);
      },
    };
  };

  UI.InfoBadge = create;
})();
