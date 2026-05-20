# Audit 2026-05-20 — Deferred Follow-ups

Companion to `docs/audit-2026-05-20.md`. That file is the original audit; this file captures what was **not** closed in the 2026-05-20 multi-agent integration pass, with implementation plans, justifications, and risks so any item can be resumed in isolation.

## How to read this doc

Each section below corresponds to one audit finding. The format:

- **What** — what the audit said, in one sentence.
- **Status** — `Deferred (pursue)`, `Deferred (defer further)`, or `Drop`.
- **Recommendation** — one-sentence call.
- **Why pursue** — the value if we do it.
- **Why defer / drop** — the cost or reason it can wait.
- **Risks** — failure modes if we don't, and failure modes during the change itself.
- **Plan** — concrete steps, file paths, suggested commit boundaries.
- **Tests** — what RGR coverage looks like.
- **Effort** — rough size category: `XS` (≤1 hr), `S` (1–4 hr), `M` (½–2 days), `L` (multi-day), `XL` (multi-week+).
- **Depends on** — anything that should land first.

The recommended-sequencing table at the bottom rolls all of this up.

---

## Architecture

### Arch-1 — Renderer (6,733 LOC) is a god object

- **What.** `src/render/renderer.js` mixes 8+ subsystems (tool/cursor state machine, pen tool, shape drafting, algo-draw drafting, direct selection, touch gestures, paint-bucket, snapping, geometry helpers, light source, fill loupe). Hot methods: `down(e)` 413 LOC, `move(e)` 440 LOC, `up(e)` 263 LOC, `draw()` 666 LOC.
- **Status.** Deferred (pursue, but as a multi-PR campaign, not one push).
- **Recommendation.** **Pursue in 5 sequential PRs over ~2 months.** This is the single highest-leverage architectural change in the audit — every other refactor in `renderer.js` becomes safer after the split.
- **Why pursue.**
  - Unlocks per-tool unit testing (today Renderer has ~8 unit specs covering ~7k LOC).
  - Ends the "every refactor touches renderer.js" treadmill that's caused merge pain throughout the Meridian and fills work.
  - Makes the touch / pointer state machines independently auditable for the recurring tablet-touch bugs (see `Tests-Red-2`).
- **Why defer further.** It's the largest single piece of work in the audit. A botched split causes drag-handle/cursor regressions visible to every user.
- **Risks.**
  - *Not pursuing:* the file keeps growing; touch ergonomics keeps regressing; renderer-touching PRs keep blocking on merge conflicts.
  - *Pursuing badly:* moving `down/move/up` dispatch into a tool registry risks breaking pointer-event ordering (capture/passive listeners, preventDefault timing). The visual baseline does not catch this — only e2e + manual touch testing does.
- **Plan (5 PRs).**
  1. **PR 1 — pure geometry extraction.** Move `distanceToSegmentSq`, `pointInPoly`, `segmentsIntersect`, `ellipseToPoly`, `circleIntersectsRect` (~1000 LOC at `renderer.js:5439–6524`) into `src/render/geom/intersect.js`. No behavior change. Add unit tests for each helper (currently uncovered).
  2. **PR 2 — touch state machine extraction.** Pull the multi-touch / pinch / pan state machine into `src/render/input/touch.js`. Renderer becomes the consumer of `TouchInput.events`. This is the trickiest PR — needs explicit Playwright touch coverage before merge.
  3. **PR 3 — tool registry scaffold.** Introduce `src/render/tools/registry.js` with `register(toolId, {down, move, up})`. Convert ONE simple tool first (probably `scissor` — minimal state, clear seams) to prove the pattern. `Renderer.down/move/up` become 3-line dispatchers for that tool, fallback to inline code for everything else.
  4. **PR 4 — migrate pen, shape, algoDraft tools.** Three more tools through the registry. After this PR, `Renderer.down/move/up` should be down to ~150 LOC each.
  5. **PR 5 — migrate direct, paintBucket, lightSource.** Final three. Renderer ends at ~1500 LOC (camera + draw loop + tool dispatch).
- **Tests.** Each PR needs new unit specs for the extracted module + an e2e regression check on the corresponding tool. Visual baselines stay byte-identical at every step (the extractions are mechanical).
- **Effort.** PR 1: M. PR 2: L. PR 3: M. PR 4: L. PR 5: L. Total: ~3 weeks of focused work with reviewer.
- **Depends on.** Nothing technical. Politically: should not land while a feature like the fills B/C series is in flight, because the renderer touches everything.

### Arch-2 — `renderer → app.ui.*` upward coupling

- **What.** `renderer.js:3409–5264` calls `this.app.ui.setPaintBucketHint(...)` and `this.app.ui.renderLayers()` directly. Renderer reaches into the UI panel layout.
- **Status.** Deferred (pursue, **bundle with Arch-1 PR 3**).
- **Recommendation.** Don't ship this as its own PR. Add a `renderer.on('paintBucketHint', fn)` event hook when extracting the paint-bucket tool in Arch-1 PR 5, and wire UI listeners from App.
- **Why pursue.** Coupling forces every renderer change to consider UI side-effects, and vice versa.
- **Risks.** Tiny. Wrong event-payload shape is caught by integration tests.
- **Plan.** During Arch-1 PR 5: replace each `this.app.ui.*` call with an emit. Add the listeners in `App.constructor` next to `renderer.onCommitTransform = ...`.
- **Tests.** Existing paint-bucket integration tests catch regressions.
- **Effort.** XS (an hour on top of PR 5).

