# Batch G: partial requirements closed

## CHANGELOG
- Touch: press and hold on the canvas (Select, Direct Selection or Hand) for 0.5 s selects the object under the finger and opens the canvas menu. On empty canvas the menu offers Select All. The hold never starts with drawing or fill tools. A move of 10 px (6 px on a selected object) cancels the hold. The lift and later finger movement run nothing.
- The empty-canvas menu now has Select All.
- A system interruption (pointercancel) now ends every drag in the tool dialogs, the color picker, the paint canvas, the pendulum pad, the Pattern Designer, the draw-order scrub and the shape-property sliders. The draw-order scrub does not start playback on a cancel.
- Hover reveal rules (opacity, display, visibility) now sit inside `@media (hover: hover)`. The remaining 23 are done.
- The pen menu, the palette menu, the Add Layer menu, the layer bar palette menu and the algorithm-draw menu close on any outside press, including drags and scrolls.
- The phone context bar is shown on touch phones. Its content scrolls sideways. The Shape Properties button, align verbs and the more menu are reachable by finger on iPhone.

## plans.md
- TUX-018b done: R4 guard baseline is 0; `Vectura.UI.bindPointerDrag` (`src/ui/touch/bind-pointer-drag.js`) is the shared binder; the Pattern Designer header drag uses it.
- TUX-033 done: R10 baseline cut from 38 to 17. The rest are keydown, wheel and HTML5 drag reads (exempt).
- TUX-034b done except Paste (no copy command exists in the app; Select All added).
- TUX-036 req 4 done: R8 baseline 0.
- TUX-040b done: click-only dismissals now also close on pointerdown.

## README / help / shortcuts
- Help (Canvas): "On touch, press and hold the canvas with Select, Direct Selection or Hand to open the canvas menu."
- Shortcut list: no change.
