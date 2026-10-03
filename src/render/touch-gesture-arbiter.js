/**
 * Touch gesture arbiter (TUX-017).
 *
 * Pure module: no DOM and no renderer references. It owns
 *   - the touch pointer map (id, live x/y, down timeStamp + position, max travel),
 *   - the decision made when a second finger lands (roll back or commit the first action),
 *   - the "gesture latch" that blocks one-finger actions until ALL touch pointers lift,
 *   - the single list of renderer interaction flags (INTERACTION_FLAGS).
 * The renderer only executes the decisions.
 *
 * Window (from UI_CONSTANTS.TOUCH_GESTURE, read on every decision):
 *   dt     = second pointerdown event.timeStamp - first pointerdown event.timeStamp   (ms)
 *   travel = max CSS-client-px distance of the first pointer from its down point
 * Roll back when dt < ARBITRATION_MS OR travel < ARBITRATION_SLOP_PX.
 * Commit the first action only when BOTH are met. The boundaries are outside the
 * window: dt === ARBITRATION_MS and travel === ARBITRATION_SLOP_PX commit.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const DEFAULT_CONFIG = Object.freeze({ ARBITRATION_MS: 250, ARBITRATION_SLOP_PX: 10 });
  const readConfig = () => {
    const cfg = (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.TOUCH_GESTURE) || {};
    const ms = Number(cfg.ARBITRATION_MS);
    const px = Number(cfg.ARBITRATION_SLOP_PX);
    return {
      ARBITRATION_MS: Number.isFinite(ms) ? ms : DEFAULT_CONFIG.ARBITRATION_MS,
      ARBITRATION_SLOP_PX: Number.isFinite(px) ? px : DEFAULT_CONFIG.ARBITRATION_SLOP_PX,
    };
  };

  // Renderer own-properties that mean "a one-finger interaction is in flight".
  // cancelActiveInteractionsForTouchGesture clears every entry (names starting with
  // "is" become false, all others become null). The renderer guard test requires every
  // interaction-looking constructor property to be listed here or in an explicit exempt map.
  const INTERACTION_FLAGS = Object.freeze([
    'isPan',
    'isLayerDrag',
    'isSelecting',
    'isLassoSelecting',
    'isScissor',
    'isDirectMarquee',
    'isLightDrag',
    'isPenDragging',
    'isPenCloseDragging',
    'directDrag',
    'shapeCornerDrag',
    'freeformCornerDrag',
    'penAnchorDrag',
    'modifierDrag',
    'rotation3DDrag',
    'shapeDraft',
    'algoDraft',
    'touchHoldPending',
    '_areaCreate',
    '_typeDrag',
    '_sceneDrag',
    '_sceneObjectGizmoDrag',
    '_sceneLightGizmoDrag',
    '_sceneResizeDrag',
    '_sceneFacePullDrag',
    '_sceneLightDrag',
  ]);

  // Scene and layer drags know how to restore their own pre-drag state. Rollback
  // calls them in the same priority order as the Escape handler in the renderer.
  const CANCEL_PATHS = Object.freeze([
    '_cancelSceneObjectGizmoDrag',
    '_cancelSceneLightGizmoDrag',
    '_cancelSceneResizeDrag',
    '_cancelSceneFacePullDrag',
    '_cancelSceneLightDrag',
    '_cancelSceneGroundDrag',
    'cancelLayerDrag',
  ]);

  const isTouch = (e) => !!e && e.pointerType === 'touch';

  const decide = ({ dtMs, travelPx, config } = {}) => {
    const cfg = config || readConfig();
    const insideWindow = !(Number(dtMs) >= cfg.ARBITRATION_MS && Number(travelPx) >= cfg.ARBITRATION_SLOP_PX);
    return { rollback: insideWindow, commitFirst: !insideWindow, start: 'pinch' };
  };

  const create = () => {
    const pointers = new Map();
    const secondFingerListeners = [];
    let gestureActive = false;

    const arbiter = {
      pointers,
      get gestureActive() { return gestureActive; },

      // Register a touch pointerdown. Returns null for non-touch pointers.
      //   role 'first'   first finger on an empty map
      //   role 'second'  second finger: carries the decision
      //   role 'latched' any later finger, or a finger while the latch is held (ignored)
      down(e) {
        if (!isTouch(e)) return null;
        const id = e.pointerId;
        const x = e.clientX ?? 0;
        const y = e.clientY ?? 0;
        const rec = { id, x, y, downX: x, downY: y, downTime: Number(e.timeStamp) || 0, maxTravel: 0 };
        const before = pointers.size;
        pointers.set(id, rec);
        if (before === 0) return { role: 'first', count: 1 };
        if (before === 1 && !gestureActive) {
          const first = [...pointers.values()].find((p) => p.id !== id);
          const dtMs = rec.downTime - first.downTime;
          const decision = decide({ dtMs, travelPx: first.maxTravel });
          gestureActive = true;
          const info = { role: 'second', count: 2, decision, dtMs, travelPx: first.maxTravel, firstId: first.id };
          secondFingerListeners.forEach((fn) => { try { fn(info); } catch (_err) { /* listener errors never break input */ } });
          return info;
        }
        return { role: 'latched', count: pointers.size };
      },

      // Track a touch move. Unknown pointers are ignored.
      update(e) {
        if (!isTouch(e)) return null;
        const rec = pointers.get(e.pointerId);
        if (!rec) return null;
        rec.x = e.clientX ?? rec.x;
        rec.y = e.clientY ?? rec.y;
        const travel = Math.hypot(rec.x - rec.downX, rec.y - rec.downY);
        if (travel > rec.maxTravel) rec.maxTravel = travel;
        return rec;
      },

      // Remove a touch pointer. The latch clears only when the map is empty.
      release(e) {
        if (!isTouch(e)) return;
        pointers.delete(e.pointerId);
        if (pointers.size === 0) gestureActive = false;
      },

      get(id) { return pointers.get(id) || null; },

      // Put a record back (commit path runs the normal "up" code, which removes it).
      restore(rec) { if (rec) pointers.set(rec.id, rec); },

      // Drop all state (interface for TUX-018 pointercancel handling).
      abort() {
        pointers.clear();
        gestureActive = false;
      },

      // Interface for lane M (TUX-034 long-press): listeners run when a second finger
      // lands, so a pending hold can cancel itself.
      onSecondFinger(fn) {
        if (typeof fn === 'function') secondFingerListeners.push(fn);
        return () => {
          const i = secondFingerListeners.indexOf(fn);
          if (i >= 0) secondFingerListeners.splice(i, 1);
        };
      },
    };
    return arbiter;
  };

  Vectura.TouchGestureArbiter = { DEFAULT_CONFIG, INTERACTION_FLAGS, CANCEL_PATHS, readConfig, decide, create };
})();