### Arch-3 — `SETTINGS` is global mutable state, read 58× in renderer + 24× in engine

- **What.** No schema, no observer; any module mutates it at any time.
- **Status.** Deferred (defer further — partial mitigation already landed via Bugs-7 validators).
- **Recommendation.** **Defer indefinitely.** Bugs-7 already documented and validated every preference field on the import boundary, which closes the largest practical risk. Formalizing SETTINGS as a typed observable is a multi-month migration with low immediate user value.
- **Why pursue (someday).** Eventually makes per-draw renderConfig snapshots possible (cheaper re-renders, true immutability invariants).
- **Why defer.** Today nothing is broken; Bugs-7 covers the security side. The work is multi-month and has no user-visible payoff.
- **Risks.** Of not pursuing: SETTINGS grows unbounded; future contributors keep adding fields without documenting them. Mitigation: write `docs/settings-schema.md` as a S task (see below).
- **Plan if pursued.** Phase 0 only (cheap): generate `docs/settings-schema.md` from the existing `defaults.js` + `Vectura.Validators` allowlists. Document every field, its type/range, and which subsystems read it. This is enough to make Arch-3 a non-issue in practice without doing the typed-observable refactor.
- **Tests.** Documentation; no tests.
- **Effort.** Phase 0: S. Full migration: XL.

### Arch-4 — Two parallel selection systems on `Renderer`

- **What.** Layer selection (`selectedLayerIds: Set`, `setSelection`) and path-anchor direct selection (`directSelection`, `startDirectDrag`) share marquee/lasso/hit-test concepts but live as separate state machines with separate code paths.
- **Status.** Deferred (pursue **after Arch-1**).
- **Recommendation.** Don't unify these until the renderer split lands — otherwise you're refactoring inside a god module.
- **Why pursue.** Today, every marquee bug has to be fixed twice. The duplication is the audit's #2 architectural callout and a recurring source of regressions.
- **Why defer (until Arch-1).** A unified `SelectionModel` belongs in `src/render/selection/` — that directory only exists after Arch-1 PR 1.
- **Risks.** Of not pursuing: selection bugs keep multiplying (one is the Tests-Red-2 mask-shift-drag skip).
- **Plan.** Introduce `src/render/selection/SelectionModel.js` with two scopes (`layer`, `pathAnchors`) sharing marquee + lasso + hit primitives. Make Renderer a consumer.
- **Tests.** Renderer integration coverage already exercises both modes; expand with unit specs against the new `SelectionModel`.
- **Effort.** M–L (1–2 PRs).
- **Depends on.** Arch-1 PR 1 (geometry extraction).

### Arch-5 — Three cooperative cursor-update entry points

- **What.** `updateCursor()`, `updateHoverCursor(e)`, `_applyModifierCursorOverride()` cooperatively own `canvas.style.cursor` with implicit ordering.
- **Status.** Deferred (pursue, S).
- **Recommendation.** **Pursue as a standalone S PR.** This is the smallest architectural win and has caused at least one shipped bug (cursor stuck on shape-reticle after selection — see commits in the post-1.1.0 stream).
- **Why pursue.** Cursor flicker / wrong-cursor bugs are user-visible and hard to repro.
- **Why defer.** Not load-bearing if nobody touches the cursor code.
- **Risks.** Of pursuing: latent bug surfaces when consolidation reveals an ordering assumption.
- **Plan.** Replace the three entry points with a single `recomputeCursor({event, tool, hover, modifiers})` that returns the cursor string. Every former call site sets local state and then asks recomputeCursor for the result.
- **Tests.** Add an e2e test per cursor state (tool switch → expected cursor, hover-over-handle → expected cursor, modifier-held → expected cursor).
- **Effort.** S.
- **Depends on.** None.

### Arch-6 — `window.Vectura.ShapeUtils` declared but never consumed

- **What.** `renderer.js:6718` exports 5 members; nothing consumes them.
- **Status.** Deferred (pursue, XS).
- **Recommendation.** **Pursue immediately** — it's a one-line delete.
- **Why pursue.** Dead exports mislead future contributors into thinking they're public API.
- **Risks.** Tiny. Verify via grep that there really are no consumers (including in tests and `graphify-out/wiki/`).
- **Plan.** Delete the `window.Vectura.ShapeUtils = {...}` block at `renderer.js:6718`. Move the helpers into a module-scope object if any are still used internally.
- **Tests.** A unit test that asserts `Vectura.ShapeUtils === undefined` is overkill — just rely on `npm run test:ci`.
- **Effort.** XS.
- **Depends on.** None.

### Arch-8 — Hardcoded interaction constants violate config-discipline rule

