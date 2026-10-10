# PERF-HARDEN impl report

Commit 84ec6ff2 on 3d-scene/perf-harden-b8 (worktree .claude/worktrees/perf-harden-b8). Not pushed. No src change.

## Bars changed
- tests/perf/scene3d-drag.test.js:158 — clipPath time ratio hlr24/hlr6 < 6 -> occluder candidate-test count ratio < 8 (indexed 5.95, forced linear 9.73) — time ratio flaked 7.7-11.9 under load.
- tests/perf/scene3d-drag.test.js:159 — new: n24 candidate tests < 4,000,000 (indexed 436,657; linear 49,093,110) — sharp discriminator, 10x margin each side. The ratio alone is close (5.95 vs 9.73).
- tests/perf/scene3d-drag.test.js:~165-195 — draft turingStripe/ladder time ratio < 1.5 -> identical draft path JSON plus zero Regions.combinedIntensity calls in draft — time ratio flaked 1.50-1.62.
- tests/perf/scene3d-shadow-drag.test.js:91-92 — shadow clipPath time ratio t24/t6 < 6 -> count ratio < 12 (indexed 7.83, linear 18.03) plus n24 < 200,000 (indexed 64,446, linear 448,721). Same flake class, not named in the brief.
- Kept: 2000 ms draft frame smoke ceiling.

## Method
tests/helpers/occluder-scan-counter.js wraps each occluder from HLR.createClipper with a getter on objectId. hiddenAt reads it once per candidate. Test-side only; no src change.

## Mutations
- HLR.__forceLinearScan = true: HLR guard fails (9.73 > 8); shadow guard fails (18.03 > 12).
- Removing `!draft` from toneOn (scene3d.js:1619): draft guard fails (3196 combinedIntensity calls).
- Output equality alone needs three draft gates removed to trip (1619, 2292, 3107), so the intensity-call count is the sensitive signal.
- Control: non-draft output differs between laws.

## Perf runs (npx vitest run tests/perf, 5 files, 10 tests)
1. load 38.5 / 33.4 / 36.3 — pass
2. load 39.6 / 33.7 / 36.4 — pass
3. load 39.6 / 33.7 / 36.4 start, 46.1 end — pass

## Other timing asserts (all absolute ceilings, not ratios; unchanged)
- tests/perf/wallpaper-preview-batch.test.js:68 elapsed < 200 ms (25 warm cache calls). Tightest; watch.
- tests/perf/smart-guides-drag.test.js perFrame < 8 ms.
- tests/perf/stress.test.js 10000 ms; wallpaper-preview-batch 2000 ms.
- tests/unit/scene3d-contour-slice.test.js:177 8000 ms; scene3d-curved-density-floor.test.js:212 and scene3d-hatch-density-500.test.js:241 3000 ms.
