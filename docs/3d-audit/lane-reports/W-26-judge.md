STATUS: ACCEPT-WITH-CONDITIONS — user's rule (ladder / fine ladder / contour) SATISFIED and P0 closable on that wording; 4 conditions, 3 blocking (crosshatch over-ink, a tautology guard, three coin bars)

# W-26 judge — the P0 user rule, ruled on

Lane `fill-audit-a`, worktree `.claude/worktrees/fill-audit-a`, branch `3d-scene/fill-audit-a`.
Range judged `9fa159f0` → `3c88605f` (HEAD at judgement time; the two WIP checkpoints
`f5e22359`/`4ea8caed` intact, not rewritten). **Read-only throughout**: no edit, stash, commit,
push, or `--root` write inside the worktree. Every number below I measured myself, in scratch
`git archive` exports of the two shas with `node_modules` symlinked to MAIN's, on free ports
8520 (before) / 8521 (after), foreground only.

Evidence dir: `docs/3d-audit/lane-reports/W-26-judge-evidence/` — montage, both rigs, both
drift sweeps, the raw before/after shots for every cell I shot, and the scan script.

LOOK: `docs/3d-audit/lane-reports/W-26-judge-evidence/W-26-judge-montage.webp` — the three
extra cells nobody in the chain shot, before | after, side by side. Row 1 and row 2 are the P0
rule, closed. Row 3 is the one thing this landing breaks.

---

## What I did that the reviewer could not

Three cells outside the whole evidence set (impl-1, impl-2, reviewer all missed them), each
confirmed present in `docs/3d-audit/fill-audit/manifest*.jsonl` before naming:

1. `ellipsoid__contour__ladder__{low,med,max}__a` (Tier A) — a **graded** form, so the rule's
   "unless required for a gradient" clause is live, not bypassed.
2. `cone__contour__{fineLadder,phaseFineLadder}__{med,max}__a` and
   `sphere__{contour,hatch}__{fineLadder,phaseFineLadder}__{med,max}__a` (Tier B) — the **other
   two ladder-family laws**, which the chain only ever argued about structurally and never shot.
3. `cylinder__crosshatch__ladder__{low,med,max}__a` + `ellipsoid__crosshatch__ladder__…` (Tier A)
   — the crosshatch second family the brief's own step 3 routed.

The harness ladder is `low=1 / med=50 / max=220` (`scene3d-capture.js:122`); there is no D25 or
D85 cell, so I measured D1/25/50/85/220 in my own vitest rig instead and shot D1/50/220.

Three independent instruments, none of them the chain's:

