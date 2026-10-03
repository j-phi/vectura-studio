# Interface request: TUX-034b canvas long-press (renderer.js, owner G2)

From: TUX-034a (lane M, branch touch/menu). To: G2 (sole owner of `src/render/renderer.js`).

## Why

TUX-034a ships `TouchHold` (`window.Vectura.UI.TouchHold`) and wires it to layer cards. The canvas long-press
(clauses 10 and 11 on canvas) needs two hooks in the renderer. Lane M must not edit renderer.js.

Today a touch on a selected object starts a 350 ms hold-to-move. A touch on empty canvas starts a marquee or a deselect.
Both gestures would run at the same time as a long-press.

## Request 1: `renderer.cancelActiveTouchGesture()`

- Abort a pending hold-to-move, marquee or deselect from the current touch.
- Cause no side effects: no selection change, no history entry, no render of a half-made marquee.
- Safe to call when nothing is pending.

## Request 2: a hand-off hook to TouchHold

- When a single touch stays within 6 px of its start point for the hold time, the renderer calls
  `Vectura.UI.TouchHold.fireAt({ x, y, source: 'canvas', hit })` (to be added by 034b), or exposes
  `renderer.onStationaryTouch = (x, y, hit) => ...` that 034b wires to `CanvasContextMenu.openForSelection`.
- The renderer decides `hit` (the scene hit from `resolveSceneHit`). TouchHold owns the ring, pop, haptic and ghost-click swallow.

## Precedence rule

- On a selected object, the 6 px move slop (decision Q4) wins. A move of 6 px or more cancels the hold and starts the move.
- Elsewhere (empty canvas, unselected object), the 10 px hold slop (`TOUCH_HOLD.slopPx`) applies.
- The long-press menu opens only when no move started. After the menu opens, the lift must run nothing.

## New dependency edge

- 019 -> 034b. TUX-019 removes the renderer hold-to-move. TUX-034b must land after it.
- 034a does not depend on 019.

## Items that move to 034b

- Scene-hit menu items (Drop to Ground, Select All Faces) on touch.
- The boolean group menu through modifier-bar multi-select (or after TUX-045).
