# Unit E notes — expand fidelity + the erodeEmpty counter

**Finding: both defects item E describes do not reproduce on HEAD (25e76b65).** No
source fix was made; this unit adds regression coverage instead.

- `git diff d5af9e30 HEAD -- src/ui/panels/layers-panel.js src/core/scene3d/surface-fill.js`
  is empty — nothing on this branch changed either file, so a pre-sha pin cannot
  measure anything different from today.
- Fidelity: the in-process rasterized-ink oracle (same construction as
  `expand-render-fidelity.test.js`) reads **0%** divergence for `interlockWeave` and
  `amplitudeOnly` (and the `nibAngle`/`onePenDown` controls), because C3 rule 6
  guarantees every bucket-B path is `weightScale === 1`, so expand's rule-2 branch
  never fires for them — they clone-and-strip untouched. A REAL browser full-canvas
  diff shows ~8-10% for all four laws tested alike (not law-specific) — a render-order/
  AA floor common to any expand, reported per plan-E's stop-and-report clause, not fixed.
- Counter: `erodeEmpty` is 0 for all 12 bucket-B laws on both sphere and torus, for
  `onePenDown` specifically included. `docs/torus-fix-evidence/stats-before.json` shows
  it WAS 10/19 pre-CLS_WALLS — the mechanism was real, and is already fixed by that
  earlier, already-merged work (`wallEmpty`/`wallCentres`).

New coverage (both green today, lock in the above): `tests/integration/expand-scene3d-fidelity-two-laws.test.js`,
`tests/unit/scene3d-ribbon-degeneration-counter.test.js`. Evidence: `docs/3d-audit/handoff/unit-e/`.
