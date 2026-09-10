STATUS: ACCEPT-WITH-FOLLOWUPS

# W-27c-0a-5 — reviewer report

Lane under review: fill-audit-d2, worktree `.claude/worktrees/fill-audit-d2`
(read-only), pinned range `323e2583..49cf0e3e`. Reviewed against
`docs/3d-audit/lane-reports/AGENT-PROTOCOL.md` §Reviewers,
`W-27c-0a-5-impl.md`, and the LEDGER.md row-16a secretary condition ("If the
measurement shows the wasted rounds are load-bearing ... stop-report that
rather than pinning a number nobody understands").

All work done read-only in two scratch exports
(`/private/tmp/claude-501/scratch-W27c5-review-{pre,post}`, `git archive`
of `323e2583`/`49cf0e3e`, symlinked `node_modules`), both deleted at the
end of this review. No edit, stash, or probe file was made in the worktree
or main.

## 1. No `src/` change

`git -C .claude/worktrees/fill-audit-d2 diff --stat 323e2583..49cf0e3e --
src/` → empty. `... -- . ':!graphify-out'` → exactly one file,
`tests/unit/scene3d-contour-slice.test.js`, `+336/-0` (pure append, no `-`
lines anywhere in the diff — confirmed by reading the full patch). Matches
the impl report's own claim. **CONFIRMED.**

## 2. Independent reproduction of the measurement table

Reproduced the table with my own script, not the implementer's — a
standalone `tests/unit/_review-w27c5-scratch.test.js` (scratch-only, never
committed) that drives the REAL engine call path
(`engine.computeAllDisplayGeometry()`, default torus, `contourSlice`,
`sliceCount 26`) with a private instrumentation hook I added directly
inside `refineSliceRing` in the scratch copy of `scene3d.js` (entry log at
the top, an exit log keyed to the same entry recording `roundsUsed`,
`finalCount`, world-space `worldLen`, `closed`) — i.e. the implementer's
"Method A" (private instrumentation on the real call path), built
independently rather than re-run.

Result: **47 total `refineSliceRing` calls**, **5 with `rawCount<=4`**.
Per-ring values matched the impl table **to 16 significant figures**:

| level | rawCount | finalCount | worldLen (mine) | finalLengthMm (impl) | roundsUsed |
|---|---|---|---|---|---|
| 2 | 3 | 3 | 0.9577085225447255 | 0.9577085225447255 | 0 |
| 2 | 4 | 4 | 9.008240123917343 | 9.008240123917343 | 0 |
| 6 | 3 | 513 | 0.0040003198533569585 | 0.0040003198533569585 | 8 |
| 21 | 2 | (bails pre-loop, unchanged) | — | 2.4294681743220017 | — |
| 25 | 4 | 4 | 5.727369993006849 | 5.727369993006849 | 0 |

Exact match on every measured field, including the level-6 non-convergence
(513 points, 8 rounds, 0.004mm). The level-21 2-point ring bails at the
existing `worldPts.length < 3` gate before reaching my post-loop hook,
consistent with the impl report's own description ("bails out ... before
the `< 3` gate"). **CONFIRMED, independently.**

## 3. Guard shape and framing

The added `describe` block (lines ~2558–2898 of the post-sha test file)
uses the floor/ceiling ±10% band shape (`bandLo`/`bandHi`, `Math.max(v*0.1,
0.001)`) matching the W-26b-3 precedent, layered with tight discrete-fact
assertions (`level`, `rawCount`, `closed`, `roundsUsed`) for the 5 named
rings. The describe-block header comment explicitly states: "THIS IS A
MEASUREMENT PIN, NOT A CLAIM OF CORRECTNESS: it does not assert the
level-6 ring's behavior is right ... only that its ... shape stays within
the measured envelope." The level-6-specific test repeats this framing at
the assertion site. **CONFIRMED — shape and disclaimer both present and
accurate.**

## 4. Mutation reproduction — skip refinement for ≤4-point rings

Applied the implementer's named mutation
(`if (worldPts.length <= 4) return worldPts;` immediately after the
existing `< 3` bail) to the scratch-post copy of `scene3d.js` and ran the
new describe block alone:

- **2 of 6 new tests fail**, exactly as claimed: the discrete-signature
  test (`deviceMaxTurn`/`roundsUsed` band and exact checks — level-6's
  `roundsUsed` becomes `0` instead of `8`) and the level-6 harmlessness
  test (`roundsUsed` becomes `0`, failing `toBe(8)`).
- The other 4 new tests still pass (total/small counts, med/max identity,
  fragment guard, sum/worst-turn band) — matches the impl report's own
  count precisely.

**CONFIRMED, byte-for-byte reproduction of the claimed RED proof.**

## 5. Second mutation (not tried by the implementer) — cap refinement at 2 rounds

This is the central question this review was asked to settle: **are the 8
rounds load-bearing, or wasted?** Mutated `SLICE_REFINE_MAX_ROUNDS` from
`8` to `2` in the scratch-post copy (global, not ring-scoped — the natural
knob, since there is no per-ring override in the source) and re-ran the
new describe block:

- **The guard trips**: the same 2 tests fail as under mutation 1
  (`roundsUsed` exact-`8` assertions in both the discrete-signature test
  and the level-6 harmlessness test — now measuring `2`).
- **But the quantities that would actually matter for rendered output do
  NOT move materially.** At round 2 vs round 8 for the level-6 ring:
  - `finalLengthMm`: **0.0040001598...** at round 2 vs **0.0040003199...**
    at round 8 — agree to 5 significant figures.
  - `deviceMaxTurn`: **179.9965°** at round 2 vs **179.9993°** at round 8 —
    agree to 4 significant figures, both squarely non-convergent.
  - Only `finalCount` differs by construction (9 vs 513 — subdivision
    doubles the point count every round regardless of whether the shape is
    still changing).
  - Mutation 1 (skip refinement entirely, i.e. round 0) gives
    `finalLengthMm = 0.0040991559` and `deviceMaxTurn = 180` (exact, raw
    chord) for the SAME ring — again agreeing with the round-8 values to
    ~2–3 significant figures.

**Ruling: the 8 rounds are NOT load-bearing.** The level-6 ring's raw
geometry (two points 0.0038mm apart) is already a fully-formed,
near-180°-turn, sub-0.005mm degenerate spike at round 0; every round of
Catmull-Rom subdivision from 0 through 8 reproduces essentially the same
harmless-but-broken shape, just at exponentially more points. Nothing
about the *drawn* output depends on running all 8 rounds — a legitimate,
unrelated, purely-performance-motivated future reduction of
`SLICE_REFINE_MAX_ROUNDS` (the source's own comment already flags the
"runaway 180° spike" as a known, if previously less precisely measured,
limitation) would leave the picture on paper unchanged.

Given that, per the ledger's own conditional ("if load-bearing, stop-report
— else pin"), **pinning was the structurally correct path, not
stop-reporting** — the implementer did not make the protocol error the
ledger warned against. But the *specific bars chosen* do not reflect that
finding faithfully:

**Four bars measure the wrong quantity** (an artifact of the fixed
`SLICE_REFINE_MAX_ROUNDS` constant and Catmull-Rom's per-round point
doubling, not of the ring's actual visual/geometric state):
1. `expect(r.roundsUsed).toBe(e.roundsUsed)` in the discrete-signature test
   (line ~2835 post-sha) — tight equality on level-6's `roundsUsed: 8`.
2. `expect(r.finalCount)` ±10% band in the same test, applied to
   level-6's `finalCount: 513` — a number that is exponentially sensitive
   to round count with no corresponding sensitivity in the drawn output.
3. `expect(lvl6.roundsUsed).toBe(8)` in the level-6 harmlessness test
   (line ~2869) — the report's own comment frames this as "a future fix
   that makes it converge is a genuine improvement requiring disclosure,"
   which is only true in ONE direction: a harmless global tuning of the
   round cap (unrelated to any convergence fix) trips this identically to
   a genuine convergence fix, and the test cannot tell them apart.
4. `expect(lvl6.finalCount).toBeLessThanOrEqual(700)` in the same test —
   also purely a function of round count via doubling, not of anything
   that changes what gets drawn.

The two bars in the level-6 test that DO measure something that matters —
`deviceMaxTurn > 160` (confirms the pathology is still present, whatever
its exact magnitude) and `finalLengthMm < 0.05` (the actual "stays
invisible" guard, with >10x headroom) — are the ones I found to be robust
across both mutations (varying by <0.01% and staying non-convergent in
every case tested). Those two are well-designed and should be kept as the
unit's real protection.

## 6. Full suite reproduction

Ran `npx vitest run tests/unit/scene3d-contour-slice.test.js` from both
scratch exports, foreground, one file at a time:

- Post-sha (`49cf0e3e`): **63/63** (matches impl claim exactly: 57
  pre-existing + 6 new).
- Pre-sha (`323e2583`), for reference: **57/57** (confirms the 6 added
  tests are the entire delta).
- `tests/unit/scene3d-contour-slice-corners.test.js` (post-sha, W-34's
  file, named in the impl report as unaffected): **25/25**.

**CONFIRMED.**

## 7. `## Bars changed` section

Impl report declares "None. Every assertion added by this unit is a new
bar." Verified against the raw diff: the entire 336-line change is a
single appended `describe` block with zero `-` lines anywhere in the file
— no existing test, tolerance, or fingerprint in
`scene3d-contour-slice.test.js` was touched. **CONFIRMED — the disclosure
is accurate as far as it goes; see §5 above for the substantive concern
about the NEW bars' own design, which is a different question from
whether existing bars moved (they did not).**

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** The measurement is accurate, independently
reproduced exactly (§2), the RED proof for the named mutation reproduces
byte-for-byte (§4), no `src/` file moved, no existing bar moved, and the
unit is honest about its own limits (explicitly flags the level-6
non-convergence as a real, previously-undisclosed, currently-harmless
defect rather than absorbing it silently). The ledger's stop-report
trigger was not, in fact, hit — the rounds are measurably NOT load-bearing
— so pinning-with-disclosure was the right call at the top level.

**Required follow-up** (does not block merge of this tests-only unit, but
must be filed and picked up before this guard is trusted as a change
detector): the 4 bars named in §5 (`roundsUsed` exact-equality ×2,
`finalCount` band, `finalCount<=700`) should be loosened or dropped in
favor of the two that already carry the real signal
(`deviceMaxTurn>160`, `finalLengthMm<0.05`) — as written, a harmless,
unrelated future reduction of `SLICE_REFINE_MAX_ROUNDS` will trip this
guard and force a spurious `## Bars changed` disclosure indistinguishable
from an actual correctness change, which is exactly the "pinning a number
nobody understands" the ledger's own condition was trying to head off.
