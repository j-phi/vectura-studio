# ROUND 5 — lane map and first-wave briefs (secretary, 2026-09-19)

**Base for round 5: `main` `6ebc76e8` (v1.4.3 — round 4 merged at `ff37531d` + two docs commits, PUSHED).**
**The `-a4`, `border-4`, `integrate-r4` and `r4-fix` worktrees are HISTORICAL — nobody works in them.**

⏳ **TWO OF JAY'S ANSWERS ARE STILL MISSING** (SESSION-SUMMARY §4, "READ 2026-09-19": `d11b` and `eye_t26`
return *"No document"*). **So three items are PARKED and have NO brief here: T2-6b, T2-7 and the W-36f
mechanism.** No agent in this file may start, plan or prototype any of them. If your work touches the
`sphere/hatch` rung artefact, the mkTick comb, or crosshatch tone at d=220, **report it and stop — do not
fix it.**

## Lane map

| worktree (`.claude/worktrees/`) | branch | base | port | file ownership |
|---|---|---|---|---|
| `fill-audit-a5` | `3d-scene/fill-audit-a5` | `6ebc76e8` | **8471** | `src/core/scene3d/surface-fill.js` + the `tests/unit/scene3d-mk*` / `scene3d-mark-laws-draw` family |

**Main's gallery server is on 8460. Do not touch it, do not start a second one.** Scratch ports for the
two read-only scouts: **8473** (T2-4 scout) and **8474** (W-07b scout) — each scout kills its own server
before it hands back. **8472 stays RESERVED** for a second lane; none is warranted now (see
"Parallel vs serial" below).

## First wave — three agents, ALL THREE RUN IN PARALLEL

| # | agent | model | writes to | why this role |
|---|---|---|---|---|
| A | **T3c-onset implementer** (tests-only) | Sonnet | `fill-audit-a5`: `tests/unit/scene3d-mkdashramp-*.test.js` ONLY | Mechanism KNOWN (`T3c-review.md` :74–80, source `surface-fill.js:2530–2536`) → no planner, no scout. Tests-only → a LIGHT VERIFY pass follows. |
| B | **T2-4 scout** (read-only) | Sonnet | MAIN `docs/` only | Every T2-4 number is from a REVERTED tree (T2-2) and a coverage metric T2-3 proved blind. Measure before anyone builds. |
| C | **W-07b scout** (read-only) | Sonnet | MAIN `docs/` only | The row dates from round 1 (`912f8471`); `deepFillTSP` was rewritten since. Is it even a unit? |

**Not in the first wave, and why:**
- **T2-3e (row lattice) — STAYS FILED, NOT A UNIT.** It is pre-existing and disclosed in Jay's T2 row. Its
  only instrument (the narrow-strip FFT) was never committed (`T2-5-plan.md` §5, `T2-6-plan.md` §5.4). And
  it sits in the same mkTick picture Jay's `eye_t26` answer governs. **If `eye_t26` opens T2-7, that
  planner owns the T2-3e measurement. If T2 closes, T2-3e stays a disclosed artefact.** It must not become
  a unit on its own before that answer.
- **Unscheduled, unchanged:** W-33's fitter follow-up · the `insetMultiPolygon` ladder · the W-29 stub
  family · U10–U12 (still W-26-blocked).
- **Merge-checklist items 23 and 30 are owed at the NEXT merge. They are not units** — do not brief them,
  do not start them in a lane.

## Parallel vs serial — GREPPED on `fill-audit-a5` @ `6ebc76e8`, not recalled

- **A writes only** `tests/unit/scene3d-mkdashramp-{discrete,single-pass}.test.js` (comments) and a new
  `tests/unit/scene3d-mkdashramp-onset.test.js`. **B and C write nothing in any worktree.** They write
  only `docs/3d-audit/lane-reports/<ID>-scout.md` and `docs/3d-audit/fill-audit/after/<ID>/scout/` in MAIN.
  **The three write sets are disjoint, so all three run in parallel.**
- **B and C read `surface-fill.js` from their own scratch `git archive` exports** — never from the lane
  worktree. So A's commits cannot contaminate their measurements.
- **Every SECOND-WAVE src unit serializes inside `fill-audit-a5`, after A lands:**
  - Any T2-4 fix touches `MIN_MARK_MM` (`surface-fill.js:5794`, from `MIN_MARK_PEN = 2` at `:364`).
  - **T3c's dash floor reads the SAME constant:** `dashLenFloor = MIN_MARK_MM * 1.05` at `:6814`.
  - So a T2-4 src unit can move A's new onset pins. A must land first, and the T2-4 unit must run
    `scene3d-mkdashramp-onset.test.js` as a guard.
  - A W-07b src unit touches `deepFillTSP` sites (`:1893`, `:5278–5303`, `:8725–8733`, `:9558–9590`,
    `:10045`). These are the same file, so it runs one at a time after any T2-4 unit.
- **No second lane is warranted:** every prospective src unit edits `surface-fill.js`, and one file means
  one lane. **Port 8472 stays reserved.**

---

## BRIEF A — T3c-onset implementer (tests-only → LIGHT VERIFY)

**Role:** Sonnet implementer. **Unit id:** `T3c-onset`. **Report:** `docs/3d-audit/lane-reports/T3c-onset-impl.md`.
**Worktree:** `/Users/jayphi/Documents/github/vectura-studio/.claude/worktrees/fill-audit-a5` · **branch**
`3d-scene/fill-audit-a5` · **base sha `6ebc76e8`** · **port 8471**. Never `cd`; use absolute paths and `git -C`.

Read first: `docs/3d-audit/lane-reports/AGENT-PROTOCOL.md`, `T3c-review.md` (condition 2 and follow-up 2),
`T3b-review.md` (condition 2), and `surface-fill.js:2494–2556` + `:6790–6822` in the lane worktree.

### The finding, already measured — verify it, do not re-derive it from scratch

