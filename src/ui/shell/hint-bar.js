/**
 * Vectura Studio — HUD hint bar, readouts & canvas toast (Illustrator Tools
 * Parity, Phase 1 Lane F: HUD-1…4).
 *
 * Renders the bottom workspace strip:
 *   - HUD-1: per-tool contextual hint line (up to 3 bolded-keyword segments
 *     separated by `|`). All copy lives in `src/config/hints.js`
 *     (`Vectura.HINTS`) — never here. Pen/scissor hints are mode-aware.
 *     The hint text clears while a canvas drag is in progress (own pointer
 *     listeners on #main-canvas — renderer.js is read-only for this lane)
 *     and restores on release.
 *   - HUD-2: active tool display name, live zoom % (derived from
 *     `renderer.scale`; 100% = CSS-physical document size), canvas rotation
 *     readout (0° — the renderer has no viewport rotation yet; feature-
 *     detects a future numeric `renderer.viewRotationDeg`).
 *   - HUD-3: `UI.toast(message)` — transient non-interactive pill top-center
 *     of the canvas (#canvas-toast in #viewport-container). One at a time;
 *     a new toast replaces the current one (queue-drop-oldest) and restarts
 *     the auto-dismiss timer (`Vectura.HINTS.toast.durationMs`). Also
 *     subscribes to the `vectura:shape-expanded` document CustomEvent
 *     (emitted by Lane C's PTH-5 expand op).
 *   - HUD-4: `SETTINGS.contextualHints` (default ON via `!== false`) gates
 *     the hint text only — tool/zoom/rotation readouts always show.
 *     Persistence is canonical: `contextualHints` is folded into the App
 *     preference snapshot (getPreferenceSnapshot/applyPreferenceSnapshot +
 *     captureState/applyState), so it round-trips via .vectura files and the
 *     cookie-backed prefs. The old standalone localStorage fallback was
 *     retired at integration.
 *
 * Self-contained IIFE: no edits to renderer.js / ui.js / app.js. Updates run
 * on a requestAnimationFrame ticker that no-ops until `window.app.renderer`
 * exists (App is constructed by main.js on window load), so the module
 * tolerates any load order. It additionally listens for a future
 * `vectura:tool-changed` document CustomEvent (interface request to Lane A)
 * for immediate refreshes.
 *
 * Public API (window.Vectura.UI):
 *   UI.toast(message)                — HUD-3 toast.
 *   UI.HintBar.refresh()             — force a synchronous DOM update.
 *   UI.HintBar.setContextualHints(v) — HUD-4 setter (SETTINGS + persistence).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const cfg = () => Vectura.HINTS || {};
  const settings = () => Vectura.SETTINGS || {};

  // ── HUD-4 persistence ─────────────────────────────────────────────────
  // `SETTINGS.contextualHints` (default ON via `!== false`) is now part of the
  // canonical App preference snapshot (getPreferenceSnapshot / captureState),
  // so it round-trips via .vectura files and the cookie-backed prefs alongside
  // showGuides/snapGuides. The Document Setup toggle calls
  // app.persistPreferencesDebounced() to save it — the old standalone
  // `vectura-hud-contextual-hints` localStorage fallback was retired at
  // integration to avoid a divergent secondary persistence surface.

  // ── module state ──────────────────────────────────────────────────────
  const state = {
    started: false,
    raf: 0,
    toastTimer: 0,
    drag: { engaged: false, active: false, x: 0, y: 0 },
    dragBound: false,
    cache: { hintKey: null, hidden: null, tool: null, zoom: null, rotation: null },
  };

  const els = {};
  const lookupEls = () => {
    const d = G.document;
    if (!d) return false;
    if (!els.bar || !els.bar.isConnected) {
      els.bar = d.getElementById('hud-bar');
      els.hints = d.getElementById('status-bar');
      els.tool = d.getElementById('hud-tool');
      els.zoom = d.getElementById('hud-zoom');
      els.rotation = d.getElementById('hud-rotation');
      els.toast = d.getElementById('canvas-toast');
    }
    return Boolean(els.bar && els.hints);
  };

  const getRenderer = () => (G.app && G.app.renderer) || null;

  // ── HUD-1: hint resolution & rendering ────────────────────────────────
  const resolveHintKey = (renderer) => {
    const tool = renderer.activeTool || 'select';
    if (tool === 'pen') return `pen-${renderer.penMode || 'draw'}`;
    if (tool === 'scissor') return `scissor-${renderer.scissorMode || 'line'}`;
    return tool;
  };

  const renderHint = (key) => {
    const d = G.document;
    const entry = (cfg().tools || {})[key];
    els.hints.textContent = '';
    if (!entry || !Array.isArray(entry.hint)) return;
    entry.hint.forEach((segment, i) => {
      if (i > 0) {
        const sep = d.createElement('span');
        sep.className = 'hud-hint-sep';
        sep.textContent = '|';
        els.hints.appendChild(sep);
      }
      const seg = d.createElement('span');
      seg.className = 'hud-hint-seg';
      const strong = d.createElement('strong');
      strong.textContent = segment.key || '';
      seg.appendChild(strong);
      seg.appendChild(d.createTextNode(segment.text ? ` ${segment.text}` : ''));
      els.hints.appendChild(seg);
    });
  };

  // ── HUD-1: drag-in-progress detection (own listeners; renderer.js is
  // read-only for this lane). A drag = primary-button press on the canvas
  // followed by movement beyond the configured threshold. ────────────────
  const bindDragListeners = () => {
    if (state.dragBound || !G.document) return;
    const canvas = G.document.getElementById('main-canvas');
    if (!canvas) return;
    state.dragBound = true;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      state.drag.engaged = true;
      state.drag.active = false;
      state.drag.x = e.clientX || 0;
      state.drag.y = e.clientY || 0;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!state.drag.engaged || state.drag.active) return;
      const threshold = cfg().dragClearThresholdPx;
      const dx = (e.clientX || 0) - state.drag.x;
      const dy = (e.clientY || 0) - state.drag.y;
      if ((dx * dx + dy * dy) >= threshold * threshold) {
        state.drag.active = true;
        refresh();
      }
    });
    const endDrag = () => {
      if (!state.drag.engaged && !state.drag.active) return;
      state.drag.engaged = false;
      state.drag.active = false;
      refresh();
    };
    G.addEventListener('pointerup', endDrag, true);
    G.addEventListener('pointercancel', endDrag, true);
  };

  // ── update pass (diffed — DOM writes only on change) ──────────────────
  const update = (renderer) => {
    const c = state.cache;

    // HUD-1 hint line.
    const hintKey = resolveHintKey(renderer);
    if (hintKey !== c.hintKey) {
      c.hintKey = hintKey;
      renderHint(hintKey);
    }
    // HUD-4 gate + HUD-1 drag clearing (readouts unaffected).
    const hidden = settings().contextualHints === false || state.drag.active;
    if (hidden !== c.hidden) {
      c.hidden = hidden;
      els.hints.classList.toggle('is-hidden', hidden);
    }

    // HUD-2 readouts.
    const entry = (cfg().tools || {})[hintKey];
    const toolName = (entry && entry.name) || renderer.activeTool || '';
    if (toolName !== c.tool) {
      c.tool = toolName;
      if (els.tool) els.tool.textContent = toolName;
    }
    const pxPerMm = cfg().pxPerMm;
    const scale = Number.isFinite(renderer.scale) ? renderer.scale : pxPerMm;
    const zoom = `${Math.round((scale / pxPerMm) * 100)}%`;
    if (zoom !== c.zoom) {
      c.zoom = zoom;
      if (els.zoom) els.zoom.textContent = zoom;
    }
    const deg = Number.isFinite(renderer.viewRotationDeg) ? renderer.viewRotationDeg : 0;
    const rotation = `${Math.round(deg)}°`;
    if (rotation !== c.rotation) {
      c.rotation = rotation;
      if (els.rotation) els.rotation.textContent = rotation;
    }
  };

  const refresh = () => {
    const renderer = getRenderer();
    if (!renderer || !lookupEls()) return;
    bindDragListeners();
    update(renderer);
  };

  // rAF ticker — no-ops until the app boots; catches every mutation path
  // (setTool, wheel/pinch zoom, restored preferences) without touching
  // renderer.js. DOM writes only happen on diffs, so the per-frame cost is a
  // handful of property reads.
  const tick = () => {
    refresh();
    state.raf = typeof G.requestAnimationFrame === 'function'
      ? G.requestAnimationFrame(tick)
      : setTimeout(tick, 100);
  };
  const start = () => {
    if (state.started) return;
    state.started = true;
    tick();
  };

  // ── HUD-3: transient canvas toast ─────────────────────────────────────
  const toast = (message) => {
    if (!lookupEls() || !els.toast) return;
    const el = els.toast;
    el.textContent = typeof message === 'string' ? message : String(message == null ? '' : message);
    // Queue-drop-oldest: replace content, restart the dismiss timer.
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = 0;
    }
    el.classList.add('is-visible');
    el.setAttribute('aria-hidden', 'false');
    const duration = cfg().toast.durationMs;
    state.toastTimer = setTimeout(() => {
      state.toastTimer = 0;
      el.classList.remove('is-visible');
      el.setAttribute('aria-hidden', 'true');
    }, duration);
  };

  // ── HUD-4 setter (Document Setup checkbox delegates here) ─────────────
  const setContextualHints = (on) => {
    settings().contextualHints = on === true;
    refresh();
  };

  // ── event subscriptions (defensive — emitters live in other lanes) ────
  if (G.document && typeof G.document.addEventListener === 'function') {
    // Lane C (PTH-5) emits this after Expand; coordinate name via integrator.
    G.document.addEventListener('vectura:shape-expanded', (e) => {
      const detailMsg = e && e.detail && typeof e.detail.message === 'string' ? e.detail.message : '';
      // Copy is config-owned (src/config/hints.js loads before this module per
      // the verified defer order) — no inline string fallback.
      toast(detailMsg || (cfg().toasts && cfg().toasts.shapeExpanded));
    });
    // Future Lane A hook for immediate (non-ticker) refreshes.
    G.document.addEventListener('vectura:tool-changed', refresh);
  }

  UI.toast = toast;
  UI.HintBar = { refresh, setContextualHints };

  start();
})();
