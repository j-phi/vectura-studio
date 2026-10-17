# TUX integration, batch F (B5 review gaps)

## CHANGELOG
- Touch: a tap on any control outside an open top menu (Insert, Object) now closes the menu, so tapping Pen or Scissor in the tool rail no longer leaves it open (TUX-040, TUX-014).
- Touch: the 3D rotation gizmo centre and roll ring band now have a 22 px hit radius (44 px target). Mouse and pen keep 5 px. A 2D resize handle still wins in an overlap (TUX-025).
- Touch: the Direct tool picks a layer within 22 screen px of the finger, nearest first. Mouse and pen keep 1.5 world units (TUX-024).
- Touch: a tap on or next to locked geometry, or inside a closed locked shape, selects nothing, as a mouse click does. The 22 px reach applies only when no locked geometry is under the finger.

## plans.md line
- [x] TUX-014 / 024 / 025 / 040 batch F: outside-control tap closes top menus; gizmo centre and ring 22 px; Direct pick 22 px; locked geometry blocks the wide touch pick.
