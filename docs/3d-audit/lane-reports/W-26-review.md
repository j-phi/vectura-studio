STATUS: ACCEPT-WITH-FOLLOWUPS

# W-26 review — continuous ladder placement (the P0 user rule)

Lane fill-audit-a, worktree `.claude/worktrees/fill-audit-a`, branch `3d-scene/fill-audit-a`.
Range reviewed: `9fa159f0` (base, W-01 M1, reviewed ACCEPT) → `3c88605f` (final, on top of
unrewritten WIP checkpoints `f5e22359` + `4ea8caed`). Reviewed read-only: no edits, stash, or
commits made in the worktree. All numbers below were measured by ME, independently, in scratch
exports (`git archive 9fa159f0`/`3c88605f` into `/private/tmp/.../scratchpad/{before,after}`,
`node_modules` symlinked from main) — not copied from the implementer's reports except where
explicitly marked "per report."

Orchestrator's mid-review ruling was addressed (§ "Orchestrator ruling", below) before finalizing
this verdict.

## Checklist (plan-W26-W27.md, 13 items)

**1 — Uniform-field lemma asserted, not assumed.** Confirmed. The new test file
(`tests/unit/scene3d-ladder-uniform-field-spacing.test.js`) proves it analytically: it evaluates
`chartFor('cone'|'cylinder', …)` directly, computes the surface normal via finite differences,
runs it through `Regions.combinedIntensity`, and asserts ring-mean intensity max−min `< 1e-3`
across 5 along-axis samples — this is a derivation from the chart function itself (citing
charts.js:154-164), not an assumption. I re-ran this describe block standalone: passes.

**2 — Step-0 coverage dump: confirm or correct the plan's inferred 0.75/0.80.** The addendum's own
first task was executed by implementer 1 (`W-26-impl-1-handoff.md`, "Step 0"): dumped real
per-ruling `cov` at the shipped ladder `[0.2,0.5,0.85]`, Density 50 — cone+contour **0.6212**
identical across all 52 rulings; cylinder+contour a **0.7043** plateau (~37 rulings) then 0.5;
capsule+contour 0.85 (6, polar cap) → descending → 0.7043 plateau (barrel) → 0.5 tail. This
**corrects** the plan's inferred 0.75/0.80 (the real numbers are 0.62/0.70) while confirming the
mechanism (constant coverage on a near-uniform field → Sturmian 1/2 alternation). I did not
re-derive these exact cov numbers myself (would require instrumenting `coverageForSample` inside
a live build), but they are internally consistent with everything I did independently verify (the
measured RED ratios below, and the uniform-field lemma in item 1), and the addendum explicitly
credits this as the mechanism-confirming, not mechanism-changing, correction it is.

**3 — Vacuous-pass guards + screenshot.** Not vacuous. I independently reproduced RED at `9fa159f0`
and GREEN at `3c88605f` (below), and ran a **mutation test** neither implementer report performed:
in a scratch copy of the `after` tree I forced `isEvenLadder()` to return `false` unconditionally
(reverting only the routing gate, nothing else) and reran the new test file —
**4/9 fail, exact same numbers as the true RED** (cone+contour 2.0525, cylinder+contour 2.0000,
capsule-barrel 2.0000, cone+spiral 77.167). The fix is load-bearing, not a vacuous pass. I also
looked at the screenshots directly (§9).

**4 — No weakened metric / fingerprint without proof.** Checked every guard diff
(`git diff 9fa159f0 3c88605f -- tests/unit/<file>`) by hand. Every numeric re-pin carries the old
value, the new value, and a mechanism argument in the same commit — none are bare number swaps.
One genuine **tolerance widening**, disclosed and proven, not hidden: `scene3d-plot-safety.test.js`
`q(0.5)` bar loosened `< 0.30` → `< 0.35` (measured 0.3425); the comment also prints `q(0)=0.001`
and `q(0.98)=0.923`, i.e. the spread is preserved (still near-bare at the light end, still floods
at the dark end) — only the median moved, which is the direct, expected consequence of no longer
dropping half the kept rulings on a near-uniform field. Legitimate, but flagged for the record
since it is the one place a bar, not just a fingerprint, moved.

