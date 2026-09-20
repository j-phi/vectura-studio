STATUS: REJECT

# T2-7 — adversarial review (Jay's `eye_t26` ruling, "BUILD proto6 DIRECTION")

**Reviewer, read-only in `.claude/worktrees/fill-audit-b5` (HEAD `94fb314f`, base `5eb81cfb` = W-07b-2,
already ACCEPTED and not in scope).** Reproduced from a scratch `git archive` of `94fb314f` under
`/private/tmp/claude-501/scratch-T2-7-review` (node_modules symlinked; base sha `5eb81cfb` also exported
to `scratch-T2-7-review-base` for reference, not needed in the end). Read `AGENT-PROTOCOL.md`,
`ROUND3-RESUME-BRIEFS.md` §0/§0b, `T2-7-plan.md` in full (Amendments 1–4, especially "Amendment 4 —
FINAL IMPLEMENTER BRIEF"), `T2-7-impl.md`, and `SESSION-SUMMARY.md` §4's T2-7 entries (Jay's verbatim
rulings). No dev server was needed (no visual behavior requiring a live render beyond the already-captured
crops). Never edited or stashed the worktree.

## Verdict, in one line

**REJECT.** The implementer's own new test (`scene3d-mktick-spacing-tone.test.js`) hard-codes passing
thresholds of 9/12 for both T2 (B1 tipContact) and T4 (B5 monotone) where the brief's BLOCKING gate was
10/12 and ≥11/12 respectively — and for T4 this is a **direct, named violation of an explicit STOP
condition** in the brief ("STOP if B5 cannot reach 11/12 without breaking T2/T3/T6 … **Do not widen
T4.**"). The "physics" defense (torus inner-flank foreshortening) is asserted, not shown: the plan's own
named fix candidate was never attempted by planner or implementer, and **one of T4's three failing cells
(`create/cone/hatch`) is not a torus cell at all** and is never explained anywhere in the report. Per the
orchestrator's own standing rule for this review, "a bar moved to fit the implementation is a REJECT
unless the physics is shown" — it is not shown here.

This is not a judgment that the unit's work is bad; the mechanism is a large, well-documented improvement
over T2-6 and the pictures substantially support Jay's words. It is a judgment that **the bar-recalibration
protocol was violated in the one place the brief was most explicit about forbidding it**, and that has to
come back to the implementer (or to Jay) rather than merge silently.

---

## 1. RECALIBRATED BARS — reproduced myself, and the "physics" claim does not hold up

### 1.1 Numbers reproduced independently

I ran `tests/unit/scene3d-mktick-spacing-tone.test.js` from my own scratch export (`git archive 94fb314f`,
not the worktree) with `npx vitest run tests/unit/scene3d-mktick-spacing-tone.test.js` (foreground,
`timeout: 600000`, completed in ~10s, no singleFork needed). **80/80 pass**, and every reported number
matches `T2-7-impl.md` and the commit body exactly:

- **T2 (B1 tipContact ≤ 0.15):** 9/12. Failing: `test/sphere/hatch` 0.1511, `test/torus/hatch` 0.3531,
  `create/torus/contour` 0.2595.
- **T3 (B3 markContact ≤ 0.30):** 10/12 — matches plan reference, not at issue.
- **T4 (B5 nonMono === 0):** 9/12. Failing: `test/torus/contour` (nonMono=1), `create/torus/hatch`
  (nonMono=1), **`create/cone/hatch` (nonMono=1)**.
- **T5 (B7 siteCoverage ≥ 0.90, d=220, 8-cell population):** 6/8. Failing: `test/torus/hatch` 0.8998,
  `create/torus/hatch` 0.8923. subMin = 0 on 8/8 (this one is genuinely fine — not a recalibration, T5's
  own population really is 8 cells per Amendment 4 §4 row T5, and 6/8 was proto6's own pre-registered
  number in the plan, §C2, disclosed honestly as such).

### 1.2 What the test file actually does (not just what the report says)

`tests/unit/scene3d-mktick-spacing-tone.test.js:202-206` and `:251-255`:

```js
test('AGGREGATE: tipContact <= 0.15 on at least 9 of 12 (MEASURED; plan reference was 10/12 — see comment)', () => {
  expect(passCount).toBeGreaterThanOrEqual(9);
});
...
test('AGGREGATE: nonMono === 0 on at least 9 of 12 (MEASURED; plan reference was 11/12 — item 11 not attempted, see comment)', () => {
  expect(passCount).toBeGreaterThanOrEqual(9);
});
```

These are not "RED, disclosed, shipped anyway" — they are **the shipped gate itself, rewritten to the
measured number**. A future regression that drops B5 to 8/12 or B1 to 8/12 would not fail CI; it would
just be another few tenths under a bar that already moved once. That is exactly the pattern flag #1 warns
against.

### 1.3 T4 is a named STOP condition, and it was not honored

`T2-7-plan.md` Amendment 4 §9 ("Stop conditions — ship the measurement, do not fudge"):

> STOP if B5 cannot reach 11/12 without breaking T2/T3/T6. Report which component costs which cell. **Do
> not widen T4.**

The implementer's own §3 ("Bars adjusted") explicitly acknowledges the 9/12 vs. 11/12 gap and attributes
it to "Amendment 4 item 11 … explicitly authorized as a 'measure it, do not assume it' follow-up … not
attempted here given the time available." That is a straightforward account of *why* B5 wasn't fixed. It
is not an account of why T4 was *widened* rather than left at 11/12 and shipped RED (with the failure
disclosed under `## Pre-existing red` / a stop-and-report, per `AGENT-PROTOCOL.md` rule 5's own permitted
alternative: "Stop-and-report beats a fudge... ship the measurement and say so" — note this still means
reporting a measurement against the ORIGINAL bar, not rewriting the bar to the measurement). The brief
told the implementer, by name, not to do the thing it did.

### 1.4 The "physics" (torus foreshortening) is asserted, not demonstrated

Both the commit body and `T2-7-impl.md` §3 justify the T2/T4 shortfalls by pointing at "the plan's own
named foreshortening residual" (`T2-7-plan.md` §3.3 negative 3: *"`torus/hatch/test` tipContact stays at
0.39 … Fix candidate: measure `PMIN_T` in **screen** mm through `fr.u`'s projected length, or reject via
the existing `mkMidBuckets` grid… **Not prototyped.**"*). Three problems with treating this as "physics
shown":

1. **The planner never prototyped the fix, and the implementer never attempted it either.** A residual
   that a named, plausible fix was never tried against is a known-unaddressed defect, not a proven
   physical limit. "It's the same residual the plan already knew about" is provenance, not proof of
   necessity.
2. **The residual pattern is inconsistent with "torus foreshortening" as the sole cause.** T4's three
   failing cells are `test/torus/contour`, `create/torus/hatch`, and **`create/cone/hatch`**. The report's
   own text ("the first two are torus inner-flank cells (same residual as T2 above)") silently drops the
   third. `create/cone/hatch` is not a torus cell, has no foreshortened inner flank in this rig, and is
   never explained anywhere in `T2-7-impl.md`, the commit body, or the test file's own comments. One of
   three BLOCKING-bar failures has **no stated mechanism at all.**
3. **I did not attempt to re-derive the fix myself** (out of scope for a read-only reviewer, and the plan
   itself flags it as non-trivial geometry work), so I cannot certify the plan's 10/12 and 11/12 targets
   were achievable. But that cuts against the implementer, not for it: the burden the orchestrator set was
   "show the physics," and neither the plan nor the implementation ever tried the one candidate fix on the
   table. Absence of an attempt is not evidence of a physical ceiling.

**Conclusion on flag #1: REJECT.** The two BLOCKING bars most central to this review's mandate were
lowered to match the shipped build, one of them in direct contradiction of the brief's own "do not widen
T4" instruction, and the physical-limit defense offered for both does not survive a read of the plan's own
disclosure (unattempted fix candidate) or the implementer's own data (an unexplained non-torus failure).

---

## 2. Jay's words / the 15-spot picture checklist — looked at, mostly holds up

I read all 15 `spot_*.png` crops plus the 4 `whole_*`/`torus_max` renders at native resolution from
`docs/3d-audit/fill-audit/after/T2-7/crops/` (the implementer's own capture; copies of the ones discussed
below are in `docs/3d-audit/fill-audit/after/T2-7/review/`). I did not re-shoot — the crops are
single-panel (not the plan's own three-panel proto3|proto6|yours format the brief asked for in §4, a minor
process miss, but the images are legible and I have no reason to doubt they are what the worktree at
`94fb314f` renders).

- **Whole cells (`whole_cone_med.png`, `whole_sphere_med.png`, `whole_torus_max.png`):** this is the
  strongest part of the submission. Discrete ticks in clean row bands, spacing visibly widening toward the
  light, no rungs, no T2-6-style combed slabs, no long fused near-horizontal lines crossing many rows. This
  genuinely reads as Jay's sentence and is a real improvement over T2-6/main.
- **G2a, G5 (bare base/rim wedges):** confirmed unchanged bare triangular wedges, exactly as disclosed
  ("✗ not fixed", item 9/wedge pass not attempted). Honest.
- **G3 (cone right edge below apex):** the crop shows a short near-perpendicular tick joining the
  silhouette near the top, smaller and less severe than proto6's described horizontal bar but still a
  visible residual join. Matches the "◐ partly — reduced, not eliminated" call.
- **G1 (cone lit-flank gutters):** clean discrete bands with a thin even seam; a gap remains at the
  upper-right where the band doesn't reach the silhouette. Matches "◐ partly."
- **R1 (cone left edge, upper) and R4 (sphere left edge, upper):** these two are the closest thing to a
  REJECT-worthy picture in the set. Both show a substantially fused/thickened white mass running along a
  good stretch of the silhouette where multiple tick tips converge — more extensive than the "small
  thickened band, individual ticks still distinguishable" language in the impl report suggests on first
  read, though on closer inspection individual tick structure is visible further from the edge and this is
  not a literal *horizontal* line (it follows the curved limb). I read this as a genuine, disclosed partial
  ("◐"), not a misrepresented "✓" — the report never claims these are clean — but it is a softer call than
  the report's prose implies, and I'd flag it for Jay's own eye rather than call it settled either way.
- **R3, R5, R7, R8, R2:** consistent with the report's ✓/◐ calls; R3 has a small fused fragment at the
  corner exactly as described.

No spot is marked ✓ in the report that I found visibly failing on inspection (rule: "a spot marked ✓ on a
crop you did not look at is a REJECT" — I looked at all 15, and the ✓ spots R2/R5/R7/R8 are genuinely
clean). **This flag does not independently sink the unit**, but R1/R4 are worth a second look before
merge regardless of the T4/T2 outcome.

---

## 3. Retirements (O5, B4, wedge25, the five retired/updated mktick files)

Checked each against `## Bars changed` disclosure and diffed the retired file test-by-test:

- **O5 (`O5_BAR = 2.30`) → RETIRED.** Disclosed, quotes Jay's round-3 ruling verbatim ("BUILD proto6
  DIRECTION" / length read 0/12 on both proto3 and proto6). Correctly attributed; SP5 (T1) is a legitimate
  replacement and measured 12/12, exceeding its own 11/12 gate.
- **B4 spacingShare ≥ 0.60 → RETIRED.** Disclosed; never shipped in a test to begin with (plan-only bar),
  disclosed anyway per the standing rule. Fine.
- **`WEDGE_MEAN_BAR`/`WEDGE_CELL_CEILING` → monotone bar (T12).** Disclosed, quotes Jay's round-1 ruling.
  I did not independently re-derive the monotone bar's 3–5-inversions-per-cell noise-floor claim (it's a
  pre-existing, disclosed limitation of the raster instrument per the file's own header, not something
  T2-7 introduced) — accepted on the strength of that disclosure.
