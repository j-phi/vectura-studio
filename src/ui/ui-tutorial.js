(() => {
  'use strict';
  const ns = (window.Vectura = window.Vectura || {});

  // ─────────────────────────────────────────────────────────────────
  //  Vectura Studio — onboarding tour engine
  //
  //  Adding / editing a step? Scroll to STEPS at the bottom. Each step
  //  is data-only; behavior comes from three composable layers above:
  //
  //    Visuals  — Highlight, Circles, Popover (drag-to-move, placement)
  //    Actions  — onEnter side effects (open menus, expand sections…)
  //    Triggers — `gate` (pre-condition) and `completion` (auto-advance)
  //
  //  Each step may declare `phases: [...]` to guide the user through a
  //  multi-stage interaction in place (the visible step number does not
  //  change between phases — only body, target, and completion do).
  // ─────────────────────────────────────────────────────────────────

  // ─── DOM helpers ─────────────────────────────────────────────────
  const qs = (sel, root = document) => (sel ? root.querySelector(sel) : null);
  const qsa = (sel, root = document) => (sel ? Array.from(root.querySelectorAll(sel)) : []);
  // Note: `offsetParent` is null for `position: fixed` elements even when
  // they're on screen, so fall back to a layout-box check (offsetWidth/Height)
  // before declaring an element invisible.
  const isVisible = (el) => {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    return el.offsetWidth > 0 || el.offsetHeight > 0;
  };

  const layerIcons = () => (ns.Icons && ns.Icons.layer) || {};
  const iconHtml = (key) => {
    const fn = layerIcons()[key];
    return fn ? fn() : '';
  };
  const inlineIcon = (key) =>
    `<span class="tutorial-icon-inline" aria-hidden="true">${iconHtml(key)}</span>`;

  // ─── App accessors ───────────────────────────────────────────────
  const getApp    = () => window.app || null;
  const getUI     = () => window.app?.ui || null;
  const getEngine = () => window.app?.engine || null;
  const getLayers = () => getEngine()?.layers || [];
  const getActiveLayer = () => getEngine()?.getActiveLayer?.() || null;

  // ─── Action helpers (return a teardown fn or null) ───────────────
  const Actions = {
    expandSection(headerId, bodyId) {
      const header = qs('#' + headerId);
      const body   = qs('#' + bodyId);
      if (!header || !body) return null;
      const wasOpen = header.getAttribute('aria-expanded') === 'true';
      if (!wasOpen) header.click();
      return null;
    },
    openLayerAddMenu() {
      const ui   = getUI();
      const menu = qs('#layer-add-menu');
      const btn  = qs('#btn-add-layer');
      if (!menu || !btn) return null;
      if (ui) ui.layerAddOpen = true;
      menu.classList.remove('hidden');
      return () => {
        if (ui) ui.layerAddOpen = false;
        menu.classList.add('hidden');
      };
    },
    openTopMenuFile() {
      const ui = getUI();
      const trigger = qs('#top-menubar [data-top-menu-trigger]');
      if (!ui || !trigger || typeof ui.setTopMenuOpen !== 'function') return null;
      ui.setTopMenuOpen(trigger, true);
      return () => {
        if (ui.openTopMenuTrigger === trigger) ui.setTopMenuOpen(null, false);
      };
    },
    pinTopMenuFile() {
      // Open the File menu and keep it open: any external click that closes it
      // gets reverted by the watcher below. Clicking a menu item flips
      // `userPicked`, after which we let the menu close naturally.
      const ui = getUI();
      const trigger = qs('#top-menubar [data-top-menu-trigger]');
      const panel = trigger?.parentElement?.querySelector('[data-top-menu-panel]');
      if (!ui || !trigger || typeof ui.setTopMenuOpen !== 'function') return null;
      ui.setTopMenuOpen(trigger, true);
      let userPicked = false;
      const onItemClick = (ev) => {
        if (ev.target.closest('.top-menu-item')) userPicked = true;
      };
      panel?.addEventListener('click', onItemClick, true);
      const watch = setInterval(() => {
        if (userPicked) return;
        if (ui.openTopMenuTrigger !== trigger) ui.setTopMenuOpen(trigger, true);
      }, 80);
      return () => {
        clearInterval(watch);
        panel?.removeEventListener('click', onItemClick, true);
        if (ui.openTopMenuTrigger === trigger) ui.setTopMenuOpen(null, false);
      };
    },
  };

  // ─── Completion / gate factories ─────────────────────────────────
  const When = {
    predicate: (check) => ({ type: 'predicate', check }),
    click:     (check) => ({ type: 'event', events: ['click'], listenOn: document, check }),

    elementVisible: (selector) =>
      When.predicate(() => {
        const el = qs(selector);
        return Boolean(el) && !el.classList.contains('hidden') && isVisible(el);
      }),

    activeLayerType: (type) =>
      When.predicate(() => getActiveLayer()?.type === type),

    anyAlgorithmLayer: () =>
      When.predicate(() => getLayers().some((l) => l && !l.isGroup && l.type !== 'shape')),

    layerOfType: (type) =>
      When.predicate(() => getLayers().some((l) => l && !l.isGroup && l.type === type)),

    activeLayerIsTunable: () =>
      When.predicate(() => {
        const layer = getActiveLayer();
        if (!layer || layer.isGroup) return false;
        if (layer.type === 'shape') return false;
        return Boolean(qs('#btn-randomize-params'));
      }),

    clickMatches: (selector) =>
      When.click((ev) => Boolean(ev?.target?.closest?.(selector))),

    mirrorModifierExists: () =>
      When.predicate(() =>
        getLayers().some((l) => l && (l.modifierType === 'mirror' || l.type === 'mirror'))
      ),
  };

  // ─── Visuals: pulsing rectangle highlights ────────────────────────
  class Highlight {
    constructor() { this._els = []; this._targets = []; }

    show(targets) {
      this.hide();
      this._targets = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
      this._render();
    }

    reflow() { this._render(); }

    _render() {
      this._clearDom();
      this._targets.forEach((sel) => {
        const target = typeof sel === 'string' ? qs(sel) : sel;
        if (!isVisible(target)) return;
        const el = document.createElement('div');
        el.className = 'tutorial-highlight is-visible is-pulse';
        const r = target.getBoundingClientRect();
        const pad = 4;
        el.style.left   = Math.round(r.left - pad) + 'px';
        el.style.top    = Math.round(r.top - pad) + 'px';
        el.style.width  = Math.round(r.width + pad * 2) + 'px';
        el.style.height = Math.round(r.height + pad * 2) + 'px';
        document.body.appendChild(el);
        this._els.push(el);
      });
    }

    _clearDom() {
      this._els.forEach((el) => el.remove());
      this._els = [];
    }

    hide() { this._targets = []; this._clearDom(); }
    destroy() { this.hide(); }
  }

  // ─── Visuals: dashed circles fading around multiple targets ──────
  class Circles {
    constructor() { this._els = []; this._selector = null; }

    show(selector) {
      this._selector = selector;
      this.reflow();
    }

    reflow() {
      this._clearDom();
      if (!this._selector) return;
      qsa(this._selector).forEach((target) => {
        if (!isVisible(target)) return;
        const r = target.getBoundingClientRect();
        const size = Math.max(r.width, r.height) + 14;
        const el = document.createElement('div');
        el.className = 'tutorial-circle';
        el.style.left   = Math.round(r.left + r.width / 2 - size / 2) + 'px';
        el.style.top    = Math.round(r.top  + r.height / 2 - size / 2) + 'px';
        el.style.width  = size + 'px';
        el.style.height = size + 'px';
        document.body.appendChild(el);
        this._els.push(el);
      });
    }

    _clearDom() {
      this._els.forEach((el) => el.remove());
      this._els = [];
    }

    hide() { this._selector = null; this._clearDom(); }
    destroy() { this.hide(); }
  }

  // ─── Visuals: the popover itself (positioning + drag) ────────────
  class Popover {
    constructor({ onNext, onClose, onBack }) {
      this._el = null;
      this._onNext = onNext;
      this._onClose = onClose;
      this._onBack = onBack;
      this._userMoved = false;
      this._drag = null;
      this._movable = false;
    }

    init() {
      if (this._el) return true;
      this._el = qs('#tutorial-popover');
      if (!this._el) return false;
      // Stop popover clicks from bubbling so document-level outside-click
      // handlers (which close the top menubar, pen menus, etc.) don't undo
      // whatever onEnter just opened on the current step.
      this._el.addEventListener('click', (ev) => ev.stopPropagation());
      const stop = (fn) => (ev) => { ev?.stopPropagation?.(); fn?.(); };
      qs('.tutorial-close', this._el).onclick = stop(() => this._onClose?.());
      qs('.tutorial-btn--back', this._el).onclick = stop(() => this._onBack?.());
      qs('.tutorial-btn--next', this._el).onclick = stop(() => this._onNext?.());
      this._installDrag();
      return true;
    }

    _installDrag() {
      // Drag from the title or meta bar (avoid buttons & body links).
      const onPointerDown = (ev) => {
        if (!this._movable) return;
        if (ev.target.closest('button, a, input, select, textarea, .tutorial-body')) return;
        const r = this._el.getBoundingClientRect();
        this._drag = { dx: ev.clientX - r.left, dy: ev.clientY - r.top, id: ev.pointerId };
        this._el.setPointerCapture?.(ev.pointerId);
        this._el.classList.add('is-dragging');
        ev.preventDefault();
      };
      const onPointerMove = (ev) => {
        if (!this._drag || ev.pointerId !== this._drag.id) return;
        const pw = this._el.offsetWidth, ph = this._el.offsetHeight;
        const x = Math.max(8, Math.min(window.innerWidth  - pw - 8, ev.clientX - this._drag.dx));
        const y = Math.max(8, Math.min(window.innerHeight - ph - 8, ev.clientY - this._drag.dy));
        this._el.style.left = Math.round(x) + 'px';
        this._el.style.top  = Math.round(y) + 'px';
        this._userMoved = true;
      };
      const onPointerUp = (ev) => {
        if (!this._drag || ev.pointerId !== this._drag.id) return;
        this._el.releasePointerCapture?.(ev.pointerId);
        this._el.classList.remove('is-dragging');
        this._drag = null;
      };
      this._el.addEventListener('pointerdown', onPointerDown);
      this._el.addEventListener('pointermove', onPointerMove);
      this._el.addEventListener('pointerup', onPointerUp);
      this._el.addEventListener('pointercancel', onPointerUp);
    }

    setMovable(flag) {
      this._movable = !!flag;
      if (!this._el) return;
      this._el.classList.toggle('is-movable', this._movable);
    }

    resetUserMoved() { this._userMoved = false; }

    setContent({ stepLabel, title, body }) {
      if (!this._el) return;
      qs('.tutorial-step-num', this._el).textContent = stepLabel;
      qs('.tutorial-title',    this._el).textContent = title;
      qs('.tutorial-body',     this._el).innerHTML   = body;
    }

    setDots(total, activeIndex) {
      if (!this._el) return;
      qs('.tutorial-dots', this._el).innerHTML = Array.from({ length: total }, (_, i) =>
        `<span class="tutorial-dot${i === activeIndex ? ' active' : ''}"></span>`
      ).join('');
    }

    setPlacement(placement) {
      if (!this._el) return;
      this._el.setAttribute('data-placement', placement);
    }

    setVisible(flag) {
      if (!this._el) return;
      this._el.setAttribute('aria-hidden', flag ? 'false' : 'true');
    }

    setForwardVisible(flag) {
      const btn = qs('.tutorial-btn--next', this._el);
      if (!btn) return;
      btn.style.display = flag ? '' : 'none';
    }

    setBackVisible(flag) {
      const btn = qs('.tutorial-btn--back', this._el);
      if (!btn) return;
      btn.style.display = flag ? '' : 'none';
    }

    setWaitMessage(text) {
      if (!this._el) return;
      let wait = qs('.tutorial-wait', this._el);
      if (!text) {
        if (wait) wait.remove();
        return;
      }
      if (!wait) {
        wait = document.createElement('div');
        wait.className = 'tutorial-wait';
        const body = qs('.tutorial-body', this._el);
        body?.insertAdjacentElement('afterend', wait);
      }
      wait.textContent = text;
    }

    positionAt(targetSel, placement, offsetX = 0, offsetY = 0) {
      if (!this._el) return;
      if (this._userMoved) return;
      const isMobile = window.innerWidth < 900;

      if (placement === 'center' || isMobile) {
        const pw = this._el.offsetWidth  || 270;
        const ph = this._el.offsetHeight || 200;
        this._el.style.left = Math.round(Math.max(8, (window.innerWidth  - pw) / 2)) + 'px';
        this._el.style.top  = Math.round(Math.max(8, (window.innerHeight - ph) / 2)) + 'px';
        return;
      }

      const target = targetSel ? qs(targetSel) : null;
      if (!isVisible(target)) {
        this.positionAt(null, 'center');
        return;
      }

      const r   = target.getBoundingClientRect();
      const pw  = this._el.offsetWidth  || 270;
      const ph  = this._el.offsetHeight || 200;
      const GAP = 14;
      const vw  = window.innerWidth;
      const vh  = window.innerHeight;

      let left = 0, top = 0;
      if (placement === 'right')       { left = r.right + GAP;                top = r.top + r.height / 2 - ph / 2; }
      if (placement === 'left')        { left = r.left  - pw - GAP;           top = r.top + r.height / 2 - ph / 2; }
      if (placement === 'left-bottom') { left = r.left  - pw - GAP;           top = r.bottom - ph; }
      if (placement === 'bottom')      { left = r.left  + r.width / 2 - pw/2; top = r.bottom + GAP; }
      if (placement === 'top')         { left = r.left  + r.width / 2 - pw/2; top = r.top - ph - GAP; }
      if (placement === 'over')        { left = r.left  + r.width / 2 - pw/2; top = r.top  + r.height / 2 - ph / 2; }

      left += offsetX;
      top  += offsetY;

      left = Math.max(8, Math.min(vw - pw - 8, left));
      top  = Math.max(8, Math.min(vh - ph - 8, top));

      this._el.style.left = Math.round(left) + 'px';
      this._el.style.top  = Math.round(top)  + 'px';
    }
  }

  // ─── Step definitions ────────────────────────────────────────────
  // Schema (per step):
  //   title            string
  //   movable?         boolean — popover is draggable while step is active
  //   phases           Phase[]  (one or more progressive phases)
  //
  // Schema (per phase):
  //   target           CSS selector (popover anchor + default highlight)
  //   highlight?       string | string[] — override highlight target(s)
  //   placement        'left'|'right'|'top'|'bottom'|'center'|'over'
  //   offsetX?         number — px shift applied after placement
  //   offsetY?         number — px shift applied after placement
  //   body             HTML string
  //   circleAll?       CSS selector — dashed circles around matches
  //   gate?            { check(app), waitMessage } — wait before activating
  //   onEnter?         (ctx) => teardownFn|null — side effects (menus, etc.)
  //   completion?      { type:'predicate'|'event', check, ... } — auto-advance

  // ─── Side-quest canvas geometry helpers ──────────────────────────
  function _sqCirclePath(cx, cy, r, n = 120) {
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
  }
  function _sqPolygonPath(cx, cy, r, sides) {
    return Array.from({ length: sides + 1 }, (_, i) => {
      const a = (i / sides) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
  }
  function _sqLinePath(x1, y1, x2, y2) {
    return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }

  const STEPS = [
    {
      title: 'Pick the Rings Algorithm',
      phases: [
        {
          title: 'Press & Hold the Algorithm Tool',
          target: '.tool-btn[data-tool="algo-draw"]',
          placement: 'right',
          body: 'Buttons with a tiny <b>▸</b> corner mark hide a family of related tools. <b>Press and hold</b> the algorithm button.',
          circleAll: '.tool-btn[data-has-submenu]',
          hideNext: true,
          completion: When.elementVisible('#algo-draw-picker'),
        },
        {
          title: 'Slide to Rings',
          target: '#algo-draw-picker .algo-pick-item[data-algo-type="rings"]',
          highlight: '#algo-draw-picker .algo-pick-item[data-algo-type="rings"]',
          placement: 'right',
          body: 'Slide to <b>Rings</b> and release.',
          hideNext: true,
          // Advance once the picker closes with rings as the active draft.
          completion: When.predicate(() => {
            const picker = qs('#algo-draw-picker');
            const closed = !picker || picker.classList.contains('hidden');
            return closed && getApp()?.renderer?.algoDraftType === 'rings';
          }),
          // If the picker closes without rings being chosen, send the user back
          // to the press-and-hold instruction so they can try again.
          regress: {
            toPhase: 0,
            check: () => {
              const picker = qs('#algo-draw-picker');
              const closed = !picker || picker.classList.contains('hidden');
              return closed && getApp()?.renderer?.algoDraftType !== 'rings';
            },
          },
        },
        {
          title: 'Draw Rings on the Canvas',
          target: '#viewport-container',
          highlight: [],
          placement: 'top',
          body: 'Now <b>double-click</b> the canvas to fill it, or <b>drag</b> a region to draw rings there.',
          hideNext: true,
          completion: When.layerOfType('rings'),
        },
      ],
    },

    {
      title: 'Swap Algorithm in the Panel',
      phases: [
        {
          target: '#generator-module-trigger',
          highlight: '#generator-module-trigger',
          placement: 'right',
          body: 'Once a layer is selected, change its algorithm at any time from the <b>Algorithm</b> panel — open the dropdown to try a completely different generator while keeping your placement.',
          hideNext: true,
          onEnter: () => Actions.expandSection('left-section-algorithm-header', 'left-section-algorithm-body'),
          gate: {
            check: () => Boolean(getActiveLayer()) && !getActiveLayer().isGroup,
            waitMessage: 'Select an algorithm layer to continue…',
          },
          completion: When.predicate(() => {
            const layer = getActiveLayer();
            if (!layer || layer.isGroup) return false;
            if (layer.type === 'shape') return false;
            return layer.type !== 'rings';
          }),
        },
      ],
    },

    {
      title: 'Tune & Re-Seed',
      phases: [
        {
          target: '#btn-randomize-params',
          placement: 'right',
          body: 'Adjust any parameters you like to shape the output. When you\'re ready, press <b>Randomize Params</b> at the top of the Algorithm Configuration pane to experiment with variations and continue.',
          highlight: '#btn-randomize-params',
          hideNext: true,
          onEnter: () => Actions.expandSection('left-section-algorithm-configuration-header', 'left-section-algorithm-configuration-body'),
          gate: {
            check: () => When.activeLayerIsTunable().check(),
            waitMessage: 'Generate and select an algorithm layer to continue…',
          },
          completion: When.clickMatches('#btn-randomize-params'),
        },
      ],
    },

    {
      title: 'Build with Layers',
      phases: [
        {
          target: '#layer-list',
          placement: 'left',
          body:
            'Each generation is its own layer. <b>Drag to reorder</b>, group with the ' +
            inlineIcon('grpPlus') + ' <b>group</b> icon, or use the ' +
            inlineIcon('maskSrc') + ' <b>Mask</b> action on a parent — then nest other layers underneath it and they\'ll be clipped to the parent\'s shape.' +
            '<div class="tutorial-sq-panel">' +
            '<div class="tutorial-sq-label">Take a detour — click any to try it:</div>' +
            '<div class="tutorial-sq-cards">' +
            '<button class="tutorial-sq-card" data-sq="masking" type="button">' +
            '<span class="tutorial-sq-icon">◉</span>' +
            '<span class="tutorial-sq-name">Masking</span>' +
            '</button>' +
            '<button class="tutorial-sq-card" data-sq="grouping" type="button">' +
            '<span class="tutorial-sq-icon">⧉</span>' +
            '<span class="tutorial-sq-name">Group Layers</span>' +
            '</button>' +
            '<button class="tutorial-sq-card" data-sq="expand" type="button">' +
            '<span class="tutorial-sq-icon">⤢</span>' +
            '<span class="tutorial-sq-name">Expand into Group</span>' +
            '</button>' +
            '</div>' +
            '</div>',
          onEnter: (ctx) => {
            const popoverEl = qs('#tutorial-popover');
            const refresh = () => {
              qsa('[data-sq]', popoverEl).forEach((btn) => {
                btn.classList.toggle('is-done', ctx.tour._completedQuests.has(btn.dataset.sq));
              });
            };
            refresh();
            const handler = (ev) => {
              const card = ev.target.closest('[data-sq]');
              if (card) ctx.tour.enterSideQuest(card.dataset.sq);
            };
            const panel = qs('.tutorial-sq-panel', popoverEl);
            panel?.addEventListener('click', handler);

            // Nudge if the user empties the canvas while on this step
            let wasEmpty = false;
            const emptyWatch = setInterval(() => {
              const empty = getLayers().filter((l) => l && !l.isGroup).length === 0;
              if (empty === wasEmpty) return;
              wasEmpty = empty;
              ctx.tour.popover.setWaitMessage(
                empty
                  ? 'Your canvas is empty — add an algorithm layer to continue experimenting.'
                  : ''
              );
            }, 400);

            return () => {
              panel?.removeEventListener('click', handler);
              clearInterval(emptyWatch);
            };
          },
        },
      ],
    },

    {
      title: 'Add a Mirror Modifier',
      phases: [
        {
          title: 'Open + Add Layer',
          target: '#btn-add-layer',
          highlight: '#btn-add-layer',
          placement: 'left',
          body: 'Open <b>+ Add Layer</b> at the top of the layer list.',
          hideNext: true,
          completion: When.elementVisible('#layer-add-menu'),
        },
        {
          title: 'Insert a Mirror Modifier',
          target: '#layer-add-menu .lvl-add-item[data-add="mirror"]',
          highlight: '#layer-add-menu .lvl-add-item[data-add="mirror"]',
          placement: 'left',
          body: 'Choose <b>Mirror Modifier Group</b> — it wraps your current selection so its children are reflected automatically.',
          hideNext: true,
          onEnter: () => Actions.openLayerAddMenu(),
          completion: When.clickMatches('.lvl-add-item[data-add="mirror"]'),
        },
      ],
    },

    {
      title: 'Play with the Mirror',
      movable: true,
      phases: [
        {
          target: '#left-pane',
          highlight: [],
          placement: 'over',
          offsetY: -260,
          body:
            'A mirror axis now lives on the canvas. <b>Drag the line</b> to slide the axis, or grab the <b>rotation handle</b> at its end to spin it to any angle. ' +
            'In the Modifier Configuration pane you can stack more axes (Line, Radial, Arc, Wallpaper).',
          // Manual advance (no completion) — user clicks Next when ready.
        },
      ],
    },

    {
      title: 'Export for Your Plotter',
      phases: [
        {
          target: '#top-menubar [data-top-menu]:first-child [data-top-menu-panel]',
          highlight: ['#btn-save-vectura', '#btn-export'],
          placement: 'right',
          body: 'Open <b>File ▸ Export SVG</b> to preview pen order, run line optimization, and download a plotter-ready file. Use <b>Save Project</b> to pick up where you left off.',
          hideSkip: true,
          onEnter: () => Actions.pinTopMenuFile(),
        },
      ],
    },

    {
      title: "You're All Set",
      phases: [
        {
          target: null,
          highlight: [],
          placement: 'center',
          hideBack: true,
          body:
            '<p>That\'s the whirlwind tour. From here you can keep tinkering with what you\'ve built, or wipe the canvas and start clean.</p>' +
            '<div class="tutorial-cta-row">' +
            '<button type="button" class="tutorial-cta-btn tutorial-cta-secondary" data-tour-clear>Clear canvas</button>' +
            '<button type="button" class="tutorial-cta-btn tutorial-cta-primary" data-tour-keep>Keep designing →</button>' +
            '</div>',
          hideSkip: true,
          hideNext: true,
          onEnter: (ctx) => {
            const popoverEl = qs('#tutorial-popover');
            const keepBtn   = qs('[data-tour-keep]',  popoverEl);
            const clearBtn  = qs('[data-tour-clear]', popoverEl);

            const onKeep = (ev) => {
              ev.stopPropagation();
              ctx.tour.dismiss();
            };

            const onClear = (ev) => {
              ev.stopPropagation();
              const ui  = ctx.ui;
              const app = ctx.app;
              // Popover sits above the modal backdrop, so hide it while the
              // confirmation is open; restore on cancel.
              ctx.tour.popover.setVisible(false);
              const dlg = window.Vectura.UI.overlays.Dialog(document.body, {
                title: 'Clear canvas?',
                message: 'This will remove every layer from the canvas. Your current document settings stay put.',
                confirmLabel: 'Clear canvas',
                cancelLabel: 'Cancel',
                destructive: true,
                onCancel: () => { ctx.tour.popover.setVisible(true); dlg.destroy(); },
                onConfirm: () => {
                  dlg.destroy();
                  if (typeof app.pushHistory === 'function') app.pushHistory();
                  app.engine.layers = [];
                  app.engine.activeLayerId = null;
                  if (typeof app.setSelection === 'function') app.setSelection([], null);
                  if (typeof ui.renderLayers === 'function') ui.renderLayers();
                  if (typeof ui.buildControls === 'function') ui.buildControls();
                  if (typeof app.render === 'function') app.render();
                  ctx.tour.dismiss();
                },
              });
              dlg.open();
            };

            keepBtn.addEventListener('click', onKeep);
            clearBtn.addEventListener('click', onClear);
            return () => {
              keepBtn.removeEventListener('click', onKeep);
              clearBtn.removeEventListener('click', onClear);
            };
          },
        },
      ],
    },

    // ── Side Quest: Masking ───────────────────────────────────────────
    {
      title: 'Masking',
      sideQuest: true,
      sideQuestId: 'masking',
      phases: [
        {
          title: 'Apply a Clipping Mask',
          target: '#layer-list',
          highlight: '#layer-list',
          placement: 'left',
          body:
            'Two layers are ready: a <b>Wavetable</b> and a <b>Circle</b> shape.' +
            '<br><br>' +
            'In the layers panel, <b>drag the Circle on top of the Wavetable</b> layer while <b>holding Shift</b>. ' +
            'Watch for the <b>"Make clipping mask"</b> hint to appear, then <b>release</b> to apply. ' +
            'The circle becomes an invisible mask that clips the Wavetable to its shape.',
          hideNext: true,
          hideSkip: true,
          showBack: true,
          completion: When.predicate(() => getLayers().some((l) => l && l.mask?.enabled)),
        },
        {
          title: 'Masking Complete!',
          target: '#right-pane',
          highlight: [],
          placement: 'left-bottom',
          hideBack: true,
          body:
            '<p>The Wavetable is now clipped to the circle\'s outline. Only art inside the circle shows through.</p>' +
            '<p>You can use any closed shape as a mask, and nest multiple layers under a masked parent.</p>' +
            '<div class="tutorial-cta-row">' +
            '<button type="button" class="tutorial-cta-btn tutorial-cta-primary" data-sq-continue>Finish</button>' +
            '</div>',
          hideSkip: true,
          hideNext: true,
          onEnter: (ctx) => {
            const popoverEl = qs('#tutorial-popover');
            const contBtn  = qs('[data-sq-continue]', popoverEl);
            const onCont  = (ev) => { ev.stopPropagation(); ctx.tour.exitSideQuest('masking'); };
            contBtn?.addEventListener('click', onCont);
            return () => contBtn?.removeEventListener('click', onCont);
          },
        },
      ],
    },

    // ── Side Quest: Group Layers ─────────────────────────────────────
    {
      title: 'Group Layers',
      sideQuest: true,
      sideQuestId: 'grouping',
      phases: [
        {
          title: 'Select Both Layers',
          target: '#layer-list',
          highlight: '#layer-list',
          placement: 'left',
          body:
            'Two layers are ready: a <b>Hexagon</b> and a <b>Line</b>.' +
            '<br><br>' +
            '<b>Click</b> the Hexagon layer to select it, then <b>Shift+click</b> the Line layer. ' +
            'You should see <b>2 layers selected</b> in the panel footer.',
          hideNext: true,
          completion: When.predicate(() => (getApp()?.renderer?.selectedLayerIds?.size ?? 0) >= 2),
        },
        {
          title: 'Group Them',
          target: '#layer-list',
          highlight: '.lvl-cb[title="Group selected (⌘G)"]',
          placement: 'left',
          body:
            'Click the ' + inlineIcon('grpPlus') + ' <b>Group</b> icon that appeared in the layer toolbar, ' +
            'or press <b>Cmd+G</b> (Mac) / <b>Ctrl+G</b> (Windows). ' +
            'The two layers fold into a new group folder.',
          hideNext: true,
          completion: When.predicate(() => getLayers().some((l) => l && l.isGroup && l.groupType === 'group')),
        },
        {
          title: 'Drag the Group',
          target: '#viewport-container',
          highlight: [],
          placement: 'top',
          body:
            'Select the group folder in the layers panel or click any of its shapes on the canvas, ' +
            'then <b>drag</b> to move it. Both layers travel together as one unit.',
          hideNext: true,
          onEnter: () => {
            getApp()?.render?.();
            return null;
          },
          completion: When.predicate(() => {
            const g = getLayers().find((l) => l && l.isGroup && l.groupType === 'group');
            if (!g) return false;
            // Layer drag commits to params.posX/posY (renderer line 3799).
            // Check both the group itself and its children to cover all drag paths.
            if (Math.abs(g.params?.posX ?? 0) > 3 || Math.abs(g.params?.posY ?? 0) > 3) return true;
            return getLayers().some((l) => l.parentId === g.id && (
              Math.abs(l.params?.posX ?? 0) > 3 || Math.abs(l.params?.posY ?? 0) > 3
            ));
          }),
        },
        {
          title: 'Grouped!',
          target: '#right-pane',
          highlight: [],
          placement: 'left-bottom',
          hideBack: true,
          body:
            '<p>Your layers move together as a group. Click the group folder to expand or collapse it, and drag layers in or out to reorganize.</p>' +
            '<p>Groups can also be masked, duplicated, and nested inside other groups.</p>' +
            '<div class="tutorial-cta-row">' +
            '<button type="button" class="tutorial-cta-btn tutorial-cta-primary" data-sq-continue>Finish</button>' +
            '</div>',
          hideSkip: true,
          hideNext: true,
          onEnter: (ctx) => {
            const popoverEl = qs('#tutorial-popover');
            const contBtn  = qs('[data-sq-continue]', popoverEl);
            const onCont  = (ev) => { ev.stopPropagation(); ctx.tour.exitSideQuest('grouping'); };
            contBtn?.addEventListener('click', onCont);
            return () => contBtn?.removeEventListener('click', onCont);
          },
        },
      ],
    },

    // ── Side Quest: Expand into Group ────────────────────────────────
    {
      title: 'Expand into Group',
      sideQuest: true,
      sideQuestId: 'expand',
      phases: [
        {
          title: 'Expand the Algorithm Layer',
          target: '.lvl-acts .lvl-ab[title="Expand into group"]',
          highlight: '.lvl-acts .lvl-ab[title="Expand into group"]',
          placement: 'left',
          body:
            'Click the ' + inlineIcon('expand') + ' <b>Expand into group</b> icon on the algorithm layer. ' +
            'Each path in the algorithm becomes its own editable shape layer inside a new group folder.',
          hideNext: true,
          completion: When.clickMatches('.lvl-ab[title="Expand into group"]'),
        },
        {
          title: 'Expanded!',
          target: '#right-pane',
          highlight: [],
          placement: 'left-bottom',
          hideBack: true,
          body:
            '<p>Each individual path is now its own layer. You can delete, reorder, recolor, or animate them independently.</p>' +
            '<p>Tip: expanding complex algorithms can produce hundreds of layers — use this on small, targeted generations.</p>' +
            '<div class="tutorial-cta-row">' +
            '<button type="button" class="tutorial-cta-btn tutorial-cta-primary" data-sq-continue>Finish</button>' +
            '</div>',
          hideSkip: true,
          hideNext: true,
          onEnter: (ctx) => {
            const popoverEl = qs('#tutorial-popover');
            const contBtn  = qs('[data-sq-continue]', popoverEl);
            const onCont  = (ev) => { ev.stopPropagation(); ctx.tour.exitSideQuest('expand'); };
            contBtn?.addEventListener('click', onCont);
            return () => contBtn?.removeEventListener('click', onCont);
          },
        },
      ],
    },
  ];

  // ─── TutorialManager ─────────────────────────────────────────────
  class TutorialManager {
    constructor() {
      this._stepIndex = 0;
      this._phaseIndex = 0;
      this._onDismiss = null;
      this._cleanup = null;
      this._gateInterval = null;
      this._predicateInterval = null;
      this._regressInterval = null;
      this._eventListeners = [];
      this._reflowRaf = null;
      this._onResize = () => this._scheduleReflow();
      this._returnTo = null;
      this._completedQuests = new Set();
      this._questSnapshot = null;
      this.popover = new Popover({
        onClose: () => this.dismiss(),
        onNext:  () => this._advance(),
        onBack:  () => this._retreat(),
      });
      this.highlight = new Highlight();
      this.circles = new Circles();
    }

    start(onDismiss) {
      if (!this.popover.init()) return;
      if (onDismiss) this._onDismiss = onDismiss;
      this._stepIndex = 0;
      this._phaseIndex = 0;
      window.addEventListener('resize', this._onResize);
      window.addEventListener('scroll', this._onResize, true);
      this.popover.setVisible(true);
      this.goTo(0, 0);
    }

    goTo(stepIndex, phaseIndex = 0) {
      this._teardownPhase();
      const step = STEPS[stepIndex];
      if (!step) return;
      const phase = step.phases?.[phaseIndex];
      if (!phase) return;

      this._stepIndex = stepIndex;
      this._phaseIndex = phaseIndex;

      // Reset user-moved popover position when entering a brand new STEP, but
      // preserve user position across phases inside the same step.
      if (phaseIndex === 0) this.popover.resetUserMoved();
      this.popover.setMovable(!!step.movable);

      const placement = window.innerWidth < 900 ? 'center' : (phase.placement || 'right');

      if (step.sideQuest) {
        // Side quest: show "Detour: Title (phase/total)" instead of main step counter
        const totalPhases = step.phases?.length || 1;
        this.popover.setContent({
          stepLabel: `Detour: ${step.title} (${phaseIndex + 1} of ${totalPhases})`,
          title:     phase.title || step.title,
          body:      phase.body,
        });
        this.popover.setDots(0, 0);
      } else {
        // Main flow: exclude side quest steps from the slide count
        const mainSteps = STEPS.filter((s) => !s.sideQuest);
        const mainStepIndex = mainSteps.indexOf(step);
        const totalSlides = mainSteps.reduce((acc, s) => acc + (s.phases?.length || 1), 0);
        const slideIndex = mainSteps.slice(0, mainStepIndex)
          .reduce((acc, s) => acc + (s.phases?.length || 1), 0) + phaseIndex;
        this.popover.setContent({
          stepLabel: `Step ${slideIndex + 1} of ${totalSlides}`,
          title:     phase.title || step.title,
          body:      phase.body,
        });
        this.popover.setDots(totalSlides, slideIndex);
      }

      this.popover.setPlacement(placement);

      // Gate: hold position + show wait message + hide forward arrow until prerequisite passes.
      if (phase.gate && !phase.gate.check?.()) {
        this.popover.setForwardVisible(false);
        this.popover.setWaitMessage(phase.gate.waitMessage || 'Complete the previous step to continue…');
        // Set back visibility during gate wait so the user can retreat
        if (!step.sideQuest) {
          const mainStepsForGate = STEPS.filter((s) => !s.sideQuest);
          const mainIdxForGate = mainStepsForGate.indexOf(step);
          const slideIdxForGate = mainStepsForGate.slice(0, mainIdxForGate)
            .reduce((acc, s) => acc + (s.phases?.length || 1), 0) + phaseIndex;
          this.popover.setBackVisible(!phase.hideBack && slideIdxForGate > 0);
        }
        this.popover.positionAt(phase.target, placement, phase.offsetX || 0, phase.offsetY || 0);
        this._gateInterval = setInterval(() => {
          if (phase.gate.check?.()) {
            clearInterval(this._gateInterval);
            this._gateInterval = null;
            this.popover.setWaitMessage('');
            this._activatePhase(step, phase, placement);
          }
        }, 250);
        return;
      }

      this._activatePhase(step, phase, placement);
    }

    _activatePhase(step, phase, placement) {
      const mainSteps = STEPS.filter((s) => !s.sideQuest);

      // Back button: visible when not at the very first main slide and phase allows it
      // phase.showBack explicitly enables back even inside a side quest
      const mainStepIndex = step.sideQuest ? -1 : mainSteps.indexOf(step);
      const slideIndex = step.sideQuest
        ? -1
        : mainSteps.slice(0, mainStepIndex).reduce((acc, s) => acc + (s.phases?.length || 1), 0) + this._phaseIndex;
      const showBack = (!phase.hideBack && !step.sideQuest && slideIndex > 0) || !!phase.showBack;

      // Forward arrow: visible unless both hideNext and hideSkip are set
      const showForward = !(phase.hideNext && phase.hideSkip);

      this.popover.setWaitMessage('');
      this.popover.setForwardVisible(showForward);
      this.popover.setBackVisible(showBack);

      if (typeof phase.onEnter === 'function') {
        const teardown = phase.onEnter({ ui: getUI(), app: getApp(), tour: this });
        if (typeof teardown === 'function') this._cleanup = teardown;
      }

      this.popover.positionAt(phase.target, placement, phase.offsetX || 0, phase.offsetY || 0);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.popover.positionAt(phase.target, placement, phase.offsetX || 0, phase.offsetY || 0);
          this._renderEffects(phase);
        });
      });

      this._installCompletion(phase);
      this._installRegress(phase);
    }

    _installRegress(phase) {
      const r = phase.regress;
      if (!r || typeof r.check !== 'function') return;
      const target = Number.isInteger(r.toPhase) ? r.toPhase : 0;
      this._regressInterval = setInterval(() => {
        try {
          if (r.check()) {
            clearInterval(this._regressInterval);
            this._regressInterval = null;
            this.goTo(this._stepIndex, target);
          }
        } catch (_) {}
      }, 150);
    }

    _renderEffects(phase) {
      const hl = phase.highlight ?? phase.target;
      this.highlight.show(hl);
      if (phase.circleAll) this.circles.show(phase.circleAll);
      else this.circles.hide();
    }

    _installCompletion(phase) {
      const c = phase.completion;
      if (!c) return;
      if (c.type === 'event') {
        const target = c.listenOn || document;
        const events = c.events || ['click'];
        const handler = (ev) => {
          try {
            if (typeof c.check === 'function' ? c.check(ev) : true) this._advance();
          } catch (_) {}
        };
        events.forEach((evt) => {
          target.addEventListener(evt, handler, true);
          this._eventListeners.push({ target, evt, handler, capture: true });
        });
      } else if (c.type === 'predicate') {
        const tick = () => {
          try {
            if (c.check?.()) {
              clearInterval(this._predicateInterval);
              this._predicateInterval = null;
              this._advance();
            }
          } catch (_) {}
        };
        this._predicateInterval = setInterval(tick, 150);
      }
    }

    _scheduleReflow() {
      if (this._reflowRaf) cancelAnimationFrame(this._reflowRaf);
      this._reflowRaf = requestAnimationFrame(() => {
        this._reflowRaf = null;
        const step  = STEPS[this._stepIndex];
        const phase = step?.phases?.[this._phaseIndex];
        if (!phase) return;
        const placement = window.innerWidth < 900 ? 'center' : (phase.placement || 'right');
        this.popover.positionAt(phase.target, placement, phase.offsetX || 0, phase.offsetY || 0);
        this.highlight.reflow();
        this.circles.reflow();
      });
    }

    _teardownPhase() {
      if (this._cleanup) { try { this._cleanup(); } catch (_) {} this._cleanup = null; }
      if (this._gateInterval)      { clearInterval(this._gateInterval);      this._gateInterval = null; }
      if (this._predicateInterval) { clearInterval(this._predicateInterval); this._predicateInterval = null; }
      if (this._regressInterval)   { clearInterval(this._regressInterval);   this._regressInterval = null; }
      this.popover.setWaitMessage('');
      this._eventListeners.forEach(({ target, evt, handler, capture }) => {
        target.removeEventListener(evt, handler, capture);
      });
      this._eventListeners = [];
      this.highlight.hide();
      this.circles.hide();
    }

    _advance() {
      const step = STEPS[this._stepIndex];
      const lastPhase = (step?.phases?.length || 1) - 1;

      // Within a step, always advance to the next phase
      if (this._phaseIndex < lastPhase) {
        this.goTo(this._stepIndex, this._phaseIndex + 1);
        return;
      }

      // Last phase of a side quest — exit back to main flow
      if (step.sideQuest) {
        this.exitSideQuest(step.sideQuestId);
        return;
      }

      // Last phase of the last main step — dismiss
      const mainSteps = STEPS.filter((s) => !s.sideQuest);
      const lastMainStep = mainSteps[mainSteps.length - 1];
      const lastMainStepIdx = STEPS.indexOf(lastMainStep);
      if (this._stepIndex >= lastMainStepIdx) {
        this.dismiss();
        return;
      }

      // Advance to the next main step, skipping any side quest steps
      let nextIdx = this._stepIndex + 1;
      while (nextIdx < STEPS.length && STEPS[nextIdx].sideQuest) nextIdx++;
      if (nextIdx < STEPS.length) {
        this.goTo(nextIdx, 0);
      } else {
        this.dismiss();
      }
    }

    _retreat() {
      const step = STEPS[this._stepIndex];
      // Backing out of the first phase of a side quest cancels it without completing
      if (this._phaseIndex === 0 && step?.sideQuest && step.phases?.[0]?.showBack) {
        this.exitSideQuest(null);
        return;
      }
      if (this._phaseIndex > 0) {
        this.goTo(this._stepIndex, this._phaseIndex - 1);
        return;
      }
      if (this._stepIndex > 0) {
        // Walk backward, skipping side quest steps
        let si = this._stepIndex - 1;
        while (si > 0 && STEPS[si].sideQuest) si--;
        const lastPhase = (STEPS[si].phases?.length || 1) - 1;
        this.goTo(si, lastPhase);
      }
    }

    _seedSideQuestCanvas(questId) {
      const engine = getEngine();
      const app = getApp();
      if (!engine) return;

      engine.layers = [];
      engine.activeLayerId = null;

      const { width = 250, height = 210 } = engine.currentProfile || {};
      const cx = width / 2;
      const cy = height / 2;

      if (questId === 'masking') {
        engine.addLayer('wavetable');
        const r = Math.min(width, height) * 0.35;
        const circleId = engine.addShapeLayer('Circle', [_sqCirclePath(cx, cy, r)]);
        engine.activeLayerId = engine.layers.find((l) => l.type !== 'shape')?.id;
        // Pre-select the circle: dragstart canArm requires isSingleSel, but layer reset leaves selectedLayerIds stale.
        if (circleId && app?.renderer) app.renderer.setSelection([circleId], circleId);
      } else if (questId === 'grouping') {
        const r = Math.min(width, height) * 0.28;
        engine.addShapeLayer('Hexagon', [_sqPolygonPath(cx, cy, r, 6)]);
        engine.addShapeLayer('Line', [_sqLinePath(cx - r * 1.3, cy + r * 0.9, cx + r * 1.3, cy - r * 0.9)]);
        engine.activeLayerId = engine.layers[0]?.id;
      } else if (questId === 'expand') {
        engine.addLayer('wavetable');
      }

      // Fit viewport to freshly-seeded canvas so the user sees the whole document.
      // Set userHasManipulated=true after center() so ResizeObserver won't re-center on
      // subsequent panel layout shifts (e.g. left pane resizing when a layer is selected).
      if (app?.renderer?.center) app.renderer.center();
      if (app?.renderer) app.renderer.userHasManipulated = true;
      app?.render?.();
      getUI()?.renderLayers?.();
    }

    enterSideQuest(questId) {
      const idx = STEPS.findIndex((s) => s.sideQuest && s.sideQuestId === questId);
      if (idx < 0) return;
      this._returnTo = { stepIndex: this._stepIndex, phaseIndex: this._phaseIndex };
      this._questSnapshot = getApp()?.captureState?.();
      this._seedSideQuestCanvas(questId);
      this.goTo(idx, 0);
    }

    exitSideQuest(questId) {
      if (questId) this._completedQuests.add(questId);
      const snapshot = this._questSnapshot;
      this._questSnapshot = null;
      const rt = this._returnTo;
      this._returnTo = null;
      if (snapshot) {
        const app = getApp();
        app?.applyState?.(snapshot);
        app?.render?.();
        getUI()?.renderLayers?.();
      }
      if (rt) {
        this.goTo(rt.stepIndex, rt.phaseIndex);
      } else {
        let nextIdx = this._stepIndex + 1;
        while (nextIdx < STEPS.length && STEPS[nextIdx].sideQuest) nextIdx++;
        if (nextIdx < STEPS.length) this.goTo(nextIdx, 0);
        else this.dismiss();
      }
    }

    dismiss() {
      this._teardownPhase();
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('scroll', this._onResize, true);
      this.highlight.destroy();
      this.circles.destroy();
      this.popover.setVisible(false);
      if (this._onDismiss) {
        const cb = this._onDismiss;
        this._onDismiss = null;
        cb();
      }
    }
  }

  ns.Tutorial = new TutorialManager();
})();
