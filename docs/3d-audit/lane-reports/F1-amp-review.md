STATUS: ACCEPT-WITH-FOLLOWUPS

# F1-amp — adversarial review

**Lane:** fill-audit-a3 · **Worktree:** `.claude/worktrees/fill-audit-a3` (READ-ONLY; no edits, stashes, checkouts or resets made)
**Pinned range:** `6e1ed52f..3bc61c32` (one commit, `src/core/scene3d/surface-fill.js` +74/−3, `tests/unit/scene3d-ribbon-f1-amp.test.js` +356, confirmed via `git show --stat`)
**Method:** `git archive` scratch exports at `/private/tmp/claude-501/scratch-F1A/{pre,post,post2,post3}` (post2 is a clean re-export used after a worktree collision was discovered, see condition 9/process note), `node_modules` symlinked from MAIN, Node v20.20.2. All vitest runs foreground, `timeout: 600000`, one file per command. No test or capture was ever run in MAIN.

## Process note — live worktree collision detected (not F1-amp's fault, but material to trust in my numbers)

`git -C .claude/worktrees/fill-audit-a3 status` showed the worktree **dirty**, HEAD `3bc61c32` with an **uncommitted** diff to `surface-fill.js` (a `T2-2`/`mkTick` mark-language change, unrelated to `wvAmpAsk`/`wvRamp`/`waveStat`) — a different, live workstream is editing this lane's worktree concurrently, in violation of "one active workstream per worktree." My two earliest test runs (`scene3d-ribbon-f1-amp.test.js`, `scene3d-ribbon-f1b-streaks.test.js`) were run against that dirty tree before I noticed. I re-ran both against a clean `git archive 3bc61c32` re-export (`post2`, md5-verified to equal `git show 3bc61c32:...`) and got **identical results** (47/47, 44/44) — the concurrent edit doesn't touch F1-amp's code path, so it did not contaminate these numbers, but every guard number quoted below is from the clean scratch exports or from single-file worktree runs whose only touched file (`surface-fill.js`) I independently confirmed is scoped away from the dirty region. **Flag for the orchestrator: fill-audit-a3 has a live collision right now** (`3d-scene/fill-audit-a3` at `3bc61c32` + uncommitted T2-2 WIP) — outside this review's scope to fix, but it should be checkpointed before anyone else touches that worktree.

## Condition 1 — RED/GREEN, the oracle, mutation-kill (BLOCKING) — ACCEPT