**5 — W-26 must not touch `surface-fill.js:5084-5157` (W-01 master grid).** Confirmed by diffing
hunk-by-hunk: the 9 diff hunks land at base-file lines ~4512, 4660, 7809, 7842, 9240, 9344, 10287,
10375, 10505 — none inside 5084-5157. Also confirmed `coverageForSample` (:1582), `zoneCoverage`
(:4797), `ladderStep` (:1272), `ladderKeep` (:1302), `spanDrops` (:7151) are untouched by line
number. `ladderCov()` (new) explicitly *calls* `coverageForSample`/`fineLadderCov`/`nestedCov` —
it does not reimplement them.

**6 — Tone transfer unchanged (same `coverageForSample`/`zoneCoverage`).** Confirmed: `ladderCov`
is byte-for-byte a wrapper around the pre-existing coverage functions (`fineLadderCov`, `nestedCov`,
`coverageForSample`), plus the same O6 lit-band floor `litSpanFloor` already charged — scoped
correctly to the lit band only (see the file's own comment on why a blanket clamp reproduces F-01).
`algoCoverage`'s `zone ? zoneCoverage : coverageForSample` branch for `ladder` is retired only
because `zone` is provably always null (`HL_STAGE.toneZones: false`) — a documented, checked
no-op, not a silent behavior change.

**7 — Spiral: turn dropped vs. pitch warped — is the 8.5/17.0 alternation gone?** Yes, both by
measurement and by eye. RED: cone+spiral turn-advance ratio **77.167** (far worse than the
addendum's guessed ~2.0 — a whole-turn drop can collapse a whole run of consecutive turns, not
just alternate 1×/2×). GREEN: **1.05**. I looked directly at
`shots/A/capsule__spiral__ladder__med__a.webp` (before) vs.
`after/W-26/shots/A/capsule__spiral__ladder__med__a.webp` (after) myself — see §9: the before image
is visibly 40+ chaotically bunched turns, worst near the caps; the after image is ~18 cleanly,
evenly spaced turns the length of the barrel. The mechanism is the turn-density-integration +
inverted-lookup placement in the diff (surface-fill.js, spiral mapper's `isEvenLadder() &&
!symmetric` branch) — turns are never dropped, only re-placed.

**8 — Coverage oracle check (handoff finding 2).** Same as item 2 — confirmed done, numbers
corrected from the plan's inferred 0.75/0.80 to the measured 0.6212/0.7043.

**9 — W-27 fitter gate untouched.** N/A to this unit (W-27 is a separate brief/lane,
fill-audit-d) — confirmed the diff never touches `geometry-utils.js`'s `acceptable()` or any
`fitPathAnchors` code; W-26's Touch list never reaches it either.

**10 — Ring more accurate, not just smoother.** N/A in the literal W-27 sense (this unit does not
touch `buildSliceSegments`/ring resampling). The analogous claim for W-26 — "placement moves, tone
target does not" — is what item 6 verifies.

**11 — Evidence: one pipeline, one zoom, 3.6 object-only.** Confirmed: all re-shoots used
`scripts/audit/scene3d-capture.js --tier A|B --root <worktree> --port 8475`, the standard audit
harness, consistent camera/zoom with every other lane's evidence. `appVersion` in the manifest
reads the worktree's own `package.json` version (per the implementer's report) — I did not
re-verify the live dev server myself (out of scope for a read-only review), but the captured PNGs
are internally consistent with the vitest-measured geometry (§9 confirms this visually).

**12 — Settled items untouched (tone 39.4%, coverage contract, spiral default).** Confirmed via
the full guard sweep: I ran `scene3d-fill-even-spacing`, `scene3d-fill-span-verdict`,
`scene3d-fill-boundary-ends`, `scene3d-fill-seam-continuity` myself on the `after` tree — **4 files,
63/63 pass**. Plus the untouched-law check in §10 of this document (nibAngle/mkDotScreen
byte-identical). No settled invariant moved.

**13 — Did the new test measure drawn spacing, or index gaps again?** Read
`scene3d-ladder-uniform-field-spacing.test.js`'s `repsFor`/`gapsOf` directly: it groups emitted
RUN geometry by `lineIndex`, takes each ruling's screen-space **centroid**, and measures the
**Euclidean distance between centroids of spatially adjacent kept rulings** — this is drawn,
projected (mm) spacing, not an index-gap proxy. Confirmed the companion fix to
`scene3d-fill-even-spacing.test.js` for the identical reason: its own header comment names the
exact blind spot the addendum warned about (continuous placement makes `lineIndex` a gapless
ordinal, so the OLD "kept-index gap" oracle is vacuously true) and replaces `keptByFamily` with
`repsByFamily`/`drawnGapsOf` — the same drawn-centroid-distance measurement, independently
implemented in a second test file. Both files agree; neither is measuring index gaps.

## RED/GREEN, reproduced independently

Scratch export of `9fa159f0`, `scene3d-ladder-uniform-field-spacing.test.js` overlaid, run cold:

```
Test Files  1 failed (1)
     Tests  4 failed | 5 passed (9)
cone+contour R1a ratio:        2.052453945360482   (bar 1.15)
cylinder+contour R1a ratio:    2.000000000000035   (bar 1.15)
capsule-barrel R1a ratio:      2.000000000000026   (bar 1.15)
cone+spiral turn-advance:      77.1673288814952    (bar 1.15)
```

Exact match to both implementer reports. GREEN at `3c88605f`: **9/9 pass**. Mutation test (forcing
`isEvenLadder()` → `false` in an `after`-tree scratch copy): **4/9 fail, identical numbers to RED**
— confirms the fix, not the test, is what's moving the numbers.

## Orchestrator ruling — addressed

The orchestrator required, before ACCEPT: (a) sphere R1c gap ratio ≥ 2 AND lit/shadow ink ordering
preserved on sphere and capsule; (b) each cell's ink delta explained by ruling-COUNT change (or,
for spiral, by removal of the 77× turn-advance defect) — not a global pitch change; before/after
ruling counts and mean pitch per cell.

I built an **independent measurement rig** (own script, own camera/bounds, deliberately different
from both the implementer's capture-script fixture and the unit test's fixture, to avoid
rubber-stamping the same numbers twice), wrapped `SF.buildObject` the same way the unit tests do,
and ran it against both scratch trees.

**(a) R1c, sphere+hatch** (my rig): before ratio **21.20**, after ratio **19.91** — both far above
the ≥2 bar, comparable magnitude, tone not flattened. Ordering: `gapCorrWithIndex` (Pearson corr.
of drawn gap vs. placement order) before **−0.65**, after **−0.50** — same sign (gap shrinks as
placement index rises in both), comparable strength. Tone gradient direction is preserved, not
flattened or inverted.

**(a) capsule.** The uniform-field lemma (item 1) already establishes the capsule BARREL is a
near-uniform field along its axis (no real light gradient to preserve or flatten there) — the only
place a genuine gradient exists on a capsule is the polar caps, which the R1a test explicitly
excludes as a different chart region. My own capsule ordering signal (`gapCorrWithIndex`: contour
+0.16 before → −0.22 after) is weak and sign-flips, but this is consistent with measuring noise in
a field the lemma predicts is near-flat along that axis in the first place, not with tone loss —
there was no strong ordering to preserve. I flag this as a genuine gap in verification (a stronger
capsule-cap-specific gradient check would be better evidence either way) rather than treating the
sign flip as either a pass or a violation.

**(b) mechanism, my own rig (capsule 10×60×10, Density 50, med):**

| cell | rulings/paths before→after | mean pitch before→after | ink before→after | Δink% |
|---|---|---|---|---|
| capsule+contour | 44→48 | 2.38→2.19mm (tighter) | 1043.2→1146.5 | +9.9% |
| capsule+hatch | 21→25 (nRulings, A-family) | 3.82→3.48mm (tighter) | 1243.2→1476.0 | +18.7% |
| capsule+crosshatch | 67→90 (pathCount) | n/a¹ | 2194.8→2948.2 | +34.3% |
| capsule+spiral | 78→57 (runs/turns) | n/a | 1503.4→1331.1 | **−11.5%** |
| cone+contour | 32→42 | 2.36→1.89mm (tighter) | 1322.5→1644.2 | +24.3% |
| cylinder+contour | 32→40 | 2.40→1.92mm (tighter) | 1703.5→2158.5 | +26.7% |

¹ crosshatch's "A-family-only" pitch metric is unreliable (crosshatch has two overlapping
families; my quick script only tracks one) — pathCount is the trustworthy number there.

Every cell: **ruling/path COUNT rose, mean pitch TIGHTENED (did not loosen)**, and ink rose roughly
in proportion to count — i.e. ink increases are driven by previously-dropped rulings now being
placed, not by a global pitch/density parameter inflation. Capsule+spiral is the one decrease,
driven by a **27% drop in turn count** (78→57), matching the report's claim that removing the 77×
turn-advance defect removes previously-redundant, over-clustered turns. This is the SAME
qualitative pattern the implementer's own capture-script numbers show (e.g. capsule+crosshatch
+35.7% there vs. my independently-measured +34.3% on a differently-shaped rig — good
corroboration), even though absolute mm differ because the rigs differ. **(a) and (b) both hold**
(with the capsule-cap caveat above), so per the orchestrator's own stated rule this is an ACCEPT,
not a REJECT.

**Side flag — capsule density response, is it monotone?** Confirmed **yes**, in every rig I tried.
My own capsule-shape rig (10×60×10) and the actual gallery capsule shape (14×16×14, from
`params.js:143`) both show strictly increasing `pathCount`/`inkMm` at d=1/10/25/50/100 on the
`after` tree, all four mappers. I could **not** reproduce the specific claimed pre-existing
"Density-1==Density-50 byte-identical tie" using either synthetic rig — both were already
non-flat, non-tied on the `before` tree in my harness. However, direct visual inspection of the
real gallery cells settles it more convincingly than my synthetic rig: `shots/A/capsule__contour__
ladder__low__a.webp` (before) shows a ring COUNT indistinguishable in density from the med tier,
while `after/W-26/shots/A/capsule__contour__ladder__low__a.webp` shows a visibly, dramatically
sparser ring count than its own med tier — see §9. The claimed defect is real and this fix
incidentally resolves it, monotonically, matching the ledger's flag #3 and the orchestrator's ask.

## LEDGER "Secretary flags" — addressed

1. **±15% stop condition breach** — addressed above (orchestrator ruling): ACCEPT, not REJECT,
   because (a) and (b) both hold.
2. **R1c not reported by the implementer** — now measured, by me, independently (above): sphere
   ratio 19.91-21.20, ordering preserved.
3. **Capsule density-tie side effect** — confirmed a genuine, monotone improvement (above), not an
   uncontrolled second change; visually striking in the real gallery cells.
4. **`angleFamily`'s `steps * len` fillFidelity coupling, left untouched** — confirmed genuinely
   out of scope (no test exercises it, disclosed as a followup); acceptable to defer.

## F1 (torus ribbon white bands) — stated plainly

**Confirmed unchanged by this unit.** All 10 named `torus__hatch__{5 ribbon laws}__{med,max}__a`
cells are byte-for-byte md5-identical before/after — I re-verified this myself directly (not
trusting the report):
```
571386828deec7fafcccae189b6d3ce5  (cone__contour__ampSpacing__med__a, both)
50f2997b7c4f85dc3249a9d0ba96920d  (cone__contour__amplitudeOnly__med__a, both)
80468ccd34614f151a5e99402ec28ede  (torus__hatch__interlockWeave__med__a, both)
```
Structurally correct: the ribbon/`WV_*` placement mechanism these laws use is a different code
path from `isEvenLadder()`'s `TONE_ALGO` gate, and W-26's allowed Touch ranges never reach it.
Looked at `torus__hatch__interlockWeave__med__a.webp` directly (§9): the thin white band between
the zigzag weave and the outer rings the judge described is still visibly present, unchanged.
**Ownership of closing F1 is the orchestrator's problem, not this unit's** — it needs a unit that
touches `WV_*` ribbon-stretch spacing directly, out of this brief's Touch list.

## §9 — Evidence, looked at directly

- `shots/B/cone__contour__ladder__med__a.webp` (before) vs. `after/W-26/…` (after): before shows
  unmistakable **paired-ring banding** (rings clustered in close pairs with a visibly wider gap
  between pairs, running the whole cone); after shows **perfectly even** ring spacing top to
  bottom, no pairing anywhere. Exactly the R1a defect and its fix, visible to the eye at the exact
  magnitude measured (2.05× → ≤1.15×).
- `shots/A/capsule__spiral__ladder__med__a.webp` (before) vs. `after/W-26/…`: before is a dense,
  chaotic mass of 40+ unevenly bunched turns, worst near the caps; after is ~18 cleanly, evenly
  wound turns. Matches the 77.17× → 1.05× fix.
- `shots/A/capsule__contour__ladder__low__a.webp` (before) vs. `after/W-26/…`: before shows a ring
  density at "low" that reads almost identical to "med" (the pre-existing density-tie defect,
  visible directly); after shows a dramatically sparser ring count at "low" than at "med" — density
  now visibly responsive.
- `after/W-26/shots/B/torus__hatch__interlockWeave__med__a.webp`: the thin white band between the
  dense zigzag weave and the outer concentric rings (F1) is visible, unchanged from before
  (confirmed md5-identical).
- Control cells `cone__contour__ampSpacing__med__a` / `…amplitudeOnly__med__a`: md5-identical
  before/after, confirming laws outside the ladder family are untouched.

## Verdict: ACCEPT-WITH-FOLLOWUPS

The mechanism is correct, well-scoped (item 5 confirmed by line-number diff, not just claim), the
tone-target-unchanged claim holds (item 6), the RED/GREEN proof reproduces exactly under
independent measurement including a mutation test neither report ran, the drawn-spacing oracle is
real (item 13), evidence was looked at directly and matches the numbers, and the orchestrator's own
stop/go rule on the ±15% ink deltas is satisfied by measurement in a THIRD, independent rig. F1 is
honestly stated as unchanged and correctly out of scope.

Not a clean ACCEPT because:
1. **CHANGELOG line missing** — the orchestrator's stated ACCEPT condition ("deltas recorded as
   intentional and a CHANGELOG line") is not yet met; `CHANGELOG.md` is untouched in this commit
   range. Required before this unit is considered closed.
2. **Capsule cap-region tone-ordering evidence is weak** (see orchestrator-ruling section) — not a
   violation, but a real verification gap; a dedicated capsule-cap gradient check would strengthen
   this rather than relying on the barrel's (correctly) near-zero signal.
3. Disclosed, argued, not blocking: the contour ink-ramp bar in `scene3d-fill-span-verdict.test.js`
   moved from 1.8 to 1.3 (pole-sampling-resolution side effect of continuous placement, a real
   trade-off the implementer tried and reverted a narrower fix for); `scene3d-plot-safety`'s
   `q(0.5)` bar loosened 0.30→0.35 (proven, spread preserved); `angleFamily`'s pre-existing
   `fillFidelity` coupling left untouched; F1 stays open, ownership punted to the orchestrator.
4. Judge pass (Opus, per the ledger) should specifically re-examine the contour ink-ramp bar
   loosening (1.8→1.3) and the capsule-cap gradient gap named above — these are the two places
   this review found real uncertainty rather than a clean pass/fail.
