# Test performance lessons

This file is the single ledger of lessons from the test-trimming work in PR #97, #99 and #100. Read it before you add, change or trim a test. Command details stay in `docs/testing.md`. Approved coverage trade-offs stay in `docs/render-test-reductions.md`.

## Budgets and how to measure

- Full PR validation takes about 8 minutes on hosted runners (PR #100). It was 53 minutes before PR #97. Treat 10 minutes as the ceiling.
- No test left PR gating. Thresholds, skip allowances and per-test timeouts did not change. Do not change them to save time.
- Coverage thresholds: statements 74%, branches 62%, functions 74%, lines 76%. The skip baseline is 57.
- Measure wall time from workflow creation to the last required check. This includes queue and setup time.
- Report summed runner time as a separate number. More shards raise runner time. Runner time is free for this public repo.
- One run is not proof. A local timing is not proof. Record at least two hosted runs of the final configuration, and name the run IDs.
- The shard overhead is about 1 minute per shard (checkout 12-64 s, setup, coverage collection). The tail after the last shard is about 1.5 minutes.
- 16 shards plus the other jobs sit near the account limit of 20 concurrent jobs. Parallel PRs can queue shards and push wall time over 10 minutes.

## Rules for adding or changing tests

- The coverage shards are the whole critical path. A test file is the unit of sharding. One slow file sets the floor for wall time.
- Aim for at most about 120 s of hosted coverage time per file. The hard ceiling is about 240 s. Split any file above the ceiling.
- Prefer the cheapest layer that can show the defect. Use a unit test on a resolver or a pure function before you render a scene.
- Do not render the same full scene many times when one render is enough. Reuse an immutable summary across assertions.
- Every render must feed an assertion. A render that no assertion reads is dead cost. PR #100 removed one such crosshatch render.
- Every cache needs a mutation proof. Break the code under test on purpose and show that the witness fails. Without this proof, a cache can make a witness vacuous.
- Keep mutation and determinism trials fresh. Do not cache them.
- Add a regression witness for each shipped defect. Keep the boundary case and the known-defect case. Do not keep a full historical matrix in the routine lane.
- Put exhaustive matrices in `tests/audit/` (see `tests/audit/README.md`). Routine guards stay in `tests/unit/` and `tests/visual/`.
- Keep 2 Vitest workers on the 4-vCPU runners (`VECTURA_VITEST_MAX_WORKERS`). 4 workers measured no faster (15m38s against 13m37s) and showed one intermittent failure (run 38924847714).

## How to trim safely

1. Write down which defect each test catches. Name the witness.
2. Cut only duplicate renders, unused calculations and repeated matrix cells. Keep one witness for each distinct failure mechanism.
3. Run the mutation check. Break the source on purpose. Confirm the kept test fails. If it does not fail, the trim lost the witness. Revert it.
4. Compare titles and assertions old against new. Parity must hold, or each difference must be approved and recorded.
5. Keep cross-file roster and recorder checks seeing the full set of tests.
6. Record the accepted loss in `docs/render-test-reductions.md`.

What was reverted or caught before:

- Phase two cached default results for a whole `describe` in the U6 and U7 files. The adjudication accepted this as an open P2 risk, because a cached default hides a mutation.
- PR #100 changed a cache so that the u6 fresh-default check compared a cached copy to itself. The witness became vacuous. Review caught it. The fix restores it, and an RGR mutation shows it fails again.
- The first hosted run of the audit cache failed two dispatch assertions. The cached law roster omitted the ladder baseline. The cache now measures the ladder explicitly.
- Retiring the ribbon counter sweep and two named expansion samples (PR #99) was an approved loss. Real geometry, erosion refusal and forced fill-depth failure stayed.
- Matrix reductions are structural facts. They are not predicted wall-time savings. PR #99 claimed no speed-up. Only the hosted run (31m14s) measured the effect.

## Sharding and weight maintenance

- `COVERAGE_SHARD_COUNT` in `.github/workflows/test.yml` is the single source of the shard count. The planner accepts 1 to 32. The current value is 16.
- More shards do not help unless the files are balanced. Split the heaviest file first.
- Weights must come from Vitest blob durations. Use `scripts/test-shard-weights-refresh.js`. Do not use JSON start and end times. They leave out `beforeAll` time. One file showed 44 s when the real time was 357 s. This caused a 2x shard imbalance.
- Refresh the weights when a heavy file changes, when you split a file, or when shard times drift apart. The command and its flags are in `docs/testing.md`.
- Split a file by `describe`. Move shared helpers to `tests/helpers/`. Check title and assertion parity old against new. Check that cross-file roster checks still see all tests.
- Check balance with a plan dry run:
  `node scripts/test-shard-plan.js --plan-out <file> --sha $(git rev-parse HEAD) --shards 16`
- Re-run the whole workflow after a failure. Do not re-run only the failed shard jobs. Provenance is pinned per attempt, so a partial re-run cannot pass.

## History

Wall time runs from workflow creation to the last required check.

| PR | Run ID | Configuration | Wall | What changed |
| --- | --- | --- | --- | --- |
| #97 | 38601029835 (main) | 2 shards | 53m32s | Plan and guard, two duration-weighted shards, fail-closed canonical gate. Unsharded baseline was 101m23s (run 38516174360). |
| #99 | 38781571763 | 2 shards | 31m14s | Retired the ribbon counter sweep and two expansion samples. Narrowed repeated render matrices. Summed runner time 60.0 min. |
| #100 | 38922636115 | 10 shards, u6 split | 13m37s | N-shard planner. First heavy-file split. |
| #100 | 38952568423, 38953896572, 38955184516 | 14 shards, blob weights | 9m14s, 9m17s, 8m54s | Blob-duration weights replaced JSON timing. |
| #100 | 38973673865 | 14 shards, dispatch split | 9m30s | Split tone-law-dispatch. Dropped one unread render. |
| #100 | 38974810292 | 16 shards | 8m19s | Shard count 16. |
| #100 | 38975939640 (head) | 16 shards, refreshed weights | 8m02s | Weights refreshed. Summed runner time 84.4 min. |

The final configuration has two samples (8m19s, 8m02s). Six consecutive green runs from 14 shards on ran 8m02s to 9m30s. This is not a P95 guarantee.

## Anti-patterns

- Trusting JSON start and end times as shard weights.
- Adding shards before you split the heaviest file.
- Caching a render without a mutation proof.
- Comparing a cached copy to itself and calling it an isolation witness.
- Rendering a scene that no assertion reads.
- Looping one scene over a full primitive, density and band matrix in a routine test.
- Raising workers above 2 on the 4-vCPU runners.
- Re-running only the failed shard jobs.
- Lowering a threshold, adding a skip or raising a timeout to save time.
- Moving a test out of PR gating to make the number look better.
- Claiming a speed-up from one run or a local timing.