- **New file re-derived RED→GREEN on this tree, independently confirmed 47/47** in both the live worktree and a clean `git archive 3bc61c32` export (`post2`), 44–45s each run. Matches the claimed 47/47 exactly.
- **What the oracle measures:** `wave.hiShareMean` = mean amplitude **as a share of the drawn pitch**, gated at exactly `I >= WV_I0` (0.62) — i.e. **amplitude relative to line spacing**, not raw drawn width and not ink directly. `wave.hiElongMean` = mean **elongation** (ink-per-unit-arc, i.e. how much longer the wavy path is than a straight one) — the actual **ink/coverage proxy**. Both are correctly described in the report.
- **Which half of F1 it gates:** the **texture/amplitude half** — whether the ruling still waves inside the `I >= 0.62` highlight band. It does **not** gate placement/spacing (F1-placement's job) or erosion-fallback centrelining (F1-erode's job); confirmed by the diff touching only `wvAmpAsk`/`wvRamp`'s call site and the `waveStat` init/report object, nothing in `wvPlaceCov`, `ribbonizeCore`, or `erode()`.
- **Mutation-prove, independently, in my OWN scratch copy of post (not the implementer's in-file patch mechanism):** I hand-reverted the 5 `wvAmpAsk` floor lines back to `return k * <const>;` in `/private/tmp/claude-501/scratch-F1A/post` and separately flipped the same `TONE_UNCAPPED` diagnostic-exposure ternary, then built torus/hatch for the four subject laws directly. Result: `interlockWeave hiShareMean=0 hiElongMean=1`, `trochoidLoop hiShareMean=0 hiElongMean=1`, `amplitudeOnly hiShareMean=0 hiElongMean=1` (onePenDown build was in the same batch and consistent with the other three; the underlying arithmetic — `k=0` for `I>=WV_I0` times any constant is exactly 0 — is invariant across all four by construction). **The bar is real: removing the floor collapses the oracle to exactly the pre-fix reading, not close-to-it.** This is a genuine, independently-reproduced mutation kill, done via a different mechanism than the implementer's own text-patch, which is a stronger proof than re-running their harness.
- **RED reproduced against the true pre-fix baseline** (not just the in-file wiring revert): `scene3d-ribbon-f1b-streaks.test.js` at `git archive 6e1ed52f` gives **42/44 exactly** (trochoidLoop's two named reds, with the exact filed numbers — see condition 2). This corroborates that `6e1ed52f` genuinely predates the fix.

**Verdict: ACCEPT.** The oracle is well-targeted, correctly described, and the floor-removal mutation genuinely kills it.

## Condition 2 — Borrowed green / scope (F1-trochoid's two reds) — ACCEPT-WITH-FOLLOWUPS

(a) **Code scope:** confirmed via `git diff 6e1ed52f..3bc61c32 -- src/core/scene3d/surface-fill.js` — `trochoidLoop`'s only touched line is its own branch inside `wvAmpAsk` (`WV_TROCH_AFLOOR_SHARE + (WV_TROCH_AMAX - WV_TROCH_AFLOOR_SHARE) * k`). This is squarely inside F1-amp's granted scope (`wvAmpAsk`/`wvRamp` amplitude path) and `trochoidLoop` **is** one of F1-amp's four mandated subject laws (independently verified: `RIBBON_LAWS ∩ WV_LAWS ∖ WV6` = exactly `{interlockWeave, trochoidLoop, amplitudeOnly, onePenDown}` by manual set computation against the worktree's own `RIBBON_LAWS`/`WV_LAWS`/`WV6` tables). **Not a reach into F1-trochoid's territory** — trochoidLoop's amplitude was always going to move under this unit's own mandate; the question is only whether the resulting side effect is disclosed and correctly characterized, which it is.

(b) **Genuine fix, re-measured independently — with an important nuance the report already flags but is worth sharpening.** I reproduced the report's own re-measurement table exactly, via a standalone script (`scene3d-ring-coverage.js`'s `measureRingFillRate` + `classifyReachabilityAtDivisor`, not the implementer's script) run against the clean `post2` (`3bc61c32`) export:
  - `ringNotInkMm2`: **2.660625** (report: 2.6606) — exact match
  - clusters: **171** — exact match
  - reachable @div12/@div24: **69/69, delta 0** — exact match
  - worst cluster: **37 cells, 0.2081 mm², 0.750×0.375 mm** — exact match

  I also independently reproduced pre-fix (`6e1ed52f`) via `git archive` + vitest: `scene3d-ribbon-f1b-streaks.test.js` gives **42/44** with the **exact** filed failure text (`reachable @divisor12=76 @divisor24=80: expected 4 <= 1`; `cluster 34 cells, 0.1912 mm², 1.050 x 0.450 mm`). Post-fix (`3bc61c32`) gives **44/44**.

  **The nuance:** total residue (`ringNotInkMm2`, cluster count) got **slightly worse** (2.4694→2.6606 mm², 164→171 clusters) while the two specific oracle assertions (lattice-sensitivity delta, worst-cluster shape) improved. This is a **real geometric change** (the amplitude mechanism genuinely moves where the ruling sits near the corner, changing which cells are covered) — not a resampling artifact or a metric-input coincidence — but it is **not** evidence that F1-trochoid's underlying corner-pocket defect is fixed; it is evidence that this *specific* pocket got smaller/rounder while the total residue redistributed elsewhere. The report's own hedge ("I do not close it unilaterally... a real, disclosed, mechanism-driven side effect") is the right level of claim and should not be read as more than that.

(c) **`0.04` measured-minimal — fully reproduced, including the cliff itself.** I independently confirmed the shipped value (`0.04`) reproduces the report's own sweep-table endpoint exactly via the flat-field-placement guard (22/22 clean, matching "re-run AFTER trochoidLoop floor correction: 22/22"). I then hand-patched a third scratch copy (`post3`, `git archive 3bc61c32`) to `WV_TROCH_AFLOOR_SHARE = 0.05` and re-ran the same deep-blank/largest-cluster measurement independently (own script, not the implementer's): **`deepBlank(mm2)=5.2300 largestCluster(mm2)=43.6600` — an exact match to the report's claimed cliff (5.23 / 43.66) at share `0.05`.** The cliff is real, reproduced independently at the exact reported precision, and `0.04` is a genuine working margin below it, not a stylistic guess.

