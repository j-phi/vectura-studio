/**
 * Vectura pane-state controller (TUX-008).
 *
 * Pure per-layout state machine for the two side panes. No DOM work. workspace.js feeds it the
 * layout, reads the result and writes the classes, the backdrop and the CSS variables.
 *
 * Layouts (the model layout, see workspace.js):
 *   'desktop' | 'touch-wide'  docked panes. Each pane is open or collapsed. The state persists.
 *                             desktop keeps leftPaneCollapsed / rightPaneCollapsed.
 *                             touch-wide keeps touchWideLeftPaneCollapsed / touchWideRightPaneCollapsed.
 *   'tablet' | 'phone'        drawers. At most one pane is open. Both start closed and nothing persists.
 *
 * A drawer closes on a layout-class TRANSITION into tablet or phone, never on a same-class resize.
 * iOS fires several resize events for one rotation, so a repeated setLayout(sameLayout) is a no-op.
 *
 * `overlay` marks a docked layout whose panes are drawn as overlays (fine pointer, 540-900 px).
 * Opening one overlay pane collapses the other, as the legacy shell did.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const KEYS = {
    desktop: { left: 'leftPaneCollapsed', right: 'rightPaneCollapsed' },
    'touch-wide': { left: 'touchWideLeftPaneCollapsed', right: 'touchWideRightPaneCollapsed' },
  };
  const SIDES = ['left', 'right'];
  const isDrawerLayout = (layout) => layout === 'tablet' || layout === 'phone';
  const other = (side) => (side === 'left' ? 'right' : 'left');
  const normalize = (layout) => (layout === 'tablet' || layout === 'phone' || layout === 'touch-wide' ? layout : 'desktop');

  /**
   * @param {object} opts
   * @param {string} [opts.layout]     initial layout
   * @param {boolean} [opts.overlay]   docked panes are overlays
   * @param {object} [opts.prefs]      saved flags, e.g. { leftPaneCollapsed: true }
   * @param {function} [opts.persist]  persist(key, collapsedBoolean). Called for docked layouts only.
   * @param {function} [opts.onChange] onChange(snapshot) after every state change
   */
  const create = (opts = {}) => {
    const prefs = opts.prefs || {};
    const persist = typeof opts.persist === 'function' ? opts.persist : () => {};
    const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    let layout = normalize(opts.layout);
    let overlay = opts.overlay === true;

    const docked = {};
    Object.keys(KEYS).forEach((name) => {
      docked[name] = {
        left: prefs[KEYS[name].left] !== true,
        right: prefs[KEYS[name].right] !== true,
      };
    });
    const drawer = { tablet: null, phone: null };
    // Overlay Reset View shows one pane without persisting: the hidden side is only held shut while
    // the overlay band lasts. Leaving the band, or any explicit open/close, releases the hold.
    let held = null;

    const snapshot = () => ({
      layout,
      overlay,
      left: isOpen('left'),
      right: isOpen('right'),
    });
    const changed = () => onChange(snapshot());

    function isOpen(side) {
      if (isDrawerLayout(layout)) return drawer[layout] === side;
      return docked[layout][side] === true;
    }

    const setDocked = (side, open) => {
      // A Reset View hold is memory-only: restore the held side before dropping it, unless this call targets it.
      if (held && docked[held.layout] && held.side !== side) docked[held.layout][held.side] = true;
      held = null;
      docked[layout][side] = open;
      persist(KEYS[layout][side], !open);
    };

    const open = (side) => {
      if (!SIDES.includes(side)) return;
      if (isDrawerLayout(layout)) {
        drawer[layout] = side;
      } else {
        if (overlay && docked[layout][other(side)]) setDocked(other(side), false);
        setDocked(side, true);
      }
      changed();
    };

    const close = (side) => {
      if (!SIDES.includes(side)) return;
      if (isDrawerLayout(layout)) {
        if (drawer[layout] === side) drawer[layout] = null;
      } else {
        setDocked(side, false);
      }
      changed();
    };

    const toggle = (side) => {
      if (isOpen(side)) close(side);
      else open(side);
    };

    const closeAll = () => {
      if (isDrawerLayout(layout)) drawer[layout] = null;
      else SIDES.forEach((side) => setDocked(side, false));
      changed();
    };

    // Reset View / Clear preferences: drawers close, docked panes open (persisted per layout).
    const resetForLayout = () => {
      if (isDrawerLayout(layout)) drawer[layout] = null;
      else SIDES.forEach((side) => setDocked(side, true));
      changed();
    };

    // Reset View in the overlay band: both panes reset to open and persist, then one overlay pane
    // shows. The other pane is held shut in memory only, so no collapse reaches the saved prefs.
    const resetOverlay = (side) => {
      resetForLayout();
      if (isDrawerLayout(layout) || !overlay || !SIDES.includes(side)) return;
      docked[layout][other(side)] = false;
      held = { layout, side: other(side) };
      changed();
    };

    /**
     * Feed the current layout. Returns true when the layout class changed.
     * Entering a drawer layout closes both drawers. Entering a docked layout shows its stored state.
     * The same layout again only updates `overlay`.
     */
    const setLayout = (next, flags = {}) => {
      const to = normalize(next);
      const wasOverlay = overlay;
      if (typeof flags.overlay === 'boolean') overlay = flags.overlay;
      if (held && (to !== layout || (wasOverlay && !overlay))) {
        if (docked[held.layout]) docked[held.layout][held.side] = true;
        held = null;
        if (to === layout) { changed(); return false; }
      }
      if (to === layout) return false;
      layout = to;
      if (isDrawerLayout(to)) drawer[to] = null;
      changed();
      return true;
    };

    return {
      layout: () => layout,
      isDrawer: () => isDrawerLayout(layout),
      isOpen,
      open,
      close,
      toggle,
      closeAll,
      resetForLayout,
      resetOverlay,
      setLayout,
      snapshot,
    };
  };

  const PaneState = { create, KEYS, isDrawerLayout };
  UI.PaneState = PaneState;
  if (typeof module !== 'undefined' && module.exports) module.exports = PaneState;
})();