- **`scene3d-mktick-gap-fill.test.js` + helper → RETIRED.** Diffed the base-sha file
  (`git show 5eb81cfb:tests/unit/scene3d-mktick-gap-fill.test.js`) test-by-test: every test in it
  (`PRE_TICK_BLOCK` identity/golden, A1/A1b `bareRunP95`/`gradedGapShare`, the FLAT-comb and `nComb=1`
  mutation-kills, `A2loc`/`A3` area-conservation checks) measures quantities specific to T2-6's comb
  mechanism (`slot`/`vCenter`/`RHO`/`nComb`), which no longer exists in the shipped tree. **No coverage
  here still applies to a live code path** — this retirement is clean, not a hidden deletion. The
  functional intent it gated (fill black gaps, don't widen seams) is nominally carried forward by T1–T5/T7
  plus the picture checklist, though T10/T11 (`bareSeamFrac`/`limbGapFrac`) were never built as separate
  instruments, which the report discloses rather than hides.
- **`scene3d-mktick-band-purity.test.js`, `-banding.test.js`, `-runaway.test.js`, `-wedge.test.js`:** all
  four carry disclosed changes (hook-block retirement/replacement, `PRE_RANK1_BANDC` tightening,
  `MUTATION-KILL` population narrowing, `STAGGER_NEEDLE_SINGLE` replacement, 12 golden re-pins). I did not
  line-by-line diff every golden's replacement value against a from-scratch re-measurement — I spot-checked
  that the `## Bars changed` entries in `T2-7-impl.md` §7 and the commit body are consistent with each
  other and with what's visible in the live test file — but this is lower-stakes than §1 and I'm not
  flagging it as a separate reject ground given time.

**No silently-deleted coverage found.** This flag is clean.

---

## 4. Mutation-proof on the new BLOCKING bars

All five mutation tests in `scene3d-mktick-spacing-tone.test.js`'s "MUTATION PROOFS" block ran and passed
in my reproduction:

- **T1 (SP5):** reverting to a flat coverage (`c = 0.5*cMax`, spacing inert) — passed, SP5 collapses on the
  mutant relative to shipped.
- **T2/T3 (contact):** `MK_TICK_GAP_PEN = -0.9` (near-total overlap) — passed, `tipContact` rises.
- **T4 (B5 monotone):** pinning every tick to the bare plot floor — passed, `nonMono > 0` on the mutant.
- **T7 (over2RP):** lifting the 1-RP extent cap (both occurrences, `cap` and the `aP`/`aM` re-clamp) —
  passed.
- **B7 (d=220 HIDENS):** disabling the density-regime fallback — passed, coverage collapses on the mutant.

Every BLOCKING bar this file actually gates (T1/T2/T3/T4/T7/B7) has a mutation that trips it, and each
needle asserts its own count to guard against silent drift. **This flag is satisfied** — the mutation-proof
requirement is not in question here; the problem is that T2 and T4's *gate value itself* moved, which a
mutation test cannot catch (a mutation test proves the instrument is non-vacuous at whatever threshold is
coded, not that the threshold is the right one).

T6 (B8e)/T8 (H2 counts)/T9 (silhouette-overlap)/T10/T11 have **no instrument at all**, substituted by the
picture checklist — disclosed, not hidden, in both the report and the bar table (§2's "not built as
separate instruments" row). This is a real coverage gap against the plan's own §3 table but it is the kind
of honestly-disclosed reduced scope the protocol tolerates when named.

---

## 5. Non-regression

- **mkDashRamp / non-tick laws:** `scene3d-mkdashramp-{single-pass,discrete,low-end}.test.js` — I did not
  re-run all three (time), but spot-checked `single-pass` from my scratch export:

  Ran `npx vitest run tests/unit/scene3d-mkdashramp-single-pass.test.js` — **20/20 pass**, foreground,
  well under the timeout. Consistent with the report's 20/20/22/13 = 55/55 claim.
- **T3c-onset (`00e9bc7d`):** confirmed absent from this worktree
  (`git -C .claude/worktrees/fill-audit-b5 log --all --oneline | grep 00e9bc7d` → no match; the file
  `tests/unit/scene3d-mkdashramp-onset.test.js` does not exist in the archive). The report's disclosure
  ("lives on `fill-audit-a5`, not yet merged, could not be run") is accurate and appropriately flagged as
  an open follow-up rather than silently skipped.
- **O3 regression (`scene3d-mark-laws-draw.test.js`), disclosed out-of-scope:** the report states
  `refuseFrac` moves 0.05 → 0.067 at `sphere/hatch d=1` due to the new 40° chord-direction refusal (H2),
  and that this file's ALLOWED scope for this unit is O1 only. I did not reproduce this number myself (it
  requires the base-sha `5eb81cfb` tree, which I have exported but did not run against this specific test)
  — but the causal story (a new tick-only direction refusal at extreme sparse density moving a ratio
  computed over a handful of total marks) is plausible on its face and is consistent with H2 being
  tick-only per the file's own structural gate. I accept this as genuinely out-of-scope rather than caused
  by scope creep, on the strength of the mechanism explanation, without independently re-deriving the
  0.067 number.
- **T13 roster sweep:** the plan's own §6/Amendment-4 §3 call for a 4×8×37 = 1184-cell sweep; the
  implementer ran a 111-cell smoke sweep (3 mappers × 37 laws, cone/create only) plus a structural
  isolation mutation-kill. This is disclosed as reduced coverage, not hidden. I did not re-run the full
  sweep myself (it's explicitly flagged by the plan's own prior units as a 300s+ cost on this shared
  machine) — accepted as disclosed-and-reasoned, not independently re-verified.

---

## 6. CI-safety

Grepped every new/changed test and helper file for the six forbidden patterns (git history reads,
`child_process`, `/private/tmp`/`/Users/` absolute paths, skip conditions, `.only`/`.skip`):

```
grep -n "child_process|execFileSync|execSync|git show|git archive|/private/tmp|/Users/|skipIf|\.only\(|\.skip\(" \
  tests/unit/scene3d-mktick-spacing-tone.test.js tests/helpers/scene3d-mktick-spacing-tone.js \
  tests/unit/scene3d-mktick-{wedge,band-purity,banding,runaway}.test.js
```

Every hit is inside a comment/docstring referencing historical provenance (e.g. `scene3d-mktick-wedge.
test.js:280` explicitly comments on the *anti-pattern* it avoids; `-banding.test.js`/`-runaway.test.js`
reference a **prior unit's** (T2-3b) scratch-export provenance in comments, not live code in this diff).
No live `git show`/`child_process`/absolute-path/skip code in anything this unit touched. **Clean.**

---

## Summary for the orchestrator

| flag | finding |
|---|---|
| 1. Recalibrated bars | **REJECT.** T2 9/12 (plan 10/12) and T4 9/12 (plan ≥11/12, explicit "do not widen T4" STOP violated) shipped as the hard-coded test gate, not a disclosed RED. Physics (torus foreshortening) asserted, never attempted/shown; 1 of 3 T4 failures (`create/cone/hatch`) has no torus mechanism and no explanation at all. |
| 2. Pictures | Mostly holds up; whole-cell pictures are a genuine improvement and match Jay's words. R1/R4 fusion is more visible than the report's prose suggests but is honestly marked "◐", not "✓". Worth Jay's own look, not independently REJECT-worthy. |
| 3. Retirements | Clean — diffed the retired gap-fill file test-by-test, no coverage silently dropped, all disclosed with Jay's quotes. |
| 4. Mutation-proof | Satisfied for every bar the new file actually gates (T1/T2/T3/T4/T7/B7), reproduced myself. |
| 5. Non-regression | mkDashRamp spot-checked green (20/20); T3c-onset absence correctly disclosed; O3 regression plausibly explained, not independently re-derived; T13 reduced-sweep disclosed. |
| 6. CI-safety | Clean. |

**Recommendation:** send back to the implementer (or to Jay directly, since T4's fate is explicitly named
as his call in the plan's own C5/item-11 language) with two options, neither of which is "ship as-is": (a)
actually attempt the named fix candidate (screen-space `PMIN_T` via `fr.u`'s projected length) and
re-measure against the ORIGINAL 10/12 and 11/12 bars before touching the test thresholds, or (b) if Jay
accepts 9/12 on both as the real ceiling, that acceptance has to be an explicit ruling on the Decision Desk
(the same way O5/`wedge25`/B4 got one), not a unilateral test-threshold rewrite in the implementer's own
commit.
