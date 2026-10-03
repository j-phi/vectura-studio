/*
 * Vectura Studio - PinchZoom helper (TUX-047).
 *
 * Two-finger pinch/pan tracker for a zoomable surface. Touch pointers only:
 * mouse and pen events are ignored completely.
 *
 * PinchZoom.attach(el, {
 *   filter(e)        optional; return false to ignore a pointer event (replayed events).
 *   onStart(info)    second touch pointer landed. info: { cx, cy }  (client coords of the centre)
 *   onUpdate(info)   info: { ratio, cx, cy, startCx, startCy }
 *                    ratio = current finger distance / distance at start.
 *                    (cx,cy) = current centre; (startCx,startCy) = centre at start.
 *   onEnd(info)      fewer than 2 touch pointers remain (also on pointercancel).
 *                    info: { cancelled, remaining: [{ id, x, y }] }  fingers still down.
 * }) -> { detach, active(), size() }
 *
 * Consumers map this to a view with focal-point math:
 *   zoom   = clamp(zoom0 * ratio)
 *   offset = (cx - rect.left) - ((startCx - rect.left) - offset0) / zoom0 * zoom
 * which zooms about the start centre and adds the centre delta as pan.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const attach = (el, opts = {}) => {
    const pointers = new Map(); // pointerId -> { x, y }
    let pair = null; // { a, b, startDist, startCx, startCy }
    const accept = (e) => e.pointerType === 'touch' && (!opts.filter || opts.filter(e) !== false);

    const geometry = () => {
      const pa = pointers.get(pair.a);
      const pb = pointers.get(pair.b);
      if (!pa || !pb) return null;
      return { dist: Math.hypot(pb.x - pa.x, pb.y - pa.y), cx: (pa.x + pb.x) / 2, cy: (pa.y + pb.y) / 2 };
    };
    const begin = () => {
      const ids = [...pointers.keys()];
      pair = { a: ids[0], b: ids[1], startDist: 1, startCx: 0, startCy: 0 };
      const g = geometry();
      pair.startDist = Math.max(1, g.dist);
      pair.startCx = g.cx;
      pair.startCy = g.cy;
      if (opts.onStart) opts.onStart({ cx: g.cx, cy: g.cy });
    };
    const remaining = () => [...pointers.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    const finish = (cancelled) => {
      pair = null;
      if (opts.onEnd) opts.onEnd({ cancelled: !!cancelled, remaining: remaining() });
    };

    const onDown = (e) => {
      if (!accept(e)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pair && pointers.size >= 2) begin();
    };
    const onMove = (e) => {
      if (!pointers.has(e.pointerId) || !accept(e)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!pair || (e.pointerId !== pair.a && e.pointerId !== pair.b)) return;
      const g = geometry();
      if (!g) return;
      if (opts.onUpdate) {
        opts.onUpdate({ ratio: g.dist / pair.startDist, cx: g.cx, cy: g.cy, startCx: pair.startCx, startCy: pair.startCy });
      }
    };
    const onUp = (e) => {
      if (!pointers.has(e.pointerId) || !accept(e)) return;
      const cancelled = e.type === 'pointercancel';
      const wasPair = pair && (e.pointerId === pair.a || e.pointerId === pair.b);
      pointers.delete(e.pointerId);
      if (!pair) return;
      if (!wasPair) return;
      if (pointers.size < 2) { finish(cancelled); return; }
      // A third finger remains: hand over to it as the new pair partner.
      finish(cancelled);
      begin();
    };

    el.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return {
      active: () => !!pair,
      size: () => pointers.size,
      detach: () => {
        el.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        pointers.clear();
        pair = null;
      },
    };
  };

  UI.PinchZoom = { attach };
})();