(d) **Attribution:** explicit, in its own report.json field (`f1_trochoid_renumbering`) and impl-report section "(2) F1-trochoid re-measurement" — correctly disclosed, not buried.

**Verdict: ACCEPT-WITH-FOLLOWUPS.** Correctly scoped, correctly and honestly attributed, numerically reproduced almost in full. The one gap (independently reproducing the `0.05` cliff point) is a nice-to-have, not a blocker, given the rest of the chain reproduces exactly.

## Condition 3 — Decision-10 input (ribbon weight) — ACCEPT-WITH-FOLLOWUPS

Independently re-measured whole-object torus/hatch/density-50 ink via a standalone script (not the implementer's), for all four laws, matching the report almost exactly:

| law | report before→after (Δ%) | my before→after (Δ%) |
|---|---|---|
| interlockWeave | 6325.02→6166.94 (−2.50%) | 6325.018→6166.940 (**−2.50%, exact**) |
| trochoidLoop | 6645.83→6581.01 (−0.98%) | 6645.828→6572.712 (**−1.10%, small ~0.12pp discrepancy, unresolved**) |
| amplitudeOnly | 3828.29→3886.47 (+1.52%) | 3828.291→3886.469 (**+1.52%, exact**) |
| onePenDown | 6326.84→6063.70 (−4.16%) | 6326.838→6063.705 (**−4.16%, exact**) |

3 of 4 match to the reported precision; the trochoidLoop gap is small, doesn't change sign or magnitude class, and I could not isolate its cause (source file is md5-identical to the shipped commit) — likely a minor fixture/density default difference between my script and the implementer's. Not blocking.

**The report's own finding is correct and important: F1-amp does NOT restore boldness — it thins 3 of 4 laws further, most on `onePenDown` (the exact law F1-erode-plan §7 flagged as already reading thin), and it explicitly says its own amplitude floor is "not the lever" F1-erode-plan §7 hoped for.** This is intellectually honest and directly falsifies the hopeful reading of decision 10 rather than papering over it.

**New finding, not in the report, from my own supplementary sweep (see condition 7): under the `create`/gallery capture rig (denser `PRIMITIVE_CREATE_DEFAULTS` fixture, the pipeline the actual gallery and Jay's own screenshots use) `onePenDown`'s ink drop is `2265.6→2084.5 mm`, i.e. **−7.99%** — right at the edge of the ±8% bound, and under a **fixture the implementer never tested.** It's still technically inside the bound, but it is a near-miss the report's own ±8% claim ("range −4.16%…+1.52%, all inside the bound") does not cover, because that claim was derived only from the plain `engine.addLayer` unit fixture. This should be measured and disclosed before the unit is treated as fully clear on the ink bound.

**Verdict: ACCEPT-WITH-FOLLOWUPS.** The core finding (thins, doesn't bolden) is correct and well-supported. Follow-up: measure the ink bound on the `create`/gallery rig too, not just the unit fixture — `onePenDown` is close to the wire there.

## Condition 4 — WV6 byte-identity — ACCEPT

Independently rebuilt `ampSpacing` and `weaveDepth` (torus, `6e1ed52f` vs `3bc61c32`) via a standalone fingerprint script (path+kind string over every scenePath point, not reused from the implementer): **byte-identical fingerprints, ink unchanged to the fraction of a mm** (`ampSpacing` 6370.316mm both trees; `weaveDepth` 6377.293mm both trees). Extended to **all 8 mappers** in the full sweep (condition 7): **ampSpacing and weaveDepth are byte-identical across all 8 mappers, 0 changed of 16 combinations** — a stronger and more complete proof than the report's own (hatch-only, plus the unit harness's `taperedEnds`/WV6 scoping-control tests). No WV6 movement anywhere I tested, on either the unit harness or a from-scratch rebuild.

I did not separately re-run the capture-rig byte-identity claims (`ampSpacing`/`weaveDepth` med/max cells) pixel-for-pixel against the top-level gallery baseline — I trust the report's md5 claim there given the much stronger unit-harness + 8-mapper-sweep proof above makes a capture-rig leak implausible.

**Verdict: ACCEPT.**

## Condition 5 — Stop conditions — ACCEPT-WITH-FOLLOWUPS

- **±8% ink per subject law:** confirmed via condition 3 (all four inside bound on the unit fixture) — but see the create-rig near-miss above (−7.99% on `onePenDown`), which is a genuine, undisclosed near-boundary case on a fixture the report didn't test.
- **ringFillRate ≥ 0.995:** confirmed via independent re-run of `scene3d-ribbon-wall-coverage.test.js` (**36/36**) and `scene3d-ribbon-f1b-streaks.test.js` (**44/44**) on the clean `post2` export.
- **wide does not fall / degenerate === 0 / erodeEmpty === 0:** confirmed passing inside the 47/47 own-file re-run (Guards describe block), and independently via `scene3d-ribbon-erode-refusal.test.js` **16/16** on `post2`.
- **deep-blank ≤ 0.55 mm² on the three laws** (`scene3d-ribbon-flat-field-placement.test.js`): independently re-run on the live worktree (has `git` history needed for its `git show` pre-fix baseline; `post2` lacks `.git` so this one file can't run there) — **22/22**, matching "re-run AFTER trochoidLoop floor correction: 22/22, clean."

**Verdict: ACCEPT-WITH-FOLLOWUPS**, same reasoning as condition 3 (the create-rig ink near-miss is the one open item).

## Condition 6 — Guards — ACCEPT

Re-ran five of the named guards individually, foreground, on clean scratch exports (exceeding the "re-run four" ask):

| file | claimed | independently measured |
|---|---|---|
| `scene3d-ribbon-f1-amp.test.js` | 47/47 | **47/47** (both live worktree and clean `post2`) |
| `scene3d-ribbon-f1b-streaks.test.js` | 44/44 post, "better than 42/44" | **44/44 post2**; **42/44 at pre `6e1ed52f`** with the exact filed trochoidLoop failures |
| `scene3d-ribbon-wall-coverage.test.js` | 36/36 | **36/36** |
| `scene3d-ribbon-erode-refusal.test.js` | 16/16 | **16/16** |
| `scene3d-ribbon-flat-field-placement.test.js` | 22/22 | **22/22** (one benign `[vitest-worker] onTaskUpdate` timeout, exit 0 — documented pre-existing noise) |

`## Bars changed` claim ("None in any pre-existing test file") is accurate — `git diff --stat` confirms only `surface-fill.js` and the new test file changed; no existing test file's assertions were touched.

**Verdict: ACCEPT.**

## Condition 7 — Sweep breadth — ACCEPT-WITH-FOLLOWUPS (the report itself under-discloses this)

**The implementer's own report tests only the `hatch` mapper — 1 of the 8-Type roster (12.5%)** — despite the LEDGER's own standing ruling from F1-erode ("sweep breadth is itself a measurement... every plan and every impl report that claims a blast radius must state what fraction of the roster it covered and why each exclusion is safe"). The F1-amp report never states this fraction and never runs the missing 7 mappers.

**I ran the full 8-mapper × 6-law sweep myself** (48 combinations, torus, pre `6e1ed52f` vs post `3bc61c32`, fingerprint + ink):

- **12/48 changed — exactly the 4 subject laws × 3 mappers: `hatch`, `crosshatch`, `contour`.**
- `contourSlice`, `none`, `wireframe`, `spiral`, `stipple` — **0 cells changed across all 6 laws (36 combinations), byte-identical.**
- `ampSpacing`/`weaveDepth` — **0 cells changed across all 8 mappers (16 combinations)** — extends condition 4's byte-identity proof to the full mapper roster.
- All 12 changed cells' ink deltas: interlockWeave −2.50%/−1.89%/+0.48%, trochoidLoop −1.10%/−1.01%/+0.31%, amplitudeOnly +1.52%/+2.03%/+2.28%, onePenDown −4.16%/**−5.77%**/**+3.60%** (hatch/crosshatch/contour respectively) — all inside ±8%.

**A genuine, previously-undisclosed finding: under the `contour` mapper, `onePenDown` GAINS ink (+3.60%), the opposite sign from `hatch`'s −4.16%.** The report's decision-10 conclusion ("F1-amp makes onePenDown read lighter, not bolder") is **true for `hatch` and `crosshatch` but false for `contour`** — this is mapper-dependent, not a fixed direction, and the report doesn't know it because it only tested one mapper. This doesn't overturn the report's headline finding (hatch is the primary style used everywhere else in this audit and in the named evidence cells), but it means the report's universal-sounding "not the lever" language should be scoped to hatch/crosshatch specifically.

**Verdict: ACCEPT-WITH-FOLLOWUPS.** No leak or ink-bound violation found anywhere in the full roster — the scope is correct — but the report should have stated its coverage fraction and, having not swept it, should not have generalized the ribbon-weight finding across mappers it never measured.

## Condition 8 — Pictures — ACCEPT

Shot `torus__hatch__{interlockWeave,onePenDown,trochoidLoop}__med__a` on **both** pre (`6e1ed52f`) and post (`3bc61c32`) via MAIN's `scripts/audit/scene3d-capture.js --tier B --root <scratch> --port 8495/8496`, `create` rig (the `addLayer` rig would need a second port pair and was not repeated here since the report's own `addLayer` numbers are internally consistent with its unit-fixture test file, which I already validated in full). All three cells are byte-different pre vs post (md5), matching the report.

Native-resolution 3x crops of the top-of-ring highlight band (a different, wider crop than the report's own upper-right-tip crop):

- **interlockWeave** — clear, unambiguous: pre-fix shows a **smooth, flat, unwavering top edge** over roughly the left 40% of the crop; post-fix that same stretch is **continuously jagged**. Matches the report's own description exactly.
- **onePenDown** — **also clearly visible in my crop**, contrary to the report's own disclosed uncertainty ("not visually obvious at this specific crop... I could not confidently point to a difference"). Pre-fix shows a smooth flat top edge running the full width of the crop; post-fix shows continuous jaggedness the whole way across. **This is a positive correction to the report, not a defect in it** — the implementer was honest about not seeing it at their chosen crop, and it turns out to be visible at a different one, increasing confidence in the fix, not decreasing it.
- **trochoidLoop** — subtle, as the report predicts from its much smaller floor (0.04 vs 0.14): pre and post look similar overall with small bumpiness differences on the left portion of the top edge. Consistent with the report's own "subtle" characterization.

**Compared to `orchestrator-onePenDown-med-before-after.png`** (the picture that raised decision 10): that image is a full-ring shot (not cropped to the highlight) and shows the interior-fill teeth pattern already present both before and after at that camera framing — it documents F1-placement's ribbon-width thinning (decision 10's original trigger), a different picture question than F1-amp's highlight-amplitude question. No contradiction between the two.

**Verdict: ACCEPT.**

## Condition 9 — Deviation check — ACCEPT

Checked `docs/3d-audit/STILL-OPEN.md`'s Incident 9 entry (2026-09-12 evening, reset 22:40 EDT): **the F1-amp implementer WAS killed by a rate limit while waiting on a background probe** ("DEVIATION 8 of the background-polling class... the F1-amp implementer's last transcript line shows it waiting on a background probe"). Critically, at the time of the kill **`fill-audit-a3` was still clean at `6e1ed52f`** — "the F1-amp implementer had written nothing to disk, so there is no WIP checkpoint and no report to reconcile" — and the resume was via `SendMessage` with the transcript intact (not a from-scratch restart). This means **every number in the shipped report and diff was produced in the continuous post-resume work**, not carried forward from before the kill; there is no pre-kill artifact to have gone stale. This is also consistent with the impl report's own account of trying (and abandoning, as too slow) the `TONE_UNCAPPED` full 8-law probe before landing on the text-patch technique — that abandoned probe is almost certainly the very background wait that got it killed.

Spot-checked three load-bearing numbers independently rather than relying on this provenance argument alone: the RED/GREEN 47/47 (condition 1), the trochoidLoop re-measurement table (condition 2), and the whole-object ink deltas (condition 3) — all reproduce on my own from-scratch builds. **No stale pre-kill number found.**

**Verdict: ACCEPT.**

## Overall

| # | Verdict |
|---|---|
| 1 RED/GREEN + mutation-kill | ACCEPT |
| 2 Borrowed green / scope | ACCEPT-WITH-FOLLOWUPS |
| 3 Decision-10 input | ACCEPT-WITH-FOLLOWUPS |
| 4 WV6 byte-identity | ACCEPT |
| 5 Stop conditions | ACCEPT-WITH-FOLLOWUPS |
| 6 Guards | ACCEPT |
| 7 Sweep breadth | ACCEPT-WITH-FOLLOWUPS |
| 8 Pictures | ACCEPT |
| 9 Deviation check | ACCEPT |

**OVERALL: ACCEPT-WITH-FOLLOWUPS.**

The unit does what it claims: a correctly-scoped, RED/GREEN-proven, mutation-killed amplitude floor for the four pre-Round-6 wave laws, with an honest and important disclosure that it thins rather than bolds three of four laws (directly relevant to, and not foreclosing, Jay's open decision 10). Every headline number I attempted to reproduce, reproduced — most to the implementer's own precision, via independently-written scripts rather than the implementer's own harness. The trochoidLoop floor's cliff-avoidance is real engineering (caught before evidence capture, exactly as the protocol asks) and its borrowed-green side effect on F1-trochoid's two reds is correctly scoped and honestly attributed, if with a nuance (total residue is not actually improved) worth carrying forward.

**Two follow-ups, neither blocking:**
1. Measure the ink bound on the `create`/gallery capture rig, not just the `engine.addLayer` unit fixture — `onePenDown` sits at **−7.99%**, essentially the ±8% wire, on a fixture the report never tested.
2. State sweep coverage as a fraction of the roster and either run the other 7 mappers or justify skipping them — I ran the full sweep myself and found it clean (0 leaks, 0 bound violations), but also found the decision-10 "reads lighter" finding **reverses sign under `contour`** (`onePenDown` +3.60%), which the report's mapper-agnostic language doesn't disclose.

(The trochoidLoop cliff at `0.05`, initially unreproduced due to a shared-machine stall, was subsequently reproduced exactly — `5.2300`/`43.6600` mm² against the report's `5.23`/`43.66` — so that item is now fully closed, not a follow-up.)

**F1 as a whole is NOT closed by this unit** — per its own report and the standing ruling, Jay has not looked at the pictures, and this review does not purport to substitute for that. **Worktree collision flagged**: `fill-audit-a3` currently carries live, uncommitted T2-2 WIP on top of `3bc61c32` — orthogonal to F1-amp's own correctness, but should be checkpointed before further work lands there.

## Cleanup

No probe files left in the worktree (I never wrote there). Scratch exports at `/private/tmp/claude-501/scratch-F1A/` are outside the repo. Evidence captures written to `docs/3d-audit/fill-audit/after/F1-amp/review-pre/`, `review-post/`, and `review-crops/` in MAIN (new directories, additive only — nothing in the existing `after/F1-amp/` report/evidence was touched or overwritten).
