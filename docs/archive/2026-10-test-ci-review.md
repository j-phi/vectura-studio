> **Archived 2026-10-18.** Adjudicated plan of the October 2026 test and CI review (branch `ci/test-overhaul`). History only. The current system is described in [docs/testing.md](../testing.md).

# Judgment: testing and CI reviews (vectura-studio)

Date: 2026-10-17. Judge: independent. Inputs: `review-senior.md`, `review-scrappy.md`, `review-adversarial.md`. Tree: `main` at `fcedef03`. I ran read-only checks only.

Yardstick: make CI faster and leaner. Do not lose true testing power. Remove tests that only pin a past patch. Keep tests that guard real risk or act as canaries.

---

## 1. Facts I settled

| # | Claim | Verdict | My evidence |
|---|---|---|---|
| F-1 | Branch protection is off on `main` | **TRUE** | `gh api .../branches/main/protection` returns 404 "Branch not protected". `rulesets` returns `[]`. Repo is public and owned by a User. |
| F-2 | PR #104 merged with checks still running | **TRUE, and worse** | Tests run 39033680097 was created 12:43:47Z. The PR merged 12:43:50Z, three seconds later. No Tests job had started. The first job started 12:53:43Z. `lane-gate` finished 13:10:04Z. |
| F-3 | Nightly shares a concurrency group with push-to-main | **TRUE** | `test.yml`: `group: ${{ github.workflow }}-${{ github.event.pull_request.number \|\| github.ref }}`. Schedule and push both resolve to `Tests-refs/heads/main`. `cancel-in-progress` is false for both. Today: nightly 39030669232 started 11:57:52Z and is still `in_progress`. Main pushes 39033492700, 39033522557 and 39033582416 were cancelled while pending. 39033686706 is still pending. |
| F-4 | Release installs only Chromium but runs WebKit projects | **TRUE** | `release.yml` runs `npx playwright install --with-deps chromium`, then `npm run test:lane -- audit` → `test:audit` → `playwright test tests/e2e`. It does not set `PW_TOUCH_PROJECTS=0`. So `playwright.config.js:118` adds the 7 Chromium and 4 WebKit touch projects. WebKit projects arrived in 9398bd92 (2026-10-02). The last release (v1.4.0) ran on 2026-09-08. The next tag will fail. |
| F-5 | `tests/audit/` runs in PR coverage | **TRUE** | `vitest.config.mjs:10-11`: include `tests/**/*.test.js`, exclude only `tests/e2e/**`. The PR shard config only adds a sequencer. Audit = 16 files, 1,411 file-s (17.5 %). |
| F-6 | Unweighted-shard fallback value | **Adversary is right** | `unknownFileWeightSeconds` = 19.355 s. The real p95 of the weights is 62.8 s. The median is 1.20 s. The label "p95" is wrong. |
| F-7 | Shard spread comes from unweighted files | **FALSE** | At `bca5a8f3` (run 38979313773) the inventory had 784 files and 0 unweighted. Shards still ran 3m16s to 6m52s. At HEAD, 52 of 836 files are unweighted (all from PR #102). |
| F-8 | Coverage overhead is about 1.6× | **UNSUPPORTED** | `docs/test-suite-phase2.md:11`: coverage 96m32s vs unit 39m12s + integration 21m41s. Coverage also ran audit, visual and perf. A near-identical main tree ran coverage in 62m02s. The ratio is not a controlled measurement. The adversary's 1.2–1.3× is also an estimate. Treat the factor as unknown. Measure it once. |
| F-9 | `git show HEAD:` legs | **Adversary is right** | Only `tests/unit/scene3d-slice-end-overlap.test.js:131` still reads `HEAD:`. `mkdashramp-low-end` uses a pinned SHA and warns against HEAD. 21 test files call git in some form. 31 files use `scriptOverrides`. |
| F-10 | Shallow clone breaks a test silently | **TRUE** | `tests/unit/touch-baseline-waiver.test.js:52-53` returns early when the anchor commit is missing. In a shallow clone the live check passes with no assertion. |
| F-11 | SVG goldens miss half the algorithms | **Adversary is right** | Goldens exist for topoform, wavetable, harmonograph and spiral. Missing: attractor, boids, grid, halftone, hyphae, image-weave, pattern, pendula, phylla, svgdistort, topo. |
| F-12 | No whole-preset sweep | **TRUE** | `preset-library-contract` and `scene3d-preset-library` check ids. `factory-preset-inactive-mode-pins` and `algorithm-switch-loads-factory-default` check defaults. None loads every `.vectura` preset, generates, exports and round-trips. `tests/fixtures/` holds no legacy `.vectura` file. |
| F-13 | Concurrency limit hurts real PRs | **NEW, TRUE** | Both reviewers measured a solo run (8–9 min). Today three PRs and three main pushes overlapped. PR #104's run waited 10 min for its first job and 14 min for its shards. Its wall time was **26 min**. Under burst merges, the job slot limit dominates wall time, not shard speed. |
| F-14 | Merge queue is available | **Probably FALSE** | GitHub merge queue needs an organization-owned repo. This repo is user-owned. |

---

## 2. Verdict on every source ID

Legend: A = ACCEPT, AM = ACCEPT-MODIFIED, R = REJECT, U = NEEDS-USER-DECISION. "→ R-n" names the consolidated item.

### Senior questions and architecture

| ID | Verdict | Note |
|---|---|---|
| Q-1 | A, answered | No check is required (F-1). → R-1, R-7 |
| Q-2 | A, answered | The limit bites under bursts (F-13). → R-7, R-17, D-9 |
| Q-3 / Q-8 | A | Main was red 10 days on a ratchet false positive. Nobody owns red main. → R-5 |
| Q-4 | U | The only observed fire was a tooling false positive. → R-21 |
| Q-5 | U | → D-5 |
| Q-6 | A | → R-22 |
| Q-7 | U | → D-6 |
| Q-9 | AM | Provenance chain defends a theoretical risk. Keep it while coverage merges on PRs. Simplify after R-21. |
| Q-10 | A | → R-35 |
| A-1 | AM | The coupling is real. The 1.6× number is not (F-8). → R-21 |
| A-2 | A | → R-17 |
| A-3 | A | True, and the adversary shows it is unfixable by S-2. → R-24 |
| A-4 | A | → R-13, R-24 |
| A-5 | A | → R-18 |
| A-6 | A | → R-30 |
| A-7 | A | → R-22 |
| A-8 | A | → R-11 |
| A-9 | AM | Reframe: main is under-tested today, because pushes are cancelled (F-3). → R-2, R-20 |

### Senior S-*

| ID | Verdict | Modification / reason |
|---|---|---|
| S-1 | AM | Use the wider path list: scene3d paths **plus** `src/core/{path-boolean,geometry-utils,fill-boolean,pen-fill}.js`, `src/core/algorithms/geometry3d.js`, `src/config/scene3d-*`, `tests/{audit,helpers,fixtures}/**`, and test-infra files. Do not route on `src/config/**`. Needs R-1 and R-5 first. → R-17 |
| S-2 | R | The fix cannot reach a non-full class. Every code PR touches `tests/` and the bumped `package.json`. |
| S-3 | AM | Median (or per-directory median) fallback now. Refresh from blob data only. Investigate worker-aware packing. Do not claim 60–120 s. → R-10 |
| S-4 | A | → R-8 |
| S-5 | AM | Move `test:runner` (`tests/process/*.test.cjs`) into another job first. → R-7 |
| S-6 | AM | Superseded by `ci-ok`. → R-7 |
| S-7 | A | → R-9 |
| S-8 | AM | Scope is one file. It is also a local false-red source. → R-4 |
| S-9 | A | Use the `testIgnore` approach. → R-11 |
| S-10 | AM, urgent | (b) before the next tag. (a) is cosmetic but cheap. (c) adds real protection. → R-3 |
| S-11 | AM | Also split the concurrency group. → R-2, R-19 |
| S-12 | A | → R-12 |
| S-13 | AM | `npm ci` for lockfile correctness only. PW cache off the critical path. Shallow clone only after R-18, and fix F-10. → R-14, R-18 |
| S-14 | A | → R-13 |
| S-15 | AM | Split leg types. Type 1 ("pre-fix tree fails"): delete. Type 2 ("byte-identical to pinned tree"): convert to regenerable goldens. → R-18 |
| S-16 | U | Measure the overhead first. Sequence after deletions. Keep `--strict`. → R-21 |
| S-17 | AM | Drop the merge queue (F-14). Keep the tree-equality skip. → R-20 |
| S-18 | = D-5 | → R-26 |

### Senior D-* and G-*

| ID | Verdict | Note |
|---|---|---|
| D-1 | AM | = S-15. → R-18 |
| D-2 | A | = S-8. → R-4 |
| D-3 | A | → R-12 |
| D-4 | A | → R-13 |
| D-5 | AM | Keep files under the 240 s ceiling. Mutation proof per cut assertion. → R-26 |
| D-6 | AM | Tone-law: retire with each unwire stage. Ribbon: one witness per mechanism. → R-27 |
| D-7 | AM | Rename by behavior. Fold only with a mutation check. → R-31 |
| D-8 | AM | = S-1. → R-17 |
| D-9 | A | = S-7. → R-9 |
| D-10 | AM | Keep them on every PR. They cost seconds and guard what CI runs. Delete each only with its subject code. → R-24, R-13 |
| D-11 | U, deferred | The touch nightly has never run. → R-6, R-32 |
| G-1 | A | → R-34, R-35 |
| G-2 | A | → R-38 |
| G-3 | U | → D-7 |
| G-4 | U | → D-6 |
| G-5 | A | → R-3 |
| G-6 | R | Moot after R-24. |
| G-7 | A | → R-15 |
| G-8 | A | = S-9. → R-11 |

### Scrappy C-*, D-*, G-* and other proposals

| ID | Verdict | Note |
|---|---|---|
| C-1 | AM | `ci-ok` uses `if: always()`. It fails on `failure` or `cancelled`. It passes `skipped` only for jobs that skip by design. Do not enable "require up to date". → R-1 |
| C-2 | AM | Path list too narrow. → R-17 |
| C-3 | U | Keep a merged-JSON `test-profile --strict`. → R-21 |
| C-4 | AM | Replace the nightly. Do not delete it. It is sometimes the only main run. → R-19 |
| C-5 | AM | Move `test:runner`. "27 jobs" is total, not concurrent, but F-13 shows slots still matter. → R-7, R-13 |
| C-6 | U | Only after R-1. → R-22 |
| C-7 | AM, low | The red run came from absolute paths, now fixed. Hygiene only. → R-16 |
| C-8 | AM, low | Lint the source rules. Keep `--strict`. Savings are about 6 s. → R-33 |
| C-9 | AM | = S-15. → R-18 |
| C-10 | R | `npm install` is already 3–6 s per shard. |
| C-11 | AM | Keep `test-profile`, `test-queue` and wrapper tests. → R-13 |
| C-12 | U | → D-8 |
| D-1 golden corpus | AM | Complement only. Do not replace mechanism witnesses. → R-40 |
| D-1 work-unit files | AM | → R-26 |
| D-1 mkTick pins | A | Constant and source-string pins are change detectors. → R-28 |
| D-1 report-only blocks | AM | Hand triage, about 20 files, not 34. → R-29 |
| D-1 tone-law/HL_STAGE | AM | Tie to unwire stages. → R-27 |
| D-1 per-arch hashes | AM | Add a regeneration path. Do not swap to tolerance summaries wholesale. → R-30 |
| D-2 | AM | Triage the 4 named files. Reject mass deletion: sampled "still/no longer" titles are mostly real contracts. → R-31 |
| D-3 | U, deferred | → R-32 |
| D-4 | R | These tests guard the harness that decides what CI runs. |
| G-1 | A | = C-1. → R-1 |
| G-2 | AM | Corrected list (F-11). → R-36 |
| G-3 | A | → R-34 |
| G-4 | A | → R-35 |
| G-5 | A | Fold into R-34. |
| G-6 | A | → R-37 |
| G-7 | A | → R-6 |
| §4 `paths-ignore` | R | A required `ci-ok` never reports on an ignored PR. Use job-level skips. |
| §4 test policy | U | → D-4 |
| §4 title-ban lint | R | Agents would rename contracts, not delete pins. |
| §4 auto-issue on red nightly | A | → R-5 |
| §2 router delete | A | → R-24 |
| §2 scripts 35 → ~10 | AM | Hygiene, inside R-13. |
| §2 benchmark/engine-pilot/measure/promote tools | A | → R-13, R-24 |

### Adversary "missed by both"

| ID | Verdict | Item |
|---|---|---|
| Missed-1 nightly blocks main | A, Tier 0 | → R-2 |
| Missed-2 release will fail | A, Tier 0 | → R-3 |
| Missed-3 #104 merged mid-run | A | → R-1 |
| Missed-4 router unfixable | A | → R-24 |
| Missed-5 touch nightly never ran | A | → R-6 |
| Missed-6 ratchet false positive, no owner | A | → R-5 |
| Missed-7 deletion + ratchet sequencing | A | Ordering rule for R-21 |
| Missed-8 imbalance cause | A | → R-10 |
| Missed-9 HEAD leg false red | A | → R-4 |

---

## 3. Consolidated recommendations

Savings notation: **CP** = wall time on the PR critical path of a solo run (baseline 537 s, run 38979313773). **FS** = file-seconds removed from coverage. **Slots** = concurrent jobs freed per PR run. Runner minutes are free on this public repo. They matter only through slots. I count each CP saving once, in the item that owns it.

### Tier 0 — Broken or unsafe now

**R-1. Turn on branch protection with one required check, `ci-ok`.** (C-1, Q-1, scrappy G-1, Missed-3)
- Add a final `ci-ok` job in `test.yml` with `if: always()` and `needs:` all real jobs. Fail on `failure` or `cancelled`. Require `ci-ok` and CodeQL on `main`. Do not require "up to date".
- Evidence: F-1, F-2.
- Savings: 0. It restores the gate. Risk: none. Effort: S.

**R-2. Give the schedule its own concurrency group.** (Missed-1, S-11 part, A-9)
- Change the group key to include `github.event_name`.
- Evidence: F-3.
- Savings: main-push CI stops waiting up to 108 min each working day. Risk: none. Effort: S.

**R-3. Fix the release workflow before the next tag.** (S-10, senior G-5, Missed-2)
- Replace `npm run test:lane -- audit` with a check that the tag SHA has a green `ci-ok` on `main`. Fail with a clear message if not.
- Remove `styles.css` from the zip. Fail on a missing name.
- Add a 30 s smoke step: unzip, serve, load `index.html` in Playwright, assert no page errors and one generated layer.
- Evidence: F-4. v1.4.0 needed 4 attempts (39, 39, 99, 121 min).
- Savings: 40–120 min per release. Risk: low. The same SHA keeps the same evidence. The smoke step adds new protection. Effort: S–M.

**R-4. Delete the vacuous `HEAD:` leg.** (S-8, D-2, Missed-9)
- In `tests/unit/scene3d-slice-end-overlap.test.js`, delete the T1 pre-fix leg. Keep the `absent === zero` leg.
- Savings: one runtime load (a few FS). Risk: zero. The leg cannot fail in CI and gives false reds locally. Effort: S.

**R-5. Give red `main` an owner.** (Q-3, Q-8, Missed-6, scrappy auto-issue)
- On failure of a main push or nightly, open or update a GitHub issue with `gh issue create`.
- Evidence: main stayed red 2026-09-20 to 09-30.
- Savings: 0. This is the precondition for every demotion in Tier 2. Risk: none. Effort: S.

### Tier 1 — Quick wins

**R-6. Seed the touch nightly once.** (scrappy G-7, Missed-5)
- Dispatch `touch-e2e-nightly` and `touch-audit-nightly` once. Seed the linux baseline and journey ledger.
- Savings: 0. It makes touch coverage real, not claimed. Effort: S.

**R-7. Shrink the PR job graph.** (S-5, S-6, C-5, Q-2)
- Delete `lane-plan`, `feedback`, the `unit`/`integration`/`visual` aliases and `lane-gate`. `ci-ok` (R-1) replaces them.
- Move `test:runner` into the `perf` job. Run `test:coverage:probe` only when test-infra files change.
- Keep `npm run test:feedback` as the local pre-push lane.
- Savings: CP about 25 s (alias hop + lane-gate checkout). Slots: 2 jobs gone (lane-plan, feedback); the tail jobs do not overlap shards. Risk: zero, after moving `test:runner`. Effort: S.

**R-8. Remove the `coverage-plan` hop.** (S-4)
- Each shard builds the deterministic plan. The merge job checks the plan hash.
- Savings: CP about 20 s. Risk: none. Effort: S.

**R-9. Exclude `tests/perf/**` from coverage.** (S-7, D-9)
- The `perf` job already runs them uninstrumented.
- Savings: about 20 FS, CP ≈ 0–5 s. Risk: zero. Re-check the ratchet once. Effort: S.

**R-10. Fix shard-weight hygiene.** (S-3 modified, Missed-8)
- Set the fallback to the median (1.2 s) or a per-directory median. Fix the "p95" label.
- Refresh weights from blob durations now (52 files from PR #102).
- Then test worker-aware packing (2 workers per shard; isolate the top heavy files).
- Savings: CP 0–60 s, **unmeasured**. Risk: none. Partitioning does not change what runs. Effort: S, then M.

**R-11. Auto-include new desktop specs.** (S-9, G-8, A-8)
- Replace the 30-alternation `testMatch` with a `testIgnore` for touch, visual and iphone-mini specs. Add a roster test that every non-touch spec maps to a PR project.
- Savings: 0. Closes a silent hole. Effort: S.

**R-12. Remove `desktop-visual-chromium` from PR smoke.** (S-12, D-3)
- All 7 tests skip on CI. Snapshots are darwin-only.
- Savings: seconds. Removes false coverage. Risk: zero. R-38 is the real fix. Effort: S.

**R-13. Delete dead scaffolding.** (S-14, D-4, C-11 modified, scrappy §2)
- Delete `scripts/patch-vitest-unicode.js` and its 22 script calls, `test-shard-pilot.yml`, `benchmark-test-engine.js`, engine-pilot aliases. Rename `vitest.shard-pilot.config.mjs`. Prune duplicate `test:*` aliases.
- Keep `test-queue`, `run-vitest`, `vitest-supervisor`, `test-profile` and their tests.
- Savings: ~0 time; less to read and sync. Risk: zero. Effort: S.

**R-14. Setup hygiene.** (S-13 part, C-10 part)
- Use `npm ci` for lockfile correctness. Cache Playwright browsers.
- Savings: CP 0 (browser jobs are off the critical path). Effort: S.

**R-15. Make flakes visible.** (senior G-7)
- Annotate any job with a Playwright `flaky` count above 0. On `main`, feed it to R-5.
- Savings: 0. Restores a lost signal. Effort: S.

**R-16. Move evidence screenshots out of `docs/`.** (C-7)
- Write to `test-results/` behind an env flag.
- Savings: small. Low priority. Effort: S.

### Tier 2 — Structural

**R-17. Path-route `tests/audit/**` on PRs. Run it nightly too.** (S-1, C-2, D-8, A-2)
- Exclude `tests/audit/**` from the main PR coverage roster.
- Add an `audit` job. It runs when a `git diff` step matches the wide path list in S-1 (above). It always reports to `ci-ok`.
- Then cut shards from 16 to 12–13.
- Needs R-1, R-5 and owner decision D-1.
- Savings: 1,411 FS. CP about 40–70 s (2 workers per shard; the 244 s file no longer sets a floor). Slots: 3–4 per non-Scene3D PR.
- Risk: low with the wide path list. Audit mutation proofs still run on every PR that can affect them. Effort: M.

**R-18. Retire historical-RED reconstruction. Then clone shallow.** (S-15, D-1, C-9, A-5, S-13)
- Type 1 legs ("the pre-fix tree fails"): delete. Record the RED proof in the PR or CHANGELOG. Keep generic mutants (`tone-law-dispatch-mutant`, `feedback-critical`).
- Type 2 legs ("byte-identical to pinned tree for other laws"): convert to committed goldens with a `test:update` regeneration path.
- Then set `fetch-depth: 1` in shards, merge and release. Make `touch-baseline-waiver` fetch its anchor, or fail loudly (F-10).
- Savings: FS about 300 (unmeasured). CP about 10–20 s from tests plus 10–14 s from checkout.
- Risk: near zero. Type 2 keeps its drift guard. Run a mutation check per file. Effort: M–L.

**R-19. Rebuild the nightly.** (S-11, C-4 modified, A-9)
- Reuse the sharded coverage graph plus the audit lane on `schedule`. Skip if `main` HEAD already has a green run that day.
- Savings: nightly 85–108 min single job → about 12–15 min wall. Risk: none. Effort: M.

**R-20. Skip duplicate main-push runs.** (S-17 modified)
- Skip the main-push graph when the pushed tree equals the tree of a green PR merge-ref run. No merge queue (F-14).
- Savings: one full run per merge when no other PR merged between. Frees slots in bursts. Risk: low. Run after R-2. Effort: M.

**R-21. Run the PR gate uninstrumented. Move the ratchet to main and nightly.** (S-16, C-3, A-1) — **owner decision D-2**
- First measure: one hosted run with and without coverage on the same roster.
- Keep `test-profile --strict` on merged JSON results.
- Sequence it **after** R-18 and R-26–R-29, so the ratchet still sees the deletions.
- Savings: CP 50–90 s (if the factor is 1.2–1.4×) plus about 30 s from a lighter merge job. Failed-shard re-runs become legal.
- Risk: coverage erosion is found one merge later. Mitigate with R-5 and optional PR diff coverage. Effort: M.

**R-22. Make CI the full gate. Change the local rule.** (C-6, A-7, Q-6) — **owner decision D-3**
- After R-1, require locally: the feedback lane plus the touched files. Remove the local `test:ci` mandate from CLAUDE.md and AGENTS.md.
- Savings: 35–40 min plus queue wait per non-trivial agent commit. Biggest human-time win.
- Risk: low after R-1. Effort: S.

**R-23. Collapse the testing docs.** (C-12) — **owner decision D-8**
- One `docs/testing.md`. Archive phase, review and punchlist docs. Shrink the 6-doc sync rule.
- Savings: context and collision cost. Effort: S–M.

**R-24. Delete the risk router and promotion ledger.** (scrappy §2, A-3, Missed-4, S-2 rejected, G-6 rejected)
- Delete `test-lane-router.js`, measure, promote, aggregate, `test-lanes.json` promotion state and `lane-routing.test.js`. R-17 uses a plain path step instead.
- Savings: ~10 child-process spawns in one test; less machinery. Risk: zero. It runs in shadow mode only. Effort: M.

**R-25.** (Merged into R-24 and R-13. Infra self-tests stay on every PR.)

### Tier 3 — Test portfolio: prune, convert, add

Rule for every cut: one mutation proof per removed assertion. Keep each file under 240 s.

**R-26. Consolidate the FR-U fill-style family.** (D-5, scrappy D-1 work-unit files, S-18)
- 16 files, 1,427 FS. Share one runtime load per file. Use the smallest fixture that still fails under mutation. Replace the `BASE` table pinned to `7d20989b` with regenerable goldens. Rename by behavior.
- Savings: plausibly 400–700 FS, unmeasured. Risk: low with mutation proofs. Effort: L.

**R-27. Retire tone-law and HL_STAGE tests with each unwire stage. Trim ribbon to one witness per mechanism.** (D-6, scrappy D-1 tone-law)
- Savings: up to ~1,000 FS over time. Risk: low if tied to the unwire plan. Effort: M.

**R-28. Delete mkTick constant and source-string pins.** (scrappy D-1 mkTick)
- Example: `MK.mkTick.L0 is still 1.16`, `expect(src).toContain('const Lfloor = ...')`. Keep the runaway-stroke guard and mechanism witnesses.
- Savings: maintenance, few FS. Risk: zero. They catch no user defect. Effort: S.

**R-29. Delete report-only render blocks by hand.** (scrappy D-1)
- About 20 files. A render that feeds no assertion breaks the repo's own rule. Check each block; HLR identity canaries stay.
- Savings: some FS. Risk: zero if done by hand. Effort: M.

**R-30. Give every hash table a regeneration command.** (A-6, scrappy D-1 hashes)
- Keep exact hashes where determinism is the contract. Do not swap to coarse tolerance summaries. Those would hide local defects (runaway strokes, wedges, slice gaps).
- Savings: maintenance. Risk: none. Effort: M.

**R-31. Rename work-batch files by behavior.** (D-7, scrappy D-2)
- `petalis-qa-fixes`, `topoform-geometry-fixes`, `algo-config-review-fixes`, `history-bugs-audit`, `touch/batch-r`, `batch-g-review`, `followups-batch-g`. Fold only with a mutation check.
- Savings: 0. Clarity. Effort: S–M.

**R-32. Defer touch matrix trim and spec merge.** (D-11, scrappy D-3)
- Wait for 2+ real nightly runs (R-6). Then classify specs: layout-sensitive keep all 11 projects; behavior specs keep 1 Chromium + 1 WebKit.
- Savings: later, est. 50–70 % of touch nightly. Effort: M.

**R-33. Move pure source-text guards to a static lint.** (C-8 modified, senior T0)
- Optional. Savings about 6 s. Keep `test-profile --strict`. Effort: S.

Gaps to **add** (real risk):

**R-34. Whole-preset corpus canary.** (senior G-1, scrappy G-3, scrappy G-5)
- For all 147 `user-presets/**/*.vectura`: load through the real loader → `engine.addLayer` → generate → finite, non-empty geometry → SVG export (parses, no NaN/Infinity, within bounds, no zero-length paths) → serialize → deserialize → same summary.
- Keep it on **every PR**. It is the broad canary for the "four origins of a default" risk. Cost: 30–60 FS. Effort: M.

**R-35. Legacy saved-file corpus.** (senior G-1, scrappy G-4, Q-10)
- Commit about 10 real `.vectura` files from 0.8.x, 1.0, 1.2, 1.3. Assert load, render, stable summary. Every PR. Cost: ~5 FS. Effort: S–M.

**R-36. SVG goldens for the 11 missing algorithms.** (scrappy G-2 corrected)
- attractor, boids, grid, halftone, hyphae, image-weave, pattern, pendula, phylla, svgdistort, topo. About 1 s each. Effort: S.

**R-37. Real-browser "every algorithm boots" canary in e2e-smoke.** (scrappy G-6)
- Select each algorithm once. Assert zero page errors and a non-empty canvas. Off the critical path. Effort: S.

**R-38. Linux pixel snapshots, nightly.** (senior G-2)
- Pinned Playwright Docker image, masked dynamic regions. Effort: M.

**R-39.** (Touch routing on PRs: see D-7.)

**R-40. Small Scene3D golden corpus as a complement.** (scrappy D-1 corpus, modified)
- About 30 canonical scenes with exact, regenerable summaries. It adds a broad canary. It does not replace mechanism witnesses. Effort: M.

### Decisions for the owner

- **D-1. Replace "never move a test out of PR gating to save time".** I challenge it. Today there is no PR gate at all (F-1). Proposed rule: "Every test runs pre-merge on every PR that can affect it (path-routed, shared dependencies included). Every test runs on `main` nightly with an auto-issue." Enables R-17 and R-21.
- **D-2. Coverage ratchet off the PR path (R-21).** Gain: about 1.5–2 min CP and legal shard re-runs. Cost: erosion found one merge later. The ratchet's only fire so far was a false positive.
- **D-3. Local `test:ci` mandate (R-22).** Gain: 35–40 min plus queue per agent commit. Cost: local failure found in CI. Safe only after R-1.
- **D-4. Test policy for fixes.** Proposed: a fix commits a test that guards the *current* contract. The RED proof goes in the PR, not in the suite. No committed pre-fix tree reconstruction. This directly serves the team goal.
- **D-5. Scene3D test budget.** Scene3D is 76 % of compute. Decide what a Scene3D regression is to you and set a budget (for example ≤50 % of FS).
- **D-6. Desktop WebKit/Safari project.** Today WebKit runs only with touch emulation.
- **D-7. Touch on PRs.** Route a touch subset on `src/ui/**` and `src/render/renderer.js`, or keep touch nightly-only after R-6.
- **D-8. Docs consolidation and the AGENTS.md sync rule (R-23).**
- **D-9. Shard count vs slots.** After R-17: 12–13 shards fit about 1.5 PRs in 20 slots. 16 shards is faster solo but queues in bursts (F-13).

---

## 4. Rejected

- **S-2 router fix:** cannot reach non-full routing; `tests/` and `package.json` always map to "shared".
- **C-10 node_modules cache:** `npm install` is already 3–6 s.
- **C-8 grep replaces `test-profile --strict`:** loses runtime facts (zero-test files, collect failures, runtime skips).
- **Scrappy D-4 delete infra self-tests:** they guard the harness that decides what runs.
- **Title-ban lint:** pushes renames, not deletions; many "still" titles are real contracts.
- **`paths-ignore` on the PR trigger:** a required `ci-ok` would never report.
- **Merge queue:** needs an org-owned repo.
- **Senior G-6 router fixture:** moot after R-24.
- **Narrow audit path lists (S-1, C-2 as written):** miss shared geometry and boolean modules.
- **Golden corpus as a replacement for mechanism tests:** coarse summaries hide local defects.
- **Mass deletion of "~240 patch-pin files":** overstated; triage by hand.
- **Outright nightly deletion (C-4 as written):** the nightly is sometimes the only main run.
- **The 1.6× overhead and the "4–5 min" PR projections:** not supported by controlled data.

---

## 5. Projected end state

| Metric | Today | After Tier 0–1 | After Tier 0–2 (no R-21) | With R-21 |
|---|---|---|---|---|
| PR wall, solo run | 8–9 min | ~7.5 min | ~6.5–7 min | ~5.5–6 min |
| PR wall, burst (3 PRs) | up to 26 min | ~20 min | ~10–14 min (fewer jobs and shards) | ~9–12 min |
| Jobs per PR run | ~21 concurrent peak | ~19 | ~14–15 | ~14 |
| Nightly | 85–108 min, one job, blocks main | same, no longer blocks main | ~12–15 min wall, sharded | same |
| Release | will fail on next tag | ≤5 min (verify + build + smoke) | same | same |
| Main push | often cancelled | runs every time | skipped when tree equals a green PR | same |

Arithmetic (solo CP, from 537 s): R-7 −25, R-8 −20, R-9 −3, R-17 −40 to −70, R-18 −20 to −34, R-10 0 to −60. Sum: about −110 to −210 s → about 330–430 s. R-21 adds −80 to −120 s.

Confidence: **medium** for the solo range (±1 min). **Low** for the burst range: it depends on how many PRs overlap. **Low** for R-21 until the overhead is measured. Tier 3 deletions (R-26–R-29) could cut a further 1,000–2,000 FS. I do not count them above, because they are unmeasured.
