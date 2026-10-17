/*
 * Vectura Studio — reset-by-long-press (TUX-038).
 *
 * A mouse resets a control with a double-click. A finger has no reliable double-click on a
 * 4 px slider band, so a touch or pen long-press on the control's LABEL opens a one-item menu,
 * "Reset to default". The label is the hold target on purpose: a press on the band or the value
 * chip starts a drag or an edit (TUX-043), never a hold. The hold never resets by itself.
 *
 * API (window.Vectura.UI):
 *   attachResetHold(labelEl, { reset, getDefault?, label? }) -> unbind()
 *     reset()       runs when the person picks "Reset to default". Required.
 *     getDefault()  optional. A null or undefined result means "no default": the hold opens nothing.
 *     label         optional. Names the control in the menu's aria-label.
 *   findResetLabel(host, explicit?) -> Element | null
 *     explicit when given, else the host's only `.control-label`. More than one label in the host
 *     is ambiguous, so it returns null and the call site passes `labelEl`.
 *
 * It uses UI.TouchHold (TUX-034): 500 ms, 10 px slop, ring at 150 ms, touch and pen only. A mouse
 * pointer is never handled, so mouse behaviour is unchanged.
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  let menu = null;
  let anchor = null;
  let current = null; // { reset } of the open menu

  const ensureMenu = () => {
    if (menu) return menu;
    if (!UI.overlays || !UI.overlays.Menu) return null;
    menu = UI.overlays.Menu(document.body, {
      items: [{ key: 'reset', label: 'Reset to default' }],
      onSelect: () => {
        const c = current;
        current = null;
        if (menu) menu.close();
        if (c && typeof c.reset === 'function') c.reset();
      },
    });
    menu.el.classList.add('reset-hold-menu', 'is-context-menu', 'is-touch');
    return menu;
  };

  const openAt = (x, y, opts) => {
    const m = ensureMenu();
    if (!m) return;
    current = { reset: opts.reset };
    m.el.setAttribute('aria-label', opts.label ? `${opts.label}: reset` : 'Reset control');
    if (!anchor) {
      anchor = document.createElement('div');
      anchor.id = 'vectura-reset-hold-anchor';
      anchor.style.cssText = 'position:fixed;width:1px;height:1px;pointer-events:none;opacity:0;';
      document.body.appendChild(anchor);
    }
    anchor.style.left = `${x}px`;
    anchor.style.top = `${y}px`;
    if (m.isOpen()) m.close();
    m.open(anchor);
    // The shared touch placement (layer context menu): clear of the finger, inside the visual viewport.
    const LC = UI.Menus && UI.Menus.LayerContext;
    if (LC && typeof LC.placeForTouch === 'function') LC.placeForTouch(m, x, y);
  };

  const attachResetHold = (labelEl, opts = {}) => {
    const noop = () => {};
    if (!labelEl || typeof opts.reset !== 'function') return noop;
    if (!UI.TouchHold || typeof UI.TouchHold.bind !== 'function') return noop;
    if (labelEl._vecturaResetHold) return labelEl._vecturaResetHold;
    labelEl.setAttribute('data-reset-hold', '');
    const unbind = UI.TouchHold.bind(labelEl, {
      selector: '[data-reset-hold]',
      resolve: () => ({ key: 'reset', anchorEl: labelEl }),
      onFire: ({ x, y }) => {
        if (typeof opts.getDefault === 'function') {
          const d = opts.getDefault();
          if (d === undefined || d === null) return;
        }
        openAt(x, y, opts);
      },
    });
    const off = () => {
      unbind();
      labelEl.removeAttribute('data-reset-hold');
      labelEl._vecturaResetHold = null;
    };
    labelEl._vecturaResetHold = off;
    return off;
  };

  const findResetLabel = (host, explicit) => {
    if (explicit) return explicit;
    if (!host || typeof host.querySelectorAll !== 'function') return null;
    const labels = host.querySelectorAll('.control-label');
    return labels.length === 1 ? labels[0] : null;
  };

  UI.attachResetHold = attachResetHold;
  UI.findResetLabel = findResetLabel;
})();
