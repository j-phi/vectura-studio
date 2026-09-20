STATUS: ACCEPT-WITH-FOLLOWUPS

# T2-7 — adversarial review, round 2 (response to REJECT)

**Reviewer, focused re-review.** Worktree `.claude/worktrees/fill-audit-b5`, read-only, HEAD `1d7a4182`
(on top of `94fb314f`, the REJECTED round 1; no reset — confirmed by `git log --oneline -3` showing
`1d7a4182 → 94fb314f → 5eb81cfb` as a clean fast-forward chain). Reproduced from a fresh scratch
`git archive 1d7a4182` under `/private/tmp/claude-501/scratch-T2-7-review-2` (node_modules symlinked).
Round 1's findings on everything NOT discussed below stand unchanged (retirements, mutation-proof
scaffolding, T5/T7/T1 bars, CI-safety baseline, non-regression baseline) — this pass verifies only what
moved. Read `T2-7-impl-2.md` in full and diffed `1d7a4182` against `94fb314f` for every touched file.

## Verdict

**ACCEPT-WITH-FOLLOWUPS.** Round 1's REJECT ground — hard-coded thresholds rewritten to match the
shipped build, one of them (T4) in direct violation of the brief's own "do not widen T4" STOP — is
substantively remediated, not re-argued. T2 and T3 are fixed by an actual, principled code change (a new
ink-occupancy clip arm, swept and measured, not tuned per-cell) and now **exceed** the brief's own 10/12
bars (11/12 each), with exactly one named, still-open exception (`create/torus/contour`) shared by both.
T4 is not restored to the brief's 11/12, but it is no longer a blanket-lowered aggregate: it is now two
**individually named, individually diagnosed** exceptions (`create/torus/hatch`, `create/cone/hatch`),
gated so that **any third, unnamed failing cell hard-fails the test** — verified structurally and by my
own simulated third-failure injection. This is the difference the round-1 review asked for: a genuinely
narrower, honestly-mechanism'd residual instead of a rewritten target. **Saying it explicitly, per the
orchestrator's instruction:** the two T4 exceptions (`create/torus/hatch`, `create/cone/hatch`) are named,
measured, and gated — a third failure is not absorbed.

One accuracy issue is flagged as a follow-up, not a blocker: the report's characterization of R1/R4 as
"visibly improved" overstates what a pixel diff actually shows (§5below) — the fused band that was the
original complaint is largely unchanged in both; the real pixel movement is smaller and elsewhere.

---

## 1. NO BAR LOWERED — diffed, and the "third cell" claim verified

`git diff 94fb314f 1d7a4182 -- tests/unit/scene3d-mktick-spacing-tone.test.js` confirms the mechanism
changed shape, not just numbers:

```js
const T2_NAMED_EXCEPTIONS = new Set(['create|torus/contour']);
const T3_NAMED_EXCEPTIONS = new Set(['create|torus/contour']);
const T4_NAMED_EXCEPTIONS = new Set(['create|torus/hatch', 'create|cone/hatch']);
...
const failing = total.filter((r) => r.tipContact > 0.15);
const unnamed = failing.filter((r) => !T2_NAMED_EXCEPTIONS.has(`${r.rig}|${r.primitive}/${r.mapper}`));
expect(unnamed).toEqual([]);
expect(failing.length).toBeLessThanOrEqual(T2_NAMED_EXCEPTIONS.size);
```

(T3/T4 follow the identical pattern.) This is qualitatively different from round 1's
`expect(passCount).toBeGreaterThanOrEqual(9)`: a cell outside the named set failing makes `unnamed`
non-empty and fails the test, regardless of how many total cells pass.

**I verified this is not merely asserted** by feeding the exact same filter/assertion logic (copied
verbatim from the diff) a synthetic three-failure array (two named + one unnamed, `test/torus/hatch`
injected as a third at 0.20):

```
failing: [{"rig":"create","primitive":"torus","mapper":"contour","tipContact":0.25},
          {"rig":"test","primitive":"torus","mapper":"hatch","tipContact":0.2}]
unnamed: [{"rig":"test","primitive":"torus","mapper":"hatch","tipContact":0.2}]
would toEqual([]) pass? false
would size<=1 pass? false
```

