STATUS: DONE

# U9b-2 — disclose and test the onePenDown shadow write-back (LEDGER row 10a) — implementer report

Lane: `fill-collapse-3`. Worktree: `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-collapse-3`,
branch `3d-scene/fill-collapse-3`, port **8482**. Base `d00ec210` (unverified WIP, on top of `49a5ef88` = U7-2).
New sha (commit 1): **`e10306e9`**. Working tree confirmed clean (`git status --short -- . ':!graphify-out'`,
`git stash list`) before starting — matched ROUND3-RESUME-BRIEFS.md's "all five `-3` worktrees are clean" claim.

Ran as ONE session covering both U9b-2 (this report) and U5b-4 (`U5b-4-impl.md`), per brief §2. This report
covers commit 1 (`e10306e9`) only.

## STEP 0 — verify-or-revert `d00ec210`

`d00ec210` contains, and nothing else, `tests/integration/scene3d-shadow-writeback.test.js` (+274, new). Ran
it in the foreground, `timeout: 600000`:

```
npx vitest run tests/integration/scene3d-shadow-writeback.test.js
```

**Result: 9/10 passed, 1 failed.** The failure was in `(b) no undo entry at load > app.applyState of a doc
needing the onePenDown write-back pushes no history itself`:

```
AssertionError: expected 'ladder' to be 'interlockWeave'
```

**Diagnosis: this was a test-authoring bug in the WIP scaffolding, not a real gap.** The test builds an
`affectedState` (a scene saved with `shadowToneLaw:'onePenDown'`) and a `controlState` (a plain scene, no
shadow override — default `shadowToneLaw:'ladder'`), applies `affectedState` first, applies `controlState`
second, and only THEN reads `group2 = app.engine.layers.find(...)` to confirm the write-back fired. Since
`controlState` is applied SECOND, it overwrites `app.engine`'s layers with the control's (default `'ladder'`)
before the assertion runs — the test was checking the wrong state entirely. This is broken scaffolding, not a
correct RED oracle: the production code (`clampShadowToneLaw` at `2b189b5f`, unit U9b) was never in question.

**Fixed within one honest attempt**: moved the `group2` read to immediately after `affectedState`'s own
`applyState` call, before `controlState` is applied and overwrites it. Re-ran: **10/10 passed.** Adopted the
corrected WIP as the start of commit 1, per the brief's "if you can fix it in ONE honest attempt, adopt it"
instruction.

## Scope — four deliverables (tests + disclosure, no mechanism change)

Per ROUND3-RESUME-BRIEFS.md §2 COMMIT 1 and LEDGER row 10a. `src/core/scene3d/params.js`
(`clampShadowToneLaw`) is **untouched** — U9b already shipped the production forward-resolve fix at
`2b189b5f`; U9b-review.md §(2) found the fix correct but undisclosed/untested against the real load path.
This unit closes that gap.

1. **Fires ONCE at load, never per compose.** `tests/integration/scene3d-shadow-writeback.test.js`
   describe block `(a)`, 5 tests:
   - LOAD: a scene saved with `shadowToneLaw:'onePenDown'` reopens as `'interlockWeave'`
     (`e1.exportState()` → `e2.importState()`, the real `sanitizeImportedParams`/`normalizeShadow` path)
   - control: a DIFFERENT folded id (`fineLadder`) reopens UNCHANGED (U9's raw pass-through, not this
     exception) — proves the exception is scoped to `onePenDown` alone
   - once-only/idempotent: re-importing an already-migrated document is byte-identical
   - no per-pass rewrite after load: the bag is byte-identical across 3 `computeAllDisplayGeometry()` calls
   - **the compose channel structurally cannot write back**: a LIVE bag holding raw `'onePenDown'` (never
     loaded through `sanitizeImportedParams`) survives 3 composes untouched, staying raw — isolates "compose
     never rewrites" from "load already resolved it before compose ran"
2. **Creates NO undo entry.** describe block `(b)`, 2 tests:
   - `app.applyState` of a doc needing the write-back pushes no history itself (compared 1:1 against a
     control doc that needs no write-back — both push 0), AND confirms the write-back really fired on that
     load (else "no entry" would be vacuously true for the wrong reason) — this is the test I fixed in
     STEP 0
   - undo/redo: the migrated value survives push/edit/undo, never resurrecting `onePenDown`