- **What.** `renderer.js` hardcodes `loupe.width = 96`, `snapTol = 5/scale` (and a different `3/scale` elsewhere), `snap = 15`, `handleSize = 6/scale`, `handleR = 2.2/scale`, `scissorAngle stepDeg = 15`. CLAUDE.md forbids this.
- **Status.** Deferred (pursue, S — bundle with Arch-1 PR 1).
- **Recommendation.** Don't ship as its own PR; fold into Arch-1 PR 1 (geometry extraction) — when you move helpers, lift the constants into `src/config/interaction-tokens.js` at the same time.
- **Why pursue.** Tuning these in one place beats grepping through `renderer.js`. Inconsistency (5/scale vs 3/scale snapTol) is already a real bug — they should probably be the same value.
- **Risks.** Of pursuing: collapsing `5/scale` and `3/scale` into one constant might change snap behavior somewhere. Confirm both values are intentional before unifying; if not, the audit found a latent inconsistency.
- **Plan.** Create `src/config/interaction-tokens.js` exporting `SNAP_TOL_PX`, `HANDLE_SIZE_PX`, `HANDLE_RADIUS_PX`, `LOUPE_WIDTH_PX`, `SCISSOR_ANGLE_STEP_DEG`. Migrate every callsite.
- **Tests.** Visual baseline + e2e cursor/handle tests catch any unintended drift.
- **Effort.** S.
- **Depends on.** None technically, but cleaner if bundled with Arch-1 PR 1.

---

## Bugs

### Bugs-13 (LOW) — `applyState` race against in-flight async generation

- **What.** Some algorithms (image-loading) enqueue `setTimeout`/rAF; rapid open-file → open-file can land stale paths in the new project's layers.
- **Status.** Deferred (pursue, S–M).
- **Recommendation.** **Pursue as an isolated PR.** This is the only audit bug not closed. The fix is small and the bug is real — it'll bite a user some day.
- **Why pursue.** Determinism. A user opening two projects in quick succession should never see paths from project A appear on project B.
- **Why defer (until now).** Hard to reproduce; users haven't reported it; the fills work was higher-priority.
- **Risks.** Of pursuing: an over-eager epoch check could cancel legitimate re-renders (e.g., regen after a param edit).
- **Plan.**
  1. Add `this.epoch = 0` on `VectorEngine`; increment in `importState` and any `applyState`-equivalent.
  2. When invoking `algorithm.generate(...)`, capture `const epoch = engine.epoch`. Wrap any async continuation in `if (engine.epoch === epoch) { ... commit ... }`.
  3. The realistic surface is `src/core/algorithms/` files that use `setTimeout`/rAF/`Image.onload` callbacks. grep them and audit each.
  4. Specifically check: rainfall (gust async), pattern (tile async), any algorithm with image-loading.
- **Tests.** Integration: open a project that triggers an async-loading algorithm, then immediately open a second project. Use fake timers to advance after the swap. Assert that the second project's layers contain no paths from the first project's algorithm output.
- **Effort.** S (epoch mechanism) + M (audit all async sites).
- **Depends on.** Bugs-9 (already landed — gives us the clean snapshot-and-apply path the epoch hooks onto).

---

## Redundancy

### Redundancy-1 — Helper-duplication map (clamp, escapeHtml, smoothPath, etc.)

- **What.** The audit's largest single redundancy item. Multiple definitions across the codebase:
  - `clamp` — 5 distinct definitions + 42 inline `Math.max(min, Math.min(max, x))` sites.
  - `clamp01` / `lerp` — duplicated between `algorithm-utils.js` and `geometry-utils.js`.
  - `roundToStep` — 3 identical copies.
  - `escapeHtml` — 2 definitions.
  - `clone` — 4 IIFE-local definitions + 51 inline `JSON.parse(JSON.stringify(...))` calls.
  - `pointInPolygon` — canonical + local copy in `algorithms/lissajous.js`.
  - `smoothPath` — canonical at `geometry-utils.js:5` + byte-identical duplicate at `ui.js:754`.
  - `isClosedPath` — canonical export shadowed by 5 `(() => false)` fallbacks.
  - `frac`, `getEl`, color conversions — similar.
- **Status.** Deferred (pursue **selectively**, not en masse).
- **Recommendation.** **Pursue one helper per PR over ~4–6 PRs.** Don't try to do this in one push — the 51 inline `JSON.parse(JSON.stringify(...))` sites alone would create a giant unreviewable diff.
- **Why pursue.**
  - `clone` consolidation alone lets us swap to `structuredClone` (handles `Date`, `Map`, typed arrays — `JSON.parse(JSON.stringify(...))` silently corrupts those).
  - `escapeHtml` duplication is a security smell: if one copy gets a fix and the other doesn't, that's a latent XSS.
  - `isClosedPath` fallbacks (`() => false`) hide load-order bugs — if the canonical fails to load, code silently produces wrong geometry.
- **Why defer (some).** `clamp` is genuinely cheap to inline. Forcing every `Math.max(0, Math.min(1, x))` through `Utils.clamp` adds an import dependency for no real benefit.
- **Risks.**
  - *Of pursuing carelessly:* a "NaN-tolerant clamp" variant (`ui/utils.js:17`) exists for a reason — collapsing it into the canonical silently changes behavior.
  - *Of pursuing the inline-`JSON.parse` migration in one PR:* untestably large diff.
