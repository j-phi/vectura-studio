/**
 * Vectura Studio — Contextual Task Bar framework (Illustrator Tools Parity,
 * Phase 2 Lane G: TB-1…8).
 *
 * A floating horizontal pill anchored below the selection that morphs its
 * contents per selection context (idle / single path / single shape / single
 * text / multi / group / direct-anchor), with drag/pin/reset/hide management
 * and an overflow (…) menu. In-place sub-modes (stroke weight, Simplify) are
 * owned by Lane H (`src/ui/shell/context-bar-modes.js`) and compose through the
 * contract exposed here as `window.Vectura.UI.ContextBar`.
 *
 * Self-contained IIFE: no edits to renderer.js / ui.js / app.js. Anchoring and
 * context detection run on a requestAnimationFrame ticker (matching hint-bar.js)
 * that no-ops until `window.app.renderer` exists, so load order is irrelevant.
 * All copy / icons / timings live in `src/config/context-bar.js`
 * (`Vectura.CONTEXT_BAR`) — never inline here.
 *
 * ── Contract surface (window.Vectura.UI.ContextBar) ───────────────────────
 *   getContentHost()   → the inner content element sub-modes fill.
 *   restoreState()     → re-render the current selection-context state.
 *   getContext()       → { kind, layerIds, primaryLayer, app, renderer }.
 *   anchorRectForBar() → screen rect the bar is anchored to (or null).
 *   setBusy(bool)      → suspend/resume G's content re-render (H owns content
 *                        while a sub-mode is active).
 *   Emits `vectura:contextbar-state` on document when its state changes.
 *   setOverflowExtraItem({label, onClick}|null) → optional; a sub-mode may
 *     prepend one contextual overflow item (e.g. "Open Stroke Options").
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};
  if (UI.ContextBar) return; // double-load guard (script tag + test eval)

  const cfg = () => Vectura.CONTEXT_BAR || {};
  const settings = () => Vectura.SETTINGS || {};
  const getApp = () => G.app || null;
  const getRenderer = () => { const a = getApp(); return (a && a.renderer) || null; };

  // ── module state ──────────────────────────────────────────────────────
  const state = {
    started: false,
    raf: 0,
    mounted: false,
    busy: false,               // a Lane H sub-mode owns the content host
    kind: null,                // last-rendered context kind
    lastAnchor: null,          // last selection screen rect used for anchoring
    drag: { engaged: false, active: false, x: 0, y: 0 },
    canvasDragBound: false,
    handleDrag: null,          // { startX, startY, baseX, baseY, moved }
    menuOpen: false,
    closeFlyout: null,         // active align-flyout close fn (single handler)
    repositionOpenFlyout: null, // re-flips the open flyout's up/down direction on bar move
    overflowExtra: null,       // optional sub-mode overflow item
    pulseTimer: 0,
    visible: false,
  };

  const els = {};

  // ── persistence (self-contained cookie + localStorage; also mirrored onto
  // Vectura.SETTINGS.contextBar / .contextBarEnabled so it lives in the
  // canonical settings object per spec). Interface request: the phase
  // integrator should fold these two keys into app.js getPreferenceSnapshot /
  // applyPreferenceSnapshot for canonical .vectura round-trip (mirroring how
  // contextualHints was folded in for Lane F). ───────────────────────────
  const storageKey = () => cfg().storageKey || 'vectura-context-bar';

  const readStore = () => {
    try {
      if (G.localStorage) {
        const raw = G.localStorage.getItem(storageKey());
        if (raw) return JSON.parse(raw);
      }
    } catch (_) { /* private mode / disabled */ }
    try {
      const doc = G.document;
      if (doc && typeof doc.cookie === 'string') {
        const m = doc.cookie.match(new RegExp(`(?:^|; )${storageKey()}=([^;]*)`));
        if (m) return JSON.parse(decodeURIComponent(m[1]));
      }
    } catch (_) { /* malformed */ }
    return null;
  };

  const writeStore = (obj) => {
    let json = '';
    try { json = JSON.stringify(obj); } catch (_) { return; }
    try { if (G.localStorage) G.localStorage.setItem(storageKey(), json); } catch (_) { /* noop */ }
    try {
      const doc = G.document;
      if (doc) doc.cookie = `${storageKey()}=${encodeURIComponent(json)};path=/;max-age=${60 * 60 * 24 * 365}`;
    } catch (_) { /* noop */ }
  };

  // Bar preference bag lives on SETTINGS.contextBar; the ON/OFF pref on
  // SETTINGS.contextBarEnabled (default ON via `!== false`).
  const prefs = () => {
    const s = settings();
    if (!s.contextBar || typeof s.contextBar !== 'object') s.contextBar = { pinned: false, x: null, y: null };
    return s.contextBar;
  };
  const isEnabled = () => settings().contextBarEnabled !== false;

  const loadPersisted = () => {
    const saved = readStore();
    if (!saved) return;
    const s = settings();
    if (typeof saved.enabled === 'boolean') s.contextBarEnabled = saved.enabled;
    s.contextBar = {
      pinned: saved.pinned === true,
      x: Number.isFinite(saved.x) ? saved.x : null,
      y: Number.isFinite(saved.y) ? saved.y : null,
    };
  };

  const persist = () => {
    const p = prefs();
    writeStore({ enabled: isEnabled(), pinned: p.pinned === true, x: p.x, y: p.y });
    const a = getApp();
    a?.persistPreferencesDebounced?.(); // canonical path once integrator folds keys in
  };

  // ── DOM construction ──────────────────────────────────────────────────
  const el = (tag, cls, attrs) => {
    const d = G.document;
    const node = d.createElement(tag);
    if (cls) node.className = cls;
    if (attrs) Object.keys(attrs).forEach((k) => node.setAttribute(k, attrs[k]));
    return node;
  };

  const mount = () => {
    if (state.mounted) return true;
    const d = G.document;
    if (!d) return false;
    const host = d.getElementById('viewport-container');
    if (!host) return false;
    const c = cfg();
    const aria = c.aria || {};

    const bar = el('div', 'ctxbar', {
      role: 'toolbar',
      'aria-label': aria.toolbarLabel || 'Contextual task bar',
      'aria-hidden': 'true',
      'data-ctxbar': '',
    });

    const handle = el('button', 'ctxbar-handle', {
      type: 'button',
      'aria-label': aria.dragHandleLabel || 'Move task bar',
      title: aria.dragHandleLabel || 'Move task bar',
      tabindex: '-1',
      'data-ctxbar-roving': '',
    });
    handle.innerHTML = (c.icons && c.icons.grip) || '';

    const content = el('div', 'ctxbar-content', { role: 'group' });

    const overflowWrap = el('div', 'ctxbar-overflow-wrap');
    const overflow = el('button', 'ctxbar-btn ctxbar-overflow', {
      type: 'button',
      title: (c.overflow && c.overflow.buttonTooltip) || 'More options',
      'aria-label': aria.overflowLabel || 'More options',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      tabindex: '-1',
      'data-ctxbar-roving': '',
    });
    overflow.innerHTML = (c.icons && c.icons.overflow) || '';
    const menu = el('div', 'ctxbar-menu', { role: 'menu', 'aria-hidden': 'true' });
    overflowWrap.appendChild(overflow);
    overflowWrap.appendChild(menu);

    bar.appendChild(handle);
    bar.appendChild(content);
    bar.appendChild(overflowWrap);
    host.appendChild(bar);

    els.host = host;
    els.bar = bar;
    els.handle = handle;
    els.content = content;
    els.overflow = overflow;
    els.menu = menu;

    bindHandleDrag();
    bindOverflow();
    bindRovingKeys();
    state.mounted = true;
    return true;
  };

  // ── TB-2: overflow menu ───────────────────────────────────────────────
  const buildMenu = () => {
    const d = G.document;
    const c = cfg();
    const items = (c.overflow && c.overflow.items) || {};
    els.menu.textContent = '';
    const add = (label, handler, extra) => {
      const item = el('button', 'ctxbar-menu-item' + (extra ? ' ctxbar-menu-item--extra' : ''), {
        type: 'button', role: 'menuitem', tabindex: '-1',
      });
      item.textContent = label;
      item.addEventListener('click', (e) => { e.preventDefault(); closeMenu(); handler(); });
      els.menu.appendChild(item);
    };
    // A sub-mode may prepend exactly one contextual item (e.g. Open Stroke Options).
    if (state.overflowExtra && state.overflowExtra.label) {
      add(state.overflowExtra.label, () => { try { state.overflowExtra.onClick?.(); } catch (_) { /* noop */ } }, true);
    }
    // "Show Properties panel" is a RESTORE affordance: it only appears while
    // the docked panel this context targets is collapsed or narrower than its
    // default width. At full size the item is omitted (menu rebuilds on open).
    if (showPanelNeedsRestore()) add(items.showPanel || 'Show panel', doShowPanel);
    add(items.hideBar || 'Hide bar', doHideBar);
    add(items.resetPosition || 'Reset bar position', doResetPosition);
    add(items.pinPosition || 'Pin bar position', doPinPosition);
    add(items.quickHelp || 'Quick help', doQuickHelp);
  };

  const openMenu = () => {
    if (!els.menu) return;
    buildMenu();
    state.menuOpen = true;
    els.menu.classList.add('is-open');
    els.menu.setAttribute('aria-hidden', 'false');
    els.overflow.setAttribute('aria-expanded', 'true');
  };
  const closeMenu = () => {
    if (!els.menu) return;
    state.menuOpen = false;
    els.menu.classList.remove('is-open');
    els.menu.setAttribute('aria-hidden', 'true');
    els.overflow.setAttribute('aria-expanded', 'false');
  };
  const bindOverflow = () => {
    els.overflow.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      state.menuOpen ? closeMenu() : openMenu();
    });
    G.document.addEventListener('pointerdown', (e) => {
      // Single global outside-click handler (bound once) closes both the
      // overflow menu and any open align flyout — avoids a per-render listener.
      // The drag handle is excluded from the flyout's outside-click check: grabbing
      // it to reposition the bar shouldn't dismiss an open dropdown, since the
      // dropdown's own up/down direction re-flips live as the bar moves (TB-3).
      if (state.menuOpen && !els.overflow.contains(e.target) && !els.menu.contains(e.target)) closeMenu();
      const onHandle = els.handle && els.handle.contains(e.target);
      if (state.closeFlyout && els.content && !els.content.contains(e.target) && !onHandle) state.closeFlyout();
    }, true);
    G.document.addEventListener('keydown', (e) => {
      if (state.menuOpen && e.key === 'Escape') { closeMenu(); }
    });
  };

  // ── Show-panel restore gating ─────────────────────────────────────────
  // The docked panel a context's Show-panel action targets: the left pane for
  // a single text layer (mirrors doShowPanel's text branch), else the
  // config-owned showPanel map (right pane).
  const showPanelSelector = () => {
    const c = cfg();
    const ctx = getContext();
    if (ctx.kind === 'single-text' && ctx.primaryLayer && ctx.primaryLayer.type === 'text') {
      return (c.textPanel && c.textPanel.selector) || '#left-pane';
    }
    const map = c.showPanel || {};
    const spec = map[ctx.kind] || map.idle || {};
    return spec.selector || '#right-pane';
  };
  const paneSideFor = (node) => {
    const id = (node && node.id) || '';
    if (id.indexOf('left') >= 0) return 'left';
    if (id.indexOf('right') >= 0) return 'right';
    return null;
  };
  // "Original size" = the active skin's manifest pane width (SkinManager pushes
  // it as the --pane-*-width baseline), falling back to the pristine SETTINGS
  // default snapshot.
  const paneDefaultWidth = (side) => {
    const key = side === 'left' ? 'paneLeftWidth' : 'paneRightWidth';
    const theme = (Vectura.THEMES && Vectura.THEMES[settings().uiTheme]) || null;
    const manifest = (theme && theme.manifest) || theme;
    const skinW = manifest && Number(manifest[key]);
    if (Number.isFinite(skinW) && skinW > 0) return skinW;
    const a = getApp();
    const defW = a && a.defaultSettingsSnapshot && Number(a.defaultSettingsSnapshot[key]);
    if (Number.isFinite(defW) && defW > 0) return defW;
    return 335;
  };
  // Effective configured width: the inline --pane-*-width var on :root (the
  // resizer, skin manager, and preference-restore all write there), else the
  // live rect (0 in jsdom → treated as not-shrunk; collapse has its own check).
  const paneCurrentWidth = (node, side) => {
    const d = G.document;
    const varName = side === 'left' ? '--pane-left-width' : '--pane-right-width';
    const inline = d && d.documentElement && parseFloat(d.documentElement.style.getPropertyValue(varName));
    if (Number.isFinite(inline) && inline > 0) return inline;
    const r = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    return (r && r.width) || 0;
  };
  const paneIsCollapsed = (node) => {
    if (!node) return false;
    const body = G.document && G.document.body;
    const auto = body && body.classList.contains('auto-collapsed') && !node.classList.contains('pane-force-open');
    return Boolean(auto || node.classList.contains('pane-collapsed'));
  };
  const paneIsShrunk = (node, side) => {
    if (!side) return false;
    const w = paneCurrentWidth(node, side);
    return w > 0 && w < paneDefaultWidth(side) - 1;
  };
  const showPanelNeedsRestore = () => {
    const d = G.document;
    const node = d ? d.querySelector(showPanelSelector()) : null;
    if (!node) return false;
    return paneIsCollapsed(node) || paneIsShrunk(node, paneSideFor(node));
  };
  // Bring a collapsed/shrunk pane back: un-collapse (phone drawers force-open),
  // and if it sits below the default width, widen back to it. A user-widened
  // pane that was merely collapsed keeps its custom width.
  const restorePane = (node) => {
    if (!node) return;
    const side = paneSideFor(node);
    const s = settings();
    if (paneIsCollapsed(node)) {
      node.classList.remove('pane-collapsed');
      const body = G.document && G.document.body;
      if (body && body.classList.contains('auto-collapsed')) node.classList.add('pane-force-open');
      if (side === 'left') s.leftPaneCollapsed = false;
      else if (side === 'right') s.rightPaneCollapsed = false;
    }
    if (side && paneIsShrunk(node, side)) {
      const w = paneDefaultWidth(side);
      G.document.documentElement.style.setProperty(side === 'left' ? '--pane-left-width' : '--pane-right-width', `${w}px`);
      if (side === 'left') s.paneLeftWidth = w;
      else s.paneRightWidth = w;
    }
    getApp()?.persistPreferencesDebounced?.();
  };

  // Overflow menu actions --------------------------------------------------
  const doShowPanel = () => {
    const c = cfg();
    const map = c.showPanel || {};
    const ctx = getContext();
    const primary = ctx.primaryLayer;
    // For a single text layer, "Show Properties panel" brings up the docked
    // Text (Algorithm) panel for the active layer AND auto-hides the ABOUT info
    // block so more controls are visible, then pulses the left pane (P3
    // feedback) — instead of only wayfinding to the right-pane Layers tab.
    // Gated on the single-text kind so a mixed multi-select whose first layer
    // happens to be text doesn't hijack the panel.
    if (ctx.kind === 'single-text' && primary && primary.type === 'text') {
      const a = getApp();
      if (a && a.engine) {
        a.engine.activeLayerId = primary.id;
        a.ui?.renderLayers?.();
        a.ui?.buildControls?.();
      }
      if (a && a.ui && typeof a.ui.setAboutVisible === 'function') {
        try { a.ui.setAboutVisible(false); } catch (_e) { /* optional */ }
      }
      const textSel = (c.textPanel && c.textPanel.selector) || '#left-pane';
      restorePane(G.document.querySelector(textSel));
      doShowPanelTarget(textSel);
      return;
    }
    const spec = map[state.kind] || map.idle || { selector: '#right-pane', tab: null };
    const d = G.document;
    // Switch the right-pane tab where applicable (wayfinding + navigation).
    if (spec.tab) {
      const tab = d.querySelector(`#right-pane-tabs .right-pane-tab[data-tab="${spec.tab}"]`);
      if (tab && !tab.classList.contains('active')) tab.click();
    }
    const target = spec.selector ? d.querySelector(spec.selector) : null;
    if (!target) return;
    // Restore the panel to its original size first (the menu item is only
    // offered while it is collapsed or shrunk), then draw attention to it.
    restorePane(target);
    // Blue attention pulse: 2 pulses over ~1s via CSS animation.
    const t = c.timing || {};
    if (state.pulseTimer) { clearTimeout(state.pulseTimer); state.pulseTimer = 0; }
    target.classList.remove('ctxbar-pulse');
    // force reflow so re-adding restarts the animation
    void target.offsetWidth;
    target.style.setProperty('--ctxbar-pulse-count', String(t.pulseCount || 2));
    target.classList.add('ctxbar-pulse');
    state.pulseTimer = setTimeout(() => {
      target.classList.remove('ctxbar-pulse');
      state.pulseTimer = 0;
    }, t.pulseDurationMs || 1000);
  };

  const doHideBar = () => {
    // "Hide bar" turns off the visibility preference; re-enable via the
    // Document Setup → Guides & Display "Contextual task bar" checkbox (TB-8).
    settings().contextBarEnabled = false;
    persist();
    refresh();
  };

  const doResetPosition = () => {
    const p = prefs();
    p.pinned = false; p.x = null; p.y = null;
    persist();
    refresh();
  };

  const doPinPosition = () => {
    const p = prefs();
    // Freeze at the bar's current screen position.
    if (els.bar) {
      const left = parseFloat(els.bar.style.left);
      const top = parseFloat(els.bar.style.top);
      if (Number.isFinite(left)) p.x = left;
      if (Number.isFinite(top)) p.y = top;
    }
    p.pinned = true;
    persist();
    refresh();
  };

  const doQuickHelp = () => {
    const a = getApp();
    if (a && a.ui && typeof a.ui.openHelp === 'function') { a.ui.openHelp(false); return; }
    // Fallback: surface via toast so the action is never silent.
    UI.toast?.((cfg().help && cfg().help.fallbackTitle) || 'Contextual Task Bar');
  };

  // ── TB-2: handle drag → move + implies Pin ────────────────────────────
  const bindHandleDrag = () => {
    const onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const left = parseFloat(els.bar.style.left) || 0;
      const top = parseFloat(els.bar.style.top) || 0;
      state.handleDrag = { startX: e.clientX, startY: e.clientY, baseX: left, baseY: top, moved: false };
      G.addEventListener('pointermove', onMove, true);
      G.addEventListener('pointerup', onUp, true);
    };
    const onMove = (e) => {
      if (!state.handleDrag) return;
      const dx = e.clientX - state.handleDrag.startX;
      const dy = e.clientY - state.handleDrag.startY;
      const thr = (cfg().timing && cfg().timing.dragPinThresholdPx) || 3;
      if (!state.handleDrag.moved && (dx * dx + dy * dy) < thr * thr) return;
      state.handleDrag.moved = true;
      const nx = clampBarLeft(state.handleDrag.baseX + dx);
      const ny = clampBarTop(state.handleDrag.baseY + dy);
      els.bar.style.left = `${nx}px`;
      els.bar.style.top = `${ny}px`;
      state.repositionOpenFlyout && state.repositionOpenFlyout();
    };
    const onUp = () => {
      G.removeEventListener('pointermove', onMove, true);
      G.removeEventListener('pointerup', onUp, true);
      if (state.handleDrag && state.handleDrag.moved) {
        // A manual drag implies Pin (bar stays where the user left it).
        const p = prefs();
        p.pinned = true;
        p.x = parseFloat(els.bar.style.left) || 0;
        p.y = parseFloat(els.bar.style.top) || 0;
        persist();
      }
      state.handleDrag = null;
    };
    els.handle.addEventListener('pointerdown', onDown);
  };

  const viewportSize = () => {
    const h = els.host;
    const w = (h && h.clientWidth) || 0;
    const ht = (h && h.clientHeight) || 0;
    return { w: w || 800, h: ht || 600 };
  };
  const barSize = () => {
    const r = els.bar ? els.bar.getBoundingClientRect() : null;
    const w = r && r.width ? r.width : 240;   // jsdom fallback
    const h = r && r.height ? r.height : 34;
    return { w, h };
  };
  const clampBarLeft = (x) => {
    const pad = (cfg().timing && cfg().timing.viewportPadPx) || 8;
    const v = viewportSize(); const b = barSize();
    return Math.max(pad, Math.min(x, v.w - b.w - pad));
  };
  const clampBarTop = (y) => {
    const pad = (cfg().timing && cfg().timing.viewportPadPx) || 8;
    const v = viewportSize(); const b = barSize();
    return Math.max(pad, Math.min(y, v.h - b.h - pad));
  };

  // Pure anchor math (exposed for unit tests — no layout needed).
  // Given the selection screen rect (or null for idle), the bar size and the
  // viewport size, returns { left, top, flipped }.
  const computeAnchor = ({ bounds, barW, barH, viewW, viewH, offset, pad, railRect }) => {
    offset = Number.isFinite(offset) ? offset : 12;
    pad = Number.isFinite(pad) ? pad : 8;
    let left; let top; let flipped = false;
    if (!bounds) {
      // Idle: lower-center of the viewport.
      left = (viewW - barW) / 2;
      top = viewH * 0.72;
    } else {
      left = bounds.centerX - barW / 2;
      top = bounds.maxY + offset;
      if (top + barH > viewH - pad) {
        // Insufficient room below → flip above.
        top = bounds.minY - offset - barH;
        flipped = true;
      }
    }
    // Clamp fully inside the viewport.
    left = Math.max(pad, Math.min(left, viewW - barW - pad));
    top = Math.max(pad, Math.min(top, viewH - barH - pad));
    // Yield to the floating tool rail by shifting horizontally.
    if (railRect && left < railRect.right && left + barW > railRect.left
        && top < railRect.bottom && top + barH > railRect.top) {
      const shifted = railRect.right + pad;
      if (shifted + barW <= viewW - pad) left = shifted;
    }
    return { left, top, flipped };
  };

  const railRectInViewport = () => {
    const d = G.document;
    const host = els.host;
    if (!d || !host) return null;
    const rail = d.querySelector('.tool-bar, #tool-bar, .tool-rail');
    if (!rail) return null;
    const rr = rail.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    if (!rr.width || !hr.width) return null;
    return { left: rr.left - hr.left, right: rr.right - hr.left, top: rr.top - hr.top, bottom: rr.bottom - hr.top };
  };

  const reanchor = () => {
    if (!els.bar) return;
    // While the user is dragging the bar by its grip, the pointermove handler
    // owns els.bar.style.left/top. The RAF tick must NOT recompute the anchor
    // here or it overwrites the live drag every frame (pinned only flips true
    // on release) — the bar would appear frozen and jump to the drop point.
    if (state.handleDrag) return;
    const p = prefs();
    if (p.pinned && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      els.bar.style.left = `${clampBarLeft(p.x)}px`;
      els.bar.style.top = `${clampBarTop(p.y)}px`;
      state.repositionOpenFlyout && state.repositionOpenFlyout();
      return;
    }
    const renderer = getRenderer();
    const bounds = renderer && renderer.getSelectionScreenBounds ? renderer.getSelectionScreenBounds() : null;
    state.lastAnchor = bounds;
    const v = viewportSize();
    const b = barSize();
    const t = cfg().timing || {};
    const { left, top } = computeAnchor({
      bounds, barW: b.w, barH: b.h, viewW: v.w, viewH: v.h,
      offset: t.anchorOffsetPx, pad: t.viewportPadPx, railRect: railRectInViewport(),
    });
    els.bar.style.left = `${left}px`;
    els.bar.style.top = `${top}px`;
    state.repositionOpenFlyout && state.repositionOpenFlyout();
  };

  // ── TB-1: hide during canvas drag/draw (own listeners; renderer.js is
  // read-only for this lane). ───────────────────────────────────────────
  const bindCanvasDrag = () => {
    if (state.canvasDragBound || !G.document) return;
    const canvas = G.document.getElementById('main-canvas');
    if (!canvas) return;
    state.canvasDragBound = true;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      state.drag.engaged = true;
      state.drag.active = false;
      state.drag.x = e.clientX || 0;
      state.drag.y = e.clientY || 0;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!state.drag.engaged || state.drag.active) return;
      const dx = (e.clientX || 0) - state.drag.x;
      const dy = (e.clientY || 0) - state.drag.y;
      if ((dx * dx + dy * dy) >= 9) { state.drag.active = true; refresh(); }
    });
    const end = () => {
      if (!state.drag.engaged && !state.drag.active) return;
      state.drag.engaged = false;
      state.drag.active = false;
      refresh(); // reappear + re-anchor at the new position
    };
    G.addEventListener('pointerup', end, true);
    G.addEventListener('pointercancel', end, true);
  };

  // ── context detection ─────────────────────────────────────────────────
  const getContext = () => {
    const app = getApp();
    const renderer = getRenderer();
    if (!renderer) return { kind: 'idle', layerIds: [], primaryLayer: null, app, renderer };
    const ids = renderer.selectedLayerIds ? Array.from(renderer.selectedLayerIds) : [];
    const layers = renderer.getSelectedLayers ? renderer.getSelectedLayers() : [];
    const tool = renderer.activeTool || 'select';
    let kind;
    let primary = layers[0] || null;
    // A group container may be selected together with its descendants (the
    // grouping op selects [group, ...children]); treat that as the group state.
    const groupContainer = selectedGroupContainer(app, layers);
    if (tool === 'direct') {
      kind = 'direct';
    } else if (groupContainer) {
      kind = 'group';
      primary = groupContainer;
    } else if (ids.length === 0) {
      kind = 'idle';
    } else if (ids.length === 1) {
      const layer = layers[0] || null;
      if (layer && layer.type === 'text') kind = 'single-text';
      else if (isPrimitiveShape(layer)) kind = 'single-shape';
      else if (isDrawableAlgoLayer(layer)) kind = 'single-algo';
      else kind = 'single-path';
    } else {
      kind = 'multi';
    }
    return { kind, layerIds: ids, primaryLayer: primary, app, renderer };
  };

  // Returns the sole selected group container when the selection is exactly one
  // group (optionally alongside its own descendants), else null. Mirrors the
  // Illustrator "a group counts as one object" semantics on top of Vectura's
  // grouping op, which selects [group, ...children].
  const selectedGroupContainer = (app, layers) => {
    const groups = layers.filter((l) => l && l.isGroup && l.type !== 'compound');
    if (groups.length !== 1) return null;
    const g = groups[0];
    const others = layers.filter((l) => l && l.id !== g.id);
    if (others.length === 0) return g;
    const engine = app && app.engine;
    if (!engine || typeof engine.getLayerAncestors !== 'function') return null;
    const allDesc = others.every((o) => (engine.getLayerAncestors(o) || []).some((a) => a.id === g.id));
    return allDesc ? g : null;
  };

  const isPrimitiveShape = (layer) => {
    const renderer = getRenderer();
    if (!renderer || !layer) return false;
    if (typeof renderer.getSelectedPrimitiveShapeLayer === 'function') {
      const p = renderer.getSelectedPrimitiveShapeLayer();
      return Boolean(p && p.id === layer.id);
    }
    return false;
  };
  // A single-selected drawable GENERATOR layer (flowfield, boids, spiral, …) as
  // opposed to a manual vector path (`shape`), a live primitive, text, a group,
  // or a modifier. These get algorithm-aware task-bar affordances (switch algo,
  // presets, randomize, expand) instead of Edit Path — their output is many
  // paths, not one editable contour.
  const isDrawableAlgoLayer = (layer) => {
    if (!layer || layer.isGroup) return false;
    const t = layer.type;
    if (!t || t === 'text' || t === 'shape' || t === 'group' || t === 'compound') return false;
    if (isPrimitiveShape(layer)) return false;
    const ui = getApp() && getApp().ui;
    // isDrawableLayerType already excludes modifiers/groups; text/shape are
    // filtered above (they are technically in the registry too).
    if (ui && typeof ui.isDrawableLayerType === 'function') return Boolean(ui.isDrawableLayerType(t));
    const V = Vectura || {};
    const algos = V.Algorithms || V.AlgorithmRegistry;
    const defs = V.ALGO_DEFAULTS;
    return Boolean((algos && algos[t]) || (defs && defs[t]));
  };
  const primitiveShapeKind = () => {
    const renderer = getRenderer();
    if (!renderer || typeof renderer.getSelectedPrimitiveShapeLayer !== 'function') return null;
    const p = renderer.getSelectedPrimitiveShapeLayer();
    if (!p) return null;
    const meta = renderer.getShapeMetaForLayer ? renderer.getShapeMetaForLayer(p, 0) : null;
    return (meta && meta.shape && meta.shape.type) || null;
  };

  // ── button factory ────────────────────────────────────────────────────
  const makeBtn = ({ icon, label, tooltip, disabled, onClick, extraClass }) => {
    const btn = el('button', 'ctxbar-btn' + (label ? ' ctxbar-btn--labeled' : '') + (extraClass ? ` ${extraClass}` : ''), {
      type: 'button',
      tabindex: '-1',
      'data-ctxbar-roving': '',
    });
    if (icon) { const ic = el('span', 'ctxbar-ico'); ic.innerHTML = icon; btn.appendChild(ic); }
    if (label) { const lb = el('span', 'ctxbar-label'); lb.textContent = label; btn.appendChild(lb); }
    if (tooltip) { btn.title = tooltip; btn.setAttribute('aria-label', tooltip); }
    if (disabled) { btn.disabled = true; btn.classList.add('is-disabled'); }
    if (onClick && !disabled) btn.addEventListener('click', (e) => { e.preventDefault(); onClick(e); });
    return btn;
  };

  const appendPenChip = (ctx) => {
    const PenPicker = UI.PenPicker;
    if (!PenPicker || typeof PenPicker.createChip !== 'function') return;
    const chip = PenPicker.createChip({
      app: ctx.app,
      getTargetLayerIds: () => (getContext().layerIds),
    });
    if (chip) { chip.setAttribute('tabindex', '-1'); chip.setAttribute('data-ctxbar-roving', ''); els.content.appendChild(chip); }
  };

  // ── sub-mode entry (feature-detected Lane H) ──────────────────────────
  const modes = () => UI.ContextBarModes || null;
  const enterStroke = () => { const m = modes(); m && m.enterStrokeWeight && m.enterStrokeWeight(getContext()); };
  const enterSimplify = () => { const m = modes(); m && m.enterSimplify && m.enterSimplify(getContext()); };
  const enterSmooth = () => { const m = modes(); if (m && m.enterSmooth) { m.enterSmooth(getContext()); return true; } return false; };
  const enterShapeProps = () => { const m = modes(); m && m.enterShapeProps && m.enterShapeProps(getContext()); };

  // ── TB-3..7: per-context content renderers ─────────────────────────────
  const B = () => (cfg().buttons || {});
  const IC = () => (cfg().icons || {});

  const renderIdle = () => {
    const b = B(); const ic = IC();
    // Add Layer dropdown sits left of Draw — full parity with the sidebar's
    // Add Layer menu (Algorithm Layer submenu, Mirror/Morph Modifier Group,
    // Empty Layer, Empty Group), just reachable without leaving the canvas.
    const addWrap = makeAddLayerDropdown();
    if (addWrap) els.content.appendChild(addWrap);
    els.content.appendChild(makeBtn({
      icon: ic.draw, label: (b.draw && b.draw.label), tooltip: (b.draw && b.draw.tooltip),
      onClick: activateDraw,
    }));
    // Document Setup is pre-approved as a second idle item (SPEC TB-3).
    els.content.appendChild(makeBtn({
      icon: ic.documentSetup, label: (b.documentSetup && b.documentSetup.label),
      tooltip: (b.documentSetup && b.documentSetup.tooltip), onClick: openDocumentSetup,
    }));
  };

  const renderSingle = (ctx) => {
    const b = B(); const ic = IC();
    const layer = ctx.primaryLayer;
    const locked = layerLocked(layer);
    // Edit Path → Direct Selection tool (flips to TB-6 state).
    els.content.appendChild(makeBtn({
      icon: ic.editPath, label: (b.editPath && b.editPath.label), tooltip: (b.editPath && b.editPath.tooltip),
      onClick: () => setTool('direct'),
    }));
    appendPenChip(ctx);
    // Stroke weight is now a per-pen property (slider + textbox in each pen
    // row) — the standalone per-layer stroke-weight sub-mode was removed here.
    // Shape-properties icon (live rect/polygon only) → SHP-1/2 popover.
    const shapeKind = primitiveShapeKind();
    if (shapeKind === 'rect' || shapeKind === 'polygon') {
      els.content.appendChild(makeBtn({
        icon: shapeKind === 'polygon' ? ic.shapePolygon : ic.shapeRect,
        tooltip: (b.shapeProps && b.shapeProps.tooltip), onClick: enterShapeProps,
      }));
    }
    // Make Mask slot — reserved when mask-capable; absent while masking unbuilt.
    if (maskCapable(layer)) {
      els.content.appendChild(makeBtn({
        icon: ic.makeMask, tooltip: (b.makeMask && b.makeMask.tooltip), onClick: doMakeMask,
      }));
    }
    // Lock toggle.
    els.content.appendChild(makeBtn({
      icon: locked ? ic.unlock : ic.lock,
      tooltip: locked ? (b.lock && b.lock.tooltipUnlock) : (b.lock && b.lock.tooltip),
      onClick: () => toggleLock(ctx.layerIds), extraClass: locked ? 'is-active' : '',
    }));
  };

  // ── TB-4b: single drawable-algorithm layer ────────────────────────────
  // Algorithm-aware affordances: switch the generator, apply a preset, reroll a
  // variation, and expand to an editable group. Edit Path is intentionally
  // omitted — a generator emits many paths, so "Expand into group" is the route
  // to anchor-level editing.
  const renderAlgo = (ctx) => {
    const b = B(); const ic = IC();
    const layer = ctx.primaryLayer;
    const locked = layerLocked(layer);
    // Switch algorithm — labeled pill mirroring the docked module dropdown.
    const algoWrap = makeAlgoSwitcher(layer);
    if (algoWrap) els.content.appendChild(algoWrap);
    // Presets — flyout of the layer system's named presets (absent when none).
    const presetWrap = makePresetFlyout(layer);
    if (presetWrap) els.content.appendChild(presetWrap);
    // Randomize (single die) — reroll the full param set, same as the
    // Algorithm Configuration panel's Randomize button.
    els.content.appendChild(makeBtn({
      icon: ic.randomize, tooltip: (b.randomize && b.randomize.tooltip),
      onClick: () => doRandomizeAlgo(layer), disabled: locked,
    }));
    // Expand into group — bakes the generator to child shape layers (editable).
    els.content.appendChild(makeBtn({
      icon: ic.expand, label: (b.expand && b.expand.label), tooltip: (b.expand && b.expand.tooltip),
      onClick: () => doExpandLayer(layer), disabled: locked,
    }));
    appendPenChip(ctx);
    els.content.appendChild(makeBtn({
      icon: locked ? ic.unlock : ic.lock,
      tooltip: locked ? (b.lock && b.lock.tooltipUnlock) : (b.lock && b.lock.tooltip),
      onClick: () => toggleLock(ctx.layerIds), extraClass: locked ? 'is-active' : '',
    }));
  };

  const renderMulti = (ctx) => {
    const b = B(); const ic = IC();
    els.content.appendChild(makeBtn({
      icon: ic.group, label: (b.group && b.group.label), tooltip: (b.group && b.group.tooltip),
      onClick: doGroup,
    }));
    // Align flyout.
    els.content.appendChild(makeAlignButton());
    appendPenChip(ctx);
  };

  const renderGroup = (ctx) => {
    const b = B(); const ic = IC();
    els.content.appendChild(makeBtn({
      icon: ic.ungroup, label: (b.ungroup && b.ungroup.label), tooltip: (b.ungroup && b.ungroup.tooltip),
      onClick: doUngroup,
    }));
    els.content.appendChild(makeBtn({
      icon: ic.isolate, tooltip: (b.isolate && b.isolate.tooltip), onClick: () => doIsolate(ctx.primaryLayer),
    }));
    appendPenChip(ctx);
  };

  const renderText = (ctx) => {
    const b = B(); const ic = IC();
    const layer = ctx.primaryLayer;
    // Font family / style / size bind to the existing Text panel params (same
    // state, two surfaces). Rendered as compact controls that mirror the panel.
    appendTextControls(ctx);
    // Outline the text — icon-only (hollow-T glyph); the tooltip carries the
    // wording so the bar stays compact.
    els.content.appendChild(makeBtn({
      icon: ic.outlineText,
      tooltip: (b.outlineText && b.outlineText.tooltip), onClick: () => doOutlineText(ctx.primaryLayer),
    }));
    // Point Type ↔ Area Type toggle — sits to the RIGHT of Outline
    // (Illustrator-parity). Reflects the current mode and flips it on click.
    const isArea = !!(layer && layer.params && layer.params.textMode === 'area');
    const pa = b.pointArea || {};
    els.content.appendChild(makeBtn({
      icon: isArea ? ic.areaType : ic.pointType,
      tooltip: isArea ? pa.tooltipToPoint : pa.tooltipToArea,
      onClick: () => doToggleTextMode(layer),
      extraClass: isArea ? 'is-active' : '',
    }));
    appendPenChip(ctx);
  };

  const doToggleTextMode = (layer) => {
    const a = getApp();
    const te = a && a.textEdit;
    if (!te || typeof te.convertTextMode !== 'function' || !layer) return;
    // Seed a sensible frame when converting Point → Area from the layer's
    // current on-canvas bounds (unscaled), mirroring the canvas widget.
    let dims;
    const r = getRenderer();
    try {
      const bnds = r && r.getSelectionBounds ? r.getSelectionBounds([layer]) : null;
      if (bnds) {
        const sX = Math.abs(layer.params.scaleX) || 1;
        const sY = Math.abs(layer.params.scaleY) || 1;
        dims = { width: (bnds.maxX - bnds.minX) / sX, height: (bnds.maxY - bnds.minY) / sY };
      }
    } catch (_e) { /* bounds optional */ }
    te.convertTextMode(layer, 'toggle', dims);
    getApp()?.render?.();
    restoreState();
  };

  const renderDirect = (ctx) => {
    const b = B(); const ic = IC();
    els.content.appendChild(makeBtn({
      icon: ic.simplify, label: (b.simplify && b.simplify.label), tooltip: (b.simplify && b.simplify.tooltip),
      onClick: enterSimplify,
    }));
    els.content.appendChild(makeBtn({
      icon: ic.smooth, label: (b.smooth && b.smooth.label), tooltip: (b.smooth && b.smooth.tooltip),
      // Open the progressive Smooth slider (Done + Auto); fall back to the
      // one-shot verb if the sub-mode isn't available.
      onClick: () => { if (!enterSmooth()) doSmooth(); },
    }));
    // Anchor verb group — visible but disabled until eligible.
    const elig = anchorEligibility();
    const verb = (key, iconKey, fn) => {
      const meta = b[key] || {};
      const ok = elig[key];
      els.content.appendChild(makeBtn({
        icon: ic[iconKey], tooltip: ok ? meta.tooltip : (meta.tooltipOff || meta.tooltip),
        disabled: !ok, onClick: fn, extraClass: 'ctxbar-anchor-verb',
      }));
    };
    verb('anchorAdd', 'anchorAdd', () => anchorOp('add'));
    verb('anchorDelete', 'anchorDelete', () => anchorOp('delete'));
    verb('anchorConnect', 'anchorConnect', () => anchorOp('connect'));
    verb('anchorCut', 'anchorCut', () => anchorOp('cut'));
    verb('anchorCorner', 'anchorCorner', () => anchorOp('corner'));
    verb('anchorSmooth', 'anchorSmooth', () => anchorOp('smooth'));
  };

  const renderContext = (ctx) => {
    if (!els.content) return;
    els.content.textContent = '';
    switch (ctx.kind) {
      case 'idle': renderIdle(); break;
      case 'single-text': renderText(ctx); break;
      case 'group': renderGroup(ctx); break;
      case 'single-algo': renderAlgo(ctx); break;
      case 'single-shape':
      case 'single-path': renderSingle(ctx); break;
      case 'multi': renderMulti(ctx); break;
      case 'direct': renderDirect(ctx); break;
      default: renderIdle();
    }
    updateRoving();
  };

  // ── verb wiring (all existing Vectura verbs — the bar is a surface) ────
  const setTool = (tool) => {
    const a = getApp();
    if (a && a.ui && typeof a.ui.setActiveTool === 'function') a.ui.setActiveTool(tool);
    else getRenderer()?.setTool?.(tool);
  };
  const activateDraw = () => {
    const a = getApp();
    if (a && a.ui && typeof a.ui.setActiveTool === 'function') {
      a.ui.setActiveTool('pen');
      a.ui.setPenMode?.('draw');
    } else { getRenderer()?.setTool?.('pen'); }
  };
  const openDocumentSetup = () => {
    // The real File ▸ Document Setup trigger is #btn-settings (its onclick →
    // toggleSettingsPanel()). Selector is config-owned.
    const sel = cfg().documentSetupTrigger || '#btn-settings';
    G.document.querySelector(sel)?.click?.();
  };
  const doGroup = () => { getApp()?.ui?.groupSelection?.(); };
  const doUngroup = () => { getApp()?.ui?.ungroupSelection?.(); };
  const doIsolate = (group) => {
    const a = getApp();
    const renderer = getRenderer();
    if (!renderer || !group) return;
    // enterGroupEditMode expects a child whose parent is the group; drill into
    // the group's first selectable child (mirrors the double-click path).
    const kids = a && a.engine && a.engine.getLayerChildren ? a.engine.getLayerChildren(group.id) : [];
    const child = (kids || []).find((l) => l && l.visible !== false && !renderer.isLayerLocked?.(l.id));
    if (child) renderer.enterGroupEditMode?.(child);
  };
  const layerLocked = (layer) => {
    if (!layer) return false;
    const renderer = getRenderer();
    return Boolean(renderer && renderer.isLayerLocked && renderer.isLayerLocked(layer.id));
  };
  const toggleLock = (ids) => {
    const a = getApp();
    const ui = a && a.ui;
    if (!ui || !ui.layerLockedIds) return;
    const anyUnlocked = ids.some((id) => !ui.layerLockedIds.has(id));
    ids.forEach((id) => { anyUnlocked ? ui.layerLockedIds.add(id) : ui.layerLockedIds.delete(id); });
    ui.renderLayers?.();
    getApp()?.render?.();
    restoreState();
  };
  const maskCapable = () => false; // masking lanes unbuilt → slot absent (TB-4).
  const doMakeMask = () => { /* reserved for masking-doc CTB-2 */ };

  const doSmooth = () => {
    const ops = Vectura.PathEditOps;
    const ctx = getContext();
    if (!ops || typeof ops.smoothSelection !== 'function') return;
    // PTH-3 smoothSelection no-ops at strength 0 and owns its own push-before-
    // change history, so pass a config-driven default strength (mirrors the
    // CTX-1 context menu) and let the op push history exactly once.
    const cm = Vectura.CONTEXT_MENU;
    const strength = (cm && Number.isFinite(cm.smoothStrength)) ? cm.smoothStrength : 0.5;
    ops.smoothSelection(ctx.layerIds, strength, { app: getApp() });
    getApp()?.render?.();
  };
  const doOutlineText = (layer) => {
    const ops = Vectura.TextOutlineOps;
    if (!ops || typeof ops.outlineText !== 'function' || !layer) return;
    const res = ops.outlineText(layer.id, { app: getApp() });
    // On success the selection becomes the produced group → the ticker flips
    // the bar to the group state automatically.
    if (res) restoreState();
  };

  // Anchor eligibility + ops — gated on the ACTUAL anchor selection (the
  // renderer exposes selection refs {layerId, pathIndex, anchorIndex}) and
  // narrowed by the PathEditOps predicates. The buttons stay visible but
  // disabled until the selection satisfies each verb's rule.
  const selectedAnchorRefs = () => {
    const renderer = getRenderer();
    return (renderer && typeof renderer.getSelectedAnchorRefs === 'function')
      ? renderer.getSelectedAnchorRefs() : [];
  };
  const anchorEligibility = () => {
    const ops = Vectura.PathEditOps;
    const renderer = getRenderer();
    const refs = selectedAnchorRefs();
    const app = getApp();
    const hasPath = !!(renderer && renderer.directSelection);
    const hasSel = refs.length > 0;
    const okJoin = hasSel && ops && ops.canJoin ? safe(() => ops.canJoin(refs, { app }))?.ok === true : false;
    const okCut = hasSel && ops && ops.canCut ? safe(() => ops.canCut(refs, { app }))?.ok === true : false;
    const okConvert = hasSel && ops && ops.canConvert ? safe(() => ops.canConvert(refs, { app }))?.ok === true : false;
    // Convert-to-Corner / Convert-to-Smooth act as a TOGGLE: for a uniform
    // selection only the opposite of the current anchor type is actionable
    // (converting a corner to a corner is a no-op). A MIXED selection (both
    // corner and smooth anchors) enables BOTH so you can unify them.
    const types = (renderer && typeof renderer.getSelectedAnchorTypes === 'function')
      ? renderer.getSelectedAnchorTypes() : { hasCorner: false, hasSmooth: false };
    return {
      anchorAdd: hasPath,       // a path is open for editing → can enter add mode
      anchorDelete: hasSel,     // remove the selected anchor(s)
      anchorConnect: okJoin,    // exactly two open endpoints
      anchorCut: okCut,         // a cuttable (interior/closed) anchor
      anchorCorner: okConvert && types.hasSmooth, // something non-corner to cornerize
      anchorSmooth: okConvert && types.hasCorner, // something non-smooth to smoothen
    };
  };
  const safe = (fn) => { try { return fn(); } catch (_) { return false; } };
  const enterAddAnchorMode = () => {
    // "Add anchor point" is a click tool (Illustrator-parity): switch to the
    // pen in add-anchor mode so the next canvas click inserts an anchor.
    const r = getRenderer();
    setTool('pen');
    r?.setPenMode?.('add');
  };
  const anchorOp = (which) => {
    const ops = Vectura.PathEditOps;
    if (!ops) return;
    if (which === 'add') { enterAddAnchorMode(); return; }
    const refs = selectedAnchorRefs();
    if (!refs.length) return;
    const app = getApp();
    // delete / cut / connect change the anchor COUNT/ORDER, so the renderer's
    // selectedIndices would point at shifted anchors afterward. Clear the stale
    // anchor selection for those (convert-corner/smooth keep the count).
    const structural = which === 'delete' || which === 'cut' || which === 'connect';
    try {
      if (which === 'connect' && ops.joinEndpoints) ops.joinEndpoints(refs, { app });
      else if (which === 'delete' && ops.deleteAnchors) ops.deleteAnchors(refs, { app });
      else if (which === 'cut' && ops.cutAtAnchors) ops.cutAtAnchors(refs, { app });
      else if (which === 'corner' && ops.convertAnchorsToCorner) ops.convertAnchorsToCorner(refs, { app });
      else if (which === 'smooth' && ops.convertAnchorsToSmooth) ops.convertAnchorsToSmooth(refs, { app });
      // Each PathEditOps verb owns its own single push-before-change history
      // (see path-edit-ops.js header) — the bar must NOT pre-push here.
    } catch (_) { /* op guarded */ }
    if (structural) {
      const renderer = getRenderer();
      const clear = (sel) => { if (sel && sel.selectedIndices && sel.selectedIndices.clear) sel.selectedIndices.clear(); };
      if (renderer) {
        clear(renderer.directSelection);
        (renderer.directAuxSelections || []).forEach(clear);
      }
    }
    getApp()?.render?.();
    restoreState();
  };

  // ── TB-5: Align flyout (reuses the docked panel's align buttons) ───────
  const makeAlignButton = () => {
    const b = B(); const ic = IC();
    const wrap = el('div', 'ctxbar-align-wrap');
    const btn = makeBtn({ icon: ic.align, tooltip: (b.align && b.align.tooltip), onClick: null });
    // manual toggle (makeBtn skips onClick when null)
    let open = false;
    const fly = el('div', 'ctxbar-align-flyout', { role: 'menu', 'aria-hidden': 'true' });
    const ac = cfg().align || {};
    (ac.groups || []).forEach((grp) => {
      const gEl = el('div', 'ctxbar-align-group');
      const lbl = el('div', 'ctxbar-align-group-label'); lbl.textContent = grp.label; gEl.appendChild(lbl);
      const row = el('div', 'ctxbar-align-row');
      (grp.actions || []).forEach((a) => {
        const ab = makeBtn({
          icon: ic[a.icon], tooltip: a.tooltip,
          onClick: () => { closeFly(); runAlign(a.op); },
        });
        ab.classList.add('ctxbar-align-btn');
        row.appendChild(ab);
      });
      gEl.appendChild(row);
      fly.appendChild(gEl);
    });
    const openFly = () => { open = true; fly.classList.add('is-open'); fly.setAttribute('aria-hidden', 'false'); btn.setAttribute('aria-expanded', 'true'); state.closeFlyout = closeFly; };
    const closeFly = () => { open = false; fly.classList.remove('is-open'); fly.setAttribute('aria-hidden', 'true'); btn.setAttribute('aria-expanded', 'false'); if (state.closeFlyout === closeFly) state.closeFlyout = null; };
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open ? closeFly() : openFly(); });
    wrap.appendChild(btn);
    wrap.appendChild(fly);
    return wrap;
  };
  const runAlign = (op) => {
    // Dispatch a click on the docked multi-selection panel's matching button so
    // the geometry path is byte-identical (TB-5 acceptance).
    const btn = G.document.querySelector(`.align-btn[data-align-op="${op}"]`);
    if (btn) { btn.click(); return; }
    // Fallback: drive AlignOps directly if the docked panel isn't mounted.
    const AO = Vectura.AlignOps;
    const a = getApp();
    if (!AO || !a) return;
    // (Best-effort — the docked button is the primary path.)
  };

  // ── TB-4b: algorithm-layer affordances ────────────────────────────────
  // A labeled dropdown pill (reuses the text-field chip styling). Caret + label
  // (+ optional leading icon, used by the algorithm switcher), no bound picker
  // — the caller wires the toggle via makeMenuFlyout/makeAlgoFlyout.
  const makeDropField = (extraClass, text, title, iconHtml, iconColor) => {
    const field = el('span', `ctxbar-text-field ${extraClass}`);
    field.setAttribute('tabindex', '-1'); field.setAttribute('data-ctxbar-roving', '');
    field.setAttribute('role', 'button'); field.setAttribute('aria-haspopup', 'menu');
    field.setAttribute('aria-expanded', 'false');
    if (title) field.title = title;
    if (iconHtml) {
      const ico = el('span', 'lvl-algo-sub-ico');
      ico.style.color = iconColor || '';
      ico.innerHTML = iconHtml;
      field.appendChild(ico);
    }
    const lbl = el('span', 'ctxbar-text-fieldlabel'); lbl.textContent = text; field.appendChild(lbl);
    const caret = el('span', 'ctxbar-text-caret'); caret.textContent = '▾'; caret.setAttribute('aria-hidden', 'true');
    field.appendChild(caret);
    return field;
  };
  // Wraps `field` with a vertical menu flyout (reuses the align-flyout box +
  // menu-item styling, like the text-weight dropdown). `items` entries are
  // either `{ header }` group labels or `{ label, active, onSelect }` rows.
  const makeMenuFlyout = (field, items, extraFlyClass) => {
    const wrap = el('span', 'ctxbar-align-wrap ctxbar-algo-menu-wrap');
    const fly = el('div', `ctxbar-align-flyout ${extraFlyClass || ''}`.trim(), { role: 'menu', 'aria-hidden': 'true' });
    let open = false;
    const close = () => {
      open = false; fly.classList.remove('is-open'); fly.setAttribute('aria-hidden', 'true');
      field.setAttribute('aria-expanded', 'false'); if (state.closeFlyout === close) state.closeFlyout = null;
    };
    const openFn = () => {
      if (state.closeFlyout && state.closeFlyout !== close) state.closeFlyout(); // close any other open flyout
      open = true; fly.classList.add('is-open'); fly.setAttribute('aria-hidden', 'false');
      field.setAttribute('aria-expanded', 'true'); state.closeFlyout = close;
    };
    (items || []).forEach((it) => {
      if (it.header) { const h = el('div', 'ctxbar-align-group-label'); h.textContent = it.header; fly.appendChild(h); return; }
      const item = el('button', 'ctxbar-menu-item', { type: 'button', tabindex: '-1' });
      item.textContent = it.label;
      if (it.active) { item.classList.add('is-active'); item.style.color = 'var(--ui-accent, #4e9ee1)'; }
      item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); it.onSelect && it.onSelect(); });
      fly.appendChild(item);
    });
    field.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open ? close() : openFn(); });
    wrap.appendChild(field); wrap.appendChild(fly);
    return wrap;
  };

  // Algorithm switcher — sourced from the same list/icon/color helpers as the
  // Add Layer algorithm submenu and the left-pane module dropdown
  // (Vectura.UI.utils.getDrawableAlgorithmOptions/renderAlgoMenuHTML), so all
  // three surfaces render an identical grouped, icon-labeled list from one
  // place. On pick, drives the real docked <select> so the switch path stays
  // byte-identical to the other two.
  const makeAlgoSwitcher = (layer) => {
    const b = B();
    const utils = window.Vectura.UI && window.Vectura.UI.utils;
    const items = (utils && utils.getDrawableAlgorithmOptions && utils.getDrawableAlgorithmOptions()) || [];
    if (!items.length) return null;
    const curType = layer && layer.type;
    const hit = items.find((it) => it.type === curType);
    const curLabel = (hit && hit.label) || prettifyType(curType);
    const curIcon = utils && utils.getAlgoMenuIcon ? utils.getAlgoMenuIcon(curType) : '';
    const curColor = utils && utils.getAlgoMenuColor ? utils.getAlgoMenuColor(curType) : '';
    const field = makeDropField('ctxbar-algo-field', curLabel, (b.changeAlgo && b.changeAlgo.tooltip), curIcon, curColor);
    return makeAlgoFlyout(field, items, curType);
  };
  // Wraps `field` with the shared grouped/iconed algorithm list markup (same
  // `algo-group-div`/`lvl-algo-sub-item` rows as the other two pickers) and
  // routes row clicks through `switchAlgorithm` via event delegation.
  const makeAlgoFlyout = (field, items, curType) => {
    const wrap = el('span', 'ctxbar-align-wrap ctxbar-algo-menu-wrap');
    const fly = el('div', 'ctxbar-align-flyout ctxbar-algo-flyout', { role: 'menu', 'aria-hidden': 'true' });
    const utils = window.Vectura.UI && window.Vectura.UI.utils;
    fly.innerHTML = (utils && utils.renderAlgoMenuHTML) ? utils.renderAlgoMenuHTML(items, curType) : '';
    let open = false;
    const close = () => {
      open = false; fly.classList.remove('is-open'); fly.setAttribute('aria-hidden', 'true');
      field.setAttribute('aria-expanded', 'false'); if (state.closeFlyout === close) state.closeFlyout = null;
    };
    const openFn = () => {
      if (state.closeFlyout && state.closeFlyout !== close) state.closeFlyout(); // close any other open flyout
      open = true; fly.classList.add('is-open'); fly.setAttribute('aria-hidden', 'false');
      field.setAttribute('aria-expanded', 'true'); state.closeFlyout = close;
    };
    fly.addEventListener('click', (e) => {
      const row = e.target.closest('[data-algo-type]');
      if (!row) return;
      e.preventDefault(); e.stopPropagation();
      close();
      switchAlgorithm(row.getAttribute('data-algo-type'));
    });
    field.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open ? close() : openFn(); });
    wrap.appendChild(field); wrap.appendChild(fly);
    return wrap;
  };

  // Flips `fly` to open upward (and rotates `caret` to match) when there's
  // more room above `wrap` than below, so the flyout never clips at the
  // viewport edge. Called once on open, and again whenever the bar itself
  // moves (drag or auto-anchor) so the direction stays correct live.
  const positionFlyoutForSpace = (wrap, fly, caret) => {
    const r = wrap.getBoundingClientRect();
    const viewH = G.innerHeight || (G.document && G.document.documentElement.clientHeight) || 0;
    const openUp = r.top > (viewH - r.bottom);
    fly.classList.toggle('ctxbar-flyout-up', openUp);
    if (caret) caret.classList.toggle('ctxbar-caret-up', openUp);
  };

  // ── TB-3: idle "Add Layer" dropdown ────────────────────────────────────
  // Full parity with the sidebar's Add Layer menu (`#btn-add-layer`/
  // `#layer-add-menu` in shortcuts.js): Algorithm Layer (drill-down to the
  // same shared grouped algo list as the switcher/module dropdown/sidebar
  // submenu), Mirror/Morph Modifier Group, Empty Layer, Empty Group — wired
  // to the same underlying UI/engine actions so behavior stays identical,
  // just reachable from the floating bar. A click-to-drill-down list (rather
  // than the sidebar's hover-revealed side submenu) avoids clipping inside
  // the scrollable flyout box and works the same on touch.
  const makeAddLayerDropdown = () => {
    const b = B(); const ic = IC();
    const utils = window.Vectura.UI && window.Vectura.UI.utils;
    const algoItems = (utils && utils.getDrawableAlgorithmOptions && utils.getDrawableAlgorithmOptions()) || [];
    const field = makeDropField(
      'ctxbar-add-layer-field', (b.addLayer && b.addLayer.label) || 'Add Layer',
      (b.addLayer && b.addLayer.tooltip), ic.addLayer,
    );
    const wrap = el('span', 'ctxbar-align-wrap ctxbar-algo-menu-wrap');
    const fly = el('div', 'ctxbar-align-flyout ctxbar-algo-flyout ctxbar-add-layer-flyout', { role: 'menu', 'aria-hidden': 'true' });
    const caret = field.querySelector('.ctxbar-text-caret');
    let open = false;
    // `ctxbar-add-layer-item`, not `ctxbar-menu-item` — the overflow ⋯ menu
    // queries `.ctxbar-menu-item` globally (unscoped) to manage its own rows,
    // and this flyout renders alongside it in the idle state.
    const mkRow = (label) => {
      const row = el('div', 'ctxbar-add-layer-item', { role: 'menuitem', tabindex: '-1' });
      row.textContent = label;
      return row;
    };
    const renderRoot = () => {
      fly.textContent = '';
      const algoRow = mkRow('Algorithm Layer ›');
      algoRow.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); showAlgoList(); });
      fly.appendChild(algoRow);
      const mirrorRow = mkRow('Mirror Modifier Group');
      mirrorRow.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); doInsertModifier('mirror'); });
      fly.appendChild(mirrorRow);
      const morphRow = mkRow('Morph Modifier Group');
      morphRow.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); doInsertModifier('morph'); });
      fly.appendChild(morphRow);
      const emptyLayerRow = mkRow('Empty Layer');
      emptyLayerRow.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); doAddEmptyLayer(); });
      fly.appendChild(emptyLayerRow);
      const emptyGroupRow = mkRow('Empty Group');
      emptyGroupRow.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); doAddGroupLayer(); });
      fly.appendChild(emptyGroupRow);
    };
    const showAlgoList = () => {
      fly.textContent = '';
      const back = mkRow('‹ Algorithm Layer');
      back.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); renderRoot(); });
      fly.appendChild(back);
      const list = el('div', '');
      list.innerHTML = (utils && utils.renderAlgoMenuHTML) ? utils.renderAlgoMenuHTML(algoItems, null) : '';
      fly.appendChild(list);
    };
    const close = () => {
      open = false; fly.classList.remove('is-open'); fly.setAttribute('aria-hidden', 'true');
      field.setAttribute('aria-expanded', 'false'); if (state.closeFlyout === close) state.closeFlyout = null;
      renderRoot(); // reset to the top-level list for the next time it opens
    };
    const reposition = () => positionFlyoutForSpace(wrap, fly, caret);
    const openFn = () => {
      if (state.closeFlyout && state.closeFlyout !== close) state.closeFlyout();
      open = true; fly.classList.add('is-open'); fly.setAttribute('aria-hidden', 'false');
      field.setAttribute('aria-expanded', 'true'); state.closeFlyout = close;
      reposition();
    };
    // Delegated: rows in the algo drill-down list carry `data-algo-type`.
    fly.addEventListener('click', (e) => {
      const row = e.target.closest('[data-algo-type]');
      if (!row) return;
      e.preventDefault(); e.stopPropagation();
      close();
      doAddAlgoLayer(row.getAttribute('data-algo-type'));
    });
    renderRoot();
    field.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open ? close() : openFn(); });
    wrap.appendChild(field); wrap.appendChild(fly);
    // The caret must hint the correct open direction even while closed (e.g.
    // right after a hard refresh with the bar pinned near the bottom), so this
    // registers unconditionally rather than only while open — `reanchor()`
    // calls it every tick regardless of open/closed state. Calling `reposition()`
    // here directly would be premature: `wrap` isn't attached to the document
    // yet (the caller appends it right after this returns), so it would only
    // measure a zero rect — `reanchor()` runs `state.repositionOpenFlyout()`
    // synchronously right after this render completes, once attached, which is
    // the earliest point an accurate measurement is possible.
    state.repositionOpenFlyout = reposition;
    return wrap;
  };
  const doAddAlgoLayer = (layerType) => {
    const a = getApp();
    const ui = a && a.ui;
    if (!a || !a.engine || typeof a.engine.addLayer !== 'function') return;
    a.pushHistory && a.pushHistory();
    const activeLayer = a.engine.getActiveLayer?.();
    const id = a.engine.addLayer(layerType);
    const created = ui && ui.getLayerById ? ui.getLayerById(id) : null;
    if (created && ui) ui.rememberDrawableLayerType?.(created);
    const selectedModifier = (activeLayer && ui && ui.isModifierLayer?.(activeLayer)) ? activeLayer : null;
    if (selectedModifier && created) {
      ui.assignLayersToParent?.(selectedModifier.id, [created], { selectAssigned: true, primaryId: id });
    } else if (a.renderer) {
      a.renderer.setSelection([id], id);
    }
    ui && ui.renderLayers && ui.renderLayers();
    ui && ui.buildControls && ui.buildControls();
    a.render && a.render();
    restoreState();
  };
  // insertMirrorModifier/insertMorphModifier own history + selection + render
  // + renderLayers already — no need to repeat any of that here.
  const doInsertModifier = (kind) => {
    const ui = getApp()?.ui;
    const fn = ui && (kind === 'morph' ? ui.insertMorphModifier : ui.insertMirrorModifier);
    if (typeof fn !== 'function') return;
    fn.call(ui);
    restoreState();
  };
  const doAddEmptyLayer = () => {
    const a = getApp();
    if (!a || !a.engine || typeof a.engine.addEmptyLayer !== 'function') return;
    a.pushHistory && a.pushHistory();
    const id = a.engine.addEmptyLayer();
    if (id && a.renderer) a.renderer.setSelection([id], id);
    a.ui && a.ui.renderLayers && a.ui.renderLayers();
    a.render && a.render();
    restoreState();
  };
  const doAddGroupLayer = () => {
    const a = getApp();
    if (!a || !a.engine || typeof a.engine.addGroupLayer !== 'function') return;
    a.pushHistory && a.pushHistory();
    const id = a.engine.addGroupLayer();
    if (id && a.renderer) a.renderer.setSelection([id], id);
    a.ui && a.ui.renderLayers && a.ui.renderLayers();
    a.render && a.render();
    restoreState();
  };
  const prettifyType = (t) => String(t || '').replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());
  const switchAlgorithm = (nextType) => {
    const sel = G.document.getElementById('generator-module');
    if (!sel || sel.disabled) return;
    const layer = getContext().primaryLayer;
    if (!layer || layer.type === nextType) return;
    sel.value = nextType;
    // The docked handler (algo-config-panel) owns history + regen + rebuild.
    sel.dispatchEvent(new G.Event('change', { bubbles: true }));
    restoreState();
  };

  // Preset flyout — lists the named presets for the layer's system. Returns null
  // when the system has no preset library (so the chip is simply absent).
  const makePresetFlyout = (layer) => {
    const b = B();
    const lib = (Vectura && Vectura.PresetLibraries && layer) ? Vectura.PresetLibraries[layer.type] : null;
    if (!Array.isArray(lib) || !lib.length) return null;
    const cur = (layer.params && layer.params.preset) || null;
    // User presets grouped under a header when present; built-ins render flat.
    const builtins = lib.filter((p) => p && p.group !== 'User');
    const users = lib.filter((p) => p && p.group === 'User');
    const rowFor = (p) => ({
      label: p.name || p.label || p.id,
      active: p.id === cur,
      onSelect: () => applyAlgoPreset(p.id),
    });
    const items = [];
    builtins.forEach((p) => items.push(rowFor(p)));
    if (users.length) { items.push({ header: 'User' }); users.forEach((p) => items.push(rowFor(p))); }
    const field = makeDropField('ctxbar-preset-field', (b.presets && b.presets.label) || 'Presets', (b.presets && b.presets.tooltip));
    return makeMenuFlyout(field, items, 'ctxbar-algo-flyout');
  };
  const applyAlgoPreset = (presetId) => {
    const a = getApp();
    const ui = a && a.ui;
    if (!ui || typeof ui._applyActivePreset !== 'function') return;
    a.pushHistory && a.pushHistory();
    ui._applyActivePreset(presetId); // owns storeLayerParams + regen + rebuild
    restoreState();
  };

  // Randomize (single die): mirrors the Algorithm Configuration panel's
  // "Randomize" button — always rerolls the full param set, not just the seed.
  const doRandomizeAlgo = (layer) => {
    const doc = G.document;
    const rnd = doc.getElementById('btn-randomize-params');
    if (rnd) { rnd.click(); restoreState(); return; }
    // Fallback: call the randomizer directly if the docked button isn't mounted.
    const a = getApp();
    const ui = a && a.ui;
    if (ui && typeof ui.randomizeLayerParams === 'function' && layer) {
      a.pushHistory && a.pushHistory();
      ui.randomizeLayerParams(layer);
      ui.storeLayerParams && ui.storeLayerParams(layer);
      (a.regen ? a.regen() : a.render && a.render());
      ui.buildControls && ui.buildControls();
      restoreState();
    }
  };
  const doExpandLayer = (layer) => {
    const a = getApp();
    const ui = a && a.ui;
    if (!ui || typeof ui.expandLayer !== 'function' || !layer) return;
    ui.expandLayer(layer); // owns history + generate + child selection
    a.render && a.render();
    restoreState(); // selection is now the produced group → ticker flips state
  };

  // ── TB-7: text controls bound to the Text panel params ─────────────────
  const appendTextControls = (ctx) => {
    const layer = ctx.primaryLayer;
    const params = (layer && layer.params) || {};
    const d = G.document;
    // Resolve a raw font value (Google web key or built-in style id) to the
    // human-readable face NAME — mirrors the Text panel's faceName() so the
    // family chip reads "Open Sans" / "Vectura", never the category id ("sans").
    const prettify = (s) => String(s || '').split(/[-_\s]+/).filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const faceName = (v) => {
      const GF = Vectura.GoogleFonts || {};
      if (GF.isWebFontKey && GF.isWebFontKey(v)) {
        const id = GF.keyToId(v);
        const fam = (GF.getFamilies ? GF.getFamilies() : []).find((f) => f && f.id === id);
        return (fam && fam.family) || prettify(id);
      }
      const SF = Vectura.StrokeFont || {};
      const famId = (SF.family && SF.family.id) || 'vectura';
      const styleIds = (SF.styles || []).map((s) => s.id);
      if (v === famId || styleIds.indexOf(v) >= 0) return (SF.family && SF.family.label) || 'Vectura';
      return prettify(v) || 'Font';
    };
    // A labeled pill with a dropdown caret so it clearly reads as a menu.
    const dropField = (extraClass, text, title, onOpen) => {
      const field = el('span', `ctxbar-text-field ${extraClass}`);
      field.setAttribute('tabindex', '-1'); field.setAttribute('data-ctxbar-roving', '');
      field.setAttribute('role', 'button'); field.setAttribute('aria-haspopup', 'listbox');
      field.title = title;
      const lbl = el('span', 'ctxbar-text-fieldlabel'); lbl.textContent = text;
      const caret = el('span', 'ctxbar-text-caret'); caret.textContent = '▾'; caret.setAttribute('aria-hidden', 'true');
      field.appendChild(lbl); field.appendChild(caret);
      field.addEventListener('click', () => onOpen(field));
      return field;
    };
    // Font family — shows the resolved face NAME (not the category id); opens
    // the picker anchored beneath THIS chip.
    els.content.appendChild(dropField(
      'ctxbar-text-family', faceName(params.font || params.fontFamily),
      'Font family', (field) => openTextPicker(layer, 'font', field)
    ));
    // Font weight — inline dropdown of the canonical weights (universal across
    // built-in + web faces). Web faces lazy-load the weighted outline before
    // regen; built-in thickens via extra pen passes. Self-contained flyout
    // (reuses the align-flyout box + menu-item styling), not the font picker.
    const SF2 = Vectura.StrokeFont || {};
    const weights = (SF2.weights && SF2.weights.length) ? SF2.weights
      : [{ id: 'Regular', label: 'Regular' }, { id: 'Medium', label: 'Medium' },
         { id: 'Semibold', label: 'Semibold' }, { id: 'Bold', label: 'Bold' }];
    const curWeight = params.fontWeight || 'Regular';
    const wWrap = el('span', 'ctxbar-align-wrap ctxbar-text-style-wrap');
    const wFly = el('div', 'ctxbar-align-flyout ctxbar-weight-flyout', { role: 'menu', 'aria-hidden': 'true' });
    let wOpen = false;
    const closeWeight = () => {
      wOpen = false; wFly.classList.remove('is-open'); wFly.setAttribute('aria-hidden', 'true');
      wField.setAttribute('aria-expanded', 'false'); if (state.closeFlyout === closeWeight) state.closeFlyout = null;
    };
    const openWeight = () => {
      wOpen = true; wFly.classList.add('is-open'); wFly.setAttribute('aria-hidden', 'false');
      wField.setAttribute('aria-expanded', 'true'); state.closeFlyout = closeWeight;
    };
    const commitWeight = (label) => {
      const a = getApp();
      if (!a || !layer || !layer.params) return;
      const GF = Vectura.GoogleFonts || {};
      const font = layer.params.font;
      const isWeb = !!(GF.isWebFontKey && GF.isWebFontKey(font));
      a.pushHistory?.();
      layer.params.fontWeight = label;
      a.ui?.storeLayerParams?.(layer);
      const regen = () => {
        if (typeof a.regen === 'function') a.regen(); else a.render?.();
        a.ui?.renderLayers?.();
        restoreState(); // rebuild the bar so the chip reflects the new weight
      };
      if (isWeb && GF.loadWeight) GF.loadWeight(GF.keyToId(font), label).then(regen).catch(regen);
      else regen();
    };
    weights.forEach((w) => {
      const item = el('button', 'ctxbar-menu-item', { type: 'button', tabindex: '-1' });
      item.textContent = w.label;
      if (w.id === curWeight) { item.classList.add('is-active'); item.style.color = 'var(--ui-accent, #4e9ee1)'; }
      item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); closeWeight(); commitWeight(w.id); });
      wFly.appendChild(item);
    });
    const wField = dropField('ctxbar-text-style', curWeight, 'Font weight', () => { wOpen ? closeWeight() : openWeight(); });
    wField.setAttribute('aria-haspopup', 'menu');
    wField.setAttribute('aria-expanded', 'false');
    wWrap.appendChild(wField); wWrap.appendChild(wFly);
    els.content.appendChild(wWrap);
    // Font size — numeric field bound live to the param.
    const size = el('input', 'ctxbar-text-size', { type: 'number', min: '1', step: '1', 'aria-label': 'Font size', tabindex: '-1' });
    size.setAttribute('data-ctxbar-roving', '');
    const sz = Number(params.fontSize);
    size.value = Number.isFinite(sz) ? String(sz) : '';
    size.addEventListener('change', () => {
      const v = Number(size.value);
      if (!Number.isFinite(v) || v <= 0) return;
      applyTextParam(layer, 'fontSize', v);
    });
    els.content.appendChild(size);
    // Size preset dropdown affordance — opens the Text panel's inline size menu.
    const sizeCaret = el('button', 'ctxbar-text-size-caret', { type: 'button', 'aria-label': 'Size presets', tabindex: '-1' });
    sizeCaret.setAttribute('data-ctxbar-roving', '');
    sizeCaret.title = 'Size presets';
    sizeCaret.textContent = '▾';
    sizeCaret.addEventListener('click', () => openTextPicker(layer, 'size', sizeCaret));
    els.content.appendChild(sizeCaret);
  };
  // Bring the docked Text panel up for `layer`, then drive its real inline
  // picker (TXT-3…5, Lane J) when present. Feature-detected: if the Text panel
  // module is absent it degrades to the wayfinding pulse (no phantom methods).
  const openTextPicker = (layer, which, anchorEl) => {
    focusTextPanel(layer);
    const TP = G.Vectura && G.Vectura.UI && G.Vectura.UI.TextPanel;
    if (!TP) return;
    // Anchor the popup BENEATH the clicked task-bar chip (P3 feedback) rather
    // than the docked left-pane trigger; snapshot the rect at click time.
    const anchorRect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
    try {
      if (which === 'size' && typeof TP.openSizePresets === 'function') TP.openSizePresets(anchorRect);
      else if (typeof TP.openFontPicker === 'function') TP.openFontPicker(anchorRect);
    } catch (_e) { /* panel not mounted yet — wayfinding pulse already fired */ }
  };
  const focusTextPanel = (layer) => {
    // Wayfinding only: the full family/style pickers live in the docked Text
    // panel (left pane) and are deferred to Lane J (TXT-3…5). Make the text
    // layer active so its controls render there, then pulse that panel so the
    // user knows where to edit. No phantom methods — uses real engine/UI hooks.
    const a = getApp();
    if (a && a.engine && layer) {
      a.engine.activeLayerId = layer.id;
      a.ui?.renderLayers?.();
      a.ui?.buildControls?.();
    }
    doShowPanelTarget((cfg().textPanel && cfg().textPanel.selector) || '#left-pane');
  };
  const applyTextParam = (layer, key, value) => {
    // Live-commit mirroring the Text panel's own commit path
    // (layer.params[key] = value → storeLayerParams → regen), so the specimen
    // and canvas re-render and the value persists. No phantom methods.
    const a = getApp();
    if (!a || !layer || !layer.params) return;
    a.pushHistory?.();
    layer.params[key] = value;
    a.ui?.storeLayerParams?.(layer);
    if (typeof a.regen === 'function') a.regen();
    else a.render?.();
    a.ui?.renderLayers?.();
  };
  const doShowPanelTarget = (selector) => {
    const target = G.document.querySelector(selector);
    if (!target) return;
    const t = cfg().timing || {};
    target.classList.remove('ctxbar-pulse');
    void target.offsetWidth;
    target.classList.add('ctxbar-pulse');
    setTimeout(() => target.classList.remove('ctxbar-pulse'), t.pulseDurationMs || 1000);
  };

  // ── TB-8: roving tabindex (never steals focus) ─────────────────────────
  const rovingEls = () => Array.from(els.bar.querySelectorAll('[data-ctxbar-roving]'))
    .filter((n) => !n.disabled);
  const updateRoving = () => {
    const items = rovingEls();
    items.forEach((n, i) => n.setAttribute('tabindex', i === 0 ? '0' : '-1'));
  };
  const bindRovingKeys = () => {
    els.bar.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      const items = rovingEls();
      if (!items.length) return;
      const cur = items.indexOf(G.document.activeElement);
      let next = cur;
      if (e.key === 'ArrowRight') next = cur < 0 ? 0 : (cur + 1) % items.length;
      else if (e.key === 'ArrowLeft') next = cur <= 0 ? items.length - 1 : cur - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      if (next === cur) return;
      e.preventDefault();
      items.forEach((n, i) => n.setAttribute('tabindex', i === next ? '0' : '-1'));
      items[next].focus();
    });
  };

  // ── visibility + show/hide ────────────────────────────────────────────
  const shouldShow = () => {
    if (!isEnabled()) return false;
    if (state.drag.active) return false;
    const a = getApp();
    if (a && a.textEdit && typeof a.textEdit.isActive === 'function' && a.textEdit.isActive()) return false;
    const renderer = getRenderer();
    if (!renderer) return false;
    const size = renderer.selectedLayerIds ? renderer.selectedLayerIds.size : 0;
    if (size > 0) return true;
    // Nothing selected → idle only for the select tool.
    return (renderer.activeTool || 'select') === 'select';
  };

  const setVisible = (vis) => {
    if (vis === state.visible) return;
    state.visible = vis;
    if (!els.bar) return;
    els.bar.classList.toggle('is-visible', vis);
    els.bar.setAttribute('aria-hidden', vis ? 'false' : 'true');
    if (!vis) closeMenu();
  };

  const dispatchStateEvent = (kind) => {
    const d = G.document;
    if (!d || typeof d.dispatchEvent !== 'function') return;
    try {
      d.dispatchEvent(new G.CustomEvent('vectura:contextbar-state', { detail: { kind, visible: state.visible } }));
    } catch (_) { /* CustomEvent unavailable */ }
  };

  // ── main tick ─────────────────────────────────────────────────────────
  const refresh = () => {
    // Bail if the document was torn down (e.g. a test runtime closed its JSDOM
    // window while the ticker is still scheduled) — mirrors hint-bar.js.
    if (!G.document || !G.document.body) return;
    // If our pill was detached (document replaced), re-mount into the live one.
    if (state.mounted && els.bar && !els.bar.isConnected) state.mounted = false;
    if (!mount()) return;
    bindCanvasDrag();
    const vis = shouldShow();
    setVisible(vis);
    if (!vis) return;
    const ctx = getContext();
    // Re-render on kind change OR when the PRIMARY layer changes within the same
    // kind (e.g. selecting a different text layer) — otherwise the controls stay
    // bound to the previously-selected layer (stale family/size/point-area).
    const primaryId = (ctx.primaryLayer && ctx.primaryLayer.id) || null;
    // Also re-render when text-layer params that the bar displays change (e.g.
    // font family changed in the Text panel while the same layer stays selected),
    // or when a single-algo layer's algorithm is switched from elsewhere (e.g.
    // the left Algorithm Configuration panel's own dropdown) — the layer id
    // stays the same, so only tracking `type` here catches the switch.
    const primaryParams = (ctx.primaryLayer && ctx.primaryLayer.params) || {};
    const paramSig = ctx.kind === 'single-text'
      ? `${primaryParams.font || ''}|${primaryParams.fontWeight || ''}|${primaryParams.fontSize || ''}`
      : ctx.kind === 'single-algo'
        ? (ctx.primaryLayer && ctx.primaryLayer.type) || ''
        : '';
    const changed = ctx.kind !== state.kind || primaryId !== state.primaryId || paramSig !== state.paramSig;
    // In edit-path (direct) mode the anchor verbs' enabled state depends on the
    // live anchor selection, which changes without the bar's `kind` changing.
    // Track the renderer's anchor signature and re-render when it moves so the
    // buttons enable/disable to match what's selected.
    const renderer = getRenderer();
    const anchorSig = (ctx.kind === 'direct' && renderer && typeof renderer.getSelectedAnchorSignature === 'function')
      ? renderer.getSelectedAnchorSignature() : '';
    if (changed && !state.busy) {
      state.kind = ctx.kind;
      state.primaryId = primaryId;
      state.paramSig = paramSig;
      state.anchorSig = anchorSig;
      renderContext(ctx);
      dispatchStateEvent(ctx.kind);
    } else if (changed) {
      // busy (sub-mode active): record the kind but let H own the host.
      state.kind = ctx.kind;
      state.primaryId = primaryId;
      state.paramSig = paramSig;
      state.anchorSig = anchorSig;
      dispatchStateEvent(ctx.kind);
    } else if (!state.busy && ctx.kind === 'direct' && anchorSig !== state.anchorSig) {
      state.anchorSig = anchorSig;
      renderContext(ctx);
    }
    reanchor();
  };

  const tick = () => {
    refresh();
    state.raf = typeof G.requestAnimationFrame === 'function'
      ? G.requestAnimationFrame(tick)
      : setTimeout(tick, 100);
  };
  const start = () => {
    if (state.started) return;
    state.started = true;
    loadPersisted();
    tick();
  };

  // ── contract surface ──────────────────────────────────────────────────
  const restoreState = () => {
    if (!els.content) return;
    state.busy = false;
    const ctx = getContext();
    state.kind = ctx.kind;
    // Sync the change-detection signatures so the next RAF refresh() doesn't
    // treat this render as stale and re-render a second time.
    state.primaryId = (ctx.primaryLayer && ctx.primaryLayer.id) || null;
    const rp = (ctx.primaryLayer && ctx.primaryLayer.params) || {};
    state.paramSig = ctx.kind === 'single-text'
      ? `${rp.font || ''}|${rp.fontWeight || ''}|${rp.fontSize || ''}`
      : ctx.kind === 'single-algo'
        ? (ctx.primaryLayer && ctx.primaryLayer.type) || ''
        : '';
    const renderer = getRenderer();
    state.anchorSig = (ctx.kind === 'direct' && renderer && typeof renderer.getSelectedAnchorSignature === 'function')
      ? renderer.getSelectedAnchorSignature() : '';
    renderContext(ctx);
    reanchor();
  };

  UI.ContextBar = {
    getContentHost: () => els.content || null,
    restoreState,
    getContext,
    anchorRectForBar: () => state.lastAnchor,
    setBusy: (b) => { state.busy = b === true; if (!state.busy) restoreState(); },
    // Optional (contract note): a sub-mode may prepend one overflow item.
    setOverflowExtraItem: (item) => { state.overflowExtra = (item && item.label) ? item : null; },
    // TB-8 preference setter (Document Setup checkbox delegates here).
    setEnabled: (on) => { settings().contextBarEnabled = on === true; persist(); refresh(); },
    isEnabled,
    // Test/diagnostic hooks (pure anchor math + forced refresh).
    _computeAnchor: computeAnchor,
    _refresh: refresh,
    _persist: persist,
  };

  start();
})();
