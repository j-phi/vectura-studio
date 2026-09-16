STATUS: ACCEPT-WITH-FOLLOWUPS

# W-36d — adversarial review

Reviewer, read-only. Worktree under review: `.claude/worktrees/fill-audit-a3`, pinned range
**cd541f87..dcc91872** (one commit, one file). Verified `git -C <worktree> status --short -- .
':!graphify-out'` clean and `git stash list` shows only graphify noise before starting. All
verification below ran foreground, one vitest file at a time, against scratch exports
(`git -C <worktree> archive cd541f87|dcc91872 | tar -x` into
`/private/tmp/claude-501/scratch-W36d/{pre,post}`, `node_modules` symlinked from the worktree) or
copies of those exports with a mutated `surface-fill.js`. The live worktree was never edited,
stashed, or reset. All scratch dirs deleted at the end of this review; `git status` in the worktree
confirmed clean afterward.

## (4) Tests-only, exact diff — CONFIRMED

`git diff cd541f87..dcc91872 -- . ':!graphify-out'` touches exactly
`tests/unit/scene3d-curved-density-floor.test.js`, +32/-0, one new `test(...)` block plus its
comment, inserted exactly where the impl report says (immediately after the kept
endpoint-ratio/monotonicity test, inside the `BYTE-IDENTITY GUARD` describe block). No `src/` file,
no other test file, no helper file. `git show --stat dcc91872` and
`git diff-tree --no-commit-id --name-only -r dcc91872` both confirm the same single file — the
commit carries **no graphify-out churn at all** (cleaner than the impl report's "graphify staged its
own update" claim, not a discrepancy that matters). `## Bars changed` in the impl report correctly
lists the new sub-bar as ADDED, names the exact old location it restores, and states no other bar
moved — confirmed by diff, nothing widened.

## (5) Slow-file runtime and pass counts — CONFIRMED, faster than briefed

`tests/unit/scene3d-curved-density-floor.test.js`, full file, foreground, `timeout: 600000`,
default pool (no singleFork needed):

- **post (dcc91872): 14/14 pass, 6.28s.**
- **pre (cd541f87): 13/13 pass, 5.34s.**

Both far under the Tier-2 "12-16s" estimate in `ROUND3-RESUME-BRIEFS.md` §0 (that estimate is for
`-sparse-end`'s battery combined with this file's own runs under load; today, uncontended, it's
fast) — no timeout risk either way, and the counts (13→14, +1 exactly the new test) match the impl
report exactly.

## (1) What the bar measures, and independent re-derivation

Confirmed by reading `crossFamilyBCount` (test file line 80) directly: it drives
`SurfaceFill.buildObject` via monkeypatch, filters front-facing runs, sorts distinct `.fam` ids, and
counts **distinct `lineIndex` values on the second (crossing, "A#1") family only** — i.e. the number
of DISTINCT RULINGS family B itself draws, isolated from family A and from the `fillCount` TOTAL the
rest of the file uses. This is not the crossing family's ink or coverage — it's a raw ruling count.

**Does it measure the lower-half response SHAPE?** No — and this matters for the follow-ups below.
It is a two-point ratio (`nB(0.25)` vs `nB(1.0)`), not a shape/slope check across the interval. It
answers "does the endpoint move enough," not "does the whole lower half move smoothly." The kept
monotonicity/endpoint test is likewise a 3-point sample (0.25/1.0/2.0). Neither test, together or
separately, samples the interior of `(0.25, 1.0)` or `(1.0, 2.0)` — see (2) below for what this
misses in practice, not just in theory.

**Independent re-derivation** (own standalone probe test, not copying the committed assertions),
against the untouched `dcc91872` `surface-fill.js`:

| | nB(0.25) | nB(1.0) | ratio |
|---|---|---|---|
| d=10 | 9 | 7 | **1.2857** |
| d=100 | 61 | 47 | **1.2979** |

Matches the impl report and the review's disclosed 1.286/1.298 to the same precision, re-run fresh
by me. Margin above the 1.2 floor: **7.14% (d=10) / 8.16% (d=100)** in ratio terms.

## (2) Mutation proof — CONFIRMED for the specified mutation; TWO independent mutations show the bar's blind spot

**Review's own lower-half-freeze mutation**, applied to a scratch copy of post's `crossPairShare`
(`role==='b' && r<=1` compressed to a 2%-slope near-constant, `r>1` untouched), run against the full
file:

- **Kept test PASSES** under the mutation: nB = 8/7/4 (d=10), 55/47/24 (d=100); endpoint ratios 2.00
  / 2.29, strict monotonicity holds.
- **New sub-check FAILS**: 8/7 = **1.1429** (d=10), 55/47 = **1.1702** (d=100), both under 1.2 —
  `AssertionError: expected 1.1428571428571428 to be greater than or equal to 1.2`.
- A third, pre-existing pinned-fingerprint test in the same file (`crosshatch mapper (per-family
  budget): pinned fill counts...`) also broke under this mutation (22→20) — expected side effect
  (the mutation changes `crossPairShare` globally, which also moves `runSphere`'s TOTAL fillCount),
  not a signal I chased further since it's outside this unit's scope.

This reproduces the impl report's RED proof exactly, independently re-run by me on my own scratch
copy, not copied from either report.

**My own second mutation (upper-half freeze, `role==='b' && r>1` frozen instead):** the kept
endpoint/monotonicity test fails (`expected 1.2857... >= 2` at the 0.25-vs-2.0 endpoint check) while
the new lower-half sub-check passes (as designed — it only samples the lower half). Confirms the two
bars have non-overlapping, complementary catch domains, as claimed.

**Two further mutations, designed specifically to probe the gap the sub-bar's own two-point design
implies (secretary condition 1):**

- **Mutation 3 — interior notch `[0.4, 0.9]`**, frozen to the real `r=0.7` value, **touching neither
  sampled endpoint** (0.25 and 1.0 keep the exact real `1/r` formula). Fine-grained sweep confirms:
  at d=100 the real dial already goes 61/58/56/**55/55/55/55**/52/47/39/31/24 across
  0.25/0.3/0.4/0.5/0.6/0.7/0.8/0.9/1.0/1.2/1.5/2.0 — the mutation changes only the r=0.9 sample
  (52→55, i.e. it erases a real 3-count step that should occur between 0.8 and 1.0). **Both the kept
  monotonicity/endpoint test AND the new W-36d sub-bar still PASS** — neither catches it, because
  neither samples r=0.9.
- **Mutation 5 — defect concentrated in `[0.5, 1.0]`** (secretary's specific ask): froze `[0.6,
  0.95]` to the real `r=0.8` value. Same result: r=0.9 wrongly stays at 55 instead of the real 52 at
  d=100 (and 7→8 at d=10). **Both bars still PASS.** **Answer to "which bar, if any, catches it": none
  in this file.**

**Ruling on (2):** the mutation-proof condition in the brief (catch the review's OWN demonstrated
mutation while the kept bars stay green) is met, cleanly and reproducibly. But the sub-bar's
two-point design has a real, demonstrated blind spot to interior-only degradations, including one
concentrated in exactly the sub-range secretary condition 1 named. This is not a defect in what was
shipped — the LEDGER row 4a scope was explicitly "restore a bounded lower-half sub-check... at the
review's measured-minimal value," not "close every gap a magnitude check could have," and the
committed unit does precisely that, honestly and minimally. It is a genuine, disclosable follow-up.

### Secretary condition 1 — invented adversaries, verdict

Both a narrow interior notch (`[0.4,0.9]`) and one concentrated in `[0.5,1.0]` (`[0.6,0.95]`) evade
**every bar in the file**, kept or new. Neither the endpoint-ratio bar (0.25 vs 2.0), the strict
monotonicity check (0.25/1.0/2.0), nor the new sub-bar (0.25 vs 1.0) samples the interior of any
sub-interval — this is a structural property of any finite-point-sample magnitude check, not
specific to this implementation. **Verdict: real gap, correctly out of this unit's stated scope,
should be a named follow-up** (e.g., extend the sub-check to sample a mid-point such as 0.5 or 0.7,
or adopt the fine sweep used in this review as a cheap (<5s) full-shape guard).

## (3) Coin-bar check

**Ratio-terms margin at the two tested points: 7.14% (d=10) / 8.16% (d=100).** Compared to
`1193cbe1`'s rationale (rounding golden-hash/float comparisons to 9dp to absorb arm64-vs-x86_64 ULP
drift in the 14th significant digit): **not the same failure class.** `nB` is `Set.size` on
`lineIndex` — an integer ruling count, not a floating-point value compared bit-for-bit — so
`1193cbe1`'s specific fix (precision rounding before hash/`toEqual`) does not apply here; this test
was not one of the four `1193cbe1` touched and does not do golden/hash comparison at all.

However, a **structurally analogous** fragility exists and is worth stating precisely rather than
dismissed by the percentage framing: expressed in raw integer counts, not ratio, the **d=10 point
has exactly one count of headroom** — `9 - 1.2*7 = 0.6`; if `nB(0.25)` had come out 8 instead of 9
(or `nB(1.0)` 8 instead of 7), the ratio 8/7=1.1429 or 9/8=1.125 would both fail the 1.2 floor. A
single off-by-one ruling count — plausible from a legitimate future geometry change, or in principle
from a boundary `floor`/`ceil` on a near-integer float flipping by one platform-dependent ULP,
which is exactly the mechanism class `1193cbe1` was fixing elsewhere, just manifesting as an integer
miscount rather than a hash mismatch — would break this specific assertion. **The d=100 point is
comfortably robust**: `61 - 1.2*47 = 4.6`, i.e. ~5 counts of integer slack, far more than a single
ULP-scale flip could plausibly move. **Not a coin bar today** (both points measured pass with real
margin, and the d=100 point is genuinely robust) but the d=10 point's true robustness is thinner than
the 7% ratio figure suggests — a fact worth carrying forward, not a blocker.

### Secretary condition 2 — drift envelope by fixture/primitive/density

Swept `nB(0.25)/nB(1.0)` independently (own probe, real unmutated `dcc91872` source):

**By density (sphere):** d=1 → 1.40, d=5 → **1.167 (BELOW 1.2)**, d=10 → 1.286, d=25 → 1.30, d=50 →
1.286, d=100 → 1.298, d=150 → 1.444, d=220 → 2.093.

**By primitive (d=10 / d=100):** sphere 1.286/1.298, cylinder 1.25/1.34, torus 1.50/1.72, ellipsoid
1.50/1.326, cone 1.333/1.474, **capsule 1.286/1.224 (only 2.04% margin at d=100)**.

**Ruling:** `nB`'s ratio moves substantially with both fixture and density — **YES to the secretary's
question in the W-26b-3 sense, with an important caveat.** The committed test only asserts at
`(sphere, d=10)` and `(sphere, d=100)`, where the margin is a healthy 7-8%; at neither of those exact
points does today's code sit close to failing. But (a) at `d=5` (untested, real code) the ratio is
**1.167, already below the 1.2 floor** — proof that 1.2 is not a general dial-law constant and must
never be extended to other densities without re-deriving a floor for each; and (b) capsule at d=100
sits at only 2% margin — far thinner than the sphere numbers the review's "not a coin bar" framing is
based on. **As pinned (sphere only, d=10/d=100 only), this is not a coin bar. As a claim about the
mechanism in general, "not a coin bar" oversells it** — a future unit that reuses 1.2 against a
different primitive or density without re-measuring risks a false failure on correct code, or a
false pass masking a real regression (capsule's thin margin). Recommend the LEDGER/impl language be
corrected to scope the "not a coin bar" claim to the exact fixture tested.

### Secretary condition 3 — density sweep 1/25/50/220

Included above under condition 2's density table (1/5/10/25/50/100/150/220 swept, superset of the
requested set). **1.2 holds at every one of 1/10/25/50/100/150/220** (range 1.286-2.093) but **fails
at d=5 (1.167)** — the one interior sample where the real mechanism dips below the bar. No density
in the sweep shows a ratio far above 1.2 that would "hide" a regression relative to the pinned
1.2 (the closest-to-floor points other than d=5 are d=10/d=50, both ~1.286, already the ones tested).
The practical exposure is the d=5 finding: a future unit must not casually port `>= 1.2` to
untested densities.

### Secretary condition 4 — lineIndex undercounting risk

Read `surface-fill.js` directly (not argued from the test file). `lineIndex` is assigned as the
literal loop index `i` at every emission call site (`emitLine(..., i, count, ...)` at lines 9822,
10277, 10293, 10900 — one call per ruling, `i` running 0..count-1). The file's own comment at
line 6615 states explicitly: *"Each FAMILY gets its own id. `lineIndex` is only unique WITHIN a
family — crosshatch's A and B families both index from 0"* — and separately documents that a single
ruling CAN return as multiple spans/runs sharing the SAME `lineIndex` ("the rare ruling that comes
back as more than one span"). `crossFamilyBCount` filters to `fam === bFam` **before** taking
`Set(...lineIndex)`, so: (a) it cannot merge family A and family B rulings (different `.fam`,
filtered out first) even though both index from 0, and (b) a ruling split into multiple spans
correctly collapses to ONE `Set` entry rather than being over- or under-counted. **Confirmed: `nB`
cannot undercount from lineIndex reuse across sub-passes or families — it exactly counts distinct
drawn rulings within family B.**

### Secretary condition 5 — re-measurement, not trusted from implementer

Done throughout (1) and the mutation/sweep work above via my own standalone probe test files, run
against my own scratch export of `dcc91872`, not the implementer's numbers. Independently obtained
9/7 (d=10) and 61/47 (d=100), matching to the same precision.

### Secretary condition 6 — commit scope and lane red set

`git show --stat dcc91872`: **exactly `tests/unit/scene3d-curved-density-floor.test.js`, no other
file, no graphify-out entry at all** (see (4) above — full detail, not a summary). Lane red set
spot-checked on **both** shas (not just one), same file, foreground:
`scene3d-ribbon-wall-coverage.test.js` — **35/36 pass at cd541f87 (60.85s) AND 35/36 pass at
dcc91872 (67.22s)**, byte-for-byte identical pass/fail counts. (`f1b-streaks` not independently
re-run this session — one spot-check across both shas on the same file satisfies the brief's "check
one of the two," and this unit's diff cannot plausibly move a ribbon file it never touches; flagging
this as the one item taken on the brief's own stated sufficiency rather than exhaustive re-run.)

## Overall verdict

**ACCEPT-WITH-FOLLOWUPS.** The unit is exactly what LEDGER row 4a asked for: tests-only (verified by
diff and by `git show --stat`), one file, +32 lines, restoring a bounded lower-half magnitude
sub-check at the review's own measured-minimal value (1.2), alongside — not replacing — the kept
monotonicity/endpoint test, mutation-proven against the review's own specified lower-half-freeze
mutation (independently reproduced: kept test passes, new sub-check fails at 1.143/1.170). Numbers
independently re-derived, matching to the same precision. Pre/post pass counts (13/13 → 14/14)
confirmed on scratch exports. `## Bars changed` is accurate and complete — one net-new bar, nothing
widened. Lane's pre-existing red set (wall-coverage 35/36) confirmed unchanged at both shas.

**Follow-ups, none blocking this unit's own scope:**
1. The sub-bar (and the kept monotonicity/endpoint test) only sample 2-3 points; two independently
   constructed interior-only mutations — including one concentrated in `[0.5,1.0]` as specifically
   asked — pass every bar in the file while measurably breaking the dial's response at `r=0.9`. A
   future unit should consider sampling an interior point (e.g. 0.5 or 0.7) or adopting a cheap
   (<5s) full-sweep shape check.
2. The "not a coin bar" framing is correct for exactly (sphere, d=10/d=100) but should not be
   generalized: real code dips below 1.2 at d=5 (1.167), and capsule at d=100 sits at only ~2%
   margin. Any future reuse of the 1.2 constant against a different fixture or density must
   re-measure, not assume.
3. The d=10 assertion's true robustness is one integer ruling-count, not the 7% the ratio suggests
   (`9 - 1.2*7 = 0.6`); d=100 has ~5 counts of slack and is comfortably robust. Not the same failure
   class `1193cbe1` fixed (integer count, not float/hash comparison) but structurally analogous —
   worth knowing if this bar is ever seen flaking under load or across machines.

No vacuous-pass guard, no widened tolerance, no fingerprint re-pin, no undisclosed bar move. Evidence
gathered from multiple independent scratch exports and mutations, not from one pipeline or the
implementer's own numbers.

Scratch dirs deleted at the end of this review; nothing left in the worktree
(`git status --short -- . ':!graphify-out'` clean, verified after cleanup).