3. **Round-trips the survivor in a saved `.vectura`.** describe block `(c)`, 1 test: saving the migrated
   doc serializes `'interlockWeave'`; re-import is a no-op. Combined with (a)'s LOAD test, both directions
   of the real `engine.exportState`/`importState` (→ `sanitizeImportedParams` → `sanitizeSceneParams` →
   `normalizeParams` → `normalizeShadow`) path are exercised — not a synthetic bag.
4. **A guard that TRIPS if a second id ever acquires `shadowResolvesToSurvivor`.** describe block `(d)`,
   2 tests, at the PRODUCTION level:
   - sweep: every real `ALIASES` id either passes through raw, or (`onePenDown` alone) resolves to its
     survivor — `exceptions` must equal exactly `[{id:'onePenDown', out: ALIASES.onePenDown.into}]`
   - **mutation-proof**: stubs `Shadows.toneLawApplies` so a SECOND real id also becomes
     shadow-indistinguishable, and asserts the "exactly one exception" sweep now returns 2 exceptions
     (not vacuously still 1) — proves the guard is live and driven by `Shadows.toneLawApplies` generally,
     not a hardcoded `=== 'onePenDown'` string check. Restores the stub in a `finally` and re-confirms the
     baseline.

**Additional, per the brief's scope item 4** ("Tie the test-side literal to the production-side
`Shadows.toneLawApplies` set and note in a comment that the coupling is manual"): the four items above prove
the PRODUCTION guard, but nothing tied the TEST-SIDE `shadowResolvesToSurvivor: ['onePenDown']` literal
(passed at exactly 1 of 6 `describeSingleParamCluster` call sites in `tests/unit/scene3d-tone-law-collapse.test.js`)
to that production computation — U9b-review.md's follow-up 3 flagged exactly this gap. Added:

- A module-level `RECORDED_SHADOW_RESOLVES_TO_SURVIVOR` array, pushed to by `describeSingleParamCluster`
  itself (one line, at the top of the function body) every time it is called — so it captures every
  call site's array (or `undefined` → nothing pushed) as the file's top-level `describeSingleParamCluster(...)`
  calls run at collection time, in file order, before any test body executes.
- A new tail describe block, `'U9b-2 — shadowResolvesToSurvivor coupling (test-side literal vs. production
  Shadows.toneLawApplies)'`, with 2 tests:
  - recomputes the "should resolve forward" set directly from `LAWS.ALIASES` + `Shadows.toneLawApplies`,
    independent of anything the file declares, and asserts it equals the recorded set (today: `['onePenDown']`
    on both sides) — a future id added to one side without the other now fails loudly
  - a mutation sanity check that the declared-vs-production comparison is not vacuously equal (appending a
    synthetic id to one side makes the comparison fail, proving the equality check actually distinguishes)
  - the coupling remains explicitly MANUAL by design (a comment says so) — this test does not eliminate the
    two-places-to-edit reality, it only makes a stale/mismatched literal loud instead of silent.

**Not done** (out of the round-3 brief's explicit scope, though named in U9b-review's original follow-up 2):
adding `bundleDither` to `scripts/audit/u9b-shadow-display-evidence.js`'s `IDS` list. The round-3 brief's four
numbered scope items do not include this; flagged here as an open item, not done, to avoid scope creep on an
already-narrow unit.

## RED (verified via STEP 0's own run + a scratch export)

