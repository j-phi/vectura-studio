/**
 * Vectura workspace (Phase 2 step 3 fifth extraction from src/ui/ui.js).
 *
 * Exposes window.Vectura.UI.Workspace — the workspace pane layout management:
 * initPaneToggles() (responsive pane collapse/expand, auto-collapse at
 * breakpoints, mobile bottom-pane modifier-bar relocation) and
 * initPaneResizers() (left/right pane drag-resize with persist).
 *
 * Closure-captured legacy IIFE locals (getEl) are injected once via
 * Workspace.bind(deps) from the legacy ui.js IIFE. SETTINGS comes from
 * window.Vectura.SETTINGS at call time.
 *
 * Compile gate at tests/unit/workspace-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`Workspace.${name} invoked before Workspace.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function initPaneToggles() {
    const { getEl } = requireDeps('initPaneToggles');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const leftPane = getEl('left-pane');
    const rightPane = getEl('right-pane');
    const bottomPane = getEl('bottom-pane');
    const leftBtn = getEl('btn-pane-toggle-left');
    const rightBtn = getEl('btn-pane-toggle-right');
    const mobileLeftBtn = getEl('btn-mobile-pane-left');
    const mobileRightBtn = getEl('btn-mobile-pane-right');
    // TUX-010: phone header openers (index.html, inside .header-phone-actions).
    const headerLeftBtn = getEl('btn-header-pane-left');
    const headerRightBtn = getEl('btn-header-pane-right');
    if (!leftPane || !rightPane || !leftBtn || !rightBtn) return;

    if (bottomPane && SETTINGS.bottomPaneCollapsed === true) bottomPane.classList.add('bottom-pane-collapsed');

    // TUX-006: layout class comes from Vectura.LayoutClassifier (phone/tablet = mobile-layout).
    const LC = () => (G.Vectura && G.Vectura.LayoutClassifier) || null;
    const PS = () => (UI.PaneState) || null;

    // TUX-008: the docked pane width never grows past TOUCH_LAYOUT.maxDockedPaneWidth on touch-wide.
    // CSS applies the clamp (min(var(--pane-*-width), var(--touch-wide-pane-max))), so a saved desktop
    // width is never rewritten. Pushed here so config stays the only place that holds the number.
    // Effective docked caps for the current width (see TOUCH_LAYOUT in defaults.js).
    const dockCaps = () => {
      const TL = G.Vectura.TOUCH_LAYOUT || {};
      const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
      if (num(TL.roomyMinWidth) && window.innerWidth >= TL.roomyMinWidth && num(TL.maxDockedRoomyPaneWidth)) {
        return { left: Number(TL.maxDockedRoomyPaneWidth), right: Number(TL.maxDockedRoomyPaneWidth) };
      }
      const left = num(TL.maxDockedPaneWidth);
      if (!left) return null;
      return { left, right: Math.min(left, num(TL.maxDockedRightPaneWidth) || left) };
    };
    const applyDockCaps = () => {
      const caps = dockCaps();
      if (!caps) return;
      document.documentElement.style.setProperty('--touch-wide-pane-max', `${caps.left}px`);
      document.documentElement.style.setProperty('--touch-wide-pane-max-right', `${caps.right}px`);
    };
    applyDockCaps();

    const modBar = getEl('touch-modifier-bar');
    let mobileLayoutDefaultApplied = false;

    const applyMobBarVisibility = (isMobileLayout) => {
      if (!modBar) return;
      // TUX-045: touch-capable devices only. A narrow mouse window (mobile-layout) hides the bar.
      const showBar = typeof this.isTouchCapable === 'function' && this.isTouchCapable();
      modBar.classList.toggle('hidden', !showBar);
    };

    // TUX-005: drawers end above the in-flow bottom chrome (#hud-bar, #touch-modifier-bar).
    // --bottom-chrome-h is the measured sum of their heights. It sits on <html> because the panes
    // are siblings of .workspace-shell, not descendants. Absent outside mobile-layout (CSS falls back).
    const syncBottomChrome = () => {
      const root = document.documentElement;
      if (!document.body.classList.contains('mobile-layout')) {
        root.style.removeProperty('--bottom-chrome-h');
        return;
      }
      let total = 0;
      ['hud-bar', 'touch-modifier-bar'].forEach((id) => {
        const el = getEl(id);
        if (!el) return;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return;
        total += el.getBoundingClientRect().height;
      });
      root.style.setProperty('--bottom-chrome-h', `${Math.round(total * 100) / 100}px`);
    };
    if (typeof ResizeObserver !== 'undefined') {
      const chromeObserver = new ResizeObserver(() => syncBottomChrome());
      ['hud-bar', 'touch-modifier-bar'].forEach((id) => {
        const el = getEl(id);
        if (el) chromeObserver.observe(el, { box: 'border-box' });
      });
    }

    // TUX-008: one controller owns the pane state (src/ui/shell/pane-state.js). It is pure; this file
    // reads the layout, feeds it in and writes the classes, the backdrop and the aria state.
    //   Model layout: touch pointer -> the classifier class (phone | tablet | touch-wide).
    //   Fine pointer -> 'phone' below 640 px (drawers, as before), else 'desktop' (docked, overlays
    //   between 540 and 900 px). A fine pointer keeps today's behaviour at every width.
    let controller = null;
    let backdrop = null;

    const readModel = () => {
      const lc = LC();
      const input = lc ? lc.readInput() : { width: window.innerWidth, height: window.innerHeight, coarsePointer: false };
      const cls = lc ? lc.classify(input) : (input.width < 540 ? 'phone' : (input.width < 900 ? 'tablet' : 'desktop'));
      let layout;
      if (input.coarsePointer) layout = cls;
      else layout = input.width < 640 ? 'phone' : 'desktop';
      return { layout, overlay: !input.coarsePointer && cls !== 'desktop' && layout === 'desktop' };
    };

    const ensureBackdrop = () => {
      if (backdrop) return backdrop;
      backdrop = document.createElement('div');
      backdrop.id = 'mobile-pane-backdrop';
      backdrop.className = 'mobile-pane-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      // TUX-011: role=presentation + cursor:pointer (CSS) make iOS Safari deliver the click to a
      // non-interactive div. The backdrop closes on click ONLY, so no ghost click reaches the canvas.
      backdrop.setAttribute('role', 'presentation');
      backdrop.addEventListener('click', () => { if (controller) controller.closeAll(); });
      document.body.appendChild(backdrop);
      return backdrop;
    };

    // Write the controller state to the DOM. Classes:
    //   docked  open: none            closed: pane-collapsed
    //   phone   open: pane-force-open closed: no class (auto-collapsed on <body> keeps the sliver)
    //   tablet  open: pane-drawer-open closed: pane-collapsed (zero footprint, see TUX-008 CSS)
    const render = () => {
      if (!controller) return;
      const layout = controller.layout();
      document.body.classList.toggle('auto-collapsed', layout === 'phone');
      [['left', leftPane], ['right', rightPane]].forEach(([side, pane]) => {
        const open = controller.isOpen(side);
        pane.classList.toggle('pane-force-open', open && layout === 'phone');
        pane.classList.toggle('pane-drawer-open', open && layout === 'tablet');
        // Phone keeps the legacy model: closed = no class (body.auto-collapsed draws the sliver), so
        // callers that force a drawer open with `pane-force-open` alone still work.
        pane.classList.toggle('pane-collapsed', layout === 'phone' ? false : !open);
      });
      const anyOpen = controller.isDrawer() && (controller.isOpen('left') || controller.isOpen('right'));
      ensureBackdrop().classList.toggle('visible', anyOpen);
      syncAria(layout);
    };

    // TUX-010/011: every control for a pane carries aria-expanded + aria-controls. On a touch drawer
    // layout a closed pane is inert (no focus, no hit, no AT), and focus follows the drawer:
    // open -> its close control, close -> the control that opened it.
    const CONTROLS = {
      left: [leftBtn, mobileLeftBtn, headerLeftBtn],
      right: [rightBtn, mobileRightBtn, headerRightBtn],
    };
    const PANES = { left: leftPane, right: rightPane };
    // Some callers (test setup, legacy code) force a drawer open by adding the open class directly. An
    // inert pane would then swallow every tap, so an open class always lifts `inert`.
    if (typeof MutationObserver !== 'undefined') {
      const lift = (pane) => {
        const c = pane.classList;
        const tablet = document.body.classList.contains('tablet-layout');
        const open = c.contains('pane-force-open') || c.contains('pane-drawer-open') || (tablet && !c.contains('pane-collapsed'));
        if (open && pane.hasAttribute('inert')) pane.removeAttribute('inert');
      };
      [leftPane, rightPane].forEach((pane) => {
        new MutationObserver(() => lift(pane)).observe(pane, { attributes: true, attributeFilter: ['class'] });
      });
    }
    const wasOpen = { left: null, right: null };
    let lastTrigger = { left: null, right: null };
    const syncAria = (layout) => {
      const touchDrawer = (layout === 'phone' || layout === 'tablet') && document.body.classList.contains('touch-ui');
      ['left', 'right'].forEach((side) => {
        const open = controller.isOpen(side);
        const pane = PANES[side];
        CONTROLS[side].forEach((btn) => {
          if (!btn) return;
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          btn.setAttribute('aria-controls', pane.id);
        });
        if (touchDrawer && !open) pane.setAttribute('inert', '');
        else pane.removeAttribute('inert');
        const prev = wasOpen[side];
        wasOpen[side] = open;
        if (prev === null || prev === open || !touchDrawer) return;
        try {
          if (open) {
            CONTROLS[side][0].focus({ preventScroll: true });
          } else {
            const active = document.activeElement;
            const trigger = lastTrigger[side];
            if (trigger && trigger.isConnected && (!active || active === document.body || pane.contains(active))) {
              const cs = getComputedStyle(trigger);
              if (cs.display !== 'none' && cs.visibility !== 'hidden') trigger.focus({ preventScroll: true });
            }
          }
        } catch (e) { /* focus unavailable */ }
      });
    };

    const applyLayout = () => {
      applyDockCaps();
      const lc = LC();
      let layout;
      if (lc) layout = lc.apply(document);
      else {
        // Fallback when the classifier script is absent: keep the body classes coherent.
        layout = window.innerWidth < 540 ? 'phone' : (window.innerWidth < 900 ? 'tablet' : 'desktop');
        const cl = document.body.classList;
        cl.toggle('mobile-layout', layout !== 'desktop');
        cl.toggle('phone-layout', layout === 'phone');
        cl.toggle('tablet-layout', layout === 'tablet');
        document.body.dataset.layout = layout;
      }
      const isMobileLayout = layout === 'phone' || layout === 'tablet';
      const model = readModel();
      const PaneState = PS();
      if (PaneState) {
        if (!controller) {
          controller = PaneState.create({
            layout: model.layout,
            overlay: model.overlay,
            prefs: SETTINGS,
            persist: (key, collapsed) => {
              SETTINGS[key] = collapsed;
              this.app?.persistPreferencesDebounced?.();
            },
            onChange: () => render(),
          });
        } else {
          controller.setLayout(model.layout, { overlay: model.overlay });
        }
      }
      render();
      applyMobBarVisibility(isMobileLayout);
      if (bottomPane && isMobileLayout && !mobileLayoutDefaultApplied) {
        bottomPane.classList.add('bottom-pane-collapsed');
        mobileLayoutDefaultApplied = true;
      }
      syncBottomChrome();
    };

    // One handler per control. Plain click serves mouse and touch (never branch on pointerType).
    // The close chevron lives inside the pane, so it never becomes the focus-return trigger.
    const wire = (btn, side, isOpener) => {
      if (!btn) return;
      btn.addEventListener('click', () => {
        if (!controller) return;
        if (isOpener && !controller.isOpen(side)) lastTrigger[side] = btn;
        controller.toggle(side);
      });
    };
    wire(leftBtn, 'left', false);
    wire(rightBtn, 'right', false);
    wire(mobileLeftBtn, 'left', true);
    wire(mobileRightBtn, 'right', true);
    wire(headerLeftBtn, 'left', true);
    wire(headerRightBtn, 'right', true);
    window.addEventListener('resize', applyLayout);
    try {
      const coarseMq = window.matchMedia && window.matchMedia('(pointer: coarse)');
      if (coarseMq) {
        if (coarseMq.addEventListener) coarseMq.addEventListener('change', applyLayout);
        else if (coarseMq.addListener) coarseMq.addListener(applyLayout);
      }
    } catch (e) { /* matchMedia unavailable */ }
    applyLayout();

    // The one public pane API (TUX-008). context-bar.js, ui.js and TUX-009/010/011 call this.
    const bound = (fn) => (...args) => (controller ? fn(...args) : undefined);
    UI.Workspace.paneState = {
      open: bound((side) => controller.open(side)),
      close: bound((side) => controller.close(side)),
      toggle: bound((side) => controller.toggle(side)),
      isOpen: (side) => (controller ? controller.isOpen(side) : false),
      closeAll: bound(() => controller.closeAll()),
      resetForLayout: bound(() => controller.resetForLayout()),
      layout: () => (controller ? controller.layout() : null),
    };

    // Reset View. The controller owns the pane state, so route through it first: DOM and state stay
    // in sync and a later resize does not re-collapse a pane the DOM shows open. Overlay panes
    // (fine pointer, 540-900 px) show one pane only, as the legacy shell did.
    // TUX-009: on a touch UI (coarse pointer) Reset View only fits the paper. Panes, bottom pane and
    // layout classes stay as the user left them; the classifier owns the layout classes there.
    // A fine pointer keeps the pre-TUX-009 behaviour at every width.
    this.expandPanes = () => {
      const lc = LC();
      const coarse = lc ? lc.readInput().coarsePointer === true : false;
      if (coarse) return false;
      if (controller) {
        if (controller.snapshot().overlay) controller.resetOverlay('left');
        else controller.resetForLayout();
      } else {
        leftPane.classList.remove('pane-collapsed', 'pane-force-open');
        rightPane.classList.remove('pane-collapsed', 'pane-force-open');
      }
      document.body.classList.remove('auto-collapsed');
      // TUX-006: fine pointer -> Reset View strips every layout class.
      if (lc && lc.force) lc.force('desktop', document);
      else {
        document.body.classList.remove('mobile-layout', 'phone-layout', 'tablet-layout', 'touch-wide-layout');
        document.body.dataset.layout = 'desktop';
      }
      document.documentElement.style.setProperty('--pane-left-width', '335px');
      document.documentElement.style.setProperty('--pane-right-width', '335px');
      document.documentElement.style.setProperty('--bottom-pane-height', '180px');
      if (bottomPane) bottomPane.classList.remove('bottom-pane-collapsed');
      return true;
    };
  }

  function initPaneResizers() {
    const { getEl } = requireDeps('initPaneResizers');
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    const leftPane = getEl('left-pane');
    const rightPane = getEl('right-pane');
    const leftResizer = getEl('left-resizer');
    const rightResizer = getEl('right-resizer');
    if (!leftPane || !rightPane || !leftResizer || !rightResizer) return;

    const minLeft = 200;
    const maxLeft = 520;
    const minRight = 200;
    const maxRight = 520;

    const startDrag = (e, side) => {
      e.preventDefault();
      const startX = e.clientX;
      const startLeft = leftPane.getBoundingClientRect().width;
      const startRight = rightPane.getBoundingClientRect().width;
      const resizer = side === 'left' ? leftResizer : rightResizer;
      resizer.classList.add('active');
      // Dragging a resizer shows both panes (docked layouts only; the resizers are hidden on drawers).
      const ps = UI.Workspace.paneState;
      if (ps && ps.layout()) {
        ps.open('left');
        ps.open('right');
      } else {
        document.body.classList.remove('auto-collapsed');
        leftPane.classList.remove('pane-collapsed');
        rightPane.classList.remove('pane-collapsed');
      }
      // TUX-008: touch-wide docked panes stay inside TOUCH_LAYOUT.maxDockedPaneWidth.
      const wide = document.body.classList.contains('touch-wide-layout');
      const rootCs = getComputedStyle(document.documentElement);
      const caps = wide ? {
        left: parseFloat(rootCs.getPropertyValue('--touch-wide-pane-max')),
        right: parseFloat(rootCs.getPropertyValue('--touch-wide-pane-max-right')),
      } : null;
      const capLeft = caps && Number.isFinite(caps.left) ? Math.min(maxLeft, caps.left) : maxLeft;
      const capRight = caps && Number.isFinite(caps.right) ? Math.min(maxRight, caps.right) : maxRight;
      let lastWidth = side === 'left' ? startLeft : startRight;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        if (side === 'left') {
          const next = Math.max(minLeft, Math.min(capLeft, startLeft + dx));
          document.documentElement.style.setProperty('--pane-left-width', `${next}px`);
          lastWidth = next;
        } else {
          const next = Math.max(minRight, Math.min(capRight, startRight - dx));
          document.documentElement.style.setProperty('--pane-right-width', `${next}px`);
          lastWidth = next;
        }
      };

      const onUp = () => {
        resizer.classList.remove('active');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const rounded = Math.round(lastWidth);
        if (side === 'left') SETTINGS.paneLeftWidth = rounded;
        else SETTINGS.paneRightWidth = rounded;
        this.app?.persistPreferencesDebounced?.();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };

    leftResizer.addEventListener('mousedown', (e) => startDrag(e, 'left'));
    rightResizer.addEventListener('mousedown', (e) => startDrag(e, 'right'));
  }

  UI.Workspace = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps
     */
    bind(deps) {
      DEPS = deps;
    },
    initPaneToggles,
    initPaneResizers,
    installOn(proto) {
      proto.initPaneToggles = function() { return initPaneToggles.call(this); };
      proto.initPaneResizers = function() { return initPaneResizers.call(this); };
    },
  };
})();
