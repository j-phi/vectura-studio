/**
 * Vectura layers panel (Phase 2 step 4 fifth panel extraction).
 *
 * Exposes window.Vectura.UI.LayersPanel — renderLayers() lifted verbatim
 * from the legacy `class UI` IIFE. Renders the layer list, drag-drop
 * reorder, selection, pen-assignment popups, mask toggles, and modifier
 * tree management.
 *
 * The legacy UI prototype's renderLayers() is now a thin delegator.
 * The function body still references many `this.*` methods (storeLayerParams,
 * renderPens, refreshArmedPenUI, app.engine, app.renderer, etc.) and the
 * IIFE-local SETTINGS / escapeHtml — those are injected via DI bag
 * once at startup from the legacy ui.js bind() call.
 *
 * DI bag: { SETTINGS, escapeHtml, Layer, clone, getEl }.
 *
 * Meridian Unit 1.9b (2026-05-20): added `bindLayerListListeners()` — a
 * grouped installer for the layer-list buttons (`btn-add-layer`,
 * `btn-insert-mirror-modifier`, `btn-group-layers`, `btn-ungroup-layers`,
 * `btn-undo`, `btn-redo`) and the layer-bar palette picker
 * (`layer-bar-palette-trigger`/menu/name/preview). These previously lived
 * inlined in `_ui-legacy.js`'s `bindGlobal()`.
 *
 * Compile gate at tests/unit/layers-panel-compile.test.js.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};
  const UI = Vectura.UI = Vectura.UI || {};

  let DEPS = null;

  const requireDeps = (name) => {
    if (!DEPS) {
      throw new Error(`LayersPanel.${name} invoked before LayersPanel.bind(deps) — load order broken`);
    }
    return DEPS;
  };

  function renderLayers() {
    const { SETTINGS, escapeHtml } = requireDeps('renderLayers');
      const list = document.getElementById('layer-list');
      if (!list) return;
      list.innerHTML = '';

      const engine = this.app.engine;
      const allLayers = engine.layers || [];
      const renderer = this.app.renderer;
      if (!engine) return;

      // ── Pen assignment (reused) ─────────────────────────────────
      const buildPenAssignment = () =>
        `<div class="pen-assign"><button class="pen-pill" type="button" aria-label="Assign pen" title="Assign pen"><div class="pen-icon"></div></button><div class="pen-menu hidden"></div></div>`;

      const wirePenAssignment = (el, owner, getTargets) => {
        const penMenu = el.querySelector('.pen-menu');
        const penPill = el.querySelector('.pen-pill');
        const penIcon = el.querySelector('.pen-icon');
        if (!penMenu || !penPill || !penIcon) return;
        const pens = SETTINGS.pens || [];
        const applyPen = (pen, options = {}) => {
          if (!pen) return;
          const { render = true, syncTargets = true } = options;
          if (syncTargets) {
            const targets = getTargets();
            targets.forEach((target) => {
              target.penId = pen.id;
              target.color = pen.color;
              target.strokeWidth = pen.width;
              target.lineCap = target.lineCap || owner.lineCap || 'round';
            });
          }
          penIcon.style.background = pen.color;
          penIcon.style.color = pen.color;
          penIcon.style.setProperty('--pen-width', pen.width);
          penIcon.title = pen.name;
          penMenu.querySelectorAll('.pen-option').forEach((opt) => {
            opt.classList.toggle('active', opt.dataset.penId === pen.id);
            opt.setAttribute('aria-pressed', opt.dataset.penId === pen.id ? 'true' : 'false');
          });
          if (render) { this.renderLayers(); this.app.render(); }
        };
        const current = pens.find((pen) => pen.id === owner.penId) || pens[0];
        if (current) applyPen(current, { render: false, syncTargets: false });
        penMenu.innerHTML = pens.map((pen) => `
          <button type="button" class="pen-option" data-pen-id="${pen.id}" aria-pressed="${pen.id === owner.penId ? 'true' : 'false'}">
            <span class="pen-icon" style="background:${pen.color}; color:${pen.color}; --pen-width:${pen.width}"></span>
            <span class="pen-option-name">${escapeHtml(pen.name)}</span>
          </button>`).join('');
        penMenu.querySelectorAll('.pen-option').forEach((opt) => {
          opt.onclick = (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            applyPen(pens.find((pen) => pen.id === opt.dataset.penId));
            penMenu.classList.add('hidden');
          };
        });
        penPill.onclick = (e) => {
          e.stopPropagation();
          if (this.openPenMenu && this.openPenMenu !== penMenu) this.openPenMenu.classList.add('hidden');
          penMenu.classList.toggle('hidden');
          this.openPenMenu = penMenu.classList.contains('hidden') ? null : penMenu;
        };
        el.ondragover = (ev) => {
          const types = Array.from(ev.dataTransfer?.types || []);
          if (!types.length || types.includes('text/pen-id') || types.includes('text/plain')) {
            ev.preventDefault(); el.classList.add('dragging');
          }
        };
        el.ondragleave = () => el.classList.remove('dragging');
        el.ondrop = (ev) => {
          ev.preventDefault(); el.classList.remove('dragging');
          const penId = ev.dataTransfer.getData('text/pen-id') || ev.dataTransfer.getData('text/plain');
          const next = pens.find((pen) => pen.id === penId);
          if (!next) return;
          if (this.app.pushHistory) this.app.pushHistory();
          applyPen(next); penMenu.classList.add('hidden');
        };
      };

      // ── V8 drag (HTML5) ─────────────────────────────────────────
      // canArm: the dragged layer is eligible to become a mask source.
      // maskDrop: Shift was held at dragover (used to arm mask-create on drop).
      // Shift is used instead of CMD/Ctrl because macOS Chrome interprets CMD+drag
      // as an OS-level alias gesture and silently cancels the drop event; Shift has
      // no OS-level drag interpretation. Modifier state is read live from each
      // DragEvent because keydown/keyup are suppressed during an HTML5 drag.
      const _lvlDRAG = { id: null, maskDrop: false, canArm: false, maskTargetId: null };
      const _lvlClrDrop = (el) =>
        el.classList.remove('lvl-drop-before', 'lvl-drop-after', 'lvl-drop-into', 'lvl-drop-mask', 'lvl-drop-exit');
      const _lvlClrAllDrop = () =>
        list.querySelectorAll('.lvl-drop-before,.lvl-drop-after,.lvl-drop-into,.lvl-drop-mask,.lvl-drop-exit')
          .forEach(_lvlClrDrop);

      const setHint = (msg) => {
        const bar = document.getElementById('layer-status-bar');
        if (!bar) return;
        bar.innerHTML = '';
        if (msg) {
          const h = document.createElement('span'); h.className = 'lvl-s-hint';
          h.textContent = '⟶ ' + msg; bar.appendChild(h);
        } else { _lvlBuildStatusBar(); }
      };

      const _lvlDoMove = (srcId, tgtId, pos) => {
        if (!srcId || !tgtId || srcId === tgtId) return;
        const src = engine.getLayerById?.(srcId);
        const tgt = engine.getLayerById?.(tgtId);
        if (!src || !tgt) return;
        if (pos === 'into') {
          if (!this.canLayerAcceptChildren?.(tgt)) return;
          if (this.isDescendant?.(srcId, tgtId)) return;
          this.assignLayersToParent(tgtId, [src], {
            captureHistory: true, selectAssigned: true, primaryId: srcId,
          });
          this.renderLayers(); this.app.render(); return;
        }
        const selectedSet = new Set([srcId]);
        const currentOrder = engine.layers.map((l) => l.id).reverse();
        const nextOrder = currentOrder.filter((id) => id !== srcId);
        const newTgtIdx = nextOrder.indexOf(tgtId);
        if (newTgtIdx === -1) return;
        let insertAt = pos === 'before' ? newTgtIdx + 1 : newTgtIdx;
        // When inserting 'before' a group/modifier, jump past all its descendants in
        // the reversed order. Without this, normalizeGroupOrder moves the group back
        // to just after its last child, which silently undoes the reorder.
        if (pos === 'before' && (tgt.isGroup || _lvlIsMaskSrc(tgtId))) {
          const descIds = [];
          const q = [tgtId];
          while (q.length) {
            const pid = q.shift();
            engine.layers.filter((l) => l.parentId === pid).forEach((l) => { descIds.push(l.id); q.push(l.id); });
          }
          if (descIds.length) {
            const maxDescIdx = Math.max(...descIds.map((id) => nextOrder.indexOf(id)).filter((i) => i >= 0));
            if (maxDescIdx >= insertAt) insertAt = maxDescIdx + 1;
          }
        }
        nextOrder.splice(insertAt, 0, srcId);
        const nextEngineOrder = nextOrder.slice().reverse();
        const map = new Map(engine.layers.map((l) => [l.id, l]));
        const prevId = nextOrder[insertAt - 1] || null;
        const nextId2 = nextOrder[insertAt + 1] || null;
        if (this.shouldLeaveParentScope?.(src, prevId, nextId2, selectedSet)) {
          // Unparent to the drop-target's own scope, not unconditionally to root.
          // This preserves intermediate levels (e.g. mask → group → child).
          const newParentId = tgt?.parentId ?? null;
          if (this.app.pushHistory) this.app.pushHistory();
          src.parentId = newParentId;
          engine.layers = nextEngineOrder.map((id) => map.get(id)).filter(Boolean);
          this.normalizeGroupOrder?.();
          this.app.computeDisplayGeometry?.();
          this.app.setSelection?.([srcId], srcId);
          this.app.engine.setActiveLayerId?.(srcId);
          this.renderLayers(); this.app.render(); return;
        }
        const hasChanged = nextEngineOrder.some((id, i) => id !== engine.layers[i]?.id);
        if (!hasChanged) return;
        if (this.app.pushHistory) this.app.pushHistory();
        engine.layers = nextEngineOrder.map((id) => map.get(id)).filter(Boolean);
        this.normalizeGroupOrder?.();
        this.renderLayers(); this.app.render();
      };

      const _lvlDoMaskCreate = (draggedId, targetId) => {
        if (!draggedId || !targetId || draggedId === targetId) return;
        const src = engine.getLayerById?.(draggedId);
        const tgt = engine.getLayerById?.(targetId);
        if (!src || !tgt) return;
        if (!src.maskCapabilities?.canSource) return;
        if (this.app.pushHistory) this.app.pushHistory();
        src.mask = src.mask || {};
        src.mask.enabled = true;
        this.assignLayersToParent(src.id, [tgt], { captureHistory: false });
        engine.computeAllDisplayGeometry?.();
        renderer?.setSelection?.([src.id], src.id);
        this.renderLayers(); this.app.render?.();
      };

      const _bindCardTouchDrag = (el, layer) => {
        let holdTimer = null;
        let isDragging = false;
        let startTouchId = null;
        let startY = 0;
        let lastTargetId = null;
        let lastPos = null;

        const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; };

        const finishDrag = (commit) => {
          cancelHold();
          el.draggable = true;
          if (isDragging) {
            if (commit && lastTargetId && lastPos) {
              if (lastPos?.startsWith('exit-')) {
                _lvlDoExitGroup(layer.id, lastTargetId, lastPos.slice(5));
              } else if (lastPos === 'mask') {
                const draggedLayer = engine.getLayerById?.(layer.id);
                if (draggedLayer) {
                  if (this.app.pushHistory) this.app.pushHistory();
                  this.assignLayersToParent(lastTargetId, [draggedLayer], { captureHistory: false });
                  this.renderLayers(); this.app.render?.();
                }
              } else {
                const tgtLayer = engine.getLayerById?.(lastTargetId);
                const maskSrcId = tgtLayer?.parentId && _lvlIsMaskSrc(tgtLayer.parentId)
                  ? tgtLayer.parentId : null;
                const draggedLayer = maskSrcId ? engine.getLayerById?.(layer.id) : null;
                if (maskSrcId && draggedLayer && draggedLayer.parentId !== maskSrcId) {
                  if (this.app.pushHistory) this.app.pushHistory();
                  this.assignLayersToParent(maskSrcId, [draggedLayer], { captureHistory: false });
                  this.renderLayers(); this.app.render?.();
                } else {
                  const touchSrc = engine.getLayerById?.(layer.id);
                  const touchTgt = engine.getLayerById?.(lastTargetId);
                  if (lastPos === 'before' && touchSrc?.parentId === lastTargetId && (touchTgt?.isGroup || _lvlIsMaskSrc(lastTargetId))) {
                    _lvlDoExitGroup(layer.id, lastTargetId, 'above');
                  } else {
                    _lvlDoMove(layer.id, lastTargetId, lastPos);
                  }
                }
              }
            }
            el.classList.remove('dragging');
            el.style.pointerEvents = '';
            _lvlDRAG.id = null;
            _lvlClrAllDrop();
            setHint(null);
          }
          isDragging = false;
          startTouchId = null;
          lastTargetId = null;
          lastPos = null;
        };

        el.addEventListener('touchstart', (e) => {
          if (e.touches.length !== 1) { finishDrag(false); return; }
          // Disable native drag immediately so the browser (Safari, Brave, Chrome)
          // does not intercept the touch as an element drag gesture.
          el.draggable = false;
          const t = e.touches[0];
          startTouchId = t.identifier;
          startY = t.clientY;
          holdTimer = setTimeout(() => {
            holdTimer = null;
            isDragging = true;
            _lvlDRAG.id = layer.id;
            el.classList.add('dragging');
            if (navigator.vibrate) navigator.vibrate(30);
          }, 350);
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
          const t = Array.from(e.touches).find((tt) => tt.identifier === startTouchId);
          if (!t) return;
          if (!isDragging) {
            if (Math.abs(t.clientY - startY) > 12) cancelHold();
            return;
          }
          e.preventDefault();
          el.style.pointerEvents = 'none';
          const below = document.elementFromPoint(t.clientX, t.clientY);
          el.style.pointerEvents = '';
          _lvlClrAllDrop();
          lastTargetId = null;
          lastPos = null;

          // Check for group-exit zone first
          const exitZone = below?.closest('[data-lvl-exit-group]');
          if (exitZone) {
            const src = engine.getLayerById?.(_lvlDRAG.id);
            const gid = exitZone.dataset.lvlExitGroup;
            if (src?.parentId === gid) {
              exitZone.classList.add('lvl-drop-exit');
              setHint('Drop outside group');
              lastTargetId = gid;
              lastPos = 'exit-' + exitZone.dataset.lvlExitDir;
            }
          } else {
            const targetCard = below?.closest('[data-lvl-id]');
            const targetId = targetCard?.dataset?.lvlId;
            if (targetId && targetId !== layer.id && targetCard) {
              const r = targetCard.getBoundingClientRect();
              const pct = (t.clientY - r.top) / r.height;
              const isGrp = targetCard.classList.contains('lvl-grp-hdr');
              const isMaskSrc = _lvlIsMaskSrc(targetId);
              const tgtLayer = engine.getLayerById?.(targetId);
              const isMaskedChild = !!(tgtLayer?.parentId && _lvlIsMaskSrc(tgtLayer.parentId));
              let pos, cssClass, hint;
              if (isGrp) {
                pos = pct < 0.35 ? 'before' : pct > 0.65 ? 'after' : 'into';
                cssClass = pos === 'into' ? 'lvl-drop-into' : pos === 'before' ? 'lvl-drop-before' : 'lvl-drop-after';
                const touchDragSrc = engine.getLayerById?.(_lvlDRAG.id);
                hint = pos === 'into' ? 'Drop into group'
                  : (pos === 'before' && touchDragSrc?.parentId === targetId) ? 'Drop outside group'
                  : null;
              } else if (isMaskSrc) {
                pos = pct < 0.2 ? 'before' : pct > 0.8 ? 'after' : 'mask';
                cssClass = pos === 'mask' ? 'lvl-drop-mask' : pos === 'before' ? 'lvl-drop-before' : 'lvl-drop-after';
                const touchDragSrc2 = engine.getLayerById?.(_lvlDRAG.id);
                hint = pos === 'mask' ? 'Add to clipping mask'
                  : (pos === 'before' && touchDragSrc2?.parentId === targetId) ? 'Drop outside group'
                  : null;
              } else {
                pos = pct < 0.5 ? 'before' : 'after';
                cssClass = pos === 'before' ? 'lvl-drop-before' : 'lvl-drop-after';
                hint = isMaskedChild ? 'Drop inside clipping mask' : null;
              }
              targetCard.classList.add(cssClass);
              setHint(hint);
              lastTargetId = targetId;
              lastPos = pos;
            }
            // No exit zone or card found — check for over-drag beyond panel bounds
            if (!lastTargetId) {
              const items = list.querySelectorAll('[data-layer-id]');
              if (items.length) {
                const firstR = items[0].getBoundingClientRect();
                const lastR = items[items.length - 1].getBoundingClientRect();
                const src = engine.getLayerById?.(_lvlDRAG.id);
                if (t.clientY < firstR.top) {
                  if (src?.parentId) {
                    lastTargetId = src.parentId;
                    lastPos = 'exit-above';
                    items[0].classList.add('lvl-drop-before');
                    setHint('Drop outside group');
                  } else {
                    lastTargetId = items[0].dataset.layerId;
                    lastPos = 'before';
                    items[0].classList.add('lvl-drop-before');
                  }
                } else if (t.clientY > lastR.bottom) {
                  if (src?.parentId) {
                    lastTargetId = src.parentId;
                    lastPos = 'exit-below';
                    items[items.length - 1].classList.add('lvl-drop-after');
                    setHint('Drop outside group');
                  } else {
                    lastTargetId = items[items.length - 1].dataset.layerId;
                    lastPos = 'after';
                    items[items.length - 1].classList.add('lvl-drop-after');
                  }
                }
              }
            }
          }
        }, { passive: false });

        el.addEventListener('touchend', () => finishDrag(true));
        el.addEventListener('touchcancel', () => finishDrag(false));
      };

      const bindCardDrag = (el, layer) => {
        el.draggable = true;

        el.addEventListener('dragstart', (e) => {
          const isSingleSel = renderer?.selectedLayerIds?.size === 1 && renderer.selectedLayerIds.has(layer.id);
          const canArm = isSingleSel && Boolean(layer.maskCapabilities?.canSource);
          const armMask = canArm && Boolean(e.shiftKey);
          _lvlDRAG.id = layer.id;
          _lvlDRAG.canArm = canArm;
          _lvlDRAG.maskDrop = armMask;
          e.dataTransfer.effectAllowed = 'all';
          requestAnimationFrame(() => {
            el.classList.add('dragging');
            if (_lvlDRAG.maskDrop) {
              const maskBtn = el.querySelector('.mask-btn');
              if (maskBtn) {
                maskBtn.classList.remove('mask-drop-armed');
                void maskBtn.offsetWidth;
                maskBtn.classList.add('mask-drop-armed');
              }
            }
          });
        });

        el.addEventListener('dragend', () => {
          _lvlDRAG.id = null;
          _lvlDRAG.maskDrop = false;
          _lvlDRAG.canArm = false;
          _lvlDRAG.maskTargetId = null;
          el.classList.remove('dragging');
          const maskBtn = el.querySelector('.mask-btn');
          if (maskBtn) maskBtn.classList.remove('mask-drop-armed');
          _lvlClrAllDrop();
          setHint(null);
        });
        _bindCardTouchDrag(el, layer);
      };

      const addCardDropZone = (el, layer) => {
        el.addEventListener('dragover', (e) => {
          if (!_lvlDRAG.id || _lvlDRAG.id === layer.id) return;
          e.preventDefault(); e.stopPropagation();
          _lvlClrDrop(el);
          _lvlDRAG.maskDrop = _lvlDRAG.canArm && !!e.shiftKey;
          if (_lvlDRAG.maskDrop) {
            _lvlDRAG.maskTargetId = layer.id;
            el.classList.add('lvl-drop-mask');
            e.dataTransfer.dropEffect = 'move';
            setHint('Make clipping mask');
            return;
          }
          _lvlDRAG.maskTargetId = null;
          const r = el.getBoundingClientRect(), pct = (e.clientY - r.top) / r.height;
          el.classList.add(pct < 0.5 ? 'lvl-drop-before' : 'lvl-drop-after');
          e.dataTransfer.dropEffect = 'move';
        });
        el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) { _lvlClrDrop(el); setHint(null); } });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          if (_lvlDRAG.canArm && _lvlDRAG.maskDrop && _lvlDRAG.id && _lvlDRAG.id !== layer.id) {
            _lvlClrDrop(el); setHint(null);
            _lvlDoMaskCreate(_lvlDRAG.id, layer.id);
            return;
          }
          const pos = el.classList.contains('lvl-drop-before') ? 'before' : 'after';
          _lvlClrDrop(el); setHint(null);
          if (_lvlDRAG.id && _lvlDRAG.id !== layer.id) _lvlDoMove(_lvlDRAG.id, layer.id, pos);
        });
      };

      const addGrpDropZone = (el, layer) => {
        el.addEventListener('dragover', (e) => {
          if (!_lvlDRAG.id || _lvlDRAG.id === layer.id) return;
          e.preventDefault(); e.stopPropagation();
          _lvlClrDrop(el);
          _lvlDRAG.maskDrop = _lvlDRAG.canArm && !!e.shiftKey;
          if (_lvlDRAG.maskDrop) {
            _lvlDRAG.maskTargetId = layer.id;
            el.classList.add('lvl-drop-mask');
            e.dataTransfer.dropEffect = 'move';
            setHint('Make clipping mask');
            return;
          }
          _lvlDRAG.maskTargetId = null;
          const r = el.getBoundingClientRect(), pct = (e.clientY - r.top) / r.height;
          const zone = pct < 0.35 ? 'lvl-drop-before' : pct > 0.65 ? 'lvl-drop-after' : 'lvl-drop-into';
          el.classList.add(zone);
          e.dataTransfer.dropEffect = 'move';
          const draggedSrc = engine.getLayerById?.(_lvlDRAG.id);
          const isOwnChild = draggedSrc?.parentId === layer.id;
          setHint(zone === 'lvl-drop-into' ? 'Drop into group'
            : (zone === 'lvl-drop-before' && isOwnChild) ? 'Drop outside group'
            : null);
        });
        el.addEventListener('dragleave', (e) => {
          if (!el.contains(e.relatedTarget)) { _lvlClrDrop(el); setHint(null); }
        });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          if (_lvlDRAG.canArm && _lvlDRAG.maskDrop && _lvlDRAG.id && _lvlDRAG.id !== layer.id) {
            _lvlClrDrop(el); setHint(null);
            _lvlDoMaskCreate(_lvlDRAG.id, layer.id);
            return;
          }
          const zone = el.classList.contains('lvl-drop-before') ? 'before'
                     : el.classList.contains('lvl-drop-into') ? 'into' : 'after';
          _lvlClrDrop(el); setHint(null);
          if (_lvlDRAG.id && _lvlDRAG.id !== layer.id
              && !this.isDescendant?.(layer.id, _lvlDRAG.id)) {
            const draggedSrc2 = engine.getLayerById?.(_lvlDRAG.id);
            // exit-above: own child dropped on group header's top zone → exit group, land above
            if (zone === 'before' && draggedSrc2?.parentId === layer.id) {
              _lvlDoExitGroup(_lvlDRAG.id, layer.id, 'above');
            } else {
              _lvlDoMove(_lvlDRAG.id, layer.id, zone);
            }
          }
        });
      };

      const addMaskSrcDropZone = (el, srcLayer) => {
        el.addEventListener('dragover', (e) => {
          if (!_lvlDRAG.id || _lvlDRAG.id === srcLayer.id) return;
          e.preventDefault(); e.stopPropagation();
          _lvlClrDrop(el);
          _lvlDRAG.maskDrop = _lvlDRAG.canArm && !!e.shiftKey;
          if (_lvlDRAG.maskDrop) {
            _lvlDRAG.maskTargetId = srcLayer.id;
            el.classList.add('lvl-drop-mask');
            e.dataTransfer.dropEffect = 'move';
            setHint('Make clipping mask');
            return;
          }
          _lvlDRAG.maskTargetId = null;
          const r = el.getBoundingClientRect(), pct = (e.clientY - r.top) / r.height;
          const zone = pct < 0.2 ? 'lvl-drop-before' : pct > 0.8 ? 'lvl-drop-after' : 'lvl-drop-mask';
          el.classList.add(zone);
          e.dataTransfer.dropEffect = 'move';
          const isDraggingDescendant = _lvlDRAG.id ? this.isDescendant?.(_lvlDRAG.id, srcLayer.id) : false;
          setHint(zone === 'lvl-drop-mask' ? 'Add to clipping mask'
            : (zone === 'lvl-drop-before' && isDraggingDescendant) ? 'Drop outside group'
            : null);
        });
        el.addEventListener('dragleave', (e) => {
          if (!el.contains(e.relatedTarget)) { _lvlClrDrop(el); setHint(null); }
        });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          if (_lvlDRAG.canArm && _lvlDRAG.maskDrop && _lvlDRAG.id && _lvlDRAG.id !== srcLayer.id) {
            _lvlClrDrop(el); setHint(null);
            _lvlDoMaskCreate(_lvlDRAG.id, srcLayer.id);
            return;
          }
          const isMask = el.classList.contains('lvl-drop-mask');
          const pos = el.classList.contains('lvl-drop-before') ? 'before' : isMask ? null : 'after';
          _lvlClrDrop(el); setHint(null);
          if (_lvlDRAG.id && _lvlDRAG.id !== srcLayer.id) {
            if (isMask) {
              const draggedLayer = engine.getLayerById?.(_lvlDRAG.id);
              if (draggedLayer) {
                if (this.app.pushHistory) this.app.pushHistory();
                this.assignLayersToParent(srcLayer.id, [draggedLayer], { captureHistory: false });
                this.renderLayers(); this.app.render?.();
              }
            } else if (pos) {
              const draggedSrc = engine.getLayerById?.(_lvlDRAG.id);
              if (pos === 'before' && draggedSrc?.parentId === srcLayer.id) {
                _lvlDoExitGroup(_lvlDRAG.id, srcLayer.id, 'above');
              } else {
                _lvlDoMove(_lvlDRAG.id, srcLayer.id, pos);
              }
            }
          }
        });
      };

      const addMaskedCardDropZone = (el, layer, maskSrcId) => {
        el.addEventListener('dragover', (e) => {
          if (!_lvlDRAG.id || _lvlDRAG.id === layer.id) return;
          e.preventDefault(); e.stopPropagation();
          _lvlClrDrop(el);
          _lvlDRAG.maskDrop = _lvlDRAG.canArm && !!e.shiftKey;
          if (_lvlDRAG.maskDrop) {
            _lvlDRAG.maskTargetId = layer.id;
            el.classList.add('lvl-drop-mask');
            e.dataTransfer.dropEffect = 'move';
            setHint('Make clipping mask');
            return;
          }
          _lvlDRAG.maskTargetId = null;
          const r = el.getBoundingClientRect(), pct = (e.clientY - r.top) / r.height;
          el.classList.add(pct < 0.5 ? 'lvl-drop-before' : 'lvl-drop-after');
          e.dataTransfer.dropEffect = 'move';
          setHint('Drop inside clipping mask');
        });
        el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) { _lvlClrDrop(el); setHint(null); } });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          if (_lvlDRAG.canArm && _lvlDRAG.maskDrop && _lvlDRAG.id && _lvlDRAG.id !== layer.id) {
            _lvlClrDrop(el); setHint(null);
            _lvlDoMaskCreate(_lvlDRAG.id, layer.id);
            return;
          }
          const pos = el.classList.contains('lvl-drop-before') ? 'before' : 'after';
          _lvlClrDrop(el); setHint(null);
          if (!_lvlDRAG.id || _lvlDRAG.id === layer.id) return;
          const draggedLayer = engine.getLayerById?.(_lvlDRAG.id);
          if (!draggedLayer) return;
          if (draggedLayer.parentId === maskSrcId) {
            _lvlDoMove(_lvlDRAG.id, layer.id, pos);
          } else {
            if (this.app.pushHistory) this.app.pushHistory();
            this.assignLayersToParent(maskSrcId, [draggedLayer], { captureHistory: false });
            this.renderLayers(); this.app.render?.();
          }
        });
      };

      // ── Group-exit drop logic ────────────────────────────────────
      const _lvlDoExitGroup = (srcId, groupId, dir) => {
        const src = engine.getLayerById?.(srcId);
        if (!src || src.parentId !== groupId) return;
        const selIds = [...(renderer?.selectedLayerIds || [])];
        const moverIds = [srcId,
          ...selIds.filter((id) => id !== srcId && engine.getLayerById?.(id)?.parentId === groupId)];
        const moverSet = new Set(moverIds);
        const engineIds = engine.layers.map((l) => l.id).filter((id) => !moverSet.has(id));

        // Pre-normalize: ensure the group sits just after its remaining descendants
        // so insertion logic works regardless of initial engine.layers order
        // (e.g. right after expandLayer the group precedes its children).
        const grpI0 = engineIds.indexOf(groupId);
        if (grpI0 !== -1) {
          const c0 = engineIds.reduce((acc, id, i) => {
            if (engine.getLayerById(id)?.parentId === groupId) acc.push(i);
            return acc;
          }, []);
          if (c0.length) {
            const maxC = Math.max(...c0);
            if (grpI0 !== maxC + 1) {
              engineIds.splice(grpI0, 1);
              const adj = maxC > grpI0 ? maxC - 1 : maxC;
              engineIds.splice(adj + 1, 0, groupId);
            }
          }
        }

        const grpIdx = engineIds.indexOf(groupId);
        let insertIdx;
        if (dir === 'below') {
          insertIdx = grpIdx + 1;
        } else {
          const childIdxs = engineIds.reduce((acc, id, i) => {
            if (engine.getLayerById(id)?.parentId === groupId) acc.push(i);
            return acc;
          }, []);
          insertIdx = childIdxs.length ? Math.min(...childIdxs) : grpIdx;
        }
        engineIds.splice(insertIdx, 0, ...moverIds);
        const movers = moverIds.map((id) => engine.getLayerById?.(id)).filter(Boolean);
        const grpLayer = engine.getLayerById?.(groupId);
        const newParentId = grpLayer?.parentId ?? null;
        if (this.app.pushHistory) this.app.pushHistory();
        movers.forEach((m) => { m.parentId = newParentId; });
        const layerMap = new Map(engine.layers.map((l) => [l.id, l]));
        engine.layers = engineIds.map((id) => layerMap.get(id)).filter(Boolean);
        this.normalizeGroupOrder?.();
        this.app.computeDisplayGeometry?.();
        this.app.setSelection?.(moverIds, srcId);
        this.app.engine.setActiveLayerId?.(srcId);
        this.renderLayers();
        this.app.render();
      };

      const addExitGroupDropZone = (el, groupLayer, dir) => {
        el.addEventListener('dragover', (e) => {
          if (!_lvlDRAG.id) return;
          const src = engine.getLayerById?.(_lvlDRAG.id);
          if (!src || src.parentId !== groupLayer.id) return;
          e.preventDefault(); e.stopPropagation();
          _lvlClrAllDrop();
          el.classList.add('lvl-drop-exit');
          e.dataTransfer.dropEffect = 'move';
          setHint('Drop outside group');
        });
        el.addEventListener('dragleave', (e) => {
          if (!el.contains(e.relatedTarget)) { el.classList.remove('lvl-drop-exit'); setHint(null); }
        });
        el.addEventListener('drop', (e) => {
          e.preventDefault();
          el.classList.remove('lvl-drop-exit');
          setHint(null);
          if (!_lvlDRAG.id) return;
          _lvlDoExitGroup(_lvlDRAG.id, groupLayer.id, dir);
        });
      };

      // ── Boundary drop zones (top/bottom of stack) ───────────────
      // Update per-render references on list so one-time listeners stay current.
      // _lvlDRAG/etc are recreated each render; listeners close over the first
      // render's copies and go stale — reading via list._lvl* avoids that.
      list._lvlDrag = _lvlDRAG;
      list._lvlDoMoveRef = _lvlDoMove;
      list._lvlDoExitGroupRef = _lvlDoExitGroup;
      list._lvlDoMaskCreateRef = _lvlDoMaskCreate;
      list._lvlGetLayerRef = (id) => engine.getLayerById?.(id);
      list._lvlClrRef = _lvlClrAllDrop;
      list._lvlHintRef = setHint;

      if (!list._lvlBndryDrop) {
        list._lvlBndryDrop = true;

        list.addEventListener('dragover', (e) => {
          if (!list._lvlDrag?.id) return;
          e.preventDefault();
          // Cursor is on list background (not a card) — clear mask target so
          // an intentional move-off doesn't unexpectedly create a mask on drop.
          if (list._lvlDrag.maskTargetId) list._lvlDrag.maskTargetId = null;
          const items = list.querySelectorAll('[data-layer-id]');
          if (!items.length) return;
          const first = items[0], last = items[items.length - 1];
          list._lvlClrRef();
          if (e.clientY < first.getBoundingClientRect().bottom) {
            first.classList.add('lvl-drop-before');
          } else {
            last.classList.add('lvl-drop-after');
          }
          e.dataTransfer.dropEffect = 'move';
        });

        list.addEventListener('drop', (e) => {
          if (!list._lvlDrag?.id) return;
          e.preventDefault();
          // Fallback: if the drop missed the card but mask was armed, still create the mask.
          // This covers browsers that fire dragleave+drop on the list instead of the card.
          if (list._lvlDrag.maskDrop && list._lvlDrag.maskTargetId && list._lvlDrag.id !== list._lvlDrag.maskTargetId) {
            const tid = list._lvlDrag.maskTargetId;
            list._lvlClrRef(); list._lvlHintRef(null);
            list._lvlDoMaskCreateRef?.(list._lvlDrag.id, tid);
            return;
          }
          const before = list.querySelector('.lvl-drop-before');
          const after  = list.querySelector('.lvl-drop-after');
          list._lvlClrRef(); list._lvlHintRef(null);
          const dragId = list._lvlDrag.id;
          const dragSrc = list._lvlGetLayerRef?.(dragId);
          if (before && before.dataset.layerId !== dragId) {
            if (dragSrc?.parentId) {
              list._lvlDoExitGroupRef?.(dragId, dragSrc.parentId, 'above');
            } else {
              list._lvlDoMoveRef(dragId, before.dataset.layerId, 'before');
            }
          } else if (after && after.dataset.layerId !== dragId) {
            if (dragSrc?.parentId) {
              list._lvlDoExitGroupRef?.(dragId, dragSrc.parentId, 'below');
            } else {
              list._lvlDoMoveRef(dragId, after.dataset.layerId, 'after');
            }
          }
        });
      }

      const searchBar = document.getElementById('layer-search-bar');
      if (searchBar && !searchBar._lvlBndryDrop) {
        searchBar._lvlBndryDrop = true;

        searchBar.addEventListener('dragover', (e) => {
          if (!list._lvlDrag?.id) return;
          e.preventDefault();
          const first = list.querySelector('[data-layer-id]');
          if (!first) return;
          list._lvlClrRef();
          first.classList.add('lvl-drop-before');
          e.dataTransfer.dropEffect = 'move';
        });
        searchBar.addEventListener('dragleave', (e) => {
          if (!searchBar.contains(e.relatedTarget)) list._lvlClrRef?.();
        });
        searchBar.addEventListener('drop', (e) => {
          if (!list._lvlDrag?.id) return;
          e.preventDefault();
          const first = list.querySelector('[data-layer-id]');
          list._lvlClrRef(); list._lvlHintRef(null);
          const dragId = list._lvlDrag.id;
          if (first && first.dataset.layerId !== dragId) {
            const dragSrc = list._lvlGetLayerRef?.(dragId);
            if (dragSrc?.parentId) {
              list._lvlDoExitGroupRef?.(dragId, dragSrc.parentId, 'above');
            } else {
              list._lvlDoMoveRef(dragId, first.dataset.layerId, 'before');
            }
          }
        });
      }

      const statusBar = document.getElementById('layer-status-bar');
      if (statusBar && !statusBar._lvlBndryDrop) {
        statusBar._lvlBndryDrop = true;

        statusBar.addEventListener('dragover', (e) => {
          if (!list._lvlDrag?.id) return;
          e.preventDefault();
          const items = list.querySelectorAll('[data-layer-id]');
          if (!items.length) return;
          const last = items[items.length - 1];
          list._lvlClrRef();
          last.classList.add('lvl-drop-after');
          e.dataTransfer.dropEffect = 'move';
        });
        statusBar.addEventListener('dragleave', (e) => {
          if (!statusBar.contains(e.relatedTarget)) list._lvlClrRef?.();
        });
        statusBar.addEventListener('drop', (e) => {
          if (!list._lvlDrag?.id) return;
          e.preventDefault();
          const items = list.querySelectorAll('[data-layer-id]');
          list._lvlClrRef(); list._lvlHintRef(null);
          if (!items.length) return;
          const last = items[items.length - 1];
          const dragId = list._lvlDrag.id;
          if (last.dataset.layerId !== dragId) {
            const dragSrc = list._lvlGetLayerRef?.(dragId);
            if (dragSrc?.parentId) {
              list._lvlDoExitGroupRef?.(dragId, dragSrc.parentId, 'below');
            } else {
              list._lvlDoMoveRef(dragId, last.dataset.layerId, 'after');
            }
          }
        });
      }

      // ── Filter / search helpers ─────────────────────────────────
      const _lvlPenColor = (layer) => {
        if (layer.penId) {
          const pen = engine.getPenById?.(layer.penId)
                   ?? (SETTINGS.pens || []).find((p) => p.id === layer.penId);
          if (pen?.color) return pen.color;
        }
        return layer.color || '#71717a';
      };

      const _lvlBarColor = (layer) => {
        const pid = SETTINGS.layerBarPaletteId || 'prism';
        if (pid === 'pen-color') return _lvlPenColor(layer);
        const palette = (window.Vectura.LAYER_PALETTES || []).find(p => p.id === pid);
        if (!palette?.colors) return _lvlPenColor(layer);
        const c = palette.colors;
        const t = layer.type;
        if (t === 'group') return c._group || '#6B7280';
        if (t === 'pen' || t === 'shape' || t === 'svg' || t === 'polygon') return c._pen || '#9CA3AF';
        return c[t] || c._default || '#A1A1AA';
      };

      const _lvlEffLocked = (id) => {
        if (this.layerLockedIds.has(id)) return true;
        let l = engine.getLayerById?.(id);
        while (l?.parentId) {
          const parent = engine.getLayerById?.(l.parentId);
          if (this.layerLockedIds.has(l.parentId) && !parent?.mask?.enabled) return true;
          l = parent;
        }
        return false;
      };

      const _lvlPasses = (layer) => {
        const q = (this.layerSearchQ || '').toLowerCase();
        const ft = this.layerFilterType || 'all';
        const selfOk = () => {
          if (q && !layer.name.toLowerCase().includes(q)) return false;
          if (ft === 'all') return true;
          if (ft === 'groups') return !!layer.isGroup;
          return layer.type === ft;
        };
        if (selfOk()) return true;
        if (layer.isGroup)
          return allLayers.filter((c) => c.parentId === layer.id).some((c) => _lvlPasses(c));
        return false;
      };

      const _lvlIsMaskSrc = (layerId) => {
        const l = engine.getLayerById?.(layerId);
        return !!(l?.mask?.enabled && l?.maskCapabilities?.canSource);
      };

      const _lvlEsc = (s) =>
        String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const _lvlNameEl = (layer, cls) => {
        const sp = document.createElement('span'); sp.className = cls;
        const q = this.layerSearchQ || '';
        if (!q) { sp.textContent = layer.name; return sp; }
        const lo = layer.name.toLowerCase(), idx = lo.indexOf(q.toLowerCase());
        if (idx === -1) { sp.textContent = layer.name; return sp; }
        sp.innerHTML = _lvlEsc(layer.name.slice(0, idx))
          + `<mark style="background:rgba(251,191,36,.25);color:inherit;border-radius:2px">`
          + _lvlEsc(layer.name.slice(idx, idx + q.length)) + `</mark>`
          + _lvlEsc(layer.name.slice(idx + q.length));
        return sp;
      };

      const _lvlFlatOrder = () => {
        const r = [];
        const walk = (pId) =>
          allLayers.filter((l) => (l.parentId ?? null) === (pId ?? null)).forEach((l) => {
            if (_lvlPasses(l)) { r.push(l.id); if ((l.isGroup && !l.groupCollapsed) || _lvlIsMaskSrc(l.id)) walk(l.id); }
          });
        walk(null); return r;
      };

      const _lvlTriggerRename = (el, layer) => {
        if (!layer) return;
        const inp = document.createElement('input');
        inp.className = 'lvl-ren-inp'; inp.type = 'text'; inp.value = layer.name;
        el.replaceWith(inp); inp.focus(); inp.select();
        let done = false;
        const save = () => {
          if (done) return; done = true;
          const v = inp.value.trim();
          if (v && v !== layer.name) { if (this.app.pushHistory) this.app.pushHistory(); layer.name = v; }
          this.renderLayers();
        };
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', (e2) => {
          e2.stopPropagation();
          if (e2.key === 'Enter') inp.blur();
          if (e2.key === 'Escape') { done = true; this.renderLayers(); }
        });
        inp.addEventListener('click', (e3) => e3.stopPropagation());
        inp.addEventListener('mousedown', (e4) => e4.stopPropagation());
      };

      const _lvlDoSel = (e, id) => {
        const now = Date.now();
        const onName = e.target?.closest?.('.lvl-name,.lvl-grp-name');
        if (onName && !e.metaKey && !e.ctrlKey && !e.shiftKey
            && now - this._lvlDblTime < 350 && this._lvlDblId === id) {
          this._lvlDblTime = 0; this._lvlDblId = null;
          const el = document.querySelector(
            `[data-lvl-id="${id}"] .lvl-name,[data-lvl-id="${id}"] .lvl-grp-name`);
          if (el) _lvlTriggerRename(el, engine.getLayerById?.(id));
          return;
        }
        this._lvlDblTime = now; this._lvlDblId = id;
        if (e.metaKey || e.ctrlKey) {
          const ids = new Set(renderer?.selectedLayerIds || []);
          ids.has(id) ? ids.delete(id) : ids.add(id);
          renderer.setSelection([...ids], id);
        } else if (e.shiftKey && this.lastLayerClickId) {
          const ord = _lvlFlatOrder();
          const a = ord.indexOf(this.lastLayerClickId), b = ord.indexOf(id);
          const lo = Math.min(a, b), hi = Math.max(a, b);
          renderer.setSelection(ord.slice(lo, hi + 1), id);
        } else {
          renderer.setSelection([id], id);
          engine.activeLayerId = id;
        }
        this.lastLayerClickId = id;
        this.buildControls?.();
        this.updateFormula?.();
        this.app.render?.();
        this.renderLayers();
      };

      // ── Eye & lock buttons ──────────────────────────────────────
      const _lvlMkEye = (layer) => {
        const b = document.createElement('button');
        const isMod = layer.isGroup && layer.groupType === 'modifier';
        if (isMod) {
          const on = layer.modifier?.enabled !== false;
          b.className = 'lvl-ib' + (on ? '' : ' vis-off');
          b.innerHTML = on ? this._LVL_I.eye() : this._LVL_I.eyeOff();
          b.title = on ? 'Disable mirror modifier' : 'Enable mirror modifier';
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            if (layer.modifier) layer.modifier.enabled = !on;
            engine.computeAllDisplayGeometry?.();
            this.app.render(); this.renderLayers();
          });
        } else {
          b.className = 'lvl-ib' + (layer.visible ? '' : ' vis-off');
          b.innerHTML = layer.visible ? this._LVL_I.eye() : this._LVL_I.eyeOff();
          b.title = layer.visible ? 'Hide' : 'Show';
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.app.pushHistory) this.app.pushHistory();
            const newVis = !layer.visible;
            const cascade = (l) => {
              l.visible = newVis;
              allLayers.filter((c) => c.parentId === l.id).forEach(cascade);
            };
            cascade(layer);
            engine.computeAllDisplayGeometry?.();
            this.app.render(); this.renderLayers();
          });
        }
        return b;
      };

      const _lvlMkLock = (layer) => {
        const selfLk = this.layerLockedIds.has(layer.id);
        const ancLk = !selfLk && _lvlEffLocked(layer.id);
        const b = document.createElement('button');
        if (ancLk) {
          b.className = 'lvl-ib lk-anc'; b.innerHTML = this._LVL_I.lock();
          b.title = 'Locked by parent';
          b.addEventListener('click', (e) => e.stopPropagation());
        } else {
          b.className = 'lvl-ib ' + (selfLk ? 'lk-on' : 'lk-off');
          b.innerHTML = selfLk ? this._LVL_I.lock() : this._LVL_I.lockOpen();
          b.title = selfLk ? 'Unlock' : 'Lock';
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            selfLk ? this.layerLockedIds.delete(layer.id) : this.layerLockedIds.add(layer.id);
            this.renderLayers();
          });
        }
        return b;
      };

      // ── Card builder ────────────────────────────────────────────
      const _lvlBuildCard = (layer, masked = false) => {
        const selIds = renderer?.selectedLayerIds || new Set();
        const card = document.createElement('div');
        card.className = 'lvl-card' + (masked ? ' masked-v2' : '');
        card.dataset.lvlId = layer.id;
        card.dataset.layerId = layer.id;
        const isActive = engine.activeLayerId === layer.id;
        if (isActive) card.classList.add('is-active');
        else if (selIds.has(layer.id)) card.classList.add('is-selected');
        if (!layer.visible) card.classList.add('is-hidden');
        const locked = _lvlEffLocked(layer.id);
        if (locked) card.classList.add('is-locked');

        if (masked) {
          // V8-style: no inner wrapper, no caret-zone, no clr-bar, no drag grip
          const r1m = document.createElement('div'); r1m.className = 'lvl-r1';
          r1m.appendChild(_lvlMkEye(layer));
          r1m.appendChild(_lvlMkLock(layer));
          r1m.appendChild(_lvlNameEl(layer, 'lvl-name'));
          const pdm = document.createElement('span'); pdm.className = 'lvl-pen-dot';
          pdm.style.background = _lvlPenColor(layer); pdm.title = 'Assign pen';
          pdm.addEventListener('click', (e) => { e.stopPropagation(); card.querySelector('.pen-pill')?.click(); });
          r1m.appendChild(pdm); card.appendChild(r1m);

          const r2m = document.createElement('div'); r2m.className = 'lvl-r2';
          const aim = document.createElement('span'); aim.className = 'lvl-aico';
          aim.innerHTML = (this._LVL_I[layer.type] ?? this._LVL_I.grid)?.() ?? '';
          r2m.appendChild(aim);
          const alm = document.createElement('span'); alm.className = 'lvl-algo-label';
          alm.textContent = layer.type || ''; r2m.appendChild(alm);
          const actsm = document.createElement('div'); actsm.className = 'lvl-acts';
          const mkAbM = (cls, iconFn, title, fn) => {
            const b = document.createElement('button');
            b.className = 'lvl-ab' + (cls ? ' ' + cls : '');
            b.title = title; b.type = 'button'; b.innerHTML = iconFn();
            b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b;
          };
          if (layer.type !== 'shape') {
            actsm.appendChild(mkAbM('', () => this._LVL_I.expand(), 'Expand into group', () => this.expandLayer?.(layer)));
          }
          if (layer.type === 'shape' && Array.isArray(layer.fills) && layer.fills.length > 0) {
            const n = layer.fills.length;
            actsm.appendChild(mkAbM('', () => this._LVL_I.expand(),
              `Expand ${n} fill${n === 1 ? '' : 's'} into a group`,
              () => this._lvlExpandFill(layer)));
          }
          if (layer.type === 'shape' && layer.sourceFillRecord && Array.isArray(layer.paths) && layer.paths.length > 0) {
            const n = layer.paths.length;
            actsm.appendChild(mkAbM('', () => this._LVL_I.expand(),
              `Explode fill into ${n} path${n === 1 ? '' : 's'}`,
              () => this._lvlExplodeFill(layer)));
          }
          actsm.appendChild(mkAbM('', () => this._LVL_I.dup(), 'Duplicate (⌘D)', () => {
            if (this.app.pushHistory) this.app.pushHistory();
            engine.duplicateLayer(layer.id); this.renderLayers(); this.app.render();
          }));
          actsm.appendChild(mkAbM('del', () => this._LVL_I.trash(), 'Delete', () => {
            if (this.app.pushHistory) this.app.pushHistory();
            this.unlockMirrorChildrenOnDelete?.(layer.id);
            engine.removeLayer(layer.id); this.renderLayers(); this.app.render();
          }));
          r2m.appendChild(actsm); card.appendChild(r2m);

          card.insertAdjacentHTML('beforeend', buildPenAssignment());
          wirePenAssignment(card, layer, () =>
            renderer?.selectedLayerIds?.has(layer.id) ? renderer.getSelectedLayers?.() ?? [layer] : [layer]);
          const _penDragOverM = card.ondragover;
          if (_penDragOverM) card.ondragover = (ev) => { if (_lvlDRAG.id) return; _penDragOverM.call(card, ev); };
          card.addEventListener('click', (e) => {
            if (e.target.closest('.lvl-ib,.lvl-ab,.pen-assign')) return;
            if (this.armedPenId && this.applyArmedPenToLayers?.([layer])) return;
            _lvlDoSel(e, layer.id);
          });
          return card;
        }

        const inner = document.createElement('div'); inner.className = 'lvl-card-inner';
        const cz = document.createElement('div'); cz.className = 'lvl-caret-zone';
        inner.appendChild(cz);

        const bar = document.createElement('div');
        bar.className = 'lvl-clr-bar'; bar.style.background = _lvlBarColor(layer);
        inner.appendChild(bar);

        const body = document.createElement('div'); body.className = 'lvl-card-body';
        const r1 = document.createElement('div'); r1.className = 'lvl-r1';
        r1.appendChild(_lvlMkEye(layer));
        r1.appendChild(_lvlMkLock(layer));
        r1.appendChild(_lvlNameEl(layer, 'lvl-name'));
        const pd = document.createElement('span');
        pd.className = 'lvl-pen-dot'; pd.style.background = _lvlPenColor(layer);
        pd.title = 'Assign pen';
        pd.addEventListener('click', (e) => { e.stopPropagation(); card.querySelector('.pen-pill')?.click(); });
        r1.appendChild(pd);
        body.appendChild(r1);

        const r2 = document.createElement('div'); r2.className = 'lvl-r2';
        const ai = document.createElement('span'); ai.className = 'lvl-aico';
        ai.innerHTML = (this._LVL_I[layer.type] ?? this._LVL_I.grid)?.() ?? '';
        r2.appendChild(ai);
        const al = document.createElement('span'); al.className = 'lvl-algo-label';
        al.textContent = layer.type || ''; r2.appendChild(al);

        const acts = document.createElement('div'); acts.className = 'lvl-acts';
        const mkAb = (cls, iconFn, title, fn) => {
          const b = document.createElement('button');
          b.className = 'lvl-ab' + (cls ? ' ' + cls : '');
          b.title = title; b.type = 'button'; b.innerHTML = iconFn();
          b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b;
        };
        if (layer.maskCapabilities?.canSource) {
          const isSrc = _lvlIsMaskSrc(layer.id);
          acts.appendChild(mkAb(
            'mask-btn' + (isSrc ? ' is-src' : ''), () => isSrc ? this._LVL_I.maskSrcActive() : this._LVL_I.maskSrc(),
            isSrc ? 'Remove clipping mask (click to deactivate)' : 'Make clipping mask — clips layer below',
            () => {
              if (this.app.pushHistory) this.app.pushHistory();
              if (isSrc) {
                const kids = allLayers.filter((c) => c.parentId === layer.id);
                kids.forEach((c) => { c.parentId = layer.parentId ?? null; });
                layer.mask.enabled = false;
              } else {
                const sibs = allLayers.filter((s) => (s.parentId ?? null) === (layer.parentId ?? null));
                const idx = sibs.indexOf(layer);
                if (idx < sibs.length - 1) {
                  this.assignLayersToParent(layer.id, [sibs[idx + 1]], { captureHistory: false });
                }
                layer.mask.enabled = true;
              }
              engine.computeAllDisplayGeometry?.();
              this.renderLayers(); this.app.render?.();
            }
          ));
          if (isSrc) {
            const isHidden = Boolean(layer.mask?.hideLayer);
            acts.appendChild(mkAb(
              'mask-outline-btn' + (isHidden ? ' is-hidden' : ''),
              () => isHidden ? this._LVL_I.maskOutlineHide() : this._LVL_I.maskOutlineShow(),
              isHidden ? 'Show mask layer outline' : 'Hide mask layer outline',
              () => {
                this.setLayerMaskHidden(layer, !isHidden, { captureHistory: true });
                this.renderLayers(); this.app.render?.();
              }
            ));
          }
        }
        if (layer.type !== 'shape') {
          acts.appendChild(mkAb('', () => this._LVL_I.expand(), 'Expand into group', () => this.expandLayer?.(layer)));
        }
        if (layer.type === 'shape' && Array.isArray(layer.fills) && layer.fills.length > 0) {
          const n = layer.fills.length;
          acts.appendChild(mkAb('', () => this._LVL_I.expand(),
            `Expand ${n} fill${n === 1 ? '' : 's'} into a group`,
            () => this._lvlExpandFill(layer)));
        }
        if (layer.type === 'shape' && layer.sourceFillRecord && Array.isArray(layer.paths) && layer.paths.length > 0) {
          const n = layer.paths.length;
          acts.appendChild(mkAb('', () => this._LVL_I.expand(),
            `Explode fill into ${n} path${n === 1 ? '' : 's'}`,
            () => this._lvlExplodeFill(layer)));
        }
        acts.appendChild(mkAb('', () => this._LVL_I.dup(), 'Duplicate (⌘D)', () => {
          if (this.app.pushHistory) this.app.pushHistory();
          engine.duplicateLayer(layer.id); this.renderLayers(); this.app.render();
        }));
        acts.appendChild(mkAb('del', () => this._LVL_I.trash(), 'Delete', () => {
          if (this.app.pushHistory) this.app.pushHistory();
          this.unlockMirrorChildrenOnDelete?.(layer.id);
          engine.removeLayer(layer.id); this.renderLayers(); this.app.render();
        }));
        r2.appendChild(acts);
        body.appendChild(r2);
        inner.appendChild(body);
        card.appendChild(inner);

        card.insertAdjacentHTML('beforeend', buildPenAssignment());
        wirePenAssignment(card, layer, () =>
          renderer?.selectedLayerIds?.has(layer.id) ? renderer.getSelectedLayers?.() ?? [layer] : [layer]
        );
        const _penDragOver = card.ondragover;
        if (_penDragOver) card.ondragover = (ev) => { if (_lvlDRAG.id) return; _penDragOver.call(card, ev); };

        card.addEventListener('click', (e) => {
          if (e.target.closest('.lvl-ib,.lvl-ab,.pen-assign')) return;
          if (this.armedPenId && this.applyArmedPenToLayers?.([layer])) return;
          _lvlDoSel(e, layer.id);
        });
        if (!locked) bindCardDrag(card, layer);
        return card;
      };

      // ── Group header builder ────────────────────────────────────
      const _lvlBuildGrpHdr = (layer, masked = false) => {
        const selIds = renderer?.selectedLayerIds || new Set();
        const hdr = document.createElement('div');
        hdr.className = 'lvl-grp-hdr'
          + (layer.groupType === 'modifier' ? ' modifier' : '')
          + (layer.groupType === 'layer' ? ' layer-grp' : '')
          + (masked ? ' masked-v2' : '');
        hdr.dataset.lvlId = layer.id;
        hdr.dataset.layerId = layer.id;
        const isActive = engine.activeLayerId === layer.id;
        if (isActive) hdr.classList.add('is-active');
        else if (selIds.has(layer.id)) hdr.classList.add('is-selected');
        if (!layer.visible) hdr.classList.add('is-hidden');
        if (layer.groupType === 'modifier' && layer.modifier?.enabled === false) hdr.classList.add('mod-off');

        const cz = document.createElement('div'); cz.className = 'lvl-caret-zone';
        const car = document.createElement('span');
        car.className = 'lvl-caret' + (layer.groupCollapsed ? '' : ' open');
        car.innerHTML = this._LVL_I.caret();
        car.addEventListener('click', (e) => { e.stopPropagation(); layer.groupCollapsed = !layer.groupCollapsed; this.renderLayers(); });
        cz.appendChild(car); hdr.appendChild(cz);

        const bar = document.createElement('div'); bar.className = 'lvl-clr-bar';
        bar.style.background = _lvlBarColor(layer) || 'var(--ui-border-hi)';
        hdr.appendChild(bar);

        const gc = document.createElement('div'); gc.className = 'lvl-grp-content';
        gc.appendChild(_lvlMkEye(layer));
        gc.appendChild(_lvlMkLock(layer));
        const fi = document.createElement('span'); fi.className = 'lvl-aico';
        fi.innerHTML = layer.groupType === 'layer'
          ? (this._LVL_I.layer?.() ?? this._LVL_I.folder())
          : this._LVL_I.folder();
        gc.appendChild(fi);
        gc.appendChild(_lvlNameEl(layer, 'lvl-grp-name'));

        const mkAb = (cls, iconFn, title, fn) => {
          const b = document.createElement('button');
          b.className = 'lvl-ab' + (cls ? ' ' + cls : '');
          b.title = title; b.type = 'button'; b.innerHTML = iconFn();
          b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b;
        };
        const ga = document.createElement('div'); ga.className = 'lvl-grp-acts';
        if (layer.groupType === 'modifier') {
          ga.appendChild(mkAb('', () => this._LVL_I.expand(), 'Expand to folder', () => {
            if (this.app.pushHistory) this.app.pushHistory();
            engine.expandModifierLayer(layer.id);
            this.renderLayers(); this.app.render();
          }));
        }
        ga.appendChild(mkAb('', () => this._LVL_I.ungroup(), 'Ungroup (⌘⇧G)', () => {
          if (this.app.pushHistory) this.app.pushHistory();
          this.unlockMirrorChildrenOnDelete?.(layer.id);
          const kids = allLayers.filter((l) => l.parentId === layer.id);
          kids.forEach((l) => { l.parentId = layer.parentId ?? null; });
          engine.removeLayer(layer.id);
          renderer.setSelection(kids.map((l) => l.id), kids[0]?.id);
          this.renderLayers(); this.app.render();
        }));
        ga.appendChild(mkAb('', () => this._LVL_I.dup(), 'Duplicate group', () => {
          if (this.app.pushHistory) this.app.pushHistory();
          engine.duplicateLayer(layer.id); this.renderLayers(); this.app.render();
        }));
        ga.appendChild(mkAb('del', () => this._LVL_I.trash(), 'Delete group', () => {
          if (this.app.pushHistory) this.app.pushHistory();
          this.unlockMirrorChildrenOnDelete?.(layer.id);
          engine.removeLayer(layer.id); this.renderLayers(); this.app.render();
        }));
        gc.appendChild(ga); hdr.appendChild(gc);

        hdr.addEventListener('click', (e) => {
          if (e.target.closest('.lvl-caret,.lvl-ib,.lvl-ab')) return;
          if (this.armedPenId && this.applyArmedPenToLayers?.([layer])) return;
          _lvlDoSel(e, layer.id);
        });
        if (!_lvlEffLocked(layer.id)) { bindCardDrag(hdr, layer); addGrpDropZone(hdr, layer); }
        return hdr;
      };

      // ── Tree builder ────────────────────────────────────────────
      const _lvlBuildChildren = (parentId, container) => {
        const isRoot = parentId === null;
        const children = allLayers.filter((l) => (l.parentId ?? null) === (parentId ?? null));

        // Mask sources: layers with mask.enabled + canSource. Their masked children are
        // actual parentId-children in the engine. Build the map here.
        const maskedBySrc = new Map();
        children.forEach((l) => {
          if (_lvlIsMaskSrc(l.id)) {
            maskedBySrc.set(l.id, allLayers.filter((c) => c.parentId === l.id));
          }
        });
        const done = new Set();

        const appendEl = (el) => {
          if (isRoot) {
            container.appendChild(el);
          } else {
            const w = document.createElement('div'); w.className = 'lvl-tree-cwrap';
            w.appendChild(el); container.appendChild(w);
          }
        };

        children.forEach((l) => {
          if (done.has(l.id)) return;
          if (!_lvlPasses(l)) { done.add(l.id); return; }

          if (_lvlIsMaskSrc(l.id)) {
            done.add(l.id);
            const srcCard = _lvlBuildCard(l, false);
            addMaskSrcDropZone(srcCard, l);
            appendEl(srcCard);
            // Masked children (actual children via parentId)
            const maskedList = maskedBySrc.get(l.id) || [];
            maskedList.forEach((m) => {
              done.add(m.id);
              if (!_lvlPasses(m)) return;
              if (m.isGroup) {
                const mHdr = _lvlBuildGrpHdr(m, true);
                appendEl(mHdr);
                if (!m.groupCollapsed) {
                  const cw = document.createElement('div'); cw.className = 'lvl-tree-children';
                  cw.style.marginLeft = '20px';
                  _lvlBuildChildren(m.id, cw); container.appendChild(cw);
                }
              } else {
                const mc = _lvlBuildCard(m, true);
                addMaskedCardDropZone(mc, m, l.id);
                if (!_lvlEffLocked(m.id)) bindCardDrag(mc, m);
                appendEl(mc);
              }
            });
            // Exit zone below masked children (mirrors group exit zone at L1118)
            if (maskedList.some((m) => _lvlPasses(m))) {
              const exitBelow = document.createElement('div');
              exitBelow.className = 'lvl-grp-exit-zone lvl-grp-exit-zone--below';
              exitBelow.dataset.lvlExitGroup = l.id;
              exitBelow.dataset.lvlExitDir = 'below';
              addExitGroupDropZone(exitBelow, l, 'below');
              appendEl(exitBelow);
            }

          } else if (l.isGroup) {
            done.add(l.id);
            appendEl(_lvlBuildGrpHdr(l));
            if (!l.groupCollapsed) {
              const cw = document.createElement('div'); cw.className = 'lvl-tree-children';
              _lvlBuildChildren(l.id, cw);
              const exitBelow = document.createElement('div');
              exitBelow.className = 'lvl-grp-exit-zone lvl-grp-exit-zone--below';
              exitBelow.dataset.lvlExitGroup = l.id;
              exitBelow.dataset.lvlExitDir = 'below';
              addExitGroupDropZone(exitBelow, l, 'below');
              cw.appendChild(exitBelow);
              container.appendChild(cw);
            }

          } else {
            done.add(l.id);
            const card = _lvlBuildCard(l, false);
            addCardDropZone(card, l);
            appendEl(card);
          }
        });

        children.filter((l) => !done.has(l.id)).forEach((l) => {
          if (_lvlPasses(l)) {
            const card = _lvlBuildCard(l, false);
            addCardDropZone(card, l);
            appendEl(card);
          }
        });
      };

      // ── Status bar ──────────────────────────────────────────────
      const _lvlBuildStatusBar = () => {
        const bar = document.getElementById('layer-status-bar'); if (!bar) return;
        bar.innerHTML = '';
        const sel = renderer?.selectedLayerIds?.size ?? 0;
        const mkCb = (cls, iconFn, title, fn) => {
          const b = document.createElement('button');
          b.className = 'lvl-cb' + (cls ? ' ' + cls : ''); b.title = title; b.type = 'button';
          b.innerHTML = iconFn();
          b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b;
        };
        if (sel > 1) {
          const lbl = document.createElement('span'); lbl.className = 'lvl-sb-sel-label';
          lbl.textContent = sel + ' layers selected'; bar.appendChild(lbl);
          const sep = document.createElement('div'); sep.className = 'lvl-sb-sep'; bar.appendChild(sep);
          const cmds = document.createElement('div'); cmds.className = 'lvl-sb-cmds';
          const selIds = [...(renderer?.selectedLayerIds || [])];
          const hasGrp = selIds.some((id) => engine.getLayerById?.(id)?.isGroup);
          const hasGroupedChildren = selIds.some((id) => {
            const l = engine.getLayerById?.(id);
            return l && !l.isGroup && l.parentId;
          });
          const sorted = selIds.map((id) => engine.getLayerById?.(id)).filter(Boolean)
            .sort((a, b) => engine.layers.indexOf(a) - engine.layers.indexOf(b));
          const topL = sorted[0];
          const maskOk = topL && (topL.maskCapabilities?.canSource || topL.isGroup);
          const selectedLayers = selIds.map((id) => engine.getLayerById?.(id)).filter(Boolean);
          const anyVisible = selectedLayers.some((l) => l.visible);
          const anyLocked = selIds.some((id) => this.layerLockedIds.has(id));
          const hasCollapsedGroup = selectedLayers.some((l) => l.isGroup && l.groupCollapsed);
          cmds.appendChild(mkCb('',
            () => anyVisible ? this._LVL_I.eyeOff() : this._LVL_I.eye(),
            anyVisible ? 'Hide selected' : 'Show selected',
            () => this._lvlToggleVisibilitySel(anyVisible)));
          cmds.appendChild(mkCb('',
            () => anyLocked ? this._LVL_I.lockOpen() : this._LVL_I.lock(),
            anyLocked ? 'Unlock selected' : 'Lock selected',
            () => this._lvlToggleLockSel(!anyLocked)));
          cmds.appendChild(mkCb('', () => this._LVL_I.grpPlus(), 'Group selected (⌘G)', () => this._lvlGroupSel()));
          if (hasGrp || hasGroupedChildren) cmds.appendChild(mkCb('', () => this._LVL_I.ungroup(),
            hasGrp ? 'Ungroup selected (⌘⇧G)' : 'Move out of group (⌘⇧G)',
            () => this._lvlUngroupSel()));
          cmds.appendChild(mkCb('mask-btn' + (maskOk ? '' : ' ineligible'), () => this._LVL_I.maskSrc(),
            maskOk ? 'Create clipping mask group' : 'Top layer must be a clip-eligible layer',
            maskOk ? () => this._lvlMaskSelGroup() : () => {}));
          const expBtn = mkCb('', () => this._LVL_I.expand(),
            hasCollapsedGroup ? 'Expand selected groups' : 'No collapsed groups in selection',
            () => this._lvlExpandSel());
          if (!hasCollapsedGroup) expBtn.disabled = true;
          cmds.appendChild(expBtn);
          cmds.appendChild(mkCb('', () => this._LVL_I.dup(), 'Duplicate selected (⌘D)', () => this._lvlDupSel()));
          cmds.appendChild(mkCb('del', () => this._LVL_I.trash(), 'Delete selected (⌫)', () => this._lvlDelSel()));
          bar.appendChild(cmds);
          const sp = document.createElement('div'); sp.className = 'lvl-sb-spacer'; bar.appendChild(sp);
          const tot = document.createElement('span'); tot.className = 'lvl-sb-total';
          tot.textContent = allLayers.length + ' total'; bar.appendChild(tot);
        } else {
          const idle = document.createElement('span'); idle.className = 'lvl-sb-idle';
          idle.textContent = allLayers.length + ' layers'; bar.appendChild(idle);
        }
      };

      // ── Render ──────────────────────────────────────────────────
      _lvlBuildChildren(null, list);
      list.classList.toggle('lvl-list-multi', (renderer.selectedLayerIds?.size ?? 0) > 1);
      _lvlBuildStatusBar();

      // Phase 4: empty-state illustration when there are no layers.
      // Uses the LegacyLite EmptyState primitive composed via UI.EmptyStates.
      if (allLayers.length === 0) {
        const ES = UI.EmptyStates;
        if (ES && typeof ES.attach === 'function') {
          try {
            const wrapper = document.createElement('div');
            wrapper.className = 'lvl-empty-state-wrap';
            wrapper.style.cssText = 'padding: 8px 4px;';
            list.appendChild(wrapper);
            ES.attach(wrapper, {
              kind: 'layers',
              title: 'No layers yet',
              message: 'Add an algorithm to begin sketching.',
            });
          } catch (_) { /* noop */ }
        }
      }

      this.layerListOrder = _lvlFlatOrder();
      this.updateLightSourceTool();
      if (SETTINGS.autoColorization?.enabled && !this.isApplyingAutoColorization) {
        this.applyAutoColorization({ commit: false, skipLayerRender: true });
      }
  }

  function assignLayersToRoot(targetLayers, options = {}) {
    const layers = (targetLayers || []).filter((layer) => layer);
    if (!layers.length) return [];
    const { nextEngineOrder = null, selectAssigned = false, primaryId = null, captureHistory = false } = options;
    const moveIds = layers.map((layer) => layer.id);
    if (captureHistory && this.app.pushHistory) this.app.pushHistory();
    const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
    moveIds.forEach((id) => {
      const layer = map.get(id);
      if (layer) layer.parentId = null;
    });
    if (Array.isArray(nextEngineOrder) && nextEngineOrder.length) {
      const reordered = nextEngineOrder.map((id) => map.get(id)).filter(Boolean);
      this.app.engine.reorderLayers(reordered);
    }
    this.normalizeGroupOrder();
    this.app.computeDisplayGeometry();

    if (selectAssigned) {
      const ids = moveIds.slice();
      const nextPrimary = ids.includes(primaryId) ? primaryId : ids[ids.length - 1] || null;
      this.app.setSelection(ids, nextPrimary);
      this.app.engine.setActiveLayerId(nextPrimary || null);
    }

    return moveIds.map((id) => map.get(id)).filter(Boolean);
  }

  function groupSelection() {
    const { SETTINGS, Layer } = requireDeps('groupSelection');
    const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []).filter((id) => {
      const layer = this.getLayerById(id);
      return layer && !layer.isGroup;
    });
    if (selectedIds.length < 2) return;
    if (!Layer) return;
    if (this.app.pushHistory) this.app.pushHistory();
    const layers = this.app.engine.layers;
    const selectedSet = new Set(selectedIds);
    const selectedLayers = layers.filter((layer) => selectedSet.has(layer.id));
    const maxIndex = Math.max(...selectedLayers.map((layer) => layers.indexOf(layer)));
    SETTINGS.globalLayerCount++;
    const groupId = Math.random().toString(36).slice(2, 11);
    const group = new Layer(groupId, 'group', this.getUniqueLayerName('Group', groupId));
    group.isGroup = true;
    group.groupType = 'group';
    group.groupCollapsed = false;
    group.visible = true;
    const primary = selectedLayers[0];
    if (primary) {
      group.penId = primary.penId;
      group.color = primary.color;
      group.strokeWidth = primary.strokeWidth;
      group.lineCap = primary.lineCap;
    }

    const oldParents = new Set();
    selectedLayers.forEach((layer) => {
      if (layer.parentId) oldParents.add(layer.parentId);
      layer.parentId = groupId;
      if (group.penId) {
        layer.penId = group.penId;
        layer.color = group.color;
        layer.strokeWidth = group.strokeWidth;
        layer.lineCap = group.lineCap;
      }
    });

    layers.splice(maxIndex + 1, 0, group);

    oldParents.forEach((parentId) => {
      // Only auto-remove orphaned group containers, never regular layers that were
      // parents via the mask relationship (those get moved into the group themselves).
      const parentLayer = layers.find((layer) => layer.id === parentId);
      if (!parentLayer?.isGroup) return;
      const stillHas = layers.some((layer) => layer.parentId === parentId);
      if (!stillHas) {
        const idx = layers.findIndex((layer) => layer.id === parentId);
        if (idx >= 0) layers.splice(idx, 1);
      }
    });

    this.normalizeGroupOrder();
    if (this.app.renderer) this.app.renderer.setSelection([groupId, ...selectedIds], groupId);
    this.app.engine.activeLayerId = groupId;
    this.renderLayers();
    this.app.render();
  }

  function ungroupSelection() {
    const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []);
    if (!selectedIds.length) return;
    const layers = this.app.engine.layers;
    const groupsToDissolve = new Set();
    const childrenToExtract = [];
    selectedIds.forEach((id) => {
      const layer = this.getLayerById(id);
      if (!layer) return;
      if (layer.isGroup && layer.groupType === 'group') {
        groupsToDissolve.add(layer.id);
      } else if (layer.parentId) {
        childrenToExtract.push(layer);
      }
    });
    if (!groupsToDissolve.size && !childrenToExtract.length) return;
    if (this.app.pushHistory) this.app.pushHistory();
    groupsToDissolve.forEach((groupId) => {
      const group = this.getLayerById(groupId);
      const dest = group?.parentId ?? null;
      layers.forEach((l) => { if (l.parentId === groupId) l.parentId = dest; });
      const idx = layers.findIndex((l) => l.id === groupId);
      if (idx >= 0) layers.splice(idx, 1);
    });
    const byGroup = new Map();
    childrenToExtract.forEach((l) => {
      if (groupsToDissolve.has(l.parentId)) return;
      if (!byGroup.has(l.parentId)) byGroup.set(l.parentId, []);
      byGroup.get(l.parentId).push(l);
    });
    byGroup.forEach((movers, groupId) => {
      const group = this.getLayerById(groupId);
      const dest = group?.parentId ?? null;
      movers.forEach((l) => { l.parentId = dest; });
      const remaining = layers.filter((l) => l.parentId === groupId);
      if (!remaining.length) {
        const idx = layers.findIndex((l) => l.id === groupId);
        if (idx >= 0) layers.splice(idx, 1);
      }
    });
    this.normalizeGroupOrder();
    this.renderLayers();
    this.app.render();
  }

  // Bake paint-bucket fills on `layer` into a sibling group via
  // PaintBucketOps.expandFill. Wired to the layer-card "Expand into group"
  // button when `layer.fills[]` is non-empty.
  function _lvlExpandFill(layer) {
    if (!layer || !Array.isArray(layer.fills) || !layer.fills.length) return;
    const engine = this.app?.engine;
    if (!engine) return;
    const PBO = Vectura.PaintBucketOps;
    if (!PBO?.expandFill) return;
    this.app.renderer?.commitActiveBatch?.();
    if (this.app.pushHistory) this.app.pushHistory();
    const result = PBO.expandFill(engine, layer);
    if (!result) return;
    this.app.setSelection?.([result.groupId], result.groupId);
    engine.setActiveLayerId?.(result.groupId);
    this.app.paintBucketPanel?.updateExpandButton?.();
    this.renderLayers();
    this.app.render?.();
  }

  // Explode a baked fill layer (output of expandFill) into a group of
  // one-path-per-layer children. Wired to the layer-card button shown on
  // baked fill layers (those carrying `sourceFillRecord`).
  function _lvlExplodeFill(layer) {
    if (!layer || !Array.isArray(layer.paths) || !layer.paths.length) return;
    const engine = this.app?.engine;
    if (!engine) return;
    const PBO = Vectura.PaintBucketOps;
    if (!PBO?.explodeFillLayer) return;
    this.app.renderer?.commitActiveBatch?.();
    if (this.app.pushHistory) this.app.pushHistory();
    const result = PBO.explodeFillLayer(engine, layer);
    if (!result) return;
    this.app.setSelection?.([result.groupId], result.groupId);
    engine.setActiveLayerId?.(result.groupId);
    this.renderLayers();
    this.app.render?.();
  }

  function _lvlGroupSel() {
      const renderer = this.app.renderer;
      const ids = [...(renderer?.selectedLayerIds || [])];
      if (ids.length < 2) return;
      const allLayers = this.app.engine.layers;
      const parents = new Set(ids.map((id) => allLayers.find((l) => l.id === id)?.parentId ?? null));
      if (parents.size > 1) return;
      if (this.app.pushHistory) this.app.pushHistory();
      const parentId = [...parents][0];
      const minIdx = Math.min(...allLayers
        .filter((l) => (l.parentId ?? null) === parentId && ids.includes(l.id))
        .map((l) => allLayers.indexOf(l)));
      const gid = 'g' + Date.now();
      allLayers.splice(minIdx, 0, {
        id: gid, name: this.getUniqueLayerName('Group', gid), isGroup: true, groupType: null,
        visible: true, groupCollapsed: false, parentId: parentId ?? null,
      });
      ids.forEach((id) => {
        const l = allLayers.find((x) => x.id === id);
        if (l) l.parentId = gid;
      });
      renderer.setSelection([gid], gid);
      this.renderLayers();
      this.app.render();
    }

    function _lvlUngroupSel() {
      this.ungroupSelection();
    }

    function _lvlDelSel() {
      if (this.app.pushHistory) this.app.pushHistory();
      const ids = [...(this.app.renderer?.selectedLayerIds || [])];
      [...ids].reverse().forEach((id) => {
        this.unlockMirrorChildrenOnDelete(id);
        this.app.engine.removeLayer(id);
      });
      this.renderLayers();
      this.app.render();
    }

    function _lvlDupSel() {
      if (this.app.pushHistory) this.app.pushHistory();
      [...(this.app.renderer?.selectedLayerIds || [])].forEach((id) => this.app.engine.duplicateLayer(id));
      this.renderLayers();
      this.app.render();
    }

    function _lvlExpandSel() {
      let any = false;
      [...(this.app.renderer?.selectedLayerIds || [])].forEach((id) => {
        const l = this.app.engine.getLayerById?.(id);
        if (l?.isGroup && l.groupCollapsed) { l.groupCollapsed = false; any = true; }
      });
      if (any) this.renderLayers();
    }

    function _lvlToggleVisibilitySel(hide) {
      const engine = this.app.engine;
      if (this.app.pushHistory) this.app.pushHistory();
      const newVis = !hide;
      [...(this.app.renderer?.selectedLayerIds || [])].forEach((id) => {
        const l = engine.getLayerById?.(id);
        if (l) l.visible = newVis;
      });
      engine.computeAllDisplayGeometry?.();
      this.app.render();
      this.renderLayers();
    }

    function _lvlToggleLockSel(lock) {
      const selIds = [...(this.app.renderer?.selectedLayerIds || [])];
      selIds.forEach((id) => lock ? this.layerLockedIds.add(id) : this.layerLockedIds.delete(id));
      this.renderLayers();
    }

    function _lvlMaskSelGroup() {
      const engine = this.app.engine;
      const renderer = this.app.renderer;
      const sel = [...(renderer?.selectedLayerIds || [])];
      const sorted = sel.map((id) => engine.getLayerById?.(id)).filter(Boolean)
        .sort((a, b) => engine.layers.indexOf(a) - engine.layers.indexOf(b));
      if (sorted.length < 2) return;
      const topL = sorted[0];
      if (!topL.maskCapabilities?.canSource && !topL.isGroup) return;
      if (this.app.pushHistory) this.app.pushHistory();
      // Enable mask on topL and move remaining layers to be its children
      topL.mask = topL.mask || {};
      topL.mask.enabled = true;
      sorted.slice(1).forEach((l) => { l.parentId = topL.id; });
      engine.computeAllDisplayGeometry?.();
      renderer.setSelection([topL.id], topL.id);
      this.renderLayers(); this.app.render?.();
    }

  // Unit 1.8: createManualLayerFromPath — creates a shape layer from a
  // pen-tool path or primitive-shape commit. Receives either a raw point
  // array or a payload {path, anchors, closed, shape}.
  function createManualLayerFromPath(payload) {
    const { SETTINGS, Layer, clone } = requireDeps('createManualLayerFromPath');
    const path = Array.isArray(payload) ? payload : payload?.path;
    const anchors = Array.isArray(payload?.anchors) ? payload.anchors : null;
    const closed = Boolean(payload?.closed);
    if (!Layer || !Array.isArray(path) || path.length < 2) return;
    if (this.app.pushHistory) this.app.pushHistory();
    const engine = this.app.engine;
    SETTINGS.globalLayerCount++;
    const id = Math.random().toString(36).slice(2, 11);
    const shapeType = payload?.shape?.type || null;
    const shapeTypeMap = { oval: 'shape', rect: 'shape', polygon: 'shape' };
    const layerType = shapeTypeMap[shapeType] || 'shape';
    const layer = new Layer(id, layerType, '');
    const active = engine.getActiveLayer ? engine.getActiveLayer() : null;
    const inheritsCurves = !shapeType;
    const shapeUsesCurves = shapeType === 'oval';
    layer.params.seed = 0;
    layer.params.posX = 0;
    layer.params.posY = 0;
    layer.params.scaleX = 1;
    layer.params.scaleY = 1;
    layer.params.rotation = 0;
    layer.params.curves = inheritsCurves ? false : shapeUsesCurves;
    layer.params.smoothing = 0;
    layer.params.simplify = 0;
    const activeParent = active?.parentId ? engine.getLayerById(active.parentId) : null;
    layer.parentId = (active?.isGroup && active?.groupType === 'layer')
      ? active.id
      : (activeParent?.groupType === 'group' ? active.parentId : null);
    if (active) {
      layer.penId = active.penId;
      layer.color = active.color;
      layer.strokeWidth = active.strokeWidth;
      layer.lineCap = active.lineCap;
    }
    const cloned = path.map((pt) => ({ x: pt.x, y: pt.y }));
    if (path.meta) {
      cloned.meta = clone(path.meta);
    }
    if (anchors && anchors.length >= 2) {
      cloned.meta = {
        ...(cloned.meta || {}),
        anchors: anchors.map((anchor) => ({
          x: anchor.x,
          y: anchor.y,
          in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
          out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
        })),
        closed,
      };
    }
    if (shapeType) {
      const shapeLabelMap = { rect: 'Rectangle', oval: 'Oval', polygon: 'Polygon' };
      layer.name = this.getUniqueLayerName(shapeLabelMap[shapeType] || 'Shape', id);
    } else {
      layer.name = this.getUniqueLayerName('Pen Path', id);
    }
    layer.sourcePaths = [cloned];
    const idx = engine.layers.findIndex((l) => l.id === engine.activeLayerId);
    const insertIndex = idx >= 0 ? idx + 1 : engine.layers.length;
    engine.layers.splice(insertIndex, 0, layer);
    engine.activeLayerId = id;
    engine.generate(id);
    if (this.app.renderer) this.app.renderer.setSelection([id], id);
    this.renderLayers();
    this.buildControls();
    this.updateFormula();
    this.app.render();
  }

  /**
   * Meridian Unit 1.9b (2026-05-20): grouped installer for the layer-list
   * buttons and the layer-bar palette picker. Previously these listeners
   * lived inlined in `_ui-legacy.js`'s `bindGlobal()`.
   *
   * Element scope: `btn-add-layer`, `btn-insert-mirror-modifier`,
   * `btn-group-layers`, `btn-ungroup-layers`, `btn-undo`, `btn-redo`,
   * `layer-bar-palette-trigger`/`-menu`/`-name`/`-preview`. `this` is the
   * legacy UI instance — handlers reach for `this.app`, `this.renderLayers`,
   * `this.getPreferredNewLayerType`, `this.rememberDrawableLayerType`,
   * `this.getLayerById`, `this.isModifierLayer`, `this.assignLayersToParent`,
   * `this.groupSelection`, `this.ungroupSelection`, `this.insertMirrorModifier`,
   * `this._refreshAlgoSubmenuColors`, `this._refreshAlgoPickerColors`,
   * `this._syncModuleDisplay` via the prototype.
   */
  function bindLayerListListeners() {
    const { SETTINGS, getEl } = requireDeps('bindLayerListListeners');
    const addLayer = getEl('btn-add-layer');
    const insertMirrorModifier = getEl('btn-insert-mirror-modifier');
    const moduleSelect = getEl('generator-module');
    const btnUndo = getEl('btn-undo', { silent: true });
    const btnRedo = getEl('btn-redo', { silent: true });
    const btnGroupLayers = getEl('btn-group-layers');
    const btnUngroupLayers = getEl('btn-ungroup-layers');

    if (addLayer && moduleSelect) {
      addLayer.onclick = () => {
        const activeLayer = this.app.engine.getActiveLayer?.();
        const selectedModifier = this.isModifierLayer(activeLayer) ? activeLayer : null;
        const t = selectedModifier ? this.getPreferredNewLayerType() : this.getPreferredNewLayerType();
        if (this.app.pushHistory) this.app.pushHistory();
        const id = this.app.engine.addLayer(t);
        const createdLayer = this.getLayerById(id);
        this.rememberDrawableLayerType(createdLayer || t);
        if (selectedModifier && createdLayer) {
          this.assignLayersToParent(selectedModifier.id, [createdLayer], {
            selectAssigned: true,
            primaryId: id,
          });
        } else if (this.app.renderer) {
          this.app.renderer.setSelection([id], id);
        }
        this.renderLayers();
        this.app.render();
      };
    }
    if (btnUndo) {
      btnUndo.onclick = () => { if (this.app.undo) this.app.undo(); };
    }
    if (btnRedo) {
      btnRedo.onclick = () => { if (this.app.redo) this.app.redo(); };
    }
    if (btnGroupLayers) btnGroupLayers.onclick = () => this.groupSelection();
    if (btnUngroupLayers) btnUngroupLayers.onclick = () => this.ungroupSelection();
    if (insertMirrorModifier) {
      insertMirrorModifier.onclick = () => {
        this.insertMirrorModifier();
      };
    }

    // ── Layer bar color palette picker ──────────────────────────────
    const _updateSectBars = (p) => {
      const panel = document.getElementById('settings-panel');
      if (!panel) return;
      const preview = p?.preview || [];
      if (!preview.length) return;
      panel.querySelectorAll('[class*="sect--color-"]').forEach((sect, i) => {
        sect.style.setProperty('--sect-bar', preview[i % preview.length]);
      });
    };

    const _updateLBPTrigger = () => {
      const pid = SETTINGS.layerBarPaletteId || 'prism';
      const palettes = window.Vectura.LAYER_PALETTES || [];
      const p = palettes.find(x => x.id === pid);
      const nameEl = getEl('layer-bar-palette-name', { silent: true });
      const previewEl = getEl('layer-bar-palette-preview', { silent: true });
      if (nameEl) nameEl.textContent = p?.name || pid;
      if (previewEl) {
        previewEl.innerHTML = '';
        (p?.preview || []).forEach(hex => {
          const s = document.createElement('span');
          s.className = 'palette-swatch'; s.style.background = hex;
          previewEl.appendChild(s);
        });
      }
      _updateSectBars(p);
    };

    const _buildLBPMenu = () => {
      const menu = getEl('layer-bar-palette-menu', { silent: true });
      if (!menu) return;
      const palettes = window.Vectura.LAYER_PALETTES || [];
      const activePid = SETTINGS.layerBarPaletteId || 'prism';
      menu.innerHTML = '';
      palettes.forEach(p => {
        const row = document.createElement('div');
        row.className = 'palette-picker-row' + (p.id === activePid ? ' is-active' : '');
        const lbl = document.createElement('span');
        lbl.className = 'palette-picker-label'; lbl.textContent = p.name;
        row.appendChild(lbl);
        if (p.preview) {
          const sw = document.createElement('div'); sw.className = 'palette-picker-swatches';
          p.preview.forEach(hex => {
            const s = document.createElement('span');
            s.className = 'palette-swatch'; s.style.background = hex;
            sw.appendChild(s);
          });
          row.appendChild(sw);
        } else {
          const note = document.createElement('span');
          note.className = 'palette-picker-note'; note.textContent = 'uses pen color';
          row.appendChild(note);
        }
        row.addEventListener('click', () => {
          SETTINGS.layerBarPaletteId = p.id;
          this.app.persistPreferencesDebounced?.();
          _updateLBPTrigger();
          _buildLBPMenu();
          menu.classList.add('hidden');
          this.renderLayers?.();
          this._refreshAlgoSubmenuColors?.();
          this._refreshAlgoPickerColors?.();
          this._syncModuleDisplay?.();
        });
        menu.appendChild(row);
      });
    };

    const lbpTrigger = getEl('layer-bar-palette-trigger', { silent: true });
    if (lbpTrigger) {
      lbpTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const menu = getEl('layer-bar-palette-menu', { silent: true });
        if (!menu) return;
        const opening = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !opening);
        if (opening) _buildLBPMenu();
      });
    }
    document.addEventListener('click', () => {
      getEl('layer-bar-palette-menu', { silent: true })?.classList.add('hidden');
    });
    _updateLBPTrigger();
  }

  // ── Meridian Unit 1.9c (2026-05-20) ─────────────────────────────────
  // Layer-state methods migrated out of the `class UI { ... }` body in
  // `src/ui/_ui-legacy.js`. All preserve their original `this`-based
  // signature so callers keep using `this.<name>(...)` on the UI instance.
  // Reach into LAYER_PALETTES / Modifiers via window.Vectura at call time
  // (no DI bag entries needed beyond what `bind()` already injects).

  function isDuplicateLayerName(name, excludeId) {
    const normalized = name.trim().toLowerCase();
    return this.app.engine.layers.some(
      (layer) => layer.id !== excludeId && layer.name.trim().toLowerCase() === normalized
    );
  }

  function getLayerById(id) {
    return this.app.engine.layers.find((layer) => layer.id === id) || null;
  }

  function isModifierLayerMethod(layer) {
    const fn = (G.Vectura && G.Vectura.Modifiers && G.Vectura.Modifiers.isModifierLayer) || (() => false);
    return fn(layer);
  }

  function getModifierState(layer) {
    if (!this.isModifierLayer(layer)) return null;
    const Modifiers = (G.Vectura && G.Vectura.Modifiers) || {};
    const createModifierState = Modifiers.createModifierState
      || ((type) => ({ type, enabled: true, guidesVisible: true, guidesLocked: false, mirrors: [] }));
    const createMirrorLine = Modifiers.createMirrorLine
      || ((index) => ({ id: `mirror-${index + 1}`, enabled: true }));
    if (!layer.modifier) {
      layer.modifier = createModifierState('mirror', {
        mirrors: [createMirrorLine(0)],
      });
    }
    if (!Array.isArray(layer.modifier.mirrors)) layer.modifier.mirrors = [];
    if (layer.modifier.guidesVisible === undefined) layer.modifier.guidesVisible = true;
    if (layer.modifier.guidesLocked === undefined) layer.modifier.guidesLocked = false;
    if (layer.modifier.enabled === undefined) layer.modifier.enabled = true;
    return layer.modifier;
  }

  function assignLayersToParent(parentId, targetLayers, options = {}) {
    const layers = (targetLayers || []).filter((layer) => layer && layer.id !== parentId);
    if (!layers.length) return [];
    const { selectAssigned = false, primaryId = null, captureHistory = false } = options;
    const parent = this.getLayerById(parentId);
    if (!parent || !this.canLayerAcceptChildren(parent)) return [];
    const moveIds = layers
      .filter((layer) => !(layer.isGroup && this.isDescendant(parentId, layer.id)))
      .map((layer) => layer.id);
    if (!moveIds.length) return [];

    if (captureHistory && this.app.pushHistory) this.app.pushHistory();
    if (parent.isGroup) parent.groupCollapsed = false;
    const moveSet = new Set(moveIds);
    const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
    const remaining = this.app.engine.layers.filter((layer) => !moveSet.has(layer.id));
    moveIds.forEach((id) => {
      const layer = map.get(id);
      if (layer) layer.parentId = parentId;
    });
    const insertIndex = remaining.findIndex((layer) => layer.id === parentId);
    const engineInsert = insertIndex === -1 ? remaining.length : insertIndex;
    const moveEngineOrder = moveIds.slice().reverse().map((id) => map.get(id)).filter(Boolean);
    remaining.splice(engineInsert, 0, ...moveEngineOrder);
    this.app.engine.reorderLayers(remaining);
    this.normalizeGroupOrder();
    this.app.computeDisplayGeometry();

    if (this.isModifierLayer(parent) && parent.modifier?.type === 'mirror') {
      moveIds.forEach((id) => this.layerLockedIds.add(id));
    }

    if (selectAssigned) {
      const ids = moveIds.slice();
      const nextPrimary = ids.includes(primaryId) ? primaryId : ids[ids.length - 1] || parentId;
      this.app.setSelection(ids.length ? ids : [parentId], nextPrimary);
      this.app.engine.setActiveLayerId(nextPrimary || parentId || null);
    }

    return moveIds.map((id) => map.get(id)).filter(Boolean);
  }

  function unlockMirrorChildrenOnDelete(layerId) {
    const engine = this.app?.engine;
    if (!engine || !this.layerLockedIds) return;
    const layer = engine.layers.find((l) => l.id === layerId);
    if (!layer || !this.isModifierLayer(layer) || layer.modifier?.type !== 'mirror') return;
    const cascade = (pid) => {
      engine.layers.filter((l) => l.parentId === pid).forEach((c) => {
        this.layerLockedIds.delete(c.id);
        cascade(c.id);
      });
    };
    cascade(layerId);
  }

  function shouldLeaveParentScope(layer, prevId, nextId, selectedIds = new Set()) {
    if (!layer?.parentId || selectedIds.has(layer.parentId)) return false;
    const prevLayer = prevId ? this.getLayerById(prevId) : null;
    const nextLayer = nextId ? this.getLayerById(nextId) : null;
    const previousMatchesParent = prevId === layer.parentId || prevLayer?.parentId === layer.parentId;
    const nextMatchesParent = nextLayer?.parentId === layer.parentId;
    return !(previousMatchesParent || nextMatchesParent);
  }

  function isDescendant(targetId, ancestorId) {
    let current = this.getLayerById(targetId);
    while (current && current.parentId) {
      if (current.parentId === ancestorId) return true;
      current = this.getLayerById(current.parentId);
    }
    return false;
  }

  function normalizeGroupOrder() {
    const layers = this.app.engine.layers;
    const parents = layers.filter((layer) => this.canLayerAcceptChildren(layer));
    const parentIds = new Set(parents.map((parent) => parent.id));
    const childrenMap = new Map();
    layers.forEach((layer) => {
      if (layer.parentId && parentIds.has(layer.parentId)) {
        if (!childrenMap.has(layer.parentId)) childrenMap.set(layer.parentId, []);
        childrenMap.get(layer.parentId).push(layer);
      }
    });
    const getDescendants = (parentId) => {
      const children = childrenMap.get(parentId) || [];
      const ids = [];
      children.forEach((child) => {
        ids.push(child.id);
        if (parentIds.has(child.id)) ids.push(...getDescendants(child.id));
      });
      return ids;
    };
    parents.forEach((parent) => {
      const descendantIds = getDescendants(parent.id);
      if (!descendantIds.length) return;
      const childIndexes = descendantIds
        .map((id) => layers.findIndex((layer) => layer.id === id))
        .filter((idx) => idx >= 0);
      if (!childIndexes.length) return;
      const maxIndex = Math.max(...childIndexes);
      const currentIndex = layers.findIndex((layer) => layer.id === parent.id);
      if (currentIndex === -1) return;
      if (currentIndex === maxIndex + 1) return;
      const [movedParent] = layers.splice(currentIndex, 1);
      const insertIndex = Math.min(maxIndex + 1, layers.length);
      layers.splice(insertIndex, 0, movedParent || parent);
    });
  }

  function moveSelectedLayers(direction) {
    const selectedIds = Array.from(this.app.renderer?.selectedLayerIds || []).filter((id) => {
      const layer = this.getLayerById(id);
      return layer && !layer.isGroup;
    });
    if (!selectedIds.length) return false;
    const order = this.app.engine.layers.map((layer) => layer.id);
    const selected = new Set(selectedIds);
    const beforeOrder = order.slice();
    if (direction === 'top' || direction === 'bottom') {
      const keep = order.filter((id) => !selected.has(id));
      const moving = order.filter((id) => selected.has(id));
      const next = direction === 'top' ? [...keep, ...moving] : [...moving, ...keep];
      const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
      this.app.engine.layers = next.map((id) => map.get(id)).filter(Boolean);
    } else if (direction === 'up') {
      for (let i = order.length - 2; i >= 0; i--) {
        if (selected.has(order[i]) && !selected.has(order[i + 1])) {
          [order[i], order[i + 1]] = [order[i + 1], order[i]];
        }
      }
      const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
      this.app.engine.layers = order.map((id) => map.get(id)).filter(Boolean);
    } else if (direction === 'down') {
      for (let i = 1; i < order.length; i++) {
        if (selected.has(order[i]) && !selected.has(order[i - 1])) {
          [order[i - 1], order[i]] = [order[i], order[i - 1]];
        }
      }
      const map = new Map(this.app.engine.layers.map((layer) => [layer.id, layer]));
      this.app.engine.layers = order.map((id) => map.get(id)).filter(Boolean);
    }
    const changed = beforeOrder.some((id, index) => id !== this.app.engine.layers[index]?.id);
    if (!changed) return false;
    this.normalizeGroupOrder();
    this.renderLayers();
    this.app.render();
    const scrollTargetId = this.app.renderer?.selectedLayerId || selectedIds[selectedIds.length - 1] || null;
    if (scrollTargetId) {
      window.requestAnimationFrame(() => this.scrollLayerToTop(scrollTargetId));
    }
    return true;
  }

  function duplicateLayers(targetLayers, options = {}) {
    const { select = true } = options;
    const targets = targetLayers || [];
    if (!targets.length) return [];
    if (this.app.pushHistory) this.app.pushHistory();

    const targetIds = new Set(targets.map(l => l.id));
    const filteredTargets = targets.filter((layer) => {
      let pId = layer.parentId;
      while (pId) {
        if (targetIds.has(pId)) return false;
        const pLayer = this.app.engine.layers.find(l => l.id === pId);
        pId = pLayer ? pLayer.parentId : null;
      }
      return true;
    });

    const order = this.app.engine.layers.map((layer) => layer.id);
    const sorted = filteredTargets
      .slice()
      .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

    const duplicates = [];
    const duplicateDescendants = [];
    sorted.forEach((layer) => {
      const dup = this.app.engine.duplicateLayer(layer.id);
      if (dup) {
        duplicates.push(dup);
        if (dup.isGroup) {
          const getDesc = (pid) => {
            const out = [];
            this.app.engine.layers.forEach(l => {
              if (l.parentId === pid) {
                out.push(l);
                out.push(...getDesc(l.id));
              }
            });
            return out;
          };
          duplicateDescendants.push(...getDesc(dup.id));
        }
      }
    });

    const allDups = [...duplicates, ...duplicateDescendants];
    if (allDups.length && select && this.app.renderer) {
      const ids = allDups.map((layer) => layer.id);
      const nonGroupIds = allDups.filter(l => !l.isGroup).map(l => l.id);
      const primary = nonGroupIds[nonGroupIds.length - 1] || ids[ids.length - 1] || null;
      this.app.renderer.setSelection(ids, primary);
    }
    this.renderLayers();
    this.buildControls();
    this.app.render();
    return duplicates;
  }

  function getLayerChildren(layerId) {
    return (this.app.engine.layers || []).filter((layer) => layer?.parentId === layerId);
  }

  function getLayerDescendants(layerId) {
    const out = [];
    const visit = (parentId) => {
      this.getLayerChildren(parentId).forEach((child) => {
        out.push(child);
        visit(child.id);
      });
    };
    visit(layerId);
    return out;
  }

  function canLayerAcceptChildren(layer) {
    if (!layer) return false;
    if (layer.isGroup) return true;
    return Boolean(layer.maskCapabilities?.canSource);
  }

  function getUniqueLayerName(base, excludeId) {
    const clean = base.trim() || 'Layer';
    if (!this.isDuplicateLayerName(clean, excludeId)) return clean;
    let count = 2;
    let next = `${clean} ${count}`;
    while (this.isDuplicateLayerName(next, excludeId)) {
      count += 1;
      next = `${clean} ${count}`;
    }
    return next;
  }

  function recenterLayerIfNeeded(layer) {
    const SETTINGS = (G.Vectura && G.Vectura.SETTINGS) || {};
    if (!layer || !this.app.renderer) return;
    const bounds = this.app.renderer.getLayerBounds(layer);
    if (!bounds) return;
    const prof = this.app.engine.currentProfile;
    const inset = SETTINGS.truncate ? SETTINGS.margin : 0;
    const limitLeft = inset;
    const limitRight = prof.width - inset;
    const limitTop = inset;
    const limitBottom = prof.height - inset;
    const corners = Object.values(bounds.corners || {});
    if (!corners.length) return;
    const minX = Math.min(...corners.map((pt) => pt.x));
    const maxX = Math.max(...corners.map((pt) => pt.x));
    const minY = Math.min(...corners.map((pt) => pt.y));
    const maxY = Math.max(...corners.map((pt) => pt.y));
    const boundsW = maxX - minX;
    const boundsH = maxY - minY;
    const availableW = limitRight - limitLeft;
    const availableH = limitBottom - limitTop;
    let shiftX = 0;
    let shiftY = 0;

    if (boundsW > availableW) {
      shiftX = (limitLeft + limitRight) / 2 - (minX + maxX) / 2;
    } else {
      if (minX < limitLeft) shiftX = limitLeft - minX;
      if (maxX + shiftX > limitRight) shiftX = limitRight - maxX;
    }

    if (boundsH > availableH) {
      shiftY = (limitTop + limitBottom) / 2 - (minY + maxY) / 2;
    } else {
      if (minY < limitTop) shiftY = limitTop - minY;
      if (maxY + shiftY > limitBottom) shiftY = limitBottom - maxY;
    }

    if (Math.abs(shiftX) > 0.001 || Math.abs(shiftY) > 0.001) {
      layer.params.posX += shiftX;
      layer.params.posY += shiftY;
      G.Vectura?.PaintBucketOps?.translateLayerFills?.(layer, shiftX, shiftY);
      this.app.engine.generate(layer.id);
    }
  }

  function expandLayer(layer, options = {}) {
    const { Layer, clone } = requireDeps('expandLayer');
    if (!layer || layer.isGroup) return;
    // Local isPrimitiveShapeLayer (matches legacy IIFE-local predicate).
    const isPrimitive = (l) => {
      if (!l || l.isGroup) return false;
      if (l.type !== 'shape') return false;
      const meta = l.sourcePaths?.[0]?.meta;
      const t = meta?.shape?.type;
      return t === 'rect' || t === 'oval' || t === 'polygon';
    };
    if (isPrimitive(layer)) return;
    const isEffLocked = (id) => {
      if (this.layerLockedIds?.has(id)) return true;
      let l = this.app.engine.getLayerById?.(id);
      while (l?.parentId) {
        if (this.layerLockedIds?.has(l.parentId)) return true;
        l = this.app.engine.getLayerById?.(l.parentId);
      }
      return false;
    };
    if (isEffLocked(layer.id)) return;
    if (!Layer) return;
    const { skipHistory = false, returnChildren = false, suppressRender = false, selectChildren = true } = options;
    if (!skipHistory && this.app.pushHistory) this.app.pushHistory();
    if (!layer.paths || !layer.paths.length) {
      this.app.engine.generate(layer.id);
    }
    if (!layer.paths || !layer.paths.length) return;

    // Local clonePath (matches legacy IIFE-local helper).
    const clonePath = (path) => {
      if (!Array.isArray(path)) return path;
      const next = path.map((pt) => ({ ...pt }));
      if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
      return next;
    };

    const groupId = layer.id;
    const baseName = layer.name;
    const pad = String(layer.paths.length).length;
    const pathMeta = layer.paths.map((path, index) => {
      let minX = Infinity;
      let minY = Infinity;
      const metaGroup = path?.meta?.group;
      const metaLabel = path?.meta?.label;
      if (path && path.meta && path.meta.kind === 'circle') {
        const cx = path.meta.cx ?? path.meta.x ?? 0;
        const cy = path.meta.cy ?? path.meta.y ?? 0;
        const rx = path.meta.rx ?? path.meta.r ?? 0;
        const ry = path.meta.ry ?? path.meta.r ?? 0;
        minX = cx - rx;
        minY = cy - ry;
      } else if (Array.isArray(path)) {
        path.forEach((pt) => {
          if (!pt) return;
          minX = Math.min(minX, pt.x);
          minY = Math.min(minY, pt.y);
        });
      }
      if (!Number.isFinite(minX)) minX = 0;
      if (!Number.isFinite(minY)) minY = 0;
      return { path, index, minX, minY, group: metaGroup, label: metaLabel };
    });

    pathMeta.sort((a, b) => {
      if (a.minY !== b.minY) return a.minY - b.minY;
      if (a.minX !== b.minX) return a.minX - b.minX;
      return a.index - b.index;
    });

    const groupNodes = new Map();
    const children = pathMeta.map((entry, index) => {
      const newId = Math.random().toString(36).slice(2, 11);
      const child = new Layer(newId, 'shape', `${baseName} - Line ${String(index + 1).padStart(pad, '0')}`);
      child.parentId = groupId;
      child.params.seed = 0;
      child.params.posX = 0;
      child.params.posY = 0;
      child.params.scaleX = 1;
      child.params.scaleY = 1;
      child.params.rotation = 0;
      child.params.curves = Boolean(layer.params.curves);
      child.params.smoothing = 0;
      child.params.simplify = 0;
      child.sourcePaths = [clonePath(entry.path)];
      child.penId = layer.penId;
      child.color = layer.color;
      child.strokeWidth = layer.strokeWidth;
      child.lineCap = layer.lineCap;
      child.visible = layer.visible;
      if (entry.group) {
        let groupNode = groupNodes.get(entry.group);
        if (!groupNode) {
          const gId = Math.random().toString(36).slice(2, 11);
          groupNode = new Layer(gId, 'group', entry.group);
          groupNode.isGroup = true;
          groupNode.groupType = 'group';
          groupNode.groupCollapsed = false;
          groupNode.visible = layer.visible;
          groupNode.parentId = layer.id;
          groupNode.penId = layer.penId;
          groupNode.color = layer.color;
          groupNode.strokeWidth = layer.strokeWidth;
          groupNode.lineCap = layer.lineCap;
          groupNodes.set(entry.group, groupNode);
        }
        child.parentId = groupNode.id;
        if (entry.label) child.name = entry.label;
      } else if (entry.label) {
        child.name = entry.label;
      }
      return child;
    });

    layer.isGroup = true;
    layer.groupType = layer.type;
    layer.groupParams = clone(layer.params);
    layer.groupCollapsed = false;
    layer.type = 'group';
    layer.paths = [];
    layer.sourcePaths = null;
    layer.paramStates = {};
    // Groups are skipped by computeAllDisplayGeometry(), so cached geometry from
    // the pre-expansion type would otherwise be returned forever by getRenderablePaths().
    layer.effectivePaths = [];
    layer.displayPaths = [];
    layer.optimizedPaths = null;
    layer.effectiveStats = null;
    layer.displayStats = null;

    const idx = this.app.engine.layers.findIndex((l) => l.id === groupId);
    const orderedItems = [];
    const seenGroups = new Set();
    pathMeta.forEach((entry, idxInner) => {
      const child = children[idxInner];
      if (entry.group) {
        const groupNode = groupNodes.get(entry.group);
        if (groupNode && !seenGroups.has(groupNode.id)) {
          orderedItems.push(groupNode);
          seenGroups.add(groupNode.id);
        }
      }
      orderedItems.push(child);
    });
    const insertChildren = orderedItems.reverse();
    if (idx >= 0) {
      this.app.engine.layers.splice(idx + 1, 0, ...insertChildren);
    } else {
      this.app.engine.layers.push(...insertChildren);
    }

    children.forEach((child) => this.app.engine.generate(child.id));
    if (selectChildren) {
      this.app.engine.activeLayerId = layer.id;
      if (this.app.renderer) this.app.renderer.setSelection([layer.id], layer.id);
    }
    if (!suppressRender) {
      this.renderLayers();
      this.buildControls();
      this.updateFormula();
      this.app.render();
    }
    if (returnChildren) return children;
  }

  function getGroupDescendants(groupId) {
    const out = [];
    const walk = (id) => {
      this.app.engine.layers.forEach((layer) => {
        if (layer.parentId !== id) return;
        if (layer.isGroup) {
          walk(layer.id);
        } else {
          out.push(layer);
        }
      });
    };
    walk(groupId);
    return out;
  }

  // Wrapper around renderLayers that also re-attaches the layer right-click
  // context menu after each render. Was previously inlined as the legacy
  // `class UI` `renderLayers` method (which wrapped LayersPanel.renderLayers).
  // Now installed on UI.prototype as `renderLayers` so legacy is methodless.
  function renderLayersWithContextMenu() {
    const result = renderLayers.call(this);
    try {
      if (G.Vectura?.UI?.Menus?.LayerContext?.attach) {
        G.Vectura.UI.Menus.LayerContext.attach(this);
      }
    } catch (_) { /* missing menu module is non-fatal */ }
    return result;
  }

  UI.LayersPanel = {
    /**
     * Inject closure-captured legacy ui.js IIFE locals.
     * Idempotent. Called once from the legacy ui.js IIFE.
     * @param {object} deps - { SETTINGS, escapeHtml, Layer, clone, getEl }
     */
    bind(deps) {
      DEPS = deps;
    },
    renderLayers,
    assignLayersToRoot,
    groupSelection,
    ungroupSelection,
    createManualLayerFromPath,
    bindLayerListListeners,
    // ── Unit 1.9c: layer-state methods ────────────────────────────────
    recenterLayerIfNeeded,
    isDuplicateLayerName,
    getLayerById,
    isModifierLayer: isModifierLayerMethod,
    getModifierState,
    assignLayersToParent,
    unlockMirrorChildrenOnDelete,
    shouldLeaveParentScope,
    isDescendant,
    normalizeGroupOrder,
    moveSelectedLayers,
    duplicateLayers,
    getLayerChildren,
    getLayerDescendants,
    canLayerAcceptChildren,
    getUniqueLayerName,
    expandLayer,
    getGroupDescendants,
    installOn(proto) {
      proto.assignLayersToRoot = function(...args) { return assignLayersToRoot.apply(this, args); };
      proto.groupSelection = function(...args) { return groupSelection.apply(this, args); };
      proto.ungroupSelection = function(...args) { return ungroupSelection.apply(this, args); };
      proto._lvlExpandFill = function(...args) { return _lvlExpandFill.apply(this, args); };
      proto._lvlExplodeFill = function(...args) { return _lvlExplodeFill.apply(this, args); };
      proto._lvlGroupSel = function(...args) { return _lvlGroupSel.apply(this, args); };
      proto._lvlUngroupSel = function(...args) { return _lvlUngroupSel.apply(this, args); };
      proto._lvlDelSel = function(...args) { return _lvlDelSel.apply(this, args); };
      proto._lvlDupSel = function(...args) { return _lvlDupSel.apply(this, args); };
      proto._lvlExpandSel = function(...args) { return _lvlExpandSel.apply(this, args); };
      proto._lvlToggleVisibilitySel = function(...args) { return _lvlToggleVisibilitySel.apply(this, args); };
      proto._lvlToggleLockSel = function(...args) { return _lvlToggleLockSel.apply(this, args); };
      proto._lvlMaskSelGroup = function(...args) { return _lvlMaskSelGroup.apply(this, args); };
      proto.createManualLayerFromPath = function(payload) { return createManualLayerFromPath.call(this, payload); };
      proto.bindLayerListListeners = function() { return bindLayerListListeners.call(this); };
      // ── Unit 1.9c installers ────────────────────────────────────────
      // `renderLayers` wraps the panel's own renderLayers with the
      // layer-context-menu reattach — replaces the legacy class wrapper.
      proto.renderLayers = function() { return renderLayersWithContextMenu.call(this); };
      proto.recenterLayerIfNeeded = function(layer) { return recenterLayerIfNeeded.call(this, layer); };
      proto.isDuplicateLayerName = function(name, excludeId) { return isDuplicateLayerName.call(this, name, excludeId); };
      proto.getLayerById = function(id) { return getLayerById.call(this, id); };
      proto.isModifierLayer = function(layer) { return isModifierLayerMethod.call(this, layer); };
      proto.getModifierState = function(layer) { return getModifierState.call(this, layer); };
      proto.assignLayersToParent = function(...args) { return assignLayersToParent.apply(this, args); };
      proto.unlockMirrorChildrenOnDelete = function(layerId) { return unlockMirrorChildrenOnDelete.call(this, layerId); };
      proto.shouldLeaveParentScope = function(...args) { return shouldLeaveParentScope.apply(this, args); };
      proto.isDescendant = function(targetId, ancestorId) { return isDescendant.call(this, targetId, ancestorId); };
      proto.normalizeGroupOrder = function() { return normalizeGroupOrder.call(this); };
      proto.moveSelectedLayers = function(direction) { return moveSelectedLayers.call(this, direction); };
      proto.duplicateLayers = function(targetLayers, options) { return duplicateLayers.call(this, targetLayers, options); };
      proto.getLayerChildren = function(layerId) { return getLayerChildren.call(this, layerId); };
      proto.getLayerDescendants = function(layerId) { return getLayerDescendants.call(this, layerId); };
      proto.canLayerAcceptChildren = function(layer) { return canLayerAcceptChildren.call(this, layer); };
      proto.getUniqueLayerName = function(base, excludeId) { return getUniqueLayerName.call(this, base, excludeId); };
      proto.expandLayer = function(layer, options) { return expandLayer.call(this, layer, options); };
      proto.getGroupDescendants = function(groupId) { return getGroupDescendants.call(this, groupId); };
    },
  };
})();