- **rig v2** (`judge-rig.test.js`): per-FAMILY (`run.fam`, which for crosshatch is two distinct
  values sharing a `lineIndex` range — the chain's `repsFor` merges them, which is why the
  reviewer's own crosshatch pitch column was unusable), PERPENDICULAR drawn offsets, and a
  per-intensity-bin tone-transfer curve on a lit sphere via
  `Scene.projectWorldPoint` + `Regions.combinedIntensity`.
- **image-space gap scan** (`gapscan.py`): scanlines perpendicular to the rulings across the
  rendered object, white-gap runs between inked hits. This is literally what the user's eye
  sees. Metrics: `p95/p05` (whole-form range — the TONE), `p75/p25` (bulk local regularity),
  and `agjMed`/`agjP90` (median / p90 **adjacent-gap jump** = max(g[i]/g[i−1], g[i−1]/g[i])).
  `agjMed = 2.00` is the exact fingerprint of the Sturmian 1-and-2 alternation F-23 names.
- **ink-ramp drift sweep** (`judge-inkramp-drift.test.js`): the span-verdict guard's own
  `inkRamp` reimplemented byte-for-byte (same least-squares gradient axis, same G=24, same 0.82
  limb cut, same 5 bins), swept over 11 trivially-different scenes.

Calibration that the instruments are the same instruments: my drift rig reproduces the guard's
own contour numbers **exactly** — 2.079 at `9fa159f0`, 1.354 at `3c88605f` (report says 2.08 →
1.35). RED/GREEN of the new test file also reproduced cold: 4 failed / 5 passed at `9fa159f0`
(cone+contour 2.052453945360482, cylinder+contour 2.000000000000035, capsule-barrel
2.000000000000026, cone+spiral 77.1673288814952), 9/9 at `3c88605f`.

---

## (1) Does the landing satisfy the USER's rule as written, across the roster?

> "ladder, fine ladder, and contour must not have irregular gaps unless they're required to
> create a perceptual gradient of light and shadow."

**For every law and mapper the user actually named: YES. Measured, on cells nobody shot, and
looked at.** Image-space drawn gaps, before → after:

| cell | p95/p05 (whole-form range = tone) | p75/p25 (bulk regularity) | **agjMed** | ink |
|---|---|---|---|---|
| ellipsoid contour ladder D50 | 5.55 → **2.00** | 3.06 → **1.22** | 1.79 → **1.04** | **+1.4%** |
| ellipsoid contour ladder D220 | 5.00 → 2.00 | 2.17 → 1.17 | 1.83 → **1.17** | +4.3% |
| cylinder contour ladder D50 | 2.41 → 1.36 | 2.00 → **1.00** | **2.00 → 1.00** | +15.4% |
| sphere contour ladder D50 | 5.15 → 2.12 | 3.00 → 1.14 | 1.81 → **1.04** | +9.7% |
| cone contour **fineLadder** D50 | 3.31 → 1.28 | 2.00 → 1.03 | **2.00 → 1.03** | +15.0% |
| cone contour **phaseFineLadder** D50 | 3.31 → 1.30 | 2.00 → 1.06 | **2.00 → 1.03** | +14.0% |
| sphere contour **fineLadder** D50 | 4.85 → 1.93 | 2.45 → 1.18 | 1.88 → **1.04** | +4.5% |
| sphere hatch ladder D50 | 9.82 → **4.75** | 3.27 → **1.23** | 1.66 → **1.05** | +13.5% |
| sphere hatch **fineLadder** D50 | 9.47 → 4.59 | 2.58 → 1.26 | 1.47 → 1.07 | +19.7% |
| sphere hatch **phaseFineLadder** D50 | 6.32 → 3.64 | 2.09 → 1.31 | 1.83 → **1.07** | +31.5% |

The `agjMed = 2.00 → 1.03` column is the whole ruling. The 1-and-2 alternation is gone on
`fineLadder` and `phaseFineLadder` too, on cells the chain only argued about from code, and it
is gone on a **graded** ellipsoid as well as on the proven-uniform cone and cylinder — the rule's
exception clause is honoured, not exploited: `p95/p05` stays ≥ 2 (2.00–4.75) while `p75/p25`
collapses to 1.14–1.31. Wide gaps survive **only** across the light-to-shadow range; adjacent
gaps no longer jump.

`ellipsoid contour D50` is the clincher and it is why I do not read this as a density change:
**+1.4% ink** bought a 2.8× improvement in whole-form gap range and a 2.5× improvement in bulk
regularity. The rulings were **moved**, not added.

**For crosshatch: NO — and crosshatch gets worse.** See §(2) / condition C1. Crosshatch is a
mapper the user did not name, so the rule *as written* is still satisfied; but the brief's own
step 3 routed the crosshatch second family, so this is in scope for the unit.

I also re-derived the R1a bar without the test's `excludeEnds` slicing (my full-family
perpendicular ratios are dominated by degenerate cap rings, which is exactly why the exclusion
exists — I confirmed the exclusion is a legitimate chart-region argument, not a convenience).

---

## (2) Is tone preserved or flattened? My own reading of the pictures.

**Preserved, and slightly strengthened, for contour/hatch — genuinely flattened for crosshatch
at the dense end.**

**Tone-transfer curve on a lit sphere, D50** (ink·pen / visible area, per surface-intensity bin;
bin 0 = deepest shadow, bin 5 = highlight). Shadow : near-highlight coverage ratio:

| law / mapper | before | after | highlight bin (must stay bare) |
|---|---|---|---|
| ladder / hatch | 3.71 | **4.31** | 0.001 → 0.001 |
| fineLadder / hatch | 2.89 | **4.10** | 0.001 → 0.000 |
| phaseFineLadder / hatch | 2.02 | **3.15** | 0.001 → 0.000 |
| ladder / crosshatch | 1.27 | **1.10** | 0.001 → **0.006** |

Hatch tone contrast **improved** in all three laws and the highlight stays bare. R1c is
satisfied independently of the unit test: my image-space whole-form range on
`sphere hatch ladder` is 4.75 ≥ 2, and the reviewer's own rig read 19.91. **Not flattened.**

