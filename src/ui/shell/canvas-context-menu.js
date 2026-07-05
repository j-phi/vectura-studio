/**
 * Vectura Studio — canvas right-click context menu (Illustrator Tools Parity,
 * Phase 3 Lane M: CTX-1).
 *
 * WHEN the user right-clicks the canvas with a selection, a context menu opens
 * listing EXISTING verbs only (no new behavior): Duplicate / Delete, Undo /
 * Redo, Group / Ungroup, Isolate group / Exit isolation (state-dependent),
 * Simplify… (enters the Task Bar's TB-11 simplify sub-mode), Smooth, Flip
 * Horizontal / Vertical, and Transform ▸ (focuses the Transform panel). Each
 * item routes to the same command the toolbar / shortcut / Task Bar already
 * uses; ineligible items are shown disabled with a plain-language reason.
 * Right-clicking with NO selection shows just the Undo / Redo subset. Escape,
 * outside click, scroll, resize, or blur close the menu.
 *
 * Self-contained IIFE that SELF-MOUNTS via JS: it attaches its OWN `contextmenu`
 * listener to the main canvas (it does NOT edit renderer.js — Lane K is the sole
 * Phase-3 renderer owner). It mirrors how Lane I's breadcrumb self-mounted —
 * a lightweight retry attaches the listener as soon as the canvas exists, and
 * `app` is resolved lazily at open time (tolerant of late load). The phase
 * integrator adds the <script> tag to index.html.
 *
 * All copy lives in src/config/context-menu.js (Vectura.CONTEXT_MENU).
 *
 * Public API (window.Vectura.UI.CanvasContextMenu):
 *   mount(app)          — attach to the given app (or window.app); idempotent.
 *   openAt(x, y)        — force-open at viewport coords (for tests / callers).
 *   close()             — dismiss the menu.
 *   buildItems()        — compute the current item model (for tests).
 *   getElement()        — the live menu element (or null when closed).
 *   destroy()           — teardown (removes DOM + listeners). For tests.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  const cfg = () => Vectura.CONTEXT_MENU || {};
  const LABELS = () => cfg().labels || {};
  const REASONS = () => cfg().reasons || {};

  const state = {
    app: null,
    canvas: null,
    listenerAttached: false,
    attachTries: 0,
    menu: null,
    onDocDown: null,
    onKey: null,
    onScroll: null,
  };

  const doc = () => G.document || null;
  const getApp = () => state.app || G.app || Vectura.app || null;
  const getRenderer = () => { const a = getApp(); return (a && a.renderer) || null; };
  const getEngine = () => { const a = getApp(); return (a && a.engine) || (getRenderer() && getRenderer().engine) || null; };
  const getUi = () => { const a = getApp(); return (a && a.ui) || null; };

  // ── selection-state model ──────────────────────────────────────────────
  const readState = () => {
    const app = getApp();
    const renderer = getRenderer();
    const layers = (renderer && renderer.getSelectedLayers) ? (renderer.getSelectedLayers() || []) : [];
    const ids = (renderer && renderer.selectedLayerIds) ? Array.from(renderer.selectedLayerIds) : layers.map((l) => l && l.id).filter(Boolean);
    const groups = layers.filter((l) => l && l.isGroup && l.type !== 'compound');
    const nonGroup = layers.filter((l) => l && !l.isGroup);
    const ops = Vectura.PathEditOps;
    const pathEditable = ops && typeof ops.isEligibleLayer === 'function'
      ? layers.some((l) => { try { return ops.isEligibleLayer(l); } catch (_e) { return false; } })
      : nonGroup.length > 0;
    return {
      app,
      renderer,
      layers,
      ids,
      hasSelection: ids.length > 0,
      multi: ids.length > 1,
      groups,
      singleGroup: groups.length === 1,
      hasGeometry: nonGroup.length > 0,
      pathEditable,
      isolated: Boolean(renderer && renderer.groupEditMode && renderer.groupEditMode.groupId),
      canUndo: (app && Array.isArray(app.history)) ? app.history.length >= 2 : false,
      canRedo: (app && Array.isArray(app.redoStack)) ? app.redoStack.length >= 1 : false,
    };
  };

  // ── command routing (existing verbs only) ──────────────────────────────
  const cmdDuplicate = (s) => { const ui = getUi(); if (ui && ui.duplicateLayers) ui.duplicateLayers(s.layers); };
  const cmdDelete = (s) => {
    const app = getApp(); const renderer = getRenderer(); const engine = getEngine(); const ui = getUi();
    if (!app || !renderer || !engine) return;
    app.pushHistory?.();
    s.ids.forEach((id) => { ui && ui.unlockMirrorChildrenOnDelete?.(id); engine.removeLayer(id); });
    const nextId = engine.activeLayerId;
    renderer.setSelection(nextId ? [nextId] : [], nextId);
    ui && ui.renderLayers?.();
    app.render?.();
  };
  const cmdUndo = () => { const ui = getUi(); if (ui && ui.triggerTopMenuAction) ui.triggerTopMenuAction('btn-undo'); else getApp()?.undo?.(); };
  const cmdRedo = () => { const ui = getUi(); if (ui && ui.triggerTopMenuAction) ui.triggerTopMenuAction('btn-redo'); else getApp()?.redo?.(); };
  const cmdGroup = () => { const ui = getUi(); if (ui && ui.triggerTopMenuAction) ui.triggerTopMenuAction('btn-group-layers'); };
  const cmdUngroup = () => { const ui = getUi(); if (ui && ui.triggerTopMenuAction) ui.triggerTopMenuAction('btn-ungroup-layers'); };
  const cmdIsolate = (s) => {
    const renderer = getRenderer(); const engine = getEngine();
    if (!renderer || !engine || !s.singleGroup) return;
    const group = s.groups[0];
    // Morph containers consume their children — exit rather than plain-isolate.
    if (group.modifier && group.modifier.type === 'morph') { renderer.exitGroupEditMode?.(); return; }
    const kids = (engine.getLayerChildren ? engine.getLayerChildren(group.id) : []) || [];
    const child = kids.find((l) => l && l.visible !== false && !(renderer.isLayerLocked && renderer.isLayerLocked(l.id)));
    if (child) renderer.enterGroupEditMode?.(child);
  };
  const cmdExitIsolation = () => { getRenderer()?.exitGroupEditMode?.(); };
  const cmdSimplify = (s) => {
    const M = UI.ContextBarModes;
    if (M && typeof M.enterSimplify === 'function') M.enterSimplify({ app: getApp(), layerIds: s.ids });
  };
  const cmdSmooth = (s) => {
    const ops = Vectura.PathEditOps;
    if (!ops || typeof ops.smoothSelection !== 'function') return;
    const strength = Number.isFinite(cfg().smoothStrength) ? cfg().smoothStrength : 0.5;
    // smoothSelection owns its own push-before-change history when it changes.
    ops.smoothSelection(s.ids, strength, { app: getApp() });
    getApp()?.render?.();
  };
  const cmdFlip = (axis) => (s) => {
    // Prefer the renderer's flipSelection: it recomputes display geometry AND
    // refreshes the Transform panel inputs (the raw ops.flipLayers + render()
    // path left the inputs stale, so a flip looked like it "did nothing").
    const renderer = getApp()?.renderer;
    if (renderer && typeof renderer.flipSelection === 'function') {
      renderer.flipSelection(axis);
      return;
    }
    const ops = Vectura.PathEditOps;
    if (!ops || typeof ops.flipLayers !== 'function') return;
    // flipLayers({app}) owns the single history push (shared with Lane K's
    // flip buttons) — do NOT add a second push here.
    ops.flipLayers(s.ids, axis, { app: getApp() });
    getApp()?.render?.();
  };
  const cmdTransform = () => {
    const d = doc(); if (!d) return;
    const section = d.getElementById('algorithm-transform-section');
    const header = d.getElementById('algorithm-transform-header');
    if (section && section.classList.contains('collapsed') && header && typeof header.click === 'function') header.click();
    if (section && typeof section.scrollIntoView === 'function') {
      try { section.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_e) { /* noop */ }
    }
    const posX = d.getElementById('inp-pos-x');
    if (posX && typeof posX.focus === 'function') { try { posX.focus(); } catch (_e) { /* noop */ } }
  };

  // ── item model ─────────────────────────────────────────────────────────
  const SEP = { separator: true };

  const buildItems = () => {
    const s = readState();
    const L = LABELS();
    const R = REASONS();
    const items = [];

    if (!s.hasSelection) {
      // Empty-selection subset: Undo / Redo only.
      items.push({ id: 'undo', label: L.undo || 'Undo', enabled: s.canUndo, reason: s.canUndo ? '' : (R.undo || ''), run: cmdUndo });
      items.push({ id: 'redo', label: L.redo || 'Redo', enabled: s.canRedo, reason: s.canRedo ? '' : (R.redo || ''), run: cmdRedo });
      return items;
    }

    items.push({ id: 'duplicate', label: L.duplicate || 'Duplicate', enabled: true, run: () => cmdDuplicate(s) });
    items.push({ id: 'delete', label: L.delete || 'Delete', enabled: true, run: () => cmdDelete(s) });
    items.push(SEP);
    items.push({ id: 'undo', label: L.undo || 'Undo', enabled: s.canUndo, reason: s.canUndo ? '' : (R.undo || ''), run: cmdUndo });
    items.push({ id: 'redo', label: L.redo || 'Redo', enabled: s.canRedo, reason: s.canRedo ? '' : (R.redo || ''), run: cmdRedo });
    items.push(SEP);
    items.push({ id: 'group', label: L.group || 'Group', enabled: s.multi, reason: s.multi ? '' : (R.group || ''), run: cmdGroup });
    items.push({ id: 'ungroup', label: L.ungroup || 'Ungroup', enabled: s.groups.length >= 1, reason: s.groups.length >= 1 ? '' : (R.ungroup || ''), run: cmdUngroup });
    if (s.isolated) {
      items.push({ id: 'exit-isolation', label: L.exitIsolation || 'Exit isolation', enabled: true, run: cmdExitIsolation });
    } else {
      items.push({ id: 'isolate', label: L.isolate || 'Isolate group', enabled: s.singleGroup, reason: s.singleGroup ? '' : (R.isolate || ''), run: () => cmdIsolate(s) });
    }
    items.push(SEP);
    items.push({ id: 'simplify', label: L.simplify || 'Simplify…', enabled: s.pathEditable, reason: s.pathEditable ? '' : (R.simplify || ''), run: () => cmdSimplify(s) });
    items.push({ id: 'smooth', label: L.smooth || 'Smooth', enabled: s.pathEditable, reason: s.pathEditable ? '' : (R.smooth || ''), run: () => cmdSmooth(s) });
    items.push({ id: 'flip-h', label: L.flipH || 'Flip Horizontal', enabled: s.hasGeometry, reason: s.hasGeometry ? '' : (R.flip || ''), run: () => cmdFlip('horizontal')(s) });
    items.push({ id: 'flip-v', label: L.flipV || 'Flip Vertical', enabled: s.hasGeometry, reason: s.hasGeometry ? '' : (R.flip || ''), run: () => cmdFlip('vertical')(s) });
    items.push(SEP);
    items.push({ id: 'transform', label: L.transform || 'Transform ▸', enabled: true, run: cmdTransform });

    return items;
  };

  // ── menu DOM ───────────────────────────────────────────────────────────
  const close = () => {
    const d = doc();
    if (state.menu && state.menu.parentNode) state.menu.parentNode.removeChild(state.menu);
    state.menu = null;
    if (d) {
      if (state.onDocDown) d.removeEventListener('pointerdown', state.onDocDown, true);
      if (state.onKey) d.removeEventListener('keydown', state.onKey, true);
    }
    if (state.onScroll && G.removeEventListener) {
      G.removeEventListener('scroll', state.onScroll, true);
      G.removeEventListener('resize', state.onScroll, true);
      G.removeEventListener('blur', state.onScroll, true);
    }
    state.onDocDown = state.onKey = state.onScroll = null;
  };

  const renderMenu = (items) => {
    const d = doc();
    const menu = d.createElement('div');
    menu.className = 'canvas-ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', cfg().ariaLabel || 'Canvas actions');
    let lastWasSep = true; // suppress a leading separator
    items.forEach((item) => {
      if (item.separator) {
        if (lastWasSep) return;
        const sep = d.createElement('div');
        sep.className = 'canvas-ctx-sep';
        sep.setAttribute('role', 'separator');
        menu.appendChild(sep);
        lastWasSep = true;
        return;
      }
      const btn = d.createElement('button');
      btn.type = 'button';
      btn.className = 'canvas-ctx-item' + (item.enabled ? '' : ' is-disabled');
      btn.setAttribute('role', 'menuitem');
      btn.dataset.ctxId = item.id;
      btn.textContent = item.label;
      if (!item.enabled) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        if (item.reason) btn.title = item.reason;
      }
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!item.enabled) return;
        close();
        try { item.run(); } catch (_e) { /* command guarded */ }
      });
      menu.appendChild(btn);
      lastWasSep = false;
    });
    // Trim a trailing separator, if any.
    while (menu.lastChild && menu.lastChild.classList && menu.lastChild.classList.contains('canvas-ctx-sep')) {
      menu.removeChild(menu.lastChild);
    }
    return menu;
  };

  const positionMenu = (menu, x, y) => {
    const gap = Number.isFinite(cfg().edgeGapPx) ? cfg().edgeGapPx : 8;
    const vw = G.innerWidth || 0;
    const vh = G.innerHeight || 0;
    menu.style.left = '0px';
    menu.style.top = '0px';
    const w = menu.offsetWidth || 0;
    const h = menu.offsetHeight || 0;
    let left = x;
    let top = y;
    if (vw && left + w > vw - gap) left = Math.max(gap, vw - w - gap);
    if (vh && top + h > vh - gap) top = Math.max(gap, vh - h - gap);
    if (left < gap) left = gap;
    if (top < gap) top = gap;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  };

  const openAt = (x, y) => {
    const d = doc();
    if (!d || !d.body) return null;
    close();
    const items = buildItems();
    if (!items.length) return null;
    const menu = renderMenu(items);
    menu.style.position = 'fixed';
    d.body.appendChild(menu);
    state.menu = menu;
    positionMenu(menu, x, y);
    if (typeof G.requestAnimationFrame === 'function') G.requestAnimationFrame(() => { if (state.menu === menu) positionMenu(menu, x, y); });

    state.onDocDown = (e) => { if (state.menu && !state.menu.contains(e.target)) close(); };
    state.onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    state.onScroll = () => close();
    // Defer the outside-pointer binding so the opening event doesn't self-close.
    if (typeof G.requestAnimationFrame === 'function') {
      G.requestAnimationFrame(() => { if (state.menu === menu) d.addEventListener('pointerdown', state.onDocDown, true); });
    } else {
      d.addEventListener('pointerdown', state.onDocDown, true);
    }
    d.addEventListener('keydown', state.onKey, true);
    if (G.addEventListener) {
      G.addEventListener('scroll', state.onScroll, true);
      G.addEventListener('resize', state.onScroll, true);
      G.addEventListener('blur', state.onScroll, true);
    }
    return menu;
  };

  // ── contextmenu listener (self-attached to the canvas) ─────────────────
  const onContextMenu = (e) => {
    // Only handle right-clicks on the canvas surface; let the browser menu
    // through for any modifier-driven or non-canvas case.
    if (!getApp()) return;
    e.preventDefault();
    openAt(e.clientX, e.clientY);
  };

  const findCanvas = () => {
    const d = doc();
    if (!d) return null;
    return d.getElementById('main-canvas')
      || (d.getElementById('viewport-container') && d.getElementById('viewport-container').querySelector('canvas'))
      || null;
  };

  const attachListener = () => {
    if (state.listenerAttached) return true;
    const canvas = findCanvas();
    if (!canvas) return false;
    canvas.addEventListener('contextmenu', onContextMenu);
    state.canvas = canvas;
    state.listenerAttached = true;
    return true;
  };

  const tryAttachLoop = () => {
    if (state.listenerAttached) return;
    if (attachListener()) return;
    if (state.attachTries > 600) return; // ~ give up after ample retries
    state.attachTries += 1;
    if (typeof G.requestAnimationFrame === 'function') G.requestAnimationFrame(tryAttachLoop);
    else setTimeout(tryAttachLoop, 60);
  };

  const mount = (app) => {
    if (app) state.app = app;
    attachListener();
    return state.listenerAttached;
  };

  const destroy = () => {
    close();
    if (state.canvas) state.canvas.removeEventListener('contextmenu', onContextMenu);
    state.canvas = null;
    state.listenerAttached = false;
    state.attachTries = 0;
    state.app = null;
  };

  // Run a context-menu command by id against the CURRENT selection state, and
  // report per-command enabled states. This lets the top menu bar surface the
  // exact same verbs (P3 feedback: every right-click control must also live in
  // the menu system) without duplicating the wiring.
  const findItem = (id) => buildItems().find((it) => it && !it.separator && it.id === id) || null;
  const runCommand = (id) => {
    const item = findItem(id);
    if (!item || item.enabled === false || typeof item.run !== 'function') return false;
    item.run();
    return true;
  };
  const getCommandStates = () => {
    const map = {};
    buildItems().forEach((it) => { if (it && !it.separator) map[it.id] = it.enabled !== false; });
    return map;
  };

  UI.CanvasContextMenu = {
    mount,
    openAt,
    close,
    buildItems,
    runCommand,
    getCommandStates,
    getElement: () => state.menu || null,
    destroy,
  };

  // Self-mount: begin trying to attach the listener as soon as the canvas
  // exists (app resolved lazily at open time).
  tryAttachLoop();
})();
