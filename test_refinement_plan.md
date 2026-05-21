# Test Suite Refinement Plan

## What the Suite Gets Right

Before the gaps: the foundation is genuinely strong.

- **Real cross-module integration tests.** `loadVecturaRuntime()` loads real engine + renderer + UI together. Tests call actual public methods (e.g. `app.ui.groupSelection()`, `app.undo()`) and verify real state mutations — not mocked return values.
- **Excellent security testing.** XSS corpus in `tests/fixtures/svg-attacks/`, idempotency proofs, over-stripping negative checks, multi-layer sanitizer → registry → UI coverage.
- **Real Playwright E2E.** Real browser, real mouse/keyboard events, `expect.poll()` dominates (31 occurrences vs. 12 strategic waits). Tests verify observable end-states (canvas pixels, DOM counts, JS settings).
- **Geometric/math assertions are precise.** Consistent `.toBeCloseTo(n, precision)`, involution proofs, centroid sweep direction, path signature fingerprinting.
- **Clear behavioral test naming.** Most tests read as specifications: *"selecting the whole mask group suppresses re-mask preview so geometry moves rigidly"*.

---

## Findings

### S1 — Immediate

**No coverage thresholds in `vitest.config.mjs`**
- `vitest.config.mjs:12-17`: `coverage` block has provider/reporter/include but no `thresholds` key.
- Coverage can erode silently; CI will never fail due to a drop in function/line coverage.

**Vestigial wrapper in new test `tests/integration/mask-preview-group-drag.test.js:84`**
- Test 3 calls `runtimeScene(runtime.window)`; tests 1 and 2 call `buildScene()` directly.
- `runtimeScene` (line 84) is just `return buildScene(window)` — no added logic.
- Not a runtime error (function hoisting saves it), but signals an abandoned refactor.

---

### S2 — Structural Gaps

**Happy-path dominance (~95% of tests)**
- Integration suite (208 tests): ~5% test error conditions. E2E suite (34 tests): 0%.
- Missing high-value scenarios:
  - Disjoint pathfinder crop → null result
  - Import of corrupt / missing-viewBox SVG
  - Undo stack at depth limit
  - Recursive mask hierarchy (A masks B masks A)
  - `engine.generate()` on a layer with NaN/Infinity coordinates
  - 0-layer document open/save roundtrip

**Critical source modules with zero unit test coverage**

| Module | Why it matters |
|---|---|
| `src/core/paint-bucket-ops.js` | Flood fill algorithm — entire feature untested |
| `src/core/pathfinder-ops.js` | Boolean union/difference/intersect — complex geometry, bug-prone |
| `src/core/pen-validate.js` | Path validation gate — errors here corrupt saved files |
| `src/core/align-ops.js` | Multi-selection alignment — used constantly in UI |
| `src/core/utils.js` | Wide surface, widely consumed |
| `src/core/validators.js` | Input validation predicates |

Note: `pathfinder-panel.test.js` (integration) exercises the pathfinder *workflow* but not the underlying ops in isolation. Edge-case geometry (degenerate polygons, self-intersecting paths, empty result sets) is untested.

**Performance tests have no regression gates**
- `tests/perf/stress.test.js`: 2 tests, both use `<10s` as the only pass/fail bar.
- A 3× slowdown in flowfield generation would pass as long as it finishes in <10s on a fast machine.
- Fix: record median timing in a committed `tests/perf/baselines.json`; fail if current run exceeds `baseline × 1.5`.

---

### S3 — Quality Refinement

**Component tests couple to DOM selectors, not behavior**
- `tests/unit/components/slider.test.js` and similar: assertions check `.querySelector('.slider-row')` and `--fill` CSS variable values.
- If a class name is refactored, the test breaks even though the slider still works correctly.
- Preferred: test through `getValue()`, `onChange` callback values, and keyboard interactions only.

**Seeded algorithm determinism tested implicitly, not explicitly**
- Most algorithm tests set `seed: 1` for reproducibility but none *assert* same-seed → identical output.
- A broken RNG seeding path would manifest as visual regressions rather than a failing unit test.

**80ms hardcoded UI settle delays in E2E are CI-fragile**
- `page.waitForTimeout(80)` in `tests/e2e/smoke.spec.js` and `core-interactions.spec.js`.
- On slow CI runners, 80ms may not be enough. Replace with `expect.poll(() => <observable condition>)`.

---

## What Does NOT Need Fixing

- **56 UI files (panels, modals, overlays, components) with no direct unit tests.** Thoroughly exercised by integration tests. Isolated unit tests for JSDOM-heavy components would create fragile, high-maintenance coverage.
- **`vitest.config.mjs` environment: 'node'** — The manual JSDOM loading pattern is intentional.
- **`runtimeScene` not being a runtime error** — hoisting saves it; the issue is clarity only.

---

## Action Items (Prioritized)

| Priority | Action | File(s) | Effort |
|---|---|---|---|
| P0 | Add coverage thresholds to Vitest config | `vitest.config.mjs` | 5 min |
| P0 | Remove `runtimeScene` wrapper (call `buildScene` directly) | `tests/integration/mask-preview-group-drag.test.js:64,84-86` | 5 min |
| P1 | Add unit tests for `pathfinder-ops.js` (empty result, degenerate input) | new `tests/unit/pathfinder-ops.test.js` | ~2h |
| P1 | Add unit tests for `paint-bucket-ops.js` | new `tests/unit/paint-bucket-ops.test.js` | ~2h |
| P1 | Add ~10 negative integration tests (null pathfinder, corrupt SVG import, undo at limit) | new `tests/integration/error-paths.test.js` | ~3h |
| P2 | Add perf baseline JSON + threshold check | `tests/perf/stress.test.js`, new `tests/perf/baselines.json` | ~1h |
| P2 | Add determinism assertions to 3-4 algorithm unit tests | existing algorithm test files | ~1h |
| P3 | Replace hardcoded 80ms waits with `expect.poll()` predicates | `tests/e2e/smoke.spec.js` | ~1h |
| P3 | Trim DOM-structure assertions from component tests | `tests/unit/components/slider.test.js` et al. | ~1h |

---

## Verification

After any of the above changes:
- `npm run test:unit` — for P0/P3 component changes
- `npm run test:integration` — for P1 error-path additions
- `npm run test:perf` — for P2 baseline work
- `npm run test:ci` — final confidence gate before merging

---

## Cleanup

After all items above are implemented and merged: `rm test_refinement_plan.md`