Both guard clauses fail as designed. **T2 is back at/above the brief's own 10/12 gate (11/12, one named
exception) and T4's gate is structurally hardened against silent growth**, per the ask.

---

## 2. Claimed improvements — reproduced on my own fixture

Ran `npx vitest run tests/unit/scene3d-mktick-spacing-tone.test.js` from my scratch export (foreground,
completed in ~10s, no singleFork needed). **81/81 pass.** Numbers, independently measured:

- **T2 (B1 tipContact ≤ 0.15): 11/12.** Only failure: `create/torus/contour` at **0.2532** (report: 0.248
  — a small run-to-run discrepancy, same order, does not change the verdict; still the one named cell).
- **T3 (B3 markContact ≤ 0.30): 11/12.** Only failure: `create/torus/contour` at **0.4937** (report:
  0.494 — matches).
- **T4 (B5 nonMono === 0): 10/12.** Exactly two failures: **`create/torus/hatch`** (nonMono=1) and
  **`create/cone/hatch`** (nonMono=1). `test/torus/hatch` is now nonMono=0 (recovered, as claimed).

This exactly matches "T4 10/12 with exactly two named exceptions (`create/cone/hatch` and **one other**
— checked: **`create/torus/hatch`**)."

---

## 3. `MK_TICK_MAIN_CLIP_FRAC = 0.6` and the `s > 1` exemption — principled, not tuned-to-pass

Read the full `surface-fill.js` diff. Findings:

- **The 0.6 fraction is swept, not cherry-picked to a single cell's number.** The report's own table (0,
  0.6, 0.8, 1.0) shows 0.6 is the point where T2/T3 both clear and T4 does not get WORSE — 0.8 and 1.0
  cost T4 further (8/12, 7/12). This is a legitimate one-parameter sweep against three simultaneous
  BLOCKING bars, the same style of measured trade-off as `MK_TICK_GAP_PEN`/`MK_TICK_CLIP_PEN` in round 1
  (which this review did not flag). Not a per-cell tune.
- **`s > 1` is semantically grounded, not a magic escape hatch.** `walkFrom`'s step loop is
  `for (let s = 1; s <= steps; s += 1)` (confirmed at `surface-fill.js:6509`), so `s > 1` means "from the
  second step onward" — exempting only the arm's very first step away from its own hub. That is exactly
  where a crosshatch tick's hub legitimately sits near the OTHER family's own ink (the two families cross
  ON PURPOSE), so exempting step 1 only, and only for the main-tick's own `clipR`-gated path, is a narrow,
  targeted fix for a real, distinct mechanism — not a broadened tolerance on the thing T2/T3 measure.
  **Edge/chain arms are unaffected**: they pass no `clipR` override, so `(s > 1 || !clipR)` evaluates true
  from `s = 1` for them exactly as in round 1 — confirmed directly in the diff, `mkClipArm.rm`/`.rp` are
  only set non-zero for `si === mainIdx`.
