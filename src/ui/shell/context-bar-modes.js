/**
 * Contextual Task Bar sub-modes & live Shape Properties (Phase 2, Lane H).
 *
 *   TB-9  — sub-mode framework: morph the bar's content host in place with a
 *           focused editor + explicit exit (Back / Done). Escape exits (Back
 *           semantics; Simplify → cancel). On exit the bar restores its prior
 *           selection-context state.
 *   TB-10 — stroke weight sub-mode: slider + stepper + value field (document
 *           units) driving Vectura.StrokeModel.setStrokeWeight (one undo step
 *           per gesture); "…" → "Open Stroke Options" mounts the STR-2 panel as
 *           an anchored popover, kept synchronized with the bar.
 *   TB-11 — simplify sub-mode: complex→simple wave icons and an anchor-reduction
 *           slider whose range is scaled to the deepest achievable rung
 *           (maxSteps), so it stops once no endpoint can be removed (disabled
 *           outright when nothing is reducible). Auto-Smooth, Done. Live
 *           PathEditOps.simplifyPreview with a "{pts} pts" badge anchored below
 *           the selection; Done commits, Escape/click-away cancels and restores.
 *   SHP-1/2 — Shape Properties popover (polygon side count + uniform corner
 *           radius; rectangle uniform corner radius) bound to the renderer's
 *           live-shape param plumbing. Exposed as a standalone anchored popover
 *           so it works with or without the bar.
 *
 * Contract (phase2-shared-contract): exposes exactly
 *   Vectura.UI.ContextBarModes = { enter, enterStrokeWeight, enterSimplify,
 *                                  enterShapeProps }
 * and consumes Vectura.UI.ContextBar.{ getContentHost, restoreState, getContext,
 * anchorRectForBar, setBusy }. Everything is feature-detected: the sub-modes
 * no-op if the bar is absent; the Shape Properties popover only needs a renderer.
 *
 * Self-contained IIFE tolerant of late loading. All strings/thresholds live in
 * src/config/shape-props.js (Vectura.SHAPE_PROPS_UI / CONTEXT_BAR_MODES_UI).
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  // ── Config accessors (feature-detected, with fallbacks) ─────────────────────
  const MCFG = () => Vectura.CONTEXT_BAR_MODES_UI || {};
  const MSTR = () => (MCFG().strings) || {};
  const SCFG = () => Vectura.SHAPE_PROPS_UI || {};
  const SSTR = () => (SCFG().strings) || {};

  const getBar = () => (UI.ContextBar && typeof UI.ContextBar.getContentHost === 'function') ? UI.ContextBar : null;
  const resolveApp = (ctx) => (ctx && ctx.app) || G.app || Vectura.app || null;
  const resolveRenderer = (ctx) => (ctx && ctx.renderer) || resolveApp(ctx)?.renderer || null;

  const resolveLayers = (ctx) => {
    if (ctx && Array.isArray(ctx.layers) && ctx.layers.length) return ctx.layers.filter(Boolean);
    const app = resolveApp(ctx);
    const ids = (ctx && ctx.layerIds) || [];
    if (app?.engine?.getLayerById) return ids.map((id) => app.engine.getLayerById(id)).filter(Boolean);
    return [];
  };

  // ── Document units (mm ↔ display) ───────────────────────────────────────────
  const units = () => {
    const U = Vectura.UnitUtils || {};
    const norm = U.normalizeDocumentUnits
      || ((v) => (`${v || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
    const active = norm((Vectura.SETTINGS || {}).documentUnits);
    return {
      label: (U.getDocumentUnitLabel || ((u) => (u === 'imperial' ? 'in' : 'mm')))(active),
      toDoc: (mm) => (U.mmToDocumentUnits || ((v) => v))(mm, active),
      toMm: (v) => (U.documentUnitsToMm || ((x) => x))(v, active),
      precision: active === 'imperial' ? 4 : 2,
    };
  };
  const fmtDoc = (mm) => {
    const u = units();
    const v = u.toDoc(Number(mm) || 0);
    if (!Number.isFinite(v)) return '0';
    let text = v.toFixed(u.precision);
    if (text.includes('.')) text = text.replace(/\.?0+$/, '');
    return text;
  };
  const parseDoc = (str) => {
    const u = units();
    const n = parseFloat(String(str).replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(n)) return null;
    return u.toMm(n);
  };

  // ── DOM builder ─────────────────────────────────────────────────────────────
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => c && node.appendChild(c));
    return node;
  };
  const svgIcon = (paths, cls) => {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', '16');
    s.setAttribute('height', '16');
    s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    (Array.isArray(paths) ? paths : [paths]).forEach((d) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', '1.6');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      s.appendChild(p);
    });
    return s;
  };
  const WAVE_MIN = 'M3 12q4.5 -3 9 0t9 0';               // gentle wave — fewer points
  const WAVE_MAX = 'M3 14q1.5 -6 3 0t3 0t3 0t3 0t3 0t3 0'; // busy wave — more detail
  // Sharp-cornered zigzag tracing the same envelope (base/peak x-positions and
  // ±3 amplitude) as WAVE_MAX, but with straight segments instead of curves —
  // the "unrounded" counterpart shown opposite it in the smooth sub-mode.
  const ZIGZAG_SHARP = 'M3 14L4.5 11L6 14L7.5 17L9 14L10.5 11L12 14L13.5 17L15 14L16.5 11L18 14L19.5 17L21 14L22.5 11L24 14';
  const CORNER_ICON = 'M6 20V12a6 6 0 0 1 6 -6h8';
  const HASH_ICON = 'M9 4L7 20M17 4L15 20M4 9H20M4 15H20';

  // ── Anchored popover / badge helpers (viewport-fixed, body-appended) ─────────
  const anchorRectFor = (ctx) => {
    if (ctx && ctx.anchorRect) return ctx.anchorRect;
    const bar = getBar();
    if (bar && typeof bar.anchorRectForBar === 'function') {
      const r = bar.anchorRectForBar();
      if (r) return r;
    }
    const renderer = resolveRenderer(ctx);
    if (renderer && typeof renderer.getSelectionScreenBounds === 'function') {
      const b = renderer.getSelectionScreenBounds();
      if (b) {
        const canvas = renderer.canvas || document.getElementById('main-canvas');
        const cr = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
        return {
          left: cr.left + b.minX, top: cr.top + b.minY,
          right: cr.left + b.maxX, bottom: cr.top + b.maxY,
          width: b.width, height: b.height,
          centerX: cr.left + b.centerX,
        };
      }
    }
    return null;
  };

  const mountPopover = (rect, className) => {
    const host = el('div', { class: `ctxbar-popover ${className || ''}`.trim(), role: 'dialog' });
    host.style.position = 'fixed';
    document.body.appendChild(host);
    const position = () => {
      const r = rect || {};
      const gap = Number.isFinite(SCFG().ANCHOR_GAP_PX) ? SCFG().ANCHOR_GAP_PX : 10;
      const pw = host.offsetWidth || 0;
      const centerX = Number.isFinite(r.centerX) ? r.centerX : ((r.left ?? 0) + (r.width ?? 0) / 2);
      let left = centerX - pw / 2;
      let top = (r.bottom ?? r.top ?? 0) + gap;
      const vw = G.innerWidth || 0;
      if (pw && left + pw > vw - 8) left = Math.max(8, vw - pw - 8);
      if (left < 8) left = 8;
      host.style.left = `${Math.round(left)}px`;
      host.style.top = `${Math.round(top)}px`;
    };
    position();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(position);
    return { host, position, close: () => host.remove() };
  };

  // ── TB-9 — sub-mode framework ───────────────────────────────────────────────
  let active = null; // { def, host, cleanupFns, keyHandler, api }

  const teardownActive = (committed) => {
    if (!active) return;
    const a = active;
    active = null;
    if (a.keyHandler) document.removeEventListener('keydown', a.keyHandler, true);
    (a.cleanupFns || []).forEach((fn) => { try { fn(); } catch (_e) { /* noop */ } });
    try { a.def.onExit && a.def.onExit(Boolean(committed)); } catch (_e) { /* noop */ }
    const bar = getBar();
    if (bar) {
      // Lane G's setBusy(false) re-renders the prior selection-context state
      // itself, so calling restoreState() again would double-render on every
      // exit. Prefer setBusy for the restore; fall back to restoreState only for
      // a bar that has no setBusy.
      if (typeof bar.setBusy === 'function') {
        try { bar.setBusy(false); } catch (_e) { /* noop */ }
      } else if (typeof bar.restoreState === 'function') {
        try { bar.restoreState(); } catch (_e) { /* noop */ }
      }
    }
  };

  const enter = (def) => {
    if (!def || typeof def.render !== 'function') return null;
    const bar = getBar();
    if (!bar) return null; // no-op without the bar (feature-detect)
    const host = bar.getContentHost();
    if (!host) return null;
    if (active) teardownActive(false);
    const ctx = (typeof bar.getContext === 'function' ? bar.getContext() : null) || {};
    try { bar.setBusy && bar.setBusy(true); } catch (_e) { /* noop */ }

    host.innerHTML = '';
    host.setAttribute('data-ctxbar-submode', def.id || 'submode');
    const cleanupFns = [];
    let api = null;
    try { api = def.render(host, ctx) || null; } catch (_e) { api = null; }
    if (api && typeof api.cleanup === 'function') cleanupFns.push(api.cleanup);

    const strings = MSTR();
    const isDone = def.exitKind === 'done';
    const exitBtn = el('button', {
      type: 'button',
      class: `ctxbar-submode-exit ${isDone ? 'is-done' : 'is-back'}`,
      'data-ctxbar-exit': isDone ? 'done' : 'back',
      title: isDone ? (strings.done || 'Done') : (strings.back || 'Back'),
    });
    exitBtn.textContent = isDone ? (strings.done || 'Done') : (strings.back || 'Back');
    exitBtn.addEventListener('click', () => teardownActive(isDone));
    host.appendChild(exitBtn);

    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        teardownActive(false); // Back semantics; Simplify.onExit(false) = cancel
      }
    };
    document.addEventListener('keydown', keyHandler, true);

    active = { def, host, cleanupFns, keyHandler, api };
    try { def.onEnter && def.onEnter(ctx); } catch (_e) { /* noop */ }
    return { id: def.id, exit: (c) => teardownActive(Boolean(c)) };
  };

  // ── TB-10 — stroke weight sub-mode ──────────────────────────────────────────
  const strokeBounds = () => {
    const S = Vectura.STROKE_STYLE || {};
    const c = MCFG();
    return {
      min: Number.isFinite(c.STROKE_SLIDER_MIN_MM) ? c.STROKE_SLIDER_MIN_MM
        : (Number.isFinite(S.WEIGHT_MIN_MM) ? S.WEIGHT_MIN_MM : 0.05),
      max: Number.isFinite(c.STROKE_SLIDER_MAX_MM) ? c.STROKE_SLIDER_MAX_MM
        : (Number.isFinite(S.WEIGHT_MAX_MM) ? S.WEIGHT_MAX_MM : 5),
      step: Number.isFinite(c.STROKE_STEP_MM) ? c.STROKE_STEP_MM
        : (Number.isFinite(S.WEIGHT_STEP_MM) ? S.WEIGHT_STEP_MM : 0.05),
    };
  };

  const buildStrokeWeightMode = (outerCtx) => ({
    id: 'stroke-weight',
    exitKind: 'back',
    render(host, barCtx) {
      const ctx = { ...outerCtx, ...barCtx, app: resolveApp(barCtx) || resolveApp(outerCtx) };
      const strings = MSTR();
      const b = strokeBounds();
      const app = resolveApp(ctx);
      const layers = () => resolveLayers(ctx);
      const primary = () => layers()[0] || (ctx && ctx.primaryLayer) || null;
      const clampW = (mm) => Math.max(b.min, Math.min(b.max, Number(mm) || b.min));
      const readWeight = () => {
        const l = primary();
        return l ? (Number(l.strokeWidth) || 0) : 0;
      };

      let strokeOptionsHandle = null;
      let strokeOptionsPopover = null;

      const applyWeight = (mm, opts = {}) => {
        const M = Vectura.StrokeModel;
        const ls = layers();
        if (!M || !ls.length) return;
        const value = clampW(mm);
        if (ls.length > 1 && M.setStrokeWeightForLayers) {
          M.setStrokeWeightForLayers(ls, value, { app, ...opts });
        } else if (M.setStrokeWeight) {
          M.setStrokeWeight(primary(), value, { app, ...opts });
        }
        refresh();
      };

      const wrap = el('div', { class: 'ctxbar-submode ctxbar-stroke-weight' });
      wrap.appendChild(el('span', { class: 'ctxbar-submode-icon', title: strings.strokeWeightLabel || 'Stroke weight' }, [svgIcon(['M4 17h16', 'M4 12h16', 'M4 7h16'], 'ctxbar-weight-icon')]));

      const slider = el('input', {
        type: 'range', class: 'ctxbar-slider ctxbar-weight-slider',
        min: `${b.min}`, max: `${b.max}`, step: `${b.step}`,
        'aria-label': strings.strokeWeightLabel || 'Stroke weight',
      });
      const dec = el('button', { type: 'button', class: 'ctxbar-stepper', 'data-weight-dec': '', title: strings.strokeDecrease || 'Decrease', 'aria-label': strings.strokeDecrease || 'Decrease' });
      dec.textContent = '−';
      const inc = el('button', { type: 'button', class: 'ctxbar-stepper', 'data-weight-inc': '', title: strings.strokeIncrease || 'Increase', 'aria-label': strings.strokeIncrease || 'Increase' });
      inc.textContent = '+';
      const field = el('input', { type: 'text', class: 'ctxbar-field ctxbar-weight-field', inputmode: 'decimal', 'aria-label': strings.strokeWeightLabel || 'Stroke weight' });
      const unitTag = el('span', { class: 'ctxbar-unit', text: units().label });

      const overflow = el('button', { type: 'button', class: 'ctxbar-overflow', 'data-ctxbar-overflow': '', title: strings.overflow || 'More options', 'aria-label': strings.overflow || 'More options' });
      overflow.textContent = '…';

      wrap.appendChild(dec);
      wrap.appendChild(slider);
      wrap.appendChild(inc);
      wrap.appendChild(field);
      wrap.appendChild(unitTag);
      wrap.appendChild(overflow);
      host.appendChild(wrap);

      // Slider gesture → one undo step per drag.
      let begun = false;
      slider.addEventListener('pointerdown', () => { begun = false; });
      slider.addEventListener('input', () => {
        applyWeight(slider.value, { begin: !begun, commit: false });
        begun = true;
      });
      const endSlide = () => {
        if (begun) applyWeight(slider.value, { begin: false, commit: true });
        begun = false;
      };
      slider.addEventListener('pointerup', endSlide);
      slider.addEventListener('change', endSlide);

      dec.addEventListener('click', () => applyWeight(readWeight() - b.step, { begin: true, commit: true }));
      inc.addEventListener('click', () => applyWeight(readWeight() + b.step, { begin: true, commit: true }));
      const commitField = () => {
        const mm = parseDoc(field.value);
        if (mm != null) applyWeight(mm, { begin: true, commit: true });
        else refresh();
      };
      field.addEventListener('change', commitField);
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitField(); field.blur(); } });

      // "…" menu → Open Stroke Options (STR-2 popover anchored below the bar).
      let menu = null;
      const closeMenu = () => { if (menu) { menu.close(); menu = null; } };
      const closeStrokeOptions = () => {
        if (strokeOptionsHandle && strokeOptionsHandle.destroy) { try { strokeOptionsHandle.destroy(); } catch (_e) { /* noop */ } }
        strokeOptionsHandle = null;
        if (strokeOptionsPopover) { strokeOptionsPopover.close(); strokeOptionsPopover = null; }
      };
      const openStrokeOptions = () => {
        closeMenu();
        closeStrokeOptions();
        const Panel = UI.StrokeOptionsPanel;
        if (!Panel || !Panel.render) return;
        const rect = anchorRectFor(ctx);
        strokeOptionsPopover = mountPopover(rect, 'ctxbar-stroke-options-popover');
        const ids = (ctx.layerIds && ctx.layerIds.length) ? ctx.layerIds : layers().map((l) => l.id);
        strokeOptionsHandle = Panel.render(strokeOptionsPopover.host, {
          app,
          layerIds: ids,
          onChange: () => { if (app && app.render) app.render(); refresh(); },
        });
        strokeOptionsPopover.position();
      };
      overflow.addEventListener('click', (e) => {
        e.stopPropagation();
        if (menu) { closeMenu(); return; }
        const rect = overflow.getBoundingClientRect();
        menu = mountPopover({ left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, centerX: (rect.left + rect.right) / 2 }, 'ctxbar-menu');
        const item = el('button', { type: 'button', class: 'ctxbar-menu-item', 'data-open-stroke-options': '' }, []);
        item.textContent = strings.openStrokeOptions || 'Open Stroke Options';
        item.addEventListener('click', openStrokeOptions);
        menu.host.appendChild(item);
        menu.position();
      });
      const onDocDown = (e) => {
        if (menu && !menu.host.contains(e.target) && e.target !== overflow) closeMenu();
      };
      document.addEventListener('pointerdown', onDocDown, true);

      const refresh = () => {
        // MSC-1: differing stroke weights across the selection show a "mixed"
        // placeholder instead of the primary's value; applying unifies them.
        const ls = layers();
        const M = Vectura.MixedValue;
        const MX = Vectura.MIXED_VALUES || {};
        const mv = (M && M.strokeWeight)
          ? M.strokeWeight(ls)
          : { value: readWeight(), mixed: false };
        const w = mv.mixed ? readWeight() : (mv.value ?? readWeight());
        slider.value = `${clampW(w)}`;
        if (document.activeElement !== field) {
          if (mv.mixed) { field.value = ''; field.placeholder = MX.placeholder || 'mixed'; }
          else { field.value = fmtDoc(w); field.placeholder = ''; }
        }
        field.classList.toggle('is-mixed', Boolean(mv.mixed));
        field.title = mv.mixed ? (MX.strokeWeightTitle || '') : '';
        unitTag.textContent = units().label;
        if (strokeOptionsHandle && strokeOptionsHandle.refresh) { try { strokeOptionsHandle.refresh(); } catch (_e) { /* noop */ } }
      };
      refresh();

      return {
        refresh,
        cleanup: () => {
          document.removeEventListener('pointerdown', onDocDown, true);
          closeMenu();
          closeStrokeOptions();
        },
      };
    },
  });

  const enterStrokeWeight = (ctx) => {
    if (!getBar()) return null;
    return enter(buildStrokeWeightMode(ctx || {}));
  };

  // ── TB-11 — simplify sub-mode ───────────────────────────────────────────────
  const buildSimplifyMode = (outerCtx) => {
    let ctx = outerCtx || {};
    let badge = null;
    let clickAway = null;
    // Usable slider travel (deepest reduction rung) and the starting point count,
    // captured from simplifyBegin(); the slider range is scaled to maxSteps so the
    // thumb physically stops once no more endpoints can be removed.
    let maxSteps = 0;
    let pointsBefore = 0;
    let started = false;

    const removeBadge = () => { if (badge) { badge.remove(); badge = null; } };
    const showBadge = (res) => {
      const strings = MSTR();
      const pts = (res && Number.isFinite(res.pointsAfter)) ? res.pointsAfter
        : (res && Number.isFinite(res.pointsBefore)) ? res.pointsBefore : pointsBefore;
      let text = (strings.simplifyBadge || '{pts} pts').replace('{pts}', pts);
      if (maxSteps <= 0) text += ` · ${strings.simplifyNothing || 'nothing to simplify'}`;
      if (!badge) {
        badge = el('div', { class: 'ctxbar-simplify-badge', role: 'status' });
        badge.style.position = 'fixed';
        document.body.appendChild(badge);
      }
      badge.textContent = text;
      const rect = anchorRectFor(ctx);
      if (rect) {
        const gap = Number.isFinite(SCFG().ANCHOR_GAP_PX) ? SCFG().ANCHOR_GAP_PX : 10;
        const bw = badge.offsetWidth || 0;
        const centerX = Number.isFinite(rect.centerX) ? rect.centerX : ((rect.left ?? 0) + (rect.width ?? 0) / 2);
        badge.style.left = `${Math.round(centerX - bw / 2)}px`;
        badge.style.top = `${Math.round((rect.bottom ?? rect.top ?? 0) + gap)}px`;
      }
    };

    return {
      id: 'simplify',
      exitKind: 'done',
      onEnter(barCtx) {
        ctx = { ...outerCtx, ...barCtx, app: resolveApp(barCtx) || resolveApp(outerCtx) };
        // The session itself is begun in render() (which enter() runs BEFORE
        // onEnter) so the slider range can be scaled to the returned maxSteps.
        // Click-away cancels (Escape/click-away → cancel per PTH-1).
        clickAway = (e) => {
          if (!active) return;
          if (active.host && active.host.contains(e.target)) return;
          if (badge && badge.contains(e.target)) return;
          teardownActive(false);
        };
        document.addEventListener('pointerdown', clickAway, true);
      },
      render(host, barCtx) {
        ctx = { ...ctx, ...barCtx };
        const strings = MSTR();
        const c = MCFG();
        const ops = Vectura.PathEditOps;
        const app = resolveApp(ctx);
        const ids = () => ((ctx.layerIds && ctx.layerIds.length) ? ctx.layerIds : resolveLayers(ctx).map((l) => l.id));

        // Begin the reduction-ladder session (once), capturing the usable travel
        // (maxSteps) so the slider range can be scaled to it. enter() runs
        // render() BEFORE onEnter(), so beginning here (not in onEnter) is what
        // lets the slider size itself to the deepest achievable rung.
        if (!started) {
          started = true;
          const begun = (ops && ops.simplifyBegin) ? ops.simplifyBegin(ids(), { app }) : null;
          maxSteps = (begun && Number.isFinite(begun.maxSteps)) ? Math.max(0, begun.maxSteps) : 0;
          pointsBefore = (begun && Number.isFinite(begun.pointsBefore)) ? begun.pointsBefore : 0;
        }

        // Left = complex (most detail); right = simple (fewest points). The
        // slider's usable range is scaled to maxSteps — the deepest reduction
        // rung — so the thumb starts at the complex end and cannot travel past
        // the point where no further endpoint can be removed.
        const reducible = maxSteps > 0;
        const wrap = el('div', { class: `ctxbar-submode ctxbar-simplify${reducible ? '' : ' is-unreducible'}` });
        wrap.appendChild(el('span', { class: 'ctxbar-submode-icon', title: strings.simplifyMaxWave || 'More detail' }, [svgIcon(WAVE_MAX, 'ctxbar-wave-max')]));
        const slider = el('input', {
          type: 'range', class: 'ctxbar-slider ctxbar-simplify-slider',
          min: '0', max: `${reducible ? maxSteps : (c.SIMPLIFY_STEP ?? 1)}`, step: `${c.SIMPLIFY_STEP ?? 1}`,
          value: '0', 'aria-label': strings.simplifyLabel || 'Simplify',
        });
        if (!reducible) slider.disabled = true;
        wrap.appendChild(slider);
        wrap.appendChild(el('span', { class: 'ctxbar-submode-icon', title: strings.simplifyMinWave || 'Fewer points' }, [svgIcon(WAVE_MIN, 'ctxbar-wave-min')]));
        const auto = el('button', { type: 'button', class: 'ctxbar-auto-smooth', title: strings.autoSmooth || 'Auto-Smooth', 'aria-label': strings.autoSmooth || 'Auto-Smooth' }, []);
        auto.textContent = strings.autoSmooth || 'Auto-Smooth';
        if (!reducible) auto.disabled = true;
        wrap.appendChild(auto);
        host.appendChild(wrap);
        // Show the starting count immediately (and the "nothing to simplify"
        // note when the selection is already at its minimal anchor set).
        showBadge({ pointsAfter: pointsBefore });

        const preview = (index) => {
          if (!ops || !ops.simplifyPreview) return;
          const res = ops.simplifyPreview(Number(index) || 0, { app });
          showBadge(res || { pointsAfter: pointsBefore });
        };
        slider.addEventListener('input', () => preview(slider.value));
        auto.addEventListener('click', () => {
          if (!ops || !ops.autoSmooth || !reducible) return;
          const idx = ops.autoSmooth(ids(), { app });
          slider.value = `${idx}`;
          preview(idx);
        });

        return {
          cleanup: () => {
            if (clickAway) { document.removeEventListener('pointerdown', clickAway, true); clickAway = null; }
            removeBadge();
          },
        };
      },
      onExit(committed) {
        const ops = Vectura.PathEditOps;
        const app = resolveApp(ctx);
        if (!ops) { removeBadge(); return; }
        if (committed && ops.simplifyCommit) ops.simplifyCommit({ app });
        else if (ops.simplifyCancel) ops.simplifyCancel({ app });
        removeBadge();
      },
    };
  };

  const enterSimplify = (ctx) => {
    if (!getBar()) return null;
    return enter(buildSimplifyMode(ctx || {}));
  };

  // ── TB-11b — smooth sub-mode (progressive corner rounding) ──────────────────
  // Mirrors the simplify sub-mode but drives PathEditOps' smooth session, so
  // the Smooth button opens a live slider (low → high rounding) with Done and
  // an Auto button — Illustrator-parity — instead of a fixed one-shot.
  const buildSmoothMode = (outerCtx) => {
    let ctx = outerCtx || {};
    let badge = null;
    let clickAway = null;

    const removeBadge = () => { if (badge) { badge.remove(); badge = null; } };
    const showBadge = (t) => {
      const strings = MSTR();
      const pct = Math.round(t || 0);
      const text = (strings.smoothBadge || '{t} % smooth').replace('{t}', pct);
      if (!badge) {
        badge = el('div', { class: 'ctxbar-simplify-badge', role: 'status' });
        badge.style.position = 'fixed';
        document.body.appendChild(badge);
      }
      badge.textContent = text;
      const rect = anchorRectFor(ctx);
      if (rect) {
        const gap = Number.isFinite(SCFG().ANCHOR_GAP_PX) ? SCFG().ANCHOR_GAP_PX : 10;
        const bw = badge.offsetWidth || 0;
        const centerX = Number.isFinite(rect.centerX) ? rect.centerX : ((rect.left ?? 0) + (rect.width ?? 0) / 2);
        badge.style.left = `${Math.round(centerX - bw / 2)}px`;
        badge.style.top = `${Math.round((rect.bottom ?? rect.top ?? 0) + gap)}px`;
      }
    };

    return {
      id: 'smooth',
      exitKind: 'done',
      onEnter(barCtx) {
        ctx = { ...outerCtx, ...barCtx, app: resolveApp(barCtx) || resolveApp(outerCtx) };
        const ops = Vectura.PathEditOps;
        const app = resolveApp(ctx);
        const ids = (ctx.layerIds && ctx.layerIds.length) ? ctx.layerIds : resolveLayers(ctx).map((l) => l.id);
        if (ops && ops.smoothBegin) ops.smoothBegin(ids, { app });
        clickAway = (e) => {
          if (!active) return;
          if (active.host && active.host.contains(e.target)) return;
          if (badge && badge.contains(e.target)) return;
          teardownActive(false);
        };
        document.addEventListener('pointerdown', clickAway, true);
      },
      render(host, barCtx) {
        ctx = { ...ctx, ...barCtx };
        const strings = MSTR();
        const c = MCFG();
        const ops = Vectura.PathEditOps;
        const app = resolveApp(ctx);
        const ids = () => ((ctx.layerIds && ctx.layerIds.length) ? ctx.layerIds : resolveLayers(ctx).map((l) => l.id));

        const wrap = el('div', { class: 'ctxbar-submode ctxbar-simplify ctxbar-smooth-mode' });
        wrap.appendChild(el('span', { class: 'ctxbar-submode-icon', title: strings.smoothMinWave || 'Sharper' }, [svgIcon(ZIGZAG_SHARP, 'ctxbar-wave-sharp')]));
        const slider = el('input', {
          type: 'range', class: 'ctxbar-slider ctxbar-smooth-slider',
          min: `${c.SIMPLIFY_MIN ?? 0}`, max: `${c.SIMPLIFY_MAX ?? 100}`, step: `${c.SIMPLIFY_STEP ?? 1}`,
          value: '0', 'aria-label': strings.smoothLabel || 'Smooth',
        });
        wrap.appendChild(slider);
        wrap.appendChild(el('span', { class: 'ctxbar-submode-icon', title: strings.smoothMaxWave || 'Rounder' }, [svgIcon(WAVE_MAX, 'ctxbar-wave-max')]));
        const auto = el('button', { type: 'button', class: 'ctxbar-auto-smooth', title: strings.autoSmooth || 'Auto-Smooth', 'aria-label': strings.autoSmooth || 'Auto-Smooth' }, []);
        auto.textContent = strings.autoSmooth || 'Auto-Smooth';
        wrap.appendChild(auto);
        host.appendChild(wrap);

        const preview = (t) => {
          if (!ops || !ops.smoothPreview) return;
          const res = ops.smoothPreview(Number(t) || 0, { app });
          showBadge((res && res.t) || Number(t) || 0);
        };
        slider.addEventListener('input', () => preview(slider.value));
        auto.addEventListener('click', () => {
          // Auto: a pleasant mid rounding. (PTH-2 autoSmooth returns a
          // simplify-LADDER RUNG index — a different domain from this slider's
          // 0-100 t — so reusing it here parked the thumb at ~3% and visibly
          // did nothing.)
          const t = 50;
          slider.value = `${t}`;
          preview(t);
        });

        return {
          cleanup: () => {
            if (clickAway) { document.removeEventListener('pointerdown', clickAway, true); clickAway = null; }
            removeBadge();
          },
        };
      },
      onExit(committed) {
        const ops = Vectura.PathEditOps;
        const app = resolveApp(ctx);
        if (!ops) { removeBadge(); return; }
        if (committed && ops.smoothCommit) ops.smoothCommit({ app });
        else if (ops.smoothCancel) ops.smoothCancel({ app });
        removeBadge();
      },
    };
  };

  const enterSmooth = (ctx) => {
    if (!getBar()) return null;
    return enter(buildSmoothMode(ctx || {}));
  };

  // ── SHP-1/2 — Shape Properties popover (standalone anchored) ─────────────────
  let shapePropsPopover = null;
  const closeShapeProps = () => {
    if (shapePropsPopover) { shapePropsPopover.destroy(); shapePropsPopover = null; }
  };

  const enterShapeProps = (ctx) => {
    const renderer = resolveRenderer(ctx);
    if (!renderer || typeof renderer.getShapePropsState !== 'function') return null;
    const state0 = renderer.getShapePropsState();
    if (!state0 || (!state0.supportsCornerRadius && !state0.supportsSides)) return null;

    closeShapeProps();
    const strings = SSTR();
    const cfg = SCFG();
    const rect = anchorRectFor(ctx);
    const pop = mountPopover(rect, 'shape-props-popover');
    const host = pop.host;

    const title = el('div', { class: 'shape-props-title' });
    title.textContent = state0.type === 'rect' ? (strings.rectTitle || 'Rectangle') : (strings.polygonTitle || 'Polygon');
    host.appendChild(title);

    // Corner Type & Radius (rect + polygon).
    let cornerField = null;
    if (state0.supportsCornerRadius) {
      const row = el('div', { class: 'shape-props-row shape-props-corner' });
      row.appendChild(el('span', { class: 'shape-props-label', text: strings.cornerLabel || 'Corner Type & Radius' }));
      const ctrl = el('div', { class: 'shape-props-control' });
      ctrl.appendChild(el('span', { class: 'shape-props-icon', title: strings.cornerLabel || 'Corner' }, [svgIcon(CORNER_ICON)]));
      const cDec = el('button', { type: 'button', class: 'shape-props-stepper', title: strings.cornerDecrease || 'Decrease', 'aria-label': strings.cornerDecrease || 'Decrease' });
      cDec.textContent = '−';
      cornerField = el('input', { type: 'text', class: 'shape-props-field shape-props-corner-field', inputmode: 'decimal', 'aria-label': strings.cornerFieldLabel || 'Corner radius' });
      const cInc = el('button', { type: 'button', class: 'shape-props-stepper', title: strings.cornerIncrease || 'Increase', 'aria-label': strings.cornerIncrease || 'Increase' });
      cInc.textContent = '+';
      const cUnit = el('span', { class: 'shape-props-unit', text: units().label });
      ctrl.appendChild(cDec);
      ctrl.appendChild(cornerField);
      ctrl.appendChild(cInc);
      ctrl.appendChild(cUnit);
      row.appendChild(ctrl);
      host.appendChild(row);

      const stepMm = Number.isFinite(cfg.CORNER_STEP_MM) ? cfg.CORNER_STEP_MM : 0.5;
      const readCorner = () => {
        const s = renderer.getShapePropsState();
        return s ? s.cornerRadiusMm : 0;
      };
      const setCorner = (mm) => {
        renderer.beginShapePropsEdit();
        renderer.setShapeUniformCornerRadius(Math.max(0, mm));
        renderer.endShapePropsEdit();
        refresh();
      };
      cDec.addEventListener('click', () => setCorner(readCorner() - stepMm));
      cInc.addEventListener('click', () => setCorner(readCorner() + stepMm));
      const commitCorner = () => {
        const mm = parseDoc(cornerField.value);
        if (mm != null) setCorner(mm); else refresh();
      };
      cornerField.addEventListener('change', commitCorner);
      cornerField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitCorner(); cornerField.blur(); } });

      // Horizontal scrub on the field (drag to change), one undo step per drag.
      const perPx = Number.isFinite(cfg.CORNER_SCRUB_MM_PER_PX) ? cfg.CORNER_SCRUB_MM_PER_PX : 0.15;
      let scrub = null;
      cornerField.addEventListener('pointerdown', (e) => {
        scrub = { startX: e.clientX, startMm: readCorner() };
        renderer.beginShapePropsEdit();
        try { cornerField.setPointerCapture(e.pointerId); } catch (_e) { /* noop */ }
      });
      cornerField.addEventListener('pointermove', (e) => {
        if (!scrub) return;
        const mm = Math.max(0, scrub.startMm + (e.clientX - scrub.startX) * perPx);
        renderer.setShapeUniformCornerRadius(mm);
        refresh();
      });
      const endScrub = () => { if (!scrub) return; scrub = null; renderer.endShapePropsEdit(); refresh(); };
      cornerField.addEventListener('pointerup', endScrub);
      cornerField.addEventListener('pointercancel', endScrub);
    }

    // Side Count (polygon only).
    let sidesSlider = null;
    let sidesField = null;
    if (state0.supportsSides) {
      const row = el('div', { class: 'shape-props-row shape-props-sides' });
      row.appendChild(el('span', { class: 'shape-props-label', text: strings.sidesLabel || 'Side Count' }));
      const ctrl = el('div', { class: 'shape-props-control' });
      ctrl.appendChild(el('span', { class: 'shape-props-icon', title: strings.sidesLabel || 'Sides' }, [svgIcon(HASH_ICON)]));
      const sMin = Number.isFinite(cfg.SIDES_MIN) ? cfg.SIDES_MIN : 3;
      const sMax = Number.isFinite(cfg.SIDES_MAX) ? cfg.SIDES_MAX : 20;
      sidesSlider = el('input', { type: 'range', class: 'shape-props-slider shape-props-sides-slider', min: `${sMin}`, max: `${sMax}`, step: '1', 'aria-label': strings.sidesLabel || 'Side Count' });
      const sDec = el('button', { type: 'button', class: 'shape-props-stepper', title: strings.sidesDecrease || 'Fewer sides', 'aria-label': strings.sidesDecrease || 'Fewer sides' });
      sDec.textContent = '−';
      sidesField = el('input', { type: 'text', class: 'shape-props-field shape-props-sides-field', inputmode: 'numeric', 'aria-label': strings.sidesLabel || 'Side Count' });
      const sInc = el('button', { type: 'button', class: 'shape-props-stepper', title: strings.sidesIncrease || 'More sides', 'aria-label': strings.sidesIncrease || 'More sides' });
      sInc.textContent = '+';
      ctrl.appendChild(sidesSlider);
      ctrl.appendChild(sDec);
      ctrl.appendChild(sidesField);
      ctrl.appendChild(sInc);
      row.appendChild(ctrl);
      host.appendChild(row);

      const clampSides = (n) => Math.max(sMin, Math.min(sMax, Math.round(Number(n) || sMin)));
      const readSides = () => {
        const s = renderer.getShapePropsState();
        return s ? (s.sides || sMin) : sMin;
      };
      const setSides = (n, opts = {}) => {
        if (!opts.continuing) renderer.beginShapePropsEdit();
        renderer.setShapeSides(clampSides(n));
        if (!opts.continuing) { renderer.endShapePropsEdit(); refresh(); }
      };
      let sidesBegun = false;
      sidesSlider.addEventListener('pointerdown', () => { renderer.beginShapePropsEdit(); sidesBegun = true; });
      sidesSlider.addEventListener('input', () => { renderer.setShapeSides(clampSides(sidesSlider.value)); refresh(); });
      const endSides = () => { if (!sidesBegun) return; sidesBegun = false; renderer.endShapePropsEdit(); refresh(); };
      sidesSlider.addEventListener('pointerup', endSides);
      sidesSlider.addEventListener('change', endSides);
      sDec.addEventListener('click', () => setSides(readSides() - 1));
      sInc.addEventListener('click', () => setSides(readSides() + 1));
      const commitSides = () => {
        const n = parseInt(sidesField.value, 10);
        if (Number.isFinite(n)) setSides(n); else refresh();
      };
      sidesField.addEventListener('change', commitSides);
      sidesField.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitSides(); sidesField.blur(); } });
    }

    const closeBtn = el('button', { type: 'button', class: 'shape-props-close', title: strings.closeLabel || 'Close', 'aria-label': strings.closeLabel || 'Close' });
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeShapeProps());
    host.appendChild(closeBtn);

    // Live refresh from the renderer's persisted params (round-trips with the
    // on-canvas corner widget — SHP-2 sync).
    const refresh = () => {
      const s = renderer.getShapePropsState();
      if (!s) { closeShapeProps(); return; }
      if (cornerField && document.activeElement !== cornerField) {
        cornerField.value = s.cornerRadiusMixed ? (strings.cornerMixed || 'Mixed') : fmtDoc(s.cornerRadiusMm);
      }
      if (sidesSlider && document.activeElement !== sidesField) {
        sidesSlider.value = `${s.sides || sidesSlider.min}`;
        if (sidesField) sidesField.value = `${s.sides || ''}`;
      }
      pop.position();
    };
    refresh();

    // Sync with on-canvas corner-widget releases + Escape/click-away close.
    const onDocUp = () => { if (shapePropsPopover) refresh(); };
    const onDocDown = (e) => {
      if (host.contains(e.target)) return;
      // Ignore clicks on the canvas corner widget so a drag there doesn't close us.
      closeShapeProps();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeShapeProps(); } };
    document.addEventListener('pointerup', onDocUp, true);
    document.addEventListener('keydown', onKey, true);
    // Defer the click-away binding so the opening click doesn't immediately close.
    let downBound = false;
    const bindDown = () => { if (!downBound) { document.addEventListener('pointerdown', onDocDown, true); downBound = true; } };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(bindDown); else bindDown();

    shapePropsPopover = {
      host,
      refresh,
      destroy: () => {
        document.removeEventListener('pointerup', onDocUp, true);
        document.removeEventListener('keydown', onKey, true);
        if (downBound) document.removeEventListener('pointerdown', onDocDown, true);
        pop.close();
      },
    };
    return { id: 'shape-props', close: closeShapeProps, refresh };
  };

  // ── Public surface (exactly the shared contract) ────────────────────────────
  UI.ContextBarModes = {
    ...(UI.ContextBarModes || {}),
    enter,
    enterStrokeWeight,
    enterSimplify,
    enterSmooth,
    enterShapeProps,
    // Escape hatch for the integrator / tests.
    _exitActive: teardownActive,
    _closeShapeProps: closeShapeProps,
  };
})();