- `bandOnsetCap(d)` (`surface-fill.js:2531–2536`) returns `round(1 + t·5)` with `t = (d−1)/(MK_BAND_ONSET_D−1)`
  and `MK_BAND_ONSET_D = 35` (`:2530`). The rounding reaches `MK_BAND_MAX_PASSES = 6` once `t ≥ 0.9`, which
  is **d ≥ 31.6**. So the gate is saturated at **d = 32**, not at 35.
- T3c's dash-length bound fires only while `bandOnsetCap(d) < MK_BAND_MAX_PASSES` (`:6813–6818`). So it
  switches off at **d = 32** too.
- T3c's reviewer measured the result (sphere+torus, addLayer, fine sweep d=30..40): the average gap
  fraction is **0.46–0.50 at d=30/31 and 0.01–0.04 at d≥32**. That is a one-integer cliff, **0.47 → 0.02
  from d=31 to d=32**.
- **The shipped record says 35 everywhere except** `report.json`'s `acceptance_bar` and the `layMark`
  comment at `:6798` ("true for d<32"). The docstrings of `scene3d-mkdashramp-single-pass.test.js`
  (:50–71) and `scene3d-mkdashramp-discrete.test.js` (:8, :61, :305) state 35.
- **Nothing pins where the effective onset is.** A future retune of the ramp could move the cliff and no
  test would see it.

### Scope — TESTS ONLY. `src/` is FORBIDDEN.

1. New file `tests/unit/scene3d-mkdashramp-onset.test.js`. Measure through the real `generate()` path
   with `tests/helpers/load-vectura-runtime.js`, as the two existing mkDashRamp files do. Do not use
   private hooks. Clauses:
   - **O17 — effective onset location.** On all four of {sphere, torus} × {addLayer, create}, the
     dash-length bound is ACTIVE at d=31 and INACTIVE at d=32. Measure it on rendered geometry (dark-third
     dash length ÷ period, or the metric the discrete file already uses). Pin both sides of the edge.
   - **O18 — cliff magnitude, pinned and disclosed.** The d=31 → d=32 step on the same four fixtures.
     Pin the floor at d=31 and the ceiling at d=32 from YOUR measured numbers, and disclose the margins.
     Do not copy the reviewer's numbers into the assertions.
   - **O19 — record correction.** Edit the COMMENTS ONLY in the two existing mkDashRamp files so that
     they state "declared `MK_BAND_ONSET_D = 35`, effective onset d = 32 (rounding in `bandOnsetCap`)".
     **Do not change any assertion in those files.** If you think one is wrong, report it and stop.
2. **Mutation proofs — BLOCKING (§0 rule 1).** Use `scriptOverrides` on a scratch copy of the base source.
   - **M1:** `Math.round` → `Math.floor` in `bandOnsetCap`. This moves the cliff to d=35. O17 must go RED.
   - **M2:** `MK_BAND_ONSET_D` 35 → 40. O17 must go RED.
   - **M3:** gate the dash cut on `d < MK_BAND_ONSET_D` instead of `dashOnset < MK_BAND_MAX_PASSES`. O17
     must go RED.
   - Name the mutation that trips O18. If none does, O18 is an unguarded disclosure. Say so.
