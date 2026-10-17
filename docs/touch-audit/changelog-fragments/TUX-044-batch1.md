# TUX-044 batch 1 — layer list edge auto-scroll for touch drags

## CHANGELOG bullet
- A layer row dragged by its grip now auto-scrolls the list while the finger rests within 48 px of the list's top or bottom edge (up to 14 px per frame). The drop row is re-targeted on every scroll step. A group-exit strip no longer swallows a drop from a row that is not inside that group: the row just above it takes the drop.

## plans.md line
TUX-044 req 5: touch reorder auto-scroll at list edges (J2 reorder on iPhone landscape).
