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
    const leftPane = getEl('left-pane');
    const rightPane = getEl('right-pane');
    const bottomPane = getEl('bottom-pane');
    const leftBtn = getEl('btn-pane-toggle-left');
    const rightBtn = getEl('btn-pane-toggle-right');
    const mobileLeftBtn = getEl('btn-mobile-pane-left');
    const mobileRightBtn = getEl('btn-mobile-pane-right');
    if (!leftPane || !rightPane || !leftBtn || !rightBtn) return;

    const isMobileViewport = () => window.innerWidth < 900;

    const isCollapsed = (pane) => {
      const auto = document.body.classList.contains('auto-collapsed') && !pane.classList.contains('pane-force-open');
      return auto || pane.classList.contains('pane-collapsed');
    };

    const modBar = getEl('touch-modifier-bar');
    let mobileLayoutDefaultApplied = false;

    const applyMobBarVisibility = (isMobileLayout) => {
      if (!modBar) return;
      const showBar = isMobileLayout
        || (typeof this.isTouchCapable === 'function' && this.isTouchCapable());
      modBar.classList.toggle('hidden', !showBar);
    };

    const applyAutoCollapse = () => {
      const viewportWidth = window.innerWidth;
      const shouldAuto = viewportWidth < 640;
      const isMobileLayout = viewportWidth < 900;
      const isPhoneLayout = viewportWidth < 540;
      document.body.classList.toggle('auto-collapsed', shouldAuto);
      document.body.classList.toggle('mobile-layout', isMobileLayout);
      document.body.classList.toggle('phone-layout', isPhoneLayout);
      applyMobBarVisibility(isMobileLayout);
      if (bottomPane && isMobileLayout && !mobileLayoutDefaultApplied) {
        bottomPane.classList.add('bottom-pane-collapsed');
        mobileLayoutDefaultApplied = true;
      }
    };

    const isPaneOpen = (pane) => {
      if (document.body.classList.contains('auto-collapsed')) {
        return pane.classList.contains('pane-force-open');
      }
      return !pane.classList.contains('pane-collapsed');
    };

    let backdrop = null;
    const closeAllPanes = () => {
      const auto = document.body.classList.contains('auto-collapsed');
      [leftPane, rightPane].forEach((pane) => {
        if (auto) pane.classList.remove('pane-force-open');
        else pane.classList.add('pane-collapsed');
      });
      syncBackdrop();
    };
    const ensureBackdrop = () => {
      if (backdrop) return backdrop;
      backdrop = document.createElement('div');
      backdrop.id = 'mobile-pane-backdrop';
      backdrop.className = 'mobile-pane-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      backdrop.addEventListener('click', closeAllPanes);
      document.body.appendChild(backdrop);
      return backdrop;
    };
    const syncBackdrop = () => {
      const el = ensureBackdrop();
      const isMobile = document.body.classList.contains('mobile-layout');
      const anyOpen = isMobile && (isPaneOpen(leftPane) || isPaneOpen(rightPane));
      el.classList.toggle('visible', anyOpen);
    };

    const togglePane = (pane) => {
      const auto = document.body.classList.contains('auto-collapsed');
      const willOpen = auto ? !pane.classList.contains('pane-force-open') : pane.classList.contains('pane-collapsed');
      if (willOpen && isMobileViewport()) {
        const sibling = pane === leftPane ? rightPane : leftPane;
        sibling.classList.remove('pane-force-open');
        sibling.classList.add('pane-collapsed');
      }
      if (auto) {
        pane.classList.remove('pane-collapsed');
        pane.classList.toggle('pane-force-open');
      } else {
        pane.classList.toggle('pane-collapsed');
      }
      syncBackdrop();
    };

    leftBtn.addEventListener('click', () => togglePane(leftPane));
    rightBtn.addEventListener('click', () => togglePane(rightPane));
    if (mobileLeftBtn) mobileLeftBtn.addEventListener('click', () => togglePane(leftPane));
    if (mobileRightBtn) mobileRightBtn.addEventListener('click', () => togglePane(rightPane));
    window.addEventListener('resize', () => { applyAutoCollapse(); syncBackdrop(); });
    applyAutoCollapse();
    syncBackdrop();

    this.expandPanes = () => {
      leftPane.classList.remove('pane-collapsed', 'pane-force-open');
      rightPane.classList.remove('pane-collapsed', 'pane-force-open');
      document.body.classList.remove('auto-collapsed', 'mobile-layout', 'phone-layout');
      document.documentElement.style.setProperty('--pane-left-width', '335px');
      document.documentElement.style.setProperty('--pane-right-width', '335px');
      document.documentElement.style.setProperty('--bottom-pane-height', '180px');
      if (bottomPane) bottomPane.classList.remove('bottom-pane-collapsed');
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
      document.body.classList.remove('auto-collapsed');
      leftPane.classList.remove('pane-collapsed');
      rightPane.classList.remove('pane-collapsed');
      let lastWidth = side === 'left' ? startLeft : startRight;

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        if (side === 'left') {
          const next = Math.max(minLeft, Math.min(maxLeft, startLeft + dx));
          document.documentElement.style.setProperty('--pane-left-width', `${next}px`);
          lastWidth = next;
        } else {
          const next = Math.max(minRight, Math.min(maxRight, startRight - dx));
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
