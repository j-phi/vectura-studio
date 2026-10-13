# TUX integration, batch R3 item 4 (rotate-affordance tests)

## CHANGELOG
- Tests only: the iPhone landscape rotate-affordance tests wait for geometry to settle, re-read the tap target on each attempt, assert the tap selected the layer and wait for the painted affordance (`_rotAffDrawn`), instead of fixed waits.

## plans.md line
- [x] TUX-023 batch R3 item 4: rotate-affordance tests stable (repeat-each=10, retries=0).
