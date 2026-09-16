STATUS: ACCEPT-WITH-FOLLOWUPS

# U9b-2 + U5b-4 — adversarial review (lane fill-collapse-3, LEDGER rows 10a/11a)

Lane `fill-collapse-3`, read-only in the worktree (`.claude/worktrees/fill-collapse-3`). Pinned range
`49a5ef88..eb9707a8` (three commits: `d00ec210` unverified WIP test-only, `e10306e9` U9b-2, `eb9707a8`
U5b-4). All reproduction happened in scratch exports:

```
mkdir -p /private/tmp/claude-501/scratch-U9b2/{pre,mid,post}
git -C <worktree> archive 49a5ef88 | tar -x -C .../pre     # pre  = base (U7-2)
git -C <worktree> archive e10306e9 | tar -x -C .../mid     # mid  = commit 1 alone (U9b-2)
git -C <worktree> archive eb9707a8 | tar -x -C .../post    # post = both commits (U9b-2 + U5b-4)
```

`node_modules` symlinked from MAIN into each. Verified the worktree itself was never touched:
`git -C <worktree> status --short -- . ':!graphify-out'` is clean before and after this review
(exit 0, no output), and `HEAD` is `eb9707a8` throughout, matching the implementer's claim. Extra
mutation copies (`mut-render`, `mut-undo`, `mut-shadows`) were made from `post` for non-vacuity
proofs (flags 2/4 and coordinator condition D) — all scratch, none touch the worktree. Two scratch
dev servers (ports 8492/8493, both ≥ 8490 and free) were started from the `pre`/`post` scratch
exports for a live-DOM re-verification, and killed at the end; no probe files were left in the
worktree.

## Verdict summary

**U9b-2: ACCEPT.** All four scope items are real and, on closer mutation-testing, non-vacuous — with
one caveat (below) about one sibling test inside item 1's block being weak in isolation, though the
claim as a whole is soundly proven by an accompanying test in the same block. **U5b-4: ACCEPT.**
Both surfaces render the caveat, the fix is provably non-seeding, RED is now a real reproduced
failure (not an inference from source reading), and the one visible defect in the evidence (a select
label clipping to "Duty Cycle · Constar" in the ctxbar flyout) is proven pre-existing, not introduced.
**Report-accuracy finding (non-blocking):** U9b-2-impl.md's "Total: 328/328" does not equal the sum
of its own listed addends (312) — see Coordinator Condition A.

---

## Flag-by-flag verdicts (original review brief)

### Flag 1 — pinned-range-only reads via scratch exports
**ACCEPT.** All source/test reading, all vitest runs, and all mutation testing were done against
`/private/tmp/claude-501/scratch-U9b2/{pre,mid,post}`, never against the live worktree. The worktree
was read exactly once, read-only, to confirm `HEAD`/clean status and to extract diffs
(`git -C <worktree> diff <sha> <sha> -- <path>`), which does not check out or mutate the working tree.