**Are the ink deltas restoration or "everything got darker"?** For contour and hatch:
restoration. Every cell shows ruling COUNT up and mean pitch TIGHTER (my rig, e.g. cone contour
fineLadder D85 72→93 rulings), ink rising roughly with count, and `ellipsoid contour D50` gaining
regularity for +1.4% ink. Looking at row 1 of the montage: the BEFORE ellipsoid has a large
irregular void across the top-left shoulder and visible ring clusters; the AFTER is evenly
ruled top to bottom **and still tightens toward the bottom** — the gradient reads, the void is
gone, the drawing is not darker. Row 2 (cone fineLadder): BEFORE has unmistakable paired rings;
AFTER is perfectly even. Neither reads as "darker".

**Crosshatch is the exception and it is not subtle.** Ink coverage of the silhouette
(fraction of the object's projected area that is ink), before → after:

| cell | ink mm | ink coverage |
|---|---|---|
| cylinder crosshatch ladder D50 | 1456.9 → 2297.4 (**+57.7%**) | 0.229 → 0.344 |
| cylinder crosshatch ladder D220 | 4912.6 → 9326.7 (**+89.9%**) | 0.619 → **0.906** |
| ellipsoid crosshatch ladder D50 | 1280.5 → 1978.6 (**+54.5%**) | 0.220 → 0.328 |
| ellipsoid crosshatch ladder D220 | 4875.7 → 7795.0 (**+59.9%**) | 0.634 → **0.891** |
| cylinder contour ladder D220 (control) | 3183.8 → 3801.6 (+19.4%) | 0.536 → 0.628 |
| cone contour fineLadder D220 (control) | 1377.2 → 1613.7 (+17.2%) | 0.402 → 0.460 |

Row 3 of the montage: the BEFORE cylinder is a legible crosshatch mesh with real tonal
structure. The AFTER is a **near-solid white field with pinhole dots** — 91% of the silhouette
is ink. All tone is gone; on paper that is a saturated black blob and a pen-destroying ink
load. And the gap metrics move the WRONG way there: `p75/p25` 2.43 → **4.25**, `agjMed` 1.82 →
**3.67**, `agjP90` 3.77 → **6.86** (at D50 it is flat: 2.24 → 2.30). So crosshatch neither
satisfies the rule nor preserves tone.

Mechanism I believe (not proven): `ladderWantedPitch` is applied to each crosshatch family
independently, so the two families each tighten by ~1/coverage and the COMBINED coverage
compounds roughly quadratically, where the old discrete per-family verdict happened to keep it
in check. Corroborating evidence sits in this commit's own re-pins: in
`scene3d-curved-density-floor.test.js` the `crossDensityRatio` control's count spread at d=100
collapsed from **183 vs 83 (2.2×)** to **130 vs 116 (1.12×)** — a user-facing parameter that has
largely stopped working, absorbed silently into a fingerprint re-pin with no comment.

**A second, undisclosed tone loss.** `W-26-impl-2.md` § "Bars changed" states "`hatch`'s own bar
(1.2) is unaffected by any of this and **still measures higher than it did before the fix**."
That is wrong. Same rig, same quantity that reproduces the report's own contour 2.08 → 1.35:
**hatch ink-ramp 1.369 → 1.229, a 10.2% loss**, leaving 2.4% headroom against its untouched 1.2
bar. The pole-sampling side effect the report attributes to contour alone hits hatch too.

---

## (3) Are the re-pinned guards honest?

8 test files were edited plus 1 added. Checklist item 13 and two spot-checks:

**Item 13 — CONFIRMED, with a caveat.** `scene3d-fill-even-spacing.test.js` genuinely moved to
DRAWN spacing: `keptByFamily` (kept-INDEX gaps) → `repsByFamily`/`drawnGapsOf`, per-ruling
screen centroid, Euclidean distance in projected mm. The addendum's blind spot is named
verbatim in the new header, and the file was replaced, not deleted. **Caveat:** three softenings
were stacked into that same edit — a **30% end-trim per side** (only the middle 40% of each
family is now measured), a **1.6 ratio bar** (argued for genuinely graded fields), and a
**3-point median filter applied before the neighbour-ratio check**. Each is argued individually.
Their combined effect on the file's named property is not: the median filter, by construction,
**cannot fail on an isolated doubled gap** — and "a gap sitting beside one TWICE its size on
open surface, which… reads as an unexpected white band" is the file's own stated purpose. See C4.

**Spot-check A — `scene3d-fill-span-verdict.test.js`, "tone is still made by DROPPING WHOLE
RULINGS": NOT honest as a guard. It became a fingerprint of the new tree.**
`expect(drawn.size).toBeLessThan(budget * 0.9)` → `expect(drawn.size).toBe(budget)`. By the
implementer's own argument in the adjacent comment ("`lineIndex` is the walk's own placement
ordinal, so every index the walk emits IS drawn **by construction**") the new assertion is a
tautology: it cannot fail for any fill-behaviour change short of restructuring how `lineIndex`
is assigned. What it used to protect is stated in the file's own header — "a fix that stops the
breaks by drawing everything is a failure" / "if nothing is dropped the form is a black blob" —
and **nothing replaced it**. The comment claims the surviving half is "every placed ruling is a
WHOLE, uncut candidate"; `drawn.size === budget` does not assert that. The commit that deleted
the anti-blob guard is the commit that produced a 0.906-coverage blob (§2). See C2.
(The sibling `expect(deep.length).toBeGreaterThan(0)` → `toBe(0)` re-pin makes the following
`expect(deep.filter(…)).toEqual([])` vacuous, which the comment discloses honestly. Minor.)

**Spot-check B — `scene3d-hlr-spatial-index-identity.test.js`: HONEST.** This file's whole
purpose is byte-identity, so a re-pin is the only possible correct response to an intentional
geometry change. It carries the before/after `pathCount`/`pointCount` for both changed keys
(341→368 / 1099→1432 and 560→571 / 2303→2530), states the mechanism, and — the part that makes
it honest rather than a rubber stamp — **holds three controls unchanged**: both `|draft`
variants (which route the flat legacy path where `STAGE.masterGrid` never engages) and
`facetedOverlap-orthographic-hatch|settled` (no curved primitive). Correct form; accept.

The remaining edited guards (`curved-density-floor`, `curved-density-sparse-end`,
`hatch-density-500`, `box-density-bearing`) are count/md5 fingerprints re-pinned with numbers,
and `curved-density-sparse-end` **tightened** its oracle (`expectNonDecreasing` →
`expectStrictlyIncreasing`), which is the right direction. The one thing hidden inside them is
the `crossDensityRatio` collapse named in §2.

**The coordinator's question — is a 4%-headroom bar a real guard or a coin? It is a coin, and I
can show the coin landing on the wrong side.** I swept the span-verdict fixture over 11
trivially-different scenes (detail ±4, density ±2, radius ±2, sun elevation ±2°, camera pitch
±2°) on both trees:

| | bar | measured (shipped fixture) | headroom | drift envelope over 11 variants |
|---|---|---|---|---|
| contour ink-ramp, **before** | 1.8 | 2.079 | +15.5% | 1.835 – 2.144 — **entirely above the bar** |
| contour ink-ramp, **after** | 1.3 | 1.354 | +4.0% | **1.282** – 1.518 — **crosses the bar** |
| hatch ink-ramp, before | 1.2 | 1.369 | +14.1% | 1.324 – 1.488 — above |
| hatch ink-ramp, after | 1.2 | 1.229 | +2.4% | **1.216** – 1.417 — 1.3% above at pitch 28 |
| plot-safety `q(0.5) <` | 0.35 | 0.3425 | 2.2% | not swept |

Moving the sun's elevation from 35° to **33°** — two degrees, same fixture, same code — reads
**1.282**, i.e. **below the 1.30 bar**. The old 1.8 bar was a real floor: every perturbation I
tried stayed above it with 15%+ headroom. The new one is inside its own noise envelope. The
untouched hatch bar has been pushed inside its envelope too, and `plot-safety`'s over-ink median
bar was loosened to 2.2% headroom **in the same commit that took crosshatch coverage to 0.906**.
Three bars, all coins. See C3 for the honest form.

---

## VERDICT: ACCEPT-WITH-CONDITIONS

The P0 rule **as the user wrote it** is satisfied, decisively, and I would close it on that
wording: on ladder, fine ladder and contour, across cone, cylinder, sphere, ellipsoid and
capsule, at D1 through D220, the adjacent-gap jump goes from the textbook 2.00 alternation to
1.03–1.17, the whole-form light-to-shadow range survives (≥ 2), the highlight stays bare, tone
contrast on a lit sphere goes UP not down, and on a graded ellipsoid the whole gain costs +1.4%
ink. That is a genuine fix, not a re-parameterisation, and rows 1–2 of the montage show it to
the eye. The RED/GREEN, the mutation test, the uniform-field lemma, the drawn-spacing oracle and
the scope discipline (`5084-5157` untouched, verified by line-number diff) all hold under my own
re-measurement.

It is **not** a clean ACCEPT, and P0 must not be marked closed in the ledger until C1–C3 land,
because the landing ships two new problems and disarms the guard that would have caught one of
them.

### C1 — BLOCKING. Crosshatch over-inks into saturation.
`cylinder__crosshatch__ladder__max__a`: ink 4912.6 → 9326.7 mm (**+89.9%**), silhouette ink
coverage 0.619 → **0.906**; `ellipsoid__crosshatch` D220 0.634 → **0.891**; both at D50
+55–58%. Gap regularity regresses (`p75/p25` 2.43 → 4.25, `agjMed` 1.82 → 3.67, `agjP90` 3.77 →
6.86). Controls (contour, hatch) are +17–19% and stay legible, so this is crosshatch-specific
compounding, not the fix's general signature.
**Unit:** derive the crossing family's `ladderWantedPitch` from the **combined** two-family
target coverage (or from `crossDensityRatio`'s intended share) so total crosshatch coverage
matches `ladderCov`, instead of each family independently hitting it. RED first: pin silhouette
ink coverage ≤ pre-fix + 15% at D220 on cylinder AND ellipsoid, and pin drawn `p75/p25` not
worse than pre-fix. Include the `crossDensityRatio` collapse (d=100 count spread 2.2× → 1.12×,
from this commit's own `scene3d-curved-density-floor` re-pin) in the same unit — same cause,
same fix.

### C2 — BLOCKING. Restore a real anti-blob guard.
`scene3d-fill-span-verdict.test.js`'s `expect(drawn.size).toBe(budget)` is a tautology under
continuous placement and leaves the file's stated "stops the breaks by drawing everything"
property completely unguarded.
**Unit:** replace it with a bar the new mechanism can actually fail — drawn ink COVERAGE (or
min-drawn-gap / penWidth) on the same fixture, asserted for `hatch`, `contour` AND `crosshatch`
at D50 and D220. It must be RED against `3c88605f` for crosshatch D220 (that is the proof it is
a guard and not a second fingerprint) and GREEN once C1 lands.

### C3 — BLOCKING. Three coin bars, and one factual correction.
- contour ink-ramp `1.3` vs 1.354 measured (4.0%); drift envelope 1.282–1.518 **crosses** it at
  sun elevation 33°.
- hatch ink-ramp `1.2` vs 1.229 measured (2.4%); 1.216 at camera pitch 28° (1.3%).
- `scene3d-plot-safety` `q(0.5) < 0.35` vs 0.3425 measured (2.2%) — the over-ink safety bar.

**Unit, per bar:** set the FLOOR below the whole measured drift envelope (contour 1.15 — still
refuses the measured 1.04 "draw everything" variant the file names; hatch 1.05; plot-safety
0.40) **and** pin the measured value with an explicit ±10% band as the fingerprint (contour
1.22–1.49, hatch 1.11–1.35, plot-safety 0.308–0.377). A drift-driven flip then becomes
impossible while a real flattening still fails both halves. The alternative — and the better
fix — is the implementer's own named follow-up: give `emitContFamily`'s walk a MINIMUM sampling
resolution near a known chart pole so contour's ramp returns above 1.8 with headroom; that would
also recover the hatch loss. Either is acceptable; the current shape is not.
**Correction owed in `W-26-impl-2.md` § "Bars changed":** "`hatch`'s own bar (1.2) is unaffected
… and still measures higher than it did before the fix" is false. Measured, same rig that
reproduces that section's own 2.079/1.354: **hatch 1.369 → 1.229, −10.2%.**

### C4 — NON-BLOCKING, record.
(a) `scene3d-fill-even-spacing`'s three stacked softenings (30% end-trim per side, 1.6 ratio
bar, 3-point median filter). Keep the trim and the bar; add ONE unfiltered assertion that no
single drawn gap exceeds 2× its neighbour on a proven-uniform field, so the file can still fail
on the isolated white band its header says it exists to catch.
(b) `ellipsoid__contour__ladder__low__a` (Density 1) goes from ~5 interior rings to a **bare
outline** (ink 319.2 → 180.2 mm, −43.5%; the picture is silhouette + one pole ring). Density
response stays monotone (180.2 / 880.0 / 3388.7 at D1/50/220) and the slider minimum is meant to
be sparse, so this is not a rule violation — but it is a visible cliff at D1 on a form that
previously still read as ruled. Record it; do not fix it inside W-26.
(c) F1 confirmed out of scope and unchanged; the reviewer's byte-identity check reproduces.

---

## Wording

**CHANGELOG (`## Unreleased` → `### Fixed`)** — use this, not the draft in `W-26-impl-2.md`
(which promises "a LITTLE more ink", a claim C1 makes untrue for crosshatch):

> **3D Scene — Ladder, Fine Ladder and Phase Fine Ladder no longer skip alternate rulings on a
> flat-toned surface.** On a cone, a cylinder, a capsule barrel or any evenly lit region, these
> fills used to select a subset of a fixed grid. Every second ruling was dropped, so the drawing
> showed doubled-width white gaps with no shading behind them. Contour, hatch and spiral fills
> now place each ruling continuously: the spacing itself carries the tone, and no ruling is
> dropped. Measured adjacent-gap jump falls from 2.00× to 1.03–1.17×, while the light-to-shadow
> spacing range is preserved. The spiral no longer drops whole turns (turn-advance ratio 77× →
> 1.05×). Where a wrongly dropped ruling is restored, a drawing carries more ink at the same
> Density. That increase is the gap being filled in, not new darkness.

**For the user** — one paragraph, plain:

> Your rule is met for ladder, fine ladder and contour. The doubled white gaps are gone: on a
> cone, cylinder, capsule barrel, sphere and ellipsoid, the jump between neighbouring gaps drops
> from 2× to about 1.05×, and the only wide gaps left are the ones carrying the light-to-shadow
> gradient — the shading actually reads slightly stronger than before, and the highlight still
> stays bare. On an ellipsoid the whole improvement cost 1.4% more ink, because the rulings were
> moved rather than added. Two things are not finished. **Crosshatch** over-corrected: at high
> Density a cylinder now fills to 91% ink coverage and reads as a solid block instead of a shaded
> one, and the Cross Density control has largely stopped responding — that is being fixed
> separately, and until it is, avoid crosshatch above about Density 100. And the contour shading
> ramp on a sphere's pole region is measurably weaker than before (2.08× → 1.35×) because the
> continuous walk samples the pole more coarsely; visible only near a pole, and queued.

---

## Files / commands, for reproduction

- Scratch exports: `git -C .claude/worktrees/fill-audit-a archive {9fa159f0,3c88605f} | tar -x -C
  <scratchpad>/{before,after}`, `node_modules` symlinked to MAIN's real one.
- `node scripts/audit/scene3d-capture.js --tier A|B --root <scratchpad>/{before,after} --port
  8520|8521 --out <scratchpad>/shots-{before,after} --only '<regex>'` (run from MAIN; served
  version 1.3.98 both trees, matching each tree's `package.json`).
- `docs/3d-audit/lane-reports/W-26-judge-evidence/judge-rig.test.js`,
  `judge-inkramp-drift.test.js`, `gapscan.py`, the four result JSONs, `shots/{before,after}/`,
  and `W-26-judge-montage.webp`.
- Tests run in the scratch trees, foreground, one file at a time:
  `scene3d-ladder-uniform-field-spacing` 4F/5P at `9fa159f0`, 9/9 at `3c88605f`;
  `scene3d-fill-span-verdict` 6/6 at `3c88605f`.

---

## Housekeeping note (not part of the verdict)

At the START of this judge pass `git -C .claude/worktrees/fill-audit-a status --short -- . ':!graphify-out'`
was **empty** (tree clean at `3c88605f`). At the END it reads `M src/core/scene3d/surface-fill.js`.
I never wrote in that worktree — this pass used only `git archive`, `git diff`, `git log` and
`git show` there, and all builds/tests ran in `/private/tmp` scratch exports. Some other actor
began editing `surface-fill.js` in that worktree while this judgement was in flight. Flagging it
per CLAUDE.md's checkpoint discipline: whoever owns that edit should confirm it is a deliberate
C1/C2/C3 follow-up and not an unrelated second workstream layered on the same file, and my
verdict above applies to `3c88605f` as committed, not to the current working tree.
