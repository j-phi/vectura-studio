# 3D fill audit — SESSION SUMMARY (round 1: 2026-09-05 → 06 · round 2: 2026-09-06 19:05 EDT →)

**🟢 DECISION 10 IS READY FOR JAY — the evidence packet is complete (both rigs' pictures, per-law ink and width numbers, and measured width floors). TWO DECISIONS ARE OPEN (§4). DECISION 10 BLOCKS F1 FROM CLOSING (ribbon WEIGHT after Prototype B: is the thinner ribbon acceptable, or must the fix keep the pre-fix weight?). It was found by eye, not by a bar — no guard measures ribbon width.** **ROUND 3 IS PAUSED BY JAY (2026-09-12 07:50 EDT). NOT MERGED — five lanes hold unmerged work, two of them on unverified WIP checkpoints. Round 2 is complete and merged into local `main` at `9cf09b39`, v1.4.1** (the merge of `3d-scene/integrate-r2 @4421d514`, with the docs commit `1e504ce6` beneath it). Merge review **ACCEPT** (`MERGE-review-r2.md` — every claim reproduced). Main is **44 ahead of origin/main and NOT pushed**; pushing remains Jay's call. Round 1 is closed: all units landed,
reviewed, and merged into local `main` at `817424dc`, with the docs wrap-up at `6ad1d93e` and the ledger
record at `47a5a755`. **The seven round-1 `3d-scene/*` lanes are historical**; round 2 runs in five NEW
worktrees branched off `main` — map and first-unit briefs in `ROUND2-BRIEFS.md`, queue in `LEDGER.md`
§"Round 2".

> **⚠ MAIN MOVED (2026-09-08).** Another session released **v1.4.0** (`af24d3d9`) and added three CI test
> commits: `e429cfc5` (chunked U0 sweeps — **edits `tests/unit/scene3d-tone-law-collapse.test.js`**),
> `1193cbe1` (rounding for byte-identity/golden comparisons, arm64 vs x86_64) and `88041036` (vitest
> timeouts 60 → 180 s). `main` is `a7d39601`; `origin/main` is `88041036`, so main is **ahead 1** — only the
> docs checkpoint is unpushed. **The merge must rebase the round-2 lanes onto ≥ `88041036`, bump from 1.4.0
> (not 1.3.99), and hand-merge `scene3d-tone-law-collapse.test.js`, which now has THREE independent authors
> (`e429cfc5` on main, U9 `fc8b0fba`, U5b-2/3 `eea613fd`).** Nothing is rebased yet. Detail in `LEDGER.md`
> §"MAIN MOVED" and the merge-checklist additions beside it. Main being **ahead 1** is expected: the docs
> checkpoint stays local until Jay says push.

Detail: `LEDGER.md` (per-unit rows, secretary flags, standing rulings, incidents) · `STILL-OPEN.md` (full findings).

> **P0 (W-26, the user's ladder-gap rule) is CLOSED — the judge's three blocking conditions are met and independently verified.**

---

## 1. LANDED & REVIEWED

### Round 3 (2026-09-10 → 12, PAUSED) — all on lanes, NOT merged

| unit | lane | sha | outcome |
|---|---|---|---|
| **W-37** | fill-audit-d3 | — | **CLOSED MEASURED, no unit.** A scout found the fitter gate now engages roster-wide after W-34's device-space refinement; the cone residual costs **0 mm**. The defect had been fixed by another unit's side effect. |
| **T4** (Jay's decision 1 = B) | fill-audit-a3 | `a3b651f0` | **DONE/FU.** Sphere/hatch/mkDashRamp d=220 ink **758.5 → 1501.1 mm** on the real capture pipeline, **no slab** (G4 enforced structurally). The one widened bar (2.5 → 3.5 mm) ruled **principled, not minimal** — derived from the mechanism's own worst-case offset. → **T4b** (no CI guard on the 1500 mm bar). |
| **U6** (decision 2 = A) | fill-collapse-3 | `2af329dd` | **DONE/FU**, conditional on U6-2 — since satisfied. Picker **33 → 30**, aliases 15 → 18. Found that **`shadows.js` dispatches on MARK CLASS**, so the `'dot'` → `'hatch'` move needed its own `HATCH_LAW_RECIPES` entry or the shadow would have silently fallen back to `ladder`. Corrected counts: **53/53 row, 544 total — not 550**. |
| **W-38** (decision 7 = B) | fill-audit-3 | `575f886d` | **DONE/FU.** `facetMinRulings` ships, **default 3 byte-identical**; ground plane untouched **by construction**. The mono-law boundary was **enumerated on both sides**, not claimed. |
| **W-38b** | fill-audit-3 | `141ed0b5` | **DONE/FU.** T1's `git show HEAD:` leg was **structurally vacuous forever**; replaced with 60 pinned goldens, proven by a **contrast** mutation. |
| **W-36c** (decision 6 = C) | fill-audit-a3 | `8adfd5af` | **DONE/FU — decision 6 DELIVERED.** Per-family budget + a measured anti-saturation cap; Jay's cell is a full even crosshatch. The `2.5 → 2.0` ceiling accepted; **the sub-check removal loses real coverage** (a lower-half freeze passes both surviving bars) → **W-36d**. |
| **GH-2** | **MAIN `6ffaf9c6`** | `6ffaf9c6` | **DONE — and it is the FIRST round-3 work committed on main, not on a lane** (`scripts/audit/` is the orchestrator-owned surface). `scene3d-capture.js` gains a **`--rig addLayer`** tier; **the default `create` rig stays byte-identical** (the 3480-cell gallery is pinned to it). ✅ **Proven to reach the defect, which was the point:** the addLayer pair `torus__hatch__interlockWeave__med__a` at `7f805654` vs `e2c3ca85` shows **pre = thin wireframe zigzag, post = full ribbon** — **F1-erode is now real-app verified on the unit rig and the 2026-09-12 observer error is resolved with correct evidence.** GH-1's refusal now knows **"rig mismatch"** as a legitimate identical-pair cause. |
| **F1-width-bar-b** | fill-audit-a3 | `8780e97c` | **DONE/FU — VERIFIED (light pass), the first unit under the new regime.** **The `create`-rig width gap is SIZED and the two rigs agree closely** (interlockWeave 0.98298 vs 0.9832; trochoidLoop 0.93154 vs 0.9377). **Floors on two laws by measurement — interlockWeave 0.83403 mm, trochoidLoop 0.72466 mm — and `onePenDown` MEASURED ONLY, NO FLOOR**, its population being tiny and camera-unstable (4 vs 6 stretches). ✅ **It also closed the addLayer unit's open follow-up 4: `onePenDown` camera 'b' = 0.91425 mm — the measurement both that implementer and its reviewer were beaten to by machine load. The difference was procedure: it checked `uptime` first, as the ledger said to.** |
| **T3** | fill-audit-a3 | `64b160a0` | **DONE/FU. Reviewer ACCEPT-WITH-FOLLOWUPS, all six conditions met.** ⚠⚠ **The picture flag is CONFIRMED as a fact but ATTRIBUTED AWAY from this unit: the dashes ARE multi-pass bundles, but that is T4's BAND-PASS mechanism (Jay's own decision 1 = B), not anything T3 did — and T3 REDUCED it, pens per mark 5.71 → 3.93.** → **§4 DECISION 12.** ⚠ **The lesson for REJECT-if-confirmed flags: "confirmed" and "this unit's fault" are separate questions, and the picture could not tell them apart — only the per-mark pen count could.** Original: **d=1 dashes 7 → 46, monotone, d=50 and d=220 unchanged** — Jay's W-06b complaint answered at the low end without disturbing the range T4 and W-36c settled. **First unit to go straight to an implementer with no planner, under the new regime.** ⚠⚠ **But on `sphere/hatch/mkDashRamp/low` each "dash" is a BUNDLE OF ~6–8 PARALLEL PASSES SPANNING THE ROW — possibly the "row-wide tiles" Jay ALSO rejected.** ⚠ **The round's recurring shape again: a count bar (7 → 46) measures that marks exist, not what they look like, and nothing measures passes-per-dash.** |
| **W-31b** | fill-audit-a3 | `c28b3490` | **MEASURED-with-guards — VERIFIED (light pass; guards mutation-proved).** ✅ **The bounded ruling worked exactly as designed, and this IS the result rather than a consolation: M1 was attempted, failed its closure conditions over two iterations, and was DISCARDED — with the closure-condition table in the report, not a narrative about why it nearly worked.** **Rank 3's two mutation-proved guards shipped instead — C7 (tone-authority floor at d=50) and C8 (local plot-safety p01), 11/11.** ⚠ **The honest state: the CEILING is measured and now GUARDED, but the PLACEMENT fix does not exist. Three attempts have failed to find a mechanism and two ranks are marked never-retry. What the audit bought is a defect that can no longer silently get worse — not a defect that is fixed.** |
| **T2-3** | fill-audit-a3 | `81925ee8` | **DONE/FU. Reviewer ACCEPT-WITH-FOLLOWUPS — a REAL wedge fix, per-cell tables reproduced — and the orchestrator picture is POSITIVE for the first time on this item, at the third attempt.** ⚠⚠ **But TWO follow-ups → T2-3b: (a) the unit's own "RED at pre-fix" self-test uses `git show HEAD:` and is BROKEN at its own landing commit — the file runs 44 passed / 2 skipped / 1 FAILED, not the claimed 46/46 (the W-38 vacuous-leg class for the third time, and the first that FAILS rather than passes silently); (b) UNDISCLOSED diagonal moiré on the CONTOUR mapper introduced by the stagger — a scout is measuring it, and the fix ships with a moiré bar.** **T2 remains PARTIAL for Jay's eye.** Original: On `cone/hatch/mkTick/med`: **ticks grade from long on the dark side to short and sparse toward the highlight, the hard-edged wedges are GONE, and the only bare region left is the highlight itself — one continuous texture whose tick length carries the tone.** O5 3.0–4.3 all cells, `wedge25` −16 % on both rigs, G4 intact at 30/30, **instrument shipped in the same unit as ruled.** ⚠ **Its best feature is a disclosure: the shipped instrument is NOT the plan's** (coarse republished samples splatted at `rowPitch/2` vs the plan's dense 461×461 sweep), **so every row endpoint overhangs by `rowPitch/2` — `holeMax` is dominated by that artefact and is REPORTED, NOT GATED; `wedge25` survives and is gated, with the per-cell bar honestly labelled a non-regression ceiling** (torus/contour on `create`: 0.17307 vs 0.17522 mutant, inside its own noise). ⚠ **One bar change: O1's population re-scoped to the longest third — the same re-scope T2-2 carried when it was REJECTED, so it needs an independent ruling, not inheritance.** |
| **F1-width-bar** | fill-audit-a3 | `42acff7b` | **DONE/FU. Reviewer ACCEPT-WITH-FOLLOWUPS — "the first guard in the repo that measures ribbon width, and it does what it says": every headline number reproduced to the EXACT DIGIT from the reviewer's own runs, and the blocking mutation proof passes both directions plus the reviewer's own extras.** ⚠ **Four non-blocking follow-ups.** One is a wrong causal claim about the `onePenDown` width gap (it PREDATES the erode fix — pure script methodology, the same class as the discrepancy the unit had just resolved). ✅ **A second is now CLOSED WITH A CORRECTED CAUSE, and the REVIEWER's diagnosis was the wrong one: a re-shoot proved `fillAngle` absent ≡ 45, so the pictures WERE the measured fixture — the ~35–40 % `inkMm` divergence was GROUND-PLANE INK, included in one measurement and excluded in the other** → merge-checklist item 30 audits every round-3 ink number for it. Also: the `create`-rig width gap is more closeable than disclosed (a tests-only script can rebuild the rig in jsdom), and `onePenDown` camera-'b' is still unmeasured — **the reviewer tried too, and watched load climb 2.5 → 5.0**. Original: The audit finally has an instrument for the quantity §4 decision 10 turns on: **a FLOOR on mean `CLS_RIBBON` width per wave-ribbon law** (interlockWeave 0.8316 mm, trochoidLoop 0.7030, onePenDown 0.7041), tests-only, mutation-proved both ways. ✅ **The −0.98 % vs −1.10 % discrepancy is RESOLVED against the number that filed it: running the canonical construction on the committed `3bc61c32` source gives 6572.7118 mm — the REVIEWER's figure to 4 dp.** ✅ **`amplitudeOnly` excluded by MEASUREMENT (zero `CLS_RIBBON` stretches), with its own control test.** ⚠ **Disclosed gap: the WIDTH half is `addLayer`-only — the gallery rig's ribbon width is still measured by nothing.** |
| **T2 iteration 2** | fill-audit-a3 | ~~`9d911b05`~~ **REVERTED `179d9218`** | 🛑 **REJECTED and REVERTED — "the same defect T2-review rejected, wearing a softer curve."** **The picture flag is CONFIRMED by measurement: bare area outside the highlight increases on ALL SIX cells, 1.85× to 9.25×** (torus/hatch 2.09 → 19.37 mm²), **none of it disclosed** — the report measured only its own narrower worst-gap metric. **The new tests cannot see the defect: with `MK_TICK_EASE_BLEND` mutated to 1.0 — the literal rejected pure-smoothstep — they still pass.** **Both T2 iterations are now rejected and reverted (T2-1 `94cca882`, T2-2 `179d9218`).** The one part that survives is the disclosed negative → **T2-4**. Superseded: O5 **≥3× monotone on all six cells (3.06–3.64×)** at d=50; 481 tests green across 21 files, G4 and T4b's oracles unmoved, both rigs shot. ⚠⚠ **On `cone/hatch/mkTick/med` the bare wedges between rows on the lit half look LARGER and harder-edged — the exact signature T2-1 was REJECTED for, and no bar in this unit measures bare-wedge area.** ⚠ **One bar change: O1's population re-scoped to the longest third** (numeric bar untouched; geometric argument re-derived, and `T2-review.md` §8 ruled the identical re-scope sound). ✅ **Best work is a disclosed negative: d=220 coverage (0.67–0.82 vs pre-fix 0.91–0.99) is NOT curve-shape-fixable — flat across a BLEND sweep that moves O5 — it is `LMIN*R` nearing `MIN_MARK_MM`.** |
| **F1-amp** | fill-audit-a3 | `3bc61c32` | **DONE/FU. Reviewer ACCEPT-WITH-FOLLOWUPS** — oracle, mutation, the trochoid cliff and byte-identity all independently reproduced, and **WV6 byte-identity extended to the full 8-mapper roster (0 of 16 cells changed)**. ✅ **F1-trochoid (row 2c) is CLOSED by it — correctly scoped, correctly attributed, tests pass for the right reason** (reviewer measured 42/44 at pre and 44/44 post). ⚠ **New finding: on the `create`/gallery rig `onePenDown` is −7.99 % against the ±8 % bound — an undisclosed near-miss on the rig the gallery and Jay actually see** → **F1-amp-b** (row 3a). ⚠ **And the report under-disclosed its own sweep breadth: `hatch` only, 1 of 8 Types, against a standing ruling promoted two units earlier**; the reviewer swept 8 × 6 itself (12 of 48 changed, exactly the 4 laws × hatch/crosshatch/contour). Original: The four pre-Round-6 wave laws finally get an amplitude floor (`WV_AFLOOR_SHARE = 0.14`; `WV_TROCH_AFLOOR_SHARE = 0.04`), 47/47 new tests. ⚠⚠ **It self-caught a regression of F1-placement's PRIMARY oracle before evidence capture** — all four at 0.14 took flat-field-placement 22/22 → 20/22 (trochoidLoop deep-blank 0.00 → 3.97 mm²) — **and the binary search found a CLIFF, not a slope: safe at 0.045, unsafe at 0.05.** ⚠ **Decision 10 answered directionally and against the hopeful reading: F1-amp makes the laws LIGHTER** (onePenDown −5.37 % fill ink, the largest loss, on the law already reading thin) — **amplitude adds arc length but the erosion pipeline removes more than it adds for 3 of 4 laws.** ⚠ **Borrowed green into another unit's subject: F1-trochoid's two reds are now GREEN, 44/44** → row 2c pending review. Orchestrator: **the weave now runs continuously around the whole torus including the highlight band; the highlight ribbons are thinner lines but present.** |
| **T4c** | fill-audit-a3 | `6e1ed52f` | **CLOSED MEASURED, comment-only, no review needed — the measure-first brief worked exactly as intended.** **G4 TRIPS on the slab-regrowing mutation** (sphere 7.728 ≤ 5.8157, torus 8.4 ≤ 6.2724, cone 7.392 ≤ 6.6422; 5 failed/25 passed) **at d=1, the exact density T4b-review showed the slab lives at** — and does NOT trip on the shipped tree (30/30). **So the slab half of Jay's decision-1 bar was already gated, and no duplicate bar was written.** T4b's two report-language corrections folded in, with a per-guard **halves table** that is the new standing ruling's first worked example. |
| **F1-erode** | fill-audit-a3 | `e2c3ca85` | **DONE/FU. Reviewer ACCEPT-WITH-FOLLOWUPS — all ELEVEN conditions reproduced independently, almost all to an exact digit match, on the reviewer's own probes; a 407-cell combined sweep found no undisclosed changed cell, and all four new gates mutation-trip.** The two `trochoidLoop` reds are confirmed **byte-identical geometry**, not just unchanged assertion text. ⚠ **Correction absorbed: THREE ink-losing cells, not two** — the third is `crosshatch/torus/trochoidLoop` −0.22 %, present in `report.json` but under-narrated in the prose. Original: Rank 1 shipped in 13 lines of `insetMultiPolygon`'s retry ladder: a swallowed `polygon-clipping` throw is no longer read as "the stretch eroded away". **f1b-streaks 36/44 → 42/44, wall-coverage 35/36 → 36/36, `erodeEmpty` 1 → 0, NO bar touched**; the two `trochoidLoop` reds are byte-identical and stay F1-trochoid's. ⚠ **Observer error, corrected: the orchestrator's first read of the two GALLERY cells was wrong — they are byte-identical (md5 `b9860c2f…`).** The real proof is the implementer's runtime crops on the unit fixture: **before, a thin single-line zigzag; after, full ribbon teeth continuous with the rest.** ⚠ **The 8-mapper sweep found a SECOND instance the plan never saw (`crosshatch/interlockWeave`, `erodeEmpty` 1 → 0) and named 6 swallowed calls of which 4 were invisible to every counter.** ⚠⚠ **And it proved the GALLERY CANNOT EVIDENCE THIS DEFECT CLASS — its rig differs from the test rig** (checklist item 27). |
| **T4b** | fill-audit-a3 | `7f805654` | **DONE/FU.** Reviewer **ACCEPT-WITH-FOLLOWUPS** — every number reproduces, and it swept axes the implementer did not (sphere `detail` ±4: 1501.06–1505.45, all inside). ⚠ **Both secretary flags confirmed: the band's lower half is mathematically DEAD (1350.96 < the 1400 floor), and the upper half is STRUCTURALLY BLIND to the slab defect — the slab-regrowing formula measures BYTE-IDENTICAL ink at this cell (1501.0636578) and only shows at d=1 (826 → 2207 mm, +167 %). So T4b gates the ink half of Jay's decision-1 bar, not the slab half** → **T4c** (row 1b). Original: T4's 1501.1 mm dark end finally has a CI guard. Tests-only, one new file. **Envelope measured FIRST**: bit-identical over 5 builds, 8-point ±2° sweep = **[1479.74, 1517.52] mm**; **floor 1400 sits 5.4 % below the envelope and 84.6 % above the 758.5 mm regression**, plus a ±10 % band and a `> PRE_FIX × 1.5` check. Fixture drives the real `engine.addLayer` insert path and matches T4-review's own ink to **10 significant digits**; RED reproduced on the committed file at **758.5005509047427**. |
| **W-36d** | fill-audit-a3 | `dcc91872` | **DONE/FU.** Reviewer **ACCEPT-WITH-FOLLOWUPS** (`W-36d-review.md`). Tests-only, one file; the removed lower-half sub-check is restored as `nB(0.25) >= 1.2 × nB(1.0)`, **mutation-proven the right way — under the review's lower-half freeze the KEPT W-36c bars still pass (2.0 / 2.29, monotonic) while the new one fails (1.1429 / 1.1702)**. ⚠ **But two of the secretary's three conditions came back QUALIFIED, both by measurement: (a) two interior-only mutations — one concentrated in `[0.5, 1.0]` exactly as asked — evade EVERY bar in the file while breaking the dial at r=0.9** → **W-36e**; **(b) real unmutated code measures 1.167 at d=5, BELOW the 1.2 floor**, and capsule d=100 sits at 2.04 % margin — **so 1.2 is valid only at the pinned sphere d=10/d=100 points and must never be ported without re-deriving.** ✅ **A read-only scout settled (b) as ARTIFACT and sharpened it** (`W-36d-d5-scout.md`): d=2/3/4/5 are **bit-for-bit identical** (all round to `N = 8` at `surface-fill.js:5479`), the pre-round demand rises a real ~12 % across them, and the dial still adds a whole ruling and **+15.6 % crossing-family ink** at d=5 — coarse, **not inert**. **The ratio metric is small-integer NOISE below d≈10 on BOTH sides of 1.2 (1.400 / 1.167 / 1.333), so W-36e's bar must be ink- or budget-based, or restricted to d ≥ 10. The shipped test asserts only at d=10/d=100 and needs no change.** The d=10 point's true slack is **one integer ruling-count**, not the 7 % the ratio implies. |
| **U9b-2** | fill-collapse-3 | `e10306e9` | **DONE/FU.** Reviewer **ACCEPT** — all four scope items non-vacuous under the reviewer's own mutation-testing, and **commit 1 confirmed clean IN ISOLATION** on a `mid` export (10/10 + 7/7 + 3/3 + 119/119), which the combined-tree run could not show. The `onePenDown` write-back now has a real load-path round-trip and a **mutation-proven guard that trips if a second id acquires `shadowResolvesToSurvivor`**. ⚠ **The "328/328" headline is confirmed wrong — 312 is the sum of its own addends** (every individual count re-measured and correct; the fifth arithmetic slip caught by re-summing). ⚠ One sibling test is **vacuous in isolation** — the load-bearing proof of "no per-pass rewrite" is its raw-value twin, and that needs saying in the file. |
| **U5b-4** | fill-collapse-3 | `eb9707a8` | **DONE/FU — the standing caveat ruling now holds on all four surfaces.** Reviewer **ACCEPT**: both shadow surfaces render the paragraph, `.is-caveat` sites 2 → 4, the fix is **provably non-seeding** (U9's boundary intact — no sub-control, nothing written to the bag), and `ladder` correctly renders **no empty paragraph**. **The RED was re-derived as a real reproduced failure on a `pre` export**, closing the report's own self-contradiction. ⚠ **The ctxbar select clipping to "Duty Cycle · Constar" is PROVEN pre-existing at `49a5ef88`** → **U5b-5** (row 11c). |
| **F1-placement** (Jay's decision 4 = A) | fill-audit-a3 | `cd541f87` | **MEASURED — NOT DONE. Reviewer ACCEPT-WITH-FOLLOWUPS — all nine conditions reproduced exactly**, and it found the erode-failure endpoints sit inside the RED-2 cluster's bbox with the centroid at their midpoint (condition 6: largely yes). ⚠ **Shipping B literally fires the plan's own stop condition 3 — resolved by ruling option (c) = F1-erode, not by waving it through.** ⚠ **NEW §4 DECISION 10 FOR JAY: on onePenDown the bands went from bold filled ribbons to thin wireframe zigzags — strip gone, band much lighter, and NO guard measures ribbon width.** Prototype B (LOCAL) shipped from the dead predecessor's WIP, verified not authored — **no `src/` file touched this session**. **Deep-blank 3.02 / 4.00 / 1.79 → 0.03 / 0.00 / 0.00 mm²**, the primary oracle met with ≥3.6× margin. ⚠ **But the round's EIGHTH oracle-instrument defect was found by disproof: the "pre-existing red" never existed.** The predecessor's env-gated comparison set `VECTURA_PRE_F1P=1` on two files that read a *different* flag or none — **both runs ran identical post-fix code.** A real `git archive 8adfd5af` export is **44/44 and 36/36 clean**; `cd541f87` is 36/44 and 35/36. **Nine tests, all caused by the fix**, traced to `ribbonize()`'s `erodeEmpty` centreline fallback (`ringFillRate` 0.99688 → 0.93632). **Guards NOT re-pinned → new unit F1-erode.** Not F1 CLOSED: F1-amp still mandatory. |
| **HLR sub-pen precision** | handoff-c3 | — | **CLOSED MEASURED / PARKED, no unit, no review.** Nothing committed; the lane is clean at `426cc5e4`. The **W-25 imported-torus seam is 0 mm — fully closed** (and its bar is already the tight `toBe(0)`); the **bridged micro-gap pair is 0.0038 mm = 0.0127 pen widths**, ~1.3 % of one pen, an order of magnitude under the park threshold. ⚠ **(a) had already closed before the unit started — the FOURTH item this audit found already fixed by another unit's side effect.** |
| **U9b + W-10d-3b + U6-2** | fill-collapse-3 | `2b189b5f` | **DONE/FU.** 406/406. **The picture flag ruled FIXED, not half-fixed** — the survivor in the select plus the raw id's own text in the popover is the designed end state. → **U9b-2** (the `onePenDown` exception is an undisclosed **write-back-on-load**). |
| **U7-2** | fill-collapse-3 | `49a5ef88` | **DONE — CLOSED 2026-09-12. Reviewer ACCEPT** (`U7-2-review.md`) — unqualified, **all seven secretary conditions reproduced adversarially**, two mutation-kill probes non-vacuous, and the **555/555 re-summed with the report's own derivation gap closed** (naive sum 576; rows 2/3 proven *disjoint* `-t` subsets of the 117, 576 − 21 = 555 — **the first clean sum in this chain after four slips**). 17 caveats rewritten, originals preserved in a non-rendered `measured` field. Found that **the shadow row renders no caveat at all on either surface** → **U5b-4**. → **U7-2b** (two `.*` regexes looser in the abstract than the term match they replaced). |

### Rounds 1–2 (merged at `9cf09b39`)

| unit | lane | sha | outcome (before → after) |
|---|---|---|---|
| W-15c triage | fill-audit | `6d6b1b78` | Design C **REVERTED** — broke 6 files / 7 tests and failed its own oracle. |
| W-01 M1 | fill-audit-a | `9fa159f0` | Boost 6→4.1. Torus ladder `[4,3,4,10]` → **`[3,5,7,10]`**; d=50/220 byte-identical (8/8 md5). |
| W-10c (+iter 2, 3) | fill-audit-c | `e6b85de4` | Floor 0.8→**1.0×pen**, under-bar gaps 10.0%/10.4% → **0%/0%**. Cone/sphere gain; **torus wedge worse (73.9→87.8%)** — kept, hidden by W-10d. Iter-3 **BLOCKED**: no primitive id reaches the mono sink. |
| W-15c | fill-audit | `8bd1581b` | Solo-orientation gate. Plane rulings `3,3,3,3` → **`6,6,7,9`**; gap 8.549→**3.149 mm**; integration 1929/1929. |
| W-10d | fill-audit | `142afe58` | originSpiral greyed on torus in the picker. Does **not** reach saved documents. |
| W-25b | fill-audit-d | `789ba0fa` | Floor scoped by aspect. Buckyball **byte-identical to pre-W-25**; Unit F still floored (102/288 calls, aspect 0.177). |
| W-27c | fill-audit-d | `073202a4` | Newton projector + divergence guard. Ellipsoid 0.964 → **9.8e-10 mm**; a 61.65 mm runaway killed. |
| W-27c 0(b) + W-29 | fill-audit-d | `767bed54` | Torus false fragments 107 → **46 paths**; buckyball open rings **6 → 0**. |
| W-25b / W-27c-0a | fill-audit-d | `ec79e2b9` | See §2 — iter-3 **REJECTED/PARKED**, commit kept for ring integrity. |
| A3 | handoff-c | `d86cbf8d` | **MEASURED** — 0.000 mm² dropped, 89–98% pen-unreachable; oracle split shipped. F1 **not** closed. |
| Unit D phase-align | handoff-c | `8e9b0991` | Phase-locked: worst offset **0.1929× → 9.8e-15**, density 3.0× (bar 1.4×). |
| W-30 | handoff-c | `0d405577` | Per-light-type projector — correct, tested, additive. **UNREACHED until W-30b: no user-visible effect yet.** |
| GH-1 | main (uncommitted) | — | Script hardened (hard refusal + unexplained-identical WARN); `after/W-10` restored; 2 pointer bugs fixed. |
| U0 | fill-collapse | `a8d84bef` | Collapse foundation, provable no-op: **48/48 md5**, 48-of-48 mutation kill, 335/335. |
| U1→U5 | fill-collapse | `8610fd66` | Roster **48 → 35**. **18/18 md5-identical** (re-captured); C-05 confirmed picker-tier only (5/5 distinct renders). |
| T1 | fill-audit-a | `67c9752c` | Chart-walked marks. Refusal **0.20–0.61 → 0.005–0.007**; O1/O2 shortfalls analytically **bounded**. |
| **W-26 (P0)** | fill-audit-a | `3c88605f` | **CLOSED.** Gap jump **2.00 → 1.03–1.17**, spiral turn-advance **77× → 1.05×**, +1.4% ink, R1c 21.20→19.91. |
| **W-10d-2** | fill-audit-2 | `79b626d2` | **Contract A, curated**: only `torus` + surface-fill mapper + `originSpiral` writes back, once. 167/167, **48/48 byte-identity**, blast-radius negative holds. |
| **W-33** | fill-audit-a2 | `c6ff81de` (closed) |
| **W-30d** | fill-collapse-2 | `83d1e021` + `54816268` + `9aad87b8` | **The torus footprint now shows its hole** (F2a): centroid ratio 2.869/3.021 → **0.916/1.000** while the solid annulus band stays shadowed at 2.669/2.741. Thin-torus **blank void** filled by a graded inward search. Convex casters pixel-identical. |
| **W-30c** | fill-collapse-2 | `1e528b94` + `79c07770` | Area-light penumbra restored (0 mm → soft-edged); **the torus's receive shadow, which rendered as no shadow at all (ratio 1.000), now reads 2.869/3.021**; and an ambient light at index 0 no longer deletes a positional light's footprint. No bars changed. |
| **W-35** | fill-audit-d2 | `323e2583` | New **`sliceEndOverlap`** control (−2..8, **default 0 = byte-identical no-op**) for the facet-quantised front/back cut. 30/30 + 181/181 + 37/37, **no bars changed**. |
| **W-33** | fill-audit-a2 | `c6ff81de` | Contour FILL rulings brought **≤ 8° in device space** (C1 31.24°/38.35° → ≤8; C2 18.46–23.25° → ≤8). Root cause was structural: **refinement ran before the seam join**, where the join vertex is exempt from each half's turn check. |
| **U8** | fill-collapse-2 | `2d931b1a` | `onePenDown` folded into `interlockWeave` under `penDown`; roster **34 → 33**. Byte-identity 9/9 (dimensioned) + 18/18 md5; both caveats survive. Corrected counts: **51/51 row, 447 total**. |
| **U7** | fill-collapse-2 | `90f3411f` | `weaveDepth` folded behind a **"Nesting"** sub-control; roster **35 → 34**; 418/418. Byte-identity **double-proven** — a primitive×density resolver sweep (9/9) plus a cross-tree real gallery capture (18/18 md5). First fold where **both** survivor and folded id carry their own distinct caveats. |
| **W-36** | fill-audit-a2 | `e31d8591` | The crossed pair now spends **one shared coverage budget split by the dial**. Gap ratio B:A **5.4–31.2× → 0.814–1.061**; **Jay's cell A 17/B 3 → A 9/B 11**. Cylinder d=220 total preserved (106 vs v1.3.98's 108), now 50/50. P5 holds at 5209.5 mm against a 5649.5 cap. |
| **W-34** | fill-audit-d2 | `fe491dfa` | Refinement stop condition moved to **device space** (Fix A) + a **capsule closed form** (Fix B, fired because T3 came back RED at 297% excess). Capsule **32.42 → 8.37°/mm** against an 8.17 truth (2.56% excess); **cone chevron unchanged — 76.4° emitted vs 76.4° analytic, real geometry.** 14/14 byte-identical incl. cone/cylinder; 0(b) ceiling unmoved at 36/55. |
| **W-27c-0a iter-4** | fill-audit-d2 | `c6dd6130` | Cull re-scoped to ≥2 distinct levels. Ink retention **70.8% → 96.2%**, retention floor TIGHTENED 0.6 → 0.9, lower band an **exact scanline match** to before. **Reviewer ACCEPT-WITH-FOLLOWUPS** — every number reproduced; the four widened bars are honest but **structurally toothless against this mechanism**; the report's root cause **REFUTED**. |
| **U9-2** | handoff-c2 | `ed778940` | Evidence script → `scripts/audit/` (byte-identical re-run) + the first real bar on the folded-id `shadowPathCount` delta: floor `>1` below a measured 2–4 drift envelope, ±10% band `[3.6,4.4]`, mutation-proven (3/23 fail under the inverse of the U9 fix). All bars NEW. |
| **U5b-2/3** | fill-collapse-2 | `1e681432` | Audit prose → plain user copy on both folded caveats; generative `effectiveLaw` ↔ `resolveToneLaw` cross-check in a new, rebase-friendly file. 59/59 + 2/2 + 144/144; **no bars changed**, no wiring touched. |
| **U9** (resolve half) | handoff-c2 | `fc8b0fba` | Shadow bag no longer clamps folded ids before `HATCH_LAW_RECIPES`. **22/22 new tests; reviewer ACCEPT-WITH-FOLLOWUPS** — the six rewritten collapse assertions proven **STALE** (they pinned a real pre-existing defect as a feature). Visually near-identical (+2.7% lines) — honest but weak; follow-ups → U9-2. |
| **W-26b** (C1+C2+C3+4a) | fill-audit-a | `7bc2b1a0`/`4a858445`/`0930cb2d` | Crosshatch **9326.7 → 5153.7 mm (+4.9% vs pre-W-26)**; `crossDensityRatio` 1.12× → **2.3×**; tautology guard replaced; three coin bars → floor + band. |

## 2. RESTARTED FRESH 2026-09-12 (session resumed) — the three agents Incident 8 killed

> **STATUS 2026-09-12, session RESUMED after Jay's pause: all three agents were RESTARTED FRESH today.
> ONE IS ALREADY CLOSED — the U7-2 review came back ACCEPT** (`U7-2-review.md`, all seven conditions).
> The two implementers (F1-placement on `fill-audit-a3`, U9b-2 + U5b-4 on `fill-collapse-3`) are in flight.
> Self-contained briefs — one section per agent, each carrying the known-slow-vitest
> `timeout: 600000` rule verbatim — are in **`ROUND3-RESUME-BRIEFS.md`**; hand an agent only its own section
> plus `AGENT-PROTOCOL.md`. Verified before the restart: all five `-3` worktrees clean (stash list is
> graphify noise only); stale dev servers on 8475/8476/8460 killed; **lane ports 8475 / 8481 / 8482 / 8476 /
> 8470 are free** and MAIN is served fresh on 8460. Lane HEADs unchanged from the pause table below.

**Incident 8 killed three agents the evening of 2026-09-11; Jay paused before the reset could be used, so
NONE were resumed. All three are dead and this session restarts them FRESH from the on-disk state** —
the Incident-3 pattern, not the Incident-4/5/7 one.

| unit | lane | state at the pause | how to restart |
|---|---|---|---|
| **F1-placement** (Prototype B, decision 4 = A) | fill-audit-a3 | **WIP `32ec6ef0`, UNVERIFIED** — a `surface-fill.js` edit plus new `tests/helpers/scene3d-blank-map.js` and `tests/unit/scene3d-ribbon-flat-field-placement.test.js`. `after/F1-placement/` holds manifests and shots, but **`report.json` was mid-write and there is NO `F1-placement-impl.md`.** | **RESTARTED FRESH 2026-09-12** — brief §1 of `ROUND3-RESUME-BRIEFS.md`. **Verify-or-revert `32ec6ef0` FIRST.** Prototype B under its **five ruled conditions** (`F1-placement-plan.md`). |
| **U9b-2 + U5b-4** (one two-commit run) | fill-collapse-3 | **WIP `d00ec210`, UNVERIFIED** — **only** `tests/integration/scene3d-shadow-writeback.test.js`; **commit 1 was never made**, and there is no report. | **RESTARTED FRESH 2026-09-12** — brief §2 of `ROUND3-RESUME-BRIEFS.md`. **Verify-or-revert `d00ec210` FIRST.** Scope for both units is in `LEDGER.md` rows 10a and 11a. |
| ~~**U7-2 review**~~ | fill-collapse-3 | ✅ **DONE 2026-09-12 — no longer in flight.** | **CLOSED: reviewer ACCEPT** (`U7-2-review.md`), all seven derived conditions pass. The restart ran brief §3 of `ROUND3-RESUME-BRIEFS.md` pinned `2b189b5f..49a5ef88`. ⚠ **No labelled U7-2 flag list had ever been written into the ledger** (row 11 carried four unlabelled claims); the secretary derived **seven** conditions, and two of them — the 576-vs-555 sum and the `penPitchMatch`/`penFacing` duplicate — were new findings, both resolved in the unit's favour. |

⚠ **Both WIP commits are unverified — nothing may be built on top until each is verified or reverted.** And
once again **the two units that died mid-step are exactly the two with no report on disk**: the reports are
what make a from-scratch restart possible, and these two have none.

## 3. RESUME ORDER / **ROUND-3 STOP LINE**, PER LANE

> 🛑 **STOP LINE FOR ROUND 3, ruled 2026-09-13. The round closes when the ORIGINAL round-3 queue is
> landed-or-measured — and nothing else is allowed to extend it.**
>
> **The FOUR that must finish** (W-35b closed MEASURED on 2026-09-13 — no unit)**:** **T2 iteration 2** (in flight) ·
> **F1-width-bar** (brief §4 of `ROUND3-RESUME-BRIEFS.md`) · **T3** · **W-31b** (PLAN-READY, one bounded M1
> attempt then Rank 3). **All five are on lane `fill-audit-a3`; every other lane is closed.**
>
> **Units filed SINCE the resume that are small guards or measurements — `F1-count`, `W-36e`, and whatever
> the tone-vacuity scout turns up — run ONLY if lane a3 is idle waiting on a review. Otherwise they carry to
> round 4 WITH THEIR BRIEFS**, which is the point of writing the briefs now.
> **`W-07b` and the unscheduled list stay unscheduled.** **Then merge per the checklist. Never push.**
>
> ⚠ **The stop line exists because round 3 has filed NINE new units since the resume while closing the
> original queue — every one of them justified, and that is exactly how a round stops converging.** The rule
> that keeps it honest: **a finding becomes a brief, not necessarily a unit.**

**Lanes are the five `-3` worktrees off `main` `426cc5e4` — they are LIVE, not historical.** Nothing is
frozen: all nine §4 decisions are answered.

| lane / worktree | order |
|---|---|
| **`fill-audit-a3`** (:8475) | ~~F1-placement~~ **MEASURED at `cd541f87` 2026-09-12, review in flight** → ~~**F1-erode**~~ **DONE/FU at `e2c3ca85`, review in flight** (lane now 42/44 + 36/36; the 2 remaining reds are F1-trochoid's by design) → **F1-width-bar** (NEW, row 2b — tests-only ribbon-width instrument, measure-first) → *(F1-weight, only if Jay answers 10 = B)* → *(orig. row 2a note:* — Opus planner running; **nine guards stay red until it lands, they were NOT re-pinned**. ✅ **RULED: it JUMPS THE QUEUE — it starts as soon as its plan is PLAN-READY and T4b has committed, ahead of T2 iteration 2, T3 and any further tests-only work**) → **F1-amp** → ~~**W-36d**~~ **DONE/FU at `dcc91872`, reviewer ACCEPT-WITH-FOLLOWUPS → W-36e (row 4b, tests-only, LOW priority, behind F1-erode AND F1-amp; the d=5 scout came back **ARTIFACT** (`W-36d-d5-scout.md`) — **its bar must be ink/budget-based or restricted to d ≥ 10**; ruled a real queued unit, NOT a PRH entry)** → ~~**T4b**~~ **DONE/FU at `7f805654`** (floor 1400 + ±10 % band, envelope measured first) → ~~**T4c**~~ **CLOSED MEASURED at `6e1ed52f`** — **G4 TRIPS on the slab mutation (7.728 ≤ 5.816 expected, at d=1), so the slab half was already gated and NO new bar was written** → ~~**F1-amp**~~ **DONE/FU at `3bc61c32`, review in flight** → **T2 iteration 2 IN FLIGHT at `3bc61c32`** → 🛑 ~~**T2-2**~~ **REJECTED and REVERTED at `179d9218`** → **T2-3 PLAN-READY** (row 5a — **the wedge is TICK GEOMETRY, not the curve**; Rank 1 stagger prototyped on both rigs, 8–17× below both rejected trees) → ~~**T2-3**~~ **DONE/FU at `81925ee8`, review in flight — orchestrator picture POSITIVE** → ~~**F1-width-bar-b**~~ **DONE/FU VERIFIED at `8780e97c`** → ~~**T3**~~ **DONE at `64b160a0`, review in flight (picture flag open)** → ~~**W-31b**~~ **MEASURED-with-guards VERIFIED at `c28b3490`** → **T2-3b IN FLIGHT at `c28b3490`** (two commits: self-test goldens, then bar + Rank 1) — **the last stop-line unit** → **T2-3b** (row 5a-1 — ONE unit: golden-pin self-test replacement + contour moiré fix with its bar; **Opus planner running, mechanism UNKNOWN after the scout refuted the stagger-sequence hypothesis**). Earlier: ~~**F1-width-bar**~~ **DONE/FU at `42acff7b`** (row 2b — a FLOOR on mean `CLS_RIBBON` width; the −0.98/−1.10 discrepancy resolved to the reviewer's number) → **T2-3 IN FLIGHT at `42acff7b`** (instrument first) → **T3** → **W-31b** → **T3** → **W-31b** (row 7, **PLAN-READY**: one bounded M1 attempt, ≤2 iterations, else ship Rank 3 as MEASURED-with-guards). ✅ **W-35b is CLOSED MEASURED — no unit — so the stop line's five are now FOUR.** ; **lane a3 free for F1-erode now** → *(F1-erode inserts here by ruling)* → **T2 iteration 2** (`T2-review.md` is the brief) → **T3** → **W-31b** (needs a planner) → **W-35b** (likely needs a planner) |
| **`fill-collapse-3`** (:8482) | ✅ **IDLE at `eb9707a8` — every queued unit closed 2026-09-12.** ~~U7-2 review~~ ACCEPT · ~~U9b-2 `e10306e9`~~ + ~~U5b-4 `eb9707a8`~~ DONE/FU. ✅ **CLOSED FOR ROUND 3 at `28cc745d`.** U7-2b `7d1a81ca` + U5b-5 `28cc745d`, **reviewer ACCEPT-WITH-FOLLOWUPS — both units independently reproduced, collapse file 121/121 MEASURED (1045.63 s, a new Tier-1 worst case), CSS specificity audited (0,2,0, uncontested), ellipsis provenance confirmed BY ABLATION, e2e green.** **Nothing is carried into the merge except two non-blocking notes** (the CSS-source-only test would pass vacuously on a class rename; the tightened regexes have zero slack for future copy edits). Previously: **ONE polish run at `eb9707a8`** — a single Sonnet implementer landing **U7-2b** (tighten the two `.*` caveat regexes **+ the shadow-writeback vacuity comment, folded in**) and **U5b-5** (ctxbar flyout select label truncation, row 11c), **one commit per item**, so **the lane closes for round 3 with nothing carried into the merge.** **U10–U12 remain W-26-blocked and lossy.** |
| **`fill-audit-3`** (:8476) | **IDLE** — W-38 and W-38b both closed; nothing on its files is ready |
| **MAIN** (`scripts/audit/` only) | ✅ **GH-2 DONE and COMMITTED at `6ffaf9c6`** — the `--rig addLayer` tier ships and is proven to reach the defect. ⚠ **Main is therefore `6ffaf9c6`, one past `549b9ba9`: the merge plan must not assume main is unchanged since the pause.** Still owed at merge: **record which rig each `after/<W-id>/` was shot on** (item 27) |
| **`fill-audit-d3`** (:8481) | **IDLE** — W-37 closed MEASURED; the W-29 stub-path family is unscheduled |
| **`handoff-c3`** (:8470) | ~~HLR sub-pen precision~~ **CLOSED MEASURED/PARKED 2026-09-12, clean at `426cc5e4`** → **IDLE by design** → its real work is **F1-amp**, now serialized behind **both** F1-placement and **F1-erode** on fill-audit-a3, and it may want this lane when it comes |
| **unscheduled** | W-33's fitter-limitation follow-up (distinct from W-37, proven) · W-32 Rank 4 (true-silhouette border — would also satisfy W-35; §4 decision 9 closed it *for now*) · W-07b · `insetMultiPolygon` ladder · the W-29 degenerate-stub family |

**Merge when the round-3 queue is exhausted** — and the **round-2 merge checklist still has open items**,
including the **`git show HEAD:` idiom sweep** (item 23), which matters because `scene3d-slice-end-overlap.test.js`
(W-35) carries it and is **already merged**.

## 4. DECISIONS — the original NINE are ANSWERED; **10, 11, 12 AND 13 ARE NEW AND OPEN** (2026-09-12 / 13 / 15)

**Every frozen item is now unfrozen.** Recorded verbatim as Jay gave them; the letter is his choice.

> **This section is the authoritative record.** Jay answered **in chat**; the answers are mirrored in the
> decisions page's db store, but **the Claude app viewer cannot save**, so the page is not the source of
> truth. Reconcile any later reading of the page against this section, not the reverse.

1. **W-06 max density → B.** T4 **restores a dark end** — sphere Density 220 **≥ 1500 mm ink, with no slab
   defect**. *The lost byte-identity is signed off; the ink collapse is not.* → **T4 proceeds** (the
   W-05b/W-06b plan's U4: band-width cap + `bandMax`, carrying the max sign-off report).
2. **U6 `penStipple` mark class → A.** Pen Stipple **moves from `'dot'` to `'hatch'`**; **U6 proceeds**, and
   its **caveat text must say why it moved** — a visible picker re-categorisation the user should not have to
   infer.
3. **Ground-plane density → A.** The **~2.5× denser ground at defaults is CONFIRMED** (ink 12164 → 30215 mm).
   **The frozen item closes; no unit.**
4. **F1 "which white did you mean?" → A.** The **41.7 × 6.6 mm bare strip on the lower front torus IS the
   streak.** → **F1-placement proceeds** (Prototype B, under its five ruled conditions), **then F1-amp.**
5. **W-27c-0a-2 → A.** The merged strokes are **within one pen width — CLOSED as MEASURED. No further
   culling**; the crowding cull stays parked, and sub-bars **(d1) max inscribed disc ≤ 0.9 mm** and
   **(d2) merged area** stand as re-oracled.
6. **W-36 crosshatch budget → C.** **EACH family carries the single-family hatch count (≈2× ink)** — and it
   **needs a NEW anti-saturation cap** so Density 220 does not go solid. → new unit **W-36c**: re-derive
   `CROSS_PAIR_BUDGET`, **P3 and P5** for per-family = hatch count; **keep P1/P2/P4/P6 and the W-26
   gap-jump**; **define the new cap by measurement**, not by analogy; evidence on all four primitives plus
   Jay's own cell. **T2 iteration 2 inherits from it.**
7. **F-14 graded remainder → B.** A **PRODUCT UNIT**: expose **`FACET_MIN_RULINGS`** as a per-style
   **"minimum facet rulings"** control, **default 3 and byte-identical there** — `scene3d.js` faceted path +
   `params.js` + context-bar/panel, with the **full docs contract**. → new id **W-38** (alias F-14b).
8. **W-34 Fix C → A.** **Leave the cone apex as true geometry. CLOSED.** The corner is 76.4° emitted against
   76.4° analytic; Fix A and Fix B already shipped.
9. **W-32 → A.** **CLOSED for now.** Rank 4 (refining the fill border to the true silhouette, which would
   also satisfy W-35) **stays filed, unscheduled.**
   ⏳ **AMENDED 2026-09-13 — REOPENED FOR YOUR ANSWER, because the measurement you closed it on was incomplete.**
   W-35b's planner, sweeping 20 primitive × mapper cells, found **W-32's overshoot past the inscribed border is
   WORSE than W-32 recorded — because W-32 never measured the ELLIPSOID.** Measured now: **`ellipsoid · contour · a`
   0.67 pen, `ellipsoid · crosshatch · a` 0.71 pen, `ellipsoid · spiral · a` 0.69 pen — worst 0.72 pen**, against
   sphere/cone **0.52** and cylinder **0.12**. **You closed W-32 on a 0.50-pen bar; the real worst case is ~44 %
   over it.** **Mechanism: overshoot rises with ruling count — more ends sample the extremes — so the primitive with
   the most rulings is worst, and W-32's primitive set simply did not include it.**
   **(A)** **ACCEPT and leave W-32 closed** — 0.72 pen is still under one pen width, and the earlier reasoning
   ("under a pen, not visible") stretches to cover it.
   **(B)** **REOPEN W-32 Rank 4** — refine the fill border to the true silhouette, which **would also have satisfied
   W-35**. **A conditional design is already written (`W-35b-plan.md` §4), so this starts from a design, not a planner.**

13. ⏳ **NEW AND OPEN — fixing the banding costs tick-length range. Both are yours to weigh.**
    **Raised 2026-09-15 by T2-3b's plan, and the diagnosis is the good news: the diagonal banding you would have seen on the
    contour cells is NOT a texture artefact — it is a SECOND, UNASKED TONE TRANSFER.** One branch of the solver clamps a value
    without re-solving its partner, so **delivered ink falls up to 25 % short of what the tone asked for across the midtone —
    and that shortfall prints ALONG THE ISOPHOTES, which is what the bands are.** It is a real tone error, not a look.
    ⚠ **The fix is three lines and it works — band contrast down 13–66 % on 11 of 12 cells — but it COSTS TICK-LENGTH RANGE:
    the long-to-short ratio goes 3.0–4.3× → 2.3–3.2×, still monotone everywhere.** **And it is a genuine frontier, not a tuning
    miss: every setting that keeps the old ≥3× range DOUBLES the banding on hatch cells.**
    **(A)** **ACCEPT the shipped fix** — the tone error is corrected, dashes still shorten toward the light by 2.3–3.2×, and the
    bar is re-derived to 2.30 with its proof. *(The 3.0 was never your number — it was a planner's proxy.)*
    **(B)** **FUND T2-3c** — the one measured route to both: halve the row pitch. **It touches the row-pitch code, which sits
    upstream of every mark law and of the crosshatch cap, the cell-shape ceiling and the band passes — its own plan, its own sweep.**

12. ⏳ **NEW AND OPEN — your dashes are bands, not strokes, and at Density 1 that reads as tiles.**
    **Raised 2026-09-15 by T3's review, and it traces back to a ruling of your own.** **Decision 1 = B asked for the dark end
    restored** — and T4 delivered it with a **band-pass mechanism**: each mark is drawn as several parallel passes so it can carry
    more ink. **At Density 220 that is exactly what you asked for. At Density 1 the same mechanism makes each "dash" a bundle of
    ~6–8 parallel passes spanning the row — so it reads as a thick TILE rather than a single-stroke dash.**
    **See `docs/3d-audit/fill-audit/after/T3/` — sphere / hatch / mkDashRamp / low.**
    ⚠ **It is NOT T3's doing: T3 fixed the low end (7 → 46 dashes) and REDUCED the bundling on the way past (pens per mark
    5.71 → 3.93).** The unit that surfaced it also improved it.
    **(A)** **ACCEPT** — the band mechanism is what restored the dark end, and a thicker mark at the sparse end is the price.
    **(B)** **T3b, a new unit** — draw single-pass dashes below some density threshold, keeping the band mechanism where it earns
    its keep. **The cost is a new threshold to justify and another mode boundary in a file that already has several.**

11. ⏳ **NEW AND OPEN — the anti-saturation cap you asked for has a side effect you did not ask for.**
    **Raised 2026-09-13 by W-31b's planner, which found it while chasing a different defect — and it is disclosed here
    because you asked for the cap, not for its consequence.** **Decision 6 = C gave crosshatch each family the
    single-family hatch count plus a NEW anti-saturation cap so Density 220 would not go solid. W-36c delivered exactly
    that, it was reviewed and accepted, and it stays.** ⚠ **But the cap BINDS at d=220 — which means the tone law has
    NO AUTHORITY over crosshatch cell size there. Turning the tone dial at maximum density changes nothing.** *(A read-only scout swept the suite for existing tests
    made vacuous by this: **there are none — no test claims tone preservation at d=220 on crosshatch**, so nothing in
    the suite is currently lying to us. W-31b's new C7 guard fills a real gap rather than replacing a false pass.)*
    **The question:**
    **(A)** **ACCEPT** — this is inherent to "don't go solid": at maximum density there is no room left for tone to
    act, and that is the trade the cap exists to make. Nothing further is built.
    **(B)** **RETUNE THE CAP'S ONSET so some tone authority survives at max density** — a new unit, and it would have to
    show it does not reintroduce the saturation the cap was built to prevent (the mutation number is on record:
    naive parity gives cylinder d=220 = 9136.8 mm, +93.5 %).
    **Either way a CHANGELOG line discloses the consequence** — it is on the merge checklist.

10. 🟢 **READY FOR YOU — THE EVIDENCE PACKET IS COMPLETE. F1 ribbon WEIGHT: is the thinner ribbon acceptable as the fix for the streak?**
    **Raised 2026-09-12 from the orchestrator's own before/after look, not from any test.** On
    **torus / hatch / onePenDown / d=50**, Prototype B changed the inner and lower-front bands **from bold
    filled ribbons to thin wireframe zigzags.** **The deep bare strip you named IS gone — but the band now
    reads much lighter.** Evidence: `docs/3d-audit/fill-audit/after/F1-placement/orchestrator-onePenDown-med-before-after.png`
    and `orchestrator-interlockWeave-med-before-after.png`.
    ⚠ **No test caught this and no test could: `onePenDown` has ZERO guard failures and `erodeEmpty` 0, so it
    is NOT the erode fallback that F1-erode owns — and NO existing guard measures ribbon WIDTH at all.** That is
    the ninth oracle-instrument gap of the audit, found by eye rather than by a bar.
    **The question:**
    **(A)** the thinner, evenly-placed ribbon is **acceptable** as the fix — the streak is what mattered, ship it; or
    **(B)** the fix must **keep the pre-fix ribbon weight while removing the strip** — which makes ribbon weight
    **F1-erode / F1-amp scope** and widens both units.
    🔻 **SHARPENED 2026-09-13, NOW THAT THE WHOLE F1 CHAIN HAS LANDED AND BEEN REVIEWED. The question is no longer "is this the
    erosion or the placement" — it is a straight preference, and the hopeful answer has been falsified by measurement.**
    **What the chain (placement → erode → amp) actually delivered:** the streak is gone, the erode-fallback centreline is gone, and
    **the weave now runs continuously around the whole torus including the highlight band that previously straightened or went bare.**
    **What it cost: the wave laws read THINNER than pre-fix — `onePenDown` most.** ⚠ **And F1-amp, the unit everyone expected to put
    the weight back, did the opposite: it thins 3 of 4 laws FURTHER** (`interlockWeave` −2.50 %, `trochoidLoop` −0.98 %,
    `onePenDown` −4.16 %, only `amplitudeOnly` +1.52 % — and on the gallery rig `onePenDown` is **−7.99 %**). **Its own implementer
    says plainly that its amplitude floor is "not the lever", and its reviewer confirmed it.**
    **So the two options are now concrete:**
    **(A) ACCEPT the thinner, even style** — the streak is fixed, the weave is continuous, and the lighter weight is the cost. Nothing
    further is built.
    **(B) RESTORE THE WEIGHT — and that needs a NEW UNIT (F1-weight), because NO SHIPPED LEVER DOES IT TODAY.** The lever is the
    weight field; neither the placement reserve nor the amplitude floor touches it. F1-width-bar (row 2b) would be its instrument.
    **Numbers to decide on: `F1-amp-review.md` condition 3 — on BOTH rigs. Pictures: `after/F1-amp/`, both rigs.**
    ✅ **PACKET COMPLETE 2026-09-13 — nothing further is being measured before you answer.** It contains:
    **(a) pictures on BOTH rigs** (`after/F1-amp/`, 12 cells × 2, plus `after/F1-erode/`'s runtime crops);
    **(b) the per-law ink and width numbers** (`F1-amp-review.md` condition 3, independently reproduced);
    **(c) the measured floors** from F1-width-bar `42acff7b` — interlockWeave **0.8316 mm**, trochoidLoop
    **0.7030 mm**, onePenDown **0.7041 mm** — so whichever way you answer, **there is now a guard that will
    notice if a ribbon gets thinner again.** *(One honest gap inside the packet, not blocking your answer:
    width on the `create` rig is unmeasured. A suspected second gap — screenshots shot at a different fill angle —
    was chased down and disproved: the pictures ARE the measured fixture.)*
    ⚠ **Include in the packet: `onePenDown` is −4.16 % on the unit rig but −7.99 % on the `create`/gallery rig — the rig
    your own screenshots use — right at the ±8 % bound.** *(The separate F1-amp-b unit was folded into this packet rather
    than run: the measurement already existed, and "is this acceptable" is this same question. Still owed inside the packet:
    the other three laws on the create rig.)*
    ✅ **ANSWERED IN PART BY MEASUREMENT — the F1-erode planner settled the MECHANISM, so what is left for you is purely a
    preference, not a diagnosis.** §7, three independent proofs: **this is PLACEMENT, not the erosion fallback.** `onePenDown`
    fires **zero** erosion refusals on both trees; the Rank-1 erosion fix leaves it **md5 byte-identical** (ink identical to
    0.01 mm); and the width distribution shifts **modestly, with no collapse to centreline.** `wvPlaceCov` changes the coverage
    *reserve* — which rulings are kept — **it does not set ribbon width**; under even screen placement the kept rulings sit at more
    representative positions instead of clumping, so the widest ribbons stop being quite so wide. **Total ruling length is unchanged
    (+0.1 %): the ink is redistributed, not removed** — and the erosion's fixed 0.51 mm bite doubles the visual consequence.
    **This is the mechanism working as designed, at a strength you have not yet signed off on.**
    **The exact trade you are being offered on `onePenDown`:** deep-blank (> 2 mm) **4.00 → 0.00 mm²** and largest blank cluster
    **39.04 → 21.27 mm²**, paid for with **−3.5 % total ink, −9.6 % interior fill ink, −4.3 % mean ribbon width** — the form is
    evenly covered but the ribbons read lighter. **Nothing here is broken; it is a legibility/weight preference.**
    ⚠ **And if you want the old boldness back WITH the new placement, the lever is the weight field (or F1-amp's amplitude floor)
    — NOT the erosion and NOT the placement reserve. That is a new unit, not a revert.**
    ✅ **How this reaches you: batched.** The orchestrator will put it in the end-of-session report **with the two PNGs
    AND the F1-erode planner's measured ribbon widths**, so you answer once with numbers in hand rather than twice.
    ✅ **Nothing is blocked while you decide.** **F1-erode starts anyway, scoped STRICTLY to the `erodeEmpty` fallback and
    the nine reds — a centreline where a ribbon was is a defect under BOTH answers.** If you answer **B**, ribbon weight
    becomes a **separate unit, F1-weight, after it**; F1-erode is not re-scoped mid-flight. And **F1-width-bar** (row 2b,
    tests-only, measure-first) is filed **either way** — under **B** it is F1-weight's acceptance instrument, under **A** it
    is the guard that stops the next unit thinning a ribbon unnoticed.
    **Until you answer, F1 cannot close** — and the reviewer's own standing follow-up says the same from the other side:
    **F1 as a whole is not closed until F1-amp lands AND you have looked.**

**At the pause, five of the six have landed or are in flight: 1 → T4 DONE, 2 → U6 DONE, 6 → W-36c DONE (delivered), 7 → W-38 DONE, 4 → F1-placement WIP; F1-amp is the only one not yet started.** Net effect on round 3: six decisions start work (1 → T4, 2 → U6, 4 → F1-placement + F1-amp, 6 → W-36c,
7 → W-38), **three close items outright** (3, 5, 8, plus 9 for now). Nothing in round 3 is frozen any more.

## 5. USER-REPORTED DEFECTS

| report | defect | status |
|---|---|---|
| ladder-gap rule | Sturmian doubling on flat-tone surfaces | **FIXED** — gap jump 2.00 → **1.03–1.17**; crosshatch regression found and fixed in W-26b (coverage 0.91 → legible grid). **P0 closed.** |
| 8.png | mkTick leaves un-ticked bands, hard cone edge | **STILL PARTIAL — and now REJECTED TWICE.** T1 + T1b landed. **T2 was rejected and reverted (`94cca882`); T2 iteration 2 ran on 2026-09-13, was rejected on the same grounds, and was reverted (`179d9218`).** ⚠ **The second rejection is better evidenced than the first: bare area outside the highlight increases on ALL SIX cells (1.85×–9.25×), and the unit's own new tests still pass when the curve is mutated back to the literal rejected smoothstep.** **T2-3 will be planned with a prototyped mechanism and a bare-wedge bar in the same unit.** ⚠ **Two other things you should know are separately measured and NOT fixed by any of this: the un-ticked bands at Density 220 (coverage 0.67–0.82 vs 0.91–0.99) are a `MIN_MARK_MM` limit, not a curve defect → T2-4; and the hard cone edge is T3's.** Earlier reading: The cone hard edge is the `MK_ROW_COV` scaffold — **T3's**, also not started. Detail:  T1 landed the chart-walked mark and T1b the plot-safety guard, but **variable tick length is not shipped**: T2's smoothstep response created hard ink plateaus with enlarged bare wedges. **T2 iteration 2 carries it into round 3**, with a per-cell acceptance table on all six combinations. The cone hard edge remains the `MK_ROW_COV` scaffold, which is **T3's**. Superseded detail: | **PARTIAL** — T1 landed the chart-walked mark (refusal 0.61 → 0.007); variable length is T2. The brief's "coverage hole" premise was wrong: coverage was already 0.96–1.00. Cone hard edge = pre-existing `MK_ROW_COV` scaffold, T3's. |
| 9.png | torus ticks read as straight-spoke fans | **FIXED in kind** — ticks curve along the family (sagitta 0.000 → 0.127 mm), bulk texture reads as one coherent weave. A mid-tick kink was found and fixed; a min-spacing tail regression → T1b. |
| 10.png | mkDashRamp draws ONE dash at d=1 | **LOW END STILL OPEN (T3, not started) — but the MAX end is FIXED: T4 restored the dark end to 1501.1 mm on Jay's own named cell (decision 1 = B), with no slab.** Detail:  **OPEN** — T3. Measured 5 dashes at d=1 (bar ≥40), count non-monotone `5,2,9,56,416`. |
| 11.png | torus contourSlice angled points + micro-gaps | **micro-gaps FIXED** (107 → 46 paths); **"angled points" = ink merging** — improved, not fixed (blob 3.35 → 2.10 mm vs 0.9). Iter-4 queued. |
| 12.png | buckyball contourSlice ring with an open end | **FIXED** — open rings 6 → 0, plane counts unchanged. |
| 13 (2026-09-06) | crosshatch cells uneven — *"diamond/square gaps vs rectangular gaps"* | **STILL MEASURED — ceiling pinned AND NOW GUARDED, but NOT FIXED, and after W-31b (`c28b3490`) that is the honest final word for this round.** ⚠ **Three attempts have now failed to find a placement mechanism** — W-31's Rank 1, W-31's Rank 2 (prototyped and rejected, never retry), and W-31b's M1 (discarded after two iterations against its closure conditions) — **and two of those ranks are marked never-retry, so the search space is genuinely narrower rather than merely untried.** **What shipped instead are two mutation-proved guards (C7 tone-authority at d=50, C8 local plot-safety p01): the cells cannot silently get WORSE, but they are not yet even.** Earlier: **MEASURED, ceiling pinned — the fix needs a new mechanism (W-31b).** Confirmed a real PLACEMENT defect with **tone OFF**: cell aspect ramps **0.60 → 1.75** across a cone, C1 failing on 4 of 5 primitives. Root cause is a **ruling-MEAN metric spent as one scalar step**, i.e. the P0 ladder-gap rule generalised to local geometry. The Rank-1 spike **failed its gate**, so a non-regression ceiling shipped and nothing else. **W-36 is proven not to be the cause.** Superseded detail: | 13-old |  — *"diamond/square gaps vs rectangular gaps… are lines not being evenly spaced?"* | **OPEN → W-31.** Generalises the P0 rule to crosshatch **cell shape**: both families evenly spaced except where tone demands. Re-measure on `0930cb2d` — W-26b-1 changed the crossing family's share. |
| 14 | *"Some of these lines are breaking out beyond the border."* + *"non-curved angles"* | **BOTH ANSWERED.** **W-33 FIXED** the non-curved angles — contour FILL rulings now ≤ 8° in device space (C1 31.24°/38.35° → ≤8; C2 18.46–23.25° → ≤8), after finding refinement ran *before* the seam join where the join vertex is exempt from the turn check. **W-32 is MEASURED, no code**: in-app overshoot is **0.50 pen against a 0.50-pen bar with zero endpoints over** — what you saw was the gallery rig at deserialization `detail` 16. The true-silhouette option is **§4 decision 9**. Superseded detail: | **OPEN → W-32** (silhouette overshoot; RGR ≤ 0.5 pen — note `scene3d-fill-boundary-ends` passed 41/41, so establish whether it measures overshoot at all) and **W-33** (the contour-rounding rule extends to contour FILL rulings). |
| 15 (W-35) | *"stairstepping where line segments end … perhaps having a parameter we can control"* | **DELIVERED — awaiting Jay's look at the control.** `sliceEndOverlap` ships at −2..8, **default 0 = byte-identical**, so nothing changes until he moves it. The mechanism turned out to be a **facet-quantised front/back cut, not a trim**. Evidence: `after/W-35/bespoke/` (k = −2/0/4/8 sweeps + the Style tab). |
| 15 | *"angles in this curved shape that should not be there"* + *"stairstepping where line segments end"* | **OPEN → W-34** (extends W-27c item (b), bar ≤ 8°, open-polyline-aware metric mandatory) and **W-35** (product request: a user-controllable end-overlap / edge-fidelity param). |
| 16 (2026-09-06 18:31) | crosshatch renders ONE family | **FIXED TWICE — W-36 restored the crossing family, then W-36c delivered your decision 6 = C: EACH family now carries the single-family hatch count, under a new measured anti-saturation cap. Your own cell is a full even crosshatch.** Earlier detail:  Gap ratio B:A **5.4–31.2× → 0.814–1.061**; your own cell went **A 17 / B 3 → A 9 / B 11**. But the review found the pre-audit design **already spent ONE shared budget across both families** (sphere d=50 was A 15 / B 11 against a hatch count of 24), so *"each family carries the hatch count"* was never the shipped convention — hence **§4 decision 6**, a three-way choice. Superseded detail: | — *"make crosshatch have the same number of crosshatch lines as it has hatch lines unless … variation is needed for highlight/shadow. This seems off."* | **OPEN → W-36, P1.** Sphere/ladder/fine-rungs/d=50 shows ~22 bands and **no** crossing family; montage counts cylinder ≈ 30 vs ≈ 5, ellipsoid ≈ 25 vs ≈ 4, T1 sphere ≈ 24 vs ≈ 8, against v1.3.98's ≈ 22 vs ≈ 20 — **a regression between v1.3.98 and the merge**. Prime suspect `CROSS_SHARE_BASE = 0.1` (`surface-fill.js:4652`) → crossing coverage 10% of family A's at ratio 1. Lane fill-audit-a2, before W-31 |
| "not close to zero yet" (F1) | torus ribbon streaks | **THE WHOLE CHAIN HAS LANDED AND BEEN REVIEWED — placement `cd541f87` (MEASURED), erode `e2c3ca85` (DONE/FU), amp `3bc61c32` (DONE/FU) — AND IT NEEDS YOUR EYE, NOT ANOTHER TEST. The streak is GONE (deep-blank 3.02/4.00/1.79 → 0.03/0.00/0.00 mm²), the erode-fallback centreline is gone, and the weave now runs continuously around the whole torus including the highlight band that previously straightened or went bare. The cost: the wave laws read THINNER than pre-fix, `onePenDown` most — and F1-amp, the unit expected to put the weight back, thinned them further instead (its floor is "not the lever"). → §4 DECISION 10 is the open question: accept the thinner even style (A), or build F1-weight to restore ribbon weight under the new placement (B), which no shipped lever does today.** Superseded: **HALF DELIVERED, MEASURED, review in flight — and one new defect it exposed. Your decision 4 = A confirmed the 41.7 × 6.6 mm lower-front torus strip IS the streak. F1-placement shipped at `cd541f87`: the DEEP blank is gone — >2 mm blank area 3.02 / 4.00 / 1.79 → 0.03 / 0.00 / 0.00 mm². The band is narrower, not closed:** placement is only half the mechanism, because the three affected laws never got Round 6's amplitude floor, so a plain thin ruling in the highlight remains until **F1-amp**. ⚠ **And shipping it exposed a latent erosion bug — one stretch now draws a single thin centreline instead of its full ribbon (visible in the same lower-front region) → new unit F1-erode, which runs BEFORE F1-amp.** **Not closed, and it needs your eye on the re-shot `torus__hatch__trochoidLoop__med` pair when the pair is finished.** Earlier detail:  **OPEN, mechanism found** — 62.63 mm² bare strip, 30× A3's whole residue; Prototype B ruled, deep blank 11.89 → **0.28 mm²**. |

## 6. MERGE STATUS — ROUND 3 IS **NOT** MERGED

**Nothing from round 3 is on `main`.** Lane HEADs, updated live as the session resumed (2026-09-12):

| lane | HEAD | note |
|---|---|---|
| `fill-audit-a3` | **`dcc91872`** | **ACTIVE** — F1-placement `cd541f87` (MEASURED, review in flight) + W-36d `dcc91872` (DONE/FU). T4b in flight on top; **F1-erode jumps the queue after it.** ⚠ **Nine tests red by design** — f1b-streaks 36/44, wall-coverage 35/36, **owned by F1-erode, NOT re-pinned** |
| `fill-collapse-3` | **`28cc745d`** | ✅ **CLOSED FOR ROUND 3 — every unit landed and reviewed.** U9b-2 `e10306e9` + U5b-4 `eb9707a8` + U7-2b `7d1a81ca` + U5b-5 `28cc745d`, all ACCEPT / ACCEPT-WITH-FOLLOWUPS. ⚠ **U5b-5 is this audit's first CSS change — the merge's `test:ci` must include e2e AND visual** (checklist item 26). U10–U12 remain W-26-blocked and lossy |
| `fill-audit-3` | **`141ed0b5`** | clean, IDLE — W-38 + W-38b |
| `fill-audit-d3` | **`426cc5e4`** | clean, IDLE, never written to (W-37 closed MEASURED) |
| `handoff-c3` | **`426cc5e4`** | clean, IDLE — the HLR sub-pen unit closed MEASURED/PARKED with no commit. Its real work is F1-amp, now behind **both** F1-placement and F1-erode |

> ⚠ **Historical, for the record — these were the HEADs at Jay's pause, before the restart:**
> `fill-audit-a3` `32ec6ef0` (unverified WIP on `8adfd5af`) · `fill-collapse-3` `d00ec210` (unverified WIP
> on `49a5ef88`) · the other three as above. **Both WIP checkpoints were verified and adopted, not reverted.**

⚠ **MAIN HAS MOVED SINCE THE PAUSE: it is now `6ffaf9c6`** — `426cc5e4` (round 2, v1.4.1) + the pause-point docs `549b9ba9` + **GH-2 `6ffaf9c6`**, the first round-3 work committed on main rather than on a lane (`scripts/audit/` is the orchestrator-owned surface). Plus uncommitted docs. **Main remains 44+ ahead of `origin/main` and NOT pushed.** **The round-2 merge checklist in `LEDGER.md` still has open
items** that belong to whoever merges round 3, the `git show HEAD:` sweep among them.

## 5b. ROUND-2 MERGE — DONE (local only)

**Local `main` is `9cf09b39`** — the merge of `3d-scene/integrate-r2 @4421d514`, **v1.4.1**, with the docs
commit `1e504ce6` beneath it (`MERGE-impl-r2.md`). Five lanes merged `--no-ff`; **merge, not rebase**.
Merge review **ACCEPT** (`MERGE-review-r2.md`, pinned `a7d39601..4421d514`) — all claims reproduced, safe to
fast-forward, and it was. `package.json` reads **1.4.1**, tree clean, **44 ahead of `origin/main`. NOT pushed.**

- **The five round-2 lanes are now HISTORICAL — `fill-audit-a2 @94cca882`, `fill-collapse-2 @9aad87b8`,
  `fill-audit-d2 @392696ac`, `fill-audit-2 @79b626d2`, `handoff-c2 @ed778940`. Nobody works in them; read them
  as provenance. The next session branches off `main`.**
- **The gallery rebuild is RUNNING NOW on `main`, as the last step** — W-32's creation-defaults re-shoot,
  W-28b's taller-listbox re-shoot, then `scene3d-assemble.js` → `scene3d-audit-findings.js` →
  `scene3d-before-after.js`. It also picks up the two evidence dirs known stale (W-30c's two torus "after"
  frames, superseded by W-30d on the same lane; W-28b's listbox at option count 36 → 34 after the U7/U8 fold).
  The gallery was last built **2026-09-05 20:11** and predates every round-2 unit; expect the 47 unexplained
  byte-identical pairs to resolve.

- **`test:ci` ZERO failures** on the integrated tree: unit **5199**, integration **1973**, e2e **62**,
  visual **99**, perf **10**. Version **1.4.1** synced; CHANGELOG, README and `plans.md` landed.
- **The three-author collapse test AUTO-MERGED (95/95)** — the round's most-feared hazard resolved itself,
  exactly as the U9 reviewer's `+19`-shift analysis predicted. **Only ONE pin moved in the entire merge**
  (W-33's `torus + contour + ladder @ d=50` golden, re-measured on the merged source as checklist item 10
  required). Two textual conflicts, one semantic.
- **The four-day-old "contourSlice x-ray" unknown is CLOSED GREEN** (17/17, 38/38) — it never existed on the
  merged tree, which is why deferring it to an idle machine after the rebase was the right call.
- **THE MERGE FOUND AND FIXED A LIVE PRODUCT DEFECT — round 2's equivalent of round 1's X-ray regression, and
  again it was the one behaviour no lane could test.** Checklist item 7: a `.vectura` saved *before* the
  collapse carries a raw folded `toneLaw` and **no sibling collapse key**, and the ctxbar Style flyout computed
  `effectiveLaw` off the **un-seeded** bag — so every descriptor looked default, the bare survivor came back,
  and **the folded law's own measured caveat did not render**, violating the standing ruling and stop
  condition 4. The docked panel already did it right (`scene3d-panel.js:716` seeds first). **A one-site
  ordering drift between two surfaces whose written contract is that they must not drift.** RED test, fixed at
  source, GREEN, screenshotted in the real app into `after/MERGE-r2/`.
- **Two stale bars were retired that had outlived their defects.** Unit F's "intentionally RED" test measured
  **0 survivors on the integration tree AND on unmodified `main`** — the seam it pinned closed during the
  *round-1* integration and nobody re-measured; the bar is tightened `≤ 2` → `=== 0` and the disproven
  polygon-union root cause is retired from the header. And W-36b's "3 pre-existing unrelated failures,
  ownership undecided" was **wrong on both counts** — main is green, the lane was red, and one `git archive`
  of main would have settled it.
- **Filed out of the merge:** **U7-2**, a plain-language caveat pass over **every** folded law — the ctxbar now
  shows caveats for raw folded ids, but `weaveDepth`'s is still audit prose ("appears in `isWaveLaw()`/
  `WEIGHT_LAWS`…"). U5b-2 did this for two laws; U7 and U8 added folds without it.
- **Known-stale evidence the gallery rebuild must re-shoot:** W-30c's two torus "after" frames (W-30d landed
  after them on the same lane and re-opens the ring's hole) and W-28b's listbox (option count 36 → 34 after
  the U7/U8 fold, on top of the nine-rows-visible reason already on the checklist).

## 6. ROUND-1 MERGE — DONE (local only)

**Merged into local `main` at `817424dc`** — the merge commit of `3d-scene/integrate @ecaf1e17`, **v1.3.99**
(the version hook could not fire in a worktree; bumped once at merge as planned). Main's docs wrap-up is
`6ad1d93e`. **NOT pushed**, per standing practice — pushing remains Jay's call.

- The seven `3d-scene/*` lanes (`handoff-b`, `handoff-c`, `fill-audit`, `fill-audit-a`, `fill-audit-c`,
  `fill-audit-d`, `fill-collapse`) are **historical**. **The next session branches off `main`.**
- **The superseded CHANGELOG draft was discarded on main** — the integration carries the **judge's canonical
  wording**, with the crosshatch caveat lifted (C1 landed).
- **The merge agent found and fixed a real X-ray back-density regression** — see `MERGE-impl.md`. Worth noting
  that the merge itself surfaced a defect no lane did.
- **Carried as documented open items, not blockers:** **U5b** (caveat visibility for folded laws — a product
  regression), **W-30b** (the one-line wiring without which W-30 reaches no user), and the five new **USER**
  items W-31…W-35.
### Still owed against the merged tree — secretary audit, 2026-09-06 19:05 EDT

Verified read-only against `main` 47a5a755. **None of these blocks a lane from starting.**

| item | verdict | file |
|---|---|---|
| Unit A's 5 intentionally-red tests, retired in A3's favour | **DONE-ON-MAIN** | `tests/unit/scene3d-ribbon-f1b-streaks.test.js:175` — "RETIRED as a pass/fail bar (A3-judge.md §5 item A1)"; no `intentionally RED` marker remains |
| Unit F's 1 intentionally-red test | **STILL-OWED** (docs/test comment) | `tests/unit/scene3d-mesh-self-occlusion.test.js:29` still RED on `spiral` **and** still carries the root cause W-25 disproved (polygon-union) — reconcile the text and the bar together |
| `findings.json` / `worklist.json` C-05 "byte-identical" claim | **STILL-OWED** | `docs/3d-audit/fill-audit/findings.json:236` still reads "Byte-identical density-inert rows … visually identical". Correct wording + numbers are in the standing ruling (5 distinct outputs, `contFieldTouch` 3879.9 vs `contFieldSigmoid` 1459.0 mm) |
| `after/W-25/report.json` "engaging only for small/thin regions" | **STILL-OWED** | `docs/3d-audit/fill-audit/after/W-25/report.json:14` — W-25b measured 102/288 `trueSpiral` calls still floored at aspect 0.177 |
| W-26 hygiene (a) false hatch-bar line | **STILL-OWED** | `docs/3d-audit/lane-reports/W-26-impl-2.md:424` still says hatch's 1.2 bar "still measures higher"; the ramp actually fell 1.369 → 1.229 (−10.2%) |
| W-26 hygiene (b) `plot-safety` `q(0.98)` disclosure | **STILL-OWED** | `tests/unit/scene3d-plot-safety.test.js:243,262` — the bar is in place, the `## Bars changed` disclosure is not recorded anywhere |
| W-26 hygiene (c) `CROSS_SHARE_BASE` / `CROSS_DFMAX_BOOST_CAP` noted as empirically tuned | **STILL-OWED** | `src/core/scene3d/surface-fill.js:4652`, `:9718` — the comments justify but never say "empirically tuned". **W-36 now depends on this constant**, so record it as part of W-36 rather than separately |
| gallery rebuild (47 unexplained byte-identical pairs now WARN) | **STILL-OWED** | `docs/3d-audit/fill-audit/index.html` last built **Sep 5 20:11** — it predates T1, W-26b, U1–U5, W-30 and the merge. Orchestrator-only task |

- **Original round-1 wording, kept for the record:** reconcile the intentionally-red tests (handoff-b's Unit A 5 +
  Unit F 1 versus A3's retirement of the 5 — resolve in A3's favour); the `worklist.json`/`findings.json`
  corrections (C-01…C-08 resolved; **C-05's "byte-identical" claim** — five distinct outputs, `contFieldTouch`
  2.7× ink); `after/W-25/report.json`'s "engaging only for small/thin regions"; the W-26 hygiene trio
  (false hatch-bar line in `W-26-impl-2.md`, the `plot-safety` `q(0.98)` disclosure, `CROSS_SHARE_BASE`/
  `CROSS_DFMAX_BOOST_CAP` noted as empirically tuned); and the gallery rebuild (47 unexplained
  byte-identical pairs now WARN).

## 7. PROCESS — lessons & incidents

### Round 3's lessons (2026-09-10 → 12)

**(10) 2026-09-13 — the ninth oracle-instrument finding, and the first where a CORRECT fix silently voided a family of
unrelated claims.** W-31b's plan, looking for a cell-shape defect, found that **tone has NO AUTHORITY at d=220 because W-36c's
anti-saturation cap binds there** — so **every existing bar asserting "tone is preserved" at d=220 is VACUOUS and would pass with
the tone mechanism removed.** The cap is right; Jay's decision 6 = C asked for it and it stays. **The bars built on top of it were
measuring nothing.** Two features make this the most uncomfortable of the ten: **the vacuity is invisible from inside the
assertion, which passes** — and **nobody was looking for it; a plan chasing a different defect tripped over it.** The nine before
this were found by re-deriving a number, running an unasked-for mutation, or looking at a picture; this one needed a unit to walk
past it with the right instrument in hand. **New standing rule: measure tone authority at d=50, and treat every existing d=220
tone claim as suspect until re-measured.**

**(9) 2026-09-12 — THREE findings in one day of the same new shape, now a standing ruling: a guard that moves in the right
DIRECTION is not a guard on the DEFECT.** **T4b's band has a mathematically dead lower half** (`BASELINE × 0.9 = 1350.96` sits below
the 1400 floor) **and its live upper half is structurally blind to the slab** — the slab-regrowing formula measures *byte-identical*
ink at the guarded cell and only appears at d=1 (+167 %), so T4b gates the ink half of Jay's decision-1 bar while reading as if it
gated both halves. **W-36d's restored sub-bar misses interior-only degradations** — two mutations touching no sampled point pass
every bar in the file. **And F1-placement's nine reds measure coverage, fill rate, residue and gap geometry while the thing that
visibly changed was ribbon WIDTH**, which no bar measures at all. **Promoted to a standing ruling: state which half of the acceptance
bar a guard actually gates, and mutation-test the half you claim.** It is sharper than round 2's "ask what quantity the bar
measures" — that asks whether the instrument is right; **this asks how much of the promise it keeps.** Note where the three came
from: one from a reviewer running a mutation nobody asked for, one from a secretary flag, and **one from the orchestrator looking at
a picture.** No single role would have found all three.

**(8) 2026-09-12 — an env-gated "pre-fix" comparison that gated nothing, and it had already produced a
ledger row, a merge-checklist item and a standing ruling before anyone measured it.** The dead F1-placement
implementer ran two guard files with `VECTURA_PRE_F1P=1` and reported them "identical to 13 decimal places"
pre and post, concluding the redness was pre-existing. **`scene3d-ribbon-f1b-streaks.test.js` reads a
different flag (`VECTURA_PRE_F1B`) and `scene3d-ribbon-wall-coverage.test.js` reads none** — both runs were
the same post-fix code. A real `git archive` of the base sha: **44/44 and 36/36, clean.** **Prototype B
caused all nine failures.** Three things are worth keeping. **The general form is the widest yet: a
reference that does not move with the flag you set is indistinguishable from one that does, and neither
prints a warning** — it is the same family as W-38's `git show HEAD:` leg (the reference moves *with* the
thing it checks) seen from the other side. **The disproof came from the discipline, not from suspicion** —
the fresh implementer only re-measured because its brief demanded the failing set be reproduced *at the base
sha*; had the brief said "confirm the pre-existing red", the false premise would have merged. And **a
false premise propagates at the speed of the secretary**: within one morning it had become a ledger row, a
merge-checklist item and a standing ruling, all of which had to be struck by lunchtime. **New rule: before
trusting any env-gated pre-fix run, grep the target file for the flag name and confirm the fix's own symbol
is absent from the tree you are calling pre-fix.**

**Two more oracle-instrument findings, seven in total — and both were caught BEFORE a merge this time.**
**(6) W-38's T1 leg compared against `git show HEAD:`, which always equals the loaded source on a clean
tree — structurally incapable of ever failing, forever.** It is the hardest kind to see, because it *looks*
like the strongest available check (a comparison against the real pre-fix source) and fails precisely
because **the reference moves with the thing it is meant to check**. **The identical idiom is in
`scene3d-slice-end-overlap.test.js` (W-35), already merged** — hence the sweep on the merge checklist.
**(7) W-36c's replacement dial bar could be gamed by a lower-half freeze**, proven by mutation: a dial inert
from 0.25 to 1.0 — a real user-visible defect — **passes both strict monotonicity and the endpoint-ratio
bar**. The general form is worth keeping: **"monotonic" plus "endpoint ratio" does not constrain the SHAPE
of a response between its endpoints.**

**Three of the round's most useful findings came from units looking at something else.** U6 found that
`shadows.js` dispatches on **mark class** while doing a picker re-categorisation — without a matching
recipe its shadow would have silently become `ladder`. W-38's reviewer found the vacuous leg while checking
a default. U7-2 found **an entire missing caveat surface** (the shadow row renders no caveat on either
surface) while rewriting copy. **None was on anyone's list; each came from reading the code adjacent to the
change rather than only the lines being edited.**

**Scout before planning anything filed more than a few units ago.** W-37 was closed by one read-only
measurement — the defect had been fixed by W-34's side effect. That is the **third** time this audit found
an item already fixed (after Unit F's stale bar and W-30c's cone/cylinder collateral), and each time the
alternative was a planner, an implementer and a review chasing something that no longer existed.

**The background-polling rule cannot be fixed with prose — it needs a number.** Seven occurrences across
implementers, reviewers and a planner, **including two agents whose own briefs carried the foreground-only
wording**. The mechanism is mechanical: on a shared machine the long vitest files exceed the default Bash
timeout, the tool backgrounds the command, and everyone reaches for the same workaround. **Brief an explicit
`timeout: 600000` for the known-slow files** instead of restating the rule more firmly.

**Reports and evidence live in MAIN, and a missing file is not evidence of a missing deliverable.** The U9b
reviewer searched the worktree, found nothing, and issued a REJECT on that premise; the verdict was
re-issued as ACCEPT-WITH-FOLLOWUPS once it read MAIN's paths. Round 2 logged the mirror image of this
repeatedly (implementers *writing* into their worktrees); this was the first time a reviewer *read* from one
and drew a conclusion from the absence.

**A fourth reviewer-caught arithmetic slip** (U6's 550-vs-544, after U0, U1–U5 and U8). None was ever a
missed regression; all four would have been copied forward. **Sum the table, don't restate the headline.**

**Two rules promoted to standing.** A unit that turns another unit's test green **must say so** — U9b
carried U6-2's fix, and a red → green transition inside an innocent unit reads as "all tests pass" at merge.
And **the generative cross-check is part of every fold's scope**: U7 and U8 each had to extend it and **U6
broke it outright**, so a fold that ships green leaves the next one a red file it did not cause.

### Round 2's own lessons (2026-09-06 → 10)

**FIVE oracle-instrument findings — the round's dominant failure mode, and not one of them was a broken
mechanism.** In every case the code was right and the measuring device was wrong, and every one was caught by
somebody **re-deriving a number instead of reading it**. (1) **W-36's** `scene3d-hatch-density-angle-stable`
measured the length-weighted mean bearing of **both crosshatch families combined**, and was only ever stable
because family A held ~91% of the ink — **the defect was propping up the metric**. (2) **W-34's** implementer
**self-caught** a continuous-z0 sweep that would have given a bogus 72.6°/mm capsule "truth", making T3 pass
vacuously at 32.4 and hiding the very defect the unit existed to fix. (3) **W-34b:** `coneCrossSectionWorld`
**closed an arc that is open by construction**, inflating the cone ceiling 76–77 → **141.56°/mm**, so T2's
exemption had been passing against roughly twice its real value. (4) **W-27c-0a-2:** sub-bar (d) `largestW`
is the **bbox of the largest 8-connected component — a connectivity extent, not an ink width**; the sphere's
"34.5 mm blob" fills 4.5% of that box, and the real quantity (max inscribed disc, 0.783/0.849 mm) was
**already inside the 0.9 mm bar**. Three iterations of culling were driven by a number that never measured
the defect. (5) **W-27c-0a-5:** four of six new bars pinned a **round-count artifact** — and this was a unit
created specifically to avoid that mistake, whose author explicitly disclaimed correctness in the pin's own
comment. **A guard is only as good as the quantity it measures, and "the mechanism works" and "the bar
measures the mechanism" are two separate claims that must be proven separately.**

**SIX rate-limit incidents in five days — the round's dominant tax, and one variable decides the cost.**
**Incident 3 alone destroyed context**, because the *session* restarted: transcripts were gone, five agents
had to be rebuilt from their on-disk reports, and the two units mid-step had to be checkpointed blind.
Incidents 4, 5 and 6 killed eight, one and one agent respectively and cost **only wall-clock**, because the
session survived and every agent resumed via `SendMessage` with its transcript. **Agent death is routine and
recoverable; session death is what destroys context — and the on-disk reports are the only thing that
survives it.** The protocol's "write your full report before returning one line" is what made a from-scratch
respawn possible at all, and the two units that had to be checkpointed blind are exactly the two that had not
yet written one.

**Three metric-green / picture-red candidates, and the pictures won all three.** W-30b's "rectangular band"
turned out to be **correct optics** — proven by a from-scratch 200k-point analytic simulation, not by looking
again. W-28b's identical-looking screenshots were an **evidence defect, not a code defect** (the listbox
under-cropped 8 of 9 flipping rows). **T2's plateaus were real, and it is the round's only REJECT.** The
habit that caught all three is the same one round 1 identified: **the orchestrator looks at every picture at
native resolution**, and a checklist item insists on a LIVE check the harness cannot do.

**The merge found what no lane could — twice in two rounds.** Round 1's X-ray back-density regression and
round 2's **ctxbar caveat defect** were both invisible to every lane because the two halves of the behaviour
had never existed in one tree. Round 2's was caught only because **checklist item 7 demanded a live check**.
**Write down the behaviours that no single lane can test, and make them checklist items** — that is now
proven twice.

**Three reviewer-caught arithmetic slips** (U0's 342-vs-335, U1–U5's 21-vs-18, **U8's 426-vs-447 plus a
57/57 row that is really 51/51**) and **two overstated claims corrected by reviewers** (W-27c-0a-6's "only
the torus ring" — it is three; W-30d's "the fix" — it raises a ceiling ~3.5–4× without removing it). None was
a missed regression; all would have been copied forward. **Sum the table; do not restate the headline.**

**Bars that describe a defect must be re-measured when the defect's owner lands.** Unit F's "intentionally
RED" test measured **0 on main** and had been carried a whole round as red. W-36b's "pre-existing unrelated
failures" were **the lane's own**, and one `git archive` of main would have said so.

**Camera-a-only measurement has now cost this audit twice, in the same file.** W-34's plan tabulated M1 at
camera a; a camera-b sweep found **all six** primitives over the bar, not the two named. Six units later,
W-27c-0a-6's safety-margin guard checked camera a only and missed two of the three rings its own gate
affects. **Slices-pass guards sweep both cameras by default.**

**What went right, and is worth keeping.** Spike gates on unprototyped plans (**W-31's caught an unshippable
mechanism before a line of source moved**); prototype-before-plan bars (**W-15c design E proved F-14's bar
arithmetically impossible rather than merely unmet**); stop-reports over fudges (W-15c D, W-31, W-27c-0a-2,
T2's revert); reviewers re-deriving headline numbers rather than reading them; and **six clean ACCEPTs**, all
of them on units scoped to a small number of named, externally-specified items.

### Round 1's lessons (kept)



**Three metric-green / picture-red cases.** W-27c-0a 2b: 49/49 green and ACCEPT-PARTIAL, then a **full-resolution crop** showed the cull reintroducing the exact defect `767bed54` had fixed — and the guard that should have caught it had its ceiling re-pinned 55 → 80 **to accommodate that same splitting**. T1: a visible chevron at every tick centre while **all four oracles passed**, O1's sagitta *higher* because the kink read as curvature. W-26b C2 (caught by the implementer, before landing): the first anti-blob guard drove **every** mapper to coverage 1.0 — a green guard measuring nothing.
> **A guard whose bar you widen to fit a new mechanism stops guarding against that mechanism.** 800 px cells are not enough — crop at native resolution.

**Two silent bar loosenings, both caught by reviewers.** W-26's `inkRamp` 1.8 → 1.3 (plus an undisclosed hatch loss 1.369 → 1.229) and W-27c-0a's sphere `pct1` quietly relaxed to `<10`. Both later justified or reverted — neither self-reported.

**Three coin bars** (W-26): each sat inside its own drift envelope; the judge showed the coin landing wrong. Fixed shape: floor **below** the envelope **plus** a ±10% fingerprint band — now shipped in W-26b-3.

**Incidents.** **Incident 5 (2026-09-09 ~13:40 EDT, reset 14:10) killed EIGHT agents** — U8 and W-31's implementers, four reviewers and a planner — and again **every transcript survived**, so all eight resumed via `SendMessage` with no unit changing status. U8's tree was checkpointed (`9a26aa5e`); W-31's was clean; the W-33 reviewer had already finished. ⚠ **The kill exposed a protocol deviation it would otherwise have hidden: the W-35 reviewer was waiting on a background run — the fourth occurrence of that failure mode across both rounds, and the first by a REVIEWER**, whose brief only ever addressed implementers on this point. **Three rate-limit incidents in four days is now the dominant tax on this round.** **Incident 4 (2026-09-08 ~22:30 EDT, reset 23:10) is the control case that proves the point:** the rate limit again killed five agents (U7 impl, W-10d-3 impl, the W-34 reviewer, the W-30c and W-35 planners) — but **the session survived, so every transcript survived, and all five resumed via `SendMessage` with no loss**. The W-28b reviewer finished on resume; the W-30b reviewer had already written its report and needed no resume at all. Two mid-unit trees were checkpointed (`bfe8fdb4` on fill-collapse-2, `4ca6a507` on fill-audit-2) but as ordinary resume points, not blind ones. **Incident 3 cost two units a blind checkpoint; Incident 4 cost only wall-clock — and the single variable between them is whether the SESSION restarted, not whether the agents died.** **Incident 3 (2026-09-06 20:02 EDT) broke the pattern: the rate limit killed six agents AND the session then restarted, so every transcript was lost and nothing could be resumed with `SendMessage`** — the first time in this effort that agents had to be rebuilt from their on-disk reports. The OS also killed a dev server for low memory. Two mid-unit trees were checkpointed as unverified WIP (`fill-audit-a2 0b7d8fda`, `fill-collapse-2 eea613fd`), and the T1b checkpoint carries a probe file (`tests/unit/zzz-t1b-perf.test.js`) that must be deleted before the unit closes. **The lesson this adds: the reports ARE the recovery mechanism** — the protocol's "write your full report to `lane-reports/` before returning one line" is what made a from-scratch respawn possible at all, and the two units that were mid-step (no report yet) are exactly the two that had to be checkpointed blind. Earlier: two rate-limit kills (3 then 6 agents) — all worktrees intact, all resumed via `SendMessage`; nothing was stashed, so nothing needed recovery. Three stalls (W-26 impl-1's monitor loop, 738k tokens, checkpointed as `4ea8caed`). **One data loss, since identified as harmless:** the W-26b reviewer's `rm` during cleanup deleted two untracked files in main's root (`torus-fillstyle-open.png`, `torus-fillstyle-panel.png`) — **leftover screenshots from the W-10d reviewer**, never tracked and unrecoverable, but nothing depended on them. Self-reported immediately, which is why it was identifiable at all. The rule stands: reviewers are read-only and delete nothing, inside or outside their worktree.

**Tooling defects.** `scripts/audit/*.js` run their **default full job** on an unrecognized flag (`--help` caused two unplanned gallery rebuilds); `ensureServer`'s readiness ping races the app's config scripts (one capture silently lost a cell); `after/W-10` had been overwritten by three stacked capture generations.

**Four gallery coverage gaps.** No cell renders the five F1 ribbon laws; none has an imported mesh; none exercises `shadowReceiveOnObjects`; contourSlice cells use the `ladder` placeholder and `solid` *is* the buckyball. **Check the manifest before naming a cell in a brief.**

**Two arithmetic slips in reports** (U0's 342 vs 335, U1→U5's 21 vs 18) — both caught by reviewers re-running the sums. Worth a habit: sum the table, don't restate the headline.

**What worked.** Scratch `git archive` exports for RED (never stash); reviewers reproducing numbers independently rather than reading them; implementers stop-reporting instead of fudging (W-15c reverted, W-10c iter-3 blocked, T1's honest shortfalls, W-27c-0a's disclosed regression); mutation tests as causal proof (W-26b's re-widening fails the new guard at exactly the pre-fix value); and the orchestrator looking at every picture — which is what caught the two defects no test did.