### Flag 2 — "fires ONCE at load" must be a call-count proof, not an end-state assertion
**ACCEPT-WITH-FOLLOWUP.** None of the 5 tests in describe block (a) literally spy/count function
calls (`clampShadowToneLaw` isn't exported for spying, and `Params.normalizeShadow` is called via an
internal closure reference the IIFE never routes through the exported object, so `vi.spyOn(Params,
'normalizeShadow')` measures 0 calls even across a real load — confirmed: I tried this directly and
got 0/0/0/0/0 across setup/export/load/3 composes, proving the spy technique itself doesn't work on
this codebase's IIFE pattern, not that nothing happened). I instead instrumented
`Shadows.toneLawApplies` (which the resolution branch calls dynamically via `Vectura.Scene3D.Shadows`
at call time, so patching the method IS observable) and got real call-count numbers myself:

| step | calls to `toneLawApplies('onePenDown')` | stored value after |
|---|---|---|
| `e1.addLayer` + set `shadowToneLaw:'onePenDown'` | 0 | onePenDown (raw) |
| `e1.exportState()` | 0 | — |
| `e2.importState(...)` (**the real load**) | **1** | interlockWeave |
| compose #1/#2/#3 (post-load, already resolved) | 0 each | interlockWeave (unchanged) |
| bypass: raw `onePenDown` set directly (no load), then compose #1 | 1 | **onePenDown (unchanged — resolved only ephemerally, never persisted)** |
| bypass compose #2 | 1 | onePenDown (unchanged) |

This is the real behavior: the resolution branch is called on *every* `normalizeParams` pass
(load AND render), but it only ever *persists* when the input value handed to it is still the raw,
un-resolved id — once persisted as `interlockWeave` (not an ALIASES member), the branch's ALIASES
membership check short-circuits and does nothing on every subsequent call, at load or compose. So
"fires once" is true of the **write-back**, not of the function call count — a nuance the report's
prose blurs but its test design (mostly) respects.

I then mutation-tested this directly: added a one-line regression to `scene3d.js`'s `generate()`
(`params.shadow.shadowToneLaw = p.shadow.shadowToneLaw` right after `normalizeParams`, exploiting
that `collectSceneParams` spreads `group.params` shallowly so `assembled.shadow === group.params.shadow`,
same reference) to simulate "the write-back also fires on every render." Result:

- The bypass test (`'the compose channel structurally cannot write back...'`, using **raw**
  `onePenDown` never loaded) **went RED**: `expected 'interlockWeave' to be 'onePenDown'` — exactly
  the regression this mutation introduces, caught.
- The **sibling** test in the same block (`'no per-pass rewrite after load: byte-identical across 3
  composes'`, using the **already-resolved** `interlockWeave` value) **stayed GREEN** under the exact
  same mutation — because `interlockWeave → interlockWeave` is idempotent, this specific test cannot
  distinguish "never runs on compose" from "runs on compose but happens to be a no-op here." **This
  is precisely the vacuous-check shape the flag warns about**, and it is real, but it applies to only
  one of the five tests in the block — the bypass test (test 5) is a solid, mutation-proven,
  call-count-equivalent proof of the same claim it shares the block with.

**Ruling:** item 1's overall claim ("fires once, never per compose") is soundly proven by the block as
a whole (the bypass test alone suffices and is non-vacuous), but the "no per-pass rewrite" test is
weak/vacuous in isolation. Non-blocking — recommend a one-line comment in the test file noting the
bypass test is the load-bearing one for this specific claim.

### Flag 3 — round-trip through the REAL engine.loadState/sanitizeImportedParams path
**ACCEPT.** There is no method literally named `engine.loadState` anywhere in `engine.js` or
`app.js` (confirmed by grep) — the brief's phrase is informal. The real production load chain is
`app.applyState(state)` → `this.engine.importState(state.engine)` (app.js:986) →
`sanitizeImportedParams(data.params, data.type)` (engine.js:1941) → `sanitizeSceneParams` →
`normalizeParams` → `normalizeShadow` → `clampShadowToneLaw`. And the real save chain is
`app.js:834`, `engine: this.engine.exportState()` — a `.vectura` file **is**
`JSON.stringify({engine: engine.exportState(), settings, ...})`, and opening one is
`JSON.parse` → `app.applyState`. The tests' `e2.importState(JSON.parse(JSON.stringify(e1.exportState())))`
is functionally byte-identical to that disk round trip (same objects, same code path, just without
literal file I/O), and the (b)-block tests go one step further and drive it through the real
`app.applyState` wrapper. This is not a synthetic params bag — it is the real production
serialization shape through the real normalize chain.

### Flag 4 — the "trips if a second id acquires shadowResolvesToSurvivor" guard must be MUTATION-PROVEN
**ACCEPT, strongly.** The file's own test (`'mutation: if a SECOND real id also becomes
shadow-indistinguishable...'`) stubs `Shadows.toneLawApplies` internally and shows `exceptions` grows
to 2. To rule out this being a self-serving internal mutation, I made an **independent, source-level**
mutation in a fresh scratch copy (`mut-shadows`): added `'fineLadder'` to `shadows.js`'s
`TONE_LAW_NOT_DISTINGUISHABLE` Set (line 867) — a realistic regression shape, not a test-authored stub.
Result: **4 separate tests went RED**, none of them the file's own internal-mutation test:

1. `(a) ... control: fineLadder reopens UNCHANGED` — `expected 'ladder' to be 'fineLadder'`
2. `(d) sweep: every real ALIASES id either passes through raw...` — `expected 'ladder' to be 'fineLadder'`
3. `(d) mutation:...` **baseline** assertion (`expect(sweepExceptions()).toEqual(['onePenDown'])`) —
   `expected [ 'fineLadder', 'onePenDown' ] to deeply equal [ 'onePenDown' ]`
4. `scene3d-tone-law-collapse.test.js`'s new **U9b-2 coupling test** — `expected [ 'onePenDown' ] to
   deeply equal [ 'fineLadder', 'onePenDown' ]`

This is unambiguous, real mutation-testing at the production level, not the W-38 vacuous-leg class.
The guard is genuinely driven by `Shadows.toneLawApplies`, and both the round-3 scope item 4 ("guard
that trips if a second id...") and the coupling test (test-side literal vs. production set) are proven
live.

### Flag 5 — U5b-4 must render on BOTH shadow surfaces; `.is-caveat` site count 2→4
**ACCEPT.** Grepped both files myself in `pre` and `post`:

- `pre` (`49a5ef88`): exactly 2 real render sites — `context-bar.js:1622` and `scene3d-panel.js:750`
  (a third `context-bar.js:1393` hit is a comment, not a render site).
- `post` (`eb9707a8`): 4 real render sites — the original 2, plus new
  `context-bar.js:1939` (ctxbar Shadow flyout) and `scene3d-panel.js:3302` (docked Shadow section).

Matches the flag's expected baseline (2 at `context-bar.js:1622`/`scene3d-panel.js:750`) and
post-count (4) exactly.

### Flag 6 — no sub-control, no bag seeding
**ACCEPT, verified by diff, not prose.** `git diff e10306e9 eb9707a8 -- src/ui/panels/scene3d-panel.js
src/ui/shell/context-bar.js` shows purely additive blocks: both compute
`FS.effectiveLaw(shadowInfoLaw, {})` (an **empty** bag — no read from or write to the live
`shadow`/`s`/`bag` object) and `FS.note(...)`, then conditionally append a `<p>` /
`flyNote(...).classList.add('is-caveat')`. No assignment to any `params.shadow.*` key exists anywhere
in either diff. The new integration test `'U5b-4 — the caveat does not seed a sub-control onto the
shadow bag'` (both surfaces) independently confirms `Object.keys(shadow)` never gains `rungDetail` /
`bundleMode` / `penDown` / `penMode`.

### Flag 7 — two separate commits, each owning its own tests
**ACCEPT.** `git diff --stat`:
- `49a5ef88..d00ec210`: `scene3d-shadow-writeback.test.js` only (+274, WIP).
- `d00ec210..e10306e9` (**U9b-2**): `scene3d-shadow-writeback.test.js` (+9/−5, the STEP-0 fix) and
  `scene3d-tone-law-collapse.test.js` (+59, new describe block) — **no production file**.
- `e10306e9..eb9707a8` (**U5b-4**): `scene3d-panel.js` (+24), `context-bar.js` (+16),
  `scene3d-fill-style-picker.test.js` (+63) — no overlap with U9b-2's files.
- Full range `49a5ef88..eb9707a8`: exactly 5 files, matching the union of the two commits with no
  cross-contamination.

### Flag 8 — generative cross-check in scope for both commits; borrowed green attributed
**ACCEPT.** Neither commit touches `scene3d-fill-style-effective-law.test.js` or
`scene3d-fill-style-display-params.test.js` (absent from both diffstats above) — correctly disclosed
as "unmodified" rather than claimed as new coverage. I ran both files myself at **both** `mid`
(e10306e9 alone) and `post` (both commits): **7/7** and **3/3** at each. No red→green flip occurred at
either commit, so there is nothing to attribute — the report's "None" under Borrowed green is correct.

### Flag 9 — re-sum every table; collapse-file baseline and new count
**PARTIALLY REJECTED — see Coordinator Condition A below** (a real arithmetic error exists in the
"Total: 328/328" line, though every individual per-file count is independently confirmed correct).
Collapse-file baseline **117/117 at `49a5ef88`** is not disputed (matches every prior unit in this
chain per ROUND3-RESUME-BRIEFS.md §0). New count, measured by me directly: **119/119** at both `mid`
(e10306e9, 1004.9s wall, singleFork) and `post` (eb9707a8, 998.5s wall, singleFork) — 117 baseline + 2
new coupling tests, exactly as claimed. Derivation: the 2 new tests are the `describe('U9b-2 —
shadowResolvesToSurvivor coupling...')` block (lines 2029–2053 in `post`).

### Flag 10 — orchestrator picture flag: ctxbar select clipping "Duty Cycle · Constar"
**RESOLVED — pre-existing, not introduced by U5b-4. Filed as a follow-up, not a rejection.**
Started two scratch dev servers (ports 8492 POST / 8493 PRE, both free, ≥ 8490) and reproduced the
docked `dutyConst` capture independently via Playwright (`app.ui.buildControls()` against the real
`#dynamic-controls`), plus a targeted ctxbar-row-only capture on both `pre` (`49a5ef88`) and `post`
(`eb9707a8`):

- `selectComputedWidth` measured via `getBoundingClientRect()`: **146.1875px, byte-identical, at both
  pre and post** — U5b-4's caveat paragraph (a sibling `<p>` rendered *below* the row) does not affect
  the select's own box width at all; only the flyout's total height changes (476px → 570px).
- Visual crops of the Fill Style row alone (`pre-ctxbar-dutyConst-row-only.png` /
  `post-ctxbar-dutyConst-row-only.png`) are pixel-identical: both show "Duty Cycle · Constar" —
  **the SAME clipping exists at `49a5ef88`, before U5b-4 touched anything.**
- Confirmed against the implementer's own evidence too: `docked-dutyConst-section-full.png` shows the
  **docked** panel renders the label in full ("Duty Cycle · Constant", not clipped) — the clipping is
  specific to the ctxbar flyout's narrower column, a pre-existing cosmetic issue orthogonal to this
  fix, matching the implementer's own disclosure in `U5b-4-impl.md`.

**Follow-up (non-blocking):** the ctxbar Shadow flyout's `<select>` truncates a long compound label
("Duty Cycle · Constant") to "Duty Cycle · Constar" with no ellipsis at its current column width. Not
in scope for U5b-4; log as a small pre-existing UI polish item.

---

## Coordinator's four added conditions

### Condition A — U9b-2-impl.md's "Total: 328/328" arithmetic
**REAL ERROR, non-blocking (report-accuracy, not a hidden regression).** The report lists addends
`10+119+7+3+8+40+107+18` and states the sum is 328. I summed them myself: `10+119=129, +7=136, +3=139,
+8=147, +40=187, +107=294, +18=312`. **The correct sum is 312, not 328.** I independently re-ran every
one of the 8 named guard rows myself (see table below) and every individual count matches the report's
own per-file breakdown exactly — the error is purely in the final addition, not in any underlying test
count.

| row | files | my measured count |
|---|---|---|
| 1 | `scene3d-shadow-writeback.test.js` | 10/10 |
| 2 | `scene3d-tone-law-collapse.test.js` (singleFork) | 119/119 |
| 3 | `scene3d-fill-style-effective-law.test.js` | 7/7 |
| 4 | `scene3d-fill-style-display-params.test.js` | 3/3 |
| 5 | `scene3d-tone-laws-config.test.js` | 8/8 |
| 6 | `scene3d-shadow-tone-law` + `-uniqueness` + `one-pen-down-reachability` | 40/40 (28+7+5, ran together, all pass) |
| 7 | `stroke-fill-style-control` + `scene3d-panel` + `context-bar-scene-flyouts` | 107/107 (ran together, matches 30+38+39) |
| 8 | `scene3d-panel-style-live-sync` + `tone-law-dispatch` + `tone-law-plumbing` | 18/18 (ran together, matches implementer's split; combined with row 7's file set I measured 125/125 for rows 7+8 together) |
| **sum** | | **312** |

This is a report-accuracy defect: fix the headline in `U9b-2-impl.md` to "312/312" (or re-verify the
intended set if 328 was meant to include something not listed). Not a rejection — no test the report
claims passing actually fails, and no count is inflated to hide a failure.

### Condition B — commit 1 (e10306e9) tested in isolation
**CONFIRMED CLEAN.** Ran the 4 files directly against the `mid` export (e10306e9 alone, before any
of U5b-4's edits exist in the tree):

```
tests/integration/scene3d-shadow-writeback.test.js   10/10
tests/unit/scene3d-fill-style-effective-law.test.js   7/7
tests/unit/scene3d-fill-style-display-params.test.js  3/3
tests/unit/scene3d-tone-law-collapse.test.js        119/119  (singleFork, 1004.9s)
```
All 4 files pass identically in isolation at `mid` as they do at `post` — U9b-2's commit does not
depend on U5b-4's edits for any of its own or the cross-check guards' green.

### Condition C — U5b-4's RED reproduced via a real scratch-export run, not source reading
**CONFIRMED, real RED produced.** Extracted the exact diff `git diff e10306e9 eb9707a8 --
tests/integration/scene3d-fill-style-picker.test.js` (6 new tests, purely additive, applies cleanly)
and applied it onto the `pre` export's copy of the same file (verified byte-identical to `mid`'s copy
first, since U9b-2 never touched this file). Ran `-t "U5b-4"` against `pre` (`49a5ef88`, before the
`.is-caveat` render sites exist):

```
 FAIL  ... > Shadow Fill Style — context-bar Shadow flyout > U5b-4 — a caveat-bearing shadow law (dutyConst) renders a standalone .is-caveat paragraph in the Shadow flyout
 FAIL  ... > Shadow Fill Style — context-bar Shadow flyout > U5b-4 — the caveat does not seed a sub-control onto the shadow bag
 FAIL  ... > Shadow Fill Style — docked 3D Scene panel > U5b-4 — a caveat-bearing shadow law (dutyConst) renders a standalone .vs3-lawnote.is-caveat paragraph in the docked Shadow section
 FAIL  ... > Shadow Fill Style — docked 3D Scene panel > U5b-4 — the caveat does not seed a sub-control onto the shadow bag
 Tests  4 failed | 2 passed | 170 skipped (176)
```
The 2 that pass at `pre` are the two "non-caveat law renders NO caveat" controls (`ladder`) — correctly
trivially true both before and after the fix, since nothing ever renders a caveat for a non-caveat law.
Re-ran the same 6 at `post`: **6/6 green.** This is a real, reproduced RED→GREEN, not an inference from
reading source.

### Condition D — U9b-2 items 1–3 have no production RED; non-vacuity via mutation
**Item 1 (fires once/never on compose): non-vacuous, see Flag 2 above** — the bypass test in block (a)
goes RED under a real `scene3d.js` mutation that makes the write-back persist on every compose; one
sibling test in the same block is vacuous in isolation but the claim as a whole is proven.
**Item 2 (no undo entry): non-vacuous, confirmed by mutation.** Added
`this.pushHistory();` immediately after `this.engine.importState(state.engine)` in `app.js`'s
`applyState` (a scratch `mut-undo` copy, simulating "load always pushes an undo entry"). Result:
```
× (b) no undo entry at load > app.applyState of a doc needing the onePenDown write-back pushes no history itself
  → expected 1 to be +0
```
Went RED as expected — the guard is real, not vacuous. **Item 3 (round trip)** was not separately
mutation-tested per the coordinator's instruction (which named items 1–2 specifically); it is a
lower-risk claim (checking a specific resolved string round-trips through `exportState`/`importState`,
not an idempotent no-op scenario) and shares its production mechanism with item 1, which is now
mutation-proven. No further action taken on item 3.

---

## `## Bars changed` — verified by diff, not restated prose
Confirmed both reports' "None" claims by diffing every removed/changed line (not just added lines) in
every touched test file:
```
git diff 49a5ef88 e10306e9 -- tests/unit/scene3d-tone-law-collapse.test.js | grep '^-' | grep -v '^---'
git diff e10306e9 eb9707a8 -- tests/integration/scene3d-fill-style-picker.test.js | grep '^-' | grep -v '^---'
```
Both produce **zero output** — both diffs are purely additive (only `+` lines beyond the file
headers), so no existing numeric literal, threshold, or fingerprint was touched in either commit. The
"## Bars changed: None" sections in both `U9b-2-impl.md` and `U5b-4-impl.md` are correct.

## Live verification (independent, beyond the implementer's own evidence)
Looked directly at all 8 committed PNGs under `docs/3d-audit/fill-audit/after/U5b-4/` with the Read
tool. Confirmed:
- `docked-dutyConst-row-native.png` / `docked-dutyConst-section-full.png`: full, correct caveat text,
  correct placement (directly beneath Fill Style, above the flow/web note), label renders in full
  ("Duty Cycle · Constant", not clipped — docked has more column width than ctxbar).
- `ctxbar-dutyConst-row-native.png` / `ctxbar-dutyConst-flyout-full.png`: same caveat text and
  placement in the narrower ctxbar column; select label clips to "Constar" (see Flag 10 — confirmed
  pre-existing).
- `docked-ladder-row-native.png` / `ctxbar-ladder-row-native.png`: correctly render NO caveat
  paragraph for the non-caveat control law.

Independently reproduced the docked `dutyConst` capture from my own `post` scratch export (per the
task's minimum requirement), on port 8492 (≥ 8490, free), using `app.ui.buildControls()` against the
real `#dynamic-controls` container — got `hasCaveat: true`, `caveatText` byte-matching
`FS.note('dutyConst').caveat`. Both scratch dev servers (8492, 8493) were killed after the probe;
`git status` on the worktree remains clean (confirmed above) — no probe files were left in the
worktree.

## Summary

Both units are correctly scoped, honestly reasoned, and (after independent mutation-testing beyond
what either implementer report performed) their non-vacuity claims hold up — with one real,
non-blocking arithmetic error in U9b-2's headline total and one already-disclosed, now-confirmed
pre-existing cosmetic defect (ctxbar select label clipping) that U5b-4 did not introduce.

## Follow-ups (non-blocking)

1. Fix `U9b-2-impl.md`'s "Total: 328/328" to "312/312" (sum of its own listed addends).
2. Note in `scene3d-shadow-writeback.test.js` that the "no per-pass rewrite after load" test (using
   the already-resolved value) is vacuous in isolation against a "write-back fires on every render"
   regression — the sibling bypass test (raw value) is the load-bearing proof for that specific claim.
3. File the ctxbar Shadow flyout's `<select>` label truncation ("Duty Cycle · Constar", no ellipsis)
   as a small pre-existing UI polish item, unrelated to U5b-4.
4. Merge risk (carried forward from U9b-review.md, now a 4th touch): `scene3d-tone-law-collapse.test.js`
   is edited across fill-collapse-2 (U5b), handoff-c2 (U9), fill-collapse-3 (U9b, U9b-2) — flag for the
   merge orchestrator.