3. **Do NOT move the cliff.** Whether d=32–34 should draw bounded dashes is a BEHAVIOUR change and it
   belongs to Jay. Put a one-paragraph recommendation in the report ("move to 35 / leave at 32 / ask
   Jay"), with the ink delta each option would cost at d=32–34 on sphere/hatch (both rigs). Do not build it.

### Acceptance bar — clauses

| clause | what it gates | proof |
|---|---|---|
| **O17** | effective onset = 32 on 4/4 fixtures | M1, M2, M3 each RED |
| **O18** | cliff magnitude floor/ceiling | a named mutation RED, or "unguarded" disclosed |
| **O19** | docstrings state 32 as the effective onset | `git diff` shows comment lines only |
| **O16 (inherited, T3c)** | d=35/50/220 byte-identity | stays green, untouched |

**Which half you gate:** O17 and O18 gate the LOCATION and SIZE of the cliff. **They do NOT gate** dash
length below the cliff (T3c's O14), mark count (O15), or anything at d ≥ 35 (O16). Say so in the report.

### RED — from a scratch `git archive`, never in the worktree

This is a characterization pin, so there is no pre-fix tree. **Your RED is the mutation set.** Build it
from a scratch export:
`mkdir -p /private/tmp/claude-501/scratch-T3c-onset && git -C <worktree> archive 6ebc76e8 | tar -x -C /private/tmp/claude-501/scratch-T3c-onset`,
then symlink `node_modules`. **Also run the new file against the unmutated base export and show it GREEN
there** (src is unchanged, so base = HEAD for `src/`). Never `git stash`. Never revert in place.

### Guards — run each one alone, in the foreground

`scene3d-mkdashramp-discrete.test.js` · `scene3d-mkdashramp-single-pass.test.js` ·
`scene3d-mkdashramp-low-end.test.js` · `scene3d-mkdashramp-dark-end.test.js` ·
`scene3d-mark-laws-draw.test.js` (Tier 2 — slow). All must stay green with **zero assertion edits**.

### Evidence cells — VERIFIED to exist in `docs/3d-audit/fill-audit/manifest.B.*.jsonl` (grepped 2026-09-19)

`shots/B/sphere__hatch__mkDashRamp__low__a.webp` · `…__low__b` · `shots/B/torus__hatch__mkDashRamp__low__a.webp`
· `…__low__b` (reference only). ⚠ **Gallery densities are only low=1 / med=50 / max=220**
(`scripts/audit/scene3d-capture.js:148`). **No gallery cell exists at d=31 or d=32.** No render changes,
so no re-shoot is owed. If you can render a bespoke d=31 / d=32 pair of sphere/hatch/mkDashRamp through the
test harness, crop it at native resolution and describe what you see. If you cannot, say so. **Do not edit
`scripts/audit/`.**

### Files

- **ALLOWED:** new `tests/unit/scene3d-mkdashramp-onset.test.js` · comment-only edits in
  `tests/unit/scene3d-mkdashramp-discrete.test.js` and `tests/unit/scene3d-mkdashramp-single-pass.test.js`
  · MAIN `docs/3d-audit/lane-reports/T3c-onset-impl.md`.
- **FORBIDDEN:** everything under `src/` · `tests/helpers/` (read only) · any other test file · `scripts/`
  · `package.json` · the ledger/summary/STILL-OPEN (the secretary owns those) · every other worktree.

#### §0 — pasted VERBATIM from `ROUND3-RESUME-BRIEFS.md` (lines 34–99)

## 0. THE BINDING CHECKLIST — paste this whole section into every brief, verbatim

**Six rules, all promoted to STANDING because a unit broke each one at least once. They are here rather
than only in `LEDGER.md` because the single rule that ever reached implementers reliably was the one
printed in their own brief.** ⚠ **Two of these were broken by the very NEXT unit after they were
promoted** — sweep breadth (F1-erode → F1-amp) and rig-naming (GH-2 → F1-amp). Both were caught by
reviewers, so the system worked; it worked at the cost of a review cycle each time.

1. **STATE WHICH HALF OF THE ACCEPTANCE BAR YOUR GUARD GATES — AND MUTATION-TEST THE HALF YOU CLAIM.
   THE MUTATION PROOF IS BLOCKING; a reviewer may REJECT without it.** "It is an integer gate where only
   the fixed value passes" is an argument, not a proof. If the bar you were given has more than one clause,
   name the clause you cover, name the clauses you do not, and show a mutation that trips the one you claim.
   *(T4b gated the ink half of a two-half bar and read as if it gated both; W-36d's sub-bar missed
   interior-only defects; F1-placement's nine reds never measured the quantity that visibly changed.)*
2. **STATE YOUR SWEEP'S COVERAGE AS A FRACTION OF THE ROSTER, AND JUSTIFY EVERY EXCLUSION.** "The other
   mappers are unrelated" is a claim to be measured, not assumed. The roster is
   `MAPPERS = ['none','hatch','wireframe','crosshatch','contour','spiral','stipple','contourSlice']`
   (`src/core/scene3d/params.js:79`) × `SCENE3D_TONE_LAWS.PRODUCTION` (37 laws).
   *(F1-erode's planner swept `hatch`×4 primitives + `contour`×torus and missed a SECOND live instance of
   its own defect, found only when the sweep was widened to all 8 mappers. F1-amp then reported on `hatch`
   alone — 12.5 % of the roster — and its reviewer had to sweep 8×6 itself.)*
3. **EVERY REPORTED NUMBER STATES THE FIXTURE IT WAS MEASURED ON — RIG, CAMERA, DENSITY, AND EVERY NON-DEFAULT PARAM — in the report
   AND in `report.json`.** ⚠ **A number without its fixture is not reproducible, and "md5-identical source" is NOT a fixture.**
   *(Three script-methodology discrepancies in one round, all in otherwise-rigorous reports, none detectable from the report alone:
   `trochoidLoop` ink −0.98 % vs −1.10 %; `onePenDown` width 0.9860 vs 1.0089 mm, blamed on an intervening fix but actually pre-dating
   it; and a ~35–40 % `inkMm` divergence between one report's pictures and its own table. Naming the rig alone caught none of them.)*
   ⚠ **AND STATE WHETHER GROUND-PLANE INK IS INCLUDED IN ANY INK TOTAL.** *(That third divergence was first blamed on a `fillAngle`
   mismatch; a re-shoot proved `fillAngle` absent ≡ 45 and found the real cause was ground-plane ink counted in one measurement and not
   the other. **Two ink numbers for "the same cell" can differ by a third with both correct and neither wrong — the object's ink and
   the scene's ink are different quantities, and nothing in a bare `inkMm` says which one you have.**)*
   **NAME THE RIG BEHIND EVERY NUMBER.** Since GH-2 (`6ffaf9c6`) there are TWO:
   **`create`** (the default — `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS`, the denser rig
   **the gallery and Jay's own screenshots use**) and **`--rig addLayer`** (plain `engine.addLayer('scene3d')`
   deserialization defaults, **what every RGR test in these lanes constructs**). **A stop-condition measured
   on one rig is a claim about one rig**, and a bound that matters to the user must be measured on the rig
   the user sees. **An unexplained byte-identical before/after pair can mean the RIG CANNOT SEE YOUR FIX** —
   a third legitimate cause GH-1 now recognises as "rig mismatch". *(F1-erode's fix was invisible on
   `create`; F1-amp's ±8 % ink claim came only from `addLayer` and `onePenDown` is −7.99 % on `create`.)*
4. **WHEN A SWEEP REPORTS A CHANGED LAW, GREP FOR PINS ON THAT LAW AND CHECK THE FIXTURE EACH PIN USES —
   NOT JUST THE LAW NAME.** A law-name match is a hit list, not a verdict: the pin and the changed cell must
   agree on primitive, mapper AND density before the pin is at risk, and before you may call it safe.
   **Re-pinning a guard that was never threatened is the same class of damage as missing one that was.**
   *(F1-erode's one candidate pin on `taperedEnds` survived only because its fixture was the sphere while the
   cone moved.)*
5. **A UNIT THAT TURNS ANOTHER UNIT'S TEST GREEN MUST SAY SO — and one that inherits another unit's RED must
   name it, test by test, under `## Pre-existing red`.** A red→green transition inside an innocent unit reads
   as "all tests pass" at merge and hides which unit owns the fix; an inherited red gets misattributed,
   fixed out of scope, or quietly re-pinned. **Both need the failing set reproduced at your BASE sha, not
   argued.** *(U9b carried U6-2's fix; F1-placement's "pre-existing" red turned out to be caused by its own
   fix, disproved only because the brief demanded the base-sha reproduction.)*
6. **`## Bars changed` IS MANDATORY — `file:line — old → new — why`, in the report AND the commit body.**
   Up or down. A bar change with no entry is treated as a hidden regression and REJECTS the unit. A
   *tightened* bar and a *new* bar are both disclosed too, labelled as such. ⚠ **AND SO IS A CHANGE TO THE
   POPULATION OR FIXTURE AN EXISTING ASSERTION MEASURES OVER, even when the number is untouched** — narrowing a
   population hides a defect exactly as a widened tolerance does. *(T2-2 re-scoped O1 from all walked ticks to the
   longest third, keeping `>= 0.10 mm`; the re-scope is sound and was independently ruled so twice — but it was
   disclosed only because the implementer chose to, since the old wording did not require it. Now it does.)*

**And the two process rules that cost the most when skipped:**

- **RED comes from a scratch `git archive` export of your base sha — never `git stash`, never an in-place
  revert in the worktree.** This applies to **CSS and config files by name**, not only source files; ~8
  in-worktree REDs have been tolerated across three rounds and the exemption has quietly become a habit.
- **Reports go to MAIN's `docs/3d-audit/lane-reports/`, evidence to MAIN's `docs/3d-audit/fill-audit/after/<W-id>/`.
  Never into your worktree. A missing file in a worktree is NOT evidence of a missing deliverable** — a
  reviewer once issued a REJECT on that premise.

**Slow files (§0b) — this sentence is binding:**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

### Finish

- **Commit in the lane worktree, explicit paths, never push, no version bump.** Use
  `git -C <worktree> add <each path>`. The message names `T3c-onset` and carries the O17/O18 numbers and a
  `## Bars changed` block. A **new** bar is disclosed as new.
- The report's first line is `STATUS: DONE | DONE/FU | MEASURED | BLOCKED`. The report has sections
  `## Bars changed`, `## Pre-existing red`, and the fixture behind every number (§0 rule 3; ground-plane ink
  included or excluded).
- Kill anything you started on 8471.
- Your final message is **exactly one line**:
  `REPORT docs/3d-audit/lane-reports/T3c-onset-impl.md — <STATUS> — <≤15 words>`

**Follow-on (not briefed here):** a LIGHT VERIFY pass → `T3c-onset-verify.md`. It checks that the base
export is GREEN, M1–M3 are RED, and `## Bars changed` is accurate. If it passes, the unit is marked
**VERIFIED**. No reviewer flags: this is not a `src/` unit.

---

## BRIEF B — T2-4 scout (read-only): is the d=220 mkTick coverage loss still real, and is it a defect?

**Role:** Sonnet, READ-ONLY scout. **Unit id:** `T2-4`. **Report:** `docs/3d-audit/lane-reports/T2-4-scout.md`.
**Source tree:** a scratch export of **`6ebc76e8`**, NOT the lane worktree:
`mkdir -p /private/tmp/claude-501/scratch-T2-4 && git -C /Users/jayphi/Documents/github/vectura-studio archive 6ebc76e8 | tar -x -C /private/tmp/claude-501/scratch-T2-4`,
then symlink `node_modules`. **Scratch port 8473** if you need captures. Kill it before you hand back.
**Lane for any follow-on unit:** `fill-audit-a5` (port 8471). Do not write into it.

Read first: `AGENT-PROTOCOL.md` · LEDGER row **5b** (T2-4) · `T2-2-impl.md` §"The honest finding" (:53–60) ·
`T2-5-plan.md` §5 (:417–441) · `T2-6-impl.md` d=220 table (:109–119) · `tests/helpers/scene3d-mktick-wedge.js`
docstring (:1–30) · STILL-OPEN :553.

### Why a scout and not an implementer — every starting number is suspect

1. **The headline "0.67–0.82 vs pre-fix 0.91–0.99" comes from T2-2, which was REJECTED and REVERTED**
   (`179d9218`). The "recorded in the shipped code comment" diagnosis was reverted with it. `grep T2-4` on
   `surface-fill.js` @ `6ebc76e8` finds nothing.
2. **T2-3's plan proved the per-site coverage metric is BLIND across rows.** It scores a cell as covered
   as soon as any tick lands in it (`scene3d-mktick-wedge.js` :4–11). T2-2's number used that class of
   metric.
3. **mkTick has changed five times since** (T2-3, T2-3b, T2-3c, T2-5, T2-6). T2-6 reports d=220 create
   `siteCoverage` **0.8754** on cone/hatch and `wedge25` **0.1178**, with `tooShort` 713. Those do not match
   T2-2's 0.815–0.823 on the same cell. **The numbers do not agree, and that is the first thing to
   settle.**

### Questions — answer each with its fixture (§0 rule 3)

- **Q1 — which quantity, which tree.** Name the instrument behind "0.91–0.99 pre-fix" and "0.67–0.82"
  (file, function, and the sha it ran on). Re-measure on `6ebc76e8` at d=220, both rigs, with (a) that
  instrument, (b) `siteCoverage`, (c) the rasterised bare-wedge oracle (`wedge25`, `holeMax`). Give one
  table per metric and state the ground-plane inclusion.
- **Q2 — is there a loss at all?** Compare against the true pre-mkTick-work baseline on the same
  instrument. Name the sha you use as "pre-fix" and why. If the loss is gone or within noise, say
  **NO DEFECT** and stop.
- **Q3 — attribution to `MIN_MARK_MM`.** Take the `tooShort` census per cell. Build a scratch-only
  counterfactual with `MIN_MARK_PEN` 2 → 1.5 → 1. Report the coverage recovered and the count of marks
  under 2 × pen that would then plot. That count is the plottability cost.
- **Q4 — is there a mechanism that recovers coverage WITHOUT shipping sub-`MIN_MARK_MM` marks?**
  Examples: fold a short sub-tick into its neighbour, re-seat the site, or lengthen the survivor. Prototype
  at most two in the scratch export. For each one, report coverage, `wedge25`, `over2RP`, `tooShort`, and
  the mkDashRamp d=31/32 onset (A's pins read the same `MIN_MARK_MM`).
- **Sweep coverage:** mkTick × all 8 mappers in `MAPPERS` (`src/core/scene3d/params.js:79`) × {sphere,
  torus, cone} × both rigs at d=220. State the fraction of the roster and justify every exclusion (§0 rule 2).

### Verdict — pick exactly one

- **NO DEFECT** — the loss is not there on the current tree. Close T2-4 MEASURED.
- **MEASURED / PHYSICAL LIMIT** — the loss is real and every recovery ships sub-plottable marks. Recommend
  a tests-only guard unit (pin the d=220 coverage floor + `tooShort` census, mutation-proved).
- **SRC UNIT — mechanism KNOWN** — a Q4 prototype recovers coverage with no sub-`MIN_MARK_MM` mark and no
  guard regression. Give file:line, the ranked prototype, its RED oracle on current numbers, and a list of
  files allowed and forbidden. The secretary writes ≤6 reviewer flags from it.
- **MECHANISM UNKNOWN** — the loss is real, not purely `MIN_MARK_MM`, and neither prototype works. This
  earns an Opus planner under the scale-down regime.

### Acceptance bar — clauses

**S1** Q1 tables on 3 metrics with fixtures · **S2** a named pre-fix sha with a reason · **S3** the Q3
counterfactual with a plottability count · **S4** ≤2 prototypes, or "none attempted" with a reason · **S5**
roster fraction stated · **S6** exactly one verdict. **A scout gates no test. §0 rule 1 applies to any
guard you RECOMMEND:** name the clause it would gate and the mutation that would trip it.

### Evidence cells — VERIFIED to exist in `docs/3d-audit/fill-audit/manifest.B.*.jsonl` (grepped 2026-09-19)

`shots/B/cone__hatch__mkTick__max__a.webp` · `…__max__b` · `shots/B/sphere__hatch__mkTick__max__a.webp` ·
`…__max__b` · `shots/B/torus__hatch__mkTick__max__a.webp` · `…__max__b` ·
`shots/B/torus__contour__mkTick__max__a.webp` · `…__max__b`. ⚠ **The manifest shots are v1.4.1**
(`appVersion` field). **They are NOT the current tree.** Capture fresh from your scratch export into
`docs/3d-audit/fill-audit/after/T2-4/scout/` (`node scripts/audit/scene3d-capture.js --tier B --root <scratch> --port 8473 --only '<regex>' --out docs/3d-audit/fill-audit/after/T2-4/scout`,
run from MAIN). Crop the d=220 bare regions at native resolution and describe them.

### Files

- **ALLOWED (write):** MAIN `docs/3d-audit/lane-reports/T2-4-scout.md` · MAIN
  `docs/3d-audit/fill-audit/after/T2-4/scout/**` · anything under `/private/tmp/claude-501/scratch-T2-4/`.
- **FORBIDDEN:** any write to any worktree (the lane included) · `src/` and `tests/` in MAIN · the
  ledger/summary/STILL-OPEN · `scripts/`.

#### §0 — pasted VERBATIM from `ROUND3-RESUME-BRIEFS.md` (lines 34–99)

## 0. THE BINDING CHECKLIST — paste this whole section into every brief, verbatim

**Six rules, all promoted to STANDING because a unit broke each one at least once. They are here rather
than only in `LEDGER.md` because the single rule that ever reached implementers reliably was the one
printed in their own brief.** ⚠ **Two of these were broken by the very NEXT unit after they were
promoted** — sweep breadth (F1-erode → F1-amp) and rig-naming (GH-2 → F1-amp). Both were caught by
reviewers, so the system worked; it worked at the cost of a review cycle each time.

1. **STATE WHICH HALF OF THE ACCEPTANCE BAR YOUR GUARD GATES — AND MUTATION-TEST THE HALF YOU CLAIM.
   THE MUTATION PROOF IS BLOCKING; a reviewer may REJECT without it.** "It is an integer gate where only
   the fixed value passes" is an argument, not a proof. If the bar you were given has more than one clause,
   name the clause you cover, name the clauses you do not, and show a mutation that trips the one you claim.
   *(T4b gated the ink half of a two-half bar and read as if it gated both; W-36d's sub-bar missed
   interior-only defects; F1-placement's nine reds never measured the quantity that visibly changed.)*
2. **STATE YOUR SWEEP'S COVERAGE AS A FRACTION OF THE ROSTER, AND JUSTIFY EVERY EXCLUSION.** "The other
   mappers are unrelated" is a claim to be measured, not assumed. The roster is
   `MAPPERS = ['none','hatch','wireframe','crosshatch','contour','spiral','stipple','contourSlice']`
   (`src/core/scene3d/params.js:79`) × `SCENE3D_TONE_LAWS.PRODUCTION` (37 laws).
   *(F1-erode's planner swept `hatch`×4 primitives + `contour`×torus and missed a SECOND live instance of
   its own defect, found only when the sweep was widened to all 8 mappers. F1-amp then reported on `hatch`
   alone — 12.5 % of the roster — and its reviewer had to sweep 8×6 itself.)*
3. **EVERY REPORTED NUMBER STATES THE FIXTURE IT WAS MEASURED ON — RIG, CAMERA, DENSITY, AND EVERY NON-DEFAULT PARAM — in the report
   AND in `report.json`.** ⚠ **A number without its fixture is not reproducible, and "md5-identical source" is NOT a fixture.**
   *(Three script-methodology discrepancies in one round, all in otherwise-rigorous reports, none detectable from the report alone:
   `trochoidLoop` ink −0.98 % vs −1.10 %; `onePenDown` width 0.9860 vs 1.0089 mm, blamed on an intervening fix but actually pre-dating
   it; and a ~35–40 % `inkMm` divergence between one report's pictures and its own table. Naming the rig alone caught none of them.)*
   ⚠ **AND STATE WHETHER GROUND-PLANE INK IS INCLUDED IN ANY INK TOTAL.** *(That third divergence was first blamed on a `fillAngle`
   mismatch; a re-shoot proved `fillAngle` absent ≡ 45 and found the real cause was ground-plane ink counted in one measurement and not
   the other. **Two ink numbers for "the same cell" can differ by a third with both correct and neither wrong — the object's ink and
   the scene's ink are different quantities, and nothing in a bare `inkMm` says which one you have.**)*
   **NAME THE RIG BEHIND EVERY NUMBER.** Since GH-2 (`6ffaf9c6`) there are TWO:
   **`create`** (the default — `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS`, the denser rig
   **the gallery and Jay's own screenshots use**) and **`--rig addLayer`** (plain `engine.addLayer('scene3d')`
   deserialization defaults, **what every RGR test in these lanes constructs**). **A stop-condition measured
   on one rig is a claim about one rig**, and a bound that matters to the user must be measured on the rig
   the user sees. **An unexplained byte-identical before/after pair can mean the RIG CANNOT SEE YOUR FIX** —
   a third legitimate cause GH-1 now recognises as "rig mismatch". *(F1-erode's fix was invisible on
   `create`; F1-amp's ±8 % ink claim came only from `addLayer` and `onePenDown` is −7.99 % on `create`.)*
4. **WHEN A SWEEP REPORTS A CHANGED LAW, GREP FOR PINS ON THAT LAW AND CHECK THE FIXTURE EACH PIN USES —
   NOT JUST THE LAW NAME.** A law-name match is a hit list, not a verdict: the pin and the changed cell must
   agree on primitive, mapper AND density before the pin is at risk, and before you may call it safe.
   **Re-pinning a guard that was never threatened is the same class of damage as missing one that was.**
   *(F1-erode's one candidate pin on `taperedEnds` survived only because its fixture was the sphere while the
   cone moved.)*
5. **A UNIT THAT TURNS ANOTHER UNIT'S TEST GREEN MUST SAY SO — and one that inherits another unit's RED must
   name it, test by test, under `## Pre-existing red`.** A red→green transition inside an innocent unit reads
   as "all tests pass" at merge and hides which unit owns the fix; an inherited red gets misattributed,
   fixed out of scope, or quietly re-pinned. **Both need the failing set reproduced at your BASE sha, not
   argued.** *(U9b carried U6-2's fix; F1-placement's "pre-existing" red turned out to be caused by its own
   fix, disproved only because the brief demanded the base-sha reproduction.)*
6. **`## Bars changed` IS MANDATORY — `file:line — old → new — why`, in the report AND the commit body.**
   Up or down. A bar change with no entry is treated as a hidden regression and REJECTS the unit. A
   *tightened* bar and a *new* bar are both disclosed too, labelled as such. ⚠ **AND SO IS A CHANGE TO THE
   POPULATION OR FIXTURE AN EXISTING ASSERTION MEASURES OVER, even when the number is untouched** — narrowing a
   population hides a defect exactly as a widened tolerance does. *(T2-2 re-scoped O1 from all walked ticks to the
   longest third, keeping `>= 0.10 mm`; the re-scope is sound and was independently ruled so twice — but it was
   disclosed only because the implementer chose to, since the old wording did not require it. Now it does.)*

**And the two process rules that cost the most when skipped:**

- **RED comes from a scratch `git archive` export of your base sha — never `git stash`, never an in-place
  revert in the worktree.** This applies to **CSS and config files by name**, not only source files; ~8
  in-worktree REDs have been tolerated across three rounds and the exemption has quietly become a habit.
- **Reports go to MAIN's `docs/3d-audit/lane-reports/`, evidence to MAIN's `docs/3d-audit/fill-audit/after/<W-id>/`.
  Never into your worktree. A missing file in a worktree is NOT evidence of a missing deliverable** — a
  reviewer once issued a REJECT on that premise.

**Slow files (§0b) — this sentence is binding:**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

(`scene3d-tone-law-collapse.test.js` is the one Tier-1 file. It exceeds the tool's 600 s ceiling, so let
the tool background it and read the completion notification. You should not need it.)

### Finish

- **You commit nothing — a scout is read-only.** The rule is stated anyway: *commit in the lane worktree,
  explicit paths, never push, no version bump* applies to whoever builds a follow-on unit.
- Delete your scratch probes, and kill anything on 8473.
- The report's first line is `STATUS: MEASURED | NO DEFECT | SRC-UNIT | MECHANISM-UNKNOWN`.
- Your final message is **exactly one line**:
  `REPORT docs/3d-audit/lane-reports/T2-4-scout.md — <STATUS> — <≤15 words>`

---

## BRIEF C — W-07b scout (read-only): is `deepFillTSP`'s round-1 finding still true, and is it a unit?

**Role:** Sonnet, READ-ONLY scout. **Unit id:** `W-07b`. **Report:** `docs/3d-audit/lane-reports/W-07b-scout.md`.
**Source tree:** a scratch export of **`6ebc76e8`**:
`mkdir -p /private/tmp/claude-501/scratch-W-07b && git -C /Users/jayphi/Documents/github/vectura-studio archive 6ebc76e8 | tar -x -C /private/tmp/claude-501/scratch-W-07b`,
then symlink `node_modules`. **Scratch port 8474.** Kill it before you hand back. **Lane for any follow-on
unit:** `fill-audit-a5`. Do not write into it.

Read first: `AGENT-PROTOCOL.md` · STILL-OPEN :23 (the W-07 finding) · LEDGER :36 (the W-07b row and its
oracle) · `W-22-24-W-18-plan.md` :698 · `tests/unit/scene3d-mark-laws-draw.test.js` :622–660 (the W-07
test) · `src/config/scene3d-tone-laws.js` :274–285 (the `deepFillTSP` entry: tier `library`, and a
caveat that already says it barely engages).

### The row, as filed in round 1

*"W-07 deepFillTSP (912f8471): low≠med now, but the visual effect at med is ~2 % ink change. The promised
half-pitch zig-zag traverse is not delivered. The test does not implement the worklist oracle
(shadow-third coverage ≥ Ladder; no segment > 3×masterPitch). REOPEN as W-07b with that oracle."*
**Since then `deepFillTSP` was rewritten** (`surface-fill.js` :4082, :8814 — "the previous round's
deepFillTSP displaced points ON SCREEN…"; `scene3d-tone-law-collapse.test.js` :1923 lists it among the 17
rewritten laws). **It is also in `CURVED_SPIRAL_STIPPLE_INERT`** (`src/config/context-bar.js:561`, C-13
"rung-skipping, indistinguishable from Ladder"). **The round-1 premise may be stale in either direction.**

### Questions — answer each with its fixture (§0 rule 3)

- **Q1 — the oracle, on the current tree.** At d=50 and d=220, both rigs, on {sphere, torus, cone}: (a)
  shadow-third coverage for `deepFillTSP` vs `ladder` on the same fixture, with "shadow third" defined
  exactly, and (b) the longest segment ÷ `masterPitch`. Report pass or fail per cell against "coverage ≥
  Ladder" and "no segment > 3×masterPitch".
- **Q2 — is the traverse delivered?** Is there a boustrophedon / half-pitch zig-zag in the darkest ~15 %?
  Measure it (path count and effective pitch in the deep zone vs Ladder) AND look: crop the deep-shadow
  region at native resolution on the current shots.
- **Q3 — reachability.** Is `deepFillTSP` (tier `library`) selectable in the picker today, and on which
  mappers? It is hidden on curved spiral/stipple. A law no user can reach is a different priority.
- **Q4 — guards.** Does any existing test gate the oracle? The W-07 test at `mark-laws-draw.test.js:622`
  gates `low ≠ med`, which is a weaker claim. Name the gap.
- **Sweep coverage:** `deepFillTSP` × all 8 mappers in `MAPPERS` × the primitives above × both rigs. State
  the fraction and justify every exclusion (§0 rule 2).

### Verdict — pick exactly one

- **CLOSED — ORACLE MET** — the rewrite delivered it. Recommend a tests-only guard only if Q4 finds it
  ungated.
- **TESTS-ONLY GUARD UNIT** — met but ungated. Name the clauses and the mutation that trips each.
- **SRC UNIT — mechanism KNOWN** — not met, and you can point at file:line and the fix. Give a RED on current
  numbers and a list of files allowed and forbidden.
- **MECHANISM UNKNOWN** — not met, and the cause is not located. This earns an Opus planner.
- **DEPRIORITISE** — unreachable or superseded (Q3). Say what would reopen it.

### Acceptance bar — clauses

**S1** Q1 table with fixtures and ground-plane inclusion · **S2** the Q2 measurement AND a native-res
crop described · **S3** a Q3 reachability answer with file:line · **S4** the Q4 guard gap named · **S5**
roster fraction stated · **S6** exactly one verdict. **A scout gates no test. §0 rule 1 applies to any
guard you RECOMMEND.**

### Evidence cells — VERIFIED to exist in `docs/3d-audit/fill-audit/manifest.B.*.jsonl` (grepped 2026-09-19)

`deepFillTSP`: `shots/B/sphere__hatch__deepFillTSP__med__a.webp` · `…__max__a` ·
`shots/B/cone__hatch__deepFillTSP__med__a.webp` · `…__max__a` · `shots/B/torus__hatch__deepFillTSP__med__a.webp`
· `…__max__a` · `shots/B/sphere__contour__deepFillTSP__max__a.webp`. Ladder controls:
`shots/B/sphere__hatch__ladder__med__a.webp` · `shots/B/cone__hatch__ladder__med__a.webp` ·
`shots/B/torus__hatch__ladder__med__a.webp`. ⚠ **These manifest shots are v1.4.1.** Capture fresh into
`docs/3d-audit/fill-audit/after/W-07b/scout/` from your scratch export on port 8474 (run the capture from
MAIN), and say which rig.

### Files

- **ALLOWED (write):** MAIN `docs/3d-audit/lane-reports/W-07b-scout.md` · MAIN
  `docs/3d-audit/fill-audit/after/W-07b/scout/**` · `/private/tmp/claude-501/scratch-W-07b/**`.
- **FORBIDDEN:** any write to any worktree · `src/` and `tests/` in MAIN · the ledger/summary/STILL-OPEN ·
  `scripts/`.

#### §0 — pasted VERBATIM from `ROUND3-RESUME-BRIEFS.md` (lines 34–99)

## 0. THE BINDING CHECKLIST — paste this whole section into every brief, verbatim

**Six rules, all promoted to STANDING because a unit broke each one at least once. They are here rather
than only in `LEDGER.md` because the single rule that ever reached implementers reliably was the one
printed in their own brief.** ⚠ **Two of these were broken by the very NEXT unit after they were
promoted** — sweep breadth (F1-erode → F1-amp) and rig-naming (GH-2 → F1-amp). Both were caught by
reviewers, so the system worked; it worked at the cost of a review cycle each time.

1. **STATE WHICH HALF OF THE ACCEPTANCE BAR YOUR GUARD GATES — AND MUTATION-TEST THE HALF YOU CLAIM.
   THE MUTATION PROOF IS BLOCKING; a reviewer may REJECT without it.** "It is an integer gate where only
   the fixed value passes" is an argument, not a proof. If the bar you were given has more than one clause,
   name the clause you cover, name the clauses you do not, and show a mutation that trips the one you claim.
   *(T4b gated the ink half of a two-half bar and read as if it gated both; W-36d's sub-bar missed
   interior-only defects; F1-placement's nine reds never measured the quantity that visibly changed.)*
2. **STATE YOUR SWEEP'S COVERAGE AS A FRACTION OF THE ROSTER, AND JUSTIFY EVERY EXCLUSION.** "The other
   mappers are unrelated" is a claim to be measured, not assumed. The roster is
   `MAPPERS = ['none','hatch','wireframe','crosshatch','contour','spiral','stipple','contourSlice']`
   (`src/core/scene3d/params.js:79`) × `SCENE3D_TONE_LAWS.PRODUCTION` (37 laws).
   *(F1-erode's planner swept `hatch`×4 primitives + `contour`×torus and missed a SECOND live instance of
   its own defect, found only when the sweep was widened to all 8 mappers. F1-amp then reported on `hatch`
   alone — 12.5 % of the roster — and its reviewer had to sweep 8×6 itself.)*
3. **EVERY REPORTED NUMBER STATES THE FIXTURE IT WAS MEASURED ON — RIG, CAMERA, DENSITY, AND EVERY NON-DEFAULT PARAM — in the report
   AND in `report.json`.** ⚠ **A number without its fixture is not reproducible, and "md5-identical source" is NOT a fixture.**
   *(Three script-methodology discrepancies in one round, all in otherwise-rigorous reports, none detectable from the report alone:
   `trochoidLoop` ink −0.98 % vs −1.10 %; `onePenDown` width 0.9860 vs 1.0089 mm, blamed on an intervening fix but actually pre-dating
   it; and a ~35–40 % `inkMm` divergence between one report's pictures and its own table. Naming the rig alone caught none of them.)*
   ⚠ **AND STATE WHETHER GROUND-PLANE INK IS INCLUDED IN ANY INK TOTAL.** *(That third divergence was first blamed on a `fillAngle`
   mismatch; a re-shoot proved `fillAngle` absent ≡ 45 and found the real cause was ground-plane ink counted in one measurement and not
   the other. **Two ink numbers for "the same cell" can differ by a third with both correct and neither wrong — the object's ink and
   the scene's ink are different quantities, and nothing in a bare `inkMm` says which one you have.**)*
   **NAME THE RIG BEHIND EVERY NUMBER.** Since GH-2 (`6ffaf9c6`) there are TWO:
   **`create`** (the default — `PRIMITIVE_CREATE_DEFAULTS` over `PRIMITIVE_PARAM_DEFAULTS`, the denser rig
   **the gallery and Jay's own screenshots use**) and **`--rig addLayer`** (plain `engine.addLayer('scene3d')`
   deserialization defaults, **what every RGR test in these lanes constructs**). **A stop-condition measured
   on one rig is a claim about one rig**, and a bound that matters to the user must be measured on the rig
   the user sees. **An unexplained byte-identical before/after pair can mean the RIG CANNOT SEE YOUR FIX** —
   a third legitimate cause GH-1 now recognises as "rig mismatch". *(F1-erode's fix was invisible on
   `create`; F1-amp's ±8 % ink claim came only from `addLayer` and `onePenDown` is −7.99 % on `create`.)*
4. **WHEN A SWEEP REPORTS A CHANGED LAW, GREP FOR PINS ON THAT LAW AND CHECK THE FIXTURE EACH PIN USES —
   NOT JUST THE LAW NAME.** A law-name match is a hit list, not a verdict: the pin and the changed cell must
   agree on primitive, mapper AND density before the pin is at risk, and before you may call it safe.
   **Re-pinning a guard that was never threatened is the same class of damage as missing one that was.**
   *(F1-erode's one candidate pin on `taperedEnds` survived only because its fixture was the sphere while the
   cone moved.)*
5. **A UNIT THAT TURNS ANOTHER UNIT'S TEST GREEN MUST SAY SO — and one that inherits another unit's RED must
   name it, test by test, under `## Pre-existing red`.** A red→green transition inside an innocent unit reads
   as "all tests pass" at merge and hides which unit owns the fix; an inherited red gets misattributed,
   fixed out of scope, or quietly re-pinned. **Both need the failing set reproduced at your BASE sha, not
   argued.** *(U9b carried U6-2's fix; F1-placement's "pre-existing" red turned out to be caused by its own
   fix, disproved only because the brief demanded the base-sha reproduction.)*
6. **`## Bars changed` IS MANDATORY — `file:line — old → new — why`, in the report AND the commit body.**
   Up or down. A bar change with no entry is treated as a hidden regression and REJECTS the unit. A
   *tightened* bar and a *new* bar are both disclosed too, labelled as such. ⚠ **AND SO IS A CHANGE TO THE
   POPULATION OR FIXTURE AN EXISTING ASSERTION MEASURES OVER, even when the number is untouched** — narrowing a
   population hides a defect exactly as a widened tolerance does. *(T2-2 re-scoped O1 from all walked ticks to the
   longest third, keeping `>= 0.10 mm`; the re-scope is sound and was independently ruled so twice — but it was
   disclosed only because the implementer chose to, since the old wording did not require it. Now it does.)*

**And the two process rules that cost the most when skipped:**

- **RED comes from a scratch `git archive` export of your base sha — never `git stash`, never an in-place
  revert in the worktree.** This applies to **CSS and config files by name**, not only source files; ~8
  in-worktree REDs have been tolerated across three rounds and the exemption has quietly become a habit.
- **Reports go to MAIN's `docs/3d-audit/lane-reports/`, evidence to MAIN's `docs/3d-audit/fill-audit/after/<W-id>/`.
  Never into your worktree. A missing file in a worktree is NOT evidence of a missing deliverable** — a
  reviewer once issued a REJECT on that premise.

**Slow files (§0b) — this sentence is binding:**

> Run every vitest file in the FOREGROUND with the Bash tool parameter `timeout: 600000` (ten minutes).
> Never use run_in_background, never arm a Monitor and end your turn. If a file still exceeds ten minutes,
> kill it and rerun alone with `--pool=forks --poolOptions.forks.singleFork=true`, again with
> `timeout: 600000`.

(If you run `scene3d-tone-law-collapse.test.js` — the one Tier-1 file — start it with singleFork and
`timeout: 600000`. Let the tool background it at the ceiling and read the completion notification. Do not
poll, and do not arm a Monitor.)

### Finish

- **You commit nothing — a scout is read-only.** The rule is stated anyway: *commit in the lane worktree,
  explicit paths, never push, no version bump* applies to whoever builds a follow-on unit.
- Delete your scratch probes, and kill anything on 8474.
- The report's first line is `STATUS: MEASURED | CLOSED | GUARD-UNIT | SRC-UNIT | MECHANISM-UNKNOWN | DEPRIORITISE`.
- Your final message is **exactly one line**:
  `REPORT docs/3d-audit/lane-reports/W-07b-scout.md — <STATUS> — <≤15 words>`

---

## Reviewer flags

**None in the first wave: no first-wave unit changes `src/`.** When B or C returns a `SRC-UNIT` verdict, the
secretary writes at most **six** flags for that unit here, before its implementer starts. The standing
rulings apply regardless:
- An edge-geometry change runs every pinned-golden file over curved primitives. Grep; don't recall.
- A present report is not evidence of a landed unit. Check the sha.
- A fix whose defect no bar measures ships its instrument in the same unit.
