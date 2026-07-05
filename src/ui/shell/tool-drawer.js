/**
 * Vectura Studio — All Tools drawer (Illustrator Tools Parity, Phase 3 Lane L).
 *
 * Exposes window.Vectura.UI.ToolDrawer — a non-modal drawer, opened from the
 * tool rail's overflow ("…") affordance, that lists EVERY Vectura tool
 * (including every sub-tool variant: pen modes, shape kinds, scissor modes,
 * fill modes) grouped under category headers, with a grid/list view toggle.
 *
 *   TLD-1  All Tools drawer (open from overflow; click activates + rail slot
 *          updates; drawer stays open; canvas click closes; grid/list toggle
 *          persisted in SETTINGS).
 *   TLD-2  Docked-slot cross-highlight (hovering a drawer entry rings the rail
 *          slot its tool lives in).
 *
 * Self-contained IIFE, tolerant of late load: `attach(ui)` is called from
 * `initToolBar` (toolbar.js) via optional chaining, so if this module hasn't
 * registered yet the rail simply gains no drawer until it does. Idempotent.
 *
 * SINGLE SOURCE OF TRUTH for tool names + shortcuts: the rail registry
 * `ui.getSharedToolbarDefinitions()` (labels carry the shortcut, e.g.
 * "Selection (V)"). Structure/grouping comes from `Vectura.TOOL_DRAWER`
 * (src/config/tool-drawer.js). No name/shortcut strings are authored here.
 *
 * Compile gate + integration coverage at tests/integration/tool-drawer.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const cfg = () => Vectura.TOOL_DRAWER || null;
  const settings = () => Vectura.SETTINGS || (Vectura.SETTINGS = {});
  const doc = () => (typeof document !== 'undefined' ? document : null);

  // ── persistence (self-contained localStorage + cookie; mirrored onto
  // SETTINGS.toolDrawerView so the choice lives in the canonical settings
  // object per SPEC). The integrator folds `toolDrawerView` into the App
  // preference snapshot for .vectura / cross-reload round-trip.
  const storageKey = () => cfg()?.view?.storageKey || 'vectura-tool-drawer';
  const readStore = () => {
    try {
      if (G.localStorage) {
        const raw = G.localStorage.getItem(storageKey());
        if (raw) return JSON.parse(raw);
      }
    } catch (_) { /* noop */ }
    try {
      const d = doc();
      const m = d && d.cookie.match(new RegExp(`(?:^|; )${storageKey()}=([^;]*)`));
      if (m) return JSON.parse(decodeURIComponent(m[1]));
    } catch (_) { /* noop */ }
    return null;
  };
  const writeStore = (obj) => {
    let json;
    try { json = JSON.stringify(obj); } catch (_) { return; }
    try { if (G.localStorage) G.localStorage.setItem(storageKey(), json); } catch (_) { /* noop */ }
    try {
      const d = doc();
      if (d) d.cookie = `${storageKey()}=${encodeURIComponent(json)};path=/;max-age=${60 * 60 * 24 * 365}`;
    } catch (_) { /* noop */ }
  };

  const validView = (v) => (v === 'grid' || v === 'list' ? v : null);
  const resolveInitialView = () => {
    const s = settings();
    return validView(s.toolDrawerView)
      || validView(readStore()?.view)
      || validView(cfg()?.view?.default)
      || 'grid';
  };

  // ── module state (one drawer per window) ──────────────────────────────────
  const state = {
    attached: false,
    ui: null,
    drawer: null,
    body: null,
    overflowBtn: null,
    open: false,
    view: 'grid',
    highlighted: null,
    docHandlersBound: false,
  };

  // Resolve the rail slot element a drawer entry's tool lives in (TLD-2).
  const railSelectorFor = (id, def, activate) => {
    if (id === 'light-source') return '#btn-light-source';
    const railTool = (def && def.submenuKind) || (activate && activate.tool) || id;
    return `.tool-btn[data-tool="${railTool}"]`;
  };

  const clearHighlight = () => {
    if (state.highlighted) {
      state.highlighted.classList.remove('tool-drawer-rail-highlight');
      state.highlighted = null;
    }
  };
  const applyHighlight = (selector) => {
    clearHighlight();
    const d = doc();
    const el = d && selector ? d.querySelector(selector) : null;
    if (el) {
      el.classList.add('tool-drawer-rail-highlight');
      state.highlighted = el;
    }
  };

  // Route an entry click through the SAME UI methods the rail flyout uses, so
  // the rail slot's current sub-tool updates identically (TLD-1).
  const activateTool = (ui, activate) => {
    if (!ui || !activate) return;
    if (activate.custom === 'light-source') { ui.startLightSourcePlacement?.(); return; }
    if (activate.tool) ui.setActiveTool?.(activate.tool);
    if (activate.penMode) ui.setPenMode?.(activate.penMode);
    if (activate.scissorMode) ui.setScissorMode?.(activate.scissorMode);
  };

  const applyView = (view) => {
    state.view = validView(view) || 'grid';
    if (state.drawer) state.drawer.dataset.view = state.view;
    if (state.drawer) {
      state.drawer.querySelectorAll('.tool-drawer-view-btn').forEach((btn) => {
        const on = btn.dataset.view === state.view;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
  };

  const setView = (view, persistChoice = true) => {
    applyView(view);
    if (persistChoice) {
      settings().toolDrawerView = state.view;
      writeStore({ view: state.view });
      state.ui?.app?.persistPreferencesDebounced?.();
    }
  };

  // Reflect which entry matches the currently active tool.
  const syncActiveEntry = () => {
    if (!state.body || !state.ui) return;
    const active = state.ui.activeTool;
    state.body.querySelectorAll('.tool-drawer-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.toolId === active);
    });
  };

  const buildBody = (ui) => {
    const d = doc();
    const conf = cfg();
    if (!d || !conf || !state.body) return;
    const defs = (typeof ui.getSharedToolbarDefinitions === 'function')
      ? (ui.getSharedToolbarDefinitions() || {})
      : {};
    const frag = d.createDocumentFragment();

    (conf.categories || []).forEach((cat) => {
      const tools = (cat.tools || []).filter((t) => defs[t.id]);
      if (!tools.length) return;
      const section = d.createElement('div');
      section.className = 'tool-drawer-category';
      section.dataset.category = cat.id;

      const heading = d.createElement('div');
      heading.className = 'tool-drawer-category-label';
      heading.textContent = cat.label || cat.id;
      section.appendChild(heading);

      const grid = d.createElement('div');
      grid.className = 'tool-drawer-items';

      tools.forEach((tool) => {
        const def = defs[tool.id];
        const label = def.label || tool.id;
        const item = d.createElement('button');
        item.type = 'button';
        item.className = 'tool-drawer-item';
        item.dataset.toolId = tool.id;
        item.dataset.railSelector = railSelectorFor(tool.id, def, tool.activate);
        // Tooltip + a11y name = the rail registry label (name + shortcut). Single
        // source; no duplicated strings.
        item.title = label;
        item.setAttribute('aria-label', label);
        item.innerHTML =
          `<span class="tool-drawer-item-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${def.icon || ''}</svg></span>` +
          `<span class="tool-drawer-item-label">${label}</span>`;

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          activateTool(ui, tool.activate);
          syncActiveEntry();
          // Drawer STAYS open (TLD-1).
        });
        // TLD-2 cross-highlight.
        item.addEventListener('mouseenter', () => applyHighlight(item.dataset.railSelector));
        item.addEventListener('mouseleave', clearHighlight);
        item.addEventListener('focus', () => applyHighlight(item.dataset.railSelector));
        item.addEventListener('blur', clearHighlight);

        grid.appendChild(item);
      });

      section.appendChild(grid);
      frag.appendChild(section);
    });

    state.body.innerHTML = '';
    state.body.appendChild(frag);
    syncActiveEntry();
  };

  const buildDrawer = (ui) => {
    const d = doc();
    const conf = cfg();
    if (!d || !conf) return;
    let drawer = d.getElementById('tool-drawer');
    if (!drawer) {
      drawer = d.createElement('div');
      drawer.id = 'tool-drawer';
      drawer.className = 'tool-drawer hidden';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-label', conf.aria?.drawerLabel || conf.title || 'All Tools');
      drawer.setAttribute('aria-hidden', 'true');

      const header = d.createElement('div');
      header.className = 'tool-drawer-header';
      const titleEl = d.createElement('span');
      titleEl.className = 'tool-drawer-title';
      titleEl.textContent = conf.title || 'All Tools';
      const toggle = d.createElement('div');
      toggle.className = 'tool-drawer-view-toggle';
      toggle.setAttribute('role', 'group');
      toggle.setAttribute('aria-label', conf.aria?.viewToggleLabel || 'Drawer view');
      ['list', 'grid'].forEach((v) => {
        const vb = d.createElement('button');
        vb.type = 'button';
        vb.className = 'tool-drawer-view-btn';
        vb.dataset.view = v;
        vb.title = conf.view?.[v]?.label || v;
        vb.setAttribute('aria-label', conf.view?.[v]?.label || v);
        vb.setAttribute('aria-pressed', 'false');
        vb.innerHTML = conf.view?.[v]?.icon || v;
        vb.addEventListener('click', (e) => { e.stopPropagation(); setView(v); });
        toggle.appendChild(vb);
      });
      header.appendChild(titleEl);
      header.appendChild(toggle);

      const body = d.createElement('div');
      body.className = 'tool-drawer-body';

      drawer.appendChild(header);
      drawer.appendChild(body);
      d.body.appendChild(drawer);
    }
    state.drawer = drawer;
    state.body = drawer.querySelector('.tool-drawer-body');
    buildBody(ui);
    applyView(state.view);
  };

  // Position the drawer adjacent to the rail, clamped to the viewport.
  const positionDrawer = () => {
    const d = doc();
    const drawer = state.drawer;
    const rail = d && d.getElementById('tool-bar');
    if (!drawer || !rail) return;
    const GAP = 8;
    const PAD = 8;
    const vw = G.innerWidth || 1024;
    const vh = G.innerHeight || 768;
    const r = rail.getBoundingClientRect();
    // Measure while shown.
    const mw = drawer.offsetWidth || 240;
    const mh = drawer.offsetHeight || 320;
    // Prefer the side of the rail with more room; default to the right.
    const spaceRight = vw - r.right;
    const spaceLeft = r.left;
    let left;
    if (spaceRight >= mw + GAP + PAD || spaceRight >= spaceLeft) {
      left = r.right + GAP;
    } else {
      left = r.left - GAP - mw;
    }
    let top = r.top;
    left = Math.max(PAD, Math.min(vw - mw - PAD, left));
    top = Math.max(PAD, Math.min(vh - mh - PAD, top));
    drawer.style.left = `${left}px`;
    drawer.style.top = `${top}px`;
  };

  const open = (ui) => {
    if (ui) state.ui = ui;
    if (!state.drawer) buildDrawer(state.ui);
    if (!state.drawer) return;
    state.open = true;
    state.drawer.classList.remove('hidden');
    state.drawer.setAttribute('aria-hidden', 'false');
    state.overflowBtn?.classList.add('active');
    state.overflowBtn?.setAttribute('aria-expanded', 'true');
    syncActiveEntry();
    positionDrawer();
  };

  const close = () => {
    state.open = false;
    clearHighlight();
    if (state.drawer) {
      state.drawer.classList.add('hidden');
      state.drawer.setAttribute('aria-hidden', 'true');
    }
    state.overflowBtn?.classList.remove('active');
    state.overflowBtn?.setAttribute('aria-expanded', 'false');
  };

  const toggle = (ui) => { if (state.open) close(); else open(ui); };

  const bindDocHandlers = () => {
    const d = doc();
    if (!d || state.docHandlersBound) return;
    state.docHandlersBound = true;
    // Clicking the canvas closes the drawer (TLD-1, video f0363).
    const onCanvasDown = () => { if (state.open) close(); };
    const canvas = d.getElementById('main-canvas');
    if (canvas) canvas.addEventListener('pointerdown', onCanvasDown);
    // Escape closes (non-modal dialog a11y).
    d.addEventListener('keydown', (e) => {
      if (state.open && e.key === 'Escape') { close(); }
    });
    // Keep the drawer glued to the rail when the layout shifts.
    G.addEventListener('resize', () => { if (state.open) positionDrawer(); });
  };

  const injectOverflowButton = (ui) => {
    const d = doc();
    const toolbar = d && d.getElementById('tool-bar');
    const conf = cfg();
    if (!toolbar || !conf) return;
    let btn = d.getElementById('tool-overflow-btn');
    if (!btn) {
      btn = d.createElement('button');
      btn.id = 'tool-overflow-btn';
      btn.className = 'tool-btn tool-overflow-btn';
      btn.type = 'button';
      btn.title = conf.overflow?.tooltip || 'All Tools';
      btn.setAttribute('aria-label', conf.overflow?.ariaLabel || 'Open the All Tools drawer');
      btn.setAttribute('aria-haspopup', 'dialog');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = conf.overflow?.icon || '…';
      // Sit above the dock footer (pin/home/rotate/pop-out) if present.
      const footer = toolbar.querySelector('.toolbar-footer');
      if (footer) toolbar.insertBefore(btn, footer);
      else toolbar.appendChild(btn);
    }
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(ui); });
    state.overflowBtn = btn;
  };

  UI.ToolDrawer = {
    /**
     * Wire the overflow affordance + build the drawer. Idempotent; safe to call
     * once from initToolBar. Tolerates being called before/after the config or
     * shared tool definitions exist (rebuilds lazily on open).
     * @param {object} ui - the UI instance (App.ui).
     */
    attach(ui) {
      if (!ui) return;
      state.ui = ui;
      state.view = resolveInitialView();
      if (state.attached) {
        // Re-attach after a toolbar rebuild: re-inject the button + rebuild body.
        injectOverflowButton(ui);
        buildDrawer(ui);
        return;
      }
      injectOverflowButton(ui);
      buildDrawer(ui);
      bindDocHandlers();
      state.attached = true;
    },
    open,
    close,
    toggle,
    setView,
    isOpen: () => state.open === true,
    getView: () => state.view,
    // Test/introspection hook.
    _state: state,
    destroy() {
      close();
      const d = doc();
      const drawer = d && d.getElementById('tool-drawer');
      if (drawer) drawer.remove();
      const btn = d && d.getElementById('tool-overflow-btn');
      if (btn) btn.remove();
      state.attached = false;
      state.drawer = null;
      state.body = null;
      state.overflowBtn = null;
      state.ui = null;
      state.highlighted = null;
    },
  };
})();
