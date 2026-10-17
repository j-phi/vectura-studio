/*
 * Vectura Studio — PointerReorder (TUX-044).
 *
 * One pointer-event grip-reorder helper shared by every panel list (noise, effect, modifier,
 * shading, optimization, pens, mirror rows). Mouse, pen and finger take the same path.
 * pointercancel and an uncommitted lost capture ABORT: no callback, no history, no regen.
 *
 * Vectura.UI.PointerReorder.bind(grip, {
 *   container,        // element that holds the items
 *   itemSelector,     // CSS selector for the items inside container
 *   dragEl,           // the item that the grip moves
 *   indicatorClass,   // class for the drop indicator element
 *   onCommit(newIndex, startIndex), // called only when the index changed
 *   scroller,         // optional scroll container (default: nearest overflow-y ancestor)
 * }) -> { destroy }
 *
 * Phases are named (down / move / end / abort) so TUX-018's bindPointerDrag can adopt them.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const SLOP = 6;
  const EDGE = 48;
  const MAX_SPEED = 18;

  const findScroller = (el) => {
    let node = el && el.parentElement;
    while (node && node !== document.body && node !== document.documentElement) {
      const oy = getComputedStyle(node).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return null;
  };

  // Desktop placement rule, unchanged: the indicator goes before the first other item whose
  // vertical midpoint is below the pointer; otherwise it goes last.
  const placeIndicator = (container, itemSelector, dragEl, indicator, y) => {
    const items = Array.from(container.querySelectorAll(itemSelector)).filter((item) => item !== dragEl);
    for (const item of items) {
      const rect = item.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) {
        container.insertBefore(indicator, item);
        return;
      }
    }
    container.appendChild(indicator);
  };

  // Index the dragged item takes in the list WITHOUT itself. The legacy handlers counted the
  // dragged card too, so a downward drop landed one slot short and a plain click moved the item.
  const indexOfIndicator = (container, itemSelector, indicator, dragEl) => {
    const siblings = Array.from(container.children);
    const at = siblings.indexOf(indicator);
    return siblings.slice(0, at).filter((node) => node !== dragEl && node.matches(itemSelector)).length;
  };

  const bind = (grip, opts = {}) => {
    if (!grip) return { destroy() {} };
    const { container, itemSelector, dragEl, indicatorClass, onCommit } = opts;
    let active = null;

    const visibleRect = (scroller) => {
      const r = scroller.getBoundingClientRect();
      // Visual-viewport bounds come from KeyboardInset, the single reader (TUX-032).
      const ki = Vectura.KeyboardInset;
      const vr = ki && ki.viewportRect ? ki.viewportRect() : null;
      const top = Math.max(r.top, vr ? vr.offsetTop : 0);
      const bottom = Math.min(r.bottom, vr ? vr.offsetTop + vr.height : window.innerHeight);
      return { top, bottom };
    };

    const stopLoop = (s) => { if (s.raf) { cancelAnimationFrame(s.raf); s.raf = 0; } };

    const tick = (s) => {
      s.raf = 0;
      if (!s.lifted || active !== s) return;
      if (s.scroller) {
        const { top, bottom } = visibleRect(s.scroller);
        const edge = Math.min(EDGE, Math.max(24, (bottom - top) / 3));
        let dy = 0;
        if (s.lastY < top + edge) dy = -MAX_SPEED * Math.min(1, (top + edge - s.lastY) / edge);
        else if (s.lastY > bottom - edge) dy = MAX_SPEED * Math.min(1, (s.lastY - (bottom - edge)) / edge);
        if (dy) {
          s.scroller.scrollTop += dy;
          placeIndicator(container, itemSelector, dragEl, s.indicator, s.lastY);
        }
      }
      s.raf = requestAnimationFrame(() => tick(s));
    };

    const cleanup = (s) => {
      stopLoop(s);
      window.removeEventListener('pointermove', s.onMove);
      window.removeEventListener('pointerup', s.onUp);
      window.removeEventListener('pointercancel', s.onCancel);
      grip.removeEventListener('lostpointercapture', s.onLost);
      try { grip.releasePointerCapture(s.pointerId); } catch (_) {}
      if (s.indicator) s.indicator.remove();
      dragEl.classList.remove('dragging');
      if (s.drag) {
        if (s.prevDraggable === null) s.drag.removeAttribute('draggable');
        else s.drag.setAttribute('draggable', s.prevDraggable);
      }
      if (active === s) active = null;
    };

    // phase: move
    const move = (s, e) => {
      if (e.pointerId !== s.pointerId) return;
      s.lastY = e.clientY;
      if (!s.lifted) {
        if (Math.abs(e.clientY - s.startY) < SLOP && Math.abs(e.clientX - s.startX) < SLOP) return;
        s.lifted = true;
        dragEl.classList.add('dragging');
        s.indicator = document.createElement('div');
        s.indicator.className = indicatorClass;
        container.insertBefore(s.indicator, dragEl.nextSibling);
        s.scroller = opts.scroller || findScroller(container);
        s.raf = requestAnimationFrame(() => tick(s));
      }
      if (e.cancelable) e.preventDefault();
      placeIndicator(container, itemSelector, dragEl, s.indicator, e.clientY);
    };

    // phase: end (commit)
    const end = (s, e) => {
      if (e.pointerId !== s.pointerId) return;
      const wasLifted = s.lifted;
      const newIndex = wasLifted && s.indicator ? indexOfIndicator(container, itemSelector, s.indicator, dragEl) : s.startIndex;
      cleanup(s);
      if (wasLifted && newIndex !== s.startIndex && typeof onCommit === 'function') onCommit(newIndex, s.startIndex);
    };

    // phase: abort (pointercancel / capture lost without up): nothing changes
    const abort = (s) => { cleanup(s); };

    // phase: down
    const down = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (active) abort(active);
      e.preventDefault();
      e.stopPropagation();
      const s = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastY: e.clientY,
        lifted: false,
        indicator: null,
        raf: 0,
        scroller: null,
        startIndex: Array.from(container.querySelectorAll(itemSelector)).indexOf(dragEl),
        drag: dragEl.closest('[draggable="true"]') || (dragEl.hasAttribute('draggable') ? dragEl : null),
        prevDraggable: null,
      };
      if (s.drag) {
        s.prevDraggable = s.drag.getAttribute('draggable');
        s.drag.setAttribute('draggable', 'false');
      }
      s.onMove = (ev) => move(s, ev);
      s.onUp = (ev) => end(s, ev);
      s.onCancel = (ev) => { if (ev.pointerId === s.pointerId) abort(s); };
      s.onLost = () => { if (active === s) abort(s); };
      active = s;
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      window.addEventListener('pointermove', s.onMove);
      window.addEventListener('pointerup', s.onUp);
      window.addEventListener('pointercancel', s.onCancel);
      grip.addEventListener('lostpointercapture', s.onLost);
    };

    grip.addEventListener('pointerdown', down);
    return {
      destroy() {
        if (active) abort(active);
        grip.removeEventListener('pointerdown', down);
      },
    };
  };

  UI.PointerReorder = { bind, SLOP, EDGE, MAX_SPEED, placeIndicator, indexOfIndicator };
})();
