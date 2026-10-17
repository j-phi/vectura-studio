# Render-test workload reductions

Status: merged in PR #99 (hosted run 38781571763 passed); local certification also passed. Candidate is based on `be12125fb4ddb61eea78a281d5e888b453f2049b` (includes the deterministic legacy-density seed fix). The source payload captured before certification has internal SHA-256 `f473c39a997e0b481746952e3be0d987bba8ce50f614febf999774e58bec4bac`; all 1,183 recorded file hashes matched at run time, and both approved retired files were absent. The coverage run and strict profile used that frozen payload. The later weight-file refresh is derived from its measured profile.

## Approved trade-offs

- Retire `tests/unit/scene3d-ribbon-degeneration-counter.test.js`. This removes dedicated counter-sum accounting and a broad diagnostic sweep. No app/UI/renderer consumer of `lastRibbonStats` was found; audit/evidence scripts use it. Accept less diagnostic-accounting protection, retaining real geometry, erosion refusal and forced fill-depth failure guards.
- Retire `tests/integration/expand-scene3d-fidelity-two-laws.test.js`. Accept loss of the named interlockWeave/amplitudeOnly expansion samples. Retain generic object-child raster fidelity, ground/light/non-3D behavior, and width-to-strokes checks. This is a sampling decision, not identical remaining coverage.
- Remove unused blank-map calculations and unrelated amplitude-revert controls. Preserve actual visible width floors, amplitude behavior and meaningful blank-region gates.
- Narrow repeated primitive/density/band-count matrices and historical goldens to distinct routes, boundary cases and known-defect witnesses. Preserve cheap full resolver tables, legacy alias rendering/migration, object scope, default/state isolation and mutation-sensitive output checks.

## Boundaries

Do not change product algorithms, coverage thresholds, skip allowances, per-test deadlines, engine/pool or CI topology. Raw `buildObject` weights and composed output are different seams; retain the raw invariant. Width floors and filled area are different observables. Keep the real-coordinate ribbon-region test rather than the weaker stand-in style comparison. Current runtime loads ribbon modules; old comments stating otherwise were stale.

Matrix/render-count reductions are structural facts, not projected wall-clock savings. Global ratchets remain statements 74%, branches 62%, functions 74%, lines 76%. Two file retirements change the expected tree from 765 to 763 files; strict inventory still follows the current tree and the 57-skip baseline is unchanged. Any unexpected coverage or sensitivity loss must be repaired without lowering thresholds.

## Verification record

Local validation passed:

- Lifecycle: `npm run test:runner` passed 16/16.
- Full V8 coverage: `VECTURA_TEST_TIMEOUT_MS=14400000 npm run test:coverage -- --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=coverage/vitest-full.json` passed 762 files and the one approved fully skipped file (763 inventoried); 8,372 test cases passed and the existing 57 skipped assertions were unchanged. Coverage was statements 76.05% (81,223/106,801), branches 63.79% (50,349/78,919), functions 76.00% (10,749/14,142), and lines 77.97% (66,579/85,380), above unchanged ratchets of 74/62/74/76%. Vitest reported 2,119.51s; `/usr/bin/time -l` measured 2,121.57s wall, 4,712.45s user CPU, 288.06s system CPU, and 1,635,942,400 bytes maximum resident set size (OS-reported command maximum, not a process-tree peak). The 4-hour allowance applied only to this whole run; per-test deadlines and repository defaults did not change.
- Strict inventory/profile: `npm run test:profile -- --strict --results coverage/vitest-full.json --log /private/tmp/test-cuts-full-coverage.log --output coverage/full-profile.json` passed all 763 inventory records and the approved 57-skip policy. The profile has 762 timed files because the all-skipped file has no positive duration. No files or assertions are missing from the JSON run.
- Browser roster: `npm run test:e2e` passed 68 with 15 configured skips (83 total) in 57.3s; timed wrapper was 58.26s wall, 190.45s user, 51.00s system, and 611,188,736 bytes maximum RSS.
- Uninstrumented performance: `npm run test:perf` passed 13/13 across six files in 4.78s wall, 9.19s user, 0.97s system, and 478,658,560 bytes maximum RSS.
- After refreshing weights, focused `test-shard-plan`, `test-profile`, and `lane-routing` tests passed 33/33. A fresh local plan partitions the 763-file inventory 381/382 with estimates 1,907.678/1,907.677 seconds. These estimates balance the two hosted shards; they are not a prediction of whole-run wall time. The new weights use 762 positive file durations (3,796.000 accumulated file-seconds, overlapping across workers) and a 19.355-second positive-duration 95th-percentile fallback for the approved fully skipped file and future unknown files. No zero duration was invented.

For context, ordinary-main run 38650016325 recorded 53m20s from plan to coverage completion, 53m56s through all required checks, and 102m35s of allocated coverage-subtree time. The candidate's local coverage observation is not a controlled speed comparison with that hosted run. It is one cross-revision observation on an equivalent application payload; no sub-ten-minute or general speedup claim is made. Exact-SHA hosted PR checks passed in PR #99. See `docs/test-performance-lessons.md` for the timing history.