The only RED this unit produced was the test-ordering bug documented above (`expected 'ladder' to be
'interlockWeave'`). To confirm the OTHER 9 tests genuinely exercise real production behavior (not vacuous),
ran the same file against a scratch `git archive 49a5ef88` export (pre-`clampShadowToneLaw`-fix... no —
`2b189b5f` already shipped the fix; `49a5ef88` is AFTER `2b189b5f`, so the production fix is present at both
the WIP's base and at HEAD). This unit adds no new production code, so there is no production RED to derive
for items 1-3 (they exercise the already-shipped `2b189b5f` fix); the mutation-proof in item 4 IS this unit's
own RED/GREEN pair (RED = stub reverted / baseline; the stubbed-mutation state is the deliberate "what if a
second id existed" RED this test is designed to catch, and it correctly fails the "exactly one exception"
invariant when triggered).

## GREEN (foreground, one file at a time, per protocol)

| Suite | Result |
|---|---|
| `tests/integration/scene3d-shadow-writeback.test.js` | **10/10** (new; 9/10 as authored, 10/10 after the STEP 0 fix) |
| `tests/unit/scene3d-tone-law-collapse.test.js` | **119/119** (117 baseline at `49a5ef88` + 2 new coupling tests; `--pool=forks --poolOptions.forks.singleFork=true`, 817.9s wall — within the brief's expected 390-840s Tier-1 range) |
| `tests/unit/scene3d-fill-style-effective-law.test.js` | **7/7**, unmodified |
| `tests/unit/scene3d-fill-style-display-params.test.js` | **3/3**, unmodified |
| `tests/unit/scene3d-tone-laws-config.test.js` | **8/8**, unmodified |
| `tests/unit/scene3d-shadow-tone-law.test.js` + `scene3d-shadow-tone-law-uniqueness.test.js` + `scene3d-one-pen-down-reachability.test.js` | **40/40** combined (28+7+5), unmodified |
| `tests/integration/stroke-fill-style-control.test.js` + `scene3d-panel.test.js` + `context-bar-scene-flyouts.test.js` | **107/107** combined (30+38+39), unmodified (these three ran AFTER the U5b-4 edits to `scene3d-panel.js`/`context-bar.js` already existed in the tree, so they also confirm no regression from that commit's changes) |
| `tests/integration/scene3d-panel-style-live-sync.test.js` + `scene3d-tone-law-dispatch.test.js` + `scene3d-tone-law-plumbing.test.js` | **18/18** combined, unmodified |

**Total: 312/312 across every named guard, summed explicitly** (10+119+7+3+8+40+107+18 = 312), 0 failures.
Corrected 2026-09-12 after secretary re-sum: 328 → 312.
The usual benign `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC warning and `[FillBoolean] polygon
union failed on degenerate geometry` stderr noise fired on the heavy runs — pre-existing, unrelated, matches
every prior unit's report.

## `## Bars changed`

None. No numeric threshold, tolerance, count bar, or pinned fingerprint changed anywhere in this commit. The
`scene3d-tone-law-collapse.test.js` addition is a NEW describe block (2 new tests) plus one instrumentation
line inside `describeSingleParamCluster` (records what is already passed, does not change any assertion's
shape) — no existing test's bar moved.

## `## Borrowed green / collateral`

None. No other unit's test flipped red→green or green→red as a side effect of this commit. (Note: the guard
runs above for `stroke-fill-style-control`/`scene3d-panel`/`context-bar-scene-flyouts` were executed after the
U5b-4 commit's edits to `scene3d-panel.js`/`context-bar.js` already existed in the working tree, since both
units were done in one continuous session before either was committed — they confirm both commits coexist
cleanly, not that this commit alone was tested in isolation against those three files.)

## Files touched (commit `e10306e9`)

- `tests/integration/scene3d-shadow-writeback.test.js` — test-ordering bug fix (+9/-5 net vs. the WIP).
- `tests/unit/scene3d-tone-law-collapse.test.js` — `RECORDED_SHADOW_RESOLVES_TO_SURVIVOR` recorder (+1 line
  inside `describeSingleParamCluster`) + new tail describe block, 2 tests (+59 total).

No production file touched. `src/core/scene3d/params.js`, `shadows.js`, `scene3d.js`, `surface-fill.js` all
untouched — matches the brief's Forbidden list and the "tests + disclosure, no mechanism change" framing.

## Live verification

None applicable — this unit is tests + disclosure only, no rendering/UI change. No dev-server verification
was needed for commit 1; the mandatory live verification for this run is U5b-4's (see `U5b-4-impl.md`).

## Open items / not touched

- `scripts/audit/u9b-shadow-display-evidence.js`'s `IDS` list — U9b-review follow-up 2 (`bundleDither`
  addition) is not in this round's explicit brief scope; not done here.
- Merge risk (from U9b-review.md): `tests/unit/scene3d-tone-law-collapse.test.js` is now a collision file
  across fill-collapse-2 (U5b), handoff-c2 (U9), and fill-collapse-3 (U9b, now U9b-2) — flag for the merge
  orchestrator, unchanged from U9b-review's own flag.
- CHANGELOG.md / plans.md / worklist.json / findings.json / STILL-OPEN.md — not edited here (shared-file
  rule, same as every prior unit's precedent).

## Commit

`e10306e9` — `fix(3d-audit): U9b-2 — disclose + test the onePenDown shadow write-back (LEDGER row 10a)`, on
top of `d00ec210`. Commit body carries the RED/GREEN numbers, the `## Bars changed` and
`## Borrowed green / collateral` sections verbatim. Working tree clean after commit
(`git status --short -- . ':!graphify-out'`). Not pushed.