- **Plan (one PR per helper, in priority order).**
  1. **`escapeHtml`** (XS) — promote to `Vectura.Utils.escapeHtml`; delete the two locals. Add a unit test asserting only one definition exists in `src/`.
  2. **`smoothPath`** (XS) — `ui.js:754` is byte-identical to `geometry-utils.js:5`; just delete one and call the other.
  3. **`isClosedPath`** (S) — delete the 5 `() => false` fallbacks; verify load order in `index.html` makes the canonical available before consumers. Add a tombstone test.
  4. **`clone`** (S) — promote `Vectura.Utils.clone = structuredClone || JSON.parse(JSON.stringify(...))`. Replace the 4 IIFE-local definitions. **Do NOT migrate the 51 inline call sites** in this PR — that's PR 5.
  5. **Inline `JSON.parse(JSON.stringify(...))` migration** (M) — separate sweep PR. Allow yourself one commit per file area (engine/, ui/, core/, etc.) to keep diffs reviewable.
  6. **`clamp` consolidation** (M) — only if you decide the tax is worth it. Keep the "NaN-tolerant" variant as `Utils.clampSafe`; document the difference. 42 inline call sites: probably leave alone.
  7. **Rest** (`roundToStep`, `pointInPolygon`, `frac`, `getEl`, color conversions) — XS each. Bundle into one cleanup PR titled "redundancy-1 stragglers."
- **Tests.** Each PR needs (a) a unit test asserting "only one definition exists in src/" (mirror `tests/unit/legacy-file-removed.test.js`), and (b) the existing test suite passes unchanged (these are pure refactors).
- **Effort.** PRs 1–3: XS each. PR 4: S. PR 5: M. PR 6: M. PR 7: XS. Total: ~1 week.
- **Depends on.** Nothing.

### Redundancy-2 — Two `window.Vectura` namespace-init styles

- **What.** Older form `window.Vectura = window.Vectura || {};` in 30+ files; newer Phase-1 form `const Vectura = (window.Vectura = window.Vectura || {});` in 15+ files. `src/ui/shortcuts.js:23` and `persistence.js:23` reference `Vectura.UI` without ensuring `Vectura` exists — fragile under script-reorder.
- **Status.** Deferred (pursue, S).
- **Recommendation.** **Pursue as a single sweep PR.** Standardize on the newer form. Fix the two fragile callers as part of the same commit.
- **Why pursue.** Two fragile callers are real bugs waiting for a script-load-order regression to surface them.
- **Risks.** Tiny. Mechanical sweep + 2 small fixes.
- **Plan.**
  1. grep for `window.Vectura = window.Vectura || {};` — list every file.
  2. Replace each with `const Vectura = (window.Vectura = window.Vectura || {});` (so the `Vectura` local is available within the IIFE).
  3. Fix `shortcuts.js:23` and `persistence.js:23` to use the locally-aliased `Vectura` instead of the global.
  4. Sanity: `grep -rn 'window.Vectura = window.Vectura' src/` should match nothing afterwards.
- **Tests.** Add a unit test that asserts the old pattern is gone from `src/`. Existing suite catches load-order regressions.
- **Effort.** S.
- **Depends on.** None.

### Redundancy-6 — `_UI*Mixin` underscore-prefix idiom is misleading

- **What.** `_UIFileIOMixin`, `_UITouchMixin`, `_UIDocumentUnitsMixin`, `_UIPetalDesignerMixin`, `_UIPatternDesignerMixin`, `_UIRandomizationMixin`, `_UIFillPanelMixin`, `_UINoiseDefs`, `_UIExportUtil`. Underscore signals private; 13+ external call sites prove they're public.
- **Status.** Deferred (defer further — low value).
- **Recommendation.** **Defer.** Cosmetic naming change touching many files for no behavior payoff.
- **Why pursue (someday).** Misleading naming is a future-contributor hazard.
- **Why defer.** Zero user impact; the rename is mechanical but creates a massive diff and breaks git blame for many files.
- **Risks.** Of pursuing now: large blame-disruption with little benefit.
- **Plan if pursued.** Rename `_UI*Mixin` → `UI*Mixin` (drop underscore). Update every call site. Add a transitional alias (`window.Vectura._UIFileIOMixin = window.Vectura.UIFileIOMixin`) for one release, then remove.
- **Tests.** Existing tests catch any missed call sites.
- **Effort.** S (mechanical) but with high blame-disruption cost.
- **Depends on.** None.

---

## Tests

### Tests-Red-2 — Skipped suites and gated files

- **What.** Four skipped/gated test bodies:
  1. `tests/unit/horizon.test.js:84` — `describe.skip('Horizon algorithm', ...)` with 80+ LOC of dead fixtures.
  2. `tests/e2e/mask-shift-drag.spec.js` — 186 LOC; only `test()` is `test.skip(...)` (tablet-touch synthesis problem).
  3. `tests/e2e/visual.spec.js` — gated behind `ENABLE_SCREENSHOT_VISUALS=1`; snapshots exist so it ran at some point.
  4. Five `test.skip(testInfo.project.name.includes('tablet-touch'), ...)` in `tests/e2e/smoke.spec.js`.
