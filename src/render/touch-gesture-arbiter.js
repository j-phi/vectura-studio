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

  const DEFAULT_CONFIG = Object.freeze({
    ARBITRATION_MS: 250,
    ARBITRATION_SLOP_PX: 10,
    touchDragSlopPx: 6,
    TAP_MAX_SKEW_MS: 250,
    TAP_MAX_DURATION_MS: 250,
    TAP_SLOP_PX: 10,
  });
  const readConfig = () => {
    const cfg = (Vectura.UI_CONSTANTS && Vectura.UI_CONSTANTS.TOUCH_GESTURE) || {};
    const ms = Number(cfg.ARBITRATION_MS);
    const px = Number(cfg.ARBITRATION_SLOP_PX);
    const drag = Number(cfg.touchDragSlopPx);
    const num = (key) => (Number.isFinite(Number(cfg[key])) && Number(cfg[key]) >= 0 ? Number(cfg[key]) : DEFAULT_CONFIG[key]);
    return {
      TAP_MAX_SKEW_MS: num('TAP_MAX_SKEW_MS'),
      TAP_MAX_DURATION_MS: num('TAP_MAX_DURATION_MS'),
      TAP_SLOP_PX: num('TAP_SLOP_PX'),
      touchDragSlopPx: Number.isFinite(drag) && drag >= 0 ? drag : DEFAULT_CONFIG.touchDragSlopPx,
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
    '_touchMovePending',
    '_areaCreate',
    '_typeDrag',
    '_sceneDrag',
    '_sceneObjectGizmoDrag',
    '_sceneLightGizmoDrag',
    '_sceneResizeDrag',
    '_sceneFacePullDrag',
    '_sceneLightDrag',
    '_fillPendingPour',
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

  // TUX-021: an Apple Pencil pointer (pointerType 'pen') pointerdown with contact. A hover
  // sends buttons 0 and pressure 0 and never counts. A missing buttons/pressure counts as
  // contact (some synthetic and older events omit both fields).
  const isPenContact = (e) => {
    if (!e || e.pointerType !== 'pen') return false;
    const hasButtons = typeof e.buttons === 'number';
    const hasPressure = typeof e.pressure === 'number';
    if (!hasButtons && !hasPressure) return true;
    return (hasButtons && (e.buttons & 1) === 1) || (hasPressure && e.pressure > 0);
  };

  const decide = ({ dtMs, travelPx, config } = {}) => {
    const cfg = config || readConfig();
    const insideWindow = !(Number(dtMs) >= cfg.ARBITRATION_MS && Number(travelPx) >= cfg.ARBITRATION_SLOP_PX);
    return { rollback: insideWindow, commitFirst: !insideWindow, start: 'pinch' };
  };

  // TUX-020: pure multi-finger tap classifier. Input is the summary the arbiter keeps while
  // fingers are down. Boundaries are INSIDE the window: skew <= max, duration <= max,
  // drift < slop and span change < slop. Two fingers = undo, three fingers = redo.
  const classifyTap = (rec, config) => {
    const cfg = config || readConfig();
    const r = rec || {};
    const no = (reason) => ({ tap: false, reason, count: r.count || 0 });
    if (r.onlyTouch === false) return no('pointer-type');
    if (!(r.count === 2 || r.count === 3)) return no('count');
    if (r.foreign) return no('foreign');
    if (r.earlyLift) return no('early-lift');
    if (r.cancelled) return no('cancelled');
    if (!(r.skewMs <= cfg.TAP_MAX_SKEW_MS)) return no('skew');
    if (!(r.durationMs <= cfg.TAP_MAX_DURATION_MS)) return no('duration');
    if (!(r.maxDrift < cfg.TAP_SLOP_PX)) return no('drift');
    if (!(r.spanDelta < cfg.TAP_SLOP_PX)) return no('span');
    return { tap: true, reason: 'ok', count: r.count };
  };

  const create = () => {
    const pointers = new Map();
    const foreign = new Set();
    // Per-gesture tap summary; exists from the first finger down until the last finger lifts.
    let tap = null;
    const span = () => {
      const pts = [...pointers.values()];
      let best = 0;
      for (let i = 0; i < pts.length; i += 1) {
        for (let j = i + 1; j < pts.length; j += 1) best = Math.max(best, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      }
      return best;
    };
    const secondFingerListeners = [];
    let gestureActive = false;
    // TUX-021: touch ids that must start and end nothing (palm preempted by, or landed on top
    // of, an Apple Pencil pointer). They stay ignored until they lift, even after the pen lifts.
    const ignored = new Set();
    let penId = null;

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
        if (before === 0) {
          tap = {
            firstDown: rec.downTime, lastDown: rec.downTime, lastUp: rec.downTime, maxCount: 1, ups: 0,
            earlyLift: false, foreign: foreign.size > 0, cancelled: false, spanBase: 0, spanDelta: 0, fingers: new Map([[id, rec]]),
          };
        } else if (tap) {
          // A finger that lands after another already lifted is two single taps, not one gesture.
          if (tap.ups > 0) tap.earlyLift = true;
          tap.lastDown = rec.downTime;
          tap.maxCount = Math.max(tap.maxCount, pointers.size);
          tap.fingers.set(id, rec);
          tap.spanBase = span();
        }
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
        if (tap && pointers.size >= 2) tap.spanDelta = Math.max(tap.spanDelta, Math.abs(span() - tap.spanBase));
        return rec;
      },

      // Remove a touch pointer. The latch clears only when the map is empty.
      // Returns the tap classification on the LAST lift of a multi-finger gesture
      // ({ tap, reason, count }), else null. The renderer acts on { tap: true }.
      release(e) {
        if (!isTouch(e)) return null;
        const rec = pointers.get(e.pointerId);
        if (tap && rec) {
          tap.ups += 1;
          tap.lastUp = Number(e.timeStamp) || tap.lastUp;
          if (e.type === 'pointercancel') tap.cancelled = true;
        }
        pointers.delete(e.pointerId);
        if (pointers.size > 0) return null;
        gestureActive = false;
        const done = tap;
        tap = null;
        if (!done || done.maxCount < 2) return null;
        let maxDrift = 0;
        done.fingers.forEach((f) => { maxDrift = Math.max(maxDrift, f.maxTravel); });
        return classifyTap({
          count: done.maxCount, skewMs: done.lastDown - done.firstDown, durationMs: done.lastUp - done.firstDown,
          maxDrift, spanDelta: done.spanDelta, earlyLift: done.earlyLift, foreign: done.foreign,
          cancelled: done.cancelled, onlyTouch: true,
        });
      },

      // TUX-020: fingers that landed outside the canvas (HUD, chrome) taint the gesture. The
      // HUD reports them here; a tap that includes or overlaps a foreign finger never fires.
      foreignDown(id) {
        foreign.add(id);
        if (tap) tap.foreign = true;
      },
      foreignUp(id) { foreign.delete(id); },

      get(id) { return pointers.get(id) || null; },

      // TUX-021: pen-preempts-touch policy. Call on EVERY canvas pointerdown of type 'pen'.
      //   ctx = { touchActive: a touch owns the canvas interaction, touchGesture: a pinch/pan runs }
      // Returns null unless the pointerdown has pen contact. Otherwise the decision:
      //   { preempt, rollback: 'touch' | null, stopGesture, restoreView, start: 'pen', ignoredIds }
      // Side effects: every tracked touch pointer moves to the ignored set and the touch map and
      // latch are cleared, so nothing a palm does afterwards can reach the pen interaction.
      penDown(e, ctx = {}) {
        if (!isPenContact(e)) return null;
        const ids = [...pointers.keys()];
        ids.forEach((id) => ignored.add(id));
        const preempt = ids.length > 0 || !!ctx.touchActive || !!ctx.touchGesture;
        pointers.clear();
        tap = null;
        gestureActive = false;
        penId = e.pointerId;
        return {
          preempt,
          rollback: preempt && !ctx.touchGesture ? 'touch' : null,
          stopGesture: !!ctx.touchGesture,
          restoreView: !!ctx.touchGesture,
          start: 'pen',
          ignoredIds: ids,
        };
      },

      // The pen pointer lifted or was cancelled: later touches act normally again.
      penRelease(e) {
        if (e && e.pointerType === 'pen' && (penId === null || e.pointerId === penId)) penId = null;
      },

      get penActive() { return penId !== null; },

      // TUX-021: policy for a touch pointerdown. { ignore: true } while a pen is down, while any
      // preempted palm still rests (ignored set not empty), or when the id is already ignored. The id is then ignored for the rest of its life.
      touchPolicy(e) {
        if (!isTouch(e)) return { ignore: false };
        if (ignored.has(e.pointerId)) return { ignore: true };
        if (penId !== null || ignored.size > 0) {
          ignored.add(e.pointerId);
          return { ignore: true };
        }
        return { ignore: false };
      },

      isIgnoredTouch(e) { return isTouch(e) && ignored.has(e.pointerId); },
      // A lift or cancel of an ignored touch ends its ignored status. Returns true when it was ignored.
      releaseIgnored(e) { return isTouch(e) && ignored.delete(e.pointerId); },

      // Put a record back (commit path runs the normal "up" code, which removes it).
      restore(rec) { if (rec) pointers.set(rec.id, rec); },

      // Drop all state (interface for TUX-018 pointercancel handling).
      abort() {
        pointers.clear();
        foreign.clear();
        tap = null;
        gestureActive = false;
        penId = null;
        ignored.clear();
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

  Vectura.TouchGestureArbiter = { DEFAULT_CONFIG, INTERACTION_FLAGS, CANCEL_PATHS, readConfig, decide, classifyTap, isPenContact, create };
})();
