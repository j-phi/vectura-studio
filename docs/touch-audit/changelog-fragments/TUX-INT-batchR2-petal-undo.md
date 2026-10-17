# TUX integration, batch R2 item 3 (Undo / Redo in the Petal Designer window)

## CHANGELOG
- Touch: the pop-out Petal Designer window has its own Undo and Redo buttons (44 px) in its header. The window covers the canvas HUD and the phone header, so no other Undo was reachable by finger while it was open. The buttons show disabled when the stack is empty.

## plans.md line
- [x] TUX-020 follow-up: Undo / Redo reachable by finger while the Petal Designer window is open (iPad and iPhone, Chromium and WebKit).

## Notes
- The window's own edits (profile thumbs, sliders, anchors) do not push history today; the buttons undo any history entry (for example a panel edit made while the window is open). Whether designer edits should push history is a separate question.