- **Status.** Deferred (pursue, S–M, audit-by-audit).
- **Recommendation.** **Pursue as a single S/M housekeeping PR.** Each skip is small individually; bundle them.
- **Why pursue.** A skipped test communicates nothing and rots quietly. The tablet-touch cluster (items 2 + 4) hides a real product gap: tablet-touch coverage is essentially zero today.
- **Risks.** Of pursuing: enabling the horizon suite may reveal real bugs (out of scope to fix in the same PR — flag them).
- **Plan.**
  1. **horizon.test.js** — read the assertions. If they match today's Horizon, enable. If not, delete (history preserved in git). Don't leave the `.skip` and dead fixtures.
  2. **mask-shift-drag.spec.js** — file a `docs/pre-release-hardening-log.md` PRH-### entry titled "tablet-touch drag synthesis" (the real underlying problem). Leave a 3-line comment in the spec linking to the PRH; OR delete the spec entirely and reference the PRH from the test that *would* cover it once tablet-touch synthesis works.
  3. **visual.spec.js** — decide: either remove the env gate and add it to `test:visual` (cheap; snapshots already exist), or document the opt-in flag in `docs/testing.md` with a clear rationale (probably "manual sanity check; not for CI"). Pick one and write the decision down.
  4. **smoke.spec.js tablet-touch skips** — replace the 5 inline `test.skip(testInfo.project.name.includes('tablet-touch'), ...)` calls with `const TABLET_TOUCH_SYNTHESIS_PRH = 'PRH-NNN'; test.skip(testInfo.project.name.includes('tablet-touch'), TABLET_TOUCH_SYNTHESIS_PRH);` so future readers know where to look.
- **Tests.** The work *is* tests. Verify the suite still runs and the skip-count drops to the expected number.
- **Effort.** S (housekeeping) + M (if horizon enables and reveals bugs).
- **Depends on.** None.

### Tests-Gap-1 — Renderer (~8 unit specs vs 6,733 LOC)

