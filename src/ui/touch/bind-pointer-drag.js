/*
 * Vectura Studio — bindPointerDrag (TUX-018).
 *
 * One drag binder that always captures the pointer on down and always pairs pointerup with
 * pointercancel. New drag code uses this helper instead of hand-wiring pointerup alone.
 *
 * API (window.Vectura.UI.bindPointerDrag):
 *   bindPointerDrag(el, { down(e) -> false|void, move(e), end(e), abort(e), filter(e), capture })
 *     -> unbind()
 *   down   runs on pointerdown. Return false to refuse the drag (no capture, no listeners).
 *   move   runs on each pointermove of the same pointer.
 *   end    runs once on pointerup.
 *   abort  runs once on pointercancel or lost capture (defaults to end).
 * Events of another pointer (a second finger) are ignored while a drag runs.
 */
(() => {
  'use strict';
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});
  const UI = (Vectura.UI = Vectura.UI || {});

  const bindPointerDrag = (el, opts = {}) => {
    let active = null;
    const mine = (e) => !active || active.id === undefined || e.pointerId === undefined || e.pointerId === active.id;
    const teardown = () => {
      G.removeEventListener('pointermove', onMove, true);
      G.removeEventListener('pointerup', onUp, true);
      G.removeEventListener('pointercancel', onCancel, true);
      el.removeEventListener('lostpointercapture', onCancel);
      active = null;
    };
    const onMove = (e) => { if (active && mine(e) && opts.move) opts.move(e); };
    const onUp = (e) => {
      if (!active || !mine(e)) return;
      teardown();
      if (opts.end) opts.end(e);
    };
    const onCancel = (e) => {
      if (!active || !mine(e)) return;
      teardown();
      (opts.abort || opts.end || (() => {}))(e);
    };
    const onDown = (e) => {
      if (active) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (opts.filter && opts.filter(e) === false) return;
      if (opts.down && opts.down(e) === false) return;
      active = { id: e.pointerId };
      try { if (e.pointerId !== undefined) el.setPointerCapture?.(e.pointerId); } catch (_) { /* synthetic ids */ }
      G.addEventListener('pointermove', onMove, true);
      G.addEventListener('pointerup', onUp, true);
      G.addEventListener('pointercancel', onCancel, true);
      el.addEventListener('lostpointercapture', onCancel);
    };
    el.addEventListener('pointerdown', onDown);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      if (active) teardown();
    };
  };

  UI.bindPointerDrag = bindPointerDrag;
})();