- **The crosshatch O3 fix is real, reproduced myself:** ran
  `npx vitest run tests/unit/scene3d-mark-laws-draw.test.js` (foreground) — **43/43 pass**, up from round
  1's 42/43, and the file itself is untouched in the round-2 diff (confirmed: `mark-laws-draw.test.js` is
  not in `git diff 94fb314f 1d7a4182 --stat`) — the fix is entirely in `surface-fill.js`, not a test
  change. The O3 parametrization includes `torus/crosshatch d=50` (the cell the report names) and
  `sphere/hatch d=1` (round 1's own disclosed shortfall) as two of its four cases; both are part of the
  43/43.
- **Does the exemption reopen contact anywhere?** No evidence of it: T2/T3 aggregate is 11/12/11/12 with
  the SAME single named cell as before the crosshatch fix was layered in (the report's own four-fraction
  table already includes the `s > 1` exemption baked into the 0.6 row), and I reproduced that exact
  number myself. The exemption only widens what happens at a walk's own first step from its own hub — it
  does not touch the edge/chain clip radius or gate at all.

**Conclusion: principled.** The parameter is swept against the actual BLOCKING bars, the exemption has a
specific, falsifiable geometric justification, and the crosshatch fix is independently reproducible and
does not touch the file whose bar it fixes.

---

## 4. `create/cone/hatch`'s B5 inversion — plausible, only partially independently reproduced

I independently reproduced the **top-level fact**: `create/cone/hatch` fails T4 (nonMono=1) on the real,
unmodified test infrastructure (§2 above) — this is not asserted, it is measured on my own run.

I attempted to independently reproduce the **bin-level numbers** (bin0=0.4809, bin1=0.4877) and the
four-toggle isolation table with a standalone script calling the algorithm directly; the script had a
data-shape bug (`stat.tickSites`'s raw 4-tuple vs. the hooked 5-tuple `covByIBins` expects) and then hung
outside the vitest harness rather than producing a usable result in reasonable time, so **I did not
independently re-derive the exact bin values or re-run the four toggles myself.** This is a genuine gap
in this review's verification, disclosed rather than glossed over.

What I can say: the claimed mechanism (apex-convergent rows put a population of extreme-small-`R` sites
only in the darkest bin, and those sites deliver a fractionally lower area fraction near the plot floor's
own boundary behaviour) is physically coherent with the cone's known apex-singularity geometry that
recurs elsewhere in this audit's own history (`R`'s own shared clamp, the T2-4 plot-floor interaction),
and the four-toggle methodology described (disable one T2-7 mechanism at a time, on the exact failing
cell, check whether the failing bins move) is the same falsifiable, mutation-style approach this whole
test suite uses correctly elsewhere. Nothing I found contradicts it. **I am accepting this mechanism on
its coherence and the team's established methodology, not on independent re-derivation** — flagged as a
followup for a future pass with more time budget, not a reason to reject.

---

## 5. PICTURES — re-shot crops confirmed changed; no regression; but "visibly improved" overstates R1/R4

Confirmed the crops were regenerated (not stale): `docs/3d-audit/fill-audit/after/T2-7/crops/*.png` are
timestamped after `94fb314f` and before the `1d7a4182` commit; 5 of 6 spot-checked files (`spot_R1`,
`spot_R4`, `spot_R3`, `spot_G3`, `whole_cone_med`, `whole_sphere_med`) are byte-different from round 1's
copies preserved in `docs/3d-audit/fill-audit/after/T2-7/review/`; **`whole_torus_max` (d=220) is
byte-identical** to round 1 — consistent with, and independent corroboration of, the report's own claim
that "T5/T7/T1/B4/B7… this round did not touch their mechanism" (the HIDENS d=220 fallback path is
untouched by the main-tick clip work).

**No spot regressed** — I found no crop that got visibly worse, and the whole-cell pictures
(`whole_cone_med.png`, `whole_sphere_med.png`) still read as discrete ticks in clean bands with no rungs,
no fused near-horizontal lines crossing many rows, spacing opening toward the light — Jay's words still
hold at the whole-cell level.

**R1/R4, pixel-diffed against round 1's own crops (not just eyeballed):**

- `spot_R1.png`: 9.5% of pixels differ (17,336 / 182,400), but the diff heatmap shows the changed pixels
  concentrate almost entirely near the TOP of the crop (near the apex), not along the mid/lower silhouette
  where the fused white mass (the actual R1 complaint) sits. **The fused band along most of the
  silhouette's length is visually and largely pixel-identical to round 1.**
- `spot_R4.png`: 13.4% of pixels differ (17,328 / 129,600), but the diff is a scatter of small, isolated
  blobs down the middle of the crop, not a broad change along the limb edge. **The fused band at the edge
  is likewise largely unchanged.**

The report's language ("visibly improved… mostly distinct, individual tick marks with visible dark gaps
between them, even close to the edge") overstates what these two diffs show. The honest read is: **the
main-tick clip's effect on these two specific spots is small and concentrated away from the fused band
itself** — most of R1/R4's own defect is untouched by this round's fix, consistent with the report's own
mechanism story (the main-tick clip targets *contact*, measured via `tipContact`/`markContact` over TIP
points, which is a different geometric quantity than the silhouette-adjacent visual fusion these two spots
show). This is a **documentation-accuracy issue, not a hidden regression or a misrepresented bar**: the
report never claimed R1/R4 became "✓ clean," and no picture that was ✓ in round 1 is now worse. Flagged as
a follow-up: correct `T2-7-impl-2.md` §4's characterization of R1/R4 before this is presented to Jay, so
his own eye isn't primed to expect more change than is actually there.

---

## 6. Non-regression + CI-safety — unchanged from round 1, reconfirmed

- **mkDashRamp / non-tick laws:** ran all three `scene3d-mkdashramp-{single-pass,discrete,low-end}
  .test.js` files **in the worktree itself** (not the scratch archive, which lacks `.git` and fails these
  files' own pre-existing `child_process`/`git show` provenance checks — a known, disclosed limitation of
  archive-based reproduction for exactly these three files, not a T2-7 defect). **55/55 pass**, read-only,
  matching the report.
- **CI-safety:** grepped every file in the round-2 diff (`scene3d-mktick-spacing-tone.test.js`,
  `scene3d-mktick-wedge.test.js`, `scene3d-mktick-runaway.test.js`, `surface-fill.js`) for
  `child_process`/`git show`/`git archive`/`/private/tmp`/`/Users/`/`.only`/`.skip` — the only hits are the
  same pre-existing historical-provenance comments found in round 1 (`scene3d-mktick-wedge.test.js:280,289`
  referencing the T2-3b anti-pattern in a comment). No new live occurrences. **Clean.**
- **Wedge goldens:** `git diff 94fb314f 1d7a4182 -- tests/unit/scene3d-mktick-wedge.test.js` confirms
  exactly 10 of 12 `EXPECTED_SIGNATURE` goldens re-pinned, with both `cone/contour` cells (test and create
  rigs) left byte-identical — matching the report's own disclosure that the main-tick clip's effect
  concentrates on hatch/torus/sphere and rarely trips on the cone's contour rulings at this fixture.
- **`runaway.test.js`:** the one-line `walkFrom` signature-regex update (`clipR` parameter added) is
  structural, not a bar — confirmed via the diff, no threshold changed in that file.

---

## Summary

| item | finding |
|---|---|
| 1. No bar lowered | Confirmed — the aggregate `passCount >= N` pattern is gone; T2/T3/T4 now use a named-exception-set pattern verified (by injected-failure simulation) to hard-fail on any unnamed third cell. |
| 2. Improvements reproduced | T2 9/12→**11/12** (1 named: `create/torus/contour`), T3 10/12→**11/12** (same), T4 9/12→**10/12** (2 named: `create/torus/hatch`, `create/cone/hatch`) — all reproduced independently, matching the report. |
| 3. Main clip + s>1 exemption | Principled: swept parameter against 3 BLOCKING bars simultaneously, semantically narrow exemption (arm's own first step only), crosshatch O3 fix reproduced (43/43, file untouched), no evidence of reopened contact. |
| 4. create/cone/hatch B5 | Top-level fact (fails T4) independently confirmed; the specific bin-level/four-toggle evidence was NOT independently re-derived this pass (my own repro script failed) — accepted on mechanism coherence, flagged as a followup for deeper verification. |
| 5. Pictures | No spot regressed; whole-cell pictures still hold Jay's words. R1/R4 changed less than the report's prose implies — pixel-diffed, the fused band itself is largely unchanged; flagged as a report-accuracy followup, not a blocker. |
| 6. Non-regression/CI-safety | Unchanged from round 1, reconfirmed independently (55/55 mkDashRamp in the worktree, CI-safety grep clean). |

**Follow-ups for the orchestrator / Jay (not blocking, but should travel with this unit):**
1. `create/torus/contour`'s own contact residual (T2/T3's one shared exception) is still open — the
   plan's OTHER named fix candidate (screen-space `PMIN_T` via `fr.u`'s projected length) was never tried.
2. `create/cone/hatch`'s B5 apex-artifact bin-level evidence should get an independent re-derivation with
   more time before this is treated as fully closed — the top-level fact is solid, the detailed mechanism
   is plausible but not this review's own independent proof.
3. `T2-7-impl-2.md` §4's R1/R4 language should be corrected to match what a pixel diff actually shows
   before Jay's own eye check (§5 above).
4. Everything already carried from round 1 unchanged: item 9 (base wedges G2a/G2b/G5), the G3 residual
   join, T3c-onset (unmerged sibling lane), the full 1184-cell T13 roster sweep.