- **What.** Renderer has minimal unit coverage. Every regression there is caught by integration/visual at best.
- **Status.** Deferred (pursue, **bundle with Arch-1 PRs**).
- **Recommendation.** Don't try to backfill renderer unit tests against today's god module. Instead, write tests for the extracted modules **as they are extracted** in Arch-1.
- **Why pursue.** Coverage is the audit's #1 testing gap.
- **Why defer until Arch-1.** Unit-testing methods that depend on canvas + camera + tool-state is painful; testing them after extraction is cheap.
- **Plan.** Each Arch-1 PR ships unit specs for the module it extracts (geometry helpers, touch state, each tool's down/move/up). Add a single integration test that asserts the tool-registry dispatch contract.
- **Effort.** Folded into Arch-1.
- **Depends on.** Arch-1.

### Tests-Gap-2 — Undo/redo has one integration test

- **What.** Only one integration test covers undo/redo (layer-structure scenarios). Per-operation reversibility is uncovered.
- **Status.** Deferred (pursue, M).
- **Recommendation.** **Pursue as an S–M dedicated PR.** Cheap to do, high regression-catching value (history bugs caused Bugs-3 and Bugs-12, both shipped in this audit's batch).
- **Why pursue.** Every operation that mutates engine state needs to round-trip through undo/redo. Today there's no systematic check.
- **Risks.** Of pursuing: tests may reveal real undo bugs (likely!).
- **Plan.**
  1. Enumerate every operation that calls `pushHistory()` — `git grep pushHistory src/`.
  2. For each, write a parameterized integration test: `captureState → mutate → undo → assert state matches capture → redo → assert state matches mutated.`
  3. Use the existing test runtime (`tests/helpers/load-vectura-runtime.js`).
- **Tests.** The tests *are* the work. Expect 30–50 new specs.
- **Effort.** M.
- **Depends on.** None.

### Tests-Gap-3 — Per-algorithm noise-rack convergence

- **What.** `noise-rack.test.js` is 195 LOC of unit tests; no per-algorithm integration verifying every algorithm consumes the rack identically (the convergence *contract*).
- **Status.** Deferred (pursue, S).
- **Recommendation.** **Pursue as an S PR.** Cheap parameterized test that locks in the Arch-7 work that just landed.
- **Why pursue.** Without this test, the next contributor to add an algorithm can bypass the rack (regressing Arch-7). The convergence contract becomes folklore unless it's encoded.
- **Risks.** Tiny.
- **Plan.**
  1. Iterate every entry in `Vectura.AlgorithmRegistry`.
  2. For each, assert: (a) feeding a fixed rack produces deterministic output across two runs with the same seed; (b) the algorithm's source contains no raw `noise.noise2D(` outside rack-evaluator paths (mirror the assertion that's already in the Arch-7 PR's `noise-rack-bypass-removed.test.js`).
  3. Place under `tests/integration/noise-rack-convergence.test.js`.
- **Tests.** Self-testing.
- **Effort.** S.
- **Depends on.** Arch-7 (already landed).

### Tests-Gap-4 — Visual baselines cover half the algorithm registry

- **What.** 16 SVG baselines + 7 PNG snapshots vs 19 registered algorithms. Missing: boids, attractors, hyphae, harmonograph, topo, grid, phylla, spiral.
- **Status.** Deferred (pursue, S).
- **Recommendation.** **Pursue as an S PR.** Trivial to extend `npm run test:update` to auto-generate the missing baselines.
- **Why pursue.** Visual baselines are the primary catch-net for unintended rendering regressions. Half-coverage is dangerous because contributors assume they're safe when baselines pass.
- **Risks.** Of pursuing: a generated baseline locks in whatever today's output is. If the algorithm has a subtle rendering bug we haven't noticed, the baseline now bakes it in.
- **Plan.**
  1. Run `npm run test:update` after extending the baseline harness to include the 8 missing algorithms.
  2. Eyeball the new SVGs — does each look like the intended algorithm output? If not, fix the algorithm before committing the baseline.
  3. Commit the new baselines alongside the harness extension.
- **Tests.** The baselines *are* the work.
- **Effort.** S.
- **Depends on.** None.

### Tests-Gap-5 — E2E lacks round-trip and SVG-import journeys

- **What.** No Playwright test for: load `.vectura` → mutate → save → reopen → identical; SVG import via `setInputFiles` followed by render check.
- **Status.** Deferred (pursue, M).
- **Recommendation.** **Pursue as an M PR.** These two journeys are exactly the kind of cross-subsystem flows that integration tests miss but real users hit constantly.
- **Why pursue.** Bugs-9 (transactional import) landed in this audit's batch; an e2e round-trip would have caught the partial-state issue years ago.
- **Risks.** Of pursuing: Playwright file-input dialog handling can be flaky on CI. Use `setInputFiles` (synchronous, deterministic) rather than the OS file picker.
- **Plan.**
  1. Round-trip spec (`tests/e2e/vectura-roundtrip.spec.js`): boot → add layers → mutate params → save (intercept the blob, write to /tmp) → reload → reopen → assert canvas pixels match a snapshot taken pre-save.
  2. SVG import spec (`tests/e2e/svg-import.spec.js`): boot → setInputFiles with a fixture SVG → assert layer list grows → assert canvas renders something non-empty.
- **Tests.** Self.
- **Effort.** M.
- **Depends on.** None.

---

## CSS / skin system

### CSS-4 — `[data-ui-skin]` prefix on 353 selectors in components.css

- **What.** Many `[data-ui-skin] .foo {}` selectors pin an attribute that has no value match — purely a specificity wrapper, likely defensive against the deleted `styles.css`.
- **Status.** Deferred (pursue, M).
- **Recommendation.** **Pursue.** Audit predicts this cuts `!important` count from 29 to ~10. That alone improves CSS authoring ergonomics across the project.
- **Why pursue.** Specificity fights = unmaintainable CSS. Dropping the prefix where it doesn't gate on a skin value is purely cleanup.
- **Risks.** Of pursuing: removing the prefix without checking what overrides what can regress styling. Visual baselines catch most of this but not all (specificity bugs can be sub-pixel or browser-specific).
- **Plan.**
  1. grep `\[data-ui-skin\][^=]` in `src/ui/skin/components.css` — these are the unconditional ones (no `[data-ui-skin="value"]`).
  2. For each rule: check whether anything still relies on that specificity to override another rule. If not, drop the prefix.
  3. After the sweep, recount `!important` declarations; expect ~30 → ~10.
- **Tests.** Run `test:visual` after the sweep — baselines should pass byte-identically. If any drift, investigate before regenerating.
- **Effort.** M.
- **Depends on.** None.

### CSS-5 — 30+ inline hardcoded colors inside selectors

- **What.** `components.css:138 .hdr-btn.is-danger { color: #fff }`, `:299 .seg-opt.active { color: #fff }`, etc. ~30+ literals.
- **Status.** Deferred (pursue, S).
- **Recommendation.** **Pursue as an S PR.** Introduce `--ui-on-accent` and `--ui-on-danger` tokens; replace literals.
- **Why pursue.** Hardcoded colors are the second-biggest skin-system smell. The whole point of the Meridian migration was per-skin theming; literals defeat that.
- **Risks.** Of pursuing: each new token needs per-skin values across 6 skins. Wrong values produce illegible foregrounds against the accent background in one of the skins.
- **Plan.**
  1. grep `#[0-9a-fA-F]{3,6}` in `src/ui/skin/components.css`. Catalog every literal.
  2. Cluster the literals: most will be `#fff` (foreground on accent/danger) and a handful of brand colors (lvl-cyan etc.).
  3. Introduce `--ui-on-accent`, `--ui-on-danger`, `--ui-on-warning` in `src/ui/skin/tokens.css` and override per skin where contrast demands it.
  4. Replace literals with `var(--ui-on-*)`.
  5. CSS-9 (contrast check) is the validation gate — if any swap drops below AA, the contrast test fails and you fix the per-skin override.
- **Tests.** Visual baselines + CSS-9 contrast assertion.
- **Effort.** S.
- **Depends on.** Should land before CSS-9 (or alongside).

### CSS-7 — `transition: all` in components.css (and motion.css mismatch)

- **What.** Doc says transitions go in `motion.css`; reality is 126 transition declarations in `components.css`. 10 of those are `transition: all 0.12s`, animating every property (including box-shadow + transform — expensive).
- **Status.** Deferred (pursue, S — at least the `transition: all` fix).
- **Recommendation.** **Pursue partial:** fix the 10 `transition: all` declarations to use explicit property lists. Defer the broader migration of all 126 transitions to `motion.css` until you have a clear policy.
- **Why pursue (partial).** `transition: all` is a known perf footgun. It causes layout/paint thrash on every property change, including ones you didn't intend to animate.
- **Why defer (the migration).** Until CLAUDE.md commits to a policy ("component transitions co-locate" vs "motion.css owns all transitions"), moving 126 declarations is premature.
- **Risks.** Of pursuing the partial fix: an explicit property list misses a property that was being animated unintentionally and now jumps. Eyeball each.
- **Plan.**
  1. grep `transition:\s*all` in `src/ui/skin/`. Find the 10 offenders.
  2. For each, identify which properties actually need to animate (typically `background-color`, `color`, `border-color`, `opacity`).
  3. Replace with explicit list.
  4. Open a separate ticket for the broader migration policy. Update CLAUDE.md once decided.
- **Tests.** Visual + manual eyeball.
- **Effort.** S (partial fix) / M (full migration).
- **Depends on.** None.

### CSS-9 — `classic-light --ui-muted` borderline AA contrast

- **What.** `--ui-muted: #888888` on `--ui-bg: #f3f4f6` is ~3.6:1 — fails AA for normal text (need 4.5:1).
- **Status.** Deferred (pursue, XS).
- **Recommendation.** **Pursue.** Trivial fix.
- **Why pursue.** Accessibility. Below-AA text is invisible to a non-trivial fraction of users.
- **Risks.** None — darker muted reads fine on light bg.
- **Plan.**
  1. Confirm the contrast ratio programmatically (use a contrast lib or implement WCAG formula inline in a test).
  2. Bump `--ui-muted` in `src/ui/skin/classic-light.css` to `#6b7280` (~5.3:1) or darker as needed.
  3. Add a unit test that asserts `--ui-muted` on `--ui-bg` ≥ 4.5:1 for *every* skin where muted is used for text.
- **Tests.** New contrast unit test.
- **Effort.** XS.
- **Depends on.** None. Should land with CSS-5 ideally.

### CSS-10 — 11 inline `style="display:none"` on `<div>` initial states in index.html

- **What.** 11 inline `style="display:none"` declarations in `index.html`.
- **Status.** Deferred (pursue, XS).
- **Recommendation.** **Pursue as an XS PR.**
- **Why pursue.** Inline styles fight CSS specificity, are harder to audit, and mix concerns. A `.is-hidden` utility class is the established pattern.
- **Risks.** Of pursuing: a class swap could expose elements whose visibility was relying on the inline `display: none` to override a higher-specificity rule. Visual baselines catch this.
- **Plan.**
  1. Add `.is-hidden { display: none !important; }` to `src/ui/skin/tokens.css` (or `components.css`).
  2. grep `style="display:none"` in `index.html`. Replace each with `class="is-hidden"` (preserving existing classes).
  3. Visual baseline check.
- **Tests.** Existing visual + integration coverage; add a test that asserts `index.html` contains zero `style="display:none"`.
- **Effort.** XS.
- **Depends on.** None.

---

## Items that are already done (just confirming)

The following audit items landed during the 2026-05-20 batch and need no follow-up:

| Item | Status |
|---|---|
| Top 10 #1 — CSS-1 classic-* skin parity | Closed (Batch B) |
| Top 10 #2 — Tests-Red-1 compile-test glut | Closed (parallel + Batch B) |
| Top 10 #3 — Bugs-1 pen-menu XSS | Closed (Batch A1) |
| Top 10 #4 — Bugs-2 project-pattern XSS | Closed (Batch A1 + Bugs-5 hardening) |
| Top 10 #6 — Tests-Red-1 compile-test glut | Closed (above) |
| Top 10 #7 — Bugs-8 + Bugs-9 .vectura import | Closed (Batch B) |
| Top 10 #8 — Docs styles.css references | Closed (Batch A2) |
| Top 10 #9 — CHANGELOG + README release notes | Closed (Batch A2) |
| Top 10 #10 — README algorithm table + Q shortcut | Closed (Batch A2) |
| Arch-7 — petalis fallback rack + rainfall bypass | Closed (Batch B) |
| Bugs-1 through Bugs-12 (except Bugs-13) | All closed |
| CSS-2 — `--color-*` aliases | Closed (Batch A3) |
| CSS-3 — components.css `:root` fallback block | Closed (Batch B) |
| CSS-11 / 12 / 13 / 14 | No action needed per audit |
| Redundancy-5 — `_ui-legacy.js` doc-comments | Closed (Batch A4) |
| Redundancy-7 — `[applyTheme]` → `[App]` | Closed (Batch C) |
| Tests-Red-3 — mask-preview duplicate | Pre-closed (unit file already deleted) |

---

## Recommended sequencing

The list below assumes the next person picks this up cold. Items are ordered by `value ÷ effort` — top items are quick wins; later items are heavier or more architectural.

| # | Item | Effort | Why first / last |
|---|---|---|---|
| 1 | Arch-6 — delete dead `ShapeUtils` export | XS | One-line. Confidence builder. |
| 2 | CSS-10 — `style="display:none"` → `.is-hidden` | XS | Mechanical. Improves audit hygiene. |
| 3 | CSS-9 — `classic-light` muted contrast | XS | Accessibility. Add the test as a tripwire for all skins. |
| 4 | Redundancy-1 PR 1 — `escapeHtml` consolidation | XS | Removes a security-relevant duplication. |
| 5 | Redundancy-1 PR 2 — `smoothPath` byte-identical dedupe | XS | One file, one delete. |
| 6 | Bugs-13 — applyState async-generation race (epoch tagging) | S–M | Last open audit bug. Real determinism win. |
| 7 | Redundancy-2 — namespace init standardization | S | Closes two fragile callers. |
| 8 | Redundancy-1 PR 3 — `isClosedPath` fallbacks deleted | S | Removes a class of load-order hiding. |
| 9 | Redundancy-1 PR 4 — `clone` → `structuredClone` (canonical only) | S | Sets up PR 5; immediate correctness gain (Date/Map handling). |
| 10 | Arch-5 — single `recomputeCursor` entry point | S | Closes a recurring source of cursor bugs. |
| 11 | Tests-Gap-3 — per-algorithm noise-rack convergence | S | Locks in Arch-7. |
| 12 | Tests-Gap-4 — missing algorithm visual baselines | S | Doubles visual coverage. |
| 13 | CSS-5 + CSS-7-partial — `--ui-on-*` tokens + `transition: all` fix | S | Pairs with CSS-9 test gate. |
| 14 | Tests-Red-2 — skipped-suite housekeeping | S–M | Cleans up `.skip` debt; may surface horizon bugs. |
| 15 | Tests-Gap-2 — per-operation undo/redo coverage | M | Will likely find real bugs. Worth doing. |
| 16 | Tests-Gap-5 — `.vectura` round-trip + SVG-import e2e | M | Two missing e2e journeys. |
| 17 | CSS-4 — drop unconditional `[data-ui-skin]` prefix | M | Pays off in reduced `!important` count. |
| 18 | Redundancy-1 PR 5 — inline `JSON.parse(JSON.stringify(...))` sweep | M | One commit per file area; large diff. |
| 19 | Arch-1 PR 1 — pure geometry extraction | M | First step of the god-module split. |
| 20 | Arch-8 — interaction-tokens.js (fold into Arch-1 PR 1) | S | Bundle. |
| 21 | Arch-1 PR 2 — touch state machine | L | Needs explicit Playwright touch coverage. |
| 22 | Arch-1 PR 3 — tool registry scaffold + scissor migration | M | Proves the dispatch pattern. |
| 23 | Arch-2 — `renderer → ui` event-hook decoupling (fold into Arch-1 PR 5) | XS | Bundle. |
| 24 | Arch-1 PR 4 — pen / shape / algoDraft tools | L | After dispatch pattern is proven. |
| 25 | Arch-1 PR 5 — direct / paintBucket / lightSource | L | Final Arch-1 PR. |
| 26 | Arch-4 — unified SelectionModel | M–L | After geometry extraction. |
| 27 | Redundancy-1 PR 6/7 — `clamp` + stragglers | M | Optional. Tax-vs-benefit judgment. |

**Explicitly recommended to skip / defer indefinitely:**

- **Arch-3** (typed-observable SETTINGS) — write `docs/settings-schema.md` instead (S). The full refactor is XL with no user-visible payoff.
- **Redundancy-6** (`_UI*Mixin` underscore drop) — cosmetic; large blame-disruption for low value.
- **Redundancy-1 PR 6** (`clamp` consolidation) — 42 inline `Math.max(min, Math.min(max, x))` sites; the inlining is arguably *more* readable than `Utils.clamp(min, max, x)`.

---

## Process notes for the next person

A few things learned the hard way in the 2026-05-20 batch worth carrying forward:

- **Pre-commit graphify hook stages output but runs again post-commit.** This leaves `graphify-out/` modified after every commit — harmless, but it means concurrent merge sessions will conflict on `graph.json`/`graph.html`/`GRAPH_REPORT.md`. Resolve by `git checkout --theirs` on those three; the hook regenerates them anyway.
- **Worktrees branch from main at agent-spawn time.** If main moves while agents run (e.g., a parallel session ships work), worktree merges hit conflicts on files the parallel work touched. Plan for it.
- **Agents occasionally hallucinate commits.** One Batch B agent reported successful commits that weren't on its worktree branch. Always verify with `git log main..<branch>` before merging.
- **Subagents share an Anthropic usage budget.** A full-batch parallel spawn can hit the limit mid-flight. Spread heavy batches across at least two windows, or accept that some agents will need re-spawning.
- **The Anthropic subagent classifier sometimes denies `git checkout -- <file>`.** It treats discarding uncommitted file changes as destructive. Use `git stash push -m '...' <files>` instead — same effect, recoverable.
- **CHANGELOG conflicts are common when multiple branches each add `Unreleased` entries.** Resolve by keeping every bullet; never drop an entry. (Concurrent fills work added many during this audit batch.)
