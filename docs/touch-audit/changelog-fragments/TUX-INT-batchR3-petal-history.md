# TUX integration, batch R3 item 2 (Petal Designer window history)

## CHANGELOG
- Petal Designer: every edit gesture (anchor or handle drag, slider, shading, modifier, profile thumb) now pushes one history step before its first change, in the inline designer and in the pop-out window. Undo and Redo, including the window's own buttons, restore the layer and refresh the window.

## plans.md line
- [x] TUX-020 / TUX-026 batch R3 item 2: Petal Designer edits push history once per gesture; the window re-reads the restored layer after undo / redo.
