# TUX-024 batch G: the Direct-tool tap path

## CHANGELOG
- Touch: a Direct-tool tap now reaches a stroke from 22 px (nearest wins). Mouse and pen keep 2.5 px.
- A tap on locked geometry selects nothing, for touch and mouse. This applies to `findPathHitAtPoint`, the path hit that every Direct and pen anchor tap uses.

## plans.md
- TUX-024 batch G: `findPathHitAtPoint` takes `HIT_TOLERANCE.pathPick` (2.5 / 2.5 / 22) and the locked rule. Real-tap e2e: `tests/e2e/touch/direct-pick.spec.js`, `tests/e2e/direct-pick-desktop.spec.js`.
