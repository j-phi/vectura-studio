# Test-suite acceleration punchlist

Status: source implementation and targeted verification complete, 2026-10-11; full audit/coverage and hosted promotion evidence remain open. Checkmarks below describe implemented source, not certification of the full audit or hosted latency targets.

## Implementation batch
- [x] Fresh focused runtime profiles and immutable compiled-script caching.
- [x] Pure-test migration with load-order/isolation/cache/override contracts.
- [x] Physical exhaustive rendering/history/mutation audit split with live regression guards.
- [x] Reused immutable render summaries; fresh determinism/mutation execution.
- [x] Explicit fail-closed path/risk router and all required critical canaries.
- [x] Queued local lanes and complete single-invocation E2E roster.
- [x] GitHub required-check topology, telemetry, shadow evidence and promotion guard.
- [x] Full-scope coverage/audit and process lifecycle protection retained.
- [x] Consolidate source architecture scans while preserving six contracts.
- [x] Synchronize workflow/testing/governance documentation.

## Independent review
- [x] Separate Sol adversarial review: `test-suite-acceleration-review.md`.
- [x] Separate Sol adjudication: `test-suite-acceleration-adjudication.md`.
- [x] Second small-agent batch resolves the adjudicated punchlist.
- [x] Integrated checks and measured feedback evidence: complete warm lane23s.

## Runtime goals
- Warm local feedback: under60s after queue acquisition.
- Ordinary GitHub PR: under5min to all required checks green, with hosted wait visible.
- High-risk required GitHub checks: under10min where protection can be preserved.
- Audits: remove duplicate work and constrain elapsed time and total runner-minutes.

The baseline measured earlier CI revisions; current implementation must be measured.
Future shadow changes/CI percentile samples cannot be represented as completed local work.

## Adjudicated second batch (complete)
- A, isolated `test-fix-routing`: conservative deadlines, feedback-only hook, queue timing, strict full shadow roster/promotion/p95, Scene3D audit routing.
- B, isolated `test-fix-audits`: remove duplicate copies, repair sequential runtime consumers, independent aggregates, retain known-defect witnesses.
- C, isolated `test-fix-feedback`: critical regression roster, real canvas geometry witness and negative control, coverage/cache contracts.

No review blocker is marked resolved until the integrated source and applicable checks substantiate it.

## Completed verification so far
- Integrated focused selection: 19 files / 154 passed / 13 existing skips, 11.22s execution after 11m52s queue wait.
- First expanded feedback attempt: 51 passed, one new ribbon placement-oracle failure; execution17s before browser. Fixture corrected; final complete feedback rerun passed in23s.
- Preserved audit experiment: one worker, five-minute deadline; exited124 after300s. Full audit certification remains open.
- Publication validation on current main `0e8436df`: complete queued `npm run test:ci` passed (501 unit files/6404 tests;245 integration files/2071 tests;68 browser tests;99 visual tests;13 performance tests). Existing skips:44 unit,15 browser,13 visual. Unit922.69s;integration494.29s;browser50.8s;visual10.47s;perf3.59s. Current-main feedback passed21s; focused3D selection41passed/13existing skips1.46s. Full-scope coverage and exhaustive audit certification remain separate and open.

## Review resolution map

| Finding | Source correction | Verification |
| --- | --- | --- |
| Duplicate audit copies / stale runtimes | One top-level set; sequential owned runtime consumers | Static import/ownership checks pass; full audit hit five-minute experiment deadline |
| CI bounds below historical runtime | Conservative broad-job bounds; separate 60s feedback execution budget | Source reviewed; hosted measurements pending |
| Canvas background false positive | Real geometry versus empty-geometry canvas comparison | Browser geometry and actual stats-refresh checks passed |
| First push / slow local hook | Feedback-only hook for every non-deletion push | Hook first-push contract passed |
| Shadow aggregate hides failures | Every retained full job required | Manual docs-only/failed-unit probe rejects; unit contracts passed |
| Sparse/stale promotion | Complete GitHub provenance, unique job roster, latest run, terminal representative green sequence | Positive complete20-run and negative sparse/stale/conflicting/retry fixtures passed |
| Queue deadline / missing wait telemetry | Queue acquisition outside lane timer; structured wait milliseconds | Initial final feedback waited51s then executed17s; contracts passed |
| Premature/mixed p95 | Separate lane/risk/cold groups; suppress below30 samples; uncertainty and partial timing scope explicit | Sample-floor fixtures passed |
| Missing critical checks / Scene3D under-routing | Explicit nine-file critical roster and Scene3D audit rule | First critical run51passes; compact ribbon rerun passed; final complete lane passed23s |
| Incomplete memory pruning | Scalar fill summaries, only consumed rasters/geometry retained; sequential mutant teardown | Static consumer review; ten-sample audit RSS snapshot recorded |
| Coverage cache attribution | Explicit marker disables cache, with actual bypass contract | Loader contracts passed; instrumented attribution probe passed |
| Cancellation can exit zero | Cancelled lane returns130 even if child returns0 | Process-level cancellation contract passed |

## Outstanding evidence (must not be silently checked off)
- [x] Complete corrected feedback/browser run:16 lifecycle +52 Vitest +1 browser,23s execution. Final review-fix selection22passed in1.20s.
- [ ] A completed full preserved audit and full-scope coverage run. The bounded audit attempt exited124 after300s; no audit pass is claimed.
- [x] Instrumented source-attribution diagnostic:14passed in430ms; real `src/core/rng.js` attributed with10/11 statements and4/5 functions hit. This selected scope is not full-suite coverage.
- [ ] Real hosted PR setup/queue/all-required-status timing and runner-minute evidence.
- [ ] Twenty representative complete shadow changes and minimum30 comparable observations for each published p95 class before promotion.

No GitHub branch rules were changed, and no push, release, or merge was performed.

Complete E2E roster verified locally under the180s bound:67passed,15 existing optional/project-specific skips,84.45s shell elapsed. The previously omitted programmatic mask test runs and passes; its pre-existing disabled real-mouse counterpart remains disabled.

Queue and wrapper policy contracts:32passed in8.39s after restoring the compatible human-readable acquisition message alongside the structured wait event.

## Publication workflow correction
GitHub rejected the first workflow before creating jobs because `runner.temp` was used in job-level `env`. Timing paths now live in step-level `env`, where the runner context is available. YAML parsing and whitespace checks passed; hosted validation must confirm the correction. The complete local test:ci result above remains applicable because no test or product code changed.
